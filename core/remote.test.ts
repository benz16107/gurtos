import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_APP, NO_RELAY, NO_RELAY_PUSH, RELAY, Remote, checkRelay, relayProblem, remotePairUrl } from './remote.ts';

test("an owner's own relay must be a public https host name", async () => {
  assert.equal(relayProblem('https://relay.example.com'), undefined);
  assert.equal(relayProblem('https://relay.example.com/'), undefined);
  for (const bad of ['http://relay.example.com', 'https://203.0.113.5', 'https://[2001:db8::1]', 'https://relay.example.com/v1', 'https://u:p@relay.example.com', 'https://relay.example.com?x=1', 'https://relay.local', 'https://box.internal', 'https://localhost', 'not a url', 42])
    assert.ok(relayProblem(bad), String(bad));
  const at = (address: string) => async () => [{ address, family: 4 }];
  assert.equal(await checkRelay('https://relay.example.com/', at('203.0.113.5')), 'https://relay.example.com');
  for (const inside of ['127.0.0.1', '10.0.0.8', '192.168.1.2', '169.254.169.254', '::1', 'fd00::2'])
    await assert.rejects(checkRelay('https://relay.example.com', at(inside)), /private or local/, inside);
  await assert.rejects(checkRelay('https://relay.example.com', async () => []), /does not resolve/);
});

test('the relay choice is saved, waits until remote access is off, and null goes back to the default', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  const notes: unknown[] = [];
  const deps = { secret: () => undefined, setSecret: () => {}, dropSecret: () => {}, apiPort: () => 0, startedAt: () => '', note: (d: unknown) => notes.push(d) };
  fs.writeFileSync(path.join(home, 'relay.json'), JSON.stringify({ url: 'https://relay.example.com' }));
  const r = new Remote(home, deps);
  assert.deepEqual(r.relayView(), { url: 'https://relay.example.com', default: RELAY ?? null, custom: true });
  assert.equal(r.view().relay, 'relay.example.com');
  r.saved = { host: 'rosa.relay.example.com' } as never;
  await assert.rejects(r.setRelay(null), /turn remote access off first/);
  r.saved = undefined;
  assert.deepEqual(await r.setRelay(null), { url: RELAY ?? null, default: RELAY ?? null, custom: false });
  assert.ok(!fs.existsSync(path.join(home, 'relay.json')));
  await assert.rejects(r.setRelay('http://relay.example.com'), /must be https/);
  assert.equal(notes.length, 1);
});

test("with the hosted app, a phone pairs on the computer's own address on the relay, since the hosted app has no relay of its own", () => {
  const saved = { host: 'den.relay.example.com', url: 'https://den.relay.example.com' };
  assert.equal(remotePairUrl('c0de', saved, DEFAULT_APP), 'https://den.relay.example.com/pair#c0de');
  assert.equal(remotePairUrl('c0de', saved, 'https://app.example.com'), 'https://app.example.com/pair?box=den.relay.example.com#c0de', 'their own app too: it accepts their relay');
});

test('with no relay, remote access and push refuse at once with a sentence and make no network call', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  const deps = { secret: () => 's', setSecret: () => {}, dropSecret: () => {}, apiPort: () => 0, startedAt: () => '', note: () => {} };
  const r = new Remote(home, deps);
  if (r.relay) return; // BOX_RELAY is set in this environment: nothing to test
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('fetch must not be called without a relay'); }) as never;
  try {
    assert.deepEqual(r.relayView(), { url: null, default: null, custom: false });
    assert.equal(r.view().relay, null);
    const refused = (e: Error & { status?: number }) => e.status === 409 && e.message === NO_RELAY;
    await assert.rejects(r.enable('rosa'), refused);
    await assert.rejects(r.enableAuto('gurt-2a48f6'), refused);
    await assert.rejects(r.available('rosa'), refused);
    await r.watchPairing('rv', () => true, () => true, 'gurt-2a48f6'); // returns, never waits
    // pushTo (core/box.ts, which cannot be imported here: it boots a box) calls this first.
    assert.throws(() => r.needRelay(NO_RELAY_PUSH), (e: Error & { status?: number }) => e.status === 409 && e.message === NO_RELAY_PUSH);
    // Quick Start reads the relay through the box's getter, which throws the same sentence.
    const { Target } = await import('./quickstart.ts');
    const t = new Target({ get relay() { return r.needRelay(); }, app: 'https://app.example', apply: {} as never, apps: () => [], remoteOn: async () => '', ownerCode: () => '', note: () => {} });
    assert.throws(() => t.start('x'), refused);
    assert.equal(t.view().state, 'off');
  } finally {
    globalThis.fetch = realFetch;
  }
  // A relay the owner configured still works as before.
  fs.writeFileSync(path.join(home, 'relay.json'), JSON.stringify({ url: 'https://relay.example.com' }));
  assert.equal(new Remote(home, deps).needRelay(), 'https://relay.example.com');
});

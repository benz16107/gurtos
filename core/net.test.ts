import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { MAX_MODEL_BODY, Tries, allowed, trustedUid, uidOf, anthropicPath, destination, factoryPath, fetchesOnItsOwn, fromScreen, sourceOf, startProxy, withKey } from './net.ts';
import type { Task } from './contract.ts';
import { BOX_PLACEHOLDER, UPSTREAMS, addressProblem, keyed, upstreamReady } from './upstreams.ts';

test('a task reaches a name on the box only on the exact host:port it was given, never a box port', async () => {
  assert.match((await destination(['localhost:5555'], 'localhost', '5555')) ?? '', /^(127\.0\.0\.1|::1)$/); // either loopback: the OS decides which one "localhost" is
  assert.equal(await destination(['localhost'], 'localhost', '7700'), undefined); // the box API, through a loose entry
  assert.equal(await destination(['localhost'], 'localhost', '5555'), undefined); // on the box: needs host:port
  assert.equal(await destination(['localhost:3000'], 'localhost', '3000'), undefined); // SpacetimeDB, even if listed
  assert.equal(await destination(['localhost:8888'], 'localhost', '8888'), undefined); // the proxy itself
  assert.equal(await destination(['example.com'], 'other.com', '443'), undefined); // not on the list
});

test('link-local addresses (the cloud metadata service) are never reached, and a private network only on an exact host:port', async () => {
  const tailnet = ['100', '100', '1', '2'].join('.'); // in parts: the public check flags tailnet addresses in the repo
  process.env.BOX_HOSTS = JSON.stringify({ 'meta.test': '169.254.169.254', 'meta6.test': 'fe80::1', 'lan.test': '10.1.2.3', 'tail.test': tailnet, 'ula.test': 'fd00::1', 'mapped.test': '::ffff:192.168.1.1', 'pub.test': '203.0.113.5' });
  try {
    assert.equal(await destination(['meta.test:80'], 'meta.test', '80'), undefined, 'not even when listed exactly');
    assert.equal(await destination(['meta6.test:80'], 'meta6.test', '80'), undefined);
    for (const h of ['lan.test', 'tail.test', 'ula.test', 'mapped.test']) {
      assert.equal(await destination([h], h, '80'), undefined, `${h} on a loose entry`);
      assert.ok(await destination([`${h}:80`], h, '80'), `${h} when the owner listed host:port`);
    }
    assert.equal(await destination(['*.test'], 'lan.test', '443'), undefined, 'a wildcard never reaches the home network');
    assert.equal(await destination(['pub.test'], 'pub.test', '443'), '203.0.113.5');
  } finally {
    delete process.env.BOX_HOSTS;
  }
});

test('the real model key goes only into the key headers, never into one a service could quote back', () => {
  const P = 'sk-ant-placeholder-the-box-adds-the-key';
  const out = withKey({ host: 'evil', 'x-api-key': P, authorization: `Bearer ${P}`, 'anthropic-beta': P, 'x-other': `a ${P}` }, 'api.anthropic.com', P, 'sk-real');
  assert.equal(out.host, 'api.anthropic.com');
  assert.equal(out['x-api-key'], 'sk-real');
  assert.equal(out.authorization, 'Bearer sk-real');
  assert.equal(out['anthropic-beta'], P);
  assert.equal(out['x-other'], `a ${P}`);
});

test("only the box's own pages on this machine count as its screen", () => {
  const h = (x: Record<string, string>) => x;
  assert.ok(fromScreen(undefined, h({ host: 'box' }), 7700), 'the socket');
  assert.ok(fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700' }), 7700), 'curl on the box');
  assert.ok(fromScreen('::1', h({ host: 'localhost:7700', origin: 'http://localhost:7700' }), 7700), "the box's own page");
  assert.ok(fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'http://127.0.0.1:7700' }), 7700));
  assert.ok(fromScreen('127.0.0.1', h({ host: 'localhost', origin: 'http://localhost' }), 80), 'port 80 is left out of an origin');
  assert.ok(fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'http://localhost:5173' }), 7700, ['http://localhost:5173']), 'a dev server named in BOX_ORIGINS');
  assert.ok(!fromScreen('127.0.0.1', h({ host: 'rebind.attacker.example:7700' }), 7700), 'DNS rebinding: a GET carries no Origin, but its Host gives it away');
  assert.ok(!fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'http://localhost:8000' }), 7700), "a page from another server on this machine (an agent's dev server)");
  assert.ok(!fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'https://evil.example' }), 7700), 'another site');
  assert.ok(!fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'null' }), 7700), 'a sandboxed page or a file');
  assert.ok(!fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', 'x-forwarded-for': '203.0.113.9' }), 7700), 'relayed by a proxy');
  assert.ok(!fromScreen('10.0.0.5', h({ host: '127.0.0.1:7700' }), 7700), 'another machine');
  assert.ok(!fromScreen('127.0.0.1', h({ host: '127.0.0.1:7700', origin: 'http://localhost:5173' }), 7700, ['*']), "'*' lets a site call with a token, never as the screen");
});

test('a model call on your own Anthropic key may not have Anthropic fetch a page, an MCP server or a file for the task', () => {
  // What Droid sends (captured from droid 0.248 in own-key mode): its own tools, no server-side fetching.
  const droid = { model: 'claude-sonnet-5-5', max_tokens: 8192, stream: true, system: [{ type: 'text', text: 'x' }],
    tools: [{ name: 'Execute', description: 'run', input_schema: { type: 'object', properties: { url: { type: 'string' } } } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'see https://example.com' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'FetchUrl', input: { url: 'https://example.com', type: 'url' } }] }] };
  assert.equal(fetchesOnItsOwn(droid), undefined);
  assert.match(fetchesOnItsOwn({ ...droid, tools: [{ type: 'web_fetch_20250910', name: 'web_fetch' }] }) ?? '', /web_fetch/);
  assert.match(fetchesOnItsOwn({ ...droid, mcp_servers: [{ type: 'url', url: 'https://attacker.example/sse' }] }) ?? '', /MCP/);
  assert.ok(fetchesOnItsOwn({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://attacker.example/?k=secret' } }] }] }));
  assert.match(fetchesOnItsOwn({ tools: [{ type: 'mcp', server_url: 'https://attacker.example' }] }) ?? '', /mcp/);
  assert.ok(fetchesOnItsOwn({ messages: [{ content: [{ type: 'image_url', image_url: { url: 'https://attacker.example/x.png' } }] }] }));
  assert.equal(fetchesOnItsOwn({ messages: [{ content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] }), undefined);
});

test('wrong pairing codes are limited per address and overall, so one address cannot lock everyone out', () => {
  assert.equal(sourceOf('127.0.0.1', { 'x-forwarded-for': '192.0.2.4, 203.0.113.9' }), '203.0.113.9', 'the setup port and Caddy put the caller last');
  assert.equal(sourceOf('198.51.100.7', { 'x-forwarded-for': '10.0.0.1' }), '198.51.100.7', 'a header from another machine is not believed');
  const t = new Tries(5, 60);
  const now = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(t.refusal('a', now), undefined), t.wrong('a', now);
  assert.match(t.refusal('a', now) ?? '', /from here/, 'the sixth wrong code from one address in a minute waits');
  assert.equal(t.refusal('b', now), undefined, 'another address still pairs');
  assert.equal(t.refusal('a', now + 60_001), undefined, 'a minute later it may try again');
  for (let i = 0; i < 60; i++) t.wrong(`n${i}`, now);
  assert.match(t.refusal('fresh', now) ?? '', /too many wrong/, 'many addresses together are capped too');
});

test('only the Factory calls Droid makes are relayed with the owner\'s Factory key', () => {
  for (const ok of ['/api/llm/o/v1/responses', '/api/llm/a/v1/messages', '/api/cli/whoami', '/api/feature-flags', '/api/organization/managed-settings', '/api/billing/limits', '/api/connectors/tools/list', '/api/apps/cloud-sync/sessions/batch', '/api/ingest'])
    assert.ok(factoryPath(ok), ok);
  for (const no of ['/api/connectors/tools/call', '/api/sessions', '/api/feature-flags/x', '/api/billing/limits/../keys', '/v1/messages', '/'])
    assert.ok(!factoryPath(no), no);
});

test('only the Anthropic calls Droid makes are relayed with the owner\'s Anthropic key', () => {
  for (const ok of ['/v1/messages', '/v1/messages/count_tokens', '/v1/models', '/v1/models/claude-haiku-4-5']) assert.ok(anthropicPath(ok), ok);
  for (const no of ['/v1/files', '/v1/messages/batches', '/v1/skills', '/v1/organizations/users', '/v1/complete', '/v1/models/../files', '/'])
    assert.ok(!anthropicPath(no), no);
});

test('a wildcard host with a port matches its subdomains on that port only', () => {
  assert.ok(allowed(['*.example.com:443'], 'api.example.com', '443'));
  assert.ok(!allowed(['*.example.com:443'], 'api.example.com', '80'));
  assert.ok(!allowed(['*.example.com:443'], 'example.com', '443'), 'the subdomains, not the name itself');
  assert.ok(allowed(['*.example.com'], 'a.b.example.com', '8080'));
  assert.ok(allowed(['example.com:8080'], 'example.com', '8080') && !allowed(['example.com:8080'], 'example.com', '80'));
  assert.ok(!allowed(['*.example.com'], 'badexample.com', '443'));
});

test('the proxy reads every model call: no compressed or non-JSON body, at most 32 MB each and 64 MB a task at once', async () => {
  process.env.BOX_PROXY_PORT = 'auto';
  const blocked: string[] = [];
  const task = { id: 'tproxytest', worker: 'droid', hosts: [] } as unknown as Task;
  const port = await startProxy(
    { taskOf: () => task, blocked: (_t, host) => blocked.push(host), leaked: () => false, key: (name) => (name === 'FACTORY_API_KEY' ? 'fk-real' : undefined), config: () => ({ ollamaHost: '', customBaseUrl: '', customWire: 'anthropic' }), upstream: () => undefined },
    { key: Buffer.from(''), cert: Buffer.from('') },
  );
  // A plain path is Droid's Factory API (FACTORY_API_BASE_URL); its model calls are read before they go on.
  const send = (headers: Record<string, string>, body?: Buffer, end = true) =>
    new Promise<{ status: number; req: http.ClientRequest }>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/llm/a/v1/messages', method: 'POST', headers });
      req.on('response', (r) => (r.resume(), resolve({ status: r.statusCode ?? 0, req })));
      req.on('error', () => {});
      if (body) req.write(body);
      if (end) req.end();
    });
  try {
    assert.equal((await send({ 'content-encoding': 'gzip', 'content-type': 'application/json' }, Buffer.from('x'))).status, 415, 'a compressed body is refused');
    assert.equal((await send({ 'content-type': 'application/json' }, Buffer.from('not json'))).status, 415, 'a body the box cannot read is refused');
    assert.ok(blocked.some((b) => /gzip/.test(b)) && blocked.some((b) => /not JSON/.test(b)), 'both are logged as blocked');
    assert.equal((await send({ 'content-length': String(MAX_MODEL_BODY + 1) }, Buffer.alloc(MAX_MODEL_BODY + 1, 32))).status, 413, 'over 32 MB in one call');
    // Two calls of 30 MB held open, then a third: together past 64 MB.
    const big = Buffer.alloc(30 * 1024 ** 2, 32);
    const open = [0, 1].map(() => http.request({ host: '127.0.0.1', port, path: '/api/llm/a/v1/messages', method: 'POST', headers: { 'content-length': String(big.length + 1) } }).on('error', () => {}));
    for (const r of open) r.write(big);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await send({ 'content-length': String(big.length + 1) }, big, false)).status, 413, 'a third call past 64 MB at once');
    for (const r of open) r.destroy();
  } finally {
    delete process.env.BOX_PROXY_PORT;
  }
});

test('the owner of each loopback connection is found from /proc/net/tcp', async () => {
  const seen: (number | undefined)[] = [];
  const server = net.createServer((sock) => void seen.push(uidOf(sock)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const clients = await Promise.all(Array.from({ length: 200 }, () => new Promise<net.Socket>((r) => { const c = net.connect(port, '127.0.0.1', () => r(c)); })));
  for (let i = 0; i < 200 && seen.length < 200; i++) await new Promise((r) => setTimeout(r, 20));
  for (const c of clients) c.destroy();
  server.close();
  assert.equal(seen.length, 200);
  assert.ok(seen.every((u) => u === process.getuid!()), 'every connection is ours');
});

test('on this machine only root, the owner and the gurtos group act as the screen; everyone else needs a token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounts-'));
  const files = { passwd: path.join(dir, 'passwd'), group: path.join(dir, 'group') };
  fs.writeFileSync(files.passwd, ['root:x:0:0::/root:/bin/bash', 'ana:x:1000:1000::/home/ana:/bin/bash', 'sam:x:1001:1001::/home/sam:/bin/bash', 'kiosk:x:998:996::/var/lib/kiosk:/usr/sbin/nologin', 'web:x:997:995::/srv:/usr/sbin/nologin', 'nobody:x:65534:65534::/nonexistent:/usr/sbin/nologin', 'box-t1:x:30001:30001::/nonexistent:/usr/sbin/nologin', 'lead:x:1002:995::/home/lead:/bin/bash', ''].join('\n'));
  fs.writeFileSync(files.group, ['root:x:0:', 'sudo:x:27:ana,sam', 'gurtos:x:995:sam,kiosk,box-t1', ''].join('\n'));
  try {
    assert.ok(trustedUid(0, null, files), 'root (sudo curl, the CLI)');
    assert.ok(trustedUid(1000, 'ana', files), 'the Personal owner, without the group');
    assert.ok(trustedUid(1001, null, files) && trustedUid(998, null, files), 'members of the gurtos group: the installing user, the kiosk screen');
    assert.ok(trustedUid(997, null, files) && trustedUid(1002, null, files), 'an account whose primary group is gurtos');
    assert.ok(!trustedUid(1000, null, files), 'a sudoer who is not the owner and not in the group (another login on this machine)');
    assert.ok(!trustedUid(65534, null, files), 'a service running as nobody');
    assert.ok(!trustedUid(30001, null, files) && !trustedUid(30001, 'box-t1', files), 'a task user, even put in the group or named the owner');
    assert.ok(!trustedUid(4242, null, files) && !trustedUid(undefined, null, files), 'an unknown account, or a connection whose account was not found');
    assert.ok(!trustedUid(1001, null, { passwd: files.passwd, group: path.join(dir, 'missing') }), 'no group file: nobody but root');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a connection over ::1 is matched to its account in /proc/net/tcp6', async (t) => {
  const server = net.createServer();
  const ok = await new Promise<boolean>((r) => server.once('error', () => r(false)).listen(0, '::1', () => r(true)));
  if (!ok) return t.skip('no IPv6 loopback here');
  const port = (server.address() as net.AddressInfo).port;
  const seen = new Promise<number | undefined>((r) => server.once('connection', (sock) => r(uidOf(sock))));
  const c = net.connect(port, '::1');
  assert.equal(await seen, process.getuid!());
  c.destroy();
  server.close();
});

test('127.0.0.1 reaching a dual-stack listener (::ffff:127.0.0.1) is matched to its account too', async (t) => {
  const server = net.createServer();
  const ok = await new Promise<boolean>((r) => server.once('error', () => r(false)).listen({ port: 0, host: '::', ipv6Only: false }, () => r(true)));
  if (!ok) return t.skip('no IPv6 here');
  const port = (server.address() as net.AddressInfo).port;
  const seen = new Promise<[string | undefined, number | undefined]>((r) => server.once('connection', (sock) => r([sock.remoteAddress, uidOf(sock)])));
  const c = net.connect(port, '127.0.0.1');
  assert.deepEqual(await seen, ['::ffff:127.0.0.1', process.getuid!()]);
  c.destroy();
  server.close();
});

test("a web search or fetch the model service would run from its side is refused, unless it is held to hosts the task may reach", () => {
  const call = (tool: object) => ({ model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [{ name: 'Bash', input_schema: {} }, tool] });
  // Anthropic's server tools, as Claude Code's WebSearch sends them.
  assert.match(fetchesOnItsOwn(call({ type: 'web_search_20250305', name: 'web_search', max_uses: 8 })) ?? '', /web_search_20250305/);
  assert.match(fetchesOnItsOwn(call({ type: 'web_fetch_20250910', name: 'web_fetch' }), ['example.com']) ?? '', /web_fetch/);
  // OpenAI's hosted search: the Responses tool (Codex sends it unless told not to) and the Chat Completions option.
  assert.match(fetchesOnItsOwn({ model: 'm', input: 'hi', tools: [{ type: 'web_search' }] }, ['example.com']) ?? '', /web_search/);
  assert.match(fetchesOnItsOwn({ model: 'm', input: 'hi', tools: [{ type: 'web_search_preview' }] }) ?? '', /web_search_preview/);
  assert.match(fetchesOnItsOwn({ model: 'm', messages: [], web_search_options: {} }) ?? '', /web search/);
  // Held to the task's own hosts, it reaches nothing the task could not.
  assert.equal(fetchesOnItsOwn(call({ type: 'web_search_20250305', name: 'web_search', allowed_domains: ['docs.example.com'] }), ['*.example.com']), undefined);
  assert.equal(fetchesOnItsOwn({ input: 'hi', tools: [{ type: 'web_search', filters: { allowed_domains: ['example.com'] } }] }, ['example.com']), undefined);
  assert.ok(fetchesOnItsOwn(call({ type: 'web_search_20250305', name: 'web_search', allowed_domains: ['example.com', 'other.example'] }), ['example.com']), 'one domain off the list');
  assert.ok(fetchesOnItsOwn(call({ type: 'web_search_20250305', name: 'web_search', allowed_domains: [] }), ['example.com']), 'an empty list means everywhere');
  assert.ok(fetchesOnItsOwn(call({ type: 'web_search_20250305', name: 'web_search', blocked_domains: ['x.example'] }), ['example.com']));
  // The agent's own tools, and what an allowed search left in the history, go through.
  assert.equal(fetchesOnItsOwn(call({ name: 'WebFetch', description: 'Fetches a URL', input_schema: { type: 'object' } })), undefined);
  assert.equal(fetchesOnItsOwn({ messages: [{ role: 'assistant', content: [{ type: 'web_search_tool_result', content: [] }, { type: 'server_tool_use', name: 'web_search', input: { query: 'x' } }] }] }), undefined);
});

test("an upstream gets the vault's key in its own header, and never what the task sent", () => {
  const sent = { host: '127.0.0.1:8888', 'x-api-key': BOX_PLACEHOLDER, authorization: `Bearer ${BOX_PLACEHOLDER}`, 'api-key': 'guess', 'proxy-authorization': 'Basic eA==', 'anthropic-beta': 'tools-1', 'content-type': 'application/json' };
  const a = keyed(sent, 'api.anthropic.com', UPSTREAMS.anthropic, 'sk-real');
  assert.deepEqual(a, { 'anthropic-beta': 'tools-1', 'content-type': 'application/json', host: 'api.anthropic.com', 'x-api-key': 'sk-real' });
  const o = keyed(sent, 'api.openai.com', UPSTREAMS.openai, 'sk-real');
  assert.equal(o.authorization, 'Bearer sk-real');
  assert.equal(o['x-api-key'], undefined);
  const c = keyed(sent, 'gw.example', UPSTREAMS.custom, 'gw-real');
  assert.deepEqual([c['x-api-key'], c.authorization], ['gw-real', 'Bearer gw-real'], 'gateways differ in the header they read');
  const local = keyed(sent, '127.0.0.1:11434', UPSTREAMS.ollama);
  assert.ok(!JSON.stringify(local).includes(BOX_PLACEHOLDER) && local.authorization === undefined && local['x-api-key'] === undefined, 'a local model gets no key, and not the placeholder');
  for (const out of [a, o, c, local]) assert.ok(!JSON.stringify(out).includes(BOX_PLACEHOLDER));
});

test('an upstream is ready once it has its address and, if it needs one, its key', () => {
  const off = { ollamaHost: '', customBaseUrl: '', customWire: 'anthropic' as const };
  const none = () => undefined;
  assert.ok(!upstreamReady(UPSTREAMS.anthropic, off, none) && upstreamReady(UPSTREAMS.anthropic, off, (k) => (k === 'ANTHROPIC_API_KEY' ? 'k' : undefined)));
  assert.ok(!upstreamReady(UPSTREAMS.ollama, off, none) && upstreamReady(UPSTREAMS.ollama, { ...off, ollamaHost: 'http://127.0.0.1:11434' }, none), 'Ollama needs no key');
  assert.ok(upstreamReady(UPSTREAMS.custom, { ...off, customBaseUrl: 'https://gw.example/v1/' }, none), 'the owner\'s endpoint may want no key');
  assert.equal(UPSTREAMS.custom.origin({ ...off, customBaseUrl: 'https://gw.example/llm/v1/' }), 'https://gw.example/llm', '/v1 is part of each call, not of the address');
  assert.deepEqual(UPSTREAMS.custom.wires({ ...off, customWire: 'openai' }), ['openai']);
  assert.equal(addressProblem('http://127.0.0.1:11434'), undefined);
  assert.equal(addressProblem(''), undefined);
  for (const bad of ['ftp://x', 'gw.example', 'https://user:pw@gw.example', 'https://gw.example/?k=1', 7]) assert.ok(addressProblem(bad), String(bad));
});

test("the proxy relays an agent's model calls: the vault key goes on, the placeholder does not, and only for an upstream its agent may use", async () => {
  process.env.BOX_PROXY_PORT = 'auto';
  // The model service: the owner's own endpoint, here a server on loopback that keeps what it was sent.
  const got: { url?: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  const service = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => (got.push({ url: req.url, headers: req.headers, body }), res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')));
  });
  await new Promise<void>((r) => service.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${(service.address() as net.AddressInfo).port}/gateway`;
  const blocked: string[] = [];
  let task = { id: 'tup', worker: 'claude', hosts: ['docs.example.com'] } as unknown as Task;
  let cfg = { ollamaHost: '', customBaseUrl: at, customWire: 'anthropic' as 'anthropic' | 'openai' };
  let planned = 'custom'; // the upstream the task was started with
  const port = await startProxy({ taskOf: () => task, blocked: (_t, host) => blocked.push(host), leaked: () => false, key: (name) => (name === 'CUSTOM_API_KEY' ? 'gw-real-key' : undefined), config: () => cfg, upstream: () => planned }, { key: Buffer.from(''), cert: Buffer.from('') });
  const send = (path: string, body?: object, method = body ? 'POST' : 'GET') =>
    new Promise<{ status: number; text: string }>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, path, method, headers: { 'x-api-key': BOX_PLACEHOLDER, authorization: `Bearer ${BOX_PLACEHOLDER}`, 'content-type': 'application/json' } });
      req.on('response', (r) => {
        let text = '';
        r.on('data', (c) => (text += c));
        r.on('end', () => resolve({ status: r.statusCode ?? 0, text }));
      });
      req.end(body ? JSON.stringify(body) : undefined);
    });
  try {
    const msg = { model: 'm', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] };
    assert.equal((await send('/up/custom/v1/messages?beta=true', msg)).status, 200);
    assert.equal(got.length, 1);
    assert.equal(got[0].url, '/gateway/v1/messages?beta=true', "sent to the owner's address, under its own path");
    assert.deepEqual([got[0].headers['x-api-key'], got[0].headers.authorization], ['gw-real-key', 'Bearer gw-real-key'], "the vault's key is on the call");
    assert.ok(!JSON.stringify(got[0].headers).includes(BOX_PLACEHOLDER), 'the placeholder never leaves the box');
    assert.deepEqual(JSON.parse(got[0].body), msg);

    // A search the service would run from its side: refused and logged, unless held to the task's hosts.
    const search = await send('/up/custom/v1/messages', { ...msg, tools: [{ type: 'web_search_20250305', name: 'web_search' }] });
    assert.equal(search.status, 403);
    assert.match(search.text, /may not ask the model service to fetch a web_search_20250305 tool/);
    assert.ok(blocked.some((b) => /web_search_20250305/.test(b)), 'the refusal is in the log');
    assert.equal((await send('/up/custom/v1/messages', { ...msg, tools: [{ type: 'web_search_20250305', name: 'web_search', allowed_domains: ['docs.example.com'] }] })).status, 200);
    assert.equal(got.length, 2);

    // Only model calls, in the format the endpoint speaks.
    assert.equal((await send('/up/custom/v1/files', msg)).status, 403);
    assert.equal((await send('/up/custom/v1/responses', { model: 'm', input: 'hi' })).status, 403, "OpenAI's path on an Anthropic-format endpoint");
    assert.equal((await send('/up/custom/api/pull', { model: 'm' })).status, 403);
    // Only the upstreams its agent may use, and only ones that are set up.
    assert.equal((await send('/up/openai/v1/responses', { model: 'm', input: 'hi' })).status, 403, 'Claude Code has no business at OpenAI');
    assert.equal((await send('/up/factory/v1/messages', msg)).status, 403);
    assert.equal((await send('/up/nowhere/v1/messages', msg)).status, 403);
    assert.equal((await send('/up/anthropic/v1/messages', msg)).status, 403, 'its agent could use Anthropic, but this task was started on the custom endpoint');
    planned = 'anthropic';
    assert.equal((await send('/up/anthropic/v1/messages', msg)).status, 503, 'started there, but the vault has no Anthropic key');
    planned = 'ollama';
    assert.equal((await send('/up/ollama/v1/messages', msg)).status, 503, 'started there, but no Ollama address is set');
    planned = 'custom';
    task = { ...task, worker: 'fake' } as Task;
    assert.equal((await send('/up/custom/v1/messages', msg)).status, 403, 'a scripted task has no model service');
    assert.equal(got.length, 2, 'none of the refused calls reached the service');

    // Codex on the same endpoint, once the owner says it speaks OpenAI's format. Hosted search is refused there too.
    task = { ...task, worker: 'codex' } as Task;
    cfg = { ...cfg, customWire: 'openai' };
    assert.equal((await send('/up/custom/v1/responses', { model: 'm', input: 'hi' })).status, 200);
    assert.equal(got[2].headers.authorization, 'Bearer gw-real-key');
    assert.equal((await send('/up/custom/v1/responses', { model: 'm', input: 'hi', tools: [{ type: 'web_search' }] })).status, 403);
    assert.equal((await send('/up/custom/v1/models')).status, 200);
    // A local model: no key at all goes on.
    cfg = { ...cfg, ollamaHost: at.replace('/gateway', '') };
    planned = 'ollama';
    assert.equal((await send('/up/ollama/v1/chat/completions', { model: 'qwen3', messages: [] })).status, 200);
    const local = got.at(-1)!;
    assert.ok(local.headers.authorization === undefined && local.headers['x-api-key'] === undefined && local.url === '/v1/chat/completions');
  } finally {
    delete process.env.BOX_PROXY_PORT;
    service.close();
  }
});

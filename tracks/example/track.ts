// The example track: one of each slot, small enough to copy. The demo uses `example.spend`.
import type { Track } from '../../core/contract.ts';
import { onFileChange, schedule, webhook } from '../../core/triggers.ts';

const inbox = `${process.env.BOX_HOME ?? '/var/lib/box'}/inbox/example`;

export default {
  name: 'example',
  title: 'Example',
  description: 'A sample app for developers that shows every way an app can plug into GurtOS. It spends test money only.',
  secrets: ['DEMO_SECRET'],

  // All three generic triggers, which any track reuses. A real track returns a Droid task here.
  triggers: [
    webhook({ name: 'start', task: (p: { title?: string }) => ({ title: p.title ?? 'From a webhook', workspace: 'home', worker: 'fake', prompt: 'write hook.txt yes', source: 'webhook' }) }),
    onFileChange({ name: 'inbox', dir: inbox, task: (file) => ({ title: `Saw ${file}`, workspace: 'home', worker: 'fake', prompt: `write seen-${file} yes`, source: 'file' }) }),
    schedule({ name: 'hourly', everyMs: 3600_000, task: () => ({ title: 'Hourly check', workspace: 'home', worker: 'fake', prompt: 'write tick.txt yes', source: 'schedule' }) }),
  ],

  tools: [
    {
      name: 'example.spend',
      description: 'Spend test money (no real payment). Input: { cents, on }.',
      input: { type: 'object', properties: { cents: { type: 'number' }, on: { type: 'string' } }, required: ['cents', 'on'] },
      secrets: ['DEMO_SECRET'],
      cost: (input: { cents: number }) => input.cents,
      approval: (input: { on: string }) => ({ payee: 'Test Vendor', purpose: `test spend on ${input.on}` }),
      async run(input: { cents: number; on: string }, ctx) {
        ctx.secret('DEMO_SECRET'); // a real tool would call an API with it here; it never leaves the core
        // A metered tool reports what it really charged; the box counts that, not the cap it was approved for.
        const spentCents = input.on === 'metered' ? Math.floor(input.cents / 2) : input.cents;
        return { paid: spentCents, on: input.on, test: true, receipt: ctx.key, spentCents };
      },
    },
    {
      name: 'example.record',
      description: 'Record a decision about a subject. Input: { subject, action }. Shows `decides`, the hook for Business shadow mode.',
      input: { type: 'object', properties: { subject: { type: 'string' }, action: { type: 'string' } }, required: ['subject', 'action'] },
      decides: (input: { subject: string; action: string }) => `record "${input.action}" for ${input.subject}`,
      async run(input: { subject: string; action: string }) {
        return { status: 'recorded', subject: input.subject, action: input.action };
      },
    },
  ],

  // Served on the box's API: GET /t/example/ is the app's page, POST /t/example/start starts a task.
  // `openRoutes` need no paired phone even through a public proxy. `ownOrigin` pages run with the box's own origin,
  // which only a page that cannot work in the sandbox (like a passkey page) should ask for.
  openRoutes: ['GET /status'],
  ownOrigin: ['GET /approve'],
  routes: {
    'GET /status': () => Response.json({ ok: true }),
    'GET /approve': () => new Response('<!doctype html><p>This page keeps the box\'s own origin.</p>', { headers: { 'content-type': 'text/html' } }),
    'GET /': () => new Response('<!doctype html><h1>Example app</h1>', { headers: { 'content-type': 'text/html' } }),
    // A route reading a vault secret directly (no model-job workaround). It returns a derived fact, never the secret.
    // Who is calling, as the box says: 'screen', 'owner', 'device:<id>', 'service' or 'none'.
    'GET /whoami': (req) => Response.json({ caller: req.headers.get('x-box-caller') }),
    'GET /secret-check': (_req, box) => {
      try {
        return Response.json({ looksLikeTestKey: box.secret('DEMO_SECRET').startsWith('sk_test_') });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 404 }); // the key is not in the vault
      }
    },
    // A route reads its body defensively and answers a bad request with a 400 and a reason, not a crash.
    'POST /start': async (req, box) => {
      const { title = 'Example task', prompt = 'write hello.txt hi', workspace = 'example' } = (await req.json().catch(() => null)) ?? {};
      try {
        box.workspace(workspace); // makes it the first time, then leaves it alone
        return Response.json(await box.createTask({ title, prompt, workspace, worker: 'fake' }));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
    },
  },

  logReaders: [
    {
      name: 'count',
      read(e) {
        if (e.type === 'task.state' && e.state === 'done') counts.done++;
      },
    },
  ],

  modelJobs: [{ name: 'example.echo', run: async (input) => ({ echo: input }) }],

  apps: [{ name: 'example', title: 'Example', href: '/' }],
} satisfies Track;

const counts = { done: 0 };

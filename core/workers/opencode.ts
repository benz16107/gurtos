// opencode as the agent: `opencode run` inside the task's copy of the workspace, as the task's own user.
// The box put its settings in OPENCODE_CONFIG_CONTENT before this script started (workers/index.ts): the model
// provider's address is the box's proxy, the key is a placeholder, and the box's tools are an MCP server
// (workers/mcp.ts). opencode asks no permission questions here (--auto): the task's own user, files and network are
// the limits. Box tools still ask through the broker.
import { previous, run, short, step, usage } from './cli.ts';

const model = process.env.BOX_MODEL!;
const args = ['run', '--format', 'json', '--auto', '-m', model, ...(previous ? ['-s', previous] : [])];

let text = '';
let failed: string | undefined;
let started = !!previous;
const code = await run(args, async (e) => {
  if (!started && e.sessionID) {
    started = true;
    await step(`opencode started (${model})`, { session: e.sessionID });
  }
  const p = e.part ?? {};
  if (e.type === 'tool_use') await step(`${p.tool} ${short(p.state?.input)}${p.state?.status === 'error' ? ` (failed: ${short(p.state?.error, 120)})` : `: ${short(p.state?.output, 160)}`}`, { tool: p.tool });
  else if (e.type === 'text') text = String(p.text ?? '');
  else if (e.type === 'step_finish' && p.tokens) await usage({ input: p.tokens.input, output: (p.tokens.output ?? 0) + (p.tokens.reasoning ?? 0), cacheWrite: p.tokens.cache?.write, cacheRead: p.tokens.cache?.read });
  else if (e.type === 'error') failed = short(e.error?.data?.message ?? e.error?.name ?? e.error, 300);
});
if (failed || code !== 0) throw new Error(failed ?? `opencode stopped with an error (code ${code})`);
if (text.trim()) await step(text.trim().slice(-2000), { summary: true });

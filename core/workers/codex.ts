// OpenAI's Codex CLI as the agent: `codex exec` inside the task's copy of the workspace, as the task's own user.
// The box wrote ~/.codex/config.toml before this script started (workers/index.ts): the model provider is the box's
// proxy, the key is a placeholder, hosted web search is off, and the box's tools are an MCP server (workers/mcp.ts).
// Codex's own sandbox needs Linux namespaces, which a task may not make, so it is off: the task's own user, files and
// network are the limits. Codex asks no approval before a command here; box tools still ask through the broker.
import { previous, run, short, step, usage } from './cli.ts';

const flags = ['--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];
// "-": the prompt comes on its input.
const args = previous ? ['exec', 'resume', ...flags, previous, '-'] : ['exec', ...flags, '-'];

let text = '';
let failed: string | undefined;
const code = await run(args, async (e) => {
  if (e.type === 'thread.started' && !previous) await step(`Codex started${process.env.BOX_MODEL ? ` (${process.env.BOX_MODEL})` : ''}`, { session: e.thread_id });
  else if (e.type === 'item.completed') {
    const i = e.item ?? {};
    if (i.type === 'agent_message') text = String(i.text ?? '');
    else if (i.type === 'command_execution') await step(`Shell ${short(i.command)} (exit ${i.exit_code ?? '?'}): ${short(i.aggregated_output, 160)}`, { tool: 'shell' });
    else if (i.type === 'mcp_tool_call') await step(`${i.server}.${i.tool} ${short(i.arguments)}`, { tool: i.tool });
    else if (i.type === 'file_change') await step(`Edited ${short((i.changes ?? []).map((c: { path: string }) => c.path).join(', '))}`, { tool: 'edit' });
    else if (i.type === 'error') await step(`Codex: ${short(i.message, 300)}`);
  } else if (e.type === 'turn.completed' && e.usage) {
    const cached = e.usage.cached_input_tokens ?? 0;
    await usage({ input: Math.max(0, (e.usage.input_tokens ?? 0) - cached), output: e.usage.output_tokens, cacheRead: cached });
  } else if (e.type === 'turn.failed' || e.type === 'error') failed = short(e.error?.message ?? e.message, 300);
});
if (failed || code !== 0) throw new Error(failed ?? `Codex stopped with an error (code ${code})`);
if (text.trim()) await step(text.trim().slice(-2000), { summary: true });

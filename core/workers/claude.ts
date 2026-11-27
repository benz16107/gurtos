// Claude Code as the agent: `claude -p` inside the task's copy of the workspace, as the task's own user.
// The box set it up before this script started (workers/index.ts): ANTHROPIC_BASE_URL is the box's proxy, the key is
// a placeholder, and ~/.claude/settings.json holds the box's hooks, so a risky shell command waits for the owner and
// every tool result is logged (workers/hook.ts). Box tools and box_ask reach it through workers/mcp.ts.
// Claude Code asks no permission questions here: the task's own user, files and network are the limits.
import { boxMcp } from './index.ts';
import { previous, run, short, sock, step, usage } from './cli.ts';

const model = process.env.BOX_MODEL!;
const args = [
  '-p',
  '--output-format', 'stream-json',
  '--verbose', // stream-json needs it
  '--model', model,
  // Only the task's own ~/.claude/settings.json: a settings file in the folder it works on is never read, so it
  // cannot move the model address, add hooks or allow tools.
  '--setting-sources', 'user',
  '--mcp-config', JSON.stringify({ mcpServers: { box: boxMcp(sock) } }),
  '--strict-mcp-config', // and no MCP servers from that folder either
  '--permission-mode', 'bypassPermissions',
  '--disallowedTools', 'WebSearch', // Anthropic would search from its side, around the task's host list; the proxy refuses it too
  ...(previous ? ['--resume', previous] : []),
];

let text = '';
let failed: string | undefined;
let reported = false;
const code = await run(args, async (e) => {
  if (e.type === 'system' && e.subtype === 'init' && !previous && !reported) {
    reported = true;
    await step(`Claude Code started (${e.model ?? model})`, { session: e.session_id });
  } else if (e.type === 'assistant') {
    for (const block of e.message?.content ?? []) {
      if (block.type === 'text') text = block.text;
      else if (block.type === 'tool_use') await step(`${block.name} ${short(block.input)}`, { tool: block.name });
    }
  } else if (e.type === 'result') {
    const u = e.usage;
    if (u) await usage({ input: u.input_tokens, output: u.output_tokens, cacheWrite: u.cache_creation_input_tokens, cacheRead: u.cache_read_input_tokens });
    if (e.is_error) failed = short(e.result ?? e.subtype, 300);
    else if (typeof e.result === 'string') text = e.result;
  }
});
if (failed || code !== 0) throw new Error(failed ?? `Claude Code stopped with an error (code ${code})`);
if (text.trim()) await step(text.trim().slice(-2000), { summary: true });

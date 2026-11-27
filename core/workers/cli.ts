// What the workers that run an agent's own command share (claude.ts, codex.ts, opencode.ts): the broker calls,
// starting the command with the prompt on its input, and reading the JSON lines it prints.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { call } from '../client.ts';

export const sock = process.env.BOX_SOCKET!;
export const step = (text: string, data?: unknown) => call(sock, 'POST', '/step', { text, data });
export const { task, steps } = await call(sock, 'GET', '/task');
/** The agent's own session id from an earlier run of this task, kept in a step, so a restarted box carries on. */
export const previous: string | undefined = steps.findLast((s: { data?: { session?: string } }) => s.data?.session)?.data.session;
export const prompt: string = previous ? `The box restarted while you were working on this. Check what is already done in the files, then finish:\n\n${task.prompt}` : task.prompt;
export const short = (v: unknown, n = 200) => (typeof v === 'string' ? v : JSON.stringify(v ?? '')).replace(/\s+/g, ' ').slice(0, n);

/** Token counts for the task's cost. The task's model carries its model service in front ('ollama/qwen3'), which prices a local model at nothing. */
export const usage = (tokens: { input?: number; output?: number; cacheWrite?: number; cacheRead?: number }) =>
  call(sock, 'POST', '/usage', { model: task.model ?? process.env.BOX_MODEL ?? task.worker, what: 'model', tokens: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, ...tokens } });

/**
 * Run the agent's command and hand each JSON line it prints to `each`. Lines that are not JSON, and what it writes to
 * stderr, go to the task's worker.log. Resolves to its exit code.
 */
export async function run(args: string[], each: (event: any) => Promise<unknown>, input = prompt): Promise<number> {
  const child = spawn(process.env.BOX_AGENT_BIN!, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdin.on('error', () => {}); // it ended before reading its input: its exit code says why
  child.stdin.end(input);
  const exit = new Promise<number>((resolve, reject) => (child.once('error', reject), child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))));
  for await (const line of readline.createInterface({ input: child.stdout })) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      if (line.trim()) console.log(line);
      continue;
    }
    await each(event);
  }
  return exit;
}

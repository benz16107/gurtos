// A model service for the merge gate, so a real agent command can run with no paid call. It speaks Anthropic's
// Messages format, plays a fixed script (`turns`), and keeps what it was sent, so the demo can check that the box's
// proxy put the vault's key on each call and that the task's placeholder never arrived.
import http from 'node:http';
import type net from 'node:net';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
export interface Seen {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/** Start it on a free loopback port. Each turn answers the agent's next main call (one that offers tools). */
export async function scriptedModel(turns: Block[][]): Promise<{ url: string; seen: Seen[]; close(): void }> {
  const seen: Seen[] = [];
  let turn = 0;
  const server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (c) => (text += c));
    req.on('end', () => {
      const body = text ? JSON.parse(text) : undefined;
      seen.push({ path: req.url ?? '', headers: req.headers, body });
      if (!req.url?.startsWith('/v1/messages') || req.url.includes('count_tokens')) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ input_tokens: 10, data: [] }));
      // The agent's side calls (a title for the session, say) offer no tools: a plain word answers them.
      const content: Block[] = body?.tools?.length ? (turns[turn++] ?? [{ type: 'text', text: 'Done.' }]) : [{ type: 'text', text: 'ok' }];
      const stop = content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn';
      const message = { id: `msg_demo_${seen.length}`, type: 'message', role: 'assistant', model: body?.model ?? 'demo', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      if (!body?.stream) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...message, content, stop_reason: stop }));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: { ...message, content: [], stop_reason: null } });
      content.forEach((b, index) => {
        if (b.type === 'text') {
          ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
          ev('content_block_delta', { index, delta: { type: 'text_delta', text: b.text } });
        } else {
          ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
          ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
        }
        ev('content_block_stop', { index });
      });
      ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
      ev('message_stop', {});
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`, seen, close: () => server.close() };
}

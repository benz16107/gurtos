// Where a task's model calls may go. A task never holds a real key and never names the service's address: its agent
// calls the box's proxy on loopback, at /up/<id>/..., with a placeholder key. The proxy (net.ts) looks the upstream
// up here, checks the path and the body, puts the vault's key in the header and sends the call on.
import type http from 'node:http';

/** The two request formats the proxy can read: Anthropic's Messages API, and OpenAI's Responses and Chat Completions. */
export type Wire = 'anthropic' | 'openai';

/** What an agent holds in place of a key. It is never sent on: the proxy drops the key headers and writes its own. */
export const BOX_PLACEHOLDER = 'box-placeholder-the-box-adds-the-key';

/** The owner's settings an upstream reads (core/config.ts). */
export interface UpstreamConfig {
  ollamaHost: string;
  customBaseUrl: string;
  customWire: Wire;
}

export interface Upstream {
  id: string;
  title: string;
  /** The service's address, with no path after the host unless the owner's own endpoint has one. Undefined: not set up. */
  origin(c: UpstreamConfig): string | undefined;
  /** The vault key that goes into the headers. None for a local model. */
  vaultKey?: string;
  /** False when the service works without a key (the owner's own endpoint may not want one). */
  keyRequired: boolean;
  /** The headers that carry the key. `authorization` gets "Bearer <key>". */
  headers: ('x-api-key' | 'authorization')[];
  /** The formats this upstream speaks, which decide the paths that are relayed and who may use it. */
  wires(c: UpstreamConfig): Wire[];
}

/** The only paths relayed, per format. Anything else would use the owner's key for something no agent needs. */
export const WIRE_PATHS: Record<Wire, RegExp> = {
  anthropic: /^\/v1\/(messages(\/count_tokens)?|models(\/[\w.@:-]+)?)$/,
  openai: /^\/v1\/(responses|chat\/completions|models(\/[\w.@:-]+)?)$/,
};

const url = (s: string) => s.replace(/\/+$/, '').replace(/\/v1$/, '') || undefined;

export const UPSTREAMS: Record<string, Upstream> = {
  anthropic: { id: 'anthropic', title: 'Anthropic', origin: () => 'https://api.anthropic.com', vaultKey: 'ANTHROPIC_API_KEY', keyRequired: true, headers: ['x-api-key'], wires: () => ['anthropic'] },
  openai: { id: 'openai', title: 'OpenAI', origin: () => 'https://api.openai.com', vaultKey: 'OPENAI_API_KEY', keyRequired: true, headers: ['authorization'], wires: () => ['openai'] },
  // Droid's own service. Droid reaches it its own way (net.ts), not through /up/factory.
  factory: { id: 'factory', title: 'Factory', origin: () => 'https://api.factory.ai', vaultKey: 'FACTORY_API_KEY', keyRequired: true, headers: ['authorization'], wires: () => [] },
  // A local model. Ollama serves both formats and wants no key.
  ollama: { id: 'ollama', title: 'Ollama', origin: (c) => url(c.ollamaHost), keyRequired: false, headers: [], wires: () => ['anthropic', 'openai'] },
  // The owner's own endpoint: LiteLLM, a company gateway. Gateways differ in which header they read, so the key goes in both.
  custom: { id: 'custom', title: 'Your own endpoint', origin: (c) => url(c.customBaseUrl), vaultKey: 'CUSTOM_API_KEY', keyRequired: false, headers: ['x-api-key', 'authorization'], wires: (c) => [c.customWire] },
};

/** Whether tasks can use this upstream now: it has an address, and its key if it needs one. */
export function upstreamReady(u: Upstream, c: UpstreamConfig, key: (name: string) => string | undefined): boolean {
  return !!u.origin(c) && (!u.keyRequired || !!(u.vaultKey && key(u.vaultKey)));
}

/** Why a model address in Settings is refused, or undefined. Empty means off. */
export function addressProblem(v: unknown): string | undefined {
  if (v === '') return;
  try {
    const u = new URL(String(v));
    if (typeof v === 'string' && /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.search && !u.hash) return;
  } catch {}
  return 'must be an address like http://127.0.0.1:11434 or https://gateway.example.com, or empty for off';
}

/**
 * A task's request headers on their way to an upstream. Whatever the task put in a key header is dropped, the
 * placeholder included, and the vault's key is written in. With no key (a local model) the call goes with none.
 */
export function keyed(headers: http.IncomingHttpHeaders, host: string, u: Upstream, key?: string): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !['host', 'authorization', 'x-api-key', 'api-key', 'proxy-authorization'].includes(name)) out[name] = value;
  }
  out.host = host;
  if (key) for (const h of u.headers) out[h] = h === 'authorization' ? `Bearer ${key}` : key;
  return out;
}

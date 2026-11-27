import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, applyPatch } from './config.ts';
import { BOX_PLACEHOLDER } from './upstreams.ts';
import { AGENTS, WORKERS, boxMcp, canUse, plan, splitModel } from './workers/index.ts';
import type { WorkerCtx } from './workers/index.ts';

const ctx = (o: Partial<WorkerCtx>): WorkerCtx => ({ upstream: 'anthropic', wire: 'anthropic', model: 'claude-sonnet-5-5', base: (u) => `http://127.0.0.1:8888/up/${u}`, home: '/var/lib/box/tasks/t1/home', socket: '/var/lib/box/tasks/t1/broker.sock', caPem: '/var/lib/box/relay-ca.pem', proxy: 'http://127.0.0.1:8888', ...o });
const REAL = /sk-(?!ant-placeholder)|fk-(?!placeholder)/; // nothing shaped like a real key

test('every agent is handed the proxy and a placeholder, never a key or the service\'s own address', () => {
  for (const name of AGENTS()) {
    const def = WORKERS[name];
    for (const upstream of def.upstreams) {
      const o = ctx({ upstream, wire: def.wires[0], model: 'm1' });
      const all = JSON.stringify([def.env(o), def.files?.(o) ?? {}]);
      assert.ok(!REAL.test(all), `${name} on ${upstream}`);
      if (name !== 'droid') assert.ok(all.includes(`http://127.0.0.1:8888/up/${upstream}`) && all.includes(BOX_PLACEHOLDER) && !/api\.(anthropic|openai)\.com/.test(all), `${name} on ${upstream} calls the proxy`);
    }
  }
});

test('Claude Code is pointed at the proxy in its environment and in its own settings file, with search off and the box\'s hooks on', () => {
  const o = ctx({});
  const env = WORKERS.claude.env(o);
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:8888/up/anthropic');
  assert.equal(env.ANTHROPIC_API_KEY, BOX_PLACEHOLDER);
  assert.equal(env.BOX_MODEL, 'claude-sonnet-5-5');
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, undefined, 'on Anthropic, Haiku does the small jobs');
  const settings = JSON.parse(WORKERS.claude.files!(o)['.claude/settings.json']);
  assert.equal(settings.env.ANTHROPIC_BASE_URL, env.ANTHROPIC_BASE_URL);
  assert.deepEqual(settings.permissions.deny, ['WebSearch']);
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash');
  assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /workers\/hook\.ts' 'pre'$/);
  assert.match(settings.hooks.PostToolUse[0].hooks[0].command, /workers\/hook\.ts' 'post'$/);
  // Its box tools wait for the owner's OK, as long as the hook may.
  assert.deepEqual([boxMcp('/s').env.BOX_MCP_WAIT, boxMcp('/s').timeout], ['1', 86_400_000]);
  // A local model does the small background jobs too.
  const local = WORKERS.claude.env(ctx({ upstream: 'ollama', model: 'qwen3' }));
  assert.deepEqual([local.ANTHROPIC_BASE_URL, local.ANTHROPIC_DEFAULT_HAIKU_MODEL, local.BOX_MODEL], ['http://127.0.0.1:8888/up/ollama', 'qwen3', 'qwen3']);
});

test("Codex gets a config.toml with the proxy as its provider, the Responses format, search off and the box's tools", () => {
  const o = ctx({ upstream: 'openai', wire: 'openai', model: 'gpt-x' });
  assert.deepEqual(WORKERS.codex.env(o), { OPENAI_API_KEY: BOX_PLACEHOLDER, BOX_MODEL: 'gpt-x' });
  const toml = WORKERS.codex.files!(o)['.codex/config.toml'];
  for (const line of ['model = "gpt-x"', 'model_provider = "box"', 'web_search = "disabled"', 'base_url = "http://127.0.0.1:8888/up/openai/v1"', 'env_key = "OPENAI_API_KEY"', 'wire_api = "responses"', '[mcp_servers.box]', 'BOX_SOCKET = "/var/lib/box/tasks/t1/broker.sock"']) assert.ok(toml.split('\n').includes(line), line);
  assert.match(toml, /args = \[.*workers\/mcp\.ts"\]/);
  // A box tool call waits for the owner's OK, past Codex's default 300 s.
  for (const line of ['tool_timeout_sec = 86400', 'BOX_MCP_WAIT = "1"']) assert.ok(toml.split('\n').includes(line), line);
  assert.ok(!WORKERS.codex.files!(ctx({ upstream: 'openai', wire: 'openai', model: undefined }))['.codex/config.toml'].includes('model ='), "no model named: Codex's own default");
});

test('opencode gets its settings in the one place a folder\'s own config file cannot override', () => {
  const env = WORKERS.opencode.env(ctx({ upstream: 'ollama', wire: 'anthropic', model: 'qwen3' }));
  assert.equal(env.BOX_MODEL, 'anthropic/qwen3');
  const cfg = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.deepEqual(cfg.provider.anthropic, { options: { baseURL: 'http://127.0.0.1:8888/up/ollama/v1', apiKey: '{env:BOX_API_KEY}' }, models: { qwen3: {} } });
  assert.equal(env.BOX_API_KEY, BOX_PLACEHOLDER);
  assert.match(cfg.mcp.box.command.at(-1), /workers\/mcp\.ts$/);
  assert.equal(cfg.mcp.box.environment.BOX_SOCKET, '/var/lib/box/tasks/t1/broker.sock');
  assert.equal(WORKERS.opencode.env(ctx({ upstream: 'openai', wire: 'openai', model: 'gpt-x' })).BOX_MODEL, 'openai/gpt-x');
  assert.throws(() => plan(WORKERS.opencode, undefined, (u) => u === 'openai'), /name the OpenAI model/);
});

test('Droid keeps its own setup: Factory by default, its settings file only on the owner\'s Anthropic key', () => {
  const f = ctx({ upstream: 'factory' });
  assert.equal(WORKERS.droid.env(f).BOX_MODEL, 'claude-sonnet-5-5');
  assert.equal(WORKERS.droid.env(f).FACTORY_API_BASE_URL, 'http://127.0.0.1:8888');
  assert.deepEqual(WORKERS.droid.files!(f), {});
  const a = ctx({ upstream: 'anthropic', model: 'claude-opus-5-5' });
  assert.equal(WORKERS.droid.env(a).BOX_MODEL, 'custom:claude-opus-5-5');
  const models = JSON.parse(WORKERS.droid.files!(a)['.factory/settings.json']).customModels;
  assert.deepEqual(models.map((m: { model: string }) => m.model), ['claude-opus-5-5', 'claude-haiku-5-5']);
  assert.ok(models.every((m: { apiKey: string }) => /placeholder/.test(m.apiKey)));
});

test('a model is checked for the agent and the service it runs on', () => {
  const all = () => true;
  assert.deepEqual(splitModel('ollama/qwen3:8b'), { upstream: 'ollama', model: 'qwen3:8b' });
  assert.deepEqual(splitModel('meta/llama'), { model: 'meta/llama' }, 'not an upstream: part of the model id');
  assert.deepEqual(plan(WORKERS.droid, undefined, (u) => u === 'anthropic'), { upstream: 'anthropic', model: 'claude-sonnet-5-5' });
  assert.deepEqual(plan(WORKERS.droid, 'opus', all), { upstream: 'factory', model: 'claude-opus-5-5' });
  assert.deepEqual(plan(WORKERS.droid, null as never, all), plan(WORKERS.droid, '', all), 'no model named, however it is spelled');
  assert.throws(() => plan(WORKERS.claude, 7 as never, all), /model: text/);
  assert.throws(() => plan(WORKERS.droid, 'gpt-5', all), /model: haiku, sonnet, opus/);
  assert.deepEqual(plan(WORKERS.claude, 'haiku', all), { upstream: 'anthropic', model: 'claude-haiku-5-5' });
  assert.throws(() => plan(WORKERS.claude, 'gpt-5', all), /Anthropic runs Claude models/);
  assert.deepEqual(plan(WORKERS.claude, 'ollama/qwen3:8b', all), { upstream: 'ollama', model: 'qwen3:8b' });
  assert.deepEqual(plan(WORKERS.claude, 'my-model', (u) => u === 'custom'), { upstream: 'custom', model: 'my-model' }, 'with only the owner\'s endpoint set up, that is where it goes');
  assert.throws(() => plan(WORKERS.claude, undefined, (u) => u === 'ollama'), /name the model to run on Ollama/);
  assert.throws(() => plan(WORKERS.claude, 'openai/gpt-5', all), /Claude Code cannot use OpenAI/);
  assert.deepEqual(plan(WORKERS.codex, undefined, all), { upstream: 'openai', model: undefined });
  assert.throws(() => plan(WORKERS.codex, 'a b', all), /model id/);
  assert.throws(() => plan(WORKERS.codex, 'gpt-5', () => false), /No model key yet\. Codex needs one of these/);
  assert.throws(() => plan(WORKERS.droid, undefined, () => false), /^Error: No model key yet\. Add an Anthropic or Factory API key/);
});

test('an agent can use a model service once it is set up and speaks a format the agent sends', () => {
  const off = { ollamaHost: '', customBaseUrl: '', customWire: 'anthropic' as 'anthropic' | 'openai' };
  const vault = (...names: string[]) => (k: string) => (names.includes(k) ? 'k' : undefined);
  const via = (agent: string, cfg = off, key = vault()) => WORKERS[agent].upstreams.filter((u) => canUse(WORKERS[agent], u, cfg, key));
  assert.deepEqual(via('droid', off, vault('FACTORY_API_KEY')), ['factory'], 'Droid on a Factory key alone');
  assert.deepEqual(via('droid', off, vault('FACTORY_API_KEY', 'ANTHROPIC_API_KEY')), ['factory', 'anthropic']);
  assert.deepEqual(via('claude', off, vault('FACTORY_API_KEY', 'OPENAI_API_KEY')), [], 'neither is Claude Code\'s');
  assert.deepEqual(via('claude', off, vault('ANTHROPIC_API_KEY')), ['anthropic']);
  assert.deepEqual(via('codex', off, vault('ANTHROPIC_API_KEY', 'OPENAI_API_KEY')), ['openai']);
  const gateway = { ...off, customBaseUrl: 'https://gw.example', ollamaHost: 'http://127.0.0.1:11434' };
  assert.deepEqual(via('claude', gateway), ['custom', 'ollama']);
  assert.deepEqual(via('codex', gateway), ['ollama'], 'the endpoint speaks Anthropic\'s format, which Codex does not');
  assert.deepEqual(via('codex', { ...gateway, customWire: 'openai' }), ['custom', 'ollama']);
  assert.deepEqual(via('opencode', gateway, vault('OPENAI_API_KEY')), ['openai', 'custom', 'ollama']);
  assert.deepEqual(via('fake'), []);
});

test('the default agent and the model addresses are settings, checked like the rest', () => {
  assert.equal(DEFAULT_SETTINGS.defaultAgent, 'auto');
  const s = applyPatch(DEFAULT_SETTINGS, { defaultAgent: 'claude', ollamaHost: 'http://127.0.0.1:11434/', customBaseUrl: 'https://gw.example/llm', customWire: 'openai' });
  assert.deepEqual([s.defaultAgent, s.ollamaHost, s.customBaseUrl, s.customWire], ['claude', 'http://127.0.0.1:11434', 'https://gw.example/llm', 'openai']);
  for (const bad of [{ defaultAgent: 'fake' }, { defaultAgent: 'gemini' }, { ollamaHost: 'localhost:11434' }, { customBaseUrl: 'https://k:v@gw.example' }, { customWire: 'gemini' }]) assert.throws(() => applyPatch(DEFAULT_SETTINGS, bad), /settings\./);
});

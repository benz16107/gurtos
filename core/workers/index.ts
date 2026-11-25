// The agents a task can run on. Each is a script in this folder (core/workers/<name>.ts) that runs the agent's own
// command inside the task and reports to the task's broker socket. This table says what the box must do for each
// one before the script starts: which model services it may call through the proxy (core/upstreams.ts), the
// environment and home files that point it there with a placeholder key, and how it is installed.
import path from 'node:path';
import { DEFAULT_MODEL, MODELS, modelProblem, resolveModel } from '../models.ts';
import { BOX_PLACEHOLDER, UPSTREAMS } from '../upstreams.ts';
import type { Wire } from '../upstreams.ts';

const ANTHROPIC_PLACEHOLDER = 'sk-ant-placeholder-the-box-adds-the-key'; // Droid's own two, swapped by net.ts
const FACTORY_PLACEHOLDER = 'fk-placeholder-the-box-adds-the-key';

/** What the box knows when it sets a task up. */
export interface WorkerCtx {
  /** The upstream this task's model calls go to, and the format they are in. */
  upstream: string;
  wire: Wire;
  /** The model id, without the upstream in front. Undefined: the agent's own default. */
  model?: string;
  /** The box proxy's address for an upstream: http://127.0.0.1:<port>/up/<id>. */
  base(upstream: string): string;
  /** The task's home folder and broker socket. */
  home: string;
  socket: string;
  /** The box's own CA certificate, which only Droid tasks trust. */
  caPem: string;
  proxy: string;
}

export interface WorkerDef {
  name: string;
  title: string;
  /** Upstream ids its tasks may reach through the proxy. With no model named, the first one that is set up is used. */
  upstreams: string[];
  /** The formats the agent can send. */
  wires: Wire[];
  /** The npm package, with its version, that holds the agent's command. The box installs it the first time a task needs it. */
  pkg?: string;
  /** The command's name in that package. */
  cmd?: string;
  /** The task's model for an upstream, checked. Throws a plain sentence. */
  model(asked: string | undefined, upstream: string): string | undefined;
  /** Environment for the task: the proxy's address and placeholders, never a key. */
  env(o: WorkerCtx): Record<string, string>;
  /** Files written into the task's home before it starts (sandbox.writeHomeFile). */
  files?(o: WorkerCtx): Record<string, string>;
}

/** Agents the owner can pick for a task or as the box's default: every worker that runs a model. */
export const AGENTS = () => Object.keys(WORKERS).filter((n) => n !== 'fake');

const node = (script: string, ...args: string[]) => [process.execPath, '--experimental-strip-types', '--disable-warning=ExperimentalWarning', new URL(script, import.meta.url).pathname, ...args];

/** A model id for an agent that takes any model: an alias, or the id as the service names it. */
function anyModel(asked: string | undefined, upstream: string, fallback?: string): string | undefined {
  const id = MODELS[asked as keyof typeof MODELS] ?? asked;
  if (id !== undefined && !/^[\w.:@/-]{1,100}$/.test(id)) throw new Error('model: a model id, like claude-sonnet-5-5 or ollama/qwen3');
  if (upstream === 'anthropic' && id !== undefined && !id.startsWith('claude-')) throw new Error('model: Anthropic runs Claude models, like sonnet or claude-sonnet-5-5');
  if (id === undefined && (upstream === 'ollama' || fallback === undefined)) {
    if (upstream === 'openai') return undefined; // the agent's own default
    throw new Error(`model: name the model to run on ${UPSTREAMS[upstream].title}, like ${upstream}/${upstream === 'ollama' ? 'qwen3' : 'my-model'}`);
  }
  return id ?? fallback;
}

export const WORKERS: Record<string, WorkerDef> = {
  // Scripted steps with no model, for tests and the demo.
  fake: { name: 'fake', title: 'Scripted (no model)', upstreams: [], wires: [], model: () => undefined, env: () => ({}) },

  // Factory's Droid. It reaches Factory and Anthropic by their real names, and the proxy answers TLS for those two
  // hosts with the box's own CA (net.ts). Installed by core/setup.sh, not from npm.
  droid: {
    name: 'droid',
    title: 'Droid',
    upstreams: ['factory', 'anthropic'],
    wires: ['anthropic'],
    model(asked) {
      const why = modelProblem(asked);
      if (why) throw new Error(why);
      return resolveModel(asked);
    },
    env: (o) => ({
      FACTORY_API_KEY: FACTORY_PLACEHOLDER, // the SDK wants one even when the model is the owner's own key
      FACTORY_API_BASE_URL: o.proxy,
      FACTORY_EXTRA_CA_CERTS: o.caPem,
      NODE_EXTRA_CA_CERTS: o.caPem,
      FACTORY_RIPGREP_PATH: '/usr/bin/rg',
      BOX_MODEL: o.upstream === 'anthropic' ? `custom:${o.model}` : o.model!,
    }),
    // On the owner's own Anthropic key, Droid reads its models from ~/.factory/settings.json: the task's model, plus
    // Haiku for the second look (review.ts).
    files: (o): Record<string, string> =>
      o.upstream !== 'anthropic'
        ? {}
        : { '.factory/settings.json': JSON.stringify({ customModels: [...new Set([o.model, MODELS.haiku])].map((model) => ({ model, displayName: 'Claude (your Anthropic key)', baseUrl: 'https://api.anthropic.com', apiKey: ANTHROPIC_PLACEHOLDER, provider: 'anthropic', maxOutputTokens: 8192 })) }) },
  },

  // Claude Code, run as `claude -p` (workers/claude.ts).
  claude: {
    name: 'claude',
    title: 'Claude Code',
    upstreams: ['anthropic', 'custom', 'ollama'],
    wires: ['anthropic'],
    pkg: '@anthropic-ai/claude-code@2.1.332',
    cmd: 'claude',
    model: (asked, upstream) => anyModel(asked, upstream, process.env.BOX_MODEL?.replace(/^custom:/, '') || DEFAULT_MODEL),
    env: (o) => ({ ...claudeEnv(o), BOX_MODEL: o.model! }),
    // The task's own ~/.claude/settings.json. The worker loads only this file (--setting-sources user), so a
    // settings file in the folder the task works on cannot point Claude Code at another address or add hooks.
    files: (o) => ({
      '.claude/settings.json': JSON.stringify({
        env: claudeEnv(o),
        permissions: { deny: ['WebSearch'] }, // Anthropic would search from its side, around the task's host list
        skipWebFetchPreflight: true, // WebFetch runs in the task, through the proxy; its check with claude.ai would only be refused
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [hook('pre')] }], PostToolUse: [{ matcher: '*', hooks: [hook('post')] }] },
      }),
    }),
  },

  // OpenAI's Codex CLI, run as `codex exec` (workers/codex.ts). It reads its model service only from the user's own
  // config file, so a folder's .codex/config.toml cannot move it.
  codex: {
    name: 'codex',
    title: 'Codex',
    upstreams: ['openai', 'custom', 'ollama'],
    wires: ['openai'],
    pkg: '@openai/codex@0.172.0',
    cmd: 'codex',
    model: (asked, upstream) => anyModel(asked, upstream),
    env: (o) => ({ OPENAI_API_KEY: BOX_PLACEHOLDER, ...(o.model ? { BOX_MODEL: o.model } : {}) }),
    files: (o) => {
      const [cmd, ...args] = node('./mcp.ts');
      const q = JSON.stringify; // a TOML basic string is written like a JSON one
      return {
        '.codex/config.toml': [
          ...(o.model ? [`model = ${q(o.model)}`] : []),
          'model_provider = "box"',
          'web_search = "disabled"', // OpenAI would search from its side, around the task's host list
          '',
          '[model_providers.box]',
          'name = "GurtOS"',
          `base_url = ${q(`${o.base(o.upstream)}/v1`)}`,
          'env_key = "OPENAI_API_KEY"',
          'wire_api = "responses"',
          '',
          '[mcp_servers.box]',
          `command = ${q(cmd)}`,
          `args = ${q(args)}`,
          '',
          '[mcp_servers.box.env]',
          `BOX_SOCKET = ${q(o.socket)}`,
          '',
        ].join('\n'),
      };
    },
  },
};

function claudeEnv(o: WorkerCtx): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: o.base(o.upstream),
    ANTHROPIC_API_KEY: BOX_PLACEHOLDER,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', // no updates, telemetry or error reports: the proxy would refuse them
    // A model that is not Claude does the small background jobs too.
    ...(o.upstream === 'anthropic' ? {} : { ANTHROPIC_DEFAULT_HAIKU_MODEL: o.model!, ANTHROPIC_SMALL_FAST_MODEL: o.model! }),
  };
}

/** The box's hook (workers/hook.ts) as a command: risky shell commands wait for the owner, and every result is logged. */
function hook(event: 'pre' | 'post') {
  return { type: 'command', command: node('./hook.ts', event).map((a) => `'${a}'`).join(' '), timeout: 86_400 }; // a risky command may wait a long time for its OK
}

/** The box MCP server (workers/mcp.ts) as an agent starts it: the task's tools and box_ask. */
export const boxMcp = (socket: string) => {
  const [command, ...args] = node('./mcp.ts');
  return { command, args, env: { BOX_SOCKET: socket } };
};

/** 'ollama/qwen3' names the upstream and the model; 'sonnet' only the model. */
export function splitModel(asked?: string): { upstream?: string; model?: string } {
  const m = /^([a-z]+)\/(.+)$/.exec(asked ?? '');
  return m && m[1] in UPSTREAMS ? { upstream: m[1], model: m[2] } : { model: asked || undefined };
}

/**
 * Which upstream and model a task runs on. A model with an upstream in front uses that one; otherwise the first of
 * the agent's upstreams that is set up (`usable`: it has its address and key, and speaks a format the agent sends).
 * Throws a plain sentence when the task cannot run.
 */
export function plan(def: WorkerDef, asked: string | undefined, usable: (upstream: string) => boolean): { upstream: string; model?: string } {
  if (asked !== undefined && typeof asked !== 'string') throw new Error('model: text, like sonnet or ollama/qwen3');
  const want = splitModel(asked);
  if (want.upstream && !def.upstreams.includes(want.upstream)) throw new Error(`model: ${def.title} cannot use ${UPSTREAMS[want.upstream].title}. It can use: ${def.upstreams.join(', ')}.`);
  const upstream = want.upstream ?? def.upstreams.find(usable);
  if (!upstream || !usable(upstream)) {
    const need = (want.upstream ? [want.upstream] : def.upstreams).map((u) => UPSTREAMS[u].title).join(', ');
    // Droid's sentence is the one the screens and docs already know.
    throw new Error(def.name === 'droid' ? 'No model key yet. Add an Anthropic or Factory API key in Settings, Accounts & Keys, then start the task again.' : `No model key yet. ${def.title} needs one of these set up in Settings, Accounts & Keys: ${need}. Then start the task again.`);
  }
  return { upstream, model: def.model(want.model, upstream) };
}

/** Where the box keeps the agents it installed itself: BOX_AGENTS, or BOX_HOME/agents. */
export const agentsDir = () => process.env.BOX_AGENTS ?? path.join(process.env.BOX_HOME ?? '/var/lib/box', 'agents');
/** The agent's command. BOX_<NAME>_BIN names another one (the demo's scripted stand-in). */
export const agentBin = (def: WorkerDef) => process.env[`BOX_${def.name.toUpperCase()}_BIN`] ?? path.join(agentsDir(), def.name, 'node_modules', '.bin', def.cmd!);

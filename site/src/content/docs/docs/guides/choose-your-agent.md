---
title: Choose your agent
description: Run a task with Claude Code, Codex, opencode or Droid, on a hosted model, a local model through Ollama, or your own endpoint.
---

A task's agent is a choice. GurtOS runs the agent's own command inside the task, as the task's own Linux user, and
the rest stays the same for every agent: its own copy of the files, the host list, the action log, approvals and undo.

| Agent | `agent` | Model services it can use | Installed |
|---|---|---|---|
| Claude Code | `claude` | Anthropic, Ollama, your own endpoint (Anthropic format) | By GurtOS on first use, from npm (`@anthropic-ai/claude-code`) |
| Codex CLI | `codex` | OpenAI, Ollama, your own endpoint (OpenAI Responses format) | By GurtOS on first use, from npm (`@openai/codex`) |
| opencode | `opencode` | Anthropic, OpenAI, Ollama, your own endpoint (either format) | By GurtOS on first use, from npm (`opencode-ai`) |
| Droid | `droid` | Factory, Anthropic | By `core/setup.sh`, or by the image after its first start |

GurtOS pins one version of each agent (`core/workers/index.ts`) and installs it into `/var/lib/box/agents` the first
time a task asks for it. That first task waits, with "downloading" as its step, and then starts.

## The agent never holds your key

Whichever agent you pick, it gets a placeholder where a key would go, and the address of GurtOS's own proxy where
the model service's address would go. The proxy checks each model call, puts the key from the vault into the header,
and sends it on. So a web page that talks the agent into printing its environment gets a placeholder.

- The key is added in the box's own process, outside the task. Nothing about TLS is intercepted for these agents.
- Only model calls are passed on: `/v1/messages` and `/v1/models` for the Anthropic format, `/v1/responses`,
  `/v1/chat/completions` and `/v1/models` for the OpenAI format.
- A task can only use the model services its agent is listed with above.
- A model call that asks the service to search or fetch the web from its side (Anthropic's `web_search` and
  `web_fetch` tools, OpenAI's `web_search`) is refused and logged as `net.blocked`. Those requests would leave from
  the service, not from the task, so the task's host list could not hold them. One passes only when it names
  `allowed_domains` and the task may reach every one of them. The agents' own search tools are switched off for the
  same reason. Fetching a page from inside the task still works, for hosts on the task's list.

## Set up a model service

Do one of these. Keys go in **Settings, Agents & Models**, or through the API. They are write-only.

### Anthropic

```sh
curl -X PUT http://127.0.0.1:7700/api/vault/ANTHROPIC_API_KEY \
  -H 'content-type: application/json' -d '{"value":"<your key>"}'
```

An API key from console.anthropic.com. A Claude subscription login does not work here: there is no way to hand it to
a task without the task holding it.

### OpenAI

```sh
curl -X PUT http://127.0.0.1:7700/api/vault/OPENAI_API_KEY \
  -H 'content-type: application/json' -d '{"value":"<your key>"}'
```

### A local model through Ollama

Install Ollama on the same computer (or one on your network), pull a model, and tell GurtOS where it listens:

```sh
ollama pull qwen3
curl -X PATCH http://127.0.0.1:7700/api/settings \
  -H 'content-type: application/json' -d '{"ollamaHost":"http://127.0.0.1:11434"}'
```

There is no key. Tasks cannot reach Ollama's port themselves. They reach it only through the proxy, and only for
model calls, so a task cannot pull or delete models. Name the model on each task as `ollama/<model>`. A local model
is counted as costing nothing.

Agents send long prompts. Give the model a context window of at least 32,000 tokens (Ollama's `OLLAMA_CONTEXT_LENGTH`),
and pick one that can call tools.

### Your own endpoint

Any endpoint that speaks Anthropic's or OpenAI's format works: LiteLLM, a company gateway, a hosted provider.

```sh
curl -X PATCH http://127.0.0.1:7700/api/settings -H 'content-type: application/json' \
  -d '{"customBaseUrl":"https://gateway.example.com","customWire":"anthropic"}'
curl -X PUT http://127.0.0.1:7700/api/vault/CUSTOM_API_KEY \
  -H 'content-type: application/json' -d '{"value":"<its key>"}'
```

- `customBaseUrl` is the address without `/v1` at the end.
- `customWire` is `anthropic` (Claude Code, opencode) or `openai` (Codex, opencode). Codex speaks only the
  Responses API, so the endpoint must serve `/v1/responses`.
- The key is optional. When set, it is sent as both `x-api-key` and `Authorization: Bearer`.
- Name the model on each task as `custom/<model>`.

### Factory

`FACTORY_API_KEY` in the vault, for Droid. See [Vault keys](/docs/reference/vault-keys/).

## Pick the agent for a task

In the portal, **New task** has an **Agent** list and a **Model** field. Through the API:

```sh
curl -X POST http://127.0.0.1:7700/api/tasks -H 'content-type: application/json' -d '{
  "title": "Fix the typos",
  "prompt": "Fix the spelling mistakes in notes.md.",
  "agent": "claude",
  "model": "sonnet"
}'
```

`model` is optional. What it means:

| `model` | Runs on |
|---|---|
| left out | The agent's default on its first model service that is set up. Claude Code and opencode use `claude-sonnet-5-5`; Codex uses its own default. |
| `haiku`, `sonnet`, `opus` | That Claude model. |
| a full id, like `claude-opus-5-5` | That model, on the agent's first model service that is set up. |
| `ollama/qwen3` | The local model `qwen3`. |
| `custom/my-model` | `my-model` on your own endpoint. |
| `openai/<id>`, `anthropic/<id>` | That service, when the agent can use more than one. |

A model the agent cannot run is refused when the task is made, with the reason. Droid runs Claude models only.

## Set the default agent

A task that names no agent gets the box's default. On a new box that is `auto`: the first agent, in the order Droid,
Claude Code, Codex, opencode, that has a model service set up. To fix it:

```sh
curl -X PATCH http://127.0.0.1:7700/api/settings \
  -H 'content-type: application/json' -d '{"defaultAgent":"claude"}'
```

Or **Settings, Agents & Models, Default agent**. GurtOS Personal's "Ask an agent" window uses this default.

## What each agent is told

**Claude Code** runs as `claude -p --output-format stream-json --permission-mode bypassPermissions`. Its environment
has `ANTHROPIC_BASE_URL` (the proxy) and a placeholder `ANTHROPIC_API_KEY`. It reads settings only from the task
user's own `~/.claude/settings.json`, which GurtOS writes (`--setting-sources user`, `--strict-mcp-config`). A
`.claude/settings.json` or `.mcp.json` inside the folder it works on is not read, so a cloned repository cannot
point it at another address or add hooks. Its hooks report every tool result to the action log, and a risky shell
command (`rm -rf`, `git push`, `curl | sh` and the like) waits for your OK.

**Codex** runs as `codex exec --json --dangerously-bypass-approvals-and-sandbox`. GurtOS writes
`~/.codex/config.toml` with a model provider whose `base_url` is the proxy, `wire_api = "responses"` and
`web_search = "disabled"`. Codex reads its model provider only from that user file. Its own sandbox needs Linux
namespaces, which a task may not create, so it is off and the task's sandbox is the limit.

**opencode** runs as `opencode run --format json --auto`. Its settings go in `OPENCODE_CONFIG_CONTENT`, which wins
over an `opencode.json` in the folder it works on.

**Droid** works as before: see [The vault and the broker](/docs/concepts/vault-and-broker/).

Every agent gets the box's tools and `box_ask` as an MCP server named `box`, so a tool that spends money still goes
through the broker, your budget and your approval.

## What differs between agents

- **Asking before a command.** Claude Code and Droid ask you before a risky shell command. Codex and opencode do not
  ask before commands. For all four, the task's own user, its copy of the files and its host list are the limits,
  and box tools ask through the broker.
- **The second look.** Droid has a second model compare risky steps with the task's goal. The other agents do not yet.
- **Plan first and autonomy levels** (`droid: {plan, autonomy}`) are Droid's own options.
- **Cost.** Claude models are priced at Anthropic's list rates and Ollama at nothing. Any other model is counted at
  Sonnet's rates until its own are added to `core/pricing.ts`, so treat that number as a rough guide.

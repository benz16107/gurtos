---
title: Vault keys
description: Every key name the box and its apps read from the vault, which part reads it and what it is for, plus the vault file's format and permissions.
---

The vault holds every secret on the box. Tasks never see it: tools, model jobs, app routes and triggers read it inside the core, and only the keys they declare. For how this works, read [The vault and the broker](/docs/concepts/vault-and-broker/). To add a key, see [Add a secret](/docs/guides/add-a-secret/).

This page lists key names only. Never put a value in a document, a prompt or a log.

## The file

| | |
|---|---|
| Path | `/etc/box/vault.env`, or `BOX_VAULT` |
| Owner and mode | root, `0600`. On a GurtOS image `/etc/box` is `0700` too. If group or others have any access to the file, the box refuses to start. |
| Format | One `KEY=value` per line. Key names use capital letters, digits and `_`. The value is everything after the `=`, with no quotes removed. Other lines, comments included, are ignored. |
| When read | When the box service starts, and again for each key set through the API. A task that starts while the box has no model key reads the file again first. Restart `box.service` after editing the file by hand to change any other key. |

```sh title="/etc/box/vault.env"
ANTHROPIC_API_KEY=...
```

## Setting a key through the API

The owner can set a key without a shell: from the box itself, or from a phone paired as the owner. In the portal, Settings, Accounts & Keys lists the model keys, the keys of apps that are on, and any key already in the vault. App Center lists the keys an app needs before you turn it on.

| Request | Does |
|---|---|
| `PUT /api/vault/<NAME> {"value": "..."}` | Sets or replaces one key. The file is rewritten atomically and stays root-only `0600`. The value is one line, at most 8192 characters. |
| `GET /api/vault` | Lists the key names, with the time each was set through the API, or `null` for one put in the file by hand |

No route reads a value back. The action log records that a name was set, never the value. Names are capital letters, digits and `_`, 2 to 64 characters, starting with a letter.

A new `ANTHROPIC_API_KEY` is tried first with a free call to Anthropic. Anthropic refusing it (a 401 or 403) answers `400` and saves nothing. If Anthropic cannot be reached, the key is saved unchecked. A `FACTORY_API_KEY` cannot be checked until its first task.

```sh
read -rs -p 'Anthropic API key: ' KEY && echo
curl -s -X PUT http://127.0.0.1:7700/api/vault/ANTHROPIC_API_KEY \
  -H 'content-type: application/json' -d "{\"value\": \"$KEY\"}"
unset KEY
```

A part of the box can read a key only if it declares it: a tool or model job in its `secrets`, an app's routes and triggers in the app's `secrets`. Asking for any other name throws an error, and so does asking for a key the owner turned off for that app in Settings, Permissions.

Before an event reaches the action log, or a tool's result reaches a task, the box replaces any vault value of 8 or more characters with `[a vault key]`. This covers names ending in `KEY`, `TOKEN`, `SECRET`, `PASSWORD` or `ACCESS`. A value kept under another name, such as `FIND_OLLAMA_URL` or `ELASTIC_URL`, is not hidden.

## Model keys

A box needs one model service before an agent task can start: one of these keys, or a local model or your own endpoint (see [Choose your agent](/docs/guides/choose-your-agent/)). Without one, a Droid task fails at once with `No model key yet. Add an Anthropic or Factory API key in Settings, Accounts & Keys, then start the task again.`, and another agent's task with a sentence that names what it can use.

| Key | Read by | For |
|---|---|---|
| `ANTHROPIC_API_KEY` | The task proxy | Claude Code, opencode or Droid runs on your Anthropic account. Tasks hold a placeholder, and the proxy puts the real key on each request to `api.anthropic.com`. On this key the proxy refuses a call that asks Anthropic to fetch a page, an MCP server or a file by URL, and logs it as blocked. |
| `FACTORY_API_KEY` | The task proxy, and the `factory` app (to read usage limits) | Droid runs on Factory. Tasks hold a placeholder, and the proxy puts the real key on each request to Factory. The proxy relays only the Factory paths Droid uses (models, its settings and limits, session sync and telemetry) and refuses any other with a log line. It refuses a model call that asks Factory to fetch a page, an MCP server or a file by URL for the task, as it does for an Anthropic key. |
| `OPENAI_API_KEY` | The task proxy | Codex or opencode runs on your OpenAI account. Tried with a free call when saved, like an Anthropic key. The proxy refuses a call that asks OpenAI to search the web from its side. |
| `CUSTOM_API_KEY` | The task proxy | Optional. The key of your own model endpoint (the setting `customBaseUrl`), sent as `x-api-key` and `Authorization: Bearer`. |

One is enough. For Droid, if both its keys are in the vault, the box uses the Factory key.

## Other keys the core uses

| Key | Read by | For |
|---|---|---|
| `BOX_RELAY_SECRET` | Remote access | The box's secret with a relay. The box writes it when you turn remote access on and removes it when you turn it off. Do not set it by hand. |
| `SSO_<NAME>` | Single sign-on (GurtOS Business) | The client secret for the work-account provider. You choose the name, which must start with `SSO_`, and give it to the box as `sso.secretKey` when you turn single sign-on on. |

Quick Start can copy keys from one computer to a new one, only the keys the owner's approval names. It never offers a key whose name starts with `BOX_`.

## Apps

These apps need no account with another company. A first-time user can skip every table below.

| Key | App | Read by | For |
|---|---|---|---|
| `DEMO_SECRET` | `example` | `example.spend`, the app's routes | A stand-in key that shows the pattern |
| `GITHUB_TOKEN` | `factory` | `factory.openPullRequest`, the app's GitHub check | Reading issues and opening pull requests. Optional for a public repository. |
| `FACTORY_GITHUB_REPO` | `factory` | The app's GitHub check | The repository to watch, as `owner/name`. Optional. |

## Optional apps that need another service's account

Each app below stays off until the owner turns it on in App Center, and does nothing useful without the keys of the service it connects to. Several are test-only: they say so in the portal.

| Key | App | Read by | For |
|---|---|---|---|
| `ELASTIC_URL`, `ELASTIC_BOX_KEY` | `receipts` | The app's routes | Comparing the log with an Elastic copy. Optional. |
| `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY` | `find` | `find.search`, `find.recall`, `find.answer`, `find.answerFast`, the app's trigger | The Moss search index. Find searches by words without it. |
| `MOSS_INFERENCE_API_KEY`, `MOSS_INFERENCE_URL` | `find` | `find.answerFast` | Moss's hosted answers. Optional. |
| `FIND_OLLAMA_URL`, `FIND_OLLAMA_MODEL` | `find` | `find.describe`, `find.answer` | A machine of yours running Ollama, to describe photos and write answers. The model name is optional and defaults to `qwen3-vl:2b-instruct`. |
| `VULTR_INFERENCE_KEY` | `find` | `find.describe` | A hosted vision model. Optional. |


## Rules for app authors

- Declare each key on the tool or job that needs it, not on the app, unless a route or trigger needs it.
- Never return a key, put it in a log step, or hand it to a task. Return what you learned with it.
- Read keys when you need them, not at load time, so a missing key fails one call instead of the whole app.

## Related

- [The vault and the broker](/docs/concepts/vault-and-broker/)
- [Security model](/docs/security/model/)
- [Apps](/docs/reference/apps/)

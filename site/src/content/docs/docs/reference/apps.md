---
title: Apps
description: The apps in the GurtOS source tree, with the title and description each shows in App Center, what each adds, which need an outside account, and which are test only.
---

Each app is a folder under `tracks/` with a `track.ts`. The box reads every app at boot but turns on only the ones the owner has chosen. **A new box has only the model app, Claude (`anthropic`), on.** Every other app is off until the owner turns it on in App Center or through the API: `GET /api/apps?all=1` lists them all with what each can reach, and `POST /api/apps/<id>/enable` and `/disable` switch one without a reinstall (see [HTTP API](/docs/reference/http-api/#setup-settings-apps-and-the-vault)). An app can be turned on with vault keys missing. The parts that need a key report that it is missing. An app's page runs sandboxed in its window, with a token that reaches only that app's routes. To write your own app, see the [App SDK](/docs/reference/app-sdk/).

:::note[Test money]
App Center marks an app **Test only** when its title or description says it uses test money, test payments, test data, a sandbox or a devnet. The Example app carries that mark. Its `example.spend` moves no money at all.
:::

## Core apps

You need none of an outside service's accounts for these, apart from the model key. The title and description are what App Center shows.

| App | Title | Description |
|---|---|---|
| `anthropic` | Claude | The AI model every agent uses, through Factory's Droid. Needs an Anthropic or a Factory API key, which stays in the vault. |
| `factory` | Factory | Turns GitHub issues labelled droid into pull requests: Droid plans, you approve the plan, a reviewer droid checks the change. Needs a GitHub token and a repository name; a Factory key shows your plan usage. |
| `spacetime` | Live board | Shows tasks, requests and spending on every screen as they change, and lets agents share one work queue. Needs no account; an optional fleet view that sends task counts to SpacetimeDB Maincloud is off until you turn it on. |
| `attacks` | Attack tests | Runs known attacks on AI agents against this computer, like a poisoned package or a hijacked payment, and shows which ones GurtOS stopped. |
| `find` | Find | Search your files, past tasks and notes on this computer by their words, with no account. A photo is searchable once a vision model describes it (your own Ollama, or a Vultr or Factory key), and a Moss account adds search by meaning. |
| `example` | Example | A sample app for developers that shows every way an app can plug into GurtOS. It spends test money only. |

### `anthropic`

The model behind every agent task. The app has no tools, routes or window. The model choice, the prices and the second look at risky steps are in `core/`, and `tracks/anthropic/demo.ts` is the measured attack test. A task takes `haiku`, `sonnet` (the default, `claude-sonnet-5-5`), `opus` or a model id that starts with `claude-`. Setup asks for one key, an Anthropic key or a Factory key. With both, the box uses Factory's. The box's proxy puts the key on a model call on the way out, and a task never holds it. With a Factory key it relays only the Factory paths Droid calls (models, Droid's own settings and limits, its session copy and telemetry). Any other Factory path, such as running a Factory-hosted connector's tool, is refused with 403 and logged as `net.blocked`. A model call that asks the model service, Factory's or Anthropic's, to fetch a URL, an MCP server or a file for the task is refused the same way. `tracks/anthropic/install.sh` turns an Ubuntu 24.04 machine into a GurtOS box.

### `factory`

Coding jobs for Factory's Droid.

| Slot | What |
|---|---|
| Tools | `factory.openPullRequest {title, body}`: opens a pull request with the changes in the task's copy. Only a task started from a GitHub issue can use it. |
| Triggers | `github`: every 2 minutes (`FACTORY_GITHUB_EVERY_MS`) checks the repository for open issues labelled `droid` and starts a task for each new one |
| Routes | `GET /t/factory/`. `POST /t/factory/run`: a `droid exec` job on a copy of a repository or of the files you send. `GET /t/factory/github` and `POST /t/factory/github/check`. `GET /t/factory/usage`: each task's Factory credits and your plan's limits. |
| Portal | Factory |
| Vault keys | `GITHUB_TOKEN`, `FACTORY_GITHUB_REPO`, `FACTORY_API_KEY`, all optional |

### `spacetime`

Live state from the box's own SpacetimeDB, and a shared work queue for agents. It needs no account.

| Slot | What |
|---|---|
| Tools | `spacetime.post {queue, jobs}`: puts up to 200 jobs on a queue. `spacetime.claim`: takes the oldest open job in one step. `spacetime.finish {id, result, ok?}`: reports a claimed job. `spacetime.team {queue}`: who is working on a queue and what each agent is doing. |
| Triggers | `fleet`: the optional fleet view |
| Log readers | `jobs` |
| Routes | `GET /t/spacetime/` and `GET /t/spacetime/live.js`: the window. `GET /t/spacetime/team`, `GET /t/spacetime/snapshot`, `POST /t/spacetime/jobs`, `GET /t/spacetime/where`. `GET` and `PUT /t/spacetime/fleet`, and `POST /t/spacetime/fleet/viewers`: the owner turns the fleet view on and lets a viewer see it. |
| Portal | Live board |

The fleet view is off by default. When the owner turns it on, the box reports its id, name, edition, version, task counts, today's spending and whether it is online to a `gurtos-fleet` database on SpacetimeDB Maincloud that the GurtOS project runs. It sends no prompt, file, request text or key. `BOX_FLEET_DB` and `BOX_FLEET_URL` point it at a database of your own.

### `attacks`

Attacks on agents, run by `./demo`. The app has no tools, routes or window. Its step runs a poisoned package and a scoreboard of 16 OS-level attacks, of which 15 are caught and 1 is published as not covered. See [The test suite](/docs/reference/test-suite/#the-attack-tests).

### `find`

Searches files, photos, finished tasks and notes the owner chose to remember. Every key is optional: the word index runs with none.

| Slot | What |
|---|---|
| Tools | `find.search`: search, for tasks. `find.answer` and `find.answerFast`: a one or two sentence answer from the notes. `find.recall`: notes from earlier tasks. `find.remember`: saves a note. |
| Model jobs | `find.describe {file}`: describes one photo in a workspace. `find.preferences`: the owner's standing preferences as sentences. |
| Triggers | `index`: makes the `photos` workspace with test photos, then rescans every minute |
| Log readers | `tasks`: indexes tasks as they finish, fail or are undone |
| Routes | `GET /t/find/`, `GET /t/find/search?q=&kind=&k=`, `GET /t/find/file?workspace=&path=`, `GET /t/find/status`, `GET /t/find/answer`, and POST routes for `warm`, `describe`, `memory`, `trust`, `forget` and `inference` |
| Portal | Find |
| Vault keys | `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY`, `MOSS_INFERENCE_API_KEY`, `MOSS_INFERENCE_URL`, `VULTR_INFERENCE_KEY`, `FIND_OLLAMA_URL`, `FIND_OLLAMA_MODEL`, `FACTORY_API_KEY`, all optional |

Moss is not part of GurtOS. Its licence does not allow passing it on, so images and `core/install.sh` leave it out. On a box set up from source, the owner can install it by hand (`tracks/find/README.md` has the command). Without it, a box that has Moss keys logs "Moss is not installed on this computer" and keeps searching by words.

Find also gives each new task a few relevant notes from earlier tasks, through the app's `taskContext` hook. A model runs only when its key is set in the vault. Claude, through a Droid task, runs only when the owner presses **Describe with Claude** on the Find page. Photos stay on the box unless the owner sets a hosted model's key or presses that button. Any task given `find.search` can search every workspace, not only its own. The cloud copy of the index is off unless the box runs with `FIND_CLOUD_SYNC=1`. See [Search your files](/docs/guides/find/).

### `example`

The reference app. It uses every slot so you can copy the part you need. A GurtOS image does not load it; a source checkout does.

| Slot | What |
|---|---|
| Tools | `example.spend {cents, on}`: records a test spend. Costs `cents`, so it pauses over budget. No money moves. `example.record {subject, action}`: records a decision, and shows the `decides` hook for Business shadow mode. |
| Triggers | `webhook` named `start`, `onFileChange` on `BOX_HOME/inbox/example`, and an hourly `schedule` |
| Routes | `GET /t/example/`, `GET /t/example/whoami`, `GET /t/example/secret-check`, `GET /t/example/status` (open to a public proxy), `GET /t/example/approve` (keeps the box's own origin), `POST /t/example/start` |
| Log readers | `count`: counts finished tasks |
| Model jobs | `example.echo` |
| Portal | Example |
| Vault keys | `DEMO_SECRET` |

## Optional apps

These work with an outside service, and most need an account with it. A first-time user needs none of them. They are all off on a new box. The **Test only** column matches the badge in App Center.

| App | Title | Test only | Description |
|---|---|---|---|
| `receipts` | Receipts | | Makes a signed receipt for a finished task that anyone can check in a browser, with no account. With an Elastic account it also compares the log with Elastic's copy. |

### `receipts`

A signed receipt for a finished task that anyone can check in a browser, with no account. With an Elastic account (`ELASTIC_URL`, `ELASTIC_BOX_KEY`, both optional) it also compares the log with Elastic's copy.

| Slot | What |
|---|---|
| Routes | `GET /t/receipts/` and `GET /t/receipts/tasks`: the owner's window. `POST /t/receipts/share`: makes a receipt. `GET /t/receipts/r`, `GET /t/receipts/verify` and `GET /t/receipts/qrcode.js`: open routes, so a receipt can be read and checked without a token. |
| Portal | Receipts |

See [Verify a receipt](/docs/guides/verify-a-receipt/).

## Related

- [Vault keys](/docs/reference/vault-keys/)
- [Apps and slots](/docs/concepts/apps-and-slots/)

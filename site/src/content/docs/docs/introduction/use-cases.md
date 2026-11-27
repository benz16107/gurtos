---
title: Use cases by edition
description: Which GurtOS edition fits which job, from always-on coding agents on GurtOS Server to agents on your own folders with GurtOS Personal.
---

Every edition runs the same core: each task as its own Linux user, in its own copy of the files, without your keys,
with a budget, an action log and an undo. The editions differ in whose machine it is and how you watch it. This page
lists the jobs each one fits. See [Editions](/docs/introduction/editions/) for the full comparison.

## GurtOS Server: agents that work while you are away

An always-on box at home or in the cloud, with no desktop and no human login. You watch it from the portal on its
screen, a laptop or your phone. [Install GurtOS Server](/docs/get-started/install-server/).

| Job | How GurtOS Server does it |
|---|---|
| **Coding work with Droid** | Each task runs Factory's Droid with a Claude model in its own copy of a repository. You read its steps and its diff, then keep the change or undo that one task. See [Tasks](/docs/concepts/tasks/) and [Undo a task](/docs/guides/undo-a-task/). |
| **Watchers that never sleep** | Schedules, webhooks and new files start tasks with no one at the keyboard. See [Triggers](/docs/concepts/triggers/) and [Schedule a routine](/docs/guides/schedule-a-routine/). |
| **A box in the cloud** | The same ISO installs on a cloud instance that boots custom ISOs, such as Vultr's. Its firewall keeps the API off the public internet, and tasks resume after the instance restarts. See [Install GurtOS Server](/docs/get-started/install-server/#install-on-a-cloud-instance) and [Resume after power loss](/docs/concepts/resume-after-power-loss/). |

## GurtOS Personal: your own computer, with agents beside you

Ubuntu's GNOME desktop with your own account and `sudo`. Agents work as separate users without `sudo`, on copies of
your folders. [Install GurtOS Personal](/docs/get-started/install-personal/).

| Job | How GurtOS Personal does it |
|---|---|
| **Your own AI computer, on hardware you control** | Install it on a spare x86_64 laptop or desktop with 4 GB of memory and 29 GB of disk. Your files and model key stay on that machine. Approvals arrive as desktop notifications. |
| **Agents on copies of your folders** | Right-click a folder in Files and choose **New Agent Task…**. The agent works on a copy. Your folder changes only when you choose **Keep**, and **Undo task** puts it back later. See [Give an agent a folder, then keep or undo](/docs/guides/keep-or-undo/). |
| **Search your files and photos** | The Find app indexes the files and photos in GurtOS workspaces and your agents' task history. It matches words with no account, and searches by meaning once you add a Moss project's keys. A vision model you choose describes each photo once, on your own machine if you run Ollama there. Agents search it too, with no keys of their own. See [Search your files with Find](/docs/guides/find/). |

## GurtOS Business (preview): a company's agents

**Preview.** Business is turned on from a GurtOS Server or Personal box (see
[Turn on GurtOS Business](/docs/guides/turn-on-business/)). Roles, routed approvals and the audit work on one box with
sandbox data. Fleet management and production banking integrations are planned.

| Job | Status |
|---|---|
| **Agents in seats with roles** | Preview: people with roles that decide what each may start, approve and undo. A task can run in a named seat, such as a credit analyst or a collections clerk, with its own tools. |
| **Approvals routed by role and amount** | Preview: a policy in plain words, such as "Over $10,000 goes to the Controller", sends each approval to the person who may answer it. |
| **Separation of duties for finance work** | Preview: a seat is limited by the tools its task may call, and a request above a person's authority waits for a controller's OK. |

## Related

- [Editions](/docs/introduction/editions/)
- [What is GurtOS?](/docs/introduction/overview/)
- [Apps](/docs/reference/apps/)
- [Roadmap](/docs/project/roadmap/)

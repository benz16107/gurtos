---
title: Install on Ubuntu
description: Install GurtOS on an Ubuntu 24.04 machine or VM you already have with one command and no disk wipe, open the portal, add your model key, and remove it again.
---

The quickest way to run GurtOS is on an Ubuntu 24.04 machine you already have: a cloud server, a virtual machine
(Lima, UTM, Multipass, Parallels) or a spare computer. One command installs it. Nothing is erased, and you keep
Ubuntu's login, packages and updates. Tasks, the vault, approvals and the action log work the same as on the GurtOS
image.

```sh
curl -fsSL https://gurtos.com/install.sh | sh
```

You get the box service of GurtOS Server, and you open its screen, the portal, in a browser. The
[ISO](/docs/get-started/install-server/) adds the full-screen kiosk, whole-system updates with rollback and the
inbound firewall, and it takes the whole disk.

:::caution[Who gets the owner's rights]
The box runs as root. From the machine itself, root, the people in the `gurtos` group and every program they run
can use the portal and the API as the owner: set keys, approve spending, change settings. The installer puts you
in that group. Every other account on the machine needs a paired device's token, like a phone. A machine set aside
for GurtOS, or a VM, is still the safest place for a preview.
:::

## Requirements

- Ubuntu 24.04 with systemd, on x86_64 or arm64. Other systems are refused (Debian 12 may come later).
- An account with `sudo`, or root.
- 1 GB of memory for one task at a time (4 GB is comfortable; each task may use up to 2 GB), and 4 GB of free disk.
  The install adds about 1.5 GB ([measured](https://github.com/benz16107/gurtos/blob/main/tracks/anthropic/README.md)).
- Internet access during the install, for Node.js, Factory's Droid CLI (about 300 MB), SpacetimeDB, and the `frpc`
  and Caddy binaries that remote access uses.
- Free: TCP ports 7700 and 3000, and user ids 30000 to 39999. The installer checks both and stops if something else
  has them.
- One model key: an Anthropic API key from [console.anthropic.com](https://console.anthropic.com), or a Factory API
  key from [app.factory.ai](https://app.factory.ai). Tasks never see it.

## What it changes

Before it changes anything, the script prints this list for your machine and asks once (when it has a terminal):

| What | Where |
|---|---|
| Packages, with apt, if missing | `git rsync curl ca-certificates xz-utils acl python3 nftables ripgrep` |
| Node.js 24, only if you have no Node.js 22 or newer | `/usr/local/lib/gurtos-node`, linked from `/usr/local/bin` |
| Pinned binaries, each checked against a SHA-256 in the script | `droid`, `frpc`, `caddy` and `spacetime` in `/usr/local/bin` |
| The source and what runs | `/opt/gurtos` (a clone) and `/opt/box` |
| Data and keys | `/var/lib/box`, `/var/lib/spacetimedb`, and the vault `/etc/box/vault.env` (root only, mode `0600`) |
| Two services, started now and at every boot | `box.service` and `spacetimedb.service`, both as root |
| A group | `gurtos`, with you in it: its members use the portal on this machine as the owner |
| A firewall table | nftables `inet box`. It limits only GurtOS's own task users and leaves your rules alone |
| One user per task | `box-<id>`, user ids 30000 to 39999, removed when the task ends |
| Ports, on `127.0.0.1` only | 7700 (portal and API), 3000 (SpacetimeDB), 8800 to 8899 (task proxies) |

Nothing is opened to the network. No install script from the internet runs, other than this one.

## Install

```sh
curl -fsSL https://gurtos.com/install.sh | sh
```

Run it as yourself: it asks for your `sudo` password when it needs it. As root, or through `| sudo sh`, it works the
same. Options go after `sh -s --`:

- `--yes` skips the question, for scripts and agents (`curl -fsSL https://gurtos.com/install.sh | sh -s -- --yes`).
- `--uninstall` removes GurtOS (below).

Environment: `GURTOS_REF` picks another branch and `GURTOS_REPO` another repository to clone. `GURTOS_FORCE=1`
skips the Ubuntu, memory and disk checks. `ANTHROPIC_API_KEY` or `FACTORY_API_KEY`, if set, goes into the vault, but
a key on a command line stays in your shell history, so adding it in the portal is safer.

From a clone of the repository, `./install.sh` installs that clone instead of cloning to `/opt/gurtos`.

The first install takes a few minutes, most of it downloads. It ends like this:

```text
gurtos: done in 84 s. GurtOS is running as box.service.

Open the portal:
  on this machine:     http://127.0.0.1:7700/
  from your computer:  ssh -L 7700:127.0.0.1:7700 you@192.0.2.10
                       then open http://127.0.0.1:7700/ there
  It opens as the owner for root and for you (the gurtos group). Other accounts must pair a device.

Add a model key: an Anthropic API key (console.anthropic.com) or a Factory API key (app.factory.ai).
  in the portal:  the setup wizard's Model key step, or Settings, Accounts & Keys
  or here, in bash (the key is not echoed or saved in your history):
    read -rs -p 'Anthropic API key: ' k; echo; printf '{"value":"%s"}' "$k" | curl -s -X PUT http://127.0.0.1:7700/api/vault/ANTHROPIC_API_KEY -H 'content-type: application/json' -d @-; unset k
```

## Open the portal and add your key

On the machine itself, open `http://127.0.0.1:7700/` in a browser. From your own computer, forward the port over
SSH and open the same address there:

```sh
ssh -L 7700:127.0.0.1:7700 you@192.0.2.10
```

The forwarded connection belongs to your login on the machine, so the box treats it as its own screen if that login
is root or in the `gurtos` group. Do not forward the port for anyone else. To let another account in, run
`sudo usermod -aG gurtos <name>`; it works from that account's next connection, with no new login. Members of the
group can do everything the owner can, so add only people you would give the vault to.

The first time, the portal shows the same setup wizard as GurtOS Server (see
[First boot and pairing](/docs/get-started/first-boot/#setup-and-your-keys)). Its **Model key** step puts your key in
the vault. Later, it is in **Settings**, **Accounts & Keys**. The box checks an Anthropic key with Anthropic and
refuses one that Anthropic rejects. It never returns a key. You can also edit `/etc/box/vault.env` (`KEY=value`, one
per line) as root and run `sudo systemctl restart box.service`; the box refuses to start if anyone but root can read
that file. See [Add a secret to the vault](/docs/guides/add-a-secret/).

## Check it runs

```sh
systemctl is-active box.service spacetimedb.service
curl -s 127.0.0.1:7700/api/health
journalctl -u box.service -n 20 --no-pager
```

The log has a line that lists the apps that loaded, such as `box up: 0 tasks in the log, tracks: anthropic`. A new
box has only the model app on. An app that fails to load is skipped and logged there. Turn on more in App Center.
See [Apps](/docs/reference/apps/).

If the log says `WARNING: the firewall rule did not load`, nftables is missing or blocked. Fix that before you run
tasks: without the rule a task still reaches only this machine, but it can reach any service on `127.0.0.1`, and
nothing it is refused is logged.

:::caution
You can make the API listen on another address with `BOX_LISTEN` in the service's environment, for a phone on your
network or tailnet. Every request from outside the box then needs a paired device's token, and only the owner can
change settings or the vault. Open it only on a network you control, such as a VPN. See
[Approve from your phone](/docs/guides/approve-from-your-phone/) and the [threat model](/docs/security/threat-model/).
:::

## Update

Run the same command again. It says GurtOS is installed already, updates `/opt/gurtos`, copies the new version to
`/opt/box` and restarts the service. Your tasks, keys and settings stay, and tasks that were running resume from the
action log.

## Uninstall

```sh
curl -fsSL https://gurtos.com/install.sh | sh -s -- --uninstall
```

It lists what it removes and asks you to type `yes`. With no terminal, add `--yes`. It stops and removes both
services and the tasks they started, this box's task users and their mounts, the `inet box` firewall table, the
`gurtos` group, and deletes `/opt/box`, `/opt/gurtos`, `/etc/box`, `/var/lib/box`, `/var/lib/spacetimedb`, Node.js
in `/usr/local/lib/gurtos-node` with its links, and `droid`, `frpc`, `caddy` and `spacetime` in `/usr/local/bin`.

The action log, every workspace and the vault go with it and cannot be brought back. It keeps the packages it
installed with apt, a Node.js that was there before, and your own files.

## Next

[Your first task](/docs/get-started/first-task/).

## Related

- [Install GurtOS Server from the ISO](/docs/get-started/install-server/)
- [Reach your box from anywhere](/docs/guides/reach-your-box-from-anywhere/)
- [Files and paths](/docs/reference/files-and-paths/)
- [Environment variables](/docs/reference/environment/)
- [Security model](/docs/security/model/)

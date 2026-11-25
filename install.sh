#!/bin/sh
# Install GurtOS on an Ubuntu 24.04 machine you already have: a cloud server, a VM (Lima, UTM, Multipass) or a spare
# computer. It does not touch the disk layout, your users, your files or your own firewall rules.
#   curl -fsSL https://gurtos.com/install.sh | sh                      install, or update an install
#   curl -fsSL https://gurtos.com/install.sh | sh -s -- --uninstall    remove everything it added
#   ./install.sh [--uninstall]                                         the same, from a clone: installs that clone
# Options: --yes answers yes to the question before it changes anything (needed for --uninstall with no terminal).
# Environment: GURTOS_REPO and GURTOS_REF pick another repository or branch to clone. ANTHROPIC_API_KEY or
# FACTORY_API_KEY, if set, goes into the vault so the first task can run (adding it in the portal is safer: a key on
# a command line stays in your shell history). GURTOS_FORCE=1 skips the Ubuntu, memory and disk checks.
# The whole script is one function, so a download cut off halfway runs nothing.
set -eu

say() { printf 'gurtos: %s\n' "$*"; }
die() { printf 'gurtos: %s\n' "$*" >&2; exit 1; }
# A question needs a terminal. Piped into sh, stdin is this script, so it reads from /dev/tty when there is one.
tty_ok() { (exec </dev/tty) 2>/dev/null; }

main() {
  uninstall='' yes=''
  for a in "$@"; do
    case $a in
      --uninstall) uninstall=1 ;;
      --yes | -y) yes=1 ;;
      -h | --help) sed -n '2,12p' "$0" 2>/dev/null || say 'see https://gurtos.com/docs/get-started/install-on-ubuntu/'; exit 0 ;;
      *) die "unknown option $a (try --uninstall or --yes)" ;;
    esac
  done

  SUDO=''
  if [ "$(id -u)" != 0 ]; then
    command -v sudo >/dev/null || die "run this as root: it installs a system service, and this machine has no sudo."
    SUDO=sudo
  fi
  # The person to add to the gurtos group: you, also when you ran it with sudo. Root needs no group.
  person=$(id -un)
  [ "$person" != root ] || person=${SUDO_USER:-root}

  # From a clone (./install.sh) it installs that clone. Piped into sh it clones the repository to /opt/gurtos.
  src=/opt/gurtos
  case $0 in */install.sh | install.sh) [ -f "$(dirname "$0")/core/install.sh" ] && src=$(cd "$(dirname "$0")" && pwd) ;; esac

  if [ -n "$uninstall" ]; then remove; else install; fi
}

check_machine() {
  [ -z "${GURTOS_FORCE:-}" ] || return 0
  # shellcheck disable=SC1091
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || die "GurtOS installs on Ubuntu 24.04 only, and this is ${PRETTY_NAME:-another system}."
  case $(uname -m) in x86_64 | aarch64) ;; *) die "GurtOS needs an x86_64 or arm64 processor, and this one is $(uname -m)." ;; esac
  [ -d /run/systemd/system ] || die "GurtOS needs systemd running, and this system has none (a container, or WSL without systemd)."
  mem=$(awk '/^MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
  disk=$(df -Pm / | awk 'NR == 2 { print $4 }')
  [ "$mem" -ge 900 ] || die "this machine has ${mem} MB of memory, and a task needs about 1 GB. GURTOS_FORCE=1 installs anyway."
  [ "$disk" -ge 4000 ] || die "this machine has ${disk} MB free on /, and the install needs about 4 GB."
  # What GurtOS takes for itself. Something else already there would break it, so stop before changing anything.
  for p in 7700:box 3000:spacetimedb; do
    systemctl is-active -q "${p#*:}.service" && continue # an earlier install: this run updates it
    [ -z "$(ss -Hltn "sport = :${p%%:*}" 2>/dev/null)" ] || die "something on this machine already listens on port ${p%%:*}, which GurtOS needs. Stop it, or install GurtOS on another machine."
  done
  taken=$(awk -F: '$3 >= 30000 && $3 <= 39999 && $1 !~ /^box-/ { print $1 }' /etc/passwd | head -3 | paste -sd, -)
  [ -z "$taken" ] || die "the accounts $taken use user ids 30000 to 39999, which GurtOS keeps for its task users."
  if [ "$src" = /opt/gurtos ] && [ -e /opt/gurtos ] && [ ! -d /opt/gurtos/.git ]; then
    die "/opt/gurtos exists and is not a GurtOS checkout. Move it away and run this again."
  fi
}

install() {
  check_machine
  start=$(date +%s)
  again=''
  [ ! -f /etc/systemd/system/box.service ] || again=1
  packages=$(for p in git rsync curl ca-certificates xz-utils acl python3 nftables ripgrep; do dpkg -s "$p" >/dev/null 2>&1 || printf '%s ' "$p"; done)
  packages=${packages% }
  node_now=$(command -v node >/dev/null && node -p 'process.versions.node.split(".")[0] >= 22 ? process.version : ""' 2>/dev/null || true)

  if [ -n "$again" ]; then say "GurtOS is installed here already. This updates it and keeps your tasks, keys and settings. It will:"; else say "This installs GurtOS on this machine. It will:"; fi
  echo "  - install packages with apt: ${packages:-none, they are all here}"
  if [ -n "$node_now" ]; then echo "  - use the Node.js $node_now already here"; else echo "  - put Node.js 24 in /usr/local/lib/gurtos-node, with node, npm and npx linked in /usr/local/bin"; fi
  echo "  - put droid, frpc, caddy and spacetime in /usr/local/bin (pinned versions, checked by SHA-256)"
  if [ "$src" = /opt/gurtos ]; then echo "  - clone GurtOS to /opt/gurtos and copy what runs to /opt/box"; else echo "  - copy what runs from $src to /opt/box"; fi
  echo "  - keep its data in /var/lib/box and /var/lib/spacetimedb, and its keys in /etc/box/vault.env (root only)"
  echo "  - add and start two services, box.service and spacetimedb.service (root), also at every boot"
  echo "  - add the group gurtos and put $person in it: members use the portal on this machine as the owner"
  echo "  - add a firewall table, nftables \"inet box\", that limits only GurtOS's own task users"
  echo "  - make one user per task (box-<id>, user ids 30000 to 39999), removed when the task ends"
  echo "  - listen on 127.0.0.1 only: port 7700 (portal and API), 3000 (SpacetimeDB) and 8800 to 8899 (task proxies)."
  echo "    Nothing is opened to the network."
  echo "  Undo all of it with:  curl -fsSL https://gurtos.com/install.sh | sh -s -- --uninstall"
  if [ -z "$yes" ] && tty_ok; then
    printf 'Continue? [Y/n] ' >/dev/tty
    read -r answer </dev/tty || answer=n
    case $answer in '' | y | Y | yes | Yes) ;; *) say "nothing changed."; exit 0 ;; esac
  fi

  if [ -n "$packages" ]; then
    say "installing $packages"
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq
    # shellcheck disable=SC2086
    $SUDO env DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 apt-get install -y -qq $packages >/dev/null
  fi

  if [ "$src" = /opt/gurtos ]; then
    repo=${GURTOS_REPO:-https://github.com/benz16107/gurtos}
    ref=${GURTOS_REF:-main}
    if [ -d /opt/gurtos/.git ]; then
      say "updating /opt/gurtos to $ref"
      $SUDO git -C /opt/gurtos fetch -q --depth 1 origin "$ref"
      $SUDO git -C /opt/gurtos checkout -q --force FETCH_HEAD
    else
      say "cloning $repo ($ref) to /opt/gurtos"
      $SUDO git clone -q --depth 1 --branch "$ref" "$repo" /opt/gurtos
    fi
  fi

  say "installing the box service (Node, Droid, SpacetimeDB; a few minutes the first time)"
  $SUDO "$src/core/install.sh" >/dev/null
  [ "$person" = root ] || $SUDO usermod -aG gurtos "$person"

  vault=/etc/box/vault.env
  for key in ANTHROPIC_API_KEY FACTORY_API_KEY; do
    value=$(printenv "$key" || true)
    if [ -n "$value" ] && ! $SUDO grep -q "^$key=" "$vault"; then
      printf '%s=%s\n' "$key" "$value" | $SUDO tee -a "$vault" >/dev/null # on stdin, so the key is never in a process list
      $SUDO systemctl restart box.service
      say "put $key in the vault ($vault, root only)"
    fi
  done

  up=''
  for _ in $(seq 1 30); do
    if curl -fsS -m 2 http://127.0.0.1:7700/api/health >/dev/null 2>&1; then up=1; break; fi
    sleep 1
  done
  [ -n "$up" ] || die "the box service did not answer on 127.0.0.1:7700. See why with:  sudo journalctl -u box.service -n 50"

  addr=$(hostname -I 2>/dev/null | awk '{ print $1 }')
  echo
  say "done in $(($(date +%s) - start)) s. GurtOS is running as box.service."
  echo
  echo "Open the portal:"
  echo "  on this machine:     http://127.0.0.1:7700/"
  echo "  from your computer:  ssh -L 7700:127.0.0.1:7700 $person@${addr:-<this machine>}"
  echo "                       then open http://127.0.0.1:7700/ there"
  if [ "$person" = root ]; then
    echo "  It opens as the owner for root. To let another account in, run:  sudo usermod -aG gurtos <account>"
  else
    echo "  It opens as the owner for root and for $person (the gurtos group). Other accounts must pair a device."
  fi
  echo
  # Some agent can run: a model key, Ollama or the owner's own endpoint is set up (Settings, Agents & Models).
  if $SUDO curl -fsS -m 5 http://127.0.0.1:7700/api/setup 2>/dev/null | grep -q '"ready":true'; then
    echo "It has a model service set up. Start your first task in the portal."
  else
    echo "Add a model key: an Anthropic API key (console.anthropic.com) or a Factory API key (app.factory.ai)."
    echo "  in the portal:  the setup wizard's Model key step, or Settings, Agents & Models, which also"
    echo "                  takes an OpenAI key, a local model through Ollama or your own endpoint"
    echo "  or here, in bash (the key is not echoed or saved in your history):"
    echo "    read -rs -p 'Anthropic API key: ' k; echo; printf '{\"value\":\"%s\"}' \"\$k\" | curl -s -X PUT http://127.0.0.1:7700/api/vault/ANTHROPIC_API_KEY -H 'content-type: application/json' -d @-; unset k"
  fi
}

remove() {
  [ -f /etc/systemd/system/box.service ] || [ -d /opt/box ] || [ -d /var/lib/box ] || { say "GurtOS is not installed here. Nothing to remove."; exit 0; }
  say "This removes GurtOS from this machine. It will:"
  echo "  - stop and remove box.service and spacetimedb.service, and every task they started"
  echo "  - remove the task users (box-<id>) of this box, the firewall table \"inet box\" and the group gurtos"
  echo "  - delete /var/lib/box (the action log and every workspace), /etc/box (the vault and its keys)"
  echo "    and /var/lib/spacetimedb"
  echo "  - delete /opt/box, /opt/gurtos, Node.js in /usr/local/lib/gurtos-node and its links,"
  echo "    and droid, frpc, caddy and spacetime in /usr/local/bin"
  echo "  It keeps the packages it installed with apt, a Node.js that was here before, and your own files."
  if [ -z "$yes" ]; then
    tty_ok || die "run it with --yes to remove GurtOS without a question."
    printf 'Your tasks, workspaces and keys cannot be brought back. Type yes to remove GurtOS: ' >/dev/tty
    read -r answer </dev/tty || answer=''
    [ "$answer" = yes ] || { say "nothing changed."; exit 0; }
  fi
  $SUDO sh -eu <<'ROOT'
home=/var/lib/box
# This box's tasks only: other boxes on the machine (a test VM's demo runs) keep theirs.
ids=$(ls "$home/tasks" 2>/dev/null || true)
for id in $ids; do systemctl stop "box-task-$id" >/dev/null 2>&1 || true; done
systemctl disable --now box.service spacetimedb.service >/dev/null 2>&1 || true
systemctl stop box-tunnel box-tls >/dev/null 2>&1 || true # remote access, if it was on
for id in $ids; do pkill -KILL -u "box-$id" 2>/dev/null || true; done
grep -o " $home/[^ ]*" /proc/mounts | sort -r | xargs -r -n1 umount -l || true
for id in $ids; do userdel "box-$id" 2>/dev/null || true; done
nft delete table inet box 2>/dev/null || true
rm -rf /etc/systemd/system/box.service /etc/systemd/system/box.service.d /etc/systemd/system/spacetimedb.service
systemctl daemon-reload
rm -rf "$home" /etc/box /var/lib/spacetimedb /opt/box /opt/gurtos /run/box
rm -rf /usr/local/bin/droid /usr/local/bin/frpc /usr/local/bin/caddy /usr/local/bin/spacetime \
  /root/.local/bin/spacetime /root/.local/share/spacetime /root/.config/spacetime
for f in /usr/local/bin/*; do
  case $(readlink "$f" 2>/dev/null) in /usr/local/lib/gurtos-node/*) rm -f "$f" ;; esac
done
rm -rf /usr/local/lib/gurtos-node
groupdel gurtos 2>/dev/null || true
ROOT
  say "GurtOS is removed."
}

main "$@"

#!/usr/bin/env bash
# Installs Jig UI for a person without Node.js, with one line in Git Bash on Windows or a terminal on
# macOS and Linux:
#
#   curl -fsSL https://github.com/fapost-lab/jig-ui/releases/latest/download/install.sh | bash
#
# A Node.js 24 or later already on the machine is used. Otherwise the official Node.js 24 from
# nodejs.org, checked against nodejs.org's SHA-256 sums, goes into Jig UI's own folder: no system
# install, no administrator. Then a `jig-ui` command that runs `npx @fapost/jig-ui` with that Node.js
# is written, and started with this script's arguments (`… | bash -s -- --no-open`). Running the line
# again updates Node.js. Nothing else is written: no shell profile, no system setting.
#
# NODEJS_ORG_MIRROR, as nvm and node-gyp read it, names another copy of https://nodejs.org/dist.

set -euo pipefail

# The oldest Node.js Jig UI runs on: MINIMUM_NODE_MAJOR in server/node-version.ts, kept equal by a test.
MINIMUM_NODE_MAJOR=24
MARK="# Written by Jig UI's install.sh"
MANUAL="Install Node.js $MINIMUM_NODE_MAJOR or later from https://nodejs.org, then run: npx @fapost/jig-ui"

say() { printf 'jig-ui: %s\n' "$*" >&2; }
fail() {
  say "$*"
  exit 1
}

# The archive nodejs.org publishes for this machine, by the suffix after `node-v<version>-`.
archive() {
  case "$(uname -s)" in
    MINGW64*-ARM64 | MSYS*-ARM64) echo win-arm64.zip ;; # Git Bash runs emulated there: `uname -m` says x86_64
    MINGW64* | MSYS*) echo win-x64.zip ;;
    Darwin)
      # A shell under Rosetta says x86_64 on an Apple chip.
      if [ "$(uname -m)" = arm64 ] || [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then
        echo darwin-arm64.tar.gz
      else
        echo darwin-x64.tar.gz
      fi
      ;;
    Linux)
      case "$(uname -m)" in
        x86_64) echo linux-x64.tar.gz ;;
        aarch64 | arm64) echo linux-arm64.tar.gz ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

windows() { case "$(uname -s)" in MINGW* | MSYS*) return 0 ;; *) return 1 ;; esac }

# Single-quoted for /bin/sh, a quote inside closed and reopened.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

fetch() { curl -fsSL --proto-redir =https "$1" -o "$2"; }

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

# Node.js on PATH that Jig UI runs on, with its npx.
system_node() {
  command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1 || return 1
  local major
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
  [ "$major" -ge "$MINIMUM_NODE_MAJOR" ] 2>/dev/null
}

unpack() {
  local file=$1 into=$2
  mkdir -p "$into"
  case "$file" in
    *.zip)
      if command -v unzip >/dev/null 2>&1; then
        unzip -q "$file" -d "$into"
      elif windows && [ -x "$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")/System32/tar.exe" ]; then
        # Windows' own tar reads zip; Git Bash's GNU tar does not.
        "$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")/System32/tar.exe" -xf "$(cygpath -w "$file")" -C "$(cygpath -w "$into")"
      else
        fail "nothing here unpacks a .zip (unzip, or Windows' tar.exe). $MANUAL"
      fi
      ;;
    *) tar -xzf "$file" -C "$into" ;;
  esac
}

main() {
  local suffix data bin launcher run what
  suffix=$(archive) || fail "no Node.js is published for $(uname -s) $(uname -m). $MANUAL"
  command -v curl >/dev/null 2>&1 || fail "curl is not here. $MANUAL"
  if windows; then
    [ -n "${LOCALAPPDATA:-}" ] || fail "LOCALAPPDATA is not set. $MANUAL"
    data="$(cygpath -u "$LOCALAPPDATA")/jig-ui"
    bin="$HOME/bin"
  else
    data="${XDG_DATA_HOME:-$HOME/.local/share}/jig-ui"
    bin="$HOME/.local/bin"
  fi
  launcher="$bin/jig-ui"

  # Never over a command of somebody else's, and before anything is downloaded.
  if [ -e "$launcher" ]; then
    case "$(sed -n 2p "$launcher" 2>/dev/null)" in
      "$MARK"*) ;;
      *) fail "$launcher is not one this installer wrote; move it away and run the line again." ;;
    esac
  fi

  if system_node; then
    what="the Node.js $(node --version) on this machine"
    run="exec npx --yes @fapost/jig-ui \"\$@\""
  else
    local dist sums line sum file version node npx tmp top ran
    dist="${NODEJS_ORG_MIRROR:-https://nodejs.org/dist}"
    mkdir -p "$data"
    tmp=$(mktemp -d "$data/.install.XXXXXX")
    trap 'rm -rf "$tmp"' EXIT

    sums="$tmp/SHASUMS256.txt"
    fetch "$dist/latest-v$MINIMUM_NODE_MAJOR.x/SHASUMS256.txt" "$sums" || fail "could not read Node.js's sums from $dist. $MANUAL"
    line=$(grep -E "^[0-9a-f]{64}  node-v[0-9]+\.[0-9]+\.[0-9]+-$suffix\$" "$sums" | head -n 1) || true
    [ -n "$line" ] || fail "$dist lists no node-*-$suffix. $MANUAL"
    sum=${line%% *}
    file=${line##* }
    version=${file#node-}
    version=${version%%-*}

    if windows; then node="$data/node"; else node="$data/node/bin"; fi
    if [ "$("$node/node" --version 2>/dev/null || true)" = "$version" ]; then
      say "Node.js $version is already in $data/node."
    else
      say "downloading Node.js $version ($file)…"
      fetch "$dist/$version/$file" "$tmp/$file" || fail "could not download $dist/$version/$file. $MANUAL"
      [ "$(sha256 "$tmp/$file")" = "$sum" ] || fail "$file does not match nodejs.org's SHA-256 sum; nothing was installed."
      unpack "$tmp/$file" "$tmp/unpacked"
      top="$tmp/unpacked/${file%.*}"
      top=${top%.tar}
      [ -d "$top" ] || fail "$file did not hold the folder it should; nothing was installed."
      # Node.js 24 needs macOS 13.5 or glibc 2.28: one that does not start here replaces nothing.
      if windows; then ran=$("$top/node" --version 2>/dev/null || true); else ran=$("$top/bin/node" --version 2>/dev/null || true); fi
      [ "$ran" = "$version" ] || fail "Node.js $version does not run on this system; nothing was installed. $MANUAL"
      if [ -e "$data/node" ]; then
        mv "$data/node" "$tmp/old" || fail "$data/node is in use — stop Jig UI (Ctrl+C) and run the line again."
      fi
      if ! mv "$top" "$data/node"; then
        [ -e "$tmp/old" ] && mv "$tmp/old" "$data/node"
        fail "could not put Node.js $version in $data/node; the one there is kept."
      fi
      say "Node.js $version is in $data/node."
    fi
    rm -rf "$tmp"
    trap - EXIT

    if windows; then npx="$data/node/node_modules/npm/bin/npx-cli.js"; else npx="$data/node/lib/node_modules/npm/bin/npx-cli.js"; fi
    what="the Node.js in $data/node"
    # Node first on PATH: the package's command starts through `env node`, or a .cmd that calls `node`.
    # No notice to update npm: it would update the npm inside this folder, which the next install replaces.
    run="PATH=$(quote "$node"):\"\$PATH\" npm_config_update_notifier=false exec $(quote "$node/node") $(quote "$npx") --yes @fapost/jig-ui \"\$@\""
  fi

  mkdir -p "$bin"
  printf '#!/bin/sh\n%s: starts Jig UI with %s. Run the install line again to update it.\n%s\n' "$MARK" "$what" "$run" >"$launcher.new"
  chmod +x "$launcher.new"
  mv "$launcher.new" "$launcher"
  say "the jig-ui command is $launcher."
  case ":$PATH:" in
    *":$bin:"*) ;;
    *) say "$bin is not on your PATH: start Jig UI with $launcher." ;;
  esac
  exec "$launcher" "$@"
}

main "$@"

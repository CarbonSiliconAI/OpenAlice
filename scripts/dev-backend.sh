#!/usr/bin/env bash
# scripts/dev-backend.sh — OpenAlice backend lifecycle manager.
#
# Commands:
#   start     fork `pnpm dev`, wait for port, record pid
#   stop      SIGTERM the whole tree, SIGKILL survivors after 5s, verify port
#   restart   stop + start
#   status    pidfile + process + port + uptime + RSS + last 5 log lines
#   logs      tail -f the log (or `logs -n 100` for a fixed tail, no follow)
#
# State:
#   ~/.openalice-backend.pid     (outside repo to keep git clean)
#   ~/.openalice-backend.log     (rotated to .log.1 when > 50 MB)
#
# Port is read from data/config/connectors.json's web.port (default 3002).
# To run on a different port for tests, edit that file.

set -euo pipefail

PIDFILE="${HOME}/.openalice-backend.pid"
LOGFILE="${HOME}/.openalice-backend.log"
LOG_ROT="${HOME}/.openalice-backend.log.1"
MAX_LOG_BYTES=$((50 * 1024 * 1024))
START_TIMEOUT=30

# ==================== repo sanity ====================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$REPO_ROOT/package.json" ]]; then
  echo "error: package.json not found at $REPO_ROOT — not the OpenAlice repo?" >&2
  exit 2
fi

if ! grep -q '"name":[[:space:]]*"open-alice"' "$REPO_ROOT/package.json"; then
  echo "error: $REPO_ROOT/package.json is not OpenAlice (name != 'open-alice')" >&2
  exit 2
fi

cd "$REPO_ROOT"

get_port() {
  local cfg="$REPO_ROOT/data/config/connectors.json"
  if [[ -f "$cfg" ]]; then
    python3 -c "
import json, sys
try:
    d = json.load(open('$cfg'))
    print(d.get('web', {}).get('port', 3002))
except Exception:
    print(3002)
" 2>/dev/null || echo 3002
  else
    echo 3002
  fi
}

PORT="$(get_port)"

# ==================== helpers ====================

is_alive() {
  [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null
}

pid_cmdline() {
  ps -p "$1" -o command= 2>/dev/null | head -1 || true
}

# Is this pid one we'd manage? Conservative allowlist of command-line patterns.
is_ours() {
  local cmd
  cmd="$(pid_cmdline "${1:-0}")"
  [[ -z "$cmd" ]] && return 1
  [[ "$cmd" == *"pnpm dev"* ]] && return 0
  [[ "$cmd" == *"tsx watch"* ]] && return 0
  [[ "$cmd" == *"tsx/dist/cli"* ]] && return 0
  return 1
}

port_pid() {
  lsof -iTCP:"$PORT" -sTCP:LISTEN -P -n -t 2>/dev/null | head -1 || true
}

# Post-order traversal: leaves first, then parent. Safer for SIGTERM.
collect_tree() {
  local pid="$1"
  is_alive "$pid" || return 0
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    collect_tree "$child"
  done
  echo "$pid"
}

is_descendant() {
  # $1 candidate pid, $2 root pid
  # Use a here-string (not a pipe) so grep's -q early-exit doesn't SIGPIPE
  # collect_tree and trip pipefail.
  local cand="$1" root="$2"
  local tree
  tree="$(collect_tree "$root")"
  grep -qxF "$cand" <<< "$tree"
}

kill_tree() {
  local root="$1"
  local pids
  pids="$(collect_tree "$root")"
  [[ -z "$pids" ]] && return 0

  # Filter: only pids whose cmdline matches our allowlist.
  local safe=()
  local p
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    if is_ours "$p"; then
      safe+=("$p")
    fi
  done <<< "$pids"

  (( ${#safe[@]} == 0 )) && return 0

  # Phase 1: SIGTERM
  for p in "${safe[@]}"; do
    kill -TERM "$p" 2>/dev/null || true
  done

  # Wait up to 5s (10 × 0.5s)
  local i
  for i in $(seq 1 10); do
    local any_alive=0
    for p in "${safe[@]}"; do
      is_alive "$p" && any_alive=1
    done
    [[ "$any_alive" -eq 0 ]] && return 0
    sleep 0.5
  done

  # Phase 2: SIGKILL survivors
  for p in "${safe[@]}"; do
    is_alive "$p" && kill -KILL "$p" 2>/dev/null || true
  done
  return 0
}

file_size() {
  # macOS uses -f%z, Linux -c%s
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0
}

rotate_log_if_needed() {
  [[ ! -f "$LOGFILE" ]] && return 0
  local sz
  sz="$(file_size "$LOGFILE")"
  if (( sz > MAX_LOG_BYTES )); then
    mv "$LOGFILE" "$LOG_ROT"
  fi
}

# ==================== commands ====================

cmd_start() {
  rotate_log_if_needed

  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE")"
    if is_alive "$pid" && is_ours "$pid"; then
      local occupant; occupant="$(port_pid)"
      if [[ -z "$occupant" ]] || [[ "$occupant" == "$pid" ]] || is_descendant "$occupant" "$pid"; then
        echo "already running (pid $pid, port $PORT)"
        return 0
      fi
    fi
    rm -f "$PIDFILE"
  fi

  local occupant; occupant="$(port_pid)"
  if [[ -n "$occupant" ]]; then
    echo "error: port $PORT occupied by pid $occupant (not ours, no pidfile)" >&2
    echo "  cmd: $(pid_cmdline "$occupant")" >&2
    echo "  refusing to start. Free the port manually or use 'stop' if it is ours." >&2
    return 1
  fi

  echo "starting backend on port $PORT (log: $LOGFILE)"
  nohup pnpm dev >> "$LOGFILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PIDFILE"

  # Wait for port to open within our tree
  local i
  for i in $(seq 1 "$START_TIMEOUT"); do
    if ! is_alive "$pid"; then
      echo "error: backend (pid $pid) died within ${i}s. Last log:" >&2
      tail -n 30 "$LOGFILE" >&2 || true
      rm -f "$PIDFILE"
      return 1
    fi
    local listener; listener="$(port_pid)"
    if [[ -n "$listener" ]]; then
      if is_descendant "$listener" "$pid"; then
        echo "ready: backend root pid $pid, listener pid $listener, port $PORT"
        return 0
      fi
    fi
    sleep 1
  done

  echo "error: backend did not open port $PORT within ${START_TIMEOUT}s. Last log:" >&2
  tail -n 30 "$LOGFILE" >&2 || true
  return 1
}

cmd_stop() {
  if [[ ! -f "$PIDFILE" ]]; then
    local occupant; occupant="$(port_pid)"
    if [[ -n "$occupant" ]] && is_ours "$occupant"; then
      echo "no pidfile, but port $PORT held by pid $occupant (cmd looks like ours)"
      echo "  cmd: $(pid_cmdline "$occupant")"
      echo "  not killing without a pidfile — kill manually if you're sure"
      return 1
    fi
    echo "not running (no pidfile, port $PORT free)"
    return 0
  fi

  local pid
  pid="$(cat "$PIDFILE")"
  if ! is_alive "$pid"; then
    echo "stale pidfile (pid $pid not alive), cleaning up"
    rm -f "$PIDFILE"
    return 0
  fi

  echo "stopping backend tree rooted at pid $pid..."
  kill_tree "$pid"

  local occupant; occupant="$(port_pid)"
  if [[ -n "$occupant" ]]; then
    echo "warning: port $PORT still held by pid $occupant after stop" >&2
    echo "  cmd: $(pid_cmdline "$occupant")" >&2
    return 1
  fi
  rm -f "$PIDFILE"
  echo "stopped"
}

cmd_restart() {
  cmd_stop || true
  sleep 1
  cmd_start
}

cmd_status() {
  local running=0
  echo "repo:        $REPO_ROOT"
  echo "port:        $PORT  (from data/config/connectors.json)"
  echo "pidfile:     $PIDFILE"
  echo "logfile:     $LOGFILE"
  echo

  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE")"
    echo "pidfile:     present (pid $pid)"
    if is_alive "$pid"; then
      if is_ours "$pid"; then
        local uptime rss
        uptime="$(ps -p "$pid" -o etime= 2>/dev/null | awk '{$1=$1;print}')"
        rss="$(ps -p "$pid" -o rss= 2>/dev/null | awk '{printf "%.1f MB", $1/1024}')"
        echo "process:     ALIVE (ours)"
        echo "cmdline:     $(pid_cmdline "$pid")"
        echo "uptime:      ${uptime:-unknown}"
        echo "RSS:         ${rss:-unknown}"
        running=1
      else
        echo "process:     ALIVE but cmdline does not match ours:"
        echo "             $(pid_cmdline "$pid")"
      fi
    else
      echo "process:     DEAD (stale pidfile)"
    fi
  else
    echo "pidfile:     absent"
  fi

  echo
  local occupant; occupant="$(port_pid)"
  if [[ -n "$occupant" ]]; then
    echo "port $PORT:  LISTENING (pid $occupant)"
    echo "  cmd:       $(pid_cmdline "$occupant")"
    if [[ -f "$PIDFILE" ]]; then
      local ourpid; ourpid="$(cat "$PIDFILE")"
      if [[ "$occupant" == "$ourpid" ]] || is_descendant "$occupant" "$ourpid"; then
        echo "  ownership: in our tracked tree (root pid $ourpid)"
      else
        echo "  ownership: NOT in our tracked tree — unmanaged"
      fi
    else
      echo "  ownership: no pidfile — unmanaged backend"
    fi
  else
    echo "port $PORT:  free"
  fi

  echo
  if [[ -f "$LOGFILE" ]]; then
    echo "--- last 5 log lines ($LOGFILE) ---"
    tail -n 5 "$LOGFILE" || true
  else
    echo "no log file yet"
  fi

  [[ "$running" -eq 1 ]] && return 0 || return 1
}

cmd_logs() {
  if [[ ! -f "$LOGFILE" ]]; then
    echo "no log file yet at $LOGFILE" >&2
    return 1
  fi
  if [[ $# -eq 0 ]]; then
    tail -f "$LOGFILE"
  else
    tail "$@" "$LOGFILE"
  fi
}

# ==================== dispatch ====================

case "${1:-}" in
  start)   shift; cmd_start "$@" ;;
  stop)    shift; cmd_stop "$@" ;;
  restart) shift; cmd_restart "$@" ;;
  status)  shift; cmd_status "$@" ;;
  logs)    shift; cmd_logs "$@" ;;
  *)
    cat >&2 <<EOF
usage: $0 {start|stop|restart|status|logs [-n N]}

  start     fork pnpm dev, wait up to ${START_TIMEOUT}s for port, write pidfile
  stop      SIGTERM tree, SIGKILL survivors after 5s, verify port
  restart   stop + start
  status    pidfile + process health + port + uptime + RSS + last 5 log lines
  logs      tail -f the log; pass -n N for a fixed tail without follow

state:  PID  $PIDFILE
        LOG  $LOGFILE (rotated at $((MAX_LOG_BYTES / 1024 / 1024)) MB)
        PORT $PORT (from data/config/connectors.json)
EOF
    exit 2
    ;;
esac

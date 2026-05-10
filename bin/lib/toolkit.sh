#!/usr/bin/env bash
# Shared shell helpers for local-toolkit commands.

tk_has_tty() {
  [[ -t 1 ]]
}

tk_style() {
  local code="$1"
  shift
  if tk_has_tty; then
    printf '\033[%sm%s\033[0m' "$code" "$*"
  else
    printf '%s' "$*"
  fi
}

tk_note() {
  printf '%s\n' "$(tk_style '1;36' "$*")"
}

tk_warn() {
  printf '%s\n' "$(tk_style '1;33' "$*")" >&2
}

tk_error() {
  printf '%s\n' "$(tk_style '1;31' "$*")" >&2
}

tk_die() {
  tk_error "$*"
  exit 1
}

tk_require_cmd() {
  command -v "$1" >/dev/null 2>&1 || tk_die "$1 is required"
}

tk_validate_env_name() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || tk_die "invalid env name: $1"
}

tk_validate_pass_path() {
  [[ -n "$1" ]] || tk_die "pass path is required"
  [[ "$1" != *[[:space:]]* ]] || tk_die "pass path must not contain spaces: $1"
}

tk_docker_exec() {
  tk_require_cmd docker

  if docker info >/dev/null 2>&1; then
    docker "$@"
    return
  fi

  if command -v sg >/dev/null 2>&1 && sg docker -c 'docker info >/dev/null 2>&1'; then
    local cmd="docker"
    local arg q
    for arg in "$@"; do
      printf -v q '%q' "$arg"
      cmd+=" $q"
    done
    sg docker -c "$cmd"
    return
  fi

  tk_die "docker is installed but not accessible for this shell. Re-login or run: newgrp docker"
}


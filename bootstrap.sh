#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INSTALL_PACKAGES=1
INSTALL_SITE_OPS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-packages) INSTALL_PACKAGES=0 ;;
    --no-site-ops) INSTALL_SITE_OPS=0 ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: ./bootstrap.sh [--no-packages] [--no-site-ops]" >&2
      exit 2
      ;;
  esac
  shift
done

install_packages() {
  local pkgs=(git curl tmux emacs-nox python3 python3-pip python3-venv nodejs npm ripgrep net-tools telnet gh)
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y "${pkgs[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "${pkgs[@]}"
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm "${pkgs[@]}"
  else
    echo "[local-toolkit] No supported package manager found; skipping package install."
  fi
}

ensure_line_in_file() {
  local line="$1"
  local file="$2"
  touch "$file"
  grep -Fqx "$line" "$file" || echo "$line" >> "$file"
}

link_dotfiles() {
  ln -sfn "${ROOT_DIR}/dotfiles/bashrc.local" "${HOME}/.bashrc.local"
  ensure_line_in_file "[ -f ~/.bashrc.local ] && . ~/.bashrc.local" "${HOME}/.bashrc"

  ln -sfn "${ROOT_DIR}/dotfiles/tmux.conf" "${HOME}/.tmux.conf"
  mkdir -p "${HOME}/.emacs.d"
  ln -sfn "${ROOT_DIR}/dotfiles/init.el" "${HOME}/.emacs.d/init.el"
}

setup_site_ops() {
  (cd "${ROOT_DIR}/tools/site-ops" && npm install)
}

if [[ "$INSTALL_PACKAGES" -eq 1 ]]; then
  echo "[local-toolkit] Installing base packages..."
  install_packages
fi

echo "[local-toolkit] Linking dotfiles..."
link_dotfiles

if [[ "$INSTALL_SITE_OPS" -eq 1 ]]; then
  echo "[local-toolkit] Installing site-ops npm deps..."
  setup_site_ops
fi

echo "[local-toolkit] Complete. Restart shell to load bash changes."

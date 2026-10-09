#!/bin/zsh
# Linux shell environment. Sourced by .zshrc before oh-my-zsh. Runs on every shell
# start, so no installs here.

# Minimized Ubuntu images (Docker, some WSL/cloud images) drop /usr/share/doc, where
# Debian's fzf (< 0.48) ships its zsh key bindings; omz's fzf plugin then errors on every
# shell start. Skip the bindings there; `sudo unminimize` then `sudo apt install --reinstall fzf`
# restores the file, and this check stops firing.
if [[ -d /usr/share/doc/fzf/examples && ! -f /usr/share/doc/fzf/examples/key-bindings.zsh ]]; then
  DISABLE_FZF_KEY_BINDINGS=true
fi

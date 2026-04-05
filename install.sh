#!/bin/zsh
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
ZSH_HOST_OS=$(uname | awk '{print tolower($0)}')
TIMESTAMP=$(date +%Y%m%d%H%M%S)

command_exists() { command -v "$1" >/dev/null 2>&1; }

info()  { echo "\033[0;34m[info]\033[0m  $1"; }
ok()    { echo "\033[0;32m[ok]\033[0m    $1"; }
warn()  { echo "\033[0;33m[warn]\033[0m  $1"; }

backup_and_link() {
    local src="$1"
    local dest="$2"

    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
        cp -L "$dest" "${dest}.${TIMESTAMP}.bak"
        info "Backed up $dest -> ${dest}.${TIMESTAMP}.bak"
    fi

    ln -sfn "$src" "$dest"
    ok "Linked $dest -> $src"
}

# -- oh-my-zsh --
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    info "Installing oh-my-zsh..."
    git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh"
    ok "oh-my-zsh installed"
else
    ok "oh-my-zsh already installed"
fi

# -- Symlink dotfiles --
info "Symlinking dotfiles..."

backup_and_link "$DOTFILES_DIR/.zshrc"            "$HOME/.zshrc"
backup_and_link "$DOTFILES_DIR/.aliases"           "$HOME/.aliases"
backup_and_link "$DOTFILES_DIR/.gitconfig"         "$HOME/.gitconfig"
backup_and_link "$DOTFILES_DIR/.gitignore_global"  "$HOME/.gitignore_global"
backup_and_link "$DOTFILES_DIR/.vimrc"             "$HOME/.vimrc"

# Ghostty config (XDG path, works on all platforms).
GHOSTTY_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/ghostty"
if command_exists ghostty || [ -d "$GHOSTTY_CONFIG_DIR" ]; then
    mkdir -p "$GHOSTTY_CONFIG_DIR"
    backup_and_link "$DOTFILES_DIR/config.ghostty" "$GHOSTTY_CONFIG_DIR/config.ghostty"
fi

# -- Install tools --
info "Installing tools..."
source "$DOTFILES_DIR/.aliases"
export ZSH_HOST_OS

if [[ "$ZSH_HOST_OS" == "darwin" ]]; then
    source "$DOTFILES_DIR/mac.sh"
fi

source "$DOTFILES_DIR/tools.sh"

ok "Done! Restart your shell or run: source ~/.zshrc"

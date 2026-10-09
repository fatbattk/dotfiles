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
        mv "$dest" "${dest}.${TIMESTAMP}.bak"
        info "Backed up $dest -> ${dest}.${TIMESTAMP}.bak"
    fi

    ln -sfn "$src" "$dest"
    ok "Linked $dest -> $src"
}

# Platform bootstrap, before the git clones below: on macOS, Homebrew's installer also
# installs the Command Line Tools that provide git. mac.sh first, so an installed but
# not-yet-on-PATH Homebrew is found instead of reinstalled.
if [[ "$ZSH_HOST_OS" == "darwin" ]]; then
    source "$DOTFILES_DIR/mac.sh"
    source "$DOTFILES_DIR/mac-install.sh"
fi
# User-level installers (herdr, etc.) put binaries here; .zshrc adds it too.
[[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || export PATH="$HOME/.local/bin:$PATH"

# -- oh-my-zsh --
if [ ! -d "$HOME/.oh-my-zsh" ]; then
    info "Installing oh-my-zsh..."
    git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh"
    ok "oh-my-zsh installed"
else
    ok "oh-my-zsh already installed"
fi

# -- Vim dracula theme (.vimrc sets `colorscheme dracula`) --
DRACULA_DIR="$HOME/.vim/pack/themes/start/dracula"
if [ ! -d "$DRACULA_DIR" ]; then
    info "Installing dracula vim theme..."
    git clone --depth=1 https://github.com/dracula/vim.git "$DRACULA_DIR"
    ok "dracula vim theme installed"
else
    ok "dracula vim theme already installed"
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
else
    warn "ghostty not found; skipped Ghostty config (install it, then re-run install.sh)"
fi

# herdr config. Only config.toml is ours; herdr installs and overwrites its own
# agent-state integrations under ~/.claude, ~/.codex, ~/.omp, etc.
if command_exists herdr; then
    HERDR_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/herdr"
    mkdir -p "$HERDR_CONFIG_DIR"
    backup_and_link "$DOTFILES_DIR/herdr.toml" "$HERDR_CONFIG_DIR/config.toml"
else
    warn "herdr not found; skipped herdr config (install it, then re-run install.sh)"
fi

# omp (Oh My Pi). `omp config set` and /settings realpath config.yml before rewriting
# it, so the symlink survives and edits land in this repo: never set credential-typed
# keys (auth.broker.token, images.urls.credentials). Extensions are linked one by one
# because herdr and /pkg add their own entries to the same directory. mcp.json can't
# be a symlink (omp rename()s over it), so bin/omp-config-backup mirrors its
# preference keys. Not tracked: models.yml, settings.json, managed-skills, *.db and
# other runtime state.
if command_exists omp; then
    OMP_AGENT_DIR="$HOME/.omp/agent"
    mkdir -p "$OMP_AGENT_DIR/extensions"
    backup_and_link "$DOTFILES_DIR/omp/config.yml" "$OMP_AGENT_DIR/config.yml"
    backup_and_link "$DOTFILES_DIR/omp/themes"     "$OMP_AGENT_DIR/themes"
    for ext in "$DOTFILES_DIR"/omp/extensions/*(N/); do
        backup_and_link "$ext" "$OMP_AGENT_DIR/extensions/${ext:t}"
    done
    "$DOTFILES_DIR/bin/omp-config-backup" --restore || warn "omp mcp.json restore failed"
else
    warn "omp not found; skipped omp config/extensions (install it, then re-run install.sh)"
fi

# -- Install tools --
info "Installing tools..."
source "$DOTFILES_DIR/.aliases"
export ZSH_HOST_OS

source "$DOTFILES_DIR/tools.sh"

ok "Done! Restart your shell or run: source ~/.zshrc"

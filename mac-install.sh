#!/bin/zsh
# macOS bootstrap. Sourced by install.sh only (never .zshrc): it installs things.

# Packages come from Homebrew: install it if missing, then load its shellenv.
if ! command_exists brew; then
    echo "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    source "$DOTFILES_DIR/mac.sh"
fi

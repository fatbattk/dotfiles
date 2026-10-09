#!/bin/zsh
# macOS shell environment. Sourced by .zshrc (before oh-my-zsh, so plugins find
# Homebrew binaries) and by install.sh. Runs on every shell start, so no installs
# here: mac-install.sh bootstraps Homebrew.

# Homebrew shellenv (Apple Silicon's /opt/homebrew is not on the default PATH).
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
fi

# Ghostty.app keeps its CLI inside the bundle, off PATH (`ghostty +edit-config`, install.sh).
if [[ -x /Applications/Ghostty.app/Contents/MacOS/ghostty && ":$PATH:" != *":/Applications/Ghostty.app/Contents/MacOS:"* ]]; then
    export PATH="$PATH:/Applications/Ghostty.app/Contents/MacOS"
fi

alias awake='caffeinate -disu'

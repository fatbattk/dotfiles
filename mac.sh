#!/bin/bash

# Brew configuration
BREW_DIR=$(which brew)
[[ -x "$BREW_DIR/brew" ]] && eval $($BREW_DIR/brew shellenv)
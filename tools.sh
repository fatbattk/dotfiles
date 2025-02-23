#!/bin/bash

# Generic package installer function
install_package() {
    local package_name=$1
    
    if [[ "$ZSH_HOST_OS" == "darwin" ]]; then
        if command_exists brew; then
            brew install "$package_name"
        else
            echo "Homebrew not found. Please install Homebrew first."
            return 1
        fi
    elif [[ "$ZSH_HOST_OS" == "linux" ]]; then
        if command_exists apt; then
            sudo apt install -y "$package_name"
        elif command_exists dnf; then
            sudo dnf install -y "$package_name"
        else
            echo "Package manager not supported. Please install $package_name manually."
            return 1
        fi
    else
        echo "Unsupported operating system"
        return 1
    fi
}

# Check and install tools.
if ! command_exists eza; then
    # https://github.com/eza-community/eza/blob/main/INSTALL.md
    if [[ "$ZSH_HOST_OS" == "linux" ]]; then
        if ! command_exists gpg; then
            sudo apt update
            sudo apt install -y gpg
        fi
        sudo mkdir -p /etc/apt/keyrings
        wget -qO- https://raw.githubusercontent.com/eza-community/eza/main/deb.asc | sudo gpg --dearmor -o /etc/apt/keyrings/gierens.gpg
        echo "deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main" | sudo tee /etc/apt/sources.list.d/gierens.list
        sudo chmod 644 /etc/apt/keyrings/gierens.gpg /etc/apt/sources.list.d/gierens.list
        sudo apt update
    fi
    install_package "eza"
fi

return 0

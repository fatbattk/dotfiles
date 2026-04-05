# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:/usr/local/bin:$PATH

# Path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh

# detect the OS
# 'darwin' = Mac OS
# 'linux' = Linux
export ZSH_HOST_OS=$(uname | awk '{print tolower($0)}')

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time oh-my-zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="mh"

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment the following line to disable bi-weekly auto-update checks.
# DISABLE_AUTO_UPDATE="true"

# Uncomment the following line to automatically update without prompting.
# DISABLE_UPDATE_PROMPT="true"

# Uncomment the following line to change how often to auto-update (in days).
# export UPDATE_ZSH_DAYS=13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# Caution: this setting can cause issues with multiline prompts (zsh 5.7.1 and newer seem to work)
# See https://github.com/ohmyzsh/ohmyzsh/issues/5765
COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git colored-man-pages colorize extract dirhistory sudo eza fzf)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor.
export EDITOR='vim'

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"
# alias sudo='sudo '
[ -f $HOME/.aliases ] && source $HOME/.aliases

if [ -e $HOME/.nix-profile/etc/profile.d/nix.sh ]; then
  . $HOME/.nix-profile/etc/profile.d/nix.sh
fi

# path config.
add_path "$HOME/.yarn/bin"
add_path "$HOME/.config/yarn/global/node_modules/.bin"

# history config.
export HISTFILE=~/.zsh_history
export HISTSIZE=50000
export SAVEHIST=50000
HISTORY_IGNORE="(ls|ll|la|lla|l|pwd|exit|clear|z)"
setopt SHARE_HISTORY INC_APPEND_HISTORY HIST_IGNORE_DUPS

# arrow-key history prefix search: type partial command, press up/down to match.
bindkey '\eOA' history-beginning-search-backward
bindkey '\e[A' history-beginning-search-backward
bindkey '\eOB' history-beginning-search-forward
bindkey '\e[B' history-beginning-search-forward

# Resolve dotfiles directory from this symlinked .zshrc.
if [ -L "$HOME/.zshrc" ]; then
  DOTFILES_DIR="$(dirname "$(readlink "$HOME/.zshrc")")"
else
  DOTFILES_DIR="$HOME/dotfiles"
fi

# tools config.
[ -f "$DOTFILES_DIR/tools.sh" ] && source "$DOTFILES_DIR/tools.sh"
# Mac specific configs.
if [[ "$ZSH_HOST_OS" == "darwin" ]]; then
  [ -f "$DOTFILES_DIR/mac.sh" ] && source "$DOTFILES_DIR/mac.sh"
fi

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  nvm() {
    unfunction nvm node npm npx 2>/dev/null
    \. "$NVM_DIR/nvm.sh"
    nvm "$@"
  }
  node() { unfunction nvm node npm npx 2>/dev/null; \. "$NVM_DIR/nvm.sh"; node "$@"; }
  npm() { unfunction nvm node npm npx 2>/dev/null; \. "$NVM_DIR/nvm.sh"; npm "$@"; }
  npx() { unfunction nvm node npm npx 2>/dev/null; \. "$NVM_DIR/nvm.sh"; npx "$@"; }
fi

FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Install required packages (GitHub CLI, modern git tools, build tools)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
        curl \
        git \
        jq \
    # Install GitHub CLI (gh)
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y github-cli \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install codex CLI globally
RUN npm install -g @openai/codex

# Set working directory permissions
WORKDIR /workspaces/RefuteFlow
USER node

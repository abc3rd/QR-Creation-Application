#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect Portable SSD — First Boot Setup
# Run this once after booting into Ubuntu/Mint from the Ventoy SSD.
# Installs Docker, NVIDIA drivers (if GPU found), dev tools, and starts all
# services automatically.
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PERSIST_ROOT="/mnt/persist"
PERSIST_LABEL="PERSISTENCE"

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CloudConnect Portable SSD — First Boot Setup        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Mount persistence partition ──────────────────────────────────────────
mount_persistence() {
    if mountpoint -q "$PERSIST_ROOT" 2>/dev/null; then
        echo -e "${GREEN}✓ Persistence already mounted at $PERSIST_ROOT${NC}"
    else
        echo -e "${YELLOW}Mounting persistence partition...${NC}"
        sudo mkdir -p "$PERSIST_ROOT"
        sudo mount -L "$PERSIST_LABEL" "$PERSIST_ROOT"
        echo -e "${GREEN}✓ Persistence mounted${NC}"
    fi
}

# ─── Install Docker ───────────────────────────────────────────────────────
install_docker() {
    if command -v docker &>/dev/null; then
        echo -e "${GREEN}✓ Docker already installed ($(docker --version))${NC}"
        return
    fi

    echo -e "${YELLOW}Installing Docker...${NC}"

    # Install prerequisites
    sudo apt-get update
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # Add Docker GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    # Add Docker repo
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add current user to docker group
    sudo usermod -aG docker "$USER"

    # Configure Docker to use persistence partition for storage
    sudo mkdir -p /etc/docker
    sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "data-root": "${PERSIST_ROOT}/docker",
    "storage-driver": "overlay2",
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    }
}
EOF

    sudo systemctl restart docker
    echo -e "${GREEN}✓ Docker installed and configured${NC}"
}

# ─── Install NVIDIA Container Toolkit (if GPU detected) ──────────────────
install_nvidia() {
    if ! lspci | grep -qi nvidia; then
        echo -e "${YELLOW}No NVIDIA GPU detected — skipping NVIDIA setup${NC}"
        echo "cpu-only" > "${PERSIST_ROOT}/config/.gpu-mode"
        return
    fi

    echo -e "${YELLOW}NVIDIA GPU detected — installing drivers and container toolkit...${NC}"

    # Install NVIDIA drivers
    sudo apt-get install -y nvidia-driver-550 nvidia-utils-550 2>/dev/null || \
    sudo ubuntu-drivers install 2>/dev/null || {
        echo -e "${YELLOW}Could not auto-install NVIDIA drivers. Install manually later.${NC}"
        echo "cpu-only" > "${PERSIST_ROOT}/config/.gpu-mode"
        return
    }

    # Install NVIDIA Container Toolkit
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker

    echo "nvidia" > "${PERSIST_ROOT}/config/.gpu-mode"
    echo -e "${GREEN}✓ NVIDIA drivers and container toolkit installed${NC}"
}

# ─── Install development tools ────────────────────────────────────────────
install_dev_tools() {
    echo -e "${YELLOW}Installing development tools...${NC}"

    # Core dev tools
    sudo apt-get install -y \
        git \
        build-essential \
        python3 \
        python3-pip \
        python3-venv \
        jq \
        htop \
        tmux \
        vim \
        neovim \
        unzip \
        wget \
        curl \
        openssh-client \
        net-tools

    # Install Node.js 20 LTS via NodeSource
    if ! command -v node &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        sudo npm install -g pnpm@9 typescript ts-node
        echo -e "${GREEN}✓ Node.js $(node --version) + pnpm installed${NC}"
    else
        echo -e "${GREEN}✓ Node.js already installed ($(node --version))${NC}"
    fi

    # Install VS Code (if running a desktop session)
    if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
        if ! command -v code &>/dev/null; then
            wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg
            sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
            echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | \
                sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null
            sudo apt-get update
            sudo apt-get install -y code
            echo -e "${GREEN}✓ VS Code installed${NC}"
        fi
    fi

    # Install Go (for backend tools)
    if ! command -v go &>/dev/null; then
        GO_VERSION="1.22.5"
        wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
        sudo tar -C /usr/local -xzf /tmp/go.tar.gz
        echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/go.sh
        export PATH=$PATH:/usr/local/go/bin
        echo -e "${GREEN}✓ Go ${GO_VERSION} installed${NC}"
    fi

    echo -e "${GREEN}✓ Development tools installed${NC}"
}

# ─── Set up persistence symlinks ──────────────────────────────────────────
setup_persistence_links() {
    echo -e "${YELLOW}Setting up persistence symlinks...${NC}"

    # Symlink Docker data to persistence
    # (Already handled by daemon.json data-root)

    # Create a convenience link on the desktop
    if [ -d "$HOME/Desktop" ]; then
        ln -sf "$PERSIST_ROOT/apps" "$HOME/Desktop/CloudConnect-Apps" 2>/dev/null || true
        ln -sf "$PERSIST_ROOT/tools" "$HOME/Desktop/CloudConnect-Tools" 2>/dev/null || true
    fi

    # Add persistence mount to fstab for auto-mount on boot
    if ! grep -q "$PERSIST_LABEL" /etc/fstab 2>/dev/null; then
        echo "LABEL=${PERSIST_LABEL} ${PERSIST_ROOT} ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab
    fi

    # Add start-all.sh to shell profile for convenience
    if ! grep -q "start-all.sh" "$HOME/.bashrc" 2>/dev/null; then
        cat >> "$HOME/.bashrc" <<'BASHEOF'

# CloudConnect Portable SSD
export PERSIST_ROOT="/mnt/persist"
alias cc-start="/mnt/persist/scripts/start-all.sh"
alias cc-stop="/mnt/persist/scripts/stop-all.sh"
alias cc-status="/mnt/persist/scripts/status.sh"
alias cc-update="/mnt/persist/scripts/update-all.sh"
BASHEOF
    fi

    echo -e "${GREEN}✓ Persistence symlinks configured${NC}"
}

# ─── Set up autostart ─────────────────────────────────────────────────────
setup_autostart() {
    echo -e "${YELLOW}Setting up autostart...${NC}"

    # Copy autostart desktop entry
    local autostart_dir="$HOME/.config/autostart"
    mkdir -p "$autostart_dir"

    if [ -f "${PERSIST_ROOT}/config/autostart/cloudconnect-autostart.desktop" ]; then
        cp "${PERSIST_ROOT}/config/autostart/cloudconnect-autostart.desktop" "$autostart_dir/"
    fi

    # Also add to systemd for headless boots
    sudo tee /etc/systemd/system/cloudconnect-services.service > /dev/null <<EOF
[Unit]
Description=CloudConnect Portable Services
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${PERSIST_ROOT}/scripts/start-all.sh
ExecStop=${PERSIST_ROOT}/scripts/stop-all.sh
User=root
Environment=PERSIST_ROOT=${PERSIST_ROOT}

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable cloudconnect-services.service

    echo -e "${GREEN}✓ Autostart configured (desktop + systemd)${NC}"
}

# ─── Pull Docker images ──────────────────────────────────────────────────
pull_images() {
    echo -e "${YELLOW}Pulling Docker images (this may take a while)...${NC}"

    # Pull AI stack images
    docker pull ollama/ollama:latest
    docker pull ghcr.io/open-webui/open-webui:main
    docker pull mintplexlabs/anythingllm:latest
    docker pull portainer/portainer-ce:latest

    # Pull QR app base images
    docker pull python:3.12-slim
    docker pull node:20-alpine
    docker pull postgres:16-alpine
    docker pull redis:7-alpine

    echo -e "${GREEN}✓ Docker images pulled${NC}"
}

# ─── Start all services ──────────────────────────────────────────────────
start_services() {
    echo -e "${YELLOW}Starting all services...${NC}"
    "${PERSIST_ROOT}/scripts/start-all.sh"
}

# ─── Pull default AI models ──────────────────────────────────────────────
pull_default_models() {
    echo -e "${YELLOW}Pulling default AI models...${NC}"

    # Wait for Ollama to be ready
    local retries=0
    while ! curl -sf http://localhost:11434/api/tags &>/dev/null; do
        retries=$((retries + 1))
        if [ $retries -gt 30 ]; then
            echo -e "${YELLOW}Ollama not ready yet — skip model pull for now${NC}"
            echo "Run later: docker exec cc-ollama ollama pull llama3.2:3b"
            return
        fi
        sleep 2
    done

    # Pull a small, capable model
    docker exec cc-ollama ollama pull llama3.2:3b &
    docker exec cc-ollama ollama pull nomic-embed-text &
    wait

    echo -e "${GREEN}✓ Default AI models pulled${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────
main() {
    mount_persistence

    # Source environment
    if [ -f "${PERSIST_ROOT}/config/.env" ]; then
        set -a
        source "${PERSIST_ROOT}/config/.env"
        set +a
    fi

    install_docker
    install_nvidia
    install_dev_tools
    setup_persistence_links
    setup_autostart
    pull_images
    start_services
    pull_default_models

    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗"
    echo "║  First Boot Setup Complete!                           ║"
    echo "╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Services running:${NC}"
    echo "  QR Creation App:    http://localhost:3000"
    echo "  QR Python Engine:   http://localhost:5001"
    echo "  Open WebUI (Chat):  http://localhost:3001"
    echo "  Ollama API:         http://localhost:11434"
    echo "  ComfyUI:            http://localhost:8188"
    echo "  AnythingLLM:        http://localhost:3002"
    echo "  Portainer:          http://localhost:9443"
    echo ""
    echo -e "${BOLD}Quick commands:${NC}"
    echo "  cc-start    — Start all services"
    echo "  cc-stop     — Stop all services"
    echo "  cc-status   — Show service status"
    echo "  cc-update   — Pull latest Docker images"
    echo ""
    echo -e "${YELLOW}Note: Log out and back in for docker group permissions.${NC}"
    echo -e "${GREEN}${BOLD}Your portable workstation is ready!${NC}"
}

main "$@"

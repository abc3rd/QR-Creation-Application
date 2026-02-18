#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Start All Services
# ============================================================================

PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Starting CloudConnect services...${NC}"

# Mount persistence if not mounted
if ! mountpoint -q "$PERSIST_ROOT" 2>/dev/null; then
    sudo mkdir -p "$PERSIST_ROOT"
    sudo mount -L PERSISTENCE "$PERSIST_ROOT" 2>/dev/null || true
fi

# Source environment
if [ -f "${PERSIST_ROOT}/config/.env" ]; then
    set -a
    source "${PERSIST_ROOT}/config/.env"
    set +a
fi

export PERSIST_ROOT

# Determine GPU mode
GPU_MODE="cpu-only"
if [ -f "${PERSIST_ROOT}/config/.gpu-mode" ]; then
    GPU_MODE=$(cat "${PERSIST_ROOT}/config/.gpu-mode")
fi

# Start QR Creation Application
echo -e "${YELLOW}[1/3] Starting QR Creation App...${NC}"
cd "${PERSIST_ROOT}/apps/qr-creation-app"
docker compose up -d
echo -e "${GREEN}✓ QR App running${NC}"

# Start AI Stack
echo -e "${YELLOW}[2/3] Starting AI Stack...${NC}"
cd "${PERSIST_ROOT}/apps/ai-stack"

if [ "$GPU_MODE" = "nvidia" ]; then
    docker compose up -d
else
    # Start without GPU services, use CPU-only Ollama
    docker compose --profile cpu-only up -d \
        ollama-cpu open-webui anythingllm portainer
fi
echo -e "${GREEN}✓ AI Stack running${NC}"

# Start any custom TypeScript tools
echo -e "${YELLOW}[3/3] Starting custom tools...${NC}"
if [ -f "${PERSIST_ROOT}/tools/docker-compose.tools.yml" ]; then
    cd "${PERSIST_ROOT}/tools"
    docker compose -f docker-compose.tools.yml up -d
    echo -e "${GREEN}✓ Custom tools running${NC}"
else
    echo -e "${GREEN}✓ No custom tools configured (add docker-compose.tools.yml to ${PERSIST_ROOT}/tools/)${NC}"
fi

echo ""
echo -e "${GREEN}All services started!${NC}"
echo ""
echo "  QR App:       http://localhost:3000"
echo "  QR Engine:    http://localhost:5001"
echo "  Open WebUI:   http://localhost:3001"
echo "  Ollama:       http://localhost:11434"
echo "  ComfyUI:      http://localhost:8188"
echo "  AnythingLLM:  http://localhost:3002"
echo "  Portainer:    http://localhost:9443"

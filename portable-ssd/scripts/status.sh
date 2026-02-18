#!/bin/bash

# ============================================================================
# CloudConnect — Service Status
# ============================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}CloudConnect Service Status${NC}"
echo "─────────────────────────────────────────"

check_service() {
    local name="$1"
    local url="$2"
    local container="$3"

    local status
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
        if curl -sf --max-time 3 "$url" &>/dev/null; then
            status="${GREEN}● Running${NC}"
        else
            status="${YELLOW}● Starting${NC}"
        fi
    else
        status="${RED}● Stopped${NC}"
    fi

    printf "  %-20s %b  %s\n" "$name" "$status" "$url"
}

echo ""
echo -e "${BOLD}QR Creation App:${NC}"
check_service "Web Frontend" "http://localhost:3000" "cc-qr-web"
check_service "Python Engine" "http://localhost:5001/health" "cc-qr-engine"
check_service "PostgreSQL" "tcp://localhost:5432" "cc-qr-postgres"
check_service "Redis" "tcp://localhost:6379" "cc-qr-redis"

echo ""
echo -e "${BOLD}AI Stack:${NC}"
check_service "Ollama" "http://localhost:11434/api/tags" "cc-ollama"
check_service "Open WebUI" "http://localhost:3001" "cc-open-webui"
check_service "ComfyUI" "http://localhost:8188" "cc-comfyui"
check_service "AnythingLLM" "http://localhost:3002" "cc-anythingllm"
check_service "Portainer" "https://localhost:9443" "cc-portainer"

echo ""
echo -e "${BOLD}System:${NC}"

# GPU status
if command -v nvidia-smi &>/dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    GPU_MEM=$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    echo -e "  GPU:               ${GREEN}${GPU_NAME}${NC} (${GPU_MEM} MiB)"
else
    echo -e "  GPU:               ${YELLOW}CPU-only mode${NC}"
fi

# Disk usage
PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
if mountpoint -q "$PERSIST_ROOT" 2>/dev/null; then
    DISK_USAGE=$(df -h "$PERSIST_ROOT" | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')
    echo -e "  Persistence:       ${DISK_USAGE}"
fi

# Docker
DOCKER_CONTAINERS=$(docker ps -q 2>/dev/null | wc -l)
DOCKER_IMAGES=$(docker images -q 2>/dev/null | wc -l)
echo -e "  Docker:            ${DOCKER_CONTAINERS} containers, ${DOCKER_IMAGES} images"

echo ""

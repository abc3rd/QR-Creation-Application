#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Stop All Services
# ============================================================================

PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping CloudConnect services...${NC}"

# Stop custom tools
if [ -f "${PERSIST_ROOT}/tools/docker-compose.tools.yml" ]; then
    cd "${PERSIST_ROOT}/tools"
    docker compose -f docker-compose.tools.yml down 2>/dev/null || true
fi

# Stop AI Stack
cd "${PERSIST_ROOT}/apps/ai-stack"
docker compose --profile cpu-only down 2>/dev/null || true
docker compose down 2>/dev/null || true

# Stop QR App
cd "${PERSIST_ROOT}/apps/qr-creation-app"
docker compose down 2>/dev/null || true

echo -e "${RED}All services stopped.${NC}"

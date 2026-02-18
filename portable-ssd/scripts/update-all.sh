#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Update All Docker Images
# ============================================================================

PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}Pulling latest Docker images...${NC}"

# AI Stack images
docker pull ollama/ollama:latest
docker pull ghcr.io/open-webui/open-webui:main
docker pull ghcr.io/ai-dock/comfyui:latest
docker pull mintplexlabs/anythingllm:latest
docker pull portainer/portainer-ce:latest

# QR App base images
docker pull python:3.12-slim
docker pull node:20-alpine
docker pull postgres:16-alpine
docker pull redis:7-alpine

echo ""
echo -e "${GREEN}✓ All images updated${NC}"
echo ""
echo "To apply updates, restart services:"
echo "  cc-stop && cc-start"

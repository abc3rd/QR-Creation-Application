#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Backup SSD Data
# Creates a compressed archive of all persistent data and configurations
# ============================================================================

PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${1:-$HOME/cloudconnect-backups}"
BACKUP_FILE="${BACKUP_DIR}/cc-backup-${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}Backing up CloudConnect data...${NC}"
echo "Source: ${PERSIST_ROOT}"
echo "Target: ${BACKUP_FILE}"
echo ""

# Stop services for consistent backup
echo -e "${YELLOW}Stopping services for consistent backup...${NC}"
"${PERSIST_ROOT}/scripts/stop-all.sh" 2>/dev/null || true

# Backup configs and app data (excluding large model files)
tar -czf "$BACKUP_FILE" \
    -C "$PERSIST_ROOT" \
    --exclude='data/ollama-models/blobs' \
    --exclude='data/comfyui-models' \
    --exclude='docker' \
    config \
    apps \
    tools \
    scripts \
    data/postgres \
    data/redis

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

# Restart services
echo -e "${YELLOW}Restarting services...${NC}"
"${PERSIST_ROOT}/scripts/start-all.sh" 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})${NC}"
echo ""
echo "Note: AI model files (ollama/comfyui) are excluded to save space."
echo "They will be re-downloaded on restore via: ollama pull <model>"

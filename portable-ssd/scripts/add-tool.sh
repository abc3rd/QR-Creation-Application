#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Add a TypeScript/Node Tool to Portable SSD
# Usage: ./add-tool.sh <tool-name> <git-repo-url> [port]
# ============================================================================

PERSIST_ROOT="${PERSIST_ROOT:-/mnt/persist}"
TOOLS_DIR="${PERSIST_ROOT}/tools/typescript"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <tool-name> <git-repo-url> [port]"
    echo ""
    echo "Examples:"
    echo "  $0 my-api https://github.com/user/my-api.git 4000"
    echo "  $0 scraper https://github.com/user/scraper.git"
    exit 1
fi

TOOL_NAME="$1"
REPO_URL="$2"
PORT="${3:-}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Adding tool: ${TOOL_NAME}${NC}"

# Clone the repo
TOOL_DIR="${TOOLS_DIR}/${TOOL_NAME}"
if [ -d "$TOOL_DIR" ]; then
    echo "Updating existing tool..."
    cd "$TOOL_DIR" && git pull
else
    git clone "$REPO_URL" "$TOOL_DIR"
fi

# Generate a Dockerfile if one doesn't exist
if [ ! -f "${TOOL_DIR}/Dockerfile" ]; then
    echo -e "${YELLOW}No Dockerfile found — generating one...${NC}"
    cat > "${TOOL_DIR}/Dockerfile" <<'DOCKERFILE'
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package*.json pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else npm ci; fi
COPY . .
RUN if [ -f tsconfig.json ]; then npx tsc || true; fi
CMD ["npm", "start"]
DOCKERFILE
fi

# Add to the tools docker-compose
COMPOSE_FILE="${PERSIST_ROOT}/tools/docker-compose.tools.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    cat > "$COMPOSE_FILE" <<EOF
version: '3.8'

services: {}

networks:
  tools-net:
    name: cloudconnect-tools
    driver: bridge
EOF
fi

# Append service to compose file (basic approach — append YAML)
PORT_MAPPING=""
if [ -n "$PORT" ]; then
    PORT_MAPPING="    ports:
      - \"${PORT}:${PORT}\""
fi

# Use a simple Python snippet to merge YAML safely
python3 -c "
import yaml, sys

with open('$COMPOSE_FILE', 'r') as f:
    data = yaml.safe_load(f) or {}

if 'services' not in data or data['services'] is None:
    data['services'] = {}

data['services']['$TOOL_NAME'] = {
    'build': {'context': '${TOOL_DIR}'},
    'container_name': 'cc-tool-${TOOL_NAME}',
    'restart': 'unless-stopped',
    'networks': ['tools-net'],
}

port = '$PORT'
if port:
    data['services']['$TOOL_NAME']['ports'] = [f'{port}:{port}']

if 'networks' not in data:
    data['networks'] = {'tools-net': {'name': 'cloudconnect-tools', 'driver': 'bridge'}}

with open('$COMPOSE_FILE', 'w') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False)
" 2>/dev/null || {
    echo -e "${YELLOW}PyYAML not available — adding entry manually${NC}"
    # Fallback: just note it for the user
    echo "# Add to ${COMPOSE_FILE} manually:" >> "${TOOL_DIR}/COMPOSE_ENTRY.txt"
    echo "  ${TOOL_NAME}:" >> "${TOOL_DIR}/COMPOSE_ENTRY.txt"
    echo "    build: ${TOOL_DIR}" >> "${TOOL_DIR}/COMPOSE_ENTRY.txt"
    echo "    container_name: cc-tool-${TOOL_NAME}" >> "${TOOL_DIR}/COMPOSE_ENTRY.txt"
    [ -n "$PORT" ] && echo "    ports: [\"${PORT}:${PORT}\"]" >> "${TOOL_DIR}/COMPOSE_ENTRY.txt"
}

echo -e "${GREEN}✓ Tool '${TOOL_NAME}' added${NC}"
echo ""
echo "To start it:"
echo "  cd ${PERSIST_ROOT}/tools && docker compose -f docker-compose.tools.yml up -d ${TOOL_NAME}"
[ -n "$PORT" ] && echo "  Access at: http://localhost:${PORT}"

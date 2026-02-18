#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# QR Creation App — Development Setup
# Sets up the Capacitor Android project for local development
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}QR Creation — Dev Setup${NC}\n"

# ─── Check Android SDK ────────────────────────────────────────
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    echo -e "${YELLOW}WARNING: ANDROID_HOME not set.${NC}"
    echo "  Install Android Studio and set ANDROID_HOME."
    echo "  Common paths:"
    echo "    macOS:   ~/Library/Android/sdk"
    echo "    Linux:   ~/Android/Sdk"
    echo "    Windows: %LOCALAPPDATA%\\Android\\Sdk"
    echo ""
fi

# ─── Install dependencies ─────────────────────────────────────
echo -e "${YELLOW}[1/4]${NC} Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install

# ─── Generate icons ───────────────────────────────────────────
echo -e "\n${YELLOW}[2/4]${NC} Generating app icons..."
node scripts/generate-icons.js 2>/dev/null || echo "  (SVG-only mode — install sharp for PNGs)"

# ─── Generate splash ──────────────────────────────────────────
echo -e "\n${YELLOW}[3/4]${NC} Generating splash screens..."
node scripts/generate-splash.js 2>/dev/null || echo "  (SVG-only mode — install sharp for PNGs)"

# ─── Sync Capacitor ───────────────────────────────────────────
echo -e "\n${YELLOW}[4/4]${NC} Syncing Capacitor..."
npx cap sync android

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo -e "  ${CYAN}Development commands:${NC}"
echo "    npx cap open android      — Open in Android Studio"
echo "    npx cap run android        — Build & run on device/emulator"
echo "    npx cap sync android       — Sync web assets to Android"
echo ""
echo -e "  ${CYAN}Live reload (dev server):${NC}"
echo "    1. Start web dev server:  cd ../web && pnpm dev"
echo "    2. Edit capacitor.config.ts → uncomment server.url"
echo "    3. Set url to http://YOUR_IP:8888"
echo "    4. npx cap run android"
echo ""
echo -e "  ${CYAN}Release build:${NC}"
echo "    ./scripts/build-release.sh"

#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# QR Creation App — Android Release Build
# Produces a signed AAB for Google Play Store upload
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$PROJECT_DIR/android"
KEYSTORE="$ANDROID_DIR/release-key.jks"
ALIAS="qrcreation"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   QR Creation — Android Release Build ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"

# ─── Step 1: Check prerequisites ──────────────────────────────
echo -e "\n${YELLOW}[1/6]${NC} Checking prerequisites..."

command -v java >/dev/null 2>&1 || { echo -e "${RED}ERROR: Java not found. Install JDK 17+${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}ERROR: Node.js not found${NC}"; exit 1; }

JAVA_VER=$(java -version 2>&1 | head -1 | awk -F '"' '{print $2}' | cut -d'.' -f1)
echo "  Java version: $JAVA_VER"
echo "  Node version: $(node --version)"

# ─── Step 2: Generate keystore if missing ─────────────────────
echo -e "\n${YELLOW}[2/6]${NC} Checking signing keystore..."

if [ ! -f "$KEYSTORE" ]; then
    echo -e "  ${YELLOW}No keystore found. Generating release keystore...${NC}"
    echo ""
    echo "  You'll be prompted for passwords and identity info."
    echo "  SAVE THESE CREDENTIALS — you need them for every Play Store update."
    echo ""

    keytool -genkeypair \
        -v \
        -keystore "$KEYSTORE" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -alias "$ALIAS" \
        -storetype PKCS12

    echo -e "  ${GREEN}Keystore created: $KEYSTORE${NC}"
    echo -e "  ${RED}IMPORTANT: Back up this file and your passwords!${NC}"
else
    echo -e "  ${GREEN}Keystore found.${NC}"
fi

# ─── Step 3: Install dependencies ─────────────────────────────
echo -e "\n${YELLOW}[3/6]${NC} Installing dependencies..."
cd "$PROJECT_DIR"
npm install --silent 2>/dev/null || npm install

# ─── Step 4: Generate icons and splash ─────────────────────────
echo -e "\n${YELLOW}[4/6]${NC} Generating icons and splash screens..."
node scripts/generate-icons.js
node scripts/generate-splash.js

# ─── Step 5: Sync Capacitor ────────────────────────────────────
echo -e "\n${YELLOW}[5/6]${NC} Syncing Capacitor..."
npx cap sync android

# ─── Step 6: Build release AAB ─────────────────────────────────
echo -e "\n${YELLOW}[6/6]${NC} Building release bundle (AAB)..."

cd "$ANDROID_DIR"

# Pass keystore info to Gradle
./gradlew bundleRelease \
    -PRELEASE_STORE_FILE="$KEYSTORE" \
    -PRELEASE_STORE_PASSWORD="${STORE_PASSWORD:-}" \
    -PRELEASE_KEY_ALIAS="$ALIAS" \
    -PRELEASE_KEY_PASSWORD="${KEY_PASSWORD:-}" \
    --warning-mode=summary

AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"

if [ -f "$AAB_PATH" ]; then
    SIZE=$(du -h "$AAB_PATH" | cut -f1)
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║        BUILD SUCCESSFUL               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  AAB: ${CYAN}$AAB_PATH${NC}"
    echo -e "  Size: $SIZE"
    echo ""
    echo -e "  ${YELLOW}Next steps:${NC}"
    echo "  1. Go to https://play.google.com/console"
    echo "  2. Create app → Upload the AAB file"
    echo "  3. Fill in store listing, screenshots, privacy policy"
    echo "  4. Submit for review"
else
    echo -e "${RED}BUILD FAILED — AAB not found${NC}"
    exit 1
fi

# Also build APK for direct install/testing
echo -e "\n${YELLOW}[bonus]${NC} Also building debug APK for testing..."
./gradlew assembleDebug --warning-mode=summary 2>/dev/null || true

APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo -e "  Debug APK: ${CYAN}$APK_PATH${NC}"
fi

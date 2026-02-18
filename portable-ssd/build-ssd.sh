#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect Portable SSD Builder
# Creates a Ventoy multi-boot 1TB SSD with AI Workstation + Dev Tools + QR App
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CloudConnect Portable SSD Builder                   ║"
echo "║  Ventoy Multi-Boot + AI Workstation + Dev Tools      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Pre-flight checks ───────────────────────────────────────────────────────
check_dependencies() {
    local missing=()
    for cmd in wget curl parted mkfs.exfat mkfs.ext4 tar; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}Missing required tools: ${missing[*]}${NC}"
        echo "Install with: sudo apt install wget curl parted exfatprogs e2fsprogs tar"
        exit 1
    fi
    echo -e "${GREEN}✓ All dependencies found${NC}"
}

# ─── Disk selection ───────────────────────────────────────────────────────────
select_disk() {
    echo ""
    echo -e "${YELLOW}Available disks:${NC}"
    lsblk -d -o NAME,SIZE,MODEL,TRAN | grep -E "sd|nvme" || true
    echo ""
    read -rp "Enter the target disk (e.g., sdb, nvme0n1): " TARGET_DISK
    TARGET_DEVICE="/dev/${TARGET_DISK}"

    if [ ! -b "$TARGET_DEVICE" ]; then
        echo -e "${RED}Device $TARGET_DEVICE does not exist${NC}"
        exit 1
    fi

    DISK_SIZE=$(lsblk -b -d -o SIZE -n "$TARGET_DEVICE" 2>/dev/null || echo "0")
    DISK_SIZE_GB=$((DISK_SIZE / 1073741824))

    echo ""
    echo -e "${RED}${BOLD}WARNING: This will ERASE ALL DATA on ${TARGET_DEVICE} (${DISK_SIZE_GB} GB)${NC}"
    echo -e "${RED}Make sure you selected the correct drive!${NC}"
    read -rp "Type YES to continue: " CONFIRM
    if [ "$CONFIRM" != "YES" ]; then
        echo "Aborted."
        exit 0
    fi
}

# ─── Download Ventoy ─────────────────────────────────────────────────────────
VENTOY_VERSION="1.0.97"
VENTOY_DIR="${SCRIPT_DIR}/downloads"

download_ventoy() {
    mkdir -p "$VENTOY_DIR"
    local ventoy_tar="ventoy-${VENTOY_VERSION}-linux.tar.gz"
    local ventoy_url="https://github.com/ventoy/Ventoy/releases/download/v${VENTOY_VERSION}/${ventoy_tar}"

    if [ ! -f "${VENTOY_DIR}/${ventoy_tar}" ]; then
        echo -e "${YELLOW}Downloading Ventoy ${VENTOY_VERSION}...${NC}"
        wget -q --show-progress -O "${VENTOY_DIR}/${ventoy_tar}" "$ventoy_url"
    else
        echo -e "${GREEN}✓ Ventoy archive already downloaded${NC}"
    fi

    tar -xzf "${VENTOY_DIR}/${ventoy_tar}" -C "$VENTOY_DIR"
    echo -e "${GREEN}✓ Ventoy extracted${NC}"
}

# ─── Install Ventoy on disk ──────────────────────────────────────────────────
install_ventoy() {
    echo -e "${YELLOW}Installing Ventoy to ${TARGET_DEVICE}...${NC}"

    # Ventoy creates 2 partitions:
    #   Partition 1: exFAT (for ISOs) — most of the disk
    #   Partition 2: EFI system partition (32MB)
    # We'll let Ventoy do its thing, then resize part1 and add a persistence partition

    local ventoy_bin="${VENTOY_DIR}/ventoy-${VENTOY_VERSION}/Ventoy2Disk.sh"
    chmod +x "$ventoy_bin"

    # Install Ventoy with GPT partition table and secure boot support
    sudo "$ventoy_bin" -I -g -s "$TARGET_DEVICE"

    echo -e "${GREEN}✓ Ventoy installed on ${TARGET_DEVICE}${NC}"
}

# ─── Create persistence partition ─────────────────────────────────────────────
create_persistence_partition() {
    echo -e "${YELLOW}Resizing Ventoy partition and creating persistence partition...${NC}"

    # Unmount if mounted
    sudo umount "${TARGET_DEVICE}"* 2>/dev/null || true
    sleep 2

    # Get the Ventoy data partition (partition 1)
    local ventoy_part="${TARGET_DEVICE}1"
    if [[ "$TARGET_DEVICE" == *"nvme"* ]]; then
        ventoy_part="${TARGET_DEVICE}p1"
    fi

    # We want:
    #   Part 1: Ventoy ISOs — ~200 GB (exFAT)
    #   Part 3: Persistence — rest of disk (~750+ GB, ext4)
    #   Part 2: EFI (already created by Ventoy, 32MB at end)

    # Shrink Ventoy partition 1 to 200GB and create partition 3 for persistence
    local part3_start="200GiB"

    # Use parted to resize and create — Ventoy partition must stay as partition 1
    sudo parted "$TARGET_DEVICE" --script resizepart 1 200GiB
    sudo parted "$TARGET_DEVICE" --script mkpart primary ext4 "$part3_start" 100%

    # Format the persistence partition
    local persist_part="${TARGET_DEVICE}3"
    if [[ "$TARGET_DEVICE" == *"nvme"* ]]; then
        persist_part="${TARGET_DEVICE}p3"
    fi

    sudo mkfs.ext4 -L "PERSISTENCE" "$persist_part"
    echo -e "${GREEN}✓ Persistence partition created and formatted${NC}"
}

# ─── Set up Ventoy configuration ─────────────────────────────────────────────
setup_ventoy_config() {
    echo -e "${YELLOW}Setting up Ventoy boot configuration...${NC}"

    local ventoy_part="${TARGET_DEVICE}1"
    if [[ "$TARGET_DEVICE" == *"nvme"* ]]; then
        ventoy_part="${TARGET_DEVICE}p1"
    fi

    local mount_point="/mnt/ventoy_iso"
    sudo mkdir -p "$mount_point"
    sudo mount "$ventoy_part" "$mount_point"

    # Create Ventoy directory structure
    sudo mkdir -p "$mount_point/ventoy"
    sudo mkdir -p "$mount_point/ISOs/boot-tools"
    sudo mkdir -p "$mount_point/ISOs/workstation"
    sudo mkdir -p "$mount_point/ISOs/recovery"

    # Copy Ventoy config
    sudo cp "${SCRIPT_DIR}/ventoy/ventoy.json" "$mount_point/ventoy/ventoy.json"

    # Copy theme if exists
    if [ -d "${SCRIPT_DIR}/ventoy/themes" ]; then
        sudo cp -r "${SCRIPT_DIR}/ventoy/themes" "$mount_point/ventoy/"
    fi

    echo -e "${GREEN}✓ Ventoy configuration deployed${NC}"
    echo ""
    echo -e "${CYAN}ISO placement directories created:${NC}"
    echo "  ${mount_point}/ISOs/boot-tools/   — Place Hiren's Boot CD & MediCat here"
    echo "  ${mount_point}/ISOs/workstation/   — Place Ubuntu/Linux Mint ISO here"
    echo "  ${mount_point}/ISOs/recovery/      — Place recovery tools here"

    sudo umount "$mount_point"
}

# ─── Set up persistence partition ─────────────────────────────────────────────
setup_persistence() {
    echo -e "${YELLOW}Setting up persistence partition with tools & services...${NC}"

    local persist_part="${TARGET_DEVICE}3"
    if [[ "$TARGET_DEVICE" == *"nvme"* ]]; then
        persist_part="${TARGET_DEVICE}p3"
    fi

    local persist_mount="/mnt/persistence"
    sudo mkdir -p "$persist_mount"
    sudo mount "$persist_part" "$persist_mount"

    # Create directory structure
    sudo mkdir -p "$persist_mount"/{docker,apps,tools,config,data,scripts}
    sudo mkdir -p "$persist_mount/apps/qr-creation-app"
    sudo mkdir -p "$persist_mount/apps/ai-stack"
    sudo mkdir -p "$persist_mount/tools/typescript"
    sudo mkdir -p "$persist_mount/config/autostart"
    sudo mkdir -p "$persist_mount/data/{ollama-models,comfyui-models,postgres,redis}"

    # Copy application files
    echo -e "${YELLOW}Copying QR Creation Application...${NC}"
    sudo cp "${SCRIPT_DIR}/docker/docker-compose.qr-app.yml" "$persist_mount/apps/qr-creation-app/docker-compose.yml"
    sudo cp "${SCRIPT_DIR}/docker/Dockerfile.qr-engine" "$persist_mount/apps/qr-creation-app/"
    sudo cp "${SCRIPT_DIR}/docker/Dockerfile.qr-web" "$persist_mount/apps/qr-creation-app/"

    # Copy the actual QR app source
    sudo cp -r "${SCRIPT_DIR}/../QR-engine.py" "$persist_mount/apps/qr-creation-app/"
    sudo cp -r "${SCRIPT_DIR}/../apps" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true
    sudo cp -r "${SCRIPT_DIR}/../packages" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true
    sudo cp -r "${SCRIPT_DIR}/../package.json" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true
    sudo cp -r "${SCRIPT_DIR}/../pnpm-lock.yaml" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true
    sudo cp -r "${SCRIPT_DIR}/../pnpm-workspace.yaml" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true
    sudo cp -r "${SCRIPT_DIR}/../turbo.json" "$persist_mount/apps/qr-creation-app/" 2>/dev/null || true

    echo -e "${YELLOW}Copying AI stack configuration...${NC}"
    sudo cp "${SCRIPT_DIR}/docker/docker-compose.ai-stack.yml" "$persist_mount/apps/ai-stack/docker-compose.yml"

    echo -e "${YELLOW}Copying startup and utility scripts...${NC}"
    sudo cp "${SCRIPT_DIR}/scripts/"*.sh "$persist_mount/scripts/"
    sudo chmod +x "$persist_mount/scripts/"*.sh

    # Copy environment template
    sudo cp "${SCRIPT_DIR}/config/portable.env" "$persist_mount/config/.env"

    # Copy autostart desktop entry
    sudo cp "${SCRIPT_DIR}/config/cloudconnect-autostart.desktop" "$persist_mount/config/autostart/"

    echo -e "${GREEN}✓ Persistence partition configured${NC}"
    sudo umount "$persist_mount"
}

# ─── Print instructions ──────────────────────────────────────────────────────
print_instructions() {
    echo ""
    echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗"
    echo "║  SSD Build Complete!                                  ║"
    echo "╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Next steps:${NC}"
    echo ""
    echo "1. ${BOLD}Download ISOs${NC} and place them on the Ventoy partition:"
    echo "   Mount ${TARGET_DEVICE}1 and copy ISOs to the ISOs/ folder:"
    echo ""
    echo "   ${CYAN}Hiren's Boot CD PE:${NC}"
    echo "   → https://www.hirensbootcd.org/download/"
    echo "   → Copy to ISOs/boot-tools/"
    echo ""
    echo "   ${CYAN}MediCat USB:${NC}"
    echo "   → https://medicatusb.com/"
    echo "   → Copy to ISOs/boot-tools/"
    echo ""
    echo "   ${CYAN}Ubuntu 24.04 LTS Desktop:${NC}"
    echo "   → https://ubuntu.com/download/desktop"
    echo "   → Copy to ISOs/workstation/"
    echo "   → This will be your main workstation OS"
    echo ""
    echo "   ${CYAN}Linux Mint 22 (optional alternative):${NC}"
    echo "   → https://linuxmint.com/download.php"
    echo "   → Copy to ISOs/workstation/"
    echo ""
    echo "2. ${BOLD}First boot into Ubuntu/Mint${NC} and run the setup:"
    echo "   ${YELLOW}sudo mount /dev/disk/by-label/PERSISTENCE /mnt/persist${NC}"
    echo "   ${YELLOW}/mnt/persist/scripts/first-boot-setup.sh${NC}"
    echo ""
    echo "   This installs Docker, NVIDIA drivers (if detected), and"
    echo "   launches all services (QR App, AI Stack, Dev Tools)."
    echo ""
    echo "3. ${BOLD}Access services${NC} (after first-boot-setup completes):"
    echo "   QR Creation App:    http://localhost:3000"
    echo "   QR Python Engine:   http://localhost:5001"
    echo "   Open WebUI (Chat):  http://localhost:3001"
    echo "   Ollama API:         http://localhost:11434"
    echo "   ComfyUI:            http://localhost:8188"
    echo "   AnythingLLM:        http://localhost:3002"
    echo "   Portainer:          http://localhost:9443"
    echo ""
    echo "4. ${BOLD}On subsequent boots:${NC}"
    echo "   Everything auto-starts via the persistence overlay."
    echo "   Or manually run: ${YELLOW}/mnt/persist/scripts/start-all.sh${NC}"
    echo ""
    echo -e "${GREEN}${BOLD}Your portable SSD is ready!${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    check_dependencies
    select_disk
    download_ventoy
    install_ventoy
    create_persistence_partition
    setup_ventoy_config
    setup_persistence
    print_instructions
}

# Allow running individual steps
case "${1:-all}" in
    ventoy)     check_dependencies; select_disk; download_ventoy; install_ventoy ;;
    partition)  check_dependencies; select_disk; create_persistence_partition ;;
    config)     check_dependencies; select_disk; setup_ventoy_config ;;
    persist)    check_dependencies; select_disk; setup_persistence ;;
    all)        main ;;
    *)          echo "Usage: $0 {all|ventoy|partition|config|persist}"; exit 1 ;;
esac

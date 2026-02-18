#!/bin/bash
set -euo pipefail

# ============================================================================
# CloudConnect — Phone/Tablet Connectivity
# Exposes services over local network so phones/tablets can access the SSD
# workstation. Also sets up USB tethering fallback.
# ============================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}CloudConnect Phone/Tablet Connectivity Setup${NC}"
echo ""

# Get the local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')

if [ -z "$LOCAL_IP" ]; then
    echo -e "${YELLOW}No network connection detected. Setting up USB tethering...${NC}"

    # Enable USB RNDIS gadget for direct phone-to-SSD connection
    # This creates a virtual network interface when connected via USB
    sudo modprobe g_ether 2>/dev/null || true

    # Check for USB network interface
    USB_IF=$(ip link show | grep -o 'usb[0-9]*\|enp.*usb.*' | head -1)
    if [ -n "$USB_IF" ]; then
        sudo ip addr add 192.168.42.1/24 dev "$USB_IF" 2>/dev/null || true
        sudo ip link set "$USB_IF" up

        # Start a simple DHCP for the phone
        if command -v dnsmasq &>/dev/null; then
            sudo dnsmasq --interface="$USB_IF" \
                --dhcp-range=192.168.42.10,192.168.42.50,12h \
                --no-daemon &
        fi

        LOCAL_IP="192.168.42.1"
        echo -e "${GREEN}USB tethering active. Phone IP: 192.168.42.x${NC}"
    else
        echo -e "${YELLOW}No USB network interface found.${NC}"
        echo "Connect your phone to the same WiFi network as this machine."
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Access services from your phone/tablet at:${NC}"
echo ""
echo "  QR App:       http://${LOCAL_IP}:3000"
echo "  Open WebUI:   http://${LOCAL_IP}:3001"
echo "  ComfyUI:      http://${LOCAL_IP}:8188"
echo "  AnythingLLM:  http://${LOCAL_IP}:3002"
echo "  Dashboard:    http://${LOCAL_IP}:8080"
echo ""

# Start a simple HTTP server for the dashboard on port 8080
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v python3 &>/dev/null; then
    echo -e "${YELLOW}Starting dashboard server on port 8080...${NC}"
    cd "$SCRIPT_DIR"
    python3 -m http.server 8080 --bind 0.0.0.0 &
    DASH_PID=$!
    echo -e "${GREEN}Dashboard serving at http://${LOCAL_IP}:8080/dashboard.html${NC}"
    echo ""
    echo "Press Ctrl+C to stop the dashboard server"
    wait $DASH_PID
fi

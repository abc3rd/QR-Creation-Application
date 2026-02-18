#!/bin/bash
# Open the CloudConnect dashboard in the default browser
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
xdg-open "${SCRIPT_DIR}/dashboard.html" 2>/dev/null || \
sensible-browser "${SCRIPT_DIR}/dashboard.html" 2>/dev/null || \
echo "Open ${SCRIPT_DIR}/dashboard.html in your browser"

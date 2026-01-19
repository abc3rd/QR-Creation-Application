from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import qrcode
import os

app = Flask(__name__)
CORS(app) # Allows the syncloudconnect.com dashboard to call this engine

# OMEGA UI DESIGN TOKENS
BASE_DOMAIN = "http://localhost:8888"
ACCENT_MAGENTA = "\033[95m" # ANSI Magenta for console accents
RESET = "\033[0m"

def generate_qr_bw(slug, target_url):
    """Generates simple high-contrast Black & White QR for functionality."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(redirect_url)
    qr.make(fit=True)

    # Force standard Black & White for high-reliability IoT scanning
    img = qr.make_image(fill_color="black", back_color="white")
    
    filename = f"qr_{slug}.png"
    img.save(filename)
    return filename

@app.route('/generate', methods=['POST'])
def api_generate():
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    
    file = generate_qr_bw(slug, target)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} QR Generated: {file}")
    return jsonify({"status": "success", "file": file})

@app.route('/<path:filename>')
def serve_qr(filename):
    """Serves the generated B&W images back to the Omega UI Hub frontend."""
    return send_from_directory('.', filename)

if __name__ == "__main__":
    # Initial system generation for the Universal Command Protocol launch
    generate_qr_bw("ucp-launch", "https://syncloudconnect.com/ucp")
    print(f"{ACCENT_MAGENTA}Omega QR Engine{RESET} listening on port 5001...")
    app.run(port=5001)
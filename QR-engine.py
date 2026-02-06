from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import qrcode
import qrcode.image.styledpil
import qrcode.image.styles.moduledrawers
import qrcode.image.styles.colormasks
import os
import io
import base64
from PIL import Image, ImageDraw

app = Flask(__name__)
CORS(app)

# OMEGA UI DESIGN TOKENS
BASE_DOMAIN = "http://localhost:8888"
ACCENT_MAGENTA = "\033[95m"
RESET = "\033[0m"

# Output directory for generated QR codes
QR_OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qr_output")
os.makedirs(QR_OUTPUT_DIR, exist_ok=True)

# ─── QR Type Constants ───
QR_TYPES = {
    "standard": "Standard QR Code",
    "micro": "Micro QR Code (compact, small footprint)",
    "compact": "Compact QR Code (optimized data encoding)",
    "custom": "Custom Styled QR Code (dot patterns, colors)",
    "cube3d": "3D Cube QR Code (QR on each face)",
    "holographic": "Holographic QR Code (gradient color effect)",
}

# Module drawer styles for custom QR codes
DRAWER_STYLES = {
    "square": qrcode.image.styles.moduledrawers.SquareModuleDrawer,
    "gapped_square": qrcode.image.styles.moduledrawers.GappedSquareModuleDrawer,
    "circle": qrcode.image.styles.moduledrawers.CircleModuleDrawer,
    "rounded": qrcode.image.styles.moduledrawers.RoundedModuleDrawer,
    "vertical_bars": qrcode.image.styles.moduledrawers.VerticalBarsDrawer,
    "horizontal_bars": qrcode.image.styles.moduledrawers.HorizontalBarsDrawer,
}


def generate_qr_bw(slug, target_url):
    """Generates simple high-contrast Black & White QR for functionality."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(redirect_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_micro_qr(slug, target_url, box_size=4, border=1):
    """Generates a Micro QR Code - minimal size, small footprint.

    Uses the smallest possible QR version with low error correction
    to minimize module count, suitable for embedding in small spaces.
    """
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,  # Smallest version (21x21 modules)
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=box_size,
        border=border,
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_micro_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_compact_qr(slug, target_url, box_size=6, border=2):
    """Generates a Compact QR Code - optimized encoding for shorter data.

    Uses auto-fit versioning with low error correction to produce
    the smallest possible QR for the given data payload.
    """
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=None,  # Auto-fit to smallest version
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=box_size,
        border=border,
    )
    qr.add_data(redirect_url, optimize=20)  # Optimize encoding mode
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_compact_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_custom_qr(slug, target_url, style="circle", fg_color="black",
                        bg_color="white", box_size=10, border=4):
    """Generates a Custom Styled QR Code with dot patterns and colors.

    Supports multiple module drawer styles: square, gapped_square,
    circle, rounded, vertical_bars, horizontal_bars.
    """
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    drawer_class = DRAWER_STYLES.get(style, DRAWER_STYLES["square"])

    img = qr.make_image(
        image_factory=qrcode.image.styledpil.StyledPilImage,
        module_drawer=drawer_class(),
        color_mask=qrcode.image.styles.colormasks.SolidFillColorMask(
            back_color=_parse_color(bg_color),
            front_color=_parse_color(fg_color),
        ),
    )

    filename = f"qr_custom_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_holographic_qr(slug, target_url, box_size=10, border=4):
    """Generates a Holographic QR Code with gradient color effect.

    Creates a QR code with a multi-color gradient applied across
    the modules, simulating a holographic/iridescent appearance.
    """
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    # Holographic gradient colors (rainbow-like)
    img = qr.make_image(
        image_factory=qrcode.image.styledpil.StyledPilImage,
        module_drawer=qrcode.image.styles.moduledrawers.RoundedModuleDrawer(),
        color_mask=qrcode.image.styles.colormasks.HorizontalGradiantColorMask(
            back_color=(255, 255, 255),
            left_color=(138, 43, 226),   # Blue-violet
            right_color=(0, 206, 209),   # Dark cyan
        ),
    )

    filename = f"qr_holo_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_cube3d_qr(slug, target_url, face_size=200):
    """Generates a 3D Cube visualization with QR codes on three visible faces.

    Creates an isometric cube image with the same QR code rendered
    on the top, left, and right faces with perspective transforms.
    """
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    # Generate the base QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8,
        border=2,
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    qr_img = qr_img.resize((face_size, face_size), Image.LANCZOS)

    # Canvas for isometric cube
    canvas_w = int(face_size * 2.2)
    canvas_h = int(face_size * 2.5)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 0))

    # Top face (skewed) - parallelogram transform
    top_face = qr_img.copy()
    top_coeffs = _find_affine_transform(
        face_size, face_size,
        canvas_w // 2, int(canvas_h * 0.05),              # top center
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.3),  # top right
        canvas_w // 2, int(canvas_h * 0.55),               # center
        int(face_size * 0.1), int(canvas_h * 0.3),         # top left
    )
    if top_coeffs:
        top_transformed = top_face.transform(
            (canvas_w, canvas_h), Image.PERSPECTIVE, top_coeffs, Image.BICUBIC
        )
        canvas = Image.alpha_composite(canvas, top_transformed)

    # Left face
    left_face = qr_img.copy()
    left_coeffs = _find_affine_transform(
        face_size, face_size,
        int(face_size * 0.1), int(canvas_h * 0.3),         # top left
        canvas_w // 2, int(canvas_h * 0.55),               # top right
        canvas_w // 2, int(canvas_h * 0.95),               # bottom right
        int(face_size * 0.1), int(canvas_h * 0.7),         # bottom left
    )
    if left_coeffs:
        left_transformed = left_face.transform(
            (canvas_w, canvas_h), Image.PERSPECTIVE, left_coeffs, Image.BICUBIC
        )
        canvas = Image.alpha_composite(canvas, left_transformed)

    # Right face
    right_face = qr_img.copy()
    right_coeffs = _find_affine_transform(
        face_size, face_size,
        canvas_w // 2, int(canvas_h * 0.55),               # top left
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.3),  # top right
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.7),  # bottom right
        canvas_w // 2, int(canvas_h * 0.95),               # bottom left
    )
    if right_coeffs:
        right_transformed = right_face.transform(
            (canvas_w, canvas_h), Image.PERSPECTIVE, right_coeffs, Image.BICUBIC
        )
        canvas = Image.alpha_composite(canvas, right_transformed)

    filename = f"qr_cube3d_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    canvas.save(filepath)
    return filename


def _find_affine_transform(w, h, x0, y0, x1, y1, x2, y2, x3, y3):
    """Compute perspective transform coefficients for mapping a rectangle
    (0,0)-(w,h) to the quadrilateral (x0,y0)-(x1,y1)-(x2,y2)-(x3,y3)."""
    import numpy as np
    src = np.array([
        [0, 0], [w, 0], [w, h], [0, h]
    ], dtype=np.float64)
    dst = np.array([
        [x0, y0], [x1, y1], [x2, y2], [x3, y3]
    ], dtype=np.float64)

    # Solve for 8 perspective coefficients
    A = []
    for i in range(4):
        sx, sy = src[i]
        dx, dy = dst[i]
        A.append([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy])
        A.append([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy])
    A = np.array(A)
    b = dst.flatten()
    try:
        coeffs = np.linalg.solve(A, b)
        return tuple(coeffs)
    except np.linalg.LinAlgError:
        return None


def _parse_color(color_str):
    """Parse a color string (hex or name) to an RGB tuple."""
    if color_str.startswith("#"):
        color_str = color_str.lstrip("#")
        if len(color_str) == 3:
            color_str = "".join(c * 2 for c in color_str)
        return tuple(int(color_str[i:i + 2], 16) for i in (0, 2, 4))
    color_map = {
        "black": (0, 0, 0), "white": (255, 255, 255),
        "red": (255, 0, 0), "green": (0, 128, 0), "blue": (0, 0, 255),
        "cyan": (0, 255, 255), "magenta": (255, 0, 255), "yellow": (255, 255, 0),
    }
    return color_map.get(color_str.lower(), (0, 0, 0))


def _img_to_base64(filepath):
    """Convert an image file to a base64 data URI string."""
    with open(filepath, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


# ─── API Routes ───

@app.route('/generate', methods=['POST'])
def api_generate():
    """Generate a standard B&W QR code."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")

    file = generate_qr_bw(slug, target)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} QR Generated: {file}")
    return jsonify({"status": "success", "file": file, "type": "standard"})


@app.route('/generate/micro', methods=['POST'])
def api_generate_micro():
    """Generate a Micro QR code - minimal size for small spaces."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    box_size = data.get("box_size", 4)
    border = data.get("border", 1)

    file = generate_micro_qr(slug, target, box_size=box_size, border=border)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} Micro QR Generated: {file}")
    return jsonify({"status": "success", "file": file, "type": "micro"})


@app.route('/generate/compact', methods=['POST'])
def api_generate_compact():
    """Generate a Compact QR code - optimized encoding for minimal size."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    box_size = data.get("box_size", 6)
    border = data.get("border", 2)

    file = generate_compact_qr(slug, target, box_size=box_size, border=border)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} Compact QR Generated: {file}")
    return jsonify({"status": "success", "file": file, "type": "compact"})


@app.route('/generate/custom', methods=['POST'])
def api_generate_custom():
    """Generate a Custom Styled QR code with dot patterns and colors."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    style = data.get("style", "circle")
    fg_color = data.get("fg_color", "black")
    bg_color = data.get("bg_color", "white")
    box_size = data.get("box_size", 10)
    border = data.get("border", 4)

    file = generate_custom_qr(
        slug, target, style=style, fg_color=fg_color,
        bg_color=bg_color, box_size=box_size, border=border
    )
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} Custom QR Generated ({style}): {file}")
    return jsonify({
        "status": "success", "file": file, "type": "custom",
        "style": style, "available_styles": list(DRAWER_STYLES.keys()),
    })


@app.route('/generate/holographic', methods=['POST'])
def api_generate_holographic():
    """Generate a Holographic QR code with gradient color effect."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    box_size = data.get("box_size", 10)
    border = data.get("border", 4)

    file = generate_holographic_qr(slug, target, box_size=box_size, border=border)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} Holographic QR Generated: {file}")
    return jsonify({"status": "success", "file": file, "type": "holographic"})


@app.route('/generate/cube3d', methods=['POST'])
def api_generate_cube3d():
    """Generate a 3D Cube QR code with QR on each visible face."""
    data = request.json
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    face_size = data.get("face_size", 200)

    file = generate_cube3d_qr(slug, target, face_size=face_size)
    print(f"{ACCENT_MAGENTA}[Omega UI]{RESET} 3D Cube QR Generated: {file}")
    return jsonify({"status": "success", "file": file, "type": "cube3d"})


@app.route('/types', methods=['GET'])
def api_list_types():
    """List all available QR code types and their descriptions."""
    return jsonify({
        "types": QR_TYPES,
        "styles": list(DRAWER_STYLES.keys()),
    })


@app.route('/qr_output/<path:filename>')
def serve_qr(filename):
    """Serves the generated QR images back to the Omega UI Hub frontend."""
    return send_from_directory(QR_OUTPUT_DIR, filename)


if __name__ == "__main__":
    # Initial system generation for the Universal Command Protocol launch
    generate_qr_bw("ucp-launch", "https://syncloudconnect.com/ucp")
    print(f"{ACCENT_MAGENTA}Omega QR Engine{RESET} listening on port 5001...")
    print(f"{ACCENT_MAGENTA}Available QR Types:{RESET}")
    for qr_type, desc in QR_TYPES.items():
        print(f"  - {qr_type}: {desc}")
    app.run(port=5001)
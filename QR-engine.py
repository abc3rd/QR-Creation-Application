from flask import Flask, request, jsonify, send_from_directory, send_file, abort
from flask_cors import CORS
import qrcode
import qrcode.image.styledpil
import qrcode.image.styles.moduledrawers
import qrcode.image.styles.colormasks
import os
import io
import re
import time
import hmac
import hashlib
import secrets
import base64
import logging
from functools import wraps
from collections import defaultdict
from PIL import Image, ImageDraw

# ─── Logging Configuration ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("qr-engine")

app = Flask(__name__)

# ─── Security Configuration ───
# API key for authenticating requests from the frontend
# In production, load from environment variable
API_KEY = os.environ.get("QR_ENGINE_API_KEY", "")
if not API_KEY:
    API_KEY = secrets.token_urlsafe(48)
    logger.warning("QR_ENGINE_API_KEY not set. Generated ephemeral key: %s", API_KEY)

# HMAC signing secret for request integrity verification
HMAC_SECRET = os.environ.get("QR_ENGINE_HMAC_SECRET", "")
if not HMAC_SECRET:
    HMAC_SECRET = secrets.token_urlsafe(32)
    logger.warning("QR_ENGINE_HMAC_SECRET not set. Generated ephemeral secret.")

# Allowed origins for CORS (restrict in production)
ALLOWED_ORIGINS = os.environ.get(
    "QR_ENGINE_ALLOWED_ORIGINS",
    "http://localhost:8888,http://localhost:3000"
).split(",")

CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

# ─── Rate Limiting ───
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("QR_RATE_LIMIT", "30"))

_rate_limit_store = defaultdict(list)


def _get_client_ip():
    """Extract real client IP, respecting X-Forwarded-For behind proxies."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limit_check():
    """Sliding window rate limiter per client IP."""
    client_ip = _get_client_ip()
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW

    # Clean old entries
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if t > window_start
    ]

    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False, len(_rate_limit_store[client_ip])

    _rate_limit_store[client_ip].append(now)
    return True, len(_rate_limit_store[client_ip])


# ─── Input Validation ───
SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
HEX_COLOR_PATTERN = re.compile(r"^#?[0-9a-fA-F]{3,6}$")
NAMED_COLORS = {"black", "white", "red", "green", "blue", "cyan", "magenta", "yellow"}
VALID_STYLES = {"square", "gapped_square", "circle", "rounded", "vertical_bars", "horizontal_bars"}
MAX_BOX_SIZE = 20
MAX_BORDER = 10
MAX_FACE_SIZE = 500


def validate_slug(slug):
    """Validate slug format to prevent path traversal and injection."""
    if not slug or not SLUG_PATTERN.match(slug):
        return False
    return True


def validate_color(color_str):
    """Validate color string is a safe hex or named color."""
    if not color_str:
        return False
    if color_str.lower() in NAMED_COLORS:
        return True
    if HEX_COLOR_PATTERN.match(color_str):
        return True
    return False


def validate_integer(value, min_val=1, max_val=100):
    """Validate and clamp integer values."""
    try:
        val = int(value)
        return max(min_val, min(val, max_val))
    except (TypeError, ValueError):
        return min_val


# ─── Security Decorators ───

def require_api_key(f):
    """Decorator to require valid API key in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            logger.warning("Missing API key from %s on %s", _get_client_ip(), request.path)
            return jsonify({"error": "Missing API key", "code": "UNAUTHORIZED"}), 401

        provided_key = auth_header[7:]  # Strip "Bearer "
        if not hmac.compare_digest(provided_key, API_KEY):
            logger.warning("Invalid API key from %s on %s", _get_client_ip(), request.path)
            return jsonify({"error": "Invalid API key", "code": "FORBIDDEN"}), 403

        return f(*args, **kwargs)
    return decorated


def rate_limited(f):
    """Decorator to enforce rate limiting per client IP."""
    @wraps(f)
    def decorated(*args, **kwargs):
        allowed, count = _rate_limit_check()
        if not allowed:
            logger.warning("Rate limit exceeded for %s (%d requests)", _get_client_ip(), count)
            response = jsonify({
                "error": "Rate limit exceeded. Try again later.",
                "code": "RATE_LIMITED",
                "retry_after": RATE_LIMIT_WINDOW,
            })
            response.status_code = 429
            response.headers["Retry-After"] = str(RATE_LIMIT_WINDOW)
            response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_MAX_REQUESTS)
            response.headers["X-RateLimit-Remaining"] = "0"
            return response

        response = f(*args, **kwargs)
        if hasattr(response, "headers"):
            response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_MAX_REQUESTS)
            response.headers["X-RateLimit-Remaining"] = str(RATE_LIMIT_MAX_REQUESTS - count)
        return response
    return decorated


def verify_request_signature(f):
    """Decorator to verify HMAC signature on request body for integrity."""
    @wraps(f)
    def decorated(*args, **kwargs):
        signature = request.headers.get("X-QR-Signature", "")
        timestamp = request.headers.get("X-QR-Timestamp", "")

        # Skip signature verification if no signature header (backwards compat)
        if not signature:
            return f(*args, **kwargs)

        # Verify timestamp freshness (5 minute window to prevent replay attacks)
        try:
            ts = int(timestamp)
            if abs(time.time() - ts) > 300:
                logger.warning("Stale request signature from %s (ts=%s)", _get_client_ip(), timestamp)
                return jsonify({"error": "Request expired", "code": "STALE_REQUEST"}), 401
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid timestamp", "code": "BAD_REQUEST"}), 400

        # Compute expected signature
        body = request.get_data(as_text=True)
        payload = f"{timestamp}.{body}"
        expected = hmac.new(
            HMAC_SECRET.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, expected):
            logger.warning("Invalid request signature from %s on %s", _get_client_ip(), request.path)
            return jsonify({"error": "Invalid signature", "code": "INTEGRITY_FAILURE"}), 403

        return f(*args, **kwargs)
    return decorated


def audit_log(action):
    """Decorator to log QR generation events for audit trail."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            client_ip = _get_client_ip()
            logger.info(
                "AUDIT: action=%s ip=%s path=%s user_agent=%s",
                action,
                client_ip,
                request.path,
                request.headers.get("User-Agent", "unknown")[:100],
            )
            result = f(*args, **kwargs)
            return result
        return decorated
    return decorator


# ─── OMEGA UI DESIGN TOKENS ───
BASE_DOMAIN = os.environ.get("QR_BASE_DOMAIN", "http://localhost:8888")
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

# Plan-based licensing: which plans can access which QR types
QR_TYPE_PLAN_REQUIREMENTS = {
    "standard": "free",
    "micro": "free",
    "compact": "pro",
    "custom": "pro",
    "holographic": "business",
    "cube3d": "business",
}

PLAN_HIERARCHY = {"free": 0, "pro": 1, "business": 2, "enterprise": 3}

# Module drawer styles for custom QR codes
DRAWER_STYLES = {
    "square": qrcode.image.styles.moduledrawers.SquareModuleDrawer,
    "gapped_square": qrcode.image.styles.moduledrawers.GappedSquareModuleDrawer,
    "circle": qrcode.image.styles.moduledrawers.CircleModuleDrawer,
    "rounded": qrcode.image.styles.moduledrawers.RoundedModuleDrawer,
    "vertical_bars": qrcode.image.styles.moduledrawers.VerticalBarsDrawer,
    "horizontal_bars": qrcode.image.styles.moduledrawers.HorizontalBarsDrawer,
}


def check_plan_access(qr_type, user_plan="free"):
    """Verify the user's plan allows access to the requested QR type."""
    required_plan = QR_TYPE_PLAN_REQUIREMENTS.get(qr_type, "business")
    user_level = PLAN_HIERARCHY.get(user_plan, 0)
    required_level = PLAN_HIERARCHY.get(required_plan, 0)

    if user_level < required_level:
        return False, required_plan
    return True, required_plan


# ─── QR Generation Functions ───

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
    """Generates a Micro QR Code - minimal size, small footprint."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=validate_integer(box_size, 2, MAX_BOX_SIZE),
        border=validate_integer(border, 0, MAX_BORDER),
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_micro_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_compact_qr(slug, target_url, box_size=6, border=2):
    """Generates a Compact QR Code - optimized encoding for shorter data."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=validate_integer(box_size, 2, MAX_BOX_SIZE),
        border=validate_integer(border, 0, MAX_BORDER),
    )
    qr.add_data(redirect_url, optimize=20)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    filename = f"qr_compact_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_custom_qr(slug, target_url, style="circle", fg_color="black",
                        bg_color="white", box_size=10, border=4):
    """Generates a Custom Styled QR Code with dot patterns and colors."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=validate_integer(box_size, 2, MAX_BOX_SIZE),
        border=validate_integer(border, 0, MAX_BORDER),
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    safe_style = style if style in VALID_STYLES else "square"
    drawer_class = DRAWER_STYLES.get(safe_style, DRAWER_STYLES["square"])

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
    """Generates a Holographic QR Code with gradient color effect."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=validate_integer(box_size, 2, MAX_BOX_SIZE),
        border=validate_integer(border, 0, MAX_BORDER),
    )
    qr.add_data(redirect_url)
    qr.make(fit=True)

    img = qr.make_image(
        image_factory=qrcode.image.styledpil.StyledPilImage,
        module_drawer=qrcode.image.styles.moduledrawers.RoundedModuleDrawer(),
        color_mask=qrcode.image.styles.colormasks.HorizontalGradiantColorMask(
            back_color=(255, 255, 255),
            left_color=(138, 43, 226),
            right_color=(0, 206, 209),
        ),
    )

    filename = f"qr_holo_{slug}.png"
    filepath = os.path.join(QR_OUTPUT_DIR, filename)
    img.save(filepath)
    return filename


def generate_cube3d_qr(slug, target_url, face_size=200):
    """Generates a 3D Cube visualization with QR codes on three visible faces."""
    redirect_url = f"{BASE_DOMAIN}/q/{slug}"
    face_size = validate_integer(face_size, 50, MAX_FACE_SIZE)

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

    canvas_w = int(face_size * 2.2)
    canvas_h = int(face_size * 2.5)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 0))

    top_face = qr_img.copy()
    top_coeffs = _find_affine_transform(
        face_size, face_size,
        canvas_w // 2, int(canvas_h * 0.05),
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.3),
        canvas_w // 2, int(canvas_h * 0.55),
        int(face_size * 0.1), int(canvas_h * 0.3),
    )
    if top_coeffs:
        top_transformed = top_face.transform(
            (canvas_w, canvas_h), Image.PERSPECTIVE, top_coeffs, Image.BICUBIC
        )
        canvas = Image.alpha_composite(canvas, top_transformed)

    left_face = qr_img.copy()
    left_coeffs = _find_affine_transform(
        face_size, face_size,
        int(face_size * 0.1), int(canvas_h * 0.3),
        canvas_w // 2, int(canvas_h * 0.55),
        canvas_w // 2, int(canvas_h * 0.95),
        int(face_size * 0.1), int(canvas_h * 0.7),
    )
    if left_coeffs:
        left_transformed = left_face.transform(
            (canvas_w, canvas_h), Image.PERSPECTIVE, left_coeffs, Image.BICUBIC
        )
        canvas = Image.alpha_composite(canvas, left_transformed)

    right_face = qr_img.copy()
    right_coeffs = _find_affine_transform(
        face_size, face_size,
        canvas_w // 2, int(canvas_h * 0.55),
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.3),
        canvas_w - int(face_size * 0.1), int(canvas_h * 0.7),
        canvas_w // 2, int(canvas_h * 0.95),
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
    """Compute perspective transform coefficients."""
    import numpy as np
    src = np.array([
        [0, 0], [w, 0], [w, h], [0, h]
    ], dtype=np.float64)
    dst = np.array([
        [x0, y0], [x1, y1], [x2, y2], [x3, y3]
    ], dtype=np.float64)

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
    """Parse a validated color string to an RGB tuple."""
    if not validate_color(color_str):
        return (0, 0, 0)
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


# ─── Security Response Headers ───

@app.after_request
def add_security_headers(response):
    """Add security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'"
    # Remove server identification
    response.headers.pop("Server", None)
    return response


# ─── Error Handlers ───

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found", "code": "NOT_FOUND"}), 404


@app.errorhandler(500)
def server_error(e):
    logger.error("Internal error: %s", str(e))
    return jsonify({"error": "Internal server error", "code": "INTERNAL_ERROR"}), 500


# ─── API Routes ───

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint (no auth required)."""
    return jsonify({"status": "healthy", "service": "qr-engine"})


@app.route('/generate', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_standard")
def api_generate():
    """Generate a standard B&W QR code."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    file = generate_qr_bw(slug, target)
    logger.info("QR Generated: %s for slug=%s", file, slug)
    return jsonify({"status": "success", "file": file, "type": "standard"})


@app.route('/generate/micro', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_micro")
def api_generate_micro():
    """Generate a Micro QR code - minimal size for small spaces."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    plan = data.get("plan", "free")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    allowed, required = check_plan_access("micro", plan)
    if not allowed:
        return jsonify({
            "error": f"Micro QR requires {required} plan or above",
            "code": "PLAN_REQUIRED",
            "required_plan": required,
        }), 403

    box_size = data.get("box_size", 4)
    border = data.get("border", 1)

    file = generate_micro_qr(slug, target, box_size=box_size, border=border)
    logger.info("Micro QR Generated: %s for slug=%s", file, slug)
    return jsonify({"status": "success", "file": file, "type": "micro"})


@app.route('/generate/compact', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_compact")
def api_generate_compact():
    """Generate a Compact QR code - optimized encoding for minimal size."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    plan = data.get("plan", "free")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    allowed, required = check_plan_access("compact", plan)
    if not allowed:
        return jsonify({
            "error": f"Compact QR requires {required} plan or above",
            "code": "PLAN_REQUIRED",
            "required_plan": required,
        }), 403

    box_size = data.get("box_size", 6)
    border = data.get("border", 2)

    file = generate_compact_qr(slug, target, box_size=box_size, border=border)
    logger.info("Compact QR Generated: %s for slug=%s", file, slug)
    return jsonify({"status": "success", "file": file, "type": "compact"})


@app.route('/generate/custom', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_custom")
def api_generate_custom():
    """Generate a Custom Styled QR code with dot patterns and colors."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    plan = data.get("plan", "free")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    allowed, required = check_plan_access("custom", plan)
    if not allowed:
        return jsonify({
            "error": f"Custom QR requires {required} plan or above",
            "code": "PLAN_REQUIRED",
            "required_plan": required,
        }), 403

    style = data.get("style", "circle")
    fg_color = data.get("fg_color", "black")
    bg_color = data.get("bg_color", "white")

    if not validate_color(fg_color):
        return jsonify({"error": "Invalid foreground color", "code": "VALIDATION_ERROR"}), 400
    if not validate_color(bg_color):
        return jsonify({"error": "Invalid background color", "code": "VALIDATION_ERROR"}), 400

    box_size = data.get("box_size", 10)
    border = data.get("border", 4)

    file = generate_custom_qr(
        slug, target, style=style, fg_color=fg_color,
        bg_color=bg_color, box_size=box_size, border=border
    )
    logger.info("Custom QR Generated (%s): %s for slug=%s", style, file, slug)
    return jsonify({
        "status": "success", "file": file, "type": "custom",
        "style": style, "available_styles": list(DRAWER_STYLES.keys()),
    })


@app.route('/generate/holographic', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_holographic")
def api_generate_holographic():
    """Generate a Holographic QR code with gradient color effect."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    plan = data.get("plan", "free")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    allowed, required = check_plan_access("holographic", plan)
    if not allowed:
        return jsonify({
            "error": f"Holographic QR requires {required} plan or above",
            "code": "PLAN_REQUIRED",
            "required_plan": required,
        }), 403

    box_size = data.get("box_size", 10)
    border = data.get("border", 4)

    file = generate_holographic_qr(slug, target, box_size=box_size, border=border)
    logger.info("Holographic QR Generated: %s for slug=%s", file, slug)
    return jsonify({"status": "success", "file": file, "type": "holographic"})


@app.route('/generate/cube3d', methods=['POST'])
@require_api_key
@rate_limited
@verify_request_signature
@audit_log("generate_cube3d")
def api_generate_cube3d():
    """Generate a 3D Cube QR code with QR on each visible face."""
    data = request.json or {}
    slug = data.get("slug", "iot-dev")
    target = data.get("target", "https://syncloudconnect.com")
    plan = data.get("plan", "free")

    if not validate_slug(slug):
        return jsonify({"error": "Invalid slug format", "code": "VALIDATION_ERROR"}), 400

    allowed, required = check_plan_access("cube3d", plan)
    if not allowed:
        return jsonify({
            "error": f"3D Cube QR requires {required} plan or above",
            "code": "PLAN_REQUIRED",
            "required_plan": required,
        }), 403

    face_size = data.get("face_size", 200)

    file = generate_cube3d_qr(slug, target, face_size=face_size)
    logger.info("3D Cube QR Generated: %s for slug=%s", file, slug)
    return jsonify({"status": "success", "file": file, "type": "cube3d"})


@app.route('/types', methods=['GET'])
@rate_limited
def api_list_types():
    """List all available QR code types and their plan requirements."""
    return jsonify({
        "types": QR_TYPES,
        "styles": list(DRAWER_STYLES.keys()),
        "plan_requirements": QR_TYPE_PLAN_REQUIREMENTS,
        "plan_hierarchy": PLAN_HIERARCHY,
    })


@app.route('/qr_output/<path:filename>')
@rate_limited
def serve_qr(filename):
    """Serves generated QR images. Validates filename to prevent path traversal."""
    # Sanitize filename - only allow alphanumeric, underscore, hyphen, and .png
    safe_name = os.path.basename(filename)
    if not re.match(r'^[a-zA-Z0-9_-]+\.png$', safe_name):
        abort(400, "Invalid filename")

    filepath = os.path.join(QR_OUTPUT_DIR, safe_name)
    if not os.path.isfile(filepath):
        abort(404)

    return send_from_directory(QR_OUTPUT_DIR, safe_name)


if __name__ == "__main__":
    generate_qr_bw("ucp-launch", "https://syncloudconnect.com/ucp")
    logger.info("Omega QR Engine listening on port 5001...")
    logger.info("API Key: %s...", API_KEY[:12])
    logger.info("CORS Origins: %s", ALLOWED_ORIGINS)
    logger.info("Rate Limit: %d req/%ds", RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW)
    logger.info("Available QR Types:")
    for qr_type, desc in QR_TYPES.items():
        plan_req = QR_TYPE_PLAN_REQUIREMENTS.get(qr_type, "free")
        logger.info("  - %s [%s]: %s", qr_type, plan_req, desc)
    app.run(port=5001)

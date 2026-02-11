import qrcodegen from "./codegen";
import type {
  QRCodeType,
  QRCornerStyle,
  QRDotStyle,
  GradientDirection,
} from "./types";

export const ERROR_LEVEL_MAP: { [index: string]: qrcodegen.QrCode.Ecc } = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
};

export const DEFAULT_SIZE = 128;
export const DEFAULT_LEVEL = "L";
export const DEFAULT_BGCOLOR = "#FFFFFF";
export const DEFAULT_FGCOLOR = "#000000";
export const DEFAULT_MARGIN = 2;

export const QR_LEVELS = ["L", "M", "Q", "H"] as const;

// This is *very* rough estimate of max amount of QRCode allowed to be covered.
// It is "wrong" in a lot of ways (area is a terrible way to estimate, it
// really should be number of modules covered), but if for some reason we don't
// get an explicit height or width, I'd rather default to something than throw.
export const DEFAULT_IMG_SCALE = 0.1;

/** Available QR code types with labels */
export const QR_TYPE_OPTIONS: { value: QRCodeType; label: string; description: string }[] = [
  { value: "standard", label: "Standard", description: "Classic QR code" },
  { value: "micro", label: "Micro", description: "Compact, small footprint" },
  { value: "compact", label: "Compact", description: "Optimized data encoding" },
  { value: "custom", label: "Custom", description: "Styled dot patterns" },
  { value: "holographic", label: "Holographic", description: "Gradient color effect" },
  { value: "cube3d", label: "3D Cube", description: "QR on cube faces" },
];

/** Available dot styles for custom QR codes */
export const QR_DOT_STYLES: { value: QRDotStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
  { value: "diamond", label: "Diamond" },
];

/** Available corner styles for finder patterns */
export const QR_CORNER_STYLES: { value: QRCornerStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

/** Available gradient directions for holographic QR codes */
export const QR_GRADIENT_DIRECTIONS: { value: GradientDirection; label: string }[] = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "diagonal", label: "Diagonal" },
  { value: "radial", label: "Radial" },
];

/** Preset holographic gradient color pairs */
export const HOLOGRAPHIC_PRESETS: { label: string; start: string; end: string }[] = [
  { label: "Violet-Cyan", start: "#8A2BE2", end: "#00CED1" },
  { label: "Pink-Blue", start: "#FF69B4", end: "#4169E1" },
  { label: "Gold-Emerald", start: "#FFD700", end: "#50C878" },
  { label: "Coral-Teal", start: "#FF7F50", end: "#008080" },
  { label: "Rose-Indigo", start: "#FF007F", end: "#4B0082" },
];

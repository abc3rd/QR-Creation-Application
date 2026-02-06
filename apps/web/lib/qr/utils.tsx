import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_IMG_SCALE,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import {
  Excavation,
  ImageSettings,
  Modules,
  QRPropsSVG,
  QRDotStyle,
  QRCornerStyle,
  QRStyleSettings,
} from "./types";

import type { JSX } from "react";

// We could just do this in generatePath, except that we want to support
// non-Path2D canvas, so we need to keep it an explicit step.
export function excavateModules(
  modules: Modules,
  excavation: Excavation,
): Modules {
  return modules.slice().map((row, y) => {
    if (y < excavation.y || y >= excavation.y + excavation.h) {
      return row;
    }
    return row.map((cell, x) => {
      if (x < excavation.x || x >= excavation.x + excavation.w) {
        return cell;
      }
      return false;
    });
  });
}

export function generatePath(modules: Modules, margin = 0): string {
  const ops: Array<string> = [];
  modules.forEach(function (row, y) {
    let start: number | null = null;
    row.forEach(function (cell, x) {
      if (!cell && start !== null) {
        // M0 0h7v1H0z injects the space with the move and drops the comma,
        // saving a char per operation
        ops.push(
          `M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`,
        );
        start = null;
        return;
      }

      // end of row, clean up or skip
      if (x === row.length - 1) {
        if (!cell) {
          // We would have closed the op above already so this can only mean
          // 2+ light modules in a row.
          return;
        }
        if (start === null) {
          // Just a single dark module.
          ops.push(`M${x + margin},${y + margin} h1v1H${x + margin}z`);
        } else {
          // Otherwise finish the current line.
          ops.push(
            `M${start + margin},${y + margin} h${x + 1 - start}v1H${
              start + margin
            }z`,
          );
        }
        return;
      }

      if (cell && start === null) {
        start = x;
      }
    });
  });
  return ops.join("");
}

/**
 * Generate SVG elements for styled QR code modules (dots, circles, diamonds, etc.)
 */
export function generateStyledModules(
  modules: Modules,
  margin: number,
  dotStyle: QRDotStyle = "square",
  cornerStyle: QRCornerStyle = "square",
): JSX.Element[] {
  const elements: JSX.Element[] = [];
  const size = modules.length;

  // Identify finder pattern positions (three 7x7 corners)
  const finderPositions = [
    { x: 0, y: 0 },       // top-left
    { x: size - 7, y: 0 }, // top-right
    { x: 0, y: size - 7 }, // bottom-left
  ];

  const isFinderModule = (x: number, y: number): boolean => {
    return finderPositions.some(
      (fp) => x >= fp.x && x < fp.x + 7 && y >= fp.y && y < fp.y + 7,
    );
  };

  modules.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return;

      const cx = x + margin;
      const cy = y + margin;
      const key = `${x}-${y}`;

      if (isFinderModule(x, y)) {
        // Render finder pattern modules with corner style
        elements.push(
          renderCornerModule(cx, cy, cornerStyle, key),
        );
      } else {
        // Render data modules with dot style
        elements.push(
          renderDotModule(cx, cy, dotStyle, key),
        );
      }
    });
  });

  return elements;
}

function renderDotModule(
  x: number,
  y: number,
  style: QRDotStyle,
  key: string,
): JSX.Element {
  const pad = 0.05; // Small padding between modules
  switch (style) {
    case "circle":
      return (
        <circle
          key={key}
          cx={x + 0.5}
          cy={y + 0.5}
          r={0.45}
          fill="currentColor"
        />
      );
    case "rounded":
      return (
        <rect
          key={key}
          x={x + pad}
          y={y + pad}
          width={1 - pad * 2}
          height={1 - pad * 2}
          rx={0.3}
          ry={0.3}
          fill="currentColor"
        />
      );
    case "diamond":
      return (
        <polygon
          key={key}
          points={`${x + 0.5},${y + 0.05} ${x + 0.95},${y + 0.5} ${x + 0.5},${y + 0.95} ${x + 0.05},${y + 0.5}`}
          fill="currentColor"
        />
      );
    case "square":
    default:
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={1}
          height={1}
          fill="currentColor"
        />
      );
  }
}

function renderCornerModule(
  x: number,
  y: number,
  style: QRCornerStyle,
  key: string,
): JSX.Element {
  switch (style) {
    case "circle":
      return (
        <circle
          key={key}
          cx={x + 0.5}
          cy={y + 0.5}
          r={0.5}
          fill="currentColor"
        />
      );
    case "rounded":
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={1}
          height={1}
          rx={0.25}
          ry={0.25}
          fill="currentColor"
        />
      );
    case "square":
    default:
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={1}
          height={1}
          fill="currentColor"
        />
      );
  }
}

/**
 * Generate an SVG gradient definition for holographic QR codes.
 */
export function generateGradientDef(
  id: string,
  direction: string = "horizontal",
  startColor: string = "#8A2BE2",
  endColor: string = "#00CED1",
): JSX.Element {
  if (direction === "radial") {
    return (
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </radialGradient>
      </defs>
    );
  }

  let x1 = "0%", y1 = "0%", x2 = "100%", y2 = "0%";
  if (direction === "vertical") {
    x2 = "0%";
    y2 = "100%";
  } else if (direction === "diagonal") {
    x2 = "100%";
    y2 = "100%";
  }

  return (
    <defs>
      <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
        <stop offset="0%" stopColor={startColor} />
        <stop offset="100%" stopColor={endColor} />
      </linearGradient>
    </defs>
  );
}

export function getImageSettings(
  cells: Modules,
  size: number,
  margin: number,
  imageSettings?: ImageSettings,
): null | {
  x: number;
  y: number;
  h: number;
  w: number;
  excavation: Excavation | null;
} {
  if (imageSettings == null) {
    return null;
  }

  const qrCodeSize = cells.length;
  const defaultSize = Math.floor(size * DEFAULT_IMG_SCALE);
  const scale = qrCodeSize / size;
  const w = (imageSettings.width || defaultSize) * scale;
  const h = (imageSettings.height || defaultSize) * scale;

  // Center the image in the QR code area (without margins)
  const x =
    imageSettings.x == null ? qrCodeSize / 2 - w / 2 : imageSettings.x * scale;
  const y =
    imageSettings.y == null ? qrCodeSize / 2 - h / 2 : imageSettings.y * scale;

  let excavation: Excavation | null = null;
  if (imageSettings.excavate) {
    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const ceilW = Math.ceil(w + x - floorX);
    const ceilH = Math.ceil(h + y - floorY);
    excavation = { x: floorX, y: floorY, w: ceilW, h: ceilH };
  }

  return { x, y, h, w, excavation };
}

export function convertImageSettingsToPixels(
  calculatedImageSettings: {
    x: number;
    y: number;
    w: number;
    h: number;
    excavation: Excavation | null;
  },
  size: number,
  numCells: number,
  margin: number,
) {
  const pixelRatio = size / numCells;
  const imgWidth = calculatedImageSettings.w * pixelRatio;
  const imgHeight = calculatedImageSettings.h * pixelRatio;
  const imgLeft = (calculatedImageSettings.x + margin) * pixelRatio;
  const imgTop = (calculatedImageSettings.y + margin) * pixelRatio;

  return { imgWidth, imgHeight, imgLeft, imgTop };
}

export function QRCodeSVG(props: QRPropsSVG) {
  const {
    value,
    size = DEFAULT_SIZE,
    level = DEFAULT_LEVEL,
    bgColor = DEFAULT_BGCOLOR,
    fgColor = DEFAULT_FGCOLOR,
    margin = DEFAULT_MARGIN,
    isOGContext = false,
    imageSettings,
    qrType = "standard",
    qrStyle,
    ...otherProps
  } = props;

  const shouldUseHigherErrorLevel =
    isOGContext && imageSettings?.excavate && (level === "L" || level === "M");

  // Use a higher error correction level 'Q' when excavation is enabled
  // to ensure the QR code remains scannable despite the removed modules.
  // Also use H for custom/holographic types to handle styled rendering
  const effectiveLevel =
    shouldUseHigherErrorLevel
      ? "Q"
      : (qrType === "custom" || qrType === "holographic") && (level === "L" || level === "M")
        ? "Q"
        : level;

  // For micro/compact types, use minimum version
  const effectiveMargin = qrType === "micro" ? Math.min(margin, 1) : margin;

  let cells = qrcodegen.QrCode.encodeText(
    value,
    ERROR_LEVEL_MAP[effectiveLevel],
  ).getModules();

  const numCells = cells.length + effectiveMargin * 2;
  const calculatedImageSettings = getImageSettings(
    cells,
    size,
    effectiveMargin,
    imageSettings,
  );

  let image: null | JSX.Element = null;
  if (imageSettings != null && calculatedImageSettings != null) {
    if (calculatedImageSettings.excavation != null) {
      cells = excavateModules(cells, calculatedImageSettings.excavation);
    }

    if (isOGContext) {
      const { imgWidth, imgHeight, imgLeft, imgTop } =
        convertImageSettingsToPixels(
          calculatedImageSettings,
          size,
          numCells,
          effectiveMargin,
        );

      image = (
        <img
          src={imageSettings.src}
          alt="Logo"
          style={{
            position: "absolute",
            left: `${imgLeft}px`,
            top: `${imgTop}px`,
            width: `${imgWidth}px`,
            height: `${imgHeight}px`,
          }}
        />
      );
    } else {
      image = (
        <image
          href={imageSettings.src}
          height={calculatedImageSettings.h}
          width={calculatedImageSettings.w}
          x={calculatedImageSettings.x + effectiveMargin}
          y={calculatedImageSettings.y + effectiveMargin}
          preserveAspectRatio="none"
        />
      );
    }
  }

  // Check if we need styled rendering (custom dot/corner styles or holographic)
  const useStyledRendering =
    (qrType === "custom" || qrType === "holographic") && qrStyle;
  const useGradient = qrType === "holographic" && qrStyle;

  const gradientId = "qr-holo-gradient";

  if (useStyledRendering) {
    const styledElements = generateStyledModules(
      cells,
      effectiveMargin,
      qrStyle?.dotStyle || (qrType === "holographic" ? "rounded" : "square"),
      qrStyle?.cornerStyle || "square",
    );

    const fillColor = useGradient ? `url(#${gradientId})` : fgColor;

    return (
      <svg
        height={size}
        width={size}
        viewBox={`0 0 ${numCells} ${numCells}`}
        {...otherProps}
      >
        {useGradient &&
          generateGradientDef(
            gradientId,
            qrStyle?.gradientDirection || "horizontal",
            qrStyle?.gradientStartColor || "#8A2BE2",
            qrStyle?.gradientEndColor || "#00CED1",
          )}
        <path
          fill={bgColor}
          d={`M0,0 h${numCells}v${numCells}H0z`}
          shapeRendering="crispEdges"
        />
        <g style={{ color: fillColor }} fill={fillColor}>
          {styledElements}
        </g>
        {image}
      </svg>
    );
  }

  // Standard path-based rendering (most efficient for standard/micro/compact)
  const fgPath = generatePath(cells, effectiveMargin);

  return (
    <svg
      height={size}
      width={size}
      viewBox={`0 0 ${numCells} ${numCells}`}
      {...otherProps}
    >
      <path
        fill={bgColor}
        d={`M0,0 h${numCells}v${numCells}H0z`}
        shapeRendering="crispEdges"
      />
      <path fill={fgColor} d={fgPath} shapeRendering="crispEdges" />
      {image}
    </svg>
  );
}

// For canvas we're going to switch our drawing mode based on whether or not
// the environment supports Path2D. We only need the constructor to be
// supported, but Edge doesn't actually support the path (string) type
// argument. Luckily it also doesn't support the addPath() method. We can
// treat that as the same thing.
export const SUPPORTS_PATH2D = (function () {
  try {
    new Path2D().addPath(new Path2D());
  } catch (e) {
    return false;
  }
  return true;
})();

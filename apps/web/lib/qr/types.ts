import type { CSSProperties } from "react";
import qrcodegen from "./codegen";

export type Modules = ReturnType<qrcodegen.QrCode["getModules"]>;
export type Excavation = { x: number; y: number; w: number; h: number };

export type ImageSettings = {
  src: string;
  height: number;
  width: number;
  excavate: boolean;
  x?: number;
  y?: number;
};

/** Available QR code types */
export type QRCodeType =
  | "standard"
  | "micro"
  | "compact"
  | "custom"
  | "holographic"
  | "cube3d";

/** Module dot style for custom QR codes */
export type QRDotStyle =
  | "square"
  | "rounded"
  | "circle"
  | "diamond";

/** Corner style for finder patterns */
export type QRCornerStyle =
  | "square"
  | "rounded"
  | "circle";

/** Holographic gradient direction */
export type GradientDirection =
  | "horizontal"
  | "vertical"
  | "diagonal"
  | "radial";

/** Extended style settings for custom QR codes */
export type QRStyleSettings = {
  dotStyle?: QRDotStyle;
  cornerStyle?: QRCornerStyle;
  gradientDirection?: GradientDirection;
  gradientStartColor?: string;
  gradientEndColor?: string;
};

export type QRProps = {
  value: string;
  size?: number;
  level?: string;
  bgColor?: string;
  fgColor?: string;
  margin?: number;
  style?: CSSProperties;
  imageSettings?: ImageSettings;
  isOGContext?: boolean;
  /** QR code type - defaults to "standard" */
  qrType?: QRCodeType;
  /** Extended style settings for custom/holographic QR types */
  qrStyle?: QRStyleSettings;
};
export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;

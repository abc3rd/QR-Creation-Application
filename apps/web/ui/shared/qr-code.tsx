import { getQRData, QRCodeSVG } from "@/lib/qr";
import { DEFAULT_MARGIN } from "@/lib/qr/constants";
import type { QRCodeType, QRStyleSettings } from "@/lib/qr/types";
import { memo, useMemo } from "react";

export const QRCode = memo(
  ({
    url,
    fgColor,
    hideLogo,
    logo,
    scale = 1,
    margin = DEFAULT_MARGIN,
    qrType = "standard",
    qrStyle,
  }: {
    url: string;
    fgColor?: string;
    hideLogo?: boolean;
    logo?: string;
    scale?: number;
    margin?: number;
    qrType?: QRCodeType;
    qrStyle?: QRStyleSettings;
  }) => {
    const qrData = useMemo(
      () => getQRData({ url, fgColor, hideLogo, logo, margin, qrType, qrStyle }),
      [url, fgColor, hideLogo, logo, margin, qrType, qrStyle],
    );

    return (
      <QRCodeSVG
        value={qrData.value}
        size={(qrData.size / 8) * scale}
        bgColor={qrData.bgColor}
        fgColor={qrData.fgColor}
        level={qrData.level}
        margin={qrData.margin}
        qrType={qrData.qrType}
        qrStyle={qrData.qrStyle}
        {...(qrData.imageSettings && {
          imageSettings: {
            ...qrData.imageSettings,
            height: qrData.imageSettings
              ? (qrData.imageSettings.height / 8) * scale
              : 0,
            width: qrData.imageSettings
              ? (qrData.imageSettings.width / 8) * scale
              : 0,
          },
        })}
      />
    );
  },
);

QRCode.displayName = "QRCode";

/**
 * 3D Cube QR Code visualization component.
 * Renders a CSS 3D cube with QR codes on three visible faces.
 */
export const QRCodeCube3D = memo(
  ({
    url,
    fgColor,
    hideLogo,
    logo,
    cubeSize = 120,
  }: {
    url: string;
    fgColor?: string;
    hideLogo?: boolean;
    logo?: string;
    cubeSize?: number;
  }) => {
    const qrData = useMemo(
      () =>
        getQRData({
          url,
          fgColor,
          hideLogo: true, // No logo for cube faces (too small)
          logo,
          margin: 1,
          qrType: "standard",
        }),
      [url, fgColor, logo],
    );

    const faceQR = (
      <QRCodeSVG
        value={qrData.value}
        size={cubeSize}
        bgColor={qrData.bgColor}
        fgColor={qrData.fgColor}
        level={qrData.level}
        margin={1}
      />
    );

    const half = cubeSize / 2;

    return (
      <div
        className="relative"
        style={{
          width: cubeSize * 1.8,
          height: cubeSize * 1.8,
          perspective: cubeSize * 4,
        }}
      >
        <div
          className="absolute"
          style={{
            width: cubeSize,
            height: cubeSize,
            left: "50%",
            top: "50%",
            marginLeft: -half,
            marginTop: -half,
            transformStyle: "preserve-3d",
            transform: "rotateX(-25deg) rotateY(-35deg)",
          }}
        >
          {/* Front face */}
          <div
            className="absolute border border-neutral-200"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `translateZ(${half}px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {faceQR}
          </div>
          {/* Right face */}
          <div
            className="absolute border border-neutral-200"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `rotateY(90deg) translateZ(${half}px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {faceQR}
          </div>
          {/* Top face */}
          <div
            className="absolute border border-neutral-200"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `rotateX(90deg) translateZ(${half}px)`,
              backfaceVisibility: "hidden",
            }}
          >
            {faceQR}
          </div>
          {/* Back face (hidden) */}
          <div
            className="absolute"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `rotateY(180deg) translateZ(${half}px)`,
              backfaceVisibility: "hidden",
              backgroundColor: "#f5f5f5",
            }}
          />
          {/* Left face (hidden) */}
          <div
            className="absolute"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `rotateY(-90deg) translateZ(${half}px)`,
              backfaceVisibility: "hidden",
              backgroundColor: "#f0f0f0",
            }}
          />
          {/* Bottom face (hidden) */}
          <div
            className="absolute"
            style={{
              width: cubeSize,
              height: cubeSize,
              transform: `rotateX(-90deg) translateZ(${half}px)`,
              backfaceVisibility: "hidden",
              backgroundColor: "#e8e8e8",
            }}
          />
        </div>
      </div>
    );
  },
);

QRCodeCube3D.displayName = "QRCodeCube3D";

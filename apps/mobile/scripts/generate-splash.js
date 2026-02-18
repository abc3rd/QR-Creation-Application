#!/usr/bin/env node
/**
 * Generate Android splash screen with brand colors.
 *
 * Brand palette:
 *   Magenta: #ea00ea
 *   Blue:    #2699fe
 *   Dark:    #3c3c3c
 */

const fs = require("fs");
const path = require("path");

const SPLASH_SIZES = [
  { dir: "drawable", width: 480, height: 800 },
  { dir: "drawable-land", width: 800, height: 480 },
  { dir: "drawable-hdpi", width: 720, height: 1280 },
  { dir: "drawable-land-hdpi", width: 1280, height: 720 },
  { dir: "drawable-xhdpi", width: 1080, height: 1920 },
  { dir: "drawable-land-xhdpi", width: 1920, height: 1080 },
  { dir: "drawable-xxhdpi", width: 1440, height: 2560 },
  { dir: "drawable-land-xxhdpi", width: 2560, height: 1440 },
  { dir: "drawable-xxxhdpi", width: 2160, height: 3840 },
  { dir: "drawable-land-xxxhdpi", width: 3840, height: 2160 },
];

function generateSplashSVG(width, height) {
  const logoSize = Math.min(width, height) * 0.25;
  const cx = width / 2;
  const cy = height / 2;
  const textY = cy + logoSize * 0.7;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ea00ea"/>
      <stop offset="100%" stop-color="#2699fe"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#3c3c3c"/>
  <rect x="${cx - logoSize / 2}" y="${cy - logoSize / 2}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.2}" fill="url(#logo-grad)"/>
  <text x="${cx}" y="${cy + logoSize * 0.05}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-weight="700" font-size="${logoSize * 0.4}" fill="white">QR</text>
  <text x="${cx}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="${logoSize * 0.18}" fill="white" opacity="0.9">QR Creation</text>
</svg>`;
}

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log("sharp not installed — generating SVG sources only.");
    const resDir = path.join(__dirname, "..", "resources", "android");
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, "splash.svg"), generateSplashSVG(1080, 1920));
    fs.writeFileSync(path.join(resDir, "splash-land.svg"), generateSplashSVG(1920, 1080));
    console.log("SVG splash files written to resources/android/");
    return;
  }

  const androidResDir = path.join(__dirname, "..", "android", "app", "src", "main", "res");

  for (const { dir, width, height } of SPLASH_SIZES) {
    const outDir = path.join(androidResDir, dir);
    fs.mkdirSync(outDir, { recursive: true });

    const svg = Buffer.from(generateSplashSVG(width, height));
    await sharp(svg).png().toFile(path.join(outDir, "splash.png"));
    console.log(`  ${dir}/splash.png (${width}x${height})`);
  }

  console.log("\nSplash screens generated successfully.");
}

main().catch(console.error);

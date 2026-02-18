#!/usr/bin/env node
/**
 * Generate Android adaptive icons with brand colors.
 * Uses sharp to create all required icon sizes.
 *
 * Brand palette:
 *   Magenta: #ea00ea
 *   Blue:    #2699fe
 *   Green:   #4bce2a
 *   Dark:    #3c3c3c
 *   Copper:  #c4653a
 */

const fs = require("fs");
const path = require("path");

// Android icon sizes
const ICON_SIZES = [
  { dir: "mipmap-mdpi", size: 48 },
  { dir: "mipmap-hdpi", size: 72 },
  { dir: "mipmap-xhdpi", size: 96 },
  { dir: "mipmap-xxhdpi", size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

const ADAPTIVE_SIZES = [
  { dir: "mipmap-mdpi", size: 108 },
  { dir: "mipmap-hdpi", size: 162 },
  { dir: "mipmap-xhdpi", size: 216 },
  { dir: "mipmap-xxhdpi", size: 324 },
  { dir: "mipmap-xxxhdpi", size: 432 },
];

const PLAY_STORE_SIZE = 512;

function generateSVGIcon(size) {
  const pad = Math.round(size * 0.15);
  const qrSize = size - pad * 2;
  const cellSize = Math.floor(qrSize / 7);
  const offset = pad;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ea00ea"/>
      <stop offset="100%" stop-color="#2699fe"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#3c3c3c"/>
  <!-- QR finder pattern top-left -->
  <rect x="${offset}" y="${offset}" width="${cellSize * 3}" height="${cellSize * 3}" rx="${Math.round(cellSize * 0.3)}" fill="url(#bg-grad)"/>
  <rect x="${offset + cellSize * 0.6}" y="${offset + cellSize * 0.6}" width="${cellSize * 1.8}" height="${cellSize * 1.8}" rx="${Math.round(cellSize * 0.2)}" fill="#3c3c3c"/>
  <rect x="${offset + cellSize}" y="${offset + cellSize}" width="${cellSize}" height="${cellSize}" rx="${Math.round(cellSize * 0.15)}" fill="url(#bg-grad)"/>
  <!-- QR finder pattern top-right -->
  <rect x="${offset + cellSize * 4}" y="${offset}" width="${cellSize * 3}" height="${cellSize * 3}" rx="${Math.round(cellSize * 0.3)}" fill="#2699fe"/>
  <rect x="${offset + cellSize * 4.6}" y="${offset + cellSize * 0.6}" width="${cellSize * 1.8}" height="${cellSize * 1.8}" rx="${Math.round(cellSize * 0.2)}" fill="#3c3c3c"/>
  <rect x="${offset + cellSize * 5}" y="${offset + cellSize}" width="${cellSize}" height="${cellSize}" rx="${Math.round(cellSize * 0.15)}" fill="#2699fe"/>
  <!-- QR finder pattern bottom-left -->
  <rect x="${offset}" y="${offset + cellSize * 4}" width="${cellSize * 3}" height="${cellSize * 3}" rx="${Math.round(cellSize * 0.3)}" fill="#4bce2a"/>
  <rect x="${offset + cellSize * 0.6}" y="${offset + cellSize * 4.6}" width="${cellSize * 1.8}" height="${cellSize * 1.8}" rx="${Math.round(cellSize * 0.2)}" fill="#3c3c3c"/>
  <rect x="${offset + cellSize}" y="${offset + cellSize * 5}" width="${cellSize}" height="${cellSize}" rx="${Math.round(cellSize * 0.15)}" fill="#4bce2a"/>
  <!-- Data dots -->
  <circle cx="${offset + cellSize * 3.5}" cy="${offset + cellSize * 3.5}" r="${cellSize * 0.35}" fill="#c4653a"/>
  <circle cx="${offset + cellSize * 4.5}" cy="${offset + cellSize * 4.5}" r="${cellSize * 0.35}" fill="#ea00ea"/>
  <circle cx="${offset + cellSize * 5.5}" cy="${offset + cellSize * 5.5}" r="${cellSize * 0.35}" fill="#2699fe"/>
  <circle cx="${offset + cellSize * 3.5}" cy="${offset + cellSize * 5}" r="${cellSize * 0.25}" fill="#4bce2a"/>
  <circle cx="${offset + cellSize * 5}" cy="${offset + cellSize * 3.5}" r="${cellSize * 0.25}" fill="#c4653a"/>
</svg>`;
}

function generateForegroundSVG(size) {
  return generateSVGIcon(size);
}

function generateBackgroundSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#3c3c3c"/>
</svg>`;
}

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.log("sharp not installed — generating SVG sources only.");
    console.log("Run 'npm install' then 'npm run icons' to generate PNGs.\n");

    // Write SVG source files for manual conversion
    const resDir = path.join(__dirname, "..", "resources", "android");
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, "icon-foreground.svg"), generateForegroundSVG(432));
    fs.writeFileSync(path.join(resDir, "icon-background.svg"), generateBackgroundSVG(432));
    fs.writeFileSync(path.join(resDir, "icon-playstore.svg"), generateSVGIcon(PLAY_STORE_SIZE));
    console.log("SVG files written to resources/android/");
    return;
  }

  const androidResDir = path.join(__dirname, "..", "android", "app", "src", "main", "res");

  // Generate standard icons
  for (const { dir, size } of ICON_SIZES) {
    const outDir = path.join(androidResDir, dir);
    fs.mkdirSync(outDir, { recursive: true });

    const svg = Buffer.from(generateSVGIcon(size));
    await sharp(svg).png().toFile(path.join(outDir, "ic_launcher.png"));
    await sharp(svg).png().toFile(path.join(outDir, "ic_launcher_round.png"));
    console.log(`  ${dir}/ic_launcher.png (${size}x${size})`);
  }

  // Generate adaptive icon layers
  for (const { dir, size } of ADAPTIVE_SIZES) {
    const outDir = path.join(androidResDir, dir);
    fs.mkdirSync(outDir, { recursive: true });

    const fg = Buffer.from(generateForegroundSVG(size));
    const bg = Buffer.from(generateBackgroundSVG(size));
    await sharp(fg).png().toFile(path.join(outDir, "ic_launcher_foreground.png"));
    await sharp(bg).png().toFile(path.join(outDir, "ic_launcher_background.png"));
    console.log(`  ${dir}/ic_launcher_foreground.png (${size}x${size})`);
  }

  // Play Store icon (512x512)
  const playStoreDir = path.join(__dirname, "..", "resources", "android");
  fs.mkdirSync(playStoreDir, { recursive: true });
  const storeSvg = Buffer.from(generateSVGIcon(PLAY_STORE_SIZE));
  await sharp(storeSvg).png().toFile(path.join(playStoreDir, "playstore-icon.png"));
  console.log(`  playstore-icon.png (${PLAY_STORE_SIZE}x${PLAY_STORE_SIZE})`);

  console.log("\nIcons generated successfully.");
}

main().catch(console.error);

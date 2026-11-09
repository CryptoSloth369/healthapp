// Generates the app icons from an inline SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

// A heart with a pulse line, on a dark rounded tile.
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b0d10"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M256 448s-176-104-176-232c0-62 46-104 100-104 34 0 60 18 76 44 16-26 42-44 76-44 54 0 100 42 100 104 0 128-176 232-176 232z"
      fill="#34d399"/>
    <polyline points="112,250 196,250 226,194 266,310 296,236 400,236"
      fill="none" stroke="#0b0d10" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const out = [
  ["public/icons/icon-192.png", 192, 40],
  ["public/icons/icon-512.png", 512, 40],
  ["public/icons/icon-maskable-512.png", 512, 100], // extra padding for Android masks
  ["src/app/apple-icon.png", 180, 40], // iOS home-screen icon
  ["src/app/icon.png", 64, 20], // browser tab
];
for (const [file, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}

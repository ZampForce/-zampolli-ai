const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate PNG icons using embedded SVG + Node canvas approach
// Since we can't use canvas lib, let's use a minimal approach with pure SVG

// The SVG we already have
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="128" y2="128">
      <stop offset="0%" stop-color="#181b28"/>
      <stop offset="100%" stop-color="#0d0f17"/>
    </linearGradient>
    <linearGradient id="z" x1="0" y1="15" x2="128" y2="115">
      <stop offset="0%" stop-color="#b8a9ff"/>
      <stop offset="50%" stop-color="#7b73ff"/>
      <stop offset="100%" stop-color="#4a44db"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="5" stdDeviation="10" flood-color="#635bff" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)" stroke="#2a2e42" stroke-width="2"/>
  <ellipse cx="64" cy="66" rx="50" ry="20" fill="#635bff" opacity=".06"/>
  <g filter="url(#shadow)">
    <path d="M24 35h80l-65 58h60" fill="none" stroke="url(#z)" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;

// Check if we have any available tool to convert
const iconDir = path.join(__dirname, '..', 'icons');

// Simple approach: write PNG via base64
// Since we might not have canvas, let's check what we have
function hasNodeCanvas() {
  try {
    const p = path.dirname(require.resolve('canvas/package.json'));
    return !!p;
  } catch { return false; }
}

if (hasNodeCanvas()) {
  const { createCanvas, loadImage } = require('canvas');
  const sizes = [16, 48, 128];

  async function gen() {
    const img = await loadImage('data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64'));
    for (const s of sizes) {
      const c = createCanvas(s, s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, s, s);
      c.createPNGStream().pipe(fs.createWriteStream(path.join(iconDir, `icon${s}.png`)));
      console.log(`Created icon${s}.png`);
    }
  }
  gen();
} else {
  console.log('Canvas not installed. Writing base64 for manual conversion...');
  console.log('SVG icon is already saved as icon.svg.');
  console.log('To generate PNGs, run: npm install canvas');
  console.log('Then run this script again.');
}

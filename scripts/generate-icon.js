// Generate iMacOS app icon as PNG using Canvas-like SVG approach
// Run: node scripts/generate-icon.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate SVG icon
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f0f1a"/>
    </linearGradient>
    <!-- Accent glow -->
    <radialGradient id="glow" cx="50%" cy="45%" r="45%">
      <stop offset="0%" stop-color="rgba(0,212,170,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,212,170,0)"/>
    </radialGradient>
    <!-- Shield gradient -->
    <linearGradient id="shieldGrad" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#00d4aa"/>
      <stop offset="100%" stop-color="#00a88a"/>
    </linearGradient>
    <!-- Shadow filter -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
    <filter id="innerGlow">
      <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="rgba(0,212,170,0.4)"/>
    </filter>
  </defs>

  <!-- macOS-style rounded rect background -->
  <rect x="40" y="40" width="944" height="944" rx="210" ry="210" fill="url(#bgGrad)" filter="url(#shadow)"/>

  <!-- Subtle border -->
  <rect x="40" y="40" width="944" height="944" rx="210" ry="210" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Glow effect -->
  <rect x="40" y="40" width="944" height="944" rx="210" ry="210" fill="url(#glow)"/>

  <!-- Grid pattern (subtle) -->
  <g opacity="0.04">
    ${Array.from({length: 15}, (_, i) => `<line x1="${120 + i * 56}" y1="100" x2="${120 + i * 56}" y2="924" stroke="white" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({length: 15}, (_, i) => `<line x1="100" y1="${120 + i * 56}" x2="924" y2="${120 + i * 56}" stroke="white" stroke-width="1"/>`).join('\n    ')}
  </g>

  <!-- Shield icon -->
  <g transform="translate(512, 420)" filter="url(#innerGlow)">
    <!-- Shield shape -->
    <path d="M0,-220 C80,-220 160,-200 220,-170 L220,40 C220,160 120,260 0,310 C-120,260 -220,160 -220,40 L-220,-170 C-160,-200 -80,-220 0,-220 Z"
          fill="url(#shieldGrad)" opacity="0.9"/>

    <!-- Shield inner highlight -->
    <path d="M0,-190 C65,-190 130,-175 180,-150 L180,30 C180,130 100,215 0,260 C-100,215 -180,130 -180,30 L-180,-150 C-130,-175 -65,-190 0,-190 Z"
          fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>

    <!-- Checkmark inside shield -->
    <path d="M-70,20 L-20,70 L80,-40"
          fill="none" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Scanning circle rings -->
  <circle cx="512" cy="420" r="300" fill="none" stroke="rgba(0,212,170,0.1)" stroke-width="1.5"/>
  <circle cx="512" cy="420" r="340" fill="none" stroke="rgba(0,212,170,0.06)" stroke-width="1"/>

  <!-- Corner dots (data points) -->
  <circle cx="212" cy="200" r="5" fill="rgba(0,212,170,0.5)"/>
  <circle cx="812" cy="200" r="5" fill="rgba(0,212,170,0.5)"/>
  <circle cx="160" cy="500" r="4" fill="rgba(59,130,246,0.5)"/>
  <circle cx="864" cy="500" r="4" fill="rgba(59,130,246,0.5)"/>
  <circle cx="250" cy="750" r="3" fill="rgba(168,85,247,0.4)"/>
  <circle cx="774" cy="750" r="3" fill="rgba(168,85,247,0.4)"/>

  <!-- Text: iMacOS -->
  <text x="512" y="780" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" font-size="110" font-weight="800" letter-spacing="3">
    <tspan fill="white">i</tspan><tspan fill="white">Mac</tspan><tspan fill="#00d4aa">OS</tspan>
  </text>

  <!-- Subtitle -->
  <text x="512" y="840" text-anchor="middle" font-family="-apple-system, 'SF Pro Text', sans-serif" font-size="44" font-weight="500" fill="rgba(255,255,255,0.4)" letter-spacing="6">
    SECURITY
  </text>
</svg>`;

const svgPath = path.join(__dirname, '..', 'resources', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'resources', 'icon.png');
const icnsPath = path.join(__dirname, '..', 'resources', 'icon.icns');
const iconsetPath = path.join(__dirname, '..', 'resources', 'icon.iconset');

// Write SVG
fs.writeFileSync(svgPath, svg);
console.log('SVG written:', svgPath);

// Convert SVG to PNG using sips (macOS built-in) via a temp approach
// First use qlmanage or sips - but they don't handle SVG well
// Use the built-in rsvg-convert if available, otherwise use macOS ScreenCapture trick
try {
  // Try using rsvg-convert (from librsvg)
  execSync(`rsvg-convert -w 1024 -h 1024 "${svgPath}" -o "${pngPath}" 2>/dev/null`);
  console.log('PNG created via rsvg-convert');
} catch (e) {
  try {
    // Fallback: Use qlmanage
    execSync(`qlmanage -t -s 1024 -o "${path.dirname(pngPath)}" "${svgPath}" 2>/dev/null && mv "${pngPath}.png" "${pngPath}" 2>/dev/null || true`);
    // If qlmanage output has different name pattern
    const qlOut = path.join(path.dirname(pngPath), 'icon.svg.png');
    if (fs.existsSync(qlOut) && !fs.existsSync(pngPath)) {
      fs.renameSync(qlOut, pngPath);
    }
    console.log('PNG created via qlmanage');
  } catch (e2) {
    console.log('Could not auto-convert SVG to PNG. Manual conversion needed.');
    console.log('Install librsvg: brew install librsvg');
    console.log('Then run: rsvg-convert -w 1024 -h 1024 resources/icon.svg -o resources/icon.png');
  }
}

// Generate .icns from PNG
if (fs.existsSync(pngPath)) {
  try {
    // Create iconset directory
    if (fs.existsSync(iconsetPath)) fs.rmSync(iconsetPath, { recursive: true });
    fs.mkdirSync(iconsetPath);

    // Generate all required sizes
    const sizes = [16, 32, 64, 128, 256, 512, 1024];
    for (const size of sizes) {
      execSync(`sips -z ${size} ${size} "${pngPath}" --out "${iconsetPath}/icon_${size === 1024 ? '512x512@2x' : size + 'x' + size}.png" 2>/dev/null`);
      if (size <= 512) {
        execSync(`sips -z ${size * 2} ${size * 2} "${pngPath}" --out "${iconsetPath}/icon_${size}x${size}@2x.png" 2>/dev/null`);
      }
    }

    // Convert iconset to icns
    execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`);
    console.log('ICNS created:', icnsPath);

    // Cleanup iconset
    fs.rmSync(iconsetPath, { recursive: true });
  } catch (e) {
    console.error('Failed to create ICNS:', e.message);
  }
}

console.log('Done!');

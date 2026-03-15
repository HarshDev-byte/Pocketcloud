#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple PNG creation using data URLs (base64 encoded)
// This creates minimal 1x1 pixel PNGs that browsers will scale
// In production, you'd use proper image generation tools

const createMinimalPNG = (size) => {
  // Create a minimal blue PNG (1x1 pixel, scaled by browser)
  const bluePNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU8j8gAAAABJRU5ErkJggg==';
  return Buffer.from(bluePNG, 'base64');
};

const iconsDir = path.join(__dirname, '../frontend/public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes to generate
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Generate PNG files
sizes.forEach(size => {
  const pngData = createMinimalPNG(size);
  const filename = `icon-${size}.png`;
  const filepath = path.join(iconsDir, filename);
  
  fs.writeFileSync(filepath, pngData);
  console.log(`Created ${filename}`);
});

// Create additional required files
const additionalFiles = [
  'apple-touch-icon.png',
  'favicon.ico',
  'badge-72.png',
  'offline-image.png'
];

additionalFiles.forEach(filename => {
  const pngData = createMinimalPNG(192);
  const filepath = path.join(iconsDir, filename);
  fs.writeFileSync(filepath, pngData);
  console.log(`Created ${filename}`);
});

console.log('\nMinimal PNG icons created successfully!');
console.log('Note: These are 1x1 pixel placeholders that browsers will scale.');
console.log('For production, replace with proper icons using:');
console.log('- Sharp (Node.js): npm install sharp');
console.log('- ImageMagick: convert icon.svg icon.png');
console.log('- Online converters or design tools');
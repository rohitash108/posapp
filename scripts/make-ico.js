'use strict';
/**
 * make-ico.js — Generates a proper multi-resolution Windows ICO from the GTC PNG logo.
 *
 * Sizes produced: 16, 24, 32, 48, 64, 128, 256 px (all embedded as PNG-in-ICO).
 * PNG-in-ICO is supported by Windows Vista+, Windows 7/8/10/11.
 *
 * Uses jimp-compact (already in node_modules via electron-builder).
 * Run:  node scripts/make-ico.js
 */

const Jimp = require('jimp-compact');
const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const SRC   = path.join(ROOT, 'assets', 'global-tea-cafe-logo.png');
const OUT   = path.join(ROOT, 'assets', 'icon.ico');

// Standard Windows ICO sizes
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`❌  Source PNG not found: ${SRC}`);
    process.exit(1);
  }

  console.log(`📐  Reading ${SRC} …`);
  const img = await Jimp.read(SRC);

  console.log(`🔄  Generating ${SIZES.length} sizes: ${SIZES.join(', ')} px`);
  const pngBuffers = await Promise.all(
    SIZES.map(s => img.clone().resize(s, s, Jimp.RESIZE_LANCZOS3).getBufferAsync(Jimp.MIME_PNG))
  );

  // ── Build ICO binary ────────────────────────────────────────────────────────
  // ICO format:
  //   6 bytes  header  (reserved=0, type=1, count)
  //   16 bytes per image in directory
  //   N bytes  PNG data for each image

  const count      = SIZES.length;
  const headerSize = 6 + 16 * count;          // header + directory
  let   dataOffset = headerSize;
  const offsets    = pngBuffers.map(buf => { const o = dataOffset; dataOffset += buf.length; return o; });
  const total      = dataOffset;

  const out = Buffer.alloc(total);

  // Header
  out.writeUInt16LE(0, 0);      // reserved
  out.writeUInt16LE(1, 2);      // type: 1 = ICO
  out.writeUInt16LE(count, 4);  // number of images

  // Directory entries
  SIZES.forEach((s, i) => {
    const base = 6 + i * 16;
    out.writeUInt8(s === 256 ? 0 : s, base);      // width  (0 encodes 256)
    out.writeUInt8(s === 256 ? 0 : s, base + 1);  // height (0 encodes 256)
    out.writeUInt8(0,  base + 2);   // colorCount (0 = 256+ colors)
    out.writeUInt8(0,  base + 3);   // reserved
    out.writeUInt16LE(1,  base + 4); // planes
    out.writeUInt16LE(32, base + 6); // bitCount (32 = RGBA)
    out.writeUInt32LE(pngBuffers[i].length, base + 8);  // size of image data
    out.writeUInt32LE(offsets[i],           base + 12); // file offset of image data
  });

  // PNG data blocks
  pngBuffers.forEach((buf, i) => buf.copy(out, offsets[i]));

  fs.writeFileSync(OUT, out);
  console.log(`✅  Written ${OUT}  (${(total / 1024).toFixed(1)} KB, ${count} sizes)`);
}

main().catch(err => {
  console.error('❌  make-ico failed:', err.message);
  process.exit(1);
});

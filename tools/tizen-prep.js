#!/usr/bin/env node
'use strict';

/**
 * tools/tizen-prep.js
 *
 * Stages the hermes-web-tv Vite build into apps/hermes-tv-tizen/dist/ so
 * tizen-package.js (and the Tizen CLI) can package it into a .wgt.
 *
 * This script is pure Node — it does NOT invoke the Tizen toolchain. It can
 * run on any developer workstation that has Node 20+.
 *
 * Steps (strict mode, fails loudly on any missing file):
 *   1. Copy apps/hermes-web-tv/dist/  →  apps/hermes-tv-tizen/dist/
 *   2. Copy config.xml.example       →  dist/config.xml
 *      (substituting hermestv.example.com → hermestv.daveai.tech in case
 *       any legacy placeholder slipped through)
 *   3. Copy apps/hermes-tv-tizen/icon.png → dist/icon.png
 *      If missing: generate a 117×117 placeholder PNG via Node Buffer.
 *   4. Verify dist/index.html exists and contains <script type="module">
 *   5. Copy src/api/apiBase.js → dist/api/apiBase.js (if not already bundled)
 *
 * Hard rules:
 *   - No network calls.
 *   - No installation of any toolchain.
 *   - Strict mode, exits non-zero on any failure.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_DIST = path.join(REPO_ROOT, 'apps', 'hermes-web-tv', 'dist');
const TIZEN_DIR = path.join(REPO_ROOT, 'apps', 'hermes-tv-tizen');
const TIZEN_DIST = path.join(TIZEN_DIR, 'dist');
const CONFIG_TEMPLATE = path.join(TIZEN_DIR, 'config.xml.example');
const CONFIG_OUTPUT = path.join(TIZEN_DIST, 'config.xml');
const ICON_SOURCE = path.join(TIZEN_DIR, 'icon.png');
const ICON_OUTPUT = path.join(TIZEN_DIST, 'icon.png');
const API_BASE_SOURCE = path.join(TIZEN_DIR, 'src', 'api', 'apiBase.js');
const API_BASE_OUTPUT = path.join(TIZEN_DIST, 'api', 'apiBase.js');

const PROD_API_HOST = 'hermestv.daveai.tech';
const LEGACY_PLACEHOLDER = 'hermestv.example.com';

function log(msg) {
  process.stdout.write(`[tizen-prep] ${msg}\n`);
}

function die(msg, code) {
  process.stderr.write(`[tizen-prep] ERROR: ${msg}\n`);
  process.exit(code || 1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirRecursive(src, dst) {
  if (!fs.existsSync(src)) {
    die(`source directory does not exist: ${src}`);
  }
  ensureDir(dst);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
    // ignore symlinks/devices — none expected in Vite dist
  }
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

// Step 1 — copy web dist
function stepCopyWebDist() {
  log(`step 1/5: copy web build  ${WEB_DIST}  →  ${TIZEN_DIST}`);
  if (!fs.existsSync(WEB_DIST)) {
    die(
      `web dist does not exist at ${WEB_DIST}. ` +
        `Run "npm run build" inside apps/hermes-web-tv/ first ` +
        `(or use "npm run build" inside apps/hermes-tv-tizen/ which chains both).`
    );
  }
  const indexHtml = path.join(WEB_DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    die(`web dist exists but has no index.html: ${indexHtml}`);
  }
  ensureDir(TIZEN_DIST);
  emptyDir(TIZEN_DIST);
  copyDirRecursive(WEB_DIST, TIZEN_DIST);
}

// Step 2 — copy and substitute config.xml
function stepCopyConfigXml() {
  log(`step 2/5: stage config.xml  ${CONFIG_TEMPLATE}  →  ${CONFIG_OUTPUT}`);
  if (!fs.existsSync(CONFIG_TEMPLATE)) {
    die(`config template missing: ${CONFIG_TEMPLATE}`);
  }
  let xml = fs.readFileSync(CONFIG_TEMPLATE, 'utf8');
  // Replace any legacy placeholder host. The template is already updated to
  // daveai.tech, but this substitution stays as a safety net for forks.
  xml = xml.split(LEGACY_PLACEHOLDER).join(PROD_API_HOST);
  fs.writeFileSync(CONFIG_OUTPUT, xml, 'utf8');
}

// Step 3 — icon
function stepCopyIcon() {
  log(`step 3/5: stage icon.png`);
  if (fs.existsSync(ICON_SOURCE)) {
    fs.copyFileSync(ICON_SOURCE, ICON_OUTPUT);
    return;
  }
  log(`  icon.png not found at ${ICON_SOURCE} — generating 117x117 placeholder`);
  fs.writeFileSync(ICON_OUTPUT, makePlaceholderPng117());
}

// Step 4 — verify index.html
function stepVerifyIndexHtml() {
  log(`step 4/5: verify dist/index.html`);
  const indexHtml = path.join(TIZEN_DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    die(`dist/index.html does not exist after copy: ${indexHtml}`);
  }
  const html = fs.readFileSync(indexHtml, 'utf8');
  if (!/<script\s+[^>]*type=["']module["']/i.test(html)) {
    die(
      `dist/index.html does not contain <script type="module">. ` +
        `Vite output should always include a module script. ` +
        `Re-run the web build.`
    );
  }
}

// Step 5 — copy apiBase.js into dist/api/ for any non-bundled callers
function stepCopyApiBase() {
  log(`step 5/5: stage src/api/apiBase.js → dist/api/apiBase.js`);
  if (!fs.existsSync(API_BASE_SOURCE)) {
    die(`apiBase source missing: ${API_BASE_SOURCE}`);
  }
  if (fs.existsSync(API_BASE_OUTPUT)) {
    log('  dist/api/apiBase.js already present — leaving Vite output in place');
    return;
  }
  ensureDir(path.dirname(API_BASE_OUTPUT));
  fs.copyFileSync(API_BASE_SOURCE, API_BASE_OUTPUT);
}

/**
 * Generate a 117x117 placeholder PNG with a solid color (Hermes orange
 * #d97706 on a translucent background). Pure Node Buffer — no dependencies.
 *
 * The PNG layout below is hand-built so the script never needs a library.
 * Chunks: IHDR, IDAT (raw, zlib-stored), IEND. Pixel format: RGBA, 8-bit.
 */
function makePlaceholderPng117() {
  const W = 117;
  const H = 117;
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixel rows: filter byte (0 = None) followed by RGBA bytes.
  // We draw a simple "H" glyph in white on a Hermes-orange background so
  // sherri's TV launcher gets something recognisable until the real icon
  // is added.
  const orange = [217, 119, 6, 255]; // #d97706
  const white = [255, 255, 255, 255];
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const isHGlyph = isInsideH(x, y, W, H);
      const c = isHGlyph ? white : orange;
      const o = 1 + x * 4;
      row[o] = c[0];
      row[o + 1] = c[1];
      row[o + 2] = c[2];
      row[o + 3] = c[3];
    }
    rows.push(row);
  }
  const rawPixels = Buffer.concat(rows);

  // zlib-compress the raw pixels using stored (uncompressed) DEFLATE blocks.
  // Avoids requiring 'zlib' to be hand-wired — but Node ships zlib natively
  // so just use it.
  const zlib = require('zlib');
  const idatBody = zlib.deflateSync(rawPixels, { level: 9 });

  const ihdrChunk = makePngChunk('IHDR', ihdr);
  const idatChunk = makePngChunk('IDAT', idatBody);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

function makePngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// Standard PNG CRC-32 (poly 0xedb88320)
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Draw a centered "H" — two vertical bars + one horizontal crossbar.
function isInsideH(x, y, W, H) {
  const padX = Math.floor(W * 0.25);
  const padY = Math.floor(H * 0.22);
  const barW = Math.floor(W * 0.12);
  const crossH = Math.floor(H * 0.12);

  const inLeftBar = x >= padX && x < padX + barW && y >= padY && y < H - padY;
  const inRightBar = x >= W - padX - barW && x < W - padX && y >= padY && y < H - padY;
  const inCross = y >= (H - crossH) / 2 && y < (H + crossH) / 2 &&
                  x >= padX && x < W - padX;
  return inLeftBar || inRightBar || inCross;
}

function main() {
  log(`repo root: ${REPO_ROOT}`);
  ensureDir(TIZEN_DIST);
  stepCopyWebDist();
  stepCopyConfigXml();
  stepCopyIcon();
  stepVerifyIndexHtml();
  stepCopyApiBase();
  log('done — dist/ is ready for tizen-package.js');
}

try {
  main();
} catch (err) {
  die(err && err.stack ? err.stack : String(err));
}

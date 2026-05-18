#!/usr/bin/env node
'use strict';

/**
 * package-wgt.js
 * Packages the Tizen HermesTV app into a .wgt (zip) file.
 *
 * Steps:
 *   1. Verify dist/ exists
 *   2. Create a clean staging dir
 *   3. Copy static app files (config.xml, index.html, icon.png)
 *   4. Copy built assets (main.bundle.js, main.css)
 *   5. Create hermes-tv.wgt from staging dir using archiver
 *   6. Print summary and clean up staging
 */

const archiver = require('archiver');
const fs       = require('fs');
const path     = require('path');

const ROOT    = path.resolve(__dirname, '..');
const DIST    = path.join(ROOT, 'dist');
const STAGING = path.join(ROOT, '.wgt-stage');
const OUT     = path.join(ROOT, 'hermes-tv.wgt');

// ---------------------------------------------------------------------------
// 1. Check dist/ exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(DIST)) {
  console.error('ERROR: dist/ not found. Run npm run build first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Clean staging dir
// ---------------------------------------------------------------------------
if (fs.existsSync(STAGING)) {
  fs.rmSync(STAGING, { recursive: true, force: true });
}
fs.mkdirSync(STAGING, { recursive: true });

// ---------------------------------------------------------------------------
// 3. Copy static app files (optional — warn if missing mandatory ones)
// ---------------------------------------------------------------------------
const MANDATORY_STATICS = ['config.xml', 'index.html'];
const OPTIONAL_STATICS  = ['icon.png'];

let filesCopied = 0;

MANDATORY_STATICS.forEach(f => {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) {
    console.warn(`WARNING: mandatory file not found, skipping: ${f}`);
  } else {
    fs.copyFileSync(src, path.join(STAGING, f));
    filesCopied++;
    console.log(`  copied: ${f}`);
  }
});

OPTIONAL_STATICS.forEach(f => {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGING, f));
    filesCopied++;
    console.log(`  copied: ${f}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Copy built assets from dist/
// ---------------------------------------------------------------------------
const DIST_FILES = ['main.bundle.js', 'main.css'];

DIST_FILES.forEach(f => {
  const src = path.join(DIST, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGING, f));
    filesCopied++;
    console.log(`  copied: dist/${f}`);
  } else {
    console.warn(`WARNING: built asset not found, skipping: dist/${f}`);
  }
});

// ---------------------------------------------------------------------------
// 5. Create .wgt (zip archive)
// ---------------------------------------------------------------------------
console.log(`\nCreating ${path.basename(OUT)}...`);

const output  = fs.createWriteStream(OUT);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.on('warning', err => {
  if (err.code === 'ENOENT') {
    console.warn('[archiver] warning:', err.message);
  } else {
    throw err;
  }
});

archive.on('error', err => {
  throw err;
});

output.on('close', () => {
  const totalBytes = archive.pointer();
  const sizeMB     = (totalBytes / 1024 / 1024).toFixed(2);

  // Count entries in staging dir for summary
  const stagedFiles = fs.readdirSync(STAGING).length;

  // Clean up staging
  fs.rmSync(STAGING, { recursive: true, force: true });

  console.log('\n=== WGT package created ===');
  console.log('Output:     ', OUT);
  console.log('Size:       ', sizeMB + ' MB (' + totalBytes.toLocaleString() + ' bytes)');
  console.log('Files in archive:', stagedFiles);
  console.log('===========================\n');
});

archive.pipe(output);
archive.directory(STAGING, false);
archive.finalize();

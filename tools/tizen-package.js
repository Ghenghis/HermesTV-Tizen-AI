#!/usr/bin/env node
'use strict';

/**
 * tools/tizen-package.js
 *
 * Invokes the Tizen Studio CLI to produce a sideloadable .wgt from the
 * staged apps/hermes-tv-tizen/dist/ directory.
 *
 * Resolves the Tizen CLI in this order:
 *   1. process.env.TIZEN_CLI                — exact path to tizen.bat / tizen
 *   2. "tizen.bat" / "tizen" on PATH        — via which/where
 *   3. exits with code 2 and a clear install message
 *
 * Then runs:
 *   tizen build-web -- -e ".*\\.scss"
 *   tizen package -t wgt -o dist-tizen -- .buildResult
 *
 * On success: prints path + size + sha256 of the resulting .wgt.
 *
 * Hard rules:
 *   - Never installs anything.
 *   - Never modifies the Tizen toolchain.
 *   - Never connects to a TV or runs `tizen install`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const TIZEN_APP_DIR = path.join(REPO_ROOT, 'apps', 'hermes-tv-tizen');
const STAGED_DIR = path.join(TIZEN_APP_DIR, 'dist');
const BUILD_RESULT_DIR = path.join(TIZEN_APP_DIR, '.buildResult');
const WGT_OUTPUT_DIR = path.join(TIZEN_APP_DIR, 'dist-tizen');
const IS_WIN = process.platform === 'win32';

const PKG_VERSION = readPackageVersion();
const WGT_NAME = `HermesTV-${PKG_VERSION}.wgt`;

function log(msg) {
  process.stdout.write(`[tizen-package] ${msg}\n`);
}

function die(msg, code) {
  process.stderr.write(`[tizen-package] ERROR: ${msg}\n`);
  process.exit(typeof code === 'number' ? code : 1);
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(TIZEN_APP_DIR, 'package.json'), 'utf8')
    );
    return pkg.version || '0.1.0';
  } catch (_) {
    return '0.1.0';
  }
}

function resolveTizenCli() {
  // 1. Explicit env var.
  const envCli = process.env.TIZEN_CLI;
  if (envCli && envCli.length > 0) {
    if (!fs.existsSync(envCli)) {
      die(
        `TIZEN_CLI is set to "${envCli}" but that path does not exist. ` +
          `Fix the env var or unset it to fall back to PATH lookup.`,
        2
      );
    }
    return envCli;
  }

  // 2. PATH lookup.
  const candidates = IS_WIN ? ['tizen.bat', 'tizen.exe', 'tizen'] : ['tizen'];
  const finder = IS_WIN ? 'where' : 'which';
  for (const candidate of candidates) {
    const res = spawnSync(finder, [candidate], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout && res.stdout.trim()) {
      // `where` may emit multiple lines — take the first.
      return res.stdout.split(/\r?\n/)[0].trim();
    }
  }

  // 3. Not found.
  die(
    [
      'Tizen Studio CLI not found.',
      '',
      'Install Tizen Studio 5.6+ from:',
      '  https://developer.tizen.org/development/tizen-studio/download',
      '',
      'Then either:',
      '  - Add C:\\Tizen\\tools\\ide\\bin to PATH (Windows), OR',
      `  - Set TIZEN_CLI=C:\\Tizen\\tools\\ide\\bin\\tizen.bat (Windows)`,
      `  - Set TIZEN_CLI=/path/to/tizen-studio/tools/ide/bin/tizen (mac/linux)`,
      '',
      'See docs/34_TIZEN_BUILD_AND_SIDELOAD.md for full prerequisites.',
    ].join('\n'),
    2
  );
}

function preflight() {
  if (!fs.existsSync(STAGED_DIR)) {
    die(
      `staged dist/ does not exist at ${STAGED_DIR}. ` +
        `Run "node tools/tizen-prep.js" first (or "npm run build" from apps/hermes-tv-tizen/).`
    );
  }
  if (!fs.existsSync(path.join(STAGED_DIR, 'config.xml'))) {
    die(`dist/config.xml missing — re-run tools/tizen-prep.js`);
  }
  if (!fs.existsSync(path.join(STAGED_DIR, 'index.html'))) {
    die(`dist/index.html missing — re-run tools/tizen-prep.js`);
  }
  if (!fs.existsSync(path.join(STAGED_DIR, 'icon.png'))) {
    die(`dist/icon.png missing — re-run tools/tizen-prep.js`);
  }
  fs.mkdirSync(WGT_OUTPUT_DIR, { recursive: true });
  // Clean any previous .buildResult so we don't conflate runs.
  if (fs.existsSync(BUILD_RESULT_DIR)) {
    fs.rmSync(BUILD_RESULT_DIR, { recursive: true, force: true });
  }
}

function runTizen(cli, args, cwd) {
  log(`run: ${cli} ${args.join(' ')}  (cwd: ${cwd})`);
  const res = spawnSync(cli, args, {
    cwd: cwd,
    stdio: 'inherit',
    shell: IS_WIN, // .bat needs shell
  });
  if (res.error) {
    die(`failed to execute Tizen CLI: ${res.error.message}`);
  }
  if (res.status !== 0) {
    die(`Tizen CLI exited with status ${res.status}`);
  }
}

function findWgtIn(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wgt'));
  if (files.length === 0) return null;
  // Pick the most recently modified .wgt
  files.sort((a, b) => {
    return (
      fs.statSync(path.join(dir, b)).mtimeMs -
      fs.statSync(path.join(dir, a)).mtimeMs
    );
  });
  return path.join(dir, files[0]);
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  log(`packaging HermesTV ${PKG_VERSION} (.wgt)`);
  const cli = resolveTizenCli();
  log(`tizen CLI: ${cli}`);
  preflight();

  // Step A — tizen build-web (copies staged dist/ into .buildResult/)
  //          The exclude flag drops any leftover .scss files that should not
  //          ship to the TV. Vite produces compiled CSS, so this is purely
  //          defensive.
  runTizen(cli, ['build-web', '--', '-e', '.*\\.scss'], STAGED_DIR);

  // Step B — tizen package -t wgt -o dist-tizen -- .buildResult
  runTizen(
    cli,
    ['package', '-t', 'wgt', '-o', WGT_OUTPUT_DIR, '--', BUILD_RESULT_DIR],
    STAGED_DIR
  );

  // Locate the produced .wgt.
  let wgtPath = findWgtIn(WGT_OUTPUT_DIR);
  if (!wgtPath) {
    // Tizen sometimes drops .wgt back into .buildResult/. Check there too.
    wgtPath = findWgtIn(BUILD_RESULT_DIR);
    if (wgtPath) {
      const dest = path.join(WGT_OUTPUT_DIR, path.basename(wgtPath));
      fs.copyFileSync(wgtPath, dest);
      wgtPath = dest;
    }
  }
  if (!wgtPath) {
    die(
      `no .wgt produced — checked ${WGT_OUTPUT_DIR} and ${BUILD_RESULT_DIR}. ` +
        `Review Tizen CLI output above.`
    );
  }

  // Rename to canonical HermesTV-<version>.wgt so downstream tools and docs
  // can refer to a stable filename.
  const canonical = path.join(WGT_OUTPUT_DIR, WGT_NAME);
  if (wgtPath !== canonical) {
    fs.renameSync(wgtPath, canonical);
    wgtPath = canonical;
  }

  const stats = fs.statSync(wgtPath);
  const hash = sha256(wgtPath);

  log('package complete');
  log(`  path:    ${wgtPath}`);
  log(`  size:    ${humanSize(stats.size)} (${stats.size} bytes)`);
  log(`  sha256:  ${hash}`);
  log('');
  log('Next steps:');
  log(`  1. (one-time) Sign with: tizen security-profiles add ... && tizen package -t wgt -s <profile> --`);
  log(`  2. Sideload:  tizen install -n ${WGT_NAME} -t <tv-device-id>`);
  log(`     or:        sdb install ${wgtPath}`);
  log(`  See docs/34_TIZEN_BUILD_AND_SIDELOAD.md for the full procedure.`);
}

try {
  main();
} catch (err) {
  die(err && err.stack ? err.stack : String(err));
}

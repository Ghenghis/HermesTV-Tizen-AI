# HermesTV — Doc 09: Tizen Build & Sideload Contract

**Version:** 1.1.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (Sherri — Tizen 6.5, QLED) · UN55CU8000BXZA (Dave — Tizen 6.5, Crystal UHD)  
**Status:** BINDING — build pipeline must meet all targets for both TVs

---

## 1. CRITICAL: Two Different Hardware Tiers — Same Tizen Version

Both TVs run **Tizen 6.5** (confirmed from project lock). The Tizen version is the same; the hardware performance tier differs. The build pipeline must produce a **single `.wgt` package** that works correctly on both:

| | Sherri's TV (Mom) | Dave's TV |
|---|---|---|
| Model | QN85Q7FAAFXZA | UN55CU8000BXZA |
| Tizen | **6.5** | **6.5** |
| Panel / class | QLED (QN-prefix) — enhanced tier | Crystal UHD (UN-prefix) — baseline tier |
| Chromium | ~76 (Tizen 6.5 web engine) | ~76 (Tizen 6.5 web engine) |
| JavaScript | ES2019 supported | ES2019 supported |
| CSS Grid | ✅ | ✅ |
| `fetch()` | ✅ | ✅ |
| `Proxy` | ✅ | ✅ |
| `IntersectionObserver` | ✅ | ✅ |
| WASM | ✅ (QN class) | limited — do not rely on |
| Web Workers | ❌ (restricted in .wgt) | ❌ (restricted in .wgt) |
| Performance budget | Enhanced — more animations, larger cache | Baseline — drives the minimum spec |

> **UNVERIFIED NOTE (per doc 02):** Exact Tizen sub-version, web-engine UA string, and hardware caps MUST be confirmed on-device via `webapis.productinfo` before finalizing compatibility decisions. The values above reflect the Tizen 6.5 class; do not ship production code based on unverified assumptions.

**Strategy:** Target ES2019 (both TVs support it). Use `chrome 76` as the Babel target to match Tizen 6.5 web engine. Feature-detect at runtime to unlock enhanced UI paths for Sherri's QN-class TV. Dave's Crystal UHD TV is the performance floor.

---

## 2. Project Directory Structure

```
apps/tizen-hermes-tv/
├── config.xml            ← Tizen app manifest
├── icon.png              ← App icon (117×117 px minimum)
├── index.html            ← Single-page entry point
├── src/
│   ├── main.js           ← Entry; bootstraps platform detection
│   ├── platform/
│   │   ├── capabilities.js     ← detectTVCapabilities()
│   │   ├── tizenAdapter.js     ← AVPlay, productinfo, key registration
│   │   └── sharedKeys.js       ← Key code normalization
│   ├── ui/
│   │   ├── navigation/
│   │   │   ├── focusEngine.js  ← Spatial D-pad nav
│   │   │   └── screen.js       ← Screen transitions
│   │   ├── player/
│   │   │   ├── avplayEngine.js ← AVPlay handle management
│   │   │   └── statsOverlay.js ← Stream stats panel
│   │   ├── quality/
│   │   │   └── qualityBadge.js ← Badge rendering (doc 07)
│   │   ├── overlay/
│   │   │   ├── hermesOverlay.js ← AI chat floating overlay
│   │   │   └── actionCard.js    ← Agent action confirmation cards
│   │   ├── epg/
│   │   │   └── epgGrid.js      ← Virtual DOM EPG grid
│   │   └── theme/
│   │       ├── themeManager.js ← CSS variable switching
│   │       └── themeColors.js  ← 24 theme definitions
│   ├── core/
│   │   ├── api.js              ← All VPS API calls
│   │   ├── profileStore.js     ← Per-profile settings (Sherri/Dave)
│   │   └── commandRouter.js    ← Agent JSON command client
│   └── css/
│       ├── base.css            ← TV-safe variables, clamp() typography
│       ├── layout.css          ← 12 layout presets
│       └── themes/             ← 24 theme CSS variable sets
├── dist/                 ← Build output (gitignored)
└── .tizen/               ← Tizen certificates (gitignored)
```

---

## 3. Build Pipeline

### 3.1 Package Dependencies

```json
{
  "scripts": {
    "build": "webpack --config webpack.config.js",
    "build:watch": "webpack --watch",
    "package": "npm run build && node scripts/package-wgt.js",
    "lint": "eslint src/ --rule 'no-var: 0'",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "webpack": "^5",
    "webpack-cli": "^5",
    "babel-loader": "^9",
    "@babel/core": "^7",
    "@babel/preset-env": "^7",
    "core-js": "^3",
    "whatwg-fetch": "^3",
    "es6-promise": "^4",
    "css-loader": "^6",
    "mini-css-extract-plugin": "^2",
    "archiver": "^6"
  }
}
```

### 3.2 Babel Configuration (`.babelrc`)

```json
{
  "presets": [
    ["@babel/preset-env", {
      "targets": { "chrome": "76" },
      "useBuiltIns": "usage",
      "corejs": 3,
      "modules": false
    }]
  ]
}
```

Targeting `chrome 76` matches the Tizen 6.5 web engine on both TVs. Both TVs support ES2019 natively; Babel will still include any required polyfills and transpile for consistency. Downgrade to `chrome 47` only if on-device testing (doc 02 diagnostic screen) reveals an older engine than expected.

### 3.3 Webpack Configuration (`webpack.config.js`)

```js
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    library: { type: 'var', name: 'HermesTV' }
  },
  module: {
    rules: [
      { test: /\.js$/, use: 'babel-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] }
    ]
  },
  plugins: [new MiniCssExtractPlugin({ filename: 'bundle.css' })],
  optimization: { minimize: true },
  target: ['web', 'es5']
};
```

Output: single `dist/bundle.js` (ES5 IIFE) + `dist/bundle.css`.

### 3.4 Feature Detection at Runtime

```js
// src/platform/capabilities.js
function detectTVCapabilities() {
  var v = 0;
  try {
    v = parseFloat(
      tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
    );
  } catch(e) {}

  // Both target TVs are Tizen 6.5. Tier is determined by QN/UN model prefix,
  // not by Tizen version. Do not use tizenVersion alone to gate features.
  return {
    tizenVersion:           v,
    isKnownTv:              v >= 6.0 && v < 8.0, // expected range for both TVs
    isEnhancedTier:         false, // Set by detectPerformanceTier() via productinfo
    supportsGrid:           true,  // Tizen 6.5 / Chromium 76 supports CSS Grid
    supportsFetch:          true,  // Native on Tizen 6.5
    supportsLowLatency:     v >= 5.0,
    supportsModernDrm:      v >= 5.0,
    supportsWasm:           false, // Do not assume — confirm on-device per TV
    supportsAvExtension:    v >= 6.0,
    supportsNavigatorConn:  v >= 6.0,
    supportsIntersectionObs: v >= 5.0
  };
}

// QN/UN prefix detection drives the performance tier split.
// Sherri's QN85Q7FAAFXZA → QN prefix → enhanced tier (more animations, larger cache).
// Dave's UN55CU8000BXZA → UN prefix → baseline tier (performance floor).
function detectPerformanceTier(caps) {
  try {
    var model = webapis.productinfo.getModelCode();
    caps.isEnhancedTier = /^QN/i.test(model); // QN prefix = Sherri's TV = enhanced
    caps.isSherriTv = /^QN/i.test(model);
    caps.isDavesTv  = /^UN/i.test(model);
  } catch(e) {
    // Fallback: cannot determine model prefix — assume baseline (conservative)
    caps.isEnhancedTier = false;
    caps.isSherriTv = false;
    caps.isDavesTv  = false;
  }
  return caps;
}
```

---

## 4. Tizen App Manifest (`config.xml`)

### 4.1 Package ID Rules

Samsung Tizen requires the `package` attribute to be **exactly 10 alphanumeric characters**. The `tizen:application id` must be `<package>.<AppName>` (no spaces). `required_version` must match the minimum Tizen version the app targets — set to `6.5` for both TVs.

### 4.2 CSP (Content-Security-Policy)

The CSP in `index.html` (not config.xml) must allow:
- `default-src 'self'` — block all unspecified sources
- `connect-src 'self' http://192.168.1.0/24 ws://192.168.1.0/24` — LAN VPS only (replace subnet with actual VPS IP after network lock)
- `script-src 'self'` — no inline scripts, no CDN
- `style-src 'self' 'unsafe-inline'` — allow inline CSS vars (required for theme switching)
- `img-src 'self' data:` — no external image domains

> **HARD RULE:** CSP must never include `*` wildcards or external public domains. All backend calls go to the LAN VPS IP only. Set the concrete IP in a build-time env var (`VPS_LAN_IP`) injected by `webpack.DefinePlugin` — never hardcoded in source.

Example `index.html` `<head>` CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               connect-src 'self' http://__VPS_LAN_IP__ ws://__VPS_LAN_IP__;
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               media-src 'self' http://__VPS_LAN_IP__;">
```
`__VPS_LAN_IP__` is replaced at build time by `webpack.DefinePlugin` from `process.env.VPS_LAN_IP`.

### 4.3 Canonical `config.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="https://hermes.tv/app"
        version="1.0.0">

  <!-- package: exactly 10 alphanumeric chars (Samsung requirement).         -->
  <!-- required_version: 6.5 — both QN85Q7FAAFXZA and UN55CU8000BXZA are   -->
  <!-- Tizen 6.5. Setting 3.0 here would be incorrect and misleading.       -->
  <tizen:application id="HermesTVap.app"
                     package="HermesTVap"
                     required_version="6.5"/>

  <name>HermesTV</name>
  <icon src="icon.png"/>
  <content src="index.html"/>

  <!-- LAN backend access only — no public domains, no wildcard.                -->
  <!-- hermestv.local = default mDNS name. Add raw LAN IP as a separate <access> -->
  <!-- entry at deploy time only; do not commit IP addresses here.               -->
  <!-- HARD RULE: access origin must NEVER be "*". subdomains must be "false".   -->
  <access origin="http://hermestv.local" subdomains="false"/>
  <access origin="https://hermestv.local" subdomains="false"/>
  <access origin="ws://hermestv.local" subdomains="false"/>
  <access origin="wss://hermestv.local" subdomains="false"/>

  <tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>
  <tizen:privilege name="http://developer.samsung.com/privilege/avplay"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <tizen:privilege name="http://tizen.org/privilege/voicecontrol"/>
  <tizen:privilege name="http://tizen.org/privilege/mediacapturer"/>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:privilege name="http://tizen.org/privilege/network.get"/>
  <tizen:privilege name="http://tizen.org/privilege/filesystem.read"/>
  <tizen:privilege name="http://tizen.org/privilege/filesystem.write"/>

  <tizen:profile name="tv"/>

  <feature name="http://tizen.org/feature/screen.size.all"/>

  <tizen:setting background-support="disable"
                 encryption="disable"
                 install-location="auto"
                 hwkey-event="enable"/>
</widget>
```

> **HARD RULE:** `access origin` must never be `*`. It must point only to the LAN VPS address. Wildcard access is forbidden — it would expose the app to SSRF via malicious IPTV stream metadata.

---

## 5. Sideload Paths

### 5.1 Developer Mode Activation — Required on Both TVs Before Any Sideload

Developer mode must be activated once per TV. The exact menu path differs by TV but the Samsung Smart TV developer mode steps are the same for both Tizen 6.5 models:

**Sherri's TV (QN85Q7FAAFXZA) — Developer Mode:**
1. On the TV remote, press **Home**.
2. Navigate to **Settings** (gear icon).
3. Go to **Support** > **About Smart TV**.
4. In the model number dialog, type `12345` using the on-screen keyboard (not the remote number pad — use the directional keys to navigate the keyboard).
5. The Developer Mode popup appears. Set the **IP of your development machine** (the workstation running Tizen Studio / sdb, not `0.0.0.0`).
6. Toggle Developer Mode **ON** and reboot the TV.
7. After reboot, a "Developer Mode" banner appears in the top-left of the TV screen — this confirms activation.

**Dave's TV (UN55CU8000BXZA) — Developer Mode:**
1. Same sequence as above: **Settings > Support > About Smart TV > type `12345`**.
2. Enter the **workstation IP** in the host field.
3. Toggle Developer Mode **ON** and reboot.
4. Confirm "Developer Mode" banner appears after reboot.

> **IMPORTANT:** Use the actual workstation LAN IP (e.g., `192.168.1.x`) — not `0.0.0.0`. The TV uses this IP to validate sdb connections. If the IP changes, repeat this step.

---

### 5.2 Certificate Setup — Required for All `.wgt` Sideloads

Every `.wgt` installed via `tizen install` or Tizen Studio must be signed with a Samsung distributor certificate. Unsigned packages are rejected at install time.

**One-time certificate setup (covers both TVs):**
1. Install **Tizen Studio 5.6+** from [https://developer.tizen.org/development/tizen-studio/download](https://developer.tizen.org/development/tizen-studio/download).
2. Install the **Certificate Extension**: Tizen Studio Package Manager > Extension SDK > Extras > Certificate Extension v2.0.73+.
3. Open **Tools > Certificate Manager**.
4. Click **+** > Select **Samsung** > **TV**.
5. Sign in with your Samsung developer account.
6. Choose **Create a new certificate profile**.
7. Generate a new author certificate (or import an existing `.p12`).
8. Add distributor certificate — register **both TVs' DUIDs**:
   - Sherri's TV DUID: retrieve via `webapis.productinfo.getDuid()` (run the doc-02 diagnostic screen on-device, or read from About Smart TV > Smart TV Certificate screen).
   - Dave's TV DUID: same process.
9. Save the profile (e.g., `HermesTV-dev`).
10. The signing files land in `.tizen/` — this directory is **gitignored** and must never be committed.

**Verify signing works:**
```bash
tizen build-web -out dist/ -- .
tizen package -t wgt -s HermesTV-dev -- dist/
# Should produce dist/HermesTV.wgt with no signing errors
```

---

### 5.3 Tizen CLI — Full Build, Sign, and Install Commands

Use these exact commands. Do not use the Tizen Studio IDE for routine sideloads — the CLI is repeatable and scriptable.

```bash
# 0. Prerequisites: Tizen Studio CLI on PATH
#    Add to PATH: <TizenStudio>/tools/ide/bin and <TizenStudio>/tools
export PATH=$PATH:/path/to/tizen-studio/tools/ide/bin:/path/to/tizen-studio/tools

# 1. Build webpack bundle
cd apps/tizen-hermes-tv
npm run build
# Output: dist/bundle.js, dist/bundle.css

# 2. Build Tizen web project (copies src into .buildResult/)
tizen build-web -out .buildResult -- .
# Flag: -- . means "build from current directory"

# 3. Package and sign .wgt (uses HermesTV-dev certificate profile)
tizen package -t wgt -s HermesTV-dev -- .buildResult
# Output: .buildResult/HermesTV.wgt (signed)

# 4. Connect to TV via sdb
sdb connect <TV_LAN_IP>:26101
sdb devices
# Confirm the TV shows as "device" not "offline"

# 5. Install on target TV
tizen install -n HermesTV.wgt -t <sdb_device_serial> -- .buildResult
# <sdb_device_serial> is the serial shown by `sdb devices`

# 6. Verify installation
sdb -s <sdb_device_serial> shell 0 applist | grep HermesTV
# Should print: HermesTVap.app

# 7. Launch
sdb -s <sdb_device_serial> shell 0 execute HermesTVap.app

# 8. Stream logs
sdb -s <sdb_device_serial> shell 0 dlog -s HermesTV
```

> **TV IP addresses:** Do not hardcode IP addresses in scripts. Use an `.env.local` file (gitignored) with `SHERRI_TV_IP` and `DAVE_TV_IP` variables, loaded in the deploy script.

---

### 5.4 TizenBrew — Reference Path (Dave's TV Only, Optional)

TizenBrew enables developer-mode-less sideloading for TVs on Tizen 5.0+. Both TVs are Tizen 6.5, so TizenBrew is compatible. However, TizenBrew is **not the primary path** — Tizen Studio CLI (section 5.3) is primary for both TVs.

TizenBrew is documented here as a reference in case developer mode cannot be maintained (e.g., firmware update resets it). It requires TizenBrew Installer to be installed on the TV first, which itself requires Tizen Studio and a one-time sideload.

**TizenBrew sideload reference flow:**
1. Install TizenBrew via TizenBrew Installer `.wgt` (sideloaded once via CLI above).
2. In TizenBrew, register HermesTV as a custom app pointing to a GitHub Release `.wgt` URL.
3. On TV: open TizenBrew > HermesTV > Update to pull new `.wgt` releases.

> **Security note:** TizenBrew must only point to private/unlisted GitHub Release URLs. Never point to a public asset URL containing LAN IP configuration or build secrets.

---

### 5.5 Debugging

| TV | Method | DevTools Chrome Version |
|---|---|---|
| Sherri's TV (QN85Q7FAAFXZA — Tizen 6.5) | Remote debug via Chrome | Chrome 76–85 recommended |
| Dave's TV (UN55CU8000BXZA — Tizen 6.5) | Remote debug via Chrome | Chrome 76–85 recommended |

**Enable remote debugging (both TVs):**
```
http://<TV_LAN_IP>:7011
```
Open this URL in Chrome on the workstation. The DevTools inspector lists running Tizen apps. Click **HermesTV** to attach.

Enable remote debugging in Tizen Studio: Run Configurations > Remote Debugging > check "Launch inspector" and set the TV IP.

**Console output without DevTools:**
```bash
sdb -s <sdb_device_serial> shell 0 dlog -s HermesTV
```

---

## 6. `.wgt` Package Script (`scripts/package-wgt.js`)

> **NOTE:** This script produces an **unsigned** `.wgt` for inspection only. Production sideloads must use `tizen package -t wgt -s <profile>` (section 5.3) which produces a signed `.wgt`. Never sideload the unsigned output of this script — it will be rejected by the TV.

```js
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

// SECURITY GATE: verify no credentials in bundle before packaging
const bundleSource = fs.readFileSync(path.resolve(__dirname, '../dist/bundle.js'), 'utf8');
const credentialPatterns = [
  /sk-[a-zA-Z0-9]{32,}/,          // OpenAI-style keys
  /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/, // Bearer tokens
  /password\s*[:=]\s*["'][^"']{6,}/, // Hardcoded passwords
  /api_key\s*[:=]\s*["'][^"']{8,}/,  // api_key assignments
  /secret\s*[:=]\s*["'][^"']{8,}/,   // secret assignments
  /AKIA[0-9A-Z]{16}/,               // AWS access key IDs
];
credentialPatterns.forEach(function(pattern) {
  if (pattern.test(bundleSource)) {
    console.error('SECURITY GATE FAILED: credential pattern detected in bundle.js:', pattern.toString());
    process.exit(1);
  }
});
console.log('Security gate passed: no credential patterns in bundle.js');

const output = fs.createWriteStream('HermesTV-unsigned.wgt');
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(output);

// Required files in .wgt root
archive.file('config.xml', { name: 'config.xml' });
archive.file('icon.png',   { name: 'icon.png' });
archive.file('index.html', { name: 'index.html' });
archive.file('dist/bundle.js',  { name: 'bundle.js' });
archive.file('dist/bundle.css', { name: 'bundle.css' });

archive.finalize();
output.on('close', function() {
  console.log('HermesTV-unsigned.wgt created:', archive.pointer(), 'bytes');
  console.log('Sign this package with: tizen package -t wgt -s HermesTV-dev -- .buildResult');
});
```

### 6.1 Secret Scan Gate (BUILD-GATE-11)

Before any `.wgt` is sideloaded, run a dedicated secret scan:

```bash
# Install truffleHog or gitleaks (one-time)
npm install -g truffleHog  # or: brew install gitleaks

# Scan dist/ output before packaging
trufflehog filesystem dist/ --only-verified
# OR
gitleaks detect --source dist/ --no-git

# Must exit 0 with no findings before proceeding to package/sign/install
```

This gate is separate from the pattern checks in `package-wgt.js` and must catch any secrets injected via env var substitution at build time.

---

## 7. JavaScript Compatibility for Tizen 6.5 (Both TVs)

Both TVs run Tizen 6.5 (Chromium ~76). ES2019 is supported natively. The following is the compatibility baseline:

**Supported natively on both TVs (Tizen 6.5 / Chromium 76):**
- `async`/`await`
- Arrow functions, `const`/`let`
- Template literals, destructuring, spread/rest
- `fetch()`, `Promise`
- `Array.from`, `Array.prototype.includes`
- `Object.assign`, `Object.entries`, `Object.fromEntries`
- `String.prototype.includes`, `startsWith`, `endsWith`, `padStart`
- CSS Grid, CSS custom properties (`--var`)
- `IntersectionObserver`

**Not available on either TV (restricted in `.wgt` sandbox):**
- Web Workers — do not use
- SharedArrayBuffer — do not use
- WASM — avoid unless on-device testing confirms (especially on Dave's Crystal UHD)

**Still provide polyfills via Babel + core-js for safety** (targeting `chrome 76` catches edge cases in the Tizen 6.5 web engine that may lag behind the desktop Chrome 76 baseline):

| API | Status |
|---|---|
| `fetch` | Native — polyfill kept as fallback |
| `Promise` | Native |
| `Object.assign` | Native |
| `Array.from` | Native |
| `Array.prototype.includes` | Native |
| `globalThis` | Polyfill via core-js (Chromium 71 added it; confirm Tizen 6.5 sub-version) |

> **If on-device testing reveals the web engine is older than Chromium 76** (possible on Tizen 6.5 early firmware), downgrade the Babel target to `chrome 56` and add the ES5 polyfill set. Confirm with the doc-02 diagnostic screen user agent string.

---

## 8. CSS Compatibility Layer (`base.css` requirements)

```css
/* Flexbox — both TVs (Tizen 6.5 supports unprefixed flex, but -webkit- is harmless) */
.container {
  display: -webkit-flex;  /* belt-and-suspenders for Tizen sub-version edge cases */
  display: flex;
}
.row {
  -webkit-flex-direction: row;
  flex-direction: row;
}

/* Grid — Sherri's TV only (body--enhanced set by QN prefix detection in JS) */
/* Both TVs support CSS Grid on Tizen 6.5, but grid is reserved for enhanced   */
/* tier to keep Dave's TV rendering budget conservative.                         */
.body--enhanced .epg-grid {
  display: grid;
  grid-template-columns: 200px 1fr;
}
.body--baseline .epg-grid {
  display: -webkit-flex;
  display: flex;
}

/* Typography — TV-safe clamp. Both TVs support clamp() on Tizen 6.5.      */
/* The px fallback protects against edge cases in Tizen sub-version builds. */
.headline {
  font-size: 36px;                     /* fallback for edge cases */
  font-size: clamp(28px, 3vw, 48px);  /* Tizen 6.5+ */
}
```

The `<body>` element receives `class="body--enhanced"` or `class="body--baseline"` at boot based on `detectTVCapabilities()`. Enhanced-tier CSS paths activate on Sherri's QN-class TV (higher performance tier). Dave's Crystal UHD TV uses baseline CSS paths.

---

## 9. Voice Input Implementation

Voice input uses `getUserMedia` + WebSocket to VPS — **no Bixby, no Samsung cloud**:

```js
// src/platform/voiceInput.js
// Available on TVs whose remote has a mic button
function startVoiceCapture(onResult) {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
      var ws = new WebSocket('wss://hermestv.local/api/stt');
      var mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = function(e) {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };

      ws.onmessage = function(e) {
        var result = JSON.parse(e.data);
        if (result.text) onResult(result.text);
        stopVoiceCapture(mediaRecorder, stream);
      };

      mediaRecorder.start(250); // 250ms chunks
    })
    .catch(function() {
      // Mic not available — show on-screen input fallback
      showFloatingChatInput();
    });
}
```

**VPS STT service** (`services/hermes-stt`): receives audio chunks via WebSocket, transcribes via faster-whisper (local), returns `{ "text": "switch to cinema mode" }`.

**Voice input capability per TV:**
- Sherri's TV (QN85, 2017 QLED remote): Smart Remote has built-in mic — `getUserMedia` available via `voicecontrol` permission
- Dave's TV (UN55, 2023 One Remote): remote has mic (Bixby button) — accessible via same `getUserMedia` path without Bixby API
- Fallback (both): on-screen mic button in Hermes overlay, OR OK long-press (1.5s) to open typed input

---

## 10. Build Proof Gates

| Gate | Requirement |
|---|---|
| BUILD-GATE-01 | `npm run build` exits 0 with no errors |
| BUILD-GATE-02 | `bundle.js` parses cleanly as ES2019 or lower (validate with `acorn --ecmaVersion 2019 bundle.js`) |
| BUILD-GATE-03 | Signed `HermesTV.wgt` package contains `config.xml`, `icon.png`, `index.html`, `bundle.js`, `bundle.css` and no other top-level files |
| BUILD-GATE-04 | App installs and launches on Dave's TV (UN55CU8000BXZA — Tizen 6.5) via `tizen install` + `sdb` without errors |
| BUILD-GATE-05 | App installs and launches on Sherri's TV (QN85Q7FAAFXZA — Tizen 6.5) via `tizen install` + `sdb` without errors |
| BUILD-GATE-06 | `detectTVCapabilities()` returns `tizenVersion` in the range 6.0–7.0 on both TVs |
| BUILD-GATE-07 | `isEnhancedTier = true` on Sherri's TV (QN prefix), `false` on Dave's TV (UN prefix) |
| BUILD-GATE-08 | D-pad navigation works on both TVs (Back key intercepted, no app termination) |
| BUILD-GATE-09 | Remote debug via Chrome attaches at `http://<TV_IP>:7011` on both TVs |
| BUILD-GATE-10 | `getUserMedia` audio capture works or falls back gracefully to on-screen input on both TVs |
| BUILD-GATE-11 | Secret scan (`trufflehog` or `gitleaks`) exits 0 with no findings on `dist/` before any `.wgt` is signed or installed |
| BUILD-GATE-12 | `config.xml` `required_version` is `6.5`; `package` attribute is exactly 10 alphanumeric characters |
| BUILD-GATE-13 | `<access origin>` in `config.xml` is not `*`; it references only the LAN VPS IP or `localhost` placeholder |
| BUILD-GATE-14 | CSP meta tag in `index.html` is present; `connect-src` does not contain `*` and does not reference any public internet domain |

---

## 11. Out of Scope

- Seller Office / Samsung Smart TV App Store submission (private household app only)
- Code signing for distribution (developer cert sufficient for sideload)
- Bixby voice API integration (forbidden per project policy)
- Multi-app bundle or background service apps (single `.wgt` only)

# 34 — Tizen Build and Sideload (Operator Runbook)

**Audience:** Dave (operator).
**Goal:** Produce a signed `HermesTV-<version>.wgt` and install it on Mom's QN85
QLED so the HermesTV icon appears on the Samsung launcher.

This runbook is the practical companion to
[09_TIZEN_BUILD_SIDELOAD_CONTRACT.md](09_TIZEN_BUILD_SIDELOAD_CONTRACT.md).
Doc 09 is the binding contract (what the build must satisfy). This doc is
the procedure (how to run it).

---

## 0. One-line summary

```
cd apps/hermes-tv-tizen
npm run build
# → produces dist-tizen/HermesTV-0.1.0.wgt
```

After that, sign and sideload (sections 3–4 below).

---

## 1. Prerequisites

Install once per workstation.

### 1.1 Tizen Studio CLI

1. Download **Tizen Studio 5.6 or newer** from
   [developer.tizen.org/development/tizen-studio/download](https://developer.tizen.org/development/tizen-studio/download).
2. Default Windows install path: `C:\Tizen\` (the runbook assumes this).
3. After install, also run **Package Manager → Extension SDK → Extras** and add:
   - **TV Extensions** (latest)
   - **Certificate Extension** v2.0.73 or newer (required for signing)
4. Either:
   - Add `C:\Tizen\tools\ide\bin` and `C:\Tizen\tools` to `PATH`, **or**
   - Set the env var `TIZEN_CLI=C:\Tizen\tools\ide\bin\tizen.bat`

Verify:

```powershell
tizen version
# → Tizen CLI 2.5.x or newer
```

If you set `TIZEN_CLI` instead of editing `PATH`, the build will still find
the tool via that env var.

### 1.2 Node.js 20+

The repo's web build runs on Node 20+. Confirm with `node -v`.

### 1.3 Samsung Debug Bridge (`sdb`)

`sdb` ships with Tizen Studio under `C:\Tizen\tools\`. Add that folder to
`PATH` or call it via its full path. Verify:

```powershell
sdb version
```

---

## 2. TV setup — enable Developer Mode on Mom's QN85

Done once per TV. Already done? Skip to section 3.

> **Important:** Do this with permission — Mom's TV is in active use. Pick
> a window when she isn't watching, and tell her you're going to make the
> TV show a small banner in the corner for a minute.

1. **On the TV remote, press the Apps icon** so the Apps screen appears.
2. **Type `12345`** using the on-screen keypad (Samsung's published code for
   developer mode on Tizen 6.5 — see doc 09 §5.1).
3. The **Developer Mode** dialog appears.
4. Set **Host PC IP** to the **LAN IP of your workstation**
   (e.g. `192.168.1.42`, not `0.0.0.0` and not the public WAN IP). Find
   yours with `ipconfig` on Windows or `ip addr` on mac/linux.
5. Toggle **Developer Mode = ON**.
6. **Reboot the TV.** When it comes back up, a small "Developer Mode" tag
   shows in the top-left for a few seconds — that confirms it's enabled.

> If the TV's firmware updates later, developer mode can switch itself off
> silently. Re-enable it and continue.

### 2.1 Find Mom's TV LAN IP

On the TV: **Settings → General → Network → Network Status → IP Settings**.
Write it down (e.g. `192.168.1.55`). The sideload commands below use it.

### 2.2 Get the TV DUID (one-time, for signing)

The Samsung distributor certificate must list each TV's DUID. To read it:

```powershell
sdb connect 192.168.1.55:26101
sdb devices       # confirm "device" not "offline"
sdb -s <serial> shell 0 getduid
```

Save the DUID; you'll paste it into Tizen Studio's Certificate Manager.

---

## 3. Build

This is the dev loop. The web app is the source of truth; the Tizen build
wraps it.

```powershell
cd G:\Github\HermesTV-Tizen-AI\apps\hermes-tv-tizen
npm install      # first time only — installs zero deps; this is a wrapper package
npm run build
```

`npm run build` runs three steps in order:

| Step | What it does |
|---|---|
| `build:web` | Vite build of `apps/hermes-web-tv/` → `dist/` |
| `prebuild` (`tizen-prep.js`) | Stages web `dist/` into `apps/hermes-tv-tizen/dist/`, adds `config.xml` + icon, copies `apiBase.js` |
| `build:wgt` (`tizen-package.js`) | Runs `tizen build-web` and `tizen package -t wgt` |

On success you get:

```
apps/hermes-tv-tizen/dist-tizen/HermesTV-0.1.0.wgt
```

The script prints the file path, size, and a sha256 fingerprint. Record
the sha256 in the release notes for auditability.

### 3.1 The `.wgt` is unsigned by default

`tizen package -t wgt` without `-s <profile>` produces an **unsigned**
package. Samsung TVs **reject unsigned `.wgt` packages at install time.**
Sign before sideloading (section 4.1).

### 3.2 Build without the Tizen toolchain (dev preview)

If you only want to inspect the staged contents without producing a `.wgt`:

```powershell
cd G:\Github\HermesTV-Tizen-AI\apps\hermes-tv-tizen
npm run build:web
node ..\..\tools\tizen-prep.js
# Inspect apps/hermes-tv-tizen/dist/ — same files the .wgt will contain
```

No Tizen toolchain required.

---

## 4. Sideload

The five install methods below mirror the Samsung Tizen port guide
(`G:\Github\IPTV_Player_Zero\docs\SAMSUNG_TIZEN_PORT.md`). For
HermesTV / Mom's QN85 the **only recommended method is Method 1**
(Developer Mode + Tizen CLI install). The others are documented so the
operator knows what's available and what's been tried.

| # | Method | When to use | Pros | Cons |
|---|---|---|---|---|
| 1 | **Developer Mode + Tizen CLI** | Default for Sherri's TV | Reliable, scripted, idempotent | Requires Tizen Studio install |
| 2 | **Samsung Smart TV App Store** | Public distribution | Auto-updates, no per-TV cert | Requires Samsung Seller account + review |
| 3 | **USB sideload** | Old (pre-2017) models only | No PC required | Unreliable on Q7 QLED |
| 4 | **Hosted web app (no install)** | Quick smoke test, no .wgt | Zero packaging | No AVPlay, no remote key registration |
| 5 | **Network .wgt distribution** | Sharing with another Dev-Mode TV | Single file to copy | Recipient TV needs Dev Mode too |

### 4.1 One-time: create a signing profile

1. Open **Tizen Studio → Tools → Certificate Manager**.
2. Click **+ → Samsung → TV**.
3. Sign in with your Samsung Developer account.
4. Choose **Create a new certificate profile** named `HermesTV-dev`.
5. Generate a new author certificate (or import an existing `.p12`).
6. For the distributor certificate, add **Mom's TV DUID** (section 2.2).
7. Save. The signing material lands in `~/.tizen/` (or
   `%USERPROFILE%\.tizen\` on Windows). This directory is gitignored —
   **never commit it**.

Re-package with the signing profile:

```powershell
cd G:\Github\HermesTV-Tizen-AI\apps\hermes-tv-tizen
tizen package -t wgt -s HermesTV-dev -o dist-tizen -- .buildResult
```

### 4.2 Method 1 — Developer Mode + Tizen CLI (recommended)

**Status:** This is the path Sherri's TV uses. Tested end-to-end.

```powershell
sdb connect 192.168.1.55:26101
sdb devices
# Note the device serial, e.g. 192.168.1.55:26101

tizen install -n HermesTV-0.1.0.wgt -t 192.168.1.55:26101 -- dist-tizen
```

The TV briefly shows an "Installing…" banner. When it returns to the
launcher, the **HermesTV** icon appears in the Apps row.

#### 4.2a Alternative within Method 1: install via SDB only

When `tizen install` misbehaves (locked Tizen Studio session, IDE
holding the project, etc.), bypass it and push directly via SDB:

```powershell
sdb connect 192.168.1.55:26101
sdb -s 192.168.1.55:26101 install dist-tizen\HermesTV-0.1.0.wgt
```

This installs the `.wgt` directly; output looks like:

```
package: HermesTV01.HermesTV
result: ok
```

#### 4.2b Launch

```powershell
sdb -s 192.168.1.55:26101 shell 0 execute HermesTV01.HermesTV
```

Or just navigate to the icon on the TV launcher and press OK.

#### 4.2c Stream logs

```powershell
sdb -s 192.168.1.55:26101 shell 0 dlog -s HermesTV
```

Press Ctrl+C to detach. The TV keeps running.

### 4.3 Method 2 — Samsung Smart TV App Store (NOT used)

**Status:** Documented for completeness only. HermesTV is a
per-household app — no Samsung Seller account exists yet, and the
license model in CLAUDE.md (operator-supplied IPTV credentials) does
not fit Samsung's store review criteria.

If we ever pursue store distribution:

1. Register at <https://developer.samsung.com/smarttv>.
2. Create a Samsung partner account.
3. In **Tizen Studio → Tools → Certificate Manager**, create a
   **Samsung Certificate → TV** profile (NOT the local DUID dev
   profile from section 4.1).
4. Re-package with `tizen package -t wgt -s SamsungCertificate`.
5. Submit at <https://seller.samsungapps.com>.

Skipped here because: no Samsung Seller account, and the app calls
operator-controlled IPTV provider credentials which Samsung review
would reject.

### 4.4 Method 3 — USB sideload (NOT supported on Q7)

**Status:** The Samsung port guide explicitly notes this is unreliable
on 2017+ QLED models. Sherri's QN85 is a Q7 — do not attempt.

For historical record: on older Tizen 3.0 sets the operator could put
a `.wgt` on a FAT32 USB drive and have the TV scan for it under
**Settings → Support → Software Update → Update Now**. Q7 silently
ignores the drive.

If you must try anyway:

1. Format a USB stick as FAT32.
2. Copy `dist-tizen\HermesTV-<version>.wgt` to the drive root.
3. Insert into the TV.
4. Most Q7 firmware revisions: nothing happens. Fall back to Method 1.

### 4.5 Method 4 — Hosted web app (smoke test only)

**Status:** Useful as a 60-second smoke test before the real .wgt is
installed. Has no AVPlay, no remote key registration, and no
visibilitychange decoder release — so it is NOT a substitute for the
sideloaded app.

Hosting the React SPA without packaging:

```powershell
# After `npm run build:web` above:
cd G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv
npx serve dist -p 3000
```

On the TV:

1. Open the **Internet (Web Browser)** app on the Samsung TV.
2. Navigate to `http://<your-workstation-LAN-IP>:3000`.
3. The SPA boots. Profile picker → catalog grid works.

What does NOT work in this mode:

- Transport / channel / color / numpad remote keys (no
  `tizen.tvinputdevice.registerKey` outside a packaged app).
- AVPlay backend (browser falls back to plain `<video>` which may not
  understand the same HLS variants).
- Decoder release on background — the browser app retains the page
  resources differently than a packaged app does.

Use this when you've changed only the React code and want to confirm
it renders on Mom's TV without going through the package+sign cycle.

### 4.6 Method 5 — Network .wgt distribution

**Status:** Useful when sharing a build with another developer who
already has Developer Mode enabled on their own TV (e.g. Dave's QN95).

```powershell
# 1) Build + sign on the source workstation (section 3 above).
# 2) Copy the signed .wgt to the recipient — any transport works:
#       SMB share, scp, USB stick, OneDrive, etc.
# 3) On the recipient's workstation:
sdb connect <recipient-TV-IP>:26101
sdb -s <recipient-TV-IP>:26101 install path\to\HermesTV-<ver>.wgt
```

Caveat: the distributor certificate that signed the `.wgt` must list
the **recipient's TV DUID** — otherwise the TV rejects with
"Certificate Error / 11" (section 5.1). Either re-issue the
distributor certificate with both DUIDs before building, or have the
recipient re-sign locally.

---

## 5. Troubleshooting

### 5.1 Install fails with "Certificate Error / 11"

The `.wgt` is unsigned, or it was signed against a profile whose
distributor certificate doesn't list this TV's DUID.

Fix:
- Confirm the package was built with `-s HermesTV-dev` (section 4.1).
- Confirm the TV's DUID is registered in the distributor certificate.
  Re-run section 2.2 to get the DUID, then re-issue the distributor
  certificate in Certificate Manager.

### 5.2 Install fails with "Device not authorized"

The first SDB connection to the TV pops a prompt **on the TV screen**
asking whether to allow the workstation. If you missed it, run:

```powershell
sdb disconnect 192.168.1.55:26101
sdb connect 192.168.1.55:26101
```

…and accept the prompt on the TV with the remote.

### 5.3 "Connection refused" on `sdb connect`

Developer Mode is off, or the workstation IP in Developer Mode does not
match your current IP (DHCP changed it). Redo section 2 with the current
LAN IP.

### 5.4 CSP warnings in the on-TV inspector

The web app's CSP currently allows `http://localhost:3001` (dev API) and
`https://tv.daveai.tech` plus its alias `https://hermestv.daveai.tech`
(prod). Tizen Chrome 76 sometimes logs
warnings about CSP wildcards even when the policy is valid; verify with:

1. Open Chrome on the workstation.
2. Navigate to `http://192.168.1.55:7011`.
3. Click the HermesTV entry to attach DevTools.
4. The CSP errors (if any) appear in the Console tab.

If a CSP error blocks a real request: update
[`apps/hermes-tv-tizen/config.xml.example`](../apps/hermes-tv-tizen/config.xml.example)'s
`<access origin>` entries and rebuild.

### 5.5 The Vite dist has no `<script type="module">`

`tizen-prep.js` fails fast in this case. The cause is almost always a
custom `vite.config.js` build target that switched to a plain
`<script>` tag. Restore the default ES module output — Tizen 6.5 / Chrome
76 supports it, and the rest of the app assumes it.

### 5.6 Boot greeting (Azure TTS) is silent on Tizen

**Symptom:** After install, the HermesTV boot greeting plays through
the speakers in dev Chrome but stays silent on Mom's TV.

**Cause:** Tizen 6.5 ships Chromium 76 which enforces the standard
Chrome autoplay-with-sound policy. The boot greeting fires from the
catalog-loaded `useEffect` in `apps/hermes-web-tv/src/App.jsx`, which
happens **before** the user has pressed any remote button — so
`audio.play()` is rejected with `NotAllowedError`. The current code
catches the rejection silently, which is why there's no error in dlog.

**Workaround:** Wait for the first user gesture before playing the
greeting. `apps/hermes-tv-tizen/src/platform/tizenLifecycle.js` exports
`onUserGesture(cb)` which fires the callback after the first keydown /
click / touchstart. When App.jsx is wired to use it, the greeting will
play the moment Mom presses any remote button after boot — typically
the OK key on the profile picker.

```javascript
// In App.jsx (when the parallel agent's polish work lands):
var lifecycle = require('hermes-tv-tizen/platform/tizenLifecycle');
lifecycle.onUserGesture(function() {
  voiceClient.speak(greeting, profileId, persistedVoiceId);
});
```

Until then, the greeting works in browsers that allow same-origin
autoplay (i.e. dev preview only — Method 4 hosted mode), and is silent
on the packaged Tizen build. This is acceptable: per CLAUDE.md, the
greeting is opt-in (`profile.audio_feedback`) and best-effort.

### 5.7 CSP 'unsafe-eval' rejection at app start

**Symptom:** The HermesTV icon is on the launcher, but tapping it
flashes the splash and returns to the launcher. dlog shows
"Refused to evaluate string as JavaScript".

**Cause:** `config.xml`'s `<tizen:content-security-policy>` block
contains `'unsafe-eval'`. Tizen rejects it.

**Fix:** `tools/tizen-prep.js` fails fast if the staged config.xml
contains the literal `'unsafe-eval'`. If you ever hand-edit
`config.xml.example` and re-add it, the build will refuse to package
until you remove it. The Vite output never needs `eval` — keep it out.

---

## 6. Acceptance — when is the install "done"?

All of the following must hold:

- [ ] `HermesTV-<version>.wgt` size > 100 KB (anything tiny means the Vite
      bundle wasn't included).
- [ ] `tools/wgt-inspect.sh HermesTV-<version>.wgt` exits 0
      (BUILD-GATE-11 + BUILD-GATE-12 from doc 09).
- [ ] HermesTV icon appears on Mom's QN85 launcher after install.
- [ ] App launches and the profile picker shows.
- [ ] Switching between all 7 dynamic layouts works (per doc 25).
- [ ] Network panel in DevTools shows requests going to
      `https://tv.daveai.tech/api/…` (or to the dev override URL if
      one is set in `localStorage.hermestv.api_base`).
- [ ] No CSP errors in console.
- [ ] No credential strings show up in
      `sdb shell 0 dlog -s HermesTV` (sanity check).

---

## 7. Where the moving parts live

| File | Purpose |
|---|---|
| `apps/hermes-tv-tizen/package.json` | Build orchestrator scripts |
| `apps/hermes-tv-tizen/config.xml.example` | Tizen widget manifest template (features, privileges, access origins, CSP) |
| `apps/hermes-tv-tizen/.gitignore` | Hides build artefacts and certs |
| `apps/hermes-tv-tizen/src/api/apiBase.js` | Default API base — `https://tv.daveai.tech` (canonical); `https://hermestv.daveai.tech` is an additive nginx alias for backwards compatibility |
| `apps/hermes-tv-tizen/src/platform/tizenLifecycle.js` | `visibilitychange` decoder release + first-user-gesture queue (for boot TTS) |
| `apps/hermes-tv-tizen/src/platform/codecCapabilities.js` | `MediaSource.isTypeSupported` codec probe — feeds catalog filter |
| `apps/hermes-web-tv/src/utils/tizenKeyMap.js` | Full remote keycode table + `tizen.tvinputdevice.registerKey` registration |
| `tools/tizen-prep.js` | Stages web `dist/` into Tizen `dist/`, validates CSP, copies platform helpers |
| `tools/tizen-package.js` | Invokes Tizen CLI, produces `.wgt` |
| `tools/wgt-inspect.sh` | Post-build secret + manifest gate |

---

## 8. What this runbook does **not** do

- Does **not** install Tizen Studio for you.
- Does **not** sideload from the build script (the build only produces a
  `.wgt`; install is a separate, deliberate step).
- Does **not** touch the VPS, `.env`, or any deployed system.
- Does **not** submit to the Samsung Smart TV App Store (per-household
  sideload only — see doc 09 §11).

For Mom's user-facing instructions, see
[35_TIZEN_DEVELOPER_MODE_SHERRI.md](35_TIZEN_DEVELOPER_MODE_SHERRI.md).

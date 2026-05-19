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

### 4.2 Install via Tizen CLI

```powershell
sdb connect 192.168.1.55:26101
sdb devices
# Note the device serial, e.g. 192.168.1.55:26101

tizen install -n HermesTV-0.1.0.wgt -t 192.168.1.55:26101 -- dist-tizen
```

The TV briefly shows an "Installing…" banner. When it returns to the
launcher, the **HermesTV** icon appears in the Apps row.

### 4.3 Alternative: install via SDB only

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

### 4.4 Launch

```powershell
sdb -s 192.168.1.55:26101 shell 0 execute HermesTV01.HermesTV
```

Or just navigate to the icon on the TV launcher and press OK.

### 4.5 Stream logs

```powershell
sdb -s 192.168.1.55:26101 shell 0 dlog -s HermesTV
```

Press Ctrl+C to detach. The TV keeps running.

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
| `apps/hermes-tv-tizen/config.xml.example` | Tizen widget manifest template |
| `apps/hermes-tv-tizen/.gitignore` | Hides build artefacts and certs |
| `apps/hermes-tv-tizen/src/api/apiBase.js` | Default API base — `https://tv.daveai.tech` (canonical); `https://hermestv.daveai.tech` is an additive nginx alias for backwards compatibility |
| `tools/tizen-prep.js` | Stages web `dist/` into Tizen `dist/` |
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

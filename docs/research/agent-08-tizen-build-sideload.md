# Agent 08 — Tizen Build, Packaging & Sideload Pipeline

**Research Date:** May 2026
**Scope:** Samsung Smart TV web app (.wgt) build, sign, and sideload pipeline
**Applies to:** QN85Q7FAAFXZA (Sherri) · UN55CU8000BXZA (Dave) — both Tizen 6.5 per project lock
**Cross-references:** `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` · `apps/tizen-hermes-tv/config.xml`
**Status:** RESEARCH — findings feed into `09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`

---

## 1. Tizen Studio CLI

### 1.1 Current Version and Download

As of May 2026, the current stable Tizen Studio release is **5.6**. The canonical download page is:

```
https://developer.tizen.org/development/tizen-studio/download
```

Tizen Studio ships as a unified installer that includes the CLI tools, the IDE (Eclipse-based), the emulator, and the Package Manager. The CLI tools are the relevant subset for HermesTV — the IDE is not required for the build pipeline.

**Windows 11 support:** Confirmed. Tizen Studio 5.0+ explicitly supports Windows 10 and Windows 11 (64-bit). The installer is an `.exe` that runs without WSL. All `tizen` and `sdb` CLI commands run natively in PowerShell or CMD.

**Supported OS matrix (Tizen Studio 5.6):**

| OS | Version | Notes |
|---|---|---|
| Windows | 10 / 11 (64-bit) | Native `.exe` installer |
| macOS | 13 Ventura, 14 Sonoma | `.dmg` installer |
| Ubuntu | 20.04, 22.04 LTS | `.bin` installer |

### 1.2 PATH Setup

After installation, add both tool directories to `PATH`. On Windows:

```powershell
# Add to system PATH (permanent — do once via System Properties > Environment Variables)
# Or set for the session:
$env:PATH += ";C:\tizen-studio\tools\ide\bin;C:\tizen-studio\tools"
```

On Linux/macOS:

```bash
export PATH=$PATH:/path/to/tizen-studio/tools/ide/bin:/path/to/tizen-studio/tools
```

Verify the installation:

```bash
tizen version
# Output example: Tizen CLI 2.5.31 (compatible with Tizen Studio 5.6)
sdb version
# Output example: Smart Development Bridge version 4.2.33
```

<!-- NEEDS VERIFICATION: Confirm exact tizen CLI version string reported by `tizen version` on a fresh Tizen Studio 5.6 Windows 11 install — the CLI version number does not track the Studio version number 1:1. -->

---

## 2. `tizen` CLI — Exact Command Reference

All `tizen` commands follow the pattern:

```
tizen <subcommand> [flags] -- <project-path>
```

The `--` separator is required and separates the tizen flags from the project directory path. This is a common source of errors when transcribing commands.

### 2.1 `build-web`

Builds the Tizen web project. Copies all project files into the build output directory and runs any configured pre-build steps.

```bash
tizen build-web -out <output-dir> -- <project-dir>
```

| Flag | Required | Description |
|---|---|---|
| `-out <dir>` | Yes | Directory where build output is written. Created if it does not exist. Conventionally `.buildResult`. |
| `-- <project-dir>` | Yes | Path to the project root (contains `config.xml`). Use `.` when inside the project directory. |

Example (from `apps/tizen-hermes-tv/`):

```bash
tizen build-web -out .buildResult -- .
```

The output directory contains a copy of all project files plus a `.manifest.tmp` required by the subsequent `package` step.

<!-- NEEDS VERIFICATION: On Tizen Studio 5.6 + Tizen 6.5 projects, confirm whether `build-web` preprocesses `config.xml` (substitutes variables) or copies it verbatim. The HermesTV `config.xml` uses no Tizen Studio template variables, so this should not matter, but verify. -->

### 2.2 `package`

Signs and packages the built web project into a `.wgt` archive.

```bash
tizen package -t wgt -s <cert-profile> [-o <output-dir>] -- <build-dir>
```

| Flag | Required | Description |
|---|---|---|
| `-t wgt` | Yes | Output type. `wgt` is the only valid type for TV web apps. |
| `-s <profile>` | Yes | Name of the signing certificate profile as defined in Certificate Manager (e.g., `HermesTV-dev`). Case-sensitive. |
| `-o <dir>` | No | Override output directory. Defaults to the same directory as `<build-dir>`. |
| `-- <build-dir>` | Yes | Path to the directory produced by `build-web` (contains `.manifest.tmp`). |

Example:

```bash
tizen package -t wgt -s HermesTV-dev -- .buildResult
# Output: .buildResult/HermesTV.wgt (signed)
```

If the certificate profile name contains spaces, quote it: `-s "HermesTV dev"`.

**Signing failure modes:**

| Error | Cause |
|---|---|
| `No certificate profile found` | Profile name does not match what is in Certificate Manager. Run `tizen certificate list` to see available profiles. |
| `The certificate is expired` | Samsung distributor certificates expire annually. See Section 8.1. |
| `Author certificate is invalid` | The `.p12` author cert is missing or the password is wrong. |
| `DUID not registered` | TV's DUID was not added to the distributor cert during Certificate Manager setup. See Section 3. |

### 2.3 `install`

Installs a `.wgt` file on a connected device via `sdb`.

```bash
tizen install -n <wgt-filename> [-t <sdb-serial>] -- <wgt-dir>
```

| Flag | Required | Description |
|---|---|---|
| `-n <filename>` | Yes | Filename of the `.wgt` to install (just the filename, not a path). |
| `-t <serial>` | No | Target device serial from `sdb devices`. Required when multiple devices are connected. |
| `-- <wgt-dir>` | Yes | Directory that contains the `.wgt` file. |

Example:

```bash
tizen install -n HermesTV.wgt -t 192.168.1.50:26101 -- .buildResult
```

The install replaces any previously installed version of the same package ID. If the package ID in `config.xml` does not match the signing certificate's registered app ID, install is rejected.

### 2.4 `run`

Launches an installed app on the connected device.

```bash
tizen run -p <package-id> [-t <sdb-serial>]
```

| Flag | Required | Description |
|---|---|---|
| `-p <package-id>` | Yes | The `package` attribute from `config.xml` (e.g., `HermesTVap`). Not the full app ID. |
| `-t <serial>` | No | Target device serial. Required when multiple devices are connected. |

Example:

```bash
tizen run -p HermesTVap -t 192.168.1.50:26101
```

<!-- NEEDS VERIFICATION: On Tizen 6.5, confirm whether `tizen run -p` takes the package attribute alone (`HermesTVap`) or the full app ID (`HermesTVap.app`). Samsung documentation is inconsistent between versions on this point. The `sdb shell 0 execute` path (Section 4) is more reliable and avoids this ambiguity. -->

### 2.5 `uninstall`

Removes an installed app from the connected device.

```bash
tizen uninstall -p <package-id> [-t <sdb-serial>]
```

| Flag | Required | Description |
|---|---|---|
| `-p <package-id>` | Yes | The `package` attribute from `config.xml`. |
| `-t <serial>` | No | Target device serial. |

Example:

```bash
tizen uninstall -p HermesTVap -t 192.168.1.50:26101
```

### 2.6 `certificate` (listing profiles)

```bash
tizen certificate list
# Lists all profiles in Certificate Manager with their author/distributor cert paths
```

---

## 3. Samsung Certificate Manager

### 3.1 Certificate Extension Requirement

The Certificate Extension is a Package Manager plugin. **Version 2.0.73 or later is required** for 2021+ TV models (which includes both project TVs). Versions before 2.0.73 cannot generate distributor certificates compatible with Tizen 6.0+ firmware.

Install it via:

```
Tizen Studio Package Manager > Extension SDK tab > Extras > Certificate Extension
```

Verify the installed version in Package Manager. If the version shown is below 2.0.73, click Update before proceeding.

### 3.2 Creating a Certificate Profile

Open: **Tools > Certificate Manager** in Tizen Studio.

Step-by-step:

1. Click **+** (New Profile).
2. Select **Samsung** as the certificate type. (The "Tizen" option creates a generic Tizen cert — it cannot be used for Samsung TV sideload.)
3. Select **TV** as the device type.
4. Sign in with a Samsung developer account. If you do not have one, create a free account at `https://developer.samsung.com`.
5. Choose **Create a new certificate profile** and name it (e.g., `HermesTV-dev`).
6. **Author certificate:** Generate a new key pair. Supply a key alias and password. The private key is stored as a `.p12` file locally. Back this file up — it cannot be recovered from Samsung servers.
7. **Distributor certificate:** This is what binds the package to specific TVs.
   - Select **Create a new distributor certificate**.
   - Privilege level: select **Partner** (required for `productinfo` and `avplay` privileges used in HermesTV). The default "Public" level will fail at runtime when the app calls those APIs.
   - **Add DUID(s):** Enter one DUID per line for all TVs that will sideload this package.
     - Sherri's TV DUID: obtain via `webapis.productinfo.getDuid()` (see Section 3.3).
     - Dave's TV DUID: same method.
8. Click **Finish**. The certificate profile is now available as `-s HermesTV-dev` in the `tizen package` command.

The certificate files land in `~/.tizen-studio-data/keystore/` (Windows: `%USERPROFILE%\.tizen-studio-data\keystore\`). The HermesTV project `.tizen/` directory (gitignored) mirrors these files for portability — never commit them.

### 3.3 Obtaining a TV's DUID

Method 1 — Via the on-device diagnostic page (preferred):

Deploy the `docs/02` diagnostic HTML page to the TV (or load it via remote debug). Call:

```js
var duid = webapis.productinfo.getDuid();
console.log("DUID:", duid);
```

Read the value from the remote debug console at `http://<TV_IP>:7011`.

Method 2 — Via Samsung Settings:

On the TV: **Settings > Support > About Smart TV > Smart TV Certificate**.

The DUID is displayed in the certificate screen. It is typically a 36-character hex string.

### 3.4 DUID Registration Limits

Samsung limits the number of DUIDs that can be registered per distributor certificate profile. The published limit is **100 DUIDs per distributor certificate**. For a private household app with two TVs this is not a concern, but it is the boundary to know.

Each time a new TV DUID is added to a distributor certificate, a new `.wgt` must be signed and reinstalled — the DUID binding is embedded in the package signature, not evaluated at runtime.

<!-- NEEDS VERIFICATION: Confirm whether adding a DUID to an existing Samsung distributor certificate requires invalidating and re-generating the cert, or whether it can be added incrementally within Certificate Manager without changing the author certificate. Samsung documentation describes the process as creating a new distributor cert, which implies a full re-sign. -->

---

## 4. Smart Development Bridge (`sdb`)

`sdb` is the Samsung equivalent of Android's `adb`. It communicates with Tizen devices over TCP on port `26101`.

### 4.1 Connecting to a TV

```bash
sdb connect <TV_LAN_IP>:26101
```

Example:

```bash
sdb connect 192.168.1.50:26101
# Output: connected to 192.168.1.50:26101
```

If the TV shows `unauthorized` or `offline`, developer mode is not active on the TV, the workstation IP set in developer mode does not match the current workstation LAN IP, or the firewall is blocking port 26101.

### 4.2 Verifying the Connection

```bash
sdb devices
```

Expected output when connected correctly:

```
List of devices attached
192.168.1.50:26101      device          UE55AU8000
```

The status must be `device`. Any other status (`offline`, `unauthorized`, `recovery`) means the connection is not usable for install or debug.

### 4.3 Key `sdb` Commands

| Command | Description |
|---|---|
| `sdb connect <IP>:26101` | Connect to a TV over LAN |
| `sdb disconnect <IP>:26101` | Disconnect from a TV |
| `sdb devices` | List all connected devices and their status |
| `sdb -s <serial> shell 0 applist` | List all installed apps on the target TV |
| `sdb -s <serial> shell 0 execute <app-id>` | Launch an app by full app ID |
| `sdb -s <serial> shell 0 kill <app-id>` | Kill a running app |
| `sdb -s <serial> shell 0 dlog -s <tag>` | Stream logcat-style logs filtered by tag |
| `sdb -s <serial> push <local-path> <device-path>` | Copy a file to the TV |
| `sdb -s <serial> pull <device-path> <local-path>` | Copy a file from the TV |
| `sdb start-server` | Start the sdb server process (auto-started on first use) |
| `sdb kill-server` | Kill and restart sdb server (use when `sdb devices` hangs) |

**Full launch + log workflow for HermesTV:**

```bash
# Launch
sdb -s 192.168.1.50:26101 shell 0 execute HermesTVap.app

# Stream logs (tag = app package name or custom dlog tag)
sdb -s 192.168.1.50:26101 shell 0 dlog -s HermesTV

# Verify installed
sdb -s 192.168.1.50:26101 shell 0 applist | grep HermesTVap
# Expected: HermesTVap.app
```

<!-- NEEDS VERIFICATION: The `shell 0 dlog -s <tag>` syntax is the documented Tizen 6.x form. On some firmware revisions the dlog tag filter is case-sensitive. Verify on both TVs whether `HermesTV` matches the tag set in the app's `console.log` output or if it requires a custom `dlog` tag registered via the Tizen logger API. -->

### 4.4 sdb Port and Firewall

The TV listens on port `26101/TCP`. The workstation must be able to reach this port outbound. If Windows Defender Firewall blocks outbound on that port, add an outbound rule or temporarily disable the firewall for the LAN interface.

---

## 5. Developer Mode Activation

Developer mode must be activated once per TV. It survives reboots but may be reset by firmware updates. After any Samsung firmware update, verify the "Developer Mode" banner is still present before attempting a sideload.

### 5.1 Step-by-Step — Both TVs (QN85Q7FAAFXZA and UN55CU8000BXZA)

The activation path is identical for both Tizen 6.5 TVs:

1. Press **Home** on the TV remote.
2. Navigate to **Settings** (gear icon in the menu bar).
3. Go to **Support**.
4. Select **About Smart TV**.
5. In the dialog that appears (which shows the TV model number), use the on-screen keyboard or the remote's number pad to type **`12345`**.
   - On some remote models, this is typed via the remote's physical number buttons (0–9).
   - On remotes without physical number buttons (e.g., Samsung One Remote), navigate the on-screen keyboard using the D-pad to spell `1`, `2`, `3`, `4`, `5`.
6. The **Developer Mode** popup appears. It contains:
   - A toggle switch for Developer Mode (set to **ON**).
   - An **IP address** field — enter the LAN IP of the development workstation that will run `tizen install` and `sdb`. This must be the actual LAN IP (e.g., `192.168.1.x`), not `0.0.0.0` or `127.0.0.1`.
7. Save and **reboot the TV** (the popup prompts for this).
8. After reboot, a **"Developer Mode"** banner appears in the top-left corner of the TV screen. This banner confirms activation.

**Important:** The workstation IP entered in step 6 is used by the TV to validate incoming `sdb` connections. If the workstation's LAN IP changes (DHCP reassignment), repeat this process to update the IP, then reconnect via `sdb connect`.

### 5.2 Verifying Developer Mode is Active

After reboot, the "Developer Mode" banner must be visible. Additionally:

```bash
sdb connect <TV_LAN_IP>:26101
sdb devices
# Must show "device" status, not "unauthorized"
```

If `sdb devices` shows `unauthorized`, the workstation IP entered in Developer Mode does not match the current `sdb` source IP.

---

## 6. `.wgt` File Structure

A `.wgt` file is a ZIP archive with a specific required structure. The Tizen platform runtime unpacks it and validates the contents before installation.

### 6.1 Required Files

The following files must be present at the root of the `.wgt` archive (not in subdirectories):

| File | Required | Notes |
|---|---|---|
| `config.xml` | **Yes** | The W3C Widget manifest. Tizen extends it with `tizen:` namespace elements. |
| `index.html` | **Yes** | Entry point. Must match the `src` attribute of `<content>` in `config.xml`. |
| `icon.png` | **Yes (practical)** | App icon. Minimum 117×117 px. The TV launcher shows this. If absent, install may succeed but launcher icon is blank. |
| `bundle.js` | Yes (for HermesTV) | Webpack IIFE bundle. Filename must match `<script>` reference in `index.html`. |
| `bundle.css` | Yes (for HermesTV) | Extracted CSS bundle. Filename must match `<link>` in `index.html`. |

Other files referenced in `index.html` (fonts, additional assets) must also be included. No file should be in the archive that is not referenced — including stray build artifacts — as this increases package size without benefit.

**What must NOT be in the archive:**

- `.env` files, secrets, API keys
- `node_modules/`
- Source maps in production builds (they expose source to anyone with the `.wgt`)
- `webpack.config.js`, `package.json`, or other build tooling files

### 6.2 `config.xml` Requirements

The canonical `config.xml` for HermesTV is at `apps/tizen-hermes-tv/config.xml`. The following fields are required and have specific format constraints enforced by the Samsung signing and install process:

#### `<tizen:application>` attributes

```xml
<tizen:application id="HermesTVap.app"
                   package="HermesTVap"
                   required_version="6.5"/>
```

| Attribute | Format | Constraint |
|---|---|---|
| `package` | Alphanumeric, exactly 10 characters | Samsung requirement. Shorter or longer values, or values containing hyphens or underscores, are rejected at packaging time. |
| `id` | `<package>.<AppName>` | Must start with the exact `package` value. No spaces. |
| `required_version` | Semantic version string | Must be `6.5` for both project TVs. Setting a lower value (e.g., `3.0`) does not increase compatibility — it misleads the runtime about the minimum supported version. |

#### `<access>` elements

```xml
<access origin="http://hermestv.local" subdomains="false"/>
<access origin="https://hermestv.local" subdomains="false"/>
<access origin="ws://hermestv.local" subdomains="false"/>
<access origin="wss://hermestv.local" subdomains="false"/>
```

- The `origin` attribute value is a URI. Tizen enforces this whitelist — any network request to an origin not listed here is blocked at the network layer, not just by CSP.
- **`origin="*"` is forbidden** in HermesTV (see `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` Section 4.3). It is technically accepted by the Tizen packaging tool but violates the project security contract.
- `subdomains="true"` must never be used with LAN mDNS names — it would allow any `.hermestv.local` subdomain, which is undefined on a typical home LAN.
- Add the raw LAN IP (`http://192.168.1.x`) as an additional `<access>` entry at deploy time if `hermestv.local` mDNS resolution is unreliable on the LAN. Do not commit IP addresses to `config.xml` in the repo.

#### `<tizen:setting>` attributes

```xml
<tizen:setting background-support="disable"
               encryption="disable"
               install-location="auto"
               hwkey-event="enable"/>
```

- `hwkey-event="enable"` is required — without it, hardware key events (D-pad, color buttons, Back) are not dispatched to the web app.
- `encryption="disable"` — enabling encryption requires a specific Samsung approval tier and is not used for sideloaded apps.

#### `<tizen:privilege>` elements

The `productinfo` and `avplay` privileges require the **Partner** privilege level in the distributor certificate (Section 3.2). If the certificate is signed at the Public level, the app installs but calling `webapis.productinfo.getDuid()` or `webapis.avplay.*` throws a `SecurityError` at runtime.

---

## 7. TizenBrew

### 7.1 What TizenBrew Is

TizenBrew is an open-source third-party framework maintained at `https://github.com/reisxd/TizenBrew`. It provides:

1. A custom app launcher (TizenBrew itself) that runs on the TV as a sideloaded `.wgt`.
2. A desktop installer tool that automates the one-time sideload of the TizenBrew launcher app.
3. A mechanism for the TizenBrew launcher to fetch and install additional app `.wgt` files from URLs — without requiring developer mode to be active or `tizen install` to be run again for each update.

### 7.2 How TizenBrew Differs from Official Sideload

| | Official Tizen CLI sideload | TizenBrew |
|---|---|---|
| Developer mode required | Yes — must be active on TV | **No** — once TizenBrew is installed |
| `sdb` required | Yes | No (updates are fetched by TizenBrew from a URL) |
| Workstation running during install | Yes | No (TV fetches the `.wgt` itself) |
| Samsung certificate required | Yes (for the initial TizenBrew install) | No (for subsequent app updates) |
| App signed with cert | Yes (`.wgt` signed) | Yes (the `.wgt` served to TizenBrew must still be a valid signed package) |
| Tizen version support | All versions | Tizen 5.0+ (both project TVs are Tizen 6.5 — supported) |
| Update flow | Manual: `tizen install` per update | Pull: TizenBrew fetches from a URL on demand |

**Critical clarification:** TizenBrew does NOT bypass the requirement for a signed `.wgt`. It bypasses the requirement for `sdb` + `tizen install` to be run from a connected workstation during each update. The initial TizenBrew installation itself requires a one-time sideload via the official CLI + developer mode path.

### 7.3 Whether TizenBrew Bypasses Developer Mode

- **Initial TizenBrew installation:** Requires developer mode + `tizen install`. There is no way around this for the first install.
- **Subsequent HermesTV updates via TizenBrew:** Developer mode does NOT need to be active. The TV's TizenBrew launcher fetches the new `.wgt` from the configured URL and installs it locally.

This makes TizenBrew useful as a resilience path: if a Samsung firmware update resets developer mode on one of the TVs, HermesTV updates can still be delivered via TizenBrew without needing to re-enter developer mode.

### 7.4 Security Considerations

- TizenBrew must be configured to fetch HermesTV `.wgt` files from a **private or unlisted URL** — not a public GitHub Release asset that could be discovered and modified.
- The `.wgt` served via TizenBrew must be signed with the same Samsung distributor certificate as the original sideload. TizenBrew does not bypass Samsung's signature verification at install time.
- Never point TizenBrew at a URL that contains LAN IP configuration, VPS credentials, or build-time secrets embedded in the bundle. The URL is stored in TizenBrew's configuration on the TV and could be read by anyone with `sdb` shell access.
- TizenBrew is **not the primary sideload path** for HermesTV. The official CLI path (Section 2, Section 5.3 of `docs/09`) is primary for both TVs. TizenBrew is documented as a fallback for firmware-reset scenarios.

---

## 8. Known Issues and Gotchas

### 8.1 Samsung Distributor Certificate Annual Expiry

Samsung distributor certificates expire **12 months** after issuance. After expiry:

- Existing installed apps continue to run — expiry does not kill running apps.
- New `.wgt` builds signed with the expired cert are **rejected at install time** with a signature validation error.
- The fix is to generate a new distributor certificate in Certificate Manager (the DUID list carries over if you use the same Samsung developer account), re-sign the `.wgt`, and reinstall.

**Mitigation:** Set a calendar reminder 11 months after the cert creation date to renew before it expires, so there is no gap in sideload capability.

### 8.2 DUID Registration Limits

The Samsung platform limits distributor certificates to **100 DUIDs**. For HermesTV this is not a binding constraint (two TVs). However, every time a new DUID is added or a cert is renewed, all registered TVs must receive a newly signed `.wgt`. There is no way to update the DUID binding in an already-installed package without reinstalling.

### 8.3 Common Build Errors

| Error | Cause | Fix |
|---|---|---|
| `package attribute must be 10 characters` | `package` in `config.xml` is not exactly 10 alphanumeric chars | Fix `config.xml`. Current value `HermesTVap` is 10 chars — correct. |
| `required_version mismatch` | TV firmware is older than `required_version` in `config.xml` | Rare for HermesTV (both TVs are Tizen 6.5). If it occurs, confirm TV firmware version. |
| `Error: Cannot find the tizen config file` | `tizen build-web` run from wrong directory, or `config.xml` is missing | Confirm `config.xml` is at the project root before running `build-web`. |
| `Privilege not permitted` at runtime | Distributor cert signed at Public level, not Partner | Re-generate distributor cert at Partner privilege level. |
| `sdb: device not found` | TV not connected, or developer mode not active | Confirm developer mode banner, re-run `sdb connect`. |
| `Installation failed: -11` | Package is not signed, or DUID not registered | Ensure `.wgt` was produced by `tizen package -s <profile>`, not by `package-wgt.js` (which produces unsigned packages). |
| `Installation failed: -12` | Duplicate app ID already installed with a different signature | `tizen uninstall -p HermesTVap` first, then re-install. |
| `build-web` fails with webpack errors | webpack build must succeed before `tizen build-web` | Run `npm run build` first. `tizen build-web` does not invoke webpack. |

### 8.4 Developer Mode Resets After Firmware Update

Samsung firmware updates can reset the developer mode toggle. Symptoms: `sdb devices` shows `unauthorized` after a TV firmware update, even though the workstation IP is unchanged.

Fix: repeat the full Developer Mode activation sequence (Section 5.1) on the affected TV. The IP field must be re-entered even if it has not changed.

### 8.5 `tizen package` Output Directory

The `tizen package` command writes the `.wgt` to the same directory as the `<build-dir>` argument unless `-o` is specified. If `.buildResult/` already contains a previous `HermesTV.wgt`, it is overwritten silently. Always verify the `.wgt` file's last-modified timestamp matches the current build before installing.

### 8.6 Tizen 6.5 Chromium Engine Version

The project contract (`docs/09`) uses `chrome 76` as the Babel and Webpack target. The Tizen 6.5 web engine is based on Chromium ~94, not ~76.

The version matrix from `docs/research/agent-02-tizen-os-capabilities.md`:

| Tizen | Chromium approx. |
|---|---|
| 6.0 (2021) | ~76 |
| 6.5 (2022) | ~94 |
| 7.0 (2023) | ~108 |

If both project TVs are confirmed as Tizen 6.5 (2022), the correct Babel target is `chrome 94`, not `chrome 76`. Using `chrome 76` as the target is conservative (more polyfills, slightly larger bundle) but is not incorrect — it will produce code that runs on Chromium 94 safely.

<!-- NEEDS VERIFICATION: Confirm the exact Chromium version for Tizen 6.5 on both QN85Q7FAAFXZA and UN55CU8000BXZA by reading the user agent string via the doc-02 diagnostic screen. The version matrix above is the standard published mapping; the actual firmware on either TV may differ. Once confirmed, evaluate whether to update the Babel target from `chrome 76` to `chrome 94` to reduce polyfill size. -->

### 8.7 `.wgt` File Size Limit

Samsung does not publish an official maximum `.wgt` file size for TV sideloads. In practice, packages over ~50 MB may fail to install on older TV models or with low storage. For HermesTV (a web UI app), the expected `.wgt` size is well under 5 MB.

### 8.8 Web Workers Are Restricted in `.wgt` Sandboxes

Web Workers are not available inside Tizen `.wgt` web app sandboxes across all Tizen versions. This is a platform limitation, not a configuration issue. All JavaScript runs on the main thread. This constraint applies to both project TVs and is already reflected in the `docs/09` contract.

---

## 9. Complete Sideload Workflow Reference

This section consolidates the full pipeline for a single TV. Repeat for the second TV by swapping the IP and serial.

```powershell
# === ENVIRONMENT SETUP (run once per shell session) ===
$env:PATH += ";C:\tizen-studio\tools\ide\bin;C:\tizen-studio\tools"
$SHERRI_TV_IP = "192.168.1.50"    # Load from .env.local in practice
$DAVE_TV_IP   = "192.168.1.51"    # Load from .env.local in practice
$CERT_PROFILE = "HermesTV-dev"

# === STEP 1: Build webpack bundle ===
# (from apps/tizen-hermes-tv/)
npm run build
# Produces: dist/bundle.js, dist/bundle.css

# === STEP 2: Secret scan gate ===
gitleaks detect --source dist/ --no-git
# Must exit 0 before proceeding

# === STEP 3: Build Tizen web project ===
tizen build-web -out .buildResult -- .

# === STEP 4: Sign and package ===
tizen package -t wgt -s $CERT_PROFILE -- .buildResult
# Produces: .buildResult/HermesTV.wgt

# === STEP 5: Connect to TV ===
sdb connect "${SHERRI_TV_IP}:26101"
sdb devices
# Confirm: 192.168.1.50:26101  device  <model>

# === STEP 6: Install ===
tizen install -n HermesTV.wgt -t "${SHERRI_TV_IP}:26101" -- .buildResult

# === STEP 7: Verify installation ===
sdb -s "${SHERRI_TV_IP}:26101" shell 0 applist | findstr HermesTVap

# === STEP 8: Launch ===
sdb -s "${SHERRI_TV_IP}:26101" shell 0 execute HermesTVap.app

# === STEP 9: Stream logs ===
sdb -s "${SHERRI_TV_IP}:26101" shell 0 dlog -s HermesTV
```

---

## Conclusion

### What build pipeline decisions this report confirms

- **Tizen Studio 5.6** is the current version. Download from `https://developer.tizen.org/development/tizen-studio/download`. Windows 11 is fully supported with a native `.exe` installer.
- **`tizen build-web -out .buildResult -- .`** is the correct build command. The `--` separator is mandatory.
- **`tizen package -t wgt -s <profile> -- .buildResult`** produces a signed `.wgt`. Unsigned packages (from `package-wgt.js`) are rejected at install with error `-11`.
- **`sdb connect <IP>:26101`** is the correct connection command. The `sdb devices` output must show `device` status before any `tizen install` is attempted.
- **Developer mode activation** follows the path: Home > Settings > Support > About Smart TV > type `12345` > enter workstation IP > toggle ON > reboot. Identical for both project TVs.
- **Certificate Extension v2.0.73+** is required. Distributor certificates must be signed at **Partner** privilege level to allow `productinfo` and `avplay` API calls at runtime.
- **DUID registration is per-certificate, not per-TV.** Both Sherri's and Dave's DUIDs must be in the same distributor certificate profile for a single `.wgt` to install on both TVs.
- **`.wgt` required files:** `config.xml`, `index.html`, `icon.png`, `bundle.js`, `bundle.css`. The `config.xml` `package` attribute must be exactly 10 alphanumeric characters; `required_version` must be `6.5`; `<access origin>` must never be `*`.
- **TizenBrew** does not bypass Samsung's `.wgt` signature requirement. It bypasses the need for `sdb` + `tizen install` for updates after the initial install. The initial install still requires developer mode and the CLI. TizenBrew is supported on both Tizen 6.5 TVs.
- **Samsung distributor certificates expire annually.** Renew before the 12-month mark to avoid install failures. Running apps are not affected by cert expiry.

### What this report cannot confirm without on-device testing

- Exact Chromium version for Tizen 6.5 on both specific TV models — see `<!-- NEEDS VERIFICATION -->` in Section 8.6. The Babel target should be updated from `chrome 76` to `chrome 94` after on-device UA string confirmation.
- Whether `tizen run -p` takes `HermesTVap` or `HermesTVap.app` on Tizen 6.5 — use the `sdb shell 0 execute` path instead to avoid ambiguity.
- Exact `dlog` tag format and case sensitivity on both TV firmware versions — test `sdb shell 0 dlog -s HermesTV` on each TV after launch.
- Whether adding a DUID to an existing distributor cert requires a full cert regeneration or is additive — verify in Certificate Manager on the development workstation.

### Cross-reference compliance

This report is consistent with `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` v1.1.0. All command syntax, `config.xml` requirements, certificate setup steps, and developer mode activation steps match the contract. The `apps/tizen-hermes-tv/config.xml` file is compliant with all constraints documented here: `package="HermesTVap"` (10 chars), `required_version="6.5"`, no wildcard `<access>` origins.

---

## Reference URLs

- [Tizen Studio Download](https://developer.tizen.org/development/tizen-studio/download)
- [Tizen Studio CLI Reference](https://docs.tizen.org/application/tizen-studio/common-tools/command-line-interface/)
- [Samsung Certificate Manager Guide](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung TV Model Groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html)
- [Tizen Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [sdb Reference](https://docs.tizen.org/application/tizen-studio/common-tools/smart-development-bridge/)
- [TizenBrew GitHub](https://github.com/reisxd/TizenBrew)
- [Samsung Developer Mode Guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)

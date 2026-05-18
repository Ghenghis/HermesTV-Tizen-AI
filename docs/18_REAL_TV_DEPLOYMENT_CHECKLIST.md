# 18 — Real TV Deployment Checklist

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document covers sideloading the HermesTV Tizen app onto a real Samsung TV. Do not attempt this until mock mode is working correctly per `docs/16_TODAY_READY_SETUP_GUIDE.md` and `docs/proof/B2_USABLE_LOCAL_MOCK_RUNBOOK.md`.

---

## BLOCKER items

These must be resolved before deployment will succeed. Nothing in this checklist works without them.

| Blocker | Status | Notes |
|---|---|---|
| Tizen authkey | Required | Stored at `G:\private\authkey` — NEVER commit to Git |
| Real Samsung TV on the same network | Required | TV and PC must be on the same LAN or Wi-Fi |
| TV in developer mode | Required | See steps below |
| `sdb` tool installed | Required | Comes with Tizen Studio or standalone Tizen CLI |
| On-device AVPlay test | Required before claiming B3 | Confirms video pipeline works on real hardware |

---

## Prerequisites before sideloading

Verify these before touching the TV:

1. The HermesTV web app runs correctly in mock mode (`http://localhost:5173`).
2. The backend API is running (`npm run start:api` prints listening on port 3001).
3. `G:\private\hermestv.env` exists and contains credentials if using real providers.
4. `G:\private\authkey` exists (Tizen signing certificate).
5. Tizen CLI is on your PATH. Verify: open a terminal and run `tizen version` — should print a version number.
6. `sdb` is on your PATH. Verify: run `sdb version` — should print a version number.

---

## Step 1 — Enable developer mode on the TV

You must do this on the physical TV using the remote.

1. Press the **Home** button on the remote.
2. Navigate to **Settings** (gear icon).
3. Navigate to **Support** → **About This TV**.
4. Note the TV's IP address shown on this screen. Write it down.
5. Go back to **Settings** → **Smart Hub**.
6. Scroll down to find **Developer Mode** (it may be under a sub-menu titled "Advanced Features" on some firmware versions).
7. Set **Developer Mode** to **On**.
8. The TV will ask for the IP address of your development PC (the PC running `npm run start:api`). Enter your PC's local IP address (e.g., `192.168.1.50`).
9. The TV reboots. After reboot, a "Developer Mode" label appears in the top-right corner of the home screen.

If you cannot find Developer Mode in the menu, try this alternate method:
1. Go to **Settings** → **Support** → **About This TV**.
2. On the firmware version line, press the remote's number buttons in sequence: **1**, **2**, **3**, **4**, **5**.
3. A Developer Mode dialog appears. Enable it and enter your PC's IP.

---

## Step 2 — Connect to the TV with sdb

On your PC, open a terminal and run:

```bash
sdb connect <TV_IP_ADDRESS>
```

Replace `<TV_IP_ADDRESS>` with the IP address you noted from the TV's About screen. Example:

```bash
sdb connect 192.168.1.101
```

Expected output:

```
connected to 192.168.1.101:26101
```

Verify the connection:

```bash
sdb devices
```

You should see the TV listed as `device`. If it shows `offline`, the TV may not be fully in developer mode — recheck Step 1.

---

## Step 3 — Build the .wgt package

> **Path note (2026-05-18 consolidation):** This checklist's build commands
> below target the legacy native scaffold at `apps/hermes-tv-tizen-native/`
> (renamed from `apps/tizen-hermes-tv/`). The **current canonical Tizen build**
> is the web-mirror wrapper at `apps/hermes-tv-tizen/`, driven by
> `tools/tizen-prep.js` + `tools/tizen-package.js` — see
> [`docs/34_TIZEN_BUILD_AND_SIDELOAD.md`](34_TIZEN_BUILD_AND_SIDELOAD.md) for
> the active flow. The legacy native commands below remain operational for
> the AVPlay-integrated reference build only.

From the `HermesTV-Tizen-AI` folder on your PC, run:

```bash
node apps/hermes-tv-tizen-native/scripts/package-wgt.js
```

This script bundles the Tizen app into a `.wgt` file. Output location:

```
apps/hermes-tv-tizen-native/dist/HermesTV.wgt
```

If the script fails, check that you ran `npm run install:all` and that the `apps/hermes-tv-tizen-native/` folder exists.

---

## Step 4 — Sign the .wgt package

Signing requires the Tizen authkey stored at `G:\private\authkey`. This file must never be committed to Git — it is excluded by `.gitignore`.

Run the sign-and-deploy script:

```bash
bash apps/hermes-tv-tizen-native/scripts/sign-and-deploy.sh
```

The script:
1. Reads the authkey from `G:\private\authkey`.
2. Signs `apps/hermes-tv-tizen-native/dist/HermesTV.wgt` using the Tizen signing tool.
3. Outputs a signed package: `apps/hermes-tv-tizen-native/dist/HermesTV.signed.wgt`.

If signing fails with "certificate not found", verify `G:\private\authkey` exists and has not been moved or renamed.

---

## Step 5 — Install on the TV

After signing, the script automatically installs the `.wgt` to the connected TV via sdb. If you need to install manually:

```bash
sdb install apps/tizen-hermes-tv/dist/HermesTV.signed.wgt
```

Expected output:

```
Transferring the package...
Installing the package...
--------------------
Platform Signature : UNTRUSTED
Author Signature : VALID
install completed
```

The "Platform Signature: UNTRUSTED" message is normal for developer-mode sideloads. It does not indicate an error.

---

## Step 6 — Launch and verify on-device

1. On the TV, navigate to **Apps** → scroll to the end to find **My Apps** or your newly installed apps.
2. Launch **HermesTV**.
3. The profile picker should appear.

### Tier detection verification

After launching, open the chatbot (floating circle, bottom-right) and type:

```
show system info
```

The system info panel should display:

- For Sherri's QN TV (`QN85Q7FAAFXZA`): `Renderer tier: enhanced`
- For Dave's UN TV (`UN55CU8000BXZA`): `Renderer tier: standard`

If the tier label is wrong, check the TV model detection logic in `apps/tizen-hermes-tv/src/tier-detection.js`.

### Additional on-device checks

| Check | Expected result |
|---|---|
| Profile picker loads | Both Dave and Sherri profiles selectable |
| Catalog grid renders | Mock content shows without blank tiles |
| Chatbot opens | Floating circle responsive; text input works |
| `dark theme` command | Theme switches without blank screen |
| Back button | Navigates correctly (Tizen remote Back key) |
| Remote D-pad navigation | Focus ring moves between tiles correctly |

---

## Step 7 — On-device AVPlay test (B3 prerequisite)

AVPlay is Samsung's native video player API on Tizen. This test is required before claiming B3 milestone complete, but the test setup can be verified now.

In the chatbot, type:

```
play test stream
```

In mock mode, this opens a placeholder player panel. On a real TV with a real provider configured, it should invoke AVPlay and start the stream.

If AVPlay does not start or the TV shows a black screen with no error, check:
- `G:\private\hermestv.env` has valid provider credentials.
- The backend API is reachable from the TV (both on same LAN).
- The TV firmware is Tizen 6.5 or higher (required for the AVPlay API version used by HermesTV).

---

## Known limitations during deployment

- **Tizen 5.x TVs**: Some features (background animation, enhanced focus ring) may render incorrectly. HermesTV targets Tizen 6.5+.
- **Samsung One Connect box**: Network configuration may differ. Use the TV's IP, not the One Connect box's IP.
- **VPN**: If your PC is on a VPN, sdb may not reach the TV. Disconnect the VPN for deployment.
- **Firewall**: Windows Firewall may block sdb. If `sdb connect` times out, temporarily disable the firewall or add an exception for port 26101.

---

## Rollback

If the deployed app is broken and you need to remove it from the TV:

```bash
sdb uninstall HermesTV
```

To reinstall the previous working `.wgt` (if you kept a copy):

```bash
sdb install <path-to-previous.signed.wgt>
```

---

## What not to do

- Do not commit `G:\private\authkey` or `G:\private\hermestv.env` to Git under any circumstances.
- Do not run `sign-and-deploy.sh` from the Git repo — run it from the working directory only.
- Do not share the authkey file. If it is lost or compromised, generate a new one from the Tizen Developer portal.

---

## Next steps after successful deployment

- `docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md` — add real provider credentials via the web setup page.
- B3 milestone: real ffprobe quality scanner, Azure TTS voice, AVPlay integration.

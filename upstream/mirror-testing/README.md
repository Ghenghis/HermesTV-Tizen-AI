# HermesTV — QN85 Mirror Testing Guide

Mirror testing means running the Vite dev server on the Windows workstation and pointing
Sherri's QN85Q7FAAFXZA Samsung Internet browser at the same URL Dave's Chrome uses. You
get real-device rendering on the actual TV without a full Tizen build-deploy cycle. This
document covers why it matters, how to set it up, and what to verify before each release.

---

## 1. Why Mirror Testing Matters

Chrome on the workstation catches roughly 95 % of regressions: layout, logic, state, and
most CSS. The remaining 5 % only surfaces on the QN85 because:

| Category | Chrome (workstation) | Samsung Internet (QN85) |
|---|---|---|
| Browser engine | Current Chromium | Chromium 76-era (Tizen 6.5) |
| Font scaling | OS DPI × CSS zoom | TV UI scale × 1.35 factor |
| HDR color space | sRGB monitor | HDR10 panel — saturates differently |
| `-webkit-backdrop-filter` | Supported | Requires explicit -webkit- prefix |
| Remote D-pad input | Keyboard simulation | Real IR keycode events |
| Viewport units | Standard | Samsung quirks on 100vh |
| Touch / pointer | Mouse events | Combination touch + pointer events |

The QN85 is the hardware Sherri actually uses. A visual defect that only appears at 65-inch
scale or under the Samsung Internet UA is a real bug, not a theoretical one.

Mirror testing is the fastest way to catch those bugs: no USB cable, no Tizen IDE, no
deployment package — just a URL.

---

## 2. Architecture

```
Windows Workstation (192.168.x.x)
  ├── npm run dev              →  http://localhost:5173   (Chrome — Dave's dev view)
  │     vite --host 0.0.0.0       also available on LAN NIC
  │     --port 5173
  │
  └── node services/api/...   →  http://localhost:3001   (REST / WebSocket API)
                                   also exposed on LAN if needed

              ↓ Local Area Network (same router / subnet)

QN85 QLED TV — Sherri's room (or moved to test position)
  └── Samsung Internet browser
        http://192.168.x.x:5173  →  same Vite bundle Chrome loads
                                     same API calls, same focusEngine,
                                     same tier-detection logic
```

Both Chrome and Samsung Internet receive the identical JavaScript bundle from the Vite dev
server. There is no separate build for mirror testing. The QN tier-detection code reads the
browser UA and screen dimensions at runtime; on the QN85 it will self-classify into the
QN-enhanced tier automatically.

---

## 3. Setup Steps

### 3.1 Find the workstation LAN IP

Open PowerShell on the workstation:

```powershell
ipconfig | Select-String "IPv4"
```

Look for the address on the adapter connected to the home LAN (usually `192.168.x.x` or
`10.x.x.x`). Note it — you will type this into the QN85 browser.

### 3.2 Verify Vite is bound to all interfaces

`vite.config.js` already sets `server: { host: '0.0.0.0', port: 5173 }` and `package.json`
already passes `--host 0.0.0.0` in the `dev` script. No change needed.

To confirm, start the dev server and look for two URLs in the output:

```
  VITE v5.x.x  ready in 312 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.42:5173/
```

The `Network:` line is what the QN85 uses.

### 3.3 Open Windows Defender firewall for port 5173

Run once in an elevated PowerShell session:

```powershell
New-NetFirewallRule `
  -DisplayName "HermesTV Vite dev (5173)" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5173 `
  -Action Allow `
  -Profile Private
```

Verify the rule exists:

```powershell
Get-NetFirewallRule -DisplayName "HermesTV Vite dev (5173)"
```

### 3.4 Connect from the QN85

1. On the QN85, press the **Home** button and open **Samsung Internet** (the blue globe).
2. Tap the address bar and type `http://192.168.x.x:5173` — use the workstation's actual IP.
3. The HermesTV shell should load within a few seconds.
4. The app's tier-detection code will read the Samsung Internet UA and screen resolution;
   the QN-enhanced CSS tier fires automatically.

---

## 4. Samsung Remote Web Inspector

Samsung Developer Mode lets you attach a Chrome DevTools session to the browser running on
the TV. You can inspect the DOM, read the console, and profile paint in real time.

### 4.1 Enable Developer Mode on the QN85

1. On the TV, open **Settings → Support → About Smart TV**.
2. With the remote, navigate to the version number field and press the number sequence
   `1 2 3 4 5` on the remote. A dialog appears asking to enable Developer Mode.
3. Set Developer Mode **On** and enter your workstation's IP when prompted (this is the IP
   where your DevTools host runs).
4. Restart the TV when asked.

### 4.2 Connect Chrome DevTools to the TV

With the TV on the same LAN and Developer Mode enabled:

1. Open Chrome on the workstation.
2. Navigate to `chrome://inspect/#devices`.
3. Under **Discover network targets**, click **Configure** and add `<tv-ip>:9998`
   (Samsung Internet's remote debugging port).
4. The QN85's open browser tabs appear under **Remote Target**. Click **inspect** next to
   the HermesTV tab.
5. A standard DevTools window opens — Console, Elements, Network, and Sources all reflect
   what is rendering on the physical TV.

This is the primary way to diagnose CSS differences that only appear on the QN85.

---

## 5. What to Verify on the QN85 Mirror

### 5.1 QN-enhanced CSS tier activation

Open DevTools → Console on the QN85 session. The app logs its detected tier at startup.
Confirm the output contains the QN tier identifier, not the base or UN tier.

In the Elements panel, check that the root element carries the QN tier class or data
attribute the tier-detection code applies. Confirm the following CSS properties are active:

- Grid columns: 8-wide content grid (not the 4-wide base layout)
- Hero section block-size: 65vh minimum
- `backdrop-filter` and `-webkit-backdrop-filter` both present on glass-effect cards

### 5.2 Font scaling at 1.35x

The app applies a 1.35x root font-size multiplier in the QN tier. On the 85-inch display
verify that:

- No heading text clips its container or overlaps adjacent elements
- The episode/channel title in the hero does not overflow its bounding box
- The metadata line (year, rating, runtime) fits on one line without wrapping

### 5.3 `-webkit-backdrop-filter` blur

Samsung Internet on Tizen 6.5 requires the prefixed form. In DevTools → Elements, select
a card with the frosted-glass overlay and confirm the Computed styles show a non-zero
`-webkit-backdrop-filter: blur(Npx)`. If the blur is absent, the un-prefixed rule is
being picked up (or dropped entirely). Fix in the relevant CSS/Tailwind layer.

### 5.4 Remote control D-pad navigation

With the TV remote, verify:

- Arrow keys move focus between cards predictably — no focus traps, no skipped rows
- **Enter / OK** activates the focused card
- **Back** dismisses modals and returns to the previous context
- Focus ring is visible on all focusable elements at TV viewing distance

The `focusEngine.js` module at
`apps/tizen-hermes-tv/src/ui/navigation/focusEngine.js` handles keycode mapping. Any
navigation regression on the real remote surfaces here.

### 5.5 Touch / click fallback in Samsung Internet

Samsung Internet supports both pointer and touch events. Confirm:

- Tapping a card with the TV touch interface (if a touchscreen remote or Samsung One Remote
  gestures are used) also activates the card
- No ghost-click delay on interactive elements

---

## 6. Tizen App vs. Web Mirror — Differences

The mirror test covers the UI layer accurately. It does **not** replicate everything the
packaged Tizen app provides:

| Capability | Web mirror (Samsung Internet) | Tizen app (.wgt) |
|---|---|---|
| Video playback | HTML5 `<video>` (codec limits apply) | AVPlay native plugin — full HEVC, HDR, DRM |
| Mic input | Not available (browser gating) | Samsung mic hardware input, gated by Hermes (not Bixby) |
| Azure TTS output | Works — same fetch to Azure endpoint | Works — same fetch; may use OS audio routing |
| Tizen OS APIs | None | `tizen.*` namespace, billing, input, device info |
| App lifecycle | Browser tab | Tizen application lifecycle events |
| Auto-launch on boot | No | Configurable via Tizen settings |
| DRM / widevine | Browser-level only | Platform-level, CDM access |

For streaming and DRM validation you must use the packaged Tizen app. For all UI, layout,
focus navigation, and API integration testing the mirror is sufficient and much faster.

---

## 7. e2e Testing Checklist — Real Device (QN85)

Run this before tagging each release. All items must pass on the physical QN85.

| # | Item | Pass criteria |
|---|---|---|
| 1 | **Tier detection** | Console logs QN tier; root element carries QN class |
| 2 | **8-wide grid** | Home screen shows 8 cards per row, no overflow |
| 3 | **65vh hero** | Hero section fills at least 65 % of viewport height |
| 4 | **Backdrop blur** | Glass cards show visible blur; DevTools confirms `-webkit-backdrop-filter` |
| 5 | **Font scale 1.35x** | No text clipping or overflow on any screen |
| 6 | **D-pad — horizontal** | Left/Right arrows navigate within a row |
| 7 | **D-pad — vertical** | Up/Down arrows move between rows |
| 8 | **Enter / OK** | Opens detail view or plays content for focused item |
| 9 | **Back button** | Returns to previous screen; no broken back stack |
| 10 | **Azure TTS** | Voice response plays through TV speakers (not Samsung TTS, not Bixby) |

Mark each item Pass / Fail / N-A in the release checklist. Do not release with any Fail
on items 1–9. Item 10 requires Azure credentials in the environment.

---

## Related Files

- `apps/hermes-web-tv/vite.config.js` — Vite server host/port config
- `apps/hermes-web-tv/package.json` — dev script (`--host 0.0.0.0 --port 5173`)
- `apps/tizen-hermes-tv/src/ui/navigation/focusEngine.js` — D-pad keycode handler
- `upstream/mirror-testing/VITE_LAN_CONFIG.md` — concise LAN binding quick-reference

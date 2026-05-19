# apps/hermes-tv-tizen — DaveTV Tizen wrapper

The current canonical Tizen build target. Re-packages the React web app
(`apps/hermes-web-tv/`) as a Samsung Tizen `.wgt` so DaveTV runs natively
on the Q7 QLED panels (Sherri's QN85, Dave's QN95) and on any Tizen
6.5+ TV in Developer Mode.

> This directory is the **wrapper**: it ships `config.xml`, an icon, a
> couple of Tizen-only platform helpers (`src/platform/*`), and a build
> pipeline. The actual app code lives in `apps/hermes-web-tv/`.
> For the legacy native-Tizen scaffold (no longer built by any tooling)
> see `apps/hermes-tv-tizen-native/`.

---

## What's in this folder

```
apps/hermes-tv-tizen/
├── config.xml.example      ← Tizen widget manifest (tracked source-of-truth)
├── icon.png                ← gitignored; supply 512×512 PNG for prod
├── package.json            ← chains web build + Tizen prep + wgt package
├── AVPLAY_INTEGRATION.md   ← AVPlay (native HLS) integration notes
├── src/
│   ├── api/apiBase.js      ← Tizen-side API base resolver (ES5)
│   └── platform/
│       ├── tizenLifecycle.js     ← visibilitychange / pagehide cleanup
│       └── codecCapabilities.js  ← MediaSource.isTypeSupported probe
└── (build outputs)
    ├── dist/               ← staged Vite build + config + icon
    └── dist-tizen/         ← final HermesTV-0.1.0.wgt
```

The `config.xml` shipped in the `.wgt` is **generated** from
`config.xml.example` by `tools/tizen-prep.js`. Edit the `.example` file;
the generated one is gitignored.

App-name change history: `HermesTV → DaveTV` (2026-05-19). The package
ID (`HermesTV01`) and Tizen application ID stay unchanged so existing
installs upgrade cleanly via `tizen install -n` instead of being treated
as a brand-new app.

---

## Build a .wgt

Prerequisites once per machine:

- Node 20+
- [Tizen Studio 5.x](https://developer.samsung.com/smarttv/develop/tools/tizen-studio.html)
  with the TV Extension installed (provides the `tizen` CLI)
- A signing certificate in Tizen Studio's Certificate Manager. For
  personal sideload use a **Samsung Tizen Developer Certificate** tied
  to the DUIDs of the TVs you will install on (free; requires a free
  Samsung account).

Build:

```bash
cd apps/hermes-tv-tizen
npm run build
```

This chains three steps:

1. `npm run build:web` — builds `apps/hermes-web-tv/` with Vite into
   `apps/hermes-web-tv/dist/`.
2. `npm run prebuild` — runs `tools/tizen-prep.js` to:
   - copy the web `dist/` into `apps/hermes-tv-tizen/dist/`
   - copy `config.xml.example` → `dist/config.xml` (and substitute any
     legacy placeholder hosts)
   - copy `icon.png` (generates a 117×117 orange-on-white "H"
     placeholder if missing — replace this with a 512×512 branded asset
     before shipping)
   - copy `src/api/apiBase.js` and `src/platform/*.js` into `dist/`
3. `npm run build:wgt` — runs `tools/tizen-package.js`, which invokes
   the Tizen CLI to produce `dist-tizen/HermesTV-0.1.0.wgt`.

---

## Sideload onto a TV (Developer Mode)

```bash
# 1. Enable Developer Mode on the TV
#    Settings → Support → About this TV → press 1,2,3,4,5 → toggle on
#    Enter your PC's IP. The TV reboots.

# 2. Connect from your PC
sdb connect <TV_IP>:26101
sdb devices                          # confirm the TV shows as `device`

# 3. Inspect the .wgt before installing (secret scan + CSP checks)
./tools/wgt-inspect.sh apps/hermes-tv-tizen/dist-tizen/HermesTV-0.1.0.wgt

# 4. Install
tizen install \
  -n apps/hermes-tv-tizen/dist-tizen/HermesTV-0.1.0.wgt \
  -t <TV_DEVICE_ID>

# 5. Launch
tizen run -p HermesTV.HermesTV -t <TV_DEVICE_ID>

# 6. Tail logs (Tizen dlog filtered to our package)
sdb -s <TV_DEVICE_ID> dlog | grep HermesTV
```

For Sherri's TV, the QR-onboarding flow in the app handles re-pairing
once the build is installed — she never sees a CLI.

---

## What `config.xml.example` declares

The fully-commented file is the source of truth, but the headline facts:

| Field | Value | Why |
|---|---|---|
| App display name | `DaveTV` | Launcher label (was "HermesTV") |
| Tizen profile | `tv` | Locks down to TV-class devices |
| `required_version` | `6.5` | QN95 baseline; Q7 QLED ships 6.5+ |
| `package` id | `HermesTV01` (10 chars) | Stable across the name change |
| `screen-orientation` | `landscape` | Q7 panels are fixed landscape |
| `hwkey-event` | `enable` | Routes Back key to JS (modal cascade) |
| Access origins | `tv.daveai.tech`, `hermestv.daveai.tech` (legacy alias), `localhost` (LAN dev) | Tizen blocks unlisted hosts |
| Privileges | internet, network.get, tv.audio, tv.inputdevice, mediaplaylist, keymanager, **avplay** (Samsung) | See AVPLAY_INTEGRATION.md for the AVPlay rationale |
| CSP `connect-src` | self + VPS + Azure translator/cognitive | TTS direct-fallback path |
| CSP `script-src` | self + 'unsafe-inline' (Vite preload polyfill) | No `unsafe-eval` — Tizen rejects it |

---

## Where to put your icon

Drop a 512×512 PNG at `apps/hermes-tv-tizen/icon.png`. The file is
`.gitignore`d so each operator can use their own brand asset without it
landing in version control. If the file is missing at build time
`tools/tizen-prep.js` synthesises a 117×117 orange-on-white "H"
placeholder. Replace this before any production sideload — the
placeholder is not Samsung-Seller-Office-grade.

---

## Troubleshooting

- **White screen on launch.** The CSP is rejecting one of the bundle's
  inline scripts. Run `wgt-inspect.sh` against the `.wgt`; if it
  reports CSP issues, edit the `<tizen:content-security-policy>` block
  in `config.xml.example` and rebuild.
- **"required_version is not 6.5" from `wgt-inspect.sh`.** A merge
  conflict rewrote the `required_version` attribute. Restore to
  `required_version="6.5"`.
- **No video, AVPlay errors in dlog.** The Samsung `avplay` privilege
  is missing or the device is older than Tizen 6.5. See
  `AVPLAY_INTEGRATION.md` for the hls.js fallback path; on dev builds
  this is automatic.
- **"can't connect to tv.daveai.tech" but ping works.** Tizen rejected
  the host because it isn't in `<access origin="...">`. Add it and
  rebuild.

---

## Source-of-truth references

- `tools/tizen-prep.js` — staging script (copies dist + config + icon)
- `tools/tizen-package.js` — invokes the Tizen CLI
- `tools/wgt-inspect.sh` — pre-sideload secret/CSP gate
- `apps/hermes-tv-tizen/AVPLAY_INTEGRATION.md` — AVPlay binding notes
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js` — JS bridge stub
- `apps/hermes-web-tv/src/hooks/useHlsStream.js` — hls.js fallback
- `docs/IPTV_Player_Zero/SAMSUNG_TIZEN_PORT.md` — upstream port guide

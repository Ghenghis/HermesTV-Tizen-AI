# Tizen App Audit — DaveTV Release Readiness

Generated: 2026-05-20
Worktree: `.claude/worktrees/musing-heyrovsky-6e2040` (branch `lane-a-provider-registry`)
Scope: Samsung Tizen 6.5 QN85/QN95 QLED primary target, UN-class graceful degradation.

## Tizen project existence: YES (canonical) + YES (legacy)

Two Tizen scaffolds exist in the repo:

- **Canonical**: `apps/hermes-tv-tizen/` — a thin wrapper that re-packages the
  React web app (`apps/hermes-web-tv/`) into a `.wgt`. Active build pipeline.
- **Legacy**: `apps/hermes-tv-tizen-native/` — original B1 native-Tizen scaffold,
  explicitly marked "NOT THE CURRENT TIZEN BUILD TARGET" in its README
  (`apps/hermes-tv-tizen-native/README.md:1-25`). Kept as AVPlay reference.
  Not built by any current tooling. Contract 46 §"Native Tizen Scaffold Is Not
  The Product Path Unless Repaired" calls this out as P1.

The audit below evaluates only the canonical wrapper unless noted.

---

## Audit Matrix

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | ZERO mock data / seed catalogs in Tizen wrapper | **PASS** | `apps/hermes-tv-tizen/src/**` contains only `apiBase.js`, `tizenLifecycle.js`, `codecCapabilities.js`. No catalogs, no seed arrays. Grep for `mock|seed|stub|fake` returns only doc references describing the rule. |
| 2 | ZERO popups before playback | **PASS** | `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx:523-530` — click handler calls `onPlay(item, …)` directly. No source picker, quality slider, or Watch/Record modal interposed. |
| 3 | Tizen API base points at production VPS | **PASS** | `apps/hermes-tv-tizen/src/api/apiBase.js:18` — `DEFAULT_API_BASE = 'https://tv.daveai.tech'`. Honors `?api=` query string and `localStorage 'hermestv.api_base'` overrides for LAN dev. |
| 3b | Web API base used by the bundled app reaches the VPS | **FAIL** | `apps/hermes-web-tv/src/api/hermesApi.js:1-14` — `BASE_URL` returns `''` (same-origin) for any host not matching `localhost`, RFC1918, or `hermestv.local`. When the .wgt loads under Tizen's `widget://` origin, same-origin fetches resolve to `widget:///api/...` and fail. The Tizen-side `apiBase.js` is staged into `dist/api/` but the bundled React app imports `hermesApi.js`, not the Tizen helper. Contract 46 P0 #5 + Contract 47 Agent 04. |
| 4 | Remote: D-pad navigation (37/38/39/40 + alt 4/5/6/7) | **PASS** | `apps/hermes-web-tv/src/utils/tizenKeyMap.js:28-35`. |
| 4 | Remote: OK / Enter (13) | **PASS** | `tizenKeyMap.js:38`. |
| 4 | Remote: Back (10009) + Exit (10182) | **PASS** | `tizenKeyMap.js:41-42`. `installTizenKeyHandler` (line 309-338) preventDefaults Back so the OS doesn't hard-exit the app. |
| 4 | Remote: Color buttons Red/Green/Yellow/Blue (403/404/405/406) | **PASS** | `tizenKeyMap.js:50-53`. Mapped to chatbot commands at lines 145-153. |
| 4 | Remote: Number keys 0-9 (48-57) | **PASS** | `tizenKeyMap.js:78-87`. |
| 4 | Remote: Channel up/down (427/428) | **PASS** | `tizenKeyMap.js:68-69`. Registered via `tvinputdevice.registerKeyBatch` at line 234. |
| 4 | Remote: Transport (play/pause/stop/FF/RW) | **PASS** | `tizenKeyMap.js:55-61`. |
| 4 | Remote: Info / Guide | **PASS** | `tizenKeyMap.js:64-65`. |
| 4 | `tizen.tvinputdevice.registerKey` called on boot | **PASS** | `tizenKeyMap.js:222-261` (`registerTizenRemoteKeys`), invoked from `installTizenKeyHandler` line 316. Wired into `App.jsx:24` import. |
| 5 | HLS playback path on Tizen (AVPlay) | **FAIL** | `apps/hermes-web-tv/src/hooks/useAvplayStream.js` exists and probes `window.webapis.avplay`, but `apps/hermes-web-tv/src/components/PlayerModal.jsx:6` imports `useHlsStream` directly, never `useAvplayStream`. The AVPlay bridge is reachable only via the multiview path which is also wired to hls.js (`MultiviewPlayer.jsx:47`). On Sherri's QN85, the hardware decoder is bypassed and Tizen Chromium 76 software-demuxes every TS segment. Contract 46 P0 #4, Contract 47 Agent 05. |
| 5 | HLS fallback (hls.js + native canPlayType) | **PASS** | `useHlsStream.js` (referenced); `useAvplayStream.js:245` delegates verbatim when `webapis.avplay` is absent. |
| 5 | Codec capability probe (HEVC / AV1 / VP9) | **PASS** | `apps/hermes-tv-tizen/src/platform/codecCapabilities.js:30-82`. Enhanced-tier (QN) returns true unconditionally at line 104 — honors the "Mom is never system-limited" rule. |
| 6 | App lifecycle: `visibilitychange` → release decoder | **PASS** | `apps/hermes-tv-tizen/src/platform/tizenLifecycle.js:95-101` (`_onVisibilityChange`); `_detachAllVideos` at line 42 calls `removeAttribute('src') + load()`. Installed via `installTizenLifecycle` line 128. |
| 6 | App lifecycle: `pagehide` → revoke blob URLs | **PASS** | `tizenLifecycle.js:103-106`. Revokes Azure TTS blob: URLs to prevent leaks during background. |
| 6 | App lifecycle: Tizen-native `onShow/onHide/onPause/onResume` | **FAIL (gap)** | No Tizen `webapis.appcommon` or `tizen.application.app` listeners anywhere in `apps/`. `visibilitychange` covers the foreground/background transitions Tizen 6.5 actually delivers to a webview, but the documented Samsung lifecycle callbacks (`onShow`, `onHide`) are not bound. Acceptable for a webview-class app but should be added when integrating AVPlay so the hardware surface is reclaimed deterministically. |
| 6 | First-gesture detector (autoplay policy) | **PASS** | `tizenLifecycle.js:108-120` + `onUserGesture` line 177. Gates Azure TTS boot greeting on first remote keydown / click / touchstart. |
| 6 | `installTizenLifecycle()` wired at boot | **PENDING** | `tizenLifecycle.js` is staged into `dist/platform/` by `tools/tizen-prep.js:187-203` but I did not find a call site in `apps/hermes-web-tv/src/main.jsx` or `App.jsx`. The module ships in the bundle but its `installTizenLifecycle` may never be invoked — needs verification post-build. If unwired, decoder slots leak when Mom navigates Home. |
| 7 | Samsung dev certificate config (presence only — NOT quoted) | **PASS (gitignored)** | `apps/hermes-tv-tizen/.gitignore:13-14` excludes `author.p12` + `distributor.p12`. Legacy scaffold's `apps/hermes-tv-tizen-native/scripts/sign-and-deploy.sh:5` references `.tizen/` cert dir (gitignored). I did not open any cert file or quote any private-key content. None present in the worktree tree — operator must supply. |
| 8 | Build pipeline: signed `.wgt` for QN85/QN95 + UN-class | **PASS (mechanism) / PENDING (signed artifact)** | `apps/hermes-tv-tizen/package.json:7-10` chains `build:web` → `tizen-prep.js` → `tizen-package.js` (`tools/tizen-package.js:170-220`) producing `dist-tizen/HermesTV-0.1.0.wgt`. Same `.wgt` works on both tiers because `config.xml.example:13` declares `required_version="6.5"` (matches QN85 + UN55) and `App.jsx:103-109` runtime-detects `QN→enhanced` / `UN→degraded`. **No signed `.wgt` is committed** (correctly — Tizen sign step requires operator certs). |
| 8 | `wgt-inspect.sh` pre-sideload secret + CSP gate | **PASS** | `tools/wgt-inspect.sh:29-99` scans for `password`, `api_key`, `bearer`, Xtream `get.php`, `AZURE_TTS_KEY`, etc.; verifies `required_version="6.5"`, package-ID length 10, no wildcard `<access origin="*">`. |
| 8 | `wgt-inspect.sh` legacy host check | **FAIL (stale)** | `tools/wgt-inspect.sh:93-97` still warns if `hermestv.local` is missing from `config.xml`, but the canonical config (`config.xml.example:59-60`) declares `tv.daveai.tech` + `hermestv.daveai.tech` as the production hosts. The inspector will emit a misleading WARNING for every production build. Cosmetic but should be fixed. |
| 9 | Voice/TTS — Azure only, NO Bixby | **PASS** | Grep for `bixby|Bixby|BIXBY` in the Tizen wrapper returns zero hits. The only references in `apps/hermes-web-tv/` are explicit NO-Bixby comments (`App.jsx:1016`, `FloatingChatbot.jsx:168`) and i18n strings ("Bixby AI is not used"). Tizen `config.xml.example:38` declares `voicecontrol` privilege — used as MIC capture input only, never for output. |
| 9 | Azure TTS blob: cleanup on background | **PASS** | `tizenLifecycle.js:74-93` (`_revokeAudioBlobUrls`). |
| 9 | Samsung mic input optional | **PASS** | `voicecontrol` + `mediacapturer` privileges declared in legacy `config.xml:38` and canonical `config.xml.example` (mediaplaylist line 92). FloatingChatbot uses mic as input only; output is Azure HTTP. |
| 10 | Asymmetric performance: Mom's TV never capped | **PASS** | `apps/hermes-web-tv/src/utils/isSystemLimited.js` exists; `App.jsx:103-109` resolveTier returns `'enhanced'` for QN-prefix; `codecCapabilities.js:104` returns true unconditionally for `tier === 'enhanced'`. CLAUDE.md memory rule honored. |
| 10 | CSP `'unsafe-eval'` rejected at prep | **PASS** | `tools/tizen-prep.js:122-136` greps the staged config for `'unsafe-eval'` and dies hard. Tizen 6.5 rejects unsafe-eval at app start; the prep gate prevents a broken `.wgt` from being signed. |
| 10 | CSP `connect-src` covers production VPS | **PASS** | `apps/hermes-tv-tizen/config.xml.example:114-115` includes `https://tv.daveai.tech` + `https://hermestv.daveai.tech` + `wss://` variants + Azure cognitive/translator hosts. |
| 10 | Web index.html CSP covers production VPS | **FAIL** | `apps/hermes-web-tv/index.html:5` `connect-src` lists only localhost + `hermestv.local` + cloudflare insight. Production hosts `tv.daveai.tech` and `hermestv.daveai.tech` are absent. When the bundle is staged into the .wgt the Tizen `config.xml` CSP takes precedence (the index `<meta>` CSP merges restrictively with `<tizen:content-security-policy>`), so the staged .wgt would still allow VPS calls — but for a same-origin web visit at the production URL the missing hosts are harmless (same-origin). The real risk is a developer running the .wgt before re-running `tizen-prep.js` against a fresh web build. |

---

## Web/Tizen Parity

Architecture (`docs/27_WEB_AND_TIZEN_MIRROR.md` + `apps/hermes-tv-tizen/README.md`):
the Tizen `.wgt` packages the *same* `apps/hermes-web-tv/` Vite build. There
is no parallel React tree to keep in sync, so feature parity is automatic for
every shell, modal, profile, and theme. Tizen-only additions live in
`apps/hermes-tv-tizen/src/` (apiBase, lifecycle, codec probe) and are staged
alongside the bundle by `tools/tizen-prep.js:187-203`.

What this guarantees works on Tizen (because it works on web):

- 14 dynamic UX shells (Zero, TiviMate, Netflix, Stremio, MomMode, Nuvio, etc.)
- Voice settings (Azure TTS server-only)
- Provider QR onboarding (`QROnboarding.jsx` — recently fixed for real setup URL)
- Multiview, EPG modal, search modal, parental gate, screensaver, sleep timer
- Mom Mode font-scale floor, profile rename, theme switcher

What is NOT guaranteed by parity:

- AVPlay native HLS path (Tizen-only, not wired — see Audit row 5).
- Tizen `tvinputdevice.registerKeyBatch` for color/transport keys (wired in
  `tizenKeyMap.js` but only fires on a real Tizen UA).
- Decoder release on background (`visibilitychange` hook — `installTizenLifecycle`
  needs to be called from boot; verification PENDING).

---

## Top-5 Release-Blocking Tizen Gaps

1. **AVPlay never invoked by PlayerModal** — `PlayerModal.jsx:6` imports
   `useHlsStream`, not `useAvplayStream`. Mom's QN85 hardware decoder is
   bypassed; every channel software-demuxes on Chromium 76. **Owner action**:
   swap the import to `useAvplayStream` and run `tools/wgt-inspect.sh` + sideload
   smoke on a QN-class TV.
2. **Web `hermesApi.js` BASE_URL falls back to same-origin under Tizen**
   (`apps/hermes-web-tv/src/api/hermesApi.js:7-14`). The packaged .wgt loads from
   `widget://` and `widget:///api/...` is not the VPS. **Owner action**: add a
   `widget:` / `file:` / Tizen-UA branch that returns `https://tv.daveai.tech`,
   OR import the Tizen-side `apiBase.js` when running on-TV.
3. **`installTizenLifecycle()` not confirmed wired** — module is staged into
   `dist/platform/` but no call from `main.jsx` or `App.jsx` was found.
   Without it, `<video>` decoder slots leak on Home/Power. **Owner action**:
   add a one-line `installTizenLifecycle()` import + invocation in `main.jsx`
   under the `installConsoleBuffer()` call.
4. **No signed `.wgt` exists in the repo or release artifacts** — the build
   chain is correct but operator certs (`author.p12` / `distributor.p12`) and
   the Tizen Studio sign step are still manual prerequisites. No automated
   CI lane signs the artifact. **Owner action**: produce one signed `HermesTV-0.1.0.wgt`,
   run `wgt-inspect.sh` against it, sideload on Sherri's QN85, capture `sdb dlog`
   evidence under `docs/proof/provider-truth/<ts>/tizen-build.txt`.
5. **Legacy scaffold not deprecated or repaired** — `apps/hermes-tv-tizen-native/`
   has its own `config.xml` (line 11 declares package `HermesTVap`, 10 chars)
   which would conflict with the canonical `HermesTV01` package ID if anyone
   accidentally builds it. Contract 46 §"Native Tizen Scaffold". **Owner action**:
   either remove the directory or add a build-time guard that refuses to
   package it (currently nothing prevents `cd apps/hermes-tv-tizen-native && npm run package`
   from producing a parallel .wgt that conflicts at install time).

---

## Secondary findings (non-blocking, worth fixing)

- `tools/wgt-inspect.sh:93-97` warns when `hermestv.local` is missing — stale,
  should accept `tv.daveai.tech` / `hermestv.daveai.tech`.
- `useAvplayStream.js` is documented as "stub" in `AVPLAY_INTEGRATION.md:37,48`
  — ABR ladder, audio-track switching, TimeShift not surfaced. Acceptable for
  v0.1.0 but track in the AVPlay follow-up ticket.
- `apps/hermes-tv-tizen/icon.png` is gitignored and falls back to a 117×117
  PNG procedurally rendered by `tools/tizen-prep.js:212-260` (Hermes-orange
  "H" placeholder). Acceptable for sideload, not for Samsung Seller-Office
  submission. Operator must drop a 512×512 branded asset before any store
  upload.
- `apps/hermes-web-tv/index.html:5` CSP lacks `tv.daveai.tech` /
  `hermestv.daveai.tech` — invisible at the production URL (same-origin) but
  would block a dev who opens a built .wgt without re-prepping.

---

## Sensitive material — not quoted

Per the audit constraints: I did not open or quote any `.p12` file, any
`profile.xml`, any signing keystore, any private key, any operator password.
None were present in tracked files. `apps/hermes-tv-tizen/.gitignore:13-14`
and `apps/hermes-tv-tizen-native/scripts/sign-and-deploy.sh:5` are the only
references and both correctly exclude these artifacts.

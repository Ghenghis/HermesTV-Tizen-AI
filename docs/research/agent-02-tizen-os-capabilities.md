# Agent 02 — Tizen OS Capabilities Research

**Research Date:** May 2026  
**Scope:** Samsung Tizen OS for two specific HermesTV TVs  
**Purpose:** Definitive capability reference for all HermesTV build decisions

---

<!-- NEEDS VERIFICATION: The Tizen version, model year, and Chromium version for QN85Q7FAAFXZA have NOT been confirmed on-device. The model suffix FAAFXZA is consistent with a 2021 Samsung QLED Q7FA series (which would be Tizen 6.0, Chromium ~76), NOT a 2017 Q7F (Tizen 3.0). Per docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md, both TVs are "TBD — unverified until confirmed from Samsung support, About This TV screen, and Tizen ProductInfo API." All capability claims below that are marked with a ⚠ must be treated as working assumptions, not confirmed facts. The on-device diagnostic screen defined in doc 02 MUST be run before any capability is accepted as final. -->

## CRITICAL FINDING: Two Different Platforms

| | Mom's TV (Sherri) | Dave's TV |
|---|---|---|
| Model | QN85Q7FAAFXZA | UN55CU8000BXZA |
| Year | ⚠ UNVERIFIED — likely 2021 (FAAFXZA suffix pattern; 2017 Q7F used FXZA suffix without the "A" middle tier code) | 2023 (CU8000 = 2023 Crystal UHD; confirmed by Samsung model naming) |
| Tizen Version | ⚠ UNVERIFIED — working assumption: **6.0** (2021 QLED); NOT confirmed as 3.0 | ⚠ UNVERIFIED on-device — working assumption: **7.0** (shipped); OTA to 8.0 unconfirmed |
| Chromium | ⚠ UNVERIFIED — working assumption: **~76** (Tizen 6.0) | ⚠ UNVERIFIED — working assumption: **~108** (Tizen 7.0/8.0) |
| JS Engine | ⚠ UNVERIFIED | V8 Turbofan (Tizen 7.0+) |
| WebAssembly | ⚠ UNVERIFIED — likely ❌ on Tizen 6.0 | ✅ Supported (Tizen 7.0+) |
| CSS Grid | ✅ Supported (Tizen 6.0 / Chromium ~76) | ✅ Supported |
| `fetch()` | ✅ Supported (Tizen 5.0+) | ✅ Available |
| `Promise` | ✅ Full (Tizen 5.0+) | ✅ Full |
| `Proxy` | ⚠ UNVERIFIED — likely ✅ on Chromium ~76 | ✅ Available |
| IntersectionObserver | ⚠ UNVERIFIED — likely ✅ on Chromium ~76 | ✅ Available |
| ResizeObserver | ⚠ UNVERIFIED | ✅ Available |
| Web Workers (.wgt) | ❌ Restricted (all Tizen .wgt) | ❌ Restricted |
| ES6 Modules | ⚠ UNVERIFIED — likely ✅ on Chromium ~76 | ✅ Supported |
| `navigator.connection` | ⚠ UNVERIFIED | ✅ Available |
| AVPlayExtension | ✅ Tizen 6.0+ (if year=2021 confirmed) | ✅ Tizen 6.0+ |
| Low-Latency Live | ✅ Tizen 5.0+ | ✅ Tizen 5.0+ |
| TizenBrew sideload | ✅ Tizen 5.0+ supported (if year=2021 confirmed) | ✅ TizenBrew supported |

**⚠ IMPORTANT:** If on-device diagnostics confirm Mom's TV is Tizen 6.0 (2021 model), the ES5 transpilation requirement for Mom's TV is NOT mandatory — but is still recommended for safety margin. If diagnostics unexpectedly confirm an older Tizen version, the transpilation and polyfill requirements below apply. The diagnostic screen from `docs/02` MUST be run first.

---

## 1. Tizen Version Matrix

| Year | Tizen | Chromium | Notes |
|---|---|---|---|
| 2017 | 3.0 | M47 | ES6 partial, no fetch, no Grid |
| 2018 | 4.0 | M56 | Full ES6 |
| 2019 | 5.0 | M63 | fetch, Promises solid |
| 2020 | 5.5 | M69 | |
| 2021 | 6.0 | ~76 | AVPlayExtension API added |
| 2022 | 6.5 | ~94 | |
| 2023 (Dave — confirmed year) | 7.0 → ⚠ 8.0 OTA unconfirmed | ~108 | WASM, modern DRM path, shipped 7.0; OTA to 8.0 Oct 2023 is Samsung's documented schedule but requires on-device confirmation |
| 2024 | 8.0 | ~118 | |
| 2025–2026 | 9.x | ~126+ | Walrus JS engine (new) |

<!-- NEEDS VERIFICATION: The Samsung Developer TV Model Groups page (https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html) lists exact model-to-group mappings. QN85Q7FAAFXZA and UN55CU8000BXZA must both be looked up there to confirm the exact Tizen version and Chromium version before any build target is finalized. -->

Samsung does NOT bump Chromium versions in firmware updates — the web engine version is set at manufacture. Security patches may ship but the JS engine version is frozen per model year.

**Samsung 7-year upgrade program:** Applies to 2023+ models only. Dave's TV (2023, CU8000) is eligible for Tizen 9.0. Mom's TV (year unconfirmed) — eligibility depends on confirmed model year.

---

## 2. AVPlay API Reference

### State Machine
```
NONE → IDLE → READY → PLAYING → PAUSED → (STOPPED)
```
All `setStreamingProperty()` and `setDrm()` calls must happen in **IDLE** state, before `prepare()`.

### HLS Adaptive Bitrate
```js
webapis.avplay.setStreamingProperty("ADAPTIVE_INFO", JSON.stringify({
  STARTBITRATE: "LOWEST",
  SKIPBITRATE: "HIGHEST",
  STARTBUFFERBYTESIZE: "131072",     // 128 KB
  PLAYBACKBUFFERBYTESIZE: "524288"   // 512 KB
}));
```
- Enforce identical FPS across all HLS variants to prevent audio sync drift on quality switches
- Live DVR: check window with `getStreamingProperty("GET_LIVE_DURATION")` before any seek
- `setStreamingProperty("LIVE_EDGE_DELAY", ms)` — controls live latency offset

### DRM — Branching Required for Both TVs

```js
// PlayReady (all Tizen versions) — same path
webapis.avplay.setDrm("PLAYREADY", "SetProperties", JSON.stringify({
  LicenseServer: "https://license.example.com/pr",
  DeleteLicenseAfterUse: true
}));

// Widevine — VERSION SPLIT
// NOTE: Mom's TV Tizen version is UNVERIFIED. If confirmed as Tizen 6.0+,
// Mom's TV also uses the modern path (else branch below), not this deprecated path.
if (tizenVersion <= 4.0) {
  // Deprecated path — applies only if Tizen ≤ 4.0 is confirmed on-device
  webapis.avplay.setDrm("WIDEVINE_CDM", "widevine_app_session", appSession);
  webapis.avplay.setDrm("WIDEVINE_CDM", "widevine_data_type", dataType);
} else {
  // Dave's TV: modern unified path
  webapis.avplay.setDrm("WIDEVINE_CDM", "SetProperties", JSON.stringify({
    LicenseServer: "https://license.example.com/wv"
  }));
}
```

### Low-Latency Mode (Dave's TV only — Tizen 5.0+)
```js
webapis.avplay.setStreamingProperty("SET_PLAYBACK_QUALITY", JSON.stringify({
  "InteractiveMode": 1,
  "latency": 3000
}));
```

### Error Recovery Pattern
```js
avplay.setListener({
  onerror: function(eventType) {
    // Always go back through state machine:
    avplay.stop();
    avplay.setSource(url);   // re-set URL
    avplay.prepare();        // back to READY
    avplay.play();
  }
});
```

### Multi-Audio Track
```js
var tracks = webapis.avplay.getTotalTrackInfo();
webapis.avplay.setSelectTrack("AUDIO", trackIndex);
// extra_info field contains JSON with language code
```

### Subtitles
```js
webapis.avplay.setExternalSubtitlePath(path); // BEFORE prepare()
webapis.avplay.setSelectTrack("TEXT", index);
// onerror: onsubtitlechange(duration, text)
```
**Tizen 3.0 bug:** External subtitle timing drifts on long VOD. Prefer embedded TTML in-stream.

### AVPlay Quirks / Bugs

| Issue | Workaround |
|---|---|
| Audio sync drift on HLS quality switch | Enforce uniform FPS across all HLS variants |
| `seekTo()` freezes outside DVR window | Check `GET_LIVE_DURATION` before seeking |
| DRM license expiry = black screen | Implement `ondrmevent` license renewal |
| Player leaks on navigation | Always call `stop()` + `destroy()` on unload |
| `ADAPTIVE_INFO` ignored after prepare | Set all props in IDLE state, before `prepare()` |
| Multiple instances crash | One AVPlay instance per page; destroy before creating new |

### New APIs (Tizen 6.0+ — Dave's TV only)
```js
// QoE statistics (AVPlayExtension)
webapis.avplay.getStreamingProperty("CURRENT_BANDWIDTH"); // bits/sec
webapis.avplay.getStreamingProperty("CURRENT_BITRATE");   // active ABR track
// ondroppedframes / ondecodeframerate callbacks available
```

---

## 3. ProductInfo API — Device Detection

```js
// CRITICAL: wait for DOMContentLoaded + confirm webapis exists
document.addEventListener("DOMContentLoaded", function() {
  if (typeof webapis === "undefined") return; // not on TV

  var firmware  = webapis.productinfo.getFirmware();
  var model     = webapis.productinfo.getModel();
  var modelCode = webapis.productinfo.getModelCode();
  var duid      = webapis.productinfo.getDuid();

  var tizenVersion = parseFloat(
    tizen.systeminfo.getCapability("http://tizen.org/feature/platform.version")
  );
});
```

### Recommended Capability Detection

<!-- NEEDS VERIFICATION: The `isMomsTv` threshold below uses `v <= 3.0` which was derived from the incorrect 2017 model-year assumption. Once on-device diagnostics confirm Mom's actual Tizen version, this threshold must be updated. The correct approach is to detect by model string (productinfo.getModel()) rather than Tizen version alone. -->

```js
function detectTVCapabilities() {
  const v = parseFloat(
    tizen.systeminfo.getCapability("http://tizen.org/feature/platform.version")
  );
  // IMPORTANT: Use productinfo.getModel() for definitive TV identification.
  // Tizen version alone is insufficient because the same version can span multiple model families.
  const modelStr = webapis.productinfo.getModel();
  return {
    tizenVersion:        v,
    isMomsTv:            modelStr === "QN85Q7FAAFXZA",   // Sherri — confirmed by model string, NOT version
    isDavesTv:           modelStr === "UN55CU8000BXZA",  // Dave — confirmed by model string
    supportsLowLatency:  v >= 5.0,
    supportsModernDrm:   v >= 5.0,
    supportsWasm:        v >= 7.0,
    supportsAvExtension: v >= 6.0,
    chromiumApprox:      v <= 3.0 ? 47 : v <= 4.0 ? 56 : v <= 5.0 ? 63 : v <= 6.0 ? 76 : 108
  };
}
```

---

## 4. Performance Characteristics

### Memory Budgets

<!-- NEEDS VERIFICATION: Mom's TV memory budget below assumes a 2017-class device. If the confirmed model year is 2021 (Tizen 6.0), the memory budget should be aligned with 2021 QLED hardware, which typically supports 300–400 MB JS heap. Update these values once on-device diagnostics are run. -->

| | Mom's TV (Tizen version UNVERIFIED) | Dave's TV (Tizen 7.0+) |
|---|---|---|
| JS heap target | ⚠ UNVERIFIED — working assumption ≤ 150–200 MB | ≤ 200–250 MB |
| Max interactive DOM nodes | ⚠ UNVERIFIED — working assumption ~400 | ~600–800 |
| Animation target | ⚠ UNVERIFIED — working assumption 30–60 fps | 60 fps (16ms frame) |
| `requestAnimationFrame` | Available | Available |
| Video buffer | Hardware (AVPlay) | Hardware (AVPlay) |

### Rules for Both TVs
- Single-threaded JS only — no Web Workers in `.wgt`
- Always use `transform: translate3d()` for animated elements (GPU layer)
- Batch DOM reads before writes — never interleave `offsetHeight` reads with style mutations
- EPG grids: virtual DOM or Canvas — never render thousands of nodes at once
- Always call `avplay.stop()` + `avplay.destroy()` on `window.onbeforeunload`

---

## 5. Input / Remote APIs

### Key Registration
```js
tizen.tvinputdevice.registerKeyBatch([
  "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop",
  "MediaFastForward", "MediaRewind",
  "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
  "ChannelUp", "ChannelDown", "VolumeUp", "VolumeDown"
]);
// Query what the remote actually supports:
var supported = tizen.tvinputdevice.getSupportedKeys();
```

### Key Code Reference

| Key | keyCode |
|---|---|
| Enter / OK | 13 |
| Back | 10009 |
| MediaPlay | 415 |
| MediaPause | 19 |
| MediaPlayPause | 10252 |
| MediaStop | 413 |
| MediaFastForward | 417 |
| MediaRewind | 412 |
| ColorF0Red | 403 |
| ColorF1Green | 404 |
| ColorF2Yellow | 405 |
| ColorF3Blue | 406 |
| ChannelUp | 427 |
| ChannelDown | 428 |

**Always intercept Back (10009)** — if not handled, the TV OS terminates the app.

### Remote Differences
<!-- NEEDS VERIFICATION: Mom's TV remote type depends on confirmed model year. The 2017 Q7F shipped with TM1750A (standard D-pad + color buttons, no mic). A 2021 Q7FA would ship with BN59-01357A (which includes a Bixby mic button on some regions). Confirm remote model via on-device inspection or Samsung support. The key result that matters for HermesTV: whether VoiceControl API is accessible and whether a physical mic button exists. -->
- Mom's TV (year UNVERIFIED — see CRITICAL FINDING): remote type unconfirmed; hardware mic button presence unconfirmed
- Dave's TV (2023, CU8000): One Remote with hardware Bixby/mic button; solar-powered (confirmed for 2023 CU8000 class)

### Voice Input — INPUT ONLY (not AI output)

```js
// VoiceControl API — available Tizen 2.4+, no Samsung cert needed
tizen.voicecontrol.start();
tizen.voicecontrol.addResultListener(function(result) {
  // result.resultType, result.recognizedWords
  hermesBackend.processVoiceInput(result.recognizedWords);
});
```

**RULE:** VoiceControl API = input capture only. All AI processing and TTS output goes through HermesTV backend + Azure TTS. Bixby deep integration requires Samsung certification approval — do NOT design around it.

**Mom's TV:** VoiceControl API available but remote has no mic button. On-screen mic button or companion input is the practical fallback.  
**Dave's TV:** Hardware mic button present; VoiceControl API works; Bixby deep integration not used.

---

## 6. Network APIs

```js
// Cross-version baseline — works on both TVs
var state = webapis.network.getNetworkState(); // NONE, WIFI, ETHERNET
webapis.network.addNetworkStateChangeListener(function(status) { ... });
webapis.network.getGateway();
webapis.network.getIp();

// Dave's TV only (Chromium 108)
var conn = navigator.connection;
// .type, .effectiveType, .downlink (Mbps), .rtt (ms)
```

---

## 7. Storage APIs

| Type | Limit | Recommended For |
|---|---|---|
| `localStorage` | 2.5–5 MB | User settings, last-watched, volume level |
| `IndexedDB` | Hundreds of MB | Channel list, EPG cache, stream preferences |
| Cookies | 4 KB/cookie | Not recommended |

**IndexedDB on Tizen 3.0:** Available but limited spec. Use simple key-value patterns only — avoid complex queries or IDBKeyRange multi-key on Chromium M47.

---

## 8. CSS Constraints for Mom's TV

<!-- NEEDS VERIFICATION: The CSS constraints below were written for a Tizen 3.0 / Chromium M47 device. If Mom's TV is confirmed as Tizen 6.0 (Chromium ~76), CSS Grid is fully supported and most of these workarounds are unnecessary. Until on-device confirmation, apply these constraints conservatively only if the diagnostic confirms Tizen ≤ 4.0. For Tizen 6.0+, standard CSS Grid and modern CSS are supported. -->

**The following constraints apply IF Mom's TV is confirmed as Tizen ≤ 4.0 only:**

| Feature | Status on Tizen ≤ 4.0 | Status on Tizen 6.0+ | Workaround (if Tizen ≤ 4.0) |
|---|---|---|---|
| CSS Grid | ❌ | ✅ | Use `-webkit-flex` flexbox |
| `display: flex` | ⚠ Needs prefix | ✅ | `-webkit-flex`, `-webkit-flex-direction` |
| `gap` in flexbox | ❌ | ✅ | Use `margin` on children |
| `position: sticky` | ❌ Unreliable | ✅ | Use `position: fixed` + manual scroll |
| `vh`/`vw` units | ⚠ Broken | ✅ | Use `%` relative to known container |
| CSS `transform` on `<video>` | ❌ | ❌ (AVPlay limitation, all versions) | Position AVPlay container absolutely |
| CSS animations | Causes jank | Generally OK | `will-change: transform` sparingly; prefer `translate3d` |

---

## 9. JavaScript Build Requirements for Mom's TV

<!-- NEEDS VERIFICATION: ES5 transpilation was specified for Tizen 3.0 / Chromium M47. If Mom's TV is confirmed as Tizen 6.0 (Chromium ~76), ES6+ is fully supported and ES5 transpilation is optional safety margin, not a hard requirement. Run on-device diagnostics first. Until confirmed, target the conservative ES5 path to be safe. -->

**IF Mom's TV is confirmed as Tizen 3.0 (Chromium M47): ES5 transpilation + polyfills are mandatory.**
**IF Mom's TV is confirmed as Tizen 6.0 (Chromium ~76): ES6+ is supported; polyfills below are not required.**

```js
// Required polyfills only if Tizen ≤ 4.0 is confirmed:
require('whatwg-fetch');          // fetch() — not needed on Tizen 5.0+
require('es6-promise').polyfill(); // Promise — not needed on Tizen 5.0+
require('core-js/stable');         // Object.assign, Array.from, etc. — not needed on Tizen 6.0+
```

**Build config (webpack/rollup) — conservative safe path until TV is verified:**
```
target: ["chrome76"]  // Tizen 6.0 safe minimum (update after on-device confirmation)
output: single IIFE bundle (no ES modules — required by all Tizen .wgt packaging)
```

**Do NOT use until Tizen version is confirmed (risks for Tizen ≤ 4.0):**
- `import`/`export` (must bundle regardless of Tizen version)
- `Proxy` / reactive frameworks relying on it (Vue 3, MobX 6) — only on Tizen ≤ 4.0
- `async`/`await` without Babel transform — only on Tizen ≤ 4.0
- `IntersectionObserver` — only on Tizen ≤ 4.0
- CSS Grid — only on Tizen ≤ 4.0
- `navigator.connection` — only on Tizen ≤ 5.5

---

## 10. TizenBrew Status (May 2026)

- **Active and maintained** for Tizen 6–8 (2021–2024 TVs)
- Installation: TizenBrew Installer desktop app (USB Demo Package service shut down)
- Certificate requirement: Certificate Extension v2.0.73+ (update Tizen Studio if pre-Sep 2025)
- **Dave's TV (Tizen 7.0+):** ✅ Fully supported via TizenBrew
- **Mom's TV (Tizen version UNVERIFIED):** ⚠ UNVERIFIED — if confirmed as Tizen 6.0 (2021), TizenBrew is supported. If unexpectedly older than Tizen 5.0, TizenBrew requires Tizen Studio with developer certificate instead. Confirm with on-device diagnostics.
- Developer mode (2026): Functional on both TVs via Settings > Support > About Smart TV (hidden IP entry). Samsung can restrict in future firmware — not guaranteed long-term.

---

---

## Conclusion — What Contracts Can and Cannot Rely On

**What contracts CAN rely on (confirmed or safely inferable from model naming):**
- Dave's TV (UN55CU8000BXZA) is a 2023 Crystal UHD CU8000. Tizen 7.0 shipped; on-device confirmation needed for 8.0 OTA.
- Both TVs support AVPlay for HLS/DASH streaming — this is universal across all Tizen TV versions.
- Samsung remote key codes (Enter=13, Back=10009, color keys 403–406) are stable across all Tizen versions.
- `tizen.filesystem` for profile storage works across Tizen 3.0+.
- `localStorage` 5 MB limit applies across all Tizen versions.
- Voice output through Azure TTS via HTML5 `<audio>` element works on Tizen 5.0+.
- The AVPlay state machine (NONE→IDLE→READY→PLAYING→PAUSED) and all `setStreamingProperty` calls are stable across Tizen 3.0–8.0.
- The single IIFE bundle output format (no ES modules) is required for all `.wgt` packaging regardless of Tizen version.

**What contracts CANNOT rely on (requires on-device verification):**
- Mom's TV Tizen version, Chromium version, and JS engine — all UNVERIFIED. Do not finalize ES5 vs ES6 build targets until the diagnostic screen is run.
- Mom's TV microphone hardware and `getUserMedia` availability — UNVERIFIED.
- Memory budgets for Mom's TV — UNVERIFIED. Do not set performance floors for Mom's TV until heap measurements are taken on-device.
- TizenBrew compatibility for Mom's TV — conditional on confirmed Tizen version.
- Mom's TV `backdrop-filter: blur()` GPU support — conditional on confirmed Chromium version.

**Gate:** No layout, player, or build pipeline decision that differs between Mom's TV and Dave's TV is final until the `docs/02` diagnostic screen has been run on `QN85Q7FAAFXZA` and results are committed to the evidence ledger.

---

## 11. Key Reference URLs

- [AVPlay API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html)
- [AVPlayExtension API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplayextension-api.html)
- [ProductInfo API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/productinfo-api.html)
- [TV Model Groups](https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html)
- [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [Remote Control Guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)
- [VoiceInteraction API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/voiceinteraction-api.html)
- [Dolby OptiView — AVPlay Limitations](https://optiview.dolby.com/resources/blog/playback/going-big-screen-exhaustive-list-of-samsung-tizens-avplay-limitations/)
- [TizenBrew](https://github.com/reisxd/TizenBrew)
- [Float Left Interactive — Tizen Best Practices 2025](https://floatleftinteractive.com/guides/samsung-tizen-tv-development-new-features-and-best-practices/)

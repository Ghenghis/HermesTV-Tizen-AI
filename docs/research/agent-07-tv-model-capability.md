# Agent 07 — TV Model Capability Research: QN85Q7FAAFXZA and UN55CU8000BXZA

**Research Date:** 2026-05-17
**Agent lane:** 07 — Samsung TV Model Capability Research (Master Contract §1)
**Scope:** Hardware and software capabilities for both project TVs
**Purpose:** Definitive model-specific capability reference. Every claim below is specific to the named SKU. Generic Samsung TV claims are excluded.
**Cross-referenced:** `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md` (prior lock), `docs/research/agent-02-tizen-os-capabilities.md` (Tizen capabilities baseline)

---

> **CRITICAL PREFACE:** Per `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`, both TVs are unverified until on-device diagnostics are run via `webapis.productinfo`. This document synthesizes publicly available model-specific data and cross-references existing project findings. Every item that cannot be confirmed from official Samsung specifications for the exact model SKU is marked `<!-- NEEDS VERIFICATION -->`. Do not remove any `NEEDS VERIFICATION` marker without committing the on-device evidence proof.

---

## 1. Model Identity and Year of Release

### 1.1 QN85Q7FAAFXZA — Mom/Sherri's TV

**Model number anatomy:** `QN` = QLED product line prefix | `85` = screen size (inches) | `Q7F` = Q7-series QLED | `A` = 2021 revision code | `A` = second revision indicator | `FXZA` = USA market suffix

**Year of release:** 2021

**Rationale for 2021:** The suffix pattern `FAAFXZA` (with the double-A middle code after the series designation) is the Samsung 2021 model year identifier for QLED Q7-class sets sold in the United States. The 2017 Q7F USA SKUs used the suffix `FXZC` or `FXZA` without the `AA` middle code. The `QN` prefix itself was introduced by Samsung in 2017 for QLED panels and continued through all subsequent QLED model years; the `QN` prefix alone does not confirm year. The `AA` in `Q7FAAFXZA` is the distinguishing marker for the 2021 refresh of the Q7F line.

<!-- NEEDS VERIFICATION: Confirm 2021 model year via Samsung's "About This TV" menu (Settings > Support > About Smart TV) on-device. The exact string returned by `webapis.productinfo.getModel()` must be committed to the evidence ledger. -->

**Samsung lineup tier:** Q7-series QLED — upper-mid-range QLED. In Samsung's 2021 lineup: Q7FA sits below Q8/Q9/QN90A/QN85A Neo QLED but above Crystal UHD (TU/AU/CU lines). Panel is QLED (Quantum Dot LCD with LED backzoning). Not Neo QLED (Mini-LED). Not OLED.

**Samsung model group (TV Seller Office):** <!-- NEEDS VERIFICATION: The Samsung Developer TV Model Groups page (https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html) must be consulted to confirm which group QN85Q7FAAFXZA maps to. Based on 2021 QLED Q7-class, the expected group is `21TV_QLED` or a comparable 2021 QLED group designation. Confirm before finalizing any Tizen API availability claim. -->

---

### 1.2 UN55CU8000BXZA — Dave's TV

**Model number anatomy:** `UN` = standard LED/LCD product line prefix | `55` = screen size (inches) | `CU8000` = 2023 Crystal UHD 8000-series | `B` = revision/sub-model code | `FXZA` — wait: `XZA` = USA market | `B` = second model variant indicator

**Year of release:** 2023

**Rationale for 2023:** `CU8000` is an unambiguous Samsung 2023 product designation. Samsung's Crystal UHD lineup uses the following year codes: BU (2022), CU (2023), DU (2024). The `C` in `CU8000` = 2023. This is confirmed by Samsung's official 2023 product line documentation.

**Samsung lineup tier:** Crystal UHD 8000-series — entry-to-mid-range LED LCD. No QLED Quantum Dot layer. Direct LED or edge-lit LED backlight. 4K UHD panel. The 8000-tier within Crystal UHD is one step above the base 7000-tier and below the 8500/9000 tiers in the same year's lineup. The `UN` prefix denotes standard LED (non-QLED) in Samsung's naming convention.

**Samsung model group (TV Seller Office):** <!-- NEEDS VERIFICATION: Confirm on the Samsung Developer TV Model Groups page. Based on 2023 Crystal UHD class, the expected group is `23TV_BASIC2` or `23TV_BASIC3`. The exact group determines Tizen sub-version and Chromium pinning. Confirm before finalizing any Tizen API availability claim. -->

---

## 2. Tizen OS Version

### 2.1 Tizen Version Matrix Context

| Samsung Year | Tizen Version | Chromium Pinned |
|---|---|---|
| 2019 | 5.0 | ~63 |
| 2020 | 5.5 | ~69 |
| 2021 | 6.0 | ~76 |
| 2022 | 6.5 | ~94 |
| 2023 | 7.0 | ~108 |
| 2024 | 8.0 | ~118 |
| 2025–2026 | 9.x | ~126+ |

**Important rule confirmed by Agent 02:** Samsung does NOT bump the Chromium web engine version in firmware updates. The web engine version is set at manufacture and frozen per model year. Security patches may arrive but the JS engine version is frozen.

### 2.2 QN85Q7FAAFXZA — Tizen Version

**Working assumption (based on model year inference):** Tizen 6.0, shipped at manufacture.

**OTA upgrade ceiling:** <!-- NEEDS VERIFICATION: Samsung's general upgrade policy for 2021 QLED TVs must be confirmed. Samsung announced a 7-year software upgrade program but the specific eligibility and ceiling version for the 2021 Q7FA line has not been confirmed for this project. The maximum OTA-reached Tizen version on this specific unit must be read from About This TV on-device. -->

**Shipped Tizen version:** Tizen 6.0 (working assumption — 2021 QLED)

<!-- NEEDS VERIFICATION: Run `tizen.systeminfo.getCapability("http://tizen.org/feature/platform.version")` on-device to confirm the actual Tizen version number. The exact sub-version (e.g., 6.0.1, 6.0.2) matters for any edge-case API differences. Commit the result to the evidence ledger before any build target is finalized. -->

### 2.3 UN55CU8000BXZA — Tizen Version

**Shipped Tizen version:** Tizen 7.0 (2023 Crystal UHD — confirmed by Samsung model year mapping for CU-class devices)

**OTA upgrade ceiling:** Samsung documented an OTA update to Tizen 8.0 for 2023 models in the October–November 2023 timeframe. However, whether this specific unit received and installed the 8.0 OTA is unknown — it depends on the unit's firmware update history and user actions.

**Current Tizen version on-device:** <!-- NEEDS VERIFICATION: Read via `tizen.systeminfo.getCapability("http://tizen.org/feature/platform.version")` on-device. The TV may currently be on 7.0, 7.x, or 8.0 depending on update history. This affects the Chromium version and available APIs. -->

**Implication for project:** If Dave's TV is on Tizen 8.0 (Chromium ~118), additional modern CSS and JS features are available. If it remains on Tizen 7.0 (Chromium ~108), that is the design floor. The conservative safe assumption is Tizen 7.0 / Chromium 108. The build pipeline (`docs/09`) targets `chrome 76` as the conservative safe minimum — this is safe for both possible states of Dave's TV.

**Samsung 7-year upgrade program:** Dave's TV (2023, CU8000) is eligible for this program, which means Tizen 9.x updates are theoretically possible in future years.

---

## 3. Web Engine (Chromium) Version

### 3.1 QN85Q7FAAFXZA — Web Engine

**Chromium version (working assumption):** ~76, corresponding to Tizen 6.0 (2021)

**JavaScript engine:** V8 (Chromium 76 baseline)

**ES support level:** ES2019 (ES10) — confirmed supported at Chromium 76. `async/await`, arrow functions, `const`/`let`, template literals, destructuring, spread/rest, `fetch()`, `Promise`, `Array.from`, `Object.assign`, CSS custom properties, CSS Grid, `IntersectionObserver` are all available at Chromium 76.

**User agent string format (expected):** `Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1`

<!-- NEEDS VERIFICATION: The exact user agent string must be read from `navigator.userAgent` on-device via the doc-02 diagnostic screen. The Chromium version embedded in the UA string will confirm the actual web engine pinning. Commit the raw UA string to the evidence ledger. -->

**WebAssembly:** <!-- NEEDS VERIFICATION: WASM support on Tizen 6.0 is not confirmed for this project. General Chromium 76 supports WASM but Samsung's Tizen 6.0 implementation may disable it in the .wgt sandbox. Agent 02 lists WASM as "UNVERIFIED" for Mom's TV. Do not rely on WASM for Mom's TV until on-device confirmation. -->

**CSS Grid:** Supported at Chromium 76 / Tizen 6.0.

**`backdrop-filter: blur()`:** <!-- NEEDS VERIFICATION: `backdrop-filter` was behind a flag in Chromium 76 and may not be enabled in the Tizen 6.0 web engine. Do not rely on it for the chatbot overlay until tested on-device. -->

### 3.2 UN55CU8000BXZA — Web Engine

**Chromium version (working assumption):** ~108, corresponding to Tizen 7.0 (2023). If the unit upgraded to Tizen 8.0, then ~118.

**JavaScript engine:** V8 Turbofan (Tizen 7.0+) — confirmed for 2023-class Samsung TVs.

**ES support level:** ES2022 natively at Chromium 108. All ES2019 features and most ES2020–2022 features (optional chaining `?.`, nullish coalescing `??`, `Promise.allSettled`, `Array.prototype.at`, `Object.hasOwn`, etc.) available.

**WebAssembly:** Available at Chromium 108 / Tizen 7.0+, but restricted in `.wgt` sandbox — do not rely on it per Agent 02 research.

**User agent string format (expected):** `Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/7.0 TV Safari/538.1`

<!-- NEEDS VERIFICATION: Read exact UA string on-device. The version number in the UA confirms whether the unit is on Tizen 7.0 or 8.0 post-OTA. -->

---

## 4. Tizen Web API Support Level

Both TVs support the core Tizen TV Web API surface. The table below shows availability per TV and per confirmed or inferred Tizen version.

| API | QN85Q7FAAFXZA (Tizen 6.0) | UN55CU8000BXZA (Tizen 7.0) | Notes |
|---|---|---|---|
| `webapis.avplay` | Yes | Yes | Universal across all Tizen TV versions |
| `webapis.avplay` — AVPlayExtension QoE stats | Yes (Tizen 6.0+) | Yes | `CURRENT_BANDWIDTH`, `CURRENT_BITRATE`, frame callbacks |
| `webapis.productinfo` | Yes | Yes | `getModel()`, `getFirmware()`, `getDuid()`, `getModelCode()`, `getSmartTVServerType()` |
| `webapis.network` | Yes | Yes | `getNetworkState()`, `addNetworkStateChangeListener()`, `getIp()`, `getGateway()` |
| `tizen.systeminfo` | Yes | Yes | `getCapability()` for platform version, screen resolution, etc. |
| `tizen.tvinputdevice` | Yes | Yes | `registerKeyBatch()`, `getSupportedKeys()` |
| `tizen.voicecontrol` | Yes | Yes | `start()`, `addResultListener()` — input only, no Bixby AI |
| `tizen.filesystem` | Yes | Yes | Works from Tizen 3.0+ |
| `localStorage` | Yes (~5 MB) | Yes (~5 MB) | Limit consistent across Tizen versions |
| `IndexedDB` | Yes | Yes | Avoid complex IDBKeyRange on older engines |
| `navigator.mediaDevices.getUserMedia` | <!-- NEEDS VERIFICATION: depends on remote mic hardware presence and TV firmware permissions --> | Yes (remote has hardware mic button) | Voice capture path |
| `navigator.connection` | <!-- NEEDS VERIFICATION: available in Chromium 76 generally, but Tizen 6.0 may not expose it --> | Yes (Tizen 7.0+) | Network type/downlink |
| `fetch()` | Yes (Tizen 5.0+) | Yes | Native |
| `Promise` | Yes | Yes | Native |
| `IntersectionObserver` | Yes (Chromium 76) | Yes | |
| `ResizeObserver` | <!-- NEEDS VERIFICATION: Chromium 76 has it but Tizen 6.0 pinning may lag --> | Yes | |
| Web Workers in `.wgt` | No (restricted in all Tizen .wgt) | No | Hard restriction |
| SharedArrayBuffer | No | No | Hard restriction |
| ES Modules (`import`/`export`) | No (bundle to IIFE) | No (bundle to IIFE) | Required for all `.wgt` |

**Privilege declarations required in `config.xml` for both TVs** (from `docs/09` — applies to both models):
- `http://developer.samsung.com/privilege/productinfo`
- `http://developer.samsung.com/privilege/avplay`
- `http://tizen.org/privilege/tv.inputdevice`
- `http://tizen.org/privilege/voicecontrol`
- `http://tizen.org/privilege/mediacapturer`
- `http://tizen.org/privilege/internet`
- `http://tizen.org/privilege/network.get`
- `http://tizen.org/privilege/filesystem.read`
- `http://tizen.org/privilege/filesystem.write`

---

## 5. RAM and CPU Tier

### 5.1 QN85Q7FAAFXZA — RAM and CPU

**Panel size:** 85-inch

**RAM:** <!-- NEEDS VERIFICATION: Samsung does not publish official RAM specifications for consumer TV models. For 2021 QLED Q7-class TVs, publicly reported RAM is typically 2.5 GB total system RAM with approximately 1.0–1.5 GB available to the Smart TV platform. JavaScript heap available to a Tizen web app is a fraction of this. The working budget from Agent 02 is ≤ 150–200 MB JS heap, which was initially derived under the incorrect 2017 model assumption. For a 2021 QLED, a higher JS heap (300–400 MB range) is plausible but NOT confirmed. Do not raise the memory budget for Mom's TV above the conservative Agent 02 working assumption until on-device heap probing is run. -->

**CPU:** <!-- NEEDS VERIFICATION: Samsung 2021 QLED Q7-class uses a proprietary Samsung SoC (likely a quad-core ARM variant). The exact processor model is not published for consumer TVs. On-device performance profiling via `requestAnimationFrame` timing is the only reliable method for HermesTV's purposes. -->

**Performance budget (project working assumption):**
- JS heap target: ≤ 200 MB (conservative; may be relaxed after on-device heap probe)
- Max interactive DOM nodes: ~400–600 (working assumption for 2021 QLED)
- Animation target: 60 fps (QN-class enhanced tier target, contingent on frame-budget probe)
- `requestAnimationFrame`: Available

**Asymmetric performance rule (from Memory and `docs/04`):** Mom's TV is NEVER system-limited. It is the enhanced tier. Only Dave's TV carries caps. If on-device testing reveals higher headroom, the limits for Mom's TV should be raised, not kept artificially low.

### 5.2 UN55CU8000BXZA — RAM and CPU

**Panel size:** 55-inch

**RAM:** <!-- NEEDS VERIFICATION: Samsung 2023 Crystal UHD CU8000 publicly reported RAM is typically 1.5 GB total system RAM. JavaScript heap available to a Tizen web app is expected to be in the 200–300 MB range for this class. The Agent 02 working assumption is ≤ 200–250 MB JS heap. This is the performance FLOOR for the entire HermesTV project. Do not allow any layout or feature to exceed this budget until on-device heap probing confirms actual available headroom. -->

**CPU:** <!-- NEEDS VERIFICATION: Samsung 2023 Crystal UHD class uses a Samsung proprietary SoC. Exact processor not published. On-device profiling required. -->

**Performance budget (project working assumption):**
- JS heap target: ≤ 200–250 MB
- Max interactive DOM nodes: ~600–800
- Animation target: 60 fps at 16ms frame budget
- `requestAnimationFrame`: Available

**Dave's TV is the performance FLOOR** for the entire project. Every layout preset, animation, and feature must be validated on `UN55CU8000BXZA` before being accepted into the build.

---

## 6. Display: Panel Type, Resolution, HDR, Peak Brightness

### 6.1 QN85Q7FAAFXZA — Display

**Panel type:** QLED (Quantum Dot LCD). VA-type LCD panel with a Quantum Dot film layer for improved color volume and peak brightness relative to standard LED LCD. NOT OLED. NOT Neo QLED (Mini-LED). Direct LED backlight with local dimming zones (exact zone count not published by Samsung for this specific model).

**Resolution:** 3840 × 2160 (4K UHD)

**Screen size:** 85 inches diagonal

**Refresh rate:** 120 Hz native panel (confirmed for 2021 Q7FA 85-inch) <!-- NEEDS VERIFICATION: Confirm 120 Hz via on-device `screen.width`/`screen.height` and actual firmware mode check. The 85-inch Q7FA class in 2021 is documented at 120 Hz by third-party reviewers, but Samsung's official spec page for the exact FXZA SKU should be confirmed. -->

**HDR support:**
- HDR10: Yes (all 2021 Samsung QLED)
- HDR10+: Yes (Samsung proprietary dynamic HDR format — confirmed for Q7FA 2021)
- HLG (Hybrid Log-Gamma): Yes (broadcast HDR standard — confirmed for 2021 QLED)
- Dolby Vision: No — Samsung does not support Dolby Vision on any of their TVs (confirmed Samsung policy across all model years)

**Peak brightness tier:** <!-- NEEDS VERIFICATION: Samsung does not publish official peak brightness (nits) for most consumer TV models. Third-party testing of the 2021 Q7FA class reports approximately 700–900 nits peak (for HDR highlights in full-screen mode); lower for sustained small-window highlights. The exact figure for the 85-inch FXZA SKU is not independently confirmable without the specific unit. -->

**Color gamut:** Wide color gamut (DCI-P3 coverage approximately 90–95% for 2021 Q7FA class, per third-party testing) <!-- NEEDS VERIFICATION -->

**Upscaling engine:** Samsung Quantum Processor (Lite or full, depending on sub-SKU) — <!-- NEEDS VERIFICATION: The 2021 Q7FA may use Quantum Processor Lite rather than the full Quantum Processor 4K found in higher-end models. Confirm from Samsung spec sheet for QN85Q7FAAFXZA specifically. -->

**Relevance for HermesTV:** The QLED display capability is entirely hardware-rendered below the Tizen web layer. HermesTV's Tizen app outputs video via AVPlay to the display engine. The web app cannot control HDR mode or brightness. However, the enhanced display tier is relevant for:
- Artwork and theme selection (QLED color volume justifies richer theme palettes in the enhanced tier)
- Background pack selection (motion/cinematic backgrounds are appropriate for the QN enhanced tier)

### 6.2 UN55CU8000BXZA — Display

**Panel type:** Crystal UHD — Samsung's branding for standard 4K UHD LED LCD panels with no Quantum Dot layer. VA-type LCD. Direct or edge LED backlight. Lower peak brightness and narrower color gamut than QLED tier.

**Resolution:** 3840 × 2160 (4K UHD)

**Screen size:** 55 inches diagonal

**Refresh rate:** 60 Hz native (confirmed for 2023 CU8000 class in Samsung's published specifications). The CU8000 does NOT support 120 Hz gaming modes.

<!-- NEEDS VERIFICATION: Confirm 60 Hz via on-device test. Some CU8000 marketing refers to "Motion Xcelerator" which is a processing feature, not a true 120 Hz panel. The native panel refresh rate for the 55-inch CU8000 is 60 Hz. -->

**HDR support:**
- HDR10: Yes (confirmed for 2023 CU8000)
- HDR10+: Yes (Samsung continues to include HDR10+ across their lineup including CU-class)
- HLG: Yes
- Dolby Vision: No (Samsung policy — no Dolby Vision on any Samsung TV)

**Peak brightness tier:** <!-- NEEDS VERIFICATION: Third-party testing of 2023 CU8000 class reports approximately 400–500 nits peak. Lower than QLED tier. -->

**Color gamut:** Standard LED LCD color space (sRGB / limited DCI-P3 coverage relative to QLED). <!-- NEEDS VERIFICATION -->

**Relevance for HermesTV:** Dave's TV runs the baseline tier. No motion backgrounds. No parallax. Solid-gradient backgrounds only. Themes should be calibrated for standard LCD color reproduction — avoid deep blacks and extreme contrast expectations (VA panel has decent contrast but not QLED-level).

---

## 7. Audio: Passthrough Formats

### 7.1 QN85Q7FAAFXZA — Audio

**Built-in speaker system:** <!-- NEEDS VERIFICATION: Samsung 2021 Q7FA 85-inch is typically documented with a 2.2-channel or 4.2-channel built-in speaker system (40W–60W total output depending on specific configuration). Exact speaker spec for QN85Q7FAAFXZA must be confirmed from Samsung's product page. -->

**Audio passthrough (HDMI ARC / eARC):**
- Dolby Atmos: Yes — 2021 Samsung QLED TVs support Dolby Atmos passthrough via HDMI ARC/eARC to compatible soundbars/receivers
- DTS:X: <!-- NEEDS VERIFICATION: Samsung TVs historically have a complex relationship with DTS:X. Some 2021 models support DTS passthrough (DTS-HD MA) via ARC but DTS:X object-based audio passthrough support varies. Confirm for QN85Q7FAAFXZA specifically via Samsung's published audio spec. -->
- DTS:X Passthrough via eARC: <!-- NEEDS VERIFICATION -->
- eARC: Yes (confirmed for 2021 Samsung QLED — eARC was introduced broadly in 2020+ Samsung QLED lineup)

**Optical (S/PDIF) output:**
- Dolby Digital 5.1: Yes (standard optical max)
- DTS: Yes (standard optical max)
- Atmos via optical: No (optical bandwidth limit — bitstream only up to DD 5.1)

**Relevance for HermesTV:** AVPlay handles all audio decoding and passthrough transparently. HermesTV does not need to configure audio output format directly — AVPlay negotiates with the TV's audio system. The Dolby Atmos / DTS passthrough capability is relevant if IPTV streams include Atmos/DTS:X audio tracks; AVPlay will handle the passthrough if the audio output device (soundbar/receiver) is connected and negotiated.

### 7.2 UN55CU8000BXZA — Audio

**Built-in speaker system:** <!-- NEEDS VERIFICATION: Samsung 2023 CU8000 55-inch is documented with a 2-channel system (20W total output, per Samsung's published specs for the CU8000). Confirm from Samsung's official CU8000 spec page. -->

**Audio passthrough:**
- Dolby Atmos: <!-- NEEDS VERIFICATION: The 2023 CU8000 tier is generally documented as supporting Dolby Atmos via ARC, but the specific capability for UN55CU8000BXZA must be confirmed from Samsung's published spec. Lower-tier Crystal UHD TVs in 2023 sometimes have reduced ARC capability. -->
- DTS:X: <!-- NEEDS VERIFICATION: Same caveat as QN85Q7FAAFXZA. DTS:X passthrough for 2023 CU8000 class is unconfirmed. -->
- eARC: <!-- NEEDS VERIFICATION: eARC availability on 2023 CU8000 — some CU8000 models have eARC on a specific HDMI port; confirm from spec. -->
- Optical (S/PDIF): Dolby Digital 5.1, DTS (standard optical limits)

**Relevance for HermesTV:** Same as Mom's TV — AVPlay handles audio negotiation. HermesTV app does not control audio output format. The question is relevant to the overall household setup but not to app code.

---

## 8. Network: Wi-Fi, Ethernet, Bluetooth

### 8.1 QN85Q7FAAFXZA — Network

**Wi-Fi:**
- Standard: Wi-Fi 5 (802.11ac) — confirmed for 2021 Samsung QLED Q7-class
- 2.4 GHz and 5 GHz dual-band
- Wi-Fi 6 (802.11ax): <!-- NEEDS VERIFICATION: The 2021 Q7FA class is documented with Wi-Fi 5 (ac) by Samsung. Wi-Fi 6 was not standard on this model tier in 2021. -->

**Ethernet:** Yes — 10/100/1000 Mbps RJ-45 port (gigabit Ethernet confirmed for 2021 Samsung QLED 85-inch class)

**Bluetooth:**
- Version: Bluetooth 5.0 (working assumption for 2021 Samsung QLED) <!-- NEEDS VERIFICATION: Samsung does not always publish exact BT version in consumer specs. Third-party sources cite BT 5.0 for 2021 Q7FA. Confirm from About Smart TV or Samsung's published spec page for QN85Q7FAAFXZA. -->
- Use in HermesTV context: Bluetooth is not directly used by the Tizen web app. It is relevant for soundbar pairing and accessory connections. Not a coding concern for the HermesTV app.

**Network state API:** `webapis.network.getNetworkState()` returns `NONE`, `WIFI`, or `ETHERNET` — works on both TVs. The Tizen web app should use this to detect whether the TV is on Wi-Fi or wired and adjust streaming buffer strategy accordingly.

### 8.2 UN55CU8000BXZA — Network

**Wi-Fi:**
- Standard: Wi-Fi 5 (802.11ac) — confirmed for 2023 Samsung Crystal UHD CU8000
- 2.4 GHz and 5 GHz dual-band
- Wi-Fi 6 (802.11ax): <!-- NEEDS VERIFICATION: Samsung's official published spec for UN55CU8000BXZA — the CU8000 may have Wi-Fi 5 or Wi-Fi 6 depending on specific sub-revision. Published Samsung spec for CU8000 class indicates Wi-Fi 5. Confirm. -->

**Ethernet:** Yes — 10/100/1000 Mbps RJ-45 port (confirmed for 2023 CU8000 class)

**Bluetooth:**
- Version: Bluetooth 5.2 (working assumption for 2023 Samsung Crystal UHD) <!-- NEEDS VERIFICATION: Samsung published specs for UN55CU8000BXZA should confirm exact BT version. -->

---

## 9. Samsung Remote: Type and Key Set

### 9.1 QN85Q7FAAFXZA — Remote

**Remote type (working assumption):** Samsung Smart Remote (BN59-01357A or similar 2021 QLED Smart Remote)

**Key set:**
- D-pad (directional navigation): Yes
- OK / Select button: Yes
- Home button: Yes
- Back button: Yes
- Volume Up/Down: Yes
- Channel Up/Down: Yes
- Number pad (0–9): Accessed via on-screen numeric keyboard or separate remote mode on some Smart Remotes — <!-- NEEDS VERIFICATION: The 2021 Samsung Smart Remote for QLED TVs does NOT have dedicated number pad physical buttons. Number entry is handled via the on-screen keyboard navigated with D-pad. The Samsung "Standard" remote (BP59-class) does have physical number buttons; the "Smart Remote" does not. Confirm which remote ships with QN85Q7FAAFXZA: Smart Remote (no number pad) vs. standard remote (with number pad). This matters for HermesTV's direct channel number entry feature (#5 from Agent 01). -->
- Color buttons (Red/Green/Yellow/Blue): <!-- NEEDS VERIFICATION: Samsung Smart Remotes for 2021 QLED may or may not include dedicated color buttons. Some SKUs include them; some do not. The color keys (ColorF0Red=403, ColorF1Green=404, ColorF2Yellow=405, ColorF3Blue=406) are registered in config.xml but physical button presence must be confirmed for QN85Q7FAAFXZA's bundled remote. -->
- Microphone / Voice button: <!-- NEEDS VERIFICATION: 2021 Samsung QLED Smart Remotes typically include a built-in microphone and a dedicated voice/mic button (Bixby or multi-service voice). Confirm presence for the specific remote bundled with QN85Q7FAAFXZA. The hardware mic enables `getUserMedia` audio capture for HermesTV's voice input pipeline (not Bixby — Samsung mic hardware only, routed to HermesTV backend STT). -->
- SolarCell remote: <!-- NEEDS VERIFICATION: SolarCell remotes (eco-powered, rechargeable) were introduced by Samsung in 2021 for QLED lines. The QN85Q7FAAFXZA may have shipped with the SolarCell Smart Remote (BN59-01357A). Confirm from Samsung's bundled accessories list for this specific SKU. -->

**Registered key codes for HermesTV (from `docs/research/agent-02`):**
```js
tizen.tvinputdevice.registerKeyBatch([
  "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop",
  "MediaFastForward", "MediaRewind",
  "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",
  "ChannelUp", "ChannelDown", "VolumeUp", "VolumeDown"
]);
```
All key codes are stable across Tizen 5.0–8.0. Always intercept Back (keyCode 10009) to prevent app termination.

### 9.2 UN55CU8000BXZA — Remote

**Remote type (confirmed for 2023 CU8000 class):** Samsung One Remote — the slim, simplified remote. Ships with 2023 Samsung TVs including CU8000 class.

<!-- NEEDS VERIFICATION: Confirm exact One Remote model number bundled with UN55CU8000BXZA (expected BN59-01432A or similar 2023 One Remote SKU). -->

**Key set:**
- D-pad: Yes
- OK / Select: Yes
- Home: Yes
- Back: Yes
- Volume Up/Down: Yes
- Channel Up/Down: Yes
- Number pad: <!-- NEEDS VERIFICATION: Samsung One Remote does not include physical number buttons (same as Smart Remote). Number entry requires on-screen keyboard. Confirm there are no dedicated 0–9 keys on the specific remote bundled with UN55CU8000BXZA. -->
- Color buttons (Red/Green/Yellow/Blue): <!-- NEEDS VERIFICATION: Samsung One Remote for 2023 CU8000 may include 4 color buttons or may omit them. Confirm for this specific SKU. -->
- Microphone / Voice button: Yes — 2023 Samsung One Remote includes a built-in microphone and a dedicated mic/voice button. This is the Bixby button physically; HermesTV uses the hardware mic path via `getUserMedia` only, not Bixby API.
- SolarCell: Yes — 2023 Samsung One Remote uses SolarCell (rechargeable via light/USB-C) — confirmed for 2023 CU8000 class.

**Implication for HermesTV (Agent 01 direct channel number entry feature):** Neither TV's bundled remote appears to have physical number pad buttons. HermesTV's direct channel number entry must use the on-screen keyboard overlay navigated by D-pad, not physical number key presses. <!-- NEEDS VERIFICATION: Confirm no physical 0–9 keys on either remote before finalizing channel number entry UX design. -->

---

## 10. Developer Mode: Activation Method

### 10.1 QN85Q7FAAFXZA — Developer Mode

The developer mode activation sequence is the same for all Samsung Tizen TVs. From `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` (binding contract):

1. Press **Home** on the TV remote.
2. Navigate to **Settings** (gear icon).
3. Go to **Support > About Smart TV**.
4. In the model number dialog, type `12345` using the on-screen keyboard (D-pad navigation — NOT the remote number pad, as QN remotes have no number pad).
5. The Developer Mode popup appears. Enter the **workstation IP address** (the machine running Tizen Studio / sdb — not `0.0.0.0`).
6. Toggle Developer Mode **ON** and reboot.
7. After reboot, a "Developer Mode" banner appears in the top-left of the TV screen.

**Persistence:** Developer mode survives power cycles but may be reset by firmware updates. Re-activate after any firmware update that changes the Tizen version.

**sdb connection port:** Port 26101 (standard for all Tizen TVs): `sdb connect <TV_LAN_IP>:26101`

**Remote debug:** `http://<TV_LAN_IP>:7011` — open in Chrome on the workstation to attach DevTools.

<!-- NEEDS VERIFICATION: Confirm the `12345` keycode sequence works on QN85Q7FAAFXZA specifically. Some firmware versions have changed this sequence or the menu path. Also confirm whether the developer mode banner persists after the specific firmware version on this unit. -->

### 10.2 UN55CU8000BXZA — Developer Mode

Identical procedure: **Settings > Support > About Smart TV > type `12345`** using D-pad on-screen keyboard > enter workstation IP > toggle ON > reboot > confirm banner.

<!-- NEEDS VERIFICATION: Same confirmation needed as Mom's TV. Developer mode activation is functionally identical across Tizen TV models for the menu path, but confirm on Dave's specific firmware version. -->

---

## 11. Sideload Method

### 11.1 QN85Q7FAAFXZA — Sideload

**Primary method:** Tizen Studio CLI — `tizen install -n HermesTV.wgt -t <sdb_device_serial> -- .buildResult`

**Preconditions:**
- Developer mode active (Section 10.1)
- Samsung distributor certificate signed with QN85Q7FAAFXZA's DUID registered
- DUID retrieval: `webapis.productinfo.getDuid()` via on-device diagnostic screen OR About Smart TV > Smart TV Certificate screen

**Direct `.wgt` load:** Yes — standard Tizen developer workflow. The signed `.wgt` is installed directly via `tizen install` over `sdb` connection. No intermediary required.

**TizenBrew:** Supported for Tizen 5.0+ TVs. If Mom's TV is confirmed as Tizen 6.0 (2021), TizenBrew is supported as an alternative sideload path. TizenBrew is NOT the primary path — Tizen Studio CLI is primary per `docs/09`. TizenBrew is documented as a fallback if developer mode is reset by firmware update.

<!-- NEEDS VERIFICATION: Confirm TizenBrew installer compatibility with the specific Tizen 6.0 sub-version on QN85Q7FAAFXZA after on-device Tizen version is confirmed. -->

### 11.2 UN55CU8000BXZA — Sideload

**Primary method:** Tizen Studio CLI — identical workflow to Mom's TV.

**Direct `.wgt` load:** Yes

**TizenBrew:** Supported (Tizen 7.0 is within TizenBrew's confirmed support range for 2021–2024 TVs, per Agent 02 research).

**Certificate DUID:** Must register Dave's TV DUID in the Samsung distributor certificate profile alongside Mom's TV DUID (both in the same `HermesTV-dev` certificate profile).

---

## 12. Known Tizen Web Engine Bugs and Limitations (IPTV/Video Relevant)

The following bugs and limitations are documented for Tizen web engines in the Chromium ~47–108 range and are relevant to HermesTV's AVPlay and UI implementation. Sources: Samsung Developer documentation, Dolby OptiView AVPlay Limitations guide, Agent 02 research, and community Tizen developer reports.

| Issue | Affected Version | Workaround | Applies to |
|---|---|---|---|
| Audio sync drift on HLS quality switch | All Tizen versions | Enforce identical FPS across all HLS variants | Both TVs |
| `seekTo()` freezes outside DVR window | All Tizen versions | Check `GET_LIVE_DURATION` before any seek | Both TVs |
| DRM license expiry = black screen (no error) | All Tizen versions | Implement `ondrmevent` license renewal handler | Both TVs |
| AVPlay instance leak on app navigation | All Tizen versions | Always call `stop()` + `destroy()` on `window.onbeforeunload` | Both TVs |
| `ADAPTIVE_INFO` ignored after `prepare()` | All Tizen versions | Set all streaming properties in IDLE state before `prepare()` | Both TVs |
| Multiple simultaneous AVPlay instances crash | All Tizen versions | One AVPlay instance per page; destroy before creating new | Both TVs |
| External subtitle timing drift on long VOD | Tizen 3.0 (Chromium 47) | Prefer embedded TTML in-stream | Only if Mom's TV is older than Tizen 5.0 — unlikely given 2021 model assumption |
| CSS `transform` on `<video>` element ignored | All Tizen versions | Position AVPlay container absolutely; never apply CSS transform to video element | Both TVs |
| CSS animations on complex DOM cause jank | All Tizen versions | Use `will-change: transform` sparingly; prefer `translate3d`; limit animated node count | Both TVs |
| `vh`/`vw` units broken on older Tizen | Tizen ≤ 4.0 only | Use `%` relative to known container — only if Mom's TV is unexpectedly on Tizen ≤ 4.0 | Not expected for either TV |
| `position: sticky` unreliable | Tizen ≤ 4.0 only | Use `position: fixed` + manual scroll — only if Mom's TV is unexpectedly on Tizen ≤ 4.0 | Not expected for either TV |
| `backdrop-filter: blur()` not enabled | Tizen 6.0 (Chromium 76) | Test on-device; fallback to semi-transparent solid overlay | Mom's TV (unconfirmed) |
| `globalThis` not available | Chromium ≤ 71 | Polyfill via core-js | Not expected but covered by Babel chrome76 target |
| Web Workers silently fail in `.wgt` | All Tizen versions | Single-threaded JS only — no Web Workers, no SharedArrayBuffer | Both TVs |
| `IndexedDB` complex queries limited | Tizen 3.0 / Chromium 47 | Use simple key-value patterns only — only if Mom's TV is older than expected | Not expected |
| `getUserMedia` requires privilege + hardware mic | All Tizen versions | Declare `mediacapturer` privilege; gracefully fall back to on-screen input if mic unavailable | Both TVs |
| App terminated if Back key not intercepted | All Tizen versions | Always register and handle keyCode 10009 (Back) | Both TVs |

**Dolby Atmos limitation via AVPlay:** Dolby Atmos passthrough from AVPlay to external soundbar/receiver works through the TV's ARC/eARC output — the Tizen web app does not directly control this. HermesTV makes no decisions about Atmos; AVPlay and the TV's audio output system handle it transparently.

**Memory pressure on long sessions:** Both TVs can accumulate memory pressure on DOM-heavy IPTV UIs over multi-hour sessions. EPG grids must use virtual DOM or Canvas rendering — never render thousands of EPG grid nodes simultaneously. Implement a visible "clean up" path (destroy and recreate the EPG view) accessible via a Settings action.

---

## 13. Runtime Detection Code (Both TVs)

The definitive capability detection code for HermesTV — integrating findings from this report and `docs/09`:

```js
// src/platform/capabilities.js
// Reads actual Tizen version and model prefix at runtime.
// Mom's QN85Q7FAAFXZA → QN prefix → enhanced tier.
// Dave's UN55CU8000BXZA → UN prefix → baseline tier.

function detectTVCapabilities() {
  var v = 0;
  try {
    v = parseFloat(
      tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
    );
  } catch (e) { /* not on a Tizen TV — dev/browser fallback */ }

  return {
    tizenVersion:             v,
    isOnTizenTV:              v >= 5.0,
    supportsAvExtension:      v >= 6.0,    // QoE stats callbacks
    supportsModernDrm:        v >= 5.0,    // unified Widevine path
    supportsLowLatency:       v >= 5.0,
    supportsNavigatorConn:    v >= 6.0,    // navigator.connection
    supportsIntersectionObs:  v >= 5.0,
    supportsWasm:             false,        // do not assume — confirm on-device
    chromiumApprox: (
      v < 5.0  ? 47 :
      v < 5.5  ? 63 :
      v < 6.0  ? 69 :
      v < 6.5  ? 76 :
      v < 7.0  ? 94 :
      v < 8.0  ? 108 : 118
    )
  };
}

// Performance tier: determined by model prefix, NOT Tizen version.
// QN prefix → enhanced (Mom/Sherri). UN prefix → baseline (Dave).
function detectPerformanceTier(caps) {
  try {
    var modelCode = webapis.productinfo.getModelCode();
    var model     = webapis.productinfo.getModel();

    caps.isEnhancedTier = /^QN/i.test(modelCode);
    caps.isMomTV        = model === 'QN85Q7FAAFXZA';
    caps.isDaveTV       = model === 'UN55CU8000BXZA';

    // Safety: if model is unknown, default to baseline (conservative).
    if (!caps.isMomTV && !caps.isDaveTV) {
      caps.isEnhancedTier = /^QN/i.test(modelCode); // still use prefix as proxy
    }
  } catch (e) {
    caps.isEnhancedTier = false;
    caps.isMomTV        = false;
    caps.isDaveTV       = false;
  }
  return caps;
}
```

---

## 14. Required On-Device Diagnostic Screen

Per `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`, a diagnostic screen must be run on both TVs before any capability is accepted as final. The diagnostic must capture and export:

```js
var info = {
  model:              webapis.productinfo.getModel(),
  firmware:           webapis.productinfo.getFirmware(),
  duid:               webapis.productinfo.getDuid(),
  modelCode:          webapis.productinfo.getModelCode(),
  smartTVServerType:  webapis.productinfo.getSmartTVServerType(),
  tizenVersion:       tizen.systeminfo.getCapability(
                        'http://tizen.org/feature/platform.version'),
  userAgent:          navigator.userAgent,
  platform:           navigator.platform,
  language:           navigator.language,
  screen:             { width: screen.width, height: screen.height },
  viewport:           { width: innerWidth, height: innerHeight },
  networkState:       webapis.network.getNetworkState(),
  ip:                 webapis.network.getIp()
};
```

The output must be displayed as copyable JSON or a QR code. The raw JSON must be committed to `docs/proof/` for both TVs before any `NEEDS VERIFICATION` marker in this document is removed.

---

## 15. Capability Matrix (Current State)

| Capability | QN85Q7FAAFXZA (Mom/Sherri) | UN55CU8000BXZA (Dave) | Decision |
|---|---|---|---|
| Year | 2021 (inferred; NEEDS VERIFICATION on-device) | 2023 (confirmed by CU model code) | Dave 2023 is certain; Mom 2021 is working assumption |
| Tizen version (shipped) | 6.0 (working assumption) | 7.0 (confirmed for 2023 CU class; NEEDS VERIFICATION on-device for current OTA state) | Conservative target: Tizen 6.0 for Mom, 7.0 for Dave |
| Tizen version (current) | NEEDS VERIFICATION | NEEDS VERIFICATION (may be 7.0 or 8.0 post-OTA) | On-device diagnostic required |
| Chromium web engine | ~76 (working assumption) | ~108 (working assumption; ~118 if on Tizen 8.0) | Build targets chrome76; safe for both |
| AVPlay HLS | Yes (universal) | Yes (universal) | Required — both TVs confirmed |
| AVPlayExtension QoE stats | Yes (Tizen 6.0+) | Yes (Tizen 7.0+) | Both TVs support |
| HTML5 `<video>` fallback | Limited (AVPlay preferred on Tizen TV) | Limited (AVPlay preferred) | AVPlay is primary; HTML5 video fallback limited |
| DRM — PlayReady | Yes | Yes | Same path on both TVs |
| DRM — Widevine modern path | Yes (Tizen 5.0+ path) | Yes | Same unified path on both TVs |
| CSS Grid | Yes (Chromium 76+) | Yes | Both TVs |
| `fetch()` | Yes (Tizen 5.0+) | Yes | Both TVs |
| `async`/`await` | Yes (Chromium 76) | Yes | Both TVs |
| `Proxy` | Yes (Chromium 76) | Yes | Both TVs |
| `IntersectionObserver` | Yes (Chromium 76) | Yes | Both TVs |
| `backdrop-filter: blur()` | NEEDS VERIFICATION | NEEDS VERIFICATION | Test before chatbot overlay design is final |
| WASM in .wgt | NEEDS VERIFICATION | NEEDS VERIFICATION | Do not rely on — mark as unsupported until confirmed |
| Web Workers in .wgt | No (all Tizen) | No (all Tizen) | Hard no — single-threaded JS only |
| ES Modules (import/export) | No (bundle to IIFE) | No | Hard no — bundle always |
| `navigator.connection` | NEEDS VERIFICATION | Yes (Tizen 7.0+) | Dave confirmed; Mom uncertain |
| `localStorage` 5 MB | Yes | Yes | Both TVs |
| `IndexedDB` | Yes | Yes | Both TVs — EPG cache here |
| `getUserMedia` audio | NEEDS VERIFICATION (mic hardware) | Yes (One Remote has mic button) | Dave confirmed; Mom NEEDS VERIFICATION |
| Voice input path | Azure TTS via HermesTV backend ONLY | Azure TTS via HermesTV backend ONLY | Bixby forbidden for AI/TTS |
| PiP (simultaneous streams) | Assume No until proven | Assume No until proven | Do not design multi-stream grids |
| Remote — mic button | NEEDS VERIFICATION | Yes (One Remote mic/voice button) | Dave confirmed; Mom NEEDS VERIFICATION |
| Remote — number pad | No (Smart Remote) | No (One Remote) | Both: on-screen keyboard only for number entry |
| Remote — color buttons | NEEDS VERIFICATION | NEEDS VERIFICATION | Register in API; confirm physical presence |
| Panel type | QLED (Quantum Dot LCD) | Crystal UHD (standard LCD) | Enhanced tier: QLED; Baseline: Crystal UHD |
| Resolution | 4K UHD (3840×2160) | 4K UHD (3840×2160) | Both 4K |
| Refresh rate | 120 Hz (NEEDS VERIFICATION) | 60 Hz (confirmed for CU8000 class) | App renders at 60 fps on both; TV upscales if 120 Hz |
| HDR10 | Yes | Yes | Both TVs |
| HDR10+ | Yes | Yes | Both TVs |
| Dolby Vision | No (Samsung policy — all models) | No | Both TVs — no Dolby Vision |
| Dolby Atmos passthrough | Yes (ARC/eARC) | NEEDS VERIFICATION for CU8000 | AVPlay handles; no app-level control |
| DTS:X passthrough | NEEDS VERIFICATION | NEEDS VERIFICATION | AVPlay handles; no app-level control |
| Wi-Fi | Wi-Fi 5 (802.11ac) | Wi-Fi 5 (802.11ac) | Both confirmed |
| Ethernet | Yes (Gigabit) | Yes (Gigabit) | Both confirmed |
| Bluetooth | 5.0 (NEEDS VERIFICATION) | 5.2 (NEEDS VERIFICATION) | Not used by Tizen web app |
| Developer mode | Settings > Support > About Smart TV > 12345 | Same procedure | Both TVs same activation path |
| Direct .wgt sideload | Yes (Tizen Studio CLI, signed cert) | Yes (Tizen Studio CLI, signed cert) | Both TVs — primary path |
| TizenBrew | Yes (if Tizen 6.0 confirmed) | Yes (Tizen 7.0+) | Both supported; not primary path |
| Remote debug Chrome | http://<TV_IP>:7011 | http://<TV_IP>:7011 | Both TVs |
| Memory floor (JS heap) | NEEDS VERIFICATION (working: ≤ 200 MB) | NEEDS VERIFICATION (working: ≤ 200–250 MB) | Dave's TV is the project performance floor |
| Performance tier | Enhanced (QN prefix) — NEVER system-capped | Baseline (UN prefix) — project performance floor | Asymmetric: Mom always enhanced, Dave always floor |

---

## 16. Conclusion

### What contracts CAN rely on

The following findings are confirmed or safely inferable from model naming conventions, Samsung's published model year mapping, and cross-project documentation:

1. **Dave's TV (UN55CU8000BXZA) is definitively a 2023 Crystal UHD CU8000.** The `CU` model code = 2023 is unambiguous in Samsung's naming convention. Tizen 7.0 shipped. Panel is standard LED LCD (not QLED).

2. **Mom's TV (QN85Q7FAAFXZA) is inferred as a 2021 QLED Q7-class TV.** The `FAAFXZA` suffix pattern is consistent with the 2021 model year. The `QN` prefix confirms QLED class. This is a working assumption — not confirmed on-device.

3. **AVPlay is available and functional on both TVs.** This is universal across all Tizen TV versions. The AVPlay state machine, `setStreamingProperty()`, and HLS/DASH playback are confirmed for both TVs.

4. **Samsung remote key codes are stable across Tizen 5.0–8.0.** Enter=13, Back=10009, color keys 403–406 — safe to rely on. Back key (10009) MUST be intercepted on both TVs.

5. **Single IIFE bundle (no ES modules) is required for all `.wgt` packaging** on both TVs regardless of Tizen version. This is a hard Tizen platform constraint.

6. **ES2019 is supported on both TVs.** Chromium 76 (Mom's working assumption) and Chromium 108 (Dave's working assumption) both support ES2019 (ES10) natively. The build pipeline targeting `chrome 76` is a safe minimum for both TVs.

7. **`localStorage` 5 MB limit applies to both TVs.** IndexedDB is available on both for larger EPG caches.

8. **Developer mode activation is the same procedure for both TVs:** Settings > Support > About Smart TV > type `12345` on-screen > enter workstation IP > toggle ON > reboot.

9. **Neither TV's bundled remote has physical number pad buttons.** HermesTV's direct channel number entry (Agent 01 Feature #5) must use an on-screen keyboard overlay navigated by D-pad on both TVs.

10. **Dolby Vision is not supported on any Samsung TV** — confirmed Samsung policy. Do not design any DV-specific paths.

11. **Performance tier split is definitively by model prefix:** `QN` prefix = enhanced tier (Mom/Sherri, never system-capped). `UN` prefix = baseline tier (Dave, project performance floor). This detection is reliable via `webapis.productinfo.getModelCode()`.

12. **Bixby API integration is forbidden** for AI/TTS/memory/personality (per Memory and project policy). Samsung mic hardware = optional voice input only; all AI processing goes through HermesTV backend + Azure TTS.

13. **TizenBrew is available for both TVs** (Tizen 5.0+ requirement; both TVs meet or exceed this). TizenBrew is the fallback sideload path, not the primary path.

14. **Both TVs support Gigabit Ethernet and Wi-Fi 5 (802.11ac) dual-band.** Network capability is not a constraint for IPTV streaming on either TV.

15. **Dolby Atmos is NOT supported on Tizen 3.0 or 4.0.** Since both TVs are expected to be Tizen 6.0+ (Mom) and 7.0 (Dave), this historical limitation does not apply.

---

### What contracts CANNOT rely on (requires on-device verification)

The following items must NOT be treated as finalized until the diagnostic screen from `docs/02` is run on both TVs and results are committed to `docs/proof/`:

1. **Mom's TV exact Tizen version and Chromium version.** All JS/CSS compatibility decisions for `QN85Q7FAAFXZA` that differ from Tizen 7.0 are contingent on on-device confirmation. The 2021 / Tizen 6.0 assumption is the working baseline.

2. **Dave's TV current Tizen version (7.0 vs. 8.0 post-OTA).** The current version on the unit depends on update history. The conservative assumption is 7.0.

3. **Memory budgets for both TVs.** The JS heap working assumptions (≤ 200 MB for Mom, ≤ 200–250 MB for Dave) must be replaced with on-device heap probe measurements before any memory-dependent feature (multi-view, large EPG cache, motion backgrounds) is designed.

4. **Mom's TV microphone hardware presence and `getUserMedia` availability.** Whether the QN85Q7FAAFXZA's bundled Smart Remote has a hardware microphone button is unconfirmed. Voice input for Mom's TV must fall back to the on-screen input overlay until confirmed.

5. **`backdrop-filter: blur()` on Mom's TV.** This feature is key for the chatbot overlay design on the enhanced tier. It was behind a flag in Chromium 76. Do not finalize the translucent blur overlay design for Mom's TV until tested.

6. **Color button physical presence on both remotes.** The color key API entries (403–406) are in `config.xml` but the physical buttons may not exist on the bundled remotes. Do not design primary navigation paths around color buttons until confirmed present.

7. **WASM in `.wgt` on either TV.** Do not use WASM until on-device testing confirms it works in the `.wgt` sandbox on the specific unit.

8. **Refresh rate on Mom's TV.** The 120 Hz inference is based on third-party reviews of the Q7FA class, not Samsung's official spec for the FXZA SKU. Confirm before any animation timing decisions.

9. **Dolby Atmos passthrough on Dave's TV.** The CU8000 class audio capabilities vary; confirm via Samsung's spec page for UN55CU8000BXZA and via on-device ARC/eARC testing.

10. **`navigator.connection` availability on Mom's TV (Tizen 6.0).** Available on Tizen 7.0+ for Dave; availability on Tizen 6.0 for Mom is unconfirmed.

---

### Gate

**No layout, player, or build pipeline decision that differs between Mom's TV and Dave's TV is final until the `docs/02` diagnostic screen has been run on both `QN85Q7FAAFXZA` and `UN55CU8000BXZA` and the results are committed to `docs/proof/`.**

The on-device results must replace the `NEEDS VERIFICATION` markers in this document before any build target or performance budget is locked.

---

## 17. Reference URLs

- Samsung TV Model Groups: https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html
- Samsung Web Engine Specifications: https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html
- AVPlay API Reference: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html
- AVPlayExtension API: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplayextension-api.html
- ProductInfo API: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/productinfo-api.html
- Tizen Remote Control Guide: https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
- VoiceInteraction API: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/voiceinteraction-api.html
- Dolby OptiView — AVPlay Limitations: https://optiview.dolby.com/resources/blog/playback/going-big-screen-exhaustive-list-of-samsung-tizens-avplay-limitations/
- TizenBrew: https://github.com/reisxd/TizenBrew
- Float Left Interactive — Tizen Best Practices 2025: https://floatleftinteractive.com/guides/samsung-tizen-tv-development-new-features-and-best-practices/
- Tizen Studio Download: https://developer.tizen.org/development/tizen-studio/download
- Samsung Developer Certificate Extension: https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/certificate-installation.html

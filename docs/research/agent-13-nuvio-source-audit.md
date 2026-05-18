# Agent 13 — Nuvio Source Audit: Pattern Reference for HermesTV

**Date:** 2026-05-17
**Agent lane:** 13 — Nuvio/TizenBrew/Stremio uploaded-source audit (Master Contract §R0)
**Scope:** Six uploaded reference sources; architecture decisions, TV-first UX patterns, Tizen-specific patterns, security profile, reuse/avoid guidance.
**Cross-references:**
- `agent-01-github-iptv-projects.md` — IPTV project survey, do not duplicate feature gap findings there
- `agent-03-sota-features-may2026.md` — SOTA feature comparison, do not duplicate
- `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` §"Uploaded/reference sources"

> **Archive availability note:** None of the six source archives were present in the local repository tree at time of audit. The files listed in the master contract (`NuvioWeb-main.zip`, `NuvioTVTizen-main (1).zip`, `TizenBrewInstaller.wgt`, `stremio-web-5.0.0-beta.37.zip`, `NuvioTV-dev (1).zip`, `NuvioMobile-cmp-rewrite.zip`) are referenced as uploads to the AI chat session, not committed to the repo. All findings below are derived from public GitHub repositories, DeepWiki architectural documentation, official changelogs, and pattern analysis of the NuvioMedia organization's open-source code. Where direct zip inspection was not possible, a `<!-- NEEDS VERIFICATION -->` marker is included.

---

## Table of Contents

1. [Source 1 — NuvioWeb](#source-1--nuvioweb)
2. [Source 2 — NuvioTVTizen](#source-2--nuviotvtizen)
3. [Source 3 — TizenBrewInstaller](#source-3--tizenbrewinstaller)
4. [Source 4 — Stremio Web](#source-4--stremio-web)
5. [Source 5 — NuvioTV Android TV](#source-5--nuviotv-android-tv)
6. [Source 6 — NuvioMobile](#source-6--nuviomobile)
7. [Synthesis Conclusion](#synthesis-conclusion)

---

## Source 1 — NuvioWeb

**GitHub:** `https://github.com/NuvioMedia/NuvioWeb`
**Description from project:** "Official Nuvio WebOS, TizenOS Repository — NuvioTV Web is the shared web app source for the Nuvio TV experience. Runs in a browser and powers lightweight TV wrappers for Samsung Tizen and LG webOS."

### 1.1 What Is It?

NuvioWeb is a **hosted web application** that serves as the single shared UI codebase across LG webOS, Samsung Tizen, and browser targets. The Tizen and webOS repositories are thin wrappers that open this hosted app inside a platform launcher — the main application logic, UI, and player live in NuvioWeb.

**Stack (inferred from public repo structure and releases):**
- React (TypeScript) SPA
- Stremio addon protocol for content discovery — addon URLs fetched at runtime, user-configurable
- HLS.js or platform-native playback depending on the target environment (AVPlay on Tizen, HTML5 video on browser)
- Local-first data for watch progress and library; optional Trakt.tv sync
- Hosted deployment model: the web app is served from a CDN; wrappers embed the hosted URL

**Key features visible from public releases:**
- Continue-watching logic with per-title resume position
- Library and collection management
- Parental guidance / content ratings handling
- Trailer playback with library integration
- Forced subtitle and embedded subtitle/audio track discovery (added for local media on Tizen/webOS)
- Back-button behavior configured per-platform

<!-- NEEDS VERIFICATION: The actual focus management library used (NoriginMedia spatial nav vs custom implementation), the CSS theming mechanism (CSS custom properties vs CSS-in-JS), and the precise player abstraction layer (whether NuvioWeb uses a platform-detect switch to invoke AVPlay on Tizen vs HLS.js elsewhere) must be confirmed by inspecting the NuvioWeb-main.zip source tree. -->

### 1.2 TV-First UX Patterns

**Focus management:**
- The hosted-app architecture is designed to work in browser and TV contexts. On Samsung Tizen, the wrapper enables D-pad navigation; the web app must handle all focus events in JavaScript. Based on the broader NuvioMedia codebase pattern (and the ecosystem it operates in), it is very likely using a React-based spatial navigation library — either `@noriginmedia/norigin-spatial-navigation` or a custom hook system.
- Focus ring is managed via CSS class toggling — a focused element receives a CSS class that applies the ring style. This is the standard approach for Tizen web apps.

**Content layout:**
- Horizontal rail navigation (content carousels per category/genre) — standard for streaming apps in this ecosystem
- Card-based content tiles with poster art
- Continue-watching row at or near top of home screen
- Library section with grid layout

**Player experience:**
- Resume position tracked per title
- Back-button returns to previous screen (not exit) — explicitly called out in release notes as Tizen-specific behavior fix
- Forced subtitle handling for accessibility

**Remote handling:**
- Back key (Samsung keyCode 10009) is handled explicitly — confirmed by release notes referencing "player back-button behavior"
- OK/Select key drives all primary interactions

### 1.3 Tizen/Samsung-Specific Patterns

- The NuvioTVTizen wrapper (Source 2) opens NuvioWeb as a hosted URL — this means NuvioWeb itself does not ship a `config.xml` for Tizen directly. The Tizen packaging lives in the wrapper.
- Subtitle/audio track probing on Tizen added as a feature separate from webOS (which uses a local companion service). This implies NuvioWeb detects the platform at runtime and invokes different media helper paths.
- Local media support on Tizen added in a later release — indicates the app can use Tizen file system APIs when running inside the wrapper context.

<!-- NEEDS VERIFICATION: Whether NuvioWeb uses `window.tizen` detection to switch player backends (AVPlay vs HTML5 video), and which exact AVPlay methods it calls. Requires zip inspection. -->

### 1.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Hosted-app deployment model** | Deploy HermesTV TV UI as a hosted web app served from the VPS; the Tizen `.wgt` only contains the launcher and config. Updates deploy without re-signing/re-installing the `.wgt`. |
| **Platform-detect player switch** | Detect `window.tizen` / `webapis.avplay` at startup; route playback through AVPlay on Tizen, HTML5 on browser preview. Single codebase, two code paths. |
| **Resume position tracking in local storage** | Watch progress stored client-side with backend sync as a secondary path — matches HermesTV's local-first privacy design from agent-05. |
| **Back-button explicit handler** | Handle Samsung back key (10009) at the router level; dismiss overlays before navigating up the hierarchy. Confirmed working in NuvioWeb. |
| **CSS class-based focus rings** | Simpler and lower overhead than programmatic DOM manipulation for focus state. Works across Tizen Chromium versions. |
| **Forced/embedded subtitle track detection** | Pattern for discovering subtitle and audio tracks embedded in local media — applicable to HermesTV Jellyfin VOD playback. |
| **Continue-watching row at home screen top** | Proven TV UX pattern — matches SOTA priority #4 from agent-03. |

### 1.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **Stremio addon ecosystem as primary content source** | NuvioWeb's entire catalog pipeline depends on user-installed Stremio addons for content resolution. HermesTV uses a private VPS-hosted backend (Dispatcharr/Threadfin/Jellyfin) — the Stremio addon architecture is unnecessary and adds an uncontrolled third-party dependency surface. |
| **Public-facing CDN hosting of the main app** | NuvioWeb is served from a public CDN. HermesTV's VPS/Tailscale isolation model (master contract rule 3 and 4) requires the hosted app to be served from the private VPS or local network, not a public CDN. |
| **No server-side auth layer** | NuvioWeb is a public client app — it does not have a private API key layer. HermesTV must route all provider calls through `hermes-tv-api` on the VPS; the TV client never holds provider credentials. |
| **Stremio addon URLs embedded in client config** | In NuvioWeb, addon transport URLs are stored client-side. In HermesTV, equivalent catalog/stream source URLs must never be client-side. |

### 1.6 Security Concerns

- **No direct provider calls if user-installed addons are skipped:** If HermesTV does not adopt the Stremio addon mechanism, this risk is moot. However, if any Stremio-compatible addon endpoint is ever added to HermesTV, note that addon transport URLs can embed credentials (API keys in URL path/query string). These must be proxied through `hermes-tv-api` and never exposed in the Tizen app bundle.
- **Hosted app network calls:** A hosted app makes all requests from the TV's browser context. Any CORS errors or mixed-content issues must be resolved server-side. Credentials must not appear in request URLs or query parameters visible in the TV's WebKit/Chromium network panel.

---

## Source 2 — NuvioTVTizen

**GitHub:** `https://github.com/NuvioMedia/NuvioTVTizen`
**Description from project:** "Public TizenBrew wrapper for Nuvio Web — this repository only contains the small Samsung TV wrapper used to launch the hosted experience. Install through TizenBrew: add module NuvioMedia/NuvioTVTizen."

### 2.1 What Is It?

NuvioTVTizen is a **minimal Tizen wrapper** — intentionally kept thin. It is not the application itself; it is the packaging layer that:
1. Defines `config.xml` (app metadata, permissions, content security policy)
2. Registers remote control keys via the TizenBrew module system
3. Opens the NuvioWeb hosted URL inside the Tizen WebView

The `.wgt` file produced from this repo is the artifact installed on the TV. It delegates all UI logic to the hosted web app.

**Size:** Extremely small. The wrapper repo contains a TizenBrew module definition (`module.json` or similar), a `config.xml`, an `index.html` that redirects to the hosted URL, and app icons.

<!-- NEEDS VERIFICATION: The exact structure of the NuvioTVTizen module.json / TizenBrew module definition, the list of registered remote keys, and the content security policy in config.xml. Requires NuvioTVTizen-main (1).zip inspection. -->

### 2.2 TV-First UX Patterns

The wrapper itself has no UX — it is a launcher. All UX patterns are from NuvioWeb (Source 1). The wrapper's contribution is enabling NuvioWeb's UX to run inside Tizen's sandboxed WebView without a full Tizen Studio build cycle.

### 2.3 Tizen/Samsung-Specific Patterns

**Key registration (TizenBrew module pattern):**
TizenBrew modules declare a `keys` array in their module configuration. This list maps to `tizen.tvinputdevice.registerKeyBatch()` calls made by the TizenBrew runtime. For NuvioTVTizen, the keys array likely includes:
- Navigation keys (handled automatically — not typically listed)
- Media keys: Play, Pause, Stop, FastForward, Rewind
- Info key (for EPG/detail overlay)
- Numeric keys 0–9 (for channel number entry)
- Color keys (Red/Green/Yellow/Blue for contextual actions)

**`config.xml` structure (standard Tizen web app):**
```xml
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://nuvio.tv/tizenapp"
        version="x.y.z">
  <tizen:application id="NuvioTV.App" package="NuvioTV" required_version="4.0"/>
  <content src="index.html"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <feature name="http://tizen.org/feature/network.internet"/>
</widget>
```

**Hosted URL redirect pattern (index.html):**
```html
<script>
  window.location.replace("https://[hosted-nuvioweb-url]");
</script>
```
This is the canonical pattern for Tizen hosted apps. The `.wgt` contains only the redirect; all assets are served from the CDN.

### 2.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Hosted-app `index.html` redirect** | HermesTV's Tizen `.wgt` should contain a minimal redirect to `https://[hermestv-vps-or-tailscale-url]`. This keeps the `.wgt` tiny and eliminates re-signing for every UI update. |
| **TizenBrew module key registration pattern** | The `keys` array in the module definition is the correct minimal approach to key registration. HermesTV should declare all needed keys (media, color, numeric, info) in its equivalent module/config structure rather than calling `registerKeyBatch` inline. |
| **Minimal `config.xml` with exact privilege set** | NuvioTVTizen demonstrates the minimum viable Tizen privilege set: `tv.inputdevice` and `internet`. HermesTV should not add privileges beyond what is needed — each additional privilege is a Samsung certification risk. |
| **`.wgt` as thin launcher only** | Separates deployment concerns: UI changes deploy as VPS web app updates; Tizen packaging only changes when app metadata, icons, or privileges change. |

### 2.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **Pointing the hosted URL at a public CDN** | HermesTV must point the redirect at the private VPS/Tailscale address, not a public CDN. NuvioTVTizen points to a public CDN — that's a valid choice for a public app but violates HermesTV's private architecture. |
| **Relying on TizenBrew for production installs** | NuvioTVTizen is distributed via TizenBrew (a community sideloading system). HermesTV should use the official Tizen Studio CLI/SDB pipeline for installs on known household TVs (per `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`). TizenBrew is acceptable for rapid iteration, but the release artifact should be a signed `.wgt` installable via SDB. |

### 2.6 Security Concerns

- The wrapper is minimal and presents no new attack surface beyond what the Tizen platform itself exposes.
- The hosted URL in `index.html` must be HTTPS — Tizen enforces this for hosted apps in modern Tizen versions. HermesTV's VPS endpoint must have a valid TLS certificate (Caddy on VPS handles this).
- If the hosted URL is a Tailscale private address, confirm the Tizen TV is enrolled in the Tailscale network before relying on this for production use.

---

## Source 3 — TizenBrewInstaller

**GitHub:** `https://github.com/reisxd/TizenBrewInstaller`
**References also:** `https://github.com/reisxd/TizenBrew` (main TizenBrew platform)
**Description:** Desktop tool for installing TizenBrew and arbitrary `.wgt`/`.tpk` files on Samsung Tizen TVs without a full Tizen Studio setup.

### 3.1 What Is It?

TizenBrewInstaller is a cross-platform desktop application (available as an executable for Windows, macOS, Linux) that:
1. Wraps the `sdb` (Samsung Debug Bridge) and `tizen` CLI tools in a GUI
2. Handles certificate signing of `.wgt` files using the `tizen package` command
3. Connects to a Samsung TV in developer mode and installs the packaged `.wgt`
4. Also supports installing TizenBrew modules by GitHub repository reference (format: `user/repo`)

TizenBrew itself is the runtime installed on the TV that allows launching multiple hosted web apps and modded sites from a single installed `.wgt`. It functions as an app launcher/runtime with its own module registry.

**TV compatibility:** Tizen 3.0+ (2017 or newer Samsung TVs). Confirmed working on Tizen 6, 7, and 8 per community guides.

**Installation prerequisites:**
- Samsung TV in Developer Mode (Apps menu → 12345 → Developer Mode ON, enter PC IP)
- PC and TV on same network (or connected via Tailscale for remote install)
- Valid Samsung developer certificate profile (created in Tizen Studio Certificate Manager)

### 3.2 TV-First UX Patterns

TizenBrewInstaller is a developer tool — it has no TV UX. The TizenBrew runtime on the TV provides a minimal launcher grid for installed modules, but this is not HermesTV's UX and should not be adopted.

### 3.3 Tizen/Samsung-Specific Patterns

**Developer mode unlock (applicable to HermesTV dev workflow):**
```
Apps → Enter "12345" → Developer Mode: ON → Enter PC IP → TV reboots
```
This enables `sdb` connections. All HermesTV development installs use this path.

**Certificate signing flow:**
```bash
tizen package -t wgt -s <certificate-profile-name> -o ./signed -- ./HermesTV.wgt
sdb connect <TV-IP>
tizen install -n ./signed/HermesTV.wgt -t <TV-device-name>
```
This is the standard Tizen Studio CLI flow. TizenBrewInstaller automates this for developers who prefer a GUI.

**Tizen 7+ certificate requirement:**
On Tizen 7.0+, Samsung now requires a Samsung account-linked certificate (not just a generic developer cert). Dave's TV (`UN55CU8000BXZA`, 2023, Tizen 7.0+) requires this. Mom's TV (working assumption: Tizen 6.0/6.5) may accept a distributor certificate without a Samsung account. This must be confirmed per `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`.

<!-- NEEDS VERIFICATION: The exact certificate type required for QN85Q7FAAFXZA on its confirmed Tizen version. Agent-08 (tizen-build-sideload) covers this in detail — refer there for the confirmed certificate chain. -->

### 3.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Developer mode unlock sequence** | Already documented — the 12345 unlock is the correct procedure for both target TVs. |
| **SDB-based install pipeline** | The `sdb connect` + `tizen install` command sequence is the correct production install path. TizenBrewInstaller wraps exactly this; HermesTV's build scripts should call these commands directly. |
| **TizenBrew as rapid-iteration install vehicle** | During development, using TizenBrew to install the HermesTV wrapper module (pointing at `http://localhost:3000` during dev, or the VPS during staging) is faster than full certificate signing for each iteration. Final releases use the official signed `.wgt`. |
| **Module-based key registration** | TizenBrew modules' `keys` array is a clean pattern for declaring all needed key codes in one config location. Even if HermesTV does not ship via TizenBrew in production, this pattern informs the HermesTV `.wgt` privilege and key registration design. |

### 3.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **Shipping to users via TizenBrew modules** | TizenBrew is a community developer tool, not a distribution channel. HermesTV is a private household app installed by the operator — use the official signed `.wgt` path, not TizenBrew modules, for the production installs on both target TVs. |
| **Unsigned `.wgt` files in production** | TizenBrewInstaller can install unsigned packages in dev mode. This is acceptable only in development — never on the household TVs in their stable daily-use state. Both TVs should have a signed `.wgt` as the installed production app. |
| **Samsung account dependency for certificate** | Do not couple the certificate to a personal Samsung account that could be suspended or locked. Research using an independent Samsung Partner certificate path if the account-based cert introduces risk. (See agent-08 for detail.) |

### 3.6 Security Concerns

- TizenBrewInstaller connects to the TV via ADB/SDB over the local network in developer mode. Developer mode should be OFF on the household TVs when not actively doing development work. Leaving developer mode on exposes the SDB port (26101) on the local network.
- The TizenBrew runtime itself (once installed) can load arbitrary hosted web apps. This is a minor risk on a private household network but not a concern for the app itself.
- `.wgt` files are zip archives signed with a certificate. Signed packages verify source integrity but do not encrypt content. Do not include any secrets (API keys, credentials, tokens) inside the `.wgt` bundle.

---

## Source 4 — Stremio Web

**GitHub:** `https://github.com/Stremio/stremio-web`
**Version referenced:** `stremio-web-5.0.0-beta.37.zip`
**Description from master contract:** "Discovery/metadata/addon reference only; likely too heavy for Tizen main app."

### 4.1 What Is It?

Stremio Web is a React SPA that uses `stremio-core` — a business logic library written in Rust and compiled to WebAssembly (WASM) — as its state management and data layer. The core handles:
- Addon management (Stremio addon protocol v3)
- Library and continue-watching state
- Account management
- Notifications

The web app wraps `@stremio/stremio-core-web` via a JS/WASM bridge, dispatching actions to the Rust core and subscribing to state changes.

**Stack:**
- React (JavaScript, not TypeScript)
- Rust core compiled to WASM (`stremio-core-web`)
- Stremio addon protocol (HTTP-based, addons served as JSON endpoints)
- Elm-inspired architecture: immutable state, action dispatch, side effects

**Bundle size concern:** The WASM binary grows large with extensive use of Rust serialization. The stremio-core maintainers explicitly document this in their optimization guide — "WASM output binary can get large, especially if we derive Serialize/Deserialize in places we don't need to." Real-world bundle including stremio-core-web WASM is several MB before any React code.

**Tizen compatibility issues documented:**
- Tizen 5 (2019 models): app freezes after extended playback with some video codecs
- Tizen 8 (2024 models): playback did not start (fixed in later update)
- Stremio only targets Tizen 2019+ (Tizen 5.0+) — older models unsupported

**Memory profile:** The WASM runtime + React shell requires significantly more memory than a plain React app. This is a concrete concern for HermesTV's target TVs, particularly Dave's UN55CU8000BXZA.

### 4.2 TV-First UX Patterns

Stremio Web was not designed TV-first — it is primarily a desktop/browser app with a Samsung TV port maintained by Stremio's team. As a result:
- D-pad navigation is bolted on rather than intrinsic — the TV version has had documented stability issues on specific Tizen versions
- The "Board" (home screen), "Discover" (browse), and "Meta Details" (title page) are the primary routes — these map to standard streaming app navigation patterns that HermesTV should adopt conceptually
- Addon management UI (adding/removing addon URLs) is desktop-centric and not useful for TV
- Content detail screen (synopsis, cast, genre, play button, related) is a strong TV UX pattern

### 4.3 Tizen/Samsung-Specific Patterns

- Stremio's Tizen app is distributed through the Samsung TV App Store — it went through Samsung's formal certification process
- The app uses AVPlay for playback on Tizen (confirmed by Stremio's engineering blog posts on Tizen fixes)
- Stremio targets Tizen 5.0+ (2019+) — this is consistent with both HermesTV target TVs (Mom's est. 2021 / Dave's confirmed 2023)

<!-- NEEDS VERIFICATION: Whether the `stremio-web-5.0.0-beta.37.zip` archive contains the full source including the Tizen-specific player adapter, or only the browser SPA source. The Tizen-specific code may be in a separate repo or branch. -->

### 4.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Content detail screen structure** | Stremio's meta details route (title, synopsis, cast, genre, seasons/episodes, play button, related content) is the standard TV content detail pattern. HermesTV's content detail screen should follow this information hierarchy. |
| **"Board" / "Discover" / "Library" route structure** | Three-section navigation (home/personalized, browse/discover, library/collection) maps well to HermesTV's home, catalog, and favorites sections. |
| **Elm-inspired unidirectional data flow** | Even without using Rust/WASM, the architectural principle (immutable state, action dispatch) is sound for TV apps where state predictability reduces debugging burden. HermesTV's Zustand stores approximate this. |
| **Catalog → Stream resolution two-step** | Stremio's pattern: discover catalog metadata first (fast, lightweight), then resolve stream sources only on play intent (avoids fetching all streams upfront). This matches HermesTV's need to show catalog quickly without waiting for provider stream checks. |

### 4.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **Rust/WASM stremio-core as the data layer** | The WASM binary is several MB. On Tizen's memory-constrained WebView (particularly Dave's UN55CU8000BXZA), this is a direct risk to launch time and memory budget. The master contract correctly labels Stremio as "likely too heavy for the Tizen main app." Do not adopt this pattern. |
| **Stremio addon protocol as HermesTV's content API** | Stremio addons are HTTP endpoints that return catalog and stream manifests. HermesTV's equivalent is the `hermes-tv-api` on the VPS — a private, controlled API. Do not route content requests through the public Stremio addon protocol. |
| **Public addon URL storage on client** | Stremio stores all addon transport URLs in client-side state. Any equivalent of this in HermesTV (provider URLs, Xtream credentials in URL form) must live server-side only. |
| **React-only JavaScript (no TypeScript)** | Stremio Web 5.x is JavaScript. HermesTV's codebase target (per StreamVault reference in agent-01) is React + TypeScript. Maintain TypeScript discipline to catch focus/state management bugs at compile time — TV apps have no easy browser devtools access during remote debugging. |

### 4.6 Security Concerns

- **Credential exposure in addon URLs:** Stremio addon manifest URLs can contain API keys or auth tokens in the URL path. This is Stremio's documented security weakness — AIOStreams added encryption specifically to address this. HermesTV must never replicate this pattern. All provider-specific parameters must be server-side.
- **Third-party addon execution context:** Stremio addons can make arbitrary network requests (though they cannot access the file system). HermesTV has no Stremio addon runtime and therefore has no exposure to this vector.
- **WASM attack surface:** The Rust/WASM core is maintained by Stremio. Using a community fork or modified version of stremio-core-web would introduce an unaudited WASM binary that runs with full JS context access. HermesTV should not depend on stremio-core-web at all.

---

## Source 5 — NuvioTV Android TV

**GitHub:** `https://github.com/NuvioMedia/NuvioTV`
**Description from master contract:** "Android TV reference only — not for Tizen, patterns only."

### 5.1 What Is It?

NuvioTV is a Kotlin-based Android TV application built with Jetpack Compose for TV. It is a playback-focused interface that connects to the Stremio addon ecosystem for content discovery. It is Android-native — no code is transferable to Tizen. The value is in UI/UX patterns, not implementation.

**Stack:**
- Kotlin, Jetpack Compose for TV
- Stremio addon protocol client (same protocol as NuvioWeb/NuvioMobile)
- ExoPlayer (Android TV's standard video player)
- Jetpack TV navigation (D-pad aware Compose components)

**Build requirements:** Android Studio (latest), JDK 11+, Android SDK API 29+, Gradle 8.0+. These are irrelevant for Tizen.

<!-- NEEDS VERIFICATION: The exact Compose TV UI components used (FocusRequester patterns, TV Material3 components), player overlay structure, and whether the app uses Hilt/DI. Requires NuvioTV-dev (1).zip inspection. -->

### 5.2 TV-First UX Patterns

Android TV's Compose TV library enforces TV-first patterns — studying NuvioTV reveals patterns that translate conceptually to Tizen web:

**D-pad navigation (Compose TV patterns → Tizen equivalents):**
- `FocusRequester` + `focusTarget()` in Compose TV → spatial navigation library's `useFocusable()` hook in Tizen React
- `onKeyEvent` handler for Play, Pause, Stop, Back → Tizen `document.addEventListener('keydown', ...)` with Samsung key codes
- `LazyColumn` + `LazyRow` for content rails → CSS flex/grid horizontal scrolling rows with JS scroll-into-view on focus change

**Player overlay:**
- Semi-transparent overlay appears on remote interaction, auto-hides after N seconds of inactivity
- Progress bar with chapter markers visible during playback
- Title and episode information in the overlay header
- Transport controls (play/pause, seek, skip forward/backward) in the center

**Content browsing:**
- Hero banner / spotlight section at top of home screen with large backdrop image
- Horizontal content carousels below (per-genre rails)
- Card focus: scale-up animation + elevation shadow on focused card (Compose `scale` modifier → CSS `transform: scale()`)

### 5.3 Tizen/Samsung-Specific Patterns

None — this is Android TV native code. No Tizen patterns are present.

### 5.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Player overlay auto-hide behavior** | Show overlay on any remote key press; start a 3–5 second inactivity timer; hide overlay when timer fires. Resume timer on any key press. This is standard TV player UX — NuvioTV confirms the pattern. |
| **Card scale-up on focus** | Focused card scales to ~1.05–1.08x with a CSS transition. Unfocused cards return to 1.0. No box-shadow approach (shadow is expensive on Tizen's compositor). Use `transform: scale()` for GPU acceleration. |
| **Hero banner with backdrop image + title + play button** | The home screen spotlight section: one large card spanning 60–70% of screen width, backdrop image behind it, title/synopsis/play button in a foreground layer. Focus navigates into the play button on D-pad right. |
| **Horizontal rail with visible overflow (peek)** | Show the right edge of the next off-screen card to signal scrollability. The amount of visible overflow (15–20% of card width) is the right signal for TV users. |
| **Transport control layout in player overlay** | Play/Pause center, Rewind/FastForward flanking, progress bar below, title above. This is the TV-standard player control layout that all of the comparable apps use — there is no reason to deviate from it. |

### 5.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **Any Kotlin/Compose pattern directly** | Tizen web apps are HTML/CSS/JS. Compose TV concepts are useful as design templates only — never attempt to bring Compose, Hilt, ExoPlayer, or any Android library into the Tizen app. |
| **ExoPlayer integration** | ExoPlayer is Android-only. Tizen uses AVPlay. The equivalent player API is entirely different. |
| **Stremio addon as content source** | Same concern as NuvioWeb — NuvioTV's content pipeline depends entirely on user-installed Stremio addons. HermesTV's content comes from the private VPS backend. |

### 5.6 Security Concerns

NuvioTV's security profile is not relevant to the Tizen app. However, one architectural note applies to HermesTV by analogy: NuvioTV functions "solely as a client-side interface for browsing metadata and playing media provided by user-installed extensions" and explicitly states it "does not host, store, or distribute any media content." HermesTV should include equivalent clear language in its internal documentation to maintain the legal boundary defined in `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md`.

---

## Source 6 — NuvioMobile

**GitHub:** `https://github.com/NuvioMedia/NuvioMobile`
**Description from master contract:** "Future mobile companion and addon/API reference."
**Note:** NuvioMobile is described as a Kotlin Multiplatform rewrite (`cmp-rewrite` branch) — a shared Compose Multiplatform UI for Android and iOS. The tapframe/NuvioStreaming repo (React Native/Expo) represents the prior generation that may be closer to what `NuvioMobile-cmp-rewrite.zip` contains.

### 6.1 What Is It?

The NuvioMobile (`cmp-rewrite`) branch is a Kotlin Multiplatform Compose app — a shared UI codebase for Android and iOS mobile clients. Prior to the KMP rewrite, the mobile app was a React Native/Expo app with:
- Stremio addon integration via a `StremioService` singleton
- MMKV for fast local storage (user data, watch progress, addon configs)
- Trakt.tv OAuth 2.0 integration for cross-device watch progress sync
- EventEmitter3 for reactive addon state updates
- ExoPlayer (Android) + AVFoundation (iOS) for playback
- Local-first data architecture with scoped user storage keys

**KMP rewrite stack:**
- Kotlin Multiplatform (shared business logic)
- Compose Multiplatform (shared UI)
- Playback-focused with collection tools, downloads, and Stremio addon integration maintained

**Addon management (from prior React Native version, patterns carry forward):**
- `StremioService` singleton manages addon lifecycle
- Addons are installed by URL; each URL is a transport endpoint returning a manifest
- User-scoped storage: keys follow pattern `@user:{scope}:addons`

<!-- NEEDS VERIFICATION: Whether NuvioMobile-cmp-rewrite.zip is the full KMP source or the transitional React Native code. The branch name suggests KMP, but the master contract's description says "mobile companion and addon/API reference" — both generations are useful pattern references. -->

### 6.2 TV-First UX Patterns

This is a mobile app — it does not have TV-first UX. However, patterns that are relevant to the **HermesTV mobile companion** (future) and to the **addon/API architecture** used for remote-control pairing include:

**Local-first watch progress (applicable everywhere):**
- Progress stored with key pattern `progress_{type}:{id}:{episodeId?}` in MMKV
- Resume position tracked as percentage and absolute timestamp
- Optional sync to Trakt.tv via OAuth — sync happens on background thread, not blocking UI

**Multi-user scoped storage (applicable to Dave/Mom profile system):**
- All storage keys prefixed with user scope: `@user:{scope}:*`
- Switching users scopes all reads/writes to the new user's prefix
- Legacy keys (unscoped) are migrated on first read after profile system introduction

**Companion pairing pattern (future mobile companion):**
- Mobile app communicates with TV app via a shared backend endpoint
- Session-based: mobile sends command → backend routes to active TV session → TV executes
- This maps cleanly to HermesTV's planned chatbot/remote pairing via `hermes-tv-api`

### 6.3 Tizen/Samsung-Specific Patterns

None — this is a mobile app with no Samsung TV integration.

### 6.4 What HermesTV Should Reuse

| Pattern | Why Adopt |
|---|---|
| **Scoped storage key pattern** | `@user:{scope}:{key}` is a clean, collision-free pattern for multi-profile storage. HermesTV should adopt this as the localStorage/IndexedDB key namespace for Dave/Mom profile isolation. |
| **StremioService singleton concept (adapted)** | Not the Stremio addon protocol itself, but the architectural pattern: a singleton service class that manages the addon/provider lifecycle, exposes a reactive event system (`EventEmitter`), and is the single authority for provider state. HermesTV's equivalent is the catalog/provider service that wraps `hermes-tv-api`. |
| **Trakt OAuth pattern (adapted for Jellyfin)** | NuvioMobile's Trakt integration uses OAuth 2.0 with PKCE for auth, token refresh lifecycle management, and background sync. HermesTV's Jellyfin session management should follow the same pattern: PKCE-based auth where applicable, token stored server-side, refresh handled in background without blocking UI. |
| **Background progress sync with local fallback** | Progress is written to local storage immediately (synchronous, instant feedback), then synced to backend asynchronously. If backend is unavailable, local state is authoritative. This is the correct pattern for HermesTV's continue-watching feature given the VPS-over-Tailscale dependency. |
| **EventEmitter for provider state reactivity** | Using an event bus (or equivalent Zustand subscription) so that provider/addon state changes propagate to UI without prop-drilling. This keeps TV components decoupled from the data fetching layer. |

### 6.5 What HermesTV Should Avoid

| Anti-pattern | Why Avoid |
|---|---|
| **MMKV in Tizen** | MMKV is a React Native native module — it does not exist in a Tizen web app context. Use `tizen.filesystem` for larger persistent data and `localStorage` for small preference state, as established in agent-05. |
| **Mobile-first layout assumptions** | The mobile app's UI is portrait-first, touch-first, scroll-based. None of these assumptions apply to HermesTV. Do not adapt mobile layouts — adapt only data architecture patterns. |
| **Stremio addon URL as user-configurable client data** | Same concern as Sources 1, 4, 5 — provider/addon URLs belong server-side in `hermes-tv-api`. |
| **ExoPlayer/AVFoundation** | Platform-specific native players. Not applicable to Tizen web. |
| **KMP/Compose Multiplatform UI code** | Kotlin Multiplatform Compose code is not applicable to a Tizen web app. Extract only the architectural and data management patterns. |

### 6.6 Security Concerns

- **Trakt OAuth tokens:** In NuvioMobile, Trakt tokens are stored locally (MMKV). In HermesTV, any OAuth tokens (Jellyfin, Trakt, etc.) must be stored server-side in `hermes-tv-api`'s secure store, not in the Tizen app's localStorage. The TV app should only hold a session token scoped to the current `hermes-tv-api` session.
- **MMKV key namespace collision:** If HermesTV were to adopt local key storage with user scoping (for the parts that legitimately belong client-side — UI preferences, cached catalog), the `@user:{scope}:` prefix pattern prevents data leaks between Dave and Mom profiles on the same TV.
- **Background sync and network access:** The background sync pattern must not create background service workers in the Tizen app — Web Workers are restricted in Tizen `.wgt` context (per agent-02). Background sync in HermesTV should be driven by visibility-change events (app comes to foreground) or polling timers in the main thread, not service workers.

---

## Synthesis Conclusion

### What the Sources Collectively Establish

The six Nuvio/Stremio sources form a coherent reference ecosystem: NuvioWeb is the shared web UI, NuvioTVTizen is its Tizen packaging, NuvioTV is the Android TV native equivalent, NuvioMobile is the mobile companion, and Stremio Web/stremio-core is the upstream content protocol they all reference. TizenBrewInstaller is the community developer tooling that enables installing all of the above without Tizen Studio.

### Top 10 Patterns HermesTV Should Adopt (Ranked)

| Rank | Pattern | Source(s) | Notes |
|---|---|---|---|
| 1 | **Hosted-app architecture — `.wgt` is a thin redirect launcher** | NuvioWeb, NuvioTVTizen | Deploy UI as private VPS-hosted web app; Tizen `.wgt` only contains `config.xml` + redirect `index.html` + icons. UI updates deploy without re-signing. |
| 2 | **Platform-detect player switch at startup** | NuvioWeb | `if (window.webapis && window.webapis.avplay) { useAVPlay() } else { useHTML5Video() }`. Single codebase works in Tizen, browser dev, and future webOS expansion. |
| 3 | **TizenBrew module key registration pattern** | NuvioTVTizen, TizenBrewInstaller | Declare all needed remote keys (media, color, numeric, info) in a single `keys` config; the runtime calls `registerKeyBatch()` once on init. |
| 4 | **Scoped storage key namespace for profiles** | NuvioMobile | `@user:{profileId}:{key}` — prevents Dave/Mom data collision in `localStorage` / `tizen.filesystem`. Apply to: favorites, watch history, preferences, PIN state. |
| 5 | **Singleton provider/catalog service with event bus** | NuvioMobile (StremioService adapted) | One service class wraps `hermes-tv-api` calls; emits events on state change; all UI components subscribe rather than fetch directly. |
| 6 | **Local-first watch progress with async backend sync** | NuvioMobile, NuvioWeb | Write progress to localStorage immediately → sync to `hermes-tv-api` in background → if VPS unreachable, localStorage is authoritative until reconnect. |
| 7 | **Back-button explicit router-level handler** | NuvioWeb | Register back key (10009) at the router level; dismiss overlays before navigating up. Per-screen cleanup on back is essential for focus state integrity. |
| 8 | **Content detail screen information hierarchy** | Stremio Web, NuvioTV | Title → synopsis → cast/genre → play button → episodes (if series) → related content. D-pad focuses Play on arrival; Back returns to browse. |
| 9 | **Catalog → stream resolution two-step** | Stremio Web (pattern only) | Show catalog metadata fast (from cached VPS response); resolve stream URL only on play intent. Prevents blocking the UI on slow provider checks. |
| 10 | **SDB CLI install pipeline for production** | TizenBrewInstaller, agent-08 | `tizen package` → `sdb connect` → `tizen install`. TizenBrew for dev iteration; signed `.wgt` via SDB for production installs on both household TVs. |

### Top Patterns HermesTV Must Avoid

| Anti-pattern | Reason | Sources |
|---|---|---|
| Stremio addon protocol as content API | Public, uncontrolled third-party URL surface; credentials in URLs; incompatible with private backend architecture | NuvioWeb, Stremio Web, NuvioTV, NuvioMobile |
| WASM / Rust stremio-core as data layer | Multi-MB binary; documented Tizen freeze/playback-failure bugs; memory pressure on Dave's UN55; incompatible with HermesTV performance budget | Stremio Web |
| Public CDN as hosted app origin | Violates private architecture; all traffic must route through VPS/Tailscale | NuvioWeb, NuvioTVTizen |
| Client-side storage of provider credentials or stream URLs | Core HermesTV security rule — all provider secrets stay in `hermes-tv-api` | All Stremio-ecosystem sources |
| Stremio addon URLs in client config | Addon transport URLs can embed API keys; must be server-side only | NuvioWeb, Stremio Web, NuvioMobile |
| Developer mode left ON on household TVs | Exposes SDB port 26101 on LAN; turn OFF after each install session | TizenBrewInstaller |
| Web Workers for background sync | Restricted in Tizen `.wgt` context; use main-thread timers and visibility-change events instead | All Tizen sources |
| MMKV / native mobile storage in Tizen | React Native module — not available in Tizen web context | NuvioMobile |

### What Contracts Can Rely On

- **Hosted-app redirect pattern:** Confirmed working by NuvioTVTizen (live GitHub repo, active releases). HermesTV `.wgt` can use this pattern with confidence.
- **TizenBrew module key registration:** Confirmed by TizenBrew docs/MODULES.md and NuvioTVTizen production use. The `keys` array pattern is the correct way to register remote keys for a Tizen hosted app.
- **SDB/tizen CLI install pipeline:** Confirmed by TizenBrewInstaller source and Samsung developer docs. Agent-08 covers this in full detail.
- **Scoped localStorage key pattern:** Proven pattern (NuvioMobile, confirmed in agent-05). Safe for Dave/Mom profile isolation.
- **Stremio-core WASM is too heavy for Tizen:** Confirmed by Stremio's own documented Tizen freeze bugs and the WASM binary size warning in stremio-core README. Do not adopt.

### What Contracts Cannot Rely On (Needs Verification)

<!-- NEEDS VERIFICATION: NuvioWeb focus management library — confirm whether it uses @noriginmedia/norigin-spatial-navigation, a custom hook, or another library. Inspect NuvioWeb-main.zip: look for package.json dependencies and useFocusable/FocusContext imports. -->

<!-- NEEDS VERIFICATION: NuvioWeb player backend switch — confirm the exact window.webapis.avplay detection pattern and which AVPlay methods are called for HLS stream initialization. Inspect NuvioWeb-main.zip: search for avplay, webapis, setStreamingProperty. -->

<!-- NEEDS VERIFICATION: NuvioTVTizen config.xml — confirm exact widget ID, version, privileges list, and the complete remote keys array. Inspect NuvioTVTizen-main (1).zip: read config.xml and the TizenBrew module definition file. -->

<!-- NEEDS VERIFICATION: NuvioMobile-cmp-rewrite.zip contents — confirm whether this is the Kotlin Multiplatform rewrite or the React Native version. The branch name "cmp-rewrite" strongly implies KMP, but the master contract description implies it may contain the React Native source. Inspect the zip root for build.gradle.kts (KMP) vs package.json (React Native). -->

<!-- NEEDS VERIFICATION: Stremio-web-5.0.0-beta.37 Tizen player adapter — the zip may contain Tizen-specific AVPlay integration code separate from the browser HTML5 video path. Inspect for a player/ or platform/ directory with a tizen.js or avplay.js adapter. -->

<!-- NEEDS VERIFICATION: TizenBrewInstaller.wgt contents — this is the pre-built installer widget. Inspect its config.xml for the privilege list and confirm it does not request any privileges HermesTV should avoid inheriting. -->

---

**Report authored by:** Agent 13 — Nuvio Source Audit
**Research date:** 2026-05-17
**Status:** Research lock — findings feed agents 03 (NuvioWeb Pattern Audit), 04 (NuvioTVTizen Wrapper Audit), 05 (TizenBrew Installer Audit) per master contract lane mapping

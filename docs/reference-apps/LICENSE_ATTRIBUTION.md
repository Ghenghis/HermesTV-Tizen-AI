# Reference-App License Attribution

Generated: 2026-05-20.
Source-of-truth for every reference-app pattern adopted into DaveTV / HermesTV.

Binding source-of-truth. Enumerates each upstream app, its license, what
patterns we pulled, what we did **not** pull, the public attribution text,
and residual legal risk. New reference-app adoption must add a row here in
the same PR that introduces the code.

Policy parent: `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md` ("Reference
App License Boundary"). Sibling extracts in `docs/reference-apps/08_*` ...
`10_*` cite this file.

## Global Rules

1. **>5-line source-paste rule.** No verbatim block of more than 5 contiguous
   lines from any reference app may appear in DaveTV source. Identifier names,
   external API shapes, and 4xx/5xx response codes are not copyrightable and
   are exempt.
2. **GPL / AGPL → pattern-only.** We never copy or fork GPL-3.0 or AGPL-3.0
   source into our tree. We read tests as behavior contracts and re-express
   the contract in our own CommonJS test files.
3. **MIT → adapt with attribution.** MIT source may be adapted into our tree
   if (a) attribution is preserved in the file header, (b) the MIT notice is
   reproduced in this document, (c) the adapted file is rewritten in
   Hermes-house style (CommonJS, no Angular/Nx, no Electron).
4. **Unstated license → pattern-only, conservative.** Treat as "all rights
   reserved" until upstream clarifies. No code, only API shapes and high-level
   architecture diagrams.
5. **CREDITS surface.** A ship-ready CREDITS section per app lives at the
   bottom of each section; the consolidated text becomes `CREDITS.md` /
   `LICENSE.thirdparty` at first public release.

---

## 1. IPTVnator

- **Upstream:** https://github.com/4gray/iptvnator (per `package.json`
  `homepage` field).
- **License:** **MIT** (`package.json` `"license": "MIT"`).
- **LICENSE file:** `G:\Github\IPTV-Apps\iptvnator\LICENSE.md` — short-form
  MIT, "Copyright 2020-2021".
- **Author:** 4gray <fourgray@proton.me>.

### What we adopted (patterns only — no source copy >5 lines)

| Pattern | DaveTV file | Notes |
|---|---|---|
| Xtream Codes mock-server contract | `tools/xtream-fixture-server.js` | Header explicitly says "Adopted from IPTVnator's `apps/xtream-mock-server` pattern... adapted for Hermes". Rewritten as a single CommonJS file; no Nx, no Express boilerplate. |
| Xtream fixture E2E pipeline test | `services/hermes-tv-api/test/xtreamFixture.e2e.test.js` | Header: "Adapted from IPTVnator's xtream-mock-server pattern... the pattern, not the code." |
| Xtream Codes REST client (`/player_api.php` action dispatch) | `services/hermes-tv-api/src/lib/xtreamClient.js` | Behavior shape only — auth, live/VOD/series enumerators, short EPG, output-format selection. |
| Playback diagnostics conceptual model (HEAD fallback, Range 0-0, content-type/MIME, redirect chain) | `services/hermes-tv-api/src/lib/streamProbe.js`, `services/hermes-tv-api/src/routes/sourceHealth.js` | Behavior contract. |
| EPG data-access patterns (multi-source XMLTV, gzip detection, channel mapping) | `services/hermes-tv-api/src/lib/epgWaterfall.js` (cross-referenced w/ Extreme-InfiniTV — see §2) | |

### What we DID NOT adopt

- The entire Nx monorepo / Angular UI layer (out of scope; DaveTV is React +
  Express, not Angular + Electron).
- Embedded mpv native bindings (`apps/electron-backend/native/*`) — DaveTV
  uses browser HLS / Tizen AVPlay, not mpv.
- SQLite Drizzle schema and IPC events — DaveTV is stateless on disk.
- Trademark — IPTVnator has a `TRADEMARK.md`. We must not call our product
  "IPTVnator" or use the IPTVnator logo even though MIT permits source reuse.
  Our `IptvnatorShell` is a layout-personality name, not a fork of the app.

### Attribution text (ship as-is)

```
DaveTV / HermesTV includes patterns adapted from IPTVnator
(https://github.com/4gray/iptvnator) by 4gray, distributed under the MIT
License. Copyright (c) 2020-2021 4gray. The MIT permission notice and
disclaimer are reproduced in LICENSE.thirdparty.
```

### Risk: **LOW**

MIT is permissive. We have written file-header attribution on every
adapted file. The IPTVnator trademark is respected — no logo or product-name
reuse. The `IptvnatorShell.jsx` name is a layout-style nickname (acknowledged
in its file header as "Cloned design language (NOT cloned assets)").

---

## 2. Extreme-InfiniTV

- **Upstream:** unknown — local copy. No `homepage` field; `package.json`
  identifies the package as `"name": "xtream"` v1.6.0. Author / origin URL
  needs human confirmation before public ship.
- **License:** **GPL-3.0-or-later** (`package.json`
  `"license": "GPL-3.0-or-later"`).
- **LICENSE file:** `G:\Github\IPTV-Apps\Extreme-InfiniTV\LICENSE` — full text
  of the GNU GPL v3.

### What we adopted (behavior contracts only — no GPL source copied)

| Pattern | DaveTV file | Notes |
|---|---|---|
| M3U parser real-world edge cases (BOM, CRLF, malformed quotes, unquoted attrs, `#EXTGRP`, `tvg-chno` numeric, `#EXTVLCOPT` UA/referrer, catchup attrs, radio markers, M3U-header EPG URLs) | `services/hermes-tv-api/test/m3uParser.test.js` + `services/hermes-tv-api/src/lib/m3uClient.js` | Test header: "Behavior contracts adapted from Extreme-InfiniTV's `tests/m3u-parser.test.ts`... patterns, not code." |
| EPG waterfall + program/channel merge + gzip detection + safe-fuzzy channel-name matching | `services/hermes-tv-api/src/lib/epgWaterfall.js` + `services/hermes-tv-api/test/epgWaterfall.test.js` | Implementation header: "behavior contract adopted from Extreme-InfiniTV's `tests/epg-data.test.ts`... PATTERN-ONLY adoption; no GPL source copied — see docs/48 §Reference App License Boundary." |
| Stream-diagnostic contracts (HEAD fallback, Range 0-0, content-type sniff, redirect chain, CORS/CSP symptoms) | `services/hermes-tv-api/src/lib/streamProbe.js` | Concept only. |
| Per-channel HTTP header propagation (user-agent, referrer) | `services/hermes-tv-api/src/routes/play.js`, `services/hermes-tv-api/src/lib/hlsProxy.js` | Behavior. |
| Playlist-health concept (counts/status/disabled/unreachable distinct states) | `services/hermes-tv-api/src/lib/sourceHealthAggregator.js` | |
| 3-pane dense-power-user UX | `apps/hermes-web-tv/src/shells/ExtremeInfiniTVShell.jsx` | File header says "Design language inspiration (not asset clones)". |

### What we DID NOT adopt

- The Astro + Svelte UI layer.
- The Tauri shell (`src-tauri/`) — no Rust code copied.
- Any test fixture data (XMLTV samples, M3U snippets) verbatim — our tests
  use fresh fixtures.
- Logos, icons, brand colors.

### Attribution text (ship as-is)

```
DaveTV / HermesTV's M3U-parser test suite, EPG waterfall behavior, and
playback-diagnostic concepts adapt patterns from the Extreme-InfiniTV
project. Extreme-InfiniTV is distributed under the GNU General Public
License v3.0-or-later. DaveTV does not incorporate Extreme-InfiniTV source
code; it re-expresses the externally-observable test contracts in
independent CommonJS. A copy of the GPL v3 is reproduced in
LICENSE.thirdparty.
```

### Risk: **LOW-MEDIUM**

GPL-3.0-or-later is strong copyleft, but copyleft attaches to **source
incorporation**, not to ideas, APIs, or test-case enumerations (which are
not copyrightable under Oracle v. Google et al.). Our header banners on
every adopted file explicitly call out PATTERN-ONLY status. **Action
required before public release:** human confirms upstream URL so the
attribution text can be made specific. Until then attribution names the
project but cannot link to it.

---

## 3. ynotv

- **Upstream:** https://github.com/tbeezy/ynotv (per `package.json`
  `homepage` field). Author: tbeezy.
- **License:** **AGPL-3.0** (`LICENSE` file is full GNU AGPL v3 text;
  `package.json` does not carry a `"license"` field — the `LICENSE` file
  governs).
- **LICENSE file:** `G:\Github\IPTV-Apps\ynotv\LICENSE` — full text of the
  GNU Affero GPL v3.

### What we adopted (architecture only — strict no-source-paste)

| Pattern | DaveTV file | Notes |
|---|---|---|
| ynotv-flavored "Lean TV" shell personality | `apps/hermes-web-tv/src/shells/YnotvShell.jsx`, `apps/hermes-web-tv/src/layouts/manifests/ynotv.json` | Design-language only ("Cloned design language (NOT cloned assets)"). |
| Failover-group architecture (operator-curated ordered alias list) | NOT YET IMPLEMENTED in code. Captured in `docs/reference-apps/10_YNOTV_FAILOVER.md` as a design pull for a future `failover_overrides` table. |
| Position/buffer watchdog architecture (poll position + cache-end + forward-bytes, trigger re-resolve) | NOT YET IMPLEMENTED. Captured in `docs/reference-apps/10_YNOTV_FAILOVER.md` and `docs/reference-apps/09_YNOTV_EPG_STREAMING.md`. |
| EPG ingestion + stream-dispatch behaviors (multi-source XMLTV waterfall, mapping wizard, source-resolver) | Architectural cross-reference in `docs/reference-apps/09_YNOTV_EPG_STREAMING.md` — referenced when extending `services/hermes-tv-api/src/lib/epgWaterfall.js`. |
| Core type contracts (StoredChannel, StreamRef, FailoverGroup shape) | Reference-only in `docs/reference-apps/08_YNOTV_CORE_TYPES.md`. |

### What we DID NOT adopt

- **No ynotv source files appear in our tree, full stop.** AGPL would
  require us to publish DaveTV server source under AGPL if we incorporated
  any ynotv source — that is unacceptable for the project today.
- No Tauri shell, no Rust, no React component code, no `packages/core/src/*`
  TypeScript.
- No SQLite migration scripts.
- No mpv bridge or Tauri event-bus wiring.

### Attribution text (ship as-is)

```
DaveTV / HermesTV references the architecture of ynotv
(https://github.com/tbeezy/ynotv) by tbeezy, distributed under the
GNU Affero General Public License v3.0 (AGPL-3.0). DaveTV does NOT
incorporate ynotv source code; the references are architectural and
behavioral only. Pattern extracts are in docs/reference-apps/08-10.
A copy of the AGPL v3 is reproduced in LICENSE.thirdparty.
```

### Risk: **MEDIUM**

AGPL-3.0 is the strongest copyleft and triggers on network-service use.
The risk is purely a discipline risk: if a future agent paste-copies even a
small block of ynotv source into a Hermes service file, DaveTV's entire
backend would become AGPL-encumbered (or in violation). The four sibling
docs (`08_*`, `09_*`, `10_*`) plus this attribution doc are the guardrail.
Every PR that touches `services/hermes-tv-api/src/lib/epgWaterfall.js`,
`catalogMerge.js`, `streamProbe.js`, or `routes/play.js` should be diff'd
against the ynotv tree to confirm no incidental verbatim copying.

---

## 4. NuvioWeb

- **Upstream:** `NuvioMedia/NuvioWeb` (referenced from
  `G:\Github\IPTV-Apps\NuvioWeb\README.md`). Origins credit
  `tapframe/NuvioTV` (Android TV) and `WhiteGiso/NuvioTV-WebOS` (community
  webOS base).
- **License:** **unstated.** No `LICENSE` file. `package.json` has no
  `"license"` field. README mentions only that a vendored QR library
  states MIT in its own header.
- **LICENSE file:** none present at `G:\Github\IPTV-Apps\NuvioWeb\`.

### Conservative position

Per global rule #4, unstated upstream license is treated as **all rights
reserved**. Pattern-only extraction; no code may be copied into DaveTV
under any circumstance until upstream publishes a license.

### What we adopted (patterns only — high-level architecture)

| Pattern | DaveTV file | Notes |
|---|---|---|
| Single shared web app + thin TV-wrapper architecture (Tizen / webOS) | DaveTV's overall apps/hermes-web-tv + Tizen wrapper philosophy | The pattern, never the code. |
| Sync-wrapper / build-pipeline concept | Conceptual reference in `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`. Not implemented yet. |
| Cinematic hero-driven layout personality | `apps/hermes-web-tv/src/shells/NuvioShell.jsx`, `apps/hermes-web-tv/src/layouts/manifests/nuvio.json` | Design language inspiration only. |

### What we DID NOT adopt

- No NuvioWeb / NuvioTV source files appear in DaveTV.
- No Stremio addon SDK code.
- No build / sync script code.
- No assets, logos, brand wordmarks.

### Attribution text (ship as-is)

```
DaveTV / HermesTV's "Nuvio" layout personality and shared-web-app-plus-TV-
wrapper architecture take inspiration from the NuvioWeb project
(NuvioMedia/NuvioWeb on GitHub), itself rooted in tapframe/NuvioTV and
WhiteGiso/NuvioTV-WebOS. The NuvioWeb repository does not publish a
project-wide open-source license; DaveTV consequently treats it as a
pattern reference only and does not incorporate NuvioWeb source code.
```

### Risk: **MEDIUM**

The license is unstated, which legally means "all rights reserved." Our
exposure is limited because we copied no source. The risk is reputational
rather than legal — if NuvioWeb's authors later publish a restrictive
license, DaveTV's `NuvioShell` layout name could be challenged. **Human
follow-up:** open an issue at NuvioMedia/NuvioWeb requesting a `LICENSE`
file declaration; until then, do not paste any NuvioWeb code, even short
snippets.

---

## DaveTV Source-Code Cross-Reference (spot-check the >5-line rule)

Every DaveTV file that derives a pattern from a reference app is listed
here with absolute path and intended re-review. The header comment in each
file states "PATTERN-ONLY" / "adapted from" / "Cloned design language (NOT
cloned assets)" — none of the files reproduce a contiguous source block of
more than 5 lines from any upstream.

Reviewer checklist for each file: open the file, scan the header banner,
spot-check 3 random function bodies against the upstream tree referenced
in the banner, confirm no copy-paste.

| DaveTV file (absolute) | Reference app | Lines |
|---|---|---|
| `G:\Github\HermesTV-Tizen-AI\tools\xtream-fixture-server.js` | IPTVnator (MIT) | 472 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\xtreamClient.js` | IPTVnator (MIT) | 701 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\m3uClient.js` | Extreme-InfiniTV (GPL-3.0-or-later) | 641 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\epgWaterfall.js` | Extreme-InfiniTV (GPL-3.0-or-later) + ynotv (AGPL) — pattern crosspoint | 670 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\test\m3uParser.test.js` | Extreme-InfiniTV | 250 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\test\epgWaterfall.test.js` | Extreme-InfiniTV | 415 |
| `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\test\xtreamFixture.e2e.test.js` | IPTVnator | 277 |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\shells\IptvnatorShell.jsx` | IPTVnator (design only) | spot-check |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\shells\ExtremeInfiniTVShell.jsx` | Extreme-InfiniTV (design only) | spot-check |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\shells\YnotvShell.jsx` | ynotv (design only) | spot-check |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\shells\NuvioShell.jsx` | NuvioWeb (design only) | spot-check |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\layouts\manifests\iptvnator.json` | IPTVnator (name only) | n/a |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\layouts\manifests\extreme-infinitv.json` | Extreme-InfiniTV (name only) | n/a |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\layouts\manifests\ynotv.json` | ynotv (name only) | n/a |
| `G:\Github\HermesTV-Tizen-AI\apps\hermes-web-tv\src\layouts\manifests\nuvio.json` | NuvioWeb (name only) | n/a |

## Boundaries Flagged For Human Review

1. **Extreme-InfiniTV upstream URL is unknown.** Local `package.json` lacks
   a `homepage` field. Attribution text uses the project name but cannot
   link to a repo. Locate the upstream before public release.
2. **NuvioWeb license is unstated.** Treat as all-rights-reserved.
   File a license-clarification issue upstream.
3. **AGPL discipline.** Every PR touching the four `services/hermes-tv-api/
   src/lib/` files that share ynotv concepts must include a "diff'd against
   ynotv tree — no verbatim copying" line in the PR description.
4. **Trademark.** "IPTVnator" is trademark-asserted by 4gray (per the
   upstream `TRADEMARK.md`). Our `IptvnatorShell` is internal naming only;
   the user-facing layout label in `manifests/iptvnator.json` and the
   layout switcher should be reviewed to confirm we never present the
   string "IPTVnator" as a product name in marketing surfaces.

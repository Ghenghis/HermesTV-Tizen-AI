# 48 - Reference Apps E2E Adoption Contract

Generated: 2026-05-20

Status: BINDING for all Claude/Codex/agent work that uses
`G:\Github\IPTV-Apps` or `G:\Github\IPTV-web` as evidence, source material,
or implementation guidance.

This contract extends:

- `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
- `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
- `docs/FEATURE_GAP_2026.md`

The reference apps are useful because they show working IPTV behavior. They do
not make HermesTV done by association. Any adopted pattern must become a
HermesTV test, implementation, and proof artifact.

## Reference App License Boundary

Use this rule before copying source. Dave accepts upstream license obligations
for private DaveTV work, but each app's actual license still controls what can
be copied, modified, redistributed, hosted, or run as-is.

- `G:\Github\IPTV-Apps\iptvnator` is MIT. Code can be adapted if attribution
  and license obligations are preserved. Highest value: Xtream mock server,
  route/test shapes, EPG progress, playback diagnostics.
- `G:\Github\IPTV-Apps\Extreme-InfiniTV` is GPL-3.0-or-later. Port behavior,
  tests, and contracts by default. Direct source adoption is allowed only if the
  adopted files are tracked through `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`,
  the GPL license text is preserved, source availability obligations are
  accepted, and the adoption is explicitly labeled in attribution.
- `G:\Github\IPTV-Apps\ynotv` is AGPL-3.0. Use as architecture reference by
  default. Direct source adoption is allowed only if the adopted files are
  tracked through `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`, AGPL network-source
  obligations are accepted, and hosted DaveTV users can receive the required
  source.
- `G:\Github\IPTV-Apps\NuvioWeb` does not present a settled project license in
  README. Use as wrapper/build/pattern reference only. Its vendored QR library
  states MIT in the file header.

No agent may paste licensed or uncleared source into DaveTV and call the task
done. Source adoption requires a manifest entry, license attribution, tests,
and proof. If a license forbids modification or redistribution, or no license
is present, agents may study the app, run it unmodified as local tooling, or
rebuild the idea in DaveTV style, but must not modify/paste that source into
DaveTV.

For the 25-app `G:\Github\IPTV-web` adoption lane, use:

- `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`
- `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md`

## E2E Means The Whole Chain

A feature is E2E complete only when all applicable links are proven:

1. Config or UI input accepts real operator data or an honest fixture.
2. Backend stores or loads the config through the canonical registry.
3. Backend fetches real upstream data or an explicit fixture server.
4. Backend normalizes IDs into the same catalog/source/provider contract.
5. UI consumes the backend response without hard-coded provider assumptions.
6. Playback uses a HermesTV ticket endpoint, not a raw upstream URL.
7. Tizen/web runtime can call the backend under CSP/CORS constraints.
8. Proof artifacts show pass/fail without secrets.

Route existence, screenshots, in-memory envelopes, skipped tests, 501 responses,
and mocked catalog rows are not E2E proof.

## Current HermesTV Gaps Exposed By Reference Apps

These are the missing or incomplete features agents must account for.

### Provider And Catalog

- Provider-live proof is still blocked without real operator config.
- Fixture provider proof is missing a deterministic local Xtream/M3U server.
- Source-health still contains static Apollo/xTremeHD assumptions in
  `services/hermes-tv-api/src/routes/sourceHealth.js` and
  `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`.
- M3U parsing misses several real-world cases from Extreme-InfiniTV:
  header EPG URLs, `#EXTGRP`, unquoted attributes, escaped quotes, malformed
  quotes, `#EXTVLCOPT` user-agent/referrer, catchup attributes, `tvg-chno`,
  radio markers, and HLS sub-playlist guardrails.
- Xtream support needs complete provider contract coverage: live, VOD, series,
  categories, account info, output formats, short/full EPG, and stream URL
  construction for `m3u8`, `ts`, movies, series episodes, and catchup.
- Stalker/Ministra provider support is not implemented.
- Provider account health is thin: expiry, max connections, active
  connections, trial status, allowed output formats, and disabled/bad-creds
  states should appear in safe backend status.
- Backup provider URLs, per-provider user-agent, per-provider referrer,
  provider ordering, enabled/disabled, and failover priority are not fully
  part of the provider registry contract.

### EPG And Catchup

- `services/hermes-tv-api/src/routes/epgGrid.js` still returns mock programs.
- EPG is mostly single XMLTV URL plus static channel map, not multi-source
  provider-aware waterfall.
- M3U header EPG URLs and Xtream `xmltv.php` defaults are not first-class
  provider registry fields.
- Additional EPG URLs, gzip detection, source waterfall, per-channel override,
  fuzzy matching, ambiguity rejection, and EPG timeshift are incomplete.
- Catchup program listing is empty and catchup playback still returns 501.
- Xtream `get_simple_data_table`, `get_short_epg`, archive flags, and
  timeshift URL construction need real coverage.

### Playback

- Playback proof must cover HLS manifests and direct byte streams (`.ts`,
  `.mp4`, redirects, 206 range responses).
- Per-channel HTTP headers from M3U and provider config need to flow through
  play/proxy safely: user-agent, referrer, and any allowed request headers.
- Stream diagnostics are not mainstream enough: HEAD fallback, Range `0-0`,
  MIME/content-type checks, redirect chain, latency, CORS/CSP symptoms, and
  clean user-facing verdicts.
- Multi-audio and multi-subtitle track selection are not surfaced in the player.
- Sidecar subtitles and subtitle styling are not proven E2E.
- Source failover is not user-controllable and is not proven from a playback
  failure into the next provider/source.

### TV Runtime And Wrapper

- Tizen package proof remains incomplete until API base, CSP, CORS, AVPlay path,
  and WGT inspection all pass.
- NuvioWeb shows the useful pattern: one shared web app plus a thin Tizen/webOS
  wrapper and sync/build scripts. HermesTV needs the same repeatable proof,
  even if it does not copy Nuvio source.
- QR onboarding must encode a real setup URL or be visibly non-scannable.
- Remote key handling and spatial navigation need browser/Tizen proof on the
  provider, EPG, player, settings, and error screens.

### Mainstream User Features

These features exist or are strongly represented in the reference apps and
should be included in the roadmap. They must not block provider-live proof, but
they should be tracked honestly.

- Stalker/Ministra portals.
- VOD and series detail from Xtream, including seasons/episodes.
- Recently watched, continue watching, watch progress, favorites, and
  watchlist E2E proof across live/VOD/series.
- Category/group browse, hide, reorder, favorites-only filters, HD/has-EPG/
  has-catchup filters.
- Provider account panel with expiry and connection slots.
- Full EPG import progress: downloading, parsing, mapping, inserting,
  complete/error.
- DVR recording that writes bytes to disk, not just an in-memory envelope.
- Downloads that write bytes to disk, not just size estimates.
- Subtitle search/download and player subtitle picker.
- Audio track picker and loudness normalization.
- TMDB/TVDB/FanArt/logo enrichment for VOD, series, and channel picons.
- Legal FAST adapters such as Pluto, Samsung TV Plus, Plex Live, Tubi, and Roku
  Channel where licensing and source URLs are appropriate.
- Cross-device cloud sync or profile sync for watch progress/favorites.
- Playback diagnostics and repair hints.
- Notifications for recording finished, provider down, EPG refresh failed.

## Adoption Priority

### P0 - Provider Truth And E2E Proof

These are required before anyone says providers work:

1. Adapt the IPTVnator Xtream mock-server pattern into a HermesTV fixture
   provider. It must support account info, live categories, live streams, VOD,
   series, short EPG, HLS, direct TS, redirects, bad credentials, empty catalog,
   and degraded scenarios.
2. Add a fixture-provider E2E job. It may pass without real secrets, but it must
   be labeled fixture proof, never live proof.
3. Keep live-provider E2E separate. It must fail when no live provider is
   configured, when `/api/catalog` is empty, or when playback is skipped.
4. Port robust M3U parser behavior into Hermes tests before changing parser
   code.
5. Make source-health consume provider registry and catalog source IDs.
6. Make EPG IDs map to real playable catalog/source IDs.
7. Prove web and Tizen playback use ticket endpoints only.

### P1 - Mainstream IPTV Parity

After P0 is green:

1. Complete Xtream VOD/series/catchup/account health.
2. Implement multi-source XMLTV, EPG waterfall, and mapping wizard behavior.
3. Implement catchup/timeshift list and play paths.
4. Implement Stalker/Ministra if an operator actually needs it.
5. Add real DVR/download byte pipelines or mark them unsupported everywhere.
6. Add audio/subtitle picker, subtitle styling, and sidecar subtitle support.
7. Add provider failover groups, backup URLs, and source ordering.

### P2 - Polish And 2026 Features

These are valuable but cannot substitute for provider proof:

1. TMDB/TVDB/FanArt/logo enrichment.
2. FAST legal channel adapters.
3. Trakt/Simkl scrobble and cloud profile sync.
4. Sports overlays and schedule widgets.
5. Notification adapters.
6. Recommendation rails.

## Required Test Matrix

Every lane that touches reference-app adoption must add or update proof in this
matrix.

| Area | Required proof |
| --- | --- |
| No-provider state | `NO_PROVIDER_EMPTY_STATE=1 node tools/test-provider-e2e.js` passes and reports empty-state only. |
| Fixture provider | Local fixture provider starts, registry saves config, `/api/providers` lists it, `/api/catalog` returns non-zero items, `/api/search` hydrates item sources, `/api/play` issues ticket, `HEAD/GET /stream` returns 200/206/302. |
| Live provider | Same chain as fixture provider using operator-configured live provider. Must not pass on skip or empty catalog. |
| M3U parser | Tests for BOM/CRLF, header EPG URL, `#EXTGRP`, unquoted attrs, malformed/escaped quotes, `#EXTVLCOPT` UA/referrer, catchup, `tvg-chno`, radio, orphan URLs, and HLS sub-playlist handling. |
| Xtream client | Tests for account info, auth failure, live/VOD/series categories, live/VOD/series lists, series info, short/full EPG, output format selection, cache separation by provider ID, and sanitized logs. |
| EPG | Multi-source XMLTV/gzip/waterfall/mapping tests. Ambiguous fuzzy matches must not guess. Programs must map to playable catalog IDs. |
| Source health | Registry-backed providers appear with counts/status. Disabled, bad credentials, unreachable, and untested states are distinct. No raw URL or credential leaks. |
| Playback proxy | HLS manifest rewrite, relative segments, absolute segments, audio/subtitle rendition URIs, TS byte proxy, MP4/redirect/Range, UA/referrer propagation, SSRF block, expired ticket, HEAD route. |
| Web UI | Provider add/list/test, catalog/search/detail/play, source-health, EPG, no-provider empty state, bad credentials state, no raw upstream URL visible. |
| Tizen | WGT inspect, API base, CSP, CORS, AVPlay/ticket path, remote D-pad navigation, no upstream URL in bundle/storage/logs. |
| Unsupported features | DVR/download/catchup routes must either work with bytes/playback or return honest unsupported status. No success envelope may imply bytes were written when they were not. |
| Secrets | Source, logs, screenshots, and proof artifacts pass secret scan. |

## Reference Paths Agents Should Read

Use these paths as guides. Do not bulk copy.

- `G:\Github\IPTV-Apps\iptvnator\apps\xtream-mock-server\src\main.ts`
- `G:\Github\IPTV-Apps\iptvnator\apps\xtream-mock-server\src\app\scenarios.ts`
- `G:\Github\IPTV-Apps\iptvnator\apps\xtream-mock-server\src\app\routes\dispatch.ts`
- `G:\Github\IPTV-Apps\iptvnator\libs\ui\playback\src\lib\playback-diagnostics`
- `G:\Github\IPTV-Apps\iptvnator\libs\epg\data-access\src\lib`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\tests\m3u-parser.test.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\tests\epg-data.test.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\tests\player-runtime.test.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\stream-diagnostic.js`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\stream-headers.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\playlist-health.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\preferences.js`
- `G:\Github\IPTV-Apps\ynotv\packages\core\src\types.ts`
- `G:\Github\IPTV-Apps\ynotv\packages\core\src\interfaces.ts`
- `G:\Github\IPTV-Apps\ynotv\packages\ui\src\services\epg-streaming.ts`
- `G:\Github\IPTV-Apps\ynotv\packages\ui\src\services\failover-groups.ts`
- `G:\Github\IPTV-Apps\ynotv\packages\ui\src\services\stream-resolver.ts`
- `G:\Github\IPTV-Apps\NuvioWeb\README.md`
- `G:\Github\IPTV-Apps\NuvioWeb\scripts\sync-wrapper.mjs`
- `G:\Github\IPTV-Apps\NuvioWeb\services\com.nuvio.tizen.service\src`

## Agent Report Format

Every agent using this contract must report:

```text
Reference apps consulted:
Hermes files changed:
Feature status:
  - implemented:
  - honestly unsupported:
  - blocked:
Tests/proof run:
Proof artifact paths:
Secrets exposed: YES/NO
License risk: NONE / PATTERN-ONLY / NEEDS REVIEW
Next lane:
```

Any report that says "done" without this evidence is rejected.

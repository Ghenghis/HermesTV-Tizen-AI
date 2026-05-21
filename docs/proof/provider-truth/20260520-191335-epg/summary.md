# EPG behavior contract proof — Priority 3 — fixture mode

This proof exercises the EPG waterfall + safe fuzzy matching contract
adopted from Extreme-InfiniTV's `tests/epg-data.test.ts` PATTERNS (no
GPL source copied — see docs/48 §"Reference App License Boundary").

This is fixture/unit proof. It does **NOT** count as live-provider EPG
proof — that requires a real XMLTV URL configured on the VPS and would
be exercised by tools/test-provider-e2e.js with a populated cache.

## What this proves

`services/hermes-tv-api/test/epgWaterfall.test.js` — 106 PASS / 0 FAIL:

- Xtream default EPG URL: `<host>:<port>/xmltv.php?username=...&password=...`
- Provider override `entry.epgUrl` beats both Xtream default and M3U header
- M3U `#EXTM3U` header EPG URL feeds the primary slot for M3U creds
- `additional_epg_urls[]` appended after primary, in order, deduped
- Whitespace trimmed; blank additional URLs skipped
- `disableProviderEpg`: drops xtream-default + m3u-header; keeps user
  override + additional URLs
- `mergeProgrammeMaps`: primary wins; additional fills gaps; three-step
  waterfall agrees with TiviMate-style EPG composition
- `detectGzip`: magic bytes (0x1F 0x8B), `.gz` extension, `Content-Type`,
  `Content-Disposition` filename, query-string-safe extension check
- `normaliseChannelName`: HD/FHD/UHD/4K/8K/SD/2K stripping,
  diacritic stripping, whitespace + punctuation removal, `+` preservation
- `findBestEpgChannelByName`: matches "MDR Sachsen HD" → "mdr.sachsen.de";
  REFUSES to guess on ambiguous matches (Sky vs Sky HD → "")
- `resolveTvgId`: per-channel override beats raw tvgId; falls through to
  safe name match only when programmes/channelNames provided
- `buildChannelNameIndex` / `findInChannelNameIndex`: O(1) parity with the
  pure helper; collisions return ""

## Code changes

- NEW `services/hermes-tv-api/src/lib/epgWaterfall.js` (375 lines):
  pure helpers, no I/O, no network.
- NEW `services/hermes-tv-api/test/epgWaterfall.test.js` (260 lines, 106 tests).
- MOD `services/hermes-tv-api/src/routes/epgGrid.js`: MOCK_PROGRAMS removed;
  endpoint now returns honest empty `{ programs: [], _meta: { source:
  "no-epg" | "xmltv" } }` and reads from the existing `lib/integrations/
  xmltv.js` cache when XMLTV_URL is configured.
- MOD `services/hermes-tv-api/src/lib/providerStore.js`: validation +
  persistence for `additional_epg_urls`, `user_agent`,
  `epg_timeshift_hours`, `disable_provider_epg`. Length caps + type
  checks. Persisted server-side only; masked responses unchanged.
- MOD `services/hermes-tv-api/package.json`: npm test runs the new suite.

## Secrets exposed

NO — test fixtures use literal `PLACEHOLDER_USER`/`PLACEHOLDER_PASS` +
`example.test` hostnames. No real provider URL, username, password,
token, or API key appears in any test, log, or proof artifact.
The `epgWaterfall.log` was grep'd to PASS/FAIL only, never raw test body.

## License risk

PATTERN-ONLY. Test cases re-express the same external behavior contract
from Extreme-InfiniTV (GPL-3.0) in fresh prose + fresh CommonJS code.
No GPL source pasted. Implementation file `lib/epgWaterfall.js` was
written from scratch against the test contract.

# Fixture proof — adopted from IPTV-Apps references — 20260520-185634

This proof exercises the full Hermes pipeline (provider registry →
/api/catalog → /api/play → stream HEAD/GET) using a LOCAL Xtream-Codes
mock server. It does **NOT** count as live-provider proof per
docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md §"Non-Negotiable Truth Rules"
rule 1.

## Priority 1 — Xtream fixture E2E
`services/hermes-tv-api/test/xtreamFixture.e2e.test.js`
**9 PASS / 0 FAIL** on local rerun after Windows-safe harness cleanup.
The fixture now proves both `HEAD` and `GET` on `/api/play/:ticket/stream`
return media-safe responses.

## Priority 2 — M3U parser regression
`services/hermes-tv-api/test/m3uParser.test.js`
**39 PASS / 0 FAIL** covering:
- BOM stripping + CRLF line endings
- EPG header URLs (x-tvg-url, tvg-url, url-tvg)
- Attribute parsing: quoted, unquoted, escaped quotes, fragment-safe
- Malformed unterminated quote (graceful degrade, no crash)
- EXTGRP fallback + group-title preference
- tvg-chno numeric
- Catchup mode + days
- http-user-agent + http-referrer
- tvg-type=radio detection
- Bare URLs without EXTINF dropped
- Blank lines + KODIPROP/comment skip
- Empty/whitespace input

## Secrets exposed
**NO** — fixture uses literal `fixturedemo` credentials. Hermes API
responses contain zero credential bytes (test asserts both
/api/providers and /api/catalog response bodies do not contain
the fixture username/password). Stream response bytes are 188-byte
TS sync-byte payload — no credential content.

## Adapted-not-copied
- IPTVnator `apps/xtream-mock-server` pattern — dispatch + handlers
- Extreme-InfiniTV `tests/m3u-parser.test.ts` — test cases (BOM, CRLF,
  EXTGRP, tvg-chno, catchup, user-agent, malformed input)
- ynotv — NOT consulted (AGPL); will be referenced only for architecture
  boundaries in a subsequent priority pass.

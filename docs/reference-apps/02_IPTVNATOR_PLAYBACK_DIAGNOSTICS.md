# 02 - IPTVnator Playback Diagnostics: Verdict-Engine Extraction

Generated: 2026-05-20
Agent: 03 of the 20-agent DaveTV reference-extraction swarm
Source: `G:\Github\IPTV-Apps\iptvnator` (pinned read-only worktree)
Upstream license: MIT (see `iptvnator/LICENSE.md`, Copyright 2020-2021)
Adoption license: MIT - pattern adoption allowed with attribution to the
IPTVnator project. Any verbatim code copied into HermesTV must carry the
original copyright notice in a header comment.

## Truth-Gate Banner (per docs/46)

This document is an architecture extraction, not a feature claim. Nothing in
this file proves HermesTV emits any of the verdicts described. The
"Implemented" column in Section 4 reflects code inspection of
`services/hermes-tv-api/src/routes/play.js` and
`services/hermes-tv-api/src/lib/hlsProxy.js` at the commit listed in git
status above. No tests were run.

Hard rules honored:
- No verbatim source >5 lines.
- No upstream URLs.
- No mock / stub recommendations - the proposed `/diagnose` endpoint runs
  against the same live upstream the player is trying to use.

## 1. Architectural Truth About IPTVnator

IPTVnator's "playback diagnostics" surface is NOT a pre-flight probe. There
is no HEAD-then-Range-then-MIME-sniff sequence in the source. The engine
is a *post-hoc classifier* that consumes the failure events emitted by
three player runtimes:

- HTML5 `<video>` `MediaError` (codes 1-4)
- `hls.js` `Hls.Events.ERROR` payloads (type/details/error)
- `mpegts.js` `LoadingEvents.LOADING_COMPLETE` errors with type/details/info

It does string-pattern matching against the error payload to decide which
of seven verdict codes applies, then renders a localized title +
description + "Open in external player" CTA. That is the entire surface.

For DaveTV, this means we get two things from IPTVnator:

1. **A taxonomy of seven verdicts** that maps cleanly onto user-facing
   messages - this is reusable.
2. **A vocabulary of failure patterns** (CORS, mixed-content, codec,
   early-EOF, DRM, etc.) we can encode into a real server-side probe.

What IPTVnator does NOT give us:

- A HEAD probe.
- A Range 0-0 probe.
- An MIME-sniff against actual fetched bytes.
- A redirect-chain trace.
- A latency or jitter measurement.
- A WAF / Cloudflare / hCaptcha detector.

These must be designed independently for HermesTV's `/diagnose` endpoint,
informed by the verdict taxonomy below.

## 2. The Verdict Engine (What IPTVnator Actually Does)

### 2.1 Inputs

The three classifier entry points live in
`iptvnator/libs/ui/playback/src/lib/playback-diagnostics/playback-diagnostics.util.ts`:

- `classifyNativePlaybackIssue(error, metadata)` - lines 36-88
- `classifyHlsPlaybackIssue(error, metadata)` - lines 90-146
- `classifyMpegTsPlaybackIssue(error, metadata)` - lines 148-209

Plus one pre-classification helper:

- `classifyUnsupportedHlsManifestCodecs(metadata)` - lines 211-231 - this
  one IS proactive: it calls `MediaSource.isTypeSupported()` for the
  codecs declared in the HLS manifest BEFORE attaching the stream, and
  short-circuits to `UnsupportedCodec` if Chromium can't decode them.

Each entry point takes a `PlaybackSourceMetadata` object - URL, extension,
container, mimeType, plus optional declared audio/video codecs - that was
built by `createPlaybackSourceMetadata()` in
`playback-media-source.util.ts` (lines 81-96).

### 2.2 Pattern Matchers

Defined in `playback-error-patterns.util.ts`:

| Helper | What it matches | File:line |
|---|---|---|
| `isNetworkFailure(type, details)` | `network`, `loaderror`, `timeout`, `status` | lines 19-27 |
| `isBrowserAccessFailure(details)` | `cors`, `cross-origin`, `access-control`, `content security policy`, `mixed content`, `private network access`, `err_blocked`, `err_cleartext`, `not allowed to load local resource` | lines 29-46 |
| `isEarlyEofFailure(details)` | normalized `earlyeof` (strips non-alnum) | lines 48-51 |
| `isCodecFailure(details)` | `codec`, `incompatiblecodecs`, `addcodec` | lines 53-59 |
| `isDrmOrEncryptionFailure(details)` | `decrypt`, `keysystem`, `keyload`, `license`, `drm` | lines 61-69 |

These patterns are the canonical vocabulary - any server-side probe
HermesTV builds should produce the same tokens so the same matchers can
classify the result.

### 2.3 Container/Codec Heuristics

In `playback-media-source.util.ts`:

- `UNSUPPORTED_CONTAINER_EXTENSIONS` (lines 8-24) - 14 entries:
  `avi, asf, divx, flv, m2ts, m4v, mkv, mov, mpeg, mpg, rm, rmvb, ts, vob, wmv`
- `BROWSER_LIMITED_CODEC_PATTERNS` (lines 70-79) - 5 entries:
  HEVC (`hev1|hvc1|hevc|h265`), AC-3, E-AC-3, DTS, MPEG-2 Video
- `isLikelyContainerIssue(metadata)` (lines 139-147) is the gate that
  decides whether native MediaError code 4 ("source not supported") gets
  classified as `UnsupportedContainer` vs `UnsupportedCodec`.

Important nuance from the test suite (lines 91-103 of
`playback-diagnostics.util.spec.ts`): `video/mp2t` MIME-only failures are
classified as **codec**, not container - because MPEG-TS is a transport
stream Chromium handles fine when the codecs inside are supported.

## 3. Verdict Taxonomy

Seven user-facing verdict codes, defined in `playback-diagnostics.model.ts`
lines 6-14:

| Code | Trigger | External-fallback recommended? |
|---|---|---|
| `unsupported-container` | Native error code 4 + extension in unsupported list, OR mpegts "format"/"mse" details | yes |
| `unsupported-codec` | Native error code 4 + codec-shaped MIME, OR HLS/mpegts codec-pattern match, OR `MediaSource.isTypeSupported` returns false | yes |
| `media-decode-error` | Native error code 3, OR HLS `media`/`mux` error type, OR mpegts early-EOF | yes |
| `network-error` | Native error code 2 with no access-failure substring, OR HLS/mpegts `network`/`timeout`/`status` details | NO (operator-side, not client-side) |
| `browser-access-error` | Any of the `isBrowserAccessFailure` patterns: CORS, mixed-content, CSP, private network access, blocked cleartext | yes |
| `drm-or-encryption` | `decrypt`, `keysystem`, `keyload`, `license`, `drm` substring | yes |
| `unknown-playback-error` | Default - no other matcher fired | no |

The `externalFallbackRecommended` flag (`isExternalFallbackRecommended`,
util.ts lines 266-274) is the single bit that drives IPTVnator's "Open
in VLC / mpv / external player" CTA visibility. It is ON for everything
EXCEPT `network-error` and `unknown-playback-error`, because those are
not solved by switching client renderer.

The user-facing strings are i18n keys (e.g.
`PLAYBACK.DIAGNOSTICS.UNSUPPORTED_CONTAINER.TITLE`) resolved at render
time in `web-player-view.component.ts`. The translation keys are NOT
included in this doc - the implementer should pick HermesTV-tone copy
(grandma-friendly per project memory) rather than copy IPTVnator's
phrasing.

## 4. Gap Analysis vs HermesTV `play.js` + `hlsProxy.js`

Today HermesTV emits NO post-mortem verdicts. The play surface emits only
**resolve-time** errors via `failures[]` in the 503 response of `_tryNext`
(`routes/play.js` lines 384-396):

| HermesTV failure reason | Emitted from | IPTVnator verdict it maps to |
|---|---|---|
| `no_item_id` | play.js:403 | none (config, not playback) |
| `resolver_threw` | play.js:411 | none (config) |
| `unresolved` | play.js:417 | none (config) |
| `upstream_fetch_failed` | play.js:469 (proxyPlaylist catch) | `network-error` (currently no distinction between unreachable and WAF-blocked) |
| `direct_stream_failed` | play.js:502 (proxyDirectStream catch) | `network-error` |
| `upstream_segment_error` (status >= 400) | hlsProxy.js:296 | none - swallowed, client sees HTTP 502 only |
| `upstream_stream_error` | hlsProxy.js:413 | none - swallowed |

### 4.1 Verdicts HermesTV Does NOT Yet Produce

Cross-referencing IPTVnator's seven codes against HermesTV's reality:

1. **`unsupported-container`** - never emitted. HermesTV does not currently
   inspect the resolved URL extension or Content-Type to warn the player
   it's about to send `.mkv` to a Chromium `<video>` element.

2. **`unsupported-codec`** - never emitted. HermesTV does not parse HLS
   manifests for `CODECS=` attributes and does not call any pre-flight
   `MediaSource.isTypeSupported` style check.

3. **`media-decode-error`** - never emitted server-side (this is properly
   a player-side verdict that requires reflecting the client's error
   back to the diagnostic surface).

4. **`browser-access-error`** distinguished from network - HermesTV
   collapses everything into `upstream_fetch_failed`. It cannot tell the
   user "your TV browser blocked mixed content" vs "the upstream is
   down". This is the most user-impactful gap.

5. **`drm-or-encryption`** - never emitted. `lib/hlsProxy.js` rewrites
   `#EXT-X-KEY` URIs through the proxy but does not surface that the
   upstream IS encrypted and the key fetch failed.

6. **WAF/Cloudflare-block detection** (an IPTVnator gap too, but a known
   real-world failure mode for paid IPTV) - never detected. xTremeHD
   panels rate-limit and return 429/403 with Cloudflare HTML bodies;
   HermesTV currently surfaces these as opaque `upstream_segment_error`.

### 4.2 Top 3 Most Valuable to Add

In priority order for user impact:

1. **`browser-access-error`** - because TV browsers commonly fail CORS /
   mixed-content silently. Without this verdict, Mom sees a black screen
   and "playback don't work".
2. **`unsupported-codec`** - because HEVC-only streams (common on
   xTremeHD's 4K tier) will never play on Tizen UN-class TVs; we should
   know this BEFORE we ticket.
3. **WAF/Cloudflare-block** - because rate-limited xTremeHD bursts look
   identical to "provider down" today, and the auto-fallback in `play.js`
   walks to the next source without telling the user WHY.

## 5. Proposed HermesTV API Surface

### 5.1 Endpoint

```
GET /api/play/:ticket/diagnose
```

Bound to an existing ticket from POST /api/play. Reuses the ticket's
internal source list so the diagnostic runs against the SAME upstream the
player is trying (or just tried).

Optional query: `?source_index=N` to pin which source in the ticket to
diagnose. Default: 0 (the active/primary).

### 5.2 Probe Sequence (Server-Side, Designed Fresh)

Run sequentially with hard timeouts; collect all results then classify:

| Step | What it tests | Timeout | Produces |
|---|---|---|---|
| 1. Resolve | `streamResolver.resolveStreamUrl(item_id)` | 200ms | `unresolved` (config), or upstream URL |
| 2. HEAD | upstream URL with VLC UA | 3s | `network-error`, `waf-block` (Cloudflare/server name in headers), redirect target, `content-type` |
| 3. Range 0-0 | GET with `Range: bytes=0-0` (sniff first bytes; some upstreams 403 HEAD) | 3s | first bytes (for MIME sniff), `media-decode-error` candidate (early-EOF) |
| 4. MIME sniff | compare HEAD/Range Content-Type to expected (m3u8 vs ts vs mp4) | local | `unsupported-container` (e.g. wmv served), `wrong-content-type` (HTML body where m3u8 expected) |
| 5. Redirect chain | record up to 5 hops; flag if final host differs from initial | local | `redirect-loop`, leaked-creds risk |
| 6. CSP/CORS pre-check | issue an `Access-Control-Allow-Origin` HEAD from origin = HermesTV web app | 3s | `browser-access-error` predictor |
| 7. Latency | total time for steps 2+3 | local | warning flag if > 1500ms |

All seven steps run server-side. The CLIENT never makes a probe request -
the credentialed URL must never appear in the browser network panel
(per the security contract in `lib/hlsProxy.js` lines 6-16).

### 5.3 Response Shape

```
200 OK
{
  "ticket": "play-xxx",
  "source_index": 0,
  "provider_id": "xtremehd",
  "verdict": {
    "code": "browser-access-error",         // one of the 7 + WAF + redirect-loop
    "external_fallback_recommended": true,
    "title_key": "PLAYBACK.DIAGNOSE.BROWSER_ACCESS.TITLE",
    "description_key": "PLAYBACK.DIAGNOSE.BROWSER_ACCESS.DESCRIPTION"
  },
  "probes": {
    "resolve":      { "ok": true,  "ms": 12 },
    "head":         { "ok": true,  "status": 200, "ms": 412,
                      "server": "cloudflare", "content_type": "application/vnd.apple.mpegurl" },
    "range_zero":   { "ok": true,  "status": 206, "ms": 380, "sniff": "m3u8" },
    "mime_match":   { "expected": "application/vnd.apple.mpegurl",
                      "actual":   "application/vnd.apple.mpegurl", "match": true },
    "redirect":     { "hops": 1, "final_host_changed": false },
    "cors":         { "allow_origin": null, "would_block": true },
    "latency_ms":   792
  },
  "issued_at": "2026-05-20T19:00:00.000Z"
}
```

### 5.4 Redaction Rules (Non-Negotiable)

The diagnose response is rendered by the player UI and may end up in
proof artifacts. So:

1. **Never include the upstream URL.** Not even with creds stripped.
   Show only `provider_id` and `source_index`.
2. **Never include credentials in any form**, not in `redirect.hops`,
   not in `head.location`, not in error messages. Pass every string
   through `lib/sanitizeLog.sanitizeForLog` before emitting.
3. **Allow `head.server` header** (e.g. `cloudflare`, `nginx`) - it's
   useful for WAF detection and contains no secret.
4. **Allow `content_type`** - it's a MIME type, not a credential.
5. **Redirect hops**: emit `final_host_changed: boolean`, NOT the host
   names. The boolean is enough signal for diagnostics.
6. **Verdict description text** must be a translation key, not a
   formatted string with the URL inside it.

### 5.5 Auth + Rate Limit

- Diagnose endpoint inherits ticket TTL (5 min, per
  `routes/play.js:30`) - expired ticket -> 410.
- Rate-limit to 1 diagnose per ticket per 5 seconds, since each call
  hits the upstream provider 2-3x.
- HEAD with `Range: bytes=0-0` only - never download a full segment for
  diagnostic purposes.

## 6. Citation Index for Reimplementation

Use these file:line pairs when re-reading IPTVnator in context. All
under `iptvnator/libs/ui/playback/src/lib/playback-diagnostics/`.

### Verdict codes
- `playback-diagnostics.model.ts:6-14` - the 7 codes
- `playback-diagnostics.model.ts:78-91` - `PlaybackDiagnostic` shape
- `playback-diagnostics.util.ts:266-274` - `isExternalFallbackRecommended`

### Native MediaError mapping (HTML5 video)
- `playback-diagnostics.util.ts:36-88` - `classifyNativePlaybackIssue`
- `playback-diagnostics.util.ts:32-34` - the 3 native error code constants
- `.spec.ts:51-89` - native decode + unsupported source tests
- `.spec.ts:196-227` - native CORS classification + opaque-failure test

### HLS error mapping (hls.js)
- `playback-diagnostics.util.ts:90-146` - `classifyHlsPlaybackIssue`
- `playback-diagnostics.util.ts:211-231` - proactive codec check (the
  ONLY pre-flight step IPTVnator has)
- `.spec.ts:12-49` - codec error tests
- `.spec.ts:105-194` - network vs browser-access tests

### MPEG-TS error mapping (mpegts.js)
- `playback-diagnostics.util.ts:148-209` - `classifyMpegTsPlaybackIssue`
- `.spec.ts:229-281` - mpegts early-EOF + codec + format tests

### Pattern matchers (the vocabulary HermesTV should adopt)
- `playback-error-patterns.util.ts:19-27` - `isNetworkFailure`
- `playback-error-patterns.util.ts:29-46` - `isBrowserAccessFailure`
  (the 13 substrings)
- `playback-error-patterns.util.ts:48-51` - `isEarlyEofFailure`
- `playback-error-patterns.util.ts:53-59` - `isCodecFailure`
- `playback-error-patterns.util.ts:61-69` - `isDrmOrEncryptionFailure`
- `playback-error-patterns.util.ts:6-17` - `normalizeErrorDetails`
  (the string-flatten helper - useful for HermesTV's log sanitization)

### Container / codec / extension knowledge
- `playback-media-source.util.ts:8-24` - 14 unsupported container exts
- `playback-media-source.util.ts:26-32` - container name aliases
  (matroska, quicktime, x-msvideo)
- `playback-media-source.util.ts:34-58` - declared-extension query-string
  inference (`?extension=ts`, `?format=m3u8`)
- `playback-media-source.util.ts:60-68` - non-media path-extension list
  (php, aspx, jsp - keep DaveTV from inferring `.php` is the container)
- `playback-media-source.util.ts:70-79` - 5 browser-limited codec
  patterns (HEVC, AC-3, E-AC-3, DTS, MPEG-2 video)
- `playback-media-source.util.ts:127-137` - `getLikelyBrowserUnsupportedCodecLabels`
  (returns user-readable labels - reusable verbatim under MIT)
- `playback-media-source.util.ts:139-147` - `isLikelyContainerIssue`

## 7. What This Doc Is Not

- Not an implementation plan. The `/diagnose` endpoint is a proposal; a
  separate plan-doc must wire it into `play.js`, write tests under
  `services/hermes-tv-api/test/`, and gate it behind the truth-proof
  contract in `docs/46`.
- Not a guarantee any HermesTV verdict will land in this release. The
  gap-analysis in Section 4 documents what is *missing*, not what is
  scheduled.
- Not a copy/paste source. The implementer should re-read IPTVnator
  using the citation index in Section 6 and translate patterns into
  HermesTV's ES5 / CommonJS style (see existing `hlsProxy.js` as the
  reference).

End of extraction.

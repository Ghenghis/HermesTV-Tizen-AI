# 05 - Extreme-InfiniTV Stream Diagnostics: Verdict-Engine Extraction

Generated: 2026-05-20
Agent: 06 of the 20-agent DaveTV reference-extraction swarm
Source (read-only):
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\stream-diagnostic.js`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\stream-headers.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\playlist-health.ts`
- `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\i18n\en.json` (verdict copy)

HermesTV files referenced:
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\hlsProxy.js`
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\routes\play.js`

## License Boundary - PATTERN ONLY

Upstream license: **GPL-3.0-or-later**. Copyleft. Verbatim copying
would force HermesTV (and every downstream Hostinger / Tizen / Web
client) to ship under GPL-3.0-or-later, which is incompatible with
HermesTV's current posture.

**Adoption mode is PATTERN ONLY.** This document describes the
*shape* of Extreme's diagnostic engine - which response surfaces it
inspects, which verdict buckets it bins them into, and which user-
facing strings it emits. Re-implementation in HermesTV must be
written from this prose, not adapted from GPL source. No code
fragment in this document exceeds the hard rule of zero verbatim GPL.

## Truth-Gate Banner (per docs/46)

Architecture extraction only - not a feature claim. The
"Implemented" column in Section 5 reflects code inspection of
`hlsProxy.js` and `play.js` at the commit in git status. No tests run.

## 1. Surface Area

`stream-diagnostic.js` (323 LOC) is the only upstream file that runs
end-to-end probes against a stream URL. It exposes two functions:

1. A probe runner that takes a URL plus an `onUpdate` callback.
   Callback fires after each stage (HEAD lands, playlist lands,
   first-segment HEAD lands) so the dialog renders partial results.
   Stage failures are captured into the report, not thrown.

2. A summarizer that bins the final report into one of five verdict
   buckets: `unknown`, `info`, `warn`, `fail`, `ok`. The verdict +
   a localized reason string is what the user sees.

The probe runs entirely from the renderer process. No server-side
companion. `providerFetch` is the upstream wrapper that folds in
operator-pasted UA / Referer headers (Section 2).

## 2. Per-Channel Headers (`stream-headers.ts`, 46 LOC)

Extreme honors two playlist-level VLC directives captured by the M3U
parser: `#EXTVLCOPT:http-user-agent` and `#EXTVLCOPT:http-referrer`.
The TS file pushes UA into the WebView. Coverage:

- **Android WebView**: UA via JS-bridge into `WebSettings`. Referer
  cannot be set per-request from a WebView.
- **Desktop wry**: UA only at WebView construction - per-channel is
  a no-op. Global UA must be set in Settings -> Network.
- **Web build**: browsers reject scripted UA / Referer overrides.

HermesTV pattern fit: the server-side proxy is the natural place to
apply per-channel UA because Node's `fetch` has no browser-imposed
restriction. `hlsProxy.proxyPlaylist` already pins `VLC/3.0.20
LibVLC/3.0.20` globally - upgrading to per-source UA is one lookup.

## 3. Response Headers Inspected

The engine captures these fields per response (one HEAD, one
playlist GET, one first-segment HEAD):

| Field | Used to decide |
|---|---|
| `status` | fail (non-2xx) vs candidate-ok |
| `statusText` | shown raw on non-2xx |
| `ok` | status in [200, 300) OR 206 |
| `content-type` | gates HLS descent (regex `mpegurl`) |
| `content-length` | size sanity (rendered, not gated) |
| `latencyMs` | rendered, not gated |
| `method` | HEAD or "GET (range)" audit trail |

**HEAD-first with single-byte ranged-GET fallback**: when an upstream
rejects HEAD outright (common with budget HLS edge nodes), the engine
retries `GET` with `Range: bytes=0-0` and accepts a 206. Most-reused
pattern in the file.

Extreme does NOT currently inspect `accept-ranges`, `etag`,
`expires`, `last-modified`, `cache-control`, `age`, `server`, or
`via` for verdict purposes. HermesTV's `hlsProxy.streamSegment`
already *forwards* `accept-ranges` / `cache-control` / `etag` /
`last-modified` to the client, so HermesTV responses carry strictly
more diagnostic surface than Extreme's probe consumes today.

### Extended header pattern (recommended for HermesTV)

Documented to capture the brief's enumeration. Not in upstream
engine - patterns from RFC 9110 / RFC 8216 a complete diagnostic
should weigh.

| Header | What it tells the verdict engine |
|---|---|
| `content-type` | `application/vnd.apple.mpegurl` / `application/x-mpegURL` / `audio/mpegurl` / `application/octet-stream` on a `.m3u8` URL = HLS. `video/MP2T` or `video/mp4` = direct segment (Xtream live `.ts`). Anything else on `.m3u8` = HTML error disguised as 200. |
| `content-length` | Manifest < ~200 bytes suspicious (empty or HTML stub). Manifest > 2 MB suspicious (master misrouted). Segment of 0 bytes = most common silent failure. |
| `accept-ranges: bytes` | Required for HLS byte-range support, DVR seek, resume. Absence on VOD HLS predicts seek failure. |
| `etag` / `last-modified` | Drive conditional revalidation. Identical `etag` across two `EXT-X-TARGETDURATION` windows = stream stalled at origin. |
| `expires` / `cache-control` | `max-age` > `EXT-X-TARGETDURATION` = upstream misconfig (clients play stale window indefinitely). `no-store` / `no-cache` on live HLS is correct; absence is suspicious. |
| `age` | High age (> targetDuration) on live manifest = CDN POP serving stale. |
| `server` / `via` | Audit trail. Recognizes Apollo Group silently 302ing into Cloudflare, or iptv-org bounced through community mirror. |
| `set-cookie` | Should be empty. Presence = upstream session-tracking the player. |
| `www-authenticate` on 401 | Distinguishes "credentials wrong" (Basic / Bearer) from "credentials expired" (custom realm). |
| `retry-after` on 429 / 503 | Drives backoff for auto-fallback walker. |

## 4. Playlist-Health Checks for HLS m3u8

Extreme's parser recognizes a narrow tag set. RFC 8216 carries many
more.

### Tags Extreme parses today

| Tag | Used for |
|---|---|
| `#EXT-X-TARGETDURATION:` | rendered, not gated |
| `#EXTINF:` | summed into `totalDuration`; descent to master variant |
| `#EXT-X-STREAM-INF:` | `BANDWIDTH`/`RESOLUTION`/`CODECS`; `isMaster=true` signal |
| Unprefixed line | segment or variant URI; first-segment HEAD target |

### Tags Extreme does NOT inspect (recommended additions)

| Tag | What it tells the verdict engine |
|---|---|
| `#EXT-X-VERSION:` | Protocol version. Absence implies v1. Version > 7 with non-modern client = known-incompatible fail-fast. |
| `#EXT-X-MEDIA-SEQUENCE:` | Required on live media. Absence on non-ENDLIST manifest is spec violation (hls.js rejects). Two fetches with identical value = origin stalled. |
| `#EXT-X-ENDLIST` | Presence => VOD (seekable). Absence => LIVE (sliding window). Tells player which UX to render. |
| `#EXT-X-PLAYLIST-TYPE:` | `VOD` or `EVENT`. Distinguishes DVR-able EVENT from pure VOD. |
| `#EXT-X-KEY:METHOD=` | `NONE`=unencrypted. `AES-128`=fetchable AES key (`hlsProxy._rewriteUriAttr` already handles). `SAMPLE-AES`/Widevine/FairPlay=DRM beyond capability - fast-fail with clear message. |
| `#EXT-X-BYTERANGE:` | Segment is a byte slice. Requires `accept-ranges: bytes` upstream. Cross-check segment HEAD. |
| `#EXT-X-MAP:URI=` | Init segment (fMP4). HEAD the init segment in addition to first media segment. |
| `#EXT-X-DISCONTINUITY` | Frequent discontinuities on live = ad-stitching failures. |
| `#EXT-X-INDEPENDENT-SEGMENTS` | Each segment independently decodable - affects seek behavior. |
| `#EXT-X-START:TIME-OFFSET=` | If TIME-OFFSET > `totalDuration`, manifest malformed. |

### Derived sanity checks (any media playlist)

1. `EXT-X-TARGETDURATION` >= longest `EXTINF`. Spec-mandated, widely violated.
2. Live manifest (no `ENDLIST`) should have 3-10 segments in window. Outside = suspicious.
3. VOD `totalDuration` should match sum of `EXTINF` within +/- 0.5s of `TARGETDURATION`.
4. Master playlist needs >= 1 variant with `RESOLUTION` and `BANDWIDTH`. Zero-variant master = upstream parse fail.

## 5. Per-Verdict User-Message Taxonomy

Verdicts emitted by `summarizeReport(report)`:

| Verdict | Fires when | User-facing copy (en.json) |
|---|---|---|
| `unknown` | report null/undefined | (no string - caller suppresses) |
| `info` | non-HTTP URL (rtsp/rtmp/udp/mms) | `{scheme}:// streams can't be probed from the browser. Play in MPV or VLC to verify.` |
| `fail` | HEAD network-level fail | `Couldn't reach the stream: {error}` |
| `fail` | HEAD non-2xx | `Provider responded {status}.` |
| `fail` | Playlist GET network-level fail | `Couldn't fetch the HLS playlist: {error}` |
| `fail` | Playlist GET non-2xx | `Playlist responded {status}.` |
| `warn` | Playlist OK, first-segment HEAD net-fail | `First segment HEAD failed: {error}` |
| `warn` | Playlist OK, first-segment HEAD non-2xx | `First segment responded {status}.` |
| `ok` | Master parsed; first segment reachable | `Master playlist OK; first segment reachable.` |
| `ok` | Media parsed; first segment reachable | `Media playlist OK; first segment reachable.` |
| `ok` | Non-HLS endpoint reachable | `Endpoint reachable.` |

Severity: `fail` > `warn` > `info` > `ok` > `unknown`.

Manifest-parsable + first-segment-broken downgrades to `warn`
because many edge nodes 503 the *first* segment while later
segments serve fine. Correct for "test this stream" dialog; for the
*play* path, any segment 503 should be `fail` and the auto-fallback
walker should advance.

## 6. Gap Analysis vs HermesTV

### `hlsProxy.js` (481 LOC)

- Fetches playlists with VLC UA, identity encoding, 8s timeout.
  Forwards `content-type`, `content-length`, `content-range`,
  `accept-ranges`, `cache-control`, `last-modified`, `etag`.
- Rewrites every segment URL + every `URI=`-bearing tag through
  `/api/proxy/<ticket>/seg/<b64>`. Tags recognized: `EXT-X-MAP`,
  `EXT-X-MEDIA`, `EXT-X-KEY`, `EXT-X-PART`, `EXT-X-PRELOAD-HINT`,
  `EXT-X-I-FRAME-STREAM-INF`, `EXT-X-SESSION-KEY`,
  `EXT-X-SESSION-DATA`.
- Does NOT parse playlist beyond rewriting. No `TARGETDURATION`,
  `EXTINF` summing, master-vs-media classification.
- SSRF guard: `http://` / `https://` only.

### `play.js` (613 LOC)

- Walks `ticket.internal.sources[]` with per-source try/catch.
  Records outcomes via `streamProbe.recordProviderOutcome`.
- HLS upstreams -> `hlsProxy.proxyPlaylist`. Non-HLS credentialed
  -> `hlsProxy.proxyDirectStream`. Clean public -> 302.
- 503 envelope on all-fail includes `providers_attempted` +
  `failures[]` with `reason` and sanitized `detail`.
- Does NOT pre-flight probe before ticket issue.

### Top-3 missing checks

1. **No header-based pre-flight verdict.** Nothing inspects upstream
   headers before handing the client a `stream_endpoint`. A dead
   source is discovered only when the player emits a media error.
2. **No playlist-body sanity.** `rewritePlaylist` discards everything
   except URI-bearing tags and segment URIs. Cannot detect
   zero-variant master, unsupported `EXT-X-VERSION`, `SAMPLE-AES`
   (Widevine) we can't decrypt, or absent `EXT-X-MEDIA-SEQUENCE` on
   live manifest.
3. **No first-segment probe.** `proxyPlaylist` returns as soon as
   the manifest GET succeeds. Common failure mode "manifest 200,
   first segment 503" propagates to player instead of triggering
   auto-fallback.

## 7. Recommended HermesTV Additions

PATTERN ONLY - derivable from this prose + RFC 8216 / RFC 9110.

### `services/hermes-tv-api/src/lib/hlsProxy.js`

Add `diagnoseManifest({ upstreamUrl, fetchImpl })`:

- HEAD (with `Range: bytes=0-0` GET fallback) the upstream URL.
- Capture `status`, `content-type`, `content-length`,
  `accept-ranges`, `etag`, `last-modified`, `cache-control`, `age`,
  `server`, `via`, `retry-after`, `www-authenticate`.
- If `content-type` matches `mpegurl`, GET the body and run
  `_parseManifestForHealth(body)`:
  - Count variants (`#EXT-X-STREAM-INF` lines).
  - Count segments (non-`#` lines following `#EXTINF`).
  - Read `EXT-X-TARGETDURATION`, `EXT-X-MEDIA-SEQUENCE`,
    `EXT-X-VERSION`, presence of `EXT-X-ENDLIST`, `EXT-X-KEY METHOD=`.
  - Cross-check `TARGETDURATION >= max(EXTINF)`.
- On master: descend top variant, repeat.
- On final media playlist: HEAD first segment URL (same fallback).
  Capture `status`, `content-type`, `content-length`, `accept-ranges`.
- Return `{ headers, playlist, firstSegment, verdict, reason }`
  using Section 5 taxonomy.

Must NEVER throw. Every error -> `verdict: 'fail'` with sanitized reason.

### `services/hermes-tv-api/src/routes/play.js`

Three integration points:

1. **New `GET /api/play/:ticket/diagnose`**: returns diagnostic
   envelope for the ticket's active source. Settings UI "Test this
   channel" calls this. Reuses ticket TTL + SSRF guard. Ticket
   itself is the cap.
2. **Optional pre-flight in `_tryNext(i)`**: before
   `hlsProxy.proxyPlaylist`, call `diagnoseManifest` with sub-second
   timeout. Verdict `fail` -> jump straight to `_tryNext(i+1)` without
   burning the longer fetch. Enable only when
   `sourceHealth.status` is `unknown` or `degraded` - healthy sources
   skip pre-flight to stay on fast path.
3. **First-segment probe**: in `proxyPlaylist` success path, queue
   fire-and-forget HEAD against first rewritten segment. 5xx within
   2s -> `recordProviderOutcome(providerId, false)` despite manifest
   succeeding. Catches "manifest 200, segments 503".

### `streamProbe.js` (existing)

No file changes required. `diagnoseManifest` consumes existing
`recordProviderOutcome(providerId, ok)` API. Optionally extend the
rolling-window state to record verdict reason codes so
`catalogMerge` can deprioritize sources with structural failures
(`drm_unsupported`, `playlist_malformed`) separately from transient
network failures.

### Wiring constraint

No GPL source lands in any HermesTV file. Recommendations are
derivable from RFC 8216, RFC 9110, and the HermesTV code already in
tree. The Extreme source was consulted only to confirm that the
*shape* of the probe (HEAD-then-fallback-GET, master descent,
single-segment HEAD) is a known-good industry pattern - not to copy
implementation.

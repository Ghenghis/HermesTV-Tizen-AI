# 11 — ynotv Stream Resolver (cross-reference vs DaveTV)

> **License: AGPL — pattern-only extraction. No source copying. See docs/reference-apps/LICENSE_ATTRIBUTION.md.**
>
> Source repo: `G:\Github\IPTV-Apps\ynotv\` — packaged as `@ynotv/core`, `@ynotv/local-adapter`, `@ynotv/ui`, and a Tauri-side Rust DVR module. License confirmed at `G:\Github\IPTV-Apps\ynotv\LICENSE` (GNU AGPL v3, 19 Nov 2007).
>
> DaveTV cross-reference rooted at `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\`.

---

## 1. Scope

ynotv resolves a logical channel/movie/episode identifier into a playable HTTP URL across four provider archetypes: **Xtream Codes**, **plain M3U**, **Stalker / MAG portal**, and an `epg` source type (metadata-only — never resolves to a stream). HLS vs MPEG-TS vs direct-file dispatch is decided by the provider's URL template or the file extension already encoded in the upstream payload. Jellyfin is **not** an in-tree provider in ynotv — its UI integrates Stremio/TMDB instead; Jellyfin parity is a DaveTV-only concern.

---

## 2. Identifier shape and dispatch

ynotv stores every channel as a `Channel` record carrying a `direct_url` plus a `source_id` (see `packages/core/src/types.ts:62-76`). The resolver decides what to do with `direct_url` based on the **source type lookup** rather than parsing the ID itself:

| Source `type` | `direct_url` shape | Resolver action |
|---|---|---|
| `m3u` | absolute HTTP URL (already playable) | pass through; only attach `User-Agent` override |
| `xtream` (live) | absolute `…/live/u/p/<id>.ts` URL built at sync time | pass through; rebuild only for **catchup** |
| `xtream` (catchup) | n/a — caller passes `CatchupOptions` | rebuild on demand via `XtreamClient.buildTimeshiftUrl` |
| `stalker` | opaque token: `stalker_ch:<cmd>`, `stalker_vod:<id>:<cmd>`, `stalker_episode:<m>:<s>:<e>:<cmd>`, or `/media/...` | round-trip to portal `create_link`, then clean+absolutize the returned URL |

The single shared entry point is `resolvePlayUrl()` in `packages/ui/src/services/stream-resolver.ts`. It's called from four places: live-TV load, live-TV catchup, VOD movie/series, and the Tauri DVR pre-resolve handler. Returns `{ url, userAgent?, sourceName? }` and **throws** on Stalker network/auth failure so each caller can render a user-visible error.

Provider classification flow:

```mermaid
flowchart TD
    A[resolvePlayUrl<br/>sourceId, rawUrl, catchup?] --> B{lookup source}
    B -->|missing| Z[return rawUrl as-is]
    B -->|stalker AND<br/>token-shaped url| C[StalkerClient.resolveStreamUrl<br/>round-trip to portal]
    B -->|xtream AND<br/>catchup defined| D[XtreamClient.buildTimeshiftUrl<br/>recompute UTC offset]
    B -->|m3u OR xtream live| E[pass-through<br/>+ user_agent header]
    C --> F[{ url, userAgent, sourceName }]
    D --> F
    E --> F
```

---

## 3. Xtream URL templating

ynotv's Xtream client targets the canonical `player_api.php` panel. Its URL builders live at `packages/local-adapter/src/xtream-client.ts:69-90, 427-437`. The templates exactly match the Xtream-Codes spec:

| Type | Pattern | Default extension |
|---|---|---|
| Live | `<base>/live/<u>/<p>/<stream_id>.<ext>` | `ts` |
| VOD movie | `<base>/movie/<u>/<p>/<stream_id>.<ext>` | provider-supplied `container_extension`, else `mp4` |
| Series episode | `<base>/series/<u>/<p>/<episode_id>.<ext>` | provider-supplied `container_extension`, else `mp4` |
| Timeshift | `<base>/timeshift/<u>/<p>/<duration_minutes>/<YYYY-MM-DD:HH-MM>/<stream_id>.<ext>` | `ts` |

Key invariants:
1. `baseUrl` is normalized once in the constructor — trailing slash stripped via regex; subsequent URL composition never re-checks.
2. `username` and `password` are always `encodeURIComponent`-wrapped (handles `@`, `+`, `%` in operator credentials).
3. Timeshift formatting uses **UTC** components from a `Date`. The start time string format is non-ISO: `YYYY-MM-DD:HH-MM` (colon between date and hour, hyphen between hour and minute).
4. Server timezone drift is corrected in the resolver itself, **not** in the client: `resolvePlayUrl()` calls `XtreamClient.authenticate()` to fetch `server_info.time_now` (string) and `server_info.timestamp_now` (epoch seconds). The drift between them is the panel's effective timezone offset in milliseconds, added to the EPG start time before formatting the timeshift URL.

Auth model: `player_api.php?username=…&password=…&action=…` — credentials are query params on **every** API call. There is no token; freshness is "creds are still valid". On 401-style responses (`{user_info: {auth: 0}}`), the panel is dead.

---

## 4. M3U parser

`packages/local-adapter/src/m3u-parser.ts` produces `Channel[] + Category[] + epgUrl`. Notable design decisions:

- **Stable stream IDs**: when `tvg-id` is present, the channel ID is `<sourceId>_<sanitised_tvg_id>`. On collision (multiple entries share a `tvg-id`, e.g. ESPN primary+backup), a DJB2 hash of the URL is appended. If both collide, an integer counter is appended. The rationale (per the file's comments) is that favourites and custom-group memberships survive re-sync.
- **Catchup tag detection**: parses `catchup`, `catchup-days`, and `catchup-source` attributes from `#EXTINF`. Any of the three present marks the channel `tvArchive: true`.
- **Channel ordering**: `tvg-chno` is parsed for explicit ordering; otherwise file order via a `providerOrder` counter.
- **Fetch transport selection**: `fetchAndParseM3U()` probes for `window.__TAURI__`, then `window.fetchProxy` (Electron), then plain global `fetch` — a three-way fallback so the same parser runs in Tauri/Electron/browser.

There's no separate parser for the Xtream-style `get.php?type=m3u_plus` output — it's served as a normal M3U.

---

## 5. Stalker resolution (the heavy lift)

ynotv's most differentiated capability is the Stalker MAG-portal client (`packages/local-adapter/src/stalker-client.ts`, ~1270 lines). Sequence:

```mermaid
sequenceDiagram
    participant U as UI / resolvePlayUrl
    participant S as StalkerClient
    participant P as Portal (load.php / portal.php)

    U->>S: new StalkerClient({baseUrl, mac, userAgent})
    Note over S: Build header set:<br/>MAG250 UA, cookie mac/timezone/stb_lang,<br/>X-User-Agent device hint
    U->>S: ensureToken()
    S->>P: handshake (no Authorization;<br/>cookies only)
    P-->>S: { token }
    S->>P: get_profile (full STB metrics, signature,<br/>Bearer token, token NOT in cookie<br/>for stalker_portal endpoint)
    P-->>S: profile / refreshed token
    U->>S: resolveStreamUrl("stalker_ch:/ch/12345_")
    S->>P: create_link?cmd=/ch/12345_&type=itv
    P-->>S: { url: "ffmpeg http://node/live/12345.ts" }
    Note over S: Strip ffmpeg/ffrt prefix;<br/>resolve relative path against baseUrl;<br/>absolutize via URL ctor
    S-->>U: clean http(s) URL
```

Token model: a real session token stored on the client, sent both as `Authorization: Bearer …` and (selectively) as a `token=` cookie. Important quirks gleaned from packet-capture-driven comments in the file:

1. **Endpoint discovery**: portal can be at `/portal.php`, `/stalker_portal/server/load.php`, `/stalker_portal/c`, or root. The client builds a fallback list and tries each on 404; reset retry counter when it falls back.
2. **Cookie/token rules differ by endpoint family**:
   - `portal.php`: token always in cookie when available.
   - `stalker_portal`: token in cookie for everything **except** `get_profile`.
3. **MAC URL-encoding**: for `stalker_portal` endpoints the MAC must be `%3A`-encoded inside the cookie (`mac=00%3A1A%3A79%3A00%3A0C%3A01`); for `portal.php` it stays literal.
4. **Channel cmd classification**: if `cmd` contains `/ch/` and ends with `_`, it needs `create_link` to mint a real URL. Otherwise (some "Dino" sources serve `/play/live.php?…`) the cmd IS the stream — `sanitizeStreamUrl` only strips the `ffmpeg`/`ffrt` MPV-side prefix.
5. **URL cleanup pipeline**: after `create_link` returns `response.url` (or falls back to `response.cmd`):
   - regex-strip leading `ffmpeg`/`ffrt`
   - if not absolute (`^https?://`), prefix with `baseUrl.origin` (when leading `/`) or resolve via `new URL(rel, base)`

---

## 6. DVR-side resolver (Rust)

`packages/app/src-tauri/src/dvr/stream_resolver.rs` is a parallel implementation for **scheduled recording**. It prefers a `stream_url` pre-resolved by the frontend (Rust cannot do MAG portal logic). For Xtream it regenerates from stored credentials at recording time (handles operator cred rotation across multi-week schedules). Stalker regeneration is explicitly NOT implemented Rust-side — falls back to stored URL with a warning. M3U assumes static URL. Xtream parse heuristic: scan path components for the literal `live` segment, take the next two as username/password.

---

## 7. Cross-reference: DaveTV today

DaveTV's dispatch lives at `services/hermes-tv-api/src/lib/streamResolver.js` (115 lines, ES5 CommonJS). Identifier-shape-driven:

| ID prefix | Backend module | Behaviour |
|---|---|---|
| `m3u-…` | `lib/m3uClient.js` | always `credential_bearing = true` → HLS proxy |
| `xtream-…` | `lib/xtreamClient.js` | always `credential_bearing = true` → HLS proxy |
| `iptv-…` | `lib/iptvOrg.js` | regex-checks URL, defaults to public 302 |

`/api/play/:ticket/stream` (`routes/play.js:322`) walks the merged sources list and on credential-bearing HLS routes through `lib/hlsProxy.js`: fetches upstream `.m3u8` with a `VLC/3.0.20` UA, rewrites every segment URL and every `URI="…"` on `#EXT-X-MAP`, `#EXT-X-MEDIA`, `#EXT-X-KEY`, `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT`, `#EXT-X-I-FRAME-STREAM-INF`, `#EXT-X-SESSION-KEY`, `#EXT-X-SESSION-DATA` to `/api/proxy/<ticket>/seg/<b64url>`. Non-HLS credential URLs use `proxyDirectStream` (TS passthrough). Xtream URL templates (`xtreamClient.js:456-477`) match ynotv exactly: `/live/u/p/id.ts`, `/movie/u/p/id.mp4`, `/series/u/p/id.mp4` with identical `encodeURIComponent` treatment.

---

## 8. Top-3 stream-resolver gaps in DaveTV

1. **No Stalker portal client.** `providerRegistry.js:179` reserves a `stalker-<id>` prefix but no resolver branch exists in `streamResolver.js`. To match ynotv we need: handshake/token persistence, MAC cookie encoding (with the per-endpoint variant rules), `create_link` round-trips with `ffmpeg`/`ffrt` prefix stripping, relative-URL absolutization, and the cmd-shape classifier (`/ch/…_` vs `/play/live.php` vs `/media/`). Stalker is the biggest provider-class miss; without it MAG-portal operator sources (still common in 2026 Eastern European IPTV) cannot be played.

2. **No Xtream timeshift / catchup URL builder.** `routes/catchup.js` is wired to surface catchup-tagged channels, but `lib/streamResolver.js` has no `/timeshift/u/p/duration/YYYY-MM-DD:HH-MM/stream_id.ts` template and no server-time-drift correction. ynotv's pattern (fetch `server_info.time_now` + `timestamp_now`, derive offset in ms, format start time as UTC `YYYY-MM-DD:HH-MM`) is the missing piece. Without it `has_catchup: true` channels return 501 even though all metadata is present.

3. **No `User-Agent` per-provider override + no Stalker-equivalent provider auth header pipeline.** ynotv's `Source.user_agent` flows from store → `resolvePlayUrl` → MPV. DaveTV's `m3uClient` and `xtreamClient` use either no UA or the proxy's hard-coded `VLC/3.0.20`. Several Xtream panels and Stalker portals block non-MAG-shaped User-Agents at the edge; without per-source UA the playback fails before our auto-fallback walker even sees the upstream. Related: DaveTV has no Stalker-style cookie/Bearer header pipeline at all (token, mac cookie, signature blob, MAG250 X-User-Agent).

Secondary: DaveTV's resolver is synchronous; ynotv's is async because Stalker and `server_info` round-trips can't be precomputed. Adopting Stalker forces `routes/play.js:409` callers to `async`. Master-playlist (`#EXT-X-STREAM-INF`) rewriting is flagged untested in `hlsProxy.js` — ynotv sidesteps it via MPV, but Stalker often returns master playlists, so verification is required.

---

## 9. References

- ynotv: `packages/ui/src/services/stream-resolver.ts`, `packages/local-adapter/src/{xtream-client,stalker-client,m3u-parser}.ts`, `packages/app/src-tauri/src/dvr/stream_resolver.rs`, `packages/core/src/types.ts`.
- DaveTV: `services/hermes-tv-api/src/lib/{streamResolver,xtreamClient,m3uClient,hlsProxy}.js`, `src/routes/{play,catchup}.js`.

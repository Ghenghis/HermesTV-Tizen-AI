# IPTV Programming Tools — HermesTV Relevant

Curated from https://github.com/iptv-org/awesome-iptv — libraries and self-hosted tools evaluated for HermesTV backend use.

---

## Tool Matrix

| Tool | npm/repo | Purpose | HermesTV use |
|---|---|---|---|
| `@iptv/xmltv` | npm:@iptv/xmltv | Fast XMLTV parser+generator | Parse EPG feeds from Apollo/XtremeHD |
| `@iptv/playlist` | npm:@iptv/playlist | M3U parser+generator | Parse provider M3U playlists |
| `@iptv/xtream-api` | npm:@iptv/xtream-api | Xtream Codes API standardized format | Apollo Group + XtremeHD Xtream integration |
| `iptv-checker` | npm:iptv-checker | Stream health checker Node.js | Pre-scan streams before adding to catalog |
| `Threadfin` | ghcr.io/threadfin/threadfin | M3U proxy for Jellyfin/Emby | Already in backend stack — M3U+XMLTV proxy |
| `hls-restream-proxy` | github:lyx0/hls-restream-proxy | HLS reverse proxy with header injection | HLS stream relay without exposing auth tokens |
| `M3Unator` | github:kasra-mp/m3unator | Transform web directories into M3U/M3U8 | Utility for local stream list generation |
| `xTeVe` | github:xteve-project/xTeVe | M3U Proxy for Plex DVR and Emby Live TV | Alternative to Threadfin if needed |
| `IPTV Checker` | github:iptv-org/iptv-checker | Command-line playlist checker | CI health gate for stream catalog |
| `IPTV M3U Filter` | github:hoshsadiq/m3ufilter | M3U playlist filtering script | Provider catalog filtering by quality/region |

---

## Integration Notes

### `@iptv/xmltv`
- **Install:** `npm install @iptv/xmltv`
- **Exposes:** ESM/CJS parser (`parseXmltv(xmlString)`) and generator (`generateXmltv(channels)`)
- **HermesTV backend calls it:** In the EPG normalizer service when ingesting provider XMLTV feeds before forwarding to Threadfin. Handles malformed XMLTV gracefully (many providers ship non-strict XML).

### `@iptv/playlist`
- **Install:** `npm install @iptv/playlist`
- **Exposes:** `parseM3U(string)` → structured playlist object; `generateM3U(object)` → M3U string
- **HermesTV backend calls it:** In the catalog ingestion pipeline when pulling provider M3U from Apollo and XtremeHD Xtream endpoints. Output fed into Dispatcharr for stable channel ID assignment.

### `@iptv/xtream-api`
- **Install:** `npm install @iptv/xtream-api`
- **Exposes:** TypeScript-typed client for Xtream Codes API (`/get.php`, `/player_api.php`, VOD info, EPG endpoints)
- **HermesTV backend calls it:** Primary adapter for both Apollo Group and XtremeHD. Wraps credential injection so raw auth tokens never travel past the backend service boundary. Credentials loaded from vault at service start.

### `iptv-checker`
- **Install:** `npm install -g iptv-checker` or as a library
- **Exposes:** CLI (`iptv-checker -i playlist.m3u8`) and Node API; checks stream reachability, returns HTTP status per stream
- **HermesTV backend calls it:** Pre-catalog health check gate. Streams failing reachability are flagged in Dispatcharr as `degraded` rather than removed, so fallback logic can engage.

### `Threadfin`
- **Install:** Docker — `docker pull ghcr.io/threadfin/threadfin`
- **Exposes:** HTTP proxy on configurable port; Emby/Jellyfin-compatible M3U and XMLTV endpoints
- **HermesTV backend calls it:** Already deployed. Aggregates M3U playlists from multiple providers and presents unified M3U+XMLTV to Jellyfin Live TV. Is the single internal source of truth for stream URLs inside the backend network.

### `hls-restream-proxy`
- **Install:** Go binary or Docker build from source
- **Exposes:** HLS reverse proxy; rewrites segment URLs, injects auth headers server-side
- **HermesTV backend calls it:** For providers that require Bearer or cookie auth on HLS segments. Proxy sits between Jellyfin and the provider, so the TV never sees auth tokens in URLs. Complements Threadfin for auth-sensitive streams.

### `M3Unator`
- **Install:** Clone repo, run `pip install -r requirements.txt`
- **Exposes:** CLI tool that spiders an HTTP directory listing and generates an M3U/M3U8 playlist
- **HermesTV backend calls it:** Utility use only — for generating test playlists from local stream directories during development. Not in production path.

### `xTeVe`
- **Install:** Docker — `docker pull dnsforge/xteve`
- **Exposes:** Same Emby/Jellyfin-compatible endpoints as Threadfin; slightly different channel mapping UX
- **HermesTV backend calls it:** Listed as fallback if Threadfin has issues. Not currently deployed.

### `IPTV Checker` (CLI)
- **Install:** `npm install -g @iptv/iptv-checker` or `npx iptv-checker`
- **Exposes:** CLI stream health report output to JSON or stdout
- **HermesTV backend calls it:** In CI pipeline — GitHub Actions step validates catalog M3U against known-good stream endpoints before merging catalog updates.

### `IPTV M3U Filter`
- **Install:** Go binary from releases or `go install`
- **Exposes:** CLI M3U filter with regex rules, group filtering, quality tags
- **HermesTV backend calls it:** Post-ingestion filter pass on raw provider M3U — drops SD duplicates where HD equivalent exists, filters by allowed group names (matches HermesTV category taxonomy).

---

## Priority Integrations for B2 Sprint

These three are the highest-priority npm installs to implement in the backend catalog service:

1. **`@iptv/xtream-api`** — Unblocks Apollo Group and XtremeHD API integration with typed, credential-safe client. Required before any live channel can be served.
2. **`@iptv/xmltv`** — Required for EPG normalization before Threadfin ingestion. Without it, EPG data is raw and unvalidated.
3. **`@iptv/playlist`** — Required for parsing and regenerating M3U playlists in the catalog pipeline. Enables programmatic playlist manipulation (filtering, enrichment, ID injection).

All three are from the same `@iptv` npm organization, maintained consistently, and are TypeScript-native with ESM support — aligning with the HermesTV backend Node.js stack.

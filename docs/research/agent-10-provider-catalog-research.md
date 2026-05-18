# Agent 10 — IPTV Provider Catalog Research: Xtream Codes & M3U Protocol

**Project:** HermesTV-Tizen-AI  
**Repo:** `https://github.com/Ghenghis/HermesTV-Tizen-AI`  
**Local:** `G:\Github\HermesTV-Tizen-AI`  
**Agent role:** 10 — Provider Catalog Research (Xtream Codes / M3U Protocol)  
**Target providers:** Apollo Group (`apollo`), XtremeHD (`xtremehd`) — referenced by name only  
**Target TVs:** Mom `QN85Q7FAAFXZA` · Dave `UN55CU8000BXZA`  
**Date:** 2026-05-17  
**Status:** Research lock — no code before this report is reviewed  
**Cross-reference:** `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`

---

## 1. Xtream Codes API — Endpoints and Response Shapes

Xtream Codes is a panel software used by the majority of commercial IPTV resellers. It exposes a REST-like HTTP API. All endpoint patterns shown below use placeholder tokens; no real credentials, portal URLs, or tokens appear in this document.

### 1.1 Authentication Endpoint (Panel Login)

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}
```

**Returns on success:**
```jsonc
{
  "user_info": {
    "username": "...",
    "password": "...",          // echoed back — backend must discard before logging
    "message": "...",
    "auth": 1,
    "status": "Active",        // "Active" | "Banned" | "Disabled" | "Expired"
    "exp_date": "1789456000",  // UNIX timestamp; null if no expiry
    "is_trial": "0",
    "active_cons": "1",        // current active concurrent connections
    "created_at": "...",
    "max_connections": "2",    // account slot limit — key field for slot enforcement
    "allowed_output_formats": ["m3u8", "ts", "rtmp"]
  },
  "server_info": {
    "url": "...",              // base portal URL — never log or store in non-vault location
    "port": "...",
    "https_port": "...",
    "server_protocol": "http",
    "rtmp_port": "...",
    "timezone": "America/New_York",
    "timestamp_now": 1789000000,
    "time_now": "2026-05-17 22:00:00"
  }
}
```

**Returns on failure:**
```jsonc
{ "user_info": { "auth": 0 } }
```

**Backend extraction targets:**
- `user_info.max_connections` → `capabilities.multi_stream`
- `user_info.status` → gates health probe result (`Active` = probe succeeds)
- `user_info.exp_date` → subscription expiry warning
- `server_info.allowed_output_formats` → which stream format to request

**Important: password is echoed in the authentication response.** The backend must ensure this response is never logged, cached in a non-vault location, or included in diagnostics exports. Strip `user_info.password` and `server_info.url` (contains portal) immediately after parsing.

### 1.2 Live Streams Endpoint

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_live_streams
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_live_streams&category_id={CAT_ID}
```

**Returns:** JSON array of stream objects.

```jsonc
[
  {
    "num": 1,
    "name": "CNN HD",
    "stream_type": "live",
    "stream_id": 12345,           // numeric; used to construct playback URL
    "stream_icon": "https://...", // logo URL; may be HTTP only on some providers
    "epg_channel_id": "CNN.us",  // XMLTV channel ID for EPG matching; may be absent
    "added": "1650000000",        // UNIX timestamp added
    "category_id": "7",
    "custom_sid": "",
    "tv_archive": 1,              // 1 = catch-up available; 0 = no catch-up
    "direct_source": "",
    "tv_archive_duration": 7      // days of catch-up retention; 0 if tv_archive=0
  }
]
```

**Key fields for catalog normalization:**
- `stream_id` — opaque numeric identifier; used only inside the backend to construct playback URLs
- `name` — display title; may contain quality hints (e.g., "CNN HD") but these are unreliable
- `epg_channel_id` — maps to XMLTV `<channel id="...">` for EPG join; may be missing or mismatched
- `tv_archive` and `tv_archive_duration` — catch-up capability flags
- `stream_icon` — channel logo URL; may use `http://` even when the portal uses HTTPS; store and proxy, never expose raw provider URL to TV

**Provider variation:** Some providers return `tv_archive_duration` as a string (`"7"`) rather than an integer. Some omit `epg_channel_id` entirely for channels they have not mapped. Some use empty string `""` rather than `null`. The backend normalizer must handle all three cases.

### 1.3 Live Stream Categories

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_live_categories
```

**Returns:**
```jsonc
[
  {
    "category_id": "7",
    "category_name": "USA SPORTS",
    "parent_id": 0    // 0 = top-level; non-zero = subcategory (rarely used)
  }
]
```

**Provider variation:** Category names are entirely provider-defined. Apollo Group and XtremeHD will use different category naming conventions. Normalization must map these to a canonical group taxonomy (see Section 9).

### 1.4 VOD Streams Endpoint

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_vod_streams
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_vod_streams&category_id={CAT_ID}
```

**Returns:** JSON array of VOD objects.

```jsonc
[
  {
    "num": 1,
    "name": "The Movie Title (2025)",
    "stream_type": "movie",
    "stream_id": 88001,
    "stream_icon": "https://...",
    "rating": "8.1",
    "rating_5based": "4.05",
    "added": "1789000000",
    "category_id": "14",
    "container_extension": "mkv",   // file extension; determines playback URL suffix
    "custom_sid": "",
    "direct_source": ""
  }
]
```

**Key fields:**
- `container_extension` — the backend appends this to the VOD playback URL
- `rating` — TMDB/IMDB-sourced float string; may be absent or `"0"`

### 1.5 VOD Item Info (Extended Metadata)

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_vod_info&vod_id={STREAM_ID}
```

**Returns:**
```jsonc
{
  "info": {
    "kinopoisk_url": "",
    "tmdb_id": "...",
    "name": "The Movie Title",
    "o_name": "...",
    "cover_big": "https://...",
    "movie_image": "https://...",
    "releasedate": "2025-01-15",
    "episode_run_time": "118",     // minutes as string
    "youtube_trailer": "...",
    "director": "...",
    "actors": "...",
    "description": "...",
    "age": "PG-13",
    "mpaa_rating": "PG-13",
    "rating_count_kinopoisk": "...",
    "country": "USA",
    "genre": "Action, Thriller",
    "backdrop_path": ["https://..."],
    "duration_secs": 7080,
    "duration": "1:58:00",
    "video": {
      "index": 0,
      "codec_name": "h264",
      "width": 1920,
      "height": 1080
    },
    "audio": {
      "index": 1,
      "codec_name": "aac",
      "channels": 2
    },
    "bitrate": 3500,               // kbps — present in some providers, absent in others
    "rating": "8.1",
    "releaseDate": "2025-01-15",
    "last_modified": "..."
  },
  "movie_data": {
    "stream_id": 88001,
    "name": "...",
    "added": "...",
    "category_id": "14",
    "container_extension": "mkv",
    "custom_sid": "",
    "direct_source": ""
  }
}
```

**Bitrate/resolution note:** The `video.width`, `video.height`, and `bitrate` fields in `get_vod_info` are populated from panel-side metadata — they reflect what the provider entered, not a live probe. These values may be absent, zero, or incorrect. The quality scanner must always verify via ffprobe. <!-- NEEDS VERIFICATION — confirm whether Apollo Group and XtremeHD populate these fields reliably -->

### 1.6 Series Endpoint

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_series
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_series&category_id={CAT_ID}
```

**Returns:**
```jsonc
[
  {
    "num": 1,
    "name": "Show Title",
    "series_id": 55001,
    "cover": "https://...",
    "plot": "...",
    "cast": "...",
    "director": "...",
    "genre": "Drama",
    "releaseDate": "2024-09-15",
    "last_modified": "...",
    "rating": "8.5",
    "rating_5based": "4.25",
    "backdrop_path": ["https://..."],
    "youtube_trailer": "...",
    "episode_run_time": "45",
    "category_id": "18"
  }
]
```

### 1.7 Series Info (Episodes)

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_series_info&series_id={SERIES_ID}
```

**Returns:**
```jsonc
{
  "info": {
    "name": "Show Title",
    "cover": "https://...",
    "plot": "...",
    "cast": "...",
    "director": "...",
    "genre": "Drama",
    "releaseDate": "2024-09-15",
    "last_modified": "...",
    "rating": "8.5",
    "youtube_trailer": "...",
    "episode_run_time": "45",
    "backdrop_path": ["https://..."],
    "category_id": "18"
  },
  "episodes": {
    "1": [
      {
        "id": "990001",
        "episode_num": 1,
        "title": "Pilot",
        "container_extension": "mkv",
        "info": {
          "duration_secs": 2700,
          "duration": "0:45:00",
          "video": { "index": 0, "codec_name": "h264", "width": 1920, "height": 1080 },
          "audio": { "index": 1, "codec_name": "aac", "channels": 6 },
          "bitrate": 3200,
          "rating": "8.7",
          "season": 1,
          "plot": "...",
          "movie_image": "https://...",
          "releasedate": "2024-09-15",
          "crew": "...",
          "director": "...",
          "writer": "...",
          "cast": "...",
          "aid": "990001"
        },
        "custom_sid": "",
        "added": "...",
        "season": 1,
        "direct_source": ""
      }
    ],
    "2": [ ... ]
  },
  "seasons": [
    {
      "air_date": "2024-09-15",
      "episode_count": 10,
      "id": 1,
      "name": "Season 1",
      "overview": "...",
      "season_number": 1,
      "cover": "https://...",
      "cover_big": "https://..."
    }
  ]
}
```

**Structure note:** The `episodes` key is a map from season number (as string) to array of episode objects. Season numbers are string keys (`"1"`, `"2"`) not integers. Backend must parse accordingly.

### 1.8 Short EPG for Stream (Next Programs)

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_short_epg&stream_id={STREAM_ID}&limit={N}
```

**Returns:**
```jsonc
{
  "epg_listings": [
    {
      "id": "...",
      "epg_id": "...",
      "title": "Program Title",
      "lang": "en",
      "start": "2026-05-17 22:00:00",
      "end": "2026-05-17 23:00:00",
      "description": "...",
      "channel_id": "CNN.us",
      "start_timestamp": "1789000000",
      "stop_timestamp": "1789003600"
    }
  ]
}
```

**Provider variation:** `limit` defaults to 4 on most panels. Some providers ignore the `limit` parameter. Date format is `YYYY-MM-DD HH:MM:SS` in server local time, not UTC — the backend must apply `server_info.timezone` offset when normalizing to UTC. <!-- NEEDS VERIFICATION — confirm timezone offset behavior -->

### 1.9 Full EPG for Stream

**Pattern:**
```
GET /player_api.php?username={USERNAME}&password={PASSWORD}&action=get_simple_data_table&stream_id={STREAM_ID}
```

Returns the same `epg_listings` array but for the full guide window (typically 7 days, provider-dependent). This endpoint is expensive; do not call per-channel. Use the bulk XMLTV URL instead (Section 3).

### 1.10 Playback URL Construction

The backend constructs playback URLs from stored credentials and stream IDs. These URLs are never exposed to the TV app.

**Live stream URL patterns (never logged or returned to TV):**
```
HLS:  http://{HOST}:{PORT}/live/{USERNAME}/{PASSWORD}/{STREAM_ID}.m3u8
TS:   http://{HOST}:{PORT}/live/{USERNAME}/{PASSWORD}/{STREAM_ID}.ts
```

**VOD URL pattern:**
```
http://{HOST}:{PORT}/movie/{USERNAME}/{PASSWORD}/{STREAM_ID}.{CONTAINER_EXTENSION}
```

**Series episode URL pattern:**
```
http://{HOST}:{PORT}/series/{USERNAME}/{PASSWORD}/{EPISODE_ID}.{CONTAINER_EXTENSION}
```

**Catch-up / timeshift URL pattern:** See Section 4.

---

## 2. M3U Playlist Format

### 2.1 File Structure

An M3U playlist is a plain-text file. The extended format (M3U8 when URL-encoded) begins with `#EXTM3U` and uses `#EXTINF` directives before each entry.

```
#EXTM3U url-tvg="..." tvg-shift="0" x-tvg-url="..."
#EXTINF:-1 tvg-id="CNN.us" tvg-name="CNN HD" tvg-logo="https://..." group-title="USA NEWS",CNN HD
http://...  <- stream URL, never stored or logged outside vault
#EXTINF:-1 tvg-id="ESPN.us" tvg-name="ESPN HD" tvg-logo="https://..." group-title="USA SPORTS",ESPN HD
http://...
```

### 2.2 EXTM3U Header Attributes

| Attribute | Meaning |
|---|---|
| `url-tvg` | URL to the XMLTV EPG file for this playlist; contains credentials — strip immediately |
| `x-tvg-url` | Alternate header attribute for the same XMLTV URL (both may appear) |
| `tvg-shift` | Time offset in hours for EPG timestamps; use when provider's server_info.timezone is unavailable |
| `catchup` | Presence (e.g., `catchup="append"` or `catchup="default"`) signals catch-up support at playlist level |
| `catchup-days` | How many days of catch-up the account supports |

### 2.3 EXTINF Attribute Reference

| Attribute | Type | Notes |
|---|---|---|
| `tvg-id` | string | XMLTV channel ID; must match `<channel id="...">` in the EPG file; may be absent or wrong |
| `tvg-name` | string | Channel name as the provider defines it; may differ from `group-title` and the comma-label |
| `tvg-logo` | URL | Channel logo; often HTTP even on HTTPS portals; never expose to TV — proxy through backend |
| `group-title` | string | Category/group label; provider-defined; must be normalized to canonical taxonomy |
| `tvg-shift` | integer | Per-channel EPG time shift (hours); overrides playlist-level `tvg-shift` |
| `catchup` | string | `"default"` · `"append"` · `"shift"` · `"flussonic"` · `"xtream"` — indicates catch-up mechanism type |
| `catchup-source` | URL template | Catch-up URL template for non-Xtream providers; contains credentials — strip immediately |
| `catchup-days` | integer | Per-channel catch-up retention; overrides playlist-level `catchup-days` |
| `tvg-rec` | string | Recording/DVR indicator (rare; not standard) |

**The comma-label** (the text after the last `,` on the `#EXTINF` line) is the human-readable channel title as displayed in the playlist. This differs from `tvg-name` in some providers. The backend should prefer `tvg-name` for internal identification and the comma-label for display if `tvg-name` is absent.

### 2.4 Provider Variation in M3U

Behavior that varies between Apollo Group, XtremeHD, and similar providers:

| Behavior | Common | Notes |
|---|---|---|
| `tvg-id` present and correct | Inconsistent | Many channels have missing or wrong `tvg-id`; EPG matching must fall back to fuzzy name matching |
| `group-title` casing | All-caps or title-case, provider-defined | Normalize to lowercase with canonical slugs |
| `tvg-logo` uses HTTPS | Inconsistent | Some logos are HTTP regardless of portal protocol |
| `catchup` attribute present | Provider-specific | Not all providers set this; detect via Xtream Codes `tv_archive` flag instead |
| VOD entries in same M3U | Some providers | VOD and live may be mixed; detect by `group-title` or `#EXTVLCOPT` hints |
| Non-ASCII characters in names | Common | Names may use Unicode (accented chars, Arabic, etc.); store as UTF-8 |
| Duplicate channel names | Common | Multiple entries with identical `tvg-name` and different stream URLs (e.g., backup streams) |

### 2.5 Xtream-Hybrid M3U

Some providers expose a special M3U URL that is generated server-side from the Xtream Codes panel. This is referred to as `m3u_xtream_hybrid` in the contract. The URL pattern:

```
http://{HOST}:{PORT}/get.php?username={USERNAME}&password={PASSWORD}&type=m3u_plus&output=ts
```

This produces a standards-compliant M3U with `#EXTINF` attributes populated from the Xtream Codes panel database. The `type=m3u_plus` variant includes `tvg-id`, `tvg-name`, `tvg-logo`, `group-title` attributes (the `type=m3u` variant omits most attributes). The `output=ts` or `output=m3u8` parameter selects the stream format embedded in the URLs. For catalog ingest, the backend should prefer the Xtream JSON API over this URL — the JSON API is more structured and avoids embedding credentials in stream URLs inside the file body.

---

## 3. XMLTV Format

### 3.1 Standard XMLTV Fields

XMLTV is the standard XML format for EPG (Electronic Program Guide) data. The specification defines:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv date="20260517220000 +0000" source-info-name="Provider EPG" generator-info-name="...">

  <channel id="CNN.us">
    <display-name lang="en">CNN</display-name>
    <icon src="https://..."/>      <!-- logo URL; may contain credentials on some providers -->
    <url>https://...</url>
  </channel>

  <programme start="20260517220000 +0000" stop="20260517230000 +0000" channel="CNN.us">
    <title lang="en">Anderson Cooper 360</title>
    <sub-title lang="en">Episode subtitle</sub-title>
    <desc lang="en">Program description text.</desc>
    <credits>
      <director>...</director>
      <actor>...</actor>
    </credits>
    <date>20260517</date>
    <category lang="en">News</category>
    <episode-num system="onscreen">S01E03</episode-num>
    <episode-num system="xmltv_ns">0.2.0/1</episode-num>
    <video>
      <present/>
      <aspect>16:9</aspect>
      <quality>HDTV</quality>
    </video>
    <audio>
      <present/>
      <stereo>stereo</stereo>
    </audio>
    <previously-shown/>            <!-- if a repeat -->
    <rating system="MPAA"><value>TV-G</value></rating>
    <star-rating><value>8/10</value></star-rating>
    <new/>                         <!-- if a new episode -->
  </programme>

</tv>
```

### 3.2 EPG URL Patterns for Xtream Codes Providers

Xtream Codes panels expose XMLTV at two URL patterns (neither contains real values here):

**Standard XMLTV URL (contains credentials):**
```
http://{HOST}:{PORT}/xmltv.php?username={USERNAME}&password={PASSWORD}
```

**Alternative path pattern used by some panels:**
```
http://{HOST}:{PORT}/epg?username={USERNAME}&password={PASSWORD}
http://{HOST}:{PORT}/epg.xml?username={USERNAME}&password={PASSWORD}
```

These URLs contain credentials in the query string. The backend must store these URLs only in the secrets vault. They must never appear in logs, diagnostics exports, or any communication with the TV app.

**Important:** XMLTV files from large providers can be 10–500 MB in size and contain EPG data for all channels the panel serves, not just the channels in the subscriber's account. The backend must download these files, parse them, and retain only the channel IDs that match channels in the subscriber's live stream list.

### 3.3 Typical Refresh Intervals

| Refresh type | Typical interval | Notes |
|---|---|---|
| Full XMLTV re-download | Daily (04:00–06:00 local) | Most panels update EPG once per day overnight |
| Incremental (if supported) | Every 2–4 hours | Most Xtream panels do NOT support incremental; re-download is the norm |
| EPG coverage window | 7–14 days forward | Provider-dependent; some offer only 24–48 hours |
| On-demand `get_short_epg` | Per-request | Used only for next-program display; do not call in bulk |

**Provider variation:** Some providers update their XMLTV feed multiple times per day; others update once weekly. A stale feed is common on smaller providers. The backend should check the XMLTV file's `date` attribute on the root `<tv>` element to detect staleness without re-parsing the full document. <!-- NEEDS VERIFICATION — confirm `date` attribute reliability across providers -->

### 3.4 XMLTV Channel ID Matching

The `epg_channel_id` in the Xtream Codes live stream response and the `tvg-id` in M3U `#EXTINF` lines must match the `id` attribute on `<channel>` elements in the XMLTV file. In practice:

- The match is case-sensitive in the XMLTV spec but some panels treat it as case-insensitive.
- Many channels have `epg_channel_id = ""` (empty string) — these require fuzzy name matching.
- ID formats vary: `"CNN.us"`, `"cnn-hd"`, `"I:CNN"`, `"CNN HD"` are all seen across providers.
- Apollo Group and XtremeHD may use different ID formats for the same channel, requiring normalization to Dispatcharr stable channel IDs before the catalog is returned to the TV.

---

## 4. Catch-up and Time-shift

### 4.1 What Catch-up Provides

Catch-up (also called time-shift or archive) allows a user to watch a previously-aired program by requesting a stream starting at a past time. The stream is typically pre-recorded on the provider's server.

### 4.2 Xtream Codes Catch-up URL Patterns

When `tv_archive = 1` and `tv_archive_duration > 0` for a live stream, the backend can construct a catch-up playback URL. The patterns (no real credentials here):

**Timeshift format (start/duration):**
```
http://{HOST}:{PORT}/timeshift/{USERNAME}/{PASSWORD}/{DURATION_MIN}/{START_TIMESTAMP}/{STREAM_ID}.ts
```
Where:
- `DURATION_MIN` = requested duration in minutes
- `START_TIMESTAMP` = `YYYY-MM-DD:HH-MM` format (not ISO 8601) representing the start of the desired program

**Archive format (start/stop epoch):**
```
http://{HOST}:{PORT}/archive/{USERNAME}/{PASSWORD}/{STREAM_ID}/{START_UNIX}/{STOP_UNIX}.ts
```

**Provider variation:** Some providers support only the `timeshift` pattern; some support only `archive`; some support both. <!-- NEEDS VERIFICATION — confirm which pattern Apollo Group and XtremeHD use -->

### 4.3 M3U Catch-up Mechanisms

When a channel in an M3U playlist carries the `catchup` attribute, the value determines which URL template pattern to use:

| `catchup` value | URL template pattern | Notes |
|---|---|---|
| `"default"` | `{catchup-source}` with `{utc}` and `{utcdur}` substituted | Provider supplies URL template with placeholder tokens |
| `"append"` | Append `?utc={START_UNIX}&lutc={STOP_UNIX}` to the live stream URL | Simple query-string extension of the live URL |
| `"shift"` | Live URL with `?timeshift={START_UNIX}` | |
| `"flussonic"` | Live URL with `/timeshift-{START_UNIX}-{DURATION}.ts` path segment | Flussonic media server format |
| `"xtream"` | Use Xtream Codes timeshift URL pattern directly | Best for Xtream-backed providers |

For Xtream Codes providers (Apollo Group, XtremeHD), the `"xtream"` catch-up type or the direct Xtream timeshift URL is preferred over M3U-embedded templates, because stream IDs and credentials are already managed server-side.

### 4.4 Catch-up Availability Check

The backend must check all three signals before advertising catch-up as available for a channel:

1. Xtream Codes `tv_archive = 1` (integer, not boolean) AND `tv_archive_duration > 0`
2. The account is active and authenticated (`user_info.status = "Active"`)
3. The requested time is within the provider's archive window (`NOW - START_TIME < tv_archive_duration * 86400 seconds`)

Catch-up unavailability must return a clean error to the TV — not a broken stream attempt. The TV app shows a "Catch-up not available for this channel" message.

---

## 5. Stream Slot Limits

### 5.1 How Xtream Codes Enforces Concurrent Stream Limits

Xtream Codes enforces concurrent connection limits at the panel level. The mechanism:

1. Each time a stream URL is fetched (not at playlist request time, but at actual stream request time), the panel increments a connection counter for the account.
2. If the counter already equals `max_connections`, the panel returns HTTP 401 or HTTP 403, or it serves an error stream (a black screen or error message overlay — behavior varies by panel version).
3. When a stream segment request stops arriving (HLS) or the TCP connection drops (TS), the panel decrements the counter after a timeout (typically 30–90 seconds of inactivity). <!-- NEEDS VERIFICATION — confirm exact inactivity timeout across providers -->

**Panel-side enforcement means the provider, not the client, is the enforcement point.** The backend must therefore implement its own pre-check (Section 5.2) to avoid hitting the panel limit unnecessarily.

### 5.2 Detecting Over-Limit from the API

The backend can detect over-limit status from two signals:

**Signal 1: Authentication response `active_cons` field**
```jsonc
{
  "user_info": {
    "active_cons": "2",    // current active connections
    "max_connections": "2" // account limit
  }
}
```
If `active_cons >= max_connections`, a new stream request will be rejected by the panel.

**Signal 2: HTTP error on stream request**
- HTTP 401 = authentication failed (may also indicate credentials changed)
- HTTP 403 = connection limit exceeded (most common for over-limit on modern Xtream panels)
- HTTP 200 with no video data or a panel error overlay = some older panels return 200 with an error stream

**Provider variation:** Older Xtream Codes panel versions return 200 with error content rather than a 4xx status code. The backend should implement a brief stream health check after initiating a connection to detect this case. <!-- NEEDS VERIFICATION -->

### 5.3 Backend Pre-check Protocol

Per `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` Section "Stream and device limit protection":

1. Before requesting a new stream slot, call the panel authentication endpoint to refresh `active_cons` and `max_connections`.
2. Compare `active_cons` to the stored `capabilities.multi_stream` value.
3. If at or over limit: do not attempt the stream; return `stream_limit_reached` to the TV immediately.
4. If under limit: proceed with the stream request; monitor the HTTP response code.
5. On HTTP 403 from the stream endpoint: emit `stream_limit_reached` error to TV; do not retry.

**Caution:** The authentication endpoint itself counts as a session probe and should be called at low frequency — not on every navigation event. Cache the `active_cons` value with a TTL of 30–60 seconds.

---

## 6. Series and VOD Structure

### 6.1 Series API Hierarchy

Xtream Codes structures series content in a three-level hierarchy:

```
Series (identified by series_id)
  └── Season (identified by season number — a key in the episodes map)
        └── Episode (identified by episode id — unique stream ID for playback)
```

There is no separate API endpoint for seasons. The seasons metadata is embedded in the `get_series_info` response as a `seasons` array. Episodes are returned as a map keyed by season number string.

### 6.2 Episode ID vs. Stream ID

Episode objects in `get_series_info` carry an `id` field that is the stream ID used to construct the playback URL. This is distinct from the `series_id`. The playback URL for a series episode uses the `series/` path prefix and the episode `id`, not the `series_id`:

```
http://{HOST}:{PORT}/series/{USERNAME}/{PASSWORD}/{EPISODE_ID}.{CONTAINER_EXTENSION}
```

### 6.3 Metadata Reliability

| Metadata field | Source | Reliability |
|---|---|---|
| `title` / `name` | Panel database (may be TMDB-sourced) | Medium — may be incomplete or in wrong language |
| `tmdb_id` | Panel database | Medium — some providers populate this; many do not |
| `genre` | Panel database | Low — often missing, truncated, or inconsistent |
| `cast` / `director` | Panel database | Low — often absent |
| `rating` | Panel database | Medium — may be from TMDB/IMDB but not always fresh |
| `releaseDate` | Panel database | Medium |
| `description` / `plot` | Panel database | Medium — often TMDB plot, may be truncated |
| `cover` / `backdrop_path` | Panel database | Medium — URLs may go dead if provider does not refresh |
| `episode_run_time` | Panel database | Low — often missing or "0" |
| `duration_secs` (episode) | Panel database | Low — computed from file metadata; may be absent |

The backend should augment Xtream Codes metadata with a TMDB/TVDB lookup when a valid `tmdb_id` is available, and use fuzzy title+year search as a fallback.

### 6.4 VOD vs. Series Catalog Ingest Strategy

Given the potentially large size of provider catalogs (some providers have 10,000+ VOD items and 2,000+ series), the backend should:

1. Fetch category lists first to enable category-filtered fetching.
2. Paginate or batch series/VOD loads to avoid memory spikes.
3. Store only catalog metadata (IDs, titles, posters, categories, quality hints) — never cache full episode lists in memory.
4. Fetch `get_series_info` (episode list) on-demand when a user navigates to a specific series, not during bulk ingest.

---

## 7. Quality Detection

### 7.1 Can the Xtream Codes API Report Stream Quality?

**Partially.** The `get_vod_info` and episode `info` objects include `video.width`, `video.height`, `video.codec_name`, and `bitrate` fields populated from panel-side metadata. These values reflect what was entered or auto-detected when the content was imported into the Xtream Codes panel, not a live measurement.

**For live streams:** There is no API endpoint in Xtream Codes that returns resolution or bitrate for a live stream. The `get_live_streams` response does not include quality metadata. Quality of live streams must be determined by probing — either ffprobe on a short segment or HLS manifest inspection.

**For VOD and series episodes:** Panel-side metadata may provide `width`, `height`, `codec_name`. These should be treated as hints only (catalog field `possible_upscale: false/true` is set to heuristic only, not authoritative per the contract).

### 7.2 ffprobe as the Authoritative Quality Source

Per `docs/07_QUALITY_STREAM_STATS_CONTRACT.md`, quality detection must use ffprobe. The backend quality scanner (`services/hermes-quality-scanner`) probes a sample of the stream (e.g., first 5–15 seconds of segments) and produces the canonical quality JSON schema. This is the only authoritative source for `resolution`, `codec`, `bitrate_bucket`, `fps`, and `audio_codec` in catalog items.

The VPS scanner accesses stream URLs server-side — stream URLs are never sent to the TV. The Tizen app receives only the normalized quality result in catalog item fields.

### 7.3 HLS Manifest Quality Hints

For live streams encoded as HLS (`.m3u8`), the master manifest may contain multiple quality variants:

```
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
720p/index.m3u8
```

The `RESOLUTION` and `BANDWIDTH` attributes in `EXT-X-STREAM-INF` are provider-declared. They are useful as fast hints (avoids a full ffprobe segment download) but should be corroborated by ffprobe for authoritative quality data. <!-- NEEDS VERIFICATION — confirm whether Apollo Group and XtremeHD serve adaptive HLS or single-bitrate TS streams for live channels -->

---

## 8. Health Probing

### 8.1 What Constitutes a Healthy Provider Probe

A provider is considered healthy (`health: "ok"`) when all of the following pass:

| Check | Pass condition | Fail behavior |
|---|---|---|
| Authentication | `user_info.auth = 1` AND `user_info.status = "Active"` | `health: "down"` — credentials invalid or account suspended |
| Live stream count | `get_live_streams` returns array with `length > 0` | `health: "degraded"` — auth succeeds but no channels returned |
| VOD count (if `vod: true`) | `get_vod_streams` returns array with `length > 0` | `health: "degraded"` — capability flag mismatch |
| Series count (if `series: true`) | `get_series` returns array with `length > 0` | `health: "degraded"` — capability flag mismatch |
| EPG URL reachable (if `xmltv: true`) | HTTP 200 on XMLTV URL with non-empty body | `health: "degraded"` — EPG unavailable |
| Slot headroom | `active_cons < max_connections` | Slots full — logged as warning, not a health failure |
| Response latency | Auth endpoint responds within 10 seconds | `health: "degraded"` if timeout |

**Health state machine:**
- `"ok"` — all checks pass
- `"degraded"` — auth succeeds but one or more capability checks fail, or latency exceeded
- `"down"` — authentication fails
- `"unknown"` — not yet probed, or probe was skipped due to backend restart

### 8.2 Probe Frequency

The backend should not probe providers on every user request. Probe schedule:

| Trigger | Action |
|---|---|
| Provider first onboarded | Full probe immediately |
| Scheduled cron (default 04:00 daily) | Full probe before catalog refresh |
| `test_connection` user command | Full probe on-demand |
| Stream HTTP 403 received | Lightweight auth probe to check slot status |
| Backend restart | Lightweight auth probe after startup |
| Health = `"down"` or `"degraded"` | Retry probe every 15 minutes until resolved or operator intervenes |

### 8.3 Probe Timeout and Retry

- Authentication endpoint: 10-second timeout; 2 retries with 5-second backoff.
- XMLTV fetch: 30-second timeout; 1 retry (file can be large).
- `get_live_streams` / `get_vod_streams` / `get_series`: 20-second timeout; 1 retry.

A probe is not retried indefinitely. After 3 consecutive full-probe failures, the provider is marked `health: "down"` and remains there until the operator triggers a manual test or the scheduled cron succeeds.

---

## 9. Category Structure and Normalization

### 9.1 How Providers Organize Channels

Xtream Codes exposes channels in categories via `get_live_categories`. Each channel's `category_id` maps to one entry in the categories list. A channel can only be in one category (no multi-category assignment in the standard API).

Providers use widely varying category name conventions:

| Apollo Group style | XtremeHD style | Canonical normalized slug |
|---|---|---|
| `USA SPORTS` | `Sports - USA` | `sports` |
| `US NEWS` | `News - United States` | `news` |
| `MOVIES - ACTION` | `Action Movies` | `movies-action` |
| `UK: ENTERTAINMENT` | `Entertainment UK` | `entertainment` |
| `ADULT 18+` | `XXX` | `adult` |
| `KIDS / CARTOON` | `Children` | `kids` |
| `MUSIC` | `Music Videos` | `music` |
| `INTERNATIONAL` | `World Channels` | `international` |

**Normalization must happen in the backend, never in the TV app.** The TV app receives only canonical group slugs and display labels.

### 9.2 Canonical Group Taxonomy

The backend normalizes all provider category names to a canonical set. The following is the recommended minimum taxonomy:

```jsonc
[
  { "slug": "sports",         "display_label": "Sports" },
  { "slug": "news",           "display_label": "News" },
  { "slug": "entertainment",  "display_label": "Entertainment" },
  { "slug": "movies",         "display_label": "Movies" },
  { "slug": "movies-action",  "display_label": "Movies: Action" },
  { "slug": "movies-drama",   "display_label": "Movies: Drama" },
  { "slug": "movies-comedy",  "display_label": "Movies: Comedy" },
  { "slug": "movies-horror",  "display_label": "Movies: Horror" },
  { "slug": "movies-scifi",   "display_label": "Movies: Sci-Fi" },
  { "slug": "series",         "display_label": "Series" },
  { "slug": "documentary",    "display_label": "Documentary" },
  { "slug": "kids",           "display_label": "Kids" },
  { "slug": "music",          "display_label": "Music" },
  { "slug": "international",  "display_label": "International" },
  { "slug": "adult",          "display_label": "Adult" },          // profile-gated
  { "slug": "uncategorized",  "display_label": "Other" }           // fallback
]
```

Provider categories that do not match any canonical slug are assigned `"uncategorized"`.

### 9.3 Normalization Algorithm

The backend normalizer applies the following rules in order:

1. **Lowercase and strip punctuation** from the provider category name.
2. **Country/region prefix stripping** — remove leading region codes like `"USA:"`, `"UK:"`, `"US:"`, `"CA:"`, etc.
3. **Keyword match** — match against a keyword map to a canonical slug (e.g., any category containing `"sport"` → `"sports"`).
4. **Confidence threshold** — if no keyword matches, assign `"uncategorized"`.
5. **Operator override** — the backend must allow an operator-defined override map (`provider_category_map`) to hard-assign specific provider category names to canonical slugs without algorithm inference.

### 9.4 Category Deduplication Across Providers

When Apollo Group and XtremeHD both have a `"USA SPORTS"` and a `"Sports - USA"` category respectively, the unified catalog merges all channels from both into the `"sports"` canonical group. The TV app sees a single `"Sports"` group containing channels from both providers, each tagged with its `provider_tags` array.

### 9.5 Adult Content Gating

Categories normalized to `"adult"` slug must be gated at the profile level. The `profile_access` field on catalog items in this group must be checked before returning items in any catalog view. The TV app must not receive adult catalog items for a profile that does not have adult access enabled, regardless of the provider's category assignment.

---

## 10. De-duplication Across Providers

### 10.1 Duplicate Detection Strategy

When the same channel exists in both Apollo Group and XtremeHD, the catalog must collapse it to a single item with `duplicate_count: 2` and `provider_tags: ["apollo", "xtremehd"]`.

Matching strategy (in priority order):

| Signal | Weight | Notes |
|---|---|---|
| Exact normalized title match | High | After lowercasing, stripping quality hints (HD, FHD, 4K, SD) |
| `tvg-id` match (when both providers share a common EPG ID) | High | Reliable only when both have non-empty `epg_channel_id` |
| TMDB ID match (VOD/series) | High | When both providers populate `tmdb_id` with the same value |
| Fuzzy title match (Levenshtein ≤ 2) | Medium | May produce false positives for channels with similar names |
| Logo URL domain match + title fuzzy match | Low | Fallback for channels without EPG IDs |

**False-positive risk:** Fuzzy matching can incorrectly merge channels that are not the same (e.g., "BBC One" vs. "BBC One HD" vs. "BBC One +1"). The backend should expose a Duplicate Finder view (per contract) to allow operator review and correction.

### 10.2 `preferred_source` Resolution

When a channel is available from both providers, the backend selects `preferred_source` using the following tie-breaking order:

1. Operator-set `preferred_source` override (explicit user choice)
2. Higher quality resolution (from ffprobe scan results)
3. Higher bitrate bucket
4. Provider `priority_order` (operator-configured; default Apollo=1, XtremeHD=2)
5. First alphabetically by `provider_id` (deterministic tiebreaker)

---

## 11. Security Notes (Protocol-Level)

These apply to all Xtream Codes and M3U communication, regardless of provider:

1. **Stream URLs contain credentials in the path.** The URL pattern `/live/{USERNAME}/{PASSWORD}/{ID}` embeds credentials. The backend must never return stream URLs to the TV app. The TV app receives a backend-proxied or short-lived signed URL that does not expose the provider credentials.
2. **M3U file body contains stream URLs with credentials.** If the backend fetches an M3U file, it must parse and discard the raw stream URLs immediately after extracting catalog metadata. The file must not be cached to disk in its raw form.
3. **XMLTV URL contains credentials.** Treat the same as stream URLs — store only in vault, never log.
4. **The authentication response echoes the password.** The `user_info.password` field must be stripped before any part of the authentication response is logged or stored outside the vault.
5. **Logo and poster URLs do not contain credentials** on most providers, but should still be proxied through the backend to avoid exposing the provider's CDN domain structure to the TV app.

---

## Conclusion: What the Catalog Normalization Contract Can Rely On

The following findings are confirmed by the Xtream Codes protocol specification and are reliable enough to be encoded as contract invariants:

### Reliable (can encode as invariants)

1. **Authentication endpoint** — The `player_api.php` authentication endpoint is universal across Xtream Codes deployments. The response structure (`user_info`, `server_info`) is stable. `max_connections` reliably reflects the account slot limit.

2. **Live, VOD, and series endpoints** — `get_live_streams`, `get_vod_streams`, `get_series`, `get_series_info` are standard Xtream Codes endpoints available on all compliant panels. The array response structures are consistent.

3. **Catch-up signaling** — `tv_archive` (integer 0 or 1) and `tv_archive_duration` (days) on live stream objects are the reliable way to detect catch-up availability. These can be encoded in `capabilities.catch_up`.

4. **Slot limit** — `user_info.max_connections` is the authoritative slot count. The backend must use this as `capabilities.multi_stream`. `active_cons` provides current usage.

5. **Stream URL patterns** — The `/live/`, `/movie/`, `/series/`, `/timeshift/` URL path prefixes are standard across Xtream panels. The backend can construct these from stored stream IDs and credentials without an additional API call.

6. **M3U EXTINF attributes** — `tvg-id`, `tvg-name`, `tvg-logo`, `group-title` are present in all `type=m3u_plus` M3U exports. They are useful starting points but must be normalized.

7. **ffprobe is required for quality** — There is no API endpoint that reliably reports live stream resolution. VOD panel metadata is unreliable. Quality scanner is mandatory.

8. **Category normalization is mandatory** — Provider category names are not standardized. The backend must maintain a normalization map. Operator override is needed for edge cases.

### Needs Verification (cannot yet be encoded as invariants)

- <!-- NEEDS VERIFICATION --> Whether Apollo Group and XtremeHD use `timeshift` or `archive` catch-up URL pattern (or both).
- <!-- NEEDS VERIFICATION --> Whether both providers populate `video.width`, `video.height`, `bitrate` in `get_vod_info` responses reliably.
- <!-- NEEDS VERIFICATION --> Whether both providers serve adaptive HLS (multi-bitrate) or single-bitrate TS for live channels.
- <!-- NEEDS VERIFICATION --> Whether `get_short_epg` respects the `limit` parameter on these specific providers.
- <!-- NEEDS VERIFICATION --> Exact inactivity timeout before Xtream Codes panel releases a connection slot (30 s vs. 90 s varies by panel version).
- <!-- NEEDS VERIFICATION --> Whether XMLTV file `date` attribute is reliably populated (for staleness detection without full re-parse).
- <!-- NEEDS VERIFICATION --> Whether both providers return HTTP 403 (vs. 401 or 200 with error stream) when slot limit is exceeded.
- <!-- NEEDS VERIFICATION --> Whether `tvg-id` / `epg_channel_id` values are consistent between the Xtream JSON API and the M3U file for the same channel on these providers.

### Design Decision

The catalog normalization contract (`docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`) correctly assumes:

- Xtream Codes JSON API as the primary ingest path (not M3U file download).
- `capabilities.multi_stream` sourced from `max_connections` on auth probe.
- `capabilities.catch_up` sourced from `tv_archive` flags on live stream objects.
- Quality data sourced from ffprobe scanner, not panel metadata.
- Category normalization to canonical slugs before any catalog data is returned to the TV.
- XMLTV matched via `epg_channel_id` → Dispatcharr stable channel IDs, with fuzzy name fallback.

All of these are well-grounded in the Xtream Codes protocol and represent the correct architecture for the provider catalog system.

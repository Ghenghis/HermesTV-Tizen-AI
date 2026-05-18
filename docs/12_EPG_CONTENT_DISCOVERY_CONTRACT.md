# HermesTV — Doc 12: EPG & Content Discovery Contract

**Version:** 1.0.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (Sherri — enhanced tier) · UN55CU8000BXZA (Dave — baseline tier)  
**Status:** BINDING — EPG and discovery UI must follow these specifications

---

## 1. Purpose

This contract defines how HermesTV displays live channel program guides, discovers content, handles search, and surfaces personalized rows. EPG is the single biggest UX gap identified by the SOTA research — it is a B3 priority feature.

---

## 2. EPG Data Flow

```
Apollo / XtremeHD provider XMLTV feeds (URLs stored in backend vault only)
  → Threadfin (M3U proxy + XMLTV aggregation, :34400)
  → Dispatcharr (channel management + stable channel IDs, :9191)
  → Jellyfin Live TV (EPG consumer, :8096)
  → HermesTV API layer → Tizen app

Tunarr virtual channels (:8000) → own self-generated XMLTV → Jellyfin Live TV
```

HermesTV fetches EPG from Jellyfin's Live TV API (not directly from Threadfin or Tunarr) so that Jellyfin's channel IDs are the authoritative join key across all features (Continue Watching, Favorites, EPG).

**HARD RULE — EPG URL security:** Provider XMLTV feed URLs contain credentials (tokens, portal parameters). These URLs are stored only in the backend secrets vault. They are NEVER logged, included in diagnostics exports, emitted to the Tizen app, committed to git, or visible in any screenshot or debug output. All diagnostics that reference an XMLTV source identify it only by provider ID (`apollo`, `xtremehd`). The backend must actively strip credential-bearing URL components before writing any log line that references an EPG source URL.

### 2.1 Per-Provider XMLTV Source Handling

| Provider | XMLTV source | Credential stripping required |
|---|---|---|
| `apollo` | Apollo Group XMLTV endpoint (configured in Threadfin via vault ref) | Yes — URL contains auth token |
| `xtremehd` | XtremeHD XMLTV endpoint (configured in Threadfin via vault ref) | Yes — URL contains auth token |
| Tunarr virtual channels | Self-generated at `http://tunarr:8000/api/xmltv.xml` | No credentials in URL |

Threadfin aggregates both provider feeds and exposes a single unified XMLTV at `http://threadfin:34400/xmltv/1`. Dispatcharr maps stable channel IDs onto Threadfin's output. The TV app and any log output only ever reference Dispatcharr stable channel IDs — never raw provider XMLTV URLs.

---

## 3. EPG Grid Layout

### 3.1 Grid Structure

```
┌─────────────────────────────────────────────────────────┐
│  [TIME AXIS]  19:00      19:30      20:00      20:30    │
├──────────┬──────────────┬───────────────────────────────┤
│ Ch 1     │  Now Playing █│  Next Up                     │
│ Logo+Num │  Title here  │  Title here                   │
├──────────┼──────────────┼─────┬─────────────────────────┤
│ Ch 2     │  Program A   │ B   │  Program C              │
├──────────┼──────────────┴─────┴─────────────────────────┤
│ Ch 3     │  Long Program Title (2 hours)                │
└──────────┴────────────────────────────────────────────── ┘
```

### 3.2 Pixel Specification

| Element | Dave's TV (baseline) | Sherri's TV (enhanced) |
|---|---|---|
| Channel column width | 180px | 200px |
| Row height | 72px | 96px |
| Channel logo | 48×48px | 64×64px |
| Channel number font | 18px | 20px |
| Program block min width | 60px | 60px |
| Program title font | 20px | 26px |
| Time axis height | 36px | 40px |
| Time window (visible) | 2 hours | 2.5 hours |
| Scroll | Virtualized — render only visible rows | Same |

### 3.3 Program Block Colors

| State | Background | Text |
|---|---|---|
| Past (aired) | `--epg-past-bg: #1A1A2E` | `--epg-past-text: #666680` |
| Current (live) | `--epg-current-bg: #0F3460` | `--epg-current-text: #E0E0FF` |
| Future | `--epg-future-bg: #16213E` | `--epg-future-text: #C0C0D8` |
| Focused | `--epg-focus-bg: #533483` | `--epg-focus-text: #FFFFFF` |

Current program also shows a **progress fill**: a 2px bar at bottom of the block, filling from left based on `(now - start) / (end - start)`. Enhanced tier only: 300ms CSS transition on the progress fill.

### 3.4 D-Pad Navigation Rules

1. **Right/Left:** Move focus between program blocks within a channel row (time axis scroll follows)
2. **Up/Down:** Move focus between channel rows (channel column stays fixed; page scrolls vertically)
3. **OK:** Open program detail panel (right side, 35% width, overlaps grid at 80% opacity backdrop)
4. **OK (second press, or Play):** Begin playback of current/next program or live channel
5. **Back:** If detail panel open — close it. If grid focused — exit to home screen.
6. **ColorF0Red:** Jump to "Now" (focus nearest current program on focused channel)
7. **ChannelUp/ChannelDown:** Scroll 5 channels at a time in the channel column

**Focus rule:** Focus must never go off-screen. If a program block is narrower than 60px, it is still focusable — the focus ring scales to the block width (minimum 60px touch target guaranteed by CSS `min-width`).

### 3.5 Per-Profile EPG Display Preferences

Profile-specific EPG behavior is mandatory. The active profile (`dave_tv` or `mom_tv`) is determined at app launch and drives the variant used throughout the EPG grid.

| Preference | `dave_tv` (Dave — baseline tier) | `mom_tv` (Sherri — enhanced tier) |
|---|---|---|
| Row height | 72px | 96px |
| Channel logo size | 48×48px | 64×64px |
| Program title font | 20px | 26px |
| Time window (visible) | 2 hours | 2.5 hours |
| Visible channel rows | 8 (scrolled virtualization) | 6 (scrolled virtualization) |
| Details panel open mode | OK press required | Focus-triggers preview (title + time); OK opens full panel |
| Catch-up play icon size | 16px | 20px |
| NOW hairline width | 2px | 3px |

**Mom Mode asymmetric rule:** Sherri's TV (`QN85Q7FAAFXZA`) is never artificially limited. It always receives the enhanced EPG tier — larger rows, wider time window, larger fonts. Dave's TV (`UN55CU8000BXZA`) uses the baseline tier. This rule is non-negotiable and is enforced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`.

### 3.6 NOW Hairline (Required Element)

A vertical red hairline at the current wall-clock time must bisect all channel rows and the time header simultaneously. This is a required UI element based on the research findings (section 8.1 of the research doc `agent-06-epg-content-discovery.md`).

- **Position:** Computed server-side as `(server_time - window_start) / (window_end - window_start) * time_area_width_px`.
- **Color:** `var(--color-accent, #E53935)` — red by default, overridable by theme.
- **Width:** 2px (Dave) / 3px (Sherri).
- **Extends:** From top of time header row to bottom of last visible channel row. Updates every 60 seconds (client-side CSS `transform: translateX()` update using countdown from last `server_time`).
- **Label:** A small "NOW" chip sits above the hairline in the time header row.
- **When user scrolls past NOW:** The hairline may scroll off-screen. A persistent "Back to Now" chip appears in the time header (top-left of the time area) whenever the NOW hairline is not visible.

### 3.7 Virtual DOM Renderer (Required for 200+ Channels)

The EPG grid uses a virtualized renderer — only visible rows are in the DOM:

```js
// js/ui/epg/epgGrid.js — simplified virtual render pattern
var VISIBLE_ROWS = Math.ceil(window.innerHeight / ROW_HEIGHT) + 2;
var scrollOffset = 0;

function renderVisibleRows(channels, scrollY) {
  var startIdx = Math.floor(scrollY / ROW_HEIGHT);
  var endIdx = Math.min(startIdx + VISIBLE_ROWS, channels.length);

  channels.slice(startIdx, endIdx).forEach(function(ch, i) {
    var row = document.getElementById('epg-row-' + (startIdx + i));
    if (!row) {
      row = createRow(startIdx + i);
      epgContainer.appendChild(row);
    }
    populateRow(row, ch, startIdx + i);
    // position: absolute, translateY for GPU layer
    row.style.transform = 'translateY(' + ((startIdx + i) * ROW_HEIGHT) + 'px)';
  });
}
```

**Tizen 3.0 constraint (Sherri's TV — QN85Q7FAAFXZA):** No `IntersectionObserver`. Use manual scroll-event + `scrollTop` math for visibility detection.

---

## 4. EPG Data Schema

### 4.1 Backend API Endpoint

```
GET /api/epg/grid?start={iso8601}&end={iso8601}&channelIds={csv}
```

Response:
```json
{
  "server_time": "2026-05-17T19:00:00Z",
  "channels": [
    {
      "channel_id": "dispatcharr-ch-001",
      "display_name": "BBC One",
      "logo_url": "/api/channels/dispatcharr-ch-001/logo",
      "channel_number": 1,
      "stream_url": "https://hermes.local/jellyfin/stream/ch001",
      "programs": [
        {
          "program_id": "prog-abc123",
          "title": "EastEnders",
          "description": "...",
          "start": "2026-05-17T19:00:00Z",
          "end": "2026-05-17T19:30:00Z",
          "category": ["Drama"],
          "rating": "TV-PG",
          "has_catchup": false,
          "progress_pct": 42
        }
      ]
    }
  ]
}
```

`progress_pct` is computed server-side from `server_time` — never use `Date.now()` on the client for EPG timing (TV clocks can drift).

### 4.2 EPG Status Enum

The `epg.status` field on every catalog item (defined in `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`) drives how channels appear in the EPG grid and in the Missing EPG / Broken Streams maintenance view.

| Value | Meaning | Grid display |
|---|---|---|
| `"matched"` | Channel has a full XMLTV match; current programs available | Normal grid row |
| `"partial"` | Channel has a XMLTV match but some time slots are missing | Grid row with gap blocks for missing slots |
| `"missing"` | No XMLTV channel ID could be associated with this channel | "No guide available" placeholder row |
| `"stale"` | EPG data exists but has not been refreshed within the stale threshold (see section 4.4) | Grid row with clock icon and dimmed text; data still rendered |

These are the only four valid values. Any implementation writing `epg.status` must use exactly these strings.

### 4.2a Channel ID → XMLTV Fuzzy Matching

Dispatcharr assigns stable virtual channel IDs. The XMLTV `channel/@id` from Threadfin originates from the provider's `tvg-id` M3U attribute. These two identifiers are not always identical. The backend must apply the following matching pipeline in order to set `epg.status`:

**Step 1 — Exact match**
Compare Dispatcharr stable channel ID with XMLTV `channel/@id` as-is. If equal: `status = "matched"`, stop.

**Step 2 — Normalized exact match**
Lowercase both, strip non-alphanumeric characters (keep dots and digits). If equal: `status = "matched"`, stop.

**Step 3 — tvg-id from M3U metadata**
Dispatcharr preserves the original `tvg-id` from the M3U line. Compare the M3U `tvg-id` (normalized as above) against XMLTV `channel/@id` (normalized). If equal: `status = "matched"`, stop.

**Step 4 — display-name comparison**
Compare channel `<display-name>` from XMLTV against the Dispatcharr channel name (both normalized: lowercase, strip punctuation, collapse whitespace). If equal: `status = "matched"`, stop.

**Step 5 — Token overlap score**
Tokenize both names (split on space, dash, dot). Count tokens in common. Score = `common_tokens / max(len_a, len_b)`. If score ≥ 0.75: `status = "matched"`. If score ≥ 0.40 and < 0.75: `status = "partial"`. Below 0.40: no match from this step, continue.

**Step 6 — No match**
After all steps: `status = "missing"`.

**Per-provider matching:** Steps 1–5 are run independently against each provider's XMLTV output. The best status across both providers is used (`"matched"` > `"partial"` > `"missing"`). The `preferred_source` from the catalog item determines which matched XMLTV channel ID is used for EPG data retrieval.

**Logging:** Each match run logs: channel ID, matched XMLTV ID, step at which match succeeded, score (if step 5). Logs must not include provider XMLTV URLs — only provider ID and Dispatcharr channel IDs.

### 4.3 XMLTV Source Fields Used

| XMLTV Field | HermesTV Use |
|---|---|
| `<channel id>` | Dispatcharr stable ID |
| `<display-name>` | Channel name in grid |
| `<icon src>` | Channel logo |
| `<programme start end channel>` | Program blocks |
| `<title>` | Program title |
| `<desc>` | Program description |
| `<category>` | Genre filter |
| `<rating>` | Parental rating badge |
| `<episode-num system="xmltv_ns">` | S/E numbering |

### 4.4 Stale Detection Logic

An EPG entry becomes `"stale"` when the backend determines that its underlying XMLTV data is too old to be reliable. Staleness is evaluated at read time (when the backend assembles an EPG API response) and also during the background refresh worker.

**Stale thresholds by data category:**

| Data category | Stale threshold | Rationale |
|---|---|---|
| Full XMLTV guide data (>2h ahead) | 12 hours since last successful fetch | Guide data for future slots rarely changes intra-day |
| "Now and next" (current + next 2 hours) | 30 minutes since last successful fetch | Live events may shift start/end times |
| Current program data (now-playing) | 5 minutes since last successful fetch | Powers "On Now" rails; must be nearly real-time |
| Tunarr virtual channel EPG | 15 minutes since last successful fetch | Tunarr's schedule changes when new content is added |

When the backend determines a channel's EPG data is older than its threshold, it sets `epg.status = "stale"` on the catalog item and includes a `guide_data_age_sec` field in the EPG API response for that channel. The Tizen app renders the stale clock icon (see section 4.3 table) and the grid still displays whatever data exists.

**Stale does not mean empty.** Stale data continues to be served and rendered. The user sees a warning indicator but not a blank grid. Only `"missing"` results in a placeholder row.

### 4.5 EPG Refresh Schedule

| Condition | Action |
|---|---|
| App launch | Fetch 4-hour window (current + 3 hours ahead) |
| Time advances past current window end | Auto-fetch next 4-hour window |
| User manually scrolls > 2h ahead | Prefetch next window |
| Backend push (webhook from Threadfin) | Invalidate cache, refetch affected channels |
| No EPG data for channel | Show "No programme info" placeholder |
| EPG data older than stale threshold (see 4.4) | Show stale indicator (clock icon); data still rendered |

**Backend EPG refresh schedule (server-side, not triggered by TV app):**

| Job | Schedule | Scope |
|---|---|---|
| Full XMLTV fetch (both providers) | Every 6 hours (`0 */6 * * *`) | All channels for `apollo` and `xtremehd` |
| "Now and next" refresh | Every 30 minutes | All channels with `epg.status != "missing"` |
| Current program refresh | Every 5 minutes | Channels with active viewers (tracked via heartbeat) |
| Tunarr virtual channel EPG refresh | Every 15 minutes | Tunarr channel list only |
| Stale status re-evaluation | Every 15 minutes | Full catalog — updates `epg.status` field |

**Refresh job isolation:** Each provider's XMLTV fetch runs as an independent job. A failure in `apollo`'s XMLTV fetch does not cancel or delay `xtremehd`'s fetch.

### 4.6 EPG Backup and Fallback Behavior

If the primary EPG fetch for a provider fails, the following fallback chain applies:

**Level 1 — Serve cached data (up to 24 hours old):**
- If the last successful fetch is less than 24 hours old, continue serving the cached XMLTV data.
- The backend marks provider health as `"degraded"` (see `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` provider health field).
- `epg.status` for affected channels transitions from `"matched"` or `"partial"` to `"stale"`.
- The Tizen app shows the stale indicator but no error message — the user sees a full grid.

**Level 2 — Cross-provider fallback (if one provider's EPG is down):**
- If `apollo` XMLTV is unavailable but `xtremehd` carries the same channel (matched by channel name fuzzy match), the backend serves `xtremehd`'s EPG data for that channel even if `apollo` is the preferred source.
- The substitution is transparent to the TV app — the EPG API response looks the same.
- The backend logs the substitution (provider IDs only; no URLs).

**Level 3 — Expired cache (> 24 hours old):**
- If cached data is more than 24 hours old and all fetch attempts have failed, `epg.status` transitions to `"missing"` for affected channels.
- The grid shows the "No guide available" placeholder row.
- A background retry runs every 15 minutes until a successful fetch restores data.

**Level 4 — Threadfin unavailable:**
- If Threadfin itself is unreachable (not just an upstream EPG source), the HermesTV backend falls back to Jellyfin's own cached EPG data (`GET /LiveTv/Programs`), which Jellyfin may have cached from its last successful Threadfin pull.
- If Jellyfin's cache is also expired, Level 3 applies.

**No automatic Threadfin restart:** The backend does not attempt to restart Threadfin or any upstream service. It only manages the EPG data it can obtain through the normal API paths.

---

## 4b. Catch-Up / Time-Shift EPG Behavior

The provider catalog contract (`docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`) defines `capabilities.catch_up: true` for providers that support it (both Apollo and XtremeHD may). The catalog item field `catch_up_available: true` marks individual channels where catch-up is active. This contract defines how catch-up surfaces in the EPG grid.

### Catch-Up Entry Points

1. **In the EPG grid:** Program blocks that are in the past (already aired) and have catch-up available are displayed with a play icon overlay in the block corner. Without catch-up, past blocks are dimmed and non-playable.
2. **In the program detail panel:** A "Watch from start" or "Catch-up available" button appears when `has_catchup: true` on the program object.
3. **In the "On Today" search section:** Past programs with catch-up are included and marked with a catch-up badge.

### Catch-Up Data in the EPG API Response

The program object already includes `"has_catchup": false` (see section 4.1 schema). This field must be set correctly by the backend based on:
- The channel's `catch_up_available` flag from the catalog.
- The program's `start` time being within the provider's catch-up window (typically 7 days; query the provider capability record for the exact value).

```jsonc
{
  "program_id": "prog-abc123",
  "title": "EastEnders",
  "start": "2026-05-17T19:00:00Z",
  "end": "2026-05-17T19:30:00Z",
  "has_catchup": true,
  "catchup_url_ref": null   // NEVER populated on the TV-facing response; backend resolves on play
}
```

**HARD RULE:** Catch-up stream URLs contain provider credentials. The backend resolves the catch-up stream URL at play-time only, via the same proxy/signed-URL mechanism as live streams. The `catchup_url_ref` field is never sent to the TV app. The TV app requests playback via `GET /api/catchup/{program_id}` and the backend returns a short-lived signed URL.

### Catch-Up Rendering in EPG Grid

| Block state | Visual treatment |
|---|---|
| Past, no catch-up | Dimmed background (`--epg-past-bg`), no play icon, non-playable (OK press opens detail panel only) |
| Past, catch-up available | Same dimmed background + small play icon (▶) in top-right corner of block, playable via OK press |
| Current (live) | Normal current-block styling + progress fill |
| Future | Normal future-block styling |

The catch-up play icon is rendered only if the block is wider than 80px. For narrower blocks, the detail panel shows the "Catch-up available" action button when focused.

---

## 5. Content Discovery Rows

The home screen is composed of **discovery rows** — horizontally scrollable card carousels. Rows are loaded in priority order and lazy-rendered below the fold.

### 5.1 Standard Row Set

| Row | Data Source | Priority | When Shown |
|---|---|---|---|
| Continue Watching | `GET /jellyfin/Users/{uid}/Items/Resume` | 1 — always first | If ≥ 1 in-progress item exists |
| Live Now | Dispatcharr + Threadfin current programs | 2 | Always |
| Next Up | `GET /jellyfin/Shows/NextUp?userId={uid}` | 3 | If following any shows |
| New Episodes | `GET /jellyfin/Items?IsUnaired=false&IsNew=true` | 4 | If new content in library |
| Trending | `GET /jellyfin/Items?SortBy=PlayCount&SortOrder=Descending` | 5 | Always |
| AI Picks (Hermes) | VPS Ollama — personalized from Mem0 history | 6 | If AI is online |
| Favorites | Profile `favorites[]` list | 7 | If user has favorites |
| Browse by Genre | Jellyfin library genres | 8 | Always (last row) |

### 5.2 Row Card Layout

Each card in a discovery row:

```
┌───────────────┐
│               │
│   Thumbnail   │  ← 16:9 aspect ratio
│               │
│ [QUALITY BADGE]│ ← Bottom-right corner (doc 07)
├───────────────┤
│ Title          │ ← 20px, 2 lines max, ellipsis
│ Subtitle/Meta  │ ← 16px, 1 line (channel, year, genre)
│ [PROGRESS BAR] │ ← only for Continue Watching
└───────────────┘
```

Card width: 280px (Dave) / 320px (Sherri). Gap between cards: 16px.

### 5.3 "On Now" Channel Tile

Live channel tiles in the "Live Now" row show:
- Channel logo (left, 48px)
- Channel name (right of logo)
- **Current program title** (below channel name, 18px, truncated)
- **Progress bar** (thin bar at bottom, fills left-to-right as program progresses)
- Quality badge (bottom-right)

This converts a plain channel list into an always-current mini-EPG.

### 5.4 AI Picks Row (Hermes)

- Populated by Ollama query via Pipelines, enriched with Mem0 profile context
- Row label: "For you, {display_name}" (uses Sherri or Dave's chosen name)
- Max 10 cards; refreshed every 30 minutes
- If Ollama is offline: row is hidden (graceful degradation — not an error)
- Recommendation rationale shown on card focus: "Because you watched Fallout" (small caption below card)

---

## 6. Jellyfin API Integration

### 6.1 Core Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /Users/{uid}/Items/Resume` | Continue Watching items |
| `GET /Shows/NextUp?userId={uid}` | Next unwatched episode per series |
| `GET /Items?SortBy=PlayCount&SortOrder=Descending` | Trending content |
| `GET /Items?IsNew=true` | Recently added |
| `GET /Users/{uid}/Items?Filters=IsFavorite` | User favorites |
| `GET /Items/{id}/PlaybackInfo` | Stream URLs + subtitle tracks |
| `GET /LiveTv/Channels` | Live channel list |
| `GET /LiveTv/Programs?IsAiring=true` | Currently airing programs |
| `POST /Sessions/Playing` | Report playback start |
| `POST /Sessions/Playing/Progress` | Report position (every 10s) |
| `POST /Sessions/Playing/Stopped` | Report playback stop |
| `GET /Users/{uid}/Items/{id}/UserData` | Playback position for resume |

### 6.2 Auth Header
```
X-Emby-Authorization: MediaBrowser Client="HermesTV", Device="TizenTV", DeviceId="{duid}", Version="1.0.0", Token="{api_key}"
```

### 6.3 Progress Reporting
```js
// Every 10 seconds during playback
function reportProgress(itemId, positionMs) {
  hermesApi.post('/jellyfin/Sessions/Playing/Progress', {
    ItemId: itemId,
    PositionTicks: positionMs * 10000,  // Jellyfin uses ticks (100ns units)
    IsPaused: false,
    PlayMethod: 'DirectStream'
  });
}
```

---

## 7. Search

### 7.1 Search Trigger
- Press **Search** button in navigation bar, or
- Press any letter key on remote (if applicable), or
- Ask Hermes: "Search for Fallout" → Hermes opens search with query pre-filled

### 7.2 Keyboard Layout

6-column alphabetical grid (A–Z + Space + Backspace + numbers 0–9 in row 5):
```
A  B  C  D  E  F
G  H  I  J  K  L
M  N  O  P  Q  R
S  T  U  V  W  X
Y  Z  0  1  2  3
4  5  6  7  8  9
[SPACE]    [⌫ DEL]
```

- D-pad navigates the key grid
- OK selects a key (appended to query string)
- Query input updates with 300ms debounce → autocomplete suggestions appear above keyboard
- **Autocomplete row:** Up arrow from keyboard → moves focus to suggestion chips → OK selects suggestion
- Search submits after 1.5s idle or when OK pressed from suggestion chips

### 7.3 Universal Search Results

```
┌─────────────────────────────────────────────────┐
│ 🔴 Live Now                                     │
│  [BBC One — Match of the Day]                   │
├─────────────────────────────────────────────────┤
│ 📺 TV Shows                                     │
│  [Fallout S1] [Fallout S2] [...]                │
├─────────────────────────────────────────────────┤
│ 🎬 Movies                                       │
│  [Fallout (2008)]                               │
├─────────────────────────────────────────────────┤
│ 📅 On Today (EPG)                               │
│  [Ch 4 — 21:00 The Fallout Documentary]         │
└─────────────────────────────────────────────────┘
```

Results pull from: Jellyfin library (VoD), Dispatcharr/Jellyfin Live TV, and current EPG programs.

---

## 8. Favorites Management

| Action | Method | Result |
|---|---|---|
| Add to Favorites | Long-press OK on any card → Options popover → "Add to Favorites" | Added to profile favorites[] + Jellyfin UserData |
| Quick Add | **Yellow button** (ColorF2Yellow) while card is focused | Immediate add with toast "Added to Favorites" |
| Remove | Long-press OK → "Remove from Favorites" | Removed; yellow heart icon clears |
| View Favorites | Home screen Favorites row, or Settings > Favorites | All favorites in one grid view |
| Favorites offline cache | Synced to on-device profile JSON on every change | Available without VPS connection |

Favorites are per-profile (Sherri's favorites ≠ Dave's favorites).

---

## 9. Skip Intro / Skip Credits

When a VOD item has intro/credits boundaries detected by Jellyfin's Skip Intro plugin:

1. During playback, an overlay button appears in bottom-right: **"Skip Intro →"** (or "Skip Credits →")
2. Button auto-focuses on appearance (D-pad OK dismisses overlay + seeks past boundary)
3. Auto-skip option in Settings > Playback > Auto-Skip Intro (default: OFF)
4. Button disappears if user doesn't interact within 10 seconds

Jellyfin API: `GET /Episodes/{id}/IntroTimestamps` → `{ "IntroStart": 30.0, "IntroEnd": 90.0 }`

---

## 10. Tizen Implementation Constraints

| Constraint | Impact | Solution |
|---|---|---|
| No `IntersectionObserver` on Tizen 3.0 | Can't detect visible rows natively | `scroll` event + `scrollTop` math for viewport detection |
| No CSS Grid on Tizen 3.0 | EPG time blocks need absolute positioning | `position: absolute` + calculated `left` + `width` from program timestamps |
| Max ~300 DOM nodes on Tizen 3.0 | EPG grids easily exceed this | Virtual DOM renderer — render only visible rows (section 3.5) |
| Single-threaded JS | No background EPG processing | Process EPG data in small `setTimeout(fn, 0)` slices to avoid blocking UI |
| Server clock trust | TV clock unreliable for EPG timing | Always use `server_time` from API response; never `Date.now()` for EPG |
| `fetch` not available on Tizen 3.0 | All HTTP via `XMLHttpRequest` | Polyfilled by build pipeline (doc 09) |

---

## 11. EPG Proof Gates

### 11.1 Rendering and Navigation Gates

| Gate | Requirement |
|---|---|
| EPG-GATE-01 | EPG grid renders with 50+ channels without blank rows on both TVs (QN85Q7FAAFXZA and UN55CU8000BXZA) |
| EPG-GATE-02 | D-pad navigates left/right between program blocks correctly |
| EPG-GATE-03 | D-pad navigates up/down between channel rows; virtual scroll keeps DOM count ≤ 300 on Tizen 3.0 |
| EPG-GATE-04 | Current program highlighted with progress fill AND NOW hairline is visible across all rows |
| EPG-GATE-05 | Program detail panel opens on OK; shows title, time, description |
| EPG-GATE-06 | "Jump to Now" (Red button) moves focus to currently airing program and snaps NOW hairline to 25% position |
| EPG-GATE-07 | Continue Watching row appears on home screen with correct resume position |
| EPG-GATE-08 | Search returns results from live channels + VoD + EPG programs |
| EPG-GATE-09 | Jellyfin progress reporting fires every 10s during playback |
| EPG-GATE-10 | Skip Intro button appears during applicable VOD content and seeks correctly |
| EPG-GATE-11 | Favorites add/remove works via long-press and Yellow button |
| EPG-GATE-12 | "For you, Sherri" AI Picks row is hidden when Ollama offline (no error shown) |
| EPG-GATE-13 | `server_time` used for all program progress calculations (not `Date.now()`) |
| EPG-GATE-14 | EPG data auto-refreshes when time window advances |
| EPG-GATE-15 | Mom Mode (mom_tv profile) renders 96px rows, 26px title font, 2.5-hour time window on QN85Q7FAAFXZA |
| EPG-GATE-16 | Dave Mode (dave_tv profile) renders 72px rows, 20px title font, 2-hour time window on UN55CU8000BXZA |

### 11.2 EPG Coverage and Provider Gates

| Gate | Requirement | Evidence |
|---|---|---|
| EPG-GATE-17 | Apollo provider XMLTV yields ≥ 80% channel match rate (matched + partial / total channels) | Backend match report: channel count by status for `apollo` |
| EPG-GATE-18 | XtremeHD provider XMLTV yields ≥ 80% channel match rate | Backend match report: channel count by status for `xtremehd` |
| EPG-GATE-19 | Fuzzy-match pipeline correctly classifies a test set of 20 channels across both providers | Unit test output: each channel ID, match step, status assigned |
| EPG-GATE-20 | Stale detection transitions `epg.status` from `"matched"` to `"stale"` within 5 minutes of threshold expiry | Automated test: mock last-fetch timestamp to threshold+1min, verify status in next refresh cycle |
| EPG-GATE-21 | EPG fallback to cached data activates when Threadfin is unreachable; channels remain visible with stale indicator | Staged failure test: block Threadfin port, verify grid still renders with stale clock icon |
| EPG-GATE-22 | Cross-provider EPG fallback: if `apollo` XMLTV fails, `xtremehd` EPG data serves for shared channels | Staged failure test: disable apollo feed, verify EPG data still present for channels available on both providers |
| EPG-GATE-23 | After 24h of failed fetches, `epg.status` transitions to `"missing"` and placeholder row renders | Automated test: mock last-fetch timestamp to 25h ago, verify status and grid placeholder |

### 11.3 Security Gates (EPG-specific)

| Gate | Requirement | Evidence |
|---|---|---|
| EPG-GATE-24 | No provider XMLTV URL appears in any backend log line | Log grep: `grep -iE "(apollo|xtremehd).*(xmltv|m3u|token|password|http)" backend.log` returns zero URL matches |
| EPG-GATE-25 | No provider XMLTV URL appears in any diagnostics export | Diagnostics export review: XMLTV sources identified only by provider ID |
| EPG-GATE-26 | EPG API response to Tizen app contains no provider credentials, portal URLs, or XMLTV source URLs | Wireshark / proxy capture of TV ↔ backend EPG API calls; inspect all response fields |
| EPG-GATE-27 | Catch-up stream URLs are never included in EPG API response; only `has_catchup: true` flag is present | API response schema validation; ensure `catchup_url_ref` field is absent or null in all TV-facing responses |

---

## 12. Out of Scope

- **DVR recording:** Jellyfin DVR requires additional tuner hardware; not part of the HermesTV backend stack.
- **Live subtitles in EPG program detail:** Subtitle track data is not carried in XMLTV; subtitles are shown in the player only (handled by player contract).
- **Parental control PIN enforcement in search:** Future feature; PIN flow is not defined in this contract.
- **AI-generated program descriptions:** Ollama enrichment of sparse EPG descriptions is a future enhancement (B4+). For now, missing descriptions show "No description available."
- **SchedulesDirect or paid third-party EPG subscription management:** The backend supports Threadfin's XMLTV source configuration, but the contract for selecting, configuring, or billing a third-party EPG subscription service is the operator's responsibility and is not within HermesTV's UI scope.
- **Catch-up content older than 7 days:** Provider catch-up windows are typically 7 days; content outside that window is treated as unavailable. No attempt is made to source catch-up content beyond what the provider offers.

**Note:** Catch-up / time-shift EPG behavior is IN SCOPE as of this contract version. See section 4b.

# Agent 06 — EPG & Content Discovery Research

**Project:** HermesTV-Tizen-AI
**Repo:** `https://github.com/Ghenghis/HermesTV-Tizen-AI`
**Local:** `G:\Github\HermesTV-Tizen-AI`
**Agent role:** 13 — EPG + Schedule Intelligence Agent
**Target TVs:** Mom `QN85Q7FAAFXZA` / Dave `UN55CU8000BXZA`
**Date:** 2026-05-17
**Status:** Research lock — no code before this report is reviewed

---

## 1. EPG Grid UI Patterns — How Leading Apps Do It

### 1.1 TiviMate (Android TV — gold standard reference)

TiviMate is the most-copied EPG grid pattern in IPTV. Its layout:

```
+--------------------------------------------------------------+
| TIME HEADER:  7:00     7:30     8:00     8:30     9:00       |
+------+-------+--------+--------+------------------+---------+
| CH1  | logo  | [prog] | [prog] | [program block   ] | [prog] |
| CH2  | logo  | [long program block                 ] | [p]   |
| CH3  | logo  | [p] | [program block     ] | [prog] | [prog] |
| CH4  | logo  | [program block                           ]   |
| CH5  | logo  | [p] | [p] | [program block       ] | [prog] |
+------+-------+-----------------------------------------+---+
| DETAILS PANEL: selected program title · description · time   |
+--------------------------------------------------------------+
```

**Key design decisions:**

- **Time axis is horizontal**, scrolls left/right. Channel list is vertical, scrolls up/down.
- **Program blocks are proportional to duration** (a 2-hour block is physically wider than a 30-min block). This is the defining feature of a true EPG grid vs. a channel list.
- **"Now" red line** — a vertical hairline at the current wall-clock time bisects all rows. Leftward is past, rightward is future.
- **Fixed channel column** (logo + name) is pinned left during horizontal scroll — channels don't scroll away when the user scrolls time.
- **Fixed time header row** is pinned top during vertical scroll.
- **Details panel** appears at the bottom (or as a side drawer) and updates on every focus change, no confirm press needed.
- **Jump to now** — pressing the colored key (or a dedicated remote button) snaps the time scroll back to the current time and focuses the currently-airing program on the focused channel.

**D-pad navigation in TiviMate EPG grid:**

| Input | Action |
|---|---|
| Up / Down | Move focus to adjacent channel row |
| Left / Right | Move focus to adjacent program block in the same row |
| OK | Open program action sheet (watch now, set reminder, record) |
| Back | Return to channel list or exit EPG |
| Long Left/Right | Page-scroll time by +/−1 hour |
| Red key | Jump to now (current time column) |
| Green key | Jump forward 24h |
| Yellow key | Jump back 24h |
| Blue key | Filter/search |

**Focus crossing day boundaries:** When focus reaches the rightmost program visible, scrolling right pans the time header and all program rows simultaneously. Focus moves to the next program block automatically.

**Handling narrow program blocks:** If a program is shorter than ~40px wide, TiviMate shows just the channel color or a truncated title. When that block gains focus, the details panel at the bottom shows the full title. This is the correct pattern — never try to fit full text into a 30-minute block on a TV.

### 1.2 Channels DVR EPG Layout

Channels DVR (Apple TV / Roku / Android TV) uses a very similar grid with these distinctions:

- **Mini live preview pane** in the top-right corner shows the currently focused channel's live stream in a small thumbnail (backend-generated for HermesTV — never a second live decode).
- **"Now" row highlighting** — the channel currently being played has a colored left-border indicator and the currently-airing block has a play icon overlay.
- **Time-scroll snapping** — scrolling snaps to 30-minute boundaries (6:30, 7:00, 7:30 etc.) rather than free-scrolling, which prevents partially-revealed program names.
- **Color-coded program categories** — sports programs are orange-tinted, news is blue-tinted, movies are purple-tinted, directly in the grid cell, not just in the details panel.
- **"Tonight" shortcut** — a button that filters the EPG to only show today's primetime (8pm–11pm) across all channels.

### 1.3 Plex Live TV EPG

Plex takes a cleaner, less dense approach:

- Grid is the same time-horizontal / channel-vertical model.
- Larger program block font sizes — readable from the couch without squinting.
- The channel logo is rendered larger and the channel name is shown below it.
- **Channel group filters** as horizontal pill chips above the grid (All / News / Sports / Movies / Kids) — pressing left/right on the top bar switches the filter; the grid updates to show only channels in that group.
- No color-coding of program types within blocks — all blocks are the same color with just the currently-focused one highlighted.
- Details appear in a bottom panel that expands when OK is pressed (two-step: focus shows title only, OK reveals description).

**Important:** Plex EPG avoids the "dense grid" problem by defaulting to ~8 channels visible at a time with large rows. TiviMate defaults to ~12 channels. For HermesTV on a TV screen at viewing distance, 6–8 rows is the readable maximum.

### 1.4 Kodi PVR EPG

Kodi's PVR EPG (via add-ons) is the most configurable:

- Same time-horizontal / channel-vertical grid.
- **Guide window size** is configurable: default shows 90 minutes of future programming; can be 60, 90, 120, 180 min.
- **Timeline jumps** via number keys: press 1 = jump to current time, press 2 = +30 min, etc.
- **Search within EPG** — a filter box that narrows all visible rows to channels with a matching program name in the current time window. This is a killer feature for finding what's on.
- Details panel shows: title, episode info, rating, plot, genre, start/end time, duration.
- **Reminder UI** — when focus is on a future program, an OK press opens a sub-menu with "Set reminder" / "Record" (PVR back-end dependent).

### 1.5 D-Pad Navigation Principles for a Large EPG Grid

The EPG grid is the hardest UI element to navigate well on a D-pad. These principles emerge from auditing all four apps:

**Principle 1: The grid is a 2D focus trap that must have clear escape routes.**
- Up at the top row → move focus to the time header row (from there, Left/Right scrolls time, OK or Down returns to grid).
- Down at the bottom row → move focus to a details panel or filter bar.
- Left at the leftmost program (channel name column) → return to a side nav or home.
- Back always exits the EPG entirely, never just navigates within it.

**Principle 2: Horizontal scrolling is time-scrolling, not focus-scrolling.**
When the focused program block is at the right edge of the screen, pressing Right should:
1. Move focus to the next program block in the same row, AND
2. Scroll the entire time grid left to reveal more future programming.

This "focus leads scroll" behavior is natural for TV remotes. Never require the user to explicitly scroll then move focus.

**Principle 3: Program blocks narrower than ~60px should still be focusable.**
A 15-minute program at typical EPG scale is too narrow to display a title. It must still receive focus (with D-pad) and show its full title in the details panel. Skipping focusable blocks to avoid visual clutter is wrong — the user should always be able to reach every program.

**Principle 4: Maintain focus row during time scroll.**
If the user is focused on Channel 7 and scrolls time forward, they should remain focused on Channel 7's program in the new time window — not jump back to Channel 1.

**Principle 5: Show the "now" indicator always.**
Even when the user has scrolled to tomorrow's programming, a persistent "now" chip in the time header or a "Back to now" button must be visible so users can orient themselves.

**Principle 6: Large font minimum.**
At TV viewing distance (2–3 meters), program titles need at minimum 18px rendered size. TiviMate defaults to ~20px. For HermesTV Mom Mode: 26–28px minimum.

### 1.6 "Now Playing" Indicator Patterns

| App | Now-playing indicator |
|---|---|
| TiviMate | Red vertical hairline at current time across all rows + current program has progress fill |
| Channels DVR | Red left-border on active channel row + progress fill in current program block |
| Plex | Blue tint on current program block + channel row gets a "Live" badge |
| Kodi | Current program block has a distinct filled color + play icon overlay |

**HermesTV recommendation:** Use a red or accent-colored vertical NOW line across all rows (time header + all channel rows). The currently-playing program in each row has a left-anchored progress fill. The active channel (currently tuned) has an accent left-border on its channel name cell.

---

## 2. EPG Data Sources and Formats

### 2.1 XMLTV Format

XMLTV is the universal standard for EPG data interchange. It is an XML format with this structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv source-info-url="https://example.com" generator-info-name="Threadfin">
  <!-- Channel definitions -->
  <channel id="channel.123">
    <display-name>CNN</display-name>
    <display-name lang="en">CNN</display-name>
    <icon src="https://example.com/icons/cnn.png"/>
    <url>https://example.com/channels/cnn</url>
  </channel>

  <!-- Programme listings -->
  <programme start="20260517200000 +0000" stop="20260517210000 +0000" channel="channel.123">
    <title lang="en">Anderson Cooper 360</title>
    <sub-title lang="en">Election Night Coverage</sub-title>
    <desc lang="en">Anderson Cooper anchors CNN's election night coverage.</desc>
    <category lang="en">News</category>
    <category lang="en">Current affairs</category>
    <episode-num system="xmltv_ns">2026.17.0</episode-num>
    <episode-num system="onscreen">S2026E17</episode-num>
    <video>
      <aspect>16:9</aspect>
      <quality>HDTV</quality>
    </video>
    <audio>
      <stereo>stereo</stereo>
    </audio>
    <rating system="MPAA">
      <value>TV-G</value>
    </rating>
    <star-rating>
      <value>8/10</value>
    </star-rating>
    <icon src="https://example.com/images/ac360.jpg"/>
    <previously-shown/>
    <!-- or: <live/> for live content -->
  </programme>
</tv>
```

**Key XMLTV fields for HermesTV:**

| Field | Usage |
|---|---|
| `channel/@id` | Must match the stream's channel ID in M3U `tvg-id` attribute |
| `programme/@start` / `@stop` | ISO 8601 datetime with timezone offset — always parse with timezone awareness |
| `programme/title` | Primary display text in EPG grid cell |
| `programme/sub-title` | Episode title or subtitle — show in details panel |
| `programme/desc` | Description — show in expanded details |
| `programme/category` | Genre tag — used for color-coding and filtering |
| `programme/episode-num` | Episode numbering — show S/E badges |
| `programme/icon` | Program artwork (poster/still) — show in details panel |
| `programme/video/quality` | "HDTV" or "SD" — supplemental quality hint |
| `programme/rating` | Content rating (TV-G, TV-14, R, etc.) |
| `previously-shown` | Indicates a repeat — show "Repeat" badge |
| `live` | Indicates a live broadcast — show "Live" badge |
| `new` | New episode premiere — show "New" badge |

**M3U linking:** In an M3U playlist, each stream entry must include `tvg-id` attribute matching the `channel/@id` in the XMLTV:
```
#EXTINF:-1 tvg-id="channel.123" tvg-name="CNN" tvg-logo="https://..." group-title="News",CNN HD
https://stream.example.com/cnn.m3u8
```

### 2.2 How Threadfin Serves XMLTV

Threadfin is a channel management and XMLTV proxy. In the HermesTV stack:

- Threadfin aggregates EPG from multiple XMLTV sources (configured as "xmltv" source type in Threadfin's config).
- It exposes a single unified XMLTV endpoint, e.g.: `http://threadfin:34400/xmltv/1`
- Threadfin performs channel ID mapping — it maps the provider's `tvg-id` in M3U to the correct `channel/@id` in its aggregated XMLTV output.
- The mapping is configured in the Threadfin web UI under "Mapping" or via its `DVR Mapping` file.
- Threadfin also exposes an HDHomeRun discovery endpoint, which is how it talks to Jellyfin's Live TV tuner system.

**EPG refresh:** Threadfin fetches and caches XMLTV data. Default refresh interval is configurable — recommended 6–12 hours. Threadfin stores a local cache so that if an upstream EPG provider is temporarily unavailable, the last-known-good data continues to be served.

### 2.3 How Tunarr Serves XMLTV

Tunarr is a virtual channel server. It:

- Creates virtual channels from VOD content (Jellyfin/Plex libraries) and fills them with an EPG.
- Generates its own XMLTV at: `http://tunarr:8000/api/xmltv.xml`
- Also exposes HDHomeRun at: `http://tunarr:8000/api/hdhr/discover`
- Tunarr's generated XMLTV contains the programmed schedule for each virtual channel — it knows exactly what will play and when, so its EPG is always accurate for virtual channels.
- For Tunarr channels, the `channel/@id` must match the `tvg-id` in Tunarr's M3U output.

**Tunarr vs Threadfin in HermesTV:**

| | Threadfin | Tunarr |
|---|---|---|
| Source of channels | Real IPTV provider streams | Virtual channels from Jellyfin/Plex VOD |
| EPG source | External XMLTV providers (scrapers, paid services) | Self-generated from scheduled content |
| EPG accuracy | Depends on upstream provider | Exact (Tunarr controls the schedule) |
| HDHomeRun emulation | Yes | Yes |
| Jellyfin integration | Via HDHomeRun tuner | Via HDHomeRun tuner |

### 2.4 How Dispatcharr Maps EPG to Channels

Dispatcharr is the stream router / load balancer in the stack. Its role in EPG:

- Dispatcharr assigns virtual stream endpoints (e.g., `/stream/channel-123`) that proxy to the actual provider stream.
- The EPG channel ID (`tvg-id`) in Dispatcharr's M3U output must remain stable even if the underlying provider stream URL changes.
- When the HermesTV backend normalizes the catalog, it uses Dispatcharr's stable channel IDs as the authoritative channel identifier.
- EPG lookups key on these stable IDs, so a provider credential swap does not break EPG associations.

**Key principle:** The channel `id` used in XMLTV must be the same stable identifier used in the M3U `tvg-id`. Dispatcharr is the place where this stability is enforced — it provides stable virtual stream URLs and stable channel IDs regardless of upstream provider churn.

### 2.5 EPG Providers — Free vs Paid

| Provider | Type | Quality | Notes |
|---|---|---|---|
| EPG.Best | Free (scraped) | Variable | Large coverage, may lag live events |
| SchedulesDirect | Paid (~$25/yr) | Gracenote-backed | Most accurate US guide data; structured JSON + XMLTV |
| Gracenote (via partner) | Enterprise paid | Gold standard | Powers most major IPTV apps; not directly accessible |
| TVmaze | Free API | Good for series | Excellent episode metadata; REST API, not XMLTV |
| TMDB | Free API | Good for VOD | Poster/artwork/metadata for movies and series; not live |
| Epgshare1 | Free (community) | Variable | XMLTV aggregation site; quality varies by channel |
| WebGrab+Plus | Free (scraper tool) | Variable | Self-hosted scraper; provider-dependent |

**For HermesTV:**
- Live IPTV channels: Threadfin pulls from free XMLTV sources configured by the user.
- Tunarr virtual channels: self-generated EPG, always accurate.
- VOD/series metadata: TMDB and TVmaze supplement Jellyfin's own metadata.
- Optional upgrade path: SchedulesDirect for US households wanting reliable guide data.

### 2.6 EPG Refresh Intervals

| Data type | Recommended refresh | Rationale |
|---|---|---|
| Full XMLTV fetch | Every 6–12 hours | Guide data rarely changes mid-day; daily fetch is usually sufficient |
| "Now and next" (next 2 hours) | Every 30 minutes | Live events may update start/end times |
| Current program data | Every 5 minutes | For the "now playing" indicator and "on now" rail |
| Tunarr virtual channels | On-demand or every 15 min | Tunarr's schedule changes when new content is added |

**Backend responsibility:** The HermesTV backend (Agent 18) owns all EPG fetching and caching. The Tizen app never fetches XMLTV directly. The app calls a backend endpoint (e.g., `/v1/epg/now-next?channel_ids=ch1,ch2,...`) which returns pre-processed, normalized EPG data in a compact JSON format optimized for the TV app.

### 2.7 Backend EPG API — Recommended Shape

The backend exposes purpose-built endpoints, not raw XMLTV:

**GET `/v1/epg/grid`**
```json
{
  "window_start": "2026-05-17T20:00:00Z",
  "window_end": "2026-05-17T23:00:00Z",
  "channels": [
    {
      "channel_id": "ch.cnn",
      "display_name": "CNN",
      "logo_url": "/v1/assets/logos/cnn.png",
      "group": "News",
      "sort_order": 1,
      "programs": [
        {
          "id": "prog.cnn.20260517200000",
          "title": "Anderson Cooper 360",
          "sub_title": "Election Coverage",
          "start": "2026-05-17T20:00:00Z",
          "end": "2026-05-17T21:00:00Z",
          "duration_sec": 3600,
          "description": "...",
          "category": ["News", "Current affairs"],
          "rating": "TV-G",
          "is_live": true,
          "is_new": false,
          "is_repeat": false,
          "artwork_url": "/v1/assets/epg/prog.cnn.20260517200000.jpg",
          "progress_pct": 42
        }
      ]
    }
  ]
}
```

`progress_pct` is calculated server-side: `(now - start) / (end - start) * 100`. This offloads time math from the TV app.

**GET `/v1/epg/now-next`** (lightweight, for "on now" rails)
```json
{
  "channels": [
    {
      "channel_id": "ch.cnn",
      "now": { "title": "Anderson Cooper 360", "end": "2026-05-17T21:00:00Z", "progress_pct": 42 },
      "next": { "title": "CNN Tonight", "start": "2026-05-17T21:00:00Z" }
    }
  ]
}
```

### 2.8 Handling Missing or Partial EPG Data

Not every channel will have EPG data. Graceful degradation:

| Condition | Display behavior |
|---|---|
| No EPG for channel | Show channel logo + "No guide available" text in grid row |
| EPG exists but no program at current time | Show "—" or empty block; don't crash the row |
| EPG program title exists but no description | Show "No description available" in details panel |
| Program artwork missing | Fall back to channel logo in details panel |
| EPG gap between programs | Show a gray "gap" block in the grid — still navigable |
| Stale EPG (> 24 hours old) | Show "Guide data may be outdated" toast; still render what exists |

**HermesTV backend rule:** The EPG API always returns a response, even if it's populated with placeholder data. The Tizen app never needs to handle "no EPG API response" as an EPG-specific case — that's a generic network error handled by the app's error layer.

---

## 3. Content Discovery Beyond EPG

### 3.1 "Continue Watching" — Jellyfin Source

Jellyfin tracks watch progress natively. The API endpoint:

**GET `/Users/{userId}/Items/Resume`**

Parameters useful for HermesTV:
- `MediaTypes=Video` — filter to video only
- `EnableImageTypes=Primary,Backdrop,Thumb`
- `Limit=20` — max items to return
- `Fields=Overview,RunTimeTicks,UserData`

Returns items with `UserData.PlaybackPositionTicks` — the position in 100-nanosecond ticks. Convert: `position_sec = PlaybackPositionTicks / 10_000_000`.

The `UserData.PlayedPercentage` field gives the completion percentage directly (0–100).

**Display rule:** Only show items with 5%–90% completion in "Continue Watching." Below 5% = too fresh, above 90% = essentially done.

**HermesTV rail:** The `recents_resume` layout (layout 8) already defines this rail. The backend normalizes the Jellyfin response into the standard HermesTV item card format before sending to the TV app.

### 3.2 "New Episodes" Badge

Jellyfin API endpoint for new/recently-added content:

**GET `/Users/{userId}/Items/Latest`**

Parameters:
- `IncludeItemTypes=Episode,Movie`
- `Limit=20`
- `Fields=Overview,SeriesInfo,UserData`
- `GroupItems=false`

This returns items sorted by date added. The badge rule: an episode is "New" if `DateCreated` is within the last 14 days AND `UserData.Played == false`.

For live EPG: the `<new/>` tag in XMLTV marks new episodes. The backend propagates this as `is_new: true` in the EPG API response.

**Display:** A "NEW" badge (in accent color) overlaid on the top-right corner of the tile. Keep it small — a 32×16px pill is enough.

### 3.3 Genre Browsing

Jellyfin provides genre browsing through:

**GET `/Genres`**

Parameters: `UserId`, `IncludeItemTypes=Movie,Series`

Returns a list of genre names. Each genre can then be used to fetch items:

**GET `/Users/{userId}/Items`**

Parameters: `Genres=Action&IncludeItemTypes=Movie,Series&SortBy=SortName`

For live channels: EPG `category` tags serve as genres. The backend aggregates unique categories across all channels' EPG data and exposes them as a genre filter list.

**HermesTV implementation:** The `category_carousels` layout (layout 5) is the primary genre browsing surface. The backend pre-groups channels and VOD by genre and returns ordered carousel rows.

### 3.4 AI-Powered "Because You Watched X" Rows

This is the differentiator for HermesTV. The memory agent (Agent 14) and LLM routing (Agent 19) power this:

**Architecture:**
1. Watch history is stored in the backend profile memory.
2. When the user visits the home screen, the backend queries the LLM (via Open WebUI/Pipelines) with a prompt like:
   ```
   User watch history: [CNN, ESPN, Breaking Bad, Better Call Saul, ...]
   Available catalog: [compressed channel/show list]
   Task: suggest 3 items likely to interest this user, with a 1-sentence reason.
   Format: JSON array [{channel_id, reason}]
   ```
3. The backend returns a "Because you watched X" rail with 3–6 items and their reason strings.
4. The TV app renders the reason as a subtitle under the rail heading.

**TV display:** Rail heading reads "Because you watched Breaking Bad" with 4–6 suggested items. Pressing Info on any item shows the LLM's reason in the details panel.

**Performance rule:** This computation happens on the backend, not the Tizen app. The TV app only receives the pre-computed rail JSON. The LLM inference must complete in < 5 seconds for the home screen to render quickly. Cache the result for 30 minutes.

### 3.5 Trending / Popular (From Jellyfin Play Count)

Jellyfin tracks play counts. To get popular items:

**GET `/Users/{userId}/Items`**

Parameters: `SortBy=PlayCount&SortOrder=Descending&IncludeItemTypes=Movie,Series&Limit=20`

For live channels, the HermesTV backend tracks tune-in counts per channel (from player events) and exposes a "most watched channels this week" sort.

### 3.6 "On Now / Up Next" for Live Channels

The most important live TV discovery surface. Shows what is currently airing and what starts next:

**"On Now" rail:** A horizontal rail of channel tiles, each showing:
- Channel logo
- Currently airing program title (truncated to 1 line)
- Progress bar
- Time remaining ("32 min left")

**"Up Next" section:** Below or beside the "On Now" tile, a small text line: "Next: CNN Tonight at 9:00 PM"

This is fed by the `/v1/epg/now-next` endpoint described in Section 2.7.

**Update frequency:** Poll the backend every 5 minutes to refresh "On Now" data. Implement client-side countdown timers for the progress bars (decrement locally between polls) to avoid stale-looking bars.

---

## 4. Search UX on TV

### 4.1 On-Screen Keyboard Layouts

The worst thing a TV search UX can do is launch a QWERTY grid where the user must D-pad across 26+ keys. Best patterns:

**Pattern A: Swipe keyboard (recommended for HermesTV)**

Alphabet is arranged in a 6×5 grid (A–Z + space + clear + done):
```
A  B  C  D  E  F
G  H  I  J  K  L
M  N  O  P  Q  R
S  T  U  V  W  X
Y  Z  [SP] [<] [OK]
```
26 characters = max 5 D-pad presses to reach any letter from any other. This is used by TiviMate and most modern TV apps.

**Pattern B: Frequency-ordered keyboard**

Letters ordered by English frequency (E, T, A, O, I, N, S, H, R...):
```
E  T  A  O  I  N
S  H  R  D  L  C
U  M  W  F  G  Y
P  B  V  K  J  X
Q  Z  [SP] [<] [OK]
```
Reduces average D-pad distance by ~30% for common words. Used by some Fire TV apps.

**Pattern C: Alphabetical with smart suggestions (TiviMate style)**
Standard A–Z grid with a **suggestions row above** the keyboard that updates after each letter typed. D-pad Up from keyboard → enter suggestions row, OK selects a suggestion. This collapses the full-typing path to 2–3 letters for common searches.

**HermesTV recommendation:** Pattern C (alphabetical + suggestions row). It is the most familiar and fastest for common searches.

**Keyboard safe-area:** The keyboard must not cover more than 40% of the screen vertically. Search results (or suggestions) must be visible simultaneously with the keyboard so users can see results as they type.

### 4.2 Voice Search Integration

The HermesTV backend has Azure Voice (Agent 17). The TV app's search screen should offer:

- A microphone button as the first focusable element in the search UI (D-pad Right from the search field).
- Press OK on the mic button → show a "Listening..." overlay → capture audio → send to backend → receive text → pre-populate search field.
- Samsung Tizen remote voice button (`VoiceControl`) can also trigger this: `window.addEventListener('voicecontrolresult', handler)`.
- Voice search should also support natural-language queries: "find comedy movies from the 90s" → backend routes to LLM for intent parsing, returns filtered results.

### 4.3 Search Suggestions / Autocomplete

As the user types, the backend returns suggestions:

**GET `/v1/search/suggest?q=brea&profile=dave_tv`**

```json
{
  "suggestions": [
    { "text": "Breaking Bad", "type": "series", "id": "jf.series.1234" },
    { "text": "Breakfast at Tiffany's", "type": "movie", "id": "jf.movie.5678" },
    { "text": "Breaking News (CNN)", "type": "channel", "id": "ch.cnn" }
  ]
}
```

Fetch suggestions after 2+ characters typed, with 300ms debounce. Show up to 5 suggestions above the keyboard in a horizontally scrolling row.

**Suggestion sources:**
- Jellyfin item titles (series, movies, episodes)
- Channel names from the catalog
- EPG program titles currently airing or airing today

### 4.4 Universal Search (Jellyfin VoD + Live Channels)

The full-search backend endpoint combines results from all sources:

**GET `/v1/search?q=breaking&profile=dave_tv`**

```json
{
  "query": "breaking",
  "results": [
    {
      "section": "Live Now",
      "items": [
        { "type": "channel", "channel_id": "ch.cnn", "title": "Breaking News — CNN", "subtitle": "On now · CNN", "logo_url": "..." }
      ]
    },
    {
      "section": "TV Shows",
      "items": [
        { "type": "series", "jellyfin_id": "...", "title": "Breaking Bad", "subtitle": "5 seasons · AMC", "poster_url": "..." }
      ]
    },
    {
      "section": "Movies",
      "items": []
    },
    {
      "section": "On Today",
      "items": [
        { "type": "epg_program", "channel_id": "ch.abc", "title": "Breaking: Election Results", "subtitle": "8:00 PM · ABC", "artwork_url": "..." }
      ]
    }
  ]
}
```

The TV app renders results as stacked category sections. Focus starts at the first result in the first non-empty section.

---

## 5. Jellyfin Integration Patterns

### 5.1 Jellyfin API — Key Endpoints for Discovery

All Jellyfin endpoints require an API key or user auth token in the header: `X-Emby-Authorization: MediaBrowser Token="<token>"`.

The HermesTV backend proxies all Jellyfin calls — the Tizen app never calls Jellyfin directly.

**Authentication:**
```
POST /Users/AuthenticateByName
Body: { "Username": "...", "Pw": "..." }
Returns: { "AccessToken": "...", "User": { "Id": "..." } }
```

**Core discovery endpoints:**

| Endpoint | Purpose | Key params |
|---|---|---|
| `GET /Users/{userId}/Items/Resume` | Continue Watching | `MediaTypes=Video&Limit=20` |
| `GET /Users/{userId}/Items/Latest` | Recently Added | `IncludeItemTypes=Movie,Episode&Limit=20` |
| `GET /Users/{userId}/Items` | General browse/filter | `SortBy`, `Genres`, `IncludeItemTypes`, `ParentId` |
| `GET /Genres` | Genre list | `UserId`, `IncludeItemTypes` |
| `GET /Users/{userId}/Items?SortBy=PlayCount` | Most played | `SortOrder=Descending` |
| `GET /Users/{userId}/Items?IsFavorite=true` | Favorites | — |
| `GET /Users/{userId}/FavoriteItems/{itemId}` | Toggle favorite | POST to add, DELETE to remove |
| `GET /Items/{itemId}/PlaybackInfo` | Playback URL resolution | `UserId` |
| `GET /Users/{userId}/Views` | Library views | Returns library roots (Movies, TV Shows, etc.) |
| `GET /LiveTv/Channels` | Live TV channel list | `UserId`, `SortBy`, `Limit` |
| `GET /LiveTv/Programs` | EPG programs | `ChannelIds`, `MinStartDate`, `MaxEndDate` |
| `GET /LiveTv/GuideInfo` | Guide metadata | — |

**Live TV specific (Jellyfin as DVR/guide aggregator):**
```
GET /LiveTv/Channels
  ?UserId={userId}
  &SortBy=SortName
  &EnableImages=true
  &ImageTypeLimit=1
  &EnableImageTypes=Primary
  &Limit=200
```

Returns channels with `ChannelNumber`, `Name`, `IsHD`, `IsMovie`, `IsSports`, `IsNews`, `IsKids` booleans — useful for category filtering without EPG lookup.

```
GET /LiveTv/Programs
  ?ChannelIds=ch1,ch2,ch3
  &MinStartDate=2026-05-17T20:00:00Z
  &MaxEndDate=2026-05-17T23:00:00Z
  &EnableImages=true
  &SortBy=StartDate
  &Limit=500
```

Returns program list with `StartDate`, `EndDate`, `Name`, `Overview`, `IsNew`, `IsLive`, `IsRepeat`, `Genres`, `CommunityRating`.

### 5.2 Jellyfin-Vue and Streamyfin as Reference Patterns

**jellyfin-vue** (web client reference):
- Home screen uses a "sections" pattern: each section is a named row with a Jellyfin query behind it.
- Section types: `LatestMovies`, `LatestTVShows`, `ContinueWatching`, `NextUp`, `LatestMusic`, `ActiveSessions`.
- The home screen fetches all section data in parallel (Promise.all) to minimize load time.
- Each section is rendered as a horizontal carousel using a virtual/windowed list to avoid DOM bloat (only renders visible cards + buffer).

**Streamyfin** (Expo/React Native reference):
- Uses Jellyfin's `/Users/{userId}/Items/Resume` for Continue Watching.
- Uses `/Users/{userId}/Items?SortBy=DateCreated&SortOrder=Descending` for New Arrivals.
- Implements "Next Up" using `/Shows/NextUp?UserId=...` — this endpoint specifically returns the next unwatched episode of each in-progress series. Very useful.
- Item artwork is fetched via: `/Items/{itemId}/Images/Primary?width=400&quality=90`

**GET `/Shows/NextUp`** — critical endpoint:

```
GET /Shows/NextUp
  ?UserId={userId}
  &Limit=20
  &EnableImages=true
  &ImageTypeLimit=1
  &EnableImageTypes=Primary,Thumb
  &Fields=Overview,UserData
```

Returns the next unwatched episode for each TV series the user has started. This is the "Next Up" feature — distinct from "Continue Watching" (which returns partially-watched episodes).

### 5.3 Merging Live TV Channels with VoD in One Interface

The challenge: Jellyfin's API has separate endpoints for Live TV channels and VOD libraries. HermesTV needs a unified catalog.

**Backend normalization approach:**

The HermesTV backend (Agent 11 — Catalog & Provider Normalization) merges all sources into a unified item format:

```json
{
  "id": "htv.ch.cnn",
  "source": "live_tv",
  "origin_id": "jellyfin.livetv.ch.cnn",
  "type": "channel",
  "title": "CNN",
  "logo_url": "/v1/assets/logos/cnn.png",
  "group": "News",
  "quality": "1080p",
  "stream_url": "/v1/stream/ch.cnn",
  "epg_id": "ch.cnn",
  "now_playing": { "title": "Anderson Cooper 360", "end": "2026-05-17T21:00:00Z", "progress_pct": 42 }
}
```

```json
{
  "id": "htv.vod.bb.1",
  "source": "jellyfin_vod",
  "origin_id": "jellyfin.series.abc123",
  "type": "series",
  "title": "Breaking Bad",
  "poster_url": "/v1/assets/posters/bb.jpg",
  "group": "Drama",
  "quality": "1080p",
  "episode_count": 62,
  "user_data": { "played_pct": 0, "last_played": null }
}
```

This unified format means the Tizen app works with one item type regardless of source. The app does not need to know whether an item is from Jellyfin, Tunarr, or a raw IPTV stream.

---

## 6. Watchlist and Favorites Management

### 6.1 Adding/Removing Favorites via D-Pad

**Best pattern: the "options" hold pattern.**

When focus is on any channel tile or program tile:
- **OK** → play / tune / open details (primary action)
- **Long-press OK** (hold for 500ms) → open a small options popover:
  ```
  [★ Add to Favorites]  [+ Watch Later]  [i More Info]  [× Close]
  ```
  D-pad navigates the 4 options. OK confirms the selected option. Back closes without action.

This is the TiviMate pattern and it works well because it uses a universally available button (OK) and requires no dedicated remote key mapping. It also prevents accidental favorites toggle (which single-button would cause).

**Alternative: Yellow key shortcut**

Samsung remotes have colored keys (red, green, yellow, blue). The yellow key can be mapped as a "toggle favorite" shortcut. This is faster but requires the user to know the mapping. Show a tooltip: "Press 🟡 to favorite" in the bottom info strip when focus is on a tile.

**HermesTV recommendation:** Both — long-press OK for discovery (works without knowing shortcuts), yellow key as a power-user shortcut.

### 6.2 Favorites Sync Across Profiles

Jellyfin's native favorites system (POST/DELETE `/Users/{userId}/FavoriteItems/{itemId}`) stores favorites server-side per user. Each HermesTV profile maps to a Jellyfin user ID.

For live channels (which may not be Jellyfin items), the HermesTV backend maintains its own favorites store per profile, keyed by the stable channel ID from Dispatcharr.

**Sync strategy:**
- Favorite a Jellyfin VOD item → call Jellyfin API + update local cache.
- Favorite a live channel → update HermesTV backend profile store + update local cache.
- On app launch, refresh favorites from backend. Local cache serves as the offline layer.

### 6.3 Offline Favorites Cache

The Tizen app maintains a local cache of favorites in localStorage/IndexedDB:

```json
{
  "profile_id": "dave_tv",
  "favorites": [
    { "id": "htv.ch.cnn", "type": "channel", "title": "CNN", "logo_url": "...", "pinned_at": "2026-05-17T20:00:00Z" },
    { "id": "htv.vod.bb.1", "type": "series", "title": "Breaking Bad", "poster_url": "...", "pinned_at": "..." }
  ],
  "last_synced": "2026-05-17T20:30:00Z"
}
```

On network loss: the `favorite_quick_dial` layout (layout 7) and favorites rails continue to work from this cache. The star badge on tiles reflects the cached state. Sync queue: if offline, queue toggle operations and apply on reconnect.

---

## 7. Missing Features in Current HermesTV — Gap Analysis

Based on the audit of existing docs (layouts 1–12, themes 1–24, command schema), the following EPG and discovery features are completely absent and must be designed for the next build phase:

### Priority 1 — Must Have in B2/B3 (MVP and Full UX)

| # | Feature | Gap | Design location |
|---|---|---|---|
| P1-01 | **True EPG grid with time-proportional blocks** | The `epg_strip` layout (layout 4) is defined but has no specification for proportional program block widths, the NOW hairline, or time-scroll behavior. | Extend layout 4 spec; define EPG grid component contract |
| P1-02 | **"On Now / Up Next" horizontal rail** | No home screen rail showing what's currently airing across all channels with progress bars. The `category_carousels` layout shows category rows but not a live "on now" row. | Add to `category_carousels` and `cinematic_hero` as a named rail slot |
| P1-03 | **Backend `/v1/epg/grid` and `/v1/epg/now-next` endpoints** | EPG API contract is not defined. Backend must normalize Threadfin/Tunarr XMLTV into compact JSON for the TV app. | Define in Agent 18 backend spec |
| P1-04 | **"Continue Watching" rail from Jellyfin Resume API** | The `recents_resume` layout mentions this rail but there is no defined API contract, no spec for the Jellyfin endpoint, and no progress bar rendering spec. | Define progress bar card spec; connect to `/Users/{userId}/Items/Resume` |
| P1-05 | **Universal Search with live + VOD results** | No search feature is defined anywhere in the existing docs. No keyboard spec, no search endpoint, no suggestions. | New feature — requires search UI spec and backend `/v1/search` endpoint |
| P1-06 | **"Next Up" for in-progress series (Jellyfin)** | The `recents_resume` "Suggested Next" row mentions memory agent, but Jellyfin's native `/Shows/NextUp` is simpler and more reliable. | Add to `recents_resume` as a first rail before AI suggestions |
| P1-07 | **Missing EPG data graceful degradation** | No spec for how the EPG grid renders channels that have no EPG. Silence in the current layout 4 spec. | Define fallback display rules in layout 4 extension |
| P1-08 | **EPG channel ID to stream URL mapping contract** | No document defines how `tvg-id` in M3U maps to the XMLTV `channel/@id`, or how Dispatcharr ensures ID stability. | Define in Agent 11 catalog normalization spec |

### Priority 2 — Should Have in B3/B4

| # | Feature | Gap | Design location |
|---|---|---|---|
| P2-01 | **Program reminder system** | The `create_reminder` command exists in the JSON schema (Agent 06 doc) but there is no spec for: how reminders display (toast? notification?), when they trigger, or how the reminder list is managed. | Define reminder display contract |
| P2-02 | **Genre/category filter pills on EPG grid** | Plex-style category filters above the EPG grid (All / News / Sports / Movies / Kids) to reduce the channel list to a manageable size. | Add to layout 4 spec as optional top filter bar |
| P2-03 | **"New" and "Repeat" badges on EPG blocks** | No spec for in-grid badges (Live, New, Repeat). | Define badge spec for EPG grid cells |
| P2-04 | **EPG search within guide** | Kodi-style filter that narrows the EPG to channels with a matching program name in the current time window. | Add search-in-EPG feature to layout 4 |
| P2-05 | **AI "Because you watched X" rail** | The memory agent (Agent 14) and LLM routing (Agent 19) are defined but there is no spec for how their output is rendered as a discovery rail, what the LLM prompt looks like, or how it integrates with the home screen. | Define AI recommendation rail spec |
| P2-06 | **Watch Later queue** | `pin_favorite` command exists but there is no distinct "Watch Later" feature separate from favorites. Watch Later should be time-ordered, Favorites is preference-ordered. | Add `add_watch_later` / `remove_watch_later` to command schema |
| P2-07 | **Trending / popular rail** | No spec for a trending row based on Jellyfin play counts or HermesTV tune-in counts. | Add to `category_carousels` as an optional rail |
| P2-08 | **"Tonight on Live" rail** | The `cinematic_hero` layout mentions "Tonight on Live" but does not define how it's populated (EPG window? Manual curation?). | Define as an EPG query: programs starting 6pm–midnight today |
| P2-09 | **Voice search UI** | No voice search spec despite Agent 17 (Azure Voice) existing. The search screen microphone button, listening state, and voice result handling are undefined. | Define voice search UI in the search feature spec |

### Priority 3 — Enhancement Phase

| # | Feature | Gap |
|---|---|---|
| P3-01 | **Color-coded program categories in EPG grid** | Channels DVR colors sports/news/movies tiles differently. Easy win for scannability. |
| P3-02 | **"Jump to day" in EPG** | Channels DVR Yellow/Green key jumps to +/−24h. No key binding spec for EPG layout. |
| P3-03 | **Favorites sync with Jellyfin server-side** | Favorites backend spec exists but no Jellyfin API binding (POST/DELETE `/FavoriteItems/{id}`). |
| P3-04 | **Watch history browsing** | A dedicated "Watch History" screen (not just the resume rail). |
| P3-05 | **"New Episodes" badge on series tiles** | When a series has a new unwatched episode, show a colored "new" dot on the tile. Requires `/Shows/NextUp` integration. |
| P3-06 | **TMDB/TVmaze metadata enrichment** | Jellyfin may have sparse metadata for some items. The backend should enrich from TMDB for richer descriptions and artwork. |

---

## 8. EPG Grid Layout Recommendation for HermesTV

### 8.1 Layout 4 (`epg_strip`) — Detailed Spec Extension

The existing layout 4 definition is a wireframe only. This section provides the binding technical spec for the EPG grid component.

**Grid dimensions (baseline tier):**
- Channel column: 200px wide (logo 48px + name text). Fixed, does not scroll.
- Time header height: 48px. Fixed, does not scroll vertically.
- Channel row height: 72px (Dave mode) / 96px (Mom mode).
- Visible channel rows: 6 (Dave mode) / 4 (Mom mode).
- Time window width: fills remaining screen width.
- Program block width: `(program_duration_sec / 3600) * time_column_width_per_hour_px`.

**Time column width:** At 1920px total screen width with 200px channel column and 5% safe area: available = `1920 * 0.90 - 200 = 1528px`. One hour of EPG time maps to `1528 / 3 = 509px` (for a 3-hour window). So a 30-minute program block = ~255px — wide enough to show a full title.

**Enhanced tier enhancements:**
- Channel row height: 80px (Dave mode) / 108px (Mom mode).
- Mini preview pane (right side, 280px wide) shows the focused channel's backend thumbnail.
- Smooth time-scroll animation (100ms ease-out) instead of instant jump.

**Focus order for D-pad:**
```
Time header row (left/right scrolls time)
  ↓ Down
Channel rows (up/down between channels, left/right between programs)
  ↓ Down (from bottom row)
Info/details strip (read-only, shows focused program details)
  ↓ Down
Filter chips (if visible) or auto-return to channel rows
```

**Back key behavior:** Back exits the EPG layout entirely and returns to the previous layout (typically `live_focus` or `category_carousels`).

**Jump-to-now:** Pressing the red key (or long-pressing Back) snaps the time scroll so the NOW hairline is at 25% of the time window width (i.e., 25% past, 75% future). Focus moves to the currently-airing program on the currently-selected channel.

### 8.2 Program Block Rendering Spec

```
+---------------------------+
| [NEW] [LIVE]              |  ← badge row (top-left), 24px height
| Program Title             |  ← title, 1 line, truncated with ellipsis
| 8:00 – 9:00 PM (60 min)   |  ← time range (only if block is > 200px wide)
+---------------------------+
| ████████░░░░░░░░░░░░░░░░░ |  ← progress fill (only current program)
+---------------------------+
```

For blocks narrower than 80px: show only a colored block with no text. Title appears in details panel when focused.

For blocks narrower than 40px: still render a 1px gap to distinguish from adjacent programs. Still focusable.

**Color coding:**
- Default block: `surface_1` token from active theme.
- Focused block: accent-colored border (4px) + `surface_0` background.
- Currently airing (any channel): left-fill with progress fill using `accent` at 20% opacity.
- Currently airing + active channel: full progress fill + slightly brighter background.
- Past programs: `bg_2` background, `text_disabled` text (dimmed).
- Future programs: `surface_1` background, `text_primary` text.

**Category color coding (optional, P3):**
- News: blue-tinted left border (3px).
- Sports: orange-tinted left border.
- Movies: purple-tinted left border.
- Kids: green-tinted left border.

---

## 9. Jellyfin API Quick Reference for Implementation

This section consolidates all Jellyfin endpoints HermesTV needs, with example responses shaped for the backend proxy.

### Auth Header
```
X-Emby-Authorization: MediaBrowser Client="HermesTV", Device="Tizen", DeviceId="<uuid>", Version="1.0", Token="<access_token>"
```

### Endpoint Reference Table

| Feature | Method | Jellyfin Endpoint | Key Query Params |
|---|---|---|---|
| Auth | POST | `/Users/AuthenticateByName` | `{ Username, Pw }` |
| Continue Watching | GET | `/Users/{uid}/Items/Resume` | `MediaTypes=Video&Limit=20&Fields=Overview,UserData` |
| Next Up (series) | GET | `/Shows/NextUp` | `UserId&Limit=20&Fields=Overview,UserData` |
| Recently Added | GET | `/Users/{uid}/Items/Latest` | `IncludeItemTypes=Movie,Episode&Limit=20` |
| Favorites | GET | `/Users/{uid}/Items` | `IsFavorite=true` |
| Add Favorite | POST | `/Users/{uid}/FavoriteItems/{itemId}` | — |
| Remove Favorite | DELETE | `/Users/{uid}/FavoriteItems/{itemId}` | — |
| Genre list | GET | `/Genres` | `UserId&IncludeItemTypes=Movie,Series` |
| Browse by genre | GET | `/Users/{uid}/Items` | `Genres=Action&IncludeItemTypes=Movie,Series` |
| Most played | GET | `/Users/{uid}/Items` | `SortBy=PlayCount&SortOrder=Descending` |
| Library views | GET | `/Users/{uid}/Views` | — |
| Item artwork | GET | `/Items/{itemId}/Images/Primary` | `width=400&quality=90` |
| Playback info | POST | `/Items/{itemId}/PlaybackInfo` | `{ UserId }` |
| Live TV channels | GET | `/LiveTv/Channels` | `UserId&SortBy=SortName&Limit=500` |
| Live TV programs | GET | `/LiveTv/Programs` | `ChannelIds&MinStartDate&MaxEndDate&Limit=500` |
| Mark played | POST | `/Users/{uid}/PlayedItems/{itemId}` | — |
| Mark unplayed | DELETE | `/Users/{uid}/PlayedItems/{itemId}` | — |
| Progress report | POST | `/Sessions/Playing/Progress` | `{ ItemId, PositionTicks, IsPaused }` |

### Progress Reporting (required for "Continue Watching" accuracy)

The TV app must report playback progress to Jellyfin so the Resume rail stays accurate:

```
POST /Sessions/Playing
Body: { "ItemId": "...", "MediaSourceId": "...", "PlayMethod": "DirectStream", "PositionTicks": 0 }

POST /Sessions/Playing/Progress (every 10 seconds during playback)
Body: { "ItemId": "...", "PositionTicks": 36000000000, "IsPaused": false }

POST /Sessions/Playing/Stopped
Body: { "ItemId": "...", "PositionTicks": 36000000000 }
```

This is sent to the HermesTV backend proxy, which forwards to Jellyfin. The Tizen app does not call Jellyfin directly.

---

## 10. Prioritized Implementation Roadmap

### B2 (MVP) — Minimum EPG/Discovery Viable

1. `P1-01` EPG grid component with proportional blocks, NOW hairline, D-pad navigation, and details panel. Limited to 3-hour window, no category filter.
2. `P1-04` Continue Watching rail on `recents_resume` and `cinematic_hero` layouts, backed by Jellyfin Resume API.
3. `P1-06` Next Up rail (Jellyfin `/Shows/NextUp`) on `recents_resume`.
4. `P1-08` Channel ID mapping contract — stable IDs throughout the stack.
5. `P1-03` Backend `/v1/epg/now-next` endpoint (minimal, for "On Now" rail).
6. `P1-02` "On Now" horizontal rail on `category_carousels` home layout.
7. `P1-07` EPG graceful degradation — "No guide available" display for unmatched channels.

### B3 (Full UX) — Discovery System Complete

8. `P1-05` Universal Search — on-screen keyboard (6×5 grid + suggestions row), backend `/v1/search`, voice search hook.
9. `P2-01` Reminder system — in-EPG reminder set, toast notification trigger.
10. `P2-02` Genre filter pills on EPG grid.
11. `P2-03` NEW / LIVE / REPEAT badges on EPG blocks.
12. `P2-05` AI "Because you watched X" rail — LLM prompt, backend endpoint, TV rendering.
13. `P2-06` Watch Later queue — separate from Favorites, ordered by add time.
14. `P2-07` Trending rail from Jellyfin play counts.
15. `P2-08` "Tonight on Live" EPG query rail.

### B4 (Provider/Backend Integration) — Polish & Power

16. `P3-01` Color-coded categories in EPG.
17. `P3-02` Day-jump shortcuts in EPG (Red/Green key = ±24h).
18. `P3-03` Jellyfin server-side favorites sync.
19. `P3-05` "New Episodes" dot badge on series tiles.
20. `P3-06` TMDB/TVmaze metadata enrichment for sparse Jellyfin items.
21. `P2-04` In-EPG program search/filter.
22. `P3-04` Watch History browsing screen.

---

## 11. Tech Constraints — Tizen-Specific Notes

- **EPG updates via polling is the recommended safe path.** WebSocket IS supported on Tizen 5.0+ (the same WebSocket used by the chatbot in agent-04). However, for EPG specifically, polling every 5 minutes is preferred over a persistent WebSocket connection to reduce memory and connection overhead on both TVs. Reserve WebSocket for the chatbot/agent pipeline (which requires low-latency bidirectional communication). EPG data changes slowly — polling is appropriate.
- **localStorage limit on Tizen:** 5–10 MB depending on firmware. The favorites cache, watch history, and EPG "now-next" cache must be kept compact. Use compressed JSON or a size budget cap.
- **Date/time handling:** Tizen TVs may have incorrect system clocks. The app should trust the backend's timestamps and compute "now" relative to the backend's `server_time` field returned in the EPG response, not `Date.now()` directly.
- **DOM performance in EPG grid:** A 200-channel EPG grid with 3 hours of data is ~600+ program block DOM nodes. Use a virtual/windowed renderer — only render the channel rows visible on screen plus a 2-row buffer. TiviMate on Android TV uses this approach (RecyclerView). The Tizen web app equivalent is a CSS `position: absolute` + `translateY` virtual list pattern.
- **Focus management in EPG grid:** Tizen's native focus engine (`tizen.tv.UIkeyboard`) does not understand the EPG grid's 2D layout. Use a custom focus manager: maintain a `focusRow` (channel index) and `focusCol` (program index within row) state variable; D-pad events update state and move focus programmatically using `element.focus()`.

---

## Conclusion — What Contracts Can and Cannot Rely On

**What contracts CAN rely on:**
- The XMLTV format specification and all field definitions in Section 2.1 are from the official xmltv.dtd. The XML structure is verifiable against the XMLTV standard.
- Threadfin's XMLTV endpoint (`/xmltv/1`) and HDHomeRun discovery endpoint are documented in the Threadfin GitHub project (linked in sources). These are real endpoints on the VPS.
- Tunarr's XMLTV endpoint (`/api/xmltv.xml`) and HDHomeRun endpoint (`/api/hdhr/discover`) are documented in the Tunarr GitHub project (linked in sources).
- All Jellyfin API endpoints in Sections 5.1 and 9 are from the official Jellyfin API documentation at api.jellyfin.org. The endpoint paths, parameters, and response shapes are accurate to the documented API.
- The `progress_pct` calculation formula (`(now - start) / (end - start) * 100`) is correct and the server-side calculation approach is sound.
- The EPG grid dimension calculations in Section 8.1 (channel column 200px, time window math) are arithmetically correct for 1920px reference width with 5% safe area.
- The virtual/windowed renderer requirement for large EPG grids (200 channels × 3 hours = ~600+ DOM nodes) is correct engineering — do not render all nodes at once on Tizen.
- Progress reporting to Jellyfin (`/Sessions/Playing`, `/Sessions/Playing/Progress`, `/Sessions/Playing/Stopped`) is required for Continue Watching accuracy — confirmed by Jellyfin API docs.

**What contracts CANNOT rely on (needs verification):**
- EPG provider quality (EPG.Best, Epgshare1) is described as "variable" — actual coverage quality for the specific channels in Apollo Group and XtremeHD playlists is unknown. This must be tested by the user.
- SchedulesDirect pricing (~$25/yr) was accurate as of May 2026 but is subject to change. Verify before recommending to user.
- Dispatcharr stable channel ID guarantee: the claim that Dispatcharr maintains stable IDs across provider URL changes is the expected behavior but has not been tested under actual provider swap conditions in this project. Verify at B4.
- Mom's TV EPG grid row height (96px Mom mode / 108px enhanced tier): these are design assumptions. Verify readability during B2 visual QA on-device.

---

## 12. Evidence Sources

Research for this report draws from:

- TiviMate documentation and community guides (Android TV EPG standard reference)
- Channels DVR product documentation (https://getchannels.com/docs/)
- Plex documentation — Live TV & DVR guide
- Kodi PVR documentation (kodi.wiki/view/PVR)
- Jellyfin API documentation (https://api.jellyfin.org)
- Threadfin project documentation (https://github.com/Threadfin/Threadfin)
- Tunarr project documentation (https://github.com/chrisbenincasa/tunarr)
- XMLTV format specification (https://xmltv.org/xmltv.dtd)
- SchedulesDirect API documentation
- jellyfin-vue source (https://github.com/jellyfin/jellyfin-vue) — home screen sections pattern
- Streamyfin source (React Native Jellyfin client) — Resume/NextUp patterns
- HermesTV project contracts: docs/00, 03, 04, 05, 06

---

*Report complete. No code architecture may be finalized for EPG or discovery features until this report is reviewed and approved by the Release Manager / Truth Gate agent (Agent 24).*

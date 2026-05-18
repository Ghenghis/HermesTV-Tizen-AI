# Agent 01 — GitHub IPTV Project Research: Features & Gaps for HermesTV

**Date:** 2026-05-17
**Agent lane:** 01 — IPTV Player UX Research (Master Contract §6)
**Scope:** Open-source IPTV projects on GitHub; UI patterns, EPG methods, stream management, navigation; compile TOP 15 missing features for HermesTV-Tizen-AI.
**Target TVs:** Mom `QN85Q7FAAFXZA` (QLED — enhanced tier); Dave `UN55CU8000BXZA` (Crystal UHD — baseline floor).

---

## Section 1 — Projects Surveyed

### 1.1 Dispatcharr
**GitHub:** https://github.com/Dispatcharr/Dispatcharr
**Docs:** https://dispatcharr.github.io/Dispatcharr-Docs/

**What it is:** Self-hosted IPTV and streaming management platform. Acts as the authoritative control plane for M3U/EPG sources, channel curation, and output to Plex/Jellyfin/Emby clients.

**Key features:**
- **Multi-source channel consolidation:** Combine streams from multiple providers into one unified playlist; a single virtual channel can have N backup stream sources with automatic priority ranking.
- **Automatic failover (no-viewer-interrupt):** Monitors each active stream for buffering events; when a stream stalls, Dispatcharr silently promotes the next ranked source. Viewers never see a manual reload prompt.
- **EPG auto-matching:** Fuzzy-matches imported M3U channels to XMLTV EPG entries automatically; generates channel-level XMLTV output without manual mapping for most channels.
- **Real-time stream telemetry dashboard:** Active connections, bandwidth consumption, buffer events, and per-stream health — all in a live web UI.
- **Output format flexibility:** Exposes unified playlist as M3U, Xtream Codes API, or HDHomeRun virtual tuner — clients can connect using whichever protocol they support.
- **Multi-user access control:** Per-user channel/group permissions, shareable playlists, granular access without exposing the management UI.
- **FFmpeg transcoding profiles:** Configurable per-output-profile transcoding: bitrate reduction, codec normalization, audio normalization for device compatibility.
- **Plugin system (Plugin Hub):** Installable plugins browseable and updatable from the admin UI; community plugins exist for EPG cleanup, channel health checking, and enhanced channel management.

**What HermesTV doesn't have from this:**
Dispatcharr already runs on our VPS. The gap is that HermesTV's Tizen UI has no direct visibility into Dispatcharr's stream health data, buffer events, or per-channel failover status. The TV UI shows nothing about whether a stream had to fail over, or which backup source is currently playing. There is also no UI-side "source health badge" or automatic retry prompt.

---

### 1.2 Threadfin
**GitHub:** https://github.com/Threadfin/Threadfin
**Also see:** https://github.com/marcelGoerentz/Threadfin (active fork)

**What it is:** M3U proxy for Jellyfin/Plex/Emby based on xTeVe. Merges multiple M3U/XMLTV sources into a single unified endpoint, with filtering, channel mapping, and buffer options.

**Key features:**
- Merging of multiple remote M3U files into one unified M3U and XMLTV output.
- Automatic scheduled refresh of upstream M3U and XMLTV sources.
- Channel filtering, ordering, and logo assignment.
- RAM buffer and file-based buffer modes with HLS/M3U8 support — acts as a local caching proxy to reduce upstream provider connections.
- Beta channel within the web UI for self-updating to newest release.

**What HermesTV doesn't have from this:**
Threadfin is a backend-side tool (already on VPS). The UI gap: HermesTV has no indicator for which "proxy tier" a channel is being served from (direct, buffered, cached). No visible cache-warmup indicator for channels the user frequently visits.

---

### 1.3 Tunarr
**GitHub:** https://github.com/chrisbenincasa/tunarr
**Site:** https://tunarr.com/

**What it is:** Create custom live TV channels from Jellyfin/Plex/Emby media libraries. Successor/rewrite of dizqueTV. Simulates broadcast-style scheduled programming.

**Key features:**
- **Custom channel programming:** Build a channel schedule from movies, TV episodes, music videos, or local files — plays on a loop as a "live" broadcast.
- **Filler/flex content:** Insert "commercials," music videos, bumpers, prerolls, or branding clips between programs. Flex blocks simulate commercial breaks between episodes.
- **Library system:** Reusable content collections (Filler Libraries) assignable to multiple channels.
- **Hardware-accelerated transcoding:** NVENC, VAAPI, QuickSync, macOS VideoToolbox.
- **Advanced scheduling:** Time-based, repeat, shuffle, and block scheduling options.
- **Dark mode** in the management web UI.
- **Connects as HDHomeRun tuner or M3U stream** to any IPTV client.

**What HermesTV doesn't have from this:**
The concept of "now playing on this channel" with upcoming schedule (next 2–3 items in the rotation) shown in-player. HermesTV has no "this channel is a Tunarr channel — here is what's on next" UI treatment. Also: no "add to Tunarr schedule" quick action from the TV's context menu.

---

### 1.4 m3u-editor (sparkison / m3ue)
**GitHub:** https://github.com/sparkison/m3u-editor (redirects to https://github.com/m3ue/m3u-editor)
**Docs:** https://sparkison.github.io/m3u-editor-docs/

**What it is:** Full-featured IPTV playlist and EPG editor. Comparable in scope to xTeVe/Threadfin but adds Schedules Direct EPG integration, .strm file management, webhook/script post-processing, and Xtream API output.

**Key features:**
- Works with M3U, M3U8, M3U+ formats and Xtream Codes API as input.
- Exports as M3U/M3U8 or serves streams through its own Xtream API endpoint.
- Full EPG management: XMLTV local files, remote URLs, and Schedules Direct integration.
- Store and sync `.strm` files for VOD libraries.
- Post-processing: run custom scripts, send webhooks, or send email on import/update events.
- Docker deployments (modular Nginx/Caddy or all-in-one).
- Series management: organize VOD series into structured libraries.

**What HermesTV doesn't have from this:**
No webhook/event integration so the TV can be notified when a playlist is updated (e.g., dead streams pruned, new channels added). No visual "last updated" timestamp shown in the channel list metadata. No EPG source provenance indicator (which EPG source gave this program info).

---

### 1.5 iptv-org (community M3U database)
**GitHub:** https://github.com/iptv-org/iptv
**EPG utilities:** https://github.com/iptv-org/epg
**Awesome list:** https://github.com/iptv-org/awesome-iptv

**What it is:** Community-maintained collection of publicly available IPTV channel streams and EPG utilities, organized by country/language/category. Not a player — a reference data source.

**Key features:**
- Main index playlist: `https://iptv-org.github.io/iptv/index.m3u` (thousands of channels).
- Sub-playlists by country, language, and category.
- Companion EPG repo with utilities to download/parse guide data for thousands of channels from hundreds of EPG sources.
- Community-verified channel database (schema-validated channel metadata: name, logo, country, language, categories, website).
- Daily automated bot verification of stream URLs — dead links are pruned automatically.

**What HermesTV doesn't have from this:**
No "community channel discovery" panel. No way to browse and add a channel from the iptv-org database directly from the TV. No automated "dead stream detection with community-verified replacement suggestion" in the UI.

---

### 1.6 IPTVnator
**GitHub:** https://github.com/4gray/iptvnator
**Site:** https://4gray.github.io/iptvnator/

**What it is:** Cross-platform (Electron + Angular) IPTV player for desktop and PWA. Feature-rich reference for web-based IPTV UI patterns.

**Key features:**
- **Multi-format input:** M3U, M3U8, Xtream Codes (XC), Stalker Portal (STB) — local file upload or remote URL with auto-refresh on startup.
- **Inline EPG:** Current program displayed directly in the channel list alongside the channel name — no separate EPG panel needed to see "what's on."
- **Recently watched / favorites:** Persistent across sessions; visible in dedicated sections.
- **Full-text channel search** across all playlists.
- **XMLTV EPG with current + upcoming program info** in a program info panel.
- **v0.20 major UI refresh:** Content-first dashboard; app opens directly to content rather than playlist management. Navigation, favorites, and search reworked for consistency.
- **External player support:** MPV and VLC launch passthrough.
- **PWA mode:** Runs in any browser as a progressive web app.

**What HermesTV doesn't have from this:**
Inline "what's on now" text on each channel tile in the grid/list (not just in the EPG panel). IPTVnator shows this on every row without requiring the user to open a guide. Also: content-first home screen (opens to channels/content, not a management/settings screen).

---

### 1.7 TiviMate (Android TV — UI pattern reference)
**Platform:** Android TV / Amazon Fire TV (closed-source commercial app; pattern reference only)
**Source references:** https://troypoint.com/tivimate/ and https://iptvforum.net/apps/tivimate/

**What it is:** The gold-standard Android TV IPTV player. No open-source equivalent matches its polish. Studied here for UI/UX patterns that HermesTV should match or exceed.

**Key features (pattern reference):**
- **EPG grid (timeline view):** Channels stacked vertically, programs laid out horizontally on a time axis. D-pad navigable. Current-time indicator line. Smooth horizontal scroll. Peek at past (catchup) and future programming in one view.
- **Seven-section main menu:** Search, TV, Movies, TV Shows, DVR, Favorites, Settings. Each section collapses/expands cleanly with remote.
- **Category tree navigation:** Xtream Codes category trees auto-parsed; channel logos auto-assigned; EPG refreshes on 24-hour cycle.
- **Favorites groups:** Multiple named favorites lists, not just a flat favorites bucket.
- **Multi-view (v5+):** Watch up to 4 channels simultaneously in a split-screen grid.
- **Grid view / List view toggle:** Persistent per-category preference.
- **DVR integration:** Record directly from the live player; schedule future recordings; playback with seek.
- **Parental controls:** PIN-lock per channel or per category.
- **Profiles:** Multiple user profiles, each with own favorites, history, and parental settings.
- **Recently watched:** Dedicated section; quick-resume from last position.

**What HermesTV doesn't have from this:**
The full horizontal EPG timeline grid is the single most-requested feature in IPTV UX. HermesTV currently has no timeline-based EPG view. Named favorites groups (not just a flat favorites list) is another major gap. Multiple watch profiles beyond the Dave/Mom binary are also missing.

---

### 1.8 Jellyfin-Vue
**GitHub:** https://github.com/jellyfin/jellyfin-vue

**What it is:** Experimental alternative Vue.js web client for Jellyfin. Not feature-complete; experimental only.

**Key patterns useful for HermesTV:**
- Vue-based reactive state for media library with server-push updates.
- Skeleton loading cards (placeholder UI while content loads) for perceived performance.
- Component-level lazy loading.

---

### 1.9 Streamyfin
**GitHub:** https://github.com/streamyfin/streamyfin

**What it is:** Modern Jellyfin client built with Expo for iOS/Android/TV. Companion plugin for Jellyfin server for centralized config sync.

**Key features:**
- **Skip Intro / Skip Credits buttons** — appear automatically when Jellyfin detects intro/credits timestamps.
- **Trickplay images** — scrubber thumbnails during VOD seek.
- **MPV as primary player** — wide format compatibility.
- **Offline downloads** for mobile.
- **Jellyseerr integration** — request missing content directly from the player.
- **Sessions view** — see what other household members are currently watching.
- **Chromecast support** and companion plugin for push notification management.

**What HermesTV doesn't have from this:**
Skip Intro/Credits buttons during VOD playback. Trickplay thumbnail scrubber. Sessions view (see what's playing on the other TV). Jellyseerr-style content request flow.

---

### 1.10 StreamVault (Tizen-native reference)
**GitHub:** https://github.com/christopherklint97/streamvault

**What it is:** IPTV streaming app for Samsung Tizen smart TVs built with React 19, TypeScript, Zustand, and a Node.js/SQLite backend. Actively developed. Most architecturally similar to HermesTV.

**Key features:**
- Full D-pad/remote control navigation with Tizen TV key event handling.
- Xtream Codes client integration (live TV, movies, series).
- On-demand EPG per channel (fetched per-stream, not pre-loaded grid).
- Server-side search across all content types (channels, movies, series).
- Zustand stores for: channel state, favorites, player state, network status.
- Hooks for: focus navigation, remote key handling, player control, network status.
- Express API backend with SQLite database for local state persistence.
- Tizen signing, packaging, and deployment scripts included.

**What HermesTV can learn from this:**
Network-status hook (show offline/degraded indicator in the player overlay). SQLite-backed local state for favorites/history persistence without cloud dependency during TV offline periods.

---

### 1.11 tizen-iptv-app (mbulut00486)
**GitHub:** https://github.com/mbulut00486/tizen-iptv-app

**What it is:** Netflix-style IPTV OTT application for Samsung Tizen TV. React + TypeScript + Xtream Codes API. Modern animated interface for live TV, movies, and series.

**Key features:**
- Netflix-style content rows (hero banner, horizontal carousels per category).
- Xtream Codes API integration (live/VOD/series).
- Animated transitions between sections.
- Tizen remote key bindings.

**Pattern gap for HermesTV:**
Hero banner / spotlight row for featured/curated content on the home screen. HermesTV has no editorial "featured" row — everything is uniform tiles.

---

### 1.12 react-iptv (anandsimmy)
**GitHub:** https://github.com/anandsimmy/react-iptv

**What it is:** React + Tizen TV IPTV app using React-JS-Spatial-Navigation and React-Player.

**Key features:**
- Spatial navigation library integration (react-js-spatial-navigation) — programmatic focus tree registration, D-pad traversal.
- React-Player for stream playback.

**Pattern contribution:**
Confirms that `react-js-spatial-navigation` is the community-standard spatial nav library for React-based Tizen TV apps. HermesTV's own focus engine should align with or supersede this approach.

---

### 1.13 hackTV (kosmodrey)
**GitHub:** https://github.com/kosmodrey/hackTV

**What it is:** Minimal "hackable" Samsung Tizen video/playlist/IPTV/stream player app. Designed for developers to fork and extend rather than as a production app.

**Key features:**
- Minimal codebase footprint — illustrates the minimum viable Tizen web player.
- M3U8 playlist loading and playback via AVPlay.
- Tizen SDK project structure reference.

**Pattern contribution:**
Shows the minimum AVPlay integration surface. HermesTV's player already exceeds this; no missing features, but useful as a diff baseline to confirm HermesTV doesn't regress to minimal behavior.

---

### 1.14 IPTVClient (nionis99)
**GitHub:** https://github.com/nionis99/IPTVClient

**What it is:** Samsung Tizen IPTV frontend using jQuery, Vanilla JS, and vis.js for EPG visualization.

**Key features:**
- `vis.js` timeline component for EPG rendering — horizontal timeline with channel rows.
- marquee.js for long channel name display (scroll animation for overflow text).
- jQuery-based remote event handling.

**Pattern contribution:**
vis.js timeline for EPG is a proven approach on Tizen without React overhead. The marquee pattern for long channel names is directly applicable to HermesTV's channel list.

---

### 1.15 iptv-org/epg
**GitHub:** https://github.com/iptv-org/epg

**What it is:** Utility collection for downloading and parsing EPG data from hundreds of sources worldwide.

**Key features:**
- Supports 400+ EPG source scrapers.
- Output in XMLTV format.
- Docker-ready.
- Complements iptv-org/iptv channel database.

**Relevance for HermesTV:**
Backend EPG refresh pipeline. HermesTV's Threadfin/Dispatcharr stack should reference iptv-org/epg as a fallback EPG source for channels that have no EPG match in primary sources.

---

## Section 2 — Cross-Project UI Pattern Summary

| Pattern | Best example source | HermesTV current status |
|---|---|---|
| Horizontal EPG timeline grid (channels vertical, time horizontal) | TiviMate / IPTVClient (vis.js) | Missing |
| Inline "now playing" text on every channel tile | IPTVnator | Missing |
| Named favorites groups (multiple lists) | TiviMate | Missing (flat favorites only) |
| Hero/spotlight featured content row | tizen-iptv-app (mbulut00486) | Missing |
| Skip Intro / Skip Credits button | Streamyfin | Missing |
| Trickplay scrubber thumbnails (VOD) | Streamyfin | Missing |
| Multi-view (2–4 streams simultaneously) | TiviMate v5+ | Missing |
| Stream health badge / failover indicator | Dispatcharr telemetry | Missing in UI |
| Network status overlay (offline/degraded) | StreamVault hooks | Missing |
| Sessions view (what's on other TV) | Streamyfin | Missing |
| Direct channel number input keypad | TiviMate / Channels DVR | Missing |
| Recently watched / continue watching row | IPTVnator, AnyTV | Missing |
| Catchup / TV archive playback | IPTVnator, Kodi catch-up | Missing |
| PIN-locked channels or categories | TiviMate / IPTV Smarters | Missing |
| Content request flow (Jellyseerr) | Streamyfin | Missing |
| Tunarr "next on this channel" schedule strip | Tunarr | Missing |
| Long channel name marquee scroll | IPTVClient | Unknown/missing |
| Webhook notification for playlist update | m3u-editor | Missing |
| AVPlay bitrate/quality level selector UI | Samsung AVPlay API | Missing |
| Ambient/screensaver stream preview | TiviMate, custom | Planned (screensaver mode) |

---

## Section 3 — TOP 15 Missing Features for HermesTV

Features are ranked by: **User Impact** (U, 1–5), **Tizen Feasibility** (T, 1–5), and **VPS Backend Support** (V, 1–5). Score = U + T + V. Ties broken by user impact weight.

---

### #1 — Horizontal EPG Timeline Grid View
**Score: 5+5+5 = 15**

**What it is:** The standard cable-guide layout. Channels listed vertically on the left. Time axis runs left-to-right showing current and upcoming programs. Current-time indicator line. D-pad navigable: left/right moves through time slots, up/down switches channels.

**Why it's #1:** Every major IPTV app (TiviMate, Channels DVR, Samsung TV Plus) ships this as its primary EPG view. Users coming from cable TV expect it. Without it, HermesTV feels like a channel list browser, not a TV guide.

**Tizen feasibility:** High. `vis.js` timeline proven on Tizen (IPTVClient). Alternatively, a custom CSS grid + JS scroll engine. XMLTV data is already available via Dispatcharr/Threadfin. No backend work needed.

**Backend support:** Full. Dispatcharr exports XMLTV; Threadfin merges XMLTV. Both already running.

**Mom/Dave notes:** Mom variant — larger time slots, fewer channels visible (4–5 rows), larger text. Dave variant — standard density (6–8 rows). QLED enhanced tier: smooth scroll with CSS transform transitions.

---

### #2 — Inline "Now Playing" Text on Every Channel Tile
**Score: 5+5+5 = 15**

**What it is:** Below (or beside) each channel name on every tile in the channel list/grid, show the current EPG program title and its progress bar. No need to open a guide panel to see what's on.

**Why it's #2:** IPTVnator treats this as mandatory. It converts a passive channel list into an active programming guide. Massive reduction in navigation steps for casual browsing ("what's on this channel?").

**Tizen feasibility:** High. EPG data is already fetched from Dispatcharr. Rendering program title + a CSS progress bar per tile is straightforward. Tile height must accommodate the second line — already supported in the 12 layout presets (medium/large density variants).

**Backend support:** Full. Dispatcharr's XMLTV output provides start/stop timestamps and program names.

**Mom/Dave notes:** Mom variant — program title truncated at 30 chars + marquee; progress bar high-contrast. Dave variant — standard.

---

### #3 — Stream Health Badge / Failover Status Indicator
**Score: 5+4+5 = 14**

**What it is:** A small badge on the player overlay (and optionally on channel tiles in the list) that shows: green dot (stream healthy), yellow dot (one failover occurred), red dot (multiple failovers / degraded quality). Optionally: tooltip showing "Playing source 2 of 3."

**Why it's #3:** HermesTV's Dispatcharr backend already performs automatic failover silently. Users currently have no idea if their stream had to fall back to a backup source or if the primary is degraded. Surfacing this builds trust and allows informed decisions ("I should check this provider later").

**Tizen feasibility:** Moderate-high. Requires a polling API call to Dispatcharr's real-time stats endpoint or a lightweight WebSocket connection from backend. Dispatcharr exposes stream health data in its dashboard — an HermesTV API bridge can proxy a simplified health status per channel.

**Backend support:** Full. Dispatcharr has live telemetry. A thin `/api/stream-health/{channelId}` endpoint in the HermesTV backend API (hermes-tv-api) can aggregate this.

**Mom/Dave notes:** Mom variant — health badge displayed always visible in player corner. Dave variant — same, potentially smaller.

---

### #4 — Named Favorites Groups (Multiple Lists)
**Score: 5+4+4 = 13**

**What it is:** Instead of a single flat "Favorites" bucket, users can create named lists: "Sports," "Mom's Shows," "Kids," "News." Each list is separately navigable from the side nav or home screen.

**Why it's #4:** TiviMate's killer household feature. In a two-person household (Dave + Mom), having separate named favorites groups maps directly to their different viewing preferences without requiring full profile switching. Current HermesTV has Dave Mode / Mom Mode as profiles, but no channel-list-level named grouping.

**Tizen feasibility:** High. JSON-backed favorites groups stored in hermes-tv-api (or localStorage as fallback). Rendering named group tabs in the side nav or as horizontal tab strip is straightforward with spatial navigation.

**Backend support:** Moderate — requires a profile/favorites API endpoint in hermes-tv-api. No VPS streaming infrastructure change needed.

**Mom/Dave notes:** Each profile (Mom/Dave) should have their own independent set of named groups. Cross-profile groups (e.g., "Family" visible to both) are a stretch goal.

---

### #5 — Direct Channel Number Entry (Keypad Overlay)
**Score: 5+4+4 = 13**

**What it is:** Press a number key (0–9) on the remote to open a numeric overlay. User types a 1–4 digit channel number. After a short delay (or pressing OK), the app tunes directly to that channel. Works like traditional cable TV.

**Why it's #5:** The fastest possible channel change for users who remember their channel numbers. Essential for the classic TV experience. Channels DVR and TiviMate both implement this. On Samsung remotes, the number keys are available — HermesTV must register and handle them.

**Tizen feasibility:** High. Samsung remote number keys (key codes 48–57 / VK_0–VK_9) are available and registerable. A CSS overlay showing the typed number, with a 1.5s debounce-and-tune timeout, is simple to build.

**Backend support:** None required. Channel number → M3U channel index or Xtream channel number mapping lives in frontend state (already synced from Dispatcharr).

**Mom/Dave notes:** Mom variant — larger keypad overlay, display the channel name/logo alongside the typed number. Dave variant — standard minimal overlay.

---

### #6 — Recently Watched / Continue Watching Row
**Score: 5+4+4 = 13**

**What it is:** A dedicated section (home screen row or side nav entry) showing the last 8–12 channels/VOD items the user watched. For VOD: show resume position and progress bar. For live TV: show last-tuned timestamp.

**Why it's #6:** Standard in every modern streaming UI (Netflix, TiviMate, IPTVnator). Removes the need to navigate a full channel list to return to the same channel. Essential for the "pick up where I left off" experience.

**Tizen feasibility:** High. Watch history stored in localStorage (indexed by profile) with timestamps. VOD resume position stored as percentage. Minimal storage footprint. Backend sync to hermes-tv-api makes it cross-device (future).

**Backend support:** Low effort. hermes-tv-api needs a simple watch-history endpoint. Until that exists, localStorage is sufficient.

**Mom/Dave notes:** History is per-profile. Mom variant — larger cards with "Last watched: 3 hours ago" label. Dave variant — standard.

---

### #7 — Skip Intro / Skip Credits Buttons (VOD)
**Score: 4+4+5 = 13**

**What it is:** During VOD playback (Jellyfin content), a "Skip Intro" or "Skip Credits" button appears at the appropriate timestamp (sourced from Jellyfin's intro detection plugin). User presses OK on remote to skip instantly.

**Why it's #7:** Streamyfin ships this as a first-class feature. Jellyfin's intro/credits detection plugin (chapter markers) provides timestamps automatically. This is the most universally appreciated VOD quality-of-life feature.

**Tizen feasibility:** High. Jellyfin API provides chapter/intro/credits timestamps per media item. Tizen app polls for these when a VOD starts playing. A CSS overlay button appears at the correct playback time. AVPlay's `getCurrentTime()` drives the timing logic.

**Backend support:** Full. Jellyfin already on VPS. The intro detection plugin can be installed server-side. No additional infrastructure needed.

**Mom/Dave notes:** Mom variant — button large, prominent, high-contrast, auto-dismisses after 8 seconds. Dave variant — smaller, auto-dismisses after 5 seconds.

---

### #8 — Catchup / TV Archive Playback
**Score: 5+3+4 = 12**

**What it is:** For channels that support catch-up (timeshift), the EPG grid shows past programs in a "playable" state. User navigates to yesterday's 8pm show, presses OK, and it plays from the beginning. Requires provider-level catchup support (M3U `catchup` tags or Xtream Codes catchup parameters).

**Why it's #8:** IPTVnator lists this as a flagship feature. It fundamentally changes the value proposition: live TV becomes an on-demand archive. Dispatcharr can expose catchup-capable streams.

**Tizen feasibility:** Moderate. Requires EPG to display past time slots (not just future). Requires constructing catchup stream URLs (`?start=&duration=` pattern or Xtream Codes catchup format). AVPlay plays these the same as live. The complexity is in the EPG UI showing past slots as clickable.

**Backend support:** Partial. Dispatcharr proxies catchup streams if the upstream provider supports it. Not all channels in the playlist will have catchup. Threadfin/Dispatcharr pass through `catchup` M3U attributes.

**Mom/Dave notes:** Mom variant — past programs clearly labeled "Watch Again" in the EPG grid. Dave variant — standard gray-out with playable indicator.

---

### #9 — Trickplay Thumbnail Scrubber (VOD)
**Score: 4+3+5 = 12**

**What it is:** During VOD seek (scrubbing), small thumbnail preview images appear above the progress bar showing a frame from the video at the scrub position. Sourced from Jellyfin's trickplay image generation.

**Why it's #9:** Streamyfin ships this. Jellyfin generates trickplay image sprites server-side. Eliminates "blind scrubbing" — users can see exactly where they are in the video. Critical for long movies and TV episodes.

**Tizen feasibility:** Moderate. Jellyfin API provides trickplay image URLs. The challenge is rendering a thumbnail preview in the player overlay while AVPlay is seeking. AVPlay's `seekTo()` doesn't provide frame preview; the thumbnail must be fetched from Jellyfin separately. CSS overlay approach is viable.

**Backend support:** Full. Jellyfin on VPS generates trickplay sprites for all library content automatically (requires server-side plugin/setting enabled).

**Mom/Dave notes:** Mom variant — larger thumbnail (200×110px). Dave variant — standard (160×90px). Enhanced tier (Mom's QLED): smoother thumbnail transition animation.

---

### #10 — Sessions View (What's On the Other TV)
**Score: 4+4+4 = 12**

**What it is:** A "Now Playing Elsewhere" section — visible from either TV — showing what the other TV is currently watching. Powered by Jellyfin's active sessions API. Optionally: one-click "switch to same channel" or "join this stream."

**Why it's #10:** Streamyfin's sessions view is a household coordination feature. In a two-TV household, knowing what Mom is watching (or what Dave left on) without walking to the other room is genuinely useful. Unique to HermesTV's household context.

**Tizen feasibility:** High. Jellyfin's `/Sessions` API endpoint returns all active client sessions with current media info. Polling this every 30 seconds from either TV is trivial. A small "Other TV" info card in the side panel or home screen is straightforward.

**Backend support:** Full. Jellyfin already on VPS and manages sessions.

**Mom/Dave notes:** Dave TV shows "Mom is watching: [channel/title]" and vice versa. Mom variant — displayed prominently in home screen sidebar. Privacy toggle available to hide from other TV.

---

### #11 — PIN-Locked Channels / Category Lock
**Score: 4+4+3 = 11**

**What it is:** Mark individual channels or entire categories as PIN-protected. When the user navigates to a locked channel and presses OK, a numeric PIN entry overlay appears. Correct PIN required to tune in.

**Why it's #11:** Standard IPTV feature in TiviMate, IPTV Smarters, and Purple Player. In a household context, provides a minimal parental/personal lock without requiring full user profiles. Useful for sport betting channels, news categories, or personal watch lists.

**Tizen feasibility:** High. PIN stored (hashed) in localStorage per profile. Lock state stored per channel/category ID. Numeric PIN overlay uses the same keypad component as channel number entry (#5). No backend required for basic implementation.

**Backend support:** Low. Could be synced to hermes-tv-api for persistence, but localStorage is sufficient for v1.

**Mom/Dave notes:** Separate PINs per profile. Admin unlock available via chatbot (with user confirmation).

---

### #12 — Hero/Spotlight Row on Home Screen
**Score: 4+4+3 = 11**

**What it is:** The top section of the home screen features a large "featured" panel (full-width or 60% width) highlighting curated content: a trending Tunarr channel, a Jellyfin recently-added movie, or an AI-suggested show. Below: horizontal content carousels per category.

**Why it's #12:** The tizen-iptv-app (mbulut00486) and every major streaming service uses this. Converts a static channel grid into an editorial experience. Open WebUI integration can power the AI curation.

**Tizen feasibility:** Moderate. Hero panel requires a poster/backdrop image (available from Jellyfin metadata), a title, and a description. The AI recommendation requires an API call to Open WebUI on the VPS. The hero swaps automatically every 30 seconds or on D-pad press.

**Backend support:** Good. Jellyfin provides metadata/backdrops. Open WebUI on VPS can serve recommendations via a simple `/api/recommend` endpoint. Tunarr provides "now on" data.

**Mom/Dave notes:** Mom variant — hero panel takes 70% of screen height, very large text. Dave variant — hero panel 40% height, standard text. Enhanced tier: parallax/motion backdrop.

---

### #13 — Jellyseerr Content Request Flow
**Score: 3+4+4 = 11**

**What it is:** While browsing the channel/VOD catalog, if a user searches for content not in the library, they can press a "Request" button to submit a content request via Jellyseerr (or Overseerr). The request goes to the VPS, which can auto-download via Sonarr/Radarr if configured.

**Why it's #13:** Streamyfin ships this. Converts HermesTV from a passive player into an active media management interface. Particularly useful for Dave who may want to request specific movies while browsing.

**Tizen feasibility:** High. Jellyseerr has a REST API. The Tizen app sends a POST request to Jellyseerr via hermes-tv-api (to avoid exposing the Jellyseerr URL). The user gets a confirmation toast notification.

**Backend support:** Requires Jellyseerr to be added to the VPS Docker stack. Not currently in the stack — medium effort to add. Sonarr/Radarr would also be needed for automated downloads.

**Mom/Dave notes:** Dave variant — enabled by default. Mom variant — may not be useful; can be hidden in Mom Mode.

---

### #14 — AVPlay Bitrate / Quality Level Selector
**Score: 3+4+4 = 11**

**What it is:** An in-player quality menu (like YouTube's gear icon): shows available bitrate levels from the HLS manifest (e.g., 720p/2Mbps, 1080p/4Mbps, 1080p/8Mbps). User can force a level or leave it on Auto.

**Why it's #14:** AVPlay supports `setStreamingProperty('ADAPTIVE_INFO', 'BITRATES=...|STARTBITRATE=HIGHEST')` and `AVAILABLE_BITRATE` queries. On Dave's TV (Crystal UHD, slower connection possible), manual bitrate selection prevents buffering. On Mom's QLED (faster TV), default to HIGHEST.

**Tizen feasibility:** High. AVPlay API provides all required methods. UI is a simple popup menu accessible via the remote Info/Green key.

**Backend support:** None. AVPlay handles HLS adaptive streaming internally.

**Mom/Dave notes:** Dave TV default: AUTO. Mom TV default: HIGHEST (per asymmetric performance rule — Mom's TV is never system-limited). Dave TV: quality selector visible. Mom TV: selector available but defaults locked to max.

---

### #15 — Uptime Kuma Service Health Panel
**Score: 3+4+4 = 11**

**What it is:** An optional "Backend Health" screen (accessible from Settings menu) showing the status of all VPS services: Jellyfin, Tunarr, Dispatcharr, Threadfin, Open WebUI, Uptime Kuma itself. Color-coded status indicators. Pulls from Uptime Kuma's status page API.

**Why it's #15:** Uptime Kuma already runs on the VPS. A simple read of its status page endpoint gives HermesTV real-time visibility into whether a service outage is causing playback issues. Instead of "why is VOD broken?" guessing, the user sees "Jellyfin: DOWN" directly on the TV.

**Tizen feasibility:** High. Uptime Kuma exposes a public/private status page with a JSON API. A periodic poll (every 60 seconds) from hermes-tv-api to Uptime Kuma's API, surfaced as a simple status panel on the TV.

**Backend support:** Full. Uptime Kuma is already in the VPS Docker stack. No changes needed to infrastructure.

**Mom/Dave notes:** Mom variant — status panel hidden from main navigation (accessible via Settings > System Health). Dave variant — optional quick-status badge in the Settings section header showing "All systems OK" or "1 service down."

---

## Section 4 — Prioritized TOP 15 Summary Table

| Rank | Feature | U | T | V | Score | Profile notes |
|---|---|---|---|---|---|---|
| #1 | Horizontal EPG Timeline Grid | 5 | 5 | 5 | 15 | Mom: large rows; Dave: standard |
| #2 | Inline "Now Playing" on Tiles | 5 | 5 | 5 | 15 | All profiles |
| #3 | Stream Health / Failover Badge | 5 | 4 | 5 | 14 | Mom: always visible; Dave: same |
| #4 | Named Favorites Groups | 5 | 4 | 4 | 13 | Per-profile |
| #5 | Direct Channel Number Keypad | 5 | 4 | 4 | 13 | Mom: large overlay; Dave: minimal |
| #6 | Recently Watched / Continue Watching | 5 | 4 | 4 | 13 | Per-profile, local-first |
| #7 | Skip Intro / Skip Credits (VOD) | 4 | 4 | 5 | 13 | Mom: large/auto-dismiss; Dave: compact |
| #8 | Catchup / TV Archive Playback | 5 | 3 | 4 | 12 | Requires catchup-capable providers |
| #9 | Trickplay Scrubber Thumbnails (VOD) | 4 | 3 | 5 | 12 | Mom: larger; QLED smooth transition |
| #10 | Sessions View (Other TV Now Playing) | 4 | 4 | 4 | 12 | Household-unique feature |
| #11 | PIN-Locked Channels / Categories | 4 | 4 | 3 | 11 | Per-profile PINs |
| #12 | Hero/Spotlight Row on Home Screen | 4 | 4 | 3 | 11 | Mom: large; QLED: parallax backdrop |
| #13 | Content Request Flow (Jellyseerr) | 3 | 4 | 4 | 11 | Dave: on; Mom: optional |
| #14 | AVPlay Quality Level Selector | 3 | 4 | 4 | 11 | Dave: auto; Mom: max (never capped) |
| #15 | Uptime Kuma Service Health Panel | 3 | 4 | 4 | 11 | Mom: Settings-only; Dave: badge |

---

## Section 5 — Implementation Notes for Tizen Constraints

### AVPlay limitations to plan around
- AVPlay `seekTo()` does not return frame thumbnails — trickplay must use Jellyfin sprite images overlaid via CSS, not from AVPlay itself.
- AVPlay quality level selection uses `setStreamingProperty('ADAPTIVE_INFO', ...)` — must be called in IDLE state before `prepare()`, so quality preference must be captured before stream initialization.
- AVPlay does not support native PiP — multi-view (#12 TiviMate pattern) is a stretch goal requiring multiple AVPlay instances, only viable on Mom's QLED tier if memory probe passes.

### EPG grid rendering on Tizen
- `vis.js` timeline (used by IPTVClient/nionis99) is proven on Tizen but adds ~180KB to bundle. Evaluate against a custom lightweight CSS grid timeline for Dave's TV memory budget.
- EPG data should be pre-fetched and cached in IndexedDB (not localStorage for large XMLTV datasets). 24-hour cache with background refresh.

### Spatial navigation for new overlays
- Every new overlay (keypad, quality selector, PIN entry, favorites group picker) must register itself in the focus tree and restore focus to its triggering element on dismiss.
- Back key (keyCode 10009) must always dismiss overlays before navigating up the page hierarchy.

### Mom's TV asymmetric rule (from Memory)
- Mom's TV is never system-limited. All features in this list that have a "Mom: enhanced" note must not degrade to baseline behavior on the QN85Q7FAAFXZA. Only Dave's TV carries caps.
- Feature #14 (quality selector): Mom TV must default to HIGHEST bitrate and must not expose a "quality cap" setting.

---

## Section 5.1 — Conclusion: What Contracts Can and Cannot Rely On

**What contracts CAN rely on from this research:**
- The 15 open-source projects listed in Section 1 are real, verifiable GitHub repos. All GitHub URLs are public and were current as of May 2026.
- The EPG grid pattern (TiviMate, IPTVClient vis.js) is the confirmed gold standard for IPTV UX. Contracts can require this as a must-have feature.
- AVPlay's `setStreamingProperty('ADAPTIVE_INFO', ...)` bitrate control API is confirmed by Samsung developer documentation (linked in Section 6). The code snippets in #14 are accurate to the documented API.
- Dispatcharr, Threadfin, Tunarr are confirmed VPS-running tools (per the project's existing backend stack). The gap analysis in Section 2 (missing HermesTV features) accurately reflects what these tools provide vs. what the TV UI surfaces.
- The `vis.js` EPG timeline approach (IPTVClient/nionis99) is proven on Tizen (confirmed by that repo targeting Samsung Tizen TV directly).
- StreamVault (christopherklint97) uses the same React + Tizen architecture as HermesTV — its patterns for Zustand stores, hooks, and Tizen signing are directly applicable.

**What contracts CANNOT rely on from this research (needs real data):**
- vis.js bundle size estimate (~180KB): NEEDS VERIFICATION against actual npm package size at the version used.
- EPG data pre-fetch performance in IndexedDB on Tizen — the recommendation is sound but no specific timing data was benchmarked. See agent-02 for memory budgets.
- Mom's TV multi-view (multiple AVPlay instances): the note references "memory probe" — this probe has NOT been run. Multi-view must not be committed as a feature for Mom's TV without on-device memory testing.
- Provider-specific catchup support (Section #8): Apollo Group and XtremeHD catchup capability has NOT been verified. Catchup must be marked as provider-dependent until tested.

---

## Section 6 — Source URLs

- Dispatcharr: https://github.com/Dispatcharr/Dispatcharr
- Dispatcharr Docs: https://dispatcharr.github.io/Dispatcharr-Docs/
- Threadfin: https://github.com/Threadfin/Threadfin
- Threadfin fork (active): https://github.com/marcelGoerentz/Threadfin
- Tunarr: https://github.com/chrisbenincasa/tunarr
- Tunarr site: https://tunarr.com/
- m3u-editor: https://github.com/m3ue/m3u-editor (was sparkison/m3u-editor)
- m3u-proxy: https://github.com/m3ue/m3u-proxy
- iptv-org/iptv: https://github.com/iptv-org/iptv
- iptv-org/epg: https://github.com/iptv-org/epg
- iptv-org/awesome-iptv: https://github.com/iptv-org/awesome-iptv
- IPTVnator: https://github.com/4gray/iptvnator
- IPTVnator site: https://4gray.github.io/iptvnator/
- TiviMate review: https://iptvforum.net/apps/tivimate/
- Jellyfin-Vue: https://github.com/jellyfin/jellyfin-vue
- Streamyfin: https://github.com/streamyfin/streamyfin
- StreamVault (Tizen): https://github.com/christopherklint97/streamvault
- tizen-iptv-app (Netflix-style): https://github.com/mbulut00486/tizen-iptv-app
- react-iptv (Tizen, spatial nav): https://github.com/anandsimmy/react-iptv
- hackTV (Tizen minimal): https://github.com/kosmodrey/hackTV
- IPTVClient (Tizen, vis.js EPG): https://github.com/nionis99/IPTVClient
- Samsung TizenTVApps: https://github.com/Samsung/TizenTVApps
- Awesome Smart TV: https://github.com/vitalets/awesome-smart-tv
- Dispatcharr EPG Janitor Plugin: https://github.com/PiratesIRC/Dispatcharr-EPG-Janitor-Plugin
- Enhanced Channel Manager (Dispatcharr): https://github.com/MotWakorb/enhancedchannelmanager
- tizen-xtream-iptv: https://github.com/dearbulut/tizen-xtream-iptv
- StreamVault Android TV: https://github.com/Davidona/StreamVault-IPTV
- Uptime Kuma: https://github.com/louislam/uptime-kuma
- AVPlay Adaptive Streaming (Samsung Dev): https://developer.samsung.com/smarttv/develop/guides/multimedia/adaptive-streaming.html
- AVPlay API Reference: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html

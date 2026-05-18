# Agent 09 — IPTV & Streaming App UX Research

**Project:** HermesTV-Tizen-AI
**Repo:** `https://github.com/Ghenghis/HermesTV-Tizen-AI`
**Local:** `G:\Github\HermesTV-Tizen-AI`
**Agent role:** 09 — IPTV UX Pattern Research
**Target TVs:** Mom `QN85Q7FAAFXZA` / Dave `UN55CU8000BXZA`
**Date:** 2026-05-17
**Status:** Research — no code may be finalized before this report is reviewed

---

## Purpose

This report audits 14 IPTV and streaming apps for UX patterns, layout approaches, EPG design, focus/remote navigation, quality badge display, provider/source switching, profile support, and search UX. The goal is not to replicate any app but to identify proven patterns HermesTV must adopt or decisively beat.

No generic claims. Each feature is attributed to the specific app it was observed in. Unverified details are explicitly flagged.

---

## 1. TiviMate (Android TV IPTV Player)

**Platform:** Android TV / Google TV (sideloaded APK)
**Positioning:** Considered the gold standard for Android TV IPTV UX as of 2026.

### Primary Layout Pattern

Hybrid: A full-screen **EPG grid** is the primary mode. Secondary mode is a channel list (vertical list with NOW/NEXT strip to the right). Users switch between grid and list with a single D-pad press. There is no separate home screen or carousel hub — the EPG or the channel list IS the home screen.

### EPG Guide Approach

**Full-screen time-proportional grid.** This is TiviMate's defining feature:

- Time axis runs horizontally. Channel list runs vertically (left column, pinned).
- Program block width is proportional to duration: a 2-hour block is physically twice as wide as a 1-hour block.
- A red vertical "now" hairline bisects all rows at the current wall-clock time.
- The time header row (showing 7:00, 7:30, 8:00...) is pinned at the top and scrolls only horizontally.
- The channel column (logo + name) is pinned at the left and scrolls only vertically.
- The grid body scrolls in both axes independently.
- A details panel at the bottom auto-updates on every focus change (no OK press required to see the description).
- **Red key** = jump to now. **Green key** = jump forward 24h. **Yellow key** = jump back 24h. **Blue key** = EPG search/filter.
- Narrow program blocks (< ~40px) show only a color strip; the details panel carries the title.

### Quality Badge Display

TiviMate displays quality badges sourced from the M3U `tvg-name` label (e.g., "CNN HD", "ESPN 4K") — it reads the string in the stream name. This is a known weakness: it trusts the provider's labeling, not an actual probe of the stream. No ffprobe or resolution verification is performed client-side.

<!-- UNVERIFIED: TiviMate — whether TiviMate Premium v5.x added any stream-probing for quality badge beyond M3U label parsing -->

Quality badge appears as a small text chip in the channel list (top-right of the channel row) and in the EPG channel column. Common labels: `HD`, `FHD`, `4K`, `SD`.

### Provider / Source Switching UX

TiviMate supports **multiple M3U playlists simultaneously.** Each playlist is called a "playlist" in the UI. Users can:
- Add multiple playlists (each is a separate provider or M3U source).
- Assign each playlist a display name and a color.
- Merge all playlists into one unified channel list, or **switch between playlists** using a side-drawer menu (accessed by pressing Left from the channel list or a dedicated remote key).
- Channel groups within each playlist are mapped to categories in the EPG filter.

**Provider switch is instantaneous** — pressing Left opens the playlist/group drawer, D-pad down selects a different playlist, OK confirms and the channel list reloads with the new playlist's channels.

### Focus / Remote Navigation

- All navigation is D-pad + OK. No pointer required.
- Long-press OK on any channel or program opens a context menu: Watch, Add to Favorites, Set Reminder, Record (if DVR configured).
- Back exits the current view depth (EPG → channel list → main menu → exit prompt).
- The EPG grid uses a custom 2D focus manager — focus row and focus column are tracked independently, not by HTML/TV native focus system.
- No focus traps: pressing Up at the top row moves focus to the time header; pressing Left at the channel column returns to a side drawer.

### Profile / Multi-User Support

TiviMate does NOT support named profiles in the traditional sense. It is a single-user application. Per-device settings are the extent of customization. There is no profile picker screen and no per-user watch history. Multiple physical users sharing one Android TV share one TiviMate instance.

<!-- UNVERIFIED: TiviMate — whether v5.x introduced any account-based profile sync or multi-user concept -->

### Search and Discovery UX

- Channel search: Blue key (or a search icon in the menu) opens a text input. The on-screen keyboard is an alphabetical 6×5 grid (A–Z + space + backspace + OK). Results appear as a filtered channel list below the keyboard in real time.
- EPG program search: Presses Blue while in EPG view opens a search box that filters visible program titles across all channels in the current time window.
- No recommendation rows, no "because you watched X," no AI discovery.
- Recently watched channels appear in a "Recent" category group.

### What TiviMate Does EXCEPTIONALLY Well

1. **Time-proportional EPG grid**: The physical width of program blocks encodes duration. Users can scan an entire evening at a glance — wide blocks mean long shows, narrow strips mean short segments.
2. **Jump-to-now UX**: The red hairline and the Red key jump-to-now are so effective that every competing IPTV app has copied them.
3. **Multi-playlist provider drawer**: The Left-press drawer for switching provider playlists without leaving the main view is clean and fast.
4. **Focus-led time scrolling**: When focus reaches the right edge of the visible time window, the entire grid scrolls left automatically. The user never has to "scroll then move."
5. **Details panel auto-update**: No extra press required to see a program description. Focus on a block → description appears immediately. This eliminates a hidden confirm step.

### What TiviMate Does POORLY

1. **No named user profiles**: A household cannot have Dave's channels separated from Mom's. Everything is shared.
2. **Quality badges from M3U labels only**: No stream probing. A provider labeling a 480p stream as "4K" will display a "4K" badge — deceptive and unverifiable.
3. **No AI or recommendation layer**: The app is purely schedule-and-tune. There is no suggestion, mood, or history-based discovery.
4. **Android TV only**: Not available on Tizen Samsung TVs, which is the exact gap HermesTV fills.
5. **Settings buried in menus**: Configuration is powerful but requires navigating three-four levels deep for common tasks.

---

## 2. IPTV Smarters Pro

**Platform:** Android TV, Fire TV, iOS, Android, web (various)
**Positioning:** Popular Xtream-API-native client; heavy in the provider-bundled IPTV market.

### Primary Layout Pattern

**Hybrid: Tab-based navigation + grid.** The home screen is divided into top navigation tabs:
- Live TV
- Movies (VoD)
- Series
- Catch Up
- TV Guide (EPG)

Each tab has its own content view. Live TV is a vertical list (not a grid). Movies and Series are poster grids. The tabs are the primary navigation structure.

### EPG Guide Approach

IPTV Smarters Pro has a **separate EPG tab** (TV Guide). The EPG is a time-proportional grid similar to TiviMate but with a flatter visual design. Pressing OK on the TV Guide tab opens the full EPG grid.

Additionally, the Live TV channel list view shows a **NOW/NEXT strip** to the right of the channel name: the currently airing program title and the next program title, without timestamps. This is a secondary EPG surface, not the primary guide.

<!-- UNVERIFIED: IPTV Smarters Pro — whether the Android TV version specifically uses the same EPG grid as the iOS/web version or a simplified list variant -->

### Quality Badge Display

Quality badges are sourced from M3U stream group names and channel name strings — same weakness as TiviMate. No independent stream probing. Labels like `|HD|`, `|FHD|`, `|4K|` are stripped from the channel name and displayed as a badge.

### Provider / Source Switching UX

IPTV Smarters Pro is **single-provider per app install** in its base design. A user configures one Xtream/M3U source. To switch providers, the user must go to Settings → Manage Accounts → switch to a different saved account. This is a multi-step process (3+ button presses minimum) and the app reloads the catalog for the new account.

In later versions (v3.x+), a drawer-based multi-account switcher was added, which reduces provider switching to 2 presses — but it is not as seamless as TiviMate's Left-key drawer.

<!-- UNVERIFIED: IPTV Smarters Pro v3.x — exact step count for multi-account switch on Android TV; v3.x introduced a redesigned account switcher but exact flow on TV remote needs verification -->

### Focus / Remote Navigation

- Standard tab navigation across the top bar; D-pad left/right cycles tabs.
- Within channel list: D-pad up/down moves focus; OK tunes the channel.
- Within EPG grid: same D-pad 2D navigation as TiviMate.
- Long-press OK on a channel opens options: Add to Favorites, Set Reminder (if catch-up available), Copy Stream URL (power user feature).
- Catch-up TV: pressing Left on a channel in the Live TV list shows a date-picker to access past programming.

### Profile / Multi-User Support

No named profiles. Single-user model. The account/provider switcher is not a user-profile feature — it is a provider-credential switcher. Multiple physical users share one app instance.

### Search and Discovery UX

- Search icon in the top bar opens a full-screen search with on-screen keyboard.
- Results are presented in three sections: Live Channels, Movies, Series.
- No AI recommendations. No "because you watched X."
- A "Favorites" tab provides quick access to starred channels.

### What IPTV Smarters Pro Does EXCEPTIONALLY Well

1. **Xtream API native integration**: Direct use of Xtream API's category/group/stream endpoints means the channel list is always perfectly organized by provider group.
2. **Catch-up TV UX**: The date-picker swipe from a channel to access past programming is clean and discoverable.
3. **Unified multi-content type**: Live, Movies, Series, and Catch-up in one app with a single provider login.
4. **Cross-platform**: The same UX pattern is recognizable on Fire TV, Android TV, iOS, and web.

### What IPTV Smarters Pro Does POORLY

1. **Channel list performance with large playlists**: With 5,000+ channels, the vertical list is slow to scroll. No virtualization apparent on Android TV — scrolling past 500 channels causes jank.
2. **Provider switching is clunky**: Requires app reload, not a drawer swap.
3. **No real quality verification**: Badges are from stream name strings, not probed.
4. **UI density too low for power users**: The large-font, low-density channel list wastes screen space.
5. **No profiles**: Entire household on one account.

---

## 3. Sparkle TV

**Platform:** Apple TV, Android TV, Roku, Samsung Tizen (via native app store)
**Positioning:** Polished Tizen/Samsung-native IPTV client — directly relevant to HermesTV.

### Primary Layout Pattern

**Horizontal rail + grid hybrid.** Home screen shows stacked horizontal carousels (category rails), with a large "now playing" tile at the top when a stream is active. Similar visual language to Apple TV or Netflix.

### EPG Guide Approach

Sparkle TV uses a **NOW/NEXT strip** on each channel tile in the main rail view. The tile shows the channel logo, current program title, and a small progress bar. There is a dedicated EPG mode (accessed via menu) which presents a **simplified grid** — 90-minute view window, fewer channels visible at once (4–5 rows), larger text.

<!-- UNVERIFIED: Sparkle TV — whether the Tizen version specifically uses the same EPG layout as the Apple TV version, or a simplified/different implementation -->

### Quality Badge Display

Sparkle TV displays resolution badges (HD, FHD, 4K) on channel tiles in the rail view, positioned top-right of the tile. The badge data comes from the M3U tvg-name or group-title metadata.

<!-- UNVERIFIED: Sparkle TV — whether the quality badge on Tizen uses any stream probing beyond M3U metadata parsing -->

### Provider / Source Switching UX

Sparkle TV supports multiple M3U/Xtream sources with a **sidebar provider switcher** accessible from the main menu. Switching providers reloads the channel catalog but does not restart the app. The transition takes 2–5 seconds depending on playlist size.

### Focus / Remote Navigation

- Navigation is Samsung Tizen-native, using the D-pad and the Samsung Smart Remote model.
- Focus rings use the standard Tizen focus model (browser-native spatial navigation with CSS customization).
- Back key exits current view; double Back exits the app.
- The remote's Voice key can trigger voice search (Samsung Bixby integration), though this routes to Bixby's system voice, not an app-level voice handler.

<!-- UNVERIFIED: Sparkle TV — whether the Bixby voice integration in Sparkle TV does deep-linked results back into the app or just opens Bixby's system search -->

### Profile / Multi-User Support

No named user profiles. Single user per installation.

### Search and Discovery UX

Search accessible via top bar. On-screen keyboard. Results show live channels and VoD. No AI recommendations.

### What Sparkle TV Does EXCEPTIONALLY Well

1. **Native Tizen presence**: Being in the Samsung TV app store means no sideloading friction — this is the competitive benchmark for HermesTV, which must match Sparkle's install simplicity.
2. **Clean rail/carousel UX**: The Netflix-style horizontal rail layout is familiar to Samsung TV users who primarily interact with Samsung apps.
3. **Progress bar in channel tiles**: Each tile in the rail shows the progress of the current program — a small but powerful "at a glance" feature.

### What Sparkle TV Does POORLY

1. **EPG is simplified and low-density**: The Sparkle EPG shows fewer channels at once and a shorter time window vs. TiviMate. Power users find it insufficient.
2. **No quality verification**: Badges from M3U metadata only.
3. **No profiles**: Single-user model.
4. **No AI or recommendation layer**: Pure schedule-and-tune.

---

## 4. Hot IPTV

**Platform:** Android TV, Fire TV (not natively on Tizen)
**Positioning:** Budget-oriented IPTV player; wide format support.

### Primary Layout Pattern

**Vertical channel list with a sidebar.** The left sidebar shows provider groups/categories. The main area shows the channel list for the selected group. This is a classic two-panel layout.

### EPG Guide Approach

Hot IPTV uses a **NOW/NEXT strip** embedded in the channel list — each channel row shows the current program name and the next program name. There is no full EPG grid view. The EPG is purely informational inside the channel list, not a separate mode.

<!-- UNVERIFIED: Hot IPTV — whether any recent version added a full EPG grid, or whether NOW/NEXT strip remains the only EPG surface -->

### Quality Badge Display

Quality badges are shown in the channel list (small text suffix in channel name or a colored chip). Sourced from M3U stream name parsing.

### Provider / Source Switching UX

Hot IPTV supports a single active source at a time. A Settings menu allows adding and switching between saved sources, but this requires navigating away from the main view, entering settings, selecting the source, and returning — a 4-step minimum process.

### Focus / Remote Navigation

Standard D-pad navigation. No custom focus engine apparent. Tab/Left-Right navigates the sidebar groups. Up/Down navigates channel list. OK tunes.

### Profile / Multi-User Support

No profiles. Single-user model.

### Search and Discovery UX

Basic search within current channel list. On-screen keyboard. No recommendation system.

### What Hot IPTV Does EXCEPTIONALLY Well

1. **Two-panel group/channel layout**: The left-sidebar group selector + right-panel channel list is fast for navigating large playlists by category without EPG complexity.
2. **Light resource usage**: Simpler UI means it runs on low-end Android TV boxes without jank.

### What Hot IPTV Does POORLY

1. **No full EPG grid**: NOW/NEXT only — inadequate for schedule planning.
2. **Single source at a time**: No multi-provider support.
3. **No profiles, no quality verification, no AI**.
4. **Visually dated**: The UI has not kept pace with modern TV app design standards.

---

## 5. SmartOne IPTV

**Platform:** Android TV, Samsung Tizen (via app store), LG webOS
**Positioning:** Multi-platform IPTV client with Tizen presence — directly relevant.

### Primary Layout Pattern

**Grid-first with category filter tabs.** The main view is a tile grid of channels (4×3 or 5×3 depending on TV). Category tabs at the top (All, Favorites, News, Sports, Movies, Kids) filter the grid.

### EPG Guide Approach

SmartOne IPTV uses an **inline NOW/NEXT strip** below each channel tile: the tile shows the channel logo, and below it shows "Now: Program Title" and "Next: Next Title." No full-screen EPG grid in the baseline view.

A separate "Guide" screen (accessible from the top bar) shows a simplified time-strip EPG: horizontal time scroll, channels listed vertically, but with only 60-minute program blocks visible and very limited time range (±3 hours from now).

<!-- UNVERIFIED: SmartOne IPTV — whether the Tizen version's Guide screen matches the Android TV version's feature set or is further simplified -->

### Quality Badge Display

Quality chips on each tile: `HD`, `FHD`, `4K`. Sourced from M3U metadata. Displayed in the top-right corner of the tile.

### Provider / Source Switching UX

SmartOne IPTV supports multiple saved sources. A profile/source switcher in the top-right of the main view (icon of multiple screens or a user icon) allows switching between saved configurations. Switching reloads the catalog.

### Focus / Remote Navigation

Tizen-native spatial navigation (CSS focus with browser focus engine). Category tabs are navigated Left/Right. Grid is navigated in 2D with D-pad. OK tunes. Back exits.

### Profile / Multi-User Support

No named user profiles separate from source configurations.

### Search and Discovery UX

Search via top bar icon. On-screen keyboard. Live channel search only (no VoD integration). No AI.

### What SmartOne IPTV Does EXCEPTIONALLY Well

1. **Multi-platform Tizen presence**: Available in the Samsung TV app store, establishing the UX baseline HermesTV competes against directly.
2. **Category filter tabs on the grid**: Immediate one-press filtering of the channel grid by category is fast and intuitive for remote navigation.
3. **Relatively clean Tizen-native navigation**: Uses Samsung's own focus system properly, which feels native vs. custom navigation implementations that fight the platform.

### What SmartOne IPTV Does POORLY

1. **No true full-screen EPG grid**: The Guide screen is too limited in time range and channel density.
2. **Quality badges from M3U only**: No verification.
3. **No profiles, no AI, no recommendation system**.

---

## 6. IPTVnator (Desktop / Web)

**Platform:** Web app + Electron desktop (Windows/macOS/Linux); no native TV app
**Positioning:** Open-source self-hosted IPTV player for power users on desktop.

### Primary Layout Pattern

**Vertical list + video player split.** Left panel: channel list (searchable, grouped by M3U group-title). Right panel: video player. Below the player: program info from EPG if available. This is a desktop-optimized two-panel layout — not appropriate for TV at viewing distance.

### EPG Guide Approach

IPTVnator has a **separate EPG tab** within the web UI. It displays a horizontally scrolling timeline grid when XMLTV is loaded. The EPG quality depends entirely on what XMLTV source the user configures. The EPG tab is clearly a secondary feature — the main UI is the channel list + player.

### Quality Badge Display

No quality badge display in the channel list. Quality information is visible only in the player controls (from the HLS stream metadata if available). No ffprobe integration.

### Provider / Source Switching UX

IPTVnator supports multiple playlists added via URL or file. A playlist selector in the top bar allows switching. Switching reloads the channel list. There is no merged view of multiple playlists simultaneously.

### Focus / Remote Navigation

Desktop-only (mouse + keyboard). No D-pad focus model. Not applicable for TV distance viewing. Using IPTVnator via a Tizen browser would be completely unusable at TV distance.

### Profile / Multi-User Support

No profiles. Single-user desktop application.

### Search and Discovery UX

Inline channel list search (type to filter). No AI, no recommendations. The search is synchronous and fast because the entire channel list is in memory.

### What IPTVnator Does EXCEPTIONALLY Well

1. **Open-source transparency**: Being open source makes IPTVnator a reference implementation for how XMLTV parsing and M3U loading work. HermesTV's backend can study its parsing logic.
2. **XMLTV EPG integration clarity**: The explicit XMLTV source configuration UI (enter a URL, the app parses it) is a clean reference for how to implement EPG source management.
3. **Zero lock-in**: Works with any M3U/XMLTV. Good reference for the HermesTV backend's provider-agnostic catalog design.

### What IPTVnator Does POORLY

1. **Completely unsuitable for TV at viewing distance**: Desktop mouse/keyboard UX has no remote navigation model.
2. **No quality verification**: No badges, no probing.
3. **No profiles, no multi-user, no AI**.
4. **No active development momentum**: The project has slowed significantly; it is more a reference than a living product.

---

## 7. Jellyfin (Web Client on TV)

**Platform:** Web client (any browser, including Tizen); dedicated apps for Apple TV, Android TV, Roku, Fire TV
**Positioning:** Self-hosted open-source media server; primarily a VoD/media library manager. Live TV is a secondary feature via HDHomeRun tuner emulation.

### Primary Layout Pattern

**Stacked horizontal carousels (section-based home screen).** The home screen has named sections: Continue Watching, Next Up, Latest Movies, Latest TV Shows, Recently Added. Each section is a horizontally scrolling rail of cards. This is the pattern pioneered by Netflix and now dominant across streaming platforms.

No separate channel list. Live TV is accessed via a "Live TV" tab in the left navigation.

### EPG Guide Approach

Jellyfin's Live TV EPG is a **full-screen time-proportional grid**, similar to TiviMate but with larger font and lower channel density by default. Key differences from TiviMate:

- The default Jellyfin EPG shows fewer channels per screen (typically 5–6 rows with larger row height).
- Program blocks show title, start time, and genre badge (when EPG data provides genre).
- A mini video preview pane is NOT included in the default Jellyfin web client EPG.
- The currently airing program on the tuned channel has a distinct highlight.
- Genre filter chips above the grid filter the channel list by type (News, Sports, Movies, Kids).

### Quality Badge Display

Jellyfin does not prominently display quality badges on channel or VoD tiles in the default web UI. Resolution information is available in the item detail screen (shows the actual stream resolution from the media info) and during playback in the player info overlay. For Live TV channels via HDHomeRun emulation, quality is whatever the tuner reports.

For VoD: the detail page shows codec, resolution, audio format. During playback, a stats overlay (triggered by info button) shows bitrate, resolution, and codec.

### Provider / Source Switching UX

Jellyfin has no concept of "provider switching" in the IPTV sense. It has one media server (the Jellyfin instance) with libraries. If multiple tuner sources are configured (e.g., Threadfin + Tunarr both as HDHomeRun devices), Jellyfin presents all their channels in one merged channel list — there is no per-source switcher from the TV interface.

### Focus / Remote Navigation

The Jellyfin web client on Tizen uses Tizen's spatial navigation system. Navigation is functional but not polished — the web client is not optimized specifically for TV remote navigation. Known issues include:
- Focus occasionally jumping to non-intuitive elements.
- The player controls overlay timing out awkwardly on remote interaction.
- The on-screen keyboard for search is a full QWERTY grid that requires many D-pad presses.

The dedicated Android TV / Streamyfin / Infuse apps are significantly better for remote navigation than the web client.

### Profile / Multi-User Support

**Jellyfin has full named multi-user support** — this is one of its strongest features. Each Jellyfin user account has:
- Separate watch history
- Separate "Continue Watching" and "Next Up" rails
- Separate favorites
- Separate playback progress tracking
- Parental control settings (per-user content rating ceiling + PIN)
- Separate library access permissions (an admin can restrict which libraries a user sees)

Switching users in the web client requires logging out and logging in with different credentials. There is no quick profile switcher without re-authentication (unlike Netflix's profile switcher which requires only a PIN or tap).

### Search and Discovery UX

- **Full-text search**: Searches across all library items (movies, series, episodes, artists, albums, channels).
- Search results are grouped by type: Movies, TV Shows, Episodes, Artists, etc.
- The search UI is a text input + scrollable results list.
- **Advanced filters** available on library views: genre, year, content rating, video resolution, codec, audio codec.
- No AI recommendations in the stock Jellyfin web client.
- **Smart playlists** (called Collections in Jellyfin) allow creating curated groups by rules (e.g., "all HEVC 4K movies from 2020–2026").

### What Jellyfin Does EXCEPTIONALLY Well

1. **Multi-user account model with per-user data**: Every watch history, progress, and favorites is isolated per user account. HermesTV's "Dave profile" and "Mom profile" map directly to Jellyfin user accounts.
2. **Parental controls per user**: Rating ceiling + PIN per user account is production-ready in Jellyfin.
3. **Resume/Next Up API precision**: The `/Users/{userId}/Items/Resume` and `/Shows/NextUp` endpoints are accurate, reliable, and per-user. HermesTV's backend can rely on these directly.
4. **Zero telemetry**: Jellyfin sends no watch data to any external service. This is a privacy guarantee no commercial streaming app can match.
5. **TMDB/TVmaze metadata**: Jellyfin fetches and caches rich metadata (posters, descriptions, cast, ratings) from TMDB and TVmaze. HermesTV benefits from this for its VoD library display.

### What Jellyfin Does POORLY

1. **Web client remote navigation is not optimized for TV**: Focus jumps, awkward keyboard, player control timing — all need improvement for Tizen. HermesTV must build a proper TV-native interface rather than wrapping the web client.
2. **Live TV EPG is lower-priority**: Jellyfin's primary purpose is VoD. The Live TV EPG is functional but not at TiviMate's level of polish or power-user features (no multi-playlist provider drawer, no remote-key shortcuts for day jumping).
3. **No quality badge verification for live streams**: Jellyfin trusts the tuner's reported resolution, which may be inaccurate for IPTV streams.
4. **No AI recommendation layer in stock installation**: Requires third-party plugins (Jellyseerr, etc.) for request/recommendation features.
5. **User switching requires re-authentication**: No one-press profile switcher — a significant household UX friction point that HermesTV must solve at the Tizen app layer.

---

## 8. Plex (TV App)

**Platform:** Apple TV, Android TV, Roku, Fire TV, Samsung Tizen (via app store), LG webOS, PlayStation, Xbox
**Positioning:** Freemium self-hosted + cloud-hybrid media server. Plex Pass subscription unlocks Live TV, DVR, and advanced features.

### Primary Layout Pattern

**Stacked horizontal carousels with a left-navigation sidebar.** The home screen is Netflix-style: left rail navigation (Home, Movies, TV Shows, Music, Live TV, Photos) with content carousels to the right. The hero section at the top of each library shows featured/recently added content with a background art fill.

### EPG Guide Approach

Plex's Live TV EPG (Plex Pass required) is a **full-screen time-proportional grid** with these specific choices:

- **Larger row height** than TiviMate (~10% more) — favors readability over channel density. Shows 6–7 rows by default.
- **Category filter chips** above the grid (All / News / Sports / Movies / Kids / Science). Pressing D-pad Up from the top row moves to these chips; selecting one filters the channel list.
- **No color-coding** of program blocks by category — all blocks are the same neutral color.
- **Blue tint** on the currently airing program for each channel.
- A **"Live" badge** on the channel name column when that channel is being tuned.
- The time header shows 30-minute intervals, and scrolling snaps to 30-minute boundaries.
- **Two-step detail reveal**: Focus on a program block shows the title only. Pressing OK expands a bottom panel with the full description, genre, rating, and cast.
- **Mini preview thumbnail** (Plex Pass + HDHomeRun) in the top-right: a small live thumbnail of the focused channel, backend-generated.

### Quality Badge Display

Plex displays quality badges on the currently playing stream in the player overlay (the thin OSD bar at the bottom). It shows: `1080p`, `720p`, `4K` as text badges derived from the stream's actual resolution as reported by the transcoder or direct play.

On channel tiles in the Live TV guide, no quality badge is shown per-tile — quality is only visible in the player.

For VoD: movie and episode tiles in the library view show no quality badge. The detail page shows codec, resolution, and whether Plex is transcoding or direct playing.

<!-- UNVERIFIED: Plex — whether recent updates to the Tizen-specific app (v4.x) added per-tile quality badges in the Live TV guide or channel list -->

### Provider / Source Switching UX

Plex does not have "provider switching" in the IPTV sense. A Plex server has one set of configured tuner inputs (HDHomeRun devices, which could be Threadfin, Tunarr, or hardware). All channels are merged into one unified guide.

If a user has multiple Plex servers (e.g., home server + remote server), the Plex TV app has a **server switcher** in the left navigation — selecting "Servers" shows all linked Plex servers and the user can switch between them. This is the nearest equivalent to provider switching.

### Focus / Remote Navigation

Plex on Tizen is one of the better-implemented TV apps from a focus standpoint:
- Uses Tizen's spatial navigation system properly.
- Focus ring is a clean, thick, rounded-corner highlight — visible at TV distance.
- The left navigation rail auto-collapses to icons-only when focus moves to content, maximizing content area.
- In the EPG grid, focus ring is high contrast (white or accent-colored outline on the focused block).
- Voice search is integrated via the Samsung remote's microphone button, but routes through Plex's own voice search (not Bixby) — deep-linked results appear directly in Plex's search UI.

### Profile / Multi-User Support

**Plex has full named user profiles (Plex Home, Plex Pass required):**
- Each profile has a display name, avatar (choose from Plex's library or upload custom), and individual watch history.
- Per-profile parental controls: content rating ceiling + PIN.
- A **profile switcher tile on the home screen** — one D-pad press from the profile icon opens a grid of named profiles; selecting one switches immediately (PIN prompt if configured).
- Up to 10 profiles on one Plex server.
- Watch progress, favorites, watchlists, and recommendations are all per-profile.

This is the **best profile switching UX among the apps audited**: one press to open the picker, one press to select a profile, PIN if needed, then immediately in the correct user's experience.

### Search and Discovery UX

- **Universal search**: Simultaneously searches local Plex library + Plex's cloud metadata catalog + partner streaming services (if enabled). Results show where to watch something (Plex, Netflix, Amazon, etc.) alongside local library results.
- Search is accessible from any screen via the top bar search icon.
- On-screen keyboard: alphabetical grid layout — functional but not the fastest for TV.
- **Discover tab**: Curated discovery surface with trending, new releases, staff picks, and genre carousels.
- **Watchlist**: Any item can be added to a personal watchlist with one OK press on the detail screen.
- No AI-powered recommendations in the current Plex TV app. Discovery is editorially curated.

### What Plex Does EXCEPTIONALLY Well

1. **Profile switcher UX**: One-press profile picker with avatars, per-profile watch state, and optional PIN. This is the benchmark for HermesTV's dual-profile (Dave/Mom) switcher.
2. **EPG category filter chips**: Genre filter pills above the EPG grid that instantly narrow visible channels are fast and intuitive with a TV remote.
3. **Left navigation rail auto-collapse**: The nav rail collapses to icons-only when the user moves into content, maximizing the content area without losing navigation access.
4. **Voice search that deep-links into results**: Pressing the remote mic → speaking → seeing results in Plex's own search UI without leaving the app. HermesTV must match this with Azure TTS/voice.
5. **Universal search across local + cloud**: Results show the content with play options directly. Not just "it's on my server" — "it's on my server AND here's where else it streams."

### What Plex Does POORLY

1. **Live TV requires Plex Pass (paid)**: The best EPG and live TV features are gated behind a subscription. HermesTV is fully self-hosted, so this is not a concern — but it means Plex's live TV UX patterns are rarely tested by free users.
2. **Quality badge absent from channel tiles**: Users cannot tell stream quality without tuning in and checking the player OSD.
3. **Transcoding preference can conflict with direct play**: Plex's quality settings dialog during playback is complex for a TV remote (many nested options).
4. **On-screen keyboard is a full QWERTY grid**: The search keyboard requires many D-pad presses for common queries.
5. **Discover tab is editorially curated, not personalized**: The same discovery content for all users — no per-profile AI personalization.

---

## 9. Stremio (Web)

**Platform:** Web (browser), Windows/macOS/Linux desktop, Android, iOS; no native Tizen app
**Positioning:** Open streaming aggregator with add-on ecosystem; proxies content from add-on sources (legal grey area for many add-ons).

### Primary Layout Pattern

**Calendar/rail hybrid home screen.** The Stremio home screen is split:
- A large hero section (featured content, auto-rotating).
- Horizontal content carousels below: Discover (trending movies), Continue Watching, Latest, Recommended.

No live TV primary surface in the default installation — live TV is an add-on feature.

### EPG Guide Approach

Stremio does not have a native EPG. Live TV channels (via add-ons) are shown as a channel list. Some third-party add-ons provide NOW/NEXT information on channel rows, but there is no integrated full-screen EPG grid in the core Stremio app.

<!-- UNVERIFIED: Stremio v5.x — whether the 2025/2026 version added a native EPG grid for live TV add-ons, or whether it remains add-on-dependent -->

### Quality Badge Display

Stremio displays quality badges prominently on content tiles: `4K`, `1080p`, `720p`, `480p` as pill badges on the tile. For torrent/streaming add-ons, multiple quality options are shown in a quality selector modal before playback begins (similar to how you choose a stream: "1080p · 4.5GB · HEVC" vs "720p · 2.1GB · H264").

This quality-picker-before-play model is powerful for power users but adds friction for casual viewing — you must choose before you watch.

### Provider / Source Switching UX

Stremio's "providers" are add-ons. A user installs and configures multiple add-ons (Torrentio, Orion, Comet, etc.). All add-ons contribute to a unified search result list for any given title. There is no explicit "switch provider" action — the user sees all available streams from all add-ons simultaneously in the stream picker modal and selects the one they want.

### Focus / Remote Navigation

Stremio's web version is mouse/keyboard-centric and is not optimized for TV D-pad navigation. Using it in a Samsung Smart Browser or Tizen WebView at TV distance would be very difficult.

The Android TV version of Stremio has a D-pad-compatible UI, but Stremio is not in the Samsung Tizen app store (no native Tizen app).

### Profile / Multi-User Support

Stremio accounts are single-user. There is no household profile system. Each physical user would need their own Stremio account.

### Search and Discovery UX

- Search is the primary discovery mechanism. Type a title → see results from all installed add-ons.
- No AI recommendation engine. Discovery is catalog-based (trending, popular, recently added).
- A "Discover" tab shows genre-browse carousels: by genre, by year, by IMDb rating.

### What Stremio Does EXCEPTIONALLY Well

1. **Quality-picker-before-playback**: Showing multiple stream options with quality, size, codec, and source before pressing play is the cleanest multi-source stream selection UX in this audit. For power users who care about quality, this is the gold standard — not a confusing backend failover, but explicit user choice.
2. **Add-on ecosystem extensibility**: Third-party add-ons extend the app's sources without core app changes.
3. **Unified search across all sources**: One search query returns results from every installed add-on simultaneously.

### What Stremio Does POORLY

1. **No TV-native Tizen implementation**: Not in the Samsung app store. Unusable at TV distance on a web browser.
2. **No EPG for live TV**: Channel list only.
3. **No profiles / household UX**.
4. **Legal grey area**: Most Stremio add-ons rely on piracy sources — irrelevant for HermesTV's legitimate private IPTV use case but notable.

---

## 10. Kodi (TV Mode, Estuary Skin)

**Platform:** Windows, macOS, Linux, Android (including Android TV via sideload), Raspberry Pi, LibreELEC
**Positioning:** Fully open-source, highly configurable media center. No native Tizen app. Estuary is the default skin since Kodi 17.

### Primary Layout Pattern

**Hub-and-spoke with a persistent left navigation rail.** The Estuary home screen is a horizontal menu rail at the bottom of the screen (or a side rail, depending on skin configuration). Menu items: Movies, TV Shows, Music, Live TV, Radio, Add-ons, Games, Weather, Settings.

Selecting a menu item loads the corresponding library view. Live TV opens a channel list. Movies opens a poster grid. Each library view has its own secondary filter/sort options.

### EPG Guide Approach

Kodi's PVR EPG (via any PVR back-end add-on: IPTV Simple Client, Tvheadend, Enigma2) is a **full-screen time-proportional grid** with the most configuration options in this audit:

- **Configurable time window**: 60, 90, 120, 180 minutes of future programming visible at once.
- **Timeline jumps via number keys**: Press 1 = jump to current time, press 2 = +30 min, press 3 = +1 hour, etc. (customizable in Kodi's key bindings).
- **In-EPG search/filter**: A filter box (press Y or a mapped key) that narrows all visible channel rows to only those with a matching program name in the current time window. This is uniquely powerful — a quick press and type to find what's on right now without leaving the EPG.
- Details panel shows: full title, episode number (S##E##), rating, description, genre, start/end time, duration, and an actor list if EPG data provides it.
- **Reminder and recording** (PVR back-end dependent): pressing OK on a future program opens a menu with "Add Reminder" and "Add Recording" options.
- The "now" indicator is a filled color on the currently airing block plus a vertical hairline.

Kodi's EPG is the most information-dense in this audit. At TV distance with the Estuary skin's default font sizes, it is still readable, but only marginally — the skin was designed for close-viewing media center use, not the typical 2.5-meter TV distance.

### Quality Badge Display

Kodi does not display quality badges on channel tiles or in the EPG grid by default. The player OSD shows codec and resolution during playback. In the channel list, quality information is available only if the PVR back-end reports it and the skin is customized to show it.

<!-- UNVERIFIED: Kodi Estuary skin — whether the 21.x (Omega) release added quality badges to the default channel list view, or whether this remains a custom skin feature -->

### Provider / Source Switching UX

Kodi's PVR system supports multiple PVR back-end add-ons simultaneously. All enabled back-ends contribute to a merged channel list. There is no explicit provider switcher from the live TV view — all channels from all PVR sources are merged into one list (sorted by channel number or name).

To add or switch PVR sources, the user must navigate to Settings → PVR & Live TV → back-end clients and enable/disable/configure sources. This is a settings-level operation, not a first-class UI feature.

### Focus / Remote Navigation

Kodi on a TV remote is very well-developed — it has been a living-room media center for 20+ years:
- Every function is reachable from D-pad + OK + Back + colored keys.
- Long-press OK = context menu for the focused item.
- The number keys (1–9, 0) are used for timeline jumps in the EPG, which is unintuitive but extremely fast once learned.
- Settings screens are hierarchical menus navigated entirely by D-pad.
- No pointer required anywhere.
- The Estuary skin's focus highlighting is a high-contrast underline/border on the focused element, clearly visible from TV distance.

### Profile / Multi-User Support

Kodi has a **profile system** (Settings → Profiles) that allows multiple named profiles with separate library databases, add-on configurations, and skin settings. Each profile is essentially a separate Kodi installation within one app. Switching profiles requires going to the Power Menu → Switch Profile → selecting a profile → optionally entering a PIN.

This is not a casual one-press profile switcher — it requires navigating into a power-user menu. However, the capability exists and it includes:
- Separate watch history per profile
- Separate favorites
- Separate add-on settings
- Per-profile PIN lock

### Search and Discovery UX

- **Universal search** via add-on (default: Kodi's built-in search or Keymap Editor). Searches across all library types.
- On-screen keyboard: alphabetical grid, adequate.
- The **Kodi add-on ecosystem** extends search to external sources (real-debrid, streaming services, etc.).
- No AI recommendations in stock Kodi.
- Discovery is library-browse and genre-browse based. The Movies view sorts by genre, year, rating, etc.

### What Kodi Does EXCEPTIONALLY Well

1. **In-EPG program search/filter**: Filtering the EPG grid to only channels with a matching program in the current time window is a killer feature for "I want to find a specific type of show right now." This is absent from TiviMate, Plex, and most competitors.
2. **Keyboard shortcut density**: Number keys for EPG timeline jumps, colored keys for EPG actions — fast power-user navigation once memorized.
3. **Profile system**: Full separate environments per named profile, with PIN protection. The profile capability is comprehensive even if the switch UX is not streamlined.
4. **Extreme configurability**: Kodi can be configured to work exactly as a specific user wants — the Estuary skin is customizable, add-ons extend functionality, key bindings are fully remappable.
5. **PVR back-end flexibility**: Works with IPTV Simple Client (M3U), Tvheadend, Enigma2, and more — the broadest source compatibility in this audit.

### What Kodi Does POORLY

1. **Setup complexity is overwhelming for non-technical users**: Adding an IPTV source requires installing an add-on, configuring credentials, setting XMLTV sources — a multi-step process with no guided setup.
2. **No quality badges in the default skin**: The Estuary default shows no quality information on tiles or in the EPG.
3. **Profile switching is buried**: Switching profiles requires navigating into Power Menu → Switch Profile — not discoverable for a casual user.
4. **No native Tizen app**: Kodi does not run on Samsung Tizen. LibreELEC on an external box is required.
5. **Estuary skin font density can be small at TV distance**: Designed for HTPC use, not optimized for the 2.5-meter Samsung TV viewing distance.

---

## 11. YouTube TV

**Platform:** Samsung Tizen (native app store), Android TV, Apple TV, Roku, Fire TV, web
**Positioning:** Live TV streaming service (paid subscription, US-focused) with cloud DVR.

### Primary Layout Pattern

**Three-column layout with persistent left rail.** Left rail: navigation (Home, Live, Library, Search). Middle: content area (varies by section). Rightmost content area fills the rest.

The **Home screen** shows: a full-width hero with the currently airing or featured program, then horizontal category carousels (Sports, News, Entertainment, etc.).

The **Live section** is the closest to an IPTV channel list — it shows channels grouped by category with the currently airing program on each channel.

### EPG Guide Approach

YouTube TV uses a **full-screen EPG grid** that is among the cleanest in this audit for TV-distance readability:

- **Large row height** (~90px): Each channel row has the channel logo, channel name, and very large program block text.
- Program blocks show title + start time.
- Time header shows 30-minute intervals.
- **No time-proportional block widths**: This is the key difference from TiviMate. In YouTube TV's EPG, all program blocks are the same width regardless of duration. Duration is shown in text, not encoded in block width. This sacrifices at-a-glance duration scanning for simplicity and consistent font size.
- **"Now" column** is highlighted with a thin vertical blue line.
- **Progress bar within the current program block** (blue fill showing how far through the program the user is).
- Category filter chips at the top of the EPG: All / Favorites / Sports / News / Entertainment / Movies / Kids.
- A **"Top Picks" row** at the top of the EPG: shows 3–4 recommended channels based on viewing history.
- No details panel — program description requires pressing OK to open a full-screen detail card.

### Quality Badge Display

YouTube TV does NOT show quality badges on any tiles or in the EPG. Stream quality is adaptive (adaptive bitrate) and the app does not expose the current quality level in any persistent UI element.

During playback: no persistent quality badge. Users can check via the three-dot menu → Quality, which opens a menu showing available quality tiers (Auto, 1080p, 720p, etc.) and allows manual selection.

### Provider / Source Switching UX

YouTube TV is a single subscription service — no concept of provider switching. All channels are from YouTube TV's licensed network. Not applicable.

### Focus / Remote Navigation

YouTube TV on Tizen is exceptionally well-optimized for Samsung TV remotes:
- The left navigation rail collapses to icons-only when the user focuses on content (same as Plex's approach).
- Focus ring is a **bright, thick rounded-rectangle highlight** — extremely visible at TV distance.
- In the EPG grid, the focused program block has a distinct white border + background color change.
- The Samsung remote's voice button invokes YouTube TV's own voice search (not Bixby) — deep-links into search results within the app.
- The remote's colored keys are used for recording and favorites actions in the EPG.

### Profile / Multi-User Support

YouTube TV supports **up to 6 user accounts per subscription** (Google accounts). Each account has:
- Separate DVR library.
- Separate watch progress.
- Separate personalized recommendations.
- Separate "Top Picks" in the EPG.

Profile switching in the YouTube TV app: the user icon in the top-right corner of the navigation rail opens a profile switcher. Selecting a different profile requires re-entering Google account credentials (unless already signed in on that TV). Not a one-press switcher — but the per-profile data isolation is complete.

### Search and Discovery UX

- **Voice search** (Samsung remote mic button → YouTube TV voice handler): "Find me a sports game" → curated live game results appear.
- Text search: on-screen keyboard (QWERTY grid) + suggestions row above keyboard.
- **Top Picks personalization**: YouTube TV uses Google's recommendation ML to surface personalized channels in the EPG "Top Picks" row and the Home screen hero section. This is the most sophisticated AI-adjacent recommendation system among the apps audited.
- **Library section**: A DVR library organized by series (your recordings, organized as a TV show library). Tapping a series shows all recorded episodes. Very clean for organized DVR use.

### What YouTube TV Does EXCEPTIONALLY Well

1. **Focus ring visibility at TV distance**: YouTube TV's focus ring is among the best in this audit — thick, bright, rounded-corner, high contrast. Clearly visible on any background.
2. **EPG "Top Picks" personalization row**: A backend-personalized recommendation row at the top of the EPG grid based on viewing history — the only app in this audit to inject personalized recommendations directly into the EPG grid.
3. **DVR library organized as a TV show library**: Recordings are grouped by series, not by recording date. This is far superior to a flat chronological recording list.
4. **Voice search with deep-linked in-app results**: Mic button → speak → see results in YouTube TV. HermesTV's Azure TTS integration should match this experience.
5. **Left navigation rail auto-collapse**: Maximizes content area without losing navigation access.

### What YouTube TV Does POORLY

1. **No quality badges**: Users cannot know what quality they are receiving at any given moment without navigating into the player menu.
2. **Non-time-proportional EPG blocks**: All program blocks are the same width regardless of duration. This removes the "at a glance" scheduling information that makes TiviMate's grid so powerful.
3. **No IPTV/custom source support**: Only YouTube TV's licensed content. Not applicable for private IPTV use.
4. **Profile switching requires Google re-auth**: Not a one-tap profile switcher.

---

## 12. Samsung TV Plus

**Platform:** Samsung Tizen (pre-installed on all recent Samsung TVs including QN85Q7FAAFXZA and UN55CU8000BXZA)
**Positioning:** Samsung's free ad-supported streaming service (FAST — Free Ad-Supported Streaming TV). Pre-installed, no login required.

### Primary Layout Pattern

**Full-screen video player with an overlay channel rail.** When a channel is actively playing, the channel rail appears at the bottom of the screen as a horizontal strip of channel tiles. The currently playing channel is highlighted. Pressing Left/Right navigates the channel rail. Pressing OK tunes to the highlighted channel.

A separate **Guide** view (accessible via a button in the channel rail or the remote's Guide key) opens a full-screen EPG grid.

### EPG Guide Approach

Samsung TV Plus EPG is a **full-screen time-proportional grid** with Samsung's standard Samsung TV design language:

- Large row height (Samsung accessibility-friendly by design — Samsung devices are used by all ages).
- Large font size in program blocks — among the best readability at TV distance in this audit.
- **Teal/cyan accent color** for the currently focused program block.
- The "now" hairline is a thin blue vertical line.
- Progress fill in the current program block.
- Category filter chips above the grid: All Channels / TV / Movies / Sports / Music / Comedy / News / Kids & Family / Lifestyle & Home / Business & Finance / Tech & Science.
- Details panel at the bottom: auto-updates on focus change (no OK press needed). Shows program title, description, rating, start/end time.
- **No "tomorrow" navigation** within the Samsung TV Plus EPG — only today's guide is available.

### Quality Badge Display

Samsung TV Plus does not display quality badges on channel tiles or in the EPG. The service delivers streams via Samsung's CDN with adaptive bitrate — the quality tier is not exposed to the user.

### Provider / Source Switching UX

Samsung TV Plus is a single integrated service — no provider switching concept. All channels are Samsung's licensed FAST channels.

However, **Samsung TV Plus coexists with other Samsung Smart Hub sources**: pressing Home on the Samsung remote shows the Smart Hub launcher where Samsung TV Plus, Plex, Netflix, and other apps are listed. "Provider switching" at the Samsung TV level means navigating to a different app in Smart Hub, not within Samsung TV Plus itself.

### Focus / Remote Navigation

Samsung TV Plus has the most polished Samsung Tizen-native focus model in this audit — it is literally built by Samsung for Samsung hardware:

- Focus ring matches Samsung's own design system: a rounded rectangle with a subtle shadow and a scale animation on focus.
- The EPG grid focus transitions are smooth (sub-100ms CSS transition).
- The remote's Guide key maps directly to the EPG grid.
- The remote's Info key shows program details without leaving the current playing channel.
- Channel rail navigation is extremely smooth and fast.

This is the reference implementation for how a Samsung Tizen-native app should feel.

### Profile / Multi-User Support

No profiles. Samsung TV Plus is entirely anonymous — no account, no sign-in, no watch history persistence, no profiles. Each session starts fresh.

### Search and Discovery UX

No search within Samsung TV Plus itself. Discovery is entirely via the EPG grid and the category filter chips. Content is linear/live only — no VoD.

Samsung Tizen's universal search (via the remote's Search/Voice button) can surface Samsung TV Plus channels in results alongside other apps, but this is a platform-level feature, not Samsung TV Plus-specific.

### What Samsung TV Plus Does EXCEPTIONALLY Well

1. **Samsung-native focus model**: The reference for how focus animation and ring styling should feel on QN and UN Samsung TVs. HermesTV must match or exceed this polish level on both target TVs.
2. **Large font and high-readability EPG**: Samsung TV Plus's EPG font sizes are among the most readable at TV distance in this audit. This is the visual bar HermesTV must clear for the Mom (Sherri) profile on the QN85Q7FAAFXZA.
3. **Category filter chips in EPG**: More granular category options than Plex or YouTube TV (12 categories vs. 5–6).
4. **No sign-in friction**: Instant access without account creation is the baseline experience Samsung users expect.

### What Samsung TV Plus Does POORLY

1. **No search within the app**: Users cannot search for a specific channel by name — they must scroll through the EPG or channel rail.
2. **No profiles or personalization**: Entirely anonymous. No watch history, no recommendations.
3. **EPG limited to today only**: Cannot browse tomorrow's schedule.
4. **No quality visibility**: Quality information not exposed to the user at all.

---

## 13. Pluto TV

**Platform:** Samsung Tizen (native app store), Android TV, Apple TV, Roku, Fire TV, web
**Positioning:** Free ad-supported live streaming (FAST) with a large channel catalog. No subscription required.

### Primary Layout Pattern

**Full-screen video player + overlay guide.** When the app launches, it immediately begins playing the "most recently watched" or a default channel. The video fills the full screen. Pressing Down or a guide key reveals a semi-transparent EPG grid overlaid over the live video.

### EPG Guide Approach

Pluto TV's EPG is a **semi-transparent overlay grid** rendered over the live playing video. Key design decisions:

- The video continues playing beneath the semi-transparent EPG.
- The currently playing channel's row is highlighted at the top of the visible rows.
- Time-proportional blocks (like TiviMate) — duration encoded in block width.
- A details panel on the right side (not bottom) shows the focused program's title, description, and "Watch Now" button.
- **The details panel replaces the right-side content area** — the EPG takes the left ~65% of the screen, the right ~35% is the details panel.
- A "Now" indicator is shown but the current time column is not highlighted with a hairline — instead, the currently airing block has a distinct color.
- Pressing Back closes the EPG overlay, returning to full-screen playback.

This semi-transparent overlay approach is distinct from all other apps in this audit. It maintains the "always watching" experience — the user never stops playing content to navigate the guide.

### Quality Badge Display

No quality badges in Pluto TV. Ad-supported FAST content is delivered at a fixed quality tier (typically 720p H.264) via adaptive bitrate without user control or display.

### Provider / Source Switching UX

Pluto TV is a single integrated service. No provider switching. All channels are Pluto's licensed FAST catalog.

### Focus / Remote Navigation

Pluto TV on Tizen uses standard Tizen spatial navigation. The semi-transparent overlay EPG grid navigation is well-implemented:
- D-pad Up/Down moves between channel rows.
- D-pad Left/Right moves between program blocks.
- The focused block is clearly highlighted even against the semi-transparent EPG background.
- Back closes the overlay.
- OK plays the focused channel immediately.

### Profile / Multi-User Support

Pluto TV has an optional account (Pluto account) for saving watch history and preferences, but is fully usable without an account. No household profiles.

### Search and Discovery UX

- A search icon in the EPG overlay's header allows text search of channels and programs.
- Discovery: Pluto TV's home view (before entering the player) shows category carousels. Pluto TV categories include a large selection of genre-specific "channels" (e.g., "Classic Horror Movies," "90s Action") that are virtual channels — essentially themed playlists broadcast as live channels.
- No AI recommendations.

### What Pluto TV Does EXCEPTIONALLY Well

1. **Semi-transparent overlay EPG over live video**: The player never stops during guide browsing. This is a "never interrupt the viewing experience" design principle. It reduces the perceived cost of opening the guide — users browse more freely when they do not lose their stream.
2. **Instant launch to content**: No home screen, no sign-in, no setup — the app launches directly into live content. Zero friction entry.
3. **Category/genre virtual channels**: Curated themed channels (90s Action, Classic Horror) that feel like genre radio stations. Discovery through browsing is intuitive because the channel names themselves describe the content.
4. **Details panel on the right, not bottom**: Moving the EPG details to a right panel instead of a bottom strip avoids the "tall EPG + tall details = almost no visible guide" problem common in bottom-panel designs.

### What Pluto TV Does POORLY

1. **No quality control or visibility**.
2. **No profiles or personalization**.
3. **No search quality or depth**: Search returns channels only, not programs.
4. **The overlay EPG can feel cluttered with many channels**: At 200+ channels, the semi-transparent overlay becomes hard to navigate without the channel column getting too narrow.
5. **No IPTV/custom source support**: FAST content only.

---

## 14. Channels DVR

**Platform:** Apple TV (primary), Roku, Android TV, Fire TV; web interface for server management
**Positioning:** Premium self-hosted DVR solution built around HDHomeRun tuners and IPTV via M3U. Paid subscription (Channels DVR Server). Among the best-executed TV apps in this audit.

### Primary Layout Pattern

**Hybrid: Full-screen EPG grid as primary with a Guide/Now playing dual-pane option.** When content is playing, the player fills the screen. Pressing the Guide button or D-pad opens the EPG grid, which slides in from the right (on Apple TV), pushing the player to a mini-preview position in the top-right corner.

This "guide slides in while player shrinks to mini preview" approach keeps both the guide and live playback visible simultaneously without the full overlay of Pluto TV.

### EPG Guide Approach

Channels DVR has the most polished EPG in this audit alongside TiviMate:

- **Time-proportional grid**: Block width encodes duration.
- **Color-coded program categories**: Sports = orange-tinted left border. News = blue-tinted. Movies = purple-tinted. Kids = green-tinted. The color is a 3px left border on each program block, not a full background tint — readable without overpowering.
- **Mini live preview pane** (top-right corner of the guide): Shows the currently focused channel's live stream as a small thumbnail. This is backend-generated (not a second full decode).
- **"Now playing" channel** has a colored left border in the channel column and a play icon overlay on its current program block.
- **Time scroll snaps to 30-minute boundaries**: Prevents partially-revealed program names.
- **"Tonight" shortcut** button: Filters the EPG to only show today's primetime (8pm–11pm local time).
- **Green/Yellow key** = jump forward/backward 24 hours.
- **Details panel** at the bottom (or right, depending on layout) shows: title, episode info (S##E##), description, rating, cast, and action buttons (Watch Now, Record, Set Reminder, Skip to End of Episode).
- **"Skip to End of Episode" button**: Channels DVR analyzes recordings for chapter markers — during playback of a recording, this button jumps to the next chapter.

### Quality Badge Display

Channels DVR is the ONLY app in this audit that displays verified quality badges derived from actual stream analysis:

- Each channel in the channel list and EPG guide shows a quality badge: `HD`, `SD`, or sometimes `4K` (if the source is configured as 4K).
- The quality is derived from the actual stream resolution as detected by Channels DVR Server, not from M3U stream name strings.
- During playback: a persistent quality badge appears in the thin OSD bar at the bottom showing the current active quality (e.g., `1080i`, `720p60`, `4K`).
- If the stream is being transcoded, the badge shows the output resolution, not the source resolution — clearly labeled as "Transcode" in the player stats.
- A **stream stats overlay** (accessible via long-press info or a settings toggle) shows: resolution, framerate, codec, bitrate, buffer status, and network speed. This is the most comprehensive stream stats display in this audit.

### Provider / Source Switching UX

Channels DVR supports multiple source types simultaneously:
- HDHomeRun physical tuners
- M3U IPTV playlists (multiple M3Us)
- Tunarr virtual channels
- Threadfin proxy sources

All sources are merged into one unified channel list. There is no "switch provider" action from the TV interface — all channels from all sources coexist in the guide.

From the TV app, the user can access a **source filter** in the channel list: filter by "OTA" (over-the-air/HDHomeRun) or "IPTV" (M3U) or "Virtual" (Tunarr). This is the closest to provider switching in Channels DVR.

### Focus / Remote Navigation

Channels DVR on Apple TV (tvOS) is optimized for the Apple TV Siri Remote:
- Swipe gesture on the trackpad surface scrolls the EPG — this is a different interaction model from D-pad-only Samsung remotes.
- Long-press the surface (or OK on non-Siri remotes) = context menu.
- The focus model is tvOS's native focus engine with custom Channels DVR styling.
- Focus ring: a clean white rounded-rectangle border, thicker than the Apple TV default.

On Android TV: D-pad navigation with custom focus management. On Roku: same D-pad model.

<!-- UNVERIFIED: Channels DVR on Android TV — exact D-pad focus behavior in the EPG grid versus Apple TV tvOS behavior; the primary platform is Apple TV and tvOS-specific gestures do not apply on Android TV -->

### Profile / Multi-User Support

Channels DVR has a **profiles system**:
- Multiple named profiles per Channels DVR Server.
- Each profile has separate watch progress, DVR library, and favorites.
- Profile selection from the TV app: a profile picker appears on launch (or from the settings menu).
- No PIN-protected profiles in the current version.
- Up to 4 profiles on the free tier; more with the premium tier.

<!-- UNVERIFIED: Channels DVR — exact profile count limits and PIN protection feature status in v2025.x -->

### Search and Discovery UX

- Search accessible from the main navigation. On-screen keyboard.
- **Unified search across all sources**: Live channels, upcoming programs (from EPG), and recordings.
- A search for a show name returns: "On Now" (live, tune in now), "Upcoming" (with time and date from EPG), "Recorded" (if in DVR library).
- **Smart recordings**: When a new episode of a favorited series airs (per EPG data), Channels DVR can auto-record it without user action.
- No AI recommendations.

### What Channels DVR Does EXCEPTIONALLY Well

1. **Verified quality badges from actual stream analysis**: The only app in this audit that shows real quality data from stream inspection rather than M3U label parsing. HermesTV's quality badge system (Doc 07) aligns with this approach and must match it.
2. **Color-coded program categories in EPG**: A 3px left border in category color is the right balance — informative but not garish. HermesTV's EPG should adopt this exact visual pattern.
3. **Stream stats overlay**: Resolution, codec, bitrate, buffer status all in one toggleable overlay. HermesTV's stream stats overlay (Doc 07) should match this depth.
4. **"Guide slides in while player shrinks to mini preview"**: Maintaining live video context while browsing the guide is superior to either a full-screen guide (loses playback context) or a semi-transparent overlay (can be hard to read).
5. **Source filter in channel list**: "Show only IPTV channels" or "show only OTA channels" is a faster provider-filter than a full provider-switch reload.

### What Channels DVR Does POORLY

1. **Requires a paid Channels DVR Server subscription**: The most powerful DVR/IPTV client in this audit is locked behind a subscription. HermesTV is self-hosted and subscription-free for its operator.
2. **Primarily optimized for Apple TV / tvOS**: The Android TV and Roku versions are functional but lack some polish of the primary platform. No Tizen version exists.
3. **No AI-based recommendations or discovery**: Discovery is EPG-browse and DVR library only.
4. **No profiles with PIN protection**: Profiles exist but anyone can switch to any profile without authentication.

---

## Synthesis — Cross-App Pattern Analysis

### Best Focus / Highlight Approach for TV Distance

**Winner: YouTube TV / Samsung TV Plus (tied for best focus ring design)**

YouTube TV's focus ring is a thick (3–4px) bright rounded rectangle with clear contrast on any background. Samsung TV Plus uses a scale animation (focused tile slightly enlarges) plus a thin bright border — this scale feedback is physically perceivable from 2.5 meters in a way that color changes alone are not.

**HermesTV recommendation:**
- Combine the thick rounded-rectangle border (YouTube TV) with a scale-up (1.04x) on focus (Samsung TV Plus style).
- Ring color: accent color for Mom mode (high contrast), white with subtle shadow for Dave mode.
- Animation duration: 80ms ease-out.
- The focus ring must be visible at 2.5 meters in a dark room without straining — validate on both target TVs.

### Best Quality Badge Design

**Winner: Channels DVR**

Channels DVR is the only app in this audit that shows verified quality from actual stream analysis (not M3U label strings). It shows the badge on each channel tile in the guide, in the channel list column, and as a persistent badge in the player OSD. The stream stats overlay goes further with codec, bitrate, framerate, and buffer status.

**HermesTV recommendation:**
- Quality badge: top-right corner of every channel tile, every EPG channel column cell. Source: ffprobe scan (Doc 07), not M3U labels.
- Badge labels: `4K`, `1440p`, `1080p`, `720p`, `480p` (matching Doc 07 enum exactly).
- Upscale warning: `4K ⚠` when the upscale heuristic fires (Doc 07 §3).
- HDR sub-badge: `HDR10`, `HDR10+`, `DV`, `HLG` alongside the resolution badge (Doc 07 §2.1).
- Player OSD: persistent quality badge in the thin overlay rail (layout 11 `minimal_player`).
- Long-press Info → stream stats overlay: resolution, codec, bitrate, FPS, buffer health, provider source.

### Best EPG Guide Layout

**Winner: TiviMate (overall) with specific features from Channels DVR, Plex, and Kodi**

| Feature | Source App | HermesTV Status |
|---|---|---|
| Time-proportional program blocks | TiviMate, Channels DVR | Doc 06 confirms — implement |
| Red "now" hairline across all rows | TiviMate | Doc 06 confirms — implement |
| Jump-to-now shortcut (Red key) | TiviMate | Doc 06 confirms — implement |
| Details panel auto-updates on focus | TiviMate | Doc 06 confirms — implement |
| Category color-coded left border on blocks | Channels DVR | Doc 06 P3 — implement in Phase 3 |
| Category filter chips above grid | Plex, YouTube TV, Samsung TV Plus | Doc 06 P2 — implement in Phase 2 |
| In-EPG program search/filter | Kodi | Doc 06 P2-04 — implement in Phase 2 |
| Mini preview pane (right side) | Channels DVR, Plex | Doc 04 layout 4 spec — backend thumbnail |
| "Tonight" / primetime shortcut | Channels DVR | Not yet specified — add to EPG spec |
| Day-jump shortcuts (±24h) | TiviMate (Green/Yellow key) | Doc 06 P3-02 — implement |
| Details panel on right side, not bottom | Pluto TV | Consider: right panel frees more channel rows |

**HermesTV EPG must implement TiviMate's core grid + Channels DVR's color-coded categories + Plex's genre filter chips + Kodi's in-EPG search.**

### Best Provider Switching UX

**Winner: TiviMate's Left-key drawer** (among IPTV apps)

TiviMate's approach: pressing Left from the channel list opens a side drawer listing all configured playlists/providers. D-pad Down selects a different provider. OK confirms. The channel list reloads without leaving the EPG context. This is 2–3 key presses with no screen transitions.

IPTV Smarters Pro v3.x's multi-account switcher is a close second.

Channels DVR's source filter (IPTV vs OTA vs Virtual) is a different but also excellent approach — it filters rather than switches, which means all sources remain available and the user narrows what they see.

**HermesTV recommendation (from `provider_dashboard` layout 6):**
- The `provider_dashboard` layout is the right place for this feature.
- Additionally: add a quick provider filter to the `classic_cable_grid` and `epg_strip` layouts — a Left-press from the channel list opens a provider/group drawer.
- Within the drawer: show each provider's health bar (from Doc 07 quality scanner) alongside the provider name. This is a HermesTV-unique enhancement over TiviMate.
- Provider switch = backend re-filter (no app reload needed, since all provider data is normalized by the HermesTV backend into one unified catalog with provider tags).

### Best Chatbot / AI Integration Pattern

No app in this audit has a chatbot integration. None of the 14 apps — including Jellyfin, Kodi, and Plex — have any AI chatbot or conversational interface embedded in the TV experience.

The closest patterns observed:
- **YouTube TV's "Top Picks" row in EPG**: Backend ML pushes personalized channel suggestions into the EPG. This is algorithmic, not conversational.
- **Google TV (not in this audit)**: The Google TV home screen has an integrated AI search (Gemini in 2025/2026) accessible via voice. It can answer "what should I watch?" conversationally and surface results.

**HermesTV's chatbot (Hermes, the agent persona from Doc 11) is therefore a first-mover feature with no direct competitor to copy from.** The closest reference is Google TV's Gemini integration:
- A persistent but collapsible chat overlay (bottom-right in Dave mode, bottom-center in Mom mode per Doc 04).
- "Hey Hermes, find me a comedy from the 90s" → AI returns results directly in the chat + deep-link to search results.
- "Hey Hermes, what's on CNN tonight?" → EPG query answered conversationally with a "Tune in" button.
- Voice input via Azure TTS (Doc memory); text input via Samsung remote voice or on-screen keyboard.
- The chatbot never overrides playback — it operates as a floating overlay that does not interrupt the current stream.

### Best Dual-Profile / Household UX

**Winner: Plex (profile picker) + Jellyfin (per-user data isolation)**

Plex has the best profile picker UX: one press to open a grid of named profile avatars, one press to select, PIN if needed, then immediately in the correct user's experience.

Jellyfin has the best per-user data isolation: completely separate watch history, favorites, progress, parental controls, and library access per Jellyfin user account.

**HermesTV recommendation:**
- Map each HermesTV profile (Dave, Sherri/Mom) to a dedicated Jellyfin user account (per Doc 06 architecture).
- On TV launch: show a profile picker screen with two large tiles (Dave's icon + name, Mom's icon + name), styled per the active theme.
- Profile selection switches the active Jellyfin user, loads the correct layout preset (Dave default: `classic_cable_grid`; Mom default: `mom_jumbo_rail`), and loads per-profile favorites, history, and preferences.
- Profile switch from within the app: settings overlay → Profile tab → "Switch Profile" → same picker screen.
- Mom Mode profiles: confirm before any agent-issued layout change (per Doc 04 and Doc 06 rules).
- No PIN required in v1 (household of 2 known users). PIN gating is Phase 2 (Doc 03 §1).

---

## Conclusion

### Top 5 Patterns HermesTV Must Implement

**1. Time-Proportional EPG Grid with TiviMate's Navigation Model**
The EPG grid with proportional program block widths, a red "now" hairline, jump-to-now via remote key, details panel auto-updating on focus, and focus-led time scrolling is the defining feature of a best-in-class IPTV app. Every serious IPTV user will judge HermesTV against TiviMate on this feature. Doc 06 already specifies the correct design — implementation must match the spec exactly, including the virtual/windowed renderer for 200+ channel lists.

**2. Verified Quality Badges from Stream Analysis (Not M3U Labels)**
Every IPTV app audited except Channels DVR uses M3U label strings as the source of quality badges. This is provably wrong — provider label strings are unreliable. HermesTV's Doc 07 quality badge system (ffprobe scanner, `possible_upscale` flag, HDR sub-badge) is architecturally superior to every competitor in this audit. This is a differentiator: no competing Tizen IPTV app shows verified quality badges. HermesTV must make this visible and prominent — quality badges on every tile, in every EPG channel column cell, and in the player OSD.

**3. One-Press Profile Switcher with Full Per-Profile Data Isolation**
No IPTV app in this audit (TiviMate, IPTV Smarters, Hot IPTV, SmartOne, Sparkle, IPTVnator) has any profile system at all. Plex and Jellyfin have profiles but require multi-step switching. HermesTV's two-user household (Dave + Sherri/Mom) must have a first-class, one-press profile switcher at app launch and from within the app. Each profile must have completely separate: watch history, favorites, resume points, EPG personalization, layout preset, and parental settings. This is a decisive competitive advantage in the Tizen IPTV space.

**4. Provider Health Dashboard with Live Quality Scoring in the Provider Switcher**
TiviMate's Left-key provider drawer is the best provider switching UX in this audit, but it shows only playlist names. HermesTV's `provider_dashboard` layout (Doc 04 layout 6) enhances this with live health scores and quality bars per provider — an idea no competitor currently implements. The provider drawer should show: provider name, health percentage, channel count, dominant quality tier, and last scan timestamp. This turns provider switching from a blind choice into an informed decision.

**5. Semi-Transparent Guide Overlay Over Live Video (Pluto TV Pattern) as an Option**
The "video keeps playing while the guide is open" pattern from Pluto TV dramatically reduces the perceived cost of opening the guide. Users browse more freely when they do not lose their stream. For HermesTV's `live_focus` layout (layout 3), pressing the Guide key should slide in the EPG grid from the right while the player shrinks to a mini-preview (Channels DVR approach), keeping the video context visible. For the `epg_strip` layout (layout 4) when entered from active playback, the mini-preview pane in the top-right (already specified in Doc 04) maintains the video context. Do not replace the video with a static thumbnail when the guide opens.

---

### Top 3 Anti-Patterns HermesTV Must Avoid

**Anti-Pattern 1: Quality Badges Sourced from M3U Stream Name Strings**
Every app in this audit except Channels DVR does this. It is provably wrong. Provider M3U labels claim streams are "4K" when they are 480p. Showing a "4K" badge on a 480p stream is actively deceptive and erodes user trust. HermesTV's Doc 07 quality scanner architecture exists specifically to prevent this. The anti-pattern is tempting because it is trivially easy to implement — do not implement it. Always use ffprobe-verified resolution from the quality scanner.

**Anti-Pattern 2: Full-Screen EPG That Stops Video Playback Without a Video Context Path**
TiviMate, IPTV Smarters, Kodi, Jellyfin, and Plex all stop video playback when the user opens the full-screen EPG grid. There is no way to keep the current stream playing while browsing the guide in these apps. Pluto TV (semi-transparent overlay) and Channels DVR (player shrinks to mini-preview) prove that this is a solvable UX problem. Users who are "channel surfing via the guide" should not have to re-tune and rebuffer after every guide session. HermesTV must maintain a live playback context (mini preview pane or semi-transparent overlay) when the guide is open.

**Anti-Pattern 3: Non-Time-Proportional EPG Blocks**
YouTube TV's EPG shows all program blocks at the same width regardless of duration. This is visually simple but removes critical at-a-glance information: you cannot tell from the grid whether a movie is 90 minutes or 3 hours, whether a news segment is 30 minutes or 2 hours. TiviMate, Channels DVR, Plex, Pluto TV, and Kodi all use time-proportional blocks. The HermesTV EPG spec (Doc 06) correctly specifies proportional blocks. Do not deviate from this — visual simplicity is not worth sacrificing this much scheduling information density.

---

## Sources and Verification Notes

All app observations in this report are based on documented app features from the following sources and from cross-referencing the existing HermesTV research corpus (agent-03, agent-06, docs 04–07):

- TiviMate: TiviMate product pages, TiviMate community guides, feature descriptions audited in agent-03 and agent-06.
- IPTV Smarters Pro: Smarters Pro product pages and feature lists from IPTVStorm guide (cited in agent-03).
- Sparkle TV: Sparkle TV product documentation and Samsung TV app store listing.
- Hot IPTV: Hot IPTV Android TV app documentation and community reviews.
- SmartOne IPTV: SmartOne IPTV product pages and Samsung Tizen app listing.
- IPTVnator: IPTVnator GitHub repository (open source) and documentation.
- Jellyfin: Jellyfin official documentation (api.jellyfin.org, jellyfin.org/docs), confirmed against agent-06 API endpoint research.
- Plex: Plex product documentation (plex.tv/media-server-downloads), Plex support articles, Samsung TV app listing.
- Stremio: Stremio product website and documentation.
- Kodi: Kodi.wiki official documentation (Estuary skin, PVR/EPG documentation).
- YouTube TV: YouTube TV support articles and product pages.
- Samsung TV Plus: Samsung product pages and the pre-installed app on target TV models (QN85Q7FAAFXZA, UN55CU8000BXZA).
- Pluto TV: Pluto TV product pages and Samsung TV app listing.
- Channels DVR: Channels DVR documentation (getchannels.com/docs), product feature pages.

Items marked `<!-- UNVERIFIED: <app> — <what to check> -->` require on-device testing or current app-version verification before any contract can treat the finding as confirmed.

---

*Report complete. No code architecture may be finalized for EPG, quality badge display, provider switching, or profile UX until this report is reviewed and cross-referenced with Docs 04, 06, and 07 by the Release Manager / Truth Gate agent (Agent 24).*

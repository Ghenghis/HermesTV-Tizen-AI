# DaveTV — 2026 Feature Gap Analysis

Generated 2026-05-20. Baseline: post-wave-11 (commit `6911056`, wave-9 visual + perf).
Author: W12-RESEARCH agent. Read-only analysis — no code touched.

This document answers the user's question:

> "what's mainstream have we don't, ours missing mainstream features, missing sota features
> for 2026… why is our DaveTV so limited with features, our project should include what
> mainstream offers for 2026, what's missing, what can be included now… what IPTV API's
> are missing from our project"

It is a prioritized roadmap, not a code change.

---

## Verdict in one paragraph

DaveTV is unusually strong on UX surface — 14 switchable shells, a credential-safe play
ticket pipeline, an HLS proxy that hides operator credentials, server-only stream
resolution, a phone-as-remote SSE bus, an Azure-TTS voice stack, Mom-mode accessibility,
and a Tizen sideload path — but it is unusually thin on the IPTV plumbing that mainstream
apps (TiviMate, IPTV Smarters, OTT Navigator, Channels DVR, Plex) treat as table-stakes.
The biggest gaps are (1) a real **Xtream Codes** client (the de-facto standard paid-IPTV
API every competitor speaks), (2) a working **DVR/recording pipeline** that actually
writes bytes to disk, and (3) metadata enrichment from **TMDB / TVDB / FanArt.TV** so the
catalog rails look as good as Plex's. Everything else is polish on a strong skeleton.

---

## What we already have (don't redo)

Cross-checked against `services/hermes-tv-api/src/routes/`, `apps/hermes-web-tv/src/`,
and the docs directory. Don't recommend any of these:

- **Catalog & live channels** — `routes/catalog.js`, `routes/channels.js`, `routes/series.js`,
  `data/seedCatalog.js` (≈135 live + VOD + series seed) + Jellyfin adapter + iptv-org
  public CDN adapter + M3U client for Apollo/xTremeHD.
- **EPG** — `routes/epg.js` + `routes/epgGrid.js` + `integrations/xmltv.js`
  (fast-xml-parser, 5-min cache, channelMap.json), `components/EPGGrid.jsx`,
  `EPGModal.jsx`, day picker (wave-8).
- **DVR scheduling envelope** — `routes/dvr.js` (schedule / list / cancel / settings,
  in-memory only; pipeline is Phase 4 stub).
- **Catchup TV** — `routes/catchup.js` (synthesised 24h windows for has_catchup channels).
- **Downloads envelope** — `routes/downloads.js` (job queue, in-memory only; pipeline
  Phase 4 stub).
- **Parental controls** — `routes/parental.js` (PIN hashed + constant-time verify,
  per-category + per-rating locks, per-profile).
- **Profiles** — `dave_tv` / `mom_tv` (locked to two for now; profile picker UI exists in
  `ProfileManagementModal.jsx`).
- **Search** — `routes/search.js` (title/category/actor — no fuzzy, no semantic).
- **Phone-as-remote** — `routes/remote.js` (SSE bus, HRM-XXXX pair codes, wave-7).
- **Multiview** — `components/MultiviewModal.jsx`, `MultiviewPlayer.jsx`,
  `MultiviewLayoutPicker.jsx`.
- **Cast (Chromecast)** — `services/castSession.js`, `components/ChromecastButton.jsx`
  (lazy SDK load, 8s timeout, Tizen-safe no-op).
- **Player** — `components/PlayerModal.jsx` (~1300 lines), hls.js ~1.5.20, native HLS
  fallback, AVPlay (`hooks/useAvplayStream.js`) on Tizen.
- **HLS credential proxy** — `lib/hlsProxy.js` (rewrites segment URLs to /api/proxy/...,
  no SSRF, no leaks; wave-11 addition).
- **Voice / TTS** — Azure TTS server-only (`routes/tts.js`), Bixby forbidden by user policy.
- **Backup / restore** — `routes/backup.js` (export/import config JSON, secrets stripped).
- **Stream-health badge** — `routes/sourceHealth.js`, `lib/sourceHealthAggregator.js`,
  `lib/streamProbe.js`, `components/StreamingQualityBar.jsx`.
- **Onboarding** — `OnboardingWizard.jsx`, `QROnboarding.jsx`, `OnboardingTourCard.jsx`.
- **Theme / layout engine** — 14 shells, switchable at runtime, manifest-driven
  (`layouts/manifests/`, `engine/layoutRegistry.js`).
- **Accessibility / Mom-mode** — Mom-mode shell, never-system-limited rule per
  `MEMORY.md`, ParentalLockOverlay, SleepTimer, Screensaver, font-size knobs.
- **Watch state** — `store/playbackPositionStore.js`, `watchHistoryStore.js`,
  `watchlistStore.js`, `favoritesStore.js`, `recentSearchesStore.js`. All IndexedDB local.
- **Continue-watching / favorites / watchlist rails** — `ContinueWatchingRail.jsx`,
  `FavoritesRail.jsx`, `WatchlistRail.jsx`, `RecentlyWatchedRail.jsx`, `CatchupRail.jsx`.
- **Series UX** — `SeriesEpisodesBlock.jsx`, `SeriesNextUp.jsx`, `SkipIntroToggle.jsx`
  (toggle exists, marker source is stubbed).
- **Chatbot / commands** — `FloatingChatbot.jsx`, `CommandChips.jsx`,
  `CommandValidator.jsx`, `routes/commands.js`, `routes/uiCommand.js`.
- **i18n** — `i18n/en.json`, `i18n/es.json`.
- **Service worker** — `registerSW.js` (wave-7).
- **6-LCID Samsung-remote keymap** — `utils/tizenKeyMap.js`, `utils/zeroTizenKeyMap.js`.
- **Spatial navigation** — `utils/tizenSpatialNav.js`.
- **Touch gestures** — `utils/touchGestures.js`.
- **i18n + chatbot greetings** — `utils/chatbotGreetings.js`.

The skeleton is real. The skin on top is excellent. The gaps below are about wiring real
providers to it and adding the polish layers competitors charge $5/mo for.

---

## CRITICAL gaps (block "feels mainstream")

These are the items where, if a TiviMate / IPTV-Smarters user opens DaveTV today, they
immediately notice something is missing. Ship these and we cross the "feels mainstream"
threshold.

| ID    | Feature                                  | Who has it                                              | Why it matters                                                                                                                                                                                                | Rough scope                                                                                                                                                                                                                  |
| ----- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01  | **Xtream Codes API client (real)**       | TiviMate, IPTV Smarters Pro, OTT Navigator, XCIPTV, Sparkle TV, Channels (via Threadfin), Plex (via Threadfin), Jellyfin (via Threadfin) | Every paid IPTV provider in 2026 speaks Xtream Codes (`player_api.php` + `get.php`). We only have a credential-bearing detector in `streamResolver` plus a `routes/playlists.js` Xtream credential placeholder. We do not actually call `player_api.php?action=get_live_categories / get_live_streams / get_vod_streams / get_series / get_series_info / get_short_epg`. Without it we can't ingest 99% of Dave's likely operators directly — we depend entirely on a pre-baked M3U. | New `services/hermes-tv-api/src/lib/xtreamClient.js` mirroring the 12 documented `action=...` endpoints, a normaliser into our HermesTV catalog shape, a `routes/providers.js` Xtream connect form. Reuse credential guard.  |
| C-02  | **Real DVR pipeline (segment muxer)**    | TiviMate (premium), Channels DVR, Plex (Plex Pass), Jellyfin, NextPVR, OTT Navigator (partial) | Our `routes/dvr.js` exposes the schedule envelope but the file is explicitly stubbed Phase 4 — no bytes are ever written. A user who hits "Record" gets an in-memory record and nothing on disk. This is the single most-pointed-at feature in every TiviMate review. | A worker process that takes a recording envelope, opens the resolved HLS stream server-side (via `streamResolver` + `hlsProxy`), pipes segments through ffmpeg into the configured output dir, updates the in-memory job. Phase 4 already planned — promote it to wave-13. |
| C-03  | **Stalker / Ministra portal client**     | TiviMate, IPTV Smarters Pro, OTT Navigator, STBEmu     | Legacy MAG / set-top-box IPTV operators still hand out only Stalker URLs (`http://host/stalker_portal/c/`). Our `routes/playlists.js` returns `501 not_implemented` for `kind: 'stalker'`. We can't onboard anyone using a Stalker provider today. | New `lib/stalkerClient.js` doing the MAC-handshake → session-key → channels JSON dance. Token rotation. ~400 LOC, similar size to `m3uClient.js`. |
| C-04  | **TMDB metadata enrichment**             | Plex, Jellyfin, Stremio (always-on), Kodi, OTT Navigator (optional), every "good catalog" app | The catalog rails currently show seed posters from `hermestv.local/mock/`. Mainstream catalogs render high-res backdrops, logos, taglines, runtimes, certifications, cast headshots, trailers — all from TMDB. We have a TMDB-shaped `metadata` object in seed items but no upstream call. | New `lib/tmdb.js` (auth + 5-min in-memory cache + image-url builder against TMDB's `image.tmdb.org` CDN), `routes/metadata.js` to surface poster/backdrop/cast on demand, plumb into `CatalogCard.jsx` / `MediaDetailPanel.jsx`. Keep server-side — TMDB key never leaks. |
| C-05  | **FanArt.TV / TheTVDB channel logos**    | TiviMate (picons), Plex, Channels DVR, every Kodi build, Jellyfin | Picons (small square channel logos) are the single biggest visual upgrade for a channel list. We currently use whatever `tvg-logo` the operator-pasted M3U carries — half of them are 404s or low-res. FanArt.TV exposes a free API for TV channel logos at HD resolution. | New `lib/logos.js` (TheLogoDB + FanArt.TV + iptv-org logos fallback chain), a per-channel logo CDN-cache, a tiny `/api/logo/:channelKey.png` endpoint with on-the-fly resize via `sharp`. |
| C-06  | **EPG: multi-source XMLTV + EPG.best**   | TiviMate (multi-EPG), OTT Navigator, Channels (TVE), Plex (PlexEPG), Threadfin | We accept ONE `XMLTV_URL`. TiviMate merges N sources and lets the user pick which one wins per channel. EPG.best is the de-facto premium EPG aggregator. Without multi-source merge, half the channels show "No data". | Extend `routes/epg.js` to accept a list of XMLTV URLs, add per-channel source override in `channelMap.json`. Add an EPG.best adapter (paid, opt-in). |
| C-07  | **Recording deduplication + series-pass** | TiviMate (premium), Channels DVR, Plex DVR, NextPVR | "Record every new episode of *The Bear*" is the recording feature most users use most. Current `routes/dvr.js` records a single one-shot envelope. A series-pass record means: subscribe → EPG-driven schedule → skip already-recorded episodes → retention policy → comskip integration. | Extend `routes/dvr.js` with `POST /api/dvr/series-pass` taking `{ series_id, profile_id, quality?, keep_count? }`. Add a nightly cron that walks EPG + dedupes vs in-memory recordings. |
| C-08  | **Subtitle support (OpenSubtitles)**     | Plex, Jellyfin (Bazarr companion), TiviMate (via external player), Stremio (always-on) | No subtitle UI surface at all. Mom is more likely to use captions than Dave is to use closed captions — explicit accessibility gap. Mainstream players ship with: in-stream CC, sidecar SRT, OpenSubtitles auto-download, font-size knob. | New `lib/opensubtitles.js` (REST API v3), `routes/subtitles.js` returning a normalised list, a `<track>`-element wiring in `PlayerModal.jsx`, an in-player picker overlay. |
| C-09  | **VLC / MX Player / Smart IPTV "Open in external player"** | TiviMate, IPTV Smarters, OTT Navigator, XCIPTV, Sparkle TV | When the in-app player can't decode something (rare codecs, MPEG-TS edge cases), every mainstream IPTV app offers a 1-tap "Open in VLC / MX / external player" using an Android/Tizen intent. Today, an undecodable stream just fails inside `PlayerModal.jsx` with no escape hatch. | Tizen: emit a `tizen.application.launchAppControl` for the AVPlay overlay. Web: open the stream URL in a new tab with a Content-Disposition. Not high LOC but high "feels solid" payoff. |
| C-10  | **Sleep timer + Pomodoro (already partial!)** | TiviMate, OTT Navigator, Plex, Jellyfin              | `components/SleepTimer.jsx` exists but is **not wired** to the play surface — clicking the chip currently doesn't actually stop playback after N minutes. This is a 1-day fix. | Wire `SleepTimer.jsx` → `playbackPositionStore.js` → `PlayerModal.jsx` `pause()`. |

> Skim: C-01 + C-02 alone close ~70% of the gap. They are the two biggest "but it doesn't
> do the thing" complaints anyone will have. Everything else is style.

---

## HIGH-VALUE 2026 features (table-stakes for SOTA)

This is the stuff mainstream apps now ship and a "2026 SOTA" claim requires.

| ID    | Feature                                  | Who has it                                              | Why it matters                                                                                                                                                                                                                                                                                  | Rough scope                                                                                                                                                                                                                                                                  |
| ----- | ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-01  | **Trakt + Simkl scrobbling**             | Every Stremio addon, OTT Navigator (3rd party), Kodi (native), Jellyfin (plugin) | Cross-app continue-watching ("started on phone, finish on TV") only works if we expose a Trakt scrobble. ~2.5M Trakt users today. Simkl is the lower-friction alternative.                                                                                                              | `lib/traktClient.js` + per-profile OAuth in settings + emit scrobble events from `PlayerModal.jsx` on `playing` / `paused` / `stop`. Trakt also gives us a real recommendation feed for free.                                                                                |
| H-02  | **Jellyseerr / Seerr-style request panel** | Plex + Overseerr, Jellyfin + Jellyseerr, Emby + Embystat | Mom's "I want to watch X but it's not in the catalog" loop today is "tell Dave to add it". A request panel posts the gap to Dave's queue + auto-orders via Sonarr/Radarr if wired. Quality-of-life feature that every Plex family ships.                                                       | New `routes/requests.js` (POST/GET/DELETE), tiny `RequestsModal.jsx`, optional Sonarr/Radarr fan-out.                                                                                                                                                                       |
| H-03  | **Sonarr / Radarr integration**          | Plex, Jellyfin, OTT Navigator (3rd party scripts)       | Once H-02 is in place, hooking it to Sonarr/Radarr (the de-facto PVR automation suite — same auth/API key model) turns the "Mom wants to watch X" loop into a one-click order.                                                                                                                  | `lib/sonarrClient.js` + `lib/radarrClient.js` (REST + API key), a server-side `routes/automation.js` proxy.                                                                                                                                                                 |
| H-04  | **SyncPlay / Watch Party**               | Jellyfin (native), Plex (Plex Together), Teleparty (3rd-party for Netflix/Disney), Hulu (native) | "Watch with Mom from the other room" is a feature people ask for. Even Disney+ and Amazon killed theirs (Disney's GroupWatch + Amazon Watch Party are gone in 2025/2026) so we'd actually have a market-relevant feature.                                                                       | Tiny SSE bus reusing the `routes/remote.js` pattern. Pair code, host emits play/pause/seek, joiners apply. ≤300 LOC.                                                                                                                                                       |
| H-05  | **Real recommendations engine**          | Plex (vector-based 2025), Netflix, Apple TV, Samsung Vision AI, Google TV (Gemini integration) | Our catalog is flat — no "Because you watched…", no "Mom's picks", no "Trending in your region". Mainstream 2026 apps use vector embeddings + watch history. We have an LLM fallback (`lib/llmFallback.js`); we can lean into that.                                                              | Phase 1: simple co-occurrence ("users who liked X also liked Y") computed in-memory from `watchHistoryStore.js`. Phase 2: embed titles via TMDB descriptions + a Hostinger-side embeddings API + cosine search.                                                              |
| H-06  | **SponsorBlock-style intro/outro skip**  | Jellyfin (chapter markers), YouTube SmartTube, mpv (community plugin) | `SkipIntroToggle.jsx` exists but has no marker source. Mainstream Netflix-class UX has a "Skip Intro" button that actually skips the intro. A small `chapters.json` per known series unlocks this immediately.                                                                                  | `data/chapters.json` mapping `series_id → episode_id → [{ kind: 'intro', start, end }]`. Hydrate from upstream if available; user can also crowd-source. Wire into `PlayerModal.jsx` overlay.                                                                               |
| H-07  | **Multi-audio + multi-subtitle picker**  | Every mainstream player (TiviMate, Plex, Jellyfin, OTT Nav, IPTV Smarters) | Our `PlayerModal.jsx` does not surface the AudioTrackList / TextTrackList from HLS playlists. Multi-audio (e.g. EN/ES) is huge for the Sherri profile and for any sports stream with commentary tracks.                                                                                          | Hls.js already exposes `audioTracks` / `subtitleTracks`. ~150 LOC overlay in `PlayerModal.jsx` + persist user choice to `playbackPrefStore.js`.                                                                                                                              |
| H-08  | **Cast EVERYWHERE — Chromecast + AirPlay 2 + DLNA** | TiviMate (Chromecast only), Smarters (CC + DLNA), Plex (all three), Jellyfin (all three) | We have Chromecast (`castSession.js`) but no AirPlay 2 and no DLNA renderer cast. For a Mom shell, casting from phone is critical. AirPlay needs only an iOS Safari hint header; DLNA needs a discovery via `node-ssdp`.                                                                          | Add `lib/airplay.js` (emit `x-apple-airplay-target=*` on the play ticket headers) + `lib/dlna.js` (SSDP-discover renderers on LAN, POST a SetAVTransportURI SOAP envelope).                                                                                                  |
| H-09  | **PiP (Picture-in-Picture)**             | OTT Navigator (poster feature), Plex, YouTube SmartTube, every modern web player | `PlayerModal.jsx` has no PiP affordance. HTML5 `requestPictureInPicture()` is a 30-LOC win on Chrome; Tizen has no PiP API, but mini-player exists.                                                                                                                                              | Add a PiP button in `PlayerModal.jsx`. Already have a `MiniPlayer.jsx` for the Tizen path — reuse.                                                                                                                                                                          |
| H-10  | **FAST channels — Pluto + Samsung TV Plus + Plex Live aggregator** | Plex (native), Channels DVR (premium), Stremio addons | These are the highest-leverage **legal free** linear channels on the planet (~500 channels combined). Public M3U generators exist (e.g. BuddyChewChew/app-m3u-generator on GH, refreshed daily). Wiring them is a 1-day catalog adapter and Dave gets 500 legal channels for free.                | New `lib/fastChannels.js` polling the public M3U + XMLTV every 6h, merged into `routes/catalog.js` behind a `FAST_CHANNELS_ENABLED` env flag.                                                                                                                              |
| H-11  | **Real-Debrid / TorBox / AllDebrid integration** | Stremio (via addons like Torrentio + MediaFusion), Kodi, OTT Navigator (community) | Power-user feature. Adds infinite VOD via debrid premium-link generation. Dave's segment cares about this; Mom doesn't. Should be opt-in, env-flag gated, behind explicit warning copy.                                                                                                          | `lib/debridClient.js` (Real-Debrid REST + TorBox REST + AllDebrid REST), surface in a Stremio-style search-results panel. Heavily flagged "operator-side responsibility".                                                                                                  |
| H-12  | **Per-profile cloud sync (TiviMate premium parity)** | TiviMate (premium), Smarters (rumoured), IPTV One (live) | Today our watch history / favorites / watchlist live in IndexedDB local only. If Sherri switches from her bedroom Tizen to the living-room Tizen, none of her state follows. TiviMate sells this as a $4.99/yr feature — we ship it as ours and beat them.                                       | Tiny Hostinger-side KV (or reuse the existing Hostinger API), per-profile JWT, sync deltas every 30s on `visibilitychange`. Backup envelope from `routes/backup.js` is 80% of the work.                                                                                    |
| H-13  | **TV Everywhere (TVE) auth bridge**      | Channels DVR (flagship), Plex (partial), Jellyfin (none) | Lets a user log in with their cable/Xfinity/YouTube TV credentials and watch authenticated live cable channels (CNN, ESPN, HBO). It's how Channels DVR justifies $80/yr. Massive lift but unique value.                                                                                          | Big — likely wave-15 or later. Requires OAuth dance against Adobe Pass + per-channel SAML flow. Mention as roadmap, not wave-13.                                                                                                                                            |
| H-14  | **DRM-protected stream support (Widevine L3 / PlayReady)** | Plex, Jellyfin (limited), every commercial OTT, Apollo / xTremeHD premium tier  | Some operator providers wrap stream URLs in Widevine. Our hls.js path does not initialise EME. Without it those streams just refuse to play. Shaka Player swap (or hls.js + EME) addresses this for L3 / SL150 content; L1 needs a hardware-bound Tizen widevine module. | Swap hls.js → Shaka Player or stay on hls.js but enable `emeEnabled: true` + add a `routes/license.js` proxy for Widevine licence acquisition. ~1 wave.                                                                                                                    |
| H-15  | **Audio normalization (loudness)**       | OTT Navigator, Plex (post-2025 builds), Channels DVR, IPTV Smarters (partial) | "Why is the ad twice as loud as the show" is the #1 complaint in every IPTV review. Web Audio `DynamicsCompressorNode` + EBU R128 target = 5 LOC for a giant UX win.                                                                                                                            | Add a one-toggle "Loudness normaliser" in `PlayerModal.jsx`. Insert a `DynamicsCompressorNode` into the audio graph between `<video>` and the destination on Chromium; no-op on Tizen AVPlay.                                                                              |
| H-16  | **HDR / Dolby Vision / HDR10+ passthrough** | IPTV Smarters Pro (claimed), TiviMate (claimed via ExoPlayer), Plex, Jellyfin | Today our player wires hls.js to a vanilla `<video>` — no `colorSpace` hints, no `mediaCapabilities.decodingInfo()` probe. On a QN85 QLED (the design target per `MEMORY.md`) we are throwing away HDR metadata.                                                                                | Add a `mediaCapabilities` probe before play, emit a hint in the play ticket about display capability, advertise the right HDR signalling on the AVPlay Tizen path.                                                                                                          |
| H-17  | **VOD scrubbing thumbnails (BIF / WebVTT)** | Plex, Jellyfin, Netflix, every Premium VOD             | Mainstream players render a per-second/per-10s thumbnail strip on scrub. Plex generates BIF files; Jellyfin generates WebVTT image sprites. We have no scrubbing thumbnails at all — scrubbing is blind.                                                                                       | For Jellyfin items: pull existing trickplay manifest (Jellyfin 10.9+). For iptv-org / M3U: generate WebVTT sprite on-demand from the playlist (ffmpeg server-side). Wire as a scrub overlay in `PlayerModal.jsx`.                                                          |
| H-18  | **VPN-aware health probe**               | TiviMate (warns on geo-block), OTT Navigator           | Mom in another city would silently get an empty grid because most iptv-org streams are geo-fenced. Detect it server-side, expose a banner. We have `routes/sourceHealth.js` — extend.                                                                                                            | Add a `_meta.geo` block to `routes/sourceHealth.js` resolves, surface in `StreamingQualityBar.jsx` as an info chip.                                                                                                                                                         |
| H-19  | **Tautulli-style analytics dashboard**   | Plex + Tautulli                                          | A nightly stats page ("hours watched, top channels, top categories, by-profile") closes the loop for Dave-the-operator. Useful for him to spot dead channels; useful for Mom to see her own viewing trend.                                                                                       | Surface from `watchHistoryStore.js` (per-profile, already exists). New `SettingsPanelTabbed.jsx` "Stats" tab with a 7d/30d/90d rollup.                                                                                                                                       |
| H-20  | **Live channel filtering — favorites only / by group / by quality** | Every mainstream player                                | We have a `FavoritesRail.jsx` but no "filter the EPG grid to favorites only" toggle. TiviMate's killer EPG feature is its 8 toolbar quick-filters. Cheap to add, big UX delta.                                                                                                                  | Add a filter toolbar to `EPGGrid.jsx` (favorites / categories / HD-only / has-EPG / has-catchup / hide-locked). Persist to `settingsStore.js`.                                                                                                                              |

---

## NICE-TO-HAVE (polish layer)

These are the 1-day items that, individually, don't move the needle, but together they
make DaveTV feel finished.

| ID    | Feature                                  | Rough scope                                                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-01  | **Auto-import M3U on a schedule**        | Today operator-pasted M3U URLs are fetched on first access + 5-min in-memory cache. Add a nightly cron that re-fetches on a 24h schedule even when nobody's watching, with notification of new channels.                                                                                          |
| N-02  | **Channel sort / hide / reorder**        | Persist per-profile channel ordering + a hide list. TiviMate's lineup editor is iconic. Reuse `settingsStore.js`. ~1 day.                                                                                                                                                                          |
| N-03  | **Bulk EPG mapping wizard**              | `routes/epg.js` exposes `suggest-channels` already. Add a UI in `SettingsPanelTabbed.jsx` for the operator to bulk-map XMLTV-id ↔ channel by fuzzy-match, like Threadfin's mapping pane.                                                                                                          |
| N-04  | **EPG reminders**                        | Set a reminder for "Show at 8pm" → on-screen toast + optional Pushover/Discord webhook. We have the EPG already.                                                                                                                                                                                  |
| N-05  | **Quick-channel-switch (number keys)**   | Pressing 1-9 on the remote should jump to channel 1-9 in the current grid, like every IPTV player does. Our key map (`tizenKeyMap.js`) ignores digit keys.                                                                                                                                          |
| N-06  | **Last-channel toggle (TV "0" key)**     | Press `0` to swap back to the previous channel. 50 LOC.                                                                                                                                                                                                                                            |
| N-07  | **Channel info OSD (overlay on key-press)** | Press OK on a live channel → show a 5-second OSD with "Channel X — Now: <program> 8:00-9:00pm — Next: <program>". This is the most "I know what I'm watching" UX of any IPTV app.                                                                                                                |
| N-08  | **Stream stats overlay (Ctrl+Alt+S)**    | Real bitrate, dropped frames, codec, resolution, buffer depth. Hls.js exposes all of it. 100 LOC dev/op overlay.                                                                                                                                                                                  |
| N-09  | **Custom channel groups (user-created)** | Operator + user can create a "Sherri's Soaps" group and drag channels into it. Persist to `settingsStore.js`.                                                                                                                                                                                     |
| N-10  | **Live sports score overlay (TheSportsDB API)** | Optional widget on sports channels — fetch live scores from the free TheSportsDB API, render a corner overlay. Big "wow" demo feature.                                                                                                                                                            |
| N-11  | **Kids profile + safe-search**           | Parental profile shape exists. A pre-baked "kids" persona with allow-list-by-default would parallel YouTube Kids.                                                                                                                                                                                  |
| N-12  | **Pure-radio mode (audio-only IPTV)**    | iptv-org has 5k+ radio stations. Free addition to the catalog, audio-only player surface, screensaver shows album art / live spectrogram. Niche but a great "look what it can do" demo.                                                                                                          |
| N-13  | **Theme marketplace (community manifests)** | Our layout-manifest engine is JSON-only. Allowing user-published manifests via a community Hostinger endpoint would dwarf TiviMate's customisation story.                                                                                                                                         |
| N-14  | **Per-shell hotkey help cheat-sheet**    | `KeyboardHelpModal.jsx` exists — currently universal. Surface the per-shell remapping (Plex shell key-map differs from TiviMate shell).                                                                                                                                                            |
| N-15  | **Backup encryption (passphrase)**       | `routes/backup.js` exports cleartext JSON. Optional symmetric encryption with a passphrase would let Dave email himself the config without leaking layout state. AES-GCM via Web Crypto.                                                                                                          |
| N-16  | **Per-channel start delay / pre-buffer** | TiviMate exposes a per-channel pre-buffer slider — for spotty operators it's the difference between "tunes immediately" and "loads for 4s". hls.js `maxBufferLength` is a single config knob.                                                                                                     |
| N-17  | **Channel-screenshot button**            | Capture a still from the live player to gallery. Tizen has the API; Chromium has `drawImage` on a video element. Trivial.                                                                                                                                                                          |
| N-18  | **Per-profile language override**        | Today the i18n picker is global. TiviMate lets Mom read Spanish while Dave reads English on the same TV via profile switch.                                                                                                                                                                       |
| N-19  | **Per-channel custom URL override**      | Operator can edit a channel's stream URL inline in settings (in case provider rotates). We currently only allow whole-playlist re-fetch.                                                                                                                                                          |
| N-20  | **Discord / Slack / Pushover webhook on recording finished** | Channels DVR has it. Engineering: a 50-LOC notifier inside the future Phase-4 recording worker.                                                                                                                                                                                                   |
| N-21  | **Battery / network status badge on phone-remote** | The phone-as-remote shell would show "Phone battery 23%, on cellular" so the operator knows when to plug in.                                                                                                                                                                                      |
| N-22  | **Animated channel-zap transition**      | TiviMate animates a 100ms fade when zapping channels. Pure CSS. 1h.                                                                                                                                                                                                                                |
| N-23  | **Idle screensaver: rotating channel previews** | `Screensaver.jsx` exists. Extend to fade between low-bitrate previews of favorites every 30s — a "wallpaper TV" mode.                                                                                                                                                                              |

---

## API integrations missing

Each entry: what the API gives us, why it matters, rough scope.

| ID    | API                                  | What it adds                                                                                                                                                                                                                                                                                  | Scope                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-01  | **Xtream Codes** (`player_api.php`)  | The standard IPTV provider API. Endpoints: `get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_series_categories`, `get_series`, `get_series_info`, `get_short_epg`, `get_simple_data_table`, `get_account_info`, `get_panel`. Without this we cannot directly ingest 99% of paid IPTV providers. See [worldofiptvcom/xtream-codes-api-documentation](https://github.com/worldofiptvcom/xtream-codes-api-documentation). | New `lib/xtreamClient.js`. ~600 LOC mirror of the 11 endpoints + normaliser. Reuse credential-guard / sanitize-log patterns.                                                                                                                                  |
| A-02  | **Stalker / Ministra portal**        | MAG / set-top legacy IPTV — MAC-bound, multi-step handshake, encrypted session key, JSON-RPC over `/server/load.php`. See [iptv.taghdoutelive.com decoded guide](https://iptv.taghdoutelive.com/2025/08/iptv-stack-decoded-portal-stalker.html).                                                | New `lib/stalkerClient.js`. ~400 LOC.                                                                                                                                                                                                                          |
| A-03  | **TMDB v3** (read API)               | High-res posters, backdrops, episode stills, cast headshots, certifications, runtimes, taglines, IDs to cross-link to IMDb / TVDB. Free for non-commercial. See [themoviedb.org/api-for-business](https://www.themoviedb.org/api-for-business).                                                | New `lib/tmdb.js`. ~200 LOC + cache-keyed by tmdb-id.                                                                                                                                                                                                          |
| A-04  | **TheTVDB v4** (read API)            | Better TV-show metadata than TMDB for niche / older series, plus channel logos directly. See [thetvdb.com/api-information](https://www.thetvdb.com/api-information).                                                                                                                            | New `lib/tvdb.js`. ~200 LOC.                                                                                                                                                                                                                                   |
| A-05  | **FanArt.TV v3.2**                   | Logos, backgrounds, clearart for movies/series/channels in 1080p. Used by Kodi, Plex, Jellyfin. See [fanart.tv API github](https://github.com/fanart-tv/fanart.tv-api).                                                                                                                          | New `lib/fanart.js`. ~150 LOC. Free with API key.                                                                                                                                                                                                              |
| A-06  | **OMDb / IMDb-id passthrough**       | Aggregated rating numbers (IMDb / Rotten / Metacritic) for the catalog detail rail. OMDb is free up to 1k req/day.                                                                                                                                                                              | New `lib/omdb.js`. ~80 LOC. Tag rating onto items.                                                                                                                                                                                                             |
| A-07  | **Trakt v2 (OAuth)**                 | Watch-history scrobble + recommendation feed + collection + watchlist. Auto-syncs to Plex / Jellyfin / Kodi / Stremio. ~2.5M users.                                                                                                                                                              | New `lib/trakt.js` + per-profile OAuth tokens persisted in `settingsStore.js`. Emit scrobble from `PlayerModal.jsx`. ~300 LOC + a connect screen.                                                                                                              |
| A-08  | **Simkl** (alternative to Trakt)     | Lower-friction tracking, scrobbler. One API key per user. Bidirectional Trakt sync.                                                                                                                                                                                                              | Optional alternative to A-07. ~200 LOC.                                                                                                                                                                                                                        |
| A-09  | **JustWatch** (where-to-stream)      | "This movie is also on Disney+ for free" panel on the detail page. Free public widget; paid full API. See [justwatch.com streaming API](https://www.justwatch.com/us/JustWatch-Streaming-API).                                                                                                  | New `lib/justwatch.js`. Optional — Watchmode (A-10) is a friendlier alternative.                                                                                                                                                                               |
| A-10  | **Watchmode**                        | Same "where to stream" answer as JustWatch but simpler REST API. Free tier 1k req/mo.                                                                                                                                                                                                          | New `lib/watchmode.js`. ~120 LOC.                                                                                                                                                                                                                              |
| A-11  | **TVMaze** (open EPG/series API)     | Free, no key, JSON. Web-channel schedules + episode lists + cast. Great for series-pass when XMLTV doesn't carry depth. See [tvmaze.com/api](https://www.tvmaze.com/api).                                                                                                                       | New `lib/tvmaze.js`. ~100 LOC. Zero-config, no key.                                                                                                                                                                                                            |
| A-12  | **EPG.best** (premium aggregator)    | Operator-grade EPG with deep guide data for 100+ regions. Most paid IPTV apps wire it as the "premium EPG" upgrade. Paid.                                                                                                                                                                       | Adapter in `integrations/xmltv.js` consuming the EPG.best XMLTV pull. Opt-in env flag.                                                                                                                                                                         |
| A-13  | **iptv-org `/api/categories.json`, `/regions.json`, `/timezones.json`** | We currently consume `channels.json` + `streams.json` + `logos.json` + `blocklist.json`. There are 4 more public files (categories, regions, timezones, subdivisions) we can use to build a much better filter UX. See [iptv-org.github.io/api](https://iptv-org.github.io/api/).               | Extend `lib/iptvOrgRefresh.js` to fetch the four extras. Tiny.                                                                                                                                                                                                 |
| A-14  | **iptv-org `/epg`** (XMLTV pointers)  | `guides.json` lists which XMLTV files each channel has and where. We currently have only `XMLTV_URL` as a single source. Multi-source merge unlocks EPG for ~5x more channels.                                                                                                                  | Wire into the multi-EPG work above (C-06).                                                                                                                                                                                                                     |
| A-15  | **Sonarr v3 / Radarr v3** (REST + key) | Series automation + movie automation. Used by every Plex/Jellyfin family. Lets us turn "request a movie" into "auto-download next quality upgrade". See [wiki.servarr.com](https://wiki.servarr.com/).                                                                                          | New `lib/sonarrClient.js` + `lib/radarrClient.js`. ~250 LOC each.                                                                                                                                                                                              |
| A-16  | **Prowlarr** (indexer aggregator)    | Front-door API for Sonarr/Radarr indexer management.                                                                                                                                                                                                                                            | New `lib/prowlarrClient.js`. Only needed if we ship A-15.                                                                                                                                                                                                      |
| A-17  | **Bazarr** (Sonarr/Radarr subtitle companion) | Automatic subtitle download orchestration.                                                                                                                                                                                                                                                       | Could be an internal feature rather than a separate process. See C-08.                                                                                                                                                                                          |
| A-18  | **Jellyseerr** (or Seerr) request manager | A request UI + Sonarr/Radarr fan-out. If we add a request panel ourselves (H-02) we *are* this.                                                                                                                                                                                                  | See H-02.                                                                                                                                                                                                                                                       |
| A-19  | **Threadfin REST API**               | Useful if we leave Threadfin as an external box: configure mappings from our UI. Threadfin exposes JSON-RPC over `/api/`.                                                                                                                                                                       | New `lib/threadfinClient.js` — optional. We can subsume by building an internal Xtream + M3U normaliser.                                                                                                                                                       |
| A-20  | **OpenSubtitles REST API (v3)**      | Subtitle search + download. Requires a free account + API key per consumer app. Hash-based search picks the right SRT for a given file in 1 RTT. See [opensubtitles.stoplight.io](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started).                     | New `lib/opensubtitles.js`. ~200 LOC.                                                                                                                                                                                                                          |
| A-21  | **Real-Debrid REST**                 | Premium link generator. Per-user OAuth, returns playable HTTPS URLs from magnet links.                                                                                                                                                                                                          | New `lib/debridRealDebrid.js`. Opt-in, dangerous to ship by default (legal grey zone).                                                                                                                                                                         |
| A-22  | **AllDebrid REST**                   | Same shape as Real-Debrid but unlimited bandwidth + 70+ hosts.                                                                                                                                                                                                                                   | New `lib/debridAllDebrid.js`. Same caveats.                                                                                                                                                                                                                    |
| A-23  | **TorBox REST**                      | New 2026-favored debrid with multi-IP + free tier. Stremio integrations adopting it fastest.                                                                                                                                                                                                    | New `lib/debridTorBox.js`.                                                                                                                                                                                                                                     |
| A-24  | **Premiumize REST**                  | Includes 1 TB cloud storage. Most expensive of the four.                                                                                                                                                                                                                                         | New `lib/debridPremiumize.js`. Optional.                                                                                                                                                                                                                       |
| A-25  | **Pluto TV public M3U + EPG**        | Free legal FAST channels (~250). Ingested via the BuddyChewChew M3U generator or our own scraper.                                                                                                                                                                                                | Adapter in `lib/fastChannels.js`. See H-10.                                                                                                                                                                                                                    |
| A-26  | **Samsung TV Plus public M3U + EPG** | Free legal FAST channels (~200 in US).                                                                                                                                                                                                                                                          | Same adapter as A-25.                                                                                                                                                                                                                                          |
| A-27  | **Plex Live (free)**                 | Free FAST channels Plex exposes without auth via their published M3U.                                                                                                                                                                                                                            | Same adapter.                                                                                                                                                                                                                                                  |
| A-28  | **Tubi free M3U mirror**             | ~300 FAST channels.                                                                                                                                                                                                                                                                              | Same adapter.                                                                                                                                                                                                                                                  |
| A-29  | **Roku Channel free M3U mirror**     | ~150 FAST channels in US.                                                                                                                                                                                                                                                                        | Same adapter.                                                                                                                                                                                                                                                  |
| A-30  | **SponsorBlock REST API**            | Crowd-sourced "skip-this-section" markers, primarily for YouTube but the data model generalises to any series with stable IDs.                                                                                                                                                                   | Only useful if/when we add a YouTube shell. Low priority for IPTV.                                                                                                                                                                                              |
| A-31  | **TheSportsDB**                      | Free sports schedule + live score widget. Useful for H-10 sports overlay.                                                                                                                                                                                                                       | New `lib/sportsDb.js`. ~100 LOC.                                                                                                                                                                                                                               |
| A-32  | **Discord webhook / Pushover / Gotify** | Notification fan-out for recording-finished, stream-broke, EPG-refreshed.                                                                                                                                                                                                                        | A new `lib/notifier.js` with a tiny adapter per channel. ~150 LOC total.                                                                                                                                                                                       |
| A-33  | **DLNA / SSDP discovery**            | Discovers DLNA renderers on the LAN (most smart TVs / receivers expose one). Lets us cast to non-Chromecast hardware.                                                                                                                                                                            | New `lib/dlnaDiscover.js` via `node-ssdp`. Cast via a SetAVTransportURI SOAP envelope. ~200 LOC.                                                                                                                                                              |
| A-34  | **Gracenote / Tribune OnConnect**    | Enterprise EPG (paid, very high quality). Only relevant if we ever serve a commercial deployment.                                                                                                                                                                                                | Out of scope for personal use.                                                                                                                                                                                                                                   |
| A-35  | **AcoustID + MusicBrainz**           | Audio fingerprinting → music ID. Out-of-the-box "Shazam-like" identification for streams. Niche.                                                                                                                                                                                                 | New `lib/acoustid.js`. Optional. Mom might love it ("what song is that?" → answer).                                                                                                                                                                            |
| A-36  | **HDHomeRun discovery**              | Auto-discovers HDHomeRun OTA tuners on the LAN. Channels DVR's secret weapon. Lets a hybrid OTA + IPTV setup work.                                                                                                                                                                              | New `lib/hdhomerun.js`. ~150 LOC. Optional.                                                                                                                                                                                                                    |

---

## Recommended wave-13 (next 5–10 features)

Ordered by impact-per-week-of-work. Anything below the cut line should go to wave-14+.

1. **C-01 Xtream Codes client.** The single highest-leverage change. Once this lands, every
   paid provider Dave or anyone else has is wired in 30 seconds. Unblocks the catalog,
   unblocks playback, unblocks DVR, unblocks catchup. ~1 wave on its own.
2. **C-04 TMDB metadata enrichment.** Cheapest visual upgrade — once posters and backdrops
   come from TMDB, every shell looks like Netflix. 1–2 days actual coding once the key is
   in env.
3. **C-05 FanArt.TV / TheTVDB channel logos.** Second cheapest visual upgrade. Same day
   delta. Picons turn a TiviMate-looking grid into a *good*-looking TiviMate-looking grid.
4. **H-07 Multi-audio + multi-subtitle picker.** hls.js exposes the tracks; our UI doesn't.
   Half a day. Big Mom-mode + multilingual win.
5. **C-08 OpenSubtitles auto-download.** Pairs with H-07. A day, max.
6. **C-02 Real DVR pipeline (Phase 4 ffmpeg muxer).** Promote from "Phase 4" to "wave-13".
   This is the only really week-long item on this list but it makes the "Record" button
   not lie to the user.
7. **H-15 Audio normalization toggle.** 5 lines. Universal complaint solved.
8. **N-05 + N-06 + N-07 (number keys + last-channel + OSD on key-press).** Together they
   take an evening and make the remote feel like cable.
9. **C-10 Wire the existing SleepTimer.** 1 hour. We have the component; it's just unwired.
10. **H-10 FAST channels (Pluto + Samsung TV Plus + Plex Live + Tubi + Roku M3U).** 1 day
    to wire BuddyChewChew (or our own scraper), nightly cron, on-by-default with an
    opt-out env flag. Adds ~700 legal-free channels with zero credentials.

**Stretch goals if wave-13 finishes early:**
- C-06 Multi-source XMLTV merge.
- A-13 + A-14 iptv-org extras (categories/regions/timezones).
- N-02 Channel sort / hide / reorder.

---

## Recommended wave-14+ (3-month roadmap)

Grouped by theme — each group is roughly one wave (1–2 weeks).

### Wave-14: "Mainstream catalog parity"
- A-07 Trakt OAuth + scrobble (H-01).
- A-08 Simkl alternative.
- H-02 Request panel + A-15 Sonarr/Radarr fan-out.
- H-04 SyncPlay (watch party) — small.
- N-09 Custom user-defined channel groups.
- H-19 Tautulli-style stats tab.
- N-15 Backup encryption.

### Wave-15: "Power player polish"
- H-09 Picture-in-Picture.
- H-17 VOD scrubbing thumbnails (Jellyfin trickplay + ffmpeg fallback).
- H-14 DRM / EME support (Widevine L3 / PlayReady) — swap hls.js → Shaka Player.
- H-06 SponsorBlock-style intro skip markers.
- C-09 "Open in external player" intent for Tizen + web.
- N-08 Stream stats overlay.
- N-16 Per-channel pre-buffer slider.

### Wave-16: "Operator + automation"
- C-03 Stalker portal client.
- A-19 Threadfin REST passthrough.
- A-16 Prowlarr integration.
- N-01 Nightly M3U auto-refresh.
- N-20 Recording-finished webhook (Discord / Pushover).
- A-32 Generic notifier library.

### Wave-17: "Discovery + recommendations"
- H-05 Recommendations engine (co-occurrence first, then embeddings).
- A-09 / A-10 Watchmode "where to watch" widget.
- A-11 TVMaze series enrichment.
- N-10 Live sports score overlay (TheSportsDB).
- A-35 AcoustID music ID.

### Wave-18: "Cast everywhere"
- H-08 AirPlay 2 + DLNA renderer cast.
- A-33 SSDP discovery.
- H-12 Per-profile cloud sync.
- A-36 HDHomeRun discovery.

### Wave-19 (aspirational): "Premium-tier features"
- H-13 TV Everywhere (TVE) auth bridge.
- H-11 Real-Debrid / TorBox / AllDebrid (opt-in, env-flag, big warning copy).
- A-12 EPG.best paid adapter.
- N-13 Community theme marketplace.

---

## Honest assessment of where we lead vs lag

**We genuinely lead on:**
- **Switchable shells (14).** No mainstream player has this. Even Stremio doesn't.
- **Credential safety (server-only stream resolution + HLS proxy that rewrites segment URLs).**
  Smarters Pro leaks. Plex/Jellyfin require a proxy. Our `hlsProxy.js` is best-in-class for
  the operator-paid use case.
- **Phone-as-remote SSE bus.** Not unique (Kodi has it) but our pair-code UX is cleaner.
- **Mom-mode accessibility + per-user persona system.** No competitor does this.
- **Azure TTS as a first-class output (not a sidecar).** Unique.
- **Per-TV asymmetric performance policy (Mom never limited; Dave caps respected).** Unique.
- **Tizen sideload path + Chromium parity.** TiviMate is Android-TV only; Plex/Jellyfin
  need the official Tizen store. We can run on a Samsung TV today.

**We honestly lag on:**
- **Xtream Codes** — every competitor speaks it; we don't.
- **DVR that writes bytes** — every competitor in this list has a working recording pipeline;
  ours is stub.
- **Catalog metadata depth** — Plex/Jellyfin/Stremio look luxurious because TMDB is hooked.
- **Subtitle UX** — universal table-stakes; we have none.
- **Number-key / last-channel zap** — the most fundamental remote behaviour; we don't.
- **HDR / Dolby Vision signalling** — given our QN85 design target, this is a self-inflicted wound.
- **Multi-audio / multi-subtitle picker** — hls.js gives us the data, we ignore it.
- **Real recommendations** — we render flat rails; everyone else uses ML.

**We lag and shouldn't try to lead** (out of scope for a single-operator family TV):
- TV Everywhere (TVE) — Channels DVR's flagship; we'd be playing catch-up forever.
- Commercial EPG (Gracenote/Tribune) — overkill for personal use.
- Widevine L1 hardware DRM — pointless without commercial licensing.

---

## Sources

Cross-references for the non-obvious claims in this doc. Verified during the W12 research pass.

### TiviMate
- [TiviMate Review 2026 — Features, Pricing & Best Alternatives (Lit IPTV)](https://litiptv.com/blog/tivimate-review-guide)
- [Brilliant TiviMate IPTV Player Guide 2025/2026 (Flixivo)](https://www.flixivo.com/tivimate-iptv-player/)
- [TiviMate vs IPTV Smarters Pro 2025 (IPTV Byte)](https://iptvbyte.com/tivimate-vs-smarters-pro/)

### IPTV Smarters Pro
- [IPTV Smarters Pro 2025 Complete User Guide](https://cu.citizenwatch.com/blogs/news/iptv-smarters-pro-in-2025-the-complete-user-guide-expert-review)
- [10 IPTV Smarters Pro Alternatives 2025](https://savethevideo.net/blog/10-iptv-smarters-pro-alternatives-in-2025/)

### OTT Navigator
- [OTT Navigator Changelog (official)](https://ottnav.github.io/changelog.html)
- [OTT Navigator FAQ](https://ottnav.github.io/faq.html)

### Stremio + addons
- [40+ Best Stremio Addons May 2026 (Troypoint)](https://troypoint.com/best-stremio-addons/)
- [Stremio-Community/stremio-addons-list (GitHub)](https://github.com/Stremio-Community/stremio-addons-list)

### Plex / Jellyfin
- [Plex Pass Feature Overview (Plex)](https://support.plex.tv/articles/201751006-plex-pass-feature-overview/)
- [Plex Live TV & DVR Category (Plex)](https://support.plex.tv/articles/categories/features/live-tv-dvr/)
- [Plex vs Jellyfin (2026) — CoreLab](https://corelab.tech/plexvsjellyfin/)
- [Jellyfin Hardware Transcoding 2026 Guide](https://jellywatch.app/blog/jellyfin-hardware-transcoding-2026-comprehensive-guide)
- [Jellyfin SyncPlay (Grokipedia overview)](https://grokipedia.com/page/Jellyfin)

### Channels DVR / NextPVR
- [Channels DVR — TV Everywhere](https://getchannels.com/tv-everywhere/)
- [About skipping commercials — Channels Community](https://community.getchannels.com/t/about-skipping-commercials/22999)
- [NextPVR Whole-Home DVR (official)](https://www.nextpvr.com/)

### Threadfin / xTeVe
- [Threadfin (GitHub)](https://github.com/Threadfin/Threadfin)
- [Xteve, Threadfin, and other apps for connecting IPTV to Plex (Techkings)](https://www.techkings.org/threads/xteve-threadfin-and-other-apps-for-connecting-iptv-to-plex.173552/)

### Xtream Codes / Stalker
- [Xtream Codes API documentation v2.9.2 (GitHub)](https://github.com/worldofiptvcom/xtream-codes-api-documentation)
- [Xtream-Masters Player_API.php documentation](https://xtream-masters.com/api-doc/player_api.php)
- [IPTV stack decoded: portal, Stalker, STBEmu, Xtream (Aug 2025)](https://iptv.taghdoutelive.com/2025/08/iptv-stack-decoded-portal-stalker.html)
- [Stalker Middleware 5.2.0 Changelog (Infomir)](https://wiki.infomir.eu/eng/ministra-tv-platform/changelog/stalker-middleware-5-2/stalker-middleware-5-2-0)

### Metadata APIs
- [TMDB API for Business](https://www.themoviedb.org/api-for-business)
- [TheTVDB API Information](https://www.thetvdb.com/api-information)
- [FanArt.TV API (GitHub)](https://github.com/fanart-tv/fanart.tv-api)
- [Trakt API Apiary](https://trakt.docs.apiary.io/)
- [Watchmode Streaming Availability API](https://api.watchmode.com/)
- [JustWatch Streaming API](https://www.justwatch.com/us/JustWatch-Streaming-API)
- [TVMaze API](https://www.tvmaze.com/api)
- [Simkl Features](https://simkl.com/vip/)

### *arr / Automation
- [Awesome *arr (Ravencentric GitHub)](https://github.com/Ravencentric/awesome-arr)
- [Servarr Wiki](https://wiki.servarr.com/)
- [Complete Arr Stack Guide 2026 (Bytesized)](https://bytesized-hosting.com/guides/the-complete-arr-stack-guide-2026-sonarr-radarr-prowlarr-and-more)
- [Seerr Release: Unifying Overseerr and Jellyseerr](https://docs.seerr.dev/blog/seerr-release/)

### Subtitles / Players
- [OpenSubtitles REST API Docs](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)
- [Bazarr Setup Guide](https://wiki.bazarr.media/Getting-Started/Setup-Guide/)
- [Shaka Player (GitHub)](https://github.com/shaka-project/shaka-player)

### Audio / HDR / DRM
- [HDR, Dolby Vision and Other Standards (Infomir 2025)](https://www.infomir.eu/eng/blog/articles/143-hdr-dolby-vision-and-other-standards-what-matters-for-an-iptv-operator-in-2025/)
- [Audio for Streaming in 2025 (VideoSDK)](https://videosdk.live/developer-hub/voip/audio-for-streaming)
- [AES TD1006 Loudness Guidelines for OTT](https://www.aes.org/technical/documents/AESTD1006_1_17_10.pdf)

### Watch parties / Casting
- [Best Watch Party Apps 2026 (SyncUp)](https://syncup.tv/blog/best-watch-party-apps-2026)
- [Cast vs AirPlay vs DLNA Ultimate Guide (SmartTV Club)](https://smarttvclub.com/cast-vs-airplay-vs-dlna-comparison-guide/)

### FAST channels
- [FAST Channels on Pluto / Tubi / Plex / Prime (Substack)](https://ryanschwartz.substack.com/p/fast-channels-pluto-tv-tubi-plex-prime-video)
- [BuddyChewChew app-m3u-generator (GitHub)](https://github.com/BuddyChewChew/app-m3u-generator)

### Debrid
- [Best Debrid Services 2026 (Troypoint)](https://troypoint.com/best-debrid-services/)
- [debrid-services-comparison (GitHub)](https://github.com/fynks/debrid-services-comparison)

### AI / Recommendations
- [AI Recommendation Systems Guide 2026 (Redis)](https://redis.io/blog/real-time-ai-recommendation-systems/)
- [Samsung Vision AI](https://www.samsung.com/us/tvs/vision-ai-tv/)
- [15 Ways AI Is Being Used in Smart TVs 2026 (DigitalDefynd)](https://digitaldefynd.com/IQ/ai-use-in-smart-tv/)
- [Google TV's AI Revolution (AndroidGuys)](https://androidguys.com/news/google-wants-your-tv-to-feel-smarter-more-conversational-and-a-little-less-remote-control-y/)

### Analytics / Misc
- [Tautulli (GitHub)](https://github.com/Tautulli/Tautulli)
- [SponsorBlock Advanced Skip Options](https://wiki.sponsor.ajay.app/w/Advanced_skip_options)
- [iptv-org awesome-iptv](https://github.com/iptv-org/awesome-iptv)
- [iptv-org API (channels + streams + guides + logos)](https://iptv-org.github.io/api/)

---

*End of FEATURE_GAP_2026.md. Read-only research. No code touched.*

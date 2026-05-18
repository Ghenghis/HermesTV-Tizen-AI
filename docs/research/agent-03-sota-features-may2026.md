# Agent 03 — SOTA Features Research: May 2026
## HermesTV Competitive Gap Analysis

**Research Date:** May 2026
**Scope:** Commercial streaming apps, leading IPTV apps, AI-powered features, performance patterns, privacy features
**Purpose:** Identify what HermesTV-Tizen-AI is missing to be competitive in May 2026

---

## 1. Commercial Streaming App SOTA (Netflix, Disney+, Apple TV+, Max, Paramount+)

These are features considered **standard** on Samsung Tizen streaming apps as of May 2026.

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Autoplay preview / hover video trailer | Netflix, Prime Video, Disney+, YouTube | No | High | Medium | Plays clip when tile is focused for 2–3 sec; muted by default; user can toggle off in settings |
| Continue watching row | Netflix, Disney+, Prime Video, Max | No | High | Medium | Per-user resume position stored in backend; row appears at top of home screen |
| Cross-device progress sync | Netflix, Plex, Emby | No | High | Complex | Backend stores playback position; Jellyfin already on VPS could provide this |
| Personalized recommendation rows | Netflix, Disney+, Prime Video | No | High | Complex | "Because you watched X" carousels; requires watch-history graph on backend |
| Skip Intro / Skip Credits button | Netflix, Hulu, Plex, Jellyfin (plugin) | No | High | Medium | AI or fingerprint detects intro boundaries; overlay button appears during playback |
| User profiles (named, with avatars) | Netflix, Disney+, Plex, Emby, Jellyfin | No | High | Medium | Jellyfin supports multi-user; front-end needs profile picker on launch |
| Parental controls / content ratings lock | Netflix, Disney+, Emby, Jellyfin | No | High | Medium | Per-profile content rating ceiling + PIN; required for household with mixed viewers |
| PIN-protected profile switching | Netflix, Disney+, Plex | No | Medium | Simple | Profile-level PIN prompt before access |
| Voice search / natural language search | Netflix (gen-AI), Amazon Fire TV (Alexa+), Google TV | No | High | Complex | "Show me funny sci-fi from the 90s" → results; backend NLP required |
| Accessibility: audio description (AD) | Netflix, Disney+, Apple TV+ | No | Medium | Medium | Toggle to switch to audio-described stream variant when available |
| Accessibility: SDH / CC captions | Netflix, Disney+, all major | No | Medium | Medium | Closed captions with styling; Samsung AVPlay supports side-loaded subtitle tracks |
| Accessibility: text size scaling | Apple TV+, Netflix | No | Low | Simple | Respects Samsung system accessibility font scale |
| Download / offline sync for VoD | Netflix, Disney+, Plex Pass, Emby | No | Low | Complex | Not applicable for IPTV live; relevant for Jellyfin VoD libraries |
| "Next episode" auto-advance | Netflix, Disney+, Plex | No | Medium | Simple | 15-sec countdown overlay at episode end, then auto-plays next |
| Watchlist / My List | Netflix (My List), Disney+ (Watchlist), Max | No | High | Simple | User-curated queue stored in backend; single button press to add/remove |
| Content ratings display | Disney+, Netflix, Apple TV+ | No | Medium | Simple | MPAA/TV rating badge on tile and detail screen |

---

## 2. Leading IPTV App SOTA (TiviMate, Kodi, Plex HTPC, Channels DVR, Emby Theater)

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Full-grid EPG (7-day programme guide) | TiviMate, Kodi (PVR), Channels DVR | No | High | Complex | XMLTV/Dispatcharr already on VPS; need Tizen front-end grid renderer with horizontal/vertical D-pad scroll |
| Catch-up TV (past programme replay) | TiviMate Premium, Channels DVR | No | High | Complex | Requires provider catch-up support; EPG backward scroll to past programmes |
| Timeshift: pause/rewind live TV | TiviMate Premium | No | Medium | Complex | Client-side or server-side ring buffer (2 GB = ~30 min); requires local or VPS storage |
| DVR / scheduled recording | TiviMate Premium, Channels DVR, Emby | No | Medium | Complex | EPG-triggered recording to VPS storage; schedule from EPG or UI |
| Multi-view / Picture-in-Picture (PiP) | TiviMate Premium (4-up), IPTV Smarters | No | Medium | Complex | Watch 2–4 streams simultaneously; Samsung Tizen has PiP API constraints |
| Channel favorites management | TiviMate, Kodi, Plex | Partial | High | Simple | HermesTV has provider ratings but no explicit per-user favorites list with star/sort |
| Custom channel grouping / folders | TiviMate, IPTV Smarters | No | High | Simple | User-created groups (e.g., "Sports", "Kids", "News") independent of provider M3U groups |
| Channel logo display | TiviMate, Kodi, Plex | No | Medium | Simple | XMLTV/M3U logo URLs; cache and display in channel list and EPG |
| Stream fallback chain (backup URLs) | TiviMate (multi-playlist), Channels DVR | No | High | Medium | If primary stream fails, auto-try URL 2, URL 3 within configurable timeout |
| Cloud playlist sync | IPTV One (real-time cross-device) | No | Low | Complex | Favorites and groups sync instantly across devices; overkill for private household |
| Programme detail / synopsis overlay | TiviMate, Channels DVR, Plex | No | Medium | Simple | Press Info button to see full EPG description, rating, cast for current programme |
| Recently watched channels row | TiviMate | No | Medium | Simple | Last 10–20 channels surfaced in a quick-access row |
| Channel search / filter | TiviMate, IPTV Smarters | No | High | Simple | Type partial channel name; filter list in real time |
| Parental PIN for channel groups | TiviMate | No | Medium | Simple | Lock adult or premium channel groups behind a PIN |
| EPG time offset / timezone correction | TiviMate | No | Low | Simple | Per-playlist ±N hour EPG shift to fix misaligned guide data |

---

## 3. AI-Powered Streaming Features (May 2026 SOTA)

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Generative AI natural language search | Netflix (iOS testing), Fire TV (Alexa+), Google TV | No | High | Complex | "Something funny and upbeat" → curated results; requires LLM + content metadata index; VPS has Open WebUI already |
| AI watch-history personalization | Netflix (hybrid ML+LLM), Prime Video, Disney+ | No | High | Complex | Content graph built from viewing history; "because you watched X" rows |
| AI content summaries / synopsis generation | ContentWise, Google TV Deep Dive | No | Medium | Medium | LLM-generated one-liner summaries for channels/shows without EPG metadata |
| Automatic content tagging | Netflix, Prime Video internal systems | No | Medium | Complex | Auto-tag mood, genre, tone from metadata or AI analysis; enriches search |
| Skip Intro detection (AI fingerprint) | Plex (PlexAutoSkip), Jellyfin plugin, Hulu | No | High | Medium | Audio/video fingerprint compares segments across episodes; Jellyfin plugin available |
| AI upscaling (real-time) | Samsung Vision AI (4K AI Upscaling Pro) | Platform-level | Low | N/A | Samsung hardware handles this at TV firmware level; no app action needed |
| Voice assistant integration (Bixby) | Samsung Bixby (2026 redefined), Google TV | No | Medium | Complex | Deep-link HermesTV commands into Bixby wake-word flow via Samsung Partners API |
| AI sports briefs / highlights | Google TV AI Sports, Amazon | No | Low | Complex | Auto-summary of sports scores; niche for household use |
| Mood-based content filtering | Netflix, ContentWise | No | Medium | Medium | Filter by mood tag (e.g., "relaxing", "exciting") rather than genre |
| AI-generated thumbnails | Netflix (A/B thumbnail personalization) | No | Low | Complex | Personalized poster art per user; very heavy for private household scale |
| Perplexity / web-augmented recommendations | Samsung Vision AI Companion 2026 | No | Low | Complex | Samsung bundles Perplexity on-TV for contextual search; HermesTV could link out |
| Automatic chapter markers | Plex (Skip Credits), practical-engineer.ai | No | Medium | Medium | AI detects act breaks and inserts chapter markers for seeking |

---

## 4. Performance and Reliability Patterns (May 2026 SOTA)

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Lazy-load / code-split startup | Samsung Tizen best practice, Netflix | No | High | Medium | Load only home-screen code at launch; defer player/EPG modules; target <2s cold launch |
| Skeleton loading screens | Netflix, Plex, Disney+ | No | High | Simple | Placeholder shimmer tiles while catalog data loads; removes blank-screen flash |
| localStorage spec caching | Samsung Developer best practice | Partial | High | Simple | Cache TV model/tier detection in localStorage so it's not re-queried each launch |
| Adaptive bitrate (ABR) switching | All major apps; Samsung AVPlay API | No | High | Medium | HLS/DASH manifest with multiple quality tiers; AVPlay handles switching automatically when manifest supplied |
| Low-Latency HLS (LL-HLS) | Live sports/events, YouTube | No | Medium | Complex | Partial segments; sub-3s latency for live streams; Tunarr/Threadfin may need config |
| Stream health monitor / watchdog | Channels DVR, TiviMate | No | High | Medium | Detect stall/error in player; auto-retry or switch to fallback URL after N seconds |
| Exponential backoff retry | Industry standard (Netflix CDN client) | No | High | Simple | On stream error: wait 1s, 2s, 4s, 8s before each retry; max 3 attempts then show error UI |
| Per-tier animation budget | Oxagile Tizen optimization guide | Partial | High | Simple | QN vs UN tier already detected; enforce CSS animation disable on UN tier |
| Deferred non-critical API calls | Samsung Launch Time Optimization guide | No | Medium | Simple | Postpone EPG fetch, artwork preload, stats until after first frame is painted |
| Predictive prefetch (next episode/channel) | Netflix, Plex | No | Low | Complex | Pre-buffer next likely stream in background; memory-intensive on Tizen |
| Offline / degraded mode UI | Plex, Jellyfin | No | Medium | Simple | When VPS unreachable: show cached catalog, display "backend offline" banner, disable live features gracefully |
| Memory pressure relief | Samsung Tizen low-end guide | No | Medium | Medium | Detect Tizen memory warnings; unload hidden route components; pause thumbnail decode |

---

## 5. Privacy-First Household Features (May 2026 Power User SOTA)

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Local-only watch history (no cloud) | Jellyfin (zero telemetry), Kodi | Partial | High | Simple | Jellyfin already zero-telemetry; HermesTV must not send playback data to any external service |
| Watch history clear / per-user delete | Netflix (per-title), Jellyfin | No | High | Simple | UI to delete individual titles or wipe full history per profile |
| Telemetry opt-out / zero-telemetry mode | Jellyfin, Kodi | Partial | High | Simple | Confirm no analytics SDK in Tizen app; no Samsung ACR (Automatic Content Recognition) hooks |
| Incognito / private session mode | Some platforms offer this | No | Medium | Simple | Temporary profile that leaves no history; useful for gifts/surprises |
| Guest profile (no watch history) | Netflix (guest mode in some regions) | No | Low | Simple | One-tap "guest" profile that resets on exit |
| Provider credential vault (local) | HermesTV VPS backend | Partial | High | Simple | Credentials stay server-side; Tizen app never holds M3U URLs or Xtream passwords in client storage |
| Samsung ACR disable awareness | Privacy-conscious Tizen users | No | Medium | Simple | Inform user in settings that Samsung's own ACR should be disabled in TV privacy settings; link to guide |
| Audit log of AI commands | HermesTV agent-safe schema | No | Medium | Simple | Log all AI-issued JSON commands with timestamp to VPS; user can review/delete |
| Data minimization: no external CDN analytics | Privacy standard | No | Medium | Simple | Ensure no Google Analytics, Mixpanel, or similar loaded in Tizen app WebView |

---

## 6. UX & Discovery Patterns Not Yet in HermesTV

| Feature | Reference App(s) | HermesTV Has It? | Priority | Complexity | Notes |
|---|---|---|---|---|---|
| Hero banner / featured content row | Netflix, Disney+, Plex | No | High | Simple | Full-width top row with autoplay background; promotes featured/new content |
| "What's New" / Recently Added row | Plex, Emby, Jellyfin | No | Medium | Simple | Shows recently added VoD or new EPG events |
| Genre / mood browse rows | Netflix, Disney+, Prime Video | No | Medium | Simple | Horizontal carousels per genre: Action, Comedy, Documentary, Kids |
| Deep-link from EPG to playback | TiviMate, Channels DVR | No | High | Simple | Press OK on current programme in EPG → immediately begins playback |
| Programme countdown / "On now" indicator | TiviMate, Channels DVR | No | High | Simple | Progress bar in channel tile showing how far through current programme |
| Notification / reminder for programme | Channels DVR, TiviMate | No | Low | Medium | Set reminder from EPG; on-screen overlay when programme is about to start |
| Portrait artwork mode (movie posters) | Plex, Emby, Netflix | No | Medium | Simple | VoD tiles show portrait poster; IPTV channels show landscape logo |
| Keyboard input for search | All apps | No | High | Simple | On-screen keyboard or Bluetooth keyboard support for channel/content search |
| Recently searched terms | Netflix, Prime Video | No | Low | Simple | Quick-access list of prior search queries |
| Content detail screen | Plex, Emby, Netflix | No | High | Medium | Full-screen info card: synopsis, cast, genre, related, play button |

---

## TOP 20 SOTA Features HermesTV Should Add

Ranked by combined priority, achievability on Tizen, and household impact.

| Rank | Feature | Category | Priority | Complexity | Rationale |
|---|---|---|---|---|---|
| 1 | **Full-grid EPG with 7-day guide** | IPTV | High | Complex | Most requested IPTV feature; Dispatcharr/Threadfin already on VPS; biggest competitive gap |
| 2 | **Stream fallback chain (backup URLs)** | IPTV / Reliability | High | Medium | Single biggest reliability improvement; auto-retry alternate sources on failure |
| 3 | **Stream health watchdog + exponential backoff retry** | Performance | High | Simple | Detect stall, auto-retry with backoff; prevents "black screen forever" experience |
| 4 | **Continue watching row + resume playback** | VoD / UX | High | Medium | Jellyfin on VPS can provide position sync; front-end row display is straightforward |
| 5 | **Skeleton loading screens** | Performance / UX | High | Simple | Eliminates blank-screen flash on launch; shimmer tiles load instantly |
| 6 | **Channel search and real-time filter** | IPTV / UX | High | Simple | Type to filter channel list; essential for large M3U playlists |
| 7 | **Custom channel grouping / favorites** | IPTV | High | Simple | User-created groups beyond M3U provider groups; star-to-favorite |
| 8 | **Channel logo display in list and EPG** | IPTV / UX | High | Simple | M3U/XMLTV logos already available; cache and render in channel tiles |
| 9 | **User profiles with avatars** | UX / Privacy | High | Medium | Separate Dave and Mom experiences; Jellyfin already supports multi-user |
| 10 | **Skip Intro / Skip Credits button** | VoD / UX | High | Medium | Jellyfin plugin detects boundaries; huge quality-of-life for VoD watching |
| 11 | **Lazy-load startup + localStorage spec caching** | Performance | High | Medium | Cold launch under 2s; cache TV model/tier detection; load only home screen at start |
| 12 | **Per-tier animation budget enforcement** | Performance | High | Simple | QN tier gets full animations; UN tier disables non-essential CSS transitions |
| 13 | **Hero banner / featured content row** | UX | High | Simple | Full-width top card with background video or image; anchors the home screen |
| 14 | **Offline / degraded mode UI** | Reliability | Medium | Simple | Graceful banner when VPS unreachable; show cached data; disable broken features |
| 15 | **On-screen keyboard for search** | UX | High | Simple | D-pad navigable keyboard overlay; prerequisite for channel search feature |
| 16 | **Watch history clear per profile** | Privacy | High | Simple | Per-user delete of individual items or full wipe; privacy control |
| 17 | **"On now" programme progress bar in channel tiles** | IPTV / UX | High | Simple | Visual indicator of current programme progress within each channel tile |
| 18 | **Parental controls / content rating PIN** | Family / UX | High | Medium | Per-profile content rating ceiling + PIN lock; essential for mixed household |
| 19 | **AI natural language search (VPS-backed)** | AI | High | Complex | Leverage Open WebUI/Ollama already on VPS; "find me a thriller from the 80s" |
| 20 | **Generative content summaries for EPG gaps** | AI | Medium | Medium | LLM fills in missing EPG synopsis; enriches guide data with zero extra data sources |

---

## Implementation Notes for HermesTV Architecture

### What already exists to build on
- **Jellyfin on VPS** → Provides continue-watching API, multi-user profiles, parental controls, skip-intro plugin support, zero telemetry
- **Dispatcharr + Threadfin on VPS** → XMLTV/M3U normalization ready for EPG front-end rendering
- **Open WebUI / Ollama on VPS** → AI search and summarization backend already deployed
- **QN/UN tier detection** → Performance budget framework already in place; extend with animation enforcement
- **Agent-safe JSON schema** → AI commands can drive profile switching, EPG navigation, search

### Tizen-specific constraints to respect
- Tizen WebView is Chromium-based but memory-constrained; do not load EPG grid and player simultaneously
- Samsung AVPlay API natively supports HLS/DASH ABR switching; pass multi-bitrate manifests not single URLs
- Samsung ACR (Automatic Content Recognition) is a platform feature; advise user to disable it in TV settings — HermesTV cannot control it programmatically
- PiP on Tizen is available via the AVPlay API but limited to specific models; QN85 supports it, UN55CU8000 may not

### Phasing recommendation
- **Phase 1 (Quick wins):** Skeleton loading, channel search, favorites, channel logos, stream fallback, watchdog retry, hero banner, "on now" progress bar, watch history clear, localStorage caching
- **Phase 2 (Medium lift):** EPG grid renderer, continue watching, user profiles, parental PIN, skip intro integration, offline mode
- **Phase 3 (Complex/AI):** Natural language search, generative EPG summaries, catch-up TV, timeshift buffer, PiP multi-view

---

## Conclusion — What Contracts Can and Cannot Rely On

**What contracts CAN rely on:**
- All feature tables in Sections 1–6 list publicly observable features from named streaming apps. The features attributed to Netflix, TiviMate, Jellyfin, etc. are verifiable through published product pages, app store descriptions, or the open-source repos referenced.
- The phasing recommendation (Phase 1/2/3) is a sound engineering prioritization. Skeleton loading, channel search, stream watchdog, and stream fallback are all achievable in Phase 1 with no backend dependency changes.
- Jellyfin's `Resume`, `NextUp`, and `Latest` APIs are documented at api.jellyfin.org and are stable endpoints. Contracts referencing these can proceed.
- The "Per-tier animation budget" approach is correct and already detected via the QN/UN capability detection from agent-02.
- PiP on Tizen: the note "QN85 supports it, UN55CU8000 may not" is directionally correct but NEEDS VERIFICATION — do not commit PiP as a feature for either TV until on-device AVPlay PiP testing is done.
- Samsung ACR: HermesTV cannot disable it programmatically — this is correct. Informing the user is the only option.

**What contracts CANNOT rely on (needs verification):**
- The Samsung Vision AI Companion / Perplexity bundling claim (Section 3) is based on a single Samsung Newsroom article. Do not design HermesTV around Perplexity integration as a platform feature — it may be region/model locked.
- "QN85 supports PiP" — NEEDS VERIFICATION per agent-02. PiP requires multiple AVPlay instances; on-device memory testing required.
- LL-HLS support from Tunarr/Threadfin — requires server-side configuration that has not been tested. Do not commit LL-HLS as a v1 feature.

---

## Sources Consulted

- [TiviMate Review 2026 — Features, Pricing & Best Alternatives | Lit IPTV](https://litiptv.com/blog/tivimate-review-guide)
- [Best IPTV Apps 2026 — Smarters, TiviMate & More | IPTVStorm](https://iptvstorm.com/blog/best-iptv-apps-2026/)
- [AI-Driven Evolution of Netflix Personalization in 2026 | Times of AI](https://www.timesofai.com/industry-insights/ai-in-netflix-personalization/)
- [ContentWise Unveils Next-Gen AI-Powered Semantic Search | ContentWise](https://contentwise.com/news/contentwise-unveils-next-gen-ai-semantic-search-personalized-recommendations/)
- [The Future of AI in Video Streaming: Game-Changing Innovations for 2026 | ForaSoft](https://www.forasoft.com/blog/article/future-of-ai-video-streaming)
- [Samsung Redefines AI Search on Smart TVs With a Smarter Bixby | Samsung Newsroom](https://news.samsung.com/global/samsung-redefines-ai-search-on-smart-tvs-with-a-smarter-bixby-voice-assistant)
- [Samsung Vision AI Smart TVs | Samsung US](https://www.samsung.com/us/tvs/vision-ai-tv/)
- [Launch Time Optimization | Samsung Developer](https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/launch-time-optimization.html)
- [Adaptive Streaming | Samsung Developer](https://developer.samsung.com/smarttv/develop/guides/multimedia/adaptive-streaming.html)
- [Tizen App Performance Optimization | Oxagile](https://www.oxagile.com/article/tizen-tv-app-performance-optimization/)
- [Jellyfin Multi-User Setup: Permissions, Parental Controls | JellyWatch 2026](https://jellywatch.app/blog/jellyfin-multi-user-parental-controls-guide-2026)
- [Jellyfin vs Plex vs Emby: The Ultimate 2026 Comparison | EasyHTPC](https://easyhtpc.com/posts/03-jellyfin-plex-emby-comparison/)
- [IPTV with Catch Up Feature: Complete 2026 Guide | Smartersing](https://smartersing.com/iptv-with-catch-up-feature/)
- [Hulu Skip Intro Automatically: AI for Streaming Convenience | ReelMind](https://reelmind.ai/blog/hulu-skip-intro-automatically-ai-for-streaming-convenience)
- [Skip Intro at Scale: How I Built Netflix's Missing Feature | AI Advances](https://ai.gopubby.com/skip-intro-at-scale-how-i-built-netflixs-missing-feature-for-0-30-per-movie-12ef196bc3d8)
- [Adaptive Bitrate Streaming: What it Is and How the ABR Algorithm Works 2026 | DaCast](https://www.dacast.com/blog/adaptive-bitrate-streaming/)
- [Private Streaming Apps 2026: Watch Anonymously | LaMamaOca](https://lamamaoca.com/privacy-tools/stream-in-secret-top-privacy-focused-apps-for-anonymous-entertainment-in-2026)
- [New Apple TV 4K adding AI might look like this Netflix feature | 9to5Mac](https://9to5mac.com/2026/05/07/new-apple-tv-4k-adding-ai-might-look-like-this-netflix-feature/)
- [Netflix Parental Controls (2026): Profiles, PINs & Ratings | Canopy](https://canopy.us/blog/netflix-parental-control/)
- [Top 15 IPTV Players for Android TV/Fire TV/PC (May 2026) | TroyPoint](https://troypoint.com/top-iptv-players/)

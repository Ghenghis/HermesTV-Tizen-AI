# Reference Apps — UX Pattern Audit

Curated from https://github.com/iptv-org/awesome-iptv — categorized by platform relevance and UX pattern value for HermesTV Tizen design.

---

## Samsung TV (Tizen / WebOS) Relevant

### SS IPTV (WebOS / Tizen)
- Native Samsung channel-style UI; mimics the built-in Samsung TV guide aesthetic
- Relevant pattern: Channel list sidebar with live preview; familiar to Samsung TV users
- Limitation: No per-user profiles, no AI layer, no credential vault

### M3U IPTV (WebOS)
- Minimal player with direct M3U URL input
- Relevant pattern: Simplicity — good reference for "what a TV player does at minimum" baseline
- Limitation: No EPG, no profile management, no backend mediation

### Jellyfin (all platforms, including Samsung TV via web app)
- Already in HermesTV stack as the media server backend
- Relevant pattern: EPG grid, Live TV channel switching, recording management UI
- HermesTV wraps and extends Jellyfin's backend; the Tizen app does not embed Jellyfin's own frontend

---

## Best-in-Class EPG Patterns

### TiviMate (Android TV)
- Gold standard TV EPG grid in the IPTV space
- Key patterns: Time-proportional programme blocks in the grid; smooth horizontal scrolling; "now and next" fast-access strip at bottom; category filter tabs above grid
- HermesTV EPG grid target: match TiviMate-level time-proportional block rendering on the QN-class display

### IPTV Smarters Player (Android / iOS / TV)
- Multi-provider management UI — manages credentials for multiple Xtream Codes providers in one app
- Key patterns: Provider switcher at top level; per-provider channel list; VOD and Series separated from Live
- HermesTV handles this at the backend (Dispatcharr merges providers) rather than exposing it in UI — but the category navigation model is a good reference

### Kodi (all platforms)
- Plugin ecosystem reference; PVR Live TV addon (pvr.iptvsimple) is widely deployed
- Key patterns: Guide XML integration, recordings UI, group filter drawer
- HermesTV is a more focused, less extensible product — Kodi referenced for EPG interaction patterns, not plugin architecture

---

## Quality Badge and Stream Stats Inspiration

### IPTVnator (web player)
- Web-based IPTV player with stream quality display alongside player
- Key pattern: Stream URL resolution status badge; quality indicator in channel list item
- HermesTV channel cards should show quality badge (4K / FHD / HD) — IPTVnator's implementation is a visual reference

### VLC (all platforms)
- Stream stats overlay: bitrate, codec, resolution, dropped frames
- Key pattern: Codec/bitrate overlay toggled with a key — useful for Hermes dev mode diagnostics
- HermesTV: consider hidden dev overlay for Hermes agent diagnostics (not shown to Sherri/Dave in normal use)

---

## HermesTV Advantage Over All Reference Apps

HermesTV delivers capabilities no reference app above provides:

| Capability | HermesTV | Any reference app |
|---|---|---|
| Per-user profiles | Yes — Dave and Sherri, separate preferences, parental controls, history | No |
| AI chatbot overlay | Yes — Hermes agent, Azure TTS voice, natural language channel search | No |
| Backend-mediated credentials | Yes — credentials never on TV, all auth in backend vault | No (all store creds on device) |
| QR onboarding flow | Yes — scan QR to pair TV to account, no keyboard input required | No |
| Azure TTS voice feedback | Yes — Hermes speaks channel info, errors, confirmations via Azure TTS | No |
| QN-class QLED optimized UI | Yes — layout tuned for QN85/QN95 85"/95" display geometry and brightness | No |
| Dispatcharr stable IDs | Yes — provider churn doesn't break saved channels | No |
| Jellyfin backend integration | Yes — EPG, recording, VOD all through Jellyfin | Kodi only (partial) |

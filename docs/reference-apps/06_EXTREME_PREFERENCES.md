---
title: "Reference-App Extraction 06 — Extreme-InfiniTV User-Preferences Schema"
agent: 07 of 20 (DaveTV reference-extraction swarm)
date: 2026-05-20
upstream_repo: G:\Github\IPTV-Apps\Extreme-InfiniTV
upstream_files:
  - src\scripts\lib\preferences.js (per-playlist favorites / progress / category filters / view sort)
  - src\scripts\lib\app-settings.js (global app-wide settings)
upstream_license: GPL-3.0-or-later
adoption_mode: PATTERN-ONLY (schema names + intent re-expressed in prose; zero GPL source copied)
hermes_license: MIT — HermesTV remains MIT. This document captures the *shape* of a settings surface, which is a factual schema, not copyrightable code.
truth_gate: |
  No mocks, no stubs, no placeholders. Every key proposed in the delta must
  be wired to a real handler in profiles.js or settingsStore.js before it
  ships. Empty / unknown profile reads return `{}`, never seeded fake data.
---

# 1. License Boundary

Extreme-InfiniTV is GPL-3.0-or-later. HermesTV is MIT. We adopt only the
**schema vocabulary** (key names, value types, default values, semantic
intent) — never source text. Schema field names are facts about an app's
feature set; the implementations below are written fresh against
DaveTV's existing `settingsStore.js` + `profiles.js` pair.

---

# 2. Extreme-InfiniTV Preference Surface — Full Schema in Prose

Extreme-InfiniTV splits preferences across two stores:

- **Per-playlist preferences** (`preferences.js`) — keyed by `playlistId`,
  one record per active provider. Holds favorites, recents, progress,
  category filters, EPG sync, channel-EPG overrides, favorites ordering,
  watchlist, and view-sort.
- **Global app settings** (`app-settings.js`) — single-tenant key/value
  pairs stored in `localStorage`. Holds UA override, download dir,
  performance flags, player backend selection, retention windows,
  hub-strip layout, Discord RPC, and TV overscan.

The combined surface (47 distinct settable concepts) is organised below
by user-facing category. Defaults and types are given for each.

## 2.1 Playback & Player (global)

- `user_agent_override` — string, default `""`. Sent on upstream HLS
  fetches.
- `player_backend` — enum `artplayer|videojs|mpv|vlc`, default
  `artplayer`.
- `player_path:{mpv,vlc}` — string, default `""` (auto-detect).
- `player_extra_args:{mpv,vlc}` — string[], default `[]`.
- `player_reuse_instance:{mpv,vlc}` — boolean, default `false`.
- `download_concurrency` — int 1..4, default `1`.
- `download_dir` — string, default `""`.

## 2.2 Display & Theme (global)

- `tv_overscan_pct` — float in {0,2,4,6,8}, default `0`. Mirrored to a
  CSS custom property.
- `perf_mode` — boolean, default `false`. Disables decorative
  animations for low-end WebViews.
- `hub_strips` — string[] from a 12-item catalog, default
  `["continue-watching","favorites","watchlist","recently-added"]`.

## 2.3 Provider Behavior (per playlist)

- `hidden_categories_{live,vod,series,epg}` — Set<string>, default empty.
- `allowed_categories_{live,vod,series,epg}` — Set<string>, default empty.
- `category_mode_{live,vod,series,epg}` — enum `hide|select`, default
  `hide`.
- `sync_epg_with_live` — boolean, default `true`. When on, EPG consults
  Live TV's category filter.
- `favorites_{live,vod,series}` — Set<number>, default empty.
- `favorites_meta_{live,vod,series}` — Map<id,{name,logo}>, sidecar for
  cross-playlist render.
- `favorites_order_{live,vod,series}` — int[], default empty (manual).
- `watchlist_{vod,series}` — Map<id,{ts,name,logo}>, save-for-later
  (live excluded — ephemeral).
- `channel_epg_overrides` — Map<channelId, tvg-id>, manual EPG mapping.

## 2.4 Continue-Watching / Progress

- `progress_retention_days` — enum 30|90|180|0, default `90`.
- `progress_vod` — Map<id, {position,duration,updatedAt,completed,
  name,logo}>, capped 200.
- `progress_episode` — Map<id, {position,duration,updatedAt,completed,
  seriesId,season,episodeNum,episodeTitle,seriesName,seriesLogo}>,
  capped 200.
- `completed_threshold` — implicit constant `0.95`.

## 2.5 Recently-Played (per playlist, per kind)

- `recents_{live,vod,series}` — Array<{id,name,logo,ts}>, FIFO 30.

## 2.6 View / Sort

- `view_sort.{vod,series}` — enum `default|added|az`, default `default`.

## 2.7 Integrations & Desktop

- `discord_client_id` — string, hard-coded fallback ID.
- `discord_muted_playlists` — Set<string>, per-playlist opt-out.
- `close_to_tray` — boolean, default `true` (desktop only).

---

# 3. DaveTV Today — Existing Profile / Settings Surface

DaveTV exposes two persistence layers:

- `services\hermes-tv-api\src\routes\profiles.js` — in-memory per-profile
  identity + display tuning. Two profiles: `dave_tv` and `mom_tv`.
  Fields: `display_name`, `agent_name`, `agent_voice`,
  `preferred_voice_id`, `font_scale`, `audio_feedback`,
  `reduced_motion`, `active_theme`, `active_layout`, `nickname`,
  `avatar_emoji`, `tier_override`, `display_size_inches`,
  `quality_preference { resolution_floor, prefer_4k, hdr_preferred,
  bitrate_floor_kbps }`. Protected (PATCH-rejected): `profile_id`,
  `tv_model`, `tier`, `mom_mode`.
- `services\hermes-tv-api\src\lib\settingsStore.js` — file-backed JSON at
  `HERMES_SETTINGS_STORE` (default `/var/lib/hermestv/settings.json`).
  Atomic writes via tmp+rename. Default per-profile keys today:
  `font_scale`, `reduced_motion`, `active_layout`, `audio_feedback`,
  `preferred_provider`. Deep-merges patches; never throws.

The Mom-Mode floor (`font_scale >= 1.25`) is enforced in profiles.js and
must remain enforced for any new font-related delta.

---

# 4. Gap Analysis — What DaveTV Is Missing

| Area | Extreme has | DaveTV has | Gap |
| --- | --- | --- | --- |
| Per-provider favorites | yes (per-playlist + cross-playlist union) | no | **Missing** |
| Watchlist (save-for-later) | yes, separate from favorites | no | **Missing** |
| Continue-watching / progress | yes, retention + cap + completion threshold | no | **Missing** |
| Recents | yes, FIFO 30 per kind | no | **Missing** |
| Category hide / allow / mode | yes, 4 kinds | no | **Missing** |
| Channel EPG override (manual tvg-id) | yes | no | **Missing** |
| Favorites manual ordering | yes | no | **Missing** |
| View-sort (added / az) | yes | no | **Missing** |
| User-Agent override (per session) | global | no | **Missing** |
| Preferred audio / subtitle lang | not in this file | no | Missing both sides |
| Subtitle font-size | not present | no | Missing both sides |
| Default volume / autoplay-next | not present | no | Missing both sides |
| Performance mode | yes | no | **Missing** |
| TV overscan | yes | no | **Missing** |
| Progress retention window | yes (30/90/180/0) | no | **Missing** |
| EPG sync-with-live toggle | yes | no | **Missing** |
| Theme selector | implicit via CSS | `active_theme` exists | No enum / catalog |
| Channel-number visibility | not present | no | Missing both sides |
| EPG timeshift hours | not present | no | Missing both sides |
| Max-retries (provider) | not in this file | no | Missing both sides |

Top-3 missing: (1) per-provider favorites + watchlist + progress (the
QN85 "Continue Watching" rail depends on these); (2) category hide /
allow / mode (IPTV catalogs ship thousands of raw categories);
(3) preferred audio + subtitle language + subtitle font-scale (Mom-Mode
captions — Extreme does NOT supply, so DaveTV must originate).

---

# 5. Recommended Schema Delta for DaveTV `settingsStore.js`

Add the following keys under each profile's settings object. All keys are
PATCH-able through `/api/profiles/:id` once the allowlist is extended.

## 5.1 Playback

```
playback: {
  preferred_audio_lang: string         // ISO 639-2; default "eng"
  preferred_subtitle_lang: string      // ISO 639-2; default "off"
  subtitle_font_scale: number          // 1.0..2.5; default 1.0 (mom_tv: 1.4)
  default_volume: number               // 0..1; default 0.8
  autoplay_next_episode: boolean       // default true
  resume_threshold_seconds: number     // default 30
}
```

## 5.2 Display

```
display: {
  density: enum ("compact"|"standard"|"jumbo")  // default standard
  show_channel_numbers: boolean                 // default true
  tv_overscan_pct: number                       // 0..8; default 0
  perf_mode: boolean                            // default false
}
```

## 5.3 Provider Behavior (per provider, nested under provider id)

```
providers: {
  "<provider_id>": {
    favorites_only: boolean             // default false
    hidden_categories: string[]         // default []
    allowed_categories: string[]        // default []
    category_mode: enum ("hide"|"select")  // default "hide"
    channel_order: enum ("default"|"alpha"|"manual")  // default "default"
    channel_epg_overrides: { [channelId: string]: string }  // tvg-id map
  }
}
```

## 5.4 EPG

```
epg: {
  timeshift_hours: number       // -12..12; default 0
  default_day_offset: number    // 0..6; default 0 (today)
  sync_with_live: boolean       // default true
}
```

## 5.5 Advanced

```
advanced: {
  user_agent_override: string   // default ""
  referer_override: string      // default ""
  max_retries: number           // 0..5; default 2
  progress_retention_days: enum (30|90|180|0)  // default 90
}
```

## 5.6 Continue-Watching / Watchlist / Favorites

These three are LIST data, not scalar settings. They belong in a sibling
file (`/var/lib/hermestv/library.json`) keyed by profile_id, with the
same atomic-write + memory-cache pattern as `settingsStore.js`:

```
library: {
  "<profile_id>": {
    favorites: { live: number[], vod: number[], series: number[] }
    watchlist: { vod: { [id]: { ts, name, logo } },
                 series: { [id]: { ts, name, logo } } }
    progress: { vod: { [id]: ProgressEntry },
                episode: { [id]: ProgressEntry } }
    recents: { live: RecentEntry[], vod: RecentEntry[], series: RecentEntry[] }
  }
}
```

## 5.7 Required PATCH-allowlist additions to profiles.js

Append to `PATCHABLE_FIELDS`: `playback`, `display`, `providers`, `epg`,
`advanced`. The handler must shallow-merge nested objects (already does)
and re-validate the Mom-Mode floor when `playback.subtitle_font_scale`
or any new font-related field is touched.

---

# 6. Implementation Notes

- The atomic-write pattern in `settingsStore.js` already fits; only
  `DEFAULT_PROFILE_SETTINGS` and the PATCH allowlist need extending.
- Library data MUST live in a separate file (`library.json`) to avoid
  bloating the read-on-every-PATCH settings file.
- "No mocks, no stubs" — every new key needs a real reader before
  merge. Land order: playback → display → providers → epg → advanced
  → library.
- Mom Mode floor: when defaulting `mom_tv`, set `subtitle_font_scale`
  >= 1.25 and `density` = `"jumbo"`. Reject PATCHes that drop below.

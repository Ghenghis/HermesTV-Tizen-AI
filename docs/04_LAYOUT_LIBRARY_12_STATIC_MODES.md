# 04 — Layout Library: 12 Static Modes

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for the 12 static layout presets the HermesTV Tizen app must ship. It is the design lock referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` (R1) and `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md`.

## Hard rules

1. There are exactly **12 named static layout presets**. No more in v1. Custom variants are parameter overlays on top of a preset, never new presets.
2. Every preset must run on the **performance floor**: Dave's `UN55CU8000BXZA`. If a preset cannot run there, it is cut from v1.
3. Mom's `QN85Q7FAAFXZA` (higher-end class) **automatically receives enhanced rendering** for any preset once runtime capability detection passes. Enabled automatically after capability proof — no manual action needed to promote. QN-class TVs must not be artificially capped to UN/baseline mode unless the user explicitly chooses Battery, Quiet, Reduced Motion, or Safe Mode, or a measured runtime health condition requires temporary protection (memory pressure, thermal slowdown, repeated frame-budget failure, playback instability). Any protective reduction must include a visible reason, a timeout or restore path, and automatic rollback when the condition clears. Agents cannot permanently downgrade QN-class TVs — they may only suggest temporary protective adjustments with visible reason, timeout, rollback, and user override.
4. Every preset must declare a complete focus order that a Samsung TV remote (D-pad + OK + Back) can traverse without traps.
5. Every preset must declare Dave Mode and Mom Mode variants (font scale, density, ring intensity, animation density).
6. Layout state changes only through the safe JSON command router in `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`.
7. Dark-first. TV-distance readable. Overscan-safe (5% safe-area padding minimum, configurable).
8. No layout may depend on multi-stream live playback. One primary active stream only. Previews come from the backend (`docs/02A_GROK_COMPATIBILITY_INPUT_REVIEW.md`).

## Performance tier model

Two automatic tiers. The app picks one at boot from runtime detection — never from a user setting.

| Tier | Floor target | Enhanced target | Auto-applies when |
|---|---|---|---|
| `baseline` | Dave `UN55CU8000BXZA` (CU8000 / Crystal UHD class) | — | Default for any TV that does not match the enhanced gate |
| `enhanced` | — | Any `QN`-prefix Samsung TV (QLED / Neo QLED / premium lines — `QN85Q7FAAFXZA`, `QN95Q7FAAFXZA`, and all comparable `QN`-class models). Default to enhanced/premium; must not be artificially capped to baseline mode. | Model prefix is `QN` (fast-path) AND AVPlay HLS available AND frame-budget probe passes (0 dropped frames) AND memory headroom probe passes. `UN`-prefix TVs are always baseline regardless of probe results. |

Enhancement deltas applied automatically in `enhanced` tier:

- larger image cache (poster/preview)
- richer background pack (motion + cinematic ambient permitted)
- denser grid presets allowed (up to 8-wide)
- smoother focus ring transitions (longer easing window, parallax permitted)
- richer chatbot overlay (translucent blur, larger card)
- larger preview clip cache window

Baseline tier always uses: solid or static-gradient background, static focus ring, ≤ 6-wide grid, no parallax, no motion backgrounds, smaller cache.

## Preset schema

Every preset is declared in `schemas/layouts/<preset_id>.json` with this shape:

```json
{
  "preset_id": "classic_cable_grid",
  "version": "1.0.0",
  "name": "Classic Cable Grid",
  "intent": "Familiar 4-up channel grid for live IPTV browsing.",
  "tier_floor": "baseline",
  "grid": { "columns": 4, "rows": 3, "card_shape": "rounded_16_9" },
  "regions": ["top_bar", "side_nav", "main_grid", "now_playing_strip"],
  "focus_order": ["side_nav", "main_grid", "now_playing_strip", "top_bar"],
  "safe_area_pct": 5,
  "animation_density_default": "low",
  "dave_variant": {
    "font_scale": 1.0,
    "tile_density": "medium",
    "focus_ring": "static_thick",
    "animation_density": "low"
  },
  "mom_variant": {
    "font_scale": 1.35,
    "tile_density": "large",
    "focus_ring": "static_thick_high_contrast",
    "animation_density": "off",
    "audio_feedback": true
  },
  "enhanced_overrides": {
    "animation_density": "medium",
    "focus_ring": "animated_glow",
    "background_pack_default": "ambient_motion_01"
  },
  "proof_required": ["screenshot_dave", "screenshot_mom", "focus_traversal_log", "frame_budget_proof"]
}
```

The router must reject any layout state that does not validate against this schema.

## The 12 presets

The columns "Tier floor" / "Mom auto-enhance" apply per rule 3 above: every preset's baseline must work on Dave's TV; presets marked `auto` upgrade visuals automatically when the enhanced tier is detected (Mom's TV).

| # | preset_id | Name | Intent | Tier floor | Mom auto-enhance | Default for |
|---|---|---|---|---|---|---|
| 1 | `classic_cable_grid` | Classic Cable Grid | Familiar 4-up live channel grid | baseline | auto | Dave default |
| 2 | `mom_jumbo_rail` | Mom Jumbo Rail | Giant tiles on a single horizontal rail, senior-friendly | baseline | auto | Mom Mode default |
| 3 | `live_focus` | Live Focus | One big now-playing tile with channel rail | baseline | auto | Casual viewing |
| 4 | `epg_strip` | EPG Strip | Horizontal time-grid EPG with mini preview pane | baseline | auto | Schedule browsing |
| 5 | `category_carousels` | Category Carousels | Stacked horizontal category rows | baseline | auto | Discovery |
| 6 | `provider_dashboard` | Provider Dashboard | Grouped by provider with quality bars | baseline | auto | Multi-provider households |
| 7 | `favorite_quick_dial` | Favorite Quick Dial | 12 oversized favorite tiles | baseline | auto | One-tap regulars |
| 8 | `recents_resume` | Recents & Resume | Resume rail + recent activity rail | baseline | auto | Returning viewers |
| 9 | `discovery_walls` | Discovery Walls | Dense poster wall with filters | enhanced-preferred | auto (baseline allowed at 4-wide) | VOD/series browsing |
| 10 | `cinematic_hero` | Cinematic Hero | Big hero with rotating preview + small rails | enhanced-preferred | auto (baseline shows static hero) | Showcase mode |
| 11 | `minimal_player` | Minimal Player | Full-bleed player with thin overlay rail | baseline | auto | Long viewing sessions |
| 12 | `ambient_idle` | Ambient Idle | Screensaver/idle with quiet rotating preview and clock | baseline | auto (motion in enhanced, static in baseline) | Idle / between sessions |

### 1. `classic_cable_grid`

```text
+--------------------------------------------------------------+
| top_bar: search · profile · clock · provider · quality      |
+----+---------------------------------------------------+-----+
|side|  [tile][tile][tile][tile]                         |     |
|nav |  [tile][tile][tile][tile]                         |     |
|    |  [tile][tile][tile][tile]                         |     |
+----+---------------------------------------------------+-----+
| now_playing_strip: chan · title · progress · quality badge   |
+--------------------------------------------------------------+
```

- Grid: 4×3 (baseline). Enhanced may render 5×3 if frame budget proves clean.
- Focus order: `side_nav → main_grid (row-major) → now_playing_strip → top_bar`.
- Card shape: rounded 16:9 with channel logo overlay top-left, quality badge top-right.

### 2. `mom_jumbo_rail`

```text
+--------------------------------------------------------------+
| top_bar (large): clock · profile (Mom) · big mic · big home |
+--------------------------------------------------------------+
|                                                              |
|   [   HUGE TILE   ][   HUGE TILE   ][   HUGE TILE   ]        |
|                                                              |
+--------------------------------------------------------------+
| help_strip: "Press OK to watch. Press back to go home."      |
+--------------------------------------------------------------+
```

- Single rail. 3 tiles visible. Tile density `xl`. Font scale ≥ 1.35.
- Audio feedback on. Reduced motion default on. High contrast default on.
- Focus order: `top_bar → main_rail (linear) → help_strip → top_bar`.
- Default for `mom_tv` profile. Never auto-switched away from Mom Mode by an agent without explicit user confirm.

### 3. `live_focus`

```text
+--------------------------------------------------------------+
| top_bar                                                      |
+----------------------------------+---------------------------+
|                                  | [chan]                    |
|         NOW PLAYING              | [chan]                    |
|        (primary stream)          | [chan]   channel rail     |
|                                  | [chan]                    |
+----------------------------------+---------------------------+
| controls: chan- · chan+ · info · quality · cc · audio        |
+--------------------------------------------------------------+
```

- Live preview is the active player, not a thumbnail. One primary stream only.
- Channel rail right-side. Press right to surf without leaving player.
- Focus order: `now_playing → channel_rail → controls → top_bar`.

### 4. `epg_strip`

```text
+--------------------------------------------------------------+
| top_bar  +  time_header: 8p  830  9p  930  10p  1030         |
+----+---------------------------------------------------+-----+
|ch1 | [program block][program block][program block]     |     |
|ch2 | [program block][program block][program block]     |     |
|ch3 | [program block][program block][program block]     |mini |
|ch4 | [program block][program block][program block]     |prev |
+----+---------------------------------------------------+-----+
| info: selected program description · record? · remind me     |
+--------------------------------------------------------------+
```

- EPG cleaned/normalized by backend (`docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md` already gates HLS; EPG comes from XMLTV).
- Mini-preview pane on the right shows backend-generated thumbnail or short cached clip (never a live decode of a non-active channel).
- Focus order: `time_header → channel_column → epg_blocks → mini_prev → info`.

### 5. `category_carousels`

```text
+--------------------------------------------------------------+
| top_bar                                                      |
+--------------------------------------------------------------+
| Live News        [><][><][><][><][><][><]                    |
| Sports           [><][><][><][><][><][><]                    |
| Movies           [><][><][><][><][><][><]                    |
| Kids             [><][><][><][><][><][><]                    |
+--------------------------------------------------------------+
```

- 4–6 visible category rows. Each row scrolls horizontally on left/right. Up/down moves between rows.
- Card shape switchable per row: 16:9 for live, 2:3 for VOD.

### 6. `provider_dashboard`

```text
+--------------------------------------------------------------+
| top_bar                                                      |
+--------------------------------------------------------------+
| Provider A   ████████ 87% healthy · 142 channels · 720p+    |
|   [tile][tile][tile][tile][tile][tile]                      |
| Provider B   █████░░░ 62% healthy · 88 channels · 1080p+    |
|   [tile][tile][tile][tile][tile][tile]                      |
+--------------------------------------------------------------+
```

- Each provider row shows live health (from quality scanner), channel count, dominant quality.
- Tiles inside show per-channel quality badges.

### 7. `favorite_quick_dial`

```text
+--------------------------------------------------------------+
|  [BIG][BIG][BIG][BIG]                                        |
|  [BIG][BIG][BIG][BIG]                                        |
|  [BIG][BIG][BIG][BIG]                                        |
+--------------------------------------------------------------+
```

- 12 large favorite tiles. 4×3. No sidebar. No top bar by default (toggle with up).
- Per-profile favorites. Long-press OK = remove/edit slot via confirm modal.

### 8. `recents_resume`

```text
+--------------------------------------------------------------+
| top_bar                                                      |
+--------------------------------------------------------------+
| Resume Watching   [resumable][resumable][resumable]          |
| Recently Played   [recent][recent][recent][recent]           |
| Suggested Next    [suggest][suggest][suggest][suggest]       |
+--------------------------------------------------------------+
```

- Resume cards show progress bar and remaining time.
- Suggested Next comes from memory agent (`agent 14`) only; never from external API in the TV app.

### 9. `discovery_walls`

```text
+--------------------------------------------------------------+
| top_bar  + filter chips: [Genre] [Year] [Quality] [Provider] |
+--------------------------------------------------------------+
|  [P][P][P][P][P][P]                                          |
|  [P][P][P][P][P][P]   (P = 2:3 poster)                       |
|  [P][P][P][P][P][P]                                          |
|  [P][P][P][P][P][P]                                          |
+--------------------------------------------------------------+
```

- Baseline tier renders at 4-wide poster grid. Enhanced tier auto-bumps to 6-wide.
- Filter chips operate via safe JSON command router only.

### 10. `cinematic_hero`

```text
+--------------------------------------------------------------+
|                                                              |
|     [ HERO IMAGE / SHORT PREVIEW CLIP — backend cached ]     |
|     title · meta · "Watch" "More info" "Add to favs"         |
|                                                              |
+--------------------------------------------------------------+
| Continue Watching  [rail][rail][rail][rail]                  |
| Tonight on Live    [rail][rail][rail][rail]                  |
+--------------------------------------------------------------+
```

- Enhanced tier: hero auto-rotates with short cached preview clips and smooth crossfade.
- Baseline tier: hero is a static poster + ken-burns-disabled. No rotation animation. Title block still rotates as text only.

### 11. `minimal_player`

```text
+--------------------------------------------------------------+
|                                                              |
|                                                              |
|              [ FULL-BLEED PRIMARY PLAYER ]                   |
|                                                              |
|                                                              |
+--------------------------------------------------------------+
|  thin overlay rail (auto-hides): chan · title · quality · ⚙  |
+--------------------------------------------------------------+
```

- Overlay rail auto-hides after 4s of remote idle (configurable).
- Floating chatbot collapses to a small dot in this layout unless invoked.

### 12. `ambient_idle`

```text
+--------------------------------------------------------------+
|                          09:42 PM                            |
|                       Tuesday · May 17                       |
|                                                              |
|        [ quiet rotating preview / weather / clock ]          |
|                                                              |
|                  press any key to resume                     |
+--------------------------------------------------------------+
```

- Triggered by idle timeout (default 5 min). Enhanced tier uses gentle motion ambient. Baseline tier uses static gradient with slow clock fade only.
- Burn-in protection: rotate content position every 60s.
- Reduced motion mode disables all motion in this preset on both tiers.

## Focus engine requirements

- Every preset must declare focus regions and a default focus target.
- D-pad up/down/left/right must never trap focus. Pressing in a direction with no neighbor returns to the nearest valid focusable in that direction or to the region's entry point.
- Back always returns to the previous focus region; double-back returns to home.
- Long-press OK is reserved for the per-preset "primary long-press action" (e.g. add favorite, remove slot). The action is declared per preset.
- Focus traversal must be provable from the focus log artifact under `proof/focus-traversal/<preset_id>.json`.

## Dave Mode vs Mom Mode (per-preset overrides)

Both modes are profile-bound and may be additionally overridden by user or by the agent command router with `requires_user_confirm: true` (see `docs/06`).

| Setting | Dave Mode default | Mom Mode default |
|---|---|---|
| Font scale | 1.0 | 1.35 |
| Tile density | medium | large or xl |
| Focus ring | static thick | static thick high-contrast |
| Animation density | low | off |
| Audio feedback | off | on |
| Quality filter | all | ≥ 720p |
| Reduced motion | off | on |
| High contrast | off | on |
| Long-press bindings | preset default | confirm-only |
| Chatbot default position | bottom-right small | bottom-center large |

## Acceptance gates for layout v1

All 12 presets must produce:

1. JSON preset file under `schemas/layouts/<preset_id>.json` that validates.
2. Wireframe screenshot under `proof/wireframes/<preset_id>.png`.
3. On-device screenshot on **both** TVs under `proof/screenshots/<tv_model>/<preset_id>.png`.
4. Focus traversal log under `proof/focus-traversal/<preset_id>.json`.
5. Frame budget proof on Dave's TV under `proof/perf/<preset_id>.dave.json` — must show no dropped frames during scroll, focus moves, and preset transition.
6. Frame budget proof on Mom's TV under `proof/perf/<preset_id>.mom.json` — must show enhanced overrides applied automatically (no manual toggle in the test run).

A preset is not "done" until all six artifacts exist and are referenced from the agent 07 report.

## Settings, updates & performance management — layout surface

### QN vs UN tier rule (binding)

`QN`-prefix Samsung TVs (QLED / Neo QLED / premium lines — `QN85Q7FAAFXZA`, `QN95Q7FAAFXZA`, and all comparable `QN`-class models) **default to enhanced/premium rendering** after verified runtime capability proof. They must not be artificially capped to UN/baseline mode unless the user explicitly chooses Battery, Quiet, Reduced Motion, or Safe Mode, or a measured runtime health condition requires temporary protection (memory pressure, thermal slowdown, repeated frame-budget failure, playback instability). Any temporary reduction must be visible to the user with a reason, must have a timeout or restore path, and must roll back automatically when the condition clears.

Agents cannot permanently downgrade `QN`-class TVs. Agents may only suggest temporary protective adjustments with visible reason, timeout, rollback, and user override.

All non-protective performance caps and low-memory restrictions apply exclusively to `UN`-prefix TVs (Crystal UHD / entry-level lines, including `UN55CU8000BXZA`) and any TV that fails the enhanced capability probe. Users may make personal accessibility choices (Mom Mode, reduced motion, high contrast) on any TV — those are user-driven preferences, not performance restrictions.

### Settings overlay (accessible from any layout)

A modal overlay summoned by long-pressing Home or tapping ⚙ in the chatbot. Not a 13th preset. Tabs (left-rail D-pad navigation):

| Tab | Contents |
|---|---|
| **Profile** | Active profile, switch profile, Mom Mode / Dave Mode toggle (confirm-gated per `docs/06`) |
| **Display** | Layout picker, theme picker, background pack, font scale, tile density, focus ring style, safe area |
| **Performance** | Renderer tier (read-only chip), animation density, background intensity, preview cache size, poster cache size, reduced motion, high contrast. **Low memory mode toggle is shown only on baseline-tier `UN`-prefix TVs — hidden on all QN-class TVs.** |
| **Updates** | Backend build ID, UI bundle version, schema version, last refresh time, soft refresh buttons, rollback button (confirm-gated) |
| **About** | TV model readout (`webapis.productinfo.getModel()`), firmware, AVPlay status, diagnostic export link (`docs/02`) |

Mom Mode forces font scale ≥ 1.35 and audio feedback inside the overlay regardless of the active preset.

### Version display (Updates tab)

| Field | Source |
|---|---|
| Backend build ID | `/v1/build` — polled every 60 s while overlay is open |
| UI bundle version | Bundled at build time (includes git short SHA) |
| Schema version | `schemas/version.json` |
| Last refresh time | Wall-clock of last successful catalog / theme / layout refresh |

### Soft refresh and reload

Three non-destructive operations under the Updates tab — no reinstall, no profile loss:

1. **Soft refresh catalog** — re-pulls catalog/EPG/quality from backend. Backs up current catalog first; on validation failure auto-rolls back with a toast.
2. **Soft refresh theme/layout** — re-pulls theme + layout manifests; validates against `schemas/`; on failure retains current.
3. **Reload app shell** — full app reload without uninstall. Profiles, memories, favorites, watch history, and provider credentials survive (stored on backend / protected storage).

The Tizen app never reboots the TV.

### Low-memory mode — `UN`-prefix TVs only

Auto-on at boot on `UN`-prefix TVs (baseline tier). Never present on `QN`-prefix TVs. Effects when active:

- Tile density capped at `medium` even if the preset variant requests `large`.
- Preview clips replaced by static thumbnails.
- `discovery_walls` capped at 4-wide.
- `cinematic_hero` degrades to static hero (no rotation).
- `ambient_idle` degrades to static idle screen (no motion).
- Focus ring forced to `static_thick`.

### Proof gates added for this contract

1. **Update propagation:** push a small layout change (e.g., rail reorder) to the backend; confirm both TVs reflect it within one soft-refresh cycle. Artifact: `proof/update-propagation/<id>/{dave,mom}.png` + `timeline.json`.
2. **Dave 30-min responsiveness:** 30-minute session on `UN55CU8000BXZA` across 4 presets and 10 channel changes; frame budget must not degrade vs. first 5 minutes. Artifact: `proof/perf/dave-30min/<session_id>.json`.
3. **QN non-limiting proof:** 30-minute session on a `QN`-class TV shows `renderer_tier: "enhanced"` throughout, no `low_memory_mode` event, full enhanced cache budgets, no system-imposed downgrade. Artifact: `proof/perf/qn-30min/<session_id>.json`.
4. **Rollback restores prior layout:** push a broken layout JSON; validator rejects it; previous layout remains active. Artifact: `proof/rollback/<id>.json`.
5. **Cache clear non-destructiveness:** clear UI cache and catalog cache; assert profiles, favorites, watch history, layout presets, and theme defaults are byte-identical before and after. Artifact: `proof/cache-clear/layout/{before,after,diff}.json`.

## Out of scope for v1

- True multi-stream live grids (no 4/8/16 live decodes).
- Picture-in-picture across presets (only allowed as an experiment after proof per `docs/02A_GROK_COMPATIBILITY_INPUT_REVIEW.md`).
- User-created custom presets (parameter overlays only).
- Layouts that require a pointer/cursor input model (TV is remote-first).

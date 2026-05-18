# 05 — Theme & Background Engine Contract

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for the theme system (24 themes) and background engine (12 background packs) referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` (R1) and `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md`.

## Hard rules

1. Ship exactly **24 themes** and **12 background packs** in v1. All themes work on every layout preset from `docs/04_LAYOUT_LIBRARY_12_STATIC_MODES.md`.
2. Dark-first. TV-distance readable. Overscan-safe. WCAG AA contrast minimums.
3. **Performance tier is detected at boot. Mom's `QN85Q7FAAFXZA` automatically receives the enhanced renderer.** No user toggle. No manual opt-in. Dave's `UN55CU8000BXZA` stays on baseline.
4. Every theme must declare a complete token set. No hard-coded colors anywhere in app code.
5. Every background pack must declare a `tier_required` field and degrade gracefully on baseline.
6. Burn-in protection is always on. Even baseline tier rotates static elements.
7. Reduced-motion mode replaces all motion backgrounds with a static representative frame.
8. High-contrast mode replaces theme tokens with the matching `*_high_contrast` companion token set.
9. Theme/background state changes only through the safe JSON command router in `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`.

## Performance tier (mirrors `docs/04`)

The same boot-time detection that picks layout tier picks renderer tier. One decision, applied to both engines.

| Tier | Auto-applies to | Background packs allowed | Animation budget | Image cache budget |
|---|---|---|---|---|
| `baseline` | Default for any TV not matching enhanced gate; Dave's `UN55CU8000BXZA` | static + static-gradient + slow-fade only | ≤ low | small |
| `enhanced` | Mom's `QN85Q7FAAFXZA` (auto on detection) | all 12 packs including motion + cinematic ambient | up to medium-high | large |

Detection signals required to flip to `enhanced` (all must pass — see `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`):

- Model family detection: `webapis.productinfo.getModel()` prefix is `QN` → enhanced candidate (QLED / Neo QLED / Samsung premium lines — `QN85Q7FAAFXZA`, `QN95Q7FAAFXZA`, and all comparable `QN`-class models). `UN`-prefix TVs (`UN55CU8000BXZA` and all Crystal UHD / entry-level Samsung lines) are always baseline — capability probes are skipped for them. Other prefixes run the full probe suite.
- AVPlay HLS available.
- Frame-budget probe at boot passes (a 1.5s probe scene runs hidden and reports dropped frames; must be 0).
- Memory headroom probe passes (cache allocation succeeds for the enhanced budget).

If any signal fails, the renderer stays on baseline for the session. The detection result is logged to `proof/tier-detection/<session_id>.json`.

## Theme token contract

Every theme is declared in `schemas/themes/<theme_id>.json` with this shape:

```json
{
  "theme_id": "midnight_steel",
  "version": "1.0.0",
  "name": "Midnight Steel",
  "family": "dark",
  "intent": "Default dark cinematic theme.",
  "tokens": {
    "bg_0": "#0B0D10",
    "bg_1": "#13161B",
    "bg_2": "#1B1F26",
    "surface_0": "#1F242C",
    "surface_1": "#262C36",
    "text_primary": "#F2F4F7",
    "text_secondary": "#B7BDC6",
    "text_disabled": "#6B7280",
    "accent": "#5AA1FF",
    "accent_hover": "#7DB6FF",
    "accent_pressed": "#3E86DF",
    "focus_ring": "#FFD86B",
    "focus_ring_pressed": "#FFB300",
    "ok": "#3EC97A",
    "warn": "#F5A524",
    "danger": "#FF5A5A",
    "badge_quality_4k": "#9F7CFF",
    "badge_quality_1080": "#5AA1FF",
    "badge_quality_720": "#9CB0C9",
    "badge_quality_low": "#6B7280",
    "badge_provider": "#3EC97A",
    "shadow_strong": "rgba(0,0,0,0.55)"
  },
  "typography": {
    "font_family_primary": "Inter, Samsung One, system-ui",
    "font_family_display": "Inter, Samsung One, system-ui",
    "scale_base_px": 22,
    "scale_step": 1.125
  },
  "focus_ring": {
    "style": "static_thick",
    "thickness_px": 4,
    "glow_enhanced_only": true
  },
  "high_contrast_partner": "midnight_steel_high_contrast",
  "mom_mode_partner": "midnight_steel_mom",
  "proof_required": ["contrast_audit", "screenshot_per_layout", "focus_ring_visibility"]
}
```

The router rejects any theme that does not validate.

## The 24 themes

Themes are grouped into four families. Every theme has a high-contrast partner (suffix `_high_contrast`) and many have a Mom Mode partner (`_mom`) — both auto-selected when the corresponding mode is on. Partners count as variants of the base theme, not as additional themes against the 24 budget.

### Dark family (10)

Default-first. Cinematic. Long-session safe.

| # | theme_id | Name | Intent |
|---|---|---|---|
| 1 | `midnight_steel` | Midnight Steel | Default. Cool neutral dark. Cinematic. |
| 2 | `obsidian_warm` | Obsidian Warm | Warm dark with amber accents for evening viewing. |
| 3 | `noir_red` | Noir Red | Moody dark with red focus ring. Movie night. |
| 4 | `deep_ocean` | Deep Ocean | Blue-green dark, teal accent. |
| 5 | `forest_dusk` | Forest Dusk | Dark green dark, sage accent. |
| 6 | `royal_violet` | Royal Violet | Deep purple dark, lavender accent. |
| 7 | `carbon_lime` | Carbon Lime | Near-black with neon-lime accent for high-tech feel. |
| 8 | `ember_charcoal` | Ember Charcoal | Charcoal dark with ember-orange accent. |
| 9 | `cosmic_indigo` | Cosmic Indigo | Indigo dark with cyan accent. |
| 10 | `slate_paper` | Slate Paper | Soft dark with paper-white text for long reading. |

### Cinema family (6) — enhanced-tier preferred

These themes are designed around motion-rich backgrounds and richer surface treatments. They still render on baseline tier but with their `_baseline_partner` (flatter surfaces, static background only).

| # | theme_id | Name | Intent |
|---|---|---|---|
| 11 | `cinema_velvet` | Cinema Velvet | Deep red-black with film-grain background pack default. |
| 12 | `cinema_amber` | Cinema Amber | Warm amber glow, candlelight ambient pack default. |
| 13 | `cinema_neon` | Cinema Neon | Synthwave-flavored, neon-grid ambient pack default. |
| 14 | `cinema_mono` | Cinema Mono | Black/white/silver high-style. |
| 15 | `cinema_aurora` | Cinema Aurora | Northern-lights ambient pack default. |
| 16 | `cinema_drive` | Cinema Drive | Night-drive ambient pack default. |

### Accessibility family (4)

Always available regardless of tier. Auto-selected when accessibility flags are on.

| # | theme_id | Name | Intent |
|---|---|---|---|
| 17 | `hc_dark` | High Contrast Dark | Black bg, near-white text, yellow focus ring. WCAG AAA. |
| 18 | `hc_light` | High Contrast Light | Near-white bg, near-black text, magenta focus ring. WCAG AAA. |
| 19 | `mom_calm` | Mom Calm | Soft warm dark, very large default scale, gentle saturation. |
| 20 | `mom_garden` | Mom Garden | Soft green dark, warm text, large scale, calm focus ring. |

### Light family (4)

Daytime / Saturday-morning. Reduced brightness to stay TV-safe. Never auto-selected at night (post 8pm in TV's local time) unless user pinned it.

| # | theme_id | Name | Intent |
|---|---|---|---|
| 21 | `morning_paper` | Morning Paper | Off-white bg, charcoal text, blue accent. |
| 22 | `kitchen_window` | Kitchen Window | Warm cream bg, brown text, herb-green accent. |
| 23 | `sunday_silver` | Sunday Silver | Silver-gray bg, cool blue accent. |
| 24 | `clinic_clear` | Clinic Clear | Very clean light, magenta focus ring, big legibility. |

## Background pack contract

Every background pack is declared in `schemas/backgrounds/<pack_id>.json`:

```json
{
  "pack_id": "ambient_motion_01",
  "version": "1.0.0",
  "name": "Ambient Motion 01 — Slow Aurora",
  "intent": "Slow, low-saturation aurora drift for evening viewing.",
  "tier_required": "enhanced",
  "baseline_partner": "static_gradient_aurora",
  "asset_kind": "video",
  "asset_path": "assets/backgrounds/ambient_motion_01/loop.mp4",
  "loop_seconds": 38,
  "max_motion_density": "low",
  "burn_in_safe": true,
  "reduced_motion_partner": "static_gradient_aurora",
  "color_temp": "cool",
  "compatible_themes": ["midnight_steel", "deep_ocean", "cosmic_indigo", "cinema_aurora"],
  "proof_required": ["loop_seam_test", "burn_in_audit", "dropped_frames_dave", "dropped_frames_mom"]
}
```

## The 12 background packs

| # | pack_id | Name | Tier required | Baseline partner |
|---|---|---|---|---|
| 1 | `static_gradient_steel` | Static Gradient — Steel | baseline | self |
| 2 | `static_gradient_warm` | Static Gradient — Warm | baseline | self |
| 3 | `static_gradient_aurora` | Static Gradient — Aurora | baseline | self |
| 4 | `slow_fade_steel` | Slow Fade — Steel | baseline | `static_gradient_steel` |
| 5 | `slow_fade_warm` | Slow Fade — Warm | baseline | `static_gradient_warm` |
| 6 | `ambient_motion_01` | Ambient Motion 01 — Slow Aurora | enhanced | `static_gradient_aurora` |
| 7 | `ambient_motion_02` | Ambient Motion 02 — Velvet Drift | enhanced | `static_gradient_warm` |
| 8 | `ambient_motion_03` | Ambient Motion 03 — Neon Grid | enhanced | `static_gradient_steel` |
| 9 | `cinematic_ambient_01` | Cinematic Ambient 01 — Candlelight | enhanced | `static_gradient_warm` |
| 10 | `cinematic_ambient_02` | Cinematic Ambient 02 — Night Drive | enhanced | `static_gradient_steel` |
| 11 | `cinematic_ambient_03` | Cinematic Ambient 03 — Northern Lights | enhanced | `static_gradient_aurora` |
| 12 | `mom_garden_calm` | Mom Garden Calm — Soft Greenery Loop | enhanced | `static_gradient_warm` (also forced-static when Mom Mode + reduced motion) |

## Automatic enhanced rendering

This is the rule that ties tier + theme + background together. **It runs once at boot and is not user-configurable in v1.**

```text
1. Boot. Run runtime detection (model + AVPlay + frame probe + memory probe).
2. If all signals pass enhanced gate:
     renderer_tier = "enhanced"
     allow motion + cinematic ambient packs
     allow focus ring glow
     allow 6-wide poster grids
     allocate large image cache
   Else:
     renderer_tier = "baseline"
     restrict to static + slow-fade packs
     static focus ring only
     limit poster grids to 4-wide
     small image cache
3. Pick theme from profile default. If accessibility flag is on, swap to its partner.
4. Pick background pack from profile default. If pack.tier_required == "enhanced" and renderer_tier == "baseline", swap to pack.baseline_partner.
5. If reduced_motion is on, swap to reduced_motion_partner regardless of tier.
6. Log final selection to proof/tier-detection/<session_id>.json.
```

**Why automatic, not opt-in:** Dave and Mom are not expected to tune renderer tiers manually. The TV that can do more, does more. The TV that cannot, stays safe. Agents may not flip this — see `docs/06`.

## Burn-in protection

Always on. Even baseline tier:

- Static text elements (clock, profile name, top-bar icons) shift position every 60s by 2–6 pixels along a slow Lissajous path.
- Background gradients rotate hue by ≤ 2° every 90s on baseline; enhanced tier may rotate via the pack's own motion loop.
- Ambient idle preset (`docs/04` layout 12) repositions the clock and date block every 60s.
- Provider/quality badges fade-cycle every 30s of static dwell.

## Reduced motion

When `reduced_motion: true` (per profile or globally toggled):

- All motion background packs swap to their `reduced_motion_partner` (always a static asset).
- Cinematic Hero (`docs/04` layout 10) hero rotation switches to static poster only.
- Focus ring glow disabled regardless of tier.
- Card flip / parallax disabled.

## High contrast

When `high_contrast: true`:

- Active theme swaps to its `high_contrast_partner` (each of the 24 themes has one).
- Focus ring thickness +50%, focus ring color forced to theme's `focus_ring` token; never relies on shadow alone.
- Quality / provider badges render with stroked outlines, not soft fills.

## Mom Mode integration

When the active profile is `mom_tv`:

- Layout default = `mom_jumbo_rail` (per `docs/04`).
- Theme default = `mom_calm` (or `mom_garden`).
- Background pack default = `mom_garden_calm` on enhanced, `static_gradient_warm` on baseline.
- Reduced motion = on. High contrast = on (Mom Mode partner of active theme is always used).
- Audio feedback = on.

Agents must not switch Mom out of Mom Mode without `requires_user_confirm: true` and a verbal/visual confirmation step.

## Acceptance gates for theme/background v1

For each of the 24 themes:

1. `schemas/themes/<theme_id>.json` validates.
2. Contrast audit report under `proof/contrast/<theme_id>.json` confirms WCAG AA across text/bg pairs (AAA for accessibility family).
3. Screenshot per applicable layout on both TVs under `proof/screenshots/<tv_model>/themes/<theme_id>__<preset_id>.png`.
4. Focus ring visibility proof on both TVs.

For each of the 12 background packs:

1. `schemas/backgrounds/<pack_id>.json` validates.
2. Loop seam test artifact (no visible jump).
3. Burn-in audit artifact (no static high-contrast region persists > 60s).
4. Dropped-frames proof on Dave's TV (must be 0 for baseline packs; enhanced packs must show 0 on Mom's TV and proper degradation to baseline_partner on Dave's TV).

For the tier engine:

1. `proof/tier-detection/<session_id>.json` artifact from a real boot on **both** TVs.
2. Mom's TV artifact must show `renderer_tier: "enhanced"` with all enhanced overrides applied.
3. Dave's TV artifact must show `renderer_tier: "baseline"` and confirm that any enhanced-required asset on the requested profile fell back to its `baseline_partner`.

## Settings, updates & performance management — renderer surface

### QN vs UN tier rule (binding)

`QN`-prefix TVs are **never limited at the renderer**. Full cache budgets, all 12 background packs, full animation density, and motion/cinematic packs are always available on `QN`-class TVs after the capability probe passes. All cache caps, motion suppressions, and pack downgrades apply only on `UN`-prefix TVs. Agents may not reduce `QN`-class TVs below enhanced defaults via `docs/06`.

### Cache surfaces

| Cache | Holds | Cleared by | Survives clear |
|---|---|---|---|
| `ui_cache` | Compiled layout state, focus maps, overlay surfaces | `clear_ui_cache` | profiles, memories, credentials, favorites, watch history, presets, theme defaults |
| `image_cache` | Poster, hero, channel logo, thumbnail bitmaps | `clear_image_cache` | same |
| `preview_cache` | Backend-generated preview clips and contact-sheets | `clear_preview_cache` | same |
| `catalog_cache` | Cached catalog/EPG/quality scan snapshot | `clear_catalog_cache` | same |

**Hard rule:** clearing any cache never deletes user data. Profiles, memories, provider credentials, favorites, watch history, layout presets, theme defaults, and reminders live outside cache surfaces.

### Cache budgets per tier

| Cache | Baseline (`UN`-prefix TVs) | Enhanced (`QN`-prefix TVs) |
|---|---|---|
| `image_cache` | 64 MB | 192 MB |
| `preview_cache` | 24 MB | 96 MB |
| `catalog_cache` | 12 MB | 24 MB |
| `ui_cache` | 8 MB | 16 MB |

`QN`-class TVs always use the enhanced column. Agents cannot drop `QN`-class TVs below enhanced budgets. Users may personally lower cache sizes via the Performance tab; agents may not (see `docs/06`).

### Performance toggles (Performance tab)

| Toggle | Baseline default (`UN`-prefix) | Enhanced default (`QN`-prefix) | Mom Mode floor |
|---|---|---|---|
| Animation density | `low` | `medium` | `off` |
| Background intensity | `static` or `slow_fade` | `motion` or `cinematic` | `static` |
| Preview cache size | `small` | `large` | `small` |
| Poster cache size | `small` | `large` | `small` |
| Reduced motion | off | off | **on** |
| High contrast | off | off | **on** |
| Low memory mode | **on** (auto) | **not exposed** | n/a |
| Renderer tier (read-only) | `baseline` | `enhanced` | — |

Low memory mode is not present in the Performance tab on `QN`-class TVs.

### Theme/background update propagation from backend

1. Client polls `/v1/themes/manifest` and `/v1/backgrounds/manifest` every 5 minutes (faster while Settings → Updates is open).
2. New or changed entry → fetch JSON + assets to staging slot.
3. Validate against `schemas/themes/*.json` or `schemas/backgrounds/*.json`. On failure → discard, log `rejected_validation`, retain current.
4. Validate assets (loop seam test for motion packs, contrast audit for themes). On failure → retain current.
5. Atomic swap: staging slot → active slot. No restart required.

Small test changes (e.g., one token color value) can be pushed and verified on both TVs without a build or reinstall.

### Catalog backup and swap

- Hold a 1-snapshot backup of the last known-good catalog locally.
- On refresh failure: show "Catalog refresh failed — using last good snapshot" in the Updates tab; serve the backup.
- Never overwrite the backup with an unvalidated snapshot.

### Proof gates added for this contract

1. **Theme change propagation:** push a one-token color change to a theme on the backend; confirm both TVs render it after one manifest cycle with no app restart. Artifact: `proof/update-propagation/theme-<id>/{dave,mom}.png`.
2. **Cache clear non-destructiveness:** for each of the 4 caches, assert user data is byte-identical before and after clear. Artifact: `proof/cache-clear/<cache>/{before,after,diff}.json`.
3. **Dave renderer 30-min:** image cache hits baseline budget ceiling at least once without dropped-frame regression. Artifact: `proof/perf/dave-30min-renderer/<session_id>.json`.
4. **QN non-limiting renderer proof:** 30-minute `QN`-class session — image/preview caches peak at enhanced column; motion packs play without substitution; no `applied_with_substitution` entries tied to tier-downgrade in the audit ledger. Artifact: `proof/perf/qn-30min-renderer/<session_id>.json`.
5. **Rollback restores prior theme/background:** push a broken theme JSON; validator rejects it; prior theme stays active and the rejection is audited. Artifact: `proof/rollback/theme-<id>.json`.

## Out of scope for v1

- User-defined custom themes (token overrides via the safe schema are allowed, fully new theme files are not).
- User-uploaded background assets (assets ship with the app or come from backend).
- Animated themes (only backgrounds animate; theme tokens do not animate in v1).
- Manual tier override by the user or by an agent. The tier engine is automatic only in v1.

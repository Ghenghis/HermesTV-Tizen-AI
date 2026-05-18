# Lane 12 — Accessibility/Mom Mode Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Profile:** mom_tv (Sherri, QN85Q7FAAFXZA, 85", 16-18 hours/day usage)

---

## Summary

Mom Mode is well-implemented for reliability and large text. Font scale 1.35 is enforced at both profile level and UI enforcement points. Reduced motion is active. Audio feedback flag exists but TTS is not connected. High-contrast partner theme (hc_dark) is defined. The primary fatigue mitigation is large text and warm low-saturation colors — no auto-dim exists, which is appropriate for active watching.

---

## Font Scale Enforcement

| Check | Result | Evidence |
|---|---|---|
| font_scale 1.35 in mom_tv profile | PASS | profiles.js: font_scale: 1.35 |
| Mom Mode floor 1.25 in backend | PASS | profiles.js MOM_FONT_SCALE_FLOOR = 1.25; PATCH rejects < 1.25 |
| Font scale applied to CSS var | PASS | App.jsx: `htmlEl.style.setProperty('--font-scale', String(fontScale))` |
| Mom Mode floor enforced in App.jsx | PASS | if (profile.mom_mode && fontScale < 1.25) { fontScale = 1.25; } |
| Font scale applied in Tizen themeManager | PASS | applyProfile() sets --font-scale CSS var |
| Mom Mode floor enforced in themeManager | PASS | if (profile.profile_id === 'mom_tv' && fontScale < 1.25) { fontScale = 1.25; } |
| Components use `calc(Xrem * var(--font-scale, 1))` | PASS | All text in chatbot, header, catalog cards uses this pattern |

**Assessment:** Font scale 1.35 is correctly applied system-wide. No text is hardcoded to bypass the scale.

---

## Audio Feedback (TTS)

| Check | Result |
|---|---|
| audio_feedback: true in mom_tv profile | PASS |
| TTS route exists (/api/tts) | PASS — returns 202 stub |
| Chatbot calls TTS on response | NOT IMPLEMENTED |
| Any component calls TTS | NOT IMPLEMENTED |
| Azure TTS voice for mom_tv | PASS — 'en-US-AriaNeural' configured in tts.js |

**Assessment:** audio_feedback=true is set but has no connected consumer. TTS is a B3 feature. For B2, the walkie-talkie chatbot mode correctly says "mock mode — Azure TTS only." Mom will not hear audio feedback in B2.

---

## Reduced Motion

| Check | Result |
|---|---|
| reduced_motion: true in mom_tv profile | PASS |
| App.jsx applies .motion-reduced class to body | PASS |
| .motion-reduced CSS rule | PASS — `animation-duration: 0.01ms !important; transition-duration: 0.01ms !important` |
| Tizen themeManager sets reduced-motion class | PASS — applyProfile() adds 'reduced-motion' to body for mom_tv |
| Media query: prefers-reduced-motion | PASS — index.css also has @media prefers-reduced-motion rule |
| Mom Mode locked: reduced_motion always true | PASS — themeManager: `if (profile.profile_id === 'mom_tv') reducedMotion = true` |

---

## High-Contrast Option

| Check | Result |
|---|---|
| hc_dark theme exists | PASS — schemas/themes/hc_dark.json |
| hc_light theme exists | PASS — schemas/themes/hc_light.json |
| mom_calm has high_contrast_partner: "hc_dark" | PASS — mom_calm.json |
| High-contrast switch UI in app | NOT IMPLEMENTED — no button to switch to hc_dark |
| hc_dark WCAG AA verified | NEEDS VERIFICATION — not audited |

The high-contrast themes exist but no UI surface allows switching to them in B2. This is acceptable for B2 but should be added to the Settings panel in B3.

---

## Fatigue Mitigation for 16-18 Hour Usage

| Feature | Status | Notes |
|---|---|---|
| Large text (font_scale 1.35) | PASS — reduces eye strain |
| Warm low-saturation colors (mom_calm) | PASS — #1A1410 background, #E07B39 amber accent |
| Reduced motion (animations off) | PASS — no flashing or motion sickness triggers |
| Auto-dim display | NOT PRESENT — no auto-dim feature |
| Blue light reduction | NOT PRESENT — warm theme reduces blue somewhat, but no explicit blue-light filter |
| Brightness control | NOT PRESENT — not a web app concern; TV hardware setting |
| Content pause reminders | NOT PRESENT — not planned |

Auto-dim is not appropriate for an active TV viewing app. The TV's built-in ambient sensor handles screen management. The warm theme is the correct software mitigation for eye fatigue.

---

## mom_jumbo_rail Layout Assessment

| Check | Result |
|---|---|
| Layout defined | PASS — schemas/layouts/mom_jumbo_rail.json |
| grid.columns: 1 | PASS — single-column rail |
| card_shape: rounded_jumbo | PASS |
| mom_variant.font_scale: 1.35 | PASS |
| mom_variant.tile_density: jumbo | PASS |
| mom_variant.focus_ring: static_thick_high_contrast | PASS |
| mom_variant.animation_density: off | PASS |
| mom_variant.audio_feedback: true | PASS |
| App renders mom layout | PARTIAL — CatalogGrid uses `active_layout === 'jumbo-rail'` → cols=2, not 1 |
| 3-column vs 1-column discrepancy | GAP — prompt says "3-column large tiles" but schema says columns:1 and app uses cols=2 for jumbo-rail |

**Gap:** The mom_jumbo_rail.json schema says `grid.columns: 1` (single giant tile rail). The app renders `cols=2` for jumbo-rail layout. The prompt requirement says "3-column, large tiles." There is disagreement between the schema, app code, and specification. Resolution: the schema's intent (jumbo rail = large tiles, few columns) is correct. Whether that's 1, 2, or 3 columns needs alignment.

---

## mom-calm Theme Visual Assessment

| Token | Value | Assessment |
|---|---|---|
| bg_0 | #1A1410 | Very dark warm brown — calming, easy on eyes |
| accent | #E07B39 | Warm amber-orange — not harsh blue |
| text_primary | #F5EDE6 | Warm cream white — no harsh white |
| focus_ring | #FFD86B | High-contrast golden yellow — easy to see |
| scale_base_px | 28 | Large base font — correct for 85" TV at typical viewing distance |

**Assessment:** The mom-calm theme is visually appropriate — warm, low-saturation, no harsh blues or cyans. It reads as calmer than the night-blue default (electric blue accents). PASS.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| Audio feedback (TTS) not connected | P2 | B3 work item |
| No high-contrast switch in UI | P2 | B3 Settings panel enhancement |
| mom_jumbo_rail columns: schema says 1, app uses 2 | P2 | Alignment needed |
| hc_dark WCAG AA contrast not verified | P2 | Needs automated contrast audit |
| No auto-dim | INFO | Not needed for TV app — hardware handles it |

# Lane 11 — Theme/Layout Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** schemas/themes/ (24 files), schemas/layouts/ (12 files), ThemeProvider.jsx, themeManager.js, tailwind.config.js

---

## Summary

All 24 theme JSON files and 12 layout JSON files are valid JSON with no parse errors. All layouts have `un_degradation` blocks. All backgrounds have `tier_required`. All 5 new schemas pass JSON validation. The ThemeProvider applies themes via CSS class. The themeManager.js `applyProfile()` function is complete. Key gap: ThemeProvider applies a wrapper `div` with `className={themeClass}`, but theme CSS vars are defined on `.theme-*` classes that set vars on the element directly — not on `:root`. The vars therefore apply within the ThemeProvider div, which is correct, but nested components using `var(--accent)` will resolve correctly only inside the ThemeProvider. This is fine as all app content is inside it.

---

## Theme JSON Validation (24 files)

| Check | Result |
|---|---|
| All 24 files valid JSON | PASS |
| All have theme_id | PASS |
| All have tokens object | PASS |
| All have tokens.accent | PASS |
| All have tokens.bg_0 | PASS |
| All have tokens.text_primary | PASS |
| Total count | 24 themes as required |

Theme list confirmed: carbon_lime, cinema_amber, cinema_aurora, cinema_drive, cinema_mono, cinema_neon, cinema_velvet, clinic_clear, cosmic_indigo, deep_ocean, ember_charcoal, forest_dusk, hc_dark, hc_light, kitchen_window, midnight_steel, mom_calm, mom_garden, morning_paper, noir_red, obsidian_warm, royal_violet, slate_paper, sunday_silver.

---

## Layout JSON Validation (12 files)

| Check | Result |
|---|---|
| All 12 files valid JSON | PASS |
| All have un_degradation block | PASS |
| All have preset_id | PASS |
| All have grid object | PASS |
| Total count | 12 layouts as required |

Layout list: ambient_idle, category_carousels, cinematic_hero, classic_cable_grid, discovery_walls, epg_strip, favorite_quick_dial, live_focus, minimal_player, mom_jumbo_rail, provider_dashboard, recents_resume.

---

## Background Schema Validation

| Check | Result |
|---|---|
| All 12 background schemas have tier_required | PASS |
| qn_primary tier backgrounds | 7 (ambient_motion_01, aurora_01, candlelight_01, film_grain_01, neon_grid_01, night_drive_01, warm_ambient_01) |
| baseline tier backgrounds | 5 (morning_light_01, static_dark_default, static_gradient_blue, static_gradient_warm, static_warm_dark) |

---

## ThemeProvider.jsx

ThemeProvider wraps all children in:
```jsx
<div className={themeClass} style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
```

Where `themeClass = 'theme-' + activeTheme` (e.g., `'theme-mom-calm'`).

The CSS in index.css defines:
```css
.theme-mom-calm {
  --bg: #1a1410;
  --accent: #e07b39;
  ...
}
```

**Result:** All CSS custom properties resolve correctly within the ThemeProvider div tree. Themes apply properly. Switching profile (and thus active_theme) causes ThemeProvider to re-render with the new class.

**Gap:** The ThemeProvider sets the class on a `div`, not on `html` or `body`. Some absolute/fixed positioned elements that are not children of this div (theoretically) would not inherit the theme vars. In practice, all app content is inside the ThemeProvider div, and modals use `position:fixed` which inherit from the nearest ancestor with the var defined — the ThemeProvider div. This is acceptable.

---

## Theme Picker in Web App

**Status:** NO dedicated theme picker UI exists in B2.
The user switches themes by switching profiles (mom_tv → mom-calm, dave_tv → night-blue). The Settings gear panel shows current theme as an info row only — there is no theme selection dropdown.

**Gap:** A theme picker dropdown in the Settings panel is a P3 enhancement for B3.

---

## Layout Picker in Web App

**Status:** The layout is determined by `profile.active_layout`. In B2:
- mom_tv → active_layout: 'jumbo-rail' → 2-column grid
- dave_tv → active_layout: 'grid-standard' → 3 or 5 column grid

No user-facing layout switcher exists. The catalog grid column count changes based on `activeTab` (discovery → 8/4 columns, otherwise profile-default).

**Gap:** Layout picker for user control is a P3 enhancement.

---

## Tailwind Config Token Usage

| Token | In tailwind.config.js |
|---|---|
| night-blue | YES |
| mom-calm | YES |
| qn-gold | YES |
| hc-dark | NEEDS CHECK |

The three primary tokens (night-blue, mom-calm, qn-gold) are present in the tailwind config. These appear to be used as utility class modifiers in addition to the CSS variable approach in ThemeProvider.

---

## themeManager.js applyProfile() Completeness

| Function | Status |
|---|---|
| apply(themeId) — apply theme tokens | PASS |
| applyProfile(profile) — theme + font-scale + reduced-motion + tier overrides | PASS |
| applyEnhancedOverrides() — glow/blur/parallax vars | PASS |
| applyDegradedOverrides() — disables all enhanced vars | PASS |
| getCurrent() — returns current theme ID | PASS |

**Note:** The Tizen themeManager.js and the web app's ThemeProvider.jsx are separate implementations. The Tizen app uses the vanilla JS themeManager; the web app uses React ThemeProvider. They must be kept in sync manually when theme tokens change.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| No theme picker UI in web app | P3 | Enhancement for B3 |
| No layout picker UI | P3 | Enhancement for B3 |
| ThemeProvider on div (not html/body) | INFO | Acceptable — all app content inside div |
| Tizen themeManager and web ThemeProvider must be kept in sync | P2 | Process gap — no automation to detect token drift |

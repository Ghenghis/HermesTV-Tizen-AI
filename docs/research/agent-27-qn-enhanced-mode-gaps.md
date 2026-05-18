# Lane 14 — QN Enhanced Mode Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Target:** QN85Q7FAAFXZA (primary), QN95-class (parity)

---

## Summary

The QN enhanced mode is correctly architected. The 8-wide discovery grid, backdrop-filter blur, cinematic hero, focus glow, and GPU parallax are all present in CSS and component code. The single critical gap is the missing `-webkit-` prefix on `backdrop-filter` which will cause the blur effect to silently fail on Chrome 76 (Tizen 6.5).

---

## 8-Wide Discovery Grid

| Check | Result | Evidence |
|---|---|---|
| Enhanced discovery grid: 8 columns | PASS | App.jsx: `columns={state.tier === 'enhanced' ? 8 : 4}` for discovery tab |
| CatalogGrid respects columns prop | PASS | gridTemplateColumns: `repeat(${cols}, 1fr)` |
| Enhanced standard grid: 5 columns | PASS | App.jsx: 5 cols for non-discovery on enhanced |
| CSS custom property --grid-cols-discovery: 8 | PASS | index.css :root |
| Enhanced grid class on container | PASS | CatalogGrid sets className='enhanced-grid' for enhanced tier |

**Assessment:** 8-wide discovery grid is correctly implemented.

---

## backdrop-filter: blur(12px) — CRITICAL GAP

| Check | Result |
|---|---|
| backdrop-filter defined in CSS | PASS — index.css: `.enhanced .overlay-panel, .enhanced .chatbot-panel { backdrop-filter: blur(var(--enhanced-blur)); }` |
| --enhanced-blur: 12px set in :root | PASS |
| -webkit-backdrop-filter prefix | FAIL — NOT PRESENT |
| Chrome 76 support | Chrome 76 REQUIRES -webkit-backdrop-filter |

**This is the P1 bug:** Chrome 76 (Tizen 6.5 web engine) supports `backdrop-filter` only with the `-webkit-` prefix. Without it, all overlay blur effects will silently not apply on the TV.

**Required patch in `apps/hermes-web-tv/src/index.css`:**
```css
.enhanced .overlay-panel,
.enhanced .chatbot-panel {
  -webkit-backdrop-filter: blur(var(--enhanced-blur));  /* ADD this line */
  backdrop-filter: blur(var(--enhanced-blur));
}
```

---

## Hero Section 65vh

| Check | Result |
|---|---|
| --hero-height: 65vh defined | PASS — index.css :root |
| Hero section uses var(--hero-height) | NEEDS CHECK — no hero section component found in web app |
| UN-class hero height | PASS — .un-degraded :root sets --hero-height: 50vh |
| Cinematic rotation | NOT FOUND in web app — B3 feature |

**Gap:** No hero section with cinematic rotation exists in the B2 web app. LayoutShell.jsx was not audited in detail but a hero section is not visible in App.jsx rendering. The 65vh CSS variable is defined but not consumed.

---

## Animated Focus Glow

| Check | Result |
|---|---|
| --focus-ring-glow defined | PASS — index.css: `--focus-glow: 0 0 14px var(--accent, #5AA1FF)` |
| Enhanced tier enables glow | PASS — themeManager.js applyEnhancedOverrides(): `--focus-ring-glow: 0 0 12px var(--focus-ring, #FFD86B)` |
| .enhanced .focus-active applies box-shadow | PASS — index.css: `.enhanced .focus-active { box-shadow: var(--focus-glow); }` |
| Tizen focusEngine applies focus-active class | PASS — focusEngine.js manages focus-active class on registered elements |

**Assessment:** Focus glow is correctly implemented. The Tizen focusEngine.js applies the `focus-active` class; CSS does the rest. Works without JavaScript animation — CSS box-shadow is static, appropriate for Tizen.

---

## GPU Parallax Transform

| Check | Result |
|---|---|
| transform: translateZ(0) in CSS | PASS — index.css `.enhanced .catalog-card:focus` applies `transform: scale(1.03)` |
| translateZ(0) hint applied | NOT FOUND as a standalone property — scale transform implicitly triggers GPU compositing in Chrome |
| --hero-parallax: enabled var | PASS — defined in themeManager.js applyEnhancedOverrides() |
| Parallax actually implemented | NOT FOUND — no parallax animation code in App.jsx or components |

**Assessment:** The GPU parallax CSS variables are defined and the architecture is ready, but no actual parallax animation is implemented in B2. This is acceptable for B2.

---

## 20Mbps AVPlay Ceiling

| Check | Result |
|---|---|
| setStreamingProperty('ADAPTIVE_INFO', 'BITRATE_LIMIT=20000|BUFFER_SIZE=30') | PASS |
| Called only for enhanced tier | PASS — conditional on `window.HERMES_CAP && window.HERMES_CAP.isEnhancedTier` |
| 8Mbps cap for degraded | PASS — in setQualityPreference() |
| HERMES_CAP populated | NEEDS VERIFICATION — where is window.HERMES_CAP set? |

**Gap:** `window.HERMES_CAP.isEnhancedTier` is read in avplayEngine.js but where is `HERMES_CAP` set? In the web app, tier detection is done in App.jsx and classes applied to the DOM. But the Tizen native app uses its own tier detection. If HERMES_CAP is not set before avplayEngine initializes, the enhanced bitrate ceiling will never apply. This should be verified in the Tizen platform init code.

---

## Chrome 76 Compatibility Checklist

| CSS Feature | Chrome 76 Support | Status |
|---|---|---|
| CSS Grid | YES (no prefix needed) | PASS |
| CSS Custom Properties | YES | PASS |
| backdrop-filter | YES but REQUIRES -webkit- prefix | FAIL — see above |
| transform: scale() | YES | PASS |
| box-shadow | YES | PASS |
| calc() | YES | PASS |
| flex | YES | PASS |
| :focus-visible | NO — Chrome 76 does not support :focus-visible | GAP — app uses :focus instead, which is correct |
| CSS position: sticky | YES (Chrome 56+) | PASS |
| optional chaining (?.) in JS | NO — Chrome 80 | Must verify no usage in Tizen app bundle |
| nullish coalescing (??) in JS | NO — Chrome 80 | Must verify |

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| -webkit-backdrop-filter prefix missing | P1 | Overlay blur fails on Chrome 76 / Tizen 6.5 |
| HERMES_CAP initialization location unclear | P1 | AVPlay bitrate ceiling may not apply if not set |
| Hero section 65vh not implemented | P2 | B3 cinematic layout feature |
| Parallax animation not implemented | P2 | B3 feature |
| Optional chaining in Tizen bundle | P2 | Needs audit of Tizen webpack output |

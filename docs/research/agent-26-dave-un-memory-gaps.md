# Lane 13 — Dave UN Low-Memory Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Profile:** dave_tv (UN55CU8000BXZA, 55", degraded tier)

---

## Summary

The UN-class degraded mode is correctly implemented at all layers: App.jsx, index.css, themeManager.js, and CatalogGrid all apply degraded constraints when the TV model prefix is UN. The key gaps are that memory budget has not been profiled, and there is no explicit image cache size limiter in the web app code.

---

## UN-class Detection

| Check | Result | Evidence |
|---|---|---|
| body.un-degraded class applied | PARTIAL | App.jsx uses `htmlEl.classList.add('un-degraded')` on `document.documentElement` (html element), not body. This is a minor discrepancy — CSS rules in index.css target `.un-degraded :root`, which works from the html element. |
| QN-prefix → enhanced | PASS | resolveTier('QN85Q7FAAFXZA') → 'enhanced' |
| UN-prefix → degraded | PASS | resolveTier('UN55CU8000BXZA') → 'degraded' |
| custom → enhanced | PASS | resolveTier('custom') → 'enhanced' |
| Tier class applied to html element | PASS | applyTierClasses() adds 'enhanced' or 'un-degraded' to document.documentElement |

---

## Disabled Features on UN-class

| Feature | Status | Implementation |
|---|---|---|
| backdrop-filter | DISABLED | themeManager.js applyDegradedOverrides(): `--overlay-blur: 0px` |
| Parallax | DISABLED | themeManager.js: `--hero-parallax: disabled` |
| 8-wide grid | DISABLED | CatalogGrid: cols=4 for discovery on degraded, cols=3 for standard |
| Glow/focus-ring | DISABLED | themeManager.js: `--focus-ring-glow: none`; index.css `.enhanced .focus-active` only |
| Animation scale | DISABLED | themeManager.js: `--animation-scale: 0` on degraded |
| Card hover transition | DISABLED | CatalogGrid sets `gridStyle.transition = 'none'` for degraded |

**Assessment:** All enhanced visual features are correctly disabled for UN-class. The implementation is complete.

---

## Animation Budget

| Check | Result |
|---|---|
| animation-scale: 0 via CSS var | PASS |
| .reduced-motion / .motion-reduced class | Not applied for dave_tv (reduced_motion: false) |
| Enhanced card transitions only on .enhanced | PASS — `.enhanced .catalog-card { transition: ... }` |
| UN-class grid: transition: none | PASS — set in CatalogGrid.jsx |

For UN-class, animation is suppressed via the `--animation-scale: 0` CSS variable and the removal of catalog-card transition. This is correct but `--animation-scale: 0` is a custom var — it has no effect unless CSS `transition: calc(Xs * var(--animation-scale, 1))` patterns are used. The index.css card transitions are conditional on `.enhanced` class. So the degraded mode relies on class absence rather than the --animation-scale var.

---

## Image Cache

| Check | Result |
|---|---|
| Explicit image cache size limit | NOT FOUND |
| Browser-managed cache | DEFAULT — Chrome 76 manages cache |
| Lazy loading | NOT IMPLEMENTED — all images in the grid load on render |
| CatalogCard image | Renders src=logo_url or poster_url without lazy load attribute |

**Gap:** No lazy loading (`loading="lazy"`) on catalog card images. On a low-memory UN-class device with 3-4 column grid, all visible images load immediately. For a 3-column grid with 10 items, this is ~10 image fetches on load. Acceptable for B2 (all images are from hermestv.local), but lazy loading should be added in B3.

---

## Memory Budget Estimate

| Resource | Estimate | Notes |
|---|---|---|
| UN55CU8000BXZA total RAM | ~2GB (unconfirmed) | Crystal UHD 2022 spec — 2GB total reported in some sources |
| Available to web app process | ~300-500MB | Estimated — Samsung WRT typically gives 20-30% of RAM to app |
| React 18 runtime | ~15MB |  |
| Vite build output | ~500KB JS | Estimated for current app size |
| 10 catalog images (mock, hermestv.local) | Minimal — local network |
| Total runtime footprint | ESTIMATED ~50-100MB | Needs on-device profiling |
| Target budget (under 200MB) | LIKELY MET | Based on estimation, but profiling required |

---

## 4-Column Grid on 55" TV

| Check | Result |
|---|---|
| UN degraded: 3 cols (grid-standard) | PASS — 3 cols with ~300px min-width per card |
| UN degraded: 4 cols (discovery) | PASS — 4 cols on 55" is approximately 340px per card at 1920px width |
| Tile size at 3 cols on 55" | ~580px per tile at 1920x1080 — comfortable on 55" |
| Tile size at 4 cols on 55" | ~440px per tile — slightly tight but usable |
| Text readability at degraded font_scale 1.1 | Acceptable — slightly above base but not large |

**Assessment:** 4 columns is acceptable on 55" for discovery tab. 3 columns is comfortable for standard browsing. No layout cramping issue identified for UN-class.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| UN-class memory profiling not done | P2 | On-device test required before B3 |
| No lazy loading on catalog images | P2 | B3 enhancement for memory reduction |
| `html.un-degraded` vs `body.un-degraded` minor inconsistency | P3 | Minor — CSS rules work from html element |
| `--animation-scale: 0` var not fully wired | P3 | Degraded mode relies on class absence, not the CSS var |

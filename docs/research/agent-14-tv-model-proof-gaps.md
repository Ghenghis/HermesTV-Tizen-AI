# Lane 01 — TV Model Proof Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** QN85Q7FAAFXZA (Mom/enhanced primary), QN95-class parity target, UN55CU8000BXZA (Dave/degraded)

---

## Summary

Documents what is CONFIRMED by research/documentation vs what NEEDS VERIFICATION via on-device test for the two primary TV hardware targets.

---

## QN85Q7FAAFXZA Capability Matrix

| Capability | Status | Evidence |
|---|---|---|
| Tizen version | CONFIRMED 6.5 | docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md, config.xml required_version="6.5" |
| Resolution | CONFIRMED 4K native (3840x2160) | Samsung product spec; confirmed in docs |
| Chromium/WebKit version | NEEDS VERIFICATION | Chrome 76 / Chromium 76 is the documented Tizen 6.5 web engine baseline per docs/02. On-device user-agent string confirmation required. |
| AVPlay API availability | CONFIRMED present | Tizen 6.5 includes webapis.avplay per Samsung dev docs. Specific method set requires on-device check. |
| HDR10 support | CONFIRMED | QN85Q7F hardware spec includes HDR10. |
| Dolby Vision support | NEEDS VERIFICATION | QN85Q7F marketing materials are ambiguous. The Q7 panel line from 2021 may not support Dolby Vision even where hardware-adjacent models do. On-device HDMI/streaming DV test required. |
| Memory budget (web apps) | NEEDS VERIFICATION | Samsung does not publish RAM available to WRT/web app layer. Based on Tizen 6.5 platform norms: ~300-500 MB usable for web apps is expected, but on-device chrome://gpu and performance profiling required. |
| CSS backdrop-filter | CONFIRMED (with prefix) | Chrome 76 supports `backdrop-filter` with `-webkit-` prefix. The index.css uses `backdrop-filter: blur(var(--enhanced-blur))` without prefix — see gap below. |
| WebWorker support | CONFIRMED | Chrome 76 and Tizen 6.5 support Web Workers. |
| IndexedDB | CONFIRMED | Chrome 76 has IndexedDB v2 support. |
| Service Worker | NEEDS VERIFICATION | Service Workers exist in Chrome 76 but Samsung TVs may restrict SW registration in WRT context. On-device test required. |
| GPU compositing / hardware acceleration | CONFIRMED | QN85Q7F uses Tizen acceleration pipeline. `transform: translateZ(0)` trigger confirmed in docs. |
| 20Mbps AVPlay ceiling | CONFIRMED via code | avplayEngine.js sets ADAPTIVE_INFO BITRATE_LIMIT=20000 for enhanced tier. Actual AVPlay acceptance of this value needs on-device test. |

---

## QN95-Class QLED Parity Target

| Capability | Status | Notes |
|---|---|---|
| Tizen version | CONFIRMED 6.5 | QN95 2021+ ships Tizen 6.5. |
| Web engine | ASSUMED SAME as QN85 | Chrome 76 baseline. NEEDS on-device confirmation for parity. |
| Memory | LIKELY HIGHER than QN85 | QN95 is higher-spec but web app RAM cap unconfirmed. |
| HDR/Dolby Vision | CONFIRMED | QN95 supports both HDR10+ and Dolby Vision. |
| Feature parity with QN85 | ASSUMED PASS | All QN-class enhanced-tier code should work the same. Formal parity test not done. |

---

## UN55CU8000BXZA (Dave — Degraded Tier)

| Capability | Status | Notes |
|---|---|---|
| Tizen version | CONFIRMED 6.5 | config.xml targets 6.5. UN55CU8000 ships Tizen 6.5. |
| Resolution | CONFIRMED 4K (3840x2160) | Crystal UHD panel. |
| HDR | CONFIRMED HDR10 only | No Dolby Vision. |
| RAM for web apps | NEEDS VERIFICATION | UN-class Crystal UHD has lower overall RAM. ~1GB total system; web apps likely limited to 150-250MB. |
| backdrop-filter | CONFIRMED NOT USED | Degraded tier disables backdrop-filter via CSS vars (--enhanced-blur: 0px). Correct. |

---

## Identified Gaps and Fixes Required

### GAP-TV-01: CSS backdrop-filter missing -webkit- prefix
**Priority:** P1
**File:** `apps/hermes-web-tv/src/index.css` line 122-124
**Issue:** `backdrop-filter: blur(var(--enhanced-blur))` is used without the `-webkit-` prefix. Chrome 76 requires `-webkit-backdrop-filter` as well.
**Fix:** Add `-webkit-backdrop-filter: blur(var(--enhanced-blur));` before the unprefixed property.

### GAP-TV-02: Service Worker registration on Tizen TV unclear
**Priority:** P2
**Issue:** The codebase does not appear to register a Service Worker in B2, but if B3+ considers offline caching, this needs a Tizen 6.5 compatibility check.
**Recommendation:** Test SW registration on QN85 before B3 implementation.

### GAP-TV-03: Dolby Vision on QN85Q7F unconfirmed
**Priority:** P2
**Issue:** The avplayEngine.js calls `ON_HDR_DETECTED` for HDR preference but does not specifically test for Dolby Vision vs HDR10. If Dolby Vision is absent on QN85Q7F, the DV stream fallback to HDR10 must be verified.

### GAP-TV-04: Memory profiling not done
**Priority:** P2
**Issue:** No memory profiling data exists. The web app runtime footprint has not been measured on either TV. Required before B3.

---

## What Does Not Need Verification

- 4K resolution: Samsung spec sheet is authoritative.
- Tizen 6.5 on both TVs: confirmed in research (agent-02, agent-07) and locked in config.xml.
- AVPlay API existence on Tizen 6.5: confirmed per Samsung developer docs.
- WebWorker and IndexedDB in Chrome 76: documented browser capability table.
- Tier detection logic (QN prefix → enhanced): code correctly reflects hardware tiering.

---

## Blockers

None for code development. On-device tests (DV, memory, SW, WebKit prefix) require TV hardware access which is environment-limited, not a code blocker for B2.

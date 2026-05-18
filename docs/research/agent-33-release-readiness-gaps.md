# Lane 20 — Release Readiness Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** B2 "works today" demo readiness assessment

---

## Summary

The B2 local mock demo is substantially complete. The web app builds, the API serves mock data, the catalog has 10 items, profiles work, themes apply, and the chatbot has all UI states. The primary gaps blocking a polished demo are: (1) the chatbot does not call the command API so 15 commands have no effect, (2) the StreamingQualityBar reads health data from the wrong path in the catalog item structure, and (3) the schema validator reports false failures due to key mismatches.

---

## Release Readiness Matrix

| Feature | Status | Blocker |
|---|---|---|
| Web app build (`npm run build:web`) | PASS | None |
| Backend API (`npm run start:api`) | PASS | None |
| Profile picker (Sherri/Dave) | PASS | None |
| Profile switching (settings panel) | PARTIAL | No switch button — P1 UX gap |
| Theme: night-blue (Dave) | PASS | None |
| Theme: mom-calm (Sherri) | PASS | None |
| Font scale 1.35 for Sherri | PASS | None |
| Reduced motion for Sherri | PASS | None |
| Offline fallback to mock data | PASS | None |
| Offline banner | PASS | None |
| Fatal error recovery | PASS | None |
| Mock catalog (10 items) | PASS — 3 live, 4 VOD, 3 series | None |
| All items have metadata.plot | PASS | None |
| All items have source_health | PASS (in providers[].source_health) | None |
| All items have poster_url + backdrop_url | PASS | None |
| 5 actors with full data | PASS | None |
| Provider filter (apollo/xtremehd/all) | PASS | None |
| Content filter (live/movies/series/all) | PASS | None |
| Quality filter (720p+/1080p+/4K) | PASS | None |
| Enhanced 8-wide discovery grid (QN) | PASS | None |
| Degraded 4-wide grid (UN) | PASS | None |
| Tier detection (QN/UN prefix) | PASS | None |
| MediaDetailPanel opens | PASS | None |
| ActorCard with initials fallback | PASS | None |
| SourceComparePanel provider select | PASS (flow wired) | None |
| StreamingQualityBar health score display | FAIL | source_health path mismatch — P1 |
| 15 chatbot commands wired | FAIL — 0/15 work | Chatbot does not call /api/ui-command/validate |
| Chatbot credential rejection | PASS | None |
| Chatbot walkie-talkie mode (mock) | PASS | None |
| QR onboarding modal | PASS (placeholder QR) | None |
| Tizen config.xml | PASS | None |
| Tizen AVPlay engine | PASS (with browser mock) | None |
| Tizen build pipeline | PARTIAL | Requires authkey (BLOCKER_BUILD_AUTHKEY.md) |
| Tizen TV deploy | BLOCKED | Requires Samsung TV + authkey |
| Azure TTS audio | BLOCKED | Requires Azure subscription (BLOCKER_AZURE_TTS.md) |
| Real IPTV streams | BLOCKED | Requires provider credentials (BLOCKER_PROVIDER_CREDS.md) |
| VPS deployment | BLOCKED | Requires SSH to Hostinger (BLOCKER_VPS_SSH.md) |
| 24 theme JSON files valid | PASS | None |
| 12 layout JSON files valid | PASS | None |
| All layouts have un_degradation | PASS | None |
| All backgrounds have tier_required | PASS | None |
| All 15 command schemas have additionalProperties:false | PASS | None |
| 5 new schemas valid JSON | PASS | None |
| Schema validator (tools/schema-validate.js) | FAIL — 2 false failures | Key mismatch (catalog/items, apollo/apollo_group) |
| No-secret audit | PASS | None |
| .gitignore complete | PASS (with minor *.crt gap) | None |
| credentialGuard 9 patterns | PASS | None |
| Docker workstation compose (NVIDIA) | PASS | None |
| Docker VPS compose (isolated) | PASS (code) | Requires VPS SSH to deploy |
| docs/16_TODAY_READY_SETUP_GUIDE.md | EXISTS | None |
| docs/17_FIRST_RUN_FOR_DAVE_AND_SHERRI.md | EXISTS | None |
| docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md | EXISTS | None |
| docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md | EXISTS | None |
| NO_SECRET_AUDIT.md | PASS but stale branch reference | Update branch to feature/b2-usable-local-mock |

---

## Open Blockers (requires live TV, VPS, or real credentials)

| Blocker | File | Unblocked By |
|---|---|---|
| Tizen authkey for TV deployment | BLOCKER_BUILD_AUTHKEY.md | Samsung developer account + Tizen Studio |
| Real IPTV provider credentials | BLOCKER_PROVIDER_CREDS.md | Apollo Group / XtremeHD account |
| Azure TTS subscription | BLOCKER_AZURE_TTS.md | Azure account + Speech resource |
| VPS SSH access | BLOCKER_VPS_SSH.md | Hostinger VPS credentials |

---

## P1 Gaps That Must Be Fixed for B2 Demo Polish

| Gap | File | Fix Required |
|---|---|---|
| Chatbot does not call /api/ui-command/validate | FloatingChatbot.jsx | Wire validateCommand() + onCommand prop |
| StreamingQualityBar reads wrong health_score path | StreamingQualityBar.jsx | Read source_health.health_score |
| SourceComparePanel same health_score path issue | SourceComparePanel.jsx | Same fix |
| Actor IDs: act-001 vs actor-001 in catalog.js | catalog.js | Use actor-001 format |
| No profile switch button in Settings panel | App.jsx | Add "Switch Profile" button |
| CSS backdrop-filter missing -webkit- prefix | index.css | Add -webkit-backdrop-filter |
| CatalogCard missing onKeyDown for Enter/Space | CatalogCard.jsx | Add keyboard handler |

---

## P2 Gaps for B3 Planning

| Gap | Description |
|---|---|
| Schema validator false failures | Fix catalog/items key, apollo/apollo_group, profiles[] expectation |
| avplayEngine onerror does not propagate to UI | Add onError callback in onerror and prepareAsync error handlers |
| TTS not connected to chatbot | B3 feature |
| Real QR code (not static SVG) | B3 feature |
| Profile switch button in Settings | Add to App.jsx Settings panel |
| Rate limiter on API | B3 feature |

---

## B2 Demo Day Readiness Score

| Category | Score | Notes |
|---|---|---|
| Core web app shell | 9/10 | Minor accessibility gaps |
| Mock data completeness | 9/10 | Actor ID mismatch in live API |
| Profile system | 9/10 | No switch button in settings |
| Catalog + filters | 9/10 | Quality filter reads wrong path |
| Chatbot | 4/10 | 0 of 15 commands wired |
| Source health display | 3/10 | Wrong data path |
| Tizen readiness | 8/10 | Authkey blocked |
| Security | 9/10 | Minor gaps |
| Schema validation | 5/10 | Tool reports false failures |
| Documentation | 9/10 | 20 docs, 4 setup guides |

**Overall B2 readiness: 7.4/10**

The demo is visually impressive and functionally solid for a mock phase, but the chatbot commands and quality bar are the two most visible failure points for a stakeholder demo.

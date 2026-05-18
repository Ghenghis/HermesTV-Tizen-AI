# HermesTV — Doc 10: Acceptance Gates, Visual Verification & Runtime Security

**Version:** 1.1.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (Sherri — enhanced tier) · UN55CU8000BXZA (Dave — baseline tier)  
**Status:** BINDING — nothing ships without passing all applicable gates for a given build phase

**Proof rule:** Every gate must produce a named artifact (screenshot path, JSON log path, CLI command + output, or test result file). A gate that says "verify X works" without specifying HOW to verify and WHERE the artifact lands is not a valid gate. Human on-TV observation is required for all VISUAL-GATE-* entries; artifact screenshots taken via `sdb pull` or Samsung Remote Test Lab are the accepted evidence format.

---

## 1. Purpose

This document is the master acceptance gate registry. It consolidates all proof gates from docs 03–12, adds visual verification requirements, and defines runtime security rules. Every build phase (B1–B4) has a subset of gates that must pass before any code ships to either TV.

**Both TVs are required in every proof gate that touches the UI, rendering, profiles, security, or performance.** A gate verified on one TV only is not passing.

---

## 2. Gate Taxonomy

| Code Prefix | Source Doc | Domain |
|---|---|---|
| `LAYOUT-GATE-*` | Doc 04 | Layout presets, focus engine |
| `THEME-GATE-*` | Doc 05 | Theme/background rendering |
| `AGENT-GATE-*` | Doc 06 | Agent command schema validation |
| `PROVIDER-GATE-*` | Doc 07 | Provider catalog, QR onboarding, credential security |
| `QUALITY-GATE-*` | Doc 07 quality section | Stream quality detection and display |
| `BACKEND-GATE-*` | Doc 08 | VPS backend services |
| `BUILD-GATE-*` | Doc 09 | Build pipeline, ES5 compatibility, sideload |
| `PROFILE-GATE-*` | Doc 11 | User profiles, agent naming, TTS |
| `EPG-GATE-*` | Doc 12 | EPG grid, content discovery |
| `VISUAL-GATE-*` | This doc | On-device visual regression checks |
| `SECURITY-GATE-*` | This doc | Runtime security and input safety |
| `RUNTIME-GATE-*` | This doc | Memory, performance, stability |
| `TIER-GATE-*` | This doc | QN/UN tier asymmetry enforcement |

All gates from docs 03–12 are incorporated by reference. This document adds the `VISUAL-GATE-*`, `SECURITY-GATE-*`, `RUNTIME-GATE-*`, `PROVIDER-GATE-*`, and `TIER-GATE-*` suites.

---

## 3. Build Phase Gate Matrix

| Gate Suite | B1 (Scaffold) | B2 (Core UI) | B3 (Player + AI) | B4 (Full Ship) |
|---|---|---|---|---|
| BUILD-GATE-01–03 (build output) | ✅ Required | ✅ | ✅ | ✅ |
| BUILD-GATE-04–05 (installs on both TVs) | — | ✅ Required | ✅ | ✅ |
| BUILD-GATE-06–10 (caps detection, voice) | — | — | ✅ Required | ✅ |
| LAYOUT-GATE-* | — | ✅ Required | ✅ | ✅ |
| THEME-GATE-* | — | ✅ Required | ✅ | ✅ |
| AGENT-GATE-* | — | — | ✅ Required | ✅ |
| PROVIDER-GATE-* | — | — | ✅ Required | ✅ |
| QUALITY-GATE-* | — | — | ✅ Required | ✅ |
| BACKEND-GATE-* | — | — | ✅ Required | ✅ |
| PROFILE-GATE-* | — | — | ✅ Required | ✅ |
| EPG-GATE-* | — | — | — | ✅ Required |
| VISUAL-GATE-* | — | ✅ Required | ✅ | ✅ |
| SECURITY-GATE-* | ✅ Required | ✅ | ✅ | ✅ |
| RUNTIME-GATE-* | — | ✅ Required | ✅ | ✅ |
| TIER-GATE-* | — | ✅ Required | ✅ | ✅ |

---

## 4. Visual Acceptance Gates (VISUAL-GATE-*)

All visual gates are verified by human observation on the physical TV. Screenshots must be taken via `sdb pull /tmp/<screenshot>.png proof/screenshots/<tv_model>/` or Samsung Remote Test Lab capture. Each gate requires an artifact on **both** TVs unless explicitly marked as TV-specific.

**Artifact naming convention:** `proof/screenshots/<tv_model>/<gate_id>__<preset_or_theme_or_context>.png`
- QN85Q7FAAFXZA screenshots → `proof/screenshots/QN85Q7FAAFXZA/`
- UN55CU8000BXZA screenshots → `proof/screenshots/UN55CU8000BXZA/`

### 4.1 Layout Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-01 | QN85Q7FAAFXZA (Sherri) | Launch app → home screen | No blank flash; content appears ≤ 3s; Enhanced layout variant loads; `renderer_tier: "enhanced"` in `proof/tier-detection/` | `proof/screenshots/QN85Q7FAAFXZA/VISUAL-GATE-01__home.png` |
| VISUAL-GATE-02 | UN55CU8000BXZA (Dave) | Launch app → home screen | Baseline layout loads; no enhanced-tier CSS applied; `renderer_tier: "baseline"` in `proof/tier-detection/` | `proof/screenshots/UN55CU8000BXZA/VISUAL-GATE-02__home.png` |
| VISUAL-GATE-03 | Both TVs | D-pad through all 12 layout presets (one by one via Settings) | Focus ring visible on every focusable element; no orphaned focus; back exits each preset cleanly | Focus traversal log per preset: `proof/focus-traversal/<preset_id>.json`; screenshots: `proof/screenshots/<tv_model>/VISUAL-GATE-03__<preset_id>.png` for all 12 presets on each TV |
| VISUAL-GATE-04 | Both TVs | Switch layouts via Settings layout picker | Transition completes in ≤ 500ms measured via `rAF` timestamp in console; no visual glitch or unstyled flash | `proof/screenshots/<tv_model>/VISUAL-GATE-04__layout-switch.png`; console timing log `proof/perf/layout-switch/<tv_model>.json` |
| VISUAL-GATE-05 | Both TVs | Inspect all 12 presets at full screen | All content stays within 5% margin from screen edge; no clipped text or truncated tiles | `proof/screenshots/<tv_model>/VISUAL-GATE-05__safe-zone__<preset_id>.png` for each of the 12 presets |
| VISUAL-GATE-06 | Both TVs | Measure primary text size via TV Devtools computed styles | Primary text ≥ 22px base (per theme contract `scale_base_px: 22`); Mom Mode ≥ 30px; no label truncation | `proof/screenshots/<tv_model>/VISUAL-GATE-06__text-size.png` + computed-style log |
| VISUAL-GATE-03A | Both TVs | All 12 preset JSON files present and valid | `node -e "require('./schemas/layouts/<id>.json')"` passes for all 12 presets; no missing required fields | CLI output saved to `proof/layout-validation/schema-check.log` |
| VISUAL-GATE-03B | Both TVs | Frame budget per preset on Dave's TV | `proof/perf/<preset_id>.dave.json` exists and reports 0 dropped frames during scroll + focus + transition for all 12 presets | `proof/perf/<preset_id>.dave.json` (12 files required) |
| VISUAL-GATE-03C | QN85Q7FAAFXZA (Sherri) | Enhanced overrides applied automatically per preset | `proof/perf/<preset_id>.mom.json` shows `renderer_tier: "enhanced"` with enhanced overrides; no manual toggle in test run | `proof/perf/<preset_id>.mom.json` (12 files required) |

### 4.2 Theme Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-07 | Both TVs | Switch between Cinema Dark, Midnight Steel, and Mom Calm themes | CSS variables apply in ≤ 1 frame; no white flash; no unstyled content flash | `proof/screenshots/<tv_model>/VISUAL-GATE-07__theme-switch-<theme_id>.png` (6 screenshots — 3 themes × 2 TVs) |
| VISUAL-GATE-07A | Both TVs | All 24 theme JSON schema files present and valid | `node -e "require('./schemas/themes/<id>.json')"` passes for all 24 themes | `proof/theme-validation/schema-check.log` |
| VISUAL-GATE-07B | Both TVs | Contrast audit for all 24 themes | `proof/contrast/<theme_id>.json` exists for all 24 themes; all report WCAG AA; accessibility family reports WCAG AAA | 24 contrast artifact files required |
| VISUAL-GATE-08 | Both TVs | Apply Cinema Dark (`midnight_steel`) theme | Background is `#0B0D10`; text is `#F2F4F7`; no pure white (`#FFFFFF`) anywhere in non-badge elements | `proof/screenshots/<tv_model>/VISUAL-GATE-08__midnight-steel.png` |
| VISUAL-GATE-09 | QN85Q7FAAFXZA (Sherri) only | Enable a motion background pack (`ambient_motion_01`) | Motion background plays in loop; no frame drop below 28fps during animation; loop seam not visible | `proof/screenshots/QN85Q7FAAFXZA/VISUAL-GATE-09__motion-bg.png`; `proof/perf/background/ambient_motion_01.mom.json` showing fps ≥ 28 |
| VISUAL-GATE-10 | UN55CU8000BXZA (Dave) only | Attempt to apply an enhanced-only background pack | Router substitutes `baseline_partner`; static background displays; no motion; audit ledger entry shows `applied_with_substitution` | `proof/screenshots/UN55CU8000BXZA/VISUAL-GATE-10__static-bg.png`; ledger entry in `proof/agent-commands/<session_id>.jsonl` |
| VISUAL-GATE-11 | Both TVs | Leave app idle on `ambient_idle` layout for 5 minutes | Burn-in protection activates: static text elements shift position within first 60s; clock/date block repositions; no static high-contrast region persists > 60s | `proof/screenshots/<tv_model>/VISUAL-GATE-11__burn-in-<t=0s>.png` and `proof/screenshots/<tv_model>/VISUAL-GATE-11__burn-in-<t=65s>.png` |
| VISUAL-GATE-11A | Both TVs | Enable high-contrast mode | Active theme swaps to its `_high_contrast` partner; focus ring thickness increases ≥ 50%; badges have stroked outlines | `proof/screenshots/<tv_model>/VISUAL-GATE-11A__high-contrast-<theme_id>.png` |
| VISUAL-GATE-11B | Both TVs | Enable reduced-motion mode | All motion background packs swap to static partner; cinematic hero shows static poster; focus ring glow disabled | `proof/screenshots/<tv_model>/VISUAL-GATE-11B__reduced-motion.png` |
| VISUAL-GATE-11C | QN85Q7FAAFXZA (Sherri) — mom_tv profile | Mom Mode default state | Layout = `mom_jumbo_rail`; theme = `mom_calm`; background = `mom_garden_calm` (motion); reduced motion = on; high contrast = on; audio feedback on | `proof/screenshots/QN85Q7FAAFXZA/VISUAL-GATE-11C__mom-mode.png` |

### 4.3 Quality Badge Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-12 | Both TVs | Browse catalog with quality-scanned items | Quality badge visible in card; correct tier label (4K/1080p/720p/etc.); badge color matches theme token | `proof/screenshots/<tv_model>/VISUAL-GATE-12__quality-badge.png` |
| VISUAL-GATE-13 | Both TVs | Browse items where quality scanner fired upscale heuristic | `⚠` character appended to badge when `possible_upscale: true` and ≥ 2 heuristics triggered | `proof/screenshots/<tv_model>/VISUAL-GATE-13__upscale-badge.png` |
| VISUAL-GATE-14 | QN85Q7FAAFXZA (Sherri) only | Play HDR-capable stream | Gold `HDR10` badge with box-shadow glow appears on Sherri's TV | `proof/screenshots/QN85Q7FAAFXZA/VISUAL-GATE-14__hdr-badge.png` |
| VISUAL-GATE-14A | UN55CU8000BXZA (Dave) only | Same stream from VISUAL-GATE-14 | HDR badge glow does not appear (no `backdrop-filter` or `box-shadow` enhanced effect); standard badge only | `proof/screenshots/UN55CU8000BXZA/VISUAL-GATE-14A__no-hdr-glow.png` |
| VISUAL-GATE-15 | Both TVs | Toggle stats overlay during playback (long-press ⚙ or via chatbot command) | Overlay appears in bottom-right during playback; does not cover subtitle zone; D-pad can dismiss it | `proof/screenshots/<tv_model>/VISUAL-GATE-15__stats-overlay.png` |

### 4.4 AI Overlay Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-16 | Both TVs | Invoke Hermes overlay via remote | Slides in from bottom 30% of screen; backdrop dims content to 60%; D-pad navigates into overlay | `proof/screenshots/<tv_model>/VISUAL-GATE-16__hermes-overlay.png` |
| VISUAL-GATE-17 | Both TVs | Trigger agent action card during playback | Card appears bottom-left; does not cover subtitle zone; countdown progress bar visible; D-pad selects OK/Cancel | `proof/screenshots/<tv_model>/VISUAL-GATE-17__action-card.png` |
| VISUAL-GATE-18 | Both TVs | Check chatbot header | Correct agent name shown with `[AI]` badge (e.g., "Nova [AI]" or the user-configured name); not "Hermes" if renamed; not "Mom" as a display name | `proof/screenshots/<tv_model>/VISUAL-GATE-18__chatbot-header.png` |
| VISUAL-GATE-19 | Both TVs | Check suggestion chips in chatbot | D-pad selectable chips visible below input area; focused chip highlighted with focus ring; up/down/left/right navigates | `proof/screenshots/<tv_model>/VISUAL-GATE-19__suggestion-chips.png` |
| VISUAL-GATE-20 | Both TVs | Trigger Azure TTS response | Visual speaking indicator (animated dots or waveform) visible while Azure TTS audio plays; indicator stops when audio ends; no Bixby audio output | `proof/screenshots/<tv_model>/VISUAL-GATE-20__tts-indicator.png`; audio source confirmed by checking `sdb shell ps | grep bixby` returns empty during TTS playback |

### 4.5 EPG Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-21 | Both TVs | Load EPG grid with 50+ channels in `epg_strip` layout | Grid renders without blank rows; time axis visible at top; no layout overflow | `proof/screenshots/<tv_model>/VISUAL-GATE-21__epg-grid.png` |
| VISUAL-GATE-22 | Both TVs | Check now-playing indicator in EPG | Current program block highlighted in accent color; progress fill visible; time matches system clock | `proof/screenshots/<tv_model>/VISUAL-GATE-22__now-playing.png` |
| VISUAL-GATE-23 | Both TVs | D-pad navigation in EPG grid | D-pad moves focus correctly: left/right = programs in row, up/down = channels; no focus trap; back exits EPG | Focus traversal confirmed by human; `proof/screenshots/<tv_model>/VISUAL-GATE-23__epg-focus.png` |
| VISUAL-GATE-24 | Both TVs | Focus a program block in EPG | Title + start/end time + description appear in side panel; content does not overflow panel bounds | `proof/screenshots/<tv_model>/VISUAL-GATE-24__epg-detail.png` |

### 4.6 Provider & QR Onboarding Visual Gates

| Gate | TV | Test | Pass Criteria | Artifact |
|---|---|---|---|---|
| VISUAL-GATE-25 | Both TVs | Open Provider Settings view | Provider health, last refresh time, slot usage shown; no raw credentials, portal URLs, or tokens visible anywhere on screen | `proof/screenshots/<tv_model>/VISUAL-GATE-25__provider-settings.png`; confirm by visual scan |
| VISUAL-GATE-26 | Both TVs | Trigger "Add Provider" → QR onboarding screen | QR code and short pairing code displayed; countdown timer shows 10-minute TTL; no credential fields on TV screen | `proof/screenshots/<tv_model>/VISUAL-GATE-26__qr-onboarding.png` |
| VISUAL-GATE-27 | Both TVs | Diagnostics export review | Export file opened and reviewed: all credential/password/token/URL fields replaced with `[REDACTED]`; command: `grep -iE "(password|token|m3u|xtream|portal|username)" proof/diagnostics-export-<tv>.json` → zero matches | CLI output saved to `proof/security/diagnostics-redaction-<tv_model>.log` |

---

## 5. Runtime Security Gates (SECURITY-GATE-*)

### 5.0 Credential Absence Gates (required from B1 onward — must never regress)

These gates must be green on every build before any merge. They apply to both TVs and the entire repo.

| Gate | How to verify | Pass Criteria | Artifact |
|---|---|---|---|
| SECURITY-GATE-00A | `git log --all -p \| grep -iE "(password\|token\|m3u_url\|xtream\|portal_url\|username.*=)" ` | Zero matches | `proof/security/repo-scan-<build_sha>.log` |
| SECURITY-GATE-00B | Grep the built `.wgt` bundle: `unzip -o dist/hermestv.wgt -d /tmp/wgt_check && grep -riE "(password\|token\|xtream\|portal\|username)" /tmp/wgt_check/` | Zero matches | `proof/security/bundle-scan-<build_sha>.log` |
| SECURITY-GATE-00C | TV localStorage/sessionStorage inspection on both TVs: open Tizen Web Inspector → Application → Storage; search for credential patterns | Zero credential-pattern values in localStorage, sessionStorage, IndexedDB, or cookies on QN85Q7FAAFXZA and UN55CU8000BXZA | `proof/security/tv-storage-scan-QN85Q7FAAFXZA.txt` and `proof/security/tv-storage-scan-UN55CU8000BXZA.txt` |
| SECURITY-GATE-00D | Backend log rotation sample review: `grep -iE "(password\|token\|m3u\|xtream\|portal)" logs/backend.log` | Zero unredacted matches; all credential fields show `[REDACTED]` or masked form | `proof/security/backend-log-scan.log` |
| SECURITY-GATE-00E | Diagnostics export review on both TVs: trigger export → `grep -iE "(password\|token\|m3u\|xtream\|portal\|username)" <export_file>` | Zero matches | `proof/security/diagnostics-scan-QN85Q7FAAFXZA.log` and `proof/security/diagnostics-scan-UN55CU8000BXZA.log` |
| SECURITY-GATE-00F | Visual QA of all VISUAL-GATE-* screenshots: manual review of every screenshot in `proof/screenshots/` | No credential string, portal URL, M3U link, username, or password visible in any screenshot overlay, toast, debug panel, or settings screen | Reviewed screenshot set documented in `proof/security/screenshot-review-<build_sha>.md` |
| SECURITY-GATE-00G | Apollo and XtremeHD provider IDs are the only identifiers in TV-facing API responses; no credentials in response bodies | `curl <tv_api>/v1/providers` and inspect all fields — zero credential values | `proof/security/api-response-scan.json` |

### 5.1 Agent Command Security

| Gate | TV | How to verify | Pass Criteria | Artifact |
|---|---|---|---|---|
| SECURITY-GATE-01 | Both TVs | Send `wipe_app` command via agent API; check audit ledger | `cmd-router` returns `rejected_validation`; audit ledger entry shows `result: "rejected_validation"`; no action taken | `proof/agent-commands/tests/forbidden/wipe_app.json` |
| SECURITY-GATE-02 | Both TVs | Send `clear_watch_history` command via agent API | Rejected with `rejected_validation`; command not on allowlist | `proof/agent-commands/tests/forbidden/clear_watch_history.json` |
| SECURITY-GATE-03 | QN85Q7FAAFXZA (Sherri) | Send `set_low_memory_mode: true` targeting `mom_tv` profile on Sherri's TV | Rejected with `rejected_policy` before confirm gate; audit ledger entry confirms rejection | `proof/agent-commands/tests/qn-non-limiting/set_low_memory_mode.json` |
| SECURITY-GATE-03A | QN85Q7FAAFXZA (Sherri) | Send `set_animation_density: "off"` from an agent (not system_user_settings role) | Rejected with `rejected_policy`; denied before any UI side effect | `proof/agent-commands/tests/qn-non-limiting/set_animation_density.json` |
| SECURITY-GATE-03B | QN85Q7FAAFXZA (Sherri) | Send `set_background_intensity: "static"` from an agent | Rejected with `rejected_policy` | `proof/agent-commands/tests/qn-non-limiting/set_background_intensity.json` |
| SECURITY-GATE-03C | QN85Q7FAAFXZA (Sherri) | Send `set_preview_cache_size: "small"` from an agent | Rejected with `rejected_policy` | `proof/agent-commands/tests/qn-non-limiting/set_preview_cache_size.json` |
| SECURITY-GATE-03D | QN85Q7FAAFXZA (Sherri) | Send `set_poster_cache_size: "small"` from an agent | Rejected with `rejected_policy` | `proof/agent-commands/tests/qn-non-limiting/set_poster_cache_size.json` |
| SECURITY-GATE-04 | Both TVs | Send `set_low_memory_mode: true` with `temporary: true`, `timeout_seconds: 120`, `rollback_on_timeout: true`, and valid `reason` from agent to Dave's profile on Dave's TV | Accepted; status chip visible in UI showing reason and countdown; auto-rollback confirmed at t=120s | `proof/agent-commands/tests/temporary-protection/set_low_memory_mode-dave.json` |
| SECURITY-GATE-05 | Both TVs | Send 6 commands within 30s from the same agent (exceeding 5/30s rate) | 6th command returns `rejected_rate_limit`; UI shows "Agent paused (rate limit)" chip | `proof/agent-commands/tests/rate-limit/rate-limit-exceeded.json` |
| SECURITY-GATE-06 | Both TVs | Open Settings → System → Agent History | Last 20 commands listed in plain language; each has result and timestamp; undoable commands show "Undo this" button; D-pad navigable without AI interaction | `proof/screenshots/<tv_model>/SECURITY-GATE-06__agent-history.png` |
| SECURITY-GATE-06A | Both TVs | Attempt `rollback_last_command` via round-trip test | Apply `update_theme`; audit ledger has `rollback_token`; issue `rollback_last_command` with that token; theme reverts; second ledger entry shows `result: "applied"` | `proof/agent-commands/tests/rollback/update_theme-roundtrip.json` |
| SECURITY-GATE-06B | Both TVs | dry_run mode for `update_layout` | Send command with `dry_run: true`; router returns would-be diff; no UI state changes; UI unchanged | `proof/agent-commands/tests/dry-run/update_layout-dryrun.json` |

### 5.2 Input Sanitization

| Gate | TV | How to verify | Pass Criteria | Artifact |
|---|---|---|---|---|
| SECURITY-GATE-07 | Both TVs | Set display name to `<script>alert(1)</script>` via Settings | Stored as literal text string; rendered escaped in UI; no JS execution; no alert dialog | `proof/screenshots/<tv_model>/SECURITY-GATE-07__xss-display-name.png` |
| SECURITY-GATE-08 | Both TVs | Type `<b>bold</b><img src=x onerror=alert(1)>` into chatbot input | Text stripped or escaped before display; no DOM injection; no alert; rendered as plain text | `proof/screenshots/<tv_model>/SECURITY-GATE-08__html-chat-input.png` |
| SECURITY-GATE-09 | Both TVs | Inject a `javascript:alert(1)` URL into M3U stream URL field (via backend test fixture) | AVPlay rejects stream; error toast shown to user; no JS execution | `proof/screenshots/<tv_model>/SECURITY-GATE-09__javascript-url-reject.png` |
| SECURITY-GATE-10 | Both TVs | Enter `'; DROP TABLE channels; --` in search input | Treated as literal search text; no query injection; backend search returns zero results for that literal string; no error | `proof/screenshots/<tv_model>/SECURITY-GATE-10__sql-injection-search.png` |
| SECURITY-GATE-10A | Both TVs | Agent command field contains `javascript:` substring | Router rejects with `rejected_validation` before any processing; forbidden-substring rule in doc 06 triggered | `proof/agent-commands/tests/forbidden-field/javascript-scheme.json` |
| SECURITY-GATE-10B | Both TVs | Agent command field contains a URL (any `http://` or `https://`) | Router rejects with `rejected_validation` | `proof/agent-commands/tests/forbidden-field/url-in-field.json` |

### 5.3 Profile Security

| Gate | TV | How to verify | Pass Criteria | Artifact |
|---|---|---|---|---|
| SECURITY-GATE-11 | Both TVs | Authenticate as Dave's session; request Sherri's catalog and favorites via API | Backend returns 403 or empty result; no cross-profile data returned; Dave's TV cannot read Mom's favorites | API response recorded in `proof/security/cross-profile-isolation.json` |
| SECURITY-GATE-11A | Both TVs | Switch profile from `dave_tv` to `mom_tv` | Profile switch requires `requires_user_confirm: true` confirm card; Mom's data loads fresh from backend; Dave's cached UI state is cleared | `proof/screenshots/<tv_model>/SECURITY-GATE-11A__profile-switch.png` |
| SECURITY-GATE-12 | Both TVs | Trigger profile export via Settings → Profile → Export | Exported JSON reviewed: zero PIN hash, zero credential, zero password values | `grep -iE "(pin\|hash\|password\|credential)" proof/export-<profile>.json` → zero matches; output saved |
| SECURITY-GATE-13 | Both TVs | Use guest mode then close app; re-launch | `sessionStorage` is empty on re-launch (confirmed via Web Inspector); no guest data in profiles directory on backend | `proof/security/guest-mode-cleanup-<tv_model>.txt` |

### 5.4 TTS / Voice Security

| Gate | TV | How to verify | Pass Criteria | Artifact |
|---|---|---|---|---|
| SECURITY-GATE-14 | Both TVs | Send TTS request where text contains `<audio src="http://evil.com/inject.mp3"/>` | Text is XML-escaped before SSML construction; no injected audio elements; Azure receives only safe SSML | Backend SSML log reviewed in `proof/security/tts-ssml-injection-test.json` |
| SECURITY-GATE-15 | Both TVs | Call TTS proxy endpoint without a valid `profile_id` | Proxy returns 401; no audio generated; no Azure credit consumed | HTTP response log in `proof/security/tts-auth-reject.json` |
| SECURITY-GATE-15A | Both TVs | Confirm Azure TTS is the only audio output path | `sdb shell grep -r "bixby\|voiceinteraction\|samsung.*voice" /apps/hermestv/` → zero matches; no Bixby or Samsung AI audio calls | `proof/security/no-bixby-scan-<tv_model>.log` |
| SECURITY-GATE-15B | Both TVs | Samsung microphone usage | Confirm Samsung mic is used only for optional voice input capture; no Bixby AI, no Samsung TTS, no Samsung memory/personality | Code audit: `grep -r "bixby\|voiceinteraction" src/` → zero matches; `proof/security/no-bixby-src-scan.log` |

### 5.5 Provider Credential Security Gates (PROVIDER-GATE-*)

These gates are incorporated from `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`. All must pass before B4 ship.

| Gate | How to verify | Pass Criteria | Artifact |
|---|---|---|---|
| PROVIDER-GATE-01 | `git log --all -p \| grep -iE "(password\|token\|m3u\|xtream\|portal\|username)"` | Zero matches | `proof/security/repo-credential-scan.log` (same as SECURITY-GATE-00A; cross-referenced) |
| PROVIDER-GATE-02 | Grep built `.wgt` for credential patterns (same as SECURITY-GATE-00B) | Zero matches in bundle | `proof/security/bundle-credential-scan.log` |
| PROVIDER-GATE-03 | TV Web Inspector: inspect localStorage, sessionStorage, IndexedDB on both TVs | Zero credential-pattern values on both QN85Q7FAAFXZA and UN55CU8000BXZA | `proof/security/tv-storage-QN85Q7FAAFXZA.txt` and `proof/security/tv-storage-UN55CU8000BXZA.txt` |
| PROVIDER-GATE-04 | Backend log review for credential patterns | All credential appearances in logs are `[REDACTED]` or masked | `proof/security/backend-log-credential-scan.log` |
| PROVIDER-GATE-05 | QR token expiry automated test: generate token → wait 10+ minutes → attempt to use → inspect HTTP response | Backend returns 401; unused token expired | `proof/security/qr-token-expiry.json` |
| PROVIDER-GATE-06 | QR token single-use automated test: use token once (successfully) → use same token again → inspect HTTP response | Second use returns 410 Gone | `proof/security/qr-token-single-use.json` |
| PROVIDER-GATE-07 | Stream slot enforcement: start 2 concurrent streams on a 2-slot account → attempt a 3rd | Third stream returns `stream_limit_reached`; TV shows user-facing card: "Your provider allows 2 streams. You are using all slots." | `proof/security/stream-slot-enforcement.json` |
| PROVIDER-GATE-08 | Network probe: attempt to reach QR setup page from external IP (not LAN) | Connection refused or 403; page not reachable from outside the local network | `proof/security/setup-page-external-probe.log` |
| PROVIDER-GATE-09 | Remove provider → re-onboard via QR → catalog re-appears | No data from previous credential run leaks back; fresh ingest; `proof/security/provider-remove-readd.json` confirms clean state | `proof/security/provider-remove-readd.json` |

---

## 6. Runtime Performance Gates (RUNTIME-GATE-*)

All performance gates must be measured on both target TVs unless explicitly marked as TV-specific. Artifacts must include the TV model in the filename.

### 6.1 Memory

| Gate | TV | Threshold | How to verify | Artifact |
|---|---|---|---|---|
| RUNTIME-GATE-01 | QN85Q7FAAFXZA (Sherri) | JS heap ≤ 150 MB | Measure via `performance.memory.usedJSHeapSize` in Tizen Web Inspector after 30 min active use (4 presets, 10 channel changes) | `proof/perf/memory/30min-QN85Q7FAAFXZA.json` — includes timestamps + heap values |
| RUNTIME-GATE-02 | UN55CU8000BXZA (Dave) | JS heap ≤ 250 MB | Same measurement on Dave's TV | `proof/perf/memory/30min-UN55CU8000BXZA.json` |
| RUNTIME-GATE-03 | Both TVs | No continuous heap growth trend | Sample heap every 5 min over 30 min (6 samples); no monotonically increasing trend across all 6 samples | Both `proof/perf/memory/30min-<tv_model>.json` files — heap samples column analyzed |
| RUNTIME-GATE-04 | Both TVs | AVPlay released on navigation | After navigating away from player, confirm `avplay.destroy()` called: `sdb shell logcat | grep "avplay destroy"` → 1 match per navigation; re-navigate = no duplicate player instances | `proof/perf/avplay-lifecycle-<tv_model>.log` |

### 6.2 Frame Performance

**Frame rate thresholds per tier:** Sherri's QN85 (enhanced tier) must hold ≥ 28fps during animations. Dave's UN55 (baseline tier, performance floor) must hold ≥ 24fps during D-pad navigation — the baseline rendering budget is intentionally lighter on Dave's hardware. The 28fps floor was set for enhanced-tier motion backgrounds; Dave's baseline tier uses static/slow-fade only which has a lower animation cost floor.

| Gate | TV | Threshold | How to verify | Artifact |
|---|---|---|---|---|
| RUNTIME-GATE-05 | QN85Q7FAAFXZA (Sherri) | UI animations ≥ 28fps | Measure `rAF` delta-time during: D-pad navigation across all 12 presets, motion background playback, chatbot overlay slide-in | `proof/perf/fps/rAF-QN85Q7FAAFXZA.json` — min/avg/max fps per test scenario |
| RUNTIME-GATE-06 | UN55CU8000BXZA (Dave) | UI animations ≥ 24fps | Measure `rAF` delta-time during D-pad navigation across all 12 presets on baseline tier (static backgrounds only); no enhanced animations run on Dave's TV | `proof/perf/fps/rAF-UN55CU8000BXZA.json` — min/avg/max fps per test scenario |
| RUNTIME-GATE-07 | Both TVs | Player frame drop < 1% of decoded frames | `AVPlayExtension.ondecodeframerate` callback: log decoded frames and dropped frames for a 5-minute stream; compute drop percentage | `proof/perf/player-fps/ondecodeframerate-<tv_model>.json` |
| RUNTIME-GATE-07A | UN55CU8000BXZA (Dave) | Dave 30-min responsiveness: frame budget does not degrade | `proof/perf/dave-30min/<session_id>.json` shows fps in final 5 min ≥ fps in first 5 min (no degradation); same test as doc 04 proof gate 2 | `proof/perf/dave-30min/<session_id>.json` |
| RUNTIME-GATE-07B | QN85Q7FAAFXZA (Sherri) | QN 30-min non-limiting: enhanced tier maintained throughout | `proof/perf/qn-30min/<session_id>.json` shows `renderer_tier: "enhanced"` throughout; no `low_memory_mode` event; no system-imposed downgrade | `proof/perf/qn-30min/<session_id>.json` |

### 6.3 Startup

| Gate | TV | Threshold | How to verify | Artifact |
|---|---|---|---|---|
| RUNTIME-GATE-08 | Both TVs | First contentful paint ≤ 3s | Timestamp from app launch signal to first visible DOM content painted; measured via `PerformanceObserver` or `sdb shell logcat` timing markers | `proof/perf/startup/fcp-<tv_model>.json` — FCP timestamp in ms |
| RUNTIME-GATE-09 | Both TVs | Profile switcher interactive ≤ 2s | Time from FCP until profile tiles respond to D-pad input; measured by timed D-pad press + response logging | `proof/perf/startup/profile-switcher-<tv_model>.json` |
| RUNTIME-GATE-10 | Both TVs | Player first frame ≤ 5s | Time from OK press on a stream to first decoded video frame; measured via `AVPlayExtension` first-frame event | `proof/perf/startup/player-first-frame-<tv_model>.json` |

### 6.4 Stability

| Gate | TV | Requirement | How to verify | Artifact |
|---|---|---|---|---|
| RUNTIME-GATE-11 | Both TVs | App runs 4h without crash or JS error | Leave app running for 4h with periodic D-pad activity; no uncaught JS error in `sdb shell logcat`; no app restart | `proof/perf/stability/4h-run-QN85Q7FAAFXZA.log` and `proof/perf/stability/4h-run-UN55CU8000BXZA.log` — filtered logcat output |
| RUNTIME-GATE-12 | Both TVs | Network disconnect/reconnect recovery | Disconnect TV from LAN for 60s; reconnect; confirm app resumes without user restart; catalog re-loads automatically | `proof/screenshots/<tv_model>/RUNTIME-GATE-12__network-recovery.png` taken after reconnect |
| RUNTIME-GATE-13 | Both TVs | Back button always handled | Press Back from every top-level screen; confirm TV never reaches OS default terminate / launcher; confirm back from home shows exit confirm dialog | `proof/screenshots/<tv_model>/RUNTIME-GATE-13__back-handled.png` |
| RUNTIME-GATE-14 | Both TVs | AVPlay error recovery within 10s | Force an AVPlay error (e.g., kill stream mid-play); confirm stream restarts within 10s; no permanent black screen | `proof/screenshots/<tv_model>/RUNTIME-GATE-14__avplay-recovery.png`; `sdb shell logcat` showing restart event within 10s |
| RUNTIME-GATE-15 | Both TVs | `window.onbeforeunload` cleanup | Trigger app close via Back + confirm; verify `avplay.stop()` and `avplay.destroy()` called: `sdb shell logcat \| grep -E "(avplay.stop\|avplay.destroy)"` → both messages present | `proof/perf/avplay-cleanup-<tv_model>.log` |

---

## 7. Tier Asymmetry Enforcement Gates (TIER-GATE-*)

These gates specifically verify the QN/UN tier split is correct and enforced. Both TVs must be tested. Sherri's TV (QN85Q7FAAFXZA) must never be artificially capped; Dave's TV (UN55CU8000BXZA) must never be promoted.

| Gate | TV | How to verify | Pass Criteria | Artifact |
|---|---|---|---|---|
| TIER-GATE-01 | QN85Q7FAAFXZA (Sherri) | Boot app → inspect `proof/tier-detection/<session_id>.json` | `renderer_tier: "enhanced"`; enhanced layout/theme/CSS loaded automatically; no manual toggle performed | `proof/tier-detection/<session_id>-QN85Q7FAAFXZA.json` with `renderer_tier: "enhanced"` |
| TIER-GATE-02 | UN55CU8000BXZA (Dave) | Boot app → inspect `proof/tier-detection/<session_id>.json` | `renderer_tier: "baseline"`; baseline layout/theme/CSS loaded; no enhanced assets applied | `proof/tier-detection/<session_id>-UN55CU8000BXZA.json` with `renderer_tier: "baseline"` |
| TIER-GATE-03 | QN85Q7FAAFXZA (Sherri) | Send `set_low_memory_mode: true` from an agent (not system_user_settings) targeting Sherri's TV | Rejected with `result: "rejected_policy"` before confirm gate; no side effect; audit ledger records rejection | `proof/agent-commands/tests/qn-non-limiting/set_low_memory_mode.json` |
| TIER-GATE-04 | UN55CU8000BXZA (Dave) | Send `set_low_memory_mode: true` from an agent targeting Dave's profile on Dave's TV | Accepted; `result: "applied"`; low-memory mode effects active (tile density cap, no preview clips, static hero) | `proof/agent-commands/tests/baseline-perf/set_low_memory_mode-dave.json`; `proof/screenshots/UN55CU8000BXZA/TIER-GATE-04__low-memory-mode.png` |
| TIER-GATE-05 | QN85Q7FAAFXZA (Sherri) | Inspect AVPlay initial bitrate selection | AVPlay defaults to highest available bitrate; no `setStreamingProperty("PREBUFFER_MODE", ...)` or equivalent artificial cap applied; confirmed via `sdb shell logcat \| grep "AVPlay bitrate"` | `proof/perf/avplay-bitrate-init-QN85Q7FAAFXZA.log` |
| TIER-GATE-06 | UN55CU8000BXZA (Dave) | Inspect AVPlay initial bitrate selection | AVPlay starts at LOWEST or AUTO; user may override in Settings → Performance; no system-imposed cap beyond baseline defaults | `proof/perf/avplay-bitrate-init-UN55CU8000BXZA.log` |
| TIER-GATE-07 | Both TVs — diff | Load same preset and theme on both TVs; compare screenshots | `backdrop-filter`, HDR badge glow, and provider sparkline present on Sherri's TV only; absent on Dave's TV; confirmed by diffing screenshots | `proof/screenshots/QN85Q7FAAFXZA/TIER-GATE-07__enhanced-features.png` vs `proof/screenshots/UN55CU8000BXZA/TIER-GATE-07__baseline-features.png` |
| TIER-GATE-08 | Both TVs | Voice input availability check | If Samsung remote has a mic button: mic input capture works on both TVs; graceful "voice not available" message if mic absent; Bixby not invoked at any step | `proof/screenshots/<tv_model>/TIER-GATE-08__voice-input.png`; `proof/security/no-bixby-scan-<tv_model>.log` |
| TIER-GATE-09 | QN85Q7FAAFXZA (Sherri) | Settings → Performance tab on Sherri's TV | "Low memory mode" toggle is NOT present; renderer tier shown as `enhanced` (read-only chip); no option to downgrade tier | `proof/screenshots/QN85Q7FAAFXZA/TIER-GATE-09__performance-tab-qn.png` |
| TIER-GATE-10 | UN55CU8000BXZA (Dave) | Settings → Performance tab on Dave's TV | "Low memory mode" toggle IS present and togglable by user; renderer tier shown as `baseline` (read-only chip) | `proof/screenshots/UN55CU8000BXZA/TIER-GATE-10__performance-tab-un.png` |
| TIER-GATE-11 | QN85Q7FAAFXZA (Sherri) | 30-min session — QN non-limiting proof | `proof/perf/qn-30min/<session_id>.json` shows `renderer_tier: "enhanced"` for all 360 seconds; no `low_memory_mode` event; no `applied_with_substitution` from tier-downgrade; full enhanced cache budgets in use | `proof/perf/qn-30min/<session_id>.json` |

---

## 8. Agent Command Audit Verification

The audit log (Settings > System > Agent History) must show:

- Command type in plain language (e.g., "Switched theme to Cinema Dark")
- Timestamp
- Who issued it: agent name (e.g., "Nova") or "You" (if user-initiated)
- Result: Applied / Rejected / Rolled Back
- "Undo this" button (if action is undoable and within 5 minutes)

The audit log must be accessible via D-pad without any AI interaction — purely a settings screen. Agents cannot clear the audit log (forbidden action in doc 06).

**Verification method:** Open Settings → System → Agent History on **both** QN85Q7FAAFXZA and UN55CU8000BXZA; confirm the UI requirements above on each TV; take a screenshot of the history screen. Artifact: `proof/screenshots/<tv_model>/SECURITY-GATE-06__agent-history.png` (already gated under SECURITY-GATE-06).

**Audit ledger file verification:** After any test session, inspect `proof/agent-commands/<session_id>.jsonl`. Each line must include: `ts`, `command_id`, `agent_id`, `profile_id`, `tv_model_at_boot`, `renderer_tier_at_boot`, `action`, `requested_params`, `applied_params`, `result`, `errors`, `diff`, `rollback_token`. A missing field in any line is a gate failure.

---

## 9. Pre-Merge Checklist

Before merging any feature branch, confirm all items below. Each item specifies the exact command or verification method so there is no ambiguity.

**Repo and bundle credential scan:**
- [ ] `git log --all -p | grep -iE "(password|token|m3u_url|xtream|portal_url|username.*=)"` → zero matches; output saved to `proof/security/repo-scan-<sha>.log`
- [ ] `unzip -o dist/hermestv.wgt -d /tmp/wgt_check && grep -riE "(password|token|xtream|portal|username)" /tmp/wgt_check/` → zero matches; output saved to `proof/security/bundle-scan-<sha>.log`
- [ ] No Azure TTS key, Apollo credentials, or XtremeHD credentials in any committed file; vault file `G:\private\` or equivalent is in `.gitignore`

**Code quality:**
- [ ] No Bixby API calls in any `.js` file: `grep -r "bixby\|voiceinteraction\|samsung.*ai" src/` → zero matches; output saved to `proof/security/no-bixby-src-scan.log`
- [ ] No `console.log` left in production paths (only behind `if (DEBUG_MODE)` guard): `grep -rn "console\.log" src/ | grep -v "DEBUG_MODE"` → zero matches
- [ ] `bundle.js` passes ES5 validation: `node node_modules/.bin/acorn --ecmaVersion 5 --module dist/bundle.js > /dev/null` exits 0; output saved to `proof/build/es5-check-<sha>.log`

**TV installation and launch — both TVs required:**
- [ ] `sdb -s <QN85Q7FAAFXZA_ip> install dist/hermestv.wgt` exits 0; app launches on QN85Q7FAAFXZA without JS errors in logcat
- [ ] `sdb -s <UN55CU8000BXZA_ip> install dist/hermestv.wgt` exits 0; app launches on UN55CU8000BXZA without JS errors in logcat

**Visual and tier verification — both TVs required:**
- [ ] VISUAL-GATE-01 verified on QN85Q7FAAFXZA with screenshot artifact at `proof/screenshots/QN85Q7FAAFXZA/VISUAL-GATE-01__home.png`
- [ ] VISUAL-GATE-02 verified on UN55CU8000BXZA with screenshot artifact at `proof/screenshots/UN55CU8000BXZA/VISUAL-GATE-02__home.png`
- [ ] TIER-GATE-01 artifact `proof/tier-detection/<session_id>-QN85Q7FAAFXZA.json` shows `renderer_tier: "enhanced"`
- [ ] TIER-GATE-02 artifact `proof/tier-detection/<session_id>-UN55CU8000BXZA.json` shows `renderer_tier: "baseline"`

**Profile and agent names:**
- [ ] Agent name and display name are "Sherri" (or user-set) / "Dave" (or user-set) — never "Mom", "User", or default "Hermes" unless user has not renamed; confirmed via VISUAL-GATE-18 screenshot artifacts

**Gate ledger:**
- [ ] All required gates for the current build phase are green per section 3 matrix; gate failures are tracked as GitHub issues labeled `gate-failure`

---

## 10. Gate Failure Protocol

1. Any gate failure blocks the phase transition — no exceptions.
2. Open a GitHub issue labeled `gate-failure` with: gate ID, TV model (`QN85Q7FAAFXZA` or `UN55CU8000BXZA` or both), reproduction steps, and the expected artifact path that is missing or failing.
3. The failing gate stays `in_progress` in the task list until resolved.
4. Agents cannot mark a gate as passing — only human on-TV verification with a named artifact counts.
5. If a gate cannot be tested (e.g., on-device access not available), it is `blocked` — not `passed`.
6. A gate with a vague pass criterion (no artifact path, no CLI command, no explicit TV model) is automatically treated as `blocked` until the gate definition is updated to include those specifics.

## 11. Cross-Reference: Contract Docs Incorporated by Reference

The following contract documents are fully incorporated by reference into this acceptance gate registry. Every proof gate, artifact requirement, and acceptance condition defined in those documents is binding here. Doc 10 does not supersede them — it consolidates them.

| Doc | Title | Gate suites it feeds |
|---|---|---|
| `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md` | Extreme UX/UI Customization | VISUAL-GATE-*, LAYOUT-GATE-*, THEME-GATE-* |
| `docs/04_LAYOUT_LIBRARY_12_STATIC_MODES.md` | Layout Library: 12 Static Modes | LAYOUT-GATE-*, VISUAL-GATE-03 through 03C, TIER-GATE-* |
| `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md` | Theme & Background Engine | THEME-GATE-*, VISUAL-GATE-07 through 11C, TIER-GATE-* |
| `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` | Agentic UI Control: Safe JSON Schema | AGENT-GATE-*, SECURITY-GATE-01 through 10B |
| `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` | Provider Catalog and QR Credential Onboarding | PROVIDER-GATE-*, SECURITY-GATE-00*, VISUAL-GATE-25 through 27 |
| `docs/08_BACKEND_STACK_CONTRACT.md` | Backend Stack | BACKEND-GATE-* |
| `docs/09_BUILD_PIPELINE_CONTRACT.md` | Build Pipeline | BUILD-GATE-* |
| `docs/11_PROFILE_MEMORY_TTS_CONTRACT.md` | Profile, Memory, TTS | PROFILE-GATE-*, SECURITY-GATE-14 through 15B |
| `docs/12_EPG_CONTENT_DISCOVERY_CONTRACT.md` | EPG and Content Discovery | EPG-GATE-*, VISUAL-GATE-21 through 24 |

Proof artifacts from all the above documents must exist and be committed to the `proof/` directory tree before any phase transition is approved.

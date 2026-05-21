# DaveTV — End-to-End Test Plan (Playwright)

**Version:** 0.1.0 (initial bootstrap)
**Date:** 2026-05-19
**Status:** Draft. First 5 specs land with this plan; remainder stubbed.

This plan covers every major user journey across the **14 layouts** × **two
profile personas** (Mom = Sherri, Dave = Dave). Tests run against the
`apps/hermes-web-tv` Vite dev server (default `http://localhost:5173`) with
the `services/hermes-tv-api` API booted on port `3001`.

> **Out of CI for now.** Playwright is not yet a CI gate — operator runs the
> suite locally before opening UI-touching PRs. CI hook lands in a follow-up
> when a Chromium-capable runner image is provisioned. See
> `docs/33_CI_AND_TESTING.md` §2.

---

## 1. Personas under test

| Profile | id | font_scale | mom_mode | theme | tier (TV) |
|---|---|---|---|---|---|
| Sherri ("Mom") | `mom_tv` | 1.25 (enforced) | `true` | `mom-calm` | enhanced |
| Dave | `dave_tv` | 1.0 | `false` | `night-blue` | enhanced (QN85) |

**Asymmetry rule (per MEMORY.md):** Mom's TV is never system-limited.
Specs that assert "performance cap" behaviour fire on Dave's profile only.
Mom's profile is always asserted to be on the enhanced path.

---

## 2. Layouts under test (14)

`tivimate`, `netflix`, `plex`, `apple-tv`, `samsung-tizen`, `mom-mode`,
`dave-power`, `zero`, `nuvio`, `extreme-infinitv`, `stremio`, `live-tv`,
`iptvnator`, `ynotv`.

Spec `03-layout-switcher.spec.ts` lands today and walks one of these
(Netflix) end-to-end as the canonical journey. The remaining 13 are
covered by the existing `layout-screenshots.spec.js` smoke (visual only,
no journey assertions). A follow-up spec `13-all-layouts-journey.spec.ts`
will fan out the same journey across all 14.

---

## 3. Journeys

Each row below maps to one or more specs in `tests/playwright/specs/`.
Status:
- ✅ implemented in this PR
- 🟨 stubbed (file exists, body is `test.skip` with TODO list)
- ⬜ planned (not yet stubbed)

| # | Journey | Spec | Status |
|---|---|---|---|
| J1 | Boot → first paint < 3 s | `01-boot-paint.spec.ts` | ✅ |
| J2 | Pick Mom → catalog paints with `font-scale ≥ 1.25` | `02-profile-pick.spec.ts` | ✅ |
| J3 | Open layout switcher → pick Netflix → shell mounts | `03-layout-switcher.spec.ts` | ✅ |
| J4 | Search via header `/` and `Ctrl+K` → type → results | `04-search-modal.spec.ts` | ✅ |
| J5 | Onboarding wizard 5 steps end-to-end | `05-onboarding-wizard.spec.ts` | ✅ |
| J6 | First-launch onboarding completes → flag persists in localStorage | `06-onboarding-persist.spec.ts` | 🟨 |
| J7 | Profile pick → quality badges (`4K`, `HDR`, `Dolby`) visible on tiles | `07-quality-badges.spec.ts` | 🟨 |
| J8 | Layout switcher → pick each of 14 shells → confirm mount | `13-all-layouts-journey.spec.ts` | 🟨 |
| J9 | Open EPG → Now / Today / Tomorrow tabs → click program → resolve | `08-epg-tabs.spec.ts` | 🟨 |
| J10 | Multiview → mount 2 tiles, then 4 tiles | `09-multiview.spec.ts` | 🟨 |
| J11 | Settings tabbed panel → every tab loads (Playback / Network / Parental / Diagnostics / Recordings / Backup) | `10-settings-tabs.spec.ts` | 🟨 |
| J12 | Parental lock gate triggers on restricted content; correct PIN unlocks | `11-parental-lock.spec.ts` | 🟨 |
| J13 | Schedule recording from EPG and from PlayerModal | `12-recording-schedule.spec.ts` | 🟨 |
| J14 | Chatbot text commands: `filter_provider`, `switch_profile`, `play_this`, `open_search`, `schedule_recording` | `14-chatbot-commands.spec.ts` | 🟨 |
| J15 | Download flow: exact-size disclosure → proceed → queued | `15-download-flow.spec.ts` | 🟨 |
| J16 | Mom-mode: warm theme + large hit targets + ≥ 1.25 scale | `16-mom-mode-ux.spec.ts` | 🟨 |

---

## 4. Cross-cutting assertions

These are checked inside every spec via the shared helpers in
`tests/playwright/helpers/`:

- **Zero console errors.** Page-level listeners collect `console.error` and
  `pageerror` events. Each spec asserts the filtered list (excluding favicon
  noise) is empty.
- **No 5xx network responses.** A response listener flags any 500/502/503
  except the documented stubs (`/api/play/.../stream`, `/api/tts`) which are
  treated as known-503.
- **No layout-thrash warnings.** React warnings about hydration mismatch
  fail the spec.

---

## 5. Viewports

Two projects per spec:

| Project | Viewport | Purpose |
|---|---|---|
| `desktop-1280` | 1280 × 720 | Operator dev box |
| `tv-1920` | 1920 × 1080 | QN85/QN95 target |

Tizen UA-string project (`samsung-tizen-mock`) is inherited from the existing
`layout-screenshots.spec.js` config for visual smoke. It is **not** added to
journey specs by default — it lands on the future `13-all-layouts-journey`.

---

## 6. Running locally

```bash
# Terminal A — API
node services/hermes-tv-api/src/index.js

# Terminal B — web dev server
cd apps/hermes-web-tv && npm run dev

# Terminal C — Playwright
cd tests/playwright && npm test            # full suite
cd tests/playwright && npx playwright test specs/04-search-modal.spec.ts
```

The HTML report opens with `npx playwright show-report report` from the same
directory.

---

## 7. Adding a new spec

1. Drop the file under `tests/playwright/specs/<NN>-<slug>.spec.ts`.
2. Keep it under **60 lines** (extract helpers to `helpers/` if it grows).
3. Use `data-testid` selectors when available. If you need a new one, add it
   to the component in the same PR — keep it short, kebab-case, prefixed
   with the component's role (`profile-tile-mom_tv`, `layout-card-netflix`).
4. Add a row to Section 3 of this doc with status emoji.
5. Run locally and paste the green run into the PR description.

---

## 8. Files of interest

| Path | Purpose |
|---|---|
| `apps/hermes-web-tv/playwright.config.ts` | Per-app config (this PR) — extends the repo-root tests/playwright config with the dev-server URL and dual viewport projects. |
| `tests/playwright/playwright.config.js` | Existing repo-root config (1920×1080 + Tizen UA mock). Continues to drive `layout-screenshots.spec.js`. |
| `tests/playwright/specs/` | All journey specs land here. |
| `tests/playwright/helpers/` | Shared selectors, profile fixtures, console-error collector. (Created on first reuse.) |
| `docs/33_CI_AND_TESTING.md` | Operator-facing reference; Playwright section is the source of truth for "is this in CI yet?". |

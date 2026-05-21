# apps/hermes-tv-tizen-native — LEGACY / REFERENCE

> **Not the current Tizen build target.**
>
> The current canonical Tizen app is [`apps/hermes-tv-tizen/`](../hermes-tv-tizen/),
> which re-packages the React web app (`apps/hermes-web-tv/`) as a Tizen `.wgt`.
> That's the mirror architecture documented in
> [`docs/27_WEB_AND_TIZEN_MIRROR.md`](../../docs/27_WEB_AND_TIZEN_MIRROR.md)
> and built by [`tools/tizen-prep.js`](../../tools/tizen-prep.js) +
> [`tools/tizen-package.js`](../../tools/tizen-package.js).
>
> **What this directory IS:** the original native-Tizen scaffold from B1.
> Renamed from `apps/tizen-hermes-tv/` to `apps/hermes-tv-tizen-native/` on
> 2026-05-18 to remove the swapped-name confusion (see
> [`docs/38_TIZEN_SCAFFOLD_CONSOLIDATION.md`](../../docs/38_TIZEN_SCAFFOLD_CONSOLIDATION.md)).
>
> **What this directory IS USEFUL FOR:** the AVPlay engine, focus engine,
> EPG grid, and theme manager in `src/ui/` are reference implementations
> that Phase 3 (real IPTV streams) will integrate into the web app's Tizen
> build path. Until then, this scaffold is **not built by any current
> tooling** and **not part of the deploy stack**.
>
> Do not delete this directory without explicit operator sign-off — the
> AVPlay integration is non-trivial to re-derive.

## Build guard (HANDOFF #5 — "only canonical path can produce .wgt")

`npm run build`, `npm run build:watch`, and `npm run package` are gated by
[`scripts/refuse-guard.js`](scripts/refuse-guard.js). Calling them with
no env produces a clear refusal pointing to the canonical Tizen build
path at `apps/hermes-tv-tizen/`.

If you genuinely need the legacy native build (reference for the AVPlay
engine, focus engine, or EPG grid in `src/ui/`), pass the explicit
override:

```bash
ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1 npm run build
ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1 npm run package
```

CI must NEVER set that env. The guard is enforced because operators can
otherwise accidentally ship the wrong `.wgt` (B1 native scaffold instead
of the current web-wrapped build).

---

# Original README — apps/tizen-hermes-tv (renamed)

Samsung Tizen TV app — thin UI shell and player for HermesTV.

## Role

This app is NOT the brain. It is a fast TV UI shell and player. The backend does all heavy work.

The app:
- Renders the catalog and player
- Handles remote/focus/navigation
- Shows quality badges and floating chatbot
- Applies theme/layout/profile commands received from backend
- Plays one primary stream safely via AVPlay

The app does NOT:
- Store provider credentials
- Talk to providers directly
- Run AI inference
- Process M3U or Xtream data

## Target TVs

- Mom/Sherri: `QN85Q7FAAFXZA` — Tizen 6.5, QLED 85", enhanced tier
- Dave: `UN55CU8000BXZA` — Tizen 6.5, Crystal UHD 55", baseline tier

## Entry point

`index.html` → `src/main.js`

## Key modules

- `src/core/api.js` — backend API client (talks only to `hermestv.local`)
- `src/core/profileStore.js` — profile state from backend (dave_tv / mom_tv)
- `src/platform/capabilities.js` — TV tier detection (QN=enhanced / UN=baseline)
- `src/platform/sharedKeys.js` — Samsung Tizen remote key codes

## Build

See `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` for full Tizen CLI build and sideload procedure.

No credentials, API keys, provider URLs, or M3U links may appear in this directory.

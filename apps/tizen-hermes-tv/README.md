# apps/tizen-hermes-tv

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

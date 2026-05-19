# apps/hermes-web-tv

DaveTV web app — browser-based TV UI for development, testing, and hosted-app delivery to Samsung TVs. (Package + folder name `hermes-web-tv` retained as a technical identifier; the user-facing brand is DaveTV.)

## Role

A React/Vite web application that replicates the Tizen app UX in a standard browser. Used for:
- Rapid UI development without a physical TV
- Visual QA baselines (screenshots at all layouts/themes/profiles)
- Hosted-app delivery strategy (TV loads from backend URL)
- Integration testing against the backend API

## Profiles

- `dave_tv` — Dave's profile
- `mom_tv` — Sherri/Mom's profile (Mom Mode: large fonts, audio feedback, reduced motion)

## Target TV model detection

When running as a hosted app on a Samsung TV, `src/platform/capabilities.js` reads the device model string:
- `QN*` prefix → enhanced tier (Mom's QN85Q7FAAFXZA)
- `UN*` prefix → baseline tier (Dave's UN55CU8000BXZA)

In browser mode, tier defaults to baseline unless overridden by a `?tier=enhanced` dev param.

## Providers

- Apollo Group (`apollo`)
- XtremeHD (`xtremehd`)

No real provider URLs, credentials, or tokens in this directory. All catalog data flows from the backend API.

## Mock data

`mock/catalog.mock.json` — safe mock catalog for offline development.

## UI features (B2 target)

- Profile picker (Dave / Sherri)
- Provider filter tabs (All / Apollo Group / XtremeHD)
- Quality badges (resolution / codec / bitrate)
- 3 layout presets (Rail, Grid, Focus)
- 6 theme presets
- Floating chatbot shell
- QR provider onboarding mock
- Safe JSON command validation

## Stack

- React 18
- Vite
- Tailwind CSS (TV-distance-readable configuration)
- No external state management library at B2

## Backend

All API calls go to `http://hermestv.local` (configurable via `VITE_API_BASE`). No direct provider calls.

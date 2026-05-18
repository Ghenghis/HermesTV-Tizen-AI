# App.jsx — Placeholder Contract

This file defines the App component behavior contract before implementation.
Replace this file with `App.jsx` when implementation begins.

## Boot sequence

```
1. capabilities.js detects TV model and tier (QN=enhanced / UN=baseline)
2. profileStore.js fetches active profile from backend (dave_tv or mom_tv)
   - If backend unreachable: show offline banner, load from mock/catalog.mock.json
   - Never prompt user for credentials
3. ThemeProvider applies active theme CSS vars for the profile
4. LayoutShell applies active layout preset for the profile
5. CatalogGrid renders the catalog from backend /api/catalog
   - Default filter: All providers (Apollo + XtremeHD combined)
   - Quality badges shown on every card
   - Provider badges shown on every card
6. FloatingChatbot mounts in minimized state
7. QROnboarding mounts as a dormant modal (opens only when "Add Provider" is triggered)
```

## Profile picker

- Shown at first boot if no profile is stored in localStorage
- Two options: Dave / Sherri
- Selection writes profile_id ('dave_tv' or 'mom_tv') to localStorage (not profile data)
- App immediately fetches full profile from backend after selection

## TV model detection

- `capabilities.js` reads `tizen.systeminfo` on Samsung TVs
- In browser: reads `navigator.userAgent` or defaults to baseline
- QN prefix → enhanced tier → enable enhanced features (rich motion, wider layout options)
- UN prefix → baseline tier → disable enhanced features
- Tier cannot be upgraded by user or agent after boot; only capabilities.js decides

## Provider filter tabs

- Tab 0: All (unified Apollo + XtremeHD, de-duplicated)
- Tab 1: Apollo Group (provider_tags contains 'apollo')
- Tab 2: XtremeHD (provider_tags contains 'xtremehd')
- Active tab persists per profile in backend profile state

## Quality badges

Displayed on every catalog card:
- Resolution: 480p / 720p / 1080p / 1440p / 4K / ? (unknown)
- Codec: visible on hover/focus only (TV distance readability)
- Bitrate bucket: low / medium / high / ultra — shown as dot indicator

## Layout presets (B2 — 3 of 12)

1. `grid-standard` — 3-col, 16:9 cards (Dave default, baseline)
2. `rail-hero` — hero rail + content rows (enhanced only)
3. `jumbo-rail` — large 2-col cards, single content rail (Mom default)

## Theme presets (B2 — 6 of 24)

1. `night-blue` — Dave default, dark blue-grey
2. `mom-calm` — Sherri default, warm dark tones, large contrast
3. `high-contrast` — accessibility preset, both profiles
4. `slate-dark` — neutral dark, both profiles
5. `warm-amber` — warm accent, both profiles
6. `deep-purple` — rich dark, enhanced tier only

## Floating chatbot

- Mounts as a pill/icon in corner
- Focus: D-pad left/right to reach it from the catalog grid
- States: minimized → compact → expanded → walkie-talkie
- Sends typed/spoken commands through CommandValidator → /api/commands
- Never accepts raw credential input

## QR onboarding mock

- Shows a fake QR image (placeholder SVG)
- Shows a 6-char alphanumeric pairing code
- Explains: "Scan on phone to add a provider"
- Does not actually initiate a backend pairing session in mock mode
- Real flow requires backend at hermestv.local

## Safe JSON command validation

- CommandValidator.jsx validates every outbound command against ui-command.schema.json
- Rejects any command not on the action allowlist
- Rejects any command targeting unknown profile_id
- Dry-run mode shows the would-be diff without applying
- All commands logged to console in dev mode (not in production)

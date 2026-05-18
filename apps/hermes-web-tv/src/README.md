# apps/hermes-web-tv/src

React source for the HermesTV web TV UI.

## Planned structure

```
src/
  App.jsx                   — root component: profile gate, layout shell
  main.jsx                  — React entry point
  api/
    hermesApi.js            — backend client (talks to hermestv.local only)
    mockApi.js              — returns mock/catalog.mock.json for offline dev
  components/
    ProfilePicker.jsx       — Dave / Sherri selector
    ProviderFilter.jsx      — All / Apollo Group / XtremeHD tabs
    CatalogGrid.jsx         — main catalog view (layout-aware)
    CatalogCard.jsx         — single item card with quality + provider badges
    QualityBadge.jsx        — resolution/codec/bitrate badge
    ProviderBadge.jsx       — Apollo / XtremeHD badge
    FloatingChatbot.jsx     — minimized/expanded chatbot shell
    QROnboarding.jsx        — mock QR provider onboarding flow
    CommandValidator.jsx    — validates JSON commands before dispatch
    LayoutShell.jsx         — applies active layout preset
    ThemeProvider.jsx       — applies active theme CSS vars
  layouts/
    GridStandard.jsx        — 3-column grid (baseline)
    RailHero.jsx            — hero rail + row rails (enhanced)
    JumboRail.jsx           — Mom Mode: large cards, single rail
  themes/
    night-blue.css          — Dave default theme
    mom-calm.css            — Sherri default theme
    ... (6 themes at B2, 24 at B3)
  platform/
    capabilities.js         — model detection (QN/UN), tier assignment
    sharedKeys.js           — Samsung Tizen remote key codes
  store/
    profileStore.js         — fetches profile from backend API
    commandStore.js         — validates and queues UI commands
  mock/
    (symlink or import from ../../mock/catalog.mock.json)
```

## Rules

- No component reads from G:\private\ or any vault path
- No component stores credentials in localStorage or state
- All API calls go through api/hermesApi.js — not directly to providers
- QROnboarding.jsx shows only the mock flow — real credential entry is on the backend setup page

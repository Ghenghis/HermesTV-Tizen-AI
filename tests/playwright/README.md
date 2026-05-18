# HermesTV Playwright Tests

Visual + regression suite for the 7 Dynamic UX Shell layouts.

## Prereqs

1. Backend running: `cd services/hermes-tv-api && npm run dev`
2. Web app running: `cd apps/hermes-web-tv && npm run dev`
3. Install Playwright once: `cd tests/playwright && npm install && npx playwright install chromium`

## Run

```bash
cd tests/playwright
npm test                # headless
npm run test:headed     # see the browser
npm run test:report     # open the last HTML report
```

## What it covers

- Profile picker → click first profile
- Click "🎨 Look" in header → modal opens
- Click each of the 7 layouts (tivimate, netflix, plex, apple-tv, samsung-tizen, mom-mode, dave-power)
- Screenshot saved to `docs/proof/layout-screenshots/<id>.png`
- Asserts no console errors per layout
- Tests Ctrl+L keyboard shortcut
- Tests chatbot "show movies" command

## Adding a new layout

1. Add it to `LAYOUTS` array in `specs/layout-screenshots.spec.js`
2. Make sure the label in the array matches the button label in `LayoutSwitcher.jsx`

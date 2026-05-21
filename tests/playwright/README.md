# DaveTV Playwright Tests

Logged-in visual + regression suite for DaveTV web.

## Prereqs

1. Backend running: `cd services/hermes-tv-api && npm run dev`
2. Web app running: `cd apps/hermes-web-tv && npm run dev`
3. Install Playwright once: `cd tests/playwright && npm install && npx playwright install chromium`
4. If auth is enforced locally, provide a local-only account via env:

```bash
DAVETV_E2E_ALLOW_ACCOUNT_SETUP=true
DAVETV_E2E_ADMIN_EMAIL=<local admin email>
DAVETV_E2E_ADMIN_PASSWORD=<local admin password>
DAVETV_E2E_EMAIL=playwright-dave@example.test
DAVETV_E2E_PASSWORD=<local test password>
```

The generated session state is written to `tests/playwright/.auth/` and is
gitignored.

## Run

```bash
cd tests/playwright
npm test                # headless
npm run proof           # auth + screenshot proof gallery
npm run test:headed     # see the browser
npm run test:report     # open the last HTML report
```

## What it covers

- Login/session proof using real `/api/auth/login`
- GitHub-visible proof screenshots in `docs/proof/web-e2e/`
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

# DaveTV E2E Action Plan

Purpose: keep DaveTV moving toward release with proof, not guesses. Every gate
must use real app code, real provider/catalog paths, and screenshots or command
output that can be reviewed later.

## Gate 1 - Local GUI Truth

Run Playwright against the local web app with local no-auth/dev proof state.

Required proof:
- Header controls open and close Search, TV Guide, Multiview, Sleep Timer, and Settings.
- Every Settings tab renders real content, including Providers and Voice.
- Choose Your View uses the TV viewport and exposes every registered View.
- Every registered View mounts with interactive controls.
- Side rails/bottom rails move focus with D-pad keys without double-moving.

Command:

```bash
cd tests/playwright
DAVETV_E2E_WEB_URL=http://127.0.0.1:5174 npx playwright test specs/21-gui-playback-proof.spec.ts --project=chromium-1080p --project=samsung-qn85-mock
```

## Gate 2 - Playback Health

Playback must open immediately on click/OK. No movie/show detail popup may sit
between the card and the player. Dead feeds must fail fast and move to recovery
or the next playable live channel.

Required proof:
- Player opens within the watchdog window.
- Working feeds reach a playing video state.
- Dead feeds show honest recovery or skip to the next playable channel.
- No credential-bearing stream URLs appear in browser-visible responses.

Commands:

```bash
node services/hermes-tv-api/test/playbackUxContract.test.js
```

## Gate 3 - Provider Truth

Provider save must survive restart and feed catalog/search/playback. A UI save
that appears successful but does not persist is a P0.

Required proof:
- Provider registry shows disk/env rows without leaking credentials.
- Setup/provider submit survives API restart.
- Catalog returns rows from the saved provider.
- Play endpoint returns a masked ticket and playable stream endpoint.

Commands:

```bash
npm test --prefix services/hermes-tv-api
PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js
```

## Gate 4 - VPS Truth

The VPS must match the committed codebase and mounted persistent data paths.
Deploys must not require committed private `.env` files, and missing live
credentials must block live-provider proof honestly.

Required proof:
- `tv.daveai.tech` serves the current build hash after deploy.
- `/api/health`, `/api/providers`, `/api/catalog`, and `/api/play` match local behavior.
- Cloudflare/Nginx real-client-IP config is applied before bot/security auditing.

## Gate 5 - Samsung TV Truth

The Samsung target is the release hardware path. Browser proof is necessary but
not sufficient.

Required proof:
- Signed `.wgt` installs on the Samsung TV.
- D-pad focus does not lock on side panels, settings, views, or player.
- Playback starts or fails-fast with recovery on the real TV.
- Phone remote/QR flows work from a Samsung phone/tablet without exposing secrets.

## Website Screenshots

Use `docs/proof/web-e2e/README.md` as the screenshot pick list for the GitHub
website. Screenshots must come from Playwright, not hand-edited mockups.

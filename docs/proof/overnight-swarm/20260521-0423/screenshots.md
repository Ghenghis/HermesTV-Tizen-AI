# Screenshots — 2026-05-21 04:23 UTC

A screenshot here counts as **proof** only when the listed interaction was
performed BEFORE the capture. Per the swarm policy, a still image with no
control exercise is visual evidence only, not proof.

## Wave 1 / 2 — Auth-boundary proof (running localhost)

Source: `tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts`
Run: `cd tests/playwright && npx playwright test specs/swarm-20260521-boundary-proof.spec.ts`
Browsers: `chromium-1080p` + `samsung-qn85-mock` (Tizen UA). 4 passed, 0 failed.
Storage state: empty cookies — proves the unauthenticated boundary every user sees first.

| Path | Interaction performed before capture | What it proves | Secret leak check |
| --- | --- | --- | --- |
| `screenshots/01-login-initial.png` | `page.goto('/')` + networkidle | Initial paint of login surface renders without 5xx, no console errors that break the feature | Body text scanned for password/get.php/m3u_plus/Bearer/set-cookie — none matched |
| `screenshots/02-login-submit-focused.png` | `email.focus()` → `Tab` → `Tab` (walking to submit) — D-pad-style keyboard nav | Email, password, and submit are visible, focusable, and reachable by Tab traversal | same scan, none matched |
| `screenshots/03-login-bad-creds-typed.png` | typed `overnight-swarm-noauth@example.invalid` + `not-a-real-password-overnight-swarm` | Form accepts typed input; values are deliberately fake/unmistakable | password field rendered as bullets, not value text |
| `screenshots/04-login-error-state.png` | submitted via `Enter` on password; API returned status >= 400 (verified via response promise) | Wrong credentials produce an honest error, not a fake success state. `body` text does NOT match `Welcome back` | same scan, none matched |
| `screenshots/05-login-escape-recovered.png` | `Escape` then `email.focus()` re-asserted | Escape does not crash the page; the email control is still alive and focusable | same scan, none matched |
| `screenshots/06-narrow-viewport-initial.png` | viewport resized to 1280×600 + `page.goto('/')` | App boots cleanly at small viewport | n/a |
| `screenshots/07-narrow-viewport-pagedown.png` | `PageDown` key pressed | Keyboard scroll input does not crash the page. (Login screen fits within 600px tall so scrollY stays 0; that is correct behaviour, not a bug — the assertion checks the type is a number.) | n/a |

**All captures: secret leak status = NO.**

## What is NOT proven by these screenshots (BLOCKED — owner = Dave)

- Authenticated catalog, EPG, search, playback Views
- Admin panel rendering and invite flow
- Schedule-recording / multiview / download from a real card
- "Instant playback no popup" path (needs a logged-in session with at least one playable item)

These require the running API's `DAVETV_ADMIN_PASSWORD` so Playwright global-setup
can create the test viewer through admin. The password is not in the agent's
environment and per the constitution the agent must not attempt to extract it.

Provider/playback proof for `tools/test-provider-e2e.js` requires either:

- `HERMES_PROVIDER_E2E_BASE` pointed at a deployment with real providers (BLOCKED — owner = Dave/VPS)
- `PROVIDER_E2E_ALLOW_LOCAL_LIVE=1` against a locally-running API with a real
  configured provider (BLOCKED — owner = Dave/provider credentials)

Existing in-process fixture proof at `services/hermes-tv-api/test/xtreamFixture.e2e.test.js`
remains green (9 PASS) — see commands.md.

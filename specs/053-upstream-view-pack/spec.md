# Feature Spec: Upstream IPTV Web View Pack

Status: Planned
Owner: DaveTV UI / agent adoption lane
Date: 2026-05-21

## What And Why

DaveTV should let Dave and family switch between many polished IPTV-style Views
without losing provider truth, instant playback, auth, voice, or remote control.
Dave has 25 local IPTV web apps in `G:\Github\IPTV-web`; these apps should be
used as source material for DaveTV's look, feel, features, and View choices.

The goal is not to ship 25 disconnected apps. The goal is a DaveTV View system
where the visual personality can change instantly while the real DaveTV backend
continues to own providers, catalog, search, playback tickets, secrets, and
proof.

## Users And Journeys

- As Dave, I can choose a View named after an upstream IPTV app, so that DaveTV
  can quickly try different looks and layouts.
- As Sherri or another family user, I can click a movie, show, or channel and
  have it play immediately, regardless of the active View.
- As Dave, I can use secure provider setup through QR/phone/chat without the
  agent echoing credentials or stream URLs.
- As Warren or another family profile, I can ask DaveTV to find sports, shows,
  or movies and receive a custom result View based on real provider data.
- As an agent, I can adopt upstream design/source safely because each app has a
  manifest row, license mode, proof requirement, and no-secret rule.

## Success Criteria

- [ ] All 25 apps have a manifest row with View name, license status, adoption
  mode, and highest-value features.
- [ ] Every active View consumes DaveTV shell props and uses DaveTV instant
  playback, not raw upstream URLs.
- [ ] Source-copy adoption includes license/attribution and proof.
- [ ] Apps with no license or no-modification licenses are Pattern Only or
  Sandbox App, not pasted into DaveTV.
- [ ] View switching is smooth and does not require reload/relogin.
- [ ] Playwright screenshot proof exists for every active View.
- [ ] D-pad navigation and scrolling are proven for every release-candidate
  View.
- [ ] Secure Provider Setup never exposes raw credentials to the chat, browser
  proof, logs, or committed docs.

## Non-Goals

- This does not make provider truth optional. Provider registry, catalog,
  search, and playback proof remain P0.
- This does not guarantee every upstream app can be modified. License terms
  still control.
- This does not allow whole-app iframe shortcuts for the main TV watch path if
  they break remote navigation or instant playback.
- This does not add always-on microphone support unless a real supported
  Samsung/Tizen capture path is proven.

## Data And API Contracts

- View manifest: `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md`
- Contract: `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`
- DaveTV layout manifests: `apps/hermes-web-tv/src/layouts/manifests/*.json`
- DaveTV shells: `apps/hermes-web-tv/src/shells/*Shell.jsx`
- Shell props: `catalog`, `providers`, `providerFilter`, `contentFilter`,
  `qualityFilter`, `focusedItem`, `onItemFocus`, `onItemSelect`,
  `onOpenSettings`
- Future secure provider route family:
  - `POST /api/provider-setup/session`
  - `POST /api/provider-setup/session/:id/input`
  - `POST /api/provider-setup/session/:id/commit`
  - `GET /api/provider-setup/session/:id/status`

## Security And Secrets

Provider credentials, M3U URLs, Xtream hosts, usernames, passwords, tokens,
cookies, and stream URLs are sensitive. They must be accepted only through
vault-backed routes, redacted before display, excluded from logs/proof, and
stored only in the provider store/vault.

The agent may see redacted metadata and validation results. It must not receive
or repeat raw provider secrets.

## Proof Required

- `npm run build --prefix apps/hermes-web-tv`
- `npm run test:web:proof`
- View screenshot proof under `docs/proof/web-e2e/` or `docs/proof/ui-views/`
- Remote/D-pad proof for every release-candidate View
- Provider truth proof for any View claiming playback works
- Secret scan or equivalent redaction proof for files touched by provider setup

## Open Questions

- [ ] Which 10 upstream Views should become Native Views first after the
  existing 14 shells?
- [ ] Should sandboxed upstream apps run from DaveTV routes, separate local
  ports, or an Extensions panel?
- [ ] Which Samsung device paths are actually exposed on Dave's target TV and
  phone/tablet browsers?

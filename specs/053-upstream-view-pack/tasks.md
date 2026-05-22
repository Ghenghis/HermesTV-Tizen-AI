# Task Breakdown: Upstream IPTV Web View Pack

Status: Ready

## Tasks

- [x] T001: Create the binding View-pack contract.
  - Files: `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`
  - Proof: file exists and is linked from agent rules.

- [x] T002: Inventory all 25 apps from `G:\Github\IPTV-web`.
  - Files: `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md`
  - Proof: manifest includes all 25 directory names and View names.

- [x] T003: Update agent instruction entry points.
  - Files: `AGENTS.md`, `CLAUDE.md`, `.windsurf/rules/davetv-agent-rules.md`,
    `.agents/constitution.md`, `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`
  - Proof: instructions mention `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`.

- [ ] T004: Add layout manifest entries for the first missing 25-app Views.
  - Files: `apps/hermes-web-tv/src/layouts/manifests/*.json`,
    `apps/hermes-web-tv/src/layouts/manifests/index.js`
  - Proof: View picker shows the new View names with honest preview states.

- [ ] T005: Build the first new Native View candidate.
  - Files: `apps/hermes-web-tv/src/shells/<Name>Shell.jsx`,
    `apps/hermes-web-tv/src/engine/layoutRegistry.js`
  - Proof: build passes, Playwright screenshot captured, item click uses
    DaveTV instant playback.

- [ ] T006: Add View preview proof automation for all active Views.
  - Files: `tests/playwright/specs/*`, `docs/proof/web-e2e/README.md`
  - Proof: `npm run test:web:proof` captures View screenshots.

- [ ] T007: Implement Secure Provider Setup spec.
  - Files: `services/hermes-tv-api/src/routes/providerSetup.js`,
    provider redaction helpers, frontend setup UI.
  - Proof: pasted provider data saves durably or returns a real error without
    echoing credentials.

- [ ] T008: Add phone QR provider input flow.
  - Files: QR pairing/setup routes and frontend components.
  - Proof: generated QR encodes real one-time setup URL; phone upload/paste
    reaches vault session; no static QR art.

- [ ] T009: Add agent-created temporary result Views.
  - Files: agent routes/stores, frontend View renderer.
  - Proof: agent request creates a real provider-backed result rail and can
    play an item.

- [ ] T010: Add Samsung companion device proof matrix.
  - Files: docs/proof and/or device compatibility doc.
  - Proof: each claimed device path is marked proven, unsupported, or blocked.

## Integration Order

1. Contracts and manifest.
2. Missing View metadata.
3. First Native View.
4. Screenshot/proof gallery.
5. Secure Provider Setup.
6. Phone QR setup.
7. Agent temporary Views.
8. Samsung device proof.

## Required Final Proof

```bash
npm run build --prefix apps/hermes-web-tv
npm run test:web:proof
npm test --prefix services/hermes-tv-api
```

Provider-related work also requires:

```bash
node tools/test-provider-e2e.js
```

## Blockers

- Real Samsung TV/browser microphone and device APIs need physical device proof
  - owner: TV/Dave.
- Apps with no license require Pattern Only mode unless Dave obtains permission
  - owner: Dave/legal permission.
- AGPL Source Pack use requires source-availability compliance for hosted users
  - owner: agent/integrator.

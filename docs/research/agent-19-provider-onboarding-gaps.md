# Lane 06 — Provider Onboarding Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** Provider onboarding flow — QROnboarding.jsx, setup.js, credential pipeline

---

## Summary

The provider onboarding flow is a B2 stub with a placeholder QR code. The QR displays a static SVG, the setup form exists as HTML at GET /setup/provider, and the submit endpoint returns 501. No credential storage pipeline exists yet. This is correct for B2 scope.

---

## QR Onboarding Flow (QROnboarding.jsx)

| Check | Result | Notes |
|---|---|---|
| QR renders | PASS — static SVG placeholder with finder patterns |
| QR code is scannable | NOT SCANNABLE — it is a hardcoded decorative SVG, not a real QR code |
| Pairing code shown | PASS — shows hardcoded "HRM-M0K" |
| Expiry countdown | STATIC — shows "10:00" but timer does not count down |
| hermestv.local URL shown | PASS — "Scan this code on your phone to add a provider at hermestv.local" |
| Modal keyboard accessible | PASS — ESC closes, autoFocus on Close button, role="dialog" aria-modal="true" |
| No real URL is encoded | PASS — placeholder only, no real credentials or URLs |

**QR Onboarding Assessment:** Correctly scoped as a B2 visual placeholder. Real QR implementation (e.g., using qrcode.js library to encode `http://hermestv.local/setup/provider?code=<token>`) is a B3 task.

---

## Setup Form (setup.js — GET /setup/provider)

| Check | Result | Notes |
|---|---|---|
| Form fields present | PASS — provider_type, host_url, username, password |
| Form action | POST to /setup/provider/submit |
| HTTPS not required for local form | ACCEPTABLE — form submits to hermestv.local over LAN |
| Password field type=password | PASS — browser masks input |
| Autocomplete hints | PASS — autocomplete="username" and "current-password" |
| Notice about credential storage | PASS — "Your credentials are stored encrypted on this device. They are never sent to your TV." |
| Encryption implementation | NOT IMPLEMENTED — the notice is aspirational; the backend stores nothing |

---

## POST /setup/provider/submit

| Check | Result |
|---|---|
| Returns 501 | PASS — correct for B2 |
| Error message explains phase | PASS — "Provider credential storage is pending B4 phase implementation." |
| Credentials NOT stored anywhere | PASS — 501 means no write path exists |
| Form data NOT echoed back | PASS — 501 response has no echo of username/password |

---

## Credential Storage Plan

**Where credentials should go (B4+ implementation):**
- Credentials must be stored at `G:\private\.env.hermestv` on the workstation
- Format: `APOLLO_USERNAME=...`, `APOLLO_PASSWORD=...`, `APOLLO_HOST=...`
- Backend should read from process.env (injected from .env.hermestv at server start)
- Credentials must NEVER be stored in the database, in config.xml, in any tracked file, or in any API response

**Credential-to-provider pipeline (B4 plan):**
1. Phone scans QR → opens `http://hermestv.local/setup/provider?code=<token>`
2. User fills form → POSTs to `/setup/provider/submit`
3. Backend validates one-time token, writes credentials to G:\private\.env.hermestv (append mode)
4. Backend restarts or hot-reloads provider config
5. TV receives updated provider list from `/api/providers`

This pipeline does not exist yet and is explicitly blocked on B4.

---

## Flow Summary: QR Scan → TV Receives Provider

```
[TV shows QR] → [Phone scans] → [Phone opens hermestv.local/setup/provider]
     → [User fills form] → [POST /setup/provider/submit — 501 in B2]
     → [B4: Credentials saved to G:\private\.env.hermestv]
     → [B4: /api/providers returns real provider]
     → [TV reloads catalog]
```

**Current B2 state:** Flow stops at step 3 (501). TV has only mock providers.

---

## BLOCKER File

See: `docs/research/BLOCKER_PROVIDER_CREDS.md`

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| QR code not real (static SVG) | P1 for B3 | Need qrcode.js or server-generated QR |
| Expiry countdown not functional | P2 for B3 | Static "10:00" needs real countdown with token expiry |
| submit returns 501 | CORRECT for B2 | B4 work item |
| No credential storage pipeline | CORRECT for B2 | B4 work item |
| One-time token system not designed | P1 for B4 | QR codes need token to prevent replay attacks |

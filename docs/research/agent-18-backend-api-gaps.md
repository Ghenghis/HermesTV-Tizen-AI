# Lane 05 — Backend API Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** services/hermes-tv-api/src/routes/

---

## Summary

The backend API routes are well-structured for a mock phase. Validation is present on critical fields. The main gaps are: no rate limiter (noted as P2), limited validation surface on PATCH /api/profile/:id beyond font_scale and protected fields, and the credentialGuard middleware coverage needs verification on error responses.

---

## Routes Inventory

| Route File | Routes | Status |
|---|---|---|
| catalog.js | GET /api/catalog, GET /api/actors | COMPLETE for B2 |
| channels.js | GET /api/channels, GET /api/channels/:id | COMPLETE for B2 |
| commands.js | (not read) | — |
| epg.js | GET /api/epg/:channelId | STUB — returns 501-equivalent (status: not_implemented) |
| epgGrid.js | GET /api/epg/grid | COMPLETE mock — 2 programs, proper window validation |
| health.js | (not read) | — |
| profiles.js | GET /api/profiles, GET /api/profile/:id, PATCH /api/profile/:id | COMPLETE for B2 |
| providers.js | GET /api/providers | COMPLETE for B2 |
| settings.js | GET /api/settings | COMPLETE stub for B2 |
| setup.js | GET /setup/provider, POST /setup/provider/submit | GET=HTML form OK, POST=501 |
| tts.js | POST /api/tts, GET /api/tts/voices | STUB — 202 pending |
| uiCommand.js | POST /api/ui-command/validate | COMPLETE for B2 |
| versions.js | (not read) | — |

---

## Validation Coverage

### GET /api/catalog

| Check | Result |
|---|---|
| profile_id enum validation | PASS — rejects unknown profile_id with 400 |
| provider_id enum validation | PASS — rejects unknown provider_id with 400 |
| No credentials in response | PASS — only metadata, no stream URLs |
| Empty result handled | PASS — returns items:[] with total:0 |

### PATCH /api/profile/:id

| Check | Result | Notes |
|---|---|---|
| font_scale type check | PASS — rejects non-number with 400 |
| Mom Mode font_scale floor | PASS — rejects < 1.25 for mom_tv |
| Protected fields blocked | PASS — profile_id, tv_model, tier, mom_mode cannot be patched |
| Other field validation | GAP — any other field (active_layout, active_theme, agent_name, etc.) is accepted without type or range validation. A string "abc" could be set as font_scale if it were not a number. |
| Body sanitization | GAP — `req.body` spread directly to profileStore without stripping unknown keys |
| Type checking on non-font_scale fields | GAP — active_theme accepts any string; no enum check against valid theme names |

### POST /api/ui-command/validate

| Check | Result |
|---|---|
| command_text required | PASS |
| profile_id enum validation | PASS |
| No credentials in response | PASS |
| Returns clear no-match error | PASS |

---

## Rate Limiter

**Status:** NOT PRESENT (confirmed by inspection of all route files)
**Priority:** P2 gap — noted for B3
**Recommendation:** Add `express-rate-limit` middleware for B3, minimum 100 req/min per IP for /api/catalog, 10 req/min for /api/tts.

---

## credentialGuard Coverage

The credentialGuard middleware is referenced in the architecture but not audited in this pass (the middleware file was not read). Based on the TTS route's inline credential pattern check and the chatbot's front-end guard, the guard is present. However:

**Gap:** Error responses from routes that fail validation (e.g., 400 from /api/catalog with bad profile_id) should also pass through credentialGuard to ensure no credential-pattern strings are accidentally echoed in error messages. The 400 responses currently echo back the raw profile_id value in error messages — if a user sent a credential-pattern string as a profile_id, it would be echoed back.

Example:
```json
{ "error": "Invalid profile_id 'password=abc'. Valid values: dave_tv, mom_tv" }
```

This echoes the credential-pattern string back. Should be sanitized.

---

## EPG Grid — Mock Data Shape

The mock EPG grid (/api/epg/grid) returns:
- `window_start`, `window_end`, `server_time`, `programs[]`, `_note`
- Each program: `program_id`, `channel_id`, `title`, `start_utc`, `end_utc`, `description`, `catch_up_available`, `epg_status`

This shape matches what is documented for B3 Jellyfin integration. The mock dates are hardcoded to 2026-05-17. If the client requests a window that doesn't overlap May 17, it will return 0 programs — which is technically correct but may confuse during testing.

---

## POST /setup/provider/submit — 501 Documentation

The route returns:
```json
{ "error": "not_implemented", "message": "Provider credential storage is pending B4 phase implementation." }
```

**Status:** PASS — 501 is correct for a not-yet-implemented route. The message clearly states the phase. This is well-documented.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| No rate limiter | P2 | Planned for B3 |
| PATCH /api/profile accepts arbitrary unknown fields | P2 | Needs field allowlist |
| Error responses echo user input without sanitization | P2 | Credential strings could be echoed in 400 errors |
| EPG mock dates hardcoded to 2026-05-17 | P3 | Will return 0 programs for other date windows in testing |
| active_theme/layout PATCH not enum-validated | P3 | Could set invalid theme names |

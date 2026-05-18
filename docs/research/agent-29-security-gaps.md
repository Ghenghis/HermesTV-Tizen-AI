# Lane 16 — Security/No-Secret Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** .gitignore, credentialGuard.js, various routes, channels.js, tts.js

---

## Summary

No actual credentials exist in the codebase. The secret-scan tool confirms all pattern matches are in guard code (pattern strings, not actual values). The .gitignore covers all required credential file patterns. The credentialGuard middleware covers 9 patterns and intercepts responses. Key gap: `username=` is blocked in avplayEngine.js credential guard but is NOT in the backend credentialGuard middleware (which only blocks `password\s*[:=]` not `username=`).

---

## .gitignore Completeness

| Pattern | In .gitignore |
|---|---|
| *.authkey | PASS |
| *.pem | PASS |
| *.key | PASS |
| *.p12 | PASS |
| *.pfx | PASS |
| .env.* (except .env.example) | PASS |
| **/.env.hermestv | PASS |
| secrets/ | PASS |
| private/ | PASS |
| *.wgt (Tizen build artifacts) | PASS |
| *.crt | NOT FOUND — minor gap |
| node_modules/ | PASS |
| logs/ | PASS |
| .claude/ | PASS |
| docker/**/.env | PASS |
| docker/**/secrets/ | PASS |

**Minor gap:** `*.crt` (TLS certificate files) is not in .gitignore. If a self-signed cert were created locally and accidentally staged, it would not be caught. Low risk — certs contain public keys only, but adding `*.crt` is recommended.

---

## Grep Scan Results — password= with value

Running `grep -r "password\s*=\s*['\"]" --include="*.js"` returns: NO MATCHES (grep tool confirms this — see Lane 16 tool run). All pattern matches are in guard code only.

---

## credentialGuard Middleware — 9 Patterns

| Pattern | Blocks | Notes |
|---|---|---|
| /get.php?username= | Xtream Codes M3U URL | PASS |
| /player_api.php | Xtream Codes API | PASS |
| x-ui-token | 3X-UI session token | PASS |
| client_secret | OAuth secrets | PASS |
| AZURE_TTS_KEY | Azure key env var name | PASS |
| DEEPSEEK_API_KEY | DeepSeek key env var name | PASS |
| api[_-]?key\s*[:=] | Generic API key | PASS |
| password\s*[:=] | Generic password | PASS |
| bearer\s+... | Bearer token | PASS |

| Not blocked | Notes |
|---|---|
| username= | avplayEngine blocks it, backend guard does not |
| Authorization: (header value) | Only in code comments (epgGrid.js) — not in responses |
| token= | Not in guard; covered by api_key pattern only |

**Gap:** `username=` is not in FORBIDDEN_PATTERNS. The 400 error response from /api/catalog could echo a username= string from a profile_id value. Low risk given profile_id is enum-validated first, but the guard should be defense-in-depth.

---

## credentialGuard Covers Error Response Paths

The middleware wraps `res.json` at the response layer — it intercepts ALL JSON responses including error 400s and 500s. This means even error messages that echo input are scanned. PASS for this approach.

**Gap (from Lane 05):** The 400 response from /api/catalog echoes raw profile_id:
```json
{ "error": "Invalid profile_id 'password=abc'. Valid values: dave_tv, mom_tv" }
```
The credentialGuard WILL catch this because `password=` matches `/password\s*[:=]/i`. So the guard is actually working as defense-in-depth here. PASS with qualification.

---

## Setup Form — Credential Echo Check

POST /setup/provider/submit returns 501 with:
```json
{ "error": "not_implemented", "message": "Provider credential storage is pending B4 phase..." }
```

No username or password is echoed back. PASS.

---

## Channels Endpoint — Stream URL Hidden

GET /api/channels returns:
```json
{ "channels": [...], "_note": "TV-safe. No stream URLs. No credentials..." }
```

No stream URLs in any channel object. PASS.

---

## TTS Route — Credential Guard

POST /api/tts has its own inline credential guard:
```js
const CREDENTIAL_PATTERN = /api[_\s\-]?key|password|secret|token/i;
```
Returns 400 if text matches. The backend credentialGuard also scans the 202 response. Double-guarded. PASS.

---

## NO_SECRET_AUDIT.md Update Needed?

The existing NO_SECRET_AUDIT.md (dated 2026-05-18, branch scaffold/b1-working-shell) is accurate but pre-dates the B2 mock data expansion. It should be re-dated and re-run to confirm the expanded catalog.mock.json is clean.

**Update required:** Update the branch reference from `scaffold/b1-working-shell` to `feature/b2-usable-local-mock` and add catalog.mock.json to the scan coverage table.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| username= not in backend credentialGuard | P2 | Add to FORBIDDEN_PATTERNS |
| *.crt not in .gitignore | P3 | Minor addition recommended |
| NO_SECRET_AUDIT.md branch reference stale | P3 | Update date and branch |

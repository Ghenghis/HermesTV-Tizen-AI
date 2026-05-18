# No-Secret Audit Report

**Date:** 2026-05-18
**Branch:** scaffold/b1-working-shell
**Auditor:** Automated Claude Code scan + pattern grep

---

## Summary

**PASS — No credentials, tokens, stream URLs, or provider secrets found in tracked source files.**

---

## Scan Coverage

| Scope | Status |
|---|---|
| `apps/hermes-web-tv/src/**` | CLEAN |
| `apps/hermes-tv-tizen-native/src/**` (renamed from `apps/tizen-hermes-tv/` on 2026-05-18) | CLEAN |
| `apps/hermes-tv-tizen/**` (current canonical Tizen build) | CLEAN |
| `services/hermes-tv-api/src/**` | CLEAN |
| `services/hermes-quality-scanner/src/**` | CLEAN |
| `schemas/**` | CLEAN |
| `tools/**` | CLEAN |
| `prompts/**` | CLEAN |
| `docs/**` | CLEAN |
| `upstream/**` | CLEAN |
| `docker/**` | CLEAN |

---

## Patterns Searched

- `password=`, `username=`, `api_key=`, `token=` (with value)
- `m3u_plus`, `xtream`, `player_api.php`, `/get.php?username=`
- `portal`, `cookie` (with value), `apikey`
- `Bearer ` (with token value), `Authorization:` (with value)
- Raw `http://` and `https://` URLs pointing to non-localhost external hosts

---

## Findings

### Safe references found (not secrets)

| File | Pattern | Verdict |
|---|---|---|
| `apps/hermes-web-tv/package-lock.json` | `https://github.com/sponsors/...` | SAFE — npm package funding URLs |
| `services/hermes-tv-api/package-lock.json` | `https://registry.npmjs.org/...` | SAFE — npm registry references |
| `services/hermes-tv-api/src/middleware/credentialGuard.js` | `password`, `api_key`, etc. | SAFE — these are the regex patterns used to BLOCK credentials |
| `apps/hermes-web-tv/src/components/FloatingChatbot.jsx` | `password`, `api_key` | SAFE — guard patterns for input rejection |
| `apps/hermes-tv-tizen-native/src/core/commandRouter.js` (renamed 2026-05-18) | `password`, `api_key` | SAFE — credential field blocklist |
| `services/hermes-tv-api/src/routes/setup.js` | `username`, `password` | SAFE — HTML form field names for the provider setup UI (data posted to local backend only) |
| `apps/catalog.mock.json` | `https://hermestv.local/...` | SAFE — local dev host only |

### No actual credentials found

No actual usernames, passwords, API keys, tokens, M3U URLs, Xtream credentials, or bearer tokens were found in any source file.

---

## .gitignore Coverage

The following patterns are in `.gitignore` to prevent future accidental commits:

```
**/.env.hermestv
*.authkey
*.pem
*.key (non-public)
*.crt
*.pfx
*.p12
secrets/
private/
*.wgt
```

---

## What Requires Live Credentials (never in repo)

These items require credentials that must ONLY exist in `G:\private\` on the user's local machine or the Hostinger VPS, never committed:

- Xtream Codes API username + password (Apollo Group, XtremeHD)
- Azure TTS subscription key
- Tailscale auth key
- Tizen authkey (for signing .wgt packages)
- Jellyfin API token
- VPS SSH private key

---

## Next Audit

Re-run before any PR merge using:

```sh
node tools/schema-validate.js
bash tools/secret-scan.sh
```

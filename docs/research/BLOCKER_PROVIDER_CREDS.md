# BLOCKER — Real Provider Credentials Required

**Created:** 2026-05-17
**Lane:** 06 — Provider Onboarding Gaps

---

## What Is Blocked

- Actual live IPTV stream playback
- Real /api/providers response with working connection slots
- Credential storage implementation testing
- Apollo Group provider integration
- XtremeHD provider integration

---

## What Is Required

1. **Apollo Group account** — active IPTV subscription with:
   - Host URL (Xtream Codes API compatible endpoint)
   - Username
   - Password

2. **XtremeHD account** — active IPTV subscription with:
   - Host URL
   - Username
   - Password

---

## Where Credentials Must Be Stored

Credentials must ONLY be stored at:
- `G:\private\.env.hermestv` — workstation credential vault (never committed)

Format:
```
APOLLO_HOST=http://...
APOLLO_USERNAME=...
APOLLO_PASSWORD=...
XTREMEHD_HOST=http://...
XTREMEHD_USERNAME=...
XTREMEHD_PASSWORD=...
```

**NEVER:**
- Commit to git
- Include in any API response
- Include in any log output
- Pass to the TV client directly

---

## Non-Blocking for B2

This blocker does NOT block the B2 local mock demo. All catalog data, streams, and provider summaries are served as mock data from `apps/hermes-web-tv/mock/catalog.mock.json`. The full demo runs without real credentials.

---

## When to Resolve

B4 phase — real provider integration. After B3 (QR onboarding flow) is implemented, B4 wires the form submit to write credentials to `G:\private\.env.hermestv` and restart the provider adapters.

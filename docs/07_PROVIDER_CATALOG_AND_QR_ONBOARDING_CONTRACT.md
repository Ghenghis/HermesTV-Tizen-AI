# 07 — Provider Catalog and QR Credential Onboarding Contract

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for provider integration, catalog normalization, and secure credential onboarding. It is referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` agents 11 (Catalog + Provider Normalization), 12 (Quality Scanner), 23 (Security / Legal Boundary), and 24 (Release Manager / Truth Gate).

---

## Hard rules

1. Provider credentials — usernames, passwords, M3U links, Xtream tokens, portal URLs, cookies, and any secret capable of activating a subscription — must **never** appear in the Tizen app bundle, frontend JavaScript, TV local storage, screenshots, diagnostics exports, commit history, or log output.
2. The Tizen TV app sees only: provider IDs, display labels, masked status indicators, catalog data, feature flags, and quality badges. It never receives raw credentials.
3. All credential storage, playlist ingest, and capability probing happen exclusively on the backend. The backend exposes only catalog-safe API responses to the TV.
4. Provider credentials are never committed to GitHub, even in encrypted form. They are stored in a local secrets vault (`G:\private\` or equivalent operator-controlled path) and loaded at backend startup via environment variables or a local secrets file that is in `.gitignore`.
5. Backend normalizes Apollo Group and XtremeHD into a single unified catalog. Each catalog item retains its source provider tag.
6. Credentials may be rotated or re-entered only through the QR onboarding flow or a separate local-backend setup page. The TV remote cannot trigger a raw credential input screen.
7. Profile access rules (Dave-only, Sherri/Mom-only, both) are enforced by the backend before any catalog item is returned to the TV. The TV does not hold access control logic.
8. Dave's TV (`UN55CU8000BXZA`) and Mom's TV (`QN85Q7FAAFXZA`) may be on different provider access subsets per the profile access setting. Mom's TV is never artificially limited in what it is allowed to play.
9. Session and device slot tracking is mandatory. For 2-device accounts, the backend must enforce the device limit before requesting a new stream slot, protecting the subscription from forced eviction by the provider.
10. Diagnostics exports must strip all credentials, tokens, portal URLs, and personally identifying values before any export is written to disk or sent anywhere.

---

## Providers

| ID          | Display label (default) | Type                      |
|-------------|-------------------------|---------------------------|
| `apollo`    | Apollo Group            | Xtream / M3U / VOD / Series |
| `xtremehd`  | XtremeHD                | Xtream / M3U / VOD / Series |

Display labels are operator-configurable via Provider Settings (see section below). The internal ID is fixed and not user-facing.

---

## Backend-only provider record

What the backend stores for each provider. **None of these fields are ever returned to the TV.**

```jsonc
{
  "provider_id": "apollo",
  "display_label": "Apollo Group",
  "enabled": true,
  "credential_ref": "vault:providers/apollo",   // pointer to local vault; never the value
  "access_type": "xtream",                       // "xtream" | "m3u" | "m3u_xtream_hybrid"
  "capabilities_probed_utc": "2026-05-17T22:00:00Z",
  "capabilities": {
    "live": true,
    "vod": true,
    "series": true,
    "catch_up": true,
    "xmltv": true,
    "multi_stream": 2                            // max concurrent streams this account allows
  },
  "priority_order": 1,
  "profile_access": ["dave_tv", "mom_tv"],       // profiles allowed to use this provider
  "refresh_schedule_cron": "0 4 * * *",
  "last_catalog_refresh_utc": "2026-05-17T04:00:00Z",
  "last_epg_refresh_utc": "2026-05-17T04:05:00Z",
  "health": "ok"                                 // "ok" | "degraded" | "down" | "unknown"
}
```

---

## TV-safe provider summary

What the backend returns to the TV app for a provider. No credentials, no portal URL, no tokens.

```jsonc
{
  "provider_id": "apollo",
  "display_label": "Apollo Group",
  "enabled": true,
  "health": "ok",
  "capabilities": {
    "live": true,
    "vod": true,
    "series": true,
    "catch_up": true,
    "xmltv": true
  },
  "profile_access": ["dave_tv", "mom_tv"],
  "last_refresh_utc": "2026-05-17T04:00:00Z",
  "stream_slots_total": 2,
  "stream_slots_in_use": 1
}
```

---

## Catalog item schema

Every item in the unified catalog carries the following tags regardless of provider source.

```jsonc
{
  "item_id": "01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "title": "...",
  "content_type": "live",              // "live" | "movie" | "series"
  "provider_tags": ["apollo"],         // one or both of ["apollo", "xtremehd"]
  "preferred_source": "apollo",        // which provider to play by default
  "duplicate_count": 1,                // how many providers carry this item
  "quality": {
    "resolution": "1080p",             // "480p" | "720p" | "1080p" | "1440p" | "4K" | "unknown"
    "codec": "h264",                   // e.g. "h264" | "h265" | "av1" | "unknown"
    "bitrate_bucket": "high",          // "low" | "medium" | "high" | "ultra" | "unknown"
    "fps": 30,                         // null if unknown
    "audio_codec": "aac",              // null if unknown
    "scan_utc": "2026-05-17T04:00:00Z",
    "possible_upscale": false          // ffprobe heuristic hint only; not authoritative
  },
  "epg": {
    "status": "matched",              // "matched" | "partial" | "missing" | "stale"
    "channel_id": "...",
    "next_program": "..."             // null if missing or live-only
  },
  "catch_up_available": true,
  "provider_health": {
    "apollo": "ok",
    "xtremehd": "ok"
  },
  "profile_access": ["dave_tv", "mom_tv"]
}
```

Resolution values are populated by the quality scanner (agent 12 / `docs/07_QUALITY_STREAM_STATS_CONTRACT.md`). Until a scan completes the value is `"unknown"`.

---

## Core catalog views

All views are rendered by the Tizen app using data returned by the backend. The TV app does not query providers directly.

### 1. Unified All Providers

All items from Apollo and XtremeHD merged into a single de-duplicated catalog. Duplicate items are collapsed to one card showing all available source badges. Profile access filter applied before response is sent.

### 2. Apollo-only catalog

Items where `provider_tags` contains `"apollo"`. Sorted by content type then title. Respect profile access.

### 3. XtremeHD-only catalog

Items where `provider_tags` contains `"xtremehd"`. Same sort and access rules.

### 4. Compare Providers view

Side-by-side or toggle view for items available from both providers. Shows resolution, codec, bitrate bucket, EPG status, and catch-up per provider. Allows the user to set `preferred_source` per item. Change is sent to the backend via agent command schema (`docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`).

### 5. Provider Health view

Per-provider status panel. Shows health indicator (ok / degraded / down / unknown), last refresh time, stream slot usage, capability flags, and a button to trigger Test Connection. No credentials shown. Refresh and test actions route through the backend; the TV only receives the result.

### 6. Provider Settings view

Full settings panel per provider. All mutations are sent to the backend as validated JSON commands. See Provider Settings section below.

### 7. Duplicate Finder view

Sorted list of items with `duplicate_count > 1`. Shows side-by-side quality comparison for each provider source. Allows the user to set or clear `preferred_source`. Useful for promoting the highest-quality source or the most reliable provider.

### 8. Best Quality Available view

Items filtered and sorted by resolution descending, then bitrate bucket descending, then codec efficiency. Ties broken by provider priority order. Badges show the winning source. Optionally filterable to a single provider.

### 9. Missing EPG / Broken Streams view

Items where `epg.status` is `"missing"` or `"stale"`, or where a recent stream check returned an error or dead URL. Used for maintenance: operator can trigger EPG rebuild, quality rescan, or flag for removal. No stream URLs are exposed to the TV.

### 10. Per-profile favorites by provider

Dave and Sherri/Mom each maintain an independent favorites list. Favorites can be scoped to a single provider or span both. The backend stores favorites under the profile ID. The TV app fetches only the active profile's favorites. Favorites are never shared across profiles without explicit user action.

---

## Provider settings contract

All settings below are mutations sent to the backend. The TV app emits a JSON command per `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`. The backend applies, logs, and returns a result. **No setting directly exposes credentials.**

| Setting | Requires confirm | Notes |
|---|---|---|
| enable / disable provider | yes | Disabling hides all items from that provider in all views |
| rename display label | no | Changes `display_label` in backend record; does not affect `provider_id` |
| set priority order | no | Integer rank used for tie-breaking preferred source and view sort |
| Dave / Sherri / both access | yes | Removes or restores profile access; instant effect on catalog responses |
| max concurrent streams / devices | no | Operator override cap; cannot exceed the account's actual slot limit |
| refresh now | no | Triggers immediate catalog and EPG refresh; returns job ID |
| refresh schedule | no | Sets `refresh_schedule_cron`; backend validates cron expression |
| test connection | no | Backend probes provider; returns latency, slot status, capability flags |
| rebuild catalog | yes | Drops and re-ingests the full catalog from provider; may take several minutes |
| rebuild EPG | yes | Drops and re-fetches XMLTV EPG; may take several minutes |
| rescan quality | no | Queues ffprobe scan for all provider items; runs in background |
| clear provider cache only | yes | Clears backend cache without touching credentials or the catalog DB |
| remove provider | yes, 2-step | Removes provider record and all associated catalog items; irreversible until re-onboarded |
| rotate / re-enter credentials | yes | Opens QR onboarding flow for this provider; old credentials not shown |
| export sanitized diagnostics | no | Writes a local file with health, capability, refresh history, error logs; all credentials and URLs redacted |

`requires_user_confirm: true` means the TV shows a confirmation card with a 5-second timeout and requires a physical remote button press before the backend applies the change. Agents obey the same gate (`docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` rule 8).

---

## QR credential onboarding flow

This is the only path by which provider credentials enter the system.

```
Step 1  TV shows "Add Provider" screen
        → Displays a QR code and short alphanumeric pairing code
        → QR encodes a local backend URL: http://hermestv.local/setup/provider?session=<token>
        → Token is single-use, time-limited (10-minute TTL), and scoped to one provider add or rotate

Step 2  User scans QR on phone or PC
        → Browser opens the local backend setup page (served by the HermesTV backend on the LAN only)
        → Page is not reachable from the public internet
        → Page shows a form for: provider type, display label, Xtream/M3U credentials
        → Page does not communicate with any external service at this step

Step 3  User submits credentials on phone/PC
        → Browser sends credentials only to the local backend over LAN (HTTPS if cert is configured, HTTP if on localhost-only)
        → Credentials are never sent to the Tizen TV app or to GitHub

Step 4  Backend stores and encrypts
        → Backend writes credentials to the local vault (G:\private\ or operator-configured path)
        → The vault file is in .gitignore and never committed
        → Backend marks the pairing session as consumed; the QR / token is now invalid

Step 5  Backend probes capabilities
        → Backend tests the credentials against the provider's Xtream or M3U endpoint
        → Probes: authentication, live streams count, VOD count, series count, catch-up flag, EPG/XMLTV availability, max stream slots
        → Saves capability result to the provider record (no credential in the result object)

Step 6  TV receives safe provider profile
        → Backend sends TV-safe provider summary (see TV-safe provider summary schema above)
        → Catalog ingest job is queued automatically
        → TV shows provider badge, health status, and "Catalog loading…" indicator
        → TV never receives any credential, token, or portal URL at any step
```

### QR onboarding invariants

- The local backend page must not log credentials to any file, stdout, or monitoring system.
- The pairing token must expire even if unused (10-minute TTL).
- The pairing token must be invalidated immediately after use.
- The setup page must not be reachable on a public IP or through Tailscale exit-node routing without explicit operator opt-in.
- A rotate/re-enter credentials flow follows the same steps. The old credential reference is overwritten only after the new probe succeeds.

---

## Stream and device limit protection

For providers with 2-device (or any fixed-slot) accounts:

1. The backend tracks active sessions per `(provider_id, profile_id, device_id)` tuple.
2. Before requesting a new stream from a provider, the backend checks whether the slot count is already at the account maximum (`capabilities.multi_stream`).
3. If at the limit:
   a. The backend checks whether any existing session belongs to the requesting profile or device.
   b. If the requesting device already holds a slot (e.g., resuming), the same slot is reused — no new slot is requested.
   c. If no slot is available for the requesting device, the backend returns a `stream_limit_reached` error to the TV. The TV shows a friendly card: "Your provider allows 2 streams. You are using all slots. Stop another stream first."
   d. The backend never forcibly evicts another device's session without explicit user confirmation from that device's profile.
4. On stream stop, the backend marks the session closed and releases the slot.
5. Sessions that have not sent a heartbeat in 5 minutes are automatically released. The backend does not rely on the provider to enforce this.

---

## Backend session tracking schema

```jsonc
{
  "session_id": "sess_01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "provider_id": "apollo",
  "profile_id": "dave_tv",
  "device_id": "device_tizen_qn85",           // opaque TV device identifier; not a credential
  "item_id": "01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "started_utc": "2026-05-17T22:00:00Z",
  "last_heartbeat_utc": "2026-05-17T22:03:00Z",
  "status": "active",                          // "active" | "stopped" | "expired"
  "stopped_utc": null
}
```

The session record never contains a stream URL, token, or credential. The URL is resolved at play time by the backend and proxied or returned as a short-lived signed URL, never stored in the session record.

---

## Safe remove, update, and refresh flows

### Refresh (catalog / EPG / quality)

1. Backend queues the refresh job internally.
2. TV shows a progress indicator using a job status poll (`GET /api/providers/{id}/jobs/{job_id}`).
3. Existing catalog items remain playable during refresh.
4. On completion, the backend swaps in the new catalog atomically. No partial state is visible to the TV.
5. Failed refresh does not remove existing catalog data. Backend logs the error and marks provider health as `degraded`.

### Update provider settings

1. TV emits JSON command per `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`.
2. Backend validates the command, applies the change, and returns success/failure.
3. Changes are logged to the audit ledger with timestamp and profile context.
4. Destructive changes (access removal, priority change) take effect immediately and are reversible via the same settings panel.

### Remove provider

1. TV emits `remove_provider` command. Requires 2-step confirm.
2. Backend checks for active sessions. If any session for this provider is active, the remove is blocked until the session ends or the user force-confirms.
3. Backend deletes the provider record, catalog items, and EPG data for that provider.
4. Credential vault entry is cleared by the backend's secret manager; it is never sent to the TV as part of this flow.
5. After removal, the TV-safe provider list no longer includes the provider. Items that were exclusive to that provider disappear from all catalog views.

---

## Proof gates

The following must be verified and documented before this contract is considered implemented. No claim of implementation is accepted without evidence.

| Gate | Evidence required |
|---|---|
| No credentials in repo | `git log --all -p \| grep -iE "(password\|token\|m3u\|xtream\|portal\|username)" returns zero matches` |
| No credentials in frontend bundle | Build artifact grep for known secret patterns returns zero matches |
| No credentials in TV local storage | TV devtools / Tizen Web Inspector shows zero credential-pattern values in localStorage, sessionStorage, and cookies |
| No credentials in log output | Backend log rotation sample shows only masked/redacted values where provider fields appear |
| No credentials in diagnostics export | Export file review: all credential fields replaced with `[REDACTED]` |
| No credentials in screenshots | Visual QA screenshot set reviewed; no credential strings visible in any overlay, toast, debug panel, or settings screen |
| QR token expires | Automated test: token unused for 10+ minutes → backend returns 401 on attempt to use it |
| QR token single-use | Automated test: second use of already-consumed token → backend returns 410 |
| Stream slot enforcement | Manual test: start 2 streams on a 2-slot account → third stream blocked with user-facing message |
| Setup page not public | Network probe from external IP → connection refused or 403 |
| Remove is reversible via re-onboard | Remove provider → re-onboard via QR → catalog re-appears; no data from previous run leaks back |

---

## Integration with other contracts

| Contract | Dependency |
|---|---|
| `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` | All provider setting mutations route through the safe command schema. Provider IDs and profile IDs referenced here must be registered in `schemas/agents/registry.json`. |
| `docs/07_QUALITY_STREAM_STATS_CONTRACT.md` | Quality scanner populates `quality.*` fields on catalog items. This contract defines the fields; that contract defines the scanning behavior and output format. |
| `docs/08_BACKEND_STACK_CONTRACT.md` | Defines the Docker/Caddy/backend services that host the provider vault, ingest pipeline, and local QR setup page. |
| `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md` | Provider proof gates above feed into the top-level acceptance gate checklist. |
| `docs/12_EPG_CONTENT_DISCOVERY_CONTRACT.md` | EPG rebuild and XMLTV normalization for provider-sourced guide data. |
| `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md` | Provider badges and health indicators must be legible across all 24 themes; badge colors must meet contrast requirements on both QN and UN target TVs. |

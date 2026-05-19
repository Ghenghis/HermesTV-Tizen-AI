# 45 — DaveTV Rebrand Notes

**Date:** 2026-05-19
**Scope:** User-facing rebrand of the product name from **HermesTV** to **DaveTV**.
**Status:** BINDING for all new user-facing copy.

---

## 1. Why the rebrand

The product is built for a private household — Dave and Sherri ("Mom"). The owner asked for a more personal, household-bound name on screen. "DaveTV" makes the install feel like a home appliance rather than a generic IPTV product. It also separates the product brand from the AI persona (the default agent persona is still **Hermes**, which the user can rename per profile via the persona contract in `docs/11_USER_AGENT_PERSONA_NAMING_CONTRACT.md`).

The agent character name "Hermes" is intentionally **kept** because:
- It is a renameable persona, not a product brand.
- Doc 11 explicitly stores `agent_name` per profile with a default of `"Hermes"`.
- Sherri may rename hers to "Nova" or anything else without affecting the product name shown elsewhere.

---

## 2. What changed (user-facing)

The following surfaces use the new name **DaveTV**:

- App name in the on-screen UI (home shell title, splash, About panel)
- Browser tab title (HTML `<title>`)
- All documentation prose that talks about "the app" by name
- Doc titles that previously said "HermesTV"
- Setup/first-run guides written for the household operator

Specifically, the following docs in this commit had user-facing brand strings rewritten:

| Doc | Change type |
|---|---|
| `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` | Title + mission sentence |
| `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md` | UX mandate paragraph |
| `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` | Prose mention of "the app UI"; schema keys unchanged |
| `docs/11_USER_AGENT_PERSONA_NAMING_CONTRACT.md` | Doc title only |
| `docs/16_TODAY_READY_SETUP_GUIDE.md` | Title + intro sentence |
| `docs/17_FIRST_RUN_FOR_DAVE_AND_SHERRI.md` | Title + intro sentence |

Each edited doc carries a footer marker:

```
_(Rebranded HermesTV → DaveTV 2026-05-19 per user request; technical identifiers unchanged.)_
```

---

## 3. What did NOT change (technical identifiers)

A blind global find/replace would break deployments, lockfiles, and DNS. The following stay as `hermes*` permanently because they are wire-compatibility names, not user-facing strings:

| Category | Identifier | Reason |
|---|---|---|
| Repo / GitHub URL | `HermesTV-Tizen-AI`, `github.com/Ghenghis/HermesTV-Tizen-AI` | Renaming the repo breaks every clone URL, PR link, and CI ref. |
| Hostnames / DNS | `hermestv.daveai.tech`, `hermestv-vps-*` | Already provisioned, Caddy/CORS allowlists pinned, SSL cert issued. |
| Backend service | `hermes-tv-api` (Docker container name + folder `services/hermes-tv-api/`) | Container name is referenced in `docker-compose`, secrets vault, and the deploy GH Action. |
| npm package | `hermes-web-tv` (folder `apps/hermes-web-tv/` + `package.json` name) | Renaming would force every lockfile + every CI cache to rebuild from zero. |
| JSON schema namespace | `hermestv.ui.v1`, `hermestv.ui.v1/commands/*.json` `$id` | Used as wire identifiers in the agent command router and the audit ledger. Renaming requires a v2 migration with shadow-write. |
| localStorage keys | `hermes:active_profile`, `hermes:last_switch`, `hermes:device_id` | Renaming orphans every existing install's saved profile state. |
| Redis key prefix | `profile:{device_id}:{profile_id}` (no rename), `hermes-bk-*` build IDs | Existing keys would all need a migration script. |
| Log prefix | `[HermesAPI]` in the backend service stdout | Cosmetic; not visible to end-user; greppable for support. |
| AI agent persona default | `"Hermes"` (`agent_name` field default) | Persona character, renameable per profile — per doc 11 rule. |

These are operator-only strings. End users never see them.

---

## 4. Migration steps (operator only)

Run these in order. None require code changes.

### 4.1 Cloudflare DNS (optional — vanity hostname)

If the household wants `tv.daveai.tech` as a friendly alias, add a CNAME alongside the existing hostname — do not remove the original:

```
Type:   CNAME
Name:   tv
Target: hermestv.daveai.tech
TTL:    Auto
Proxy:  Proxied (orange cloud)
```

The existing `hermestv.daveai.tech` keeps serving — both names will resolve to the same VPS. Cert auto-issues via Cloudflare. This gives a friendlier URL without breaking deployed clients.

### 4.2 GitHub Actions secrets (no rename needed)

`gh secret update` is **not required** for this rebrand because no secret name encodes the product brand. Verify (no-op):

```powershell
gh secret list --repo Ghenghis/HermesTV-Tizen-AI
```

If any future secret is created with a brand name in it, prefer `DAVETV_*` over `HERMESTV_*`.

### 4.3 Container env vars (cosmetic)

If the operator wants the in-app `<title>` and the splash to read "DaveTV", set this env var on the web container at deploy time:

```
VITE_APP_NAME=DaveTV
VITE_APP_TITLE=DaveTV
```

The Vite build will pick these up on next deploy. No source edits in this commit — Markdown only.

### 4.4 No-ops (do not run)

- Do **not** rename the GitHub repo.
- Do **not** rename the Docker container `hermes-tv-api`.
- Do **not** rename the npm package `hermes-web-tv`.
- Do **not** rewrite `hermestv.ui.v1` schema `$id` values.
- Do **not** clear `localStorage` keys prefixed `hermes:`.

---

## 5. Acceptance tests (5 grep spots)

Run these from the repo root after deploy. Each command's expected outcome is documented.

### 5.1 User-facing app title is DaveTV

```powershell
grep -nE "DaveTV" apps/hermes-web-tv/index.html
```

**Expected:** at least one match in `<title>` (or via `VITE_APP_NAME` substitution at build time).

### 5.2 Docs intro now says DaveTV

```powershell
grep -lE "^# .*DaveTV" docs/
```

**Expected:** matches in docs 00, 11, 16, 17, 45.

### 5.3 Footer marker is present on all 6 edited docs

```powershell
grep -lE "Rebranded HermesTV → DaveTV 2026-05-19" docs/
```

**Expected:** exactly 6 matches — docs 00, 03, 06, 11, 16, 17.

### 5.4 Technical identifiers are still intact

```powershell
grep -nE "hermes-tv-api|hermes-web-tv|hermestv\.ui\.v1|hermestv\.daveai\.tech" docs/45_DAVETV_REBRAND_NOTES.md
```

**Expected:** matches present in this very doc (the "did NOT change" section is still listing them — proof we did not blow them away).

### 5.5 Agent persona name "Hermes" still defaults to "Hermes"

```powershell
grep -nE "Default Agent Name.*Hermes|\"agent_name\": \"Hermes\"|agent_name: \"Hermes\"" docs/11_USER_AGENT_PERSONA_NAMING_CONTRACT.md
```

**Expected:** the default agent name remains `Hermes` in the persona table and in profile JSON examples. Renaming the product did not rename the bot character.

---

## 6. Future cleanup (out of scope for this commit)

A future ticket may:
- Add `DAVETV_*` env var aliases that fall back to the `HERMESTV_*` set, then deprecate the originals over 2 releases.
- Migrate the JSON schema namespace from `hermestv.ui.v1` → `davetv.ui.v1` via dual-write + a `schema_version` capability negotiation.
- Add a `tv.daveai.tech` Cloudflare DNS record alongside the existing hostname.

None of those happen here. This commit is **doc-only**, Markdown-only, zero JS/React edits, zero dependency changes, and zero touched secrets.

_(Rebranded HermesTV → DaveTV 2026-05-19 per user request; technical identifiers unchanged.)_

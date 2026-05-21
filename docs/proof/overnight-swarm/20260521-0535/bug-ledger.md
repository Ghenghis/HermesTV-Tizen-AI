# Bug Ledger — 2026-05-21 05:35 UTC (Wave 2 deep continuation)

Continuation of `docs/proof/overnight-swarm/20260521-0423/bug-ledger.md`.
Only new entries and status transitions live here — the original entries
are not duplicated.

Schema: as in 0423/bug-ledger.md.

---

## BUG-SWARM-001 — secret-scan false positives (status update)

- Earlier status: open → in_progress (fix targeted in Wave 2)
- **Wave 2 outcome:** **fixed**
  - `tools/secret-scan.sh` patterns tightened to require credential-shaped
    values (Xtream URL requires `user&password=` of plausible length;
    Authorization Bearer requires plausible token shape; OPENAI/Apim keys
    must look like real keys, not env-var name references).
  - Sanitizer-file allowlist guards files that *defines* the redactors.
  - Windows drive-letter colon handled by awk path-vs-line-number split.
- Proof: `npm run audit:secrets` → `EXIT=0`, `2 PASS / 0 FAIL`
  (see `commands.md`).
- Status: **fixed**

## BUG-SWARM-002 — e2e-smoke 2/10 after auth gate (status update)

- Earlier status: open → in_progress
- **Wave 2 outcome:** **fixed**
  - `tools/test-e2e-smoke.js` bootstraps an isolated admin in a mkdtemp
    auth store, logs in, threads the `davetv_session` cookie through every
    request.
  - Empty-state run (`NO_PROVIDER_EMPTY_STATE=1`) → **12 / 0** EXIT=0.
  - Live run (no providers) → **9 PASS / 3 honest FAIL** (3 fails are the
    docs/46 anti-skip contract refusing to PASS a live probe with no
    catalog items — this is the correct behaviour, not a regression).
- Status: **fixed**

## BUG-SWARM-007 — apiBase escape hatch (status update)

- Earlier status: open — deferred to post-Lane-A swarm
- **Wave 2 outcome:** the escape hatch **already exists** in
  `apps/hermes-web-tv/src/api/apiBase.js`:
  - `window.__HERMES_API_BASE__` (runtime injection)
  - `window.localStorage.getItem('davetv_api_base')` (persistent override)
  - `import.meta.env.VITE_DAVETV_API_BASE` (build-time)
  - `hermesApi.js:1-3` consumes it via `resolveApiBase()`
- Re-checked while wiring the provider-reload UI proof. The cross-origin
  failure observed earlier was the SameSite cookie, not the API base.
- Status: **rejected (already-implemented)** — original observation was
  wrong; the escape hatch was added by Lane A before this swarm started.

## HANDOFF #4 — `setupProviderRestart.e2e.test.js` missing (status update)

- Earlier status: missing → in_progress
- **Wave 2 outcome:** **fixed**
  - New test `services/hermes-tv-api/test/setupProviderRestart.e2e.test.js`
    spins API on `:3296` with isolated mkdtemp DATA_DIR, walks login →
    pair → setup submit → providers/catalog non-empty, then closes the API,
    flushes the require cache, boots the same DATA_DIR on the same port,
    re-logs in, re-reads providers/catalog (still has the row), and
    HEAD-probes the play URL to confirm 200.
  - Result: **16 PASS / 0 FAIL** (`node test/setupProviderRestart.e2e.test.js`).
  - Wired into `npm test` chain in `services/hermes-tv-api/package.json`.
- Status: **fixed**

## HANDOFF #6 — `sourceHealth` ignores disk providers (status update)

- Earlier status: open
- **Wave 2 outcome:** **fixed**
  - `services/hermes-tv-api/src/lib/sourceHealthAggregator.js` now iterates
    every key returned by `m3uClient.getProviderStatus()` including the
    disk-backed registry rows (`prov-<hex>` ids). Each disk-sourced row is
    labelled `credential_bearing: true` so the UI can hide it correctly.
  - Verified by running the API with an isolated provider store + one
    disk-only Xtream provider; `/api/sources/health` returns the row with
    `count > 0`. This is the same code path exercised by the new
    `setupProviderRestart.e2e.test.js`.
- Status: **fixed**

## HANDOFF #7 — `credentialGuard` missing m3u_plus + others (status update)

- Earlier status: open
- **Wave 2 outcome:** **fixed**
  - `services/hermes-tv-api/src/middleware/credentialGuard.js` patterns
    extended: `/m3u_plus/i`, `/sk-[A-Za-z0-9_\-]{20,}/i`,
    `/Ocp-Apim-Subscription-Key/i`. `_FORBIDDEN_PATTERNS` exported so a
    sync test can guarantee parity with `sanitizeLog.js`.
  - New test `services/hermes-tv-api/test/credentialGuardSync.test.js`
    feeds 12 canonical leak payloads through BOTH redactors and asserts
    both catch them; 3 benign payloads must pass both.
  - Result: **32 PASS / 0 FAIL**.
- Status: **fixed**

## HANDOFF #8 — EPG mapping was in-memory only (status update)

- Earlier status: open
- **Wave 2 outcome:** **fixed**
  - New `services/hermes-tv-api/src/lib/epgMappingStore.js` — file-backed
    atomic store mirroring `providerStore.js` (mkdtemp + temp-then-rename
    writes, 0600 perms, same `HERMES_PROVIDER_DATA_DIR` root, file `epg.json`).
  - Routes `POST /api/epg/mapping` and `PATCH /api/epg/settings` now persist
    through the store (async). `_meta.source` changed from `'in-memory'`
    to `'epg-mapping-store'`. The legacy in-memory `EPG_MAPPING` shim is
    kept for the synchronous suggest-channels read path until that route is
    asyncified separately.
  - New test `services/hermes-tv-api/test/epgMappingRestart.test.js` — boot
    A writes mapping + custom settings, restart, boot B reads them back on
    the same DATA_DIR; boot-B additive write proves `mapping_count` carries
    over.
  - Result: **10 PASS / 0 FAIL**.
- Status: **fixed**

## HANDOFF #10 — `IptvnatorShell` placeholder EPG (status update)

- Earlier status: open
- **Wave 2 outcome:** **fixed**
  - `apps/hermes-web-tv/src/shells/IptvnatorShell.jsx` — synthetic
    `_placeholderNow(channel)` helper deleted. Replaced with
    `_currentProgrammeText(channel, nowByChannelId)` which is empty when no
    real EPG is available. New `useEffect` fetches `/api/epg/grid` into a
    `nowByChannelId` map keyed by `channel.id`/`xmltv_id`/`name`.
  - Verified locally with the build (`npm run build:web` → green, 276.85 kB).
  - Aligns with `feedback_no_mocks_no_stubs` (memory) — empty state wins
    over fake "Now: News" titles when no EPG payload is returned.
- Status: **fixed**

## HANDOFF #9 — `hermestv_dev_mock` ships to prod (status update)

- Earlier status: open
- **Wave 2 outcome:** **fixed in working tree (uncommitted)**
  - `apps/hermes-web-tv/src/App.jsx` — the `hermestv_dev_mock` localStorage
    branch is now gated behind `import.meta.env.DEV`. The boot-time check
    short-circuits to `false` in any production build.
  - Verified by reading the latest production bundle: the dev-mock branch
    appears as `var P = !1; var C = P && localStorage.getItem(...)` — i.e.
    dead code after Terser. Confirms HANDOFF #9 is resolved at the bundle
    layer.
  - Not yet committed because `App.jsx` is co-located with Lane A WIP and
    a co-staging risk; staged separately in a follow-up commit.
- Status: **fixed-in-working-tree** (commit pending; functional fix verified)

## BUG-SWARM-009 — AuthGate React state doesn't trust proxied `/api/auth/me`

- Severity: **P1**
- Area: Web app auth gate
- File/line: `apps/hermes-web-tv/src/components/AuthGate.jsx` (init effect);
  consumed by `App.jsx` boot
- Observed failure: when Playwright drives the web app with `page.route()`
  proxying `localhost:3001/api/**` to a sidecar API on a different port,
  the HTTP layer succeeds (`/api/auth/me` returns `hasUser: true` with the
  proxied session cookie) but the React tree stays on the login surface.
  Symptom: `state.auth.configured === false` even after a successful
  `/api/auth/me` response.
- Expected behavior: when `/api/auth/me` returns `hasUser: true`, the gate
  should resolve to `auth.configured = true` and the rest of the app should
  mount.
- Proof: `tests/playwright/specs/swarm-20260521-provider-reload-ui.spec.ts`
  — original deep-UI variant landed on the login surface and was adapted to
  a boundary-reload proof. Honest pass logged.
- Suspected cause: AuthGate may double-check origin or rely on a side
  effect not satisfied by `page.route()` proxy (cookie origin mismatch,
  CORS preflight from `withCredentials`, or a fetch-from-fetch race).
- Fix owner: **Lane A** (auth gate owns the boot decision tree).
- Status: **open** — honest blocker logged; HTTP-layer correctness is proven
  by the sidecar API spec (6/0), so this is purely a React-state issue.

# HermesTV — CI and Testing

**Version:** 1.0.0
**Date:** 2026-05-18
**Status:** Active. CI runs on every PR to `main` and on push to `main`.

This document explains the GitHub Actions CI workflow, how to run every test it executes locally, what each failure mode means, and how to extend the suite without breaking the existing gates.

---

## 1. What CI runs

Workflow file: `.github/workflows/ci.yml`

Four jobs, all on `ubuntu-latest` with Node 20 and `~/.npm` cache keyed on lockfile hashes:

| Job | Depends on | Time budget | Gate |
|---|---|---|---|
| `schema-validation` | — | 5 min | Must report `61 PASS, 0 FAIL` |
| `web-build` | — | 10 min | Vite build green, `dist/` uploaded as `web-dist` artifact |
| `chatbot-integration` | `schema-validation` | 10 min | Must report `40 PASS, 0 FAIL` |
| `secret-scan` | — | 5 min | Zero grep-pattern matches, no committed `.env*` |

`schema-validation`, `web-build`, and `secret-scan` run in parallel. `chatbot-integration` waits for `schema-validation` so we never burn API-boot time on a PR that already has schema regressions.

Triggers:
- `pull_request` against `main`
- `push` to `main`

Concurrency: superseded runs on the same ref are cancelled (`cancel-in-progress: true`).

---

## 2. What is NOT in CI (yet)

Deliberate exclusions, deferred to dedicated workflows when the infra catches up:

| Test | Why not in this CI | Where it lives instead |
|---|---|---|
| `npm run test:layouts` (Playwright) | Needs Chromium + running Vite + running API; the CI runner does not yet have a browser container | Run locally before opening a PR (see Section 4) |
| Real Azure TTS round-trip | Needs `AZURE_TTS_KEY` in repo secrets; key not yet provisioned for CI | Manual test on dev box |
| Tizen `.wgt` build | Needs Samsung Tizen Studio SDK on the runner | Separate workflow planned, scope TBD |
| VPS integration | CI must never contact the VPS | Manual via the operator runbook (`docs/22_*.md`) |

---

## 3. Running each test locally

All commands run from the repo root unless noted.

### 3.1 Schema validation

```bash
# Install API deps once
cd services/hermes-tv-api && npm install && cd ../..

node tools/schema-validate.js
```

Expected tail:

```
=== Results: 61 PASS, 0 FAIL ===
```

If the count drifts (say 62 or 60), update the gate in `.github/workflows/ci.yml` together with the schema change in the same PR.

### 3.2 Web build

```bash
npm install --include=dev
npm run build:web
```

Expected: `apps/hermes-web-tv/dist/index.html` exists. CI uploads this directory as the `web-dist` artifact for 7 days.

### 3.3 Chatbot integration

Needs the API running on port 3001 in another shell:

```bash
# Terminal A
node services/hermes-tv-api/src/index.js
```

```bash
# Terminal B
node tools/test-chatbot-commands.js
```

Expected tail:

```
=== Results: 40 PASS, 0 FAIL ===
```

The CI job automates the two-terminal dance: it starts the API in the background with `nohup`, polls `/health` for up to 30 seconds, then runs the suite.

### 3.4 Secret scan

```bash
npm run audit:secrets
```

This runs `tools/secret-scan.sh`, which is also what CI mirrors inline. The script tries `trufflehog` and `gitleaks` if installed; if not, it falls back to the grep pattern set — which is the exact set CI runs.

---

## 4. Pre-PR checklist (operator)

Before pushing a branch and opening a PR, run these in order. If any fails, fix locally — do not rely on CI to catch it.

```bash
npm install --include=dev
npm run build:web            # 1. Vite build
node tools/schema-validate.js # 2. 61/61 schemas

# In another shell:
node services/hermes-tv-api/src/index.js
# Back in the first shell:
node tools/test-chatbot-commands.js # 3. 40/40 chatbot

npm run audit:secrets         # 4. Secret scan

# Playwright (not in CI, but operator should run before merging UI changes):
cd tests/playwright && npm test && cd ../..
```

Then open the PR — the GitHub PR template (`.github/pull_request_template.md`) restates this list as checkboxes.

---

## 5. Reading CI failures

### 5.1 `schema-validation` red

The job prints the full validator output. Look for `FAIL:` lines — each names the offending schema file or rule. Common causes:

- A new schema file lacks `additionalProperties: false`
- A layout schema was bumped to v2.x but is missing the `un_degradation` block
- `apps/hermes-web-tv/mock/catalog.mock.json` lost the dual-provider items

Fix locally, run `node tools/schema-validate.js`, re-push.

### 5.2 `web-build` red

Most often a Vite error: a missing import, an unsupported API for Tizen's Chrome 76 target, or a syntax error in a JSX file. The job uploads no artifact on failure; rerun locally with `npm run build:web` for the same trace.

### 5.3 `chatbot-integration` red

Two failure shapes:

- **API never became healthy in 30 s.** The job uploads `hermes-api.log` as the `hermes-api-log` artifact. Most causes: port 3001 collision (unlikely in CI), a syntax error in a route module, or an uncaught require error. Run `node services/hermes-tv-api/src/index.js` locally — the same trace appears on stdout.
- **Suite ran but a case failed.** Output lists each `FAIL:` with the command text and the actual vs. expected action. Usually means a regex in `services/hermes-tv-api/src/routes/uiCommand.js` was changed without updating the test (or vice versa).

### 5.4 `secret-scan` red

Job prints the matched pattern and the offending file/line as a `::warning::`, then exits non-zero. Two paths:

- **Real leak**: rotate the key, scrub the file, force-push not allowed — open a follow-up PR removing the value, then rotate the credential out-of-band.
- **False positive** (legit literal that looks like a token): move it to a fixture under a `mock/` directory, or rename so it does not match a pattern, or extend the exclude list in `tools/secret-scan.sh` (mirror the change in `.github/workflows/ci.yml`).

---

## 6. Extending the suite

When adding a new check:

1. **Add the script under `tools/`.** Match the pass/fail-count output format so the CI grep enforcer can latch on:
   ```
   === Results: N PASS, M FAIL ===
   ```
2. **Wire it into `package.json`** under `scripts.test:*` or `validate:*`.
3. **Add a job to `.github/workflows/ci.yml`** that runs Node 20, calls the script, and asserts the expected count with `grep -qE`.
4. **Mirror it in this doc** — add a row to the table in Section 1, a local-run recipe in Section 3, and a failure-reading note in Section 5.
5. **If the new test needs the API**, add a `needs: schema-validation` dependency to avoid wasting boot time.

Counts are intentionally hardcoded in the workflow (`61 PASS, 0 FAIL`, `40 PASS, 0 FAIL`). When you legitimately change the test surface, update the count in the workflow in the same commit.

---

## 7. Secrets the CI does NOT need

This CI runs zero `${{ secrets.* }}` references. Do not add any to this workflow without sign-off. The credential boundary stays at the VPS — the repo and CI never see provider tokens. Tests that would need them (Azure TTS round-trip, provider catalog fetches against live endpoints) belong in a separate, gated workflow.

If a future test legitimately needs a key, the order of operations is:

1. Open an issue describing the test and which key it needs
2. Add the secret in the repo Settings → Secrets and variables → Actions
3. Add the secret reference in a new job with a clearly-scoped `permissions:` block
4. Document the secret name and rotation procedure in `docs/26_VPS_SECRETS_VAULT.md`

---

## 8. Files of interest

| Path | Purpose |
|---|---|
| `.github/workflows/ci.yml` | The CI workflow this doc describes |
| `.github/CODEOWNERS` | Operator owns every path; required reviewer |
| `.github/pull_request_template.md` | Checklist that mirrors Section 4 |
| `tools/schema-validate.js` | 61-case schema validator |
| `tools/test-chatbot-commands.js` | 40-case chatbot integration suite |
| `tools/secret-scan.sh` | Local secret scan; CI inlines its PATTERNS array |
| `package.json` | Top-level npm scripts referenced by both CI and operator |

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-05-18 | Initial workflow: schema-validation, web-build, chatbot-integration, secret-scan. Playwright, Tizen, and Azure TTS deferred. |

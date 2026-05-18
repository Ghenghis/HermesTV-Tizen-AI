# Lane 02 — Tizen Build/Deploy Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Scope:** Tizen WGT build pipeline, sign-and-deploy.sh, config.xml, package-wgt.js

---

## Summary

Audit of the Tizen build and deployment pipeline. The pipeline is structurally correct and intentionally conservative. Key gaps are credential path documentation and a missing `.tizen/` directory setup guide.

---

## config.xml Audit

| Check | Result | Notes |
|---|---|---|
| Package ID exactly 10 chars | PASS | `HermesTVap` = 10 alphanumeric chars. Comment confirms this is intentional. |
| required_version="6.5" | PASS | Line 13: `required_version="6.5"`. Comment explains why 3.0 must not be used. |
| access origin never `*` | PASS | Only `hermestv.local` origins are whitelisted. Hard rule comment present. |
| No credentials in config.xml | PASS | No API keys, tokens, or stream URLs present. |
| tizen:profile name="tv" | PASS | Correct profile for Samsung Smart TV. |
| AVPlay privilege declared | PASS | `http://developer.samsung.com/privilege/avplay` present. |
| productinfo privilege | PASS | Required for HERMES_CAP tier detection. |
| voicecontrol privilege | PASS | Declared for Samsung mic input capture (Azure TTS path). |
| mediacapturer privilege | PASS | Declared. |
| internet + network.get | PASS | Both declared. |
| filesystem read/write | PASS | Both declared. |

---

## sign-and-deploy.sh Audit

| Check | Result | Notes |
|---|---|---|
| set -euo pipefail | PASS | Correct bash safety flags. |
| TV_IP param required | PASS | Exits with usage message if missing. |
| WGT file existence check | PASS | Exits if hermes-tv.wgt not found. |
| Authkey path documented | GAP | Script references `CERT_PROFILE="HermesTV"` but does not document where the `.tizen/` profile and `.authkey` file must be created. No setup instructions in the script or adjacent README. |
| SDB port | PASS | Uses 26101, which is correct for Tizen developer mode. |
| sleep 2 after sdb connect | MINOR | A `sleep 2` after connect is fragile — sdb connect is synchronous but TV firmware may need time. Acceptable for B2. |
| wrt-launcher verify step | PASS | Step 4 checks that Hermes app is present. Warning-only, not fatal. |
| Developer mode note | PASS | Clear note about Settings > Support > About Smart TV path. |

---

## package-wgt.js Audit

| Check | Result | Notes |
|---|---|---|
| dist/ existence check | PASS | Exits with clear error. |
| Staging dir cleanup | PASS | rmSync with recursive+force. |
| Mandatory file warning | PASS | MANDATORY_STATICS warns if config.xml or index.html missing. |
| icon.png optional | PASS | Gracefully skipped if absent — should be noted in docs that a 512x512 icon.png is required for store submission. |
| archiver dependency | GAP | `archiver` npm package is `require`'d but not listed in apps/tizen-hermes-tv/package.json dependencies. Need to verify. |
| Output path cleanup | PASS | .wgt-stage cleaned up on close. |
| File size reporting | PASS | Summary prints size in MB. |

---

## Identified Gaps

### GAP-BUILD-01: Authkey/cert profile not documented (CRITICAL for deploy)
**Priority:** P1
**Issue:** The `.tizen/` directory (git-ignored by `*.authkey`) must contain the Samsung developer certificate profile named `HermesTV`. There is no document explaining how to create this, what files go in it, or what the Tizen Studio CLI commands are.
**Recommendation:** Create a BLOCKER file (see below) and a setup guide.

### GAP-BUILD-02: archiver package dependency
**Priority:** P1
**Issue:** package-wgt.js requires `archiver` but it may not be in tizen app package.json. If missing, `npm run package` will fail at runtime.
**Fix:** Verify `apps/tizen-hermes-tv/package.json` lists `archiver` in dependencies.

### GAP-BUILD-03: icon.png not present
**Priority:** P2
**Issue:** No `icon.png` exists in `apps/tizen-hermes-tv/`. The package script treats it as optional but Samsung TV WGT packages should include a 512x512 PNG icon for app launcher display.
**Recommendation:** Create a placeholder icon.png before B3 store testing.

### GAP-BUILD-04: No .env.example for deploy
**Priority:** P2
**Issue:** The deploy script depends on `tizen` and `sdb` CLI tools being in PATH, and the `TV_IP` being known, but there is no `.env.example` or DEPLOY_CHECKLIST.md documenting these prerequisites.

---

## BLOCKER File

See: `docs/research/BLOCKER_BUILD_AUTHKEY.md`

---

## What Is Correct

The overall structure (sign → connect → install → verify) mirrors official Tizen Studio deployment workflow. The config.xml is well-formed and follows all Samsung Tizen policy requirements per docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md.

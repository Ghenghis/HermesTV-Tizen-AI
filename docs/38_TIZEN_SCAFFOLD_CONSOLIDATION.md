# 38 — Tizen Scaffold Consolidation (2026-05-18)

## Why this doc exists

PR #10 introduced `apps/hermes-tv-tizen/` (4 files, ~3 KB) as a build wrapper
that re-packages the React web app as a Tizen `.wgt`. This sat beside the
pre-existing `apps/tizen-hermes-tv/` (29 files, ~168 KB) — a native Tizen
scaffold from B1 with its own webpack pipeline, AVPlay engine, focus engine,
EPG grid, and theme manager.

Two directories whose names differ only by token order is exactly the kind
of trap that bites a future reader. This consolidation removes the
ambiguity without losing the AVPlay reference code.

## What changed

| Before (B1 / PR #10) | After (this PR) | Role |
|---|---|---|
| `apps/tizen-hermes-tv/` | `apps/hermes-tv-tizen-native/` | Legacy native scaffold. Kept as reference for the AVPlay engine + focus engine — Phase 3 integration target. **Not built by any current tooling.** |
| `apps/hermes-tv-tizen/` | `apps/hermes-tv-tizen/` *(unchanged)* | Canonical Tizen build target. Re-packages `apps/hermes-web-tv/dist/` as a `.wgt` via `tools/tizen-prep.js` + `tools/tizen-package.js`. **This is what ships to Mom's QN85.** |

The rename was a `git mv` so the 29 files' history is preserved.

## Why this is the right shape

- **Mirror architecture** (per [`docs/27_WEB_AND_TIZEN_MIRROR.md`](27_WEB_AND_TIZEN_MIRROR.md)
  and the user's memory): "web + Tizen mirror over one Hostinger VPS API."
  One source-of-truth UI (the React app), two distribution channels (browser
  + Tizen `.wgt`). The web-mirror wrapper at `apps/hermes-tv-tizen/` is what
  enables that.

- **AVPlay still matters for Phase 3.** When real IPTV streams ship (Apollo,
  XtremeHD), the Tizen `<video>` element won't handle every codec/container
  Mom's TV throws at it. Samsung's native AVPlay does. The legacy scaffold's
  `apps/hermes-tv-tizen-native/src/ui/player/avplayEngine.js` is the
  reference implementation we'll port into the web app's Tizen-aware player
  component at that point. Deleting it now would force re-derivation.

- **Naming hygiene.** Both directories now share the canonical `hermes-tv-tizen`
  prefix. `-native` suffix on the legacy one signals "not the current build."

## What references were updated

Five docs that mentioned the old path:

- [`docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`](00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md)
- [`docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`](09_TIZEN_BUILD_SIDELOAD_CONTRACT.md)
- [`docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md`](18_REAL_TV_DEPLOYMENT_CHECKLIST.md)
- [`docs/proof/NO_SECRET_AUDIT.md`](proof/NO_SECRET_AUDIT.md)
- [`apps/hermes-tv-tizen-native/README.md`](../apps/hermes-tv-tizen-native/README.md)
  — got a "LEGACY / REFERENCE" header explaining current status

Each was edited in-place to point at the new path while preserving the
historical context.

## What does NOT change

- `apps/hermes-tv-tizen/` build pipeline (`tools/tizen-prep.js`,
  `tools/tizen-package.js`, `docs/34_TIZEN_BUILD_AND_SIDELOAD.md`,
  `docs/35_TIZEN_DEVELOPER_MODE_SHERRI.md`)
- Web app source (`apps/hermes-web-tv/`)
- API service (`services/hermes-tv-api/`)
- Any deployed VPS state
- Any `.env`, provider credential, or secret

The renamed directory has no inbound code references; only docs pointed at
it (verified via `grep -rln "tizen-hermes-tv"` before the rename), so the
update was purely documentary.

## Verification

| Check | Result |
|---|---|
| `git mv apps/tizen-hermes-tv apps/hermes-tv-tizen-native` | git tracks the rename (preserves blame/history) |
| `find apps/hermes-tv-tizen-native -type f \| wc -l` | 29 (unchanged) |
| `grep -rln "apps/tizen-hermes-tv/"` (post-rename) | 0 references |
| `node tools/schema-validate.js` | 61 PASS, 0 FAIL |
| `npm run build:web` | green |
| `node tools/test-chatbot-commands.js` (API up) | 40 PASS, 0 FAIL |

## Phase 3 follow-up note

When Phase 3 ships real IPTV streams, the team will:

1. Read `apps/hermes-tv-tizen-native/src/ui/player/avplayEngine.js` as the
   AVPlay integration reference.
2. Port the AVPlay calls into a new Tizen-aware player component inside
   `apps/hermes-web-tv/src/components/` (or a dedicated `tizen-player/`
   subdirectory).
3. Conditionally use AVPlay when `window.tizen?.tvinputdevice` is detectable,
   fall back to `<video>` otherwise.
4. At that point, the legacy native scaffold becomes deletable. **Not before.**

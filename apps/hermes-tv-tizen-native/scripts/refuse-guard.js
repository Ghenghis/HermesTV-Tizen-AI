#!/usr/bin/env node
'use strict';

/**
 * refuse-guard.js — HANDOFF blocker #5 (Two competing Tizen scaffolds).
 *
 * apps/hermes-tv-tizen-native/ is the legacy native-Tizen scaffold (B1 era).
 * It is intentionally KEPT in the repo as a reference implementation for
 * the AVPlay engine, focus engine, and EPG grid — see this folder's README
 * for the operator-mandated "do not delete without sign-off" note.
 *
 * However, the canonical build target for DaveTV's Tizen .wgt is
 *   apps/hermes-tv-tizen/  (web-app wrapper, the mirror architecture
 *   documented in docs/27_WEB_AND_TIZEN_MIRROR.md).
 *
 * If both scaffolds can produce a .wgt, operators can ship the wrong one
 * (B1 native scaffold instead of the current web-wrapped build). This
 * guard refuses the legacy build path unless the operator explicitly
 * sets ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1.
 *
 * The README documents the override; CI should never set it.
 */

if (process.env.ALLOW_LEGACY_TIZEN_NATIVE_BUILD === '1') {
  console.log('[refuse-guard] ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1 — proceeding with legacy native-Tizen build (reference path).');
  process.exit(0);
}

console.error('');
console.error('=================================================================');
console.error(' apps/hermes-tv-tizen-native/  — LEGACY NATIVE-TIZEN SCAFFOLD');
console.error('=================================================================');
console.error('');
console.error(' This scaffold is NOT the canonical Tizen .wgt build target.');
console.error('');
console.error(' Canonical path:');
console.error('   cd apps/hermes-tv-tizen && npm run build');
console.error('');
console.error(' That produces dist-tizen/HermesTV-0.1.0.wgt by re-packaging');
console.error(' the apps/hermes-web-tv/ React build — the mirror architecture');
console.error(' documented in docs/27_WEB_AND_TIZEN_MIRROR.md.');
console.error('');
console.error(' If you genuinely need the legacy native scaffold (reference');
console.error(' build for the AVPlay engine, focus engine, or EPG grid in');
console.error(' src/ui/), re-run with the explicit override:');
console.error('');
console.error('   ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1 npm run build');
console.error('   ALLOW_LEGACY_TIZEN_NATIVE_BUILD=1 npm run package');
console.error('');
console.error(' CI must NEVER set that env. Per HANDOFF_FOR_CODEX §2 blocker');
console.error(' #5: "only canonical path can produce .wgt".');
console.error('');
console.error('=================================================================');
process.exit(1);

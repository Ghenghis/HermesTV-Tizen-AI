// ─────────────────────────────────────────────────────────────────────────────
// releaseFlags — gates UI surfaces whose backend byte pipelines have not
// shipped yet (HANDOFF_FOR_CODEX §2 blocker #2). The route layer already
// behaves honestly:
//
//   POST /api/dvr/schedule    → 200 {status:'scheduled', _note:'Phase 4...'}
//   GET  /api/download/:id/file → 503 download_pipeline_not_implemented
//   POST /api/catchup/play    → 501 not_implemented
//
// …but the UI affordance still LIES — the user sees a "queued" envelope
// or a "View all recordings" button or a "What you missed" rail and
// believes the feature works. This module exposes three small predicates
// so each component can render an honest empty-state until the operator
// flips the flag.
//
// Three flags, three independent surfaces. Each one is OFF by default
// (no env var = pipeline not shipped). Operators turn them on per surface
// when the byte pipeline lands:
//
//   VITE_DAVETV_DVR_PIPELINE=1        (build-time, baked into bundle)
//   VITE_DAVETV_DOWNLOADS_PIPELINE=1
//   VITE_DAVETV_CATCHUP_PIPELINE=1
//
// Runtime overrides (for QA without a rebuild) — set on the global before
// the React app mounts:
//
//   window.__DAVETV_DVR_PIPELINE__ = true;
//   window.__DAVETV_DOWNLOADS_PIPELINE__ = true;
//   window.__DAVETV_CATCHUP_PIPELINE__ = true;
//
// Tizen 6.5 / Chrome 76 safe — ES5 idioms only.
// ─────────────────────────────────────────────────────────────────────────────

function _isTruthyString(raw) {
  if (raw === undefined || raw === null) { return false; }
  var v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') { return true; }
  return false;
}

function _envFlag(key) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return _isTruthyString(import.meta.env[key]);
    }
  } catch (_) {}
  return false;
}

function _windowFlag(key) {
  try {
    if (typeof window !== 'undefined' && window[key] === true) { return true; }
  } catch (_) {}
  return false;
}

function isDvrEnabled() {
  return _envFlag('VITE_DAVETV_DVR_PIPELINE') || _windowFlag('__DAVETV_DVR_PIPELINE__');
}

function isDownloadsEnabled() {
  return _envFlag('VITE_DAVETV_DOWNLOADS_PIPELINE') || _windowFlag('__DAVETV_DOWNLOADS_PIPELINE__');
}

function isCatchupEnabled() {
  return _envFlag('VITE_DAVETV_CATCHUP_PIPELINE') || _windowFlag('__DAVETV_CATCHUP_PIPELINE__');
}

export { isDvrEnabled, isDownloadsEnabled, isCatchupEnabled };

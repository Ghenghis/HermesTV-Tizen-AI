import React from 'react';
import { getSettings, patchSettings } from '../../api/dvrClient.js';
import RecordingsListModal from '../RecordingsListModal.jsx';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  LABEL_STYLE, INPUT_STYLE, BUTTON_STYLE,
  SUCCESS_BOX, WARNING_BOX,
  focusHandler, blurHandler,
} from './settingsStyles.js';

// ─────────────────────────────────────────────────────────────────────────────
// RecordingsSection — embedded inside SettingsPanelTabbed's Playback tab.
//
// Two halves:
//   1. "View all recordings" button → opens <RecordingsListModal/>.
//   2. Global DVR settings (auto-delete after N days, max storage GB,
//      pre/post-roll, format). Reads /api/dvr/settings on mount and
//      writes through PATCH on save.
//
// The route file (services/hermes-tv-api/src/routes/dvr.js) exposes:
//   retention_days     1–365
//   pre_roll_sec       0–600
//   post_roll_sec      0–1800
//   max_concurrent     1–8
//   format             mp4 | mkv | ts
//   default_quality    480p|720p|1080p|4K|2160p
//
// The form surface here exposes the four operator-facing knobs and
// leaves the rest at their server defaults.
//
// Tizen 6.5 / Chrome 76 safe — no async/await, no spread in JSX.
// ─────────────────────────────────────────────────────────────────────────────

function RecordingsSection(props) {
  var profileId = (props.profile && (props.profile.profile_id || props.profile.id)) || 'dave_tv';

  var settingsResult = React.useState(null);
  var settings = settingsResult[0];
  var setSettings = settingsResult[1];

  var loadingResult = React.useState(true);
  var loading = loadingResult[0];
  var setLoading = loadingResult[1];

  var savingResult = React.useState(false);
  var saving = savingResult[0];
  var setSaving = savingResult[1];

  var statusResult = React.useState({ kind: 'idle', msg: '' });
  var status = statusResult[0];
  var setStatus = statusResult[1];

  var modalOpenResult = React.useState(false);
  var modalOpen = modalOpenResult[0];
  var setModalOpen = modalOpenResult[1];

  // Local form state. Initialised from `settings` once it lands.
  var formResult = React.useState({
    retention_days: 30,
    max_concurrent: 2,
    pre_roll_sec: 30,
    post_roll_sec: 120,
  });
  var form = formResult[0];
  var setForm = formResult[1];

  React.useEffect(function() {
    setLoading(true);
    getSettings().then(function(body) {
      setSettings(body || {});
      setForm({
        retention_days: typeof body.retention_days === 'number' ? body.retention_days : 30,
        max_concurrent: typeof body.max_concurrent === 'number' ? body.max_concurrent : 2,
        pre_roll_sec: typeof body.pre_roll_sec === 'number' ? body.pre_roll_sec : 30,
        post_roll_sec: typeof body.post_roll_sec === 'number' ? body.post_roll_sec : 120,
      });
      setLoading(false);
    }).catch(function(err) {
      setLoading(false);
      var msg = (err && err.message) ? err.message : 'Could not load DVR settings.';
      setStatus({ kind: 'error', msg: msg });
    });
  }, []);

  function update(patch) {
    setForm(Object.assign({}, form, patch));
  }

  function handleSave() {
    if (saving) { return; }
    setSaving(true);
    setStatus({ kind: 'idle', msg: '' });
    patchSettings({
      profile_id: profileId,
      retention_days: form.retention_days,
      max_concurrent: form.max_concurrent,
      pre_roll_sec: form.pre_roll_sec,
      post_roll_sec: form.post_roll_sec,
    }).then(function(body) {
      setSaving(false);
      setSettings(body || settings);
      setStatus({ kind: 'success', msg: 'DVR settings saved.' });
      setTimeout(function() { setStatus({ kind: 'idle', msg: '' }); }, 1800);
    }).catch(function(err) {
      setSaving(false);
      var msg = (err && err.message) ? err.message : 'Could not save DVR settings.';
      setStatus({ kind: 'error', msg: msg });
    });
  }

  // Cap input numbers to the server's accepted ranges so the user can't
  // hit the 400 from typing 9999.
  function _intInRange(raw, min, max, fallback) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) { return fallback; }
    return Math.max(min, Math.min(max, n));
  }

  return (
    <div style={CARD_STYLE}>
      <div style={CARD_HEADER_STYLE}>Recordings (DVR)</div>
      <div style={CARD_TAGLINE_STYLE}>
        Schedule, list, and tune recordings. Backed by the <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>/api/dvr/*</code> endpoints. The on-disk muxer lands in Phase 4 — until then, recordings stay at "scheduled" status.
      </div>

      <button
        tabIndex={0}
        onClick={function() { setModalOpen(true); }}
        onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalOpen(true); } }}
        onFocus={focusHandler}
        onBlur={blurHandler}
        style={Object.assign({}, BUTTON_STYLE('filled'), { marginBottom: '0.85rem' })}
      >
        View all recordings
      </button>

      <div style={{ borderTop: '1px solid var(--border, #30363d)', paddingTop: '0.85rem' }}>
        <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))', marginBottom: '0.5rem' }}>
          Global DVR settings
        </div>

        {loading && (
          <div style={{ color: 'var(--muted)', fontSize: 'calc(0.82rem * var(--font-scale, 1))' }}>
            Loading…
          </div>
        )}

        {!loading && (
          <div>
            <label htmlFor="dvr-retention" style={LABEL_STYLE}>
              Auto-delete after (days): <strong style={{ color: 'var(--accent, #00d4ff)' }}>{form.retention_days}</strong>
            </label>
            <input
              id="dvr-retention"
              type="number"
              min="1"
              max="365"
              step="1"
              value={form.retention_days}
              onChange={function(e) { update({ retention_days: _intInRange(e.target.value, 1, 365, 30) }); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />

            <label htmlFor="dvr-concurrent" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>
              Max concurrent recordings (1–8)
            </label>
            <input
              id="dvr-concurrent"
              type="number"
              min="1"
              max="8"
              step="1"
              value={form.max_concurrent}
              onChange={function(e) { update({ max_concurrent: _intInRange(e.target.value, 1, 8, 2) }); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />

            <label htmlFor="dvr-preroll" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>
              Default pre-roll (seconds, 0–600)
            </label>
            <input
              id="dvr-preroll"
              type="number"
              min="0"
              max="600"
              step="5"
              value={form.pre_roll_sec}
              onChange={function(e) { update({ pre_roll_sec: _intInRange(e.target.value, 0, 600, 30) }); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />

            <label htmlFor="dvr-postroll" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>
              Default post-roll (seconds, 0–1800)
            </label>
            <input
              id="dvr-postroll"
              type="number"
              min="0"
              max="1800"
              step="5"
              value={form.post_roll_sec}
              onChange={function(e) { update({ post_roll_sec: _intInRange(e.target.value, 0, 1800, 120) }); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.85rem' }}>
              <button
                tabIndex={0}
                onClick={handleSave}
                disabled={saving}
                onFocus={focusHandler}
                onBlur={blurHandler}
                style={Object.assign({}, BUTTON_STYLE('filled'), { opacity: saving ? 0.6 : 1 })}
              >
                {saving ? 'Saving…' : 'Save DVR settings'}
              </button>
            </div>

            {settings && settings.output_directory && (
              <div style={{ marginTop: '0.6rem', fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                Output directory (server-side): <code style={{ color: 'var(--text, #e6edf3)' }}>{settings.output_directory}</code> · format {settings.format || 'mp4'}
              </div>
            )}
          </div>
        )}

        {status.kind === 'success' && <div style={SUCCESS_BOX}>{status.msg}</div>}
        {status.kind === 'error' && <div style={WARNING_BOX}>{status.msg}</div>}
      </div>

      <RecordingsListModal
        isOpen={modalOpen}
        onClose={function() { setModalOpen(false); }}
        profileId={profileId}
      />
    </div>
  );
}

export default RecordingsSection;

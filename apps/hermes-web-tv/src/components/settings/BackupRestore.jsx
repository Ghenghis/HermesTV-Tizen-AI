import React from 'react';
import * as settingsStore from '../../store/settingsStore.js';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  BUTTON_STYLE,
  WARNING_BOX, SUCCESS_BOX,
  focusHandler, blurHandler,
} from './settingsStyles.js';

// BackupRestore — export every settingsStore namespace to a JSON file
// the user can stash on a USB drive / cloud drive, and re-import it
// later (e.g. after a factory reset of the TV).
//
// Server-side backup hook:
//   - Parallel agent is exposing `POST /api/backup/import` on the API.
//   - When the user picks a file, we POST the JSON to that endpoint and
//     ALSO restore the local-only portion (settingsStore) immediately
//     so the modal feels instant. The server merges its own slice
//     (playlist providers, watch history) into the per-profile store.
//   - When the endpoint is unreachable, we still apply the local part
//     and surface a warning so the user knows server-side restore
//     didn't happen.
//
// File name: hermestv-backup-<profileId>-<YYYY-MM-DDTHH-mm>.json
//
// Tizen 6.5 / Chrome 76 safe — Blob, URL.createObjectURL, FileReader
// all ship. We download by clicking a synthesized <a> with `download`
// attribute. On Tizen this triggers the platform's file-save dialog.

function _filenameFor(profileId) {
  var pid = profileId || 'hermestv';
  var now = new Date();
  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  var stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
            + 'T' + pad(now.getHours()) + '-' + pad(now.getMinutes());
  return 'hermestv-backup-' + pid + '-' + stamp + '.json';
}

function _apiBase() {
  // Mirrors hermesApi.js's host detection so the import POST hits the
  // same backend the rest of the app uses.
  if (typeof window === 'undefined') { return ''; }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') { return 'http://localhost:3001'; }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { return 'http://' + h + ':3001'; }
  if (h === 'hermestv.local') { return 'http://hermestv.local'; }
  return '';
}

function BackupRestore(props) {
  var profileId = (props.profile && (props.profile.profile_id || props.profile.id)) || 'hermestv';

  var statusResult = React.useState({ kind: 'idle', msg: '' });
  var status = statusResult[0];
  var setStatus = statusResult[1];

  var fileInputRef = React.useRef(null);

  function handleExport() {
    try {
      var snapshot = settingsStore.exportAll();
      snapshot.__profileId = profileId;
      var json = JSON.stringify(snapshot, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = _filenameFor(profileId);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Slight delay before revoke so Tizen's save dialog has the URL.
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      setStatus({ kind: 'success', msg: 'Backup downloaded.' });
    } catch (e) {
      setStatus({ kind: 'error', msg: 'Export failed: ' + ((e && e.message) || 'unknown') });
    }
  }

  function handlePickFile() {
    if (fileInputRef.current) { fileInputRef.current.click(); }
  }

  function handleFileChange(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function() {
      var text = reader.result;
      try {
        var snapshot = JSON.parse(text);
        // Local apply first — instant feedback.
        var result = settingsStore.importAll(snapshot);
        if (!result.ok) {
          setStatus({ kind: 'error', msg: 'Import failed: ' + result.error });
          return;
        }
        // Server-side hand-off. Best-effort; never blocks the local
        // restore and we don't surface 4xx beyond a soft warning.
        var apiUrl = _apiBase() + '/api/backup/import';
        fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profileId, snapshot: snapshot }),
        }).then(function(res) {
          if (res.ok) {
            setStatus({ kind: 'success', msg: 'Restore complete (local + server).' });
          } else {
            setStatus({ kind: 'warn', msg: 'Local restored. Server returned HTTP ' + res.status + ' — server-side merge skipped.' });
          }
        }).catch(function() {
          setStatus({ kind: 'warn', msg: 'Local restored. Could not reach API for server-side merge.' });
        });
        if (typeof props.onRestored === 'function') { props.onRestored(snapshot); }
      } catch (parseErr) {
        setStatus({ kind: 'error', msg: 'Invalid JSON: ' + ((parseErr && parseErr.message) || 'unknown') });
      } finally {
        // Allow re-selecting the same file (otherwise the change event
        // won't fire a second time).
        if (fileInputRef.current) { fileInputRef.current.value = ''; }
      }
    };
    reader.onerror = function() {
      setStatus({ kind: 'error', msg: 'Could not read file.' });
    };
    reader.readAsText(file);
  }

  function handleResetAll() {
    var ok = (typeof window !== 'undefined' && window.confirm)
      ? window.confirm('Reset every Network, Playback, Parental, and Diagnostics setting to defaults? This does not log you out or clear your playlists.')
      : true;
    if (!ok) { return; }
    settingsStore.resetAll();
    setStatus({ kind: 'success', msg: 'All deep settings reset to defaults.' });
    if (typeof props.onReset === 'function') { props.onReset(); }
  }

  return (
    <div>
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Export backup</div>
        <div style={CARD_TAGLINE_STYLE}>
          Downloads a JSON file with every Network / Playback / Parental / Diagnostics setting (including the parental PIN hash, not the plaintext PIN). Per-profile playlists and watch history live server-side and are not in this file.
        </div>
        <button
          tabIndex={0}
          onClick={handleExport}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={BUTTON_STYLE('filled')}
        >Download backup JSON</button>
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Restore from backup</div>
        <div style={CARD_TAGLINE_STYLE}>
          Pick a backup JSON. We apply your local settings immediately, then push the file to the API so the server can merge its slice (playlist providers, watch history).
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          aria-label="Backup JSON file"
        />
        <button
          tabIndex={0}
          onClick={handlePickFile}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={BUTTON_STYLE('outline')}
        >Choose backup file&hellip;</button>
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Reset deep settings</div>
        <div style={CARD_TAGLINE_STYLE}>
          Restores Network, Playback, Parental, and Diagnostics to factory defaults. Profile, theme, layout, voice, and feature flags are untouched.
        </div>
        <button
          tabIndex={0}
          onClick={handleResetAll}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={BUTTON_STYLE('danger')}
        >Reset to defaults</button>
      </div>

      {status.kind === 'success' && <div style={SUCCESS_BOX}>{status.msg}</div>}
      {status.kind === 'warn' && (
        <div style={Object.assign({}, WARNING_BOX, { color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)' })}>{status.msg}</div>
      )}
      {status.kind === 'error' && <div style={WARNING_BOX}>{status.msg}</div>}
    </div>
  );
}

export default BackupRestore;

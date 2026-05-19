import React from 'react';
import * as settingsStore from '../../store/settingsStore.js';
import * as consoleBuffer from '../../utils/consoleBuffer.js';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  BUTTON_STYLE,
  WARNING_BOX, SUCCESS_BOX, ROW_STYLE,
  focusHandler, blurHandler,
} from './settingsStyles.js';
import Toggle from './Toggle.jsx';

// Diagnostics — build version, API health probe, and a "Send debug
// logs" action that downloads a JSON of the last 500 console entries
// captured by utils/consoleBuffer.js.
//
// The build version is read from import.meta.env.VITE_BUILD_VERSION
// when available (set by the build pipeline); otherwise falls back to
// a literal "dev" tag so local builds still show something useful.
//
// Tizen 6.5 / Chrome 76 safe.

function _apiBase() {
  if (typeof window === 'undefined') { return ''; }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') { return 'http://localhost:3001'; }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { return 'http://' + h + ':3001'; }
  if (h === 'hermestv.local') { return 'http://hermestv.local'; }
  return '';
}

function _readBuildVersion() {
  // Vite exposes env vars on `import.meta.env`. We avoid optional
  // chaining for Chrome 76 safety. `typeof` guards the meta access in
  // case this module is imported from a non-Vite consumer (tests).
  try {
    /* eslint-disable no-undef */
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      var env = import.meta.env;
      if (env.VITE_BUILD_VERSION) { return String(env.VITE_BUILD_VERSION); }
      if (env.MODE) { return env.MODE + '-build'; }
    }
    /* eslint-enable no-undef */
  } catch (_) { /* ignore */ }
  return 'dev';
}

var BUILD_VERSION = _readBuildVersion();

function Diagnostics(props) {
  var diagResult = React.useState(function() { return settingsStore.getDiagnostics(); });
  var diag = diagResult[0];
  var setDiag = diagResult[1];

  var probeResult = React.useState({ state: 'idle', latencyMs: null, status: null, error: '' });
  var probe = probeResult[0];
  var setProbe = probeResult[1];

  var entriesResult = React.useState(consoleBuffer.getEntries().length);
  var entriesCount = entriesResult[0];
  var setEntriesCount = entriesResult[1];

  var savedFlashResult = React.useState('');
  var savedFlash = savedFlashResult[0];
  var setSavedFlash = savedFlashResult[1];

  // Refresh entry count every 2s while the tab is open. Cheap — just
  // a `.length` read on a bounded ring buffer.
  React.useEffect(function() {
    var id = setInterval(function() { setEntriesCount(consoleBuffer.getEntries().length); }, 2000);
    return function() { clearInterval(id); };
  }, []);

  function runHealthProbe() {
    setProbe({ state: 'running', latencyMs: null, status: null, error: '' });
    var url = _apiBase() + '/health';
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var timeoutId = setTimeout(function() {
      setProbe({ state: 'error', latencyMs: null, status: null, error: 'Timed out after 5000 ms' });
    }, 5000);
    fetch(url, { method: 'GET' }).then(function(res) {
      clearTimeout(timeoutId);
      var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      setProbe({
        state: res.ok ? 'ok' : 'fail',
        latencyMs: Math.round(t1 - t0),
        status: res.status,
        error: res.ok ? '' : 'API returned HTTP ' + res.status,
      });
    }).catch(function(err) {
      clearTimeout(timeoutId);
      setProbe({ state: 'error', latencyMs: null, status: null, error: (err && err.message) || 'Network error' });
    });
  }

  function handleSendLogs() {
    try {
      var payload = {
        exportedAt: new Date().toISOString(),
        buildVersion: BUILD_VERSION,
        userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || 'unknown',
        href: (typeof window !== 'undefined' && window.location && window.location.href) || '',
        viewport: (typeof window !== 'undefined') ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 } : null,
        profile: (props.profile && (props.profile.profile_id || props.profile.id)) || null,
        tvModel: props.tvModel || null,
        tier: props.tier || null,
        entries: consoleBuffer.getEntries(),
      };
      var json = JSON.stringify(payload, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'hermestv-debug-' + Date.now() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
      setSavedFlash('Downloaded ' + payload.entries.length + ' entries.');
      setTimeout(function() { setSavedFlash(''); }, 2500);
    } catch (e) {
      setSavedFlash('Export failed: ' + ((e && e.message) || 'unknown'));
      setTimeout(function() { setSavedFlash(''); }, 4000);
    }
  }

  function handleClearLogs() {
    consoleBuffer.clearEntries();
    setEntriesCount(0);
    setSavedFlash('Log buffer cleared.');
    setTimeout(function() { setSavedFlash(''); }, 1500);
  }

  function update(patch) {
    var next = settingsStore.setDiagnostics(patch);
    setDiag(next);
  }

  // Probe colour cue
  var probeColor = '#8b949e';
  var probeLabel = 'Not run yet';
  if (probe.state === 'running') { probeColor = '#e3b341'; probeLabel = 'Running…'; }
  else if (probe.state === 'ok') { probeColor = '#22c55e'; probeLabel = 'OK · ' + probe.latencyMs + ' ms'; }
  else if (probe.state === 'fail') { probeColor = '#ef4444'; probeLabel = 'HTTP ' + probe.status; }
  else if (probe.state === 'error') { probeColor = '#ef4444'; probeLabel = 'Error'; }

  return (
    <div>
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Build info</div>
        <div style={Object.assign({}, ROW_STYLE, { borderTop: 'none', paddingTop: 0 })}>
          <span style={{ color: 'var(--muted)' }}>Web build version</span>
          <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--accent, #00d4ff)' }}>{BUILD_VERSION}</code>
        </div>
        <div style={ROW_STYLE}>
          <span style={{ color: 'var(--muted)' }}>Settings schema</span>
          <span style={{ fontWeight: 700 }}>v{settingsStore.SCHEMA_VERSION}</span>
        </div>
        <div style={ROW_STYLE}>
          <span style={{ color: 'var(--muted)' }}>User agent</span>
          <span style={{ fontWeight: 600, fontSize: 'calc(0.7rem * var(--font-scale, 1))', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>
            {typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : 'unknown'}
          </span>
        </div>
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>API health</div>
        <div style={CARD_TAGLINE_STYLE}>
          Pings <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>{_apiBase() || '(same origin)'}/health</code> and reports round-trip latency.
        </div>
        <div style={Object.assign({}, ROW_STYLE, { borderTop: 'none', paddingTop: 0 })}>
          <span style={{ color: 'var(--muted)' }}>Last probe</span>
          <span style={{ fontWeight: 700, color: probeColor }}>{probeLabel}</span>
        </div>
        {probe.error && <div style={WARNING_BOX}>{probe.error}</div>}
        <div style={{ marginTop: '0.6rem' }}>
          <button
            tabIndex={0}
            onClick={runHealthProbe}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={BUTTON_STYLE('filled')}
          >Run health probe</button>
        </div>
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Debug logs</div>
        <div style={CARD_TAGLINE_STYLE}>
          The web shell captures the last {consoleBuffer.MAX_ENTRIES} console entries (and uncaught errors). Download a JSON file when reporting issues so we can see exactly what the TV saw.
        </div>
        <div style={Object.assign({}, ROW_STYLE, { borderTop: 'none', paddingTop: 0 })}>
          <span style={{ color: 'var(--muted)' }}>Captured entries</span>
          <span style={{ fontWeight: 700 }}>{entriesCount}</span>
        </div>
        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            tabIndex={0}
            onClick={handleSendLogs}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={BUTTON_STYLE('filled')}
          >Download debug logs</button>
          <button
            tabIndex={0}
            onClick={handleClearLogs}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={BUTTON_STYLE('outline')}
          >Clear buffer</button>
        </div>
        {savedFlash && <div style={SUCCESS_BOX}>{savedFlash}</div>}
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Telemetry preferences</div>
        <div style={Object.assign({}, ROW_STYLE, { borderTop: 'none', paddingTop: 0 })}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>Auto-send on error</div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Future hook — when on, an unhandled error queues the debug log for the next sync window.
            </div>
          </div>
          <Toggle
            checked={diag.autoSendOnError}
            ariaLabel="Auto-send debug logs on error"
            onChange={function(v) { update({ autoSendOnError: v }); }}
          />
        </div>
        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>Show API latency in player chrome</div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Overlays the last EPG / catalog response time in the corner of the player.
            </div>
          </div>
          <Toggle
            checked={diag.showApiLatency}
            ariaLabel="Show API latency"
            onChange={function(v) { update({ showApiLatency: v }); }}
          />
        </div>
      </div>
    </div>
  );
}

export default Diagnostics;

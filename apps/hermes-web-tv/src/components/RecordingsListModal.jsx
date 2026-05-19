import React from 'react';
import { listRecordings, cancelRecording } from '../api/dvrClient.js';

// ─────────────────────────────────────────────────────────────────────────────
// RecordingsListModal — IPTV-Player-Zero-style "My Recordings" panel.
//
// Pulls /api/dvr/recordings (optionally scoped to a profile) and renders
// a table with: title | channel | start | duration | status badge.
//
// Sort tabs: Scheduled / Recording / Completed / All.
// Per-row actions:
//   - status === 'scheduled' or 'recording'  → "Cancel" (DELETE)
//   - status === 'complete' or 'failed'      → "Delete" (DELETE; backend
//     removes the envelope either way)
//
// Empty state: friendly "No recordings yet" with a record icon and a hint.
//
// Props:
//   isOpen      boolean
//   onClose     function()
//   profileId   'dave_tv' | 'mom_tv' — used as filter + as the required
//               body field on cancel/delete.
//
// Tizen 6.5 / Chrome 76 safe — no spread in JSX, no optional chaining,
// no async/await. The status badge palette mirrors the rest of the
// shell's accent system so it works under every theme.
// ─────────────────────────────────────────────────────────────────────────────

var SORT_TABS = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'recording', label: 'Recording' },
  { id: 'completed', label: 'Completed' },
  { id: 'all',       label: 'All' },
];

// Map status → tab bucket. The backend uses `complete` (no -d); the UI
// surfaces "Completed" for the tab. We also pull `failed` and
// `cancelled` into the Completed bucket so they're not orphaned.
function _bucketOf(status) {
  if (status === 'scheduled') { return 'scheduled'; }
  if (status === 'recording') { return 'recording'; }
  if (status === 'complete' || status === 'failed' || status === 'cancelled') { return 'completed'; }
  return 'completed';
}

function _statusBadge(status) {
  var palette = {
    scheduled: { bg: 'rgba(99,102,241,0.16)', border: 'rgba(99,102,241,0.4)', color: '#a5b4fc', label: 'Scheduled' },
    recording: { bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.45)', color: '#fca5a5', label: 'Recording' },
    complete:  { bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.4)',  color: '#86efac', label: 'Completed' },
    failed:    { bg: 'rgba(239,68,68,0.14)',  border: 'rgba(239,68,68,0.45)', color: '#fca5a5', label: 'Failed'    },
    cancelled: { bg: 'rgba(148,163,184,0.14)',border: 'rgba(148,163,184,0.4)',color: '#cbd5e1', label: 'Cancelled' },
  };
  var p = palette[status] || palette.scheduled;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        background: p.bg,
        border: '1px solid ' + p.border,
        borderRadius: '999px',
        color: p.color,
        fontSize: 'calc(0.7rem * var(--font-scale, 1))',
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      {p.label}
    </span>
  );
}

// Format ISO → "Thu 8:30 PM" in the user's locale.
function _formatStart(iso) {
  if (!iso) { return '—'; }
  var ms = Date.parse(iso);
  if (isNaN(ms)) { return iso; }
  var d = new Date(ms);
  // toLocaleString with the same options on every browser the project
  // targets (Chrome 76 supports the Intl options used here).
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function _formatDuration(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) { return '—'; }
  var totalMin = Math.round(seconds / 60);
  if (totalMin < 60) { return totalMin + 'm'; }
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  return m === 0 ? h + 'h' : h + 'h ' + m + 'm';
}

function _Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        border: '2px solid rgba(255,255,255,0.16)',
        borderTopColor: 'var(--accent, #00d4ff)',
        borderRadius: '50%',
        animation: 'hermes-spin 0.7s linear infinite',
      }}
    />
  );
}

function _EmptyState() {
  return (
    <div
      style={{
        padding: '2.5rem 1.25rem',
        textAlign: 'center',
        color: 'var(--muted)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '64px', height: '64px',
          borderRadius: '50%',
          margin: '0 auto 1rem',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fca5a5',
          fontSize: '28px',
        }}
      >●</div>
      <div style={{ fontWeight: 700, fontSize: 'calc(0.95rem * var(--font-scale, 1))', color: 'var(--text, #e6edf3)', marginBottom: '0.4rem' }}>
        No recordings yet
      </div>
      <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))' }}>
        Find a program and click <strong style={{ color: 'var(--accent, #00d4ff)' }}>Record</strong> to schedule one.
      </div>
    </div>
  );
}

function _Row(props) {
  var r = props.recording;
  var status = r.status || 'scheduled';
  var isWorking = !!props.busy;
  var canCancel = status === 'scheduled' || status === 'recording';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr 1.2fr 0.7fr 1fr auto',
        gap: '0.75rem',
        alignItems: 'center',
        padding: '0.6rem 0.85rem',
        borderTop: '1px solid var(--border, #30363d)',
        fontSize: 'calc(0.85rem * var(--font-scale, 1))',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.title || 'Untitled'}
        </div>
        <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.recording_id}
        </div>
      </div>
      <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {r.channel_display_name || r.channel_id || '—'}
      </div>
      <div style={{ color: 'var(--text, #e6edf3)', whiteSpace: 'nowrap' }}>
        {_formatStart(r.start_utc)}
      </div>
      <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        {_formatDuration(r.duration_sec)}
      </div>
      <div>{_statusBadge(status)}</div>
      <div>
        <button
          tabIndex={0}
          onClick={function() { if (typeof props.onAction === 'function') { props.onAction(r); } }}
          onKeyDown={function(e) { if ((e.key === 'Enter' || e.key === ' ') && typeof props.onAction === 'function') { e.preventDefault(); props.onAction(r); } }}
          disabled={isWorking}
          aria-label={(canCancel ? 'Cancel' : 'Delete') + ' recording ' + (r.title || r.recording_id)}
          style={{
            padding: '0.35rem 0.8rem',
            background: canCancel ? 'transparent' : 'rgba(239,68,68,0.08)',
            border: '1px solid ' + (canCancel ? 'var(--border, #30363d)' : 'rgba(239,68,68,0.4)'),
            borderRadius: '999px',
            color: canCancel ? 'var(--text, #e6edf3)' : '#fca5a5',
            fontSize: 'calc(0.75rem * var(--font-scale, 1))',
            fontWeight: 700,
            cursor: isWorking ? 'not-allowed' : 'pointer',
            opacity: isWorking ? 0.6 : 1,
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
          onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
        >
          {isWorking ? <_Spinner /> : (canCancel ? 'Cancel' : 'Delete')}
        </button>
      </div>
    </div>
  );
}

function RecordingsListModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var profileId = props.profileId || 'dave_tv';

  var tabResult = React.useState('scheduled');
  var activeTab = tabResult[0];
  var setActiveTab = tabResult[1];

  var recordingsResult = React.useState([]);
  var recordings = recordingsResult[0];
  var setRecordings = recordingsResult[1];

  var loadingResult = React.useState(false);
  var loading = loadingResult[0];
  var setLoading = loadingResult[1];

  var errorResult = React.useState('');
  var error = errorResult[0];
  var setError = errorResult[1];

  // Per-row "working" state so the cancel/delete button can spin
  // without blocking the whole list.
  var busyResult = React.useState({});
  var busy = busyResult[0];
  var setBusy = busyResult[1];

  function refresh() {
    setLoading(true);
    setError('');
    listRecordings(profileId).then(function(body) {
      setLoading(false);
      var list = (body && Array.isArray(body.recordings)) ? body.recordings : [];
      setRecordings(list);
    }).catch(function(err) {
      setLoading(false);
      var msg = (err && err.message) ? err.message : 'Could not load recordings.';
      setError(msg);
      setRecordings([]);
    });
  }

  React.useEffect(function() {
    if (!isOpen) { return; }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profileId]);

  // ESC closes.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') { onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() { document.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  function handleAction(r) {
    if (!r || !r.recording_id) { return; }
    if (busy[r.recording_id]) { return; }
    var nextBusy = Object.assign({}, busy);
    nextBusy[r.recording_id] = true;
    setBusy(nextBusy);
    cancelRecording(r.recording_id, profileId).then(function() {
      // Drop the row from local state so the UI updates instantly
      // without a second round-trip.
      var remaining = recordings.filter(function(x) { return x.recording_id !== r.recording_id; });
      setRecordings(remaining);
      var cleared = Object.assign({}, nextBusy);
      delete cleared[r.recording_id];
      setBusy(cleared);
    }).catch(function(err) {
      var cleared = Object.assign({}, nextBusy);
      delete cleared[r.recording_id];
      setBusy(cleared);
      var msg = (err && err.message) ? err.message : 'Could not cancel that recording.';
      setError(msg);
    });
  }

  // Apply tab filter.
  var filtered = (activeTab === 'all')
    ? recordings
    : recordings.filter(function(r) { return _bucketOf(r.status) === activeTab; });

  // Counts per bucket for the tab labels.
  var counts = { scheduled: 0, recording: 0, completed: 0, all: recordings.length };
  for (var i = 0; i < recordings.length; i++) {
    var b = _bucketOf(recordings[i].status);
    counts[b] = (counts[b] || 0) + 1;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="My recordings"
      onClick={function(e) {
        if (e.target === e.currentTarget && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 71,
        background: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3vh 1.5rem',
        overflowY: 'auto',
      }}
    >
      <style>{'@keyframes hermes-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '880px',
          background: 'var(--surface, #161b22)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid var(--border, #30363d)',
            background: 'linear-gradient(180deg, var(--surface-raised, #1c2128), var(--surface, #161b22))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div
              aria-hidden="true"
              style={{
                width: '38px', height: '38px',
                borderRadius: '10px',
                background: 'rgba(239,68,68,0.16)',
                border: '1px solid rgba(239,68,68,0.32)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fca5a5',
                fontSize: '18px',
              }}
            >●</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>My recordings</div>
              <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                {recordings.length} recording{recordings.length === 1 ? '' : 's'} for this profile
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              tabIndex={0}
              onClick={refresh}
              aria-label="Refresh recordings"
              disabled={loading}
              style={{
                padding: '0.4rem 0.8rem',
                background: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: '999px',
                color: 'var(--text, #e6edf3)',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              {loading ? '…' : 'Refresh'}
            </button>
            <button
              tabIndex={0}
              autoFocus
              onClick={onClose}
              aria-label="Close recordings list"
              style={{
                width: '38px', height: '38px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                fontSize: '16px',
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >&times;</button>
          </div>
        </div>

        {/* Sort tabs */}
        <div
          role="tablist"
          aria-label="Recording status filter"
          style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.6rem 1.25rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexWrap: 'wrap',
          }}
        >
          {SORT_TABS.map(function(t) {
            var isActive = activeTab === t.id;
            var count = counts[t.id] || 0;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onClick={function() { setActiveTab(t.id); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(t.id); } }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.95rem',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(99,102,241,0.12))'
                    : 'transparent',
                  border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'transparent'),
                  borderRadius: '999px',
                  color: isActive ? 'var(--accent, #00d4ff)' : 'var(--text, #e6edf3)',
                  fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span>{t.label}</span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                    padding: '0.05rem 0.45rem',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: '999px',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ padding: '0.25rem 0 0', maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Header row */}
          {recordings.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1.2fr 0.7fr 1fr auto',
                gap: '0.75rem',
                padding: '0.5rem 0.85rem',
                fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              <div>Title</div>
              <div>Channel</div>
              <div>Start</div>
              <div>Length</div>
              <div>Status</div>
              <div style={{ width: '80px' }} />
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                margin: '0.5rem 1.25rem',
                padding: '0.6rem 0.85rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: 'calc(0.82rem * var(--font-scale, 1))',
              }}
            >
              {error}
            </div>
          )}

          {loading && recordings.length === 0 && (
            <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--muted)' }}>
              <_Spinner /> &nbsp;Loading recordings…
            </div>
          )}

          {!loading && recordings.length === 0 && !error && <_EmptyState />}

          {filtered.map(function(r) {
            return (
              <_Row
                key={r.recording_id}
                recording={r}
                busy={!!busy[r.recording_id]}
                onAction={handleAction}
              />
            );
          })}

          {!loading && recordings.length > 0 && filtered.length === 0 && !error && (
            <div style={{ padding: '1.6rem 1.25rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'calc(0.82rem * var(--font-scale, 1))' }}>
              Nothing in this view. Try another tab.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordingsListModal;

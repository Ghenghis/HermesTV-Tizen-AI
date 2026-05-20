import React from 'react';
import { listRecordings, cancelRecording, deleteMany, getStorageStats } from '../api/dvrClient.js';
import { getProfile } from '../store/profileStore.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import ErrorState from './ErrorState.jsx';
import EmptyState from './EmptyState.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// RecordingsListModal — "My Recordings" panel (wave 2 expansion).
//
// Wave 1 shipped a simple table with Scheduled / Recording / Completed / All
// tabs and per-row cancel/delete. Wave 2 adds:
//
//   1. Bulk-select mode (checkbox per row, "Select all", "Delete N selected")
//   2. Sort dropdown (newest, oldest, size desc, title A–Z, duration desc)
//   3. Filter chips (All / In Progress / Completed / Failed / Scheduled)
//   4. Storage usage indicator at the top — graceful when API is missing
//   5. Per-recording expandable details (poster, full title, channel, EPG,
//      scheduled time, actual start, duration, status, file size if any)
//   6. Empty-state with a friendlier "schedule from EPG/PlayerModal" hint
//   7. Group by date (Today / Yesterday / This week / Earlier) — toggle
//   8. Mom-mode aware — when the active profile has mom_mode=true, we hide
//      the bulk/sort/group machinery and only expose Play + Delete with
//      56-px hit targets and the font-scale tokens.
//
// Props:
//   isOpen      boolean
//   onClose     function()
//   profileId   'dave_tv' | 'mom_tv' | <custom profile id>
//
// Tizen 6.5 / Chrome 76 safe — no spread in JSX, no optional chaining,
// no async/await, no nullish coalescing. ES5 React idioms throughout.
// ─────────────────────────────────────────────────────────────────────────────

// ── Filter chips ────────────────────────────────────────────────────────────
// Maps friendly labels → membership predicate over recording.status. We
// keep "in_progress" as an alias for the raw `recording` status so the chip
// label reads naturally.
var FILTER_CHIPS = [
  { id: 'all',         label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed',   label: 'Completed' },
  { id: 'failed',      label: 'Failed' },
  { id: 'scheduled',   label: 'Scheduled' }
];

function _matchesChip(chipId, r) {
  if (chipId === 'all') { return true; }
  var s = r.status || 'scheduled';
  if (chipId === 'in_progress') { return s === 'recording'; }
  if (chipId === 'completed')   { return s === 'complete'; }
  if (chipId === 'failed')      { return s === 'failed'; }
  if (chipId === 'scheduled') {
    // "Scheduled-for-future" — keep cancelled out, include scheduled rows
    // whose start is now-or-later.
    if (s !== 'scheduled') { return false; }
    var ms = Date.parse(r.start_utc);
    if (isNaN(ms)) { return true; }
    return ms >= Date.now() - 60 * 1000; // 1-minute slack
  }
  return true;
}

// ── Sort modes ──────────────────────────────────────────────────────────────
var SORT_MODES = [
  { id: 'newest',   label: 'Newest first' },
  { id: 'oldest',   label: 'Oldest first' },
  { id: 'size',     label: 'Size (largest)' },
  { id: 'title',    label: 'Title (A–Z)' },
  { id: 'duration', label: 'Duration (longest)' }
];

function _sortFn(mode) {
  if (mode === 'oldest') {
    return function(a, b) { return Date.parse(a.start_utc || 0) - Date.parse(b.start_utc || 0); };
  }
  if (mode === 'size') {
    return function(a, b) { return (b.bytes_written || 0) - (a.bytes_written || 0); };
  }
  if (mode === 'title') {
    return function(a, b) {
      var ta = String(a.title || '').toLowerCase();
      var tb = String(b.title || '').toLowerCase();
      if (ta < tb) { return -1; }
      if (ta > tb) { return 1; }
      return 0;
    };
  }
  if (mode === 'duration') {
    return function(a, b) { return (b.duration_sec || 0) - (a.duration_sec || 0); };
  }
  // Default: newest first.
  return function(a, b) { return Date.parse(b.start_utc || 0) - Date.parse(a.start_utc || 0); };
}

// ── Date bucketing for "Group by date" ──────────────────────────────────────
function _dateBucket(iso) {
  var ms = Date.parse(iso);
  if (isNaN(ms)) { return 'Earlier'; }
  var now = new Date();
  var d = new Date(ms);
  var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  var startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
  if (ms >= startOfToday) { return 'Today'; }
  if (ms >= startOfYesterday) { return 'Yesterday'; }
  if (ms >= startOfWeek) { return 'This week'; }
  return 'Earlier';
}
var BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

// ── Formatting helpers ──────────────────────────────────────────────────────
function _formatStart(iso) {
  if (!iso) { return '—'; }
  var ms = Date.parse(iso);
  if (isNaN(ms)) { return iso; }
  var d = new Date(ms);
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function _formatFullDateTime(iso) {
  if (!iso) { return '—'; }
  var ms = Date.parse(iso);
  if (isNaN(ms)) { return iso; }
  var d = new Date(ms);
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function _formatDuration(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) { return '—'; }
  var totalMin = Math.round(seconds / 60);
  if (totalMin < 60) { return totalMin + 'm'; }
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  return m === 0 ? h + 'h' : h + 'h ' + m + 'm';
}

function _formatBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) { return '—'; }
  if (bytes < 1024) { return bytes + ' B'; }
  var units = ['KB', 'MB', 'GB', 'TB'];
  var n = bytes / 1024;
  var i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + units[i];
}

// ── Visual primitives ──────────────────────────────────────────────────────
function _statusBadge(status, fontScale) {
  var palette = {
    scheduled: { bg: 'rgba(99,102,241,0.16)', border: 'rgba(99,102,241,0.4)', color: '#a5b4fc', label: 'Scheduled' },
    recording: { bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.45)', color: '#fca5a5', label: 'Recording' },
    complete:  { bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.4)',  color: '#86efac', label: 'Completed' },
    failed:    { bg: 'rgba(239,68,68,0.14)',  border: 'rgba(239,68,68,0.45)', color: '#fca5a5', label: 'Failed'    },
    cancelled: { bg: 'rgba(148,163,184,0.14)',border: 'rgba(148,163,184,0.4)',color: '#cbd5e1', label: 'Cancelled' }
  };
  var p = palette[status] || palette.scheduled;
  var size = 'calc(0.7rem * ' + (fontScale || 1) + ')';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.55rem',
        background: p.bg,
        border: '1px solid ' + p.border,
        borderRadius: '999px',
        color: p.color,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '0.02em'
      }}
    >
      {p.label}
    </span>
  );
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
        animation: 'hermes-spin 0.7s linear infinite'
      }}
    />
  );
}

// Friendly empty-state with CTA copy that points at the two places the user
// can schedule from. Delegates to the shared EmptyState component for
// consistent type ramp + Mom-mode awareness.
function _EmptyState(props) {
  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <EmptyState
        icon="●"
        title="No recordings yet"
        message="Schedule from the EPG or tap Record in the player to capture a program. Anything you record will show up here."
      />
    </div>
  );
}

// Storage usage bar — renders graceful "stats unavailable" when the backend
// route 404s. When stats are present we show a 3-color bar that goes
// blue (< 70%) → amber (70-90%) → red (> 90%).
function _StorageBar(props) {
  var stats = props.stats;
  var fs = props.fontScale || 1;
  var recordingCount = (typeof props.recordingCount === 'number') ? props.recordingCount : 0;

  if (!stats || stats.available === false) {
    return (
      <div
        style={{
          padding: '0.65rem 0.85rem',
          margin: '0.65rem 1.25rem 0.4rem',
          border: '1px dashed var(--border, #30363d)',
          borderRadius: '12px',
          color: 'var(--muted)',
          fontSize: 'calc(0.78rem * ' + fs + ')',
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        Storage stats unavailable.
      </div>
    );
  }

  var used = (typeof stats.used_bytes === 'number') ? stats.used_bytes : 0;
  var total = (typeof stats.total_bytes === 'number' && stats.total_bytes > 0) ? stats.total_bytes : 0;
  var pct = (total > 0) ? Math.min(100, Math.round((used / total) * 100)) : 0;
  var avg = (typeof stats.average_bytes === 'number' && stats.average_bytes > 0)
    ? stats.average_bytes
    : (recordingCount > 0 && used > 0 ? Math.round(used / recordingCount) : 0);

  var color = (pct >= 90) ? '#f87171' : (pct >= 70 ? '#fbbf24' : '#60a5fa');

  return (
    <div
      style={{
        padding: '0.7rem 0.9rem',
        margin: '0.65rem 1.25rem 0.5rem',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.02)'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '0.5rem',
        marginBottom: '0.4rem',
        fontSize: 'calc(0.78rem * ' + fs + ')',
        color: 'var(--muted)'
      }}>
        <span>
          <strong style={{ color: 'var(--text, #e6edf3)' }}>{_formatBytes(used)}</strong>
          {total > 0 ? ' / ' + _formatBytes(total) : ''}
          {total > 0 ? ' (' + pct + '%)' : ''}
        </span>
        <span>
          {recordingCount} recording{recordingCount === 1 ? '' : 's'}
          {avg > 0 ? ' × ~' + _formatBytes(avg) + ' each' : ''}
        </span>
      </div>
      <div style={{
        position: 'relative',
        height: '6px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '999px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: pct + '%',
          height: '100%',
          background: color,
          transition: 'width 240ms ease, background 240ms ease'
        }} />
      </div>
    </div>
  );
}

// Expanded details — shown beneath a row when the user clicks/Enter.
function _DetailsBlock(props) {
  var r = props.recording;
  var fs = props.fontScale || 1;
  var poster = r.poster_url || null;
  var rows = [
    { label: 'Full title',     value: r.title || '—' },
    { label: 'Channel',        value: r.channel_display_name || r.channel_id || '—' },
    { label: 'EPG program',    value: r.epg_title || r.series_id || '—' },
    { label: 'Scheduled time', value: _formatFullDateTime(r.start_utc) },
    { label: 'Actual start',   value: _formatFullDateTime(r.actual_start_utc || r.start_utc) },
    { label: 'Duration',       value: _formatDuration(r.duration_sec) },
    { label: 'Status',         value: r.status || 'scheduled' },
    { label: 'File size',      value: (typeof r.bytes_written === 'number' && r.bytes_written > 0) ? _formatBytes(r.bytes_written) : 'unknown' }
  ];

  return (
    <div
      style={{
        padding: '0.75rem 0.95rem 1rem',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px dashed var(--border, #30363d)',
        display: 'flex',
        gap: '1rem',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}
    >
      <div style={{
        width: '110px',
        flexShrink: 0,
        aspectRatio: '2 / 3',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)',
        fontSize: '11px'
      }}>
        {poster
          ? <img alt="" src={poster} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>No poster</span>
        }
      </div>
      <dl style={{
        margin: 0,
        flex: '1 1 240px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.3rem 0.75rem',
        fontSize: 'calc(0.78rem * ' + fs + ')'
      }}>
        {rows.map(function(row, i) {
          return [
            <dt key={'dt' + i} style={{ color: 'var(--muted)', fontWeight: 600 }}>{row.label}</dt>,
            <dd key={'dd' + i} style={{ margin: 0, color: 'var(--text, #e6edf3)', wordBreak: 'break-word' }}>{row.value}</dd>
          ];
        })}
      </dl>
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────
function _Row(props) {
  var r = props.recording;
  var status = r.status || 'scheduled';
  var isWorking = !!props.busy;
  var isSelected = !!props.selected;
  var isExpanded = !!props.expanded;
  var canCancel = status === 'scheduled' || status === 'recording';
  var fs = props.fontScale || 1;
  var momMode = !!props.momMode;
  var bulkMode = !!props.bulkMode;

  // Hit target sizing — Mom mode uses 56-px tap targets per spec.
  var rowMinHeight = momMode ? '64px' : 'auto';
  var btnPad = momMode ? '0.85rem 1.1rem' : '0.4rem 0.85rem';
  var btnFont = momMode ? 'calc(0.95rem * ' + fs + ')' : 'calc(0.75rem * ' + fs + ')';

  // Layout — Mom mode is two cols (title block + actions) for clarity;
  // power mode keeps the wave-1 6-col grid but adds an optional checkbox.
  var gridCols = momMode
    ? '1fr auto'
    : (bulkMode ? '32px 2fr 1.2fr 1.2fr 0.7fr 1fr auto' : '2fr 1.2fr 1.2fr 0.7fr 1fr auto');

  return (
    <div style={{ borderTop: '1px solid var(--border, #30363d)' }}>
      <div
        role={isExpanded === undefined ? undefined : 'button'}
        tabIndex={momMode || !props.onToggleExpand ? -1 : 0}
        onClick={function() {
          if (typeof props.onToggleExpand === 'function') { props.onToggleExpand(r); }
        }}
        onKeyDown={function(e) {
          if ((e.key === 'Enter' || e.key === ' ') && typeof props.onToggleExpand === 'function') {
            e.preventDefault();
            props.onToggleExpand(r);
          }
        }}
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          gap: momMode ? '0.85rem' : '0.75rem',
          alignItems: 'center',
          padding: momMode ? '0.85rem 1rem' : '0.6rem 0.85rem',
          minHeight: rowMinHeight,
          fontSize: 'calc(' + (momMode ? '0.95rem' : '0.85rem') + ' * ' + fs + ')',
          cursor: (props.onToggleExpand && !momMode) ? 'pointer' : 'default',
          background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent'
        }}
      >
        {bulkMode && !momMode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="checkbox"
              tabIndex={0}
              checked={isSelected}
              onClick={function(e) { e.stopPropagation(); }}
              onChange={function(e) {
                if (typeof props.onToggleSelect === 'function') {
                  props.onToggleSelect(r, e.target.checked);
                }
              }}
              aria-label={'Select recording ' + (r.title || r.recording_id)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {r.title || 'Untitled'}
          </div>
          <div style={{
            fontSize: 'calc(' + (momMode ? '0.78rem' : '0.7rem') + ' * ' + fs + ')',
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {momMode
              ? (r.channel_display_name || r.channel_id || '—') + ' · ' + _formatStart(r.start_utc)
              : r.recording_id}
          </div>
        </div>

        {!momMode && (
          <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.channel_display_name || r.channel_id || '—'}
          </div>
        )}
        {!momMode && (
          <div style={{ color: 'var(--text, #e6edf3)', whiteSpace: 'nowrap' }}>
            {_formatStart(r.start_utc)}
          </div>
        )}
        {!momMode && (
          <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {_formatDuration(r.duration_sec)}
          </div>
        )}
        {!momMode && (
          <div>{_statusBadge(status, fs)}</div>
        )}

        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          {momMode && status === 'complete' && (
            <button
              tabIndex={0}
              onClick={function(e) {
                e.stopPropagation();
                if (typeof props.onPlay === 'function') { props.onPlay(r); }
              }}
              disabled={isWorking}
              aria-label={'Play recording ' + (r.title || r.recording_id)}
              style={{
                minHeight: '56px',
                padding: btnPad,
                background: 'rgba(34,197,94,0.16)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: '999px',
                color: '#86efac',
                fontSize: btnFont,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              Play
            </button>
          )}
          <button
            tabIndex={0}
            onClick={function(e) {
              e.stopPropagation();
              if (typeof props.onAction === 'function') { props.onAction(r); }
            }}
            onKeyDown={function(e) {
              if ((e.key === 'Enter' || e.key === ' ') && typeof props.onAction === 'function') {
                e.preventDefault();
                e.stopPropagation();
                props.onAction(r);
              }
            }}
            disabled={isWorking}
            aria-label={(canCancel ? 'Cancel' : 'Delete') + ' recording ' + (r.title || r.recording_id)}
            style={{
              minHeight: momMode ? '56px' : 'auto',
              padding: btnPad,
              background: canCancel ? 'transparent' : 'rgba(239,68,68,0.08)',
              border: '1px solid ' + (canCancel ? 'var(--border, #30363d)' : 'rgba(239,68,68,0.4)'),
              borderRadius: '999px',
              color: canCancel ? 'var(--text, #e6edf3)' : '#fca5a5',
              fontSize: btnFont,
              fontWeight: 700,
              cursor: isWorking ? 'not-allowed' : 'pointer',
              opacity: isWorking ? 0.6 : 1,
              outline: 'none'
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
          >
            {isWorking ? <_Spinner /> : (canCancel ? 'Cancel' : 'Delete')}
          </button>
        </div>
      </div>

      {isExpanded && !momMode && <_DetailsBlock recording={r} fontScale={fs} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
function RecordingsListModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var profileId = props.profileId || 'dave_tv';

  // Resolve mom-mode from the active profile record. Falls back to false
  // when the profile can't be loaded (e.g. anonymous / deleted).
  var profile = null;
  try { profile = getProfile(profileId); } catch (e) { profile = null; }
  var momMode = !!(profile && profile.mom_mode === true);
  var fontScale = (profile && typeof profile.font_scale === 'number') ? profile.font_scale : 1;

  // ── State ────────────────────────────────────────────────────────────────
  var filterResult   = React.useState('all');
  var activeFilter   = filterResult[0];
  var setActiveFilter = filterResult[1];

  var sortResult     = React.useState('newest');
  var sortMode       = sortResult[0];
  var setSortMode    = sortResult[1];

  var groupResult    = React.useState(false);
  var groupByDate    = groupResult[0];
  var setGroupByDate = groupResult[1];

  var bulkResult     = React.useState(false);
  var bulkMode       = bulkResult[0];
  var setBulkMode    = bulkResult[1];

  var selectedResult = React.useState({});
  var selected       = selectedResult[0];
  var setSelected    = selectedResult[1];

  var expandedResult = React.useState({});
  var expanded       = expandedResult[0];
  var setExpanded    = expandedResult[1];

  var recordingsResult = React.useState([]);
  var recordings    = recordingsResult[0];
  var setRecordings = recordingsResult[1];

  var loadingResult = React.useState(false);
  var loading       = loadingResult[0];
  var setLoading    = loadingResult[1];

  var errorResult   = React.useState('');
  var error         = errorResult[0];
  var setError      = errorResult[1];

  var busyResult    = React.useState({});
  var busy          = busyResult[0];
  var setBusy       = busyResult[1];

  var statsResult   = React.useState(null);
  var storageStats  = statsResult[0];
  var setStorageStats = statsResult[1];

  // ── Data loading ─────────────────────────────────────────────────────────
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

    // Storage stats — graceful, never errors.
    getStorageStats().then(function(stats) {
      setStorageStats(stats);
    });
  }

  React.useEffect(function() {
    if (!isOpen) { return; }
    // Reset transient state every time the modal opens so the user gets a
    // clean slate (no stale checkboxes from a previous session).
    setBulkMode(false);
    setSelected({});
    setExpanded({});
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

  // ── Per-row action: cancel/delete a single recording ─────────────────────
  function handleAction(r) {
    if (!r || !r.recording_id) { return; }
    if (busy[r.recording_id]) { return; }
    var nextBusy = Object.assign({}, busy);
    nextBusy[r.recording_id] = true;
    setBusy(nextBusy);
    cancelRecording(r.recording_id, profileId).then(function() {
      var remaining = recordings.filter(function(x) { return x.recording_id !== r.recording_id; });
      setRecordings(remaining);
      // Drop the row from selection + expansion + busy maps.
      var nextSel = Object.assign({}, selected);
      delete nextSel[r.recording_id];
      setSelected(nextSel);
      var nextExp = Object.assign({}, expanded);
      delete nextExp[r.recording_id];
      setExpanded(nextExp);
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

  function handlePlay(r) {
    // Forward to parent if it wired one — otherwise we no-op silently so
    // mom-mode's Play button doesn't crash. PlayerModal integration is out
    // of scope for this file (per ownership rules).
    if (typeof props.onPlay === 'function') { props.onPlay(r); }
  }

  function handleToggleExpand(r) {
    if (!r || !r.recording_id) { return; }
    var next = Object.assign({}, expanded);
    if (next[r.recording_id]) { delete next[r.recording_id]; } else { next[r.recording_id] = true; }
    setExpanded(next);
  }

  function handleToggleSelect(r, checked) {
    if (!r || !r.recording_id) { return; }
    var next = Object.assign({}, selected);
    if (checked) { next[r.recording_id] = true; } else { delete next[r.recording_id]; }
    setSelected(next);
  }

  function handleBulkDelete() {
    var ids = Object.keys(selected);
    if (ids.length === 0) { return; }
    // Optimistic: mark all selected ids busy.
    var nextBusy = Object.assign({}, busy);
    for (var i = 0; i < ids.length; i++) { nextBusy[ids[i]] = true; }
    setBusy(nextBusy);

    deleteMany(ids, profileId).then(function(results) {
      var failedIds = [];
      var okIds = {};
      for (var j = 0; j < results.length; j++) {
        if (results[j].ok) { okIds[results[j].id] = true; }
        else { failedIds.push(results[j].id); }
      }
      // Drop succeeded rows.
      var remaining = recordings.filter(function(x) { return !okIds[x.recording_id]; });
      setRecordings(remaining);
      // Clear selection for everything that succeeded.
      var nextSel = Object.assign({}, selected);
      for (var k = 0; k < ids.length; k++) {
        if (okIds[ids[k]]) { delete nextSel[ids[k]]; }
      }
      setSelected(nextSel);
      // Clear busy for everyone.
      var clearedBusy = Object.assign({}, busy);
      for (var m = 0; m < ids.length; m++) { delete clearedBusy[ids[m]]; }
      setBusy(clearedBusy);
      if (failedIds.length > 0) {
        setError(failedIds.length + ' recording' + (failedIds.length === 1 ? '' : 's') + ' could not be deleted.');
      }
    });
  }

  function selectAllVisible(visible) {
    var next = {};
    for (var i = 0; i < visible.length; i++) {
      next[visible[i].recording_id] = true;
    }
    setSelected(next);
  }

  function clearSelection() { setSelected({}); }

  // ── Derived view (filter → sort → group) ─────────────────────────────────
  var filteredRows = recordings.filter(function(r) { return _matchesChip(activeFilter, r); });
  // Mom mode: filter to only completed recordings (Play makes sense) plus
  // anything currently recording / scheduled so she can still cancel.
  // Sort + group machinery doesn't apply.
  var sortedRows = filteredRows.slice().sort(_sortFn(sortMode));

  // Counts per chip for the badge readout.
  var chipCounts = {};
  for (var c = 0; c < FILTER_CHIPS.length; c++) { chipCounts[FILTER_CHIPS[c].id] = 0; }
  for (var ri = 0; ri < recordings.length; ri++) {
    for (var ci = 0; ci < FILTER_CHIPS.length; ci++) {
      if (_matchesChip(FILTER_CHIPS[ci].id, recordings[ri])) {
        chipCounts[FILTER_CHIPS[ci].id] += 1;
      }
    }
  }

  // Group by date — build a {bucket → rows} map.
  var grouped = null;
  if (groupByDate && !momMode) {
    grouped = { Today: [], Yesterday: [], 'This week': [], Earlier: [] };
    for (var gi = 0; gi < sortedRows.length; gi++) {
      var b = _dateBucket(sortedRows[gi].start_utc);
      grouped[b].push(sortedRows[gi]);
    }
  }

  var selectedCount = Object.keys(selected).length;
  var allVisibleSelected = sortedRows.length > 0 && sortedRows.every(function(r) { return !!selected[r.recording_id]; });

  // Render a single row + (when grouped) its preceding header.
  function renderRow(r) {
    return (
      <_Row
        key={r.recording_id}
        recording={r}
        busy={!!busy[r.recording_id]}
        selected={!!selected[r.recording_id]}
        expanded={!!expanded[r.recording_id]}
        bulkMode={bulkMode}
        momMode={momMode}
        fontScale={fontScale}
        onAction={handleAction}
        onPlay={handlePlay}
        onToggleExpand={handleToggleExpand}
        onToggleSelect={handleToggleSelect}
      />
    );
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
        overflowY: 'auto'
      }}
    >
      <style>{'@keyframes hermes-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '960px',
          background: 'var(--surface, #161b22)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden'
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
            background: 'linear-gradient(180deg, var(--surface-raised, #1c2128), var(--surface, #161b22))'
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
                fontSize: '18px'
              }}
            >●</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'calc(1.05rem * ' + fontScale + ')' }}>My recordings</div>
              <div style={{ fontSize: 'calc(0.72rem * ' + fontScale + ')', color: 'var(--muted)' }}>
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
                fontSize: 'calc(0.75rem * ' + fontScale + ')',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                outline: 'none'
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
                lineHeight: 1
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >&times;</button>
          </div>
        </div>

        {/* Storage usage — visible to everyone, including Mom. */}
        <_StorageBar
          stats={storageStats}
          recordingCount={recordings.length}
          fontScale={fontScale}
        />

        {/* Filter chips + (power-mode) sort/group/bulk toolbar */}
        {!momMode && (
          <div
            style={{
              padding: '0.5rem 1.25rem 0.6rem',
              borderBottom: '1px solid var(--border, #30363d)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.55rem'
            }}
          >
            <div role="tablist" aria-label="Recording status filter" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {FILTER_CHIPS.map(function(t) {
                var isActive = activeFilter === t.id;
                var count = chipCounts[t.id] || 0;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={0}
                    onClick={function() { setActiveFilter(t.id); }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveFilter(t.id); }
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.4rem 0.95rem',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(99,102,241,0.12))'
                        : 'transparent',
                      border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)'),
                      borderRadius: '999px',
                      color: isActive ? 'var(--accent, #00d4ff)' : 'var(--text, #e6edf3)',
                      fontSize: 'calc(0.8rem * ' + fontScale + ')',
                      fontWeight: 700,
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                    onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                    onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span>{t.label}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: 'calc(0.68rem * ' + fontScale + ')',
                        padding: '0.05rem 0.45rem',
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: '999px'
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flexWrap: 'wrap',
              fontSize: 'calc(0.78rem * ' + fontScale + ')'
            }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--muted)' }}>
                Sort
                <select
                  value={sortMode}
                  onChange={function(e) { setSortMode(e.target.value); }}
                  aria-label="Sort recordings"
                  style={{
                    padding: '0.3rem 0.55rem',
                    background: 'var(--surface-raised, #1c2128)',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: '8px',
                    color: 'var(--text, #e6edf3)',
                    fontSize: 'calc(0.78rem * ' + fontScale + ')',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {SORT_MODES.map(function(m) {
                    return <option key={m.id} value={m.id}>{m.label}</option>;
                  })}
                </select>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  checked={groupByDate}
                  onChange={function(e) { setGroupByDate(e.target.checked); }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                Group by date
              </label>

              <div style={{ flex: 1 }} />

              {!bulkMode && (
                <button
                  tabIndex={0}
                  onClick={function() { setBulkMode(true); }}
                  aria-label="Enter bulk-select mode"
                  style={{
                    padding: '0.4rem 0.9rem',
                    background: 'transparent',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: '999px',
                    color: 'var(--text, #e6edf3)',
                    fontSize: 'calc(0.78rem * ' + fontScale + ')',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  Select…
                </button>
              )}

              {bulkMode && (
                <button
                  tabIndex={0}
                  onClick={function() {
                    if (allVisibleSelected) { clearSelection(); }
                    else { selectAllVisible(sortedRows); }
                  }}
                  aria-label={allVisibleSelected ? 'Clear selection' : 'Select all visible'}
                  style={{
                    padding: '0.4rem 0.9rem',
                    background: 'transparent',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: '999px',
                    color: 'var(--text, #e6edf3)',
                    fontSize: 'calc(0.78rem * ' + fontScale + ')',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {allVisibleSelected ? 'Clear' : 'Select all'}
                </button>
              )}

              {bulkMode && (
                <button
                  tabIndex={0}
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0}
                  aria-label={'Delete ' + selectedCount + ' selected recording' + (selectedCount === 1 ? '' : 's')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    background: selectedCount === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(239,68,68,0.16)',
                    border: '1px solid ' + (selectedCount === 0 ? 'var(--border, #30363d)' : 'rgba(239,68,68,0.45)'),
                    borderRadius: '999px',
                    color: selectedCount === 0 ? 'var(--muted)' : '#fca5a5',
                    fontSize: 'calc(0.78rem * ' + fontScale + ')',
                    fontWeight: 700,
                    cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                    outline: 'none'
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  Delete {selectedCount > 0 ? selectedCount : ''} selected
                </button>
              )}

              {bulkMode && (
                <button
                  tabIndex={0}
                  onClick={function() { setBulkMode(false); clearSelection(); }}
                  aria-label="Exit bulk-select mode"
                  style={{
                    padding: '0.4rem 0.9rem',
                    background: 'transparent',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: '999px',
                    color: 'var(--muted)',
                    fontSize: 'calc(0.78rem * ' + fontScale + ')',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '0.25rem 0 0', maxHeight: '58vh', overflowY: 'auto' }}>
          {error && recordings.length === 0 && (
            <div style={{ padding: '1rem 1.25rem' }}>
              <ErrorState
                title="Could not load recordings"
                message={error}
                onRetry={refresh}
              />
            </div>
          )}

          {error && recordings.length > 0 && (
            <div
              role="alert"
              style={{
                margin: '0.5rem 1.25rem',
                padding: '0.6rem 0.85rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: 'calc(0.82rem * ' + fontScale + ')'
              }}
            >
              {error}
            </div>
          )}

          {loading && recordings.length === 0 && (
            <div style={{ padding: '1rem 1.25rem' }}>
              <LoadingSkeleton variant="card" count={6} />
            </div>
          )}

          {!loading && recordings.length === 0 && !error && <_EmptyState fontScale={fontScale} />}

          {/* Grouped render */}
          {grouped && recordings.length > 0 && BUCKET_ORDER.map(function(bucket) {
            var rows = grouped[bucket];
            if (!rows || rows.length === 0) { return null; }
            return (
              <div key={bucket}>
                <div
                  style={{
                    padding: '0.55rem 1rem 0.35rem',
                    fontSize: 'calc(0.72rem * ' + fontScale + ')',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                    background: 'rgba(255,255,255,0.02)'
                  }}
                >
                  {bucket} <span style={{ color: 'var(--muted)', opacity: 0.7 }}>({rows.length})</span>
                </div>
                {rows.map(renderRow)}
              </div>
            );
          })}

          {/* Ungrouped render */}
          {!grouped && sortedRows.map(renderRow)}

          {!loading && recordings.length > 0 && sortedRows.length === 0 && !error && (
            <div style={{
              padding: '1.6rem 1.25rem',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 'calc(0.82rem * ' + fontScale + ')'
            }}>
              Nothing matches this filter. Try another chip.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordingsListModal;

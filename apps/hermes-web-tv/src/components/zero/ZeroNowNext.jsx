import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ZeroNowNext — compact "now / next" EPG row for the focused live channel.
//
// Renders two rows: the program currently airing and the next scheduled
// program. Both rows show a progress bar (now-row only) and the start time
// in the user's locale. Designed for the Zero hero/preview area — sits
// immediately under the focused poster's metadata.
//
// Inputs:
//   nowProgram  — { title, description, start_ts, end_ts } or null. Falls
//                 back to a "No guide data" placeholder when the EPG hasn't
//                 been imported for the channel yet (Zero shows the same
//                 friendly fallback per FRONTEND_COMPONENTS.md §EPG).
//   nextProgram — same shape; can be null independently of nowProgram.
//   fontScale   — passed from the parent profile, drives the calc() rem.
//   tier        — 'enhanced' / 'limited' / 'degraded'; only enhanced
//                 animates the progress fill.
//
// Tizen 6.5 / Chrome 76 safe — classic ES5.
// ─────────────────────────────────────────────────────────────────────────────

function _fmtTime(ts) {
  if (!ts) { return ''; }
  try {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

function _progressPct(prog) {
  if (!prog || !prog.start_ts || !prog.end_ts) { return null; }
  var now = Date.now();
  var start = new Date(prog.start_ts).getTime();
  var end = new Date(prog.end_ts).getTime();
  if (!isFinite(start) || !isFinite(end) || end <= start) { return null; }
  if (now < start) { return 0; }
  if (now > end) { return 100; }
  return Math.round(((now - start) / (end - start)) * 100);
}

function _Row(props) {
  var label = props.label;
  var program = props.program;
  var fontScale = props.fontScale;
  var showProgress = props.showProgress;
  var tier = props.tier;

  var pct = showProgress ? _progressPct(program) : null;
  var title = program ? (program.title || 'Untitled program') : 'No guide data';
  var startLabel = program ? _fmtTime(program.start_ts) : '—';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px 12px',
        background: 'rgba(15,18,24,0.55)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span
          style={{
            fontSize: 'calc(0.6rem * ' + fontScale + ')',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: showProgress ? '#56d2f1' : 'rgba(225,231,240,0.55)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 'calc(0.62rem * ' + fontScale + ')',
            color: 'rgba(225,231,240,0.65)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {startLabel}
        </span>
      </div>
      <div
        style={{
          fontSize: 'calc(0.78rem * ' + fontScale + ')',
          fontWeight: 600,
          color: program ? '#eef2f7' : 'rgba(225,231,240,0.45)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      {showProgress && pct !== null && (
        <div
          aria-hidden="true"
          style={{
            marginTop: '2px',
            height: '4px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: pct + '%',
              background: 'linear-gradient(90deg, #77a7ff 0%, #56d2f1 100%)',
              transition: tier === 'enhanced' ? 'width 300ms ease' : 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

function ZeroNowNext(props) {
  var nowProgram = props.nowProgram;
  var nextProgram = props.nextProgram;
  var fontScale = props.fontScale || 1.0;
  var tier = props.tier;

  return (
    <div
      role="region"
      aria-label="Now and next on this channel"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        marginTop: '8px',
      }}
    >
      <_Row label="Now" program={nowProgram} fontScale={fontScale} tier={tier} showProgress={true} />
      <_Row label="Next" program={nextProgram} fontScale={fontScale} tier={tier} showProgress={false} />
    </div>
  );
}

export default ZeroNowNext;

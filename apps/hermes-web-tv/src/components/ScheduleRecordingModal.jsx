import React from 'react';
import { scheduleRecording } from '../api/dvrClient.js';

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleRecordingModal — IPTV-Player-Zero-style "Record this" dialog.
//
// Wired against routes/dvr.js POST /api/dvr/schedule. The backend
// contract is:
//   { channel_id, profile_id, start_utc, end_utc, title?, series_id? }
//
// The form collects start time + duration locally, then converts to
// `start_utc` / `end_utc` before posting. Times in the UI display in the
// user's locale via toLocaleTimeString; the wire format is always ISO.
//
// Props:
//   isOpen      boolean
//   onClose     function()
//   item        { id|channel_id, title, ... } — the channel/program to schedule
//   profileId   'dave_tv' | 'mom_tv'
//   tier        'enhanced' | 'degraded' (drives the Quality dropdown options)
//   onScheduled function(recording) — optional, fires on successful POST
//
// Tizen 6.5 / Chrome 76 safe — no spread in JSX, no optional chaining,
// no async/await. <input type="time"> is intentionally avoided in favor
// of a plain HH:MM text input because Tizen's date/time popups don't
// render on the TV remote.
// ─────────────────────────────────────────────────────────────────────────────

var DURATION_OPTIONS = [
  { value: 30,    label: '30 minutes' },
  { value: 60,    label: '60 minutes' },
  { value: 90,    label: '90 minutes' },
  { value: 120,   label: '2 hours' },
  { value: 180,   label: '3 hours' },
  { value: 'eop', label: 'Until program ends' },
];

// Backend caps recording duration at 6 hours. "Until program ends" is a
// client-side concept — if the item carries a program end_utc we'll use
// that, otherwise we fall back to a 60-minute default.
var QUALITY_ENHANCED = [
  { value: '4K',    label: '4K (Ultra HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p',  label: '720p (HD)' },
];
var QUALITY_DEGRADED = [
  { value: '720p', label: '720p (HD)' },
];

var REPEAT_OPTIONS = [
  { value: 'once',     label: 'Once' },
  { value: 'daily',    label: 'Daily' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
];

function _pad(n) { return n < 10 ? '0' + n : '' + n; }

// HH:MM (24h) string from a Date.
function _toHHMM(date) {
  return _pad(date.getHours()) + ':' + _pad(date.getMinutes());
}

// Today at HH:MM (local). If the time has already passed today, roll
// forward to tomorrow so the start is always in the future.
function _todayAt(hhmm, baseDate) {
  var m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) { return null; }
  var hh = parseInt(m[1], 10);
  var mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) { return null; }
  var d = new Date(baseDate.getTime());
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() < baseDate.getTime() - 60 * 1000) {
    // Time already past — assume the user means tomorrow.
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Resolve the item's channel_id. Live channels in the catalog carry
// `id` like `live.cnn`; movies and series do not. The backend validates
// the string format but does not require it to be in the known channel
// list (unknown channels are still scheduled, with channel_display_name
// = null).
function _channelIdOf(item) {
  if (!item) { return ''; }
  if (typeof item.channel_id === 'string' && item.channel_id) { return item.channel_id; }
  if (typeof item.id === 'string' && item.id) { return item.id; }
  return '';
}

function _CARD(props) {
  return (
    <div
      style={{
        background: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '12px',
        padding: '0.9rem 1rem',
        marginBottom: '0.75rem',
      }}
    >
      {props.children}
    </div>
  );
}

function _Label(props) {
  return (
    <label
      htmlFor={props.htmlFor}
      style={{
        display: 'block',
        fontSize: 'calc(0.78rem * var(--font-scale, 1))',
        color: 'var(--muted)',
        marginBottom: '0.25rem',
        fontWeight: 600,
      }}
    >
      {props.children}
    </label>
  );
}

var INPUT_STYLE = {
  width: '100%',
  padding: '0.5rem 0.7rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: '8px',
  color: 'var(--text, #e6edf3)',
  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
  outline: 'none',
  boxSizing: 'border-box',
};

var SELECT_STYLE = Object.assign({}, INPUT_STYLE, {
  appearance: 'none',
  paddingRight: '2rem',
  background: 'rgba(255,255,255,0.04) url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path fill=\'%23e6edf3\' d=\'M0 0l5 6 5-6z\'/></svg>") no-repeat right 0.7rem center',
});

function focusHandler(e) {
  e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)';
  e.currentTarget.style.borderColor = 'var(--accent, #00d4ff)';
}
function blurHandler(e) {
  e.currentTarget.style.boxShadow = 'none';
  e.currentTarget.style.borderColor = 'var(--border, #30363d)';
}

function ScheduleRecordingModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var item = props.item || null;
  var profileId = props.profileId || 'dave_tv';
  var tier = props.tier || 'enhanced';
  var onScheduled = props.onScheduled;

  // Defaults rebuilt every time the modal opens so the start time is
  // always "now + ~30 seconds" (rounded up to the next minute for a
  // cleaner HH:MM input).
  var now = React.useMemo(function() { return new Date(); }, [isOpen, item]);
  var defaultStart = React.useMemo(function() {
    var s = new Date(now.getTime() + 30 * 1000);
    // Round to the next whole minute so the HH:MM input matches what
    // the user sees on the clock.
    s.setSeconds(0, 0);
    if (s.getTime() <= now.getTime()) { s.setMinutes(s.getMinutes() + 1); }
    return s;
  }, [now]);

  // Form state.
  var titleResult = React.useState('');
  var title = titleResult[0];
  var setTitle = titleResult[1];

  var startResult = React.useState('');  // HH:MM string
  var startHHMM = startResult[0];
  var setStartHHMM = startResult[1];

  var durationResult = React.useState(60);
  var duration = durationResult[0];
  var setDuration = durationResult[1];

  var qualityOptions = tier === 'degraded' ? QUALITY_DEGRADED : QUALITY_ENHANCED;
  var qualityResult = React.useState(qualityOptions[0].value);
  var quality = qualityResult[0];
  var setQuality = qualityResult[1];

  var repeatsResult = React.useState('once');
  var repeats = repeatsResult[0];
  var setRepeats = repeatsResult[1];

  var paddingOnResult = React.useState(true);
  var paddingOn = paddingOnResult[0];
  var setPaddingOn = paddingOnResult[1];

  var preRollResult = React.useState(2);   // minutes
  var preRoll = preRollResult[0];
  var setPreRoll = preRollResult[1];

  var postRollResult = React.useState(5);  // minutes
  var postRoll = postRollResult[0];
  var setPostRoll = postRollResult[1];

  // Submit state.
  var statusResult = React.useState({ kind: 'idle', msg: '' });
  var status = statusResult[0];
  var setStatus = statusResult[1];

  var submittingResult = React.useState(false);
  var submitting = submittingResult[0];
  var setSubmitting = submittingResult[1];

  // Reset whenever the modal opens against a new item.
  React.useEffect(function() {
    if (!isOpen) { return; }
    setTitle((item && item.title) ? item.title : 'Untitled recording');

    // When the caller supplies item.start_utc (EPG → schedule flow),
    // pre-fill the time inputs from the program's actual start instead of
    // "now + 30s". Same trick for duration when item.end_utc is also set —
    // we snap to the nearest pre-defined option (30 / 60 / 90 / 120 / 180)
    // so the picker still shows a clean value the user can adjust.
    var prefStartMs = (item && typeof item.start_utc === 'string') ? Date.parse(item.start_utc) : NaN;
    if (isFinite(prefStartMs) && prefStartMs > Date.now() - 60 * 1000) {
      setStartHHMM(_toHHMM(new Date(prefStartMs)));
    } else {
      setStartHHMM(_toHHMM(defaultStart));
    }

    var prefEndMs = (item && typeof item.end_utc === 'string') ? Date.parse(item.end_utc) : NaN;
    var presetDuration = 60;
    if (isFinite(prefStartMs) && isFinite(prefEndMs) && prefEndMs > prefStartMs) {
      var minutes = Math.round((prefEndMs - prefStartMs) / 60000);
      var snapTo = [30, 60, 90, 120, 180];
      var best = snapTo[0];
      var bestDist = Math.abs(minutes - best);
      for (var i = 1; i < snapTo.length; i++) {
        var d = Math.abs(minutes - snapTo[i]);
        if (d < bestDist) { best = snapTo[i]; bestDist = d; }
      }
      presetDuration = best;
    }
    setDuration(presetDuration);

    setQuality(qualityOptions[0].value);
    setRepeats('once');
    setPaddingOn(true);
    setPreRoll(2);
    setPostRoll(5);
    setStatus({ kind: 'idle', msg: '' });
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item]);

  // ESC closes (unless mid-submit so we don't lose the request).
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !submitting && typeof onClose === 'function') { onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() { document.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, submitting, onClose]);

  if (!isOpen) { return null; }

  function handleSubmit() {
    if (submitting) { return; }
    setStatus({ kind: 'idle', msg: '' });

    var channelId = _channelIdOf(item);
    if (!channelId) {
      setStatus({ kind: 'error', msg: 'No channel_id on the selected item — cannot schedule.' });
      return;
    }
    var startDate = _todayAt(startHHMM, new Date());
    if (!startDate) {
      setStatus({ kind: 'error', msg: 'Start time must be in HH:MM format (e.g. 20:30).' });
      return;
    }

    // Resolve duration. "Until program ends" falls back to the item's
    // program end_utc if known, otherwise 60 minutes.
    var durationMinutes;
    if (duration === 'eop') {
      if (item && item.program && item.program.end_utc) {
        var endMs = Date.parse(item.program.end_utc);
        if (!isNaN(endMs)) {
          durationMinutes = Math.max(1, Math.round((endMs - startDate.getTime()) / 60000));
        } else {
          durationMinutes = 60;
        }
      } else {
        durationMinutes = 60;
      }
    } else {
      durationMinutes = duration;
    }

    var startMs = startDate.getTime();
    var endMs = startMs + durationMinutes * 60 * 1000;
    if (paddingOn) {
      startMs -= Math.max(0, preRoll) * 60 * 1000;
      endMs += Math.max(0, postRoll) * 60 * 1000;
    }
    // Server caps at 6h; warn early instead of hitting a 400.
    if ((endMs - startMs) > 6 * 60 * 60 * 1000) {
      setStatus({ kind: 'error', msg: 'Recording duration cannot exceed 6 hours.' });
      return;
    }

    setSubmitting(true);
    var titleTrimmed = (title || '').trim();
    var payload = {
      channel_id: channelId,
      profile_id: profileId,
      start_utc: new Date(startMs).toISOString(),
      end_utc: new Date(endMs).toISOString(),
    };
    if (titleTrimmed) { payload.title = titleTrimmed; }
    if (item && item.series_id) { payload.series_id = item.series_id; }

    scheduleRecording(payload).then(function(result) {
      setSubmitting(false);
      var startStr = new Date(startMs).toLocaleTimeString();
      var repeatLabel = (function() {
        for (var i = 0; i < REPEAT_OPTIONS.length; i++) {
          if (REPEAT_OPTIONS[i].value === repeats) { return REPEAT_OPTIONS[i].label; }
        }
        return repeats;
      })();
      var qualNote = (repeats !== 'once') ? ' · ' + repeatLabel + ' (UI-only — first occurrence saved)' : '';
      setStatus({
        kind: 'success',
        msg: 'Recording scheduled for ' + startStr + ' (' + quality + ')' + qualNote + '.',
      });
      if (typeof onScheduled === 'function') {
        try { onScheduled(result && result.recording ? result.recording : null); } catch (_) { /* swallow */ }
      }
      // Auto-close shortly so Mom doesn't have to hunt for the X button.
      setTimeout(function() {
        if (typeof onClose === 'function') { onClose(); }
      }, 1400);
    }).catch(function(err) {
      setSubmitting(false);
      var msg = (err && err.message) ? err.message : 'Could not schedule the recording.';
      setStatus({ kind: 'error', msg: msg });
    });
  }

  // For the "start time preview" line under the HH:MM input.
  var previewDate = _todayAt(startHHMM, new Date());
  var previewLabel = previewDate
    ? previewDate.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '— invalid time —';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Schedule recording"
      onClick={function(e) {
        if (e.target === e.currentTarget && !submitting && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 72,
        background: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        overflowY: 'auto',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '540px',
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
              <div style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>Schedule recording</div>
              <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                {(item && item.title) ? item.title : 'No item selected'}
              </div>
            </div>
          </div>
          <button
            tabIndex={0}
            autoFocus
            onClick={function() { if (!submitting && typeof onClose === 'function') { onClose(); } }}
            aria-label="Close schedule recording dialog"
            style={{
              width: '38px', height: '38px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #30363d)',
              color: 'var(--text, #e6edf3)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              outline: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              opacity: submitting ? 0.5 : 1,
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.25rem 0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
          <_CARD>
            <_Label htmlFor="rec-title">Title</_Label>
            <input
              id="rec-title"
              type="text"
              value={title}
              maxLength={200}
              onChange={function(e) { setTitle(e.target.value); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />
          </_CARD>

          <_CARD>
            <_Label htmlFor="rec-start">Start time (24h)</_Label>
            <input
              id="rec-start"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{2}:[0-9]{2}"
              placeholder="HH:MM"
              value={startHHMM}
              maxLength={5}
              onChange={function(e) { setStartHHMM(e.target.value); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={INPUT_STYLE}
            />
            <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted)', marginTop: '0.35rem' }}>
              Will record at <strong style={{ color: 'var(--accent, #00d4ff)' }}>{previewLabel}</strong>. If the time already passed today, we'll record tomorrow.
            </div>

            <_Label htmlFor="rec-duration" >Duration</_Label>
            <select
              id="rec-duration"
              value={String(duration)}
              onChange={function(e) {
                var v = e.target.value;
                setDuration(v === 'eop' ? 'eop' : parseInt(v, 10));
              }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={SELECT_STYLE}
            >
              {DURATION_OPTIONS.map(function(opt) {
                return <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>;
              })}
            </select>
          </_CARD>

          <_CARD>
            <_Label htmlFor="rec-quality">Quality</_Label>
            <select
              id="rec-quality"
              value={quality}
              onChange={function(e) { setQuality(e.target.value); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={SELECT_STYLE}
            >
              {qualityOptions.map(function(opt) {
                return <option key={opt.value} value={opt.value}>{opt.label}</option>;
              })}
            </select>
            {tier === 'degraded' && (
              <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted)', marginTop: '0.35rem' }}>
                720p only on this TV tier. Open the QN85 / QN95 to record at 4K.
              </div>
            )}

            <_Label htmlFor="rec-repeats">Repeats</_Label>
            <select
              id="rec-repeats"
              value={repeats}
              onChange={function(e) { setRepeats(e.target.value); }}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={SELECT_STYLE}
            >
              {REPEAT_OPTIONS.map(function(opt) {
                return <option key={opt.value} value={opt.value}>{opt.label}</option>;
              })}
            </select>
            {repeats !== 'once' && (
              <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted)', marginTop: '0.35rem' }}>
                The first occurrence is scheduled now. Series rules land alongside the recording muxer.
              </div>
            )}
          </_CARD>

          <_CARD>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <_Label htmlFor="rec-padding">Padding</_Label>
              <button
                id="rec-padding"
                tabIndex={0}
                role="switch"
                aria-checked={paddingOn}
                onClick={function() { setPaddingOn(!paddingOn); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaddingOn(!paddingOn); } }}
                style={{
                  width: '44px', height: '24px',
                  borderRadius: '999px',
                  background: paddingOn ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: paddingOn ? '22px' : '2px',
                    width: '20px', height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                  }}
                />
              </button>
            </div>
            <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)', marginBottom: '0.5rem' }}>
              Start a little early, end a little late so you never clip the show. Defaults: 2 min early / 5 min late.
            </div>
            {paddingOn && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <_Label htmlFor="rec-preroll">Start early (min)</_Label>
                  <input
                    id="rec-preroll"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={preRoll}
                    onChange={function(e) {
                      var n = parseInt(e.target.value, 10);
                      setPreRoll(isNaN(n) ? 0 : Math.max(0, Math.min(60, n)));
                    }}
                    onFocus={focusHandler}
                    onBlur={blurHandler}
                    style={INPUT_STYLE}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <_Label htmlFor="rec-postroll">End late (min)</_Label>
                  <input
                    id="rec-postroll"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    value={postRoll}
                    onChange={function(e) {
                      var n = parseInt(e.target.value, 10);
                      setPostRoll(isNaN(n) ? 0 : Math.max(0, Math.min(60, n)));
                    }}
                    onFocus={focusHandler}
                    onBlur={blurHandler}
                    style={INPUT_STYLE}
                  />
                </div>
              </div>
            )}
          </_CARD>

          {status.kind === 'success' && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '0.6rem 0.85rem',
                marginBottom: '0.75rem',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: '8px',
                color: '#86efac',
                fontSize: 'calc(0.82rem * var(--font-scale, 1))',
              }}
            >
              {status.msg}
            </div>
          )}
          {status.kind === 'error' && (
            <div
              role="alert"
              style={{
                padding: '0.6rem 0.85rem',
                marginBottom: '0.75rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: 'calc(0.82rem * var(--font-scale, 1))',
              }}
            >
              {status.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.6rem',
            padding: '0.85rem 1.25rem 1.1rem',
            borderTop: '1px solid var(--border, #30363d)',
            background: 'var(--surface, #161b22)',
          }}
        >
          <button
            tabIndex={0}
            onClick={function() { if (!submitting && typeof onClose === 'function') { onClose(); } }}
            disabled={submitting}
            style={{
              padding: '0.55rem 1.1rem',
              background: 'transparent',
              border: '1px solid var(--border, #30363d)',
              borderRadius: '999px',
              color: 'var(--text, #e6edf3)',
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
          >
            Cancel
          </button>
          <button
            tabIndex={0}
            onClick={handleSubmit}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSubmit(); } }}
            disabled={submitting || status.kind === 'success'}
            style={{
              padding: '0.55rem 1.3rem',
              background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
              border: 'none',
              borderRadius: '999px',
              color: '#ffffff',
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              fontWeight: 800,
              cursor: (submitting || status.kind === 'success') ? 'not-allowed' : 'pointer',
              opacity: (submitting || status.kind === 'success') ? 0.55 : 1,
              boxShadow: '0 6px 18px rgba(239,68,68,0.32)',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff), 0 6px 18px rgba(239,68,68,0.32)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = '0 6px 18px rgba(239,68,68,0.32)'; }}
          >
            {submitting ? 'Scheduling…' : 'Schedule recording'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScheduleRecordingModal;

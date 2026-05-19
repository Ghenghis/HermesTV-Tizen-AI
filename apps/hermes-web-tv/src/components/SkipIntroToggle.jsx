import React from 'react';
import * as playbackPrefStore from '../store/playbackPrefStore.js';

// SkipIntroToggle — inline switch for the "Auto-skip intro" preference.
//
// Two forms (resolved automatically from props):
//
//   1) Standalone — reads + writes the per-profile playback prefs store.
//        <SkipIntroToggle profile={profile} />
//      Used in Settings ▸ Playback tab where the toggle owns its own state.
//
//   2) Controlled — caller passes `value` + `onChange` and owns the state.
//        <SkipIntroToggle value={pb.skip_intro_enabled} onChange={fn} />
//      Used inside larger settings forms or contextually from PlayerModal
//      (Wave 2-F owns that mount — this component is just the widget).
//
// Mom-mode aware: when `profile.mom_mode === true` the switch renders at
// roughly 1.3x the size with chunkier targets so a remote-pointer hit
// from across the room still lands. We also drop the help-text subtitle
// in mom-mode to keep the row visually quieter — Sherri's QN95 already
// shows the body text larger via the global --font-scale.
//
// Tizen 6.5 / Chrome 76 safe: no optional chaining, no spread, no nullish
// coalescing. Standard React function component using React.useState only.

function SkipIntroToggle(props) {
  var profile = props.profile || null;
  var isControlled = (typeof props.value === 'boolean') && (typeof props.onChange === 'function');
  var momMode = !!(profile && profile.mom_mode === true);
  var disabled = !!props.disabled;
  var label = props.label || 'Auto-skip intro';
  var hint = props.hint || 'Jump past the opening credits automatically.';

  // ── Standalone form: read the store on mount, write on toggle. ───────────
  // We seed `internal` from the store so the visual matches persisted state
  // on first paint. The useEffect re-reads on profile-id change so switching
  // profiles in dev (without a full remount) still reflects the right slot.
  var initialFromStore = function() {
    if (isControlled) { return !!props.value; }
    if (profile && typeof profile.id === 'string') {
      var prefs = playbackPrefStore.get(profile.id);
      return !!(prefs && prefs.skip_intro_enabled);
    }
    return false;
  };
  var internalState = React.useState(initialFromStore);
  var internal = internalState[0];
  var setInternal = internalState[1];

  React.useEffect(function() {
    if (isControlled) { return; }
    if (profile && typeof profile.id === 'string') {
      var prefs = playbackPrefStore.get(profile.id);
      setInternal(!!(prefs && prefs.skip_intro_enabled));
    } else {
      setInternal(false);
    }
    // We intentionally watch only the profile id — `isControlled` flipping
    // mid-render would be a programmer error.
  }, [profile && profile.id]);

  var on = isControlled ? !!props.value : internal;

  function flip(e) {
    if (disabled) { return; }
    if (e && e.preventDefault) { e.preventDefault(); }
    var next = !on;
    if (isControlled) {
      props.onChange(next);
      return;
    }
    if (profile && typeof profile.id === 'string') {
      playbackPrefStore.set(profile.id, { skip_intro_enabled: next });
    }
    setInternal(next);
    if (typeof props.onChange === 'function') { props.onChange(next); }
  }

  // ── Sizing ───────────────────────────────────────────────────────────────
  // Mom-mode uses ~1.3x dimensions so the focus ring + thumb travel are
  // visible from the couch. Sizes track `--font-scale` indirectly through
  // the label markup; the switch itself stays in absolute px because the
  // CSS-var math compounds badly with the absolutely-positioned thumb.
  var trackW = momMode ? 60 : 44;
  var trackH = momMode ? 32 : 24;
  var thumb = momMode ? 28 : 20;
  var thumbOff = 2;
  var thumbOn = trackW - thumb - 2;

  var labelFontSize = momMode
    ? 'calc(1.05rem * var(--font-scale, 1))'
    : 'calc(0.88rem * var(--font-scale, 1))';
  var hintFontSize = 'calc(0.74rem * var(--font-scale, 1))';

  return (
    <div
      className="skip-intro-toggle"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: momMode ? '1rem' : '0.75rem',
        width: '100%',
        padding: momMode ? '0.4rem 0' : '0.2rem 0'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          id={props.id ? (props.id + '-label') : undefined}
          style={{
            fontWeight: 700,
            fontSize: labelFontSize,
            color: 'var(--text)'
          }}
        >
          {label}
        </div>
        {!momMode && hint ? (
          <div style={{ fontSize: hintFontSize, color: 'var(--muted)' }}>
            {hint}
          </div>
        ) : null}
      </div>

      <button
        tabIndex={0}
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={props.id ? (props.id + '-label') : undefined}
        disabled={disabled}
        onClick={flip}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') { flip(e); }
        }}
        onFocus={function(e) {
          e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.boxShadow = 'none';
        }}
        style={{
          width: trackW + 'px',
          height: trackH + 'px',
          borderRadius: '999px',
          background: on ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          transition: 'background 120ms ease',
          outline: 'none',
          flexShrink: 0
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '2px',
            left: (on ? thumbOn : thumbOff) + 'px',
            width: thumb + 'px',
            height: thumb + 'px',
            borderRadius: '50%',
            background: '#ffffff',
            transition: 'left 120ms ease'
          }}
        />
      </button>
    </div>
  );
}

export default SkipIntroToggle;

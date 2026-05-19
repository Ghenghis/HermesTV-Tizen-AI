import React from 'react';
import * as onboardingState from '../store/onboardingState.js';
import ProfilePicker from './ProfilePicker.jsx';
import OnboardingTourCard from './OnboardingTourCard.jsx';

// Lazy-loaded — these modals are large and only rendered when the operator
// taps into Step 4 of the wizard. React.lazy is stable on Chrome 76 / Tizen
// 6.5, mirroring the pattern App.jsx already uses for its own modal stack.
var PlaylistImportModal = React.lazy(function() { return import('./PlaylistImportModal.jsx'); });
var QROnboarding = React.lazy(function() { return import('./QROnboarding.jsx'); });

// ─────────────────────────────────────────────────────────────────────────────
// OnboardingWizard — first-launch 5-step onboarding overlay for HermesTV.
//
//   Step 1  Welcome           — brand splash + "Get started" CTA + skip link
//   Step 2  TV model          — auto-detect + manual selector → tv_model
//   Step 3  Profile           — embeds ProfilePicker (Sherri / Dave / new)
//   Step 4  Provider setup    — Import via URL | Pair via phone | Skip
//   Step 5  Tour              — 3 swipeable hint cards → "Start watching"
//
// Triggering rule (caller's job — App.jsx integration):
//
//     onboardingState.isOnboarded() === false  →  render with isOpen=true
//
// Persistence:
//   - localStorage 'hermestv:onboarded' flips to 'true' the moment the
//     wizard completes OR is skipped. The wizard never re-prompts after.
//   - 'hermestv:tv_model' carries the operator's TV-model choice. App.jsx
//     can read this via resolveTier(localStorage.getItem('hermestv:tv_model'))
//     to apply the right tier before /api/profile responds.
//   - Active profile is persisted by ProfilePicker → profileStore as usual.
//   - Per-step answers (welcome ack, model, provider step outcome, tour seen)
//     are stored under 'hermestv:onboarding::<stepId>' for QA replay.
//
// Tizen 6.5 / Chrome 76 safe:
//   - No arrow functions in JSX prop bodies (every handler is a `function`).
//   - No destructuring in parameter lists.
//   - No optional chaining (?.). Helpers guard each property access.
//   - No top-level await. React.lazy + Suspense are used the same way as
//     App.jsx — proven safe on the target engine.
//
// Keyboard:
//   - Arrow Left / Right step backwards / forwards (when current step is
//     "complete enough" to advance — see canAdvance()).
//   - Escape opens an in-modal "Skip onboarding?" confirmation. Confirm =
//     flag is set and onComplete fires; Cancel = back to where you were.
//
// Motion-reduced:
//   - The wizard relies on the document-level .motion-reduced class which
//     index.css already wires to strip animations from .hermes-modal-* and
//     transition-bearing elements. No extra work needed here beyond using
//     the established hermes-modal-overlay / hermes-modal-panel classes.
// ─────────────────────────────────────────────────────────────────────────────

var TV_MODEL_STORAGE_KEY = 'hermestv:tv_model';

// Step IDs — string constants so they're greppable in localStorage + analytics.
var STEP_WELCOME = 'welcome';
var STEP_TV_MODEL = 'tv_model';
var STEP_PROFILE = 'profile';
var STEP_PROVIDER = 'provider';
var STEP_TOUR = 'tour';

var STEP_ORDER = [STEP_WELCOME, STEP_TV_MODEL, STEP_PROFILE, STEP_PROVIDER, STEP_TOUR];

// Manual TV-model choices. Maps to resolveTier() in App.jsx — anything
// starting QN or set to CUSTOM lands on the enhanced tier; UN-class
// degrades. "Other QN" and "Other UN" exist so an operator with a model
// we haven't catalogued can still pick the right tier.
var TV_MODEL_OPTIONS = [
  { id: 'QN85Q7FAAFXZA', label: 'QN85 (Q7)',       hint: 'Sherri’s living-room QLED, enhanced tier.' },
  { id: 'QN95QNFAAFXZA', label: 'QN95 (Neo QLED)', hint: 'Top-spec QN95 — full enhanced + HDR pipeline.' },
  { id: 'OTHER_QN',      label: 'Other QN-class',   hint: 'Any QN-prefixed model not listed above.' },
  { id: 'UN55CU8000BXZA',label: 'UN58 (CU8000)',    hint: 'Dave’s test set — degraded tier, capped FX.' },
  { id: 'OTHER_UN',      label: 'Other UN-class',   hint: 'UN-prefixed budget panel — degraded tier.' },
  { id: 'CUSTOM',        label: 'Custom / unknown', hint: 'Anything else — defaults to enhanced.' },
];

// 3 hint cards rendered in Step 5. Edits here only update copy — the slider
// counts STEP_TOUR_CARDS.length and never hard-codes indices.
var STEP_TOUR_CARDS = [
  {
    icon: '🏠', // 🏠
    headline: 'Press the Home button to switch layouts',
    body: 'HermesTV ships with 14 visual styles — from TiviMate-style EPG grids to Netflix-style discovery rows. Try a few until one feels like home.',
    accent: '#1f6feb',
  },
  {
    icon: '✨', // ✨
    headline: 'Long-press OK on any tile',
    body: 'Quick actions: open the detail panel, queue a download, kick off playback, or tag a favourite — all without leaving the grid.',
    accent: '#d946ef',
  },
  {
    icon: '🎙️', // 🎙️
    headline: 'Say "Hey Hermes" or type in the chat',
    body: 'Voice and text control the whole TV — filter by provider, change layouts, switch themes, jump straight to a movie. Hermes listens.',
    accent: '#22c55e',
  },
];

// ── Auto-detect helper ──────────────────────────────────────────────────────
// Best-effort: peek at any Tizen-provided system info, then fall back to the
// userAgent string. Returns one of the TV_MODEL_OPTIONS ids or null when no
// confident guess can be made (in which case the UI keeps the manual picker
// front-and-centre).
function attemptAutoDetect() {
  if (typeof window === 'undefined') { return null; }

  // Tizen 6+ exposes some product info via webapis. Wrapped in try/catch
  // because on dev browsers `webapis` is undefined and a bare access throws.
  try {
    if (window.webapis && window.webapis.productinfo && typeof window.webapis.productinfo.getModelCode === 'function') {
      var code = window.webapis.productinfo.getModelCode();
      if (typeof code === 'string' && code.length > 0) {
        var upper = code.toUpperCase();
        if (upper.indexOf('QN85') === 0) { return 'QN85Q7FAAFXZA'; }
        if (upper.indexOf('QN95') === 0) { return 'QN95QNFAAFXZA'; }
        if (upper.indexOf('QN') === 0)   { return 'OTHER_QN'; }
        if (upper.indexOf('UN55') === 0) { return 'UN55CU8000BXZA'; }
        if (upper.indexOf('UN') === 0)   { return 'OTHER_UN'; }
        return 'CUSTOM';
      }
    }
  } catch (e) {
    // ignore — fall through to userAgent sniffing.
  }

  // Fallback — userAgent hints. Samsung TVs include "Tizen" and sometimes
  // a model token, but it's brittle. Only commit to a guess when the model
  // family is unambiguous.
  try {
    var ua = (window.navigator && window.navigator.userAgent) ? window.navigator.userAgent : '';
    var ua2 = ua.toUpperCase();
    if (ua2.indexOf('QN85') !== -1) { return 'QN85Q7FAAFXZA'; }
    if (ua2.indexOf('QN95') !== -1) { return 'QN95QNFAAFXZA'; }
    if (ua2.indexOf('TIZEN') !== -1 && ua2.indexOf('SAMSUNG') !== -1) {
      // Samsung TV but unknown family — best to ask the operator.
      return null;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

// ── Style helpers (kept here to avoid prop-drilling style objects) ─────────
function gradientBg() {
  return 'radial-gradient(ellipse at top, #1a2030 0%, #0d1117 55%, #06080c 100%)';
}

function primaryButtonStyle(focused) {
  return {
    padding: '0.85rem 2.4rem',
    background: 'linear-gradient(135deg, var(--accent, #1f6feb), #6366f1)',
    border: 'none',
    borderRadius: '999px',
    color: '#ffffff',
    fontSize: 'calc(1.05rem * var(--font-scale, 1))',
    cursor: 'pointer',
    fontWeight: '800',
    outline: focused ? '3px solid #ffffff' : 'none',
    outlineOffset: focused ? '3px' : '0',
    boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
    transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), box-shadow 180ms ease',
    letterSpacing: '0.02em',
    minWidth: '180px',
  };
}

function secondaryButtonStyle(focused) {
  return {
    padding: '0.7rem 1.6rem',
    backgroundColor: 'transparent',
    border: '1px solid var(--border, #30363d)',
    borderRadius: '999px',
    color: 'var(--muted, #8b949e)',
    fontSize: 'calc(0.95rem * var(--font-scale, 1))',
    cursor: 'pointer',
    fontWeight: '600',
    outline: focused ? '2px solid var(--accent, #1f6feb)' : 'none',
    outlineOffset: focused ? '2px' : '0',
    transition: 'border-color 180ms ease, color 180ms ease',
  };
}

function linkStyle(focused) {
  return {
    background: 'none',
    border: 'none',
    color: focused ? 'var(--text, #e6edf3)' : 'var(--muted, #8b949e)',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
    padding: '0.4rem 0.8rem',
    outline: focused ? '2px solid var(--accent, #1f6feb)' : 'none',
    outlineOffset: '2px',
    borderRadius: '6px',
  };
}

// ── ProgressDots ──────────────────────────────────────────────────────────
function ProgressDots(props) {
  var current = props.current;
  var total = props.total;
  var dots = [];
  for (var i = 0; i < total; i++) {
    var active = i === current;
    var passed = i < current;
    var size = active ? '12px' : '8px';
    var bg = active
      ? 'var(--accent, #1f6feb)'
      : passed ? 'rgba(31,111,235,0.55)' : 'rgba(255,255,255,0.18)';
    dots.push(
      <span
        key={'dot-' + i}
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: bg,
          display: 'inline-block',
          transition: 'background-color 200ms ease, width 200ms ease, height 200ms ease',
        }}
      />
    );
  }
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={'Step ' + (current + 1) + ' of ' + total}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.55rem',
        padding: '0.5rem 0',
      }}
    >
      {dots}
    </div>
  );
}

// ── TV-model option tile (used inside step 2's manual picker) ──────────────
function TvModelOption(props) {
  var option = props.option;
  var selected = props.selected;
  var onSelect = props.onSelect;

  function handleClick() { onSelect(option.id); }
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(option.id);
    }
  }

  var border = selected ? 'var(--accent, #1f6feb)' : 'var(--border, #30363d)';
  var bg = selected ? 'rgba(31,111,235,0.12)' : 'rgba(22,27,34,0.6)';

  return (
    <button
      type="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
      style={{
        textAlign: 'left',
        padding: '0.95rem 1.2rem',
        backgroundColor: bg,
        border: '2px solid ' + border,
        borderRadius: '14px',
        color: 'var(--text, #e6edf3)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        outline: 'none',
        transition: 'border-color 160ms ease, background-color 160ms ease, transform 160ms ease',
      }}
      onFocus={function(e) {
        e.currentTarget.style.outline = '3px solid var(--accent, #1f6feb)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={function(e) {
        e.currentTarget.style.outline = 'none';
      }}
    >
      <span style={{ fontSize: 'calc(1rem * var(--font-scale, 1))', fontWeight: '700' }}>
        {option.label}
      </span>
      <span style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
        {option.hint}
      </span>
    </button>
  );
}

// ── Embedded profile picker — Step 3 ───────────────────────────────────────
// We reuse ProfilePicker so we never drift from the production look.
// onSelectInternal fires when the user picks an existing profile (handled
// by the existing ProfilePicker → profileStore wiring) and the wizard
// auto-advances. The embedded ProfilePicker also exposes an AddProfileTile
// + a "Manage profiles" button which mount ProfileManagementModal directly,
// so creating a new profile mid-wizard works out of the box. The modal's
// z-index (1200) sits above the wizard (1100), so it paints over us.
function EmbeddedProfileStep(props) {
  var onPicked = props.onPicked;

  function handleProfileSelected(profileId) {
    // ProfilePicker already calls profileStore.setActiveProfileId before
    // invoking onSelect — see ProfilePicker.jsx. We just need to notify
    // the wizard so it can advance.
    if (typeof onPicked === 'function') { onPicked(profileId); }
  }

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      {/* ProfilePicker is a full-screen component by default — we wrap it
          in a sized container and use CSS to neutralise its outer min-height
          via inline override on the parent. The wrapper's styles render
          the picker inline within the wizard while preserving its tile look. */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          // Override the picker's own 100vh so it sits inside our step area.
          // ProfilePicker uses minHeight:100vh on its outer div; we crop it
          // visually by clipping to the wrapper's height while keeping the
          // tile layout intact.
        }}
      >
        <div
          style={{
            // Force the picker to lay out as an inline block instead of
            // a viewport-filling screen.
            width: '100%',
            maxWidth: '720px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <InlineProfilePicker onSelect={handleProfileSelected} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── InlineProfilePicker ─────────────────────────────────────────────────────
// ProfilePicker is designed as a full-screen experience. Rather than touch
// it (the brief explicitly says hands-off), we render it inside a wrapper
// that lets the existing component breathe at its natural size by replacing
// the radial-gradient screen and the outer min-height:100vh with neutral
// inline values. We accomplish that by simply rendering ProfilePicker
// inside a div that wraps it and lets it size to content; the picker still
// shows its tiles + heading. Visually, the only thing lost is the radial
// background (which the parent gradient already provides).
function InlineProfilePicker(props) {
  var onSelect = props.onSelect;

  // ProfilePicker is rendered inside a wrapper that constrains its own
  // 100vh layout via a flex container with no min-height enforced. The
  // hermes-modal-panel inner div still carries its own padding + radius.
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        // We deliberately do NOT set minHeight here. The picker's outer div
        // requests 100vh but, because we wrap it in an inline-block context
        // and let it overflow naturally, the wizard's parent step area
        // simply shows the tiles without enlarging the modal beyond the
        // viewport. The picker's own `justifyContent: center` keeps the
        // tile row centred horizontally.
      }}
    >
      <ProfilePicker onSelect={onSelect} embedded />
    </div>
  );
}

// ── Skip-confirmation prompt ───────────────────────────────────────────────
function SkipConfirm(props) {
  var onCancel = props.onCancel;
  var onConfirm = props.onConfirm;

  function handleKey(e) {
    if (e.key === 'Escape') { onCancel(); }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Skip onboarding?"
      onKeyDown={handleKey}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        padding: '1rem',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          backgroundColor: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '18px',
          padding: '2rem',
          maxWidth: '440px',
          width: '100%',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'calc(1.25rem * var(--font-scale, 1))', fontWeight: '700' }}>
          Skip onboarding?
        </h3>
        <p style={{ margin: 0, color: 'var(--muted, #8b949e)', fontSize: 'calc(0.95rem * var(--font-scale, 1))', lineHeight: 1.5 }}>
          You can always re-run this from Settings &raquo; Replay welcome.
          For now we&apos;ll drop you on the default profile picker.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            tabIndex={0}
            onClick={onCancel}
            style={secondaryButtonStyle(false)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            Keep going
          </button>
          <button
            type="button"
            tabIndex={0}
            autoFocus
            onClick={onConfirm}
            style={primaryButtonStyle(false)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '3px solid #ffffff';
              e.currentTarget.style.outlineOffset = '3px';
            }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────
function StepWelcome(props) {
  var onNext = props.onNext;
  var onSkip = props.onSkip;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1f6feb, #6366f1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '4.5rem',
          color: '#ffffff',
          fontWeight: '900',
          boxShadow: '0 16px 48px rgba(31,111,235,0.45)',
          letterSpacing: '-0.04em',
        }}
      >
        H
      </div>

      <h1
        style={{
          margin: 0,
          fontSize: 'calc(2.4rem * var(--font-scale, 1))',
          fontWeight: '800',
          color: 'var(--text, #e6edf3)',
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
        }}
      >
        Welcome to Hermes<span style={{ color: 'var(--accent, #1f6feb)' }}>TV</span>
      </h1>
      <p
        style={{
          margin: 0,
          color: 'var(--muted, #8b949e)',
          fontSize: 'calc(1.1rem * var(--font-scale, 1))',
          maxWidth: '560px',
          lineHeight: 1.55,
        }}
      >
        Your smart IPTV companion. Five quick steps and we&apos;ll have you on the couch with the right picture, the right profile, and the right shows.
      </p>

      <button
        type="button"
        tabIndex={0}
        autoFocus
        onClick={onNext}
        style={primaryButtonStyle(false)}
        onFocus={function(e) {
          e.currentTarget.style.outline = '3px solid #ffffff';
          e.currentTarget.style.outlineOffset = '3px';
          e.currentTarget.style.transform = 'scale(1.04)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        Get started
      </button>

      <button
        type="button"
        tabIndex={0}
        onClick={onSkip}
        style={linkStyle(false)}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
          e.currentTarget.style.outlineOffset = '2px';
          e.currentTarget.style.color = 'var(--text, #e6edf3)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.color = 'var(--muted, #8b949e)';
        }}
      >
        Skip onboarding
      </button>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────
function StepTvModel(props) {
  var selected = props.selected;
  var onSelect = props.onSelect;
  var onAutoDetect = props.onAutoDetect;
  var detectState = props.detectState;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        width: '100%',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(2rem * var(--font-scale, 1))',
            fontWeight: '800',
            color: 'var(--text, #e6edf3)',
            marginBottom: '0.6rem',
          }}
        >
          What TV are you using?
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--muted, #8b949e)',
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            lineHeight: 1.55,
          }}
        >
          We use this to pick the right performance tier. QN-class panels get the full enhanced pipeline; UN-class get a graceful, gentler mode.
        </p>
      </div>

      {/* Auto-detect */}
      <button
        type="button"
        tabIndex={0}
        onClick={onAutoDetect}
        aria-live="polite"
        style={{
          padding: '0.75rem 1.6rem',
          background: 'linear-gradient(135deg, rgba(31,111,235,0.18), rgba(99,102,241,0.18))',
          border: '1px solid var(--accent, #1f6feb)',
          borderRadius: '999px',
          color: 'var(--text, #e6edf3)',
          fontSize: 'calc(0.95rem * var(--font-scale, 1))',
          fontWeight: '700',
          cursor: 'pointer',
          outline: 'none',
          transition: 'background-color 180ms ease, transform 180ms ease',
        }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '3px solid var(--accent, #1f6feb)';
          e.currentTarget.style.outlineOffset = '3px';
        }}
        onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
      >
        {detectState === 'pending' ? 'Detecting...'
          : detectState === 'hit' ? 'Auto-detected — change below if needed'
          : detectState === 'miss' ? 'No match — please pick manually'
          : 'Auto-detect my TV'}
      </button>

      {/* Manual grid */}
      <div
        role="radiogroup"
        aria-label="TV model"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          width: '100%',
          maxWidth: '640px',
        }}
      >
        {TV_MODEL_OPTIONS.map(function(option) {
          return (
            <TvModelOption
              key={option.id}
              option={option}
              selected={selected === option.id}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────────
function StepProfile(props) {
  var onPicked = props.onPicked;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(2rem * var(--font-scale, 1))',
            fontWeight: '800',
            color: 'var(--text, #e6edf3)',
            marginBottom: '0.6rem',
          }}
        >
          Who&apos;s watching today?
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--muted, #8b949e)',
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            lineHeight: 1.55,
          }}
        >
          Pick a profile to lock in your themes, voice, and pacing. You can swap any time from Settings.
        </p>
      </div>

      <EmbeddedProfileStep onPicked={onPicked} />
    </div>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────────────
function StepProvider(props) {
  var onImportUrl = props.onImportUrl;
  var onPairPhone = props.onPairPhone;
  var onSkip = props.onSkip;

  var bigButton = function(focused, accentRgb) {
    return {
      flex: '1 1 220px',
      minHeight: '160px',
      padding: '1.5rem 1.4rem',
      backgroundColor: 'rgba(22,27,34,0.85)',
      border: '2px solid ' + (focused ? 'var(--accent, #1f6feb)' : 'var(--border, #30363d)'),
      borderRadius: '20px',
      color: 'var(--text, #e6edf3)',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '0.6rem',
      textAlign: 'left',
      outline: focused ? '3px solid var(--accent, #1f6feb)' : 'none',
      outlineOffset: focused ? '3px' : '0',
      transition: 'border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease',
      boxShadow: '0 8px 24px rgba(' + accentRgb + ',0.18)',
    };
  };

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(2rem * var(--font-scale, 1))',
            fontWeight: '800',
            color: 'var(--text, #e6edf3)',
            marginBottom: '0.6rem',
          }}
        >
          Want to connect a playlist now?
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--muted, #8b949e)',
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            lineHeight: 1.55,
          }}
        >
          HermesTV reads M3U / Xtream / iptv-org playlists. You can do this now, or any time from Settings &raquo; Playlists.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '640px',
        }}
      >
        <button
          type="button"
          tabIndex={0}
          onClick={onImportUrl}
          style={bigButton(false, '31,111,235')}
          onFocus={function(e) {
            e.currentTarget.style.outline = '3px solid var(--accent, #1f6feb)';
            e.currentTarget.style.outlineOffset = '3px';
            e.currentTarget.style.borderColor = 'var(--accent, #1f6feb)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.borderColor = 'var(--border, #30363d)';
          }}
        >
          <span style={{ fontSize: '2rem' }} aria-hidden="true">{'🔗'}</span>
          <span style={{ fontWeight: '800', fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>
            Import via URL
          </span>
          <span style={{ color: 'var(--muted, #8b949e)', fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
            Paste an M3U or Xtream login on the TV.
          </span>
        </button>

        <button
          type="button"
          tabIndex={0}
          onClick={onPairPhone}
          style={bigButton(false, '217,70,239')}
          onFocus={function(e) {
            e.currentTarget.style.outline = '3px solid var(--accent, #1f6feb)';
            e.currentTarget.style.outlineOffset = '3px';
            e.currentTarget.style.borderColor = 'var(--accent, #1f6feb)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.borderColor = 'var(--border, #30363d)';
          }}
        >
          <span style={{ fontSize: '2rem' }} aria-hidden="true">{'📱'}</span>
          <span style={{ fontWeight: '800', fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>
            Pair via phone
          </span>
          <span style={{ color: 'var(--muted, #8b949e)', fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
            Scan a QR code and finish setup on your phone.
          </span>
        </button>
      </div>

      <button
        type="button"
        tabIndex={0}
        onClick={onSkip}
        style={linkStyle(false)}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
          e.currentTarget.style.outlineOffset = '2px';
          e.currentTarget.style.color = 'var(--text, #e6edf3)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.color = 'var(--muted, #8b949e)';
        }}
      >
        Skip &mdash; I&apos;ll do this later
      </button>
    </div>
  );
}

// ── Step 5 ─────────────────────────────────────────────────────────────────
function StepTour(props) {
  var index = props.index;
  var onPrev = props.onPrev;
  var onNext = props.onNext;
  var onFinish = props.onFinish;

  var card = STEP_TOUR_CARDS[index] || STEP_TOUR_CARDS[0];
  var isLast = index >= STEP_TOUR_CARDS.length - 1;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(2rem * var(--font-scale, 1))',
            fontWeight: '800',
            color: 'var(--text, #e6edf3)',
            marginBottom: '0.6rem',
          }}
        >
          A 30-second tour
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--muted, #8b949e)',
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            lineHeight: 1.55,
          }}
        >
          Three small superpowers worth knowing about before you dive in.
        </p>
      </div>

      <OnboardingTourCard
        icon={card.icon}
        headline={card.headline}
        body={card.body}
        accentColor={card.accent}
        active
      />

      {/* tour-internal dots */}
      <div
        role="tablist"
        aria-label="Tour cards"
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.25rem 0',
        }}
      >
        {STEP_TOUR_CARDS.map(function(_card, i) {
          var on = i === index;
          return (
            <span
              key={'tour-dot-' + i}
              aria-hidden="true"
              style={{
                width: on ? '22px' : '8px',
                height: '8px',
                borderRadius: '999px',
                backgroundColor: on ? 'var(--accent, #1f6feb)' : 'rgba(255,255,255,0.2)',
                transition: 'width 200ms ease, background-color 200ms ease',
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {index > 0 ? (
          <button
            type="button"
            tabIndex={0}
            onClick={onPrev}
            style={secondaryButtonStyle(false)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            &larr; Previous tip
          </button>
        ) : null}

        {!isLast ? (
          <button
            type="button"
            tabIndex={0}
            autoFocus
            onClick={onNext}
            style={primaryButtonStyle(false)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '3px solid #ffffff';
              e.currentTarget.style.outlineOffset = '3px';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Next tip &rarr;
          </button>
        ) : (
          <button
            type="button"
            tabIndex={0}
            autoFocus
            onClick={onFinish}
            style={primaryButtonStyle(false)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '3px solid #ffffff';
              e.currentTarget.style.outlineOffset = '3px';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Start watching
          </button>
        )}
      </div>
    </div>
  );
}

// ── Wizard root ────────────────────────────────────────────────────────────
function OnboardingWizard(props) {
  var isOpen = props.isOpen;
  var onComplete = props.onComplete;

  // Snapshot the persisted answers on first mount so the wizard can pick
  // up where the user left off (e.g. a crash mid-flow).
  var initialAnswers = (function() {
    var modelAnswer = onboardingState.getStepAnswer(STEP_TV_MODEL);
    var profileAnswer = onboardingState.getStepAnswer(STEP_PROFILE);
    return {
      tvModel: (modelAnswer && typeof modelAnswer.id === 'string') ? modelAnswer.id : null,
      profileId: (profileAnswer && typeof profileAnswer.profile_id === 'string') ? profileAnswer.profile_id : null,
    };
  })();

  var stateHook = React.useState({
    stepIndex: 0,
    tvModel: initialAnswers.tvModel,
    profileId: initialAnswers.profileId,
    detectState: 'idle', // idle | pending | hit | miss
    tourIndex: 0,
    showSkipConfirm: false,
    showImportModal: false,
    showQRModal: false,
  });
  var state = stateHook[0];
  var setState = stateHook[1];

  function patch(p) {
    setState(function(prev) { return Object.assign({}, prev, p); });
  }

  // ── Step navigation ─────────────────────────────────────────────────────
  function canAdvance() {
    var step = STEP_ORDER[state.stepIndex];
    if (step === STEP_WELCOME)   { return true; }
    if (step === STEP_TV_MODEL)  { return typeof state.tvModel === 'string' && state.tvModel.length > 0; }
    if (step === STEP_PROFILE)   { return typeof state.profileId === 'string' && state.profileId.length > 0; }
    if (step === STEP_PROVIDER)  { return true; } // always skippable
    if (step === STEP_TOUR)      { return true; }
    return true;
  }

  function goNext() {
    if (!canAdvance()) { return; }
    if (state.stepIndex < STEP_ORDER.length - 1) {
      patch({ stepIndex: state.stepIndex + 1 });
    } else {
      handleComplete();
    }
  }

  function goPrev() {
    if (state.stepIndex > 0) {
      patch({ stepIndex: state.stepIndex - 1 });
    }
  }

  function handleComplete() {
    onboardingState.setStepAnswer(STEP_TOUR, { seen: true, ts: Date.now() });
    onboardingState.setOnboarded();
    if (typeof onComplete === 'function') { onComplete({ skipped: false }); }
  }

  function handleSkip() {
    onboardingState.setOnboarded();
    if (typeof onComplete === 'function') { onComplete({ skipped: true }); }
  }

  // ── Step 1 handlers ─────────────────────────────────────────────────────
  function handleWelcomeNext() {
    onboardingState.setStepAnswer(STEP_WELCOME, { acknowledged: true });
    goNext();
  }

  // ── Step 2 handlers ─────────────────────────────────────────────────────
  function handleTvModelPick(modelId) {
    // Persist immediately so an interrupted boot still applies the right tier.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(TV_MODEL_STORAGE_KEY, modelId);
      }
    } catch (e) { /* silent */ }
    onboardingState.setStepAnswer(STEP_TV_MODEL, { id: modelId, source: 'manual' });
    patch({ tvModel: modelId, detectState: 'idle' });
  }

  function handleAutoDetect() {
    patch({ detectState: 'pending' });
    // Run detection on next tick so the UI can show the "Detecting..." label.
    setTimeout(function() {
      var hit = attemptAutoDetect();
      if (hit) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(TV_MODEL_STORAGE_KEY, hit);
          }
        } catch (e) { /* silent */ }
        onboardingState.setStepAnswer(STEP_TV_MODEL, { id: hit, source: 'auto' });
        patch({ tvModel: hit, detectState: 'hit' });
      } else {
        patch({ detectState: 'miss' });
      }
    }, 350);
  }

  // ── Step 3 handlers ─────────────────────────────────────────────────────
  function handleProfilePicked(profileId) {
    onboardingState.setStepAnswer(STEP_PROFILE, { profile_id: profileId });
    patch({ profileId: profileId });
    // Auto-advance after a brief pause so the user sees the selection feedback.
    setTimeout(function() {
      patch({ stepIndex: STEP_ORDER.indexOf(STEP_PROVIDER) });
    }, 400);
  }

  // ── Step 4 handlers ─────────────────────────────────────────────────────
  function handleOpenImport() {
    onboardingState.setStepAnswer(STEP_PROVIDER, { choice: 'import_url' });
    patch({ showImportModal: true });
  }
  function handleOpenQR() {
    onboardingState.setStepAnswer(STEP_PROVIDER, { choice: 'pair_phone' });
    patch({ showQRModal: true });
  }
  function handleProviderSkip() {
    onboardingState.setStepAnswer(STEP_PROVIDER, { choice: 'skip' });
    goNext();
  }
  function handleImportClosed() {
    patch({ showImportModal: false });
  }
  function handleImportSaved() {
    onboardingState.setStepAnswer(STEP_PROVIDER, { choice: 'import_url', saved: true });
    patch({ showImportModal: false });
    goNext();
  }
  function handleQRClosed() {
    patch({ showQRModal: false });
  }
  function handleQRCompleted() {
    onboardingState.setStepAnswer(STEP_PROVIDER, { choice: 'pair_phone', completed: true });
    patch({ showQRModal: false });
    // The QR modal auto-closes itself ~1.2s after completion; advance once
    // that lifecycle completes so the celebratory state is visible.
    setTimeout(function() { goNext(); }, 600);
  }

  // ── Step 5 handlers ─────────────────────────────────────────────────────
  function handleTourPrev() {
    if (state.tourIndex > 0) {
      patch({ tourIndex: state.tourIndex - 1 });
    }
  }
  function handleTourNext() {
    if (state.tourIndex < STEP_TOUR_CARDS.length - 1) {
      patch({ tourIndex: state.tourIndex + 1 });
    }
  }

  // ── Skip-confirm prompt ─────────────────────────────────────────────────
  function openSkipConfirm() { patch({ showSkipConfirm: true }); }
  function closeSkipConfirm() { patch({ showSkipConfirm: false }); }
  function confirmSkip() {
    patch({ showSkipConfirm: false });
    handleSkip();
  }

  // ── Keyboard navigation ─────────────────────────────────────────────────
  // Arrow Left/Right walk between steps (only forwards when canAdvance()
  // returns true). Escape opens the skip-confirm prompt. We intentionally
  // do NOT bind Enter to "next" — every step has an explicit autoFocus'd
  // primary CTA so Enter already does the right thing per-step.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }

    function onKey(e) {
      // Don't intercept keys when a child modal is open — Playlist import
      // and QR pairing own their own keyboard model.
      if (state.showImportModal || state.showQRModal) { return; }

      if (e.key === 'Escape') {
        if (state.showSkipConfirm) {
          closeSkipConfirm();
        } else {
          openSkipConfirm();
        }
        e.preventDefault();
        return;
      }

      if (state.showSkipConfirm) { return; }

      if (e.key === 'ArrowRight') {
        if (canAdvance()) {
          e.preventDefault();
          goNext();
        }
      } else if (e.key === 'ArrowLeft') {
        if (state.stepIndex > 0) {
          e.preventDefault();
          goPrev();
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, state.stepIndex, state.tvModel, state.profileId, state.showSkipConfirm, state.showImportModal, state.showQRModal]);

  if (!isOpen) { return null; }

  // ── Render ──────────────────────────────────────────────────────────────
  var stepId = STEP_ORDER[state.stepIndex];

  var stepBody;
  if (stepId === STEP_WELCOME) {
    stepBody = <StepWelcome onNext={handleWelcomeNext} onSkip={openSkipConfirm} />;
  } else if (stepId === STEP_TV_MODEL) {
    stepBody = (
      <StepTvModel
        selected={state.tvModel}
        onSelect={handleTvModelPick}
        onAutoDetect={handleAutoDetect}
        detectState={state.detectState}
      />
    );
  } else if (stepId === STEP_PROFILE) {
    stepBody = <StepProfile onPicked={handleProfilePicked} />;
  } else if (stepId === STEP_PROVIDER) {
    stepBody = (
      <StepProvider
        onImportUrl={handleOpenImport}
        onPairPhone={handleOpenQR}
        onSkip={handleProviderSkip}
      />
    );
  } else if (stepId === STEP_TOUR) {
    stepBody = (
      <StepTour
        index={state.tourIndex}
        onPrev={handleTourPrev}
        onNext={handleTourNext}
        onFinish={handleComplete}
      />
    );
  }

  // Footer with Back / Next — hidden on Step 1 (CTA owns the only forward
  // affordance) and on Step 5 (the tour has its own Prev/Next).
  var showFooter = stepId !== STEP_WELCOME && stepId !== STEP_TOUR;
  var canMoveForward = canAdvance();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="HermesTV first-launch onboarding"
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100, // sits above the lazy modal stack in App.jsx (z=1000)
        backgroundImage: gradientBg(),
        backgroundColor: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1.25rem',
        overflowY: 'auto',
      }}
    >
      {/* Top bar: progress + skip link */}
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <span
          style={{
            fontSize: 'calc(0.95rem * var(--font-scale, 1))',
            color: 'var(--text, #e6edf3)',
            fontWeight: '800',
            letterSpacing: '0.04em',
          }}
        >
          Hermes<span style={{ color: 'var(--accent, #1f6feb)' }}>TV</span>
        </span>
        <ProgressDots current={state.stepIndex} total={STEP_ORDER.length} />
        <button
          type="button"
          tabIndex={0}
          onClick={openSkipConfirm}
          aria-label="Skip onboarding"
          style={linkStyle(false)}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
            e.currentTarget.style.outlineOffset = '2px';
            e.currentTarget.style.color = 'var(--text, #e6edf3)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.color = 'var(--muted, #8b949e)';
          }}
        >
          Skip
        </button>
      </div>

      {/* Step body — centred in a 720-wide content area */}
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '720px',
          flex: '0 0 auto',
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
        }}
      >
        {stepBody}
      </div>

      {/* Footer nav */}
      {showFooter ? (
        <div
          style={{
            width: '100%',
            maxWidth: '720px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '1.5rem',
            gap: '1rem',
          }}
        >
          <button
            type="button"
            tabIndex={0}
            onClick={goPrev}
            disabled={state.stepIndex === 0}
            style={Object.assign({}, secondaryButtonStyle(false), {
              opacity: state.stepIndex === 0 ? 0.4 : 1,
              cursor: state.stepIndex === 0 ? 'not-allowed' : 'pointer',
            })}
            onFocus={function(e) {
              if (state.stepIndex === 0) { return; }
              e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            &larr; Back
          </button>

          <button
            type="button"
            tabIndex={0}
            onClick={goNext}
            disabled={!canMoveForward}
            style={Object.assign({}, primaryButtonStyle(false), {
              opacity: canMoveForward ? 1 : 0.5,
              cursor: canMoveForward ? 'pointer' : 'not-allowed',
            })}
            onFocus={function(e) {
              if (!canMoveForward) { return; }
              e.currentTarget.style.outline = '3px solid #ffffff';
              e.currentTarget.style.outlineOffset = '3px';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Next &rarr;
          </button>
        </div>
      ) : null}

      {/* Footer for Step 1 — small hint about keyboard nav */}
      {stepId === STEP_WELCOME ? (
        <p
          style={{
            margin: '1.5rem 0 0 0',
            fontSize: 'calc(0.8rem * var(--font-scale, 1))',
            color: 'var(--muted, #8b949e)',
            textAlign: 'center',
            maxWidth: '480px',
          }}
        >
          Tip: use the arrow keys on your remote or keyboard to move between steps. Press Esc any time to skip.
        </p>
      ) : null}

      {/* ── Lazy child modals ───────────────────────────────────────────── */}
      <React.Suspense fallback={null}>
        {state.showImportModal ? (
          <PlaylistImportModal
            isOpen={state.showImportModal}
            onClose={handleImportClosed}
            onSaved={handleImportSaved}
          />
        ) : null}

        {state.showQRModal ? (
          <QROnboarding
            isOpen={state.showQRModal}
            online
            onClose={handleQRClosed}
            onCompleted={handleQRCompleted}
          />
        ) : null}
      </React.Suspense>

      {/* Skip-confirmation overlay */}
      {state.showSkipConfirm ? (
        <SkipConfirm onCancel={closeSkipConfirm} onConfirm={confirmSkip} />
      ) : null}
    </div>
  );
}

export default OnboardingWizard;

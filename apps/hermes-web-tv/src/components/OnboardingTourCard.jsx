import React from 'react';

// OnboardingTourCard — a single slide inside the Step-5 mini-tour. Renders
// a large emoji / icon, a headline, and a body paragraph. Kept deliberately
// flat so a parent slider can stack any number of them without touching
// internal layout. The card honours --font-scale and the document-wide
// `motion-reduced` class (which strips animations everywhere via index.css).
//
// Props:
//   icon        — string (emoji or single character). Optional. Hidden from
//                 a11y because the headline + body already carry meaning.
//   headline    — string (short, 1 line). Required.
//   body        — string (1–2 lines). Required.
//   accentColor — optional css color for the icon halo + headline accent.
//                 Defaults to var(--accent).
//   active      — bool; when true the card pops to full opacity. When false
//                 it fades back so the slider can preview neighbours. The
//                 wizard renders one active card at a time, but the prop is
//                 there in case a follow-up wants a stacked-card carousel.
//
// Tizen 6.5 / Chrome 76 safe: function components, no spread, no optional
// chaining, no template-literal-in-prop-body trickery.

function OnboardingTourCard(props) {
  var icon = props.icon || '';
  var headline = props.headline || '';
  var body = props.body || '';
  var accentColor = props.accentColor || 'var(--accent, #1f6feb)';
  var active = props.active !== false; // default true

  var cardStyle = {
    width: '100%',
    maxWidth: '640px',
    padding: '2.25rem 2rem',
    backgroundColor: 'rgba(22, 27, 34, 0.85)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: '20px',
    color: 'var(--text, #e6edf3)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '1.1rem',
    boxShadow: '0 20px 56px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
    opacity: active ? 1 : 0.55,
    transition: 'opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)',
  };

  var iconWrapStyle = {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0)) , ' + accentColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '3rem',
    color: '#ffffff',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    flexShrink: 0,
  };

  var headlineStyle = {
    margin: 0,
    fontSize: 'calc(1.6rem * var(--font-scale, 1))',
    fontWeight: '800',
    letterSpacing: '0.01em',
    lineHeight: 1.2,
    color: 'var(--text, #e6edf3)',
  };

  var bodyStyle = {
    margin: 0,
    fontSize: 'calc(1.05rem * var(--font-scale, 1))',
    color: 'var(--muted, #8b949e)',
    lineHeight: 1.55,
    maxWidth: '520px',
  };

  return (
    <div
      role="group"
      aria-label={headline}
      style={cardStyle}
    >
      {icon ? (
        <div aria-hidden="true" style={iconWrapStyle}>{icon}</div>
      ) : null}
      <h3 style={headlineStyle}>{headline}</h3>
      <p style={bodyStyle}>{body}</p>
    </div>
  );
}

export default OnboardingTourCard;

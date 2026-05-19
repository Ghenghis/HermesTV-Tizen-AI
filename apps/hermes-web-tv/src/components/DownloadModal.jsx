import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// DownloadModal — IPTV-Player-Zero-style exact-size disclosure dialog.
//
// Shows the operator the precise byte count BEFORE the download starts, with
// a green "Exact" pill so they know we're not estimating. Two primary states:
//
//   1. "review"  — title, size in 24px bold, Cancel + Proceed buttons.
//   2. "queued"  — Proceed clicked; we have a job_id and the actual byte
//                  stream is currently 503 (Phase 4 wires the muxer).
//                  Modal stays open and surfaces the friendly
//                  "Server-side download muxer lands in Phase 4" message
//                  with a Close button.
//   3. "error"   — backend returned a non-queue response (404 / 503 /
//                  threadfin_proxy_required). Show the error message
//                  inline + a Close button so the operator gets actionable
//                  feedback rather than a silent failure.
//
// Tizen / Chrome 76 safe: no spread, no optional chaining, no nullish
// coalescing in JSX. Focusable Cancel/Proceed for the remote.
// ─────────────────────────────────────────────────────────────────────────────

function DownloadModal(props) {
  var isOpen = !!props.isOpen;
  var envelope = props.envelope || null;     // download envelope from /api/download (success path)
  var pending = !!props.pending;             // request in flight
  var confirmed = !!props.confirmed;         // user clicked Proceed — switch to queued view
  var error = props.error || null;           // server error envelope (body.error + body.message)
  var item = props.item || (envelope && envelope.item) || null;
  var onClose = props.onClose;
  var onProceed = props.onProceed;

  // ESC closes the dialog
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') { onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() { document.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  // envelope.label (when present) carries the series-aware string like
  // "Smallville — Season 1 (21 eps)" or "Smallville — S01E05". Falls back
  // to the bare item title for movies and live items.
  var title = (envelope && envelope.label)
    || (item && item.title)
    || 'Untitled';
  var sizeHuman = envelope && envelope.exact_size_human ? envelope.exact_size_human : null;
  // "queued" view fires after the user clicks Proceed (parent flips `confirmed`).
  // The envelope.status is always 'queued' on success — that's the API contract —
  // but we only switch UI state after explicit consent so Mom never sees the job
  // is already queued before she's reviewed the size.
  var isQueued = confirmed && envelope && envelope.status === 'queued';
  var isError = !!error;
  var threadfinNeeded = isError && error.error === 'threadfin_proxy_required';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={'Download ' + title}
      onClick={function(e) {
        if (e.target === e.currentTarget && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 70,
        background: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--surface, #112240)',
          color: 'var(--text, #e0f2fe)',
          border: '1px solid var(--border, #1c3a5e)',
          borderRadius: '20px',
          padding: '0',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden',
        }}
      >
        {/* Gradient header band */}
        <div
          className="hermes-gradient-header"
          style={{
            padding: '1.2rem 1.4rem 1.1rem',
            borderBottom: '1px solid var(--border, #1c3a5e)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div
              aria-hidden="true"
              style={{
                width: '46px', height: '46px', flexShrink: 0,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(0,212,255,0.22), rgba(99,102,241,0.16))',
                border: '1px solid rgba(0,212,255,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent, #00d4ff)',
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(0,212,255,0.18)',
              }}
            >⤓</div>
            <div>
              <div
                style={{
                  fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  color: 'var(--accent, #00d4ff)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {isQueued ? 'Download queued' : isError ? 'Download blocked' : 'Exact download size'}
              </div>
              <div
                style={{
                  marginTop: '0.2rem',
                  fontSize: 'calc(1.05rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '420px',
                }}
              >
                {title}
              </div>
              <div
                style={{
                  marginTop: '0.15rem',
                  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  color: 'var(--muted, #7dd3fc)',
                }}
              >
                {isQueued
                  ? 'Job ID: ' + envelope.job_id
                  : isError
                    ? (error.message || 'The server rejected this download.')
                    : 'Review the size before starting this download.'}
              </div>
            </div>
          </div>
          <button
            tabIndex={0}
            aria-label="Close"
            onClick={function() { if (typeof onClose === 'function') { onClose(); } }}
            style={{
              flexShrink: 0,
              width: '38px', height: '38px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #1c3a5e)',
              color: 'var(--text, #e0f2fe)',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
              lineHeight: 1,
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
          >&times;</button>
        </div>

        {/* Body wrapper — restored padding now that header is its own band */}
        <div style={{ padding: '1.1rem 1.4rem 1.2rem' }}>

        {/* Body: size pill, error notice, or queued confirmation */}
        <div
          style={{
            padding: '1rem 1.1rem',
            background: 'var(--bg, #0a1628)',
            border: '1px solid var(--border, #1c3a5e)',
            borderRadius: '12px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 24px rgba(0,0,0,0.3)',
          }}
        >
          {isError && (
            <div>
              <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted, #7dd3fc)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Server response
              </div>
              <div style={{ marginTop: '0.3rem', fontSize: 'calc(0.9rem * var(--font-scale, 1))', fontWeight: 600 }}>
                {error.error}
              </div>
              {threadfinNeeded && (
                <div style={{ marginTop: '0.5rem', fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted, #7dd3fc)' }}>
                  Operator: set <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>THREADFIN_URL</code> in the API <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>.env</code> and redeploy.
                </div>
              )}
            </div>
          )}

          {!isError && sizeHuman && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div>
                <div
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: 'var(--muted, #7dd3fc)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Exact download size
                </div>
                <div
                  style={{
                    marginTop: '0.2rem',
                    fontSize: 'calc(1.6rem * var(--font-scale, 1))',
                    fontWeight: 800,
                  }}
                >
                  {sizeHuman}
                </div>
              </div>
              <span
                aria-label="Exact size, not an estimate"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.7rem',
                  borderRadius: '999px',
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  color: '#0a1628',
                  background: '#10b981',
                  flexShrink: 0,
                }}
              >
                Exact
              </span>
            </div>
          )}

          {!isError && pending && (
            <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', color: 'var(--muted, #7dd3fc)' }}>
              Calculating exact size…
            </div>
          )}

          {isQueued && (
            <div style={{ marginTop: '0.4rem', fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted, #7dd3fc)' }}>
              {envelope && envelope._note ? envelope._note : 'The download is queued. The actual byte stream lands in Phase 4 once the operator wires the muxer pipeline.'}
            </div>
          )}
        </div>

        {/* Action row */}
        <div
          style={{
            marginTop: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.6rem',
          }}
        >
          {!isQueued && !isError && (
            <React.Fragment>
              <button
                tabIndex={0}
                onClick={function() { if (typeof onClose === 'function') { onClose(); } }}
                style={{
                  padding: '0.55rem 1.2rem',
                  background: 'transparent',
                  border: '1px solid var(--border, #1c3a5e)',
                  borderRadius: '999px',
                  color: 'var(--text, #e0f2fe)',
                  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                Cancel
              </button>
              <button
                tabIndex={0}
                autoFocus
                disabled={pending || !sizeHuman}
                onClick={function() { if (typeof onProceed === 'function' && sizeHuman && !pending) { onProceed(); } }}
                style={{
                  padding: '0.6rem 1.6rem',
                  background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
                  border: 'none',
                  borderRadius: '999px',
                  color: '#0a1628',
                  fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                  outline: 'none',
                  boxShadow: '0 6px 18px rgba(0,212,255,0.28)',
                  transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease',
                }}
                onMouseEnter={function(e) { if (!pending) e.currentTarget.style.transform = 'scale(1.03)'; }}
                onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 212, 255, 0.45), 0 6px 18px rgba(0,212,255,0.28)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,212,255,0.28)'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Proceed
              </button>
            </React.Fragment>
          )}

          {(isQueued || isError) && (
            <button
              tabIndex={0}
              autoFocus
              onClick={function() { if (typeof onClose === 'function') { onClose(); } }}
              style={{
                padding: '0.6rem 1.6rem',
                background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
                border: 'none',
                borderRadius: '999px',
                color: '#0a1628',
                fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 6px 18px rgba(0,212,255,0.28)',
                transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.03)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 212, 255, 0.45), 0 6px 18px rgba(0,212,255,0.28)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,212,255,0.28)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Close
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default DownloadModal;

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

  var title = (item && item.title) || 'Untitled';
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
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 70,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--surface, #112240)',
          color: 'var(--text, #e0f2fe)',
          border: '1px solid var(--border, #1c3a5e)',
          borderRadius: '14px',
          padding: '1.4rem 1.4rem 1.2rem',
          boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div
              aria-hidden="true"
              style={{
                width: '44px', height: '44px', flexShrink: 0,
                borderRadius: '10px',
                background: 'rgba(0, 212, 255, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent, #00d4ff)',
                fontSize: '20px',
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
              width: '32px', height: '32px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #1c3a5e)',
              color: 'var(--text, #e0f2fe)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >&times;</button>
        </div>

        {/* Body: size pill, error notice, or queued confirmation */}
        <div
          style={{
            marginTop: '1.1rem',
            padding: '1rem 1.1rem',
            background: 'var(--bg, #0a1628)',
            border: '1px solid var(--border, #1c3a5e)',
            borderRadius: '10px',
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
                  padding: '0.55rem 1.4rem',
                  background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
                  border: 'none',
                  borderRadius: '999px',
                  color: '#0a1628',
                  fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 212, 255, 0.4)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
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
                padding: '0.55rem 1.4rem',
                background: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
                border: 'none',
                borderRadius: '999px',
                color: '#0a1628',
                fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 212, 255, 0.4)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DownloadModal;

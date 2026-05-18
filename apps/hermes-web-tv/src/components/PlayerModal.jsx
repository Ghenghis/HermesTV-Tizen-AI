import React from 'react';
import { SkeletonBlock } from './Skeleton.jsx';

// PlayerModal — shown after /api/play returns a ticket. Renders the item
// title, provider chip, resolution badge, source-health dot, and a video
// surface. Stream URL is never embedded — we hit the ticket's
// `stream_endpoint` and either get bytes (Phase 4) or a 503 explaining
// that the operator hasn't wired the streaming proxy yet.
//
// Chrome 76 / Tizen 6.5 safety: no `?.`, no `??`, no template literals
// for anything you couldn't write as `+` concat (React JSX exception OK).

function fmtExpiresIn(expiresAtIso) {
  if (!expiresAtIso) { return '—'; }
  var ms = new Date(expiresAtIso).getTime() - Date.now();
  if (ms <= 0) { return 'expired'; }
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  s = s - (m * 60);
  return m + ':' + (s < 10 ? '0' + s : s);
}

function providerColor(pid) {
  if (pid === 'apollo_group') { return '#1f6feb'; }
  if (pid === 'xtremehd') { return '#e94560'; }
  if (pid === 'iptv-org') { return '#00d4aa'; }
  if (pid === 'jellyfin') { return '#9b59d0'; }
  return '#8b949e';
}

function PlayerModal(props) {
  var isOpen = props.isOpen;
  var ticket = props.ticket;
  var error = props.error;
  var onClose = props.onClose;

  // Live "expires in M:SS" tick — re-renders every 5s.
  var tickResult = React.useState(0);
  var setTick = tickResult[1];
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    var id = setInterval(function() { setTick(function(n) { return n + 1; }); }, 5000);
    return function() { clearInterval(id); };
  }, [isOpen]);

  // Escape closes the modal.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 10009) {
        e.preventDefault();
        if (onClose) { onClose(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  // Stream surface — fetch the ticket's stream_endpoint and surface the
  // server-side state. For now (Phase 3) the endpoint returns 503 with a
  // friendly message; the player gracefully shows that to the operator.
  var streamStateResult = React.useState({ status: 'idle', message: '' });
  var streamState = streamStateResult[0];
  var setStreamState = streamStateResult[1];

  React.useEffect(function() {
    if (!ticket || !ticket.stream_endpoint) { return undefined; }
    var cancelled = false;
    setStreamState({ status: 'loading', message: 'Connecting to stream...' });
    fetch(ticket.stream_endpoint).then(function(r) {
      if (cancelled) { return; }
      if (r.ok) {
        setStreamState({ status: 'streaming', message: 'Stream ready' });
        return;
      }
      r.json().then(function(j) {
        if (cancelled) { return; }
        if (r.status === 503) {
          setStreamState({
            status: 'pending_operator',
            message: (j && j.message) ||
              'Player pipeline is being wired. Paste provider credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md',
          });
        } else {
          setStreamState({ status: 'error', message: (j && j.message) || ('HTTP ' + r.status) });
        }
      }).catch(function() {
        if (!cancelled) {
          setStreamState({ status: 'error', message: 'HTTP ' + r.status });
        }
      });
    }).catch(function(err) {
      if (cancelled) { return; }
      setStreamState({ status: 'error', message: (err && err.message) || 'network error' });
    });
    return function() { cancelled = true; };
  }, [ticket]);

  var item = (ticket && ticket.item) || {};
  var provider = (ticket && ticket.provider) || {};
  var pid = provider.provider_id || '';
  var pColor = providerColor(pid);
  var healthDot = '#888';
  var healthStatus = (provider.source_health && provider.source_health.status) || 'unknown';
  if (healthStatus === 'ok') { healthDot = '#22c55e'; }
  else if (healthStatus === 'degraded') { healthDot = '#e3b341'; }
  else if (healthStatus === 'down' || healthStatus === 'not_configured') { healthDot = '#ef4444'; }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={function(e) { if (e.target === e.currentTarget && onClose) { onClose(); } }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '92vh',
          backgroundColor: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '12px',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border, #30363d)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>
              {error ? 'Playback failed' : (item.title || 'Now Playing')}
            </span>
            {item.resolution && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e5a00d', border: '1px solid #e5a00d', borderRadius: '3px', padding: '1px 5px' }}>
                {item.resolution}
              </span>
            )}
            {item.hdr_format && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: 'linear-gradient(90deg,#e5a00d,#e50914)', borderRadius: '3px', padding: '1px 5px' }}>
                HDR
              </span>
            )}
            {pid && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: pColor, borderRadius: '3px', padding: '1px 6px' }}>
                {provider.display_name || pid}
              </span>
            )}
            <span title={'Source health: ' + healthStatus} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: healthDot }} />
            {ticket && ticket.expires_at && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8b949e)', marginLeft: '0.5rem' }}>
                Ticket expires in {fmtExpiresIn(ticket.expires_at)}
              </span>
            )}
          </div>
          <button
            tabIndex={0}
            autoFocus
            onClick={onClose}
            aria-label="Close player"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted, #8b949e)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.6rem',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', minHeight: '320px' }}>
          {error && (
            <div style={{ textAlign: 'center', maxWidth: '520px' }}>
              <div style={{ fontSize: '2rem', color: '#ef4444', marginBottom: '0.75rem' }}>&#x26A0;</div>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Could not start playback</div>
              <div style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem' }}>{error}</div>
            </div>
          )}
          {!error && streamState.status === 'streaming' && (
            <video
              controls
              autoPlay
              style={{ width: '100%', maxHeight: '72vh', borderRadius: '6px', background: '#000' }}
              src={ticket && ticket.stream_endpoint}
            />
          )}
          {!error && streamState.status !== 'streaming' && (
            <div style={{ width: '100%', maxWidth: '880px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              {/* 16:9 skeleton player frame — Mom never sees a blank rectangle
                  while the play-ticket round-trip runs. The shimmer keeps
                  the modal feeling alive even when the backend takes a
                  second to return. */}
              {(streamState.status === 'loading' || streamState.status === 'idle') && !ticket && (
                <SkeletonBlock width="100%" height={0} radius="10px" style={{ paddingBottom: '56.25%', height: 0 }} />
              )}
              {(streamState.status === 'loading' || streamState.status === 'idle') && ticket && (
                <SkeletonBlock width="100%" height={0} radius="10px" style={{ paddingBottom: '56.25%', height: 0 }} />
              )}
              {(streamState.status === 'pending_operator' || streamState.status === 'error') && (
                <div style={{ textAlign: 'center', maxWidth: '560px' }}>
                  <div style={{ fontSize: '2.25rem', color: streamState.status === 'pending_operator' ? '#e3b341' : 'var(--accent, #1f6feb)', marginBottom: '0.75rem' }}>
                    {streamState.status === 'pending_operator' ? '🔧' : '⚠'}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    {streamState.status === 'pending_operator' && 'Stream pipeline pending'}
                    {streamState.status === 'error' && 'Stream unavailable'}
                  </div>
                  <div style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {streamState.message}
                  </div>
                </div>
              )}
              {(streamState.status === 'loading' || streamState.status === 'idle') && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem', textAlign: 'center' }}
                >
                  {streamState.status === 'loading' ? (streamState.message || 'Preparing stream…') : 'Requesting playback ticket…'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlayerModal;

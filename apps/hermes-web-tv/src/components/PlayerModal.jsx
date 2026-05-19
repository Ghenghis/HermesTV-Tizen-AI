import React from 'react';
import { SkeletonBlock } from './Skeleton.jsx';
import ChromecastButton from './ChromecastButton.jsx';
import useWatchProgress from '../hooks/useWatchProgress.js';

// PlayerModal — shown after /api/play returns a ticket. Renders the item
// title, provider chip, resolution badge, source-health dot, and a video
// surface. Stream URL is never embedded — we hit the ticket's
// `stream_endpoint` and either get bytes (Phase 4) or a 503 explaining
// that the operator hasn't wired the streaming proxy yet.
//
// Wired surfaces:
//   - ChromecastButton in the header toolbar. Auto-hides on Tizen (no
//     window.chrome.cast) via its internal availability check.
//   - "Multi" button (live channels only) — opens MultiviewModal so the
//     user can flip from single-stream into 2-4 simultaneous tiles.
//   - useWatchProgress — every 5s of playback the current position is
//     persisted to watchHistoryStore so the Continue Watching rail (built
//     by the parallel agent) and the CatalogCard progress bar can render.
//
// Chrome 76 / Tizen 6.5 safety: no `?.`, no `??`, no template literals
// for anything you couldn't write as `+` concat (React JSX exception OK).

// Media type from URL — feeds the Chromecast receiver so the right
// HLS / progressive pipeline is selected on the cast device.
function mediaTypeFromUrl(url) {
  if (!url || typeof url !== 'string') { return 'video/mp4'; }
  var lower = url.toLowerCase();
  if (lower.indexOf('.m3u8') !== -1) { return 'application/vnd.apple.mpegurl'; }
  if (lower.indexOf('.mpd') !== -1) { return 'application/dash+xml'; }
  return 'video/mp4';
}

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
  // Optional — App.jsx passes profile.profile_id so useWatchProgress can
  // key watch_history rows per-profile. Falls back to 'shared' so the hook
  // still records something for unauthenticated dev sessions.
  var profileId = props.profileId || 'shared';
  // Optional — App.jsx passes a callback that opens MultiviewModal. We
  // hide the Multiview button when this prop is missing so older callers
  // don't show a broken button.
  var onOpenMultiview = props.onOpenMultiview;

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

  // Watch progress — every 5s the throttled recordTick persists the
  // current video.currentTime to watchHistoryStore. The hook flushes the
  // last position on unmount so the Continue Watching rail always sees
  // the user's true exit point even when they close via Tizen Back.
  var watchDurationState = React.useState(0);
  var watchDuration = watchDurationState[0];
  var setWatchDuration = watchDurationState[1];
  var watchHook = useWatchProgress({
    profileId: profileId,
    item: item && item.id ? { id: item.id, type: item.type || item.item_type || 'movies', title: item.title || '' } : null,
    durationSec: watchDuration,
  });
  var recordTick = watchHook.recordTick;

  // Ref to the <video> element so the onTimeUpdate handler below can read
  // currentTime + duration. We don't use a controlled component because
  // Chrome 76 doesn't react reliably to React's currentTime prop changes.
  var videoRef = React.useRef(null);

  // onTimeUpdate fires ~4 times/sec on every browser; the hook throttles
  // to one IDB write every 5s so we don't thrash the flash.
  function handleTimeUpdate() {
    var v = videoRef.current;
    if (!v) { return; }
    if (typeof v.duration === 'number' && v.duration > 0 && v.duration !== watchDuration) {
      setWatchDuration(v.duration);
    }
    if (typeof v.currentTime === 'number') {
      recordTick(v.currentTime);
    }
  }

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
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(5,8,14,0.86)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '92vh',
          backgroundColor: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
      >
        {/* Header — gradient surface-raised → surface */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border, #30363d)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))', letterSpacing: '0.01em' }}>
              {error ? 'Playback failed' : (item.title || 'Now Playing')}
            </span>
            {item.resolution && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e5a00d', border: '1px solid #e5a00d', borderRadius: '999px', padding: '2px 8px', background: 'rgba(229,160,13,0.08)' }}>
                {item.resolution}
              </span>
            )}
            {item.hdr_format && (
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#e5a00d,#e50914)', borderRadius: '999px', padding: '2px 8px', boxShadow: '0 0 6px rgba(229,160,13,0.4) inset' }}>
                HDR
              </span>
            )}
            {pid && (
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: pColor, borderRadius: '999px', padding: '2px 9px' }}>
                {provider.display_name || pid}
              </span>
            )}
            <span title={'Source health: ' + healthStatus} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: healthDot, boxShadow: '0 0 6px ' + healthDot + '99' }} />
            {ticket && ticket.expires_at && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8b949e)', marginLeft: '0.5rem' }}>
                Ticket expires in {fmtExpiresIn(ticket.expires_at)}
              </span>
            )}
          </div>
          {/* Toolbar — Cast button (auto-hides on Tizen), Multiview entry
              for live channels, and the close button. Kept compact so the
              header stays single-row on narrow shells. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Multiview entry — live channels only. Hidden when the
                parent didn't wire onOpenMultiview, so legacy callsites
                don't show a dead button. */}
            {onOpenMultiview && item && item.type === 'live' && (
              <button
                type="button"
                tabIndex={0}
                onClick={function() { onOpenMultiview(item); }}
                aria-label="Open Multiview"
                title="Multiview — watch this with up to 3 more channels"
                style={{
                  height: '36px',
                  padding: '0 0.85rem',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px solid var(--border, #30363d)',
                  background: 'transparent',
                  color: 'var(--text, #e6edf3)',
                  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'transform 160ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), background-color 160ms ease',
                }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                &#x25A6; Multi
              </button>
            )}

            {/* Cast button — internal availability check hides this on
                Tizen (no window.chrome.cast). mediaType derived from the
                stream URL extension. */}
            <ChromecastButton
              mediaUrl={(ticket && ticket.stream_endpoint) || ''}
              mediaTitle={item && item.title ? item.title : ''}
              mediaType={mediaTypeFromUrl(ticket && ticket.stream_endpoint)}
              posterUrl={item && (item.poster_url || (item.metadata && item.metadata.poster_url)) || ''}
            />

            <button
              tabIndex={0}
              autoFocus
              onClick={onClose}
              aria-label="Close player"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text, #e6edf3)',
                fontSize: '1.2rem',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
                lineHeight: 1,
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              &times;
            </button>
          </div>
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
              ref={videoRef}
              controls
              autoPlay
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleTimeUpdate}
              style={{ width: '100%', maxHeight: '72vh', borderRadius: '14px', background: '#000', boxShadow: '0 12px 32px rgba(0,0,0,0.55)' }}
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

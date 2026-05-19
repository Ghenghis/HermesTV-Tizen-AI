import React from 'react';
import MultiviewPlayer from './MultiviewPlayer.jsx';
import MultiviewLayoutPicker from './MultiviewLayoutPicker.jsx';
import { SkeletonRow } from './Skeleton.jsx';
import * as watchHistoryStore from '../store/watchHistoryStore.js';

// MultiviewModal — full-screen modal that wraps the shipped MultiviewPlayer
// + MultiviewLayoutPicker so the user can watch 2-4 channels simultaneously.
//
// On open we load the user's last 4 watched LIVE channels from
// watchHistoryStore.listRecent(profile.id, ...) and look each one up in the
// in-memory catalog so we can resolve a stream_url + title. Items without a
// resolvable stream are skipped — empty slots render as dashed "Add stream"
// placeholders so the user can still launch the modal with 0-1 channels.
//
// Layout state is local to the modal. Default is "1+1" because the lightest
// GPU load is the safest first-paint on every tier; the user can switch up
// to "2x2" on enhanced QN-class panels via the picker.
//
// Tizen 6.5 / Chrome 76 safe.

function MultiviewModal(props) {
  var isOpen = props.isOpen;
  var profileId = props.profileId;
  var catalog = props.catalog || [];
  var tier = props.tier || 'enhanced';
  var onClose = props.onClose;
  var onStreamSelect = props.onStreamSelect;  // (stream) parent typically opens PlayerModal

  // Layout selection + audio source — local UI state.
  var layoutResult = React.useState('1+1');
  var layout = layoutResult[0];
  var setLayout = layoutResult[1];

  var audioResult = React.useState(null);
  var audioStreamId = audioResult[0];
  var setAudioStreamId = audioResult[1];

  // Streams come from a watchHistoryStore lookup + catalog join.
  // state: 'idle' | 'loading' | 'ready'.
  var streamsResult = React.useState({ status: 'idle', streams: [] });
  var streamData = streamsResult[0];
  var setStreamData = streamsResult[1];

  // Esc / Tizen Back closes the modal.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 10009) {
        e.preventDefault();
        if (onClose) { onClose(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  // Resolve last 4 watched channels into streams on open. Any history entry
  // that we can't find a stream_url for is dropped (better to show 2 tiles
  // than to render a tile with a broken URL).
  React.useEffect(function() {
    if (!isOpen || !profileId) { return undefined; }
    var cancelled = false;
    setStreamData({ status: 'loading', streams: [] });
    watchHistoryStore.listRecent(profileId, 8).then(function(rows) {
      if (cancelled) { return; }
      var streams = [];
      for (var i = 0; i < rows.length && streams.length < 4; i++) {
        var row = rows[i];
        // Prefer live channels — Multiview is designed for simultaneous
        // live viewing; movies/series in the same view feels off.
        // However, we don't hard-gate: if the only history is movies, we'll
        // still surface them so the modal isn't empty on first use.
        var item = null;
        for (var j = 0; j < catalog.length; j++) {
          if (String(catalog[j].id) === String(row.item_id)) {
            item = catalog[j];
            break;
          }
        }
        if (!item) { continue; }
        var streamUrl = item.stream_url || (item.metadata && item.metadata.stream_url) || '';
        if (!streamUrl) { continue; }
        streams.push({
          id: String(item.id),
          title: item.title || row.title || 'Untitled',
          url: streamUrl,
          channel_id: item.channel_id || item.tvg_id || '',
        });
      }
      setStreamData({ status: 'ready', streams: streams });
      if (streams.length > 0 && !audioStreamId) {
        setAudioStreamId(streams[0].id);
      }
    }).catch(function() {
      if (cancelled) { return; }
      setStreamData({ status: 'ready', streams: [] });
    });
    return function() { cancelled = true; };
  // audioStreamId intentionally omitted — we only want to seed audio once on
  // open, otherwise re-running this effect would steal the user's audio pick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profileId, catalog]);

  if (!isOpen) { return null; }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Multiview player"
      onClick={function(e) { if (e.target === e.currentTarget && onClose) { onClose(); } }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
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
          maxWidth: '1400px',
          height: '92vh',
          backgroundColor: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 'var(--radius-lg, 20px)',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
      >
        {/* Header */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexShrink: 0,
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))', letterSpacing: '0.01em' }}>
              Multiview
            </span>
            {streamData.status === 'ready' && (
              <span
                style={{
                  fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                  color: 'var(--muted, #8b949e)',
                }}
              >
                {streamData.streams.length} {streamData.streams.length === 1 ? 'stream' : 'streams'} from recent history
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <MultiviewLayoutPicker
              activeLayout={layout}
              onLayoutChange={setLayout}
              tier={tier}
            />
            <button
              type="button"
              tabIndex={0}
              onClick={onClose}
              aria-label="Close Multiview"
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
                transition: 'transform 160ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), background-color 160ms ease',
                lineHeight: 1,
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0.75rem' }}>
          {(streamData.status === 'idle' || streamData.status === 'loading') && (
            <div
              role="status"
              aria-live="polite"
              aria-label="Loading recent channels"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                padding: '0.5rem',
                backgroundColor: 'var(--bg, #0d1117)',
                borderRadius: 'var(--radius-md, 12px)',
              }}
            >
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {streamData.status === 'ready' && streamData.streams.length === 0 && (
            <div
              role="status"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: 'var(--muted, #8b949e)',
                textAlign: 'center',
                padding: '2rem',
              }}
            >
              <div style={{ fontSize: '2rem' }}>&#x1F4FA;</div>
              <div style={{ fontWeight: 600, fontSize: 'calc(1rem * var(--font-scale, 1))', color: 'var(--text, #e6edf3)' }}>
                Nothing in recent history yet
              </div>
              <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', maxWidth: '480px' }}>
                Multiview pulls your last four watched channels. Watch a few channels and reopen this view to see them grouped here.
              </div>
            </div>
          )}

          {streamData.status === 'ready' && streamData.streams.length > 0 && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <MultiviewPlayer
                streams={streamData.streams}
                layout={layout}
                audioStreamId={audioStreamId}
                onAudioChange={setAudioStreamId}
                onStreamSelect={onStreamSelect}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MultiviewModal;

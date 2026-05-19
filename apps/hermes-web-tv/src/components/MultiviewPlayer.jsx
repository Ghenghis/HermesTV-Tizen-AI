// MultiviewPlayer — render 2-4 simultaneous video streams in one of four
// pre-defined arrangements with a single audio source at a time.
//
// UX mirrors IPTV Player Zero's Multiview PiP layer (see
//   G:\Github\IPTV_Player_Zero\docs\USER_JOURNEYS.md Journey 7
//   G:\Github\IPTV_Player_Zero\docs\FRONTEND_COMPONENTS.md MULTIVIEW node)
// adapted for HermesTV's web shell and Tizen 6.5 / Chrome 76 constraints.
//
// ── PERFORMANCE / TIER POLICY ────────────────────────────────────────────
// Four simultaneous HLS streams can blow the GPU budget on QN85 / un-class
// Tizen panels (single HEVC decoder slot in many cases — the second-to-
// fourth tile fall back to software decode and stall the shell). The
// MultiviewLayoutPicker companion component hard-hides the 2×2 button
// when `tier === 'degraded'`. The recommended layouts on un-degraded
// hardware are "1+1" and "1+2" only; "1+3" works but is marginal; "2x2"
// is reserved for the enhanced tier (QN-class QLED).
//
// ── PROPS ────────────────────────────────────────────────────────────────
// streams        Array of { id, title, url, channel_id }. Max 4 used. Any
//                slot beyond layout.maxStreams is ignored. Missing slots
//                render as a dashed "Add stream" placeholder.
// layout         "2x2" | "1+3" | "1+2" | "1+1". Defaults to "1+1".
// onStreamSelect (stream) => void — fired when a tile is selected via
//                Enter / click. Use this in the parent to swap a tile to
//                full-screen single-stream playback (PlayerModal).
// audioStreamId  Which stream provides the audible audio. All other
//                tiles render with `muted` ON. Default: first stream.
// onAudioChange  (streamId) => void — fired when the user presses 'M'
//                on a focused tile to claim it as the audio source.
// onAddSlot      (slotIndex) => void — fired when the user clicks a
//                dashed empty placeholder. Use this to open a stream
//                chooser drawer in the parent.
//
// ── KEYBOARD ─────────────────────────────────────────────────────────────
//   Tab           cycle between tiles
//   Enter / Space select (onStreamSelect)
//   M             set the focused tile as the audio source
//   Esc           parent handles via cascade — not bound here
//
// ── STYLE TOKENS ─────────────────────────────────────────────────────────
// All rounded corners use --radius-md, the focus ring uses --shadow-focus
// (see src/index.css for the recipe), and hover lifts via transform:
// scale(1.02) on a 180ms --ease-out curve. The active-audio badge sits
// bottom-right with --gradient-accent for the label chip background.

import React from 'react';
import useHlsStream from '../hooks/useHlsStream.js';

// Per-layout slot count — also drives the empty-slot count for "Add stream".
function getMaxStreamsForLayout(layout) {
  if (layout === '2x2') { return 4; }
  if (layout === '1+3') { return 4; }
  if (layout === '1+2') { return 3; }
  // "1+1" and any unknown fallback land here.
  return 2;
}

// Per-layout per-slot CSS Grid placement. The first entry in each array
// is the "large" tile; the rest are smaller. Coordinates are 1-based row /
// column lines in a 4-col × 4-row grid (CSS Grid).
function getSlotPositions(layout) {
  if (layout === '2x2') {
    return [
      { gridArea: '1 / 1 / 3 / 3' },
      { gridArea: '1 / 3 / 3 / 5' },
      { gridArea: '3 / 1 / 5 / 3' },
      { gridArea: '3 / 3 / 5 / 5' },
    ];
  }
  if (layout === '1+3') {
    return [
      { gridArea: '1 / 1 / 5 / 3' },
      { gridArea: '1 / 3 / 2 / 5' },
      { gridArea: '2 / 3 / 4 / 5' },
      { gridArea: '4 / 3 / 5 / 5' },
    ];
  }
  if (layout === '1+2') {
    return [
      { gridArea: '1 / 1 / 5 / 3' },
      { gridArea: '1 / 3 / 3 / 5' },
      { gridArea: '3 / 3 / 5 / 5' },
    ];
  }
  // "1+1"
  return [
    { gridArea: '1 / 1 / 5 / 3' },
    { gridArea: '1 / 3 / 5 / 5' },
  ];
}

// ── Tile (single video panel) ────────────────────────────────────────────
// Internal — not exported. Owns one <video> + one useHlsStream instance.
function MultiviewTile(props) {
  var stream = props.stream;
  var slotIndex = props.slotIndex;
  var isAudioActive = props.isAudioActive;
  var onSelect = props.onSelect;
  var onClaimAudio = props.onClaimAudio;
  var onAddSlot = props.onAddSlot;
  var positionStyle = props.positionStyle;

  // Always create the ref even for empty slots — React requires hook
  // call order to be stable across renders. The hook below is a no-op
  // when url is falsy so this is safe.
  var videoRef = React.useRef(null);
  var url = stream ? stream.url : '';
  var hlsState = useHlsStream(url, videoRef);

  // Track muted-ness via the videoEl directly. We never mutate the
  // `muted` attribute via React props because Chrome 76 disagrees with
  // React's controlled-component muted semantics for inline video
  // (it ignores a JSX `muted={false}` change without an autoplay nudge).
  React.useEffect(function() {
    var v = videoRef.current;
    if (!v) { return undefined; }
    v.muted = !isAudioActive;
    // Re-trigger play() when audio becomes active or when the URL
    // changes. Browsers throttle play() on unmute without a user
    // gesture for non-muted media — but since the tile was originally
    // muted, swapping muted→false mid-stream is allowed (see HTML spec
    // §autoplay rules).
    if (v.paused) {
      var p = v.play();
      // play() returns a promise in modern engines; swallow the
      // rejection so we don't log "autoplay blocked" exceptions on
      // initial mount before the user has interacted.
      if (p && typeof p.then === 'function') {
        p.then(function() { /* ok */ }).catch(function() { /* ok */ });
      }
    }
    return undefined;
  }, [isAudioActive, url]);

  // ── Empty slot ─────────────────────────────────────────────────────────
  if (!stream) {
    return (
      <button
        type="button"
        tabIndex={0}
        aria-label={'Add stream to slot ' + (slotIndex + 1)}
        onClick={function() { if (onAddSlot) { onAddSlot(slotIndex); } }}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onAddSlot) { onAddSlot(slotIndex); }
          }
        }}
        onFocus={function(e) {
          e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px var(--accent, #00d4ff))';
          e.currentTarget.style.transform = 'scale(1.02)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        style={Object.assign({}, positionStyle, {
          background: 'rgba(255,255,255,0.02)',
          border: '2px dashed var(--border, #30363d)',
          borderRadius: 'var(--radius-md, 12px)',
          color: 'var(--muted, #8b949e)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          outline: 'none',
          transition: 'transform 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), box-shadow 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), border-color 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1))',
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          fontWeight: '600',
          minHeight: '120px',
        })}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: 'calc(2.5rem * var(--font-scale, 1))',
            fontWeight: '300',
            lineHeight: 1,
            color: 'var(--accent, #1f6feb)',
          }}
        >
          +
        </span>
        <span>Add stream</span>
      </button>
    );
  }

  // ── Active tile ────────────────────────────────────────────────────────
  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={(stream.title || stream.id) + (isAudioActive ? ' (audio active)' : '') + '. Press Enter to select, M to claim audio.'}
      onClick={function() { if (onSelect) { onSelect(stream); } }}
      onKeyDown={function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (onSelect) { onSelect(stream); }
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          if (onClaimAudio) { onClaimAudio(stream); }
        }
      }}
      onMouseEnter={function(e) {
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={function(e) {
        e.currentTarget.style.transform = 'scale(1)';
      }}
      onFocus={function(e) {
        e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px var(--accent, #00d4ff))';
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.dataset.focused = 'true';
      }}
      onBlur={function(e) {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.dataset.focused = '';
      }}
      style={Object.assign({}, positionStyle, {
        position: 'relative',
        background: '#000',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden',
        cursor: 'pointer',
        outline: 'none',
        transition: 'transform 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), box-shadow 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1))',
        boxShadow: isAudioActive
          ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28)), inset 0 0 0 2px var(--accent, #1f6feb)'
          : 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.18))',
        minHeight: '120px',
      })}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Always start muted — useEffect above flips to unmuted when the
        // tile is the audio source. This avoids the autoplay block that
        // Chrome 76+ enforces on unmuted media that hasn't been clicked.
        muted
        // Disabled controls — Multiview is a "glance" view; full controls
        // come from clicking through to a single-stream PlayerModal.
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#000',
          display: 'block',
        }}
      />

      {/* Loading / error overlays. The tile background is already black
          so there's no flash before the HLS engine attaches — we just
          surface state textually for accessibility. */}
      {hlsState.loading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--muted, #8b949e)',
            fontSize: 'calc(0.75rem * var(--font-scale, 1))',
            fontWeight: '600',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            padding: '0.3rem 0.7rem',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 'var(--radius-pill, 999px)',
          }}
        >
          Loading
        </div>
      )}
      {hlsState.error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#f85149',
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            fontWeight: '600',
            padding: '0.4rem 0.7rem',
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 'var(--radius-md, 12px)',
            maxWidth: '80%',
            textAlign: 'center',
          }}
        >
          {hlsState.error}
        </div>
      )}

      {/* Channel + title chip — bottom-left. Gradient-accent matches the
          design language of the rest of the shell (CatalogCard, etc.). */}
      <div
        style={{
          position: 'absolute',
          left: '0.55rem',
          bottom: '0.55rem',
          maxWidth: '78%',
          padding: '0.3rem 0.65rem',
          background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
          color: '#ffffff',
          borderRadius: 'var(--radius-pill, 999px)',
          fontSize: 'calc(0.7rem * var(--font-scale, 1))',
          fontWeight: '700',
          letterSpacing: '0.02em',
          boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={(stream.channel_id ? stream.channel_id + ' — ' : '') + (stream.title || '')}
      >
        {stream.channel_id ? <span style={{ opacity: 0.85 }}>{stream.channel_id}</span> : null}
        {stream.channel_id && stream.title ? <span style={{ opacity: 0.6, margin: '0 0.4rem' }}> · </span> : null}
        {stream.title ? <span>{stream.title}</span> : null}
      </div>

      {/* Audio-active badge — bottom-right. Only visible when this tile
          is the audio source. The speaker glyph is unicode so it
          renders consistently on Tizen WebKit without a font fetch. */}
      {isAudioActive && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '0.55rem',
            bottom: '0.55rem',
            padding: '0.25rem 0.55rem',
            background: 'rgba(0,0,0,0.7)',
            color: '#ffffff',
            borderRadius: 'var(--radius-pill, 999px)',
            fontSize: 'calc(0.65rem * var(--font-scale, 1))',
            fontWeight: '700',
            letterSpacing: '0.05em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <span>&#x1F50A;</span>
          <span>Active</span>
        </div>
      )}
    </div>
  );
}

// ── MultiviewPlayer (public) ─────────────────────────────────────────────
function MultiviewPlayer(props) {
  var streams = Array.isArray(props.streams) ? props.streams : [];
  var layout = props.layout || '1+1';
  var onStreamSelect = props.onStreamSelect;
  var audioStreamId = props.audioStreamId;
  var onAudioChange = props.onAudioChange;
  var onAddSlot = props.onAddSlot;

  var maxStreams = getMaxStreamsForLayout(layout);
  var positions = getSlotPositions(layout);

  // Default the audio source to the first stream if the parent didn't
  // specify one (and a stream is actually present). This guarantees one
  // tile is always producing audio so the user never opens an "all
  // silent" Multiview.
  var resolvedAudioId = audioStreamId;
  if (!resolvedAudioId && streams.length > 0) {
    resolvedAudioId = streams[0].id;
  }

  // Build slot data — up to maxStreams entries. Missing entries render
  // as the dashed "Add stream" placeholder.
  var slots = [];
  for (var i = 0; i < maxStreams; i++) {
    slots.push(streams[i] || null);
  }

  function handleClaimAudio(stream) {
    if (onAudioChange && stream && stream.id) {
      onAudioChange(stream.id);
    }
  }

  return (
    <div
      role="region"
      aria-label="Multiview player"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: '0.5rem',
        padding: '0.5rem',
        background: 'var(--bg, #0d1117)',
        boxSizing: 'border-box',
        minHeight: '320px',
      }}
    >
      {slots.map(function(stream, idx) {
        var isAudioActive = !!(stream && resolvedAudioId === stream.id);
        return (
          <MultiviewTile
            key={stream ? ('stream-' + stream.id) : ('empty-' + idx)}
            stream={stream}
            slotIndex={idx}
            isAudioActive={isAudioActive}
            onSelect={onStreamSelect}
            onClaimAudio={handleClaimAudio}
            onAddSlot={onAddSlot}
            positionStyle={positions[idx]}
          />
        );
      })}
    </div>
  );
}

export default MultiviewPlayer;
export { MultiviewPlayer, getMaxStreamsForLayout, getSlotPositions };

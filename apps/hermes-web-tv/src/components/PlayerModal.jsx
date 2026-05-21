import React from 'react';
import { SkeletonBlock } from './Skeleton.jsx';
import ChromecastButton from './ChromecastButton.jsx';
import TimeShiftOverlay from './TimeShiftOverlay.jsx';
import useWatchProgress from '../hooks/useWatchProgress.js';
import useHlsStream from '../hooks/useHlsStream.js';
import { fetchEPG } from '../api/epgClient.js';
import { buildApiUrl } from '../api/hermesApi.js';
import playbackPositionStore from '../store/playbackPositionStore.js';

// PlayerModal — TiviMate / Plex / IPTV Smarters class single-stream
// player overlay. Built on top of the existing /api/play ticket flow.
//
// Surface (auto-hiding, IDLE_MS after last interaction):
//   - Top bar:    channel logo + title + now/next EPG + lock toggle + close
//   - Center:     play/pause, ±10s seek (VOD) or ch up/down (live)
//   - Bottom bar: progress / live duration, volume, audio/sub/quality dropdowns,
//                 PiP, cast, fullscreen, settings, multiview, record
//   - Left rail:  channel zap list (collapsed; hover or focus to expand)
//
// Mom-mode behaviour:
//   - Hides the audio / subtitle / quality / cast dropdowns by default
//     (user can flip them in via a single "Advanced" toggle inside settings)
//   - 1.4× font + 56×56 minimum touch targets
//
// Tizen 6.5 / Chrome 76 compatibility:
//   - No optional chaining, no nullish coalescing, no template literals
//     for anything beyond JSX, no arrow functions in component bodies.
//   - hls.js loaded lazily via the useHlsStream hook (no top-level import).
//   - audioTracks / textTracks / pictureInPictureEnabled / CastSDK all
//     probed at runtime and skipped silently when absent.

var IDLE_MS = 3000;

// Wave-15 — auto-retry on 503 stream_temporarily_unavailable.
var MAX_RETRIES = 3;
var RETRY_DELAY_MS = 5000;

// Media type from URL — feeds the Chromecast receiver so the right
// HLS / progressive pipeline is selected on the cast device.
function mediaTypeFromUrl(url) {
  if (!url || typeof url !== 'string') { return 'video/mp4'; }
  var lower = url.toLowerCase();
  if (lower.indexOf('.m3u8') !== -1) { return 'application/vnd.apple.mpegurl'; }
  if (lower.indexOf('.mpd') !== -1) { return 'application/dash+xml'; }
  return 'video/mp4';
}

function urlLooksHls(url) {
  if (!url || typeof url !== 'string') { return false; }
  return url.toLowerCase().indexOf('.m3u8') !== -1;
}

function resolveTicketEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') { return ''; }
  if (/^https?:\/\//i.test(endpoint)) { return endpoint; }
  return buildApiUrl(endpoint);
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

function fmtSeconds(s) {
  if (typeof s !== 'number' || !isFinite(s) || s < 0) { return '0:00'; }
  s = Math.floor(s);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s - h * 3600) / 60);
  var sec = s - h * 3600 - m * 60;
  var mm = m < 10 && h > 0 ? '0' + m : '' + m;
  var ss = sec < 10 ? '0' + sec : '' + sec;
  if (h > 0) { return h + ':' + mm + ':' + ss; }
  return mm + ':' + ss;
}

function fmtDurationCompact(sec) {
  if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) { return '0s'; }
  sec = Math.floor(sec);
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec - h * 3600) / 60);
  var s = sec - h * 3600 - m * 60;
  if (h > 0) { return h + 'h ' + m + 'm'; }
  if (m > 0) { return m + 'm ' + s + 's'; }
  return s + 's';
}

function fmtClock(d) {
  if (!d) { return ''; }
  var h = d.getHours();
  var m = d.getMinutes();
  var ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) { h = 12; }
  return h + ':' + (m < 10 ? '0' + m : '' + m) + ampm;
}

function providerColor(pid) {
  if (pid === 'apollo_group') { return '#1f6feb'; }
  if (pid === 'xtremehd') { return '#e94560'; }
  if (pid === 'iptv-org') { return '#00d4aa'; }
  if (pid === 'jellyfin') { return '#9b59d0'; }
  return '#8b949e';
}

// Small icon helpers — keep the bundle free of an icon library.
function Icon(props) {
  var size = props.size || 22;
  var d = props.d;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

var ICON_PLAY = 'M5 4l14 8-14 8V4z';
var ICON_PAUSE = 'M6 4h4v16H6zM14 4h4v16h-4z';
var ICON_SKIP_BACK = 'M11 19l-9-7 9-7v14zM22 19l-9-7 9-7v14z';
var ICON_SKIP_FWD = 'M13 5l9 7-9 7V5zM2 5l9 7-9 7V5z';
var ICON_CH_UP = 'M5 15l7-7 7 7';
var ICON_CH_DN = 'M19 9l-7 7-7-7';
var ICON_VOL_UP = 'M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14';
var ICON_VOL_MUTE = 'M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6';
var ICON_PIP = 'M19 7h-8v6h8V7zM21 3H3a2 2 0 00-2 2v14a2 2 0 002 2h18a2 2 0 002-2V5a2 2 0 00-2-2z';
var ICON_FULL = 'M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3';
var ICON_FULL_EXIT = 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7';
var ICON_LOCK = 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4';
var ICON_UNLOCK = 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 019.9-1';
var ICON_GEAR = 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 3.6 1.65 1.65 0 009 2.09V2a2 2 0 014 0v.09A1.65 1.65 0 0014 3.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z';
var ICON_CC = 'M21 15a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h14a2 2 0 012 2v6zM7 14h2M11 14h2M15 14h2M7 11h2M11 11h2M15 11h2';
var ICON_AUDIO = 'M3 18v-6a9 9 0 0118 0v6M21 19a2 2 0 01-2 2h-1v-7h3v5zM3 19a2 2 0 002 2h1v-7H3v5z';
var ICON_QUALITY = 'M22 12h-4l-3 9L9 3l-3 9H2';
var ICON_RECORD = 'M12 18a6 6 0 100-12 6 6 0 000 12z';

// Reasonable platform-specific shortcut overlay.
function isTizenRemote(e) {
  return e && (e.keyCode === 10009 || e.key === 'Back' ||
    e.key === 'MediaPlayPause' || e.keyCode === 415 || e.keyCode === 19 ||
    e.keyCode === 416 || e.keyCode === 417);
}

function PlayerModal(props) {
  var isOpen = props.isOpen;
  var ticket = props.ticket;
  var error = props.error;
  var onClose = props.onClose;
  var profileId = props.profileId || 'shared';
  var onOpenMultiview = props.onOpenMultiview;
  var onScheduleRecording = props.onScheduleRecording;
  // NEW props (App.jsx will be patched to pass these). All optional so
  // existing call-sites that don't wire them still get a working modal.
  var profile = props.profile || {};
  var catalog = props.catalog || [];
  var onSwitchItem = props.onSwitchItem; // (item) => void — swaps current ticket via handlePlay
  var onOpenSettings = props.onOpenSettings;
  var online = typeof props.online === 'boolean' ? props.online : true;

  var momMode = !!profile.mom_mode;
  var reducedMotion = !!profile.reduced_motion;
  var fontScale = momMode
    ? Math.max(1.4, profile.font_scale || 1.4)
    : (profile.font_scale || 1);
  var minTouch = momMode ? 56 : 40;

  // ── State ─────────────────────────────────────────────────────────────
  var tickResult = React.useState(0);
  var setTick = tickResult[1];

  var streamStateResult = React.useState({ status: 'idle', message: '' });
  var streamState = streamStateResult[0];
  var setStreamState = streamStateResult[1];

  var watchDurationState = React.useState(0);
  var watchDuration = watchDurationState[0];
  var setWatchDuration = watchDurationState[1];

  var playingState = React.useState(true);
  var playing = playingState[0];
  var setPlaying = playingState[1];

  var currentTimeState = React.useState(0);
  var currentTime = currentTimeState[0];
  var setCurrentTime = currentTimeState[1];

  var volumeState = React.useState(1);
  var volume = volumeState[0];
  var setVolume = volumeState[1];

  var mutedState = React.useState(false);
  var muted = mutedState[0];
  var setMuted = mutedState[1];

  var fullscreenState = React.useState(false);
  var fullscreen = fullscreenState[0];
  var setFullscreen = fullscreenState[1];

  var pipState = React.useState(false);
  var pip = pipState[0];
  var setPip = pipState[1];

  var lockedState = React.useState(false);
  var locked = lockedState[0];
  var setLocked = lockedState[1];

  var idleState = React.useState(false);
  var idle = idleState[0];
  var setIdle = idleState[1];

  var liveStartedAtState = React.useState(0);
  var liveStartedAt = liveStartedAtState[0];
  var setLiveStartedAt = liveStartedAtState[1];

  var openMenuState = React.useState(null); // 'audio' | 'sub' | 'quality' | null
  var openMenu = openMenuState[0];
  var setOpenMenu = openMenuState[1];

  var audioTracksState = React.useState([]);
  var audioTracks = audioTracksState[0];
  var setAudioTracks = audioTracksState[1];

  var textTracksState = React.useState([]);
  var textTracks = textTracksState[0];
  var setTextTracks = textTracksState[1];

  var epgState = React.useState({ now: null, next: null });
  var epg = epgState[0];
  var setEpg = epgState[1];

  var railOpenState = React.useState(false);
  var railOpen = railOpenState[0];
  var setRailOpen = railOpenState[1];

  var showAdvancedState = React.useState(!momMode);
  var showAdvanced = showAdvancedState[0];
  var setShowAdvanced = showAdvancedState[1];

  var streamUrlState = React.useState('');
  var streamUrl = streamUrlState[0];
  var setStreamUrl = streamUrlState[1];

  // Wave-15: auto-retry counter (0..MAX_RETRIES). Bumped on each 503 with
  // status === "stream_temporarily_unavailable", reset whenever the active
  // ticket changes.
  var retryCountState = React.useState(0);
  var retryCount = retryCountState[0];
  var setRetryCount = retryCountState[1];

  // Wave-15: forcibly advance to the next source when the user clicks
  // "Try another source". Increments a counter that re-triggers the
  // stream-resolution effect with a `?source_index=N+1` hint.
  var manualSourceIndexState = React.useState(-1);
  var manualSourceIndex = manualSourceIndexState[0];
  var setManualSourceIndex = manualSourceIndexState[1];

  // ── Refs ──────────────────────────────────────────────────────────────
  var videoRef = React.useRef(null);
  var containerRef = React.useRef(null);
  var idleTimerRef = React.useRef(null);
  // Holds the active retry setTimeout id so a re-mount can cancel it.
  var retryTimerRef = React.useRef(null);
  // Keep "what DaveTV should be doing" separate from the media element's
  // momentary state. Browsers and Tizen can pause during source attach,
  // visibility changes, or HLS recovery without the user pressing Pause.
  var desiredPlaybackRef = React.useRef(true);
  var resumeTimerRef = React.useRef(null);

  var item = (ticket && ticket.item) || {};
  var provider = (ticket && ticket.provider) || {};
  var pid = provider.provider_id || '';
  var pColor = providerColor(pid);
  var isLive = item && item.type === 'live';

  // Native HLS path (Safari/Tizen) — when not native we pass the resolved
  // streamUrl to useHlsStream which dynamically imports hls.js.
  var hlsTarget = urlLooksHls(streamUrl) ? streamUrl : null;
  var hlsState = useHlsStream(hlsTarget, videoRef);
  var hlsLevels = hlsState.levels || [];
  var currentHlsLevel = hlsState.level;

  var watchHook = useWatchProgress({
    profileId: profileId,
    item: item && item.id ? { id: item.id, type: item.type || item.item_type || 'movies', title: item.title || '' } : null,
    durationSec: watchDuration,
  });
  var recordTick = watchHook.recordTick;

  // Resume-seek bookkeeping. We auto-seek to the last-known position at most
  // once per (item open). The ref carries the contentId we've already seeked
  // for so a stream-pipeline reconnect (which may re-fire loadedmetadata)
  // doesn't snap the user back to the resume point after they manually
  // seeked away from it.
  var seekedItemIdRef = React.useRef(null);
  // Reset the resume-seek flag whenever the active item changes so the next
  // (item, profile) pairing gets a fresh chance to resume.
  React.useEffect(function() {
    seekedItemIdRef.current = null;
    // Also reset the wave-15 auto-retry counter + manual source override
    // so a fresh ticket starts with a clean attempt budget.
    setRetryCount(0);
    setManualSourceIndex(-1);
    setPlaying(true);
    desiredPlaybackRef.current = true;
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [item && item.id, profileId]); // eslint-disable-line

  // Flush any pending throttled position writes when the modal closes so the
  // user's last frame survives, e.g., when they hit Close right after a seek.
  React.useEffect(function() {
    return function cleanup() {
      try { playbackPositionStore.flush(); } catch (_e) { /* */ }
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────

  // Re-render every 5s for live duration counter / ticket expiry.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    var id = setInterval(function() { setTick(function(n) { return n + 1; }); }, 1000);
    return function() { clearInterval(id); };
  }, [isOpen]);

  // ── Stream resolution ─────────────────────────────────────────────────
  // Wave-15: the /api/play/:ticket/stream endpoint may return:
  //   - 302 → public URL (iptv-org HLS) — we let the browser follow it
  //   - 200 → rewritten HLS playlist (operator-proxy mode)
  //   - 503 status:"stream_temporarily_unavailable" → ALL sources tried
  //     and failed. We auto-retry up to MAX_RETRIES with a RETRY_DELAY_MS
  //     pause between attempts and show "Trying alternate stream..." UI
  //     instead of the old "Operator must wire credentials" text.
  //   - Other 4xx/5xx → hard error.
  //
  // The retry budget resets when ticket changes (handled in the earlier
  // effect that also resets the resume-seek flag).
  React.useEffect(function() {
    if (!ticket || !ticket.stream_endpoint) { return undefined; }
    var cancelled = false;

    // If a manual source advance was requested, append ?source_index=N to
    // the stream endpoint so the server pins that source first. We keep
    // the .m3u8/.mpd suffix when present.
    var endpoint = resolveTicketEndpoint(ticket.stream_endpoint);
    if (manualSourceIndex >= 0) {
      var sep = endpoint.indexOf('?') === -1 ? '?' : '&';
      endpoint = endpoint + sep + 'source_index=' + manualSourceIndex;
    }

    var attemptMsg = 'Connecting to stream...';
    if (retryCount > 0) {
      attemptMsg = 'Trying alternate stream... (attempt ' + (retryCount + 1) + ' of ' + (MAX_RETRIES + 1) + ')';
    } else if (manualSourceIndex >= 0) {
      attemptMsg = 'Trying alternate stream...';
    }
    setStreamState({ status: 'loading', message: attemptMsg });
    setStreamUrl('');

    // Helper — schedule another /api/play call after the gap.
    function scheduleAutoRetry() {
      if (cancelled) { return; }
      if (retryCount >= MAX_RETRIES) {
        setStreamState({
          status: 'error',
          message: 'All upstream sources are unreachable right now. Try another channel, or use "Try another source" to attempt a different server.',
        });
        return;
      }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); }
      retryTimerRef.current = setTimeout(function() {
        retryTimerRef.current = null;
        if (cancelled) { return; }
        setRetryCount(function(n) { return n + 1; });
      }, RETRY_DELAY_MS);
    }

    // The HEAD probe validates the DaveTV stream endpoint without downloading
    // the playlist. For HLS, the endpoint itself returns a rewritten manifest
    // on our API origin; hls.js then requests nested playlists and segments
    // through the same ticketed proxy path.
    fetch(endpoint, { method: 'HEAD', credentials: 'include' }).then(function(r) {
      if (cancelled) { return; }
      if (r.ok || r.status === 200 || (r.status >= 200 && r.status < 400)) {
        // Use the redirect target URL if HEAD followed it, else the
        // original endpoint. r.url is the final URL after redirects.
        var resolved = (r.url && r.url !== endpoint) ? r.url : endpoint;
        setStreamUrl(resolved);
        setStreamState({ status: 'streaming', message: 'Stream ready' });
        if (isLive) { setLiveStartedAt(Date.now()); }
        return;
      }
      // Try GET to get the JSON error body
      fetch(endpoint, { credentials: 'include' }).then(function(r2) {
        if (cancelled) { return; }
        r2.json().then(function(j) {
          if (cancelled) { return; }
          var transient = r2.status === 503 &&
            j && j.status === 'stream_temporarily_unavailable';
          if (transient) {
            // Friendly transient state — keep "loading" status so the UI
            // doesn't flash an error, and schedule the auto-retry.
            setStreamState({
              status: 'loading',
              message: 'Trying alternate stream... we will keep trying.',
            });
            scheduleAutoRetry();
            return;
          }
          if (r2.status === 503) {
            setStreamState({
              status: 'pending_operator',
              message: (j && j.message) ||
                'No source is currently available for this channel. We will try again automatically.',
            });
            scheduleAutoRetry();
          } else {
            setStreamState({ status: 'error', message: (j && j.message) || ('HTTP ' + r2.status) });
          }
        }).catch(function() {
          if (!cancelled) {
            setStreamState({ status: 'error', message: 'HTTP ' + r2.status });
          }
        });
      }).catch(function(err) {
        if (cancelled) { return; }
        setStreamState({ status: 'error', message: (err && err.message) || 'network error' });
      });
    }).catch(function() {
      // HEAD often blocked on cross-origin redirects — fall back to
      // optimistic stream and let the <video>/hls.js engine report errors.
      if (cancelled) { return; }
      setStreamUrl(endpoint);
      setStreamState({ status: 'streaming', message: 'Stream ready' });
      if (isLive) { setLiveStartedAt(Date.now()); }
    });
    return function() {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [ticket, isLive, retryCount, manualSourceIndex]); // eslint-disable-line

  // ── EPG fetch (live channels only) ─────────────────────────────────────
  React.useEffect(function() {
    if (!isOpen || !isLive || !item || !item.id) { return undefined; }
    if (!online) { return undefined; }
    var cancelled = false;
    fetchEPG(pid || '', 2).then(function(res) {
      if (cancelled) { return; }
      var programs = res && res.programs ? res.programs : [];
      var now = Date.now();
      var nowProgram = null;
      var nextProgram = null;
      var soonestNextMs = Infinity;
      for (var i = 0; i < programs.length; i++) {
        var p = programs[i];
        if (!p || String(p.channel_id) !== String(item.id)) { continue; }
        var startMs = new Date(p.start).getTime();
        var endMs = new Date(p.end).getTime();
        if (isNaN(startMs) || isNaN(endMs)) { continue; }
        if (startMs <= now && endMs > now) {
          nowProgram = p;
        } else if (startMs > now && startMs < soonestNextMs) {
          soonestNextMs = startMs;
          nextProgram = p;
        }
      }
      setEpg({ now: nowProgram, next: nextProgram });
    }).catch(function() {
      if (!cancelled) { setEpg({ now: null, next: null }); }
    });
    return function() { cancelled = true; };
  }, [isOpen, isLive, item && item.id, pid, online]); // eslint-disable-line

  // ── Native HLS / progressive src wiring (non-hls.js path) ─────────────
  React.useEffect(function() {
    var v = videoRef.current;
    if (!v) { return undefined; }
    if (!streamUrl) { return undefined; }
    // If hls.js path is active (i.e. urlLooksHls && !browser-native HLS)
    // the useHlsStream hook owns the video.src. Otherwise wire it here so
    // progressive MP4 / DASH / native-HLS-on-Safari-Tizen still plays.
    if (urlLooksHls(streamUrl)) {
      // useHlsStream will handle this. It probes native first.
      return undefined;
    }
    try {
      v.src = streamUrl;
      v.load();
      var pp = v.play();
      if (pp && pp.catch) { pp.catch(function() { /* autoplay blocked */ }); }
    } catch (e) { /* best-effort */ }
    return undefined;
  }, [streamUrl]);

  // ── Playback intent / recovery ────────────────────────────────────────
  React.useEffect(function() {
    if (!isOpen || !streamUrl || streamState.status !== 'streaming') { return undefined; }
    startPlaybackIfDesired();

    var id = setInterval(function() {
      var v = videoRef.current;
      if (!v || !desiredPlaybackRef.current) { return; }
      if (v.paused && !v.ended) {
        startPlaybackIfDesired();
      }
    }, 2500);

    function onVisibilityChange() {
      if (!document.hidden) { startPlaybackIfDesired(); }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return function() {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [isOpen, streamUrl, streamState.status]); // eslint-disable-line

  // ── Probe audio/text tracks once the video has metadata ───────────────
  function refreshTracks() {
    var v = videoRef.current;
    if (!v) { return; }
    var audio = [];
    if (v.audioTracks && typeof v.audioTracks.length === 'number') {
      for (var i = 0; i < v.audioTracks.length; i++) {
        var a = v.audioTracks[i];
        audio.push({
          index: i,
          label: a.label || a.language || ('Audio ' + (i + 1)),
          language: a.language || '',
          enabled: !!a.enabled,
        });
      }
    }
    setAudioTracks(audio);

    var text = [];
    if (v.textTracks && typeof v.textTracks.length === 'number') {
      for (var j = 0; j < v.textTracks.length; j++) {
        var t = v.textTracks[j];
        if (t.kind && t.kind !== 'subtitles' && t.kind !== 'captions') { continue; }
        text.push({
          index: j,
          label: t.label || t.language || ('Subtitle ' + (j + 1)),
          language: t.language || '',
          mode: t.mode || 'disabled',
        });
      }
    }
    setTextTracks(text);
  }

  // ── Idle / auto-hide timer ────────────────────────────────────────────
  function bumpActivity() {
    setIdle(false);
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); }
    if (locked) { return; }
    idleTimerRef.current = setTimeout(function() { setIdle(true); }, IDLE_MS);
  }

  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    bumpActivity();
    return function() {
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    };
  }, [isOpen, locked]); // eslint-disable-line

  // ── Volume / muted reflected to the element ───────────────────────────
  React.useEffect(function() {
    var v = videoRef.current;
    if (!v) { return undefined; }
    try { v.volume = Math.max(0, Math.min(1, volume)); v.muted = muted; } catch (e) { /* */ }
    return undefined;
  }, [volume, muted, streamState.status]);

  // ── Fullscreen sync ───────────────────────────────────────────────────
  React.useEffect(function() {
    function onFsChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return function() { document.removeEventListener('fullscreenchange', onFsChange); };
  }, []);

  // ── PiP sync ──────────────────────────────────────────────────────────
  React.useEffect(function() {
    var v = videoRef.current;
    if (!v) { return undefined; }
    function onEnter() { setPip(true); }
    function onLeave() { setPip(false); }
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return function() {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [streamState.status]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKey(e) {
      // Close / Back — always available, regardless of lock.
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 10009) {
        e.preventDefault();
        if (locked) { setLocked(false); bumpActivity(); return; }
        if (onClose) { onClose(); }
        return;
      }
      // Lock blocks everything else.
      if (locked) { bumpActivity(); return; }
      bumpActivity();
      // Space / k / MediaPlayPause → toggle play/pause
      if (e.key === ' ' || e.key === 'k' || e.key === 'MediaPlayPause' || e.keyCode === 415 || e.keyCode === 19) {
        e.preventDefault();
        togglePlay();
        return;
      }
      // m → mute
      if (e.key === 'm') { e.preventDefault(); setMuted(function(prev) { return !prev; }); return; }
      // f → fullscreen
      if (e.key === 'f') { e.preventDefault(); toggleFullscreen(); return; }
      // VOD seek with ← / →
      if (!isLive && (e.key === 'ArrowLeft' || e.keyCode === 37)) { e.preventDefault(); seekBy(-10); return; }
      if (!isLive && (e.key === 'ArrowRight' || e.keyCode === 39)) { e.preventDefault(); seekBy(10); return; }
      // Live channel up/down with ↑↓ or +/-
      if (isLive && (e.key === 'ArrowUp' || e.keyCode === 38 || e.key === '+' || e.keyCode === 107)) {
        e.preventDefault(); switchChannelBy(-1); return;
      }
      if (isLive && (e.key === 'ArrowDown' || e.keyCode === 40 || e.key === '-' || e.keyCode === 109)) {
        e.preventDefault(); switchChannelBy(1); return;
      }
      // Volume +/-
      if (e.key === 'ArrowUp' && !isLive) { e.preventDefault(); setVolume(function(v) { return Math.min(1, v + 0.1); }); return; }
      if (e.key === 'ArrowDown' && !isLive) { e.preventDefault(); setVolume(function(v) { return Math.max(0, v - 0.1); }); return; }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [isOpen, locked, isLive, onClose]); // eslint-disable-line

  if (!isOpen) { return null; }

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleTimeUpdate() {
    var v = videoRef.current;
    if (!v) { return; }
    if (typeof v.duration === 'number' && v.duration > 0 && v.duration !== watchDuration) {
      setWatchDuration(v.duration);
    }
    if (typeof v.currentTime === 'number') {
      setCurrentTime(v.currentTime);
      recordTick(v.currentTime);
      // Mirror the position into the fast-path localStorage store for the
      // Continue Watching rail. Live channels have no meaningful resume
      // point — playhead is "now" — so we skip the write for type=live.
      if (!isLive && item && item.id) {
        var dur = (typeof v.duration === 'number' && isFinite(v.duration)) ? v.duration : 0;
        playbackPositionStore.setPosition(profileId, String(item.id), v.currentTime, dur);
      }
    }
  }

  function handleLoadedMetadata() {
    refreshTracks();
    // Auto-seek to the last-known position for VOD/movies/episodes the
    // first time metadata is ready for this (item, profile) pair. Live
    // channels never resume — they always play "now".
    var v = videoRef.current;
    if (v && !isLive && item && item.id && seekedItemIdRef.current !== item.id) {
      try {
        var dur = (typeof v.duration === 'number' && isFinite(v.duration) && v.duration > 0) ? v.duration : 0;
        var saved = playbackPositionStore.getPosition(profileId, String(item.id));
        if (saved && typeof saved.seconds === 'number' && saved.seconds > 30) {
          // Skip if we'd be jumping past the credits — the user clearly
          // finished, so let them start over. We use the live duration
          // when known, otherwise the stored duration as a fallback.
          var effectiveDur = dur > 0 ? dur : (saved.duration || 0);
          if (effectiveDur <= 0 || saved.seconds < (effectiveDur - 60)) {
            try { v.currentTime = saved.seconds; } catch (_e) { /* engine not ready */ }
          }
        }
      } catch (_e) { /* never let resume crash the player */ }
      seekedItemIdRef.current = item.id;
    }
    handleTimeUpdate();
  }

  // Mark watched + clear resume point when the user finishes the asset.
  function handleEnded() {
    desiredPlaybackRef.current = false;
    setPlaying(false);
    if (!isLive && item && item.id) {
      try { playbackPositionStore.clearPosition(profileId, String(item.id)); } catch (_e) { /* */ }
    }
  }

  function startPlaybackIfDesired() {
    var v = videoRef.current;
    if (!v || !desiredPlaybackRef.current) { return; }
    if (!streamUrl || streamState.status !== 'streaming') { return; }
    try {
      if (!v.paused && !v.ended) {
        setPlaying(true);
        return;
      }
      var pp = v.play();
      if (pp && pp.then) {
        pp.then(function() { setPlaying(true); }).catch(function() { setPlaying(false); });
      } else {
        setPlaying(true);
      }
    } catch (_e) { /* play() can throw on some WebKit builds */ }
  }

  function schedulePlaybackResume() {
    if (!desiredPlaybackRef.current || resumeTimerRef.current) { return; }
    resumeTimerRef.current = setTimeout(function() {
      resumeTimerRef.current = null;
      startPlaybackIfDesired();
    }, 700);
  }

  function handleVideoPause() {
    setPlaying(false);
    if (desiredPlaybackRef.current && streamState.status === 'streaming') {
      schedulePlaybackResume();
    }
  }

  function togglePlay() {
    var v = videoRef.current;
    if (!v) { return; }
    try {
      if (v.paused) {
        desiredPlaybackRef.current = true;
        if (resumeTimerRef.current) {
          clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = null;
        }
        var pp = v.play();
        if (pp && pp.then) { pp.then(function() { setPlaying(true); }).catch(function() { /* autoplay blocked */ }); }
        else { setPlaying(true); }
      } else {
        desiredPlaybackRef.current = false;
        if (resumeTimerRef.current) {
          clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = null;
        }
        v.pause();
        setPlaying(false);
      }
    } catch (e) { /* */ }
  }

  function seekBy(deltaSec) {
    var v = videoRef.current;
    if (!v) { return; }
    try {
      var t = (v.currentTime || 0) + deltaSec;
      if (t < 0) { t = 0; }
      if (v.duration && t > v.duration) { t = v.duration; }
      v.currentTime = t;
    } catch (e) { /* */ }
  }

  function seekToFraction(frac) {
    var v = videoRef.current;
    if (!v || !v.duration) { return; }
    try { v.currentTime = Math.max(0, Math.min(v.duration, frac * v.duration)); } catch (e) { /* */ }
  }

  function liveCatalog() {
    if (!catalog || !catalog.length) { return []; }
    var out = [];
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i] && catalog[i].type === 'live') { out.push(catalog[i]); }
    }
    return out;
  }

  function switchChannelBy(delta) {
    if (!isLive || !onSwitchItem) { return; }
    var channels = liveCatalog();
    if (!channels.length) { return; }
    var currentId = item && item.id;
    var idx = -1;
    for (var i = 0; i < channels.length; i++) {
      if (String(channels[i].id) === String(currentId)) { idx = i; break; }
    }
    if (idx === -1) { return; }
    var next = idx + delta;
    if (next < 0) { next = channels.length - 1; }
    if (next >= channels.length) { next = 0; }
    onSwitchItem(channels[next]);
  }

  function toggleFullscreen() {
    var el = containerRef.current;
    if (!el) { return; }
    try {
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) { el.requestFullscreen(); }
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) { /* */ }
  }

  function togglePip() {
    var v = videoRef.current;
    if (!v) { return; }
    try {
      if (document.pictureInPictureElement) {
        if (document.exitPictureInPicture) { document.exitPictureInPicture(); }
      } else if (v.requestPictureInPicture) {
        v.requestPictureInPicture();
      }
    } catch (e) { /* */ }
  }

  function selectAudioTrack(idx) {
    var v = videoRef.current;
    if (!v || !v.audioTracks) { return; }
    for (var i = 0; i < v.audioTracks.length; i++) {
      try { v.audioTracks[i].enabled = (i === idx); } catch (e) { /* */ }
    }
    refreshTracks();
    setOpenMenu(null);
  }

  function selectTextTrack(idx) {
    var v = videoRef.current;
    if (!v || !v.textTracks) { return; }
    for (var i = 0; i < v.textTracks.length; i++) {
      try { v.textTracks[i].mode = (i === idx) ? 'showing' : 'disabled'; } catch (e) { /* */ }
    }
    refreshTracks();
    setOpenMenu(null);
  }

  function selectHlsLevel(levelIdx) {
    // hls.js exposes its instance via the video element under
    // .__hlsInstance on some forks but not the canonical 1.5.x. Our
    // useHlsStream hook doesn't expose currentLevel mutation today, so
    // switching is best-effort: emit a custom event the hook can pick
    // up in a follow-up. Auto (-1) and per-level (0..n) both supported.
    var v = videoRef.current;
    if (!v) { return; }
    // hls.js attaches itself as a non-enumerable. We try the documented
    // events instead — but if we can find the instance pointer, use it.
    var hls = v.hlsInstance || v.__hls;
    if (hls && typeof hls.currentLevel !== 'undefined') {
      try { hls.currentLevel = levelIdx; } catch (e) { /* */ }
    }
    setOpenMenu(null);
  }

  var healthDot = '#888';
  var healthStatus = (provider.source_health && provider.source_health.status) || 'unknown';
  if (healthStatus === 'ok') { healthDot = '#22c55e'; }
  else if (healthStatus === 'degraded') { healthDot = '#e3b341'; }
  else if (healthStatus === 'down' || healthStatus === 'not_configured') { healthDot = '#ef4444'; }

  var overlayOpacity = (locked || idle) ? 0 : 1;
  var lockedOverlayOpacity = locked ? 1 : 0;
  var transition = reducedMotion ? 'none' : 'opacity 220ms ease';

  var liveDurationSec = isLive && liveStartedAt ? Math.floor((Date.now() - liveStartedAt) / 1000) : 0;
  var totalSec = watchDuration || 0;
  var progressFrac = totalSec > 0 ? Math.min(1, Math.max(0, currentTime / totalSec)) : 0;

  // Controls: a button styled to match the existing modal language.
  function controlButton(opts) {
    var label = opts.label;
    var onClick = opts.onClick;
    var d = opts.iconPath;
    var size = opts.size || minTouch;
    var active = !!opts.active;
    var key = opts.key;
    return (
      <button
        key={key}
        type="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        onClick={function(e) { e.stopPropagation(); bumpActivity(); onClick(); }}
        style={{
          width: size + 'px',
          height: size + 'px',
          minWidth: size + 'px',
          minHeight: size + 'px',
          borderRadius: '50%',
          background: active ? 'var(--accent, #1f6feb)' : 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: '#fff',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: reducedMotion ? 'none' : 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
        }}
        onMouseEnter={function(e) { if (!reducedMotion) { e.currentTarget.style.transform = 'scale(1.08)'; } e.currentTarget.style.background = active ? 'var(--accent, #1f6feb)' : 'rgba(255,255,255,0.20)'; }}
        onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = active ? 'var(--accent, #1f6feb)' : 'rgba(255,255,255,0.10)'; }}
        onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
        onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
      >
        <Icon d={d} size={Math.round(size * 0.46)} />
      </button>
    );
  }

  // Dropdown menu for audio/sub/quality.
  function renderMenu(title, items, activeIdx, onPick) {
    if (!items || !items.length) {
      return (
        <div style={menuStyle()}>
          <div style={menuHeaderStyle()}>{title}</div>
          <div style={{ padding: '0.5rem 0.75rem', color: 'var(--muted, #8b949e)', fontSize: '0.85rem' }}>
            None available
          </div>
        </div>
      );
    }
    return (
      <div style={menuStyle()}>
        <div style={menuHeaderStyle()}>{title}</div>
        {items.map(function(it, i) {
          var active = (i === activeIdx);
          return (
            <button
              key={i}
              type="button"
              tabIndex={0}
              onClick={function(e) { e.stopPropagation(); onPick(i); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.55rem 0.85rem',
                background: active ? 'var(--accent, #1f6feb)' : 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                cursor: 'pointer',
                outline: 'none',
              }}
              onMouseEnter={function(e) { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; } }}
              onMouseLeave={function(e) { if (!active) { e.currentTarget.style.background = 'transparent'; } }}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    );
  }

  function menuStyle() {
    return {
      position: 'absolute',
      bottom: 'calc(100% + 10px)',
      right: 0,
      minWidth: '220px',
      maxHeight: '320px',
      overflowY: 'auto',
      background: 'rgba(15,20,28,0.97)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '12px',
      boxShadow: '0 18px 36px rgba(0,0,0,0.6)',
      padding: '0.35rem 0',
      zIndex: 20,
    };
  }
  function menuHeaderStyle() {
    return {
      padding: '0.4rem 0.85rem 0.5rem',
      fontSize: 'calc(0.7rem * var(--font-scale, 1))',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--muted, #8b949e)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      marginBottom: '0.25rem',
    };
  }

  // Active track indices for menus.
  var activeAudioIdx = -1;
  for (var ai = 0; ai < audioTracks.length; ai++) {
    if (audioTracks[ai].enabled) { activeAudioIdx = ai; break; }
  }
  var activeTextIdx = -1;
  for (var ti = 0; ti < textTracks.length; ti++) {
    if (textTracks[ti].mode === 'showing') { activeTextIdx = ti; break; }
  }
  var qualityItems = [{ label: 'Auto' }];
  for (var qi = 0; qi < hlsLevels.length; qi++) {
    var lv = hlsLevels[qi];
    qualityItems.push({ label: lv.name + (lv.bitrate ? '  •  ' + Math.round(lv.bitrate / 1000) + ' kbps' : '') });
  }
  var activeQualityIdx = (currentHlsLevel === -1 || currentHlsLevel == null) ? 0 : (currentHlsLevel + 1);

  // Live channel list for the left rail.
  var channels = isLive ? liveCatalog() : [];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={function(e) { if (e.target === e.currentTarget && onClose) { onClose(); } }}
      onMouseMove={bumpActivity}
      onMouseDown={bumpActivity}
      className={'hermes-modal-overlay' + (reducedMotion ? ' motion-reduced' : '')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(5,8,14,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.5rem',
        fontSize: 'calc(1rem * ' + fontScale + ')',
      }}
    >
      <div
        ref={containerRef}
        className="hermes-modal-panel"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          maxWidth: '1600px',
          maxHeight: '96vh',
          background: '#000',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '16px',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
      >
        {/* ── Video surface ──────────────────────────────────────────── */}
        <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
          {!error && streamState.status === 'streaming' && (
            <React.Fragment>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={function() { handleLoadedMetadata(); startPlaybackIfDesired(); }}
                onLoadedData={startPlaybackIfDesired}
                onCanPlay={startPlaybackIfDesired}
                onEnded={handleEnded}
                onPlay={function() {
                  setPlaying(true);
                  if (resumeTimerRef.current) {
                    clearTimeout(resumeTimerRef.current);
                    resumeTimerRef.current = null;
                  }
                }}
                onPause={handleVideoPause}
                onVolumeChange={function() {
                  var v = videoRef.current;
                  if (!v) { return; }
                  setVolume(v.volume);
                  setMuted(v.muted);
                }}
                style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain' }}
              />
              {ticket && ticket.item && ticket.item.type === 'live' && (
                <TimeShiftOverlay videoRef={videoRef} isLive={ticket.item.type === 'live'} profile={profile} />
              )}
            </React.Fragment>
          )}
          {!error && streamState.status !== 'streaming' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div style={{ width: '100%', maxWidth: '880px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                {(streamState.status === 'loading' || streamState.status === 'idle') && (
                  <SkeletonBlock width="100%" height={0} radius="10px" style={{ paddingBottom: '56.25%', height: 0 }} />
                )}
                {(streamState.status === 'pending_operator' || streamState.status === 'error') && (
                  <div style={{ textAlign: 'center', maxWidth: '560px' }}>
                    <div style={{ fontSize: '2.25rem', color: streamState.status === 'pending_operator' ? '#e3b341' : 'var(--accent, #1f6feb)', marginBottom: '0.75rem' }}>
                      {streamState.status === 'pending_operator' ? 'Retry' : 'Unable'}
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                      {streamState.status === 'pending_operator' && 'Trying alternate stream...'}
                      {streamState.status === 'error' && 'Stream unavailable'}
                    </div>
                    <div style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      {streamState.message}
                    </div>
                  </div>
                )}
                {(streamState.status === 'loading' || streamState.status === 'idle') && (
                  <div role="status" aria-live="polite" style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem', textAlign: 'center', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: '14px', height: '14px',
                        border: '2px solid rgba(255,255,255,0.18)',
                        borderTopColor: 'var(--accent, #1f6feb)',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: reducedMotion ? 'none' : 'hermes-spin 0.8s linear infinite',
                      }}
                    />
                    <span>
                      {streamState.status === 'loading' ? (streamState.message || 'Preparing stream…') : 'Requesting playback ticket…'}
                    </span>
                  </div>
                )}
                {/* Wave-15 — "Try another source" button. Visible whenever a
                    retry would help: while loading after a retry, while in
                    the transient pending_operator state, or after the
                    hard-error fallback. We surface it as long as the
                    ticket has >1 source the user could pick from. */}
                {ticket && Array.isArray(ticket.sources) && ticket.sources.length > 1 && streamState.status !== 'streaming' && (
                  <button
                    type="button"
                    onClick={function(e) {
                      e.stopPropagation();
                      bumpActivity();
                      // Cancel any pending auto-retry — the user is taking
                      // manual control.
                      if (retryTimerRef.current) {
                        clearTimeout(retryTimerRef.current);
                        retryTimerRef.current = null;
                      }
                      var sourcesLen = (ticket && ticket.sources) ? ticket.sources.length : 1;
                      var base = manualSourceIndex >= 0 ? manualSourceIndex : 0;
                      var next = (base + 1) % sourcesLen;
                      setManualSourceIndex(next);
                      setRetryCount(0);
                    }}
                    style={{
                      marginTop: '0.4rem',
                      padding: '0.6rem 1.1rem',
                      borderRadius: '999px',
                      border: '1px solid rgba(255,255,255,0.22)',
                      background: 'rgba(255,255,255,0.10)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 'calc(0.85rem * ' + fontScale + ')',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    Try another source
                  </button>
                )}
              </div>
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div style={{ textAlign: 'center', maxWidth: '520px' }}>
                <div style={{ fontSize: '2rem', color: '#ef4444', marginBottom: '0.75rem' }}>{'⚠'}</div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Could not start playback</div>
                <div style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem' }}>{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Lock overlay (covers everything when locked) ───────────── */}
        {locked && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              background: 'rgba(0,0,0,0.0)',
              opacity: lockedOverlayOpacity, transition: transition,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: '1rem',
            }}
            onClick={function(e) { e.stopPropagation(); bumpActivity(); }}
          >
            <button
              type="button"
              onClick={function(e) { e.stopPropagation(); setLocked(false); bumpActivity(); }}
              aria-label="Unlock controls"
              title="Unlock"
              style={{
                width: (minTouch + 8) + 'px', height: (minTouch + 8) + 'px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon d={ICON_LOCK} size={26} />
            </button>
          </div>
        )}

        {/* ── Top bar ────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
            padding: (momMode ? '1rem 1.25rem' : '0.75rem 1rem'),
            background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.0) 100%)',
            color: '#fff',
            opacity: overlayOpacity, transition: transition,
            pointerEvents: (locked || idle) ? 'none' : 'auto',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'nowrap', minWidth: 0 }}>
            {item.logo_url && (
              <img
                src={item.logo_url}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: (momMode ? '52px' : '40px'), height: (momMode ? '52px' : '40px'), borderRadius: '10px', objectFit: 'contain', background: 'rgba(255,255,255,0.06)', padding: '4px', flexShrink: 0 }}
                onError={function(e) { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 'calc(1.05rem * ' + fontScale + ')', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '380px' }}>
                  {error ? 'Playback failed' : (item.title || 'Now Playing')}
                </span>
                {isLive && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: '#ef4444', borderRadius: '4px', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: reducedMotion ? 'none' : 'hermes-pulse 1.6s ease-in-out infinite' }} />
                    LIVE
                  </span>
                )}
                {item.resolution && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e5a00d', border: '1px solid #e5a00d', borderRadius: '999px', padding: '2px 8px', background: 'rgba(229,160,13,0.08)' }}>
                    {item.resolution}
                  </span>
                )}
                {item.hdr_format && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#e5a00d,#e50914)', borderRadius: '999px', padding: '2px 8px' }}>
                    HDR
                  </span>
                )}
                {pid && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: pColor, borderRadius: '999px', padding: '2px 9px' }}>
                    {provider.display_name || pid}
                  </span>
                )}
                <span title={'Source health: ' + healthStatus} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: healthDot, boxShadow: '0 0 6px ' + healthDot + '99' }} />
              </div>
              {isLive && (epg.now || epg.next) && (
                <div style={{ fontSize: 'calc(0.78rem * ' + fontScale + ')', color: 'rgba(255,255,255,0.78)', marginTop: '2px', maxWidth: '640px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {epg.now && (
                    <span><b>Now:</b> {epg.now.title || 'Untitled'} </span>
                  )}
                  {epg.next && (
                    <span style={{ marginLeft: epg.now ? '0.6rem' : 0, color: 'rgba(255,255,255,0.62)' }}>
                      <b>Next:</b> {epg.next.title || 'Untitled'} at {fmtClock(new Date(epg.next.start))}
                    </span>
                  )}
                </div>
              )}
              {ticket && ticket.expires_at && !isLive && (
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
                  Ticket expires in {fmtExpiresIn(ticket.expires_at)}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {controlButton({ key: 'lock', label: locked ? 'Unlock controls' : 'Lock controls', onClick: function() { setLocked(function(p) { return !p; }); }, iconPath: locked ? ICON_LOCK : ICON_UNLOCK, size: minTouch - 4 })}
            <button
              tabIndex={0}
              autoFocus
              onClick={function(e) { e.stopPropagation(); if (onClose) { onClose(); } }}
              aria-label="Close player"
              style={{
                width: minTouch + 'px', height: minTouch + 'px', minWidth: minTouch + 'px', minHeight: minTouch + 'px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff', fontSize: '1.4rem', cursor: 'pointer', padding: 0,
                outline: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {'×'}
            </button>
          </div>
        </div>

        {/* ── Center playback controls ───────────────────────────────── */}
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: (momMode ? '2rem' : '1.5rem'),
            opacity: overlayOpacity, transition: transition,
            pointerEvents: (locked || idle) ? 'none' : 'auto',
            zIndex: 11,
          }}
        >
          {isLive
            ? controlButton({ key: 'chdn', label: 'Channel down', onClick: function() { switchChannelBy(1); }, iconPath: ICON_CH_DN, size: minTouch + 8 })
            : controlButton({ key: 'sb', label: 'Skip back 10 seconds', onClick: function() { seekBy(-10); }, iconPath: ICON_SKIP_BACK, size: minTouch + 8 })}
          {controlButton({ key: 'play', label: playing ? 'Pause' : 'Play', onClick: togglePlay, iconPath: playing ? ICON_PAUSE : ICON_PLAY, size: (momMode ? 96 : 84) })}
          {isLive
            ? controlButton({ key: 'chup', label: 'Channel up', onClick: function() { switchChannelBy(-1); }, iconPath: ICON_CH_UP, size: minTouch + 8 })
            : controlButton({ key: 'sf', label: 'Skip forward 10 seconds', onClick: function() { seekBy(10); }, iconPath: ICON_SKIP_FWD, size: minTouch + 8 })}
        </div>

        {/* ── Left rail (live channel zap) ───────────────────────────── */}
        {isLive && channels.length > 0 && (
          <div
            onMouseEnter={function() { setRailOpen(true); bumpActivity(); }}
            onMouseLeave={function() { setRailOpen(false); }}
            onFocus={function() { setRailOpen(true); bumpActivity(); }}
            style={{
              position: 'absolute', top: '80px', bottom: '120px', left: 0,
              width: railOpen ? (momMode ? '320px' : '280px') : '12px',
              background: railOpen ? 'rgba(15,20,28,0.92)' : 'rgba(255,255,255,0.08)',
              borderRight: railOpen ? '1px solid rgba(255,255,255,0.12)' : 'none',
              transition: reducedMotion ? 'none' : 'width 220ms ease, background 220ms ease',
              overflow: 'hidden',
              zIndex: 12,
              opacity: (locked || idle) ? 0 : 1,
              pointerEvents: (locked || idle) ? 'none' : 'auto',
            }}
          >
            {railOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '0.6rem 0.85rem', fontSize: 'calc(0.78rem * ' + fontScale + ')', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  Channels ({channels.length})
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
                  {channels.map(function(ch) {
                    var active = String(ch.id) === String(item.id);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        tabIndex={0}
                        onClick={function(e) { e.stopPropagation(); if (onSwitchItem) { onSwitchItem(ch); } }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
                          padding: (momMode ? '0.7rem 0.85rem' : '0.5rem 0.85rem'),
                          background: active ? 'rgba(31,111,235,0.22)' : 'transparent',
                          border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left',
                          fontSize: 'calc(0.85rem * ' + fontScale + ')',
                          minHeight: minTouch + 'px',
                          borderLeft: active ? '3px solid var(--accent, #1f6feb)' : '3px solid transparent',
                          outline: 'none',
                        }}
                        onMouseEnter={function(e) { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; } }}
                        onMouseLeave={function(e) { if (!active) { e.currentTarget.style.background = 'transparent'; } }}
                      >
                        {ch.logo_url && (
                          <img src={ch.logo_url} alt="" loading="lazy" decoding="async" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} onError={function(e) { e.currentTarget.style.display = 'none'; }} />
                        )}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.title || ch.name || 'Channel ' + ch.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bottom bar ─────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: (momMode ? '0.85rem 1.25rem 1rem' : '0.65rem 1rem 0.85rem'),
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.0) 100%)',
            color: '#fff',
            opacity: overlayOpacity, transition: transition,
            pointerEvents: (locked || idle) ? 'none' : 'auto',
            zIndex: 10,
          }}
        >
          {/* Progress / live row */}
          {!isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 'calc(0.78rem * ' + fontScale + ')', minWidth: '54px', textAlign: 'right' }}>{fmtSeconds(currentTime)}</span>
              <div
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalSec)}
                aria-valuenow={Math.round(currentTime)}
                tabIndex={0}
                onClick={function(e) {
                  e.stopPropagation();
                  var rect = e.currentTarget.getBoundingClientRect();
                  var frac = (e.clientX - rect.left) / rect.width;
                  seekToFraction(frac);
                }}
                style={{
                  flex: 1, height: (momMode ? '10px' : '6px'), background: 'rgba(255,255,255,0.18)',
                  borderRadius: '999px', position: 'relative', cursor: 'pointer',
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0, width: (progressFrac * 100) + '%',
                  background: 'var(--accent, #1f6feb)', borderRadius: '999px',
                  transition: reducedMotion ? 'none' : 'width 120ms linear',
                }} />
                <div style={{
                  position: 'absolute', top: '50%', left: (progressFrac * 100) + '%',
                  width: (momMode ? '18px' : '14px'), height: (momMode ? '18px' : '14px'),
                  background: '#fff', borderRadius: '50%', transform: 'translate(-50%, -50%)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }} />
              </div>
              <span style={{ fontSize: 'calc(0.78rem * ' + fontScale + ')', minWidth: '54px' }}>{fmtSeconds(totalSec)}</span>
            </div>
          )}
          {isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 'calc(0.78rem * ' + fontScale + ')', fontWeight: 700, color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                LIVE
              </span>
              <span style={{ fontSize: 'calc(0.78rem * ' + fontScale + ')', color: 'rgba(255,255,255,0.7)' }}>
                Streamed for {fmtDurationCompact(liveDurationSec)}
              </span>
              <div style={{ flex: 1 }} />
            </div>
          )}

          {/* Icon row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              {/* Volume */}
              {controlButton({ key: 'mute', label: muted ? 'Unmute' : 'Mute', onClick: function() { setMuted(function(p) { return !p; }); }, iconPath: muted ? ICON_VOL_MUTE : ICON_VOL_UP, size: minTouch - 4 })}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={muted ? 0 : volume}
                onChange={function(e) { setVolume(parseFloat(e.target.value)); if (parseFloat(e.target.value) > 0 && muted) { setMuted(false); } }}
                onMouseDown={bumpActivity}
                aria-label="Volume"
                style={{ width: (momMode ? '120px' : '100px'), accentColor: 'var(--accent, #1f6feb)' }}
              />
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', position: 'relative' }}>
              {/* Mom mode: hide advanced selectors unless toggled */}
              {(!momMode || showAdvanced) && (
                <div style={{ position: 'relative' }}>
                  {controlButton({ key: 'audio', label: 'Audio track', onClick: function() { setOpenMenu(openMenu === 'audio' ? null : 'audio'); }, iconPath: ICON_AUDIO, size: minTouch - 4, active: openMenu === 'audio' })}
                  {openMenu === 'audio' && renderMenu('Audio Tracks', audioTracks.map(function(a) { return { label: a.label + (a.language ? ' (' + a.language + ')' : '') }; }), activeAudioIdx, selectAudioTrack)}
                </div>
              )}
              {(!momMode || showAdvanced) && (
                <div style={{ position: 'relative' }}>
                  {controlButton({ key: 'sub', label: 'Subtitles', onClick: function() { setOpenMenu(openMenu === 'sub' ? null : 'sub'); }, iconPath: ICON_CC, size: minTouch - 4, active: openMenu === 'sub' })}
                  {openMenu === 'sub' && renderMenu('Subtitles', [{ label: 'Off' }].concat(textTracks.map(function(t) { return { label: t.label + (t.language ? ' (' + t.language + ')' : '') }; })), activeTextIdx === -1 ? 0 : activeTextIdx + 1, function(i) { selectTextTrack(i - 1); })}
                </div>
              )}
              {(!momMode || showAdvanced) && hlsLevels.length > 0 && (
                <div style={{ position: 'relative' }}>
                  {controlButton({ key: 'q', label: 'Quality', onClick: function() { setOpenMenu(openMenu === 'quality' ? null : 'quality'); }, iconPath: ICON_QUALITY, size: minTouch - 4, active: openMenu === 'quality' })}
                  {openMenu === 'quality' && renderMenu('Quality', qualityItems, activeQualityIdx, function(i) { selectHlsLevel(i - 1); })}
                </div>
              )}
              {(!momMode || showAdvanced) && document.pictureInPictureEnabled && (
                controlButton({ key: 'pip', label: 'Picture in picture', onClick: togglePip, iconPath: ICON_PIP, size: minTouch - 4, active: pip })
              )}

              {/* Record — live only */}
              {onScheduleRecording && isLive && (
                controlButton({ key: 'rec', label: 'Record this channel', onClick: function() { onScheduleRecording(item); }, iconPath: ICON_RECORD, size: minTouch - 4 })
              )}

              {/* Cast button — auto-hides on Tizen */}
              {(!momMode || showAdvanced) && (
                <ChromecastButton
                  mediaUrl={streamUrl || resolveTicketEndpoint((ticket && ticket.stream_endpoint) || '')}
                  mediaTitle={item && item.title ? item.title : ''}
                  mediaType={mediaTypeFromUrl(streamUrl || resolveTicketEndpoint(ticket && ticket.stream_endpoint))}
                  posterUrl={item && (item.poster_url || (item.metadata && item.metadata.poster_url)) || ''}
                />
              )}

              {/* Multiview — live only */}
              {onOpenMultiview && isLive && (
                <button
                  type="button" tabIndex={0}
                  onClick={function(e) { e.stopPropagation(); onOpenMultiview(item); }}
                  aria-label="Open Multiview"
                  title="Multiview"
                  style={{
                    height: minTouch + 'px', minHeight: minTouch + 'px',
                    padding: '0 0.85rem',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.10)',
                    color: '#fff',
                    fontSize: 'calc(0.75rem * ' + fontScale + ')', fontWeight: 700,
                    cursor: 'pointer', outline: 'none',
                  }}
                >
                  Multi
                </button>
              )}

              {controlButton({ key: 'fs', label: fullscreen ? 'Exit fullscreen' : 'Fullscreen', onClick: toggleFullscreen, iconPath: fullscreen ? ICON_FULL_EXIT : ICON_FULL, size: minTouch - 4 })}

              {/* Mom-mode "Show advanced" toggle */}
              {momMode && (
                <button
                  type="button"
                  onClick={function(e) { e.stopPropagation(); setShowAdvanced(function(p) { return !p; }); }}
                  style={{
                    height: minTouch + 'px',
                    padding: '0 0.85rem',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: showAdvanced ? 'var(--accent, #1f6feb)' : 'rgba(255,255,255,0.10)',
                    color: '#fff', fontWeight: 700, fontSize: 'calc(0.75rem * ' + fontScale + ')',
                    cursor: 'pointer', outline: 'none',
                  }}
                  aria-label={showAdvanced ? 'Hide advanced controls' : 'Show advanced controls'}
                >
                  {showAdvanced ? 'Simple' : 'Advanced'}
                </button>
              )}

              {/* Settings gear */}
              {onOpenSettings && controlButton({ key: 'gear', label: 'Settings', onClick: function() { onOpenSettings(); }, iconPath: ICON_GEAR, size: minTouch - 4 })}
            </div>
          </div>
        </div>

        {/* Inline keyframes for pulse + spin */}
        {!reducedMotion && (
          <style>
            {'@keyframes hermes-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } } @keyframes hermes-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}
          </style>
        )}
      </div>
    </div>
  );
}

export default PlayerModal;

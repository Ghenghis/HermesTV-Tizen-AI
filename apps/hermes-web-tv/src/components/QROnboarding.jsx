import React from 'react';
import QRCode from 'qrcode';
import * as hermesApi from '../api/hermesApi.js';
import * as voiceClient from '../api/azureVoiceClient.js';
import * as voicePrefStore from '../store/voicePrefStore.js';

// W17-PURGE: previously this modal fell back to a made-up pairing code when
// offline. Under the no-fakes rule we now surface an honest "needs network"
// envelope instead — a QR code that points nowhere would be exactly the kind
// of placeholder UI the project bans.
var OFFLINE_PAIRING = {
  createPairing: function() {
    return Promise.reject(new Error('Pairing requires a live connection to the DaveTV server.'));
  },
  getPairingStatus: function() {
    return Promise.reject(new Error('Pairing requires a live connection to the DaveTV server.'));
  },
};

// Poll interval — every 5s the TV asks the API "did the operator's phone
// complete this pairing yet?" Cheap LAN HTTP call; modal closes the second
// status flips to 'completed' (or surfaces 'expired' for a retry button).
var POLL_INTERVAL_MS = 5000;

// When the pairing code is older than this we surface the "Refresh code"
// affordance even before the server flips it to 'expired'. Mom should not
// have to wait for the countdown to hit 00:00 if she walked away mid-flow.
var STALE_CODE_MS = 5 * 60 * 1000;

// Plain-English instructions, read top-to-bottom by Mom. Shared with the
// "🔊 Read instructions aloud" button so the spoken script matches the
// text on screen verbatim — that consistency matters for accessibility.
var INSTRUCTION_STEPS = [
  '1. Open your phone camera.',
  '2. Point it at this code.',
  '3. Tap the link.'
];
var INSTRUCTION_SPOKEN = INSTRUCTION_STEPS.join(' ');

// Brand label used in the modal heading. Backed by the DaveTV product name —
// the localStorage onboarding flag is still 'hermestv:onboarded' (backend
// compat, owned by OnboardingWizard), but every user-facing string here
// reads "DaveTV".
var BRAND_LABEL = 'DaveTV';

// Remote-pair flow: replaces the provider-import copy. The QR encodes a deep
// link into /remote.html?pair=HRM-XXXX so the phone immediately wakes up as a
// trackpad + D-pad + voice button. We narrate the same sub-text so Mom can
// hear what the link will do before tapping it.
var REMOTE_PAIR_HEADING = 'Scan to control ' + BRAND_LABEL + ' from your phone';
var REMOTE_PAIR_SUBTEXT =
  'Open the link on your phone — your phone becomes a remote with a trackpad, ' +
  'D-pad, and voice button.';
var REMOTE_PAIR_SPOKEN = REMOTE_PAIR_SUBTEXT + ' ' + INSTRUCTION_SPOKEN;

// Build the QR-encoded target URL for the remote-pair flow. We use the
// browser origin (protocol + host + optional port) so the phone hits the
// same Vite/nginx host serving the TV. SSR / opaque-origin contexts fall
// back to a relative URL — phones scanning at runtime always have origin,
// but the relative form keeps unit tests / pre-render hydration happy.
function _buildRemotePairUrl(pairingCode) {
  var safeCode = pairingCode || '';
  var path = '/remote.html?pair=' + encodeURIComponent(safeCode);
  if (typeof window === 'undefined' || !window.location) { return path; }
  var loc = window.location;
  var origin = loc.origin;
  if (!origin) {
    if (loc.protocol && loc.host) { origin = loc.protocol + '//' + loc.host; }
  }
  if (!origin) { return path; }
  return origin + path;
}

function _buildProviderSetupUrl(pairingCode, setupUrl) {
  var direct = (typeof setupUrl === 'string') ? setupUrl.trim() : '';
  if (direct) {
    if (/^https?:\/\//i.test(direct)) { return direct; }
    return hermesApi.buildApiUrl(direct.charAt(0) === '/' ? direct : ('/' + direct));
  }
  if (!pairingCode) { return ''; }
  return hermesApi.buildApiUrl('/setup/provider?code=' + encodeURIComponent(pairingCode));
}

// ── QR sizing ───────────────────────────────────────────────────────────────
// Mom-mode (font-scale ≥ 1.25) must scan from the couch, so the QR has a
// 256 px floor and scales up with font-scale. We pin the inner SVG to the
// chosen pixel size so it renders crisp on Tizen without subpixel blur.
var QR_BASE_PX = 256;
function _resolveFontScale() {
  if (typeof document === 'undefined' || !document.documentElement) { return 1; }
  try {
    var raw = getComputedStyle(document.documentElement).getPropertyValue('--font-scale');
    var n = parseFloat(raw);
    if (isFinite(n) && n > 0) { return n; }
  } catch (e) { /* SSR / opaque-origin — fall through */ }
  return 1;
}

function GeneratedQRCode(props) {
  var size = (props && typeof props.size === 'number' && props.size > 0) ? props.size : QR_BASE_PX;
  var targetUrl = (props && typeof props.targetUrl === 'string') ? props.targetUrl : '';
  var qrHook = React.useState({ targetUrl: '', dataUrl: '', error: '' });
  var qrState = qrHook[0];
  var setQrState = qrHook[1];

  React.useEffect(function() {
    var cancelled = false;
    if (!targetUrl) {
      setQrState({ targetUrl: '', dataUrl: '', error: 'No pairing URL available.' });
      return function() { cancelled = true; };
    }
    setQrState({ targetUrl: targetUrl, dataUrl: '', error: '' });
    QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: size,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(function(dataUrl) {
      if (!cancelled) {
        setQrState({ targetUrl: targetUrl, dataUrl: dataUrl, error: '' });
      }
    }).catch(function(err) {
      if (!cancelled) {
        setQrState({
          targetUrl: targetUrl,
          dataUrl: '',
          error: (err && err.message) ? err.message : 'QR generation failed.',
        });
      }
    });
    return function() { cancelled = true; };
  }, [targetUrl, size]);

  if (qrState.error) {
    return (
      <div
        role="alert"
        aria-label="Pairing QR unavailable"
        style={{
          width: size,
          height: size,
          color: '#7f1d1d',
          background: '#fff1f2',
          border: '2px solid #fecdd3',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '1rem',
          fontSize: 'calc(0.82rem * var(--font-scale, 1))',
          lineHeight: 1.35,
        }}
      >
        {qrState.error}
      </div>
    );
  }

  if (!qrState.dataUrl || qrState.targetUrl !== targetUrl) {
    return <div data-qr-skeleton><QRSkeleton size={size} /></div>;
  }

  return (
    <img
      src={qrState.dataUrl}
      width={size}
      height={size}
      alt={'Pairing QR code - opens ' + targetUrl}
      data-qr-target={targetUrl}
      style={{ display: 'block', width: size, height: size }}
    />
  );
}

// Loading skeleton shown while the pairing code is being minted. Same
// outer footprint as the live QR so the modal doesn't reflow when the
// real code arrives. Pulses via index.css's @keyframes hermes-skeleton-pulse
// — falls back to a flat grey block in motion-reduced mode.
function QRSkeleton(props) {
  var size = (props && typeof props.size === 'number' && props.size > 0) ? props.size : QR_BASE_PX;
  return (
    <div
      role="status"
      aria-label="Generating pairing code"
      style={{
        width: size,
        height: size,
        borderRadius: '8px',
        background: 'linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)',
        backgroundSize: '200% 100%',
        animation: 'hermesQrSkeleton 1.4s ease-in-out infinite',
      }}
    />
  );
}

// Format MS as MM:SS for the countdown line. Caps at 00:00.
function formatCountdown(ms) {
  if (!ms || ms < 0) { return '00:00'; }
  var total = Math.floor(ms / 1000);
  var mm = Math.floor(total / 60);
  var ss = total % 60;
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}

// ── Tizen remote helpers ────────────────────────────────────────────────────
// On Tizen the OK/Enter remote button arrives as either 'Enter' (Chrome
// keymap) or the literal string 'Enter' from the Tizen TVKey bridge. We
// also accept space as a desktop fallback for QA.
function _isActivateKey(key) {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

function QROnboarding(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var online = props.online !== false; // default true unless explicitly offline
  var onCompleted = props.onCompleted; // optional — called when status flips to 'completed'
  var profile = props.profile || null; // optional — needed to gate the TTS button
  // mode='remote-pair' swaps the heading + sub-text + QR target so the QR
  // deep-links into /remote.html?pair=<code> (phone becomes a remote with
  // trackpad + D-pad + voice). Default mode keeps the legacy provider-import
  // copy so existing call sites (OnboardingWizard, Settings ▸ Providers) are
  // unchanged.
  var mode = props.mode === 'remote-pair' ? 'remote-pair' : 'provider';
  var isRemotePairMode = mode === 'remote-pair';

  var initialState = {
    pairingCode: null,        // string from POST /api/pair
    setupUrl: '',             // real phone setup URL returned by POST /api/pair
    remoteUrl: '',            // optional remote-control URL returned by API
    status: 'loading',        // 'loading' | 'pending' | 'completed' | 'expired' | 'error'
    expiresAt: null,          // ISO timestamp
    issuedAt: null,           // ISO timestamp — used to flag stale codes (>5 min)
    remainingMs: 600000,      // 10:00 — refreshed every tick
    errorMessage: '',
    isStale: false,           // true once issuedAt is more than STALE_CODE_MS old
    isSpeaking: false,        // true while azureVoiceClient.speak() is in flight
  };
  var stateHook = React.useState(initialState);
  var pairState = stateHook[0];
  var setPairState = stateHook[1];

  // Resolved font-scale snapshot — refreshed when the modal opens so the QR
  // honours whatever the active profile (Mom: scale 1.5) is currently using.
  var fontScaleHook = React.useState(1);
  var fontScale = fontScaleHook[0];
  var setFontScale = fontScaleHook[1];

  // Patch helper to mirror App.jsx style.
  function patchPair(patch) {
    setPairState(function(prev) { return Object.assign({}, prev, patch); });
  }

  // Roving focus targets — refs so handleKeyDown can drive Tizen arrow nav
  // without needing every button to be visible at all times.
  var primaryBtnRef = React.useRef(null);
  var refreshBtnRef = React.useRef(null);
  var speakBtnRef = React.useRef(null);

  // Resolved QR size — clamps to the 256 px floor so Mom can scan from the
  // couch, and scales up with font-scale (1.5 → 384 px, etc.).
  var qrPixelSize = Math.max(QR_BASE_PX, Math.round(QR_BASE_PX * (fontScale || 1)));

  // Per-profile voice prefs (cheap localStorage read). Voice button is
  // hidden entirely when no profile is wired in, so the OnboardingWizard's
  // call site (which never had a profile prop) stays visually unchanged.
  var voicePrefs = profile
    ? voicePrefStore.getVoicePrefs(profile)
    : { master_enabled: false };
  var voiceEnabled = !!voicePrefs.master_enabled;

  // Mint a fresh pairing code on open. Re-runs if isOpen flips false→true.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }

    var cancelled = false;
    var api = online ? hermesApi : OFFLINE_PAIRING;

    // Snapshot the current font-scale so we lock the QR size for this open.
    setFontScale(_resolveFontScale());

    // Reset to loading on every open.
    setPairState(initialState);

    api.createPairing().then(function(envelope) {
      if (cancelled) { return; }
      patchPair({
        pairingCode: envelope.pairing_code,
        setupUrl: envelope.setup_url || '',
        remoteUrl: envelope.remote_url || '',
        status: envelope.status || 'pending',
        expiresAt: envelope.expires_at,
        issuedAt: envelope.issued_at || new Date().toISOString(),
        remainingMs: envelope.ttl_ms || 600000,
        errorMessage: '',
        isStale: false,
      });
    }).catch(function(err) {
      if (cancelled) { return; }
      patchPair({
        status: 'error',
        errorMessage: (err && err.message) ? err.message : 'Failed to create pairing code',
      });
    });

    return function() { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, online]);

  // Countdown ticker — updates remainingMs every second while pending. Also
  // flips isStale once we cross the STALE_CODE_MS threshold so the refresh
  // button can pop in before the server hard-expires the code.
  React.useEffect(function() {
    if (!isOpen || !pairState.expiresAt) { return undefined; }
    if (pairState.status !== 'pending') { return undefined; }

    var tick = function() {
      var now = Date.now();
      var remaining = Date.parse(pairState.expiresAt) - now;
      var issuedMs = pairState.issuedAt ? Date.parse(pairState.issuedAt) : now;
      var stale = (now - issuedMs) >= STALE_CODE_MS;
      if (remaining <= 0) {
        patchPair({ remainingMs: 0, status: 'expired', isStale: true });
      } else {
        patchPair({ remainingMs: remaining, isStale: stale });
      }
    };
    var handle = setInterval(tick, 1000);
    return function() { clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pairState.expiresAt, pairState.issuedAt, pairState.status]);

  // Status polling — every 5s ask the API if the operator's phone completed
  // the pairing. Stops the moment status leaves 'pending'.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    if (pairState.status !== 'pending') { return undefined; }
    if (!pairState.pairingCode) { return undefined; }

    var cancelled = false;
    var api = online ? hermesApi : OFFLINE_PAIRING;

    var poll = function() {
      if (cancelled) { return; }
      api.getPairingStatus(pairState.pairingCode).then(function(envelope) {
        if (cancelled) { return; }
        if (envelope.status === 'completed') {
          patchPair({ status: 'completed' });
          if (typeof onCompleted === 'function') {
            try { onCompleted(envelope); }
            catch (e) { /* never let callback errors break the modal */ }
          }
          // Auto-close after a brief confirmation moment.
          setTimeout(function() {
            if (!cancelled && typeof onClose === 'function') { onClose(); }
          }, 1200);
        } else if (envelope.status === 'expired') {
          patchPair({ status: 'expired', remainingMs: 0 });
        }
        // 'pending' → keep polling.
      }).catch(function(err) {
        // Soft-fail the poll — keep the modal usable. Operator can close +
        // retry. Don't flip to 'error' for transient network blips.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[QROnboarding] pairing poll failed:', err && err.message);
        }
      });
    };

    var handle = setInterval(poll, POLL_INTERVAL_MS);
    return function() { cancelled = true; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, online, pairState.pairingCode, pairState.status]);

  // Stop any in-flight TTS when the modal closes — otherwise Mom hears the
  // instructions narrating after she's already moved on.
  React.useEffect(function() {
    if (!isOpen) {
      try { voiceClient.stopSpeaking(); } catch (e) { /* never fatal */ }
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) { return null; }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      if (onClose) { onClose(); }
    }
  }

  function handleRetry() {
    // Force a fresh mint cycle — the create-effect re-fires when state
    // resets to the initial 'loading' shape because pairingCode is null
    // and the effect's dependency on isOpen is unchanged.
    setPairState(initialState);
    var api = online ? hermesApi : OFFLINE_PAIRING;
    api.createPairing().then(function(envelope) {
      patchPair({
        pairingCode: envelope.pairing_code,
        setupUrl: envelope.setup_url || '',
        remoteUrl: envelope.remote_url || '',
        status: envelope.status || 'pending',
        expiresAt: envelope.expires_at,
        issuedAt: envelope.issued_at || new Date().toISOString(),
        remainingMs: envelope.ttl_ms || 600000,
        errorMessage: '',
        isStale: false,
      });
    }).catch(function(err) {
      patchPair({
        status: 'error',
        errorMessage: (err && err.message) ? err.message : 'Failed to create pairing code',
      });
    });
  }

  // Read the on-screen instructions aloud via Azure TTS. Gated on the
  // master_enabled per-profile flag (voicePrefStore) and graceful no-op
  // if profile is missing or speak() rejects — Mom never sees a broken
  // button, just a silent one.
  function handleSpeakInstructions() {
    if (!profile || !voiceEnabled) { return; }
    patchPair({ isSpeaking: true });
    // Use the granular options form so per-profile voice + volume apply.
    // 'command_confirmation' is the closest existing intent for a UI-driven
    // narration of an action prompt.
    var p;
    try {
      // spokenScript is resolved per-mode further down in render. We re-read
      // it here from the same heuristic so the speech matches the visible
      // copy regardless of which mode the modal opened in.
      var script = (mode === 'remote-pair') ? REMOTE_PAIR_SPOKEN : INSTRUCTION_SPOKEN;
      p = voiceClient.speak(script, {
        profile: profile,
        intent: 'command_confirmation',
      });
    } catch (e) {
      patchPair({ isSpeaking: false });
      return;
    }
    if (p && typeof p.then === 'function') {
      p.then(function() { patchPair({ isSpeaking: false }); })
       .catch(function() { patchPair({ isSpeaking: false }); });
    } else {
      patchPair({ isSpeaking: false });
    }
  }

  // Tizen remote arrow navigation across the visible focusable buttons.
  // Order: [speak?] → [refresh?] → [primary]. We re-resolve on every press
  // so dynamic visibility (refresh appears once stale, speak hidden if no
  // profile) doesn't trap focus on an unmounted button.
  function _focusOrder() {
    var nodes = [];
    if (speakBtnRef.current) { nodes.push(speakBtnRef.current); }
    if (refreshBtnRef.current) { nodes.push(refreshBtnRef.current); }
    if (primaryBtnRef.current) { nodes.push(primaryBtnRef.current); }
    return nodes;
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (onClose) { onClose(); }
      return;
    }
    var nodes = _focusOrder();
    if (nodes.length === 0) { return; }
    var active = (typeof document !== 'undefined') ? document.activeElement : null;
    var idx = -1;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] === active) { idx = i; break; }
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      var next = nodes[(idx + 1 + nodes.length) % nodes.length];
      if (next && typeof next.focus === 'function') { next.focus(); }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      var prev = nodes[(idx - 1 + nodes.length) % nodes.length];
      if (prev && typeof prev.focus === 'function') { prev.focus(); }
      e.preventDefault();
    }
    // OK/Enter activation is handled per-button (onKeyDown) — that lets the
    // browser fire onClick semantics on the focused control directly.
  }

  // Per-button OK handler. Tizen reports OK as 'Enter'; space is a desktop
  // fallback for QA. We swallow the event so the parent's onKeyDown doesn't
  // also try to re-navigate.
  function makeButtonKeyHandler(handler) {
    return function(e) {
      if (_isActivateKey(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof handler === 'function') { handler(e); }
      }
    };
  }

  // Render the pairing code (or a placeholder while loading/error).
  var displayCode = pairState.pairingCode || (pairState.status === 'error' ? '----' : '...');
  var isLoading = pairState.status === 'loading';
  var showRefreshButton = pairState.isStale && (pairState.status === 'pending' || pairState.status === 'expired');
  var showSpeakButton = !!profile && voiceEnabled && pairState.status !== 'completed';

  // Mode-driven copy: heading, dialog aria-label, instruction sub-text and
  // the spoken script for the TTS button. The QR target is always concrete:
  // provider mode uses the backend setup URL; remote-pair mode uses the
  // phone remote deep link.
  var headingText = isRemotePairMode
    ? REMOTE_PAIR_HEADING
    : 'Add a Provider to ' + BRAND_LABEL;
  var dialogAriaLabel = isRemotePairMode
    ? REMOTE_PAIR_HEADING
    : 'Add a Provider to ' + BRAND_LABEL;
  var subTextLine = isRemotePairMode ? REMOTE_PAIR_SUBTEXT : null;
  var qrTargetUrl = isRemotePairMode
    ? (pairState.remoteUrl || _buildRemotePairUrl(pairState.pairingCode))
    : _buildProviderSetupUrl(pairState.pairingCode, pairState.setupUrl);

  var statusBlock;
  if (pairState.status === 'completed') {
    statusBlock = (
      <div
        role="status"
        style={{
          fontSize: 'calc(0.9rem * var(--font-scale, 1))',
          color: 'var(--accent)',
          fontWeight: '600',
          backgroundColor: 'rgba(0,128,0,0.15)',
          borderRadius: '999px',
          padding: '0.55rem 1.1rem',
        }}
      >
        Provider added — closing…
      </div>
    );
  } else if (pairState.status === 'expired') {
    statusBlock = (
      <div
        role="status"
        style={{
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          backgroundColor: 'rgba(255,128,0,0.12)',
          borderRadius: '999px',
          padding: '0.55rem 1.1rem',
          textAlign: 'center',
        }}
      >
        Code expired. Press <strong style={{ color: 'var(--text)' }}>Get new code</strong> below.
      </div>
    );
  } else if (pairState.status === 'error') {
    statusBlock = (
      <div
        role="alert"
        style={{
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          color: '#ff8080',
          backgroundColor: 'rgba(255,0,0,0.10)',
          borderRadius: '999px',
          padding: '0.55rem 1.1rem',
          textAlign: 'center',
        }}
      >
        {pairState.errorMessage || 'Unable to create pairing code.'}
      </div>
    );
  } else if (isLoading) {
    statusBlock = (
      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '999px',
          padding: '0.55rem 1.1rem',
          border: '1px solid var(--border, #30363d)',
        }}
      >
        Generating pairing code…
      </div>
    );
  } else {
    statusBlock = (
      <div
        role="status"
        aria-live="polite"
        style={{
          fontSize: 'calc(0.8rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '999px',
          padding: '0.5rem 1.1rem',
          border: '1px solid var(--border, #30363d)',
        }}
      >
        This code expires in <strong style={{ color: 'var(--text)' }}>{formatCountdown(pairState.remainingMs)}</strong>
      </div>
    );
  }

  var primaryButtonLabel = (pairState.status === 'expired' || pairState.status === 'error')
    ? 'Get new code'
    : 'Close';
  var primaryButtonHandler = (pairState.status === 'expired' || pairState.status === 'error')
    ? handleRetry
    : onClose;

  // Shared button styling — visible focus rings, no outline:none anywhere.
  // We use box-shadow as the focus indicator so it composites cleanly on top
  // of the rounded pill shape and is honoured even when the browser strips
  // native outlines on `pointer:hover` styles.
  var primaryBtnStyle = {
    marginTop: '0.5rem',
    padding: 'calc(0.8rem * var(--font-scale, 1)) calc(2.2rem * var(--font-scale, 1))',
    background: 'linear-gradient(135deg, var(--accent), #6366f1)',
    border: '2px solid transparent',
    borderRadius: '999px',
    color: '#ffffff',
    fontSize: 'calc(1rem * var(--font-scale, 1))',
    cursor: 'pointer',
    fontWeight: '800',
    boxShadow: '0 6px 18px rgba(99,102,241,0.32)',
    transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease, border-color 160ms ease',
    letterSpacing: '0.02em',
  };

  var secondaryBtnStyle = {
    padding: 'calc(0.55rem * var(--font-scale, 1)) calc(1.2rem * var(--font-scale, 1))',
    background: 'rgba(255,255,255,0.06)',
    border: '2px solid var(--border, #30363d)',
    borderRadius: '999px',
    color: 'var(--text)',
    fontSize: 'calc(0.9rem * var(--font-scale, 1))',
    cursor: 'pointer',
    fontWeight: '600',
    boxShadow: 'none',
    transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease',
    letterSpacing: '0.02em',
  };

  function applyFocusRing(e, color) {
    var c = color || 'var(--accent)';
    e.currentTarget.style.boxShadow = '0 0 0 3px ' + c + ', 0 6px 18px rgba(99,102,241,0.32)';
    e.currentTarget.style.borderColor = c;
    e.currentTarget.style.transform = 'scale(1.04)';
  }
  function clearFocusRing(e, baseShadow) {
    e.currentTarget.style.boxShadow = baseShadow || 'none';
    e.currentTarget.style.borderColor = 'transparent';
    e.currentTarget.style.transform = 'scale(1)';
  }

  // Decide which button gets autoFocus so the Tizen remote OK lands somewhere
  // sensible: speak (if available) → refresh (if stale) → primary.
  var autoFocusTarget = (function() {
    if (showSpeakButton) { return 'speak'; }
    if (showRefreshButton) { return 'refresh'; }
    return 'primary';
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dialogAriaLabel}
      onKeyDown={handleKeyDown}
      onClick={handleOverlayClick}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      {/* Inline keyframes — kept local so the skeleton works even before
          index.css's full bundle is parsed on first-paint. */}
      <style>{
        '@keyframes hermesQrSkeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }' +
        '.motion-reduced [data-qr-skeleton] { animation: none !important; }'
      }</style>

      <div
        className="hermes-modal-panel"
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          padding: 'calc(2.5rem * var(--font-scale, 1))',
          maxWidth: 'calc(420px * var(--font-scale, 1))',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'calc(1.25rem * var(--font-scale, 1))',
          color: 'var(--text)',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
          background: 'linear-gradient(180deg, var(--surface-raised, var(--surface)) 0%, var(--surface) 28%)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(1.5rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: 'var(--text)',
            textAlign: 'center',
          }}
        >
          {headingText}
        </h2>

        {subTextLine ? (
          <p
            style={{
              margin: 0,
              fontSize: 'calc(0.95rem * var(--font-scale, 1))',
              color: 'var(--muted)',
              textAlign: 'center',
              lineHeight: '1.45',
              maxWidth: '90%',
            }}
          >
            {subTextLine}
          </p>
        ) : null}

        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '14px',
            display: 'inline-block',
            opacity: pairState.status === 'completed' || pairState.status === 'expired' ? 0.4 : 1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.05)',
            transition: 'opacity 0.2s',
          }}
        >
          {isLoading
            ? <div data-qr-skeleton><QRSkeleton size={qrPixelSize} /></div>
            : <GeneratedQRCode size={qrPixelSize} targetUrl={qrTargetUrl} />}
        </div>

        {/* Pairing code */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'calc(0.8rem * var(--font-scale, 1))',
              color: 'var(--muted)',
              marginBottom: '0.4rem',
              letterSpacing: '0.03em',
            }}
          >
            Pairing code
          </div>
          <div
            aria-live="polite"
            aria-label={pairState.pairingCode ? ('Pairing code ' + pairState.pairingCode) : 'Pairing code loading'}
            style={{
              fontSize: 'calc(1.75rem * var(--font-scale, 1))',
              fontWeight: '800',
              letterSpacing: '0.2em',
              color: 'var(--accent)',
              fontFamily: 'monospace',
            }}
          >
            {displayCode}
          </div>
        </div>

        {/* Plain-English instructions — read aloud by the speak button. */}
        <ol
          aria-label="How to scan the pairing code"
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(0.35rem * var(--font-scale, 1))',
            fontSize: 'calc(0.95rem * var(--font-scale, 1))',
            color: 'var(--text)',
            textAlign: 'left',
            lineHeight: '1.5',
            alignSelf: 'stretch',
          }}
        >
          {INSTRUCTION_STEPS.map(function(line, idx) {
            return (
              <li key={idx} style={{ margin: 0 }}>
                {line}
              </li>
            );
          })}
        </ol>

        {statusBlock}

        {/* Secondary action row — speak / refresh buttons. */}
        {(showSpeakButton || showRefreshButton) ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 'calc(0.5rem * var(--font-scale, 1))',
            }}
          >
            {showSpeakButton ? (
              <button
                ref={speakBtnRef}
                type="button"
                tabIndex={0}
                autoFocus={autoFocusTarget === 'speak'}
                aria-label="Read instructions aloud"
                aria-pressed={pairState.isSpeaking}
                disabled={pairState.isSpeaking}
                onClick={handleSpeakInstructions}
                onKeyDown={makeButtonKeyHandler(handleSpeakInstructions)}
                style={secondaryBtnStyle}
                onFocus={function(e) { applyFocusRing(e, 'var(--accent)'); }}
                onBlur={function(e) { clearFocusRing(e, 'none'); }}
                onMouseEnter={function(e) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.10)';
                }}
                onMouseLeave={function(e) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                }}
              >
                {pairState.isSpeaking ? '🔊 Speaking…' : '🔊 Read instructions aloud'}
              </button>
            ) : null}

            {showRefreshButton ? (
              <button
                ref={refreshBtnRef}
                type="button"
                tabIndex={0}
                autoFocus={autoFocusTarget === 'refresh'}
                aria-label="Refresh pairing code"
                onClick={handleRetry}
                onKeyDown={makeButtonKeyHandler(handleRetry)}
                style={secondaryBtnStyle}
                onFocus={function(e) { applyFocusRing(e, 'var(--accent)'); }}
                onBlur={function(e) { clearFocusRing(e, 'none'); }}
                onMouseEnter={function(e) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.10)';
                }}
                onMouseLeave={function(e) {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                }}
              >
                ↻ Refresh code
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          ref={primaryBtnRef}
          type="button"
          tabIndex={0}
          autoFocus={autoFocusTarget === 'primary'}
          onClick={primaryButtonHandler}
          onKeyDown={makeButtonKeyHandler(primaryButtonHandler)}
          style={primaryBtnStyle}
          onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
          onFocus={function(e) {
            // Focus ring composites on top of the existing drop shadow.
            e.currentTarget.style.boxShadow = '0 0 0 3px #ffffff, 0 0 0 6px var(--accent), 0 6px 18px rgba(99,102,241,0.32)';
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(99,102,241,0.32)';
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {primaryButtonLabel}
        </button>
      </div>
    </div>
  );
}

export default QROnboarding;

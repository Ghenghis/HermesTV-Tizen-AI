/**
 * Cast session manager — thin wrapper around the Google Cast Web Sender SDK.
 *
 * Lazy-loads `https://www.gstatic.com/cv/js/sender/v1/cast_sender.js` only
 * when `initCast()` is first called. The SDK callback `__onGCastApiAvailable`
 * resolves a cached promise so subsequent `initCast()` calls are idempotent.
 *
 * On Tizen / non-Chromium browsers where the SDK never loads, the 8-second
 * timeout flips the cached load to `unavailable` and every public function
 * returns a safe no-op result. The UI then renders the unavailable state and
 * keeps the rest of the app working.
 *
 * Public API:
 *   isCastAvailable()
 *   initCast(applicationId?)
 *   castMedia({url, title, type, poster})
 *   stopCasting()
 *   subscribeSession(callback) — returns unsubscribe
 *
 * Tizen 6.5 / Chrome 76 safe — no optional chaining, no nullish coalescing,
 * no template literals for non-string-interpolation paths.
 */

// Public default media receiver — Google's standard receiver app.
var DEFAULT_APPLICATION_ID = 'CC1AD845';
var SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
var LOAD_TIMEOUT_MS = 8000;

// Module-level state.
var _loadPromise = null;
var _initialized = false;
var _initializedAppId = null;
var _sessionListeners = [];
var _currentState = 'idle'; // 'idle' | 'connecting' | 'connected'
var _currentDevice = '';
var _stateBound = false;

function _notify() {
  var snapshot = { state: _currentState, deviceName: _currentDevice };
  for (var i = 0; i < _sessionListeners.length; i++) {
    try {
      _sessionListeners[i](snapshot);
    } catch (e) {
      // Listener errors must not break the chain.
    }
  }
}

function _setState(state, deviceName) {
  _currentState = state;
  _currentDevice = typeof deviceName === 'string' ? deviceName : '';
  _notify();
}

function _safeGetReceiverName(session) {
  if (!session) { return ''; }
  try {
    if (typeof session.getCastDevice === 'function') {
      var dev = session.getCastDevice();
      if (dev && dev.friendlyName) { return dev.friendlyName; }
    }
  } catch (e) {}
  // Older shapes — best-effort fallback.
  if (session.receiver && session.receiver.friendlyName) {
    return session.receiver.friendlyName;
  }
  return '';
}

function _bindFrameworkListeners() {
  if (_stateBound) { return; }
  var framework = window.cast && window.cast.framework;
  if (!framework) { return; }
  var context;
  try { context = framework.CastContext.getInstance(); } catch (e) { return; }
  if (!context) { return; }

  context.addEventListener(
    framework.CastContextEventType.SESSION_STATE_CHANGED,
    function(event) {
      var SessionState = framework.SessionState;
      if (!event || !SessionState) { return; }
      var session = context.getCurrentSession();
      var name = _safeGetReceiverName(session);
      if (event.sessionState === SessionState.SESSION_STARTING ||
          event.sessionState === SessionState.SESSION_RESUMED) {
        _setState('connecting', name);
      } else if (event.sessionState === SessionState.SESSION_STARTED) {
        _setState('connected', name);
      } else if (event.sessionState === SessionState.SESSION_ENDED ||
                 event.sessionState === SessionState.NO_SESSION ||
                 event.sessionState === SessionState.SESSION_START_FAILED) {
        _setState('idle', '');
      }
    }
  );
  _stateBound = true;
}

/**
 * True only when the SDK has loaded AND reports a Cast device is reachable.
 * On Tizen webview, `window.chrome` exists but `chrome.cast` does not, so
 * this returns false there.
 */
export function isCastAvailable() {
  if (typeof window === 'undefined') { return false; }
  if (!window.chrome || !window.chrome.cast) { return false; }
  return window.chrome.cast.isAvailable === true;
}

/**
 * Lazily inject the Cast SDK and call `setOptions` on the framework.
 * Idempotent — repeat calls return the cached promise. Times out at 8s
 * and resolves to { available: false } on Tizen or any environment that
 * can't reach gstatic.
 */
export function initCast(applicationId) {
  var appId = applicationId || DEFAULT_APPLICATION_ID;

  if (_loadPromise) { return _loadPromise; }

  _loadPromise = new Promise(function(resolve) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve({ available: false, reason: 'no-window' });
      return;
    }

    var done = false;
    function finish(result) {
      if (done) { return; }
      done = true;
      resolve(result);
    }

    var timeoutId = setTimeout(function() {
      finish({ available: false, reason: 'timeout' });
    }, LOAD_TIMEOUT_MS);

    // The SDK calls this global function when it's ready.
    window.__onGCastApiAvailable = function(isAvailable) {
      try {
        if (!isAvailable) {
          clearTimeout(timeoutId);
          finish({ available: false, reason: 'sdk-reports-unavailable' });
          return;
        }
        var framework = window.cast && window.cast.framework;
        if (!framework) {
          clearTimeout(timeoutId);
          finish({ available: false, reason: 'no-framework' });
          return;
        }
        var context = framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: appId,
          autoJoinPolicy: framework.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        _initialized = true;
        _initializedAppId = appId;
        _bindFrameworkListeners();
        clearTimeout(timeoutId);
        finish({ available: true });
      } catch (err) {
        clearTimeout(timeoutId);
        finish({ available: false, reason: 'init-error' });
      }
    };

    // Inject script tag.
    var existing = document.querySelector('script[data-hermes-cast-sdk="1"]');
    if (existing) {
      // Already injected — wait for the callback. Timeout still applies.
      return;
    }
    var s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.setAttribute('data-hermes-cast-sdk', '1');
    s.onerror = function() {
      clearTimeout(timeoutId);
      finish({ available: false, reason: 'script-load-error' });
    };
    document.head.appendChild(s);
  });

  return _loadPromise;
}

/**
 * Load a media item on the current session. If no session exists yet,
 * `requestSession()` opens the browser's native cast device picker.
 * Returns a promise that resolves on load completion or rejects with
 * a string error code.
 */
export function castMedia(payload) {
  payload = payload || {};
  var url = payload.url || '';
  var title = payload.title || '';
  var type = payload.type || 'video/mp4';
  var poster = payload.poster || '';

  if (!_initialized) {
    return Promise.reject('not-initialized');
  }
  if (!url) {
    return Promise.reject('missing-url');
  }
  var chromeCast = window.chrome && window.chrome.cast;
  var framework = window.cast && window.cast.framework;
  if (!chromeCast || !framework) {
    return Promise.reject('sdk-missing');
  }

  function _loadOnSession(session) {
    var mediaInfo = new chromeCast.media.MediaInfo(url, type);
    if (chromeCast.media.StreamType && type === 'application/vnd.apple.mpegurl') {
      mediaInfo.streamType = chromeCast.media.StreamType.LIVE;
    } else if (chromeCast.media.StreamType) {
      mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
    }
    // Receiver-side metadata so the cast device shows title/poster.
    var meta = new chromeCast.media.GenericMediaMetadata();
    meta.title = title;
    if (poster) {
      meta.images = [ new chromeCast.Image(poster) ];
    }
    mediaInfo.metadata = meta;

    var request = new chromeCast.media.LoadRequest(mediaInfo);
    return session.loadMedia(request);
  }

  var context = framework.CastContext.getInstance();
  var currentSession = context.getCurrentSession();
  if (currentSession) {
    return _loadOnSession(currentSession);
  }
  // No session — open the picker. Browser ensures user gesture.
  return context.requestSession().then(function() {
    var s = context.getCurrentSession();
    if (!s) { return Promise.reject('no-session-after-request'); }
    return _loadOnSession(s);
  });
}

/** Disconnect the current cast session, if any. */
export function stopCasting() {
  var framework = window.cast && window.cast.framework;
  if (!framework) { return Promise.resolve(); }
  try {
    var context = framework.CastContext.getInstance();
    var session = context.getCurrentSession();
    if (!session) { return Promise.resolve(); }
    // `true` = stop the receiver app, not just disconnect the sender.
    return Promise.resolve(session.endSession(true));
  } catch (e) {
    return Promise.resolve();
  }
}

/**
 * Subscribe to session state transitions.
 * Callback receives { state: 'idle' | 'connecting' | 'connected', deviceName }.
 * Returns an unsubscribe function.
 */
export function subscribeSession(callback) {
  if (typeof callback !== 'function') { return function() {}; }
  _sessionListeners.push(callback);
  // Fire once with the current state so consumers get the initial value.
  try { callback({ state: _currentState, deviceName: _currentDevice }); } catch (e) {}
  return function unsubscribe() {
    for (var i = 0; i < _sessionListeners.length; i++) {
      if (_sessionListeners[i] === callback) {
        _sessionListeners.splice(i, 1);
        return;
      }
    }
  };
}

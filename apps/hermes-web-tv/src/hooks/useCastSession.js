/**
 * useCastSession — React wrapper around services/castSession.js.
 *
 * On first mount, lazily loads the Google Cast SDK (8s timeout). Tracks
 * whether the SDK + a Cast device are available, the current session
 * state, and the connected device's friendly name. Exposes thin
 * `startCast` / `stopCast` / `castMedia` helpers that delegate to the
 * service module.
 *
 * Returns: { state, deviceName, available, startCast, stopCast, castMedia }
 *
 * Tizen 6.5 / Chrome 76 safe — function components only, no hooks beyond
 * useState/useEffect/useCallback.
 */
import React from 'react';
import * as castSession from '../services/castSession.js';

function useCastSession(applicationId) {
  var stateResult = React.useState('idle');
  var state = stateResult[0];
  var setState = stateResult[1];

  var deviceResult = React.useState('');
  var deviceName = deviceResult[0];
  var setDeviceName = deviceResult[1];

  var availResult = React.useState(false);
  var available = availResult[0];
  var setAvailable = availResult[1];

  React.useEffect(function() {
    var mounted = true;

    castSession.initCast(applicationId).then(function(result) {
      if (!mounted) { return; }
      // Even if the SDK loads, the user may have no Cast device on the
      // network — re-check `isCastAvailable()` here.
      if (result && result.available && castSession.isCastAvailable()) {
        setAvailable(true);
      } else if (result && result.available) {
        // SDK loaded but no devices yet. The framework's RECEIVER_CHANGE
        // event will flip availability when a device appears, but we keep
        // the button hidden by default — the picker would have nothing to
        // show. The subscribeSession callback below also lifts to 'connected'
        // if a session resumes.
        setAvailable(castSession.isCastAvailable());
      } else {
        setAvailable(false);
      }
    });

    var unsubscribe = castSession.subscribeSession(function(snap) {
      if (!mounted) { return; }
      setState(snap.state);
      setDeviceName(snap.deviceName || '');
    });

    return function() {
      mounted = false;
      unsubscribe();
    };
  }, [applicationId]);

  var startCast = React.useCallback(function(payload) {
    return castSession.castMedia(payload || {});
  }, []);

  var stopCast = React.useCallback(function() {
    return castSession.stopCasting();
  }, []);

  var castMedia = React.useCallback(function(payload) {
    return castSession.castMedia(payload || {});
  }, []);

  return {
    state: state,
    deviceName: deviceName,
    available: available,
    startCast: startCast,
    stopCast: stopCast,
    castMedia: castMedia,
  };
}

export default useCastSession;

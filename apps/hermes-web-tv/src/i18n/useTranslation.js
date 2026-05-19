// ─────────────────────────────────────────────────────────────────────────────
// useTranslation — React hook that returns { t, locale, setLocale }.
//
// Subscribes to the i18n module's pub-sub on mount and bumps a forceRender
// counter every time setLocale is called. That re-renders every component
// using the hook so locale changes propagate without a full app remount.
//
// Tizen 6.5 / Chrome 76 safe: function expressions only, no arrow funcs,
// no destructuring in params. React 18 hooks are stable on Chrome 76.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { t as _t, getLocale, setLocale as _setLocale, subscribe } from './index.js';

export function useTranslation() {
  // Bump-counter pattern — calling setForceRender with a new value causes
  // React to schedule a re-render. We don't actually read tickResult[0];
  // the side-effect is the rerender. Avoids depending on React.useReducer
  // which adds a few hundred bytes for no benefit here.
  var tickResult = React.useState(0);
  var setForceRender = tickResult[1];

  React.useEffect(function() {
    var unsubscribe = subscribe(function() {
      setForceRender(function(n) { return n + 1; });
    });
    return unsubscribe;
  }, []);

  return {
    t: _t,
    locale: getLocale(),
    setLocale: _setLocale,
  };
}

export default useTranslation;

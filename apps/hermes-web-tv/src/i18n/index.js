// ─────────────────────────────────────────────────────────────────────────────
// i18n core — flat-key string lookup with English fallback.
//
// HermesTV ships English + Spanish eagerly (combined < 12 KB) so the active
// locale switch is instant. Additional locales (Portuguese, German, etc.)
// should be added behind dynamic import() once the catalog grows.
//
// API:
//   t(key, params?)   → string. Looks up the current locale's value, falls
//                       back to English, then to the key itself. Replaces
//                       `{name}`-style placeholders from `params` (object).
//   setLocale(code)   → switch active locale ('en' | 'es'). Persists to
//                       localStorage under 'hermestv:locale' and notifies
//                       any subscribed callbacks.
//   getLocale()       → current locale code.
//   subscribe(fn)     → register a callback fired on every setLocale.
//                       Returns an unsubscribe function. Used by the
//                       useTranslation hook to re-render consumers.
//
// Tizen 6.5 / Chrome 76 safe: no arrow functions, no destructuring in
// params, no template literals, no spread. Uses plain function expressions
// and String.prototype.replace for placeholder substitution.
// ─────────────────────────────────────────────────────────────────────────────

import en from './en.json';
import es from './es.json';

var STORAGE_KEY = 'hermestv:locale';
var DEFAULT_LOCALE = 'en';
var SUPPORTED = { en: en, es: es };

// Active locale state. Initialised from localStorage if a previous session
// persisted a choice; falls back to DEFAULT_LOCALE otherwise.
var _currentLocale = DEFAULT_LOCALE;

// Subscriber Set — useTranslation pushes its setState here so a setLocale
// call re-renders every consumer of the hook. Plain Set is fine on Chrome
// 76; works without polyfill on every Tizen 6.5 device.
var _subscribers = new Set();

function _readStoredLocale() {
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED[stored]) { return stored; }
  } catch (_) { /* localStorage unavailable — fall through */ }
  return DEFAULT_LOCALE;
}

function _writeStoredLocale(code) {
  try { localStorage.setItem(STORAGE_KEY, code); }
  catch (_) { /* quota or private-browsing — silent */ }
}

// Initialise on module load.
_currentLocale = _readStoredLocale();

export function getLocale() {
  return _currentLocale;
}

export function setLocale(code) {
  if (!SUPPORTED[code]) { return; }
  if (code === _currentLocale) { return; }
  _currentLocale = code;
  _writeStoredLocale(code);
  // Notify every consumer. forEach is safe on Set in Chrome 76.
  _subscribers.forEach(function(fn) {
    try { fn(code); } catch (_) { /* swallow consumer errors */ }
  });
}

export function subscribe(fn) {
  if (typeof fn !== 'function') { return function() {}; }
  _subscribers.add(fn);
  return function unsubscribe() { _subscribers.delete(fn); };
}

// Replace {placeholder} tokens with values from params. `params` is an
// optional object — when absent, the raw value is returned unchanged.
// Uses a regex with String.prototype.replace so we don't need template
// literals (Tizen-safe).
function _interpolate(value, params) {
  if (!params || typeof value !== 'string') { return value; }
  return value.replace(/\{(\w+)\}/g, function(match, name) {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      var sub = params[name];
      return (sub === null || sub === undefined) ? '' : String(sub);
    }
    return match;
  });
}

export function t(key, params) {
  var dict = SUPPORTED[_currentLocale] || en;
  var value = dict[key];
  // Fall back to English if the current locale is missing this key. This
  // protects against partial translations during incremental rollout.
  if (value === undefined && _currentLocale !== 'en') {
    value = en[key];
  }
  // Last-resort fallback: return the key itself so missing strings are
  // visible to the developer without crashing the UI.
  if (value === undefined) { return key; }
  return _interpolate(value, params);
}

// Default export bundles the public surface for `import i18n from '...'`
// patterns; named exports remain the preferred form.
export default { t: t, setLocale: setLocale, getLocale: getLocale, subscribe: subscribe };

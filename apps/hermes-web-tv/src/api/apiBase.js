function _normalizeBase(value) {
  var raw = String(value || '').trim();
  if (!raw) { return ''; }
  return raw.replace(/\/+$/, '');
}

function _envBase() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DAVETV_API_BASE) {
      return import.meta.env.VITE_DAVETV_API_BASE;
    }
  } catch (_) {}
  return '';
}

function _localStorageBase() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('davetv_api_base') || '';
    }
  } catch (_) {}
  return '';
}

function resolveApiBase() {
  if (typeof window === 'undefined') { return _normalizeBase(_envBase()); }
  if (window.__HERMES_API_BASE__) { return _normalizeBase(window.__HERMES_API_BASE__); }

  var fromEnv = _envBase();
  if (fromEnv) { return _normalizeBase(fromEnv); }

  var fromStorage = _localStorageBase();
  if (fromStorage) { return _normalizeBase(fromStorage); }

  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') { return 'http://localhost:3001'; }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { return 'http://' + h + ':3001'; }
  if (h === 'hermestv.local') { return 'http://hermestv.local'; }
  return '';
}

function buildApiUrl(path, base) {
  var safePath = String(path || '');
  if (safePath.charAt(0) !== '/') { safePath = '/' + safePath; }
  var apiBase = _normalizeBase(base != null ? base : resolveApiBase());
  if (/^https?:\/\//i.test(apiBase)) { return apiBase + safePath; }
  if (typeof window !== 'undefined' && window.location) {
    var loc = window.location;
    var origin = loc.origin;
    if (!origin && loc.protocol && loc.host) { origin = loc.protocol + '//' + loc.host; }
    if (origin) { return origin + safePath; }
  }
  return safePath;
}

export { resolveApiBase, buildApiUrl };

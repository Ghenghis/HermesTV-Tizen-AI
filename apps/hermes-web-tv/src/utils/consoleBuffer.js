// consoleBuffer.js — ring buffer that captures the last N console
// entries so the Diagnostics tab can hand the user a "Send debug logs"
// file when troubleshooting Mom's TV remotely.
//
// Installed exactly once via installConsoleBuffer(). Safe to call from
// main.jsx in dev or prod — capacity defaults to 500 entries, each
// truncated to 2 KB to bound memory on Tizen's 1.5 GB RAM ceiling.
//
// Tizen 6.5 / Chrome 76 safe — no spread, no rest params, no
// optional chaining.

var MAX_ENTRIES = 500;
var MAX_ARG_LEN = 2048;
var _buffer = [];
var _installed = false;

function _safeStringify(arg) {
  if (arg === null) { return 'null'; }
  if (arg === undefined) { return 'undefined'; }
  var t = typeof arg;
  if (t === 'string') { return arg; }
  if (t === 'number' || t === 'boolean') { return String(arg); }
  if (arg instanceof Error) {
    return arg.name + ': ' + arg.message + (arg.stack ? '\n' + arg.stack : '');
  }
  try {
    var s = JSON.stringify(arg);
    if (s === undefined) { return Object.prototype.toString.call(arg); }
    return s;
  } catch (_) {
    return Object.prototype.toString.call(arg);
  }
}

function _record(level, args) {
  var parts = [];
  for (var i = 0; i < args.length; i++) {
    var s = _safeStringify(args[i]);
    if (s.length > MAX_ARG_LEN) {
      s = s.slice(0, MAX_ARG_LEN) + '…<' + (s.length - MAX_ARG_LEN) + ' more chars>';
    }
    parts.push(s);
  }
  _buffer.push({
    t: new Date().toISOString(),
    level: level,
    msg: parts.join(' '),
  });
  if (_buffer.length > MAX_ENTRIES) {
    _buffer.shift();
  }
}

function installConsoleBuffer() {
  if (_installed) { return; }
  if (typeof console === 'undefined') { return; }
  _installed = true;

  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  for (var i = 0; i < levels.length; i++) {
    (function(level) {
      var original = console[level];
      if (typeof original !== 'function') { return; }
      console[level] = function() {
        try { _record(level, arguments); } catch (_) { /* never let logging fail */ }
        try { return original.apply(console, arguments); }
        catch (_) { /* some environments throw on apply with array-like */ }
      };
    })(levels[i]);
  }

  // Also catch uncaught errors + unhandled rejections so the log file
  // shows the smoking gun even if no console.error was emitted.
  if (typeof window !== 'undefined') {
    window.addEventListener('error', function(evt) {
      _record('error', ['[window.onerror]', (evt && evt.message) || 'unknown', (evt && evt.error && evt.error.stack) || '']);
    });
    window.addEventListener('unhandledrejection', function(evt) {
      _record('error', ['[unhandledrejection]', (evt && evt.reason && (evt.reason.message || evt.reason)) || 'unknown']);
    });
  }
}

function getEntries() {
  return _buffer.slice();
}

function clearEntries() {
  _buffer = [];
}

export { installConsoleBuffer, getEntries, clearEntries, MAX_ENTRIES };

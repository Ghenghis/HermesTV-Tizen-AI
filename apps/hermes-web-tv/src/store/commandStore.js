var MAX_LOG_SIZE = 100;
var _log = [];

function record(command) {
  if (_log.length >= MAX_LOG_SIZE) {
    _log.shift();
  }
  _log.push(Object.assign({}, command, { _recorded_at: new Date().toISOString() }));
}

function getLog() {
  return _log.slice();
}

function clear() {
  _log = [];
}

function getRecentByAction(action, limit) {
  var n = limit || 10;
  var matches = [];
  for (var i = _log.length - 1; i >= 0 && matches.length < n; i--) {
    if (_log[i].action === action) {
      matches.push(_log[i]);
    }
  }
  return matches;
}

export { record, getLog, clear, getRecentByAction };

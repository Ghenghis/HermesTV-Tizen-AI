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

export { record, getLog, clear };

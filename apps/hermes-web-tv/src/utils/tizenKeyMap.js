var TIZEN_KEY_CODES = {
  38: 'up',
  40: 'down',
  37: 'left',
  39: 'right',
  13: 'enter',
  10009: 'back',
  10182: 'exit',
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
  415: 'play',
  19: 'pause',
  413: 'stop',
  417: 'fast_forward',
  412: 'rewind',
  457: 'info',
  10232: 'guide',
  10135: 'smart_hub',
};

var KEY_TO_COMMAND = {
  10135: 'toggle layout switcher',
  10232: 'show live',
  403:   'change layout to tivimate',
  404:   'show live',
  405:   'show movies',
  406:   'dark theme',
};

function getKeyName(keyCode) {
  return TIZEN_KEY_CODES[keyCode] || null;
}

function getKeyCommand(keyCode) {
  return KEY_TO_COMMAND[keyCode] || null;
}

function installTizenKeyHandler(onCommand) {
  if (typeof window === 'undefined') {
    return function() {};
  }
  function handler(e) {
    var cmd = getKeyCommand(e.keyCode);
    if (cmd && typeof onCommand === 'function') {
      onCommand(cmd);
    }
  }
  document.addEventListener('keydown', handler);
  return function() {
    document.removeEventListener('keydown', handler);
  };
}

export { TIZEN_KEY_CODES, KEY_TO_COMMAND, getKeyName, getKeyCommand, installTizenKeyHandler };

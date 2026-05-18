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

// installTizenKeyHandler — global Tizen remote handler.
// onCommand: invoked for color/Smart-Hub/Guide keys that map to chatbot commands.
// onBack: invoked for the Back (10009) / Exit (10182) keys. If the handler
// returns truthy the default browser behavior is suppressed (e.preventDefault).
// Tizen TVs hard-exit the app if Back bubbles to the OS, so the handler MUST
// preventDefault when the app has an open modal it wants to close instead.
function installTizenKeyHandler(onCommand, onBack) {
  if (typeof window === 'undefined') {
    return function() {};
  }
  function handler(e) {
    if (e.keyCode === 10009 || e.keyCode === 10182) {
      if (typeof onBack === 'function') {
        var handled = onBack(e.keyCode);
        if (handled) {
          if (typeof e.preventDefault === 'function') { e.preventDefault(); }
          if (typeof e.stopPropagation === 'function') { e.stopPropagation(); }
        }
      }
      return;
    }
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

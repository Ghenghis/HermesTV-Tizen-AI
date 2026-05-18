// Key code normalization — unified across all Tizen remote variants
// Register non-default keys at app startup
(function() {
  'use strict';

  // Samsung Tizen remote key codes.
  // Sources: Tizen TV Web Device API (tizen.tvinputdevice), Samsung Smart TV SDK,
  // and the W3C UIEvents KeyboardEvent.keyCode reference for D-pad/standard keys.
  //
  // Standard keys (always delivered; no registerKey needed):
  //   UP=38, DOWN=40, LEFT=37, RIGHT=39, ENTER=13
  //
  // Samsung-extended keys (must be registered via tizen.tvinputdevice.registerKeyBatch):
  //   BACK/RETURN=10009, PLAY=415, PAUSE=19, PLAY_PAUSE=10252, STOP=413,
  //   FF=417, RW=412, color keys=403-406, CH_UP=427, CH_DOWN=428,
  //   VOL_UP=447, VOL_DOWN=448, MUTE=449, INFO=457, GUIDE=458,
  //   MENU (Tools/Settings on newer remotes)=10133, NUM_0..9=48-57.
  //
  // CORRECTED from original:
  //   MENU: 18 → 10133  (18 is the generic Alt key; Samsung MENU/Tools = 10133)
  //   Added RETURN as an alias for BACK (both map to 10009 on Samsung Tizen).
  var KEYS = {
    ENTER:          13,
    BACK:           10009,
    RETURN:         10009,  // alias — same key code as BACK on Samsung Tizen remotes
    PLAY:           415,
    PAUSE:          19,
    PLAY_PAUSE:     10252,
    STOP:           413,
    FF:             417,
    RW:             412,
    RED:            403,
    GREEN:          404,
    YELLOW:         405,
    BLUE:           406,
    CH_UP:          427,
    CH_DOWN:        428,
    VOL_UP:         447,
    VOL_DOWN:       448,
    MUTE:           449,
    UP:             38,
    DOWN:           40,
    LEFT:           37,
    RIGHT:          39,
    INFO:           457,
    MENU:           10133,  // CORRECTED: Samsung Tools/Settings button = 10133, not 18
    GUIDE:          458,
    NUM_0:          48,
    NUM_1:          49,
    NUM_2:          50,
    NUM_3:          51,
    NUM_4:          52,
    NUM_5:          53,
    NUM_6:          54,
    NUM_7:          55,
    NUM_8:          56,
    NUM_9:          57
  };

  function registerKeys() {
    try {
      tizen.tvinputdevice.registerKeyBatch([
        'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
        'MediaFastForward', 'MediaRewind',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
        'ChannelUp', 'ChannelDown', 'VolumeUp', 'VolumeDown',
        'Info', 'Guide'
      ]);
    } catch (e) {}
  }

  function getKeyName(keyCode) {
    for (var name in KEYS) {
      if (KEYS[name] === keyCode) return name;
    }
    return 'UNKNOWN_' + keyCode;
  }

  window.HERMES_KEYS = KEYS;
  window.hermesGetKeyName = getKeyName;

  document.addEventListener('DOMContentLoaded', registerKeys);
}());

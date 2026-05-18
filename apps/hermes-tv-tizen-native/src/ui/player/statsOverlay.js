// HermesTV Stats Overlay — positioned over the player, shows stream diagnostics.
// Toggled by OK button long-press (1.5s) or agent show_notification command.
// Uses textContent only (no innerHTML) for all dynamic values.
(function() {
  'use strict';

  var KEY_OK = 13;
  var LONG_PRESS_MS = 1500;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _parentEl    = null;
  var _overlayEl   = null;
  var _visible     = false;
  var _okTimer     = null;

  // DOM value nodes — populated in mount().
  var _nodes = {};

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  function _buildOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'hermes-stats-overlay';
    overlay.style.cssText = [
      'position:absolute',
      'top:16px',
      'right:16px',
      'width:300px',
      'background:rgba(0,0,0,0.78)',
      'color:#F2F4F7',
      'border-radius:8px',
      'padding:14px 16px',
      'font-size:14px',
      'line-height:1.7',
      'z-index:200',
      'display:none',
      'pointer-events:none',
      'font-family:\'Samsung One\',\'Malgun Gothic\',system-ui,sans-serif'
    ].join(';');

    function row(label, nodeKey) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

      var lbl = document.createElement('span');
      lbl.style.color = '#B7BDC6';
      lbl.textContent = label;

      var val = document.createElement('span');
      val.textContent = '—';
      _nodes[nodeKey] = val;

      row.appendChild(lbl);
      row.appendChild(val);
      return row;
    }

    // Resolution + HDR badge row
    var resRow = document.createElement('div');
    resRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;';
    var resLbl = document.createElement('span');
    resLbl.style.color = '#B7BDC6';
    resLbl.textContent = 'Resolution';
    var resRight = document.createElement('span');
    _nodes.resolution_display = resRight;
    resRow.appendChild(resLbl);
    resRow.appendChild(resRight);

    overlay.appendChild(resRow);
    overlay.appendChild(row('Codec',   'codec'));
    overlay.appendChild(row('Bitrate', 'bitrate'));
    overlay.appendChild(row('FPS',     'fps'));

    // Buffer health row
    var bufRow = document.createElement('div');
    bufRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    var bufLbl = document.createElement('span');
    bufLbl.style.color = '#B7BDC6';
    bufLbl.textContent = 'Buffer';
    var bufBar = document.createElement('div');
    bufBar.style.cssText = [
      'width:80px',
      'height:10px',
      'border-radius:5px',
      'background:#3EC97A'
    ].join(';');
    _nodes.buffer_bar = bufBar;
    bufRow.appendChild(bufLbl);
    bufRow.appendChild(bufBar);
    overlay.appendChild(bufRow);

    // Upscale warning row (hidden by default)
    var upscaleRow = document.createElement('div');
    upscaleRow.style.cssText = 'margin-top:6px;color:#F5A524;display:none;';
    _nodes.upscale_row = upscaleRow;
    var upscaleText = document.createTextNode('⚠ Possible upscale — source may be lower resolution');
    upscaleRow.appendChild(upscaleText);
    overlay.appendChild(upscaleRow);

    return overlay;
  }

  // ---------------------------------------------------------------------------
  // Long-press OK detection
  // ---------------------------------------------------------------------------

  function _startOkTimer() {
    _clearOkTimer();
    _okTimer = setTimeout(function() {
      toggle();
    }, LONG_PRESS_MS);
  }

  function _clearOkTimer() {
    if (_okTimer) {
      clearTimeout(_okTimer);
      _okTimer = null;
    }
  }

  document.addEventListener('keydown', function(e) {
    if (e.keyCode === KEY_OK) _startOkTimer();
  });

  document.addEventListener('keyup', function(e) {
    if (e.keyCode === KEY_OK) _clearOkTimer();
  });

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function mount(parentEl) {
    _parentEl = parentEl;
    _overlayEl = _buildOverlay();
    _parentEl.appendChild(_overlayEl);
  }

  function show() {
    if (!_overlayEl) return;
    _overlayEl.style.display = 'block';
    _visible = true;
  }

  function hide() {
    if (!_overlayEl) return;
    _overlayEl.style.display = 'none';
    _visible = false;
  }

  function toggle() {
    if (_visible) hide(); else show();
  }

  function update(stats) {
    if (!_overlayEl || !stats) return;

    // Resolution + HDR badge
    var resText = stats.resolution || '—';
    if (stats.hdr_format) {
      resText += ' | ' + stats.hdr_format;
    }
    if (_nodes.resolution_display) {
      _nodes.resolution_display.textContent = resText;
    }

    // Codec
    if (_nodes.codec) {
      _nodes.codec.textContent = stats.codec || '—';
    }

    // Bitrate
    if (_nodes.bitrate) {
      var bk = stats.bitrate_kbps;
      _nodes.bitrate.textContent = (bk != null && bk !== '')
        ? (bk >= 1000 ? (bk / 1000).toFixed(1) + ' Mbps' : bk + ' kbps')
        : '—';
    }

    // FPS
    if (_nodes.fps) {
      _nodes.fps.textContent = stats.fps != null ? stats.fps + ' fps' : '—';
    }

    // Buffer health bar: green=ok, red=buffering
    if (_nodes.buffer_bar) {
      _nodes.buffer_bar.style.background = stats.buffering ? '#FF5A5A' : '#3EC97A';
    }

    // Upscale warning
    if (_nodes.upscale_row) {
      _nodes.upscale_row.style.display = stats.possible_upscale ? 'block' : 'none';
    }
  }

  window.hermesStatsOverlay = {
    mount:  mount,
    show:   show,
    hide:   hide,
    toggle: toggle,
    update: update
  };
}());

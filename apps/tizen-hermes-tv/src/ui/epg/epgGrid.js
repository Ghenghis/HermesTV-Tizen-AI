// HermesTV EPG Time Grid — virtualized channel/program grid for Tizen TV.
// Renders only visible rows (±3 of viewport) using a recycled row element pool.
// Absolute-positioned program blocks for Tizen GPU compositing performance.
(function() {
  'use strict';

  var KEY_UP    = 38;
  var KEY_DOWN  = 40;
  var KEY_LEFT  = 37;
  var KEY_RIGHT = 39;
  var KEY_OK    = 13;

  // ---------------------------------------------------------------------------
  // Profile presets (doc 12)
  // ---------------------------------------------------------------------------

  var PRESETS = {
    dave_tv: {
      row_height:    72,
      logo_size:     48,
      title_font:    20,
      time_window_h: 2,
      visible_rows:  8,
      channel_col_w: 180
    },
    mom_tv: {
      row_height:    96,
      logo_size:     64,
      title_font:    26,
      time_window_h: 2.5,
      visible_rows:  6,
      channel_col_w: 200
    }
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _containerId   = null;
  var _containerEl   = null;
  var _profile       = null;
  var _preset        = null;
  var _channels      = [];
  var _programs      = {}; // channel_id → sorted program array
  var _nowUtc        = Date.now();
  var _windowStart   = 0;
  var _windowEnd     = 0;
  var _timeAreaWidth = 0;

  // Focused position.
  var _focusedRow    = 0; // channel index
  var _focusedProg   = null; // program object

  // Virtualization
  var _firstVisRow   = 0; // index of first rendered row
  var _rowPool       = []; // recycled row DOM elements

  // DOM root references
  var _dom = {};

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _el(tag, cls, styles) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (styles) e.style.cssText = styles;
    return e;
  }

  function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function _utcToX(utc) {
    var totalMs = _windowEnd - _windowStart;
    if (totalMs <= 0) return 0;
    return ((utc - _windowStart) / totalMs) * _timeAreaWidth;
  }

  function _programsForChannel(channelId) {
    return _programs[channelId] || [];
  }

  // Programs that overlap the current window.
  function _visiblePrograms(channelId) {
    var progs = _programsForChannel(channelId);
    var visible = [];
    for (var i = 0; i < progs.length; i++) {
      var p = progs[i];
      if (p.end_utc > _windowStart && p.start_utc < _windowEnd) {
        visible.push(p);
      }
    }
    return visible;
  }

  // Determine program state relative to now.
  function _progState(p) {
    if (p.end_utc <= _nowUtc)   return 'past';
    if (p.start_utc <= _nowUtc) return 'current';
    return 'future';
  }

  function _progBgColor(state) {
    if (state === 'past')    return 'var(--epg-past-bg,#1A1A2E)';
    if (state === 'current') return 'var(--epg-current-bg,#0F3460)';
    return 'var(--epg-future-bg,#16213E)';
  }

  function _progTextColor(state) {
    if (state === 'past')    return 'var(--epg-past-text,#666680)';
    if (state === 'current') return 'var(--epg-current-text,#E0E0FF)';
    return 'var(--epg-future-text,#C0C0D8)';
  }

  function _formatTime(utc) {
    var d = new Date(utc);
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
  }

  // ---------------------------------------------------------------------------
  // Layout calculation
  // ---------------------------------------------------------------------------

  function _recalcWindow() {
    var halfWindow = (_preset.time_window_h * 60 * 60 * 1000) / 2;
    _windowStart = _nowUtc - halfWindow;
    _windowEnd   = _nowUtc + halfWindow;
  }

  function _recalcTimeArea() {
    if (!_containerEl) return;
    var totalW = _containerEl.offsetWidth || 1920;
    _timeAreaWidth = totalW - _preset.channel_col_w;
    if (_timeAreaWidth < 1) _timeAreaWidth = 1;
  }

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  function _buildShell() {
    // Container (position:relative, overflow:hidden).
    var wrap = _el('div', 'epg-wrap', [
      'position:relative',
      'width:100%',
      'height:100%',
      'overflow:hidden',
      'background:var(--bg-0,#0B0D10)'
    ].join(';'));

    // Time header.
    var header = _el('div', 'epg-header', [
      'position:absolute',
      'top:0',
      'left:' + _preset.channel_col_w + 'px',
      'right:0',
      'height:40px',
      'background:var(--surface-0,#1F242C)',
      'z-index:10',
      'overflow:hidden'
    ].join(';'));
    _dom.header = header;

    // Channel column.
    var chanCol = _el('div', 'epg-channel-col', [
      'position:absolute',
      'top:40px',
      'left:0',
      'width:' + _preset.channel_col_w + 'px',
      'bottom:0',
      'background:var(--surface-0,#1F242C)',
      'z-index:10',
      'overflow:hidden'
    ].join(';'));
    _dom.chanCol = chanCol;

    // Program area.
    var progArea = _el('div', 'epg-prog-area', [
      'position:absolute',
      'top:40px',
      'left:' + _preset.channel_col_w + 'px',
      'right:0',
      'bottom:0',
      'overflow:hidden'
    ].join(';'));
    _dom.progArea = progArea;

    // NOW hairline (position updated in render).
    var hairline = _el('div', 'epg-hairline', [
      'position:absolute',
      'top:0',
      'width:2px',
      'bottom:0',
      'background:var(--epg-now-hairline,#E53935)',
      'z-index:5',
      'pointer-events:none'
    ].join(';'));
    _dom.hairline = hairline;
    progArea.appendChild(hairline);

    wrap.appendChild(header);
    wrap.appendChild(chanCol);
    wrap.appendChild(progArea);

    _containerEl.appendChild(wrap);
    _dom.wrap = wrap;
  }

  // Build the time header labels (every 30 min across the window).
  function _renderTimeHeader() {
    if (!_dom.header) return;
    while (_dom.header.firstChild) _dom.header.removeChild(_dom.header.firstChild);

    var step = 30 * 60 * 1000; // 30 minutes in ms
    var tick = Math.ceil(_windowStart / step) * step;

    while (tick <= _windowEnd) {
      var x = _utcToX(tick);
      if (x >= 0 && x <= _timeAreaWidth) {
        var lbl = _el('div', 'epg-time-label', [
          'position:absolute',
          'left:' + Math.round(x) + 'px',
          'top:0',
          'height:40px',
          'line-height:40px',
          'font-size:12px',
          'color:var(--text-secondary,#B7BDC6)',
          'padding-left:4px',
          'white-space:nowrap',
          'user-select:none'
        ].join(';'));
        lbl.textContent = _formatTime(tick);
        _dom.header.appendChild(lbl);
      }
      tick += step;
    }
  }

  // Update the NOW hairline position.
  function _renderHairline() {
    if (!_dom.hairline) return;
    var x = _utcToX(_nowUtc);
    _dom.hairline.style.left = Math.round(x) + 'px';
  }

  // ---------------------------------------------------------------------------
  // Row pool and virtualization
  // ---------------------------------------------------------------------------

  function _createRowEl() {
    // A row = channel cell + program blocks container.
    var row = _el('div', 'epg-row', [
      'position:absolute',
      'left:0',
      'right:0',
      'height:' + _preset.row_height + 'px'
    ].join(';'));

    var chanCell = _el('div', 'epg-chan-cell', [
      'position:absolute',
      'left:0',
      'top:0',
      'width:' + _preset.channel_col_w + 'px',
      'height:100%',
      'display:flex',
      'align-items:center',
      'padding:0 8px',
      'gap:8px',
      'overflow:hidden',
      'box-sizing:border-box',
      'border-bottom:1px solid var(--surface-1,#262C36)'
    ].join(';'));

    var logo = _el('img', 'epg-chan-logo', [
      'width:' + _preset.logo_size + 'px',
      'height:' + _preset.logo_size + 'px',
      'object-fit:contain',
      'flex-shrink:0'
    ].join(';'));
    logo.setAttribute('alt', '');

    var chanInfo = _el('div', 'epg-chan-info', 'overflow:hidden;');

    var chanNum = _el('div', 'epg-chan-num', [
      'font-size:12px',
      'color:var(--text-secondary,#B7BDC6)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis'
    ].join(';'));

    var chanName = _el('div', 'epg-chan-name', [
      'font-size:' + Math.round(_preset.title_font * 0.7) + 'px',
      'color:var(--text-primary,#F2F4F7)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis'
    ].join(';'));

    chanInfo.appendChild(chanNum);
    chanInfo.appendChild(chanName);
    chanCell.appendChild(logo);
    chanCell.appendChild(chanInfo);

    var progRow = _el('div', 'epg-prog-row', [
      'position:absolute',
      'left:' + _preset.channel_col_w + 'px',
      'right:0',
      'top:0',
      'height:100%',
      'overflow:hidden'
    ].join(';'));

    row.appendChild(chanCell);
    row.appendChild(progRow);

    row._chanCell  = chanCell;
    row._chanLogo  = logo;
    row._chanNum   = chanNum;
    row._chanName  = chanName;
    row._progRow   = progRow;

    return row;
  }

  function _ensurePool(size) {
    while (_rowPool.length < size) {
      var rowEl = _createRowEl();
      rowEl.style.display = 'none';
      // Channel column and prog area need separate parents.
      // We use a single row element and position channel cell and prog row
      // both inside it, but the channel cell is visually pinned by sticky/absolute.
      // For simplicity on Tizen, the row straddles both columns at the same top offset.
      _dom.wrap.appendChild(rowEl);
      _rowPool.push(rowEl);
    }
  }

  // Build program blocks for a channel row.
  function _renderProgRow(progRowEl, channelId, rowChanIdx) {
    while (progRowEl.firstChild) progRowEl.removeChild(progRowEl.firstChild);

    var progs = _visiblePrograms(channelId);
    var totalMs = _windowEnd - _windowStart;
    if (totalMs <= 0) return;

    for (var i = 0; i < progs.length; i++) {
      var p = progs[i];
      var state = _progState(p);

      var x     = Math.max(0, _utcToX(p.start_utc));
      var xEnd  = Math.min(_timeAreaWidth, _utcToX(p.end_utc));
      var width = Math.max(1, xEnd - x);

      var isFocused = (_focusedRow === rowChanIdx && _focusedProg === p);

      var block = _el('div', 'epg-prog-block', [
        'position:absolute',
        'left:' + Math.round(x) + 'px',
        'width:' + Math.round(width) + 'px',
        'top:1px',
        'height:' + (_preset.row_height - 2) + 'px',
        'box-sizing:border-box',
        'overflow:hidden',
        'border-right:1px solid var(--bg-0,#0B0D10)',
        'background:' + (isFocused ? 'var(--epg-focus-bg,#533483)' : _progBgColor(state)),
        'color:' + (isFocused ? 'var(--epg-focus-text,#FFFFFF)' : _progTextColor(state)),
        'padding:4px 8px',
        'cursor:pointer'
      ].join(';'));

      var titleEl = _el('div', 'epg-prog-title', [
        'font-size:' + _preset.title_font + 'px',
        'font-weight:600',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis'
      ].join(';'));
      titleEl.textContent = p.title || '';
      block.appendChild(titleEl);

      var timeEl = _el('div', 'epg-prog-time', [
        'font-size:' + Math.round(_preset.title_font * 0.7) + 'px',
        'opacity:0.8',
        'white-space:nowrap'
      ].join(';'));
      timeEl.textContent = _formatTime(p.start_utc) + ' – ' + _formatTime(p.end_utc);
      block.appendChild(timeEl);

      // Current program: progress bar.
      if (state === 'current') {
        var elapsed = _nowUtc - p.start_utc;
        var duration = p.end_utc - p.start_utc;
        var pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

        var bar = _el('div', 'epg-prog-progress', [
          'position:absolute',
          'bottom:0',
          'left:0',
          'height:2px',
          'width:' + pct.toFixed(1) + '%',
          'background:var(--accent,#5AA1FF)'
        ].join(';'));
        block.appendChild(bar);
      }

      // Store program reference for key handling.
      block._program = p;
      block._chanIdx = rowChanIdx;

      progRowEl.appendChild(block);
    }
  }

  // ---------------------------------------------------------------------------
  // Full render pass
  // ---------------------------------------------------------------------------

  function _render() {
    if (!_dom.wrap || _channels.length === 0) return;

    _recalcTimeArea();
    _renderTimeHeader();
    _renderHairline();

    var visCount = _preset.visible_rows;
    var poolSize = visCount + 6;

    _ensurePool(poolSize);

    // Determine row range to render (±3 of _firstVisRow).
    var firstRender = Math.max(0, _firstVisRow - 3);
    var lastRender  = Math.min(_channels.length - 1, _firstVisRow + visCount - 1 + 3);

    // Hide all pool rows initially.
    for (var i = 0; i < _rowPool.length; i++) {
      _rowPool[i].style.display = 'none';
    }

    var poolIdx = 0;

    for (var r = firstRender; r <= lastRender; r++) {
      if (poolIdx >= _rowPool.length) break;

      var ch  = _channels[r];
      var row = _rowPool[poolIdx];
      poolIdx++;

      var topOffset = (r - _firstVisRow) * _preset.row_height + 40; // 40 = header height

      row.style.display = 'block';
      row.style.top     = topOffset + 'px';

      // Channel cell.
      row._chanNum.textContent  = ch.channel_number ? String(ch.channel_number) : '';
      row._chanName.textContent = ch.display_name || '';
      if (ch.logo_url) {
        row._chanLogo.src = ch.logo_url;
        row._chanLogo.style.display = 'block';
      } else {
        row._chanLogo.style.display = 'none';
      }

      // Program blocks.
      _renderProgRow(row._progRow, ch.channel_id, r);
    }
  }

  // ---------------------------------------------------------------------------
  // Focus helpers
  // ---------------------------------------------------------------------------

  function _findFocusedProgIdx() {
    var progs = _visiblePrograms(_channels[_focusedRow] && _channels[_focusedRow].channel_id);
    for (var i = 0; i < progs.length; i++) {
      if (progs[i] === _focusedProg) return i;
    }
    return -1;
  }

  function _setFocusedRow(newRow) {
    _focusedRow = _clamp(newRow, 0, _channels.length - 1);

    // Scroll viewport so focused row is visible.
    if (_focusedRow < _firstVisRow) {
      _firstVisRow = _focusedRow;
    } else if (_focusedRow >= _firstVisRow + _preset.visible_rows) {
      _firstVisRow = _focusedRow - _preset.visible_rows + 1;
    }

    // Try to keep a sensibly focused program.
    var progs = _visiblePrograms(_channels[_focusedRow].channel_id);
    if (progs.length > 0) {
      // Focus the current-playing program, or the first visible.
      _focusedProg = null;
      for (var i = 0; i < progs.length; i++) {
        if (_progState(progs[i]) === 'current') { _focusedProg = progs[i]; break; }
      }
      if (!_focusedProg) _focusedProg = progs[0];
    } else {
      _focusedProg = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function mount(containerId, profile) {
    _containerId = containerId;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) {
      if (typeof console !== 'undefined') {
        console.warn('[epgGrid] Container not found: ' + containerId);
      }
      return;
    }

    _profile = profile || 'dave_tv';
    var pid = (typeof _profile === 'object' && _profile.profile_id) ? _profile.profile_id : _profile;
    _preset  = PRESETS[pid] || PRESETS['dave_tv'];

    _recalcWindow();
    _recalcTimeArea();
    _buildShell();
  }

  function loadData(channels, programs) {
    _channels = Array.isArray(channels) ? channels : [];
    _programs = {};

    var progs = Array.isArray(programs) ? programs : [];
    // Index programs by channel_id and sort by start_utc.
    for (var i = 0; i < progs.length; i++) {
      var p = progs[i];
      var cid = p.channel_id;
      if (!_programs[cid]) _programs[cid] = [];
      _programs[cid].push(p);
    }
    Object.keys(_programs).forEach(function(cid) {
      _programs[cid].sort(function(a, b) { return a.start_utc - b.start_utc; });
    });

    _firstVisRow = 0;
    _focusedRow  = 0;
    _focusedProg = null;

    if (_channels.length > 0) {
      _setFocusedRow(0);
    }

    _render();
  }

  function setTime(nowUtc) {
    _nowUtc = nowUtc;
    _recalcWindow();
    _render();
  }

  function handleKey(keyCode) {
    if (!_channels.length) return false;

    if (keyCode === KEY_UP) {
      if (_focusedRow > 0) {
        _setFocusedRow(_focusedRow - 1);
        _render();
        return true;
      }
    } else if (keyCode === KEY_DOWN) {
      if (_focusedRow < _channels.length - 1) {
        _setFocusedRow(_focusedRow + 1);
        _render();
        return true;
      }
    } else if (keyCode === KEY_LEFT) {
      var progs = _visiblePrograms(_channels[_focusedRow].channel_id);
      var idx = _findFocusedProgIdx();
      if (idx > 0) {
        _focusedProg = progs[idx - 1];
        _render();
        return true;
      }
    } else if (keyCode === KEY_RIGHT) {
      var progsR = _visiblePrograms(_channels[_focusedRow].channel_id);
      var idxR = _findFocusedProgIdx();
      if (idxR >= 0 && idxR < progsR.length - 1) {
        _focusedProg = progsR[idxR + 1];
        _render();
        return true;
      }
    } else if (keyCode === KEY_OK) {
      // Selection handled by caller.
      return !!_focusedProg;
    }

    return false;
  }

  function getFocusedProgram() {
    return _focusedProg || null;
  }

  function destroy() {
    if (_dom.wrap && _dom.wrap.parentNode) {
      _dom.wrap.parentNode.removeChild(_dom.wrap);
    }

    _dom        = {};
    _rowPool    = [];
    _channels   = [];
    _programs   = {};
    _containerEl = null;
    _focusedProg = null;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesEpgGrid = {
    mount:             mount,
    loadData:          loadData,
    setTime:           setTime,
    handleKey:         handleKey,
    getFocusedProgram: getFocusedProgram,
    destroy:           destroy
  };
}());

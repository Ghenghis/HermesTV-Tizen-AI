// HermesTV Action Card — modal confirmation card for agent-requested actions.
// D-pad navigation cycles through action buttons. OK confirms. BACK dismisses.
(function() {
  'use strict';

  var KEY_OK   = 13;
  var KEY_BACK = 10009;
  var KEY_LEFT  = 37;
  var KEY_RIGHT = 39;
  var KEY_UP    = 38;
  var KEY_DOWN  = 40;

  var FOCUS_GROUP = 'hermes-action-card';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _open      = false;
  var _backdropEl = null;
  var _cardEl    = null;
  var _onAction  = null;
  var _btnEls    = [];
  var _focusIdx  = 0;
  var _keyHandler = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _el(tag, cls, styles) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (styles) e.style.cssText = styles;
    return e;
  }

  function _focusBtn(idx) {
    if (_btnEls.length === 0) return;
    idx = Math.max(0, Math.min(idx, _btnEls.length - 1));
    _focusIdx = idx;

    for (var i = 0; i < _btnEls.length; i++) {
      _btnEls[i].classList.remove('focus-active');
    }
    _btnEls[_focusIdx].classList.add('focus-active');

    // Keep hermesFocus in sync.
    if (window.hermesFocus) {
      window.hermesFocus.setActive(_btnEls[_focusIdx]);
    }
  }

  function _onKeydown(e) {
    if (!_open) return;

    var kc = e.keyCode;

    if (kc === KEY_OK) {
      e.stopPropagation();
      var btn = _btnEls[_focusIdx];
      if (btn) {
        var actionId = btn.getAttribute('data-action-id');
        hide();
        if (typeof _onAction === 'function') _onAction(actionId);
      }
    } else if (kc === KEY_BACK) {
      e.stopPropagation();
      hide();
      if (typeof _onAction === 'function') _onAction(null);
    } else if (kc === KEY_LEFT || kc === KEY_UP) {
      e.stopPropagation();
      _focusBtn(_focusIdx - 1);
    } else if (kc === KEY_RIGHT || kc === KEY_DOWN) {
      e.stopPropagation();
      _focusBtn(_focusIdx + 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Button style by action style hint
  // ---------------------------------------------------------------------------

  function _btnStyle(style) {
    var base = [
      'padding:10px 24px',
      'border:none',
      'border-radius:8px',
      'font-size:16px',
      'font-weight:600',
      'cursor:pointer',
      'min-width:100px',
      'font-family:\'Samsung One\',\'Malgun Gothic\',system-ui,sans-serif'
    ].join(';');

    if (style === 'danger') {
      return base + ';background:var(--danger,#FF5A5A);color:#fff;';
    }
    if (style === 'secondary') {
      return base + ';background:var(--surface-1,#262C36);color:var(--text-primary,#F2F4F7);';
    }
    // default = primary
    return base + ';background:var(--accent,#5AA1FF);color:#fff;';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function show(config) {
    if (_open) hide();

    _onAction = (config && typeof config.onAction === 'function') ? config.onAction : null;
    _btnEls   = [];
    _focusIdx = 0;

    // Backdrop
    _backdropEl = _el('div', 'overlay-backdrop', '');
    document.body.appendChild(_backdropEl);

    // Card
    _cardEl = _el('div', 'hermes-action-card', [
      'position:fixed',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%)',
      'background:var(--surface-0,#1F242C)',
      'border-radius:16px',
      'padding:32px',
      'min-width:360px',
      'max-width:520px',
      'z-index:600',
      'font-family:\'Samsung One\',\'Malgun Gothic\',system-ui,sans-serif'
    ].join(';'));

    // Title
    if (config && config.title) {
      var titleEl = _el('h2', 'hermes-action-card__title', [
        'margin:0 0 12px 0',
        'font-size:22px',
        'color:var(--text-primary,#F2F4F7)'
      ].join(';'));
      titleEl.textContent = config.title;
      _cardEl.appendChild(titleEl);
    }

    // Body
    if (config && config.body) {
      var bodyEl = _el('p', 'hermes-action-card__body', [
        'margin:0 0 24px 0',
        'font-size:16px',
        'line-height:1.6',
        'color:var(--text-secondary,#B7BDC6)'
      ].join(';'));
      bodyEl.textContent = config.body;
      _cardEl.appendChild(bodyEl);
    }

    // Actions
    var actions = (config && Array.isArray(config.actions)) ? config.actions : [];
    var actionsRow = _el('div', 'hermes-action-card__actions', [
      'display:flex',
      'gap:16px',
      'flex-wrap:wrap'
    ].join(';'));

    for (var i = 0; i < actions.length; i++) {
      var act = actions[i];
      var btn = _el('button', 'hermes-action-card__btn', _btnStyle(act.style));
      btn.textContent = act.label || 'OK';
      btn.setAttribute('data-action-id', act.action_id || '');
      _btnEls.push(btn);
      actionsRow.appendChild(btn);
    }

    // If no actions defined, add a default dismiss button.
    if (_btnEls.length === 0) {
      var dismissBtn = _el('button', 'hermes-action-card__btn', _btnStyle('secondary'));
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.setAttribute('data-action-id', '__dismiss__');
      _btnEls.push(dismissBtn);
      actionsRow.appendChild(dismissBtn);
    }

    _cardEl.appendChild(actionsRow);
    document.body.appendChild(_cardEl);

    _open = true;

    // Register buttons with focus engine.
    if (window.hermesFocus) {
      window.hermesFocus.register(_btnEls, FOCUS_GROUP);
      window.hermesFocus.pushGroup(FOCUS_GROUP);
    }

    _focusBtn(0);

    // Capture keydown at document level.
    _keyHandler = _onKeydown;
    document.addEventListener('keydown', _keyHandler, true);
  }

  function hide() {
    if (!_open) return;
    _open = false;

    if (_keyHandler) {
      document.removeEventListener('keydown', _keyHandler, true);
      _keyHandler = null;
    }

    if (window.hermesFocus) {
      window.hermesFocus.popGroup();
      window.hermesFocus.unregister(FOCUS_GROUP);
    }

    if (_backdropEl && _backdropEl.parentNode) {
      _backdropEl.parentNode.removeChild(_backdropEl);
    }
    if (_cardEl && _cardEl.parentNode) {
      _cardEl.parentNode.removeChild(_cardEl);
    }

    _backdropEl = null;
    _cardEl     = null;
    _btnEls     = [];
    _onAction   = null;
  }

  function isOpen() {
    return _open;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesActionCard = {
    show:   show,
    hide:   hide,
    isOpen: isOpen
  };
}());

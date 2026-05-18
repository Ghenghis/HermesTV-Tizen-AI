// HermesTV AI Chatbot Floating Overlay.
// Four states: minimized, compact, expanded, walkie-talkie.
// Input is validated to reject credential-like strings.
// Focus management integrates with hermesFocus.
(function() {
  'use strict';

  var KEY_BACK = 10009;
  var KEY_OK   = 13;

  var CRED_PATTERN = /password|api_key|secret|token/i;
  var MAX_MESSAGES = 50;

  // States
  var STATES = { minimized: 1, compact: 1, expanded: 1, 'walkie-talkie': 1 };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _state      = 'minimized';
  var _parentEl   = null;
  var _rootEl     = null;
  var _messages   = []; // { role, text }

  // DOM references
  var _dom = {};

  // Focus group ID for this overlay.
  var FOCUS_GROUP = 'hermes-overlay';

  // ---------------------------------------------------------------------------
  // DOM builders
  // ---------------------------------------------------------------------------

  function _el(tag, cls, styles) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (styles) e.style.cssText = styles;
    return e;
  }

  function _buildRoot() {
    var root = _el('div', 'hermes-overlay', [
      'position:fixed',
      'bottom:32px',
      'right:32px',
      'z-index:500',
      'font-family:\'Samsung One\',\'Malgun Gothic\',system-ui,sans-serif'
    ].join(';'));

    // --- Minimized button ---
    var minBtn = _el('div', 'hermes-overlay__min-btn', [
      'width:48px',
      'height:48px',
      'border-radius:50%',
      'background:var(--accent,#5AA1FF)',
      'color:#fff',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:22px',
      'font-weight:700',
      'cursor:pointer',
      'user-select:none'
    ].join(';'));
    minBtn.textContent = 'H';
    _dom.minBtn = minBtn;

    // --- Compact panel (280px, last 2 messages + input) ---
    var compactPanel = _el('div', 'hermes-overlay__compact', [
      'width:280px',
      'background:var(--surface-0,#1F242C)',
      'border-radius:12px',
      'padding:12px',
      'display:none'
    ].join(';'));

    var compactHistory = _el('div', 'hermes-overlay__compact-history', [
      'margin-bottom:8px',
      'font-size:14px',
      'color:var(--text-secondary,#B7BDC6)'
    ].join(';'));
    _dom.compactHistory = compactHistory;

    var compactInput = _buildInputRow('compact');
    _dom.compactInput = compactInput.input;
    _dom.compactSend  = compactInput.btn;

    compactPanel.appendChild(compactHistory);
    compactPanel.appendChild(compactInput.row);
    _dom.compactPanel = compactPanel;

    // --- Expanded panel (400px, 60% height) ---
    var expandedPanel = _el('div', 'hermes-overlay__expanded', [
      'width:400px',
      'height:60vh',
      'background:var(--surface-0,#1F242C)',
      'border-radius:12px',
      'padding:16px',
      'display:none',
      'flex-direction:column'
    ].join(';'));

    var expandedTitle = _el('div', 'hermes-overlay__title', [
      'font-size:18px',
      'font-weight:700',
      'color:var(--text-primary,#F2F4F7)',
      'margin-bottom:10px'
    ].join(';'));
    expandedTitle.textContent = 'Hermes';

    var expandedHistory = _el('div', 'hermes-overlay__history', [
      'flex:1',
      'overflow-y:auto',
      'margin-bottom:10px',
      'font-size:15px',
      'line-height:1.6'
    ].join(';'));
    _dom.expandedHistory = expandedHistory;

    var expandedInput = _buildInputRow('expanded');
    _dom.expandedInput = expandedInput.input;
    _dom.expandedSend  = expandedInput.btn;

    expandedPanel.appendChild(expandedTitle);
    expandedPanel.appendChild(expandedHistory);
    expandedPanel.appendChild(expandedInput.row);
    _dom.expandedPanel = expandedPanel;

    // --- Walkie-talkie (full-screen semi-transparent, large mic icon) ---
    var wt = _el('div', 'hermes-overlay__walkie', [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.82)',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'z-index:600'
    ].join(';'));

    var micIcon = _el('div', 'hermes-overlay__mic', [
      'font-size:96px',
      'color:var(--accent,#5AA1FF)',
      'margin-bottom:24px'
    ].join(';'));
    micIcon.textContent = '🎙';

    var micLabel = _el('div', '', [
      'color:var(--text-primary,#F2F4F7)',
      'font-size:24px'
    ].join(';'));
    micLabel.textContent = 'Listening…';

    wt.appendChild(micIcon);
    wt.appendChild(micLabel);
    _dom.walkie = wt;

    root.appendChild(minBtn);
    root.appendChild(compactPanel);
    root.appendChild(expandedPanel);

    // Walkie-talkie appended to body (full-screen).
    document.body.appendChild(wt);

    return root;
  }

  function _buildInputRow(prefix) {
    var row = _el('div', 'hermes-overlay__input-row', [
      'display:flex',
      'gap:8px',
      'align-items:center'
    ].join(';'));

    var input = _el('input', 'hermes-overlay__input', [
      'flex:1',
      'background:var(--bg-2,#1B1F26)',
      'border:1px solid var(--surface-1,#262C36)',
      'border-radius:6px',
      'color:var(--text-primary,#F2F4F7)',
      'padding:6px 10px',
      'font-size:14px',
      'outline:none'
    ].join(';'));
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', 'Ask Hermes…');
    input.setAttribute('autocomplete', 'off');

    var btn = _el('button', 'hermes-overlay__send', [
      'background:var(--accent,#5AA1FF)',
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'padding:6px 12px',
      'font-size:14px',
      'cursor:pointer'
    ].join(';'));
    btn.textContent = 'Send';

    row.appendChild(input);
    row.appendChild(btn);
    return { row: row, input: input, btn: btn };
  }

  // ---------------------------------------------------------------------------
  // Message rendering
  // ---------------------------------------------------------------------------

  function _renderMessages(containerEl, count) {
    // Clear current children.
    while (containerEl.firstChild) {
      containerEl.removeChild(containerEl.firstChild);
    }

    var slice = count ? _messages.slice(-count) : _messages;

    for (var i = 0; i < slice.length; i++) {
      var msg = slice[i];
      var msgEl = document.createElement('div');
      msgEl.style.cssText = [
        'padding:4px 0',
        msg.role === 'user'
          ? 'color:var(--text-primary,#F2F4F7)'
          : 'color:var(--accent,#5AA1FF)'
      ].join(';');

      var prefix = document.createTextNode(msg.role === 'user' ? 'You: ' : 'Hermes: ');
      var text   = document.createTextNode(msg.text);
      msgEl.appendChild(prefix);
      msgEl.appendChild(text);
      containerEl.appendChild(msgEl);
    }

    // Scroll to bottom.
    containerEl.scrollTop = containerEl.scrollHeight;
  }

  function _refreshHistory() {
    if (_dom.compactHistory) {
      _renderMessages(_dom.compactHistory, 2);
    }
    if (_dom.expandedHistory) {
      _renderMessages(_dom.expandedHistory, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  function setState(state) {
    if (!STATES[state]) {
      if (typeof console !== 'undefined') console.warn('[hermesOverlay] Unknown state: ' + state);
      return;
    }

    _state = state;

    // Reset visibility.
    if (_dom.minBtn)       _dom.minBtn.style.display       = 'none';
    if (_dom.compactPanel) _dom.compactPanel.style.display = 'none';
    if (_dom.expandedPanel) {
      _dom.expandedPanel.style.display = 'none';
    }
    if (_dom.walkie)       _dom.walkie.style.display       = 'none';

    // Unregister focus group first.
    if (window.hermesFocus) {
      window.hermesFocus.unregister(FOCUS_GROUP);
    }

    switch (state) {
      case 'minimized':
        if (_dom.minBtn) _dom.minBtn.style.display = 'flex';
        if (window.hermesFocus) {
          window.hermesFocus.register([_dom.minBtn], FOCUS_GROUP);
          window.hermesFocus.setActive(_dom.minBtn);
        }
        break;

      case 'compact':
        if (_dom.compactPanel) _dom.compactPanel.style.display = 'block';
        _refreshHistory();
        if (window.hermesFocus) {
          window.hermesFocus.register(
            [_dom.compactInput, _dom.compactSend],
            FOCUS_GROUP
          );
          window.hermesFocus.setActive(_dom.compactInput);
        }
        break;

      case 'expanded':
        if (_dom.expandedPanel) {
          _dom.expandedPanel.style.display = 'flex';
        }
        _refreshHistory();
        if (window.hermesFocus) {
          window.hermesFocus.register(
            [_dom.expandedInput, _dom.expandedSend],
            FOCUS_GROUP
          );
          window.hermesFocus.setActive(_dom.expandedInput);
        }
        break;

      case 'walkie-talkie':
        if (_dom.walkie) _dom.walkie.style.display = 'flex';
        break;
    }
  }

  function getState() {
    return _state;
  }

  // ---------------------------------------------------------------------------
  // Message management
  // ---------------------------------------------------------------------------

  function addMessage(role, text) {
    if (role !== 'user' && role !== 'agent') role = 'agent';
    _messages.push({ role: role, text: text });
    if (_messages.length > MAX_MESSAGES) _messages.shift();
    _refreshHistory();
  }

  // ---------------------------------------------------------------------------
  // Input send (validates via commandRouter)
  // ---------------------------------------------------------------------------

  function sendInput(text) {
    var trimmed = (text || '').trim();
    if (!trimmed) return;

    // Credential guard.
    if (CRED_PATTERN.test(trimmed)) {
      addMessage('agent', 'Please don\'t share credentials with Hermes.');
      return;
    }

    addMessage('user', trimmed);

    // Route via commandRouter.
    if (!window.hermesCommandRouter || !window.hermesProfile) {
      addMessage('agent', '(Offline — command router unavailable.)');
      return;
    }

    var profile = window.hermesProfile.get();
    var profileId = profile ? profile.profile_id : null;
    if (!profileId) {
      addMessage('agent', '(No active profile.)');
      return;
    }

    window.hermesCommandRouter.send(
      profileId,
      'show_notification',
      { message: trimmed },
      function(err, response) {
        if (err) {
          addMessage('agent', '(Error: ' + (err.message || 'unknown') + ')');
        } else {
          var reply = (response && response.message) || '(Command sent.)';
          addMessage('agent', reply);
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Key handler
  // ---------------------------------------------------------------------------

  function _onKeydown(e) {
    if (e.keyCode === KEY_BACK) {
      if (_state === 'expanded' || _state === 'compact') {
        setState('minimized');
        e.stopPropagation();
      } else if (_state === 'walkie-talkie') {
        setState('minimized');
        e.stopPropagation();
      }
    }

    if (e.keyCode === KEY_OK) {
      if (_state === 'minimized') {
        setState('compact');
      }
    }
  }

  document.addEventListener('keydown', _onKeydown, true);

  // ---------------------------------------------------------------------------
  // Send button click handlers
  // ---------------------------------------------------------------------------

  function _bindSendBtn(inputEl, btnEl) {
    if (!btnEl || !inputEl) return;
    btnEl.addEventListener('click', function() {
      sendInput(inputEl.value);
      inputEl.value = '';
    });
    inputEl.addEventListener('keydown', function(e) {
      if (e.keyCode === 13) {
        sendInput(inputEl.value);
        inputEl.value = '';
        e.stopPropagation();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // mount
  // ---------------------------------------------------------------------------

  function mount(parentEl) {
    _parentEl = parentEl;
    _rootEl   = _buildRoot();
    _parentEl.appendChild(_rootEl);

    _bindSendBtn(_dom.compactInput,  _dom.compactSend);
    _bindSendBtn(_dom.expandedInput, _dom.expandedSend);

    // Start in minimized state.
    setState('minimized');
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesOverlay = {
    mount:      mount,
    setState:   setState,
    getState:   getState,
    addMessage: addMessage,
    sendInput:  sendInput
  };
}());

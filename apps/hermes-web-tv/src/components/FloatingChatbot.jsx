import React from 'react';
import { validateCommand, generateCommandId } from './CommandValidator.jsx';
import * as commandStore from '../store/commandStore.js';
import * as hermesApi from '../api/hermesApi.js';
// mockApi used indirectly via App-level online flag

var STATES = { minimized: 'minimized', compact: 'compact', expanded: 'expanded', walkie: 'walkie-talkie' };

var MOCK_HISTORY = [
  { role: 'agent', text: 'Hi! I\'m Hermes. How can I help you today?' },
];

function FloatingChatbot(props) {
  var profile = props.profile || {};
  var online = props.online !== false;

  var agentName = profile.agent_name || 'Hermes';
  var profileId = profile.profile_id || 'dave_tv';

  var chatState = STATES.minimized;
  var setChatState = null;
  var stateResult = React.useState(STATES.minimized);
  chatState = stateResult[0];
  setChatState = stateResult[1];

  var historyResult = React.useState(MOCK_HISTORY.slice());
  var history = historyResult[0];
  var setHistory = historyResult[1];

  var inputResult = React.useState('');
  var inputText = inputResult[0];
  var setInputText = inputResult[1];

  var submitResult = React.useState(false);
  var submitting = submitResult[0];
  var setSubmitting = submitResult[1];

  var errorState = React.useState('');
  var errorText = errorState[0];
  var setErrorText = errorState[1];

  function handleMinimizedKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setChatState(STATES.compact);
    }
  }

  function handleSend() {
    var text = inputText.trim();
    if (!text) { return; }

    // Never accept credentials — rudimentary check
    var lowerText = text.toLowerCase();
    if (
      lowerText.indexOf('password') !== -1 ||
      lowerText.indexOf('credential') !== -1 ||
      lowerText.indexOf('token') !== -1 ||
      lowerText.indexOf('api_key') !== -1 ||
      lowerText.indexOf('secret') !== -1
    ) {
      setErrorText('Credential input is not accepted. Please use the QR onboarding flow.');
      return;
    }

    setErrorText('');

    // Build a mock command envelope for non-credential text commands
    var envelope = {
      schema: 'hermestv.ui.v1',
      command_id: generateCommandId(),
      profile_id: profileId,
      action: 'show_notification',
      payload: { message: text },
      issued_at: new Date().toISOString(),
    };

    var validation = validateCommand(envelope);
    if (!validation.valid) {
      setErrorText('Command validation failed: ' + validation.errors.join('; '));
      return;
    }

    // Record in audit log
    commandStore.record(envelope);

    // Add user message to history
    setHistory(function(prev) {
      return prev.concat([{ role: 'user', text: text }]);
    });
    setInputText('');
    setSubmitting(true);

    var submitPromise = online
      ? hermesApi.submitCommand(envelope)
      : Promise.resolve({ status: 'mock_ack', offline: true });

    submitPromise.then(function(result) {
      setSubmitting(false);
      var responseText = result && result.offline
        ? agentName + ' is in offline mode. Your command was recorded locally.'
        : agentName + ' received your message.';
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: responseText }]);
      });
    }).catch(function() {
      setSubmitting(false);
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: 'I couldn\'t reach the server right now. Your message was saved locally.' }]);
      });
    });
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setChatState(STATES.minimized);
    }
  }

  var lastTwo = history.slice(-2);

  // ── Minimized state ──
  if (chatState === STATES.minimized) {
    return (
      <button
        tabIndex={0}
        aria-label={'Open ' + agentName + ' chatbot'}
        onClick={function() { setChatState(STATES.compact); }}
        onKeyDown={handleMinimizedKey}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--accent)',
          border: 'none',
          color: '#ffffff',
          fontSize: '1.5rem',
          fontWeight: '800',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          outline: 'none',
          zIndex: 200,
          transition: 'transform 0.15s',
        }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid var(--accent)';
          e.currentTarget.style.outlineOffset = '3px';
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        H
      </button>
    );
  }

  // ── Compact state ──
  if (chatState === STATES.compact) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '320px',
          backgroundColor: 'var(--surface)',
          border: '2px solid var(--border, #30363d)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: '700', color: 'var(--accent)' }}>
            {agentName}
          </span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              tabIndex={0}
              onClick={function() { setChatState(STATES.expanded); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
              aria-label="Expand chat"
            >
              Expand
            </button>
            <button
              tabIndex={0}
              onClick={function() { setChatState(STATES.minimized); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
              aria-label="Minimize chat"
            >
              &times;
            </button>
          </div>
        </div>
        {lastTwo.map(function(msg, idx) {
          return (
            <div
              key={idx}
              style={{
                fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                color: msg.role === 'agent' ? 'var(--text)' : 'var(--accent)',
                marginBottom: '0.25rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <strong>{msg.role === 'agent' ? agentName : 'You'}:</strong> {msg.text}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Walkie-talkie state ──
  if (chatState === STATES.walkie) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '220px',
          backgroundColor: 'var(--surface)',
          border: '2px solid var(--accent)',
          borderRadius: '12px',
          padding: '1.5rem',
          zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: '700', color: 'var(--accent)' }}>
          {agentName} — Voice
        </div>
        {/* Mic indicator */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            boxShadow: '0 0 0 8px rgba(var(--accent-hover, #388bfd), 0.2)',
          }}
        >
          {/* Mic icon via unicode */}
          <span aria-hidden="true">&#x1F3A4;</span>
        </div>
        <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)', textAlign: 'center' }}>
          Listening... (mock mode — Azure TTS only)
        </div>
        <button
          tabIndex={0}
          autoFocus
          onClick={function() { setChatState(STATES.expanded); }}
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: 'var(--surface-raised, var(--surface))',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '6px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 'calc(0.8rem * var(--font-scale, 1))',
            outline: 'none',
          }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
          }}
        >
          Switch to text
        </button>
      </div>
    );
  }

  // ── Expanded state (default fallback) ──
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: '380px',
        maxHeight: '520px',
        backgroundColor: 'var(--surface)',
        border: '2px solid var(--border, #30363d)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border, #30363d)',
          backgroundColor: 'var(--surface-raised, var(--surface))',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: '800',
              color: '#fff',
            }}
          >
            H
          </div>
          <span style={{ fontSize: 'calc(0.9rem * var(--font-scale, 1))', fontWeight: '700', color: 'var(--accent)' }}>
            {agentName}
          </span>
          {!online && (
            <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', color: '#e3b341', backgroundColor: 'rgba(227,179,65,0.15)', border: '1px solid #e3b341', borderRadius: '3px', padding: '0.1rem 0.35rem' }}>
              OFFLINE
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button
            tabIndex={0}
            onClick={function() { setChatState(STATES.walkie); }}
            title="Walkie-talkie mode"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
            aria-label="Switch to voice mode"
          >
            &#x1F3A4;
          </button>
          <button
            tabIndex={0}
            onClick={function() { setChatState(STATES.compact); }}
            title="Compact view"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
            aria-label="Compact view"
          >
            &#x25BC;
          </button>
          <button
            tabIndex={0}
            onClick={function() { setChatState(STATES.minimized); }}
            title="Minimize"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
            aria-label="Minimize chatbot"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Chat history */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {history.map(function(msg, idx) {
          var isAgent = msg.role === 'agent';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: isAgent ? 'flex-start' : 'flex-end',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  backgroundColor: isAgent ? 'var(--surface-raised, #1c2128)' : 'var(--accent)',
                  color: isAgent ? 'var(--text)' : '#ffffff',
                  fontSize: 'calc(0.875rem * var(--font-scale, 1))',
                  lineHeight: '1.4',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {submitting && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '4px 12px 12px 12px',
                backgroundColor: 'var(--surface-raised, #1c2128)',
                color: 'var(--muted)',
                fontSize: 'calc(0.875rem * var(--font-scale, 1))',
              }}
            >
              {agentName} is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {errorText && (
        <div
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'rgba(248,81,73,0.15)',
            borderTop: '1px solid rgba(248,81,73,0.3)',
            color: '#f85149',
            fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          }}
        >
          {errorText}
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border, #30363d)',
          display: 'flex',
          gap: '0.5rem',
          flexShrink: 0,
          backgroundColor: 'var(--surface-raised, var(--surface))',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={function(e) { setInputText(e.target.value); setErrorText(''); }}
          onKeyDown={handleInputKeyDown}
          placeholder={'Message ' + agentName + '...'}
          disabled={submitting}
          style={{
            flex: 1,
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '6px',
            color: 'var(--text)',
            padding: '0.5rem 0.75rem',
            fontSize: 'calc(0.875rem * var(--font-scale, 1))',
            outline: 'none',
          }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = 'var(--border, #30363d)';
            e.currentTarget.style.outline = 'none';
          }}
        />
        <button
          tabIndex={0}
          onClick={handleSend}
          disabled={submitting || !inputText.trim()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: submitting || !inputText.trim() ? 'var(--muted)' : 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: '#ffffff',
            fontWeight: '600',
            cursor: submitting || !inputText.trim() ? 'not-allowed' : 'pointer',
            fontSize: 'calc(0.875rem * var(--font-scale, 1))',
            outline: 'none',
            transition: 'background-color 0.15s',
          }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default FloatingChatbot;

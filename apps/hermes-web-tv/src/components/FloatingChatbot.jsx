import React from 'react';
import { validateCommand, generateCommandId } from './CommandValidator.jsx';
import * as commandStore from '../store/commandStore.js';
import * as hermesApi from '../api/hermesApi.js';
import * as mockApi from '../api/mockApi.js';
import * as voiceClient from '../api/azureVoiceClient.js';
import * as voicePrefStore from '../store/voicePrefStore.js';
import { getResponseText } from '../utils/commandResponseText.js';
import { matchGreeting } from '../utils/chatbotGreetings.js';
import CommandChips from './CommandChips.jsx';
import CommandHelpModal from './CommandHelpModal.jsx';
import { SkeletonBlock } from './Skeleton.jsx';
import { useTranslation } from '../i18n/useTranslation.js';

var STATES = { minimized: 'minimized', compact: 'compact', expanded: 'expanded', walkie: 'walkie-talkie' };

// Friendlier no-match message shown when the backend returns
// { valid: false, source: 'no_match' } — the 22-pattern table missed and
// the LLM fallback is not configured. The user's input reached the server
// fine, so do NOT call this a connectivity issue. Translated client-side
// via the i18n `t` parameter so Spanish-locale users get the localized
// fallback too.
function buildNoMatchReply(userText, t) {
  var trimmed = (userText || '').trim();
  if (trimmed.length > 0 && trimmed.length <= 40) {
    return t('chatbot.no_match_known', { text: trimmed });
  }
  return t('chatbot.no_match_generic');
}

function FloatingChatbot(props) {
  // Pull the translator. Initial greeting is built from t() rather than
  // a module-level constant so a locale switch before the first message
  // is sent picks up the right language.
  var tx = useTranslation();
  var t = tx.t;

  var profile = props.profile || {};
  var online = props.online !== false;

  var agentName = profile.agent_name || 'Hermes';
  var profileId = profile.profile_id || 'dave_tv';

  var chatState = STATES.minimized;
  var setChatState = null;
  var stateResult = React.useState(STATES.minimized);
  chatState = stateResult[0];
  setChatState = stateResult[1];

  // Seed history with the localized greeting. We don't re-seed on locale
  // change because the user may already have messages above it; keeping
  // history stable matches Zero's behaviour.
  var historyResult = React.useState(function() {
    return [{ role: 'agent', text: t('chatbot.greeting') }];
  });
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

  var helpResult = React.useState(false);
  var showHelp = helpResult[0];
  var setShowHelp = helpResult[1];

  // Send-button ripple — toggled true for ~240ms when a message dispatches
  // (handleSend / handleChipSend), then auto-cleared so the CSS animation
  // re-fires on the next send. Pure CSS animation via .hermes-send-pulse —
  // no JS animation lib, no per-frame work. The .motion-reduced rule in
  // index.css strips the animation when the profile opts out of motion.
  var pulseResult = React.useState(false);
  var sendPulsing = pulseResult[0];
  var setSendPulsing = pulseResult[1];
  function triggerSendPulse() {
    setSendPulsing(true);
    setTimeout(function() { setSendPulsing(false); }, 240);
  }

  function handleMinimizedKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setChatState(STATES.compact);
    }
  }

  function speakIfEnabled(text) {
    if (!profile || !profile.audio_feedback) return;
    if (!online) return;
    // Azure-only voice path (project rule: docs/11 + memory feedback_voice_tts_azure_only).
    // Never fall back to browser SpeechSynthesis or Bixby — if Azure returns
    // status=azure_not_configured (202) the client treats it as silent and
    // the user sees the rendered text only. This is intentional.
    //
    // Honour the user's last-picked Azure voice from VoicePickerModal so
    // chatbot replies use Sherri's Aria / Dave's Guy preference rather than
    // whatever the server picked as the profile default. Falls back to the
    // server-side profile_id default when nothing has been persisted yet.
    // agentName is the implicit narrator (rendered in the bubble strong tag
    // above), so the spoken line stays first-person and reads naturally as
    // whichever name Sherri or Dave assigned their agent.
    var prefVoice = voicePrefStore.getVoiceId(profileId);
    voiceClient.speak(text, profileId, prefVoice || undefined).catch(function() {});
  }

  function handleSend() {
    var text = inputText.trim();
    if (!text) { return; }

    var lowerText = text.toLowerCase();
    if (
      lowerText.indexOf('password') !== -1 ||
      lowerText.indexOf('credential') !== -1 ||
      lowerText.indexOf('token') !== -1 ||
      lowerText.indexOf('api_key') !== -1 ||
      lowerText.indexOf('secret') !== -1
    ) {
      setErrorText(t('chatbot.credentials_blocked'));
      return;
    }

    setErrorText('');

    // Add user message immediately
    setHistory(function(prev) { return prev.concat([{ role: 'user', text: text }]); });
    setInputText('');
    // Tactile confirmation that the send landed — quick CSS scale pulse.
    triggerSendPulse();

    // ── Client-side greeting fast-path ─────────────────────────────────
    // "hello", "hi", "help", "thanks", etc. don't match the 22-pattern
    // command table, and the LLM fallback may be unconfigured in prod.
    // Match them locally so Mom and Dave get an instant friendly reply
    // instead of a no-match or (previously) a misleading "Couldn't reach
    // the server" message. Greetings never touch the API.
    var greetingReply = matchGreeting(text);
    if (greetingReply) {
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: greetingReply }]);
      });
      speakIfEnabled(greetingReply);
      return;
    }

    setSubmitting(true);

    // Build audit log envelope (show_notification is valid in CommandValidator)
    var envelope = {
      schema: 'hermestv.ui.v1',
      command_id: generateCommandId(),
      profile_id: profileId,
      action: 'show_notification',
      payload: { message: text },
      issued_at: new Date().toISOString(),
    };
    commandStore.record(envelope);

    // Use API when online, local matcher when offline
    var validatePromise = online
      ? hermesApi.validateCommand({ command_text: text, profile_id: profileId })
      : mockApi.validateCommand({ command_text: text, profile_id: profileId });

    validatePromise.then(function(result) {
      setSubmitting(false);
      if (result.valid) {
        if (props.onCommand) {
          props.onCommand({ action: result.action, params: result.params });
        }
        var responseText = getResponseText(result.action, result.params);
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: responseText }]);
        });
        speakIfEnabled(responseText);
      } else {
        // API responded 200 with valid:false (regex miss + LLM skipped/failed).
        // This is NOT a network failure — the server is healthy, it just
        // didn't recognise the phrase. Show a friendly client-side reply
        // rather than echoing the verbose server error string.
        var noMatchReply = buildNoMatchReply(text, t);
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: noMatchReply }]);
        });
        speakIfEnabled(noMatchReply);
      }
    }).catch(function(err) {
      // Reached only on real network failure: fetch reject, timeout
      // (hermesApi.fetchWithTimeout), or non-2xx HTTP (validateCommand
      // throws makeNetworkError when response.ok is false). The user input
      // never reached a healthy server in these cases — say so honestly.
      // err is intentionally unused (no per-error UX yet); reference once
      // so lint doesn't flag it and so console retains the diagnostic.
      if (err && err.message) { try { console.warn('[chatbot] validate failed:', err.message); } catch (e) {} }
      setSubmitting(false);
      var fallback = t('chatbot.network_error');
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: fallback }]);
      });
      speakIfEnabled(fallback);
    });
  }

  function handleChipSend(commandText) {
    setInputText(commandText);
    // Directly trigger send with this text
    setErrorText('');
    setHistory(function(prev) { return prev.concat([{ role: 'user', text: commandText }]); });
    setSubmitting(true);
    // Same pulse as the typed Send path — chip taps feel just as confirming.
    triggerSendPulse();

    var validatePromise = online
      ? hermesApi.validateCommand({ command_text: commandText, profile_id: profileId })
      : mockApi.validateCommand({ command_text: commandText, profile_id: profileId });

    validatePromise.then(function(result) {
      setSubmitting(false);
      setInputText('');
      if (result.valid) {
        if (props.onCommand) {
          props.onCommand({ action: result.action, params: result.params });
        }
        var responseText = getResponseText(result.action, result.params);
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: responseText }]);
        });
        speakIfEnabled(responseText);
      } else {
        // Same as handleSend: 200 + valid:false is a recognition miss,
        // NOT a connectivity issue. Chip commands are exact matches so
        // this should never fire, but keep the friendly fallback for
        // parity if the command table ever drifts.
        var chipNoMatch = buildNoMatchReply(commandText, t);
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: chipNoMatch }]);
        });
        speakIfEnabled(chipNoMatch);
      }
    }).catch(function(err) {
      if (err && err.message) { try { console.warn('[chatbot] chip validate failed:', err.message); } catch (e) {} }
      setSubmitting(false);
      setInputText('');
      var chipFallback = t('chatbot.network_error_short');
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: chipFallback }]);
      });
      speakIfEnabled(chipFallback);
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
        aria-label={t('chatbot.open_aria', { name: agentName })}
        onClick={function() { setChatState(STATES.compact); }}
        onKeyDown={handleMinimizedKey}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #6366f1)',
          border: 'none',
          color: '#ffffff',
          fontSize: '1.5rem',
          fontWeight: '800',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset',
          outline: 'none',
          zIndex: 200,
          transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1)',
          willChange: 'transform',
        }}
        onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '3px solid var(--accent)';
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
        className="hermes-modal-panel"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '340px',
          background: 'linear-gradient(180deg, var(--surface-raised, var(--surface)), var(--surface))',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '16px',
          padding: '0.85rem 1.1rem',
          zIndex: 200,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
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
              className="hermes-focusable hermes-press"
              onClick={function() { setChatState(STATES.expanded); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
              aria-label={t('chatbot.expand_aria')}
            >
              {t('chatbot.expand')}
            </button>
            <button
              tabIndex={0}
              className="hermes-focusable hermes-press"
              onClick={function() { setChatState(STATES.minimized); }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
              aria-label={t('chatbot.minimize_aria')}
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
              <strong>{msg.role === 'agent' ? agentName : t('common.you')}:</strong> {msg.text}
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
        className="hermes-modal-panel"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '240px',
          background: 'linear-gradient(180deg, var(--surface-raised, var(--surface)), var(--surface))',
          border: '2px solid var(--accent)',
          borderRadius: '20px',
          padding: '1.5rem',
          zIndex: 200,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: '700', color: 'var(--accent)' }}>
          {t('chatbot.voice_header', { name: agentName })}
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
          {t('chatbot.voice_listening')}
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
          {t('chatbot.voice_switch_text')}
        </button>
      </div>
    );
  }

  // ── Expanded state (default fallback) ──
  return (
    <div
      className="hermes-modal-panel"
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: '400px',
        maxHeight: '560px',
        background: 'var(--surface)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      {/* Header — gradient surface-raised → surface */}
      <div
        className="hermes-gradient-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.1rem',
          borderBottom: '1px solid var(--border, #30363d)',
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
              {t('common.offline')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button
            tabIndex={0}
            className="hermes-focusable hermes-press"
            onClick={function() { setShowHelp(true); }}
            title={t('chatbot.help_title')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
            aria-label={t('chatbot.help_aria')}
          >
            ?
          </button>
          <button
            tabIndex={0}
            className="hermes-focusable hermes-press"
            onClick={function() { setChatState(STATES.walkie); }}
            title={t('chatbot.voice_title')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
            aria-label={t('chatbot.voice_aria')}
          >
            &#x1F3A4;
          </button>
          <button
            tabIndex={0}
            className="hermes-focusable hermes-press"
            onClick={function() { setChatState(STATES.compact); }}
            title={t('chatbot.compact_aria')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.4rem' }}
            aria-label={t('chatbot.compact_aria')}
          >
            &#x25BC;
          </button>
          <button
            tabIndex={0}
            className="hermes-focusable hermes-press"
            onClick={function() { setChatState(STATES.minimized); }}
            title={t('chatbot.minimize_full_aria')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' }}
            aria-label={t('chatbot.minimize_full_aria')}
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
              className="hermes-bubble-in"
              style={{
                display: 'flex',
                justifyContent: isAgent ? 'flex-start' : 'flex-end',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.7rem 0.95rem',
                  // Agent bubbles tilt left (small bottom-left corner);
                  // user bubbles tilt right (small bottom-right corner).
                  // Tizen-safe: plain string of 4 radii.
                  borderRadius: isAgent ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                  background: isAgent
                    ? 'var(--surface-raised, #1c2128)'
                    : 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))',
                  border: isAgent ? '1px solid var(--border, #30363d)' : 'none',
                  color: isAgent ? 'var(--text)' : '#ffffff',
                  fontSize: 'calc(0.875rem * var(--font-scale, 1))',
                  lineHeight: '1.45',
                  boxShadow: isAgent
                    ? 'inset 0 1px 0 rgba(255,255,255,0.03)'
                    : '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {submitting && (
          <div
            className="hermes-bubble-in"
            style={{ display: 'flex', justifyContent: 'flex-start' }}
            role="status"
            aria-label={t('chatbot.thinking_aria', { name: agentName })}
          >
            <div
              style={{
                padding: '0.7rem 0.95rem',
                borderRadius: '16px 16px 16px 4px',
                background: 'var(--surface-raised, #1c2128)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--muted)',
                fontSize: 'calc(0.875rem * var(--font-scale, 1))',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {/* Three pulsing dots — SkeletonBlock at 8px round so the bubble
                  reads as "agent typing" rather than a static label. */}
              <SkeletonBlock width="8px" height="8px" radius="50%" />
              <SkeletonBlock width="8px" height="8px" radius="50%" />
              <SkeletonBlock width="8px" height="8px" radius="50%" />
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

      {/* Command chips */}
      <CommandChips onSend={handleChipSend} />

      {/* Input area — gradient footer band */}
      <div
        style={{
          padding: '0.85rem 1.1rem',
          borderTop: '1px solid var(--border, #30363d)',
          display: 'flex',
          gap: '0.6rem',
          flexShrink: 0,
          background: 'linear-gradient(0deg, var(--surface-raised, var(--surface)), var(--surface))',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={function(e) { setInputText(e.target.value); setErrorText(''); }}
          onKeyDown={handleInputKeyDown}
          placeholder={t('chatbot.placeholder', { name: agentName })}
          disabled={submitting}
          style={{
            flex: 1,
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '10px',
            color: 'var(--text)',
            padding: '0.6rem 0.85rem',
            fontSize: 'calc(0.875rem * var(--font-scale, 1))',
            outline: 'none',
            transition: 'border-color 160ms ease, box-shadow 160ms ease',
          }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)';
            e.currentTarget.style.outline = 'none';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = 'var(--border, #30363d)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        <button
          tabIndex={0}
          // .hermes-send-pulse animation runs for ~220ms then sendPulsing
          // flips back to false so the class re-applies cleanly next send.
          // Note: keep the existing onFocus/onBlur transform handlers — they
          // intentionally drive hover scaling that the .hermes-focusable
          // class would otherwise wipe via its transition reset.
          className={sendPulsing ? 'hermes-send-pulse' : undefined}
          onClick={handleSend}
          disabled={submitting || !inputText.trim()}
          style={{
            padding: '0.55rem 1.15rem',
            background: submitting || !inputText.trim()
              ? 'var(--muted)'
              : 'linear-gradient(135deg, var(--accent), #6366f1)',
            border: 'none',
            borderRadius: '999px',
            color: '#ffffff',
            fontWeight: '800',
            cursor: submitting || !inputText.trim() ? 'not-allowed' : 'pointer',
            fontSize: 'calc(0.875rem * var(--font-scale, 1))',
            outline: 'none',
            boxShadow: submitting || !inputText.trim() ? 'none' : '0 4px 14px rgba(99,102,241,0.32)',
            transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={function(e) { if (!submitting && inputText.trim()) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
            if (!submitting && inputText.trim()) e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {t('chatbot.send')}
        </button>
      </div>

      <CommandHelpModal isOpen={showHelp} onClose={function() { setShowHelp(false); }} />
    </div>
  );
}

export default FloatingChatbot;

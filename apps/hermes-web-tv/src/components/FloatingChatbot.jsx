import React from 'react';
import { validateCommand, generateCommandId } from './CommandValidator.jsx';
import * as commandStore from '../store/commandStore.js';
import * as hermesApi from '../api/hermesApi.js';
import { resolveOfflineCommand } from '../utils/commandMatchers.js';
import * as voiceClient from '../api/azureVoiceClient.js';
import * as voicePrefStore from '../store/voicePrefStore.js';
import { getResponseText } from '../utils/commandResponseText.js';
import { matchGreeting } from '../utils/chatbotGreetings.js';
import CommandChips from './CommandChips.jsx';
import CommandHelpModal from './CommandHelpModal.jsx';
import { SkeletonBlock } from './Skeleton.jsx';
import { useTranslation } from '../i18n/useTranslation.js';

var STATES = { minimized: 'minimized', compact: 'compact', expanded: 'expanded', walkie: 'walkie-talkie' };

// Feature-detect once at module load so each render does NOT touch window
// (Tizen Chrome 76 is happy with this either way; SSR/test harness needs
// the typeof window guard to avoid ReferenceError). webkitSpeechRecognition
// is the only widely-shipped variant in Chrome 76 — modern `SpeechRecognition`
// is undefined on Tizen 6.5 so we check both. On unsupported runtimes the
// mic button is never rendered.
var SpeechRecognitionCtor = (function() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
})();

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

// Local-only chip commands that bypass the server validator and dispatch a
// synthetic command directly through props.onCommand. Used for the new
// "Tonight's lineup" + "Change View" suggestion chips which don't have a
// server-side pattern entry. Returning a result keeps the call-site uniform
// with the validator path: `{ valid, action, params, responseText }`.
function resolveLocalChip(commandText) {
  var n = (commandText || '').trim().toLowerCase();
  if (n === 'tonight' || n === "tonight's lineup" || n === 'tonights lineup' || n === 'show epg' || n === 'open epg') {
    return { valid: true, action: 'open_epg', params: {}, responseText: 'Opening tonight’s lineup.' };
  }
  if (n === 'change view' || n === 'change look' || n === 'change layout' || n === 'switch view' || n === 'switch look' || n === 'pick a view' || n === 'pick a layout' || n === 'change shell') {
    return { valid: true, action: 'open_layout_switcher', params: {}, responseText: 'Opening the View picker.' };
  }
  return null;
}

// Short timestamp formatter — "3:42 PM" style. Used inside every message
// bubble so the conversation has a wall-clock anchor that helps Mom track
// when something happened mid-show. Pure local time, no locale args (Tizen
// 6.5 Intl.DateTimeFormat is unreliable for non-US locales but the simple
// 12-hour hh:mm AM/PM string works everywhere). ES5-safe — no template
// literals.
function formatStamp(date) {
  if (!(date instanceof Date)) return '';
  var h = date.getHours();
  var m = date.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  var hh = h % 12;
  if (hh === 0) hh = 12;
  var mm = m < 10 ? '0' + m : '' + m;
  return hh + ':' + mm + ' ' + ampm;
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
  // Mom-mode flag — bumps font scale, widens spacing, swaps to the warmer
  // theme-mom-calm accent so the panel matches Sherri's catalog look when
  // her profile is active.
  var isMomMode = profileId === 'mom_tv';

  var chatState = STATES.minimized;
  var setChatState = null;
  var stateResult = React.useState(STATES.minimized);
  chatState = stateResult[0];
  setChatState = stateResult[1];

  // Seed history with the localized greeting, including a timestamp the
  // moment the component first mounts. We don't re-seed on locale change
  // because the user may already have messages above it; keeping history
  // stable matches Zero's behaviour.
  var historyResult = React.useState(function() {
    return [{ role: 'agent', text: t('chatbot.greeting'), ts: new Date() }];
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

  // True while an Azure TTS clip is actively playing. Drives the "🔊 Speaking…"
  // pill rendered next to the last agent bubble so the user has a visible
  // confirmation that audio is flowing — important because Azure may be
  // unconfigured (202) or muted by autoplay policy, in which case the
  // indicator never lights up and the user knows the rendered text is the
  // only output.
  var speakingResult = React.useState(false);
  var speaking = speakingResult[0];
  var setSpeaking = speakingResult[1];

  // Mic listening state — pulses the mic button red, shows "Listening…" hint.
  // Only relevant on browsers that expose webkitSpeechRecognition. Tizen TVs
  // never reach this branch because SpeechRecognitionCtor is null on those
  // builds; the button is not rendered.
  var listeningResult = React.useState(false);
  var listening = listeningResult[0];
  var setListening = listeningResult[1];

  // Hold a live SpeechRecognition instance across renders so abort() works.
  var recognitionRef = React.useRef(null);

  // Send-button ripple — toggled true for ~240ms when a message dispatches
  // (handleSend / handleChipSend), then auto-cleared so the CSS animation
  // re-fires on the next send.
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
    if (!text) return;
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
    setSpeaking(true);
    voiceClient.speak(text, profileId, prefVoice || undefined)
      .then(function(res) {
        // res.played === false when Azure is unconfigured (202) — clear the
        // indicator immediately so the pill doesn't stick on screen with no
        // audible output. Otherwise clear after a beat that approximates the
        // clip duration (text length × 60ms is a good cheap proxy — better
        // than waiting for an audio-ended event we can't observe from here).
        if (!res || res.played === false) {
          setSpeaking(false);
          return;
        }
        var estMs = Math.min(8000, Math.max(1200, text.length * 60));
        setTimeout(function() { setSpeaking(false); }, estMs);
      })
      .catch(function() { setSpeaking(false); });
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      // Toggle off: abort the active recognition.
      try { recognitionRef.current && recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    var rec;
    try { rec = new SpeechRecognitionCtor(); } catch (_) { return; }
    rec.lang = (tx && tx.locale) || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = function(ev) {
      try {
        var transcript = ev.results[0][0].transcript;
        if (transcript) {
          setInputText(transcript);
          // Defer auto-send by a tick so the input value commits to state
          // before handleSend reads it. We re-use handleSendText so the
          // transcript dispatch doesn't depend on the input field.
          setTimeout(function() { handleSendText(transcript); }, 0);
        }
      } catch (_) {}
    };
    rec.onerror = function() { setListening(false); recognitionRef.current = null; };
    rec.onend = function() { setListening(false); recognitionRef.current = null; };
    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (_) {
      // start() throws if already started or permission denied; silent fail.
      setListening(false);
      recognitionRef.current = null;
    }
  }

  // Core send routine extracted so both the typed Send path and the mic
  // transcript auto-send share one implementation.
  function handleSendText(rawText) {
    var text = (rawText || '').trim();
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

    setHistory(function(prev) { return prev.concat([{ role: 'user', text: text, ts: new Date() }]); });
    setInputText('');
    triggerSendPulse();

    // ── Client-side local-chip fast-path ─────────────────────────────────
  // "tonight" / "change view" chips dispatch synthetic commands that the
    // server-side validator does not know about. Resolve them locally and
    // dispatch through props.onCommand so the App reducer opens the EPG /
    // LayoutSwitcher modal directly.
    var localChip = resolveLocalChip(text);
    if (localChip) {
      if (props.onCommand) {
        props.onCommand({ action: localChip.action, params: localChip.params });
      }
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: localChip.responseText, ts: new Date() }]);
      });
      speakIfEnabled(localChip.responseText);
      return;
    }

    // ── Client-side greeting fast-path ─────────────────────────────────
    var greetingReply = matchGreeting(text);
    if (greetingReply) {
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: greetingReply, ts: new Date() }]);
      });
      speakIfEnabled(greetingReply);
      return;
    }

    setSubmitting(true);

    var envelope = {
      schema: 'hermestv.ui.v1',
      command_id: generateCommandId(),
      profile_id: profileId,
      action: 'show_notification',
      payload: { message: text },
      issued_at: new Date().toISOString(),
    };
    commandStore.record(envelope);

    // Offline path uses the local command-matcher table (no fake catalog/data).
    var validatePromise = online
      ? hermesApi.validateCommand({ command_text: text, profile_id: profileId })
      : Promise.resolve(resolveOfflineCommand(text));

    validatePromise.then(function(result) {
      setSubmitting(false);
      if (result.valid) {
        if (props.onCommand) {
          props.onCommand({ action: result.action, params: result.params });
        }
        // Prefix the agent's chosen name on the first command of a session
        // so the spoken line reads naturally ("This is Nova. Showing all 4K
        // titles."). Subsequent replies skip the prefix to avoid sounding
        // robotic. We detect "first command" as the very first agent reply
        // after the greeting — i.e. history is exactly length 2 (greeting
        // + this user message) at the moment validate() resolves.
        var baseText = getResponseText(result.action, result.params);
        var isFirstAgentReply = history.length <= 2;
        var responseText = isFirstAgentReply ? ('This is ' + agentName + '. ' + baseText) : baseText;
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: responseText, ts: new Date() }]);
        });
        speakIfEnabled(responseText);
      } else {
        var noMatchReply = buildNoMatchReply(text, t);
        setHistory(function(prev) {
          return prev.concat([{ role: 'agent', text: noMatchReply, ts: new Date() }]);
        });
        speakIfEnabled(noMatchReply);
      }
    }).catch(function(err) {
      if (err && err.message) { try { console.warn('[chatbot] validate failed:', err.message); } catch (e) {} }
      setSubmitting(false);
      var fallback = t('chatbot.network_error');
      setHistory(function(prev) {
        return prev.concat([{ role: 'agent', text: fallback, ts: new Date() }]);
      });
      speakIfEnabled(fallback);
    });
  }

  function handleSend() {
    handleSendText(inputText);
  }

  function handleChipSend(commandText) {
    // Suggestion chips route through the same send path so local-chip
    // resolution (e.g. "tonight", "change view") and greeting matching
    // both apply identically.
    setInputText(commandText);
    handleSendText(commandText);
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

  // Mom-mode visual tokens — applied to the expanded panel so Sherri's
  // chatbot matches her catalog warmth without depending on the body
  // theme class (which the user may have overridden mid-session).
  var momPanelStyle = isMomMode
    ? { background: 'linear-gradient(180deg, #352820, #2a201a)', borderColor: '#4a3828' }
    : {};
  // Bump the font-scale inside the panel by 1.4× of whatever the active
  // theme provides. The catalog body already lifts to 1.35× on mom-calm,
  // but the chatbot needs its own bump because the panel inherits whatever
  // theme is active (Mom may temporarily be on dark theme during a Dave
  // session, etc.) and we want the chatbot to ALWAYS be large on her TV.
  var momFontScale = isMomMode ? 1.4 : 1.0;

  // ── Minimized state ──
  if (chatState === STATES.minimized) {
    return (
      <button
        tabIndex={0}
        aria-label={t('chatbot.open_aria', { name: agentName })}
        onClick={function() { setChatState(STATES.expanded); }}
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
        {(agentName && agentName.charAt(0).toUpperCase()) || 'H'}
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

  // Index of the last agent message — used to attach the "🔊 Speaking…"
  // pill to only the most recent bot reply rather than every previous one.
  var lastAgentIdx = -1;
  for (var li = history.length - 1; li >= 0; li--) {
    if (history[li].role === 'agent') { lastAgentIdx = li; break; }
  }

  // ── Expanded state (default fallback) ──
  // 600×600 with backdrop dim, anchored bottom-right. Targets ~30% of a
  // 1920×1080 TV from across the couch. The backdrop is a full-viewport
  // overlay that closes the panel when clicked outside, so a remote-OK
  // tap on the dim area dismisses the chatbot. The panel is rendered as
  // a sibling so its own clicks don't bubble up to the backdrop handler.
  return (
    <div
      role="dialog"
      aria-label={t('chatbot.open_aria', { name: agentName })}
    >
      {/* Backdrop dim — captures the click-out close. Pointer events live
          here so the panel's z-index can sit above without intercepting
          the close gesture. */}
      <div
        onClick={function() { setChatState(STATES.minimized); }}
        className="hermes-modal-overlay"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          zIndex: 199,
        }}
      />
      <div
        className="hermes-modal-panel"
        style={Object.assign({
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          width: '600px',
          height: '600px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 200,
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
          color: 'var(--text)',
          overflow: 'hidden',
          // Mom-mode bumps the local font-scale token so every "calc(x * var(--font-scale))"
          // child in this subtree scales together, without touching the body theme.
          '--font-scale': momFontScale,
        }, momPanelStyle)}
      >
        {/* Header — gradient surface-raised → surface */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.4rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                fontWeight: '800',
                color: '#fff',
              }}
            >
              {(agentName && agentName.charAt(0).toUpperCase()) || 'H'}
            </div>
            <span style={{ fontSize: 'calc(1.1rem * var(--font-scale, 1))', fontWeight: '700', color: 'var(--accent)' }}>
              {agentName}
            </span>
            {!online && (
              <span style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: '#e3b341', backgroundColor: 'rgba(227,179,65,0.15)', border: '1px solid #e3b341', borderRadius: '3px', padding: '0.1rem 0.4rem' }}>
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
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.3rem 0.5rem' }}
              aria-label={t('chatbot.help_aria')}
            >
              ?
            </button>
            <button
              tabIndex={0}
              className="hermes-focusable hermes-press"
              onClick={function() { setChatState(STATES.compact); }}
              title={t('chatbot.compact_aria')}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.9rem', padding: '0.3rem 0.5rem' }}
              aria-label={t('chatbot.compact_aria')}
            >
              &#x25BC;
            </button>
            <button
              tabIndex={0}
              className="hermes-focusable hermes-press"
              onClick={function() { setChatState(STATES.minimized); }}
              title={t('chatbot.minimize_full_aria')}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.3rem 0.5rem' }}
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
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.9rem',
          }}
        >
          {history.map(function(msg, idx) {
            var isAgent = msg.role === 'agent';
            var stamp = msg.ts ? formatStamp(msg.ts) : '';
            return (
              <div
                key={idx}
                className="hermes-bubble-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isAgent ? 'flex-start' : 'flex-end',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '0.85rem 1.1rem',
                    borderRadius: isAgent ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                    background: isAgent
                      ? 'var(--surface-raised, #1c2128)'
                      : 'linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))',
                    border: isAgent ? '1px solid var(--border, #30363d)' : 'none',
                    color: isAgent ? 'var(--text)' : '#ffffff',
                    fontSize: 'calc(1rem * var(--font-scale, 1))',
                    lineHeight: '1.5',
                    boxShadow: isAgent
                      ? 'inset 0 1px 0 rgba(255,255,255,0.03)'
                      : '0 4px 12px rgba(0,0,0,0.25)',
                  }}
                >
                  {msg.text}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    alignItems: 'center',
                    marginTop: '0.2rem',
                    paddingLeft: isAgent ? '0.35rem' : 0,
                    paddingRight: isAgent ? 0 : '0.35rem',
                    fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                    color: 'var(--muted)',
                  }}
                >
                  <span>{stamp}</span>
                  {isAgent && idx === lastAgentIdx && speaking && (
                    <span
                      role="status"
                      aria-live="polite"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.1rem 0.5rem',
                        borderRadius: '999px',
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.45)',
                        color: 'var(--accent)',
                        fontWeight: '700',
                      }}
                    >
                      <span aria-hidden="true">&#x1F50A;</span>
                      <span>Speaking…</span>
                    </span>
                  )}
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
                  padding: '0.85rem 1.1rem',
                  borderRadius: '18px 18px 18px 4px',
                  background: 'var(--surface-raised, #1c2128)',
                  border: '1px solid var(--border, #30363d)',
                  color: 'var(--muted)',
                  fontSize: 'calc(1rem * var(--font-scale, 1))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
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
              padding: '0.6rem 1.25rem',
              backgroundColor: 'rgba(248,81,73,0.15)',
              borderTop: '1px solid rgba(248,81,73,0.3)',
              color: '#f85149',
              fontSize: 'calc(0.8rem * var(--font-scale, 1))',
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
            padding: '1rem 1.4rem',
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
              borderRadius: '12px',
              color: 'var(--text)',
              padding: '0.75rem 1rem',
              fontSize: 'calc(1rem * var(--font-scale, 1))',
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
          {/* Mic button — only rendered when the runtime exposes a Web Speech
              Recognition implementation. On Tizen TVs without it, the button
              is skipped silently so the input + Send layout doesn't shift. */}
          {SpeechRecognitionCtor && (
            <button
              tabIndex={0}
              onClick={startListening}
              disabled={submitting}
              aria-label={listening ? 'Stop listening' : 'Speak'}
              title={listening ? 'Stop' : 'Speak'}
              style={{
                width: '48px',
                height: '48px',
                padding: 0,
                borderRadius: '50%',
                border: 'none',
                background: listening
                  ? 'linear-gradient(135deg, #ef4444, #f87171)'
                  : 'linear-gradient(135deg, var(--surface-raised, #1c2128), var(--surface))',
                color: listening ? '#ffffff' : 'var(--accent)',
                fontSize: '1.2rem',
                cursor: submitting ? 'not-allowed' : 'pointer',
                outline: 'none',
                boxShadow: listening
                  ? '0 0 0 0 rgba(239,68,68,0.6)'
                  : '0 2px 8px rgba(0,0,0,0.25)',
                animation: listening ? 'hermes-mic-pulse 1.4s ease-in-out infinite' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid var(--accent)';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) {
                e.currentTarget.style.outline = 'none';
              }}
            >
              <span aria-hidden="true">&#x1F3A4;</span>
            </button>
          )}
          <button
            tabIndex={0}
            className={sendPulsing ? 'hermes-send-pulse' : undefined}
            onClick={handleSend}
            disabled={submitting || !inputText.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              background: submitting || !inputText.trim()
                ? 'var(--muted)'
                : 'linear-gradient(135deg, var(--accent), #6366f1)',
              border: 'none',
              borderRadius: '999px',
              color: '#ffffff',
              fontWeight: '800',
              cursor: submitting || !inputText.trim() ? 'not-allowed' : 'pointer',
              fontSize: 'calc(1rem * var(--font-scale, 1))',
              outline: 'none',
              boxShadow: submitting || !inputText.trim() ? 'none' : '0 4px 14px rgba(99,102,241,0.32)',
              transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease',
              letterSpacing: '0.02em',
              flexShrink: 0,
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
    </div>
  );
}

export default FloatingChatbot;

import React from 'react';
import * as voiceClient from '../api/azureVoiceClient.js';
import { useTranslation } from '../i18n/useTranslation.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';

function VoicePickerModal(props) {
  var tx = useTranslation();
  var t = tx.t;

  var isOpen = props.isOpen;
  var profileId = props.profileId;
  var currentVoiceId = props.currentVoiceId;
  var onClose = props.onClose;
  var onVoiceChange = props.onVoiceChange;
  // Agent name flows through props from App.jsx; falls back to 'Hermes'
  // so existing call sites without the prop continue to work.
  var agentName = props.agentName || 'Hermes';

  var voicesResult = React.useState([]);
  var voices = voicesResult[0];
  var setVoices = voicesResult[1];

  var loadingResult = React.useState(true);
  var loading = loadingResult[0];
  var setLoading = loadingResult[1];

  var savingResult = React.useState(null);
  var saving = savingResult[0];
  var setSaving = savingResult[1];

  var azureReadyResult = React.useState(true);
  var azureReady = azureReadyResult[0];
  var setAzureReady = azureReadyResult[1];

  var previewingResult = React.useState(null);
  var previewing = previewingResult[0];
  var setPreviewing = previewingResult[1];

  var statusResult = React.useState('');
  var statusMsg = statusResult[0];
  var setStatusMsg = statusResult[1];

  // Roving-tabindex focus index for Tizen D-pad navigation across voice rows.
  // -1 = no row focused (close button has autoFocus on open). Arrow keys
  // advance focus between rows; OK / Enter activates "Use voice" on the
  // focused row.
  var focusIdxResult = React.useState(-1);
  var focusIdx = focusIdxResult[0];
  var setFocusIdx = focusIdxResult[1];

  var rowRefsRef = React.useRef([]);

  React.useEffect(function() {
    if (!isOpen) return;
    setLoading(true);
    voiceClient.listVoices().then(function(data) {
      setVoices(data.voices || []);
      setAzureReady(!!data.azure_configured);
      setLoading(false);
    }).catch(function(err) {
      setStatusMsg(t('voice.load_failed', { message: err.message }));
      setLoading(false);
    });

    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return function() {
      document.removeEventListener('keydown', onKey);
      voiceClient.stopSpeaking();
    };
  }, [isOpen, onClose]);

  // Move actual DOM focus when focusIdx changes so the visible focus ring
  // (rendered via onFocus inline-style toggle) follows the D-pad.
  React.useEffect(function() {
    if (focusIdx < 0) return;
    var row = rowRefsRef.current[focusIdx];
    if (row && typeof row.focus === 'function') {
      try { row.focus(); } catch (_) { /* ignore */ }
    }
  }, [focusIdx]);

  function handleRowKeyDown(e, idx, voice, isCurrent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx(Math.min(voices.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(Math.max(0, idx - 1));
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (!isCurrent) handleSelect(voice);
    } else if (e.key === 'ArrowRight' || e.key === 'MediaPlayPause') {
      // Right arrow / play key triggers preview without leaving the row.
      e.preventDefault();
      handlePreview(voice);
    }
  }

  if (!isOpen) return null;

  function handlePreview(voice) {
    setPreviewing(voice.id);
    setStatusMsg('');
    voiceClient.previewVoice(voice.id, voice.sample || 'Hello, this is a voice preview.', profileId).then(function(r) {
      if (!r.played) {
        // Server's r.message wins (e.g. friendly "TTS unconfigured" stub).
        // Local fallback when r.message is empty avoids naming the env var
        // literally so the credentialGuard middleware never strips it.
        setStatusMsg(r.message || t('voice.preview_unavailable'));
      }
      setTimeout(function() { setPreviewing(null); }, 800);
    }).catch(function(err) {
      setStatusMsg(t('voice.preview_failed', { message: err.message }));
      setPreviewing(null);
    });
  }

  function handleSelect(voice) {
    setSaving(voice.id);
    setStatusMsg('');
    voiceClient.setProfileVoice(profileId, voice.id).then(function(r) {
      setSaving(null);
      if (typeof onVoiceChange === 'function') onVoiceChange(voice.id);
      setStatusMsg(t('voice.saved', { name: voice.name }));
      setTimeout(function() { onClose(); }, 800);
    }).catch(function(err) {
      setSaving(null);
      setStatusMsg(t('voice.save_failed', { message: err.message }));
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-modal-title"
      onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5,8,14,0.78)', zIndex: 260,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '85vh',
          background: '#15151d', border: '1px solid #2a2b3a', borderRadius: '20px',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
        <div style={{
          padding: '20px 24px 18px', borderBottom: '1px solid #2a2b3a', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #1c1c28, #15151d)',
        }}>
          <div>
            <div id="voice-modal-title" style={{ fontSize: 'calc(1.2rem * var(--font-scale, 1))', fontWeight: 800, color: '#e8edf5', letterSpacing: '0.01em' }}>{t('voice.title', { name: agentName })}</div>
            <div style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: '#8a8f9b', marginTop: '4px' }}>{t('voice.subtitle')}</div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid #2a2b3a',
              color: '#e8edf5', fontSize: '18px', cursor: 'pointer',
              width: '40px', height: '40px', borderRadius: '50%',
              outline: 'none', lineHeight: 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
              padding: 0,
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent-color, var(--accent, #58a6ff))'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
          >&times;</button>
        </div>

        {!azureReady && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(227,179,65,0.1)',
            border: '1px solid rgba(227,179,65,0.4)', borderRadius: '8px',
            fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: '#e3b341', lineHeight: 1.4,
          }}>
            {t('voice.azure_warning')}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {loading && (
            <div style={{ padding: '12px 0' }}>
              <LoadingSkeleton variant="card" count={5} />
            </div>
          )}
          {!loading && voices.length === 0 && (
            <div style={{ padding: '12px 0' }}>
              <EmptyState
                icon="🔊"
                title={t('voice.empty')}
              />
            </div>
          )}
          {voices.map(function(voice, idx) {
            var isCurrent = voice.id === currentVoiceId;
            return (
              <div
                key={voice.id}
                ref={function(el) { rowRefsRef.current[idx] = el; }}
                role="option"
                aria-selected={isCurrent}
                tabIndex={0}
                onKeyDown={function(e) { handleRowKeyDown(e, idx, voice, isCurrent); }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid var(--accent-color, var(--accent, #58a6ff))';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 16px', marginBottom: '10px',
                  borderRadius: '12px',
                  background: isCurrent ? 'linear-gradient(135deg, rgba(255,126,179,0.16), rgba(255,126,179,0.06))' : '#1a1a24',
                  border: isCurrent ? '1px solid #ff7eb3' : '1px solid #2a2b3a',
                  boxShadow: isCurrent ? '0 4px 14px rgba(255,126,179,0.16)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                  transition: 'border-color 160ms ease, background-color 160ms ease',
                  outline: 'none',
                  minHeight: '56px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: 'calc(0.95rem * var(--font-scale, 1))', color: '#e8edf5' }}>{voice.name}</span>
                    <span style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{voice.locale} · {voice.gender} · {voice.tone}</span>
                    {isCurrent && <span aria-label="Selected" style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', fontWeight: 800, color: '#ff7eb3', border: '1px solid #ff7eb3', borderRadius: '999px', padding: '2px 9px', letterSpacing: '0.06em', background: 'rgba(255,126,179,0.08)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span aria-hidden="true">✓</span>{t('voice.current_badge')}</span>}
                  </div>
                  <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#9aa3b2', fontStyle: 'italic' }}>"{voice.sample}"</div>
                </div>
                <button
                  onClick={function() { handlePreview(voice); }}
                  disabled={previewing === voice.id}
                  aria-label={t('voice.preview_aria')}
                  title={t('voice.preview_aria')}
                  style={{
                    padding: '10px 14px', borderRadius: '10px',
                    background: '#22232f', border: '1px solid #2a2b3a',
                    color: '#e8edf5', fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: 600,
                    cursor: previewing === voice.id ? 'wait' : 'pointer',
                    flexShrink: 0, outline: 'none', minHeight: '44px', minWidth: '52px',
                    transition: 'background-color 160ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1)',
                  }}
                  onMouseEnter={function(e) { if (previewing !== voice.id) { e.currentTarget.style.background = '#2a2b3a'; e.currentTarget.style.transform = 'scale(1.04)'; } }}
                  onMouseLeave={function(e) { e.currentTarget.style.background = '#22232f'; e.currentTarget.style.transform = 'scale(1)'; }}
                  onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent-color, var(--accent, #58a6ff))'; e.currentTarget.style.outlineOffset = '2px'; }}
                  onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
                >{previewing === voice.id ? '…' : '🔊'}</button>
                <button
                  onClick={function() { handleSelect(voice); }}
                  disabled={isCurrent || saving === voice.id}
                  style={{
                    padding: '10px 18px', borderRadius: '999px',
                    background: isCurrent ? 'transparent' : 'linear-gradient(135deg, #ff7eb3, #6366f1)',
                    border: isCurrent ? '1px solid #2a2b3a' : 'none',
                    color: isCurrent ? '#8a8f9b' : '#fff',
                    fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: 800,
                    cursor: isCurrent ? 'default' : 'pointer',
                    flexShrink: 0, outline: 'none', minHeight: '44px',
                    boxShadow: isCurrent ? 'none' : '0 6px 16px rgba(255,126,179,0.32)',
                    transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1)',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={function(e) { if (!isCurrent) e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
                  onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent-color, var(--accent, #58a6ff))'; e.currentTarget.style.outlineOffset = '2px'; if (!isCurrent) e.currentTarget.style.transform = 'scale(1.06)'; }}
                  onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
                >{isCurrent ? t('voice.active') : (saving === voice.id ? t('voice.saving') : t('voice.use'))}</button>
              </div>
            );
          })}
        </div>

        {statusMsg && (
          <div style={{
            padding: '10px 24px 14px', borderTop: '1px solid #2a2b3a',
            fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: '#9aa3b2', textAlign: 'center',
          }}>{statusMsg}</div>
        )}
      </div>
    </div>
  );
}

export default VoicePickerModal;

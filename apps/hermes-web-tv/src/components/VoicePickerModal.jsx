import React from 'react';
import * as voiceClient from '../api/azureVoiceClient.js';

function VoicePickerModal(props) {
  var isOpen = props.isOpen;
  var profileId = props.profileId;
  var currentVoiceId = props.currentVoiceId;
  var onClose = props.onClose;
  var onVoiceChange = props.onVoiceChange;

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

  React.useEffect(function() {
    if (!isOpen) return;
    setLoading(true);
    voiceClient.listVoices().then(function(data) {
      setVoices(data.voices || []);
      setAzureReady(!!data.azure_configured);
      setLoading(false);
    }).catch(function(err) {
      setStatusMsg('Could not load voices: ' + err.message);
      setLoading(false);
    });

    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return function() {
      document.removeEventListener('keydown', onKey);
      voiceClient.stopSpeaking();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handlePreview(voice) {
    setPreviewing(voice.id);
    setStatusMsg('');
    voiceClient.previewVoice(voice.id, voice.sample || 'Hello, this is a voice preview.', profileId).then(function(r) {
      if (!r.played) {
        setStatusMsg(r.message || 'Voice preview unavailable. Set AZURE_TTS_KEY on the server.');
      }
      setTimeout(function() { setPreviewing(null); }, 800);
    }).catch(function(err) {
      setStatusMsg('Preview failed: ' + err.message);
      setPreviewing(null);
    });
  }

  function handleSelect(voice) {
    setSaving(voice.id);
    setStatusMsg('');
    voiceClient.setProfileVoice(profileId, voice.id).then(function(r) {
      setSaving(null);
      if (typeof onVoiceChange === 'function') onVoiceChange(voice.id);
      setStatusMsg('Saved! ' + voice.name + ' is your new voice.');
      setTimeout(function() { onClose(); }, 800);
    }).catch(function(err) {
      setSaving(null);
      setStatusMsg('Could not save: ' + err.message);
    });
  }

  return (
    <div
      onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 260,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '560px', maxHeight: '85vh',
        background: '#15151d', border: '1px solid #2a2b3a', borderRadius: '16px',
        boxShadow: '0 30px 80px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a2b3a', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e8edf5' }}>Choose Hermes's Voice</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7384', marginTop: '4px' }}>Tap 🔊 to hear a voice, then tap Use to keep it</div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            style={{ background: 'none', border: 'none', color: '#6b7384', fontSize: '1.4rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', outline: 'none', lineHeight: 1 }}
          >&times;</button>
        </div>

        {!azureReady && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', background: 'rgba(227,179,65,0.1)',
            border: '1px solid rgba(227,179,65,0.4)', borderRadius: '8px',
            fontSize: '0.8rem', color: '#e3b341', lineHeight: 1.4,
          }}>
            ⚠ Azure not configured on the server yet. Previews and save will return stubs until AZURE_TTS_KEY is set.
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7384', fontSize: '0.9rem' }}>Loading voices…</div>
          )}
          {!loading && voices.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7384', fontSize: '0.9rem' }}>No voices available.</div>
          )}
          {voices.map(function(voice) {
            var isCurrent = voice.id === currentVoiceId;
            return (
              <div
                key={voice.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', marginBottom: '8px',
                  borderRadius: '10px',
                  background: isCurrent ? 'rgba(255,126,179,0.1)' : '#1a1a24',
                  border: isCurrent ? '1px solid #ff7eb3' : '1px solid #2a2b3a',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e8edf5' }}>{voice.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#6b7384', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{voice.locale} · {voice.gender} · {voice.tone}</span>
                    {isCurrent && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ff7eb3', border: '1px solid #ff7eb3', borderRadius: '3px', padding: '1px 5px' }}>CURRENT</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9aa3b2', fontStyle: 'italic' }}>"{voice.sample}"</div>
                </div>
                <button
                  onClick={function() { handlePreview(voice); }}
                  disabled={previewing === voice.id}
                  style={{
                    padding: '8px 12px', borderRadius: '6px',
                    background: '#22232f', border: '1px solid #2a2b3a',
                    color: '#e8edf5', fontSize: '0.8rem', fontWeight: 600,
                    cursor: previewing === voice.id ? 'wait' : 'pointer',
                    flexShrink: 0, outline: 'none',
                  }}
                >{previewing === voice.id ? '…' : '🔊'}</button>
                <button
                  onClick={function() { handleSelect(voice); }}
                  disabled={isCurrent || saving === voice.id}
                  style={{
                    padding: '8px 14px', borderRadius: '6px',
                    background: isCurrent ? 'transparent' : '#ff7eb3',
                    border: isCurrent ? '1px solid #2a2b3a' : 'none',
                    color: isCurrent ? '#6b7384' : '#000',
                    fontSize: '0.8rem', fontWeight: 700,
                    cursor: isCurrent ? 'default' : 'pointer',
                    flexShrink: 0, outline: 'none',
                  }}
                >{isCurrent ? 'Active' : (saving === voice.id ? 'Saving…' : 'Use')}</button>
              </div>
            );
          })}
        </div>

        {statusMsg && (
          <div style={{
            padding: '10px 24px 14px', borderTop: '1px solid #2a2b3a',
            fontSize: '0.8rem', color: '#9aa3b2', textAlign: 'center',
          }}>{statusMsg}</div>
        )}
      </div>
    </div>
  );
}

export default VoicePickerModal;

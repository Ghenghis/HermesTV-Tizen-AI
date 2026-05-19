import React from 'react';
import * as voicePrefStore from '../../store/voicePrefStore.js';
import * as voiceClient from '../../api/azureVoiceClient.js';
import VoicePickerModal from '../VoicePickerModal.jsx';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  LABEL_STYLE, BUTTON_STYLE,
  SUCCESS_BOX, ROW_STYLE,
  focusHandler, blurHandler,
} from './settingsStyles.js';
import Toggle from './Toggle.jsx';

// VoiceSettings — granular per-profile voice controls.
//
//   - Master toggle:        "Enable voice feedback"
//   - Welcome greeting:     "Speak welcome on profile pick"
//   - Chatbot reply:        "Speak every chatbot reply"
//   - Command confirmation: "Speak after commands like 'show 4K'"
//   - Volume slider:        0 .. 100
//   - Voice picker:         opens VoicePickerModal
//   - Live preview button:  speaks a sample line through the current voice
//
// Mounts inside SettingsPanelTabbed's Voice tab — Wave 2-D owns the parent
// file, so this component does NOT register itself anywhere. Wave 2-D will
// import + render <VoiceSettings profile={profile} /> when ready.
//
// Tizen 6.5 / Chrome 76 safe: no optional chaining, no spread, no arrow
// destructuring. Arrow keys + Enter / Space navigate every control via
// native button / input semantics — no custom focus traps needed because
// the Settings modal already runs inside a focus-trapping shell.

function VoiceSettings(props) {
  var profile = props.profile || {};
  var profileId = profile.id;

  // Initial state: read merged prefs once at mount. We don't reload on every
  // profile change because the Settings modal is closed + re-opened per
  // profile switch — there's no scenario where `profile` mutates in-place
  // while this component is mounted.
  var prefsState = React.useState(function() {
    return voicePrefStore.getVoicePrefs(profile);
  });
  var prefs = prefsState[0];
  var setPrefs = prefsState[1];

  var savedFlashState = React.useState('');
  var savedFlash = savedFlashState[0];
  var setSavedFlash = savedFlashState[1];

  var pickerOpenState = React.useState(false);
  var pickerOpen = pickerOpenState[0];
  var setPickerOpen = pickerOpenState[1];

  var previewState = React.useState(false);
  var previewing = previewState[0];
  var setPreviewing = previewState[1];

  var previewMsgState = React.useState('');
  var previewMsg = previewMsgState[0];
  var setPreviewMsg = previewMsgState[1];

  function update(patch) {
    if (!profileId) { return; }
    var next = voicePrefStore.setVoicePrefs(profileId, patch);
    if (next) {
      // setVoicePrefs returns the raw blob; merge with profile-derived
      // defaults the same way getVoicePrefs does so the UI reflects the
      // resolved state (e.g. master_enabled falling back to profile.audio_feedback).
      setPrefs(voicePrefStore.getVoicePrefs(profile));
      setSavedFlash('Saved');
      setTimeout(function() { setSavedFlash(''); }, 1200);
    }
  }

  function handleVolumeChange(e) {
    var v = parseInt(e.target.value, 10);
    if (isNaN(v)) { return; }
    update({ volume: v });
  }

  function openPicker() { setPickerOpen(true); }
  function closePicker() { setPickerOpen(false); }

  function handleVoiceChange(voiceId) {
    if (typeof voiceId === 'string' && voiceId.length > 0) {
      // setVoiceId mirrors into the JSON blob automatically.
      voicePrefStore.setVoiceId(profileId, voiceId);
      setPrefs(voicePrefStore.getVoicePrefs(profile));
      setSavedFlash('Voice updated');
      setTimeout(function() { setSavedFlash(''); }, 1200);
    }
  }

  function handlePreview() {
    if (!profileId) { return; }
    setPreviewing(true);
    setPreviewMsg('');
    // Preview always plays even when master is off — otherwise the button
    // would silently no-op and the user couldn't audition the voice they
    // just picked. The 'preview' intent skips the per-intent gates.
    voiceClient.speak('This is your voice preview.', {
      profile: profile,
      intent: 'preview',
      voiceId: prefs.voice_id || undefined
    }).then(function(r) {
      if (r && r.skipped === 'master_off') {
        // Master is off — speak() short-circuits before hitting the server.
        // Tell the user why nothing happened.
        setPreviewMsg('Turn on "Enable voice feedback" to hear the preview.');
      } else if (r && r.played === false && r.message) {
        setPreviewMsg(r.message);
      }
      // Best-effort timer that mirrors VoicePickerModal's preview UX.
      setTimeout(function() { setPreviewing(false); }, 900);
    }).catch(function(err) {
      setPreviewMsg('Preview failed: ' + (err && err.message ? err.message : 'unknown error'));
      setPreviewing(false);
    });
  }

  if (!profileId) {
    return (
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Voice</div>
        <div style={CARD_TAGLINE_STYLE}>Pick a profile to configure voice feedback.</div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Master toggle ───────────────────────────────────────────── */}
      <div style={CARD_STYLE}>
        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.88rem * var(--font-scale, 1))' }}>
              Enable voice feedback
            </div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Master switch. Turn off to silence all spoken responses on this profile.
            </div>
          </div>
          <Toggle
            checked={prefs.master_enabled}
            ariaLabel="Enable voice feedback"
            onChange={function(v) { update({ master_enabled: v }); }}
          />
        </div>
      </div>

      {/* ── Granular intent toggles ─────────────────────────────────── */}
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>When can voice speak?</div>
        <div style={CARD_TAGLINE_STYLE}>
          Each occasion can be turned on or off independently. Disabled when the master switch is off.
        </div>

        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
              Speak welcome on profile pick
            </div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              "Welcome back, {profile.display_name || 'there'}." after you pick a profile.
            </div>
          </div>
          <Toggle
            checked={prefs.welcome_greeting_enabled}
            disabled={!prefs.master_enabled}
            ariaLabel="Speak welcome on profile pick"
            onChange={function(v) { update({ welcome_greeting_enabled: v }); }}
          />
        </div>

        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
              Speak every chatbot reply
            </div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              The chatbot reads its replies aloud in addition to showing the text.
            </div>
          </div>
          <Toggle
            checked={prefs.chatbot_reply_enabled}
            disabled={!prefs.master_enabled}
            ariaLabel="Speak every chatbot reply"
            onChange={function(v) { update({ chatbot_reply_enabled: v }); }}
          />
        </div>

        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
              Speak after commands
            </div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Short confirmations like "Showing 4K" after voice / remote commands.
            </div>
          </div>
          <Toggle
            checked={prefs.command_confirmation_enabled}
            disabled={!prefs.master_enabled}
            ariaLabel="Speak after commands"
            onChange={function(v) { update({ command_confirmation_enabled: v }); }}
          />
        </div>
      </div>

      {/* ── Volume ──────────────────────────────────────────────────── */}
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Volume</div>
        <div style={CARD_TAGLINE_STYLE}>
          Applies to all voice playback on this profile. Independent of the TV's system volume.
        </div>
        <label htmlFor="voice-vol" style={LABEL_STYLE}>
          Voice volume: <strong style={{ color: 'var(--accent, #00d4ff)' }}>{prefs.volume}%</strong>
        </label>
        <input
          id="voice-vol"
          type="range"
          min="0"
          max="100"
          step="5"
          value={prefs.volume}
          onChange={handleVolumeChange}
          onFocus={focusHandler}
          onBlur={blurHandler}
          aria-label="Voice volume"
          style={{ width: '100%', accentColor: 'var(--accent, #00d4ff)' }}
        />
      </div>

      {/* ── Voice picker + preview ──────────────────────────────────── */}
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Voice</div>
        <div style={CARD_TAGLINE_STYLE}>
          Pick the Azure voice this profile uses. Hit "Speak a sample" to hear it.
        </div>

        <div style={Object.assign({}, ROW_STYLE, { borderTop: 'none', paddingTop: 0 })}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Current voice
            </div>
            <div style={{
              fontWeight: 700,
              fontSize: 'calc(0.88rem * var(--font-scale, 1))',
              color: 'var(--text, #e6edf3)'
            }}>
              {prefs.voice_id || 'Profile default'}
            </div>
          </div>
          <button
            tabIndex={0}
            onClick={openPicker}
            onFocus={focusHandler}
            onBlur={blurHandler}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
            style={BUTTON_STYLE('outline')}
            aria-label="Change voice"
          >
            Change voice
          </button>
        </div>

        <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            tabIndex={0}
            onClick={handlePreview}
            onFocus={focusHandler}
            onBlur={blurHandler}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePreview(); } }}
            disabled={previewing}
            style={Object.assign({}, BUTTON_STYLE('filled'), { opacity: previewing ? 0.7 : 1 })}
            aria-label="Speak a sample"
          >
            {previewing ? 'Speaking…' : 'Speak a sample'}
          </button>
          {previewMsg ? (
            <span style={{
              fontSize: 'calc(0.75rem * var(--font-scale, 1))',
              color: 'var(--muted)'
            }}>
              {previewMsg}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Saved flash ─────────────────────────────────────────────── */}
      {savedFlash ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <span style={Object.assign({}, SUCCESS_BOX, { marginTop: 0, padding: '0.35rem 0.7rem' })}>{savedFlash}</span>
        </div>
      ) : null}

      {/* ── Picker modal ────────────────────────────────────────────── */}
      <VoicePickerModal
        isOpen={pickerOpen}
        profileId={profileId}
        currentVoiceId={prefs.voice_id}
        agentName={profile.agent_name || 'Hermes'}
        onClose={closePicker}
        onVoiceChange={handleVoiceChange}
      />
    </div>
  );
}

export default VoiceSettings;

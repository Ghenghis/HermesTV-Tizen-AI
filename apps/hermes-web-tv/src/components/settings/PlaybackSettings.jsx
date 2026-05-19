import React from 'react';
import * as settingsStore from '../../store/settingsStore.js';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  LABEL_STYLE, INPUT_STYLE, SELECT_STYLE, BUTTON_STYLE,
  SUCCESS_BOX, ROW_STYLE,
  focusHandler, blurHandler,
} from './settingsStyles.js';
import Toggle from './Toggle.jsx';

// PlaybackSettings — hardware acceleration, default audio + subtitle
// language, subtitle font size, video buffer. Maps to Zero's
// MpvVideoSection / VlcSection / SubtitlesSection.
//
// Note: actual MPV/VLC backend wiring isn't on the TV (HermesTV plays
// in-browser <video> on Tizen). These prefs are read by the playback
// hook to drive: hwAccel → `playsinline` policy + decoder hints,
// languages → track auto-select, subtitle font size → CSS var on the
// player overlay, buffer → MediaSource buffer ahead/behind window.

var LANG_LABELS = {
  off: 'Off',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
};

function PlaybackSettings(props) {
  var initialResult = React.useState(function() { return settingsStore.getPlayback(); });
  var pb = initialResult[0];
  var setPb = initialResult[1];

  var savedFlashResult = React.useState('');
  var savedFlash = savedFlashResult[0];
  var setSavedFlash = savedFlashResult[1];

  function update(patch) {
    var next = settingsStore.setPlayback(patch);
    setPb(next);
    setSavedFlash('Saved');
    setTimeout(function() { setSavedFlash(''); }, 1200);
    if (typeof props.onChange === 'function') { props.onChange(next); }
  }

  function reset() {
    update({
      hardwareAccel: settingsStore.DEFAULTS.playback.hardwareAccel,
      audioLanguage: settingsStore.DEFAULTS.playback.audioLanguage,
      subtitleLanguage: settingsStore.DEFAULTS.playback.subtitleLanguage,
      subtitleFontSizePct: settingsStore.DEFAULTS.playback.subtitleFontSizePct,
      videoBufferKb: settingsStore.DEFAULTS.playback.videoBufferKb,
    });
  }

  return (
    <div>
      <div style={CARD_STYLE}>
        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.88rem * var(--font-scale, 1))' }}>Hardware acceleration</div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Use the TV's hardware video decoder. Turn off only if playback stutters on certain codecs.
            </div>
          </div>
          <Toggle
            checked={pb.hardwareAccel}
            ariaLabel="Hardware acceleration"
            onChange={function(v) { update({ hardwareAccel: v }); }}
          />
        </div>
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Audio &amp; subtitles</div>
        <div style={CARD_TAGLINE_STYLE}>
          Preferred audio + subtitle track on first play. The player still falls back to whatever the stream provides if the preferred track is missing.
        </div>

        <label htmlFor="pb-audio" style={LABEL_STYLE}>Default audio language</label>
        <select
          id="pb-audio"
          value={pb.audioLanguage}
          onChange={function(e) { update({ audioLanguage: e.target.value }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={SELECT_STYLE}
        >
          {settingsStore.AUDIO_LANGS.map(function(code) {
            return <option key={code} value={code}>{LANG_LABELS[code] || code}</option>;
          })}
        </select>

        <label htmlFor="pb-sub" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>Default subtitle language</label>
        <select
          id="pb-sub"
          value={pb.subtitleLanguage}
          onChange={function(e) { update({ subtitleLanguage: e.target.value }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={SELECT_STYLE}
        >
          {settingsStore.SUB_LANGS.map(function(code) {
            return <option key={code} value={code}>{LANG_LABELS[code] || code}</option>;
          })}
        </select>

        <label htmlFor="pb-subsize" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>
          Subtitle font size: <strong style={{ color: 'var(--accent, #00d4ff)' }}>{pb.subtitleFontSizePct}%</strong>
        </label>
        <input
          id="pb-subsize"
          type="range"
          min="50"
          max="200"
          step="10"
          value={pb.subtitleFontSizePct}
          onChange={function(e) { update({ subtitleFontSizePct: parseInt(e.target.value, 10) }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={{ width: '100%', accentColor: 'var(--accent, #00d4ff)' }}
        />
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Video buffer</div>
        <div style={CARD_TAGLINE_STYLE}>
          Buffer ahead / behind window for MediaSource playback. Larger = smoother on weak Wi-Fi; smaller = lower memory on Mom's QN85.
        </div>
        <label htmlFor="pb-buf" style={LABEL_STYLE}>Buffer size (KB)</label>
        <input
          id="pb-buf"
          type="number"
          min="1024"
          max="16384"
          step="512"
          value={pb.videoBufferKb}
          onChange={function(e) { update({ videoBufferKb: parseInt(e.target.value, 10) }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
        {savedFlash ? (
          <span style={Object.assign({}, SUCCESS_BOX, { marginTop: 0, padding: '0.35rem 0.7rem' })}>{savedFlash}</span>
        ) : <span />}
        <button
          tabIndex={0}
          onClick={reset}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={BUTTON_STYLE('outline')}
        >Reset playback defaults</button>
      </div>
    </div>
  );
}

export default PlaybackSettings;

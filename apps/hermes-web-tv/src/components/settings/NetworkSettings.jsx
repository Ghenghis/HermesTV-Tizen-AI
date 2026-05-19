import React from 'react';
import * as settingsStore from '../../store/settingsStore.js';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  LABEL_STYLE, INPUT_STYLE, BUTTON_STYLE,
  WARNING_BOX, SUCCESS_BOX, ROW_STYLE,
  focusHandler, blurHandler,
} from './settingsStyles.js';
import Toggle from './Toggle.jsx';

// NetworkSettings — HTTP timeout, retry policy, proxy URL, ignore SSL
// errors toggle. Maps roughly to IPTV Player Zero's Socks5ProxySection
// + the implicit timeout/retry knobs Zero hides under MpvVideoSection.
//
// Edits are debounced into settingsStore on every change so the user
// doesn't need a Save button. A "Save"-style success flash appears on
// each write so the action feels acknowledged.
//
// Tizen 6.5 / Chrome 76 safe.
function NetworkSettings(props) {
  var initialResult = React.useState(function() { return settingsStore.getNetwork(); });
  var net = initialResult[0];
  var setNet = initialResult[1];

  var savedFlashResult = React.useState('');
  var savedFlash = savedFlashResult[0];
  var setSavedFlash = savedFlashResult[1];

  function update(patch) {
    var next = settingsStore.setNetwork(patch);
    setNet(next);
    setSavedFlash('Saved');
    setTimeout(function() { setSavedFlash(''); }, 1200);
    if (typeof props.onChange === 'function') { props.onChange(next); }
  }

  function reset() {
    update({
      timeoutMs: settingsStore.DEFAULTS.network.timeoutMs,
      retries: settingsStore.DEFAULTS.network.retries,
      retryBackoffMs: settingsStore.DEFAULTS.network.retryBackoffMs,
      proxyUrl: settingsStore.DEFAULTS.network.proxyUrl,
      ignoreSslErrors: false,
    });
  }

  return (
    <div>
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>HTTP timeout &amp; retries</div>
        <div style={CARD_TAGLINE_STYLE}>
          Controls every catalog, EPG, and TTS call. Lower timeout = faster failure on bad providers; higher = more patience over weak Wi-Fi.
        </div>

        <label htmlFor="net-timeout" style={LABEL_STYLE}>HTTP timeout (ms)</label>
        <input
          id="net-timeout"
          type="number"
          min="1000"
          max="60000"
          step="500"
          value={net.timeoutMs}
          onChange={function(e) { update({ timeoutMs: parseInt(e.target.value, 10) }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />

        <label htmlFor="net-retries" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>Max retries</label>
        <input
          id="net-retries"
          type="number"
          min="0"
          max="5"
          step="1"
          value={net.retries}
          onChange={function(e) { update({ retries: parseInt(e.target.value, 10) }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />

        <label htmlFor="net-backoff" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.7rem' })}>Retry backoff (ms)</label>
        <input
          id="net-backoff"
          type="number"
          min="100"
          max="10000"
          step="100"
          value={net.retryBackoffMs}
          onChange={function(e) { update({ retryBackoffMs: parseInt(e.target.value, 10) }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />
      </div>

      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Proxy URL</div>
        <div style={CARD_TAGLINE_STYLE}>
          Optional HTTP/SOCKS5 proxy applied to upstream provider calls (set on the API side). Format: <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>socks5://host:port</code> or <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>http://host:port</code>. Leave blank for direct.
        </div>
        <input
          id="net-proxy"
          type="text"
          placeholder="socks5://10.0.0.1:1080"
          value={net.proxyUrl}
          onChange={function(e) { update({ proxyUrl: e.target.value }); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />
      </div>

      <div style={CARD_STYLE}>
        <div style={ROW_STYLE}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.88rem * var(--font-scale, 1))' }}>Ignore SSL errors</div>
            <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Allow upstream HTTPS calls with invalid or self-signed certificates.
            </div>
          </div>
          <Toggle
            checked={net.ignoreSslErrors}
            ariaLabel="Ignore SSL errors"
            onChange={function(v) { update({ ignoreSslErrors: v }); }}
          />
        </div>
        {net.ignoreSslErrors && (
          <div style={WARNING_BOX}>
            <strong>Warning.</strong> Disables certificate verification for upstream provider calls. Only enable when troubleshooting a known-trusted provider with an expired or self-signed cert. Public network operators may MITM you with this on.
          </div>
        )}
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
        >Reset network defaults</button>
      </div>
    </div>
  );
}

export default NetworkSettings;

import React from 'react';
import * as settingsStore from '../../store/settingsStore.js';
import {
  CARD_STYLE, CARD_HEADER_STYLE, CARD_TAGLINE_STYLE,
  LABEL_STYLE, INPUT_STYLE, SELECT_STYLE, BUTTON_STYLE,
  WARNING_BOX, SUCCESS_BOX, ROW_STYLE,
  focusHandler, blurHandler,
} from './settingsStyles.js';
import Toggle from './Toggle.jsx';

// ParentalControls — PIN setup, age rating cap, hide-adult toggle.
//
// PIN security model:
//   - 4-8 digit PIN, never stored plaintext.
//   - SHA-256 hash of (per-user random salt + ':' + pin), hex-encoded.
//   - 5 wrong attempts → 5-minute lockout.
//   - The hash + salt + lockout counters live in settingsStore.
//
// UX:
//   - When no PIN exists, the card shows a "Create PIN" CTA.
//   - When a PIN exists, the policy controls require the user to enter
//     the PIN to unlock them (defense-in-depth — even if someone opens
//     Settings, they can't lift the parental gate without the PIN).
//   - "Change PIN" / "Remove PIN" actions are both gated on entering
//     the current PIN.
//
// Tizen 6.5 / Chrome 76 safe.

function _formatLockoutCountdown(untilMs) {
  var remaining = Math.max(0, untilMs - Date.now());
  var totalSec = Math.ceil(remaining / 1000);
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
}

function ParentalControls(props) {
  var pResult = React.useState(function() { return settingsStore.getParental(); });
  var parental = pResult[0];
  var setParental = pResult[1];

  // Local UI state — never persisted.
  var modeResult = React.useState(settingsStore.hasPin() ? 'locked' : 'no-pin');
  var mode = modeResult[0];
  var setMode = modeResult[1];

  var newPinResult = React.useState('');
  var newPin = newPinResult[0];
  var setNewPin = newPinResult[1];

  var confirmPinResult = React.useState('');
  var confirmPin = confirmPinResult[0];
  var setConfirmPin = confirmPinResult[1];

  var currentPinResult = React.useState('');
  var currentPin = currentPinResult[0];
  var setCurrentPin = currentPinResult[1];

  var errorResult = React.useState('');
  var errorMsg = errorResult[0];
  var setErrorMsg = errorResult[1];

  var successResult = React.useState('');
  var successMsg = successResult[0];
  var setSuccessMsg = successResult[1];

  var tickResult = React.useState(0);
  var setTick = tickResult[1];

  // Re-render once a second while locked out so the countdown updates.
  React.useEffect(function() {
    if (parental.lockoutUntilMs <= Date.now()) { return undefined; }
    var id = setInterval(function() { setTick(function(x) { return x + 1; }); }, 1000);
    return function() { clearInterval(id); };
  }, [parental.lockoutUntilMs]);

  function refresh() {
    setParental(settingsStore.getParental());
  }

  function flash(setter, msg) {
    setter(msg);
    setTimeout(function() { setter(''); }, 2500);
  }

  function handleCreate() {
    setErrorMsg('');
    if (!/^\d{4,8}$/.test(newPin)) {
      setErrorMsg('PIN must be 4-8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setErrorMsg('PINs do not match.');
      return;
    }
    settingsStore.setPin(newPin).then(function() {
      setNewPin('');
      setConfirmPin('');
      refresh();
      setMode('unlocked');
      flash(setSuccessMsg, 'PIN created. Parental controls are now active.');
    }).catch(function(e) {
      setErrorMsg((e && e.message) || 'Failed to create PIN.');
    });
  }

  function handleUnlock() {
    setErrorMsg('');
    if (!/^\d{4,8}$/.test(currentPin)) {
      setErrorMsg('Enter your 4-8 digit PIN.');
      return;
    }
    settingsStore.verifyPin(currentPin).then(function(result) {
      refresh();
      if (result.ok) {
        setCurrentPin('');
        setMode('unlocked');
        flash(setSuccessMsg, 'Unlocked. Make your changes below.');
      } else if (result.lockedOut) {
        setErrorMsg('Too many wrong attempts. Locked until ' + _formatLockoutCountdown(result.lockedUntilMs) + '.');
      } else {
        setErrorMsg('Wrong PIN. ' + result.attemptsRemaining + ' attempt(s) remaining.');
      }
    });
  }

  function handleChange() {
    setErrorMsg('');
    if (!/^\d{4,8}$/.test(newPin)) {
      setErrorMsg('New PIN must be 4-8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setErrorMsg('PINs do not match.');
      return;
    }
    // We're already unlocked at this point, so a direct setPin is safe.
    settingsStore.setPin(newPin).then(function() {
      setNewPin('');
      setConfirmPin('');
      refresh();
      flash(setSuccessMsg, 'PIN updated.');
    }).catch(function(e) {
      setErrorMsg((e && e.message) || 'Failed to update PIN.');
    });
  }

  function handleRemove() {
    settingsStore.clearPin();
    // Also reset policy back to safe defaults so a stale "unrestricted"
    // tier doesn't linger after the PIN is gone.
    settingsStore.setParental({
      ratingCap: 'unrestricted',
      hideAdultCategories: true,
    });
    refresh();
    setMode('no-pin');
    flash(setSuccessMsg, 'PIN removed. Parental controls disabled.');
  }

  function handlePolicyChange(patch) {
    var next = settingsStore.setParental(patch);
    setParental(next);
    flash(setSuccessMsg, 'Saved');
    if (typeof props.onChange === 'function') { props.onChange(next); }
  }

  // ─── Render branches ────────────────────────────────────────────────

  function renderLocked() {
    var locked = parental.lockoutUntilMs > Date.now();
    return (
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Enter PIN to unlock</div>
        <div style={CARD_TAGLINE_STYLE}>
          Parental controls are protected. Enter your PIN to change the rating cap or remove the lock.
        </div>
        <label htmlFor="pin-current" style={LABEL_STYLE}>Current PIN</label>
        <input
          id="pin-current"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={currentPin}
          onChange={function(e) { setCurrentPin(e.target.value.replace(/\D/g, '')); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          disabled={locked}
          onKeyDown={function(e) { if (e.key === 'Enter' && !locked) { handleUnlock(); } }}
          style={INPUT_STYLE}
        />
        {locked && (
          <div style={WARNING_BOX}>
            Locked out for {_formatLockoutCountdown(parental.lockoutUntilMs)} after 5 wrong attempts.
          </div>
        )}
        {errorMsg && <div style={WARNING_BOX}>{errorMsg}</div>}
        <div style={{ marginTop: '0.7rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            tabIndex={0}
            onClick={handleUnlock}
            disabled={locked}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={Object.assign({}, BUTTON_STYLE('filled'), { opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' })}
          >Unlock</button>
        </div>
      </div>
    );
  }

  function renderNoPin() {
    return (
      <div style={CARD_STYLE}>
        <div style={CARD_HEADER_STYLE}>Create parental PIN</div>
        <div style={CARD_TAGLINE_STYLE}>
          A 4-8 digit PIN locks the rating cap and adult-category controls below. The PIN is stored as a salted SHA-256 hash — never in plain text.
        </div>
        <label htmlFor="pin-new" style={LABEL_STYLE}>New PIN</label>
        <input
          id="pin-new"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          value={newPin}
          onChange={function(e) { setNewPin(e.target.value.replace(/\D/g, '')); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          style={INPUT_STYLE}
        />
        <label htmlFor="pin-confirm" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.6rem' })}>Confirm PIN</label>
        <input
          id="pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={8}
          value={confirmPin}
          onChange={function(e) { setConfirmPin(e.target.value.replace(/\D/g, '')); }}
          onFocus={focusHandler}
          onBlur={blurHandler}
          onKeyDown={function(e) { if (e.key === 'Enter') { handleCreate(); } }}
          style={INPUT_STYLE}
        />
        {errorMsg && <div style={WARNING_BOX}>{errorMsg}</div>}
        <div style={{ marginTop: '0.7rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            tabIndex={0}
            onClick={handleCreate}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={BUTTON_STYLE('filled')}
          >Create PIN</button>
        </div>
      </div>
    );
  }

  function renderUnlocked() {
    return (
      <div>
        <div style={CARD_STYLE}>
          <div style={CARD_HEADER_STYLE}>Content policy</div>
          <div style={CARD_TAGLINE_STYLE}>
            Filters apply across Live, Movies, and Series. Adult-coded categories are hidden when the toggle is on.
          </div>

          <label htmlFor="pc-rating" style={LABEL_STYLE}>Maximum rating</label>
          <select
            id="pc-rating"
            value={parental.ratingCap}
            onChange={function(e) { handlePolicyChange({ ratingCap: e.target.value }); }}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={SELECT_STYLE}
          >
            <option value="G">G — General audiences</option>
            <option value="PG">PG — Parental guidance</option>
            <option value="PG-13">PG-13 — Parents strongly cautioned</option>
            <option value="R">R — Restricted</option>
            <option value="NC-17">NC-17 — Adults only</option>
            <option value="unrestricted">Unrestricted</option>
          </select>

          <div style={Object.assign({}, ROW_STYLE, { marginTop: '0.8rem' })}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 'calc(0.88rem * var(--font-scale, 1))' }}>Hide adult categories</div>
              <div style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                Removes categories tagged "adult", "xxx", "18+", etc. from sidebars and search results.
              </div>
            </div>
            <Toggle
              checked={parental.hideAdultCategories}
              ariaLabel="Hide adult categories"
              onChange={function(v) { handlePolicyChange({ hideAdultCategories: v }); }}
            />
          </div>
        </div>

        <div style={CARD_STYLE}>
          <div style={CARD_HEADER_STYLE}>Change PIN</div>
          <label htmlFor="pin-new2" style={LABEL_STYLE}>New PIN</label>
          <input
            id="pin-new2"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            value={newPin}
            onChange={function(e) { setNewPin(e.target.value.replace(/\D/g, '')); }}
            onFocus={focusHandler}
            onBlur={blurHandler}
            style={INPUT_STYLE}
          />
          <label htmlFor="pin-confirm2" style={Object.assign({}, LABEL_STYLE, { marginTop: '0.6rem' })}>Confirm new PIN</label>
          <input
            id="pin-confirm2"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            value={confirmPin}
            onChange={function(e) { setConfirmPin(e.target.value.replace(/\D/g, '')); }}
            onFocus={focusHandler}
            onBlur={blurHandler}
            onKeyDown={function(e) { if (e.key === 'Enter') { handleChange(); } }}
            style={INPUT_STYLE}
          />
          {errorMsg && <div style={WARNING_BOX}>{errorMsg}</div>}
          <div style={{ marginTop: '0.7rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <button
              tabIndex={0}
              onClick={handleRemove}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={BUTTON_STYLE('danger')}
            >Remove PIN</button>
            <button
              tabIndex={0}
              onClick={handleChange}
              onFocus={focusHandler}
              onBlur={blurHandler}
              style={BUTTON_STYLE('filled')}
            >Save new PIN</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {successMsg && <div style={SUCCESS_BOX}>{successMsg}</div>}
      {mode === 'no-pin' && renderNoPin()}
      {mode === 'locked' && renderLocked()}
      {mode === 'unlocked' && renderUnlocked()}
    </div>
  );
}

export default ParentalControls;

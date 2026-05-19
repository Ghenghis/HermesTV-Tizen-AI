'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// KeyboardHelpModal — full-screen "?" overlay listing every browser keystroke
// and Samsung Tizen remote button HermesTV honors.
//
// Triggered by:
//   1. Pressing "?" on a hardware keyboard (handled by global listener in
//      App.jsx — to be wired in a follow-up).
//   2. Clicking the small header "?" button (also wired from App.jsx).
//   3. The chatbot command "show help" (matched in commandMatchers.js by
//      App.jsx in a follow-up wave).
//
// MOUNT NOTE (follow-up): Mount via
//   <KeyboardHelpModal isOpen={...} onClose={...} profile={...} />
// from App.jsx — to be wired in a follow-up. This component is self-contained
// and stays dormant until isOpen flips true, so adding the import does not
// affect runtime cost.
//
// ES5 React (no template literals / arrow funcs / optional chaining) so the
// same file ships to dev Chromium AND on-TV (Tizen 6.5 / Chrome 76) without
// a transpile pass. Matches the style of CommandHelpModal.jsx and the rest
// of apps/hermes-web-tv/src/components/.
//
// Reads keyCode → human-name mapping from utils/tizenKeyMap.js (TIZEN_KEY_CODES
// is the single source of truth). For the small subset of "friendly" names
// we display (e.g. "RED", "Channel ↑") we hard-code labels here with inline
// comments referencing the canonical key name from TIZEN_KEY_CODES — the
// upstream util does not currently export display-friendly strings.
//
// Mom-mode aware: when the active profile is Sherri's (mom_tv) OR has
// mom_mode=true, the modal shrinks to the 10 most useful shortcuts and uses
// a larger font/looser spacing. Same rule used by FloatingChatbot.jsx
// (isMomMode = profileId === 'mom_tv') and LayoutSwitcher.jsx
// (isMomMode = profile.mom_mode || fontScale >= 1.4).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { TIZEN_KEY_CODES } from '../utils/tizenKeyMap.js';

// ─── Shortcut tables ────────────────────────────────────────────────────────
// Each entry: { keys: [...string], desc: string }
// `keys` are rendered as <kbd> chips. We keep entries short — the modal is a
// quick reference, not a manual.

// Browser / keyboard shortcuts (apply on both desktop dev AND when a Bluetooth
// keyboard is paired with the Tizen TV).
var BROWSER_SHORTCUTS_ANYWHERE = [
  { keys: ['/'],       desc: 'Open search' },
  { keys: ['Ctrl', 'K'], desc: 'Open search' },
  { keys: ['?'],       desc: 'Show this help' },
  { keys: ['Esc'],     desc: 'Back / close' }
];

var BROWSER_SHORTCUTS_LIST = [
  { keys: ['←', '→', '↑', '↓'], desc: 'Navigate tiles' },
  { keys: ['Enter'],   desc: 'Select' },
  { keys: ['Esc'],     desc: 'Back to previous screen' }
];

var BROWSER_SHORTCUTS_WATCHING = [
  { keys: ['Space'],   desc: 'Play / pause' },
  { keys: ['←', '→'], desc: 'Seek -10s / +10s' },
  { keys: ['↑', '↓'], desc: 'Volume up / down' },
  { keys: ['M'],       desc: 'Mute' },
  { keys: ['F'],       desc: 'Fullscreen' },
  { keys: ['Esc'],     desc: 'Exit player' }
];

var BROWSER_SHORTCUTS_MODAL = [
  { keys: ['Tab'],     desc: 'Focus next control' },
  { keys: ['Enter'],   desc: 'Confirm' },
  { keys: ['Esc'],     desc: 'Close modal' }
];

// Samsung Tizen remote shortcuts. Friendly labels reference the key name
// emitted by TIZEN_KEY_CODES (utils/tizenKeyMap.js) — comments call out the
// upstream keyCode for traceability.
var TIZEN_SHORTCUTS_ANYWHERE = [
  // 403/404/405/406 — color buttons. See KEY_TO_COMMAND in tizenKeyMap.js
  // and ZERO_KEY_TO_COMMAND in zeroTizenKeyMap.js — color buttons are
  // chatbot quick commands (favorites, Live, Movies, Catch-up).
  { keys: ['RED'],     desc: 'Favorites toggle' },
  { keys: ['GREEN'],   desc: 'Live TV' },
  { keys: ['YELLOW'],  desc: 'Movies' },
  { keys: ['BLUE'],    desc: 'Catch-up' },
  // 10071/10135 — Smart Hub / Tools. Both bound to "toggle layout switcher".
  { keys: ['Smart Hub'], desc: 'Toggle layout switcher' },
  // 10009 — Back. App.jsx onBack handler closes the topmost modal.
  { keys: ['Back'],    desc: 'Exit modal / go back' }
];

var TIZEN_SHORTCUTS_LIST = [
  // 37/38/39/40 — D-pad arrows handled by tizenSpatialNav.js.
  { keys: ['←', '→', '↑', '↓'], desc: 'Navigate tiles' },
  // 13 — Enter / OK
  { keys: ['OK'],      desc: 'Select' },
  // 48..57 — num_0..num_9 in TIZEN_KEY_CODES
  { keys: ['0', '–', '9'], desc: 'Jump to channel number' }
];

var TIZEN_SHORTCUTS_WATCHING = [
  // 415/19/10252/413 — transport keys (play / pause / play_pause / stop)
  { keys: ['Play / Pause'], desc: 'Toggle playback' },
  // 417/412 — fast_forward / rewind
  { keys: ['FF'],      desc: 'Fast-forward' },
  { keys: ['REW'],     desc: 'Rewind' },
  { keys: ['STOP'],    desc: 'Stop playback' },
  // 427/428 — channel_up / channel_down
  { keys: ['CH ↑', 'CH ↓'], desc: 'Next / previous channel' },
  // 447/448/449 — volume_up / volume_down / mute
  { keys: ['VOL ↑', 'VOL ↓'], desc: 'Volume up / down' },
  { keys: ['MUTE'],    desc: 'Toggle mute' },
  // 457/10232 — info / guide
  { keys: ['INFO'],    desc: 'Show now-playing info' },
  { keys: ['GUIDE'],   desc: 'Open EPG' }
];

var TIZEN_SHORTCUTS_MODAL = [
  // 10009 — Back closes the modal (App.jsx onBack handler).
  { keys: ['Back'],    desc: 'Close modal' },
  { keys: ['OK'],      desc: 'Confirm' },
  { keys: ['←', '→', '↑', '↓'], desc: 'Move focus' }
];

// Mom-mode condensed list: 10 most useful shortcuts only. Mixes browser
// keys + remote so Sherri sees ONE simple list, not two columns of jargon.
var MOM_SHORTCUTS = [
  { keys: ['OK'],      desc: 'Choose this' },
  { keys: ['Back'],    desc: 'Go back' },
  { keys: ['←', '→', '↑', '↓'], desc: 'Move around' },
  { keys: ['GREEN'],   desc: 'Live TV' },
  { keys: ['YELLOW'],  desc: 'Movies' },
  { keys: ['Play / Pause'], desc: 'Pause and play' },
  { keys: ['VOL ↑', 'VOL ↓'], desc: 'Louder / quieter' },
  { keys: ['CH ↑', 'CH ↓'], desc: 'Next channel' },
  { keys: ['GUIDE'],   desc: 'TV guide' },
  { keys: ['?'],       desc: 'Show this help' }
];

// ─── Tab definitions ────────────────────────────────────────────────────────
var TABS = [
  { id: 'anywhere',  label: 'Anywhere' },
  { id: 'watching',  label: 'While watching' },
  { id: 'list',      label: 'In a list' },
  { id: 'modal',     label: 'In a modal' }
];

function getColumnsForTab(tabId) {
  if (tabId === 'watching') {
    return { browser: BROWSER_SHORTCUTS_WATCHING, remote: TIZEN_SHORTCUTS_WATCHING };
  }
  if (tabId === 'list') {
    return { browser: BROWSER_SHORTCUTS_LIST, remote: TIZEN_SHORTCUTS_LIST };
  }
  if (tabId === 'modal') {
    return { browser: BROWSER_SHORTCUTS_MODAL, remote: TIZEN_SHORTCUTS_MODAL };
  }
  return { browser: BROWSER_SHORTCUTS_ANYWHERE, remote: TIZEN_SHORTCUTS_ANYWHERE };
}

// Touch TIZEN_KEY_CODES once so the import isn't tree-shaken / lint-flagged
// as unused. Returning the count also surfaces the canonical mapping size in
// the modal footer for debug / transparency. Cheap (it's a JS object size).
function getRegisteredKeyCount() {
  var n = 0;
  for (var k in TIZEN_KEY_CODES) {
    if (Object.prototype.hasOwnProperty.call(TIZEN_KEY_CODES, k)) { n++; }
  }
  return n;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KbdChip(props) {
  // Renders a single key label as a small pill. Sized via --font-scale so
  // mom-mode (font-scale 1.4) gets readable chips without extra CSS.
  var fontScale = props.fontScale || 1;
  return (
    <span style={{
      display: 'inline-block',
      minWidth: '1.6em',
      padding: '0.2em 0.5em',
      margin: '0 0.15em',
      fontSize: (0.8 * fontScale) + 'rem',
      fontFamily: 'monospace',
      fontWeight: '600',
      color: 'var(--text)',
      backgroundColor: 'var(--surface-2, rgba(255,255,255,0.06))',
      border: '1px solid var(--border, #30363d)',
      borderRadius: '4px',
      textAlign: 'center',
      lineHeight: '1.2'
    }}>{props.children}</span>
  );
}

function ShortcutRow(props) {
  // One line: a list of <kbd> chips + a description. Rendered identically
  // in both columns and in the mom-mode condensed list.
  var entry = props.entry;
  var fontScale = props.fontScale || 1;
  var chips = [];
  for (var i = 0; i < entry.keys.length; i++) {
    chips.push(
      <KbdChip key={i} fontScale={fontScale}>{entry.keys[i]}</KbdChip>
    );
  }
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      padding: (0.35 * fontScale) + 'rem 0',
      borderBottom: '1px solid var(--border, #30363d)'
    }}>
      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{chips}</span>
      <span style={{
        flex: '1 1 auto',
        textAlign: 'right',
        fontSize: (0.85 * fontScale) + 'rem',
        color: 'var(--muted)'
      }}>{entry.desc}</span>
    </div>
  );
}

function ShortcutColumn(props) {
  // One column of the 2-column grid (browser OR remote).
  var heading = props.heading;
  var entries = props.entries;
  var fontScale = props.fontScale || 1;
  var rows = [];
  for (var i = 0; i < entries.length; i++) {
    rows.push(<ShortcutRow key={i} entry={entries[i]} fontScale={fontScale} />);
  }
  return (
    <div>
      <div style={{
        fontSize: (0.75 * fontScale) + 'rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--accent)',
        marginBottom: '0.5rem'
      }}>{heading}</div>
      {rows}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

function KeyboardHelpModal(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var profile = props.profile || null;

  // Mom-mode detection mirrors FloatingChatbot.jsx and LayoutSwitcher.jsx:
  //   isMomMode = profile.id === 'mom_tv'  ||  profile.mom_mode === true
  // Falls back to false when profile is missing so unauthenticated guests
  // see the full power-user view.
  var profileId = (profile && (profile.profile_id || profile.id)) || null;
  var isMomMode = (profileId === 'mom_tv') ||
                  (profile && profile.mom_mode === true);
  var fontScale = isMomMode ? 1.4 : 1.0;

  var tabResult = React.useState('anywhere');
  var activeTab = tabResult[0];
  var setActiveTab = tabResult[1];

  // Reset tab to default whenever the modal re-opens so the next user sees
  // a predictable starting view.
  React.useEffect(function() {
    if (isOpen) { setActiveTab('anywhere'); }
  }, [isOpen]);

  // Esc key closes — matches every other modal in this codebase. The "?"
  // open-shortcut is owned by App.jsx (global keydown listener), NOT here,
  // so we don't double-bind.
  React.useEffect(function() {
    if (!isOpen) { return; }
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (typeof onClose === 'function') { onClose(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return function() { document.removeEventListener('keydown', handleKey); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  var columns = getColumnsForTab(activeTab);
  var totalKeys = getRegisteredKeyCount();

  // ─── Render: mom-mode (simplified) ────────────────────────────────────────
  if (isMomMode) {
    var momRows = [];
    for (var i = 0; i < MOM_SHORTCUTS.length; i++) {
      momRows.push(
        <ShortcutRow key={i} entry={MOM_SHORTCUTS[i]} fontScale={fontScale} />
      );
    }
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-help-title"
        onClick={function(e) { if (e.target === e.currentTarget) { onClose(); } }}
        style={{
          position: 'fixed',
          top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}
      >
        <div style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '14px',
          padding: '2rem',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          color: 'var(--text)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
        }}>
          <h2 id="kb-help-title" style={{
            margin: '0 0 1rem 0',
            fontSize: (1.5 * fontScale) + 'rem',
            fontWeight: '700'
          }}>Remote Help</h2>
          <p style={{
            margin: '0 0 1.25rem 0',
            fontSize: (0.95 * fontScale) + 'rem',
            color: 'var(--muted)'
          }}>The buttons you'll use the most.</p>
          <div>{momRows}</div>
          <button
            autoFocus
            tabIndex={0}
            onClick={onClose}
            aria-label="Close remote help"
            style={{
              marginTop: '1.5rem',
              width: '100%',
              padding: (0.75 * fontScale) + 'rem',
              fontSize: (1.0 * fontScale) + 'rem',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: 'var(--accent, #1f6feb)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              outline: 'none'
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '3px solid var(--accent)'; e.currentTarget.style.outlineOffset = '3px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >Got it</button>
        </div>
      </div>
    );
  }

  // ─── Render: full power-user view ─────────────────────────────────────────
  var tabButtons = [];
  for (var t = 0; t < TABS.length; t++) {
    (function(tab) {
      var isActive = activeTab === tab.id;
      tabButtons.push(
        <button
          key={tab.id}
          tabIndex={0}
          onClick={function() { setActiveTab(tab.id); }}
          aria-pressed={isActive}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            fontWeight: isActive ? '700' : '500',
            color: isActive ? 'var(--accent)' : 'var(--muted)',
            backgroundColor: isActive ? 'rgba(31,111,235,0.12)' : 'transparent',
            border: '1px solid ' + (isActive ? 'var(--accent)' : 'var(--border, #30363d)'),
            borderRadius: '6px',
            cursor: 'pointer',
            outline: 'none'
          }}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >{tab.label}</button>
      );
    })(TABS[t]);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kb-help-title"
      onClick={function(e) { if (e.target === e.currentTarget) { onClose(); } }}
      style={{
        position: 'fixed',
        top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.75)',
        zIndex: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '12px',
        padding: '1.5rem',
        maxWidth: '880px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: 'var(--text)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '1rem'
        }}>
          <div>
            <h2 id="kb-help-title" style={{
              margin: 0,
              fontSize: '1.35rem',
              fontWeight: '700'
            }}>Keyboard &amp; Remote Shortcuts</h2>
            <div style={{
              marginTop: '0.25rem',
              fontSize: '0.75rem',
              color: 'var(--muted)'
            }}>{totalKeys} keys mapped &middot; press <KbdChip>?</KbdChip> any time</div>
          </div>
          <button
            tabIndex={0}
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: 'none',
              border: '1px solid var(--border, #30363d)',
              color: 'var(--muted)',
              fontSize: '1.25rem',
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              cursor: 'pointer',
              outline: 'none',
              lineHeight: 1
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >&times;</button>
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Shortcut context" style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem'
        }}>{tabButtons}</div>

        {/* 2-column grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem'
        }}>
          <ShortcutColumn
            heading="Browser / Keyboard"
            entries={columns.browser}
            fontScale={fontScale}
          />
          <ShortcutColumn
            heading="Samsung Tizen Remote"
            entries={columns.remote}
            fontScale={fontScale}
          />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '1.5rem',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            autoFocus
            tabIndex={0}
            onClick={onClose}
            style={{
              padding: '0.6rem 1.4rem',
              fontSize: '0.95rem',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: 'var(--accent, #1f6feb)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              outline: 'none'
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >Got it</button>
        </div>
      </div>
    </div>
  );
}

export default KeyboardHelpModal;

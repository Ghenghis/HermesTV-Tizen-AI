import React from 'react';
import * as playlistClient from '../api/playlistClient.js';

// ─────────────────────────────────────────────────────────────────────────────
// PlaylistImportModal — 3-step wizard for importing m3u / XMLTV / Xtream /
// Stalker playlists. Mirrors the IPTV Player Zero "Add Playlist" flow from
// G:\Github\IPTV_Player_Zero\docs\USER_JOURNEYS.md §1.
//
// Steps:
//   1. Source     — pick URL / file / Xtream / Stalker; fill source fields.
//   2. Validate   — POST /api/playlists/preview, render channel + group
//                   counts and the first 10 channel names.
//   3. Confirm    — pick a name + provider_id tag, POST /api/playlists/save.
//
// Style: matches the polish from PR #75 — `hermes-modal-overlay`,
// `hermes-modal-panel`, `hermes-gradient-header`. 3-dot progress indicator
// across the top, accent color marks the current step.
//
// Tizen 6.5 / Chrome 76 safe: no spread, no optional chaining, no nullish
// coalescing in JSX, no async/await. Auto-focus on the first focusable
// element of each step so remote users can navigate without a mouse.
//
// Errors render inline with a "Try again" button (re-runs whatever step
// the user is on) — no toasts, no silent failures. xtream / stalker stub
// responses (HTTP 501) get a clear "Not yet — Xtream-Codes ingest lands in
// a follow-up" message so the operator knows it's a feature gap, not a bug.
// ─────────────────────────────────────────────────────────────────────────────

var STEP_SOURCE = 'source';
var STEP_PREVIEW = 'preview';
var STEP_CONFIRM = 'confirm';

// Wave-17/19: Stalker portal removed (UI for an unimplemented backend = stub
// content, which violates the no-fakes rule in feedback_no_mocks_no_stubs.md).
// Xtream-Codes login is REAL — the server backs it via lib/xtreamClient.js
// (wired into resolveCatalog as of wave-19). When a Stalker adapter exists,
// re-add that option with a working backend at the same time.
var SOURCE_OPTIONS = [
  { id: 'url',     label: 'URL',                hint: 'Paste a public M3U or XMLTV URL.' },
  { id: 'file',    label: 'Upload file',        hint: 'Choose a local .m3u or .m3u8 file. 10 MB max.' },
  { id: 'xtream',  label: 'Xtream-Codes login', hint: 'Host + username + password.' },
];

var PROVIDER_TAG_OPTIONS = [
  { id: 'custom',       label: 'Custom (operator-imported)' },
  { id: 'apollo_group', label: 'Apollo Group' },
  { id: 'xtremehd',     label: 'XtremeHD' },
];

var INITIAL_STATE = {
  step: STEP_SOURCE,
  sourceType: 'url',
  urlValue: '',
  fileText: '',
  fileName: '',
  xtreamHost: '',
  xtreamUser: '',
  xtreamPass: '',
  stalkerPortal: '',
  stalkerMac: '',
  // /preview result
  preview: null,
  // step 3 fields
  playlistName: '',
  providerTag: 'custom',
  // save result (set on success)
  saved: null,
  // UI state
  pending: false,
  error: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSourcePayload(state) {
  if (state.sourceType === 'url') { return { type: 'url', url: state.urlValue }; }
  if (state.sourceType === 'file') { return { type: 'file', file: state.fileText }; }
  if (state.sourceType === 'xtream') {
    return {
      type: 'xtream',
      credentials: { host: state.xtreamHost, username: state.xtreamUser, password: state.xtreamPass },
    };
  }
  // stalker
  return {
    type: 'stalker',
    credentials: { portal_url: state.stalkerPortal, mac: state.stalkerMac },
  };
}

function isSourceValid(state) {
  if (state.sourceType === 'url') {
    if (typeof state.urlValue !== 'string' || state.urlValue.length === 0) { return false; }
    var lower = state.urlValue.toLowerCase();
    return lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0;
  }
  if (state.sourceType === 'file') {
    return typeof state.fileText === 'string' && state.fileText.length > 0;
  }
  if (state.sourceType === 'xtream') {
    return state.xtreamHost.length > 0 && state.xtreamUser.length > 0 && state.xtreamPass.length > 0;
  }
  // stalker
  return state.stalkerPortal.length > 0 && state.stalkerMac.length > 0;
}

// Strip the same patterns the server strips so the inline preview matches
// what /save will accept. Belt-and-suspenders: the server re-sanitises too.
function clientSanitiseName(name) {
  if (typeof name !== 'string') { return ''; }
  return name.replace(/[<>]/g, '').replace(/script/gi, '').trim().slice(0, 80);
}

// ── Inline UI primitives ─────────────────────────────────────────────────────

function ProgressDots(props) {
  var current = props.current;
  var labels = ['Source', 'Validate', 'Confirm'];
  var keys = [STEP_SOURCE, STEP_PREVIEW, STEP_CONFIRM];
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={keys.indexOf(current) + 1}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '0.4rem 0' }}
    >
      {labels.map(function(label, i) {
        var stepKey = keys[i];
        var isActive = stepKey === current;
        var isPast = keys.indexOf(current) > i;
        var color = isActive ? 'var(--accent, #00d4ff)' : (isPast ? 'rgba(0,212,255,0.55)' : 'rgba(255,255,255,0.25)');
        return (
          <div key={stepKey} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              aria-hidden="true"
              style={{
                width: '10px', height: '10px',
                borderRadius: '50%',
                background: color,
                transition: 'background-color 200ms ease',
                boxShadow: isActive ? '0 0 0 4px rgba(0,212,255,0.15)' : 'none',
              }}
            />
            <span
              style={{
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent, #00d4ff)' : 'var(--muted, #8b949e)',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </span>
            {i < 2 && (
              <span
                aria-hidden="true"
                style={{ width: '24px', height: '1px', background: 'rgba(255,255,255,0.12)', marginLeft: '0.3rem' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldLabel(props) {
  return (
    <label
      htmlFor={props.htmlFor}
      style={{
        display: 'block',
        fontSize: 'calc(0.78rem * var(--font-scale, 1))',
        color: 'var(--muted, #8b949e)',
        marginBottom: '0.3rem',
        fontWeight: 600,
      }}
    >
      {props.children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      id={props.id}
      type={props.type || 'text'}
      value={props.value || ''}
      onChange={props.onChange}
      placeholder={props.placeholder || ''}
      autoFocus={!!props.autoFocus}
      aria-label={props.ariaLabel || props.placeholder || ''}
      tabIndex={0}
      style={{
        width: '100%',
        padding: '0.55rem 0.8rem',
        background: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 'var(--radius-md, 10px)',
        color: 'var(--text, #e6edf3)',
        fontSize: 'calc(0.88rem * var(--font-scale, 1))',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      }}
      onFocus={function(e) {
        e.currentTarget.style.borderColor = 'var(--accent, #00d4ff)';
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,212,255,0.18)';
      }}
      onBlur={function(e) {
        e.currentTarget.style.borderColor = 'var(--border, #30363d)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );
}

function PrimaryButton(props) {
  var disabled = !!props.disabled;
  return (
    <button
      type="button"
      tabIndex={0}
      disabled={disabled}
      autoFocus={!!props.autoFocus}
      onClick={props.onClick}
      onKeyDown={function(e) { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); if (props.onClick) { props.onClick(); } } }}
      style={{
        padding: '0.6rem 1.4rem',
        background: disabled
          ? 'rgba(255,255,255,0.1)'
          : 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
        border: 'none',
        borderRadius: 'var(--radius-pill, 999px)',
        color: disabled ? 'var(--muted, #8b949e)' : '#0a1628',
        fontSize: 'calc(0.88rem * var(--font-scale, 1))',
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        boxShadow: disabled ? 'none' : '0 6px 18px rgba(0,212,255,0.28)',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onFocus={function(e) { if (!disabled) { e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent, #00d4ff)'; } }}
      onBlur={function(e) { if (!disabled) { e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,212,255,0.28)'; } }}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props) {
  return (
    <button
      type="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (props.onClick) { props.onClick(); } } }}
      style={{
        padding: '0.55rem 1.2rem',
        background: 'transparent',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 'var(--radius-pill, 999px)',
        color: 'var(--text, #e6edf3)',
        fontSize: 'calc(0.85rem * var(--font-scale, 1))',
        fontWeight: 600,
        cursor: 'pointer',
        outline: 'none',
        transition: 'background-color 160ms ease, border-color 160ms ease',
      }}
      onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
      onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
    >
      {props.children}
    </button>
  );
}

// ── Step bodies ──────────────────────────────────────────────────────────────

function StepSource(props) {
  var state = props.state;
  var setField = props.setField;
  var onFileChosen = props.onFileChosen;

  function renderSourcePicker() {
    return (
      <div role="radiogroup" aria-label="Source type" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        {SOURCE_OPTIONS.map(function(opt, idx) {
          var isActive = state.sourceType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              autoFocus={idx === 0 && state.sourceType === 'url'}
              onClick={function() { setField('sourceType', opt.id); }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setField('sourceType', opt.id); } }}
              style={{
                textAlign: 'left',
                padding: '0.7rem 0.85rem',
                background: isActive ? 'rgba(0,212,255,0.12)' : 'var(--surface-raised, #1c2128)',
                border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)'),
                borderRadius: '12px',
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                outline: 'none',
                transition: 'background-color 160ms ease, border-color 160ms ease',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: 'calc(0.92rem * var(--font-scale, 1))' }}>{opt.label}</span>
                {opt.stub && (
                  <span
                    style={{
                      fontSize: 'calc(0.6rem * var(--font-scale, 1))',
                      fontWeight: 800,
                      color: '#0a1628',
                      background: '#facc15',
                      padding: '0.05rem 0.4rem',
                      borderRadius: '999px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    SOON
                  </span>
                )}
              </div>
              <div style={{ marginTop: '0.2rem', fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
                {opt.hint}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function renderSourceForm() {
    if (state.sourceType === 'url') {
      return (
        <div>
          <FieldLabel htmlFor="pim-url">Playlist URL</FieldLabel>
          <TextInput
            id="pim-url"
            type="url"
            value={state.urlValue}
            placeholder="https://example.com/playlist.m3u"
            autoFocus={true}
            onChange={function(e) { setField('urlValue', e.target.value); }}
            ariaLabel="Playlist URL"
          />
          <div style={{ marginTop: '0.4rem', fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
            Only <code style={codeStyle}>http://</code> and <code style={codeStyle}>https://</code> are accepted.
          </div>
        </div>
      );
    }
    if (state.sourceType === 'file') {
      return (
        <div>
          <FieldLabel htmlFor="pim-file">M3U / XMLTV file</FieldLabel>
          <input
            id="pim-file"
            type="file"
            accept=".m3u,.m3u8,.xml,.xmltv,text/plain,application/xml"
            autoFocus
            tabIndex={0}
            onChange={onFileChosen}
            style={{
              width: '100%',
              padding: '0.55rem 0.8rem',
              background: 'var(--surface-raised, #1c2128)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 'var(--radius-md, 10px)',
              color: 'var(--text, #e6edf3)',
              outline: 'none',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
          />
          {state.fileName && (
            <div style={{ marginTop: '0.4rem', fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--text, #e6edf3)' }}>
              Selected: <strong>{state.fileName}</strong>
              {' '}
              <span style={{ color: 'var(--muted, #8b949e)' }}>
                ({Math.round((state.fileText.length / 1024) * 10) / 10} KB)
              </span>
            </div>
          )}
          <div style={{ marginTop: '0.4rem', fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
            Max upload size: 10 MB. Larger files are rejected.
          </div>
        </div>
      );
    }
    if (state.sourceType === 'xtream') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div>
            <FieldLabel htmlFor="pim-xt-host">Server host</FieldLabel>
            <TextInput
              id="pim-xt-host"
              value={state.xtreamHost}
              placeholder="http://your-iptv-host.example:8080"
              autoFocus={true}
              onChange={function(e) { setField('xtreamHost', e.target.value); }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pim-xt-user">Username</FieldLabel>
            <TextInput
              id="pim-xt-user"
              value={state.xtreamUser}
              placeholder="account username"
              onChange={function(e) { setField('xtreamUser', e.target.value); }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="pim-xt-pass">Password</FieldLabel>
            <TextInput
              id="pim-xt-pass"
              type="password"
              value={state.xtreamPass}
              placeholder="account password"
              onChange={function(e) { setField('xtreamPass', e.target.value); }}
            />
          </div>
          <div
            role="note"
            style={{
              padding: '0.5rem 0.7rem',
              background: 'rgba(250,204,21,0.08)',
              border: '1px solid rgba(250,204,21,0.4)',
              borderRadius: '10px',
              color: '#facc15',
              fontSize: 'calc(0.75rem * var(--font-scale, 1))',
            }}
          >
            Xtream-Codes ingest lands in a follow-up. The preview step will return
            a clear "not yet" message so you know nothing was saved.
          </div>
        </div>
      );
    }
    // stalker
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div>
          <FieldLabel htmlFor="pim-st-portal">Portal URL</FieldLabel>
          <TextInput
            id="pim-st-portal"
            value={state.stalkerPortal}
            placeholder="http://your-portal.example/c/"
            autoFocus={true}
            onChange={function(e) { setField('stalkerPortal', e.target.value); }}
          />
        </div>
        <div>
          <FieldLabel htmlFor="pim-st-mac">MAC address</FieldLabel>
          <TextInput
            id="pim-st-mac"
            value={state.stalkerMac}
            placeholder="00:1A:79:XX:XX:XX"
            onChange={function(e) { setField('stalkerMac', e.target.value); }}
          />
        </div>
        <div
          role="note"
          style={{
            padding: '0.5rem 0.7rem',
            background: 'rgba(250,204,21,0.08)',
            border: '1px solid rgba(250,204,21,0.4)',
            borderRadius: '10px',
            color: '#facc15',
            fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          }}
        >
          Stalker portal ingest lands in a follow-up. The preview step will return
          a clear "not yet" message so you know nothing was saved.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', marginBottom: '0.75rem' }}>
        Choose where your playlist lives. We'll preview channels before saving.
      </div>
      {renderSourcePicker()}
      {renderSourceForm()}
    </div>
  );
}

function StepPreview(props) {
  var preview = props.preview;
  var pending = !!props.pending;
  var error = props.error;
  var onRetry = props.onRetry;

  if (pending) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted, #8b949e)' }}>
        <div
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '24px', height: '24px',
            border: '3px solid rgba(0,212,255,0.25)',
            borderTopColor: 'var(--accent, #00d4ff)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '0.8rem',
          }}
        />
        <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
          Validating playlist… this can take a few seconds for large M3Us.
        </div>
      </div>
    );
  }

  if (error) {
    var isStub = error.code === 'not_implemented';
    return (
      <div
        role="alert"
        style={{
          padding: '0.9rem 1rem',
          background: isStub ? 'rgba(250,204,21,0.08)' : 'rgba(248,81,73,0.08)',
          border: '1px solid ' + (isStub ? 'rgba(250,204,21,0.45)' : 'rgba(248,81,73,0.45)'),
          borderRadius: '12px',
          color: isStub ? '#facc15' : '#f85149',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>
          {isStub ? 'Not yet — feature gap' : 'Could not validate the source'}
        </div>
        <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', marginBottom: '0.6rem' }}>
          {error.message || 'Unknown error'}
        </div>
        {!isStub && (
          <PrimaryButton autoFocus onClick={onRetry}>Try again</PrimaryButton>
        )}
      </div>
    );
  }

  if (!preview) {
    return (
      <div style={{ padding: '1rem', color: 'var(--muted, #8b949e)' }}>
        No preview yet.
      </div>
    );
  }

  var channels = preview.channels_count || 0;
  var groups = preview.groups_count || 0;
  var sample = Array.isArray(preview.sample_channels) ? preview.sample_channels : [];

  if (channels === 0) {
    return (
      <div
        role="alert"
        style={{
          padding: '0.9rem 1rem',
          background: 'rgba(248,81,73,0.08)',
          border: '1px solid rgba(248,81,73,0.45)',
          borderRadius: '12px',
          color: '#f85149',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Zero channels parsed</div>
        <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', marginBottom: '0.6rem' }}>
          The source loaded but produced no playable channels. Double-check the URL
          or file is a valid M3U.
        </div>
        <PrimaryButton autoFocus onClick={onRetry}>Try again</PrimaryButton>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.6rem',
          marginBottom: '0.8rem',
        }}
      >
        <div
          style={{
            background: 'var(--surface-raised, #1c2128)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '12px',
            padding: '0.7rem 0.85rem',
          }}
        >
          <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Channels
          </div>
          <div style={{ fontSize: 'calc(1.6rem * var(--font-scale, 1))', fontWeight: 800, color: 'var(--accent, #00d4ff)' }}>
            {channels}
          </div>
        </div>
        <div
          style={{
            background: 'var(--surface-raised, #1c2128)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '12px',
            padding: '0.7rem 0.85rem',
          }}
        >
          <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Groups
          </div>
          <div style={{ fontSize: 'calc(1.6rem * var(--font-scale, 1))', fontWeight: 800, color: 'var(--text, #e6edf3)' }}>
            {groups}
          </div>
        </div>
      </div>
      <div
        style={{
          background: 'var(--surface-raised, #1c2128)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '12px',
          padding: '0.7rem 0.85rem',
        }}
      >
        <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', marginBottom: '0.4rem', fontWeight: 600 }}>
          First {sample.length} channels
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 1.1rem', color: 'var(--text, #e6edf3)', fontSize: 'calc(0.85rem * var(--font-scale, 1))', lineHeight: 1.55 }}>
          {sample.map(function(ch, i) {
            return <li key={'ch-' + i}>{ch}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

function StepConfirm(props) {
  var state = props.state;
  var setField = props.setField;
  var saved = props.saved;
  var pending = !!props.pending;
  var error = props.error;
  var onRetry = props.onRetry;

  if (saved) {
    return (
      <div
        role="status"
        style={{
          padding: '1rem',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.45)',
          borderRadius: '12px',
          color: '#22c55e',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 'calc(1rem * var(--font-scale, 1))', marginBottom: '0.4rem' }}>
          Saved &mdash; {saved.name}
        </div>
        <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', color: 'var(--text, #e6edf3)' }}>
          {saved.channels_count} channels are now available under the
          {' '}<strong>{saved.provider_id}</strong> tag. Redirecting to Settings &rarr; Providers.
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted, #8b949e)' }}>
        <div
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '24px', height: '24px',
            border: '3px solid rgba(0,212,255,0.25)',
            borderTopColor: 'var(--accent, #00d4ff)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '0.8rem',
          }}
        />
        <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>Saving…</div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.7rem 0.85rem',
            background: 'rgba(248,81,73,0.08)',
            border: '1px solid rgba(248,81,73,0.45)',
            borderRadius: '12px',
            color: '#f85149',
            marginBottom: '0.8rem',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>Save failed</div>
          <div style={{ fontSize: 'calc(0.82rem * var(--font-scale, 1))', marginBottom: '0.5rem' }}>
            {error.message || 'Unknown error'}
          </div>
          <PrimaryButton autoFocus onClick={onRetry}>Try again</PrimaryButton>
        </div>
      )}

      <div style={{ marginBottom: '0.8rem' }}>
        <FieldLabel htmlFor="pim-name">Playlist name</FieldLabel>
        <TextInput
          id="pim-name"
          value={state.playlistName}
          placeholder="e.g. Apollo Sports HD"
          autoFocus={!error}
          onChange={function(e) { setField('playlistName', e.target.value); }}
        />
        <div style={{ marginTop: '0.3rem', fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
          Angle brackets and the word "script" are stripped. Max 80 chars.
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="pim-tag">Provider tag</FieldLabel>
        <select
          id="pim-tag"
          tabIndex={0}
          value={state.providerTag}
          onChange={function(e) { setField('providerTag', e.target.value); }}
          style={{
            width: '100%',
            padding: '0.55rem 0.7rem',
            background: 'var(--surface-raised, #1c2128)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: 'var(--radius-md, 10px)',
            color: 'var(--text, #e6edf3)',
            fontSize: 'calc(0.88rem * var(--font-scale, 1))',
            outline: 'none',
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        >
          {PROVIDER_TAG_OPTIONS.map(function(opt) {
            return <option key={opt.id} value={opt.id}>{opt.label}</option>;
          })}
        </select>
      </div>
    </div>
  );
}

var codeStyle = {
  background: 'rgba(0,212,255,0.12)',
  padding: '0.05rem 0.35rem',
  borderRadius: '4px',
  color: 'var(--accent, #00d4ff)',
  fontSize: '0.95em',
};

// ── Modal shell ──────────────────────────────────────────────────────────────

function PlaylistImportModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var onSaved = props.onSaved; // optional — parent can refresh /api/providers etc.

  var stateResult = React.useState(INITIAL_STATE);
  var state = stateResult[0];
  var setState = stateResult[1];

  function patch(p) { setState(function(prev) { return Object.assign({}, prev, p); }); }
  function setField(name, value) {
    var p = {};
    p[name] = value;
    patch(p);
  }

  // Reset every time the modal re-opens so the user doesn't see stale data
  // from a prior cancelled run. Errors and saved-success states clear too.
  React.useEffect(function() {
    if (isOpen) {
      setState(INITIAL_STATE);
    }
  }, [isOpen]);

  // ESC closes — same pattern as DownloadModal / SettingsPanelTabbed.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') { onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() { document.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  // ── Step transitions ─────────────────────────────────────────────────────
  function gotoPreview() {
    if (!isSourceValid(state)) { return; }
    patch({ step: STEP_PREVIEW, pending: true, error: null, preview: null });
    playlistClient.previewPlaylist(buildSourcePayload(state))
      .then(function(preview) { patch({ preview: preview, pending: false, error: null }); })
      .catch(function(err) {
        patch({
          pending: false,
          error: { message: err.message || 'Preview failed', code: err.code || 'preview_error' },
        });
      });
  }

  function retryPreview() {
    patch({ pending: true, error: null, preview: null });
    playlistClient.previewPlaylist(buildSourcePayload(state))
      .then(function(preview) { patch({ preview: preview, pending: false, error: null }); })
      .catch(function(err) {
        patch({ pending: false, error: { message: err.message || 'Preview failed', code: err.code || 'preview_error' } });
      });
  }

  function gotoConfirm() {
    // Pre-fill the name from the URL hostname / filename if blank.
    var defaultName = state.playlistName;
    if (!defaultName && state.sourceType === 'url') {
      try {
        var u = new URL(state.urlValue);
        defaultName = u.hostname.replace(/^www\./, '');
      } catch (_) { defaultName = ''; }
    }
    if (!defaultName && state.sourceType === 'file' && state.fileName) {
      defaultName = state.fileName.replace(/\.(m3u8?|xml|xmltv|txt)$/i, '');
    }
    patch({ step: STEP_CONFIRM, error: null, playlistName: clientSanitiseName(defaultName) });
  }

  function gotoBack() {
    if (state.step === STEP_CONFIRM) {
      patch({ step: STEP_PREVIEW, error: null });
      return;
    }
    if (state.step === STEP_PREVIEW) {
      patch({ step: STEP_SOURCE, error: null, preview: null });
    }
  }

  function doSave() {
    var name = clientSanitiseName(state.playlistName);
    if (!name) {
      patch({ error: { message: 'Please name the playlist before saving.', code: 'name_required' } });
      return;
    }
    patch({ pending: true, error: null });
    playlistClient.savePlaylist({
      name: name,
      provider_id: state.providerTag,
      source: buildSourcePayload(state),
    }).then(function(saved) {
      patch({ pending: false, saved: saved, error: null });
      // Brief delay so the success state is visible, then trigger the
      // parent's redirect / refresh callback. The modal stays open just
      // long enough for the user to register "yes, that worked".
      setTimeout(function() {
        if (typeof onSaved === 'function') { onSaved(saved); }
        if (typeof onClose === 'function') { onClose(); }
      }, 1200);
    }).catch(function(err) {
      patch({ pending: false, error: { message: err.message || 'Save failed', code: err.code || 'save_error' } });
    });
  }

  function handleFileChosen(evt) {
    var file = evt && evt.target && evt.target.files && evt.target.files[0];
    if (!file) { return; }
    if (file.size > 10 * 1024 * 1024) {
      patch({ error: { message: 'File is larger than 10 MB. Pick a smaller playlist.', code: 'payload_too_large' } });
      return;
    }
    var reader = new FileReader();
    reader.onload = function() {
      var text = String(reader.result || '');
      patch({ fileText: text, fileName: file.name, error: null });
    };
    reader.onerror = function() {
      patch({ error: { message: 'Could not read the file. Try again.', code: 'file_read_error' } });
    };
    reader.readAsText(file);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  var canNextFromSource = isSourceValid(state) && !state.pending;
  var canNextFromPreview = !!state.preview && state.preview.channels_count > 0 && !state.pending && !state.error;
  var canSave = state.step === STEP_CONFIRM && clientSanitiseName(state.playlistName).length > 0 && !state.pending && !state.saved;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import playlist"
      onClick={function(e) {
        if (e.target === e.currentTarget && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 65,
        background: 'rgba(5,8,14,0.78)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4vh 1.5rem',
        overflowY: 'auto',
      }}
    >
      {/* Spinner keyframes — scoped style tag so we don't need to touch index.css */}
      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>

      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '600px',
          background: 'var(--surface, #161b22)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden',
        }}
      >
        {/* Gradient header */}
        <div
          className="hermes-gradient-header"
          style={{
            padding: '1rem 1.3rem 0.85rem',
            borderBottom: '1px solid var(--border, #30363d)',
            background: 'linear-gradient(180deg, var(--surface-raised, #1c2128), var(--surface, #161b22))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                aria-hidden="true"
                style={{
                  width: '34px', height: '34px',
                  borderRadius: '10px',
                  background: 'rgba(0, 212, 255, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent, #00d4ff)',
                  fontSize: '16px',
                }}
              >
                &#x2630;
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 'calc(1rem * var(--font-scale, 1))' }}>Import playlist</div>
                <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
                  M3U / XMLTV / Xtream-Codes / Stalker portal
                </div>
              </div>
            </div>
            <button
              type="button"
              tabIndex={0}
              onClick={onClose}
              aria-label="Cancel and close playlist import"
              style={{
                width: '34px', height: '34px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                outline: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, fontSize: '16px',
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &times;
            </button>
          </div>
          <div style={{ marginTop: '0.65rem' }}>
            <ProgressDots current={state.step} />
          </div>
        </div>

        {/* Step body */}
        <div style={{ padding: '1rem 1.3rem 0.4rem', minHeight: '180px' }}>
          {state.step === STEP_SOURCE && (
            <StepSource state={state} setField={setField} onFileChosen={handleFileChosen} />
          )}
          {state.step === STEP_PREVIEW && (
            <StepPreview
              preview={state.preview}
              pending={state.pending}
              error={state.error}
              onRetry={retryPreview}
            />
          )}
          {state.step === STEP_CONFIRM && (
            <StepConfirm
              state={state}
              setField={setField}
              saved={state.saved}
              pending={state.pending}
              error={state.error}
              onRetry={doSave}
            />
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.9rem 1.3rem',
            borderTop: '1px solid var(--border, #30363d)',
            background: 'var(--surface, #161b22)',
            gap: '0.6rem',
            flexWrap: 'wrap',
          }}
        >
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {state.step !== STEP_SOURCE && !state.saved && (
              <SecondaryButton onClick={gotoBack}>&larr; Back</SecondaryButton>
            )}
            {state.step === STEP_SOURCE && (
              <PrimaryButton disabled={!canNextFromSource} onClick={gotoPreview}>
                Next &rarr;
              </PrimaryButton>
            )}
            {state.step === STEP_PREVIEW && (
              <PrimaryButton disabled={!canNextFromPreview} onClick={gotoConfirm}>
                Next &rarr;
              </PrimaryButton>
            )}
            {state.step === STEP_CONFIRM && !state.saved && (
              <PrimaryButton disabled={!canSave} onClick={doSave}>
                Save playlist
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaylistImportModal;

import React from 'react';
import * as profileStore from '../store/profileStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// ProfileManagementModal — full CRUD over the local profiles list.
//
// Three tabs:
//   1. Profiles  — list + 3-dot menu (Edit / Delete with type-DELETE confirm)
//   2. Add new   — form to create a profile (also drives the Edit flow)
//   3. Settings  — picker behaviour toggles + default profile radio
//
// Props
//   isOpen            — boolean
//   onClose()         — close the modal
//   onProfilesChange()— optional callback fired after any CRUD so the parent
//                       picker can re-read profileStore.listProfiles().
//
// Tizen 6.5 / Chrome 76 safe: no optional chaining, no nullish coalescing,
// no spread. All async work is synchronous localStorage I/O via profileStore.
// ─────────────────────────────────────────────────────────────────────────────

// 8 avatar choices — emoji-only because we don't have a file-upload pipeline
// on Tizen yet. Stored as plain unicode strings on the profile record.
var AVATAR_CHOICES = ['🌟', '🎬', '🎮', '📺', '👤', '🏠', '🎵', '🎨'];
// In the source above we use surrogate-pair escapes so the literal file is
// pure ASCII-safe under Chrome 76. The runtime values are: 🌟 🎬 🎮 📺 👤 🏠 🎵 🎨

// All 12 themes from index.css — kept in the same order as the appearance
// picker so users see a familiar layout.
var THEME_OPTIONS = [
  { id: 'night-blue',     label: 'Night Blue',     swatch: '#1f6feb' },
  { id: 'mom-calm',       label: 'Mom Calm',       swatch: '#e07b39' },
  { id: 'high-contrast',  label: 'High Contrast',  swatch: '#ffff00' },
  { id: 'slate-dark',     label: 'Slate Dark',     swatch: '#5b8dee' },
  { id: 'warm-amber',     label: 'Warm Amber',     swatch: '#f0a030' },
  { id: 'deep-purple',    label: 'Deep Purple',    swatch: '#9b59d0' },
  { id: 'sky-blue',       label: 'Sky Blue',       swatch: '#00d4ff' },
  { id: 'zone',           label: 'Zone',           swatch: '#e94560' },
  { id: 'flix',           label: 'Flix',           swatch: '#ff2230' },
  { id: 'mary',           label: 'Mary',           swatch: '#d946ef' },
  { id: 'luna',           label: 'Luna',           swatch: '#06b6d4' },
  { id: 'hula',           label: 'Hula',           swatch: '#10b981' }
];

var FONT_SCALE_STEPS = [0.75, 1.0, 1.25, 1.5, 1.75];

// Snap an arbitrary value to the nearest step. The slider's `step="0.25"`
// already does this on modern engines but Tizen 6.5 sometimes drifts.
function _snapFontScale(v) {
  var num = parseFloat(v);
  if (isNaN(num)) { return 1.0; }
  var best = FONT_SCALE_STEPS[0];
  var bestDist = Math.abs(num - best);
  for (var i = 1; i < FONT_SCALE_STEPS.length; i++) {
    var d = Math.abs(num - FONT_SCALE_STEPS[i]);
    if (d < bestDist) { best = FONT_SCALE_STEPS[i]; bestDist = d; }
  }
  return best;
}

// ── Empty form for Add new ──────────────────────────────────────────────────
function _emptyFormState() {
  return {
    id: null,
    display_name: 'New profile',
    nickname: '',
    avatar_emoji: AVATAR_CHOICES[4], // 👤 default
    active_theme: 'night-blue',
    font_scale: 1.0,
    reduced_motion: false,
    mom_mode: false,
    tier_override: 'auto'
  };
}

function _formFromProfile(p) {
  if (!p) { return _emptyFormState(); }
  return {
    id: p.id,
    display_name: p.display_name || '',
    nickname: p.nickname || '',
    avatar_emoji: p.avatar_emoji || AVATAR_CHOICES[4],
    active_theme: p.active_theme || 'night-blue',
    font_scale: typeof p.font_scale === 'number' ? p.font_scale : 1.0,
    reduced_motion: !!p.reduced_motion,
    mom_mode: !!p.mom_mode,
    tier_override: p.tier_override || 'auto'
  };
}

// ── Style helpers ───────────────────────────────────────────────────────────
function _tabButtonStyle(active) {
  return {
    padding: '0.6rem 1.1rem',
    background: active ? 'var(--surface-raised, #1c2128)' : 'transparent',
    border: '1px solid ' + (active ? 'var(--accent, #1f6feb)' : 'transparent'),
    borderBottom: active ? '2px solid var(--accent, #1f6feb)' : '1px solid transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    fontSize: 'calc(0.9rem * var(--font-scale, 1))',
    fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    outline: 'none',
    borderRadius: '8px 8px 0 0',
    transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease'
  };
}

function _inputStyle() {
  return {
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: 'var(--surface, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: 'calc(0.95rem * var(--font-scale, 1))',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  };
}

function _primaryButtonStyle() {
  return {
    padding: '0.55rem 1.3rem',
    background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
    border: '1px solid var(--accent, #1f6feb)',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 700,
    fontSize: 'calc(0.9rem * var(--font-scale, 1))',
    cursor: 'pointer',
    outline: 'none'
  };
}

function _secondaryButtonStyle() {
  return {
    padding: '0.55rem 1.3rem',
    background: 'transparent',
    border: '1px solid var(--border, #30363d)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: 'calc(0.9rem * var(--font-scale, 1))',
    cursor: 'pointer',
    outline: 'none'
  };
}

function _dangerButtonStyle() {
  return {
    padding: '0.55rem 1.3rem',
    background: '#f85149',
    border: '1px solid #f85149',
    borderRadius: '6px',
    color: '#fff',
    fontWeight: 700,
    fontSize: 'calc(0.9rem * var(--font-scale, 1))',
    cursor: 'pointer',
    outline: 'none'
  };
}

function _fieldLabelStyle() {
  return {
    display: 'block',
    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
    fontWeight: 700,
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: '0.4rem'
  };
}

function _hintStyle() {
  return {
    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
    color: 'var(--muted)',
    marginTop: '0.3rem',
    lineHeight: 1.4
  };
}

// ── Profile row (Profiles tab) ──────────────────────────────────────────────
function ProfileRow(props) {
  var profile = props.profile;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var menuOpenForId = props.menuOpenForId;
  var onMenuToggle = props.onMenuToggle;
  var menuOpen = menuOpenForId === profile.id;

  function handleKey(e, fn) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  }

  // The dot-menu is rendered inline (absolutely positioned) so we don't need a
  // separate portal. Closing on outside click is handled by the parent.
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.85rem 1rem',
        background: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '10px',
        marginBottom: '0.6rem',
        position: 'relative'
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '52px', height: '52px',
          borderRadius: '50%',
          background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.6rem',
          flexShrink: 0
        }}
      >
        {profile.avatar_emoji || '👤'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(1rem * var(--font-scale, 1))', fontWeight: 700, color: 'var(--text)' }}>
          {profile.display_name || 'Unnamed profile'}
          {profile.mom_mode && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: 'calc(0.65rem * var(--font-scale, 1))',
              color: '#e07b39',
              border: '1px solid #e07b39',
              borderRadius: '999px',
              padding: '0.05rem 0.5rem',
              fontWeight: 700,
              letterSpacing: '0.05em'
            }}>MOM MODE</span>
          )}
        </div>
        <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          {profile.nickname ? ('Calls them "' + profile.nickname + '"') : 'No nickname'}
          {' · '}
          {profile.active_theme || 'night-blue'}
        </div>
      </div>
      <button
        tabIndex={0}
        className="hermes-focusable"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={'Profile actions for ' + (profile.display_name || profile.id)}
        onClick={function(e) { e.stopPropagation(); onMenuToggle(profile.id); }}
        onKeyDown={function(e) { handleKey(e, function() { onMenuToggle(profile.id); }); }}
        style={{
          width: '36px', height: '36px',
          background: 'transparent',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '8px',
          color: 'var(--muted)',
          fontSize: '1.2rem',
          fontWeight: 700,
          cursor: 'pointer',
          lineHeight: '1',
          flexShrink: 0
        }}
      >
        {'⋮'}
      </button>
      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '60px',
            right: '12px',
            background: 'var(--surface, #161b22)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            minWidth: '160px',
            zIndex: 10,
            padding: '0.3rem',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <button
            tabIndex={0}
            role="menuitem"
            onClick={function() { onMenuToggle(null); onEdit(profile); }}
            onKeyDown={function(e) { handleKey(e, function() { onMenuToggle(null); onEdit(profile); }); }}
            style={{
              padding: '0.5rem 0.8rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              textAlign: 'left',
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              cursor: 'pointer',
              borderRadius: '4px',
              outline: 'none'
            }}
            onFocus={function(e) { e.currentTarget.style.background = 'var(--surface-raised, #1c2128)'; }}
            onBlur={function(e) { e.currentTarget.style.background = 'transparent'; }}
          >
            Edit
          </button>
          <button
            tabIndex={0}
            role="menuitem"
            onClick={function() { onMenuToggle(null); onDelete(profile); }}
            onKeyDown={function(e) { handleKey(e, function() { onMenuToggle(null); onDelete(profile); }); }}
            style={{
              padding: '0.5rem 0.8rem',
              background: 'transparent',
              border: 'none',
              color: '#f85149',
              textAlign: 'left',
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              cursor: 'pointer',
              borderRadius: '4px',
              outline: 'none'
            }}
            onFocus={function(e) { e.currentTarget.style.background = 'rgba(248,81,73,0.1)'; }}
            onBlur={function(e) { e.currentTarget.style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation ─────────────────────────────────────────────────────
function DeleteConfirm(props) {
  var profile = props.profile;
  var onCancel = props.onCancel;
  var onConfirm = props.onConfirm;
  var inputResult = React.useState('');
  var confirmText = inputResult[0];
  var setConfirmText = inputResult[1];

  var canConfirm = confirmText === 'DELETE';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5,8,14,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 20,
        borderRadius: 'inherit'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #161b22)',
          border: '1px solid #f85149',
          borderRadius: '14px',
          padding: '1.5rem',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 48px rgba(0,0,0,0.6)'
        }}
      >
        <h3 id="delete-confirm-title" style={{
          margin: 0,
          color: '#f85149',
          fontSize: 'calc(1.15rem * var(--font-scale, 1))',
          fontWeight: 700,
          marginBottom: '0.5rem'
        }}>
          Delete profile?
        </h3>
        <p style={{
          color: 'var(--text)',
          fontSize: 'calc(0.9rem * var(--font-scale, 1))',
          margin: 0,
          marginBottom: '1rem',
          lineHeight: 1.5
        }}>
          You're about to delete <strong>{profile.display_name || profile.id}</strong> — type{' '}
          <code style={{
            background: 'rgba(248,81,73,0.15)',
            padding: '0.1rem 0.4rem',
            borderRadius: '3px',
            fontWeight: 700,
            color: '#f85149'
          }}>DELETE</code>{' '}
          to confirm. This cannot be undone.
        </p>
        <input
          autoFocus
          tabIndex={0}
          type="text"
          value={confirmText}
          onChange={function(e) { setConfirmText(e.target.value); }}
          placeholder="Type DELETE"
          aria-label="Type DELETE to confirm"
          style={Object.assign({}, _inputStyle(), { marginBottom: '1rem' })}
          onKeyDown={function(e) {
            if (e.key === 'Enter' && canConfirm) { onConfirm(); }
            if (e.key === 'Escape') { onCancel(); }
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            tabIndex={0}
            className="hermes-focusable"
            onClick={onCancel}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCancel(); } }}
            style={_secondaryButtonStyle()}
          >
            Cancel
          </button>
          <button
            tabIndex={0}
            className="hermes-focusable"
            disabled={!canConfirm}
            onClick={onConfirm}
            onKeyDown={function(e) { if ((e.key === 'Enter' || e.key === ' ') && canConfirm) { e.preventDefault(); onConfirm(); } }}
            style={Object.assign({}, _dangerButtonStyle(), {
              opacity: canConfirm ? 1 : 0.4,
              cursor: canConfirm ? 'pointer' : 'not-allowed'
            })}
          >
            Delete profile
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile form (Add new / Edit) ───────────────────────────────────────────
function ProfileForm(props) {
  var form = props.form;
  var setForm = props.setForm;
  var onSave = props.onSave;
  var onCancel = props.onCancel;
  var isEdit = !!form.id;

  // Live-clamp font scale when mom_mode is checked. The store also enforces
  // this on persist, but doing it here gives the slider an immediate visual
  // cue that mom_mode is restrictive.
  var effectiveFontScale = (form.mom_mode && form.font_scale < 1.25) ? 1.25 : form.font_scale;

  function updateField(key, value) {
    var next = Object.assign({}, form);
    next[key] = value;
    // Toggling mom_mode on automatically lifts the font scale up to 1.25 so
    // the user sees the new value reflected in the slider straight away.
    if (key === 'mom_mode' && value === true && next.font_scale < 1.25) {
      next.font_scale = 1.25;
    }
    setForm(next);
  }

  function handleSliderChange(e) {
    var raw = e.target.value;
    var snapped = _snapFontScale(raw);
    if (form.mom_mode && snapped < 1.25) { snapped = 1.25; }
    updateField('font_scale', snapped);
  }

  function handleSubmit(e) {
    if (e && e.preventDefault) { e.preventDefault(); }
    onSave();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Display name */}
      <div>
        <label htmlFor="pm-display-name" style={_fieldLabelStyle()}>Display name</label>
        <input
          id="pm-display-name"
          tabIndex={0}
          className="hermes-focusable"
          type="text"
          value={form.display_name}
          onChange={function(e) { updateField('display_name', e.target.value); }}
          maxLength={40}
          style={_inputStyle()}
        />
      </div>

      {/* Nickname */}
      <div>
        <label htmlFor="pm-nickname" style={_fieldLabelStyle()}>Nickname (optional)</label>
        <input
          id="pm-nickname"
          tabIndex={0}
          className="hermes-focusable"
          type="text"
          value={form.nickname}
          onChange={function(e) { updateField('nickname', e.target.value); }}
          maxLength={40}
          placeholder="What should we call you?"
          style={_inputStyle()}
        />
        <div style={_hintStyle()}>Hermes will use this name when speaking to you. Leave blank to use the display name.</div>
      </div>

      {/* Avatar style */}
      <div>
        <label style={_fieldLabelStyle()}>Avatar</label>
        <div role="radiogroup" aria-label="Avatar choice" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {AVATAR_CHOICES.map(function(emoji, idx) {
            var selected = form.avatar_emoji === emoji;
            return (
              <button
                key={'av-' + idx}
                type="button"
                tabIndex={0}
                role="radio"
                aria-checked={selected}
                aria-label={'Avatar option ' + (idx + 1)}
                className="hermes-focusable"
                onClick={function() { updateField('avatar_emoji', emoji); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateField('avatar_emoji', emoji); }
                }}
                style={{
                  width: '54px', height: '54px',
                  background: selected ? 'var(--accent, #1f6feb)' : 'var(--surface, #161b22)',
                  border: '2px solid ' + (selected ? 'var(--accent, #1f6feb)' : 'var(--border, #30363d)'),
                  borderRadius: '10px',
                  fontSize: '1.6rem',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 160ms ease, background 160ms ease'
                }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active theme */}
      <div>
        <label htmlFor="pm-theme" style={_fieldLabelStyle()}>Active theme</label>
        <select
          id="pm-theme"
          tabIndex={0}
          className="hermes-focusable"
          value={form.active_theme}
          onChange={function(e) { updateField('active_theme', e.target.value); }}
          style={_inputStyle()}
        >
          {THEME_OPTIONS.map(function(t) {
            return <option key={t.id} value={t.id}>{t.label}</option>;
          })}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
          <span aria-hidden="true" style={{
            width: '20px', height: '20px',
            borderRadius: '50%',
            background: (function() {
              for (var i = 0; i < THEME_OPTIONS.length; i++) {
                if (THEME_OPTIONS[i].id === form.active_theme) { return THEME_OPTIONS[i].swatch; }
              }
              return '#1f6feb';
            })(),
            border: '1px solid var(--border, #30363d)'
          }} />
          <span style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)' }}>Accent color</span>
        </div>
      </div>

      {/* Font scale slider */}
      <div>
        <label htmlFor="pm-font-scale" style={_fieldLabelStyle()}>
          Font scale &mdash; <span style={{ color: 'var(--text)' }}>{effectiveFontScale.toFixed(2)}x</span>
        </label>
        <input
          id="pm-font-scale"
          tabIndex={0}
          className="hermes-focusable"
          type="range"
          min={form.mom_mode ? '1.25' : '0.75'}
          max="1.75"
          step="0.25"
          value={effectiveFontScale}
          onChange={handleSliderChange}
          style={{ width: '100%' }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'calc(0.7rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          marginTop: '0.2rem'
        }}>
          <span>0.75x</span>
          <span>1.0x</span>
          <span>1.25x</span>
          <span>1.5x</span>
          <span>1.75x</span>
        </div>
      </div>

      {/* Reduced motion */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
          <input
            tabIndex={0}
            type="checkbox"
            checked={form.reduced_motion}
            onChange={function(e) { updateField('reduced_motion', e.target.checked); }}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--text)', fontSize: 'calc(0.92rem * var(--font-scale, 1))', fontWeight: 600 }}>
            Reduced motion
          </span>
        </label>
        <div style={Object.assign({}, _hintStyle(), { marginLeft: '1.65rem' })}>
          Removes most transitions and shell-wide animation. Helpful for motion sensitivity.
        </div>
      </div>

      {/* Mom Mode */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
          <input
            tabIndex={0}
            type="checkbox"
            checked={form.mom_mode}
            onChange={function(e) { updateField('mom_mode', e.target.checked); }}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--text)', fontSize: 'calc(0.92rem * var(--font-scale, 1))', fontWeight: 600 }}>
            Mom Mode
          </span>
        </label>
        <div style={Object.assign({}, _hintStyle(), { marginLeft: '1.65rem' })}>
          Forces font scale to at least 1.25x and enables larger UI surfaces. Mom's TV is never system-limited.
        </div>
      </div>

      {/* Tier override */}
      <div>
        <label htmlFor="pm-tier" style={_fieldLabelStyle()}>Tier override</label>
        <select
          id="pm-tier"
          tabIndex={0}
          className="hermes-focusable"
          value={form.tier_override}
          onChange={function(e) { updateField('tier_override', e.target.value); }}
          style={_inputStyle()}
        >
          <option value="auto">Auto (follow TV model detection)</option>
          <option value="enhanced">Enhanced (QN-class palette)</option>
          <option value="degraded">Degraded (UN-class palette)</option>
        </select>
        <div style={_hintStyle()}>Auto is recommended &mdash; HermesTV detects your TV model and picks the right tier.</div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          tabIndex={0}
          className="hermes-focusable"
          onClick={onCancel}
          style={_secondaryButtonStyle()}
        >
          Cancel
        </button>
        <button
          type="submit"
          tabIndex={0}
          className="hermes-focusable"
          style={_primaryButtonStyle()}
        >
          {isEdit ? 'Save changes' : 'Create profile'}
        </button>
      </div>
    </form>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────
function ProfileManagementModal(props) {
  var isOpen = !!props.isOpen;
  var onClose = props.onClose;
  var onProfilesChange = props.onProfilesChange;
  var initialTab = props.initialTab || 'profiles';

  var tabResult = React.useState(initialTab);
  var activeTab = tabResult[0];
  var setActiveTab = tabResult[1];

  var profilesResult = React.useState(function() { return profileStore.listProfiles(); });
  var profiles = profilesResult[0];
  var setProfiles = profilesResult[1];

  var settingsResult = React.useState(function() { return profileStore.getSettings(); });
  var settings = settingsResult[0];
  var setSettings = settingsResult[1];

  var formResult = React.useState(_emptyFormState);
  var form = formResult[0];
  var setForm = formResult[1];

  var menuResult = React.useState(null);
  var menuOpenForId = menuResult[0];
  var setMenuOpenForId = menuResult[1];

  var deleteResult = React.useState(null);
  var deleteTarget = deleteResult[0];
  var setDeleteTarget = deleteResult[1];

  // Refresh local snapshot from store after any CRUD so the list re-renders.
  function refreshProfiles() {
    var next = profileStore.listProfiles();
    setProfiles(next);
    var nextSettings = profileStore.getSettings();
    setSettings(nextSettings);
    if (onProfilesChange) { onProfilesChange(next); }
  }

  // ── Esc handler ─────────────────────────────────────────────────────────
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKey(e) {
      if (e.key === 'Escape') {
        if (deleteTarget) { setDeleteTarget(null); return; }
        if (menuOpenForId) { setMenuOpenForId(null); return; }
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose, deleteTarget, menuOpenForId]);

  // Close any open row menu when clicking outside.
  React.useEffect(function() {
    if (!menuOpenForId) { return undefined; }
    function onDocClick() { setMenuOpenForId(null); }
    document.addEventListener('click', onDocClick);
    return function() { document.removeEventListener('click', onDocClick); };
  }, [menuOpenForId]);

  if (!isOpen) { return null; }

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleStartEdit(p) {
    setForm(_formFromProfile(p));
    setActiveTab('add'); // re-use the Add form for Edit
  }

  function handleStartDelete(p) {
    setDeleteTarget(p);
  }

  function handleConfirmDelete() {
    if (!deleteTarget) { return; }
    profileStore.deleteProfile(deleteTarget.id);
    setDeleteTarget(null);
    refreshProfiles();
  }

  function handleSave() {
    var name = (form.display_name || '').trim();
    if (!name) {
      // Block save with an empty name — give the field a red border but
      // don't fire a window.alert (Tizen kiosks don't always show them).
      var input = document.getElementById('pm-display-name');
      if (input) { input.style.borderColor = '#f85149'; input.focus(); }
      return;
    }
    var payload = {
      display_name: name,
      nickname: (form.nickname || '').trim(),
      avatar_emoji: form.avatar_emoji,
      active_theme: form.active_theme,
      font_scale: form.font_scale,
      reduced_motion: form.reduced_motion,
      mom_mode: form.mom_mode,
      tier_override: form.tier_override
    };
    if (form.id) {
      profileStore.updateProfile(form.id, payload);
    } else {
      profileStore.createProfile(payload);
    }
    setForm(_emptyFormState());
    setActiveTab('profiles');
    refreshProfiles();
  }

  function handleCancelForm() {
    setForm(_emptyFormState());
    setActiveTab('profiles');
  }

  function handleTabChange(id) {
    setActiveTab(id);
    if (id === 'add' && form.id) {
      // Switching to Add new tab while editing — reset to a fresh form.
      setForm(_emptyFormState());
    }
  }

  function handleSettingsToggle(key) {
    var next = Object.assign({}, settings);
    next[key] = !next[key];
    profileStore.setSettings(next);
    setSettings(next);
  }

  function handleDefaultProfileChange(id) {
    var next = Object.assign({}, settings, { default_profile_id: id });
    profileStore.setSettings(next);
    setSettings(next);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-mgmt-title"
      className="hermes-modal-overlay"
      onClick={function(e) { if (e.target === e.currentTarget) { onClose(); } }}
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(5,8,14,0.78)',
        // 1200 to sit above the OnboardingWizard (1100). The picker mounts
        // this modal from inside the wizard's profile step, so z=260 would
        // render the modal hidden behind the wizard overlay.
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '88vh',
          background: 'var(--surface, #15151d)',
          border: '1px solid var(--border, #2a2b3a)',
          borderRadius: '20px',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px 14px',
            borderBottom: '1px solid var(--border, #2a2b3a)',
            flexShrink: 0
          }}
        >
          <div>
            <h2 id="profile-mgmt-title" style={{
              margin: 0,
              fontSize: 'calc(1.2rem * var(--font-scale, 1))',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '0.01em'
            }}>
              Manage profiles
            </h2>
            <p style={{
              margin: 0,
              marginTop: '0.2rem',
              fontSize: 'calc(0.78rem * var(--font-scale, 1))',
              color: 'var(--muted)'
            }}>
              Add, edit, or remove profiles for this TV.
            </p>
          </div>
          <button
            tabIndex={0}
            className="hermes-focusable"
            aria-label="Close profile management"
            onClick={onClose}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(); } }}
            style={{
              width: '36px', height: '36px',
              background: 'transparent',
              border: '1px solid var(--border, #30363d)',
              borderRadius: '8px',
              color: 'var(--muted)',
              fontSize: '1.1rem',
              cursor: 'pointer',
              outline: 'none',
              lineHeight: '1'
            }}
          >
            {'✕'}
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Profile management tabs"
          style={{
            display: 'flex',
            gap: '0.3rem',
            padding: '0.5rem 1rem 0',
            borderBottom: '1px solid var(--border, #2a2b3a)',
            flexShrink: 0
          }}
        >
          {[
            { id: 'profiles', label: 'Profiles' },
            { id: 'add',      label: form.id ? 'Edit' : 'Add new' },
            { id: 'settings', label: 'Settings' }
          ].map(function(t) {
            var active = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                className="hermes-focusable"
                onClick={function() { handleTabChange(t.id); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTabChange(t.id); } }}
                style={_tabButtonStyle(active)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body — scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.2rem 1.4rem'
        }}>
          {activeTab === 'profiles' && (
            <div>
              {profiles.length === 0 && (
                <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem 0' }}>
                  No profiles yet. Switch to <strong>Add new</strong> to create one.
                </p>
              )}
              {profiles.map(function(p) {
                return (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    onEdit={handleStartEdit}
                    onDelete={handleStartDelete}
                    menuOpenForId={menuOpenForId}
                    onMenuToggle={setMenuOpenForId}
                  />
                );
              })}
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  tabIndex={0}
                  className="hermes-focusable"
                  onClick={function() { setForm(_emptyFormState()); setActiveTab('add'); }}
                  onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setForm(_emptyFormState()); setActiveTab('add'); } }}
                  style={_primaryButtonStyle()}
                >
                  + Add new profile
                </button>
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={handleCancelForm}
            />
          )}

          {activeTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                  <input
                    tabIndex={0}
                    type="checkbox"
                    checked={settings.allow_chat_switch}
                    onChange={function() { handleSettingsToggle('allow_chat_switch'); }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--text)', fontSize: 'calc(0.95rem * var(--font-scale, 1))', fontWeight: 600 }}>
                    Allow profile switching from chat
                  </span>
                </label>
                <div style={Object.assign({}, _hintStyle(), { marginLeft: '1.65rem' })}>
                  When on, Hermes will respond to commands like "switch to Mom mode" or "switch to Dave".
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                  <input
                    tabIndex={0}
                    type="checkbox"
                    checked={settings.always_show_picker}
                    onChange={function() { handleSettingsToggle('always_show_picker'); }}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--text)', fontSize: 'calc(0.95rem * var(--font-scale, 1))', fontWeight: 600 }}>
                    Show profile picker on every boot
                  </span>
                </label>
                <div style={Object.assign({}, _hintStyle(), { marginLeft: '1.65rem' })}>
                  Recommended when more than one person uses this TV. Off by default if there's only one profile.
                </div>
              </div>

              <div>
                <div style={_fieldLabelStyle()}>Default profile</div>
                <div role="radiogroup" aria-label="Default profile" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {profiles.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
                      No profiles available.
                    </span>
                  )}
                  {profiles.map(function(p) {
                    var checked = settings.default_profile_id === p.id;
                    return (
                      <label
                        key={'def-' + p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.55rem 0.7rem',
                          background: checked ? 'var(--surface-raised, #1c2128)' : 'transparent',
                          border: '1px solid ' + (checked ? 'var(--accent, #1f6feb)' : 'var(--border, #30363d)'),
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          tabIndex={0}
                          type="radio"
                          name="default-profile"
                          checked={checked}
                          onChange={function() { handleDefaultProfileChange(p.id); }}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '1.3rem' }} aria-hidden="true">{p.avatar_emoji || '👤'}</span>
                        <span style={{ color: 'var(--text)', fontSize: 'calc(0.92rem * var(--font-scale, 1))', fontWeight: 600 }}>
                          {p.display_name || p.id}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div style={_hintStyle()}>
                  Used when "Show profile picker on every boot" is off and no profile has been chosen yet.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete confirmation overlay */}
        {deleteTarget && (
          <DeleteConfirm
            profile={deleteTarget}
            onCancel={function() { setDeleteTarget(null); }}
            onConfirm={handleConfirmDelete}
          />
        )}
      </div>
    </div>
  );
}

export default ProfileManagementModal;

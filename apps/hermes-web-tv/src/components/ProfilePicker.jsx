import React from 'react';
import * as profileStore from '../store/profileStore.js';
import ProfileManagementModal from './ProfileManagementModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ProfilePicker — the "Who's watching?" splash screen.
//
// v0 (pre-management UI): hard-coded two tiles for Dave + Sherri.
// v1 (this PR): renders one tile per profile from profileStore.listProfiles(),
//     plus an "Add new profile" tile (dashed border, "+" icon) and a smaller
//     "Manage profiles" button at the bottom. Both routes open the
//     ProfileManagementModal.
//
// The visual signature of the original two tiles is preserved — the first
// profile uses the night-blue palette and the second uses the mom-calm
// palette so returning users see a familiar layout. Additional tiles cycle
// through a small palette set.
// ─────────────────────────────────────────────────────────────────────────────

// Hard-coded tile palettes keyed by theme so each profile tile feels
// distinctly "theirs" rather than uniform. Falls back to the first entry
// when a profile's theme isn't in the table.
var TILE_PALETTES = {
  'night-blue':    { bg: 'linear-gradient(180deg, #1c2128, #161b22)', border: '#30363d', focus: '#1f6feb', text: '#e6edf3', sub: '#8b949e', avatarBg: 'linear-gradient(135deg, #1f6feb, #6366f1)', avatarShadow: '0 6px 18px rgba(31,111,235,0.35)' },
  'mom-calm':      { bg: 'linear-gradient(180deg, #352820, #2a201a)', border: '#4a3828', focus: '#e07b39', text: '#f5ede6', sub: '#c4a882', avatarBg: 'linear-gradient(135deg, #e07b39, #f0a030)', avatarShadow: '0 6px 18px rgba(224,123,57,0.4)' },
  'high-contrast': { bg: 'linear-gradient(180deg, #1a1a1a, #111111)', border: '#666666', focus: '#ffff00', text: '#ffffff', sub: '#cccccc', avatarBg: 'linear-gradient(135deg, #ffff00, #ffaa00)', avatarShadow: '0 6px 18px rgba(255,255,0,0.35)' },
  'slate-dark':    { bg: 'linear-gradient(180deg, #212d42, #1a2233)', border: '#2a3f60', focus: '#5b8dee', text: '#dce6f7', sub: '#7a93bc', avatarBg: 'linear-gradient(135deg, #5b8dee, #7aa3f5)', avatarShadow: '0 6px 18px rgba(91,141,238,0.4)' },
  'warm-amber':    { bg: 'linear-gradient(180deg, #2e2014, #241a10)', border: '#3e2c14', focus: '#f0a030', text: '#f5e8d0', sub: '#b89060', avatarBg: 'linear-gradient(135deg, #f0a030, #f5b850)', avatarShadow: '0 6px 18px rgba(240,160,48,0.4)' },
  'deep-purple':   { bg: 'linear-gradient(180deg, #1e1438, #160f2a)', border: '#2e1a50', focus: '#9b59d0', text: '#e8daf8', sub: '#8868b0', avatarBg: 'linear-gradient(135deg, #9b59d0, #b070e8)', avatarShadow: '0 6px 18px rgba(155,89,208,0.4)' },
  'sky-blue':      { bg: 'linear-gradient(180deg, #1a334d, #112240)', border: '#1c3a5e', focus: '#00d4ff', text: '#e0f2fe', sub: '#7dd3fc', avatarBg: 'linear-gradient(135deg, #00d4ff, #33e0ff)', avatarShadow: '0 6px 18px rgba(0,212,255,0.4)' },
  'zone':          { bg: 'linear-gradient(180deg, #0f3460, #16213e)', border: '#2a2a4e', focus: '#e94560', text: '#eaeaea', sub: '#b8b8b8', avatarBg: 'linear-gradient(135deg, #e94560, #f07080)', avatarShadow: '0 6px 18px rgba(233,69,96,0.4)' },
  'flix':          { bg: 'linear-gradient(180deg, #252d47, #1a1f3a)', border: '#2a2f4a', focus: '#ff2230', text: '#ffffff', sub: '#b0b0b0', avatarBg: 'linear-gradient(135deg, #ff2230, #ff4d58)', avatarShadow: '0 6px 18px rgba(255,34,48,0.4)' },
  'mary':          { bg: 'linear-gradient(180deg, #3d0f5c, #2b0845)', border: '#3a1456', focus: '#d946ef', text: '#f3e8ff', sub: '#d8b4fe', avatarBg: 'linear-gradient(135deg, #d946ef, #e879f9)', avatarShadow: '0 6px 18px rgba(217,70,239,0.4)' },
  'luna':          { bg: 'linear-gradient(180deg, #254158, #1a2d42)', border: '#1f3a52', focus: '#06b6d4', text: '#cffafe', sub: '#7ee8f6', avatarBg: 'linear-gradient(135deg, #06b6d4, #2dd4de)', avatarShadow: '0 6px 18px rgba(6,182,212,0.4)' },
  'hula':          { bg: 'linear-gradient(180deg, #16543d, #0d3d28)', border: '#1b4b35', focus: '#10b981', text: '#d1fae5', sub: '#6ee7b7', avatarBg: 'linear-gradient(135deg, #10b981, #34d399)', avatarShadow: '0 6px 18px rgba(16,185,129,0.4)' }
};

function _paletteFor(themeId) {
  if (themeId && TILE_PALETTES[themeId]) { return TILE_PALETTES[themeId]; }
  return TILE_PALETTES['night-blue'];
}

function _humanThemeLabel(themeId) {
  // Convert "night-blue" → "Night Blue"
  if (!themeId) { return ''; }
  var parts = String(themeId).split('-');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) { continue; }
    out.push(p.charAt(0).toUpperCase() + p.substring(1));
  }
  return out.join(' ');
}

function ProfileTile(props) {
  var profile = props.profile;
  var onSelect = props.onSelect;
  var palette = _paletteFor(profile.active_theme);

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(profile.id); }
  }

  return (
    <button
      tabIndex={0}
      className="hermes-focusable"
      onClick={function() { onSelect(profile.id); }}
      onKeyDown={handleKeyDown}
      aria-label={'Select profile ' + (profile.display_name || profile.id)}
      style={{
        width: '260px',
        height: '260px',
        background: palette.bg,
        border: '2px solid ' + palette.border,
        borderRadius: '20px',
        color: palette.text,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, box-shadow 160ms ease',
        outline: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.4)',
        willChange: 'transform'
      }}
      onMouseEnter={function(e) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = palette.focus; }}
      onMouseLeave={function(e) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = palette.border; }}
      onFocus={function(e) {
        e.currentTarget.style.borderColor = palette.focus;
        e.currentTarget.style.outline = '3px solid ' + palette.focus;
        e.currentTarget.style.outlineOffset = '3px';
        e.currentTarget.style.transform = 'translateY(-4px)';
      }}
      onBlur={function(e) {
        e.currentTarget.style.borderColor = palette.border;
        e.currentTarget.style.outline = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        style={{
          width: '88px',
          height: '88px',
          borderRadius: '50%',
          background: palette.avatarBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.6rem',
          color: '#ffffff',
          fontWeight: '800',
          boxShadow: palette.avatarShadow
        }}
      >
        {profile.avatar_emoji || (profile.display_name || 'U').charAt(0).toUpperCase()}
      </div>
      <span style={{ fontSize: '1.5rem', fontWeight: '700', color: palette.text }}>
        {profile.display_name || profile.id}
      </span>
      <span style={{ fontSize: '0.825rem', color: palette.sub, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        {_humanThemeLabel(profile.active_theme)}
      </span>
    </button>
  );
}

function AddProfileTile(props) {
  var onClick = props.onClick;

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  }

  return (
    <button
      tabIndex={0}
      className="hermes-focusable"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label="Add new profile"
      style={{
        width: '260px',
        height: '260px',
        background: 'transparent',
        border: '2px dashed #4a5060',
        borderRadius: '20px',
        color: '#8b949e',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.8rem',
        transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, color 160ms ease',
        outline: 'none',
        willChange: 'transform'
      }}
      onMouseEnter={function(e) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#1f6feb'; e.currentTarget.style.color = '#e6edf3'; }}
      onMouseLeave={function(e) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#4a5060'; e.currentTarget.style.color = '#8b949e'; }}
      onFocus={function(e) {
        e.currentTarget.style.borderColor = '#1f6feb';
        e.currentTarget.style.outline = '3px solid #1f6feb';
        e.currentTarget.style.outlineOffset = '3px';
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.color = '#e6edf3';
      }}
      onBlur={function(e) {
        e.currentTarget.style.borderColor = '#4a5060';
        e.currentTarget.style.outline = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.color = '#8b949e';
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '88px',
          height: '88px',
          borderRadius: '50%',
          background: 'rgba(31,111,235,0.08)',
          border: '2px dashed #4a5060',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem',
          fontWeight: '300',
          color: 'inherit'
        }}
      >
        +
      </div>
      <span style={{ fontSize: '1.25rem', fontWeight: '600' }}>Add new profile</span>
      <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        Customise &amp; theme
      </span>
    </button>
  );
}

function ProfilePicker(props) {
  var onSelect = props.onSelect;
  // When `embedded` is true the picker drops its full-screen chrome
  // (radial-gradient background + min-height:100vh) so it can sit inside
  // a parent container — e.g. the OnboardingWizard's step body. The tile
  // visuals stay identical.
  var embedded = props.embedded === true;

  // Snapshot of the stored profiles. Re-read whenever the management modal
  // closes (it may have added / removed / renamed records).
  var profilesResult = React.useState(function() { return profileStore.listProfiles(); });
  var profiles = profilesResult[0];
  var setProfiles = profilesResult[1];

  var modalResult = React.useState(false);
  var showModal = modalResult[0];
  var setShowModal = modalResult[1];

  // Initial tab to open the modal on — "add" when the user clicked the
  // dashed tile, "profiles" when they clicked the bottom button.
  var initialTabResult = React.useState('profiles');
  var initialTab = initialTabResult[0];
  var setInitialTab = initialTabResult[1];

  function handleSelect(profileId) {
    profileStore.setActiveProfileId(profileId);
    if (onSelect) { onSelect(profileId); }
  }

  function handleOpenManage() {
    setInitialTab('profiles');
    setShowModal(true);
  }

  function handleOpenAdd() {
    setInitialTab('add');
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    // Re-read in case the modal mutated the list.
    setProfiles(profileStore.listProfiles());
  }

  function handleProfilesChanged(next) {
    setProfiles(next);
  }

  var rootStyle = embedded ? {
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2rem',
    padding: '0',
    width: '100%',
  } : {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, #1a2030 0%, #0d1117 60%, #08090d 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3rem',
  };

  return (
    <div
      className={embedded ? '' : 'hermes-modal-overlay'}
      style={rootStyle}
    >
      <h1
        className="hermes-modal-panel"
        style={{
          color: '#e6edf3',
          fontSize: '2.75rem',
          fontWeight: '700',
          margin: 0,
          letterSpacing: '0.01em',
          textAlign: 'center'
        }}
      >
        Who&apos;s watching?
      </h1>

      <div
        className="hermes-modal-panel"
        style={{
          display: 'flex',
          gap: '2.5rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '1100px'
        }}
      >
        {profiles.map(function(p) {
          return (
            <ProfileTile
              key={p.id}
              profile={p}
              onSelect={handleSelect}
            />
          );
        })}

        <AddProfileTile onClick={handleOpenAdd} />
      </div>

      <p
        style={{
          color: '#8b949e',
          fontSize: '0.875rem',
          margin: 0,
          textAlign: 'center'
        }}
      >
        Your choice is saved on this TV. Press Enter or OK to select.
      </p>

      {/* Manage profiles button — smaller / less prominent than tiles. */}
      <button
        tabIndex={0}
        className="hermes-focusable"
        onClick={handleOpenManage}
        onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenManage(); } }}
        aria-label="Manage profiles"
        style={{
          padding: '0.55rem 1.4rem',
          background: 'transparent',
          border: '1px solid #30363d',
          borderRadius: '999px',
          color: '#8b949e',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 160ms ease, color 160ms ease, background 160ms ease',
          letterSpacing: '0.02em'
        }}
        onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#1f6feb'; e.currentTarget.style.color = '#e6edf3'; }}
        onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
        onFocus={function(e) { e.currentTarget.style.outline = '2px solid #1f6feb'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.color = '#e6edf3'; }}
        onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.color = '#8b949e'; }}
      >
        Manage profiles
      </button>

      {/* CRUD modal */}
      <ProfileManagementModal
        isOpen={showModal}
        initialTab={initialTab}
        onClose={handleCloseModal}
        onProfilesChange={handleProfilesChanged}
      />
    </div>
  );
}

export default ProfilePicker;

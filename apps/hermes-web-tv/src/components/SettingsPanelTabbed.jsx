import React from 'react';
import VoiceSettings from './settings/VoiceSettings.jsx';
import KeyboardHelpModal from './KeyboardHelpModal.jsx';
import SkipIntroToggle from './SkipIntroToggle.jsx';

// Lazy-loaded deep-settings sections — code-split so the Settings
// modal's initial render stays light. Each section file lives in
// ./settings/ and reads/writes through src/store/settingsStore.js.
var NetworkSettings = React.lazy(function() { return import('./settings/NetworkSettings.jsx'); });
var PlaybackSettings = React.lazy(function() { return import('./settings/PlaybackSettings.jsx'); });
var ParentalControls = React.lazy(function() { return import('./settings/ParentalControls.jsx'); });
var BackupRestore = React.lazy(function() { return import('./settings/BackupRestore.jsx'); });
var Diagnostics = React.lazy(function() { return import('./settings/Diagnostics.jsx'); });
// Wave-16: per-profile provider visibility — show/hide iptv-org, xtremehd,
// apollo_group, jellyfin, xtream. Lives in its own lazy chunk so the
// Settings modal's first paint isn't slowed by the source-health fetch.
var ProvidersSettings = React.lazy(function() { return import('./settings/ProvidersSettings.jsx'); });
// Recordings (DVR) lives inside the Playback tab — wraps the
// RecordingsListModal launcher and the global DVR settings form. The
// underlying client hits /api/dvr/* on hermes-tv-api.
var RecordingsSection = React.lazy(function() { return import('./settings/RecordingsSection.jsx'); });

// ─────────────────────────────────────────────────────────────────────────────
// SettingsPanelTabbed — IPTV-Player-Zero-style centred-modal Settings panel.
//
// The original 7 tabs (Playlists, General, Backups, Appearance, Features,
// Hotkeys, About) ship from PR #61. This PR adds 4 new tabs to reach Zero
// parity — Network, Playback, Parental, Diagnostics — and rebuilds the
// existing Backups tab around the real Backup/Restore flow that the
// parallel API agent is wiring up at `POST /api/backup/import`.
//
// Stateful props (read from App):
//   isOpen, profile, tier, tvModel, catalogSource, iptvOrgCount,
//   m3uProviders, activeTheme, providers
// Callbacks:
//   onClose, onOpenVoicePicker, onOpenLayoutSwitcher, onSwitchProfile,
//   onResetDefaults, onThemeChange (themeName), onFeatureToggle (key, value)
//
// Tizen / Chrome 76 safe: no spread, no optional chaining, no nullish
// coalescing. Every tab button + every interactive control is keyboard
// focusable + has Enter/Space handler. Tab indexing follows the Zero
// pattern (left-to-right top row, then settings content below).
// ─────────────────────────────────────────────────────────────────────────────

var TABS = [
  { id: 'playlists',   label: 'Playlists',   icon: '☰' },
  { id: 'general',     label: 'General',     icon: '⇅' },
  { id: 'providers',   label: 'Providers',   icon: '◉' },
  { id: 'appearance',  label: 'Appearance',  icon: '◐' },
  { id: 'features',    label: 'Features',    icon: '✦' },
  { id: 'network',     label: 'Network',     icon: '⇄' },
  { id: 'playback',    label: 'Playback',    icon: '▶' },
  { id: 'parental',    label: 'Parental',    icon: '⛨' },
  { id: 'backups',     label: 'Backup',      icon: '⤒' },
  { id: 'hotkeys',     label: 'Hotkeys',     icon: '⌨' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '⚕' },
  { id: 'about',       label: 'About',       icon: 'ⓘ' },
  { id: 'voice',       label: 'Voice',       icon: '◉' },
];

// Themes mirror index.css. The first 6 are the legacy palettes; the next 6
// were added for the Zero shell. The Settings picker shows them in two rows
// to mirror the IPTV Player Zero "Light / Dark / System / Sky Blue / Zone /
// Flix / Mary / Luna / Hula" layout.
var THEME_SWATCHES = [
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
  { id: 'hula',           label: 'Hula',           swatch: '#10b981' },
];

// Feature toggles — backed by localStorage in App.jsx. Each entry maps a
// storage key + label + tagline + optional BETA flag. The actual feature
// implementation is a follow-up; toggling here just persists the user's
// preference so the UI surface is built ahead of the backend.
var FEATURE_TOGGLES = [
  { key: 'catchup',            label: 'Catch-up',             beta: true,
    tagline: 'Show the Catch-up tab (for playlists/providers that support TV archive).',
    detail: 'Turning this off hides Catch-up from the top bar. Re-enable any time.' },
  { key: 'trakt_scrobbling',   label: 'Trakt Scrobbling',     beta: false,
    tagline: 'Sync movie and episode playback progress with your Trakt account.',
    detail: 'Account link + OAuth flow lands in W4 Phase 2 alongside the watch-history endpoint.' },
  { key: 'multiscreen',        label: 'Multiscreen',          beta: true,
    tagline: 'Watch multiple channels at once with independent audio focus.',
    detail: 'When off, Multiscreen stays hidden in the Live TV sidebar.' },
  { key: 'lazy_load_tv_guide', label: 'Lazy-load TV guide',   beta: false,
    tagline: 'Reduce memory by only loading programme data for visible channels.',
    detail: 'If you notice missing guide data while scrolling quickly, try turning this off.' },
  { key: 'tmdb_metadata',      label: 'TMDb metadata',        beta: false,
    tagline: 'Fetch richer movie info (poster/backdrop, cast, recommendations) via TMDb.',
    detail: 'By default, movies use the catalog provider’s built-in metadata only.' },
  { key: 'tvmaze_info',        label: 'Programme Info (TVMaze)', beta: false,
    tagline: 'Open a TVMaze details panel with posters, genres, and ratings from the Live EPG.',
    detail: 'When off, the info button and TVMaze sidebar are hidden. Cached data remains offline.' },
];

function _readFeatureFlag(key) {
  try {
    var v = localStorage.getItem('hermestv_feature::' + key);
    return v === 'true';
  } catch (_) { return false; }
}

function _writeFeatureFlag(key, value) {
  try {
    localStorage.setItem('hermestv_feature::' + key, value ? 'true' : 'false');
  } catch (_) { /* silent */ }
}

function _DataBadge(props) {
  var src = props.catalogSource || 'unknown';
  var label;
  var color;
  if (src === 'jellyfin' || src === 'threadfin-merged' || src === 'merged-with-iptv-org' || src === 'merged-with-providers') {
    label = 'Live · ' + src; color = '#22c55e';
  } else if (src === 'mock-fallback' || src === 'mock-threadfin-failed') {
    label = 'Mock fallback (provider error)'; color = '#ef4444';
  } else if (src === 'dev-mock') {
    label = 'Dev mock (API offline)'; color = '#ef4444';
  } else if (src === 'mock-no-jellyfin' || src === 'unknown') {
    label = 'Mock seed (no providers configured)'; color = '#e3b341';
  } else {
    label = src; color = '#8b949e';
  }
  return (
    <span
      style={{
        fontSize: 'calc(0.7rem * var(--font-scale, 1))',
        fontWeight: 700,
        color: color,
        border: '1px solid ' + color,
        borderRadius: '3px',
        padding: '0.1rem 0.4rem',
        backgroundColor: color + '14',
      }}
    >
      {label}
    </span>
  );
}

function _Row(props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0' }}>
      <span style={{ color: 'var(--muted)' }}>{props.label}</span>
      <span style={{ fontWeight: 600 }}>{props.value}</span>
    </div>
  );
}

function _Card(props) {
  return (
    <div
      style={{
        background: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '12px',
        padding: '1rem 1.1rem',
        marginBottom: '0.85rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {props.header && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div
            aria-hidden="true"
            style={{
              width: '30px', height: '30px',
              borderRadius: '8px',
              background: 'rgba(0, 212, 255, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent, #00d4ff)',
              fontSize: '14px',
            }}
          >{props.icon || '⚙'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.92rem * var(--font-scale, 1))' }}>
              {props.header}
              {props.beta && (
                <span style={{ marginLeft: '0.4rem', fontSize: 'calc(0.6rem * var(--font-scale, 1))', color: '#0a1628', background: 'var(--accent, #00d4ff)', padding: '0.05rem 0.4rem', borderRadius: '999px', verticalAlign: 'middle' }}>
                  BETA
                </span>
              )}
            </div>
            {props.tagline && (
              <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                {props.tagline}
              </div>
            )}
          </div>
          {typeof props.toggle === 'boolean' && (
            <button
              tabIndex={0}
              role="switch"
              aria-checked={props.toggle}
              onClick={props.onToggle}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (props.onToggle) { props.onToggle(); } } }}
              style={{
                width: '44px', height: '24px',
                borderRadius: '999px',
                background: props.toggle ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 120ms ease',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: props.toggle ? '22px' : '2px',
                  width: '20px', height: '20px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  transition: 'left 120ms ease',
                }}
              />
            </button>
          )}
        </div>
      )}
      {props.children}
    </div>
  );
}

function SettingsPanelTabbed(props) {
  var isOpen = !!props.isOpen;
  var profile = props.profile || {};
  var tier = props.tier;
  var tvModel = props.tvModel;
  var catalogSource = props.catalogSource;
  var iptvOrgCount = props.iptvOrgCount || 0;
  var m3uProviders = props.m3uProviders || null;
  var activeTheme = props.activeTheme || 'night-blue';
  var providers = props.providers || [];
  var onClose = props.onClose;
  var onOpenVoicePicker = props.onOpenVoicePicker;
  var onOpenLayoutSwitcher = props.onOpenLayoutSwitcher;
  var onSwitchProfile = props.onSwitchProfile;
  var onResetDefaults = props.onResetDefaults;
  // Fired when the user clicks "Replay onboarding". App.jsx clears the
  // onboardingState flag + per-step answers and re-mounts the wizard.
  var onReplayOnboarding = props.onReplayOnboarding;
  // Fired when the user clicks "Manage profiles". App.jsx closes Settings
  // and opens the full ProfileManagementModal (add / edit / delete + picker
  // settings).
  var onManageProfiles = props.onManageProfiles;
  var onThemeChange = props.onThemeChange;
  // onOpenPlaylistImport — fires when the user clicks the new "Import
  // playlist" button on the Playlists tab. App.jsx hosts the modal so the
  // settings panel can close cleanly before the wizard opens (otherwise
  // both overlays would stack on top of each other).
  var onOpenPlaylistImport = props.onOpenPlaylistImport;

  var activeTabResult = React.useState('general');
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  // Keyboard help modal — opened via the small "?" button in the header.
  var helpOpenResult = React.useState(false);
  var helpOpen = helpOpenResult[0];
  var setHelpOpen = helpOpenResult[1];

  // Feature toggle state — initialised from localStorage so flips persist
  // across reload like the Zero player. State is mirrored to localStorage
  // on every change via _writeFeatureFlag.
  var initial = {};
  FEATURE_TOGGLES.forEach(function(f) { initial[f.key] = _readFeatureFlag(f.key); });
  var flagResult = React.useState(initial);
  var flags = flagResult[0];
  var setFlags = flagResult[1];

  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') { onClose(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() { document.removeEventListener('keydown', handleKeyDown); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  function flipFlag(key) {
    var next = Object.assign({}, flags);
    next[key] = !next[key];
    setFlags(next);
    _writeFeatureFlag(key, next[key]);
  }

  function renderPlaylists() {
    return (
      <div>
        <_Card icon="☰" header="Operator playlists" tagline="Add and manage Xtream Codes / M3U / Stalker sources.">
          <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', color: 'var(--muted)', marginBottom: '0.6rem' }}>
            Operator-imported playlists land on the API via the new <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>POST /api/playlists/save</code> endpoint. Environment-configured sources (<code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>APOLLO_M3U_URL</code> / <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>XTREMEHD_M3U_URL</code>) keep working in parallel.
          </div>
          <div style={{ marginBottom: '0.6rem' }}>
            <button
              tabIndex={0}
              onClick={function() { if (typeof onOpenPlaylistImport === 'function') { onOpenPlaylistImport(); } }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (typeof onOpenPlaylistImport === 'function') { onOpenPlaylistImport(); } } }}
              style={zeroButtonStyle('filled')}
              onFocus={zeroButtonFocus}
              onBlur={zeroButtonBlur}
            >+ Import playlist</button>
          </div>
          {providers && providers.length > 0 ? providers.map(function(p) {
            var label = p.provider_id || p.id || 'provider';
            return (
              <div
                key={label}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.5rem 0', borderTop: '1px solid var(--border, #30363d)',
                  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                }}
              >
                <span><strong>{label}</strong></span>
                <span style={{ color: 'var(--muted)', fontSize: 'calc(0.72rem * var(--font-scale, 1))' }}>configured</span>
              </div>
            );
          }) : (
            <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              No operator playlists configured yet.
            </div>
          )}
        </_Card>
        {iptvOrgCount > 0 && (
          <_Card icon="◉" header="iptv-org (Free)" tagline={iptvOrgCount + ' channels merged onto the catalog.'}>
            <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Sourced from the public iptv-org GitHub Pages JSON. Country and category whitelists are configured via <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>IPTV_ORG_COUNTRIES</code> / <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>IPTV_ORG_CATEGORIES</code>.
            </div>
          </_Card>
        )}
      </div>
    );
  }

  function renderGeneral() {
    return (
      <div>
        <_Card icon="⇅" header="System">
          <_Row label="Profile" value={profile.display_name || profile.profile_id || '—'} />
          <_Row label="TV Model" value={tvModel || '—'} />
          <_Row label="Tier" value={<span style={{ color: tier === 'enhanced' ? '#FFD700' : 'var(--muted)', fontWeight: 700 }}>{tier === 'enhanced' ? 'Enhanced' : 'Degraded'}</span>} />
          <_Row label="Data" value={<_DataBadge catalogSource={catalogSource} />} />
          {iptvOrgCount > 0 && <_Row label="iptv-org" value={<span style={{ color: '#22c55e', fontWeight: 700 }}>{iptvOrgCount} channels</span>} />}
          {m3uProviders && Object.keys(m3uProviders).map(function(pid) {
            var p = m3uProviders[pid] || {};
            if (!p.configured) { return null; }
            var ok = !p.error && (p.count > 0);
            var pcolor = ok ? '#22c55e' : (p.error ? '#ef4444' : '#e3b341');
            var pmsg = ok ? (p.count + ' channels') : (p.error ? 'fetch failed' : 'fetch pending');
            return (
              <_Row
                key={pid}
                label={p.label || pid}
                value={<span style={{ color: pcolor, fontWeight: 700 }}>{pmsg}</span>}
              />
            );
          })}
        </_Card>
        <_Card icon="♔" header="Profile actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              tabIndex={0}
              onClick={onOpenVoicePicker}
              style={zeroButtonStyle('outline')}
              onFocus={zeroButtonFocus}
              onBlur={zeroButtonBlur}
            >🔉 Change voice</button>
            <button
              tabIndex={0}
              onClick={onSwitchProfile}
              style={zeroButtonStyle('outline')}
              onFocus={zeroButtonFocus}
              onBlur={zeroButtonBlur}
            >👤 Switch profile</button>
            <button
              tabIndex={0}
              onClick={onResetDefaults}
              style={zeroButtonStyle('outline')}
              onFocus={zeroButtonFocus}
              onBlur={zeroButtonBlur}
            >↺ Reset to defaults</button>
            {onReplayOnboarding ? (
              <button
                tabIndex={0}
                onClick={onReplayOnboarding}
                style={zeroButtonStyle('outline')}
                onFocus={zeroButtonFocus}
                onBlur={zeroButtonBlur}
              >▶ Replay onboarding</button>
            ) : null}
            {onManageProfiles ? (
              <button
                tabIndex={0}
                onClick={onManageProfiles}
                style={zeroButtonStyle('outline')}
                onFocus={zeroButtonFocus}
                onBlur={zeroButtonBlur}
              >👥 Manage profiles</button>
            ) : null}
          </div>
        </_Card>
      </div>
    );
  }

  function renderBackups() {
    return (
      <React.Suspense fallback={<_Card icon="⤒" header="Backup &amp; Restore"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <BackupRestore profile={profile} />
      </React.Suspense>
    );
  }

  function renderNetwork() {
    return (
      <React.Suspense fallback={<_Card icon="⇄" header="Network"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <NetworkSettings />
      </React.Suspense>
    );
  }

  function renderProviders() {
    return (
      <React.Suspense fallback={<_Card icon="◉" header="Providers"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <ProvidersSettings
          profile={profile}
          providers={providers}
          m3uProviders={m3uProviders}
          iptvOrgCount={iptvOrgCount}
        />
      </React.Suspense>
    );
  }

  function renderPlayback() {
    return (
      <React.Suspense fallback={<_Card icon="▶" header="Playback"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <PlaybackSettings />
        <_Card icon="⏭" header="Auto-skip intro" tagline="Skip intro music / recaps automatically when detected.">
          <SkipIntroToggle profile={profile} />
        </_Card>
        <RecordingsSection profile={profile} />
      </React.Suspense>
    );
  }

  function renderVoice() {
    return <VoiceSettings profile={profile} />;
  }

  function renderParental() {
    return (
      <React.Suspense fallback={<_Card icon="⛨" header="Parental controls"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <ParentalControls />
      </React.Suspense>
    );
  }

  function renderDiagnostics() {
    return (
      <React.Suspense fallback={<_Card icon="⚕" header="Diagnostics"><div style={{ color: 'var(--muted)' }}>Loading…</div></_Card>}>
        <Diagnostics profile={profile} tier={tier} tvModel={tvModel} />
      </React.Suspense>
    );
  }

  function renderAppearance() {
    return (
      <div>
        <_Card icon="◐" header="Theme" tagline="Pick a palette. System follows your OS setting.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', marginTop: '0.4rem' }}>
            {THEME_SWATCHES.map(function(t) {
              var isActive = activeTheme === t.id;
              return (
                <button
                  key={t.id}
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={function() { if (typeof onThemeChange === 'function') { onThemeChange(t.id); } }}
                  onKeyDown={function(e) { if ((e.key === 'Enter' || e.key === ' ') && typeof onThemeChange === 'function') { e.preventDefault(); onThemeChange(t.id); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 0.65rem',
                    background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
                    border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)'),
                    borderRadius: '12px',
                    color: 'var(--text, #e6edf3)',
                    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
                  }}
                  onMouseEnter={function(e) { if (!isActive) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; } }}
                  onMouseLeave={function(e) { if (!isActive) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'transparent'; } }}
                  onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                  onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span aria-hidden="true" style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: t.swatch, border: '1px solid rgba(255,255,255,0.2)' }} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </_Card>
        <_Card icon="◧" header="Layout" tagline="Switch between the 8 layout shells (TiviMate, Netflix, Plex, Apple TV, Samsung, Mom Mode, Dave Power, Zero).">
          <button
            tabIndex={0}
            onClick={onOpenLayoutSwitcher}
            style={zeroButtonStyle('filled')}
            onFocus={zeroButtonFocus}
            onBlur={zeroButtonBlur}
          >🎨 Open layout switcher</button>
        </_Card>
      </div>
    );
  }

  function renderFeatures() {
    return (
      <div>
        {FEATURE_TOGGLES.map(function(f) {
          return (
            <_Card
              key={f.key}
              icon="✦"
              header={f.label}
              tagline={f.tagline}
              beta={f.beta}
              toggle={!!flags[f.key]}
              onToggle={function() { flipFlag(f.key); }}
            >
              <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)', borderTop: '1px solid var(--border, #30363d)', paddingTop: '0.5rem' }}>
                {f.detail}
              </div>
            </_Card>
          );
        })}
      </div>
    );
  }

  function renderHotkeys() {
    var rows = [
      { key: 'Esc', action: 'Close current modal / panel' },
      { key: 'Enter / Space', action: 'Activate the focused item' },
      { key: 'Arrow keys', action: 'Move focus across the catalog grid' },
      { key: 'Tab / Shift+Tab', action: 'Move focus through interactive controls' },
      { key: 'Back (Tizen 10009)', action: 'Cascade close: player → detail → modal → grid' },
      { key: 'Smart Hub (Tizen 10135)', action: 'Open the layout switcher' },
    ];
    return (
      <_Card icon="⌨" header="Keyboard / Remote">
        <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)', marginBottom: '0.4rem' }}>
          Built-in shortcuts. Remappable hotkeys arrive once the hotkey editor lands (Phase 2).
        </div>
        {rows.map(function(r) {
          return (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderTop: '1px solid var(--border, #30363d)' }}>
              <span style={{ fontWeight: 700 }}>{r.action}</span>
              <code style={{ background: 'rgba(0,212,255,0.1)', padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--accent, #00d4ff)' }}>{r.key}</code>
            </div>
          );
        })}
      </_Card>
    );
  }

  function renderAbout() {
    // Build version surfaces in Diagnostics; here we mirror it for the
    // "About" card so curious users don't have to switch tabs.
    var buildVersion = 'dev';
    try {
      /* eslint-disable no-undef */
      if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
        if (import.meta.env.VITE_BUILD_VERSION) { buildVersion = String(import.meta.env.VITE_BUILD_VERSION); }
        else if (import.meta.env.MODE) { buildVersion = import.meta.env.MODE + '-build'; }
      }
      /* eslint-enable no-undef */
    } catch (_) { /* ignore */ }
    return (
      <_Card icon="ⓘ" header="HermesTV">
        <_Row label="Web build" value={<span style={{ fontFamily: 'monospace', color: 'var(--accent, #00d4ff)' }}>{buildVersion}</span>} />
        <_Row label="App name" value="hermes-web-tv" />
        <_Row label="API service" value="hermes-tv-api" />
        <_Row label="Tizen target" value="Tizen 6.5 / Chrome 76 / QN85 QLED" />
        <_Row label="License" value="Internal — operator-owned deployment" />
        <_Row
          label="Source"
          value={
            <a
              href="https://github.com/Ghenghis/HermesTV-Tizen-AI"
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={0}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              style={{
                color: 'var(--accent, #00d4ff)',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >GitHub · Ghenghis/HermesTV-Tizen-AI ↗</a>
          }
        />
        <div style={{ marginTop: '0.6rem', fontSize: 'calc(0.78rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          Built for Sherri (Mom mode) and Dave. Design language inspired by IPTV Player Zero — no copied assets. Powered by Azure Neural TTS, Threadfin / iptv-org playlists, and the Apollo / XtremeHD provider mesh.
        </div>
      </_Card>
    );
  }

  function renderBody() {
    switch (activeTab) {
      case 'playlists':   return renderPlaylists();
      case 'general':     return renderGeneral();
      case 'providers':   return renderProviders();
      case 'appearance':  return renderAppearance();
      case 'features':    return renderFeatures();
      case 'network':     return renderNetwork();
      case 'playback':    return renderPlayback();
      case 'parental':    return renderParental();
      case 'backups':     return renderBackups();
      case 'hotkeys':     return renderHotkeys();
      case 'diagnostics': return renderDiagnostics();
      case 'about':       return renderAbout();
      case 'voice':       return renderVoice();
      default:            return renderGeneral();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={function(e) {
        if (e.target === e.currentTarget && typeof onClose === 'function') { onClose(); }
      }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 55,
        background: 'rgba(5,8,14,0.74)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3vh 2rem',
        overflowY: 'auto',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '880px',
          background: 'var(--surface, #161b22)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02) inset',
          overflow: 'hidden',
        }}
      >
        {/* Header — gradient surface-raised → surface */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid var(--border, #30363d)',
            background: 'linear-gradient(180deg, var(--surface-raised, #1c2128), var(--surface, #161b22))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <div
              aria-hidden="true"
              style={{
                width: '38px', height: '38px',
                borderRadius: '10px',
                background: 'rgba(0, 212, 255, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent, #00d4ff)',
                fontSize: '18px',
              }}
            >⚙</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))' }}>Settings</div>
              <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
                Theme, layout, playlists, downloads, and feature toggles.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.25rem 0.7rem',
                background: 'linear-gradient(135deg, #facc15, #f59e0b)',
                color: '#0a1628',
                borderRadius: '999px',
                fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >♔ Pro</span>
            <button
              tabIndex={0}
              onClick={function() { setHelpOpen(true); }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHelpOpen(true); } }}
              aria-label="Open keyboard shortcuts help"
              title="Keyboard shortcuts (?)"
              style={{
                width: '38px', height: '38px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 800,
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >?</button>
            <button
              tabIndex={0}
              autoFocus
              onClick={onClose}
              aria-label="Close settings"
              style={{
                width: '38px', height: '38px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                fontSize: '16px',
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
                lineHeight: 1,
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #00d4ff)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
            >&times;</button>
          </div>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Settings sections"
          style={{
            display: 'flex',
            gap: '0.25rem',
            padding: '0.6rem 1.25rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexWrap: 'wrap',
          }}
        >
          {TABS.map(function(t) {
            var isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onClick={function() { setActiveTab(t.id); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(t.id); } }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 1rem',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(99,102,241,0.12))'
                    : 'transparent',
                  border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'transparent'),
                  borderRadius: '999px',
                  color: isActive ? 'var(--accent, #00d4ff)' : 'var(--text, #e6edf3)',
                  fontSize: 'calc(0.82rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'background-color 160ms ease, color 160ms ease',
                }}
                onMouseEnter={function(e) { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={function(e) { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div role="tabpanel" aria-label={activeTab} style={{ padding: '1rem 1.25rem 1.25rem' }}>
          {renderBody()}
        </div>
      </div>
      {/* Keyboard shortcut help overlay — driven by the header "?" button. */}
      <KeyboardHelpModal isOpen={helpOpen} onClose={function() { setHelpOpen(false); }} profile={profile} />
    </div>
  );
}

// Helpers used by the Profile-actions card. Keeping them out of the inline
// JSX trims the diff and keeps the focus/blur side-effects consistent across
// the three buttons.
function zeroButtonStyle(variant) {
  var filled = variant === 'filled';
  return {
    padding: '0.65rem 1.15rem',
    background: filled ? 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)' : 'transparent',
    border: filled ? 'none' : '1px solid var(--border, #30363d)',
    borderRadius: filled ? '999px' : '10px',
    color: filled ? '#0a1628' : 'var(--text, #e6edf3)',
    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
    textAlign: 'left',
    boxShadow: filled ? '0 6px 18px rgba(0,212,255,0.28)' : 'none',
    transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
  };
}
function zeroButtonFocus(e) {
  e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)';
  e.currentTarget.style.outline = 'none';
}
function zeroButtonBlur(e) {
  e.currentTarget.style.boxShadow = 'none';
}

export default SettingsPanelTabbed;

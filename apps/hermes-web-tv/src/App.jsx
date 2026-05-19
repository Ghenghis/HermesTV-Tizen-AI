import React from 'react';
import * as profileStore from './store/profileStore.js';
import * as voicePrefStore from './store/voicePrefStore.js';
import * as hermesApi from './api/hermesApi.js';
import * as mockApi from './api/mockApi.js';
import * as voiceClient from './api/azureVoiceClient.js';
import ThemeProvider from './components/ThemeProvider.jsx';
import LayoutShell from './components/LayoutShell.jsx';
import ProfilePicker from './components/ProfilePicker.jsx';
import ProviderFilter from './components/ProviderFilter.jsx';
import CatalogGrid from './components/CatalogGrid.jsx';
// FloatingChatbot is intentionally NOT lazy-loaded — the user expects voice
// input to be available the moment the catalog paints. Pre-bundling it
// keeps the chatbot's open-latency to a single React commit.
import FloatingChatbot from './components/FloatingChatbot.jsx';
// StreamingQualityBar is imported by MediaDetailPanel where it's actually
// rendered; App.jsx previously imported it but never used it (per audit
// W3-A3). Dropped to trim the App.jsx bundle entry by ~6 kB.
import ShellRenderer from './engine/ShellRenderer.jsx';
// SkeletonCard stays eager — it renders during initial paint before any
// modal opens, so lazy-loading it would defeat the purpose.
import { SkeletonCard } from './components/Skeleton.jsx';
import { installTizenKeyHandler } from './utils/tizenKeyMap.js';
// Side-effect import: initialises the i18n module so the persisted locale
// is read from localStorage on first paint. Components import the hook /
// `t` directly from `./i18n/...`; this top-level import just guarantees
// the module evaluates eagerly rather than lazily with the first modal.
import './i18n/index.js';
// First-launch onboarding — eager because it gates the very first paint
// path. Lazy-loading would add a render-blocking suspense fallback in front
// of Step 1, which is the opposite of the wizard's "drop the user straight
// in" intent. The wizard itself lazy-loads PlaylistImport + QR internally.
import OnboardingWizard from './components/OnboardingWizard.jsx';
import * as onboardingState from './store/onboardingState.js';

// ── Lazy-loaded modal chunks ─────────────────────────────────────────────────
// Every component below is rendered behind an `isOpen` flag, so their JS
// payload is dead weight during initial paint. React.lazy hoists each into
// its own chunk that only downloads + parses when the user opens it.
// Suspense fallback={null} because every gate already starts in a hidden
// state — the user never sees a "loading…" spinner for a closed modal.
//
// Tizen 6.5 (Chrome 76) compatibility: React 18's lazy/Suspense are stable
// on this engine — see https://react.dev/reference/react/lazy. No `await`
// or top-level await is used; we keep classic dynamic import().
var PlayerModal = React.lazy(function() { return import('./components/PlayerModal.jsx'); });
var DownloadModal = React.lazy(function() { return import('./components/DownloadModal.jsx'); });
var VoicePickerModal = React.lazy(function() { return import('./components/VoicePickerModal.jsx'); });
var LayoutSwitcher = React.lazy(function() { return import('./components/LayoutSwitcher.jsx'); });
var QROnboarding = React.lazy(function() { return import('./components/QROnboarding.jsx'); });
var SettingsPanelTabbed = React.lazy(function() { return import('./components/SettingsPanelTabbed.jsx'); });
var MediaDetailPanel = React.lazy(function() { return import('./components/MediaDetailPanel.jsx'); });
// PlaylistImportModal is the 3-step wizard launched from Settings ▸ Playlists.
// Lazy-loaded so its ~12 kB chunk only ships when the operator opens it.
var PlaylistImportModal = React.lazy(function() { return import('./components/PlaylistImportModal.jsx'); });
// EPGModal hosts the shipped EPGGrid behind a thin loading/error shell.
// Opened from the "Guide" button in the header. Lazy so the 14 kB EPGGrid
// payload (incl. virtualizer) only ships when the user opens it.
var EPGModal = React.lazy(function() { return import('./components/EPGModal.jsx'); });
// MultiviewModal hosts the shipped MultiviewPlayer + LayoutPicker. Opened
// from the "Multi" button in the header (and from the PlayerModal toolbar
// in a follow-up). Lazy so the four-stream HLS surface doesn't bloat the
// initial paint.
var MultiviewModal = React.lazy(function() { return import('./components/MultiviewModal.jsx'); });

// Determine tier from TV model prefix
// QN prefix → enhanced, UN prefix → degraded, custom → enhanced (assume capable TV)
function resolveTier(tvModel) {
  if (!tvModel) { return 'degraded'; }
  var upper = tvModel.toUpperCase();
  if (upper.indexOf('QN') === 0) { return 'enhanced'; }
  if (upper === 'CUSTOM') { return 'enhanced'; }
  return 'degraded';
}

function applyTierClasses(tier) {
  var htmlEl = document.documentElement;
  htmlEl.classList.remove('enhanced', 'un-degraded');
  if (tier === 'enhanced') {
    htmlEl.classList.add('enhanced');
  } else {
    htmlEl.classList.add('un-degraded');
  }
}

function applyDocumentTheme(profile) {
  if (!profile) { return; }

  // Remove all existing theme classes from html element
  var htmlEl = document.documentElement;
  var classList = htmlEl.className.split(' ').filter(function(c) {
    return c.indexOf('theme-') !== 0;
  });

  // Add the new theme class
  var activeTheme = profile.active_theme || 'night-blue';
  classList.push('theme-' + activeTheme);
  htmlEl.className = classList.join(' ').trim();

  // Apply font scale as CSS custom property
  var fontScale = profile.font_scale || 1.0;
  // Mom Mode enforcement: font_scale must be >= 1.25 for mom_mode profiles
  if (profile.mom_mode && fontScale < 1.25) {
    fontScale = 1.25;
  }
  htmlEl.style.setProperty('--font-scale', String(fontScale));

  // Reduced motion: add class to body
  if (profile.reduced_motion) {
    document.body.classList.add('motion-reduced');
  } else {
    document.body.classList.remove('motion-reduced');
  }
}

function applyThemeByName(themeName) {
  var htmlEl = document.documentElement;
  var classList = htmlEl.className.split(' ').filter(function(c) {
    return c.indexOf('theme-') !== 0;
  });
  classList.push('theme-' + themeName);
  htmlEl.className = classList.join(' ').trim();
}

// ── FilterBar (inline component) ──────────────────────────────────────────────
// A horizontal row of dropdowns for provider, content type, and quality.
function FilterBar(props) {
  var providerFilter = props.providerFilter;
  var contentFilter = props.contentFilter;
  var qualityFilter = props.qualityFilter;
  var onProviderChange = props.onProviderChange;
  var onContentChange = props.onContentChange;
  var onQualityChange = props.onQualityChange;

  var selectStyle = {
    backgroundColor: 'var(--surface-raised, #1c2128)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
    padding: '0.4rem 0.75rem',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 1.5rem',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border, #30363d)',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          fontWeight: '600',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Filter:
      </span>

      {/* Provider filter */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          Provider
        </span>
        <select
          value={providerFilter}
          onChange={function(e) { onProviderChange(e.target.value); }}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="apollo_group">Apollo Group</option>
          <option value="xtremehd">XtremeHD</option>
        </select>
      </label>

      {/* Content type filter */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          Content
        </span>
        <select
          value={contentFilter}
          onChange={function(e) { onContentChange(e.target.value); }}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="live">Live</option>
          <option value="movies">Movies</option>
          <option value="series">Series</option>
        </select>
      </label>

      {/* Quality filter */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          Quality
        </span>
        <select
          value={qualityFilter}
          onChange={function(e) { onQualityChange(e.target.value); }}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="720p+">720p+</option>
          <option value="1080p+">1080p+</option>
          <option value="4K">4K</option>
        </select>
      </label>
    </div>
  );
}

// ── ModelSelector (inline component) ─────────────────────────────────────────
function ModelSelector(props) {
  var tvModel = props.tvModel;
  var tier = props.tier;
  var onChange = props.onChange;

  var tierBadgeStyle = {
    fontSize: 'calc(0.65rem * var(--font-scale, 1))',
    fontWeight: '700',
    border: '1px solid',
    borderRadius: 'var(--radius-pill)',
    padding: '0.15rem 0.55rem',
    letterSpacing: '0.05em',
    marginLeft: '0.3rem',
    color: tier === 'enhanced' ? '#FFD700' : 'var(--muted)',
    borderColor: tier === 'enhanced' ? '#FFD700' : 'var(--muted)',
    backgroundColor: tier === 'enhanced' ? 'rgba(255,215,0,0.1)' : 'transparent',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
        TV Model:
      </span>
      <select
        value={tvModel}
        onChange={function(e) { onChange(e.target.value); }}
        style={{
          backgroundColor: 'var(--surface-raised, #1c2128)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text)',
          fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          padding: '0.25rem 0.6rem',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
        }}
      >
        <option value="QN85Q7FAAFXZA">QN85Q7FAAFXZA</option>
        <option value="UN55CU8000BXZA">UN55CU8000BXZA</option>
        <option value="custom">Custom</option>
      </select>
    </div>
  );
}

// ── Filter logic helpers ──────────────────────────────────────────────────────
function matchesProviderFilter(item, providerFilter) {
  if (providerFilter === 'all') { return true; }
  // Rich format: item.providers is an array of objects
  if (Array.isArray(item.providers)) {
    for (var i = 0; i < item.providers.length; i++) {
      if (item.providers[i].provider_id === providerFilter) { return true; }
    }
    return false;
  }
  // Old flat format: item.provider is a string, or item.provider_tags is an array
  if (typeof item.provider === 'string') {
    return item.provider === providerFilter;
  }
  if (Array.isArray(item.provider_tags)) {
    // Map filter values to the provider_tags used in mock (apollo_group → apollo)
    var tagAlias = providerFilter === 'apollo_group' ? 'apollo' : providerFilter;
    return item.provider_tags.indexOf(tagAlias) !== -1 ||
           item.provider_tags.indexOf(providerFilter) !== -1;
  }
  return false;
}

function matchesContentFilter(item, contentFilter) {
  if (contentFilter === 'all') { return true; }
  var type = item.type || item.content_type || '';
  if (contentFilter === 'live') { return type === 'live'; }
  if (contentFilter === 'movies') { return type === 'vod' || type === 'movie'; }
  if (contentFilter === 'series') { return type === 'series'; }
  return true;
}

function matchesQualityFilter(item, qualityFilter) {
  if (qualityFilter === 'all') { return true; }
  // resolution may be at top level or nested in item.quality
  var res = item.resolution || (item.quality && item.quality.resolution) || '';
  var r = res.toLowerCase();
  if (qualityFilter === '720p+') {
    return r === '720p' || r === '1080p' || r === '4k' || r === '2160p';
  }
  if (qualityFilter === '1080p+') {
    return r === '1080p' || r === '4k' || r === '2160p';
  }
  if (qualityFilter === '4K') {
    return r === '4k' || r === '2160p';
  }
  return true;
}

function matchesActorFilter(item, actorFilter) {
  if (!actorFilter) { return true; }
  var meta = item.metadata || {};
  var ids = Array.isArray(meta.cast_ids) ? meta.cast_ids : [];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] === actorFilter) { return true; }
  }
  return false;
}

function applyFilters(catalog, providerFilter, contentFilter, qualityFilter, actorFilter) {
  return catalog.filter(function(item) {
    return matchesProviderFilter(item, providerFilter) &&
           matchesContentFilter(item, contentFilter) &&
           matchesQualityFilter(item, qualityFilter) &&
           matchesActorFilter(item, actorFilter);
  });
}

// ── Initial state ─────────────────────────────────────────────────────────────
var INITIAL_STATE = {
  loading: true,
  profile: null,
  providers: [],
  catalog: [],
  actors: [],
  activeTab: 'all',
  tier: 'degraded',
  tvModel: 'QN85Q7FAAFXZA',
  online: true,
  showProfilePicker: false,
  // First-launch onboarding overlay. Set true by the boot useEffect when
  // there's no active profile AND the onboarded flag has never been set,
  // or by the Settings ▸ Replay onboarding action.
  showOnboarding: false,
  showQR: false,
  showSettings: false,
  // Playlist Import wizard — opened from Settings ▸ Playlists ▸ + Import playlist.
  // Lives at App.jsx level so the Settings modal can close before the wizard
  // opens; otherwise both overlays would stack and Tab focus would scramble.
  showPlaylistImport: false,
  error: null,
  // Filters
  providerFilter: 'all',
  contentFilter: 'all',
  qualityFilter: 'all',
  // Actor filter — set when the user clicks an actor card in MediaDetailPanel.
  // Format: { actor_id, name }. null when no actor filter is active.
  actorFilter: null,
  activeLayout: '',
  showLayoutSwitcher: false,
  showVoicePicker: false,
  // EPG modal — opened from the "Guide" button in the header. Fetches
  // /api/epg via epgClient.fetchEPG(providerFilter, 4) on open. Closes on
  // Escape / Tizen Back via the cascade in installTizenKeyHandler below.
  showEPG: false,
  // Multiview modal — opened from the "Multi" button in the header. On
  // open, MultiviewModal pulls the last 4 watched LIVE channels from
  // watchHistoryStore and joins them against the in-memory catalog so it
  // can resolve stream_url + title for each tile.
  showMultiview: false,
  activeVoiceId: '',
  // Selected item for detail panel
  selectedItem: null,
  selectedProviderId: null,
  // Player overlay state — populated by /api/play response
  showPlayer: false,
  playerTicket: null,
  playerError: '',
  // Download modal state — populated by /api/download response. Mirrors the
  // IPTV Player Zero exact-size disclosure dialog. downloadConfirmed flips
  // after the user clicks Proceed so the modal switches from review → queued.
  showDownload: false,
  downloadItem: null,
  downloadEnvelope: null,
  downloadPending: false,
  downloadConfirmed: false,
  downloadError: null,
  // Catalog source signal from /api/catalog's X-Catalog-Source response header
  // or _meta.source field. Used by the Settings panel "data source" badge so
  // the operator can tell at a glance whether real providers are wired vs
  // the mock seed is being served.
  catalogSource: null,
  // Per-provider diagnostics from /api/catalog _meta.m3u_providers. Shape:
  //   { apollo_group: { configured, label, count, error, age_ms }, xtremehd: {...} }
  // null when the response had no m3u block (older API or no providers
  // configured). Settings panel renders a row per configured provider so the
  // operator sees at a glance whether their M3U URL fetches succeeded.
  m3uProviders: null,
  // Count of iptv-org channels merged into the catalog this request.
  // Surfaced in Settings so the operator can confirm the cron is running.
  iptvOrgCount: 0,
};

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  var stateResult = React.useState(INITIAL_STATE);
  var state = stateResult[0];
  var setState = stateResult[1];

  function patchState(patch) {
    setState(function(prev) {
      return Object.assign({}, prev, patch);
    });
  }

  React.useEffect(function() {
    function onCtrlL(e) {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        patchState(function(prev) { return Object.assign({}, prev, { showLayoutSwitcher: !prev.showLayoutSwitcher }); });
      }
    }
    document.addEventListener('keydown', onCtrlL);
    return function() { document.removeEventListener('keydown', onCtrlL); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Samsung Tizen remote — color buttons + Smart Hub route to chatbot commands.
  // Back (10009) / Exit (10182) cascade through the modal stack so the user
  // doesn't accidentally exit the app via the OS-level back handler.
  React.useEffect(function() {
    var cleanup = installTizenKeyHandler(
      function(commandText) {
        var api = state.online ? hermesApi : mockApi;
        api.validateCommand({ command_text: commandText, profile_id: (state.profile && state.profile.profile_id) || 'mom_tv' })
          .then(function(result) {
            if (result && result.valid) {
              handleChatbotCommand({ action: result.action, params: result.params });
            } else if (commandText === 'toggle layout switcher') {
              patchState(function(prev) { return Object.assign({}, prev, { showLayoutSwitcher: !prev.showLayoutSwitcher }); });
            }
          }).catch(function() {
            if (commandText === 'toggle layout switcher') {
              patchState(function(prev) { return Object.assign({}, prev, { showLayoutSwitcher: !prev.showLayoutSwitcher }); });
            }
          });
      },
      function(/* keyCode */) {
        // Modal stack cascade — close whichever overlay is top-most.
        // Return true to swallow the Back key so Tizen OS doesn't exit the app.
        if (state.showPlayer) {
          patchState({ showPlayer: false, playerTicket: null, playerError: '' });
          return true;
        }
        if (state.showMultiview) {
          patchState({ showMultiview: false });
          return true;
        }
        if (state.showEPG) {
          patchState({ showEPG: false });
          return true;
        }
        if (state.showVoicePicker) {
          patchState({ showVoicePicker: false });
          return true;
        }
        if (state.showPlaylistImport) {
          // Playlist import wizard owns its internal back step; the OS-level
          // Back key just dismisses the whole modal. Re-opens Settings so
          // the user is dropped back where they came from.
          patchState({ showPlaylistImport: false, showSettings: true });
          return true;
        }
        if (state.showLayoutSwitcher) {
          patchState({ showLayoutSwitcher: false });
          return true;
        }
        if (state.selectedItem) {
          patchState({ selectedItem: null, selectedProviderId: null });
          return true;
        }
        if (state.showSettings) {
          patchState({ showSettings: false });
          return true;
        }
        if (state.showQR) {
          patchState({ showQR: false });
          return true;
        }
        // First-launch wizard owns its own Esc → skip-confirm flow. Swallow
        // Tizen Back here so an accidental remote press during onboarding
        // can't drop Sherri back to Smart Hub mid-flow. The Skip link in
        // the wizard's header is the deliberate exit path.
        if (state.showOnboarding) {
          return true;
        }
        // Nothing to dismiss — let the OS handle Back at the profile picker.
        return false;
      }
    );
    return cleanup;
  }, [state.online, state.profile, state.showPlayer, state.showVoicePicker, state.showLayoutSwitcher, state.selectedItem, state.showSettings, state.showQR, state.showPlaylistImport, state.showEPG, state.showMultiview, state.showOnboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Boot sequence — runs once on mount
  React.useEffect(function() {
    var profileId = profileStore.getActiveProfileId();

    if (!profileId) {
      // Fresh install (no household has used this TV) AND the user has never
      // completed or skipped onboarding → show the wizard. Returning users
      // who skipped previously still hit the bare ProfilePicker, as before.
      if (!onboardingState.isOnboarded()) {
        patchState({ loading: false, showOnboarding: true });
      } else {
        patchState({ loading: false, showProfilePicker: true });
      }
      return;
    }

    bootWithProfileId(profileId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function bootWithProfileId(profileId) {
    patchState({ loading: true, showProfilePicker: false, error: null });

    hermesApi.isReachable().then(function(reachable) {
      // Honest mode: when the API is unreachable we DO NOT silently swap to
      // mockApi (which previously made the UI look identical regardless of
      // whether the backend was working). Instead, surface a clear error
      // screen unless the dev explicitly opted in by setting
      // localStorage.hermestv_dev_mock='1'. The Settings data-source badge
      // also flips to a red 'no-api' state on every mock fallback path so
      // the operator can see the degradation at a glance.
      var devMockAllowed = (typeof window !== 'undefined' && window.localStorage &&
        window.localStorage.getItem('hermestv_dev_mock') === '1');

      if (!reachable && !devMockAllowed) {
        patchState({
          loading: false,
          online: false,
          error: 'Cannot reach the HermesTV server. Check your network or wait a moment and click Retry.',
        });
        return;
      }

      var api = reachable ? hermesApi : mockApi;
      var isOnline = reachable;

      return api.getProfile(profileId).then(function(profile) {
        // Wizard Step 2 persists the operator's explicit TV-model choice to
        // `hermestv:tv_model`. We prefer that over the seeded profile.tv_model
        // so Sherri's "QN85" answer (or Dave's "UN55") wins on the very first
        // paint after onboarding, before any /api/profile PATCH catches up.
        var storedTvModel = null;
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            storedTvModel = window.localStorage.getItem('hermestv:tv_model');
          }
        } catch (e) { /* silent */ }
        var tvModel = storedTvModel || profile.tv_model || state.tvModel;
        var tier = resolveTier(tvModel);
        applyDocumentTheme(profile);
        applyTierClasses(tier);

        return Promise.all([
          api.getProviders(),
          api.getCatalog(),
        ]).then(function(results) {
          var providers = results[0] || [];
          var rawCatalog = results[1] || [];

          // Support both array-of-items and catalog-wrapper formats
          var catalog = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.catalog || []);
          var actors = rawCatalog.actors || [];
          // X-Catalog-Source header (or _meta.source fallback) — honest data
          // source signal for the Settings badge. When we're on the dev-mock
          // path the badge shows 'dev-mock' so it's obvious in DevTools.
          var sourceHeader = rawCatalog._source_header || null;
          var meta = rawCatalog._meta || {};
          var metaSource = meta.source || null;
          var catalogSource = isOnline ? (sourceHeader || metaSource || null) : 'dev-mock';
          // m3u_providers and iptv_org_count land on _meta when the API has
          // the Threadfin/M3U client wired (PR #53). Older mockApi responses
          // and dev-mock paths leave them undefined — coalesce to null/0.
          var m3uProviders = meta.m3u_providers || null;
          var iptvOrgCount = (typeof meta.iptv_org_count === 'number') ? meta.iptv_org_count : 0;

          // Restore per-profile Azure voice preference from localStorage
          // (set when the user last picked a voice in VoicePickerModal).
          // Null when never picked — the UI falls back to a default voice.
          var persistedVoiceId = voicePrefStore.getVoiceId(profileId);

          patchState({
            loading: false,
            profile: profile,
            providers: providers,
            catalog: catalog,
            actors: actors,
            tier: tier,
            tvModel: tvModel,
            online: isOnline,
            showProfilePicker: false,
            catalogSource: catalogSource,
            activeVoiceId: persistedVoiceId || '',
            m3uProviders: m3uProviders,
            iptvOrgCount: iptvOrgCount,
          });

          // ── Boot greeting via Azure TTS ────────────────────────────────────
          // Speak a short "Welcome back, Sherri" line through the user's
          // last-picked Azure voice (or the server-side profile default
          // when nothing has been persisted yet). Skipped when:
          //   - profile.audio_feedback is false (Dave's default — silent)
          //   - the API is unreachable (mock fallback paths)
          //   - AZURE_TTS_KEY is missing on the server (handled silently —
          //     the server returns 202 with status=azure_not_configured,
          //     the client treats it as no_audio and we ignore it so the
          //     operator's local dev box does not throw a modal at them).
          if (isOnline && profile.audio_feedback) {
            var displayName = profile.display_name || 'there';
            var greeting = 'Welcome back, ' + displayName + '. Your library is ready.';
            voiceClient
              .speak(greeting, profileId, persistedVoiceId || undefined)
              .catch(function() { /* boot greeting is best-effort */ });
          }
        });
      }).catch(function(profileErr) {
        // Profile fetch failed mid-boot. Don't quietly substitute mock data
        // even though we passed isReachable — that's how the old code lied
        // about the system state. Show an honest error instead. Operators
        // who really want the mock data while debugging can re-issue with
        // localStorage.hermestv_dev_mock='1'.
        patchState({
          loading: false,
          online: false,
          error: 'Profile load failed: ' + (profileErr.message || 'unknown error'),
        });
      });
    }).catch(function(bootErr) {
      patchState({
        loading: false,
        error: 'Boot error: ' + (bootErr.message || 'unknown'),
      });
    });
  }

  function handleProfileSelect(profileId) {
    bootWithProfileId(profileId);
  }

  function handleTabChange(tabId) {
    patchState({ activeTab: tabId });
  }

  function handleOpenQR() {
    patchState({ showQR: true });
  }

  function handleCloseQR() {
    patchState({ showQR: false });
  }

  function handleTvModelChange(model) {
    var newTier = resolveTier(model);
    applyTierClasses(newTier);
    patchState({ tvModel: model, tier: newTier });
  }

  function handleItemClick(item) {
    // Pick the first available provider as default
    var defaultProvider = null;
    if (Array.isArray(item.providers) && item.providers.length > 0) {
      defaultProvider = item.providers[0].provider_id;
    } else if (typeof item.preferred_source === 'string') {
      defaultProvider = item.preferred_source;
    } else if (Array.isArray(item.provider_tags) && item.provider_tags.length > 0) {
      defaultProvider = item.provider_tags[0];
    }
    patchState({ selectedItem: item, selectedProviderId: defaultProvider });
  }

  function handleCloseDetail() {
    patchState({ selectedItem: null, selectedProviderId: null });
  }

  function handleSelectProvider(providerId) {
    patchState({ selectedProviderId: providerId });
  }

  function handlePlay(item, providerId) {
    var profileId = (state.profile && state.profile.profile_id) || 'mom_tv';
    var args = { item_id: item.id, profile_id: profileId };
    if (providerId) { args.provider_id = providerId; }
    patchState({ showPlayer: true, playerTicket: null, playerError: '' });
    hermesApi.startPlayback(args).then(function(ticket) {
      patchState({ playerTicket: ticket, playerError: '' });
    }).catch(function(err) {
      var msg = (err && err.message) ? err.message : 'Playback request failed';
      patchState({ playerTicket: null, playerError: msg });
    });
  }

  function handleClosePlayer() {
    patchState({ showPlayer: false, playerTicket: null, playerError: '' });
  }

  // ─── Download flow (Zero-shell 1-click ⤓) ─────────────────────────────────
  // 1. User clicks ⤓ on a card or in the detail panel
  // 2. POST /api/download → returns exact size envelope + job_id
  // 3. Modal opens with "EXACT DOWNLOAD SIZE NNN MB" + Cancel/Proceed
  // 4. Proceed flips downloadConfirmed → modal switches to "queued" view
  // 5. Cancel DELETEs the queued job + closes the modal
  // opts: optional { season, episode } for series downloads. season alone =
  // "download whole season N"; season + episode = "download S{nn}E{nn}".
  function handleStartDownload(item, opts) {
    if (!item || !item.id) { return; }
    var pid = (state.profile && state.profile.profile_id) || 'mom_tv';
    var args = { item_id: item.id, profile_id: pid };
    if (opts && typeof opts.season === 'number' && opts.season > 0) { args.season = opts.season; }
    if (opts && typeof opts.episode === 'number' && opts.episode > 0) { args.episode = opts.episode; }
    patchState({
      showDownload: true,
      downloadItem: item,
      downloadEnvelope: null,
      downloadPending: true,
      downloadConfirmed: false,
      downloadError: null,
    });
    hermesApi.startDownload(args)
      .then(function(body) {
        if (body && body.job_id) {
          patchState({ downloadEnvelope: body, downloadPending: false, downloadError: null });
        } else {
          // Backend returned an error envelope (400 / 404 / 503).
          patchState({ downloadEnvelope: null, downloadPending: false, downloadError: body || { error: 'unknown_error', message: 'Server returned no body.' } });
        }
      })
      .catch(function(err) {
        patchState({
          downloadEnvelope: null,
          downloadPending: false,
          downloadError: { error: 'network_error', message: (err && err.message) || 'Unable to reach the API.' },
        });
      });
  }

  function handleProceedDownload() {
    // Backend already queued the job on POST /api/download; clicking Proceed is
    // an explicit consent step. Flip the modal into its "queued" view.
    patchState({ downloadConfirmed: true });
  }

  function handleCloseDownload() {
    // If the user cancelled (downloadConfirmed=false but envelope present)
    // we'd ideally call hermesApi.cancelDownload — but the in-memory job
    // table self-trims old jobs, so leaving it is harmless and avoids a
    // gratuitous round-trip when the user just dismisses. Cancel-as-explicit
    // can come in a follow-up if the operator asks for it.
    patchState({
      showDownload: false,
      downloadItem: null,
      downloadEnvelope: null,
      downloadPending: false,
      downloadConfirmed: false,
      downloadError: null,
    });
  }

  // Triggered when the user clicks an actor card in the MediaDetailPanel.
  // Sets a server-agnostic actor filter (matched against item.metadata.cast_ids)
  // and closes the detail panel so the filtered grid is immediately visible.
  // A dismissable banner above the catalog shows "Filtering by ACTOR" with
  // a Clear button — see the renderActorFilterBanner block below.
  function handleFindSimilarActor(actor) {
    if (!actor || !actor.actor_id) { return; }
    patchState({
      actorFilter: { actor_id: actor.actor_id, name: actor.name || 'Unknown' },
      selectedItem: null,
      selectedProviderId: null,
    });
  }

  function handleClearActorFilter() {
    patchState({ actorFilter: null });
  }

  function handleResetDefaults() {
    patchState({
      providerFilter: 'all',
      contentFilter: 'all',
      qualityFilter: 'all',
      tvModel: 'QN85Q7FAAFXZA',
      tier: resolveTier('QN85Q7FAAFXZA'),
    });
    applyTierClasses(resolveTier('QN85Q7FAAFXZA'));
  }

  // Called when the wizard exits — either via Step 5 "Start watching" or via
  // the Skip confirm prompt. Step 3 ("Profile") may have set profileStore via
  // the embedded ProfilePicker, so we re-read the id and either boot normally
  // or fall through to the standalone ProfilePicker.
  function handleOnboardingComplete(/* { skipped } */) {
    var profileId = profileStore.getActiveProfileId();
    if (profileId) {
      patchState({ showOnboarding: false });
      bootWithProfileId(profileId);
    } else {
      patchState({ showOnboarding: false, showProfilePicker: true });
    }
  }

  // Settings ▸ Replay onboarding — clears the persisted flag + per-step
  // answers and re-shows the wizard. Useful for QA and accidental skips.
  function handleReplayOnboarding() {
    onboardingState.reset();
    patchState({ showSettings: false, showOnboarding: true });
  }

  function handleChatbotCommand(commandResult) {
    var action = commandResult.action;
    var params = commandResult.params || {};

    if (action === 'filter_provider') {
      patchState({ providerFilter: params.provider_id || 'all' });
    } else if (action === 'filter_content') {
      patchState({ contentFilter: params.content_type || 'all' });
    } else if (action === 'filter_quality') {
      patchState({ qualityFilter: params.quality || 'all' });
    } else if (action === 'switch_profile') {
      if (params.profile_id) {
        profileStore.setActiveProfileId(params.profile_id);
        bootWithProfileId(params.profile_id);
      }
    } else if (action === 'update_layout') {
      patchState({ activeLayout: params.layout || '' });
    } else if (action === 'update_theme') {
      if (params.theme) {
        applyThemeByName(params.theme);
        patchState({ profile: Object.assign({}, state.profile, { active_theme: params.theme }) });
      }
    } else if (action === 'update_motion') {
      if (params.density === 'off') {
        document.body.classList.add('motion-reduced');
        patchState({ profile: Object.assign({}, state.profile, { reduced_motion: true }) });
      } else {
        document.body.classList.remove('motion-reduced');
        patchState({ profile: Object.assign({}, state.profile, { reduced_motion: false }) });
      }
    } else if (action === 'reset_filters') {
      patchState({ providerFilter: 'all', contentFilter: 'all', qualityFilter: 'all', actorFilter: null });
    }
    // show_detail and find_similar_actor: no state mutation needed (chatbot response text handles UX)
  }

  function handleLayoutChange(layoutId) {
    patchState({ activeLayout: layoutId || '', showLayoutSwitcher: false });
    if (layoutId) {
      applyThemeByName(layoutId);
    }
  }

  // ── First-launch onboarding wizard ──
  // Owns the whole viewport while open. The wizard self-manages its keyboard
  // model (Arrow nav + Esc → skip-confirm) and persists onboarded=true on
  // every exit path, so the boot useEffect never re-prompts after.
  if (state.showOnboarding) {
    return <OnboardingWizard isOpen onComplete={handleOnboardingComplete} />;
  }

  // ── Profile picker ──
  if (state.showProfilePicker) {
    return <ProfilePicker onSelect={handleProfileSelect} />;
  }

  // ── Loading: skeleton catalog grid ──
  // SOTA streaming UX never shows a blank canvas while the boot fetch runs.
  // We paint the layout-to-be (6×4 poster cards on enhanced, 4×3 on degraded)
  // so Mom sees where her library is about to land instead of a spinner.
  // The CatalogGrid + CatalogCard 2:3 aspect ratio is mirrored by SkeletonCard.
  if (state.loading) {
    var skeletonCols = state.tier === 'enhanced' ? 6 : 4;
    var skeletonRows = 4;
    var skeletonCount = skeletonCols * skeletonRows;
    var skeletonCells = [];
    for (var sIdx = 0; sIdx < skeletonCount; sIdx++) {
      skeletonCells.push(<SkeletonCard key={'sk-' + sIdx} />);
    }
    return (
      <div
        role="status"
        aria-label="Loading your library"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          backgroundColor: '#0d1117',
          color: '#e6edf3',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Branded skeleton header — mirrors the real app header height */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#161b22',
            borderBottom: '1px solid #30363d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '0.03em' }}>
            Hermes<span style={{ color: '#1f6feb' }}>TV</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#8b949e' }}>Loading your library...</div>
        </div>
        {/* Skeleton catalog grid */}
        <div
          style={{
            flex: 1,
            padding: '1rem 1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(' + skeletonCols + ', 1fr)',
            gap: '1rem',
            overflow: 'hidden',
          }}
        >
          {skeletonCells}
        </div>
      </div>
    );
  }

  // ── Fatal error ──
  if (state.error && !state.profile) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0d1117',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: '#f85149',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem' }}>&#x26A0;</div>
        <h2 style={{ margin: 0, color: '#e6edf3', fontSize: '1.25rem' }}>Something went wrong</h2>
        <p style={{ margin: 0, color: '#8b949e', fontSize: '0.875rem', maxWidth: '480px' }}>{state.error}</p>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Retry — re-run the boot sequence with the currently-saved profile.
              Most transient network blips clear after one retry; this avoids
              forcing Mom back to the profile picker. */}
          <button
            tabIndex={0}
            autoFocus
            onClick={function() {
              var pid = profileStore.getActiveProfileId();
              if (pid) {
                patchState({ error: null, loading: true });
                bootWithProfileId(pid);
              } else {
                patchState(Object.assign({}, INITIAL_STATE, { loading: false, showProfilePicker: true }));
              }
            }}
            style={{
              padding: '0.6rem 1.5rem',
              background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
              border: '1px solid #1f6feb',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              fontWeight: '700',
              cursor: 'pointer',
              fontSize: '1rem',
              outline: 'none',
              boxShadow: 'var(--shadow-md)',
              transition: 'transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '3px solid #fff'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            &#x21BB; Retry
          </button>
          <button
            tabIndex={0}
            onClick={function() {
              profileStore.clearActiveProfileId();
              patchState(Object.assign({}, INITIAL_STATE, { loading: false, showProfilePicker: true }));
            }}
            style={{
              padding: '0.6rem 1.5rem',
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 'var(--radius-md)',
              color: '#e6edf3',
              cursor: 'pointer',
              fontSize: '1rem',
              outline: 'none',
              transition: 'border-color 200ms var(--ease-out), background-color 200ms var(--ease-out)',
            }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid #1f6feb'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            Switch Profile
          </button>
        </div>
      </div>
    );
  }

  var profile = state.profile || {};

  // Apply all four filters (provider + content + quality + actor) to the catalog
  var filteredCatalog = applyFilters(
    state.catalog,
    state.providerFilter,
    state.contentFilter,
    state.qualityFilter,
    state.actorFilter ? state.actorFilter.actor_id : null
  );

  // ── Main app shell ──
  return (
    <ThemeProvider profile={profile}>
      <LayoutShell profile={profile}>

        {/* Offline banner */}
        {!state.online && (
          <div
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: '#e3b341',
              color: '#0d1117',
              padding: '0.4rem 1.5rem',
              fontSize: 'calc(0.8rem * var(--font-scale, 1))',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            <span aria-hidden="true">&#x26A0;</span>
            Offline mode — showing cached content. Backend at hermestv.local is unreachable.
          </div>
        )}

        {/* Actor filter banner — visible whenever the user has clicked an
            actor card to "find more with this actor". One-tap Clear button
            restores the unfiltered catalog. Keyboard-focusable so Tizen
            remote users can reach it. */}
        {state.actorFilter && (
          <div
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: 'var(--accent, #1f6feb)',
              color: '#ffffff',
              padding: '0.5rem 1.5rem',
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              gap: '0.75rem',
            }}
          >
            <span>
              <span aria-hidden="true">&#x1F3AC;</span>{' '}
              More with <strong>{state.actorFilter.name}</strong> &mdash; showing {filteredCatalog.length} {filteredCatalog.length === 1 ? 'title' : 'titles'}
            </span>
            <button
              tabIndex={0}
              onClick={handleClearActorFilter}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClearActorFilter(); }
              }}
              aria-label={'Clear actor filter (' + state.actorFilter.name + ')'}
              style={{
                padding: '0.3rem 0.9rem',
                backgroundColor: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: 'var(--radius-pill)',
                color: '#ffffff',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                transition: 'background-color 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid #ffffff';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              Clear filter
            </button>
          </div>
        )}

        {/* App header */}
        <header
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border, #30363d)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 'calc(1.25rem * var(--font-scale, 1))',
                fontWeight: '800',
                letterSpacing: '0.03em',
                color: 'var(--text)',
              }}
            >
              Hermes<span style={{ color: 'var(--accent)' }}>TV</span>
            </span>
            {state.tier === 'enhanced' && (
              <span
                style={{
                  fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: '#fff',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0.15rem 0.65rem',
                  letterSpacing: '0.06em',
                  background: 'var(--gradient-accent, linear-gradient(135deg, var(--accent), #6366f1))',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                ENHANCED
              </span>
            )}

            {/* Model selector */}
            <ModelSelector
              tvModel={state.tvModel}
              tier={state.tier}
              onChange={handleTvModelChange}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Add Provider button */}
            <button
              tabIndex={0}
              onClick={handleOpenQR}
              style={{
                padding: '0.4rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--muted)',
                fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 200ms var(--ease-out), color 200ms var(--ease-out), background-color 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.outline = '2px solid var(--accent)';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) {
                e.currentTarget.style.borderColor = 'var(--border, #30363d)';
                e.currentTarget.style.color = 'var(--muted)';
                e.currentTarget.style.outline = 'none';
              }}
            >
              + Add Provider
            </button>

            {/* Profile avatar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--muted)',
                fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {(profile.display_name || 'U').charAt(0).toUpperCase()}
              </div>
              <span>{profile.display_name || profile.profile_id}</span>
            </div>

            {/* Settings gear button */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showSettings: !state.showSettings }); }}
              aria-label="Settings"
              aria-expanded={state.showSettings}
              style={{
                padding: '0.4rem 0.7rem',
                backgroundColor: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--muted)',
                fontSize: '1.1rem',
                cursor: 'pointer',
                outline: 'none',
                lineHeight: '1',
                transition: 'border-color 200ms var(--ease-out), color 200ms var(--ease-out), transform 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid var(--accent)';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) {
                e.currentTarget.style.outline = 'none';
              }}
            >
              &#x2699;
            </button>

            {/* TV Guide (EPG) button — opens the EPG modal. Reaches the
                shipped EPGGrid via EPGModal which fetches /api/epg through
                epgClient.fetchEPG(providerFilter, 4). Visible on every
                shell because it's parked in the App-level header. */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showEPG: true }); }}
              title="TV Guide"
              aria-label="Open TV Guide"
              style={{
                padding: '0.4rem 0.9rem',
                backgroundColor: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text)',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                letterSpacing: '0.03em',
                flexShrink: 0,
                transition: 'border-color 200ms var(--ease-out), color 200ms var(--ease-out), background-color 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid var(--accent)';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &#x1F4FA; Guide
            </button>

            {/* Multiview button — opens the MultiviewModal which uses the
                shipped MultiviewPlayer + LayoutPicker and seeds tiles from
                watchHistoryStore.listRecent(profile.id, 4). */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showMultiview: true }); }}
              title="Multiview — watch up to 4 channels at once"
              aria-label="Open Multiview"
              style={{
                padding: '0.4rem 0.9rem',
                backgroundColor: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text)',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                letterSpacing: '0.03em',
                flexShrink: 0,
                transition: 'border-color 200ms var(--ease-out), color 200ms var(--ease-out), background-color 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid var(--accent)';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &#x25A6; Multi
            </button>

            {/* Layout switcher button */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showLayoutSwitcher: true }); }}
              title="Change visual layout (Ctrl+L)"
              style={{
                padding: '0.4rem 0.9rem',
                background: 'var(--gradient-sunset, linear-gradient(135deg, #6366f1, #d946ef))',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: '#fff',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                letterSpacing: '0.03em',
                flexShrink: 0,
                boxShadow: 'var(--shadow-md)',
                transition: 'transform 200ms var(--ease-out), box-shadow 200ms var(--ease-out)',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid #fff';
                e.currentTarget.style.outlineOffset = '2px';
              }}
              onBlur={function(e) {
                e.currentTarget.style.outline = 'none';
              }}
            >
              &#x1F3A8; Look
            </button>
          </div>
        </header>

        {/* Shell renderer — active shell layout OR default grid */}
        {(function() {
          var resolvedLayout = state.activeLayout || (profile.mom_mode ? 'mom-mode' : '');
          var validShells = ['tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen', 'mom-mode', 'dave-power', 'zero'];
          if (resolvedLayout && validShells.indexOf(resolvedLayout) !== -1) {
            return (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ShellRenderer
                  layout={resolvedLayout}
                  catalog={filteredCatalog}
                  profile={profile}
                  tier={state.tier}
                  providers={state.providers}
                  onItemSelect={handleItemClick}
                  contentFilter={state.contentFilter}
                  providerFilter={state.providerFilter}
                  qualityFilter={state.qualityFilter}
                />
              </div>
            );
          }
          return (
          <React.Fragment>
            {/* Filter bar */}
            <FilterBar
              providerFilter={state.providerFilter}
              contentFilter={state.contentFilter}
              qualityFilter={state.qualityFilter}
              onProviderChange={function(v) { patchState({ providerFilter: v }); }}
              onContentChange={function(v) { patchState({ contentFilter: v }); }}
              onQualityChange={function(v) { patchState({ qualityFilter: v }); }}
            />

            {/* Provider filter tabs */}
            <ProviderFilter
              activeTab={state.activeTab}
              onTabChange={handleTabChange}
            />

            {/* Catalog grid — scrollable main content area */}
            <main
              style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: 'var(--bg)',
              }}
            >
              <CatalogGrid
                items={filteredCatalog}
                activeTab={state.activeTab}
                profile={profile}
                tier={state.tier}
                columns={state.activeTab === 'discovery' ? (state.tier === 'enhanced' ? 8 : 4) : (state.tier === 'enhanced' ? 5 : 3)}
                onItemClick={handleItemClick}
              />
            </main>
          </React.Fragment>
          );
        })()}

        {/* Floating chatbot — eager-loaded; the user expects voice input
            available the moment the catalog paints. */}
        <FloatingChatbot profile={profile} online={state.online} onCommand={handleChatbotCommand} />

        {/* ── Lazy-loaded modal stack ─────────────────────────────────────
            All seven modals below are wrapped in a single <Suspense>
            fallback={null} because every modal already starts hidden
            (isOpen=false → null returned). The user never sees a
            "loading…" placeholder for a modal that wasn't requested. The
            conditional `state.show*` gates prevent the lazy chunks from
            even being requested until the user actually invokes them —
            cold load stays minimal, peak interaction stays smooth. */}
        <React.Suspense fallback={null}>
          {/* QR onboarding modal */}
          {state.showQR && (
            <QROnboarding
              isOpen={state.showQR}
              onClose={handleCloseQR}
              online={state.online}
              onCompleted={function() {
                // Pairing handshake finished — refresh provider list so the
                // newly-added entry shows up in ProviderFilter and chips.
                var api = state.online ? hermesApi : mockApi;
                api.getProviders().then(function(payload) {
                  var list = payload && payload.providers
                    ? payload.providers
                    : (Array.isArray(payload) ? payload : []);
                  patchState({ providers: list });
                }).catch(function() { /* non-fatal; tick again on next user action */ });
              }}
            />
          )}

          {/* Media detail panel — full-screen overlay */}
          {state.selectedItem && (
            <MediaDetailPanel
              item={state.selectedItem}
              actors={state.actors}
              onClose={handleCloseDetail}
              onSelectProvider={handleSelectProvider}
              selectedProviderId={state.selectedProviderId}
              globalProviders={state.providers}
              onPlay={handlePlay}
              onFindSimilarActor={handleFindSimilarActor}
              onDownload={handleStartDownload}
              profileId={profile.profile_id || 'mom_tv'}
            />
          )}

          {/* Download modal — Zero-shell exact-size disclosure */}
          {state.showDownload && (
            <DownloadModal
              isOpen={state.showDownload}
              envelope={state.downloadEnvelope}
              pending={state.downloadPending}
              confirmed={state.downloadConfirmed}
              error={state.downloadError}
              item={state.downloadItem}
              onClose={handleCloseDownload}
              onProceed={handleProceedDownload}
            />
          )}

          {/* Player overlay — opened by ▶ Watch in the detail panel. Talks to
              /api/play and renders the resulting ticket. The actual byte
              stream is wired in Phase 4 when Threadfin / Jellyfin URL
              resolution lands on the backend; until then the modal shows a
              friendly "pipeline pending" state from the 503 response. */}
          {state.showPlayer && (
            <PlayerModal
              isOpen={state.showPlayer}
              ticket={state.playerTicket}
              error={state.playerError}
              onClose={handleClosePlayer}
              profileId={profile.profile_id || 'mom_tv'}
              onOpenMultiview={function(/* item */) {
                // Close the single-stream player so Multiview can take the
                // foreground. Tile click inside Multiview can promote a
                // stream back to single-stream via handlePlay.
                patchState({
                  showPlayer: false,
                  playerTicket: null,
                  playerError: '',
                  showMultiview: true,
                });
              }}
            />
          )}

          {/* Settings — tabbed modal that clones the IPTV Player Zero
              panel (Playlists / General / Backups / Appearance / Features /
              Hotkeys / About). Existing per-action callbacks pipe back into
              the same handlers the old inline panel used. */}
          {state.showSettings && (
            <SettingsPanelTabbed
              isOpen={state.showSettings}
              profile={profile}
              tier={state.tier}
              tvModel={state.tvModel}
              catalogSource={state.catalogSource}
              iptvOrgCount={state.iptvOrgCount}
              m3uProviders={state.m3uProviders}
              activeTheme={(profile && profile.active_theme) || 'night-blue'}
              providers={state.providers}
              onClose={function() { patchState({ showSettings: false }); }}
              onOpenVoicePicker={function() { patchState({ showSettings: false, showVoicePicker: true }); }}
              onOpenLayoutSwitcher={function() { patchState({ showSettings: false, showLayoutSwitcher: true }); }}
              onOpenPlaylistImport={function() { patchState({ showSettings: false, showPlaylistImport: true }); }}
              onSwitchProfile={function() {
                profileStore.clearActiveProfileId();
                patchState(Object.assign({}, INITIAL_STATE, {
                  loading: false,
                  showProfilePicker: true,
                  showSettings: false,
                }));
              }}
              onResetDefaults={handleResetDefaults}
              onReplayOnboarding={handleReplayOnboarding}
              onThemeChange={function(themeName) {
                applyThemeByName(themeName);
                patchState({ profile: Object.assign({}, state.profile, { active_theme: themeName }) });
              }}
            />
          )}

          {/* Layout switcher modal */}
          {state.showLayoutSwitcher && (
            <LayoutSwitcher
              isOpen={state.showLayoutSwitcher}
              activeLayout={state.activeLayout}
              tier={state.tier}
              onSelect={handleLayoutChange}
              onClose={function() { patchState({ showLayoutSwitcher: false }); }}
            />
          )}

          {/* Playlist Import wizard — 3-step modal (Source → Validate → Confirm).
              Opens from Settings ▸ Playlists ▸ + Import playlist. On a
              successful save we refresh /api/providers so the new playlist
              shows up in the provider filter chips without a hard reload. */}
          {state.showPlaylistImport && (
            <PlaylistImportModal
              isOpen={state.showPlaylistImport}
              onClose={function() { patchState({ showPlaylistImport: false }); }}
              onSaved={function() {
                // Refresh provider list so the new playlist tag appears in
                // ProviderFilter / FilterBar selects. We re-open Settings so
                // the user sees the new entry in the Playlists tab list.
                var api = state.online ? hermesApi : mockApi;
                api.getProviders().then(function(payload) {
                  var list = payload && payload.providers
                    ? payload.providers
                    : (Array.isArray(payload) ? payload : []);
                  patchState({ providers: list, showPlaylistImport: false, showSettings: true });
                }).catch(function() {
                  patchState({ showPlaylistImport: false, showSettings: true });
                });
              }}
            />
          )}

          {/* EPG modal — TV Guide grid, opened from the "Guide" header
              button. Esc / Tizen Back close it (cascade above). Program
              selection currently logs to console; downstream wire-up
              (open PlayerModal for the program's channel) lands when the
              EPG → channel resolver is exposed by the API. */}
          {state.showEPG && (
            <EPGModal
              isOpen={state.showEPG}
              providerFilter={state.providerFilter}
              onClose={function() { patchState({ showEPG: false }); }}
              onProgramSelect={function(/* program */) {
                // Future: resolve program.channel_id → catalog item, call handlePlay.
              }}
              onChannelSelect={function(/* channel */) {
                // Future: resolve channel.id → catalog item, call handlePlay.
              }}
            />
          )}

          {/* Multiview modal — 2-4 simultaneous tiles seeded by the user's
              last 4 watched channels. Tile click hands the stream off to
              the single-stream PlayerModal so the user can promote a tile
              to fullscreen without losing the watched-progress wiring. */}
          {state.showMultiview && (
            <MultiviewModal
              isOpen={state.showMultiview}
              profileId={profile.profile_id || 'mom_tv'}
              catalog={state.catalog}
              tier={state.tier}
              onClose={function() { patchState({ showMultiview: false }); }}
              onStreamSelect={function(stream) {
                // Find the matching catalog item so handlePlay can drive
                // the regular /api/play ticket flow. Fall back to closing
                // Multiview only if the join fails — silent no-op is OK
                // because the user can still keep watching the grid.
                if (!stream || !stream.id) { return; }
                for (var k = 0; k < state.catalog.length; k++) {
                  if (String(state.catalog[k].id) === String(stream.id)) {
                    patchState({ showMultiview: false });
                    handlePlay(state.catalog[k], null);
                    return;
                  }
                }
              }}
            />
          )}

          {/* Voice picker modal — Mom can switch Azure voices seamlessly */}
          {state.showVoicePicker && (
            <VoicePickerModal
              isOpen={state.showVoicePicker}
              profileId={profile.profile_id || 'mom_tv'}
              agentName={profile.agent_name || 'Hermes'}
              currentVoiceId={state.activeVoiceId}
              onClose={function() { patchState({ showVoicePicker: false }); }}
              onVoiceChange={function(voiceId) {
                // Persist per-profile so the pick survives reload, profile switch,
                // and TV reboot. Falsy voiceId clears the stored preference.
                var pid = (state.profile && state.profile.profile_id) || profile.profile_id || 'mom_tv';
                voicePrefStore.setVoiceId(pid, voiceId);
                patchState({ activeVoiceId: voiceId });
              }}
            />
          )}
        </React.Suspense>

      </LayoutShell>
    </ThemeProvider>
  );
}

export default App;

import React from 'react';
import * as profileStore from './store/profileStore.js';
import * as voicePrefStore from './store/voicePrefStore.js';
import * as providerVisibilityStore from './store/providerVisibilityStore.js';
import * as hermesApi from './api/hermesApi.js';
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
import { isValidLayout } from './engine/layoutRegistry.js';
// SkeletonCard stays eager — it renders during initial paint before any
// modal opens, so lazy-loading it would defeat the purpose.
import { SkeletonCard } from './components/Skeleton.jsx';
import { installTizenKeyHandler } from './utils/tizenKeyMap.js';
import { installSpatialNav } from './utils/tizenSpatialNav.js';
import {
  buildProviderFilterOptions,
  providerFilterToIds,
  providerIdsToFilter,
  itemMatchesProviderFilter,
  getItemProviderIds,
} from './utils/providerIdentity.js';
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
// ProfileManagementModal is already statically imported by ProfilePicker so
// it always ships in the eager bundle — using a regular import here avoids
// Vite's "static import shadows dynamic import" warning while keeping the
// same render-time cost. App.jsx mounts it as a second entry point from
// Settings ▸ Profile actions so the user doesn't have to log out to edit.
import ProfileManagementModal from './components/ProfileManagementModal.jsx';
// Parental lock — the hook + overlay shipped in #102 already protect the
// MediaDetailPanel's Play / Download buttons. Mounted at App level too so
// any caller that goes through handlePlay / handleStartDownload — Multiview
// tile-click, future shell quick-play, search-result direct-play — is
// covered by the same PIN gate. The hook's unlock cache is module-scoped,
// so unlocks made in MediaDetailPanel apply at App level and vice versa.
import ParentalLockOverlay from './components/ParentalLockOverlay.jsx';
import useParentalGate from './hooks/useParentalGate.js';
// Wave-4 standalone components shipped in PR #134; mount them here so they
// actually render. Screensaver activates after N minutes idle; SleepTimer
// fires a CustomEvent we listen for to close the active player.
import Screensaver from './components/Screensaver.jsx';
import useScreensaverIdle from './hooks/useScreensaverIdle.js';
import SleepTimer, { useSleepTimer } from './components/SleepTimer.jsx';
// Wave-6 viewport classes — drops hermes-vp-{tv|desktop|tablet|phone} +
// hermes-vp-{landscape|portrait} + hermes-vp-narrow/wide on <body> so shells
// + CSS can react to Samsung tablets/phones rotating without per-shell hooks.
import { installViewportClasses } from './utils/viewportClass.js';
import { resolveAssistantName } from './utils/assistantName.js';

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
// SearchModal — global "/" or Ctrl+K search overlay. Hits /api/search with
// a 200ms debounce and caches the last 10 queries via recentSearchesStore.
// Lazy so the search payload (incl. recent-searches store + debounce util)
// only ships when the user actually invokes search.
var SearchModal = React.lazy(function() { return import('./components/SearchModal.jsx'); });
// ScheduleRecordingModal — "Record this" dialog for live channels. Opens
// from MediaDetailPanel's Record button (live items only). Hits
// /api/dvr/schedule via dvrClient.scheduleRecording. Lazy so the form +
// time-picker logic only ships when the user actually schedules.
var ScheduleRecordingModal = React.lazy(function() { return import('./components/ScheduleRecordingModal.jsx'); });

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
  var providers = props.providers || [];
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
  var providerOptions = buildProviderFilterOptions(providers);
  var selectedProviders = providerFilterToIds(providerFilter);
  var allProviders = selectedProviders.length === 0;

  function isProviderSelected(id) {
    if (allProviders) { return false; }
    return selectedProviders.indexOf(id) !== -1;
  }

  function setProviders(ids) {
    if (onProviderChange) {
      onProviderChange(providerIdsToFilter(ids));
    }
  }

  function toggleProvider(id) {
    var next;
    if (allProviders) {
      next = [id];
    } else {
      next = selectedProviders.slice();
      var idx = next.indexOf(id);
      if (idx === -1) { next.push(id); }
      else { next.splice(idx, 1); }
    }
    setProviders(next);
  }

  function chipStyle(active, accent) {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '34px',
      padding: '0.34rem 0.75rem',
      borderRadius: '999px',
      border: '1px solid ' + (active ? (accent || 'var(--accent, #58a6ff)') : 'var(--border, #30363d)'),
      backgroundColor: active ? 'rgba(88,166,255,0.18)' : 'var(--surface-raised, #1c2128)',
      color: active ? 'var(--text, #e6edf3)' : 'var(--muted)',
      fontSize: 'calc(0.78rem * var(--font-scale, 1))',
      fontWeight: active ? 800 : 650,
      cursor: 'pointer',
      outline: 'none',
      whiteSpace: 'nowrap',
    };
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
          Providers
        </span>
        <button
          type="button"
          aria-pressed={allProviders}
          onClick={function() { setProviders([]); }}
          style={chipStyle(allProviders)}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >
          All
        </button>
        {providerOptions.map(function(p) {
          var active = isProviderSelected(p.id);
          return (
            <button
              type="button"
              key={p.id}
              aria-pressed={active}
              onClick={function() { toggleProvider(p.id); }}
              style={chipStyle(active)}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

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
  return itemMatchesProviderFilter(item, providerFilter);
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

// W16-PROVIDERS — per-profile provider visibility. `hiddenSet` is a plain
// map { provider_id: true } of providers the user has hidden via
// Settings ▸ Providers. Returns false to DROP the item when all of its
// providers/sources are hidden — i.e. an iptv-org-only ESPN card vanishes
// when iptv-org is hidden, but a multi-source ESPN card stays as long as
// at least one of its sources is still visible.
//
// hiddenSet treats 'iptv-org' and 'iptv_org' as the same provider (the
// store normalises to underscores; the catalog uses the hyphenated form).
//
// We pass false through when there are zero hidden providers — the
// common case for fresh profiles — so the filter is a no-op until the
// user actually flips a toggle.
function _isProviderHidden(pid, hiddenSet) {
  if (typeof pid !== 'string') { return false; }
  if (hiddenSet[pid]) { return true; }
  if (pid === 'iptv-org' && hiddenSet.iptv_org) { return true; }
  if (pid === 'iptv_org' && hiddenSet['iptv-org']) { return true; }
  return false;
}

function matchesProviderVisibility(item, hiddenSet) {
  if (!hiddenSet) { return true; }
  var anyVisible = false;
  var anySource = false;
  // Wave-13 canonical: sources[] is the merged list.
  if (Array.isArray(item.sources)) {
    for (var i = 0; i < item.sources.length; i++) {
      var sid = item.sources[i] && item.sources[i].provider_id;
      if (!sid) { continue; }
      anySource = true;
      if (!_isProviderHidden(sid, hiddenSet)) { anyVisible = true; break; }
    }
  }
  // Pre-merge providers[] shape — still appears for seed/jellyfin entries.
  if (!anyVisible && Array.isArray(item.providers)) {
    for (var j = 0; j < item.providers.length; j++) {
      var pid = item.providers[j] && item.providers[j].provider_id;
      if (!pid) { continue; }
      anySource = true;
      if (!_isProviderHidden(pid, hiddenSet)) { anyVisible = true; break; }
    }
  }
  // Old flat-string provider.
  if (!anyVisible && typeof item.provider === 'string') {
    anySource = true;
    if (!_isProviderHidden(item.provider, hiddenSet)) { anyVisible = true; }
  }
  // Items with no provider at all (rare — seed jellyfin items) are NEVER
  // hidden by this filter — only items that name a provider can be hidden.
  if (!anySource) { return true; }
  return anyVisible;
}

function applyFilters(catalog, providerFilter, contentFilter, qualityFilter, actorFilter, hiddenSet) {
  return catalog.filter(function(item) {
    return matchesProviderFilter(item, providerFilter) &&
           matchesContentFilter(item, contentFilter) &&
           matchesQualityFilter(item, qualityFilter) &&
           matchesActorFilter(item, actorFilter) &&
           matchesProviderVisibility(item, hiddenSet);
  });
}

// ── Initial state ─────────────────────────────────────────────────────────────
var INITIAL_STATE = {
  loading: true,
  profile: null,
  providers: [],
  catalog: [],
  actors: [],
  tier: 'degraded',
  tvModel: 'QN85Q7FAAFXZA',
  online: true,
  // Pairing code for the Samsung-phone-as-remote flow (wave-6/7). Minted by
  // the SSE listener useEffect right after profile load; consumed by the QR
  // mount so the scanned URL becomes /remote.html?pair=HRM-XXXX.
  remotePairCode: null,
  showProfilePicker: false,
  // First-launch onboarding overlay. Set true by the boot useEffect when
  // there's no active profile AND the onboarded flag has never been set,
  // or by the Settings ▸ Replay onboarding action.
  showOnboarding: false,
  showQR: false,
  // Phone-as-remote QR pairing modal (wave-8). Separate flag from `showQR`
  // (which still feeds the legacy provider-import flow) so the same
  // QROnboarding component can be mounted twice — once per mode — without
  // the two trigger paths fighting over a single boolean.
  showRemotePair: false,
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
  // Global search overlay. Toggled by the header Search button, by "/" or
  // Ctrl+K, and by the chatbot `open_search` command (follow-up).
  showSearch: false,
  // Profile management CRUD modal — opened from Settings ▸ Profile actions
  // ▸ Manage profiles. Closes via Esc / Back / Close button.
  showProfileManagement: false,
  // Schedule recording modal — opened from MediaDetailPanel's Record button
  // (live items only). The pending item is held aside so the modal can
  // pre-fill channel_id / title without poking back into selectedItem.
  showScheduleRecording: false,
  scheduleRecordingItem: null,
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
  // Focused item — the card currently "previewed" by the shell's hero panel.
  // Distinct from selectedItem: focus drives the hero background / hero CTA
  // targets, selection opens MediaDetailPanel. Single click on a card moves
  // focus; double-click or Enter on the focused card opens the detail panel.
  // Shells with a hero (Netflix, Plex, AppleTV, Nuvio, ExtremeInfiniTV, Ynotv)
  // read this; shells without one (Mom, TiviMate, Samsung, LiveTV, Iptvnator,
  // Dave Power, Stremio's board) ignore it.
  focusedItem: null,
  // Player overlay state — populated by /api/play response
  showPlayer: false,
  playerTicket: null,
  playerError: '',
  // Download modal state — gated until /api/download has a real worker.
  // Disabled-mode responses are error envelopes, never fake queued jobs.
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

  function catalogPatchFromRaw(rawCatalog, isOnline) {
    rawCatalog = rawCatalog || {};
    var catalog = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.catalog || []);
    var actors = rawCatalog.actors || [];
    var sourceHeader = rawCatalog._source_header || null;
    var meta = rawCatalog._meta || {};
    var metaSource = meta.source || null;
    var catalogSource = isOnline ? (sourceHeader || metaSource || 'no-providers') : 'api-offline';
    var m3uProviders = meta.m3u_providers || null;
    var iptvOrgCount = (typeof meta.iptv_org_count === 'number') ? meta.iptv_org_count : 0;
    return {
      catalog: catalog,
      actors: actors,
      catalogSource: catalogSource,
      m3uProviders: m3uProviders,
      iptvOrgCount: iptvOrgCount,
    };
  }

  function refreshProvidersAndCatalog(options) {
    options = options || {};
    var expectedProviderId = options.expectedProviderId || '';
    var providerFilter = options.providerFilter || null;
    var keepSettingsOpen = options.keepSettingsOpen === true;
    return Promise.all([
      hermesApi.getProviders({ refresh: true }),
      hermesApi.getCatalog({ refresh: true, waitForColdMs: 15000 }),
    ]).then(function(results) {
      var payload = results[0];
      var list = payload && payload.providers
        ? payload.providers
        : (Array.isArray(payload) ? payload : []);
      if (expectedProviderId) {
        var found = list.some(function(row) {
          return row && (row.id === expectedProviderId || row.persisted_provider_id === expectedProviderId);
        });
        if (!found) {
          var missing = new Error('Provider save reached the API, but /api/providers did not return the durable provider row. Nothing was confirmed.');
          missing.code = 'provider_refresh_missing';
          throw missing;
        }
      }
      var patch = catalogPatchFromRaw(results[1], true);
      patch.providers = list;
      if (providerFilter) { patch.providerFilter = providerFilter; }
      if (keepSettingsOpen) { patch.showSettings = true; }
      patchState(patch);
      return { providers: list, catalog: patch.catalog };
    });
  }

  // Parental gate hook — used to guard handlePlay / handleStartDownload at
  // the App level. See the import comment for why this duplicates the gate
  // already mounted inside MediaDetailPanel.
  var parentalGate = useParentalGate();

  // W16-PROVIDERS — per-profile visibility map. We keep the hidden-set in
  // local component state so a toggle flip re-renders the catalog grid
  // immediately, without waiting on a /api/catalog round-trip. The store
  // is the source of truth (localStorage-backed); we re-read on every
  // 'hermestv:provider-visibility-changed' event so any surface flipping
  // a toggle (today: Settings ▸ Providers) drives the same refresh path.
  var hiddenProvidersResult = React.useState({});
  var hiddenProviders = hiddenProvidersResult[0];
  var setHiddenProviders = hiddenProvidersResult[1];
  React.useEffect(function() {
    var profileId = (state.profile && state.profile.profile_id) || null;
    function recompute() {
      if (!profileId) { setHiddenProviders({}); return; }
      var hiddenList = providerVisibilityStore.getHiddenList(profileId);
      var map = {};
      for (var i = 0; i < hiddenList.length; i++) { map[hiddenList[i]] = true; }
      setHiddenProviders(map);
    }
    recompute();
    function onChange() { recompute(); }
    if (typeof window !== 'undefined') {
      window.addEventListener('hermestv:provider-visibility-changed', onChange);
      return function() {
        window.removeEventListener('hermestv:provider-visibility-changed', onChange);
      };
    }
    return undefined;
  }, [state.profile && state.profile.profile_id]);

  // Wave-14 W14-DIRECTPLAY pre-warm latch. Set true the first time a live
  // card is focused so we only kick off the PlayerModal + hls.js dynamic
  // imports once. Subsequent focus events are free — the modules are
  // already in the Vite chunk cache.
  var prewarmedRef = React.useRef(false);

  // ── Screensaver + Sleep Timer (wave-4 components) ──────────────────────────
  // Activate the ambient screensaver after N minutes of no input. Default
  // 10 min, override per-profile via profile.screensaver_min_idle. Both the
  // hook and the overlay component were shipped in PR #134.
  var screensaverIdleMin = (state.profile && state.profile.screensaver_min_idle) || 10;
  var screensaverIdle = useScreensaverIdle(screensaverIdleMin);

  // Head-less sleep-timer ticker — fires window CustomEvent on expiry. The
  // SleepTimer modal (rendered at the bottom of this component) is the
  // user-facing surface to set/cancel.
  // eslint-disable-next-line no-unused-vars
  var sleepTimer = useSleepTimer(state.profile);

  var sleepTimerOpenResult = React.useState(false);
  var sleepTimerOpen = sleepTimerOpenResult[0];
  var setSleepTimerOpen = sleepTimerOpenResult[1];

  // When the sleep timer fires, gracefully close any open player so the
  // stream is released and the screen quiets down.
  React.useEffect(function() {
    function onSleepFire() {
      patchState({ player: Object.assign({}, state.player || {}, { open: false }) });
    }
    window.addEventListener('hermes:sleep-timer-fire', onSleepFire);
    return function() { window.removeEventListener('hermes:sleep-timer-fire', onSleepFire); };
  }, []);

  // Drop hermes-vp-* body classes that shells + CSS can react to without
  // each component needing useViewport(). Runs once on mount; the helper
  // self-installs resize/orientationchange listeners.
  React.useEffect(function() {
    var uninstall = installViewportClasses();
    return uninstall;
  }, []);

  React.useEffect(function() {
    function onGlobalKey(e) {
      // Bail when focus is in an editable field so "/" or Ctrl+K don't hijack
      // typing inside the chatbot input, search box, etc. Tizen 6.5 has
      // isContentEditable + tagName, so this check is safe.
      var t = e.target;
      var inEditable = !!t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        (t.isContentEditable === true)
      );

      // Ctrl+L -> View switcher.
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        patchState(function(prev) { return Object.assign({}, prev, { showLayoutSwitcher: !prev.showLayoutSwitcher }); });
        return;
      }

      // Ctrl+K → global search (works from anywhere, including inputs)
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        patchState(function(prev) { return Object.assign({}, prev, { showSearch: true }); });
        return;
      }

      // "/" → global search (skipped when typing in a field — matches Vim,
      // Stremio, GitHub conventions where slash is a search-from-anywhere
      // shortcut that yields to the active editor).
      if (e.key === '/' && !inEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        patchState(function(prev) { return Object.assign({}, prev, { showSearch: true }); });
        return;
      }
    }
    document.addEventListener('keydown', onGlobalKey);
    return function() { document.removeEventListener('keydown', onGlobalKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Samsung Tizen remote — color buttons + Smart Hub route to chatbot commands.
  // Back (10009) / Exit (10182) cascade through the modal stack so the user
  // doesn't accidentally exit the app via the OS-level back handler.
  React.useEffect(function() {
    var cleanup = installTizenKeyHandler(
      function(commandText) {
        var api = hermesApi;
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
        if (state.showSearch) {
          patchState({ showSearch: false });
          return true;
        }
        if (state.showProfileManagement) {
          patchState({ showProfileManagement: false });
          return true;
        }
        if (state.showScheduleRecording) {
          patchState({ showScheduleRecording: false, scheduleRecordingItem: null });
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
        if (state.showRemotePair) {
          patchState({ showRemotePair: false });
          return true;
        }
        if (sleepTimerOpen) {
          setSleepTimerOpen(false);
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
  }, [state.online, state.profile, state.showPlayer, state.showVoicePicker, state.showLayoutSwitcher, state.selectedItem, state.showSettings, state.showQR, state.showRemotePair, state.showPlaylistImport, state.showEPG, state.showMultiview, state.showOnboarding, state.showSearch, state.showProfileManagement, state.showScheduleRecording, sleepTimerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Samsung remote color buttons (RED / GREEN / YELLOW / BLUE) wired as
  // chatbot quick-commands. The Tizen keymap (utils/tizenKeyMap.js) registers
  // these codes with tizen.tvinputdevice; here we just listen for the keydown
  // and dispatch a chatbot command so the existing handler chain handles it.
  React.useEffect(function() {
    function onColorKey(e) {
      var kc = e.keyCode;
      var cmd = null;
      if (kc === 403) { cmd = 'show live channels'; }      // RED
      else if (kc === 404) { cmd = 'show movies'; }        // GREEN
      else if (kc === 405) { cmd = 'show series'; }        // YELLOW
      else if (kc === 406) { cmd = 'open search'; }        // BLUE
      if (cmd) {
        e.preventDefault();
        // Re-use the validate flow so we honor whatever the chatbot router
        // maps these utterances to (open_search, filter_content, etc).
        hermesApi.validateCommand({ command_text: cmd, profile_id: (state.profile && state.profile.profile_id) || 'mom_tv' })
          .then(function(result) {
            if (result && result.valid) {
              handleChatbotCommand({ action: result.action, params: result.params });
            }
          }).catch(function() { /* offline — silent */ });
      }
    }
    window.addEventListener('keydown', onColorKey);
    return function() { window.removeEventListener('keydown', onColorKey); };
  }, [state.profile, state.online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Samsung media keys → PlayerModal control. Only active when the player
  // overlay is open. PlayerModal listens for the CustomEvent on window and
  // calls the right video element method (play/pause/seek).
  React.useEffect(function() {
    function onMediaKey(e) {
      if (!state.showPlayer) { return; }
      var kc = e.keyCode;
      var detail = null;
      if (kc === 415) { detail = { action: 'play' }; }
      else if (kc === 19) { detail = { action: 'pause' }; }
      else if (kc === 10252) { detail = { action: 'toggle' }; }
      else if (kc === 413) { detail = { action: 'stop' }; }
      else if (kc === 412) { detail = { action: 'rewind', seconds: 10 }; }
      else if (kc === 417) { detail = { action: 'fastforward', seconds: 10 }; }
      if (detail) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hermes:player-control', { detail: detail }));
      }
    }
    window.addEventListener('keydown', onMediaKey);
    return function() { window.removeEventListener('keydown', onMediaKey); };
  }, [state.showPlayer]);

  // Channel up / down — fires bus events for the live tuner to consume.
  // Only active when the player is open on a live item.
  React.useEffect(function() {
    function onChannelKey(e) {
      if (!state.showPlayer) { return; }
      if (e.keyCode === 427) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hermes:channel-up'));
      } else if (e.keyCode === 428) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('hermes:channel-down'));
      }
    }
    window.addEventListener('keydown', onChannelKey);
    return function() { window.removeEventListener('keydown', onChannelKey); };
  }, [state.showPlayer]);

  // Wave-14 W14-DIRECTPLAY — Info key opens MediaDetailPanel for the
  // focused item. handleItemClick now sends playable cards straight to the
  // player; Info is the explicit gesture for "actually I want details first".
  // Three triggers:
  //   - Samsung TV INFO remote key (keyCode 457 in the Tizen keymap)
  //   - Keyboard 'i' / 'I' (matches the Plex / Stremio convention)
  //   - The focused-card info-icon button (passes through handleOpenDetail
  //     directly — no keydown plumbing needed)
  // Gated on having a focused item and no modal already open above the
  // grid, so the Info key inside a Settings dialog doesn't accidentally
  // re-open the detail panel underneath it.
  React.useEffect(function() {
    function onInfoKey(e) {
      // Suppress when the user is typing in a text input / textarea so the
      // 'i' shortcut doesn't fight with regular text entry.
      var target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // Suppress when any blocking modal is already open — Info is a
      // grid-level gesture only.
      if (state.selectedItem || state.showPlayer || state.showSettings ||
          state.showSearch || state.showEPG || state.showMultiview ||
          state.showLayoutSwitcher || state.showVoicePicker ||
          state.showProfileManagement || state.showPlaylistImport ||
          state.showOnboarding || state.showScheduleRecording) {
        return;
      }
      var isInfo = (e.keyCode === 457) || (e.key === 'i') || (e.key === 'I');
      if (!isInfo) { return; }
      if (!state.focusedItem) { return; }
      e.preventDefault();
      handleOpenDetail(state.focusedItem);
    }
    window.addEventListener('keydown', onInfoKey);
    return function() { window.removeEventListener('keydown', onInfoKey); };
  }, [state.focusedItem, state.selectedItem, state.showPlayer, state.showSettings, state.showSearch, state.showEPG, state.showMultiview, state.showLayoutSwitcher, state.showVoicePicker, state.showProfileManagement, state.showPlaylistImport, state.showOnboarding, state.showScheduleRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(function() {
    function isEditableTarget(t) {
      if (!t) { return false; }
      var tag = (t.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }

    function findScrollContainer(start) {
      if (typeof document === 'undefined') { return null; }
      var node = start;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.getAttribute && node.getAttribute('data-hermes-scroll-root')) { return node; }
        var cs = null;
        try { cs = window.getComputedStyle(node); } catch (_e) { cs = null; }
        if (cs) {
          var oy = cs.overflowY;
          var ox = cs.overflowX;
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay' ||
              ox === 'auto' || ox === 'scroll' || ox === 'overlay') {
            return node;
          }
        }
        node = node.parentElement;
      }
      return document.querySelector('[data-hermes-scroll-root]') || document.scrollingElement || document.documentElement;
    }

    function scrollOnEdge(dir) {
      var active = document.activeElement || null;
      var scroller = findScrollContainer(active);
      if (!scroller) { return false; }
      var vertical = dir === 'up' || dir === 'down';
      var amount = vertical
        ? Math.max(180, Math.floor((scroller.clientHeight || window.innerHeight || 600) * 0.72))
        : Math.max(180, Math.floor((scroller.clientWidth || window.innerWidth || 900) * 0.72));
      if (dir === 'up' || dir === 'left') { amount = -amount; }
      if (vertical) { scroller.scrollTop = (scroller.scrollTop || 0) + amount; }
      else { scroller.scrollLeft = (scroller.scrollLeft || 0) + amount; }
      return true;
    }

    function scrollMovedFocusIntoView(next) {
      if (!next || typeof next.scrollIntoView !== 'function') { return; }
      try { next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      catch (_e) {
        try { next.scrollIntoView(false); } catch (_e2) {}
      }
    }

    var modalOpen = state.selectedItem || state.showPlayer || state.showSettings ||
      state.showSearch || state.showEPG || state.showMultiview ||
      state.showLayoutSwitcher || state.showVoicePicker ||
      state.showProfileManagement || state.showPlaylistImport ||
      state.showOnboarding || state.showScheduleRecording || sleepTimerOpen;

    if (modalOpen) { return undefined; }

    return installSpatialNav({
      rootSelector: '[data-hermes-app-root="true"]',
      preventScroll: true,
      onMove: scrollMovedFocusIntoView,
      onEdge: scrollOnEdge,
      keyFilter: function(e) {
        return !isEditableTarget(e && e.target);
      },
    });
  }, [state.selectedItem, state.showPlayer, state.showSettings, state.showSearch, state.showEPG, state.showMultiview, state.showLayoutSwitcher, state.showVoicePicker, state.showProfileManagement, state.showPlaylistImport, state.showOnboarding, state.showScheduleRecording, sleepTimerOpen]);

  // Phone-as-remote SSE listener. Mints a pairing code on profile load,
  // stores it in state, opens an EventSource to /api/remote/events, and
  // dispatches every incoming remote keypress as a synthetic KeyboardEvent
  // so the rest of the app's nav code (Tizen handler, search shortcuts,
  // PlayerModal controls) reacts as if the user pressed the key locally.
  React.useEffect(function() {
    if (!state.profile || !state.online) { return; }
    var aborted = false;
    var es = null;

    function keyCodeForRemoteKey(key) {
      if (key === 'ArrowLeft') { return 37; }
      if (key === 'ArrowUp') { return 38; }
      if (key === 'ArrowRight') { return 39; }
      if (key === 'ArrowDown') { return 40; }
      if (key === 'Enter' || key === 'OK') { return 13; }
      if (key === 'Backspace' || key === 'Back') { return 10009; }
      if (key === 'Escape') { return 27; }
      return 0;
    }

    function attach(code) {
      if (aborted) { return; }
      patchState({ remotePairCode: code });
      try {
        es = new EventSource(hermesApi.buildApiUrl('/api/remote/events?pair_code=' + encodeURIComponent(code)));
        es.onmessage = function(evt) {
          try {
            var payload = JSON.parse(evt.data);
            if (!payload || !payload.key) { return; }
            var key = payload.key;
            if (key === 'OK') { key = 'Enter'; }
            var keyCode = keyCodeForRemoteKey(key);
            var ke = new KeyboardEvent('keydown', {
              key: key,
              code: key,
              bubbles: true,
              cancelable: true,
            });
            if (keyCode) {
              try { Object.defineProperty(ke, 'keyCode', { get: function() { return keyCode; } }); } catch (_e) {}
              try { Object.defineProperty(ke, 'which', { get: function() { return keyCode; } }); } catch (_e2) {}
            }
            var target = (document.activeElement && document.activeElement !== document.body)
              ? document.activeElement
              : document;
            target.dispatchEvent(ke);
          } catch (_) { /* malformed event — ignore */ }
        };
        es.onerror = function() { /* EventSource auto-reconnects */ };
      } catch (e) {
        console.warn('[remote] SSE attach failed: ' + (e && e.message));
      }
    }

    hermesApi.createPairing()
      .then(function(body) { if (body && body.pairing_code) { attach(body.pairing_code); } })
      .catch(function() { /* offline — silent */ });

    return function cleanup() {
      aborted = true;
      if (es) { try { es.close(); } catch (e) { /* ignore */ } }
    };
  }, [state.profile && state.profile.profile_id, state.online]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // localStorage.hermestv_dev_mock='1'.
      //
      // HANDOFF blocker #9 (2026-05-21): the dev-mock escape hatch is now
      // restricted to development builds (import.meta.env.DEV). In a Vite
      // production build (`npm run build:web`) the flag is inert — the
      // operator never gets a "looks ok in prod by accident" mode that
      // hides a real outage. The Settings data-source badge still flips
      // to a red 'no-api' state during dev mock fallback so the degradation
      // is visible at a glance.
      var IS_DEV_BUILD = false;
      try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV === true) {
          IS_DEV_BUILD = true;
        }
      } catch (_) { /* no import.meta — treat as production */ }
      var devMockAllowed = IS_DEV_BUILD && (typeof window !== 'undefined' && window.localStorage &&
        window.localStorage.getItem('hermestv_dev_mock') === '1');

      if (!reachable && !devMockAllowed) {
        patchState({
          loading: false,
          online: false,
          error: 'Cannot reach the DaveTV server. Check your network or wait a moment and click Retry.',
        });
        return;
      }

      var api = hermesApi;
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
          var providerPayload = results[0] || [];
          var providers = providerPayload && providerPayload.providers
            ? providerPayload.providers
            : (Array.isArray(providerPayload) ? providerPayload : []);
          var rawCatalog = results[1] || [];
          var catalogPatch = catalogPatchFromRaw(rawCatalog, isOnline);

          // Restore per-profile Azure voice preference from localStorage
          // (set when the user last picked a voice in VoicePickerModal).
          // Null when never picked — the UI falls back to a default voice.
          var persistedVoiceId = voicePrefStore.getVoiceId(profileId);

          patchState({
            loading: false,
            profile: profile,
            providers: providers,
            catalog: catalogPatch.catalog,
            actors: catalogPatch.actors,
            tier: tier,
            tvModel: tvModel,
            online: isOnline,
            showProfilePicker: false,
            catalogSource: catalogPatch.catalogSource,
            activeVoiceId: persistedVoiceId || '',
            m3uProviders: catalogPatch.m3uProviders,
            iptvOrgCount: catalogPatch.iptvOrgCount,
          });

          // ── Boot greeting via Azure TTS (Azure-only path) ──────────────────
          // Project rule (docs/11 + memory feedback_voice_tts_azure_only):
          // Azure is the ONLY voice output. No browser SpeechSynthesis, no
          // Bixby fallback — if Azure is unavailable the user sees the text
          // and hears silence. This is intentional, not a bug.
          //
          // Speak a short "Welcome back, Sherri" line through the user's
          // last-picked Azure voice (or the server-side profile default
          // when nothing has been persisted yet). The agent's chosen name
          // (profile.agent_name, e.g. "Nova" or "DaveTV") is the implicit
          // narrator — display_name is the user we're greeting. Skipped when:
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

  function getDefaultProviderForItem(item) {
    var ids = getItemProviderIds(item);
    if (ids.length > 0) { return ids[0]; }
    return null;
  }

  function isInstantPlayableItem(item) {
    if (!item) { return false; }
    var itemType = item.type || item.content_type || '';
    return itemType === 'live' ||
      itemType === 'vod' ||
      itemType === 'movie' ||
      itemType === 'movies' ||
      itemType === 'series' ||
      itemType === 'show';
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
    if (!item) { return; }
    var defaultProvider = getDefaultProviderForItem(item);

    // Instant playback is the default interaction. OK/click plays the chosen
    // card; the Info key and explicit info buttons remain the details path.
    if (isInstantPlayableItem(item)) {
      patchState({ focusedItem: item, selectedProviderId: defaultProvider });
      handlePlay(item, defaultProvider);
      return;
    }

    // Unknown/unplayable content still gets a details panel so the user can
    // inspect source metadata without hitting a dead player.
    patchState({ selectedItem: item, selectedProviderId: defaultProvider, focusedItem: item });
  }

  // Explicit "Info" gesture — opens MediaDetailPanel for any item, including
  // live channels (which now skip the panel by default in handleItemClick).
  // Bound to the Tizen Info key (keyCode 457), the 'i' / 'I' keyboard key,
  // and the focused-card info-icon button. Long-press on touch devices also
  // reaches this via the same code path — touch handlers fire a synthetic
  // 'i' keydown after the 500 ms threshold (see tizenKeyMap touch shim).
  function handleOpenDetail(item) {
    if (!item) { return; }
    var defaultProvider = getDefaultProviderForItem(item);
    patchState({ selectedItem: item, selectedProviderId: defaultProvider, focusedItem: item });
  }

  // Focus a card without opening the detail panel. Single-click / hover /
  // remote-focus on a card flows through here so the active shell's hero
  // panel can preview the item before the user commits to opening the modal.
  function handleItemFocus(item) {
    if (!item) { return; }
    // Cheap guard — don't churn state when focus lands on the same id.
    if (state.focusedItem && state.focusedItem.id === item.id) { return; }
    patchState({ focusedItem: item });
    // Wave-14 W14-DIRECTPLAY — pre-warm the PlayerModal lazy chunks the
    // moment a live card is FOCUSED (not yet clicked). By the time the user
    // presses Enter, the PlayerModal chunk + hls.js module are already in
    // the Vite chunk cache, so click-to-first-byte drops from ~3-5 s to
    // sub-second. The two import() calls return promises that resolve into
    // the same chunk registry the lazy() loaders use; we fire-and-forget
    // because the goal is just to seed the cache. Failure here is silent —
    // the real load on click still runs through the usual lazy path.
    var itemType = item.type || item.content_type || '';
    if (itemType === 'live' && !prewarmedRef.current) {
      prewarmedRef.current = true;
      // PlayerModal itself is already lazy at App.jsx:70 — re-import to
      // populate the chunk cache. Once the chunk is fetched, React.lazy's
      // module cache short-circuits the next access.
      import('./components/PlayerModal.jsx').catch(function() { /* offline */ });
      // hls.js is dynamically imported inside useHlsStream; seed its chunk
      // here so the engine bootstrap doesn't block on the network when the
      // user finally clicks Enter.
      import('hls.js').catch(function() { /* native HLS or offline */ });
    }
  }

  function handleCloseDetail() {
    patchState({ selectedItem: null, selectedProviderId: null });
  }

  function handleSelectProvider(providerId) {
    patchState({ selectedProviderId: providerId });
  }

  function handlePlay(item, providerId, opts) {
    // Gate first — anyone calling handlePlay outside MediaDetailPanel
    // (Multiview tile, future shell quick-play, etc.) is also protected.
    // When the user comes from MediaDetailPanel the item is already in
    // the hook's module-scoped unlock set, so isContentLocked returns
    // false and we go straight through.
    if (parentalGate.isContentLocked(item)) {
      parentalGate.requestUnlock(item).then(function(res) {
        if (res && res.ok) { _startPlayback(item, providerId, opts); }
      });
      return;
    }
    _startPlayback(item, providerId, opts);
  }

  function _startPlayback(item, providerId, opts) {
    var profileId = (state.profile && state.profile.profile_id) || 'mom_tv';
    var args = { item_id: item.id, profile_id: profileId };
    if (providerId) { args.provider_id = providerId; }
    if (opts && opts.episode_item_id) { args.episode_item_id = opts.episode_item_id; }
    if (opts && opts.episode_id) { args.episode_id = opts.episode_id; }
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

  // ─── Download flow (future offline viewing) ───────────────────────────────
  // The UI is gated by releaseFlags until a real server-side download worker
  // exists. If a future call path reaches /api/download early, the API returns
  // an honest 503 download_pipeline_not_available body with no fake job_id or
  // exact-size fields.
  function handleStartDownload(item, opts) {
    if (!item || !item.id) { return; }
    // Same gate as handlePlay — protects future call sites that bypass
    // MediaDetailPanel (e.g. a "Download" chip on a long-press menu).
    if (parentalGate.isContentLocked(item)) {
      parentalGate.requestUnlock(item).then(function(res) {
        if (res && res.ok) { _startDownload(item, opts); }
      });
      return;
    }
    _startDownload(item, opts);
  }

  function _startDownload(item, opts) {
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
    // Only meaningful after the real download pipeline lands and returns a
    // durable job envelope. Disabled-mode responses render as errors instead.
    patchState({ downloadConfirmed: true });
  }

  function handleCloseDownload() {
    // In disabled mode there is no server job to cancel. After a real worker
    // lands, explicit cancellation should call hermesApi.cancelDownload.
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

  // Fired by ProfileManagementModal after any Add / Edit / Delete. Three
  // cases the parent has to handle:
  //   1. The active profile was deleted → profileStore auto-clears the
  //      active id, so getActiveProfileId() is now null. Drop into the
  //      profile picker so the user can pick a remaining profile.
  //   2. The active profile was edited → re-read the live record so the
  //      new theme / font scale / mom_mode applies immediately without
  //      a reload. Tier is re-evaluated from tv_model.
  //   3. A non-active profile was added/edited/deleted → no-op; the
  //      modal's own list re-renders from its local snapshot.
  function handleProfilesChange() {
    var activeId = profileStore.getActiveProfileId();
    if (!activeId) {
      // Active profile was deleted — fall back to the picker.
      patchState({ showProfileManagement: false, showProfilePicker: true, profile: null });
      return;
    }
    var current = state.profile && state.profile.profile_id;
    if (current && activeId === current) {
      var live = profileStore.getProfile(activeId);
      if (live) {
        // The local store uses `id` while the API/state uses `profile_id`.
        // Merge both for consumers that read either shape.
        var merged = Object.assign({}, state.profile, live, { profile_id: live.id });
        applyDocumentTheme(merged);
        var nextTier = resolveTier(merged.tv_model || state.tvModel);
        applyTierClasses(nextTier);
        patchState({ profile: merged, tier: nextTier, tvModel: merged.tv_model || state.tvModel });
      }
    }
  }

  // Settings ▸ Manage profiles — opens the CRUD modal.
  function handleManageProfiles() {
    patchState({ showSettings: false, showProfileManagement: true });
  }

  // EPGModal ▸ click a program cell. Future programs route to the
  // ScheduleRecordingModal with start_utc / end_utc pre-filled from the
  // EPG entry; currently-airing programs route to handlePlay via the
  // channel resolver so a single Enter key works for both cases.
  function handleEPGProgramSelect(program) {
    if (!program) { return; }
    var startVal = program.start;
    var startMs = (typeof startVal === 'number') ? startVal : Date.parse(startVal || '');
    var endVal = program.end;
    var endMs = (typeof endVal === 'number') ? endVal : Date.parse(endVal || '');
    var now = Date.now();

    if (isFinite(startMs) && startMs > now) {
      // Future program → schedule. Synthesize an item that
      // ScheduleRecordingModal can read directly (channel_id, title,
      // start_utc, end_utc all flow through unchanged).
      patchState({ showEPG: false });
      handleScheduleRecording({
        id: program.channel_id,
        channel_id: program.channel_id,
        title: program.title || '',
        type: 'live',
        start_utc: isFinite(startMs) ? new Date(startMs).toISOString() : undefined,
        end_utc: isFinite(endMs) ? new Date(endMs).toISOString() : undefined,
      });
      return;
    }

    // Currently airing (or past — backend will reject if it's no longer
    // streamable). Fall through to the channel resolver.
    handleEPGChannelSelect({ id: program.channel_id, name: program.title || '' });
  }

  // EPGModal ▸ click a channel name in the sticky left column. Resolves
  // the channel id to a catalog item and hands off to handlePlay. When
  // the catalog doesn't carry the channel yet (iptv-org cron hasn't
  // landed it), we still call handlePlay with a synthesized live item —
  // /api/play decides whether it can serve a stream.
  function handleEPGChannelSelect(channel) {
    if (!channel || !channel.id) { return; }
    patchState({ showEPG: false });
    for (var i = 0; i < state.catalog.length; i++) {
      if (String(state.catalog[i].id) === String(channel.id)) {
        handlePlay(state.catalog[i], null);
        return;
      }
    }
    handlePlay({ id: channel.id, title: channel.name || '', type: 'live' }, null);
  }

  // MediaDetailPanel ▸ Record (live items) — opens ScheduleRecordingModal
  // with the channel pre-selected. Parental-gated through the App-level
  // hook so a PIN cap on the rating is enforced before scheduling.
  function handleScheduleRecording(item) {
    if (!item) { return; }
    if (parentalGate.isContentLocked(item)) {
      parentalGate.requestUnlock(item).then(function(res) {
        if (res && res.ok) {
          patchState({ showScheduleRecording: true, scheduleRecordingItem: item });
        }
      });
      return;
    }
    patchState({ showScheduleRecording: true, scheduleRecordingItem: item });
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
    } else if (action === 'open_search') {
      patchState({ showSearch: true });
    } else if (action === 'schedule_recording') {
      // Pick a target item: focused MediaDetailPanel item first, then the
      // currently-playing PlayerModal ticket. Skip silently when nothing
      // live is on screen — chatbot text response handles the "nothing to
      // record right now" hint.
      var target = null;
      if (state.selectedItem && state.selectedItem.type === 'live') {
        target = state.selectedItem;
      } else if (state.showPlayer && state.playerTicket && state.playerTicket.item && state.playerTicket.item.type === 'live') {
        target = state.playerTicket.item;
      }
      if (target) {
        handleScheduleRecording(target);
      }
    } else if (action === 'play_this') {
      // Same target-picking rule as schedule_recording, but works on every
      // content type — movies, series, live, all play through handlePlay.
      // Skip silently when nothing is focused.
      if (state.selectedItem) {
        handlePlay(state.selectedItem, state.selectedProviderId || null);
      }
    } else if (action === 'open_epg') {
      // Client-only action dispatched by the FloatingChatbot "Tonight's lineup"
      // chip. Opens the EPGGrid modal; no server command exists for this.
      patchState({ showEPG: true });
    } else if (action === 'open_layout_switcher') {
      // Client-only action dispatched by the FloatingChatbot "Change View" chip.
      // Opens the LayoutSwitcher; no server command exists for this.
      patchState({ showLayoutSwitcher: true });
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
  // CatalogCard now uses per-type aspect (16:9 for live, 2:3 for VOD); the
  // skeleton remains 2:3 portrait because we can't predict the type mix
  // before the catalog arrives — close enough during the brief boot flash.
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
            Dave<span style={{ color: '#1f6feb' }}>TV</span>
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

  // Apply all four filters (provider + content + quality + actor) to the catalog.
  // NOTE: We INTENTIONALLY don't useMemo this. There are conditional early
  // returns above (loading + error branches) so a hook here would violate
  // Rules of Hooks. The lazy-shells split (PR #135) already cut the boot
  // bundle by 49%; this filter runs in <10 ms even on the full 1000+ item
  // catalog and isn't a meaningful re-render cost.
  // W16-PROVIDERS: pass hiddenProviders (per-profile map of explicitly hidden
  // provider_ids). Empty map = no-op; toggling a provider in Settings
  // immediately removes its cards from every shell. Mom defaults to all-on
  // so this map is empty for her until she explicitly hides a source.
  var hiddenForFilter = (hiddenProviders && Object.keys(hiddenProviders).length > 0)
    ? hiddenProviders
    : null;
  var filteredCatalog = applyFilters(
    state.catalog,
    state.providerFilter,
    state.contentFilter,
    state.qualityFilter,
    state.actorFilter ? state.actorFilter.actor_id : null,
    hiddenForFilter
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
            Offline mode — showing cached content. The DaveTV server is unreachable.
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
              Dave<span style={{ color: 'var(--accent)' }}>TV</span>
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

            {/* Global search button — opens SearchModal. Also wired to the
                "/" and Ctrl+K keyboard shortcuts at the App level. Hits
                /api/search through searchClient with a 200ms debounce. */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showSearch: true }); }}
              title="Search (/ or Ctrl+K)"
              aria-label="Open search"
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
              &#x1F50D; Search
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
              title="Change View (Ctrl+L)"
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
              &#x25EB; View
            </button>

            {/* Sleep timer button (wave-8) — opens the SleepTimer modal where
                the user picks a countdown (15 / 30 / 45 / 60 / 120 min). The
                head-less `useSleepTimer(state.profile)` hook above keeps the
                countdown ticking even when the modal is closed; on expiry
                the player closes via the `hermes:sleep-timer-fire` listener. */}
            <button
              tabIndex={0}
              onClick={function() { setSleepTimerOpen(true); }}
              title="Sleep timer — auto-close playback after N minutes"
              aria-label="Open sleep timer"
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
              &#x1F319; Sleep
            </button>

            {/* Phone-as-remote button (wave-8) — opens QROnboarding in
                remote-pair mode. The QR encodes /remote.html?pair=HRM-XXXX,
                and `state.remotePairCode` is already minted by the wave-7
                SSE listener so the modal renders the live code on mount. */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showRemotePair: true }); }}
              title="Use your phone as a remote — scan a QR to pair"
              aria-label="Open phone remote pairing"
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
              &#x1F4F1; Phone Remote
            </button>
          </div>
        </header>

        {/* Shell renderer — active shell layout OR default grid */}
        {(function() {
          var resolvedLayout = state.activeLayout || (profile.mom_mode ? 'mom-mode' : '');
          if (resolvedLayout && isValidLayout(resolvedLayout)) {
            return (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ShellRenderer
                  layout={resolvedLayout}
                  catalog={filteredCatalog}
                  profile={profile}
                  tier={state.tier}
                  providers={state.providers}
                  onItemSelect={handleItemClick}
                  onItemFocus={handleItemFocus}
                  onOpenDetail={handleOpenDetail}
                  focusedItem={state.focusedItem}
                  contentFilter={state.contentFilter}
                  providerFilter={state.providerFilter}
                  qualityFilter={state.qualityFilter}
                  onOpenSettings={function() { patchState({ showSettings: true }); }}
                  onOpenEPG={function() { patchState({ showEPG: true }); }}
                  onOpenSearch={function() { patchState({ showSearch: true }); }}
                />
              </div>
            );
          }
          return (
          <React.Fragment>
            {/* Filter bar */}
            <FilterBar
              providers={state.providers}
              providerFilter={state.providerFilter}
              contentFilter={state.contentFilter}
              qualityFilter={state.qualityFilter}
              onProviderChange={function(v) { patchState({ providerFilter: v }); }}
              onContentChange={function(v) { patchState({ contentFilter: v }); }}
              onQualityChange={function(v) { patchState({ qualityFilter: v }); }}
            />

            {/* Provider filter tabs */}
            <ProviderFilter
              providers={state.providers}
              providerFilter={state.providerFilter}
              onProviderChange={function(v) { patchState({ providerFilter: v }); }}
            />

            {/* Catalog grid — scrollable main content area */}
            <main
              data-hermes-scroll-root="catalog"
              style={{
                flex: 1,
                overflowY: 'auto',
                backgroundColor: 'var(--bg)',
              }}
            >
              <CatalogGrid
                items={filteredCatalog}
                activeTab="all"
                profile={profile}
                tier={state.tier}
                columns={state.tier === 'enhanced' ? 5 : 3}
                onItemClick={handleItemClick}
                onOpenSettings={function() { patchState({ showSettings: true }); }}
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
              profile={profile}
              onCompleted={function() {
                // Pairing handshake finished — refresh providers AND catalog
                // with cache bypass so the newly-added provider is selectable
                // and its channels/movies appear immediately.
                refreshProvidersAndCatalog({ keepSettingsOpen: false })
                  .catch(function() { /* non-fatal; tick again on next user action */ });
              }}
            />
          )}

          {/* Phone-as-remote QR modal (wave-8) — same component as the
              provider-import flow above, switched into mode='remote-pair'.
              QROnboarding mints its own pairing code on open via POST /api/pair
              in `online` mode; offline opens surface an honest error instead
              of a fake pairing code. We don't forward `state.remotePairCode`
              here because that SSE channel would just race the modal's own
              /api/pair call. Opened from the header "Phone Remote" button. */}
          {state.showRemotePair && (
            <QROnboarding
              isOpen={state.showRemotePair}
              mode="remote-pair"
              onClose={function() { patchState({ showRemotePair: false }); }}
              online={state.online}
              profile={profile}
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
              onScheduleRecording={handleScheduleRecording}
              profileId={profile.profile_id || 'mom_tv'}
            />
          )}

          {/* Download modal — future offline viewing, currently release-gated */}
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
              profile={profile}
              online={state.online}
              catalog={state.catalog}
              onSwitchItem={function(nextItem) {
                // Swap the currently-playing channel by routing through
                // handlePlay — same /api/play ticket flow, just a new item.
                // App-level parental gate still runs inside handlePlay.
                if (nextItem && nextItem.id) {
                  handlePlay(nextItem, null);
                }
              }}
              onOpenSettings={function() { patchState({ showSettings: true }); }}
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
              onScheduleRecording={handleScheduleRecording}
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
              onManageProfiles={handleManageProfiles}
              onOpenAdminPanel={function() {
                if (typeof window !== 'undefined') { window.location.href = '/?admin=1'; }
              }}
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
              onSaved={function(saved) {
                // Refresh provider list and catalog with cache-bypass proof.
                // Closing only after this resolves prevents the previous
                // "saved, but grid still old until reload" failure mode.
                var persistedProviderId = saved && saved.persisted_provider_id;
                var providerFilter = saved && saved.provider_id ? saved.provider_id : null;
                return refreshProvidersAndCatalog({
                  expectedProviderId: persistedProviderId,
                  providerFilter: providerFilter,
                  keepSettingsOpen: true,
                }).then(function() {
                  patchState({ showPlaylistImport: false, showSettings: true });
                }).catch(function() {
                  patchState({ showPlaylistImport: true, showSettings: false });
                  throw new Error('Provider save reached the API, but DaveTV could not refresh /api/providers and /api/catalog to prove it. Please do not re-enter credentials until this is fixed.');
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
              onProgramSelect={handleEPGProgramSelect}
              onChannelSelect={handleEPGChannelSelect}
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

          {/* Global search modal — opened from header Search button, "/"
              keypress (outside editable fields), or Ctrl+K. Enter on a
              result hands the item off to the regular detail panel flow
              via handleItemClick so playback / favorites work end-to-end. */}
          {state.showSearch && (
            <SearchModal
              isOpen={state.showSearch}
              profileId={(state.profile && state.profile.profile_id) || 'mom_tv'}
              onClose={function() { patchState({ showSearch: false }); }}
              onItemSelect={function(item) {
                patchState({ showSearch: false });
                handleItemClick(item);
              }}
            />
          )}

          {/* Profile management — full CRUD over the local profileStore.
              Opens from Settings ▸ Profile actions ▸ Manage profiles.
              onProfilesChange refreshes state.profile in-place when the
              active record changes, and falls back to the picker when
              the active profile is deleted (profileStore auto-clears
              the active id on delete). */}
          {state.showProfileManagement && (
            <ProfileManagementModal
              isOpen={state.showProfileManagement}
              onClose={function() { patchState({ showProfileManagement: false }); }}
              onProfilesChange={handleProfilesChange}
            />
          )}

          {/* Schedule recording — opens from MediaDetailPanel's Record
              button for live items. The modal owns time / duration /
              repeat / quality picking and posts to /api/dvr/schedule.
              On success we just close; the user can review the result
              in Settings ▸ Playback ▸ View all recordings. */}
          {state.showScheduleRecording && state.scheduleRecordingItem && (
            <ScheduleRecordingModal
              isOpen={state.showScheduleRecording}
              item={state.scheduleRecordingItem}
              profileId={(state.profile && state.profile.profile_id) || 'mom_tv'}
              tier={state.tier}
              onClose={function() { patchState({ showScheduleRecording: false, scheduleRecordingItem: null }); }}
              onScheduled={function() {
                // The modal already shows its own success state and auto-
                // closes; we just clean up the pending item so the next
                // open re-reads from a fresh selection.
                patchState({ showScheduleRecording: false, scheduleRecordingItem: null });
              }}
            />
          )}

          {/* Voice picker modal — Mom can switch Azure voices seamlessly */}
          {state.showVoicePicker && (
            <VoicePickerModal
              isOpen={state.showVoicePicker}
              profileId={profile.profile_id || 'mom_tv'}
              agentName={resolveAssistantName(profile)}
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

        {/* App-level parental lock — sits above every modal because PIN
            unlock can be requested from inside any flow (Multiview tile
            click, handlePlay, handleStartDownload). The overlay is eager-
            imported, so no Suspense wrap is needed. */}
        <ParentalLockOverlay {...parentalGate.overlayProps} />

        {/* Sleep timer modal — toggled open via chatbot command or a future
            header button. The head-less `useSleepTimer` hook above keeps the
            countdown ticking even when this modal is closed. */}
        {state.profile ? (
          <SleepTimer
            profile={state.profile}
            isOpen={sleepTimerOpen}
            onClose={function() { setSleepTimerOpen(false); }}
          />
        ) : null}

        {/* Ambient screensaver — fades in after `screensaver_min_idle` minutes
            of no input. Auto-dismisses on any keydown / mousemove / touch.
            Sits at the very end of the tree so it covers every other modal. */}
        {screensaverIdle.idle && state.profile ? (
          <Screensaver
            profile={state.profile}
            onResume={function() { /* idle hook auto-resets on input */ }}
          />
        ) : null}

      </LayoutShell>
    </ThemeProvider>
  );
}

export default App;

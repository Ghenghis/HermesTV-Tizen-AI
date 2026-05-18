import React from 'react';
import * as profileStore from './store/profileStore.js';
import * as hermesApi from './api/hermesApi.js';
import * as mockApi from './api/mockApi.js';
import ThemeProvider from './components/ThemeProvider.jsx';
import LayoutShell from './components/LayoutShell.jsx';
import ProfilePicker from './components/ProfilePicker.jsx';
import ProviderFilter from './components/ProviderFilter.jsx';
import CatalogGrid from './components/CatalogGrid.jsx';
import FloatingChatbot from './components/FloatingChatbot.jsx';
import QROnboarding from './components/QROnboarding.jsx';
import MediaDetailPanel from './components/MediaDetailPanel.jsx';
import StreamingQualityBar from './components/StreamingQualityBar.jsx';
import ShellRenderer from './engine/ShellRenderer.jsx';
import LayoutSwitcher from './components/LayoutSwitcher.jsx';
import VoicePickerModal from './components/VoicePickerModal.jsx';

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
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
    padding: '0.4rem 0.75rem',
    cursor: 'pointer',
    outline: 'none',
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
    borderRadius: '3px',
    padding: '0.1rem 0.4rem',
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
          borderRadius: '5px',
          color: 'var(--text)',
          fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          padding: '0.25rem 0.5rem',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="QN85Q7FAAFXZA">QN85Q7FAAFXZA</option>
        <option value="UN55CU8000BXZA">UN55CU8000BXZA</option>
        <option value="custom">Custom</option>
      </select>
      <span style={tierBadgeStyle}>
        {tier === 'enhanced' ? 'ENHANCED' : 'DEGRADED'}
      </span>
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

function applyFilters(catalog, providerFilter, contentFilter, qualityFilter) {
  return catalog.filter(function(item) {
    return matchesProviderFilter(item, providerFilter) &&
           matchesContentFilter(item, contentFilter) &&
           matchesQualityFilter(item, qualityFilter);
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
  showQR: false,
  showSettings: false,
  error: null,
  // Filters
  providerFilter: 'all',
  contentFilter: 'all',
  qualityFilter: 'all',
  activeLayout: '',
  showLayoutSwitcher: false,
  showVoicePicker: false,
  activeVoiceId: '',
  // Selected item for detail panel
  selectedItem: null,
  selectedProviderId: null,
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

  // Boot sequence — runs once on mount
  React.useEffect(function() {
    var profileId = profileStore.getActiveProfileId();

    if (!profileId) {
      patchState({ loading: false, showProfilePicker: true });
      return;
    }

    bootWithProfileId(profileId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function bootWithProfileId(profileId) {
    patchState({ loading: true, showProfilePicker: false, error: null });

    hermesApi.isReachable().then(function(reachable) {
      var api = reachable ? hermesApi : mockApi;
      var isOnline = reachable;

      return api.getProfile(profileId).then(function(profile) {
        var tvModel = profile.tv_model || state.tvModel;
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
          });
        });
      }).catch(function(profileErr) {
        // Profile fetch failed — try mock fallback even if we thought we were online
        if (isOnline) {
          return mockApi.getProfile(profileId).then(function(profile) {
            var tvModel = profile.tv_model || state.tvModel;
            var tier = resolveTier(tvModel);
            applyDocumentTheme(profile);
            applyTierClasses(tier);

            return Promise.all([
              mockApi.getProviders(),
              mockApi.getCatalog(),
            ]).then(function(results) {
              var providers = results[0] || [];
              var rawCatalog = results[1] || [];
              var catalog = Array.isArray(rawCatalog) ? rawCatalog : (rawCatalog.catalog || []);
              var actors = rawCatalog.actors || [];

              patchState({
                loading: false,
                profile: profile,
                providers: providers,
                catalog: catalog,
                actors: actors,
                tier: tier,
                tvModel: tvModel,
                online: false,
                showProfilePicker: false,
              });
            });
          }).catch(function(mockErr) {
            patchState({
              loading: false,
              error: 'Failed to load profile: ' + (mockErr.message || 'unknown error'),
            });
          });
        }

        patchState({
          loading: false,
          error: 'Failed to load profile: ' + (profileErr.message || 'unknown error'),
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
      patchState({ providerFilter: 'all', contentFilter: 'all', qualityFilter: 'all' });
    }
    // show_detail and find_similar_actor: no state mutation needed (chatbot response text handles UX)
  }

  function handleLayoutChange(layoutId) {
    patchState({ activeLayout: layoutId || '', showLayoutSwitcher: false });
    if (layoutId) {
      applyThemeByName(layoutId);
    }
  }

  // ── Profile picker ──
  if (state.showProfilePicker) {
    return <ProfilePicker onSelect={handleProfileSelect} />;
  }

  // ── Loading spinner ──
  if (state.loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0d1117',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          color: '#e6edf3',
        }}
      >
        {/* Spinner ring */}
        <div
          style={{
            width: '56px',
            height: '56px',
            border: '4px solid #30363d',
            borderTopColor: '#1f6feb',
            borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: '1.5rem', fontWeight: '600', letterSpacing: '0.05em' }}>
          Hermes<span style={{ color: '#1f6feb' }}>TV</span>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#8b949e' }}>Loading your profile...</div>
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
        <p style={{ margin: 0, color: '#8b949e', fontSize: '0.875rem' }}>{state.error}</p>
        <button
          tabIndex={0}
          onClick={function() {
            profileStore.clearActiveProfileId();
            patchState(Object.assign({}, INITIAL_STATE, { loading: false, showProfilePicker: true }));
          }}
          style={{
            marginTop: '1rem',
            padding: '0.6rem 1.5rem',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            color: '#e6edf3',
            cursor: 'pointer',
            fontSize: '1rem',
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid #1f6feb'; e.currentTarget.style.outlineOffset = '2px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >
          Switch Profile
        </button>
      </div>
    );
  }

  var profile = state.profile || {};

  // Apply all three filters to the catalog
  var filteredCatalog = applyFilters(
    state.catalog,
    state.providerFilter,
    state.contentFilter,
    state.qualityFilter
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
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: '3px',
                  padding: '0.1rem 0.4rem',
                  letterSpacing: '0.05em',
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
                borderRadius: '6px',
                color: 'var(--muted)',
                fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.15s, color 0.15s',
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
                padding: '0.35rem 0.6rem',
                backgroundColor: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: '6px',
                color: 'var(--muted)',
                fontSize: '1.1rem',
                cursor: 'pointer',
                outline: 'none',
                lineHeight: '1',
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

            {/* Layout switcher button */}
            <button
              tabIndex={0}
              onClick={function() { patchState({ showLayoutSwitcher: true }); }}
              title="Change visual layout (Ctrl+L)"
              style={{
                padding: '0.35rem 0.75rem',
                backgroundColor: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                color: '#000',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                fontWeight: '700',
                cursor: 'pointer',
                outline: 'none',
                letterSpacing: '0.03em',
                flexShrink: 0,
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
        {state.activeLayout && ['tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen', 'mom-mode', 'dave-power'].indexOf(state.activeLayout) !== -1 ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ShellRenderer
              layout={state.activeLayout}
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
        ) : (
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
        )}

        {/* Floating chatbot */}
        <FloatingChatbot profile={profile} online={state.online} onCommand={handleChatbotCommand} />

        {/* QR onboarding modal */}
        <QROnboarding isOpen={state.showQR} onClose={handleCloseQR} />

        {/* Media detail panel — full-screen overlay */}
        {state.selectedItem && (
          <MediaDetailPanel
            item={state.selectedItem}
            actors={state.actors}
            onClose={handleCloseDetail}
            onSelectProvider={handleSelectProvider}
            selectedProviderId={state.selectedProviderId}
            globalProviders={state.providers}
          />
        )}

        {/* Settings overlay */}
        {state.showSettings && (
          <div
            onClick={function(e) {
              if (e.target === e.currentTarget) { patchState({ showSettings: false }); }
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 40,
              backgroundColor: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
            }}
          >
            <div
              style={{
                marginTop: '3.5rem',
                marginRight: '1rem',
                width: '300px',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border, #30363d)',
                borderRadius: '10px',
                padding: '1.25rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                color: 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '700', fontSize: 'calc(0.95rem * var(--font-scale, 1))' }}>
                  Settings
                </span>
                <button
                  tabIndex={0}
                  autoFocus
                  onClick={function() { patchState({ showSettings: false }); }}
                  aria-label="Close settings"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    outline: 'none',
                    padding: '0.1rem 0.3rem',
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.outline = '2px solid var(--accent)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.outline = 'none';
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Info rows */}
              <div style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Profile</span>
                  <span style={{ fontWeight: '600' }}>{profile.display_name || profile.profile_id || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>TV Model</span>
                  <span style={{ fontWeight: '600' }}>{state.tvModel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Tier</span>
                  <span
                    style={{
                      fontWeight: '700',
                      color: state.tier === 'enhanced' ? '#FFD700' : 'var(--muted)',
                    }}
                  >
                    {state.tier === 'enhanced' ? 'Enhanced' : 'Degraded'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Phase</span>
                  <span
                    style={{
                      fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                      fontWeight: '700',
                      color: '#e3b341',
                      border: '1px solid #e3b341',
                      borderRadius: '3px',
                      padding: '0.1rem 0.35rem',
                      backgroundColor: 'rgba(227,179,65,0.08)',
                    }}
                  >
                    B2 — Mock Mode
                  </span>
                </div>
              </div>

              {/* Change voice button */}
              <button
                tabIndex={0}
                onClick={function() { patchState({ showSettings: false, showVoicePicker: true }); }}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--accent)',
                  borderRadius: '6px',
                  color: 'var(--accent)',
                  fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid var(--accent)';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                &#x1F509; Change Voice
              </button>

              {/* Change layout button */}
              <button
                tabIndex={0}
                onClick={function() { patchState({ showSettings: false, showLayoutSwitcher: true }); }}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#000',
                  fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid var(--accent)';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                &#x1F3A8; Change Layout
              </button>

              {/* Reset button */}
              <button
                tabIndex={0}
                onClick={handleResetDefaults}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid var(--accent)';
                  e.currentTarget.style.outlineOffset = '2px';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* Layout switcher modal */}
        <LayoutSwitcher
          isOpen={state.showLayoutSwitcher}
          activeLayout={state.activeLayout}
          tier={state.tier}
          onSelect={handleLayoutChange}
          onClose={function() { patchState({ showLayoutSwitcher: false }); }}
        />

        {/* Voice picker modal — Mom can switch Azure voices seamlessly */}
        <VoicePickerModal
          isOpen={state.showVoicePicker}
          profileId={profile.profile_id || 'mom_tv'}
          currentVoiceId={state.activeVoiceId}
          onClose={function() { patchState({ showVoicePicker: false }); }}
          onVoiceChange={function(voiceId) { patchState({ activeVoiceId: voiceId }); }}
        />

      </LayoutShell>
    </ThemeProvider>
  );
}

export default App;

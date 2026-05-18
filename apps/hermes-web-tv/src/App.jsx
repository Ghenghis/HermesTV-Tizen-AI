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

// Determine tier from TV model prefix
function resolveTier(tvModel) {
  if (!tvModel) { return 'baseline'; }
  var upper = tvModel.toUpperCase();
  if (upper.indexOf('QN') === 0) { return 'enhanced'; }
  return 'baseline';
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

var INITIAL_STATE = {
  loading: true,
  profile: null,
  providers: [],
  catalog: [],
  activeTab: 'all',
  tier: 'baseline',
  online: true,
  showProfilePicker: false,
  showQR: false,
  error: null,
};

function App() {
  var stateResult = React.useState(INITIAL_STATE);
  var state = stateResult[0];
  var setState = stateResult[1];

  function patchState(patch) {
    setState(function(prev) {
      return Object.assign({}, prev, patch);
    });
  }

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
        var tier = resolveTier(profile.tv_model || '');
        applyDocumentTheme(profile);

        return Promise.all([
          api.getProviders(),
          api.getCatalog(),
        ]).then(function(results) {
          var providers = results[0] || [];
          var catalog = results[1] || [];

          patchState({
            loading: false,
            profile: profile,
            providers: providers,
            catalog: catalog,
            tier: tier,
            online: isOnline,
            showProfilePicker: false,
          });
        });
      }).catch(function(profileErr) {
        // Profile fetch failed — try mock fallback even if we thought we were online
        if (isOnline) {
          return mockApi.getProfile(profileId).then(function(profile) {
            var tier = resolveTier(profile.tv_model || '');
            applyDocumentTheme(profile);

            return Promise.all([
              mockApi.getProviders(),
              mockApi.getCatalog(),
            ]).then(function(results) {
              var providers = results[0] || [];
              var catalog = results[1] || [];

              patchState({
                loading: false,
                profile: profile,
                providers: providers,
                catalog: catalog,
                tier: tier,
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          </div>
        </header>

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
            items={state.catalog}
            activeTab={state.activeTab}
            profile={profile}
          />
        </main>

        {/* Floating chatbot */}
        <FloatingChatbot profile={profile} online={state.online} />

        {/* QR onboarding modal */}
        <QROnboarding isOpen={state.showQR} onClose={handleCloseQR} />

      </LayoutShell>
    </ThemeProvider>
  );
}

export default App;

import React from 'react';

var TABS = [
  { id: 'all', label: 'All' },
  { id: 'apollo', label: 'Apollo' },
  { id: 'xtremehd', label: 'XtremeHD' },
];

function ProviderFilter(props) {
  var activeTab = props.activeTab || 'all';
  var onTabChange = props.onTabChange;

  function handleClick(tabId) {
    if (onTabChange) {
      onTabChange(tabId);
    }
  }

  function handleKeyDown(e, tabId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(tabId);
    }
    // D-pad left/right navigation between tabs
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      var idx = TABS.findIndex(function(t) { return t.id === tabId; });
      var next = TABS[(idx + 1) % TABS.length];
      var nextBtn = e.currentTarget.parentElement.querySelector('[data-tab="' + next.id + '"]');
      if (nextBtn) { nextBtn.focus(); }
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      var idx = TABS.findIndex(function(t) { return t.id === tabId; });
      var prev = TABS[(idx - 1 + TABS.length) % TABS.length];
      var prevBtn = e.currentTarget.parentElement.querySelector('[data-tab="' + prev.id + '"]');
      if (prevBtn) { prevBtn.focus(); }
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Provider filter"
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {TABS.map(function(tab) {
        var isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            data-tab={tab.id}
            tabIndex={isActive ? 0 : -1}
            onClick={function() { handleClick(tab.id); }}
            onKeyDown={function(e) { handleKeyDown(e, tab.id); }}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
              backgroundColor: isActive ? 'var(--accent)' : 'var(--surface-raised, var(--surface))',
              color: isActive ? '#ffffff' : 'var(--muted)',
              fontSize: 'calc(0.9rem * var(--font-scale, 1))',
              fontWeight: isActive ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.15s',
              outline: 'none',
              letterSpacing: '0.01em',
            }}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default ProviderFilter;

import React from 'react';
import {
  buildProviderFilterOptions,
  providerFilterToIds,
  providerIdsToFilter,
} from '../utils/providerIdentity.js';

function ProviderFilter(props) {
  var providerFilter = props.providerFilter || 'all';
  var providers = props.providers || [];
  var onProviderChange = props.onProviderChange;
  var options = buildProviderFilterOptions(providers);
  var selected = providerFilterToIds(providerFilter);
  var allActive = selected.length === 0;

  function apply(ids) {
    if (onProviderChange) {
      onProviderChange(providerIdsToFilter(ids));
    }
  }

  function toggle(id) {
    if (allActive) {
      apply([id]);
      return;
    }
    var next = selected.slice();
    var idx = next.indexOf(id);
    if (idx === -1) { next.push(id); }
    else { next.splice(idx, 1); }
    apply(next);
  }

  function isActive(id) {
    return !allActive && selected.indexOf(id) !== -1;
  }

  function handleKeyDown(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (id === 'all') { apply([]); }
      else { toggle(id); }
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { return; }
    e.preventDefault();
    var buttons = e.currentTarget.parentElement.querySelectorAll('[data-provider-filter]');
    if (!buttons || buttons.length === 0) { return; }
    var current = -1;
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i] === e.currentTarget) { current = i; break; }
    }
    if (current === -1) { return; }
    var nextIndex = e.key === 'ArrowRight'
      ? (current + 1) % buttons.length
      : (current - 1 + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  }

  function styleFor(active) {
    return {
      padding: '0.5rem 1.05rem',
      borderRadius: '999px',
      border: active ? '2px solid var(--accent)' : '2px solid var(--border)',
      backgroundColor: active ? 'var(--accent)' : 'var(--surface-raised, var(--surface))',
      color: active ? '#ffffff' : 'var(--muted)',
      fontSize: 'calc(0.9rem * var(--font-scale, 1))',
      fontWeight: active ? '700' : '500',
      cursor: 'pointer',
      transition: 'border-color 0.15s, background-color 0.15s, color 0.15s',
      outline: 'none',
      letterSpacing: '0',
      whiteSpace: 'nowrap',
    };
  }

  return (
    <div
      role="group"
      aria-label="Provider filter"
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.75rem 1.5rem',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      <button
        type="button"
        aria-pressed={allActive}
        data-provider-filter="all"
        onClick={function() { apply([]); }}
        onKeyDown={function(e) { handleKeyDown(e, 'all'); }}
        style={styleFor(allActive)}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid var(--accent)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
      >
        All Providers
      </button>
      {options.map(function(option) {
        var active = isActive(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            data-provider-filter={option.id}
            onClick={function() { toggle(option.id); }}
            onKeyDown={function(e) { handleKeyDown(e, option.id); }}
            style={styleFor(active)}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default ProviderFilter;

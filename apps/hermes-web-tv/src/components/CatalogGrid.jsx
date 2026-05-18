import React from 'react';
import CatalogCard from './CatalogCard.jsx';

function CatalogGrid(props) {
  var items = props.items || [];
  var activeTab = props.activeTab || 'all';
  var profile = props.profile || {};
  var tier = props.tier || 'degraded';

  var profileId = profile.profile_id;
  var activeLayout = profile.active_layout || 'grid-standard';

  // Filter by provider tab
  var filtered = items.filter(function(item) {
    if (activeTab === 'all') { return true; }
    var tags = item.provider_tags || [];
    return tags.indexOf(activeTab) !== -1;
  });

  // Filter by profile access
  filtered = filtered.filter(function(item) {
    var access = item.profile_access || [];
    return !profileId || access.indexOf(profileId) !== -1;
  });

  // Determine grid columns from layout and tier
  // enhanced: 5 for grid-standard, 8 for discovery, 2 for jumbo-rail
  // degraded: 3 for grid-standard, 4 for discovery, 2 for jumbo-rail
  var cols;
  if (props.columns !== undefined) {
    // explicit override from App.jsx
    cols = props.columns;
  } else if (activeLayout === 'jumbo-rail') {
    cols = 2;
  } else if (activeLayout === 'discovery') {
    cols = tier === 'enhanced' ? 8 : 4;
  } else {
    // grid-standard and rail-hero
    cols = tier === 'enhanced' ? 5 : 3;
  }

  // CSS class for grid container
  var gridClass = tier === 'enhanced' ? 'enhanced-grid' : 'degraded-grid';

  var gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
    gap: '1rem',
    padding: '1rem 1.5rem',
    flex: 1,
  };

  // Degraded: disable hover transitions on grid container
  if (tier !== 'enhanced') {
    gridStyle.transition = 'none';
  }

  if (!filtered.length) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 'calc(1rem * var(--font-scale, 1))',
        }}
      >
        No content available for this filter.
      </div>
    );
  }

  return (
    <div className={gridClass} style={gridStyle}>
      {filtered.map(function(item) {
        return (
          <CatalogCard
            key={item.item_id || item.id}
            item={item}
            profile={profile}
            tier={tier}
          />
        );
      })}
    </div>
  );
}

export default CatalogGrid;

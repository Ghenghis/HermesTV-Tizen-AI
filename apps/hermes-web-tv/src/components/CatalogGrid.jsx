import React from 'react';
import CatalogCard from './CatalogCard.jsx';

function CatalogGrid(props) {
  var items = props.items || [];
  var activeTab = props.activeTab || 'all';
  var profile = props.profile || {};

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

  // Determine grid columns from layout
  var cols;
  if (activeLayout === 'jumbo-rail') {
    cols = 2;
  } else if (activeLayout === 'rail-hero') {
    cols = 4;
  } else {
    cols = 3;
  }

  var gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
    gap: '1rem',
    padding: '1rem 1.5rem',
    flex: 1,
  };

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
    <div style={gridStyle}>
      {filtered.map(function(item) {
        return (
          <CatalogCard
            key={item.item_id}
            item={item}
            profile={profile}
          />
        );
      })}
    </div>
  );
}

export default CatalogGrid;

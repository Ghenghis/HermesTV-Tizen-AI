import React from 'react';
import ALL_LAYOUTS from '../layouts/manifests/index.js';
import { LAYOUT_IDS } from './layoutRegistry.js';

export default function useLayoutEngine(initialLayout, tier) {
  var result = React.useState(initialLayout || '');
  var activeLayout = result[0];
  var setActiveLayout = result[1];

  var availableLayouts = ALL_LAYOUTS.filter(function(m) {
    if (m.tier_required === 'enhanced' && tier !== 'enhanced') {
      return false;
    }
    return true;
  });

  function getManifest(layoutId) {
    for (var i = 0; i < ALL_LAYOUTS.length; i++) {
      if (ALL_LAYOUTS[i].id === layoutId) {
        return ALL_LAYOUTS[i];
      }
    }
    return null;
  }

  function isShellLayout(id) {
    return LAYOUT_IDS.indexOf(id) !== -1;
  }

  return {
    activeLayout: activeLayout,
    setActiveLayout: setActiveLayout,
    availableLayouts: availableLayouts,
    getManifest: getManifest,
    isShellLayout: isShellLayout,
  };
}

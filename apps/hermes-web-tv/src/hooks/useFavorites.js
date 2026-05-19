// useFavorites.js — React hook backing the heart / star button on
// MediaDetailPanel and the Favorites rail in CatalogGrid.
//
// Returns:
//   - favorites: array of favorite records for the current profile
//   - toggleFavorite(item): adds if missing, removes if present;
//     updates the in-memory list optimistically and rolls back on error.
//   - isFavorite(itemId): synchronous check against the in-memory list.
//
// Hook contract:
//   var fav = useFavorites('mom_tv');
//   fav.favorites             // → array of {id, item_id, item_type, title, poster_url, added_at}
//   fav.isFavorite('mv_42')   // → boolean
//   fav.toggleFavorite({ id: 'mv_42', type: 'movies', title: 'Casablanca', poster_url: '...' })
//
// The hook owns one IDB query at mount per profile change. The toggle path
// updates state optimistically so the UI heart icon fills/empties instantly,
// then reconciles with the IDB result. If IDB rejects, the optimistic
// state is rolled back and a console.warn surfaces (no PII).

import React from 'react';
import * as favoritesStore from '../store/favoritesStore.js';

function useFavorites(profileId) {
  var favsResult = React.useState([]);
  var favorites = favsResult[0];
  var setFavorites = favsResult[1];

  // Load on profile change.
  React.useEffect(function() {
    var cancelled = false;
    if (!profileId) {
      setFavorites([]);
      return undefined;
    }
    favoritesStore.listFavorites(profileId).then(function(rows) {
      if (!cancelled) { setFavorites(rows || []); }
    });
    return function() { cancelled = true; };
  }, [profileId]);

  function isFavorite(itemId) {
    if (!itemId) { return false; }
    var id = String(itemId);
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].item_id === id) { return true; }
    }
    return false;
  }

  function toggleFavorite(item) {
    if (!profileId || !item || !item.id) { return; }
    var itemId = String(item.id);
    var already = isFavorite(itemId);
    if (already) {
      // Optimistic remove.
      var prev = favorites.slice();
      var next = [];
      for (var i = 0; i < favorites.length; i++) {
        if (favorites[i].item_id !== itemId) { next.push(favorites[i]); }
      }
      setFavorites(next);
      favoritesStore.removeFavorite(profileId, itemId).then(function(ok) {
        if (!ok) {
          // Rollback.
          setFavorites(prev);
        }
      });
    } else {
      // Optimistic add. We construct a local stub so the UI updates
      // immediately; the canonical record returned from IDB replaces it.
      var stub = {
        id: profileId + '::' + itemId,
        profile_id: profileId,
        item_id: itemId,
        item_type: item.type || item.item_type || 'movies',
        title: typeof item.title === 'string' ? item.title : '',
        poster_url: typeof item.poster_url === 'string'
          ? item.poster_url
          : (typeof item.poster === 'string' ? item.poster : ''),
        added_at: new Date().toISOString()
      };
      var prevAdd = favorites.slice();
      setFavorites([stub].concat(favorites));
      favoritesStore.addFavorite(profileId, item).then(function(record) {
        if (!record) {
          // Rollback.
          setFavorites(prevAdd);
        } else {
          // Reconcile: swap the stub for the canonical record.
          var reconciled = [record];
          for (var j = 0; j < prevAdd.length; j++) { reconciled.push(prevAdd[j]); }
          setFavorites(reconciled);
        }
      });
    }
  }

  return {
    favorites: favorites,
    toggleFavorite: toggleFavorite,
    isFavorite: isFavorite
  };
}

export { useFavorites };
export default useFavorites;

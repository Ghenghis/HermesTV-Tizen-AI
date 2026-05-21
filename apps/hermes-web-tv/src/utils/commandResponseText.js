// Maps a resolved command action + params to the chatbot's confirmation text.
// All text should be concise, natural, and match the agent persona (calm, helpful).

var PROVIDER_NAMES = {
  apollo_group: 'Apollo Group',
  xtremehd: 'XtremeHD',
  'iptv-org': 'iptv-org',
  all: 'all providers',
};

var CONTENT_NAMES = {
  movies: 'movies',
  series: 'TV series',
  live: 'live channels',
  sports: 'sports',
  action: 'action titles',
  family: 'family titles',
  mysteries: 'mysteries',
  hallmark: 'Hallmark titles',
};

var THEME_NAMES = {
  'night-blue': 'Night Blue dark theme',
  'cinema_amber': 'Cinema Amber theme',
  'mom-calm': 'Mom Calm theme',
  'midnight-steel': 'Midnight Steel theme',
};

var LAYOUT_NAMES = {
  'mom_jumbo_rail': 'large tiles layout',
  'discovery_walls': 'discovery walls layout',
  'grid-standard': 'standard grid layout',
  'classic_cable_grid': 'classic cable grid',
};

function getResponseText(action, params) {
  var p = params || {};

  if (action === 'filter_provider') {
    var name = PROVIDER_NAMES[p.provider_id] || p.provider_id || 'all providers';
    return 'Showing ' + name + '.';
  }

  if (action === 'filter_content') {
    var cname = CONTENT_NAMES[p.content_type] || p.content_type || 'all content';
    return 'Filtering to ' + cname + '.';
  }

  if (action === 'filter_quality') {
    if (p.quality === '4K') return 'Showing 4K titles only.';
    if (p.quality === '1080p+') return 'Showing 1080p and above.';
    return 'Quality filter updated.';
  }

  if (action === 'switch_profile') {
    if (p.profile_id === 'mom_tv') return 'Switching to Mom Mode…';
    if (p.profile_id === 'dave_tv') return 'Switching to Dave’s profile…';
    return 'Switching profile…';
  }

  if (action === 'update_layout') {
    var lname = LAYOUT_NAMES[p.layout] || p.layout || 'new View';
    return 'Switching to ' + lname + '.';
  }

  if (action === 'update_theme') {
    var tname = THEME_NAMES[p.theme] || p.theme || 'new theme';
    return 'Applying ' + tname + '.';
  }

  if (action === 'update_motion') {
    if (p.density === 'off') return 'Performance mode on. Animations reduced.';
    return 'Motion settings updated.';
  }

  if (action === 'show_detail') return 'Opening content details.';
  if (action === 'find_similar_actor') return 'Finding more content with this actor.';
  if (action === 'reset_filters') return 'All filters cleared.';
  if (action === 'show_notification') return 'Got it.';
  if (action === 'open_search') return 'Opening search.';
  if (action === 'play_this') return 'Playing now.';
  if (action === 'open_epg') return 'Opening tonight’s lineup.';
  if (action === 'open_layout_switcher') return 'Opening the View picker.';

  return 'Done.';
}

export { getResponseText };

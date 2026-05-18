'use strict';

// Seed catalog for /api/catalog when no real provider (Jellyfin / iptv-org /
// Threadfin-fronted Apollo or xTremeHD) is wired up yet. This is what fills
// the 7 layout shells (Netflix, Plex, TiviMate, Apple TV, Samsung, Mom Mode,
// Dave Power) during development and on a freshly-deployed VPS where the
// operator has not yet pasted any provider credentials.
//
// Goals:
//   * Enough breadth that every shell's content rails / EPG grid / hero
//     carousel actually fills the viewport.
//   * Mix of live channels (sports, news, entertainment, lifestyle, kids,
//     music, local broadcast, international) plus a credible VOD/series
//     library — so chatbot commands like "show movies", "show 4K", "show
//     hallmark", "show sports" all return non-empty results.
//   * Both Apollo Group and xTreme HD provider IDs represented, with the
//     overlap items carrying both providers (mirrors the multi-source
//     channel pattern Dispatcharr / Threadfin merge to).
//   * Quality mix tilted toward 1080p with a healthy slice of 4K so the
//     `show 4K` filter returns a populated grid.
//   * Mom-friendly content gated by profile_access to mom_tv (Hallmark,
//     PBS, classic networks, family movies). Dave gets everything.
//
// IMPORTANT: nothing in here is a real provider credential, M3U URL, or
// EPG endpoint. The IDs are purely client-side handles. When the operator
// wires real providers, this seed is replaced by Threadfin / Jellyfin /
// iptv-org responses (see lib/jellyfin.js and the iptv-org adapter plan).

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function liveItem(seq, opts) {
  // seq is the rolling sequence index for the live-NNN id pattern.
  var id = 'live-' + (100 + seq).toString();
  var providers = (opts.providers || []).map(function(pid, i) {
    return {
      provider_id: pid,
      source_id: pid.slice(0, 3) + '-live-' + opts.slug,
      source_health: {
        status: 'ok',
        latency_ms: 30 + ((seq * 13 + i * 7) % 90),
        checked_utc: '2026-05-18T04:00:00Z',
      },
    };
  });
  return {
    id: id,
    type: 'live',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'apollo_group',
    category: opts.category,
    logo_url: 'https://hermestv.local/assets/logos/' + opts.slug + '.png',
    profile_access: opts.profile_access || ['dave_tv', 'mom_tv'],
    providers: providers,
    metadata: {
      resolution: opts.resolution || '1080p',
      has_catchup: !!opts.has_catchup,
      genre: opts.genre || opts.category,
    },
    quality: opts.resolution || '1080p',
  };
}

function vodItem(seq, opts) {
  var id = 'vod-' + (200 + seq).toString();
  var providers = (opts.providers || ['xtremehd']).map(function(pid, i) {
    return {
      provider_id: pid,
      source_id: pid.slice(0, 3) + '-vod-' + opts.slug,
      source_health: {
        status: 'ok',
        latency_ms: 40 + ((seq * 11 + i * 9) % 100),
        checked_utc: '2026-05-18T04:00:00Z',
      },
    };
  });
  return {
    id: id,
    type: 'vod',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'xtremehd',
    category: opts.category || 'movies',
    logo_url: 'https://hermestv.local/assets/logos/' + opts.slug + '.png',
    profile_access: opts.profile_access || ['dave_tv', 'mom_tv'],
    providers: providers,
    metadata: {
      resolution: opts.resolution || '1080p',
      duration_min: opts.duration_min || 110,
      year: opts.year || 2024,
      genre: opts.genre || 'drama',
    },
    quality: opts.resolution || '1080p',
    year: opts.year || 2024,
    genre: opts.genre || 'drama',
  };
}

function seriesItem(seq, opts) {
  var id = 'ser-' + (300 + seq).toString();
  var providers = (opts.providers || ['xtremehd']).map(function(pid, i) {
    return {
      provider_id: pid,
      source_id: pid.slice(0, 3) + '-ser-' + opts.slug,
      source_health: {
        status: 'ok',
        latency_ms: 40 + ((seq * 17 + i * 5) % 80),
        checked_utc: '2026-05-18T04:00:00Z',
      },
    };
  });
  return {
    id: id,
    type: 'series',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'xtremehd',
    category: opts.category || 'series',
    logo_url: 'https://hermestv.local/assets/logos/' + opts.slug + '.png',
    profile_access: opts.profile_access || ['dave_tv', 'mom_tv'],
    providers: providers,
    metadata: {
      resolution: opts.resolution || '1080p',
      year: opts.year || 2024,
      seasons: opts.seasons || 1,
      genre: opts.genre || 'drama',
    },
    quality: opts.resolution || '1080p',
    year: opts.year || 2024,
    genre: opts.genre || 'drama',
  };
}

// Both providers carrying the channel (consolidated source pattern).
var BOTH = ['apollo_group', 'xtremehd'];
var APOLLO = ['apollo_group'];
var XTREME = ['xtremehd'];

// ---------------------------------------------------------------------------
// LIVE CHANNELS (~80) — covers sports, news, entertainment, lifestyle, kids,
// music, local broadcast, international. Mix of 1080p / 4K.
// ---------------------------------------------------------------------------

var LIVE_DEFS = [
  // --- Sports (Dave-heavy) ---
  { slug: 'espn', title: 'ESPN', category: 'sports', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'espn2', title: 'ESPN 2', category: 'sports', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'espnu', title: 'ESPNU', category: 'sports', providers: APOLLO, resolution: '1080p' },
  { slug: 'espn-deportes', title: 'ESPN Deportes', category: 'sports', providers: APOLLO, resolution: '720p' },
  { slug: 'nfl-network', title: 'NFL Network', category: 'sports', providers: BOTH, resolution: '4K' },
  { slug: 'nfl-redzone', title: 'NFL RedZone', category: 'sports', providers: XTREME, profile_access: ['dave_tv'], resolution: '1080p' },
  { slug: 'nba-tv', title: 'NBA TV', category: 'sports', providers: BOTH, resolution: '1080p' },
  { slug: 'mlb-network', title: 'MLB Network', category: 'sports', providers: BOTH, resolution: '1080p' },
  { slug: 'nhl-network', title: 'NHL Network', category: 'sports', providers: APOLLO, resolution: '1080p' },
  { slug: 'fs1', title: 'FS1', category: 'sports', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'fs2', title: 'FS2', category: 'sports', providers: APOLLO, resolution: '720p' },
  { slug: 'nbc-sports', title: 'NBC Sports', category: 'sports', providers: BOTH, resolution: '1080p' },
  { slug: 'cbs-sports', title: 'CBS Sports Network', category: 'sports', providers: APOLLO, resolution: '1080p' },
  { slug: 'tennis-channel', title: 'Tennis Channel', category: 'sports', providers: BOTH, resolution: '4K' },
  { slug: 'golf-channel', title: 'Golf Channel', category: 'sports', providers: APOLLO, resolution: '1080p' },
  { slug: 'olympic-channel', title: 'Olympic Channel', category: 'sports', providers: BOTH, resolution: '4K' },
  { slug: 'big-ten-network', title: 'Big Ten Network', category: 'sports', providers: APOLLO, profile_access: ['dave_tv'], resolution: '1080p' },
  { slug: 'sec-network', title: 'SEC Network', category: 'sports', providers: APOLLO, profile_access: ['dave_tv'], resolution: '1080p' },
  { slug: 'bein-sports', title: 'BeIN Sports', category: 'sports', providers: XTREME, resolution: '1080p' },
  { slug: 'willow-cricket', title: 'Willow Cricket', category: 'sports', providers: XTREME, resolution: '1080p' },

  // --- News ---
  { slug: 'cnn', title: 'CNN', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'fox-news', title: 'Fox News', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'msnbc', title: 'MSNBC', category: 'news', providers: BOTH, resolution: '1080p' },
  { slug: 'cnbc', title: 'CNBC', category: 'news', providers: BOTH, resolution: '1080p' },
  { slug: 'bbc-world', title: 'BBC World News', category: 'news', providers: BOTH, resolution: '1080p' },
  { slug: 'sky-news', title: 'Sky News', category: 'news', providers: APOLLO, resolution: '720p' },
  { slug: 'bloomberg', title: 'Bloomberg TV', category: 'news', providers: APOLLO, resolution: '1080p' },
  { slug: 'al-jazeera', title: 'Al Jazeera English', category: 'news', providers: XTREME, resolution: '720p' },
  { slug: 'newsmax', title: 'Newsmax', category: 'news', providers: APOLLO, resolution: '720p' },
  { slug: 'newsnation', title: 'NewsNation', category: 'news', providers: BOTH, resolution: '1080p' },
  { slug: 'oan', title: 'One America News', category: 'news', providers: APOLLO, resolution: '720p' },
  { slug: 'france-24', title: 'France 24', category: 'news', providers: XTREME, resolution: '720p' },
  { slug: 'dw-news', title: 'DW News', category: 'news', providers: XTREME, resolution: '720p' },
  { slug: 'euronews', title: 'Euronews', category: 'news', providers: XTREME, resolution: '720p' },

  // --- Entertainment / Premium ---
  { slug: 'hbo', title: 'HBO', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'hbo2', title: 'HBO 2', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'showtime', title: 'Showtime', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'starz', title: 'Starz', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'cinemax', title: 'Cinemax', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'amc', title: 'AMC', category: 'entertainment', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'fx', title: 'FX', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'fxx', title: 'FXX', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'usa', title: 'USA Network', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'tnt', title: 'TNT', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'tbs', title: 'TBS', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'bravo', title: 'Bravo', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'paramount', title: 'Paramount Network', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'syfy', title: 'Syfy', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'history', title: 'History Channel', category: 'entertainment', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'discovery', title: 'Discovery Channel', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'animal-planet', title: 'Animal Planet', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'natgeo', title: 'National Geographic', category: 'entertainment', providers: BOTH, resolution: '4K' },
  { slug: 'natgeo-wild', title: 'Nat Geo Wild', category: 'entertainment', providers: APOLLO, resolution: '4K' },
  { slug: 'travel-channel', title: 'Travel Channel', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'science', title: 'Science Channel', category: 'entertainment', providers: BOTH, resolution: '1080p' },

  // --- Lifestyle (Mom-friendly tilt) ---
  { slug: 'hgtv', title: 'HGTV', category: 'lifestyle', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'food-network', title: 'Food Network', category: 'lifestyle', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'cooking-channel', title: 'Cooking Channel', category: 'lifestyle', providers: APOLLO, resolution: '1080p' },
  { slug: 'diy', title: 'DIY Network', category: 'lifestyle', providers: APOLLO, resolution: '720p' },
  { slug: 'magnolia', title: 'Magnolia Network', category: 'lifestyle', providers: BOTH, resolution: '1080p' },
  { slug: 'tlc', title: 'TLC', category: 'lifestyle', providers: BOTH, resolution: '1080p' },
  { slug: 'lifetime', title: 'Lifetime', category: 'entertainment', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'lifetime-movies', title: 'Lifetime Movies', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'hallmark', title: 'Hallmark Channel', category: 'hallmark', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'hallmark-movies', title: 'Hallmark Movies & Mysteries', category: 'mysteries', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'hallmark-drama', title: 'Hallmark Drama', category: 'hallmark', providers: APOLLO, resolution: '1080p' },
  { slug: 'gac-family', title: 'GAC Family', category: 'family', providers: APOLLO, resolution: '1080p' },
  { slug: 'own', title: 'OWN', category: 'lifestyle', providers: BOTH, resolution: '1080p' },

  // --- Kids ---
  { slug: 'disney', title: 'Disney Channel', category: 'family', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'disney-jr', title: 'Disney Junior', category: 'family', providers: APOLLO, resolution: '1080p' },
  { slug: 'disney-xd', title: 'Disney XD', category: 'family', providers: APOLLO, resolution: '1080p' },
  { slug: 'cartoon-network', title: 'Cartoon Network', category: 'family', providers: BOTH, resolution: '1080p' },
  { slug: 'nickelodeon', title: 'Nickelodeon', category: 'family', providers: BOTH, resolution: '1080p' },
  { slug: 'nick-jr', title: 'Nick Jr.', category: 'family', providers: APOLLO, resolution: '1080p' },
  { slug: 'boomerang', title: 'Boomerang', category: 'family', providers: APOLLO, resolution: '720p' },
  { slug: 'pbs-kids', title: 'PBS Kids', category: 'family', providers: BOTH, resolution: '720p' },

  // --- Music ---
  { slug: 'mtv', title: 'MTV', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'mtv2', title: 'MTV2', category: 'entertainment', providers: APOLLO, resolution: '720p' },
  { slug: 'vh1', title: 'VH1', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'cmt', title: 'CMT', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'bet', title: 'BET', category: 'entertainment', providers: BOTH, resolution: '1080p' },
  { slug: 'bet-jams', title: 'BET Jams', category: 'entertainment', providers: APOLLO, resolution: '720p' },

  // --- Local broadcast ---
  { slug: 'abc', title: 'ABC', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'nbc', title: 'NBC', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'cbs', title: 'CBS', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'fox', title: 'FOX', category: 'news', providers: BOTH, has_catchup: true, resolution: '1080p' },
  { slug: 'pbs', title: 'PBS', category: 'news', providers: BOTH, resolution: '1080p' },
  { slug: 'cw', title: 'The CW', category: 'entertainment', providers: APOLLO, resolution: '1080p' },
  { slug: 'metv', title: 'MeTV', category: 'entertainment', providers: APOLLO, resolution: '720p' },
  { slug: 'ion', title: 'ION Television', category: 'entertainment', providers: APOLLO, resolution: '720p' },

  // --- International ---
  { slug: 'univision', title: 'Univision', category: 'entertainment', providers: XTREME, resolution: '1080p' },
  { slug: 'telemundo', title: 'Telemundo', category: 'entertainment', providers: XTREME, resolution: '1080p' },
];

// ---------------------------------------------------------------------------
// VOD MOVIES (~35) — mix of recent blockbusters, classics, family.
// ---------------------------------------------------------------------------

var VOD_DEFS = [
  { slug: 'top-gun-maverick', title: 'Top Gun: Maverick', year: 2022, genre: 'action', duration_min: 130, providers: BOTH, resolution: '4K' },
  { slug: 'avengers-endgame', title: 'Avengers: Endgame', year: 2019, genre: 'action', duration_min: 181, providers: BOTH, resolution: '4K' },
  { slug: 'dune-part-two', title: 'Dune: Part Two', year: 2024, genre: 'action', duration_min: 166, providers: BOTH, resolution: '4K' },
  { slug: 'oppenheimer', title: 'Oppenheimer', year: 2023, genre: 'drama', duration_min: 180, providers: XTREME, resolution: '4K' },
  { slug: 'barbie', title: 'Barbie', year: 2023, genre: 'family', duration_min: 114, providers: BOTH, resolution: '4K' },
  { slug: 'john-wick-4', title: 'John Wick: Chapter 4', year: 2023, genre: 'action', duration_min: 169, providers: XTREME, resolution: '4K' },
  { slug: 'mi7', title: 'Mission Impossible — Dead Reckoning', year: 2023, genre: 'action', duration_min: 163, providers: BOTH, resolution: '4K' },
  { slug: 'spiderman-across', title: 'Spider-Man: Across the Spider-Verse', year: 2023, genre: 'family', duration_min: 140, providers: BOTH, resolution: '4K' },
  { slug: 'the-batman', title: 'The Batman', year: 2022, genre: 'action', duration_min: 176, providers: XTREME, resolution: '4K' },
  { slug: 'eeao', title: 'Everything Everywhere All at Once', year: 2022, genre: 'drama', duration_min: 139, providers: XTREME, resolution: '1080p' },
  { slug: 'glass-onion', title: 'Glass Onion: A Knives Out Mystery', year: 2022, genre: 'mysteries', duration_min: 140, providers: XTREME, resolution: '4K' },
  { slug: 'knives-out', title: 'Knives Out', year: 2019, genre: 'mysteries', duration_min: 130, providers: BOTH, resolution: '1080p' },
  { slug: 'the-menu', title: 'The Menu', year: 2022, genre: 'mysteries', duration_min: 107, providers: APOLLO, resolution: '1080p' },
  { slug: 'sound-of-freedom', title: 'Sound of Freedom', year: 2023, genre: 'drama', duration_min: 131, providers: APOLLO, resolution: '1080p' },
  { slug: 'wonka', title: 'Wonka', year: 2023, genre: 'family', duration_min: 116, providers: BOTH, resolution: '4K' },
  { slug: 'gilded-age-finale', title: 'The Gilded Age — Theatrical Cut', year: 2024, genre: 'drama', duration_min: 124, providers: APOLLO, resolution: '1080p' },
  { slug: 'killers-of-flower-moon', title: 'Killers of the Flower Moon', year: 2023, genre: 'drama', duration_min: 206, providers: XTREME, resolution: '4K' },
  { slug: 'creed-3', title: 'Creed III', year: 2023, genre: 'action', duration_min: 117, providers: BOTH, resolution: '1080p' },
  { slug: 'fast-x', title: 'Fast X', year: 2023, genre: 'action', duration_min: 141, providers: XTREME, resolution: '4K' },
  { slug: 'shazam-2', title: 'Shazam! Fury of the Gods', year: 2023, genre: 'family', duration_min: 130, providers: XTREME, resolution: '1080p' },
  { slug: 'air', title: 'AIR', year: 2023, genre: 'drama', duration_min: 112, providers: APOLLO, resolution: '1080p' },
  { slug: 'asteroid-city', title: 'Asteroid City', year: 2023, genre: 'drama', duration_min: 105, providers: XTREME, resolution: '1080p' },
  { slug: 'past-lives', title: 'Past Lives', year: 2023, genre: 'drama', duration_min: 105, providers: APOLLO, resolution: '1080p' },
  { slug: 'paw-patrol-movie', title: 'PAW Patrol: The Mighty Movie', year: 2023, genre: 'family', duration_min: 92, providers: BOTH, resolution: '1080p' },
  { slug: 'trolls-band-together', title: 'Trolls Band Together', year: 2023, genre: 'family', duration_min: 92, providers: APOLLO, resolution: '1080p' },
  { slug: 'inside-out-2', title: 'Inside Out 2', year: 2024, genre: 'family', duration_min: 96, providers: BOTH, resolution: '4K' },
  { slug: 'a-christmas-story-christmas', title: 'A Christmas Story Christmas', year: 2022, genre: 'family', duration_min: 98, providers: APOLLO, resolution: '1080p' },
  { slug: 'when-harry-met-sally', title: 'When Harry Met Sally', year: 1989, genre: 'drama', duration_min: 96, providers: APOLLO, resolution: '1080p' },
  { slug: 'sleepless-in-seattle', title: 'Sleepless in Seattle', year: 1993, genre: 'drama', duration_min: 105, providers: APOLLO, resolution: '1080p' },
  { slug: 'youve-got-mail', title: "You've Got Mail", year: 1998, genre: 'drama', duration_min: 119, providers: APOLLO, resolution: '1080p' },
  { slug: 'pretty-woman', title: 'Pretty Woman', year: 1990, genre: 'drama', duration_min: 119, providers: APOLLO, resolution: '1080p' },
  { slug: 'shawshank', title: 'The Shawshank Redemption', year: 1994, genre: 'drama', duration_min: 142, providers: BOTH, resolution: '1080p' },
  { slug: 'godfather', title: 'The Godfather', year: 1972, genre: 'drama', duration_min: 175, providers: XTREME, resolution: '4K' },
  { slug: 'casablanca', title: 'Casablanca', year: 1942, genre: 'drama', duration_min: 102, providers: APOLLO, resolution: '1080p' },
  { slug: 'rear-window', title: 'Rear Window', year: 1954, genre: 'mysteries', duration_min: 112, providers: APOLLO, resolution: '1080p' },
];

// ---------------------------------------------------------------------------
// SERIES (~20)
// ---------------------------------------------------------------------------

var SERIES_DEFS = [
  { slug: 'stranger-things', title: 'Stranger Things', year: 2016, seasons: 4, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'house-of-dragon', title: 'House of the Dragon', year: 2022, seasons: 2, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'rings-of-power', title: 'The Rings of Power', year: 2022, seasons: 2, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'severance', title: 'Severance', year: 2022, seasons: 2, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'ted-lasso', title: 'Ted Lasso', year: 2020, seasons: 3, genre: 'series', providers: APOLLO, resolution: '1080p' },
  { slug: 'the-bear', title: 'The Bear', year: 2022, seasons: 3, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'wednesday', title: 'Wednesday', year: 2022, seasons: 1, genre: 'series', providers: BOTH, resolution: '4K' },
  { slug: 'yellowstone', title: 'Yellowstone', year: 2018, seasons: 5, genre: 'series', providers: BOTH, resolution: '4K' },
  { slug: '1923', title: '1923', year: 2022, seasons: 1, genre: 'series', providers: APOLLO, resolution: '1080p' },
  { slug: 'succession', title: 'Succession', year: 2018, seasons: 4, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'breaking-bad', title: 'Breaking Bad', year: 2008, seasons: 5, genre: 'series', providers: BOTH, resolution: '1080p' },
  { slug: 'better-call-saul', title: 'Better Call Saul', year: 2015, seasons: 6, genre: 'series', providers: BOTH, resolution: '1080p' },
  { slug: 'the-crown', title: 'The Crown', year: 2016, seasons: 6, genre: 'series', providers: APOLLO, resolution: '4K' },
  { slug: 'bridgerton', title: 'Bridgerton', year: 2020, seasons: 3, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'the-marvelous-mrs-maisel', title: 'The Marvelous Mrs. Maisel', year: 2017, seasons: 5, genre: 'series', providers: APOLLO, resolution: '1080p' },
  { slug: 'true-detective', title: 'True Detective', year: 2014, seasons: 4, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'fargo', title: 'Fargo', year: 2014, seasons: 5, genre: 'series', providers: BOTH, resolution: '1080p' },
  { slug: 'sherlock', title: 'Sherlock', year: 2010, seasons: 4, genre: 'series', providers: APOLLO, resolution: '1080p' },
  { slug: 'monk', title: 'Monk', year: 2002, seasons: 8, genre: 'series', providers: APOLLO, resolution: '720p' },
  { slug: 'columbo', title: 'Columbo', year: 1971, seasons: 10, genre: 'series', providers: APOLLO, resolution: '720p' },
];

// ---------------------------------------------------------------------------
// Build the merged list. Sequence indexes scoped to type so the live-/vod-/
// ser- id prefixes never collide.
// ---------------------------------------------------------------------------

var SEED_CATALOG = [];

LIVE_DEFS.forEach(function(def, i) { SEED_CATALOG.push(liveItem(i, def)); });
VOD_DEFS.forEach(function(def, i) { SEED_CATALOG.push(vodItem(i, def)); });
SERIES_DEFS.forEach(function(def, i) { SEED_CATALOG.push(seriesItem(i, def)); });

module.exports = {
  SEED_CATALOG: SEED_CATALOG,
  // Exported separately so other routes (channels.js, providers.js) can pull
  // the same live-channel list without duplicating definitions.
  LIVE_DEFS: LIVE_DEFS,
  VOD_DEFS: VOD_DEFS,
  SERIES_DEFS: SERIES_DEFS,
};

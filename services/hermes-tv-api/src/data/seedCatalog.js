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
// Artwork helpers — see also the KNOWN_LOGOS / KNOWN_POSTERS maps below.
//
// Without real artwork the shells (NetflixShell, TiviMate, Zero, Apple TV,
// Samsung, Mom Mode, Dave Power) fall back to coloured gradients because
// `item.poster` / `item.poster_url` are absent. To make the catalog look
// like a real lineup on a freshly-deployed VPS we attach:
//
//   * logo_url    — Wikipedia Commons thumb URL for ~50 well-known networks,
//                   picsum.photos placeholder (seeded by slug) for the rest.
//                   Shape: square-ish channel logo.
//   * poster_url  — TMDb /t/p/w500 path for a handful of famous titles,
//                   picsum.photos placeholder (seeded by slug) otherwise.
//                   Shape: 2:3 portrait poster.
//   * poster      — alias of poster_url (the 6 OG shells read item.poster,
//                   ZeroShell + CatalogCard read item.poster_url). Carrying
//                   both keeps every shell happy without changing render code.
//
// All of these are free-tier public CDNs (Wikipedia upload.wikimedia.org,
// TMDb image.tmdb.org, picsum.photos). No credentials, no API calls — direct
// image URLs only. The web app's CSP allows img-src 'self' data: blob: http:
// https: so all three hosts are reachable from the TV.
//
// When the operator wires real providers (Jellyfin / Threadfin / iptv-org),
// those adapters supply their own poster_url / logo_url and this seed is
// replaced wholesale.
// ---------------------------------------------------------------------------

// picsum.photos returns a deterministic image keyed by the seed; the same
// slug always renders the same poster, so the catalog is stable across
// rebuilds and the operator's eye can recognise a tile they tab past
// (instead of getting a roulette of random photos).
function picsumPoster(slug)  { return 'https://picsum.photos/seed/htv-' + slug + '/300/450'; }
function picsumLogo(slug)    { return 'https://picsum.photos/seed/htv-logo-' + slug + '/200/200'; }
function picsumThumb(slug)   { return 'https://picsum.photos/seed/htv-thumb-' + slug + '/480/270'; }

// ---------------------------------------------------------------------------
// KNOWN_LOGOS — Wikipedia Commons thumb URLs for well-known live channels.
// Picked for stability (long-standing Commons files) and reasonable file
// sizes (240px thumb wrappers around the original SVG/PNG). Anything not in
// this map gets a picsum placeholder so the tile still renders artwork
// rather than a coloured gradient.
// ---------------------------------------------------------------------------
var KNOWN_LOGOS = {
  // Sports
  'espn':           'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/240px-ESPN_wordmark.svg.png',
  'espn2':          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/ESPN2_logo.svg/240px-ESPN2_logo.svg.png',
  'espnu':          'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/ESPNU_logo.svg/240px-ESPNU_logo.svg.png',
  'nfl-network':    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/NFL_Network_logo.svg/240px-NFL_Network_logo.svg.png',
  'nfl-redzone':    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/NFL_RedZone_logo.svg/240px-NFL_RedZone_logo.svg.png',
  'nba-tv':         'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/NBA_TV.svg/240px-NBA_TV.svg.png',
  'mlb-network':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/MLB_Network_logo.svg/240px-MLB_Network_logo.svg.png',
  'nhl-network':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/NHL_Network_logo.svg/240px-NHL_Network_logo.svg.png',
  'fs1':            'https://upload.wikimedia.org/wikipedia/commons/thumb/e/edb/Fox_Sports_1_logo.svg/240px-Fox_Sports_1_logo.svg.png',
  'fs2':            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Fox_Sports_2_logo.svg/240px-Fox_Sports_2_logo.svg.png',
  'golf-channel':   'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Golf_Channel_logo.svg/240px-Golf_Channel_logo.svg.png',
  'tennis-channel': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Tennis_Channel_logo.svg/240px-Tennis_Channel_logo.svg.png',
  'big-ten-network':'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Big_Ten_Network_logo.svg/240px-Big_Ten_Network_logo.svg.png',
  'sec-network':    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/SEC_Network_logo.svg/240px-SEC_Network_logo.svg.png',

  // News
  'cnn':            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/240px-CNN.svg.png',
  'fox-news':       'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Fox_News_Channel_logo.svg/240px-Fox_News_Channel_logo.svg.png',
  'msnbc':          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/MSNBC_2015_logo.svg/240px-MSNBC_2015_logo.svg.png',
  'cnbc':           'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/CNBC_logo.svg/240px-CNBC_logo.svg.png',
  'bbc-world':      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/BBC_World_News_red.svg/240px-BBC_World_News_red.svg.png',
  'sky-news':       'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Sky_News.svg/240px-Sky_News.svg.png',
  'bloomberg':      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Bloomberg_logo.svg/240px-Bloomberg_logo.svg.png',
  'al-jazeera':     'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Aljazeera_eng.svg/240px-Aljazeera_eng.svg.png',
  'france-24':      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/FRANCE_24_logo.svg/240px-FRANCE_24_logo.svg.png',
  'euronews':       'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Euronews_2016_logo.svg/240px-Euronews_2016_logo.svg.png',

  // Entertainment / Premium
  'hbo':            'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/240px-HBO_logo.svg.png',
  'showtime':       'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Showtime.svg/240px-Showtime.svg.png',
  'starz':          'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Starz_2016.svg/240px-Starz_2016.svg.png',
  'cinemax':        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Cinemax_2008.svg/240px-Cinemax_2008.svg.png',
  'amc':            'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/AMC_logo_2019.svg/240px-AMC_logo_2019.svg.png',
  'fx':             'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/FX_International_logo.svg/240px-FX_International_logo.svg.png',
  'usa':            'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/USA_Network_logo_%282016%29.svg/240px-USA_Network_logo_%282016%29.svg.png',
  'tnt':            'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/TNT_Logo_2016.svg/240px-TNT_Logo_2016.svg.png',
  'tbs':            'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TBS_logo_2016.svg/240px-TBS_logo_2016.svg.png',
  'bravo':          'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Bravo_2017_logo.svg/240px-Bravo_2017_logo.svg.png',
  'syfy':           'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Syfy_2017.svg/240px-Syfy_2017.svg.png',
  'history':        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/History_%282021%29.svg/240px-History_%282021%29.svg.png',
  'discovery':      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Discovery_Channel_logo.svg/240px-Discovery_Channel_logo.svg.png',
  'animal-planet':  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/2018_Animal_Planet_logo.svg/240px-2018_Animal_Planet_logo.svg.png',
  'natgeo':         'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Natgeologo.svg/240px-Natgeologo.svg.png',

  // Lifestyle
  'hgtv':           'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/HGTV_US_Logo_2015.svg/240px-HGTV_US_Logo_2015.svg.png',
  'food-network':   'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Food_Network_logo.svg/240px-Food_Network_logo.svg.png',
  'tlc':            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/TLC_Logo.svg/240px-TLC_Logo.svg.png',
  'lifetime':       'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Logo_Lifetime_2020.svg/240px-Logo_Lifetime_2020.svg.png',
  'hallmark':       'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hallmark_Channel.svg/240px-Hallmark_Channel.svg.png',

  // Kids
  'disney':         'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/2019_Disney_Channel_logo.svg/240px-2019_Disney_Channel_logo.svg.png',
  'cartoon-network':'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/240px-Cartoon_Network_2010_logo.svg.png',
  'nickelodeon':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Nickelodeon_2009_logo.svg/240px-Nickelodeon_2009_logo.svg.png',
  'pbs-kids':       'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/PBS_Kids_logo.svg/240px-PBS_Kids_logo.svg.png',

  // Music
  'mtv':            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/MTV-2021.svg/240px-MTV-2021.svg.png',
  'vh1':            'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/VH1_logonew.svg/240px-VH1_logonew.svg.png',
  'cmt':            'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/CMT_2017_logo.svg/240px-CMT_2017_logo.svg.png',
  'bet':            'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/BET_2017_logo.svg/240px-BET_2017_logo.svg.png',

  // Broadcast
  'abc':            'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/American_Broadcasting_Company_Logo.svg/240px-American_Broadcasting_Company_Logo.svg.png',
  'nbc':            'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/NBC_logo_%282022%29.svg/240px-NBC_logo_%282022%29.svg.png',
  'cbs':            'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/CBS_logo_%282020%29.svg/240px-CBS_logo_%282020%29.svg.png',
  'fox':            'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Fox_Broadcasting_Company_logo_%282019%29.svg/240px-Fox_Broadcasting_Company_logo_%282019%29.svg.png',
  'pbs':            'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/PBS_logo.svg/240px-PBS_logo.svg.png',
  'cw':             'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/The_CW.svg/240px-The_CW.svg.png',

  // International
  'univision':      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Logo_Univision_2019.svg/240px-Logo_Univision_2019.svg.png',
  'telemundo':      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Telemundo_logo_2018.svg/240px-Telemundo_logo_2018.svg.png',
};

// ---------------------------------------------------------------------------
// KNOWN_POSTERS — TMDb /t/p/w500 image paths for movies and series the
// operator is likely to recognise. The paths come from TMDb's public image
// CDN (no API key needed for asset GETs). Anything not in this map gets a
// picsum placeholder so every card still has artwork.
// ---------------------------------------------------------------------------
var TMDB_BASE = 'https://image.tmdb.org/t/p/w500';
var KNOWN_POSTERS = {
  // VOD
  'top-gun-maverick':           TMDB_BASE + '/62HCnUTziyWcpDaBO2i1DX17ljH.jpg',
  'avengers-endgame':           TMDB_BASE + '/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
  'dune-part-two':              TMDB_BASE + '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
  'oppenheimer':                TMDB_BASE + '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
  'barbie':                     TMDB_BASE + '/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg',
  'john-wick-4':                TMDB_BASE + '/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg',
  'spiderman-across':           TMDB_BASE + '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
  'the-batman':                 TMDB_BASE + '/74xTEgt7R36Fpooo50r9T25onhq.jpg',
  'eeao':                       TMDB_BASE + '/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg',
  'glass-onion':                TMDB_BASE + '/vDGr1YdrlfbU9wxTOdpf3zChmv9.jpg',
  'knives-out':                 TMDB_BASE + '/pThyQovXQrw2m0s9x82twj48Jq4.jpg',
  'wonka':                      TMDB_BASE + '/qhb1qOilapbapxWQn9jtRCMwXJF.jpg',
  'inside-out-2':               TMDB_BASE + '/vpnVM9B6NMmQpWeZvzLvDESb2QE.jpg',
  'shawshank':                  TMDB_BASE + '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
  'godfather':                  TMDB_BASE + '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
  'casablanca':                 TMDB_BASE + '/5K7cOHoay2mZusSLezBOY0Qxh8a.jpg',
  'pretty-woman':               TMDB_BASE + '/hVHUfT801LQATGd26VPzhorIYza.jpg',
  // Series
  'stranger-things':            TMDB_BASE + '/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
  'house-of-dragon':            TMDB_BASE + '/7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg',
  'severance':                  TMDB_BASE + '/lFf6LLrQjYldcZItzOkGmMMigP7.jpg',
  'ted-lasso':                  TMDB_BASE + '/5fhZdwP1DVJ0FyVHvrFFr1wxb6w.jpg',
  'the-bear':                   TMDB_BASE + '/sHF6nWUMW7TnZTNTzCDxQjEdY0E.jpg',
  'wednesday':                  TMDB_BASE + '/9PFonBhy4cQy7Jz20NpMygczOkv.jpg',
  'yellowstone':                TMDB_BASE + '/uoLnG7TWlYZJ7N0xJ4Wm8I0Ftyn.jpg',
  'succession':                 TMDB_BASE + '/7HW47XbkNQ5fiwQFYGWdw9gs144.jpg',
  'breaking-bad':               TMDB_BASE + '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  'better-call-saul':           TMDB_BASE + '/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg',
  'the-crown':                  TMDB_BASE + '/1M876KPjulVwppEpldhdc8V4o68.jpg',
  'bridgerton':                 TMDB_BASE + '/luoKpgVwi1E5nQsi7W0UuKHu2Rq.jpg',
  'true-detective':             TMDB_BASE + '/aDD4tLp4VuG6PNTjjB1bKtJiHou.jpg',
  'fargo':                      TMDB_BASE + '/jpdtAhMTQFOWNDXgGqOSDjFRfd.jpg',
  'sherlock':                   TMDB_BASE + '/7WTsnHkbA0FaG6R9twfFde0I9hl.jpg',
};

function logoFor(slug)    { return KNOWN_LOGOS[slug] || picsumLogo(slug); }
function posterFor(slug)  { return KNOWN_POSTERS[slug] || picsumPoster(slug); }

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
  // Live channels: logo_url is the channel bug (Wikipedia logo when known);
  // poster_url / poster / thumb give shells that draw a card background
  // something to show besides a gradient. Same image is fine — picsum keeps
  // every channel visually distinct because the seed is the slug.
  var logo = logoFor(opts.slug);
  var poster = picsumPoster(opts.slug);
  var thumb = picsumThumb(opts.slug);
  return {
    id: id,
    type: 'live',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'apollo_group',
    category: opts.category,
    logo_url: logo,
    poster_url: poster,
    poster: poster,
    thumb: thumb,
    thumbnail_url: thumb,
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
  // Movies: TMDb poster when known (Top Gun, Dune, Oppenheimer, etc.),
  // picsum 2:3 portrait placeholder otherwise. No logo for VOD — the field
  // is kept for backwards compat with shells that fall back to it.
  var poster = posterFor(opts.slug);
  var thumb = picsumThumb(opts.slug);
  return {
    id: id,
    type: 'vod',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'xtremehd',
    category: opts.category || 'movies',
    logo_url: poster,
    poster_url: poster,
    poster: poster,
    thumb: thumb,
    thumbnail_url: thumb,
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
  // Series: TMDb poster when known (Stranger Things, Severance, The Bear,
  // ...), picsum 2:3 portrait otherwise.
  var poster = posterFor(opts.slug);
  var thumb = picsumThumb(opts.slug);

  // Optional series-only metadata — kept additive so callers that don't
  // set the new fields render exactly the same shape they did before
  // these were introduced. The detail panel checks each field and
  // gracefully hides any block whose backing data is missing.
  var metadata = {
    resolution: opts.resolution || '1080p',
    year: opts.year || 2024,
    seasons: opts.seasons || 1,
    genre: opts.genre || 'drama',
  };
  if (typeof opts.intro_end_seconds === 'number') {
    metadata.intro_end_seconds = opts.intro_end_seconds;
  }
  if (typeof opts.credits_start_seconds === 'number') {
    metadata.credits_start_seconds = opts.credits_start_seconds;
  }
  if (opts.rating_breakdown && typeof opts.rating_breakdown === 'object') {
    metadata.rating_breakdown = opts.rating_breakdown;
  }
  if (typeof opts.trailer_url === 'string' && opts.trailer_url.length > 0) {
    metadata.trailer_url = opts.trailer_url;
  }

  return {
    id: id,
    type: 'series',
    title: opts.title,
    provider: providers[0] ? providers[0].provider_id : 'xtremehd',
    category: opts.category || 'series',
    logo_url: poster,
    poster_url: poster,
    poster: poster,
    thumb: thumb,
    thumbnail_url: thumb,
    profile_access: opts.profile_access || ['dave_tv', 'mom_tv'],
    providers: providers,
    metadata: metadata,
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

// Optional metadata richness — Stranger Things, Severance, The Bear carry
// intro/credits markers + external ratings + a trailer URL so the series
// detail panel has at least three items to demonstrate the new blocks.
// All other series remain on the minimal shape so the additive-field
// contract is exercised by both the present and absent path.
var SERIES_DEFS = [
  {
    slug: 'stranger-things', title: 'Stranger Things', year: 2016, seasons: 4,
    genre: 'series', providers: XTREME, resolution: '4K',
    intro_end_seconds: 78,
    credits_start_seconds: 2820,
    rating_breakdown: { imdb: 8.7, rotten_tomatoes: 92, metacritic: 76 },
    trailer_url: 'https://www.youtube.com/watch?v=b9EkMc79ZSU',
  },
  { slug: 'house-of-dragon', title: 'House of the Dragon', year: 2022, seasons: 2, genre: 'series', providers: XTREME, resolution: '4K' },
  { slug: 'rings-of-power', title: 'The Rings of Power', year: 2022, seasons: 2, genre: 'series', providers: XTREME, resolution: '4K' },
  {
    slug: 'severance', title: 'Severance', year: 2022, seasons: 2,
    genre: 'series', providers: XTREME, resolution: '4K',
    intro_end_seconds: 92,
    credits_start_seconds: 2940,
    rating_breakdown: { imdb: 8.7, rotten_tomatoes: 97, metacritic: 84 },
    trailer_url: 'https://www.youtube.com/watch?v=xEQP4VVuyrY',
  },
  { slug: 'ted-lasso', title: 'Ted Lasso', year: 2020, seasons: 3, genre: 'series', providers: APOLLO, resolution: '1080p' },
  {
    slug: 'the-bear', title: 'The Bear', year: 2022, seasons: 3,
    genre: 'series', providers: XTREME, resolution: '4K',
    intro_end_seconds: 45,
    credits_start_seconds: 1740,
    rating_breakdown: { imdb: 8.6, rotten_tomatoes: 99, metacritic: 87 },
  },
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

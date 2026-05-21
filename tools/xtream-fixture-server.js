#!/usr/bin/env node
'use strict';

/**
 * tools/xtream-fixture-server.js — local Xtream Codes API fixture for CI.
 *
 * Adopted from IPTVnator's apps/xtream-mock-server pattern
 * (G:\Github\IPTV-Apps\iptvnator), adapted for Hermes:
 *   - Single self-contained CommonJS file, no extra deps beyond Node 20+.
 *   - Deterministic JSON fixtures (no marketing PNG/SVG generation).
 *   - Serves /player_api.php with the action-dispatch contract.
 *   - Serves /live/<user>/<pass>/<stream_id>.<ext> with real HLS bytes so
 *     hlsProxy / streamResolver get a 200 with content-type matching the
 *     spec, not a stub error.
 *   - Auth check: any (username, password) pair that matches the env vars
 *     XTREAM_FIXTURE_USER / XTREAM_FIXTURE_PASS passes; everything else
 *     returns auth=0 in the user_info block (per real Xtream behavior).
 *
 * CONTRACT — this fixture EXISTS to prove the pipeline (registry →
 * /api/catalog → /api/play → stream HEAD/GET) end-to-end without ever
 * touching a paid provider. It does NOT replace live provider proof per
 * docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md §"Non-Negotiable Truth Rules"
 * rule 1. The provider-live job in ci.yml + the post-deploy step in
 * deploy-vps.yml are the gates that prove a real upstream works.
 *
 * Usage:
 *   PORT=3210 XTREAM_FIXTURE_USER=demo XTREAM_FIXTURE_PASS=demo \
 *     node tools/xtream-fixture-server.js
 *
 *   Then in another shell:
 *     XTREAM_URL=http://127.0.0.1:3210 \
 *     XTREAM_USERNAME=demo XTREAM_PASSWORD=demo \
 *       npm test --prefix services/hermes-tv-api
 *
 * The test/xtreamFixture.e2e.test.js suite starts + stops this server on
 * a random port automatically. Manual start is for ad-hoc dev probing.
 *
 * Style: CommonJS, var/function, no arrow declarations. Mirrors the rest
 * of the Hermes server code so a single eslint/style pass covers both.
 */

var http = require('http');

// ---------------------------------------------------------------------------
// Fixture data — deterministic and small. Three live channels, two VOD,
// one series with two episodes. Each carries enough metadata that the real
// xtreamClient.toHermesItem helpers and catalog merge logic exercise their
// full code path.
// ---------------------------------------------------------------------------

var FIXTURE_LIVE_CATEGORIES = [
  { category_id: '1', category_name: 'News', parent_id: 0 },
  { category_id: '2', category_name: 'Sports', parent_id: 0 }
];

var FIXTURE_LIVE_STREAMS = [
  {
    num: 1,
    name: 'Fixture News Channel',
    stream_type: 'live',
    stream_id: 1001,
    stream_icon: '',
    epg_channel_id: 'fixture.news',
    added: '1700000000',
    category_id: '1',
    custom_sid: '',
    tv_archive: 0,
    direct_source: '',
    tv_archive_duration: 0
  },
  {
    num: 2,
    name: 'Fixture Sports HD',
    stream_type: 'live',
    stream_id: 1002,
    stream_icon: '',
    epg_channel_id: 'fixture.sports',
    added: '1700000000',
    category_id: '2',
    custom_sid: '',
    tv_archive: 1,
    direct_source: '',
    tv_archive_duration: 7
  },
  {
    num: 3,
    name: 'Fixture Local 24/7',
    stream_type: 'live',
    stream_id: 1003,
    stream_icon: '',
    epg_channel_id: 'fixture.local',
    added: '1700000000',
    category_id: '1',
    custom_sid: '',
    tv_archive: 0,
    direct_source: '',
    tv_archive_duration: 0
  }
];

var FIXTURE_VOD_CATEGORIES = [
  { category_id: '10', category_name: 'Fixture Movies', parent_id: 0 }
];

var FIXTURE_VOD_STREAMS = [
  {
    num: 1,
    name: 'Fixture Test Movie',
    stream_type: 'movie',
    stream_id: 2001,
    stream_icon: '',
    rating: '7',
    rating_5based: '3.5',
    added: '1700000000',
    category_id: '10',
    container_extension: 'mp4',
    custom_sid: '',
    direct_source: ''
  }
];

var FIXTURE_SERIES_CATEGORIES = [
  { category_id: '20', category_name: 'Fixture Series', parent_id: 0 }
];

var FIXTURE_SERIES_LIST = [
  {
    num: 1,
    name: 'Fixture Show',
    series_id: 3001,
    cover: '',
    plot: 'A deterministic fixture series for CI.',
    cast: '',
    director: '',
    genre: 'Drama',
    releaseDate: '2024-01-01',
    last_modified: '1700000000',
    rating: '7',
    rating_5based: 3.5,
    category_id: '20'
  }
];

// Tiny but valid HLS playlist + a 188-byte TS payload (sync byte + filler).
// The TS sync byte 0x47 lets a strict HLS player accept the response shape.
var HLS_VARIANT_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:6.0,',
  'segment-1.ts',
  '#EXTINF:6.0,',
  'segment-2.ts',
  '#EXT-X-ENDLIST',
  ''
].join('\n');

var TS_SEGMENT_BYTES = (function() {
  var buf = Buffer.alloc(188);
  buf[0] = 0x47; // sync byte
  return buf;
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonReply(res, status, body) {
  var s = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(s));
  res.end(s);
}

function authOk(query) {
  var expectedUser = process.env.XTREAM_FIXTURE_USER || 'demo';
  var expectedPass = process.env.XTREAM_FIXTURE_PASS || 'demo';
  return query.username === expectedUser && query.password === expectedPass;
}

function userInfoBlock(authed, query) {
  if (!authed) {
    return {
      user_info: { auth: 0, status: 'Disabled', message: 'invalid credentials' },
      server_info: {}
    };
  }
  return {
    user_info: {
      username: query.username,
      password: query.password,
      message: '',
      auth: 1,
      status: 'Active',
      exp_date: '4102444800', // year 2100
      is_trial: '0',
      active_cons: '0',
      created_at: '1700000000',
      max_connections: '1',
      allowed_output_formats: ['m3u8', 'ts']
    },
    server_info: {
      url: '127.0.0.1',
      port: String(LISTENING_PORT || ''),
      https_port: '',
      server_protocol: 'http',
      rtmp_port: '',
      timezone: 'UTC',
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString()
    }
  };
}

// ---------------------------------------------------------------------------
// player_api.php dispatch — mirrors the IPTVnator pattern with the actions
// xtreamClient actually calls. Unknown actions return an empty array (real
// panels are inconsistent — some 200 + [], some 200 + {}).
// ---------------------------------------------------------------------------

function handlePlayerApi(req, res, query) {
  if (!authOk(query)) {
    return jsonReply(res, 200, userInfoBlock(false, query));
  }
  var action = (query.action || '').toLowerCase();
  switch (action) {
    case '':
    case 'get_account_info':
      return jsonReply(res, 200, userInfoBlock(true, query));
    case 'get_live_categories':
      return jsonReply(res, 200, FIXTURE_LIVE_CATEGORIES);
    case 'get_live_streams':
      return jsonReply(res, 200, FIXTURE_LIVE_STREAMS);
    case 'get_vod_categories':
      return jsonReply(res, 200, FIXTURE_VOD_CATEGORIES);
    case 'get_vod_streams':
      return jsonReply(res, 200, FIXTURE_VOD_STREAMS);
    case 'get_vod_info':
      return jsonReply(res, 200, {
        info: { name: 'Fixture Test Movie', movie_image: '', plot: 'fixture' },
        movie_data: { stream_id: 2001, name: 'Fixture Test Movie', added: '1700000000', container_extension: 'mp4' }
      });
    case 'get_series_categories':
      return jsonReply(res, 200, FIXTURE_SERIES_CATEGORIES);
    case 'get_series':
      return jsonReply(res, 200, FIXTURE_SERIES_LIST);
    case 'get_series_info':
      return jsonReply(res, 200, {
        info: { name: 'Fixture Show', plot: 'fixture', cover: '' },
        episodes: {
          '1': [
            { id: '50001', episode_num: '1', title: 'Pilot', container_extension: 'mp4', added: '1700000000', info: { duration_secs: 60 } }
          ],
          '2': [
            { id: '50002', episode_num: '1', title: 'Season 2 Premiere', container_extension: 'mp4', added: '1700000000', info: { duration_secs: 60 } }
          ]
        }
      });
    case 'get_short_epg':
    case 'get_simple_data_table':
      return jsonReply(res, 200, {
        epg_listings: [
          {
            id: '999',
            epg_id: '1',
            title: 'RklYVFVSRSBOT1c=', // base64('FIXTURE NOW') — Xtream returns base64 titles
            lang: 'en',
            start: new Date().toISOString(),
            end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            description: 'Rml4dHVyZSBjdXJyZW50IHByb2dyYW0=',
            channel_id: query.stream_id || '1001',
            start_timestamp: String(Math.floor(Date.now() / 1000)),
            stop_timestamp: String(Math.floor(Date.now() / 1000) + 1800),
            now_playing: 1,
            has_archive: 0
          }
        ]
      });
    default:
      return jsonReply(res, 200, []);
  }
}

// ---------------------------------------------------------------------------
// Stream endpoints — /live/<user>/<pass>/<stream_id>.<ext> and the matching
// /movie + /series paths. Returns HLS playlist for .m3u8, TS bytes for .ts,
// or 200 + TS bytes for ANY extension (movies/series defaults). Honors
// Range header on TS responses to exercise hlsProxy's range path.
// ---------------------------------------------------------------------------

function handleStream(req, res, parsedPath, query) {
  // path is /live/<user>/<pass>/<stream_id>[.ext] OR /movie/.. OR /series/..
  var parts = parsedPath.split('/').filter(function(p) { return p.length > 0; });
  if (parts.length < 4) { res.statusCode = 404; res.end(); return; }
  var kind = parts[0];
  var user = parts[1];
  var pass = parts[2];
  var idAndExt = parts[3];
  var expectedUser = process.env.XTREAM_FIXTURE_USER || 'demo';
  var expectedPass = process.env.XTREAM_FIXTURE_PASS || 'demo';
  if (user !== expectedUser || pass !== expectedPass) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  // Allow any of live / movie / series at the kind position.
  if (kind !== 'live' && kind !== 'movie' && kind !== 'series') {
    res.statusCode = 404; res.end(); return;
  }
  var lower = idAndExt.toLowerCase();
  if (lower.indexOf('.m3u8') !== -1) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(HLS_VARIANT_PLAYLIST);
    return;
  }
  if (lower.indexOf('.ts') !== -1 || lower.indexOf('segment') !== -1) {
    return serveTsSegment(req, res);
  }
  // No extension — Xtream live default returns transport stream
  return serveTsSegment(req, res);
}

function serveTsSegment(req, res) {
  // Honor Range header so hlsProxy's range plumbing has something to assert.
  var rangeHeader = req.headers.range;
  if (rangeHeader && /^bytes=/.test(rangeHeader)) {
    var match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (match) {
      var start = parseInt(match[1], 10);
      var end = match[2] ? parseInt(match[2], 10) : TS_SEGMENT_BYTES.length - 1;
      if (end >= TS_SEGMENT_BYTES.length) { end = TS_SEGMENT_BYTES.length - 1; }
      if (start <= end && start >= 0) {
        var slice = TS_SEGMENT_BYTES.slice(start, end + 1);
        res.statusCode = 206;
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + TS_SEGMENT_BYTES.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', slice.length);
        res.end(slice);
        return;
      }
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', TS_SEGMENT_BYTES.length);
  res.end(TS_SEGMENT_BYTES);
}

// ---------------------------------------------------------------------------
// /get.php — m3u_plus export form. Used by m3uClient tests that paste an
// Xtream M3U export URL into a provider. Returns a small valid M3U.
// ---------------------------------------------------------------------------

function handleGetPhp(req, res, query) {
  if (!authOk(query)) {
    res.statusCode = 401; res.end('unauthorized'); return;
  }
  var lines = [
    '#EXTM3U url-tvg="" x-tvg-url=""',
    '#EXTINF:-1 tvg-id="fixture.news" tvg-name="Fixture News" tvg-logo="" group-title="News",Fixture News Channel',
    'http://127.0.0.1:' + (LISTENING_PORT || 0) + '/live/' +
      (process.env.XTREAM_FIXTURE_USER || 'demo') + '/' +
      (process.env.XTREAM_FIXTURE_PASS || 'demo') + '/1001.m3u8',
    '#EXTINF:-1 tvg-id="fixture.sports" tvg-name="Fixture Sports HD" tvg-logo="" group-title="Sports",Fixture Sports HD',
    'http://127.0.0.1:' + (LISTENING_PORT || 0) + '/live/' +
      (process.env.XTREAM_FIXTURE_USER || 'demo') + '/' +
      (process.env.XTREAM_FIXTURE_PASS || 'demo') + '/1002.m3u8',
    ''
  ];
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.end(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// /xmltv.php — XMLTV EPG endpoint. Returns a tiny valid XMLTV document.
// ---------------------------------------------------------------------------

function handleXmltv(req, res, query) {
  if (!authOk(query)) {
    res.statusCode = 401; res.end('unauthorized'); return;
  }
  var doc = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    '<tv generator-info-name="hermes-fixture">',
    '  <channel id="fixture.news"><display-name>Fixture News Channel</display-name></channel>',
    '  <channel id="fixture.sports"><display-name>Fixture Sports HD</display-name></channel>',
    '  <programme channel="fixture.news" start="20260520180000 +0000" stop="20260520183000 +0000">',
    '    <title>Fixture News at 6</title>',
    '  </programme>',
    '</tv>',
    ''
  ].join('\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.end(doc);
}

// ---------------------------------------------------------------------------
// HTTP router
// ---------------------------------------------------------------------------

var LISTENING_PORT = null;

function makeServer() {
  return http.createServer(function(req, res) {
    var parsed = new URL(req.url || '/', 'http://127.0.0.1');
    var pathname = parsed.pathname || '/';
    var query = {};
    parsed.searchParams.forEach(function(value, key) {
      query[key] = value;
    });
    if (pathname === '/health') {
      return jsonReply(res, 200, { status: 'ok', service: 'xtream-fixture-server', port: LISTENING_PORT });
    }
    if (pathname === '/player_api.php') {
      return handlePlayerApi(req, res, query);
    }
    if (pathname === '/get.php') {
      return handleGetPhp(req, res, query);
    }
    if (pathname === '/xmltv.php') {
      return handleXmltv(req, res, query);
    }
    if (/^\/(live|movie|series)\//.test(pathname)) {
      return handleStream(req, res, pathname, query);
    }
    res.statusCode = 404;
    res.end('not found');
  });
}

function start(port) {
  return new Promise(function(resolve, reject) {
    var server = makeServer();
    server.on('error', reject);
    server.listen(port || 0, '127.0.0.1', function() {
      LISTENING_PORT = server.address().port;
      resolve({ server: server, port: LISTENING_PORT });
    });
  });
}

function stop(server) {
  return new Promise(function(resolve) {
    if (!server) { return resolve(); }
    server.close(function() { resolve(); });
  });
}

module.exports = { start: start, stop: stop, makeServer: makeServer };

// CLI mode — start on PORT (default 3210) and stay alive.
if (require.main === module) {
  var p = parseInt(process.env.PORT || '3210', 10);
  start(p).then(function(s) {
    console.log('xtream-fixture-server listening on http://127.0.0.1:' + s.port);
    console.log('Configure Hermes with:');
    console.log('  XTREAM_URL=http://127.0.0.1:' + s.port);
    console.log('  XTREAM_USERNAME=' + (process.env.XTREAM_FIXTURE_USER || 'demo'));
    console.log('  XTREAM_PASSWORD=' + (process.env.XTREAM_FIXTURE_PASS || 'demo'));
  }).catch(function(err) {
    console.error('start failed:', err.message || err);
    process.exit(1);
  });
}

'use strict';

/**
 * test/epgWaterfall.test.js — Priority 3 EPG behavior contract.
 *
 * Behaviors adapted from Extreme-InfiniTV's tests/epg-data.test.ts
 * (G:\Github\IPTV-Apps\Extreme-InfiniTV, GPL-3.0) — TEST PATTERNS ONLY,
 * not source code. We re-express the same external behavior contract as
 * fresh CommonJS tests + a fresh CommonJS implementation in
 * lib/epgWaterfall.js. License-risk: PATTERN-ONLY (no GPL source copied).
 *
 * Per docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md "EPG And Catchup":
 *   - M3U header EPG URLs and Xtream xmltv.php defaults are first-class.
 *   - Additional EPG URLs, gzip detection, source waterfall.
 *   - Per-channel override, fuzzy matching, ambiguity rejection, timeshift.
 *
 * Style: CommonJS, Node 20+, no external test framework.
 */

var path = require('path');

var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) {
  console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
  totalFail += 1;
}
function eq(label, actual, expected) {
  var ok;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    ok = (actual.length === expected.length);
    if (ok) {
      for (var i = 0; i < expected.length; i++) {
        if (JSON.stringify(actual[i]) !== JSON.stringify(expected[i])) { ok = false; break; }
      }
    }
  } else if (typeof expected === 'object' && expected !== null) {
    ok = JSON.stringify(actual) === JSON.stringify(expected);
  } else {
    ok = actual === expected;
  }
  if (ok) { pass(label); }
  else { fail(label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function truthy(label, v, detail) { if (v) { pass(label); } else { fail(label, detail); } }

var epg = require(path.resolve(__dirname, '..', 'src', 'lib', 'epgWaterfall.js'));

// Per-priority-3 contract — exported helper surface.
var FNS = ['buildEpgUrlsFromEntry', 'mergeProgrammeMaps', 'mergeChannelNameMaps',
           'detectGzip', 'resolveTvgId', 'normaliseChannelName',
           'findBestEpgChannelByName', 'buildChannelNameIndex',
           'findInChannelNameIndex', 'dedupeEpgUrls',
           'buildPlayableEpgIndex', 'resolvePlayableEpgChannel'];
var missingFn = [];
for (var fi = 0; fi < FNS.length; fi++) {
  if (typeof epg[FNS[fi]] !== 'function') { missingFn.push(FNS[fi]); }
}
if (missingFn.length > 0) {
  console.log('FAIL: epgWaterfall missing exports: ' + missingFn.join(','));
  console.log('=== Results: 0 PASS, 1 FAIL ===');
  process.exit(1);
}

// ---- Test fixtures (placeholder hosts only — no real provider) ----------
var xtreamCreds = { host: 'panel.example.test', port: '8080', user: 'PLACEHOLDER_USER', pass: 'PLACEHOLDER_PASS' };
var m3uCreds    = { host: 'https://m3u.example.test/list.m3u', port: '', user: '', pass: '' };

// ---- buildEpgUrlsFromEntry: Xtream lane ---------------------------------
(function xtreamEpg() {
  var s = epg.buildEpgUrlsFromEntry({}, xtreamCreds, '');
  eq('xtream default: 1 source', s.length, 1);
  if (s[0]) {
    eq('xtream default: url',    s[0].url, 'http://panel.example.test:8080/xmltv.php?username=PLACEHOLDER_USER&password=PLACEHOLDER_PASS');
    eq('xtream default: source', s[0].source, 'xtream-default');
    eq('xtream default: kind',   s[0].kind,   'primary');
  }
  var override = epg.buildEpgUrlsFromEntry({ epgUrl: 'https://override.example.test/g.xml.gz' }, xtreamCreds, '');
  eq('override: 1 source', override.length, 1);
  if (override[0]) {
    eq('override: url',    override[0].url, 'https://override.example.test/g.xml.gz');
    eq('override: source', override[0].source, 'override');
    eq('override: kind',   override[0].kind, 'primary');
  }
  var multi = epg.buildEpgUrlsFromEntry({
    epgUrl: 'https://primary.example.test/p.xml',
    additionalEpgUrls: ['https://extra1.example.test/a.xml', 'https://extra2.example.test/b.xml']
  }, xtreamCreds, '');
  eq('additional URLs: order preserved', multi.map(function(x) { return x.url; }),
     ['https://primary.example.test/p.xml', 'https://extra1.example.test/a.xml', 'https://extra2.example.test/b.xml']);
  if (multi[0]) { eq('additional: [0].kind=primary',    multi[0].kind, 'primary'); }
  if (multi[1]) { eq('additional: [1].kind=additional', multi[1].kind, 'additional'); }
  if (multi[2]) { eq('additional: [2].kind=additional', multi[2].kind, 'additional'); }

  var dup = epg.buildEpgUrlsFromEntry({
    epgUrl: 'https://same.example.test/guide.xml',
    additionalEpgUrls: ['https://same.example.test/guide.xml', 'https://other.example.test/guide.xml']
  }, xtreamCreds, '');
  eq('dedupe: same URL appearing as both primary and additional drops the dup', dup.length, 2);
  if (dup[0]) { eq('dedupe: primary survives', dup[0].url, 'https://same.example.test/guide.xml'); }
  if (dup[1]) { eq('dedupe: distinct other kept', dup[1].url, 'https://other.example.test/guide.xml'); }

  var ws = epg.buildEpgUrlsFromEntry({
    additionalEpgUrls: ['  https://valid.example.test/a.xml  ', '', '   ', 'https://valid.example.test/b.xml']
  }, xtreamCreds, '');
  eq('whitespace: trims + skips blanks', ws.map(function(x) { return x.url; }),
     ['http://panel.example.test:8080/xmltv.php?username=PLACEHOLDER_USER&password=PLACEHOLDER_PASS',
      'https://valid.example.test/a.xml',
      'https://valid.example.test/b.xml']);
})();

// ---- buildEpgUrlsFromEntry: M3U lane ------------------------------------
(function m3uEpg() {
  var s = epg.buildEpgUrlsFromEntry({}, m3uCreds, 'https://example.test/auto.xml.gz');
  eq('m3u header: 1 source', s.length, 1);
  if (s[0]) {
    eq('m3u header: url', s[0].url, 'https://example.test/auto.xml.gz');
    eq('m3u header: source', s[0].source, 'm3u-header');
    eq('m3u header: kind', s[0].kind, 'primary');
  }
  var none = epg.buildEpgUrlsFromEntry({}, m3uCreds, '');
  eq('m3u: empty list when neither override nor header', none.length, 0);

  var winsOverride = epg.buildEpgUrlsFromEntry(
    { epgUrl: 'https://manual.example.test/g.xml' }, m3uCreds, 'https://header.example.test/g.xml');
  eq('override beats m3u header: 1 source', winsOverride.length, 1);
  if (winsOverride[0]) { eq('override beats m3u header: source', winsOverride[0].source, 'override'); }

  var addOnly = epg.buildEpgUrlsFromEntry(
    { additionalEpgUrls: ['https://fallback.example.test/g.xml'] }, m3uCreds, '');
  eq('additional-only: 1 source', addOnly.length, 1);
  if (addOnly[0]) { eq('additional-only: source=additional', addOnly[0].source, 'additional'); }
})();

// ---- disableProviderEpg + edge cases ------------------------------------
(function disable() {
  eq('disableProviderEpg drops xtream-default',
     epg.buildEpgUrlsFromEntry({ disableProviderEpg: true }, xtreamCreds, '').length, 0);
  eq('disableProviderEpg drops m3u-header',
     epg.buildEpgUrlsFromEntry({ disableProviderEpg: true }, m3uCreds, 'https://hdr.example.test/g.xml').length, 0);
  var keepOverride = epg.buildEpgUrlsFromEntry(
    { epgUrl: 'https://manual.example.test/g.xml', disableProviderEpg: true }, xtreamCreds, '');
  eq('disableProviderEpg keeps user override', keepOverride.length, 1);
  if (keepOverride[0]) { eq('keep override source', keepOverride[0].source, 'override'); }
  var keepAdd = epg.buildEpgUrlsFromEntry(
    { additionalEpgUrls: ['https://extra.example.test/a.xml'], disableProviderEpg: true }, xtreamCreds, '');
  eq('disableProviderEpg keeps additional', keepAdd.length, 1);
  if (keepAdd[0]) { eq('keep additional source', keepAdd[0].source, 'additional'); }
})();

(function edges() {
  eq('empty everything: 0 sources',
     epg.buildEpgUrlsFromEntry({}, { host: '', port: '', user: '', pass: '' }, '').length, 0);
  var nullEntry = epg.buildEpgUrlsFromEntry(null, xtreamCreds, '');
  eq('null entry: still derives xtream default', nullEntry.length, 1);
  if (nullEntry[0]) { eq('null entry: source=xtream-default', nullEntry[0].source, 'xtream-default'); }
})();

// ---- mergeProgrammeMaps: waterfall ------------------------------------
(function waterfall() {
  function mk() {
    var m = new Map();
    for (var i = 0; i < arguments.length; i++) {
      m.set(arguments[i][0], [{ start: 0, stop: 1, title: arguments[i][1], desc: '' }]);
    }
    return m;
  }
  eq('empty input → empty map', epg.mergeProgrammeMaps([]).size, 0);
  var single = epg.mergeProgrammeMaps([mk(['a', 'alpha'], ['b', 'beta'])]);
  eq('single source: 2 keys', single.size, 2);
  if (single.get('a')) { eq('single source: a=alpha', single.get('a')[0].title, 'alpha'); }

  var merged = epg.mergeProgrammeMaps([
    mk(['a', 'primary-a'], ['b', 'primary-b']),
    mk(['a', 'additional-a'], ['c', 'additional-c'])
  ]);
  if (merged.get('a')) { eq('waterfall: primary wins', merged.get('a')[0].title, 'primary-a'); }
  if (merged.get('c')) { eq('waterfall: additional fills gap', merged.get('c')[0].title, 'additional-c'); }

  var three = epg.mergeProgrammeMaps([
    mk(['a', 'P']),
    mk(['a', 'S-a'], ['b', 'S-b']),
    mk(['a', 'T-a'], ['b', 'T-b'], ['c', 'T-c'])
  ]);
  if (three.get('a')) { eq('three-step: first wins on a', three.get('a')[0].title, 'P'); }
  if (three.get('b')) { eq('three-step: second wins on b', three.get('b')[0].title, 'S-b'); }
  if (three.get('c')) { eq('three-step: third wins on c', three.get('c')[0].title, 'T-c'); }

  var withNulls = epg.mergeProgrammeMaps([null, mk(['a', 'alpha']), undefined]);
  eq('null entries tolerated', withNulls.size, 1);
})();

// ---- detectGzip ---------------------------------------------------------
(function gzip() {
  var magic = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
  truthy('gzip: magic bytes detected', epg.detectGzip('https://example.test/plain.xml', magic, {}));
  var nonMagic = new Uint8Array([0x3c, 0x3f]); // "<?"
  truthy('gzip: .gz extension detected', epg.detectGzip('https://example.test/guide.xml.gz', nonMagic, {}));
  truthy('gzip: content-type detected',
    epg.detectGzip('https://example.test/x', nonMagic, { contentType: 'application/x-gzip' }));
  truthy('gzip: content-disposition filename detected',
    epg.detectGzip('https://example.test/x', nonMagic, { contentDisposition: 'attachment; filename="guide.xml.gz"' }));
  eq('gzip: clean XML false', epg.detectGzip('https://example.test/guide.xml',
        new Uint8Array([0x3c, 0x3f, 0x78, 0x6d, 0x6c]), { contentType: 'text/xml' }), false);
  eq('gzip: tiny buffer false', epg.detectGzip('https://example.test/x.xml', new Uint8Array(), {}), false);
  eq('gzip: single byte false', epg.detectGzip('https://example.test/x.xml', new Uint8Array([0x1f]), {}), false);
  truthy('gzip: ignores query string when checking extension',
    epg.detectGzip('https://example.test/guide.xml.gz?token=abc', nonMagic, {}));
  eq('gzip: .gz only in query string false',
    epg.detectGzip('https://example.test/guide.xml?token=abc.gz', nonMagic, {}), false);
})();

// ---- normaliseChannelName ----------------------------------------------
(function norm() {
  eq('strips HD',           epg.normaliseChannelName('MDR Sachsen HD'), 'mdrsachsen');
  eq('strips FHD',          epg.normaliseChannelName('BBC One FHD'),    'bbcone');
  eq('strips UHD',          epg.normaliseChannelName('ESPN-UHD'),       'espn');
  eq('strips 4K',           epg.normaliseChannelName('Sky_Sports_4K'),  'skysports');
  eq('strips SD',           epg.normaliseChannelName('RAI 1 SD'),       'rai1');
  eq('spacing-insensitive', epg.normaliseChannelName('Channel 21 HD'), epg.normaliseChannelName('Channel21'));
  eq('separator-insensitive', epg.normaliseChannelName('zdf_neo HD'),    epg.normaliseChannelName('ZDFneo'));
  eq('diacritics dropped',  epg.normaliseChannelName('Télé Québec'),    'telequebec');
  eq('whitespace dropped',  epg.normaliseChannelName('  Channel   4   '), 'channel4');
  eq('punctuation dropped', epg.normaliseChannelName('M6 - HD'),         'm6');
  eq('sat.1 GOLD',          epg.normaliseChannelName('Sat.1 GOLD'),      'sat1gold');
  eq('keeps + (plus channel)', epg.normaliseChannelName('Sky+1 HD'),    'sky+1');
  eq('keeps + alone',       epg.normaliseChannelName('Sky+ HD'),         'sky+');
  eq('does not strip non-quality 2-3 char tail', epg.normaliseChannelName('Eurosport DE'), 'eurosportde');
  eq('ZDF info',            epg.normaliseChannelName('ZDF info'),        'zdfinfo');
  eq('empty input',         epg.normaliseChannelName(''),                '');
  eq('null input',          epg.normaliseChannelName(null),              '');
  eq('undefined input',     epg.normaliseChannelName(undefined),         '');
})();

// ---- findBestEpgChannelByName ------------------------------------------
(function fuzzy() {
  var channelNames = new Map([
    ['mdr.sachsen.de', 'MDR Sachsen'],
    ['mdr.thueringen.de', 'MDR Thüringen'],
    ['bbc1.uk', 'BBC One'],
    ['bbc2.uk', 'BBC Two'],
    ['rai1.it', 'Rai 1']
  ]);
  eq('fuzzy: MDR Sachsen HD → mdr.sachsen.de',
     epg.findBestEpgChannelByName('MDR Sachsen HD', channelNames), 'mdr.sachsen.de');
  eq('fuzzy: MDR Thüringen HD → mdr.thueringen.de',
     epg.findBestEpgChannelByName('MDR Thüringen HD', channelNames), 'mdr.thueringen.de');
  var spacing = new Map([['channel21.de', 'Channel21']]);
  eq('fuzzy: Channel 21 HD → channel21.de',
     epg.findBestEpgChannelByName('Channel 21 HD', spacing), 'channel21.de');
  var sep = new Map([['zdfneo.de', 'ZDFneo']]);
  eq('fuzzy: zdf_neo HD → zdfneo.de',
     epg.findBestEpgChannelByName('zdf_neo HD', sep), 'zdfneo.de');
  eq('fuzzy: no candidate returns empty',
     epg.findBestEpgChannelByName('Nonexistent Channel', channelNames), '');

  var ambiguous = new Map([['a.tv', 'Sky'], ['b.tv', 'Sky HD']]);
  eq('AMBIGUOUS: refuses to guess (returns "")',
     epg.findBestEpgChannelByName('Sky', ambiguous), '');

  eq('fuzzy: exact match with same suffix on both sides',
     epg.findBestEpgChannelByName('Channel HD', new Map([['a.tv', 'Channel HD']])), 'a.tv');

  eq('fuzzy: empty input → empty', epg.findBestEpgChannelByName('', channelNames), '');
  eq('fuzzy: null map → empty', epg.findBestEpgChannelByName('BBC One', null), '');
  eq('fuzzy: empty map → empty', epg.findBestEpgChannelByName('BBC One', new Map()), '');
})();

// ---- resolveTvgId -------------------------------------------------------
(function tvgIdResolve() {
  eq('resolveTvgId: channel tvgId, no override', epg.resolveTvgId({ id: 42, tvgId: 'BBC1.uk' }, {}), 'bbc1.uk');
  eq('resolveTvgId: override beats channel tvgId',
     epg.resolveTvgId({ id: 42, tvgId: 'wrong.id' }, { '42': 'Correct.ID' }), 'correct.id');
  eq('resolveTvgId: override applies when channel has no tvgId',
     epg.resolveTvgId({ id: 7, tvgId: '' }, { '7': 'mapped.tv' }), 'mapped.tv');
  eq('resolveTvgId: empty + no override', epg.resolveTvgId({ id: 1, tvgId: '' }, {}), '');
  eq('resolveTvgId: missing tvgId field', epg.resolveTvgId({ id: 1 }, {}), '');
  eq('resolveTvgId: null channel', epg.resolveTvgId(null, {}), '');
  eq('resolveTvgId: null override map', epg.resolveTvgId({ id: 1, tvgId: 'abc' }, null), 'abc');
  eq('resolveTvgId: undefined override map', epg.resolveTvgId({ id: 1, tvgId: 'abc' }, undefined), 'abc');

  var programmes = new Map([['bbc1.uk', [{ start: 0, stop: 1, title: 'X', desc: '' }]]]);
  var channelNames = new Map([['bbc1.uk', 'BBC One']]);
  eq('resolveTvgId: prefers tvgId when present in programmes',
     epg.resolveTvgId({ id: 1, name: 'BBC One', tvgId: 'bbc1.uk' }, {}, programmes, channelNames), 'bbc1.uk');

  var progs2 = new Map([['mdr.sachsen.de', []]]);
  var names2 = new Map([['mdr.sachsen.de', 'MDR Sachsen']]);
  eq('resolveTvgId: falls through to name match when tvgId not in programmes',
     epg.resolveTvgId({ id: 1, name: 'MDR Sachsen HD', tvgId: 'mdr.sx.hd.de' }, {}, progs2, names2), 'mdr.sachsen.de');

  var progs3 = new Map([['bbc1.uk', []]]);
  var names3 = new Map([['bbc1.uk', 'BBC One']]);
  eq('resolveTvgId: name match when no tvgId at all',
     epg.resolveTvgId({ id: 1, name: 'BBC One HD' }, {}, progs3, names3), 'bbc1.uk');
})();

// ---- mergeChannelNameMaps ----------------------------------------------
(function chanMerge() {
  var primary = new Map([['bbc1.uk', 'BBC One'], ['bbc2.uk', 'BBC Two']]);
  var additional = new Map([['bbc1.uk', 'Beeb 1'], ['itv.uk', 'ITV']]);
  var merged = epg.mergeChannelNameMaps([primary, additional]);
  eq('mergeChan: primary wins', merged.get('bbc1.uk'), 'BBC One');
  eq('mergeChan: primary keeps unique', merged.get('bbc2.uk'), 'BBC Two');
  eq('mergeChan: additional fills gap', merged.get('itv.uk'), 'ITV');

  var withEmpty = epg.mergeChannelNameMaps([null, new Map([['a', ''], ['b', 'Beta']])]);
  eq('mergeChan: skips null + empty value', withEmpty.size, 1);
  eq('mergeChan: empty value not set', withEmpty.get('b'), 'Beta');
})();

// ---- buildChannelNameIndex + findInChannelNameIndex --------------------
(function indexed() {
  var channelNames = new Map([
    ['bbc1.uk', 'BBC One'],
    ['bbc2.uk', 'BBC Two'],
    ['channel21.de', 'Channel21']
  ]);
  var idx = epg.buildChannelNameIndex(channelNames);
  truthy('index: built >= 3 entries', idx.size >= 3);
  eq('index: BBC One', epg.findInChannelNameIndex('BBC One', idx), 'bbc1.uk');
  eq('index: Channel 21 HD', epg.findInChannelNameIndex('Channel 21 HD', idx), 'channel21.de');

  var ambiguous = new Map([['a.tv', 'Sky'], ['b.tv', 'Sky HD']]);
  var aidx = epg.buildChannelNameIndex(ambiguous);
  eq('index: collision → "" (no guess)', epg.findInChannelNameIndex('Sky', aidx), '');

  eq('index: null input → empty index', epg.buildChannelNameIndex(null).size, 0);
  eq('index: null index → ""', epg.findInChannelNameIndex('x', null), '');
  eq('index: empty index → ""', epg.findInChannelNameIndex('x', new Map()), '');

  // Agreement with pure helper
  var pureIdx = epg.buildChannelNameIndex(channelNames);
  for (var k = 0, candidates = ['BBC One', 'Channel 21 HD', 'Nonexistent']; k < candidates.length; k++) {
    eq('index agrees with pure helper for "' + candidates[k] + '"',
       epg.findInChannelNameIndex(candidates[k], pureIdx),
       epg.findBestEpgChannelByName(candidates[k], channelNames));
  }
})();

// ---- playable catalog/source mapping -----------------------------------
(function playableMapping() {
  var index = epg.buildPlayableEpgIndex([
    {
      id: 'm3u-prov-123-disk-news',
      type: 'live',
      title: 'Disk News HD',
      provider: 'm3u-prov-123',
      metadata: { tvg_id: 'disk-news' },
      sources: [{
        provider_id: 'm3u-prov-123',
        item_id: 'm3u-prov-123-disk-news',
        source_id: 'disk-news'
      }]
    },
    {
      id: 'xtream-prov-abc-live-101',
      type: 'live',
      title: 'Xtream News',
      provider: 'xtream-prov-abc',
      metadata: { tvg_id: 'xtream-news' },
      sources: [{
        provider_id: 'xtream-prov-abc',
        item_id: 'xtream-prov-abc-live-101',
        source_id: '101'
      }]
    },
    {
      id: 'm3u-prov-123-sky-a',
      type: 'live',
      title: 'Sky HD',
      sources: [{ provider_id: 'm3u-prov-123', item_id: 'm3u-prov-123-sky-a', source_id: 'sky-a' }]
    },
    {
      id: 'm3u-prov-456-sky-b',
      type: 'live',
      title: 'Sky',
      sources: [{ provider_id: 'm3u-prov-456', item_id: 'm3u-prov-456-sky-b', source_id: 'sky-b' }]
    },
    {
      id: 'movie-not-live',
      type: 'movie',
      title: 'Disk News',
      metadata: { tvg_id: 'movie-news' }
    }
  ]);

  var exact = epg.resolvePlayableEpgChannel('DISK-NEWS', 'Wrong Name', index);
  truthy('playable map: exact tvg-id resolves', exact && exact.catalog_item_id === 'm3u-prov-123-disk-news', JSON.stringify(exact));
  if (exact) {
    eq('playable map: exact source_id carried', exact.source_id, 'disk-news');
    eq('playable map: exact strategy', exact.match_strategy, 'tvg_id');
  }

  var xtream = epg.resolvePlayableEpgChannel('xtream-news', 'Wrong Name', index);
  truthy('playable map: xtream metadata.tvg_id resolves', xtream && xtream.catalog_item_id === 'xtream-prov-abc-live-101', JSON.stringify(xtream));
  if (xtream) {
    eq('playable map: xtream keeps provider stream source_id', xtream.source_id, '101');
  }

  var byName = epg.resolvePlayableEpgChannel('', 'Disk News', index);
  truthy('playable map: unique name fallback resolves', byName && byName.catalog_item_id === 'm3u-prov-123-disk-news', JSON.stringify(byName));
  if (byName) { eq('playable map: name strategy', byName.match_strategy, 'name'); }

  eq('playable map: ambiguous name refuses to guess',
     epg.resolvePlayableEpgChannel('', 'Sky HD', index), null);
  eq('playable map: missing returns null',
     epg.resolvePlayableEpgChannel('missing.tvg', 'Missing TV', index), null);
})();

// ---- Final tally --------------------------------------------------------
console.log('');
console.log('=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
process.exit(totalFail === 0 ? 0 : 1);

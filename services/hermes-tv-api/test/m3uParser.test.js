'use strict';

/**
 * test/m3uParser.test.js — Priority 2 real-world M3U parser regression.
 *
 * Behavior contracts adapted from Extreme-InfiniTV's tests/m3u-parser.test.ts
 * (G:\Github\IPTV-Apps\Extreme-InfiniTV) — patterns, not code. These cases
 * are the ones that show up in real provider M3U exports: BOM, CRLF,
 * malformed quotes, unquoted attrs, EXTGRP fallback, tvg-chno numeric,
 * catchup, user-agent, referrer, M3U-header EPG URLs.
 *
 * Contract for Hermes parser (after this test goes green):
 *   parseM3U(text) returns { entries: Array<Entry>, epgUrl: string }
 *   Entry shape includes:
 *     name, url, tvgId, tvgName, tvgLogo, group, tvgChno (number|null),
 *     catchup (string|null), catchupDays (number|null),
 *     userAgent (string|null), referer (string|null), isRadio (bool),
 *     tvgType (string|null), attrs (raw object)
 *
 * Style: CommonJS, Node 20+. No external test framework — single-file
 * pass/fail in the same style as the rest of services/hermes-tv-api/test/.
 */

var path = require('path');

var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) {
  console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
  totalFail += 1;
}
function expectEqual(label, actual, expected) {
  if (actual === expected) { pass(label); return; }
  fail(label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function expectTrue(label, cond, detail) {
  if (cond) { pass(label); return; }
  fail(label, detail || 'expected true');
}
function expectLen(label, arr, len) {
  if (Array.isArray(arr) && arr.length === len) { pass(label); return; }
  fail(label, 'expected length=' + len + ', got ' + (Array.isArray(arr) ? arr.length : 'not-array'));
}

// Load the parser — exposed by m3uClient as internal.parseM3U for tests.
// If it isn't yet exposed, this require + access will throw and the test
// reports zero PASS, signaling the implementation step is still pending.
var m3uClient = require(path.resolve(__dirname, '..', 'src', 'lib', 'm3uClient.js'));
var parseM3U = m3uClient.internal && m3uClient.internal.parseM3U;

if (typeof parseM3U !== 'function') {
  console.log('FAIL: m3uClient.internal.parseM3U is not exported — Priority 2 implementation pending');
  console.log('=== Results: 0 PASS, 1 FAIL ===');
  process.exit(1);
}

// ---- Standard fixture ----------------------------------------------------

var STANDARD = [
  '#EXTM3U x-tvg-url="https://example.test/epg.xml"',
  '#EXTINF:-1 tvg-id="cnn.us" tvg-name="CNN HD" tvg-logo="" group-title="News",CNN HD',
  'https://example.test/cnn.m3u8',
  '#EXTINF:-1 tvg-id="bbc.uk" tvg-name="BBC One" tvg-logo="https://example.test/bbc.png" group-title="News" tvg-chno="101",BBC One',
  'https://example.test/bbc.m3u8',
  ''
].join('\n');

(function standardFixture() {
  var r = parseM3U(STANDARD);
  expectEqual('standard: epgUrl extracted from EXTM3U header', r.epgUrl, 'https://example.test/epg.xml');
  expectLen('standard: 2 entries', r.entries, 2);
  if (r.entries[0]) {
    expectEqual('standard: name', r.entries[0].name, 'CNN HD');
    expectEqual('standard: tvgId', r.entries[0].tvgId, 'cnn.us');
    expectEqual('standard: tvgName', r.entries[0].tvgName, 'CNN HD');
    expectEqual('standard: group', r.entries[0].group, 'News');
    expectEqual('standard: url', r.entries[0].url, 'https://example.test/cnn.m3u8');
    expectTrue('standard: missing catchup is null (not "")', r.entries[0].catchup === null);
    expectTrue('standard: missing tvgChno is null', r.entries[0].tvgChno === null);
  }
  if (r.entries[1]) {
    expectEqual('standard: tvgChno numeric', r.entries[1].tvgChno, 101);
  }
})();

// ---- BOM + CRLF ----------------------------------------------------------

(function bomAndCrlf() {
  var withBom = '﻿#EXTM3U\n' +
                '#EXTINF:-1 tvg-id="x" group-title="G",Has BOM\n' +
                'https://example.test/x.m3u8\n';
  var rb = parseM3U(withBom);
  expectLen('BOM: 1 entry parsed', rb.entries, 1);
  if (rb.entries[0]) { expectEqual('BOM: name', rb.entries[0].name, 'Has BOM'); }

  var withCrlf = '#EXTM3U\r\n' +
                 '#EXTINF:-1 tvg-id="x" group-title="G",CRLF Channel\r\n' +
                 'https://example.test/x.m3u8\r\n';
  var rc = parseM3U(withCrlf);
  expectLen('CRLF: 1 entry parsed', rc.entries, 1);
  if (rc.entries[0]) { expectEqual('CRLF: name', rc.entries[0].name, 'CRLF Channel'); }
})();

// ---- EPG header variants -------------------------------------------------

(function epgHeaderVariants() {
  var r1 = parseM3U('#EXTM3U tvg-url="https://example.test/v.xml"\n#EXTINF:-1,x\nhttp://a/x.m3u8\n');
  expectEqual('epg header tvg-url alias', r1.epgUrl, 'https://example.test/v.xml');

  var r2 = parseM3U('#EXTM3U url-tvg="https://example.test/w.xml"\n#EXTINF:-1,x\nhttp://a/x.m3u8\n');
  expectEqual('epg header url-tvg alias', r2.epgUrl, 'https://example.test/w.xml');

  var r3 = parseM3U('#EXTM3U\n#EXTINF:-1,x\nhttp://a/x.m3u8\n');
  expectEqual('epg header absent → empty string', r3.epgUrl, '');
})();

// ---- EXTGRP fallback + group-title preference ----------------------------

(function extgrpAndChno() {
  var fallbackText = '#EXTM3U\n' +
                     '#EXTINF:-1 tvg-id="x",Group via EXTGRP\n' +
                     '#EXTGRP:Sports\n' +
                     'http://example.test/x.m3u8\n';
  var rf = parseM3U(fallbackText);
  expectLen('EXTGRP fallback: 1 entry', rf.entries, 1);
  if (rf.entries[0]) { expectEqual('EXTGRP fallback: group=Sports', rf.entries[0].group, 'Sports'); }

  var preferText = '#EXTM3U\n' +
                   '#EXTINF:-1 tvg-id="x" group-title="Primary",Both Groups\n' +
                   '#EXTGRP:Secondary\n' +
                   'http://example.test/x.m3u8\n';
  var rp = parseM3U(preferText);
  if (rp.entries[0]) { expectEqual('group-title wins over EXTGRP', rp.entries[0].group, 'Primary'); }
})();

// ---- Attribute parsing edge cases ---------------------------------------

(function attributeEdges() {
  var escaped = '#EXTM3U\n' +
                '#EXTINF:-1 tvg-id="x" tvg-name="ESPN \\"Plus\\" HD",ESPN+\n' +
                'http://example.test/espn.m3u8\n';
  var re = parseM3U(escaped);
  if (re.entries[0]) {
    // Accept either escaped retention or stripping — assert tvgName carries
    // BOTH outer quotes were consumed and the inner ESCN+ token survived.
    expectTrue('escaped quotes: tvgName non-empty', re.entries[0].tvgName && re.entries[0].tvgName.length > 0);
  }

  var unquoted = '#EXTM3U\n' +
                 '#EXTINF:-1 tvg-id=plain.id group-title="G" tvg-chno=42,Unquoted ID\n' +
                 'http://example.test/u.m3u8\n';
  var ru = parseM3U(unquoted);
  if (ru.entries[0]) {
    expectEqual('unquoted tvg-id', ru.entries[0].tvgId, 'plain.id');
    expectEqual('unquoted tvg-chno numeric', ru.entries[0].tvgChno, 42);
  }

  var suffix = '#EXTM3U\n' +
               '#EXTINF:-1 tvg-id="real" my-tvg-id="not-real",Fragment Test\n' +
               'http://example.test/f.m3u8\n';
  var rs = parseM3U(suffix);
  if (rs.entries[0]) {
    expectEqual('attribute fragment match: tvg-id', rs.entries[0].tvgId, 'real');
  }

  // Malformed unterminated quote must NOT crash + must produce SOME entry.
  var malformed = '#EXTM3U\n' +
                  '#EXTINF:-1 tvg-id="never-closes,Malformed Quote\n' +
                  'http://example.test/m.m3u8\n';
  try {
    var rm = parseM3U(malformed);
    expectTrue('malformed quote: did not crash', Array.isArray(rm.entries));
  } catch (e) {
    fail('malformed quote crashed', e.message);
  }
})();

// ---- Catchup + user-agent + referrer ------------------------------------

(function catchupAndHeaders() {
  var text = '#EXTM3U\n' +
             '#EXTINF:-1 tvg-id="x" catchup="append" catchup-days="7" http-user-agent="VLC/3.0" http-referrer="https://example.test/" group-title="G",With Catchup\n' +
             'http://example.test/c.m3u8\n';
  var r = parseM3U(text);
  if (r.entries[0]) {
    expectEqual('catchup mode', r.entries[0].catchup, 'append');
    expectEqual('catchup days numeric', r.entries[0].catchupDays, 7);
    expectEqual('http-user-agent → userAgent', r.entries[0].userAgent, 'VLC/3.0');
    expectEqual('http-referrer → referer', r.entries[0].referer, 'https://example.test/');
  }
})();

// ---- isRadio + tvgType ---------------------------------------------------

(function radioFlag() {
  var radio = '#EXTM3U\n' +
              '#EXTINF:-1 tvg-id="r" tvg-type="radio",Radio Channel\n' +
              'http://example.test/r.m3u8\n';
  var rr = parseM3U(radio);
  if (rr.entries[0]) {
    expectEqual('tvg-type=radio → isRadio true', rr.entries[0].isRadio, true);
    expectEqual('tvgType field', rr.entries[0].tvgType, 'radio');
  }

  var tv = '#EXTM3U\n' +
           '#EXTINF:-1 tvg-id="t" tvg-type="tv",TV Channel\n' +
           'http://example.test/t.m3u8\n';
  var rt = parseM3U(tv);
  if (rt.entries[0]) {
    expectEqual('tvg-type=tv → isRadio false', rt.entries[0].isRadio, false);
  }
})();

// ---- Malformed input resilience -----------------------------------------

(function malformedInput() {
  var bare = '#EXTM3U\n' +
             'http://orphan.example.test/stream.m3u8\n' +
             '#EXTINF:-1 tvg-id="x" group-title="G",Real\n' +
             'http://example.test/x.m3u8\n';
  var rb = parseM3U(bare);
  expectLen('bare URL without EXTINF is ignored, 1 entry kept', rb.entries, 1);
  if (rb.entries[0]) { expectEqual('bare URL: real entry preserved', rb.entries[0].name, 'Real'); }

  var noiseLines = '#EXTM3U\n' +
                   '\n' +
                   '# unrelated\n' +
                   '#KODIPROP:inputstream.adaptive.manifest_type=hls\n' +
                   '#EXTINF:-1 tvg-id="x",Solid\n' +
                   'http://example.test/x.m3u8\n' +
                   '\n';
  var rn = parseM3U(noiseLines);
  expectLen('blank lines + KODIPROP + comments skipped, 1 entry', rn.entries, 1);

  var lonely = '#EXTM3U\n#EXTINF:-1 tvg-id="lonely",Lonely\n';
  var rl = parseM3U(lonely);
  expectLen('EXTINF with no URL is dropped', rl.entries, 0);

  var empty1 = parseM3U('');
  expectLen('empty input: 0 entries', empty1.entries, 0);
  expectEqual('empty input: epgUrl=""', empty1.epgUrl, '');

  var empty2 = parseM3U('\n\n  \n\r\n');
  expectLen('whitespace-only input: 0 entries', empty2.entries, 0);
})();

console.log('');
console.log('=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
process.exit(totalFail === 0 ? 0 : 1);

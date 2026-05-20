#!/usr/bin/env node
'use strict';

/**
 * test/hlsProxy.test.js — Smoke test for lib/hlsProxy.js.
 *
 * Runs the pure rewritePlaylist() against a realistic xTremeHD-shaped
 * playlist and asserts:
 *   - No upstream host or credential survives in the rewritten body.
 *   - Every non-tag, non-empty line points at /api/proxy/<ticket>/seg/...
 *   - HLS tags (#EXTM3U, #EXT-X-VERSION, #EXTINF, ...) are preserved.
 *   - URI="..." on #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA is rewritten.
 *   - Relative segment URLs are resolved against the upstream base URL.
 *   - Base64url round-trip is lossless.
 *
 * Run via `npm test` (wired in package.json). Exit non-zero on any
 * failure so CI gates can pick it up.
 */

var hlsProxy = require('../src/lib/hlsProxy');
var rewritePlaylist = hlsProxy._internal.rewritePlaylist;
var b64urlEncode = hlsProxy._internal.b64urlEncode;
var b64urlDecode = hlsProxy._internal.b64urlDecode;

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

// ---------------------------------------------------------------------------
// 1. Base64url round-trip
// ---------------------------------------------------------------------------
var sample = 'http://host.example/live/USER/PASS/12345.m3u8';
var encoded = b64urlEncode(sample);
ok('b64url encode is URL-safe — no + / =', !/[+/=]/.test(encoded));
ok('b64url round-trip is lossless', b64urlDecode(encoded) === sample);

// ---------------------------------------------------------------------------
// 2. Playlist rewrite — typical xTremeHD media playlist with absolute URLs
// ---------------------------------------------------------------------------
var UPSTREAM = 'http://operator.example/live/USER/PASS/12345.m3u8';
var TICKET = 'play-test-abc123';

var playlistAbsolute = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:1000',
  '#EXTINF:6.0,',
  'http://operator.example/live/USER/PASS/12345-1000.ts',
  '#EXTINF:6.0,',
  'http://operator.example/live/USER/PASS/12345-1001.ts',
  '#EXTINF:6.0,',
  'http://operator.example/live/USER/PASS/12345-1002.ts',
  ''
].join('\n');

var rewritten = rewritePlaylist(playlistAbsolute, UPSTREAM, TICKET);
var rewrittenLines = rewritten.split('\n');

ok('Rewritten body contains no upstream host',
  rewritten.indexOf('operator.example') === -1,
  '\n' + rewritten);

ok('Rewritten body contains no embedded credentials',
  rewritten.indexOf('USER') === -1 && rewritten.indexOf('PASS') === -1,
  '\n' + rewritten);

ok('Tag lines preserved verbatim',
  rewrittenLines[0] === '#EXTM3U' &&
  rewrittenLines[1] === '#EXT-X-VERSION:3' &&
  rewrittenLines[2] === '#EXT-X-TARGETDURATION:6' &&
  rewrittenLines[3] === '#EXT-X-MEDIA-SEQUENCE:1000',
  '\n' + rewrittenLines.slice(0, 4).join('\n'));

ok('#EXTINF tags preserved',
  rewrittenLines[4] === '#EXTINF:6.0,' &&
  rewrittenLines[6] === '#EXTINF:6.0,' &&
  rewrittenLines[8] === '#EXTINF:6.0,');

// Segment lines should be /api/proxy/<ticket>/seg/<b64>
ok('Segment line 1 starts with /api/proxy/',
  rewrittenLines[5].indexOf('/api/proxy/' + TICKET + '/seg/') === 0,
  rewrittenLines[5]);
ok('Segment line 2 starts with /api/proxy/',
  rewrittenLines[7].indexOf('/api/proxy/' + TICKET + '/seg/') === 0,
  rewrittenLines[7]);
ok('Segment line 3 starts with /api/proxy/',
  rewrittenLines[9].indexOf('/api/proxy/' + TICKET + '/seg/') === 0,
  rewrittenLines[9]);

// Spot-check the base64url decodes back to the credentialed URL
var seg1B64 = rewrittenLines[5].split('/seg/')[1];
ok('Segment 1 base64url decodes to credentialed upstream',
  b64urlDecode(seg1B64) === 'http://operator.example/live/USER/PASS/12345-1000.ts',
  'decoded: ' + b64urlDecode(seg1B64));

// ---------------------------------------------------------------------------
// 3. Relative segment URLs — common with master playlists / CMAF
// ---------------------------------------------------------------------------
var playlistRelative = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXTINF:6.0,',
  'segment-1000.ts',
  '#EXTINF:6.0,',
  './segment-1001.ts',
  '#EXTINF:6.0,',
  '../alt/segment-1002.ts',
  ''
].join('\n');

var rewrittenRel = rewritePlaylist(playlistRelative, UPSTREAM, TICKET);
var rewrittenRelLines = rewrittenRel.split('\n');

ok('Relative segment line resolved to absolute via base URL',
  rewrittenRelLines[4].indexOf('/api/proxy/') === 0,
  rewrittenRelLines[4]);

var relSeg1 = b64urlDecode(rewrittenRelLines[4].split('/seg/')[1]);
ok('Relative segment 1 absolutized correctly',
  relSeg1 === 'http://operator.example/live/USER/PASS/segment-1000.ts',
  'decoded: ' + relSeg1);

var relSeg2 = b64urlDecode(rewrittenRelLines[6].split('/seg/')[1]);
ok('Relative segment 2 (./) absolutized correctly',
  relSeg2 === 'http://operator.example/live/USER/PASS/segment-1001.ts',
  'decoded: ' + relSeg2);

var relSeg3 = b64urlDecode(rewrittenRelLines[8].split('/seg/')[1]);
ok('Relative segment 3 (../) absolutized correctly',
  relSeg3 === 'http://operator.example/live/USER/alt/segment-1002.ts',
  'decoded: ' + relSeg3);

// ---------------------------------------------------------------------------
// 4. URI="..." rewriting on #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA
// ---------------------------------------------------------------------------
var playlistWithUri = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-KEY:METHOD=AES-128,URI="http://operator.example/live/USER/PASS/key.bin",IV=0x12345',
  '#EXT-X-MAP:URI="init.mp4"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="http://operator.example/live/USER/PASS/audio.m3u8"',
  '#EXTINF:6.0,',
  'http://operator.example/live/USER/PASS/seg-1.ts',
  ''
].join('\n');

var rewrittenUri = rewritePlaylist(playlistWithUri, UPSTREAM, TICKET);
var rewrittenUriLines = rewrittenUri.split('\n');

ok('No upstream host in URI-attr playlist body',
  rewrittenUri.indexOf('operator.example') === -1,
  '\n' + rewrittenUri);

ok('#EXT-X-KEY URI rewritten to /api/proxy/',
  rewrittenUriLines[2].indexOf('URI="/api/proxy/' + TICKET + '/seg/') !== -1 &&
  rewrittenUriLines[2].indexOf('METHOD=AES-128') !== -1 &&
  rewrittenUriLines[2].indexOf('IV=0x12345') !== -1,
  rewrittenUriLines[2]);

ok('#EXT-X-MAP URI rewritten (relative init segment)',
  rewrittenUriLines[3].indexOf('URI="/api/proxy/' + TICKET + '/seg/') !== -1,
  rewrittenUriLines[3]);

var keyUri = /URI="([^"]+)"/.exec(rewrittenUriLines[2]);
var keyB64 = keyUri[1].split('/seg/')[1];
ok('#EXT-X-KEY URI decodes to credentialed upstream',
  b64urlDecode(keyB64) === 'http://operator.example/live/USER/PASS/key.bin');

ok('#EXT-X-MEDIA URI rewritten + other attrs preserved',
  rewrittenUriLines[4].indexOf('TYPE=AUDIO') !== -1 &&
  rewrittenUriLines[4].indexOf('GROUP-ID="audio"') !== -1 &&
  rewrittenUriLines[4].indexOf('URI="/api/proxy/') !== -1,
  rewrittenUriLines[4]);

// ---------------------------------------------------------------------------
// 5. Single-quoted URI also handled (some encoders emit single quotes)
// ---------------------------------------------------------------------------
var singleQ = '#EXT-X-KEY:METHOD=AES-128,URI=\'http://operator.example/key.bin\'';
var rewrittenSQ = rewritePlaylist(singleQ + '\n', UPSTREAM, TICKET);
ok('Single-quoted URI also rewritten',
  rewrittenSQ.indexOf('operator.example') === -1 &&
  rewrittenSQ.indexOf("URI='/api/proxy/") !== -1,
  rewrittenSQ);

// ---------------------------------------------------------------------------
// 6. Empty + comment lines preserved
// ---------------------------------------------------------------------------
var withBlanks = [
  '#EXTM3U',
  '',
  '#EXT-X-VERSION:3',
  '',
  '#EXTINF:6.0,',
  'http://operator.example/seg.ts'
].join('\n');
var rewrittenBlanks = rewritePlaylist(withBlanks, UPSTREAM, TICKET);
var blanksLines = rewrittenBlanks.split('\n');
ok('Empty lines preserved in rewrite',
  blanksLines[1] === '' && blanksLines[3] === '');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('---');
console.log('PASS:', pass, '  FAIL:', fail);
if (fail > 0) {
  process.exit(1);
}

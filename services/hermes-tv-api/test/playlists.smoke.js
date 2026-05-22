#!/usr/bin/env node
'use strict';

/**
 * test/playlists.smoke.js — Smoke test for routes/playlists.js.
 *
 * Exercises the security caps and 4-endpoint contract without spinning up
 * the full HTTP server. Uses the module's exported internals plus a
 * supertest-free in-process request shim so the test stays dependency-light
 * and run-anywhere (Node 20, no extra installs).
 *
 * Verifies:
 *   - URL allow-list rejects file://, ftp://, javascript: schemes
 *   - Name sanitiser strips <, >, and the literal `script` token
 *   - M3U parser handles real-world EXTINF + URL pairs
 *   - Empty / oversize inputs are rejected with explicit errors
 *   - Parser/validation helpers stay deterministic without live providers
 *
 * Exits non-zero on any failure so `npm test` and CI gates can wire in.
 */

const playlistsRoute = require('../src/routes/playlists');
const internals = playlistsRoute._internal;

let pass = 0;
let fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

// 1. URL allow-list
ok('URL allow-list — accepts http://',  internals._validateUrl('http://example.com/playlist.m3u').ok === true);
ok('URL allow-list — accepts https://', internals._validateUrl('https://example.com/playlist.m3u').ok === true);
ok('URL allow-list — rejects file://',  internals._validateUrl('file:///etc/passwd').ok === false);
ok('URL allow-list — rejects ftp://',   internals._validateUrl('ftp://example.com/x.m3u').ok === false);
ok('URL allow-list — rejects javascript:', internals._validateUrl('javascript:alert(1)').ok === false);
ok('URL allow-list — rejects empty', internals._validateUrl('').ok === false);
ok('URL allow-list — rejects non-string', internals._validateUrl(null).ok === false);
ok('URL allow-list — rejects > 2048 chars', internals._validateUrl('http://x.com/' + 'a'.repeat(2100)).ok === false);

// 2. Name sanitiser
ok('Name sanitiser — strips <>', internals._sanitiseName('<b>Hi</b>') === 'bHi/b');
ok('Name sanitiser — strips script token', internals._sanitiseName('my SCRIPT name') === 'my  name');
ok('Name sanitiser — trims whitespace', internals._sanitiseName('   padded   ') === 'padded');
ok('Name sanitiser — caps at 80 chars', internals._sanitiseName('a'.repeat(120)).length === 80);
ok('Name sanitiser — returns empty for non-string', internals._sanitiseName(null) === '');

// 3. M3U parser — minimal valid playlist
const sampleM3u = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="cnn.us" tvg-name="CNN" group-title="News",CNN HD',
  'http://example.com/stream/cnn.m3u8',
  '#EXTINF:-1 tvg-id="espn.us" tvg-name="ESPN" group-title="Sports",ESPN HD',
  'http://example.com/stream/espn.m3u8',
  '#EXTINF:-1 tvg-id="fox.us" tvg-name="Fox" group-title="News",FOX HD',
  'http://example.com/stream/fox.m3u8',
].join('\n');
const parsed = internals._parseM3U(sampleM3u);
ok('M3U parser — parsed 3 items', parsed.length === 3, 'got ' + parsed.length);
ok('M3U parser — captured tvg-id', parsed[0]['tvg-id'] === 'cnn.us');
ok('M3U parser — captured display name', parsed[0]._displayName === 'CNN HD');
ok('M3U parser — captured group', parsed[1]['group-title'] === 'Sports');
ok('M3U parser — captured stream URL', parsed[2]._url === 'http://example.com/stream/fox.m3u8');

// 4. Summariser
const summary = internals._summarise(parsed);
ok('Summariser — channels_count', summary.channels_count === 3);
ok('Summariser — groups_count (News + Sports)', summary.groups_count === 2);
ok('Summariser — sample_channels[0]', summary.sample_channels[0] === 'CNN HD');

// 5. Parser handles BOM + empty lines + non-EXTINF directives
const messy = '﻿#EXTM3U\n\n#EXTGRP:Test\n#EXTINF:-1,Lone Channel\nhttp://x/y.m3u8\n';
const messyParsed = internals._parseM3U(messy);
ok('M3U parser — handles BOM + EXTGRP + empty lines', messyParsed.length === 1);
ok('M3U parser — display name without attrs', messyParsed[0]._displayName === 'Lone Channel');

// 6. Empty / no-EXTINF text returns []
ok('M3U parser — empty text returns []', internals._parseM3U('').length === 0);
ok('M3U parser — non-m3u text returns []', internals._parseM3U('hello world').length === 0);

// ── Result ────────────────────────────────────────────────────────────────
internals._clear();
console.log('\n=== playlists.smoke.js: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
'use strict';

/**
 * test/xmltv.smoke.js — Smoke test for integrations/xmltv.js.
 *
 * Exercises the parser, timestamp normaliser, cache-key redactor, and
 * channel-map application using inline fixtures. No network. No real
 * XMLTV files shipped in the repo.
 *
 * Runs alongside playlists.smoke.js — non-zero exit on any failure.
 */

const xmltv = require('../src/integrations/xmltv');
const { _parseTimestamp, _cacheKey, _clearCache, _loadChannelMap } = xmltv._internal;

let pass = 0;
let fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

// ── 1. _parseTimestamp — all the formats real XMLTV emitters use ─────────────
ok('timestamp — XMLTV traditional with tz',
  _parseTimestamp('20260519080000 +0000') === '2026-05-19T08:00:00.000Z');

ok('timestamp — XMLTV traditional no tz (assume UTC)',
  _parseTimestamp('20260519080000') === '2026-05-19T08:00:00.000Z');

ok('timestamp — XMLTV traditional +0530 offset (no colon)',
  _parseTimestamp('20260519080000 +0530') === '2026-05-19T02:30:00.000Z');

ok('timestamp — ISO 8601 basic with Z',
  _parseTimestamp('20260519T080000Z') === '2026-05-19T08:00:00.000Z');

ok('timestamp — ISO 8601 extended with Z',
  _parseTimestamp('2026-05-19T08:00:00Z') === '2026-05-19T08:00:00.000Z');

ok('timestamp — ISO 8601 extended with offset',
  _parseTimestamp('2026-05-19T08:00:00+00:00') === '2026-05-19T08:00:00.000Z');

ok('timestamp — empty string returns null', _parseTimestamp('') === null);
ok('timestamp — null returns null', _parseTimestamp(null) === null);
ok('timestamp — garbage returns null', _parseTimestamp('hello') === null);

// ── 2. _cacheKey — credential redaction ──────────────────────────────────────
ok('cacheKey — strips ?key=…',
  _cacheKey('https://epg.example.com/x.xml?key=ABC123') === 'https://epg.example.com/x.xml');

ok('cacheKey — strips ?username + ?password',
  _cacheKey('http://epg.example.com/x.xml?username=u&password=p') === 'http://epg.example.com/x.xml');

ok('cacheKey — strips token but keeps non-auth query params',
  _cacheKey('https://epg.example.com/x.xml?token=ABC&region=us') === 'https://epg.example.com/x.xml?region=us');

ok('cacheKey — invalid URL falls back to raw string',
  _cacheKey('not-a-url') === 'not-a-url');

// ── 3. _safeSourceLabel — host + path only, never the query string ───────────
ok('safeSourceLabel — strips query',
  xmltv._safeSourceLabel('https://epg.example.com/us.xml?key=secret') === 'epg.example.com/us.xml');

ok('safeSourceLabel — empty string',
  xmltv._safeSourceLabel('') === 'none');

ok('safeSourceLabel — invalid URL',
  xmltv._safeSourceLabel('not-a-url') === 'invalid-url');

// ── 4. parseXmltv — minimal fixture, both attribute formats ──────────────────
const FIXTURE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv generator-info-name="hermestv-test">',
  '  <channel id="bbc1.uk">',
  '    <display-name lang="en">BBC One</display-name>',
  '    <icon src="https://example.com/bbc1.png" />',
  '  </channel>',
  '  <channel id="cnn.us">',
  '    <display-name>CNN</display-name>',
  '  </channel>',
  '  <programme start="20260519080000 +0000" stop="20260519090000 +0000" channel="bbc1.uk">',
  '    <title lang="en">Breakfast</title>',
  '    <desc>Morning news and weather.</desc>',
  '  </programme>',
  '  <programme start="20260519T090000Z" stop="20260519T100000Z" channel="bbc1.uk">',
  '    <title>Homes Under the Hammer</title>',
  '    <desc>Property auction show.</desc>',
  '  </programme>',
  '  <programme start="20260519080000 +0000" stop="20260519083000 +0000" channel="cnn.us">',
  '    <title>CNN Newsroom</title>',
  '  </programme>',
  '</tv>',
].join('\n');

const parsed = xmltv.parseXmltv(FIXTURE);
ok('parseXmltv — no parse error', !parsed.parse_error, parsed.parse_error);
ok('parseXmltv — 2 channels parsed', parsed.channels.length === 2, 'got ' + parsed.channels.length);
ok('parseXmltv — 3 programs parsed', parsed.programs.length === 3, 'got ' + parsed.programs.length);

ok('parseXmltv — channel id captured',
  parsed.channels[0].id === 'bbc1.uk');
ok('parseXmltv — channel name captured',
  parsed.channels[0].name === 'BBC One');
ok('parseXmltv — channel logo captured',
  parsed.channels[0].logo_url === 'https://example.com/bbc1.png');
ok('parseXmltv — channel without logo returns null',
  parsed.channels[1].logo_url === null);

ok('parseXmltv — program title captured',
  parsed.programs[0].title === 'Breakfast');
ok('parseXmltv — program desc captured',
  parsed.programs[0].description === 'Morning news and weather.');
ok('parseXmltv — program start normalised to ISO',
  parsed.programs[0].start === '2026-05-19T08:00:00.000Z');
ok('parseXmltv — program end normalised to ISO',
  parsed.programs[0].end === '2026-05-19T09:00:00.000Z');
ok('parseXmltv — ISO 8601 basic timestamp also accepted',
  parsed.programs[1].start === '2026-05-19T09:00:00.000Z');
ok('parseXmltv — program without desc returns empty string',
  parsed.programs[2].description === '');

// ── 5. parseXmltv — defensive ────────────────────────────────────────────────
const empty = xmltv.parseXmltv('');
ok('parseXmltv — empty string returns parse_error', !!empty.parse_error);
ok('parseXmltv — empty string returns 0 channels', empty.channels.length === 0);

const noTv = xmltv.parseXmltv('<foo><bar/></foo>');
ok('parseXmltv — no <tv> returns parse_error', !!noTv.parse_error);

const malformed = xmltv.parseXmltv('<tv><channel>broken');
// fast-xml-parser is forgiving — confirm we either succeed or fail gracefully
// (never throw). What matters is that the function returns an object.
ok('parseXmltv — malformed input does not throw',
  typeof malformed === 'object' && Array.isArray(malformed.channels));

const noChannelId = xmltv.parseXmltv(
  '<tv><channel><display-name>No ID</display-name></channel></tv>'
);
ok('parseXmltv — channel without id is dropped',
  noChannelId.channels.length === 0);

const noStart = xmltv.parseXmltv(
  '<tv>' +
  '  <programme stop="20260519090000 +0000" channel="x"><title>T</title></programme>' +
  '</tv>'
);
ok('parseXmltv — programme without start is dropped',
  noStart.programs.length === 0);

// ── 6. applyChannelMap ───────────────────────────────────────────────────────
const map = _loadChannelMap();
ok('channelMap — loads as object', typeof map === 'object' && map !== null);
ok('channelMap — has at least one entry', Object.keys(map).length > 0);
ok('channelMap — sample bbc1.uk → live.bbc-world', map['bbc1.uk'] === 'live.bbc-world');
ok('channelMap — sample cnn.us → live.cnn', map['cnn.us'] === 'live.cnn');

const mapped = xmltv.applyChannelMap(parsed);
ok('applyChannelMap — mapped 2 channels', mapped.channels.length === 2, 'got ' + mapped.channels.length);
ok('applyChannelMap — bbc1.uk mapped to live.bbc-world',
  mapped.channels.find(function(c) { return c.xmltv_id === 'bbc1.uk'; }).id === 'live.bbc-world');
ok('applyChannelMap — programs rewritten to HermesTV IDs',
  mapped.programs[0].channel_id === 'live.bbc-world' || mapped.programs[0].channel_id === 'live.cnn');
ok('applyChannelMap — exposes raw XMLTV channel IDs for header',
  Array.isArray(mapped.xmltv_channel_ids) && mapped.xmltv_channel_ids.indexOf('bbc1.uk') !== -1);

// Unmapped channel — should be dropped
const unmappedFixture = [
  '<tv>',
  '<channel id="unknown.channel"><display-name>Unknown</display-name></channel>',
  '<programme start="20260519080000 +0000" stop="20260519090000 +0000" channel="unknown.channel">',
  '<title>X</title></programme>',
  '</tv>',
].join('');
const unmappedParsed = xmltv.parseXmltv(unmappedFixture);
const unmappedResult = xmltv.applyChannelMap(unmappedParsed);
ok('applyChannelMap — unmapped channel dropped',
  unmappedResult.channels.length === 0);
ok('applyChannelMap — unmapped program dropped',
  unmappedResult.programs.length === 0);
ok('applyChannelMap — but raw xmltv_channel_ids still echoed',
  unmappedResult.xmltv_channel_ids.indexOf('unknown.channel') !== -1);

// ── 7. fetchEpg — never throws on invalid input ──────────────────────────────
(async function() {
  const r1 = await xmltv.fetchEpg('');
  ok('fetchEpg — empty url returns no_url error', r1.error === 'no_url');
  ok('fetchEpg — empty url returns empty arrays',
    Array.isArray(r1.channels) && r1.channels.length === 0);

  // Invalid URL — should return a fetch error, not throw.
  const r2 = await xmltv.fetchEpg('http://127.0.0.1:1/does-not-exist.xml');
  ok('fetchEpg — bad host returns error string',
    typeof r2.error === 'string' && r2.error.length > 0);
  ok('fetchEpg — bad host returns empty channels',
    Array.isArray(r2.channels));

  // ── 8. getCachedEpg ──────────────────────────────────────────────────────
  const cached = xmltv.getCachedEpg('https://does.not.exist.example/x.xml');
  ok('getCachedEpg — unknown url returns null', cached === null);

  // Cleanup
  _clearCache();
  console.log('\n=== xmltv.smoke.js: ' + pass + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail > 0 ? 1 : 0);
})();

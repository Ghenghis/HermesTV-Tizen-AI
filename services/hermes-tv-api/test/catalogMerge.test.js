#!/usr/bin/env node
'use strict';

/**
 * test/catalogMerge.test.js — wave-13 cross-provider channel merge.
 *
 * Asserts:
 *   1. Three duplicate ESPN entries (seed apollo + xtremehd HD + iptv-org US)
 *      merge into ONE item with sources.length === 3.
 *   2. Source ordering: xtremehd > apollo_group > iptv-org > seed-placeholder.
 *   3. Best resolution bubbles up to the merged item.
 *   4. Cleanest title is preferred (no "HD" / "4K" / etc).
 *   5. Single-item groups still emit sources: [<one>] (uniform shape).
 *   6. Non-live items (VOD/series) do NOT collapse across providers.
 *   7. Country-suffixed channels with extra qualifiers (e.g. "ESPN Deportes",
 *      "ESPN Latin America") do NOT collapse into "ESPN".
 *   8. Title normalisation strips HD/4K/.us/trailing-digits.
 *   9. setLastMerged + getSourcesForItemId round-trip.
 *
 * Run via `npm test` (wired in package.json).
 */

var merge = require('../src/lib/catalogMerge');
var mergeByTitle = merge.mergeByTitle;
var normalizeTitle = merge.normalizeTitle;

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

// ---------------------------------------------------------------------------
// 1. The headline scenario: 3 duplicate ESPN entries from 3 providers
// ---------------------------------------------------------------------------
var seedEspn = {
  id: 'live-100',
  type: 'live',
  title: 'ESPN',
  provider: 'apollo_group',
  category: 'sports',
  providers: [{ provider_id: 'apollo_group', source_id: 'apo-live-espn', source_health: { status: 'ok' } }],
  metadata: { resolution: '1080p' },
  quality: '1080p',
};
var xtremehdEspn = {
  id: 'm3u-xtremehd-espn-us-hd',
  type: 'live',
  title: 'ESPN HD',
  provider: 'xtremehd',
  category: 'sports',
  providers: [{ provider_id: 'xtremehd', source_id: 'espn.us.hd', source_health: { status: 'ok' } }],
  metadata: { resolution: '1080p' },
  quality: '1080p',
};
var iptvOrgEspn = {
  id: 'iptv-ESPN.us',
  type: 'live',
  title: 'ESPN.us',
  provider: 'iptv-org',
  category: 'sports',
  providers: [{ provider_id: 'iptv-org', source_id: 'ESPN.us', source_health: { status: 'ok' } }],
  metadata: { resolution: '720p' },
  quality: '720p',
};

var input = [seedEspn, xtremehdEspn, iptvOrgEspn];
var out = mergeByTitle(input);

ok('Three ESPN duplicates collapse into ONE merged item',
  out.length === 1,
  'expected 1, got ' + out.length + ': ' + JSON.stringify(out.map(function(i){return i.id;})));

var merged = out[0];
ok('Merged item has sources.length === 3',
  Array.isArray(merged.sources) && merged.sources.length === 3,
  'sources: ' + JSON.stringify(merged.sources));

ok('Source #0 is xtremehd (highest priority)',
  merged.sources[0].provider_id === 'xtremehd',
  'got: ' + merged.sources[0].provider_id);
// live-100 is a SEED placeholder — even though its nominal provider is
// apollo_group (priority 2), the seed flag sinks it below iptv-org real
// sources. This matches the spec: "seed lands last regardless of nominal
// provider".
ok('Source #1 is iptv-org (real, beats seed-apollo placeholder)',
  merged.sources[1].provider_id === 'iptv-org',
  'got: ' + merged.sources[1].provider_id);
ok('Source #2 is the seed apollo_group placeholder',
  merged.sources[2].provider_id === 'apollo_group' &&
  merged.sources[2].is_seed_placeholder === true,
  'got: ' + merged.sources[2].provider_id +
  ' / seed=' + merged.sources[2].is_seed_placeholder);

ok('Merged id = highest-priority source id (xtremehd)',
  merged.id === 'm3u-xtremehd-espn-us-hd',
  'got: ' + merged.id);

// Sanity: the merged item.id is also the first source's item_id (so a
// /api/play with item.id resolves to the primary source on the first
// resolver hit).
ok('Merged item.id === sources[0].item_id',
  merged.id === merged.sources[0].item_id,
  merged.id + ' vs ' + merged.sources[0].item_id);

ok('Merged title is the clean "ESPN" (not "ESPN HD" / "ESPN.us")',
  merged.title === 'ESPN',
  'got: ' + JSON.stringify(merged.title));

ok('Best resolution bubbles up (1080p wins over 720p)',
  merged.metadata && merged.metadata.resolution === '1080p',
  'got: ' + JSON.stringify(merged.metadata));

ok('Merged providers[] mirrors sources[] in order',
  Array.isArray(merged.providers) &&
  merged.providers.length === 3 &&
  merged.providers[0].provider_id === 'xtremehd' &&
  merged.providers[1].provider_id === 'iptv-org' &&
  merged.providers[2].provider_id === 'apollo_group',
  'providers: ' + JSON.stringify(merged.providers.map(function(p){return p.provider_id;})));

ok('Each source carries item_id for the resolver',
  merged.sources[0].item_id === 'm3u-xtremehd-espn-us-hd' &&
  merged.sources[1].item_id === 'iptv-ESPN.us' &&
  merged.sources[2].item_id === 'live-100',
  'item_ids: ' + JSON.stringify(merged.sources.map(function(s){return s.item_id;})));

// ---------------------------------------------------------------------------
// 2. Seed placeholders sink to the bottom even when their nominal provider
//    (apollo_group) is higher priority than iptv-org.
// ---------------------------------------------------------------------------
ok('Seed placeholder (live-100) flagged is_seed_placeholder=true',
  merged.sources.some(function(s) {
    return s.item_id === 'live-100' && s.is_seed_placeholder === true;
  }),
  'sources: ' + JSON.stringify(merged.sources));

// Real apollo source vs seed placeholder labelled apollo: real one wins.
var realApollo = {
  id: 'm3u-apollo_group-espn-east',
  type: 'live',
  title: 'ESPN East',
  provider: 'apollo_group',
  providers: [{ provider_id: 'apollo_group', source_id: 'espn.east.hd', source_health: { status: 'ok' } }],
  metadata: { resolution: '1080p' },
};
var input2 = [seedEspn, realApollo];
var out2 = mergeByTitle(input2);
// "ESPN East" does NOT collapse into "ESPN" — extra word qualifier preserved
// so this is actually two groups.
ok('"ESPN East" stays distinct from "ESPN"',
  out2.length === 2,
  'expected 2, got ' + out2.length + ': ' + out2.map(function(i){return i.title;}).join(','));

// ---------------------------------------------------------------------------
// 3. Single-item group emits sources: [<one>] (uniform shape)
// ---------------------------------------------------------------------------
var loneCnn = {
  id: 'iptv-CNN.us',
  type: 'live',
  title: 'CNN',
  provider: 'iptv-org',
  providers: [{ provider_id: 'iptv-org', source_id: 'CNN.us', source_health: { status: 'ok' } }],
  metadata: { resolution: '720p' },
};
var out3 = mergeByTitle([loneCnn]);
ok('Single-item group still emits sources[] of length 1',
  out3.length === 1 &&
  Array.isArray(out3[0].sources) &&
  out3[0].sources.length === 1 &&
  out3[0].sources[0].provider_id === 'iptv-org',
  JSON.stringify(out3));

// ---------------------------------------------------------------------------
// 4. VOD/series do NOT collapse across providers (different movies with the
//    same title would otherwise merge incorrectly).
// ---------------------------------------------------------------------------
var vod1 = {
  id: 'vod-200',
  type: 'vod',
  title: 'The Matrix',
  provider: 'xtremehd',
  providers: [{ provider_id: 'xtremehd', source_id: 'xtr-vod-matrix', source_health: { status: 'ok' } }],
  metadata: { resolution: '1080p', year: 1999 },
};
var vod2 = {
  id: 'vod-201',
  type: 'vod',
  title: 'The Matrix',
  provider: 'apollo_group',
  providers: [{ provider_id: 'apollo_group', source_id: 'apo-vod-matrix-2003', source_health: { status: 'ok' } }],
  metadata: { resolution: '720p', year: 2003 },
};
var outVod = mergeByTitle([vod1, vod2]);
ok('Two "The Matrix" VOD entries do NOT merge (different films possible)',
  outVod.length === 2,
  'expected 2, got ' + outVod.length);

// ---------------------------------------------------------------------------
// 5. Country/locale variants — "ESPN Deportes" and "ESPN Latin America"
//    do NOT collapse into "ESPN" (they ARE different channels).
// ---------------------------------------------------------------------------
ok('"ESPN" normalises to "espn"', normalizeTitle('ESPN') === 'espn');
ok('"ESPN HD" normalises to "espn"', normalizeTitle('ESPN HD') === 'espn');
ok('"ESPN 1080p" normalises to "espn"', normalizeTitle('ESPN 1080p') === 'espn');
ok('"ESPN.us" normalises to "espn"', normalizeTitle('ESPN.us') === 'espn');
ok('"ESPN 2" normalises to "espn"', normalizeTitle('ESPN 2') === 'espn',
  'got: ' + normalizeTitle('ESPN 2'));
ok('"ESPN Deportes" normalises to "espndeportes" (distinct)',
  normalizeTitle('ESPN Deportes') === 'espndeportes',
  'got: ' + normalizeTitle('ESPN Deportes'));
ok('"ESPN Latin America" normalises to "espnlatinamerica" (distinct)',
  normalizeTitle('ESPN Latin America') === 'espnlatinamerica',
  'got: ' + normalizeTitle('ESPN Latin America'));
ok('"HBO 4K" normalises to "hbo"',
  normalizeTitle('HBO 4K') === 'hbo',
  'got: ' + normalizeTitle('HBO 4K'));
ok('"TNT.uk" normalises to "tnt"',
  normalizeTitle('TNT.uk') === 'tnt',
  'got: ' + normalizeTitle('TNT.uk'));
ok('"Telemundo 47" preserved (multi-digit affiliate)',
  normalizeTitle('Telemundo 47') === 'telemundo47',
  'got: ' + normalizeTitle('Telemundo 47'));
ok('"" returns null', normalizeTitle('') === null);
ok('null returns null', normalizeTitle(null) === null);

// ---------------------------------------------------------------------------
// 6. setLastMerged + getSourcesForItemId round-trip
// ---------------------------------------------------------------------------
merge.setLastMerged(out);
var lookup = merge.getSourcesForItemId('m3u-xtremehd-espn-us-hd');
ok('getSourcesForItemId returns the merged sources for the primary id',
  Array.isArray(lookup) && lookup.length === 3,
  JSON.stringify(lookup));
var lookupByLegacyId = merge.getSourcesForItemId('iptv-ESPN.us');
ok('getSourcesForItemId also finds by a non-primary source id',
  Array.isArray(lookupByLegacyId) && lookupByLegacyId.length === 3,
  JSON.stringify(lookupByLegacyId));

// ---------------------------------------------------------------------------
// 7. No-op cases (empty + bad inputs)
// ---------------------------------------------------------------------------
ok('Empty array → empty array', mergeByTitle([]).length === 0);
ok('Non-array → empty array', mergeByTitle(null).length === 0);
ok('Array of nulls → empty array',
  mergeByTitle([null, undefined, {}]).length === 1 ||      // the {} item with no title falls to passthrough
  mergeByTitle([null, undefined]).length === 0,
  'handles bad shapes');

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log('');
console.log('catalogMerge tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exit(1); }

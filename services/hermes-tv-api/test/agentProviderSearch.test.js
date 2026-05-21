#!/usr/bin/env node
'use strict';

var catalogMerge = require('../src/lib/catalogMerge');
var agentProviderSearch = require('../src/lib/agentProviderSearch');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

(async function run() {
  var catalog = [
    {
      id: 'xtream-prov-live-501',
      title: 'Evening News HD',
      type: 'live',
      category: 'News',
      provider: 'xtream-prov-live',
      poster_url: 'not-a-public-media-url',
      logo_url: 'https://images.example.test/news-logo.png',
      metadata: {
        resolution: '1080p',
        tvg_id: 'evening-news',
      },
      providers: [{ provider_id: 'xtream-prov-live', source_id: '501', source_health: { status: 'ok' } }],
      sources: [{ provider_id: 'xtream-prov-live', item_id: 'xtream-prov-live-501', source_id: '501', resolution: '1080p', source_health: { status: 'ok' } }],
    },
    {
      id: 'm3u-apollo-movie-1989',
      title: 'Batman',
      type: 'vod',
      category: 'Movies',
      provider: 'apollo_group',
      poster_url: 'https://images.example.test/batman.jpg',
      metadata: {
        release_date: '1989-06-23',
        rating: 7.5,
        resolution: '1080p',
      },
      providers: [{ provider_id: 'apollo_group', source_id: 'batman-1989', source_health: { status: 'ok' } }],
      sources: [{ provider_id: 'apollo_group', item_id: 'm3u-apollo-movie-1989', source_id: 'batman-1989', resolution: '1080p', source_health: { status: 'ok' } }],
    },
    {
      id: 'm3u-xtreme-movie-1997',
      title: 'Batman and Robin',
      type: 'vod',
      category: 'Movies',
      provider: 'xtremehd',
      metadata: {
        release_date: '1997-06-20',
        resolution: '720p',
      },
      providers: [{ provider_id: 'xtremehd', source_id: 'batman-robin-1997', source_health: { status: 'ok' } }],
      sources: [{ provider_id: 'xtremehd', item_id: 'm3u-xtreme-movie-1997', source_id: 'batman-robin-1997', resolution: '720p', source_health: { status: 'ok' } }],
    },
  ];
  catalogMerge.setLastMerged(catalog);

  var query = agentProviderSearch.extractSearchQuery('Hey DaveTV, find Batman 1989', 'Hey DaveTV');
  ok('extractSearchQuery removes trigger and request phrase', query === 'Batman 1989', query);

  var search = await agentProviderSearch.search({
    query: 'Hey DaveTV, find Batman 1989',
    trigger_phrase: 'Hey DaveTV',
    media_type: 'movie',
    limit: 5,
  });
  ok('search returns candidates from real catalog snapshot', search.candidates.length >= 1, JSON.stringify(search));
  ok('exact movie year ranks first',
    search.candidates[0] &&
      search.candidates[0].id === 'm3u-apollo-movie-1989' &&
      search.candidates[0].preferred_source &&
      search.candidates[0].preferred_source.item_id === 'm3u-apollo-movie-1989',
    JSON.stringify(search.candidates));
  ok('candidate projection keeps no credential-bearing poster URL',
    search.candidates[0].poster_url === 'https://images.example.test/batman.jpg',
    JSON.stringify(search.candidates[0]));

  var filtered = await agentProviderSearch.search({
    query: 'Batman',
    provider_ids: ['xtreme-hd'],
  });
  ok('provider filter accepts aliases',
    filtered.candidates.length === 1 && filtered.candidates[0].id === 'm3u-xtreme-movie-1997',
    JSON.stringify(filtered.candidates));

  var live = await agentProviderSearch.search({
    query: 'Evening News',
    media_type: 'live',
  });
  ok('unsafe candidate media URLs are removed',
    live.candidates[0] && live.candidates[0].poster_url === null && live.candidates[0].logo_url === 'https://images.example.test/news-logo.png',
    JSON.stringify(live.candidates[0]));

  var noMatch = await agentProviderSearch.search({ query: 'Content That Is Not Present' });
  ok('no-match search returns honest empty candidates', noMatch.candidates.length === 0 && noMatch.total === 0, JSON.stringify(noMatch));

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

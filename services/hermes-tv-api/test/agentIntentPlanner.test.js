#!/usr/bin/env node
'use strict';

var planner = require('../src/lib/agentIntentPlanner');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function runPlan(utterance, extra) {
  return planner.plan(Object.assign({
    utterance: utterance,
    trigger_phrase: 'Hey DaveTV',
  }, extra || {}));
}

try {
  var movie = runPlan('Hey DaveTV, play the movie Batman from 1989 on Apollo Group TV');
  ok('planner classifies direct movie play', movie.name === 'media_play' && movie.requested_action === 'play', JSON.stringify(movie));
  ok('planner extracts clean movie query and year', movie.search_query === 'Batman 1989' && movie.entities.year === '1989', JSON.stringify(movie));
  ok('planner infers VOD and Apollo provider', movie.media_type === 'vod' && movie.provider_ids[0] === 'apollo_group', JSON.stringify(movie));

  var live = runPlan('DaveTV find live channel 10 Bold on iptv-org');
  ok('planner classifies live channel search', live.name === 'media_search' && live.media_type === 'live', JSON.stringify(live));
  ok('planner extracts iptv-org provider', live.provider_ids.length === 1 && live.provider_ids[0] === 'iptv-org', JSON.stringify(live));

  var filter = runPlan('show only xTremeHD and public channels');
  ok('planner classifies provider-only filter', filter.name === 'provider_filter' && filter.requested_action === 'filter_providers', JSON.stringify(filter));
  ok('planner supports multi-provider filter ids', filter.provider_ids.indexOf('xtremehd') !== -1 && filter.provider_ids.indexOf('iptv-org') !== -1, JSON.stringify(filter));

  var exclude = runPlan('hide Apollo');
  ok('planner supports provider exclusion intent', exclude.name === 'provider_filter' && exclude.provider_mode === 'exclude' && exclude.provider_ids[0] === 'apollo_group', JSON.stringify(exclude));

  var sports = runPlan('when do the Chiefs play next');
  ok('planner routes sports lookup to research-required path', sports.name === 'sports_lookup' && sports.requires_research === true, JSON.stringify(sports));
  ok('planner extracts known sports team hint', sports.entities.team === 'chiefs', JSON.stringify(sports));

  var reminder = runPlan('remind me when the Lakers play');
  ok('planner routes sports reminders separately', reminder.name === 'sports_reminder' && reminder.requested_action === 'create_reminder', JSON.stringify(reminder));

  var trigger = runPlan('change trigger phrase to Computer Dave');
  ok('planner understands trigger phrase settings update', trigger.name === 'settings_update' && trigger.settings_patch && trigger.settings_patch.trigger_phrase === 'Computer Dave', JSON.stringify(trigger));

  var off = runPlan('turn off voice trigger');
  ok('planner understands trigger disable setting', off.name === 'settings_update' && off.settings_patch && off.settings_patch.trigger_enabled === false, JSON.stringify(off));

  var wrongNoContext = runPlan('wrong one');
  ok('planner blocks wrong-result correction without playback context', wrongNoContext.name === 'wrong_result' && wrongNoContext.should_stop_playback === true && wrongNoContext.requires_context === true, JSON.stringify(wrongNoContext));

  var wrongWithContext = runPlan('not that version', { screen_state: { playing_item_id: 'vod-123' } });
  ok('planner accepts wrong-result correction with playback context', wrongWithContext.name === 'wrong_result' && wrongWithContext.should_stop_playback === true && wrongWithContext.requires_context === false, JSON.stringify(wrongWithContext));

  var ambiguous = runPlan('play it');
  ok('planner asks for clarification on empty media reference', ambiguous.name === 'media_search' && ambiguous.needs_clarification === true, JSON.stringify(ambiguous));

  var unknown = runPlan('make it nicer');
  ok('planner reports unknown vague request honestly', unknown.name === 'unknown' && unknown.needs_clarification === true, JSON.stringify(unknown));

  var pub = planner.publicIntent(movie);
  ok('public intent omits search query text', pub.has_search_query === true && pub.search_query === undefined, JSON.stringify(pub));

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}

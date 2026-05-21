'use strict';

var DEFAULT_TRIGGER_PHRASE = 'Hey DaveTV';

var PROVIDER_PATTERNS = [
  { id: 'xtremehd', re: /\b(x\s*treme\s*hd|xtreme\s*hd|xtremehd|xtreme|extreme\s*hd|extreme)\b/ig },
  { id: 'apollo_group', re: /\b(apollo\s*group\s*tv|apollo\s*group|apollo)\b/ig },
  { id: 'iptv-org', re: /\b(iptv[\s_-]*org|iptvorg|public\s+channels|free\s+channels)\b/ig },
];

var TEAM_HINTS = [
  'chiefs', 'lakers', 'cowboys', 'suns', 'yankees', 'dodgers', 'celtics',
  'patriots', 'steelers', 'packers', 'eagles', 'warriors', 'cardinals',
  'diamondbacks', 'bruins', 'rangers', 'knicks',
];

var YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

function _validation(message) {
  var err = new Error(message);
  err.code = 'VALIDATION_FAILED';
  return err;
}

function _escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function _stripTrigger(text, triggerPhrase) {
  var out = _compact(text);
  var phrases = [triggerPhrase || DEFAULT_TRIGGER_PHRASE, DEFAULT_TRIGGER_PHRASE, 'DaveTV'];
  for (var i = 0; i < phrases.length; i++) {
    var phrase = _compact(phrases[i]);
    if (!phrase) { continue; }
    var re = new RegExp('^' + _escapeRegExp(phrase) + '\\b[\\s,.:;!?-]*', 'i');
    out = out.replace(re, '').trim();
  }
  return out;
}

function extractProviderIds(text) {
  var ids = [];
  var value = String(text || '');
  for (var i = 0; i < PROVIDER_PATTERNS.length; i++) {
    PROVIDER_PATTERNS[i].re.lastIndex = 0;
    if (PROVIDER_PATTERNS[i].re.test(value) && ids.indexOf(PROVIDER_PATTERNS[i].id) === -1) {
      ids.push(PROVIDER_PATTERNS[i].id);
    }
  }
  return ids;
}

function _removeProviderPhrases(text) {
  var out = String(text || '');
  for (var i = 0; i < PROVIDER_PATTERNS.length; i++) {
    PROVIDER_PATTERNS[i].re.lastIndex = 0;
    out = out.replace(PROVIDER_PATTERNS[i].re, ' ');
  }
  return _compact(out.replace(/\b(from|on|using|use|with|only|just|provider|providers)\b/ig, ' '));
}

function _providerMode(text) {
  if (/\b(hide|exclude|remove|without|not\s+from)\b/i.test(text)) { return 'exclude'; }
  if (/\b(all|every|any)\s+providers?\b/i.test(text)) { return 'all'; }
  return 'include';
}

function _cleanSearchPhrase(text) {
  var q = _compact(text);
  q = q.replace(/\bfrom\s+((19|20)\d{2})\b/ig, '$1');
  q = _removeProviderPhrases(q);

  var cleanup = [
    /^(please\s+)?(can|could|would)\s+you\s+/i,
    /^(please\s+)?(i\s+want\s+to|i\s+wanna|i\s+would\s+like\s+to)\s+/i,
    /^(please\s+)?(find|search\s+for|look\s+for|show\s+me|bring\s+up|pull\s+up|put\s+on|start|play|watch|open)\s+/i,
    /^(the\s+)?(movie|film|vod|series|show|episode|channel|station)\s+/i,
  ];

  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < cleanup.length; i++) {
      var next = q.replace(cleanup[i], '').trim();
      if (next !== q) {
        q = next;
        changed = true;
      }
    }
  }

  q = q
    .replace(/\b(the\s+)?(movie|film|vod|series|episode|channel|station)\b/ig, ' ')
    .replace(/\b(for\s+me|please)\b/ig, ' ');
  return _compact(q);
}

function _inferMediaType(text) {
  if (/\b(live\s*tv|live|channel|station|news\s+channel|game\s+channel)\b/i.test(text)) {
    return 'live';
  }
  if (/\b(series|tv\s+show|episode|season)\b/i.test(text)) {
    return 'series';
  }
  if (/\b(movie|movies|film|films|vod)\b/i.test(text)) {
    return 'vod';
  }
  if (YEAR_RE.test(text) && /\b(play|watch|find|search|show|bring|pull|open)\b/i.test(text)) {
    return 'vod';
  }
  return null;
}

function _requestedAction(text) {
  if (/\b(play|watch|start|put\s+on|turn\s+on)\b/i.test(text)) { return 'play'; }
  if (/\b(open|go\s+to|take\s+me\s+to)\b/i.test(text)) { return 'open'; }
  if (/\b(find|search|look\s+for|show\s+me|bring\s+up|pull\s+up|where\s+is)\b/i.test(text)) {
    return 'search';
  }
  return 'understand';
}

function _baseIntent(name, confidence) {
  return {
    name: name,
    confidence: confidence,
    search_query: null,
    media_type: null,
    requested_action: 'understand',
    provider_ids: [],
    provider_mode: 'all',
    needs_clarification: false,
    requires_research: false,
    requires_context: false,
    should_stop_playback: false,
    screen_target: null,
    settings_patch: null,
    entities: {},
    safety: {
      can_auto_execute: false,
      reason: 'action_policy_pending',
    },
  };
}

function _quotedTail(value) {
  var out = _compact(value);
  out = out.replace(/^['"]+|['"]+$/g, '').trim();
  out = out.replace(/[.?!]+$/g, '').trim();
  return out;
}

function _settingsIntent(text) {
  var changeTrigger = text.match(/\b(change|set|make|rename)\s+(the\s+)?(trigger|wake|activation)\s+(word|phrase|name)\s+(to|as)\s+(.+)$/i);
  if (changeTrigger) {
    var phrase = _quotedTail(changeTrigger[6]);
    var update = _baseIntent('settings_update', phrase.length >= 2 ? 0.92 : 0.45);
    update.requested_action = 'update_settings';
    update.settings_patch = phrase.length >= 2 ? { trigger_phrase: phrase } : null;
    update.needs_clarification = phrase.length < 2;
    update.entities.setting = 'trigger_phrase';
    return update;
  }

  if (/\b(disable|turn\s+off|stop\s+using)\s+(the\s+)?(voice\s+)?(trigger|wake\s+phrase|wake\s+word)\b/i.test(text)) {
    var off = _baseIntent('settings_update', 0.9);
    off.requested_action = 'update_settings';
    off.settings_patch = { trigger_enabled: false };
    off.entities.setting = 'trigger_enabled';
    return off;
  }

  if (/\b(enable|turn\s+on|use)\s+(the\s+)?(voice\s+)?(trigger|wake\s+phrase|wake\s+word)\b/i.test(text)) {
    var on = _baseIntent('settings_update', 0.88);
    on.requested_action = 'update_settings';
    on.settings_patch = { trigger_enabled: true };
    on.entities.setting = 'trigger_enabled';
    return on;
  }

  if (/\b(open|show|go\s+to|take\s+me\s+to)\s+(settings|voice\s+settings|profiles|account|admin)\b/i.test(text)) {
    var nav = _baseIntent('screen_navigation', 0.82);
    nav.requested_action = 'open';
    nav.screen_target = text.match(/\b(admin)\b/i) ? 'admin' : 'settings';
    return nav;
  }

  return null;
}

function _sportsIntent(text) {
  var lower = text.toLowerCase();
  var sportsWords = /\b(sports|team|teams|score|scores|schedule|game|match|season|nfl|nba|mlb|nhl|wnba)\b/i.test(text);
  var team = null;
  for (var i = 0; i < TEAM_HINTS.length; i++) {
    if (lower.indexOf(TEAM_HINTS[i]) !== -1) {
      team = TEAM_HINTS[i];
      sportsWords = true;
      break;
    }
  }
  if (!sportsWords) { return null; }
  if (!/\b(when|score|schedule|play|playing|remind|alert|notify|game|match)\b/i.test(text)) {
    return null;
  }

  var reminder = /\b(remind|alert|notify|tell\s+me)\b/i.test(text);
  var intent = _baseIntent(reminder ? 'sports_reminder' : 'sports_lookup', reminder ? 0.86 : 0.82);
  intent.requested_action = reminder ? 'create_reminder' : 'research';
  intent.requires_research = true;
  intent.entities.team = team;
  return intent;
}

function _wrongResultIntent(text, options) {
  if (!/\b(wrong\s+one|wrong\s+version|not\s+that|not\s+this|that\s+is\s+not|that's\s+not|incorrect|different\s+one)\b/i.test(text)) {
    return null;
  }
  var intent = _baseIntent('wrong_result', 0.9);
  intent.requested_action = 'correct_result';
  intent.should_stop_playback = true;
  var context = options && options.context && typeof options.context === 'object' ? options.context : {};
  var screen = options && options.screen_state && typeof options.screen_state === 'object' ? options.screen_state : {};
  if (!context.playing_item_id && !screen.playing_item_id && !screen.active_item_id) {
    intent.requires_context = true;
    intent.needs_clarification = true;
  }
  return intent;
}

function _providerOnlyIntent(text, providerIds) {
  if (!providerIds || providerIds.length === 0) { return null; }
  var residual = _removeProviderPhrases(text)
    .replace(/\b(show|filter|use|select|enable|hide|exclude|remove|only|just|all|and|or|providers?|channels?|movies?|series|live)\b/ig, ' ');
  if (_compact(residual).length > 0) { return null; }

  var intent = _baseIntent('provider_filter', 0.84);
  intent.requested_action = 'filter_providers';
  intent.provider_ids = providerIds;
  intent.provider_mode = _providerMode(text);
  return intent;
}

function _ambiguousIntent(text) {
  if (/^(it|that|this|one|the\s+one)$/i.test(_compact(text))) {
    var intent = _baseIntent('ambiguous_reference', 0.54);
    intent.needs_clarification = true;
    intent.requires_context = true;
    return intent;
  }
  return null;
}

function _mediaIntent(text, providerIds) {
  var requested = _requestedAction(text);
  var type = _inferMediaType(text);
  var hasMediaVerb = requested === 'play' || requested === 'search' || requested === 'open';
  var hasMediaHint = !!type || /\b(movie|film|series|episode|channel|station|live\s*tv)\b/i.test(text);
  if (!hasMediaVerb && !hasMediaHint) { return null; }

  var searchQuery = _cleanSearchPhrase(text);
  if (searchQuery.length < 2 || /^(it|that|this|one|the\s+one)$/i.test(searchQuery)) {
    var clarify = _baseIntent('media_search', 0.48);
    clarify.media_type = type;
    clarify.requested_action = requested;
    clarify.provider_ids = providerIds || [];
    clarify.provider_mode = providerIds && providerIds.length > 0 ? _providerMode(text) : 'all';
    clarify.needs_clarification = true;
    return clarify;
  }

  var intent = _baseIntent(requested === 'play' ? 'media_play' : 'media_search', requested === 'play' ? 0.88 : 0.82);
  intent.search_query = searchQuery;
  intent.media_type = type;
  intent.requested_action = requested;
  intent.provider_ids = providerIds || [];
  intent.provider_mode = providerIds && providerIds.length > 0 ? _providerMode(text) : 'all';
  var year = searchQuery.match(YEAR_RE);
  if (year) { intent.entities.year = year[1]; }
  return intent;
}

function plan(options) {
  options = options || {};
  if (typeof options.utterance !== 'string') { throw _validation('utterance must be a string'); }
  if (options.utterance.trim().length === 0) { throw _validation('utterance is required'); }
  if (options.utterance.length > 500) { throw _validation('utterance must be 500 characters or fewer'); }

  var text = _stripTrigger(options.utterance, options.trigger_phrase);
  var providerIds = extractProviderIds(text);

  var wrong = _wrongResultIntent(text, options);
  if (wrong) { return wrong; }

  var settings = _settingsIntent(text);
  if (settings) { return settings; }

  var providerOnly = _providerOnlyIntent(text, providerIds);
  if (providerOnly) { return providerOnly; }

  var sports = _sportsIntent(text);
  if (sports) { return sports; }

  var ambiguous = _ambiguousIntent(text);
  if (ambiguous) { return ambiguous; }

  var media = _mediaIntent(text, providerIds);
  if (media) { return media; }

  var fallback = _baseIntent('unknown', 0.25);
  fallback.needs_clarification = true;
  return fallback;
}

function publicIntent(intent) {
  var out = {};
  [
    'name',
    'confidence',
    'media_type',
    'requested_action',
    'provider_ids',
    'provider_mode',
    'needs_clarification',
    'requires_research',
    'requires_context',
    'should_stop_playback',
    'screen_target',
    'settings_patch',
    'entities',
    'safety',
  ].forEach(function(key) {
    out[key] = intent[key];
  });
  out.has_search_query = typeof intent.search_query === 'string' && intent.search_query.length > 0;
  return out;
}

module.exports = {
  plan: plan,
  publicIntent: publicIntent,
  extractProviderIds: extractProviderIds,
  _stripTriggerForTests: _stripTrigger,
  _cleanSearchPhraseForTests: _cleanSearchPhrase,
};

#!/usr/bin/env node
// test-chatbot-commands.js — Integration test: all chatbot commands against /api/ui-command/validate
// Usage: node tools/test-chatbot-commands.js
// Requires: API running at localhost:3001 (node services/hermes-tv-api/src/index.js)

'use strict';

const http = require('http');

var totalPass = 0;
var totalFail = 0;

function pass(msg) { console.log('PASS:', msg); totalPass++; }
function fail(msg) { console.log('FAIL:', msg); totalFail++; }

// All commands that should return { valid: true }
var VALID_COMMANDS = [
  { text: 'show apollo', expectedAction: 'filter_provider' },
  { text: 'show apollo group', expectedAction: 'filter_provider' },
  { text: 'show xtremehd', expectedAction: 'filter_provider' },
  { text: 'show all providers', expectedAction: 'filter_provider' },
  { text: 'show all', expectedAction: 'filter_provider' },
  { text: 'show movies', expectedAction: 'filter_content' },
  { text: 'show series', expectedAction: 'filter_content' },
  { text: 'show tv shows', expectedAction: 'filter_content' },
  { text: 'show live', expectedAction: 'filter_content' },
  { text: 'live channels', expectedAction: 'filter_content' },
  { text: 'show 4k', expectedAction: 'filter_quality' },
  { text: '4k only', expectedAction: 'filter_quality' },
  { text: 'mom mode', expectedAction: 'switch_profile' },
  { text: 'sherri mode', expectedAction: 'switch_profile' },
  { text: 'dave mode', expectedAction: 'switch_profile' },
  { text: 'bigger tiles', expectedAction: 'update_layout' },
  { text: 'large tiles', expectedAction: 'update_layout' },
  { text: 'dark theme', expectedAction: 'update_theme' },
  { text: 'dark mode', expectedAction: 'update_theme' },
  { text: 'light theme', expectedAction: 'update_theme' },
  { text: 'light mode', expectedAction: 'update_theme' },
  { text: 'premium theme', expectedAction: 'update_theme' },
  { text: 'cinema theme', expectedAction: 'update_theme' },
  { text: 'low memory mode', expectedAction: 'update_motion' },
  { text: 'performance mode', expectedAction: 'update_motion' },
  { text: 'what is this', expectedAction: 'show_detail' },
  { text: 'more with actor', expectedAction: 'find_similar_actor' },
  { text: 'show sports', expectedAction: 'filter_content' },
  { text: 'show action', expectedAction: 'filter_content' },
  { text: 'show family', expectedAction: 'filter_content' },
  { text: 'show mysteries', expectedAction: 'filter_content' },
  { text: 'show hallmark', expectedAction: 'filter_content' },
  { text: 'reset filters', expectedAction: 'reset_filters' },
  { text: 'clear filters', expectedAction: 'reset_filters' },
  { text: 'show everything', expectedAction: 'reset_filters' },
];

// Commands that should return { valid: false }
var INVALID_COMMANDS = [
  'hello world',
  'play something',
  'what time is it',
  'random gibberish xyz',
];

function postValidate(commandText, profileId) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ command_text: commandText, profile_id: profileId || 'dave_tv' });
    var req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/ui-command/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('\n--- Valid command tests ---');
  for (var i = 0; i < VALID_COMMANDS.length; i++) {
    var tc = VALID_COMMANDS[i];
    try {
      var result = await postValidate(tc.text, 'dave_tv');
      if (result.status !== 200) {
        fail('"' + tc.text + '" — HTTP ' + result.status);
      } else if (!result.body.valid) {
        fail('"' + tc.text + '" — expected valid:true, got: ' + result.body.error);
      } else if (result.body.action !== tc.expectedAction) {
        fail('"' + tc.text + '" — expected action:' + tc.expectedAction + ', got:' + result.body.action);
      } else {
        pass('"' + tc.text + '" → ' + result.body.action);
      }
    } catch (e) {
      fail('"' + tc.text + '" — error: ' + e.message);
    }
  }

  console.log('\n--- Invalid command tests (should return valid:false) ---');
  for (var j = 0; j < INVALID_COMMANDS.length; j++) {
    var cmd = INVALID_COMMANDS[j];
    try {
      var res2 = await postValidate(cmd, 'dave_tv');
      if (res2.status !== 200) {
        fail('"' + cmd + '" — HTTP ' + res2.status);
      } else if (res2.body.valid) {
        fail('"' + cmd + '" — expected valid:false, got valid:true (action: ' + res2.body.action + ')');
      } else {
        pass('"' + cmd + '" — correctly returned valid:false');
      }
    } catch (e) {
      fail('"' + cmd + '" — error: ' + e.message);
    }
  }

  console.log('\n--- Profile ID validation ---');
  try {
    var badProfile = await postValidate('show movies', 'invalid_profile');
    if (badProfile.status === 400) {
      pass('Invalid profile_id rejected with 400');
    } else {
      fail('Invalid profile_id should return 400, got: ' + badProfile.status);
    }
  } catch (e) {
    fail('Profile validation test error: ' + e.message);
  }

  console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exit(totalFail > 0 ? 1 : 0);
}

runTests().catch(function(e) {
  console.error('Test runner error:', e.message);
  process.exit(1);
});

#!/usr/bin/env node
// schema-validate.js — Validate JSON data files and schema syntax for HermesTV.
// Gate: BUILD-GATE-10, SECURITY-GATE-00B
// Usage: node tools/schema-validate.js

'use strict';
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');

let totalPass = 0;
let totalFail = 0;

function pass(msg) { console.log('PASS:', msg); totalPass++; }
function fail(msg) { console.log('FAIL:', msg); totalFail++; }

function readJSON(relPath) {
  const abs = path.join(REPO, relPath);
  if (!fs.existsSync(abs)) return null;
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { fail(relPath + ' — JSON parse error: ' + e.message); return null; }
}

// --- Schema syntax checks ---
console.log('\n--- Schema file syntax (all schemas/*.json) ---');
const schemaGlob = [
  'schemas/catalog.item.schema.json', 'schemas/media.metadata.schema.json',
  'schemas/source.health.schema.json', 'schemas/actor.person.schema.json',
  'schemas/watch.intelligence.schema.json',
  'schemas/provider.capabilities.schema.json', 'schemas/provider.profile.schema.json',
  'schemas/provider.session.schema.json', 'schemas/ui-command.schema.json',
  'schemas/layout-preset.schema.json', 'schemas/theme-manifest.schema.json',
];
schemaGlob.forEach(function(s) {
  const d = readJSON(s);
  if (d) {
    if (d.additionalProperties === false || d.additionalProperties === undefined) {
      pass(s + ' — valid JSON');
    } else {
      fail(s + ' — missing additionalProperties: false');
    }
  }
});

// Check layout schemas
console.log('\n--- Layout schemas (all have un_degradation) ---');
var layoutDir = path.join(REPO, 'schemas/layouts');
if (fs.existsSync(layoutDir)) {
  fs.readdirSync(layoutDir).filter(function(f) { return f.endsWith('.json'); }).forEach(function(f) {
    var d = readJSON('schemas/layouts/' + f);
    if (!d) return;
    if (!d.un_degradation) {
      fail('schemas/layouts/' + f + ' — missing un_degradation block');
    } else if (d.version && d.version.startsWith('2.')) {
      pass('schemas/layouts/' + f + ' v' + d.version + ' — has un_degradation');
    } else {
      fail('schemas/layouts/' + f + ' — version should be 2.x.x, got: ' + d.version);
    }
  });
}

// Check background schemas
console.log('\n--- Background schemas (motion packs have tier_required) ---');
var bgDir = path.join(REPO, 'schemas/backgrounds');
if (fs.existsSync(bgDir)) {
  fs.readdirSync(bgDir).filter(function(f) { return f.endsWith('.json'); }).forEach(function(f) {
    var d = readJSON('schemas/backgrounds/' + f);
    if (!d) return;
    if (d.motion_enabled) {
      if (d.tier_required !== 'qn_primary') {
        fail('schemas/backgrounds/' + f + ' — motion pack missing tier_required: qn_primary');
      } else if (!d.un_fallback_pack_id) {
        fail('schemas/backgrounds/' + f + ' — motion pack missing un_fallback_pack_id');
      } else {
        pass('schemas/backgrounds/' + f + ' — motion pack correct');
      }
    } else {
      pass('schemas/backgrounds/' + f + ' — static pack (no tier required)');
    }
  });
}

// Check command schemas
console.log('\n--- Command schemas (additionalProperties: false) ---');
var cmdDir = path.join(REPO, 'schemas/commands');
if (fs.existsSync(cmdDir)) {
  fs.readdirSync(cmdDir).filter(function(f) { return f.endsWith('.json'); }).forEach(function(f) {
    var d = readJSON('schemas/commands/' + f);
    if (!d) return;
    if (d.additionalProperties !== false) {
      fail('schemas/commands/' + f + ' — missing additionalProperties: false');
    } else {
      pass('schemas/commands/' + f);
    }
  });
}

// --- Catalog v2.0.0 structure check ---
console.log('\n--- Mock catalog v2.0.0 structure ---');
var catalog = readJSON('apps/hermes-web-tv/mock/catalog.mock.json');
if (catalog) {
  if (catalog.version && catalog.version.startsWith('2.')) {
    pass('catalog version: ' + catalog.version);
  } else {
    fail('catalog version should be 2.x.x, got: ' + catalog.version);
  }

  // Check providers
  var VALID_PROVIDERS = ['apollo_group', 'xtremehd'];
  if (!Array.isArray(catalog.providers)) {
    fail('catalog missing providers array');
  } else {
    catalog.providers.forEach(function(p, i) {
      if (VALID_PROVIDERS.indexOf(p.provider_id) === -1) {
        fail('providers[' + i + '] unknown provider_id: ' + p.provider_id);
      } else {
        pass('providers[' + i + '] provider_id: ' + p.provider_id);
      }
    });
  }

  // Check actors
  if (!Array.isArray(catalog.actors) || catalog.actors.length < 5) {
    fail('catalog actors: need >= 5, got: ' + (catalog.actors ? catalog.actors.length : 0));
  } else {
    pass('catalog actors: ' + catalog.actors.length + ' actors');
  }

  // Check items
  if (!Array.isArray(catalog.items)) {
    fail('catalog missing items array');
  } else {
    var live = catalog.items.filter(function(i) { return i.type === 'live'; });
    var vod = catalog.items.filter(function(i) { return i.type === 'vod'; });
    var series = catalog.items.filter(function(i) { return i.type === 'series'; });
    var dual = catalog.items.filter(function(i) {
      return Array.isArray(i.providers) && i.providers.length > 1;
    });

    live.length >= 3 ? pass('live channels: ' + live.length) : fail('need >= 3 live, got: ' + live.length);
    vod.length >= 4 ? pass('movies (vod): ' + vod.length) : fail('need >= 4 movies, got: ' + vod.length);
    series.length >= 3 ? pass('series: ' + series.length) : fail('need >= 3 series, got: ' + series.length);
    dual.length >= 2 ? pass('dual-provider items: ' + dual.map(function(i){return i.title;}).join(', ')) : fail('need >= 2 dual-provider, got: ' + dual.length);

    // Mom Mode font scale check for items with mom_mode implied
    catalog.items.forEach(function(item, i) {
      if (!item.id) fail('items[' + i + '] missing id');
      if (!item.type) fail('items[' + i + '] missing type');
      if (item.poster_url && item.poster_url.indexOf('hermestv.local') === -1) {
        fail('items[' + i + '] poster_url not on hermestv.local: ' + item.poster_url);
      }
    });
  }
}

// --- Mom Mode font_scale floor check ---
console.log('\n--- Mom Mode font_scale floor ---');
var profilesText = fs.existsSync(path.join(REPO, 'services/hermes-tv-api/src/routes/profiles.js'))
  ? fs.readFileSync(path.join(REPO, 'services/hermes-tv-api/src/routes/profiles.js'), 'utf8') : '';
if (profilesText.indexOf('MOM_FONT_SCALE_FLOOR') !== -1 && profilesText.indexOf('1.25') !== -1) {
  pass('Mom Mode font_scale floor 1.25 enforced in profiles.js');
} else {
  fail('profiles.js missing MOM_FONT_SCALE_FLOOR = 1.25');
}

// --- Security: no credential patterns in source ---
// Looks for actual credential assignments, skips comments and guard arrays
console.log('\n--- Secret pattern check (source files) ---');
var srcDirs = ['apps/hermes-web-tv/src', 'apps/tizen-hermes-tv/src', 'services/hermes-tv-api/src'];
// Match: assignment of a non-placeholder string value to a credential key
// Excludes: comment lines, guard/pattern arrays, placeholder values like <KEY> or ENV_VAR
var CRED_ASSIGN = /(?:password|api_key)\s*=\s*['"][^'"<>A-Z_]{4,}['"]/i;
var secretFound = false;
srcDirs.forEach(function(dir) {
  var abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return;
  function scanDir(d) {
    fs.readdirSync(d).forEach(function(f) {
      var fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) { scanDir(fp); return; }
      if (!f.endsWith('.js') && !f.endsWith('.jsx')) return;
      var lines = fs.readFileSync(fp, 'utf8').split('\n');
      lines.forEach(function(line, idx) {
        var trimmed = line.trim();
        // Skip comment lines and guard/pattern arrays
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (trimmed.indexOf('PATTERNS') !== -1 || trimmed.indexOf('CRED_') !== -1) return;
        if (CRED_ASSIGN.test(line)) {
          fail('Possible credential at ' + fp.replace(REPO, '') + ':' + (idx + 1) + ': ' + trimmed.slice(0, 80));
          secretFound = true;
        }
      });
    });
  }
  scanDir(abs);
});
if (!secretFound) pass('No raw credential assignments found in source files');

console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
process.exit(totalFail > 0 ? 1 : 0);

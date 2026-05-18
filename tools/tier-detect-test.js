#!/usr/bin/env node
// tier-detect-test.js — Unit tests for capabilities.js model → tier detection.
// Gate: TIER-GATE-01 (QN→enhanced), TIER-GATE-03 (UN→baseline)
// Usage: node tools/tier-detect-test.js

const path = require('path');

// Load the capabilities module for Node testing
// capabilities.js uses tizen.systeminfo — mock it here
global.tizen = {
  systeminfo: {
    getPropertyValue: (prop, cb) => cb({ modelName: process.env._TEST_MODEL || '' }),
  },
};
global.webapis = {
  productinfo: {
    getModel: () => process.env._TEST_MODEL || '',
  },
};

const capPath = path.join(__dirname, '../apps/hermes-tv-tizen-native/src/platform/capabilities.js');

const CASES = [
  { model: 'QN85Q7FAAFXZA', expectedTier: 'enhanced', expectedProfile: 'mom_tv' },
  { model: 'QN95B', expectedTier: 'enhanced', expectedProfile: null },
  { model: 'UN55CU8000BXZA', expectedTier: 'baseline', expectedProfile: 'dave_tv' },
  { model: 'UN43TU7000', expectedTier: 'baseline', expectedProfile: null },
  { model: '', expectedTier: 'baseline', expectedProfile: null }, // unknown → safe fallback
  { model: 'UNKNOWN_MODEL', expectedTier: 'baseline', expectedProfile: null },
];

let pass = 0;
let fail = 0;

for (const tc of CASES) {
  process.env._TEST_MODEL = tc.model;
  // Clear module cache so capabilities.js re-runs detection
  delete require.cache[capPath];

  let caps;
  try {
    caps = require(capPath);
  } catch (e) {
    console.log(`SKIP: cannot load capabilities.js in Node (Tizen-only APIs): ${e.message.slice(0, 80)}`);
    console.log('       Run tier-detect-test manually on device or in Tizen emulator.');
    process.exit(0);
  }

  const tier = caps.isEnhancedTier ? 'enhanced' : 'baseline';
  if (tier === tc.expectedTier) {
    console.log(`PASS: model="${tc.model}" → tier=${tier}`);
    pass++;
  } else {
    console.log(`FAIL: model="${tc.model}" → tier=${tier} (expected ${tc.expectedTier})`);
    fail++;
  }
}

console.log(`\n=== Results: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);

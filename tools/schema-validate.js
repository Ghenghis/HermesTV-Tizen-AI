#!/usr/bin/env node
// schema-validate.js — Validate JSON data files against HermesTV schemas.
// Gate: validates mock/catalog.mock.json and any runtime snapshots.
// Usage: node tools/schema-validate.js [data-file] [schema-file]
//        node tools/schema-validate.js  (validates all known pairs)
// Requires: npm install -g ajv-cli  OR  npx ajv

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');

const PAIRS = [
  {
    data: 'apps/hermes-web-tv/mock/catalog.mock.json',
    description: 'Mock catalog — provider summaries',
    // Validate each provider entry against provider.profile.schema.json
    schemaKey: 'providers[*]',
    schema: 'schemas/provider.profile.schema.json',
  },
  {
    data: 'apps/hermes-web-tv/mock/catalog.mock.json',
    description: 'Mock catalog — structure check (manual)',
    schema: null,
    manualCheck: (data) => {
      const errors = [];
      if (!Array.isArray(data.providers)) errors.push('Missing providers array');
      if (!Array.isArray(data.profiles)) errors.push('Missing profiles array');
      if (!Array.isArray(data.catalog)) errors.push('Missing catalog array');
      data.catalog?.forEach((item, i) => {
        if (!item.item_id) errors.push(`catalog[${i}] missing item_id`);
        if (!['live','movie','series'].includes(item.content_type))
          errors.push(`catalog[${i}] invalid content_type: ${item.content_type}`);
        const validRes = ['480p','720p','1080p','1440p','4K','unknown'];
        if (!validRes.includes(item.quality?.resolution))
          errors.push(`catalog[${i}] invalid resolution: ${item.quality?.resolution}`);
        const validEpg = ['matched','partial','missing','stale'];
        if (!validEpg.includes(item.epg?.status))
          errors.push(`catalog[${i}] invalid EPG status: ${item.epg?.status}`);
      });
      data.providers?.forEach((p, i) => {
        if (p.provider_id && !['apollo','xtremehd'].includes(p.provider_id))
          errors.push(`providers[${i}] unknown provider_id: ${p.provider_id}`);
        if (typeof p.stream_slots_in_use === 'number' &&
            typeof p.stream_slots_total === 'number' &&
            p.stream_slots_in_use > p.stream_slots_total)
          errors.push(`providers[${i}] stream_slots_in_use > stream_slots_total`);
      });
      data.profiles?.forEach((p, i) => {
        if (!['dave_tv','mom_tv'].includes(p.profile_id))
          errors.push(`profiles[${i}] invalid profile_id: ${p.profile_id}`);
        if (p.mom_mode && p.font_scale < 1.25)
          errors.push(`profiles[${i}] mom_mode=true but font_scale ${p.font_scale} < 1.25 (floor violation)`);
      });
      return errors;
    },
  },
];

let totalPass = 0;
let totalFail = 0;

for (const pair of PAIRS) {
  const dataPath = path.join(REPO, pair.data);
  console.log(`\n--- ${pair.description} ---`);

  if (!fs.existsSync(dataPath)) {
    console.log(`SKIP: data file not found: ${pair.data}`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  if (pair.manualCheck) {
    const errors = pair.manualCheck(data);
    if (errors.length === 0) {
      console.log('PASS');
      totalPass++;
    } else {
      console.log('FAIL:');
      errors.forEach(e => console.log(`  - ${e}`));
      totalFail++;
    }
  }

  if (pair.schema) {
    const schemaPath = path.join(REPO, pair.schema);
    try {
      execSync(`npx ajv validate -s "${schemaPath}" -d "${dataPath}" --spec=draft7`, {
        stdio: 'pipe',
        cwd: REPO,
      });
      console.log(`PASS (ajv): ${pair.schema}`);
      totalPass++;
    } catch (e) {
      console.log(`FAIL (ajv): ${e.stdout?.toString() || e.message}`);
      totalFail++;
    }
  }
}

console.log(`\n=== Results: ${totalPass} PASS, ${totalFail} FAIL ===`);
process.exit(totalFail > 0 ? 1 : 0);

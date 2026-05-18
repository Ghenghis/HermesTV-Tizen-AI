# Lane 19 — Schema Validation Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Tool:** tools/schema-validate.js

---

## Schema Validator Run Output

Running `node tools/schema-validate.js` produced:

```
--- Mock catalog — provider summaries ---
FAIL (ajv): npx ajv not installed (npm error could not determine executable to run)

--- Mock catalog — structure check (manual) ---
FAIL:
  - Missing profiles array
  - Missing catalog array
  - providers[0] unknown provider_id: apollo_group

=== Results: 0 PASS, 2 FAIL ===
```

---

## Analysis of Each Failure

### Failure 1: npx ajv not available
The schema-validate.js tool calls `npx ajv validate` but `ajv-cli` is not installed globally or as a dev dependency. The command uses `execSync('npx ajv ...')` which fails silently unless ajv-cli is in the path.

**Fix:** Add `ajv-cli` to the devDependencies in the root package.json or tools/package.json:
```json
{ "devDependencies": { "ajv-cli": "^5.0.0" } }
```
This is a non-blocking tooling gap for B2 — the manual check is the important one.

### Failure 2: Missing `profiles` array
The manual check expects `data.profiles` but `catalog.mock.json` does not have a `profiles` key. It has `providers`, `actors`, and `items`.

**Root cause:** The schema-validate.js was written against an older data format that included a `profiles` array in the catalog mock. The current catalog.mock.json uses a cleaner separation (profiles come from /api/profiles, not the catalog file).

**Fix options:**
1. Update schema-validate.js to not require `profiles` in catalog.mock.json (recommended)
2. Add a `profiles` summary array to catalog.mock.json

### Failure 3: Missing `catalog` array
The manual check expects `data.catalog` but the mock JSON uses `data.items`. The tool's check `data.catalog?.forEach(...)` returns undefined.

**Fix:** Update schema-validate.js manual check to use `data.items` or `data.catalog || data.items`.

### Failure 4: Unknown `provider_id: apollo_group`
The schema validator checks:
```js
if (p.provider_id && !['apollo','xtremehd'].includes(p.provider_id))
  errors.push(`providers[${i}] unknown provider_id: ${p.provider_id}`);
```

But the mock JSON uses `apollo_group`, not `apollo`. The catalog.item.schema.json correctly uses `apollo_group` as the enum value.

**Fix:** Update schema-validate.js to use `['apollo_group', 'xtremehd']` in the provider_id validation.

---

## All Layout Schemas — un_degradation Block

| Check | Result |
|---|---|
| All 12 layouts have un_degradation | PASS (verified by node script) |

All 12 layout files (ambient_idle, category_carousels, cinematic_hero, classic_cable_grid, discovery_walls, epg_strip, favorite_quick_dial, live_focus, minimal_player, mom_jumbo_rail, provider_dashboard, recents_resume) have un_degradation blocks.

---

## All Background Schemas — tier_required

| Check | Result |
|---|---|
| All 12 background schemas have tier_required | PASS (verified by node script) |

Values: `qn_primary` (7 motion backgrounds) and `baseline` (5 static backgrounds).

---

## All Command Schemas — additionalProperties: false

| Check | Result |
|---|---|
| All 15 command schemas have additionalProperties: false | PASS (verified by node script) |

---

## 5 New Schemas — Valid JSON

| Schema | Valid JSON |
|---|---|
| catalog.item.schema.json | PASS |
| media.metadata.schema.json | PASS |
| source.health.schema.json | PASS |
| actor.person.schema.json | PASS |
| watch.intelligence.schema.json | PASS |

All 5 new schemas parse correctly. All use $schema draft-07 and have proper $id, title, description, type, required, and properties.

---

## Structural Issues Found

### catalog.item.schema.json — source_health required
The schema requires `source_health` as a top-level field:
```json
"required": ["id","type","title","provider_id","category","resolution","has_hdr","codec","profile_access","source_health","metadata","poster_url"]
```

But catalog.mock.json items do NOT have a top-level `source_health` field — health is nested inside each providers[] entry as `providers[].source_health`. 

The schema and the mock data structure are inconsistent. The schema expects `source_health` at the item level (single source), while the actual data structure supports multiple providers each with their own `source_health`.

**Impact:** If/when ajv validation of catalog items is run, ALL 10 mock items would fail with "missing required source_health".

**Fix:** Either:
1. Update catalog.item.schema.json to make `source_health` optional and instead reference it via the `providers` array
2. Add a top-level `source_health` to each mock item (the primary provider's health)

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| schema-validate.js uses wrong key `catalog` (should be `items`) | P1 | All manual checks fail |
| schema-validate.js accepts `apollo` not `apollo_group` | P1 | False failure for all providers |
| catalog.item.schema.json requires source_health at top level but data has it nested | P1 | Schema/data mismatch |
| ajv-cli not installed — ajv validation always fails | P2 | Install ajv-cli as devDependency |
| schema-validate.js expects profiles[] in catalog.mock.json | P2 | Outdated expectation |

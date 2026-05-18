# Lane 07 — Apollo/XtremeHD Mock Data Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** apps/hermes-web-tv/mock/catalog.mock.json, services/hermes-tv-api/src/routes/catalog.js

---

## Summary

The mock catalog is comprehensive and structurally sound. The key gap is a schema mismatch between catalog.mock.json (uses `items` key) and the schema-validate.js tool (expects `catalog` key), and between catalog.mock.json providers (use `apollo_group` id) and the schema validator (only accepts `apollo`, `xtremehd`). The catalog.js route has only 5 items (4 live+vod) while the mock JSON has 10 items.

---

## catalog.mock.json Item Count

| Type | Count in mock JSON | Required |
|---|---|---|
| Live channels | 3 (live-001 ESPN, live-002 Hallmark, live-003 NFL RedZone) | 3 min |
| VOD movies | 4 (vod-001 Top Gun, vod-002 The Notebook, vod-003 John Wick 4, vod-004 Steel Magnolias) | 4 min |
| Series | 3 (ser-001 Yellowstone, ser-002 Blue Bloods, ser-003 Hallmark Mysteries) | 3 min |
| Both providers | 3 (live-001 ESPN on apollo+xtremehd, vod-001 Top Gun on apollo+xtremehd, ser-001 Yellowstone on apollo+xtremehd) | 2 min |
| Actors | 5 (actor-001 through actor-005) | 5 required |

All counts meet or exceed the requirements.

---

## Source Health Data

| Check | Result |
|---|---|
| All items have source_health on every providers entry | PASS |
| health_score range 0-100 | PASS — scores: 85, 91, 80, 94, 71, 88, 62, 96, 82, 93, 76, 87, 84 |
| health_label enum correct | PASS — "Good", "Excellent", "Fair" values used |
| session_limit_status | PASS — all "ok" (no near_limit test data) |
| checked_at timestamps | PASS — all 2026-05-18T04:00:00Z |

**Gap:** No test items with `session_limit_status: "near_limit"` or `"at_limit"` exist. The StreamingQualityBar warning UI cannot be visually tested without modifying mock data.

---

## metadata.plot Coverage

All 10 items have non-null `metadata.plot`:
- live-001 ESPN: "Live sports coverage including NFL, NBA, MLB, college sports and more."
- live-002 Hallmark: "Feel-good movies, holiday specials..."
- live-003 NFL RedZone: "Every touchdown from every Sunday afternoon NFL game..."
- vod-001 Top Gun: full plot
- vod-002 The Notebook: full plot
- vod-003 John Wick 4: full plot
- vod-004 Steel Magnolias: full plot
- ser-001 Yellowstone: full plot
- ser-002 Blue Bloods: full plot
- ser-003 Hallmark Mysteries: "Cozy mystery series..."

PASS — all items have plot.

---

## providers Array Format

| Check | Result |
|---|---|
| Rich format: providers[] array of objects | PASS — all items use rich format |
| Each provider entry has provider_id | PASS |
| Each provider entry has source_id | PASS |
| Each provider entry has source_health nested object | PASS |
| Backward-compat top-level provider_id string | PASS — all items also have top-level `provider_id` |

---

## poster_url and backdrop_url

| Check | Result |
|---|---|
| All items have poster_url | PASS — all 10 items |
| poster_url uses hermestv.local | PASS |
| backdrop_url on all items | PASS — all 10 items |
| backdrop_url uses hermestv.local | PASS |
| logo_url | PASS — live channels have logo_url; VOD/series have null (correct) |

---

## Schema Validator Mismatch — KEY GAP

The `tools/schema-validate.js` manual check expects:
- `data.providers` — EXISTS in catalog.mock.json as providers summary array
- `data.profiles` — MISSING from catalog.mock.json
- `data.catalog` — MISSING (the key in mock JSON is `items`, not `catalog`)

Also: The schema validator accepts only `provider_id: "apollo"` or `"xtremehd"` but the mock JSON uses `"apollo_group"`. The validator fails with `unknown provider_id: apollo_group`.

**Result:** `node tools/schema-validate.js` reports 2 FAIL (confirmed by running the tool):
```
FAIL: Missing profiles array
FAIL: Missing catalog array
FAIL (ajv): npx ajv not installed
```

### Recommended Fix — catalog.js Route

The backend catalog.js route only has 5 items (ch-001 through ch-004 + vod-001) with different IDs and structure from the mock JSON. The mock API (mockApi.js) reads from the JSON file directly, while the live API uses the in-memory CATALOG_ITEMS array. These are out of sync.

**Recommendation (patch — see below):** Update catalog.js CATALOG_ITEMS to match the full 10-item catalog from catalog.mock.json.

---

## Actor Data Coverage

| Actor | photo_url | bio_short | known_for_titles | cast_ids referenced |
|---|---|---|---|---|
| actor-001 Tom Cruise | PASS | PASS | [vod-001] | vod-001 cast_ids |
| actor-002 Ryan Gosling | PASS | PASS | [vod-002] | vod-002 cast_ids |
| actor-003 Keanu Reeves | PASS | PASS | [vod-003] | vod-003 cast_ids |
| actor-004 Julia Roberts | PASS | PASS | [vod-004] | vod-004 cast_ids |
| actor-005 Kevin Costner | PASS | PASS | [ser-001] | ser-001 cast_ids |

The catalog.js ACTORS array uses different actor IDs (`act-001` through `act-005`) than catalog.mock.json (`actor-001` through `actor-005`). This will cause cast_ids lookups to fail when the live API is used.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| schema-validate.js expects `catalog` key, mock uses `items` | P1 | Tool reports false failure |
| schema-validate.js rejects `apollo_group` provider_id | P1 | Tool reports false failure |
| catalog.js CATALOG_ITEMS (5 items) vs mock JSON (10 items) | P1 | Out of sync |
| Actor IDs: act-001 in catalog.js vs actor-001 in mock JSON | P1 | cast_ids lookup breaks on live API |
| No `session_limit_status: near_limit` test item | P3 | Warning UI untestable |
| profiles array missing from catalog.mock.json | P2 | Schema validation failure |

# Lane 09 — Source Health/Quality Bar Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** StreamingQualityBar.jsx, SourceComparePanel.jsx

---

## Summary

StreamingQualityBar and SourceComparePanel are well-implemented for B2 mock mode. The color coding is correct, provider selection works, and single-provider mode is handled gracefully. The main gaps are: the StreamingQualityBar reads from `provider_id` on item.providers[] but the mock catalog uses `source_health` as a nested object rather than having `health_score` directly on the provider entry.

---

## StreamingQualityBar

### Field Coverage

| Field | Shown | Source in Code |
|---|---|---|
| Health dot (color) | PASS | scoreColor(health_score) — 80+ green, 50-79 yellow, below red |
| Resolution badge | PASS | Falls back to item.resolution if provider entry lacks it |
| HDR badge | PASS | Falls back to item.has_hdr |
| Codec badge | PASS | Falls back to item.codec |
| Startup latency (ms) | PASS | providerEntry.startup_latency_ms |
| Health score bar | PASS | Width = health_score % |
| Session limit warning | PASS | near_limit = yellow warning, at_limit = red warning |

### Health Score Color Coding

```js
if (score >= 80) { return '#3fb950'; }  // green
if (score >= 50) { return '#e3b341'; }  // yellow
return '#f85149';                        // red
```

PASS — matches the specification (80+ green, 50-79 yellow, below 50 red).

### Provider Entry Shape Mismatch — KEY GAP

StreamingQualityBar looks for `health_score` directly on the provider entry:
```js
var healthScore = typeof providerEntry.health_score === 'number' ? providerEntry.health_score : null;
```

But in catalog.mock.json, the source_health data is nested under `source_health`:
```json
{
  "provider_id": "apollo_group",
  "source_id": "mock-src-apollo-live-001",
  "source_health": {
    "health_score": 85,
    "health_label": "Good",
    ...
  }
}
```

The bar component reads `providerEntry.health_score` but the actual health score is at `providerEntry.source_health.health_score`.

**Result:** In B2, StreamingQualityBar will always show "Quality data loading..." (the no-provider-entry fallback) because `providerEntry.health_score` is undefined on all mock items.

**Required fix:** The StreamingQualityBar should try both paths:
```js
var healthScore = typeof providerEntry.health_score === 'number'
  ? providerEntry.health_score
  : (providerEntry.source_health && typeof providerEntry.source_health.health_score === 'number'
    ? providerEntry.source_health.health_score
    : null);
```

---

## SourceComparePanel

### Provider Rendering

| Check | Result | Notes |
|---|---|---|
| Rich format (item.providers[]) | PASS — handled by buildProviderCards() |
| Flat format (provider_tags + provider_health) | PASS — legacy fallback handled |
| Selected provider highlighted | PASS — blue border + "ACTIVE" badge |
| Select button disabled when selected | PASS |
| onSelectProvider callback | PASS — calls parent's handleSelectProvider |
| Single provider mode | PASS — isSingle=true hides "Source Comparison" header, shows single card |
| No providers | PASS — returns "No provider information available." |
| display_name from globalProviders | PASS — looks up display_label from providers list |
| health_score bar | PARTIAL — same shape mismatch as StreamingQualityBar: expects `health_score` on entry, not `source_health.health_score` |

### Switch Provider Flow

- onSelectProvider is wired to App.jsx's `handleSelectProvider` which calls `patchState({ selectedProviderId: providerId })`
- The selectedProviderId is passed down to MediaDetailPanel → SourceComparePanel and StreamingQualityBar
- PASS — the flow is complete end-to-end

---

## B3 Real Quality Scanning Gap

**Status:** Not implemented, correctly deferred.
**B3 plan:** The `services/hermes-quality-scanner/` service (directory exists) should run ffprobe against IPTV streams and populate source_health records in Redis. These health records would then be served by the backend instead of the mock static values.

**Note:** The quality scanner service directory exists at `services/hermes-quality-scanner/` but its internal files were not audited in this lane.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| StreamingQualityBar reads wrong path for health_score | P1 | Should read source_health.health_score, not health_score directly |
| SourceComparePanel same path issue for health_score | P1 | Same fix needed |
| No near_limit / at_limit mock items | P3 | Warning UI not visually testable |
| Real quality scanning (ffprobe) | B3 work item | hermes-quality-scanner service needed |

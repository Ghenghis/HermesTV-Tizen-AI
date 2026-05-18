# 15 — Cinematic Metadata and Source Health Contract

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for how cinematic metadata (plot, cast, ratings) and source health (quality scores, latency, buffering) are structured, stored, and displayed in HermesTV. It is a design-lock referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` (agents 7 and 14).

## Purpose

HermesTV surfaces two categories of enrichment data alongside every catalog entry:

1. **Cinematic metadata** — human-readable content information: plot synopsis, cast members, content ratings, genre tags.
2. **Source health** — machine-measured quality signals: resolution quality score, stream latency, buffering rate, provider uptime snapshot.

Both categories are populated entirely from `catalog.mock.json` in mock mode. Neither category requires an internet call in B2. Real data pipelines (TMDB, IMDb, ffprobe quality scanner) are deferred to B3 and later milestones.

---

## Hard rules

1. No real TMDB or IMDb API calls in any B2 code path. Any import of a TMDB/IMDb client library in B2 is a build failure.
2. No real provider stream URLs in metadata fields. Placeholder URLs must match the pattern `mock://provider/<channel_id>`.
3. Plot synopsis text is capped at 500 characters. The UI truncates at 500 chars with an ellipsis; the backend rejects any catalog entry whose `plot` field exceeds 500 characters at schema validation time.
4. Actor resolution is purely catalog-local: the `actors` array in `catalog.mock.json` is the only actor database in B2. No external actor lookup service.
5. Source health data in mock mode is static — values never change between page loads. Dynamic health updates (real ffprobe polling) are a B3 feature.
6. Source health colors are computed from thresholds defined in this document. Components must not hard-code color hex values; they read from the threshold map at render time.
7. `QN`-prefix TVs (Sherri, enhanced tier) show the full SourceComparePanel with animated quality bars. `UN`-prefix TVs (Dave, baseline tier) show a condensed single-row health badge only.

---

## Cinematic metadata schema

Each catalog entry in `catalog.mock.json` carries a `metadata` object.

```json
{
  "catalog_id": "ch_apollo_4k_001",
  "title": "Apollo Group 4K Demo",
  "metadata": {
    "plot": "A showcase of 4K streaming quality via Apollo Group. Placeholder content for mock mode.",
    "content_rating": "TV-PG",
    "genre_tags": ["demo", "4K", "streaming"],
    "year": 2024,
    "runtime_minutes": null,
    "cast_ids": ["act_001", "act_002"],
    "external_ids": {
      "tmdb_id": null,
      "imdb_id": null
    },
    "poster_url": "mock://assets/poster/ch_apollo_4k_001.jpg",
    "hero_url": "mock://assets/hero/ch_apollo_4k_001.jpg"
  }
}
```

### Field definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `plot` | string | yes | Max 500 characters. Plain text only. No HTML. |
| `content_rating` | string | yes | One of: `G`, `PG`, `PG-13`, `R`, `NC-17`, `TV-Y`, `TV-G`, `TV-PG`, `TV-14`, `TV-MA`, `NR`. |
| `genre_tags` | string[] | yes | 1–6 tags. Each tag max 32 characters. |
| `year` | integer | yes | 4-digit year. Null allowed for live channels. |
| `runtime_minutes` | integer or null | yes | Null for live and ongoing series. |
| `cast_ids` | string[] | yes | References actor records in the catalog `actors` array. May be empty array. |
| `external_ids.tmdb_id` | integer or null | yes | Always null in mock mode. |
| `external_ids.imdb_id` | string or null | yes | Always null in mock mode. Must start with `tt` if non-null. |
| `poster_url` | string | yes | Must match `mock://` scheme in mock mode. |
| `hero_url` | string | yes | Must match `mock://` scheme in mock mode. |

---

## Actor schema and resolution

The `actors` array lives at the root of `catalog.mock.json`, parallel to the `channels` array.

```json
{
  "actors": [
    {
      "actor_id": "act_001",
      "name": "Dana Placeholder",
      "headshot_url": "mock://assets/actor/act_001.jpg",
      "known_for": ["4K Demo Series", "HermesTV Showcase"],
      "bio_short": "A fictional cast member used for mock UI testing."
    }
  ]
}
```

### Actor field definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `actor_id` | string | yes | Unique. Format: `act_` + 3-digit zero-padded integer. |
| `name` | string | yes | Display name. Max 80 characters. |
| `headshot_url` | string | yes | Must match `mock://` scheme in mock mode. |
| `known_for` | string[] | yes | Up to 5 titles. Each max 80 characters. May be empty array. |
| `bio_short` | string | yes | Max 200 characters. Plain text only. |

### Resolution logic

When `MediaDetailPanel` renders cast:

1. Read `metadata.cast_ids` from the active catalog entry.
2. For each `actor_id` in `cast_ids`, perform a linear scan of the root `actors` array for an entry with matching `actor_id`.
3. If found, render an `ActorCard` with `name`, `headshot_url`, and `known_for`.
4. If not found, render a placeholder `ActorCard` with name "Unknown" and a default headshot. Do not throw. Do not crash.
5. The actor lookup is synchronous in mock mode — no async call, no suspense boundary needed for the actor list itself.

---

## Source health schema

Each catalog entry carries a `source_health` object alongside `metadata`.

```json
{
  "catalog_id": "ch_apollo_4k_001",
  "source_health": {
    "quality_score": 92,
    "resolution_label": "4K",
    "latency_ms": 340,
    "buffer_rate_pct": 0.4,
    "provider_status": "ok",
    "last_checked_at": "2026-05-17T00:00:00.000Z",
    "health_tier": "excellent"
  }
}
```

### Source health field definitions

| Field | Type | Required | Notes |
|---|---|---|---|
| `quality_score` | integer | yes | 0–100. Composite score. See threshold table below. |
| `resolution_label` | string | yes | One of: `4K`, `1080p`, `720p`, `480p`, `low`. |
| `latency_ms` | integer | yes | End-to-end stream start latency in milliseconds (mock value). |
| `buffer_rate_pct` | number | yes | Buffering events per 100 seconds of playback (mock value). |
| `provider_status` | string | yes | One of: `ok`, `degraded`, `down`. Always `ok` in mock mode. |
| `last_checked_at` | string | yes | ISO 8601 UTC timestamp. Static in mock mode. |
| `health_tier` | string | yes | Computed from `quality_score`. See threshold table. Must match the computed value — schema validator rejects mismatches. |

### Health tier thresholds

| `quality_score` range | `health_tier` | UI color token |
|---|---|---|
| 85–100 | `excellent` | `--health-excellent` (#22c55e, green) |
| 65–84 | `good` | `--health-good` (#84cc16, lime) |
| 45–64 | `fair` | `--health-fair` (#f59e0b, amber) |
| 20–44 | `poor` | `--health-poor` (#ef4444, red) |
| 0–19 | `critical` | `--health-critical` (#7c3aed, violet) |

Components must read color from CSS custom properties (`--health-*`), never hard-coded hex values.

---

## Components

### StreamingQualityBar

Renders a horizontal segmented bar representing `quality_score` (0–100) with a color fill determined by `health_tier`.

Behavior:
- Width of filled portion = `quality_score / 100 * bar_width_px`.
- Fill color = CSS variable for the entry's `health_tier`.
- Below the bar: `resolution_label` left-aligned, `quality_score` right-aligned.
- Tooltip on hover/focus: shows `latency_ms`, `buffer_rate_pct`, `provider_status`, `last_checked_at`.
- On baseline tier (Dave's UN TV): renders only the `resolution_label` badge and `health_tier` pill. The animated bar is suppressed.
- On enhanced tier (Sherri's QN TV): renders the full animated fill transition (CSS transition, 400ms ease-out).

Acceptance gate: renders without crash for every `health_tier` value. Colors match the threshold table. Baseline suppression works.

### SourceComparePanel

Renders a side-by-side comparison of two or more `source_health` records for the same content available from multiple providers.

Behavior:
- Only shown on enhanced tier (QN TV). Not rendered at all on baseline tier.
- Each provider column shows: `provider_status` icon, `quality_score` bar (same `StreamingQualityBar` component), `latency_ms`, `buffer_rate_pct`.
- Best score is highlighted with a `--health-excellent` border and a "Best" badge.
- In mock mode: `provider_status` is always `ok` for all entries. The panel still renders and compares scores.
- The panel is dismissed by pressing Back or clicking outside it.

Acceptance gate: panel renders without crash. Colors correct. "Best" badge appears on the highest `quality_score` entry. Baseline tier: panel is absent (not hidden — not mounted).

### MediaDetailPanel

Renders full detail for a selected catalog entry: title, poster, hero image, plot, genre tags, content rating, cast list, and the `StreamingQualityBar`.

Cast list behavior:
- Maps `metadata.cast_ids` through actor resolution (see above).
- Renders up to 6 `ActorCard` components in a horizontal scroll rail.
- `ActorCard` shows: headshot, name, `known_for[0]` (first title).
- If `cast_ids` is empty, renders a "No cast information available" placeholder row. Never hides the cast section entirely.
- Plot text is truncated at 500 characters with a "Show more" toggle. "Show more" expands to full text inline (no navigation).

Acceptance gate: panel renders without crash. Actor cards show for all valid `cast_ids`. Unknown actor IDs render placeholder card. Plot truncation and "Show more" work. `StreamingQualityBar` embedded correctly.

---

## Mock mode behavior

In mock mode (B2), all cinematic metadata and source health data is sourced exclusively from `catalog.mock.json`. The following are static and do not change at runtime:

- All `source_health` objects (quality scores, latency, buffering rates, provider status).
- All `metadata` objects (plot, cast, ratings, year, genre tags).
- All actor records.

No polling timer runs in mock mode. The "last checked" timestamp shown in tooltips reflects the static value from the catalog file.

The B3 milestone introduces the real ffprobe quality scanner. When the scanner is active, `source_health` fields are populated from live measurements and refresh on a configurable interval (default: 60 seconds). The `last_checked_at` field updates to reflect real scan time. This document will be versioned at that milestone.

---

## Schema validation rules (enforced at catalog load)

The catalog loader validates every entry before exposing it to the UI. A catalog that fails validation causes the loader to fall back to an empty catalog with a visible error state — it does not crash the app.

Validation errors that cause rejection:
- `plot` exceeds 500 characters.
- `health_tier` does not match the computed tier from `quality_score`.
- `provider_status` is not one of `ok`, `degraded`, `down`.
- `poster_url` or `hero_url` does not match `mock://` in mock mode.
- `actor_id` in `cast_ids` references a non-existent actor (logged as warning, not rejection — see resolution logic above).
- `external_ids.tmdb_id` or `external_ids.imdb_id` is non-null in mock mode (rejected — no real IDs in mock).
- `content_rating` is not on the allowed list.

---

## Acceptance gates

| Gate | Criterion |
|---|---|
| AG-15-01 | `StreamingQualityBar` renders for all 5 `health_tier` values without crash. |
| AG-15-02 | `StreamingQualityBar` colors match threshold table (CSS variable tokens, not hex). |
| AG-15-03 | `SourceComparePanel` is not mounted on baseline tier (Dave's UN TV). |
| AG-15-04 | `SourceComparePanel` renders on enhanced tier (Sherri's QN TV) with correct colors and "Best" badge. |
| AG-15-05 | `MediaDetailPanel` renders actor cards for all `cast_ids` in `catalog.mock.json`. |
| AG-15-06 | Unknown `actor_id` in `cast_ids` renders placeholder card, not a crash. |
| AG-15-07 | `MediaDetailPanel` plot truncates at 500 chars; "Show more" expands inline. |
| AG-15-08 | Catalog entries with `plot` > 500 chars are rejected at load; error state visible; app does not crash. |
| AG-15-09 | No TMDB or IMDb HTTP call appears in browser devtools network log in mock mode. |
| AG-15-10 | `health_tier` mismatch in catalog causes rejection, not silent acceptance. |

---

## Out of scope for B2

- Real TMDB/IMDb metadata ingestion (B3+).
- Real ffprobe quality scanner (B3+).
- Dynamic source health polling (B3+).
- Provider uptime monitoring (B4+).
- User-submitted ratings or reviews (out of scope entirely for v1).
- Multi-language plot/cast data (out of scope for v1).

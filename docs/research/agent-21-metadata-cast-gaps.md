# Lane 08 — Metadata/Cast/Actor Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** MediaDetailPanel.jsx, ActorCard.jsx, catalog.js actors, catalog.mock.json actors

---

## Summary

Actor lookup logic is correct in MediaDetailPanel. ActorCard handles missing photo_url correctly with an initials fallback. The critical gap is the actor ID format mismatch between catalog.js (act-001) and catalog.mock.json (actor-001) which breaks cast_ids → actor lookup when the live API is used.

---

## Actor Lookup Logic (MediaDetailPanel.jsx)

The lookup implementation:
```js
var castIds = Array.isArray(metadata.cast_ids) ? metadata.cast_ids : [];
var castActors = [];
if (castIds.length > 0 && actors.length > 0) {
  for (var i = 0; i < castIds.length; i++) {
    for (var j = 0; j < actors.length; j++) {
      if (actors[j].actor_id === castIds[i]) {
        castActors.push(actors[j]);
        break;
      }
    }
  }
}
```

| Check | Result | Notes |
|---|---|---|
| cast_ids → actors array lookup | PASS — O(n*m) nested loop, correct for 5 actors |
| Handles empty cast_ids | PASS — castActors stays [] |
| Handles missing actors array | PASS — empty actors arg defaults to [] |
| ID format match (mock API path) | PASS — mock JSON uses actor-001, mock API returns actor-001 |
| ID format match (live API path) | FAIL — catalog.js uses act-001, which will never match actor-001 in cast_ids |

---

## ActorCard — Missing photo_url Handling

```js
var showInitials = !photoUrl || imgError;
```

| Check | Result | Notes |
|---|---|---|
| Missing photo_url shows initials | PASS — shows accent-colored circle with 2-letter initials |
| Image load error shows initials | PASS — onError sets imgError=true |
| Fallback for empty name | PASS — uses '?' if no initials derivable |
| Alt text on image | PASS — uses actor.name as alt |
| aria-hidden on decorative initials div | PASS — aria-hidden="true" |
| bio_short shown | PASS — clamped to 2 lines with WebkitLineClamp |

---

## Mock Actor Data Completeness

| Field | actor-001 | actor-002 | actor-003 | actor-004 | actor-005 |
|---|---|---|---|---|---|
| actor_id | PASS | PASS | PASS | PASS | PASS |
| name | Tom Cruise | Ryan Gosling | Keanu Reeves | Julia Roberts | Kevin Costner |
| photo_url | PASS (hermestv.local) | PASS | PASS | PASS | PASS |
| known_for_titles | [vod-001] | [vod-002] | [vod-003] | [vod-004] | [ser-001] |
| bio_short | PASS | PASS | PASS | PASS | PASS |

All 5 actors have complete data. All photo_url values use hermestv.local. No external CDN references.

---

## catalog.js ACTORS vs catalog.mock.json actors — Critical Gap

| Source | ID format | Example |
|---|---|---|
| catalog.js (live API) | act-NNN | act-001 |
| catalog.mock.json (mock API) | actor-NNN | actor-001 |
| catalog.item.schema.json | actor-NNN | actor-001 |
| actor.person.schema.json | actor-NNN | actor-001 |

The schema defines `^actor-[0-9]{3,}$` as the pattern. catalog.js uses `act-001` which is a non-conforming format that will break:
1. Schema validation (act-001 doesn't match pattern)
2. cast_ids lookups (metadata.cast_ids uses actor-001 format; catalog.js actors use act-001)

**This is the highest-priority actor gap.**

---

## TMDB/IMDB Real Integration Plan (B3 Note)

**Current state:** All metadata is entirely mock. No external API calls.

**TMDB free tier availability:**
- TMDB offers a free API tier (no credits needed for read-only public metadata)
- Base URL: `https://api.themoviedb.org/3/`
- Authentication: `?api_key=<key>` or Bearer token in Authorization header
- Free tier: 40 requests/10 seconds, ~750k requests/day
- No cost for public movie/TV metadata, posters, backdrops

**B3 plan (note only, not implemented):**
1. Store TMDB API key in `G:\private\.env.hermestv` as `TMDB_API_KEY=`
2. Backend catalog service fetches metadata from TMDB using Dispatcharr/catalog IDs
3. Cache in Redis (TTL 24 hours — metadata changes slowly)
4. Serve enriched metadata via `/api/catalog` with real plot, cast, poster URLs (proxied through hermestv.local)
5. Real poster/backdrop images proxied through the backend to avoid CORS and to maintain hermestv.local URL policy

No TMDB credentials are needed for this research — the API is public knowledge.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| catalog.js uses act-001 instead of actor-001 | P1 | Breaks all cast_ids lookups on live API |
| No real TMDB integration | B3 work item | Free TMDB API available; needs backend proxy |
| CatalogGrid cast_ids not surfaced in grid view | P3 | Grid cards show no actor info; only detail panel shows actors |

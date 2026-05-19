# 44 — EPG / XMLTV Setup

This page tells an operator how to wire a real Electronic Program Guide into
HermesTV. Once configured, `GET /api/epg` stops returning a stub and starts
serving live channel + program data parsed from an upstream XMLTV feed.

The implementation lives in:

- `services/hermes-tv-api/src/integrations/xmltv.js` — fetcher, parser, cache.
- `services/hermes-tv-api/src/data/channelMap.json` — XMLTV ID → HermesTV ID map.
- `services/hermes-tv-api/src/routes/epg.js` — wires both into `GET /api/epg`.

## 1. Find a free XMLTV source for your region

Recommended starter: **iptv-org/epg** at <https://github.com/iptv-org/epg>.
The maintainers publish per-region feeds at predictable URLs like:

- `https://iptv-org.github.io/epg/guides/us.xml`
- `https://iptv-org.github.io/epg/guides/gb.xml`
- `https://iptv-org.github.io/epg/guides/uk_skysports.xml`
- `https://iptv-org.github.io/epg/guides/ca.xml`

These are **free, no key, no rate-limit**. They are XMLTV files (UTF-8 XML
with `<tv>`, `<channel>`, `<programme>` elements) which is exactly what our
parser expects. Use them while you bring the operator app up.

For a real production deployment your IPTV reseller will usually publish a
private XMLTV URL keyed to your account — something like:

```
http://epg.your-provider.example/xmltv?username=…&password=…
```

That URL goes into `XMLTV_URL` (see step 2). **Credentials in the query
string are never echoed to clients.** The cache key is computed with auth
tokens stripped so rotating a key doesn't duplicate cache rows, and the
`_meta.source_label` field in the response only contains the host + path.

## 2. Set `XMLTV_URL` in `.env`

Open `services/hermes-tv-api/.env` (or whichever file your deploy reads —
on the VPS it's the compose-mounted env file referenced from
`docs/29_HERMESTV_DEPLOY_RUNBOOK.md`) and add:

```env
# ── XMLTV EPG source ──
# Public iptv-org example:
XMLTV_URL=https://iptv-org.github.io/epg/guides/us.xml

# Allow ?force_refresh=1 to bypass the 5-minute cache. Off in production —
# turn it on briefly when you change channelMap.json and want to verify
# without waiting for the TTL to expire.
EPG_ALLOW_FORCE_REFRESH=0
```

Restart the API (`docker compose restart hermestv-api` on the VPS,
`npm run dev` locally) and curl the endpoint:

```bash
curl -s http://localhost:3001/api/epg | jq '._meta'
```

You should see `_meta.source: "xmltv"` and a non-zero `raw_channel_count`.
If `channel_count` is still zero, your XMLTV channel IDs don't match the
ones in `channelMap.json` yet — that's step 3.

## 3. Extend `channelMap.json`

The map at `services/hermes-tv-api/src/data/channelMap.json` translates the
upstream XMLTV `<channel id="...">` attributes into HermesTV catalog
channel IDs (the slug form `live.<slug>`, e.g. `live.cnn`).

**Find the upstream IDs.** The endpoint sends them back as a response header:

```bash
curl -sI http://localhost:3001/api/epg | grep -i x-hermes-xmltv-channels
# X-Hermes-XMLTV-Channels: bbc1.uk,bbc2.uk,itv1.uk,channel4.uk,channel5.uk,…
```

That's the first 20 raw IDs from your feed. Pick the ones you want to
surface and add them to `channelMap.json`:

```json
{
  "_about": "XMLTV → HermesTV channel ID map. See docs/44_EPG_XMLTV_SETUP.md.",
  "map": {
    "bbc1.uk":    "live.bbc-world",
    "cnn.us":     "live.cnn",
    "espn.us":    "live.espn",
    "espn2.us":   "live.espn2",
    "hgtv.us":    "live.hgtv",
    "hallmark.us":"live.hallmark"
  }
}
```

**The HermesTV side.** Values must match a slug that exists in
`services/hermes-tv-api/src/data/seedCatalog.js` (the `LIVE_DEFS` array).
The slug is the `slug` field on each entry — `cnn`, `espn`, `hallmark`,
etc. Prefix with `live.` to form the channel ID.

The file is **additive** — channels not present in the map are silently
dropped from `/api/epg` so you never see orphan tiles. Adding a new
mapping requires:

1. Edit `channelMap.json`.
2. Restart the API (the file is loaded once at process start).
3. If `EPG_ALLOW_FORCE_REFRESH=1` is set, `curl '…/api/epg?force_refresh=1'`
   to verify without waiting for the 5-minute cache.

## 4. How the cache works

- TTL: **5 minutes** (`CACHE_TTL_MS` in `xmltv.js`).
- Key: the upstream URL **with auth tokens stripped** — so rotating a
  `?key=…` token won't double-populate the cache.
- Up to 8 entries (`MAX_CACHE_ENTRIES`); oldest is evicted when the
  limit is hit.
- Stale-cache fallback: if the upstream returns a 4xx/5xx, we serve the
  last successful parse and mark it via `_meta.error =
  "http_*_using_stale_cache"`. The EPGGrid component can use this to
  show a "stale data" pill.
- Concurrent requests for the same URL coalesce — the first inflight
  fetch covers all of them.
- The cache is **per-process, in-memory only**. A pod restart drops it
  and the next `/api/epg` triggers a fresh fetch.

## 5. Force-refresh during testing

In dev:

```env
EPG_ALLOW_FORCE_REFRESH=1
```

then:

```bash
curl -s 'http://localhost:3001/api/epg?force_refresh=1' | jq '._meta.force_refresh'
# "applied"
```

In production you usually want this **off** so a misbehaving client can't
force-fetch on every request and rate-limit you out of your upstream
provider. The endpoint surfaces the decision in `_meta.force_refresh`
(`"applied"`, `"denied (set EPG_ALLOW_FORCE_REFRESH=1)"`, or
`"not_requested"`).

## 6. Troubleshooting

### `channel_count: 0` but `raw_channel_count > 0`

Your XMLTV channel IDs don't match anything in `channelMap.json`. Check
the `X-Hermes-XMLTV-Channels` response header (first 20 raw IDs from the
feed) and add the relevant entries.

### `error: "http_403"` or `error: "http_404"`

The upstream URL is wrong or your auth token expired. Re-issue the URL
from your provider's portal. If you're using a public iptv-org feed,
the file might have been renamed — check
<https://github.com/iptv-org/epg/tree/master/sites>.

### `error: "fetch_failed: AbortError"`

The upstream took longer than 10 seconds (`FETCH_TIMEOUT_MS`). Either
the provider is sluggish or the file is very large. Try a smaller
regional feed first.

### `error: "xml_parse_failed: …"`

The upstream returned XML that `fast-xml-parser` can't read. Save the
file (`curl URL > /tmp/feed.xml`) and inspect — usually it's an HTML
error page returned instead of XML, in which case the upstream URL is
wrong.

### Timestamps look off by hours

XMLTV emitters disagree on time-zone notation. Our parser accepts:

- `20260519080000 +0000` (XMLTV traditional)
- `20260519080000` (assumed UTC)
- `20260519T080000Z` (ISO 8601 basic)
- `2026-05-19T08:00:00Z` (ISO 8601 extended)
- `2026-05-19T08:00:00+00:00` (extended with offset)

If your feed uses something else (e.g. `+0530` without a colon — that
form **is** supported, the parser strips the colon), open an issue with
a 10-line excerpt and we'll extend `_parseTimestamp`.

### `_meta.cache.fresh: false` for ages

Either you reload the page faster than the TTL, or your upstream is
flapping and the stale-cache path is keeping you on the last good parse.
Check the API logs for `[xmltv] fetch failed…` warnings.

## 7. Operator sanity check

Once everything is wired:

```bash
curl -s http://localhost:3001/api/epg | jq '{
  channels: (.channels | length),
  programs: (.programs | length),
  source:   ._meta.source,
  fetched:  ._meta.fetched_at,
  age_ms:   ._meta.cache.age_ms,
  error:    ._meta.error
}'
```

Expected output:

```json
{
  "channels": 12,
  "programs": 240,
  "source": "xmltv",
  "fetched": "2026-05-19T08:14:21.413Z",
  "age_ms": 1421,
  "error": null
}
```

If you see that, the EPG grid in the TV UI is live.

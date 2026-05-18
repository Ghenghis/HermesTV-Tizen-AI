# EPG Sources Reference

Curated from https://github.com/iptv-org/awesome-iptv — public XMLTV EPG sources evaluated for HermesTV integration.

---

## Public EPG Sources

| Source | URL pattern | Format | Free | Notes |
|---|---|---|---|---|
| EPG for IPTV | `epg.pw/xmltv/...` | XMLTV | Yes | Large channel coverage; per-country XMLTV files; reliable uptime |
| i.mjh.nz | `i.mjh.nz/...` | XMLTV | Yes | Excellent AU/NZ/UK coverage; well-maintained; streams+EPG in one place |
| IPTVX\|one | `iptvx.one/epg/...` | XMLTV + JSON | Yes | EU focused; JSON API available alongside XMLTV |
| epg.51zmt.top | `epg.51zmt.top/...` | XMLTV | Yes | CN focused; large Chinese channel database |
| EPGSHARE01 | github:epgshare01 | XMLTV | Yes | Community maintained; aggregated from multiple contributors |
| Open EPG | github:doglol/open-epg | XMLTV | Yes | Multi-source aggregated; broad international coverage |

---

## Source Selection Notes

- **EPG for IPTV** (`epg.pw`) is the most broadly useful for US/UK/EU channels HermesTV caters to — use as primary public EPG fallback.
- **i.mjh.nz** is the preferred source for Australian and New Zealand channels if those are present in the provider catalog.
- **IPTVX|one** JSON API is useful for programmatic lookups when XMLTV parsing is too heavy for a simple channel-name resolution call.
- **epg.51zmt.top** and **EPGSHARE01** are niche — only pull in if the catalog contains significant CN channel inventory.
- **Open EPG** is a good secondary aggregator to cross-reference unmatched channels.

These sources supplement — but do not replace — the provider-native XMLTV feeds from Apollo Group and XtremeHD, which take precedence.

---

## HermesTV EPG Architecture

The EPG data pipeline flows as follows:

```
Provider XMLTV feeds
(Apollo Group + XtremeHD Xtream /xmltv endpoint)
         |
         v
  @iptv/xmltv parser
  (normalization + validation in backend service)
         |
         v
    Threadfin
  (M3U + XMLTV proxy aggregator; merges provider feeds
   with public EPG fallbacks for unmatched channels)
         |
         v
    Dispatcharr
  (stable channel ID assignment; channel metadata store;
   maps volatile provider channel IDs to stable Dispatcharr IDs)
         |
         v
   Jellyfin Live TV
  (EPG grid, recording schedule, guide data consumer)
         |
         v
   HermesTV API
  (backend REST layer; serves guide data to TV app)
         |
         v
   HermesTV Tizen App
  (QN85/QN95 QLED TV — EPG grid rendered in app)
```

### Hard rules in this pipeline

- **EPG source URLs contain credentials and are NEVER exposed in API responses to the TV.** Any Apollo or XtremeHD XMLTV URL embeds the subscriber username and password in the URL path (`/xmltv/<user>/<pass>/`). These are consumed server-side only and never forwarded to the Tizen app.
- All EPG data served to the TV passes through the HermesTV API, which strips source URL information and returns only guide content (channel name, programme title, description, start/stop times, category, series metadata).
- The `@iptv/xmltv` library is the **recommended and sole approved** XMLTV parser for the backend. Do not use custom regex or DOM parsers on XMLTV — the library handles namespace quirks and encoding edge cases correctly.
- Public EPG sources (epg.pw, i.mjh.nz, etc.) are fetched and cached server-side. They are never fetched from the TV directly.

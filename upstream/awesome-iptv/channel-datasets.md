# Channel Datasets and Logo Sources

Curated from https://github.com/iptv-org/awesome-iptv — channel metadata, logo, and icon sources evaluated for HermesTV EPG grid.

---

## Dataset Matrix

| Source | Purpose | HermesTV use |
|---|---|---|
| LyngSat | Channel metadata (frequency, transponder, region, language) | EPG channel matching fallback — cross-reference when provider XMLTV channel names are ambiguous |
| LyngSat Logo | Channel logo images (standardized filenames) | Logo CDN reference — URL pattern for fetching logos by channel name when provider logo is missing |
| Picons | Channel icon packs (sp, srp, sz variants) | High-res channel logos for EPG grid — primary fallback pack for channels unmatched by Dispatcharr |
| TV Address | Channel address/locality data | Regional channel mapping — identifies correct regional variant of a channel for geo-aware catalog |
| Logopedia | Channel logo archive (historical and current) | Logo fallback chain — last resort logo source for defunct or rebranded channels |
| fanmingming/live | CN live streams and channel metadata | Reference for Chinese channel names, logos, and EPG IDs if CN inventory is added to catalog |

---

## Logo Source Details

### LyngSat Logo
- URL pattern: `https://www.lyngsat-logo.com/logo/<category>/<channel-slug>.png`
- Standardized by channel name slug; large coverage for international broadcasters
- Free for non-commercial use; do not hotlink in production — cache logos in backend

### Picons
- Formats: `sp` (220x132 standard), `srp` (220x132 reflected), `sz` (full-size variants)
- Available as packed archives from github.com/picons and mirror CDNs
- HermesTV integration: Deploy picons archive to a local asset server in the backend stack. Dispatcharr can reference the local CDN path for unmatched channel logos.
- Naming convention matches TVHeadend/Kodi/Jellyfin PVR channel name slugs — align Dispatcharr channel names to picons slug convention for best auto-match rate.

### Logopedia
- `https://logos.fandom.com/wiki/` — human-curated, high-quality historical logos
- Not machine-queryable at scale; use as manual lookup for specific channels only

---

## HermesTV Channel Logo Architecture

```
Primary source:
  Dispatcharr channel metadata (logo URL field)
    — populated from provider M3U tvg-logo tag
    — proxied through backend to avoid exposing provider URLs to TV

Fallback chain (in order):
  1. Picons local CDN (slug match on Dispatcharr channel name)
  2. LyngSat Logo (slug match, backend-fetched and cached)
  3. Logopedia (manual assignment only — not auto-resolved)
  4. Generic category icon (sports, news, movies, etc.)
```

### Rules

- Channel logos are always served to the TV via the HermesTV API asset proxy — never direct provider URLs.
- Provider M3U `tvg-logo` URLs may embed authentication tokens or expose provider infrastructure. Strip and re-host all logos through the backend asset pipeline.
- Picons is the recommended fallback pack. Download and deploy a picons archive (sp variant) to the backend static asset server. Update the pack on a quarterly cadence.
- Logo resolution target for the QN85/QN95 EPG grid: minimum 220x132 px for channel list items; 440x264 px for the now-playing info panel.

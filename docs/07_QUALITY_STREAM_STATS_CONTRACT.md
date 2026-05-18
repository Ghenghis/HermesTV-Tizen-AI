# HermesTV — Doc 07: Quality Badge & Stream Stats Contract

**Version:** 1.0.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (Sherri — enhanced tier) · UN55CU8000BXZA (Dave — baseline tier)  
**Status:** BINDING — agents must not deviate from this schema

---

## 1. Purpose

This contract defines how HermesTV detects, displays, and lets users control stream quality information. It covers:

- Quality tier badge (480p / 720p / 1080p / 1440p / 4K; absent when unknown)
- Upscale detection heuristics
- Stream stats overlay (codec, bitrate, FPS, health)
- Multi-stream source panel
- Provider / server rating
- All user-toggleable display settings
- The ffprobe quality JSON schema served by the VPS scanner

---

## 2. Quality Tier Definitions

| Badge Label | `resolution` enum value (catalog) | Condition | Notes |
|---|---|---|---|
| `4K` | `"4K"` | video height > 1440 | Check upscale heuristics — flag if triggered |
| `1440p` | `"1440p"` | video height > 1080 and ≤ 1440 | Displayed as `1440p` in badge; catalog stores `"1440p"` |
| `1080p` | `"1080p"` | video height > 720 and ≤ 1080 | |
| `720p` | `"720p"` | video height > 480 and ≤ 720 | |
| `480p` | `"480p"` | video height ≤ 480 | |
| `unknown` | `"unknown"` | height absent or audio-only stream | Badge not shown on card; catalog stores `"unknown"` |

**Note:** The legacy "2K" label is retired. The badge now mirrors the catalog `resolution` enum exactly: `"4K"`, `"1440p"`, `"1080p"`, `"720p"`, `"480p"`, `"unknown"`. The string `"Other"` is also retired; use `"unknown"`. This ensures zero mismatch with the provider catalog schema (§ Quality block, `07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`).

Badge always reflects actual stream resolution from ffprobe, not the label embedded in the M3U title. M3U title labels are unreliable and must not be used as the primary source.

### 2.1 HDR Sub-badge

A secondary HDR badge appears alongside the resolution badge when detected:

| HDR Badge | Detection Signal (ffprobe `video.*` fields) |
|---|---|
| `HDR10` | `color_space = "bt2020"` AND `hdr_format = "HDR10"` |
| `HDR10+` | `hdr_format = "HDR10+"` (color_space may be bt2020 or absent) |
| `Dolby Vision` | `hdr_format = "dolby_vision"` |
| `HLG` | `color_space = "bt2020"` AND `hdr_format = "HLG"` |
| *(none shown)* | `color_space = "bt709"` OR `hdr_format = null` OR `hdr = false` |

`hdr_format` values are canonical lowercase-with-underscores strings set by the scanner. The raw ffprobe output field `color_primaries` is mapped to `color_space` by the scanner normalizer (e.g., `"bt2020"` maps from ffprobe's `"bt2020"` color_primaries value).

On Tizen, HDR detection is confirmed at playback time via AVPlay's `ON_HDR_DETECTED` event — ffprobe provides the pre-scan signal, AVPlay confirms it live.

---

## 3. Upscale Detection Heuristics

A stream is flagged `possible_upscale: true` (displayed as `⚠`) if ≥ 2 of the following 5 signals are true:

| # | Signal | Threshold |
|---|---|---|
| 1 | Low bitrate for resolution | 4K < 8000 kbps · 1440p < 4000 kbps · 1080p < 2000 kbps |
| 2 | Codec profile mismatch | AVC Main Profile at 4K / HEVC Main (not Main10) at 4K |
| 3 | Suspicious FPS + bitrate combo | fps > 60 AND bitrate < 6000 kbps at 4K |
| 4 | Color space mismatch | height > 1080 but `color_space = bt709` (not `bt2020`) |
| 5 | Pixel format mismatch | height > 1080 but `pixel_format = yuv420p` (not `yuv420p10le`) |

The field name in all output schemas is `possible_upscale` (boolean). This is the same field referenced by the provider catalog's `quality.possible_upscale`. The flag is informational only — the stream still plays. Badge appends `⚠` suffix when flagged (e.g., `4K ⚠`). Agents cannot suppress this flag. The `upscale_signals_triggered` array in the ffprobe output lists the 1-based signal numbers that fired (e.g., `[1, 4]`).

---

## 4. ffprobe Quality JSON Schema

The VPS ffprobe scanner (`services/hermes-quality-scanner`) outputs this schema per stream:

```json
{
  "stream_id": "ch_12_hd",
  "scan_utc": "2026-05-17T22:00:00Z",
  "video": {
    "resolution": "1080p",
    "width": 1920,
    "height": 1080,
    "codec": "h264",
    "profile": "High",
    "bitrate_kbps": 4200,
    "bitrate_bucket": "high",
    "fps": 29.97,
    "hdr": false,
    "hdr_format": null,
    "color_space": "bt709",
    "pixel_format": "yuv420p",
    "possible_upscale": false,
    "upscale_signals_triggered": []
  },
  "audio": {
    "codec": "aac",
    "channels": 2,
    "channel_layout": "stereo",
    "bitrate_kbps": 128,
    "language": "eng",
    "is_dolby_atmos": false
  },
  "subtitles": [
    { "language": "eng", "format": "dvb_subtitle", "is_sdh": true }
  ],
  "container": {
    "format": "mpegts",
    "duration_seconds": null,
    "is_live": true
  },
  "stream_health": {
    "latency_ms": 320,
    "buffer_fill_pct": 94,
    "packet_loss_pct": 0.1,
    "reconnect_count_1h": 0,
    "last_error": null,
    "live_ratio": 0.98
  },
  "provider_rating": {
    "auto_score": 87,
    "speed_mbps": 42.1,
    "latency_ms": 320,
    "uptime_pct_30d": 99.2,
    "failure_stability": 0.95
  },
  "probe_status": "ok"
}
```

### 4.1 Catalog Field Alignment

Field mapping between the ffprobe output and the provider catalog's `quality` block (`07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`):

| Catalog field | Maps to ffprobe output field | Notes |
|---|---|---|
| `resolution` | `video.resolution` | Enum: `"480p"` `"720p"` `"1080p"` `"1440p"` `"4K"` `"unknown"` |
| `codec` | `video.codec` | e.g. `"h264"` `"h265"` `"av1"` `"unknown"` |
| `bitrate_bucket` | `video.bitrate_bucket` | See §4.2 for derivation rules |
| `fps` | `video.fps` | `null` if unknown |
| `audio_codec` | `audio.codec` | `null` if unknown |
| `scan_utc` | root `scan_utc` | ISO-8601 UTC timestamp of when ffprobe completed |
| `possible_upscale` | `video.possible_upscale` | Boolean; `true` when ≥ 2 upscale heuristic signals fire |

### 4.2 `bitrate_bucket` Derivation

`bitrate_bucket` is derived from `video.bitrate_kbps` and stored in both the ffprobe output and the catalog item's `quality.bitrate_bucket` field. Enum values are `"low"`, `"medium"`, `"high"`, `"ultra"`, `"unknown"`.

| `bitrate_bucket` | Condition |
|---|---|
| `"ultra"` | bitrate_kbps ≥ 15000 |
| `"high"` | bitrate_kbps ≥ 4000 and < 15000 |
| `"medium"` | bitrate_kbps ≥ 1500 and < 4000 |
| `"low"` | bitrate_kbps > 0 and < 1500 |
| `"unknown"` | bitrate_kbps is null or 0 |

### 4.3 Provider Auto-Score Formula

```
auto_score = (live_ratio × 40) + (speed_factor × 25) + (latency_factor × 20) + (failure_stability × 15)

where:
  live_ratio       = stream_health.live_ratio (0.0–1.0)
  speed_factor     = min(provider_rating.speed_mbps / 100, 1.0)
  latency_factor   = max(0, 1 - (provider_rating.latency_ms / 2000))
  failure_stability = provider_rating.failure_stability (0.0–1.0)
```

Score range: 0–100. Display thresholds:

| Score | Rating Label | Badge Color |
|---|---|---|
| 90–100 | Excellent | Green |
| 75–89 | Good | Blue |
| 50–74 | Fair | Yellow |
| < 50 | Poor | Red |

---

## 5. ffprobe Scanner Command

```bash
ffprobe \
  -v quiet \
  -print_format json \
  -show_streams \
  -show_format \
  -analyzeduration 10000000 \
  -probesize 5000000 \
  -timeout 15000000 \
  "$STREAM_URL"
```

**Flag notes:**
- `-analyzeduration 10000000`: analyze up to 10 seconds of stream data (value is in microseconds).
- `-probesize 5000000`: read up to 5 MB of raw stream data before deciding on format.
- `-timeout 15000000`: hard 15-second network read timeout in microseconds — prevents the scanner process from hanging indefinitely on a dead or unresponsive stream URL.
- `$STREAM_URL` is resolved at scan time by the backend. The URL is **never** stored in the scan result, Redis entry, log output, or any file visible outside the backend process. It is used only for the duration of the ffprobe subprocess.

### 5.1 Probe Failure Handling

Every probe invocation must handle all failure modes. The scanner must not crash or emit partial results silently.

| Failure mode | Detection | `probe_status` value | `video` / `audio` fields |
|---|---|---|---|
| Dead stream / connection refused | ffprobe exit code ≠ 0, stderr contains `Connection refused` or `No such file or directory` | `"dead"` | All set to `null` |
| Network timeout | ffprobe exit code ≠ 0 after `-timeout` elapses | `"timeout"` | All set to `null` |
| Non-video URL (audio-only, image, HTML) | ffprobe returns no video stream entries | `"no_video"` | `video` block absent; `audio` block populated if audio is present |
| Probe returned no streams at all | ffprobe JSON has empty `"streams": []` | `"no_streams"` | Both `video` and `audio` blocks absent |
| ffprobe binary missing on VPS | subprocess spawn fails | `"scanner_unavailable"` | Both blocks absent; alert raised to backend health monitor |
| Valid probe with partial data | ffprobe returns ≥ 1 stream but some fields are absent | `"ok"` | Missing fields set to `null`; `bitrate_bucket` set to `"unknown"` |

When `probe_status` is not `"ok"`, the catalog item's `quality.resolution` field must not be updated from a previous successful scan. The stale scan data is retained until a successful probe replaces it. The `scan_utc` is updated to the timestamp of the failed attempt so consumers know the scan was tried.

Scanner runs on VPS as a scheduled job (interval configurable, default: every 15 minutes per active stream). Results stored in Redis with TTL of 30 minutes. Cold-scan triggered on first play if no cached result exists. Failed probes set the Redis TTL to 5 minutes so a retry occurs sooner than the normal interval.

---

## 6. Stream Stats Overlay

The in-player stats overlay is a semi-transparent panel (bottom-right, non-blocking) that displays live telemetry while a stream plays.

### 6.1 Stats Fields

| Field | Source | Refresh |
|---|---|---|
| Resolution | ffprobe `video.resolution` (static) / AVPlay `getStreamInfo()` for live ABR confirmation | On AVPlay `PLAYER_MSG_BITRATE_CHANGED` event or ABR switch |
| Codec | ffprobe `video.codec` | Static per session |
| Bitrate (current) | AVPlay `getStreamingProperty('CURRENT_BANDWIDTH')` — returns current bitrate in bps; divide by 1000 for kbps display | Every 5s |
| FPS | ffprobe `video.fps` | Static per session; no live AVPlay property exposes per-frame FPS |
| Buffer fill % | AVPlay `getStreamingProperty('BUFFER_STATUS')` | Every 5s |
| Latency | `stream_health.latency_ms` (VPS) | On scan refresh |
| Packet loss | `stream_health.packet_loss_pct` (VPS) | On scan refresh |
| HDR status | AVPlay `ON_HDR_DETECTED` event | On detection |
| Audio track | AVPlay `getStreamInfo()` `audioTracks` array | On track change |
| Provider score | `provider_rating.auto_score` (VPS) | On scan refresh |

### 6.2 Overlay Tier Differences

| Feature | Dave's TV (UN — baseline) | Sherri's TV (QN — enhanced) |
|---|---|---|
| Stats polling interval | 10s | 5s |
| Fields shown | Core 6 (res/codec/bitrate/buffer/HDR/score) | All 10 fields |
| Animation | None — static text | Subtle fade on value change |
| Font size | 24px | 22px (more data, same area) |

---

## 7. Multi-Stream Source Panel

When a channel or movie has multiple stream sources (different providers, qualities, or mirrors), the source panel is accessible:

- **Trigger:** Long-press OK on any stream card, or dedicated remote button (mapped in sharedKeys.js)
- **Layout:** Side panel slides in from right, 340px wide, overlaps content at 60% opacity backdrop
- **D-pad nav:** Up/Down selects sources; OK switches stream mid-play (seamless re-init of AVPlay)
- **Source card shows:** Quality badge · Provider name · Provider score badge · Bitrate estimate · Latency

### 7.1 Source Switching Rules

1. Switching source pauses current playback, initializes new AVPlay handle, resumes from same position (VOD) or live edge (live).
2. If new source fails within 10 seconds, auto-rollback to previous source with toast: "Switched back — [Source Name] failed to load."
3. The last-used source per stream_id is persisted per profile (Sherri and Dave each keep their own preferred source).
4. Agents may suggest a source switch but must display an action card — they cannot switch sources silently.

---

## 8. User-Toggleable Quality Display Settings

All settings live under **Settings > Playback > Quality Display**. Each is per-profile (Sherri and Dave independently).

| Setting | Default (Dave/baseline) | Default (Sherri/enhanced) | Description |
|---|---|---|---|
| Show quality badge | ON | ON | Resolution badge on stream card and in-player HUD |
| Show HDR badge | ON | ON | HDR sub-badge when detected |
| Show upscale warning | ON | ON | `⚠` flag on cards with upscale signals |
| Show stats overlay | OFF | OFF | In-player telemetry panel (toggle with remote shortcut) |
| Show provider score | ON | ON | Score badge on source cards and channel list |
| Show stream bitrate | OFF | ON | Live bitrate readout in HUD |
| Show multi-source panel | ON | ON | Whether source switcher is accessible |
| Auto-scan quality | ON | ON | VPS ffprobe scanner active for watched channels |
| Show scan age | OFF | ON | Shows how old the last ffprobe scan is on card hover |

### 8.1 Remote Shortcut for Stats Overlay

While a stream is playing: **INFO button** (or fallback **OK long-press 1.5s**) toggles the stats overlay on/off without opening the settings menu.

---

## 9. Quality Badge Display Rules

### 9.1 On Channel / VOD Cards

- Badge renders in bottom-right corner of card thumbnail
- Font: 11px bold, pill shape, 4px border-radius
- Colors use CSS variables (theme-aware): `--badge-4k`, `--badge-1440p`, `--badge-1080p`, `--badge-720p`, `--badge-480p`. The legacy `--badge-2k` and `--badge-other` variables are retired; themes must not define them.
- If scan data is stale (> 60 min): badge renders with 50% opacity
- If no scan data: badge not shown (not "Unknown" — just absent)

### 9.2 In Player HUD

- Badge appears top-right of viewport, always visible (not inside any overlay panel)
- Stays visible during playback
- On quality change (ABR switch): badge animates briefly (CSS transition, 300ms fade) — enhanced tier (QN / Sherri) only; Dave's TV badge updates without animation

**Profile-specific HUD behavior:**

| HUD element | Dave (`dave_tv` / UN baseline) | Sherri (`mom_tv` / QN enhanced) |
|---|---|---|
| Quality badge | Shown (per Setting `show_quality_badge`) | Shown (per Setting `show_quality_badge`) |
| Live bitrate readout | Hidden by default (`show_stream_bitrate = OFF`) | Visible by default (`show_stream_bitrate = ON`) |
| Scan age indicator | Hidden by default (`show_scan_age = OFF`) | Visible on card hover by default (`show_scan_age = ON`) |
| Badge change animation | None | 300ms CSS fade |
| HDR badge glow | None | CSS box-shadow glow (#FFD700, 8px blur) |

Sherri's TV (`QN85Q7FAAFXZA`) is the enhanced tier. It is **never** artificially capped or feature-limited by agents. Dave's TV (`UN55CU8000BXZA`) uses the baseline tier configuration. These defaults match the per-profile settings table in §8.

### 9.3 Enhanced vs Baseline Tier Rendering

| Aspect | Dave (baseline) | Sherri (enhanced) |
|---|---|---|
| Badge animation on change | None | 300ms CSS fade |
| Upscale warning tooltip | None | Hover/focus shows 3 triggered signals |
| HDR badge glow effect | None | CSS box-shadow glow (#FFD700 8px) |
| Provider score sparkline | None | 7-day trend mini-chart |

---

## 10. Provider / Server Rating UI

Accessible via **Settings > Servers & Providers**:

- Lists all providers registered in the backend (provider IDs: `"apollo"`, `"xtremehd"`). The TV fetches this list from the backend endpoint `GET /api/providers` — it never queries Dispatcharr, Threadfin, or any provider system directly.
- Each provider card shows: Display label · Current auto-score · 30-day uptime % · Avg latency (ms) · Active stream count
- Sort options: by score (default) · by display label (A-Z) · by 30-day uptime
- Per-provider toggle: `active` / `paused`. Paused providers are excluded from source panels and catalog views. The toggle is a mutation: the TV emits a validated JSON command per `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` and requires user confirmation (matches `requires_user_confirm: true` in the provider catalog settings table).
- Agents can read `provider_rating.auto_score` and surface a source-switch suggestion as an action card. Agents cannot toggle providers on or off, and cannot initiate a source switch, without a user confirmation action card.
- No credential, portal URL, M3U token, or raw stream URL is shown in this panel or returned in the API response backing it. The response conforms to the TV-safe provider summary schema defined in `07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`.

---

## 11. Quality Data Binding to UI Components

### 11.1 NuvioWeb Pattern Adoption

Based on NuvioWeb's `streamScreen.js` patterns:

- `detectQuality(stream)` → returns quality tier label from stream metadata
- `renderStreamCard(stream)` → card component, badge appended below headline
- `renderSourcesPanel(sources)` → side panel for multi-source selection

HermesTV adopts these as the basis for its own implementations:

```js
// js/ui/quality/qualityBadge.js

// Maps ffprobe video.height to the catalog resolution enum value.
// Returns null when height is absent (badge is suppressed, not shown as "unknown").
function getQualityTier(scanData) {
  if (!scanData?.video?.height) return null;
  const h = scanData.video.height;
  if (h > 1440) return '4K';
  if (h > 1080) return '1440p';
  if (h > 720)  return '1080p';
  if (h > 480)  return '720p';
  return '480p';
}

// CSS class slug: '4K' → '4k', '1440p' → '1440p', '1080p' → '1080p', etc.
function tierToSlug(tier) {
  return tier.toLowerCase();
}

function renderQualityBadge(scanData, container) {
  const tier = getQualityTier(scanData);
  if (!tier) return; // No badge when height is unknown
  const isPossibleUpscale = scanData?.video?.possible_upscale === true;
  const label = isPossibleUpscale ? `${tier} ⚠` : tier;
  const badge = document.createElement('span');
  badge.className = `quality-badge quality-badge--${tierToSlug(tier)}`;
  badge.textContent = label;
  container.appendChild(badge);
}
```

### 11.2 Stats Overlay Pattern (Adapted from Stremio `useStatistics`)

```js
// js/ui/player/statsOverlay.js
const POLL_INTERVAL = {
  baseline: 10000,  // Dave's TV
  enhanced: 5000    // Sherri's TV
};

function startStatsPolling(avplayHandle, tier, onUpdate) {
  return setInterval(() => {
    const bitrate = avplayHandle.getStreamingProperty('CURRENT_BANDWIDTH');
    const buffer  = avplayHandle.getStreamingProperty('BUFFER_STATUS');
    onUpdate({ bitrate, buffer });
  }, POLL_INTERVAL[tier]);
}
```

---

## 12. Proof Gates

Before any quality feature ships to either TV, the following must pass. Each gate requires concrete evidence (screenshot, log, test output, or schema validation result). Claims without evidence are not accepted.

| Gate | Requirement | Evidence form |
|---|---|---|
| QUALITY-GATE-01 | ffprobe scanner returns `probe_status: "ok"` and valid JSON matching §4 schema for ≥ 3 live test streams from each active provider (`apollo`, `xtremehd`) | Schema validation output (e.g., `ajv` or `jsonschema` run against saved JSON files) |
| QUALITY-GATE-02 | Quality badge renders on stream cards for all 5 concrete tiers (`4K`, `1440p`, `1080p`, `720p`, `480p`) and is absent (not showing `"unknown"`) when `video.height` is null | Screenshots of each tier badge on both TVs |
| QUALITY-GATE-03 | `possible_upscale` field is set to `true` and ≥ 2 entries appear in `upscale_signals_triggered` when test conditions meet the heuristic thresholds in §3 | Test harness output showing triggered signals per configured test case |
| QUALITY-GATE-04 | Stats overlay toggles on/off via INFO button press without interrupting active playback; bitrate and buffer values update on the correct interval (10s Dave / 5s Sherri) | Screen recording on each TV showing overlay toggle and live value refresh |
| QUALITY-GATE-05 | Source panel opens, selects alternate source, stream switches within 3s; on forced failure of new source within 10s, playback rolls back to previous source and shows rollback toast | Manual test log for each TV; toast text captured |
| QUALITY-GATE-06 | All 9 settings in §8 persist independently per profile: changing a setting under `dave_tv` does not alter `mom_tv` settings and vice versa | Settings export diff showing independent per-profile values |
| QUALITY-GATE-07 | HDR badge appears within 5 seconds of AVPlay `ON_HDR_DETECTED` event firing on an HDR10 test stream | Timestamped log of `ON_HDR_DETECTED` event vs. badge render time |
| QUALITY-GATE-08 | Provider auto-score renders with correct color (Green ≥ 90, Blue 75–89, Yellow 50–74, Red < 50) using the formula in §4.3 on at least 4 score boundary test cases | Screenshot of score badges at each color boundary |
| QUALITY-GATE-09 | Enhanced-tier animations (badge fade, HDR glow, sparkline, upscale tooltip) are present on `QN85Q7FAAFXZA` (Sherri) and absent on `UN55CU8000BXZA` (Dave) | Side-by-side screenshots of both TVs on the same stream |
| QUALITY-GATE-10 | Badge renders at 50% opacity when `scan_utc` is > 60 minutes in the past; badge is absent (not stale-styled) when no scan data exists | Screenshot with mocked stale timestamp, plus screenshot with no scan data |
| QUALITY-GATE-11 | Probe failure modes `"dead"`, `"timeout"`, and `"no_video"` each produce the correct `probe_status` value without crashing the scanner; existing catalog `quality.resolution` is not overwritten on a failed probe | Scanner integration test output showing each failure mode and Redis key state before/after |
| QUALITY-GATE-12 | `bitrate_bucket` field is present in every `probe_status: "ok"` scan result with a value from the enum `"low" \| "medium" \| "high" \| "ultra" \| "unknown"` | Schema validation output |
| QUALITY-GATE-13 | No stream URL, M3U token, portal URL, credential, or provider secret appears in any scan result JSON, Redis entry, log line, diagnostics export, or screenshot produced by the quality scanner | `grep -iE "(password\|m3u\|xtream\|portal\|token)" scanner-output-*.json` returns zero matches |
| QUALITY-GATE-14 | Sherri's TV (`mom_tv`) receives all enhanced-tier features and is never blocked, capped, or downgraded by any quality scanner agent behavior | Feature matrix checklist verified on QN TV; no capability flag suppressed relative to §6.2 and §9.3 |

---

## 13. Out of Scope

- Transcoding quality at the VPS (handled by Jellyfin/Tunarr — not this contract)
- DRM license acquisition (handled by AVPlay, not quality scanner)
- AI-recommended quality settings (handled by doc 06 agent schema)
- Per-codec encoding profile tuning (ops concern, not UI contract)

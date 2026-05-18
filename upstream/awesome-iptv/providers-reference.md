# Public/Free IPTV Providers Reference

Curated from https://github.com/iptv-org/awesome-iptv — free and public IPTV services for reference and pipeline testing only.

---

> **HARD RULE:** Real provider credentials for Apollo Group and XtremeHD are stored exclusively in `G:\private\` vault. Never commit credentials to this repository. Never expose provider auth tokens, usernames, passwords, or subscription stream URLs in API responses, logs, or any file tracked by git.

---

## About This List

These are free or publicly available IPTV services listed in awesome-iptv. They are suitable for:

- Testing the catalog ingestion pipeline (M3U parsing, XMLTV parsing, Dispatcharr import) with zero-risk streams
- Verifying stream playback in the Tizen app without consuming provider credentials
- Smoke-testing the Threadfin proxy configuration before connecting live providers
- Benchmarking stream health checker tooling

They are **not** suitable for:

- Production use in HermesTV (no SLA, content may disappear without notice)
- Replacing Apollo Group or XtremeHD in any environment (including development, if a provider subscription is available)
- Distribution to end users (Dave / Sherri) — these services may have unreliable streams and poor EPG coverage

---

## Free / Public Providers

### WatchIPTV
- Public web player with free channel streams
- Useful for: Confirming HLS stream playback in the Tizen app browser sandbox
- No M3U endpoint; stream URLs must be extracted manually

### FreeIPTV (github.com/Free-TV/IPTV)
- GitHub-hosted M3U playlist with public broadcast streams
- Direct M3U URL available — suitable for plugging into Threadfin as a test source
- Coverage: International public broadcasters (BBC News, Al Jazeera, DW, France 24, etc.)
- Update cadence: Community maintained; streams checked periodically

### iptv-org/iptv (github.com/iptv-org/iptv)
- The canonical public IPTV playlist repository from the awesome-iptv organization
- Massive catalog of public broadcast streams organized by country and category
- Available as per-country M3U files or a single global M3U
- Suitable for: Bulk pipeline testing; seeding Dispatcharr with a large channel set to verify import performance
- Do not use as a production source — streams are not curated for reliability

### TDTChannels (Spain)
- Spanish free-to-air TV streams (TDT = Televisión Digital Terrestre)
- M3U + XMLTV available at tdtchannels.com
- Useful for: Testing EPG matching with non-English channel names

### OnlineStream.live
- Public web player for free streams; aggregates several public broadcast sources
- No direct M3U; for manual playback testing only

---

## Using Free Sources in the Dev Pipeline

To connect a free M3U to Threadfin for testing:

1. Add the free M3U URL as a new playlist source in Threadfin admin UI (not via vault — it's a public URL)
2. Verify Threadfin ingests and proxies the channels
3. Import the resulting Threadfin channel list into Dispatcharr as a test group (tag as `test-only` in Dispatcharr channel metadata)
4. Confirm the HermesTV API returns the test channels with correct EPG data
5. Remove the test playlist source from Threadfin before any production provider is connected

Tag all test channels with `test-only` in Dispatcharr so they can be bulk-deleted before production deployment. Never ship a build to Dave or Sherri's TV with test-only channels active.

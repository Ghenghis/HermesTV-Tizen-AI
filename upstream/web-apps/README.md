# Upstream: Web-Based IPTV & Media Apps

Browser-based media apps that complement the Docker services already running in
`docker/workstation/compose.yml`. These run without native installation — Dave accesses them
directly in Chrome/Edge on the workstation; Sherri can reach them via the Samsung Internet
browser on her QN85 QLED TV over the LAN.

The HermesTV Tizen app is Sherri's primary interface. Web apps here are supplemental tooling for
Dave's workflow and occasional browser access from the QN85.

---

## Dave's primary web tools

Short-list for daily IPTV workflow. Access via Chrome or Edge on the workstation — no
installation required unless noted.

| # | App | URL / GitHub | Purpose | Access |
|---|-----|-------------|---------|--------|
| 1 | **Jellyfin Web** | `http://hermestv.local:8096/web` | Full media library UI for the Jellyfin service already running in compose. Streams 4K via RTX 3090 Ti NVENC/NVDEC. No install — already live. | Dave: direct URL. Sherri: same URL in QN85 Samsung Internet. |
| 2 | **IPTVnator (web)** | https://github.com/4gray/iptvnator | Open-source browser-based IPTV player. Accepts M3U URLs and Xtream Codes. Run the Docker image locally or use the hosted PWA. Load credentials at runtime — never paste M3U tokens into config files. | Dave: Chrome. Sherri: Samsung Internet (HTML5 HLS player — compatible). |
| 3 | **m3u4u** | https://m3u4u.com | Cloud-based M3U playlist manager and editor. Import a source playlist, filter/rename/reorder channels, export a clean M3U for Tunarr or Jellyfin. Free tier supports personal use. | Dave: Chrome only (complex JS — not tested on QN85). |
| 4 | **sparkison/m3u-editor** | https://github.com/sparkison/m3u-editor | Self-hosted Docker M3U editor. More powerful than m3u4u for bulk operations. Add to compose as needed. | Dave: workstation after optional compose add. |
| 5 | **IPTV Checker (web)** | https://github.com/iptv-org/iptv-checker | Validates M3U streams — reports dead channels. Run CLI against vault exports or use the optional web UI. Never expose provider M3U URLs beyond the local network. | Dave: workstation CLI or local web UI. |
| 6 | **Streamtest.in** | https://streamtest.in | Quick online HLS/DASH/RTMP stream tester. Paste a stream URL to verify it plays before adding to Tunarr or Jellyfin. No account needed. | Dave: Chrome. Not for production use — public-facing tester. |
| 7 | **Open WebUI** | `http://hermestv.local:3000` | Hermes AI chat interface. Already running in compose (:3000 → :8080). Backed by Ollama on the RTX 3090 Ti. | Dave: Chrome. Sherri: Samsung Internet on QN85 (basic chat works). |

---

## Full app reference table

All 28+ apps from the community list, plus stack members. Columns:

- **Self-hosted** — can run on the workstation (Docker or static)
- **QN85 Samsung Internet** — tested/expected to work in the QN85 TV browser
- **Fork for Ghenghis** — whether the Ghenghis GitHub account should maintain a fork
- **Notes** — key facts and HermesTV relevance

| App | URL / GitHub | Self-hosted? | QN85 Samsung Internet? | Fork for Ghenghis? | Notes |
|-----|-------------|:------------:|:----------------------:|:------------------:|-------|
| **Jellyfin Web** | https://github.com/jellyfin/jellyfin-web | Yes (running :8096) | Yes | Yes | Primary web UI for the compose Jellyfin service. Fork to track and apply QN85/Tizen patches. |
| **IPTVnator (web)** | https://github.com/4gray/iptvnator | Yes (Docker) | Yes | Yes | Solid open-source IPTV player. Pure HTML5 HLS path works on QN85. Fork to track upstream and apply theming. |
| **Open WebUI** | https://github.com/open-webui/open-webui | Yes (running :3000) | Partial | No | AI chat frontend. Already tracked via compose. Basic chat works on QN85; complex features may not. |
| **Dim** | https://github.com/Dusk-Labs/dim | Yes (Docker) | Unknown | No | Lightweight Jellyfin-alternative frontend. Reference only — Jellyfin Web covers the use case. |
| **Stremio Web** | https://www.stremio.com/apps | No (proprietary SaaS) | No | No | Proprietary web client. Prefer the Windows installer. See `upstream/windows-apps/README.md`. |
| **iptv-checker** | https://github.com/iptv-org/iptv-checker | Yes (CLI / Node) | N/A (CLI tool) | Yes | M3U stream validator. Fork to track upstream fixes and pin a working version. |
| **sparkison/m3u-editor** | https://github.com/sparkison/m3u-editor | Yes (Docker) | No | Yes | Self-hosted M3U editor with a full web UI. Better than m3u4u for bulk operations. Fork for compose integration. |
| **m3u4u** | https://m3u4u.com | No (cloud SaaS) | No | No | Cloud M3U editor. Useful but requires account; complex JS fails on QN85 Samsung Internet. |
| **VidGrid** | https://vidgrid.tk | No (SaaS) | Unknown | No | Multi-grid stream viewer. No self-host option found. Low priority. |
| **IPTV Smarters Player (web)** | https://www.iptvsmarters.com | No (SaaS) | Partial | No | Xtream-based player. Web version is limited compared to the app. TV browser support inconsistent. |
| **Purple WebPlayer** | https://purplebeard.eu/webplayer | No (SaaS) | Partial | No | Simple HTML5 M3U player. Light enough that QN85 may handle it; no self-host. |
| **Pleyr** | https://pleyr.net | No (SaaS) | Unknown | No | Online HLS player. Minimal info available. Low priority. |
| **Free IPTV Player** | https://freei.me | No (SaaS) | Unknown | No | Basic free player. No self-host. Low priority. |
| **Ellipto IPTV** | https://ellipto.com | No (SaaS) | Unknown | No | Limited public info. Skip until more is known. |
| **MediathekViewWeb** | https://github.com/mediathekview/mediathekviewweb | Yes (Docker) | Partial | No | German public broadcaster archive viewer. Niche use; self-hostable but not relevant to IPTV provider streams. |
| **IPTV RestreamHub** | https://iptvrestreamhub.com | No (SaaS) | Unknown | No | Restreaming service. Proprietary. Not relevant to local stack. |
| **IPTVPlayer.stream** | https://iptvplayer.stream | No (SaaS) | Unknown | No | Generic SaaS player. No self-host. Low priority. |
| **PublicIPTV** | https://publiciptv.com | No (SaaS) | Unknown | No | Public free streams only. Not for provider-based workflows. |
| **SupercamBR** | https://supercam.com.br | No (SaaS) | Unknown | No | Brazilian-focused. Not relevant. |
| **Wizju IPTV Player** | https://wizju.com | No (SaaS) | Unknown | No | Limited public info. Low priority. |
| **CieloWeb M3U Magic** | https://cieloweb.com | No (SaaS) | Unknown | No | M3U playlist tools. Superseded by m3u4u and m3u-editor for this stack. |
| **hlstv.app** | https://hlstv.app | No (SaaS) | Partial | No | HLS stream tester/viewer. Simpler than Streamtest.in but may work on QN85. |
| **M3U IPTV** | https://m3u-iptv.com | No (SaaS) | Unknown | No | Playlist tools SaaS. Low priority given m3u4u and m3u-editor coverage. |
| **Moviepex** | https://moviepex.tv | No (SaaS) | Unknown | No | Streaming aggregator. Proprietary. Not relevant. |
| **Web IPTV Player** | https://web.iptvplay.cz | No (SaaS) | Partial | No | Basic HTML5 player. Lightweight enough to possibly work on QN85. |
| **Streamtest.in** | https://streamtest.in | No (SaaS) | No | No | Best quick HLS/DASH tester for Dave. Complex JS — skip on QN85. |
| **m3u.in** | https://m3u.in | No (SaaS) | Unknown | No | Free M3U links directory. Useful only for testing public streams, not provider workflows. |
| **RockMyM3u** | https://rockmym3u.com | No (SaaS) | Unknown | No | Playlist management SaaS. Low priority. |
| **IPTV Link Search** | https://www.iptvsearch.online | No (SaaS) | Unknown | No | Public stream search. Not relevant to private provider workflows. |
| **StreamVault** | https://streamvault.tv | No (SaaS) | Unknown | No | Limited public info. Low priority. |
| **IPTVCloud.app** | https://iptvcloud.app | No (SaaS) | Unknown | No | Cloud IPTV manager. Proprietary. Not relevant to self-hosted stack. |

---

## QN85 browser-compatible picks

The QN85 Samsung Internet browser runs on Tizen and supports HTML5 video, HLS via `<video>`,
and basic JavaScript. Apps with heavy React/Vue SPAs, complex WebSockets, or non-standard codec
requirements tend to fail or perform poorly.

**Works reliably:**

| App | Why it works |
|-----|-------------|
| **Jellyfin Web** | Jellyfin's web client has explicit Tizen/Samsung TV support. The compose instance at `hermestv.local:8096/web` is the recommended path for Sherri's QN85 browser access. |
| **IPTVnator (web)** | Uses native `<video>` with HLS.js fallback. Lightweight enough for QN85 when running locally. |
| **Open WebUI** (basic chat) | Chat interface works; advanced features (file upload, plugins) may not. |
| **Purple WebPlayer** | Simple HTML5 player — minimal JS. Likely works if the QN85 can reach the SaaS URL. |
| **hlstv.app** | Lightweight HLS viewer. Worth testing on QN85 for quick stream checks. |
| **Web IPTV Player** (web.iptvplay.cz) | Basic HTML5. Low enough complexity to be compatible. |

**Does not work on QN85:**

| App | Reason |
|-----|--------|
| **m3u4u** | Heavy single-page app; complex drag-and-drop. Fails on Tizen browser. |
| **Streamtest.in** | Complex JS UI — not designed for TV browsers. |
| **Stremio Web** | Requires desktop browser APIs. Not TV-browser compatible. |
| **sparkison/m3u-editor** | Admin tool; not intended for TV use. |

---

## Architecture diagram

```
Windows Workstation (RTX 3090 Ti)
  ├── docker/workstation/compose.yml (project: hermestv-workstation)
  │     ├── jellyfin          → http://hermestv.local:8096      (media server + NVENC transcoding)
  │     ├── tunarr            → http://hermestv.local:8000      (virtual channel builder)
  │     ├── dispatcharr       → http://hermestv.local:9191      (stream manager)
  │     ├── open-webui        → http://hermestv.local:3000      (Hermes AI chat)
  │     └── ollama            → http://hermestv.local:11434     (local LLM, GPU-backed)
  │
  ├── HermesTV app (Vite dev server)
  │     ├── dev               → http://hermestv.local:5173
  │     └── preview           → http://hermestv.local:4173
  │
  ├── Dave (Chrome/Edge on workstation)
  │     ├── Direct access to all hermestv.local:* URLs above
  │     ├── m3u4u.com and streamtest.in via public internet
  │     └── IPTVnator, m3u-editor (local Docker when running)
  │
  └── Sherri's QN85 QLED TV (Samsung Internet browser, LAN)
        ├── http://hermestv.local:8096/web   (Jellyfin — primary)
        ├── http://hermestv.local:3000       (Open WebUI — basic chat)
        └── http://hermestv.local:5173 or :4173  (HermesTV app — primary)

Credentials: G:\private\ vault — loaded at runtime via admin UIs only.
             Never in config files, never in git, never in forked repos.
```

---

## Credential handling

Hard rules — no exceptions:

1. **M3U URLs, Xtream codes, provider tokens, and Apollo Group credentials go only in the
   `G:\private\` vault.** They are never written to any config file, compose override, or
   repository.

2. **Load credentials at runtime via the app's admin UI.** Jellyfin: Admin Dashboard → Live TV.
   IPTVnator: Settings panel at app startup. Dispatcharr/Tunarr: web admin pages.

3. **iptv-checker and m3u-editor** receive M3U input from vault-exported local files only.
   Never pipe raw provider URLs through public-facing tools.

4. **Forked repos on GitHub are public by default.** No secrets of any kind belong in any
   forked repo — even in branches, commit messages, or CI environment variables.

---

## Fork table

Which repos the Ghenghis GitHub account should fork and why. See `FORK_SETUP.md` for the
exact `gh` commands to run.

| Repo | Upstream | Priority | Reason to fork |
|------|----------|:--------:|----------------|
| **jellyfin-web** | https://github.com/jellyfin/jellyfin-web | High | Track upstream releases; apply QN85/Tizen CSS patches and HermesTV theme overrides without touching the upstream Docker image. |
| **iptvnator** | https://github.com/4gray/iptvnator | High | Track upstream; apply HermesTV-specific defaults (theme, default M3U source field). Useful if running the Docker image from a custom build. |
| **iptv-checker** | https://github.com/iptv-org/iptv-checker | Medium | Pin a working version; track upstream fixes for dead-stream detection accuracy. |
| **m3u-editor** | https://github.com/sparkison/m3u-editor | Medium | Potentially add HermesTV-specific export presets and Tunarr integration. |
| **dim** | https://github.com/Dusk-Labs/dim | Low | Reference only — fork if Dim becomes a viable Jellyfin-alternative UI for the stack. No immediate action required. |

**Do not fork:** SaaS-only apps (m3u4u, Stremio Web, Streamtest.in, Purple WebPlayer,
VidGrid, etc.) — there is no source to fork.

---

## HermesTV Extensions panel (future)

The HermesTV Tizen app will eventually surface an **Extensions** panel where Sherri (and Dave
via the web app) can discover, launch, and configure web apps from this list without leaving
the HermesTV UI. The panel will:

- Show each web app as a card with name, icon, and status (running / not running).
- For self-hosted apps (Jellyfin, Open WebUI, IPTVnator), detect whether the service is
  reachable on the LAN before showing a launch button.
- For SaaS tools, open the external URL in a new browser tab (or Samsung Internet on the QN85).
- Never store or transmit credentials — it will link to the app's own admin UI.

For now, access all web apps directly via browser using the URLs in this document.

---

## See also

- `FORK_SETUP.md` — `gh` CLI commands to fork the repos in the fork table above.
- `../windows-apps/README.md` — Windows-native installers (Stremio, Jellyfin Server, etc.).
- `../windows-apps/JELLYFIN_DOCKER_SETUP.md` — GPU passthrough and NVENC compose configuration.
- `../awesome-iptv/` — curated IPTV resource lists from the community.
- `../../docker/workstation/compose.yml` — the live workstation service definitions.

# Upstream: Web-Based IPTV & Media Apps

Browser-based media apps that run in Chrome or Edge on the Windows workstation without installation. These complement the Docker services already running in `docker/workstation/compose.yml` and provide frontends accessible from any device on the LAN — including Sherri's QN85 QLED TV browser.

---

## App Reference Table

| App | GitHub | Purpose for HermesTV | Fork Needed? |
|---|---|---|---|
| **Jellyfin Web** | https://github.com/jellyfin/jellyfin-web | Primary web client for the Jellyfin service in `compose.yml`. Streams from workstation to TV browser via LAN. Supports hardware-transcoded 4K via RTX 3090 Ti. | Yes — fork to Ghenghis for customization tracking |
| **Dim** | https://github.com/Dusk-Labs/dim | Open-source web media server frontend compatible with Jellyfin-style backends. Useful as a lightweight alternative UI if Jellyfin Web is too heavy for quick testing. | No — reference only |
| **Open WebUI** | https://github.com/open-webui/open-webui | Already running as the Hermes AI chat interface in `compose.yml` (port 3000). Not an IPTV app but core to the HermesTV assistant experience. Included here for completeness since it is a browser-accessed web app sharing the same compose stack. | No — already tracked via compose |
| **Stremio Web** | https://www.stremio.com/apps | Web version of Stremio streaming aggregator. The web client is proprietary (not a public GitHub repo). Desktop installer is the preferred path — see `upstream/windows-apps/README.md`. | No — proprietary |
| **iptv-checker** | https://github.com/iptv-org/iptv-checker | CLI + optional web interface for validating M3U playlists. Used on the workstation to pre-screen streams before loading them into Jellyfin or Tunarr. Run against local vault M3U exports only — never expose provider URLs publicly. | Yes — fork to Ghenghis to track upstream fixes |

---

## How these fit the HermesTV stack

```
Windows Workstation (RTX 3090 Ti)
  └── Docker (hermestv-workstation compose)
        ├── jellyfin          → Jellyfin Web frontend (port 8096)
        ├── tunarr            → virtual channel builder
        ├── dispatcharr       → stream manager
        └── open-webui        → Hermes AI chat (port 3000)

LAN access:
  ├── Sherri's QN85 QLED TV (browser or HermesTV Tizen app)
  └── Dave's workstation browser (Chrome/Edge)
```

Jellyfin Web is the highest-priority web app here. When Jellyfin is running on the workstation, `http://hermestv.local:8096/web` is immediately accessible from both Sherri's TV browser and any device on the LAN. No installation required on the TV side.

---

## Credential handling

- Provider credentials (Xtream, Apollo Group, M3U tokens) go ONLY in the Jellyfin admin UI at runtime.
- No credentials are stored in these reference files or in any forked repo.
- Local M3U exports for iptv-checker validation come from `G:\private\` vault only.

---

## See also

- `FORK_SETUP.md` — gh CLI commands to fork the repos marked above to the Ghenghis account.
- `../windows-apps/README.md` — Windows-native installers and Jellyfin server setup.
- `../windows-apps/JELLYFIN_DOCKER_SETUP.md` — GPU passthrough and compose configuration for Jellyfin.

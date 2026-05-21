# IPTV Web 25 View Pack Manifest

Source root: `G:\Github\IPTV-web`
DaveTV repo root: `G:\Github\HermesTV-Tizen-AI`
Contract: `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`
Generated: 2026-05-21

This manifest names every local IPTV web app as a possible DaveTV View/source
pack. It is intentionally conservative about license rights. Dave accepts
obligations, but agents still must follow the license actually present in each
folder.

## Adoption Legend

- Native View: rebuild/adapt into a DaveTV shell.
- Source Pack: copy/adapt source with license attribution and proof.
- Sandbox App: run the upstream app mostly unmodified and isolated.
- Pattern Only: study/rebuild the idea, no source copy.

## 25-App View Inventory

| # | Source project | DaveTV View name | License status from local source | Default mode | Highest-value adoption |
| --- | --- | --- | --- | --- | --- |
| 1 | `AuthoIPTV` | Autho View | Freeware; license forbids modification/redistribution | Pattern Only / Sandbox App | Account/login flow ideas, onboarding spacing, no source copy |
| 2 | `cinexa` | Cinexa View | MIT license file; package license unset | Native View / Source Pack | Virtualized catalog, cinematic browsing, HLS player patterns |
| 3 | `clubtivi-windows` | ClubTivi View | No license found | Pattern Only | Windows-style dense channel list and remote-friendly controls |
| 4 | `Extreme-InfiniTV` | Extreme InfiniTV View | GPL-3.0-or-later in package/license | Native View / Source Pack with GPL obligations | Dense power-user layout, M3U/EPG/player diagnostics, stream health |
| 5 | `free-tv-iptv` | Free TV View | MIT/package plus public-domain style license text | Source Pack / Pattern Only | Public playlist tooling, validation/generation patterns |
| 6 | `HarmonyIPTV` | Harmony View | Apache-2.0 license file | Native View / Source Pack | Clean guided IPTV setup and simple household UX |
| 7 | `IPTauriV` | IPTauriV View | GPL-3.0 license file; package license unset | Native View / Source Pack with GPL obligations | Tauri/media-player patterns, EPG/parser dependencies |
| 8 | `iptv` | IPTV-org View | MIT/package plus public-domain style license text | Source Pack / Pattern Only | Public channel dataset, playlist lint/generation, legal free TV source |
| 9 | `IPTV-Restream` | Restream View | MIT license file | Native View / Source Pack | Restream/admin patterns, provider-to-output mental model |
| 10 | `iptv-stream` | IPTV Stream View | MIT license file | Native View / Source Pack | Lightweight React/GSAP stream browsing and motion ideas |
| 11 | `iptvnator` | IPTVnator View | MIT package/license | Native View / Source Pack | Unified import, EPG grid, settings UX, Xtream fixture patterns |
| 12 | `MaxVideoPlayer` | Max Player View | PolyForm Noncommercial | Native View / Source Pack for private noncommercial use | Premium playback controls, desktop/player polish |
| 13 | `neptune-tv` | Neptune View | GPL-3.0 license file | Native View / Source Pack with GPL obligations | Modern TV UI, virtual lists, i18n/profile patterns |
| 14 | `NuvioWeb` | Nuvio View | No project license found | Pattern Only / Sandbox App | Shared web app plus Tizen/webOS wrapper, sync/build model |
| 15 | `open-tv` | Open TV View | GPL-2.0 license file | Native View / Source Pack with GPL obligations | Angular TV shell patterns, channel/player layout ideas |
| 16 | `orbiscast` | Orbiscast View | GPL-3.0 license file | Pattern Only / Source Pack with GPL obligations | Discord/casting workflow ideas, watch-party surface |
| 17 | `PiTV` | PiTV View | No license found | Pattern Only | Minimal lean TV browsing and simple channel cards |
| 18 | `react-iptv` | React IPTV View | No license found | Pattern Only | React spatial navigation, router/grid ideas, no source copy |
| 19 | `Smart-IPTV-Web` | Smart IPTV View | Boost Software License 1.0 | Native View / Source Pack | Smart provider management, drag/reorder concepts, Gemini/admin ideas only if configured |
| 20 | `stalker-ui` | Stalker UI View | MIT license file | Native View / Source Pack | Stalker portal UI patterns, Vidstack/HLS controls, portal setup |
| 21 | `stremio` | Stremio View | No license found in local folder | Pattern Only / Sandbox App | Addon-style metadata, rich details, source ranking concepts |
| 22 | `TVapp` | TVapp View | No license found | Pattern Only | Simple TV app layout and launcher ideas |
| 23 | `wizju-iptv-player` | Wizju View | MIT license file | Native View / Source Pack | Vue/player controls, extension/web split, indexed DB ideas |
| 24 | `xstream-player` | Xstream View | No license found | Pattern Only unless permission found | Next.js/framer player polish, motion and source browsing ideas |
| 25 | `ynotv` | YnoTV View | AGPL-3.0 license file | Pattern Only by default; Source Pack only with AGPL network-source compliance | Failover groups, stream resolver, EPG streaming, lean TV layout |

## Existing DaveTV Views Already Present

DaveTV already has these shell/layout entries:

- `apple-tv`
- `dave-power`
- `extreme-infinitv`
- `iptvnator`
- `live-tv`
- `mom-mode`
- `netflix`
- `nuvio`
- `plex`
- `samsung-tizen`
- `stremio`
- `tivimate`
- `ynotv`
- `zero`

The 25-app pack should extend this registry without breaking existing Views.

## Smooth Swapping Requirement

To feel seamless, every Native View must accept the same DaveTV shell props:

- `catalog`
- `providers`
- `providerFilter`
- `contentFilter`
- `qualityFilter`
- `focusedItem`
- `onItemFocus`
- `onItemSelect`
- `onOpenSettings`

Native Views must not own provider credentials, fetch raw provider URLs, or
show upstream app storage as if it were DaveTV truth.

## Proof Checklist For Each View

Each View needs a proof row before it can be called complete:

| Proof | Required result |
| --- | --- |
| Build | `npm run build --prefix apps/hermes-web-tv` passes |
| Screenshot | Playwright screenshot saved under `docs/proof/web-e2e/` or `docs/proof/ui-views/` |
| Remote | D-pad moves focus, scrolls rows/pages, and does not trap the user |
| Playback | Selecting a movie/show/live channel calls DaveTV instant playback |
| Provider filter | One, two, or all selected providers filter correctly |
| Secret check | No raw provider URLs/credentials in UI, logs, local storage, or proof |
| Attribution | License/credit recorded for copied/adapted source |

## First Native View Candidates

Start with these because they are likely to give the biggest DaveTV jump:

1. `cinexa` - cinematic virtualized browsing.
2. `Smart-IPTV-Web` - provider/admin and playlist organization.
3. `stalker-ui` - Stalker/portal UX and modern HLS controls.
4. `wizju-iptv-player` - polished player/web-extension split.
5. `xstream-player` - motion/player feel, reimplemented pattern-only until license clears.
6. `neptune-tv` - modern TV navigation and virtual rows.
7. `IPTauriV` - parser/EPG/Tauri lessons with GPL compliance.
8. `HarmonyIPTV` - simple family-safe setup.
9. `open-tv` - GPL shell ideas for TV browsing.
10. `MaxVideoPlayer` - premium playback controls for private noncommercial use.

## Agent Assignment Prompt

Use this prompt when assigning an agent one upstream app:

```text
Input: Adopt one IPTV-web project into DaveTV's upstream View pack.
Source app: <project name from G:\Github\IPTV-web>
Read first: docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md and upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md.
Goal: identify the app's best UI/features, choose the correct adoption mode,
and implement or specify the smallest DaveTV-safe View improvement.
Hard rules: no provider secrets, no raw stream URLs, no fake data, no static
provider arrays, instant playback by default, remote-first navigation, license
attribution required for any copied/adapted source.
Return: adoption mode, files changed, features adopted, proof run, screenshots,
license risk, secrets exposed YES/NO, and next step.
```

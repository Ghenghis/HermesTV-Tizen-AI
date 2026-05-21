# 53 - Upstream View Pack Contract

Status: BINDING
Owner: DaveTV UI / reference-app adoption lane
Date: 2026-05-21

Dave accepts upstream license obligations for private DaveTV work. This contract
turns that into a safe engineering process for using the 25 local IPTV web apps
in `G:\Github\IPTV-web` as DaveTV Views, source packs, or launchable tools.

This contract extends:

- `AGENTS.md`
- `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`
- `docs/50_NATURAL_VOICE_AGENT_CONTRACT.md`

## Product Goal

DaveTV should feel like a premium Samsung QLED media system with instantly
swappable Views. The View picker should let Dave choose layout personalities
based on the local IPTV apps, while the underlying DaveTV provider registry,
auth, playback proxy, voice agent, memory, and proof system remain canonical.

The View can change. The truth layer cannot.

## Integration Modes

Every upstream app must be assigned one mode before implementation.

| Mode | Meaning | Use when | Proof required |
| --- | --- | --- | --- |
| Native View | DaveTV React shell rebuilt or adapted from upstream source/patterns | Best TV remote performance, provider filters, instant playback | Playwright screenshot, D-pad traversal, catalog item plays through DaveTV ticket endpoint |
| Source Pack | Upstream source files are intentionally copied/adapted into DaveTV | License permits modification/copying, or Dave accepts copyleft obligations | Manifest entry, copied license text, file headers, tests, build proof, no secrets |
| Sandbox App | Upstream app runs unmodified or mostly unmodified in an iframe/route/sidecar | App is useful but hard to merge, or license forbids modification | Launch proof, source path/version, no provider credentials passed unless vault-mediated |
| Pattern Only | DaveTV reimplements the idea without copying source | No license, restrictive/freeware, unclear provenance, or UX idea is enough | Design note, before/after screenshot, no source copy |

Agents must not mix these modes silently. A View can start as Pattern Only and
later graduate to Native View or Source Pack after the manifest is updated.

## Non-Negotiables

- No source file from `G:\Github\IPTV-web` may enter DaveTV without a matching
  manifest row and license note.
- No raw provider URL, username, password, token, cookie, M3U URL, Xtream host,
  or stream URL may be copied into an upstream app, a proof screenshot, a doc,
  or browser local storage.
- DaveTV provider data flows only through the DaveTV provider registry, setup
  routes, pairing routes, vault, and playback ticket routes.
- Upstream Views must call DaveTV catalog/search/play APIs, not upstream raw
  URLs, unless the View is explicitly a sandboxed local tool and isolated from
  DaveTV provider credentials.
- Instant playback remains the default. Upstream popups, "choose action"
  dialogs, and tiny click-heavy detail windows must not be copied into DaveTV's
  watch path.
- Remote navigation must be proven with focus movement and page scroll. A View
  that looks good with a mouse but traps D-pad focus is not complete.
- QLED polish must enhance content inspection: richer depth, sharper focus,
  better contrast, cleaner motion, and visible thumbnails/backdrops. Decorative
  effects that slow the TV are rejected.

## License Handling

Dave's acceptance lets agents work with GPL, AGPL, PolyForm Noncommercial, and
other obligations when those licenses grant the needed rights. It does not
grant rights where a license forbids modification/redistribution or where no
license exists.

Required handling:

- MIT/BSD/Apache/Boost/permissive: source adaptation is allowed with notices.
- GPL: source adaptation is allowed only if the adopted code and derivatives
  preserve GPL obligations and source availability. Prefer isolated Source Pack
  or Native View rewrites when practical.
- AGPL: source adaptation is allowed only if hosted/network users can receive
  the corresponding source. This is a high-friction mode; prefer Pattern Only
  or Sandbox App unless the feature is worth the obligation.
- PolyForm Noncommercial: private/noncommercial use may fit, but any commercial
  use is blocked. Mark as Noncommercial in attribution.
- Freeware/no-modification: do not modify or paste source. Run unmodified or
  rebuild the idea.
- No license: no source copy. Pattern Only unless Dave obtains permission.

This is an engineering compliance guardrail, not legal advice.

## View Pack Architecture

DaveTV must not become 25 separate apps fighting each other. The architecture is:

1. `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md` records the source app,
   license, mode, View name, useful features, and proof status.
2. `apps/hermes-web-tv/src/layouts/manifests/*.json` exposes user-facing View
   names, descriptions, and preview metadata.
3. `apps/hermes-web-tv/src/shells/*Shell.jsx` contains Native Views that consume
   DaveTV props: `catalog`, `providers`, `providerFilter`, `contentFilter`,
   `onItemSelect`, `onItemFocus`, and `onOpenSettings`.
4. Sandbox Apps, if used, launch through a controlled route or panel that does
   not receive secrets and cannot bypass DaveTV auth/provider rules.
5. Playwright captures screenshots for every View and stores proof under
   `docs/proof/web-e2e/` or `docs/proof/ui-views/`.

## QLED Visual Direction

The DaveTV house style should be called QLED View polish:

- black-level depth with restrained sapphire/cyan/amber highlights
- focus rings that look precise on a TV, not mouse-first web outlines
- backdrop crossfades on focus, not modal-heavy click flows
- cinematic thumbnails and full-bleed hero surfaces where useful
- crisp provider badges and source-health chips
- strong text contrast for Dave, Sherri, Warren, Suzy, Jeff, Missy, Tyler,
  Nick, and Savanna
- animation under the TV budget: transform and opacity first, shadows/glass
  only where measured smooth

## Safe Agent Provider Setup

DaveTV needs an agent-assisted provider setup mode that lets Dave paste or
upload private provider data without exposing it.

Required shape:

1. User chooses "Secure Provider Setup" from chat, Settings, or phone QR.
2. DaveTV opens a one-time vault session with short expiry and scoped CSRF.
3. User pastes text, uploads a file, or scans QR from a Samsung phone/tablet.
4. The client masks obvious secrets immediately before echoing anything.
5. The server parses provider type and stores credentials only in the provider
   store/vault.
6. The agent receives only redacted metadata: provider id, host label, type,
   reachable/unreachable, content counts, and validation errors.
7. DaveTV runs provider truth proof: registry -> catalog -> search -> play
   ticket -> stream HEAD/GET.
8. The UI reports success only after durable save and proof. If save/proof
   fails, it says exactly what failed and confirms nothing was saved.

The chat may help, but it must not become a place where raw secrets are printed
back to Dave or committed in logs.

## Samsung Device Strategy

The reliable device flow is TV plus companion phone/tablet:

- TV remote: navigation, select/back, voice button where the platform exposes a
  real speech path.
- Samsung phone/tablet: secure QR pairing, microphone capture, file upload,
  provider paste, camera scan, and admin repair flows.
- USB keyboard/gamepad: optional input path if the browser/Tizen key events are
  proven.
- Bluetooth/USB headsets, webcams, and microphones: supported only when the
  Samsung/Tizen browser or packaged app exposes a real capture API. Agents must
  not claim device support without browser/device proof.

Phone companion support is the primary path for "DaveTV can accept files,
provider data, and voice" because it is more reliable and safer than assuming
all USB/Bluetooth devices are exposed to a TV web app.

## Natural Agent View Behavior

The agent should be able to create temporary custom Views from a user request:

- "Show Batman 1989 and related movies"
- "Search Apollo and XtremeHD but skip IPTV-org"
- "Make Warren a sports view for his teams"
- "Find a better quality version"
- "Save these as a playlist"

The agent-generated View must still use real DaveTV catalog/search/play data.
It may research metadata, but playback options must map back to connected
providers before being offered.

## Agent Task Contract

Every agent assigned to this lane must report:

```text
Upstream apps inspected:
Adoption mode used:
License/attribution updated:
DaveTV files changed:
Features adopted:
Features intentionally not copied:
Proof run:
Screenshots:
Secrets exposed: YES/NO
Remaining blockers:
```

Reports that omit license mode, proof, or secret status are rejected.

## First Implementation Order

1. Complete the 25-app View manifest.
2. Add missing DaveTV layout manifests for the 25 app names, even if some start
   as Pattern Only.
3. Build Native Views for the highest-value apps first: Cinexa, Smart IPTV,
   Stalker UI, Wizju, Xstream, Neptune, IPTauriV, Harmony, Open TV, and
   MaxVideoPlayer.
4. Add a View preview gallery with Playwright screenshots for all active Views.
5. Implement Secure Provider Setup as a vault-backed QR/phone/chat flow.
6. Implement agent-created custom result Views.
7. Add Samsung companion device proof.

Provider truth and instant playback remain P0; View polish must not hide broken
provider behavior.

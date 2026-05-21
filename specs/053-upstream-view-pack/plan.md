# Technical Plan: Upstream IPTV Web View Pack

Status: Approved

## Architecture

The View pack uses DaveTV as the host shell and truth layer.

1. Upstream manifest records source, license, mode, and target features.
2. Native Views become normal DaveTV shells under
   `apps/hermes-web-tv/src/shells/`.
3. View picker reads DaveTV layout manifests and preview screenshots.
4. Sandbox Apps, if enabled, run in isolated launcher surfaces without provider
   credentials and without bypassing DaveTV auth.
5. Secure Provider Setup accepts private input through a short-lived vault
   session, validates it server-side, stores it durably, and returns only
   redacted proof to the agent/UI.
6. Natural Voice Agent can request temporary custom Views backed by real
   DaveTV catalog/search/play data.

## Files Expected To Change

- `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`: binding adoption and license rules.
- `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md`: 25-app inventory.
- `specs/053-upstream-view-pack/*`: gated process docs.
- `AGENTS.md`, `CLAUDE.md`, `.windsurf/rules/davetv-agent-rules.md`,
  `.agents/constitution.md`: agent rule entry points.
- `apps/hermes-web-tv/src/layouts/manifests/*.json`: View metadata.
- `apps/hermes-web-tv/src/shells/*Shell.jsx`: Native View implementations.
- `tests/playwright/specs/*`: View proof and gallery screenshots.
- Future provider setup routes under `services/hermes-tv-api/src/routes/`.

## Constraints

- Tizen Chromium 76 compatibility where browser code is involved.
- No production mocks/placeholders/stubs.
- No credential leaks.
- Preserve existing user/agent changes.
- License terms are binding even for private use.
- No app may be presented as DaveTV-complete unless it uses DaveTV provider
  truth and playback proof.

## Contracts

Native View component contract:

```jsx
<ShellComponent
  catalog={catalog}
  providers={providers}
  providerFilter={providerFilter}
  contentFilter={contentFilter}
  qualityFilter={qualityFilter}
  focusedItem={focusedItem}
  onItemFocus={onItemFocus}
  onItemSelect={onItemSelect}
  onOpenSettings={onOpenSettings}
/>
```

Secure provider setup redacted result:

```json
{
  "session_id": "opaque",
  "provider_id": "xtremehd",
  "provider_type": "xtream",
  "host_label": "example host only, no path/token",
  "saved": true,
  "catalog_count": 123,
  "playback_probe": "passed|failed|not_run",
  "errors": []
}
```

Agent custom View request:

```json
{
  "profile_id": "warren",
  "request": "Show my teams and games tonight",
  "provider_ids": ["apollo_group", "xtremehd"],
  "content_types": ["live", "movie", "series"],
  "result_view": "temporary-agent-view"
}
```

## Tests

- Unit: source-mode manifest parser if automation is added; provider setup
  redaction helpers.
- Integration: secure provider session commit, registry save, catalog proof,
  play ticket proof.
- Browser/UI: View picker, View preview screenshots, provider filter, instant
  playback click path, remote focus traversal.
- Live/VPS: provider truth proof and `https://tv.daveai.tech` smoke proof after
  deploy.

## Rollback

- Disable a View by removing it from `layoutRegistry.js` and hiding its manifest.
- Keep upstream sources in `upstream/` so adoption can be reverted without
  changing provider truth.
- Sandbox Apps can be disabled by removing their launcher card.
- Secure Provider Setup can fall back to existing Settings -> Providers form.

## Risks

- License confusion -> enforce manifest mode and attribution before source copy.
- 25 Views make UI noisy -> group Views by style and show favorites/recent first.
- Iframe/sandbox apps feel clunky -> use Sandbox only for tools, not primary
  playback.
- QLED polish hurts TV performance -> Playwright plus real TV D-pad proof before
  release.
- Provider secrets leak through chat -> route all input through vault sessions
  and redact before the agent sees anything.

# DaveTV E2E Flow Diagrams

Generated: 2026-05-20

Eight mermaid `sequenceDiagram` blocks covering the critical end-to-end paths a
new engineer must understand. Source-of-truth contracts:
`docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`,
`docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`,
`docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`.

All credentials are masked (`<XTREAM_URL>`, `<USER>`, `<PASS>`, `<TOKEN>`).

---

## 1. Provider QR Onboarding to Visible Catalog

```mermaid
sequenceDiagram
  participant TV as Web TV (QROnboarding.jsx)
  participant Phone as Operator phone
  participant API as hermes-tv-api
  participant Pair as routes/pairing.js
  participant Setup as routes/setup.js
  participant Store as lib/providerStore.js
  participant Reg as lib/providerRegistry.js
  participant Disk as data/providers.json

  TV->>API: POST /api/pair
  API->>Pair: mint HRM-XXXX (10 min TTL)
  Pair-->>TV: 201 { pairing_code, setup_url, expires_at }
  TV->>TV: render QR(setup_url) + 5s poll
  Phone->>API: GET /api/setup/provider?code=HRM-XXXX
  Setup-->>Phone: HTML form (type/label/url/<USER>/<PASS>/epg_url)
  Phone->>API: POST /api/setup/provider/submit (form-encoded)
  Setup->>Pair: _validateCompletable(code)
  Setup->>Store: add({ type, label, url, username, password, epg_url })
  Store->>Disk: atomic write providers.json (0600)
  Store-->>Setup: masked row (prov-<8hex>)
  Setup->>Pair: _completeWithProvider(code, prov_id)
  Pair-->>Phone: 201 success HTML
  TV->>API: GET /api/pair/HRM-XXXX (poll)
  Pair-->>TV: { status: 'completed', persisted_provider_id }
  TV->>API: GET /api/providers
  API->>Reg: list()
  Reg->>Store: listFull() + env scan
  Reg-->>API: masked rows (url_host only, no creds)
  API-->>TV: { providers: [...], total: N }
  TV->>API: GET /api/catalog
  API-->>TV: { catalog: [...], _meta.source != 'no-providers' }
```

The TV mints a fresh pairing code via `POST /api/pair` (10-minute TTL,
in-memory) and renders the returned `setup_url` as a real scannable QR. The
operator's phone opens `/api/setup/provider?code=HRM-XXXX`, posts credentials,
and `routes/setup.js` calls `providerStore.add()` to atomically write
`data/providers.json`. On success it flips the pairing envelope to `completed`.
The TV's 5-second poll on `GET /api/pair/:code` sees the completion and
re-fetches `/api/providers` (masked through `providerRegistry.list()`) and
`/api/catalog`, which now returns real items. The pairing record is
short-lived; the provider config is durable.

---

## 2. Live TV Play - HLS Proxy - Stream Bytes

```mermaid
sequenceDiagram
  participant UI as PlayerModal
  participant Play as routes/play.js
  participant Res as lib/streamResolver
  participant Xt as lib/xtreamClient
  participant M3U as lib/m3uClient
  participant Proxy as lib/hlsProxy
  participant Up as Upstream (<XTREAM_URL>)

  UI->>Play: POST /api/play { item_id, profile_id }
  Play->>Play: _findItem(item_id) via m3u/iptv/merged caches
  Play->>Play: _buildSourcesForItem(item, providerId)
  Play-->>UI: 200 ticket { ticket, stream_endpoint, sources[] }
  UI->>Play: GET /api/play/:ticket/stream(.m3u8)
  Play->>Res: resolveStreamUrl(source.item_id)
  Res->>Xt: panel URL for live stream_id
  Res->>M3U: cached EXTINF URL (alternative)
  Res-->>Play: { url: 'http://<XTREAM_URL>/live/<USER>/<PASS>/N.m3u8', credential_bearing: true }
  Play->>Proxy: proxyPlaylist({ upstreamUrl, ticket })
  Proxy->>Up: fetch playlist (server-side, creds in URL)
  Up-->>Proxy: 200 #EXTM3U + segment URIs
  Proxy->>Proxy: rewrite every segment URI -> /api/proxy/:ticket/seg/<b64>
  Proxy-->>Play: rewritten body (no creds, no host)
  Play-->>UI: 200 application/vnd.apple.mpegurl + X-Provider-Used
  UI->>Play: GET /api/proxy/:ticket/seg/<b64>
  Play->>Proxy: streamSegment(b64Url)
  Proxy->>Up: GET decoded upstream segment URL
  Up-->>Proxy: 200 video/mp2t bytes
  Proxy-->>UI: streamed bytes
```

`POST /api/play` builds `sources[]` (priority-ordered, cross-provider) and
returns a ticket whose `stream_endpoint` carries an `.m3u8` suffix when the
primary source resolves to HLS so `hls.js` engages. On the subsequent
`GET /stream`, `streamResolver` produces an upstream URL flagged
`credential_bearing: true`. The route then calls `hlsProxy.proxyPlaylist` to
fetch the playlist server-side and rewrite every segment URI to
`/api/proxy/:ticket/seg/<b64>` (base64url of the absolute upstream URL).
The browser only ever sees opaque ticket-scoped paths; the upstream credentials
never enter the response headers, body, or Location. If the first source fails,
the route walks the next entry in `sources[]` and records the failure via
`streamProbe.recordProviderOutcome` until one wins or all are exhausted (503).

---

## 3. VOD Play - Direct or Proxied

```mermaid
sequenceDiagram
  participant UI as PlayerModal
  participant Play as routes/play.js
  participant Res as lib/streamResolver
  participant Proxy as lib/hlsProxy
  participant Up as Upstream CDN

  UI->>Play: POST /api/play { item_id: 'iptv-vod-...', profile_id }
  Play->>Play: _findItem -> iptvOrg.getCachedItemById
  Play-->>UI: 200 ticket
  UI->>Play: GET /api/play/:ticket/stream
  Play->>Res: resolveStreamUrl(source.item_id)
  Res-->>Play: { url, credential_bearing: false }
  alt clean public URL (iptv-org)
    Play-->>UI: 302 Location: <upstream public URL>
    UI->>Up: GET <upstream> (Range supported)
    Up-->>UI: 206/200 video/mp4 bytes
  else credential-bearing VOD (xtream movie .mp4)
    Play->>Proxy: proxyDirectStream({ upstreamUrl, req, res, deferErrors: true })
    Proxy->>Up: GET <XTREAM_URL>/movie/<USER>/<PASS>/N.mp4 (Range from client)
    Up-->>Proxy: 206 video/mp4 bytes
    Proxy-->>UI: pass-through bytes + Content-Range
  end
```

VOD playback shares the ticket envelope with live TV. The branching logic lives
in `routes/play.js _streamHandler`: when `resolveStreamUrl` reports
`credential_bearing: false`, the route 302-redirects directly to the public CDN
(common for iptv-org). When the upstream is a credential-bearing direct byte
stream (Xtream Codes `.mp4` VOD), `hlsProxy.proxyDirectStream` pipes the bytes
through the API with Range header propagation so seek/scrub works. The client
never sees the upstream URL or credentials in either branch.

---

## 4. EPG Waterfall Ingestion

```mermaid
sequenceDiagram
  participant Grid as routes/epgGrid.js
  participant WF as lib/epgWaterfall.js
  participant Reg as lib/providerRegistry
  participant XMLTV as integrations/xmltv
  participant Up as XMLTV sources

  Grid->>Reg: listFull() (full rows incl. creds)
  Grid->>WF: buildEpgUrlCandidatesFromRegistryRows(rows, XMLTV_URL)
  loop per enabled m3u/xtream row
    WF->>WF: slot 1 entry.epgUrl (override)
    WF->>WF: slot 2 m3u header x-tvg-url
    WF->>WF: slot 3 xtream xmltv.php (built from creds)
    WF->>WF: slot 4+ additionalEpgUrls
  end
  WF->>WF: dedupeEpgUrls(sources)
  WF-->>Grid: ordered candidates[]
  Grid->>XMLTV: getCachedEpg(url) || fetchEpg(url, { forceRefresh })
  XMLTV->>Up: GET <epg-url> (creds in query)
  Up-->>XMLTV: bytes (maybe gzip)
  XMLTV->>WF: detectGzip(url, bytes, headers)
  XMLTV-->>Grid: { channels, programs }
  Grid->>WF: mergeEpgResults(epgs)
  Note over WF: waterfall: earlier sources win per tvgId
  WF-->>Grid: { channels, programs }
  Grid->>WF: buildPlayableEpgIndex(catalog items)
  Grid->>WF: resolvePlayableEpgChannel(tvgId, name, index)
  Grid-->>Grid: filter by window + channel_id
  Grid-->>Client: 200 { programs, _meta.sources[], mapped/unmapped }
```

`routes/epgGrid.js` invokes `epgWaterfall.buildEpgUrlCandidatesFromRegistryRows`
to assemble an ordered EPG URL list per provider: explicit override -> M3U
header `x-tvg-url` -> Xtream `xmltv.php` default -> additional URLs, deduped.
`integrations/xmltv` fetches each candidate (honoring gzip via
`detectGzip` which checks magic bytes 0x1F 0x8B, `.gz` extension, content-type,
and content-disposition). `mergeEpgResults` waterfalls the parsed results so
the earliest source wins per `tvgId`. `buildPlayableEpgIndex` then maps XMLTV
channels to real catalog items by exact `tvg_id` first, then unique normalized
channel name (ambiguous matches return null - no silent guessing). The response
exposes per-source diagnostics via `_meta.sources[]` with no credentials.

---

## 5. Catalog Merge Across Providers

```mermaid
sequenceDiagram
  participant Cat as routes/catalog.js
  participant Jelly as lib/jellyfin
  participant Org as lib/iptvOrg
  participant M3UC as lib/m3uClient
  participant XtC as lib/xtreamClient
  participant Reg as lib/providerRegistry
  participant Merge as lib/catalogMerge

  Cat->>Jelly: fetchCatalog() (if JELLYFIN_URL + API_KEY)
  Jelly-->>Cat: items[] or []
  Cat->>Org: fetchCatalog({ limit: 300 }) (if IPTV_ORG_ENABLED)
  Org-->>Cat: items[] (public, no creds)
  Cat->>M3UC: fetchCatalog({ limit: 600 })
  M3UC->>Reg: listFull() (env + disk M3U rows)
  M3UC->>M3UC: parse each playlist
  M3UC-->>Cat: items[] with providers[].provider_id
  Cat->>XtC: fetchAllLive/Vod/Series
  XtC->>Reg: listFull() (env + disk xtream rows)
  XtC->>XtC: panel API -> toHermesItem
  XtC-->>Cat: items[] with sources[].provider_id='xtream-prov-<hex>'
  Cat->>Merge: mergeByTitle(allItems)
  Note over Merge: normalize title -> bucket<br/>collapse ESPN x3 -> 1 card + 3 sources[]
  Merge-->>Cat: deduplicated catalog
  Cat->>Merge: setLastMerged(items) (snapshot for /api/play)
  Cat-->>Client: 200 { catalog, _meta { source, m3u_providers, xtream_status } }
```

`resolveCatalog()` fans out to every configured upstream. Jellyfin owns the
base list when present; `iptvOrg`, `m3uClient`, and `xtreamClient` are merged
in additively. Both `m3uClient` and `xtreamClient` consult
`providerRegistry.listFull()` for env-derived AND disk-stored providers
(synthesizing `m3u-prov-<hex>` or `xtream-prov-<hex>` IDs for disk rows).
`catalogMerge.mergeByTitle` then collapses cross-provider duplicates
(normalized title bucket) into single items carrying a `sources[]` array
ordered by health, which `/api/play` later walks for auto-fallback.
The `X-Catalog-Source` response header reports `jellyfin`/`iptv-org`/
`providers`/`merged`/`no-providers`. There is no synthetic fallback list -
zero items returns honest empty per the no-mocks rule.

---

## 6. Restart-Survival Proof

```mermaid
sequenceDiagram
  participant Op as Operator
  participant Setup as POST /api/setup/provider/submit
  participant Store as lib/providerStore
  participant Disk as data/providers.json (0600)
  participant Sys as docker compose
  participant Boot as src/index.js (restart)
  participant Reg as lib/providerRegistry
  participant Cat as GET /api/catalog

  Op->>Setup: type=xtream, url=<XTREAM_URL>, <USER>, <PASS>
  Setup->>Store: add(input)
  Store->>Store: validate + assign prov-<8hex>
  Store->>Disk: atomic temp write + rename
  Store-->>Setup: masked row
  Op->>Cat: GET /api/catalog
  Cat-->>Op: catalog with items (xtream provider)
  Sys->>Sys: docker compose restart hermestv-vps-api
  Boot->>Boot: cold start, _cache = null
  Op->>Cat: GET /api/catalog (post-restart)
  Cat->>Reg: list()
  Reg->>Store: listFull() (lazy load)
  Store->>Disk: read providers.json
  Disk-->>Store: persisted rows
  Store-->>Reg: full rows
  Reg-->>Cat: masked + canonical provider_id
  Cat->>Cat: m3uClient/xtreamClient fetch via registry
  Cat-->>Op: same catalog, no re-onboarding
```

`providerStore` persists every `add()` to `data/providers.json` via an atomic
temp-then-rename write on the API container's writable volume (mounted by
docker compose). The in-memory cache is rebuilt lazily on first read after
boot. After `docker compose restart`, the next `/api/catalog` call triggers
`providerRegistry.listFull()`, which loads the disk rows, and
`m3uClient`/`xtreamClient` both call `providerRegistry.listFull()` to discover
the same credentials they had before. No re-pairing required. The empty
pairing-code table (in-memory only) on the new boot is irrelevant - completed
provider configs are durable. This is the proof gate that distinguishes a real
registry from the previous in-memory-only setup that contract 46 calls out as
incomplete.

---

## 7. CI Proof Pipeline

```mermaid
sequenceDiagram
  participant Dev as Developer (PR/push)
  participant Op as Operator (workflow_dispatch)
  participant CI as ci.yml
  participant SchVal as schema-validation
  participant Reg as api-regression-tests
  participant Empty as e2e-smoke-empty-state
  participant Live as provider-live (gated)
  participant Secret as secret-scan
  participant Art as Artifact (sanitized)

  Dev->>CI: pull_request / push
  CI->>SchVal: schema-validate.js (gate)
  CI->>Reg: npm test --prefix services/hermes-tv-api
  CI->>Empty: NO_PROVIDER_EMPTY_STATE=1
  Empty->>Empty: assert all provider env unset
  Empty->>Empty: tools/test-e2e-smoke.js
  Note over Empty: catalog total=0 + _meta.source='no-providers' = PASS
  CI->>Secret: grep + entropy scan (no skip)
  Note over Live: NOT run on PR/push
  Op->>CI: workflow_dispatch run_provider_live=true
  CI->>Live: PROVIDER_E2E_MODE=live + secrets injected
  Live->>Live: tools/test-provider-e2e.js
  Note over Live: requires /api/providers non-empty<br/>+ /api/catalog total>0<br/>+ play ticket + HEAD/GET 200/206/302<br/>+ no credential in proof artifacts
  Live->>Art: docs/proof/provider-truth/<ts>/ (sanitized)
  Live-->>Op: PASS or FAIL (no skip-as-PASS)
```

CI splits empty-state from provider-live per contract 46/47. PR and push events
run `e2e-smoke-empty-state` with `NO_PROVIDER_EMPTY_STATE=1` and an explicit
assertion that every provider env var (`APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`,
`XTREAM_URL/USERNAME/PASSWORD`, `JELLYFIN_URL/API_KEY`, `IPTV_ORG_ENABLED`) is
unset - the empty-state assertion would otherwise be nondeterministic. The
`provider-live` job is gated by
`github.event_name == 'workflow_dispatch' && inputs.run_provider_live == 'true'`
and consumes operator-configured GitHub Action secrets. It runs
`tools/test-provider-e2e.js` which fails when `/api/catalog` is empty or
playback skip is detected, then uploads sanitized artifacts to
`docs/proof/provider-truth/<ts>/`. A grep that requires `^=== Results: [1-9]
PASS, 0 FAIL` makes "skip counted as pass" impossible.

---

## 8. Reference Apps Adoption Flow

```mermaid
sequenceDiagram
  participant Ref as G:\Github\IPTV-Apps\*
  participant Doc as docs/reference-apps/*.md
  participant Test as services/hermes-tv-api/test/*.test.js
  participant Impl as services/hermes-tv-api/src/lib/*
  participant Fix as tools/xtream-fixture-server.js
  participant Proof as docs/proof/provider-truth/<ts>/

  Note over Ref: iptvnator (MIT) Extreme-InfiniTV (GPL)<br/>ynotv (AGPL) NuvioWeb (license-unclear)
  Ref->>Doc: extract patterns + behavior contracts (no code copy)
  Doc->>Doc: doc the constraint set (M3U edge cases, EPG waterfall, etc.)
  Doc->>Test: write Hermes test first (TDD)
  Note over Test: e.g. test/epgProviderSources.test.js<br/>locks waterfall slot order before impl
  Test->>Impl: implement in Hermes src (clean-room)
  Note over Impl: lib/epgWaterfall.js, lib/m3uClient.js,<br/>lib/xtreamClient.js - ES5, no GPL strings
  Impl->>Fix: prove via local fixture (xtream-fixture-server.js<br/>port adapted from iptvnator MIT pattern)
  Fix->>Test: XTREAM_URL=http://127.0.0.1:<port> npm test
  Test->>Proof: emit sanitized artifact
  Proof->>Proof: secret-scan clears (no creds, no upstream URLs)
  Note over Proof: PATTERN-ONLY adoption marked in report:<br/>"License risk: NONE / PATTERN-ONLY / NEEDS REVIEW"
```

Contract 48 forbids bulk copying source from GPL/AGPL reference apps. The
adoption pattern is: read the reference behavior, write a markdown contract
under `docs/reference-apps/` describing the constraint, write a Hermes test
that locks that constraint, then implement clean-room in `services/hermes-tv-api/src/lib/`.
The Xtream fixture server (`tools/xtream-fixture-server.js`) is the
exception - it adapts iptvnator's MIT-licensed mock-server shape, attribution
preserved. The fixture proves the end-to-end pipeline without paid-provider
credentials so PR-time CI has a non-skipped happy path, while the
`provider-live` job remains the only gate that proves real upstream.
Every adopted pattern produces a Hermes test, a Hermes implementation, AND a
proof artifact, with the agent report citing
`License risk: NONE / PATTERN-ONLY / NEEDS REVIEW`.

---

## Ambiguities / Best-Guess Notes

- **Diagram 3 (VOD)**: the codebase does not yet expose a dedicated VOD route -
  `routes/play.js` handles VOD via the same ticket flow as live, branching
  inside `_streamHandler` on `resolved.credential_bearing`. The 302-vs-proxy
  split shown is the documented behavior; a Range-aware proxied VOD test is
  flagged in contract 48's `P1` list as not yet covered E2E.
- **Diagram 6 (restart)**: the docker volume mount that backs
  `data/providers.json` lives in `upstream/docker-vps/VPS_COMPOSE.yml` (not
  read here). The flow assumes the operator has wired that volume per
  `docs/42_VPS_DEPLOY_VIA_GH_ACTIONS.md`; without it the file is ephemeral.
- **Diagram 8 (adoption)**: the "doc the constraint" step writes to
  `docs/reference-apps/*.md`, but the exact lifecycle (who reviews license
  classification before TDD begins) is described in contract 48 only as the
  agent report template, not as an automated gate.

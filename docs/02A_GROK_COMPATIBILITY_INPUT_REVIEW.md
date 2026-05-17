# 02A — Grok Compatibility Input Review

Source: user-provided Grok 4.3 text pasted during planning.

## Verdict

This is useful as a research input, but it is not accepted as truth. Claude/Codex agents must verify every model-specific claim through official Samsung docs, Samsung support pages/manuals, Tizen APIs, and on-device diagnostics on both TVs.

Target TVs:

- Mom: `QN85Q7FAAFXZA`
- Dave: `UN55CU8000BXZA`

## Useful pieces from the Grok note

The Grok note reinforces the project architecture:

```text
Samsung TV thin client
  -> HTTPS/WebSocket
HermesTV backend brain
  -> Dispatcharr / m3u-editor / Threadfin / tuliprox
  -> ffprobe quality scanner
  -> Mem0 memory
  -> Open WebUI + Pipelines
  -> optional CrewAI background agents
  -> Azure TTS / Assure voices
  -> Safe JSON UI command router
```

The note is especially useful for these project files:

- `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`
- `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md`
- `docs/06_SAFE_AGENT_UI_COMMAND_SCHEMA.md`
- `docs/08_BACKEND_STACK_CONTRACT.md`
- `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`

## Claims that must be verified before design lock

Do not accept these claims until tested:

1. Mom TV `QN85Q7FAAFXZA` exact model family, Tizen/One UI version, processor label, and web runtime.
2. Dave TV `UN55CU8000BXZA` exact Tizen version and app model group.
3. Multi View support on Dave's CU8000 model.
4. Whether app-level split-screen or system Multi View can be triggered from a third-party Tizen app.
5. Voice API availability and permissions on both TVs.
6. AVPlay behavior for HLS/DASH streams on both TVs.
7. Whether Mom's TV actually provides meaningful extra web-app headroom for dense layouts.
8. Whether Tizen 9.0 is exposed to web apps in ways useful to this project.

## Accepted design conclusions from Grok note, with caveats

### Keep one codebase

Accepted. Build one Tizen/web app codebase with runtime feature detection and model-specific performance tiers.

### Dave TV is baseline

Accepted. Dave's older `UN55CU8000BXZA` must define the lowest performance budget.

### Mom TV can unlock premium visuals

Accepted only after runtime detection and on-device proof. Premium mode may include denser grids, richer background packs, smoother animations, bigger cache, and richer chatbot overlay.

### Avoid 4/8/12/16 true live video grids

Accepted. Consumer Samsung TVs should use one primary active stream as the reliable baseline. Multi-stream grids are experimental only after proof.

### Use server-generated previews

Accepted. Build preview/contact sheets/thumbnails/short cached preview clips server-side instead of trying to decode many streams on the TV.

## Required Claude task

Claude Agent 01 must turn the Grok note into a verification matrix with columns:

| Claim | Source | Verification method | Mom TV result | Dave TV result | Decision | Evidence path |
|---|---|---|---|---|---|---|

No claim should be marked accepted without evidence.

## Required on-device proof

Add a diagnostic screen in the Tizen app that exports:

```js
{
  model: webapis?.productinfo?.getModel?.(),
  firmware: webapis?.productinfo?.getFirmware?.(),
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  screen: { width: screen.width, height: screen.height },
  viewport: { width: innerWidth, height: innerHeight },
  avplayAvailable: !!webapis?.avplay,
  productInfoAvailable: !!webapis?.productinfo,
  tizenAvailable: !!window.tizen
}
```

The exported JSON must be saved under `proof/tv-diagnostics/` for both target TVs.

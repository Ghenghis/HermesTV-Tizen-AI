# 02 — TV Model Research Lock: QN85Q7FAAFXZA and UN55CU8000BXZA

## Hard requirement

The app must support both real TVs:

| Owner | Model number | Contract status |
|---|---|---|
| Mom | `QN85Q7FAAFXZA` | New TV, must be researched and validated first |
| Dave | `UN55CU8000BXZA` | Older TV, must define fallback/performance budget |

No layout, playback, remote, voice, memory, or performance decision is accepted until both models are explicitly researched and then validated on-device.

## Current research stance

### Mom TV — `QN85Q7FAAFXZA`

Treat this as **unverified until confirmed from Samsung support, About This TV, and Tizen ProductInfo API**. Public search may not expose a direct official SKU page for this exact model string, so agents must not guess.

Claude Agent 01 must verify:

- exact model name returned by Samsung menus
- exact `webapis.productinfo.getModel()` output
- model year
- TV Seller Office model group
- Tizen version
- web engine/user agent
- remote type / voice button behavior
- AVPlay capability
- PiP capability
- HLS/M3U8 support
- memory/performance constraints
- whether it maps to a 2025 Q7F/Q7FA/Q7FD group or a different QN/QLED group

### Dave TV — `UN55CU8000BXZA`

Likely 55-inch CU8000 / Crystal UHD family. Agents must still verify exact on-device values. Dave's older TV is the performance floor for the whole app.

Possible research angle:

- Samsung 2023 model groups include Tizen 7.0 groups and UCU8000-class model groups.
- Confirm if Dave's exact TV maps to `23TV_BASIC2`, `23TV_BASIC3`, or another group.

## Required on-device diagnostic screen

Agent must build a small Tizen diagnostic screen that prints and exports this data:

```js
const info = {
  model: webapis?.productinfo?.getModel?.(),
  firmware: webapis?.productinfo?.getFirmware?.(),
  duid: webapis?.productinfo?.getDuid?.(),
  smartTVServerType: webapis?.productinfo?.getSmartTVServerType?.(),
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  language: navigator.language,
  screen: { width: screen.width, height: screen.height },
  viewport: { width: innerWidth, height: innerHeight }
};
```

The diagnostic screen must include a QR code or copyable JSON block.

## Required capability matrix

| Capability | Mom QN85Q7FAAFXZA | Dave UN55CU8000BXZA | Decision |
|---|---:|---:|---|
| Tizen version | TBD | TBD | Lowest common denominator decides |
| Web engine | TBD | TBD | Decide JS/CSS compatibility |
| AVPlay HLS | TBD | TBD | Required |
| HTML5 video fallback | TBD | TBD | Required |
| PiP support | TBD | TBD | Optional only |
| simultaneous playback | Assume no until proven | Assume no until proven | Do not design 4/8/16 live grids |
| voice capture | TBD | TBD | Fallback to on-screen chat |
| remote key events | TBD | TBD | Must pass focus tests |
| memory pressure | TBD | TBD | Dave older TV sets minimum budget |
| startup time | TBD | TBD | <= 3s shell target, <= 6s catalog target |

## Hard design implication

The older Dave TV must drive the default performance budget. Mom's newer TV can unlock enhanced mode, more backgrounds, heavier animation, and larger image cache only after model detection.

# 03 — Extreme UX/UI Customization Contract

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`  
Local: `G:\Github\HermesTV-Tizen-AI`  
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

## UX mandate

DaveTV must feel far beyond common IPTV apps. It must offer many selectable, changeable, user-tunable, and agent-tunable interfaces without becoming unstable.

The UI engine must support at least:

1. Layout preset
2. Theme pack
3. Background pack
4. Tile density
5. Font scale
6. Focus ring style
7. Animation density
8. Side panel mode
9. Guide mode
10. Category grouping strategy
11. Quality badge style
12. Provider badge style
13. Preview mode
14. Floating chatbot position
15. Player overlay style
16. Card shape
17. Poster aspect ratio
18. Safe area / overscan padding
19. Audio feedback toggle
20. Mom Mode / Dave Mode
21. High contrast mode
22. Reduced motion mode
23. Screen burn-in protection mode
24. Screensaver / ambient mode
25. Remote long-press bindings
26. Agent automation permissions

## User customization paths

Users must be able to customize through:

- remote-control settings panels
- profile defaults
- theme picker
- layout picker
- chatbot commands
- agent suggestions with accept / reject

## Agent customization rule

Agents may suggest/apply only validated schema commands. No raw JS, no direct localStorage mutation, no credential changes, no shell execution, no unvalidated JSON.

Example:

```json
{
  "action": "update_layout",
  "profile_id": "mom_tv",
  "layout_id": "classic_cable_grid",
  "changes": {
    "font_scale": 1.25,
    "tile_density": "large",
    "sidebar": "hidden",
    "quality_filter": ["720p", "1080p", "4K"]
  },
  "requires_user_confirm": true
}
```

## Preset principle

Static presets first, deep custom editor second. The 12 layouts must be stable and testable. User/agent customizations are parameter overlays on known-good presets.

## Proof required

- screenshot per layout/theme/profile
- focus traversal proof
- Dave TV performance proof
- Mom TV enhanced-mode proof
- rollback proof after agent UI command

_(Rebranded HermesTV → DaveTV 2026-05-19 per user request; technical identifiers unchanged.)_

# 06 — Agentic UI Control: Safe JSON Schema

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for how agents (and the floating chatbot) are allowed to change the HermesTV UI at runtime. It is the design lock referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` (agent 16) and `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md`.

## Hard rules

1. Agents may change UI state **only** by emitting validated JSON commands from the allowlist in this document.
2. No raw JavaScript, no `eval`, no direct `localStorage` mutation, no direct DOM writes, no shell execution, no network calls from the chatbot path.
3. Every command is validated against its action-specific JSONSchema **before** any side effect runs.
4. Every command is scoped to a `profile_id`. Cross-profile changes require a separate command per profile.
5. Every command is logged to an append-only audit ledger (`proof/agent-commands/<session_id>.jsonl`). The ledger is the source of truth for rollback.
6. Renderer tier (see `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md`) is **not** a writable field via this schema. Tier is automatic-only. `UN`-prefix TVs (Dave's `UN55CU8000BXZA` and all Crystal UHD / entry Samsung lines) always stay baseline. `QN`-prefix TVs (`QN85Q7FAAFXZA`, `QN95Q7FAAFXZA`, and all QLED / Neo QLED lines) auto-enter enhanced after passing the capability probe. These TVs default to enhanced and must not be artificially capped to baseline mode. Agents cannot permanently downgrade `QN`-class TVs. Agents may only suggest temporary protective adjustments (with visible reason, timeout, rollback, and user override) when a measured runtime health condition requires it. `UN`-class TVs cannot be upgraded by agents.
7. Provider credentials, API keys, and network endpoints are never reachable from this schema.
8. Destructive or sensitive commands set `requires_user_confirm: true` and are gated by an on-screen confirm step with a 5s timeout default.
9. Rate limits apply per agent and per profile. Default: 30 commands per minute per agent, hard cap.
10. Mom Mode protections: while `mom_tv` profile is active, agents may not switch Mom out of Mom Mode, reduce font scale below 1.25, disable audio feedback, or disable reduced motion without `requires_user_confirm: true` AND a verbal confirmation step.

## Command envelope

Every command — without exception — uses this envelope:

```json
{
  "schema": "hermestv.ui.v1",
  "command_id": "01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "issued_at": "2026-05-17T20:42:11.913Z",
  "issued_by": {
    "agent_id": "agent-15-chatbot",
    "agent_role": "floating_chatbot",
    "session_id": "s_2026-05-17_8b3c",
    "user_intent_summary": "switch to Mom Jumbo Rail and Mom Calm theme"
  },
  "target": {
    "tv_model_hint": "QN85Q7FAAFXZA",
    "profile_id": "mom_tv"
  },
  "action": "update_layout",
  "params": { "...": "action-specific, validated by the action's schema" },
  "requires_user_confirm": true,
  "rollback_token": "rb_01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "dry_run": false
}
```

Envelope validation rules:

- `command_id`: ULID. Globally unique. Stored in the audit ledger.
- `issued_at`: RFC 3339 UTC timestamp. Reject if drift > 5 minutes.
- `issued_by.agent_id`: must be on the registered agent list (`schemas/agents/registry.json`).
- `target.profile_id`: must exist. Reject if unknown.
- `target.tv_model_hint`: optional. The router does **not** trust this value — tier detection at boot decides. Used only for telemetry.
- `action`: must be on the allowlist in this document.
- `params`: validated by the action's own JSONSchema (`schemas/commands/<action>.json`).
- `requires_user_confirm`: defaults to `true` for any action marked `confirm: required` below. Agents may not set it to `false` for those actions.
- `rollback_token`: opaque string. The router uses it to look up the inverse command on rollback.
- `dry_run`: when `true`, the router runs full validation and returns the would-be diff, but applies nothing.

## Action allowlist

Actions are grouped by surface. The "Confirm" column says whether the action requires on-screen user confirmation by default. "Tier-writable" is always **No** (tier is automatic).

### Layout actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `update_layout` | Switch active preset (one of 12 from `docs/04`). | required | No |
| `update_tile_density` | medium/large/xl (per-preset bounds). | optional | No |
| `update_card_shape` | `rounded_16_9` / `poster_2_3` / `square` (preset-allowed only). | optional | No |
| `update_focus_ring_style` | `static_thick` / `static_thick_high_contrast` / `animated_glow` (enhanced only — router rejects on baseline). | optional | No |
| `update_safe_area` | 4–10%. | optional | No |
| `reorder_rails` | Reorder rails inside a preset that supports rails. | optional | No |

### Theme & background actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `update_theme` | Switch theme (one of 24 from `docs/05`). | optional | No |
| `update_background_pack` | Switch background pack (one of 12). Router auto-substitutes `baseline_partner` if requested pack is enhanced-only on a baseline TV — without changing tier. | optional | No |
| `toggle_high_contrast` | On/off. Forces theme to its high-contrast partner. | optional | No |
| `toggle_reduced_motion` | On/off. Forces motion packs to their static partner. | optional | No |
| `update_font_scale` | 1.0 / 1.15 / 1.25 / 1.35 / 1.5 (preset-allowed only). Mom Mode floor 1.25. | optional | No |

### Profile & mode actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `switch_profile` | Switch active profile (e.g. `dave_tv` ↔ `mom_tv`). | required | No |
| `enable_mom_mode` | Force Mom Mode preset+theme+settings bundle for the active profile. | optional | No |
| `disable_mom_mode` | Leave Mom Mode. **Blocked entirely while active profile is `mom_tv` unless the originating agent is `agent-20-accessibility` AND the user confirms via voice/visual step.** | required + voice | No |
| `enable_dave_mode` | Force Dave Mode preset+theme+settings bundle. | optional | No |

### Floating chatbot actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `update_chatbot_position` | One of `bottom_right_small`, `bottom_center_large`, `top_right_compact`. | optional | No |
| `update_chatbot_state` | `minimized` / `compact` / `expanded` / `walkie_talkie`. | optional | No |
| `show_action_cards` | Show up to 3 action cards (each is itself a queued command awaiting user OK). | required (per card) | No |

### Player & quality actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `update_quality_filter` | Allowed qualities `["4K","1080p","720p","480p","low"]`. | optional | No |
| `update_provider_filter` | Filter to a subset of registered providers. | optional | No |
| `tune_channel` | Switch active channel within the player. One-stream rule applies. | optional | No |
| `request_preview_refresh` | Ask backend to regenerate preview/contact-sheet for a channel. | optional | No |

### Memory / favorites actions

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `pin_favorite` | Add a channel/show to favorites for active profile. | optional | No |
| `unpin_favorite` | Remove a favorite. | optional | No |
| `create_reminder` | Reminder for a future program. | optional | No |
| `delete_reminder` | Delete a reminder. | required | No |
| `forget_recent` | Clear recents for the active profile. | required | No |
| `export_profile_state` | Emit a JSON snapshot of the profile's UI state (no secrets). | optional | No |

### Operational actions (Claude/agent tooling)

| Action | Purpose | Confirm | Tier-writable |
|---|---|---|---|
| `request_screenshot` | Ask the app to capture a screenshot for proof artifacts. | optional | No |
| `request_diagnostic_export` | Trigger the diagnostic screen from `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`. | optional | No |
| `rollback_last_command` | Apply the inverse of the most recent command by `rollback_token`. | required | No |
| `acknowledge_user_confirm` | Internal: the UI emits this when the user confirms a pending command. | n/a | No |
| `reject_user_confirm` | Internal: the UI emits this when the user rejects a pending command. | n/a | No |

Anything not on this list is rejected. No exceptions.

## Per-action JSONSchema (canonical examples)

Each action has its own schema under `schemas/commands/<action>.json`. The router loads them at boot. Examples below are normative for the named action — the actual files must match exactly.

### `update_layout`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "hermestv.ui.v1/commands/update_layout.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["preset_id"],
  "properties": {
    "preset_id": {
      "type": "string",
      "enum": [
        "classic_cable_grid",
        "mom_jumbo_rail",
        "live_focus",
        "epg_strip",
        "category_carousels",
        "provider_dashboard",
        "favorite_quick_dial",
        "recents_resume",
        "discovery_walls",
        "cinematic_hero",
        "minimal_player",
        "ambient_idle"
      ]
    },
    "tile_density": { "type": "string", "enum": ["medium", "large", "xl"] },
    "card_shape": { "type": "string", "enum": ["rounded_16_9", "poster_2_3", "square"] },
    "focus_ring_style": { "type": "string", "enum": ["static_thick", "static_thick_high_contrast", "animated_glow"] },
    "safe_area_pct": { "type": "number", "minimum": 4, "maximum": 10 }
  }
}
```

### `update_theme`

```json
{
  "$id": "hermestv.ui.v1/commands/update_theme.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["theme_id"],
  "properties": {
    "theme_id": {
      "type": "string",
      "enum": [
        "midnight_steel","obsidian_warm","noir_red","deep_ocean","forest_dusk","royal_violet","carbon_lime","ember_charcoal","cosmic_indigo","slate_paper",
        "cinema_velvet","cinema_amber","cinema_neon","cinema_mono","cinema_aurora","cinema_drive",
        "hc_dark","hc_light","mom_calm","mom_garden",
        "morning_paper","kitchen_window","sunday_silver","clinic_clear"
      ]
    },
    "apply_partner_if_accessibility_on": { "type": "boolean", "default": true }
  }
}
```

### `update_background_pack`

```json
{
  "$id": "hermestv.ui.v1/commands/update_background_pack.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["pack_id"],
  "properties": {
    "pack_id": {
      "type": "string",
      "enum": [
        "static_gradient_steel","static_gradient_warm","static_gradient_aurora",
        "slow_fade_steel","slow_fade_warm",
        "ambient_motion_01","ambient_motion_02","ambient_motion_03",
        "cinematic_ambient_01","cinematic_ambient_02","cinematic_ambient_03",
        "mom_garden_calm"
      ]
    }
  }
}
```

If the requested pack's `tier_required` is `enhanced` and the runtime tier is `baseline`, the router substitutes the pack's `baseline_partner` and writes both `requested_pack_id` and `applied_pack_id` to the audit entry. The substitution is silent to the agent but visible in the ledger.

### `disable_mom_mode` (special protections)

```json
{
  "$id": "hermestv.ui.v1/commands/disable_mom_mode.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["reason", "originating_agent"],
  "properties": {
    "reason": { "type": "string", "minLength": 8 },
    "originating_agent": { "type": "string", "const": "agent-20-accessibility" },
    "voice_confirm_token": { "type": "string", "minLength": 16 }
  }
}
```

If the active profile is `mom_tv`, the router additionally requires a non-empty `voice_confirm_token` issued by the Azure voice path within the last 60s. Without it, the command is rejected before the confirm dialog is even shown.

## Validation pipeline

Every command runs through these stages in order. Any failure short-circuits with a structured error written to the audit ledger.

1. **Envelope validation** — schema, ULID format, timestamp drift, agent registry membership, action allowlist.
2. **Profile resolution** — load active profile + Mom Mode flag.
3. **Tier resolution** — load current renderer tier from the boot detection result. Tier is read-only.
4. **Action schema validation** — `schemas/commands/<action>.json`.
5. **Cross-field policy checks** — e.g., Mom Mode protections, font-scale floor, focus-ring style vs. tier, theme partner substitutions.
6. **Confirmation gate** — if `requires_user_confirm` is true, render the confirm card and wait. Time out after 5s default → treated as reject.
7. **Apply** — write to the UI state store via the single allowed mutation API. No other writer exists.
8. **Audit** — append to `proof/agent-commands/<session_id>.jsonl` with `command`, `applied_state_diff`, `result`, `errors`, `rollback_token`.
9. **Rollback registration** — compute the inverse command and store under `rollback_token` for `rollback_last_command`.

## Audit ledger format

Append-only JSONL. One line per command attempt (including rejections).

```json
{
  "ts": "2026-05-17T20:42:12.044Z",
  "command_id": "01HZX7K9P8V2T4R5W6N8Q3M1B7",
  "agent_id": "agent-15-chatbot",
  "profile_id": "mom_tv",
  "tv_model_at_boot": "QN85Q7FAAFXZA",
  "renderer_tier_at_boot": "enhanced",
  "action": "update_layout",
  "requested_params": { "preset_id": "mom_jumbo_rail", "tile_density": "xl" },
  "applied_params": { "preset_id": "mom_jumbo_rail", "tile_density": "xl" },
  "result": "applied",
  "errors": [],
  "diff": [
    { "path": "/profiles/mom_tv/ui/layout/preset_id", "from": "live_focus", "to": "mom_jumbo_rail" },
    { "path": "/profiles/mom_tv/ui/layout/tile_density", "from": "large", "to": "xl" }
  ],
  "rollback_token": "rb_01HZX7K9P8V2T4R5W6N8Q3M1B7"
}
```

Result values: `applied`, `applied_with_substitution`, `rejected_validation`, `rejected_policy`, `rejected_confirm_timeout`, `rejected_user`, `rejected_rate_limit`, `error_internal`.

## Confirmation UX contract

When a command needs user confirmation:

- Render a focused confirm card with the change summary, the agent's `user_intent_summary`, and two buttons: **OK** (default focus) and **Cancel**.
- Mom Mode: confirm card uses Mom font scale (≥ 1.35), audio feedback chime, and a 10s timeout instead of 5s.
- The card must show a one-line "what this changes" string derived from the diff, never raw JSON.
- Timeout = automatic reject. Audit result = `rejected_confirm_timeout`.

## Rate limits

| Scope | Default | Hard cap |
|---|---|---|
| Per agent | 30 commands / minute | 60 |
| Per profile | 60 commands / minute | 120 |
| Confirm-required commands per agent | 6 / minute | 12 |
| `rollback_last_command` | 5 / minute | 10 |

Exceeding the cap → `rejected_rate_limit`. Limits are enforced in the router before validation.

## Forbidden operations (router rejects unconditionally)

- Any action not on the allowlist above.
- Any field that attempts to set `renderer_tier`, `performance_tier`, `enhanced_mode`, `baseline_mode`, or any equivalent.
- Any field containing a URL, IP, hostname, credential, token, or secret.
- Any field containing `<script>`, `javascript:`, `data:`, `vbscript:` substrings.
- Any field whose serialized size exceeds 8 KB.
- Any envelope with `dry_run: true` whose action is `acknowledge_user_confirm` or `reject_user_confirm`.

## Test/proof requirements

For each action on the allowlist:

1. A passing-case test that produces a deterministic diff.
2. A failing-case test that proves rejection with the expected `result` code.
3. A Mom Mode policy test (where applicable).
4. A tier-substitution test for actions that depend on tier (e.g. `update_background_pack` enhanced-only pack on baseline tier must substitute).
5. A round-trip test for `rollback_last_command`.

Artifacts land under `proof/agent-commands/tests/<action>/*`.

## Settings, updates & performance actions

Agent-safe actions for cache management, soft refresh, version inspection, and performance toggles. All envelope, allowlist, validation, audit, and rate-limit rules already established in this document apply.

### QN vs UN tier rule (binding for this schema)

`QN`-prefix TVs default to enhanced rendering and must not be artificially capped to baseline. Commands that would **permanently** downgrade a `QN`-class TV — enabling low-memory mode, shrinking caches, or downgrading animation/background below the enhanced default — are rejected at the policy stage with `result: "rejected_policy"` before the confirm gate. Commands for **temporary** protective adjustments from agents are allowed when a measured runtime health condition requires it; these must include `temporary: true`, a `reason` string, a `timeout_seconds` value, and `rollback_on_timeout: true`, and must revert automatically when the timeout elapses.

`UN`-prefix TVs receive all performance management commands normally.

### New action allowlist additions

| Action | Purpose | Confirm | Notes |
|---|---|---|---|
| `clear_ui_cache` | Drop compiled layout state, focus maps, overlay surfaces. | required | Non-destructive to user data |
| `clear_image_cache` | Drop poster/hero/logo/thumbnail bitmaps. | required | Non-destructive to user data |
| `clear_preview_cache` | Drop backend-generated preview clips and contact-sheets. | required | Non-destructive to user data |
| `clear_catalog_cache` | Drop cached catalog/EPG/quality snapshot. | required | Non-destructive to user data |
| `soft_refresh_catalog` | Re-pull catalog/EPG/quality from backend with backup-and-swap. | optional | Rollback on validation failure |
| `soft_refresh_theme_layout` | Re-pull theme + layout manifests with validation. | optional | Rollback on validation failure |
| `reload_app_shell` | Full app reload without reinstall; all user data survives. | required | |
| `set_low_memory_mode` | `true`/`false`. **Rejected on `QN`-prefix (enhanced) TVs.** `UN`-prefix baseline TVs only. | optional | |
| `set_animation_density` | `off`/`low`/`medium`/`high`. Agents cannot set below enhanced default on enhanced tier. | optional | |
| `set_background_intensity` | `static`/`slow_fade`/`motion`/`cinematic`. Agents cannot set below enhanced default on enhanced tier. | optional | |
| `set_preview_cache_size` | `small`/`medium`/`large`. Agents cannot drop below `large` on enhanced tier. | optional | |
| `set_poster_cache_size` | `small`/`medium`/`large`. Agents cannot drop below `large` on enhanced tier. | optional | |
| `get_versions` | Read-only: backend build ID, UI bundle version, schema version, renderer tier, last refresh time. | n/a | |
| `rollback_last_update` | Roll back the last backend-pushed catalog/theme/layout update (separate from `rollback_last_command`). | required | |

### Enhanced-tier (`QN`-prefix) non-limiting policy

When the active TV's renderer tier is `enhanced`, the router rejects these commands with `result: "rejected_policy"` before the confirm gate:

- `set_low_memory_mode` with `value: true`
- `set_animation_density` with value below `medium`
- `set_background_intensity` with value below `motion`
- `set_preview_cache_size` with value other than `large`
- `set_poster_cache_size` with value other than `large`

Exceptions:

- Commands with `issued_by.agent_role: "system_user_settings"` (user manually adjusting in the Settings overlay) are always allowed — users may personally lower their own settings, including choosing Battery, Quiet, Reduced Motion, or Safe Mode.
- Temporary protective commands from any agent role are allowed when a measured runtime health condition requires it. These commands must include `temporary: true`, a `reason` string, a `timeout_seconds` value (max 1800), and `rollback_on_timeout: true`. The router enforces the rollback when the timeout elapses. Such commands must surface in the UI as a dismissible status chip showing the reason and remaining time.

### Canonical schema: `clear_image_cache`

```json
{
  "$id": "hermestv.ui.v1/commands/clear_image_cache.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["reason"],
  "properties": {
    "reason": { "type": "string", "minLength": 8 }
  }
}
```

All `clear_*_cache` actions share this shape. Clearing a cache never deletes user data.

### Canonical schema: `get_versions`

```json
{
  "$id": "hermestv.ui.v1/commands/get_versions.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {}
}
```

Returns:

```json
{
  "backend_build_id": "hermes-bk-2026.05.17.b34",
  "ui_bundle_version": "1.0.0+a8c4d12",
  "schema_version": "hermestv.ui.v1",
  "renderer_tier": "enhanced",
  "tv_model_at_boot": "QN85Q7FAAFXZA",
  "last_refresh_time": "2026-05-17T20:39:08.412Z"
}
```

### Hard guarantee for cache clears

The router ensures every `clear_*_cache` is non-destructive to: profiles, memories, provider credentials, favorites, watch history, reminders, layout presets, theme defaults, and background defaults. Cache surfaces hold no user data by design. The router writes `data_invariant_check: "passed"` to the audit entry; a failure is treated as `error_internal` with immediate rollback.

### Forbidden data-destructive actions (permanently excluded)

Not on the allowlist. Never will be:

- `clear_profile`, `clear_memories`, `clear_credentials`, `clear_watch_history`, `clear_favorites`, `clear_reminders`, `delete_profile`, `wipe_app`
- Any action whose name contains `delete`, `wipe`, `purge`, `destroy`, or `reset_all`

User-driven deletion of profiles, memories, credentials, watch history, or favorites is handled in Settings → Profile / Privacy with its own confirm UX — never via agent command.

### Proof gates added for this contract

1. **Update propagation end-to-end:** push a small theme + layout change; confirm `get_versions` reports a new `backend_build_id` on both TVs and visible state matches. Artifact: `proof/update-propagation/<id>/{dave,mom}.{json,png}`.
2. **Cache clear non-destructiveness:** snapshot user data before/after each `clear_*_cache`; diff must be empty for all 4 caches. Artifact: `proof/agent-commands/tests/clear_*/{before,after,diff}.json`.
3. **QN non-limiting policy enforcement:** issue each of the 5 enhanced-tier limit commands from an agent against a `QN`-class TV; confirm each is `rejected_policy` before any side effect. Artifact: `proof/agent-commands/tests/qn-non-limiting/<attempt>.json`.
4. **Dave 30-min router health:** 30-minute session on `UN55CU8000BXZA`; confirm rate-limit caps not tripped under normal use; no `error_internal` entries in the ledger. Artifact: `proof/perf/dave-30min-router/<session_id>.json`.
5. **Rollback after broken update:** push an invalid theme manifest; confirm `rollback_last_update` restores the prior theme with `result: "applied"`. Artifact: `proof/rollback/update-<id>.json`.
6. **Forbidden action rejection:** attempt `clear_profile`, `wipe_app`, `delete_profile`, and 3 name-pattern variants; each must return `rejected_validation` before any side effect. Artifact: `proof/agent-commands/tests/forbidden/<action>.json`.

## Out of scope for v1

- Programmable command sequences (no "macros" or scripting in v1).
- Cross-profile bulk operations (one profile per command).
- Network-side commands (anything that reaches the backend stack goes through a different contract, not this one).
- Tier overrides — automatic only, see `docs/05`.

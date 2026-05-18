# schemas/

JSON Schema definitions for HermesTV data contracts.

All schemas are draft-07 compliant. They are the source of truth for:
- API request/response validation
- UI command validation (before any side effect runs)
- Provider catalog item shape
- Theme and layout preset format

## Files

| Schema | Purpose |
|---|---|
| `ui-command.schema.json` | Safe agent/chatbot JSON command envelope (doc 06) |
| `provider.profile.schema.json` | TV-safe provider summary returned to the app |
| `provider.capabilities.schema.json` | Provider capability flags from backend probe |
| `provider.session.schema.json` | Active stream session record (no credentials) |
| `theme-manifest.schema.json` | Theme definition (24 themes, doc 05) |
| `layout-preset.schema.json` | Layout preset definition (12 presets, doc 04) |

## Rules

- Schemas must never include fields that could carry credentials, M3U URLs, Xtream tokens, or portal URLs.
- Every schema change must be reviewed against the relevant contract doc.
- The Tizen/web TV app validates all inbound API responses against these schemas before rendering.

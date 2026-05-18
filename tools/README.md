# tools/

Developer and operator tooling for HermesTV.

## Planned tools

- `secret-scan.sh` — runs trufflehog/gitleaks against the repo; must return zero verified secrets
- `schema-validate.js` — validates mock and live catalog data against schemas/
- `wgt-inspect.sh` — unpacks a .wgt file and checks for credentials before sideload
- `epg-fuzzy-test.js` — unit tests for the EPG fuzzy-match pipeline (doc 12)
- `tier-detect-test.js` — verifies capabilities.js model detection for QN85/UN55CU8000

## Rules

- Tools must not read from `G:\private\` or display credential values
- Tools may reference vault paths in error messages but never their contents

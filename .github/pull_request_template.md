<!--
DaveTV — Pull Request template.
Keep it short. The reviewer is the operator; the audience is also future-you.
-->

## Summary

<!-- 1-3 sentences. What changed and why. -->

## Scope

- [ ] Spec exists or change is small enough to not need one
- [ ] Plan/tasks were followed for non-trivial work
- [ ] Repo-only change (no VPS contact)
- [ ] No `.env*` file added, modified, or staged
- [ ] No provider credentials (Apollo, XtremeHD, Azure TTS, etc.) in the diff
- [ ] No `docker compose`, `apt`, or remote SSH commands executed for this PR
- [ ] No deploy artifacts shipped (Tizen `.wgt`, Caddy/nginx live configs)
- [ ] No fake/mocked/placeholder/stub production behavior added
- [ ] User-visible DaveTV behavior is real or honestly blocked/empty

## Test plan

- [ ] `npm run build:web` — Vite build green
- [ ] `npm run validate:schemas` — reports `61 PASS, 0 FAIL`
- [ ] `npm run test:chatbot` — reports `40 PASS, 0 FAIL` (API running on :3001)
- [ ] CI is green on this PR (schema-validation, web-build, chatbot-integration, secret-scan)

Optional, if the change touches them:

- [ ] `npm run test:layouts` — Playwright suite green (local only; not in CI yet)
- [ ] Manual Mom-Mode visual check (font scale >= 1.25, large tiles)
- [ ] Manual smoke on QN85 mirror over LAN

## Secret-safety audit

- [ ] I reviewed `git diff main...HEAD` for high-entropy strings, M3U/Xtream/Apollo URLs, and `*_API_KEY=` assignments
- [ ] I ran `npm run audit:secrets` (or equivalent grep scan) locally with zero matches
- [ ] No mock data was replaced with real-credential data

## Out of scope for this PR

<!-- List anything intentionally deferred so the reviewer knows it is not missing. -->

---

_Generated against branch:_ `<source-branch>` &nbsp;|&nbsp; _Target:_ `main`

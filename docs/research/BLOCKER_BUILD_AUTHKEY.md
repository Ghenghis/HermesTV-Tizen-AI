# BLOCKER — Tizen Build Authkey Required

**Created:** 2026-05-17
**Lane:** 02 — Tizen Build/Deploy Gaps

---

## What Is Blocked

- Running `sign-and-deploy.sh` against a real Samsung TV
- Packaging a signed `.wgt` file for sideloading
- Any on-device install or Samsung store submission

---

## What Is Required

1. **Samsung Developer Account** — register at https://developer.samsung.com
2. **Tizen Studio** — install the full Tizen Studio IDE or CLI tools (`tizen` + `sdb` in PATH)
3. **Certificate Profile** — create a profile named `HermesTV` using Tizen Studio Certificate Manager:
   - Go to Tools > Certificate Manager
   - Create a new Samsung Certificate (Author + Distributor)
   - Name the profile `HermesTV`
   - The resulting `.authkey`, `.p12`, and profile config are stored in `~/.tizen-studio-data/profile/profiles.xml`
4. **TV Developer Mode** — on the Samsung TV:
   - Settings > Support > About Smart TV > Software Information
   - Click Build Number 5 times to enable Developer Mode
   - Set the development PC IP in the Developer Mode screen

---

## Where Credentials Must NOT Go

- Never commit `.authkey`, `.p12`, `.pfx`, or `profiles.xml` to git
- Never put authkey in `apps/tizen-hermes-tv/scripts/`
- The `.tizen/` directory is git-ignored — use that local directory only

---

## Non-Blocking for B2

This blocker does NOT block the B2 local mock demo. The web app (`apps/hermes-web-tv`) runs in any browser. The Tizen build is only required for actual TV deployment in B3+.

---

## Resolution

When the Samsung developer account and Tizen Studio are set up:
1. Run `tizen certificate` CLI to create the profile
2. Place results in `apps/tizen-hermes-tv/.tizen/` (git-ignored)
3. Test with `npm run sign` or direct `sign-and-deploy.sh <TV_IP>`

# VPS Change Log — HermesTV-only conversion (Template)

> This file is populated by the operator during PHASE 2 and PHASE 3 of the VPS isolation procedure.
> See: `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — PHASE 2 Step 2c
>
> All public IPs replaced with [VPS_PUBLIC_IP].
> All Tailscale IPs replaced with [VPS_TAILSCALE_IP].
> All tokens/passwords replaced with [REDACTED].
> Do not commit real values.

---

**Date:** _fill in_
**Operator:** _fill in_
**Approval reference:** _describe how shutdown plan was reviewed and approved_

---

## Services stopped (non-destructive — data and config intact)

| Service / Container | Was running | Image / Binary | Stopped at (UTC) | Rollback command |
|---|---|---|---|---|
| _example: nginx_ | _serving daveai.tech_ | _nginx:1.25_ | _2026-05-17T22:00:00Z_ | `systemctl start nginx` |

---

## Services retained

| Service / Container | Classification | Role |
|---|---|---|
| _example: tailscaled_ | NEVER_TOUCH_SYSTEM_CRITICAL | Tailscale mesh VPN |
| _example: sshd_ | NEVER_TOUCH_SYSTEM_CRITICAL | Remote access |

---

## Services classified UNKNOWN (not touched)

| Service / Container | Reason for UNKNOWN | Action required |
|---|---|---|
| _example: some-mystery-container_ | _Unknown project ownership_ | _Operator must identify and decide_ |

---

## Phase 3 verification results

```
docker ps output after stop:
_paste here_

ss -tulpn after stop:
_paste here_

tailscale status:
_paste here_

systemctl is-active sshd:
_paste here_
```

---

**Gate status:**
- [ ] VPS-AUDIT-04: No destructive commands used
- [ ] VPS-AUDIT-05: After inventory shows HermesTV-only active
- [ ] VPS-AUDIT-06: Rollback commands documented for all stopped services
- [ ] VPS-AUDIT-07: SSH and Tailscale preserved
- [ ] VPS-AUDIT-08: No secrets in any audit file

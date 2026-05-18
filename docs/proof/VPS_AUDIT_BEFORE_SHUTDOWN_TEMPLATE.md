# VPS Audit — Before Shutdown (Template)

> This file is populated by the operator during PHASE 1 of the VPS isolation procedure.
> See: `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — PHASE 1
>
> All public IPs replaced with [VPS_PUBLIC_IP].
> All Tailscale IPs replaced with [VPS_TAILSCALE_IP].
> All tokens/passwords replaced with [REDACTED].
> Do not commit real values.

---

**Date:** _fill in_
**Operator:** _fill in_
**Gate:** VPS-AUDIT-01 — inventory captured before any stop command

---

## Hostname

```
_paste output of: hostname
```

## Uptime

```
_paste output of: uptime
```

## OS

```
_paste output of: cat /etc/os-release
```

## Public IP

```
[VPS_PUBLIC_IP]
```

## Tailscale IP

```
[VPS_TAILSCALE_IP]
```

## Disk

```
_paste output of: df -h
```

## Memory

```
_paste output of: free -h
```

## Top 20 processes (memory)

```
_paste output of: ps aux --sort=-%mem | head -21
```

## Top 20 processes (CPU)

```
_paste output of: ps aux --sort=-%cpu | head -21
```

## Docker containers (docker ps -a)

```
_paste table output here
```

## Docker Compose projects

```
_paste output of: docker compose ls
```

## Docker networks

```
_paste output of: docker network ls
```

## Docker volumes

```
_paste output of: docker volume ls
```

## Listening ports (ss -tulpn)

```
_paste output here — redact any IP/port that reveals private infrastructure
```

## Systemd running services

```
_paste output of: systemctl --type=service --state=running --no-pager
```

## Nginx / Caddy / Apache status

```
_paste is-active results
```

## UFW / iptables status

```
_paste ufw status verbose output
```

## Root crontab

```
_paste crontab -l output (redact any tokens in cron commands)
```

---

**Audit-01 gate status:** [ ] PASS — inventory complete, no stops executed yet

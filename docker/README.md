# docker/

Docker Compose files for HermesTV deployment.

## Structure (planned)

```
docker/
  workstation/
    compose.yml       — heavy services: Jellyfin, Tunarr, Dispatcharr, Open WebUI, Pipelines, Ollama, ffprobe
    .env.example      — placeholder env vars (no real credentials)
  vps/
    compose.yml       — lightweight services: Postgres, Redis, Caddy, HermesTV API gateway
    Caddyfile         — Tailscale-only routes, no public IPTV endpoints
    .env.example      — placeholder env vars (no real credentials)
```

## Rules

- `.env.example` files use `REPLACE_WITH_OPERATOR_VALUE` placeholders only
- Real `.env` files are in `G:\private\` and are never committed
- VPS Docker Compose project name: `hermestv-vps`
- Workstation Docker Compose project name: `hermestv-workstation`
- The two projects must never share a Docker network

## See also

- `docs/08_BACKEND_STACK_CONTRACT.md` — full workstation stack spec
- `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — VPS isolation rules and compose.yml

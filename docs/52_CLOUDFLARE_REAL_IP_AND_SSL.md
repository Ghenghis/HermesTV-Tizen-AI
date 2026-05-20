# 52 - Cloudflare Real IP And SSL For DaveTV

## Status

Cloudflare DNS for `tv.daveai.tech` is correct when it is:

- Type: `A`
- Name: `tv`
- Content: VPS IPv4
- Proxy status: Proxied

The same setup can exist for `iptv.daveai.tech`, but DaveTV should use
`tv.daveai.tech` as the canonical app hostname.

## Real Visitor IPs

Host nginx should trust `CF-Connecting-IP` only from Cloudflare edge IP ranges.
Do not use `set_real_ip_from 0.0.0.0/0`; that lets any direct request spoof the
visitor IP.

Install the repo template on the VPS:

```sh
cd /home/operator/hermestv
sudo cp upstream/nginx/cloudflare-real-ip.conf.example /etc/nginx/cloudflare-real-ip.conf
sudo grep -q 'cloudflare-real-ip.conf' /etc/nginx/sites-available/hermestv.daveai.tech \
  || sudo sed -i '/server_name tv.daveai.tech hermestv.daveai.tech;/a\\    include /etc/nginx/cloudflare-real-ip.conf;' /etc/nginx/sites-available/hermestv.daveai.tech
sudo nginx -t
sudo systemctl reload nginx
```

After reload, `$remote_addr` and `X-Real-IP` should resolve to the real visitor
IP for Cloudflare-proxied requests.

## SSL Mode

The Cloudflare screenshot shows **Full (Strict)**. That is good only if host
nginx has a valid certificate for `tv.daveai.tech` / `hermestv.daveai.tech` and
serves HTTPS on port 443.

Use one of these modes, not a half-state:

- **Full (Strict):** preferred. Requires a valid Let's Encrypt or Cloudflare
  Origin CA certificate on the VPS nginx 443 server block.
- **Flexible:** only if the origin is intentionally HTTP-only. This avoids an
  origin certificate, but Cloudflare-to-origin traffic is not encrypted.

If `Full (Strict)` is enabled before nginx has a valid origin certificate for
the hostname, Cloudflare can return 525/526 SSL errors even when DNS is correct.

## Deploy Blocker

The GitHub Actions VPS deploy currently stops before rebuild until the private
VPS file `/home/operator/hermestv/.env` contains:

```env
DAVETV_AUTH_REQUIRED=true
DAVETV_AUTH_ENFORCE_API=true
DAVETV_PUBLIC_APP_URL=https://tv.daveai.tech
DAVETV_ADMIN_EMAIL=<Dave real email>
DAVETV_ADMIN_PASSWORD=<Dave private password>
```

These values stay on the VPS only. Never commit them.

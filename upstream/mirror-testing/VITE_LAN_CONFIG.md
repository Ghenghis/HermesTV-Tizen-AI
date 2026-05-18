# Vite LAN Config — HermesTV Mirror Testing

Quick reference for exposing the dev server to the QN85 over the local network.

---

## Current state — nothing to change

`apps/hermes-web-tv/vite.config.js` already binds to all interfaces:

```js
server: { host: '0.0.0.0', port: 5173 }
```

`apps/hermes-web-tv/package.json` dev script already passes the flag explicitly:

```json
"dev": "vite --host 0.0.0.0 --port 5173"
```

Both lines are present. Do not add `--host` a second time — it is already there.

---

## If you ever need to revert or reconfigure

To bind only to localhost (block LAN access):

```json
"dev": "vite --port 5173"
```

To restore LAN access:

```json
"dev": "vite --host 0.0.0.0 --port 5173"
```

Or use the `vite.config.js` `server.host` field — whichever is present takes effect.
If both are set, the CLI flag wins.

---

## Find the workstation LAN IP

```powershell
ipconfig | Select-String "IPv4"
```

Look for the address on the adapter connected to your home router — typically
`192.168.1.x` or `10.0.0.x`. This is what you type into the QN85 browser:

```
http://192.168.1.42:5173
```

Replace `192.168.1.42` with your actual address.

---

## Windows Defender firewall — allow port 5173 inbound

Run once in an elevated PowerShell window:

```powershell
New-NetFirewallRule `
  -DisplayName "HermesTV Vite dev (5173)" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 5173 `
  -Action Allow `
  -Profile Private
```

To confirm the rule is active:

```powershell
Get-NetFirewallRule -DisplayName "HermesTV Vite dev (5173)" | Select-Object Enabled, Action
```

Expected output: `Enabled: True  Action: Allow`

---

## Samsung Internet browser quirks

| Quirk | Detail |
|---|---|
| `100vh` includes browser chrome | Use `dvh` with a `vh` fallback, or measure with JS. The address bar eats ~56 px on first load. |
| Touch + pointer coexist | Samsung Internet fires both touch and pointer events. Do not cancel one in a handler that expects the other. |
| Input event ordering | `keydown` fires for remote keypresses; `click` fires for Enter/OK on a focused element. Test both paths. |
| `-webkit-` prefixes required | `backdrop-filter`, `text-size-adjust`, and `mask` all need the `-webkit-` prefix on Tizen 6.5. |
| `position: sticky` inside overflow containers | Broken in the Chromium 76-era engine. Use `position: fixed` with scroll offset JS as a fallback. |

---

## Confirming the TV receives the bundle

After opening the URL on the QN85, open Samsung Remote Web Inspector from Chrome on the
workstation (`chrome://inspect/#devices`, add `<tv-ip>:9998` as a network target). The
Network panel will show the Vite HMR websocket connecting — this confirms the TV is live
on the same dev server instance as Chrome.

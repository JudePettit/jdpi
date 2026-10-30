# Vitruvian Manager bridge

A tiny local relay that lets the **Vitruvian Manager SIGINT Dashboard** (`https://jdpi.pages.dev/sigint/`) read receivers on your own
network, the public aircraft feed, and aisstream.io. One file, `prp-bridge.mjs`, no dependencies.

## Why it exists

- **CORS.** A web page may read another server's data only if that server says so. Most receiver software (readsb,
  dump1090-fa, OpenWebRX) doesn't; AIS-catcher's `/api/ships.json` and Meshtastic's `/json/nodes` do. adsb.lol's public
  API and OpenSky don't either.
- **Mixed content.** An HTTPS page may not load plain-HTTP addresses on the internet, and Firefox and Safari also block
  plain-HTTP addresses on your network. `http://localhost` is the exception every browser allows.
- **Local Network Access.** Since Chrome and Edge 142, a public website must ask before it reaches your network or
  "apps on this device". The bridge doesn't avoid that prompt; allow it once for `jdpi.pages.dev`.
- **aisstream.io** forbids direct browser connections, so the bridge holds the WebSocket and your key on your computer.

The bridge answers on `localhost` only, fetches the targets you name, and returns them with
`Access-Control-Allow-Origin` (for allowed origins) and `Access-Control-Allow-Private-Network: true` on preflights.

## Run it

Node.js 18 or newer (22 or newer for aisstream.io, which needs the built-in WebSocket). Run it on the **same computer as
your browser**; the receivers can be anywhere on your network.

```
node prp-bridge.mjs \
  --route adsb=http://raspberrypi.local/tar1090/data/aircraft.json \
  --route ais=http://raspberrypi.local:8100/api/ships.json \
  --route mesh=http://meshtastic.local/json/nodes \
  --route owrx=http://raspberrypi.local:8073/status.json
```

On Windows PowerShell put it on one line (or end lines with a backtick). The Overview tab in the dashboard builds this
command from your own settings. Then, in the dashboard: **Overview → Connect your own receivers → Use the Vitruvian Manager bridge**,
and tick **Through the bridge** in each tab that should use it.

| Option | Meaning |
|---|---|
| `--port 8790` | Port on localhost (default 8790). |
| `--route name=URL` | Relay `GET /local/name` to that URL. Repeat for each receiver. Without any, four defaults on localhost are used. |
| `--origin URL` | Allow another web origin (defaults: `https://jdpi.pages.dev`, `http://localhost:*`, `http://127.0.0.1:*`). |
| `--config file.json` | `{ "port": 8790, "routes": { "adsb": "…" }, "origins": [], "public": true }` |
| `--no-public` | Turn off the public relays (adsb.lol, OpenSky). |
| `--quiet` | No request log. |
| `AISSTREAM_API_KEY` | Environment variable with your aisstream.io key (or let the Ships tab send it). |

## Endpoints

| Path | Does |
|---|---|
| `/health` | Name, version, routes (with credentials and query strings hidden), whether an aisstream key is set. |
| `/local/{name}` | GET the configured target. Read-only; nothing else on your network is reachable. |
| `/public/adsb.lol/v2/point/{lat}/{lon}/{nm}` | adsb.lol aircraft within `nm` (≤ 250) nautical miles. At most one upstream request a second, cached 5 s. adsb.lol allows about 500 requests a day per address. |
| `/public/opensky/states?lamin&lomin&lamax&lomax` | OpenSky state vectors in a box, anonymous (about 400 requests a day). Cached 10 s. |
| `/aisstream/ships.json?bbox=s,w,n,e` | Ships seen in the box since the page started asking. Opens one aisstream.io WebSocket, re-subscribes when the box changes (at most once a second), and closes two minutes after the page stops asking. |

## Security

- Listens on `127.0.0.1` and `::1` only; requests whose `Host` isn't `localhost:PORT` get 421 (a DNS-rebinding guard).
- Browser requests from origins not on the allow-list get 403. Tools without an `Origin` (curl) are allowed, as for any
  local service.
- GET, HEAD and OPTIONS only. Routes are fixed targets: the page can't make the bridge fetch an arbitrary address.
- The aisstream key is never logged and is sent only to aisstream.io.

## Troubleshooting

- **403 in the browser console:** your page's origin isn't allowed; add `--origin https://your.site`.
- **The dashboard says "Not reachable":** is the bridge running, on the same port, and did you allow local network
  access in Chrome or Edge (site settings → "Local network access" / "Apps on device")?
- **`Port 8790 is in use`:** start it with `--port 8791` and change the address in the dashboard.
- **502 from `/local/…`:** the bridge couldn't reach the receiver. Check the URL in a browser on the same computer.
- **aisstream.io "closed the connection straight after the subscription":** the key is wrong or revoked.

## Keep it running (optional)

Linux (systemd user service, `~/.config/systemd/user/prp-bridge.service`):

```
[Unit]
Description=Vitruvian Manager bridge
[Service]
ExecStart=/usr/bin/node /home/you/prp-bridge.mjs --config /home/you/prp-bridge.json
Restart=on-failure
[Install]
WantedBy=default.target
```

then `systemctl --user enable --now prp-bridge`. On Windows, a Task Scheduler task "At log on" running
`node C:\path\prp-bridge.mjs --config C:\path\prp-bridge.json` does the same.

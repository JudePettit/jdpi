# Vitruvian Manager bridge

A tiny local relay that lets the **Vitruvian Manager SIGINT Dashboard** (`https://jdpi.pages.dev/sigint/`) read receivers on your own
network, the public aircraft feed, and aisstream.io. One file, `prp-bridge.mjs`, no dependencies.

Started with `--iot`, it is also the home of **IoT Connect** (Digital Science, `https://jdpi.pages.dev/digital/iot-connect/`):
your own smart devices on your own home network, **Hermes Messenger**, the UNS link to an MQTT broker you run, and (with
`--lan`) the phone remote on your Wi-Fi. See [IoT Connect](#iot-connect-off-unless---iot) below. Without `--iot` none of
it runs and the SIGINT side works exactly as before.

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
| `--port 8790` | Port on localhost (default 8790). IoT Connect needs 8790: its page's security policy lets it call that port only. |
| `--route name=URL` | Relay `GET /local/name` to that URL. Repeat for each receiver. Without any, four defaults on localhost are used. |
| `--origin URL` | Allow another web origin (defaults: `https://jdpi.pages.dev`, `http://localhost:*`, `http://127.0.0.1:*`). |
| `--config file.json` | `{ "port": 8790, "routes": { "adsb": "…" }, "origins": [], "public": true }` |
| `--no-public` | Turn off the public relays (adsb.lol, OpenSky). |
| `--quiet` | No request log. |
| `AISSTREAM_API_KEY` | Environment variable with your aisstream.io key (or let the Ships tab send it). |
| `--iot` | Switch on IoT Connect (below). Setup steps then ask **Y** in this window, so start it from a terminal. |
| `--iot-origin URL` | Allow another page origin for `/iot/*`: an exact origin, no wildcard, no path. The default is `https://jdpi.pages.dev` only. |
| `--state FILE` | Where IoT Connect keeps its devices and keys. Default `%APPDATA%\VM\bridge\iot-state.json` (Windows) or `~/.config/vm/bridge/iot-state.json`. Refused inside a git working tree, this bridge's own folder or OneDrive. |
| `--lan` | Also serve the phone remote on `iot.lan.address`, port 8791, plain HTTP on your Wi-Fi. Implies `--iot`. Only you can switch this on; the page cannot. |
| `VM_HA_TOKEN`, `VM_MQTT_PASSWORD` | Environment variables: a Home Assistant token and the broker password, instead of the state file. MQTT sends a password only with a user name, so `VM_MQTT_PASSWORD` needs `broker.username` in the config file. |
| `VM_AI_KEY`, `VM_AI_URL`, `VM_AI_MODEL` | Environment variables for Hermes's optional AI question (`VM_AI_URL` must be `https://`; also needs `"ai": { "enabled": true }` in the config file). |

## Endpoints

| Path | Does |
|---|---|
| `/health` | Name, version, `features` (`["iot-1"]`: this bridge knows IoT Connect), routes (with credentials and query strings hidden), whether an aisstream key is set, and `iot.enabled`. |
| `/local/{name}` | GET the configured target. Read-only; nothing else on your network is reachable. |
| `/public/adsb.lol/v2/point/{lat}/{lon}/{nm}` | adsb.lol aircraft within `nm` (≤ 250) nautical miles. At most one upstream request a second, cached 5 s. adsb.lol allows about 500 requests a day per address. |
| `/public/opensky/states?lamin&lomin&lamax&lomax` | OpenSky state vectors in a box, anonymous (about 400 requests a day). Cached 10 s. |
| `/aisstream/ships.json?bbox=s,w,n,e` | Ships seen in the box since the page started asking. Opens one aisstream.io WebSocket, re-subscribes when the box changes (at most once a second), and closes two minutes after the page stops asking. |

## Security

- Listens on `127.0.0.1` and `::1` only; requests whose `Host` isn't `localhost:PORT` get 421 (a DNS-rebinding guard).
- Browser requests from origins not on the allow-list get 403. Tools without an `Origin` (curl) are allowed, as for any
  local service.
- GET, HEAD and OPTIONS only (IoT Connect's `/iot/*` adds JSON POSTs, under its own rules above). Routes are fixed
  targets: the page can't make the bridge fetch an arbitrary address.
- The aisstream key is never logged and is sent only to aisstream.io.

## IoT Connect (off unless `--iot`)

IoT Connect is for **your own devices on your own home network**. The bridge finds devices by sending each kind's
standard discovery question and listening for answers, or by reading one address you type; it never tries other
addresses or ports. It connects only as each maker documents, asks you to confirm on the device and in this window,
and never guesses passwords. Using someone else's device without permission can be an offence (UK Computer Misuse Act
1990; Ireland's Criminal Justice (Offences Relating to Information Systems) Act 2017).

### The config file's `iot` block

Written by you; the bridge only reads it, and the page can change none of it.

```json
{ "port": 8790, "iot": { "enabled": true, "origins": [], "interface": "Wi-Fi",
  "state": "C:/Users/<you>/AppData/Roaming/VM/bridge/iot-state.json",
  "lan": { "address": "192.168.1.20", "port": 8791 },
  "homeAssistant": { "url": "http://homeassistant.local:8123" },
  "broker": { "url": "ws://192.168.1.20:9001", "username": "vm", "site": "home", "json": true,
    "sparkplug": false, "group": "VM", "edgeNode": "hermes", "acceptCommands": false },
  "hue": { "rootCA": "C:/path/to/signify-root.pem" },
  "volumeCeiling": 80,
  "ai": { "enabled": false } } }
```

| Key | Meaning |
|---|---|
| `interface` | Your home connection's name as Windows shows it (`Get-NetAdapter`), such as `"Wi-Fi"`. Devices must have a private address in a subnet of this connection and of no other (a VPN, WSL, Hyper-V); discovery sockets bind to it. |
| `origins` | Extra page origins for `/iot/*`, exact (no `localhost` wildcard). |
| `lan.address`, `lan.port` | Where `--lan` listens: one private IPv4 address of `interface` (never `0.0.0.0`); port 8791 by default, and never the bridge's own port (checked only when `--lan` is given). Refused when Windows marks the network Public. |
| `homeAssistant.url` | Your Home Assistant. A new address deletes the stored token and ticks. |
| `broker` | Your MQTT broker (`mqtt://`, `mqtts://`, `ws://` or `wss://`). `json` (on by default) publishes the plain-JSON tree; `sparkplug: true` adds the Sparkplug B node; `acceptCommands: true` lets the broker send simple commands (power, toggle, brightness, colour, colour temperature, volume, mute, play, pause, stop: never an address to play, a key, an app or a Home Assistant service). |
| `hue.rootCA` | Signify's root certificate, if you have it. Without it the bridge remembers the Hue bridge's certificate at pairing and refuses a different one. |
| `volumeCeiling` | The ceiling each new device starts with: the highest volume it is sent (0–100, default 80; each device can then go lower, or higher after Y here). Vol + is held to it too: an LG TV's volume is read first, and Roku and Samsung TVs, whose volume VM cannot read, get no Vol + unless that TV's ceiling is 100. |
| `ai.enabled` | Hermes's optional AI question about an unknown device; also needs `VM_AI_KEY` and an `https://` `VM_AI_URL`. |

### What the bridge does

- **Discovery** (only when the page's "Look for devices" is clicked): SSDP `M-SEARCH` for `MediaRenderer:1`,
  `ZonePlayer:1` and `roku:ecp` (never `ssdp:all`), one-shot mDNS questions for Hue, LIFX, Shelly, Google Cast,
  AirPlay, Home Assistant and MQTT, Yeelight's `M-SEARCH` on 1982, WiZ's `registration` (with `register: false`) and
  LIFX's `GetService`, each from an ephemeral port on your home interface, listening 3 seconds. The passive listener
  on port 1900 is optional: if Windows' own SSDP service holds the port, VM still asks and only stops overhearing.
  Answers from an address the bridge may not reach are dropped, and a description is read only from the address that
  answered. Allow Node on **Private networks** only when Windows asks.
- **A typed address** (Roku, Hue, Shelly, Tasmota, WiZ, LIFX, Sonos, Samsung): the port comes from the kind; one
  address at a time, at most 10 an hour, never a run of three neighbouring addresses, and every failure reads
  "No answer from that device."
- **Ownership.** A device is added only with the tick "This device is mine, or I have its owner's permission to control
  it" and **Y** here. More than 3 TVs, 10 players or 25 devices, or a Public Windows profile, means "This looks like a
  shared network": kinds that need no pairing then wait for "This is my own home network".
- **Hermes Messenger** names each answer from fixed rules: what it is, how its maker says to connect it, which route VM
  uses and what VM cannot do (Miracast, AirPlay, Google Cast, infrared, Bluetooth). Unknown DLNA players can be added
  as generic ones.
- **Commands** go only to added devices, through each protocol's fixed table: DLNA/UPnP AV (AVTransport and
  RenderingControl only), Sonos, Roku ECP (fixed keys and `/launch/<digits>`; off until you tick Roku's policy), Philips
  Hue CLIP v2, Shelly Gen2+ RPC, Tasmota `/cm`, WiZ, Yeelight, LIFX, LG webOS, Samsung Tizen and Home Assistant
  (`turn_on`/`turn_off`/`toggle` for lights and switches; play, pause, stop, volume, mute and power for media players;
  `remote.send_command` with the commands you listed). At most 2 power or colour changes a second and 60 a minute per
  device (extras collapse into the latest), Home Assistant lights and switches included; volume stops at the ceiling.
  A Shelly with a password answers HTTP 401 with a `WWW-Authenticate: Digest` challenge, which VM answers with an
  `Authorization: Digest` header (SHA-256, `POST:/rpc`), as Shelly documents. A Tasmota's password travels in the
  address of each request, so before each one VM checks the network card address this computer's neighbour table
  (`arp -a`, `ip neigh`) holds for it, and sends nothing if it is not the one paired.
- **The UNS link**: one connection to your broker. The JSON tree is retained JSON at `vm/<site>/<area>/<device>/state`
  and `vm/<site>/hermes/status` (`online`, or `offline` by the will; with Sparkplug also on, the status has its own
  small connection, client id ending `-s`, because MQTT allows one will per connection and the main one's is NDEATH).
  Two devices with the same name in one room get `-2`, `-3` on their topic. Sparkplug B: Hermes is edge node
  `spBv1.0/<group>/…/<edgeNode>`; NDEATH is the will (QoS 1) with `bdSeq`, NBIRTH repeats it with
  `Node Control/Rebirth = false`, each device has a DBIRTH, DDATA and DDEATH (metrics `Online`, `Power`, `Brightness`,
  `Volume`, `Playback`, `Kind`), `seq` runs 0–255, and a Rebirth is honoured at most every 10 seconds.
- **The phone remote** (`--lan`): see below.

### Endpoints (`/iot/*`, on `localhost:8790`)

Only `https://jdpi.pages.dev` and the origins in `iot.origins` may call them; a missing or `null` Origin gets 403.
GET only reads. Every change is a POST with `Content-Type` exactly `application/json` and a body of at most 16 KB.
Every answer is JSON with `ok`; a refusal is `{ "ok": false, "code": "…", "error": "plain English" }`.

| Method and path | Body | Answer |
|---|---|---|
| `GET /iot/status` | | `enabled`, `version`, `features`, `interface`, `policy`, `console` (whether this window can ask Y), `lan`, `homeAssistant` (`configured`, `url`, `tokenSet`, `ticked`), `broker`, `ai`, `network` (`shared`, `reasons`, `ownHome`, `words`), `policies.roku`, `devices`, `phones`, `now` |
| `GET /iot/devices` | | `devices`: device records without their secrets, with `paired` and the last `state` |
| `GET /iot/candidates` | | `candidates` (each with `known`, `label`, `canAdd`, `generic`, `announcement` and Hermes's `finding`), `network` |
| `GET /iot/hermes` | | `agent: "Hermes Messenger"`, `rules`, `findings` (Hub messages), `ai` |
| `GET /iot/uns` | | the broker link: `configured`, `connected`, `url` (no password, no query), `json`, `sparkplug`, `acceptCommands`, `site`, `group`, `edgeNode`, `bdSeq`, `seq`, `root`, `error`, `recent` (last 20 topics), `limits` |
| `GET /iot/phone` | | `phones` (id, name, address, created, expires, expired), `lan` |
| `GET /iot/ha/entities` | | Home Assistant's lights, switches, media players and remotes, each with `ticked` |
| `POST /iot/discover` | `{}` | `candidates`, `network` |
| `POST /iot/identify` | `{ "kind": "roku", "address": "192.168.1.31" }` | `candidate` |
| `POST /iot/add` | `{ "candidate", "owned": true, "name"?, "room"? }` | `device` (after Y) |
| `POST /iot/remove` | `{ "device" }` | `removed` (ids, with a Hue bridge's lights) |
| `POST /iot/device` | `{ "device", "name"?, "room"?, "volumeCeiling"? }` | `device` (raising the ceiling needs Y) |
| `POST /iot/pair` | `{ "device", "password"? }` | `device` (and `lights` for Hue); Hue, LG, Samsung, and Shelly or Tasmota with a password |
| `POST /iot/command` | `{ "v": 1, "id", "device", "action", "args"? }` | `{ "ok": true, "id", "state", "note"? }` |
| `POST /iot/state` | `{ "device" }` | `device`, `state` (one read) |
| `POST /iot/network` | `{ "ownHome": true \| false }` | `network` (true needs Y) |
| `POST /iot/policy` | `{ "roku": true \| false }` | `policies` (true needs Y) |
| `POST /iot/ha/token` | `{ "token" }` | `url`, `tokenSet` (after Y and one check against Home Assistant) |
| `POST /iot/ha/tick` | `{ "entity", "on", "commands"? }` | `entity`, `ticked`, `device` (on: true needs Y) |
| `POST /iot/hermes/ask` | `{ "candidate" }`, then `{ "candidate", "confirm" }` | first `preview` (`host`, the exact `text`) and `confirm`; then `finding` (source `ai`) |
| `POST /iot/phone/pair` | `{}` | `code` (6 digits, 2 minutes, 5 tries), `expiresAt`, `url` for the QR code. A GET is refused. |
| `POST /iot/phone/revoke` | `{ "phone" }` or `{ "all": true }` | `revoked` |

Actions and their arguments: `power {on}`, `toggle`, `brightness {level 0–100}`, `colour {hex "#rrggbb"}`,
`colour-temp {kelvin 2000–6500}`, `volume {level 0–ceiling}`, `mute {on}`, `play-url {url: http(s), at most 2 KB}`,
`play`, `pause`, `stop`, `seek {seconds}`, `key {name: Up, Down, Left, Right, OK, Back, Home, VolumeUp, VolumeDown,
Mute}`, `launch {app: Roku digits, or an LG app id}`, `ha {domain, service, entity, command?}`. Numbers are clamped;
unknown fields are refused. A device's `actions` lists what it takes.

Error `code`s: `bad-origin` (403), `wrong-type` (415), `too-large` (413), `bad-request` (400), `not-found` (404),
`iot-off` (404, the bridge was started without `--iot`), and for commands and setup `unsupported` (400),
`unknown-device` (404), `not-paired` (409), `moved` (409: a different device or certificate now answers, so it was sent
nothing), `refused` (403: not confirmed here, a guard, a policy), `rate-limited` (429) and `no-answer` (502).

### The phone remote (`--lan`)

Its own small server on `iot.lan.address:8791`, plain HTTP, answering only `/remote/*` (everything else, `/iot/*` and
`/local/*` included, is 404), only to `Host: <address>:8791`, with `Content-Security-Policy: default-src 'self';
frame-ancestors 'none'` and `X-Frame-Options: DENY`.

1. The Remote tab's "Pair a phone" makes a one-time six-digit code, shown on the page and in this window (never in a file).
2. The phone opens `http://<address>:8791/remote#pair=<code>` (the QR code) and sends `POST /remote/api/pair {code}`.
3. This window asks "A phone (Android Chrome, 192.168.1.57) wants to pair. Allow?". Only on **Y** does the phone get its
   remote key (32 random bytes), once; the state file keeps only the key's SHA-256.
4. Every later request carries `X-VM-Sig: phone=<id>,ts=<ms>,nonce=<hex>,sig=<hex>`: an HMAC-SHA-256, keyed with the
   SHA-256 of the remote key, over `METHOD\npath\nSHA-256(body)\nts\nnonce`. A timestamp more than 30 seconds off, or a
   nonce seen before, is refused. Each refusal has a `reason` (`unpaired`, `revoked`, `expired`, `stale`, `replayed`,
   `bad-signature`); a stale one carries the bridge's clock, and the phone keeps that offset with its key, so a phone
   whose clock is off does not lose its pairing on reload. Only `unpaired`, `revoked` and `expired` wipe its key.
5. `GET /remote/api/devices` lists devices with the actions a phone may use; `POST /remote/api/command` takes the same
   command as `/iot/command`, limited to power, toggle, brightness, colour, colour temperature, volume, mute, play,
   pause, stop, the d-pad keys and ticked Home Assistant entities. Pairings last 7 days, at most 3 phones.

**Limits:** the remote cannot install as an app; anyone on the same Wi-Fi can see its commands and could pretend to be
the bridge; whoever captures the pairing gets the key. Use it only at home.

### Your broker (Mosquitto)

```
# mosquitto.conf
listener 9001 192.168.1.20
protocol websockets
allow_anonymous false
password_file C:\mosquitto\passwd
acl_file C:\mosquitto\acl
```

```
# acl: only VM's user writes; a dashboard or SCADA user only reads
user vm
topic readwrite vm/#
topic readwrite spBv1.0/VM/#

user viewer
topic read vm/#
topic read spBv1.0/#
```

Make the users with `mosquitto_passwd -c C:\mosquitto\passwd vm`, and give the bridge the password in
`VM_MQTT_PASSWORD`. If you turn on `acceptCommands`, give the one user that should command the house write access to
`vm/<site>/+/+/set` (JSON) or `spBv1.0/VM/NCMD/hermes` and `spBv1.0/VM/DCMD/hermes/#` (Sparkplug) only.
**Limit:** over `ws://` or `mqtt://` the password and messages cross your Wi-Fi in clear; `wss://` or `mqtts://` fixes
that (the bridge remembers the broker's certificate the first time and refuses a different one).

### Where secrets live

Device keys and tokens, the Home Assistant token, Shelly's hashed password (HA1), Tasmota's password, certificate
fingerprints and the phones' key hashes live only in the **state file** (or in `VM_HA_TOKEN`, `VM_MQTT_PASSWORD` and
`VM_AI_KEY`). On Windows your user folder's own permissions protect it, not anything VM sets. They never appear in
`/health`, `/iot/*` answers, the log or an error message, and a stored secret goes only to the device it was paired
with (its certificate, UDN, serial, MAC or Home Assistant address). Nothing is exposed to the internet, and the only
internet call is the optional AI question, which sends a device's maker, model, type and service types after you
confirm the exact text.

## Troubleshooting

- **403 in the browser console:** your page's origin isn't allowed; add `--origin https://your.site`.
- **The dashboard says "Not reachable":** is the bridge running, on the same port, and did you allow local network
  access in Chrome or Edge (site settings → "Local network access" / "Apps on device")?
- **`Port 8790 is in use`:** another bridge may be running. For SIGINT alone, start it with `--port 8792` and change the
  address in the dashboard (8791 is the phone remote's). IoT Connect needs 8790, the only port its page may call.
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

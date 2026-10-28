#!/usr/bin/env node
// PRP bridge: a tiny local relay for the PRP SIGINT Dashboard (https://jdpi.pages.dev/sigint/). No dependencies.
//
// Web pages may only read local receivers that send CORS headers, and an HTTPS page may not load plain-HTTP addresses
// on your network at all. This script runs on your own computer, listens on localhost only, fetches the endpoints you
// name, and hands them to the dashboard with CORS and Private Network Access headers. Read-only: it relays GET requests
// to fixed targets and never forwards anything you didn't configure.
//
//   node prp-bridge.mjs [--port 8790] [--route name=URL ...] [--origin URL ...] [--config bridge.json] [--no-public] [--quiet]
//
//   --route adsb=http://raspberrypi.local:8080/data/aircraft.json   readsb / dump1090-fa / tar1090   → /local/adsb
//   --route ais=http://raspberrypi.local:8100/api/ships.json        AIS-catcher web viewer           → /local/ais
//   --route mesh=http://meshtastic.local/json/nodes                 Meshtastic HTTP API (ESP32)      → /local/mesh
//   --route owrx=http://localhost:8073/status.json                  OpenWebRX status                 → /local/owrx
//   Public relays (rate-limited and cached; --no-public turns them off):
//     /public/adsb.lol/v2/point/{lat}/{lon}/{nm}     adsb.lol (ODbL; about 500 requests a day per address)
//     /public/opensky/states?lamin&lomin&lamax&lomax OpenSky Network, anonymous (400 credits a day)
//   aisstream.io (needs Node 22+ for WebSocket): set AISSTREAM_API_KEY, or let the page send its key in X-AISStream-Key.
//     /aisstream/ships.json?bbox=south,west,north,east
//   /health  what the bridge is configured to do (the page checks this)
//
// Chrome and Edge (142+) ask before a public site may reach "apps on this device"; allow it for jdpi.pages.dev.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const VERSION = '1.0.0';
export const DEFAULT_PORT = 8790;
export const DEFAULT_ORIGINS = ['https://jdpi.pages.dev', 'http://localhost:*', 'http://127.0.0.1:*'];
export const DEFAULT_ROUTES = {
  adsb: 'http://localhost:8080/data/aircraft.json', ais: 'http://localhost:8100/api/ships.json',
  mesh: 'http://meshtastic.local/json/nodes', owrx: 'http://localhost:8073/status.json',
};
const UA = `prp-bridge/${VERSION} (+https://jdpi.pages.dev/sigint/)`;
const MAX_BYTES = 8 * 1024 * 1024;

/* ---- Options ------------------------------------------------------------------------------------------------------ */
export function parseArgs(argv, env = {}) {
  const o = { port: DEFAULT_PORT, routes: {}, origins: [], public: true, aisstreamKey: env.AISSTREAM_API_KEY || '', quiet: false, help: false };
  let config = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--port') o.port = Number(val());
    else if (a === '--route') { const s = val(), eq = s.indexOf('='); if (eq < 1) throw new Error(`--route wants name=URL, got "${s}"`); o.routes[s.slice(0, eq)] = s.slice(eq + 1); }
    else if (a === '--origin') o.origins.push(val().replace(/\/+$/, ''));
    else if (a === '--config') config = val();
    else if (a === '--no-public') o.public = false;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Unknown option ${a} (try --help)`);
  }
  if (config) {
    const c = JSON.parse(readFileSync(config, 'utf8'));
    if (c.port != null && o.port === DEFAULT_PORT) o.port = Number(c.port);
    Object.assign(o.routes, { ...(c.routes || {}), ...o.routes });
    if (Array.isArray(c.origins)) o.origins.push(...c.origins);
    if (c.public === false) o.public = false;
  }
  if (!Object.keys(o.routes).length) o.routes = { ...DEFAULT_ROUTES };
  if (!o.origins.length) o.origins = [...DEFAULT_ORIGINS];
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) throw new Error('--port must be 1–65535');
  for (const [k, v] of Object.entries(o.routes)) {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(k)) throw new Error(`Route name "${k}": use lower-case letters, digits and hyphens`);
    let u; try { u = new URL(v); } catch { throw new Error(`Route ${k}: "${v}" is not a URL`); }
    if (!/^https?:$/.test(u.protocol)) throw new Error(`Route ${k}: only http:// and https:// targets`);
  }
  return o;
}

/* ---- Who may ask --------------------------------------------------------------------------------------------------- */
/** Origin allow-list; "http://localhost:*" matches any port. */
export function originAllowed(origin, patterns) {
  if (!origin || origin === 'null') return false;
  return patterns.some(p => p === origin || (p.endsWith(':*') && (origin === p.slice(0, -2) || (origin.startsWith(p.slice(0, -1)) && /^\d+$/.test(origin.slice(p.length - 1))))));
}
/** DNS-rebinding guard: only answer requests addressed to the loopback name we listen on. */
export function hostAllowed(host, port) {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(String(host || '').toLowerCase());
}
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-AISStream-Key', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600',
  };
}
const redact = u => { try { const x = new URL(u); x.username = ''; x.password = ''; x.search = x.search ? '?…' : ''; return x.href; } catch { return '?'; } };

/* ---- Public relays: validated paths, one request per second, short cache ------------------------------------------ */
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
export function adsbLolPath(rest) {
  const m = /^v2\/point\/(-?[\d.]+)\/(-?[\d.]+)\/(\d+(?:\.\d+)?)$/.exec(rest);
  if (!m) return null;
  const lat = num(m[1], -90, 90), lon = num(m[2], -180, 180), r = num(m[3], 1, 250);
  return lat == null || lon == null || r == null ? null : `v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.round(r)}`;
}
export function openskyQuery(params) {
  const v = ['lamin', 'lomin', 'lamax', 'lomax'].map((k, i) => num(params.get(k), i % 2 ? -180 : -90, i % 2 ? 180 : 90));
  if (v.some(x => x == null) || v[0] >= v[2] || v[1] >= v[3]) return null;
  return `lamin=${v[0].toFixed(3)}&lomin=${v[1].toFixed(3)}&lamax=${v[2].toFixed(3)}&lomax=${v[3].toFixed(3)}`;
}
const cache = new Map(), lastCall = new Map();
async function cachedFetch(key, url, { ttl, minGap }) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit;
  const wait = (lastCall.get(key) || 0) + minGap - Date.now();
  if (wait > 0) { if (hit) return hit; await new Promise(r => setTimeout(r, wait)); }
  lastCall.set(key, Date.now());
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  const body = Buffer.from(await r.arrayBuffer());
  const out = { t: Date.now(), status: r.status, type: r.headers.get('content-type') || 'application/json', body };
  if (r.ok) cache.set(url, out);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}

/* ---- aisstream.io: one WebSocket per key, shared by the page's polls; closes when the page stops asking ----------- */
const ais = { ws: null, key: '', bbox: null, ships: new Map(), connected: false, error: '', since: 0, messages: 0, lastSub: 0, lastAsk: 0 };
export function parseBbox(s) {
  const v = String(s || '').split(',').map(Number);
  if (v.length !== 4 || v.some(x => !Number.isFinite(x))) return null;
  const [south, west, north, east] = v;
  if (Math.abs(south) > 90 || Math.abs(north) > 90 || Math.abs(west) > 180 || Math.abs(east) > 180 || south >= north || west >= east) return null;
  return { south, west, north, east };
}
/** Fold one aisstream.io message into a ship record (exported for tests). */
export function applyAisMessage(ships, msg, now = Date.now()) {
  const meta = msg?.MetaData || {}, type = msg?.MessageType, body = msg?.Message?.[type] || {};
  const mmsi = Number(meta.MMSI ?? body.UserID);
  if (!Number.isFinite(mmsi) || mmsi <= 0) return false;
  const s = ships.get(mmsi) || { mmsi };
  const lat = body.Latitude ?? meta.latitude ?? meta.Latitude, lon = body.Longitude ?? meta.longitude ?? meta.Longitude;
  if (/PositionReport$/.test(type || '') && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    Object.assign(s, { lat, lon, sog: body.Sog, cog: body.Cog, heading: body.TrueHeading, status: body.NavigationalStatus ?? s.status, ts: now });
  }
  if (type === 'ShipStaticData') Object.assign(s, { name: body.Name, callsign: body.CallSign, type: body.Type, destination: body.Destination, imo: body.ImoNumber });
  if (type === 'StaticDataReport') {
    if (body.ReportA?.Valid !== false && body.ReportA?.Name) s.name = body.ReportA.Name;
    if (body.ReportB?.Valid !== false && body.ReportB) { if (body.ReportB.CallSign) s.callsign = body.ReportB.CallSign; if (body.ReportB.ShipType) s.type = body.ReportB.ShipType; }
  }
  if (type === 'ExtendedClassBPositionReport' && body.Name) Object.assign(s, { name: body.Name, type: body.Type ?? s.type });
  if (!s.name && meta.ShipName) s.name = String(meta.ShipName).trim();
  s.seen = now;
  ships.set(mmsi, s);
  return true;
}
function aisSubscribe() {
  const b = ais.bbox;
  ais.ws.send(JSON.stringify({ APIKey: ais.key, BoundingBoxes: [[[b.south, b.west], [b.north, b.east]]],
    FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport', 'ShipStaticData', 'StaticDataReport'] }));
  ais.lastSub = Date.now();
}
function aisEnsure(key, bbox, log) {
  ais.lastAsk = Date.now();
  if (typeof WebSocket === 'undefined') { ais.error = 'The aisstream.io relay needs Node.js 22 or newer (built-in WebSocket).'; return; }
  const same = ais.bbox && ['south', 'west', 'north', 'east'].every(k => Math.abs(ais.bbox[k] - bbox[k]) < 1e-3);
  if (ais.ws && ais.key === key) {
    if (!same && ais.connected && Date.now() - ais.lastSub > 1100) { ais.bbox = bbox; ais.ships.clear(); aisSubscribe(); }
    return;
  }
  // After a failed attempt with the same key, wait 30 s before trying again (and keep showing why it failed).
  if (!ais.ws && ais.key === key && ais.error && Date.now() - (ais.closedAt || 0) < 30e3) return;
  if (ais.ws) try { ais.ws.close(); } catch { /* ignore */ }
  Object.assign(ais, { key, bbox, ships: new Map(), connected: false, error: '', since: Date.now(), messages: 0, openedAt: 0 });
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
  ws.binaryType = 'arraybuffer';
  ais.ws = ws;
  ws.onopen = () => { ais.connected = true; ais.openedAt = Date.now(); aisSubscribe(); log('aisstream.io connected'); };
  ws.onmessage = ev => {
    try {
      const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data);
      const msg = JSON.parse(text);
      if (msg.error) { ais.error = String(msg.error); return; }
      if (applyAisMessage(ais.ships, msg)) ais.messages++;
    } catch { /* skip malformed message */ }
  };
  ws.onerror = () => { ais.error = ais.error || 'WebSocket error talking to aisstream.io'; };
  ws.onclose = ev => {
    ais.connected = false; ais.closedAt = Date.now();
    // aisstream.io drops a bad subscription (an invalid key, most often) without a reason, moments after it arrives.
    if (ev.reason) ais.error = ev.reason;
    else if (!ais.messages && ais.openedAt && Date.now() - ais.openedAt < 5000) ais.error = 'aisstream.io closed the connection straight after the subscription: usually an invalid or revoked API key.';
    else if (!ais.openedAt) ais.error = ais.error || 'Could not connect to aisstream.io.';
    if (ais.ws === ws) ais.ws = null;
    log(`aisstream.io closed${ais.error ? `: ${ais.error}` : ''}`);
  };
}
setInterval(() => {
  if (ais.ws && Date.now() - ais.lastAsk > 120e3) { try { ais.ws.close(); } catch { /* ignore */ } ais.ws = null; }
  for (const [k, s] of ais.ships) if (Date.now() - (s.seen || 0) > 30 * 60e3) ais.ships.delete(k);
}, 30e3).unref();
function aisSnapshot() {
  const now = Date.now();
  return {
    source: 'aisstream', connected: ais.connected, error: ais.error || null, since: ais.since, messages: ais.messages,
    ships: [...ais.ships.values()].filter(s => s.lat != null).map(s => ({ mmsi: s.mmsi, name: s.name || null, callsign: s.callsign || null, lat: s.lat, lon: s.lon, sog: s.sog, cog: s.cog, heading: s.heading, status: s.status, type: s.type, destination: s.destination || null, imo: s.imo || null, ageS: Math.round((now - (s.ts || s.seen)) / 1000) })),
  };
}

/* ---- Server --------------------------------------------------------------------------------------------------------- */
export function createBridge(o) {
  const log = (...a) => { if (!o.quiet) console.log(new Date().toISOString().slice(11, 19), ...a); };
  const server = createServer(async (req, res) => {
    const t0 = Date.now(), origin = req.headers.origin;
    const send = (status, body, headers = {}) => {
      const isBuf = Buffer.isBuffer(body);
      res.writeHead(status, { 'Content-Type': isBuf ? headers['Content-Type'] || 'application/json' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(req.method === 'HEAD' ? undefined : isBuf ? body : JSON.stringify(body));
      log(req.method, req.url.replace(/\?.*$/, req.url.includes('?') ? '?…' : ''), status, `${Date.now() - t0} ms`);
    };
    if (!hostAllowed(req.headers.host, o.port)) return send(421, { error: 'This bridge only answers to localhost.' });
    if (origin && !originAllowed(origin, o.origins)) return send(403, { error: `Origin ${origin} is not allowed. Start the bridge with --origin ${origin} to allow it.` });
    const cors = origin ? corsHeaders(origin) : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Read-only: GET only.' }, cors);
    const url = new URL(req.url, `http://localhost:${o.port}`);
    const p = url.pathname;
    try {
      if (p === '/' || p === '/health') {
        return send(200, { name: 'prp-bridge', version: VERSION, routes: Object.fromEntries(Object.entries(o.routes).map(([k, v]) => [k, redact(v)])), public: o.public,
          aisstream: { configured: !!o.aisstreamKey, connected: ais.connected }, node: process.versions.node }, cors);
      }
      if (p.startsWith('/local/')) {
        const name = p.slice(7), target = o.routes[name];
        if (!target) return send(404, { error: `No route "${name}". Configured: ${Object.keys(o.routes).join(', ') || 'none'}.` }, cors);
        const r = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain;q=0.8' }, signal: AbortSignal.timeout(8000) });
        const len = Number(r.headers.get('content-length') || 0);
        if (len > MAX_BYTES) return send(502, { error: 'Upstream reply too large' }, cors);
        const body = Buffer.from(await r.arrayBuffer());
        if (body.length > MAX_BYTES) return send(502, { error: 'Upstream reply too large' }, cors);
        const type = r.headers.get('content-type') || 'application/json';
        return send(r.status, body, { ...cors, 'Content-Type': /json|text\/plain/.test(type) ? type : 'application/octet-stream' });
      }
      if (p.startsWith('/public/')) {
        if (!o.public) return send(403, { error: 'Public relays are off (--no-public).' }, cors);
        if (p.startsWith('/public/adsb.lol/')) {
          const path = adsbLolPath(p.slice('/public/adsb.lol/'.length));
          if (!path) return send(400, { error: 'Use /public/adsb.lol/v2/point/{lat}/{lon}/{radius_nm ≤ 250}' }, cors);
          const r = await cachedFetch('adsb.lol', `https://api.adsb.lol/${path}`, { ttl: 5000, minGap: 1000 });
          return send(r.status, r.body, { ...cors, 'Content-Type': r.type });
        }
        if (p === '/public/opensky/states') {
          const q = openskyQuery(url.searchParams);
          if (!q) return send(400, { error: 'Use /public/opensky/states?lamin=&lomin=&lamax=&lomax=' }, cors);
          const r = await cachedFetch('opensky', `https://opensky-network.org/api/states/all?${q}`, { ttl: 10000, minGap: 10000 });
          return send(r.status, r.body, { ...cors, 'Content-Type': r.type });
        }
        return send(404, { error: 'Unknown public relay' }, cors);
      }
      if (p === '/aisstream/ships.json') {
        const bbox = parseBbox(url.searchParams.get('bbox'));
        if (!bbox) return send(400, { error: 'Use ?bbox=south,west,north,east' }, cors);
        const key = String(req.headers['x-aisstream-key'] || '').trim() || o.aisstreamKey;
        if (!key) return send(401, { error: 'No aisstream.io key: paste it in the Ships tab, or set AISSTREAM_API_KEY before starting the bridge.' }, cors);
        aisEnsure(key, bbox, log);
        return send(200, aisSnapshot(), cors);
      }
      return send(404, { error: 'Not found. Try /health.' }, cors);
    } catch (e) {
      return send(502, { error: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'The receiver did not answer in time' : `Could not reach the target: ${e.cause?.code || e.message}` }, cors);
    }
  });
  return server;
}

const HELP = `PRP bridge ${VERSION}: local relay for the PRP SIGINT Dashboard.
Usage: node prp-bridge.mjs [--port ${DEFAULT_PORT}] [--route name=URL ...] [--origin URL ...] [--config bridge.json] [--no-public] [--quiet]
See the comments at the top of this file, or the dashboard's Overview tab, for examples.`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let o;
  try { o = parseArgs(process.argv.slice(2), process.env); } catch (e) { console.error(e.message); process.exit(2); }
  if (o.help) { console.log(HELP); process.exit(0); }
  const server = createBridge(o);
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${o.port} is in use: try --port ${o.port + 1}` : e.message); process.exit(1); });
  // Also answer on IPv6 loopback, where "localhost" may resolve first; skip quietly if the machine has no ::1.
  const v6 = createBridge({ ...o, quiet: true });
  v6.on('error', () => {});
  v6.listen(o.port, '::1');
  server.listen(o.port, '127.0.0.1', () => {
    console.log(`PRP bridge ${VERSION} on http://localhost:${o.port} (loopback only)`);
    for (const [k, v] of Object.entries(o.routes)) console.log(`  /local/${k.padEnd(6)} → ${redact(v)}`);
    console.log(`  public relays ${o.public ? 'on (adsb.lol, OpenSky)' : 'off'} · aisstream.io ${o.aisstreamKey ? 'key set' : 'key from the page'}${typeof WebSocket === 'undefined' ? ' (needs Node 22+)' : ''}`);
    console.log(`  allowed origins: ${o.origins.join(', ')}`);
  });
}

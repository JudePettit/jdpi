#!/usr/bin/env node
// Vitruvian Manager bridge (prp-bridge.mjs): a tiny local relay for the Vitruvian Manager SIGINT Dashboard (https://jdpi.pages.dev/sigint/)
// and, when started with --iot, the home of IoT Connect (https://jdpi.pages.dev/digital/iot-connect/). No dependencies.
//
// Web pages may only read local receivers that send CORS headers, and an HTTPS page may not load plain-HTTP addresses
// on your network at all. This script runs on your own computer, listens on localhost only, fetches the endpoints you
// name, and hands them to the dashboard with CORS and Private Network Access headers. The SIGINT side is read-only: it
// relays GET requests to fixed targets and never forwards anything you didn't configure.
//
//   node prp-bridge.mjs [--port 8790] [--route name=URL ...] [--origin URL ...] [--config bridge.json] [--no-public] [--quiet]
//                       [--iot] [--iot-origin URL ...] [--state iot-state.json] [--lan]
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
//   IoT Connect (off unless --iot): your own smart devices on your own home network, Hermes Messenger, the UNS link to an
//   MQTT broker you run, and (with --lan) the phone remote on your Wi-Fi. See README.md beside this file.
//
// Chrome and Edge (142+) ask before a public site may reach "apps on this device"; allow it for jdpi.pages.dev.
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual, X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export const VERSION = '2.0.0';
export const DEFAULT_PORT = 8790;
export const DEFAULT_LAN_PORT = 8791;
export const DEFAULT_ORIGINS = ['https://jdpi.pages.dev', 'http://localhost:*', 'http://127.0.0.1:*'];
export const IOT_ORIGIN = 'https://jdpi.pages.dev';
export const DEFAULT_ROUTES = {
  adsb: 'http://localhost:8080/data/aircraft.json', ais: 'http://localhost:8100/api/ships.json',
  mesh: 'http://meshtastic.local/json/nodes', owrx: 'http://localhost:8073/status.json',
};
const UA = `prp-bridge/${VERSION} (+https://jdpi.pages.dev/sigint/)`;
const UA_IOT = `vm-bridge/${VERSION} (IoT Connect)`;
const MAX_BYTES = 8 * 1024 * 1024;
const BRIDGE_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---- Options ------------------------------------------------------------------------------------------------------ */
export function parseArgs(argv, env = {}) {
  const o = { port: DEFAULT_PORT, routes: {}, origins: [], public: true, aisstreamKey: env.AISSTREAM_API_KEY || '', quiet: false, help: false };
  const flags = { iot: false, lan: false, state: '', origins: [] };
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
    else if (a === '--iot') flags.iot = true;
    else if (a === '--lan') { flags.lan = true; flags.iot = true; }
    else if (a === '--state') flags.state = val();
    else if (a === '--iot-origin') flags.origins.push(val().replace(/\/+$/, ''));
    else throw new Error(`Unknown option ${a} (try --help)`);
  }
  let c = {};
  if (config) {
    c = JSON.parse(readFileSync(config, 'utf8'));
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
  o.iot = normaliseIot(c.iot || {}, flags, o.port, env);
  return o;
}

/** The "iot" block of the config file, with the command-line switches on top. The page can change none of this. */
export function normaliseIot(c, flags = {}, port = DEFAULT_PORT, env = {}) {
  const origins = [...(Array.isArray(c.origins) ? c.origins : []), ...(flags.origins || [])].map(s => String(s).replace(/\/+$/, ''));
  for (const s of origins) {
    let u; try { u = new URL(s); } catch { throw new Error(`iot.origins: "${s}" is not an origin`); }
    if (s.includes('*') || !/^https?:$/.test(u.protocol) || u.origin !== s) throw new Error(`iot.origins: "${s}" must be an exact origin such as https://example.org (no wildcards, no path)`);
  }
  const lan = c.lan || {}, ha = c.homeAssistant || {}, b = c.broker || {}, hue = c.hue || {};
  const out = {
    enabled: !!flags.iot && c.enabled !== false, origins,
    interface: String(c.interface || ''), state: String(flags.state || c.state || ''),
    lan: { enabled: !!flags.lan, address: String(lan.address || ''), port: lan.port == null ? DEFAULT_LAN_PORT : Number(lan.port) },
    homeAssistant: { url: ha.url ? String(ha.url) : '' },
    broker: b.url ? { url: String(b.url), username: b.username ? String(b.username) : '', site: String(b.site || 'home'), json: b.json !== false,
      sparkplug: b.sparkplug === true, group: String(b.group || 'VM'), edgeNode: String(b.edgeNode || 'hermes'), acceptCommands: b.acceptCommands === true } : null,
    hue: { rootCA: hue.rootCA ? String(hue.rootCA) : '' },
    ai: { enabled: c.ai?.enabled === true },
    volumeCeiling: c.volumeCeiling == null ? 80 : Number(c.volumeCeiling),
  };
  if (out.homeAssistant.url) { const u = new URL(out.homeAssistant.url); if (!/^https?:$/.test(u.protocol) || u.search || u.username) throw new Error('iot.homeAssistant.url: an http:// or https:// address with no query or user name'); }
  if (out.broker) {
    const u = new URL(out.broker.url);
    if (!/^(mqtt|mqtts|ws|wss):$/.test(u.protocol)) throw new Error('iot.broker.url: use mqtt://, mqtts://, ws:// or wss://');
    for (const k of ['site', 'group', 'edgeNode']) if (!/^[A-Za-z0-9_-]{1,32}$/.test(out.broker[k])) throw new Error(`iot.broker.${k}: letters, digits, hyphens and underscores only`);
  }
  // The phone remote's port matters only when --lan starts it, so a SIGINT-only bridge may use --port 8791.
  if (out.lan.enabled && (!Number.isInteger(out.lan.port) || out.lan.port < 1 || out.lan.port > 65535 || out.lan.port === port || out.lan.port === DEFAULT_PORT)) throw new Error('iot.lan.port must be a free port other than the bridge’s own (default 8791)');
  if (!(out.volumeCeiling >= 0 && out.volumeCeiling <= 100)) throw new Error('iot.volumeCeiling must be 0–100');
  out.aiKey = env.VM_AI_KEY || ''; out.aiUrl = env.VM_AI_URL || ''; out.aiModel = env.VM_AI_MODEL || '';
  out.haToken = env.VM_HA_TOKEN || ''; out.mqttPassword = env.VM_MQTT_PASSWORD || '';
  if (out.broker && out.mqttPassword && !out.broker.username) throw new Error('VM_MQTT_PASSWORD is set but iot.broker.username is not: MQTT sends a password only with a user name, so add "username" to the broker block.');
  return out;
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
    'Access-Control-Allow-Headers': 'Content-Type, X-AISStream-Key, X-VM-Sig', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600',
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
/** The bridge's HTTP server on loopback. With o.iot.enabled it also carries IoT Connect (`server.iot`); `deps` are
 *  the test seams (netPolicy, fake clock, the bridge-window confirmation, interface table), documented in createIot. */
export function createBridge(o, deps = {}) {
  const log = (...a) => { if (!o.quiet) console.log(new Date().toISOString().slice(11, 19), ...a); };
  const iot = o.iot?.enabled ? (deps.iot || createIot(o, { log, ...deps })) : null;
  const server = createServer(async (req, res) => {
    const t0 = Date.now(), origin = req.headers.origin;
    const send = (status, body, headers = {}) => {
      const isBuf = Buffer.isBuffer(body);
      res.writeHead(status, { 'Content-Type': isBuf ? headers['Content-Type'] || 'application/json' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      res.end(req.method === 'HEAD' ? undefined : isBuf ? body : JSON.stringify(body));
      log(req.method, req.url.replace(/\?.*$/, req.url.includes('?') ? '?…' : ''), status, `${Date.now() - t0} ms`);
    };
    if (!hostAllowed(req.headers.host, o.port)) return send(421, { error: 'This bridge only answers to localhost.' });
    const path0 = String(req.url || '/').replace(/\?.*$/, '');
    if (path0 === '/iot' || path0.startsWith('/iot/')) {
      if (iot) return iot.handle(req, res, send);
      if (!origin || origin === 'null' || !iotOriginList(o.iot).includes(origin)) return send(403, { ok: false, code: 'bad-origin', error: 'IoT Connect answers only Vitruvian Manager’s own page and origins named in the bridge’s config file.' });
      return send(404, { ok: false, code: 'iot-off', error: 'IoT Connect is off. Start the bridge with --iot.' }, { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    }
    if (origin && !originAllowed(origin, o.origins)) return send(403, { error: `Origin ${origin} is not allowed. Start the bridge with --origin ${origin} to allow it.` });
    const cors = origin ? corsHeaders(origin) : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Read-only: GET only.' }, cors);
    const url = new URL(req.url, `http://localhost:${o.port}`);
    const p = url.pathname;
    try {
      if (p === '/' || p === '/health') {
        return send(200, { name: 'prp-bridge', version: VERSION, features: ['iot-1'], routes: Object.fromEntries(Object.entries(o.routes).map(([k, v]) => [k, redact(v)])), public: o.public,
          aisstream: { configured: !!o.aisstreamKey, connected: ais.connected }, iot: { enabled: !!iot }, node: process.versions.node }, cors);
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
  if (iot) { server.iot = iot; server.on('close', () => iot.stop()); }
  return server;
}

/* =====================================================================================================================
 * IoT Connect. Everything below is off unless the bridge is started with --iot.
 * The rules (design §2-§4): the user's own devices on his own network; discovery only by each kind's standard question
 * or an address he types; the ownership tick; documented pairing with consent on the device and Y in this window;
 * fixed action tables; no scanning, no credential guessing; secrets only in the state file; nothing on the internet.
 * ===================================================================================================================== */
export const IOT_CODES = ['unsupported', 'unknown-device', 'not-paired', 'moved', 'refused', 'rate-limited', 'no-answer'];
export class IotError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status || ({ unsupported: 400, 'bad-request': 400, 'unknown-device': 404, 'not-paired': 409, moved: 409, refused: 403, 'rate-limited': 429, 'no-answer': 502 }[code] || 400); }
}
const NO_ANSWER = 'No answer from that device.';
export const iotOriginList = cfg => [IOT_ORIGIN, ...((cfg && cfg.origins) || [])];

/* ---- Addresses ------------------------------------------------------------------------------------------------------ */
export function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s));
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some(x => x > 255) ? null : (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}
export function parseIPv6(s) {
  s = String(s).replace(/%.*$/, '').toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) { const n = parseIPv4(v4[1]); if (n == null) return null; s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array(fill).fill('0'), ...tail];
  if (parts.length !== 8 || parts.some(x => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return parts.reduce((acc, x) => (acc << 16n) + BigInt(parseInt(x, 16)), 0n);
}
export const isLoopback = ip => { const n = parseIPv4(ip); if (n != null) return n >>> 24 === 127; return parseIPv6(ip) === 1n; };
export function isPrivateAddress(ip) {
  const n = parseIPv4(ip);
  if (n != null) return n >>> 24 === 10 || (n >>> 20) === 0xac1 || (n >>> 16) === 0xc0a8 || (n >>> 16) === 0xa9fe;
  const v = parseIPv6(ip);
  if (v == null) return false;
  return (v >> 120n) === 0xfdn || (v >> 118n) === 0x3fan; // fd00::/8 (unique local) and fe80::/10 (link-local)
}
function inSubnet(ip, cidrAddr, bits) {
  const a = parseIPv4(ip), b = parseIPv4(cidrAddr);
  if (a != null && b != null) { const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((a & m) >>> 0) === ((b & m) >>> 0); }
  const x = parseIPv6(ip), y = parseIPv6(cidrAddr);
  if (x == null || y == null) return false;
  const m = bits === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - bits)) - 1n);
  return (x & m) === (y & m);
}
const cidrBits = a => Number(String(a.cidr || '').split('/')[1] ?? (a.family === 'IPv4' || a.family === 4 ? 24 : 64));
/**
 * May the bridge open a socket to this address? `interfaces` has the shape of os.networkInterfaces(); `homeInterface`
 * is iot.interface from the config file. Loopback only for the configured broker or Home Assistant, and never the
 * bridge's own ports. Returns { ok: true } or { ok: false, reason } (plain English, the same for every address).
 */
export function allowedTarget(ip, { interfaces = {}, homeInterface = '', purpose = 'device', port = 0, ownPorts = [] } = {}) {
  if (parseIPv4(ip) == null && parseIPv6(ip) == null) return { ok: false, reason: 'That is not an IP address.' };
  if ([DEFAULT_PORT, DEFAULT_LAN_PORT, ...ownPorts].includes(Number(port))) return { ok: false, reason: 'The bridge does not connect to its own ports.' };
  if (isLoopback(ip)) return purpose === 'broker' || purpose === 'ha' ? { ok: true } : { ok: false, reason: 'A device cannot be on this computer’s loopback address.' };
  if (!isPrivateAddress(ip)) return { ok: false, reason: 'That is not an address on a home network.' };
  if (!homeInterface) return { ok: false, reason: 'Set "interface" (your home connection, such as "Wi-Fi") in the bridge’s config file first.' };
  const home = interfaces[homeInterface];
  if (!home || !home.length) return { ok: false, reason: `The home connection "${homeInterface}" is not connected.` };
  const onHome = home.some(a => !a.internal && inSubnet(ip, a.address, cidrBits(a)));
  if (!onHome) return { ok: false, reason: `That address is not on your home connection ("${homeInterface}").` };
  for (const [name, list] of Object.entries(interfaces)) {
    if (name === homeInterface) continue;
    if ((list || []).some(a => !a.internal && inSubnet(ip, a.address, cidrBits(a)))) return { ok: false, reason: 'This address could also be reached through another connection, such as a work VPN.' };
  }
  return { ok: true };
}
/** The IPv4 address (and its broadcast address) of the home interface, for discovery sockets. */
export function homeAddress(interfaces, homeInterface) {
  const a = (interfaces[homeInterface] || []).find(x => !x.internal && (x.family === 'IPv4' || x.family === 4));
  if (!a) return null;
  const n = parseIPv4(a.address), m = parseIPv4(a.netmask || '255.255.255.0');
  const b = ((n | (~m >>> 0)) >>> 0);
  return { address: a.address, broadcast: [b >>> 24, (b >>> 16) & 255, (b >>> 8) & 255, b & 255].join('.') };
}
/** --lan listens only on a private IPv4 address of the home interface, never 0.0.0.0, and not on a Public network. */
export function lanAddressProblem(address, { interfaces = {}, homeInterface = '', policy = 'home', profile = 'unknown' } = {}) {
  if (!address) return 'Set iot.lan.address in the config file to this computer’s address on your home Wi-Fi.';
  if (address === '0.0.0.0' || parseIPv4(address) == null) return 'The phone remote listens on one private IPv4 address of your home connection, never 0.0.0.0.';
  if (policy === 'loopback') return isLoopback(address) ? null : 'Under the loopback test policy the remote listens only on 127.0.0.1.';
  if (!isPrivateAddress(address)) return 'That is not a private address.';
  if (!(interfaces[homeInterface] || []).some(a => a.address === address)) return `That address does not belong to your home connection ("${homeInterface || 'not set'}").`;
  if (profile === 'Public') return 'Windows marks this network Public, so the phone remote stays off. Mark it Private: Settings > Network & internet > Wi-Fi > your network > Private network.';
  return null;
}

/* ---- One way out: every outgoing IoT socket goes through here --------------------------------------------------------- */
/**
 * makeNet(options) builds the bridge's only door to the network for IoT Connect.
 *   policy "home": the address must pass allowedTarget (private, on the home interface and no other).
 *   policy "loopback" (tests): every socket throws unless the address is 127.0.0.0/8 or ::1, and names resolve only from
 *   the fixture map `resolver`; `portMap` sends "ip:port" to a fake device's real loopback port.
 */
export function makeNet({ policy = 'home', resolver = {}, portMap = {}, interfaces = () => os.networkInterfaces(), homeInterface = '', ownPorts = [], timeout = 4000, allowInternet = () => false } = {}) {
  const ifs = () => (typeof interfaces === 'function' ? interfaces() : interfaces);
  async function resolve(host) {
    host = String(host).replace(/^\[|\]$/g, '');
    if (parseIPv4(host) != null || parseIPv6(host) != null) return host;
    if (policy === 'loopback') {
      if (resolver[host]) return resolver[host];
      throw new IotError('refused', `netPolicy loopback: the name "${host}" is not in the fixture map.`);
    }
    const r = await dns.promises.lookup(host, { family: 4 }).catch(() => null);
    if (!r) throw new IotError('no-answer', NO_ANSWER);
    return r.address;
  }
  async function target(host, port, purpose = 'device') {
    const ip = await resolve(host);
    if (policy === 'loopback') {
      if (!isLoopback(ip)) throw new IotError('refused', `netPolicy loopback: ${ip} is not a loopback address.`);
      const mapped = portMap[`${ip}:${port}`];
      const connectPort = mapped || port;
      if ([DEFAULT_PORT, DEFAULT_LAN_PORT, ...ownPorts].includes(Number(connectPort)) && !mapped) throw new IotError('refused', 'The bridge does not connect to its own ports.');
      if (ownPorts.includes(Number(connectPort))) throw new IotError('refused', 'The bridge does not connect to its own ports.');
      return { ip, port, connectHost: mapped ? '127.0.0.1' : ip, connectPort };
    }
    if (purpose === 'ai' && allowInternet(host, port)) return { ip, port, connectHost: ip, connectPort: port }; // the optional AI question, the only internet call
    const ok = allowedTarget(ip, { interfaces: ifs(), homeInterface, purpose, port, ownPorts });
    if (!ok.ok) throw new IotError('refused', ok.reason);
    return { ip, port, connectHost: ip, connectPort: port };
  }
  /** A connected TCP (or TLS) socket. tls.mode: "system" (normal CA check), "pin" (fingerprint must match, else
   *  "moved"), "tofu" (first use: accept and report the fingerprint), "ca" (signed by `ca`, with CN = expectCN). The
   *  certificate is checked before a single byte is written, so no secret reaches the wrong device. */
  async function tcp(host, port, { purpose = 'device', tls: t = null, timeout: ms = timeout } = {}) {
    const tg = await target(host, port, purpose);
    return new Promise((resolveP, reject) => {
      let done = false;
      const fail = e => { if (done) return; done = true; try { sock.destroy(); } catch { /* ignore */ } reject(e instanceof IotError ? e : new IotError('no-answer', NO_ANSWER)); };
      const servername = parseIPv4(host) == null && parseIPv6(host) == null ? String(host) : undefined;
      const sock = t
        ? tls.connect({ host: tg.connectHost, port: tg.connectPort, servername, rejectUnauthorized: t.mode === 'system', ca: t.ca || undefined, ALPNProtocols: t.alpn })
        : net.connect({ host: tg.connectHost, port: tg.connectPort });
      const timer = setTimeout(() => fail(new IotError('no-answer', NO_ANSWER)), ms);
      sock.once('error', fail);
      sock.once(t ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        let cert = null, fingerprint = null;
        if (t) {
          try { cert = sock.getPeerX509Certificate(); fingerprint = cert ? cert.fingerprint256 : null; } catch { cert = null; }
          if (t.mode === 'pin' && (!fingerprint || fingerprint !== t.pin)) return fail(new IotError('moved', 'This device’s certificate has changed since it was paired, so VM sent it nothing. Pair it again if you replaced it.'));
          if (t.mode === 'ca') {
            const problem = certProblem(cert, t.ca, t.expectCN);
            if (problem) return fail(new IotError('moved', problem));
          }
        }
        if (done) return;
        done = true; sock.removeListener('error', fail);
        resolveP({ socket: sock, cert, fingerprint, ip: tg.ip });
      });
    });
  }
  /** HTTP(S) request through tcp(): no global fetch, no agent, the Host header set from the URL. */
  async function request({ method = 'GET', url, headers = {}, body = null, purpose = 'device', tls: t, timeout: ms = timeout, maxBytes = 1 << 20 }) {
    const u = new URL(url), secure = u.protocol === 'https:';
    const port = Number(u.port) || (secure ? 443 : 80);
    const conn = await tcp(u.hostname, port, { purpose, tls: secure ? (t || { mode: 'system' }) : null, timeout: ms });
    return new Promise((resolveP, reject) => {
      const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const req = httpRequest({ createConnection: () => conn.socket, method, path: u.pathname + u.search,
        headers: { Host: u.host, 'User-Agent': UA_IOT, Connection: 'close', ...headers, ...(data ? { 'Content-Length': data.length } : {}) } }, res => {
        const chunks = []; let size = 0;
        res.on('data', c => { size += c.length; if (size > maxBytes) { req.destroy(); reject(new IotError('no-answer', 'That device’s reply was too large.')); } else chunks.push(c); });
        res.on('end', () => resolveP({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), fingerprint: conn.fingerprint, cert: conn.cert }));
        res.on('error', () => reject(new IotError('no-answer', NO_ANSWER)));
      });
      req.setTimeout(ms, () => { req.destroy(); reject(new IotError('no-answer', NO_ANSWER)); });
      req.on('error', () => reject(new IotError('no-answer', NO_ANSWER)));
      req.end(data || undefined);
    });
  }
  /** One UDP datagram to a device, and the first reply that `accept` takes (or null after the timeout). */
  async function udp(host, port, payload, { accept = () => true, timeout: ms = 1500 } = {}) {
    const tg = await target(host, port, 'device');
    const fam = parseIPv6(tg.connectHost) != null ? 'udp6' : 'udp4';
    const bindAddr = policy === 'loopback' ? (fam === 'udp6' ? '::1' : '127.0.0.1') : homeAddress(ifs(), homeInterface)?.address;
    if (!bindAddr) throw new IotError('refused', `The home connection "${homeInterface}" is not connected.`);
    return new Promise(resolveP => {
      const s = dgram.createSocket(fam);
      const end = v => { clearTimeout(timer); try { s.close(); } catch { /* ignore */ } resolveP(v); };
      const timer = setTimeout(() => end(null), ms);
      s.on('error', () => end(null));
      s.on('message', (msg, rinfo) => { try { if (accept(msg, rinfo)) end({ msg, rinfo }); } catch { /* ignore */ } });
      s.bind(0, bindAddr, () => s.send(payload, tg.connectPort, tg.connectHost, e => { if (e) end(null); }));
    });
  }
  /** Discovery sockets may send only each kind's standard question to its fixed group (or the home broadcast address),
   *  and only under the home policy: tests feed fixture packets instead, so nothing is multicast from a test. */
  function discoverySocket() {
    if (policy === 'loopback') throw new IotError('refused', 'netPolicy loopback: discovery sockets are not opened; tests inject announcements.');
    const home = homeAddress(ifs(), homeInterface);
    if (!home) throw new IotError('refused', `The home connection "${homeInterface || 'not set'}" is not connected.`);
    const allowed = new Set(['239.255.255.250:1900', '239.255.255.250:1982', '224.0.0.251:5353', `${home.broadcast}:38899`, `${home.broadcast}:56700`]);
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: false });
    return { socket: s, home, send(buf, port, addr) { if (!allowed.has(`${addr}:${port}`)) throw new IotError('refused', 'Discovery sends only the standard questions.'); s.send(buf, port, addr); } };
  }
  return { policy, resolve, target, tcp, request, udp, discoverySocket };
}
function certProblem(cert, caPem, expectCN) {
  if (!cert) return 'That device sent no certificate.';
  const cn = (/(?:^|\n)CN=([^\n]+)/.exec(cert.subject) || [])[1] || '';
  if (expectCN && cn.toLowerCase() !== String(expectCN).toLowerCase()) return 'That device’s certificate names another device, so VM sent it nothing.';
  if (caPem) {
    let root; try { root = new X509Certificate(caPem); } catch { return 'The root certificate in the config file could not be read.'; }
    if (!cert.checkIssued(root) || !cert.verify(root.publicKey)) return 'That device’s certificate is not signed by its maker’s root, so VM sent it nothing.';
  }
  const t = Date.now();
  if (Date.parse(cert.validTo) < t - 86400e3 * 3650) return 'That device’s certificate is long expired.';
  return null;
}

/* ---- WebSocket client (RFC 6455), hand-written for LG, Samsung and MQTT over WebSocket -------------------------------- */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** One WebSocket frame. Clients mask (RFC 6455 §5.3); servers (the test fakes) do not. */
export function wsFrame(opcode, payload, mask = true, maskKey = null) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''));
  const len = data.length, head = [0x80 | opcode];
  if (len < 126) head.push((mask ? 0x80 : 0) | len);
  else if (len < 65536) head.push((mask ? 0x80 : 0) | 126, len >> 8, len & 255);
  else { head.push((mask ? 0x80 : 0) | 127, 0, 0, 0, 0); const b = Buffer.alloc(4); b.writeUInt32BE(len); head.push(...b); }
  if (!mask) return Buffer.concat([Buffer.from(head), data]);
  const key = maskKey || randomBytes(4), out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ key[i & 3];
  return Buffer.concat([Buffer.from(head), key, out]);
}
/** Incremental frame parser; `onFrame(opcode, payload, fin)` gets each frame unmasked. */
export function wsParser(onFrame) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = !!(buf[0] & 0x80), op = buf[0] & 15, masked = !!(buf[1] & 0x80);
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 4 * 1024 * 1024) throw new Error('WebSocket frame too large');
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const k = buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= k[i & 3]; }
      buf = buf.subarray(need);
      onFrame(op, Buffer.from(payload), fin);
    }
  };
}
export const wsAccept = key => createHash('sha1').update(String(key) + WS_GUID).digest('base64');
/** Connect a WebSocket through net.tcp (so the policy, the pin and the timeout all apply). Emits "message" (Buffer,
 *  isBinary) and "close"; `send` takes a string (text frame) or a Buffer (binary frame). */
export async function wsConnect(netx, url, { protocol = '', headers = {}, tls: t = null, purpose = 'device', timeout = 5000 } = {}) {
  const u = new URL(url), secure = u.protocol === 'wss:';
  const port = Number(u.port) || (secure ? 443 : 80);
  const conn = await netx.tcp(u.hostname, port, { purpose, tls: secure ? (t || { mode: 'system' }) : null, timeout });
  const sock = conn.socket, key = randomBytes(16).toString('base64');
  const lines = [`GET ${u.pathname || '/'}${u.search} HTTP/1.1`, `Host: ${u.host}`, 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', `User-Agent: ${UA_IOT}`];
  if (protocol) lines.push(`Sec-WebSocket-Protocol: ${protocol}`);
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  sock.write(lines.join('\r\n') + '\r\n\r\n');
  const ws = new EventEmitter();
  ws.fingerprint = conn.fingerprint;
  return new Promise((resolveP, reject) => {
    let head = Buffer.alloc(0), open = false, parts = [], partOp = 0, closed = false;
    const timer = setTimeout(() => { sock.destroy(); reject(new IotError('no-answer', NO_ANSWER)); }, timeout);
    const close = () => { if (closed) return; closed = true; clearTimeout(timer); if (!open) reject(new IotError('no-answer', NO_ANSWER)); ws.emit('close'); };
    const parse = wsParser((op, payload, fin) => {
      if (op === 8) { try { sock.write(wsFrame(8, payload.subarray(0, 2))); } catch { /* ignore */ } sock.end(); return; }
      if (op === 9) { sock.write(wsFrame(10, payload)); return; }
      if (op === 10) return;
      if (op !== 0) { partOp = op; parts = []; }
      parts.push(payload);
      if (fin) { const msg = Buffer.concat(parts); parts = []; ws.emit('message', msg, partOp === 2); }
    });
    sock.on('data', chunk => {
      if (open) { try { parse(chunk); } catch { sock.destroy(); } return; }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) { if (head.length > 16384) sock.destroy(); return; }
      const text = head.subarray(0, end).toString('latin1'), rest = head.subarray(end + 4);
      const status = /^HTTP\/1\.1 (\d{3})/.exec(text)?.[1];
      const accept = /\r\nsec-websocket-accept:\s*(\S+)/i.exec(text)?.[1];
      if (status !== '101' || accept !== wsAccept(key)) { clearTimeout(timer); sock.destroy(); reject(new IotError(status === '401' || status === '403' ? 'refused' : 'no-answer', status === '401' || status === '403' ? 'The device refused the connection.' : NO_ANSWER)); return; }
      open = true; clearTimeout(timer);
      ws.send = data => { if (!closed) sock.write(wsFrame(Buffer.isBuffer(data) ? 2 : 1, data)); };
      ws.close = () => { if (closed) return; try { sock.write(wsFrame(8, Buffer.from([0x03, 0xe8]))); } catch { /* ignore */ } sock.end(); setTimeout(() => sock.destroy(), 500).unref(); };
      ws.destroy = () => sock.destroy();
      resolveP(ws);
      if (rest.length) try { parse(rest); } catch { sock.destroy(); }
    });
    sock.on('close', close);
    sock.on('error', () => sock.destroy());
  });
}

/* ---- The state file: the only place secrets live ---------------------------------------------------------------------- */
export function defaultStatePath(env = process.env) {
  if (process.platform === 'win32') return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'VM', 'bridge', 'iot-state.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'vm', 'bridge', 'iot-state.json');
}
/** Refuse a state path inside a git working tree, the bridge's own folder or OneDrive (it would leave the computer). */
export function statePathProblem(p, { bridgeDir = BRIDGE_DIR } = {}) {
  const abs = path.resolve(p);
  if (abs.split(/[\\/]+/).some(seg => /^onedrive\b/i.test(seg))) return 'The state file holds keys, so it may not be inside OneDrive, which copies files to the cloud.';
  const rel = path.relative(path.resolve(bridgeDir), abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return 'The state file may not be in the bridge’s own folder.';
  for (let d = path.dirname(abs); ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) return 'The state file may not be inside a git working tree, where it could be committed.';
    if (path.dirname(d) === d) break;
  }
  return null;
}
const EMPTY_STATE = () => ({ v: 1, devices: [], phones: [], ha: { url: '', token: '', entities: [] }, network: { ownHome: false, at: null }, policy: { roku: null }, broker: { bdSeq: -1, pin: null }, ai: {} });
export function openState(p, { bridgeDir } = {}) {
  const problem = statePathProblem(p, { bridgeDir });
  if (problem) throw new Error(problem);
  let s = EMPTY_STATE();
  if (existsSync(p)) { try { s = { ...s, ...JSON.parse(readFileSync(p, 'utf8')) }; } catch { throw new Error(`The state file ${p} could not be read; move it aside to start afresh.`); } }
  return {
    data: s,
    save() { mkdirSync(path.dirname(p), { recursive: true }); const tmp = `${p}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(s, null, 1), { mode: 0o600 }); renameSync(tmp, p); },
  };
}

/* ---- Small text helpers ------------------------------------------------------------------------------------------------ */
export const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlDecode = s => String(s).replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e.toLowerCase()] ?? (e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(Number(e.slice(1)))));
export function xmlText(xml, tag) { const m = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'i').exec(xml); return m ? xmlDecode(m[1].trim()) : ''; }
const xmlBlocks = (xml, tag) => [...String(xml).matchAll(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'gi'))].map(m => m[1]);
/** Text from a device, kept as text: no control characters, at most `max` characters. The page shows it with textContent. */
export const cleanText = (s, max = 64) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** UNS names: lower-case letters, digits and hyphens only, so no "#", "+" or "/" ever reaches a topic. */
export const slug = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unnamed';
const shortHash = s => createHash('sha256').update(String(s)).digest('hex').slice(0, 6);
const sha256hex = b => createHash('sha256').update(b).digest('hex');
/** The parameters of an HTTP Digest challenge (RFC 7616), such as Shelly's 401 over HTTP:
 *  WWW-Authenticate: Digest qop="auth", realm="shellyplus1-…", nonce="…", algorithm=SHA-256. */
export function parseDigest(header) {
  const out = {}, m = /^\s*Digest\s+(.*)$/i.exec(String(header || ''));
  if (!m) return out;
  for (const x of m[1].matchAll(/([A-Za-z]+)\s*=\s*(?:"([^"]*)"|([^\s,]+))/g)) out[x[1].toLowerCase()] = x[2] ?? x[3];
  return out;
}
/** Remove secrets and query strings from anything logged or returned. */
export function scrub(text, secrets = []) {
  let t = String(text);
  for (const s of secrets) if (s && String(s).length >= 6) t = t.split(String(s)).join('…');
  // A value after "token=", "key:" or '"password":"' goes; plain English ("a password: type it once") stays.
  return t.replace(/(https?|wss?|mqtts?):\/\/([^\s/?#]*@)?([^\s?#]+)\?[^\s"']*/gi, '$1://$3?…')
    .replace(/\b(Bearer|Basic)\s+[^\s"',]+/gi, '$1 …').replace(/\b(Authorization:?)\s+(?!(?:Bearer|Basic) …)[^\s"',]+/gi, '$1 …')
    .replace(/((?:token|key|password|client-key)(?:"\s*:\s*"|'\s*:\s*'|\s*=\s*["']?|:(?=\S)["']?))[^"'\s,}&]+/gi, '$1…');
}

/* ---- SSDP and the Yeelight variant ------------------------------------------------------------------------------------- */
export const SSDP_TARGETS = ['urn:schemas-upnp-org:device:MediaRenderer:1', 'urn:schemas-upnp-org:device:ZonePlayer:1', 'roku:ecp'];
export const ssdpSearch = (st, port = 1900) => Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:${port}\r\nMAN: "ssdp:discover"\r\n${port === 1900 ? 'MX: 2\r\n' : ''}ST: ${st}\r\n${port === 1900 ? `USER-AGENT: ${UA_IOT}\r\n` : ''}\r\n`);
/** Parse an SSDP reply or NOTIFY into { kind: "reply"|"notify", headers } (header names lower-case), or null. */
export function parseSsdp(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  const lines = text.split(/\r?\n/);
  const first = lines.shift() || '';
  const kind = /^HTTP\/1\.[01] 200/i.test(first) ? 'reply' : /^NOTIFY \* HTTP\/1\.[01]/i.test(first) ? 'notify' : null;
  if (!kind) return null;
  const headers = {};
  for (const l of lines) { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); }
  return { kind, headers };
}

/* ---- mDNS codec (RFC 6762/1035), hand-written: one-shot queries answered unicast ----------------------------------- */
export const MDNS_TYPES = ['_hue._tcp.local', '_lifx._udp.local', '_shelly._tcp.local', '_googlecast._tcp.local', '_airplay._tcp.local', '_home-assistant._tcp.local', '_mqtt._tcp.local'];
const T = { A: 1, PTR: 12, TXT: 16, AAAA: 28, SRV: 33 };
function encName(name) {
  const parts = String(name).replace(/\.$/, '').split('.');
  const bufs = parts.map(p => { const b = Buffer.from(p, 'utf8'); if (b.length > 63) throw new Error('label too long'); return Buffer.concat([Buffer.from([b.length]), b]); });
  return Buffer.concat([...bufs, Buffer.from([0])]);
}
export function mdnsQuery(names, { id = 0, unicast = true } = {}) {
  const head = Buffer.alloc(12); head.writeUInt16BE(id, 0); head.writeUInt16BE(names.length, 4);
  const qs = names.map(n => { const t = Buffer.alloc(4); t.writeUInt16BE(T.PTR, 0); t.writeUInt16BE(1 | (unicast ? 0x8000 : 0), 2); return Buffer.concat([encName(n), t]); });
  return Buffer.concat([head, ...qs]);
}
/** Build a response (for fixtures): records [{ name, type: "PTR"|"SRV"|"TXT"|"A"|"AAAA", ttl, data }]. */
export function mdnsResponse(records, { id = 0 } = {}) {
  const head = Buffer.alloc(12); head.writeUInt16BE(id, 0); head.writeUInt16BE(0x8400, 2); head.writeUInt16BE(records.length, 6);
  const rr = records.map(r => {
    let data;
    if (r.type === 'PTR') data = encName(r.data);
    else if (r.type === 'SRV') { const h = Buffer.alloc(6); h.writeUInt16BE(r.data.priority || 0, 0); h.writeUInt16BE(r.data.weight || 0, 2); h.writeUInt16BE(r.data.port, 4); data = Buffer.concat([h, encName(r.data.target)]); }
    else if (r.type === 'TXT') data = Buffer.concat(Object.entries(r.data).map(([k, v]) => { const b = Buffer.from(v === true ? k : `${k}=${v}`); return Buffer.concat([Buffer.from([b.length]), b]); }));
    else if (r.type === 'A') data = Buffer.from(r.data.split('.').map(Number));
    else throw new Error(`type ${r.type}`);
    const meta = Buffer.alloc(10); meta.writeUInt16BE(T[r.type], 0); meta.writeUInt16BE(1, 2); meta.writeUInt32BE(r.ttl ?? 120, 4); meta.writeUInt16BE(data.length, 8);
    return Buffer.concat([encName(r.name), meta, data]);
  });
  return Buffer.concat([head, ...rr]);
}
export function mdnsDecode(buf) {
  let o = 0;
  const u16 = () => { if (o + 2 > buf.length) throw new Error('short'); const v = buf.readUInt16BE(o); o += 2; return v; };
  const name = (at = null) => {
    const labels = []; let p = at ?? o, jumped = false, hops = 0;
    for (;;) {
      if (p >= buf.length || ++hops > 64) throw new Error('bad name');
      const len = buf[p];
      if (len === 0) { p++; break; }
      if ((len & 0xc0) === 0xc0) { const ptr = ((len & 0x3f) << 8) | buf[p + 1]; if (!jumped) o = p + 2; jumped = true; p = ptr; continue; }
      labels.push(buf.toString('utf8', p + 1, p + 1 + len)); p += 1 + len;
    }
    if (!jumped && at == null) o = p;
    return labels.join('.');
  };
  const id = u16(), flags = u16(), qd = u16(), an = u16(), ns = u16(), ar = u16();
  const questions = [];
  for (let i = 0; i < qd; i++) { const n = name(); questions.push({ name: n, type: u16(), cls: u16() }); }
  const records = [];
  for (let i = 0; i < an + ns + ar; i++) {
    const n = name(), type = u16(), cls = u16(); const ttl = buf.readUInt32BE(o); o += 4; const len = u16(); const start = o;
    if (start + len > buf.length) throw new Error('short record');
    let data = null;
    if (type === T.PTR) data = name(start);
    else if (type === T.SRV) data = { priority: buf.readUInt16BE(start), weight: buf.readUInt16BE(start + 2), port: buf.readUInt16BE(start + 4), target: name(start + 6) };
    else if (type === T.TXT) { data = {}; for (let p = start; p < start + len;) { const l = buf[p]; const s = buf.toString('utf8', p + 1, p + 1 + l); p += 1 + l; if (!s) continue; const eq = s.indexOf('='); data[eq < 0 ? s.toLowerCase() : s.slice(0, eq).toLowerCase()] = eq < 0 ? true : s.slice(eq + 1); } }
    else if (type === T.A && len === 4) data = [...buf.subarray(start, start + 4)].join('.');
    else if (type === T.AAAA && len === 16) data = [...Array(8)].map((_, k) => buf.readUInt16BE(start + 2 * k).toString(16)).join(':');
    o = start + len;
    records.push({ name: n, type: Object.keys(T).find(k => T[k] === type) || type, cls: cls & 0x7fff, ttl, data });
  }
  return { id, flags, questions, records };
}

/* ---- LIFX LAN protocol (binary, little-endian; lan.developer.lifx.com) ------------------------------------------------ */
export function lifxPacket(type, payload = Buffer.alloc(0), { target = null, tagged = false, source = 0x564d0001, sequence = 0, ackRequired = false, resRequired = false } = {}) {
  const h = Buffer.alloc(36);
  h.writeUInt16LE(36 + payload.length, 0);
  h.writeUInt16LE(1024 | 0x1000 | (tagged ? 0x2000 : 0), 2); // protocol 1024, addressable, tagged
  h.writeUInt32LE(source >>> 0, 4);
  if (target) Buffer.from(target.replace(/[^0-9a-f]/gi, '').padEnd(16, '0'), 'hex').copy(h, 8);
  h[22] = (ackRequired ? 2 : 0) | (resRequired ? 1 : 0);
  h[23] = sequence & 255;
  h.writeUInt16LE(type, 32);
  return Buffer.concat([h, payload]);
}
export function lifxParse(buf) {
  if (buf.length < 36 || buf.readUInt16LE(0) !== buf.length) return null;
  return { type: buf.readUInt16LE(32), source: buf.readUInt32LE(4), target: buf.subarray(8, 14).toString('hex'), sequence: buf[23], payload: buf.subarray(36) };
}

/* ---- Colour arithmetic ------------------------------------------------------------------------------------------------- */
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function hexToXy(hex) {
  const [r, g, b] = hexRgb(hex).map(c => c / 255).map(c => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = r * 0.0193 + g * 0.1192 + b * 0.9505, s = X + Y + Z;
  return s ? { x: +(X / s).toFixed(4), y: +(Y / s).toFixed(4) } : { x: 0.3127, y: 0.329 };
}
export function hexToHsv(hex) {
  const [r, g, b] = hexRgb(hex).map(c => c / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round(((h * 60 + 360) % 360)), s: max ? d / max : 0, v: max };
}

/* ---- Hermes Messenger's rules -------------------------------------------------------------------------------------------- */
const MIRACAST = 'Mirroring is Miracast, which no web page or Node program can start: press Windows key + K on the computer.';
/** Each rule: { id, match: [alternatives, each { fact: RegExp }], kind, protocol, says, pairing: { method, steps,
 *  consentOnDevice }, routes, limits, typed (port for a typed address), cannot (VM cannot drive it) }. */
export const HERMES_RULES = [
  { id: 'ezcast-dlna', match: [{ manufacturer: /ezcast|actions.?micro/i }, { friendlyName: /^ezcast/i }, { model: /^ez-?u0?2|ezcast/i }],
    kind: 'media-renderer', protocol: 'upnp-av', says: 'EZCast receiver. VM can play an address, pause, stop and set volume.',
    pairing: { method: 'none', steps: ['If VM cannot see it, switch on DLNA in EZCast’s app (older models call it "DMR").'], consentOnDevice: false },
    routes: ['upnp-av'], limits: [MIRACAST, 'VM drives it by DLNA only: it plays an address it can fetch and does not mirror. EZCast’s own app, EZAir and AirPlay are not used.', 'Its settings change in EZCast’s own app; VM never opens its admin pages.'] },
  { id: 'sonos', match: [{ st: /ZonePlayer:1/ }, { server: /sonos/i }, { manufacturer: /^sonos/i }],
    kind: 'speaker', protocol: 'upnp-av', says: 'Sonos speaker. VM can play an address, pause, stop and set volume.',
    pairing: { method: 'none', steps: [], consentOnDevice: false }, routes: ['upnp-av'], limits: ['Sonos’s local control is community-documented, not published by Sonos, and may change.'], typed: { port: 1400, path: '/xml/device_description.xml' } },
  { id: 'roku', match: [{ st: /^roku:ecp/i }, { manufacturer: /^roku/i }, { server: /roku/i }],
    kind: 'tv', protocol: 'roku-ecp', says: 'Roku TV or player. VM can press its remote’s keys, switch it on and off and open a channel by number.',
    pairing: { method: 'setting', steps: ['On the Roku: Settings > System > Advanced system settings > Control by mobile apps > Enabled.', 'Tick that you have read Roku’s policy on the Devices tab.'], consentOnDevice: false },
    routes: ['roku-ecp'], limits: ['Roku’s policy says ECP commands "may not be sent from 3rd-party platforms (for example, mobile applications)". The route stays off until you tick that you have read it.'], typed: { port: 8060, path: '/query/device-info' } },
  { id: 'lg-webos', match: [{ st: /webos-second-screen/i }, { manufacturer: /^LG Electronics/i }],
    kind: 'tv', protocol: 'lg-webos', says: 'LG webOS TV. VM can set volume, mute, play, pause, stop, use the arrow keys, open apps and switch it off.',
    pairing: { method: 'prompt', steps: ['Switch the TV on.', 'Click Pair, then accept VM’s request on the TV screen with its remote.'], consentOnDevice: true },
    routes: ['lg-webos'], limits: ['LG does not publish this route; it is community-documented. Some TVs may want LG’s own signed request and refuse VM’s.', 'VM cannot switch an LG TV on.'] },
  { id: 'samsung-tizen', match: [{ manufacturer: /^Samsung Electronics/i, deviceType: /MediaRenderer|RemoteControlReceiver/i }, { st: /samsung\.com:device:RemoteControlReceiver/i }],
    kind: 'tv', protocol: 'samsung-tizen', says: 'Samsung Tizen TV. VM can press its remote’s keys: arrows, OK, back, home, volume, play, pause, stop and power.',
    pairing: { method: 'allow', steps: ['Switch the TV on.', 'Click Pair, then choose Allow on the TV screen.'], consentOnDevice: true },
    routes: ['samsung-tizen'], limits: ['Samsung does not publish this route; it is community-documented. On some sets the pairing token is forgotten and the TV asks again.'], typed: { port: 8001, path: '/api/v2/' } },
  { id: 'hue', match: [{ mdnsType: /^_hue\._tcp/ }, { typedKind: /^hue$/ }],
    kind: 'hue-bridge', protocol: 'hue-clip2', says: 'Philips Hue bridge. After pairing, VM can switch, dim and colour its lights.',
    pairing: { method: 'link-button', steps: ['Press the round button on the Hue bridge, then Continue.'], consentOnDevice: true },
    routes: ['hue-clip2'], limits: ['VM checks the bridge’s certificate against Signify’s root when the root is set in the config file; otherwise it remembers the certificate it first saw and refuses a different one.'], typed: { port: 443, path: '/api/0/config' } },
  { id: 'lifx', match: [{ mdnsType: /^_lifx\._udp/ }, { via: /^lifx$/ }, { typedKind: /^lifx$/ }],
    kind: 'light', protocol: 'lifx-lan', says: 'LIFX light. VM can switch, dim and colour it.',
    pairing: { method: 'none', steps: [], consentOnDevice: false }, routes: ['lifx-lan'], limits: [], typed: { port: 56700 } },
  { id: 'wiz', match: [{ via: /^wiz$/ }, { typedKind: /^wiz$/ }],
    kind: 'light', protocol: 'wiz-udp', says: 'WiZ light. VM can switch, dim and colour it.',
    pairing: { method: 'setting', steps: ['In the WiZ app: Settings > Security > Allow Local Communication.'], consentOnDevice: false },
    routes: ['wiz-udp'], limits: ['WiZ’s local control is community-documented.'], typed: { port: 38899 } },
  { id: 'yeelight', match: [{ via: /^yeelight$/ }],
    kind: 'light', protocol: 'yeelight-lan', says: 'Yeelight light. VM can switch, dim and colour it.',
    pairing: { method: 'setting', steps: ['In the Yeelight app, switch on LAN Control for this light.'], consentOnDevice: false },
    routes: ['yeelight-lan'], limits: ['Look for devices finds Yeelights; a typed address is not enough, because they announce their identity only when asked on the network.'] },
  { id: 'shelly', match: [{ mdnsType: /^_shelly\._tcp/ }, { typedKind: /^shelly$/ }],
    kind: 'switch', protocol: 'shelly-rpc', says: 'Shelly relay or dimmer (second generation or later). VM can switch it, and dim a dimmer.',
    pairing: { method: 'password-if-set', steps: ['If you gave it a password in Shelly’s app, type it once; VM keeps only its hashed form.'], consentOnDevice: false },
    routes: ['shelly-rpc'], limits: ['A switch may run a heater, a pump or a door: add only what is safe to switch from a phone.'], typed: { port: 80, path: '/shelly' } },
  { id: 'tasmota', match: [{ typedKind: /^tasmota$/ }, { server: /tasmota/i }],
    kind: 'switch', protocol: 'tasmota-http', says: 'Tasmota device. VM can switch it, and dim and colour a light.',
    pairing: { method: 'password-if-set', steps: ['If you set a web password in Tasmota, type it once.'], consentOnDevice: false },
    routes: ['tasmota-http'], limits: ['A switch may run a heater, a pump or a door: add only what is safe to switch from a phone.', 'Tasmota sends a password in the address of each request, in clear on your Wi-Fi. Before each one VM checks the network card address this computer’s neighbour table holds for that address, and sends nothing if it is not the one paired; a device that copies another’s network card address could still receive it.'], typed: { port: 80, path: '/cm?cmnd=Status%205' } },
  { id: 'google-cast', match: [{ mdnsType: /^_googlecast\._tcp/ }], cannot: true, kind: 'cast', protocol: null,
    says: 'Google Cast device. VM cannot drive Google Cast in its first version.', pairing: { method: 'none', steps: [], consentOnDevice: false }, routes: [], limits: ['Google Cast is planned for the second version.'] },
  { id: 'airplay', match: [{ mdnsType: /^_airplay\._tcp/ }], cannot: true, kind: 'airplay', protocol: null,
    says: 'AirPlay receiver. VM does not use AirPlay: Apple does not publish it for other senders.', pairing: { method: 'none', steps: [], consentOnDevice: false }, routes: [], limits: [] },
  { id: 'home-assistant', match: [{ mdnsType: /^_home-assistant\._tcp/ }], cannot: true, kind: 'home-assistant', protocol: null,
    says: 'Home Assistant. VM reaches other brands through it: set its address in the bridge’s config file (homeAssistant.url), then give VM a token on the Devices tab.', pairing: { method: 'config-file', steps: ['Make a Home Assistant user for VM that is not an administrator, and a long-lived token for it (its profile > Security).'], consentOnDevice: false }, routes: ['home-assistant'], limits: [] },
  { id: 'mqtt-broker', match: [{ mdnsType: /^_mqtt\._tcp/ }], cannot: true, kind: 'broker', protocol: null,
    says: 'An MQTT broker. To publish the house to it, set it in the bridge’s config file (broker.url).', pairing: { method: 'config-file', steps: [], consentOnDevice: false }, routes: [], limits: [] },
  { id: 'dlna-generic', match: [{ deviceType: /MediaRenderer:1/ }, { st: /MediaRenderer:1/ }], generic: true,
    kind: 'media-renderer', protocol: 'upnp-av', says: 'Hermes does not know this device. Here is what it announced. It is a DLNA player, so it can be added as a generic DLNA player.',
    pairing: { method: 'none', steps: [], consentOnDevice: false }, routes: ['upnp-av'], limits: ['A generic DLNA player: what it supports is read from its own description.'] },
];
export const TYPED_KINDS = { roku: 'roku', hue: 'hue', shelly: 'shelly', tasmota: 'tasmota', wiz: 'wiz', lifx: 'lifx', sonos: 'sonos', samsung: 'samsung-tizen' };
/** Match facts against the rules: the first rule with an alternative whose every fact matches. */
export function hermesIdentify(facts) {
  for (const r of HERMES_RULES) if (r.match.some(alt => Object.entries(alt).every(([k, re]) => facts[k] != null && re.test(String(facts[k]))))) return r;
  return null;
}
/** A Hermes finding as a Hub message (design §6). */
export function hermesFinding(cand, rule, at) {
  const unknown = !rule;
  return {
    type: 'hermes.finding', v: 1, at, candidate: cand.id, known: cand.deviceId ? 'yours' : 'not-yet-yours',
    device: { kind: rule?.kind || 'unknown', maker: cand.maker || null, model: cand.model || null, name: cand.name || null },
    says: unknown ? 'Hermes does not know this device. Here is what it announced.' : rule.says,
    pairing: unknown ? { method: 'none', steps: [], consentOnDevice: false } : rule.pairing,
    routes: unknown ? [] : rule.routes, limits: unknown ? [] : rule.limits, source: unknown ? 'rule:none' : `rule:${rule.id}`,
  };
}

/* ---- Commands: the fixed action table and its argument rules -------------------------------------------------------- */
/** The keymap the page, the phone remote and the bridge share (lib/keymap.js must hold the same names). */
export const KEYMAP = {
  Up: { roku: 'Up', lg: 'UP', samsung: 'KEY_UP' }, Down: { roku: 'Down', lg: 'DOWN', samsung: 'KEY_DOWN' },
  Left: { roku: 'Left', lg: 'LEFT', samsung: 'KEY_LEFT' }, Right: { roku: 'Right', lg: 'RIGHT', samsung: 'KEY_RIGHT' },
  OK: { roku: 'Select', lg: 'ENTER', samsung: 'KEY_ENTER' }, Back: { roku: 'Back', lg: 'BACK', samsung: 'KEY_RETURN' },
  Home: { roku: 'Home', lg: 'HOME', samsung: 'KEY_HOME' }, VolumeUp: { roku: 'VolumeUp', lg: 'VOLUMEUP', samsung: 'KEY_VOLUP' },
  VolumeDown: { roku: 'VolumeDown', lg: 'VOLUMEDOWN', samsung: 'KEY_VOLDOWN' }, Mute: { roku: 'VolumeMute', lg: 'MUTE', samsung: 'KEY_MUTE' },
};
export const PHONE_KEYS = ['Up', 'Down', 'Left', 'Right', 'OK', 'Back', 'Home', 'VolumeUp', 'VolumeDown', 'Mute'];
/** Argument schema per action: field → [type, min, max]. Unknown fields are refused, numbers are clamped. */
export const ACTION_ARGS = {
  power: { on: ['boolean'] }, toggle: {}, brightness: { level: ['number', 0, 100] }, colour: { hex: ['colour'] },
  'colour-temp': { kelvin: ['number', 2000, 6500] }, volume: { level: ['number', 0, 100] }, mute: { on: ['boolean'] },
  'play-url': { url: ['url'] }, play: {}, pause: {}, stop: {}, seek: { seconds: ['number', 0, 86400] },
  key: { name: ['key'] }, launch: { app: ['app'] }, ha: { domain: ['word'], service: ['word'], entity: ['entity'], command: ['command', true] },
};
const LIMITED = new Set(['power', 'toggle', 'brightness', 'colour', 'colour-temp']); // at most 2 a second, 60 a minute
export const PHONE_ACTIONS = new Set(['power', 'toggle', 'brightness', 'colour', 'colour-temp', 'volume', 'mute', 'play', 'pause', 'stop', 'key', 'ha']);
export const BROKER_ACTIONS = new Set(['power', 'toggle', 'brightness', 'colour', 'colour-temp', 'volume', 'mute', 'play', 'pause', 'stop']);
export const HA_SERVICES = {
  light: ['turn_on', 'turn_off', 'toggle'], switch: ['turn_on', 'turn_off', 'toggle'],
  media_player: ['media_play', 'media_pause', 'media_stop', 'volume_set', 'volume_mute', 'turn_on', 'turn_off'], remote: ['send_command'],
};
/** Check and clamp a command's arguments. Throws IotError("unsupported") with plain words. */
export function checkArgs(action, args, { ceiling = 100, protocol = '' } = {}) {
  const schema = ACTION_ARGS[action];
  if (!schema) throw new IotError('unsupported', `"${cleanText(action, 24)}" is not one of VM’s commands.`);
  if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new IotError('unsupported', 'The command’s arguments must be an object.');
  const a = args || {}, out = {};
  for (const k of Object.keys(a)) if (!schema[k]) throw new IotError('unsupported', `"${cleanText(k, 24)}" is not a field of ${action}.`);
  for (const [k, [type, lo, hi]] of Object.entries(schema)) {
    const v = a[k];
    if (v === undefined) { if (type === 'command') continue; throw new IotError('unsupported', `${action} needs "${k}".`); }
    if (type === 'boolean') { if (typeof v !== 'boolean') throw new IotError('unsupported', `"${k}" must be true or false.`); out[k] = v; }
    else if (type === 'number') {
      const n = Number(v); if (typeof v !== 'number' || !Number.isFinite(n)) throw new IotError('unsupported', `"${k}" must be a number.`);
      const top = action === 'volume' ? Math.min(hi, ceiling) : hi;
      out[k] = Math.round(Math.min(top, Math.max(lo, n)));
    } else if (type === 'colour') { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/.test(v)) throw new IotError('unsupported', 'A colour is written #rrggbb in lower case.'); out[k] = v; }
    else if (type === 'url') {
      if (typeof v !== 'string' || Buffer.byteLength(v) > 2048 || /[\s<>"'\u0000-\u001f]/.test(v)) throw new IotError('unsupported', 'Give an http:// or https:// address of at most 2 KB, with no spaces or angle brackets.');
      let u; try { u = new URL(v); } catch { throw new IotError('unsupported', 'That is not an address.'); }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new IotError('unsupported', 'Only http:// and https:// addresses, with no user name or password in them.');
      out[k] = u.href;
    } else if (type === 'key') { if (typeof v !== 'string' || !Object.hasOwn(KEYMAP, v)) throw new IotError('unsupported', `Keys are ${Object.keys(KEYMAP).join(', ')}.`); out[k] = v; }
    else if (type === 'app') {
      const re = protocol === 'roku-ecp' ? /^\d{1,10}$/ : /^[a-z0-9.]{1,64}$/;
      if (typeof v !== 'string' || !re.test(v)) throw new IotError('unsupported', protocol === 'roku-ecp' ? 'A Roku channel is a number.' : 'An app id is lower-case letters, digits and dots.');
      out[k] = v;
    } else if (type === 'word') { if (typeof v !== 'string' || !/^[a-z_]{1,32}$/.test(v)) throw new IotError('unsupported', `"${k}" is not a Home Assistant name.`); out[k] = v; }
    else if (type === 'entity') { if (typeof v !== 'string' || !/^[a-z_]{1,32}\.[a-z0-9_]{1,64}$/.test(v)) throw new IotError('unsupported', 'That is not a Home Assistant entity.'); out[k] = v; }
    else if (type === 'command') { if (typeof v !== 'string' || !/^[A-Za-z0-9 _.-]{1,40}$/.test(v)) throw new IotError('unsupported', 'That is not a listed command.'); out[k] = v; }
  }
  return out;
}

/* ---- MQTT 3.1.1 (OASIS), hand-written: the packets byte for byte ------------------------------------------------------ */
export function mqttLength(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); if (out.length > 4) throw new Error('MQTT packet too large'); return Buffer.from(out); }
const mqStr = s => { const b = Buffer.isBuffer(s) ? s : Buffer.from(String(s), 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
const mqPacket = (first, body) => Buffer.concat([Buffer.from([first]), mqttLength(body.length), body]);
export const mqtt = {
  connect({ clientId, keepalive = 30, clean = true, username = '', password = '', will = null }) {
    let flags = clean ? 2 : 0;
    if (will) flags |= 4 | ((will.qos || 0) << 3) | (will.retain ? 32 : 0);
    if (!username) password = ''; // MQTT 3.1.1 [MQTT-3.1.2-22]: no password flag without a user name
    if (password) flags |= 64;
    if (username) flags |= 128;
    const ka = Buffer.alloc(2); ka.writeUInt16BE(keepalive);
    const parts = [mqStr('MQTT'), Buffer.from([4, flags]), ka, mqStr(clientId)];
    if (will) parts.push(mqStr(will.topic), mqStr(Buffer.isBuffer(will.payload) ? will.payload : Buffer.from(String(will.payload))));
    if (username) parts.push(mqStr(username));
    if (password) parts.push(mqStr(password));
    return mqPacket(0x10, Buffer.concat(parts));
  },
  publish({ topic, payload, qos = 0, retain = false, dup = false, packetId = 0 }) {
    const id = Buffer.alloc(qos ? 2 : 0); if (qos) id.writeUInt16BE(packetId);
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''));
    return mqPacket(0x30 | (dup ? 8 : 0) | (qos << 1) | (retain ? 1 : 0), Buffer.concat([mqStr(topic), id, data]));
  },
  puback(id) { const b = Buffer.alloc(2); b.writeUInt16BE(id); return mqPacket(0x40, b); },
  subscribe(id, topics) { const b = Buffer.alloc(2); b.writeUInt16BE(id); return mqPacket(0x82, Buffer.concat([b, ...topics.map(t => Buffer.concat([mqStr(t.topic), Buffer.from([t.qos || 0])]))])); },
  pingreq: () => Buffer.from([0xc0, 0]), disconnect: () => Buffer.from([0xe0, 0]),
};
/** Incremental MQTT parser: push(chunk) → decoded packets. */
export function mqttParser() {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    const out = [];
    for (;;) {
      if (buf.length < 2) break;
      let len = 0, mul = 1, i = 1, b;
      do { if (i >= buf.length) return out; b = buf[i++]; len += (b & 127) * mul; mul *= 128; if (i > 5) throw new Error('bad MQTT length'); } while (b & 128);
      if (buf.length < i + len) break;
      const type = buf[0] >> 4, flags = buf[0] & 15, body = buf.subarray(i, i + len);
      buf = buf.subarray(i + len);
      const p = { type, flags };
      if (type === 2) { p.sessionPresent = !!(body[0] & 1); p.returnCode = body[1]; }
      else if (type === 3) {
        const tl = body.readUInt16BE(0); p.topic = body.toString('utf8', 2, 2 + tl); p.qos = (flags >> 1) & 3; p.retain = !!(flags & 1);
        let o = 2 + tl; if (p.qos) { p.packetId = body.readUInt16BE(o); o += 2; } p.payload = Buffer.from(body.subarray(o));
      } else if (type === 4 || type === 11) p.packetId = body.readUInt16BE(0);
      else if (type === 9) { p.packetId = body.readUInt16BE(0); p.granted = [...body.subarray(2)]; }
      out.push(p);
    }
    return out;
  };
}

/* ---- Sparkplug B payloads (protobuf), hand-written: only the fields VM uses ---------------------------------------------- */
export const SP_TYPES = { Int32: 3, Int64: 4, UInt64: 8, Boolean: 11, String: 12 };
function pbVarint(v) { let n = BigInt(v); const out = []; if (n < 0n) n += 1n << 64n; do { let b = Number(n & 127n); n >>= 7n; if (n > 0n) b |= 128; out.push(b); } while (n > 0n); return Buffer.from(out); }
const pbKey = (field, wire) => pbVarint((field << 3) | wire);
const pbBytes = (field, b) => Buffer.concat([pbKey(field, 2), pbVarint(b.length), b]);
function spMetric(m) {
  const parts = [pbBytes(1, Buffer.from(m.name, 'utf8'))];
  if (m.timestamp != null) parts.push(pbKey(3, 0), pbVarint(m.timestamp));
  parts.push(pbKey(4, 0), pbVarint(m.datatype));
  if (m.value == null) parts.push(pbKey(7, 0), pbVarint(1));
  else if (m.datatype === SP_TYPES.Boolean) parts.push(pbKey(14, 0), pbVarint(m.value ? 1 : 0));
  else if (m.datatype === SP_TYPES.String) parts.push(pbBytes(15, Buffer.from(String(m.value), 'utf8')));
  else if (m.datatype === SP_TYPES.Int64 || m.datatype === SP_TYPES.UInt64) parts.push(pbKey(11, 0), pbVarint(m.value));
  else parts.push(pbKey(10, 0), pbVarint(Number(m.value) >>> 0));
  return Buffer.concat(parts);
}
/** Payload { timestamp, metrics: [{ name, datatype, value, timestamp }], seq } → protobuf bytes. */
export function spEncode({ timestamp, metrics = [], seq = null }) {
  const parts = [pbKey(1, 0), pbVarint(timestamp)];
  for (const m of metrics) parts.push(pbBytes(2, spMetric(m)));
  if (seq != null) parts.push(pbKey(3, 0), pbVarint(seq));
  return Buffer.concat(parts);
}
function pbRead(buf) {
  const fields = []; let o = 0;
  const varint = () => { let r = 0n, s = 0n; for (;;) { if (o >= buf.length) throw new Error('short varint'); const b = buf[o++]; r |= BigInt(b & 127) << s; s += 7n; if (!(b & 128)) return r; if (s > 70n) throw new Error('bad varint'); } };
  while (o < buf.length) {
    const key = Number(varint()), field = key >> 3, wire = key & 7;
    if (wire === 0) fields.push({ field, value: varint() });
    else if (wire === 2) { const len = Number(varint()); fields.push({ field, bytes: buf.subarray(o, o + len) }); o += len; }
    else if (wire === 1) { fields.push({ field, bytes: buf.subarray(o, o + 8) }); o += 8; }
    else if (wire === 5) { fields.push({ field, bytes: buf.subarray(o, o + 4) }); o += 4; }
    else throw new Error(`wire type ${wire}`);
  }
  return fields;
}
/** Decode a Sparkplug B payload (for tests and for NCMD/DCMD). Int64 values come back as Numbers. */
export function spDecode(buf) {
  const out = { timestamp: null, metrics: [], seq: null };
  for (const f of pbRead(buf)) {
    if (f.field === 1) out.timestamp = Number(f.value);
    else if (f.field === 3) out.seq = Number(f.value);
    else if (f.field === 2) {
      const m = { name: null, datatype: null, value: null };
      for (const g of pbRead(f.bytes)) {
        if (g.field === 1) m.name = g.bytes.toString('utf8');
        else if (g.field === 3) m.timestamp = Number(g.value);
        else if (g.field === 4) m.datatype = Number(g.value);
        else if (g.field === 7) m.isNull = !!g.value;
        else if (g.field === 10) m.value = Number(BigInt.asIntN(32, g.value));
        else if (g.field === 11) m.value = Number(g.value);
        else if (g.field === 14) m.value = !!g.value;
        else if (g.field === 15) m.value = g.bytes.toString('utf8');
      }
      out.metrics.push(m);
    }
  }
  return out;
}

/* ---- SHA-256 and HMAC, hand-written: the same code runs in the phone remote, where WebCrypto's subtle is missing ------ */
export function sha256(bytes) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
  m.set(bytes); m[len] = 0x80;
  const bits = len * 8; m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255; m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
  m[total - 5] = Math.floor(bits / 2 ** 32) & 255;
  const w = new Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (m[off + 4 * i] << 24) | (m[off + 4 * i + 1] << 16) | (m[off + 4 * i + 2] << 8) | m[off + 4 * i + 3];
    for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[4 * i] = (H[i] >>> 24) & 255; out[4 * i + 1] = (H[i] >>> 16) & 255; out[4 * i + 2] = (H[i] >>> 8) & 255; out[4 * i + 3] = H[i] & 255; }
  return out;
}
export function hmacSha256(key, msg) {
  let k = key.length > 64 ? sha256(key) : key;
  const pad = new Uint8Array(64); pad.set(k);
  const inner = new Uint8Array(64 + msg.length), outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { inner[i] = pad[i] ^ 0x36; outer[i] = pad[i] ^ 0x5c; }
  inner.set(msg, 64); outer.set(sha256(inner), 64);
  return sha256(outer);
}
/** The text a phone signs: method, path, the body's SHA-256, the timestamp and the nonce, one per line. */
export const signingText = (method, p, body, ts, nonce) => `${method}\n${p}\n${sha256hex(Buffer.from(body || ''))}\n${ts}\n${nonce}`;
/** Sign as the phone does: the HMAC key is the SHA-256 of the remote key, which is all the state file keeps. */
export function phoneSignature(remoteKey, method, p, body, ts, nonce) {
  const k = createHash('sha256').update(Buffer.from(remoteKey, 'base64url')).digest();
  return createHmac('sha256', k).update(signingText(method, p, body, ts, nonce)).digest('hex');
}

/* ---- The bridge window: setup steps wait for Y here ----------------------------------------------------------------- */
export function consoleConfirm(input = process.stdin, output = process.stdout) {
  if (!input.isTTY) return null;
  const rl = readline.createInterface({ input, output });
  let chain = Promise.resolve();
  // Each question has its own AbortController: on the 60-second timeout readline drops it, so the next step is
  // printed fresh under its own words and the Y typed for it counts for it, not for the question that timed out.
  const ask = question => (chain = chain.then(() => new Promise(resolve => {
    const ac = new AbortController();
    const timer = setTimeout(() => { ac.abort(); output.write('\n(no answer in 60 seconds: No)\n'); resolve(false); }, 60e3);
    rl.question(`\n${question} Y/N `, { signal: ac.signal }, a => { clearTimeout(timer); resolve(/^\s*y(es)?\s*$/i.test(a)); });
  })));
  ask.close = () => rl.close();
  return ask;
}
/** Windows' network profile for the home interface (Private, Public or DomainAuthenticated); "unknown" elsewhere. */
export function windowsProfile(iface) {
  if (process.platform !== 'win32' || !iface) return Promise.resolve('unknown');
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-NetConnectionProfile -InterfaceAlias '${String(iface).replace(/'/g, "''")}' -ErrorAction SilentlyContinue).NetworkCategory`],
    { timeout: 8000, windowsHide: true }, (e, out) => resolve(e ? 'unknown' : (String(out).trim().split(/\s+/)[0] || 'unknown'))));
}
/** A network card (MAC) address written aa:bb:cc:dd:ee:ff, or null. */
export const normMac = m => { const p = String(m || '').trim().toLowerCase().split(/[:-]/); return p.length === 6 && p.every(x => /^[0-9a-f]{1,2}$/.test(x)) ? p.map(x => x.padStart(2, '0')).join(':') : null; };
/** The MAC that a neighbour-table listing (arp -a, arp -n or ip neigh) gives for exactly this IPv4 address. */
export function macIn(text, ip) {
  for (const line of String(text).split(/\r?\n/)) {
    const tokens = line.trim().split(/[\s()]+/);
    if (!tokens.includes(ip)) continue;
    for (const t of tokens) { const m = normMac(t); if (m && m !== 'ff:ff:ff:ff:ff:ff' && m !== '00:00:00:00:00:00') return m; }
  }
  return null;
}
/** This computer's own neighbour table entry for an IPv4 address on the home network: the MAC of whatever device holds
 *  it now, or null. It only reads the local table (arp -a on Windows, arp -n on macOS, ip neigh elsewhere) and sends
 *  nothing, so the device's identity is checked without its password. */
export function neighbourMac(ip) {
  if (parseIPv4(ip) == null) return Promise.resolve(null);
  const [cmd, args] = process.platform === 'win32' ? ['arp', ['-a', ip]] : process.platform === 'darwin' ? ['arp', ['-n', ip]] : ['ip', ['neigh', 'show', ip]];
  return new Promise(resolve => execFile(cmd, args, { timeout: 4000, windowsHide: true }, (e, out) => resolve(e ? null : macIn(out, ip))));
}
/** The passive NOTIFY listener on port 1900 is optional; a busy port (Windows' own SSDP service) only switches it off. */
export function listenPassive(bind, log = () => {}) {
  try { return bind(); } catch (e) { log(`Port 1900 is busy (${e.code || e.message}); VM still asks, it just does not overhear announcements.`); return null; }
}

/* =====================================================================================================================
 * createIot: the IoT Connect service. `deps` (all optional) are the seams the tests use:
 *   policy "loopback" | "home"; resolver (name → loopback IP); portMap ("ip:port" → fake's port); interfaces();
 *   profile() → Promise<"Private"|"Public"|"unknown">; confirm(question) → Promise<boolean> (null: no bridge window);
 *   now() (fake clock); discoverySource(kinds) → [{ via, packet, from: { address, port } }]; windowMs (discovery wait);
 *   hueRootCA (PEM); aiCa (PEM for the fake AI host); log(text).
 * ===================================================================================================================== */
export function createIot(o, deps = {}) {
  const cfg = o.iot;
  const now = deps.now || Date.now;
  const iso = () => new Date(now()).toISOString().replace(/\.\d+Z$/, 'Z');
  const confirm = 'confirm' in deps ? deps.confirm : null;
  const interfaces = deps.interfaces || (() => os.networkInterfaces());
  const profile = deps.profile || (() => windowsProfile(cfg.interface));
  const policy = deps.policy || 'home';
  const ownPorts = [o.port, cfg.lan.port];
  const netx = deps.net || makeNet({ policy, resolver: deps.resolver, portMap: deps.portMap, interfaces, homeInterface: cfg.interface, ownPorts, timeout: deps.timeout || 4000,
    allowInternet: host => aiOn() && host === new URL(cfg.aiUrl).hostname });
  const store = openState(cfg.state || defaultStatePath(), { bridgeDir: deps.bridgeDir });
  const S = store.data;
  const secretValues = () => {
    const v = [cfg.haToken, cfg.mqttPassword, cfg.aiKey, S.ha.token];
    for (const d of S.devices) for (const x of Object.values(d.secret || {})) if (typeof x === 'string') v.push(x);
    return v.filter(Boolean);
  };
  const log = t => (deps.log || (() => {}))(scrub(t, secretValues()));
  const save = () => store.save();
  // The Home Assistant token is tied to its URL: a new URL in the config file deletes the token and the ticks.
  if (S.ha.url && S.ha.url !== cfg.homeAssistant.url) { S.ha = { url: '', token: '', entities: [] }; S.devices = S.devices.filter(d => d.protocol !== 'home-assistant'); save(); }

  const candidates = new Map(), findings = new Map(), states = new Map(), aiPending = new Map();
  const typed = { busy: false, times: [], last: [] };
  const pairing = { code: null, expires: 0, tries: 0 };
  const nonces = new Map();
  let lastProfile = 'unknown';

  /* -- Ask in the bridge window ------------------------------------------------------------------------------------- */
  async function ask(question) {
    if (!confirm) throw new IotError('refused', 'Setup steps need Y in the bridge window, and this bridge has no window to ask in. Start it from a terminal.');
    const yes = await confirm(question);
    if (!yes) throw new IotError('refused', 'Not confirmed in the bridge window.');
  }

  /* -- Public views (never a secret) ----------------------------------------------------------------------------------- */
  const publicDevice = d => { const { secret, ...rest } = d; return { ...rest, paired: !!(secret && Object.keys(secret).some(k => k !== 'pin' && secret[k])), state: states.get(d.id) || null }; };
  const publicCandidate = c => ({ id: c.id, via: c.via, kind: c.kind, protocol: c.protocol, name: c.name, maker: c.maker, model: c.model, address: c.address,
    known: c.deviceId ? 'yours' : 'not-yet-yours', label: c.deviceId ? 'Already one of your devices' : 'Found on this network, not yet known to be yours',
    deviceId: c.deviceId || null, canAdd: !c.rule?.cannot, generic: !!c.rule?.generic, announcement: c.announcement, finding: findings.get(c.id) || null, seenAt: c.seenAt });
  function sharedNetwork() {
    const all = [...candidates.values()];
    const tvs = all.filter(c => c.kind === 'tv').length, players = all.filter(c => c.kind === 'media-renderer' || c.kind === 'speaker').length;
    const reasons = [];
    if (tvs > 3) reasons.push(`${tvs} TVs answered`);
    if (players > 10) reasons.push(`${players} players answered`);
    if (all.length > 25) reasons.push(`${all.length} devices answered`);
    if (lastProfile === 'Public') reasons.push('Windows marks this network Public');
    return { shared: reasons.length > 0, reasons, ownHome: !!S.network.ownHome,
      words: reasons.length ? 'This looks like a shared network. Devices here may belong to other people.' : null };
  }
  const NEEDS_PAIRING = new Set(['hue-clip2', 'lg-webos', 'samsung-tizen']);

  /* -- Discovery ---------------------------------------------------------------------------------------------------------- */
  function upsertCandidate(c) {
    const prev = candidates.get(c.id);
    const merged = { ...(prev || {}), ...c, seenAt: iso() };
    const dev = S.devices.find(d => d.identity && merged.identity && d.identity.value === merged.identity.value);
    if (dev) merged.deviceId = dev.id;
    merged.rule = hermesIdentify(merged.facts || {});
    if (merged.rule) { merged.kind = merged.rule.kind; merged.protocol = merged.rule.protocol; }
    candidates.set(c.id, merged);
    findings.set(c.id, hermesFinding(merged, merged.rule, iso()));
    return merged;
  }
  async function readText(url, opts = {}) {
    const r = await netx.request({ url, timeout: 3000, maxBytes: 65536, ...opts });
    if (r.status !== 200) throw new IotError('no-answer', NO_ANSWER);
    return r;
  }
  async function fromSsdp(packet, from) {
    const p = parseSsdp(packet);
    if (!p) return null;
    const h = p.headers, st = h.st || h.nt || '';
    if (from.port === 1982 || /^yeelight:\/\//i.test(h.location || '')) return fromYeelight(h, from, packet);
    if (!SSDP_TARGETS.includes(st)) return null;
    let loc; try { loc = new URL(h.location); } catch { return null; }
    // The description must come from the device that answered, never from an address its announcement names.
    if (loc.hostname !== from.address || !/^https?:$/.test(loc.protocol)) return null;
    const facts = { via: 'ssdp', st, server: h.server || '', usn: h.usn || '' };
    let xml = '';
    try { xml = (await readText(loc.href)).body.toString('utf8'); } catch { /* keep the announcement alone */ }
    if (xml) Object.assign(facts, { manufacturer: xmlText(xml, 'manufacturer'), model: xmlText(xml, 'modelName'), modelNumber: xmlText(xml, 'modelNumber'), deviceType: xmlText(xml, 'deviceType'), friendlyName: xmlText(xml, 'friendlyName'), udn: xmlText(xml, 'UDN') });
    const services = xml ? xmlBlocks(xml, 'service').map(b => ({ type: xmlText(b, 'serviceType'), control: xmlText(b, 'controlURL'), scpd: xmlText(b, 'SCPDURL') })) : [];
    // UPnP 1.0: relative control URLs resolve against <URLBase> when the description names one (on the same host only).
    let urlBase = null;
    if (xml) { try { const ub = new URL(xmlText(xml, 'URLBase')); if (ub.hostname === from.address && /^https?:$/.test(ub.protocol)) urlBase = ub.href; } catch { /* none */ } }
    const identity = facts.udn ? { type: 'udn', value: facts.udn } : { type: 'usn', value: (h.usn || '').split('::')[0] || `${from.address}` };
    return upsertCandidate({ id: `ssdp-${shortHash(identity.value)}`, via: 'ssdp', address: from.address, port: Number(loc.port) || 80, location: loc.href, urlBase, name: cleanText(facts.friendlyName || facts.model || 'Unnamed device'),
      maker: cleanText(facts.manufacturer) || null, model: cleanText(facts.model) || null, identity, facts, services, announcement: cleanText(packet.toString('utf8'), 2000) });
  }
  function fromYeelight(h, from, packet) {
    let loc; try { loc = new URL(String(h.location).replace(/^yeelight:/i, 'http:')); } catch { return null; }
    if (loc.hostname !== from.address || !h.id) return null;
    return upsertCandidate({ id: `yeelight-${shortHash(h.id)}`, via: 'yeelight', address: from.address, port: Number(loc.port) || 55443, name: cleanText(h.name || `Yeelight ${h.model || ''}`),
      maker: 'Yeelight', model: cleanText(h.model) || null, identity: { type: 'yeelight-id', value: String(h.id) }, facts: { via: 'yeelight', model: h.model, support: h.support },
      support: String(h.support || '').split(/\s+/), announcement: cleanText(packet.toString('utf8'), 2000) });
  }
  async function fromMdns(packet, from) {
    let msg; try { msg = mdnsDecode(packet); } catch { return []; }
    const out = [], recs = msg.records;
    for (const ptr of recs.filter(r => r.type === 'PTR')) {
      const type = MDNS_TYPES.find(t => t === ptr.name.toLowerCase());
      if (!type) continue;
      const inst = ptr.data, srv = recs.find(r => r.type === 'SRV' && r.name === inst)?.data, txt = recs.find(r => r.type === 'TXT' && r.name === inst)?.data || {};
      const addr = srv ? recs.find(r => r.type === 'A' && r.name === srv.target)?.data : null;
      if (addr && addr !== from.address) continue; // an answer about another address is not used
      const label = inst.slice(0, inst.length - type.length - 1);
      const idv = txt.bridgeid || txt.id || txt.uuid || txt.mac || inst;
      const facts = { via: 'mdns', mdnsType: type.replace(/\.local$/, ''), txt };
      const c = { id: `mdns-${shortHash(idv)}`, via: 'mdns', address: from.address, port: srv?.port || null, name: cleanText(txt.fn || txt.name || label), maker: null, model: cleanText(txt.modelid || txt.md || txt.app || '') || null,
        identity: { type: txt.bridgeid ? 'hue-bridge-id' : txt.uuid ? 'ha-uuid' : 'txt-id', value: String(idv) }, facts, announcement: cleanText(JSON.stringify({ instance: inst, txt }), 2000) };
      // One description read for kinds that have one (Hue's config, Shelly's identity).
      if (/^_hue\._tcp/.test(facts.mdnsType)) { const d = await hueDescribe(from.address).catch(() => null); if (d) Object.assign(c, d); }
      if (/^_shelly\._tcp/.test(facts.mdnsType)) { const d = await shellyDescribe(from.address).catch(() => null); if (d) Object.assign(c, d); }
      out.push(upsertCandidate(c));
    }
    return out;
  }
  function fromWiz(packet, from) {
    let j; try { j = JSON.parse(packet.toString('utf8')); } catch { return null; }
    const mac = j?.result?.mac;
    if (!/^[0-9a-f]{12}$/i.test(String(mac || ''))) return null;
    return upsertCandidate({ id: `wiz-${shortHash(mac)}`, via: 'wiz', address: from.address, port: 38899, name: `WiZ light ${String(mac).slice(-4)}`, maker: 'WiZ', model: null,
      identity: { type: 'mac', value: String(mac).toLowerCase() }, facts: { via: 'wiz' }, announcement: cleanText(packet.toString('utf8'), 2000) });
  }
  function fromLifx(packet, from) {
    const p = lifxParse(packet);
    if (!p || p.type !== 3 || p.payload[0] !== 1) return null;
    return upsertCandidate({ id: `lifx-${shortHash(p.target)}`, via: 'lifx', address: from.address, port: p.payload.readUInt32LE(1) || 56700, name: `LIFX light ${p.target.slice(-4)}`, maker: 'LIFX', model: null,
      identity: { type: 'mac', value: p.target }, facts: { via: 'lifx' }, announcement: p.target });
  }
  /** Feed one packet to the right listener (the real sockets call this; tests call it with fixture packets). */
  async function inject(via, packet, from) {
    const buf = Buffer.isBuffer(packet) ? packet : Buffer.from(packet);
    // Only answers from an address the bridge may reach (on the home interface and no other; loopback under the test
    // policy) are read at all, so an answer heard through a VPN or another adapter never becomes a candidate.
    const src = String(from?.address || '').replace(/^::ffff:/, '');
    if (parseIPv4(src) == null && parseIPv6(src) == null) return null;
    try { await netx.target(src, Number(from?.port) || 9); } catch { return null; }
    from = { ...from, address: src };
    if (via === 'ssdp' || via === 'yeelight') return fromSsdp(buf, from);
    if (via === 'mdns') return fromMdns(buf, from);
    if (via === 'wiz') return fromWiz(buf, from);
    if (via === 'lifx') return fromLifx(buf, from);
    return null;
  }
  async function realDiscovery(windowMs) {
    const packets = [], sockets = [];
    const open = (port, build) => {
      const d = netx.discoverySocket();
      d.socket.on('message', (msg, rinfo) => { if (packets.length < 500) packets.push({ via: port === 1982 ? 'yeelight' : port === 5353 ? 'mdns' : port === 38899 ? 'wiz' : port === 56700 ? 'lifx' : 'ssdp', packet: msg, from: { address: rinfo.address, port } }); });
      d.socket.on('error', () => {});
      d.socket.bind(0, d.home.address, () => { try { if (port === 38899 || port === 56700) d.socket.setBroadcast(true); else d.socket.setMulticastInterface(d.home.address); build(d); } catch (e) { log(`Discovery: ${e.message}`); } });
      sockets.push(d.socket);
    };
    open(1900, d => { for (const st of SSDP_TARGETS) d.send(ssdpSearch(st), 1900, '239.255.255.250'); });
    open(1982, d => d.send(ssdpSearch('wifi_bulb', 1982), 1982, '239.255.255.250'));
    open(5353, d => d.send(mdnsQuery(MDNS_TYPES), 5353, '224.0.0.251'));
    open(38899, d => d.send(Buffer.from(JSON.stringify({ method: 'registration', params: { phoneMac: 'AAAAAAAAAAAA', register: false, phoneIp: '1.2.3.4', id: '1' } })), 38899, d.home.broadcast));
    open(56700, d => d.send(lifxPacket(2, Buffer.alloc(0), { tagged: true, resRequired: true }), 56700, d.home.broadcast));
    const passive = listenPassive(() => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.on('error', () => {});
      s.on('message', (msg, rinfo) => packets.push({ via: 'ssdp', packet: msg, from: { address: rinfo.address, port: 1900 } }));
      // Windows delivers multicast to a socket bound to the interface's own address; elsewhere it must be the wildcard,
      // and inject() then drops anything not from the home network.
      const home = homeAddress(interfaces(), cfg.interface)?.address;
      s.bind({ port: 1900, address: process.platform === 'win32' ? home : undefined }, () => { try { s.addMembership('239.255.255.250', home); } catch { /* optional */ } });
      return s;
    }, log);
    if (passive) sockets.push(passive);
    await new Promise(r => setTimeout(r, windowMs));
    for (const s of sockets) try { s.close(); } catch { /* ignore */ }
    return packets;
  }
  async function discover() {
    lastProfile = await profile().catch(() => 'unknown');
    const windowMs = deps.windowMs ?? 3000;
    const packets = policy === 'loopback' ? (deps.discoverySource ? await deps.discoverySource() : []) : await realDiscovery(windowMs);
    for (const [k, c] of candidates) if (now() - Date.parse(c.seenAt) > 10 * 60e3) candidates.delete(k);
    for (const p of packets) await inject(p.via, p.packet, p.from).catch(e => log(`Discovery: ${e.message}`));
    return [...candidates.values()].map(publicCandidate);
  }

  /* -- Typed address: one at a time, 10 an hour, never a run of three neighbours ---------------------------------------- */
  async function identify({ kind, address }) {
    if (!Object.hasOwn(TYPED_KINDS, kind)) throw new IotError('unsupported', `A typed address works for ${Object.keys(TYPED_KINDS).join(', ')}. Use Look for devices for the others.`);
    if (typeof address !== 'string' || (parseIPv4(address) == null && parseIPv6(address) == null)) throw new IotError('unsupported', 'Type an IP address such as 192.168.1.31, with no port: the port comes from the kind.');
    if (typed.busy) throw new IotError('rate-limited', 'VM looks up one address at a time.');
    typed.times = typed.times.filter(t => now() - t < 3600e3);
    if (typed.times.length >= 10) throw new IotError('rate-limited', 'At most 10 typed addresses an hour.');
    const n = parseIPv4(address), [a, b] = typed.last;
    if (n != null && a != null && b != null && ((b === a + 1 && n === b + 1) || (b === a - 1 && n === b - 1))) throw new IotError('refused', 'VM looks up one address you know, not a run of neighbouring addresses.');
    const port = HERMES_RULES.find(r => r.id === TYPED_KINDS[kind]).typed.port;
    const tg = await netx.target(address, port).catch(e => { throw new IotError('refused', e.message); });
    typed.busy = true; typed.times.push(now()); typed.last = [b ?? null, n ?? null].slice(-2);
    const t0 = Date.now(), holdMs = deps.identifyHoldMs ?? 3000;
    try {
      lastProfile = await profile().catch(() => 'unknown');
      const d = await typedRead(kind, tg.ip).catch(() => null);
      if (!d) {
        // A refused port answers at once and an empty address only after the read's 3-second timeout; every failure
        // waits until 3 seconds from the start, so a page cannot tell from the time which addresses hold a computer.
        const wait = holdMs - (Date.now() - t0);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        throw new IotError('no-answer', NO_ANSWER);
      }
      return publicCandidate(upsertCandidate({ via: 'typed', address: tg.ip, ...d, facts: { ...(d.facts || {}), typedKind: kind } }));
    } finally { typed.busy = false; }
  }
  async function typedRead(kind, ip) {
    if (kind === 'roku') {
      const xml = (await readText(`http://${ip}:8060/query/device-info`)).body.toString('utf8');
      const serial = xmlText(xml, 'serial-number'), udn = xmlText(xml, 'udn');
      if (!serial && !udn) return null;
      return { id: `typed-${shortHash(serial || udn)}`, port: 8060, name: cleanText(xmlText(xml, 'friendly-device-name') || xmlText(xml, 'user-device-name') || 'Roku'), maker: 'Roku', model: cleanText(xmlText(xml, 'model-name')) || null,
        identity: { type: 'serial', value: serial || udn }, facts: { manufacturer: 'Roku', model: xmlText(xml, 'model-name') }, location: `http://${ip}:8060/`, announcement: cleanText(xml, 2000) };
    }
    if (kind === 'hue') { const d = await hueDescribe(ip); return d && { ...d, id: `typed-${shortHash(d.identity.value)}` }; }
    if (kind === 'shelly') { const d = await shellyDescribe(ip); return d && { ...d, id: `typed-${shortHash(d.identity.value)}` }; }
    if (kind === 'tasmota') {
      const r = await netx.request({ url: `http://${ip}/cm?cmnd=Status%205`, timeout: 3000, maxBytes: 65536 });
      const j = r.status === 200 ? JSON.parse(r.body.toString('utf8')) : null;
      const mac = j?.StatusNET?.Mac;
      if (r.status === 401) return { id: `typed-${shortHash(`tasmota-${ip}`)}`, port: 80, name: 'Tasmota device', maker: 'Tasmota', model: null, identity: { type: 'mac', value: null }, protected: true, facts: {}, announcement: 'Password set' };
      if (!mac) return null;
      return { id: `typed-${shortHash(mac)}`, port: 80, name: cleanText(j.StatusNET.Hostname || 'Tasmota device'), maker: 'Tasmota', model: null, identity: { type: 'mac', value: mac.toLowerCase() }, facts: {}, announcement: cleanText(JSON.stringify(j), 2000) };
    }
    if (kind === 'wiz') {
      const r = await netx.udp(ip, 38899, Buffer.from('{"method":"getSystemConfig","params":{}}'), { accept: m => /getSystemConfig/.test(m.toString()) });
      if (!r) return null;
      const j = JSON.parse(r.msg.toString('utf8')), mac = j?.result?.mac;
      if (!mac) return null;
      return { id: `typed-${shortHash(mac)}`, port: 38899, name: `WiZ light ${String(mac).slice(-4)}`, maker: 'WiZ', model: cleanText(j.result.moduleName) || null, identity: { type: 'mac', value: String(mac).toLowerCase() }, facts: {}, announcement: cleanText(r.msg.toString(), 2000) };
    }
    if (kind === 'lifx') {
      const r = await netx.udp(ip, 56700, lifxPacket(2, Buffer.alloc(0), { resRequired: true }), { accept: m => lifxParse(m)?.type === 3 });
      if (!r) return null;
      const p = lifxParse(r.msg);
      return { id: `typed-${shortHash(p.target)}`, port: 56700, name: `LIFX light ${p.target.slice(-4)}`, maker: 'LIFX', model: null, identity: { type: 'mac', value: p.target }, facts: {}, announcement: p.target };
    }
    if (kind === 'sonos' || kind === 'samsung') {
      if (kind === 'samsung') {
        const j = JSON.parse((await readText(`http://${ip}:8001/api/v2/`)).body.toString('utf8'));
        const dv = j?.device; if (!dv?.id) return null;
        return { id: `typed-${shortHash(dv.id)}`, port: 8001, name: cleanText(dv.name || 'Samsung TV'), maker: 'Samsung Electronics', model: cleanText(dv.modelName) || null, identity: { type: 'udn', value: String(dv.id) },
          facts: { manufacturer: 'Samsung Electronics', deviceType: 'RemoteControlReceiver' }, announcement: cleanText(JSON.stringify(dv), 2000) };
      }
      const xml = (await readText(`http://${ip}:1400/xml/device_description.xml`)).body.toString('utf8');
      const udn = xmlText(xml, 'UDN'); if (!udn) return null;
      return { id: `typed-${shortHash(udn)}`, port: 1400, location: `http://${ip}:1400/xml/device_description.xml`, name: cleanText(xmlText(xml, 'friendlyName') || 'Sonos'), maker: cleanText(xmlText(xml, 'manufacturer')) || 'Sonos', model: cleanText(xmlText(xml, 'modelName')) || null,
        identity: { type: 'udn', value: udn }, facts: { manufacturer: xmlText(xml, 'manufacturer'), deviceType: xmlText(xml, 'deviceType'), st: 'urn:schemas-upnp-org:device:ZonePlayer:1' },
        services: xmlBlocks(xml, 'service').map(b2 => ({ type: xmlText(b2, 'serviceType'), control: xmlText(b2, 'controlURL'), scpd: xmlText(b2, 'SCPDURL') })), announcement: cleanText(xml, 2000) };
    }
    return null;
  }

  /* -- Ownership: Add, remove, rename ----------------------------------------------------------------------------------- */
  function actionsFor(protocol, extra = {}) {
    return ({
      'upnp-av': ['play-url', 'play', ...(extra.pause === false ? [] : ['pause']), 'stop', 'seek', 'volume', 'mute'],
      'roku-ecp': ['power', 'key', 'launch', 'play', 'pause'], 'hue-clip2': [], 'hue-light': ['power', 'toggle', 'brightness', 'colour', 'colour-temp'],
      'shelly-rpc': extra.light ? ['power', 'toggle', 'brightness'] : ['power', 'toggle'], 'tasmota-http': ['power', 'toggle', 'brightness', 'colour', 'colour-temp'],
      'wiz-udp': ['power', 'brightness', 'colour', 'colour-temp'], 'yeelight-lan': ['power', 'toggle', 'brightness', 'colour', 'colour-temp'],
      'lifx-lan': ['power', 'brightness', 'colour', 'colour-temp'], 'lg-webos': ['power', 'volume', 'mute', 'play', 'pause', 'stop', 'key', 'launch'],
      'samsung-tizen': ['power', 'key', 'play', 'pause', 'stop'],
    })[protocol] || [];
  }
  const deviceKindLabel = p => ({ 'upnp-av': 'DLNA player', 'roku-ecp': 'Roku', 'hue-clip2': 'Hue bridge', 'shelly-rpc': 'Shelly', 'tasmota-http': 'Tasmota', 'wiz-udp': 'WiZ', 'yeelight-lan': 'Yeelight', 'lifx-lan': 'LIFX', 'lg-webos': 'LG webOS', 'samsung-tizen': 'Samsung Tizen' })[p] || p;
  const cleanRoom = r => cleanText(r, 40);
  /** The device's UNS place: its area and a name no other device in that area uses (a clash gets -2, -3). */
  function unsPlace(area, name, selfId = null) {
    const base = slug(name);
    let n = base, i = 2;
    while (S.devices.some(x => x.id !== selfId && x.uns?.area === area && x.uns?.name === n)) n = `${base}-${i++}`;
    return { area, name: n };
  }
  async function add({ candidate, name, room, owned }) {
    if (owned !== true) throw new IotError('refused', 'Tick "This device is mine, or I have its owner’s permission to control it" first.');
    const c = candidates.get(String(candidate || ''));
    if (!c) throw new IotError('unknown-device', 'That device has not been found: look for devices or type its address again.');
    if (c.deviceId) throw new IotError('refused', 'That device is already one of yours.');
    if (!c.rule || c.rule.cannot) throw new IotError('unsupported', c.rule ? c.rule.says : 'Hermes does not know this device, so VM cannot add it.');
    lastProfile = await profile().catch(() => 'unknown');
    const sh = sharedNetwork();
    if (sh.shared && !S.network.ownHome && !NEEDS_PAIRING.has(c.protocol)) throw new IotError('refused', `${sh.words} Tick "This is my own home network" before adding a device that needs no pairing.`);
    const label = cleanText(name || c.name, 64) || c.name, roomName = cleanRoom(room || '');
    await ask(`Add ${label}, ${c.address}, ${deviceKindLabel(c.protocol)}?`);
    const extra = await onAdd(c);
    const dev = {
      id: `${{ 'upnp-av': 'upnp', 'roku-ecp': 'roku', 'hue-clip2': 'hue', 'shelly-rpc': 'shelly', 'tasmota-http': 'tasmota', 'wiz-udp': 'wiz', 'yeelight-lan': 'yeelight', 'lifx-lan': 'lifx', 'lg-webos': 'lg', 'samsung-tizen': 'samsung' }[c.protocol]}-${shortHash(c.identity.value || c.id)}`,
      kind: c.kind, protocol: c.protocol, name: label, room: roomName, address: c.address, port: c.port || null,
      identity: c.identity, status: 'ok', ownership: { statement: 'mine-or-permission', at: iso() },
      actions: actionsFor(c.protocol, extra), secret: null, volumeCeiling: cfg.volumeCeiling, uns: unsPlace(slug(roomName || 'house'), label),
      hermesRule: c.rule.id, notes: extra.notes || [], ...(extra.fields || {}),
    };
    if (S.devices.some(d => d.id === dev.id)) throw new IotError('refused', 'That device is already one of yours.');
    S.devices.push(dev); save();
    c.deviceId = dev.id; findings.set(c.id, hermesFinding(c, c.rule, iso()));
    log(`Added ${dev.name} (${deviceKindLabel(dev.protocol)})`);
    uns.birth(dev);
    return dev;
  }
  async function onAdd(c) {
    if (c.protocol === 'upnp-av') {
      const av = (c.services || []).find(s => /AVTransport:1$/.test(s.type)), rc = (c.services || []).find(s => /RenderingControl:1$/.test(s.type));
      if (!av) throw new IotError('unsupported', 'This player does not offer AVTransport, so VM cannot drive it.');
      const base = c.urlBase || c.location || `http://${c.address}:${c.port}/`;
      const inside = u => { try { const x = new URL(u, base); return x.hostname === c.address && /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
      const control = { av: inside(av.control), rc: rc ? inside(rc.control) : null };
      if (!control.av) throw new IotError('unsupported', 'This player names a control address on another device, so VM will not use it.');
      let pause = true;
      const scpd = inside(av.scpd);
      if (scpd) { try { const xml = (await readText(scpd)).body.toString('utf8'); pause = xmlBlocks(xml, 'action').some(b => xmlText(b, 'name') === 'Pause'); } catch { /* assume offered */ } }
      return { pause, notes: pause ? [] : ['This player has no Pause: use Stop, which goes back to the start.'], fields: { control } };
    }
    if (c.protocol === 'shelly-rpc') return { light: /dimmer|light|rgbw/i.test(`${c.model} ${c.facts?.txt?.app || ''} ${c.app || ''}`), fields: { authRealm: c.authRealm || null, protected: !!c.protected } };
    if (c.protocol === 'tasmota-http') return { fields: { protected: !!c.protected } };
    if (c.protocol === 'hue-clip2') return { notes: ['Pair it to see its lights: press the round button on the Hue bridge, then Continue.'], fields: { bridgeId: c.identity.value } };
    if (c.protocol === 'yeelight-lan') return { fields: { support: c.support || [] } };
    return {};
  }
  function removeDevice({ device }) {
    const d = deviceById(device);
    const ids = [d.id, ...S.devices.filter(x => x.parent === d.id).map(x => x.id)];
    for (const id of ids) { const x = S.devices.find(y => y.id === id); if (x) uns.death(x, true); states.delete(id); }
    S.devices = S.devices.filter(x => !ids.includes(x.id));
    if (d.protocol === 'home-assistant') S.ha.entities = S.ha.entities.filter(e => e.entity !== d.entity);
    for (const c of candidates.values()) if (ids.includes(c.deviceId)) { c.deviceId = null; findings.set(c.id, hermesFinding(c, c.rule, iso())); }
    save();
    return { removed: ids };
  }
  async function updateDevice({ device, name, room, volumeCeiling }) {
    const d = deviceById(device);
    if (volumeCeiling != null) {
      if (typeof volumeCeiling !== 'number' || volumeCeiling < 0 || volumeCeiling > 100) throw new IotError('unsupported', 'The volume ceiling is 0–100.');
      if (volumeCeiling > d.volumeCeiling) await ask(`Raise the volume ceiling of ${d.name} to ${Math.round(volumeCeiling)}?`);
      d.volumeCeiling = Math.round(volumeCeiling);
    }
    if (name != null) { const n = cleanText(name, 64); if (!n) throw new IotError('unsupported', 'A name is needed.'); d.name = n; }
    if (room != null) d.room = cleanRoom(room);
    if (name != null || room != null) { uns.death(d, true); d.uns = unsPlace(slug(d.room || 'house'), d.name, d.id); uns.birth(d); }
    save();
    return d;
  }
  function deviceById(id) {
    const d = S.devices.find(x => x.id === String(id || ''));
    if (!d) throw new IotError('unknown-device', 'That is not one of your devices.');
    return d;
  }

  /* -- Identity before secrets ------------------------------------------------------------------------------------------- */
  const idChecked = new Map();
  async function checkIdentity(d) {
    if (now() - (idChecked.get(d.id) || 0) < 60e3) return;
    let value = null;
    if (d.protocol === 'shelly-rpc') value = (await shellyDescribe(d.address).catch(() => null))?.identity?.value;
    else if (d.protocol === 'samsung-tizen') value = JSON.parse((await readText(`http://${d.address}:8001/api/v2/`)).body.toString('utf8'))?.device?.id;
    else if (d.protocol === 'home-assistant') return;
    else return;
    if (!value) throw new IotError('no-answer', NO_ANSWER);
    if (String(value).toLowerCase() !== String(d.identity.value).toLowerCase()) return markMoved(d);
    idChecked.set(d.id, now());
  }
  function markMoved(d) {
    d.status = 'moved'; save(); uns.death(d);
    throw new IotError('moved', 'A different device now answers at this address, so VM sent it nothing. Look for devices again, or remove and re-add it.');
  }
  const secretOf = d => (d.parent ? S.devices.find(x => x.id === d.parent)?.secret : d.secret) || {};

  /* -- Pairing ---------------------------------------------------------------------------------------------------------- */
  async function pair({ device, password }) {
    const d = deviceById(device);
    if (d.protocol === 'hue-clip2') {
      await ask(`Pair ${d.name}, ${d.address}, Hue bridge? (Press its round button first.)`);
      const pin = await hueTls(d);
      const r = await netx.request({ method: 'POST', url: `https://${d.address}/api`, tls: pin, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devicetype: 'vm#bridge' }) });
      const j = JSON.parse(r.body.toString('utf8') || '[]');
      if (j[0]?.error?.type === 101) throw new IotError('not-paired', 'Press the round button on the Hue bridge, then Continue.');
      const user = j[0]?.success?.username;
      if (!user) throw new IotError('not-paired', 'The Hue bridge did not pair.');
      d.secret = { appKey: user, pin: r.fingerprint }; save();
      const lights = await hueLights(d);
      return { device: publicDevice(d), lights: lights.map(publicDevice) };
    }
    if (d.protocol === 'lg-webos') {
      await ask(`Pair ${d.name}, ${d.address}, LG webOS? (Accept on the TV screen next.)`);
      const s = await lgSession(d, { pairing: true });
      s.close();
      return { device: publicDevice(d) };
    }
    if (d.protocol === 'samsung-tizen') {
      await checkIdentity(d);
      await ask(`Pair ${d.name}, ${d.address}, Samsung Tizen? (Choose Allow on the TV screen next.)`);
      const s = await samsungSession(d, { pairing: true });
      s.close();
      return { device: publicDevice(d) };
    }
    if (d.protocol === 'shelly-rpc' || d.protocol === 'tasmota-http') {
      if (typeof password !== 'string' || !password || password.length > 128) throw new IotError('unsupported', 'Type the password you gave the device in its own app.');
      await ask(`Store the password for ${d.name}, ${d.address}, ${deviceKindLabel(d.protocol)}?`);
      const wasProtected = !!d.protected;
      if (d.protocol === 'shelly-rpc') {
        await checkIdentity(d);
        const realm = d.authRealm || (await shellyDescribe(d.address))?.authRealm || d.identity.value;
        d.secret = { ha1: sha256hex(`admin:${realm}:${password}`) }; d.authRealm = realm; d.protected = true;
      } else { d.secret = { password }; d.protected = true; }
      save();
      // One harmless read proves the password; a refusal, or no usable answer, keeps nothing, so a wrong password is
      // reported and is never stored as if pairing had worked.
      await readState(d).catch(e => {
        d.secret = null; d.protected = wasProtected; save();
        if (e.code === 'moved' || e.reason === 'identity') throw e;
        if (e.code === 'refused') throw new IotError('not-paired', 'The device did not accept that password.');
        throw new IotError('no-answer', 'The device did not answer, so VM did not keep the password. Try again when it is on.');
      });
      return { device: publicDevice(d) };
    }
    throw new IotError('unsupported', 'This device needs no pairing.');
  }

  /* -- Drivers: one per protocol, each a fixed table ------------------------------------------------------------------ */
  // UPnP AV (DLNA players, the EZCast U02, Sonos): AVTransport:1 and RenderingControl:1 only.
  async function soap(d, which, action, args) {
    const url = d.control?.[which];
    if (!url) throw new IotError('unsupported', 'This player does not offer that.');
    const service = `urn:schemas-upnp-org:service:${which === 'av' ? 'AVTransport' : 'RenderingControl'}:1`;
    const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">${Object.entries(args).map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`;
    const r = await netx.request({ method: 'POST', url, headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${service}#${action}"` }, body });
    if (r.status !== 200) throw new IotError(r.status === 500 && /<errorCode>401</.test(r.body.toString()) ? 'unsupported' : 'no-answer', r.status === 500 ? 'The player refused that command.' : NO_ANSWER);
    return r.body.toString('utf8');
  }
  const hms = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
  const upnp = {
    async command(d, action, a) {
      const I = { InstanceID: 0 };
      if (action === 'play-url') { await soap(d, 'av', 'SetAVTransportURI', { ...I, CurrentURI: a.url, CurrentURIMetaData: didlFor(a.url) }); await soap(d, 'av', 'Play', { ...I, Speed: 1 }); }
      else if (action === 'play') await soap(d, 'av', 'Play', { ...I, Speed: 1 });
      else if (action === 'pause') await soap(d, 'av', 'Pause', I);
      else if (action === 'stop') await soap(d, 'av', 'Stop', I);
      else if (action === 'seek') await soap(d, 'av', 'Seek', { ...I, Unit: 'REL_TIME', Target: hms(a.seconds) });
      else if (action === 'volume') await soap(d, 'rc', 'SetVolume', { ...I, Channel: 'Master', DesiredVolume: a.level });
      else if (action === 'mute') await soap(d, 'rc', 'SetMute', { ...I, Channel: 'Master', DesiredMute: a.on ? 1 : 0 });
      return upnp.read(d);
    },
    async read(d) {
      const t = xmlText(await soap(d, 'av', 'GetTransportInfo', { InstanceID: 0 }), 'CurrentTransportState');
      let volume = null;
      if (d.control?.rc) volume = Number(xmlText(await soap(d, 'rc', 'GetVolume', { InstanceID: 0, Channel: 'Master' }), 'CurrentVolume')) || 0;
      return { online: true, power: null, brightness: null, volume, playback: { PLAYING: 'playing', PAUSED_PLAYBACK: 'paused', STOPPED: 'stopped', TRANSITIONING: 'loading', NO_MEDIA_PRESENT: 'stopped' }[t] || cleanText(t, 20).toLowerCase() || null };
    },
  };
  // Roku ECP: fixed keys and /launch/<digits> only; never /install, /input or /search. Off until the policy is ticked.
  const roku = {
    async command(d, action, a) {
      if (!S.policy.roku) throw new IotError('refused', 'Tick that you have read Roku’s policy on the Devices tab first: it says ECP commands "may not be sent from 3rd-party platforms (for example, mobile applications)".');
      const key = action === 'key' ? KEYMAP[a.name].roku : action === 'power' ? (a.on ? 'PowerOn' : 'PowerOff') : action === 'play' || action === 'pause' ? 'Play' : null;
      const p = action === 'launch' ? `/launch/${a.app}` : key ? `/keypress/${key}` : null;
      if (!p || !/^\/(keypress\/[A-Za-z]+|launch\/\d+)$/.test(p)) throw new IotError('unsupported', 'Roku does not take that command.');
      const r = await netx.request({ method: 'POST', url: `http://${d.address}:8060${p}`, body: '' });
      if (r.status === 403) throw new IotError('refused', 'The Roku refused: switch on Settings > System > Advanced system settings > Control by mobile apps.');
      if (r.status !== 200 && r.status !== 202) throw new IotError('no-answer', NO_ANSWER);
      return roku.read(d);
    },
    async read(d) {
      const xml = (await readText(`http://${d.address}:8060/query/device-info`)).body.toString('utf8');
      const serial = xmlText(xml, 'serial-number');
      if (serial && d.identity.type === 'serial' && serial !== d.identity.value) markMoved(d);
      return { online: true, power: /PowerOn/i.test(xmlText(xml, 'power-mode')) ? true : xmlText(xml, 'power-mode') ? false : null, brightness: null, volume: null, playback: null };
    },
  };
  // Philips Hue CLIP v2 over HTTPS: the certificate is checked (Signify's root when configured, CN = bridge id) or pinned.
  async function hueDescribe(ip) {
    const r = await netx.request({ url: `https://${ip}/api/0/config`, tls: { mode: 'tofu' }, timeout: 3000, maxBytes: 65536 });
    const j = JSON.parse(r.body.toString('utf8'));
    if (!j?.bridgeid) return null;
    const problem = certProblem(r.cert, deps.hueRootCA || (cfg.hue.rootCA ? readFileSync(cfg.hue.rootCA, 'utf8') : ''), j.bridgeid);
    if (problem) return null;
    return { port: 443, name: cleanText(j.name || 'Hue Bridge'), maker: 'Signify', model: cleanText(j.modelid) || null, identity: { type: 'hue-bridge-id', value: String(j.bridgeid).toLowerCase() },
      facts: { mdnsType: '_hue._tcp', typedKind: 'hue' }, announcement: cleanText(JSON.stringify({ name: j.name, bridgeid: j.bridgeid, modelid: j.modelid, swversion: j.swversion }), 2000) };
  }
  async function hueTls(d) {
    const root = deps.hueRootCA || (cfg.hue.rootCA ? readFileSync(cfg.hue.rootCA, 'utf8') : '');
    const sec = secretOf(d);
    if (root) return { mode: 'ca', ca: root, expectCN: d.bridgeId || d.identity.value };
    if (sec.pin) return { mode: 'pin', pin: sec.pin };
    return { mode: 'ca', ca: '', expectCN: d.bridgeId || d.identity.value };
  }
  async function hueCall(d, method, p, body) {
    const b = d.parent ? deviceById(d.parent) : d, sec = secretOf(d);
    if (!sec.appKey) throw new IotError('not-paired', 'Press the round button on the Hue bridge, then Continue.');
    const t = await hueTls(b);
    const r = await netx.request({ method, url: `https://${b.address}${p}`, tls: t.mode === 'ca' && !t.ca ? { mode: 'pin', pin: sec.pin } : t, headers: { 'hue-application-key': sec.appKey, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : null });
    if (r.status === 403 || r.status === 401) throw new IotError('not-paired', 'The Hue bridge no longer knows VM: pair it again.');
    if (r.status !== 200 && r.status !== 207) throw new IotError('no-answer', NO_ANSWER);
    return JSON.parse(r.body.toString('utf8') || '{}');
  }
  async function hueLights(b) {
    const j = await hueCall(b, 'GET', '/clip/v2/resource/light');
    const out = [];
    for (const l of (j.data || []).slice(0, 100)) {
      if (!/^[0-9a-f-]{8,64}$/i.test(l.id)) continue;
      let d = S.devices.find(x => x.parent === b.id && x.hueId === l.id);
      if (!d) {
        d = { id: `hue-${shortHash(`${b.identity.value}/${l.id}`)}`, kind: 'light', protocol: 'hue-light', name: cleanText(l.metadata?.name || 'Hue light'), room: b.room, address: b.address, port: 443,
          identity: { type: 'hue-light', value: l.id }, status: 'ok', ownership: { statement: 'through-paired-bridge', at: iso(), bridge: b.id }, actions: actionsFor('hue-light'), secret: null,
          volumeCeiling: 0, uns: unsPlace(b.uns.area, l.metadata?.name || 'hue-light'), hermesRule: 'hue', notes: [], parent: b.id, hueId: l.id };
        S.devices.push(d); uns.birth(d);
      }
      states.set(d.id, hueState(l));
      out.push(d);
    }
    save();
    return out;
  }
  const hueState = l => ({ online: true, power: !!l.on?.on, brightness: l.dimming ? Math.round(l.dimming.brightness) : null, volume: null, playback: null });
  const hue = {
    async command(d, action, a) {
      if (d.protocol === 'hue-clip2') throw new IotError(secretOf(d).appKey ? 'unsupported' : 'not-paired', secretOf(d).appKey ? 'Command a light, not the bridge.' : 'Press the round button on the Hue bridge, then Continue.');
      let body;
      if (action === 'power') body = { on: { on: a.on } };
      else if (action === 'toggle') { const cur = await hueCall(d, 'GET', `/clip/v2/resource/light/${d.hueId}`); body = { on: { on: !cur.data?.[0]?.on?.on } }; }
      else if (action === 'brightness') body = { on: { on: a.level > 0 }, dimming: { brightness: Math.max(1, a.level) } };
      else if (action === 'colour') body = { on: { on: true }, color: { xy: hexToXy(a.hex) } };
      else if (action === 'colour-temp') body = { on: { on: true }, color_temperature: { mirek: Math.min(500, Math.max(153, Math.round(1e6 / a.kelvin))) } };
      await hueCall(d, 'PUT', `/clip/v2/resource/light/${d.hueId}`, body);
      return hue.read(d);
    },
    async read(d) { if (d.protocol === 'hue-clip2') return { online: true, power: null, brightness: null, volume: null, playback: null }; const j = await hueCall(d, 'GET', `/clip/v2/resource/light/${d.hueId}`); return hueState(j.data?.[0] || {}); },
  };
  // Shelly Gen2+ JSON-RPC over HTTP; its own password kept only as HA1 (SHA-256 digest, Shelly's documented scheme).
  async function shellyDescribe(ip) {
    const j = JSON.parse((await readText(`http://${ip}/shelly`)).body.toString('utf8'));
    if (!j?.id || !j?.mac || !(j.gen >= 2)) return null;
    return { port: 80, name: cleanText(j.name || j.id), maker: 'Shelly', model: cleanText(j.model) || null, app: j.app, identity: { type: 'mac', value: String(j.mac).toLowerCase() },
      protected: !!j.auth_en, authRealm: j.auth_domain || j.id, facts: { mdnsType: '_shelly._tcp', typedKind: 'shelly' }, announcement: cleanText(JSON.stringify(j), 2000) };
  }
  async function shellyRpc(d, method, params) {
    const sec = secretOf(d);
    if (d.protected && !sec.ha1) throw new IotError('not-paired', 'This Shelly has a password: type it once on the Devices tab.');
    if (sec.ha1) await checkIdentity(d);
    const call = async (auth, headers = {}) => {
      const r = await netx.request({ method: 'POST', url: `http://${d.address}/rpc`, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ id: 1, src: 'vm-bridge', method, params, ...(auth ? { auth } : {}) }) });
      let j = {}; try { j = JSON.parse(r.body.toString('utf8') || '{}') || {}; } catch { j = {}; } // a 401 over HTTP may have a text body
      return { status: r.status, j, challenge: r.headers['www-authenticate'] || '' };
    };
    let { status, j, challenge } = await call(null);
    if ((status === 401 || j.error?.code === 401) && sec.ha1) {
      // Shelly's documented HTTP form: the challenge in WWW-Authenticate, answered with an Authorization: Digest header
      // whose ha2 is SHA-256 of "POST:/rpc" and whose nc is 00000001. The JSON error frame (ha2 of
      // "dummy_method:dummy_uri", the auth object in the body) is the WebSocket form, kept only as a fallback.
      let dg = parseDigest(challenge);
      if (dg.nonce) {
        const nc = '00000001', qop = 'auth', q = v => String(v).replace(/["\\]/g, '');
        const answer = ch => { const cnonce = randomBytes(8).toString('hex'); return { cnonce, realm: ch.realm || d.authRealm, response: sha256hex(`${sec.ha1}:${ch.nonce}:${nc}:${cnonce}:${qop}:${sha256hex('POST:/rpc')}`) }; };
        let a = answer(dg);
        ({ status, j, challenge } = await call(null, { Authorization: `Digest username="admin", realm="${q(a.realm)}", nonce="${q(dg.nonce)}", uri="/rpc", algorithm=SHA-256, qop=${qop}, nc=${nc}, cnonce="${a.cnonce}", response="${a.response}"${dg.opaque ? `, opaque="${q(dg.opaque)}"` : ''}` }));
        // Some firmware reads the same answer from an auth object in the body instead: one more try, the same password.
        if (status === 401 && (dg = parseDigest(challenge)).nonce) {
          a = answer(dg);
          ({ status, j } = await call({ realm: a.realm, username: 'admin', nonce: dg.nonce, cnonce: a.cnonce, nc, response: a.response, algorithm: 'SHA-256' }));
        }
      } else {
        let ch = {}; try { ch = JSON.parse(j.error?.message || '{}'); } catch { /* none */ }
        if (!ch.nonce) throw new IotError('refused', 'The Shelly refused.');
        const cn = randomInt(1, 2 ** 31), response = sha256hex(`${sec.ha1}:${ch.nonce}:${ch.nc || 1}:${cn}:auth:${sha256hex('dummy_method:dummy_uri')}`);
        ({ status, j } = await call({ realm: ch.realm || d.authRealm, username: 'admin', nonce: ch.nonce, cnonce: cn, response, algorithm: 'SHA-256' }));
      }
    }
    if (status === 401 || j.error?.code === 401) throw new IotError('refused', 'The Shelly refused that password.');
    if (status !== 200 || j.error) throw new IotError('no-answer', NO_ANSWER);
    return j.result;
  }
  const shelly = {
    async command(d, action, a) {
      const comp = d.actions.includes('brightness') ? 'Light' : 'Switch';
      if (action === 'power') await shellyRpc(d, `${comp}.Set`, { id: 0, on: a.on });
      else if (action === 'toggle') await shellyRpc(d, `${comp}.Toggle`, { id: 0 });
      else if (action === 'brightness') await shellyRpc(d, 'Light.Set', { id: 0, on: a.level > 0, brightness: Math.max(1, a.level) });
      return shelly.read(d);
    },
    async read(d) {
      const comp = d.actions.includes('brightness') ? 'Light' : 'Switch';
      const s = await shellyRpc(d, `${comp}.GetStatus`, { id: 0 });
      return { online: true, power: !!s?.output, brightness: s?.brightness ?? null, volume: null, playback: null };
    },
  };
  // Tasmota over HTTP /cm: Power, Dimmer, Color and CT only. Its password travels in the address of each request, so
  // before every request that carries it VM checks, without the password, which device holds the address now: the MAC
  // in this computer's own neighbour table must be the one paired, else the device is "moved" and gets nothing.
  const neighbour = deps.neighbourMac || (policy === 'loopback' ? async () => null : neighbourMac);
  async function tasmotaIdentity(d) {
    // A TCP connection, closed at once with no bytes sent, makes sure the table holds whatever answers there now.
    try { const c = await netx.tcp(d.address, 80, { timeout: 3000 }); c.socket.destroy(); } catch (e) { if (e.code === 'refused') throw e; }
    const mac = normMac(await neighbour(d.address).catch(() => null));
    if (!mac) throw Object.assign(new IotError('refused', 'VM could not confirm this is the Tasmota you paired (this computer’s neighbour table has no network card address for it), so it sent no password.'), { reason: 'identity' });
    if (!d.identity.value) { d.identity.value = mac; save(); return; } // first password request: pairing, just confirmed with Y
    if (mac !== normMac(d.identity.value)) markMoved(d);
  }
  async function tasmotaCm(d, cmnd) {
    const sec = secretOf(d);
    if (d.protected && !sec.password) throw new IotError('not-paired', 'This Tasmota has a password: type it once on the Devices tab.');
    if (sec.password) await tasmotaIdentity(d);
    const q = `cmnd=${encodeURIComponent(cmnd)}${sec.password ? `&user=admin&password=${encodeURIComponent(sec.password)}` : ''}`;
    const r = await netx.request({ url: `http://${d.address}/cm?${q}` });
    if (r.status === 401) throw new IotError('refused', 'The Tasmota refused that password.');
    if (r.status !== 200) throw new IotError('no-answer', NO_ANSWER);
    return JSON.parse(r.body.toString('utf8') || '{}');
  }
  const tasmotaState = j => ({ online: true, power: j.POWER != null ? j.POWER === 'ON' : null, brightness: j.Dimmer ?? null, volume: null, playback: null });
  const tasmota = {
    async command(d, action, a) {
      const cmnd = { power: () => `Power ${a.on ? 'On' : 'Off'}`, toggle: () => 'Power Toggle', brightness: () => `Dimmer ${a.level}`, colour: () => `Color ${a.hex.slice(1).toUpperCase()}`, 'colour-temp': () => `CT ${Math.min(500, Math.max(153, Math.round(1e6 / a.kelvin)))}` }[action];
      await tasmota.checkMac(d);
      const j = await tasmotaCm(d, cmnd());
      return { ...tasmotaState(j), ...(j.POWER == null ? (await tasmota.read(d)) : {}) };
    },
    async checkMac(d) {
      if (secretOf(d).password) return; // checked before every request that carries the password (tasmotaIdentity)
      if (now() - (idChecked.get(d.id) || 0) < 60e3) return;
      const mac = (await tasmotaCm(d, 'Status 5'))?.StatusNET?.Mac;
      if (mac && d.identity.value && mac.toLowerCase() !== d.identity.value) markMoved(d);
      if (mac && !d.identity.value) { d.identity.value = mac.toLowerCase(); save(); }
      idChecked.set(d.id, now());
    },
    async read(d) { return tasmotaState(await tasmotaCm(d, 'State')); },
  };
  // WiZ: JSON over UDP 38899 (community-documented).
  async function wizCall(d, method, params) {
    const r = await netx.udp(d.address, 38899, Buffer.from(JSON.stringify({ method, params })), { accept: m => { try { return JSON.parse(m.toString()).method === method; } catch { return false; } } });
    if (!r) throw new IotError('no-answer', NO_ANSWER);
    const j = JSON.parse(r.msg.toString('utf8'));
    if (j.error) throw new IotError('no-answer', 'The light refused that command.');
    return j.result || {};
  }
  const wiz = {
    async command(d, action, a) {
      const params = action === 'power' ? { state: a.on } : action === 'brightness' ? { state: a.level > 0, dimming: Math.min(100, Math.max(10, a.level)) }
        : action === 'colour' ? (() => { const [r, g, b] = hexRgb(a.hex); return { state: true, r, g, b }; })() : { state: true, temp: Math.min(6500, Math.max(2200, a.kelvin)) };
      await wizCall(d, 'setPilot', params);
      return wiz.read(d);
    },
    async read(d) {
      const r = await wizCall(d, 'getPilot', {});
      if (r.mac && String(r.mac).toLowerCase() !== d.identity.value) markMoved(d);
      return { online: true, power: !!r.state, brightness: r.dimming ?? null, volume: null, playback: null };
    },
  };
  // Yeelight: JSON lines over TCP 55443 (Yeelight's own Inter-Operation Spec).
  async function yeelightCall(d, method, params) {
    const { socket } = await netx.tcp(d.address, d.port || 55443);
    return new Promise((resolveP, reject) => {
      let buf = '';
      const timer = setTimeout(() => { socket.destroy(); reject(new IotError('no-answer', NO_ANSWER)); }, 3000);
      socket.on('data', c => {
        buf += c.toString('utf8');
        for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.id !== 1) continue; // notifications have no id
          clearTimeout(timer); socket.end();
          if (j.error) reject(new IotError('no-answer', 'The light refused that command: is LAN Control on?')); else resolveP(j.result);
        }
      });
      socket.on('error', () => { clearTimeout(timer); reject(new IotError('no-answer', NO_ANSWER)); });
      socket.write(`${JSON.stringify({ id: 1, method, params })}\r\n`);
    });
  }
  const yeelight = {
    async command(d, action, a) {
      const map = { power: ['set_power', [a.on ? 'on' : 'off', 'smooth', 300]], toggle: ['toggle', []], brightness: ['set_bright', [Math.max(1, a.level), 'smooth', 300]],
        colour: ['set_rgb', [a.hex ? parseInt(a.hex.slice(1), 16) : 0, 'smooth', 300]], 'colour-temp': ['set_ct_abx', [Math.min(6500, Math.max(2000, a.kelvin ?? 4000)), 'smooth', 300]] }[action];
      if (d.support?.length && !d.support.includes(map[0])) throw new IotError('unsupported', 'This light does not offer that.');
      await yeelightCall(d, map[0], map[1]);
      return yeelight.read(d);
    },
    async read(d) { const r = await yeelightCall(d, 'get_prop', ['power', 'bright']); return { online: true, power: r?.[0] === 'on', brightness: Number(r?.[1]) || null, volume: null, playback: null }; },
  };
  // LIFX LAN: binary UDP 56700.
  async function lifxCall(d, type, payload, want) {
    const seq = randomInt(0, 255), src = 0x564d0000 | randomInt(1, 0xffff);
    const r = await netx.udp(d.address, d.port || 56700, lifxPacket(type, payload, { target: d.identity.value, source: src, sequence: seq, resRequired: want === 107, ackRequired: want === 45 }),
      { accept: m => { const p = lifxParse(m); return !!p && p.source === src && p.type === want; } });
    if (!r) throw new IotError('no-answer', NO_ANSWER);
    const p = lifxParse(r.msg);
    if (p.target !== d.identity.value) markMoved(d);
    return p;
  }
  async function lifxGet(d) {
    const p = await lifxCall(d, 101, Buffer.alloc(0), 107);
    const pl = p.payload;
    return { h: pl.readUInt16LE(0), s: pl.readUInt16LE(2), b: pl.readUInt16LE(4), k: pl.readUInt16LE(6), power: pl.readUInt16LE(10) > 0 };
  }
  const lifxColour = (h, s, b, k) => { const pl = Buffer.alloc(13); pl.writeUInt16LE(h & 0xffff, 1); pl.writeUInt16LE(s & 0xffff, 3); pl.writeUInt16LE(b & 0xffff, 5); pl.writeUInt16LE(k, 7); pl.writeUInt32LE(300, 9); return pl; };
  const lifx = {
    async command(d, action, a) {
      if (action === 'power') { const pl = Buffer.alloc(6); pl.writeUInt16LE(a.on ? 65535 : 0, 0); pl.writeUInt32LE(300, 2); await lifxCall(d, 117, pl, 45); }
      else {
        const c = await lifxGet(d);
        if (action === 'brightness') await lifxCall(d, 102, lifxColour(c.h, c.s, Math.round(a.level / 100 * 65535), c.k || 3500), 45);
        else if (action === 'colour') { const v = hexToHsv(a.hex); await lifxCall(d, 102, lifxColour(Math.round(v.h / 360 * 65535), Math.round(v.s * 65535), Math.round(v.v * 65535), 3500), 45); }
        else await lifxCall(d, 102, lifxColour(c.h, 0, c.b, Math.min(9000, Math.max(1500, a.kelvin))), 45);
      }
      return lifx.read(d);
    },
    async read(d) { const c = await lifxGet(d); return { online: true, power: c.power, brightness: Math.round(c.b / 65535 * 100), volume: null, playback: null }; },
  };
  // LG webOS (community-documented): WSS 3001, PROMPT pairing with only the permissions VM needs; the TV's certificate pinned.
  const LG_PERMISSIONS = ['LAUNCH', 'CONTROL_AUDIO', 'CONTROL_POWER', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_JOYSTICK', 'READ_INSTALLED_APPS'];
  async function lgSession(d, { pairing = false } = {}) {
    const sec = d.secret || {};
    if (!pairing && !sec.clientKey) throw new IotError('not-paired', 'Pair the TV first: click Pair, then accept on the TV screen.');
    const ws = await wsConnect(netx, `wss://${d.address}:3001/`, { tls: sec.pin ? { mode: 'pin', pin: sec.pin } : { mode: 'tofu' } });
    let n = 0;
    const waiting = new Map();
    let registered;
    const reg = new Promise((res, rej) => { registered = { res, rej }; });
    ws.on('message', m => {
      let j; try { j = JSON.parse(m.toString('utf8')); } catch { return; }
      if (j.type === 'registered') registered.res(j.payload?.['client-key']);
      else if (j.type === 'error' && String(j.id).startsWith('register')) registered.rej(new IotError('refused', 'The TV refused the pairing.'));
      else if (waiting.has(j.id)) { const w = waiting.get(j.id); waiting.delete(j.id); if (j.type === 'error' || j.payload?.returnValue === false) w.rej(new IotError('no-answer', 'The TV refused that command.')); else w.res(j.payload || {}); }
    });
    ws.on('close', () => { registered.rej(new IotError('no-answer', NO_ANSWER)); for (const w of waiting.values()) w.rej(new IotError('no-answer', NO_ANSWER)); waiting.clear(); });
    ws.send(JSON.stringify({ type: 'register', id: 'register_0', payload: { forcePairing: false, pairingType: 'PROMPT', ...(sec.clientKey ? { 'client-key': sec.clientKey } : {}),
      manifest: { manifestVersion: 1, appVersion: '2.0', permissions: LG_PERMISSIONS } } }));
    const timer = setTimeout(() => registered.rej(new IotError(pairing ? 'not-paired' : 'no-answer', pairing ? 'The TV was not accepted in time: click Pair again and accept on the TV screen.' : NO_ANSWER)), pairing ? (deps.pairWaitMs || 60e3) : 5000);
    try {
      const key = await reg;
      if (pairing) { d.secret = { clientKey: key, pin: ws.fingerprint }; save(); }
    } catch (e) { ws.destroy(); throw e; } finally { clearTimeout(timer); }
    return {
      request(uri, payload = {}) { const id = `vm_${++n}`; return new Promise((res, rej) => { waiting.set(id, { res, rej }); ws.send(JSON.stringify({ type: 'request', id, uri, payload })); setTimeout(() => { if (waiting.delete(id)) rej(new IotError('no-answer', NO_ANSWER)); }, 4000).unref(); }); },
      close: () => ws.close(),
    };
  }
  const lg = {
    async command(d, action, a) {
      if (action === 'power' && a.on) throw new IotError('unsupported', 'VM cannot switch an LG TV on: use its own remote.');
      const s = await lgSession(d);
      try {
        if (action === 'key' && a.name === 'VolumeUp') {
          const v = await s.request('ssap://audio/getVolume').catch(() => null), cur = v?.volume ?? v?.volumeStatus?.volume, ceiling = d.volumeCeiling ?? 80;
          if (typeof cur !== 'number') throw new IotError('refused', 'The TV did not say how loud it is, so VM did not press Volume up.');
          if (cur + 1 > ceiling) throw new IotError('refused', `Volume stops at ${ceiling}, this device’s ceiling.`);
        }
        if (action === 'key') {
          const { socketPath } = await s.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
          const u = new URL(socketPath);
          if (u.hostname !== d.address || u.protocol !== 'wss:') throw new IotError('refused', 'The TV named a pointer address elsewhere, so VM did not use it.');
          const ps = await wsConnect(netx, u.href, { tls: { mode: 'pin', pin: d.secret.pin } });
          ps.send(`type:button\nname:${KEYMAP[a.name].lg}\n\n`);
          await new Promise(r => setTimeout(r, 50)); ps.close();
        } else {
          const [uri, payload] = { power: ['ssap://system/turnOff', {}], volume: ['ssap://audio/setVolume', { volume: a.level }], mute: ['ssap://audio/setMute', { mute: a.on }],
            play: ['ssap://media.controls/play', {}], pause: ['ssap://media.controls/pause', {}], stop: ['ssap://media.controls/stop', {}], launch: ['ssap://system.launcher/launch', { id: a.app }] }[action];
          await s.request(uri, payload);
        }
        const v = action === 'power' ? null : await s.request('ssap://audio/getVolume').catch(() => null);
        return { online: action !== 'power', power: action === 'power' ? false : true, brightness: null, volume: v?.volume ?? v?.volumeStatus?.volume ?? null, playback: { play: 'playing', pause: 'paused', stop: 'stopped' }[action] || null };
      } finally { s.close(); }
    },
    async read(d) { const s = await lgSession(d); try { const v = await s.request('ssap://audio/getVolume'); return { online: true, power: true, brightness: null, volume: v?.volume ?? null, playback: null }; } finally { s.close(); } },
  };
  // Samsung Tizen (community-documented): WSS 8002, Allow on the TV, the token kept; the certificate pinned.
  async function samsungSession(d, { pairing = false } = {}) {
    const sec = d.secret || {};
    if (!pairing && !sec.token) throw new IotError('not-paired', 'Pair the TV first: click Pair, then choose Allow on the TV screen.');
    const name = Buffer.from('Vitruvian Manager').toString('base64');
    const ws = await wsConnect(netx, `wss://${d.address}:8002/api/v2/channels/samsung.remote.control?name=${name}${sec.token ? `&token=${encodeURIComponent(sec.token)}` : ''}`, { tls: sec.pin ? { mode: 'pin', pin: sec.pin } : { mode: 'tofu' } });
    const token = await new Promise((res, rej) => {
      const timer = setTimeout(() => { ws.destroy(); rej(new IotError(pairing ? 'not-paired' : 'no-answer', pairing ? 'The TV was not allowed in time: click Pair again and choose Allow.' : NO_ANSWER)); }, pairing ? (deps.pairWaitMs || 30e3) : 5000);
      ws.on('message', m => {
        let j; try { j = JSON.parse(m.toString('utf8')); } catch { return; }
        if (j.event === 'ms.channel.connect') { clearTimeout(timer); res(j.data?.token || sec.token || null); }
        else if (j.event === 'ms.channel.unauthorized') { clearTimeout(timer); ws.destroy(); rej(new IotError('refused', 'The TV refused VM. Allow it on the TV screen, or in its device connection settings.')); }
      });
      ws.on('close', () => { clearTimeout(timer); rej(new IotError('no-answer', NO_ANSWER)); });
    });
    if (pairing) { d.secret = { token: token || '', pin: ws.fingerprint }; save(); }
    return { key: code => ws.send(JSON.stringify({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: code, Option: 'false', TypeOfRemote: 'SendRemoteKey' } })), close: () => ws.close() };
  }
  const samsung = {
    async command(d, action, a) {
      await checkIdentity(d);
      const s = await samsungSession(d);
      try {
        s.key(action === 'key' ? KEYMAP[a.name].samsung : { power: 'KEY_POWER', play: 'KEY_PLAY', pause: 'KEY_PAUSE', stop: 'KEY_STOP' }[action]);
        await new Promise(r => setTimeout(r, 50));
      } finally { s.close(); }
      return { online: true, power: action === 'power' ? null : true, brightness: null, volume: null, playback: { play: 'playing', pause: 'paused', stop: 'stopped' }[action] || null };
    },
    async read() { return { online: true, power: null, brightness: null, volume: null, playback: null }; },
  };
  // Home Assistant REST: only the listed services, only ticked entities, a non-administrator user's token.
  const haToken = () => cfg.haToken || S.ha.token;
  async function haCall(method, p, body) {
    if (!cfg.homeAssistant.url) throw new IotError('refused', 'Set homeAssistant.url in the bridge’s config file first.');
    if (!haToken()) throw new IotError('not-paired', 'Give VM a Home Assistant token on the Devices tab first.');
    const u = new URL(p, cfg.homeAssistant.url);
    const r = await netx.request({ method, url: u.href, purpose: 'ha', headers: { Authorization: `Bearer ${haToken()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null, maxBytes: 4 << 20 });
    if (r.status === 401 || r.status === 403) throw new IotError('not-paired', 'Home Assistant refused the token: make a new one for VM’s user.');
    if (r.status !== 200 && r.status !== 201) throw new IotError('no-answer', 'No answer from Home Assistant.');
    return JSON.parse(r.body.toString('utf8') || 'null');
  }
  const haState = s => ({ online: s?.state !== 'unavailable', power: s ? s.state === 'on' || s.state === 'playing' || s.state === 'paused' || s.state === 'idle' : null, brightness: s?.attributes?.brightness != null ? Math.round(s.attributes.brightness / 2.55) : null,
    volume: s?.attributes?.volume_level != null ? Math.round(s.attributes.volume_level * 100) : null, playback: s && ['playing', 'paused'].includes(s.state) ? s.state : null });
  const haDomainActions = dom => ({ light: ['power', 'toggle', 'ha'], switch: ['power', 'toggle', 'ha'], media_player: ['power', 'play', 'pause', 'stop', 'volume', 'mute', 'ha'], remote: ['ha'] })[dom] || [];
  const ha = {
    async command(d, action, a) {
      const dom = d.entity.split('.')[0];
      let service, data = {};
      if (action === 'ha') {
        if (a.entity !== d.entity || a.domain !== dom) throw new IotError('refused', 'That entity is not ticked for VM.');
        service = a.service;
        if (!(HA_SERVICES[dom] || []).includes(service)) throw new IotError('refused', `VM calls only ${(HA_SERVICES[dom] || []).join(', ')} on ${dom}.`);
        if (service === 'send_command') { if (!a.command || !(d.commands || []).includes(a.command)) throw new IotError('refused', 'Only the commands you listed for this remote.'); data.command = a.command; }
        else if (a.command) throw new IotError('unsupported', '"command" belongs to remote.send_command only.');
      } else {
        service = { power: a.on ? 'turn_on' : 'turn_off', toggle: 'toggle', play: 'media_play', pause: 'media_pause', stop: 'media_stop', volume: 'volume_set', mute: 'volume_mute' }[action];
        if (action === 'volume') data.volume_level = a.level / 100;
        if (action === 'mute') data.is_volume_muted = a.on;
      }
      await haCall('POST', `/api/services/${dom}/${service}`, { entity_id: d.entity, ...data });
      return ha.read(d);
    },
    async read(d) { return haState(await haCall('GET', `/api/states/${d.entity}`)); },
  };
  async function haTokenSet({ token }) {
    if (!cfg.homeAssistant.url) throw new IotError('refused', 'Set homeAssistant.url in the bridge’s config file first; the page cannot choose it.');
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{20,1024}$/.test(token)) throw new IotError('unsupported', 'That does not look like a Home Assistant long-lived token.');
    await ask(`Keep a Home Assistant token for ${redact(cfg.homeAssistant.url)}?`);
    const prev = S.ha.token; S.ha.token = token; S.ha.url = cfg.homeAssistant.url;
    try { await haCall('GET', '/api/'); } catch (e) { S.ha.token = prev; throw e; }
    save();
    return { url: redact(cfg.homeAssistant.url), tokenSet: true };
  }
  async function haEntities() {
    const all = await haCall('GET', '/api/states');
    return (Array.isArray(all) ? all : []).filter(s => HA_SERVICES[String(s.entity_id).split('.')[0]] && /^[a-z_]+\.[a-z0-9_]+$/.test(s.entity_id))
      .map(s => ({ entity: s.entity_id, name: cleanText(s.attributes?.friendly_name || s.entity_id), domain: s.entity_id.split('.')[0], ticked: S.ha.entities.some(e => e.entity === s.entity_id) }));
  }
  async function haTick({ entity, on, commands }) {
    if (typeof entity !== 'string' || !/^[a-z_]{1,32}\.[a-z0-9_]{1,64}$/.test(entity) || !HA_SERVICES[entity.split('.')[0]]) throw new IotError('unsupported', 'VM ticks lights, switches, media players and remotes only.');
    if (on === false) { const d = S.devices.find(x => x.protocol === 'home-assistant' && x.entity === entity); if (d) removeDevice({ device: d.id }); S.ha.entities = S.ha.entities.filter(e => e.entity !== entity); save(); return { entity, ticked: false }; }
    if (on !== true) throw new IotError('unsupported', '"on" must be true or false.');
    const dom = entity.split('.')[0];
    const cmds = dom === 'remote' ? (Array.isArray(commands) ? commands : []).slice(0, 20).filter(c => typeof c === 'string' && /^[A-Za-z0-9 _.-]{1,40}$/.test(c)) : [];
    const list = await haEntities(), found = list.find(e => e.entity === entity);
    if (!found) throw new IotError('unknown-device', 'Home Assistant has no such entity.');
    await ask(`Let VM control ${found.name} (${entity}) through Home Assistant?${dom === 'switch' ? ' A switch may run a heater, a pump or a door.' : ''}`);
    S.ha.entities = [...S.ha.entities.filter(e => e.entity !== entity), { entity, commands: cmds, at: iso() }];
    let d = S.devices.find(x => x.protocol === 'home-assistant' && x.entity === entity);
    if (!d) {
      d = { id: `ha-${slug(entity)}`, kind: { light: 'light', switch: 'switch', media_player: 'media-renderer', remote: 'remote' }[dom], protocol: 'home-assistant', name: found.name, room: '', address: redact(cfg.homeAssistant.url),
        identity: { type: 'ha-entity', value: entity }, status: 'ok', ownership: { statement: 'ticked-in-vm', at: iso() }, actions: haDomainActions(dom), secret: null, volumeCeiling: cfg.volumeCeiling,
        uns: unsPlace('house', found.name), hermesRule: 'home-assistant', notes: dom === 'switch' ? ['A switch may run a heater, a pump or a door.'] : [], entity, commands: cmds };
      S.devices.push(d); uns.birth(d);
    } else d.commands = cmds;
    save();
    return { entity, ticked: true, device: publicDevice(d) };
  }

  const DRIVERS = { 'upnp-av': upnp, 'roku-ecp': roku, 'hue-clip2': hue, 'hue-light': hue, 'shelly-rpc': shelly, 'tasmota-http': tasmota, 'wiz-udp': wiz, 'yeelight-lan': yeelight, 'lifx-lan': lifx, 'lg-webos': lg, 'samsung-tizen': samsung, 'home-assistant': ha };
  async function readState(d) { const st = await DRIVERS[d.protocol].read(d); states.set(d.id, st); return st; }

  /* -- Rate limits: 2 power or colour changes a second and 60 a minute per device; extras collapse into the latest ------ */
  const throttles = new Map();
  function throttle(d, run) {
    const t = throttles.get(d.id) || { times: [], pending: null, timer: null };
    throttles.set(d.id, t);
    const waitFor = () => {
      const n = now(); t.times = t.times.filter(x => n - x < 60e3);
      const sec = t.times.filter(x => n - x < 1000);
      if (sec.length < 2 && t.times.length < 60) return 0;
      return Math.max(1, sec.length >= 2 ? 1000 - (n - sec[sec.length - 2]) : 60e3 - (n - t.times[0]));
    };
    if (!t.pending && waitFor() === 0) { t.times.push(now()); return run(); }
    if (t.pending) t.pending.resolve({ collapsed: true });
    return new Promise(resolve => {
      t.pending = { run, resolve };
      const fire = () => {
        const w = waitFor();
        if (w > 0) { t.timer = setTimeout(fire, w); return; }
        const p = t.pending; t.pending = null; t.timer = null; t.times.push(now());
        p.run().then(p.resolve, e => p.resolve({ error: e }));
      };
      if (!t.timer) t.timer = setTimeout(fire, waitFor());
    });
  }

  /* -- The command route ------------------------------------------------------------------------------------------------ */
  // Volume up as a key is held to the ceiling too. LG reads its volume first (in lg.command); Roku and Samsung cannot
  // say how loud they are, so VM does not press their Volume up unless the user has set that device's ceiling to 100.
  function volumeUpCheck(d) {
    const ceiling = d.volumeCeiling ?? 80;
    if ((d.protocol === 'roku-ecp' || d.protocol === 'samsung-tizen') && ceiling < 100)
      throw new IotError('refused', `VM cannot read this TV’s volume, so it does not press Volume up: the ceiling of ${ceiling} could not be kept. Use the TV’s own remote to make it louder.`);
  }
  async function command(body, { from = 'page' } = {}) {
    const id = typeof body?.id === 'string' ? cleanText(body.id, 40) : null;
    try {
      if (!body || typeof body !== 'object') throw new IotError('unsupported', 'Send a command as JSON.');
      for (const k of Object.keys(body)) if (!['v', 'id', 'device', 'action', 'args'].includes(k)) throw new IotError('unsupported', `"${cleanText(k, 24)}" is not a field of a command.`);
      if (body.v !== 1) throw new IotError('unsupported', 'Commands are version 1 ("v": 1).');
      const d = deviceById(body.device);
      const action = String(body.action || '');
      if (from === 'phone' && !PHONE_ACTIONS.has(action)) throw new IotError('refused', 'The phone remote cannot do that; use the page on the computer.');
      if (from === 'phone' && action === 'key' && !PHONE_KEYS.includes(body.args?.name)) throw new IotError('refused', 'The phone remote has the arrow keys, OK, Back, Home and volume.');
      if (from === 'broker' && !BROKER_ACTIONS.has(action)) throw new IotError('refused', 'The broker may send simple commands only.');
      if (d.protocol === 'hue-clip2') throw new IotError(secretOf(d).appKey ? 'unsupported' : 'not-paired', secretOf(d).appKey ? 'Command one of the bridge’s lights, not the bridge.' : 'Press the round button on the Hue bridge, then Continue.');
      if (!ACTION_ARGS[action]) throw new IotError('unsupported', `"${cleanText(action, 24)}" is not one of VM’s commands.`);
      if (!d.actions.includes(action)) throw new IotError('unsupported', d.protocol === 'hue-clip2' && !secretOf(d).appKey ? 'Press the round button on the Hue bridge, then Continue.' : `${d.name} does not take "${action}".${action === 'pause' && d.protocol === 'upnp-av' ? ' This player has no Pause: use Stop, which goes back to the start.' : ''}`);
      if (d.status === 'moved') throw new IotError('moved', 'A different device answered at this address last time, so VM sends it nothing. Remove and re-add it.');
      const args = checkArgs(action, body.args, { ceiling: d.volumeCeiling ?? 80, protocol: d.protocol });
      const run = () => DRIVERS[d.protocol].command(d, action, args);
      if (action === 'key' && args.name === 'VolumeUp') volumeUpCheck(d);
      const limited = LIMITED.has(action) || (action === 'ha' && (['light', 'switch'].includes(args.domain) || ['turn_on', 'turn_off', 'toggle'].includes(args.service)));
      const result = limited ? await throttle(d, run) : await run();
      if (result?.collapsed) throw new IotError('rate-limited', 'A newer change to this device replaced this one.');
      if (result?.error) throw result.error;
      if (d.status === 'offline') { d.status = 'ok'; save(); uns.birth(d); }
      states.set(d.id, result);
      uns.update(d, result);
      return { ok: true, id, state: result, ...(action === 'volume' && body.args?.level > args.level ? { note: `Volume stops at ${args.level}, this device’s ceiling.` } : {}) };
    } catch (e) {
      const err = e instanceof IotError ? e : new IotError('no-answer', NO_ANSWER);
      if (err.code === 'no-answer' && body?.device) { const d = S.devices.find(x => x.id === body.device); if (d && d.status === 'ok') { d.status = 'offline'; save(); uns.death(d); } }
      return { ok: false, id, code: err.code, error: scrub(err.message, secretValues()), status: err.status };
    }
  }

  /* -- Hermes: findings and the optional AI question ------------------------------------------------------------------- */
  const aiOn = () => cfg.ai.enabled && !!cfg.aiKey && /^https:\/\//.test(cfg.aiUrl);
  function aiText(c) {
    const f = c.facts || {};
    const server = String(f.server || '').split(/\s+/).filter(t => /^[A-Za-z][\w.-]*\/[\w.-]+$/.test(t) && !/\d+\.\d+\.\d+\.\d+/.test(t)).join(' ');
    const facts = { manufacturer: cleanText(f.manufacturer, 64) || null, modelName: cleanText(f.model, 64) || null, deviceType: cleanText(f.deviceType, 128) || null, serviceTypes: (c.services || []).map(s => cleanText(s.type, 128)).concat(f.mdnsType ? [f.mdnsType] : []), server: server || null };
    return `A smart-home device on a home network announced these facts: ${JSON.stringify(facts)}. In two sentences: what is it likely to be, and does its maker document a local control protocol?`;
  }
  async function hermesAsk({ candidate, confirm: token }) {
    if (!aiOn()) throw new IotError('refused', 'Hermes’s AI question is off: it needs ai.enabled in the config file and VM_AI_KEY and an https VM_AI_URL in the bridge’s environment.');
    const c = candidates.get(String(candidate || ''));
    if (!c) throw new IotError('unknown-device', 'That device has not been found.');
    const text = aiText(c), host = new URL(cfg.aiUrl).host;
    if (!token) { const t = randomBytes(12).toString('hex'); aiPending.set(t, { candidate: c.id, text, at: now() }); return { preview: { host, text }, confirm: t }; }
    const p = aiPending.get(String(token));
    aiPending.delete(String(token));
    if (!p || p.candidate !== c.id || now() - p.at > 5 * 60e3) throw new IotError('refused', 'Confirm the exact text again before it is sent.');
    const r = await netx.request({ method: 'POST', url: cfg.aiUrl, purpose: 'ai', tls: { mode: 'system', ca: deps.aiCa }, headers: { Authorization: `Bearer ${cfg.aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.aiModel || undefined, messages: [{ role: 'user', content: p.text }], max_tokens: 200 }), timeout: 20000 });
    if (r.status !== 200) throw new IotError('no-answer', 'The AI service did not answer.');
    const j = JSON.parse(r.body.toString('utf8'));
    const answer = cleanText(j.choices?.[0]?.message?.content ?? j.content?.[0]?.text ?? '', 600);
    const f = { type: 'hermes.finding', v: 1, at: iso(), candidate: c.id, known: c.deviceId ? 'yours' : 'not-yet-yours', device: { kind: c.kind || 'unknown', maker: c.maker || null, model: c.model || null, name: c.name || null },
      says: `AI suggestion, not checked: ${answer}`, pairing: { method: 'none', steps: [], consentOnDevice: false }, limits: ['An AI suggestion never becomes a command.'], source: 'ai' };
    findings.set(`${c.id}#ai`, f);
    return { finding: f };
  }

  /* -- The UNS link: one broker connection; a plain-JSON tree and, with sparkplug: true, a Sparkplug B edge node -------- */
  const uns = createUns();
  function createUns() {
    const b = cfg.broker;
    const st = { connected: false, error: null, transport: null, statusLink: null, packetId: 0, seq: 0, lastBirth: 0, recent: [], stopped: false, retry: 0, timer: null, ping: null, spIds: new Map() };
    const jsonOn = () => b && b.json, spOn = () => b && b.sparkplug;
    const T0 = b ? `vm/${slug(b.site)}` : '';
    const spTopic = (type, dev) => `spBv1.0/${b.group}/${type}/${b.edgeNode}${dev ? `/${dev}` : ''}`;
    const nextSeq = () => { const s = st.seq; st.seq = (st.seq + 1) % 256; return s; };
    const spId = d => { if (!st.spIds.has(d.id)) { let base = slug(`${d.uns.area}-${d.uns.name}`), n = base, i = 2; const used = new Set(st.spIds.values()); while (used.has(n)) n = `${base}-${i++}`; st.spIds.set(d.id, n); } return st.spIds.get(d.id); };
    const pub = (topic, payload, { qos = 0, retain = false } = {}) => {
      if (!st.connected) return;
      const packetId = qos ? (st.packetId = (st.packetId % 65535) + 1) : 0;
      st.transport.send(mqtt.publish({ topic, payload, qos, retain, packetId }));
      st.recent.unshift({ topic, at: iso(), retain, bytes: Buffer.byteLength(payload) }); st.recent.length = Math.min(st.recent.length, 20);
    };
    const visible = d => d.protocol !== 'hue-clip2';
    const metrics = (d, s) => {
      const t = now();
      return [{ name: 'Online', datatype: SP_TYPES.Boolean, value: s ? s.online !== false : d.status === 'ok', timestamp: t }, { name: 'Power', datatype: SP_TYPES.Boolean, value: s?.power ?? null, timestamp: t },
        { name: 'Brightness', datatype: SP_TYPES.Int32, value: s?.brightness ?? null, timestamp: t }, { name: 'Volume', datatype: SP_TYPES.Int32, value: s?.volume ?? null, timestamp: t },
        { name: 'Playback', datatype: SP_TYPES.String, value: s?.playback ?? null, timestamp: t }, { name: 'Kind', datatype: SP_TYPES.String, value: d.kind, timestamp: t }];
    };
    const jsonState = (d, s) => JSON.stringify({ online: s ? s.online !== false : d.status === 'ok', power: s?.power ?? null, brightness: s?.brightness ?? null, volume: s?.volume ?? null, playback: s?.playback ?? null, kind: d.kind, name: d.name, at: iso() });
    const last = new Map();
    function nbirth() {
      st.seq = 0; st.lastBirth = now();
      pub(spTopic('NBIRTH'), spEncode({ timestamp: now(), seq: nextSeq(), metrics: [{ name: 'bdSeq', datatype: SP_TYPES.Int64, value: S.broker.bdSeq, timestamp: now() }, { name: 'Node Control/Rebirth', datatype: SP_TYPES.Boolean, value: false, timestamp: now() },
        { name: 'Devices', datatype: SP_TYPES.Int32, value: S.devices.filter(visible).length, timestamp: now() }] }));
      for (const d of S.devices.filter(x => visible(x) && x.status === 'ok')) dbirth(d);
    }
    function dbirth(d) { const s = states.get(d.id) || null; last.set(d.id, metrics(d, s)); pub(spTopic('DBIRTH', spId(d)), spEncode({ timestamp: now(), seq: nextSeq(), metrics: metrics(d, s) })); }
    function onPacket(p) {
      if (p.type === 2) {
        if (p.returnCode !== 0) { st.error = ['', 'the broker refused the protocol version', 'the broker refused the client id', 'the broker is unavailable', 'the broker refused the user name or password', 'the broker refused VM'][p.returnCode] || 'the broker refused'; st.transport.destroy(); return; }
        st.connected = true; st.error = null; st.retry = 0;
        const subs = [];
        if (spOn()) subs.push({ topic: spTopic('NCMD'), qos: 0 });
        if (b.acceptCommands) { if (jsonOn()) subs.push({ topic: `${T0}/+/+/set`, qos: 0 }); if (spOn()) subs.push({ topic: `${spTopic('DCMD')}/+`, qos: 0 }); }
        if (subs.length) st.transport.send(mqtt.subscribe(1, subs));
        if (jsonOn()) { if (!spOn()) pub(`${T0}/hermes/status`, 'online', { qos: 1, retain: true }); for (const d of S.devices.filter(visible)) pub(`${T0}/${d.uns.area}/${d.uns.name}/state`, jsonState(d, states.get(d.id)), { retain: true }); }
        if (spOn()) nbirth();
        if (spOn() && jsonOn()) openStatusLink();
        st.ping = setInterval(() => { try { st.transport.send(mqtt.pingreq()); } catch { /* closing */ } }, 25e3); st.ping.unref?.();
      } else if (p.type === 3) {
        if (p.qos === 1) st.transport.send(mqtt.puback(p.packetId));
        onMessage(p.topic, p.payload);
      }
    }
    function onMessage(topic, payload) {
      if (spOn() && topic === spTopic('NCMD')) {
        let m; try { m = spDecode(payload); } catch { return; }
        if (m.metrics.some(x => x.name === 'Node Control/Rebirth' && x.value === true)) {
          if (now() - st.lastBirth < 10e3) { log('Sparkplug: a second Rebirth within 10 seconds was ignored'); return; }
          nbirth();
        }
        return;
      }
      if (!b.acceptCommands) return;
      let dev = null, cmd = null;
      if (jsonOn() && topic.startsWith(`${T0}/`) && topic.endsWith('/set')) {
        const [, , area, name] = topic.split('/');
        dev = S.devices.find(d => d.uns.area === area && d.uns.name === name);
        try { const j = JSON.parse(payload.toString('utf8')); cmd = { action: j.action, args: j.args || {} }; } catch { return; }
      } else if (spOn() && topic.startsWith(`${spTopic('DCMD')}/`)) {
        const id = topic.split('/')[4];
        dev = S.devices.find(d => st.spIds.get(d.id) === id);
        let m; try { m = spDecode(payload); } catch { return; }
        const x = m.metrics[0];
        if (x?.name === 'Power') cmd = { action: 'power', args: { on: !!x.value } };
        else if (x?.name === 'Brightness') cmd = { action: 'brightness', args: { level: Number(x.value) } };
        else if (x?.name === 'Volume') cmd = { action: 'volume', args: { level: Number(x.value) } };
      }
      if (dev && cmd) command({ v: 1, id: 'broker', device: dev.id, action: cmd.action, args: cmd.args }, { from: 'broker' }).then(r => { if (!r.ok) log(`Broker command refused: ${r.error}`); });
    }
    /** One MQTT connection to the configured broker (TCP or WebSocket, pinned TLS on wss:// and mqtts://). */
    async function openTransport(onPkt, onClose) {
      const u = new URL(b.url), parse = mqttParser();
      const tlsOpt = /^(wss|mqtts):$/.test(u.protocol) ? (S.broker.pin ? { mode: 'pin', pin: S.broker.pin } : { mode: 'tofu' }) : null;
      if (/^wss?:$/.test(u.protocol)) {
        const ws = await wsConnect(netx, u.href, { protocol: 'mqtt', tls: tlsOpt, purpose: 'broker' });
        if (tlsOpt && !S.broker.pin) { S.broker.pin = ws.fingerprint; save(); }
        ws.on('message', m => { try { for (const p of parse(m)) onPkt(p); } catch { ws.destroy(); } });
        ws.on('close', onClose);
        return { send: buf => ws.send(Buffer.from(buf)), destroy: () => ws.destroy(), end: () => ws.close() };
      }
      const { socket, fingerprint } = await netx.tcp(u.hostname, Number(u.port) || (u.protocol === 'mqtts:' ? 8883 : 1883), { purpose: 'broker', tls: tlsOpt });
      if (tlsOpt && !S.broker.pin) { S.broker.pin = fingerprint; save(); }
      socket.on('data', c => { try { for (const p of parse(c)) onPkt(p); } catch { socket.destroy(); } });
      socket.on('close', onClose); socket.on('error', () => {});
      return { send: buf => socket.write(buf), destroy: () => socket.destroy(), end: () => socket.end() };
    }
    const clientId = () => `vm-${slug(b.site)}-${b.edgeNode}`.slice(0, 23);
    const brokerPassword = () => cfg.mqttPassword || S.broker.password || '';
    async function connect() {
      if (!b || st.stopped) return;
      S.broker.bdSeq = (S.broker.bdSeq + 1) % 256; save();
      // MQTT 3.1.1 allows one will per connection. With Sparkplug on, this connection's will is NDEATH, so the JSON
      // tree's hermes/status gets its own small connection (openStatusLink) whose will turns it "offline".
      const will = spOn() ? { topic: spTopic('NDEATH'), payload: spEncode({ timestamp: now(), metrics: [{ name: 'bdSeq', datatype: SP_TYPES.Int64, value: S.broker.bdSeq, timestamp: now() }] }), qos: 1, retain: false }
        : jsonOn() ? { topic: `${T0}/hermes/status`, payload: 'offline', qos: 1, retain: true } : null;
      let alive = true;
      const onClose = () => { if (!alive) return; alive = false; closed(); };
      try {
        st.transport = await openTransport(p => onPacket(p), onClose);
        st.transport.send(mqtt.connect({ clientId: clientId(), keepalive: 30, clean: true, username: b.username, password: brokerPassword(), will }));
      } catch (e) { st.error = e.message; onClose(); }
    }
    /** The JSON tree's liveness when Sparkplug is also on: its own client id, "online" retained, its will "offline". */
    async function openStatusLink() {
      if (st.statusLink || st.stopped) return;
      const link = { t: null, ping: null, alive: true };
      st.statusLink = link;
      const topic = `${T0}/hermes/status`;
      const onClose = () => { if (!link.alive) return; link.alive = false; clearInterval(link.ping); if (st.statusLink === link) st.statusLink = null; };
      try {
        link.t = await openTransport(p => {
          if (p.type !== 2) return;
          if (p.returnCode !== 0) { link.t.destroy(); return; }
          link.t.send(mqtt.publish({ topic, payload: 'online', qos: 1, retain: true, packetId: 1 }));
          link.ping = setInterval(() => { try { link.t.send(mqtt.pingreq()); } catch { /* closing */ } }, 25e3); link.ping.unref?.();
        }, onClose);
        if (!link.alive || st.statusLink !== link) { link.t.destroy(); return; }
        link.t.send(mqtt.connect({ clientId: `${clientId().slice(0, 21)}-s`, keepalive: 30, clean: true, username: b.username, password: brokerPassword(), will: { topic, payload: 'offline', qos: 1, retain: true } }));
      } catch { onClose(); }
    }
    function closeStatusLink(clean) {
      const link = st.statusLink; if (!link) return;
      st.statusLink = null; clearInterval(link.ping);
      try { if (clean) { link.t?.send(mqtt.publish({ topic: `${T0}/hermes/status`, payload: 'offline', qos: 1, retain: true, packetId: 2 })); link.t?.send(mqtt.disconnect()); link.t?.end(); } else link.t?.destroy(); } catch { /* closing */ }
    }
    function closed() {
      // Without the main connection the bridge is not publishing, so the status link drops too and its will fires.
      closeStatusLink(false);
      st.connected = false; clearInterval(st.ping); st.transport = null;
      if (st.stopped) return;
      const wait = Math.min(60e3, 2000 * 2 ** st.retry++);
      st.timer = setTimeout(connect, deps.brokerRetryMs ?? wait); st.timer.unref?.();
    }
    return {
      start: connect,
      stop() {
        st.stopped = true; clearTimeout(st.timer); clearInterval(st.ping);
        if (st.transport && st.connected) {
          try {
            if (spOn()) pub(spTopic('NDEATH'), spEncode({ timestamp: now(), metrics: [{ name: 'bdSeq', datatype: SP_TYPES.Int64, value: S.broker.bdSeq, timestamp: now() }] }), { qos: 1 });
            if (jsonOn()) pub(`${T0}/hermes/status`, 'offline', { qos: 1, retain: true });
            st.transport.send(mqtt.disconnect()); st.transport.end();
          } catch { /* closing */ }
        }
        closeStatusLink(true);
      },
      kill() { st.transport?.destroy(); st.statusLink?.t?.destroy(); },
      birth(d) {
        if (!visible(d)) return;
        if (jsonOn()) pub(`${T0}/${d.uns.area}/${d.uns.name}/state`, jsonState(d, states.get(d.id)), { retain: true });
        if (spOn() && st.connected) { dbirth(d); pub(spTopic('NDATA'), spEncode({ timestamp: now(), seq: nextSeq(), metrics: [{ name: 'Devices', datatype: SP_TYPES.Int32, value: S.devices.filter(visible).length, timestamp: now() }] })); }
      },
      update(d, s) {
        if (!visible(d)) return;
        if (jsonOn()) pub(`${T0}/${d.uns.area}/${d.uns.name}/state`, jsonState(d, s), { retain: true });
        if (spOn() && st.connected) {
          const prev = last.get(d.id) || [], cur = metrics(d, s);
          const changed = cur.filter(m => { const p = prev.find(x => x.name === m.name); return !p || p.value !== m.value; });
          last.set(d.id, cur);
          if (changed.length) pub(spTopic('DDATA', spId(d)), spEncode({ timestamp: now(), seq: nextSeq(), metrics: changed }));
        }
      },
      death(d, removed = false) {
        if (!visible(d)) return;
        if (jsonOn()) pub(`${T0}/${d.uns.area}/${d.uns.name}/state`, removed ? '' : jsonState({ ...d, status: 'offline' }, { ...(states.get(d.id) || {}), online: false }), { retain: true });
        if (spOn() && st.connected) { pub(spTopic('DDEATH', spId(d)), spEncode({ timestamp: now(), seq: nextSeq(), metrics: [] })); last.delete(d.id); if (removed) pub(spTopic('NDATA'), spEncode({ timestamp: now(), seq: nextSeq(), metrics: [{ name: 'Devices', datatype: SP_TYPES.Int32, value: S.devices.filter(x => visible(x) && x.id !== d.id).length, timestamp: now() }] })); }
        if (removed) st.spIds.delete(d.id);
      },
      status() {
        return { configured: !!b, connected: st.connected, url: b ? redact(b.url) : null, json: !!jsonOn(), sparkplug: !!spOn(), acceptCommands: !!b?.acceptCommands,
          site: b?.site || null, group: b?.group || null, edgeNode: b?.edgeNode || null, bdSeq: b ? S.broker.bdSeq : null, seq: st.seq, root: b ? T0 : null, error: st.error, recent: st.recent,
          limits: b && /^ws:|^mqtt:/.test(b.url) ? ['Over ws:// or mqtt:// the broker password and messages cross your Wi-Fi in clear; wss:// fixes that.'] : [] };
      },
    };
  }

  /* -- The phone: pairing codes, keys, signatures ------------------------------------------------------------------------ */
  const lanOn = () => cfg.lan.enabled && lanState.listening;
  const lanState = { listening: false, address: cfg.lan.address, problem: null };
  function phonePairStart() {
    if (!lanOn()) throw new IotError('refused', 'The phone remote is off. Start the bridge with --lan (and iot.lan.address in its config file).');
    Object.assign(pairing, { code: String(randomInt(0, 1e6)).padStart(6, '0'), expires: now() + 120e3, tries: 0 });
    log(`Phone pairing code: ${pairing.code} (two minutes)`);
    if (deps.showCode) deps.showCode(pairing.code); else if (!o.quiet) console.log(`\n  Phone pairing code: ${pairing.code}  (two minutes, five tries)\n`);
    return { code: pairing.code, expiresAt: new Date(pairing.expires).toISOString(), url: `http://${cfg.lan.address}:${cfg.lan.port}/remote#pair=${pairing.code}` };
  }
  async function phonePair({ code, name }, req) {
    if (!pairing.code || now() > pairing.expires) { pairing.code = null; throw new IotError('refused', 'There is no pairing code now, or it has expired: make a new one on the Remote tab.'); }
    if (pairing.tries >= 5) throw new IotError('refused', 'Five wrong tries: make a new code on the Remote tab.');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !timingSafeEqual(Buffer.from(code), Buffer.from(pairing.code))) { pairing.tries++; throw new IotError('refused', 'That code is not right.'); }
    pairing.code = null;
    S.phones = S.phones.filter(p => Date.parse(p.expires) > now());
    if (S.phones.length >= 3) throw new IotError('refused', 'At most 3 phones: revoke one on the Remote tab first.');
    const ua = String(req.headers['user-agent'] || ''), label = cleanText(name, 40) || (/iPhone|iPad/.test(ua) ? 'iPhone Safari' : /Android/.test(ua) ? `Android ${/Chrome/.test(ua) ? 'Chrome' : 'browser'}` : 'Phone browser');
    const addr = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    await ask(`A phone (${label}, ${addr}) wants to pair. Allow?`);
    const key = randomBytes(32), id = `ph-${randomBytes(4).toString('hex')}`;
    const phone = { id, name: label, address: addr, created: iso(), expires: new Date(now() + 7 * 86400e3).toISOString(), keyHash: createHash('sha256').update(key).digest('hex') };
    S.phones.push(phone); save();
    return { phone: id, key: key.toString('base64url'), expires: phone.expires, now: now() };
  }
  // Every refusal is code "refused"; its reason (unpaired, revoked, expired, stale, replayed, bad-signature) tells the
  // phone whether its key is gone (unpaired, revoked, expired) or only this request failed. A stale one carries the
  // bridge's clock, so the phone can correct its offset and try once more.
  const sigRefused = (reason, message) => Object.assign(new IotError('refused', message), { reason, ...(reason === 'stale' ? { now: now() } : {}) });
  function checkSignature(req, rawBody, pathAndQuery) {
    const h = String(req.headers['x-vm-sig'] || '');
    const f = Object.fromEntries(h.split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
    if (!/^ph-[0-9a-f]{8}$/.test(f.phone || '') || !/^\d{10,16}$/.test(f.ts || '') || !/^[0-9a-f]{16,64}$/.test(f.nonce || '') || !/^[0-9a-f]{64}$/.test(f.sig || '')) throw sigRefused('unpaired', 'This phone is not paired: pair it again from the Remote tab.');
    const phone = S.phones.find(p => p.id === f.phone);
    if (!phone) throw sigRefused('revoked', 'This phone is not paired, or was revoked: pair it again from the Remote tab.');
    if (Date.parse(phone.expires) <= now()) throw sigRefused('expired', 'This phone’s pairing has expired after 7 days: pair it again from the Remote tab.');
    if (Math.abs(now() - Number(f.ts)) > 30e3) throw sigRefused('stale', 'The request was stale (more than 30 seconds old). Check the phone’s clock.');
    for (const [k, t] of nonces) if (now() - t > 120e3) nonces.delete(k);
    if (nonces.has(`${f.phone}:${f.nonce}`)) throw sigRefused('replayed', 'That request was already used.');
    const want = createHmac('sha256', Buffer.from(phone.keyHash, 'hex')).update(signingText(req.method, pathAndQuery, rawBody, f.ts, f.nonce)).digest();
    if (!timingSafeEqual(want, Buffer.from(f.sig, 'hex'))) throw sigRefused('bad-signature', 'The signature did not match.');
    nonces.set(`${f.phone}:${f.nonce}`, now());
    return phone;
  }
  function revoke({ phone, all }) {
    if (all === true) { const n = S.phones.length; S.phones = []; save(); return { revoked: n }; }
    const before = S.phones.length; S.phones = S.phones.filter(p => p.id !== phone); save();
    if (S.phones.length === before) throw new IotError('unknown-device', 'No such phone.');
    return { revoked: 1 };
  }
  const publicPhones = () => S.phones.map(({ keyHash, ...p }) => ({ ...p, expired: Date.parse(p.expires) <= now() }));

  /* -- HTTP plumbing ----------------------------------------------------------------------------------------------------- */
  function readBody(req, limit = 16384) {
    return new Promise((resolveP, reject) => {
      const chunks = []; let size = 0, over = false;
      req.on('data', c => { size += c.length; if (size > limit) { over = true; } else chunks.push(c); });
      req.on('end', () => (over ? reject(new IotError('too-large', 'The request is larger than 16 KB.', 413)) : resolveP(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', () => reject(new IotError('bad-request', 'The request could not be read.')));
    });
  }
  async function jsonBody(req) {
    const type = String(req.headers['content-type'] || '');
    if (type !== 'application/json') throw new IotError('wrong-type', 'Send changes with Content-Type: application/json.', 415);
    const text = await readBody(req);
    try { const j = JSON.parse(text || '{}'); if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(); return { j, text }; } catch { throw new IotError('bad-request', 'The body is not a JSON object.', 400); }
  }
  const fail = (send, e, cors) => { const err = e instanceof IotError ? e : new IotError('no-answer', NO_ANSWER); if (!(e instanceof IotError)) log(`IoT error: ${e?.stack || e}`); return send(err.status, { ok: false, code: err.code, error: scrub(err.message, secretValues()) }, cors); };
  const status = () => ({ ok: true, enabled: true, version: VERSION, features: ['iot-1'], interface: cfg.interface || null, policy, console: !!confirm,
    lan: { enabled: cfg.lan.enabled, listening: lanState.listening, address: cfg.lan.enabled ? cfg.lan.address : null, port: cfg.lan.port, problem: lanState.problem },
    homeAssistant: { configured: !!cfg.homeAssistant.url, url: cfg.homeAssistant.url ? redact(cfg.homeAssistant.url) : null, tokenSet: !!haToken(), ticked: S.ha.entities.length },
    broker: uns.status(), ai: { enabled: aiOn(), host: aiOn() ? new URL(cfg.aiUrl).host : null }, network: sharedNetwork(), policies: { roku: S.policy.roku },
    devices: S.devices.length, phones: S.phones.length, now: iso() });

  async function handle(req, res, send) {
    const origin = req.headers.origin;
    if (!origin || origin === 'null' || !iotOriginList(cfg).includes(origin)) return send(403, { ok: false, code: 'bad-origin', error: 'IoT Connect answers only Vitruvian Manager’s own page and origins named in the bridge’s config file.' });
    const cors = { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url, `http://localhost:${o.port}`), p = url.pathname;
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (p === '/iot/status') return send(200, status(), cors);
        if (p === '/iot/devices') return send(200, { ok: true, devices: S.devices.map(publicDevice) }, cors);
        if (p === '/iot/candidates') return send(200, { ok: true, candidates: [...candidates.values()].map(publicCandidate), network: sharedNetwork() }, cors);
        if (p === '/iot/hermes') return send(200, { ok: true, agent: 'Hermes Messenger', status: 'online', rules: HERMES_RULES.map(r => r.id), findings: [...findings.values()], ai: { enabled: aiOn(), host: aiOn() ? new URL(cfg.aiUrl).host : null } }, cors);
        if (p === '/iot/uns') return send(200, { ok: true, ...uns.status() }, cors);
        if (p === '/iot/phone') return send(200, { ok: true, phones: publicPhones(), lan: { listening: lanState.listening, address: cfg.lan.enabled ? cfg.lan.address : null } }, cors);
        if (p === '/iot/ha/entities') return send(200, { ok: true, entities: await haEntities() }, cors);
        if (p === '/iot/phone/pair') return send(405, { ok: false, code: 'refused', error: 'A pairing code is made only by a click on the Remote tab (POST).' }, cors);
        return send(404, { ok: false, code: 'not-found', error: 'No such IoT Connect address.' }, cors);
      }
      if (req.method !== 'POST') return send(405, { ok: false, code: 'refused', error: 'IoT Connect reads with GET and changes with POST.' }, cors);
      const { j } = await jsonBody(req);
      const ok = (body, code = 200) => send(code, { ok: true, ...body }, cors);
      switch (p) {
        case '/iot/discover': return ok({ candidates: await discover(), network: sharedNetwork() });
        case '/iot/identify': return ok({ candidate: await identify(j) });
        case '/iot/add': return ok({ device: publicDevice(await add(j)) });
        case '/iot/remove': return ok(removeDevice(j));
        case '/iot/device': return ok({ device: publicDevice(await updateDevice(j)) });
        case '/iot/pair': return ok(await pair(j));
        case '/iot/command': { const r = await command(j); const { status: code = 200, ...rest } = r; return send(r.ok ? 200 : code, rest, cors); }
        case '/iot/state': { const d = deviceById(j.device); return ok({ device: d.id, state: await readState(d) }); }
        case '/iot/network': if (j.ownHome === true) { await ask('Mark this network as your own home network?'); S.network = { ownHome: true, at: iso() }; } else if (j.ownHome === false) S.network = { ownHome: false, at: iso() }; else throw new IotError('unsupported', '"ownHome" must be true or false.'); save(); return ok({ network: sharedNetwork() });
        case '/iot/policy': if (j.roku === true) { await ask('Confirm you have read Roku’s policy on ECP commands from third-party platforms?'); S.policy.roku = iso(); } else if (j.roku === false) S.policy.roku = null; else throw new IotError('unsupported', '"roku" must be true or false.'); save(); return ok({ policies: S.policy });
        case '/iot/ha/token': return ok(await haTokenSet(j));
        case '/iot/ha/tick': return ok(await haTick(j));
        case '/iot/hermes/ask': return ok(await hermesAsk(j));
        case '/iot/phone/pair': return ok(phonePairStart());
        case '/iot/phone/revoke': return ok(revoke(j));
        default: return send(404, { ok: false, code: 'not-found', error: 'No such IoT Connect address.' }, cors);
      }
    } catch (e) { return fail(send, e, cors); }
  }

  /* -- The LAN server for the phone remote: its own handler, only /remote/* ----------------------------------------------- */
  let lanServer = null;
  function lanHandler(req, res) {
    const sec = { 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, ...sec }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    const host = `${cfg.lan.address}:${cfg.lan.port}`;
    if (String(req.headers.host || '') !== host) return send(421, { ok: false, code: 'refused', error: 'Wrong address.' });
    const url = new URL(req.url, `http://${host}`), p = url.pathname;
    if (!(p === '/remote' || p.startsWith('/remote/'))) return send(404, { ok: false, code: 'not-found', error: 'Not found.' });
    (async () => {
      if (req.method === 'GET' && (p === '/remote' || p === '/remote/')) return send(200, REMOTE_HTML, 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/remote/app.js') return send(200, remoteScript(), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && p === '/remote/remote.css') return send(200, REMOTE_CSS, 'text/css; charset=utf-8');
      if (!p.startsWith('/remote/api/')) return send(404, { ok: false, code: 'not-found', error: 'Not found.' });
      if (req.method === 'POST' && req.headers.origin !== `http://${host}`) return send(403, { ok: false, code: 'bad-origin', error: 'Only the remote page itself may send commands.' });
      let raw = '';
      if (req.method === 'POST') { if (String(req.headers['content-type'] || '') !== 'application/json') throw new IotError('wrong-type', 'Send JSON.', 415); raw = await readBody(req); }
      let j = {};
      if (raw) { try { j = JSON.parse(raw); } catch { throw new IotError('bad-request', 'The body is not JSON.', 400); } }
      if (req.method === 'POST' && p === '/remote/api/pair') return send(200, { ok: true, ...(await phonePair(j, req)) });
      checkSignature(req, raw, url.pathname + url.search);
      if (req.method === 'GET' && p === '/remote/api/devices') {
        return send(200, { ok: true, now: now(), keys: PHONE_KEYS, devices: S.devices.filter(d => d.status !== 'moved' && d.actions.some(a => PHONE_ACTIONS.has(a))).map(d => ({ id: d.id, name: d.name, room: d.room, kind: d.kind, actions: d.actions.filter(a => PHONE_ACTIONS.has(a) && a !== 'ha'), commands: d.protocol === 'home-assistant' && d.entity.startsWith('remote.') ? d.commands : [], state: states.get(d.id) || null, volumeCeiling: d.volumeCeiling })) });
      }
      if (req.method === 'POST' && p === '/remote/api/command') { const r = await command(j, { from: 'phone' }); const { status: code = 200, ...rest } = r; return send(r.ok ? 200 : code, rest); }
      return send(404, { ok: false, code: 'not-found', error: 'Not found.' });
    })().catch(e => { const err = e instanceof IotError ? e : new IotError('no-answer', NO_ANSWER); send(err.status, { ok: false, code: err.code, error: scrub(err.message, secretValues()), ...(err.reason ? { reason: err.reason } : {}), ...(err.now != null ? { now: err.now } : {}) }); });
  }
  async function startLan() {
    lastProfile = await profile().catch(() => 'unknown');
    const problem = lanAddressProblem(cfg.lan.address, { interfaces: interfaces(), homeInterface: cfg.interface, policy, profile: lastProfile });
    if (problem) { lanState.problem = problem; throw new Error(`--lan refused: ${problem}`); }
    lanServer = createServer(lanHandler);
    await new Promise((resolveP, reject) => { lanServer.once('error', reject); lanServer.listen(cfg.lan.port, cfg.lan.address, resolveP); });
    lanState.listening = true; lanState.problem = null;
    return lanServer.address();
  }

  return {
    handle, inject, discover, command, uns, state: S, net: netx, publicDevice, startLan, lanHandler,
    async start() { if (cfg.lan.enabled) await startLan(); if (cfg.broker) uns.start(); },
    stop() { uns.stop(); if (lanServer) { lanServer.close(); lanState.listening = false; } for (const t of throttles.values()) clearTimeout(t.timer); },
    lanAddress: () => (lanServer ? lanServer.address() : null),
  };
}
/** The DIDL-Lite wrapper for play-url: the address XML-escaped inside it, and the whole escaped again as a SOAP argument. */
export const didlFor = url => `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>Vitruvian Manager</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:*:*">${xmlEscape(url)}</res></item></DIDL-Lite>`;

/* ---- The phone remote's own page, served by the bridge on the LAN port (no inline script: CSP default-src 'self') ---- */
const REMOTE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Remote · VM</title><link rel="stylesheet" href="/remote/remote.css"></head>
<body><main><h1>Vitruvian Manager remote</h1>
<section id="pair" hidden><p>Type the six-digit code shown on the Remote tab, then allow this phone in the bridge window.</p><form id="pair-form"><label>Code <input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button>Pair</button></form></section>
<section id="remote" hidden><label>Device <select id="device"></select></label>
<div class="row"><button data-a="power-on">On</button><button data-a="power-off">Off</button><button data-a="toggle">Switch</button></div>
<div class="row"><button data-a="play">Play</button><button data-a="pause">Pause</button><button data-a="stop">Stop</button></div>
<div class="row"><label>Level <input id="level" type="range" min="0" max="100" value="50"></label><button data-a="brightness">Dim</button><button data-a="volume">Volume</button></div>
<div class="pad"><button data-k="Up">Up</button><button data-k="Left">Left</button><button data-k="OK">OK</button><button data-k="Right">Right</button><button data-k="Down">Down</button><button data-k="Back">Back</button><button data-k="Home">Home</button><button data-k="VolumeDown">Vol −</button><button data-k="VolumeUp">Vol +</button><button data-k="Mute">Mute</button></div>
</section><p id="msg" role="status"></p>
<p class="small">Plain HTTP on your Wi-Fi: use it only at home. Anyone on the same Wi-Fi can see its commands.</p></main><script src="/remote/app.js"></script></body></html>`;
const REMOTE_CSS = `:root{color-scheme:light dark;--bg:#f6f4ef;--fg:#1d1d1b;--btn:#e3dfd5;--accent:#8a5a1f}@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#efece6;--btn:#2b2a27;--accent:#d9a55b}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif}main{max-width:480px;margin:0 auto;padding:16px 16px 96px}h1{font-size:1.25rem}
button{min-height:56px;min-width:56px;font:inherit;border:0;border-radius:12px;background:var(--btn);color:var(--fg);padding:0 12px}button:focus-visible{outline:3px solid var(--accent)}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.row>*{flex:1}.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}select,input{font:inherit;min-height:44px;width:100%}.small{font-size:.85rem;opacity:.8}`;
function remoteApp() {
  /* global document, localStorage, location, fetch, crypto, TextEncoder, KEYMAP_NAMES, sha256, hmacSha256 */
  const $ = s => document.querySelector(s), enc = new TextEncoder();
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const b64d = s => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, c => c.charCodeAt(0)); };
  let store = {}; try { store = JSON.parse(localStorage.getItem('vm.remote') || '{}'); } catch (e) { store = {}; }
  const save = () => { try { localStorage.setItem('vm.remote', JSON.stringify(store)); } catch (e) { /* private mode */ } };
  const msg = t => { $('#msg').textContent = t; };
  let devices = [];
  const setOffset = bridgeNow => { if (typeof bridgeNow === 'number') { store.offset = bridgeNow - Date.now(); save(); } };
  async function call(method, p, body, retried) {
    const text = body ? JSON.stringify(body) : '', ts = String(Date.now() + (Number(store.offset) || 0)), nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
    const sig = hex(hmacSha256(sha256(b64d(store.key)), enc.encode([method, p, hex(sha256(enc.encode(text))), ts, nonce].join('\n'))));
    const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json', 'X-VM-Sig': `phone=${store.phone},ts=${ts},nonce=${nonce},sig=${sig}` }, body: body ? text : undefined });
    const j = await r.json();
    if (!j.ok && j.reason === 'stale' && typeof j.now === 'number' && !retried) { setOffset(j.now); return call(method, p, body, true); }
    return j;
  }
  const GONE = ['unpaired', 'revoked', 'expired'];
  function showPair(code) { $('#pair').hidden = false; $('#remote').hidden = true; if (code) $('#code').value = code; }
  async function load() {
    const j = await call('GET', '/remote/api/devices');
    if (!j.ok) { msg(j.error); if (GONE.includes(j.reason)) { store = {}; save(); showPair(''); } return; }
    setOffset(j.now); devices = j.devices;
    const sel = $('#device'); sel.textContent = '';
    for (const d of devices) { const o = document.createElement('option'); o.value = d.id; o.textContent = d.room ? `${d.name} (${d.room})` : d.name; sel.append(o); }
    $('#pair').hidden = true; $('#remote').hidden = false; msg(devices.length ? '' : 'No devices yet: add them on the computer.');
  }
  async function send(action, args) {
    const d = devices.find(x => x.id === $('#device').value);
    if (!d) return;
    const j = await call('POST', '/remote/api/command', { v: 1, id: `p-${Date.now()}`, device: d.id, action, args });
    msg(j.ok ? 'Done.' : j.error);
  }
  $('#pair-form').addEventListener('submit', async e => {
    e.preventDefault(); msg('Waiting for Y in the bridge window…');
    const r = await fetch('/remote/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#code').value }) });
    const j = await r.json();
    if (!j.ok) { msg(j.error); return; }
    store = { phone: j.phone, key: j.key, offset: j.now - Date.now() }; save(); history.replaceState(null, '', '/remote'); load();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.closest('form')) return;
    const a = b.dataset.a, k = b.dataset.k, level = Number($('#level').value);
    if (k && KEYMAP_NAMES.includes(k)) send('key', { name: k });
    else if (a === 'power-on' || a === 'power-off') send('power', { on: a === 'power-on' });
    else if (a === 'brightness' || a === 'volume') send(a, { level });
    else if (a) send(a, {});
  });
  const m = /#pair=(\d{6})/.exec(location.hash);
  if (m || !store.key) showPair(m ? m[1] : ''); else load().catch(() => msg('The bridge did not answer.'));
}
export const REMOTE_KEYS = PHONE_KEYS;
export const remoteScript = () => `"use strict";\nconst KEYMAP_NAMES = ${JSON.stringify(PHONE_KEYS)};\n${sha256.toString()}\n${hmacSha256.toString()}\n(${remoteApp.toString()})();\n`;

const HELP = `Vitruvian Manager bridge ${VERSION}: local relay for the Vitruvian Manager SIGINT Dashboard, and IoT Connect.
Usage: node prp-bridge.mjs [--port ${DEFAULT_PORT}] [--route name=URL ...] [--origin URL ...] [--config bridge.json] [--no-public] [--quiet]
                           [--iot] [--iot-origin URL ...] [--state FILE] [--lan]
  --iot          switch on IoT Connect (your own devices on your home network; setup steps ask Y in this window)
  --iot-origin   allow another page origin for /iot (exact origin; the default is https://jdpi.pages.dev only)
  --state FILE   where IoT Connect keeps its devices and keys (default %APPDATA%\\VM\\bridge\\iot-state.json);
                 refused inside a git working tree, this bridge's own folder or OneDrive
  --lan          also serve the phone remote on iot.lan.address:8791 (plain HTTP on your Wi-Fi; implies --iot)
The config file's "iot" block sets the home interface, Home Assistant, the MQTT broker and the AI question; see README.md.
Secrets may come from the environment instead of the state file: VM_HA_TOKEN, VM_MQTT_PASSWORD, and for Hermes's
optional AI question VM_AI_KEY with an https:// VM_AI_URL (and VM_AI_MODEL).`;

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let o;
  try { o = parseArgs(process.argv.slice(2), process.env); } catch (e) { console.error(e.message); process.exit(2); }
  if (o.help) { console.log(HELP); process.exit(0); }
  const deps = {};
  if (o.iot.enabled) deps.confirm = consoleConfirm();
  let server;
  try { server = createBridge(o, deps); } catch (e) { console.error(`IoT Connect: ${e.message}`); process.exit(2); }
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${o.port} is in use: is another bridge running? For SIGINT alone, try --port ${o.port + 1 === DEFAULT_LAN_PORT ? o.port + 2 : o.port + 1}; IoT Connect needs ${DEFAULT_PORT}, the only port its page may call.` : e.message); process.exit(1); });
  // Also answer on IPv6 loopback, where "localhost" may resolve first; skip quietly if the machine has no ::1.
  const v6 = createBridge({ ...o, quiet: true }, { ...deps, iot: server.iot });
  v6.on('error', () => {});
  v6.listen(o.port, '::1');
  server.listen(o.port, '127.0.0.1', async () => {
    console.log(`Vitruvian Manager bridge ${VERSION} on http://localhost:${o.port} (loopback only)`);
    for (const [k, v] of Object.entries(o.routes)) console.log(`  /local/${k.padEnd(6)} → ${redact(v)}`);
    console.log(`  public relays ${o.public ? 'on (adsb.lol, OpenSky)' : 'off'} · aisstream.io ${o.aisstreamKey ? 'key set' : 'key from the page'}${typeof WebSocket === 'undefined' ? ' (needs Node 22+)' : ''}`);
    console.log(`  allowed origins: ${o.origins.join(', ')}`);
    if (server.iot) {
      console.log(`  IoT Connect on: home interface "${o.iot.interface || 'not set'}", origins ${iotOriginList(o.iot).join(', ')}`);
      if (!deps.confirm) console.log('  (no terminal: setup steps that need Y here will be refused)');
      try { await server.iot.start(); if (o.iot.lan.enabled) console.log(`  phone remote on http://${o.iot.lan.address}:${o.iot.lan.port}/remote (plain HTTP on your Wi-Fi: use it only at home)`); }
      catch (e) { console.error(`  ${e.message}`); }
    }
  });
}

// Fake smart devices, a fake MQTT broker, a fake Home Assistant and a fake AI host for the IoT Connect tests. Every one
// listens on 127.0.0.1 only, on a port the system picks, and is started and stopped by the test itself. The tripwire
// makes any socket to an address that is not loopback (or any listen on all interfaces) fail and be recorded, so a test
// that would touch the real network is caught.
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import net from 'node:net';
import dgram from 'node:dgram';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { wsFrame, wsParser, wsAccept, lifxPacket, lifxParse } from '../../sigint/bridge/prp-bridge.mjs';

export const fixture = name => readFileSync(new URL(`../fixtures/iot/${name}`, import.meta.url), 'utf8');

/* ---- Tripwire ------------------------------------------------------------------------------------------------------- */
const LOOP = h => h == null ? false : /^(127\.\d+\.\d+\.\d+|::1|\[::1\]|localhost|::ffff:127\.\d+\.\d+\.\d+)$/i.test(String(h));
export const tripwire = { violations: [], installed: false };
export function installTripwire() {
  if (tripwire.installed) return tripwire;
  tripwire.installed = true;
  const trip = what => { tripwire.violations.push(what); throw new Error(`TRIPWIRE: ${what}`); };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const a = Array.isArray(args[0]) ? args[0][0] : args[0]; // net.connect() passes its normalised [options, callback]
    const opts = a && typeof a === 'object' ? a : { port: a, host: typeof args[1] === 'string' ? args[1] : undefined };
    if (opts.path == null && !LOOP(opts.host ?? 'localhost')) trip(`connect to ${opts.host}:${opts.port}`);
    return connect.apply(this, args);
  };
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    const a = args[0];
    const host = a && typeof a === 'object' ? a.host : typeof args[1] === 'string' ? args[1] : undefined;
    const isPipe = (a && typeof a === 'object' && a.path) || (typeof a === 'string' && !/^\d+$/.test(a));
    if (!isPipe && !LOOP(host)) trip(`listen on ${host || 'every interface'}`);
    return listen.apply(this, args);
  };
  const send = dgram.Socket.prototype.send;
  dgram.Socket.prototype.send = function (...args) {
    const addr = args.find((x, i) => i > 0 && typeof x === 'string');
    if (!LOOP(addr)) trip(`UDP to ${addr}`);
    return send.apply(this, args);
  };
  const bind = dgram.Socket.prototype.bind;
  dgram.Socket.prototype.bind = function (...args) {
    const a = args[0], host = a && typeof a === 'object' ? a.address : typeof args[1] === 'string' ? args[1] : undefined;
    if (!LOOP(host)) trip(`UDP bind on ${host || 'every interface'}`);
    return bind.apply(this, args);
  };
  for (const m of ['addMembership', 'setBroadcast', 'setMulticastInterface']) {
    const orig = dgram.Socket.prototype[m];
    dgram.Socket.prototype[m] = function (...args) { trip(`${m}(${args.join(', ')})`); return orig.apply(this, args); };
  }
  return tripwire;
}

/* ---- Helpers ---------------------------------------------------------------------------------------------------------- */
const listenOn = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const readAll = req => new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
/** Accept a WebSocket upgrade on a fake server; onMessage(text|Buffer, conn). conn.send(string) sends a text frame. */
function wsServe(server, pathTest, onOpen) {
  server.on('upgrade', (req, socket) => {
    if (!pathTest(req.url)) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    const proto = req.headers['sec-websocket-protocol'];
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${wsAccept(req.headers['sec-websocket-key'])}`, ...(proto ? [`Sec-WebSocket-Protocol: ${proto.split(',')[0].trim()}`] : []), '', ''].join('\r\n'));
    const conn = { url: req.url, socket, send: d => socket.write(wsFrame(Buffer.isBuffer(d) ? 2 : 1, d, false)), close: () => { try { socket.write(wsFrame(8, Buffer.from([3, 232]), false)); } catch { /* gone */ } socket.end(); }, onmessage: () => {} };
    const parse = wsParser((op, payload) => { if (op === 8) { socket.end(); return; } if (op === 1) conn.onmessage(payload.toString('utf8'), conn); else if (op === 2) conn.onmessage(payload, conn); });
    socket.on('data', c => { try { parse(c); } catch { socket.destroy(); } });
    socket.on('error', () => {});
    onOpen(conn, req);
  });
}

/* ---- UPnP AV renderer (the EZCast U02, a hostile generic renderer, Sonos) ------------------------------------------------ */
export async function fakeUpnp({ description, pause = true, volume = 20 } = {}) {
  const calls = [], st = { transport: 'STOPPED', volume, mute: false, uri: null, meta: null };
  const scpd = `<?xml version="1.0"?><scpd xmlns="urn:schemas-upnp-org:service-1-0"><actionList>${['SetAVTransportURI', 'Play', 'Stop', 'Seek', 'GetTransportInfo', ...(pause ? ['Pause'] : [])].map(a => `<action><name>${a}</name></action>`).join('')}</actionList></scpd>`;
  const server = createServer(async (req, res) => {
    const body = await readAll(req);
    if (req.method === 'GET' && req.url === '/AVTransport/scpd.xml') { res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(scpd); }
    if (req.method === 'GET') { calls.push({ action: 'GET', path: req.url }); res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(description); }
    if (req.method === 'POST' && /\/(AVTransport|RenderingControl)\/control$/.test(req.url)) {
      const action = /#(\w+)"?$/.exec(req.headers.soapaction || '')?.[1];
      const arg = n => (new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(body) || [])[1];
      calls.push({ action, body, soapaction: req.headers.soapaction, path: req.url });
      let out = '';
      if (action === 'Pause' && !pause) { res.writeHead(500, { 'Content-Type': 'text/xml' }); return res.end('<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>401</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>'); }
      if (action === 'SetAVTransportURI') { st.uri = arg('CurrentURI'); st.meta = arg('CurrentURIMetaData'); }
      else if (action === 'Play') st.transport = 'PLAYING';
      else if (action === 'Pause') st.transport = 'PAUSED_PLAYBACK';
      else if (action === 'Stop') st.transport = 'STOPPED';
      else if (action === 'SetVolume') st.volume = Number(arg('DesiredVolume'));
      else if (action === 'SetMute') st.mute = arg('DesiredMute') === '1';
      else if (action === 'GetTransportInfo') out = `<CurrentTransportState>${st.transport}</CurrentTransportState><CurrentTransportStatus>OK</CurrentTransportStatus>`;
      else if (action === 'GetVolume') out = `<CurrentVolume>${st.volume}</CurrentVolume>`;
      else if (action !== 'Seek') { res.writeHead(500); return res.end('<errorCode>401</errorCode>'); }
      res.writeHead(200, { 'Content-Type': 'text/xml; charset="utf-8"' });
      return res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${out}</u:${action}Response></s:Body></s:Envelope>`);
    }
    res.writeHead(404); res.end();
  });
  const port = await listenOn(server);
  return { port, calls, st, close: () => server.close() };
}

/* ---- Roku ECP ------------------------------------------------------------------------------------------------------------- */
export async function fakeRoku({ serial = 'X00800ABCDEF', mobileControl = true } = {}) {
  const keys = [], st = { power: 'PowerOn', mobileControl };
  const server = createServer(async (req, res) => {
    await readAll(req);
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(fixture('desc-roku.txt')); }
    if (req.method === 'GET' && req.url === '/query/device-info') { res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(`<?xml version="1.0"?><device-info><udn>29600000-0000-1000-8000-d8313f000000</udn><serial-number>${serial}</serial-number><vendor-name>Roku</vendor-name><model-name>Roku Express</model-name><friendly-device-name>Bedroom Roku</friendly-device-name><power-mode>${st.power}</power-mode></device-info>`); }
    if (req.method === 'POST' && /^\/(keypress|launch)\//.test(req.url)) {
      if (!st.mobileControl) { res.writeHead(403); return res.end(); }
      keys.push(req.url);
      if (req.url === '/keypress/PowerOff') st.power = 'DisplayOff';
      if (req.url === '/keypress/PowerOn') st.power = 'PowerOn';
      res.writeHead(200); return res.end();
    }
    keys.push(`REFUSED ${req.method} ${req.url}`); res.writeHead(404); res.end();
  });
  return { port: await listenOn(server), keys, st, close: () => server.close() };
}

/* ---- Philips Hue bridge (CLIP v2 over HTTPS; 101 until the link button is "pressed") ------------------------------------------ */
export async function fakeHue({ leaf, bridgeId = '001788fffe123456' } = {}) {
  const st = { pressed: false, key: null, lights: [{ id: '5a4b3c2d-1111-4222-8333-944455556666', metadata: { name: 'Desk lamp' }, on: { on: false }, dimming: { brightness: 50 }, color: { xy: { x: 0.3, y: 0.3 } } }] };
  const puts = [], seen = [];
  const server = createHttpsServer({ key: leaf.keyPem, cert: leaf.certPem }, async (req, res) => {
    const body = await readAll(req);
    seen.push({ method: req.method, url: req.url, key: req.headers['hue-application-key'] || null });
    if (req.method === 'GET' && req.url === '/api/0/config') return json(res, 200, { name: 'Hue Bridge', bridgeid: bridgeId.toUpperCase(), modelid: 'BSB002', swversion: '1967054020', mac: '00:17:88:12:34:56' });
    if (req.method === 'POST' && req.url === '/api') {
      if (!st.pressed) return json(res, 200, [{ error: { type: 101, address: '', description: 'link button not pressed' } }]);
      st.key = 'hue-app-key-0123456789abcdef'; return json(res, 200, [{ success: { username: st.key } }]);
    }
    if (req.url.startsWith('/clip/v2/resource/light')) {
      if (!st.key || req.headers['hue-application-key'] !== st.key) return json(res, 403, { errors: [{ description: 'unauthorized user' }] });
      const id = req.url.split('/')[5];
      if (req.method === 'GET') return json(res, 200, { errors: [], data: id ? st.lights.filter(l => l.id === id) : st.lights });
      if (req.method === 'PUT') { const l = st.lights.find(x => x.id === id), j = JSON.parse(body); puts.push(j); if (j.on) l.on = j.on; if (j.dimming) l.dimming = j.dimming; if (j.color) l.color = j.color; return json(res, 200, { errors: [], data: [{ rid: id, rtype: 'light' }] }); }
    }
    json(res, 404, { errors: [{ description: 'not found' }] });
  });
  return { port: await listenOn(server), st, puts, seen, press() { st.pressed = true; }, close: () => server.close() };
}

/* ---- Shelly Gen2 (JSON-RPC; digest SHA-256 with HA1 when a password is set) ------------------------------------------------- */
export async function fakeShelly({ id = 'shellyplus1-a8032ab12345', mac = 'A8032AB12345', password = null, dimmer = false } = {}) {
  const calls = [], st = { output: false, brightness: 40 };
  const sha = s => createHash('sha256').update(s).digest('hex');
  const nonce = 1700000000;
  const server = createServer(async (req, res) => {
    const body = await readAll(req);
    if (req.method === 'GET' && req.url === '/shelly') return json(res, 200, { name: 'Kettle socket', id, mac, model: dimmer ? 'SNDM-0013US' : 'SNSW-001X16EU', gen: 2, app: dimmer ? 'PlusWallDimmer' : 'Plus1', ver: '1.4.2', auth_en: !!password, auth_domain: password ? id : null });
    if (req.method === 'POST' && req.url === '/rpc') {
      const j = JSON.parse(body);
      // Shelly's documented HTTP form (shelly-api-docs …/gen2/General/Authentication): an unauthenticated request gets
      // HTTP 401 with the challenge in WWW-Authenticate and a text body; the answer is an Authorization: Digest header
      // with ha2 = SHA-256("POST:/rpc") and nc 00000001. The JSON error frame is the WebSocket form, not used here.
      const h = {};
      const m = /^Digest\s+(.*)$/i.exec(req.headers.authorization || '');
      if (m) for (const x of m[1].matchAll(/([A-Za-z]+)\s*=\s*(?:"([^"]*)"|([^\s,]+))/g)) h[x[1].toLowerCase()] = x[2] ?? x[3];
      calls.push({ method: j.method, params: j.params, auth: m ? h : null, bodyAuth: j.auth || null });
      if (password) {
        const ha1 = sha(`admin:${id}:${password}`), want = h.nonce && sha(`${ha1}:${h.nonce}:${h.nc}:${h.cnonce}:${h.qop}:${sha('POST:/rpc')}`);
        const ok = h.username === 'admin' && h.realm === id && h.nonce === String(nonce) && h.nc === '00000001' && h.qop === 'auth' && h.uri === '/rpc' && h.algorithm === 'SHA-256' && h.response === want;
        if (!ok) { res.writeHead(401, { 'WWW-Authenticate': `Digest qop="auth", realm="${id}", nonce="${nonce}", algorithm=SHA-256`, 'Content-Type': 'text/plain' }); return res.end('401 Unauthorized'); }
      }
      const comp = j.method.split('.')[0];
      if (/\.Set$/.test(j.method)) { if ('on' in j.params) st.output = j.params.on; if ('brightness' in j.params) st.brightness = j.params.brightness; }
      if (/\.Toggle$/.test(j.method)) st.output = !st.output;
      return json(res, 200, { id: j.id, src: id, result: /GetStatus$/.test(j.method) ? { id: 0, output: st.output, ...(comp === 'Light' ? { brightness: st.brightness } : {}) } : { was_on: !st.output } });
    }
    json(res, 404, {});
  });
  return { port: await listenOn(server), calls, st, close: () => server.close() };
}

/* ---- Tasmota (/cm) ------------------------------------------------------------------------------------------------------------- */
export async function fakeTasmota({ mac = 'AA:BB:CC:00:11:22', password = null } = {}) {
  const cmnds = [], st = { POWER: 'OFF', Dimmer: 100, Color: 'FFFFFF' };
  const server = createServer(async (req, res) => {
    await readAll(req);
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/cm') return json(res, 404, {});
    if (password && (u.searchParams.get('user') !== 'admin' || u.searchParams.get('password') !== password)) return json(res, 401, { WARNING: 'Need user=<username>&password=<password>' });
    const c = u.searchParams.get('cmnd') || '';
    cmnds.push(c);
    if (c === 'Status 5') return json(res, 200, { StatusNET: { Hostname: 'tasmota-0B1122', IPAddress: '127.0.0.52', Mac: mac } });
    if (c === 'State') return json(res, 200, { POWER: st.POWER, Dimmer: st.Dimmer });
    const [k, v] = c.split(' ');
    if (k === 'Power') st.POWER = v === 'Toggle' ? (st.POWER === 'ON' ? 'OFF' : 'ON') : v.toUpperCase();
    else if (k === 'Dimmer') { st.Dimmer = Number(v); st.POWER = 'ON'; }
    else if (k === 'Color') { st.Color = v; st.POWER = 'ON'; }
    else if (k === 'CT') st.POWER = 'ON';
    else return json(res, 200, { Command: 'Unknown' });
    json(res, 200, { POWER: st.POWER, Dimmer: st.Dimmer, Color: st.Color });
  });
  return { port: await listenOn(server), cmnds, st, close: () => server.close() };
}

/* ---- WiZ (JSON over UDP) ------------------------------------------------------------------------------------------------------- */
export async function fakeWiz({ mac = 'a8bb50aabbcc' } = {}) {
  const got = [], st = { state: false, dimming: 50, r: 0, g: 0, b: 0, temp: 0 };
  const s = dgram.createSocket('udp4');
  s.on('message', (msg, r) => {
    const j = JSON.parse(msg.toString()); got.push(j);
    let result;
    if (j.method === 'getSystemConfig') result = { mac, homeId: 1, moduleName: 'ESP01_SHRGB_03', fwVersion: '1.25.0' };
    else if (j.method === 'getPilot') result = { mac, state: st.state, dimming: st.dimming };
    else if (j.method === 'setPilot') { Object.assign(st, j.params); result = { success: true }; }
    else if (j.method === 'registration') result = { mac, success: true };
    s.send(Buffer.from(JSON.stringify({ method: j.method, env: 'pro', result })), r.port, r.address);
  });
  await new Promise(r => s.bind(0, '127.0.0.1', r));
  return { port: s.address().port, got, st, close: () => s.close() };
}

/* ---- Yeelight (JSON lines over TCP) ---------------------------------------------------------------------------------------- */
export async function fakeYeelight() {
  const got = [], st = { power: 'off', bright: 80 };
  const server = net.createServer(sock => {
    let buf = '';
    sock.on('data', c => {
      buf += c.toString();
      for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
        const j = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 2); got.push(j);
        if (j.method === 'set_power') st.power = j.params[0];
        if (j.method === 'toggle') st.power = st.power === 'on' ? 'off' : 'on';
        if (j.method === 'set_bright') st.bright = j.params[0];
        sock.write(`${JSON.stringify({ method: 'props', params: { power: st.power } })}\r\n`); // a notification first, as real bulbs send
        sock.write(`${JSON.stringify({ id: j.id, result: j.method === 'get_prop' ? [st.power, String(st.bright)] : ['ok'] })}\r\n`);
      }
    });
    sock.on('error', () => {});
  });
  return { port: await listenOn(server), got, st, close: () => server.close() };
}

/* ---- LIFX (binary UDP) --------------------------------------------------------------------------------------------------------- */
export async function fakeLifx({ mac = 'd073d5001122' } = {}) {
  const got = [], st = { h: 0, s: 0, b: 32768, k: 3500, power: 0 };
  const s = dgram.createSocket('udp4');
  s.on('message', (msg, r) => {
    const p = lifxParse(msg); if (!p) return;
    got.push({ type: p.type, payload: Buffer.from(p.payload) });
    const reply = (type, payload) => s.send(lifxPacket(type, payload, { target: mac, source: p.source, sequence: p.sequence }), r.port, r.address);
    if (p.type === 2) { const pl = Buffer.alloc(5); pl[0] = 1; pl.writeUInt32LE(56700, 1); reply(3, pl); }
    else if (p.type === 101) { const pl = Buffer.alloc(52); pl.writeUInt16LE(st.h, 0); pl.writeUInt16LE(st.s, 2); pl.writeUInt16LE(st.b, 4); pl.writeUInt16LE(st.k, 6); pl.writeUInt16LE(st.power, 10); pl.write('Lamp', 12); reply(107, pl); }
    else if (p.type === 117) { st.power = p.payload.readUInt16LE(0); reply(45, Buffer.alloc(0)); }
    else if (p.type === 102) { st.h = p.payload.readUInt16LE(1); st.s = p.payload.readUInt16LE(3); st.b = p.payload.readUInt16LE(5); st.k = p.payload.readUInt16LE(7); reply(45, Buffer.alloc(0)); }
  });
  await new Promise(r => s.bind(0, '127.0.0.1', r));
  return { port: s.address().port, got, st, close: () => s.close() };
}

/* ---- LG webOS (WSS; PROMPT pairing needs "accept" on the TV) ------------------------------------------------------------------- */
export async function fakeLg({ leaf, acceptAfterMs = null } = {}) {
  const st = { prompts: 0, clientKey: null, volume: 10, buttons: [], requests: [], registerPayloads: [] };
  let pointerPort = 0;
  const server = createHttpsServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => { res.writeHead(404); res.end(); });
  wsServe(server, () => true, conn => {
    if (/netinput\.pointer\.sock$/.test(conn.url)) {
      conn.onmessage = t => { const m = /name:(\w+)/.exec(String(t)); if (m) st.buttons.push(m[1]); };
      return;
    }
    conn.onmessage = t => {
      const j = JSON.parse(t);
      if (j.type === 'register') {
        st.registerPayloads.push(j.payload);
        if (j.payload['client-key'] && j.payload['client-key'] === st.clientKey) return conn.send(JSON.stringify({ type: 'registered', id: j.id, payload: { 'client-key': st.clientKey } }));
        st.prompts++;
        conn.send(JSON.stringify({ type: 'response', id: j.id, payload: { pairingType: 'PROMPT', returnValue: true } }));
        if (acceptAfterMs != null) setTimeout(() => { st.clientKey = 'lg-client-key-7f00aa11bb22cc33'; conn.send(JSON.stringify({ type: 'registered', id: j.id, payload: { 'client-key': st.clientKey } })); }, acceptAfterMs);
        return;
      }
      if (j.type === 'request') {
        st.requests.push({ uri: j.uri, payload: j.payload });
        let payload = { returnValue: true };
        if (j.uri === 'ssap://audio/setVolume') st.volume = j.payload.volume;
        if (j.uri === 'ssap://audio/getVolume') payload = { returnValue: true, volume: st.volume, muted: false };
        if (j.uri === 'ssap://com.webos.service.networkinput/getPointerInputSocket') payload = { returnValue: true, socketPath: `wss://127.0.0.48:3001/resources/0a1b2c3d/netinput.pointer.sock` };
        conn.send(JSON.stringify({ type: 'response', id: j.id, payload }));
      }
    };
  });
  const port = await listenOn(server);
  pointerPort = port;
  return { port, st, pointerPort, close: () => server.close() };
}

/* ---- Samsung Tizen (WSS 8002 with a token; HTTP 8001 description) ----------------------------------------------------------------- */
export async function fakeSamsung({ leaf, id = 'uuid:0d0c0b0a-1111-2222-3333-444455556666', allowAfterMs = null, deny = false } = {}) {
  const st = { token: null, keys: [], connects: [] };
  const http = createServer((req, res) => {
    if (req.url === '/api/v2/') return json(res, 200, { device: { id, name: '[TV] Samsung Living room', modelName: 'QE55Q60', type: 'Samsung SmartTV', TokenAuthSupport: 'true' }, id, isSupport: '{"TokenAuthSupport":"true"}' });
    res.writeHead(404); res.end();
  });
  const wss = createHttpsServer({ key: leaf.keyPem, cert: leaf.certPem }, (req, res) => { res.writeHead(404); res.end(); });
  wsServe(wss, u => u.startsWith('/api/v2/channels/samsung.remote.control'), conn => {
    const u = new URL(conn.url, 'https://x'), token = u.searchParams.get('token');
    st.connects.push({ name: Buffer.from(u.searchParams.get('name') || '', 'base64').toString(), token });
    conn.onmessage = t => { const j = JSON.parse(t); if (j.method === 'ms.remote.control') st.keys.push(j.params.DataOfCmd); };
    if (token && token === st.token) return conn.send(JSON.stringify({ event: 'ms.channel.connect', data: { clients: [] } }));
    if (deny) return conn.send(JSON.stringify({ event: 'ms.channel.unauthorized' }));
    if (allowAfterMs != null) setTimeout(() => { st.token = '57512345'; conn.send(JSON.stringify({ event: 'ms.channel.connect', data: { token: st.token, clients: [] } })); }, allowAfterMs);
  });
  return { httpPort: await listenOn(http), wsPort: await listenOn(wss), st, close: () => { http.close(); wss.close(); } };
}

/* ---- Home Assistant REST ---------------------------------------------------------------------------------------------------------- */
export async function fakeHa({ token = 'ha-test-token-abcdefghijklmnopqrstuvwxyz0123' } = {}) {
  const calls = [], auths = [];
  const states = {
    'light.kitchen': { entity_id: 'light.kitchen', state: 'off', attributes: { friendly_name: 'Kitchen light', brightness: 0 } },
    'switch.heater': { entity_id: 'switch.heater', state: 'off', attributes: { friendly_name: 'Heater' } },
    'remote.broadlink': { entity_id: 'remote.broadlink', state: 'on', attributes: { friendly_name: 'Broadlink blaster' } },
    'sensor.temp': { entity_id: 'sensor.temp', state: '21', attributes: { friendly_name: 'Temperature' } },
  };
  const server = createServer(async (req, res) => {
    const body = await readAll(req);
    auths.push(req.headers.authorization || '');
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { message: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/api/') return json(res, 200, { message: 'API running.' });
    if (req.method === 'GET' && req.url === '/api/states') return json(res, 200, Object.values(states));
    if (req.method === 'GET' && req.url.startsWith('/api/states/')) { const s = states[req.url.slice(12)]; return s ? json(res, 200, s) : json(res, 404, {}); }
    const m = /^\/api\/services\/([a-z_]+)\/([a-z_]+)$/.exec(req.url);
    if (req.method === 'POST' && m) {
      const j = JSON.parse(body || '{}'); calls.push({ domain: m[1], service: m[2], data: j });
      const s = states[j.entity_id];
      if (s && m[2] === 'turn_on') s.state = 'on'; if (s && m[2] === 'turn_off') s.state = 'off'; if (s && m[2] === 'toggle') s.state = s.state === 'on' ? 'off' : 'on';
      return json(res, 200, s ? [s] : []);
    }
    json(res, 404, {});
  });
  return { port: await listenOn(server), calls, auths, states, token, close: () => server.close() };
}

/* ---- MQTT 3.1.1 broker (its own parser, so the bridge's bytes are checked independently), over TCP and WebSocket ------------------ */
export async function fakeBroker() {
  const st = { connects: [], published: [], retained: new Map(), wills: [], subs: [], clients: new Set(), raw: [] };
  const str = (b, o) => { const l = b.readUInt16BE(o); return [b.subarray(o + 2, o + 2 + l), o + 2 + l]; };
  function session(write, end) {
    const c = { write, end, will: null, subs: [], clean: false };
    st.clients.add(c);
    let buf = Buffer.alloc(0);
    c.feed = chunk => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        let len = 0, mul = 1, i = 1, b;
        do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
        if (buf.length < i + len) return;
        const first = buf[0], body = buf.subarray(i, i + len), whole = Buffer.from(buf.subarray(0, i + len)); buf = buf.subarray(i + len);
        const type = first >> 4;
        st.raw.push(whole);
        if (type === 1) {
          let [proto, o] = str(body, 0); const level = body[o], flags = body[o + 1], keepalive = body.readUInt16BE(o + 2); o += 4;
          let id; [id, o] = str(body, o);
          const cn = { protocol: proto.toString(), level, flags, keepalive, clientId: id.toString(), raw: whole };
          if (flags & 4) { let t, p; [t, o] = str(body, o); [p, o] = str(body, o); c.will = cn.will = { topic: t.toString(), payload: Buffer.from(p), qos: (flags >> 3) & 3, retain: !!(flags & 32) }; }
          if (flags & 128) { let u; [u, o] = str(body, o); cn.username = u.toString(); }
          if (flags & 64) { let p; [p, o] = str(body, o); cn.password = p.toString(); }
          st.connects.push(cn); write(Buffer.from([0x20, 2, 0, 0]));
        } else if (type === 3) {
          const qos = (first >> 1) & 3, retain = !!(first & 1);
          let [t, o] = str(body, 0); let id = 0; if (qos) { id = body.readUInt16BE(o); o += 2; }
          const msg = { topic: t.toString(), payload: Buffer.from(body.subarray(o)), qos, retain };
          deliver(msg);
          if (qos === 1) write(Buffer.from([0x40, 2, id >> 8, id & 255]));
        } else if (type === 8) {
          const id = body.readUInt16BE(0); let o = 2; const granted = [];
          while (o < body.length) { let t; [t, o] = str(body, o); const q = body[o++]; c.subs.push(t.toString()); st.subs.push(t.toString()); granted.push(q); }
          write(Buffer.from([0x90, 2 + granted.length, id >> 8, id & 255, ...granted]));
        } else if (type === 12) write(Buffer.from([0xd0, 0]));
        else if (type === 14) { c.clean = true; c.will = null; end(); }
      }
    };
    c.closed = () => { st.clients.delete(c); if (c.will) { st.wills.push(c.will); deliver(c.will); } };
    return c;
  }
  const match = (filter, topic) => { const f = filter.split('/'), t = topic.split('/'); for (let i = 0; i < f.length; i++) { if (f[i] === '#') return true; if (f[i] !== '+' && f[i] !== t[i]) return false; } return f.length === t.length; };
  function deliver(msg) {
    st.published.push(msg);
    if (msg.retain) { if (msg.payload.length) st.retained.set(msg.topic, msg.payload); else st.retained.delete(msg.topic); }
    for (const c of st.clients) if (c.subs.some(f => match(f, msg.topic))) {
      const t = Buffer.from(msg.topic), body = Buffer.concat([Buffer.from([t.length >> 8, t.length & 255]), t, msg.payload]);
      const lenBytes = []; let n = body.length; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; lenBytes.push(b); } while (n);
      c.write(Buffer.concat([Buffer.from([0x30, ...lenBytes]), body]));
    }
  }
  const tcp = net.createServer(sock => { const c = session(b => sock.write(b), () => sock.end()); c.sock = sock; sock.on('data', d => c.feed(d)); sock.on('close', () => c.closed()); sock.on('error', () => {}); });
  const httpServer = createServer((req, res) => { res.writeHead(404); res.end(); });
  wsServe(httpServer, u => u === '/mqtt' || u === '/', conn => { const c = session(b => conn.send(Buffer.from(b)), () => conn.close()); c.sock = conn.socket; conn.onmessage = d => c.feed(Buffer.isBuffer(d) ? d : Buffer.from(d)); conn.socket.on('close', () => c.closed()); });
  return {
    port: await listenOn(tcp), wsPort: await listenOn(httpServer), st,
    /** Publish as another client would (the test playing a SCADA host). */
    publish(topic, payload) { deliver({ topic, payload: Buffer.from(payload), qos: 0, retain: false }); },
    /** Drop every client without a DISCONNECT, as a crash or a lost Wi-Fi would: the wills fire. */
    dropAll() { for (const c of [...st.clients]) c.sock.destroy(); },
    close() { for (const c of [...st.clients]) c.sock.destroy(); tcp.close(); httpServer.close(); },
  };
}

/* ---- An AI host (HTTPS) that records what it was sent ---------------------------------------------------------------------------- */
export async function fakeAi({ leaf } = {}) {
  const got = [];
  const server = createHttpsServer({ key: leaf.keyPem, cert: leaf.certPem }, async (req, res) => {
    const body = await readAll(req); got.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
    json(res, 200, { choices: [{ message: { role: 'assistant', content: 'Probably a DLNA media renderer. Its maker documents UPnP AV.' } }] });
  });
  return { port: await listenOn(server), got, close: () => server.close() };
}

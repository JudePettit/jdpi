// IoT Connect: the security and law review's proofs (7 November 2026). Each test states what the design (§2-§4 of
// PRP-IOT-CONNECT-DESIGN.md) or the page's own words promise and drives the bridge to show where it does not hold yet.
// Each failed until the finding it proves was fixed (the same day); now each guards its fix. Listed in package.json's
// "test" script after tests/iot-connect.test.mjs.
//   node --test tests/iot-connect-review.test.mjs
// NOTHING HERE TOUCHES THE REAL NETWORK: the same tripwire, loopback policy and fakes as tests/iot-connect.test.mjs.
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { installTripwire, tripwire, fixture, fakeRoku, fakeTasmota, fakeWiz, fakeHa } from './tools/fake-devices.mjs';
import * as B from '../sigint/bridge/prp-bridge.mjs';

installTripwire();
const TMP = mkdtempSync(path.join(os.tmpdir(), 'vm-iot-review-'));
after(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows may hold a file a moment */ } });
let stateN = 0;
const ORIGIN = 'https://jdpi.pages.dev';
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });

/** The same bridge as tests/iot-connect.test.mjs builds: IoT on, loopback policy, a fake clock unless realClock. */
async function bridge({ iot = {}, answer = () => true, realClock = false, profile = 'Private', deps = {} } = {}) {
  const port = await freePort();
  const o = { port, quiet: true, routes: { adsb: 'http://127.0.0.1:9/data/aircraft.json' }, origins: [...B.DEFAULT_ORIGINS], public: false, aisstreamKey: '',
    iot: B.normaliseIot({ interface: 'Loopback (tests)', ...iot }, { iot: true, state: path.join(TMP, `state-${++stateN}.json`) }, port, {}) };
  const questions = [], portMap = {};
  let T = Date.parse('2026-11-07T12:00:00Z');
  const server = B.createBridge(o, {
    policy: 'loopback', portMap, resolver: {}, interfaces: () => ({}), profile: async () => profile,
    confirm: async q => { questions.push(q); return answer(q); }, ...(realClock ? {} : { now: () => T }),
    discoverySource: async () => [], log: () => {}, timeout: 2500, brokerRetryMs: 600e3, ...deps,
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const call = async (method, p, body) => {
    const r = await fetch(`http://localhost:${port}${p}`, { method, headers: { Origin: ORIGIN, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text };
  };
  return {
    iot: server.iot, portMap, questions, clock: { advance: ms => { T += ms; } },
    get: p => call('GET', p), post: (p, body) => call('POST', p, body ?? {}),
    async cmd(device, action, args) { T += 1000; return (await call('POST', '/iot/command', { v: 1, id: `c-${action}`, device, action, ...(args ? { args } : {}) })).json; },
    async add(c, extra = {}) { const r = await call('POST', '/iot/add', { candidate: c.id ?? c, owned: true, ...extra }); assert.equal(r.status, 200, `add: ${r.text}`); return r.json.device; },
    close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); }),
  };
}

/* ---- Finding: the "ha" action is not rate-limited, so a Home Assistant light can be flashed faster than twice a second */
test('review: a Home Assistant light changes at most twice a second through the "ha" action too (the page says lights change at most twice a second)', async () => {
  const ha = await fakeHa();
  const e = await bridge({ iot: { homeAssistant: { url: 'http://127.0.0.60:8123' } }, realClock: true });
  e.portMap['127.0.0.60:8123'] = ha.port;
  try {
    assert.equal((await e.post('/iot/ha/token', { token: ha.token })).status, 200);
    const light = (await e.post('/iot/ha/tick', { entity: 'light.kitchen', on: true })).json.device;
    const send = i => e.post('/iot/command', { v: 1, id: `t${i}`, device: light.id, action: 'ha', args: { domain: 'light', service: 'toggle', entity: 'light.kitchen' } });
    const rs = await Promise.all([0, 1, 2, 3, 4, 5].map(send));
    const toggles = ha.calls.filter(c => c.service === 'toggle').length;
    assert.ok(toggles <= 3, `six toggles sent at once reached Home Assistant ${toggles} times (${rs.filter(r => r.json.ok).length} answered ok); the limit is 2 a second, extras collapsing into the latest`);
  } finally { await e.close(); ha.close(); }
});

/* ---- Finding: the volume keys go past the ceiling ----------------------------------------------------------------- */
test('review: volume stops at the device’s ceiling for the volume keys too (VolumeUp on a TV)', async () => {
  const dev = await fakeRoku();
  const e = await bridge();
  e.portMap['127.0.0.47:8060'] = dev.port;
  try {
    const d = await e.add(await e.iot.inject('ssdp', Buffer.from(fixture('ssdp-roku.txt')), { address: '127.0.0.47', port: 1900 }));
    assert.equal((await e.post('/iot/policy', { roku: true })).status, 200);
    const low = await e.post('/iot/device', { device: d.id, volumeCeiling: 0 });
    assert.equal(low.json.device.volumeCeiling, 0, 'the user set this TV’s ceiling to 0');
    const answers = [];
    for (let i = 0; i < 3; i++) answers.push(await e.cmd(d.id, 'key', { name: 'VolumeUp' }));
    const sent = dev.keys.filter(k => k === '/keypress/VolumeUp').length;
    assert.equal(sent, 0, `with a ceiling of 0, VolumeUp still reached the TV ${sent} times (answers: ${answers.map(a => a.ok ? 'ok' : a.code).join(', ')})`);
  } finally { await e.close(); dev.close(); }
});

/* ---- Finding: a Public network locks no-pairing kinds only after "Look for devices", not for a typed address -------- */
test('review: on a network Windows marks Public, a light found by a typed address is locked like one found by discovery', async () => {
  const bulb = await fakeWiz();
  const e = await bridge({ profile: 'Public' });
  e.portMap['127.0.0.53:38899'] = bulb.port;
  try {
    const t = await e.post('/iot/identify', { kind: 'wiz', address: '127.0.0.53' });
    assert.equal(t.status, 200, t.text);
    const r = await e.post('/iot/add', { candidate: t.json.candidate.id, owned: true });
    assert.equal(r.status, 403, `a Public network should bring the shared-network lock, but Add answered ${r.status}: ${r.text.slice(0, 160)}`);
    assert.match(r.json.error, /This looks like a shared network/);
  } finally { await e.close(); bulb.close(); }
});

/* ---- Finding: a Tasmota password goes to whatever answers at the address before its MAC is checked ---------------- */
test('review: a Tasmota password never reaches a different device that now answers at its address', async () => {
  const PASSWORD = 'tasmota-pass-123';
  const real = await fakeTasmota({ password: PASSWORD });
  const seen = [];
  const impostor = createServer((req, res) => { seen.push(req.url); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ StatusNET: { Hostname: 'other', Mac: '11:22:33:44:55:66' }, POWER: 'OFF' })); });
  await new Promise(r => impostor.listen(0, '127.0.0.1', r));
  // This computer's neighbour table, as arp -a would show it: which network card holds 127.0.0.52 now.
  const neighbours = { '127.0.0.52': 'aa:bb:cc:00:11:22' };
  const e = await bridge({ deps: { neighbourMac: async ip => neighbours[ip] ?? null } });
  e.portMap['127.0.0.52:80'] = real.port;
  try {
    const t = await e.post('/iot/identify', { kind: 'tasmota', address: '127.0.0.52' });
    assert.equal(t.status, 200, t.text);
    const d = await e.add(t.json.candidate);
    assert.equal((await e.post('/iot/pair', { device: d.id, password: PASSWORD })).status, 200);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).ok, true, 'the real device works');
    // The address now belongs to another device (a new DHCP lease, or a neighbour's on a shared network).
    e.portMap['127.0.0.52:80'] = impostor.address().port; neighbours['127.0.0.52'] = '11:22:33:44:55:66';
    const read = await e.post('/iot/state', { device: d.id });            // "Read state"
    assert.equal(read.json.code, 'moved', 'the other network card is seen before any password goes');
    e.clock.advance(61e3);
    await e.cmd(d.id, 'power', { on: false });                 // a command after the identity check's minute
    const leaked = seen.filter(u => u.includes(encodeURIComponent(PASSWORD)) || u.includes(PASSWORD));
    assert.deepEqual(leaked, [], `the password reached the other device ${leaked.length} times, e.g. ${leaked[0] || ''}`);
  } finally { await e.close(); real.close(); impostor.close(); }
});

/* ---- Finding: after one unanswered question the bridge window shows the old question and loses the next answer ----- */
test('review: after a question times out, the bridge window names the next step and its Y counts', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = true;
  let shown = '';
  output.on('data', c => { shown += c.toString(); });
  const ask = B.consoleConfirm(input, output);
  try {
    const first = ask('Add Desk lamp, 192.168.1.40, WiZ?');
    await new Promise(r => setImmediate(r));
    mock.timers.tick(60e3);
    assert.equal(await first, false, 'no answer in 60 seconds is No');
    shown = '';
    const second = ask('Pair Living-room TV, 192.168.1.31, LG webOS?');
    await new Promise(r => setImmediate(r));
    const prompt = shown;
    input.write('y\n');
    await new Promise(r => setImmediate(r));
    let settled = null; second.then(v => { settled = v; });
    await new Promise(r => setImmediate(r));
    mock.timers.tick(60e3);
    await new Promise(r => setImmediate(r));
    assert.match(prompt, /Pair Living-room TV/, `the window should name the step it is asking about; it showed: ${JSON.stringify(prompt)}`);
    assert.equal(settled, true, 'the Y typed for the second question should count for it');
  } finally { ask.close(); mock.timers.reset(); }
});

/* ---- Finding: a typed address's failures differ in time, so "it cannot map your network" overstates ---------------- */
test('review: a typed address answers every failure alike, in time as well as in words', async () => {
  const closedPort = await freePort();                                                   // nothing listens: refused at once
  const held = []; const silent = net.createServer(s => held.push(s));                   // accepts, never answers
  await new Promise(r => silent.listen(0, '127.0.0.1', r));
  const e = await bridge({ realClock: true });
  e.portMap['127.0.0.10:8060'] = closedPort; e.portMap['127.0.0.20:8060'] = silent.address().port;
  try {
    const time = async address => { const t0 = Date.now(); const r = await e.post('/iot/identify', { kind: 'roku', address }); return { ms: Date.now() - t0, r: r.json }; };
    const a = await time('127.0.0.10'), b = await time('127.0.0.20');
    assert.equal(a.r.error, b.r.error, 'the same words');
    assert.ok(Math.abs(a.ms - b.ms) < 1000, `a refused address answered in ${a.ms} ms and a silent one in ${b.ms} ms, so a page can tell which addresses hold a computer`);
  } finally { await e.close(); for (const s of held) s.destroy(); silent.close(); }
});

test('review: no socket, listen, bind or datagram in this file left loopback', () => {
  assert.deepEqual(tripwire.violations, []);
});

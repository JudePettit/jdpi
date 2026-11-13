// IoT Connect (Digital Science): the bridge side. Pure parts (addresses, arguments, MQTT, Sparkplug B, SHA-256, mDNS,
// SSDP, LIFX, WebSocket frames), then every device route driven against a fake device, the Home Assistant route, the
// UNS link to a fake broker, and the phone remote's pairing and signatures.
//   node --test tests/iot-connect.test.mjs
// NOTHING HERE TOUCHES THE REAL NETWORK. Every device, broker, hub and phone is a fake on 127.0.0.1 started by the test;
// the bridge runs under netPolicy "loopback" (sockets only to 127.0.0.0/8 or ::1, names only from a fixture map), the
// real SSDP and mDNS listeners are fed fixture packets instead of opening sockets, and the tripwire below fails any
// socket, listen, bind or datagram that is not loopback (and any multicast or broadcast setting).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTripwire, tripwire, fixture, fakeUpnp, fakeRoku, fakeHue, fakeShelly, fakeTasmota, fakeWiz, fakeYeelight, fakeLifx, fakeLg, fakeSamsung, fakeHa, fakeBroker, fakeAi } from './tools/fake-devices.mjs';
import { makeCA, makeLeaf, serialNumber } from './tools/selfsigned.mjs';
import * as B from '../sigint/bridge/prp-bridge.mjs';
import { siteServer, parseHeaders, headersFor } from './tools/site-server.mjs';
import { pageTest, launch } from './tools/pages.mjs';
import * as W from '../digital/iot-connect/lib/words.js';
import * as KM from '../digital/iot-connect/lib/keymap.js';
import * as S from '../digital/iot-connect/lib/sha256.js';
import * as Q from '../digital/iot-connect/lib/qr.js';
import * as M from '../digital/iot-connect/lib/model.js';
import * as BR from '../digital/iot-connect/lib/bridge.js';

installTripwire();
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TMP = mkdtempSync(path.join(os.tmpdir(), 'vm-iot-test-'));
after(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows may hold a file a moment */ } });
let stateN = 0;
const newStatePath = () => path.join(TMP, `iot-state-${++stateN}.json`);
const ORIGIN = 'https://jdpi.pages.dev';
const hexFixture = name => Buffer.from(fixture(name).split(/\r?\n/).filter(l => l && !l.startsWith('#')).join(''), 'hex');
const ssdp = name => Buffer.from(fixture(name));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what = 'condition', ms = 4000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${what}`); await sleep(20); }
}
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
// Two calls to freePort() in a row can be given the same port (it is closed before it is returned): a port that must differ is drawn again.
const otherPort = async (...taken) => { for (;;) { const p = await freePort(); if (!taken.includes(p)) return p; } };
const hx = s => Buffer.from(s).toString('hex');
const u16 = n => n.toString(16).padStart(4, '0');

/**
 * One bridge with IoT Connect on, under the loopback policy, served on a free loopback port. `answer` decides each Y/N
 * question in the bridge window (null: no window at all). The clock is fake unless `realClock`.
 */
async function bridge({ iot = {}, env = {}, lan = false, answer = () => true, realClock = false, statePath = newStatePath(), deps = {} } = {}) {
  const port = await freePort();
  const cfg = { interface: 'Loopback (tests)', ...iot };
  if (lan && !cfg.lan) cfg.lan = { address: '127.0.0.1', port: await otherPort(port, B.DEFAULT_PORT) };
  const o = { port, quiet: true, routes: { adsb: 'http://127.0.0.1:9/data/aircraft.json' }, origins: [...B.DEFAULT_ORIGINS], public: false, aisstreamKey: '',
    iot: B.normaliseIot(cfg, { iot: true, lan, state: statePath }, port, env) };
  const questions = [], logs = [], portMap = {}, resolver = {}, packets = [];
  let T = Date.parse('2026-11-07T12:00:00Z');
  const ctl = { profile: 'Private' };
  const server = B.createBridge(o, {
    policy: 'loopback', portMap, resolver, interfaces: () => ({}), profile: async () => ctl.profile,
    confirm: answer === null ? null : async q => { questions.push(q); return answer(q); },
    ...(realClock ? {} : { now: () => T }), discoverySource: async () => packets.splice(0), log: t => logs.push(t), timeout: 2500, brokerRetryMs: 600e3, identifyHoldMs: 0, ...deps,
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const base = `http://localhost:${port}`;
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(`${base}${p}`, { method, headers: { Origin: ORIGIN, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, headers: r.headers, json, text };
  };
  const env_ = {
    o, server, iot: server.iot, port, base, questions, logs, portMap, resolver, packets, ctl, statePath,
    clock: { now: () => T, advance: ms => { T += ms; } },
    get: p => call('GET', p), post: (p, body) => call('POST', p, body ?? {}), call,
    /** A command from the page, a second apart on the fake clock so the rate limit never holds it. */
    async cmd(device, action, args) { T += 1000; return (await call('POST', '/iot/command', { v: 1, id: `c-${action}`, device, action, ...(args ? { args } : {}) })).json; },
    async inject(via, packet, from) { const r = await server.iot.inject(via, packet, from); return Array.isArray(r) ? r[0] : r; },
    async add(candidate, extra = {}) { const r = await call('POST', '/iot/add', { candidate: candidate.id ?? candidate, owned: true, ...extra }); assert.equal(r.status, 200, `add: ${r.text}`); return r.json.device; },
    close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); }),
  };
  return env_;
}

/* =====================================================================================================================
 * Pure parts
 * ===================================================================================================================== */
test('iot: options: --iot, --lan, exact origins, the config file’s iot block', () => {
  const o = B.parseArgs(['--iot', '--iot-origin', 'https://example.org/', '--state', path.join(TMP, 'x.json')], { VM_HA_TOKEN: 'abc', VM_MQTT_PASSWORD: 'pw' });
  assert.equal(o.iot.enabled, true); assert.deepEqual(o.iot.origins, ['https://example.org']); assert.equal(o.iot.lan.enabled, false);
  assert.equal(o.iot.haToken, 'abc'); assert.equal(o.iot.mqttPassword, 'pw'); assert.equal(o.iot.volumeCeiling, 80); assert.equal(o.iot.lan.port, 8791);
  assert.equal(B.parseArgs(['--lan']).iot.enabled, true, '--lan implies --iot');
  assert.equal(B.parseArgs([]).iot.enabled, false, 'IoT is off unless started with --iot');
  assert.throws(() => B.parseArgs(['--iot-origin', 'http://localhost:*']), /not an origin|exact origin/);
  assert.throws(() => B.parseArgs(['--iot-origin', 'https://*.example.org']), /not an origin|exact origin/);
  assert.throws(() => B.parseArgs(['--iot-origin', 'https://example.org/path']), /exact origin/);
  assert.throws(() => B.normaliseIot({ broker: { url: 'http://x' } }, { iot: true }), /mqtt/);
  assert.throws(() => B.normaliseIot({ broker: { url: 'mqtt://x', site: 'my home/#' } }, { iot: true }), /site/);
  assert.throws(() => B.normaliseIot({ lan: { port: 8790 } }, { iot: true, lan: true }), /lan\.port/);
  assert.throws(() => B.normaliseIot({ homeAssistant: { url: 'http://ha.local:8123/?token=x' } }, { iot: true }), /homeAssistant/);
  const b = B.normaliseIot({ broker: { url: 'ws://192.168.1.20:9001' } }, { iot: true }).broker;
  assert.deepEqual([b.site, b.group, b.edgeNode, b.json, b.sparkplug, b.acceptCommands], ['home', 'VM', 'hermes', true, false, false], 'design §7 defaults');
  assert.equal(B.normaliseIot({ ai: { enabled: true } }, { iot: true }).ai.enabled, true);
  assert.equal(B.normaliseIot({}, { iot: true }).ai.enabled, false, 'the AI question is off by default');
});

test('iot: allowedTarget: private, on the home interface and no other; loopback only for the broker and Home Assistant', () => {
  const interfaces = {
    'Wi-Fi': [{ address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', internal: false, cidr: '192.168.1.20/24' }, { address: 'fe80::1', family: 'IPv6', internal: false, cidr: 'fe80::1/64' }],
    'Work VPN': [{ address: '10.8.0.5', netmask: '255.255.0.0', family: 'IPv4', internal: false, cidr: '10.8.0.5/16' }],
    'vEthernet (WSL)': [{ address: '172.20.0.1', netmask: '255.255.240.0', family: 'IPv4', internal: false, cidr: '172.20.0.1/20' }],
    Loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, cidr: '127.0.0.1/8' }],
  };
  const at = (ip, extra = {}) => B.allowedTarget(ip, { interfaces, homeInterface: 'Wi-Fi', ...extra });
  assert.deepEqual(at('192.168.1.31'), { ok: true });
  assert.equal(at('8.8.8.8').ok, false, 'a public address'); assert.match(at('8.8.8.8').reason, /home network/);
  assert.equal(at('192.168.2.31').ok, false, 'private but on no home subnet');
  assert.equal(at('10.8.0.9').ok, false, 'the VPN’s subnet'); assert.equal(at('172.20.0.9').ok, false, 'WSL’s subnet');
  assert.equal(at('127.0.0.1').ok, false, 'a device on loopback');
  assert.deepEqual(at('127.0.0.1', { purpose: 'broker', port: 1883 }), { ok: true }, 'a broker on this computer');
  assert.deepEqual(at('127.0.0.1', { purpose: 'ha', port: 8123 }), { ok: true });
  for (const port of [8790, 8791]) assert.match(at('127.0.0.1', { purpose: 'broker', port }).reason, /own ports/, `port ${port}`);
  assert.match(at('192.168.1.31', { port: 8790 }).reason, /own ports/);
  assert.match(B.allowedTarget('192.168.1.31', { interfaces, homeInterface: '' }).reason, /interface/);
  assert.match(B.allowedTarget('192.168.1.31', { interfaces, homeInterface: 'Ethernet' }).reason, /not connected/);
  const both = { ...interfaces, 'Other adapter': [{ address: '192.168.1.99', netmask: '255.255.255.0', family: 'IPv4', internal: false, cidr: '192.168.1.99/24' }] };
  assert.equal(B.allowedTarget('192.168.1.31', { interfaces: both, homeInterface: 'Wi-Fi' }).reason, 'This address could also be reached through another connection, such as a work VPN.');
  assert.equal(at('fe80::abcd').ok, true, 'link-local on the home interface'); assert.equal(at('2001:db8::1').ok, false);
  assert.equal(at('not an address').ok, false);
  assert.ok(B.isPrivateAddress('172.31.255.255') && !B.isPrivateAddress('172.32.0.1') && B.isPrivateAddress('fd12::1') && !B.isPrivateAddress('100.64.0.1'));
  assert.deepEqual(B.homeAddress(interfaces, 'Wi-Fi'), { address: '192.168.1.20', broadcast: '192.168.1.255' });
  // --lan: one private IPv4 address of the home interface, never 0.0.0.0, never on a Public network.
  const lan = (a, extra = {}) => B.lanAddressProblem(a, { interfaces, homeInterface: 'Wi-Fi', profile: 'Private', ...extra });
  assert.equal(lan('192.168.1.20'), null);
  assert.match(lan('0.0.0.0'), /never 0\.0\.0\.0/); assert.match(lan('10.8.0.5'), /home connection/); assert.match(lan('8.8.8.8'), /private/); assert.match(lan(''), /lan\.address/);
  assert.match(lan('192.168.1.20', { profile: 'Public' }), /Public/);
  assert.match(lan('192.168.1.20', { policy: 'loopback' }), /127\.0\.0\.1/); assert.equal(lan('127.0.0.1', { policy: 'loopback' }), null);
});

test('iot: the netPolicy "loopback" guard refuses every address outside 127.0.0.0/8 and ::1, and unlisted names', async () => {
  const n = B.makeNet({ policy: 'loopback', resolver: { 'hue.local': '127.0.0.50' }, portMap: { '127.0.0.50:443': 4443 } });
  for (const ip of ['192.168.1.10', '10.0.0.1', '8.8.8.8', '224.0.0.251', '239.255.255.250', 'fd00::1']) await assert.rejects(n.target(ip, 80), /not a loopback address/, ip);
  await assert.rejects(n.target('tv.local', 80), /not in the fixture map/);
  await assert.rejects(n.target('example.org', 443), /not in the fixture map/);
  assert.deepEqual(await n.target('hue.local', 443), { ip: '127.0.0.50', port: 443, connectHost: '127.0.0.1', connectPort: 4443 });
  await assert.rejects(n.target('127.0.0.1', 8790), /own ports/); await assert.rejects(n.target('127.0.0.1', 8791), /own ports/);
  assert.throws(() => n.discoverySocket(), /discovery sockets are not opened/);
  await assert.rejects(n.udp('192.168.1.10', 38899, Buffer.from('{}')), /not a loopback address/);
  // The home policy's discovery socket sends only the standard questions to their fixed groups (checked without a socket).
  const home = B.makeNet({ policy: 'home', interfaces: {}, homeInterface: 'Wi-Fi' });
  assert.throws(() => home.discoverySocket(), /not connected/);
  // The tripwire itself: a socket to a non-loopback address throws before anything is sent, and is recorded.
  assert.throws(() => net.connect({ host: '192.0.2.1', port: 9 }), /TRIPWIRE/);
  assert.equal(tripwire.violations.pop(), 'connect to 192.0.2.1:9');
});

test('iot: the state file is refused inside the repository, the bridge’s folder or OneDrive', () => {
  assert.match(B.statePathProblem(path.join(ROOT, 'iot-state.json')), /git working tree|OneDrive/);
  assert.match(B.statePathProblem(path.join(ROOT, 'sigint', 'bridge', 'iot-state.json')), /own folder|OneDrive/);
  assert.match(B.statePathProblem(path.join(TMP, 'x', 'iot-state.json'), { bridgeDir: path.join(TMP, 'x') }), /own folder/);
  assert.match(B.statePathProblem('C:/Users/someone/OneDrive/VM/iot-state.json'), /OneDrive/);
  assert.equal(B.statePathProblem(path.join(TMP, 'ok', 'iot-state.json')), null);
  assert.throws(() => B.openState(path.join(ROOT, 'tests', 'iot-state.json')), /git working tree|OneDrive/);
  assert.match(B.defaultStatePath({ APPDATA: 'C:/Users/u/AppData/Roaming', XDG_CONFIG_HOME: '/home/u/.config' }), /VM[\\/]bridge[\\/]iot-state\.json$|vm[\\/]bridge[\\/]iot-state\.json$/);
  const o = { port: 18999, quiet: true, iot: B.normaliseIot({}, { iot: true, state: path.join(ROOT, 'iot-state.json') }, 18999) };
  assert.throws(() => B.createIot(o, { policy: 'loopback' }), /git working tree|OneDrive/, 'the bridge will not start with a state file in the repository');
  assert.ok(!existsSync(path.join(ROOT, 'iot-state.json')));
});

test('iot: the fixed action table: argument schemas, clamping and refusals', () => {
  assert.deepEqual(B.checkArgs('power', { on: true }), { on: true });
  assert.deepEqual(B.checkArgs('toggle', undefined), {});
  assert.deepEqual(B.checkArgs('brightness', { level: 140 }), { level: 100 }); assert.deepEqual(B.checkArgs('brightness', { level: -5 }), { level: 0 });
  assert.deepEqual(B.checkArgs('colour', { hex: '#ff8000' }), { hex: '#ff8000' });
  assert.deepEqual(B.checkArgs('colour-temp', { kelvin: 9000 }), { kelvin: 6500 }); assert.deepEqual(B.checkArgs('colour-temp', { kelvin: 100 }), { kelvin: 2000 });
  assert.deepEqual(B.checkArgs('volume', { level: 95 }, { ceiling: 80 }), { level: 80 }, 'volume stops at the ceiling');
  assert.deepEqual(B.checkArgs('mute', { on: false }), { on: false });
  assert.deepEqual(B.checkArgs('seek', { seconds: 3725.4 }), { seconds: 3725 });
  assert.deepEqual(B.checkArgs('play-url', { url: 'http://192.168.1.10:8200/film.mp4?a=1&b=2' }), { url: 'http://192.168.1.10:8200/film.mp4?a=1&b=2' });
  assert.deepEqual(B.checkArgs('key', { name: 'OK' }), { name: 'OK' });
  assert.deepEqual(B.checkArgs('launch', { app: '12' }, { protocol: 'roku-ecp' }), { app: '12' });
  assert.deepEqual(B.checkArgs('launch', { app: 'com.webos.app.netflix' }, { protocol: 'lg-webos' }), { app: 'com.webos.app.netflix' });
  assert.deepEqual(B.checkArgs('ha', { domain: 'light', service: 'toggle', entity: 'light.kitchen' }), { domain: 'light', service: 'toggle', entity: 'light.kitchen' });
  const no = (action, args, extra, re = /./) => assert.throws(() => B.checkArgs(action, args, extra), e => e instanceof B.IotError && e.code === 'unsupported' && re.test(e.message), `${action} ${JSON.stringify(args)}`);
  no('reboot', {}); no('factory-reset', {}); no('raw', { data: 'x' });
  no('power', { on: 'yes' }); no('power', {}); no('power', { on: true, extra: 1 }, {}, /not a field/);
  no('brightness', { level: '50' }); no('brightness', { level: NaN }); no('colour', { hex: '#FF8000' }); no('colour', { hex: 'red' });
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'http://x/<a>', 'http://x/"onload', 'http://user:pw@192.168.1.10/f.mp4', `http://x/${'a'.repeat(2100)}`, 'http://x/a b', 'ftp://x/f'])
    no('play-url', { url }, {}, /address/);
  no('play-url', { url: '<DIDL-Lite><item/></DIDL-Lite>' });
  for (const name of ['../install/12', 'Install', 'Search', 'input', 'PowerOn', '__proto__', 'constructor']) no('key', { name });
  for (const app of ['../install/12', '12/../../install', '12?x=1', 'abc']) no('launch', { app }, { protocol: 'roku-ecp' });
  no('launch', { app: 'Com.App' }, { protocol: 'lg-webos' }); no('launch', { app: '../x' }, { protocol: 'lg-webos' });
  no('ha', { domain: 'light', service: 'turn_on', entity: 'light.kitchen; rm' }); no('ha', { domain: 'Light', service: 'turn_on', entity: 'light.kitchen' });
  no('ha', { domain: 'remote', service: 'send_command', entity: 'remote.tv', command: '<x>' });
  no('power', [true]);
  // The phone and the broker get smaller tables.
  for (const a of ['play-url', 'launch', 'seek']) assert.ok(!B.PHONE_ACTIONS.has(a), `phone: ${a}`);
  for (const a of ['play-url', 'ha', 'key', 'launch']) assert.ok(!B.BROKER_ACTIONS.has(a), `broker: ${a}`);
  assert.deepEqual(Object.keys(B.HA_SERVICES), ['light', 'switch', 'media_player', 'remote']);
  assert.deepEqual(B.HA_SERVICES.remote, ['send_command'], 'never learn_command');
});

test('iot: text from devices stays text; UNS names are slugs; secrets and query strings are scrubbed', () => {
  assert.equal(B.xmlEscape(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  assert.equal(B.xmlText('<root><friendlyName>&lt;img src=x onerror=alert(1)&gt;</friendlyName></root>', 'friendlyName'), '<img src=x onerror=alert(1)>');
  assert.equal(B.cleanText('a\u0000b\nc\u001b[31m  d', 64), 'a b c [31m d');
  assert.equal(B.cleanText('x'.repeat(100)).length, 64);
  assert.equal(B.slug('Living #room/+'), 'living-room'); assert.equal(B.slug('Café Bar'), 'cafe-bar'); assert.equal(B.slug('###'), 'unnamed');
  const didl = B.didlFor('http://192.168.1.10/f.mp4?a=1&b=<2>');
  assert.match(didl, /<res protocolInfo="http-get:\*:\*:\*">http:\/\/192\.168\.1\.10\/f\.mp4\?a=1&amp;b=&lt;2&gt;<\/res>/);
  const s = B.scrub('GET http://ha.local:8123/api/states?token=abc123 Authorization: Bearer eyJhbGciOi.secret.sig token="abcdef12" key=topsecret password=hunter22 {"client-key":"lgkey99"} sk-live-123456', ['sk-live-123456']);
  for (const leak of ['abc123', 'eyJhbGciOi', 'abcdef12', 'topsecret', 'hunter22', 'lgkey99', 'sk-live-123456']) assert.ok(!s.includes(leak), `${leak} in ${s}`);
  assert.match(s, /http:\/\/ha\.local:8123\/api\/states\?…/);
  assert.equal(B.scrub('This Shelly has a password: type it once on the Devices tab.'), 'This Shelly has a password: type it once on the Devices tab.', 'plain English is left alone');
});

test('iot: MQTT 3.1.1 packets, byte for byte', () => {
  const str = s => u16(Buffer.byteLength(s)) + hx(s);
  const connect = B.mqtt.connect({ clientId: 'vm-home-hermes', keepalive: 30, clean: true, username: 'vm', password: 'pw', will: { topic: 'vm/home/hermes/status', payload: 'offline', qos: 1, retain: true } });
  const body = str('MQTT') + '04' + 'ee' + '001e' + str('vm-home-hermes') + str('vm/home/hermes/status') + str('offline') + str('vm') + str('pw');
  assert.equal(connect.toString('hex'), '10' + (body.length / 2).toString(16) + body, 'CONNECT: level 4, flags 0xEE (user, password, will retain, will QoS 1, will, clean)');
  assert.equal(B.mqtt.connect({ clientId: 'a', keepalive: 60 }).toString('hex'), '100d' + str('MQTT') + '04' + '02' + '003c' + str('a'));
  assert.equal(B.mqtt.publish({ topic: 'a/b', payload: 'hi', retain: true }).toString('hex'), '3107' + str('a/b') + hx('hi'));
  assert.equal(B.mqtt.publish({ topic: 'a/b', payload: 'hi', qos: 1, packetId: 10 }).toString('hex'), '3209' + str('a/b') + '000a' + hx('hi'));
  assert.equal(B.mqtt.publish({ topic: 'a/b', payload: '', retain: true }).toString('hex'), '3105' + str('a/b'), 'an empty retained message clears the topic');
  assert.equal(B.mqtt.subscribe(1, [{ topic: 'a/+', qos: 0 }, { topic: 'spBv1.0/VM/NCMD/hermes', qos: 1 }]).toString('hex'), '82' + (2 + 6 + 2 + 22 + 1).toString(16) + '0001' + str('a/+') + '00' + str('spBv1.0/VM/NCMD/hermes') + '01');
  assert.equal(B.mqtt.puback(7).toString('hex'), '40020007');
  assert.equal(B.mqtt.pingreq().toString('hex'), 'c000'); assert.equal(B.mqtt.disconnect().toString('hex'), 'e000');
  // Remaining length (§2.2.3): one to four bytes.
  for (const [n, h] of [[0, '00'], [127, '7f'], [128, '8001'], [16383, 'ff7f'], [16384, '808001'], [2097151, 'ffff7f'], [2097152, '80808001'], [268435455, 'ffffff7f']]) assert.equal(B.mqttLength(n).toString('hex'), h, String(n));
  assert.throws(() => B.mqttLength(268435456), /too large/);
  // The parser, fed byte by byte, reads what a broker sends.
  const parse = B.mqttParser(), got = [];
  const stream = Buffer.from('20020000' + '3007' + str('a/b') + hx('hi') + '3209' + str('a/b') + '000a' + hx('hi') + '9003000100' + 'd000', 'hex');
  for (const b of stream) got.push(...parse(Buffer.from([b])));
  assert.deepEqual(got.map(p => p.type), [2, 3, 3, 9, 13]);
  assert.equal(got[0].returnCode, 0);
  assert.deepEqual([got[1].topic, got[1].payload.toString(), got[1].qos], ['a/b', 'hi', 0]);
  assert.deepEqual([got[2].qos, got[2].packetId], [1, 10]);
  assert.deepEqual(got[3].granted, [0]);
  const big = B.mqtt.publish({ topic: 't', payload: 'x'.repeat(300) });
  assert.equal(big.subarray(0, 3).toString('hex'), '30af02', '303 bytes after the fixed header');
  assert.equal(B.mqttParser()(big)[0].payload.length, 300);
});

test('iot: Sparkplug B payloads, byte for byte and decoded back', () => {
  const nd = B.spEncode({ timestamp: 1, seq: 0, metrics: [{ name: 'bdSeq', datatype: B.SP_TYPES.Int64, value: 0 }] });
  assert.equal(nd.toString('hex'), '0801' + '120b' + '0a05' + hx('bdSeq') + '2004' + '5800' + '1800');
  const nb = B.spEncode({ timestamp: 1, metrics: [{ name: 'Node Control/Rebirth', datatype: B.SP_TYPES.Boolean, value: false, timestamp: 2 }] });
  assert.equal(nb.toString('hex'), '0801' + '121c' + '0a14' + hx('Node Control/Rebirth') + '1802' + '200b' + '7000');
  assert.equal(B.spEncode({ timestamp: 300, metrics: [] }).toString('hex'), '08ac02', 'varint 300');
  const ts = 1794052800000, metrics = [
    { name: 'Online', datatype: B.SP_TYPES.Boolean, value: true, timestamp: ts }, { name: 'Power', datatype: B.SP_TYPES.Boolean, value: null, timestamp: ts },
    { name: 'Brightness', datatype: B.SP_TYPES.Int32, value: 73, timestamp: ts }, { name: 'Volume', datatype: B.SP_TYPES.Int32, value: -1, timestamp: ts },
    { name: 'Playback', datatype: B.SP_TYPES.String, value: 'playing', timestamp: ts }, { name: 'Kind', datatype: B.SP_TYPES.String, value: 'media-renderer', timestamp: ts },
    { name: 'bdSeq', datatype: B.SP_TYPES.Int64, value: 255, timestamp: ts },
  ];
  const back = B.spDecode(B.spEncode({ timestamp: ts, seq: 255, metrics }));
  assert.equal(back.timestamp, ts); assert.equal(back.seq, 255);
  assert.deepEqual(back.metrics.map(m => [m.name, m.datatype, m.value]), metrics.map(m => [m.name, m.datatype, m.value]));
  assert.equal(back.metrics[1].isNull, true, 'a missing value is sent as is_null');
  assert.ok(back.metrics.every(m => m.timestamp === ts));
});

test('iot: SHA-256 and HMAC by hand match Node’s, and the phone’s signature is the bridge’s', () => {
  for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 200, 1000, 70000]) {
    const b = randomBytes(n);
    assert.equal(Buffer.from(B.sha256(b)).toString('hex'), createHash('sha256').update(b).digest('hex'), `sha256 of ${n} bytes`);
    const k = randomBytes(n % 3 === 0 ? 100 : 32);
    assert.equal(Buffer.from(B.hmacSha256(k, b)).toString('hex'), createHmac('sha256', k).update(b).digest('hex'), `hmac of ${n} bytes`);
  }
  assert.equal(Buffer.from(B.sha256(Buffer.from('abc'))).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'FIPS 180-2 test vector');
  const key = randomBytes(32).toString('base64url'), text = B.signingText('POST', '/remote/api/command', '{"v":1}', '1794052800000', 'ab'.repeat(8));
  assert.equal(text.split('\n').length, 5);
  assert.equal(B.phoneSignature(key, 'POST', '/remote/api/command', '{"v":1}', '1794052800000', 'ab'.repeat(8)), Buffer.from(B.hmacSha256(B.sha256(Buffer.from(key, 'base64url')), Buffer.from(text))).toString('hex'));
  // The remote's script carries these same functions and the shared keymap, and parses.
  const script = B.remoteScript();
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /function sha256\(/); assert.match(script, /function hmacSha256\(/);
  assert.match(script, new RegExp(`const KEYMAP_NAMES = ${JSON.stringify(B.PHONE_KEYS).replace(/[[\]]/g, '\\$&')};`));
  assert.ok(B.PHONE_KEYS.every(k => Object.hasOwn(B.KEYMAP, k)), 'every phone key is in the keymap');
  for (const k of ['Up', 'Down', 'Left', 'Right', 'OK', 'Back', 'Home']) assert.ok(B.PHONE_KEYS.includes(k), `the d-pad has ${k}`);
  assert.ok(Object.values(B.KEYMAP).every(m => m.roku && m.lg && m.samsung), 'each key is mapped for Roku, LG and Samsung');
});

test('iot: SSDP, mDNS, LIFX and WebSocket codecs', () => {
  assert.equal(B.ssdpSearch('roku:ecp').toString(), `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: roku:ecp\r\nUSER-AGENT: vm-bridge/${B.VERSION} (IoT Connect)\r\n\r\n`);
  assert.ok(!B.SSDP_TARGETS.includes('ssdp:all'), 'never ssdp:all, which finds routers');
  assert.deepEqual(B.SSDP_TARGETS, ['urn:schemas-upnp-org:device:MediaRenderer:1', 'urn:schemas-upnp-org:device:ZonePlayer:1', 'roku:ecp']);
  const r = B.parseSsdp(ssdp('ssdp-ezcast-u02.txt'));
  assert.equal(r.kind, 'reply'); assert.equal(r.headers.location, 'http://127.0.0.44:49152/description.xml'); assert.equal(r.headers.st, 'urn:schemas-upnp-org:device:MediaRenderer:1');
  assert.equal(B.parseSsdp(Buffer.from('NOTIFY * HTTP/1.1\r\nNT: roku:ecp\r\n\r\n')).kind, 'notify');
  assert.equal(B.parseSsdp(Buffer.from('M-SEARCH * HTTP/1.1\r\n\r\n')), null);
  const q = B.mdnsDecode(B.mdnsQuery(B.MDNS_TYPES));
  assert.deepEqual(q.questions.map(x => [x.name, x.type, x.cls]), B.MDNS_TYPES.map(t => [t, 12, 0x8001]), 'PTR questions asking for a unicast answer');
  const hue = B.mdnsDecode(hexFixture('mdns-hue.txt'));
  assert.deepEqual(hue.records.map(x => x.type), ['PTR', 'SRV', 'TXT', 'A']);
  assert.equal(hue.records[0].data, 'Hue Bridge - 123456._hue._tcp.local'); assert.equal(hue.records[1].data.port, 443);
  assert.deepEqual(hue.records[2].data, { bridgeid: '001788fffe123456', modelid: 'BSB002' }); assert.equal(hue.records[3].data, '127.0.0.50');
  // Compression pointers decode; a pointer loop is refused rather than followed forever.
  const comp = Buffer.concat([Buffer.from('000084000000000100000000', 'hex'), Buffer.from('04' + hx('_hue') + '04' + hx('_tcp') + '05' + hx('local') + '00', 'hex'), Buffer.from('000c000100000078000206' + hx('bridge') + 'c00c', 'hex')]);
  comp.writeUInt16BE(9, 12 + 17 + 8); // fix RDLENGTH to the real 9 bytes
  assert.equal(B.mdnsDecode(comp).records[0].data, 'bridge._hue._tcp.local');
  assert.throws(() => B.mdnsDecode(Buffer.from('0000840000000001000000000c00000c000100000078000000', 'hex')), /bad name/);
  assert.throws(() => B.mdnsDecode(Buffer.from('0000', 'hex')), /short/);
  const lp = B.lifxPacket(2, Buffer.alloc(0), { tagged: true, resRequired: true, source: 0x11223344, sequence: 7 });
  assert.equal(lp.toString('hex'), '2400' + '0034' + '44332211' + '00'.repeat(8) + '00'.repeat(6) + '01' + '07' + '00'.repeat(8) + '0200' + '0000', 'GetService: size 36, protocol 1024 addressable tagged');
  assert.deepEqual(B.lifxParse(lp), { type: 2, source: 0x11223344, target: '000000000000', sequence: 7, payload: Buffer.alloc(0) });
  assert.equal(B.lifxParse(Buffer.alloc(10)), null);
  const xy = B.hexToXy('#ff0000'); assert.ok(Math.abs(xy.x - 0.64) < 0.01 && Math.abs(xy.y - 0.33) < 0.01, 'sRGB red');
  assert.deepEqual(B.hexToHsv('#00ff00'), { h: 120, s: 1, v: 1 });
  const frames = [];
  const parse = B.wsParser((op, payload, fin) => frames.push([op, payload.toString(), fin]));
  const long = 'y'.repeat(70000);
  parse(Buffer.concat([B.wsFrame(1, 'hello'), B.wsFrame(1, 'x'.repeat(300)), B.wsFrame(2, Buffer.from('bin'), false), B.wsFrame(1, long, true)]));
  assert.deepEqual(frames.map(f => [f[0], f[1].length]), [[1, 5], [1, 300], [2, 3], [1, 70000]]);
  assert.equal(frames[0][1], 'hello');
  const masked = B.wsFrame(1, 'abc', true, Buffer.from([1, 2, 3, 4]));
  assert.equal(masked.toString('hex'), '8183' + '01020304' + [0x61 ^ 1, 0x62 ^ 2, 0x63 ^ 3].map(x => x.toString(16).padStart(2, '0')).join(''), 'clients mask (RFC 6455 §5.3)');
  assert.equal(B.wsAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=', 'RFC 6455 §1.3 example');
});

test('iot: Hermes’s rules name each device, its route, its pairing and what VM cannot do', () => {
  const id = facts => B.hermesIdentify(facts)?.id ?? null;
  assert.equal(id({ manufacturer: 'EZCast', model: 'EZ-U02', deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' }), 'ezcast-dlna');
  assert.equal(id({ st: 'urn:schemas-upnp-org:device:ZonePlayer:1' }), 'sonos');
  assert.equal(id({ st: 'roku:ecp' }), 'roku');
  assert.equal(id({ manufacturer: 'LG Electronics.', deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' }), 'lg-webos');
  assert.equal(id({ manufacturer: 'Samsung Electronics', deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' }), 'samsung-tizen');
  assert.equal(id({ mdnsType: '_hue._tcp' }), 'hue'); assert.equal(id({ mdnsType: '_shelly._tcp' }), 'shelly'); assert.equal(id({ via: 'wiz' }), 'wiz');
  assert.equal(id({ via: 'yeelight' }), 'yeelight'); assert.equal(id({ via: 'lifx' }), 'lifx'); assert.equal(id({ typedKind: 'tasmota' }), 'tasmota');
  assert.equal(id({ mdnsType: '_googlecast._tcp' }), 'google-cast'); assert.equal(id({ mdnsType: '_airplay._tcp' }), 'airplay');
  assert.equal(id({ manufacturer: 'Nobody Ltd', deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' }), 'dlna-generic');
  assert.equal(id({ manufacturer: 'Nobody Ltd', deviceType: 'urn:schemas-upnp-org:device:InternetGatewayDevice:1' }), null, 'a router is not a device VM drives');
  const ez = B.HERMES_RULES.find(r => r.id === 'ezcast-dlna');
  assert.ok(ez.limits.some(l => /Miracast/.test(l) && /Windows key \+ K/.test(l)));
  assert.equal(B.HERMES_RULES.find(r => r.id === 'hue').pairing.steps[0], 'Press the round button on the Hue bridge, then Continue.');
  for (const r of B.HERMES_RULES) {
    assert.ok(r.id && r.kind && r.says && r.pairing && Array.isArray(r.pairing.steps) && Array.isArray(r.routes) && Array.isArray(r.limits), r.id);
    assert.ok(!/admin|password list|default password/i.test(JSON.stringify(r.pairing)) || r.id === 'shelly' || r.id === 'tasmota' || r.id === 'home-assistant', `${r.id}: no admin pages, no password lists`);
  }
  // The passive NOTIFY listener on port 1900 fails gently when the port is busy (Windows' own SSDP service).
  const said = [];
  assert.equal(B.listenPassive(() => { throw Object.assign(new Error('bind EADDRINUSE 0.0.0.0:1900'), { code: 'EADDRINUSE' }); }, t => said.push(t)), null);
  assert.match(said[0], /Port 1900 is busy \(EADDRINUSE\); VM still asks/);
});

/* =====================================================================================================================
 * The bridge's HTTP guards
 * ===================================================================================================================== */
test('iot: origins, methods, Content-Type, size, Host, and the SIGINT routes left as they were', async () => {
  const e = await bridge({ iot: { origins: ['https://example.org'] } });
  try {
    const st = await e.get('/iot/status');
    assert.equal(st.status, 200); assert.equal(st.json.enabled, true); assert.deepEqual(st.json.features, ['iot-1']); assert.equal(st.json.policy, 'loopback');
    assert.equal(st.headers.get('access-control-allow-origin'), ORIGIN);
    const h = await e.get('/health');
    assert.deepEqual(h.json.features, ['iot-1']); assert.equal(h.json.iot.enabled, true); assert.equal(h.json.version, '2.0.0');
    assert.equal((await e.call('GET', '/iot/status', undefined, { Origin: 'https://example.org' })).status, 200, 'an origin named in the config file');
    for (const bad of ['https://evil.example', 'http://localhost:8787', 'http://127.0.0.1:3000', 'null', 'https://jdpi.pages.dev.evil.example']) {
      const r = await e.call('GET', '/iot/status', undefined, { Origin: bad });
      assert.equal(r.status, 403, bad); assert.equal(r.json.code, 'bad-origin'); assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
    const none = await fetch(`${e.base}/iot/status`); assert.equal(none.status, 403, 'no Origin: refused (curl too)');
    const pre = await fetch(`${e.base}/iot/command`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-methods'), /POST/); assert.match(pre.headers.get('access-control-allow-headers'), /Content-Type/); assert.match(pre.headers.get('access-control-allow-headers'), /X-VM-Sig/);
    const wrongType = await e.call('POST', '/iot/command', '{"v":1}', { 'Content-Type': 'text/plain' });
    assert.equal(wrongType.status, 415); assert.equal(wrongType.json.code, 'wrong-type');
    assert.equal((await e.call('POST', '/iot/command', '{"v":1}', { 'Content-Type': 'application/json; charset=utf-8' })).status, 415, 'Content-Type exactly application/json');
    const big = await e.post('/iot/command', { v: 1, pad: 'x'.repeat(17000) });
    assert.equal(big.status, 413); assert.equal(big.json.code, 'too-large');
    assert.equal((await e.post('/iot/command', '[1,2]')).status, 400);
    assert.equal((await e.call('PUT', '/iot/command', '{}')).status, 405);
    assert.equal((await e.post('/iot/nowhere', {})).status, 404);
    assert.equal((await e.get('/iot/nowhere')).status, 404);
    const gp = await e.get('/iot/phone/pair');
    assert.equal(gp.status, 405, 'a GET never makes a pairing code'); assert.match(gp.json.error, /click/);
    assert.equal((await e.call('POST', '/local/adsb', '{}')).status, 405, 'SIGINT routes stay read-only');
    const unknown = await e.post('/iot/command', { v: 1, id: 'c-1', device: 'upnp-nope', action: 'play' });
    assert.deepEqual([unknown.status, unknown.json.ok, unknown.json.id, unknown.json.code], [404, false, 'c-1', 'unknown-device']);
    assert.equal((await e.post('/iot/command', { v: 2, device: 'x', action: 'play' })).json.code, 'unsupported');
    assert.equal((await e.post('/iot/command', { v: 1, device: 'x', action: 'play', raw: '<xml/>' })).json.code, 'unsupported', 'unknown fields refused');
    const rebound = await new Promise((resolve, reject) => {
      const q = net.connect(e.port, '127.0.0.1', () => q.write(`GET /iot/status HTTP/1.1\r\nHost: attacker.example:${e.port}\r\nOrigin: ${ORIGIN}\r\nConnection: close\r\n\r\n`));
      let t = ''; q.on('data', c => { t += c; }); q.on('end', () => resolve(t)); q.on('error', reject);
    });
    assert.match(rebound, /^HTTP\/1\.1 421/, 'DNS-rebinding guard on /iot too');
    assert.equal(e.iot.state.devices.length, 0);
  } finally { await e.close(); }
  // With IoT off, /iot answers only that it is off, and only to the page.
  const o = { ...B.parseArgs(['--port', String(await freePort()), '--quiet', '--no-public']) };
  const s = B.createBridge(o);
  await new Promise(r => s.listen(o.port, '127.0.0.1', r));
  try {
    const off = await fetch(`http://localhost:${o.port}/iot/status`, { headers: { Origin: ORIGIN } });
    assert.equal(off.status, 404); assert.equal((await off.json()).code, 'iot-off');
    assert.equal((await fetch(`http://localhost:${o.port}/iot/status`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await (await fetch(`http://localhost:${o.port}/health`)).json()).iot.enabled, false);
  } finally { s.close(); }
});

test('iot: setup steps need Y in the bridge window, which names the step; without a window they are refused', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  for (const mode of ['no', 'none']) {
    const e = await bridge({ answer: mode === 'no' ? () => false : null });
    e.portMap['127.0.0.44:49152'] = dev.port;
    try {
      const c = await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 });
      const r = await e.post('/iot/add', { candidate: c.id, owned: true });
      assert.equal(r.status, 403); assert.equal(r.json.code, 'refused');
      assert.match(r.json.error, mode === 'no' ? /Not confirmed in the bridge window/ : /no window/);
      if (mode === 'no') assert.deepEqual(e.questions, ['Add EZCast U02, 127.0.0.44, DLNA player?']);
      assert.equal(e.iot.state.devices.length, 0);
      assert.equal((await e.get('/iot/status')).json.console, mode === 'no');
    } finally { await e.close(); }
  }
  dev.close();
});

/* =====================================================================================================================
 * Discovery, ownership and Hermes
 * ===================================================================================================================== */
test('iot: discovery shows the EZCast U02 from its SSDP answer, not yet known to be yours, with its DLNA route and the Miracast limit', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  const e = await bridge();
  e.portMap['127.0.0.44:49152'] = dev.port;
  try {
    e.packets.push({ via: 'ssdp', packet: ssdp('ssdp-ezcast-u02.txt'), from: { address: '127.0.0.44', port: 1900 } });
    e.packets.push({ via: 'ssdp', packet: ssdp('ssdp-elsewhere.txt'), from: { address: '127.0.0.98', port: 1900 } }); // LOCATION names 127.0.0.99
    e.packets.push({ via: 'mdns', packet: hexFixture('mdns-elsewhere.txt'), from: { address: '127.0.0.51', port: 5353 } });
    const r = await e.post('/iot/discover', {});
    assert.equal(r.status, 200);
    assert.equal(r.json.candidates.length, 1, 'answers naming another address are not used');
    const c = r.json.candidates[0];
    assert.equal(c.name, 'EZCast U02'); assert.equal(c.address, '127.0.0.44'); assert.equal(c.known, 'not-yet-yours');
    assert.equal(c.label, 'Found on this network, not yet known to be yours'); assert.equal(c.canAdd, true);
    assert.deepEqual(dev.calls, [{ action: 'GET', path: '/description.xml' }], 'one description read, nothing else');
    const f = c.finding;
    assert.deepEqual(Object.keys(f), ['type', 'v', 'at', 'candidate', 'known', 'device', 'says', 'pairing', 'routes', 'limits', 'source'], 'a Hub message (design §6)');
    assert.deepEqual([f.type, f.v, f.candidate, f.known, f.source], ['hermes.finding', 1, c.id, 'not-yet-yours', 'rule:ezcast-dlna']);
    assert.deepEqual(f.device, { kind: 'media-renderer', maker: 'EZCast', model: 'EZ-U02', name: 'EZCast U02' });
    assert.deepEqual(f.routes, ['upnp-av']); assert.equal(f.pairing.method, 'none'); assert.equal(f.pairing.consentOnDevice, false);
    assert.ok(f.limits.some(l => /Miracast/.test(l) && /Windows key \+ K/.test(l)), 'the Miracast limit');
    assert.ok(f.limits.some(l => /DLNA only/.test(l)));
    const h = await e.get('/iot/hermes');
    assert.equal(h.json.agent, 'Hermes Messenger'); assert.ok(h.json.rules.includes('ezcast-dlna')); assert.equal(h.json.findings[0].candidate, c.id); assert.equal(h.json.ai.enabled, false);
    assert.match(c.announcement, /EZCast\/1\.0/, 'the announcement is kept for the page to show (and copy)');
    // The ownership tick: Add is refused without it, and there is no "add all".
    const noTick = await e.post('/iot/add', { candidate: c.id });
    assert.equal(noTick.status, 403); assert.match(noTick.json.error, /This device is mine, or I have its owner’s permission to control it/);
    assert.equal((await e.post('/iot/add', { candidate: c.id, owned: 'yes' })).status, 403);
    assert.equal((await e.post('/iot/add', { candidate: '*', owned: true })).json.code, 'unknown-device');
    assert.equal(e.questions.length, 0, 'nothing reached the bridge window without the tick');
    const d = await e.add(c, { room: 'Living #room' });
    assert.deepEqual(e.questions, ['Add EZCast U02, 127.0.0.44, DLNA player?']);
    assert.equal(d.ownership.statement, 'mine-or-permission'); assert.equal(d.ownership.at, '2026-11-07T12:00:00Z');
    assert.deepEqual([d.protocol, d.kind, d.status, d.room, d.hermesRule, d.volumeCeiling], ['upnp-av', 'media-renderer', 'ok', 'Living #room', 'ezcast-dlna', 80]);
    assert.deepEqual(d.uns, { area: 'living-room', name: 'ezcast-u02' }, '"#" never reaches a topic');
    assert.deepEqual(d.actions, ['play-url', 'play', 'pause', 'stop', 'seek', 'volume', 'mute']);
    assert.equal('secret' in d, false); assert.equal(d.identity.value, 'uuid:e2c4a5f0-0000-4000-8000-0000ezc00u02');
    const again = (await e.post('/iot/discover', { })).json.candidates;
    e.packets.length = 0;
    assert.equal((await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 })).deviceId, d.id);
    assert.ok(again.length <= 1);
    assert.equal((await e.post('/iot/add', { candidate: c.id, owned: true })).json.error, 'That device is already one of yours.');
    const saved = JSON.parse(readFileSync(e.statePath, 'utf8'));
    assert.equal(saved.devices[0].ownership.at, '2026-11-07T12:00:00Z', 'the tick is stored with its time in the state file');
  } finally { await e.close(); dev.close(); }
});

test('iot: a hostile friendly name stays plain text, and a control address on another device (a router’s WAN service) is never used', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-hostile-renderer.txt') });
  const e = await bridge();
  e.portMap['127.0.0.45:49153'] = dev.port;
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-hostile-renderer.txt'), { address: '127.0.0.45', port: 1900 });
    assert.equal(c.name, '<img src=x onerror=alert(1)>', 'the name is data, shown by the page with textContent');
    assert.equal(c.rule.id, 'dlna-generic');
    const pc = (await e.get('/iot/candidates')).json.candidates[0];
    assert.equal(pc.generic, true); assert.match(pc.finding.says, /^Hermes does not know this device\. Here is what it announced\./);
    const d = await e.add(c);
    const saved = e.iot.state.devices[0];
    assert.match(saved.control.av, /^http:\/\/127\.0\.0\.45:49153\/AVTransport\/control$/);
    assert.equal(saved.control.rc, null, 'RenderingControl named 192.168.1.1 (WANIPConn1): dropped');
    const v = await e.cmd(d.id, 'volume', { level: 10 });
    assert.equal(v.ok, false); assert.equal(v.code, 'unsupported');
    assert.ok(dev.calls.every(x => !/WANIP|5000/.test(`${x.path} ${x.body || ''}`)));
  } finally { await e.close(); dev.close(); }
});

test('iot: answers from an address the bridge may not reach are dropped; kinds VM cannot drive are named but not added', async () => {
  const e = await bridge();
  try {
    const off = Buffer.from(fixture('ssdp-ezcast-u02.txt').replace('127.0.0.44', '192.168.1.44'));
    assert.equal(await e.inject('ssdp', off, { address: '192.168.1.44', port: 1900 }), null, 'not a loopback source under the test policy (a VPN’s under the home policy)');
    assert.equal(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: 'tv.local', port: 1900 }), null);
    assert.equal((await e.get('/iot/candidates')).json.candidates.length, 0);
    const [cast] = await e.iot.inject('mdns', hexFixture('mdns-cast.txt'), { address: '127.0.0.56', port: 5353 });
    assert.equal(cast.name, 'Living Room TV'); assert.equal(cast.rule.id, 'google-cast');
    const pc = (await e.get('/iot/candidates')).json.candidates[0];
    assert.equal(pc.canAdd, false); assert.match(pc.finding.says, /cannot drive Google Cast in its first version/);
    const r = await e.post('/iot/add', { candidate: cast.id, owned: true });
    assert.equal(r.json.code, 'unsupported'); assert.equal(e.questions.length, 0);
  } finally { await e.close(); }
});

test('iot: a typed address is read one at a time, ten an hour, never a run of three neighbours, with one answer for every failure', async () => {
  const dead = createServer((req, res) => { res.writeHead(404); res.end(); });
  await new Promise(r => dead.listen(0, '127.0.0.1', r));
  const roku = await fakeRoku();
  const e = await bridge();
  for (let i = 1; i < 40; i++) e.portMap[`127.0.0.${i}:8060`] = dead.address().port;
  e.portMap['127.0.0.47:8060'] = roku.port;
  try {
    const id = address => e.post('/iot/identify', { kind: 'roku', address });
    assert.match((await e.post('/iot/identify', { kind: 'roku', address: '127.0.0.47:8060' })).json.error, /no port/);
    assert.match((await e.post('/iot/identify', { kind: 'router', address: '127.0.0.47' })).json.error, /typed address works for/);
    assert.match((await e.post('/iot/identify', { kind: 'roku', address: 'roku.local' })).json.error, /IP address/);
    const ok = await id('127.0.0.47');
    assert.equal(ok.status, 200); assert.equal(ok.json.candidate.name, 'Bedroom Roku'); assert.equal(ok.json.candidate.known, 'not-yet-yours');
    const errors = [];
    for (const a of ['127.0.0.10', '127.0.0.11']) errors.push((await id(a)).json);
    const third = await id('127.0.0.12');
    assert.equal(third.json.code, 'refused'); assert.match(third.json.error, /not a run of neighbouring addresses/);
    for (const a of ['127.0.0.30', '127.0.0.29']) errors.push((await id(a)).json);
    const down = await id('127.0.0.28'); assert.equal(down.json.code, 'refused', 'nor running downwards');
    for (const a of ['127.0.0.20', '127.0.0.25', '127.0.0.5', '127.0.0.33', '127.0.0.2']) errors.push((await id(a)).json);
    assert.equal(errors.length, 9);
    assert.ok(errors.every(x => x.code === 'no-answer' && x.error === 'No answer from that device.'), 'one answer for every failure');
    const eleventh = await id('127.0.0.36');
    assert.equal(eleventh.json.code, 'rate-limited'); assert.match(eleventh.json.error, /10 typed addresses an hour/);
    e.clock.advance(3601e3);
    assert.equal((await id('127.0.0.36')).json.code, 'no-answer', 'the hour passes');
    assert.ok(roku.keys.length === 0, 'no command, only the one description read');
  } finally { await e.close(); dead.close(); roku.close(); }
});

test('iot: four TVs or a Public profile lock kinds that need no pairing until "This is my own home network"', async () => {
  const ez = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  const lgDesc = await fakeUpnp({ description: fixture('desc-lg.txt') });
  const e = await bridge();
  e.portMap['127.0.0.44:49152'] = ez.port; e.portMap['127.0.0.48:1781'] = lgDesc.port;
  try {
    const ezc = await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 });
    for (let i = 0; i < 4; i++) {
      const pkt = Buffer.from(fixture('ssdp-roku.txt').replace(/X00800ABCDEF/g, `X0080000000${i}`).replace('127.0.0.47', `127.0.0.${60 + i}`));
      await e.inject('ssdp', pkt, { address: `127.0.0.${60 + i}`, port: 1900 }); // descriptions unreachable: the announcement alone
    }
    const lgc = await e.inject('ssdp', ssdp('ssdp-lg.txt'), { address: '127.0.0.48', port: 1900 });
    const net_ = (await e.get('/iot/candidates')).json.network;
    assert.equal(net_.shared, true); assert.deepEqual(net_.reasons, ['5 TVs answered']);
    assert.equal(net_.words, 'This looks like a shared network. Devices here may belong to other people.');
    const r = await e.post('/iot/add', { candidate: ezc.id, owned: true });
    assert.equal(r.status, 403); assert.match(r.json.error, /This is my own home network/);
    assert.equal(e.questions.length, 0);
    await e.add(lgc); // a TV that asks on its own screen may still be added
    assert.equal((await e.post('/iot/network', { ownHome: 'maybe' })).status, 400);
    const own = await e.post('/iot/network', { ownHome: true });
    assert.equal(own.json.network.ownHome, true); assert.equal(e.questions.at(-1), 'Mark this network as your own home network?');
    await e.add(ezc);
    assert.equal(e.iot.state.devices.length, 2);
  } finally { await e.close(); ez.close(); lgDesc.close(); }
  const p = await bridge();
  try {
    p.ctl.profile = 'Public';
    const d = await p.post('/iot/discover', {});
    assert.deepEqual(d.json.network.reasons, ['Windows marks this network Public']);
  } finally { await p.close(); }
});

/* =====================================================================================================================
 * Device routes, in the design's order
 * ===================================================================================================================== */
test('iot: DLNA (the EZCast U02): play a typed address, pause, stop, seek, volume to the ceiling, mute; XML escaped twice', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  const e = await bridge();
  e.portMap['127.0.0.44:49152'] = dev.port;
  try {
    const d = await e.add(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }));
    dev.calls.length = 0;
    const url = 'http://127.0.0.10:8200/film.mp4?a=1&b=2';
    const r = await e.cmd(d.id, 'play-url', { url });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.id, 'c-play-url'); assert.equal(r.state.playback, 'playing'); assert.equal(r.state.volume, 20);
    const set = dev.calls.find(x => x.action === 'SetAVTransportURI');
    assert.equal(set.soapaction, '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"');
    assert.match(set.body, /<CurrentURI>http:\/\/127\.0\.0\.10:8200\/film\.mp4\?a=1&amp;b=2<\/CurrentURI>/);
    assert.match(set.body, /<CurrentURIMetaData>&lt;DIDL-Lite [^<]*&gt;http:\/\/127\.0\.0\.10:8200\/film\.mp4\?a=1&amp;amp;b=2&lt;\/res&gt;/, 'escaped again inside DIDL-Lite');
    assert.equal(dev.st.uri, 'http://127.0.0.10:8200/film.mp4?a=1&amp;b=2');
    assert.deepEqual(dev.calls.map(x => x.action), ['SetAVTransportURI', 'Play', 'GetTransportInfo', 'GetVolume']);
    assert.equal((await e.cmd(d.id, 'pause')).state.playback, 'paused');
    assert.equal((await e.cmd(d.id, 'play')).state.playback, 'playing');
    assert.equal((await e.cmd(d.id, 'stop')).state.playback, 'stopped');
    await e.cmd(d.id, 'seek', { seconds: 3725 });
    assert.match(dev.calls.find(x => x.action === 'Seek').body, /<Unit>REL_TIME<\/Unit><Target>01:02:05<\/Target>/);
    const v = await e.cmd(d.id, 'volume', { level: 95 });
    assert.equal(v.state.volume, 80); assert.equal(v.note, 'Volume stops at 80, this device’s ceiling.');
    assert.match(dev.calls.find(x => x.action === 'SetVolume').body, /<Channel>Master<\/Channel><DesiredVolume>80<\/DesiredVolume>/);
    await e.cmd(d.id, 'mute', { on: true }); assert.equal(dev.st.mute, true);
    const hostile = await e.cmd(d.id, 'play-url', { url: 'http://x/"><script>' });
    assert.equal(hostile.code, 'unsupported');
    for (const a of ['power', 'key', 'launch', 'ha', 'colour']) assert.equal((await e.cmd(d.id, a, a === 'power' ? { on: true } : undefined)).code, 'unsupported', a);
    assert.ok(dev.calls.every(x => /\/(AVTransport|RenderingControl)\/control$/.test(x.path)), 'only AVTransport and RenderingControl');
    // Raising the ceiling needs Y; lowering does not.
    assert.equal((await e.post('/iot/device', { device: d.id, volumeCeiling: 60 })).json.device.volumeCeiling, 60);
    const before = e.questions.length;
    await e.post('/iot/device', { device: d.id, volumeCeiling: 90 });
    assert.equal(e.questions.length, before + 1); assert.match(e.questions.at(-1), /Raise the volume ceiling of EZCast U02 to 90/);
    assert.equal((await e.cmd(d.id, 'volume', { level: 100 })).state.volume, 90);
  } finally { await e.close(); dev.close(); }
});

test('iot: a DLNA player without Pause: the page is offered Stop and told why', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt'), pause: false });
  const e = await bridge();
  e.portMap['127.0.0.44:49152'] = dev.port;
  try {
    const d = await e.add(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }));
    assert.deepEqual(d.actions, ['play-url', 'play', 'stop', 'seek', 'volume', 'mute']);
    assert.deepEqual(d.notes, ['This player has no Pause: use Stop, which goes back to the start.']);
    const p = await e.cmd(d.id, 'pause');
    assert.equal(p.code, 'unsupported'); assert.match(p.error, /This player has no Pause: use Stop, which goes back to the start\./);
    assert.ok(!dev.calls.some(x => x.action === 'Pause'));
    assert.equal((await e.cmd(d.id, 'stop')).ok, true);
  } finally { await e.close(); dev.close(); }
});

test('iot: Sonos by the same UPnP code', async () => {
  const dev = await fakeUpnp({ description: fixture('desc-sonos.txt'), volume: 12 });
  const e = await bridge();
  e.portMap['127.0.0.46:1400'] = dev.port;
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-sonos.txt'), { address: '127.0.0.46', port: 1900 });
    assert.equal(c.rule.id, 'sonos'); assert.equal(c.name, 'Kitchen - Sonos One');
    const d = await e.add(c);
    assert.equal(d.kind, 'speaker');
    const r = await e.cmd(d.id, 'volume', { level: 30 });
    assert.equal(r.state.volume, 30);
    assert.equal((await e.cmd(d.id, 'play-url', { url: 'https://radio.example/stream.mp3' })).state.playback, 'playing');
  } finally { await e.close(); dev.close(); }
});

test('iot: Roku: off until its policy is ticked, then fixed keys and channel numbers only', async () => {
  const dev = await fakeRoku();
  const e = await bridge();
  e.portMap['127.0.0.47:8060'] = dev.port;
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-roku.txt'), { address: '127.0.0.47', port: 1900 });
    assert.equal(c.rule.id, 'roku'); assert.equal(c.name, 'Bedroom Roku');
    assert.match(c.finding?.limits?.[0] || (await e.get('/iot/candidates')).json.candidates[0].finding.limits[0], /may not be sent from 3rd-party platforms \(for example, mobile applications\)/);
    const d = await e.add(c);
    assert.deepEqual(d.actions, ['power', 'key', 'launch', 'play', 'pause']);
    const off = await e.cmd(d.id, 'key', { name: 'Up' });
    assert.equal(off.code, 'refused'); assert.match(off.error, /Roku’s policy/); assert.equal(dev.keys.length, 0);
    const pol = await e.post('/iot/policy', { roku: true });
    assert.equal(pol.status, 200); assert.match(pol.json.policies.roku, /^2026-11-07T12:00:0\dZ$/, 'the tick is stored with its time'); assert.match(e.questions.at(-1), /Roku’s policy/);
    for (const name of ['Up', 'OK', 'Home', 'Back']) assert.equal((await e.cmd(d.id, 'key', { name })).ok, true, name);
    assert.equal((await e.cmd(d.id, 'launch', { app: '12' })).ok, true);
    assert.equal((await e.cmd(d.id, 'power', { on: false })).state.power, false);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    for (const bad of [['key', { name: '../install/12' }], ['launch', { app: '../install/12' }], ['launch', { app: '12/../../search' }], ['key', { name: 'Search' }], ['volume', { level: 5 }], ['play-url', { url: 'http://x/y' }]])
      assert.equal((await e.cmd(d.id, ...bad)).ok, false, JSON.stringify(bad));
    assert.deepEqual(dev.keys, ['/keypress/Up', '/keypress/Select', '/keypress/Home', '/keypress/Back', '/launch/12', '/keypress/PowerOff', '/keypress/PowerOn']);
    assert.ok(dev.keys.every(k => !/install|input|search/i.test(k)), 'never /install, /input or /search');
    dev.st.mobileControl = false;
    const no = await e.cmd(d.id, 'key', { name: 'Up' });
    assert.equal(no.code, 'refused'); assert.match(no.error, /Control by mobile apps/);
  } finally { await e.close(); dev.close(); }
});

test('iot: Hue: refuses until the link-button step, then switches and colours with the stored key over a checked certificate', async () => {
  const ca = makeCA('VM test Signify root'), other = makeCA('Someone else');
  // Every certificate is made before any fake listens, so a failure here leaves no server open to hold the run.
  const leaf = makeLeaf(ca, { cn: '001788fffe123456', ips: ['127.0.0.50'] }), otherLeaf = makeLeaf(other, { cn: '001788fffe123456', ips: ['127.0.0.50'] });
  const dev = await fakeHue({ leaf });
  const impostor = await fakeHue({ leaf: otherLeaf });
  impostor.press();
  const e = await bridge({ deps: { hueRootCA: ca.certPem } });
  e.portMap['127.0.0.50:443'] = dev.port;
  try {
    const [c] = await e.iot.inject('mdns', hexFixture('mdns-hue.txt'), { address: '127.0.0.50', port: 5353 });
    assert.equal(c.rule.id, 'hue'); assert.equal(c.name, 'Hue Bridge'); assert.deepEqual(c.identity, { type: 'hue-bridge-id', value: '001788fffe123456' });
    const b = await e.add(c, { room: 'Study' });
    assert.equal(b.protocol, 'hue-clip2'); assert.equal(b.paired, false); assert.deepEqual(b.notes, ['Pair it to see its lights: press the round button on the Hue bridge, then Continue.']);
    const early = await e.cmd(b.id, 'power', { on: true });
    assert.equal(early.code, 'not-paired'); assert.equal(early.error, 'Press the round button on the Hue bridge, then Continue.');
    const notPressed = await e.post('/iot/pair', { device: b.id });
    assert.equal(notPressed.status, 409); assert.equal(notPressed.json.code, 'not-paired'); assert.equal(notPressed.json.error, 'Press the round button on the Hue bridge, then Continue.');
    assert.match(e.questions.at(-1), /^Pair Hue Bridge, 127\.0\.0\.50, Hue bridge\?/);
    dev.press();
    const paired = await e.post('/iot/pair', { device: b.id });
    assert.equal(paired.status, 200, paired.text); assert.equal(paired.json.device.paired, true);
    assert.equal(paired.json.lights.length, 1); const light = paired.json.lights[0];
    assert.deepEqual([light.name, light.protocol, light.parent, light.room, light.ownership.statement], ['Desk lamp', 'hue-light', b.id, 'Study', 'through-paired-bridge']);
    assert.ok(!JSON.stringify(paired.json).includes(dev.st.key), 'the app key never reaches the page');
    assert.ok(!JSON.stringify((await e.get('/iot/devices')).json).includes(dev.st.key));
    assert.equal(JSON.parse(readFileSync(e.statePath, 'utf8')).devices[0].secret.appKey, dev.st.key, 'kept only in the state file');
    const on = await e.cmd(light.id, 'power', { on: true });
    assert.equal(on.ok, true, JSON.stringify(on)); assert.equal(on.state.power, true);
    const col = await e.cmd(light.id, 'colour', { hex: '#ff0000' });
    assert.equal(col.ok, true); assert.ok(Math.abs(dev.puts.at(-1).color.xy.x - 0.64) < 0.01);
    await e.cmd(light.id, 'brightness', { level: 30 }); assert.deepEqual(dev.puts.at(-1).dimming, { brightness: 30 });
    await e.cmd(light.id, 'colour-temp', { kelvin: 2700 }); assert.equal(dev.puts.at(-1).color_temperature.mirek, 370);
    assert.ok(dev.seen.filter(s => s.url.startsWith('/clip/')).every(s => s.key === dev.st.key));
    // Another certificate at the same address (not signed by the root): the key is not sent.
    e.portMap['127.0.0.50:443'] = impostor.port;
    const moved = await e.cmd(light.id, 'power', { on: false });
    assert.equal(moved.ok, false); assert.equal(moved.code, 'moved'); assert.match(moved.error, /not signed by its maker’s root/);
    assert.deepEqual(impostor.seen, [], 'the impostor got no request at all, so no key');
    assert.ok(!e.logs.join('\n').includes(dev.st.key));
  } finally { await e.close(); dev.close(); impostor.close(); }
});

test('iot: Hue without the maker’s root: the first certificate is remembered and a different one refused', async () => {
  const ca = makeCA();
  const hueLeaf = makeLeaf(ca, { cn: '001788fffe123456' }), otherLeaf = makeLeaf(makeCA('other'), { cn: '001788fffe123456' });
  const dev = await fakeHue({ leaf: hueLeaf });
  const impostor = await fakeHue({ leaf: otherLeaf });
  dev.press(); impostor.press();
  const e = await bridge();
  e.portMap['127.0.0.50:443'] = dev.port;
  try {
    const [c] = await e.iot.inject('mdns', hexFixture('mdns-hue.txt'), { address: '127.0.0.50', port: 5353 });
    const b = await e.add(c);
    const p = await e.post('/iot/pair', { device: b.id });
    assert.equal(p.status, 200, p.text);
    const sec = JSON.parse(readFileSync(e.statePath, 'utf8')).devices[0].secret;
    assert.match(sec.pin, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/); assert.equal(sec.pin, hueLeaf.fingerprint, 'the certificate it first saw');
    e.portMap['127.0.0.50:443'] = impostor.port;
    const r = await e.cmd(p.json.lights[0].id, 'power', { on: true });
    assert.equal(r.code, 'moved'); assert.match(r.error, /certificate has changed/);
    assert.deepEqual(impostor.seen, []);
  } finally { await e.close(); dev.close(); impostor.close(); }
});

test('iot: Shelly: switch and toggle; a password kept only as HA1 with digest; a different device at the address is "moved"', async () => {
  const dev = await fakeShelly();
  const e = await bridge();
  e.portMap['127.0.0.51:80'] = dev.port;
  try {
    const [c] = await e.iot.inject('mdns', hexFixture('mdns-shelly.txt'), { address: '127.0.0.51', port: 5353 });
    assert.equal(c.rule.id, 'shelly'); assert.equal(c.name, 'Kettle socket'); assert.deepEqual(c.identity, { type: 'mac', value: 'a8032ab12345' });
    const d = await e.add(c, { room: 'Kitchen' });
    assert.deepEqual(d.actions, ['power', 'toggle']); assert.match(d.notes?.join(' ') || '', /^$/);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    assert.equal((await e.cmd(d.id, 'toggle')).state.power, false);
    assert.deepEqual(dev.calls.map(x => x.method), ['Switch.Set', 'Switch.GetStatus', 'Switch.Toggle', 'Switch.GetStatus']);
    assert.equal((await e.cmd(d.id, 'brightness', { level: 50 })).code, 'unsupported');
    assert.equal((await e.post('/iot/pair', { device: d.id, password: 'x' })).status, 200, 'a Shelly without a password takes one if the user set it later');
  } finally { await e.close(); dev.close(); }
  const locked = await fakeShelly({ password: 'kettle-pass-1', dimmer: true, id: 'shellydimmer-0011', mac: '0011AABBCCDD' });
  const impostor = await fakeShelly({ mac: 'FFFFFFFFFFFF' });
  const f = await bridge();
  f.portMap['127.0.0.57:80'] = locked.port;
  try {
    const t = await f.post('/iot/identify', { kind: 'shelly', address: '127.0.0.57' });
    assert.equal(t.status, 200, t.text);
    const d = await f.add(t.json.candidate);
    assert.deepEqual(d.actions, ['power', 'toggle', 'brightness']); assert.equal(d.protected, true);
    const need = await f.cmd(d.id, 'power', { on: true });
    assert.equal(need.code, 'not-paired'); assert.match(need.error, /type it once/); assert.equal(locked.calls.length, 0);
    const wrong = await f.post('/iot/pair', { device: d.id, password: 'guess' });
    assert.equal(wrong.json.code, 'not-paired'); assert.match(wrong.json.error, /did not accept that password/);
    assert.equal(f.iot.state.devices[0].secret, null);
    const ok = await f.post('/iot/pair', { device: d.id, password: 'kettle-pass-1' });
    assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.device.paired, true);
    const saved = readFileSync(f.statePath, 'utf8');
    assert.ok(!saved.includes('kettle-pass-1'), 'the password itself is not kept');
    assert.equal(JSON.parse(saved).devices[0].secret.ha1, createHash('sha256').update('admin:shellydimmer-0011:kettle-pass-1').digest('hex'));
    const b = await f.cmd(d.id, 'brightness', { level: 35 });
    assert.equal(b.ok, true, JSON.stringify(b)); assert.equal(b.state.brightness, 35);
    assert.ok(locked.calls.filter(x => x.auth).every(x => x.auth.algorithm === 'SHA-256' && x.auth.username === 'admin' && !JSON.stringify(x.auth).includes('kettle-pass-1')));
    assert.ok(locked.calls.some(x => x.auth), 'an Authorization: Digest header was sent');
    assert.ok(locked.calls.filter(x => x.auth).every(x => x.auth.uri === '/rpc' && x.auth.nc === '00000001' && x.auth.qop === 'auth' && !x.bodyAuth), 'Shelly’s HTTP form: ha2 over POST:/rpc, nc 00000001, no auth object in the body');
    f.portMap['127.0.0.57:80'] = impostor.port;
    f.clock.advance(61e3);
    const moved = await f.cmd(d.id, 'power', { on: false });
    assert.equal(moved.code, 'moved'); assert.match(moved.error, /different device now answers/);
    assert.deepEqual(impostor.calls, [], 'no RPC, and so no digest, reached the other device');
    assert.equal(f.iot.state.devices[0].status, 'moved');
    assert.equal((await f.cmd(d.id, 'power', { on: false })).code, 'moved');
  } finally { await f.close(); locked.close(); impostor.close(); }
});

test('iot: Tasmota: Power, Dimmer, Color and CT through /cm, its MAC checked', async () => {
  const dev = await fakeTasmota();
  const e = await bridge();
  e.portMap['127.0.0.52:80'] = dev.port;
  try {
    const t = await e.post('/iot/identify', { kind: 'tasmota', address: '127.0.0.52' });
    assert.equal(t.json.candidate.name, 'tasmota-0B1122');
    const d = await e.add(t.json.candidate);
    assert.deepEqual(d.actions, ['power', 'toggle', 'brightness', 'colour', 'colour-temp']); assert.equal(d.identity.value, 'aa:bb:cc:00:11:22');
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    assert.equal((await e.cmd(d.id, 'brightness', { level: 40 })).state.brightness, 40);
    await e.cmd(d.id, 'colour', { hex: '#00ff80' }); await e.cmd(d.id, 'colour-temp', { kelvin: 4000 });
    assert.equal((await e.cmd(d.id, 'toggle')).state.power, false);
    assert.deepEqual(dev.cmnds.filter(x => x !== 'Status 5'), ['Power On', 'Dimmer 40', 'Color 00FF80', 'CT 250', 'Power Toggle']);
    assert.ok(dev.cmnds.every(x => /^(Power|Dimmer|Color|CT|Status 5|State)\b/.test(x)), 'only the fixed commands');
  } finally { await e.close(); dev.close(); }
});

test('iot: WiZ: found by its registration answer, then setPilot', async () => {
  const dev = await fakeWiz();
  const e = await bridge();
  e.portMap['127.0.0.53:38899'] = dev.port;
  try {
    const c = await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 });
    assert.equal(c.rule.id, 'wiz'); assert.match(c.finding?.pairing?.steps?.[0] || (await e.get('/iot/candidates')).json.candidates[0].finding.pairing.steps[0], /Allow Local Communication/);
    const d = await e.add(c);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    await e.cmd(d.id, 'brightness', { level: 5 });
    await e.cmd(d.id, 'colour', { hex: '#ff8000' });
    await e.cmd(d.id, 'colour-temp', { kelvin: 9000 });
    assert.deepEqual(dev.got.filter(x => x.method === 'setPilot').map(x => x.params), [{ state: true }, { state: true, dimming: 10 }, { state: true, r: 255, g: 128, b: 0 }, { state: true, temp: 6500 }]);
    assert.ok(dev.got.every(x => ['setPilot', 'getPilot'].includes(x.method)));
  } finally { await e.close(); dev.close(); }
});

test('iot: Yeelight: found by its M-SEARCH answer on 1982, then JSON lines on 55443', async () => {
  const dev = await fakeYeelight();
  const e = await bridge();
  e.portMap['127.0.0.54:55443'] = dev.port;
  try {
    const c = await e.inject('yeelight', ssdp('yeelight-reply.txt'), { address: '127.0.0.54', port: 1982 });
    assert.equal(c.rule.id, 'yeelight'); assert.equal(c.name, 'hall'); assert.deepEqual(c.identity, { type: 'yeelight-id', value: '0x000000000015243f' });
    const d = await e.add(c);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    assert.equal((await e.cmd(d.id, 'brightness', { level: 25 })).state.brightness, 25);
    await e.cmd(d.id, 'colour', { hex: '#ff0000' });
    assert.equal((await e.cmd(d.id, 'toggle')).state.power, false);
    assert.deepEqual(dev.got.filter(x => x.method !== 'get_prop').map(x => [x.method, x.params]), [['set_power', ['on', 'smooth', 300]], ['set_bright', [25, 'smooth', 300]], ['set_rgb', [0xff0000, 'smooth', 300]], ['toggle', []]]);
  } finally { await e.close(); dev.close(); }
});

test('iot: LIFX: found by StateService, then SetPower and SetColor', async () => {
  const dev = await fakeLifx();
  const e = await bridge();
  e.portMap['127.0.0.55:56700'] = dev.port;
  try {
    const pl = Buffer.alloc(5); pl[0] = 1; pl.writeUInt32LE(56700, 1);
    const c = await e.inject('lifx', B.lifxPacket(3, pl, { target: 'd073d5001122' }), { address: '127.0.0.55', port: 56700 });
    assert.equal(c.rule.id, 'lifx'); assert.deepEqual(c.identity, { type: 'mac', value: 'd073d5001122' });
    const d = await e.add(c);
    assert.equal((await e.cmd(d.id, 'power', { on: true })).state.power, true);
    assert.equal(dev.st.power, 65535);
    const col = await e.cmd(d.id, 'colour', { hex: '#0000ff' });
    assert.equal(col.ok, true); assert.equal(dev.st.h, Math.round(240 / 360 * 65535)); assert.equal(dev.st.s, 65535);
    assert.equal((await e.cmd(d.id, 'brightness', { level: 50 })).state.brightness, 50);
    assert.deepEqual([...new Set(dev.got.map(x => x.type))].sort((a, b) => a - b), [101, 102, 117], 'Get, SetColor and SetPower only');
  } finally { await e.close(); dev.close(); }
});

test('iot: LG webOS: pairing needs "accept" on the TV, asks only the permissions VM needs, and pins the TV’s certificate', async () => {
  const ca = makeCA(), leaf = makeLeaf(ca, { cn: 'lgsmarttv.lan' }), otherLeaf = makeLeaf(makeCA('other'), { cn: 'lgsmarttv.lan' });
  const desc = await fakeUpnp({ description: fixture('desc-lg.txt') });
  const slow = await fakeLg({ leaf });
  const e = await bridge({ deps: { pairWaitMs: 400 } });
  e.portMap['127.0.0.48:1781'] = desc.port; e.portMap['127.0.0.48:3001'] = slow.port;
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-lg.txt'), { address: '127.0.0.48', port: 1900 });
    assert.equal(c.rule.id, 'lg-webos');
    const d = await e.add(c);
    assert.equal((await e.cmd(d.id, 'volume', { level: 10 })).code, 'not-paired');
    const timeout = await e.post('/iot/pair', { device: d.id });
    assert.equal(timeout.json.code, 'not-paired'); assert.match(timeout.json.error, /accept on the TV screen/);
    assert.equal(slow.st.prompts, 1);
  } finally { await e.close(); slow.close(); }
  const tv = await fakeLg({ leaf, acceptAfterMs: 60 });
  const impostor = await fakeLg({ leaf: otherLeaf, acceptAfterMs: 0 });
  const f = await bridge();
  f.portMap['127.0.0.48:1781'] = desc.port; f.portMap['127.0.0.48:3001'] = tv.port;
  try {
    const d = await f.add(await f.inject('ssdp', ssdp('ssdp-lg.txt'), { address: '127.0.0.48', port: 1900 }));
    const p = await f.post('/iot/pair', { device: d.id });
    assert.equal(p.status, 200, p.text); assert.equal(p.json.device.paired, true);
    assert.match(f.questions.at(-1), /^Pair \[LG\] webOS TV UK6300, 127\.0\.0\.48, LG webOS\? \(Accept on the TV screen next\.\)$/);
    const reg = tv.st.registerPayloads[0];
    assert.equal(reg.pairingType, 'PROMPT');
    assert.deepEqual(reg.manifest.permissions, ['LAUNCH', 'CONTROL_AUDIO', 'CONTROL_POWER', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_JOYSTICK', 'READ_INSTALLED_APPS'], 'only what VM needs');
    const sec = JSON.parse(readFileSync(f.statePath, 'utf8')).devices[0].secret;
    assert.equal(sec.clientKey, tv.st.clientKey); assert.equal(sec.pin, leaf.fingerprint);
    assert.equal((await f.cmd(d.id, 'volume', { level: 15 })).state.volume, 15);
    await f.cmd(d.id, 'mute', { on: true }); await f.cmd(d.id, 'play'); await f.cmd(d.id, 'pause'); await f.cmd(d.id, 'stop');
    await f.cmd(d.id, 'launch', { app: 'netflix' });
    assert.equal((await f.cmd(d.id, 'key', { name: 'Up' })).ok, true);
    assert.equal((await f.cmd(d.id, 'key', { name: 'OK' })).ok, true);
    assert.deepEqual(tv.st.buttons, ['UP', 'ENTER'], 'd-pad keys through the pointer socket');
    const on = await f.cmd(d.id, 'power', { on: true });
    assert.equal(on.code, 'unsupported'); assert.match(on.error, /cannot switch an LG TV on/);
    assert.equal((await f.cmd(d.id, 'power', { on: false })).ok, true);
    assert.deepEqual(tv.st.requests.map(r => r.uri).filter(u => !/getVolume|getPointerInputSocket/.test(u)),
      ['ssap://audio/setVolume', 'ssap://audio/setMute', 'ssap://media.controls/play', 'ssap://media.controls/pause', 'ssap://media.controls/stop', 'ssap://system.launcher/launch', 'ssap://system/turnOff']);
    assert.equal(tv.st.prompts, 1, 'the stored client key is used after pairing, with no new prompt');
    f.portMap['127.0.0.48:3001'] = impostor.port;
    const moved = await f.cmd(d.id, 'volume', { level: 5 });
    assert.equal(moved.code, 'moved');
    assert.deepEqual(impostor.st.registerPayloads, [], 'the client key never reached the other certificate');
  } finally { await f.close(); tv.close(); impostor.close(); desc.close(); }
});

test('iot: Samsung Tizen: Allow on the TV issues a token, kept in the state file; remote keys only', async () => {
  const ca = makeCA(), leaf = makeLeaf(ca);
  const desc = await fakeUpnp({ description: fixture('desc-samsung.txt') });
  const tv = await fakeSamsung({ leaf, allowAfterMs: 50 });
  const e = await bridge();
  Object.assign(e.portMap, { '127.0.0.49:9197': desc.port, '127.0.0.49:8001': tv.httpPort, '127.0.0.49:8002': tv.wsPort });
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-samsung.txt'), { address: '127.0.0.49', port: 1900 });
    assert.equal(c.rule.id, 'samsung-tizen'); assert.equal(c.name, '[TV] Samsung Living room');
    const d = await e.add(c);
    assert.equal((await e.cmd(d.id, 'key', { name: 'Up' })).code, 'not-paired');
    const p = await e.post('/iot/pair', { device: d.id });
    assert.equal(p.status, 200, p.text); assert.equal(p.json.device.paired, true);
    assert.equal(tv.st.connects[0].name, 'Vitruvian Manager'); assert.equal(tv.st.connects[0].token, null);
    const sec = JSON.parse(readFileSync(e.statePath, 'utf8')).devices[0].secret;
    assert.equal(sec.token, '57512345'); assert.equal(sec.pin, leaf.fingerprint);
    assert.ok(!JSON.stringify((await e.get('/iot/devices')).json).includes('57512345'));
    for (const name of ['Up', 'OK', 'Back', 'Home', 'Mute', 'VolumeDown']) assert.equal((await e.cmd(d.id, 'key', { name })).ok, true, name);
    const up = await e.cmd(d.id, 'key', { name: 'VolumeUp' });
    assert.equal(up.code, 'refused', 'VM cannot read a Samsung’s volume, so Vol + would pass the ceiling');
    assert.equal(up.error, 'VM cannot read this TV’s volume, so it does not press Volume up: the ceiling of 80 could not be kept. Use the TV’s own remote to make it louder.');
    assert.equal((await e.post('/iot/device', { device: d.id, volumeCeiling: 100 })).json.device.volumeCeiling, 100, 'a ceiling of 100, after Y');
    assert.equal((await e.cmd(d.id, 'key', { name: 'VolumeUp' })).ok, true);
    await e.cmd(d.id, 'play'); await e.cmd(d.id, 'power', { on: false });
    await until(() => tv.st.keys.length === 9, 'nine keys');
    assert.deepEqual(tv.st.keys, ['KEY_UP', 'KEY_ENTER', 'KEY_RETURN', 'KEY_HOME', 'KEY_MUTE', 'KEY_VOLDOWN', 'KEY_VOLUP', 'KEY_PLAY', 'KEY_POWER']);
    assert.ok(tv.st.connects.slice(1).every(x => x.token === '57512345'), 'later sessions carry the token');
    assert.ok(!e.logs.join('\n').includes('57512345'));
  } finally { await e.close(); tv.close(); }
  const denied = await fakeSamsung({ leaf, deny: true });
  const f = await bridge();
  Object.assign(f.portMap, { '127.0.0.49:9197': desc.port, '127.0.0.49:8001': denied.httpPort, '127.0.0.49:8002': denied.wsPort });
  try {
    const d = await f.add(await f.inject('ssdp', ssdp('ssdp-samsung.txt'), { address: '127.0.0.49', port: 1900 }));
    const p = await f.post('/iot/pair', { device: d.id });
    assert.equal(p.json.code, 'refused'); assert.match(p.json.error, /Allow it on the TV screen/);
  } finally { await f.close(); denied.close(); desc.close(); }
});

/* =====================================================================================================================
 * Home Assistant
 * ===================================================================================================================== */
test('iot: Home Assistant: a ticked entity toggles; an unticked entity, an unlisted service and remote.learn_command are refused', async () => {
  const ha = await fakeHa();
  const statePath = newStatePath();
  const e = await bridge({ iot: { homeAssistant: { url: 'http://127.0.0.60:8123' } }, statePath });
  e.portMap['127.0.0.60:8123'] = ha.port;
  try {
    assert.equal((await e.get('/iot/ha/entities')).json.code, 'not-paired');
    assert.match((await e.post('/iot/ha/token', { token: 'short' })).json.error, /long-lived token/);
    const t = await e.post('/iot/ha/token', { token: ha.token });
    assert.equal(t.status, 200, t.text); assert.deepEqual(t.json, { ok: true, url: 'http://127.0.0.60:8123/', tokenSet: true });
    assert.equal(e.questions.at(-1), 'Keep a Home Assistant token for http://127.0.0.60:8123/?');
    const list = (await e.get('/iot/ha/entities')).json.entities;
    assert.deepEqual(list.map(x => [x.entity, x.ticked]), [['light.kitchen', false], ['switch.heater', false], ['remote.broadlink', false]], 'sensors are not offered; nothing ticked by default');
    assert.equal((await e.get('/iot/devices')).json.devices.length, 0, 'no entity reaches the page until ticked');
    assert.equal((await e.post('/iot/ha/tick', { entity: 'sensor.temp', on: true })).json.code, 'unsupported');
    const tk = await e.post('/iot/ha/tick', { entity: 'light.kitchen', on: true });
    assert.equal(tk.status, 200, tk.text); const light = tk.json.device;
    assert.deepEqual([light.id, light.protocol, light.actions], ['ha-light-kitchen', 'home-assistant', ['power', 'toggle', 'ha']]);
    assert.equal((await e.cmd(light.id, 'toggle')).state.power, true);
    assert.equal((await e.cmd(light.id, 'ha', { domain: 'light', service: 'turn_off', entity: 'light.kitchen' })).state.power, false);
    const un = await e.cmd('ha-switch-heater', 'power', { on: true });
    assert.equal(un.code, 'unknown-device', 'an unticked entity is not a device');
    const other = await e.cmd(light.id, 'ha', { domain: 'switch', service: 'turn_on', entity: 'switch.heater' });
    assert.equal(other.code, 'refused'); assert.match(other.error, /not ticked/);
    const unlisted = await e.cmd(light.id, 'ha', { domain: 'light', service: 'reload', entity: 'light.kitchen' });
    assert.equal(unlisted.code, 'refused'); assert.match(unlisted.error, /VM calls only turn_on, turn_off, toggle on light/);
    const sw = await e.post('/iot/ha/tick', { entity: 'switch.heater', on: true });
    assert.match(e.questions.at(-1), /A switch may run a heater, a pump or a door\./); assert.deepEqual(sw.json.device.notes, ['A switch may run a heater, a pump or a door.']);
    const rm = (await e.post('/iot/ha/tick', { entity: 'remote.broadlink', on: true, commands: ['tv_power', '<bad>', 'tv_volume_up'] })).json.device;
    assert.deepEqual(rm.commands, ['tv_power', 'tv_volume_up']);
    assert.equal((await e.cmd(rm.id, 'ha', { domain: 'remote', service: 'send_command', entity: 'remote.broadlink', command: 'tv_power' })).ok, true);
    const learn = await e.cmd(rm.id, 'ha', { domain: 'remote', service: 'learn_command', entity: 'remote.broadlink', command: 'tv_power' });
    assert.equal(learn.code, 'refused'); assert.match(learn.error, /send_command/);
    assert.equal((await e.cmd(rm.id, 'ha', { domain: 'remote', service: 'send_command', entity: 'remote.broadlink', command: 'unlock_door' })).code, 'refused');
    assert.deepEqual(ha.calls.map(c => `${c.domain}.${c.service}`), ['light.toggle', 'light.turn_off', 'remote.send_command']);
    assert.deepEqual(ha.calls[2].data, { entity_id: 'remote.broadlink', command: 'tv_power' });
    const st = (await e.get('/iot/status')).json;
    assert.deepEqual(st.homeAssistant, { configured: true, url: 'http://127.0.0.60:8123/', tokenSet: true, ticked: 3 });
    for (const r of [st, (await e.get('/iot/devices')).json, (await e.get('/iot/ha/entities')).json]) assert.ok(!JSON.stringify(r).includes(ha.token), 'the token never reaches the page');
    assert.ok(!e.logs.join('\n').includes(ha.token));
    assert.ok(readFileSync(statePath, 'utf8').includes(ha.token), 'it is kept in the state file');
    await e.post('/iot/ha/tick', { entity: 'switch.heater', on: false });
    assert.equal((await e.cmd('ha-switch-heater', 'power', { on: true })).code, 'unknown-device', 'unticked again');
  } finally { await e.close(); }
  // A new Home Assistant address in the config file deletes the token and the ticks.
  const f = await bridge({ iot: { homeAssistant: { url: 'http://127.0.0.61:8123' } }, statePath });
  try {
    assert.deepEqual(f.iot.state.ha, { url: '', token: '', entities: [] });
    assert.equal(f.iot.state.devices.length, 0);
    assert.ok(!readFileSync(statePath, 'utf8').includes(ha.token));
  } finally { await f.close(); ha.close(); }
  const g = await bridge();
  try { assert.match((await g.post('/iot/ha/token', { token: 'a'.repeat(40) })).json.error, /config file/, 'the page cannot choose the Home Assistant address'); } finally { await g.close(); }
});

/* =====================================================================================================================
 * The UNS link
 * ===================================================================================================================== */
async function waitConnected(e) { await until(() => e.iot.uns.status().connected, 'the broker connection'); }

test('iot: common device control with MQTT and a UNS: a bulb, a player and a TV, each change in the retained JSON tree', async () => {
  const broker = await fakeBroker();
  const bulb = await fakeWiz(), player = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') }), tv = await fakeRoku();
  const e = await bridge({ iot: { broker: { url: `mqtt://127.0.0.1:${broker.port}`, username: 'vm' } }, env: { VM_MQTT_PASSWORD: 'broker-pass-77' } });
  Object.assign(e.portMap, { '127.0.0.53:38899': bulb.port, '127.0.0.44:49152': player.port, '127.0.0.47:8060': tv.port });
  try {
    await e.iot.start(); await waitConnected(e);
    const cn = broker.st.connects[0];
    assert.equal(cn.raw.toString('hex'), B.mqtt.connect({ clientId: 'vm-home-hermes', keepalive: 30, clean: true, username: 'vm', password: 'broker-pass-77', will: { topic: 'vm/home/hermes/status', payload: 'offline', qos: 1, retain: true } }).toString('hex'), 'the CONNECT the broker received, byte for byte');
    assert.deepEqual([cn.protocol, cn.level, cn.clientId, cn.username, cn.password, cn.will.topic, cn.will.payload.toString(), cn.will.qos, cn.will.retain], ['MQTT', 4, 'vm-home-hermes', 'vm', 'broker-pass-77', 'vm/home/hermes/status', 'offline', 1, true]);
    assert.equal(broker.st.retained.get('vm/home/hermes/status')?.toString(), 'online');
    assert.deepEqual(broker.st.subs, [], 'acceptCommands is off: no subscriptions');
    const b = await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }), { room: 'Bedroom', name: 'Bedside lamp' });
    const p = await e.add(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }), { room: 'Living room' });
    const t = await e.add(await e.inject('ssdp', ssdp('ssdp-roku.txt'), { address: '127.0.0.47', port: 1900 }), { room: 'Bedroom' });
    await e.post('/iot/policy', { roku: true });
    assert.equal((await e.cmd(b.id, 'power', { on: true })).ok, true);
    assert.equal((await e.cmd(p.id, 'play-url', { url: 'http://127.0.0.10:8200/film.mp4' })).ok, true);
    assert.equal((await e.cmd(t.id, 'power', { on: false })).ok, true);
    const tree = topic => { const v = broker.st.retained.get(topic); return v ? JSON.parse(v.toString()) : null; };
    await until(() => tree('vm/home/bedroom/bedroom-roku/state')?.power === false, 'the TV’s state');
    assert.deepEqual(pick(tree('vm/home/bedroom/bedside-lamp/state')), { online: true, power: true, kind: 'light', name: 'Bedside lamp' });
    assert.deepEqual(pick(tree('vm/home/living-room/ezcast-u02/state')), { online: true, power: null, kind: 'media-renderer', name: 'EZCast U02', playback: 'playing', volume: 20 });
    assert.deepEqual(pick(tree('vm/home/bedroom/bedroom-roku/state')), { online: true, power: false, kind: 'tv', name: 'Bedroom Roku' });
    const states = broker.st.published.filter(m => m.topic.endsWith('/state'));
    assert.ok(states.every(m => m.retain && m.qos === 0), 'state messages are retained');
    assert.ok(broker.st.published.every(m => /^vm\/home\/[a-z0-9-]+(\/[a-z0-9-]+)?\/(state|status)$/.test(m.topic)), 'every topic slugged under vm/home');
    assert.ok(!broker.st.published.some(m => m.payload.toString().includes('broker-pass-77')));
    const u = (await e.get('/iot/uns')).json;
    assert.deepEqual([u.connected, u.json, u.sparkplug, u.root, u.url], [true, true, false, 'vm/home', `mqtt://127.0.0.1:${broker.port}`]);
    assert.match(u.limits[0], /in clear; wss:\/\/ fixes that/);
    assert.ok(!JSON.stringify(u).includes('broker-pass-77'));
    // Removing a device clears its retained state; the will fires when the connection is lost.
    await e.post('/iot/remove', { device: t.id });
    assert.equal(broker.st.retained.has('vm/home/bedroom/bedroom-roku/state'), false);
    broker.dropAll();
    await until(() => broker.st.wills.length === 1, 'the will');
    assert.equal(broker.st.retained.get('vm/home/hermes/status').toString(), 'offline', 'hermes/status turns offline when the will fires');
  } finally { e.iot.stop(); await e.close(); broker.close(); bulb.close(); player.close(); tv.close(); }
  function pick(j) { if (!j) return j; const { at, brightness, ...rest } = j; assert.match(at, /^2026-11-07T/); for (const k of ['volume', 'playback']) if (rest[k] == null) delete rest[k]; return rest; }
});

test('iot: the JSON tree over WebSocket, and broker commands only when acceptCommands is on, simple ones only', async () => {
  const broker = await fakeBroker(), bulb = await fakeWiz(), player = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  const e = await bridge({ iot: { broker: { url: `ws://127.0.0.1:${broker.wsPort}/mqtt`, acceptCommands: true, site: 'flat' } } });
  Object.assign(e.portMap, { '127.0.0.53:38899': bulb.port, '127.0.0.44:49152': player.port });
  try {
    await e.iot.start(); await waitConnected(e);
    assert.deepEqual(broker.st.subs, ['vm/flat/+/+/set']);
    assert.equal(broker.st.connects[0].username, undefined, 'no user name configured, none sent');
    const b = await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }), { room: 'Hall' });
    const p = await e.add(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }), { room: 'Hall' });
    e.clock.advance(5000);
    broker.publish(`vm/flat/hall/${b.uns.name}/set`, JSON.stringify({ action: 'power', args: { on: true } }));
    await until(() => bulb.st.state === true, 'the broker’s command');
    broker.publish(`vm/flat/hall/${p.uns.name}/set`, JSON.stringify({ action: 'play-url', args: { url: 'http://127.0.0.10/x.mp4' } }));
    broker.publish(`vm/flat/hall/${b.uns.name}/set`, JSON.stringify({ action: 'ha', args: {} }));
    broker.publish(`vm/flat/hall/${b.uns.name}/set`, 'not json');
    await until(() => e.logs.filter(l => /Broker command refused: The broker may send simple commands only\./.test(l)).length === 2, 'two refusals');
    assert.ok(!player.calls.some(x => x.action === 'SetAVTransportURI'), 'never play-url from the broker');
  } finally { e.iot.stop(); await e.close(); broker.close(); bulb.close(); player.close(); }
});

test('iot: Sparkplug B: NDEATH as will, NBIRTH with bdSeq and Rebirth=false, DBIRTH per device, DDATA with a rising seq, NDEATH when the socket drops', async () => {
  const broker = await fakeBroker(), bulb = await fakeWiz(), lamp = await fakeTasmota();
  const statePath = newStatePath();
  const e = await bridge({ iot: { broker: { url: `mqtt://127.0.0.1:${broker.port}`, sparkplug: true, json: false } }, statePath });
  Object.assign(e.portMap, { '127.0.0.53:38899': bulb.port, '127.0.0.52:80': lamp.port });
  try {
    const b = await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }), { room: 'Hall', name: 'Hall light' });
    await e.iot.start(); await waitConnected(e);
    const cn = broker.st.connects[0];
    assert.equal(cn.will.topic, 'spBv1.0/VM/NDEATH/hermes'); assert.equal(cn.will.qos, 1); assert.equal(cn.will.retain, false);
    const willBd = B.spDecode(cn.will.payload).metrics.find(m => m.name === 'bdSeq');
    assert.deepEqual([willBd.datatype, willBd.value], [B.SP_TYPES.Int64, 0]);
    assert.deepEqual(broker.st.subs, ['spBv1.0/VM/NCMD/hermes'], 'only its NCMD topic (acceptCommands off)');
    const sp = type => broker.st.published.filter(m => m.topic.startsWith(`spBv1.0/VM/${type}/hermes`)).map(m => ({ topic: m.topic, qos: m.qos, retain: m.retain, ...B.spDecode(m.payload) }));
    await until(() => sp('DBIRTH').length === 1, 'the DBIRTH');
    const [nb] = sp('NBIRTH');
    assert.equal(nb.seq, 0); assert.equal(nb.retain, false);
    assert.deepEqual(nb.metrics.slice(0, 2).map(m => [m.name, m.datatype, m.value]), [['bdSeq', B.SP_TYPES.Int64, 0], ['Node Control/Rebirth', B.SP_TYPES.Boolean, false]]);
    const [db] = sp('DBIRTH');
    assert.equal(db.topic, 'spBv1.0/VM/DBIRTH/hermes/hall-hall-light'); assert.equal(db.seq, 1);
    assert.deepEqual(db.metrics.map(m => m.name), ['Online', 'Power', 'Brightness', 'Volume', 'Playback', 'Kind']);
    assert.equal(db.metrics.find(m => m.name === 'Kind').value, 'light');
    // A device added later gets its DBIRTH then; commands report DDATA with a rising seq.
    const t = await e.add((await e.post('/iot/identify', { kind: 'tasmota', address: '127.0.0.52' })).json.candidate, { room: 'Hall', name: 'Hall light' });
    await until(() => sp('DBIRTH').length === 2, 'the second DBIRTH');
    assert.equal(sp('DBIRTH')[1].topic, 'spBv1.0/VM/DBIRTH/hermes/hall-hall-light-2', 'two devices never share a Sparkplug id');
    await e.cmd(b.id, 'power', { on: true });
    await e.cmd(b.id, 'brightness', { level: 60 });
    await e.cmd(t.id, 'power', { on: true });
    await until(() => sp('DDATA').length === 3, 'three DDATA');
    const dd = sp('DDATA');
    assert.deepEqual(dd[0].metrics.map(m => [m.name, m.value]), [['Power', true], ['Brightness', 50]], 'only the metrics that changed');
    assert.deepEqual(dd[1].metrics.map(m => [m.name, m.value]), [['Brightness', 60]]);
    const seqs = broker.st.published.filter(m => /^spBv1\.0\/VM\/(NBIRTH|DBIRTH|DDATA|NDATA|DDEATH)\//.test(m.topic)).map(m => B.spDecode(m.payload).seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i), `seq rises 0, 1, 2, … (${seqs.join(',')})`);
    // NCMD Rebirth is honoured at most every 10 seconds.
    const rebirth = B.spEncode({ timestamp: e.clock.now(), metrics: [{ name: 'Node Control/Rebirth', datatype: B.SP_TYPES.Boolean, value: true }] });
    const births = () => sp('NBIRTH').length;
    broker.publish('spBv1.0/VM/NCMD/hermes', rebirth);
    await until(() => e.logs.some(l => /second Rebirth within 10 seconds was ignored/.test(l)), 'the ignored Rebirth');
    assert.equal(births(), 1);
    e.clock.advance(11e3);
    broker.publish('spBv1.0/VM/NCMD/hermes', rebirth);
    await until(() => births() === 2, 'the rebirth');
    assert.equal(sp('NBIRTH')[1].seq, 0, 'a rebirth starts seq again at 0');
    assert.equal(sp('NBIRTH')[1].metrics[0].value, 0, 'with the same bdSeq');
    broker.publish('spBv1.0/VM/NCMD/hermes', rebirth);
    await sleep(150);
    assert.equal(births(), 2, 'a second Rebirth within 10 seconds is ignored');
    // Removing a device: DDEATH. Losing the socket: the broker publishes the NDEATH will with the same bdSeq.
    await e.post('/iot/remove', { device: t.id });
    await until(() => sp('DDEATH').length === 1, 'the DDEATH');
    assert.equal(sp('DDEATH')[0].topic, 'spBv1.0/VM/DDEATH/hermes/hall-hall-light-2');
    e.iot.uns.kill();
    await until(() => broker.st.wills.length === 1, 'the NDEATH will');
    const death = B.spDecode(broker.st.wills[0].payload);
    assert.equal(broker.st.wills[0].topic, 'spBv1.0/VM/NDEATH/hermes'); assert.equal(death.metrics[0].name, 'bdSeq'); assert.equal(death.metrics[0].value, 0);
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).broker.bdSeq, 0, 'bdSeq is kept across restarts in the state file');
  } finally { e.iot.stop(); await e.close(); broker.close(); bulb.close(); lamp.close(); }
});

/* =====================================================================================================================
 * Limits that protect people: rate limits, the volume ceiling
 * ===================================================================================================================== */
test('iot: rapid power and colour changes collapse into the latest, at most 2 a second', async () => {
  const bulb = await fakeWiz();
  const e = await bridge({ realClock: true });
  e.portMap['127.0.0.53:38899'] = bulb.port;
  try {
    const d = await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }));
    const send = hex => e.post('/iot/command', { v: 1, id: hex, device: d.id, action: 'colour', args: { hex } });
    const t0 = Date.now();
    const rs = await Promise.all(['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'].map((hex, i) => sleep(i * 40).then(() => send(hex))));
    const took = Date.now() - t0;
    const ok = rs.filter(r => r.json.ok).map(r => r.json.id), limited = rs.filter(r => r.json.code === 'rate-limited');
    assert.deepEqual(ok, ['#ff0000', '#00ff00', '#ff00ff'], 'the first two, then the latest');
    assert.equal(limited.length, 3); assert.equal(limited[0].status, 429); assert.match(limited[0].json.error, /newer change/);
    assert.ok(took >= 700, `the third change waited for the second to pass (${took} ms)`);
    assert.equal(bulb.got.filter(x => x.method === 'setPilot').length, 3);
  } finally { await e.close(); bulb.close(); }
});

/* =====================================================================================================================
 * Hermes's optional AI question
 * ===================================================================================================================== */
test('iot: the AI question sends nothing without both switches and a confirmation, and never a name, room or address', async () => {
  const ca = makeCA(), ai = await fakeAi({ leaf: makeLeaf(ca, { cn: 'ai.test', dnsNames: ['ai.test'], ips: [] }) });
  const sonos = await fakeUpnp({ description: fixture('desc-sonos.txt') });
  const KEY = 'test-ai-key-not-a-real-key-0000';
  for (const [iot, env] of [[{}, { VM_AI_KEY: KEY, VM_AI_URL: 'https://ai.test/v1/chat' }], [{ ai: { enabled: true } }, { VM_AI_URL: 'https://ai.test/v1/chat' }], [{ ai: { enabled: true } }, { VM_AI_KEY: KEY, VM_AI_URL: 'http://ai.test/v1/chat' }]]) {
    const e = await bridge({ iot, env });
    e.portMap['127.0.0.46:1400'] = sonos.port;
    try {
      const c = await e.inject('ssdp', ssdp('ssdp-sonos.txt'), { address: '127.0.0.46', port: 1900 });
      const r = await e.post('/iot/hermes/ask', { candidate: c.id });
      assert.equal(r.json.code, 'refused'); assert.match(r.json.error, /ai\.enabled in the config file and VM_AI_KEY and an https VM_AI_URL/);
    } finally { await e.close(); }
  }
  assert.equal(ai.got.length, 0);
  const e = await bridge({ iot: { ai: { enabled: true } }, env: { VM_AI_KEY: KEY, VM_AI_URL: 'https://ai.test/v1/chat' }, deps: { aiCa: ca.certPem } });
  e.portMap['127.0.0.46:1400'] = sonos.port; e.resolver['ai.test'] = '127.0.0.70'; e.portMap['127.0.0.70:443'] = ai.port;
  try {
    const c = await e.inject('ssdp', ssdp('ssdp-sonos.txt'), { address: '127.0.0.46', port: 1900 });
    await e.add(c, { room: 'Alex’s kitchen' });
    const pre = await e.post('/iot/hermes/ask', { candidate: c.id });
    assert.equal(pre.status, 200); assert.equal(pre.json.preview.host, 'ai.test'); assert.match(pre.json.confirm, /^[0-9a-f]{24}$/);
    const text = pre.json.preview.text;
    assert.match(text, /"manufacturer":"Sonos, Inc\."/); assert.match(text, /"modelName":"Sonos One"/); assert.match(text, /ZonePlayer:1/); assert.match(text, /Sonos\/80\.1-55014/);
    for (const leak of ['Kitchen', 'kitchen', 'Alex', '127.0.0', 'RINCON', 'uuid:', 'ZPS1']) assert.ok(!text.includes(leak), `"${leak}" is not sent`);
    assert.equal(ai.got.length, 0, 'nothing sent before the confirmation');
    assert.equal((await e.post('/iot/hermes/ask', { candidate: c.id, confirm: 'f'.repeat(24) })).json.code, 'refused');
    const sent = await e.post('/iot/hermes/ask', { candidate: c.id, confirm: pre.json.confirm });
    assert.equal(sent.status, 200, sent.text);
    assert.equal(ai.got.length, 1); assert.equal(ai.got[0].body.messages[0].content, text, 'exactly the text the page showed'); assert.equal(ai.got[0].auth, `Bearer ${KEY}`);
    const f = sent.json.finding;
    assert.equal(f.source, 'ai'); assert.ok(!('routes' in f), 'an AI finding has no routes'); assert.match(f.says, /^AI suggestion, not checked: /);
    assert.equal((await e.post('/iot/hermes/ask', { candidate: c.id, confirm: pre.json.confirm })).json.code, 'refused', 'a confirmation is used once');
    assert.ok(!JSON.stringify((await e.get('/iot/status')).json).includes(KEY)); assert.ok(!e.logs.join('\n').includes(KEY));
  } finally { await e.close(); ai.close(); sonos.close(); }
});

/* =====================================================================================================================
 * The phone remote (server side): its own LAN handler, pairing, signatures, expiry
 * ===================================================================================================================== */
test('iot: the phone remote is refused until the user starts the LAN route', async () => {
  const e = await bridge();
  try {
    const r = await e.post('/iot/phone/pair', {});
    assert.equal(r.json.code, 'refused'); assert.match(r.json.error, /Start the bridge with --lan/);
    assert.equal((await e.get('/iot/status')).json.lan.listening, false);
  } finally { await e.close(); }
});

test('iot: a phone paired with a code and Y drives a device; bad, expired and sixth codes, replays, stale signatures, revoked and fourth phones are refused', async () => {
  const bulb = await fakeWiz();
  const shown = [];
  const e = await bridge({ lan: true, deps: { showCode: c => shown.push(c) } });
  e.portMap['127.0.0.53:38899'] = bulb.port;
  try {
    const addr = await e.iot.startLan();
    assert.equal(addr.address, '127.0.0.1');
    const lan = `http://127.0.0.1:${addr.port}`;
    const rq = async (method, p, { body, headers = {}, origin = lan } = {}) => {
      const r = await fetch(`${lan}${p}`, { method, headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
      return { status: r.status, headers: r.headers, json, text };
    };
    // Its own handler: only /remote/*, with its own security headers.
    const page = await rq('GET', '/remote');
    assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal(page.headers.get('content-security-policy'), "default-src 'self'; frame-ancestors 'none'"); assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.ok(!/<script>[^<]/.test(page.text) && !/ style=/.test(page.text), 'no inline script or style');
    assert.match(page.text, /use it only at home/);
    assert.equal((await rq('GET', '/remote/app.js')).status, 200);
    for (const p of ['/', '/health', '/iot/status', '/iot/devices', '/local/adsb', '/public/opensky/states', '/remotex']) assert.equal((await rq('GET', p)).status, 404, p);
    assert.equal((await rq('POST', '/iot/command', { body: {} })).status, 404);
    assert.equal((await rq('GET', '/remote/api/nothing')).status, 403, 'the remote’s own API answers nothing unsigned');
    const wrongHost = await new Promise((resolve, reject) => {
      const q = net.connect(addr.port, '127.0.0.1', () => q.write('GET /remote HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\n\r\n'));
      let t = ''; q.on('data', c => { t += c; }); q.on('end', () => resolve(t)); q.on('error', reject);
    });
    assert.match(wrongHost, /^HTTP\/1\.1 421/);
    const d = await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }), { room: 'Lounge' });
    // A code: made only by a POST from the page; shown on the page and in the bridge window, never in a file.
    const mk = async () => { const r = await e.post('/iot/phone/pair', {}); assert.equal(r.status, 200, r.text); return r.json; };
    const first = await mk();
    assert.match(first.code, /^\d{6}$/); assert.equal(first.url, `http://127.0.0.1:${e.o.iot.lan.port}/remote#pair=${first.code}`);
    assert.equal(shown.at(-1), first.code); assert.ok(!readFileSync(e.statePath, 'utf8').includes(first.code) || !existsSync(e.statePath));
    const pair = (code, extra = {}) => rq('POST', '/remote/api/pair', { body: { code }, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile' }, ...extra });
    assert.equal((await pair(first.code, { origin: 'http://evil.example' })).status, 403, 'only the remote page itself');
    assert.equal((await rq('POST', '/remote/api/pair', { body: '{"code":"1"}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    const wrong = first.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) { const r = await pair(wrong); assert.equal(r.status, 403); assert.equal(r.json.error, 'That code is not right.'); }
    const sixth = await pair(first.code);
    assert.equal(sixth.status, 403); assert.match(sixth.json.error, /Five wrong tries/, 'the sixth try is refused even with the right code');
    const second = await mk();
    e.clock.advance(121e3);
    assert.match((await pair(second.code)).json.error, /expired/, 'a code lasts two minutes');
    assert.match((await pair('123456')).json.error, /no pairing code now/);
    // A good code and Y in the bridge window: the key, once.
    const third = await mk();
    const qBefore = e.questions.length;
    const ok = await pair(third.code);
    assert.equal(ok.status, 200, ok.text);
    assert.equal(e.questions.length, qBefore + 1); assert.equal(e.questions.at(-1), 'A phone (Android Chrome, 127.0.0.1) wants to pair. Allow?');
    assert.match(ok.json.phone, /^ph-[0-9a-f]{8}$/); assert.equal(Buffer.from(ok.json.key, 'base64url').length, 32); assert.equal(ok.json.now, e.clock.now());
    assert.equal((await pair(third.code)).status, 403, 'a code is used once');
    const saved = readFileSync(e.statePath, 'utf8');
    assert.ok(!saved.includes(ok.json.key), 'the key itself is not kept'); assert.ok(saved.includes(createHash('sha256').update(Buffer.from(ok.json.key, 'base64url')).digest('hex')), 'only its hash');
    assert.ok(!JSON.stringify((await e.get('/iot/phone')).json).includes('keyHash'), 'the page sees the phone, not its key hash');
    const phone = { id: ok.json.phone, key: ok.json.key };
    let nonceN = 0;
    const signed = (method, p, body, { ph = phone, ts = String(e.clock.now()), nonce = (++nonceN).toString(16).padStart(32, '0'), sig } = {}) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      const s = sig ?? B.phoneSignature(ph.key, method, p, text, ts, nonce);
      return rq(method, p, { body: body === undefined ? undefined : text, headers: { 'X-VM-Sig': `phone=${ph.id},ts=${ts},nonce=${nonce},sig=${s}` } });
    };
    const list = await signed('GET', '/remote/api/devices');
    assert.equal(list.status, 200, list.text);
    assert.deepEqual(list.json.keys, B.PHONE_KEYS);
    assert.deepEqual(list.json.devices.map(x => [x.id, x.room, x.actions]), [[d.id, 'Lounge', ['power', 'brightness', 'colour', 'colour-temp']]]);
    assert.ok(!JSON.stringify(list.json).includes('127.0.0.53'), 'the phone does not see addresses');
    const on = await signed('POST', '/remote/api/command', { v: 1, id: 'p-1', device: d.id, action: 'power', args: { on: true } });
    assert.equal(on.status, 200, on.text); assert.equal(on.json.state.power, true); assert.equal(bulb.st.state, true, 'the phone drove the bulb');
    e.clock.advance(1000);
    const dim = await signed('POST', '/remote/api/command', { v: 1, id: 'p-2', device: d.id, action: 'brightness', args: { level: 40 } });
    assert.equal(dim.json.ok, true);
    for (const [action, args] of [['play-url', { url: 'http://x/y.mp4' }], ['launch', { app: '12' }], ['seek', { seconds: 5 }]]) {
      const r = await signed('POST', '/remote/api/command', { v: 1, device: d.id, action, args });
      assert.equal(r.json.code, 'refused', action); assert.match(r.json.error, /phone remote cannot do that/);
    }
    // Replayed, stale, tampered, unsigned.
    const body = { v: 1, id: 'p-3', device: d.id, action: 'power', args: { on: false } }, text = JSON.stringify(body), ts = String(e.clock.now()), nonce = 'ab'.repeat(16);
    const sig = B.phoneSignature(phone.key, 'POST', '/remote/api/command', text, ts, nonce);
    const hdr = { 'X-VM-Sig': `phone=${phone.id},ts=${ts},nonce=${nonce},sig=${sig}` };
    e.clock.advance(1000);
    assert.equal((await rq('POST', '/remote/api/command', { body: text, headers: hdr })).json.ok, true);
    const replay = await rq('POST', '/remote/api/command', { body: text, headers: hdr });
    assert.equal(replay.status, 403); assert.match(replay.json.error, /already used/);
    const tampered = await rq('POST', '/remote/api/command', { body: text.replace('false', 'true'), headers: { 'X-VM-Sig': hdr['X-VM-Sig'].replace(nonce, 'cd'.repeat(16)) } });
    assert.match(tampered.json.error, /signature did not match/);
    const stale = await signed('GET', '/remote/api/devices', undefined, { ts: String(e.clock.now() - 31e3) });
    assert.equal(stale.status, 403); assert.match(stale.json.error, /stale/);
    assert.match((await signed('GET', '/remote/api/devices', undefined, { ts: String(e.clock.now() + 31e3) })).json.error, /stale/);
    assert.equal((await rq('GET', '/remote/api/devices')).status, 403, 'unsigned');
    assert.match((await signed('GET', '/remote/api/devices', undefined, { ph: { id: phone.id, key: randomBytes(32).toString('base64url') } })).json.error, /signature did not match/);
    // Three phones at most.
    const more = [];
    for (let i = 0; i < 2; i++) { const c = await mk(); const r = await pair(c.code); assert.equal(r.status, 200, r.text); more.push(r.json); }
    const fourth = await pair((await mk()).code);
    assert.equal(fourth.status, 403); assert.match(fourth.json.error, /At most 3 phones/);
    // Revoke one, then all.
    const rv = await e.post('/iot/phone/revoke', { phone: more[0].phone });
    assert.deepEqual(rv.json, { ok: true, revoked: 1 });
    assert.match((await signed('GET', '/remote/api/devices', undefined, { ph: { id: more[0].phone, key: more[0].key } })).json.error, /revoked/);
    assert.equal((await signed('GET', '/remote/api/devices')).status, 200, 'the others still work');
    // Seven days, then the pairing expires.
    e.clock.advance(7 * 86400e3);
    const expired = await signed('GET', '/remote/api/devices');
    assert.equal(expired.status, 403); assert.match(expired.json.error, /expired after 7 days/);
    assert.equal((await e.get('/iot/phone')).json.phones.every(p => p.expired), true);
    assert.deepEqual((await e.post('/iot/phone/revoke', { all: true })).json, { ok: true, revoked: 2 });
    assert.equal(e.iot.state.phones.length, 0);
  } finally { await e.close(); bulb.close(); }
});

test('iot: a phone the bridge window says N to gets no key', async () => {
  const e = await bridge({ lan: true, answer: q => !/wants to pair/.test(q), deps: { showCode: () => {} } });
  try {
    const addr = await e.iot.startLan();
    const lan = `http://127.0.0.1:${addr.port}`;
    const { code } = (await e.post('/iot/phone/pair', {})).json;
    const r = await fetch(`${lan}/remote/api/pair`, { method: 'POST', headers: { Origin: lan, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = await r.json();
    assert.equal(r.status, 403); assert.equal(j.code, 'refused'); assert.equal(j.key, undefined);
    assert.equal(e.iot.state.phones.length, 0);
  } finally { await e.close(); }
});

test('iot: review fixes: certificates always parse; the phone’s port matters only with --lan; no MQTT password without a user name; digest and neighbour-table parsing', () => {
  for (let i = 0; i < 4000; i++) { const n = serialNumber(); assert.ok(n[0] >= 0x40 && n[0] <= 0x7f, `serial ${n.toString('hex')}: positive, and no leading zero byte for OpenSSL to call padding`); }
  assert.equal(B.parseArgs(['--port', '8791']).port, 8791, 'a SIGINT-only bridge may use the port the bridge itself suggests');
  assert.equal(B.parseArgs(['--port', '8791', '--iot']).port, 8791, 'IoT without the phone remote');
  assert.throws(() => B.parseArgs(['--port', '8791', '--lan']), /lan\.port/, 'the phone remote cannot share the bridge’s port');
  assert.throws(() => B.normaliseIot({ broker: { url: 'mqtt://127.0.0.1:1883' } }, { iot: true }, 8790, { VM_MQTT_PASSWORD: 'pw' }), /username/);
  assert.equal(B.normaliseIot({ broker: { url: 'mqtt://127.0.0.1:1883', username: 'vm' } }, { iot: true }, 8790, { VM_MQTT_PASSWORD: 'pw' }).mqttPassword, 'pw');
  const flags = pkt => pkt[pkt.indexOf(Buffer.from('MQTT')) + 5];
  assert.equal(flags(B.mqtt.connect({ clientId: 'a', password: 'pw' })) & 0xc0, 0, 'no password flag without the user name flag [MQTT-3.1.2-22]');
  assert.equal(flags(B.mqtt.connect({ clientId: 'a', username: 'vm', password: 'pw' })) & 0xc0, 0xc0);
  assert.deepEqual(B.parseDigest('Digest qop="auth", realm="shellyplus1-a8", nonce="1700000000", algorithm=SHA-256'), { qop: 'auth', realm: 'shellyplus1-a8', nonce: '1700000000', algorithm: 'SHA-256' });
  assert.deepEqual(B.parseDigest('Basic realm="x"'), {});
  const arpWin = 'Interface: 192.168.1.20 --- 0xb\r\n  Internet Address      Physical Address      Type\r\n  192.168.1.50          aa-bb-cc-00-11-99     dynamic\r\n  192.168.1.5           aa-bb-cc-00-11-22     dynamic\r\n';
  assert.equal(B.macIn(arpWin, '192.168.1.5'), 'aa:bb:cc:00:11:22', 'Windows arp -a, the exact address only');
  assert.equal(B.macIn('192.168.1.5 dev wlan0 lladdr aa:bb:cc:00:11:22 REACHABLE', '192.168.1.5'), 'aa:bb:cc:00:11:22', 'ip neigh');
  assert.equal(B.macIn('? (192.168.1.5) at 0:1a:2b:3c:4d:5e on en0 ifscope [ethernet]', '192.168.1.5'), '00:1a:2b:3c:4d:5e', 'macOS arp -n');
  assert.equal(B.macIn('192.168.1.5 dev wlan0 INCOMPLETE', '192.168.1.5'), null);
  assert.equal(B.macIn(arpWin, '192.168.1.7'), null);
});

test('iot: review fixes: the config file’s ceiling is each new device’s, and Vol + on an LG TV is held to it', async () => {
  const player = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') });
  const e = await bridge({ iot: { volumeCeiling: 95 } });
  e.portMap['127.0.0.44:49152'] = player.port;
  try {
    const d = await e.add(await e.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }));
    assert.equal(d.volumeCeiling, 95, 'iot.volumeCeiling 95 in the config file');
    const v = await e.cmd(d.id, 'volume', { level: 100 });
    assert.equal(v.state.volume, 95); assert.equal(v.note, 'Volume stops at 95, this device’s ceiling.');
  } finally { await e.close(); player.close(); }
  const ca = makeCA(), leaf = makeLeaf(ca, { cn: 'lgsmarttv.lan' });
  const desc = await fakeUpnp({ description: fixture('desc-lg.txt') });
  const tv = await fakeLg({ leaf, acceptAfterMs: 0 });
  const f = await bridge();
  f.portMap['127.0.0.48:1781'] = desc.port; f.portMap['127.0.0.48:3001'] = tv.port;
  try {
    const d = await f.add(await f.inject('ssdp', ssdp('ssdp-lg.txt'), { address: '127.0.0.48', port: 1900 }));
    assert.equal((await f.post('/iot/pair', { device: d.id })).status, 200);
    assert.equal((await f.post('/iot/device', { device: d.id, volumeCeiling: 10 })).json.device.volumeCeiling, 10);
    tv.st.volume = 10;
    const up = await f.cmd(d.id, 'key', { name: 'VolumeUp' });
    assert.equal(up.code, 'refused'); assert.equal(up.error, 'Volume stops at 10, this device’s ceiling.');
    assert.deepEqual(tv.st.buttons, [], 'no VOLUMEUP reached the TV at its ceiling');
    tv.st.volume = 5;
    assert.equal((await f.cmd(d.id, 'key', { name: 'VolumeUp' })).ok, true, 'below the ceiling it is pressed');
    assert.equal((await f.cmd(d.id, 'key', { name: 'VolumeDown' })).ok, true, 'Vol − is never held');
    await until(() => tv.st.buttons.length === 2, 'two buttons');
    assert.deepEqual(tv.st.buttons, ['VOLUMEUP', 'VOLUMEDOWN']);
  } finally { await f.close(); tv.close(); desc.close(); }
});

test('iot: review fixes: two devices of one name in one room get their own JSON-tree topics; UPnP 1.0 URLBase on the same host is honoured', async () => {
  const broker = await fakeBroker(), one = await fakeWiz(), two = await fakeWiz({ mac: 'a8bb50ddeeff' });
  const e = await bridge({ iot: { broker: { url: `mqtt://127.0.0.1:${broker.port}`, acceptCommands: true } } });
  Object.assign(e.portMap, { '127.0.0.53:38899': one.port, '127.0.0.54:38899': two.port });
  const reg = mac => Buffer.from(JSON.stringify({ method: 'registration', env: 'pro', result: { mac, success: true } }));
  try {
    const a = await e.add(await e.inject('wiz', reg('a8bb50aabbcc'), { address: '127.0.0.53', port: 38899 }), { room: 'Hall', name: 'Lamp' });
    const b = await e.add(await e.inject('wiz', reg('a8bb50ddeeff'), { address: '127.0.0.54', port: 38899 }), { room: 'Hall', name: 'Lamp' });
    assert.deepEqual([a.uns, b.uns], [{ area: 'hall', name: 'lamp' }, { area: 'hall', name: 'lamp-2' }]);
    assert.deepEqual((await e.post('/iot/device', { device: a.id, name: 'Lamp' })).json.device.uns, { area: 'hall', name: 'lamp' }, 'a rename to its own name keeps its topic');
    await e.iot.start(); await waitConnected(e);
    await until(() => broker.st.retained.has('vm/home/hall/lamp/state') && broker.st.retained.has('vm/home/hall/lamp-2/state'), 'both topics');
    await until(() => broker.st.subs.length > 0, 'the /set subscription');
    broker.publish('vm/home/hall/lamp-2/set', JSON.stringify({ action: 'power', args: { on: true } }));
    await until(() => two.st.state === true, 'the second lamp on');
    assert.equal(one.st.state, false, 'a /set reaches only its own device');
  } finally { e.iot.stop(); await e.close(); broker.close(); one.close(); two.close(); }
  const withBase = fixture('desc-ezcast-u02.txt').replace('</specVersion>', '</specVersion><URLBase>http://127.0.0.44:49153/</URLBase>');
  const desc = await fakeUpnp({ description: withBase }), control = await fakeUpnp({ description: withBase });
  const f = await bridge();
  Object.assign(f.portMap, { '127.0.0.44:49152': desc.port, '127.0.0.44:49153': control.port });
  try {
    const d = await f.add(await f.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }));
    assert.equal(d.control.av, 'http://127.0.0.44:49153/AVTransport/control', 'relative control URLs resolve against <URLBase>');
    assert.equal((await f.cmd(d.id, 'play')).ok, true);
    assert.ok(control.calls.some(c => c.action === 'Play'), 'the command went to the URLBase port');
    assert.ok(!desc.calls.some(c => c.action === 'Play'));
  } finally { await f.close(); desc.close(); control.close(); }
  const elsewhere = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt').replace('</specVersion>', '</specVersion><URLBase>http://127.0.0.99:49153/</URLBase>') });
  const g = await bridge();
  g.portMap['127.0.0.44:49152'] = elsewhere.port;
  try {
    const d = await g.add(await g.inject('ssdp', ssdp('ssdp-ezcast-u02.txt'), { address: '127.0.0.44', port: 1900 }));
    assert.equal(d.control.av, 'http://127.0.0.44:49152/AVTransport/control', 'a URLBase on another host is not used');
  } finally { await g.close(); elsewhere.close(); }
});

test('iot: review fixes: with Sparkplug and the JSON tree both on, hermes/status has its own will and turns offline when the connection drops', async () => {
  const broker = await fakeBroker();
  const e = await bridge({ iot: { broker: { url: `mqtt://127.0.0.1:${broker.port}`, sparkplug: true } } });
  try {
    await e.iot.start(); await waitConnected(e);
    await until(() => broker.st.retained.get('vm/home/hermes/status')?.toString() === 'online', 'hermes/status online');
    const [main, status] = broker.st.connects;
    assert.equal(main.will.topic, 'spBv1.0/VM/NDEATH/hermes', 'the main connection’s will is NDEATH');
    assert.notEqual(status.clientId, main.clientId, 'two client ids, so neither connection replaces the other');
    assert.deepEqual([status.will.topic, status.will.payload.toString(), status.will.qos, status.will.retain], ['vm/home/hermes/status', 'offline', 1, true]);
    broker.dropAll();
    await until(() => broker.st.wills.length === 2, 'both wills');
    assert.equal(broker.st.retained.get('vm/home/hermes/status').toString(), 'offline', 'hermes/status turns offline when the will fires');
    assert.ok(broker.st.wills.some(w => w.topic === 'spBv1.0/VM/NDEATH/hermes'), 'and NDEATH fires too');
  } finally { e.iot.stop(); await e.close(); broker.close(); }
});

test('iot: review fixes: each refused signature says why, a stale one carries the bridge’s clock, and a protected Tasmota with no neighbour-table entry gets no password', async () => {
  const bulb = await fakeWiz();
  const e = await bridge({ lan: true, deps: { showCode: () => {} } });
  e.portMap['127.0.0.53:38899'] = bulb.port;
  try {
    const addr = await e.iot.startLan(), lan = `http://127.0.0.1:${addr.port}`;
    const rq = async (method, p, { body, headers = {} } = {}) => { const r = await fetch(`${lan}${p}`, { method, headers: { Origin: lan, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
    await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }));
    const code = (await e.post('/iot/phone/pair', {})).json.code;
    const ph = (await rq('POST', '/remote/api/pair', { body: { code } })).json;
    let n = 0;
    const signed = ({ id = ph.phone, key = ph.key, ts = String(e.clock.now()), nonce = (++n).toString(16).padStart(32, '0') } = {}) =>
      rq('GET', '/remote/api/devices', { headers: { 'X-VM-Sig': `phone=${id},ts=${ts},nonce=${nonce},sig=${B.phoneSignature(key, 'GET', '/remote/api/devices', '', ts, nonce)}` } });
    assert.equal((await signed()).status, 200);
    const stale = await signed({ ts: String(e.clock.now() - 40e3) });
    assert.deepEqual([stale.status, stale.json.code, stale.json.reason, stale.json.now], [403, 'refused', 'stale', e.clock.now()], 'the phone can correct its clock and keep its key');
    const fixedNonce = 'ef'.repeat(16);
    assert.equal((await signed({ nonce: fixedNonce })).status, 200);
    assert.equal((await signed({ nonce: fixedNonce })).json.reason, 'replayed');
    assert.equal((await signed({ key: randomBytes(32).toString('base64url') })).json.reason, 'bad-signature');
    assert.equal((await signed({ id: 'ph-00000000' })).json.reason, 'revoked');
    assert.equal((await rq('GET', '/remote/api/devices', { headers: { 'X-VM-Sig': 'nonsense' } })).json.reason, 'unpaired');
    e.clock.advance(7 * 86400e3 + 1);
    assert.equal((await signed()).json.reason, 'expired');
    assert.ok(!B.remoteScript().includes("j.code === 'refused') { store = {}"), 'the phone no longer wipes its key on every refusal');
  } finally { await e.close(); bulb.close(); }
  const PASSWORD = 'tasmota-pass-456';
  const lamp = await fakeTasmota({ password: PASSWORD });
  const seen = [];
  const watch = createServer((req, res) => { seen.push(req.url); res.writeHead(404); res.end(); });
  await new Promise(r => watch.listen(0, '127.0.0.1', r));
  const f = await bridge({ deps: { neighbourMac: async () => null } });
  f.portMap['127.0.0.52:80'] = lamp.port;
  try {
    const t = await f.post('/iot/identify', { kind: 'tasmota', address: '127.0.0.52' });
    const d = await f.add(t.json.candidate);
    f.portMap['127.0.0.52:80'] = watch.address().port;
    const r = await f.post('/iot/pair', { device: d.id, password: PASSWORD });
    assert.equal(r.status, 403); assert.match(r.json.error, /neighbour table has no network card address for it/);
    assert.deepEqual(seen, [], 'nothing, so no password, reached whatever answers at the address');
    assert.equal(f.iot.state.devices[0].secret, null, 'and the password was not kept');
  } finally { await f.close(); lamp.close(); watch.close(); }
});

test('iot page: the phone remote keeps its pairing on reload when its clock is 40 seconds behind the bridge’s', pageTest, async () => {
  const bulb = await fakeWiz();
  const e = await bridge({ lan: true, realClock: true, deps: { now: () => Date.now() + 40e3, showCode: () => {} } });
  e.portMap['127.0.0.53:38899'] = bulb.port;
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const addr = await e.iot.startLan(), lan = `http://127.0.0.1:${addr.port}`;
    await e.add(await e.inject('wiz', Buffer.from(fixture('wiz-registration.txt')), { address: '127.0.0.53', port: 38899 }));
    const code = (await e.post('/iot/phone/pair', {})).json.code;
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const elsewhere = [];
    await ctx.route(u => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), r => { elsewhere.push(r.request().url()); return r.abort(); });
    const phone = await ctx.newPage();
    await phone.goto(`${lan}/remote#pair=${code}`);
    await phone.click('#pair-form button');
    await phone.waitForSelector('#remote:not([hidden])');
    const kept = await phone.evaluate(() => JSON.parse(localStorage.getItem('vm.remote')));
    assert.ok(Math.abs(kept.offset - 40e3) < 5000, `the offset is kept with the key (${kept.offset} ms)`);
    await phone.goto(`${lan}/remote`);
    await phone.waitForSelector('#remote:not([hidden])');
    assert.equal(await phone.isHidden('#pair'), true, 'reopened, it is still paired');
    // An offset lost (an older remote, a cleared field): the stale answer carries the bridge's clock, and one retry works.
    await phone.evaluate(() => { const s = JSON.parse(localStorage.getItem('vm.remote')); delete s.offset; localStorage.setItem('vm.remote', JSON.stringify(s)); });
    await phone.goto(`${lan}/remote`);
    await phone.waitForSelector('#remote:not([hidden])');
    assert.equal((await phone.evaluate(() => JSON.parse(localStorage.getItem('vm.remote')))).key, kept.key, 'the key survives a stale request');
    await phone.click('button[data-a="power-on"]');
    await phone.waitForFunction(() => document.querySelector('#msg').textContent === 'Done.');
    assert.equal(bulb.st.state, true);
    assert.deepEqual(elsewhere, []);
    await ctx.close();
  } finally { await browser.close(); await e.close(); bulb.close(); }
});

test('iot: --lan refuses 0.0.0.0, an address that is not the home interface’s, and a Public network', async () => {
  const mk = async (address, profile = 'Private', policy = 'home') => {
    const port = await freePort();
    const o = { port, quiet: true, iot: B.normaliseIot({ interface: 'Wi-Fi', lan: { address, port: await otherPort(port, B.DEFAULT_PORT) } }, { iot: true, lan: true, state: newStatePath() }, port) };
    const iot = B.createIot(o, { policy, interfaces: () => ({ 'Wi-Fi': [{ address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', internal: false, cidr: '192.168.1.20/24' }] }), profile: async () => profile, confirm: null });
    try { await iot.startLan(); return 'listening'; } catch (e) { return e.message; } finally { iot.stop(); }
  };
  assert.match(await mk('0.0.0.0'), /^--lan refused: .*never 0\.0\.0\.0/);
  assert.match(await mk('10.8.0.5'), /does not belong to your home connection/);
  assert.match(await mk('8.8.8.8'), /not a private address/);
  assert.match(await mk('192.168.1.20', 'Public'), /Windows marks this network Public.*Mark it Private/);
  assert.match(await mk('192.168.1.20', 'Private', 'loopback'), /only on 127\.0\.0\.1/, 'under the test policy nothing listens on another interface');
  assert.deepEqual(tripwire.violations, []);
});

/* =====================================================================================================================
 * The page (digital/iot-connect/): its pure parts, its static rules, then the page itself in Microsoft Edge against
 * the real bridge under the loopback policy, with fake devices and a fake phone. The site is served from 127.0.0.1 with
 * the headers of _headers (its Content-Security-Policy pointed at the test bridge's port), Edge runs as a child
 * process over a pipe, and nothing leaves loopback.
 * ===================================================================================================================== */
const PAGE = p => readFileSync(path.join(ROOT, 'digital', 'iot-connect', p), 'utf8');
// The design's §4.4 words (PRP-IOT-CONNECT-DESIGN.md, 7 November 2026), as the Law & safety tab must show them.
const LAW_44 = 'IoT Connect is for your own devices on your own home network. It finds devices by sending each kind’s standard discovery question and listening for answers, or by an address you type; it never tries other addresses or ports. On a shared network (a shared flat, student halls, a hotel, an office) what it finds may be other people’s: add only a device that is yours or whose owner has said yes. Using someone else’s device without permission can be an offence (UK Computer Misuse Act 1990; Ireland’s Criminal Justice (Offences Relating to Information Systems) Act 2017). IoT Connect connects only as each maker documents, asks you to confirm on the device and in the bridge window, and never guesses passwords. Keys stay in the bridge’s file on your computer. Lights change at most twice a second and volume stops at a ceiling, because rapid flashing can trigger seizures and loud sound can harm hearing. The phone remote is plain HTTP on your Wi-Fi: use it only at home.';
const HUB_LINE = 'The Hub holds no keys. Hermes Messenger runs in the bridge on your own computer; an AI key you give it stays there.';

test('iot page: the words are the design’s, word for word, and the Hub’s security line is the same everywhere', () => {
  assert.equal(W.LAW, LAW_44);
  assert.equal(W.HUB_SECURITY, HUB_LINE);
  assert.equal(W.TICK_OWNED, 'This device is mine, or I have its owner’s permission to control it');
  assert.equal(W.TICK_HOME, 'This is my own home network');
  assert.equal(W.SHARED, 'This looks like a shared network. Devices here may belong to other people.');
  const agents = JSON.parse(readFileSync(path.join(ROOT, 'integration', 'agents.json'), 'utf8'));
  assert.equal(agents.security, HUB_LINE);
  assert.equal(agents.agents[0].name, 'Hermes Messenger', 'Hermes first');
  assert.equal(agents.agents[0].submodule, 'iot-connect');
  const hub = readFileSync(path.join(ROOT, 'integration', 'index.html'), 'utf8');
  assert.ok(hub.includes(HUB_LINE.replace('The Hub holds no keys. ', '')), 'the Hub page says it');
  assert.match(hub, /id="tab-agents"[^>]*aria-controls="panel-agents"/); assert.match(hub, /id="panel-agents" role="tabpanel"/);
});

test('iot page: Vol + and Vol − set a level where the device takes one, so the ceiling holds, before trying a key', () => {
  const fn = PAGE('views/remote.js').split('function pressKey')[1].split(/\r?\n {2}\}\r?\n/)[0];
  assert.ok(fn.indexOf("A.has('volume')") > 0 && fn.indexOf("A.has('volume')") < fn.indexOf("A.has('key')"), 'the volume command is tried first');
});

test('iot page: lib/keymap.js holds the bridge’s key names, in the phone remote’s order', () => {
  assert.deepEqual(KM.KEYS, B.PHONE_KEYS);
  assert.deepEqual([...KM.KEYS].sort(), Object.keys(B.KEYMAP).sort());
  assert.deepEqual(B.REMOTE_KEYS, KM.KEYS, 'the remote the bridge serves');
  for (const k of KM.KEYS) assert.ok(KM.LABELS[k]?.[1], `${k} has a label`);
  for (const k of [...KM.PAD.flat(), ...KM.ROW].filter(Boolean)) assert.ok(KM.isKey(k), k);
  assert.ok(B.remoteScript().includes(`const KEYMAP_NAMES = ${JSON.stringify(KM.KEYS)};`));
});

test('iot page: lib/sha256.js matches Node’s crypto, and signs as the bridge checks', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
    const b = randomBytes(n), k = randomBytes(n % 3 ? 32 : 100);
    assert.equal(S.hex(S.sha256(b)), createHash('sha256').update(b).digest('hex'), `sha256 of ${n} bytes`);
    assert.equal(S.hex(S.hmacSha256(k, b)), createHmac('sha256', k).update(b).digest('hex'), `hmac of ${n} bytes`);
  }
  assert.equal(S.hex(S.sha256(S.utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'FIPS 180-2 test vector');
  const key = randomBytes(32).toString('base64url');
  assert.deepEqual([...S.fromBase64url(key)], [...Buffer.from(key, 'base64url')]);
  for (const body of ['', '{"v":1,"id":"p-1","device":"wiz-1","action":"power","args":{"on":true}}', 'é😀']) {
    assert.equal(S.phoneSignature(key, 'POST', '/remote/api/command', body, '1794052800000', 'ab'.repeat(8)), B.phoneSignature(key, 'POST', '/remote/api/command', body, '1794052800000', 'ab'.repeat(8)));
  }
  assert.match(S.signHeader({ phone: 'ph-0011aabb', key, method: 'GET', path: '/remote/api/devices', ts: '1794052800000', nonce: 'cd'.repeat(8) }), /^phone=ph-0011aabb,ts=1794052800000,nonce=(cd){8},sig=[0-9a-f]{64}$/);
  assert.throws(() => S.signHeader({ phone: 'ph-0011aabb', key, method: 'GET', path: '/', ts: '1', nonce: 'xyz' }), /nonce/);
});

/** Read a QR symbol back: finders, format, unmasking, the zigzag, de-interleaving, Reed-Solomon syndromes, the bytes. */
function readQr(m) {
  const size = m.length, ver = (size - 17) / 4;
  for (const [x0, y0] of [[0, 0], [size - 7, 0], [0, size - 7]]) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
    assert.equal(m[y0 + y][x0 + x], d !== 2, `finder at ${x0},${y0}`);
  }
  for (let i = 8; i < size - 8; i++) { assert.equal(m[6][i], i % 2 === 0, 'timing row'); assert.equal(m[i][6], i % 2 === 0, 'timing column'); }
  let fmt = 0;
  const f1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  f1.forEach(([x, y], i) => { if (m[y][x]) fmt |= 1 << i; });
  const fmt2 = Array.from({ length: 15 }, (_, i) => (i < 8 ? m[8][size - 1 - i] : m[size - 15 + i][8]) ? 1 << i : 0).reduce((a, b) => a | b, 0);
  assert.equal(fmt, fmt2, 'both copies of the format bits agree');
  const mask = [...Array(8).keys()].find(k => Q.formatBits(0, k) === fmt);
  assert.notEqual(mask, undefined, 'format bits are level M with a valid mask');
  assert.equal(m[size - 8][8], true, 'the dark module');
  if (ver >= 7) { const vb = Q.versionBits(ver); for (let i = 0; i < 18; i++) assert.equal(m[Math.floor(i / 3)][size - 11 + (i % 3)], ((vb >>> i) & 1) === 1, 'version bits'); }
  // Which modules are function modules: rebuild them from a blank encode of the same version.
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true; };
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  const al = Q.alignmentPositions(ver), last = al.length - 1;
  al.forEach((a, i) => al.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(a + dx, b + dy); }));
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  if (ver >= 7) for (let i = 0; i < 18; i++) { mark(size - 11 + (i % 3), Math.floor(i / 3)); mark(Math.floor(i / 3), size - 11 + (i % 3)); }
  const bits = Q.zigzag(size, fn).map(([x, y]) => (m[y][x] !== Q.MASKS[mask](x, y) ? 1 : 0));
  const raw = Math.floor(Q.rawModules(ver) / 8), all = [];
  for (let i = 0; i < raw; i++) all.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  // De-interleave into blocks and check each block's syndromes are zero.
  const nb = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5][ver - 1], ecc = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26][ver - 1];
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), blocks = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) for (let j = 0; j < nb; j++) { if (i === shortLen - ecc && j < nShort) continue; blocks[j].push(all[k++]); }
  const data = [];
  for (const b of blocks) {
    const dataLen = b.length - ecc;
    assert.deepEqual(Q.rsRemainder(b.slice(0, dataLen), Q.rsDivisor(ecc)), b.slice(dataLen), 'Reed-Solomon codewords check');
    data.push(...b.slice(0, dataLen));
  }
  const dbits = data.flatMap(b => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (b >>> i) & 1));
  const read = (at, n) => dbits.slice(at, at + n).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(read(0, 4), 0b0100, 'byte mode');
  const cbits = ver < 10 ? 8 : 16, len = read(4, cbits);
  return Buffer.from(Array.from({ length: len }, (_, i) => read(4 + cbits + 8 * i, 8))).toString('utf8');
}

test('iot page: lib/qr.js makes QR codes that read back, checked against the standard’s published values', () => {
  // The worked example of version 1-M: "HELLO WORLD"'s data codewords and their error correction (thonky.com's tutorial).
  assert.deepEqual(Q.rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], Q.rsDivisor(10)), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.equal(Q.formatBits(0, 0).toString(2).padStart(15, '0'), '101010000010010', 'level M, mask 0');
  assert.equal(Q.formatBits(1, 4).toString(2).padStart(15, '0'), '110011000101111', 'level L, mask 4');
  assert.equal(Q.versionBits(7).toString(2).padStart(18, '0'), '000111110010010100', 'version 7');
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(Q.capacity), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213], 'byte capacity at level M');
  assert.deepEqual(Q.alignmentPositions(7), [6, 22, 38]);
  for (const text of ['http://192.168.1.20:8791/remote#pair=123456', 'http://127.0.0.1:65535/remote#pair=000001', 'x', 'é'.repeat(40), 'http://192.168.100.200:8791/remote#pair=999999&'.repeat(4)]) {
    const q = Q.qrEncode(text);
    assert.equal(q.size, q.version * 4 + 17);
    assert.equal(readQr(q.modules), text, `reads back (version ${q.version})`);
  }
  assert.throws(() => Q.qrEncode('x'.repeat(214)), /Too long/);
  assert.match(Q.qrPath([[true, true, false], [false, true, false], [false, false, false]]), /^M4 4h2v1h-2zM5 5h1v1h-1z$/);
});

test('iot page: lib/model.js and lib/bridge.js', async () => {
  assert.equal(M.typedAddress(' 192.168.1.31 '), '192.168.1.31');
  for (const bad of ['192.168.1.31:80', '192.168.1', '256.1.1.1', 'tv.local', 'http://192.168.1.31', '', '1:2:3:4:5:6:7:8:9']) assert.equal(M.typedAddress(bad), null, bad);
  assert.equal(M.typedAddress('FE80::1'), 'fe80::1');
  assert.deepEqual(M.TYPED_KINDS.map(k => k[0]).sort(), Object.keys(B.TYPED_KINDS).sort(), 'the kinds a typed address may name are the bridge’s');
  assert.deepEqual(M.byRoom([{ name: 'b' }, { name: 'z', room: 'Kitchen' }, { name: 'a', room: 'Kitchen' }, { name: 'c', room: 'Bedroom' }]).map(g => [g.label, g.devices.map(d => d.name).join('')]), [['Bedroom', 'c'], ['Kitchen', 'az'], ['No room', 'b']]);
  const dev = { id: 'upnp-1', volumeCeiling: 60 };
  assert.deepEqual(M.commandBody(dev, 'volume', { level: 95 }).args, { level: 60 }, 'the ceiling');
  assert.deepEqual(M.commandBody(dev, 'colour-temp', { kelvin: 9000 }).args, { kelvin: 6500 });
  assert.deepEqual(M.commandBody(dev, 'colour', { hex: '#FFAA00' }).args, { hex: '#ffaa00' });
  const c = M.commandBody(dev, 'pause');
  assert.deepEqual(Object.keys(c), ['v', 'id', 'device', 'action']); assert.equal(c.v, 1); assert.match(c.id, /^c-/);
  assert.notEqual(M.commandBody(dev, 'pause').id, c.id);
  assert.equal(M.stateLine({ online: true, power: true, brightness: 60, volume: null, playback: 'playing' }), 'On · 60% · Playing');
  assert.equal(M.stateLine(null), 'No state read yet');
  // The client: loopback only, Content-Type exactly application/json, a refusal as plain words.
  assert.throws(() => BR.createClient('http://192.168.1.20:8790'), /this computer/);
  assert.throws(() => BR.createClient('http://[::1]:8790'), /this computer/, 'no IPv6 literal: the security policy could not name it');
  assert.equal(BR.normaliseBase('http://127.0.0.1:8790/'), 'http://127.0.0.1:8790');
  const seen = [];
  const fake = async (url, init) => { seen.push([url, init]); return { ok: false, status: 403, json: async () => ({ ok: false, code: 'refused', error: 'Not confirmed in the bridge window.' }) }; };
  const cl = BR.createClient('http://localhost:8790', { fetchFn: fake });
  await assert.rejects(cl.post('/iot/add', { candidate: 'x' }), e => e.code === 'refused' && e.message === 'Not confirmed in the bridge window.');
  assert.equal(seen[0][0], 'http://localhost:8790/iot/add'); assert.equal(seen[0][1].method, 'POST');
  assert.deepEqual(seen[0][1].headers, { 'Content-Type': 'application/json' }); assert.equal(seen[0][1].body, '{"candidate":"x"}'); assert.equal(seen[0][1].credentials, 'omit');
  await assert.rejects(cl.post('/local/adsb'), /Not a bridge address/);
  await assert.rejects(cl.get('/iot/../local/adsb'), /Not a bridge address/);
  const down = BR.createClient('http://localhost:8790', { fetchFn: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down.get('/iot/status'), e => e.code === 'unreachable' && /did not answer at http:\/\/localhost:8790/.test(e.message));
});

test('iot page: hooked up as Digital Science · IoT Connect, no inline script or style, tokens only, text never as HTML', () => {
  const html = PAGE('index.html');
  assert.match(html, /<html lang="en" data-suite="ds" class="prp">/);
  assert.match(html, /<title>IoT Connect · VM<\/title>/);
  assert.match(html, /<script src="\.\.\/\.\.\/design\/prp-bar\.js" data-suite="ds" data-module="iot-connect" data-shell="\.\.\/\.\.\/" defer><\/script>/);
  assert.match(html, /Digital Science <span class="sep">·<\/span> IoT Connect/);
  assert.ok(![...html.matchAll(/<script\b([^>]*)>/g)].some(m => !/\bsrc=/.test(m[1])), 'no inline script');
  assert.ok(!/\sstyle=|<style/i.test(html), 'no style attribute or element');
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline handlers');
  const reg = JSON.parse(readFileSync(path.join(ROOT, 'registry.json'), 'utf8'));
  const ds = reg.suites.find(s => s.id === 'ds'), m = ds.modules.find(x => x.id === 'iot-connect');
  assert.deepEqual([m.name, m.kind, m.icon, m.status, m.host, m.url], ['IoT Connect', 'operations', '⊶', 'live', 'Vitruvian Manager', 'digital/iot-connect/index.html']);
  // Its own icon (Jude, 12 November 2026): until then it shared Home's ⌂. No other entry uses ⊶, and none uses ⌂,
  // which the sidebar keeps for the Home page item (shell.js).
  const icons = reg.suites.flatMap(s => s.modules.map(x => [x.id, x.icon]));
  assert.deepEqual(icons.filter(([id, icon]) => icon === '⊶').map(([id]) => id), ['iot-connect'], 'IoT Connect\'s icon is its own');
  assert.deepEqual(icons.filter(([, icon]) => icon === '⌂'), [], 'no submodule shares the Home page\'s ⌂');
  assert.equal(ds.summary, 'Chart Vitruvian Manager\'s data, connect it to AI assistants, and run your own devices.');
  assert.deepEqual(m.views.map(v => v.id), ['overview', 'devices', 'remote', 'hermes', 'uns', 'law']);
  for (const v of m.views) { assert.equal(v.url, `digital/iot-connect/index.html#tab=${v.id}`); assert.match(html, new RegExp(`id="tab-${v.id}"[^>]*aria-controls="panel-${v.id}"`)); assert.match(html, new RegExp(`id="panel-${v.id}" role="tabpanel"`)); }
  const css = PAGE('iot.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const decl = [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)[;}]/g)].filter(x => !x[1].startsWith('-'));
  assert.ok(decl.length > 100);
  assert.deepEqual(decl.filter(x => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(x[2])).map(x => x[0]), [], 'tokens only, outside token definitions');
  assert.deepEqual([...css.matchAll(/(--[a-z-]+)\s*:\s*#/g)].map(x => x[1]), ['--iot-qr-paper', '--iot-qr-ink'], 'the only colours are the QR code’s named tokens');
  const js = ['app.js', ...['bridge', 'keymap', 'model', 'qr', 'sha256', 'words'].map(f => `lib/${f}.js`), ...['dom', 'overview', 'devices', 'remote', 'hermes', 'uns', 'law'].map(f => `views/${f}.js`)];
  for (const f of js) {
    const src = PAGE(f);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), `${f}: text only, never HTML`);
    assert.ok(!/localStorage\.setItem\([^)]*(token|key|password)/i.test(src), `${f}: no secret in storage`);
    if (f !== 'lib/bridge.js') assert.ok(!/\bfetch\(/.test(src), `${f}: the bridge client is the only way out`);
  }
  const app = PAGE('app.js');
  assert.ok(!/\.post\(/.test(app), 'the entry module sends no change: only the views’ click handlers do');
  assert.ok(!/addEventListener\('key(down|up|press)'/.test(PAGE('views/remote.js')), 'no keyboard shortcut sends a command');
  // The site's policy for the page (design §4.2, less the IPv6 source a policy cannot hold).
  const rules = parseHeaders(readFileSync(path.join(ROOT, '_headers'), 'utf8'));
  assert.equal(headersFor('/digital/iot-connect/', rules)['Content-Security-Policy'], "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' http://localhost:8790 http://127.0.0.1:8790; img-src 'self' data:; frame-ancestors 'self'");
  assert.equal(headersFor('/digital/iot-connect/lib/qr.js', rules)['Content-Security-Policy'] != null, true);
  assert.equal(headersFor('/sigint/', rules)['Content-Security-Policy'], undefined, 'other pages keep their own');
});

/** One bridge (the real one, loopback policy) with fake devices, the site from 127.0.0.1, and Edge. */
async function pageRig() {
  const ez = await fakeUpnp({ description: fixture('desc-ezcast-u02.txt') }), hostile = await fakeUpnp({ description: fixture('desc-hostile-renderer.txt') }), wiz = await fakeWiz();
  let bport = 0;
  const site = await siteServer({ rewrite: (k, v) => (k === 'Content-Security-Policy' ? v.replaceAll(':8790', `:${bport}`) : v) });
  const shown = [];
  const e = await bridge({ iot: { origins: [site.base] }, lan: true, realClock: true, deps: { showCode: c => shown.push(c) } });
  bport = e.port;
  Object.assign(e.portMap, { '127.0.0.44:49152': ez.port, '127.0.0.45:49153': hostile.port, '127.0.0.53:38899': wiz.port });
  const lan = await e.iot.startLan();
  const browser = await launch({ args: ['--mute-audio'] });
  return {
    e, ez, hostile, wiz, site, browser, shown, lanPort: lan.port,
    packets() {
      e.packets.push({ via: 'ssdp', packet: ssdp('ssdp-ezcast-u02.txt'), from: { address: '127.0.0.44', port: 1900 } });
      e.packets.push({ via: 'ssdp', packet: ssdp('ssdp-hostile-renderer.txt'), from: { address: '127.0.0.45', port: 1900 } });
      e.packets.push({ via: 'wiz', packet: Buffer.from(fixture('wiz-registration.txt')), from: { address: '127.0.0.53', port: 38899 } });
    },
    /** A page with the bridge address set (the test seam: a loopback address kept in this browser) and its problems recorded. */
    async open(url, { viewport = { width: 1280, height: 900 }, context } = {}) {
      const ctx = context || await browser.newContext({ viewport });
      await ctx.addInitScript(b => {
        try { localStorage.setItem('prp.iot.bridgeUrl', JSON.stringify(b)); } catch { /* opaque origin */ }
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', ev => window.__csp.push(`${ev.violatedDirective} ${ev.blockedURI}`));
      }, `http://localhost:${bport}`);
      const page = await ctx.newPage();
      const problems = [], toBridge = [], elsewhere = [];
      // Nothing leaves this computer: Google Fonts's stylesheet is answered empty here, and any other host is refused.
      await ctx.route(u => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), r => { const u = new URL(r.request().url()); if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); elsewhere.push(u.href); return r.abort(); });
      page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
      page.on('pageerror', err => problems.push(err.message));
      ctx.on('request', r => { if (r.url().startsWith(`http://localhost:${bport}/`)) toBridge.push(`${r.method()} ${new URL(r.url()).pathname}`); });
      await page.goto(url, { waitUntil: 'networkidle' });
      return { page, ctx, problems, toBridge, elsewhere };
    },
    async close() { await browser.close(); await e.close(); await site.close(); ez.close(); hostile.close(); wiz.close(); },
  };
}
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('iot page: finds the bridge, lists what answered, refuses an unticked device, adds and commands one, shows the law, pairs a fake phone', pageTest, async t => {
  const rig = await pageRig();
  try {
    const { page, ctx, problems, toBridge, elsewhere } = await rig.open(`${rig.site.base}/digital/iot-connect/`);
    await t.test('the bridge is contacted only once it is turned on or checked', async () => {
      assert.equal(await page.textContent('h1'), 'IoT Connect');
      assert.equal((await page.textContent('.prp-eyebrow')).replace(/\s+/g, ' ').trim(), 'Digital Science · IoT Connect');
      assert.deepEqual(toBridge, [], 'nothing reached the bridge before Check');
      assert.equal(await page.textContent('#bridge-state'), 'Off');
      await page.click('#bridge-check');
      await page.waitForSelector('#bridge-state.good');
      assert.equal(await page.textContent('#bridge-state'), 'Running · v2.0.0');
      assert.match(await page.textContent('#kpis'), /Setup steps ask in its window/);
      assert.ok(toBridge.every(r => r.startsWith('GET ')), `only reads so far: ${toBridge}`);
    });
    await t.test('the law words, exactly', async () => {
      await page.click('#tab-law');
      assert.equal(await page.textContent('#law-words'), LAW_44);
      assert.match(page.url(), /#tab=law$/);
    });
    await t.test('Look for devices lists each answer, not yet known to be yours, with a hostile name as plain text', async () => {
      await page.click('#tab-devices');
      rig.packets();
      await page.click('#discover');
      await page.waitForFunction(() => document.querySelectorAll('#candidates .cand').length === 3);
      const cards = await page.$$eval('#candidates .cand', els => els.map(el => ({ name: el.querySelector('.card-name').textContent, label: el.querySelector('.badge').textContent, says: el.querySelector('.says').textContent, text: el.textContent })));
      const ez = cards.find(c => c.name === 'EZCast U02');
      assert.equal(ez.label, 'Found on this network, not yet known to be yours');
      assert.match(ez.says, /^Hermes: EZCast receiver\./);
      assert.match(ez.text, /Route: DLNA \(UPnP AV\)/); assert.match(ez.text, /Windows key \+ K/);
      assert.ok(cards.some(c => c.name === '<img src=x onerror=alert(1)>'), 'the hostile name, as text');
      assert.equal(await page.locator('#candidates img').count(), 0, 'and no element made from it');
      assert.match(await page.textContent('#candidates'), /Copy announcement/);
    });
    await t.test('an unticked device is refused: Add stays off, and the bridge refuses it with the tick’s words', async () => {
      const card = page.locator('#candidates .cand', { hasText: 'EZCast U02' });
      assert.equal(await card.locator('button.add').isDisabled(), true);
      assert.equal(await card.locator('.tick').textContent(), W.TICK_OWNED);
      const id = await card.getAttribute('data-candidate');
      const refusal = await page.evaluate(async c => { try { await window.prpIot.client.post('/iot/add', { candidate: c }); return 'added'; } catch (err) { return err.message; } }, id);
      assert.equal(refusal, 'Tick "This device is mine, or I have its owner’s permission to control it" first.');
      // The browser logs the refused request (403) as a console error: that one was this test's own doing.
      await page.waitForTimeout(200);
      const own = problems.findIndex(p => /status of 403/.test(p));
      if (own >= 0) problems.splice(own, 1);
      assert.deepEqual(rig.e.questions, [], 'nothing reached the bridge window');
      assert.equal(rig.e.iot.state.devices.length, 0);
    });
    await t.test('ticked, it is added after Y in the bridge window, and a command goes and its answer shows', async () => {
      const card = page.locator('#candidates .cand', { hasText: 'EZCast U02' });
      await card.locator('input[aria-label="Room"]').fill('Living room');
      await card.locator('input.owned').check();
      await card.locator('button.add').click();
      await page.waitForSelector('#rooms .dev');
      assert.deepEqual(rig.e.questions, ['Add EZCast U02, 127.0.0.44, DLNA player?']);
      assert.equal(await page.textContent('#rooms .room-name'), 'Living room');
      const dev = page.locator('#rooms .dev', { hasText: 'EZCast U02' });
      await dev.locator('input[type="url"]').fill('http://127.0.0.10:8200/film.mp4');
      await dev.locator('button', { hasText: 'Play address' }).click();
      await page.waitForFunction(() => document.querySelector('#rooms .dev [data-answer]')?.textContent === 'Done.');
      assert.match(await dev.locator('.state').textContent(), /Playing$/);
      assert.deepEqual(rig.ez.calls.filter(c => c.action !== 'GET').map(c => c.action).slice(0, 2), ['SetAVTransportURI', 'Play']);
      await dev.locator('button[data-action="pause"]').click();
      await page.waitForFunction(() => /Paused|Done/.test(document.querySelector('#rooms .dev [data-answer]')?.textContent || '') && document.querySelector('#rooms .dev [data-answer]').dataset.tone === 'good');
      assert.ok(rig.ez.calls.some(c => c.action === 'Pause'));
      // The WiZ light too: switched on from the page.
      const wiz = page.locator('#candidates .cand', { hasText: 'WiZ' });
      await wiz.locator('input.owned').check();
      await wiz.locator('button.add').click();
      await page.waitForFunction(() => document.querySelectorAll('#rooms .dev').length === 2);
      const lamp = page.locator('#rooms .dev', { hasText: 'WiZ' });
      await lamp.locator('button[data-action="power"]', { hasText: 'On' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('#rooms .dev .state')].some(s => s.textContent.startsWith('On')));
      assert.deepEqual(rig.wiz.got.filter(x => x.method === 'setPilot').map(x => x.params), [{ state: true }]);
    });
    await t.test('the Remote tab pairs a fake phone by its QR address and Y; the phone’s signed command drives the light', async () => {
      await page.click('#tab-remote');
      await page.waitForFunction(() => !document.querySelector('#pair-phone').disabled);
      await page.click('#pair-phone');
      await page.waitForSelector('#pairing:not([hidden])');
      const code = await page.textContent('#pair-code'), url = await page.textContent('#pair-url');
      assert.match(code, /^\d{6}$/); assert.equal(code, rig.shown.at(-1), 'the same code as the bridge window');
      assert.equal(url, `http://127.0.0.1:${rig.lanPort}/remote#pair=${code}`);
      assert.match(await page.getAttribute('#qr svg', 'aria-label'), new RegExp(`QR code of ${url.replace(/[.?]/g, '\\$&')}`));
      assert.ok((await page.getAttribute('#qr svg path', 'd')).length > 500);
      // The phone: a 375 px touch screen, opening the address the code carries.
      const phoneCtx = await rig.browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
      const phone = await phoneCtx.newPage();
      const sigs = [];
      phone.on('request', r => { const s = r.headers()['x-vm-sig']; if (s) sigs.push({ s, method: r.method(), path: new URL(r.url()).pathname, body: r.postData() || '' }); });
      await phone.goto(url);
      assert.equal(await phone.inputValue('#code'), code, 'the code is filled in from the address');
      await phone.click('#pair-form button');
      await phone.waitForSelector('#remote:not([hidden])');
      assert.ok(rig.e.questions.some(q => /^A phone \(Android Chrome, 127\.0\.0\.1\) wants to pair\. Allow\?$/.test(q)), 'Y asked in the bridge window');
      await phone.selectOption('#device', { label: 'WiZ light bbcc' });
      await phone.click('button[data-a="power-off"]');
      await phone.waitForFunction(() => document.querySelector('#msg').textContent === 'Done.');
      assert.deepEqual(rig.wiz.got.filter(x => x.method === 'setPilot').map(x => x.params).at(-1), { state: false });
      // The phone signed as lib/sha256.js signs: recompute its last signature with the key it keeps.
      const { key, phone: id } = await phone.evaluate(() => JSON.parse(localStorage.getItem('vm.remote')));
      const last = sigs.at(-1), f = Object.fromEntries(last.s.split(',').map(x => x.split('=')));
      assert.equal(f.phone, id);
      assert.equal(f.sig, S.phoneSignature(key, last.method, last.path, last.body, f.ts, f.nonce));
      // Back on the page: the phone is listed, and Revoke ends it.
      await page.evaluate(() => window.prpIot.read('phones'));
      await page.waitForSelector('#phones tr');
      assert.equal(await page.locator('#phones tr').count(), 1);
      await page.click('#phones tr button');
      await page.waitForSelector('#phones-table[hidden]', { state: 'attached' });
      await phone.click('button[data-a="power-on"]');
      await phone.waitForFunction(() => /revoked|not paired/.test(document.querySelector('#msg').textContent));
      await phoneCtx.close();
    });
    await t.test('Hermes and the UNS tabs read the bridge', async () => {
      await page.click('#tab-hermes');
      await page.waitForFunction(() => document.querySelectorAll('#findings .finding').length >= 3);
      assert.match(await page.textContent('#hermes-state'), /Hermes Messenger: online/);
      assert.match(await page.textContent('#findings'), /Windows key \+ K/);
      assert.equal(await page.textContent('#ai-state'), 'Off');
      await page.click('#tab-uns');
      await page.waitForFunction(() => /None set/.test(document.querySelector('#uns-kpis').textContent));
    });
    await t.test('no address, hash or odd parameter makes the page send a change', async () => {
      const before = toBridge.filter(r => r.startsWith('POST')).length;
      for (const h of ['#tab=devices&discover=1', '#tab=remote&pair=1', '#pair=123456', '#tab=../iot/add', '#tab=devices&device=upnp-1&action=power', '#remote']) {
        await page.evaluate(x => { location.hash = x; }, h);
        await page.waitForTimeout(250);
      }
      await page.goto(`${rig.site.base}/digital/iot-connect/?action=discover#tab=devices&candidate=x&owned=true`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      assert.equal(toBridge.filter(r => r.startsWith('POST')).length, before, `no POST: ${toBridge.filter(r => r.startsWith('POST')).slice(before)}`);
    });
    await t.test('no console error or security-policy violation, and no sideways scroll on a desktop or a phone', async () => {
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 800 });
        for (const tab of ['overview', 'devices', 'remote', 'hermes', 'uns', 'law']) {
          await page.click(`#tab-${tab}`);
          await page.waitForTimeout(100);
          assert.ok(await noSideways(page), `no sideways scroll on ${tab} at ${width} px`);
        }
      }
      assert.deepEqual(await page.evaluate(() => window.__csp), []);
      assert.deepEqual(problems, []);
      assert.deepEqual(elsewhere, [], 'no other host was asked for anything');
    });
    await ctx.close();
  } finally { await rig.close(); }
});

test('iot page: inside the shell, at desktop and phone widths, with the shell’s header; the Hub’s Agents tab shows Hermes', pageTest, async () => {
  const rig = await pageRig();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 780 }]) {
      const { page, ctx, problems, elsewhere } = await rig.open(`${rig.site.base}/#/ds/iot-connect/remote`, { viewport });
      const frame = page.locator('#frames iframe.active');
      await frame.waitFor({ state: 'attached', timeout: 15000 });
      assert.equal(await frame.getAttribute('src'), 'digital/iot-connect/index.html#tab=remote');
      assert.match(await page.textContent('#crumbs'), /Digital Science.*IoT Connect/s);
      const inner = page.frameLocator('#frames iframe.active');
      await inner.locator('#tab-remote[aria-selected="true"]').waitFor();
      assert.equal(await inner.locator('.jdpi-returnbar').count(), 0, 'no standalone bar inside the shell');
      assert.ok(await noSideways(page), `the shell at ${viewport.width} px`);
      const f = page.frames().find(x => /digital\/iot-connect/.test(x.url()));
      assert.ok(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `the page in its frame at ${viewport.width} px`);
      assert.deepEqual(await f.evaluate(() => window.__csp), [], 'no violation of the page’s policy inside the shell');
      if (viewport.width > 900) assert.ok(await page.locator('#nav details[data-suite="ds"] a', { hasText: 'IoT Connect' }).count(), 'in the sidebar under Digital Science');
      assert.deepEqual(problems, []); assert.deepEqual(elsewhere, []);
      await ctx.close();
    }
    const { page, ctx, problems, elsewhere } = await rig.open(`${rig.site.base}/integration/#tab=agents`);
    await page.waitForSelector('#agents .agent');
    assert.equal(await page.textContent('#agents .agent h3'), 'Hermes Messenger');
    assert.equal(await page.textContent('#agents-security'), HUB_LINE);
    assert.match(await page.getAttribute('#agents .agent a.prp-btn', 'href'), /#\/ds\/iot-connect\/hermes$/);
    assert.match(await page.textContent('#agents .agent-state'), /only when you press Check/);
    await page.click('#agents [data-check]');
    await page.waitForFunction(() => /online/.test(document.querySelector('#agents .agent-state').textContent));
    assert.match(await page.textContent('#agents .agent-state'), /^Hermes Messenger: online · \d+ rules · 0 findings · AI off$/);
    assert.deepEqual(problems, []); assert.deepEqual(elsewhere, []);
    await ctx.close();
  } finally { await rig.close(); }
});

/* =====================================================================================================================
 * Last: nothing in this file touched the network
 * ===================================================================================================================== */
test('iot: no socket, listen, bind or datagram in this file left loopback', () => {
  assert.deepEqual(tripwire.violations, []);
});

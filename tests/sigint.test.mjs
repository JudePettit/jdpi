// SIGINT Dashboard (Realtime Intelligence): pure helpers (geodesy, NMEA, pass prediction, feed normalisers, Meshtastic
// protobuf framing, Markdown), the PRP bridge and edge proxy, the content files, and a page smoke test.
//   node --test tests/sigint.test.mjs
//   JDPI_URL=http://localhost:8787 node --test tests/sigint.test.mjs      (also runs the page test in Edge)
//   SIGINT_LIVE=1 node --test tests/sigint.test.mjs                        (also checks the public feeds and their CORS)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { distanceKm, bearingDeg, destination, bboxAround, compass, maidenhead, fromMaidenhead, parseCoord, fmtLatLon, kmToNm } from '../sigint/lib/geo.js';
import { esc, num, fmt, ago, duration, hostKind, localFetchOptions, mixedContentProblem, explainError } from '../sigint/lib/util.js';
import { checksumOk, parseSentence, nmeaCoord, createGnssState, updateGnss, pruneGnss, gnssSummary, interferenceHint, lineSplitter, constellationOfPrn } from '../sigint/lib/nmea.js';
import { findPasses, passTrack, skyXY, orbitClass, makeLookAt, satrecFromOmm } from '../sigint/lib/passes.js';
import * as F from '../sigint/lib/feeds.js';
import * as M from '../sigint/lib/meshtastic.js';
import { renderMarkdown, inline, slug } from '../sigint/lib/md.js';
import { SAT_META, satMeta, RECEIVERS, DIRECTORIES, LINKS, NOAA_POES_END } from '../sigint/lib/catalog.js';
import * as B from '../sigint/bridge/prp-bridge.mjs';
import { proxyPath, onRequestGet } from '../sigint/edge/adsb-proxy.js';

const read = p => readFileSync(new URL(`../sigint/${p}`, import.meta.url), 'utf8');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const nmea = body => { let x = 0; for (const c of body) x ^= c.charCodeAt(0); return `$${body}*${x.toString(16).toUpperCase().padStart(2, '0')}`; };

/* ---- Geodesy ------------------------------------------------------------------------------------------------------ */
test('geo: distances, bearings, boxes and compass points', () => {
  near(distanceKm(53.3498, -6.2603, 51.5074, -0.1278), 464, 3, 'Dublin–London km');
  near(bearingDeg(53.3498, -6.2603, 51.5074, -0.1278), 113.8, 0.5, 'Dublin→London initial bearing');
  near(bearingDeg(0, 0, 10, 0), 0, 1e-9); near(bearingDeg(0, 0, 0, 10), 90, 1e-9);
  const d = destination(53.35, -6.26, 90, 100);
  near(distanceKm(53.35, -6.26, d.lat, d.lon), 100, 0.01, 'destination round trip');
  const b = bboxAround(53.35, -6.26, 100);
  assert.ok(b.south < 53.35 && b.north > 53.35 && b.west < -6.26 && b.east > -6.26);
  near(distanceKm(b.south, -6.26, 53.35, -6.26), 100, 0.5, 'box half-height is the radius');
  const p = bboxAround(89.9, 0, 500);
  assert.equal(p.north, 90); assert.ok(p.west >= -180 && p.east <= 180);
  assert.equal(compass(0), 'N'); assert.equal(compass(350), 'N'); assert.equal(compass(22.5), 'NNE'); assert.equal(compass(225, 8), 'SW'); assert.equal(compass(NaN), '–');
  near(kmToNm(1.852), 1, 1e-12);
});

test('geo: Maidenhead locators and coordinate parsing', () => {
  assert.equal(maidenhead(41.7148, -72.7272), 'FN31pr', 'W1AW, Newington CT');
  assert.equal(maidenhead(53.3498, -6.2603, 4), 'IO63');
  assert.equal(maidenhead(53.3498, -6.2603), 'IO63ui');
  assert.equal(maidenhead(-90, -180), 'AA00aa'); assert.equal(maidenhead(90, 180, 4), 'RR99');
  assert.equal(maidenhead(NaN, 0), '');
  const c = fromMaidenhead('IO63ui');
  assert.equal(maidenhead(c.lat, c.lon), 'IO63ui', 'centre of a square maps back to it');
  assert.equal(fromMaidenhead('ZZ00'), null); assert.equal(fromMaidenhead('IO6'), null);
  near(parseCoord('53.35'), 53.35, 1e-9); near(parseCoord('-6.26', 'lon'), -6.26, 1e-9);
  near(parseCoord("53°21'N"), 53.35, 1e-9); near(parseCoord('6 15 36 W', 'lon'), -6.26, 1e-9); near(parseCoord('6,26W', 'lon'), -6.26, 1e-9);
  assert.equal(parseCoord('91'), null); assert.equal(parseCoord('6W', 'lat'), null, 'E/W is not a latitude'); assert.equal(parseCoord('abc'), null); assert.equal(parseCoord('53 61'), null);
  assert.equal(fmtLatLon(53.3498, -6.2603, 2), '53.35° N, 6.26° W');
});

test('util: formatting and the local-network rules', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(num('12.5'), 12.5); assert.equal(num(''), null); assert.equal(num('x'), null); assert.equal(num(NaN), null);
  assert.equal(fmt(1234.5, 1), '1,234.5'); assert.equal(fmt(null), '–');
  assert.equal(ago(500), 'now'); assert.equal(ago(45e3), '45 s ago'); assert.equal(ago(5 * 60e3), '5 min ago'); assert.equal(ago(3 * 3600e3), '3 h ago');
  assert.equal(duration(612), '10 min 12 s'); assert.equal(duration(45), '45 s');
  assert.equal(hostKind('http://localhost:8080/x'), 'loopback'); assert.equal(hostKind('http://127.0.0.1:1'), 'loopback'); assert.equal(hostKind('http://[::1]:8073'), 'loopback');
  assert.equal(hostKind('http://192.168.1.20/'), 'local'); assert.equal(hostKind('http://raspberrypi.local/'), 'local'); assert.equal(hostKind('http://pi:8080/'), 'local'); assert.equal(hostKind('http://172.20.0.5/'), 'local');
  assert.equal(hostKind('https://api.adsb.lol/'), 'public'); assert.equal(hostKind('http://172.32.0.1/'), 'public'); assert.equal(hostKind('nope'), 'invalid');
  assert.deepEqual(localFetchOptions('http://raspberrypi.local/x'), { targetAddressSpace: 'local' });
  assert.deepEqual(localFetchOptions('http://localhost:8080/x'), {}, 'loopback needs no option (and older Chrome rejects unknown values)');
  assert.equal(mixedContentProblem('http://localhost:8080/x', 'https:'), '');
  assert.equal(mixedContentProblem('http://192.168.1.2/x', 'https:'), '', 'private addresses are left to Local Network Access');
  assert.match(mixedContentProblem('http://example.com/x', 'https:'), /HTTPS/);
  assert.equal(mixedContentProblem('http://example.com/x', 'http:'), '');
  assert.match(mixedContentProblem('ftp://x', 'https:'), /http/);
  assert.equal(explainError(Object.assign(new Error('x'), { name: 'AbortError' })), 'Timed out');
  assert.match(explainError(new TypeError('Failed to fetch')), /CORS/);
});

/* ---- NMEA ----------------------------------------------------------------------------------------------------------- */
test('nmea: checksums, coordinates and sentence types', () => {
  assert.ok(checksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47'));
  assert.ok(!checksumOk('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48'));
  assert.equal(parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48').type, 'BAD');
  assert.equal(parseSentence(''), null); assert.equal(parseSentence('hello'), null);
  near(nmeaCoord('4807.038', 'N'), 48.1173, 1e-4); near(nmeaCoord('01131.000', 'W'), -11.516667, 1e-6); assert.equal(nmeaCoord('', 'N'), null);
  const gga = parseSentence('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');
  assert.deepEqual([gga.type, gga.quality, gga.numSv, gga.hdop, gga.alt], ['GGA', 1, 8, 0.9, 545.4]);
  const rmc = parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A');
  assert.deepEqual([rmc.valid, rmc.sogKn, rmc.cog, rmc.date], [true, 22.4, 84.4, '230394']);
  const gsa = parseSentence(nmea('GNGSA,A,3,05,13,15,,,,,,,,,,1.30,0.72,1.08,1'));
  assert.deepEqual([gsa.fix, gsa.prns, gsa.pdop, gsa.hdop, gsa.vdop, gsa.systemId], [3, [5, 13, 15], 1.3, 0.72, 1.08, 1]);
  const gsv = parseSentence(nmea('GAGSV,1,1,03,04,52,200,41,09,30,100,,36,12,230,22,7'));
  assert.equal(gsv.signalId, '7', 'NMEA 4.10 signal id');
  assert.deepEqual(gsv.sats, [{ prn: 4, el: 52, az: 200, snr: 41 }, { prn: 9, el: 30, az: 100, snr: null }, { prn: 36, el: 12, az: 230, snr: 22 }]);
  assert.equal(parseSentence(nmea('GPTXT,01,01,02,ANTSTATUS=OPEN')).text, 'ANTSTATUS=OPEN');
  assert.equal(constellationOfPrn(70), 'GLONASS'); assert.equal(constellationOfPrn(40, 'GP'), 'SBAS'); assert.equal(constellationOfPrn(305), 'Galileo'); assert.equal(constellationOfPrn(12, 'GB'), 'BeiDou');
});

test('nmea: GNSS state assembles satellites, used flags, signals and indicators', () => {
  const st = createGnssState();
  const feed = (body, t = 1000) => updateGnss(st, parseSentence(nmea(body)), t);
  feed('GPGSV,2,1,05,02,64,112,45,05,22,310,38,12,48,250,44,13,15,045,29,1');
  assert.equal(st.sats.size, 0, 'nothing commits until the last message of the cycle');
  feed('GPGSV,2,2,05,44,26,165,33,1');
  feed('GLGSV,1,1,02,66,35,060,36,67,58,150,40,1');
  feed('GPGSV,1,1,02,02,64,112,48,05,22,310,,8'); // the same GPS satellites on L5: best C/N0 wins
  feed('GNGSA,A,3,02,05,12,,,,,,,,,,1.28,0.71,1.06,1');
  feed('GNGSA,A,3,66,67,,,,,,,,,,,1.28,0.71,1.06,2');
  feed('GNGGA,123519.00,5128.61400,N,00000.03000,W,1,05,0.71,46.2,M,45.6,M,,');
  assert.equal(st.sats.size, 7);
  assert.equal(st.sats.get('GPS:2').snr, 48, 'L5 reading 48 beats L1 45');
  assert.equal(st.sats.get('SBAS:44').sys, 'SBAS');
  assert.deepEqual([...st.sats.values()].filter(s => s.used).map(s => `${s.sys}${s.prn}`).sort(), ['GLONASS66', 'GLONASS67', 'GPS12', 'GPS2', 'GPS5']);
  const sum = gnssSummary(st);
  assert.deepEqual([sum.fix, sum.inView, sum.used, sum.hdop], ['3D', 7, 5, 0.71]);
  near(sum.cn0Top4, (48 + 44 + 40 + 38) / 4, 1e-9);
  assert.equal(interferenceHint(sum).level, 'good');
  // A new L5 cycle without satellite 5 removes only its L5 reading.
  feed('GPGSV,1,1,01,02,64,112,47,8', 2000);
  assert.equal(st.sats.get('GPS:5').snr, 38);
  // Jamming: everything weak, no fix.
  const jam = createGnssState();
  for (const b of ['GPGSV,2,1,05,02,64,112,14,05,22,310,12,12,48,250,15,13,15,045,10,1', 'GPGSV,2,2,05,20,40,100,13,1', 'GNGGA,123520.00,,,,,0,00,,,M,,M,,']) updateGnss(jam, parseSentence(nmea(b)), 5000);
  assert.equal(interferenceHint(gnssSummary(jam)).level, 'bad');
  pruneGnss(jam, 20000);
  assert.equal(jam.sats.size, 0, 'stale satellites are dropped');
  const lost = createGnssState();
  for (const q of [1, 1, 0, 1, 0]) updateGnss(lost, parseSentence(nmea(`GPGGA,1,5128.6,N,00000.0,W,${q},05,1.0,10,M,0,M,,`)), 1);
  assert.equal(lost.fixLosses, 2);
  updateGnss(lost, parseSentence(nmea('GPTXT,01,01,02,ANTSTATUS=SHORT')), 1);
  assert.equal(lost.antenna, 'SHORT');
  const split = lineSplitter();
  assert.deepEqual(split('$GPGGA,1*00\r\n$GPR'), ['$GPGGA,1*00']);
  assert.deepEqual(split('MC,2*00\n'), ['$GPRMC,2*00']);
});

/* ---- Pass prediction ------------------------------------------------------------------------------------------------- */
test('passes: finds rises, peaks and sets of a synthetic orbit', () => {
  const t0 = Date.UTC(2026, 9, 28, 0, 0), P = 100 * 60e3, tc = t0 + 30 * 60e3;
  // A 10-minute pass every 100 minutes, peaking at 40° due south; elevation is a parabola in minutes from the peak.
  const look = t => { let dt = ((t - tc) % P + P) % P; if (dt > P / 2) dt -= P; const m = dt / 60e3; return { az: 180 + m * 10, el: 40 - 1.6 * m * m }; };
  const passes = findPasses(look, { start: t0, hours: 6, minEl: 10 });
  assert.equal(passes.length, 4);
  passes.forEach((p, i) => {
    near(p.tca, tc + i * P, 1500, `peak ${i}`);
    near(p.aos, tc + i * P - 5 * 60e3, 1500, `rise ${i}`); near(p.los, tc + i * P + 5 * 60e3, 1500, `set ${i}`);
    near(p.maxEl, 40, 0.01); near(p.tcaAz, 180, 0.5); near(p.aosAz, 130, 0.5); near(p.losAz, 230, 0.5);
    near(p.duration, 600, 3); assert.equal(p.inProgress, false); assert.equal(p.truncated, false);
  });
  assert.equal(findPasses(look, { start: t0, hours: 6, minEl: 45 }).length, 0, 'minimum elevation filter');
  const mid = findPasses(look, { start: tc, hours: 1 });
  assert.equal(mid[0].inProgress, true); assert.equal(mid[0].aos, tc);
  const cut = findPasses(look, { start: t0, hours: 0.5 + 1 / 60 });
  assert.equal(cut.at(-1).truncated, true);
  const track = passTrack(look, passes[0], 20);
  assert.equal(track.length, 21); assert.ok(track.every(p => p.el >= 0 && p.az >= 0 && p.az < 360));
  assert.ok(findPasses(() => ({ az: NaN, el: NaN }), { start: t0, hours: 2 }).length === 0, 'unpropagatable orbits give no passes');
  const z = skyXY(123, 90, 100, 150, 150), n = skyXY(0, 0, 100, 150, 150), e = skyXY(90, 0, 100, 150, 150);
  near(z.x, 150, 1e-9); near(z.y, 150, 1e-9); near(n.y, 50, 1e-9); near(e.x, 250, 1e-9);
});

test('passes: orbit classes and the satellite.js adapter', () => {
  assert.equal(orbitClass({ MEAN_MOTION: 15.49, ECCENTRICITY: 0.0007 }), 'leo');
  assert.equal(orbitClass({ MEAN_MOTION: 1.0027, ECCENTRICITY: 0.0002 }), 'geo');
  assert.equal(orbitClass({ MEAN_MOTION: 2.0, ECCENTRICITY: 0.7 }), 'meo');
  assert.equal(orbitClass({ MEAN_MOTION: 'x' }), 'unknown');
  // A stub with satellite.js's call shapes: radians in, radians out.
  const stub = {
    propagate: () => ({ position: { x: 1, y: 2, z: 3 } }), gstime: () => 0, eciToEcf: p => p,
    ecfToLookAngles: (gd, ecf) => { assert.ok(Math.abs(gd.latitude - 53.35 * Math.PI / 180) < 1e-12); assert.deepEqual(ecf, { x: 1, y: 2, z: 3 }); return { azimuth: Math.PI, elevation: Math.PI / 6, rangeSat: 1200 }; },
    json2satrec: omm => ({ satnum: omm.NORAD_CAT_ID }),
  };
  const look = makeLookAt(stub, {}, { lat: 53.35, lon: -6.26 });
  const r = look(Date.now());
  near(r.az, 180, 1e-9); near(r.el, 30, 1e-9); assert.equal(r.rangeKm, 1200);
  assert.ok(Number.isNaN(makeLookAt({ ...stub, propagate: () => ({ position: false }) }, {}, { lat: 0, lon: 0 })(0).el), 'decayed satellites give NaN');
  assert.deepEqual(satrecFromOmm(stub, { NORAD_CAT_ID: 25544 }), { satnum: 25544 });
  assert.throws(() => satrecFromOmm({}, {}), /json2satrec/);
});

/* ---- Feed normalisers ----------------------------------------------------------------------------------------------------- */
test('feeds: aircraft from readsb, the adsb.lol v2 API, old dump1090 and OpenSky', () => {
  const readsb = F.normaliseAircraft({ now: 1793147582.5, messages: 1234, aircraft: [
    { hex: '4CA87C', flight: 'EIN12A  ', r: 'EI-DEO', t: 'A320', alt_baro: 36000, gs: 455, track: 92.5, baro_rate: -64, squawk: '7700', lat: 53.4, lon: -6.0, seen: 0.4, rssi: -12.5, dbFlags: 0 },
    { hex: '~2a0001', alt_baro: 'ground', lat: 53.42, lon: -6.27, dbFlags: 9 },
    { hex: 'abcdef', lat: 95, lon: 0 }, { noHex: true }] });
  assert.equal(readsb.format, 'readsb'); assert.equal(readsb.messages, 1234); assert.equal(readsb.now, 1793147582500);
  assert.equal(readsb.aircraft.length, 3);
  const [a, g, bad] = readsb.aircraft;
  assert.deepEqual([a.hex, a.flight, a.reg, a.type, a.altFt, a.gsKt, a.vsFpm, a.alert], ['4ca87c', 'EIN12A', 'EI-DEO', 'A320', 36000, 455, -64, 'Emergency (7700)']);
  assert.deepEqual([g.onGround, g.altFt, g.military, g.ladd, g.pia], [true, 0, true, true, false]);
  assert.equal(bad.lat, null, 'impossible positions are dropped');
  const v2 = F.normaliseAircraft({ ac: [{ hex: '4078fe', flight: 'EXS49L ', alt_baro: 37000, gs: 455, lat: 52.98, lon: -6.37, dbFlags: 4 }], now: 1793147582002, total: 1 });
  assert.equal(v2.format, 'adsb-v2'); assert.equal(v2.now, 1793147582002); assert.equal(v2.aircraft[0].pia, true);
  const old = F.normaliseAircraft({ now: 1, aircraft: [{ hex: 'aa', altitude: 12000, speed: 300, vert_rate: 500, lat: 1, lon: 2 }] });
  assert.deepEqual([old.aircraft[0].altFt, old.aircraft[0].gsKt, old.aircraft[0].vsFpm], [12000, 300, 500]);
  const os = F.normaliseAircraft({ time: 1793147580, states: [['4bb183', 'THY84U ', 'Turkey', 1793147579, 1793147580, -6.3062, 52.8914, 11887.2, false, 282.95, 105.5, -0.65, null, 11978.64, '2225', false, 0]] });
  const s = os.aircraft[0];
  assert.equal(os.format, 'opensky');
  near(s.altFt, 39000, 2); near(s.gsKt, 550, 0.5); near(s.vsFpm, -128, 0.5); assert.equal(s.flight, 'THY84U'); assert.equal(s.seenS, 0);
  assert.deepEqual(F.normaliseAircraft(null).aircraft, []); assert.deepEqual(F.normaliseAircraft({ foo: 1 }).aircraft, []);
  assert.equal(F.altitudeBand({ onGround: true }), 0); assert.equal(F.altitudeBand({ altFt: 500 }), 1); assert.equal(F.altitudeBand({ altFt: 15000 }), 3); assert.equal(F.altitudeBand({ altFt: 41000 }), 5);
  assert.equal(F.squawkAlert('7500'), 'Unlawful interference (7500)'); assert.equal(F.squawkAlert('1200'), null);
});

test('feeds: ships from AIS-catcher and the bridge’s aisstream.io snapshot', () => {
  const ac = F.normaliseShips({ count: 3, station: { lat: 53.3, lon: -6.2 }, ships: [
    { mmsi: 250001234, shipname: 'IRISH FERRY@@', callsign: 'EIAB2', shiptype: 60, speed: 18.2, cog: 95.4, heading: 96, status: 0, destination: 'HOLYHEAD', lat: 53.35, lon: -6.1, last_signal: 4 },
    { mmsi: 235000001, shipname: 'BULKER', shiptype: 70, speed: 102.3, cog: 360, heading: 511, lat: 91, lon: 181 },
    { mmsi: 'x' }] });
  assert.equal(ac.ships.length, 2); assert.deepEqual(ac.station, { lat: 53.3, lon: -6.2 });
  const [p, c] = ac.ships;
  assert.deepEqual([p.name, p.typeLabel, p.group, p.sogKt, p.heading, p.status, p.ageS], ['IRISH FERRY', 'Passenger', 'passenger', 18.2, 96, 0, 4]);
  assert.deepEqual([c.lat, c.sogKt, c.cog, c.heading, c.group], [null, null, null, null, 'cargo'], 'AIS “not available” values become null');
  const br = F.normaliseShips({ source: 'aisstream', ships: [{ mmsi: 366000001, name: 'TUG', lat: 40, lon: -70, sog: 3, cog: 10, heading: 12, status: 5, type: 52, ageS: 30 }] });
  assert.deepEqual([br.ships[0].typeLabel, br.ships[0].group, br.ships[0].sogKt, br.ships[0].status], ['Tug', 'other', 3, 5]);
  assert.equal(F.shipTypeLabel(84), 'Tanker'); assert.equal(F.shipTypeLabel(30), 'Fishing'); assert.equal(F.shipTypeLabel(null), 'Unknown');
  assert.equal(F.shipGroup(45), 'passenger'); assert.equal(F.shipGroup(37), 'other');
  assert.equal(F.SHIP_GROUPS.length, 4, 'three colours, then Other');
});

test('feeds: NOAA SWPC products in their current and older formats', () => {
  const obj = F.normaliseKp([{ time_tag: '2026-10-21T00:00:00', Kp: 3.67, a_running: 22 }, { time_tag: '2026-10-21T03:00:00', Kp: 4.0 }]);
  assert.deepEqual(obj.map(r => [r.kp, r.kind]), [[3.67, 'observed'], [4, 'observed']]);
  assert.equal(obj[0].t, Date.UTC(2026, 9, 21), 'SWPC times are UTC');
  const rows = F.normaliseKp([['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-10-21 00:00:00.000', '3.67', '22', '8']]);
  assert.deepEqual([rows[0].kp, rows[0].t], [3.67, Date.UTC(2026, 9, 21)]);
  const fc = F.normaliseKp([{ time_tag: '2026-10-30T21:00:00', kp: 2, observed: 'predicted', noaa_scale: null }, { time_tag: '2026-10-30T18:00:00', kp: 5.33, observed: 'estimated' }]);
  assert.deepEqual(fc.map(r => r.kind), ['estimated', 'predicted'], 'sorted by time');
  assert.deepEqual(F.latestKp1m([{ time_tag: '2026-10-27T18:34:00', kp_index: 1, estimated_kp: 0.67 }]), { t: Date.UTC(2026, 9, 27, 18, 34), kp: 0.67 });
  assert.deepEqual([0, 4.67, 5, 6.33, 7, 8.67, 9].map(F.kpToG), [0, 0, 1, 2, 3, 4, 5]);
  assert.equal(F.kpWord(1), 'Quiet'); assert.equal(F.kpWord(5.33), 'Storm G1');
  assert.deepEqual([3.24e-7, 1.2e-4, 2.5e-5, 9.99e-6, 5e-9, 0].map(F.xrayClass), ['B3.2', 'X1.2', 'M2.5', 'C9.9', 'A0.0', '–']);
  const x = F.normaliseXray([{ time_tag: '2026-10-28T00:44:00Z', energy: '0.1-0.8nm', flux: 3.2e-7 }, { time_tag: '2026-10-28T00:44:00Z', energy: '0.05-0.4nm', flux: 1e-9 }, { time_tag: 'x', energy: '0.1-0.8nm', flux: 1 }]);
  assert.equal(x.length, 1); assert.equal(x[0].flux, 3.2e-7);
  const wind = F.normaliseWind([
    { time_tag: '2026-10-28T00:27:00', active: false, source: 'IMAP', proton_speed: 365 },
    { time_tag: '2026-10-28T00:27:00', active: true, source: 'SOLAR1', proton_speed: 372, proton_density: 7.9 },
    { time_tag: '2026-10-28T00:26:00', active: true, source: 'SOLAR1', proton_speed: 370 }]);
  assert.deepEqual(wind.map(w => [w.speed, w.source]), [[370, 'SOLAR1'], [372, 'SOLAR1']], 'active spacecraft only, oldest first');
  assert.deepEqual(F.normaliseMag([{ time_tag: '2026-10-28T00:31:00', active: true, bt: 5.74, bz_gsm: 0.83, bz_gse: 0.21 }])[0], { t: Date.UTC(2026, 9, 28, 0, 31), bt: 5.74, bz: 0.83, source: undefined });
  const sc = F.normaliseScales({ '-1': { DateStamp: '2026-10-27', TimeStamp: '00:00:00', R: { Scale: '1', Text: 'minor' }, S: { Scale: '0' }, G: { Scale: '0' } },
    0: { DateStamp: '2026-10-28', TimeStamp: '00:45:00', R: { Scale: '0', Text: 'none' }, S: { Scale: '0', Text: 'none' }, G: { Scale: '2', Text: 'moderate' } },
    1: { DateStamp: '2026-10-28', R: { MinorProb: '5', MajorProb: '1' }, S: { Prob: '1' }, G: { Scale: '0' } } });
  assert.deepEqual([sc.R.scale, sc.G.scale, sc.G.text, sc.days[0].rMinor, sc.days[0].sProb, sc.yesterday.R.scale], [0, 2, 'moderate', 5, 1, 1]);
  const al = F.normaliseAlerts([{ product_id: 'EF3A', issue_datetime: '2026-10-27 11:38:11.233', message: 'Space Weather Message Code: ALTEF3\r\nSerial Number: 3759\r\n\r\nCONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu\n' },
    { product_id: 'K05W', issue_datetime: '2026-10-28 01:00:00.000', message: 'WARNING: Geomagnetic K-index of 5 expected' }]);
  assert.deepEqual(al.map(a => a.title), ['WARNING: Geomagnetic K-index of 5 expected', 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu']);
});

test('feeds: WSPR query and rows, Meshtastic /json/nodes, OpenWebRX status, downsampling', () => {
  const q = F.wsprQuery(53.35, -6.26, { minutes: 60, boxDeg: 4 });
  assert.match(q, /FROM wspr\.rx WHERE time > now\(\) - INTERVAL 60 MINUTE AND rx_lat BETWEEN 49\.35 AND 57\.35 AND rx_lon BETWEEN -12\.9\d AND 0\.4\d GROUP BY band ORDER BY band FORMAT JSON$/);
  assert.match(F.wsprQuery(0, 0, { minutes: 1e6 }), /INTERVAL 360 MINUTE/, 'the window is capped');
  assert.deepEqual(F.normaliseWspr({ data: [{ band: 14, spots: '120', receivers: 9, transmitters: 33, max_km: 9000, snr: -18 }, { band: -1, spots: 2 }] }).map(r => [r.label, r.spots]), [['20 m', 120], ['LF', 2]]);
  const nodes = F.normaliseMeshNodes({ data: { nodes: [
    { hw_model: 43, id: '!a1b2c3d4', last_heard: 1793147000, long_name: 'Hill relay', short_name: 'HILL', position: { altitude: 120, latitude: 53.3, longitude: -6.4 }, snr: 6.25, via_mqtt: 'false' },
    { hw_model: 9, id: '!00000001', long_name: 'No GPS', position: null, via_mqtt: 'true' }] }, status: 'ok' });
  assert.deepEqual([nodes[0].num, nodes[0].lat, nodes[0].hwModel, nodes[0].viaMqtt], [0xa1b2c3d4, 53.3, 43, false]);
  assert.deepEqual([nodes[1].lat, nodes[1].viaMqtt], [null, true]);
  const ow = F.normaliseOwrxStatus({ receiver: { name: 'Shed SDR', admin: 'me@example.org', gps: { lat: 53.3, lon: -6.2 }, location: 'Dublin' }, max_clients: 20, version: 'v1.2.3',
    sdrs: [{ name: 'RTL', type: 'RtlSdrSource', profiles: [{ name: '2 m', center_freq: 145e6, sample_rate: 2.4e6 }] }] });
  assert.deepEqual([ow.name, ow.version, ow.admin, ow.sdrs[0].profiles[0].name], ['Shed SDR', 'v1.2.3', null, '2 m'], 'the admin e-mail is not kept');
  const pts = Array.from({ length: 1440 }, (_, i) => ({ t: i, v: i === 700 ? 1e-4 : 1e-7 }));
  const ds = F.downsample(pts, 300);
  assert.ok(ds.length <= 310 && ds.some(p => p.v === 1e-4), 'a flare spike survives downsampling');
  assert.ok(ds.every((p, i) => !i || p.t >= ds[i - 1].t), 'still in time order');
});

/* ---- Meshtastic ----------------------------------------------------------------------------------------------------------- */
test('meshtastic: frames, FromRadio decoding and the node database', () => {
  assert.deepEqual([...M.wantConfigFrame(1234)], [0x94, 0xc3, 0, 3, 0x18, 0xd2, 0x09]);
  const user = M.pb().string(1, '!a1b2c3d4').string(2, 'Hill relay').string(3, 'HILL').varint(5, 43);
  const pos = M.pb().sfixed32(1, 533500000).sfixed32(2, -62600000).varint(3, 120).fixed32(4, 1793147000).varint(23, 13);
  const metrics = M.pb().varint(1, 87).float(2, 4.05).float(3, 12.5);
  const info = M.pb().varint(1, 0xa1b2c3d4).message(2, user).message(3, pos).float(4, 6.25).fixed32(5, 1793147100).message(6, metrics).varint(9, 1);
  const fromInfo = M.pb().varint(1, 7).message(4, info).done();
  const d = M.decodeFromRadio(fromInfo);
  assert.equal(d.kind, 'nodeInfo');
  assert.deepEqual([d.node.num, d.node.user.longName, d.node.user.hwModel, d.node.position.lat, d.node.position.lon, d.node.position.alt, d.node.position.precisionBits, d.node.lastHeard, d.node.hopsAway, d.node.deviceMetrics.battery],
    [0xa1b2c3d4, 'Hill relay', 43, 53.35, -6.26, 120, 13, 1793147100, 1, 87]);
  near(d.node.snr, 6.25, 1e-6); near(d.node.deviceMetrics.voltage, 4.05, 1e-6);
  // A position packet from another node, with a negative RSSI (a ten-byte varint) and two hops.
  const posPayload = M.pb().sfixed32(1, 534000000).sfixed32(2, -61000000).done();
  const packet = M.pb().fixed32(1, 0x0000beef).fixed32(2, M.BROADCAST).message(4, M.pb().varint(1, M.PORT.POSITION_APP).bytes(2, posPayload)).float(8, -7.5).varint(9, 1).varint(12, -95).varint(15, 3);
  const fromPacket = M.pb().message(2, packet).done();
  const p = M.decodeFromRadio(fromPacket);
  assert.deepEqual([p.kind, p.packet.from, p.packet.rxRssi, p.packet.hopStart, p.packet.decoded.portnum], ['packet', 0xbeef, -95, 3, 3]);
  const text = M.pb().message(2, M.pb().fixed32(1, 0x1234).message(4, M.pb().varint(1, M.PORT.TEXT_MESSAGE_APP).bytes(2, new TextEncoder().encode('private words')))).done();
  // Framing: debug text, a frame split across chunks, then a second frame.
  const frames = [], texts = [];
  const parse = M.frameParser(f => frames.push(f), t => texts.push(t));
  const f1 = M.frame(fromInfo), f2 = M.frame(fromPacket), f3 = M.frame(text);
  const stream = new Uint8Array([...new TextEncoder().encode('INFO | booting\r\n'), ...f1, ...f2, ...f3]);
  parse(stream.slice(0, 20)); parse(stream.slice(20, 41)); parse(stream.slice(41));
  assert.equal(frames.length, 3); assert.deepEqual(texts, ['INFO | booting']);
  assert.deepEqual([...frames[0]], [...fromInfo]);
  const db = new Map();
  for (const f of frames) M.applyFromRadio(db, M.decodeFromRadio(f), 1793147200);
  M.applyFromRadio(db, M.decodeFromRadio(M.pb().message(3, M.pb().varint(1, 0xa1b2c3d4)).done()));
  assert.equal(db.myNodeNum, 0xa1b2c3d4);
  const beef = db.get(0xbeef);
  assert.deepEqual([beef.id, beef.lat, beef.lon, beef.rssi, beef.hopsAway, beef.snr], ['!0000beef', 53.4, -6.1, -95, 2, -7.5]);
  assert.ok(!Object.values(db.get(0x1234)).some(v => String(v).includes('private')), 'text messages are never decoded into the database');
  assert.equal(M.hwModelName(9), 'RAK4631'); assert.equal(M.hwModelName(43), 'HELTEC V3'); assert.equal(M.hwModelName(4), 'TBEAM'); assert.equal(M.hwModelName(110), 'HELTEC V4');
  assert.equal(M.hwModelName(152), 'HELTEC MESH POCKET V2'); assert.equal(M.hwModelName(255), 'Private hardware'); assert.equal(M.hwModelName(999), 'Model 999'); assert.equal(M.hwModelName(6), 'TBEAM V0.7');
  assert.deepEqual([...M.fields(new Uint8Array([0x08]))], [], 'a truncated varint yields nothing rather than throwing');
});

/* ---- Markdown ------------------------------------------------------------------------------------------------------------ */
test('markdown: the subset the content files use, safely escaped', () => {
  const src = '# Kind {#k}\nIntro <script>alert(1)</script> with `<b>` and **bold**.\n\n## Recipe {#r .decoders .x}\n- **For:** one\n- **OS:** two\n  - nested\n\n1. Step:\n   ```\n   sudo apt install x\n\n   echo <y>\n   ```\n2. Next\n\n> [!bad] **Never** do this.\n\n| A | B |\n|---|--:|\n| a \\| pipe | 2 |\n\n<figure id="f"><svg></svg>\n<figcaption>Cap</figcaption></figure>\n\n- [ ] one\n- [x] two\n';
  const { html, toc } = renderMarkdown(src, { sectionLevel: 2 });
  assert.ok(!html.includes('<script>'), 'raw tags in text are escaped');
  assert.match(html, /&lt;script&gt;/); assert.match(html, /<code>&lt;b&gt;<\/code>/);
  assert.match(html, /<section class="md-sec decoders x" id="r" data-cats="decoders x">\n<h2>Recipe<\/h2>/);
  assert.match(html, /<li><strong>OS:<\/strong> two<ul><li>nested<\/li><\/ul><\/li>/);
  assert.match(html, /<ol><li>Step:<pre class="md-code"><code>sudo apt install x\n\necho &lt;y&gt;<\/code><\/pre><\/li><li>Next<\/li><\/ol>/);
  assert.match(html, /<div class="prp-note md-note bad" data-kind="bad"><p><strong>Never<\/strong> do this\.<\/p><\/div>/);
  assert.match(html, /<td>a \| pipe<\/td><td class="num">2<\/td>/);
  assert.match(html, /<figure id="f"><svg><\/svg>\n<figcaption>Cap<\/figcaption><\/figure>/, 'raw HTML blocks pass through');
  assert.match(html, /<input type="checkbox" data-task="1" checked>/);
  assert.ok(html.trim().endsWith('</section>'));
  assert.deepEqual(toc.map(t => [t.level, t.id]), [[1, 'k'], [2, 'r']]);
  assert.equal(inline('[a](https://x.org) [b](#/rt/osint-training)'), '<a href="https://x.org" target="_blank" rel="noopener">a</a> <a href="#/rt/osint-training">b</a>');
  assert.equal(inline('[x](javascript:alert(1))').includes('href="javascript:alert(1'), true, 'content is trusted, but stays escaped text');
  assert.equal(slug('SDR# (SDRSharp)'), 'sdr-sdrsharp');
  const dup = renderMarkdown('## Pitfalls\n\n## Pitfalls\n').toc.map(t => t.id);
  assert.deepEqual(dup, ['pitfalls', 'pitfalls-2']);
});

/* ---- Catalogue and content ------------------------------------------------------------------------------------------------ */
test('catalogue: satellite notes, receivers and deep links', () => {
  for (const name of ['ISS (ZARYA)', 'METEOR-M2 3', 'METEOR-M2 4', 'SAUDISAT 1C (SO-50)', 'METOP-B']) assert.ok(satMeta(name), name);
  assert.ok(satMeta('METEOR-M2 3').simple && !satMeta('METOP-C').simple);
  assert.ok(satMeta('METEOR-M2 2').silent && satMeta('METEOR-M 2').silent, 'dead 137 MHz transmitters are not predicted');
  assert.equal(satMeta('NOAA 19'), null, 'NOAA POES are gone from the lists');
  assert.deepEqual(NOAA_POES_END.map(n => n.date), ['2025-06-06', '2025-08-13', '2025-08-19']);
  assert.ok(SAT_META.every(m => m.downlink));
  for (const r of [...RECEIVERS, ...DIRECTORIES]) assert.match(r.url, /^https?:\/\//);
  for (const r of RECEIVERS) assert.ok(Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180);
  for (const [k, f] of Object.entries(LINKS)) assert.match(f(53.35, -6.26, '2026-10-27'), /^https:\/\//, k);
  assert.equal(LINKS.gpsjam(53.35, -6.26, '2026-10-27'), 'https://gpsjam.org/?lat=53.35&lon=-6.26&z=5&date=2026-10-27');
});

test('content: cookbook, hardware guide and law cover what the brief asks for', () => {
  const cb = renderMarkdown(read('content/cookbook.md'), { sectionLevel: 2 });
  const ids = cb.toc.filter(t => t.level === 2).map(t => t.id);
  for (const id of ['rtl-sdr', 'soapysdr', 'sdrpp', 'sdrsharp', 'gqrx', 'sdrangel', 'hdsdr', 'cubicsdr', 'tar1090', 'dump1090-fa', 'ais-catcher', 'satdump', 'wsjt-x', 'fldigi',
    'direwolf', 'rtl-433', 'multimon-ng', 'gnuradio', 'urh', 'inspectrum', 'wireshark', 'gpredict', 'chirp', 'meshtastic', 'openwebrx', 'pipeline-adsb', 'pipeline-wxsat', 'pipeline-meshtastic']) assert.ok(ids.includes(id), `recipe ${id}`);
  const md = read('content/cookbook.md');
  for (const sec of md.split(/\n## /).slice(1)) {
    const name = sec.split('\n')[0];
    if (/pipeline/.test(name)) continue;
    assert.match(sec, /\*\*Official source:\*\* \[/, `${name} has an official source`);
  }
  assert.ok(!/\b(softonic|uptodown|filehippo|download\.cnet|sourceforge\.net\/projects\/(?!fldigi))/i.test(md), 'no download mirrors');
  for (const id of ['tar1090', 'direwolf']) assert.ok(read('index.html').includes(`data-section="${id}"`), `page links to recipe ${id}`);
  const hw = read('content/hardware.md');
  for (const f of ['a', 'b', 'c', 'd', 'e', 'f']) {
    assert.match(hw, new RegExp(`<figure class="dg" id="pattern-${f}">.*<svg [^>]*role="img"[\\s\\S]*?</svg></div><figcaption><b>Figure H\\d\\.</b>`), `figure ${f}`);
  }
  assert.ok(!/fill="#|stroke="#/i.test(hw), 'diagrams use theme classes, not raw colours');
  for (const s of ['RTL-SDR Blog V4', 'Nooelec', 'Airspy Mini', 'Airspy R2', 'HF+ Discovery', 'RSP1B', 'RSPdx', 'KiwiSDR', 'HackRF One', 'ADALM-Pluto', 'USRP', 'Heltec', 'T-Beam', 'WisBlock', 'u-blox',
    'Discone', 'QFH', 'Turnstile', '1090 MHz collinear', 'Active loop', 'FM band-stop', 'SAW', 'NanoVNA', 'tinySA', 'Raspberry Pi', '€30', '€150', '€500', 'OSINT Training', 'Propagation', 'safety']) assert.ok(hw.includes(s), `hardware guide mentions ${s}`);
  const law = read('content/law.md');
  for (const s of ['ComReg', 'Wireless Telegraphy Acts 1926 to 2009', 'S.I. No. 197 of 2005', 'section 98', 'Ofcom', 'section 48 of the Wireless Telegraphy Act 2006', 'Electronic Communications Privacy Act',
    'cellular and cordless phone', '15.121', 'HackRF', 'Flipper Zero', 'Universal Radio Hacker', 'amateur', 'GDPR']) assert.ok(law.includes(s), `law mentions ${s}`);
  assert.ok((law.match(/^- \[ \] /gm) || []).length >= 6, 'a checklist');
  for (const text of [md, hw, law, read('index.html')]) assert.ok(!/JDP-I(?!q)|\bH&P\b|\bF&E\b/.test(text), 'no old brand names');
});

test('page: structure, tabs and tokens-only CSS', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en" data-suite="rt" class="prp">/);
  assert.match(html, /<title>SIGINT Dashboard · PRP<\/title>/);
  assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="rt" data-module="sigint" data-shell="\.\.\/" defer><\/script>/);
  const tabs = [...html.matchAll(/role="tab" id="tab-([a-z]+)" aria-controls="panel-([a-z]+)"/g)];
  assert.equal(tabs.length, 11);
  for (const [, a, b] of tabs) { assert.equal(a, b); assert.match(html, new RegExp(`<section id="panel-${a}" role="tabpanel" aria-labelledby="tab-${a}"`)); }
  assert.match(html, /Realtime Intelligence <span class="sep">·<\/span> SIGINT Dashboard/);
  const css = read('styles.css');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no raw hex colours in page CSS');
  assert.ok(!/rgba?\(/.test(css), 'no raw rgb colours');
  for (const src of [...html.matchAll(/src="(https:[^"]+)"/g)].map(m => m[1])) assert.match(src, /@\d+\.\d+\.\d+/, `pinned version: ${src}`);
  for (const f of ['views/satellites.js', 'lib/maps.js']) for (const u of read(f).match(/https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\/[^'"`]+/g) || []) assert.match(u, /@\d+\.\d+\.\d+/, u);
});

/* ---- Bridge and edge proxy ------------------------------------------------------------------------------------------------ */
test('bridge: options, origins, hosts and request validation', () => {
  const o = B.parseArgs(['--port', '9001', '--route', 'adsb=http://pi.local:8080/data/aircraft.json?x=1', '--origin', 'https://example.org/'], { AISSTREAM_API_KEY: 'k' });
  assert.deepEqual([o.port, o.routes.adsb, o.origins, o.aisstreamKey, o.public], [9001, 'http://pi.local:8080/data/aircraft.json?x=1', ['https://example.org'], 'k', true]);
  const d = B.parseArgs([], {});
  assert.deepEqual(Object.keys(d.routes), ['adsb', 'ais', 'mesh', 'owrx']); assert.deepEqual(d.origins, B.DEFAULT_ORIGINS); assert.equal(d.port, 8790);
  assert.throws(() => B.parseArgs(['--port', '0']), /port/); assert.throws(() => B.parseArgs(['--route', 'Bad Name=http://x']), /Route name/);
  assert.throws(() => B.parseArgs(['--route', 'x=file:///etc/passwd']), /http/); assert.throws(() => B.parseArgs(['--frobnicate']), /Unknown option/);
  assert.equal(B.parseArgs(['--no-public']).public, false);
  const allow = B.DEFAULT_ORIGINS;
  assert.ok(B.originAllowed('https://jdpi.pages.dev', allow)); assert.ok(B.originAllowed('http://localhost:8787', allow)); assert.ok(B.originAllowed('http://127.0.0.1:3000', allow));
  for (const bad of ['https://evil.example', 'http://localhost.evil.example', 'http://localhost:80x', 'null', '', undefined, 'https://jdpi.pages.dev.evil.example']) assert.ok(!B.originAllowed(bad, allow), String(bad));
  assert.ok(B.hostAllowed('localhost:8790', 8790)); assert.ok(B.hostAllowed('127.0.0.1:8790', 8790)); assert.ok(B.hostAllowed('[::1]:8790', 8790));
  assert.ok(!B.hostAllowed('evil.example:8790', 8790)); assert.ok(!B.hostAllowed('localhost:8791', 8790)); assert.ok(!B.hostAllowed(undefined, 8790));
  const cors = B.corsHeaders('https://jdpi.pages.dev');
  assert.equal(cors['Access-Control-Allow-Private-Network'], 'true'); assert.equal(cors['Access-Control-Allow-Origin'], 'https://jdpi.pages.dev'); assert.equal(cors.Vary, 'Origin');
  assert.equal(B.adsbLolPath('v2/point/53.3498/-6.2603/50'), 'v2/point/53.350/-6.260/50');
  for (const bad of ['v2/point/91/0/50', 'v2/point/0/0/251', 'v2/mil', 'v2/point/0/0/50/../../x', '../v2/point/0/0/5']) assert.equal(B.adsbLolPath(bad), null, bad);
  assert.equal(B.openskyQuery(new URLSearchParams('lamin=52.6&lomin=-7.5&lamax=54.1&lomax=-5')), 'lamin=52.600&lomin=-7.500&lamax=54.100&lomax=-5.000');
  assert.equal(B.openskyQuery(new URLSearchParams('lamin=54&lomin=-7&lamax=53&lomax=-5')), null);
  assert.deepEqual(B.parseBbox('53,-7,54,-5'), { south: 53, west: -7, north: 54, east: -5 }); assert.equal(B.parseBbox('53,-7,54'), null); assert.equal(B.parseBbox('54,-7,53,-5'), null);
  const ships = new Map();
  B.applyAisMessage(ships, { MessageType: 'PositionReport', MetaData: { MMSI: 250001234, ShipName: 'FERRY  ', latitude: 53.3, longitude: -6.1 }, Message: { PositionReport: { UserID: 250001234, Latitude: 53.31, Longitude: -6.11, Sog: 17.5, Cog: 95, TrueHeading: 96, NavigationalStatus: 0 } } }, 1000);
  B.applyAisMessage(ships, { MessageType: 'ShipStaticData', MetaData: { MMSI: 250001234 }, Message: { ShipStaticData: { UserID: 250001234, Name: 'IRISH FERRY', CallSign: 'EIAB2', Type: 60, Destination: 'HOLYHEAD' } } }, 2000);
  assert.equal(B.applyAisMessage(ships, { MessageType: 'PositionReport', MetaData: {}, Message: {} }), false);
  assert.deepEqual(ships.get(250001234), { mmsi: 250001234, lat: 53.31, lon: -6.11, sog: 17.5, cog: 95, heading: 96, status: 0, ts: 1000, name: 'IRISH FERRY', callsign: 'EIAB2', type: 60, destination: 'HOLYHEAD', imo: undefined, seen: 2000 });
});

test('bridge: relays configured routes with CORS, refuses everything else', async () => {
  const upstream = createServer((req, res) => {
    if (req.url === '/data/aircraft.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ now: 1, aircraft: [{ hex: 'abc123' }] })); }
    else { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('nope'); }
  }).listen(0, '127.0.0.1');
  await new Promise(r => upstream.once('listening', r));
  const up = `http://127.0.0.1:${upstream.address().port}`;
  const port = 18790 + Math.floor(Math.random() * 500);
  const bridge = B.createBridge({ ...B.parseArgs(['--port', String(port), '--route', `adsb=${up}/data/aircraft.json`, '--route', `gone=${up}/missing`, '--no-public', '--quiet'], {}) });
  await new Promise(r => bridge.listen(port, '127.0.0.1', r));
  const base = `http://localhost:${port}`, origin = { Origin: 'https://jdpi.pages.dev' };
  try {
    const h = await fetch(`${base}/health`, { headers: origin });
    assert.equal(h.status, 200); assert.equal(h.headers.get('access-control-allow-origin'), 'https://jdpi.pages.dev');
    const hj = await h.json();
    assert.deepEqual([hj.name, hj.version, Object.keys(hj.routes), hj.public], ['prp-bridge', B.VERSION, ['adsb', 'gone'], false]);
    const r = await fetch(`${base}/local/adsb`, { headers: origin });
    assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), 'https://jdpi.pages.dev'); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), { now: 1, aircraft: [{ hex: 'abc123' }] });
    assert.equal((await fetch(`${base}/local/gone`, { headers: origin })).status, 404, 'upstream status passes through');
    assert.equal((await fetch(`${base}/local/other`, { headers: origin })).status, 404);
    assert.equal((await fetch(`${base}/local/adsb`, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/local/adsb`)).status, 200, 'local tools without an Origin may ask');
    assert.equal((await fetch(`${base}/local/adsb`, { method: 'POST', headers: origin, body: 'x' })).status, 405);
    assert.equal((await fetch(`${base}/public/adsb.lol/v2/point/53/-6/50`, { headers: origin })).status, 403, 'public relays are off with --no-public');
    assert.equal((await fetch(`${base}/aisstream/ships.json?bbox=1,2`, { headers: origin })).status, 400);
    assert.equal((await fetch(`${base}/aisstream/ships.json?bbox=53,-7,54,-5`, { headers: origin })).status, 401, 'no key, no connection');
    const pre = await fetch(`${base}/local/adsb`, { method: 'OPTIONS', headers: { ...origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-private-network'), 'true'); assert.match(pre.headers.get('access-control-allow-headers'), /X-AISStream-Key/);
    const rebound = await new Promise((resolve, reject) => {
      const q = request({ host: '127.0.0.1', port, path: '/health', headers: { Host: `attacker.example:${port}` } }, res => { res.resume(); resolve(res.statusCode); });
      q.on('error', reject); q.end();
    });
    assert.equal(rebound, 421, 'DNS-rebinding guard');
  } finally {
    bridge.close(); upstream.close();
  }
});

test('edge proxy: validates the one query shape and caches upstream replies', async () => {
  assert.equal(proxyPath(['v2', 'point', '53.3498', '-6.2603', '50']), 'v2/point/53.35/-6.26/50');
  assert.equal(proxyPath('v2/point/53.3498/-6.2603/50'), 'v2/point/53.35/-6.26/50');
  for (const bad of [['v2', 'mil'], ['v2', 'point', '1', '2'], ['v2', 'point', '91', '0', '5'], ['v2', 'point', '0', '0', '0'], ['v2', 'point', 'a', '0', '5']]) assert.equal(proxyPath(bad), null);
  const calls = [], stored = [];
  const saved = { fetch: globalThis.fetch, caches: globalThis.caches };
  globalThis.caches = { default: { match: async () => undefined, put: async (k, v) => { stored.push([k.url, v.status]); } } };
  globalThis.fetch = async url => { calls.push(String(url)); return new Response('{"ac":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try {
    const waits = [];
    const res = await onRequestGet({ request: new Request('https://jdpi.pages.dev/api/sigint/adsb/v2/point/53.3498/-6.2603/50'), params: { path: ['v2', 'point', '53.3498', '-6.2603', '50'] }, waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    assert.equal(res.status, 200); assert.equal(await res.text(), '{"ac":[]}');
    assert.deepEqual(calls, ['https://api.adsb.lol/v2/point/53.35/-6.26/50']);
    assert.deepEqual(stored, [['https://jdpi.pages.dev/api/sigint/adsb/v2/point/53.35/-6.26/50', 200]]);
    assert.match(res.headers.get('cache-control'), /max-age=10/);
    const bad = await onRequestGet({ request: new Request('https://x/api/sigint/adsb/v2/mil'), params: { path: ['v2', 'mil'] }, waitUntil() {} });
    assert.equal(bad.status, 400);
  } finally {
    globalThis.fetch = saved.fetch; globalThis.caches = saved.caches;
  }
});

/* ---- Public feeds (opt-in: SIGINT_LIVE=1) ----------------------------------------------------------------------------------- */
test('live: public feeds answer, and which allow browsers (CORS)', { skip: !process.env.SIGINT_LIVE && 'set SIGINT_LIVE=1 to call the public feeds' }, async () => {
  const get = (u, extra = {}) => fetch(u, { headers: { Origin: 'https://jdpi.pages.dev', 'User-Agent': 'PRP SIGINT test', ...extra }, signal: AbortSignal.timeout(25000) });
  const browserOk = ['https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', 'https://services.swpc.noaa.gov/products/noaa-scales.json',
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
    `https://db1.wspr.live/?query=${encodeURIComponent('SELECT count() FROM wspr.rx WHERE time > now() - INTERVAL 5 MINUTE FORMAT JSON')}`];
  for (const u of browserOk) {
    const r = await get(u);
    assert.equal(r.status, 200, u); assert.equal(r.headers.get('access-control-allow-origin'), '*', `${u} allows browsers`);
    await r.json();
  }
  const lol = await get('https://api.adsb.lol/v2/point/53.35/-6.26/25');
  assert.equal(lol.status, 200); assert.ok(Array.isArray((await lol.json()).ac));
  assert.equal(lol.headers.get('access-control-allow-origin'), null, 'adsb.lol: no CORS (needs the PRP proxy or bridge)');
});

/* ---- Page (opt-in: JDPI_URL=http://localhost:8787) ----------------------------------------------------------------------------- */
test('page: tabs, hash, documents and the GNSS sample in Edge', { skip: !process.env.JDPI_URL && 'set JDPI_URL to run the page test' }, async () => {
  const { chromium } = await import('playwright-core');
  const base = process.env.JDPI_URL.replace(/\/$/, '');
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/sigint/index.html#tab=cookbook&s=satdump`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cb-doc section.md-sec');
    assert.ok(await page.locator('#cb-doc section.md-sec').count() >= 28);
    await page.fill('#cb-q', 'zadig');
    await page.waitForTimeout(400);
    const visible = await page.locator('#cb-doc section.md-sec:not([hidden])').count();
    assert.ok(visible >= 3 && visible < 15, `search narrows the recipes (${visible})`);
    await page.click('#tab-gnss');
    assert.match(page.url(), /#tab=gnss$/);
    await page.click('#gn-sample');
    // The sample plays in real time; wait for it rather than a fixed time, which a busy full run can outlast.
    await page.waitForFunction(() => document.querySelectorAll('#gn-snr .snr-row').length >= 15, null, { timeout: 10000 }).catch(() => {});
    assert.ok(await page.locator('#gn-snr .snr-row').count() >= 15, 'sample satellites listed');
    assert.ok(await page.locator('#gn-sky svg circle').count() > 15, 'sky plot drawn');
    await page.click('#tab-law');
    await page.waitForSelector('#law-doc .md-tasks input');
    await page.locator('#law-doc .md-tasks input').first().check();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#law-doc .md-tasks input');
    assert.equal(await page.locator('#law-doc .md-tasks input').first().isChecked(), true, 'checklist remembered in this browser');
    await page.setViewportSize({ width: 360, height: 800 });
    for (const t of ['overview', 'satellites', 'hardware']) {
      await page.click(`#tab-${t}`);
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, `no horizontal scroll at 360 px on ${t}`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

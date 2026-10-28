// GEOINT & IMINT Dashboard (geoint/): pure helpers, query and link builders, the guide renderer, the guides themselves
// and the page wiring. Hermetic by default. Live checks of the public APIs run with GEOINT_LIVE=1:
//   GEOINT_LIVE=1 node --test tests/geoint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as U from '../geoint/js/util.js';
import * as G from '../geoint/js/geo.js';
import * as S from '../geoint/js/sources.js';
import { renderMarkdown, inline, linkAttrs } from '../geoint/js/md.js';
import { FIGURES, pipeline } from '../geoint/js/figures.js';

const root = new URL('../geoint/', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} is not within ±${tol} of ${b}`);
const LIVE = process.env.GEOINT_LIVE === '1';
const UA = 'PRP-GEOINT-dashboard-tests/1.0 (+https://jdpi.pages.dev/geoint/)';

/* ---------------------------------------------------------------- util */
test('hash state: parse, build, defaults and old ?tab= links', () => {
  const s = U.parseHash('#tab=imagery&ll=47.15,34.1&z=8&d=2023-05-28&cmp=1');
  assert.equal(s.tab, 'imagery'); assert.equal(s.ll, '47.15,34.1'); assert.equal(s.z, '8'); assert.equal(s.cmp, '1');
  assert.equal(U.parseHash('#tab=nonsense').tab, 'overview');
  assert.equal(U.parseHash('', '?tab=law').tab, 'law');
  assert.equal(U.parseHash('#tab=cookbook', '?tab=law').tab, 'cookbook', 'the hash wins over the query');
  const h = U.buildHash({ d: '2023-05-28', tab: 'imagery', z: 8, ll: '47.15,34.1', cmp: true, empty: '', off: false, gone: null });
  assert.equal(h, '#tab=imagery&ll=47.15,34.1&z=8&cmp=1&d=2023-05-28');
  assert.deepEqual(U.parseHash(h), { tab: 'imagery', ll: '47.15,34.1', z: '8', cmp: '1', d: '2023-05-28' });
  assert.equal(U.parseHash('#q=a%26b%20c').q, 'a&b c');
  assert.deepEqual(U.parseLatLon('53.35,-6.26'), [53.35, -6.26]);
  assert.equal(U.parseLatLon('95,0'), null);
});

test('dates and formatting', () => {
  assert.equal(U.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(U.addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(U.daysBetween('2023-05-28', '2023-06-18'), 21);
  assert.ok(U.isISODate('2024-02-29')); assert.ok(!U.isISODate('2025-02-29')); assert.ok(!U.isISODate('2025-2-1'));
  assert.equal(U.clampDay('1999-01-01', '2000-02-24', '2026-10-27'), '2000-02-24');
  assert.equal(U.clampDay('2030-01-01', '2000-02-24', '2026-10-27'), '2026-10-27');
  assert.equal(U.fmtDay('2023-06-06'), '6 Jun 2023');
  assert.equal(U.fmtDistance(850), '850 m');
  assert.equal(U.fmtDistance(54972.27), '55.0 km');
  assert.equal(U.fmtArea(5000), '5,000 m²');
  assert.equal(U.fmtArea(12.36e6), '12.36 km²');
  assert.equal(U.slug('Google Earth Pro (historical)'), 'google-earth-pro-historical');
  assert.equal(U.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('CSV parser handles quotes, commas and CRLF', () => {
  const rows = U.parseCSV('a,b,c\r\n1,"two, 2","say ""hi"""\r\n3,,x\n');
  assert.deepEqual(rows, [{ a: '1', b: 'two, 2', c: 'say "hi"' }, { a: '3', b: '', c: 'x' }]);
});

/* ---------------------------------------------------------------- geodesy */
test('Vincenty inverse matches the classic Flinders Peak to Buninyong example', () => {
  const dms = (d, m, s) => -(d + m / 60 + s / 3600);
  const fp = [dms(37, 57, 3.7203), 144 + 25 / 60 + 29.5244 / 3600], bu = [dms(37, 39, 10.1561), 143 + 55 / 60 + 35.3839 / 3600];
  const v = G.vincenty(fp, bu);
  near(v.distance, 54972.271, 0.001, 'distance');
  near(v.initialBearing, 306 + 52 / 60 + 5.37 / 3600, 1e-4, 'initial bearing');
  near(G.normDeg(v.finalBearing + 180), 127 + 10 / 60 + 25.07 / 3600, 1e-4, 'reverse azimuth');
});

test('sphere helpers: haversine, bearing, destination, interpolation, areas, crossings', () => {
  near(G.haversine([51.5074, -0.1278], [48.8566, 2.3522]) / 1000, 343.5, 1, 'London–Paris');
  near(G.bearing([0, 0], [0, 10]), 90, 1e-9); near(G.bearing([0, 0], [10, 0]), 0, 1e-9);
  const d = G.destination([53.35, -6.26], 72.5, 12345);
  near(G.haversine([53.35, -6.26], d), 12345, 0.01); near(G.bearing([53.35, -6.26], d), 72.5, 1e-6);
  const mid = G.interpolate([0, 0], [0, 90], 0.5); near(mid[0], 0, 1e-9); near(mid[1], 45, 1e-9);
  near(G.polygonArea([[0, 0], [0, 1], [1, 1], [1, 0]]) / 1e6, 12363.7, 1, '1° × 1° cell at the equator');
  near(G.polygonArea([[0, 179.5], [0, -179.5], [1, -179.5], [1, 179.5]]) / 1e6, 12363.7, 1, 'cell across the antimeridian');
  const x = G.intersection([51.8853, 0.2545], 108.547, [49.0034, 2.5735], 32.435);
  near(x[0], 50.9078, 1e-4); near(x[1], 4.5084, 1e-4);
  assert.equal(G.intersection([0, 0], 0, [0, 10], 180), null, 'lines heading apart do not cross');
  const s = G.samplePath([[53.3, -6.3], [53.4, -6.1]], 10);
  assert.equal(s.length, 11); near(s[10].d, G.distance([53.3, -6.3], [53.4, -6.1]), 1e-6); assert.equal(s[0].d, 0);
  const gc = G.greatCircle([10, 170], [10, -170], 8);
  assert.ok(gc.every((p, i) => !i || Math.abs(p[1] - gc[i - 1][1]) < 180), 'continuous across the antimeridian');
  assert.equal(G.compass(0), 'N'); assert.equal(G.compass(247), 'WSW'); assert.equal(G.compass(359), 'N');
  near(G.angleDiff(10, 350), 20, 1e-12); near(G.angleDiff(350, 10), -20, 1e-12);
});

test('coordinates: DMS, parsing what people paste, UTM and MGRS', () => {
  assert.equal(G.toDMS(48.858333, true), '48°51′30.0″N');
  assert.equal(G.toDMS(-0.1275, false), '0°07′39.0″W');
  const cases = {
    '48.8584, 2.2945': [48.8584, 2.2945], '48.8584 2.2945': [48.8584, 2.2945], '-33.9,18.4': [-33.9, 18.4],
    '48°51′30″N 2°17′40″E': [48.858333, 2.294444], '51 30 26 N, 0 7 39 W': [51.507222, -0.1275], '51 30 26 S, 0 7 39 W': [-51.507222, -0.1275],
    'N 52.1 E 4.3': [52.1, 4.3], '40.7128° N, 74.0060° W': [40.7128, -74.006], '2.2945 E, 48.8584 N': [48.8584, 2.2945],
  };
  for (const [s, [la, lo]] of Object.entries(cases)) { const p = G.parseCoordinates(s); assert.ok(p, s); near(p[0], la, 1e-5, s); near(p[1], lo, 1e-5, s); }
  for (const bad of ['', 'hello', '91, 0', '12', '48 61 0 N, 2 0 0 E']) assert.equal(G.parseCoordinates(bad), null, bad);
  const eiffel = G.parseCoordinates('31U DQ 48251 11932');
  near(eiffel[0], 48.8582, 2e-4); near(eiffel[1], 2.2945, 2e-4);
  assert.match(G.toMGRS(38.8895, -77.0353), /^18S UJ 234\d\d 064\d\d$/);
  assert.equal(G.utmZone(60, 5), 32, 'Norway exception'); assert.equal(G.utmZone(75, 10), 33, 'Svalbard exception');
  assert.equal(G.latBand(-80), 'C'); assert.equal(G.latBand(84), 'X'); assert.equal(G.latBand(85), null);
  assert.equal(G.toMGRS(-85, 0), null, 'polar areas use UPS, not MGRS');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 400; k++) {
    const lat = -79.5 + rnd() * 163, lon = -180 + rnd() * 359.99;
    const back = G.fromMGRS(G.toMGRS(lat, lon));
    assert.ok(back, `${lat},${lon}`);
    assert.ok(G.haversine([lat, lon], back) < 1.5, `MGRS round trip ${lat},${lon} → ${G.toMGRS(lat, lon)} → ${back}`);
    const u = G.toUTM(lat, lon), ll = G.fromUTM(u.zone, u.hemisphere, u.easting, u.northing);
    assert.ok(G.haversine([lat, lon], ll) < 0.05, `UTM round trip ${lat},${lon}`); // a few cm at worst, in Svalbard's wide zones
  }
});

test('tiles, Terrarium decoding and hillshade', () => {
  assert.deepEqual(G.tileOf(0, 0, 1), { x: 1, y: 1, z: 1, px: 0, py: 0 });
  const t = G.tileOf(53.35, -6.26, 10);
  assert.equal(t.x, Math.floor((-6.26 + 180) / 360 * 1024)); assert.ok(t.px >= 0 && t.px < 256 && t.py >= 0 && t.py < 256);
  assert.equal(G.decodeTerrarium(128, 0, 0), 0); assert.equal(G.decodeTerrarium(0, 0, 0), -32768); assert.equal(G.decodeTerrarium(130, 200, 128), 712.5);
  near(G.metersPerPixel(0, 0), 156543.03, 0.01);
  const flat = G.hillshade(new Float32Array(25).fill(100), 5, 5, 30);
  near(flat[12], Math.cos(Math.PI / 4), 1e-6, 'flat ground under a 45° sun');
  // Ground rising towards the south-east faces north-west, towards the default light: brighter. The opposite slope: darker.
  const plane = (fx, fy) => { const a = new Float32Array(25); for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) a[y * 5 + x] = fx * x * 30 + fy * y * 30; return a; };
  assert.ok(G.hillshade(plane(0.3, 0.3), 5, 5, 30)[12] > flat[12]);
  assert.ok(G.hillshade(plane(-0.3, -0.3), 5, 5, 30)[12] < flat[12]);
});

// A compact solar-position model (US Naval Observatory approximation, good to about 0.1°), to exercise the search with
// realistic sun motion without network access. Azimuth clockwise from north, altitude in degrees, as SunCalc 2 returns.
function sunRef(date, lat, lon) {
  const r = Math.PI / 180, d = date.getTime() / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * r, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r, e = (23.439 - 0.00000036 * d) * r;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const H = (((18.697374558 + 24.06570982441908 * d) % 24) * 15 + lon) * r - ra, p = lat * r;
  const alt = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(p) - Math.sin(p) * Math.cos(H));
  return { azimuth: (az / r + 360) % 360, altitude: alt / r };
}

test('sun and shadow geometry', () => {
  near(G.shadowLength(10, 45), 10, 1e-9);
  assert.equal(G.shadowLength(10, -1), Infinity);
  near(G.altitudeFromShadow(3, 5.2), 29.98, 0.01, 'the OSINT Training worked example');
  near(G.altitudeFromShadow(2, 2), 45, 1e-9);
  assert.equal(G.shadowBearing(225), 45); assert.equal(G.sunAzimuthFromShadow(45), 225);
  const london = sunRef(new Date(Date.UTC(2024, 5, 21, 12, 0)), 51.5, -0.13);
  near(london.altitude, 62, 1, 'midsummer noon altitude, London'); near(london.azimuth, 178, 3);
});

test('chronolocation finds the times that fit a shadow', () => {
  // A toy sun: rises at 06:00 in the east, south at noon at 60°, sets at 18:00.
  const toy = d => { const h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; return { azimuth: 90 + 15 * (h - 6), altitude: 60 * Math.sin(Math.PI * (h - 6) / 12) }; };
  const start = Date.UTC(2026, 5, 1);
  const both = G.chronolocate({ lat: 0, lon: 0, startMs: start, getPosition: toy, azimuth: 180, altitude: 60, tolAz: 2, tolAlt: 2 });
  assert.equal(both.windows.length, 1);
  near((both.windows[0].best - start) / 3600e3, 12, 0.05, 'best time is noon');
  const altOnly = G.chronolocate({ lat: 0, lon: 0, startMs: start, getPosition: toy, altitude: 30, tolAlt: 1 });
  assert.equal(altOnly.windows.length, 2, 'morning and afternoon');
  const hours = altOnly.windows.map(w => (w.best - start) / 3600e3).sort((a, b) => a - b);
  near(hours[0], 8, 0.05); near(hours[1], 16, 0.05);
  assert.deepEqual(G.chronolocate({ lat: 0, lon: 0, startMs: start, getPosition: toy }).windows, []);
  // With realistic sun motion: take the sun's position at a known moment and find that moment again.
  const t = Date.UTC(2025, 3, 14, 15, 37), pos = sunRef(new Date(t), 48.8584, 2.2945);
  const day = G.chronolocate({ lat: 48.8584, lon: 2.2945, startMs: Date.UTC(2025, 3, 14), getPosition: sunRef, azimuth: pos.azimuth, altitude: pos.altitude, tolAz: 1, tolAlt: 1 });
  assert.ok(Math.abs(day.windows[0].best - t) < 3 * 60e3, 'found within three minutes');
  // A whole year: both seasons that share the sun position appear (about two months either side of the summer solstice).
  const year = G.chronolocate({ lat: 48.8584, lon: 2.2945, startMs: Date.UTC(2025, 0, 1), days: 365, getPosition: sunRef, azimuth: pos.azimuth, altitude: pos.altitude, tolAz: 1, tolAlt: 0.6, stepMin: 3 });
  const months = new Set(year.windows.map(w => new Date(w.best).getUTCMonth()));
  assert.ok(months.has(3), 'April'); assert.ok(months.has(7), 'August');
});

test('line of sight with Earth curvature and refraction', () => {
  const flat = D => Array.from({ length: 101 }, (_, i) => ({ d: (D * i) / 100, h: 0 }));
  assert.equal(G.lineOfSight(flat(10000), { observerHeight: 2, targetHeight: 2 }).visible, true, '2 m to 2 m over 10 km');
  assert.equal(G.lineOfSight(flat(20000), { observerHeight: 2, targetHeight: 2 }).visible, false, 'the bulge hides it over 20 km');
  const hill = flat(5000).map(p => ({ ...p, h: Math.abs(p.d - 2500) < 200 ? 30 : 0 }));
  const los = G.lineOfSight(hill, { observerHeight: 10, targetHeight: 10 });
  assert.equal(los.visible, false); near(los.obstruction.d, 2300, 60);
  assert.equal(G.lineOfSight([{ d: 0, h: 0 }]), null);
});

test('time zones through Intl', () => {
  assert.equal(new Date(G.zonedToUtc('2024-07-01', '12:00', 'Europe/London')).toISOString(), '2024-07-01T11:00:00.000Z');
  assert.equal(new Date(G.zonedToUtc('2024-01-15', '12:00', 'Europe/London')).toISOString(), '2024-01-15T12:00:00.000Z');
  assert.equal(new Date(G.zonedToUtc('2024-03-10', '03:30', 'America/New_York')).toISOString(), '2024-03-10T07:30:00.000Z');
  assert.deepEqual(G.utcToZoned(Date.UTC(2024, 6, 1, 11, 0), 'Europe/Dublin'), { day: '2024-07-01', time: '12:00', offset: 60 });
  assert.equal(G.fmtOffset(-210), 'UTC−03:30'); assert.equal(G.fmtOffset(330), 'UTC+05:30');
  assert.equal(G.etcZoneForLon(-74), 'Etc/GMT+5'); assert.equal(G.etcZoneForLon(30.5), 'Etc/GMT-2'); assert.equal(G.etcZoneForLon(3), 'Etc/GMT');
  for (const lon of [-170, -74, 0, 30, 150]) assert.doesNotThrow(() => G.tzOffsetMinutes(Date.now(), G.etcZoneForLon(lon)));
});

/* ---------------------------------------------------------------- sources */
test('GIBS layers, tile URLs and DescribeDomains parsing', () => {
  const ids = new Set();
  for (const l of S.IMAGERY) {
    assert.ok(!ids.has(l.id), `unique id ${l.id}`); ids.add(l.id);
    assert.match(l.layer, /^(MODIS|VIIRS)_[A-Za-z0-9_]+$/);
    assert.match(l.tms, /^GoogleMapsCompatible_Level[789]$/);
    assert.ok(['jpg', 'png'].includes(l.ext)); assert.ok(U.isISODate(l.start));
    const url = S.gibsTileUrl(l, '2025-01-08');
    assert.ok(url.startsWith('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + l.layer + '/default/'));
    assert.ok(url.endsWith(`/${l.tms}/{z}/{y}/{x}.${l.ext}`));
    assert.ok(url.includes(`/default/${l.fixed || '2025-01-08'}/`));
  }
  assert.equal(S.maxNativeZoom(S.imageryById('terra')), 9);
  assert.equal(S.imageryById('nope').id, S.IMAGERY[0].id);
  for (const p of S.IMAGERY_PRESETS) {
    const l = S.imageryById(p.layer);
    assert.equal(l.id, p.layer, `${p.id} uses a known layer`);
    assert.ok(p.before >= l.start && p.after > p.before, `${p.id} dates`);
    assert.ok(Math.abs(p.ll[0]) < 85 && Math.abs(p.ll[1]) <= 180 && p.z >= 3 && p.z <= 12);
  }
  const xml = '<Domains><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2026-07-01/2026-07-10/P1D,2026-07-12,2026-07-16/2026-07-31/P1D</Domain><Size>3</Size></DimensionDomain></Domains>';
  const r = S.parseGibsDomains(xml);
  assert.deepEqual(r, [{ from: '2026-07-01', to: '2026-07-10' }, { from: '2026-07-12', to: '2026-07-12' }, { from: '2026-07-16', to: '2026-07-31' }]);
  assert.deepEqual(S.parseGibsDomains('<Domain></Domain>'), []);
  assert.ok(S.domainsInclude(r, '2026-07-12')); assert.ok(!S.domainsInclude(r, '2026-07-13'));
  assert.equal(S.nearestDay(r, '2026-07-14'), '2026-07-12'); assert.equal(S.nearestDay(r, '2026-07-15'), '2026-07-16');
  assert.equal(S.latestDay(r), '2026-07-31'); assert.equal(S.latestDay([]), null);
  assert.match(S.gibsDomainsUrl(S.IMAGERY[0], '2026-10-01', '2026-10-27'), /REQUEST=DescribeDomains.*LAYER=VIIRS_NOAA20_CorrectedReflectance_TrueColor.*TIME=2026-10-01\/2026-10-27$/);
  assert.equal(S.fireLayerNames(['n20', 'modis']), 'VIIRS_NOAA20_Thermal_Anomalies_375m_All,MODIS_Combined_Thermal_Anomalies_All');
});

test('Overpass presets and queries stay small and polite', () => {
  const ids = new Set();
  for (const p of S.OSM_PRESETS) {
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    assert.ok(p.maxKm2 > 0 && p.q.length);
    for (const s of p.q) assert.match(s, /^(nwr|node|way)(\["[a-z:_]+"(=|~)"[^"]+"\]|\["[a-z:_]+"\])+$/, s);
  }
  const bbox = S.buildOverpassQuery(S.presetById('airfields'), { bbox: [53.29, -6.44, 53.41, -6.08] });
  assert.equal(bbox, '[out:json][timeout:25][maxsize:67108864][bbox:53.29000,-6.44000,53.41000,-6.08000];\n(\n  nwr["aeroway"="aerodrome"];\n);\nout tags center 1000;');
  const around = S.buildOverpassQuery(S.presetById('worship'), { around: { lat: 53.35, lon: -6.26, r: 2000 } }, { near: { preset: S.presetById('stations'), r: 200 } });
  assert.match(around, /\)->\.near;/);
  assert.match(around, /nwr\["amenity"="place_of_worship"\]\(around\.near:200\)\(around:2000,53\.35000,-6\.26000\);/);
  assert.match(around, /nwr\["railway"="station"\]\(around:2000,53\.35000,-6\.26000\);/);
  assert.throws(() => S.buildOverpassQuery(S.presetById('dams'), {}), /area/);
  const els = S.normalizeOverpass({ elements: [
    { type: 'node', id: 1, lat: 1, lon: 2, tags: { aeroway: 'aerodrome', name: 'A', operator: 'X' } },
    { type: 'way', id: 2, center: { lat: 3, lon: 4 }, tags: { power: 'plant', 'name:en': 'B' } },
    { type: 'relation', id: 3, tags: { name: 'no position' } },
  ] });
  assert.equal(els.length, 2);
  assert.deepEqual([els[1].lat, els[1].lon, els[1].name, els[1].kind], [3, 4, 'B', 'power=plant']);
  assert.equal(els[0].operator, 'X');
  const gj = S.toGeoJSON(els, { name: 't' });
  assert.equal(gj.type, 'FeatureCollection'); assert.deepEqual(gj.features[0].geometry.coordinates, [2, 1]); assert.equal(gj.features[1].id, 'way/2');
  assert.ok(S.OVERPASS_ENDPOINT.startsWith('https://') && !S.OVERPASS_ENDPOINT.includes('overpass-api.de'));
  // Two keyless servers the user chooses between; never the main instance, which asks hosted web apps to stay away.
  assert.ok(S.OVERPASS_SERVERS.length >= 2);
  for (const s of S.OVERPASS_SERVERS) {
    assert.match(s.url, /^https:\/\/[^/]+\/.*interpreter$/); assert.ok(!s.url.includes('overpass-api.de'));
    assert.ok(s.name && s.operator && s.policy, s.id);
  }
  assert.equal(S.overpassServer('vk').id, 'vk'); assert.equal(S.overpassServer('nope').id, S.OVERPASS_SERVERS[0].id); assert.equal(S.overpassServer(null).url, S.OVERPASS_ENDPOINT);
  // Example searches name real presets and views small enough for every preset's area limit on a large screen.
  for (const x of S.OSM_EXAMPLES) {
    const p = S.presetById(x.preset);
    assert.ok(p, x.id);
    const mpp = G.metersPerPixel(x.ll[0], x.z), km2 = (1400 * mpp / 1000) * (720 * mpp / 1000);
    assert.ok(km2 < p.maxKm2, `${x.id}: ${Math.round(km2)} km² within ${p.maxKm2}`);
  }
  // A template for Overpass Turbo uses its {{bbox}} placeholder, so oversized views can still be explored there.
  const turbo = S.buildOverpassQuery(S.presetById('worship'), { turbo: true }, { near: { preset: S.presetById('stations'), r: 200 } });
  assert.match(turbo, /^\[out:json\]\[timeout:25\]\[maxsize:67108864\]\[bbox:\{\{bbox\}\}\];/);
  assert.match(turbo, /nwr\["amenity"="place_of_worship"\]\(around\.near:200\);/);
});

test('Nominatim, FIRMS, USGS and GDACS helpers', () => {
  const n = S.nominatimSearchUrl('  Kalamata airport & port  ', { lang: 'en' });
  assert.equal(n, 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=Kalamata%20airport%20%26%20port');
  assert.ok(!/key|email/i.test(n));
  assert.equal(S.nominatimReverseUrl(1.5, 2.25), 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=1.50000&lon=2.25000');
  assert.ok(S.isFirmsKey('0123456789abcdef0123456789ABCDEF')); assert.ok(!S.isFirmsKey('abc')); assert.ok(!S.isFirmsKey('0123456789abcdef0123456789abcdeg'));
  const k = 'a'.repeat(32);
  assert.equal(S.firmsAreaUrl(k, 'VIIRS_NOAA20_NRT', [-119.5, 33, -117, 35.25], 9), `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${k}/VIIRS_NOAA20_NRT/-119.5000,33.0000,-117.0000,35.2500/5`);
  assert.ok(S.firmsWmsBase(k).startsWith(S.FIRMS_ORIGIN + '/'), 'the key only ever goes to FIRMS');
  assert.equal(S.firmsWmsLayers('48'), 'fires_viirs_48,fires_modis_48'); assert.equal(S.firmsWmsLayers('x'), 'fires_viirs_24,fires_modis_24');
  const viirs = S.parseFirmsCsv('latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n34.07,-118.54,367,0.4,0.4,2025-01-08,0942,N20,VIIRS,h,2.0NRT,300,95.4,N\n');
  assert.deepEqual([viirs[0].lat, viirs[0].confidence, viirs[0].frp, new Date(viirs[0].time).toISOString()], [34.07, 'high', 95.4, '2025-01-08T09:42:00.000Z']);
  const modis = S.parseFirmsCsv('latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight\n1,2,320,1,1,2025-01-08,30,T,MODIS,87,6.1NRT,290,12,D\n');
  assert.equal(modis[0].confidence, '87%'); assert.equal(new Date(modis[0].time).toISOString(), '2025-01-08T00:30:00.000Z');
  assert.equal(S.quakeFeedUrl('2.5_day'), 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
  assert.equal(S.quakeFeedUrl('../../etc'), 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson');
  const q = S.normalizeQuakes({ features: [
    { id: 'a', properties: { mag: 5.1, place: 'Somewhere', time: 2, url: 'https://e/a', tsunami: 0 }, geometry: { coordinates: [120, 10, 35] } },
    { id: 'b', properties: { mag: 6.3, place: 'Elsewhere', time: 5, url: 'https://e/b', tsunami: 1, alert: 'yellow' }, geometry: { coordinates: [-70, -20, 10] } },
    { id: 'c', properties: {}, geometry: { coordinates: [] } },
  ] });
  assert.deepEqual(q.map(e => e.id), ['b', 'a']); assert.equal(q[0].tsunami, true); assert.equal(q[0].depth, 10);
  const g = S.normalizeGdacs({ features: [
    { geometry: { type: 'Point', coordinates: [81.6, 16.4] }, properties: { eventtype: 'TC', eventid: 1, alertlevel: 'Green', name: 'Storm', fromdate: '2026-10-26T00:00:00', todate: '2026-10-27T18:00:00', iscurrent: 'true', url: { report: 'https://www.gdacs.org/report.aspx?eventid=1' }, severitydata: { severitytext: 'Tropical storm' } } },
    { geometry: { type: 'Point', coordinates: [10, 45] }, properties: { eventtype: 'EQ', eventid: 2, alertlevel: 'Red', name: 'Quake', fromdate: '2026-10-20T00:00:00', todate: '2026-10-20T00:00:00', iscurrent: 'false' } },
  ] });
  assert.deepEqual(g.map(e => e.level), ['Red', 'Green'], 'red alerts first');
  assert.equal(g[1].typeName, 'Tropical cyclone'); assert.equal(g[1].current, true); assert.equal(new Date(g[1].to).toISOString(), '2026-10-27T18:00:00.000Z');
});

test('link-outs open the same place elsewhere', () => {
  const c = S.copernicusUrl({ lat: 47.15, lon: 34.1, z: 11, day: '2023-06-18' });
  assert.equal(c, 'https://browser.dataspace.copernicus.eu/?zoom=11&lat=47.15000&lng=34.10000&themeId=DEFAULT-THEME&datasetId=S2_L2A_CDAS&layerId=1_TRUE_COLOR&fromTime=2023-06-18T00:00:00.000Z&toTime=2023-06-18T23:59:59.999Z');
  assert.match(S.copernicusUrl({ lat: 0, lon: 0, day: '2023-06-18', from: '2023-06-12' }), /dateMode=TIME%20RANGE&fromTime=2023-06-12T00:00:00\.000Z&toTime=2023-06-18T23:59:59\.999Z&mosaickingOrder=mostRecent$/);
  assert.match(S.copernicusUrl({ lat: 0, lon: 0 }), /date=latest$/);
  assert.match(S.copernicusUrl({ lat: 0, lon: 0, z: 30 }), /zoom=16/);
  for (const d of S.COPERNICUS_DATASETS) assert.ok(d.days > 0 && d.dataset && d.layer);
  const w = S.worldviewUrl({ bbox: [30, 45, 38, 49], layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', day: '2023-05-28', day2: '2023-06-18' });
  assert.match(w, /^https:\/\/worldview\.earthdata\.nasa\.gov\/\?v=30\.0000,45\.0000,38\.0000,49\.0000&l=Coastlines_15m,Reference_Labels_15m,MODIS_Terra_CorrectedReflectance_TrueColor&t=2023-05-28-T00:00:00Z&l1=.*&t1=2023-06-18-T00:00:00Z&ca=true&cm=swipe&cv=50$/);
  assert.equal(S.waybackUrl({ lat: 1, lon: 2, z: 15 }), 'https://livingatlas.arcgis.com/wayback/#mapCenter=2.00000%2C1.00000%2C15');
  assert.equal(S.mapillaryUrl({ lat: 1, lon: 2 }), 'https://www.mapillary.com/app/?lat=1.00000&lng=2.00000&z=17');
  assert.equal(S.kartaviewUrl({ lat: 1, lon: 2 }), 'https://kartaview.org/map/@1.00000,2.00000,17z');
  assert.equal(S.streetViewUrl({ lat: 1, lon: 2 }), 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=1.00000,2.00000');
  assert.match(S.peakvisorUrl({ lat: 46.5, lon: 8, bearing: 270 }), /yaw=-90\.0/);
  assert.match(S.peakvisorUrl({ lat: 46.5, lon: 8, bearing: 90 }), /yaw=90\.0/);
  assert.equal(S.osmUrl({ lat: 1, lon: 2, z: 16 }), 'https://www.openstreetmap.org/#map=16/1.00000/2.00000');
  assert.equal(S.osmElementUrl('way', 5), 'https://www.openstreetmap.org/way/5');
  assert.equal(S.firmsMapUrl({ lat: 34.1, lon: -118.35, z: 9 }), 'https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@-118.35,34.10,9.0z');
  assert.match(S.overpassTurboUrl('a = "b";', { lat: 1, lon: 2, z: 3 }), /^https:\/\/overpass-turbo\.eu\/\?Q=a%20%3D%20%22b%22%3B&C=1\.00000;2\.00000;3&R$/);
  assert.match(S.overpassTurboUrl('x', { lat: 1, lon: 2, z: 3 }, { run: false }), /&C=1\.00000;2\.00000;3$/, 'an oversized query opens in Turbo without running');
  assert.match(S.googleEarthUrl({ lat: 1, lon: 2, range: 1500 }), /@1\.00000,2\.00000,0a,1500d,35y,0h,0t,0r$/);
  for (const l of S.LESSONS) assert.equal(S.lessonPath(l.id), `fe/learning.html?course=osint&lesson=${l.id}`);
});

test('the lesson ids match headings in the OSINT Training course', () => {
  const course = readFileSync(new URL('../fe/learning/osint.md', import.meta.url), 'utf8');
  // fe/learning.html's lesson id: the title lower-cased, runs of other characters to "-", trimmed, at most 60 characters.
  const ids = [...course.matchAll(/^## (.+)$/gm)].map(m => m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60));
  for (const l of S.LESSONS) assert.ok(ids.includes(l.id), `lesson "${l.id}" exists`);
});

/* ---------------------------------------------------------------- the guide renderer */
test('renderer: headings, contents, lists, tables, code and callouts', () => {
  const { html, toc, meta } = renderMarkdown(`---\ntitle: T\ndek: D\n---\n# Part one\n\nText with **bold**, *it* and snake_case_word and \`a<b\`.\n\n## Tool A\n\n- one\n- two\n  - nested\n- three\n\n3. third\n4. fourth\n\n| A | B |\n|---|--:|\n| x \\| y | 2 |\n\n\`\`\`sh\nrm -rf "<x>"\n\`\`\`\n\n> [!WARNING] Careful\n> Mind the gap.\n\n> Just a quote.\n\n## Tool A\n`, { idPrefix: 'cb' });
  assert.deepEqual(meta, { title: 'T', dek: 'D' });
  assert.deepEqual(toc.map(t => [t.level, t.id]), [[1, 'cb-part-one'], [2, 'cb-tool-a'], [2, 'cb-tool-a-2']]);
  assert.match(html, /<h2 id="cb-part-one" class="md-h1">Part one<a class="anchor"/);
  assert.match(html, /<b>bold<\/b>, <i>it<\/i> and snake_case_word and <code>a&lt;b<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<ul><li>nested<\/li><\/ul><\/li><li>three<\/li><\/ul>/);
  assert.match(html, /<ol start="3"><li>third<\/li><li>fourth<\/li><\/ol>/);
  assert.match(html, /<td>x \| y<\/td><td style="text-align:right">2<\/td>/);
  assert.match(html, /<code class="lang-sh">rm -rf &quot;&lt;x&gt;&quot;<\/code>/);
  assert.match(html, /<div class="prp-note callout warn" role="note"><p class="callout-title"><b>Careful<\/b><\/p><p>Mind the gap.<\/p><\/div>/);
  assert.match(html, /<blockquote><p>Just a quote.<\/p><\/blockquote>/);
});

test('renderer: links are sanitised, PRP links go through the shell, tab links stay in the page', () => {
  const ctx = { opts: { prpLink: p => ({ href: `https://shell/#/rt/${p.split('/')[0]}`, target: '_top' }) } };
  assert.equal(inline('[x](https://a.org/b?c=1&d=2)', ctx), '<a href="https://a.org/b?c=1&amp;d=2" target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(inline('[x](javascript:alert(1))', ctx), 'x');
  assert.equal(inline('[x](data:text/html,hi)', ctx), 'x');
  assert.equal(inline('[x](//evil.example/a)', ctx), 'x');
  assert.equal(inline('[Imagery](#tab=imagery&l=bm)', ctx), '<a href="#tab=imagery&amp;l=bm" data-tab-link>Imagery</a>');
  assert.equal(inline('[L](prp://osint-training/fe/learning.html?course=osint)', ctx), '<a href="https://shell/#/rt/osint-training" target="_top">L</a>');
  assert.equal(inline('**[bold link](https://a.org)**', ctx), '<b><a href="https://a.org" target="_blank" rel="noopener noreferrer">bold link</a></b>');
  assert.equal(inline('<script>alert(1)</script>', ctx), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(inline('see <https://gdal.org/en/stable/>', ctx), 'see <a href="https://gdal.org/en/stable/" target="_blank" rel="noopener noreferrer">gdal.org/en/stable/</a>');
  assert.equal(linkAttrs('mailto:a@b.c'), 'href="mailto:a@b.c" target="_blank" rel="noopener noreferrer"');
  assert.equal(linkAttrs('vbscript:x'), null);
});

test('renderer: figures, operating-system blocks and fact sheets', () => {
  const { html } = renderMarkdown(`::: figure drone-pipeline\nA caption with **bold**.\n:::\n\n::: figure unknown\nNo picture.\n:::\n\n::: os\n@windows\n1. Run the installer.\n@linux Debian\n\`\`\`sh\nsudo apt install x\n\`\`\`\n:::\n\n::: facts\nOfficial source: [x.org](https://x.org)\nCost: Free\n:::\n`, { figures: FIGURES, idPrefix: 'h' });
  // Process figures break out of the reading column (geoint.css .md-figure.breakout); others stay in it.
  assert.match(html, /<figure class="prp-figure md-figure breakout" id="h-fig-drone-pipeline"><svg class="gf gf-wide"/);
  assert.match(html, /<figcaption><b>Figure 1.<\/b> A caption with <b>bold<\/b>.<\/figcaption>/);
  assert.match(html, /<figure class="prp-figure md-figure" id="h-fig-unknown"><figcaption><b>Figure 2.<\/b> No picture./);
  assert.match(renderMarkdown('::: figure fov-gsd\nCamera.\n:::', { figures: FIGURES }).html, /<figure class="prp-figure md-figure" id="fig-fov-gsd"><svg class="gf gf-plain"/);
  assert.match(html, /<section class="os-sec" data-os="windows"><p class="os-label"><span>Windows<\/span><\/p><ol><li>Run the installer.<\/li><\/ol><\/section>/);
  assert.match(html, /<section class="os-sec" data-os="linux"><p class="os-label"><span>Linux<\/span> Debian<\/p><div class="code">/);
  assert.match(html, /<dl class="facts"><div><dt>Official source<\/dt><dd><a href="https:\/\/x.org"/);
});

test('figures are labelled SVG, with a stacked version of each pipeline for phones', () => {
  for (const [id, make] of Object.entries(FIGURES)) {
    const svg = make();
    assert.match(svg, /^<svg class="gf /, id);
    assert.match(svg, /role="img" aria-label="[^"]{20,}"/, id);
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(svg), `${id} uses CSS token classes, not hex colours`);
  }
  const a = pipeline({ steps: [{ t: 'A' }, { t: 'B' }] }), b = pipeline({ steps: [{ t: 'A' }, { t: 'B' }] });
  assert.match(a, /gf-wide[\s\S]*gf-narrow/);
  assert.notEqual(a.match(/marker id="([^"]+)"/)[1], b.match(/marker id="([^"]+)"/)[1], 'marker ids are unique per figure');
  // A step that takes an input and also ends the feedback loop keeps the two apart (no crossing lines).
  const wide = FIGURES['photo-pipeline']().split('<svg class="gf gf-narrow"')[0];
  const inputX = +wide.match(/<text class="gf-in-t" x="([\d.]+)"/)[1], loopX = +wide.match(/<path class="gf-loop" d="M([\d.]+) /)[1];
  assert.ok(Math.abs(inputX - loopX) > 60, `input at ${inputX}, loop at ${loopX}`);
  // Input labels fit inside their pills: about 7.2 units a character at 13 px.
  for (const [id, make] of Object.entries(FIGURES)) {
    for (const m of make().split('<svg class="gf gf-narrow"')[0].matchAll(/<rect class="gf-in" x="[\d.]+" y="[\d.]+" width="([\d.]+)"[^>]*\/><text class="gf-in-t"[^>]*>([^<]+)</g)) {
      assert.ok(+m[1] >= 14 + m[2].length * 7.2, `${id}: "${m[2]}" fits its pill`);
    }
  }
});

/* ---------------------------------------------------------------- the guides */
const GUIDES = ['cookbook', 'hardware', 'law'];
test('the guides render cleanly, use known figures and only https links', () => {
  for (const g of GUIDES) {
    const src = read(`content/${g}.md`);
    const { html, toc, meta } = renderMarkdown(src, { figures: FIGURES, prpLink: p => ({ href: `../${p}`, target: '_self' }), idPrefix: g });
    assert.ok(meta.title && meta.dek && meta.updated, `${g} front matter`);
    assert.ok(toc.length >= 8, `${g} has a contents list`);
    const text = html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
    assert.ok(!/\*\*|\]\(|:::|^#{1,4} |@windows|@macos|@linux/m.test(text), `${g} has no unrendered markup`);
    for (const m of src.matchAll(/::: figure (\S+)/g)) assert.ok(FIGURES[m[1]], `${g} figure ${m[1]}`);
    for (const m of src.matchAll(/\]\(([^)\s]+)\)/g)) assert.match(m[1], /^(https:\/\/|#tab=|prp:\/\/)/, `${g} link ${m[1]}`);
    for (const m of src.matchAll(/prp:\/\/([\w-]+)/g)) assert.ok(['osint-training', 'sigint', 'osint'].includes(m[1]), m[1]);
  }
});

test('the Software Cookbook covers every tool and recipe the brief asks for, with installs per system', () => {
  const src = read('content/cookbook.md');
  for (const t of ['QGIS', 'QuickMapServices', 'Semi-Automatic Classification', 'Google Earth Pro', 'Historical Imagery', 'SNAP', 'GDAL', 'OGR', 'EO Browser', 'Copernicus Browser',
    'Google Earth Engine', 'non-commercial', 'OpenDroneMap', 'WebODM', 'BlenderGIS', 'PeakVisor', 'SunCalc', 'ExifTool', 'geotag']) assert.ok(src.includes(t), t);
  for (const r of ['geolocate a photo', 'date an image from its shadows', 'measure change between two satellite images', 'make a map figure for a report']) assert.ok(src.includes(r), r);
  const tools = src.split(/^## /m).slice(1).filter(s => !s.startsWith('Recipe'));
  assert.ok(tools.length >= 11);
  for (const t of tools) {
    const name = t.split('\n')[0];
    for (const part of ['::: facts', 'Official source:', '### Install', '::: os', '### First test', '### Pitfalls', '### Legal notes']) assert.ok(t.includes(part), `${name}: ${part}`);
    assert.ok(/@windows[\s\S]*@macos[\s\S]*@linux|@any/.test(t), `${name}: install steps for each system`);
  }
});

test('the Hardware Guide and Law & ethics cover the brief', () => {
  const hw = read('content/hardware.md');
  for (const t of ['EASA', 'Open category', 'A1', 'A3', 'C0', 'register', 'IAA', 'MySRS', 'Civil Aviation Authority', 'Flyer ID', 'Operator ID', 'focal length', 'field of view', 'GSD',
    'GNSS', 'RTK', 'PPK', 'ground control', 'SIGINT Dashboard', 'GPU', 'storage', 'drone-pipeline', 'satellite-pipeline', 'photo-pipeline', 'declination']) assert.ok(hw.includes(t), t);
  const law = read('content/law.md');
  for (const t of ['GDPR', 'personal data', 'household exemption', 'Data Protection Commission', 'no-fly', 'geographical zones', 'Trespass', 'military', 'National Security Act 2023',
    'licence', 'CC BY-NC 4.0', 'ODbL', 'Responsible publication', 'vulnerable', 'Berkeley Protocol', 'not legal advice']) assert.ok(new RegExp(t, 'i').test(law), t);
});

test('safety: no tools for finding or profiling private people are named', () => {
  const all = [...GUIDES.map(g => read(`content/${g}.md`)), read('index.html'), ...['sources.js', 'features.js', 'measure.js', 'overview.js'].map(f => read(`js/${f}`))].join('\n').toLowerCase();
  for (const bad of ['sherlock', 'maigret', 'whatsmyname', 'holehe', 'namechk', 'pipl', 'spokeo', 'pimeyes', 'facecheck', 'truepeoplesearch', 'thatsthem', 'social-searcher', 'epieos']) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(all), bad);
  }
});

/* ---------------------------------------------------------------- the page */
test('page wiring follows the PRP contract', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en" data-suite="rt" class="prp">/);
  assert.match(html, /<title>GEOINT &amp; IMINT Dashboard · PRP<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/design\/prp\.css">/);
  assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="rt" data-module="geoint" data-shell="\.\.\/" defer><\/script>/);
  assert.match(html, /class="prp-eyebrow">Realtime Intelligence <span class="sep">·<\/span> GEOINT &amp; IMINT Dashboard</);
  assert.ok(!/JDP-I\b|H&amp;P|F&amp;E/.test(html), 'no old brand names');
  const tabs = [...html.matchAll(/role="tab" id="tab-([a-z]+)" aria-controls="panel-([a-z]+)"/g)];
  assert.deepEqual(tabs.map(t => t[1]), U.TABS);
  for (const t of tabs) { assert.equal(t[1], t[2]); assert.match(html, new RegExp(`id="panel-${t[1]}"[^>]*role="tabpanel"`)); }
  for (const m of html.matchAll(/(?:src|href)="(https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)[^"]+)"/g)) assert.match(m[1], /@\d+\.\d+\.\d+\//, `pinned: ${m[1]}`);
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.js" integrity="sha256-/);
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.suncalc, 'https://cdn.jsdelivr.net/npm/suncalc@2.1.1/index.js');
  assert.match(map.integrity[map.imports.suncalc], /^sha384-/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'element ids are unique');
});

test('CSS uses PRP tokens, not raw colours', () => {
  const css = read('geoint.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const outside = css.replace(/:root\s*\{[^}]*\}/g, '').replace(/url\("data:[^"]*"\)/g, '');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(outside), 'no hex colours outside token definitions');
  assert.ok(!/\brgba?\(/i.test(outside), 'no rgb() colours outside token definitions');
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

/* ---------------------------------------------------------------- live checks (GEOINT_LIVE=1) */
const live = { skip: !LIVE && 'set GEOINT_LIVE=1 to call the public APIs' };
const get = (url, { timeout = 30000, ...opts } = {}) => fetch(url, { ...opts, headers: { 'User-Agent': UA, Origin: 'https://jdpi.pages.dev', ...(opts.headers || {}) }, signal: AbortSignal.timeout(timeout) });

test('live: NASA GIBS imagery, availability and fire rendering (CORS open)', live, async () => {
  const today = new Date().toISOString().slice(0, 10), from = U.addDays(today, -10);
  const dom = await get(S.gibsDomainsUrl(S.IMAGERY[0], from, today));
  assert.equal(dom.headers.get('access-control-allow-origin'), '*');
  const day = S.latestDay(S.parseGibsDomains(await dom.text()));
  assert.ok(day && day >= from, `newest day ${day}`);
  const tile = await get(S.gibsTileUrl(S.imageryById('terra'), day).replace('{z}/{y}/{x}', '3/2/4'));
  assert.equal(tile.status, 200); assert.match(tile.headers.get('content-type'), /image\/jpeg/);
  const night = await get(S.gibsTileUrl(S.imageryById('bm'), U.addDays(day, -1)).replace('{z}/{y}/{x}', '3/2/4'));
  assert.equal(night.status, 200);
  const wms = await get(`${S.GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${S.fireLayerNames(['n20'])}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&BBOX=-13280000,4000000,-13080000,4100000&WIDTH=256&HEIGHT=128&TIME=2025-01-08`);
  assert.equal(wms.status, 200); assert.match(wms.headers.get('content-type'), /image\/png/);
});

test('live: USGS and GDACS feeds parse (CORS open)', live, async () => {
  const q = await get(S.quakeFeedUrl('4.5_week'));
  assert.equal(q.headers.get('access-control-allow-origin'), '*');
  const quakes = S.normalizeQuakes(await q.json());
  assert.ok(quakes.length > 5 && quakes.every(e => Number.isFinite(e.lat) && e.url.startsWith('https://')));
  const g = await get(S.GDACS_CURRENT, { timeout: 90000 }); // GDACS sometimes takes many seconds to answer
  assert.equal(g.headers.get('access-control-allow-origin'), '*');
  const events = S.normalizeGdacs(await g.json());
  assert.ok(events.length > 0 && events.every(e => ['Red', 'Orange', 'Green'].includes(e.level)));
});

test('live: terrain tiles and base maps (CORS open for the elevation reader)', live, async () => {
  const t = await get(S.terrariumUrl(G.tileOf(46.55, 7.98, 12)));
  assert.equal(t.status, 200); assert.equal(t.headers.get('access-control-allow-origin'), '*');
  for (const u of [S.EOX_S2, S.ESRI_IMAGERY, S.BASEMAPS.light[0], S.BASEMAPS.dark[0]]) {
    const r = await get(u.replace('{z}', '5').replace('{y}', '11').replace('{x}', '15'));
    assert.equal(r.status, 200, u);
  }
});

test('live: pinned CDN files match their integrity hashes', live, async () => {
  const html = read('index.html'), measure = read('js/measure.js');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const pairs = [[map.imports.suncalc, map.integrity[map.imports.suncalc]], [measure.match(/TZ_URL = '([^']+)'/)[1], measure.match(/TZ_SRI = '([^']+)'/)[1]]];
  for (const [url, sri] of pairs) {
    const body = Buffer.from(await (await get(url)).arrayBuffer());
    assert.equal(`sha384-${createHash('sha384').update(body).digest('base64')}`, sri, url);
  }
});

test('live: Copernicus Browser still knows the dataset and layer ids we link to', live, async () => {
  const txt = await (await get('https://browser.dataspace.copernicus.eu/datasets.txt')).text();
  for (const d of S.COPERNICUS_DATASETS) {
    const block = txt.split(/^### /m).find(b => b.startsWith(d.dataset + '\n'));
    assert.ok(block, d.dataset);
    assert.ok(block.includes('`' + d.layer + '`'), `${d.dataset} ${d.layer}`);
  }
});

test('live: FIRMS answers, but sends no CORS header (so the page uses its WMS for maps)', live, async () => {
  const r = await get(S.firmsAreaUrl('0'.repeat(32), 'VIIRS_NOAA20_NRT', [-1, -1, 1, 1], 1));
  assert.equal(r.status, 400); assert.match(await r.text(), /Invalid MAP_KEY/);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('live: one Nominatim search, identified and within the usage policy', live, async () => {
  const r = await get(S.nominatimSearchUrl('Kalamata airport'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const list = await r.json();
  assert.ok(list.length >= 1 && Math.abs(+list[0].lat - 37.07) < 0.2);
});

test('live: one small Overpass query on each public server, with CORS (skipped where a server is down or busy)', live, async t => {
  const ql = S.buildOverpassQuery(S.presetById('airfields'), { bbox: [53.30, -6.35, 53.45, -6.15] });
  let answered = 0;
  for (const s of S.OVERPASS_SERVERS) {
    await t.test(s.name, async tt => {
      let r;
      try { r = await fetch(s.url, { method: 'POST', body: new URLSearchParams({ data: ql }), headers: { 'User-Agent': UA, Origin: 'https://jdpi.pages.dev' }, signal: AbortSignal.timeout(45000) }); }
      catch (err) { tt.skip(`no answer from ${s.url}: ${err.message}`); return; }
      if ([406, 429, 502, 503, 504].includes(r.status)) { tt.skip(`server busy or refusing scripts (${r.status})`); return; }
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('access-control-allow-origin'), '*', 'browsers may read the answer');
      const els = S.normalizeOverpass(await r.json());
      assert.ok(els.some(e => /dublin/i.test(e.name)), 'Dublin Airport is mapped');
      answered++;
    });
  }
  if (!answered) t.diagnostic('no public Overpass server answered: the Features tab offers Overpass Turbo instead');
});

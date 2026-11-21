// Stand-ins (build C, 21 November 2026): four series from producers other than the World Bank, each shown BESIDE the
// World Bank series VM leaves out (its absent line in the Omni-Map, its row and originator line in National Analysis),
// never in its place: the Global Carbon Project's fossil CO2 per person (CC BY 4.0), SatPM's PM2.5 exposure (CC BY 4.0),
// the US EIA's energy consumption per person (public domain) and the Global Military Spending Dataset's share of GDP
// (CC0 1.0), which ends in 2019. Each is joined by ISO3, by name through Natural Earth, or by state number through
// National Analysis's table; nothing joins by a guessed name. The renewable share of final energy, Internet users and
// mobile subscriptions are still left out, and the pages say so. A saved view with fill=wb:<code> opens as before.
// The page checks need JDPI_URL (npm run test:e2e -- tests/standins.test.mjs); the rest run in the unit suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync, deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pageTest, launch } from './tools/pages.mjs';
import { STANDINS, STILL_LEFT_OUT, SATPM_NAMES, SATPM_LEFT, GW_JOIN, GMSD_LEFT, GMSD_FROM, OUT, NATIONAL_FILE, parseGcp, parseSatpm, parseEia, parseGmsd, unzipOne, csvLine, lostSince } from '../omni/scripts/build-standins.mjs';
import { BARRED } from '../omni/scripts/build-wb.mjs';
import { isoResolver, neCountries } from '../omni/scripts/country-names.mjs';
import { catalogue } from '../omni/lib/layers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const text = f => readFileSync(join(ROOT, f), 'utf8');
const DOC = read('omni/data/layers.json');
const SOURCES = read('integration/sources.json').sources;
const NE = neCountries(ROOT), NE_CODES = new Set(NE.map(c => c.iso3).filter(Boolean)), byName = isoResolver(NE);
const LIMIT_GZ = 1.5 * 1024 * 1024;
const IDS = ['standin-co2-gcp', 'standin-pm25-satpm', 'standin-energy-eia', 'standin-milex-gmsd'];
const UNITS = { 'standin-co2-gcp': 't CO₂ per person', 'standin-pm25-satpm': 'µg/m³', 'standin-energy-eia': 'million Btu per person', 'standin-milex-gmsd': '% of GDP' };
const PRODUCERS = { 'standin-co2-gcp': 'Global Carbon Project', 'standin-pm25-satpm': 'SatPM', 'standin-energy-eia': 'Energy Information Administration', 'standin-milex-gmsd': 'Global Military Spending Dataset' };

test('the four stand-ins: each a free series from a different producer, beside one of the World Bank series VM leaves out', () => {
  assert.deepEqual(STANDINS.map(s => s.id), IDS);
  assert.deepEqual(STANDINS.map(s => s.standsFor).sort(), ['EG.USE.PCAP.KG.OE', 'EN.ATM.PM25.MC.M3', 'EN.GHG.CO2.PC.CE.AR5', 'MS.MIL.XPND.GD.ZS']);
  for (const s of STANDINS) {
    assert.ok(BARRED[s.standsFor], `${s.id}: stands beside a series VM leaves out`);
    const src = SOURCES.find(x => x.id === s.source);
    assert.ok(src, `${s.id}: ${s.source} is in sources.json`);
    assert.equal(src.terms, 'host'); assert.equal(src.standing, 'free');
    assert.match(src.licence, /^(CC BY 4\.0|CC0 1\.0|Public domain)/, `${s.id}: ${src.licence}`);
    assert.equal(src.termsRead, '2026-11-21', `${s.id}: terms read today`);
    assert.ok(!('inventory' in src), `${s.id}: not one of the 42 of the licence inventory`);
  }
  // In the Omni-Map: four new layers under their own group, never the World Bank's id or code.
  const by = Object.fromEntries(DOC.layers.map(e => [e.id, e]));
  for (const id of IDS) {
    const e = by[id], spec = STANDINS.find(s => s.id === id);
    assert.ok(e, `${id} is in layers.json`);
    assert.equal(e.group, 'standin'); assert.equal(e.module, 'omni-map'); assert.equal(e.role, 'fill');
    assert.equal(e.standsFor, spec.standsFor);
    assert.ok(!('wb' in e), `${id}: no wb field, so fill=wb:${spec.standsFor} never opens it`);
    assert.ok(e.legend.includes(PRODUCERS[id]) && e.legend.includes('not the World Bank’s series'), `${id}: ${e.legend}`);
    assert.match(e.method, /^VM’s own text\./);
    assert.equal(e.style.unit, UNITS[id]);
    assert.ok(e.line.includes(`${e.time.from}–${e.time.to}`), `${id}: its line names its years`);
    assert.ok(e.line.includes('not the World Bank’s'), `${id}: its line says whose figure it is`);
  }
  // The seven World Bank series stay absent, and their saved views open as before: nothing answers fill=wb:<code>.
  assert.deepEqual(DOC.absent.map(a => a.id).sort(), ['wb-eg-fec-rnew-zs', 'wb-eg-use-pcap-kg-oe', 'wb-en-atm-pm25-mc-m3', 'wb-en-ghg-co2-pc-ce-ar5', 'wb-it-cel-sets-p2', 'wb-it-net-user-zs', 'wb-ms-mil-xpnd-gd-zs']);
  const cat = catalogue(DOC);
  for (const code of Object.keys(BARRED)) assert.equal(cat.byFill.get(`wb:${code}`), undefined, `fill=wb:${code} answers nothing, as before`);
  for (const id of IDS) assert.equal(cat.byFill.get(id), id, `fill=${id} opens the stand-in`);
  assert.equal(cat.byFill.get('wb:NY.GDP.MKTP.CD'), 'wb-ny-gdp-mktp-cd', 'a kept World Bank view opens as before');
});

test('the stand-ins’ files: vm-series/1, ISO3 keys only, their years and units, under 1.5 MB gzipped, listed with sha256', () => {
  for (const id of IDS) {
    const e = DOC.layers.find(x => x.id === id), f = `${OUT}/${id}.json`;
    assert.equal(e.data, f);
    assert.deepEqual(e.files.map(x => x.file), [f]);
    const b = readFileSync(join(ROOT, f)), d = JSON.parse(b);
    assert.equal(createHash('sha256').update(b).digest('hex'), e.files[0].sha256, `${id}: sha256`);
    assert.equal(b.length, e.files[0].bytes);
    assert.ok(gzipSync(b, { level: 9 }).length <= LIMIT_GZ, `${id}: under 1.5 MB gzipped`);
    assert.equal(d.format, 'vm-series/1'); assert.equal(d.join, 'iso3'); assert.equal(d.layer, id); assert.equal(d.unit, UNITS[id]);
    assert.equal(d.standsFor, e.standsFor); assert.equal(d.line, e.line);
    assert.deepEqual([e.time.from, e.time.to], [d.years[0], d.years.at(-1)]);
    d.years.forEach((y, i) => i && assert.equal(y, d.years[i - 1] + 1, `${id}: years run one by one`));
    for (const [k, vs] of Object.entries(d.values)) {
      assert.match(k, /^[A-Z]{3}$/, `${id}: ${k} is an ISO3 code`);
      assert.equal(vs.length, d.years.length, `${id}: ${k}`);
      assert.ok(vs.every(v => v === null || Number.isFinite(v)), `${id}: ${k}: numbers or null`);
    }
    assert.ok(Object.keys(d.values).length >= 140, `${id}: ${Object.keys(d.values).length} countries`);
    for (const i of [0, d.years.length - 1]) assert.ok(Object.values(d.values).some(v => v[i] != null), `${id}: ${d.years[i]} has values`);
    // Every value with a code Natural Earth has no shape or point for is listed, by name, not dropped.
    assert.deepEqual(Object.keys(d.unplaced).sort(), Object.keys(d.values).filter(k => !NE_CODES.has(k)).sort(), `${id}: unplaced`);
  }
  // GMSD: its share-of-GDP series ends in 2019, and the line says so; VM shows it from 1993, as a percentage.
  const g = read(`${OUT}/standin-milex-gmsd.json`);
  assert.equal(g.years.at(-1), 2019); assert.equal(g.years[0], GMSD_FROM);
  assert.ok(g.line.includes('it ends in 2019') && g.line.includes('multiplies by 100'), g.line);
  assert.ok(Object.values(g.values).flat().every(v => v === null || (v >= 0 && v <= 100)));
  assert.equal(g.values.USA[g.years.indexOf(2019)] > 1 && g.values.USA[g.years.indexOf(2019)] < 10, true, 'a percentage, not a fraction');
  for (const [gw, iso] of Object.entries(GW_JOIN)) assert.ok(NE_CODES.has(iso), `GW_JOIN ${gw} → ${iso} is a code of Natural Earth’s`);
  assert.deepEqual(Object.keys(g.aggregates).sort(), Object.keys(GMSD_LEFT).sort(), 'the numbers not drawn are the ones listed');
  // SatPM: every name in its file is placed or listed; none is guessed.
  const s = read(`${OUT}/standin-pm25-satpm.json`);
  assert.equal(s.regions, Object.keys(s.joined).length + Object.keys(s.aggregates).length, 'each of SatPM’s names joined or listed');
  assert.ok(s.regions >= 240, `${s.regions} names in SatPM’s file`);
  for (const [name, code] of Object.entries(s.joined)) assert.ok(byName(name) === code || SATPM_NAMES[name] === code, `${name} → ${code}: by Natural Earth’s name or VM’s table`);
  for (const name of Object.keys(s.aggregates)) assert.ok(SATPM_LEFT[name], `${name}: listed with its reason`);
  assert.equal(new Set(Object.values(s.joined)).size, Object.keys(s.joined).length, 'no country joined twice');
  for (const [name, code] of Object.entries(SATPM_NAMES)) {
    assert.ok(NE_CODES.has(code), `SATPM_NAMES: ${name} → ${code} is one of Natural Earth’s codes`);
    assert.equal(byName(name), null, `SATPM_NAMES: ${name} is not already a name Natural Earth or VM’s crosswalk holds`);
  }
  assert.equal(s.values.IND.length, s.years.length);
  assert.deepEqual([s.years[0], s.years.at(-1)], [1998, 2024]);
  // The EIA: its own regions and groups are not drawn; Kosovo is XKX.
  const eia = read(`${OUT}/standin-energy-eia.json`);
  assert.ok(eia.values.XKX && !eia.values.XKS, 'the EIA’s XKS is Kosovo, XKX');
  assert.ok(Object.keys(eia.aggregates).includes('WORL') && !eia.values.WORL);
  const gcp = read(`${OUT}/standin-co2-gcp.json`);
  assert.ok(gcp.values.XKX && !gcp.values.KSV, 'the Global Carbon Project’s KSV is Kosovo, XKX');
  assert.ok(!gcp.values.WLD);
});

test('the parsers: each producer’s join on small samples; a name or number that joins to nothing stops the build', () => {
  assert.deepEqual(csvLine('"Bonaire, Sint Eustatius",BES,1'), ['Bonaire, Sint Eustatius', 'BES', '1']);
  const gcp = parseGcp('"Country","ISO 3166-1 alpha-3","UN M49","Year","Total","Coal"\n"Kosovo","KSV",,2024,4.5,3\n"Global","WLD",,2024,4.7,2\n"Ireland","IRL",372,2023,6.5,0.3\n"Ireland","IRL",372,2024,6.2,0.3\n');
  assert.deepEqual(gcp.years, [2023, 2024]); assert.deepEqual(gcp.values.XKX, [null, 4.5]); assert.deepEqual(gcp.values.IRL, [6.5, 6.2]);
  assert.deepEqual(Object.keys(gcp.aggregates), ['WLD']);
  const head = 'Region,Year,Population-Weighted PM2.5 [ug/m3],Geographic-Mean PM2.5 [ug/m3]\n';
  const sat = parseSatpm(head + 'Ireland,2024,6.1,5\nSwaziland,2024,12.3,11\nCaspian Sea,2024,20,20\n', byName);
  assert.deepEqual(sat.joined, { Ireland: 'IRL', Swaziland: 'SWZ' }); assert.deepEqual(sat.values.SWZ, [12.3]); assert.deepEqual(Object.keys(sat.aggregates), ['Caspian Sea']);
  assert.throws(() => parseSatpm(head + 'Atlantis,2024,1,1\n', byName), /Atlantis/, 'an unknown name is never guessed');
  assert.throws(() => parseSatpm('Region,Year,PM\nIreland,2024,1\n', byName), /unexpected columns/);
  const line = (code, geo, data, units = 'million Btu per person') => JSON.stringify({ series_id: `INTL.47-33-${code}-MBTUPP.A`, name: `Energy consumption per capita, ${code}, Annual`, units, copyright: 'None', geography: geo, last_updated: '2026-08-21T19:06:13-04:00', data });
  const eia = parseEia([line('XKS', 'XKS', [['2024', 60], ['2023', 'NA']]), line('WORL', 'WORL', [['2024', 77]]), line('EURO', 'ALB+AUT', [['2024', 105]]), line('IRL', 'IRL', [['2023', 120], ['2024', 118]])].join('\n'));
  assert.deepEqual(eia.years, [2023, 2024]); assert.deepEqual(eia.values.XKX, [null, 60]); assert.deepEqual(Object.keys(eia.aggregates).sort(), ['EURO', 'WORL']);
  assert.throws(() => parseEia(line('IRL', 'IRL', [['2024', 1]], 'quadrillion Btu')), /units/);
  const gw = new Map([[205, 'IRL'], [345, 'SRB']]), nm = new Map([['IRL', 'Ireland'], ['SRB', 'Serbia']]);
  const tab = 'gwno\tyear\tmilexgdp\n205\t1990\t0.012\n205\t2019\t0.003\n340\t2019\t0.0164\n345\t2004\t0.015\n';
  const gm = parseGmsd(tab, new Map([...gw].filter(([k]) => !GMSD_LEFT[k])), nm);
  assert.deepEqual(gm.values.IRL, [0.3]); assert.deepEqual(gm.values.SRB, [1.64]); assert.equal(gm.years[0], 2019, 'before 1993 is not shown');
  assert.deepEqual(Object.keys(gm.aggregates), ['345']); assert.equal(gm.last, 2019);
  assert.throws(() => parseGmsd('gwno,year,milexgdp\n999,2019,0.1\n', gw, nm), /999/, 'an unknown number stops the build');
  // A zip read in memory, as the EIA's bulk file is.
  const body = Buffer.from('hello'), comp = deflateRawSync(body), name = Buffer.from('INTL.txt');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(body.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(0, 42);
  const cdOff = 30 + name.length + comp.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(cdOff, 16);
  assert.equal(unzipOne(Buffer.concat([local, name, comp, cen, name, end]), 'INTL.txt').toString(), 'hello');
});

// Fixer, 21 Nov 2026: the EIA's per-person series gives 0 where it has no figure (Gibraltar, the Faroe Islands and
// Wake Island are 0 in every year 1980–2024, Hungary in 1980–1990); VM reads that 0 as no value, never as a figure.
test('the EIA’s 0 is no value: never drawn or shown as a figure, and a place with only 0 is not drawn', () => {
  const line = (code, data) => JSON.stringify({ series_id: `INTL.47-33-${code}-MBTUPP.A`, name: `Energy consumption per capita, ${code}, Annual`, units: 'million Btu per person', copyright: 'None', geography: code, last_updated: '2026-08-21T19:06:13-04:00', data });
  const p = parseEia([line('GIB', [['2023', 0], ['2024', 0]]), line('HUN', [['2023', 0], ['2024', 98.7]]), line('IRL', [['2023', 120], ['2024', 118]])].join('\n'));
  assert.deepEqual(p.values.HUN, [null, 98.7], 'a 0 year is no value');
  assert.ok(!('GIB' in p.values), 'a place whose every value is 0 is not drawn');
  assert.deepEqual(p.zeroOnly, { GIB: 'GIB' }, 'and it is listed, not dropped unseen');
  const eia = read(`${OUT}/standin-energy-eia.json`);
  const zero = Object.entries(eia.values).filter(([, v]) => v.some(x => x === 0)).map(([k]) => k);
  assert.deepEqual(zero, [], `the Omni-Map layer holds no 0: ${zero.join(' ')}`);
  for (const c of ['WAK', 'GIB', 'FRO', 'SUN']) assert.ok(!(c in eia.values) && !(c in eia.unplaced), `${c}: only 0 in the EIA’s file, so not drawn or listed as placed`);
  assert.ok(eia.zeroOnly && 'WAK' in eia.zeroOnly && 'FRO' in eia.zeroOnly, 'the places with only 0 are named in the file');
  assert.ok(eia.line.includes('VM reads the EIA’s 0 as no value'), eia.line);
  const nat = read(NATIONAL_FILE).series.find(s => s.id === 'standin-energy-eia');
  const z = Object.entries(nat.latest).filter(([, [, v]]) => v === 0).map(([k]) => k);
  assert.deepEqual(z, [], `National Analysis shows no latest value of 0: ${z.join(' ')}`);
  assert.equal(nat.line, eia.line);
  const e = DOC.layers.find(x => x.id === 'standin-energy-eia');
  assert.ok(!/Wake Island|Gibraltar \(GIB\)/.test(Object.values(e.unplaced).join(' ')), 'the key no longer lists them as values VM cannot place');
});

// The second review of 21 November 2026: a download cut short could pass the build's checks (one country fewer is still
// "enough countries"), and National Analysis wrote a stand-in's year and its producer's address as the file gave them.
test('a file cut short stops the stand-in build, and National Analysis takes no year or address on trust', () => {
  const before = { years: [2000, 2001], values: { IRL: [1, 2], ZWE: [3, 4] } };
  assert.deepEqual(lostSince(before, { years: [2000, 2001], values: { IRL: [1, 2] } }), ['ZWE']);
  assert.deepEqual(lostSince(before, { years: [2000, 2001], values: { IRL: [1, 2] } }, new Set(['ZWE'])), [], 'a real change is accepted by its code');
  assert.deepEqual(lostSince(before, { years: [2000], values: { IRL: [1], ZWE: [3] } }), ['the years after 2000']);
  assert.deepEqual(lostSince(null, { years: [2000], values: {} }), [], 'a first build has nothing to lose');
  assert.match(text('omni/scripts/build-standins.mjs'), /const lost = lostSince\(prevOf\(file\), s, allowLost\);\s+if \(lost\.length\) throw/);
  const body = text('q/national.html').replace(/\r\n/g, '\n').match(/const standinRows = ([\s\S]*?\n\}\)\.join\(''\));/)?.[1];
  assert.ok(body, 'the row builder is found in the page');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rows = new Function('esc', 'fmtVal', `return ${body}`)(esc, v => String(v));
  const one = (latest, url) => rows({ series: [{ id: 's', standsFor: 'X', label: 'L', unit: 'u', producer: 'P', licence: 'CC0', line: 'l', url, latest: { IRL: latest } }] }, 'X', 'IRL');
  const good = one([2019, 0.5], 'https://example.org/data');
  assert.ok(good.includes('latest 2019') && good.includes('<a href="https://example.org/data"') && good.includes('<div class="v">0.5</div>'), good);
  const bad = one(['<img src=x onerror=alert(1)>', 0.5], 'javascript:alert(1)');
  assert.ok(!bad.includes('<img') && !bad.includes('javascript:') && bad.includes('no value for this country') && !bad.includes('<a '), bad);
  assert.ok(one([2019, 'x'], 'https://example.org/').includes('no value for this country'), 'a value that is not a number is not shown');
});

// Fixer, 21 Nov 2026: the Global Carbon Project's metadata names its last component "Other carbonates", not "other industry".
test('the CO₂ stand-in’s line names the Global Carbon Project’s own components', () => {
  const g = read(`${OUT}/standin-co2-gcp.json`);
  assert.ok(g.line.includes('coal, oil, gas, cement, flaring and other carbonates'), g.line);
  assert.ok(!/other industry/.test(g.line) && !/other industry/.test(DOC.layers.find(x => x.id === 'standin-co2-gcp').method));
  assert.ok(!/other industry/.test(read(NATIONAL_FILE).series.find(s => s.id === 'standin-co2-gcp').line));
});

// Fixer, 21 Nov 2026: EOX's own pages disagree on commercial use of the 2016 layer; the conflict is recorded with both
// sentences and their addresses and waits on VM's owner. The 2018-to-2025 entry no longer credits the licence summary
// with a year it does not name. The EIA's database-right line says its terms are silent and marks VM's inference.
test('sources.json: EOX’s 2016 edition held out with both sentences recorded; the EIA’s database right said as silent', () => {
  const by = Object.fromEntries(SOURCES.map(s => [s.id, s]));
  // The 2016 edition was built as a base of GEOINT's Measure tab and held out before it went live (21 November 2026):
  // EOX's two pages disagree on commercial use, so no entry offers it and the barred entry says why.
  assert.ok(!('eoxcloudless-2016' in by), 'the 2016 edition is not offered');
  assert.ok(by.eoxcloudless.why.includes('For the year 2016, EOxCloudless is licensed under the Creative Commons Attribution 4.0 International License') && by.eoxcloudless.why.includes('not offered either'), by.eoxcloudless.why);
  assert.ok(!/commercial use of the editions of 2018 to 2025 needs EOX's paid licence/.test(by.eoxcloudless.why), by.eoxcloudless.why);
  assert.ok(by.eoxcloudless.why.includes('names no year'), by.eoxcloudless.why);
  const e = by['eia-intl'].databaseRight;
  assert.match(e, /^EIA’s terms are silent on the EU database right\./);
  assert.ok(e.includes('VM infers') && e.includes('not read today'), e);
});

test('National Analysis: each stand-in’s latest value beside the World Bank row, the three still left out said', () => {
  const d = read(NATIONAL_FILE), idx = read('national/data/index.json'), iso = new Set(idx.countries.map(c => c.iso3));
  assert.equal(d.format, 'vm-standins/1'); assert.match(d.generated, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(d.series.map(s => s.id), IDS);
  for (const s of d.series) {
    const e = DOC.layers.find(x => x.id === s.id);
    assert.equal(s.line, e.line); assert.equal(s.unit, UNITS[s.id]); assert.match(s.url, /^https:\/\//);
    assert.ok(Object.keys(s.latest).length >= 140, `${s.id}: ${Object.keys(s.latest).length} countries`);
    for (const [k, [y, v]] of Object.entries(s.latest)) { assert.ok(iso.has(k), `${s.id}: ${k}`); assert.ok(y >= s.from && y <= s.to && Number.isFinite(v), `${s.id}: ${k}`); }
  }
  assert.ok(Object.values(d.series.find(s => s.id === 'standin-milex-gmsd').latest).every(([y]) => y <= 2019));
  assert.deepEqual(d.stillLeftOut.map(x => x.code), STILL_LEFT_OUT.map(x => x.code));
  const html = text('q/national.html');
  assert.ok(html.includes("'../national/data/standins.json'"), 'the page reads the stand-ins’ file');
  assert.match(html, /class="sti"/, 'a stand-in row of its own, not an indicator row');
  const foot = html.match(/<p id="standins-note">([\s\S]*?)<\/p>/)?.[1] || '';
  for (const w of ['Global Carbon Project', 'SatPM', 'US Energy Information Administration', 'Global Military Spending Dataset', 'ends in 2019', 'renewable share of final energy', 'Internet users', 'mobile subscriptions', 'cover Europe only', 'beside']) assert.ok(foot.includes(w), `the footer says "${w}"`);
  // The seven World Bank rows keep their originator lines.
  assert.equal((html.match(/^\s+'(MS\.MIL\.XPND\.GD\.ZS|EG\.FEC\.RNEW\.ZS|EN\.ATM\.PM25\.MC\.M3|IT\.CEL\.SETS\.P2)':/gm) || []).length, 4);
  assert.match(html, /'EG\.FEC\.RNEW\.ZS': IEA, 'EG\.USE\.PCAP\.KG\.OE': IEA, 'EN\.GHG\.CO2\.PC\.CE\.AR5': IEA/);
});

test('Omni-Map: the stand-ins’ group, a line beside each absent series, and the three still left out', () => {
  const lv = text('omni/lib/layer-view.js');
  assert.ok(lv.includes('standin: \'Stand-ins from other producers, by country\''), 'the group’s name');
  assert.ok(/NO_STANDIN = \{ 'EG\.FEC\.RNEW\.ZS'/.test(lv), 'the three still left out');
  assert.ok(lv.includes('the free series VM found cover Europe only'));
  assert.ok(lv.includes('A different producer’s figure stands beside it'));
  assert.ok(lv.includes('s.notDrawn'), 'the key names who gives what is not drawn');
});

test('sources.json, the refreshes and the suite: each new source’s terms, a scheduled run that needs no key, the test in npm test', () => {
  const by = Object.fromEntries(SOURCES.map(s => [s.id, s]));
  for (const id of ['wikipedia-rsp', 'eu-fsf', 'uk-sanctions-list', 'gcp-fossil-co2', 'satpm-v5gl06', 'eia-intl', 'gmsd-v9']) {
    const s = by[id];
    assert.ok(s, `${id} is in sources.json`);
    assert.equal(s.terms, 'host', id); assert.equal(s.standing, 'free', id); assert.equal(s.termsRead, '2026-11-21', id);
    assert.ok(s.termsQuote.split(/\s+/).length < 25 + 6, `${id}: the deciding words, short`);
    assert.ok(typeof s.databaseRight === 'string' && s.databaseRight.trim(), `${id}: the database right`);
    assert.ok(!('inventory' in s), id);
  }
  assert.equal(by.eoxcloudless.terms, 'not-held', 'the editions of 2018 to 2025 stay barred');
  const wf = f => text(`.github/workflows/${f}`);
  assert.match(wf('standins-refresh.yml'), /node omni\/scripts\/build-standins\.mjs/);
  assert.match(wf('standins-refresh.yml'), /tests\/standins\.test\.mjs/);
  assert.match(wf('rsp-refresh.yml'), /cron: '41 5 \* \* 1'/); assert.match(wf('rsp-refresh.yml'), /node briefing\/scripts\/build-rsp\.mjs/);
  assert.match(wf('sanctions-refresh.yml'), /cron: '17 7 \* \* \*'/); assert.match(wf('sanctions-refresh.yml'), /node osint\/scripts\/build-sanctions\.mjs/);
  for (const f of ['standins-refresh.yml', 'rsp-refresh.yml', 'sanctions-refresh.yml']) assert.ok(!/secrets\.(?!inherit)|API_KEY|TOKEN:/.test(wf(f).replace(/secrets: inherit/g, '')), `${f}: no key`);
  const fresh = text('.github/scripts/freshness.mjs');
  for (const f of ['briefing/data/rsp.json', 'osint/data/sanctions-index.json', NATIONAL_FILE]) assert.ok(fresh.includes(`{ file: '${f}'`), `the daily check reads ${f}`);
  assert.ok(JSON.parse(text('package.json')).scripts.test.includes('tests/standins.test.mjs'));
  assert.ok(existsSync(join(ROOT, 'omni/scripts/build-standins.mjs')));
});

/* ---------------------------------------------------------------- the pages */
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the pages (npm run test:e2e -- tests/standins.test.mjs)' };
const ready = page => page.waitForFunction(() => window.omniState?.ready, null, { timeout: 60000 });
const settled = (page, on) => page.waitForFunction(ids => { const s = window.omniState; return s?.ready && s.lv && JSON.stringify(s.lv.on) === JSON.stringify(ids) && ids.every(id => s.lv.drawn.includes(id)); }, on, { timeout: 60000 }).then(() => page.evaluate(() => window.omniState));

test('page: the Omni-Map draws a stand-in under its own group, beside the absent line; fill=wb:<code> opens as before', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const errors = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width > 400 ? 900 : 844 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/omni/index.html#vr=1&t=2000..2025&at=2019&show=frame&step=y&base=plain&fill=standin-milex-gmsd`, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const s = await settled(page, ['standin-milex-gmsd']);
    assert.match(s.recipe, /&fill=standin-milex-gmsd(&|$)/);
    const lg = s.legend.find(l => l.layer === 'standin-milex-gmsd')?.text || '';
    assert.ok(lg.includes('Global Military Spending Dataset') && lg.includes('not the World Bank’s series'), lg.slice(0, 300));
    assert.match(await page.textContent('#layers-body li[data-group="standin"] > details > summary'), /^Stand-ins from other producers, by country: 4 layers, one fill at a time$/);
    const absent = await page.textContent('#layers-body li[data-layer="wb-ms-mil-xpnd-gd-zs"]');
    assert.ok(absent.includes('A different producer’s figure stands beside it: Military spending, % of GDP (GMSD, to 2019), by country'), absent);
    for (const id of ['wb-eg-fec-rnew-zs', 'wb-it-net-user-zs', 'wb-it-cel-sets-p2']) assert.ok((await page.textContent(`#layers-body li[data-layer="${id}"]`)).includes('the free series VM found cover Europe only'), id);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`);
    // A saved view of the World Bank's series opens as before: nothing drawn in its place.
    await page.goto(`${BASE}/omni/index.html#vr=1&t=2000..2025&at=2019&show=frame&step=y&base=plain&fill=wb:MS.MIL.XPND.GD.ZS`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    const w = await settled(page, []);
    assert.ok(!/standin/.test(w.recipe), w.recipe);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

test('page: National Analysis shows each stand-in beside its World Bank row, with its producer, year and line', PAGE, async t => {
  const browser = await launch({ args: ['--mute-audio'] });
  t.after(() => browser.close());
  const d = read(NATIONAL_FILE), by = Object.fromEntries(read('national/data/index.json').countries.map(c => [c.iso3, c]));
  const errors = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width > 400 ? 900 : 844 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/q/national#country=IRL`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(n => document.querySelector('#profile h2')?.textContent === n && document.querySelectorAll('#profile .sti').length === 4, by.IRL.name, { timeout: 20000 });
    const rows = await page.$$eval('#profile .sti', rs => rs.map(r => ({ id: r.dataset.standin, after: r.previousElementSibling?.dataset.code, text: r.textContent, href: r.querySelector('a')?.href })));
    for (const s of d.series) {
      const r = rows.find(x => x.id === s.id);
      assert.ok(r, s.id); assert.equal(r.after, s.standsFor, `${s.id}: right after the World Bank's row`);
      const [y] = s.latest.IRL;
      assert.ok(r.text.includes(s.label) && r.text.includes(String(y)) && r.text.includes(s.line), `${width}: ${s.id}: ${r.text}`);
      assert.equal(r.href, s.url);
    }
    // The seven World Bank rows still say whose data they are.
    assert.equal(await page.$$eval('#profile .ind .orig', os => os.length), 7);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no sideways scroll`);
    await page.close();
  }
  assert.deepEqual(errors, []);
});

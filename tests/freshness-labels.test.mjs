// Freshness lines (13 November 2026; design/prp-freshness.js): whether a page is available is one thing, how fresh its
// data is another. Every submodule's line is worked out from data, never written by hand:
//   - the rhythm a line states agrees with its workflow's cron (the copy in SCHEDULES equals each workflow file's), and
//     the rhythm a store is expected at agrees with the daily check's hours (.github/scripts/freshness.mjs STORES);
//   - every registry entry has a line, worked out from the committed files and true against them (the date it shows is
//     its store's own), with "Live" standing for nothing;
//   - each class of line, Late both from age and from status/health.json (a failing store row while the store is no
//     newer than the check; never a workflow row), Realtime Battlefield's weekly check of a monthly release, and the
//     combined line that names a late briefing;
//   - the one count of modules, and where hosting is said now (About this module, not a Host column).
// No browser and no network: part of npm run test:unit. The shell's places are tested in tests/platform.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  SCHEDULES, RHYTHM_HOURS, CLASSES, rhythmFromCron, expand, lateAfterHours, stamp, day, dayTime, period, freshnessLine, suiteLine,
  wantedFields, pick, readsOf, countWords, hostingAbout, headsOf, datasetStores, copyFacts, storeOwner, newerWords, catalogueRhythm, CATALOGUE_WORKFLOW,
} from '../design/prp-freshness.js';
import { stamp as checkStamp } from '../.github/scripts/health.mjs';
import { parseYaml } from './tools/yaml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const registry = JSON.parse(read('registry.json'));
const modules = registry.suites.flatMap(s => s.modules);
const byId = id => modules.find(m => m.id === id);
const H = 3600e3;
const NOW = Date.UTC(2026, 10, 13, 21, 0, 0); // 13 Nov 2026, 21:00 UTC

// Each workflow file's schedule, read as YAML.
const WORKFLOWS = readdirSync(join(ROOT, '.github/workflows')).filter(f => f.endsWith('.yml'));
const cronOf = file => { const y = parseYaml(read(`.github/workflows/${file}`)); const on = y.on || y[true]; return on?.schedule?.map(s => s.cron) || []; };

// The daily check's table of stores (.github/scripts/freshness.mjs STORES), read from its text: the file runs the check
// when imported. Each row: its file, its workflow, its hours (evaluated from e.g. "31 * 24"), and whether it reads
// `latest` instead of `generated`.
const STORES = [...read('.github/scripts/freshness.mjs').matchAll(/\{ file: '([^']+)', name: '[^']+', workflow: '([^']+)', every: ([\d *]+?)\s*(?:,|\})([^\n]*)/g)]
  .map(([, file, workflow, every, rest]) => ({ file, workflow, every: Function(`return ${every}`)(), latest: /when: j => j\.latest/.test(rest) }));

describe('the rhythm: from each workflow\'s cron', () => {
  test('cron fields expand as cron reads them', () => {
    assert.deepEqual(expand('1-23/6', 0, 23), [1, 7, 13, 19]);
    assert.deepEqual(expand('6,18', 0, 23), [6, 18]);
    assert.deepEqual(expand('*/8', 0, 23), [0, 8, 16]);
    assert.deepEqual(expand('5', 0, 23), [5]);
    assert.throws(() => expand('25', 0, 23));
  });
  test('rhythmFromCron names every rhythm in words, with the most hours between two runs', () => {
    assert.deepEqual(rhythmFromCron('45 1-23/6 * * *'), { phrase: 'every six hours', hours: 6 });
    assert.deepEqual(rhythmFromCron('5 6,18 * * *'), { phrase: 'twice a day', hours: 12 });
    assert.deepEqual(rhythmFromCron('23 5 * * *'), { phrase: 'daily', hours: 24 });
    assert.deepEqual(rhythmFromCron('17 6 * * 1'), { phrase: 'weekly', hours: 168 });
    assert.deepEqual(rhythmFromCron('47 3 5 * *'), { phrase: 'monthly', hours: 744 });
    assert.deepEqual(rhythmFromCron('0 0,8,16 * * *'), { phrase: 'every eight hours', hours: 8 });
    assert.deepEqual(rhythmFromCron('0 1,2 * * *'), { phrase: 'two times a day', hours: 23 }, 'uneven runs: the longest gap');
    assert.throws(() => rhythmFromCron('0 0 * 1 *'), 'months are not used');
  });
  test('every scheduled workflow\'s cron is in SCHEDULES exactly as the workflow has it, and works out to a rhythm', () => {
    const scheduled = WORKFLOWS.filter(f => cronOf(f).length && f !== 'freshness.yml');
    assert.ok(scheduled.length >= 11, `${scheduled.length} scheduled refreshes`);
    for (const f of scheduled) {
      assert.deepEqual(cronOf(f), [SCHEDULES[f]], `${f}: its cron and the copy in design/prp-freshness.js`);
      assert.ok(rhythmFromCron(SCHEDULES[f]).phrase, f);
    }
    for (const f of Object.keys(SCHEDULES).filter(k => !k.includes('/'))) assert.ok(scheduled.includes(f), `${f} is a scheduled workflow`);
  });
  test('the Political Atlas\'s monthly update, in its own repository, has the cron copied here (when that folder is beside this one)', t => {
    const atlas = join(ROOT, '../political-atlas/.github/workflows/monthly-update.yml');
    if (!existsSync(atlas)) return t.skip('political-atlas is not beside this repository');
    const y = parseYaml(readFileSync(atlas, 'utf8')), on = y.on || y[true];
    assert.deepEqual(on.schedule.map(s => s.cron), [SCHEDULES['political-atlas/monthly-update.yml']]);
  });
  test('the rhythm a store is expected at agrees with the daily check\'s hours, and Late uses the check\'s own limit', () => {
    assert.ok(STORES.length >= 14, `${STORES.length} stores read from freshness.mjs`);
    const parts = modules.flatMap(m => (m.data?.parts || []).map(p => ({ m, p })));
    for (const s of STORES) {
      const hits = parts.filter(x => x.p.store === s.file);
      if (s.file === 'calendar/data/2020s.json' || s.file === 'integration/catalog.json' || s.file === 'lake/data/manifest.json') assert.ok(hits.length, `${s.file} has a line`);
      for (const { m, p } of hits) {
        const wf = p.workflow || m.data.workflow;
        assert.equal(wf, s.workflow, `${m.id}: ${s.file} is written by ${s.workflow}`);
        const expected = m.data.expected ? RHYTHM_HOURS[m.data.expected] : rhythmFromCron(SCHEDULES[wf]).hours;
        assert.equal(expected, s.every, `${m.id}: expected every ${expected} h, the check says ${s.every} h`);
        assert.equal((p.late || p.time || 'generated') === 'latest', s.latest, `${m.id}: lateness read from the field the check reads`);
      }
    }
    assert.equal(lateAfterHours(6), 15); assert.equal(lateAfterHours(12), 27); assert.equal(lateAfterHours(24), 51);
  });
  test('Realtime Battlefield: checked weekly by its cron, expected monthly as the check counts it', () => {
    const d = byId('battlefield').data;
    assert.equal(rhythmFromCron(SCHEDULES[d.workflow]).phrase, 'weekly');
    assert.equal(RHYTHM_HOURS[d.expected], STORES.find(s => s.file === 'battlefield/data/realtime.json').every);
  });
  test('Highbrowse counts a briefing late by the same rule, from the same workflows as the registry', () => {
    const src = read('highbrowse/app.js');
    assert.match(src, /import \{[^}]*lateAfterHours[^}]*\} from '\.\.\/design\/prp-freshness\.js'/);
    assert.doesNotMatch(src, /\b(27|15) : (15|27)\b|=== 'political' \? 27/, 'no hours written by hand');
    const map = Function(`return ${src.match(/const WORKFLOW = (\{[^}]+\})/)[1]}`)();
    const short = { Political: 'political', Scientific: 'scientific', Economics: 'economics', Digital: 'digital' };
    for (const p of byId('highbrowse').data.parts) assert.equal(map[short[p.name]], p.workflow, p.name);
  });
});

describe('the registry: every submodule has a line, with its sources named', () => {
  test('each entry\'s data is well formed: a known class, its workflow scheduled, each part read from a file that is there', () => {
    for (const m of modules) {
      const d = m.data;
      assert.ok(d && CLASSES.includes(d.class), `${m.id}: data.class`);
      for (const p of d.parts || []) {
        const wf = p.workflow || d.workflow;
        if (['updated', 'data-to', 'reviewed', 'checked'].includes(d.class) || (d.class === 'combined' && d.parts)) assert.ok(SCHEDULES[wf], `${m.id}: ${wf} has a schedule`);
        if (/^https?:/.test(p.read)) { assert.match(p.read, /^https:\/\/political-atlas\.pages\.dev\//, `${m.id}: another site's public file`); continue; }
        assert.ok(existsSync(join(ROOT, p.read)), `${m.id}: ${p.read}`);
        const j = JSON.parse(read(p.read));
        for (const k of [p.time || 'generated', p.late].filter(Boolean)) assert.equal(typeof j[k], 'string', `${m.id}: ${p.read} has ${k}`);
        if (p.store) assert.ok(existsSync(join(ROOT, p.store)), `${m.id}: ${p.store}`);
        // A head names its store and is in step with it (tests/heads.test.mjs keeps every head so).
        if (p.read !== p.store && p.store && j.summaryOf) assert.ok(j.summaryOf[p.store], `${m.id}: ${p.read} is ${p.store}'s summary`);
        const size = Buffer.byteLength(read(p.read).replace(/\r\n/g, '\n')); // as committed, whatever this checkout's line endings
        // Over 50 KB: heavy. A file of 20 KB or more that is not a summary written for reading (Kino's Wikidata cache,
        // about 47 KB, read only for its time) is heavy too; nothing under 20 KB is, so the sidebar's lines stay dated.
        if (size > 50e3) assert.ok(p.heavy, `${m.id}: ${p.read} is ${size} bytes: marked heavy`);
        else if (p.heavy) assert.ok(size >= 20e3 && !j.summaryOf, `${m.id}: ${p.read} is ${size} bytes${j.summaryOf ? ', a summary' : ''}: not heavy`);
      }
      if (['on-demand', 'private', 'available', 'rhythm'].includes(d.class)) assert.ok(d.note, `${m.id}: its words`);
    }
  });
  test('status "live" means published; the registry\'s notes say so, and a live entry is only ever flagged as such nowhere', () => {
    assert.match(registry.notes, /"live" means published and open to readers/);
    const shell = read('shell.js');
    assert.doesNotMatch(shell, /'live': 'Live'|>Live<|● Live/, 'the shell prints no "Live"');
    assert.doesNotMatch(shell, /class="prp-kind"/, 'no kind badge in the shell');
  });
});

// The committed files as the shell reads them (pick: only the fields a line needs).
function committedReads() {
  const reads = {}, light = new Set(readsOf(modules));
  for (const [p, fields] of wantedFields(registry)) {
    if (/^https?:/.test(p) || !light.has(p)) continue; // the heavy files are read only where their own line is shown
    if (existsSync(join(ROOT, p))) reads[p] = pick(JSON.parse(read(p)), fields);
  }
  return reads;
}

describe('every entry\'s line today, worked out from the committed files', () => {
  const reads = committedReads();
  const now = Math.max(...Object.values(reads).map(j => stamp(j.generated)).filter(Number.isFinite)) + H; // an hour after the newest store
  // The Political Atlas's manifest, as political-atlas.pages.dev serves it (read by the shell; faked here, a week before
  // now, so that the line never turns Late merely because the committed stores have moved on).
  const atlasReviewed = new Date(now - 7 * 24 * H).toISOString().slice(0, 10);
  reads['https://political-atlas.pages.dev/data/manifest.json'] = { lastUpdated: atlasReviewed };
  const lines = new Map(modules.map(m => [m.id, freshnessLine(m, reads, { now })]));
  test('no line says Live, and every line is plain words', () => {
    for (const [id, l] of lines) {
      assert.doesNotMatch(l.text, /\bLive\b|realtime/i, id);
      assert.ok(l.text && l.short, id);
    }
  });
  test('each line\'s date is its store\'s own, as written in the store', () => {
    for (const m of modules) {
      const l = lines.get(m.id), d = m.data;
      if (d.class === 'combined') continue; // its oldest part's, below
      for (const p of d.parts || []) {
        const j = reads[p.read], v = j?.[p.time || 'generated'];
        if (!v || p.heavy) continue;
        const shown = d.class === 'data-to' ? period(v, now) : d.class === 'reference' ? day(stamp(j.generated), now) : (rhythmFromCron(SCHEDULES[p.workflow || d.workflow]).hours <= 24 ? dayTime(stamp(v), now) : day(stamp(v), now));
        assert.ok(l.text.includes(shown), `${m.id}: "${l.text}" shows ${shown}, from ${p.read} ${p.time || 'generated'} = ${v}`);
      }
    }
  });
  test('the rhythm each line states is its workflow\'s', () => {
    for (const m of modules) {
      const d = m.data, wf = d.workflow || d.parts?.[0]?.workflow;
      if (!wf || d.class === 'combined') continue;
      const phrase = rhythmFromCron(SCHEDULES[wf]).phrase;
      assert.ok(lines.get(m.id).text.includes(phrase), `${m.id}: "${lines.get(m.id).text}" says ${phrase}`);
    }
  });
  test('the lines as they read on 13 November 2026', () => {
    // The committed stores' own times, so these are exactly what the shell shows (the newest store an hour old). One
    // store may be late while the others are fresh (the Economics Briefing was 53 hours old on 12 November): its line
    // then starts "Late: ", and this test must still pass, or a late store would stop every deploy, the daily
    // health.json that reports it included. Being late is tested with a fixed time below ('each class of line, and Late').
    const text = id => lines.get(id).text;
    const orLate = re => new RegExp(re.source.replace(/^\^([A-Z])/, (_, c) => `^(?:Late: ${c.toLowerCase()}|${c})`));
    assert.match(text('econ-briefing'), orLate(/^Updated \d{1,2} [A-Z][a-z]{2} \d\d:\d\d UTC · every six hours$/));
    assert.match(text('briefing'), orLate(/^Updated \d{1,2} [A-Z][a-z]{2} \d\d:\d\d UTC · twice a day$/));
    assert.match(text('volatility'), orLate(/^Scored to \d{1,2} [A-Z][a-z]{2}( \d{4})? · daily$/));
    assert.match(text('battlefield'), orLate(/^Figures to [A-Z][a-z]{2} \d{4} · UCDP monthly, checked weekly$/));
    assert.match(text('war-focus'), orLate(/^Figures to \d{1,2} [A-Z][a-z]{2}( \d{4})? · checked monthly$/));
    assert.match(text('traders'), orLate(/^Trades filed to .+ · 13F holdings to .+ · checked weekly$/));
    assert.equal(text('atlas'), `Reviewed ${period(atlasReviewed, now)} · monthly review`);
    assert.equal(text('markets'), 'Available · prices delayed');
    assert.equal(text('osint'), 'On demand · asks its sources when you use it');
    assert.equal(text('tally-stick'), 'Private · runs every minute');
    assert.equal(text('learning'), 'Course · no schedule');
    assert.equal(text('retrospective'), 'Reference · no schedule');
    assert.equal(text('dashboard'), 'Each card dated');
    assert.equal(text('headlines'), 'Collected daily, country by country');
    assert.match(text('highbrowse'), /^Reads the four briefings · (all updated since \d{1,2} [A-Z][a-z]{2} \d\d:\d\d UTC|[A-Z][a-z]+ late: updated \d{1,2} [A-Z][a-z]{2} \d\d:\d\d UTC|late: .+)$/);
    assert.match(text('data-analytics'), orLate(/^Catalogue built .+ UTC · daily$/));
    // Kino's time is in its Wikidata cache (heavy): the sidebar gives its rhythm alone, and its own pages the date.
    assert.equal(text('kino-wars'), 'Checked monthly');
    const cache = 'kino/scripts/cache.json', kino = freshnessLine(byId('kino-wars'), { ...reads, [cache]: pick(JSON.parse(read(cache)), ['generated']) }, { now });
    assert.match(kino.text, orLate(/^Checked \d{1,2} [A-Z][a-z]{2} · monthly$/));
  });
  test('the heavy files are read only where asked for, and only the fields a line needs are kept', () => {
    const light = readsOf(modules), all = readsOf(modules, { heavy: true });
    assert.ok(!light.includes('kardashev/data/energy.json') && all.includes('kardashev/data/energy.json'));
    assert.ok(!light.includes('kino/scripts/cache.json') && all.includes('kino/scripts/cache.json'), 'Kino\'s 47 KB cache, read for one date, only where its line is shown in full');
    const lightBytes = light.filter(p => !/^https?:/.test(p)).reduce((n, p) => n + Buffer.byteLength(read(p).replace(/\r\n/g, '\n')), 0);
    assert.ok(lightBytes < 60e3, `the files every page reads for the sidebar: ${lightBytes} bytes`);
    assert.ok(!light.some(p => /^https?:/.test(p)) && all.includes('https://political-atlas.pages.dev/data/manifest.json'), 'another site\'s file only where its line is shown in full');
    assert.deepEqual(Object.keys(pick({ generated: 'x', latest: 'y', big: 'z', n: 1, long: 'a'.repeat(41) }, ['generated', 'latest', 'n', 'long'])), ['generated', 'latest']);
    const kardashev = freshnessLine(byId('kardashev'), reads, { now });
    assert.equal(kardashev.text, 'Reference · no schedule', 'without its heavy file, no date: the rhythm alone');
    const withIt = freshnessLine(byId('kardashev'), { ...reads, 'kardashev/data/energy.json': pick(JSON.parse(read('kardashev/data/energy.json')), ['generated']) }, { now });
    assert.equal(withIt.text, `Reference · built ${day(stamp(JSON.parse(read('kardashev/data/energy.json')).generated), now)} · no schedule`);
  });
});

describe('each class of line, and Late', () => {
  const at = h => new Date(NOW - h * H).toISOString();
  const econ = byId('econ-briefing'), battle = byId('battlefield'), hb = byId('highbrowse');
  test('updated: the time for a rhythm of a day or less, the date for weekly or monthly; the rhythm alone until read', () => {
    assert.deepEqual(freshnessLine(econ, { [econ.data.parts[0].read]: { generated: '2026-11-13T20:37:11.628Z' } }, { now: NOW }),
      { cls: 'updated', text: 'Updated 13 Nov 20:37 UTC · every six hours', short: 'Updated 13 Nov', late: false, made: Date.parse('2026-11-13T20:37:11.628Z') });
    const nat = byId('pestle');
    assert.equal(freshnessLine(nat, { [nat.data.parts[0].read]: { generated: '2026-11-13T02:14:33Z' } }, { now: NOW }).text, 'Updated 13 Nov · monthly');
    assert.equal(freshnessLine(econ, {}, { now: NOW }).text, 'Updated every six hours');
    assert.equal(freshnessLine(econ, { [econ.data.parts[0].read]: null }, { now: NOW }).text, 'Updated every six hours', 'a failed read');
  });
  test('Late from age: older than twice the rhythm plus three hours, as the daily check counts it', () => {
    const line = h => freshnessLine(econ, { [econ.data.parts[0].read]: { generated: at(h) } }, { now: NOW });
    assert.equal(line(14.9).late, false);
    const late = line(15.1);
    assert.equal(late.late, true);
    assert.match(late.text, /^Late: updated \d+ Nov \d\d:\d\d UTC · every six hours$/);
    assert.match(late.short, /^Late: updated/);
  });
  test('Late from status/health.json: a failing store row, only while the store is no newer than the check; a workflow row never', () => {
    const r = { [econ.data.parts[0].read]: { generated: at(2) } };
    const failing = (generated, rows) => ({ generated, ok: false, failing: rows });
    const storeRow = { what: 'econ/briefing/data/stories.json' }, wfRow = { what: 'briefings-refresh.yml' };
    assert.equal(freshnessLine(econ, r, { now: NOW, health: failing(at(1), [storeRow]) }).late, true, 'the check (an hour ago) found it failing, and it has not been rebuilt since');
    assert.equal(freshnessLine(econ, r, { now: NOW, health: failing(at(3), [storeRow]) }).late, false, 'rebuilt after the check: fresh again');
    assert.equal(freshnessLine(econ, r, { now: NOW, health: failing(at(1), [wfRow]) }).late, false, 'a failing workflow row marks no store late');
    const sci = byId('science-briefing');
    assert.equal(freshnessLine(sci, { [sci.data.parts[0].read]: { generated: at(2) } }, { now: NOW, health: failing(at(1), [storeRow, wfRow]) }).late, false, 'another briefing of the same workflow');
    assert.equal(freshnessLine(econ, r, { now: NOW, health: { generated: at(1), ok: true, failing: [] } }).late, false);
  });
  test('data-to: the data\'s own period, and for Realtime Battlefield the weekly check of UCDP\'s monthly release', () => {
    const p = battle.data.parts[0].read;
    const line = (generated, latest) => freshnessLine(battle, { [p]: { generated, latest } }, { now: NOW });
    // Rebuilt 18 days ago from figures to September: not late (expected monthly), however old September is.
    const fresh = line(at(18 * 24), '2026-09');
    assert.equal(fresh.text, 'Figures to Sep 2026 · UCDP monthly, checked weekly');
    assert.equal(fresh.late, false);
    assert.equal(line(at(61 * 24), '2026-09').late, false);
    assert.equal(line(at(63 * 24), '2026-09').late, true, 'more than 62 days without a rebuild');
    const vol = byId('volatility');
    assert.equal(freshnessLine(vol, { [vol.data.parts[0].read]: { generated: at(19), latest: '2026-11-12' } }, { now: NOW }).text, 'Scored to 12 Nov · daily');
    assert.equal(freshnessLine(vol, { [vol.data.parts[0].read]: { generated: at(1), latest: '2026-11-10' } }, { now: NOW }).late, true, 'its newest day is what is late (as the check reads it)');
  });
  test('Auto Trader and War Focus: their figures\' own ends, not their build', () => {
    const tr = byId('traders'), [c, i] = tr.data.parts.map(x => x.read);
    assert.equal(freshnessLine(tr, { [c]: { generated: at(80), latestFiled: '2026-11-06' }, [i]: { generated: at(80), latestPeriod: '2026-06-30' } }, { now: NOW }).text,
      'Trades filed to 6 Nov · 13F holdings to 30 Jun 2026 · checked weekly');
    const wf = byId('war-focus');
    assert.equal(freshnessLine(wf, { [wf.data.parts[0].read]: { generated: at(11 * 24), gedThrough: '2026-09-30' } }, { now: NOW }).text, 'Figures to 30 Sep 2026 · checked monthly');
  });
  test('combined (Highbrowse): every briefing in step says since when; a late one is named, never hidden by the others', () => {
    const reads = late => Object.fromEntries(hb.data.parts.map(p => [p.read, { generated: p.name === 'Economics' && late ? '2026-11-10T14:35:00Z' : at(p.name === 'Political' ? 3 : 1) }]));
    const ok = freshnessLine(hb, reads(false), { now: NOW });
    assert.equal(ok.text, `Reads the four briefings · all updated since ${dayTime(NOW - 3 * H, NOW)}`);
    assert.equal(ok.late, false);
    const one = freshnessLine(hb, reads(true), { now: NOW });
    assert.equal(one.text, 'Reads the four briefings · Economics late: updated 10 Nov 14:35 UTC');
    assert.equal(one.late, true);
    assert.equal(one.short, 'Economics late');
    assert.equal(freshnessLine(byId('dashboard'), {}, { now: NOW }).text, 'Each card dated');
  });
  test('reviewed and checked: the Political Atlas\'s review day, Kino\'s re-read of its sources', () => {
    const atlas = byId('atlas');
    assert.equal(freshnessLine(atlas, { [atlas.data.parts[0].read]: { lastUpdated: '2026-11-06' } }, { now: NOW }).text, 'Reviewed 6 Nov · monthly review');
    assert.equal(freshnessLine(atlas, {}, { now: NOW }).text, 'Reviewed monthly', 'its rhythm alone, until its manifest is read (or when it cannot be)');
    assert.equal(freshnessLine(atlas, { [atlas.data.parts[0].read]: { lastUpdated: '2026-09-06' } }, { now: NOW }).late, true, 'a review more than 62 days old');
    const kino = byId('kino-wars');
    assert.equal(freshnessLine(kino, { [kino.data.parts[0].read]: { generated: '2026-11-04T05:00:07Z' } }, { now: NOW }).text, 'Checked 4 Nov · monthly');
  });
  test('lines with no time: reference (with its build date where its data has one), course, on demand, available, private', () => {
    assert.equal(freshnessLine(byId('battlefield-history'), { 'battlefield/history/data/wars.json': { generated: '2026-10-28T13:14:21Z' } }, { now: NOW }).text, 'Reference · built 28 Oct · no schedule');
    assert.equal(freshnessLine(byId('osint-training'), {}, { now: NOW }).text, 'Course · no schedule');
    assert.equal(freshnessLine(byId('iot-connect'), {}, { now: NOW }).text, 'On demand · your own devices, through the bridge');
    assert.equal(freshnessLine(byId('algo-trader'), {}, { now: NOW }).text, 'Private · runs every minute');
    for (const id of ['markets', 'osint', 'learning', 'retrospective']) assert.equal(freshnessLine(byId(id), {}, { now: NOW }).late, false, id);
  });
  test('times are UTC and say so; a date in another year carries its year', () => {
    assert.equal(dayTime(Date.UTC(2026, 10, 13, 0, 5), NOW), '13 Nov 00:05 UTC');
    assert.equal(day(Date.UTC(2025, 11, 31, 23), NOW), '31 Dec 2025');
    assert.equal(period('2026-09', NOW), 'Sep 2026');
    assert.equal(period('2026-11-12', NOW), '12 Nov');
    assert.equal(period('2026-06-30', NOW), '30 Jun 2026', 'more than a month back: with its year');
    assert.equal(stamp('2026-11-06'), checkStamp('2026-11-06'), 'a bare date read as the check reads it');
    assert.equal(stamp('2026-11-06T06:00:00Z'), checkStamp('2026-11-06T06:00:00Z'));
  });
  test('a Home box: the module\'s freshest line of its own (never Highbrowse\'s sum), and how many are late', () => {
    const suite = registry.suites.find(s => s.id === 'hb');
    const reads = Object.fromEntries(hb.data.parts.map(p => [p.read, { generated: p.name === 'Economics' ? '2026-11-10T14:35:00Z' : at(p.name === 'Digital' ? 1 : 4) }]));
    const x = suiteLine(suite, m => freshnessLine(m, reads, { now: NOW }));
    assert.equal(x.late, 2, 'the Economics Briefing and Highbrowse, which reads it');
    assert.match(x.text, /^Digital Briefing: updated 13 Nov 20:00 UTC · every six hours$/);
    // Every dated line late (40 hours on): the newest of them, named and Late; never Highbrowse's sum.
    const allLate = suiteLine(suite, m => freshnessLine(m, reads, { now: NOW + 40 * H }));
    assert.equal(allLate.late, 5);
    assert.equal(allLate.text, 'Digital Briefing: late: updated 13 Nov 20:00 UTC · every six hours');
    // No dated line at all (nothing read yet, or a module of undated lines): the first one, named.
    assert.equal(suiteLine(registry.suites.find(s => s.id === 'ds'), m => freshnessLine(m, {}, { now: NOW })).text, 'Data Analytics: catalogue built daily');
    assert.equal(suiteLine(registry.suites.find(s => s.id === 'oi'), m => freshnessLine(m, {}, { now: NOW })).text, 'OSINT Dashboard: on demand · asks its sources when you use it');
    // Data Analytics late, IoT Connect on demand: the late dated line, named, rather than an unnamed undated one.
    const ds = registry.suites.find(s => s.id === 'ds'), cat = byId('data-analytics').data.parts[0].read;
    assert.equal(suiteLine(ds, m => freshnessLine(m, { [cat]: { generated: at(60) } }, { now: NOW })).text, `Data Analytics: late: catalogue built ${dayTime(NOW - 60 * H, NOW)} · daily`);
  });
});

describe('the count of modules and where hosting is said', () => {
  test('one count, saying Home is counted: the sidebar, the Dashboard and the Integration Hub use it', () => {
    assert.deepEqual(countWords(registry), { modules: 10, submodules: 39, home: true, text: '10 modules, Home included · 39 submodules' });
    assert.match(read('shell.js'), /fresh\.mod\.countWords\(state\.registry\)\.text/);
    assert.match(read('shell.js'), /modules\$\{home \? ', Home included' : ''\} · \$\{subs\} submodules/, 'the shell\'s fallback words it the same');
    assert.match(read('integration/hub.js'), /import \{ countWords[^}]*\} from '\.\.\/design\/prp-freshness\.js'/);
  });
  test('the overview tables have no Host column; hosting is said in About this module, from the registry\'s host', () => {
    const shell = read('shell.js');
    assert.doesNotMatch(shell, /<th>Host<\/th>|m\.host\)\}<\/td>/, 'no Host column');
    assert.match(shell, /About this module/);
    const about = id => hostingAbout(registry.suites.find(s => s.id === id));
    assert.match(about('rt'), /Political Atlas is on political-atlas\.pages\.dev \(Cloudflare Pages\)/);
    assert.match(about('rs'), /Political Retrospective is on hp-retrospective\.pages\.dev \(Cloudflare Pages\)/);
    assert.match(about('mm'), /Market Briefing, Algo Trader and Tally Stick are on trade-desk\.judep92\.workers\.dev \(Cloudflare Workers\); Algo Trader and Tally Stick are private/);
    assert.match(about('hb'), /^Every submodule here is a page of this site, jdpi\.pages\.dev, deployed from GitHub to Cloudflare Pages/);
    for (const m of modules) assert.ok(m.host, `${m.id}: the registry keeps its host`);
  });
  test('the offline worker keeps the freshness module, under a new version', () => {
    const sandbox = { self: { addEventListener() {}, registration: { scope: 'https://jdpi.pages.dev/' } }, URL, console };
    vm.runInNewContext(read('sw.js'), sandbox);
    assert.ok(sandbox.self.vmKeyOf({ url: 'https://jdpi.pages.dev/design/prp-freshness.js', method: 'GET' }, 'https://jdpi.pages.dev/'));
    assert.match(read('sw.js'), /const VERSION = 'vm-shell-2';/);
  });
});

// Part A, Data Analytics and the Integration Hub (the review of 13 November 2026): the catalogue and its copies under
// integration/data are remade only by the daily calendar refresh, so the two pages label every date and count they take
// from it as the catalogue's, and read each store's own summary to say when a store is newer than the catalogue.
describe('the catalogue\'s copies against their stores', () => {
  const catalogue = JSON.parse(read('integration/catalog.json')), heads = headsOf(registry);
  test('the stores a dataset is made from, and the summary each store\'s line reads', () => {
    assert.deepEqual(datasetStores({ derivedFrom: ['national/data/series/*.json', 'national/data/index.json'], url: 'integration/data/x.json' }), ['national/data/index.json'], 'exact paths only');
    assert.deepEqual(datasetStores({ url: 'econ/briefing/data/stories.json' }), ['econ/briefing/data/stories.json'], 'no derivedFrom: its own file');
    assert.equal(heads['national/data/index.json'], 'national/data/index.head.json');
    assert.equal(heads['econ/briefing/data/stories.json'], 'econ/briefing/data/stories.head.json');
    assert.equal(heads['calendar/data/2020s.json'], 'calendar/data/upcoming.json');
    assert.equal(heads['battlefield/focus/data/index.json'], 'battlefield/focus/data/index.json', 'a small store is its own');
    assert.equal(heads['kino/scripts/cache.json'], undefined, 'never a heavy file');
    for (const [store, head] of Object.entries(heads)) {
      assert.ok(existsSync(join(ROOT, head)), head);
      assert.equal(typeof JSON.parse(read(head)).generated, 'string', `${head} has the store's time`);
      assert.ok(Buffer.byteLength(read(head)) < 50e3, `${head} is small enough to read for a page (${store})`);
    }
  });
  test('every dataset refreshed more often than monthly by another workflow than the catalogue\'s has a store the pages can read the time of', () => {
    // The datasets whose stores have no summary: static, monthly, on change, or written by the catalogue's own refresh.
    const without = catalogue.datasets.filter(d => !datasetStores(d).some(p => heads[p])).map(d => d.id).sort();
    assert.deepEqual(without, ['encyclopaedia-entities', 'headline-outlets', 'kardashev-polities', 'kardashev-shares', 'kardashev-world', 'kino-documentaries', 'prp-submodules', 'retrospective-wars', 'war-focus-battles', 'war-focus-monthly-deaths'],
      'a new dataset with a store of its own refresh gets a summary (integration/scripts/heads.mjs), or is added here with its reason');
    for (const id of without) assert.match(catalogue.datasets.find(d => d.id === id).refresh, /^(static|monthly|on change|daily)$/, `${id}: rarely refreshed, or with the catalogue`);
    assert.equal(catalogueRhythm(), rhythmFromCron(SCHEDULES[CATALOGUE_WORKFLOW]).phrase);
    assert.equal(CATALOGUE_WORKFLOW, STORES.find(s => s.file === 'integration/catalog.json').workflow, 'the catalogue\'s workflow, as the daily check has it');
  });
  test('a date or a count from the catalogue is always labelled as the catalogue\'s; a newer store is said, with its own time', () => {
    const ds = catalogue.datasets.find(d => d.id === 'national-countries');
    const made = Date.parse(catalogue.generated);
    const same = copyFacts(ds, catalogue, { 'national/data/index.json': made - H }, NOW);
    assert.equal(same.label, `in the catalogue of ${dayTime(made, NOW)}`);
    assert.equal(same.newest, null, 'a store no newer than the catalogue: nothing more to say');
    const newer = copyFacts(ds, catalogue, { 'national/data/index.json': made + 17 * H, 'volatility/data/index.json': made + 2 * H }, NOW);
    assert.equal(newer.newest, made + 17 * H, 'the newest of its stores');
    assert.deepEqual(newer.newer, [{ store: 'national/data/index.json', time: made + 17 * H }, { store: 'volatility/data/index.json', time: made + 2 * H }], 'each of its stores that is newer');
    assert.equal(newer.rhythm, 'daily');
    assert.equal(copyFacts(ds, {}, {}, NOW).label, 'in the catalogue', 'no time: still labelled');
    // The words name the submodule each newer store belongs to, the dataset's own first. national-countries is built
    // from the volatility index as well, which is refreshed every night some hours before the catalogue is remade:
    // in those hours the newer data is Geopolitical Volatility's, and National Analysis must not be credited with it.
    const nameOf = id => ({ pestle: 'National Analysis', volatility: 'Geopolitical Volatility' })[id] || '';
    assert.equal(storeOwner(registry, 'national/data/index.json', 'pestle'), 'pestle');
    assert.equal(storeOwner(registry, 'volatility/data/index.json', 'pestle'), 'volatility');
    assert.equal(storeOwner(registry, 'science/briefing/data/stories.json', 'pestle'), 'science-briefing', 'the briefing itself, not Highbrowse, whose line reads all four');
    assert.equal(storeOwner(registry, 'science/briefing/data/stories.json', 'highbrowse'), 'highbrowse', 'a dataset of Highbrowse\'s own');
    assert.equal(storeOwner(registry, 'no/such.json', 'pestle'), null);
    const words = times => newerWords(ds, copyFacts(ds, catalogue, times, NOW), registry, nameOf, NOW);
    assert.equal(newerWords(ds, same, registry, nameOf, NOW), '', 'nothing newer: no words');
    assert.equal(words({ 'national/data/index.json': made + 17 * H }), `National Analysis has newer data, of ${dayTime(made + 17 * H, NOW)}`);
    assert.equal(words({ 'volatility/data/index.json': made + 20 * H }), `Geopolitical Volatility has newer data, of ${dayTime(made + 20 * H, NOW)}`, 'only the other submodule\'s store is newer: that one is named');
    assert.equal(words({ 'national/data/index.json': made + 17 * H, 'volatility/data/index.json': made + 20 * H }),
      `National Analysis has newer data, of ${dayTime(made + 17 * H, NOW)}, and Geopolitical Volatility of ${dayTime(made + 20 * H, NOW)}`, 'both: the dataset\'s own first');
    assert.equal(newerWords({ submodule: 'x' }, { newer: [{ store: 'no/such.json', time: made + H }] }, registry, nameOf, NOW), `Its source has newer data, of ${dayTime(made + H, NOW)}`, 'a submodule with no name');
    // Both pages use it, label their Updated columns as the catalogue's, and read the stores' summaries.
    for (const f of ['analytics/app.js', 'integration/hub.js']) {
      const src = read(f);
      assert.match(src, /copyFacts\(/, f); assert.match(src, /headsOf\(/, f); assert.match(src, /const newerNote = \(d, f[^\n]*=> newerWords\(d, f, /, `${f}: the words for newer data are the module's`);
      assert.match(src, /<dt>Updated \$\{esc\(cf\.label\)\}<\/dt>/, `${f}: the dataset's Updated, labelled`);
      assert.match(src, /<dt>Rows \$\{esc\(cf\.label\)\}<\/dt>/, `${f}: its Rows, labelled`);
    }
    for (const f of ['analytics/index.html', 'integration/index.html']) assert.match(read(f), /<th scope="col">Updated, in the catalogue<\/th>/, f);
  });
});

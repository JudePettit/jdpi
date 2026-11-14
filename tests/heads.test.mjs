// Summaries in step with their stores (integration/scripts/heads.mjs). A page that reads a summary in place of a large
// store (the Dashboard's head files, each briefing's trends.json, calendar/data/upcoming.json) must never show one older
// than, or made from another version of, the store it summarises. This file is in the whole suite, so main never
// deploys a summary out of step: when it fails, run node integration/scripts/heads.mjs --all and commit what it writes.
//   - every committed summary names its store's own time and content (summaryOf), and the check catches a stale one
//     (proved on a copy: a store rewritten without its summary, and a store edited without being restamped);
//   - writing again changes nothing; a build that writes a store writes its summaries (each builder calls writeHeads);
//   - each refresh commits its summaries with its store, and no summary is committed by two workflows;
//   - no page reads the Integration Hub's daily copies (integration/data/briefing-activity.json, volatility-movers.json),
//     and no file under integration/data claims to be in step with a store.
// No network and no browser: part of npm run test:unit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADS, checkHeads, writeHeads, stamp, eventKey, BRIEFINGS } from '../integration/scripts/heads.mjs';
import { parseYaml } from './tools/yaml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const J = p => JSON.parse(read(p));

describe('every committed summary is in step with its store', () => {
  test('summaryOf names each store\'s own time and content, for every summary', () => {
    const problems = checkHeads();
    assert.deepEqual(problems, [], `Out of step (run node integration/scripts/heads.mjs --all):\n${problems.join('\n')}`);
  });
  test('every summary exists and says when its store was made', () => {
    for (const h of HEADS) for (const p of h.heads) {
      assert.ok(existsSync(join(ROOT, p)), `${p} is committed`);
      const j = J(p);
      for (const [store, s] of Object.entries(j.summaryOf)) {
        assert.match(s.generated, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${p}: ${store}'s time`);
        assert.equal(s.generated, J(store).generated, `${p}: ${store}'s own generated`);
      }
    }
  });
});

describe('the check catches a summary out of step (on a copy)', () => {
  const copy = () => {
    const dir = mkdtempSync(join(tmpdir(), 'heads-'));
    const econ = BRIEFINGS.find(b => b.key === 'economics');
    for (const p of [econ.store, `${econ.dir}/${econ.head}`, `${econ.dir}/trends.json`, `${econ.dir}/history.json`, 'volatility/data/index.json', 'volatility/data/index.head.json']) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      cpSync(join(ROOT, p), join(dir, p));
    }
    return { dir, econ };
  };
  test('a copy as committed is in step', () => {
    const { dir } = copy();
    try { assert.deepEqual(checkHeads(null, { root: dir }), []); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('a store rebuilt without its summaries fails, by name; writing them mends it; writing again writes nothing', () => {
    const { dir, econ } = copy();
    try {
      const s = JSON.parse(readFileSync(join(dir, econ.store), 'utf8'));
      const was = s.generated;
      s.generated = new Date(Date.parse(was) + 6 * 36e5).toISOString();
      writeFileSync(join(dir, econ.store), JSON.stringify(s));
      const problems = checkHeads(null, { root: dir });
      assert.equal(problems.length, 3, problems.join('\n'));
      assert.ok(problems.every(p => p.includes(`of ${was}, but the store is of ${s.generated}`)), problems.join('\n'));
      assert.ok(problems.some(p => p.startsWith(`${econ.dir}/stories.head.json`)) && problems.some(p => p.startsWith(`${econ.dir}/trends.json`)));
      const written = writeHeads(econ.store, { root: dir, quiet: true });
      assert.deepEqual(written.sort(), [`${econ.dir}/history.json`, `${econ.dir}/stories.head.json`, `${econ.dir}/trends.json`]);
      assert.deepEqual(checkHeads(null, { root: dir }), []);
      assert.deepEqual(writeHeads(null, { root: dir, quiet: true }), [], 'a second run writes nothing');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('a store edited without being restamped fails too: its content no longer matches', () => {
    const { dir } = copy();
    try {
      const p = join(dir, 'volatility/data/index.json'), v = JSON.parse(readFileSync(p, 'utf8'));
      v.days = (v.days || 0) + 1;
      writeFileSync(p, JSON.stringify(v));
      const problems = checkHeads(null, { root: dir });
      assert.deepEqual(problems, [`volatility/data/index.head.json was made from another version of volatility/data/index.json (same time ${v.generated}, different content)`]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test('line endings and spacing do not count as a change of content', () => {
    const { dir } = copy();
    try {
      const p = join(dir, 'volatility/data/index.json');
      writeFileSync(p, JSON.stringify(JSON.parse(readFileSync(p, 'utf8')), null, 2).replace(/\n/g, '\r\n'));
      assert.deepEqual(checkHeads(null, { root: dir }), []);
      assert.equal(stamp(dir, 'volatility/data/index.json').sha1, stamp(ROOT, 'volatility/data/index.json').sha1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('every build writes its store\'s summaries, and every refresh commits them', () => {
  // The script that writes each store (the last one, where two do), which must call writeHeads after writing it.
  const BUILDERS = {
    'science/briefing/data/stories.json': ['science/scripts/build-briefing.mjs'],
    'econ/briefing/data/stories.json': ['econ/scripts/build-briefing.mjs'],
    'digital/briefing/data/stories.json': ['digital/scripts/build-briefing.mjs'],
    'briefing/data/latest.json': ['briefing/scripts/build.mjs'],
    'volatility/data/index.json': ['volatility/scripts/ingest.mjs'],
    'calendar/data/2020s.json': ['calendar/scripts/build-events.mjs', 'calendar/scripts/enrich-summaries.mjs'],
    'battlefield/data/realtime.json': ['battlefield/scripts/build-realtime.mjs'],
    'traders/data/congress.json': ['traders/scripts/build-congress.mjs'],
    'traders/data/investors.json': ['traders/scripts/build-13f.mjs'],
    'science/progress/data/events.json': ['science/scripts/build-progress.mjs'],
    'national/data/index.json': ['national/scripts/build.mjs'],
    'integration/catalog.json': ['integration/scripts/build-catalog.mjs'],
  };
  test('each builder calls writeHeads after it writes its store', () => {
    for (const h of HEADS) {
      const store = h.stores(ROOT)[0];
      assert.ok(BUILDERS[store], `${store} has a builder listed here`);
      for (const f of BUILDERS[store]) {
        const src = read(f);
        assert.match(src, /import \{[^}]*writeHeads[^}]*\} from '(\.\.\/\.\.\/integration\/scripts|\.)\/heads\.mjs'/, `${f} imports writeHeads`);
        const write = src.search(/writeFileSync\((OUT|INDEX|OUT_FILE|join\(OUT, 'index\.json'\)|new URL\(`\$\{d\}\.json`, DATA\)|new URL\(f, DATA\)|file, data)/), call = src.lastIndexOf('writeHeads(');
        assert.ok(write >= 0 && call > write, `${f} calls writeHeads after it writes the store`);
      }
    }
  });
  const WF = '.github/workflows/';
  const workflows = Object.fromEntries(readdirSync(join(ROOT, WF)).filter(f => /\.ya?ml$/.test(f)).map(f => [f, parseYaml(read(WF + f))]));
  // What each workflow commits: the paths of its commit-data steps.
  const committed = Object.fromEntries(Object.entries(workflows).map(([f, w]) => [f, Object.values(w.jobs || {}).flatMap(j => j.steps || []).filter(s => s.uses === './.github/actions/commit-data').flatMap(s => String(s.with.paths).split(/\s+/).filter(Boolean))]));
  const covers = (paths, file) => paths.some(p => file === p || file.startsWith(p.replace(/\/$/, '') + '/'));
  test('the workflow that commits a store commits its summaries in the same step set, and no other workflow commits them', () => {
    for (const h of HEADS) {
      const store = h.stores(ROOT)[0];
      const writers = Object.keys(committed).filter(f => covers(committed[f], store));
      assert.ok(writers.length >= 1, `${store} is committed by a refresh`);
      for (const f of writers) for (const p of h.heads) assert.ok(covers(committed[f], p), `${f} commits ${p} with ${store}`);
      for (const p of h.heads) {
        const all = Object.keys(committed).filter(f => covers(committed[f], p));
        assert.deepEqual(all, writers, `${p} is committed only by ${writers.join(', ')}`);
      }
    }
  });
  test('the Auto Trader refresh puts back the House trades\' summary with them when their test fails', () => {
    const steps = Object.values(workflows['traders-refresh.yml'].jobs).flatMap(j => j.steps);
    const back = steps.find(s => /^Put back the committed House trades/.test(s.name || ''));
    assert.match(back.run, /traders\/data\/congress\.json traders\/data\/congress\.head\.json/);
  });
  test('each refresh\'s own test file checks its store\'s summaries, so a bad one is not committed', () => {
    const TESTS = {
      'science/briefing/data/stories.json': 'tests/science-briefing.test.mjs', 'econ/briefing/data/stories.json': 'tests/econ-briefing.test.mjs',
      'digital/briefing/data/stories.json': 'tests/digital-briefing.test.mjs', 'briefing/data/latest.json': 'tests/briefing.test.mjs',
      'volatility/data/index.json': 'tests/volatility.test.mjs', 'calendar/data/2020s.json': 'tests/calendar.test.mjs',
      'battlefield/data/realtime.json': 'tests/battlefield.test.mjs', 'traders/data/congress.json': 'tests/traders.test.mjs',
      'traders/data/investors.json': 'tests/traders.test.mjs', 'science/progress/data/events.json': 'tests/science-progress.test.mjs',
      'national/data/index.json': 'tests/national.test.mjs', 'integration/catalog.json': 'tests/integration-hub.test.mjs',
    };
    for (const h of HEADS) {
      const store = h.stores(ROOT)[0], t = TESTS[store];
      assert.ok(t, `${store} has a test file`);
      assert.match(read(t), /check(Heads|Summaries)\(/, `${t} checks ${store}'s summaries`);
      const runsIt = Object.entries(workflows).filter(([f]) => covers(committed[f], store)).every(([, w]) => Object.values(w.jobs).flatMap(j => j.steps || []).some(s => String(s.run || '').includes(t)));
      assert.ok(runsIt, `the refresh that commits ${store} runs ${t} before it commits`);
    }
  });
  test('the workflows still parse, and every refresh still deploys only through pages-deploy.yml', () => {
    for (const f of ['briefing-refresh.yml', 'battlefield-refresh.yml', 'traders-refresh.yml', 'calendar-refresh.yml']) {
      const w = workflows[f];
      assert.equal(w.jobs.deploy.uses, './.github/workflows/pages-deploy.yml', f);
      assert.equal(w.jobs.deploy.needs, 'refresh', f);
    }
  });
});

describe('nothing reads the Integration Hub\'s daily copies, and they claim nothing', () => {
  const walk = d => readdirSync(join(ROOT, d)).flatMap(f => {
    const p = d ? `${d}/${f}` : f;
    if (/^(node_modules|\.git|integration\/data|lake\/data|bibliotheca\/data|tests)$/.test(p)) return [];
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(html|js|mjs)$/.test(f) ? [p] : [];
  });
  test('no page or script outside the Hub\'s builders reads briefing-activity.json or volatility-movers.json', () => {
    const readers = walk('').filter(p => !p.startsWith('integration/scripts/') && /briefing-activity\.json|volatility-movers\.json/.test(read(p)));
    assert.deepEqual(readers, []);
  });
  test('no file under integration/data carries summaryOf', () => {
    for (const f of ['integration/data/briefing-activity.json', 'integration/data/volatility-movers.json', 'integration/data/upcoming-political-events.json']) assert.equal(J(f).summaryOf, undefined, f);
  });
});

describe('calendar/data/upcoming.json', () => {
  test('each event has its key, and the keys are unique', () => {
    const u = J('calendar/data/upcoming.json');
    assert.ok(u.events.length > 10);
    for (const e of u.events) assert.equal(e.key, eventKey(e));
    assert.equal(new Set(u.events.map(e => e.key)).size, u.events.length, 'no two events share a key');
    assert.ok(u.events.every(e => e.date >= u.from), 'from a week before the build onward');
  });
  test('eventKey folds accents and punctuation, and keeps the date', () => {
    assert.equal(eventKey({ date: '2026-11-29', country: 'Côte d\'Ivoire', title: 'Presidential election (date to be confirmed)' }), '2026-11-29~cote-d-ivoire~presidential-election-date-to-be-confirmed');
    assert.equal(eventKey({ date: '2027-01-01', country: '', title: '' }), '2027-01-01~~');
  });
});

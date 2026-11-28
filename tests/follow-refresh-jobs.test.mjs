// The refresh jobs leave the site whole (the part "refresh-jobs" of 28 November 2026).
//  - (A) progress-refresh.yml rebuilds the Invention Timeline's events (science/progress/data/events.json) each month,
//    and with them the Omni-Map's breakthroughs layer made from them (omni/scripts/build-breakthroughs.mjs), tests the
//    layer before the commit and commits everything that build writes. Until 28 November 2026 the job rebuilt the
//    events alone, so after each refresh the map showed the timeline of the month before.
//  - (B) Nine refresh jobs run the deploy's unit and data tests (node tests/tools/run.mjs unit, with the deploy's
//    settings) on what they would commit, just before the commit, so that a test elsewhere in package.json's list that
//    the new data breaks stops that refresh, not every deploy after it. The other six were left as they were, for the
//    reasons recorded in the notes of that part (traders commits twice; briefing and briefings would lose stories that
//    roll off the feeds while held; daily-synopsis never builds a day late; sanctions and rsp have no reader outside
//    their own test step).
// No test here pins what a live source says: the first two compare files that the same job writes with each other, the
// rest read the workflows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './tools/yaml.mjs';
import { breakthroughRows } from '../omni/scripts/build-breakthroughs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const workflow = f => parseYaml(read(`.github/workflows/${f}`));
const isCommit = s => s.uses === './.github/actions/commit-data';
// The job that commits, and its steps.
const committing = w => Object.values(w.jobs).find(j => (j.steps || []).some(isCommit)).steps;
const runs = s => String(s.run || '');

test('(A) the Invention Timeline refresh rebuilds the Omni-Map layer after the events, tests it, and commits it with them', () => {
  const steps = committing(workflow('progress-refresh.yml'));
  const at = re => steps.findIndex(s => re.test(runs(s)));
  const events = at(/node science\/scripts\/build-progress\.mjs --refresh/), layer = at(/node omni\/scripts\/build-breakthroughs\.mjs/);
  const commit = steps.findIndex(isCommit);
  assert.ok(events >= 0, 'the events are rebuilt');
  assert.ok(layer >= 0, 'the breakthroughs layer is rebuilt');
  assert.ok(events < layer && layer < commit, 'the layer is rebuilt after the events and before the commit');
  // What build-breakthroughs.mjs writes (its header, step 3), all in the one commit with the events.
  const paths = String(steps[commit].with.paths).split(/\s+/).filter(Boolean);
  const covered = f => paths.some(p => f === p || f.startsWith(p.replace(/\/$/, '') + '/'));
  for (const f of ['science/progress/data/events.json', 'omni/data/layers/breakthroughs/events.json', 'omni/data/layers.json',
    'omni/data/layers.head.json', 'integration/sources.json'])
    assert.ok(covered(f), `${f} is committed by the refresh`);
  // The layer's tests run on the rebuilt layer, before the commit.
  for (const t of ['follow-invention-timeline', 'omni-layers', 'omni-history', 'omni-data', 'follow-refresh-jobs']) {
    const i = at(new RegExp(`tests/${t}\\.test\\.mjs`));
    assert.ok(layer < i && i < commit, `tests/${t}.test.mjs runs after the layer is rebuilt and before the commit`);
  }
  // As in the deploy (pages-deploy.yml): omni-data's frame test allows a runner 80 ms.
  const test = steps.find(s => /tests\/omni-data\.test\.mjs/.test(runs(s)));
  assert.deepEqual([test.env?.PRP_PAGES, test.env?.PRP_CPU_LIMIT_MS], ['0', '80']);
});

test('(A) the breakthroughs layer is made from the Invention Timeline’s events as they stand', () => {
  // The monthly refresh rebuilds both and commits them together, so the layer names the events file as it stands
  // (its `of`) and holds its rows; a refresh that rebuilt the events and not the layer fails here.
  const data = JSON.parse(read('science/progress/data/events.json'));
  const layer = JSON.parse(read('omni/data/layers/breakthroughs/events.json'));
  assert.equal(layer.of, data.generated, 'the layer is made from events.json as it stands');
  assert.deepEqual(layer.rows, breakthroughRows(data));
  // The layer catalogue lists it under the same build.
  const listed = (JSON.parse(read('omni/data/layers.json')).layers || []).find(l => l.id === 'breakthroughs');
  assert.ok(listed, 'the catalogue lists the breakthroughs layer');
  assert.equal(listed.built, layer.built, 'the catalogue names the layer’s own build');
});

// The jobs that test the deploy's unit list before their commit (both second readers said yes to each).
const GUARDED = ['battlefield-refresh.yml', 'calendar-refresh.yml', 'kino-refresh.yml', 'lake-refresh.yml', 'national-refresh.yml',
  'progress-refresh.yml', 'standins-refresh.yml', 'volatility-refresh.yml', 'warfocus-refresh.yml'];

test('(B) nine refreshes run the deploy’s unit list on what they would commit, just before the commit', () => {
  for (const f of GUARDED) {
    const w = workflow(f), steps = committing(w);
    const commit = steps.findIndex(isCommit), step = steps[commit - 1];
    assert.equal(runs(step).trim(), 'node tests/tools/run.mjs unit', `${f}: the step before the commit runs the unit list`);
    assert.deepEqual([step.env?.PRP_PAGES, step.env?.PRP_CPU_LIMIT_MS], ['0', '80'], `${f}: with the deploy's settings`);
    assert.equal(step.if, undefined, `${f}: always, not on a condition`);
    assert.equal(step['continue-on-error'], undefined, `${f}: a failure stops the job`);
    // Four files of the list (documentary, headlines, learning, platform) import playwright-core when they are read.
    assert.ok(steps.slice(0, commit - 1).some(s => /^npm ci\b/.test(runs(s).trim())), `${f}: npm ci runs before it`);
    // The job still commits once, and still deploys only through pages-deploy.yml.
    assert.equal(steps.filter(isCommit).length, 1, `${f}: one commit`);
    assert.equal(w.jobs.deploy?.uses, './.github/workflows/pages-deploy.yml', `${f}: deploys through pages-deploy.yml`);
  }
});

test('(B) the guarded step runs what the deploy runs, with the deploy’s CPU allowance', () => {
  const deploy = workflow('pages-deploy.yml');
  const steps = Object.values(deploy.jobs).flatMap(j => j.steps || []);
  const t = steps.find(s => runs(s).trim() === 'npm test');
  assert.ok(t, 'the deploy runs npm test');
  assert.equal(t.env?.PRP_CPU_LIMIT_MS, '80');
  // npm test and tests/tools/run.mjs read the same list: package.json's "test" script.
  const list = JSON.parse(read('package.json')).scripts.test.match(/tests\/\S+\.test\.mjs/g);
  assert.ok(list.length > 50, `${list.length} files in package.json's list`);
  assert.match(read('tests/tools/run.mjs'), /scripts\.test\.match\(/);
});

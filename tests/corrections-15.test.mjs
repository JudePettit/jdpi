// Corrections, build 15 (25 November 2026): the Scientific, Economics and Digital Briefings say they are refreshed
// every six hours, but after 22 November GitHub started their scheduled refresh only about twice a day, so a page could
// show "Data is 13 hours old" (ChatGPT's review front-pages-24; the longest gap was almost 17 hours, on 23 November).
// The wording stays: it is read from the cron (design/prp-freshness.js) and pinned in tests/freshness-labels.test.mjs.
// This is a part cure only: Test and deploy starts the refresh when it finishes after a push to main (workflow_run),
// and a run started that way goes on only when the newest of the three stores is five hours old or more; otherwise it
// cancels itself before it commits or deploys. Between pushes GitHub's timetable still rules.
// No network: the gate's script is run here against stores written to a temporary folder, with gh and sleep stubbed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './tools/yaml.mjs';
import { SCHEDULES } from '../design/prp-freshness.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WF = join(ROOT, '.github/workflows');
const read = f => readFileSync(join(WF, f), 'utf8');
const w = parseYaml(read('briefings-refresh.yml'));
const on = w.on || w[true];
const names = Object.fromEntries(readdirSync(WF).filter(f => f.endsWith('.yml')).map(f => [parseYaml(read(f)).name, f]));
const H = 3600e3;
const BRIEFINGS = ['science', 'econ', 'digital'];

describe('build 15: the briefings refresh is also started after a push to main, when GitHub has dropped its scheduled runs', () => {
  test('the cron, and so the pages\' "every six hours", is unchanged', () => {
    assert.deepEqual(on.schedule.map(s => s.cron), ['45 1-23/6 * * *']);
    assert.equal(SCHEDULES['briefings-refresh.yml'], '45 1-23/6 * * *');
    assert.ok('workflow_dispatch' in on, 'still started by hand too');
  });

  test('Test and deploy, which runs on a push to main and keeps no timetable, starts it when it finishes on main', () => {
    const chain = on.workflow_run;
    assert.ok(chain, 'a workflow_run trigger');
    assert.deepEqual(chain.types, ['completed']);
    assert.deepEqual(chain.branches, ['main']);
    assert.deepEqual(chain.workflows, ['Test and deploy']);
    assert.equal(names['Test and deploy'], 'ci.yml', '"Test and deploy" is ci.yml');
    const ci = parseYaml(read('ci.yml'));
    const ciOn = ci.on || ci[true];
    assert.deepEqual(ciOn.push, { branches: ['main'] }, 'Test and deploy runs on every push to main');
    assert.equal(ciOn.schedule, undefined, 'and on no timetable of its own');
  });

  test('no scheduled workflow is in the chain: GitHub thins them into the same two windows a day, so they only doubled a refresh and its deploy', () => {
    for (const n of on.workflow_run.workflows) {
      const f = names[n];
      assert.ok(f, `"${n}" is the name of a workflow in .github/workflows`);
      assert.notEqual(f, 'briefings-refresh.yml', 'it does not start itself');
      const o = parseYaml(read(f));
      assert.equal((o.on || o[true]).schedule, undefined, `${n} (${f}) has no cron`);
    }
  });

  test('the header gives the gap from the run list: thinning after 22 November 20:29 UTC, up to almost 17 hours', () => {
    const head = read('briefings-refresh.yml').split(/\r?\n/).filter(l => l.startsWith('#')).join(' ').replace(/#\s*/g, '');
    assert.match(head, /after its 20:29 UTC run on 22 November 2026 it started this one only about twice a day/);
    assert.match(head, /up to almost 17 hours old \(02:41 to 19:31 UTC on 23 November/);
    assert.doesNotMatch(head, /from 22 November 2026/, 'all four slots ran on 22 November');
    assert.doesNotMatch(head, /were up to 13 hours old/, 'thirteen hours was one reading, not the longest gap');
  });

  test('a first job decides; the refresh waits for it, and the deploy still follows the refresh unless the run is cancelled', () => {
    assert.deepEqual(Object.keys(w.jobs), ['due', 'refresh', 'deploy']);
    assert.deepEqual(w.permissions, { contents: 'write' }, 'the refresh itself still only writes contents');
    const { due, refresh, deploy } = w.jobs;
    assert.deepEqual(due.permissions, { contents: 'read', actions: 'write' }, 'only the first job may cancel the run');
    assert.ok(due['timeout-minutes'] <= 10);
    assert.equal(refresh.needs, 'due');
    assert.equal(refresh.if, undefined, 'no condition of its own: a cancelled run never reaches it');
    assert.equal(deploy.needs, 'refresh');
    assert.equal(deploy.if, '${{ !cancelled() }}', 'a cancelled run deploys nothing');
    // Scheduled and hand-started runs pass straight through: every step of the first job is for a chained run only.
    for (const s of due.steps) assert.equal(s.if, "github.event_name == 'workflow_run'", JSON.stringify(s).slice(0, 80));
    const co = due.steps.find(s => s.uses === 'actions/checkout@v4');
    assert.deepEqual(co.with['sparse-checkout'].trim().split('\n'), BRIEFINGS.map(b => `${b}/briefing/data/stories.json`), 'only the three stores are fetched');
  });

  // The gate's script, run as the runner runs it, against stores in a temporary folder.
  const gate = () => (w.jobs.due?.steps || []).find(s => s.run) || { run: '' };
  const BASH = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  const run = (upstream, ages) => {
    const dir = mkdtempSync(join(tmpdir(), 'corr15-'));
    try {
      BRIEFINGS.forEach((b, i) => {
        if (ages[i] == null) return;
        mkdirSync(join(dir, b, 'briefing/data'), { recursive: true });
        writeFileSync(join(dir, b, 'briefing/data/stories.json'), JSON.stringify({ generated: new Date(Date.now() - ages[i] * H).toISOString(), items: [] }));
      });
      const log = join(dir, 'calls.log');
      const stubs = 'gh() { echo "gh $*" >> "$LOG"; }\nsleep() { echo "sleep $*" >> "$LOG"; }\n';
      const r = spawnSync(BASH, ['-c', stubs + gate().run], { cwd: dir, encoding: 'utf8', env: { ...process.env, LOG: log, UPSTREAM: upstream, RUN: '4567', GITHUB_REPOSITORY: 'owner/repo' } });
      return { status: r.status, out: r.stdout + r.stderr, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [] };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };

  test('the rule: due when the newest of the three stores is five hours old or more, or none can be read', () => {
    const js = gate().run.match(/node -p '([^']+)'/)?.[1];
    assert.ok(js, 'the first job works the rule out with node');
    const due = ages => {
      const dir = mkdtempSync(join(tmpdir(), 'corr15-'));
      try {
        BRIEFINGS.forEach((b, i) => {
          if (ages[i] == null) return;
          mkdirSync(join(dir, b, 'briefing/data'), { recursive: true });
          writeFileSync(join(dir, b, 'briefing/data/stories.json'), JSON.stringify({ generated: new Date(Date.now() - ages[i] * H).toISOString() }));
        });
        return execFileSync(process.execPath, ['-p', js], { cwd: dir, encoding: 'utf8' }).trim();
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    assert.equal(due([13, 13, 13]), 'true', '13 hours old, as on 25 November');
    assert.equal(due([5.1, 6, 7]), 'true');
    assert.equal(due([4.9, 13, 13]), 'false', 'the newest counts: one refreshed under five hours ago means the slot ran');
    assert.equal(due([1, 1, 1]), 'false');
    assert.equal(due([null, null, null]), 'true', 'no store read: refresh');
    assert.equal(due([null, 2, null]), 'false');
  });

  test('a chained run that is not due cancels itself and never goes on; one that is due goes on', { skip: !existsSync(BASH) && `no bash at ${BASH}` }, () => {
    const go = run('push', [6, 6, 13]);
    assert.equal(go.status, 0, go.out);
    assert.deepEqual(go.calls, [], 'nothing cancelled');
    assert.match(go.out, /refreshing now/);
    for (const [upstream, ages] of [['push', [1, 13, 13]], ['schedule', [2, 2, 2]], ['pull_request', [13, 13, 13]]]) {
      const stop = run(upstream, ages);
      assert.deepEqual(stop.calls, ['gh run cancel 4567 --repo owner/repo', 'sleep 120'], `${upstream} ${ages}: cancels its own run, then waits for the cancel`);
      assert.equal(stop.status, 1, 'and if the cancel never came, the first job fails, so the refresh does not run');
      assert.match(stop.out, /::notice::No refresh due/);
      assert.match(stop.out, /the refresh is skipped, but main is still tested and deployed as it stands/, 'the error says the deploy job still runs');
    }
    assert.equal(run('schedule', [null, null, null]).status, 0, 'no store at all: refresh');
  });
});

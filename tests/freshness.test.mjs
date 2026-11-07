// The data health check and the deploy pipeline (November 2026, the 3 November review's "Batch A: repairs"):
//   - .github/scripts/health.mjs: how a store's time is read (a full time as it is, a bare date as the end of its day),
//     status/health.json, and the one "Data health check failing" issue (opened, updated, closed; never a second one),
//     with GitHub's API stubbed;
//   - .github/scripts/freshness.mjs run offline: it writes status/health.json, and its exit code says the same;
//   - the catalogue's stamp, a full time;
//   - every workflow file, read as YAML (tests/tools/yaml.mjs): nothing reaches Cloudflare Pages but pages-deploy.yml,
//     which deploys a commit only after the whole suite passed on it, with wrangler pinned to one exact version.
// No network and no browser: part of npm run test:unit. The Dashboard's health mark is tested in tests/platform.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stamp, day, runUrl, healthReport, summaryTable, summaryHeading, ISSUE_TITLE, ownIssue, issuePlan, syncIssue } from '../.github/scripts/health.mjs';
import { parseYaml } from './tools/yaml.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');

/* ------------------------------------------------------------------ reading a store's time */
describe('stamp(): the time a store\'s "generated" stands for', () => {
  test('a full ISO time is read as it is', () => {
    assert.equal(stamp('2026-11-06T06:19:45Z'), Date.UTC(2026, 10, 6, 6, 19, 45));
    assert.equal(stamp('2026-11-06T06:19:45.123Z'), Date.UTC(2026, 10, 6, 6, 19, 45, 123));
    assert.equal(stamp('2026-11-06T08:19:45+02:00'), Date.UTC(2026, 10, 6, 6, 19, 45));
  });
  test('a bare date, as an old copy may carry, still counts as the end of that day', () => {
    assert.equal(stamp('2026-11-06'), Date.UTC(2026, 10, 6, 23, 59, 59));
  });
  test('anything else is no usable time', () => {
    for (const v of [undefined, null, 20261106, '', 'yesterday', {}]) assert.ok(Number.isNaN(stamp(v)), JSON.stringify(v));
  });
  test('the catalogue now carries a full time, so it is read at its build time and not at the end of its day', () => {
    const cat = JSON.parse(read('integration/catalog.json'));
    assert.match(cat.generated, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    assert.equal(stamp(cat.generated), Date.parse(cat.generated));
    // The builder stamps it with the full time of the build, and restamps it even on a day nothing in it changed.
    const builder = read('integration/scripts/build-catalog.mjs');
    assert.match(builder, /const STAMP = NOW\.toISOString\(\);/);
    assert.match(builder, /const CATALOGUE = \{\s*generated: STAMP,/);
    assert.match(builder, /if \(same && p !== 'integration\/catalog\.json'\) \{ kept\+\+; continue; \}/);
    // The API description says so too.
    const oa = JSON.parse(read('integration/openapi.json'));
    assert.equal(oa.components.schemas.Catalogue.properties.generated.format, 'date-time');
  });
});

/* ------------------------------------------------------------------ status/health.json */
const NOW = Date.UTC(2026, 10, 7, 9, 40);
const ROWS_OK = [
  { what: 'science/briefing/data/stories.json', name: 'Scientific Briefing', ok: true, detail: '3 h old, limit 15 h (briefings-refresh.yml)' },
  { what: 'GET /llms.txt', name: 'llms.txt', ok: true, detail: '1234 characters' },
];
const ROWS_BAD = [
  { what: 'science/briefing/data/stories.json', name: 'Scientific Briefing', ok: false, detail: '20 h old, limit 15 h (briefings-refresh.yml)' },
  { what: 'integration/catalog.json', name: 'Integration Hub catalogue', ok: false, detail: '3 days old, limit 51 h (calendar-refresh.yml)' },
  { what: 'GET /llms.txt', name: 'llms.txt', ok: true, detail: '1234 characters' },
  { what: 'live science/briefing/data/stories.json', name: 'Scientific Briefing on the site', ok: false, detail: 'HTTP 500 | bad' },
];
const RUN = 'https://github.com/JudePettit/jdpi/actions/runs/123';

describe('healthReport(): the file the Dashboard reads', () => {
  test('a pass', () => {
    assert.deepEqual(healthReport(ROWS_OK, { now: NOW, run: RUN }), { generated: '2026-11-07T09:40:00.000Z', ok: true, problems: 0, failing: [], run: RUN });
  });
  test('a failure names each failing check plainly, with its file and detail', () => {
    const h = healthReport(ROWS_BAD, { now: NOW, run: RUN });
    assert.equal(h.ok, false);
    assert.equal(h.problems, 3);
    assert.deepEqual(h.failing.map(f => f.name), ['Scientific Briefing', 'Integration Hub catalogue', 'Scientific Briefing on the site']);
    assert.deepEqual(h.failing[1], { name: 'Integration Hub catalogue', what: 'integration/catalog.json', detail: '3 days old, limit 51 h (calendar-refresh.yml)' });
    // A row with no plain name falls back to what it checked.
    assert.equal(healthReport([{ what: 'workflow runs', ok: false, detail: 'x' }], { now: NOW }).failing[0].name, 'workflow runs');
    assert.equal(healthReport([], { now: NOW }).run, null);
  });
  test('the run\'s address comes from the Actions environment, and is null outside it', () => {
    assert.equal(runUrl({ GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'JudePettit/jdpi', GITHUB_RUN_ID: '123' }), RUN);
    assert.equal(runUrl({}), null);
  });
  test('the summary table and its heading', () => {
    const t = summaryTable(ROWS_BAD);
    assert.equal(t.split('\n').length, 2 + ROWS_BAD.length);
    assert.match(t, /\| ❌ \| Integration Hub catalogue \(integration\/catalog\.json\) \| 3 days old/);
    assert.match(t, /HTTP 500 \\\| bad/, 'a | in a detail cannot break the table');
    assert.equal(summaryHeading(healthReport(ROWS_OK, { now: NOW })), 'Vitruvian Manager data health: all fresh');
    assert.equal(summaryHeading(healthReport(ROWS_BAD, { now: NOW })), 'Vitruvian Manager data health: 3 problems');
    assert.equal(day(NOW), '7 Nov 2026');
  });
});

/* ------------------------------------------------------------------ the issue */
const BOT = { login: 'github-actions[bot]' };
const MINE = { number: 7, title: ISSUE_TITLE, user: BOT };
const OTHERS = [
  { number: 3, title: ISSUE_TITLE, user: { login: 'someone' } },                    // not opened by the check
  { number: 4, title: ISSUE_TITLE, user: BOT, pull_request: { url: 'x' } },          // a pull request, not an issue
  { number: 5, title: 'Something else', user: BOT },
];

describe('issuePlan(): one issue, opened, updated and closed', () => {
  const failing = healthReport(ROWS_BAD, { now: NOW, run: RUN }), passing = healthReport(ROWS_OK, { now: NOW, run: RUN });
  test('only the check\'s own open issue counts', () => {
    assert.equal(ownIssue(OTHERS), null);
    assert.equal(ownIssue([...OTHERS, MINE]).number, 7);
    assert.equal(ownIssue([{ ...MINE, number: 9 }, MINE]).number, 7, 'the oldest, should there ever be two');
    assert.equal(ownIssue(undefined), null);
  });
  test('a failure with none open opens it, assigned to the repository\'s owner', () => {
    const p = issuePlan(failing, OTHERS, { rows: ROWS_BAD, owner: 'JudePettit' });
    assert.equal(p.action, 'open');
    assert.equal(p.title, 'Data health check failing');
    assert.deepEqual(p.assignees, ['JudePettit']);
    assert.match(p.body, /^The daily data health check failed on 7 Nov 2026 \(\[the run\]\(https:\/\/github\.com\/JudePettit\/jdpi\/actions\/runs\/123\)\): 3 problems, in Scientific Briefing, Integration Hub catalogue, Scientific Briefing on the site\./);
    assert.match(p.body, /\| ✅ \| llms\.txt \(GET \/llms\.txt\)/, 'the whole table, passing rows too');
    assert.doesNotMatch(p.body, /@/, 'no address and no mention: the assignment notifies');
    assert.deepEqual(issuePlan(failing, [], { rows: ROWS_BAD }).assignees, [], 'no owner given, no assignee');
  });
  test('a failure with it open adds a comment (which notifies) and refreshes the body; never a second issue', () => {
    const p = issuePlan(failing, [...OTHERS, MINE], { rows: ROWS_BAD, owner: 'JudePettit' });
    assert.equal(p.action, 'update');
    assert.equal(p.number, 7);
    assert.match(p.comment, /^Still failing on 7 Nov 2026 \(\[the run\]\(.+\)\): 3 problems, in Scientific Briefing, /);
    assert.match(p.body, /failed on 7 Nov 2026/);
  });
  test('a pass with it open closes it with a note; a pass with none open does nothing', () => {
    assert.deepEqual(issuePlan(passing, [MINE]), { action: 'close', number: 7, comment: `The check passed on 7 Nov 2026 ([the run](${RUN})): all fresh. Closing.` });
    assert.deepEqual(issuePlan(passing, OTHERS), { action: 'none' });
  });
});

// GitHub's REST API, stubbed: each call is recorded, and `replies` answers by "METHOD path".
function fakeGitHub(open, replies = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.replace('https://api.github.com/repos/JudePettit/jdpi', '');
    const call = { method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
    calls.push(call);
    const key = `${call.method} ${path}`;
    if (replies[key]) return replies[key](call);
    if (key === 'GET /issues?state=open&per_page=100') return Response.json(open);
    if (key === 'POST /issues') return Response.json({ number: 11 }, { status: 201 });
    return Response.json({});
  };
  return { calls, fetch };
}
const opts = (fetch, extra) => ({ repo: 'JudePettit/jdpi', token: 'test-token', owner: 'JudePettit', rows: ROWS_BAD, fetch, ...extra });

describe('syncIssue(): the plan carried out through the API', () => {
  const failing = healthReport(ROWS_BAD, { now: NOW, run: RUN }), passing = healthReport(ROWS_OK, { now: NOW, run: RUN });
  test('opens the issue', async () => {
    const gh = fakeGitHub(OTHERS);
    assert.deepEqual(await syncIssue(failing, opts(gh.fetch)), { action: 'open', number: 11 });
    assert.deepEqual(gh.calls.map(c => `${c.method} ${c.path}`), ['GET /issues?state=open&per_page=100', 'POST /issues']);
    assert.equal(gh.calls[1].body.title, ISSUE_TITLE);
    assert.deepEqual(gh.calls[1].body.assignees, ['JudePettit']);
    assert.ok(gh.calls.every(c => c.auth === 'Bearer test-token'));
  });
  test('opens it unassigned when GitHub will not assign the owner', async () => {
    const gh = fakeGitHub([], { 'POST /issues': c => (c.body.assignees ? Response.json({ message: 'Validation Failed' }, { status: 422 }) : Response.json({ number: 12 }, { status: 201 })) });
    assert.deepEqual(await syncIssue(failing, opts(gh.fetch)), { action: 'open', number: 12 });
    assert.deepEqual(gh.calls.map(c => [c.method, c.path, !!c.body?.assignees]), [['GET', '/issues?state=open&per_page=100', false], ['POST', '/issues', true], ['POST', '/issues', false]]);
  });
  test('updates the open one: a comment, then the body', async () => {
    const gh = fakeGitHub([...OTHERS, MINE]);
    assert.deepEqual(await syncIssue(failing, opts(gh.fetch)), { action: 'update', number: 7 });
    assert.deepEqual(gh.calls.slice(1).map(c => `${c.method} ${c.path}`), ['POST /issues/7/comments', 'PATCH /issues/7']);
    assert.match(gh.calls[1].body.body, /^Still failing on 7 Nov 2026/);
    assert.equal(gh.calls[2].body.state, undefined, 'still open');
  });
  test('a busy tracker: it pages past 100 newer open issues to find its own, and still never opens a second', async () => {
    const newer = Array.from({ length: 100 }, (_, i) => ({ number: 200 - i, title: `Newer ${i}`, user: { login: 'someone' } }));
    const gh = fakeGitHub(newer, { 'GET /issues?state=open&per_page=100&page=2': () => Response.json([...OTHERS, MINE]) });
    assert.deepEqual(await syncIssue(failing, opts(gh.fetch)), { action: 'update', number: 7 });
    assert.deepEqual(gh.calls.map(c => `${c.method} ${c.path}`), ['GET /issues?state=open&per_page=100', 'GET /issues?state=open&per_page=100&page=2', 'POST /issues/7/comments', 'PATCH /issues/7']);
    // A full first page with none of its own on the second: it opens one, having looked through both.
    const none = fakeGitHub(newer, { 'GET /issues?state=open&per_page=100&page=2': () => Response.json(OTHERS) });
    assert.deepEqual(await syncIssue(failing, opts(none.fetch)), { action: 'open', number: 11 });
    assert.equal(none.calls.filter(c => c.method === 'GET').length, 2, 'stops at the short page');
  });
  test('closes it once the check passes', async () => {
    const gh = fakeGitHub([MINE]);
    assert.deepEqual(await syncIssue(passing, opts(gh.fetch, { rows: ROWS_OK })), { action: 'close', number: 7 });
    assert.deepEqual(gh.calls.slice(1).map(c => [c.method, c.path, c.body]), [
      ['POST', '/issues/7/comments', { body: `The check passed on 7 Nov 2026 ([the run](${RUN})): all fresh. Closing.` }],
      ['PATCH', '/issues/7', { state: 'closed', state_reason: 'completed' }],
    ]);
  });
  test('does nothing when all is fresh and nothing is open', async () => {
    const gh = fakeGitHub(OTHERS);
    assert.deepEqual(await syncIssue(passing, opts(gh.fetch)), { action: 'none', number: undefined });
    assert.equal(gh.calls.length, 1);
  });
  test('an API problem is reported, never thrown, so it cannot change the check\'s result', async () => {
    const gh = fakeGitHub([], { 'GET /issues?state=open&per_page=100': () => Response.json({ message: 'Resource not accessible by integration' }, { status: 403 }) });
    assert.deepEqual(await syncIssue(failing, opts(gh.fetch)), { error: 'GET /issues?state=open&per_page=100: HTTP 403' });
    assert.deepEqual(await syncIssue(failing, opts(async () => { throw new Error('offline'); })), { error: 'offline' });
    assert.deepEqual(await syncIssue(failing, { fetch: gh.fetch }), { error: 'no GITHUB_REPOSITORY or GITHUB_TOKEN' });
  });
});

/* ------------------------------------------------------------------ freshness.mjs itself */
test('freshness.mjs --offline --health writes status/health.json, and its exit code agrees with it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vm-health-'));
  try {
    const file = join(dir, 'status', 'health.json');
    const env = { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' };
    const r = spawnSync(process.execPath, ['.github/scripts/freshness.mjs', '--offline', '--health', file, '--alert'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60e3 });
    assert.ok(existsSync(file), r.stdout + r.stderr);
    const h = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(h), ['generated', 'ok', 'problems', 'failing', 'run']);
    assert.ok(Math.abs(Date.parse(h.generated) - Date.now()) < 60e3);
    assert.equal(h.problems, h.failing.length);
    assert.equal(r.status, h.ok ? 0 : 1, r.stdout);
    for (const f of h.failing) assert.ok(f.name && f.what && f.detail, JSON.stringify(f));
    // Offline, the partial check never touches the issue.
    assert.match(r.stdout, /--alert is ignored with --offline/);
    // Every store is read: none is unreadable or without a usable time (the catalogue's full time included).
    assert.doesNotMatch(r.stdout, /unreadable|no usable time/);
    assert.match(r.stdout, /integration\/catalog\.json\s+\d+ (h|days) old/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ------------------------------------------------------------------ the workflows */
const WF = '.github/workflows/';
const workflows = Object.fromEntries(readdirSync(join(ROOT, WF)).filter(f => /\.ya?ml$/.test(f)).map(f => [f, parseYaml(read(WF + f))]));
const steps = job => (Array.isArray(job.steps) ? job.steps : []);
const runs = doc => Object.values(doc.jobs || {}).flatMap(j => steps(j).map(s => s.run || '')).join('\n');
const callers = () => Object.entries(workflows).flatMap(([f, w]) => Object.entries(w.jobs).filter(([, j]) => j.uses === './.github/workflows/pages-deploy.yml').map(([id, j]) => ({ f, id, j, w })));
const MAIN_ONLY = "${{ github.ref == 'refs/heads/main' }}";

describe('the workflows: only a tested commit is deployed', () => {
  test('every workflow file reads as YAML, with a name, triggers and jobs', () => {
    assert.ok(Object.keys(workflows).length >= 15);
    for (const [f, w] of Object.entries(workflows)) {
      assert.equal(typeof w.name, 'string', f);
      assert.ok(w.on && typeof w.on === 'object', `${f}: on`);
      assert.ok(w.jobs && Object.keys(w.jobs).length, `${f}: jobs`);
    }
    parseYaml(read('.github/actions/commit-data/action.yml'));
  });

  test('wrangler runs in one place only, pinned to one exact version', () => {
    // Commands only: a shell comment may name it.
    const commands = w => runs(w).split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const calls = Object.entries(workflows).flatMap(([f, w]) => [...commands(w).matchAll(/\bwrangler(@\S+)?/g)].map(m => [f, m[0]]));
    assert.equal(Object.values(workflows).filter(w => /pages deploy/.test(commands(w))).length, 1, 'one pages deploy');
    assert.deepEqual(calls.map(([f]) => f), ['pages-deploy.yml'], 'one wrangler call, in pages-deploy.yml');
    assert.match(calls[0][1], /^wrangler@\d+\.\d+\.\d+$/, 'an exact version, not a range');
    assert.match(read(WF + 'pages-deploy.yml'), /# Pinned \d{1,2} [A-Z][a-z]{2} \d{4} to wrangler \d+\.\d+\.\d+/, 'a dated note');
    assert.ok(!/wrangler/.test(read('.github/actions/commit-data/action.yml')));
    // The version is written in pages-deploy.yml only, so a bump there leaves no stale copy in the docs.
    const version = calls[0][1].slice('wrangler@'.length);
    for (const doc of ['OPERATIONS.md', 'README.md']) assert.ok(!read(doc).includes(version), `${doc} does not repeat wrangler ${version}`);
  });

  test('pages-deploy.yml: it can only be called, it tests first, and it deploys exactly the commit it tested', () => {
    const w = workflows['pages-deploy.yml'];
    assert.deepEqual(Object.keys(w.on), ['workflow_call'], 'no Run workflow button and no push trigger of its own: every route tests');
    assert.deepEqual(w.on.workflow_call.inputs.deploy, { description: w.on.workflow_call.inputs.deploy.description, type: 'boolean', default: true });
    assert.equal(w.on.workflow_call.inputs.sha.type, 'string');
    assert.equal(w.concurrency, undefined, 'the tests of different callers run side by side; only deploys queue');
    const { test: t, deploy: d } = w.jobs;
    assert.deepEqual(Object.keys(w.jobs), ['test', 'deploy']);
    // The test job: the whole suite, the same as ci.yml ran it before.
    assert.equal(steps(t)[0].uses, 'actions/checkout@v4');
    assert.equal(steps(t)[0].with.ref, '${{ inputs.sha || github.ref_name }}');
    const suite = steps(t).find(s => s.run === 'npm test');
    assert.ok(suite, 'npm test: every file package.json lists');
    assert.deepEqual(suite.env, { JDPI_URL: 'http://localhost:8787', PRP_URL: 'http://localhost:8787', PRP_CPU_LIMIT_MS: '80' });
    assert.ok(steps(t).some(s => s.run === 'npm ci --ignore-scripts'));
    assert.ok(steps(t).some(s => /tests\/tools\/serve\.mjs 8787/.test(s.run || '')));
    assert.equal(t.outputs.sha, '${{ steps.head.outputs.sha }}');
    assert.equal(steps(t).findIndex(s => s.id === 'head'), 1, 'the tested commit is read straight after the checkout');
    const current = steps(t).find(s => s.id === 'current');
    assert.ok(steps(t).indexOf(current) > steps(t).indexOf(suite), 'asked only after the suite passed');
    assert.match(current.run, /git ls-remote origin refs\/heads\/main/);
    // The deploy job: after the tests passed (no status function in its condition, so success() applies), only when
    // the caller asked, the tested commit is still main's head and deploys from GitHub are switched on.
    assert.equal(d.needs, 'test');
    assert.equal(d.if, "inputs.deploy && needs.test.outputs.current == 'true' && vars.DEPLOY_TESTED_ONLY == 'true'");
    // In the main-only environment that holds the Cloudflare token, so no other branch, pull request or older copy of
    // this file can read it.
    assert.equal(d.environment, 'production');
    const off = steps(t).find(s => /DEPLOY_TESTED_ONLY != 'true'/.test(s.if || ''));
    assert.ok(off && /::warning::/.test(off.run) && steps(t).indexOf(off) > steps(t).indexOf(current), 'a passing run that deploys nothing says why');
    assert.doesNotMatch(d.if, /always\(\)|failure\(\)|cancelled\(\)/);
    assert.deepEqual(d.concurrency, { group: 'pages-deploy', 'cancel-in-progress': false });
    assert.equal(steps(d)[0].uses, 'actions/checkout@v4');
    assert.equal(steps(d)[0].with.ref, '${{ needs.test.outputs.sha }}', 'the tested commit, not main as it is now');
    const upload = steps(d).find(s => /wrangler/.test(s.run || ''));
    assert.equal(upload.env.TESTED, '${{ needs.test.outputs.sha }}');
    assert.match(upload.run, /--commit-hash="\$TESTED"/);
    assert.match(upload.run, /git rev-parse HEAD\)" != "\$TESTED"/, 'refuses a checkout that is not the tested commit');
    const lines = upload.run.split('\n');
    assert.ok(lines.findIndex(l => /ls-remote/.test(l)) < lines.findIndex(l => /wrangler@/.test(l)), 'checks main\'s head again before uploading');
  });

  test('every caller passes its secrets and deploys only from main', () => {
    const all = callers();
    assert.ok(all.length >= 13, `${all.length} callers`);
    for (const { f, id, j } of all) {
      assert.equal(j.secrets, 'inherit', `${f} ${id}: secrets: inherit, or CLOUDFLARE_API_TOKEN is empty`);
      if (f === 'ci.yml') assert.deepEqual(j.with, { sha: '${{ github.sha }}', deploy: "${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}" });
      else assert.deepEqual(j.with, { deploy: MAIN_ONLY }, `${f} ${id}: tests main as it left it, deploys only on main`);
    }
  });

  test('ci.yml is the pipeline itself: no job of its own runs steps or deploys', () => {
    const w = workflows['ci.yml'];
    assert.deepEqual(Object.keys(w.jobs), ['pipeline']);
    assert.ok('workflow_dispatch' in w.on, 'Run workflow here is the hand route: test, then deploy');
    assert.deepEqual(w.on.push, { branches: ['main'] });
  });

  test('every refresh that commits data deploys through the pipeline after its commit, even when it ended red', () => {
    for (const [f, w] of Object.entries(workflows)) {
      const committers = Object.entries(w.jobs).filter(([, j]) => steps(j).some(s => s.uses === './.github/actions/commit-data'));
      if (!committers.length) continue;
      const deploy = callers().filter(c => c.f === f);
      assert.equal(deploy.length, 1, `${f}: one deploy job`);
      const needs = [deploy[0].j.needs].flat();
      for (const [id] of committers) assert.ok(needs.includes(id), `${f}: the deploy waits for ${id}`);
      assert.equal(deploy[0].j.if, '${{ !cancelled() }}', `${f}: a partial refresh still goes out, once tested`);
      assert.doesNotMatch(runs(w), /wrangler|pages deploy/, `${f}: no deploy of its own`);
    }
  });

  test('no workflow reads DEPLOY_FROM_GITHUB, the switch the untested pipeline before 7 November 2026 read', () => {
    // Re-running an old run uses that run's own files: with this switch off, they deploy nothing (OPERATIONS.md).
    for (const [f] of Object.entries(workflows)) assert.doesNotMatch(read(WF + f), /DEPLOY_FROM_GITHUB\s*==/, f);
    assert.equal(Object.values(workflows).filter(w => Object.values(w.jobs).some(j => /vars\.DEPLOY_TESTED_ONLY == 'true'/.test(j.if || ''))).length, 1, 'one deploy switch, in pages-deploy.yml');
  });

  test('no workflow but pages-deploy.yml can reach Cloudflare: the API token is read there only', () => {
    for (const [f] of Object.entries(workflows)) {
      if (f === 'pages-deploy.yml') continue;
      assert.doesNotMatch(read(WF + f), /CLOUDFLARE_API_TOKEN/, f);
    }
  });

  test('freshness.yml: writes status/health.json, commits it, runs the alarm, ends red on a failure and deploys through the pipeline', () => {
    const w = workflows['freshness.yml'];
    assert.deepEqual(w.permissions, { contents: 'write', actions: 'read', issues: 'write' });
    assert.ok(w.on.schedule?.length && 'workflow_dispatch' in w.on);
    const s = steps(w.jobs.check);
    const check = s.findIndex(x => x.id === 'check'), commit = s.findIndex(x => x.uses === './.github/actions/commit-data'), fail = s.findIndex(x => x.if === "steps.check.outcome == 'failure'");
    assert.equal(s[check].run, 'node .github/scripts/freshness.mjs --health status/health.json --alert');
    assert.equal(s[check]['continue-on-error'], true, 'a failed check still writes and commits its file');
    assert.equal(s[check].env.GITHUB_TOKEN, '${{ github.token }}');
    assert.equal(s[commit].with.paths, 'status/health.json');
    assert.ok(check < commit && commit < fail, 'check, commit, then fail the run');
    assert.match(s[fail].run, /exit 1/);
    assert.ok(w.jobs.check['timeout-minutes'] >= 20, 'five live retries of three minutes fit');
    const deploy = callers().find(c => c.f === 'freshness.yml');
    assert.equal(deploy.j.needs, 'check');
    assert.doesNotMatch(read(WF + 'freshness.yml') + read('.github/scripts/freshness.mjs') + read('.github/scripts/health.mjs'), /[\w.+-]+@[\w-]+\.[\w.]+/, 'no address anywhere');
  });

  test('the suite this pipeline runs is the one package.json lists, and this file is in it', () => {
    const listed = JSON.parse(read('package.json')).scripts.test.match(/tests\/\S+\.test\.mjs/g);
    assert.ok(listed.includes('tests/freshness.test.mjs'));
    for (const f of listed) assert.ok(existsSync(join(ROOT, f)), f);
  });
});

/* ------------------------------------------------------------------ the health file is served fresh */
test('_headers: status/health.json is always revalidated', () => {
  assert.match(read('_headers'), /^\/status\/\*\r?\n {2}Cache-Control: no-cache$/m);
});

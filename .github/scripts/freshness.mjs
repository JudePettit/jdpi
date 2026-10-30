// Daily health check for PRP's data, run by .github/workflows/freshness.yml (and by hand: node .github/scripts/freshness.mjs).
// Every refresh workflow stamps its store with `generated`. A store older than about twice its schedule means its
// workflow has stopped committing, whether it fails, is skipped by GitHub or "succeeds" without writing, and nothing
// else would say so. The check also asks GitHub for each refresh workflow's last finished run, compares a few live
// files with the repository (a stuck Cloudflare Pages deploy serves old data), and smoke-tests the JSON API, the MCP
// server and llms.txt. It exits 1 when anything is wrong, and writes a table to the run's summary.
// Options: --site <url> (default https://jdpi.pages.dev), --offline (only the repository checks).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const SITE = (arg('--site') || 'https://jdpi.pages.dev').replace(/\/$/, '');
const OFFLINE = process.argv.includes('--offline');
const HOUR = 3600e3;

// Each store, the workflow that writes it and how often new data can arrive (hours). A store may be up to twice that
// old, plus three hours for GitHub's habit of starting scheduled runs late. `when` reads the store's time: by default
// its `generated`, which every run rewrites; Volatility's `latest` is the newest complete GDELT day instead (its
// `generated` moves even on a night that added no day), and Kino's index keeps its date while the films don't change,
// so Kino is read from its fetch cache. Battlefield's weekly run only looks for UCDP's monthly release, so it counts as
// monthly. `live` stores are also compared with the copy the site serves.
const generated = j => j.generated;
const STORES = [
  { file: 'science/briefing/data/stories.json', workflow: 'briefings-refresh.yml', every: 6, live: true },
  { file: 'econ/briefing/data/stories.json', workflow: 'briefings-refresh.yml', every: 6, live: true },
  { file: 'digital/briefing/data/stories.json', workflow: 'briefings-refresh.yml', every: 6, live: true },
  { file: 'briefing/data/latest.json', workflow: 'briefing-refresh.yml', every: 12 },
  { file: 'calendar/data/2020s.json', workflow: 'calendar-refresh.yml', every: 24, live: true },
  { file: 'integration/catalog.json', workflow: 'calendar-refresh.yml', every: 24 },
  { file: 'volatility/data/index.json', workflow: 'volatility-refresh.yml', every: 24, live: true, when: j => j.latest },
  { file: 'traders/data/congress.json', workflow: 'traders-refresh.yml', every: 7 * 24 },
  { file: 'traders/data/investors.json', workflow: 'traders-refresh.yml', every: 7 * 24 },
  { file: 'battlefield/data/realtime.json', workflow: 'battlefield-refresh.yml', every: 31 * 24 },
  { file: 'battlefield/focus/data/index.json', workflow: 'warfocus-refresh.yml', every: 31 * 24 },
  { file: 'science/progress/data/events.json', workflow: 'progress-refresh.yml', every: 31 * 24 },
  { file: 'lake/data/manifest.json', workflow: 'lake-refresh.yml', every: 31 * 24 },
  { file: 'national/data/index.json', workflow: 'national-refresh.yml', every: 31 * 24 },
  // The cache's own stamp once the Kino build writes one; until then its newest fetch.
  { file: 'kino/scripts/cache.json', workflow: 'kino-refresh.yml', every: 31 * 24,
    when: j => j.generated ?? [...Object.values(j.entities || {}), ...Object.values(j.files || {})].map(e => e?.at).filter(Boolean).sort().at(-1) },
];

/** The time a `generated` value stands for. A bare date counts as the end of that day, so it never looks too old. */
function stamp(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59Z` : value);
}
const age = ms => ms < 48 * HOUR ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / (24 * HOUR))} days`;

const rows = [], problems = [];
const note = (what, ok, detail) => { rows.push({ what, ok, detail }); if (!ok) problems.push(`${what}: ${detail}`); };

async function getJSON(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30e3), headers: { 'User-Agent': 'PRP freshness check (github.com/JudePettit/jdpi)', ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 1. The repository's stores.
const now = Date.now();
for (const s of STORES) {
  let value;
  try { value = (s.when || generated)(JSON.parse(fs.readFileSync(path.join(ROOT, s.file), 'utf8'))); }
  catch (e) { note(s.file, false, `unreadable (${e.message})`); continue; }
  const at = stamp(value), limit = (2 * s.every + 3) * HOUR;
  if (Number.isNaN(at)) { note(s.file, false, `no usable time (${JSON.stringify(value)})`); continue; }
  s.at = at;
  note(s.file, now - at <= limit, `${age(Math.max(0, now - at))} old, limit ${age(limit)} (${s.workflow})`);
}

if (!OFFLINE) {
  // 2. Each refresh workflow's last finished run (needs GITHUB_TOKEN and GITHUB_REPOSITORY, which Actions provides).
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (repo && token) {
    // Only the scheduled runs on main count, and not one GitHub cancelled because a third run queued behind it.
    for (const workflow of [...new Set(STORES.map(s => s.workflow))]) {
      try {
        const j = await getJSON(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=schedule&status=completed&per_page=5`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
        const run = (j.workflow_runs || []).find(r => r.conclusion !== 'cancelled');
        if (!run) { note(workflow, true, 'no finished scheduled run yet'); continue; }
        note(workflow, ['success', 'skipped'].includes(run.conclusion), `last scheduled run ${run.conclusion} on ${run.created_at.slice(0, 16).replace('T', ' ')} UTC: ${run.html_url}`);
      } catch (e) { note(workflow, false, `could not read its runs (${e.message})`); }
    }
  } else rows.push({ what: 'workflow runs', ok: true, detail: 'skipped (no GITHUB_TOKEN)' });

  // 3. The site serves what the repository holds: a live copy more than two hours behind means a stuck deploy. A commit
  // that landed moments ago may still be deploying, so a failed comparison is tried once more after three minutes.
  const liveTime = async s => stamp((s.when || generated)(await getJSON(`${SITE}/${s.file}`, { cache: 'no-store' })));
  for (const s of STORES.filter(s => s.live && s.at)) {
    for (let attempt = 1; ; attempt++) {
      try {
        const live = await liveTime(s);
        if (live >= s.at - 2 * HOUR) { note(`live ${s.file}`, true, live >= s.at ? 'the site serves the latest' : `the site serves a copy ${age(s.at - live)} older than the repository`); break; }
        if (attempt === 2) { note(`live ${s.file}`, false, `the site serves a copy ${age(s.at - live)} older than the repository`); break; }
      } catch (e) { if (attempt === 2) { note(`live ${s.file}`, false, e.message); break; } }
      await new Promise(r => setTimeout(r, 180e3));
    }
  }

  // 4. Smoke tests of what AI tools and other sites read.
  const smoke = async (what, fn) => { try { note(what, true, await fn()); } catch (e) { note(what, false, e.message); } };
  await smoke('GET /api/v1/datasets', async () => {
    const j = await getJSON(`${SITE}/api/v1/datasets`);
    if (!(j.count >= 30)) throw new Error(`only ${j.count} datasets`);
    return `${j.count} datasets`;
  });
  await smoke('POST /mcp tools/list', async () => {
    const j = await getJSON(`${SITE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    const tools = j.result?.tools?.length || 0;
    if (tools < 9) throw new Error(`${tools} tools`);
    return `${tools} tools`;
  });
  await smoke('POST /mcp list_datasets', async () => {
    const j = await getJSON(`${SITE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_datasets', arguments: {} } }) });
    if (j.error || j.result?.isError || !j.result?.content?.length) throw new Error(JSON.stringify(j.error || j.result).slice(0, 200));
    return 'answers';
  });
  await smoke('GET /llms.txt', async () => {
    const res = await fetch(`${SITE}/llms.txt`, { signal: AbortSignal.timeout(30e3) });
    const text = await res.text();
    if (!res.ok || !text.includes('Vitruvian Manager')) throw new Error(`HTTP ${res.status}`);
    return `${text.length} characters`;
  });
}

// Report: the console, and the run's summary page on GitHub.
const width = Math.max(...rows.map(r => r.what.length));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.what.padEnd(width)}  ${r.detail}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const cell = s => String(s).replace(/\|/g, '\\|');
  const md = [`## Vitruvian Manager data health: ${problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'all fresh'}`, '', '| | Check | Detail |', '|---|---|---|',
    ...rows.map(r => `| ${r.ok ? '✅' : '❌'} | ${cell(r.what)} | ${cell(r.detail)} |`)].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}

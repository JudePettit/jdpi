// The data health check's report and its alarm, used by .github/scripts/freshness.mjs and tested in
// tests/freshness.test.mjs. Nothing here runs on import.
//   stamp()        the time a store's `generated` value stands for
//   healthReport() status/health.json, the small file the check writes and the Dashboard reads (no GitHub API call
//                  from a visitor's browser)
//   summaryTable() the table on the run's summary page, also the issue's body
//   issuePlan()    what to do with the one "Data health check failing" issue, given the check and the open issues
//   syncIssue()    does it through GitHub's REST API with the workflow's own token: opens the issue (assigned to the
//                  repository's owner, so GitHub's own notifications carry it), comments on it each day it still fails,
//                  and closes it with a note once the check passes. There is never a second one.

/** The time a `generated` value stands for. A full ISO time is read as it is; a bare date counts as the end of that
 * day, so an old copy that still carries one never looks too old. */
export function stamp(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59Z` : value);
}

/** "7 Nov 2026", in UTC. */
export const day = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The address of this Actions run, or null outside Actions. */
export function runUrl(env = process.env) {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = env;
  return server && repo && id ? `${server}/${repo}/actions/runs/${id}` : null;
}

/** status/health.json: when the check ran, whether it passed, and each failing check by its plain name. */
export function healthReport(rows, { now = Date.now(), run = null } = {}) {
  const failing = rows.filter(r => !r.ok).map(r => ({ name: r.name || r.what, what: r.what, detail: r.detail }));
  return { generated: new Date(now).toISOString(), ok: failing.length === 0, problems: failing.length, failing, run };
}

const plural = n => `${n} problem${n === 1 ? '' : 's'}`;
export function summaryTable(rows) {
  const cell = s => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return ['| | Check | Detail |', '|---|---|---|', ...rows.map(r => `| ${r.ok ? '✅' : '❌'} | ${cell(r.name ? `${r.name} (${r.what})` : r.what)} | ${cell(r.detail)} |`)].join('\n');
}
export const summaryHeading = health => `Vitruvian Manager data health: ${health.ok ? 'all fresh' : plural(health.problems)}`;

export const ISSUE_TITLE = 'Data health check failing';
const BOT = 'github-actions[bot]';
const ISSUE_PAGES = 20; // up to 2,000 open issues and pull requests are looked through
const runLink = health => (health.run ? ` ([the run](${health.run}))` : '');

/** The one open issue this check owns (opened by the Actions bot under ISSUE_TITLE; pull requests are not issues). */
export function ownIssue(open) {
  return (Array.isArray(open) ? open : []).filter(i => !i.pull_request && i.title === ISSUE_TITLE && i.user?.login === BOT).sort((a, b) => a.number - b.number)[0] || null;
}

/** What to do: 'open' a new issue, 'update' the open one (a comment, so GitHub notifies, and a fresh body), 'close' it,
 * or 'none'. */
export function issuePlan(health, open, { rows = [], owner = '' } = {}) {
  const issue = ownIssue(open), when = day(Date.parse(health.generated));
  const names = [...new Set(health.failing.map(f => f.name))];
  const table = summaryTable(rows.length ? rows : health.failing.map(f => ({ ...f, ok: false })));
  const body = [`The daily data health check failed on ${when}${runLink(health)}: ${plural(health.problems)}, in ${names.join(', ')}.`, '', table, '',
    'The check (`.github/workflows/freshness.yml`) opened this issue. It adds a comment each day the check still fails, and closes the issue when it passes. OPERATIONS.md, "When something breaks", says where to look.'].join('\n');
  if (!health.ok && !issue) return { action: 'open', title: ISSUE_TITLE, body, assignees: owner ? [owner] : [] };
  if (!health.ok) return { action: 'update', number: issue.number, body, comment: [`Still failing on ${when}${runLink(health)}: ${plural(health.problems)}, in ${names.join(', ')}.`, '', table].join('\n') };
  if (issue) return { action: 'close', number: issue.number, comment: `The check passed on ${when}${runLink(health)}: all fresh. Closing.` };
  return { action: 'none' };
}

/** Carries the plan out. Returns { action, number } or { error }; it never throws, so a GitHub API problem cannot change
 * the check's own result (freshness.mjs prints it as a warning). */
export async function syncIssue(health, { repo, token, owner = '', rows = [], fetch: get = globalThis.fetch, api = 'https://api.github.com' } = {}) {
  if (!repo || !token) return { error: 'no GITHUB_REPOSITORY or GITHUB_TOKEN' };
  const call = async (method, path, body) => {
    const res = await get(`${api}/repos/${repo}${path}`, {
      method, signal: AbortSignal.timeout(30e3),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'VM freshness check', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    // The open issues and pull requests, newest first, a page of 100 at a time, until this check's own issue turns up
    // (ownIssue() picks it) or the list ends: however busy the tracker, its issue is found and never opened twice.
    const open = [];
    for (let page = 1; page <= ISSUE_PAGES; page++) {
      const got = await call('GET', `/issues?state=open&per_page=100${page > 1 ? `&page=${page}` : ''}`);
      const list = Array.isArray(got) ? got : [];
      open.push(...list);
      if (ownIssue(list) || list.length < 100) break;
    }
    const plan = issuePlan(health, open, { rows, owner });
    if (plan.action === 'open') {
      // An owner GitHub will not assign (HTTP 422) still gets the issue, unassigned: watching the repository notifies them.
      const made = await call('POST', '/issues', { title: plan.title, body: plan.body, assignees: plan.assignees })
        .catch(e => (plan.assignees.length && / HTTP 422$/.test(e.message) ? call('POST', '/issues', { title: plan.title, body: plan.body }) : Promise.reject(e)));
      return { action: 'open', number: made.number };
    }
    if (plan.action === 'update') {
      await call('POST', `/issues/${plan.number}/comments`, { body: plan.comment });
      await call('PATCH', `/issues/${plan.number}`, { body: plan.body });
    }
    if (plan.action === 'close') {
      await call('POST', `/issues/${plan.number}/comments`, { body: plan.comment });
      await call('PATCH', `/issues/${plan.number}`, { state: 'closed', state_reason: 'completed' });
    }
    return { action: plan.action, number: plan.number };
  } catch (e) { return { error: e.message }; }
}

// OSINT Dashboard · Events: a GDELT DOC 2.0 query builder with preconfigured monitors, a coverage timeline
// (TimelineVolRaw: articles per period and the share of all monitored coverage) and the matching articles (ArtList).
// Keyless and CORS-enabled, but GDELT allows one request every five seconds and answers a busy client without the
// CORS header, so requests are queued at least six seconds apart and retried once.
import {
  esc, buildGdeltQuery, gdeltUrl, parseGdeltText, gdeltTimeline, gdeltArticles, summariseArticles, nextSlot, niceScale, compactGdelt, trimSaved,
  GDELT_SPANS, GDELT_SORTS, GDELT_COUNTRIES, GDELT_LANGUAGES, utcLabel, dayLabel, isoDay, LESSONS, lessonSlug,
} from './lib.js';
import { $, $$, fetchData, num, prpLink, courseLink } from './ui.js';

const MONITORS = [
  { label: 'Undersea cables', phrase: 'undersea cable', any: 'damage cut sabotage anchor', span: '1m' },
  { label: 'Red Sea shipping', phrase: 'Red Sea', any: 'shipping tanker vessel freighter', span: '2w' },
  { label: 'GPS jamming', any: '"GPS jamming" "GPS interference" "GNSS interference" "GPS spoofing"', span: '1m' },
  { label: 'Black Sea ports', phrase: 'Black Sea', any: 'port grain corridor', span: '2w' },
  { label: 'Sahel juntas', all: 'junta', any: 'Mali Burkina Niger', span: '1m' },
  { label: 'Ransomware', all: 'ransomware', any: 'attack hospital council', span: '1w' },
  { label: 'Wildfires', all: 'wildfire evacuation', span: '1w' },
  { label: 'Election disinformation', all: 'election', any: 'disinformation misinformation deepfake', span: '2w' },
];
const MAX_ARTICLES = 100;
const cache = new Map();
// The last few replies, kept in this browser so a monitor still shows something (marked as saved) when GDELT is busy.
const SAVED_KEY = 'prp.osint.gdelt.saved.v1';
const saved = {
  all() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') || {}; } catch { return {}; } },
  get(url) { const x = this.all()[url]; return x?.json ? { ok: true, json: x.json, stale: true, savedAt: new Date(x.at) } : null; },
  put(url, json) {
    try { const all = this.all(); all[url] = { at: Date.now(), json: compactGdelt(json) }; localStorage.setItem(SAVED_KEY, JSON.stringify(trimSaved(all))); }
    catch { try { localStorage.removeItem(SAVED_KEY); } catch { /* storage blocked: nothing saved */ } } // never crowd out the case notebook
  },
};
/** A failed request: the saved copy of the same query if there is one (flagged stale), otherwise the failure. */
const orSaved = (url, failure) => { const s = saved.get(url); return s ? { ...s, busy: failure.busy, error: failure.error } : failure; };
let panelEl, ctxRef, form, manual = false, measure = 'value', points = [], lastDone = 0, chain = Promise.resolve(), runId = 0, started = false;
const sleep = ms => new Promise(ok => setTimeout(ok, ms));

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx; form = $('#ev-form', panel);
  const opts = (sel, map) => { $(sel, panel).innerHTML = Object.entries(map).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); };
  opts('#ev-country', GDELT_COUNTRIES); opts('#ev-lang', GDELT_LANGUAGES); opts('#ev-span', GDELT_SPANS); opts('#ev-sort', GDELT_SORTS);
  form.span.value = '2w';
  $('#ev-presets', panel).insertAdjacentHTML('beforeend', MONITORS.map((m, i) => `<button type="button" class="prp-chip" data-m="${i}">${esc(m.label)}</button>`).join(''));
  $('#ev-presets', panel).addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) usePreset(+b.dataset.m, true); });
  form.addEventListener('input', e => { if (e.target.name === 'query') manual = true; else { manual = false; syncQuery(); } markPreset(-1); });
  form.addEventListener('change', e => { if (e.target.tagName === 'SELECT') { manual = false; syncQuery(); } });
  form.addEventListener('submit', e => { e.preventDefault(); runQuery(); });
  $('.seg', $('.ev-chart-panel', panel)).addEventListener('click', e => {
    const b = e.target.closest('[data-measure]'); if (!b) return;
    measure = b.dataset.measure;
    $$('[data-measure]', panel).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    drawChart();
  });
  const links = [
    ['Global Headline Tracker', prpLink('rt', 'headlines', 'q/headlines.html?view=current'), 'Any country’s last 24 hours of news on a map, with archives'],
    ['Intelligence Briefing', prpLink('rt', 'briefing', 'q/briefing.html'), 'Your topics across fifty publishers, left to right'],
    ['Geopolitical Volatility', prpLink('rt', 'volatility', 'q/volatility.html'), 'A daily 0–100 index per country, also built from GDELT'],
    [`Course: ${LESSONS.events}`, courseLink(lessonSlug(LESSONS.events)), 'Why raw GDELT counts drift, and how to read them'],
  ];
  $('#ev-prp', panel).innerHTML = links.map(([n, l, d]) => `<li><a href="${esc(l.href)}" target="${l.target}">${esc(n)}</a><span>${esc(d)}</span></li>`).join('');
  new ResizeObserver(() => drawChart()).observe($('#ev-chart', panel));
  const chart = $('#ev-chart', panel);
  chart.addEventListener('pointermove', hover);
  chart.addEventListener('pointerleave', () => { $('#tip').hidden = true; chart.querySelectorAll('.hover-line, .hover-dot').forEach(n => n.setAttribute('visibility', 'hidden')); });
  $('#ev-articles', panel).addEventListener('click', articleAction);
  if (ctx.state.q) { setQuery(ctx.state.q, ctx.state.w); started = true; runQuery(); }
}

export function show(state) {
  if (state.q && (state.q !== $('#ev-query', panelEl).value || (state.w && state.w !== form.span.value))) { setQuery(state.q, state.w); started = true; runQuery(); return; }
  if (!started) { started = true; usePreset(0, true); } // a live view on first visit: the first preconfigured monitor
}

/** Show a query from a link (#tab=events&q=…&w=…): a monitor's own fields when it is one of them, else the raw query. */
function setQuery(q, w) {
  const i = MONITORS.findIndex(m => buildGdeltQuery(m).query === q);
  if (i >= 0) usePreset(i, false); else { form.reset(); form.query.value = q; manual = true; markPreset(-1); }
  form.span.value = Object.hasOwn(GDELT_SPANS, w || '') ? w : i >= 0 ? MONITORS[i].span || '2w' : '2w';
  updateOpenLink();
}
function markPreset(i) { $$('[data-m]', panelEl).forEach(b => b.classList.toggle('on', +b.dataset.m === i)); }
function usePreset(i, go) {
  const m = MONITORS[i];
  form.reset();
  for (const k of ['all', 'phrase', 'any', 'none']) form[k].value = m[k] || '';
  form.span.value = m.span || '2w';
  manual = false; syncQuery(); markPreset(i);
  if (go) runQuery();
}
function spec() { return { all: form.all.value, phrase: form.phrase.value, any: form.any.value, none: form.none.value, country: form.country.value, lang: form.lang.value, domain: form.domain.value }; }
function syncQuery() {
  const b = buildGdeltQuery(spec());
  form.query.value = b.query;
  $('#ev-errors', panelEl).textContent = form.all.value || form.phrase.value || form.any.value || form.domain.value ? b.errors.join(' ') : '';
  updateOpenLink();
}
function updateOpenLink() {
  const q = form.query.value.trim();
  $('#ev-open', panelEl).href = q ? gdeltUrl({ query: q, mode: 'artlist', span: form.span.value, format: 'html', sort: form.sort.value, max: MAX_ARTICLES }) : 'https://api.gdeltproject.org/api/v2/doc/doc';
}

/** Queue a GDELT request at least six seconds after the last one finished; retry once if GDELT was busy. */
function gdelt(url, status) {
  const job = chain.then(async () => {
    if (cache.has(url)) return cache.get(url);
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = nextSlot(lastDone, Date.now(), attempt ? 12000 : 6000) - Date.now();
      if (wait > 0) { status(attempt ? `GDELT was busy; trying again in ${Math.ceil(wait / 1000)} s…` : `Waiting ${Math.ceil(wait / 1000)} s (GDELT allows one request every five seconds)…`); await sleep(wait); }
      status(null);
      const r = await fetchData(url, { timeout: 60000, as: 'text' });
      lastDone = Date.now();
      if (r.ok) { const p = parseGdeltText(r.text); if (p.ok) { cache.set(url, p); saved.put(url, p.json); } return p; }
      if (r.kind === 'timeout') return orSaved(url, { ok: false, busy: true, error: 'GDELT took too long to answer. Try a shorter window or a narrower query.' });
      if (attempt === 1 || (r.kind === 'http' && r.status !== 429)) return orSaved(url, { ok: false, busy: r.kind === 'network' || r.status === 429, error: r.kind === 'network' ? 'GDELT could not be reached. When it is busy or rate-limiting (it allows one request every five seconds per internet address, shared with everyone on your network) it answers without the header browsers need, so the page can’t read the reply. Wait a minute and run the query again, or use “Open in GDELT” above.' : `GDELT answered with an error (HTTP ${r.status}).` });
    }
    return orSaved(url, { ok: false, busy: true, error: 'GDELT could not be reached.' });
  });
  chain = job.catch(() => {});
  return job;
}

async function runQuery() {
  const q = form.query.value.trim();
  const errs = $('#ev-errors', panelEl);
  if (!q) { errs.textContent = 'Enter at least one word, phrase or outlet.'; return; }
  if (!manual) { const b = buildGdeltQuery(spec()); if (b.errors.length) { errs.textContent = b.errors.join(' '); return; } }
  errs.textContent = '';
  updateOpenLink();
  const me = ++runId, span = form.span.value, sort = form.sort.value;
  ctxRef.setParam({ q, w: span });
  ctxRef.log({ kind: 'search', text: `GDELT (${GDELT_SPANS[span]}): ${q}`, url: gdeltUrl({ query: q, mode: 'artlist', span, format: 'html', sort, max: MAX_ARTICLES }) });
  const status = $('#ev-status', panelEl);
  const say = (t, cls = '') => { if (me === runId) { status.textContent = t; status.className = 'status-line ' + cls; } };
  $('#ev-title', panelEl).textContent = `Coverage over ${GDELT_SPANS[span]}`;
  $('#ev-chart', panelEl).innerHTML = '<div class="loading">Asking GDELT for the timeline…</div>';
  $('#ev-articles', panelEl).innerHTML = '<div class="loading">Waiting for the timeline first…</div>';
  $('#ev-run', panelEl).disabled = true;
  say(''); // the chart and article panels show progress; the status line reports queue waits and the result
  const tlUrl = gdeltUrl({ query: q, mode: 'timelinevolraw', span }), alUrl = gdeltUrl({ query: q, mode: 'artlist', span, sort, max: MAX_ARTICLES });
  const tl = await gdelt(tlUrl, t => say(t || ''));
  if (me !== runId) return;
  if (!tl.ok) { points = []; $('#ev-chart', panelEl).innerHTML = `<div class="panel-msg bad">${esc(tl.error)}</div>`; $('#ev-table', panelEl).innerHTML = ''; }
  else {
    points = gdeltTimeline(tl.json);
    if (points.length) { drawChart(); renderTable(); }
    else { $('#ev-chart', panelEl).innerHTML = '<div class="panel-msg">GDELT found no matching coverage in this window.</div>'; $('#ev-table', panelEl).innerHTML = ''; }
  }
  let al;
  if (tl.busy) al = saved.get(alUrl) || { ok: false, skipped: true }; // GDELT is turning requests away: don't add to the load
  else {
    $('#ev-articles', panelEl).innerHTML = '<div class="loading">Asking GDELT for the articles…</div>';
    al = await gdelt(alUrl, t => say(t || ''));
    if (me !== runId) return;
  }
  $('#ev-run', panelEl).disabled = false;
  if (!al.ok) {
    $('#ev-articles', panelEl).innerHTML = al.skipped ? '<p class="prp-empty">Not requested while GDELT is busy. Run the query again in a minute.</p>' : `<div class="panel-msg bad">${esc(al.error)}</div>`;
    say(tl.ok ? (tl.stale ? `GDELT is busy: the timeline is the copy saved ${utcLabel(tl.savedAt)}.` : 'Timeline loaded; the article list failed.') : 'GDELT did not answer.', tl.stale ? 'warn' : 'bad');
    return;
  }
  const arts = gdeltArticles(al.json);
  renderArticles(arts, q);
  const total = points.reduce((a, p) => a + p.value, 0);
  const stale = [tl, al].filter(x => x.stale).map(x => x.savedAt).sort((a, b) => a - b)[0];
  if (stale) say(`GDELT is busy, so this is the copy saved in this browser ${utcLabel(stale)}. Run the query again in a minute for fresh results.`, 'warn');
  else say(`${tl.ok ? `${num(total)} matching articles in the window` : 'No timeline'} · ${num(arts.length)} listed · checked ${new Date().toISOString().slice(11, 16)} UTC`, 'good');
}

/* ---------- Figure: articles (or share of coverage) per period ---------- */
function drawChart() {
  const box = $('#ev-chart', panelEl);
  if (!box || !points.length || !box.isConnected || box.closest('[hidden]')) return;
  const W = Math.max(300, Math.round(box.clientWidth || 600)), H = W < 560 ? 210 : 250;
  const m = { l: measure === 'share' ? 56 : 46, r: 14, t: 12, b: 30 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = points.map(p => p[measure]);
  const sc = niceScale(Math.max(...vals), 4);
  const t0 = +points[0].t, t1 = +points.at(-1).t;
  const x = t => m.l + (t1 === t0 ? iw / 2 : ((+t - t0) / (t1 - t0)) * iw), y = v => m.t + ih - (v / sc.max) * ih;
  const fmtY = v => measure === 'share' ? (v === 0 ? '0' : `${+v.toPrecision(2)}%`) : num(v);
  const hourly = points.length > 1 && (+points[1].t - +points[0].t) < 864e5;
  const spanDays = (t1 - t0) / 864e5;
  const step = spanDays <= 2 ? 6 * 36e5 : spanDays <= 10 ? 864e5 : spanDays <= 40 ? 7 * 864e5 : 14 * 864e5;
  const first = Math.ceil(t0 / step) * step;
  const xt = [];
  for (let t = first; t <= t1; t += step) xt.push(t);
  const label = t => { const d = new Date(t); return step < 864e5 ? `${String(d.getUTCHours()).padStart(2, '0')}:00${d.getUTCHours() === 0 ? ' ' + dayLabel(d).replace(/ \d{4}$/, '') : ''}` : dayLabel(d).replace(/ \d{4}$/, ''); };
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p[measure]).toFixed(1)}`).join('');
  const area = `${line}L${x(points.at(-1).t).toFixed(1)} ${y(0)}L${x(points[0].t).toFixed(1)} ${y(0)}Z`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <g class="grid">${sc.ticks.map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
    <g class="ylab">${sc.ticks.map(v => `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtY(v))}</text>`).join('')}</g>
    <g class="axis"><line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>${xt.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${y(0)}" y2="${y(0) + 4}"/>`).join('')}</g>
    <g class="xlab">${thin(xt, Math.max(2, Math.floor(iw / 70))).map(t => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${esc(label(t))}</text>`).join('')}</g>
    <path class="area" d="${area}"/><path class="line" d="${line}"/>
    <line class="hover-line" x1="0" x2="0" y1="${m.t}" y2="${y(0)}" visibility="hidden"/><circle class="hover-dot" r="4" cx="0" cy="0" visibility="hidden"/>
  </svg>`;
  box.dataset.geom = JSON.stringify({ m, W, H, t0, t1, iw, ih, max: sc.max, hourly });
  $('#ev-caption', panelEl).innerHTML = `<b>Figure 1.</b> ${measure === 'share' ? 'Share of all online news monitored by GDELT that matches the query' : 'Online news articles matching the query'}, per ${hourly ? 'hour' : 'day'}, ${esc(dayLabel(points[0].t))} to ${esc(dayLabel(points.at(-1).t))} (UTC). GDELT’s coverage grows over time and is richest in English, so compare periods with the share rather than raw counts. Source: GDELT DOC 2.0 API.`;
}
function thin(ticks, max) { if (ticks.length <= max) return ticks; const k = Math.ceil(ticks.length / max); return ticks.filter((t, i) => i % k === 0); }

function hover(e) {
  const box = $('#ev-chart', panelEl), svg = box.querySelector('svg');
  if (!svg || !points.length || !box.dataset.geom) return;
  const g = JSON.parse(box.dataset.geom), r = svg.getBoundingClientRect(), scale = g.W / r.width;
  const px = (e.clientX - r.left) * scale;
  const t = g.t0 + ((px - g.m.l) / g.iw) * (g.t1 - g.t0);
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(+points[i].t - t) < Math.abs(+points[best].t - t)) best = i;
  const p = points[best], cx = g.m.l + (g.t1 === g.t0 ? g.iw / 2 : ((+p.t - g.t0) / (g.t1 - g.t0)) * g.iw), cy = g.m.t + g.ih - (p[measure] / g.max) * g.ih;
  const hl = svg.querySelector('.hover-line'), hd = svg.querySelector('.hover-dot');
  hl.setAttribute('x1', cx); hl.setAttribute('x2', cx); hl.setAttribute('visibility', 'visible');
  hd.setAttribute('cx', cx); hd.setAttribute('cy', cy); hd.setAttribute('visibility', 'visible');
  const tip = $('#tip');
  tip.innerHTML = `${esc(g.hourly ? utcLabel(p.t) : dayLabel(p.t))}<br><b>${num(p.value)}</b> article${p.value === 1 ? '' : 's'} · <b>${p.share.toPrecision(2)}%</b> of ${num(p.norm)} monitored`;
  tip.hidden = false;
  const tx = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
  tip.style.left = tx + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px';
}

function renderTable() {
  $('#ev-table', panelEl).innerHTML = `<table class="prp-table"><thead><tr><th scope="col">Period (UTC)</th><th scope="col" class="num">Articles</th><th scope="col" class="num">Share of coverage</th><th scope="col" class="num">All monitored</th></tr></thead><tbody>
    ${points.map(p => `<tr><td class="mono">${esc(utcLabel(p.t).replace(' UTC', ''))}</td><td class="num">${num(p.value)}</td><td class="num">${p.share.toPrecision(3)}%</td><td class="num">${num(p.norm)}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------- Articles and who is reporting ---------- */
let articles = [], articleQuery = '', shownArticles = 25;
function renderArticles(list, q, keep = false) {
  articles = list; articleQuery = q;
  if (!keep) shownArticles = 25;
  $('#ev-art-count', panelEl).textContent = list.length ? `${num(list.length)} · ${GDELT_SORTS[form.sort.value].toLowerCase()}` : '';
  $('#ev-articles', panelEl).innerHTML = list.length ? `<ul class="articles">${list.slice(0, shownArticles).map((a, i) => `<li>
      <div class="l1"><span class="src">${esc(a.domain)}</span>${a.country ? `<span>${esc(a.country)}</span>` : ''}${a.language ? `<span>${esc(a.language)}</span>` : ''}${a.seen ? `<time datetime="${a.seen.toISOString()}">${esc(utcLabel(a.seen))}</time>` : ''}</div>
      <h3><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}<span class="sr-only"> (opens in a new tab)</span></a></h3>
      <div class="acts"><button type="button" class="prp-btn sm ghost" data-a="archive" data-i="${i}">Check the archives</button><button type="button" class="prp-btn sm ghost" data-a="add" data-i="${i}">Add to the notebook</button></div></li>`).join('')}</ul>${list.length > shownArticles ? `<div class="view-actions"><button type="button" class="prp-btn sm" data-a="more">Show ${Math.min(25, list.length - shownArticles)} more</button><span class="small muted">${num(shownArticles)} of ${num(list.length)} shown</span></div>` : ''}`
    : '<p class="prp-empty">No articles matched in this window. Widen the window, drop a filter, or check the spelling in the local language.</p>';
  const s = summariseArticles(list);
  const bars = (title, rows) => rows.length ? `<h3>${title}</h3><ul class="bars">${rows.map(r => `<li><span>${esc(r.name)}</span><span class="n">${num(r.n)}</span><span class="bar"><i style="width:${Math.round((r.n / rows[0].n) * 100)}%"></i></span></li>`).join('')}</ul>` : '';
  $('#ev-summary', panelEl).innerHTML = list.length ? bars('Outlets', s.domains) + bars('Outlet countries', s.countries) + bars('Languages', s.languages) : '<p class="small muted">Nothing to summarise.</p>';
}
function articleAction(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'more') { shownArticles += 25; renderArticles(articles, articleQuery, true); return; }
  const a = articles[+b.dataset.i];
  if (b.dataset.a === 'archive') ctxRef.go('archives', { q: a.url });
  else ctxRef.addToNotebook({ claim: a.title, url: a.url, accessed: isoDay(), eventDate: a.seen ? isoDay(a.seen) : '', tags: ['news'], notes: `${a.domain}${a.country ? ', ' + a.country : ''}${a.language ? ', ' + a.language : ''}. First seen by GDELT ${a.seen ? utcLabel(a.seen) : ''}, in the query: ${articleQuery}` });
}

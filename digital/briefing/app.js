// Digital Briefing page. Data: data/stories.json, built every six hours by digital/scripts/build-briefing.mjs.
// State lives in the URL hash (#f=security&type=paper&w=7d&src=arxiv&q=…&sort=newest&tab=sources) so the shell and the
// Encyclopaedia can deep-link; the chosen field is also remembered in this browser (localStorage, best effort).
import {
  WINDOW_LABELS, KIND_ORDER, esc, parseHash, toHash, filterItems, countByField, arrange, dailySeries, topOutlets, badgeOf,
  dayLabel, timeLabel, fieldColours,
} from './view.js';

const $ = s => document.querySelector(s);
const STORE_KEY = 'prp.digital-briefing.field';
const PAGE = 120, MORE = 200;
const remembered = {
  get() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
  set(v) { try { if (!v || v === 'all') localStorage.removeItem(STORE_KEY); else localStorage.setItem(STORE_KEY, v); } catch { /* storage blocked */ } },
};
let D, SRC = new Map(), state, shown = PAGE, ref = Date.now();

const num = n => Number(n || 0).toLocaleString('en-GB');
const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
const outletOf = id => { const s = SRC.get(id); return s ? { id: s.outletId, name: s.outlet } : null; };
const fieldOf = id => D.fields.find(f => f.id === id);
const label = id => fieldOf(id)?.label || id;
const short = id => fieldOf(id)?.short || label(id);
const utc = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const shortDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isColour = v => (window.CSS?.supports ? CSS.supports('color', v) : true);
const doiHref = doi => 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
// Only http(s) links from the feeds become hrefs.
const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? u : '#');

/* ---------- state ---------- */
function setState(patch, { keepShown = false } = {}) {
  Object.assign(state, patch);
  if ('f' in patch) remembered.set(state.f);
  if (!keepShown) shown = PAGE;
  const h = toHash(state);
  if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
  render();
}
function readHash() {
  state = parseHash(location.hash, D.fields, { f: remembered.get() || 'all' });
  if (state.src && ![...SRC.values()].some(s => s.outletId === state.src)) state.src = '';
  shown = PAGE;
}

/* ---------- rendering ---------- */
function render() {
  const sources = state.tab === 'sources';
  for (const [tab, panel, on] of [['#tab-stories', '#panel-stories', !sources], ['#tab-sources', '#panel-sources', sources]]) {
    $(tab).setAttribute('aria-selected', String(on)); $(tab).tabIndex = on ? 0 : -1; $(panel).hidden = !on;
  }
  if (sources) return;
  renderControls(); renderChips(); renderList(); renderTop(); drawChart();
}

function renderControls() {
  for (const [id, v] of [['#type', state.type], ['#window', state.w]]) $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  $('#source').value = state.src; $('#order').value = state.sort;
  if (document.activeElement !== $('#q')) $('#q').value = state.q;
}

function renderChips() {
  const c = countByField(filterItems(D.items, state, { now: ref, outletOf, skip: ['f'] }), D.fields);
  $('#chips').innerHTML = [{ id: 'all', label: 'All', short: 'All' }, ...D.fields].map(f => {
    const on = state.f === f.id, mark = f.id !== 'all';
    const name = f.short && f.short !== f.label ? `<span class="long">${esc(f.label)}</span><span class="short" aria-hidden="true">${esc(f.short)}</span>` : esc(f.label);
    return `<button type="button" class="prp-chip${on ? ' on' : ''}" data-v="${esc(f.id)}"${mark ? ` data-f="${esc(f.id)}"` : ''} aria-pressed="${on}" aria-label="${esc(f.label)}, ${num(c[f.id])} items">` +
      `${mark ? '<span class="dot" aria-hidden="true"></span>' : ''}${name}<span class="n" aria-hidden="true">${num(c[f.id])}</span></button>`;
  }).join('');
}

function entryHtml(i) {
  const s = SRC.get(i.source), time = timeLabel(i.published, i.undated);
  const also = [...new Set((i.also || []).map(a => SRC.get(a)?.outlet).filter(o => o && o !== s?.outlet))];
  const tags = i.fields.map(f => `<span class="tag" data-f="${esc(f)}">${esc(short(f))}</span>`).join('');
  const l3 = tags + (i.section ? `<span class="section">${esc(i.section)}</span>` : '') +
    (i.doi ? `<a class="doi" href="${esc(doiHref(i.doi))}" target="_blank" rel="noopener">doi:${esc(i.doi)}</a>` : '') +
    (also.length ? `<span class="also">Also in ${esc(also.join(', '))}</span>` : '');
  return `<article class="entry" data-type="${esc(i.type)}">
    <div class="l1"><span class="badge ${esc(i.type)}">${esc(badgeOf(i, s))}</span><span class="src">${esc(s?.outlet || i.source)}</span>${time ? `<time class="time" datetime="${esc(i.published)}">${esc(time)}</time>` : ''}</div>
    <h4><a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">${esc(i.title)}</a></h4>
    ${i.authors ? `<p class="by">${esc(i.authors)}</p>` : ''}${i.summary ? `<p class="sum">${esc(i.summary)}</p>` : ''}${l3 ? `<div class="l3">${l3}</div>` : ''}
  </article>`;
}

function renderList() {
  const list = filterItems(D.items, state, { now: ref, outletOf });
  const papers = list.filter(i => i.type === 'paper').length;
  const what = state.f === 'all' ? 'All fields' : label(state.f);
  $('#toc-title').textContent = `${what} · last ${WINDOW_LABELS[state.w]}`;
  $('#status').textContent = `${plural(list.length, 'item')} · ${num(papers)} papers, ${num(list.length - papers)} news`;
  if (!list.length) {
    const wider = state.w !== '7d' ? '<button type="button" class="prp-btn sm" data-wider>Show 7 days</button> ' : '';
    $('#list').innerHTML = `<div class="prp-empty">Nothing matches these filters.<div class="empty-actions">${wider}<button type="button" class="prp-btn sm" data-reset>Clear filters</button></div></div>`;
    return;
  }
  let left = shown, html = '';
  for (const g of arrange(list, state.sort)) {
    if (left <= 0) break;
    const [rel, full] = dayLabel(g.key, Date.now());
    html += `<section class="day" aria-label="${esc(full)}"><div class="day-head"><h3>${rel ? `<span class="rel">${rel}</span>` : ''}${esc(full)}</h3><span class="count">${plural(g.items.length, 'item')}</span></div>` +
      g.items.slice(0, left).map(entryHtml).join('') + '</section>';
    left -= g.items.length;
  }
  if (list.length > shown) html += `<div class="more"><button type="button" class="prp-btn" data-more>Show ${num(Math.min(MORE, list.length - shown))} more <span class="prp-muted">(${num(list.length - shown)} left)</span></button></div>`;
  $('#list').innerHTML = html;
}

function renderTop() {
  const scope = filterItems(D.items, state, { now: ref, outletOf, skip: ['src'] });
  const top = topOutlets(scope, outletOf, 8), max = top[0]?.count || 1;
  $('#top').innerHTML = top.length ? top.map(o => `<li><button type="button" data-src="${esc(o.id)}" aria-pressed="${state.src === o.id}" title="${state.src === o.id ? 'Show all sources' : 'Show only ' + esc(o.name)}">` +
    `<span class="nm">${esc(o.name)}</span><span class="ct">${num(o.count)}</span><span class="bar" aria-hidden="true"><i style="width:${(o.count / max * 100).toFixed(1)}%"></i></span></button></li>`).join('')
    : '<li class="prp-empty">No items in this view.</li>';
}

/* Figure 1: one row of seven daily columns per field, on a shared scale. Colours are the validated categorical tokens
   (--prp-cat-1…8 in field order), read from the stylesheet and redrawn on prp:themechange. */
function drawChart() {
  const host = $('#chart');
  if (!host || $('#panel-stories').hidden) return;
  const ids = D.fields.map(f => f.id);
  const { days, series } = dailySeries(filterItems(D.items, state, { now: ref, outletOf, skip: ['w', 'f'] }), ids, 7, ref);
  const from = shortDay(days[0]).split(' ').slice(1).join(' '); // "22 Oct"
  const max = Math.max(1, ...ids.flatMap(id => series[id]));
  const W = Math.max(240, Math.round(host.clientWidth || 290)), rowH = 38, labelW = Math.min(132, Math.round(W * 0.42)), axisH = 18;
  const H = ids.length * rowH + axisH, gap = 3, bw = (W - labelW - gap * 6) / 7;
  const c = { text: tok('--prp-text'), muted: tok('--prp-muted'), axis: tok('--prp-axis'), band: tok('--prp-surface-3'), mono: tok('--prp-font-mono') };
  const colour = fieldColours(ids, tok, isColour, c.muted);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
  ids.forEach((id, r) => {
    const y0 = r * rowH, base = y0 + rowH - 8, hMax = rowH - 14, total = series[id].reduce((a, b) => a + b, 0), sel = state.f === id;
    if (sel) svg += `<rect x="-6" y="${y0 + 1}" width="${W + 12}" height="${rowH - 2}" rx="4" fill="${esc(c.band)}"/>`;
    svg += `<text x="0" y="${y0 + 15}" fill="${esc(c.text)}" font-size="12.5" font-weight="${sel ? 700 : 500}">${esc(short(id))}</text>`;
    svg += `<text x="0" y="${y0 + 29}" fill="${esc(c.muted)}" font-size="10.5" font-family="${esc(c.mono)}">${num(total)} since ${esc(from)}</text>`;
    svg += `<line x1="${labelW}" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="${esc(c.axis)}" stroke-width="1"/>`;
    series[id].forEach((v, k) => {
      const x = labelW + k * (bw + gap), h = v ? Math.max(2, (v / max) * hMax) : 0;
      const tip = `<b>${esc(label(id))}</b> · ${esc(shortDay(days[k]))}: <b>${num(v)}</b> ${v === 1 ? 'item' : 'items'}`;
      if (h) svg += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${esc(colour[id])}"/>`;
      svg += `<rect x="${x.toFixed(1)}" y="${y0 + 2}" width="${bw.toFixed(1)}" height="${rowH - 4}" fill="transparent" data-tip="${esc(tip)}"/>`;
    });
  });
  days.forEach((key, k) => {
    const x = labelW + k * (bw + gap) + bw / 2;
    svg += `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="${esc(c.muted)}" font-size="10" font-family="${esc(c.mono)}">${Number(key.slice(8))}</text>`;
  });
  host.innerHTML = svg + '</svg>';
  host.setAttribute('aria-label', `Items per day by field, ${shortDay(days[0])} to ${shortDay(days[6])}: ` + ids.map(id => `${label(id)} ${series[id].reduce((a, b) => a + b, 0)}`).join(', '));
  $('#chart-table').innerHTML = `<table class="prp-table"><thead><tr><th scope="col">Day</th>${ids.map(id => `<th scope="col" class="num">${esc(short(id))}</th>`).join('')}</tr></thead><tbody>` +
    days.map((key, k) => `<tr><td>${esc(shortDay(key))}</td>${ids.map(id => `<td class="num">${num(series[id][k])}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
}

function renderSources() {
  const feeds = D.sources, ok = feeds.filter(s => s.status === 'ok').length;
  const n = k => feeds.filter(s => s.kind === k).length;
  const kpi = (k, v, small = '') => `<div class="prp-kpi"><span>${k}</span><b>${v}</b>${small ? `<small>${small}</small>` : ''}</div>`;
  $('#kpis').innerHTML = kpi('Feeds', num(feeds.length), `${num(new Set(feeds.map(s => s.outletId)).size)} outlets`) +
    kpi('Working', num(ok), ok < feeds.length ? `${feeds.length - ok} with errors` : 'all feeds answered') +
    kpi('Research feeds', num(n('journal') + n('preprint') + n('lab') + n('research')), `${n('journal')} journals, ${n('preprint')} arXiv categories`) +
    kpi('Government & advisories', num(n('official'))) +
    kpi('News & commentary', num(n('news'))) +
    kpi('Items stored', num(D.items.length), `${num(D.counts.papers)} papers, ${num(D.counts.news)} news`);
  $('#src-checked').textContent = `Checked ${utc(D.generated)}`;
  const order = [...feeds].sort((a, b) => a.tier - b.tier || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  $('#src-rows').innerHTML = order.map(s => {
    const section = s.name !== s.outlet ? s.name.slice(s.outlet.length + 3) : '';
    const quiet = s.status === 'ok' && !s.stored;
    const status = s.status !== 'ok' ? `<span class="prp-status bad">Error</span><span class="err">${esc(s.error || 'failed')}</span>`
      : quiet ? '<span class="prp-status warn">No recent items</span>' : `<span class="prp-status good">OK</span>${s.notModified ? '<span class="err">unchanged since last check</span>' : ''}`;
    const fieldTags = s.fields.length ? `<div class="tags">${s.fields.map(f => `<span class="tag" data-f="${esc(f)}">${esc(short(f))}</span>`).join('')}</div>` : `<span class="multi">General${s.strict ? ', technology only' : ''}</span>`;
    const latest = s.latest ? `<time datetime="${esc(s.latest)}">${new Date(s.latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>` : '<span class="prp-muted">–</span>';
    const daily = s.perDay ? ` · up to ${num(s.perDay)} a day` : '';
    const inFeed = s.perDay ? `${num(s.count)} <span class="prp-muted">of ${num(s.matched ?? s.count)}</span>` : num(s.count);
    return `<tr><td class="nm"><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.outlet)}</a><small>${section ? esc(section) + ' · ' : ''}<a href="${esc(safeUrl(s.feed))}" target="_blank" rel="noopener">feed</a>${daily}</small></td>` +
      `<td class="nowrap">${esc(D.kinds[s.kind] || s.kind)}</td><td class="nowrap">${esc(s.tier)} <span class="prp-muted">· ${esc(D.tiers[s.tier] || '')}</span></td><td>${fieldTags}</td><td>${status}</td>` +
      `<td class="num">${num(s.stored)}</td><td class="num">${inFeed}</td><td>${latest}</td></tr>`;
  }).join('');
}

function renderMeta() {
  const age = (Date.now() - Date.parse(D.generated)) / 36e5;
  $('#meta').innerHTML = `<span><b>${num(D.items.length)}</b> items from <b>${num(D.counts.sources)}</b> feeds · refreshed ${esc(utc(D.generated))}</span>` +
    `<span><b>${num(D.counts.papers)}</b> papers · <b>${num(D.counts.news)}</b> news</span><span>Rolling ${esc(D.keepDays)} days</span>` +
    (age > 12 ? `<span>Data is ${Math.round(age)} hours old</span>` : '');
  $('#refreshed').textContent = `Last refreshed ${utc(D.generated)}; ${D.counts.working} of ${D.counts.feeds} feeds answered.`;
  const outlets = new Map();
  for (const s of D.sources) {
    const o = outlets.get(s.outletId) || { id: s.outletId, name: s.outlet, kind: s.kind, tier: s.tier, n: 0 };
    o.n += D.items.filter(i => i.source === s.id).length; o.tier = Math.min(o.tier, s.tier);
    if (KIND_ORDER.indexOf(s.kind) < KIND_ORDER.indexOf(o.kind)) o.kind = s.kind;
    outlets.set(s.outletId, o);
  }
  const groups = KIND_ORDER.map(k => {
    const list = [...outlets.values()].filter(o => o.kind === k).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    return list.length ? `<optgroup label="${esc(D.kinds[k] || k)}">${list.map(o => `<option value="${esc(o.id)}">${esc(o.name)} (${num(o.n)})</option>`).join('')}</optgroup>` : '';
  }).join('');
  $('#source').insertAdjacentHTML('beforeend', groups);
}

/* ---------- events ---------- */
function wire() {
  $('#chips').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setState({ f: b.dataset.v }); });
  $('#type').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setState({ type: b.dataset.v }); });
  $('#window').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setState({ w: b.dataset.v }); });
  $('#source').addEventListener('change', e => setState({ src: e.target.value }));
  $('#order').addEventListener('change', e => setState({ sort: e.target.value }));
  let t;
  $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => setState({ q: e.target.value.trim() }), 180); });
  $('#list').addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { shown += MORE; setState({}, { keepShown: true }); }
    else if (e.target.closest('[data-wider]')) setState({ w: '7d' });
    else if (e.target.closest('[data-reset]')) { $('#q').value = ''; setState({ f: 'all', type: 'both', src: '', q: '' }); }
  });
  $('#top').addEventListener('click', e => { const b = e.target.closest('[data-src]'); if (b) setState({ src: state.src === b.dataset.src ? '' : b.dataset.src }); });
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((b, k) => {
    b.addEventListener('click', () => setState({ tab: b.id === 'tab-sources' ? 'sources' : 'stories' }));
    b.addEventListener('keydown', e => {
      const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault(); const to = tabs[(next + tabs.length) % tabs.length]; to.focus(); to.click();
    });
  });
  const tip = $('#tip');
  $('#chart').addEventListener('mousemove', e => {
    const r = e.target.closest?.('[data-tip]');
    if (!r) { tip.hidden = true; return; }
    tip.innerHTML = r.getAttribute('data-tip'); tip.hidden = false; // built from escaped text in drawChart
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + 'px'; tip.style.top = Math.max(8, e.clientY - h - 10) + 'px';
  });
  $('#chart').addEventListener('mouseleave', () => { tip.hidden = true; });
  window.addEventListener('hashchange', () => { readHash(); render(); });
  window.addEventListener('prp:themechange', drawChart);
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(drawChart, 120); }).observe($('#chart'));
}

/* ---------- boot ---------- */
fetch('data/stories.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d => {
  D = d; SRC = new Map(d.sources.map(s => [s.id, s]));
  // Windows count back from now, or from the last refresh if the data is more than half a day old.
  ref = Date.now() - Date.parse(d.generated) > 12 * 36e5 ? Date.parse(d.generated) : Date.now();
  readHash(); renderMeta(); renderSources(); wire(); render();
}).catch(e => {
  $('#meta').innerHTML = `<span>The stories could not be loaded (${esc(e.message)}).</span>`;
  $('#list').innerHTML = '<p class="prp-empty">The stories could not be loaded. Try again in a moment.</p>';
});

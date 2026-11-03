// Highbrowse page: the analysis of the four briefings for the last 24 hours ("Today") and the last 7 days ("This
// week"), and one search across all four. Data: the briefings' own stores (analysis.js, BRIEFINGS), read once on load.
// State lives in the URL hash (#tab=week · #q=binance&b=political,digital&w=24h&t=digital.ai&soft=1&sort=newest), so
// the shell and other pages can link to a view or a search, and the page follows a hash the shell moves it to.
import {
  BRIEFINGS, BRIEFING, POSITIONS, POSITION_LABELS, TOPICS_KEY, WINDOW_LABELS, DEFAULTS, esc, fold, buildModel, digest, search, parseHash, toHash,
  briefingPage, itemPage, findWord, localDay,
} from './analysis.js';

const $ = s => document.querySelector(s);
const SHELL = new URL('../', location.href).href;
const SUITE = 'hb'; // the shell's module the four briefings and this page are in
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const PAGE = 50, MORE = 100, H = 36e5;
let M = null, state = parseHash(location.hash), shown = PAGE, failed = [], topicLabel = new Map();
const digests = {};

const num = n => Number(n || 0).toLocaleString('en-GB');
const plural = (n, one, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
const posLabel = p => M?.briefings[0]?.positions?.find(x => x.key === p)?.label || POSITION_LABELS[p] || p;
const utc = ms => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const when = (ms, dateOnly) => new Date(ms).toLocaleString('en-GB', dateOnly ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = ms => { const m = (Date.now() - ms) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const timeOf = i => (i.dateOnly ? when(i.at, true) : `${when(i.at)} · ${ago(i.at)}`);
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 200));

/* ---------- links ---------- */
// An article opens at its publisher, in a new tab (http and https addresses only: the stores are other sites' text).
const art = u => (/^https?:\/\//i.test(u) ? `href="${esc(u)}" target="_blank" rel="noopener"` : '');
// A briefing page: inside the shell it opens there, in the briefing's own frame (#/hb/<submodule>?at=<page>); on its own,
// the page itself.
function go(key, path) {
  const b = BRIEFING[key], abs = new URL(path, SHELL).href;
  return embedded ? { href: `${SHELL}#/${SUITE}/${b.id}?at=${encodeURIComponent(abs)}`, target: '_top' } : { href: abs, target: '_self' };
}
const goAttrs = (key, path) => { const g = go(key, path); return `href="${esc(g.href)}" target="${g.target}"`; };
const toItem = (i, label = `${BRIEFING[i.b].short} ›`) => `<a class="bp" ${goAttrs(i.b, itemPage(i))} aria-label="Open in the ${esc(BRIEFING[i.b].name)}: ${esc(i.t)}" title="Open in the ${esc(BRIEFING[i.b].name)}">${esc(label)}</a>`;
// A search on this page, as a hash link (the page follows its own hash).
const searchHref = patch => toHash({ ...DEFAULTS, b: [], ...patch, tab: 'search' }) || '#tab=search';
const quoteTerm = t => (/\s/.test(t) ? `"${t}"` : t);

/* ---------- small marks ---------- */
const bchip = k => `<span class="bchip" data-b="${k}">${esc(BRIEFING[k].short)}</span>`;
const caution = '<span class="caution" title="Mixed or low factual reliability rating" aria-label="Mixed or low factual reliability rating">⚠</span>';
const pkey = (s, w) => `<div class="pkey"><span class="prp-label">Political Briefing publishers</span>${POSITIONS.map(p => `<span class="${s.positions[p] ? '' : 'z'}" style="--c:var(--pos-${p})"><i aria-hidden="true"></i>${esc(posLabel(p))} ${num(s.positions[p])}</span>`).join('')}` +
  `<a class="bp" ${goAttrs('political', briefingPage('political', { q: s.query, w: w === '24h' ? '24h' : '7d' }))}>Compare the positions ›</a></div>`;
// One headline of a story: its outlet, the headline at its publisher, and a link into each briefing that carries it.
const entryLi = e => {
  const i = e.item;
  return `<li><span><span class="o">${esc(i.src)}</span>${i.caution ? caution : ''} <a class="h" ${art(i.u)}>${esc(i.t)}</a></span><span>${[i, ...e.also].map(x => toItem(x)).join(' ')}</span></li>`;
};
// "Political", "Political and Digital", "Political, Economics and Digital".
const andList = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(''));
// When a story ran: its first and last headline in the window.
const span = s => (s.last - s.first < H ? when(s.last) : `${when(s.first)} – ${when(s.last)}`);

/* ---------- highlighting the search words (on the folded text, which keeps the length of almost all text) ---------- */
function mark(text, words) {
  const t = String(text || '');
  const f = fold(t);
  if (!words.length || f.length !== t.length) return esc(t);
  const ranges = [];
  for (const w of words) for (let from = 0, m; (m = findWord(f, w, from)); from = m[1]) ranges.push(m);
  if (!ranges.length) return esc(t);
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', at = 0;
  for (const [s, e] of ranges) {
    if (e <= at) continue;
    const from = Math.max(s, at);
    out += esc(t.slice(at, from)) + `<mark>${esc(t.slice(from, e))}</mark>`;
    at = e;
  }
  return out + esc(t.slice(at));
}

/* ---------- the analysis ---------- */
function lede(d) {
  const period = d.w === '24h' ? 'In the last 24 hours' : 'In the last 7 days';
  const parts = BRIEFINGS.map(b => `${num(d.counts[b.key])} ${{ political: 'political', scientific: 'scientific', economics: 'economic', digital: 'digital' }[b.key]}`);
  const top = d.stories[0], names = d.topics.filter(t => t.named).slice(0, 3).map(t => esc(t.term));
  let s = `${period}, the four briefings carried <b>${plural(d.counts.all, 'story', 'stories')}</b>: ${parts.slice(0, 3).join(', ')} and ${parts[3]}.`;
  if (top) s += ` The biggest, from ${plural(top.outlets, 'outlet')} in the ${andList(top.briefings.map(k => BRIEFING[k].short))} Briefing${top.briefings.length > 1 ? 's' : ''}: <a ${art(top.lead.u)}>${esc(top.lead.t)}</a>.`;
  if (names.length) s += ` The names most outlets used: ${andList(names)}.`;
  return `<p class="lede">${s}</p>`;
}

function storyCard(s, k, w) {
  const lead = k === 0, cut = lead ? 6 : 4;
  const shown = s.entries.slice(1, cut), rest = s.entries.slice(cut, 60);
  // The lead's own line links to each briefing that carries it (an article in two briefings is listed once).
  return `<article class="story prp-panel${lead ? ' lead' : ''}" data-story="${esc(s.id)}">
    <div class="st-meta"><span class="rank">${k + 1}</span>${s.briefings.map(bchip).join('')}<span>${plural(s.outlets, 'outlet')} · ${plural(s.headlines, 'headline')}</span><span>${esc(span(s))}</span></div>
    <h3><a ${art(s.lead.u)}>${esc(s.lead.t)}</a></h3>
    <p class="st-src">${esc(s.lead.src)}${s.lead.caution ? caution : ''} · ${esc(timeOf(s.lead))} · ${[s.lead, ...s.entries[0].also].map(x => toItem(x, `In the ${BRIEFING[x.b].name} ›`)).join(' · ')}</p>
    ${s.key.length ? `<p class="st-terms" aria-label="Its main terms">${s.key.map(esc).join(' · ')}</p>` : ''}
    ${s.publishers ? pkey(s, w) : ''}
    ${shown.length ? `<ul class="st-list">${shown.map(entryLi).join('')}</ul>` : ''}
    ${rest.length ? `<details><summary>${plural(rest.length, 'more headline')}</summary><ul class="st-list">${rest.map(entryLi).join('')}</ul></details>` : ''}
  </article>`;
}

function secStories(d) {
  const body = d.stories.length ? `<div class="stories">${d.stories.map((s, k) => storyCard(s, k, d.w)).join('')}</div>`
    : '<p class="prp-note empty-note">No story was covered by two outlets or more in this window.</p>';
  return `<section class="sec" aria-labelledby="h-stories-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-stories-${d.w}"><span class="prp-section-no">1.</span>The biggest stories</h2>
    <p class="sec-note">Headlines from different outlets grouped as one story, ranked by the outlets that covered it (${plural(d.storyCount, 'story', 'stories')} had two or more). Each headline opens at its publisher; “›” opens it in its briefing.</p></div>${body}</section>`;
}

// A term's seven days as small bars (Figure 1), the window's days darker.
function spark(t, d) {
  const max = Math.max(1, ...t.days), days = M.days, inWin = d.w === '24h' ? new Set([localDay(M.ref), localDay(M.ref - 24 * H)]) : new Set(days);
  const bars = t.days.map((v, k) => { const h = v ? Math.max(1.5, (v / max) * 22) : 0; return h ? `<rect class="${inWin.has(days[k]) ? 'in' : ''}" x="${k * 12 + 1}" y="${(24 - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" rx="1"/>` : ''; }).join('');
  return `<svg class="spark" viewBox="0 0 84 26" role="img" aria-label="${esc(t.term)}, headlines a day from ${esc(dayShort(days[0]))} to ${esc(dayShort(days[6]))}: ${t.days.join(', ')}"><line x1="0" x2="84" y1="24.5" y2="24.5"/>${bars}</svg>`;
}
const dayShort = key => { const [y, m, dd] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };

function secTopics(d) {
  if (!d.topics.length) return '';
  const li = (t, k) => `<li><span class="no">${k + 1}</span><a class="nm" href="${esc(searchHref({ q: quoteTerm(t.term), w: d.w }))}" title="Search the four briefings for ${esc(t.term)}">${esc(t.term)}</a>
    <span class="mt"><span>${plural(t.outlets, 'outlet')}</span><span>${plural(t.items, 'headline')}</span>${BRIEFINGS.filter(b => t.by[b.key]).map(b => `<span class="bn" data-b="${b.key}" title="${esc(b.name)}: ${num(t.by[b.key])}">${esc(b.short)} ${num(t.by[b.key])}</span>`).join('')}</span>${spark(t, d)}</li>`;
  const table = `<details class="as-table"><summary>Show as a table</summary><div class="scroll"><table class="prp-table"><thead><tr><th scope="col">Topic</th><th scope="col" class="num">Outlets</th><th scope="col" class="num">Headlines</th>${BRIEFINGS.map(b => `<th scope="col" class="num">${esc(b.short)}</th>`).join('')}${M.days.map(k => `<th scope="col" class="num">${esc(dayShort(k))}</th>`).join('')}</tr></thead><tbody>` +
    d.topics.map(t => `<tr><td>${esc(t.term)}</td><td class="num">${num(t.outlets)}</td><td class="num">${num(t.items)}</td>${BRIEFINGS.map(b => `<td class="num">${num(t.by[b.key])}</td>`).join('')}${t.days.map(v => `<td class="num">${num(v)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div></details>';
  return `<section class="sec" aria-labelledby="h-topics-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-topics-${d.w}"><span class="prp-section-no">2.</span>The biggest topics</h2>
    <p class="sec-note">The names and terms the most outlets used in their headlines; a name opens a search of all four briefings.</p></div>
    <div class="prp-panel prp-panel-body"><figure class="prp-figure"><ol class="topics">${d.topics.map(li).join('')}</ol>
    <figcaption><b>Figure 1.</b> The biggest topics ${d.w === '24h' ? 'of the last 24 hours' : 'of the last 7 days'}, with each briefing's headlines and, in the bars, headlines a day over the last seven days (${esc(dayShort(M.days[0]))} to ${esc(dayShort(M.days[6]))}; the window's days darker). Source: the four briefings' stores.</figcaption></figure>${table}</div></section>`;
}

function briefPanel(c, d) {
  const b = BRIEFING[c.key];
  const head = `<div class="prp-panel-head"><h3 class="prp-h3" id="bh-${c.key}-${d.w}"><span class="dot" aria-hidden="true"></span>${esc(b.name)}</h3><a class="open" ${goAttrs(b.key, briefingPage(b.key, { w: d.w === '24h' ? '24h' : '7d' }))}>Open the ${esc(b.short)} Briefing ›</a></div>`;
  if (c.missing) return `<section class="prp-panel brief" data-b="${c.key}" aria-labelledby="bh-${c.key}-${d.w}">${head}<div class="prp-panel-body"><p class="prp-note warn">Its stories could not be loaded just now.</p></div></section>`;
  const age = c.generated ? (Date.now() - Date.parse(c.generated)) / H : 0, stale = age > (c.key === 'political' ? 27 : 15);
  const extra = c.key === 'political' ? (d.counts.soft ? ` <span class="prp-muted">· ${num(d.counts.soft)} on sport, entertainment and lifestyle left out</span>` : '') : ` <span class="prp-muted">· ${num(c.papers)} papers, ${num(c.news)} news</span>`;
  const facets = c.facets.filter(f => f.count).slice(0, c.key === 'political' ? 6 : 8), max = Math.max(1, ...facets.map(f => f.count));
  const link = f => (b.hashTopic ? goAttrs(b.key, briefingPage(b.key, { topic: f.id, w: d.w === '24h' ? '24h' : '7d' })) : `href="${esc(searchHref({ t: `${b.key}.${f.id}`, w: d.w }))}"`);
  const bars = facets.length ? `<figure class="prp-figure"><div class="bars">${facets.map(f => `<a class="bar" ${link(f)}><span class="lbl">${esc(f.short || f.label)}</span><span class="track" aria-hidden="true"><i style="width:${(f.count / max * 100).toFixed(1)}%"></i></span><span class="n">${num(f.count)}</span></a>`).join('')}</div>
    <figcaption>${c.key === 'political' ? `Stories by the Political Briefing's topics (keyword matches; ${num(c.untagged)} match none, and a story can match several).` : `Stories by the ${esc(b.short)} Briefing's ${b.hashTopic === 'd' ? 'disciplines' : 'fields'} (an item can be in several).`}</figcaption></figure>` : '';
  const terms = c.terms.length ? `<div class="b-row"><span class="prp-label">Most-used names and terms</span><div class="tchips">${c.terms.map(t => `<a class="prp-chip" href="${esc(searchHref({ q: quoteTerm(t.term), b: [b.key], w: d.w }))}">${esc(t.term)} <span class="prp-muted">${num(t.by[b.key])}</span></a>`).join('')}</div></div>` : '';
  const st = c.story ? `<div class="b-row"><span class="prp-label">Its biggest story</span><p class="b-story"><a ${art(c.story.here.u)}>${esc(c.story.here.t)}</a><small>${esc(c.story.here.src)} · ${plural(c.story.mineOutlets, 'outlet')} in this briefing${c.story.outlets > c.story.mineOutlets ? `, ${num(c.story.outlets)} in all` : ''} · ${toItem(c.story.here, `In the ${b.name} ›`)}</small></p></div>` : '';
  const note = !c.count ? `<p class="prp-note warn">No stories in ${d.w === '24h' ? 'the last 24 hours' : 'the last 7 days'}${stale ? `: it was last refreshed ${esc(utc(Date.parse(c.generated)))}` : ''}.</p>`
    : stale ? `<p class="prp-note warn">Last refreshed ${esc(utc(Date.parse(c.generated)))}, ${Math.round(age)} hours ago: its newest stories may be missing.</p>` : '';
  return `<section class="prp-panel brief" data-b="${c.key}" aria-labelledby="bh-${c.key}-${d.w}">${head}<div class="prp-panel-body">
    <p class="b-count"><b>${num(c.count)}</b>${c.count === 1 ? 'story' : 'stories'}${extra}</p>${note}${bars}${terms}${st}</div></section>`;
}
function secBriefings(d) {
  return `<section class="sec" aria-labelledby="h-briefs-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-briefs-${d.w}"><span class="prp-section-no">3.</span>What each briefing covers most</h2>
    <p class="sec-note">Each briefing's stories by its own topics, the names and terms it used most, and the story the most of its outlets covered.</p></div>
    <div class="briefs">${d.coverage.map(c => briefPanel(c, d)).join('')}</div></section>`;
}

function secShared(d) {
  const sh = d.shared;
  // A story in several briefings: one headline from each, a different article for each where the briefings have
  // different ones (an article both carry stands for both only when there is nothing else).
  const story = s => {
    const used = new Set(), copy = (e, k) => [e.item, ...e.also].find(i => i.b === k);
    const pick = k => {
      const e = s.entries.find(x => x.item.b === k && !used.has(x)) || s.entries.find(x => copy(x, k) && !used.has(x)) || s.entries.find(x => copy(x, k));
      if (e) used.add(e);
      return e && copy(e, k);
    };
    return `<div class="sh-story"><div class="st-meta">${s.briefings.map(bchip).join('')}<span>${plural(s.outlets, 'outlet')} · ${plural(s.headlines, 'headline')}</span></div>
      <h4><a ${art(s.lead.u)}>${esc(s.lead.t)}</a></h4><ul>${s.briefings.map(k => { const i = pick(k); return i ? `<li>${bchip(k)} ${esc(i.src)}: <a ${art(i.u)}>${esc(clip(i.t, 110))}</a> ${toItem(i)}</li>` : ''; }).join('')}</ul></div>`;
  };
  const left = `<div class="prp-panel"><div class="prp-panel-head"><b>Stories in more than one briefing</b><span class="prp-label">${plural(sh.storyCount, 'story', 'stories')}</span></div><div class="prp-panel-body">${sh.stories.length ? sh.stories.map(story).join('') : '<p class="prp-empty">No story was in two briefings in this window.</p>'}</div></div>`;
  const maxShare = Object.fromEntries(BRIEFINGS.map(b => [b.key, Math.max(1e-9, ...sh.terms.map(t => (d.counts[b.key] ? t.by[b.key] / d.counts[b.key] : 0)))]));
  const cell = (t, b) => { const n = t.by[b.key]; if (!n) return '<td class="num zero">–</td>'; const w = Math.max(4, Math.round(((n / d.counts[b.key]) / maxShare[b.key]) * 36)); return `<td class="num" data-b="${b.key}"><span class="cnt"><i style="width:${w}px" aria-hidden="true"></i>${num(n)}</span></td>`; };
  const right = `<div class="prp-panel"><div class="prp-panel-head"><b>Names and terms in several briefings</b></div><div class="scroll"><figure class="prp-figure"><table class="prp-table"><thead><tr><th scope="col">Name or term</th>${BRIEFINGS.map(b => `<th scope="col" class="num">${esc(b.short)}</th>`).join('')}</tr></thead><tbody>` +
    (sh.terms.length ? sh.terms.map(t => `<tr><td><a class="term" href="${esc(searchHref({ q: quoteTerm(t.term), w: d.w }))}">${esc(t.term)}</a></td>${BRIEFINGS.map(b => cell(t, b)).join('')}</tr>`).join('') : `<tr><td colspan="5" class="prp-muted">No name or term was used twice in two briefings.</td></tr>`) +
    `</tbody></table><figcaption class="prp-panel-body"><b>Figure 2.</b> Headlines that use each name or term, in each briefing (twice or more in two briefings at least); the bars compare its share of each briefing's stories with the others in this table.</figcaption></figure></div></div>`;
  return `<section class="sec" aria-labelledby="h-shared-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-shared-${d.w}"><span class="prp-section-no">4.</span>Shared across briefings</h2>
    <p class="sec-note">The stories and the names that more than one briefing carries.</p></div><div class="shared">${left}${right}</div></section>`;
}

function secPositions(d) {
  const sp = d.spread;
  if (!sp.total) return `<section class="sec" aria-labelledby="h-pos-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-pos-${d.w}"><span class="prp-section-no">5.</span>The Political Briefing across positions</h2></div><p class="prp-note empty-note">The Political Briefing has no stories in this window.</p></section>`;
  const total = sp.total || 1, pct = n => Math.round(n / total * 100);
  const meter = `<div class="meter" role="img" aria-label="${esc('Political Briefing stories by position: ' + sp.positions.map(p => `${p.label} ${pct(p.items)}%`).join(', '))}">${sp.positions.filter(p => p.items).map(p => `<span style="width:${(p.items / total * 100).toFixed(2)}%;--c:var(--pos-${p.key})" title="${esc(p.label)}: ${num(p.items)}"></span>`).join('')}</div>`;
  const key = `<div class="meterkey">${sp.positions.map(p => `<span><i style="--c:var(--pos-${p.key})" aria-hidden="true"></i>${esc(p.label)} <b>${num(p.items)}</b> (${pct(p.items)}%) · ${plural(p.publishers, 'publisher')}</span>`).join('')}</div>`;
  const side = (list, none) => (list.length ? `<ol>${list.map(s => `<li><a ${art(s.lead.u)}>${esc(s.lead.t)}</a><small>${POSITIONS.map(p => `${posLabel(p)} ${s.positions[p]}`).join(' · ')} · <a class="bp" ${goAttrs('political', briefingPage('political', { q: s.query, w: d.w === '24h' ? '24h' : '7d' }))}>Compare ›</a></small></li>`).join('')}</ol>` : `<p class="prp-muted">${none}</p>`);
  const leftCol = `<div class="prp-panel prp-panel-body"><figure class="prp-figure">${meter}${key}<figcaption><b>Figure 3.</b> The Political Briefing's ${num(sp.total)} hard-news stories by position, with the publishers each position had in the window (${num(sp.perPosition)} are active in each at a time; a reserve that stepped in counts too). Positions describe editorial slant, not accuracy.</figcaption></figure>
    <div class="sided"><div><h4>Covered more from the left</h4>${side(sp.left, 'No story four publishers or more covered was covered mostly from the left.')}</div><div><h4>Covered more from the right</h4>${side(sp.right, 'No story four publishers or more covered was covered mostly from the right.')}</div></div></div>`;
  const max = Math.max(1, ...sp.stories.flatMap(s => POSITIONS.map(p => s.positions[p])));
  const rows = sp.stories.map(s => `<tr><td class="st"><a ${art(s.lead.u)}>${esc(s.lead.t)}</a><small>${plural(s.publishers, 'publisher')} · <a class="bp" ${goAttrs('political', briefingPage('political', { q: s.query, w: d.w === '24h' ? '24h' : '7d' }))}>Compare the positions ›</a></small></td>` +
    POSITIONS.map(p => `<td class="pc${s.positions[p] ? '' : ' z'}" style="--c:var(--pos-${p});--v:${(s.positions[p] / max).toFixed(2)}">${num(s.positions[p])}</td>`).join('') + '</tr>').join('');
  const rightCol = `<div class="prp-panel"><div class="prp-panel-head"><b>The biggest political stories, publisher by publisher</b></div><div class="scroll"><table class="prp-table ptable"><thead><tr><th scope="col">Story</th>${POSITIONS.map(p => `<th scope="col" class="pc"><i style="--c:var(--pos-${p})" aria-hidden="true"></i>${esc(posLabel(p))}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="prp-muted">No political story had three publishers or more.</td></tr>`}</tbody></table></div>
    <p class="prp-panel-body prp-caption"><b>Table 1.</b> How many of each position's publishers ran each of the biggest political stories (three publishers or more); the deeper the shade, the more.</p></div>`;
  return `<section class="sec" aria-labelledby="h-pos-${d.w}"><div class="sec-head"><h2 class="prp-h2" id="h-pos-${d.w}"><span class="prp-section-no">5.</span>The Political Briefing across positions</h2>
    <p class="sec-note">Fifty publishers, ten for each position from far left to far right: how much each position ran, and which stories each side covered.</p></div><div class="positions">${leftCol}${rightCol}</div></section>`;
}

function renderAnalysis(w) {
  const panel = $(w === '7d' ? '#panel-week' : '#panel-today');
  if (panel.dataset.ready === '1') return;
  const d = digests[w] || (digests[w] = digest(M, w));
  panel.innerHTML = lede(d) + secStories(d) + secTopics(d) + secBriefings(d) + secShared(d) + secPositions(d);
  panel.dataset.ready = '1';
}

/* ---------- the search ---------- */
function renderControls(r) {
  if (document.activeElement !== $('#q')) $('#q').value = state.q;
  $('#soft').checked = state.soft;
  $('#sort').value = state.sort === 'newest' ? 'newest' : '';
  // When: the three windows, then each of the seven days.
  const days = [...M.days].reverse();
  const wOpts = Object.entries(WINDOW_LABELS).reverse().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('') +
    `<optgroup label="One day">${days.map(k => `<option value="${k}">${esc(dayShort(k))}</option>`).join('')}</optgroup>`;
  if ($('#w').dataset.built !== days.join()) { $('#w').innerHTML = wOpts; $('#w').dataset.built = days.join(); }
  $('#w').value = state.w;
  if ($('#w').value !== state.w) $('#w').value = '7d';
  // Topic: each briefing's own topics, with how many of the search's stories each holds.
  if (document.activeElement !== $('#t')) {
    $('#t').innerHTML = '<option value="">All topics</option>' + M.briefings.filter(x => x.topics.length).map(x => `<optgroup label="${esc(BRIEFING[x.key].name)}">${x.topics.map(t => {
      const v = `${x.key}.${t.id}`, n = r.byTopic[v] || 0;
      return `<option value="${esc(v)}">${esc(t.label)} (${num(n)})</option>`;
    }).join('')}</optgroup>`).join('');
  }
  $('#t').value = topicLabel.has(state.t) ? state.t : '';
  // Briefings: all, or the ones picked, each with its count for the search. The chip that had focus keeps it.
  const all = !state.b.length, had = document.activeElement?.closest?.('#b button')?.dataset.pick ?? (document.activeElement?.matches?.('#b [data-b-all]') ? '*' : null);
  $('#b').innerHTML = `<button type="button" class="prp-chip${all ? ' on' : ''}" data-b-all aria-pressed="${all}">All four <span class="n">${num(r.all)}</span></button>` +
    BRIEFINGS.map(b => { const on = state.b.includes(b.key); return `<button type="button" class="prp-chip${on ? ' on' : ''}" data-b="${b.key}" data-pick="${b.key}" aria-pressed="${on}"><span class="dot" aria-hidden="true"></span>${esc(b.short)}<span class="n">${num(r.byBriefing[b.key])}</span></button>`; }).join('');
  if (had) $(had === '*' ? '#b [data-b-all]' : `#b [data-pick="${had}"]`)?.focus();
}

function resultLi(r, words) {
  const i = r.item;
  const chips = [i.b, ...r.also.map(a => a.b)].map(bchip).join('');
  const pos = i.pos ? `<span class="ptag" style="--c:var(--pos-${i.pos})"><i aria-hidden="true"></i>${esc(posLabel(i.pos))}</span>` : '';
  const badge = i.type ? `<span class="badge">${i.type === 'paper' ? 'Paper' : 'News'}</span>` : '';
  const tags = i.tp.map(id => topicLabel.get(`${i.b}.${id}`)).filter(Boolean).map(l => `<span class="tag">${esc(l)}</span>`).join('');
  const links = [i, ...r.also].map(x => toItem(x, `In the ${BRIEFING[x.b].name} ›`)).join('');
  return `<li class="res" data-b="${i.b}"><div class="r1">${chips}<span class="src">${esc(i.src)}</span>${i.caution ? caution : ''}${pos}<time datetime="${esc(new Date(i.at).toISOString())}">${esc(timeOf(i))}</time>${badge}</div>
    <h3 class="r-title"><a ${art(i.u)}>${mark(i.t, words)}</a></h3>${i.d ? `<p class="r-sum">${mark(clip(i.d, 320), words)}</p>` : ''}<div class="r3">${tags}${links}</div></li>`;
}

function renderSearch() {
  const r = search(M, state);
  renderControls(r);
  const what = state.q ? `“${state.q}”` : 'All stories';
  const win = WINDOW_LABELS[state.w] ? WINDOW_LABELS[state.w].toLowerCase() : dayShort(state.w);
  const topic = topicLabel.get(state.t);
  $('#r-title').textContent = `${what} · ${win}${topic ? ` · ${topic}` : ''}`;
  const per = BRIEFINGS.map(b => [b, r.results.filter(x => x.item.b === b.key).length]).filter(([, n]) => n);
  $('#r-status').textContent = `${plural(r.total, 'story', 'stories')}${per.length > 1 ? ' · ' + per.map(([b, n]) => `${b.short} ${num(n)}`).join(' · ') : ''}${r.order === 'best' ? ' · best match first' : ' · newest first'}`;
  if (!r.total) {
    const wider = state.w !== '7d' ? '<button type="button" class="prp-btn sm" data-wider>Search the last 7 days</button>' : '';
    $('#results').innerHTML = `<li class="prp-empty">Nothing matches.${state.b.length || state.t ? ' Try all four briefings and every topic.' : ' Try fewer words.'}<div class="empty-actions">${wider}<button type="button" class="prp-btn sm" data-clear>Clear the search</button></div></li>`;
    $('#r-more').hidden = true;
    return;
  }
  $('#results').innerHTML = r.results.slice(0, shown).map(x => resultLi(x, r.words)).join('');
  const left = r.total - shown;
  $('#r-more').hidden = left <= 0;
  if (left > 0) $('#r-more').innerHTML = `<button type="button" class="prp-btn" data-more>Show ${num(Math.min(MORE, left))} more <span class="prp-muted">(${num(left)} left)</span></button>`;
}

/* ---------- state ---------- */
function render() {
  for (const tab of ['today', 'week', 'search']) {
    const on = state.tab === tab, b = $(`#tab-${tab}`);
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $(`#panel-${tab}`).hidden = !on;
  }
  document.querySelectorAll('[data-search-only]').forEach(el => { el.hidden = state.tab !== 'search'; });
  if (!M) return;
  if (state.tab === 'search') renderSearch(); else { if (document.activeElement !== $('#q')) $('#q').value = state.q; renderAnalysis(state.tab === 'week' ? '7d' : '24h'); }
}
function setState(patch) {
  const before = toHash(state);
  state = { ...state, ...patch };
  if (!topicLabel.has(state.t)) state.t = '';
  const h = toHash(state);
  if (h !== before) shown = PAGE;
  if (h !== location.hash) history.replaceState(history.state, '', h || location.pathname + location.search);
  render();
}

function renderMeta() {
  const edition = new Date(M.ref).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#edition').textContent = edition;
  const fresh = M.briefings.filter(b => b.generated).map(b => `${BRIEFING[b.key].short} ${utc(Date.parse(b.generated))}`);
  const stale = M.briefings.filter(b => b.generated && (Date.now() - Date.parse(b.generated)) / H > (b.key === 'political' ? 27 : 15));
  // The week's hard news, as the This week tab counts it (the stores also hold the sport, entertainment and lifestyle
  // the analysis leaves out, and stories a little over seven days old, kept since their own refresh).
  $('#meta').innerHTML = `<span><b>${num(M.week.length)}</b> stories in the four briefings' last 7 days</span><span>Refreshed ${esc(fresh.join(', '))}</span>` +
    (M.ref < M.now - 60e3 ? `<span class="stale">Windows count back from the newest refresh, ${esc(utc(M.ref))}</span>` : '') +
    stale.map(b => `<span class="stale">The ${esc(BRIEFING[b.key].name)} is ${Math.round((Date.now() - Date.parse(b.generated)) / H)} hours old</span>`).join('') +
    failed.map(b => `<span class="stale">The ${esc(b.name)} could not be loaded</span>`).join('');
  $('#refreshed').textContent = `Read ${utc(M.now)}; ${M.briefings.filter(b => b.generated).map(b => `the ${BRIEFING[b.key].name} was refreshed ${utc(Date.parse(b.generated))}`).join(', ')}.`;
}

function wire() {
  let typing;
  $('#q').addEventListener('input', e => { clearTimeout(typing); typing = setTimeout(() => setState({ q: e.target.value.trim(), tab: 'search' }), 160); });
  $('#find').addEventListener('submit', e => { e.preventDefault(); clearTimeout(typing); setState({ q: $('#q').value.trim(), tab: 'search' }); });
  $('#w').addEventListener('change', e => setState({ w: e.target.value }));
  $('#t').addEventListener('change', e => setState({ t: e.target.value }));
  $('#sort').addEventListener('change', e => setState({ sort: e.target.value }));
  $('#soft').addEventListener('change', e => setState({ soft: e.target.checked }));
  $('#b').addEventListener('click', e => {
    const all = e.target.closest('[data-b-all]'), pick = e.target.closest('[data-pick]');
    if (all) setState({ b: [] });
    else if (pick) { const k = pick.dataset.pick, b = state.b.includes(k) ? state.b.filter(x => x !== k) : [...state.b, k]; setState({ b: BRIEFINGS.map(x => x.key).filter(x => b.includes(x)) }); }
  });
  $('#panel-search').addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { shown += MORE; renderSearch(); ($('#r-more [data-more]') || $('#results .res:last-child a'))?.focus(); }
    else if (e.target.closest('[data-wider]')) setState({ w: '7d' });
    else if (e.target.closest('[data-clear]')) { $('#q').value = ''; setState({ ...DEFAULTS, b: [], tab: 'search' }); }
  });
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((b, k) => {
    b.addEventListener('click', () => setState({ tab: b.id.slice(4) }));
    b.addEventListener('keydown', e => {
      const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault(); const to = tabs[(next + tabs.length) % tabs.length]; to.focus(); to.click();
    });
  });
  window.addEventListener('hashchange', () => { state = parseHash(location.hash); if (!topicLabel.has(state.t)) state.t = ''; shown = PAGE; render(); });
}

/* ---------- boot ---------- */
async function boot() {
  render();
  const stores = await Promise.all(BRIEFINGS.map(b => fetch(new URL(b.data, SHELL), { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(() => { failed.push(b); return null; })));
  if (stores.every(s => !s)) {
    $('#meta').innerHTML = '<span>The four briefings could not be loaded. Try again in a moment.</span>';
    $('#panel-today').innerHTML = '<p class="prp-empty">The briefings could not be loaded.</p>';
    return;
  }
  $('#meta').innerHTML = '<span>Reading the four briefings…</span>';
  await new Promise(r => setTimeout(r, 0)); // let the status paint before the analysis runs
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TOPICS_KEY) || 'null'); } catch { /* storage blocked or not JSON: the defaults */ }
  M = buildModel(stores, { savedTopics: saved });
  topicLabel = new Map(M.briefings.flatMap(x => x.topics.map(t => [`${x.key}.${t.id}`, t.short || t.label])));
  if (!topicLabel.has(state.t)) state.t = '';
  renderMeta(); wire(); render();
  document.documentElement.dataset.ready = '1'; // for the tests: the analysis is on the page
  // The other window, while the browser is idle, so switching tabs is instant.
  idle(() => { for (const w of ['24h', '7d']) digests[w] ||= digest(M, w); });
}
boot();

/* Bibliotheca · Neo Classic (Kino): public-domain classics read on screen, every term the Encyclopaedia knows
   highlighted, a popout bar of the terms on screen, and a companion pane beside the text.

   Data, built by bibliotheca/scripts/build-book.mjs (its header holds the contract):
     ../data/index.json            the shelf: { generated, books: [{ slug, title, author, translator, year, era, words, … }] }
     ../data/books/<slug>.json     one book: { …, chapters: [{ n, heading, title, words, paragraphs: [{ id, kind, text,
                                   terms: [{ s, e, qid, label }] }] }] }, s/e being string offsets into text
   Address (lib/hash.js): #book=<slug>&ch=<n>&p=<paragraph id>&t=<QID>&pane=<ency|vm>&show=<screen>&era=term (show:
   the screen shown in the pane, with pane=vm; era=term: the term's own era chosen there). The page writes it with
   history.replaceState as the reader moves, so the shell's Back and Forward stay the shell's own, and re-reads it on
   hashchange (the shell moves a frame by changing only its hash; people edit links).

   One chapter is on the page at a time. An IntersectionObserver over its paragraphs (the document as root, less the
   sticky head and the terms strip above and the pane's sheet below on narrow screens) keeps the set on screen: the
   popout bar lists the distinct terms whose links are in view within them, and the paragraph under the reading line
   (30% down the free height) is the current one, outlined, put in the address and counted in the head's position and
   progress bar. A jump (a link, J/K, the contents) pins its paragraph until the reader scrolls by hand, so a short
   paragraph scrolled to the top is the one shown, and it stays put while the layout settles.

   The terms bar is a list in the margin beside the column from 1150 px with the pane shut, covering nothing, and a
   strip under the head over the text otherwise. The strip's depth below the head (stripH) is part of the reading
   region everywhere the page asks what is in view (region(), the observer's root margin, --nc-bar in the paragraphs'
   scroll margin), so a jump lands below it, the bar leaves out the terms it covers, and a term clicked under it is
   scrolled clear; opening or collapsing it still moves nothing. Until the reader opens or collapses the bar it is open
   only where it is the margin list.

   A term is "used" by clicking it, in the text or in the bar: all its occurrences are ringed and the pane opens on its
   Encyclopaedia entry. The pane holds two same-origin frames moved the way the shell moves its own (lib/frame.js): the
   Encyclopaedia page for the entry (encyclopedia/index.html#<QID>; nothing on this site sends X-Frame-Options, and if
   the page cannot be shown a link replaces it), and "In Vitruvian Manager": the screens that take a year or period in
   their address, for the book's period or the term's own dates (lib/era.js), plus the places the Encyclopaedia records
   for the term. Each can be shown in the pane or opened in the shell: inside the shell through its 'prp:navigate'
   message (as Kino's follow-along does), on its own in a new tab. The frames get the page's theme (prp:theme) as the
   shell gives it to its own frames. A framed page believes it is in the shell (window.self !== window.top) and opens
   its cross-links at the top (target="_top"): inside the shell that is the shell, but on its own the top is this page,
   so there such a link opens in a new tab instead of replacing the book (keepTop). Above 1100 px the page splits
   (book | pane); below, the pane is a sheet docked under the text. */
import { readHash, writeHash } from './lib/hash.js';
import { esc, paragraphHtml, distinctTerms, termCount, chapterLabel, validTerms } from './lib/text.js';
import { eraRows, eraFromFacts, bookEra, fmtEra, kardashevStep, kardashevPolity, KARDASHEV_STEPS } from './lib/era.js';
import { frameMove, samePage } from './lib/frame.js';
import { shellHash, shellUrl } from '../../kino/lib/links.js';

const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const PRODUCT = 'Vitruvian Manager';
const SHORT = 'VM'; // the end of a page title, "<Submodule> · VM" (design/PRP-STYLE.md); visible text says PRODUCT
const connector = document.querySelector('script[src*="prp-bar.js"]');
const SHELL = new URL(connector?.dataset.shell || '../../', location.href).href; // the site root, where the shell lives
const DATA = new URL('../data/', import.meta.url).href;
const LAKE = new URL('lake/data/', SHELL).href;
const LIVE = 'https://jdpi.pages.dev/';
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL_ROUTE = /^#\/[a-z-]+(\/[\w-]+){0,2}(\?at=[^#\s]*)?$/; // the only routes shell.js accepts from a page
// styles.css: with the pane shut the bar is a list in the margin. 1150 px leaves (1150 − 48 − 606) / 2 = 248 px beside
// the 66ch column for the 14rem list and its 20 px gap, so the shell's frame at a 1440 px window (1168 px) has it too.
const MARGIN_BAR = matchMedia('(min-width: 1150px)');
const SPLIT = matchMedia('(min-width: 1101px)');                    // styles.css: book | pane side by side
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = n => Number(n || 0).toLocaleString('en-GB');
const plainClick = e => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

// Per-viewer conveniences only (whether the terms bar is shown, and open once the reader has chosen); everything else
// is in the address.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or blocked storage */ } },
};

const S = {
  shelf: [], generated: null, row: null, book: null, chapters: [], ci: -1, labels: new Map(),
  visible: new Set(), current: null, pin: null, p: null, chipsKey: '',
  term: null, pane: null, eraOf: 'book', vmShown: null, pendingShow: null, vmSeq: 0, bookSeq: 0,
  // popout: the reader's own choice, open or collapsed (null until made: popoutOpen below gives the default).
  bar: store.get('prp.bibliotheca.bar', true), popout: store.get('prp.bibliotheca.popout', null),
  entities: new Map(), observer: null, headH: 56,
};
const chapter = () => S.chapters[S.ci] || null;

/* ---------- addresses ---------- */
// Links recorded for the live site (the lake's mentions) point at this copy when it is served elsewhere, as the
// Encyclopaedia does.
const here = url => (SHELL !== LIVE && String(url).startsWith(LIVE) ? SHELL + url.slice(LIVE.length) : url);
const pageUrl = at => new URL(here(at), SHELL).href;
const entryUrl = qid => pageUrl(`encyclopedia/index.html#${qid}`);
/** A place in Vitruvian Manager as a link: the shell's route to it (inside the shell it moves the shell; on its own
    it opens the shell in a new tab). */
function placeLink(suite, module, at) {
  const link = { suite, module, at: pageUrl(at) };
  return { href: shellUrl(link, SHELL), hash: shellHash(link, SHELL), page: link.at, target: embedded ? '_top' : '_blank' };
}
// A term's own link (what Ctrl+click or the middle button opens): its entry, through the shell when embedded.
const termHref = qid => (embedded ? placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${qid}`).href : entryUrl(qid));
const linkAttrs = l => `href="${esc(l.href)}" target="${l.target}" rel="noopener" data-shell-hash="${esc(l.hash)}"`;
const hashFor = (n, extra = {}) => writeHash({ book: S.book?.slug, ch: n, ...extra });

/** Move the shell to a route, as kino.js does: the shell's listener first; if the shell has not moved in 350 ms (an
    older shell), set its address directly. */
function shellGo(hash) {
  let before = null; try { before = window.top.location.hash; } catch { /* the shell is on another origin */ }
  window.parent.postMessage({ type: 'prp:navigate', hash }, location.origin);
  setTimeout(() => { try { if (before !== null && window.top.location.hash === before) window.top.location.hash = hash; } catch { /* only the listener can */ } }, 350);
}

/* ---------- loading ---------- */
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url, location.href).pathname}`);
  return r.json();
}
const once = f => { let p = null; return () => (p ||= f().catch(e => { p = null; throw e; })); };
const loadRegistry = once(() => getJson(new URL('registry.json', SHELL)));
const loadWars = once(() => getJson(new URL('battlefield/focus/data/index.json', SHELL)).then(d => d.wars || []));
const loadEnergy = once(() => getJson(new URL('kardashev/data/energy.json', SHELL)));
// An Encyclopaedia entity from the lake's shards (lake/data/e/<qid mod 512>.json, as encyclopedia/index.html reads them).
function entity(qid) {
  if (!S.entities.has(qid)) S.entities.set(qid, getJson(`${LAKE}e/${+qid.slice(1) % 512}.json`).then(s => s[qid] || null).catch(() => null));
  return S.entities.get(qid);
}
function moduleInfo(reg, id) {
  for (const s of reg?.suites || []) { const m = s.modules.find(x => x.id === id || x.aliases?.includes(id)); if (m) return { suite: s.id, name: m.name, url: m.url }; }
  return null;
}

async function loadBook(slug) {
  const seq = ++S.bookSeq;
  $('#text').innerHTML = '<p class="prp-empty">Loading the book…</p>';
  let book;
  try { book = await getJson(`${DATA}books/${encodeURIComponent(slug)}.json`); } catch (e) {
    if (seq === S.bookSeq) $('#text').innerHTML = `<p class="prp-empty">This book could not load: ${esc(e.message)}</p>`;
    return false;
  }
  if (seq !== S.bookSeq) return false;
  S.book = book; S.row = S.shelf.find(b => b.slug === slug) || null; S.chapters = book.chapters || []; S.ci = -1;
  S.labels = new Map(book.author?.qid ? [[book.author.qid, book.author.name]] : []);
  for (const c of S.chapters) for (const p of c.paragraphs) for (const t of validTerms(p)) if (!S.labels.has(t.qid)) S.labels.set(t.qid, t.label);
  $('#shelf').value = slug;
  renderBookFront(); renderToc(); renderSources();
  return true;
}

/* ---------- the page and the book's front matter ---------- */
function renderMeta() {
  const n = S.shelf.length, words = S.shelf.reduce((a, b) => a + (b.words || 0), 0);
  const day = S.generated ? new Date(S.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  $('#meta').innerHTML = [`<span><b>${n}</b> book${n === 1 ? '' : 's'} on the shelf</span>`, `<span><b>${fmt(words)}</b> words</span>`,
    '<span>Rights <b>public domain in the US and the UK</b></span>', '<span>Terms <b>the Encyclopaedia</b></span>', day ? `<span>Built <b>${esc(day)}</b></span>` : ''].join('');
}
function renderShelf() {
  $('#shelf').innerHTML = S.shelf.map(b => `<option value="${esc(b.slug)}">${esc(b.title)} · ${esc(b.author || '')}${b.year ? ` (${esc(b.year)})` : ''}</option>`).join('');
}
const pd = v => /^(pd|public domain)$/i.test(String(v || ''));
function renderBookFront() {
  const b = S.book, a = b.author || {}, t = b.translator;
  document.title = `${b.title} · Neo Classic · Bibliotheca · ${SHORT}`;
  $('#book-title').textContent = b.title;
  const who = a.qid ? `<a class="term" data-qid="${esc(a.qid)}" data-jdpi-ency="${esc(a.qid)}" href="${esc(termHref(a.qid))}" title="${esc(a.name)} · Encyclopaedia">${esc(a.name)}</a>` : esc(a.name || '');
  const life = a.born && a.died ? ` (${esc(a.born)}–${esc(a.died)})` : '';
  $('#byline').innerHTML = `${who}${life}${t ? `, translated by ${esc(t.name)}${b.edition?.published ? ` (${esc(b.edition.published)})` : ''}` : ''}`;
  const all = S.chapters.flatMap(c => c.paragraphs), terms = termCount(all), numbered = S.chapters.filter(c => c.n > 0).length;
  const words = S.chapters.reduce((x, c) => x + (c.words || 0), 0);
  $('#book-meta').innerHTML = [`<span><b>${numbered}</b> chapters${S.chapters.length > numbered ? ` and ${S.chapters.length - numbered === 1 ? 'a dedication' : 'front matter'}` : ''}</span>`,
    `<span><b>${fmt(words)}</b> words</span>`, `<span><b>${fmt(terms.n)}</b> terms · <b>${terms.distinct}</b> entries</span>`,
    b.work?.written ? `<span>Written <b>${esc(b.work.written)}</b>${b.work.published ? `, printed <b>${esc(b.work.published)}</b>` : ''}</span>` : '',
    pd(b.rights?.us) && pd(b.rights?.uk) ? '<span>Public domain <b>US · UK</b></span>' : ''].join('');
}
function renderToc() {
  $('#toc-list').innerHTML = S.chapters.map((c, i) => {
    const l = chapterLabel(c);
    return `<li><a href="${esc(hashFor(c.n))}" data-ci="${i}"><span class="no">${esc(l.no)}</span><span>${esc(l.title)}</span><span class="w">${fmt(c.words)} words</span></a></li>`;
  }).join('');
}
function renderSources() {
  const b = S.book, e = b.edition || {}, r = b.rights || {}, a = b.author || {}, t = b.translator;
  const checked = r.checked ? new Date(r.checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const terms = termCount(S.chapters.flatMap(c => c.paragraphs));
  $('#sources').innerHTML = `
    <p><b>Text.</b> ${esc(b.title)} by ${esc(a.name || '')}${t ? `, translated by ${esc(t.name)}` : ''}${e.published ? ` (${esc(e.published)})` : ''}: ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.source || 'source')}${e.id ? ` ${esc(e.id)}` : ''}</a>` : esc(e.source || '')}. ${esc(e.licence || '')}</p>
    <p><b>Rights.</b> ${pd(r.us) ? 'Public domain in the United States' : `United States: ${esc(r.us)}`}; ${pd(r.uk) ? 'public domain in the United Kingdom' : `United Kingdom: ${esc(r.uk)}`}. ${esc(r.basis || '')}${checked ? ` Checked ${esc(checked)}.` : ''}</p>
    <p><b>Terms.</b> Every highlighted term is an entry of the Encyclopaedia, matched at build time to its Wikidata labels and aliases (bibliotheca/scripts/tag-terms.mjs, with this book's own decisions): ${fmt(terms.n)} in this book, ${terms.distinct} entries. The bar lists those in the text on screen.</p>
    <p><b>In ${PRODUCT}.</b> The companion pane offers the screens that take a year or a period in their address: the Invention Timeline a period from 3000 BC, the Kardashev Tracker its century steps, the Political Retrospective, Retrospective Battlefield and War Focus from 1926, the Historical Calendar from 1980. National Analysis has no year in its address, so it shows countries as they are today.</p>
    <p><b>Keys.</b> ← → chapters · J K paragraphs · T the terms bar · P the companion pane · Esc closes.</p>`;
}

/* ---------- the chapter ---------- */
function renderChapter(ci) {
  S.ci = ci;
  const c = chapter(), l = chapterLabel(c);
  $('#chapter-no').textContent = l.no.replace(/^chapter\s+/i, ''); // the head is narrow: "XII" says it
  $('#chapter-name').textContent = l.title;
  $('#chapter-title').title = [l.no, l.title].filter(Boolean).join(': ');
  document.title = `${S.book.title}${l.no ? `, ${l.no}` : `: ${l.title}`} · Neo Classic · Bibliotheca · ${SHORT}`;
  $('#text').innerHTML = c.paragraphs.map(p => paragraphHtml(p, { href: termHref })).join('') || '<p class="prp-empty">This chapter has no text.</p>';
  for (const [a, b, d] of [['#prev', '#prev2', -1], ['#next', '#next2', 1]]) {
    const to = S.chapters[ci + d];
    for (const el of [$(a), $(b)]) {
      el.href = to ? hashFor(to.n) : '#';
      if (to) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', 'true');
      el.tabIndex = to ? 0 : -1;
    }
    if (to) { const tl = chapterLabel(to); $(b).textContent = d < 0 ? `‹ ${tl.no || tl.title}` : `${tl.no || tl.title} ›`; $(b).title = tl.title; }
  }
  $$('#toc-list a').forEach(a => { if (+a.dataset.ci === ci) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  S.current = null; S.pin = null; S.p = null; S.chipsKey = '';
  highlight();
  observe();
  if (S.pane === 'vm') renderVm(); // a chapter may carry its own period
}

/* How far the terms bar reaches below the head when it is a strip over the text: 0 when it is collapsed or hidden, or
   when it is the list in the margin beside the column (it covers no text; told by where it is, not by the breakpoint,
   so the two cannot disagree). The strip hangs from the head (top: 100% − 6px), so this is its height less 6 px. */
function stripH() {
  const pop = $('#popout');
  if (pop.hidden) return 0;
  const p = pop.getBoundingClientRect(), t = $('#text').getBoundingClientRect();
  if (p.right <= t.left || p.left >= t.right) return 0;
  return Math.max(0, Math.ceil(p.bottom - $('#head').getBoundingClientRect().bottom));
}
// The reading region in viewport coordinates: under the sticky head and the terms strip, above the pane's sheet
// (narrow screens). Text the strip covers is not in view: its terms stay out of the bar, and reveal() scrolls a term
// out from under it.
function region() {
  const top = $('#head').getBoundingClientRect().bottom + stripH();
  const sheet = S.pane && !SPLIT.matches ? $('#pane').getBoundingClientRect().height : 0;
  return { top: Math.max(0, top), bottom: window.innerHeight - sheet };
}
/* (Re)builds the observer for the layout as it is now: called when a chapter is drawn, the pane opens, closes or grows,
   the window resizes, and the bar opens or collapses (syncBar). The strip's depth goes into the root margin and into
   --nc-bar, which the paragraphs' scroll-margin-top adds, so a jump (scrollIntoView) lands below the strip. */
function observe() {
  S.observer?.disconnect();
  S.headH = $('#head').offsetHeight;
  const strip = stripH();
  document.documentElement.style.setProperty('--nc-head', `${S.headH}px`);
  document.documentElement.style.setProperty('--nc-bar', `${strip}px`);
  const sheet = S.pane && !SPLIT.matches ? Math.round($('#pane').getBoundingClientRect().height) : 0;
  // Until the new observer reports, the set is what the layout shows now, so the bar never empties for a frame (the
  // strip opening forces a redraw of the chips straight after this); the observer's first report covers every
  // paragraph and keeps the set from then on. The pin is not known to have been seen until the observer says so.
  const { top, bottom } = region();
  S.visible = new Set($$('#text p.para').filter(p => { const r = p.getBoundingClientRect(); return r.bottom > top && r.top < bottom; }).map(p => p.id));
  S.pinSeen = false;
  // The document as root: its own viewport even inside the shell's frame (an implicit root would be the shell's).
  S.observer = new IntersectionObserver(entries => {
    for (const e of entries) { if (e.isIntersecting) S.visible.add(e.target.id); else S.visible.delete(e.target.id); }
    schedule();
  }, { root: document, rootMargin: `-${S.headH + strip}px 0px -${sheet}px 0px`, threshold: 0 });
  $$('#text p.para').forEach(p => S.observer.observe(p));
}

let frame = 0;
function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); }
function update() { if (!chapter()) return; updateCurrent(); renderChips(); updateProgress(); }

function onScreen() { return chapter().paragraphs.filter(p => S.visible.has(p.id)); }
// Scrolled to the end of the page (a page too short to scroll has not been read to its end just by opening it).
const atBottom = () => window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
/* A jump pins its paragraph (S.pin) at the height it landed (S.pinTop): the paragraph stays current, and stays put
   while the layout settles (the web font arriving reflows the text above it; the pane opening narrows the column),
   until the reader scrolls by hand (wheel, touch, a press, a scrolling key) or the paragraph has been on screen and
   left it (a drag of the scroll bar sends no event to the page). */
function pinAt(id, top = null) { S.pin = id; S.pinTop = top; S.pinSeen = false; }
function holdPin() {
  const el = S.pin && S.pinTop !== null && document.getElementById(S.pin);
  if (el) { const d = el.getBoundingClientRect().top - S.pinTop; if (Math.abs(d) > 1) window.scrollBy(0, d); }
}
function updateCurrent() {
  const shown = onScreen();
  let cur = null;
  if (S.pin) { if (S.visible.has(S.pin)) S.pinSeen = true; else if (S.pinSeen) S.pin = null; }
  if (S.pin && document.getElementById(S.pin)) cur = S.pin;
  else if (shown.length) {
    const { top, bottom } = region(), line = top + (bottom - top) * 0.3;
    for (const p of shown) { if (document.getElementById(p.id).getBoundingClientRect().top <= line) cur = p.id; else break; }
    cur ||= shown[0].id;
    if (atBottom()) cur = shown.at(-1).id; // the last lines can never reach the reading line
  }
  if (cur === S.current) return;
  document.getElementById(S.current)?.classList.remove('current');
  S.current = cur;
  if (cur) document.getElementById(cur)?.classList.add('current');
  if (cur) { S.p = cur; queueWrite(); }
}
function updateProgress() {
  const c = chapter(), text = $('#text').getBoundingClientRect(), { top, bottom } = region();
  let f = text.height ? (top + (bottom - top) * 0.3 - text.top) / text.height : 0;
  f = atBottom() ? 1 : Math.min(1, Math.max(0, f));
  $('#progress i').style.width = `${(f * 100).toFixed(1)}%`;
  $('#progress').setAttribute('aria-valuenow', String(Math.round(f * 100)));
  const i = c.paragraphs.findIndex(p => p.id === S.current);
  $('#pos').textContent = `¶ ${i < 0 ? '–' : i + 1} of ${c.paragraphs.length} · ${Math.round(f * 100)}%`;
}

/* ---------- the popout bar: the terms on screen ---------- */
// The observer says which paragraphs are on screen; within them, the term links actually in view (a long paragraph
// half off screen keeps the terms of its hidden half out of the bar), in reading order.
function termsInView() {
  const { top, bottom } = region(), seen = [];
  for (const p of onScreen()) for (const a of document.getElementById(p.id).querySelectorAll('a.term')) {
    const r = a.getBoundingClientRect();
    if (r.bottom > top && r.top < bottom) seen.push({ qid: a.dataset.qid, label: S.labels.get(a.dataset.qid), form: a.textContent });
  }
  return distinctTerms(seen);
}
function renderChips(force = false) {
  const terms = chapter() ? termsInView() : [];
  const key = `${terms.map(t => `${t.qid}:${t.n}`).join(',')}|${S.term}`;
  if (key === S.chipsKey && !force) return;
  S.chipsKey = key;
  $('#bar-count').textContent = terms.length;
  $('#bar-toggle').setAttribute('aria-label', `${terms.length} term${terms.length === 1 ? '' : 's'} on screen`);
  // data-term, not data-qid: the entity linker (design/jdpi-entities.js) badges every [data-qid] with a ◈ link.
  const focused = document.activeElement?.closest?.('.nc-chip')?.dataset.term;
  $('#chips').innerHTML = terms.length
    ? terms.map(t => `<button type="button" class="nc-chip" data-term="${t.qid}" aria-pressed="${t.qid === S.term}" title="${esc(t.forms.join(', '))}: ${t.n} on screen · ${t.qid}">${esc(t.label)}<span class="n">${t.n}</span></button>`).join('')
    : '<p class="none">No terms in view.</p>';
  if (focused) $(`#chips .nc-chip[data-term="${focused}"]`)?.focus({ preventScroll: true });
}
/* The bar is hidden altogether (the switch: S.bar), or shown as the ◈ button in the head with its list open or
   collapsed. Open or collapsed is the reader's choice once made (T, the ◈ button, the ×), and remembered; until then it
   is open where it is the list in the margin (wide, pane shut), which covers nothing, and collapsed where it would be
   a strip over the text (narrow, or the pane open), so opening the pane does not lay a strip over the text the reader
   never asked for. */
const marginBar = () => MARGIN_BAR.matches && !S.pane;
const popoutOpen = () => S.bar && (S.popout ?? marginBar());
// The bar's DOM state alone (inside keepPlace, which re-observes after it).
function drawBar() {
  const open = popoutOpen();
  $('#bar-switch').setAttribute('aria-pressed', String(S.bar));
  $('#bar-toggle').hidden = !S.bar;
  $('#popout').hidden = !open;
  $('#bar-toggle').setAttribute('aria-expanded', String(open));
}
// The bar as it should be, and the reading region with it: a strip opening or closing changes what is in view.
function syncBar() { drawBar(); if (chapter()) observe(); }
function setBar(on) { S.bar = on; store.set('prp.bibliotheca.bar', on); if (on && !popoutOpen()) S.popout = true; syncBar(); }
function setPopout(open) { S.popout = open; store.set('prp.bibliotheca.popout', open); syncBar(); if (open) renderChips(true); }

/* ---------- using a term ---------- */
function highlight() {
  $$('a.term.lit').forEach(a => a.classList.remove('lit'));
  if (S.term) $$(`a.term[data-qid="${S.term}"]`).forEach(a => a.classList.add('lit'));
}
// `from` is the link clicked; from the bar, it is the term's first occurrence in view. Either stays in view when the
// pane opens over the lower half of a phone's screen.
function useTerm(qid, from = null) {
  const { top, bottom } = region();
  from ||= $$(`#text a.term[data-qid="${qid}"]`).find(a => { const r = a.getBoundingClientRect(); return r.bottom > top && r.top < bottom; }) || null;
  S.term = qid;
  highlight(); renderChips(true);
  openPane('ency');
  reveal(from);
}
function clearTerm() {
  S.term = null;
  highlight(); renderChips(true);
  if (S.pane) renderPane();
  writeState();
}

/* ---------- the companion pane ---------- */
// Keep the reader's place when the text reflows (the pane opening or closing changes the column's width).
function keepPlace(change) {
  const el = S.current && document.getElementById(S.current), before = el ? el.getBoundingClientRect().top : null;
  change();
  if (el) { window.scrollBy(0, el.getBoundingClientRect().top - before); pinAt(S.current, before); }
  observe();
}
// Bring a term link into the free part of the screen (below the terms strip, above the pane's sheet on a phone): a
// term the strip has just come down over (the margin list turning into the strip as the pane opens) moves only clear
// of it, so the reader's place barely moves; one under the sheet, or off the screen, a third of the way down.
function reveal(a) {
  if (!a?.isConnected) return;
  const r = a.getBoundingClientRect(), { top, bottom } = region();
  if (r.top >= top && r.bottom <= bottom) return;
  const under = r.top < top && r.bottom > top - stripH() - 8;
  window.scrollBy(0, r.top - (under ? top + 12 : top + (bottom - top) / 3));
  S.pin = null;
}
// The bar's default depends on the pane (popoutOpen), so opening and closing it redraw the bar before keepPlace
// re-observes.
function openPane(tab) {
  if (!S.pane) keepPlace(() => { S.pane = tab; $('#pane').hidden = false; $('#layout').classList.add('split'); drawBar(); });
  S.pane = tab;
  $('#pane-toggle').setAttribute('aria-pressed', 'true');
  selectTab(tab);
  renderPane();
  writeState();
}
function closePane() {
  if (!S.pane) return;
  keepPlace(() => { S.pane = null; $('#pane').hidden = true; $('#layout').classList.remove('split'); drawBar(); });
  $('#pane-toggle').setAttribute('aria-pressed', 'false');
  writeState();
}
function selectTab(tab) {
  for (const t of ['ency', 'vm']) {
    const on = t === tab, b = $(`#tab-${t}`);
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    $(`#panel-${t}`).hidden = !on;
  }
}
function renderPane() { if (S.pane === 'ency') renderEncyclopaedia(); else if (S.pane === 'vm') renderVm(); }
function setPaneHead(kicker, title, link) {
  $('#pane-kicker').textContent = kicker;
  $('#pane-title').textContent = title;
  const open = $('#pane-open');
  open.hidden = !link;
  if (link) { open.href = link.href; open.target = link.target; open.rel = 'noopener'; open.dataset.shellHash = link.hash; open.title = `Open in ${PRODUCT}`; }
}

function renderEncyclopaedia() {
  const q = S.term, f = $('#ency-frame');
  $('#ency-empty').hidden = !!q;
  if (!q) { f.hidden = true; $('#ency-fallback').hidden = true; setPaneHead('Encyclopaedia', 'No term chosen', null); return; }
  const label = S.labels.get(q);
  setPaneHead('Encyclopaedia', label || q, placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${q}`));
  if (!label) entity(q).then(e => { if (e && S.term === q && S.pane === 'ency') $('#pane-title').textContent = e.label; });
  const fallback = $('#ency-link'), l = placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${q}`);
  fallback.href = l.href; fallback.target = l.target; fallback.rel = 'noopener'; fallback.dataset.shellHash = l.hash;
  if ($('#ency-fallback').hidden) f.hidden = false;
  if (moveFrame(f, entryUrl(q)) === 'hash') watchEntry(f);
}

/** Send a pane frame to an address, by hash alone when only the hash differs (no reload), as shell.js does.
    Returns how it moved: 'none', 'hash' or 'load'. */
function moveFrame(f, url) {
  // Where the frame is: on this origin, its own address (the clean one it was redirected to, which a hash move must
  // be written on); but while a page it was sent to has not yet replaced the one before, that is the old page, so the
  // new address loads afresh. On another origin, the address it was last sent to.
  let from = null;
  try {
    const here = f.contentWindow?.location.href;
    if (here && here !== 'about:blank' && !(f.dataset.loading && !samePage(new URL(here), new URL(f.dataset.url)))) from = here;
  } catch { from = f.dataset.url || null; }
  const move = frameMove(from, url, location.href);
  f.dataset.url = new URL(url, location.href).href;
  if (move.how === 'none') return 'none';
  if (move.how === 'hash') { try { f.contentWindow.location.replace(move.url); return 'hash'; } catch { /* load it below */ } }
  f.dataset.loading = '1';
  // location.replace keeps the frame's moves out of the page's history; the first load sets src.
  if (!f.getAttribute('src')) f.src = move.url; else { try { f.contentWindow.location.replace(move.url); } catch { f.src = move.url; } }
  return 'load';
}
// The Encyclopaedia frame is checked when it loads: a page that could not be framed, or failed, leaves a link instead.
function encyFrameLoaded() {
  const f = $('#ency-frame');
  let ok = false;
  try { ok = !!f.contentDocument?.querySelector('#entity, #explorer'); } catch { ok = false; }
  $('#ency-fallback').hidden = ok || !S.term;
  f.hidden = !ok || !S.term;
  if (ok) watchEntry(f);
}
/* The Encyclopaedia opens with its own front matter (title, search, counts), a third of a pane's height; in the pane
   the entry is the point. Once the page has drawn the entry asked for (it replaces #entity's contents: "Loading…",
   then the entry with its h2), the frame is scrolled to the page's tabs, just above the entry. Same origin, and only
   the frame's scroll position is touched; a page that never draws an h2 (no such entry) is left where it is. */
function watchEntry(f) {
  let doc, win;
  try { doc = f.contentDocument; win = f.contentWindow; } catch { return; }
  const box = doc?.getElementById('entity');
  if (!box || !win) return;
  S.entryWatch?.disconnect();
  const mo = new MutationObserver(() => {
    if (!box.querySelector('h2')) return;
    mo.disconnect();
    const tabs = doc.querySelector('[role="tablist"]') || box;
    win.scrollTo({ top: Math.max(0, tabs.getBoundingClientRect().top + win.scrollY - 4), behavior: 'auto' });
  });
  mo.observe(box, { childList: true });
  S.entryWatch = mo;
  setTimeout(() => mo.disconnect(), 20000);
}

/* "In Vitruvian Manager": the screens for an era, and where the term itself appears. */
async function renderVm() {
  const seq = ++S.vmSeq, q = S.term;
  const own = bookEra(S.book, S.row, chapter());
  const ent = q ? await entity(q) : null;
  const termEra = ent ? eraFromFacts(ent.facts) : null;
  // A term's own era is offered only when the term existed by the end of the book's period: a present-day state the
  // tagger let through (or an address that names one) would otherwise offer 1946 to today beside a text of 1513.
  const termOk = termEra && (!own || termEra[0] <= own.years[1]);
  const [reg, wars, energy] = await Promise.all([loadRegistry().catch(() => null), loadWars().catch(() => []), loadEnergy().catch(() => null)]);
  if (seq !== S.vmSeq) return;
  const label = ent?.label || S.labels.get(q) || q;
  const byTerm = S.eraOf === 'term' && termOk;
  const years = byTerm ? termEra : own?.years;
  // Whose era: the book's (or the chapter's), or the term's own dates when the Encyclopaedia has them.
  const pick = $('#era-pick');
  pick.hidden = !termOk || !own;
  if (termOk && own) {
    pick.innerHTML = `<label><input type="radio" name="era-of" value="book"${byTerm ? '' : ' checked'}> ${esc(S.book.title)} · ${esc(fmtEra(own.years))}</label>`
      + `<label><input type="radio" name="era-of" value="term"${byTerm ? ' checked' : ''}> ${esc(label)} · ${esc(fmtEra(termEra))}</label>`;
  }
  if (!years) {
    $('#era-title').textContent = 'This book records no period.'; $('#era-rows').innerHTML = ''; setPaneHead(`In ${PRODUCT}`, S.book.title, null);
    if (S.pendingShow) { S.pendingShow = null; writeState(); } // nothing to show it in
    return;
  }
  $('#era-title').innerHTML = byTerm ? `The screens for <b>${esc(fmtEra(years))}</b>, the dates of ${esc(label)}.` : `The screens for <b>${esc(fmtEra(years))}</b>, ${esc(own.label)}.`;
  const steps = energy?.steps?.map(s => s.year) || KARDASHEV_STEPS;
  const step = kardashevStep(Math.round((years[0] + years[1]) / 2), steps);
  // With the term's own era, War Focus lists only the war that is the term (the wars of its centuries are not its own).
  const rows = eraRows(years, { wars, qid: q, ownEra: !!byTerm, polity: ent ? kardashevPolity(ent.wiki, energy?.polities, step) : null, steps });
  const name = r => moduleInfo(reg, r.module)?.name || r.name;
  // The places the Encyclopaedia records for the term (its "Appears in"), when it has any.
  const ments = (ent?.mentions || []).slice(0, 8).map((m, i) => {
    const info = moduleInfo(reg, m.m);
    const l = info ? placeLink(info.suite, m.m, m.u) : { href: pageUrl(m.u), hash: '', page: pageUrl(m.u), target: '_blank' };
    return { key: `m${i}`, ...l, name: info?.name || m.m, place: m.c || '' };
  });
  const places = new Map([
    ...rows.filter(r => r.available).map(r => [r.id, { ...placeLink(r.suite, r.module, r.at), name: name(r), place: r.place }]),
    ...ments.map(m => [m.key, m]),
  ]);
  // The screen shown in the pane follows the era (the same screen, at the new place); one the new era closes, or a
  // place of another term, leaves the pane, and the address.
  if (S.vmShown && (!places.has(S.vmShown) || (S.vmShown.startsWith('m') && S.vmShownTerm !== q))) { hideVm(); writeState(); }
  S.vmRows = places;
  const acts = (key, l, what) => `<div class="acts"><button type="button" class="prp-btn sm" data-show="${esc(key)}">Show here</button><a class="prp-btn sm ghost" ${linkAttrs(l)} title="Open in ${PRODUCT}" aria-label="Open ${esc(what)} in ${PRODUCT}">↗</a></div>`;
  const cur = key => (S.vmShown === key ? ' aria-current="true"' : '');
  $('#era-rows').innerHTML = rows.map(r => (!r.available
    ? `<li class="off" data-key="${esc(r.id)}"><div class="what"><b>${esc(name(r))}</b><span>${esc(r.reason)}</span></div></li>`
    : `<li data-key="${esc(r.id)}"${cur(r.id)}><div class="what"><b>${esc(name(r))}${r.today ? '<span class="prp-kind">Today</span>' : ''}</b><span>${esc(r.place)}</span></div>${acts(r.id, places.get(r.id), name(r))}</li>`)).join('');
  $('#mentions').hidden = !ments.length;
  $('#mentions-label').textContent = `Where ${label} appears`;
  $('#mention-rows').innerHTML = ments.map(m => `<li data-key="${m.key}"${cur(m.key)}><div class="what"><b>${esc(m.name)}</b><span>${esc(m.place)}</span></div>${acts(m.key, m, m.name)}</li>`).join('');
  const shown = S.vmShown && places.get(S.vmShown);
  if (shown) moveFrame($('#vm-frame'), shown.page);
  setPaneHead(`In ${PRODUCT}`, shown ? `${shown.name} · ${shown.place}` : fmtEra(years), shown || null);
  // The screen the address names (show=, on a reload or an edited link) once its row exists; one this era does not
  // offer is dropped from the address.
  if (S.pendingShow) {
    const k = S.pendingShow;
    S.pendingShow = null;
    if (places.has(k)) showVm(k); else writeState();
  }
}
function hideVm() {
  S.vmShown = null;
  $('#vm-frame').hidden = true;
  $('#vm-list').classList.remove('with-frame');
  $('#vm-empty').hidden = false;
}
function showVm(key) {
  const r = S.vmRows?.get(key);
  if (!r) return;
  S.vmShown = key; S.vmShownTerm = S.term;
  $$('#vm-list li').forEach(li => { if (li.dataset.key === key) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); });
  $('#vm-list').classList.add('with-frame');
  $('#vm-empty').hidden = true;
  const f = $('#vm-frame');
  f.hidden = false; f.title = `${r.name} · ${r.place}`;
  moveFrame(f, r.page);
  setPaneHead(`In ${PRODUCT}`, `${r.name} · ${r.place}`, r);
  writeState(); // the address names the screen, so a reload shows it again
}
/* On a phone the pane is a sheet, and a screen's own front matter (title, description, readings) fills a frame that
   tall; every era screen ends that front matter with its .prp-meta line, so once the screen has loaded the frame is
   scrolled to just below it, as watchEntry does for the Encyclopaedia. A screen is still drawing as it loads: its body
   (a map, a timeline) may not yet make the page tall enough to scroll that far, and the meta line itself grows when
   its "Loading…" becomes the readings, so the scroll follows both (a ResizeObserver of the frame's own) for a few
   seconds, until the reader touches the frame. Same origin; only the frame's scroll moves. */
function skipFrontMatter(f) {
  if (SPLIT.matches) return;
  let win, doc;
  try { win = f.contentWindow; doc = f.contentDocument; } catch { return; } // another origin (the Political Retrospective)
  const meta = doc?.querySelector('.prp-meta');
  if (!meta || !win) return;
  let ro = null, timer = 0, done = false;
  const stop = () => { done = true; ro?.disconnect(); clearTimeout(timer); };
  const go = () => { if (!done) win.scrollTo(0, Math.max(0, Math.round(meta.getBoundingClientRect().bottom + win.scrollY + 4))); };
  try { ro = new win.ResizeObserver(go); ro.observe(doc.documentElement); ro.observe(meta); } catch { /* no ResizeObserver: once is all */ }
  timer = setTimeout(stop, 8000);
  for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.addEventListener(ev, stop, { once: true, passive: true });
  go();
}
/* On its own, a link in a pane frame that would open at the top (the framed page's cross-links: it believes it is in
   the shell) opens in a new tab instead of replacing the book; its address is already the shell's route to the place.
   The link's target is changed as the click goes down to it (capture), so the browser's own new-tab handling does the
   rest, with any button or key. Inside the shell the top is the shell, which is right. Called on each page a frame
   loads (a move by hash keeps the page and the listener). */
function keepTop(f) {
  if (embedded) return;
  try {
    f.contentDocument?.addEventListener('click', e => {
      const a = e.target.closest?.('a[target="_top"], a[target="_parent"]');
      if (a) { a.target = '_blank'; a.relList.add('noopener'); }
    }, true);
  } catch { /* another origin: its links are its own */ }
}

// The pane's frames take the page's theme, as the shell's frames take the shell's (design/prp-bar.js listens for it).
const paneFrames = () => [$('#ency-frame'), $('#vm-frame')];
const theme = () => window.prpTheme?.() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function postTheme(f) { try { f.contentWindow?.postMessage({ type: 'prp:theme', theme: theme() }, '*'); } catch { /* not loaded */ } }

/* ---------- the address ---------- */
let writeTimer = 0;
function queueWrite() { clearTimeout(writeTimer); writeTimer = setTimeout(writeState, 350); }
function writeState() {
  clearTimeout(writeTimer);
  if (!S.book) return;
  // The screen shown in the pane, or the one the address named and the pane has not drawn yet (so a write in between
  // does not drop it); the era choice whenever it is the term's.
  const show = S.pane === 'vm' ? S.vmShown || S.pendingShow : null;
  const hash = writeHash({ book: S.book.slug, ch: chapter()?.n, p: S.p, t: S.term, pane: S.pane, show, era: S.eraOf === 'term' ? 'term' : null });
  if (hash !== location.hash) { try { history.replaceState(history.state, '', hash); } catch { /* rate-limited: the next move writes it */ } }
}
// A chapter opens with its head at the top of the screen, its first paragraph pinned there (lest the web fonts,
// arriving, reflow the front matter above and push it down).
function scrollToReader() {
  window.scrollTo({ top: $('#reader').getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
  const first = $('#text p.para');
  if (first) pinAt(first.id, first.getBoundingClientRect().top);
}
function jumpTo(id, { smooth = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const glide = smooth && !reduced();
  el.scrollIntoView({ block: 'start', behavior: glide ? 'smooth' : 'auto' });
  pinAt(id, glide ? null : el.getBoundingClientRect().top); // a glide lands later: nothing to hold yet
  S.p = id;
  schedule(); writeState();
}
function goChapter(i) {
  if (i < 0 || i >= S.chapters.length || i === S.ci) return;
  renderChapter(i);
  scrollToReader();
  writeState();
}

async function applyHash({ first = false } = {}) {
  const h = readHash(location.hash);
  const slug = S.shelf.some(b => b.slug === h.book) ? h.book : S.shelf[0].slug;
  if (S.book?.slug !== slug) { if (S.vmShown) hideVm(); if (!(await loadBook(slug))) return; }
  let ci = h.ch === null ? 0 : S.chapters.findIndex(c => c.n === h.ch);
  if (ci < 0) ci = 0;
  const moved = ci !== S.ci;
  // Whose era, and the screen the pane shows (shown by renderVm once its row exists); an address on the pane's list
  // with no screen named shows the list alone.
  S.eraOf = h.era === 'term' ? 'term' : 'book';
  S.pendingShow = h.show;
  if (h.pane === 'vm' && !h.show && S.vmShown) hideVm();
  if (moved) renderChapter(ci);
  if (h.t !== S.term) { S.term = h.t; highlight(); }
  if (h.pane && h.pane !== S.pane) openPane(h.pane);
  else if (!h.pane && S.pane) closePane();
  else if (S.pane) renderPane();
  if (h.p && document.getElementById(h.p) && h.p !== S.current) jumpTo(h.p);
  else if (moved && !(first && h.ch === null)) scrollToReader();
  renderChips(true);
  writeState(); // the address as the page reads it (an unknown chapter becomes the first)
}

/* ---------- events ---------- */
function wire() {
  // A term in the text or the byline: a plain click uses it; Ctrl, Shift or the middle button open its entry.
  for (const box of [$('#text'), $('#byline')]) box.addEventListener('click', e => {
    const a = e.target.closest('a.term');
    if (!a || !plainClick(e)) return;
    e.preventDefault();
    useTerm(a.dataset.qid, a);
  });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.nc-chip');
    if (!b) return;
    if (b.getAttribute('aria-pressed') === 'true') clearTerm(); else useTerm(b.dataset.term);
  });
  $('#bar-toggle').addEventListener('click', () => setPopout(!popoutOpen()));
  $('#popout-close').addEventListener('click', () => { setPopout(false); $('#bar-toggle').focus(); });
  $('#bar-switch').addEventListener('click', () => setBar(!S.bar));

  // Contents: a list hanging from the head; a click outside it, Escape or a choice closes it.
  const toc = open => { $('#toc').hidden = !open; $('#toc-toggle').setAttribute('aria-expanded', String(open)); if (open) $('#toc-list a[aria-current]')?.focus({ preventScroll: true }); };
  $('#toc-toggle').addEventListener('click', () => toc($('#toc').hidden));
  $('#toc-list').addEventListener('click', e => {
    const a = e.target.closest('a[data-ci]');
    if (!a || !plainClick(e)) return;
    e.preventDefault(); toc(false); goChapter(+a.dataset.ci); $('#toc-toggle').focus({ preventScroll: true });
  });
  document.addEventListener('click', e => { if (!$('#toc').hidden && !e.target.closest('#toc, #toc-toggle')) toc(false); });
  for (const [id, d] of [['#prev', -1], ['#next', 1], ['#prev2', -1], ['#next2', 1]]) $(id).addEventListener('click', e => {
    if (!plainClick(e)) return;
    e.preventDefault(); goChapter(S.ci + d);
  });

  // Another book: its first chapter, with the page at the book's own front matter.
  $('#shelf').addEventListener('change', async () => {
    history.replaceState(history.state, '', writeHash({ book: $('#shelf').value, ch: null }));
    await applyHash({ first: true });
    window.scrollTo({ top: Math.max(0, $('#layout').getBoundingClientRect().top + window.scrollY - 8), behavior: 'auto' });
  });

  // The pane.
  $('#pane-toggle').addEventListener('click', () => (S.pane ? closePane() : openPane(S.term ? 'ency' : 'vm')));
  $('#pane-close').addEventListener('click', () => { closePane(); $('#pane-toggle').focus({ preventScroll: true }); });
  const setTall = tall => {
    $('#pane').classList.toggle('tall', tall); $('#pane-tall').setAttribute('aria-pressed', String(tall));
    observe();
  };
  $('#pane-tall').addEventListener('click', () => setTall(!$('#pane').classList.contains('tall')));
  const tabs = ['ency', 'vm'];
  for (const t of tabs) $(`#tab-${t}`).addEventListener('click', () => openPane(t));
  $('[role="tablist"]').addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const next = tabs[(tabs.indexOf(S.pane) + k + tabs.length) % tabs.length];
    openPane(next); $(`#tab-${next}`).focus();
  });
  $('#era-pick').addEventListener('change', e => { S.eraOf = e.target.value === 'term' ? 'term' : 'book'; renderVm(); writeState(); });
  // "Show here": the screen in the pane; on a phone the sheet opens taller for it (Taller again gives the text back).
  $('#vm-list').addEventListener('click', e => {
    const b = e.target.closest('[data-show]');
    if (!b) return;
    showVm(b.dataset.show);
    if (!SPLIT.matches && !$('#pane').classList.contains('tall')) setTall(true);
  });
  $('#ency-frame').addEventListener('load', () => { const f = $('#ency-frame'); delete f.dataset.loading; postTheme(f); keepTop(f); encyFrameLoaded(); });
  $('#vm-frame').addEventListener('load', () => { const f = $('#vm-frame'); delete f.dataset.loading; postTheme(f); keepTop(f); skipFrontMatter(f); });

  // Links into the shell: inside it, move it without reloading it; on its own, the link opens the shell in a new tab.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-shell-hash]');
    if (!a || !embedded || !plainClick(e) || !SHELL_ROUTE.test(a.dataset.shellHash || '')) return;
    e.preventDefault(); shellGo(a.dataset.shellHash);
  });
  // The frames announce themselves (and may ask the shell to move): answer with the theme; pass moves on to the shell.
  window.addEventListener('message', e => {
    const f = paneFrames().find(x => x.contentWindow === e.source);
    if (!f || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'jdpi:module-ready' || e.data.type === 'prp:hello') postTheme(f);
    if (e.data.type === 'prp:navigate' && e.origin === location.origin && embedded && SHELL_ROUTE.test(String(e.data.hash || ''))) shellGo(e.data.hash);
  });
  window.addEventListener('prp:themechange', () => paneFrames().forEach(postTheme));

  // Reading: the observer and the scroll keep the current paragraph, the bar and the progress; a hand scroll unpins.
  window.addEventListener('scroll', schedule, { passive: true });
  // Anything that reflows the page (the web fonts arriving, the pane narrowing the column) holds a pinned paragraph.
  const reflow = new ResizeObserver(() => { holdPin(); schedule(); });
  reflow.observe($('#text')); reflow.observe($('.nc-page'));
  document.fonts?.ready.then(() => { holdPin(); schedule(); });
  for (const ev of ['wheel', 'touchstart', 'pointerdown']) window.addEventListener(ev, e => { if (!e.target.closest?.('.nc-pane, .nc-popout, .nc-toc')) S.pin = null; }, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (chapter()) observe(); }, 150); });
  // Crossing a breakpoint reflows the text and may turn the margin list into a strip (or collapse it, by default).
  for (const m of [SPLIT, MARGIN_BAR]) m.addEventListener?.('change', () => { if (chapter()) keepPlace(drawBar); else drawBar(); });
  window.addEventListener('hashchange', () => applyHash());

  // Keys: ← → chapters, J K paragraphs, T the terms bar, P the pane, Escape closes the innermost open thing.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const typing = /^(input|select|textarea)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape') {
      if (!$('#toc').hidden) { toc(false); $('#toc-toggle').focus({ preventScroll: true }); }
      else if (S.pane) { closePane(); $('#pane-toggle').focus({ preventScroll: true }); }
      else if (popoutOpen() && !marginBar()) setPopout(false); // the strip collapses; the margin list stays
      return;
    }
    if (typing || !chapter()) return;
    if (['PageUp', 'PageDown', ' ', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) { S.pin = null; return; }
    const paras = chapter().paragraphs, i = paras.findIndex(p => p.id === S.current);
    const act = {
      ArrowLeft: () => goChapter(S.ci - 1), ArrowRight: () => goChapter(S.ci + 1),
      j: () => paras[i + 1] && jumpTo(paras[i + 1].id, { smooth: true }), k: () => i > 0 && jumpTo(paras[i - 1].id, { smooth: true }),
      t: () => (S.bar ? setPopout(!popoutOpen()) : setBar(true)), p: () => (S.pane ? closePane() : openPane(S.term ? 'ency' : 'vm')),
    }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!act) return;
    e.preventDefault(); act();
  });
}

async function init() {
  wire(); syncBar();
  try {
    const idx = await getJson(`${DATA}index.json`);
    S.shelf = (idx.books || []).filter(b => b && /^[a-z0-9][a-z0-9-]*$/.test(b.slug || ''));
    S.generated = idx.generated || null;
  } catch (e) {
    $('#meta').innerHTML = `<span>The shelf could not load: ${esc(e.message)}</span>`;
    $('#text').innerHTML = '<p class="prp-empty">No book to show.</p>';
    return;
  }
  if (!S.shelf.length) { $('#meta').innerHTML = '<span>The shelf is empty.</span>'; $('#text').innerHTML = '<p class="prp-empty">No book to show.</p>'; return; }
  renderShelf(); renderMeta();
  await applyHash({ first: true });
}
init();

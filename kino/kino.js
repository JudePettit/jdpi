/* Kino, Vitruvian Manager's documentary module: the catalogue and player for one category (kino/index.html?cat=<category>).
   Deep links: #doc=<id>&s=<scene id or number>, and &split=1 while Split view is on. Scripts live in
   data/<category>/<id>.json (see README.md); data/index.json, media.json and iso.json are built by scripts/build-index.mjs.
   Split view (V) shows each scene's place in Vitruvian Manager in a pane beside the film (design/prp-split.js), in place
   of the block of text, which gives way to the sentence being read; Related (T) is a strip of the screens related to
   the scene, with a See more panel; full screen (F) fits the 16:9 stage to the screen, beside the pane when it is on;
   Page only (G) fills the screen with the pane alone, which follows the film as it plays on. */
import { CATEGORIES, categoryOf, flatScenes, shortCite } from './lib/format.js';
import { tokens, sentences, sentenceRuns, estimateSeconds } from './lib/text.js';
import { shellHash, shellUrl, readKinoHash, kinoHash, filmRoute, readKinoView, kinoViewHash, linkPlace } from './lib/links.js';
import { relatedPlaces, sceneEntities, tagTables, shardOf, CHIPS } from './lib/related.js';
import { Reader, Music, store, voiceList, pickVoice, onVoices, hasSpeech, voices, onlineVoices, knownOnline } from './lib/voice.js';
import { Stage, preview, esc, reduced } from './lib/stage.js';
import { sidePane, splitter, fullScreen, inSidePane, shellGo } from '../design/prp-split.js';

const $ = s => document.querySelector(s);
const CAT = categoryOf(new URLSearchParams(location.search).get('cat'))?.id || 'wars';
const CATINFO = categoryOf(CAT);
const SHELL = new URL('../', location.href).href; // the Vitruvian Manager root, where the shell lives
const LAKE = new URL('lake/data/', SHELL).href;   // the Master Index's shards, for Related screens
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
// Shown in another page's pane (a frame named 'prp-side'): no pane of its own, no Related and no Follow (rule 5 of
// design/prp-split.js), so a film cannot open a book that opens a film.
const inSide = inSidePane();
const BASE_RATE = 0.92; // the shell reader's lecture pace
const sleep = ms => new Promise(r => setTimeout(r, ms));
const yr = y => (y < 0 ? `${-y} BC` : String(y));
const era = e => (e[0] === e[1] ? yr(e[0]) : `${yr(e[0])}–${yr(e[1])}`);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const S = {
  index: null, media: { files: {}, qids: {} }, registry: null,
  doc: null, scenes: [], i: 0, playing: false, run: 0, sentence: 0, words: [], lit: null, started: false,
  voice: store.get('prp.kino.voice', true), speed: store.get('prp.kino.speed', 1), music: store.get('prp.kino.music', false), follow: false, followWin: null,
  // Split view, the pane held on a place, the Related strip (shown or not), the sentence runs of the scene on screen,
  // the sentence shown in the sentence box, and the scene's related places.
  split: false, hold: false, related: !inSide && store.get('prp.kino.related', false), runs: [], shown: 0, rel: [], relOwn: true,
  // Page only (G): the pane alone, full screen, still following the film; and whether Split view was on before it.
  pageOnly: false, splitBefore: false, fsBefore: false,
};

/* ---------- the registry: names, icons and codes for links ---------- */
function moduleInfo(link) {
  if (/^kino-/.test(link.module)) { const c = categoryOf(link.module.replace(/^kino-/, '')); return { name: `Kino · ${c?.name || ''}`, icon: '▶', code: 'KN', suite: 'kino', suiteName: 'Kino' }; }
  const suite = S.registry?.suites.find(s => s.id === link.suite || s.aliases?.includes(link.suite));
  const m = suite?.modules.find(x => x.id === link.module || x.aliases?.includes(link.module));
  return m ? { name: m.name, icon: m.icon, code: suite.code, suite: suite.id, suiteName: suite.name, url: m.url } : { name: link.label.split(' · ')[0], code: link.suite.toUpperCase(), suite: link.suite };
}
// Kino's submodules are "kino-<category>" in registry.json. Once one is live (it has a url), links between categories
// go through the shell so its sidebar and breadcrumb follow; until then they open the page directly. They are plain
// links, not tabs, on purpose: each category is its own submodule page, so a tab list would promise views of this one.
// Revisit when Kino is restructured.
const kinoModule = id => S.registry?.suites.find(s => s.id === 'kino')?.modules.find(m => m.id === `kino-${id}`) || null;
function catLink(id) {
  if (embedded && kinoModule(id)?.url) return { href: `${SHELL}#/kino/kino-${id}`, target: '_top' };
  return { href: `index.html?cat=${id}`, target: '_self' };
}

/* ---------- header and catalogue ---------- */
function renderHeader() {
  $('#eyebrow-cat').textContent = CATINFO.name;
  $('#cat-title').textContent = CATINFO.name;
  $('#cat-dek').textContent = `${CATINFO.dek} ${CATINFO.courses ? 'Each course plays in parts, with a short quiz at the end.' : 'Each documentary is narrated over maps, timelines and portraits, and every scene can open its place in Vitruvian Manager, or show it beside the film.'}`;
  const docs = S.index.docs.filter(d => d.category === CAT), mins = docs.reduce((a, d) => a + d.minutes, 0);
  $('#cat-meta').innerHTML = [`<span><b>${docs.length}</b> ${CATINFO.courses ? 'course' : 'documentar'}${docs.length === 1 ? (CATINFO.courses ? '' : 'y') : (CATINFO.courses ? 's' : 'ies')}</span>`,
    docs.length ? `<span><b>${mins}</b> minutes</span>` : '', `<span><b>${S.index.docs.length}</b> in Kino</span>`, '<span>Sources <b>scholarly works · Wikidata · Wikimedia Commons</b></span>',
    `<span>Updated <b>${esc(new Date(S.index.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</b></span>`].filter(Boolean).join('');
  $('#cats').innerHTML = CATEGORIES.map(c => { const l = catLink(c.id), n = S.index.categories.find(x => x.id === c.id)?.count || 0;
    return `<a class="prp-chip" href="${esc(l.href)}" target="${l.target}"${c.id === CAT ? ' aria-current="page"' : ''}>${esc(c.name)} <span class="n">${n}</span></a>`; }).join('');
  $('#see-also').innerHTML = CATEGORIES.filter(c => c.id !== CAT).map(c => { const l = catLink(c.id); return `<a href="${esc(l.href)}" target="${l.target}">Kino · ${esc(c.name)}</a>`; }).join(', ')
    + '. War Focus, Retrospective Battlefield, the Master Index and the other submodules each documentary links to.';
}

function renderCatalogue() {
  const q = $('#find').value.trim().toLowerCase(), sort = $('#sort').value;
  let docs = S.index.docs.filter(d => d.category === CAT);
  if (q) docs = docs.filter(d => [d.title, d.summary, ...d.subjects.map(s => s.label)].join(' ').toLowerCase().includes(q));
  docs.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : sort === 'short' ? (a, b) => a.minutes - b.minutes : (a, b) => a.era[0] - b.era[0]);
  $('#count').textContent = `${docs.length} shown`;
  $('#cards').innerHTML = docs.length ? docs.map(d => `<a class="kn-card" href="${kinoHash(d.id)}" data-doc="${esc(d.id)}">
      <div class="thumb" data-preview="${esc(d.id)}"><span class="play">${d.parts ? 'Start course' : 'Watch'}</span></div>
      <div class="body"><h2>${esc(d.title)}</h2>
        <div class="meta">${esc(era(d.era))} · ${d.minutes} min · ${d.parts ? `${d.parts} parts · ` : ''}${d.scenes} scenes · ${d.sources} sources</div>
        <p>${esc(d.summary)}</p>
        <div class="subjects">${d.subjects.map(s => `<span class="prp-chip">${esc(s.label)}</span>`).join('')}</div></div></a>`).join('')
    : `<div class="kn-empty">${q ? 'No documentary here matches that search.' : `No ${CATINFO.courses ? 'courses' : 'documentaries'} in ${esc(CATINFO.name)} yet. The first ones are in preparation, below.`}</div>`;
  for (const d of docs) {
    const thumb = $(`.thumb[data-preview="${CSS.escape(d.id)}"]`);
    preview(thumb, d.preview, S.media, 'data/').catch(() => {});
  }
  const plan = S.index.plan?.[CAT] || [];
  $('#planned').hidden = !plan.length;
  $('#planned-list').innerHTML = plan.map(p => `<li><b>${esc(p.title)}</b><span>${esc(era(p.era))}${p.from ? ` · met in ${esc(p.from)}` : ''}</span></li>`).join('');
}

/* ---------- routing ---------- */
async function route() {
  const { doc, s } = readKinoHash(location.hash);
  if (!doc) return closeDoc();
  if (S.doc?.id === doc) {
    // A later address in the same film can turn Split view on, never off (only the button, V and Follow do).
    if (readKinoView(location.hash).split && !S.split) setSplit(true, { remember: false });
    if (s) go(sceneIndex(s));
    return;
  }
  await openDoc(doc, s);
}
const sceneIndex = ref => { if (!ref) return 0; const k = S.scenes.findIndex(x => x.id === ref); if (k >= 0) return k; const n = parseInt(ref, 10); return Number.isFinite(n) ? Math.max(0, Math.min(S.scenes.length - 1, n - 1)) : 0; };

let stage, reader, music;
async function openDoc(id, sceneRef) {
  const entry = S.index.docs.find(d => d.id === id);
  if (!entry) { closeDoc(); note(`There is no documentary called “${id}”.`, true); return; }
  stop();
  let doc;
  try { doc = await fetch(`data/${entry.path}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }); }
  catch (e) { note(`The documentary could not load (${e.message}).`, true); return; }
  S.doc = doc; S.scenes = flatScenes(doc); S.started = false; S.rel = [];
  $('#catalogue').hidden = true; $('#player').hidden = false;
  $('.kn-front').classList.add('compact');
  document.title = `${doc.title} · Kino · VM`;
  $('#doc-title').textContent = doc.title;
  $('#back-label').textContent = `All ${CATINFO.name.toLowerCase()} ${CATINFO.courses ? 'courses' : 'documentaries'}`;
  $('#doc-meta').textContent = `${era(doc.era)} · ${doc.minutes} min · ${S.scenes.length} scenes · ${doc.sources.length} sources${doc.category !== CAT ? ` · ${categoryOf(doc.category)?.name}` : ''}`;
  renderChapters(); renderProgress(); renderAbout(); renderSources(); renderQuiz();
  note('');
  window.scrollTo({ top: 0 });
  // split=1 in the address turns Split view on; with no such key the film starts as the viewer last left it.
  S.hold = false; S.i = sceneIndex(sceneRef);
  setSplit(readKinoView(location.hash).split || store.get('prp.kino.split', false), { remember: false, show: false });
  go(sceneIndex(sceneRef), { initial: true });
}
function closeDoc() {
  stop(); music?.set(false);
  closeMore({ focus: false });
  pane?.drop(); // a page in a hidden frame keeps running
  S.doc = null; S.scenes = [];
  $('#player').hidden = true; $('#catalogue').hidden = false; $('.kn-front').classList.remove('compact');
  document.title = `${CATINFO.name} · Kino · VM`;
  fs?.exit();
}

/* ---------- playback ---------- */
const rate = () => BASE_RATE * S.speed;
function go(i, { initial = false } = {}) {
  if (!S.doc) return;
  S.i = Math.max(0, Math.min(S.scenes.length - 1, i)); S.sentence = 0;
  const run = ++S.run; reader.stop();
  const sc = S.scenes[S.i];
  renderCaption(sc); updateChapters(); updateProgress(0);
  $('#badge').textContent = `${S.i + 1} / ${S.scenes.length}`;
  $('#scene-count').textContent = `${S.i + 1} / ${S.scenes.length}`;
  $('#stage').setAttribute('aria-label', `Scene ${S.i + 1}: ${sc.title}`);
  writeAddress();
  stage.show(sc, S.doc);
  if (S.follow && sc.link && !initial) navigate(sc.link);
  showScenePlace(); // Split view: the pane follows the film, unless it is held
  updateRelated();
  if (S.playing) runScene(run, S.i, 0);
  nowPlaying();
}
async function runScene(run, i, from) {
  const sc = S.scenes[i], t0 = performance.now();
  if (S.voice && (hasSpeech() || knownOnline().length)) music.duck(true);
  // next: an online voice fetches the next scene's first sentence while this scene's last one plays
  const r = await reader.read(sc.narration, { voice: S.voice, rate: rate(), from, next: S.scenes[i + 1]?.narration });
  music.duck(false);
  if (run !== S.run || !S.playing || !r.done) return;
  highlight(-1); updateProgress(1);
  await sleep(Math.max(reduced() ? 600 : 1100, (sc.seconds || 0) * 1000 - (performance.now() - t0)));
  if (run !== S.run || !S.playing) return;
  if (i < S.scenes.length - 1) go(i + 1); else finish();
}
function play() {
  if (!S.doc) return;
  reader.unlock(); // inside the click or key press, before anything waits: iOS plays an online voice's clips only then
  if (S.ended) { S.ended = false; go(0); }
  S.playing = true; S.started = true; setPlayUi();
  if (S.music) music.set(true);
  runScene(++S.run, S.i, S.sentence);
}
function pause() {
  if (!S.playing) return;
  S.playing = false; S.run++; S.sentence = reader.sentence; reader.stop(); music.duck(false); setPlayUi();
}
function stop() { S.playing = false; S.run++; reader?.stop(); S.ended = false; setPlayUi(); nowPlayingStop(); }
const toggle = () => (S.playing ? pause() : play());
function restartSentence() { if (S.playing) { const k = reader.sentence; S.run++; reader.stop(); runScene(S.run, S.i, k); } }
function finish() {
  S.playing = false; S.ended = true; setPlayUi(); highlight(-1);
  const list = S.index.docs.filter(d => d.id !== S.doc.id), next = list.find(d => d.category === S.doc.category) || list[0];
  const card = stage.end(S.doc, next);
  card.querySelector('[data-act="again"]').onclick = () => { S.ended = false; go(0); play(); };
  // The sources and the quiz are under the player: full screen ends so they can be seen.
  card.querySelector('[data-act="sources"]').onclick = async () => { await fs?.exit(); $('#doc-sources').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); };
  if (S.doc.quiz?.length) {
    $('#quiz').hidden = false;
    (fs?.on ? fs.exit() : Promise.resolve()).then(() => $('#quiz').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }));
    // Following along, the course ended on another page: bring Kino back into view for its quiz.
    if (embedded && S.follow) shellGo(`#/kino/kino-${CAT}`);
  }
}
function setPlayUi() {
  const b = $('#play'); if (!b) return;
  b.textContent = S.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  const big = $('#bigplay'); big.hidden = S.playing; big.textContent = S.started && !S.ended ? 'Resume' : S.ended ? 'Watch again' : 'Play';
  $('#cap-text').setAttribute('aria-live', S.voice && S.playing ? 'off' : 'polite');
  nowPlaying();
}

/* ---------- now playing: while the film follows along in the shell, its own frame is hidden, so the shell shows its
   caption and controls in a bar. Protocol: README.md, "Now playing". ---------- */
const NP_EVERY = 300; // ms: at most one message this often (the last state is always sent)
const np = { timer: 0, last: 0, live: false, state: '' };
const toShell = msg => { try { window.parent.postMessage(msg, location.origin); } catch { /* no shell */ } };
function nowPlaying() {
  if (!embedded) return;
  if (!S.follow || !S.doc) { nowPlayingStop(); return; }
  // Playing, paused or ended goes at once; only new captions wait their turn. The bar's Play/Pause acts on the state it
  // was last told: a pause held back here would reach the shell after the viewer's next press and undo it.
  const state = `${S.playing && !S.ended}/${S.ended}`, wait = np.last + NP_EVERY - Date.now();
  if (wait > 0 && state === np.state) { np.timer ||= setTimeout(() => { np.timer = 0; nowPlaying(); }, wait); return; }
  clearTimeout(np.timer); np.timer = 0; np.last = Date.now(); np.live = true; np.state = state;
  const sc = S.scenes[S.i];
  toShell({
    type: 'prp:nowplaying',
    doc: { id: S.doc.id, title: S.doc.title, category: S.doc.category },
    scene: { index: S.i, count: S.scenes.length, title: sc.title },
    // A film that ends while following along keeps the bar, so "Back to film" leads to its end card.
    caption: S.ended ? (S.doc.quiz?.length ? 'The course has ended. Its quiz is in Kino.' : 'The film has ended.') : sentences(sc.narration)[S.sentence] || '',
    playing: S.playing && !S.ended, ended: S.ended,
    route: filmRoute(CAT, S.doc.id, sc.id, SHELL),
  });
}
function nowPlayingStop() {
  clearTimeout(np.timer); np.timer = 0; np.state = '';
  if (np.live) { np.live = false; toShell({ type: 'prp:nowplaying', stopped: true }); }
}
// The bar's buttons, from the shell only.
function control(e) {
  if (e.source !== window.parent || e.origin !== location.origin || e.data?.type !== 'prp:kino-control' || !S.doc) return;
  const act = { play: () => S.playing || play(), pause, stop, next: () => go(S.i + 1), prev: () => go(S.i - 1) }[e.data.action];
  if (act) act();
}

/* ---------- captions ---------- */
function renderCaption(sc) {
  const words = tokens(sc.narration);
  $('#cap-no').textContent = `${sc.partTitle ? `Part ${sc.partNo} · ` : ''}Scene ${S.i + 1}`;
  $('#cap-title').textContent = sc.title;
  $('#cap-text').innerHTML = words.map((w, k) => `<span class="w" data-i="${k}">${esc(w)}</span>`).join(' ');
  S.words = [...$('#cap-text').querySelectorAll('.w')]; S.lit = null;
  S.runs = sentenceRuns(sc.narration);
  markSentence(S.sentence);
  const foot = [];
  if (sc.link) { const info = moduleInfo(sc.link); foot.push(`<button type="button" class="prp-btn sm" data-open-link><span class="prp-code" data-suite="${esc(info.suite)}">${esc(info.code)}</span>${esc(sc.link.label)} ↗</button>`); }
  const cites = [].concat(sc.cites || []).map(id => S.doc.sources.find(s => s.id === id)).filter(Boolean);
  if (cites.length) foot.push(`<span>Sources: ${cites.map(s => `<a href="#src-${esc(s.id)}" data-src="${esc(s.id)}">${esc(shortCite(s))}</a>`).join('; ')}</span>`);
  foot.push('<span class="legend-key" aria-hidden="true"></span>'); // the map key, shown here on phones (see kino.css)
  const pts = (sc.focus?.points || []).map(p => p[2]).filter(Boolean);
  if (pts.length && sc.visual?.kind === 'map') foot.push(`<span class="key">On the map: ${pts.map(esc).join(' · ')}</span>`);
  $('#cap-foot').innerHTML = foot.join('');
}
const legendKey = html => { const k = $('#cap-foot .legend-key'); if (k) k.innerHTML = html; };
function highlight(k) {
  if (k >= 0 && S.lit && S.lit === S.words[k]) return; // the same word, reported again (each frame of an estimate)
  if (S.lit) S.lit.classList.remove('on');
  S.lit = k >= 0 ? S.words[k] : null;
  if (S.lit) {
    S.lit.classList.add('on');
    if (!S.lit.classList.contains('cur')) markSentence(Math.max(0, S.runs.findIndex(r => r.includes(k))));
    keepWordInView(S.lit);
  }
  if (k >= 0) updateProgress((k + 1) / S.words.length);
}
/* The sentence box (Split view and full screen): #cap-text keeps every word, but only the sentence being read shows
   (its words carry .cur), in a box three lines tall that never changes height. A sentence that needs more lines is not
   set smaller: as each word is said, if its line is outside the box, the box scrolls by whole lines to it. */
const sentenceMode = () => S.split || !!fs?.on;
function markSentence(k) {
  S.shown = k;
  const run = new Set(S.runs[k] || S.runs[0] || []);
  S.words.forEach((w, i) => w.classList.toggle('cur', run.has(i)));
  $('#cap-text').scrollTop = 0;
}
function keepWordInView(w) {
  const box = $('#cap-text');
  if (!w || !sentenceMode() || box.scrollHeight <= box.clientHeight + 1) return;
  const lh = parseFloat(getComputedStyle(box).lineHeight) || 26;
  const b = box.getBoundingClientRect(), r = w.getBoundingClientRect();
  const top = Math.floor((r.top + r.height / 2 - b.top + box.scrollTop) / lh) * lh;
  if (top < box.scrollTop - 0.5 || top + lh > box.scrollTop + box.clientHeight + 0.5) box.scrollTop = Math.min(top, box.scrollHeight - box.clientHeight);
}

/* ---------- chapters, progress ---------- */
function renderChapters() {
  let part = null;
  $('#chapter-list').innerHTML = S.scenes.map((sc, i) => {
    const head = sc.part && sc.part !== part ? `<li class="part">Part ${sc.partNo} · ${esc(sc.partTitle)}</li>` : ''; part = sc.part;
    const secs = Math.max(estimateSeconds(sc.narration, BASE_RATE), sc.seconds || 0) + 1.5;
    return `${head}<li><button type="button" data-i="${i}"><span class="no">${i + 1}</span><span>${esc(sc.title)}${sc.link ? ' <span class="lk" title="Opens a place in Vitruvian Manager">↗</span>' : ''}</span><span class="t">${mmss(secs)}</span></button></li>`;
  }).join('');
}
function updateChapters() {
  for (const b of document.querySelectorAll('#chapter-list button')) { if (+b.dataset.i === S.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); }
  // Keep the current chapter in view inside the list, without scrolling the page (on phones the list sits below).
  const box = $('.kn-chapters'), cur = $('#chapter-list [aria-current]');
  if (cur && box.scrollHeight > box.clientHeight + 4) {
    const top = cur.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 60) box.scrollTop = top - box.clientHeight / 2;
  }
}
function renderProgress() {
  $('#progress').innerHTML = S.scenes.map((sc, i) => `<button type="button" data-i="${i}" title="${i + 1}. ${esc(sc.title)}" aria-label="Scene ${i + 1}: ${esc(sc.title)}"><i></i></button>`).join('');
}
function updateProgress(frac) {
  document.querySelectorAll('#progress button').forEach((b, i) => { b.classList.toggle('done', i < S.i); b.classList.toggle('now', i === S.i); b.querySelector('i').style.width = i === S.i ? `${Math.round(frac * 100)}%` : '0'; });
}

/* ---------- about, links, sources, quiz ---------- */
function renderAbout() {
  const d = S.doc;
  $('#doc-summary').textContent = d.summary;
  $('#doc-subjects').innerHTML = d.subjects.map(s => `<span class="prp-chip" data-qid="${esc(s.qid)}">${esc(s.label)}</span>`).join('');
  const seen = new Set(), links = [];
  S.scenes.forEach((sc, i) => { if (sc.link && !seen.has(sc.link.at)) { seen.add(sc.link.at); links.push([sc.link, i]); } });
  $('#links-hint').textContent = embedded ? 'Opens in Vitruvian Manager' : 'Opens Vitruvian Manager in a new tab';
  $('#doc-links').innerHTML = links.map(([l, i]) => { const info = moduleInfo(l); return `<li><button type="button" data-link-scene="${i}"><span class="prp-code code" data-suite="${esc(info.suite)}">${esc(info.code)}</span><span>${esc(l.label)} <small>· scene ${i + 1}</small></span></button></li>`; }).join('') || '<li class="prp-muted">No links in this documentary.</li>';
}
function renderSources() {
  const fmt = s => {
    const who = s.author ? `${esc(s.author)}${s.year ? ` (${s.year})` : ''}. ` : '';
    const where = s.kind === 'article' ? `${esc(s.journal)}.` : s.publisher ? `${esc(s.publisher)}${s.kind === 'web' && s.year ? `, ${s.year}` : ''}.` : '';
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
    const url = s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.kind === 'wikidata' ? 'Wikidata' : host(s.url))} ↗</a>` : '';
    return `${who}<cite>${esc(s.title)}</cite>. ${where}${url}`;
  };
  const media = [...new Set(S.scenes.filter(s => s.visual?.kind === 'portrait').map(s => s.visual.file || S.media.qids?.[s.visual.qid]).filter(Boolean))].map(f => S.media.files?.[f]).filter(Boolean);
  $('#doc-sources').innerHTML = `<p><b>Sources for this documentary.</b> The narration is Vitruvian Manager's own summary of these works; facts were checked against Wikidata.</p>
    <ol>${S.doc.sources.map(s => `<li id="src-${esc(s.id || '')}">${fmt(s)}</li>`).join('')}</ol>
    ${media.length ? `<p><b>Images.</b> ${media.map(m => `<a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.title || 'Image')}</a> (${esc(m.artist || m.credit || 'unknown author')}; ${esc(m.licence || 'see licence')})`).join('; ')}, via Wikimedia Commons.</p>` : ''}`;
}
function renderQuiz() {
  const quiz = S.doc.quiz || [];
  $('#quiz').hidden = true;
  if (!quiz.length) { $('#quiz-body').innerHTML = ''; return; }
  $('#quiz-body').innerHTML = quiz.map((q, k) => `<fieldset data-q="${k}"><legend>${k + 1}. ${esc(q.q)}</legend>${q.options.map((o, j) => `<label><input type="radio" name="q${k}" value="${j}"> ${esc(o)}</label>`).join('')}<p class="why" hidden></p></fieldset>`).join('')
    + '<button type="button" class="prp-btn primary" id="quiz-check">Check answers</button> <span class="prp-muted" id="quiz-score"></span>';
  $('#quiz-check').onclick = () => {
    let right = 0;
    quiz.forEach((q, k) => {
      const f = document.querySelector(`fieldset[data-q="${k}"]`), pick = f.querySelector('input:checked'), ok = pick && +pick.value === q.answer, why = f.querySelector('.why');
      if (ok) right++;
      why.hidden = false; why.className = `why ${ok ? 'right' : 'wrong'}`;
      why.textContent = `${ok ? 'Right.' : `The answer is: ${q.options[q.answer]}.`}${q.explain ? ' ' + q.explain : ''}`;
    });
    $('#quiz-score').textContent = `${right} of ${quiz.length} right.`;
  };
}

/* ---------- links into Vitruvian Manager ---------- */
// Inside the shell, a link moves the shell to a route: shellGo (design/prp-split.js) asks the shell (see README.md),
// and sets its address directly if an older shell does not answer; in another page's pane it only asks that page.
function navigate(link, { user = false } = {}) {
  if (link.suite === 'kino') {
    if (!user) return; // following along never leaves the film for another film
    const u = new URL(link.at, SHELL), cat = u.searchParams.get('cat');
    if (cat === CAT) { location.hash = u.hash; return; }
    // Another category plays in its own submodule's frame: go there through the shell, leaving this film paused.
    if (embedded && kinoModule(cat)?.url) { pause(); nowPlayingStop(); shellGo(shellHash(link, SHELL)); return; }
    location.href = u.href;
    return;
  }
  const hash = shellHash(link, SHELL);
  if (embedded) { shellGo(hash); return; }
  const url = shellUrl(link, SHELL);
  if (!S.follow) { window.open(url, '_blank', 'noopener'); return; }
  if (S.followWin && !S.followWin.closed) { try { S.followWin.location.href = url; return; } catch { /* reopen below */ } }
  S.followWin = window.open(url, 'prp-kino-follow');
  if (!S.followWin) note('The browser blocked the companion tab. Allow pop-ups for this site to follow along, or use each scene’s link.');
}
function setFollow(on) {
  if (inSide) on = false;
  // Follow takes the viewer to the place; Split view brings the place to the film. One at a time: with both, the shell
  // would leave Kino and hide the pane it had just filled.
  if (on && S.split) setSplit(false);
  S.follow = on; $('#follow').setAttribute('aria-pressed', String(on));
  nowPlaying(); // the shell's now-playing bar appears (or goes, with Follow off)
  if (!on) { note(''); return; }
  const sc = S.scenes[S.i];
  if (embedded) note('Following along: each scene with a place in Vitruvian Manager opens it while the narration carries on. The bar at the bottom of Vitruvian Manager shows the captions and controls; Back to film returns here.');
  else { note('Following along in a second tab: it moves to each scene’s place in Vitruvian Manager.'); if (!S.followWin || S.followWin.closed) { S.followWin = window.open(sc?.link ? shellUrl(sc.link, SHELL) : SHELL, 'prp-kino-follow'); if (!S.followWin) note('The browser blocked the companion tab. Allow pop-ups for this site to follow along.'); } }
  if (sc?.link && embedded) navigate(sc.link);
}
function note(msg, inCatalogue = false) {
  $('#note').textContent = msg;
  if (inCatalogue && msg) $('#cards').insertAdjacentHTML('afterbegin', `<div class="kn-empty">${esc(msg)}</div>`);
}

/* ---------- Split view: each scene's place in Vitruvian Manager beside the film (K1) ----------
   The pane is built by design/prp-split.js: one frame per submodule (the six shown last), moved by hash where it can
   be, given the player's theme; a card where a page cannot be framed. It shows the place of the scene on screen and
   follows the film, unless it is held (H, or a place chosen by hand). */
let pane = null, split = null, fs = null;
function writeAddress() {
  if (!S.doc) return;
  const sc = S.scenes[S.i];
  history.replaceState(null, '', location.pathname + location.search + kinoViewHash(S.doc.id, sc?.id, { split: S.split }));
}
/** A link as a place for the pane: a submodule's page, or (a scene that points to another film) a film card. */
function placeFor(link, label) {
  if (/^kino-/.test(link.module)) {
    const u = new URL(link.at, SHELL), film = S.index.docs.find(d => d.id === readKinoHash(u.hash).doc);
    return { film: true, module: link.module, suite: 'kino', name: 'Kino', code: 'KN', label: film?.title || link.label, page: u.href, href: u.href, hash: '', onOpen: () => navigate(link, { user: true }) };
  }
  const info = moduleInfo(link);
  return linkPlace(link, SHELL, { name: info.name, code: info.code, label });
}
function ensurePane() {
  pane ||= sidePane($('#side'), {
    registry: S.registry, base: SHELL, embedded, toShell: shellGo,
    holdTitle: 'Hold: keep this page while the film moves on (H)', closeLabel: 'Close Split view (V)',
    onHold: on => setHold(on), onClose: () => setSplit(false),
    onOpen: () => { fs?.exit(); }, // "Open" does once what Follow does at every scene, so full screen ends
    onBlocked: url => note(`The browser blocked the new tab. Allow pop-ups for this site, or open ${url}`),
  });
  return pane;
}
function showLink(link, label) {
  if (!S.split) return;
  ensurePane();
  if (!link) pane.clear('This scene has no place in Vitruvian Manager.'); else pane.show(placeFor(link, label));
  markRelated();
}
function showScenePlace() { if (S.split && !S.hold && S.doc) showLink(S.scenes[S.i]?.link || null); }
function setHold(on) {
  S.hold = !!on && S.split;
  pane?.setHold(S.hold);
  if (!S.hold) showScenePlace(); // let go: back to the scene's place
}
/** Shows a place chosen by hand (the scene's place button, O, the list under the player, a module card, Related),
    turning Split view on if it was off; it is held unless it is the scene's own place. */
function showHeld(link, label, always = false) {
  if (!S.split) setSplit(true, { show: false });
  const own = S.scenes[S.i]?.link;
  S.hold = always || !(own && link && own.at === link.at && own.module === link.module);
  pane.setHold(S.hold);
  showLink(link, label);
  // On a narrow screen the pane is under the player: bring it into view.
  if ($('#theatre').dataset.dir === 'column' && !fs?.on) $('#side').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}
function setSplit(on, { show = true, remember = true } = {}) {
  on = !!on && !inSide;
  const was = S.split;
  S.split = on;
  if (remember) store.set('prp.kino.split', on);
  $('#split').setAttribute('aria-pressed', String(on));
  $('#theatre').dataset.side = on ? 'on' : 'off';
  $('.kn-grid').classList.toggle('split', on);
  $('#side').hidden = !on;
  if (on) {
    if (S.follow) setFollow(false);
    ensurePane(); split?.update();
    if (!was) { S.hold = false; pane.setHold(false); }
    if (show) showScenePlace();
  } else {
    if (S.pageOnly) leavePageOnly({ restore: false }); // nothing left to show on its own
    pane?.drop(); // no frame stays behind: a page in a hidden frame keeps running
    S.hold = false; pane?.setHold(false);
  }
  markSentence(S.shown);
  writeAddress();
}

/* ---------- Page only: the scene's place in Vitruvian Manager alone, full screen (Jude, 12 November 2026) ----------
   Full screen (F) shows the film, beside the pane with Split view on; Page only (G, its button beside full screen)
   fills the screen with the pane alone, over the player's controls. The film plays on unseen, so the pane follows the
   scene as it does in Split view (unless it is held). The same button or key, Escape, or F brings the player back as
   it was: Split view on or off as before. It turns Split view on for its time if it was off. */
function setPageOnly(on) {
  on = !!on && !inSide && !!fs?.supported;
  if (on === S.pageOnly) return;
  if (!on) { leavePageOnly(); return; }
  S.splitBefore = S.split; S.fsBefore = fs.on;
  if (!S.split) setSplit(true, { remember: false });
  S.pageOnly = true;
  markPageOnly();
  // A browser that refuses full screen (no click or key behind it) leaves the player as it was.
  if (!fs.on) fs.toggle().then(() => { if (S.pageOnly && !fs.on) leavePageOnly(); });
}
function leavePageOnly({ restore = true } = {}) {
  if (!S.pageOnly) return;
  S.pageOnly = false;
  markPageOnly();
  // Back to the film's full screen if Page only began there; otherwise out of full screen.
  if (fs?.on && !(restore && S.fsBefore)) fs.exit();
  if (restore && !S.splitBefore && S.split) setSplit(false, { remember: false });
}
function markPageOnly() {
  $('#theatre').toggleAttribute('data-page-only', S.pageOnly);
  const b = $('#pageonly');
  b.setAttribute('aria-pressed', String(S.pageOnly));
  b.title = S.pageOnly ? 'Back to the film (G)' : 'Page only: this scene\'s page in Vitruvian Manager on its own, full screen, following the film (G)';
}
/** The scene's place button, O, the list under the player and a module card: as before, the shell moves there (or a
    new tab opens); with Split view on, or in full screen, the pane shows it instead. */
function openPlace(link) {
  if (!link) return;
  if (!inSide && (S.split || fs?.on)) { showHeld(link); return; }
  navigate(link, { user: true });
}

/* ---------- Related screens (K2): a strip under the film, and See more ---------- */
const shards = new Map();
const shard = n => {
  // A missing file on the live site is answered with a page, not an error: a body that is not JSON counts as not loaded.
  if (!shards.has(n)) shards.set(n, fetch(`${LAKE}e/${n}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return shards.get(n);
};
async function entitiesFor(qids) {
  const m = new Map();
  await Promise.all(qids.map(async q => { const s = await shard(shardOf(q)); m.set(q, s?.[q] || null); }));
  return m;
}
// The site's tables of wars and countries, which tag a scene with the war or the country its link names and the
// countries on its map (kino/lib/related.js, tagTables): fetched once, when Related is first wanted; either may fail.
let tablesP = null;
const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
const tagTablesNow = () => (tablesP ||= Promise.all([json(`${SHELL}battlefield/focus/data/index.json`), json(`${SHELL}national/data/brief.json`)]).then(([w, b]) => tagTables(w, b)));
let relSeq = 0;
async function updateRelated() {
  if (!S.doc || inSide || (!S.related && !moreOpen())) return;
  const seq = ++relSeq, i = S.i, sc = S.scenes[i], doc = S.doc;
  const tables = await tagTablesNow();
  const things = sceneEntities(sc, doc.subjects, tables), ents = await entitiesFor(things.qids);
  if (seq !== relSeq || S.doc !== doc || S.i !== i) return;
  S.rel = relatedPlaces(S.scenes, i, { subjects: doc.subjects, entities: ents, registry: S.registry, shell: SHELL, tables });
  S.relOwn = things.own;
  renderRelated();
}
const relPlace = it => placeFor(it.link, it.place);
function relText(it) { const p = relPlace(it); return { code: p.code || it.link.suite.toUpperCase(), suite: p.suite, name: p.name, label: p.label || p.name }; }
function renderRelated() {
  $('#related-chips').innerHTML = S.rel.slice(0, CHIPS).map((it, k) => {
    const t = relText(it);
    return `<button type="button" class="kn-rel" data-rel="${k}" title="${esc(`${t.name} · ${t.label}`)}"><span class="prp-code" data-suite="${esc(t.suite)}">${esc(t.code)}</span><span class="t">${esc(t.label)}</span></button>`;
  }).join('');
  $('#related-n').textContent = String(S.rel.length);
  $('#related-see').setAttribute('aria-label', `See all ${S.rel.length} related screens`);
  if (moreOpen()) renderMore();
  markRelated();
}
// The chip or row of the place the pane shows is marked.
function markRelated() {
  const at = S.split ? pane?.current?.page : null;
  document.querySelectorAll('[data-rel]').forEach(b => { const it = S.rel[+b.dataset.rel]; if (it && at && relPlace(it).page === at) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
}
function renderMore() {
  const groups = [['scene', 'This scene'], ['tagged', S.relOwn ? 'Tagged in the Master Index' : 'Tagged in the Master Index, from the film’s subjects'], ['film', 'This film']];
  $('#related-more-hint').textContent = `${S.rel.length} screens · scene ${S.i + 1}`;
  $('#related-more-body').innerHTML = groups.map(([g, head]) => {
    const rows = S.rel.map((it, k) => [it, k]).filter(([it]) => it.group === g);
    const body = rows.length ? rows.map(([it, k]) => {
      const t = relText(it), p = relPlace(it);
      return `<li><button type="button" data-rel="${k}"><span class="prp-code" data-suite="${esc(t.suite)}">${esc(t.code)}</span><span class="t"><b>${esc(t.name)}</b> · ${esc(t.label)}</span>${it.scene && g === 'film' ? `<small>scene ${it.scene}</small>` : ''}</button><a href="${esc(p.page)}" target="_blank" rel="noopener" aria-label="Open ${esc(`${t.name} · ${t.label}`)} in a new tab">Open ↗</a></li>`;
    }).join('') : `<li class="none">${g === 'tagged' ? 'The Master Index records no other place for what this scene names.' : 'None.'}</li>`;
    return `<section data-group="${g}"><h4>${esc(head)}</h4><ul>${body}</ul></section>`;
  }).join('');
  markRelated();
}
const moreOpen = () => !$('#related-more').hidden;
function placeMore() {
  // A panel over the lower part of the player, just above the strip.
  const th = $('#theatre').getBoundingClientRect(), strip = $('#related-strip').getBoundingClientRect(), more = $('#related-more');
  more.style.bottom = `${Math.max(0, th.bottom - strip.top + 6)}px`;
  more.style.maxHeight = `${Math.max(160, strip.top - th.top - 12)}px`;
}
async function openMore() {
  if (!S.rel.length) await updateRelatedNow();
  renderMore();
  $('#related-more').hidden = false;
  $('#related-see').setAttribute('aria-expanded', 'true');
  placeMore();
  $('#related-more').focus();
}
async function updateRelatedNow() { const was = S.related; S.related = true; await updateRelated(); S.related = was; }
function closeMore({ focus = true } = {}) {
  if (!moreOpen()) return;
  $('#related-more').hidden = true;
  $('#related-see').setAttribute('aria-expanded', 'false');
  if (focus && S.related) $('#related-see').focus();
}
function setRelated(on) {
  S.related = !!on && !inSide;
  store.set('prp.kino.related', S.related);
  $('#related').setAttribute('aria-expanded', String(S.related));
  $('#related-strip').hidden = !S.related;
  if (!S.related) closeMore({ focus: false });
  else updateRelated();
}
/** A screen chosen in the strip or the panel shows in the pane, held, so the next scene does not take it away; Split
    view turns on if it was off (and Follow off). The same everywhere: in a window, in full screen, in the shell. */
function chooseRelated(k) {
  const it = S.rel[k];
  if (!it) return;
  closeMore();
  showHeld(it.link, it.place, true);
}

/* ---------- voice, music and settings ---------- */
// This device's voices (saved by name, as always) and, once the site's voice proxy says it is set up, its online voices,
// each group labelled for what it is. Without online voices the list is exactly as before.
function fillVoices() {
  const list = voiceList(), chosen = pickVoice(), web = knownOnline(), saved = store.get('jdpi.doc.voice', null);
  const pickWeb = web.find(v => v.id === saved) || (!list.length ? web[0] : null); // as the reader chooses (lib/voice.js)
  const opt = (value, label, on) => `<option value="${esc(value)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  const here = list.map(v => opt(v.name, v.name, !pickWeb && v === chosen)).join('');
  $('#voice-pick').innerHTML = web.length
    ? `<optgroup label="This device">${here || '<option value="" disabled>No voices installed</option>'}</optgroup><optgroup label="Azure (online)">${web.map(v => opt(v.id, v.label, v === pickWeb)).join('')}</optgroup>`
    : here || '<option>No voices installed</option>';
}
function setVoice(on) {
  S.voice = on; store.set('prp.kino.voice', on);
  $('#voice').setAttribute('aria-pressed', String(on));
  $('#voice').title = on ? 'Voice on: press for captions only (C)' : 'Captions only: press to hear the narration (C)';
  $('#voice').querySelector('.lbl-text').textContent = on ? 'Voice' : 'Captions only';
  setPlayUi(); restartSentence();
}
function setMusic(on) {
  S.music = on; store.set('prp.kino.music', on);
  $('#music').setAttribute('aria-pressed', String(on));
  music.set(on && !!S.doc);
  if (!on) $('#now-playing').textContent = 'Music is off.';
}

/* ---------- start ---------- */
// Inside the shell, leaving Kino hides this frame: stop talking unless the viewer chose to follow along. The frame's
// window keeps its size when the shell hides it (innerWidth does not become 0 in Edge); the theatre's box does.
const hidden = () => { const r = $('#theatre').getBoundingClientRect(); return r.width === 0 && r.height === 0; };
function check() { if (S.playing && !S.follow && hidden()) pause(); }
function wire() {
  reader = new Reader({ onWord: highlight, onSentence: k => { S.sentence = k; markSentence(k); nowPlaying(); check(); }, onBackend: (id, why) => {
    // The online voice could not carry on, so this device's voice reads on from the same sentence: say so, once.
    if (!why || id !== 'webspeech' || S.voiceNoted) return;
    S.voiceNoted = true;
    note(why.reason === 'quota' ? 'The online voice has used today’s allowance, so this device’s voice reads on.' : 'The online voice is not answering, so this device’s voice reads on.');
  } });
  // The shell's now-playing bar reaches play() by postMessage, which arrives after the tap is over: too late for iOS to let
  // an online voice's clips play. So the shell calls this first, synchronously inside its click (same origin; shell.js).
  window.prpKinoUnlock = () => reader.unlock();
  music = new Music({ onTrack: t => { $('#now-playing').innerHTML = `♫ ${esc(t.composer)}: ${esc(t.title)} · <a href="${esc(t.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>`; } });
  stage = new Stage($('#stage'), { media: S.media, base: 'data/', embedded, moduleInfo, onLink: openPlace, onLegend: legendKey });

  $('#find').oninput = renderCatalogue; $('#sort').onchange = renderCatalogue;
  $('#back').onclick = e => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); closeDoc(); };
  $('#play').onclick = toggle; $('#bigplay').onclick = play;
  $('#prev').onclick = () => go(S.i - 1); $('#next').onclick = () => go(S.i + 1);
  $('#progress').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); };
  $('#chapter-list').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); };
  $('#cap-foot').onclick = e => {
    if (e.target.closest('[data-open-link]')) return openPlace(S.scenes[S.i].link);
    // The page's hash is the film's address, so source links scroll instead of changing it.
    const a = e.target.closest('[data-src]');
    if (a) { e.preventDefault(); document.getElementById(`src-${a.dataset.src}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }
  };
  $('#doc-links').onclick = e => { const b = e.target.closest('[data-link-scene]'); if (b) openPlace(S.scenes[+b.dataset.linkScene].link); };
  $('#speed').value = String(S.speed);
  $('#speed').onchange = e => { S.speed = +e.target.value; store.set('prp.kino.speed', S.speed); restartSentence(); };
  $('#voice').onclick = () => setVoice(!S.voice);
  $('#music').onclick = () => setMusic(!S.music);
  $('#follow').onclick = () => setFollow(!S.follow);
  // Full screen: the stage is fitted, 16:9, as large as the screen allows (kino.css), beside the pane with Split view on.
  fs = fullScreen($('#theatre'), { onChange: on => {
    const b = $('#fullscreen');
    b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen'); b.title = on ? 'Leave full screen (F)' : 'Full screen (F)';
    if (!on && S.pageOnly) { S.fsBefore = false; leavePageOnly(); } // Escape (or F) ends Page only too
    markSentence(S.shown);
    if (moreOpen()) requestAnimationFrame(placeMore);
  } });
  $('#fullscreen').hidden = !fs.supported;
  $('#fullscreen').onclick = () => { if (S.pageOnly) { S.fsBefore = false; leavePageOnly(); } else fs.toggle(); };
  // Page only: not offered without full screen, nor in another page's pane (which has no pane of its own).
  $('#pageonly').hidden = !fs.supported || inSide;
  $('#pageonly').onclick = () => setPageOnly(!S.pageOnly);
  markPageOnly();
  // Split view, Hold and Related: not offered in another page's pane.
  $('#theatre').classList.add('prp-split'); $('#theatre').dataset.side = 'off'; $('#side').hidden = true;
  if (inSide) for (const id of ['#split', '#related', '#follow']) $(id).hidden = true;
  else {
    split = splitter($('#theatre'), $('#side'), { share: 40, min: 25, max: 60, minMain: 480, minSide: 328, rowFrom: 901, storeKey: 'prp.split.kino', label: 'Resize the film and the Vitruvian Manager page' });
    $('#split').onclick = () => setSplit(!S.split);
    $('#related').onclick = () => setRelated(!S.related);
    $('#related-hide').onclick = () => { setRelated(false); $('#related').focus(); };
    $('#related-see').onclick = () => (moreOpen() ? closeMore() : openMore());
    $('#related-close').onclick = () => closeMore();
    $('#related-chips').onclick = e => { const b = e.target.closest('[data-rel]'); if (b) chooseRelated(+b.dataset.rel); };
    $('#related-more-body').onclick = e => { const b = e.target.closest('button[data-rel]'); if (b) chooseRelated(+b.dataset.rel); };
    // A click outside the panel closes it (after the click, so the focus can go back to See more).
    document.addEventListener('click', e => { if (moreOpen() && !e.target.closest?.('#related-more, #related-see')) closeMore(); });
    setRelated(S.related);
  }
  $('#voice-pick').onchange = e => { store.set('jdpi.doc.voice', e.target.value); reader.unlock(); restartSentence(); };
  setVoice(S.voice); $('#music').setAttribute('aria-pressed', String(S.music));
  if (hasSpeech()) { fillVoices(); onVoices(fillVoices); }
  // The online voices are asked for when the settings open (and by the reader when one is chosen), not on every load.
  $('#settings').addEventListener('toggle', () => { if ($('#settings').open) onlineVoices().then(fillVoices); });
  // No voice on this device: captions only, unless the site's online voice can read instead.
  setTimeout(async () => {
    if (hasSpeech() && voices().length) return;
    if ((await onlineVoices()).length) { fillVoices(); return; }
    $('#voice').disabled = true; if (S.voice) { S.voice = false; $('#voice').setAttribute('aria-pressed', 'false'); $('#voice').querySelector('.lbl-text').textContent = 'Captions only'; } note('This browser has no speech voices, so Kino plays with captions only.');
  }, 1600);

  document.addEventListener('keydown', e => {
    // A key something else has handled (the divider's arrows, Home and End) is left alone.
    if (!S.doc || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape' && moreOpen()) { e.preventDefault(); closeMore(); return; } // in full screen the browser keeps Escape
    const view = inSide ? {} : {
      v: () => setSplit(!S.split), V: () => setSplit(!S.split), t: () => setRelated(!S.related), T: () => setRelated(!S.related),
      h: () => S.split && setHold(!S.hold), H: () => S.split && setHold(!S.hold), p: () => setFollow(!S.follow), P: () => setFollow(!S.follow),
      g: () => !$('#pageonly').hidden && setPageOnly(!S.pageOnly), G: () => !$('#pageonly').hidden && setPageOnly(!S.pageOnly),
    };
    const k = e.key, act = {
      ' ': toggle, k: toggle, K: toggle, ArrowLeft: () => go(S.i - 1), ArrowRight: () => go(S.i + 1), j: () => go(S.i - 1), l: () => go(S.i + 1), Home: () => go(0), End: () => go(S.scenes.length - 1),
      c: () => setVoice(!S.voice), C: () => setVoice(!S.voice), m: () => setMusic(!S.music), M: () => setMusic(!S.music),
      f: () => $('#fullscreen').click(), F: () => $('#fullscreen').click(), o: () => openPlace(S.scenes[S.i]?.link), O: () => openPlace(S.scenes[S.i]?.link),
      '<': () => stepSpeed(-1), ',': () => stepSpeed(-1), '>': () => stepSpeed(1), '.': () => stepSpeed(1), '?': () => { $('#settings').open = !$('#settings').open; },
      ...view,
    }[k];
    if (!act) return;
    if (k === ' ' && e.target.closest('button, a, summary')) return; // let Space press a focused control
    e.preventDefault(); act();
  });
  window.addEventListener('resize', check);
  new IntersectionObserver(check).observe($('#stage'));
  // In a background browser tab the scene timers are throttled while the voice carries on, so the film would drift
  // out of step: it pauses instead, following along or not, and Resume is there when the tab is back.
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing) pause(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  window.addEventListener('message', control);
  window.addEventListener('pagehide', nowPlayingStop);
}
function stepSpeed(d) {
  const opts = [...$('#speed').options].map(o => +o.value), k = Math.max(0, Math.min(opts.length - 1, opts.indexOf(S.speed) + d));
  $('#speed').value = String(opts[k]); $('#speed').dispatchEvent(new Event('change'));
}

(async function init() {
  try {
    const [index, media, registry] = await Promise.all([
      fetch('data/index.json').then(r => r.json()),
      fetch('data/media.json').then(r => r.json()).catch(() => ({ files: {}, qids: {} })),
      fetch('../registry.json').then(r => r.json()).catch(() => null),
    ]);
    S.index = index; S.media = media; S.registry = registry;
  } catch (e) {
    $('#cat-meta').textContent = `Kino could not load its catalogue (${e.message}). Serve the folder over HTTP.`; return;
  }
  wire(); renderHeader(); renderCatalogue();
  await route();
})();

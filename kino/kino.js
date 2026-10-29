/* Kino, PRP's documentary module: the catalogue and player for one category (kino/index.html?cat=<category>).
   Deep links: #doc=<id>&s=<scene id or number>. Scripts live in data/<category>/<id>.json (see README.md);
   data/index.json, media.json and iso.json are built by scripts/build-index.mjs. */
import { CATEGORIES, categoryOf, flatScenes, shortCite } from './lib/format.js';
import { tokens, sentences, estimateSeconds } from './lib/text.js';
import { shellHash, shellUrl, readKinoHash, kinoHash, filmRoute } from './lib/links.js';
import { Reader, Music, store, voiceList, pickVoice, onVoices, hasSpeech, voices } from './lib/voice.js';
import { Stage, preview, esc, reduced } from './lib/stage.js';

const $ = s => document.querySelector(s);
const CAT = categoryOf(new URLSearchParams(location.search).get('cat'))?.id || 'wars';
const CATINFO = categoryOf(CAT);
const SHELL = new URL('../', location.href).href; // the PRP root, where the shell lives
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const BASE_RATE = 0.92; // the shell reader's lecture pace
const sleep = ms => new Promise(r => setTimeout(r, ms));
const yr = y => (y < 0 ? `${-y} BC` : String(y));
const era = e => (e[0] === e[1] ? yr(e[0]) : `${yr(e[0])}–${yr(e[1])}`);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const S = {
  index: null, media: { files: {}, qids: {} }, registry: null,
  doc: null, scenes: [], i: 0, playing: false, run: 0, sentence: 0, words: [], lit: null, started: false,
  voice: store.get('prp.kino.voice', true), speed: store.get('prp.kino.speed', 1), music: store.get('prp.kino.music', false), follow: false, followWin: null,
};

/* ---------- PRP registry: names, icons and codes for links ---------- */
function moduleInfo(link) {
  if (link.suite === 'kino') { const c = categoryOf(link.module.replace(/^kino-/, '')); return { name: `Kino · ${c?.name || ''}`, icon: '▶', code: 'KN', suite: 'kino', suiteName: 'Kino' }; }
  const suite = S.registry?.suites.find(s => s.id === link.suite || s.aliases?.includes(link.suite));
  const m = suite?.modules.find(x => x.id === link.module || x.aliases?.includes(link.module));
  return m ? { name: m.name, icon: m.icon, code: suite.code, suite: suite.id, suiteName: suite.name, url: m.url } : { name: link.label.split(' · ')[0], code: link.suite.toUpperCase(), suite: link.suite };
}
// Kino's submodules are "kino-<category>" in registry.json. Once one is live (it has a url), links between categories
// go through the shell so its sidebar and breadcrumb follow; until then they open the page directly.
const kinoModule = id => S.registry?.suites.find(s => s.id === 'kino')?.modules.find(m => m.id === `kino-${id}`) || null;
function catLink(id) {
  if (embedded && kinoModule(id)?.url) return { href: `${SHELL}#/kino/kino-${id}`, target: '_top' };
  return { href: `index.html?cat=${id}`, target: '_self' };
}

/* ---------- header and catalogue ---------- */
function renderHeader() {
  $('#eyebrow-cat').textContent = CATINFO.name;
  $('#cat-title').textContent = CATINFO.name;
  $('#cat-dek').textContent = `${CATINFO.dek} ${CATINFO.courses ? 'Each course plays in parts, with a short quiz at the end.' : 'Each documentary is narrated over maps, timelines and portraits, and every scene can open its place in PRP.'}`;
  const docs = S.index.docs.filter(d => d.category === CAT), mins = docs.reduce((a, d) => a + d.minutes, 0);
  $('#cat-meta').innerHTML = [`<span><b>${docs.length}</b> ${CATINFO.courses ? 'course' : 'documentar'}${docs.length === 1 ? (CATINFO.courses ? '' : 'y') : (CATINFO.courses ? 's' : 'ies')}</span>`,
    docs.length ? `<span><b>${mins}</b> minutes</span>` : '', `<span><b>${S.index.docs.length}</b> in Kino</span>`, '<span>Sources <b>scholarly works · Wikidata · Wikimedia Commons</b></span>',
    `<span>Updated <b>${esc(new Date(S.index.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</b></span>`].filter(Boolean).join('');
  $('#cats').innerHTML = CATEGORIES.map(c => { const l = catLink(c.id), n = S.index.categories.find(x => x.id === c.id)?.count || 0;
    return `<a class="prp-chip" href="${esc(l.href)}" target="${l.target}"${c.id === CAT ? ' aria-current="page"' : ''}>${esc(c.name)} <span class="n">${n}</span></a>`; }).join('');
  $('#see-also').innerHTML = CATEGORIES.filter(c => c.id !== CAT).map(c => { const l = catLink(c.id); return `<a href="${esc(l.href)}" target="${l.target}">Kino · ${esc(c.name)}</a>`; }).join(', ')
    + '. War Focus, Retrospective Battlefield, the Encyclopaedia and the other submodules each documentary links to.';
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
  if (S.doc?.id === doc) { if (s) go(sceneIndex(s)); return; }
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
  S.doc = doc; S.scenes = flatScenes(doc); S.started = false;
  $('#catalogue').hidden = true; $('#player').hidden = false;
  $('.kn-front').classList.add('compact');
  document.title = `${doc.title} · Kino · PRP`;
  $('#doc-title').textContent = doc.title;
  $('#back-label').textContent = `All ${CATINFO.name.toLowerCase()} ${CATINFO.courses ? 'courses' : 'documentaries'}`;
  $('#doc-meta').textContent = `${era(doc.era)} · ${doc.minutes} min · ${S.scenes.length} scenes · ${doc.sources.length} sources${doc.category !== CAT ? ` · ${categoryOf(doc.category)?.name}` : ''}`;
  renderChapters(); renderProgress(); renderAbout(); renderSources(); renderQuiz();
  note('');
  window.scrollTo({ top: 0 });
  go(sceneIndex(sceneRef), { initial: true });
}
function closeDoc() {
  stop(); music?.set(false);
  S.doc = null; S.scenes = [];
  $('#player').hidden = true; $('#catalogue').hidden = false; $('.kn-front').classList.remove('compact');
  document.title = `${CATINFO.name} · Kino · PRP`;
  if (document.fullscreenElement) document.exitFullscreen?.();
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
  history.replaceState(null, '', location.pathname + location.search + kinoHash(S.doc.id, sc.id));
  stage.show(sc, S.doc);
  if (S.follow && sc.link && !initial) navigate(sc.link);
  if (S.playing) runScene(run, S.i, 0);
  nowPlaying();
}
async function runScene(run, i, from) {
  const sc = S.scenes[i], t0 = performance.now();
  if (S.voice && hasSpeech()) music.duck(true);
  const r = await reader.read(sc.narration, { voice: S.voice, rate: rate(), from });
  music.duck(false);
  if (run !== S.run || !S.playing || !r.done) return;
  highlight(-1); updateProgress(1);
  await sleep(Math.max(reduced() ? 600 : 1100, (sc.seconds || 0) * 1000 - (performance.now() - t0)));
  if (run !== S.run || !S.playing) return;
  if (i < S.scenes.length - 1) go(i + 1); else finish();
}
function play() {
  if (!S.doc) return;
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
  card.querySelector('[data-act="sources"]').onclick = () => $('#doc-sources').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
  if (S.doc.quiz?.length) {
    $('#quiz').hidden = false; $('#quiz').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
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
const np = { timer: 0, last: 0, live: false };
const toShell = msg => { try { window.parent.postMessage(msg, location.origin); } catch { /* no shell */ } };
function nowPlaying() {
  if (!embedded) return;
  if (!S.follow || !S.doc) { nowPlayingStop(); return; }
  const wait = np.last + NP_EVERY - Date.now();
  if (wait > 0) { np.timer ||= setTimeout(() => { np.timer = 0; nowPlaying(); }, wait); return; }
  clearTimeout(np.timer); np.timer = 0; np.last = Date.now(); np.live = true;
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
  clearTimeout(np.timer); np.timer = 0;
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
  if (S.lit) S.lit.classList.remove('on');
  S.lit = k >= 0 ? S.words[k] : null;
  if (S.lit) S.lit.classList.add('on');
  if (k >= 0) updateProgress((k + 1) / S.words.length);
}

/* ---------- chapters, progress ---------- */
function renderChapters() {
  let part = null;
  $('#chapter-list').innerHTML = S.scenes.map((sc, i) => {
    const head = sc.part && sc.part !== part ? `<li class="part">Part ${sc.partNo} · ${esc(sc.partTitle)}</li>` : ''; part = sc.part;
    const secs = Math.max(estimateSeconds(sc.narration, BASE_RATE), sc.seconds || 0) + 1.5;
    return `${head}<li><button type="button" data-i="${i}"><span class="no">${i + 1}</span><span>${esc(sc.title)}${sc.link ? ' <span class="lk" title="Opens a place in PRP">↗</span>' : ''}</span><span class="t">${mmss(secs)}</span></button></li>`;
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
  $('#links-hint').textContent = embedded ? 'Opens in PRP' : 'Opens PRP in a new tab';
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
  $('#doc-sources').innerHTML = `<p><b>Sources for this documentary.</b> The narration is PRP's own summary of these works; facts were checked against Wikidata.</p>
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

/* ---------- links into PRP ---------- */
// Inside the shell: move the shell to a route. The shell listens for this (see README.md); until it does, move the
// shell's address directly.
function shellGo(hash) {
  let before = null; try { before = window.top.location.hash; } catch { /* the shell is on another origin */ }
  window.parent.postMessage({ type: 'prp:navigate', hash }, location.origin); // the shell only accepts its own origin
  setTimeout(() => { try { if (before !== null && window.top.location.hash === before) window.top.location.hash = hash; } catch { /* only the listener can */ } }, 350);
}
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
  S.follow = on; $('#follow').setAttribute('aria-pressed', String(on));
  nowPlaying(); // the shell's now-playing bar appears (or goes, with Follow off)
  if (!on) { note(''); return; }
  const sc = S.scenes[S.i];
  if (embedded) note('Following along: each scene with a place in PRP opens it while the narration carries on. The bar at the bottom of PRP shows the captions and controls; Back to film returns here.');
  else { note('Following along in a second tab: it moves to each scene’s place in PRP.'); if (!S.followWin || S.followWin.closed) { S.followWin = window.open(sc?.link ? shellUrl(sc.link, SHELL) : SHELL, 'prp-kino-follow'); if (!S.followWin) note('The browser blocked the companion tab. Allow pop-ups for this site to follow along.'); } }
  if (sc?.link && embedded) navigate(sc.link);
}
function note(msg, inCatalogue = false) {
  $('#note').textContent = msg;
  if (inCatalogue && msg) $('#cards').insertAdjacentHTML('afterbegin', `<div class="kn-empty">${esc(msg)}</div>`);
}

/* ---------- voice, music and settings ---------- */
function fillVoices() {
  const list = voiceList(), chosen = pickVoice();
  $('#voice-pick').innerHTML = list.map(v => `<option${v === chosen ? ' selected' : ''}>${esc(v.name)}</option>`).join('') || '<option>No voices installed</option>';
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
function wire() {
  reader = new Reader({ onWord: highlight, onSentence: k => { S.sentence = k; nowPlaying(); } });
  music = new Music({ onTrack: t => { $('#now-playing').innerHTML = `♫ ${esc(t.composer)}: ${esc(t.title)} · <a href="${esc(t.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>`; } });
  stage = new Stage($('#stage'), { media: S.media, base: 'data/', embedded, moduleInfo, onLink: l => navigate(l, { user: true }), onLegend: legendKey });

  $('#find').oninput = renderCatalogue; $('#sort').onchange = renderCatalogue;
  $('#back').onclick = e => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); closeDoc(); };
  $('#play').onclick = toggle; $('#bigplay').onclick = play;
  $('#prev').onclick = () => go(S.i - 1); $('#next').onclick = () => go(S.i + 1);
  $('#progress').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); };
  $('#chapter-list').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) go(+b.dataset.i); };
  $('#cap-foot').onclick = e => {
    if (e.target.closest('[data-open-link]')) return navigate(S.scenes[S.i].link, { user: true });
    // The page's hash is the film's address, so source links scroll instead of changing it.
    const a = e.target.closest('[data-src]');
    if (a) { e.preventDefault(); document.getElementById(`src-${a.dataset.src}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }
  };
  $('#doc-links').onclick = e => { const b = e.target.closest('[data-link-scene]'); if (b) navigate(S.scenes[+b.dataset.linkScene].link, { user: true }); };
  $('#speed').value = String(S.speed);
  $('#speed').onchange = e => { S.speed = +e.target.value; store.set('prp.kino.speed', S.speed); restartSentence(); };
  $('#voice').onclick = () => setVoice(!S.voice);
  $('#music').onclick = () => setMusic(!S.music);
  $('#follow').onclick = () => setFollow(!S.follow);
  $('#fullscreen').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $('#theatre').requestFullscreen?.().catch(() => {}));
  $('#voice-pick').onchange = e => { store.set('jdpi.doc.voice', e.target.value); restartSentence(); };
  setVoice(S.voice); $('#music').setAttribute('aria-pressed', String(S.music));
  if (hasSpeech()) { fillVoices(); onVoices(fillVoices); }
  setTimeout(() => { if (!hasSpeech() || !voices().length) { $('#voice').disabled = true; if (S.voice) { S.voice = false; $('#voice').setAttribute('aria-pressed', 'false'); $('#voice').querySelector('.lbl-text').textContent = 'Captions only'; } note('This browser has no speech voices, so Kino plays with captions only.'); } }, 1600);

  document.addEventListener('keydown', e => {
    if (!S.doc || e.ctrlKey || e.metaKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key, act = {
      ' ': toggle, k: toggle, K: toggle, ArrowLeft: () => go(S.i - 1), ArrowRight: () => go(S.i + 1), j: () => go(S.i - 1), l: () => go(S.i + 1), Home: () => go(0), End: () => go(S.scenes.length - 1),
      c: () => setVoice(!S.voice), C: () => setVoice(!S.voice), m: () => setMusic(!S.music), M: () => setMusic(!S.music), p: () => setFollow(!S.follow), P: () => setFollow(!S.follow),
      f: () => $('#fullscreen').click(), F: () => $('#fullscreen').click(), o: () => S.scenes[S.i]?.link && navigate(S.scenes[S.i].link, { user: true }),
      '<': () => stepSpeed(-1), ',': () => stepSpeed(-1), '>': () => stepSpeed(1), '.': () => stepSpeed(1), '?': () => { $('#settings').open = !$('#settings').open; },
    }[k];
    if (!act) return;
    if (k === ' ' && e.target.closest('button, a, summary')) return; // let Space press a focused control
    e.preventDefault(); act();
  });
  // Inside the shell, leaving Kino hides this frame: stop talking unless the viewer chose to follow along.
  const hidden = () => window.innerWidth === 0 || window.innerHeight === 0;
  const check = () => { if (S.playing && !S.follow && hidden()) pause(); };
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

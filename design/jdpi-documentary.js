/* PRP Documentary mode — the reader, in the shell. Offered on Retrospective Geopolitics submodules and on any page
   that tells its own story (the courses, the calendars), wherever it sits.
   - Voice: the browser's speech synthesis, preferring a British English male voice (Edge's natural "Ryan" or
     "Thomas", Chrome's "Google UK English Male", Apple's "Daniel"); pace slowed slightly for a lecture feel.
   - Music: public-domain and CC0 classical recordings from Wikimedia Commons, played quietly and dipped further while
     the voice speaks. It lives in the shell, so it carries on across submodules and "Continue Reading".
   - Story: asked of the submodule in view, one step at a time, through design/jdpi-narrator.js (postMessage). A page
     says whether it tells its own story when its narrator announces itself ({ jdpiDoc: 'ready', story }).
     Autoplay pauses briefly at chapter ends and carries on, like a documentary; without it, "Continue Reading" waits.
   - Speech text: a full stop ends a sentence only when whitespace or the end follows it; elsewhere it is read ("point"
     in numbers, "dot" in names such as jdpi.pages.dev). See PRPSpeech below (tested in tests/documentary.test.mjs).
   Styled with the PRP tokens (design/prp.css), so it follows the shell's light or dark theme. */
(function () {
  /* ---------- speech text (pure) ---------- */
  const PRPSpeech = (() => {
    const CUR = { '€': 'euros', $: 'dollars', '£': 'pounds', '¥': 'yen', '₹': 'rupees' };
    const DOLLARS = { US: 'US dollars', A: 'Australian dollars', C: 'Canadian dollars', NZ: 'New Zealand dollars', HK: 'Hong Kong dollars', S: 'Singapore dollars' };
    const MAG = { trillion: 'trillion', billion: 'billion', million: 'million', thousand: 'thousand', tn: 'trillion', bn: 'billion', m: 'million', k: 'thousand' };
    const TITLE = { Mr: 'Mister', Mrs: 'Missus', Ms: 'Ms', Dr: 'Doctor', Prof: 'Professor', St: 'Saint', Gen: 'General', Col: 'Colonel', Lt: 'Lieutenant', Sgt: 'Sergeant',
      Capt: 'Captain', Adm: 'Admiral', Gov: 'Governor', Sen: 'Senator', Rep: 'Representative', Pres: 'President', Rev: 'Reverend', Mt: 'Mount', Ft: 'Fort', Hon: 'Honourable' };
    const BEFORE_NUMBER = { No: 'number', no: 'number', Nos: 'numbers', nos: 'numbers', Op: 'opus', op: 'opus', Vol: 'volume', vol: 'volume', pp: 'pages', p: 'page',
      Fig: 'figure', fig: 'figure', Ch: 'chapter', ch: 'chapter', c: 'circa', ca: 'circa', Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', Jun: 'June',
      Jul: 'July', Aug: 'August', Sep: 'September', Sept: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };
    const DEGREE = { 'Ph.D': 'PhD', 'M.Sc': 'MSc', 'B.Sc': 'BSc', 'D.Phil': 'DPhil', 'M.Phil': 'MPhil' };
    const spaced = d => d.split('').join(' '); // digits after the point are said one by one: 0.73 → "0 point 7 3"
    const KEPT = '\uE000'; // a full stop inside initials (U.S.), kept while the other dots are read
    // The text as it should be said. Only a full stop followed by whitespace (or the end) is a sentence end; any other
    // full stop is read: "point" between digits, "dot" between letters. Common abbreviations are said in full, or kept
    // as initials (U.S., U.K.) for the voice to spell out.
    function spoken(text) {
      let t = String(text ?? '').replace(/\s+/g, ' ').trim();
      // Money: "€2.11" → "2 point 1 1 euros", "$4.5bn" → "4 point 5 billion dollars", "US$1.2 trillion" → "… US dollars".
      t = t.replace(/(?:(?<![A-Za-z])(US|NZ|HK|A|C|S))?([€$£¥₹])\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d+)(?:\s?(trillion|billion|million|thousand|tn|bn|m|k)\b)?/g,
        (_, pre, sym, int, frac, mag) => `${int} point ${spaced(frac)}${mag ? ' ' + MAG[mag] : ''} ${sym === '$' && DOLLARS[pre] ? DOLLARS[pre] : (pre ? pre + ' ' : '') + CUR[sym]}`);
      // Versions: "v1.2.3" → "version 1 point 2 point 3"; "version 2.11" → "version 2 point 11" (each part a number).
      t = t.replace(/\bv(?=\d+(?:\.\d+)+\b)/g, 'version ');
      t = t.replace(/(?<![\d.])\d+(?:\.\d+){2,}(?!\.?\d)/g, m => m.split('.').join(' point '));
      t = t.replace(/\b([Vv]ersion )(\d+)\.(\d+)\b/g, '$1$2 point $3');
      // Decimals: "3.5" → "3 point 5", "12.5%" → "12 point 5%", ".5" → "point 5".
      t = t.replace(/(\d)\.(\d+)/g, (_, a, b) => `${a} point ${spaced(b)}`);
      t = t.replace(/(^|[^\w.])\.(\d+)/g, (_, a, b) => `${a}point ${spaced(b)}`);
      // Abbreviations said in full; a capital after "etc." or "a.m." still starts a new sentence.
      t = t.replace(/\b([ap])\.m\.(\s+(?=[A-Z]))?/g, (_, x, sp) => `${x.toUpperCase()}M${sp ? '.' + sp : ''}`);
      t = t.replace(/\b(Ph\.D|M\.Sc|B\.Sc|D\.Phil|M\.Phil)\.?(?![\p{L}\p{N}])/gu, m => DEGREE[m.replace(/\.$/, '')]);
      t = t.replace(/\b([Ee])\.g\.(?=[\s,;:)]|$)/g, (_, e) => (e === 'E' ? 'For example' : 'for example'));
      t = t.replace(/\b([Ii])\.e\.(?=[\s,;:)]|$)/g, (_, i) => (i === 'I' ? 'That is' : 'that is'));
      t = t.replace(/\betc\.(\s+(?=[A-Z]))?/g, (_, sp) => (sp ? 'et cetera.' + sp : 'et cetera'));
      t = t.replace(/\b(?:vs|v)\.\s+/g, 'versus ').replace(/\bcf\.\s+/g, 'compare ').replace(/\bapprox\.(?=\s)/g, 'approximately')
        .replace(/\bet al\.(?=\s+[a-z0-9(]|[,;:)]|$)/g, 'et al');
      t = t.replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|Gen|Col|Lt|Sgt|Capt|Adm|Gov|Sen|Rep|Pres|Rev|Mt|Ft|Hon)\.\s*(?=[A-Z])/g, (_, a) => TITLE[a] + ' ');
      t = t.replace(/\b(No|no|Nos|nos|Op|op|Vol|vol|pp|p|Fig|fig|Ch|ch|c|ca|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.\s?(?=\d)/g, (_, a) => BEFORE_NUMBER[a] + ' ');
      t = t.replace(/\b(c|ca)\.\s(?=(?:AD|BC|BCE|CE)\b)/g, 'circa ');
      t = t.replace(/\b(Jr|Sr)\.(?=[\s,;:)]|$)/g, (_, a) => (a === 'Jr' ? 'Junior' : 'Senior'));
      t = t.replace(/\b(Inc|Ltd|Co|Corp|Bros|Plc|plc)\.(?=\s+[a-z0-9]|[,;:)])/g, '$1');
      // Initials keep their dots ("U.S.", "J.R.R."); any other full stop between letters or digits is a "dot".
      t = t.replace(/(?<![\p{L}\p{N}.])(?:\p{L}\.)+\p{L}\.?(?![\p{L}\p{N}])/gu, m => m.replace(/\./g, KEPT));
      t = t.replace(/([\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu, '$1 dot ');
      return t.replace(/\uE000/g, '.');
    }
    // Words after which a full stop and a space do not end the sentence (initials are checked separately).
    const KEEP = /^(?:Mr|Mrs|Ms|Dr|Prof|St|Mt|Ft|Gen|Col|Lt|Sgt|Capt|Adm|Gov|Sen|Rep|Pres|Rev|Hon|Jr|Sr|No|Nos|Op|Vol|Fig|vs|v|cf|approx|ca|c|e\.g|i\.e)$/;
    // Sentences: each ends at . ! ? or … (with any closing quote or bracket) followed by whitespace, or at the end.
    function sentences(text) {
      const t = String(text ?? '').replace(/\s+/g, ' ').trim(), out = [];
      let from = 0;
      for (const m of t.matchAll(/[.!?…]+["'’”)\]]*(?=\s|$)/g)) {
        const end = m.index + m[0].length;
        if (/^\.(?!\.)/.test(m[0]) && end < t.length) {
          const word = (/(\S+)$/.exec(t.slice(from, m.index))?.[1] || '').replace(/^[("'‘“[]+/, '');
          if (/^(?:\p{L}\.)+\p{L}$/u.test(word) || /^\p{Lu}$/u.test(word) || KEEP.test(word)) continue; // U.S. forces, John F. Kennedy, Dr. Who
        }
        out.push(t.slice(from, end).trim()); from = end;
      }
      if (from < t.length) out.push(t.slice(from).trim());
      return out.filter(Boolean);
    }
    // What the voice is given, one utterance at a time: long utterances get cut off in some browsers, so a long
    // sentence is split again at its commas, semicolons and colons.
    const utterances = text => sentences(spoken(text)).flatMap(s => (s.length > 220 ? s.split(/(?<=[,;:])\s+/) : [s]));
    return { spoken, sentences, utterances };
  })();
  globalThis.PRPSpeech = PRPSpeech;
  if (typeof document === 'undefined') return; // loaded by the tests, outside a browser

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = { get: (k, d) => { try { const v = localStorage.getItem('jdpi.doc.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('jdpi.doc.' + k, JSON.stringify(v)); } catch {} } };

  // Wikimedia Commons recordings (public domain unless noted). Transcoded MP3s play everywhere; the original is the fallback.
  const C = 'https://upload.wikimedia.org/wikipedia/commons/';
  const TRACKS = [
    ['Debussy', 'Clair de lune', 'b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg', 'File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg'],
    ['Satie', 'Gymnopédie No. 1 (Michael Laucke)', 'a/a6/Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac', 'File:Satie_Gymnopedie_No_1_performed_by_Michael_Laucke.flac'],
    ['Bach', 'Air (Orchestral Suite No. 3)', '1/1e/Air_%28Bach%29.ogg', 'File:Air_(Bach).ogg'],
    ['Chopin', 'Nocturne in E-flat, Op. 9 No. 2 (Peter Johnston, CC0)', '0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg', 'File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg'],
    ['Debussy', 'Rêverie', '5/53/Reverie.ogg', 'File:Reverie.ogg'],
    ['Satie', 'Gnossienne No. 1 (La Pianista)', '9/91/Satie_-_Gnossienne_1.ogg', 'File:Satie_-_Gnossienne_1.ogg'],
    ['Bach', 'Goldberg Variations: Aria (Musopen, CC0)', 'a/af/Bach%2C_Goldberg_Variations%2C_Aria_%28Musopen_version%29.ogg', 'File:Bach,_Goldberg_Variations,_Aria_(Musopen_version).ogg'],
    ['Ravel', 'Pavane pour une infante défunte', '4/4d/Maurice_Ravel_-_Pavane_pour_une_infante_d%C3%A9funte.ogg', 'File:Maurice_Ravel_-_Pavane_pour_une_infante_défunte.ogg'],
    ['Mozart', 'Piano Concerto No. 12: Andante', 'a/aa/Mozart%3B_Concerto_No._12_in_A-_II._Andante.ogg', 'File:Mozart;_Concerto_No._12_in_A-_II._Andante.ogg'],
    ['Bach', 'Cello Suite No. 1: Prelude (CC0)', 'a/a7/Bach_Cello_Suite_1_Prelude_%28BWV_1007%29_Played_by_Chris.ogg', 'File:Bach_Cello_Suite_1_Prelude_(BWV_1007)_Played_by_Chris.ogg'],
    ['Grieg', 'Peer Gynt: Morning Mood', '7/7b/Henrik_Ibsen%2C_Edvard_Grieg_-_Morgenstemning_%28Morning_Mood%29.ogg', 'File:Henrik_Ibsen,_Edvard_Grieg_-_Morgenstemning_(Morning_Mood).ogg'],
    ['Elgar', 'Enigma Variations: Nimrod (Barbirolli)', 'e/e7/Elgar%3B_Enigma_variations%2C_Theme_IX._Nimrod.ogg', 'File:Elgar;_Enigma_variations,_Theme_IX._Nimrod.ogg'],
  ].map(([composer, title, path, page]) => { const file = path.split('/').pop(); return { composer, title, src: C + path, mp3: `${C}transcoded/${path}/${file}.mp3`, page: 'https://commons.wikimedia.org/wiki/' + page }; });

  const S = { open: false, playing: false, autoplay: store.get('autoplay', true), music: store.get('music', true), vol: store.get('vol', 0.16), rate: store.get('rate', 0.92),
    voiceName: store.get('voice', null), seq: 0, waiting: null, pending: new Map(), frame: null, order: [], track: -1, speaking: false, stopFlag: false };

  /* ---------- UI (PRP tokens: light and dark follow the shell) ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .doc-fab{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;gap:8px;align-items:center;height:38px;padding:0 16px 0 14px;cursor:pointer;
    border:1px solid var(--prp-line-strong);border-radius:99px;background:var(--prp-surface);color:var(--prp-text);box-shadow:var(--prp-shadow-2);font:600 13px var(--prp-font-ui)}
  .doc-fab svg{color:var(--prp-accent)}
  .doc-fab:hover{background:var(--prp-surface-3)}
  .doc{position:fixed;right:18px;bottom:18px;z-index:61;width:min(420px,calc(100vw - 32px));background:var(--prp-surface);border:1px solid var(--prp-line);border-radius:var(--prp-radius-lg);
    box-shadow:var(--prp-shadow-2);color:var(--prp-text);font:13px/1.5 var(--prp-font-ui)}
  .doc header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 12px 10px 14px;border-bottom:1px solid var(--prp-line-soft)}
  .doc header .k{display:flex;align-items:center;gap:7px;color:var(--prp-muted);font:500 var(--prp-fs-xs) var(--prp-font-mono);letter-spacing:.08em;text-transform:uppercase}
  .doc header .k::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--prp-accent)}
  .doc header b{display:block;margin-top:2px;color:var(--prp-text);font:600 15px/1.3 var(--prp-font-serif)}
  .doc .x{flex:none;width:28px;height:28px;border:0;border-radius:var(--prp-radius-sm);background:none;color:var(--prp-muted);font-size:18px;line-height:1;cursor:pointer}
  .doc .x:hover{background:var(--prp-surface-3);color:var(--prp-text)}
  .doc .sub{max-height:150px;min-height:64px;overflow:auto;padding:12px 14px;color:var(--prp-text);font:15px/1.6 var(--prp-font-serif)}
  .doc .ctrl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 14px 12px}
  .doc .ctrl .auto{margin-left:auto}
  .doc button.cont{animation:docPulse 1.6s ease-in-out infinite}@keyframes docPulse{50%{box-shadow:0 0 0 4px var(--prp-primary-soft)}}
  .doc .row2{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:8px 14px;border-top:1px solid var(--prp-line-soft);color:var(--prp-text-2);font-size:12px}
  .doc label{display:inline-flex;align-items:center;gap:6px}
  .doc select{max-width:190px;height:28px;font-size:12px}
  .doc input[type=range],.doc input[type=checkbox]{accent-color:var(--prp-primary)}
  .doc input[type=range]{width:110px}
  .doc .np{padding:7px 14px 10px;border-top:1px solid var(--prp-line-soft);color:var(--prp-muted);font:10.5px/1.5 var(--prp-font-mono)}.doc .np a{color:inherit}.doc .np:empty{display:none}
  @media(max-width:600px){.doc{right:8px;left:8px;width:auto;bottom:8px}.doc-fab{right:10px;bottom:10px}}
  @media(prefers-reduced-motion:reduce){.doc button.cont{animation:none}}`;
  document.head.appendChild(css);
  const fab = Object.assign(document.createElement('button'), { className: 'doc-fab', type: 'button',
    innerHTML: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5"/><path d="M3 7.8a5 5 0 0 0 10 0M8 12.8V15"/></svg>Documentary' });
  fab.title = 'Have this page read to you as a documentary, with quiet classical music';
  const panel = document.createElement('section');
  panel.className = 'doc'; panel.hidden = true; panel.setAttribute('aria-label', 'Documentary reader');
  panel.innerHTML = `<header><div><span class="k">Documentary</span><b id="doc-title">Read aloud, with quiet music</b></div><button type="button" class="x" id="doc-close" aria-label="Close documentary">×</button></header>
    <div class="sub" id="doc-sub" aria-live="polite">Press play to begin.</div>
    <div class="ctrl"><button type="button" class="prp-btn primary sm" id="doc-play">▶ Play</button><button type="button" class="prp-btn sm" id="doc-skip" title="Skip this passage" aria-label="Skip this passage">⏭</button><button type="button" class="prp-btn primary sm cont" id="doc-cont" hidden>Continue Reading</button>
      <label class="auto"><input type="checkbox" id="doc-auto"> Autoplay</label></div>
    <div class="row2"><label>Voice <select class="prp-select" id="doc-voice"></select></label><label>Pace <input type="range" id="doc-rate" min="0.7" max="1.2" step="0.02"></label></div>
    <div class="row2"><label><input type="checkbox" id="doc-music"> Music</label><input type="range" id="doc-vol" min="0" max="0.5" step="0.01" aria-label="Music volume"><button type="button" class="prp-btn ghost sm" id="doc-nexttrack" title="Next piece">♫ Next piece</button></div>
    <div class="np" id="doc-np"></div>`;
  document.body.append(fab, panel);
  const audio = new Audio(); audio.preload = 'none'; audio.crossOrigin = null;

  /* ---------- where it is offered ---------- */
  const tellsStory = new WeakSet(); // frames whose page has its own story (window.jdpiDocumentary)
  const activeFrame = () => { const f = $('#frames'); return f && !f.hidden ? f.querySelector('iframe.active') : null; };
  const onRetrospective = () => /^#\/(rs|hp)(\/|$)/.test(location.hash);
  const available = () => onRetrospective() || tellsStory.has(activeFrame());
  const syncFab = () => { fab.hidden = !available() || S.open; };
  // The shell switches frames on the same hashchange, so look once it has.
  window.addEventListener('hashchange', () => setTimeout(() => { syncFab(); routeChanged(); }, 0));
  syncFab();

  /* ---------- voice ---------- */
  const PREFER = [/Microsoft (Ryan|Thomas|Oliver|Alfie|Elliot|Noah|Ethan).*(Online|Natural)/i, /Microsoft.*(Online|Natural).*United Kingdom/i, /Google UK English Male/i, /^Daniel\b/i, /^Arthur\b/i, /Microsoft George/i, /Microsoft Ryan/i];
  function voices() { return speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang)); }
  function pickVoice() {
    const all = voices();
    if (S.voiceName) { const v = all.find(x => x.name === S.voiceName); if (v) return v; }
    for (const re of PREFER) { const v = all.find(x => re.test(x.name) && /GB|UK|United Kingdom/i.test(x.lang + x.name)); if (v) return v; }
    return all.find(v => /en-GB/i.test(v.lang)) || all[0] || null;
  }
  function fillVoices() {
    const all = voices(), chosen = pickVoice();
    const gb = all.filter(v => /en-GB/i.test(v.lang)), rest = all.filter(v => !/en-GB/i.test(v.lang));
    $('#doc-voice').innerHTML = [...gb, ...rest].map(v => `<option${v === chosen ? ' selected' : ''}>${esc(v.name)}</option>`).join('') || '<option>Default voice</option>';
  }
  if ('speechSynthesis' in window) { fillVoices(); speechSynthesis.addEventListener?.('voiceschanged', fillVoices); }

  // Sentence by sentence, as the voice should say it (PRPSpeech above).
  async function speak(text) {
    if (!('speechSynthesis' in window)) { await sleep(Math.min(9000, 60 * text.length)); return; }
    S.speaking = true; S.skip = false; duck(true);
    for (const part of PRPSpeech.utterances(text)) {
      if (S.stopFlag || S.skip) break;
      await new Promise(resolve => {
        const u = new SpeechSynthesisUtterance(part);
        const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
        u.rate = S.rate; u.pitch = 0.94;
        u.onend = u.onerror = () => resolve();
        speechSynthesis.speak(u);
      });
    }
    S.speaking = false; duck(false);
  }

  /* ---------- music ---------- */
  function shuffle() { S.order = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5); S.track = -1; }
  function nextTrack() {
    if (!S.order.length || S.track >= S.order.length - 1) shuffle();
    const t = TRACKS[S.order[++S.track]];
    audio.dataset.fallback = t.src; audio.src = t.mp3; audio.volume = S.speaking ? S.vol * 0.5 : S.vol;
    $('#doc-np').innerHTML = `♫ ${esc(t.composer)} — ${esc(t.title)} · <a href="${esc(t.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    if (S.music && S.open) audio.play().catch(() => {});
  }
  audio.addEventListener('ended', nextTrack);
  audio.addEventListener('error', () => { if (audio.dataset.fallback && audio.src !== audio.dataset.fallback) { audio.src = audio.dataset.fallback; audio.dataset.fallback = ''; if (S.music) audio.play().catch(() => {}); } else nextTrack(); });
  function duck(on) {
    const target = on ? S.vol * 0.5 : S.vol, start = audio.volume, t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 600); audio.volume = Math.max(0, Math.min(1, start + (target - start) * k)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function setMusic(on) { S.music = on; store.set('music', on); if (on && S.open) { if (!audio.src) nextTrack(); else audio.play().catch(() => {}); } else audio.pause(); }

  /* ---------- talking to the submodule ---------- */
  const originOf = f => new URL(f.src, location.href).origin;
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object' || !('jdpiDoc' in e.data)) return;
    const from = [...document.querySelectorAll('#frames iframe')].find(f => f.contentWindow === e.source);
    if (!from) return;
    if (e.data.jdpiDoc === 'ready') {
      if (e.data.story) tellsStory.add(from); else tellsStory.delete(from);
      if (from === activeFrame()) { syncFab(); if (S.open && !S.playing && !S.waiting) routeChanged(); }
    }
    if (from !== activeFrame()) return;
    if (e.data.title) $('#doc-title').textContent = e.data.title;
    if (e.data.jdpiDoc === 'step') { const p = S.pending.get(e.data.seq); if (p) { S.pending.delete(e.data.seq); p(e.data.step); } }
  });
  function ask(cmd, f = activeFrame()) {
    if (!f) return Promise.resolve({ done: true, error: 'no-page' });
    const seq = ++S.seq;
    const reply = new Promise(resolve => { S.pending.set(seq, resolve); setTimeout(() => { if (S.pending.delete(seq)) resolve({ done: true, error: 'timeout' }); }, 20000); });
    f.contentWindow.postMessage({ jdpiDoc: cmd, seq }, originOf(f));
    return cmd === 'next' ? reply : Promise.resolve();
  }

  /* ---------- the reading loop ---------- */
  function setPlayButton() { $('#doc-play').textContent = S.playing ? '❚❚ Pause' : '▶ Play'; }
  function waitForContinue(label) {
    $('#doc-cont').textContent = label || 'Continue Reading'; $('#doc-cont').hidden = false;
    return new Promise(resolve => { S.waiting = resolve; });
  }
  async function run(fresh) {
    if (S.playing) return;
    S.playing = true; S.stopFlag = false; setPlayButton();
    if (S.music) setMusic(true);
    const f = activeFrame();
    if (!f) { $('#doc-sub').textContent = 'Open a Retrospective Geopolitics submodule or a course to have it read to you.'; S.playing = false; setPlayButton(); return; }
    S.frame = f; // the page being read: told to stop (and to clear its highlight and map focus) even after the route moves on
    if (fresh) { ask('start'); S.resume = null; }
    // Resuming after a pause repeats the passage that was interrupted.
    if (S.resume) { const text = S.resume; S.resume = null; $('#doc-sub').textContent = text; await speak(text); }
    while (S.playing && !S.stopFlag) {
      const step = await ask('next');
      if (!S.playing) break;
      if (step.done) {
        $('#doc-sub').textContent = step.error === 'timeout' ? 'This page did not answer. It may not support Documentary mode yet.' : 'That is the end of this page. Open another page and press Continue Reading.';
        S.playing = false; S.ended = true; setPlayButton(); $('#doc-cont').textContent = 'Continue Reading'; $('#doc-cont').hidden = false; break;
      }
      if (step.chapterEnd) {
        if (S.autoplay) { $('#doc-sub').innerHTML = `<i>${esc(step.label || '…')}</i>`; await sleep(1800); continue; }
        S.playing = false; setPlayButton();
        await waitForContinue(step.label);
        S.playing = true; setPlayButton(); continue;
      }
      $('#doc-sub').textContent = step.text;
      S.current = step.text;
      await speak(step.text);
      if (S.stopFlag) { S.resume = S.current; break; }
      S.current = null;
      await sleep(350);
    }
  }
  function pause() { S.playing = false; S.stopFlag = true; speechSynthesis?.cancel(); setPlayButton(); }
  function stopReading() { pause(); S.resume = null; const f = S.frame?.isConnected ? S.frame : activeFrame(); S.frame = null; ask('stop', f); }
  function routeChanged() {
    if (!S.open) return;
    if (S.playing || S.waiting || S.frame) { stopReading(); S.waiting = null; }
    const here = available();
    $('#doc-cont').hidden = !here; $('#doc-cont').textContent = 'Continue Reading';
    $('#doc-sub').textContent = here ? 'A new page. Press Continue Reading and I shall carry on here; the music plays on.' : 'There is nothing to read aloud on this page. The music plays on until you close it.';
  }

  /* ---------- controls ---------- */
  fab.onclick = () => { S.open = true; panel.hidden = false; syncFab(); fillVoices(); if (S.music) setMusic(true); run(true); };
  $('#doc-close').onclick = () => { stopReading(); S.open = false; panel.hidden = true; audio.pause(); syncFab(); };
  $('#doc-play').onclick = () => { if (S.playing) pause(); else { $('#doc-cont').hidden = true; const fresh = S.ended; S.ended = false; run(fresh); } };
  $('#doc-skip').onclick = () => { S.skip = true; speechSynthesis?.cancel(); };
  $('#doc-cont').onclick = () => {
    $('#doc-cont').hidden = true;
    if (S.waiting) { const w = S.waiting; S.waiting = null; w(); return; }
    S.ended = false; run(true);
  };
  $('#doc-auto').checked = S.autoplay; $('#doc-auto').onchange = e => { S.autoplay = e.target.checked; store.set('autoplay', S.autoplay); if (S.autoplay && S.waiting) $('#doc-cont').click(); };
  $('#doc-music').checked = S.music; $('#doc-music').onchange = e => setMusic(e.target.checked);
  $('#doc-vol').value = S.vol; $('#doc-vol').oninput = e => { S.vol = +e.target.value; store.set('vol', S.vol); audio.volume = S.speaking ? S.vol * 0.5 : S.vol; };
  $('#doc-rate').value = S.rate; $('#doc-rate').oninput = e => { S.rate = +e.target.value; store.set('rate', S.rate); };
  $('#doc-voice').onchange = e => { S.voiceName = e.target.value; store.set('voice', S.voiceName); };
  $('#doc-nexttrack').onclick = nextTrack;
})();

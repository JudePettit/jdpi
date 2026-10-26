/* JDP-I Documentary mode — the reader, in the shell. Offered in History & Politics.
   - Voice: the browser's speech synthesis, preferring a British English male voice (Edge's natural "Ryan" or
     "Thomas", Chrome's "Google UK English Male", Apple's "Daniel"); pace slowed slightly for a lecture feel.
   - Music: public-domain and CC0 classical recordings from Wikimedia Commons, played quietly and dipped further while
     the voice speaks. It lives in the shell, so it carries on across modules and "Continue Reading".
   - Story: asked of the module in view, one step at a time, through design/jdpi-narrator.js (postMessage).
     Autoplay pauses briefly at chapter ends and carries on, like a documentary; without it, "Continue Reading" waits. */
(function () {
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

  /* ---------- UI ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .doc-fab{position:fixed;right:18px;bottom:18px;z-index:60;border:1px solid var(--jdpi-accent-line,#3f7a70);background:var(--jdpi-panel,#17242e);color:var(--jdpi-accent,#6ddac8);border-radius:99px;padding:10px 16px;font:600 13px var(--jdpi-font-ui,'DM Sans',sans-serif);box-shadow:0 10px 28px rgba(0,0,0,.45);cursor:pointer;display:flex;gap:8px;align-items:center}
  .doc-fab:hover{background:var(--jdpi-panel-2,#1c2b36)}
  .doc{position:fixed;right:18px;bottom:18px;z-index:61;width:min(420px,calc(100vw - 32px));background:var(--jdpi-panel,#17242e);border:1px solid var(--jdpi-line,#293a46);border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.55);font:13px/1.5 var(--jdpi-font-ui,'DM Sans',sans-serif);color:var(--jdpi-text,#edf3f1)}
  .doc header{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--jdpi-line,#293a46)}
  .doc header b{font:700 13px var(--jdpi-font-display,Manrope,sans-serif)}.doc header small{display:block;color:var(--jdpi-muted,#91a0aa);font:10px var(--jdpi-font-mono,'DM Mono',monospace)}
  .doc .x{border:0;background:none;color:var(--jdpi-muted,#91a0aa);font-size:18px;cursor:pointer}
  .doc .sub{padding:12px 14px;min-height:64px;font:15px/1.55 Georgia,'Times New Roman',serif;color:#f3efe6;max-height:150px;overflow:auto}
  .doc .ctrl{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:0 14px 10px}
  .doc button.b{border:1px solid var(--jdpi-line,#293a46);background:var(--jdpi-panel-2,#1c2b36);color:var(--jdpi-text,#edf3f1);border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit}
  .doc button.b:hover{border-color:var(--jdpi-accent,#6ddac8)}.doc button.primary{border-color:var(--jdpi-accent-line,#3f7a70);color:var(--jdpi-accent,#6ddac8);background:rgba(109,218,200,.09)}
  .doc button.cont{animation:docPulse 1.6s ease-in-out infinite}@keyframes docPulse{50%{box-shadow:0 0 0 4px rgba(109,218,200,.18)}}
  .doc .row2{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 14px;border-top:1px solid var(--jdpi-line,#293a46);color:var(--jdpi-muted,#91a0aa);font-size:12px}
  .doc select,.doc input[type=range]{background:#0f1b25;border:1px solid var(--jdpi-line,#293a46);color:var(--jdpi-text,#edf3f1);border-radius:5px;font-size:12px;max-width:190px}
  .doc .np{padding:6px 14px 10px;color:var(--jdpi-faint,#70818b);font:10.5px var(--jdpi-font-mono,'DM Mono',monospace)}.doc .np a{color:inherit}
  @media(max-width:600px){.doc{right:8px;left:8px;width:auto;bottom:8px}.doc-fab{right:10px;bottom:10px}}`;
  document.head.appendChild(css);
  const fab = Object.assign(document.createElement('button'), { className: 'doc-fab', type: 'button', innerHTML: '<span aria-hidden="true">🎙</span> Documentary' });
  fab.title = 'Have this page read to you as a documentary, with quiet classical music';
  const panel = document.createElement('section');
  panel.className = 'doc'; panel.hidden = true; panel.setAttribute('aria-label', 'Documentary reader');
  panel.innerHTML = `<header><div><b>Documentary</b><small id="doc-title">History &amp; Politics</small></div><button class="x" id="doc-close" aria-label="Close documentary">×</button></header>
    <div class="sub" id="doc-sub" aria-live="polite">Press play to begin.</div>
    <div class="ctrl"><button class="b primary" id="doc-play">▶ Play</button><button class="b" id="doc-skip" title="Skip this passage">⏭</button><button class="b primary cont" id="doc-cont" hidden>Continue Reading</button>
      <label style="margin-left:auto;font-size:12px;color:var(--jdpi-muted,#91a0aa)"><input type="checkbox" id="doc-auto"> Autoplay</label></div>
    <div class="row2"><label>Voice <select id="doc-voice"></select></label><label>Pace <input type="range" id="doc-rate" min="0.7" max="1.2" step="0.02"></label></div>
    <div class="row2"><label><input type="checkbox" id="doc-music"> Music</label><input type="range" id="doc-vol" min="0" max="0.5" step="0.01" aria-label="Music volume"><button class="b" id="doc-nexttrack" title="Next piece">♫ ›</button></div>
    <div class="np" id="doc-np"></div>`;
  document.body.append(fab, panel);
  const audio = new Audio(); audio.preload = 'none'; audio.crossOrigin = null;

  const onHp = () => /^#\/hp(\/|$)/.test(location.hash);
  const syncFab = () => { fab.hidden = !onHp() || S.open; };
  window.addEventListener('hashchange', () => { syncFab(); routeChanged(); });
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

  // Long utterances get cut off in some browsers, so speak sentence by sentence.
  const sentences = t => (t.match(/[^.!?…]+[.!?…]+["'’”)]*\s*|[^.!?…]+$/g) || [t]).map(s => s.trim()).filter(Boolean)
    .flatMap(s => (s.length > 220 ? s.split(/(?<=[,;:])\s+/) : [s]));
  async function speak(text) {
    if (!('speechSynthesis' in window)) { await sleep(Math.min(9000, 60 * text.length)); return; }
    S.speaking = true; S.skip = false; duck(true);
    for (const part of sentences(text)) {
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

  /* ---------- talking to the module ---------- */
  const activeFrame = () => { const f = $('#frames'); return f && !f.hidden ? f.querySelector('iframe.active') : null; };
  const originOf = f => new URL(f.src, location.href).origin;
  window.addEventListener('message', e => {
    const f = activeFrame();
    if (!f || e.source !== f.contentWindow || !e.data || typeof e.data !== 'object' || !('jdpiDoc' in e.data)) return;
    if (e.data.title) $('#doc-title').textContent = e.data.title;
    if (e.data.jdpiDoc === 'step') { const p = S.pending.get(e.data.seq); if (p) { S.pending.delete(e.data.seq); p(e.data.step); } }
  });
  function ask(cmd) {
    const f = activeFrame(); if (!f) return Promise.resolve({ done: true, error: 'no-page' });
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
    if (!f) { $('#doc-sub').textContent = 'Open a History & Politics module to have it read to you.'; S.playing = false; setPlayButton(); return; }
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
  function stopReading() { pause(); S.resume = null; ask('stop'); }
  function routeChanged() {
    if (!S.open) return;
    if (S.playing || S.waiting) { stopReading(); S.waiting = null; }
    $('#doc-cont').hidden = !onHp(); $('#doc-cont').textContent = 'Continue Reading';
    $('#doc-sub').textContent = onHp() ? 'A new page. Press Continue Reading and I shall carry on here; the music plays on.' : 'Documentary mode is for History & Politics. The music plays on until you close it.';
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

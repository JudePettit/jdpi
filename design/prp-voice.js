/* PRP voice: one narration layer for every page that reads aloud. The shell's Documentary reader
   (design/jdpi-documentary.js) and Kino's player (kino/lib/voice.js) speak through it; Bibliotheca, Auteur and Personal
   Genius are meant to. Plain script, no build step: globalThis.PRPVoice. The shell loads it with a script tag, Kino's
   modules import it for its side effect (import '../../design/prp-voice.js'), and the voice proxy's Pages Functions
   import it the same way for the shared clip key and lexicon. Nothing here touches the page when it loads: the pure parts
   and the reader run in Node for the tests (tests/prp-voice.test.mjs), and the two backends reach for browser APIs only
   when they are used (the tests hand them fakes).

   The fallback chain. A passage is read by the first backend in the reader's order that can say it, and when one cannot
   carry on (not set up, offline or too slow to answer, the day's quota spent, the provider down, a clip that stalls) the
   next one reads on from that sentence, silently; the page is told once (onBackend) so it can say so.
     'prerendered'  clips made ahead of time (R2 and manifests). Not built yet: the reader skips an id it has no backend for.
     'stream'       PRPVoice.stream(): an online voice through the site's own proxy (functions/api/voice/v1/), one sentence
                    per request (Azure's REST synthesis sends no word timings, so the clip's length times the sentence
                    exactly and the words inside it are estimated), played on one persistent <audio> element, the next
                    sentence fetched while this one plays.
     'webspeech'    PRPVoice.webspeech(): the browser's speech synthesis, exactly as the two readers spoke before (their
                    quirks are options, below). It can always answer: with no voice at all it times the captions.

   Shapes the backends and the pages share:
     Passage     { text, id?, lang?, cues?, private?, norm? }. text: what the captions show. private: never stored in the
                 shared cache (Personal Genius; Auteur by default). The reader adds units: the passage as the voice is given
                 it, one utterance at a time, [{ text, words: [{ i, from, to }] }], i numbering the displayed words and
                 from/to the characters of the unit's text that say word i (Kino's lib/text.js utterances() makes them).
     Cue         { word?, sentence?, after?, focus?, link? }: fires once when the voice reaches word i, the start of
                 sentence k, or the end of sentence `after` (a reading resumed later fires the earlier ones at once).
     Timings     { duration, words: [[start, end, i]], sentences: [[start, end]], source }, in seconds; source 'provider' |
                 'aligned' | 'boundary' | 'estimate'.
     VoiceInfo   { id, name, engine, lang, lifelike, label? }. id 'device:<name>', or '<engine>:<voice>' for an online
                 voice ('azure:en-GB-RyanNeural'). A saved jdpi.doc.voice with no prefix is a device voice's name, so the
                 choices saved before this file keep working; device choices are still saved by their plain name.
     SayOptions  { voice, rate, from?, silent?, next? }. voice and rate may be functions, read before each utterance, so a
                 choice made mid-passage applies from the next sentence as it always has. rate is playbackRate for audio
                 (pitch kept). silent: Captions only, the timing without the sound. next: the passage that follows (Kino's
                 next scene), whose first clip is fetched once this one reaches its last sentence.
     SayEvents   { onStart?(timings | null), onSentence?(k), onWord?(i), onCue?(cue) }
     SayResult   { done, sentence, backend, reason? }, reason 'stopped' | 'unavailable' | 'quota' | 'error'.
     SpeechBackend { id, voices(), canSay(p, o), say(p, o, ev), prefetch?(p, o), pause?(), resume?(), stop(), unlock?() }.
                 pause() is true when the voice paused in place (audio); false when the caller must read again from
                 r.sentence (Web Speech: Chrome's speech pause is unreliable, so both readers stop and restart, as before).

   The reader:  const r = PRPVoice.reader({ order, backends: { stream, webspeech }, utterances, norm, onWord, onSentence,
                onCue, onBackend });
     r.unlock(o)                synchronously in every Play click handler, before any await: iOS lets an <audio> element
                                play later only if it first played inside a tap (a short silent clip here). With options, only
                                when o.voice is an online voice, since on iOS even silence stops another app's music
     await r.read(p | text, o)  → SayResult (Kino's old Reader.read() contract, plus `backend`); a reading in progress gives way
     r.prefetch(p, o)           a passage's first clip, fetched now (o.next on a read does it when the time comes)
     r.pause() r.resume() r.stop() r.sentence r.backend
     r.enqueue(p, o); await r.finish()   passages that arrive while it speaks (Personal Genius), read in turn

   Clip keys, shared by the proxy's R2 cache and (later) pre-rendered manifests: PRPVoice.key({ engine, voice, text, norm })
   → hex SHA-256 of the JSON ['prp-voice/1', engine, voice, norm, lexicon version, spoken], where spoken is the text exactly
   as the voice is given it, white space collapsed and Unicode in NFC. The page's own normaliser has already run (norm names
   it and its version: PRPSpeech.spoken for the Documentary, 'prp-speech@1'; Kino's per-word rule, 'kino-text@1'), so the
   two readers keep their own pronunciations and a rule change gives new keys. engine carries the model and audio format;
   pace is not in the key (it is playbackRate). The proxy computes the key itself and never takes one from a page.

   Lexicon (PRPVoice.lexicon): pronunciations applied by the proxy before synthesis, as SSML <sub alias>; its version is part
   of every key, so bump it with any change. Each entry: { word, sub, ipa, at } (at 'start': only where the word starts a
   sentence; 'any': as a whole word anywhere); sub is what an engine is told to say, ipa the phonemes for engines that take
   them (the pre-render pipeline). Device voices are not given it, so what they say is unchanged.

   Also: PRPVoice.vtt.format(timings, tokens) / .parse(vtt) (one cue per sentence, cue id k, an inline timestamp before each
   displayed word); PRPVoice.timeline(timings).at(seconds) → { sentence, word }; PRPVoice.segmenter() → { push(delta) →
   sentences, flush() → the rest }, PRPSpeech.sentences for text that arrives piece by piece (an AI answer), cut at , ; :
   once a sentence passes 300 characters; PRPVoice.estimate(unit, { duration | rate }) (Kino's word timing estimate). */
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SCHEMA = 'prp-voice/1';
  // Normalisers: the rule that turned displayed text into what the voice is given. Change a rule, change its version here.
  const NORM = { documentary: 'prp-speech@1', kino: 'kino-text@1', plain: 'plain@1' };
  const CHARS_PER_SEC = 14.2; // Web Speech at rate 1, about 165 words a minute: Kino's estimate
  const clockNow = () => (root.performance?.now ? root.performance.now() : Date.now());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const valueOf = (v, d) => (typeof v === 'function' ? v() : v ?? d);

  /* ---------- text ---------- */
  const canon = t => String(t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const tokens = t => { const c = canon(t); return c ? c.split(' ') : []; };
  // Sentences: PRPSpeech.sentences (design/jdpi-documentary.js) and PRPNarrator.sentences, the same rule (the tests check all
  // three agree). A sentence ends at . ! ? or … (with any closing quote or bracket) followed by white space or the end, never
  // at a full stop inside a number or name, after initials (U.S. forces, John F. Kennedy) or after a common abbreviation.
  const KEEP = /^(?:Mr|Mrs|Ms|Dr|Prof|St|Mt|Ft|Gen|Col|Lt|Sgt|Capt|Adm|Gov|Sen|Rep|Pres|Rev|Hon|Jr|Sr|No|Nos|Op|Vol|Fig|vs|v|cf|approx|ca|c|e\.g|i\.e)$/;
  const END = /[.!?…]+["'’”)\]]*(?=\s|$)/g;
  const keeps = before => { const word = (/(\S+)$/.exec(before)?.[1] || '').replace(/^[("'‘“[]+/, ''); return /^(?:\p{L}\.)+\p{L}$/u.test(word) || /^\p{Lu}$/u.test(word) || KEEP.test(word); };
  function sentences(text) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim(), out = [];
    let from = 0;
    for (const m of t.matchAll(END)) {
      const end = m.index + m[0].length;
      if (/^\.(?!\.)/.test(m[0]) && end < t.length && keeps(t.slice(from, m.index))) continue;
      out.push(t.slice(from, end).trim()); from = end;
    }
    if (from < t.length) out.push(t.slice(from).trim());
    return out.filter(Boolean);
  }
  const cut = s => s.split(/(?<=[,;:])\s+/); // a long sentence, at its commas, semicolons and colons
  // One unit whose displayed words are its own white-space tokens, numbered from `first`.
  function unit(text, first = 0) {
    const t = canon(text), words = [];
    let at = 0;
    for (const w of t ? t.split(' ') : []) { words.push({ i: first + words.length, from: at, to: at + w.length }); at += w.length + 1; }
    return { text: t, words };
  }
  // Plain text as units: sentences, a long one cut at its commas (the Documentary's 220-character rule).
  function utterances(text, max = 220) {
    let n = 0;
    return sentences(text).flatMap(s => (s.length > max ? cut(s) : [s])).map(s => { const u = unit(s, n); n += u.words.length; return u; });
  }
  /** The displayed word being said at a character offset of a unit (Kino's wordAt). */
  function wordAt(u, charIndex) {
    let hit = u.words[0];
    for (const w of u.words) { if (w.from <= charIndex) hit = w; else break; }
    return hit ? hit.i : 0;
  }

  /* ---------- timings ---------- */
  // Word timing by estimate (Kino's rule): each word's share of the unit by its length, with a pause after , ; and :.
  // With a duration (an audio clip's), the shares are spread over it; without, the unit takes CHARS_PER_SEC at `rate`.
  function estimate(u, { duration, rate = 1, start = 0 } = {}) {
    const ws = u.words.map(w => (w.to - w.from) + 1.5 + (/[,;:]$/.test(u.text.slice(w.from, w.to)) ? 4 : 0));
    const total = ws.reduce((a, b) => a + b, 0), d = duration ?? (total ? total / (CHARS_PER_SEC * rate) : 0);
    const words = [];
    let acc = 0;
    u.words.forEach((w, k) => { const s = start + (total ? (acc / total) * d : 0); acc += ws[k]; words.push([s, start + (total ? (acc / total) * d : 0), w.i]); });
    return { duration: d, words, sentences: [[start, start + d]], source: 'estimate' };
  }
  // The latest entry starting at or before `s` (binary search over [start, …] rows sorted by start), else -1.
  function latest(rows, s) {
    let lo = 0, hi = rows.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid][0] <= s) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k;
  }
  /** What is being said at a moment: the word and sentence (before the first, the first; -1 when there are none). */
  function timeline(t) {
    const words = (t?.words || []).filter(Boolean).slice().sort((a, b) => a[0] - b[0]);
    const sents = (t?.sentences || []).map((s, k) => s && [s[0], s[1], k]).filter(Boolean).sort((a, b) => a[0] - b[0]);
    return {
      duration: t?.duration || 0,
      at(seconds) {
        const w = latest(words, seconds), k = latest(sents, seconds);
        return { word: words.length ? words[Math.max(0, w)][2] : -1, sentence: sents.length ? sents[Math.max(0, k)][2] : -1 };
      },
    };
  }

  /* ---------- WebVTT: one cue per sentence (cue id k), karaoke style ---------- */
  //   WEBVTT
  //
  //   0
  //   00:00:00.000 --> 00:00:05.120
  //   <00:00:00.050>Germany <00:00:00.520>invaded <00:00:00.980>Poland …
  const stamp = s => {
    const ms = Math.max(0, Math.round(s * 1000)), p = (v, n = 2) => String(v).padStart(n, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
  };
  const seconds = v => v.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
  const STAMP = String.raw`(?:\d+:)?\d{2}:\d{2}\.\d{3}`;
  const vttEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const vttText = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&lrm;|&rlm;/g, '').replace(/&amp;/g, '&');
  function vttFormat(t, toks) {
    const start = new Map((t?.words || []).map(w => [w[2], w[0]]));
    const sents = t?.sentences?.length ? t.sentences : [[0, t?.duration || 0]];
    const cues = sents.map(() => []);
    let k = 0;
    (toks || []).forEach((tok, i) => {
      if (!start.has(i)) { cues[k].push(vttEsc(tok)); return; } // an untimed word stays in the cue it follows
      const s = start.get(i);
      while (k + 1 < sents.length && s >= sents[k + 1][0]) k++;
      cues[k].push(`<${stamp(s)}>${vttEsc(tok)}`);
    });
    return ['WEBVTT', '', `NOTE source ${t?.source || 'estimate'}`, '', ...sents.flatMap(([s, e], j) => [String(j), `${stamp(s)} --> ${stamp(e)}`, cues[j].join(' '), ''])].join('\n');
  }
  function vttParse(text) {
    const blocks = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    if (!/^﻿?WEBVTT(?:[ \t]|\n|$)/.test(blocks[0] || '')) throw new Error('Not a WebVTT file');
    const t = { duration: 0, words: [], sentences: [], source: 'aligned', tokens: [] }, timing = new RegExp(`^\\s*(${STAMP})\\s+-->\\s+(${STAMP})`);
    let next = 0;
    for (const block of blocks.slice(1)) {
      const lines = block.split('\n').filter(l => l.trim());
      if (!lines.length) continue;
      if (/^NOTE(\s|$)/.test(lines[0])) { const m = /^NOTE source (\w+)/.exec(lines[0]); if (m) t.source = m[1]; continue; }
      if (/^(STYLE|REGION)(\s|$)/.test(lines[0])) continue;
      const at = lines.findIndex(l => l.includes('-->')), m = at >= 0 && timing.exec(lines[at]);
      if (!m) continue;
      const id = at > 0 ? lines[0].trim() : '', k = /^\d+$/.test(id) ? +id : next;
      const s = seconds(m[1]), e = seconds(m[2]);
      t.sentences[k] = [s, e]; next = k + 1; t.duration = Math.max(t.duration, e);
      // Other tags (<c>, <v Speaker>, <i>…) are dropped; each word takes the timestamp before it, or the cue's start.
      const payload = lines.slice(at + 1).join(' ').replace(/<\/?(?:c|v|i|b|u|lang|ruby|rt)(?:[.\s][^>]*)?>/g, '');
      const first = t.words.length;
      let when = s;
      payload.split(new RegExp(`<(${STAMP})>`)).forEach((part, j) => {
        if (j % 2) { when = seconds(part); return; }
        for (const tok of part.split(/\s+/).filter(Boolean)) { t.tokens.push(vttText(tok)); t.words.push([when, e, t.tokens.length - 1]); }
      });
      for (let w = first; w < t.words.length - 1; w++) t.words[w][1] = Math.max(t.words[w][0], t.words[w + 1][0]);
    }
    return t;
  }

  /* ---------- sentences as text arrives (an AI answer, streamed) ---------- */
  // push() returns the sentences that are now certain; flush() the rest at the end. A full stop is only taken once white
  // space follows it (the next piece may make "3." into "3.5"), and the abbreviation and initials rules decide as in
  // sentences(). A sentence longer than `max` is cut at , ; : (as utterances() does past 220), eagerly once it passes `max`
  // while still arriving. Joined, the pieces are exactly sentences(text) cut the same way, however the text was split.
  function segmenter({ max = 300 } = {}) {
    let buf = '', long = false;
    function take(final) {
      const t = buf.replace(/\s+/g, ' ').replace(/^ /, ''), out = [];
      let from = 0;
      for (const m of t.matchAll(END)) {
        const end = m.index + m[0].length;
        if (!final && end >= t.length) break;
        if (/^\.(?!\.)/.test(m[0]) && end < t.length && keeps(t.slice(from, m.index))) continue;
        const s = t.slice(from, end).trim();
        if (s) out.push(...(long || s.length > max ? cut(s) : [s]));
        long = false; from = end;
      }
      let rest = t.slice(from);
      if (final) { const s = rest.trim(); if (s) out.push(...(long || s.length > max ? cut(s) : [s])); rest = ''; long = false; }
      else if (long || rest.trim().length > max) {
        const parts = cut(rest.replace(/^ /, ''));
        if (parts.length > 1) { long = true; out.push(...parts.slice(0, -1)); rest = parts[parts.length - 1] + (/\s$/.test(rest) ? ' ' : ''); }
      }
      buf = rest;
      return out.filter(Boolean);
    }
    return { push: delta => { buf += String(delta ?? ''); return take(false); }, flush: () => take(true) };
  }

  /* ---------- lexicon ---------- */
  const LEXICON = {
    version: 1,
    entries: [
      // Vitruvius, the figure in VM's logo, opens his dialogue (Personal Genius) with "Ave", the Latin greeting: "ah-way",
      // never the English "ave". Only where it starts a sentence, so an address ("Fifth Ave") is left alone.
      { word: 'Ave', sub: 'ah-way', ipa: 'ˈɑːweɪ', at: 'start' },
    ],
  };
  const BEFORE = { start: String.raw`(?<=^|[.!?…]["'’”)\]]*\s|["“‘(\[])`, any: String.raw`(?<![\p{L}\p{N}])` };
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lexRe = e => new RegExp(BEFORE[e.at === 'start' ? 'start' : 'any'] + reEsc(e.word) + String.raw`(?![\p{L}\p{N}'’-])`, 'gu');
  function lexApply(text, wrap, esc = s => s) {
    const t = canon(text), hits = [];
    for (const e of LEXICON.entries) for (const m of t.matchAll(lexRe(e))) hits.push({ at: m.index, end: m.index + m[0].length, e, word: m[0] });
    hits.sort((a, b) => a.at - b.at);
    let out = '', pos = 0;
    for (const h of hits) { if (h.at < pos) continue; out += esc(t.slice(pos, h.at)) + wrap(h); pos = h.end; }
    return out + esc(t.slice(pos));
  }
  const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const lexicon = {
    version: LEXICON.version,
    entries: LEXICON.entries,
    /** The text as SSML content: escaped, each lexicon word wrapped in <sub alias>. */
    ssml: text => lexApply(text, h => `<sub alias="${xml(h.e.sub)}">${xml(h.word)}</sub>`, xml),
    /** The text with each lexicon word spelt as said, for a voice that takes no SSML. */
    respell: text => lexApply(text, h => h.e.sub),
  };

  /* ---------- clip keys ---------- */
  async function key({ engine, voice, text, norm = NORM.plain }) {
    const subtle = root.crypto?.subtle;
    if (!subtle) throw new Error('PRPVoice.key needs Web Crypto (an https or localhost page)');
    const data = new TextEncoder().encode(JSON.stringify([SCHEMA, String(engine), String(voice), String(norm), LEXICON.version, canon(text)]));
    return [...new Uint8Array(await subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- voice ids ---------- */
  const ONLINE = /^azure:[A-Za-z]{2,3}-[A-Za-z]{2,4}-\w+$/; // engines reached through the proxy
  const isOnline = v => ONLINE.test(String(v ?? ''));
  const deviceName = v => (v == null || v === '' || isOnline(v) ? null : String(v).replace(/^device:/, ''));
  const voiceId = v => (v == null || v === '' ? null : isOnline(v) ? String(v) : 'device:' + deviceName(v));
  const savedValue = id => (id == null ? null : isOnline(id) ? String(id) : deviceName(id)); // a device voice keeps its plain name

  /* ---------- this device's voices ---------- */
  // Edge's natural voices first (the same family as Azure's), then Chrome's and Apple's British male voices.
  const PREFER = [/Microsoft (Ryan|Thomas|Oliver|Alfie|Elliot|Noah|Ethan).*(Online|Natural)/i, /Microsoft.*(Online|Natural).*United Kingdom/i, /Google UK English Male/i, /^Daniel\b/i, /^Arthur\b/i, /Microsoft George/i, /Microsoft Ryan/i];
  function deviceVoices(o = {}) {
    const synth = () => o.synth || root.speechSynthesis;
    const Utterance = () => o.Utterance || root.SpeechSynthesisUtterance;
    const has = () => !!synth() && typeof Utterance() === 'function';
    const voices = () => (has() ? synth().getVoices().filter(v => /^en(-|_)/i.test(v.lang)) : []);
    function pick(v) {
      const all = voices(), name = deviceName(v);
      if (name) { const x = all.find(y => y.name === name); if (x) return x; }
      for (const re of PREFER) { const x = all.find(y => re.test(y.name) && /GB|UK|United Kingdom/i.test(y.lang + y.name)); if (x) return x; }
      return all.find(y => /en-GB/i.test(y.lang)) || all[0] || null;
    }
    /** British voices first, then the other English ones. */
    const list = () => { const all = voices(); return [...all.filter(v => /en-GB/i.test(v.lang)), ...all.filter(v => !/en-GB/i.test(v.lang))]; };
    const onChange = fn => { if (has()) synth().addEventListener?.('voiceschanged', fn); };
    return { synth, Utterance, has, voices, pick, list, onChange };
  }

  /* ---------- backend: Web Speech ---------- */
  // Kino's speakOne/timeOne/schedule and the Documentary's speak(), as they were. The defaults are Kino's; the Documentary
  // passes { watchdog: false, resumeQueue: false, withoutVoices: 'speak', withoutSpeech: 'wait', errors: 'continue' }:
  //   watchdog       give up on an utterance well after it should have ended (some engines never send "end")
  //   resumeQueue    resume the queue after speak() (Chrome can leave it paused)
  //   gap            ms between a cancel() of speech in progress and the next utterance (Chrome can drop one queued at once)
  //   withoutVoices  'estimate': no voice installed means Captions only timing; 'speak': speak anyway, with the default voice
  //   withoutSpeech  'estimate': no speech engine means Captions only timing; 'wait': wait 60 ms a character (at most 9 s)
  //   errors         'stop': an utterance cut off by something else (interrupted or cancelled, but not by stop()) ends the
  //                  reading ({ reason: 'error' }), and one that fails otherwise counts as said; 'continue': on to the next
  //                  utterance whatever happened
  // Words: boundary events (wordAt), the first word on "start", and the estimate after 450 ms when a voice sends none. The
  // estimate stops when its utterance ends, so a voice faster than the estimate leaves no stale highlight behind.
  // o.synth, o.Utterance, o.raf, o.caf and o.now replace the browser's in the tests.
  const WEBSPEECH = {
    kino: {},
    documentary: { watchdog: false, resumeQueue: false, withoutVoices: 'speak', withoutSpeech: 'wait', errors: 'continue' },
  };
  function webspeech(opt = {}) {
    const o = { pitch: 0.94, gap: 90, watchdog: true, resumeQueue: true, withoutVoices: 'estimate', withoutSpeech: 'estimate', errors: 'stop', waitPerChar: 60, waitMax: 9000, ...opt };
    const dv = deviceVoices(o), clock = o.now || clockNow;
    const raf = f => (o.raf ? o.raf(f) : root.requestAnimationFrame ? root.requestAnimationFrame(f) : setTimeout(() => f(clock()), 16));
    const caf = id => (o.caf ? o.caf(id) : root.cancelAnimationFrame ? root.cancelAnimationFrame(id) : clearTimeout(id));
    let token = 0, timer = 0, frame = 0, pending = null, boundaryMode = false, estimating = null, busyStopAt = -Infinity;
    const stopEstimate = () => { estimating = null; caf(frame); };

    // The estimate, ticking on animation frames until the unit's time is up (or a boundary event takes over).
    function schedule(u, rate, my, ev, words, t0 = clock()) {
      const t = estimate(u, { rate }), dur = t.duration * 1000;
      if (!words || !u.words.length) return dur;
      const tl = timeline(t);
      estimating = u;
      const tick = () => {
        if (my !== token || boundaryMode || estimating !== u) return;
        const p = clock() - t0;
        ev.onWord(tl.at(p / 1000).word);
        if (p < dur) frame = raf(tick);
      };
      frame = raf(tick);
      return dur;
    }
    function timeOne(u, so, my, ev, words) {
      return new Promise(resolve => {
        boundaryMode = false;
        pending = resolve;
        const dur = schedule(u, valueOf(so.rate, 1), my, ev, words);
        timer = setTimeout(() => { if (pending === resolve) pending = null; resolve(my === token); }, dur + 380);
      });
    }
    function speakOne(u, so, my, ev, words) {
      return new Promise(resolve => {
        const s = dv.synth(), utt = new (dv.Utterance())(u.text);
        const v = dv.pick(valueOf(so.voice, null));
        if (v) { utt.voice = v; utt.lang = v.lang; } else utt.lang = 'en-GB';
        utt.rate = valueOf(so.rate, 1); utt.pitch = o.pitch;
        boundaryMode = false;
        let settled = false, fallback = 0, watchdog = 0;
        const finish = ok => {
          if (settled) return;
          settled = true; clearTimeout(watchdog); clearTimeout(fallback);
          if (estimating === u) stopEstimate();
          if (pending === finish) pending = null;
          resolve(ok);
        };
        pending = finish;
        if (words) {
          utt.onboundary = e => { if (my !== token) return; if (e.name && e.name !== 'word') return; boundaryMode = true; ev.onWord(wordAt(u, e.charIndex)); };
          utt.onstart = () => { if (my === token && !boundaryMode && u.words.length) ev.onWord(u.words[0].i); };
          // Voices that send no word boundaries: highlight by estimate once speech has had a moment to start.
          fallback = setTimeout(() => { if (!boundaryMode && my === token) schedule(u, utt.rate, my, ev, true); }, 450);
        }
        utt.onend = () => finish(my === token);
        utt.onerror = e => finish(my === token && e.error !== 'interrupted' && e.error !== 'canceled');
        // Some engines never fire "end": give up well after the sentence should have finished.
        if (o.watchdog) watchdog = setTimeout(() => finish(my === token), Math.max(6000, (u.text.length / (CHARS_PER_SEC * utt.rate)) * 2500 + 4000));
        s.speak(utt);
        if (o.resumeQueue && s.paused) s.resume();
      });
    }
    // The Documentary's rule with no speech engine at all: wait about as long as the passage would take to read.
    const wait = (ms, my) => new Promise(resolve => {
      pending = ok => { clearTimeout(timer); resolve(ok); };
      timer = setTimeout(() => { pending = null; resolve(my === token); }, ms);
    });

    return {
      id: 'webspeech',
      device: dv,
      async voices() { return dv.list().map(v => ({ id: 'device:' + v.name, name: v.name, engine: 'device', lang: v.lang, lifelike: /\b(Natural|Online)\b/i.test(v.name) })); },
      async canSay() { return true; }, // the last resort: with no voice it still times the captions
      pause: () => false,
      resume() {},
      stop() {
        token++;
        // Cancel first, then look: Edge and Chrome are idle at once and restart without the gap; an engine that still
        // reports speaking after cancel() gets the 90 ms it needs.
        if (dv.has()) { const s = dv.synth(); s.cancel(); if (s.speaking || s.pending) busyStopAt = clock(); }
        clearTimeout(timer); stopEstimate();
        const p = pending; pending = null; p?.(false);
      },
      async say(p, so, ev) {
        const my = ++token, units = p.units || [], from = Math.max(0, so.from || 0), words = typeof ev.onWord === 'function';
        const stopped = k => ({ done: false, sentence: k, reason: 'stopped' });
        if (!dv.has() && o.withoutSpeech === 'wait') {
          const ok = await wait(Math.min(o.waitMax, o.waitPerChar * String(p.text ?? '').length), my);
          return ok ? { done: true, sentence: Math.max(0, units.length - 1) } : stopped(from);
        }
        const useVoice = !so.silent && dv.has() && (o.withoutVoices === 'speak' || dv.voices().length > 0);
        const gapLeft = o.gap - (clock() - busyStopAt);
        if (gapLeft > 0) await sleep(gapLeft);
        if (my !== token) return stopped(from);
        ev.onStart?.(null);
        for (let k = from; k < units.length; k++) {
          if (my !== token) return stopped(k);
          ev.onSentence?.(k);
          const ok = useVoice ? await speakOne(units[k], so, my, ev, words) : await timeOne(units[k], so, my, ev, words);
          if (my !== token) return stopped(k);
          if (!ok && o.errors !== 'continue') return { done: false, sentence: k, reason: 'error' };
        }
        return { done: true, sentence: Math.max(0, units.length - 1) };
      },
    };
  }

  /* ---------- backend: an online voice through the site's proxy ---------- */
  // GET <endpoint>voices once a page (is it set up, which voices); POST <endpoint>say { text, voice, lang, norm, private }
  // per unit → the clip (audio/mpeg) with X-PRP-Voice-Duration, -Key, -Cache and -Timings headers, or JSON { error, reason,
  // retryAfter } with 429 (quota), 503 (not set up, provider down) or another status. Each clip plays on the one <audio>
  // element (unlock() blesses it on iOS); the clock is its currentTime, read every animation frame, against the provider's
  // word timings when the proxy has real ones, else the estimate spread over the clip's length. After a failure the stream
  // stands aside (canSay false) for the Retry-After it was given, or 10 minutes for the quota, 5 when unavailable, 1 for an
  // error, or, when a clip was not allowed to play (iOS before a tap), until the next unlock(); meanwhile the reader falls
  // back to the device voice. Clips are kept in memory (the last `keep`), so a sentence restarted after a pause or a speed
  // change plays at once.
  // Requests. The next sentence (`ahead` of them, and at the last sentence the next passage's first) is asked for only
  // once this sentence's clip has come, so a proxy that fails is asked once, not once for each sentence ahead too: every
  // request that reaches Azure counts, and its free tier takes 20 a minute for the whole site. A request that failed is
  // kept: the reading that asked ahead for that sentence takes the failure when it gets there, however long the sentence
  // before it played (most of Kino's take 7 to 17 s), rather than asking again; another reading takes it only within
  // `keepFailed` ms, and after that asks afresh. Each request gives up after `sayTimeout` ms (a clip) or `voicesTimeout`
  // ms (the probe), through AbortSignal.timeout where the browser has it: no answer in time counts as no answer at all
  // (unavailable, or not set up), and the device voice reads instead of the listener hearing silence until the proxy's
  // own 15 s timeout.
  // Playback. A clip that has not ended by twice its length at its rate, and 5 s more, has stalled (an output or a decoder
  // that hangs, an "ended" that never comes): the watchdog stops it, and the device voice reads on from that sentence. It
  // counts only while the clip should be heard: a pause, this backend's own (pause()) or the system's (headphones, a call),
  // holds it, and playing again gives it what is left of the clip, afresh.
  // o.fetch, o.Audio, o.raf, o.caf, o.now and o.abortAfter (AbortSignal.timeout) replace the browser's.
  const SILENT = silentWav(0.05);
  function stream(opt = {}) {
    const o = { endpoint: '/api/voice/v1/', ahead: 1, keep: 12, keepFailed: 5000, sayTimeout: 8000, voicesTimeout: 5000, ...opt };
    const clock = o.now || (() => Date.now());
    const http = (...a) => (o.fetch || root.fetch)(...a);
    // A signal that gives up on a request after `ms` (as the shell's abortAfter); none in a browser without
    // AbortSignal.timeout, which waits as before.
    const abortAfter = ms => (o.abortAfter ? o.abortAfter(ms) : typeof root.AbortSignal?.timeout === 'function' ? root.AbortSignal.timeout(ms) : undefined);
    const raf = f => (o.raf ? o.raf(f) : root.requestAnimationFrame ? root.requestAnimationFrame(f) : setTimeout(f, 16));
    const caf = id => (o.caf ? o.caf(id) : root.cancelAnimationFrame ? root.cancelAnimationFrame(id) : clearTimeout(id));
    const clips = new Map(); // voice + text → Promise<{ url, duration, timings, key, cache }>, marked failedAt (ms) if it failed
    let probe = null, list = [], el = null, unlocked = false, token = 0, frame = 0, waiting = null, blocked = null, silentUrl = null, watchdog = 0;
    const element = () => (el ||= Object.assign(new (o.Audio || root.Audio)(), { preload: 'auto' }));

    function available() {
      return (probe ||= Promise.resolve().then(() => http(o.endpoint + 'voices', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: abortAfter(o.voicesTimeout) }))
        .then(r => (r.ok ? r.json() : null))
        .then(j => (j && j.available === true && Array.isArray(j.voices) ? j : { available: false, voices: [] }))
        .catch(() => ({ available: false, voices: [] }))
        .then(j => { list = j.voices.filter(v => isOnline(v.id)).map(v => ({ id: v.id, name: String(v.name || v.id), label: String(v.label || v.name || v.id), engine: v.id.split(':')[0], lang: String(v.lang || 'en-GB'), lifelike: true })); return j; }));
    }
    const block = (reason, s) => { blocked = { reason, until: clock() + 1000 * (s || { quota: 600, unavailable: 300 }[reason] || 60) }; };
    const isBlocked = () => !!blocked && clock() < blocked.until;

    // by: the reading asking (say()'s token), so that a failure it asked for ahead is still its own when it gets there.
    function clip(u, voice, p, by = 0) {
      const id = `${voice}\n${p.private ? 'private\n' : ''}${canon(u.text)}`;
      let c = clips.get(id);
      if (c) {
        clips.delete(id);
        // Asked for already, or on its way: shared, most recently used last. A failure: for the reading that asked for it,
        // whenever it gets there; for any other, only keepFailed ms after it.
        if (c.failedAt == null || (by && c.by === by) || clock() - c.failedAt <= o.keepFailed) { clips.set(id, c); return c; }
      }
      c = (async () => {
        const res = await http(o.endpoint + 'say', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg, application/json' },
          body: JSON.stringify({ text: u.text, voice, lang: p.lang || 'en-GB', norm: p.norm || NORM.plain, private: !!p.private }), signal: abortAfter(o.sayTimeout) });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          const reason = res.status === 429 && j.error !== 'rate' ? 'quota' : res.status === 503 || res.status === 404 || res.status === 405 ? 'unavailable' : 'error';
          throw Object.assign(new Error(j.reason || j.error || `HTTP ${res.status}`), { reason, retryAfter: +res.headers.get('Retry-After') || +j.retryAfter || 0 });
        }
        const head = n => res.headers.get('X-PRP-Voice-' + n);
        let timings = null;
        try { timings = JSON.parse(head('Timings') || 'null'); } catch { /* none */ }
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob), duration: +head('Duration') || 0, key: head('Key') || '', cache: head('Cache') || '', timings };
      })();
      c.by = by;
      clips.set(id, c);
      c.catch(() => { c.failedAt = clock(); }); // kept (above): the reading that asked ahead takes it, not a new request
      while (clips.size > o.keep) { const [k, old] = clips.entries().next().value; clips.delete(k); old.then(x => URL.revokeObjectURL(x.url), () => {}); }
      return c;
    }
    // The proxy's word timings are over the words of the text it was sent; a unit's words can be fewer (Kino says "1939–1945"
    // as three), so each spoken word maps to the displayed word that contains it.
    function displayed(t, u) {
      const starts = [];
      for (let at = 0; at <= u.text.length;) { starts.push(at); const sp = u.text.indexOf(' ', at); if (sp < 0) break; at = sp + 1; }
      const words = [];
      for (const [s, e, j] of t.words || []) { const i = wordAt(u, starts[j] ?? 0); if (words.length && words[words.length - 1][2] === i) words[words.length - 1][1] = e; else words.push([s, e, i]); }
      return { ...t, words };
    }
    // One clip on the element; resolves 'ended', 'stopped', 'error' (it would not play through, or it stalled), 'locked'
    // (not allowed to play before a tap: iOS) or 'unavailable' (it will not play at all here).
    function play(c, u, so, ev, my) {
      return new Promise(resolve => {
        const a = element(), rate = valueOf(so.rate, 1);
        let tl = null, last = null, over = false;
        // The watchdog (above): what is left of the clip after `at` seconds, twice over at this rate, and 5 s more. The
        // clip's length is the proxy's, the element's once it knows, or the text's at Web Speech pace, whichever is longest.
        const length = () => Math.max(c.duration || 0, Number.isFinite(a.duration) ? a.duration : 0, u.text.length / CHARS_PER_SEC);
        const hold = () => { clearTimeout(watchdog); watchdog = 0; };
        const arm = (at = 0) => { hold(); watchdog = setTimeout(stalled, (Math.max(0, length() - at) / rate) * 2000 + 5000); };
        const done = why => { if (over) return; over = true; hold(); if (waiting === done) waiting = null; caf(frame); a.onended = a.onerror = a.onpause = a.onplay = null; resolve(why); };
        // Stalled: stopped, so it cannot start up later over the device voice (unless it did end, and only "ended" was lost).
        const stalled = () => { if (over) return; if (a.ended) { done('ended'); return; } a.pause(); done('error'); };
        waiting = Object.assign(done, { hold, arm: () => arm(a.currentTime || 0) }); // pause() and resume() hold and arm it
        a.onended = () => done('ended');
        a.onerror = () => done('error');
        a.onpause = () => { if (!over && a.paused) hold(); }; // the system's pause (headphones, a call): the clip waits, so does the watchdog
        a.onplay = () => { if (!over && !a.paused) arm(a.currentTime || 0); };
        a.src = c.url;
        a.defaultPlaybackRate = rate; a.playbackRate = rate; a.preservesPitch = true; // after src: a new source resets the rate
        const tick = () => {
          if (my !== token || over) return;
          if (!tl) {
            const d = c.duration || (Number.isFinite(a.duration) ? a.duration : 0);
            if (d) tl = timeline(c.timings?.words?.length && c.timings.source !== 'estimate' ? displayed(c.timings, u) : estimate(u, { duration: d }));
          }
          if (tl) { const w = tl.at(a.currentTime).word; if (w >= 0 && w !== last) { last = w; ev.onWord?.(w); } }
          frame = raf(tick);
        };
        arm();
        let started;
        try { started = a.play(); } catch (e) { started = Promise.reject(e); }
        Promise.resolve(started).then(() => { if (my === token && !over) { if (u.words.length) { last = u.words[0].i; ev.onWord?.(last); } tick(); } },
          e => done(e?.name === 'NotAllowedError' ? 'locked' : 'unavailable'));
      });
    }

    const b = {
      id: 'stream',
      available,
      async voices() { await available(); return list.slice(); },
      async canSay(p, so) {
        const v = valueOf(so.voice, null);
        if (so.silent || !isOnline(v) || isBlocked()) return false;
        await available();
        return list.some(x => x.id === v);
      },
      async say(p, so, ev) {
        const my = ++token, units = p.units || [], voice = valueOf(so.voice, null);
        const stopped = k => ({ done: false, sentence: k, reason: 'stopped' });
        let first = true;
        for (let k = Math.max(0, so.from || 0); k < units.length; k++) {
          if (my !== token) return stopped(k);
          let c;
          try { c = await clip(units[k], voice, p, my); } catch (e) {
            if (my !== token) return stopped(k);
            const reason = e?.reason || 'unavailable'; // no answer at all, or none in time: offline, or the proxy hangs
            block(reason, e?.retryAfter);
            return { done: false, sentence: k, reason };
          }
          if (my !== token) return stopped(k);
          // The proxy has answered for this sentence: now the next, while this one plays (and at the last sentence the next
          // passage's first). Asked any sooner, a proxy that fails would be asked for every sentence ahead as well.
          for (let j = 1; j <= o.ahead && k + j < units.length; j++) clip(units[k + j], voice, p, my).catch(() => {});
          if (k === units.length - 1 && so.next?.units?.length) clip(so.next.units[0], voice, so.next).catch(() => {});
          if (first) { first = false; ev.onStart?.(null); }
          ev.onSentence?.(k);
          const end = await play(c, units[k], so, ev, my);
          if (my !== token || end === 'stopped') return stopped(k);
          // Refused for want of a tap: aside until the next Play tap (unlock) rather than for minutes.
          if (end === 'locked') { blocked = { reason: 'locked', until: Infinity }; return { done: false, sentence: k, reason: 'unavailable' }; }
          if (end !== 'ended') { block(end); return { done: false, sentence: k, reason: end }; }
        }
        return { done: true, sentence: Math.max(0, units.length - 1) };
      },
      // A passage's first sentence, fetched now (a read's `next` is fetched when its last sentence starts).
      async prefetch(p, so = {}) {
        const u = p.units?.[0];
        if (u && (await b.canSay(p, so))) clip(u, valueOf(so.voice, null), p).catch(() => {});
      },
      pause() { if (el && waiting && !el.paused) { el.pause(); waiting.hold(); return true; } return false; },
      resume() { if (el && waiting && el.paused) { el.play().catch(() => {}); waiting.arm(); } },
      stop() { token++; caf(frame); if (el && !el.paused) el.pause(); const w = waiting; waiting = null; w?.('stopped'); },
      // Only for an online voice: on iOS even a silent clip takes over the phone's audio (another app's music stops).
      unlock(so) {
        if (so && !isOnline(valueOf(so.voice, null))) return;
        if (blocked?.reason === 'locked') blocked = null; // a tap: clips may play now
        const a = element();
        if (unlocked || waiting || !a.paused) return; // never under a clip, even a paused one
        unlocked = true;
        try {
          a.src = silentUrl ||= dataUri(SILENT);
          Promise.resolve(a.play()).then(() => { if (!waiting && a.src === silentUrl) a.pause(); }, e => { if (e?.name === 'NotAllowedError') unlocked = false; });
        } catch { unlocked = false; }
      },
    };
    return b;
  }

  /* ---------- the reader ---------- */
  function reader(opt = {}) {
    const order = opt.order || ['prerendered', 'stream', 'webspeech'];
    const backends = opt.backends || {};
    const split = opt.utterances || utterances;
    const norm = opt.norm || NORM.plain;
    const all = () => order.map(id => backends[id]).filter(Boolean);
    let token = 0, current = null, active = null, sentence = 0, queue = [], pumping = null, spoke = null;
    const passage = input => {
      const p = typeof input === 'string' ? { text: input } : { ...(input || {}) };
      p.text = String(p.text ?? '');
      p.units ||= split(p.text);
      p.norm ||= norm;
      return p;
    };
    const canSay = async (b, p, o) => { try { return !!(await b.canSay(p, o)); } catch { return false; } };
    function cueing(p) {
      const cues = (p.cues || []).map(c => ({ c, fired: false }));
      const run = test => { for (const x of cues) if (!x.fired && test(x.c)) { x.fired = true; opt.onCue?.(x.c); } };
      return {
        sentence: k => run(c => (c.sentence != null && c.sentence <= k) || (c.after != null && c.after < k)),
        word: i => run(c => c.word != null && c.word <= i),
        end: () => run(c => c.after != null || c.sentence != null || c.word != null),
      };
    }
    function stopAll() { for (const b of all()) { try { b.stop(); } catch { /* keep stopping the others */ } } }
    async function readOne(input, o = {}) {
      if (current !== null) { token++; stopAll(); } // a reading in progress gives way
      const my = ++token;
      current = my;
      sentence = Math.max(0, o.from || 0); // a new reading starts at its own first sentence, not where the last one stopped
      const p = passage(input), cues = cueing(p);
      const ev = {
        onStart: t => { if (my === token) opt.onStart?.(t); },
        onSentence: k => { if (my !== token) return; sentence = k; opt.onSentence?.(k); cues.sentence(k); },
        onWord: opt.onWord || opt.onCue ? i => { if (my !== token) return; opt.onWord?.(i); cues.word(i); } : undefined,
      };
      const next = o.next != null ? passage(o.next) : undefined;
      let from = Math.max(0, o.from || 0), why = null, after = null;
      try {
        for (const b of all()) {
          if (my !== token) return { done: false, sentence: from, backend: active?.id || null, reason: 'stopped' };
          if (!(await canSay(b, p, { ...o, from, next }))) continue;
          if (my !== token) return { done: false, sentence: from, backend: active?.id || null, reason: 'stopped' };
          active = b;
          if (spoke !== b.id || why) { spoke = b.id; opt.onBackend?.(b.id, why ? { reason: why, after } : null); }
          let r;
          try { r = await b.say(p, { ...o, from, next }, ev); } catch { r = { done: false, sentence: from, reason: 'error' }; }
          r = { ...r, backend: b.id };
          if (my !== token) return { ...r, done: false, reason: 'stopped' };
          if (r.done) { cues.end(); return r; }
          if (r.reason === 'stopped' || !r.reason) return r;
          from = r.sentence ?? from; why = r.reason; after = b.id; // the next backend reads on from this sentence
        }
        return { done: false, sentence: from, backend: active?.id || null, reason: why || 'unavailable' };
      } finally { if (current === my) current = null; }
    }
    function pump() {
      if (pumping) return;
      pumping = (async () => {
        while (queue.length) {
          const [input, o] = queue.shift();
          const res = await readOne(input, queue.length ? { ...o, next: queue[0][0] } : o); // the next one, fetched ahead
          if (res.reason === 'stopped') break;
        }
      })().finally(() => { pumping = null; });
    }
    const r = {
      get sentence() { return sentence; },
      get backend() { return active?.id || null; },
      get reading() { return current !== null; },
      backends,
      unlock(o) { for (const b of all()) { try { b.unlock?.(o); } catch { /* never in the way of Play */ } } },
      read(input, o = {}) { queue = []; return readOne(input, o); },
      async prefetch(input, o = {}) {
        const p = passage(input);
        for (const b of all()) { if (await canSay(b, p, o)) { try { b.prefetch?.(p, o); } catch { /* only a head start */ } return; } }
      },
      pause() {
        if (current === null || !active) return false;
        if (active.pause?.()) return true; // paused in place: read() carries on after resume()
        token++; current = null; stopAll(); return false; // stopped: read again from r.sentence
      },
      resume() { active?.resume?.(); },
      stop() { token++; current = null; queue = []; stopAll(); },
      enqueue(input, o = {}) {
        queue.push([input, o]);
        if (pumping && queue.length === 1) r.prefetch(input, o); // arrived while one is being read: it is next, fetch ahead
        pump();
      },
      finish() { return pumping || Promise.resolve(); },
    };
    return r;
  }

  /* ---------- small things ---------- */
  // A silent clip (8 kHz, 8-bit mono WAV) for unlock(), and for the tests' fake endpoint.
  function silentWav(secs = 0.05, rate = 8000) {
    const n = Math.max(1, Math.round(secs * rate)), b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    const str = (at, s) => { for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
    b.fill(0x80, 44);
    return b;
  }
  function dataUri(bytes, type = 'audio/wav') { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return `data:${type};base64,${btoa(s)}`; }

  root.PRPVoice = {
    SCHEMA, NORM, CHARS_PER_SEC, PREFER, WEBSPEECH,
    canon, tokens, sentences, unit, utterances, wordAt, estimate, timeline, segmenter,
    vtt: { format: vttFormat, parse: vttParse },
    lexicon, key, isOnline, voiceId, deviceName, savedValue,
    deviceVoices, webspeech, stream, reader, silentWav, dataUri,
  };
})();

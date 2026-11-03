// PRP voice (design/prp-voice.js), the narration layer the Documentary reader and Kino speak through: clip keys, WebVTT,
// timelines, the sentence segmenter and the lexicon; the reader's fallback chain with fake backends; and the two real
// backends driven with fakes (a fake speechSynthesis for Web Speech, a fake fetch and <audio> for the online stream),
// checked against what the two readers did before this file existed (the same utterances, voice, rate and pitch, the same
// word timing). No audio device, network or secret is needed. The page tests, which play Kino and the Documentary through
// the stream backend against a fake endpoint the test itself serves (Playwright routes), run when JDPI_URL is set (e.g.
// JDPI_URL=http://localhost:8787), and never with PRP_PAGES=0.
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../design/prp-voice.js';
import '../design/jdpi-documentary.js';
import '../design/jdpi-narrator.js';
import { utterances as kinoUtterances, wordAt as kinoWordAt, tokens as kinoTokens } from '../kino/lib/text.js';
import { flatScenes } from '../kino/lib/format.js';
import { pageTest, launch } from './tools/pages.mjs';

const V = globalThis.PRPVoice, S = globalThis.PRPSpeech, N = globalThis.PRPNarrator;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const flush = () => new Promise(r => setImmediate(r));
// Every narration in Kino, the corpus the parity checks run over.
const NARRATIONS = read('kino/data/index.json').docs.flatMap(d => flatScenes(read(`kino/data/${d.path}`)).map(s => s.narration));
const SAMPLES = ['World War II, or the Second World War, killed 70–85 million people (about 3.5% of the 1940 population). The U.S. entered in 1941. It ended in 1945.',
  'Dr. Smith wrote e.g. this. Then St. Paul spoke at 3.5 p.m. Done!', 'jdpi.pages.dev is Vitruvian Manager. It is free… Isn’t it?',
  'He said "Stop." Then he left', 'Is it over? Yes! It ends here… Or not.', 'U.S. forces landed. The war ended.', 'John F. Kennedy was shot in 1963. Oswald fired.'];

/* ---------- text and timing ---------- */
describe('pure parts', () => {
  test('sentences: the same rule as PRPSpeech and the narrator, over every Kino narration', () => {
    assert.ok(NARRATIONS.length > 200, `${NARRATIONS.length} narrations`);
    for (const s of [...SAMPLES, ...NARRATIONS]) {
      assert.deepEqual(V.sentences(s), S.sentences(s), s);
      assert.deepEqual(V.sentences(s), N.sentences(s), s);
    }
  });

  test('plain units: the Documentary\'s 220-character cut, words numbered across the passage', () => {
    const long = `${'A long clause about the war, '.repeat(9)}and the end. Short one.`;
    const us = V.utterances(long);
    assert.deepEqual(us.map(u => u.text), S.utterances(long), 'cut where PRPSpeech cuts');
    assert.deepEqual(us.flatMap(u => u.words.map(w => w.i)), V.tokens(long).map((_, i) => i));
    for (const u of us) for (const w of u.words) assert.equal(u.text.slice(w.from, w.to), V.tokens(long)[w.i]);
  });

  test('wordAt: Kino\'s rule', () => {
    for (const text of NARRATIONS.slice(0, 40)) for (const u of kinoUtterances(text)) {
      for (let c = 0; c < u.text.length; c += 3) assert.equal(V.wordAt(u, c), kinoWordAt(u, c));
    }
  });

  test('estimate: Kino\'s word timing (share by length, a pause after , ; :), at a rate or over a clip', () => {
    const [u] = kinoUtterances('Germany, with Slovakia, invaded Poland on 1 September 1939.');
    // Kino's own schedule(): weights, the duration at 14.2 characters a second × rate, and each word's mark.
    const ws = u.words.map(w => (w.to - w.from) + 1.5 + (/[,;:]$/.test(u.text.slice(w.from, w.to)) ? 4 : 0));
    const total = ws.reduce((a, b) => a + b, 0), marks = ws.map((_, k) => ws.slice(0, k).reduce((a, b) => a + b, 0) / total);
    const t = V.estimate(u, { rate: 0.92 });
    assert.ok(Math.abs(t.duration - total / (14.2 * 0.92)) < 1e-9);
    t.words.forEach(([s, , i], k) => { assert.ok(Math.abs(s - marks[k] * t.duration) < 1e-9); assert.equal(i, u.words[k].i); });
    const clip = V.estimate(u, { duration: 4 });
    assert.equal(clip.duration, 4); assert.deepEqual(clip.sentences, [[0, 4]]); assert.equal(clip.source, 'estimate');
    assert.ok(Math.abs(clip.words.at(-1)[1] - 4) < 1e-9, 'the last word ends with the clip');
  });

  test('timeline: the word and sentence being said at a moment', () => {
    const t = { duration: 6, words: [[0.1, 0.5, 0], [0.5, 1.2, 1], [1.2, 2.9, 2], [3.1, 4, 3], [4, 6, 4]], sentences: [[0, 3], [3, 6]], source: 'aligned' };
    const tl = V.timeline(t);
    assert.deepEqual(tl.at(0), { word: 0, sentence: 0 }, 'before the first word: the first');
    assert.deepEqual(tl.at(0.5), { word: 1, sentence: 0 });
    assert.deepEqual(tl.at(3.05), { word: 2, sentence: 1 });
    assert.deepEqual(tl.at(99), { word: 4, sentence: 1 });
    assert.deepEqual(V.timeline({ words: [], sentences: [] }).at(1), { word: -1, sentence: -1 });
  });

  test('WebVTT: one cue per sentence, a timestamp before each word; parse(format(t)) gives t back', () => {
    const toks = ['Germany', 'invaded', 'Poland.', 'Britain', '&', 'France', '<declared>', 'war.'];
    const t = { duration: 5.12, words: [[0.05, 0.52, 0], [0.52, 0.98, 1], [0.98, 2.4, 2], [2.5, 3, 3], [3, 3.2, 4], [3.2, 3.9, 5], [3.9, 4.6, 6], [4.6, 5.12, 7]], sentences: [[0, 2.5], [2.5, 5.12]], source: 'aligned' };
    const vtt = V.vtt.format(t, toks);
    assert.match(vtt, /^WEBVTT\n\nNOTE source aligned\n\n0\n00:00:00\.000 --> 00:00:02\.500\n<00:00:00\.050>Germany <00:00:00\.520>invaded <00:00:00\.980>Poland\.\n\n1\n/);
    assert.match(vtt, /<00:00:03\.000>&amp; <00:00:03\.200>France <00:00:03\.900>&lt;declared&gt;/);
    const back = V.vtt.parse(vtt);
    assert.deepEqual(back.tokens, toks);
    assert.deepEqual(back.sentences, t.sentences);
    assert.equal(back.source, 'aligned');
    assert.equal(back.duration, 5.12);
    // Ends come back as the next word's start within a sentence, and the cue's end for its last word.
    back.words.forEach(([s, e, i], k) => { assert.equal(i, k); assert.ok(Math.abs(s - t.words[k][0]) < 1e-9, `start ${k}`); assert.ok(Math.abs(e - (k === 2 ? 2.5 : t.words[k][1])) < 1e-9, `end ${k}`); });
  });

  test('WebVTT: a file written elsewhere (no ids, settings, other tags, CRLF) parses too', () => {
    const t = V.vtt.parse('WEBVTT - made elsewhere\r\n\r\nNOTE a comment\r\n\r\n00:01.000 --> 00:02.500 align:start\r\n<v Narrator><00:01.000>Hello <00:01.600><c.loud>world</c>\r\n\r\n00:02.500 --> 00:04.000\r\nNo stamps here\r\n');
    assert.deepEqual(t.tokens, ['Hello', 'world', 'No', 'stamps', 'here']);
    assert.deepEqual(t.sentences, [[1, 2.5], [2.5, 4]]);
    assert.deepEqual(t.words.slice(0, 2), [[1, 1.6, 0], [1.6, 2.5, 1]]);
    assert.deepEqual(t.words[2], [2.5, 2.5, 2], 'untimed words take the cue\'s start');
    assert.throws(() => V.vtt.parse('00:01.000 --> 00:02.000\nno header'), /Not a WebVTT/);
  });

  test('segmenter: text arriving in pieces gives exactly the sentences of the whole, however it was split', () => {
    const want = (text, max = 300) => V.sentences(text).flatMap(s => (s.length > max ? s.split(/(?<=[,;:])\s+/) : [s]));
    const longOne = `${'One clause, then another; '.repeat(16)}and an end. ${'More: '.repeat(70)}done. Then a short one.`;
    const corpus = [...SAMPLES, ...NARRATIONS.slice(0, 60), longOne, 'It was 3.5 metres tall. U.S. troops came on No. 2 road. The end', 'Mr.', 'Wait... what?" he said. Ok'];
    let seed = 7;
    const rand = n => { seed = (seed * 16807) % 2147483647; return 1 + (seed % n); };
    for (const text of corpus) {
      for (const size of [1, 2, 5, 13, 'random']) {
        const seg = V.segmenter(), out = [];
        for (let at = 0; at < text.length;) { const n = size === 'random' ? rand(40) : size; out.push(...seg.push(text.slice(at, at + n))); at += n; }
        out.push(...seg.flush());
        assert.deepEqual(out, want(text), `${JSON.stringify(text.slice(0, 50))} in pieces of ${size}`);
      }
    }
    // A sentence is given only once white space follows its full stop, and a long one starts out before it ends.
    const seg = V.segmenter();
    assert.deepEqual(seg.push('It rose 3.'), []);
    assert.deepEqual(seg.push('5 points. Then'), ['It rose 3.5 points.']);
    assert.deepEqual(seg.push(' it fell'), []);
    assert.deepEqual(seg.flush(), ['Then it fell']);
    const eager = V.segmenter({ max: 40 });
    assert.deepEqual(eager.push('First part of a very long sentence, second part of it, and'), ['First part of a very long sentence,', 'second part of it,']);
  });

  test('lexicon: "Ave" is "ah-way" where it starts a sentence (Vitruvius), as SSML <sub>; the rest is escaped', () => {
    assert.equal(V.lexicon.version, 1);
    assert.deepEqual(V.lexicon.entries[0], { word: 'Ave', sub: 'ah-way', ipa: 'ˈɑːweɪ', at: 'start' });
    assert.equal(V.lexicon.ssml('Ave, I am Vitruvius.'), '<sub alias="ah-way">Ave</sub>, I am Vitruvius.');
    assert.equal(V.lexicon.ssml('He said "Ave!" Ave Maria. Then: AT&T <b>'), 'He said &quot;<sub alias="ah-way">Ave</sub>!&quot; <sub alias="ah-way">Ave</sub> Maria. Then: AT&amp;T &lt;b&gt;');
    for (const s of ['He lives on Fifth Ave.', 'Avenue Foch', 'Aves are birds.', 'Have a look', 'Ave-Maria']) assert.doesNotMatch(V.lexicon.ssml(s), /<sub/, s);
    assert.equal(V.lexicon.respell('Ave, Caesar.'), 'ah-way, Caesar.');
  });

  test('clip keys: SHA-256 of the schema, engine, voice, normaliser, lexicon and spoken text', async () => {
    const args = { engine: 'azure/neural/audio-24khz-48kbitrate-mono-mp3', voice: 'en-GB-RyanNeural', text: '  The war   ended. ', norm: V.NORM.kino };
    const want = createHash('sha256').update(JSON.stringify(['prp-voice/1', args.engine, args.voice, 'kino-text@1', 1, 'The war ended.'])).digest('hex');
    assert.equal(await V.key(args), want);
    assert.match(want, /^[0-9a-f]{64}$/);
    assert.equal(await V.key({ ...args, text: 'The war ended.' }), want, 'white space does not matter');
    assert.equal(await V.key({ ...args, text: 'The war endéd.'.normalize('NFD') }), await V.key({ ...args, text: 'The war endéd.'.normalize('NFC') }), 'nor the Unicode form');
    for (const change of [{ engine: 'azure/neural/x' }, { voice: 'en-GB-ThomasNeural' }, { norm: V.NORM.documentary }, { text: 'The war ended!' }]) assert.notEqual(await V.key({ ...args, ...change }), want, JSON.stringify(change));
  });

  test('voice ids: a saved plain name is a device voice; online ids keep their engine', () => {
    assert.equal(V.voiceId('Microsoft Ryan Online (Natural) - English (United Kingdom)'), 'device:Microsoft Ryan Online (Natural) - English (United Kingdom)');
    assert.equal(V.voiceId('device:Daniel'), 'device:Daniel');
    assert.equal(V.voiceId('azure:en-GB-RyanNeural'), 'azure:en-GB-RyanNeural');
    assert.equal(V.voiceId(null), null);
    assert.equal(V.deviceName('device:Daniel'), 'Daniel'); assert.equal(V.deviceName('Daniel'), 'Daniel'); assert.equal(V.deviceName('azure:en-GB-RyanNeural'), null);
    assert.equal(V.savedValue('device:Daniel'), 'Daniel', 'saved as before: by name');
    assert.equal(V.savedValue('azure:en-GB-SoniaNeural'), 'azure:en-GB-SoniaNeural');
    assert.equal(V.isOnline('azure:en-GB-RyanNeural'), true); assert.equal(V.isOnline('azure:'), false); assert.equal(V.isOnline('Daniel'), false);
  });

  test('a silent clip for unlock(): a valid WAV header', () => {
    const w = V.silentWav(0.05);
    assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF'); assert.equal(String.fromCharCode(...w.slice(8, 12)), 'WAVE');
    assert.equal(w.length, 44 + 400);
    assert.match(V.dataUri(w), /^data:audio\/wav;base64,UklGR/);
  });
});

/* ---------- the reader and its fallback chain ---------- */
// A fake backend: canSay says yes (or what `can` says), say() runs `script` (default: read every unit at once).
function fake(id, { can = true, script, pauseInPlace = false } = {}) {
  const b = {
    id, says: [], stops: 0, prefetched: [], unlocks: 0, resumed: 0,
    async voices() { return []; },
    async canSay(p, o) { return typeof can === 'function' ? can(p, o) : can; },
    async say(p, o, ev) {
      b.says.push({ text: p.text, from: o.from, units: p.units.map(u => u.text), norm: p.norm, o });
      if (script) return script(p, o, ev, b);
      for (let k = o.from; k < p.units.length; k++) { ev.onSentence?.(k); for (const w of p.units[k].words) ev.onWord?.(w.i); }
      return { done: true, sentence: p.units.length - 1 };
    },
    prefetch(p) { b.prefetched.push(p.text); },
    pause() { return pauseInPlace; },
    resume() { b.resumed++; },
    stop() { b.stops++; const r = b.release; b.release = null; r?.(); },
    unlock() { b.unlocks++; },
  };
  return b;
}
// say() that speaks until stop(): resolves 'stopped' at the sentence it reached.
const untilStopped = (p, o, ev, b) => new Promise(resolve => { ev.onSentence?.(o.from); b.release = () => resolve({ done: false, sentence: o.from, reason: 'stopped' }); });
const TEXT = 'The war began in 1939. It spread across Europe. It ended in 1945.';

describe('reader', () => {
  test('the first backend that can say the passage says it; ids without a backend are skipped', async () => {
    const stream = fake('stream', { can: (p, o) => o.voice === 'azure:en-GB-RyanNeural' }), web = fake('webspeech');
    const seen = [];
    const r = V.reader({ backends: { stream, webspeech: web }, onBackend: (id, why) => seen.push([id, why]) }); // order: prerendered (absent), stream, webspeech
    assert.deepEqual(await r.read(TEXT, { voice: 'Daniel' }), { done: true, sentence: 2, backend: 'webspeech' });
    assert.deepEqual(await r.read(TEXT, { voice: 'azure:en-GB-RyanNeural' }), { done: true, sentence: 2, backend: 'stream' });
    assert.deepEqual(stream.says.map(s => s.units), [V.utterances(TEXT).map(u => u.text)]);
    assert.deepEqual(seen, [['webspeech', null], ['stream', null]], 'told when the voice changes hands');
  });

  test('a backend that fails mid-passage hands over at that sentence, and the page is told why', async () => {
    const stream = fake('stream', { script: (p, o, ev) => { ev.onSentence(0); ev.onSentence(1); return { done: false, sentence: 1, reason: 'quota' }; } });
    const web = fake('webspeech'), sents = [], seen = [];
    const r = V.reader({ backends: { stream, webspeech: web }, onSentence: k => sents.push(k), onBackend: (id, why) => seen.push([id, why]) });
    const res = await r.read(TEXT, { voice: 'azure:en-GB-RyanNeural' });
    assert.deepEqual(res, { done: true, sentence: 2, backend: 'webspeech' });
    assert.equal(web.says[0].from, 1, 'the device voice reads on from the sentence the stream stopped at');
    assert.deepEqual(sents, [0, 1, 1, 2]);
    assert.deepEqual(seen, [['stream', null], ['webspeech', { reason: 'quota', after: 'stream' }]]);
    // Nothing can say it at all: the reason comes back.
    const none = V.reader({ backends: { webspeech: fake('webspeech', { script: () => ({ done: false, sentence: 0, reason: 'error' }) }) } });
    assert.deepEqual(await none.read(TEXT), { done: false, sentence: 0, backend: 'webspeech', reason: 'error' });
  });

  test('stop() ends a reading at its sentence; a new read() takes over from one in progress; stale events are dropped', async () => {
    const web = fake('webspeech', { script: untilStopped }), words = [];
    const r = V.reader({ backends: { webspeech: web }, onWord: i => words.push(i) });
    const first = r.read(TEXT, { from: 1 });
    await flush();
    assert.equal(r.reading, true); assert.equal(r.sentence, 1);
    r.stop();
    assert.deepEqual(await first, { done: false, sentence: 1, reason: 'stopped', backend: 'webspeech' });
    assert.equal(r.reading, false);
    const a = r.read(TEXT);
    await flush();
    const evOld = web.says.at(-1);
    const b = r.read('Another passage.');
    assert.equal((await a).reason, 'stopped', 'the first reading gave way');
    web.release?.(); await b;
    assert.ok(web.stops >= 2);
    assert.ok(evOld, 'the old reading had started');
  });

  test('silent (Captions only) and other options reach the backend; units and normaliser are the reader\'s', async () => {
    const web = fake('webspeech'), stream = fake('stream', { can: (p, o) => !o.silent });
    const units = text => [{ text: text.toUpperCase(), words: [{ i: 0, from: 0, to: 3 }] }];
    const r = V.reader({ backends: { stream, webspeech: web }, utterances: units, norm: V.NORM.kino });
    await r.read('abc', { silent: true, rate: 1.2 });
    assert.equal(stream.says.length, 0);
    assert.deepEqual(web.says[0].units, ['ABC']);
    assert.equal(web.says[0].norm, 'kino-text@1');
    assert.equal(web.says[0].o.rate, 1.2); assert.equal(web.says[0].o.silent, true);
  });

  test('cues fire once, at their word, sentence, or the end of a sentence', async () => {
    const fired = [];
    const r = V.reader({ backends: { webspeech: fake('webspeech') }, onCue: c => fired.push(c.label), onWord: () => {} });
    const p = { text: TEXT, cues: [{ word: 6, label: 'w6' }, { sentence: 1, label: 's1' }, { after: 1, label: 'after1' }, { after: 2, label: 'after2' }, { sentence: 0, label: 's0' }] };
    await r.read(p);
    assert.deepEqual(fired, ['s0', 's1', 'w6', 'after1', 'after2']);
  });

  test('pause(): in place where the backend can (audio), else stopped and read again from the sentence (Web Speech)', async () => {
    const audio = fake('stream', { pauseInPlace: true, script: untilStopped }), r1 = V.reader({ backends: { stream: audio } });
    const p1 = r1.read(TEXT, { from: 2 });
    await flush();
    assert.equal(r1.pause(), true);
    r1.resume(); assert.equal(audio.resumed, 1);
    assert.equal(r1.reading, true, 'still reading');
    r1.stop(); await p1;
    const web = fake('webspeech', { script: untilStopped }), r2 = V.reader({ backends: { webspeech: web } });
    const p2 = r2.read(TEXT, { from: 1 });
    await flush();
    assert.equal(r2.pause(), false);
    assert.deepEqual(await p2, { done: false, sentence: 1, reason: 'stopped', backend: 'webspeech' });
    assert.equal(r2.sentence, 1, 'where to read again from');
  });

  test('unlock() reaches every backend at once; prefetch() goes to the backend that would say the passage', async () => {
    const stream = fake('stream', { can: (p, o) => o.voice === 'azure:en-GB-RyanNeural' }), web = fake('webspeech');
    const r = V.reader({ backends: { stream, webspeech: web } });
    r.unlock();
    assert.deepEqual([stream.unlocks, web.unlocks], [1, 1]);
    await r.prefetch('Next scene.', { voice: 'azure:en-GB-RyanNeural' });
    await r.prefetch('Not online.', { voice: 'Daniel' });
    assert.deepEqual(stream.prefetched, ['Next scene.']);
    assert.deepEqual(web.prefetched, ['Not online.']);
  });

  test('enqueue() reads passages in turn (the next one fetched ahead); finish() waits for the last', async () => {
    const web = fake('webspeech');
    const r = V.reader({ backends: { webspeech: web } });
    for (const s of ['First answer sentence.', 'Second one.', 'Third.']) r.enqueue({ text: s, private: true });
    await r.finish();
    assert.deepEqual(web.says.map(s => s.text), ['First answer sentence.', 'Second one.', 'Third.']);
    assert.deepEqual(web.prefetched, ['Second one.'], 'arrived while the first was read: fetched at once');
    assert.equal(web.says[1].o.next.text, 'Third.', 'queued behind it: fetched as the second ends');
    assert.equal(web.says[2].o.next, undefined);
    const slow = fake('webspeech', { script: untilStopped }), r2 = V.reader({ backends: { webspeech: slow } });
    r2.enqueue('One.'); r2.enqueue('Two.');
    await flush();
    r2.stop();
    await r2.finish();
    assert.deepEqual(slow.says.map(s => s.text), ['One.'], 'stop() drops what was queued');
  });
});

/* ---------- Web Speech, against a fake speechSynthesis ---------- */
const RYAN = { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' };
const ZIRA = { name: 'Microsoft Zira - English (United States)', lang: 'en-US' };
const DANIEL = { name: 'Daniel', lang: 'en-GB' };
function speechRig({ voices = [ZIRA, DANIEL, RYAN], profile = V.WEBSPEECH.kino, synth: has = true } = {}) {
  let t = 0, id = 0;
  const frames = new Map();
  const synth = { spoken: [], speaking: false, pending: false, paused: false, cancels: 0, resumes: 0, getVoices: () => voices,
    // sticky: an engine that still reports speaking after cancel() (Edge and Chrome do not)
    speak(u) { this.spoken.push(u); this.speaking = true; }, cancel() { this.cancels++; if (!this.sticky) this.speaking = false; }, resume() { this.resumes++; this.paused = false; }, addEventListener() {} };
  class Utterance { constructor(text) { this.text = text; } }
  const b = V.webspeech({ ...profile, synth: has ? synth : null, Utterance, now: () => t, raf: f => { frames.set(++id, f); return id; }, caf: k => frames.delete(k) });
  return {
    b, synth,
    async advance(ms) { t += ms; mock.timers.tick(ms); await flush(); },
    frame() { const fs = [...frames.values()]; frames.clear(); fs.forEach(f => f(t)); },
    get frames() { return frames.size; },
  };
}
const withTimers = fn => async () => { mock.timers.enable({ apis: ['setTimeout'] }); try { await fn(); } finally { mock.timers.reset(); } };

describe('webspeech backend', () => {
  test('Kino: one utterance per sentence, the preferred British voice at Kino\'s rate and pitch; boundaries → words', withTimers(async () => {
    const rig = speechRig(), text = 'Between 5.6 and 5.8 million died. The war ended in 1939–1945.';
    const units = kinoUtterances(text), words = [], sents = [];
    const done = rig.b.say({ text, units }, { voice: null, rate: 0.92 }, { onWord: i => words.push(i), onSentence: k => sents.push(k) });
    await flush();
    const [u0] = rig.synth.spoken;
    assert.equal(u0.text, 'Between 5 point 6 and 5 point 8 million died.');
    assert.deepEqual([u0.voice, u0.lang, u0.rate, u0.pitch], [RYAN, 'en-GB', 0.92, 0.94]);
    u0.onstart();
    u0.onboundary({ name: 'word', charIndex: u0.text.indexOf('point 8') });
    u0.onboundary({ name: 'sentence', charIndex: 0 }); // not a word: ignored
    assert.deepEqual(words, [0, kinoTokens(text).indexOf('5.8')]);
    u0.onend(); await flush();
    const u1 = rig.synth.spoken[1];
    assert.equal(u1.text, units[1].text);
    assert.equal(u1.text, 'The war ended in 1939 to 1945.');
    u1.onend();
    assert.deepEqual(await done, { done: true, sentence: 1 });
    assert.deepEqual(sents, [0, 1]);
  }));

  test('a saved voice by its plain name (as before), or with the device: prefix; an online id falls back to the preference', withTimers(async () => {
    for (const [voice, want] of [['Daniel', DANIEL], ['device:Daniel', DANIEL], ['azure:en-GB-RyanNeural', RYAN], ['No such voice', RYAN], [() => 'Daniel', DANIEL]]) {
      const rig = speechRig(), p = rig.b.say({ text: 'Hi.', units: kinoUtterances('Hi.') }, { voice, rate: 1 }, {});
      await flush();
      assert.equal(rig.synth.spoken[0].voice, want, String(voice));
      rig.synth.spoken[0].onend(); await p;
    }
  }));

  test('stop(): the utterance is cancelled and the reading ends at its sentence; the next starts at once, or 90 ms later if the engine is still busy', withTimers(async () => {
    const rig = speechRig(), units = kinoUtterances(TEXT);
    const p = rig.b.say({ text: TEXT, units }, { rate: 1, from: 1 }, { onWord() {} });
    await flush();
    rig.b.stop();
    assert.equal(rig.synth.cancels, 1);
    assert.deepEqual(await p, { done: false, sentence: 1, reason: 'stopped' });
    rig.synth.spoken[0].onend(); // a late "end" from the cancelled utterance changes nothing
    // Edge and Chrome are idle as soon as cancel() returns, so the next reading starts straight away.
    const q = rig.b.say({ text: TEXT, units }, { rate: 1 }, {});
    await flush();
    assert.equal(rig.synth.spoken.length, 2, 'no gap after an idle cancel()');
    rig.b.stop(); await q;
    // An engine still busy after cancel() gets 90 ms before the next utterance.
    rig.synth.sticky = true;
    const r = rig.b.say({ text: TEXT, units }, { rate: 1 }, {});
    await flush();
    rig.b.stop(); await r;
    const s = rig.b.say({ text: TEXT, units }, { rate: 1 }, {});
    await flush();
    const n = rig.synth.spoken.length;
    await rig.advance(89); assert.equal(rig.synth.spoken.length, n, 'nothing queued straight after a busy cancel()');
    await rig.advance(1); assert.equal(rig.synth.spoken.length, n + 1);
    rig.b.stop(); await s;
  }));

  test('no boundary events: the estimate after 450 ms, which stops with its utterance', withTimers(async () => {
    const rig = speechRig(), units = kinoUtterances(TEXT), words = [];
    const p = rig.b.say({ text: TEXT, units }, { rate: 1 }, { onWord: i => words.push(i) });
    await flush();
    rig.synth.spoken[0].onstart();
    assert.deepEqual(words, [0]);
    await rig.advance(449); assert.equal(rig.frames, 0);
    await rig.advance(1); assert.equal(rig.frames, 1, 'estimating');
    await rig.advance(800); rig.frame();
    assert.ok(words.at(-1) > 0 && words.at(-1) < units[0].words.length, `moved on to word ${words.at(-1)}`);
    rig.synth.spoken[0].onend(); await flush();
    assert.equal(rig.frames, 0, 'no stale highlight once the voice has finished');
    rig.b.stop(); await p;
  }));

  test('Captions only, or no voice installed (Kino): the same timing without the voice', withTimers(async () => {
    for (const [opts, voices] of [[{ silent: true }, [RYAN]], [{}, []]]) {
      const rig = speechRig({ voices }), units = kinoUtterances('The war began in 1939.'), words = [];
      const p = rig.b.say({ text: 'x', units }, { rate: 1, ...opts }, { onWord: i => words.push(i) });
      await flush();
      assert.equal(rig.synth.spoken.length, 0);
      const ms = V.estimate(units[0], { rate: 1 }).duration * 1000;
      rig.frame(); assert.deepEqual(words, [0]);
      await rig.advance(ms + 379); rig.frame();
      assert.equal(words.at(-1), units[0].words.at(-1).i);
      let settled = false; p.then(() => { settled = true; });
      await flush(); assert.equal(settled, false);
      await rig.advance(1); await flush();
      assert.deepEqual(await p, { done: true, sentence: 0 });
    }
  }));

  test('Kino: a watchdog for voices that never end, the queue resumed; a failed utterance counts as said, one cut off by something else ends the reading', withTimers(async () => {
    const rig = speechRig(), units = kinoUtterances(TEXT);
    rig.synth.paused = true;
    const p = rig.b.say({ text: TEXT, units }, { rate: 1 }, {});
    await flush();
    assert.equal(rig.synth.resumes, 1, 'Chrome can leave the queue paused');
    const watchdog = Math.ceil(Math.max(6000, (units[0].text.length / 14.2) * 2500 + 4000)); // Kino's: well after it should have ended
    await rig.advance(watchdog - 1); assert.equal(rig.synth.spoken.length, 1);
    await rig.advance(1); assert.equal(rig.synth.spoken.length, 2, 'given up on, the next sentence starts');
    rig.synth.spoken[1].onerror({ error: 'synthesis-failed' }); await flush();
    assert.equal(rig.synth.spoken.length, 3, 'a failed sentence counts as said');
    rig.synth.spoken[2].onerror({ error: 'interrupted' }); // another page's cancel(), not this reader's stop()
    assert.deepEqual(await p, { done: false, sentence: 2, reason: 'error' });
  }));

  test('Documentary: PRPSpeech\'s utterances; the default voice when none is listed; failures read on; no watchdog, no resume', withTimers(async () => {
    const text = 'Dr. Smith met Mr. Jones in St. Petersburg. Petrol cost €2.11 a litre.';
    const units = S.utterances(text).map(u => ({ text: u, words: [] }));
    const rig = speechRig({ voices: [], profile: V.WEBSPEECH.documentary });
    rig.synth.paused = true;
    const p = rig.b.say({ text, units }, { voice: () => null, rate: () => 0.92 }, {});
    await flush();
    const [u0] = rig.synth.spoken;
    assert.deepEqual([u0.text, u0.voice, u0.lang, u0.rate, u0.pitch], ['Doctor Smith met Mister Jones in Saint Petersburg.', undefined, 'en-GB', 0.92, 0.94]);
    assert.equal(u0.onboundary, undefined, 'no word machinery for a reader that shows no words');
    assert.equal(rig.synth.resumes, 0);
    await rig.advance(60000); assert.equal(rig.synth.spoken.length, 1, 'waits for "end" as long as it takes');
    u0.onerror({ error: 'synthesis-failed' }); await flush();
    assert.equal(rig.synth.spoken[1].text, 'Petrol cost 2 point 1 1 euros a litre.');
    rig.synth.spoken[1].onend();
    assert.deepEqual(await p, { done: true, sentence: 1 });
  }));

  test('Documentary with no speech engine: a wait of 60 ms a character, at most 9 s, which stop() ends', withTimers(async () => {
    const rig = speechRig({ synth: false, profile: V.WEBSPEECH.documentary }), text = 'A short step.';
    const p = rig.b.say({ text, units: [{ text, words: [] }] }, {}, {});
    let settled = false; p.then(() => { settled = true; });
    await rig.advance(60 * text.length - 1); assert.equal(settled, false);
    await rig.advance(1); assert.deepEqual(await p, { done: true, sentence: 0 });
    const long = 'x'.repeat(500), q = rig.b.say({ text: long, units: [{ text: long, words: [] }] }, {}, {});
    await rig.advance(8999); rig.b.stop();
    assert.equal((await q).reason, 'stopped');
  }));

  test('the device voice list: British first, English only', () => {
    const rig = speechRig({ voices: [ZIRA, { name: 'Amélie', lang: 'fr-CA' }, DANIEL, RYAN] });
    assert.deepEqual(rig.b.device.list().map(v => v.name), ['Daniel', RYAN.name, ZIRA.name]);
    assert.equal(rig.b.device.pick(null), RYAN);
  });
});

/* ---------- the online stream, against a fake proxy and <audio> ---------- */
const ONLINE = [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' }];
function streamRig({ say, voices = ONLINE, available = true } = {}) {
  let t = 0, id = 0;
  const frames = new Map(), calls = [];
  const rig = { calls, audio: null };
  class Audio {
    constructor() { this.paused = true; this.currentTime = 0; this.duration = NaN; this.plays = []; rig.audio = this; }
    play() { if (rig.refuse) return Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })); this.paused = false; this.plays.push(this.src); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const fetch = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    if (url.endsWith('voices')) return Response.json(available ? { available: true, engine: 'azure', voices } : { available: false, reason: 'not configured', voices: [] });
    if (say) return say(call, calls.filter(c => c.method === 'POST').length);
    return new Response(new Uint8Array(64), { headers: { 'content-type': 'audio/mpeg', 'x-prp-voice-duration': '2', 'x-prp-voice-key': 'k'.repeat(64), 'x-prp-voice-cache': 'miss' } });
  };
  rig.b = V.stream({ fetch, Audio, now: () => t, raf: f => { frames.set(++id, f); return id; }, caf: k => frames.delete(k) });
  rig.frame = () => { const fs = [...frames.values()]; frames.clear(); fs.forEach(f => f()); };
  rig.later = s => { t += s * 1000; };
  rig.posts = () => calls.filter(c => c.method === 'POST').map(c => c.body.text);
  // Play until the element has had `n` clips (each "ends" when asked).
  rig.until = async (n, end = true) => { for (let i = 0; i < 50 && !(rig.audio?.plays.length >= n); i++) await flush(); if (end) { rig.audio.currentTime = 2; rig.audio.onended(); } await flush(); };
  return rig;
}
const RYAN_ON = { voice: 'azure:en-GB-RyanNeural', rate: 0.92 };

describe('stream backend', () => {
  test('it asks the proxy once whether it is set up and which voices it has; it says only those, and never silently', async () => {
    const rig = streamRig(), p = { text: TEXT, units: V.utterances(TEXT) };
    assert.equal(await rig.b.canSay(p, { voice: 'Daniel' }), false);
    assert.equal(rig.calls.length, 0, 'a device voice never wakes the proxy');
    assert.equal(await rig.b.canSay(p, RYAN_ON), true);
    assert.equal(await rig.b.canSay(p, { ...RYAN_ON, silent: true }), false);
    assert.equal(await rig.b.canSay(p, { voice: 'azure:en-GB-SoniaNeural' }), false, 'not one the proxy offers');
    assert.deepEqual((await rig.b.voices()).map(v => [v.id, v.label, v.lifelike]), [['azure:en-GB-RyanNeural', 'Ryan, British English', true]]);
    assert.equal(rig.calls.filter(c => c.url.endsWith('voices')).length, 1);
    const off = streamRig({ available: false });
    assert.equal(await off.b.canSay(p, RYAN_ON), false);
    assert.deepEqual(await off.b.voices(), []);
  });

  test('one request per sentence, the next fetched while this one plays; words follow the clip\'s clock', async () => {
    const rig = streamRig(), text = 'Between 5.6 and 5.8 million died. The war ended in 1939–1945.', units = kinoUtterances(text);
    const words = [], sents = [];
    const done = rig.b.say({ text, units, norm: V.NORM.kino }, RYAN_ON, { onWord: i => words.push(i), onSentence: k => sents.push(k) });
    await rig.until(1, false);
    assert.deepEqual(rig.posts(), units.map(u => u.text), 'the second sentence is on its way while the first plays');
    assert.deepEqual(rig.calls.find(c => c.method === 'POST').body, { text: units[0].text, voice: 'azure:en-GB-RyanNeural', lang: 'en-GB', norm: 'kino-text@1', private: false });
    assert.equal(rig.audio.playbackRate, 0.92); assert.equal(rig.audio.preservesPitch, true);
    assert.deepEqual(words, [0]);
    rig.audio.currentTime = 1.5; rig.frame();
    const at = V.timeline(V.estimate(units[0], { duration: 2 })).at(1.5).word;
    assert.equal(words.at(-1), at); assert.ok(at > 0);
    rig.audio.onended(); await rig.until(2);
    assert.deepEqual(await done, { done: true, sentence: 1 });
    assert.deepEqual(sents, [0, 1]);
  });

  test('the proxy\'s own word timings, when real, map onto the displayed words', async () => {
    const text = 'It lasted 1939–1945.', units = kinoUtterances(text); // "It lasted 1939 to 1945." is five spoken words, three displayed
    const timings = { duration: 2, words: [[0, 0.2, 0], [0.2, 0.6, 1], [0.6, 1, 2], [1, 1.2, 3], [1.2, 2, 4]], sentences: [[0, 2]], source: 'provider' };
    const rig = streamRig({ say: () => new Response(new Uint8Array(8), { headers: { 'x-prp-voice-duration': '2', 'x-prp-voice-timings': JSON.stringify(timings) } }) });
    const words = [];
    const done = rig.b.say({ text, units }, RYAN_ON, { onWord: i => words.push(i) });
    await rig.until(1, false);
    for (const s of [0.1, 0.3, 0.7, 1.1, 1.9]) { rig.audio.currentTime = s; rig.frame(); }
    assert.deepEqual(words, [0, 1, 2], '"1939 to 1945" is all one displayed word');
    rig.audio.onended(); assert.equal((await done).done, true);
  });

  test('the quota spent: the reading stops at that sentence with reason "quota", and the stream stands aside until Retry-After', async () => {
    const rig = streamRig({ say: (call, n) => (n === 1 ? new Response(new Uint8Array(8), { headers: { 'x-prp-voice-duration': '1' } })
      : Response.json({ error: 'quota', reason: 'daily', retryAfter: 120 }, { status: 429, headers: { 'Retry-After': '120' } })) });
    const p = { text: TEXT, units: V.utterances(TEXT) };
    const done = rig.b.say(p, RYAN_ON, {});
    await rig.until(1);
    assert.deepEqual(await done, { done: false, sentence: 1, reason: 'quota' });
    assert.equal(await rig.b.canSay(p, RYAN_ON), false);
    rig.later(119); assert.equal(await rig.b.canSay(p, RYAN_ON), false);
    rig.later(2); assert.equal(await rig.b.canSay(p, RYAN_ON), true);
    for (const [status, body, want] of [[503, { error: 'unavailable', reason: 'not configured' }, 'unavailable'], [500, {}, 'error'], [429, { error: 'rate', retryAfter: 5 }, 'error']]) {
      const r = streamRig({ say: () => Response.json(body, { status }) });
      assert.equal((await r.b.say(p, RYAN_ON, {})).reason, want, `HTTP ${status}`);
    }
    const offline = streamRig({ say: () => { throw new TypeError('Failed to fetch'); } });
    assert.equal((await offline.b.say(p, RYAN_ON, {})).reason, 'unavailable');
  });

  test('stop() pauses the clip and ends the reading; a clip that may not play hands over to the device voice', async () => {
    const rig = streamRig(), p = { text: TEXT, units: V.utterances(TEXT) };
    const done = rig.b.say(p, RYAN_ON, {});
    await rig.until(1, false);
    assert.equal(rig.b.pause(), true, 'audio pauses in place');
    assert.equal(rig.audio.paused, true);
    rig.b.resume(); assert.equal(rig.audio.paused, false);
    rig.b.stop();
    assert.equal(rig.audio.paused, true);
    assert.deepEqual(await done, { done: false, sentence: 0, reason: 'stopped' });
    const shy = streamRig(); shy.refuse = true; // iOS before a tap: play() is not allowed
    assert.deepEqual(await shy.b.say(p, RYAN_ON, {}), { done: false, sentence: 0, reason: 'unavailable' });
    assert.equal(await shy.b.canSay(p, RYAN_ON), false, 'aside until a tap');
    shy.refuse = false; shy.b.unlock(RYAN_ON);
    assert.equal(await shy.b.canSay(p, RYAN_ON), true, 'the next Play tap lets it try again');
  });

  test('unlock(): a silent clip played inside the tap, then paused; a clip restarted after a pause comes from memory', async () => {
    const rig = streamRig();
    rig.b.unlock();
    assert.match(rig.audio.plays[0], /^data:audio\/wav;base64,/);
    await flush();
    assert.equal(rig.audio.paused, true);
    rig.b.unlock(); assert.equal(rig.audio.plays.length, 1, 'once a page');
    const p = { text: 'One sentence only.', units: V.utterances('One sentence only.') };
    const a = rig.b.say(p, RYAN_ON, {}); await rig.until(2); await a;
    const b = rig.b.say(p, RYAN_ON, {}); await rig.until(3); await b;
    assert.equal(rig.posts().length, 1, 'asked for once');
  });

  test('prefetch() fetches a passage\'s first sentence now; a read\'s `next` once the read reaches its last sentence', async () => {
    const rig = streamRig(), next = { text: 'Next scene. More.', units: V.utterances('Next scene. More.') };
    await rig.b.prefetch(next, RYAN_ON);
    assert.deepEqual(rig.posts(), ['Next scene.']);
    await streamRig().b.prefetch(next, { voice: 'Daniel' }); // not an online voice: nothing to fetch
    const later = streamRig(), three = { text: TEXT, units: V.utterances(TEXT) };
    const done = later.b.say(three, { ...RYAN_ON, next }, {});
    await later.until(1);
    assert.equal(later.posts().includes('Next scene.'), false, 'not while the first sentences play');
    await later.until(2);
    assert.ok(later.posts().includes('Next scene.'), 'on its way once the last sentence starts');
    await later.until(3); assert.equal((await done).done, true);
  });

  test('the reader hands a read\'s `next` to the backend as a passage, cut by the reader\'s own rule', async () => {
    const stream = fake('stream'), r = V.reader({ backends: { stream }, utterances: kinoUtterances });
    await r.read('This scene.', { voice: 'azure:en-GB-RyanNeural', next: 'The next scene, 1939–1945.' });
    assert.deepEqual(stream.says[0].o.next.units.map(u => u.text), ['The next scene, 1939 to 1945.']);
  });
});

/* ---------- in a browser: the real pages, with the proxy and the speech engine played by the test ---------- */
const BASE = (process.env.JDPI_URL || '').replace(/\/$/, '');
const PAGE = BASE ? pageTest : { skip: 'set JDPI_URL to test the pages' };
const RYAN_ID = 'azure:en-GB-RyanNeural', RYAN_DEVICE = 'Microsoft Ryan Online (Natural) - English (United Kingdom)';
// The site's voice proxy as the test plays it (no server is started; Playwright answers the page's requests): GET voices
// says it is set up; POST say answers each sentence with a short silent clip, or, past `quotaAfter` sentences, 429 as when
// the day's characters are spent. Each request is kept, with what the page's caption showed when it was made.
async function fakeProxy(page, { quotaAfter = Infinity, clip = 0.3, caption = null } = {}) {
  const said = [];
  await page.route('**/api/voice/v1/voices', route => route.fulfill({ json: { available: true, engine: 'azure', voices: ONLINE, left: { today: 30000, month: 450000 }, cache: 'none', quota: 'memory' } }));
  await page.route('**/api/voice/v1/say', async route => {
    said.push({ ...route.request().postDataJSON(), caption: caption ? await page.textContent(caption).catch(() => null) : null });
    if (said.length > quotaAfter) return route.fulfill({ status: 429, headers: { 'Retry-After': '3600' }, json: { error: 'quota', reason: 'daily', retryAfter: 3600 } });
    return route.fulfill({ status: 200, body: Buffer.from(V.silentWav(clip)), headers: { 'content-type': 'audio/wav', 'x-prp-voice-duration': String(clip), 'x-prp-voice-cache': 'off' } });
  });
  return said;
}
// A speech engine for the test browser, which has none: two English voices (the American one first, so picking the
// British one is the reader's doing); each utterance "said" in 150 ms, and recorded as the reader set it up.
const FAKE_SPEECH = () => {
  const voices = [{ name: 'Microsoft Zira - English (United States)', lang: 'en-US' }, { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB' }];
  const spoken = (window.__spoken = []);
  class Utterance { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false, pending: false, paused: false, current: null, getVoices: () => voices, addEventListener() {}, resume() {},
    speak(u) {
      spoken.push({ text: u.text, voice: u.voice?.name || null, lang: u.lang, rate: u.rate, pitch: u.pitch });
      this.current = u; this.speaking = true;
      setTimeout(() => { if (this.current === u) u.onstart?.(); }, 10);
      setTimeout(() => { if (this.current !== u) return; this.current = null; this.speaking = false; u.onend?.(); }, 150);
    },
    cancel() { const u = this.current; this.current = null; this.speaking = false; u?.onerror?.({ error: 'interrupted' }); },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};
const WW2 = flatScenes(read('kino/data/wars/ww2-europe.json')), POLAND = WW2.findIndex(s => s.id === 'poland');
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 50)); } return true; };

test('page: Kino with this device\'s voice, exactly as before: each sentence one utterance, the British voice, Kino\'s rate and pitch', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(FAKE_SPEECH); // no proxy: the local server has no Functions, so the online voice is "not set up"
    await page.goto(`${BASE}/kino/index.html?cat=wars#doc=ww2-europe&s=poland`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cap-text .w', { timeout: 20000 });
    const units = kinoUtterances(WW2[POLAND].narration);
    await page.click('#play');
    assert.ok(await until(() => page.evaluate(n => window.__spoken.length >= n, units.length)), 'every sentence spoken');
    const spoken = await page.evaluate(() => window.__spoken);
    assert.deepEqual(spoken.slice(0, units.length).map(u => u.text), units.map(u => u.text));
    for (const u of spoken) assert.deepEqual([u.voice, u.lang, u.rate, u.pitch], [RYAN_DEVICE, 'en-GB', 0.92, 0.94]);
    await page.waitForSelector('#cap-text .w.on', { timeout: 5000 });
    await page.keyboard.press('Space');
    // With no proxy the voice list is as it always was: no groups, device voices only.
    await page.click('#settings summary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#voice-pick optgroup').count(), 0);
    assert.deepEqual(await page.$$eval('#voice-pick option', os => os.map(o => o.textContent)), [RYAN_DEVICE, 'Microsoft Zira - English (United States)']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Kino reads through the online voice, a request a sentence, the words highlighted from the clip, the next scene fetched ahead', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(FAKE_SPEECH);
    const said = await fakeProxy(page);
    await page.goto(`${BASE}/kino/index.html?cat=wars#doc=ww2-europe&s=poland`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cap-text .w', { timeout: 20000 });
    // The settings list this device's voices and the proxy's, each group named for what it is.
    await page.click('#settings summary');
    await page.waitForSelector(`#voice-pick optgroup[label="Azure (online)"] option[value="${RYAN_ID}"]`, { state: 'attached', timeout: 10000 });
    assert.deepEqual(await page.$$eval('#voice-pick optgroup', gs => gs.map(g => g.label)), ['This device', 'Azure (online)']);
    assert.equal(await page.$eval(`#voice-pick option[value="${RYAN_ID}"]`, o => o.textContent), 'Ryan, British English');
    await page.selectOption('#voice-pick', RYAN_ID);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jdpi.doc.voice'))), RYAN_ID, 'saved where the voice always was');
    await page.click('#settings summary');
    const units = kinoUtterances(WW2[POLAND].narration), next = kinoUtterances(WW2[POLAND + 1].narration);
    await page.click('#play');
    await page.waitForSelector('#cap-text .w.on', { timeout: 10000 });
    assert.ok(await until(() => said.length >= units.length), `${said.length} of ${units.length} sentences asked for`);
    assert.deepEqual(said.slice(0, units.length).map(b => b.text), units.map(u => u.text), 'one request a sentence, as the voice is to say it');
    assert.deepEqual(Object.keys(said[0]).sort(), ['caption', 'lang', 'norm', 'private', 'text', 'voice']);
    assert.deepEqual([said[0].voice, said[0].norm, said[0].lang, said[0].private], [RYAN_ID, 'kino-text@1', 'en-GB', false]);
    // The highlight follows the clips into the last sentence; the next scene's first sentence is fetched while it plays.
    const last = units[units.length - 1].words[0].i;
    await page.waitForFunction(i => [...document.querySelectorAll('#cap-text .w.on')].some(w => +w.dataset.i >= i), last, { timeout: 10000 });
    await page.waitForFunction(() => /s=west-1940/.test(location.hash), null, { timeout: 10000 });
    assert.ok(said.some(b => b.text === next[0].text), 'the next scene\'s first sentence came ahead');
    assert.deepEqual(await page.evaluate(() => window.__spoken), [], 'this device\'s voice never spoke');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#play').getAttribute('aria-label'), 'Play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: when the online voice\'s allowance runs out, Kino\'s device voice reads on from that sentence and says so once', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(FAKE_SPEECH);
    await page.addInitScript(id => { try { localStorage.setItem('jdpi.doc.voice', JSON.stringify(id)); } catch { /* none */ } }, RYAN_ID);
    const said = await fakeProxy(page, { quotaAfter: 1 });
    await page.goto(`${BASE}/kino/index.html?cat=wars#doc=ww2-europe&s=poland`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cap-text .w', { timeout: 20000 });
    const units = kinoUtterances(WW2[POLAND].narration);
    await page.click('#play');
    assert.ok(await until(() => page.evaluate(() => window.__spoken.length >= 1)), 'the device voice took over');
    const [first] = await page.evaluate(() => window.__spoken);
    assert.equal(said[0].text, units[0].text, 'the online voice read the first sentence');
    assert.deepEqual([first.text, first.voice, first.rate, first.pitch], [units[1].text, RYAN_DEVICE, 0.92, 0.94], 'and the device voice the second, as it always would');
    await page.waitForFunction(() => /today’s allowance/.test(document.querySelector('#note').textContent), null, { timeout: 5000 });
    await page.keyboard.press('Space');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: the Documentary reader speaks as before with this device\'s voice, lists the online voices honestly, and reads through one once chosen', PAGE, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(FAKE_SPEECH);
    const said = await fakeProxy(page, { caption: '#doc-sub' });
    await page.goto(`${BASE}/#/rs/war-focus`, { waitUntil: 'domcontentloaded' });
    // Wait for War Focus to tell its own story (pressed sooner, the narrator falls back to reading what is on screen).
    const frame = await (await page.waitForSelector('#frames iframe.active', { timeout: 20000 })).contentFrame();
    await frame.waitForFunction(() => !!window.jdpiDocumentary?.story && document.querySelector('path.state'), null, { timeout: 30000 });
    await page.locator('.doc-fab').click({ timeout: 20000 });
    assert.ok(await until(() => page.evaluate(() => window.__spoken.length >= 1), 30000), 'the reader spoke');
    const [first] = await page.evaluate(() => window.__spoken), step = await page.textContent('#doc-sub');
    assert.equal(first.text, S.utterances(step)[0], 'PRPSpeech\'s first utterance of the step');
    assert.deepEqual([first.voice, first.lang, first.rate, first.pitch], [RYAN_DEVICE, 'en-GB', 0.92, 0.94]);
    // The voice list: this device's voices, then the proxy's, each group labelled for what it is.
    await page.waitForSelector(`#doc-voice optgroup[label="Azure (online)"] option[value="${RYAN_ID}"]`, { state: 'attached', timeout: 10000 });
    assert.deepEqual(await page.$$eval('#doc-voice optgroup', gs => gs.map(g => g.label)), ['This device', 'Azure (online)']);
    await page.selectOption('#doc-voice', RYAN_ID);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jdpi.doc.voice'))), RYAN_ID);
    assert.ok(await until(() => said.length >= 1, 30000), 'the next passage went to the online voice');
    assert.deepEqual([said[0].voice, said[0].norm], [RYAN_ID, 'prp-speech@1']);
    assert.equal(said[0].text, S.utterances(said[0].caption)[0], 'the passage as PRPSpeech says it');
    await page.click('#doc-play'); // pause
    assert.equal(await page.textContent('#doc-play'), '▶ Play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

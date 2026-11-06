// Bibliotheca's narrator (Augmented Reading), its pure parts in Node: what it says (lib/narrate.js: the units of every
// paragraph of every book, and what a chapter costs), which entry the pane follows (lib/follow.js), the mode in the
// address (lib/mode.js), and the online voice's locks (lib/narrator.js: gate, the day's own count, the reading loop on
// the voice layer with fake backends). No browser, no network: the page tests are in tests/bibliotheca-page.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../design/prp-voice.js';
import { speakable, spoken, readable, chapterPassages, costFrom, permitFrom, MAX_UNIT, LECTURE, SPEEDS, secondsFor } from '../bibliotheca/neo/lib/narrate.js';
import { chapterTerms, span, nearestTerm, follow, fresh, WAIT, tour, SCREEN, TOUR_AFTER, TOUR_EVERY, TOUR_STAY } from '../bibliotheca/neo/lib/follow.js';
import { picturesFor, turnOf } from '../bibliotheca/neo/lib/pictures.js';
import { flatScenes } from '../kino/lib/format.js';
import { loadContext, validateScript } from '../kino/scripts/validate.mjs';
import { readMode, writeMode } from '../bibliotheca/neo/lib/mode.js';
import { readHash, writeHash } from '../bibliotheca/neo/lib/hash.js';
import { gate, dayCount, probe, Narrator, KEYS } from '../bibliotheca/neo/lib/narrator.js';

const V = globalThis.PRPVoice;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const SHELF = read('bibliotheca/data/index.json');
const BOOKS = SHELF.books.map(b => read(`bibliotheca/data/books/${b.slug}.json`));
const PRINCE = BOOKS.find(b => b.slug === 'the-prince');
const FIXTURE = read('bibliotheca/neo/fixture.json');
const flush = () => new Promise(r => setImmediate(r));
// What the narrator should say of a stretch of a paragraph's text: its footnote marks gone, white space collapsed.
const say = t => t.replace(/\[\d{1,4}\]/g, '').replace(/\s+/g, ' ').trim();

/* ---------- what it says ---------- */
describe('narrate: the units', () => {
  test('over every book: footnote marks dropped, notes and tables skipped, every sentence at its own place, no unit over 200, the units joined give the spoken text back', () => {
    let units = 0, paragraphs = 0;
    for (const b of BOOKS) for (const c of b.chapters) for (const p of c.paragraphs) {
      const sp = speakable(p);
      if (p.kind === 'note' || (p.kind === 'verse' && / {2}/.test(p.text))) { assert.equal(sp.units.length, 0, `${b.slug} ${p.id}: a note or a table is not read`); continue; }
      if (!/\S/.test(p.text)) continue;
      paragraphs++;
      assert.doesNotMatch(sp.text, /\[\d{1,4}\]/, `${b.slug} ${p.id}: no footnote mark is spoken`);
      assert.equal(sp.text, say(p.text), `${b.slug} ${p.id}: the spoken text`);
      assert.equal(sp.units.map(u => u.text).join(' '), sp.text, `${b.slug} ${p.id}: the units joined`);
      let n = 0;
      for (const u of sp.units) {
        units++;
        assert.ok(u.text.length > 0 && u.text.length <= MAX_UNIT, `${b.slug} ${p.id}: a unit of ${u.text.length}`);
        assert.equal(u.text, V.canon(u.text), `${b.slug} ${p.id}: what the proxy counts is the unit itself`);
        assert.equal(sp.text.slice(u.s, u.e), u.text, `${b.slug} ${p.id}: at its place in the spoken text`);
        assert.equal(say(p.text.slice(u.from, u.to)), u.text, `${b.slug} ${p.id}: at its place in the paragraph`);
        assert.ok(u.say[0] <= u.from && u.say[1] >= u.to, `${b.slug} ${p.id}: inside its sentence`);
        assert.deepEqual(u.words.map(w => w.i), u.words.map((_, j) => n + j), 'words numbered through the paragraph');
        n += u.words.length;
      }
      // Every sentence the voice layer finds starts a unit or lies inside one cut sentence's pieces.
      const starts = new Set(sp.units.map(u => u.s));
      let at = 0;
      for (const s of V.sentences(sp.text)) { const i = sp.text.indexOf(s, at); at = i + s.length; assert.ok(sp.units.some(u => u.s <= i && u.e >= Math.min(at, u.s + MAX_UNIT)) || starts.has(i), `${b.slug} ${p.id}: "${s.slice(0, 40)}"`); }
    }
    assert.ok(paragraphs > 9000 && units > 60000, `${paragraphs} paragraphs, ${units} units`);
  });

  test('short sentences are read together up to 200 characters; a long one is cut at , ; or : into the fewest pieces, a later piece asking nothing', () => {
    const short = speakable({ id: 'x', kind: 'para', text: 'It rained. It poured. The [3] river rose.' });
    assert.deepEqual(short.units.map(u => u.text), ['It rained. It poured. The river rose.']);
    assert.deepEqual(short.units.map(u => [u.part, u.asks]), [[false, true]]);
    const long = 'A'.repeat(90) + ', ' + 'b'.repeat(90) + '; ' + 'c'.repeat(90) + ': ' + 'd'.repeat(40) + '.';
    const cut = speakable({ id: 'y', kind: 'para', text: long });
    assert.deepEqual(cut.units.map(u => u.text.length), [183, 133]);
    assert.ok(cut.units[0].text.endsWith(';') && cut.units.every(u => u.part));
    assert.deepEqual(cut.units.map(u => u.asks), [true, false]);
    assert.deepEqual(cut.units[0].say, cut.units[1].say, 'both pieces belong to the one sentence');
    // With no mark, at a space.
    const plain = speakable({ id: 'z', kind: 'para', text: Array.from({ length: 50 }, () => 'word').join(' ') + '.' });
    assert.ok(plain.units.length === 2 && plain.units.every(u => u.text.length <= 200));
    // Verse: its line breaks are spaces; a table and a note are not read.
    assert.equal(spoken({ text: 'One line\nanother line' }).text, 'One line another line');
    assert.equal(readable({ kind: 'verse', text: 'Wheat  10s  6d' }), false);
    assert.equal(readable({ kind: 'note', text: '[1] A note.' }), false);
  });

  test('read at 1.5×, no minute of any chapter starts more than 20 units (Azure\'s free tier allows the site 20 requests a minute)', () => {
    let worst = 0;
    for (const b of BOOKS) for (const c of b.chapters) {
      const starts = [];
      let t = 0;
      for (const p of chapterPassages(c)) for (const u of p.units) { starts.push(t); t += V.estimate(u, { rate: LECTURE * 1.5 }).duration; }
      for (let i = 0, j = 0; i < starts.length; i++) { while (starts[i] - starts[j] >= 60) j++; worst = Math.max(worst, i - j + 1); }
    }
    assert.ok(worst <= 20, `${worst} units in one minute`);
  });

  test('the cost of a chapter from a point is the sum of what PRPVoice.canon makes of each unit, which is what the proxy counts; a permission smaller than the chapter ends at the end of a paragraph', () => {
    const c = PRINCE.chapters.find(x => x.n === 3), ps = chapterPassages(c);
    const all = ps.flatMap(p => p.units).reduce((n, u) => n + V.canon(u.text).length, 0);
    assert.equal(costFrom(ps), all);
    assert.equal(costFrom(ps, ps[0].id, 0), all);
    const [p2] = [ps[2]], from = costFrom(ps, p2.id, 1);
    assert.equal(from, all - ps[0].units.concat(ps[1].units, [p2.units[0]]).reduce((n, u) => n + V.canon(u.text).length, 0));
    // A permission: the whole chapter when the allowance covers it; else to the end of the last paragraph that fits.
    assert.deepEqual(permitFrom(ps, ps[0].id, 0, all + 5), { chars: all, through: ps.at(-1).id, all: true, total: all });
    const firstTwo = costFrom([ps[0], ps[1]]), cut = permitFrom(ps, ps[0].id, 0, firstTwo + 10);
    assert.deepEqual([cut.chars, cut.through, cut.all], [firstTwo, ps[1].id, false]);
    assert.equal(permitFrom(ps, ps[0].id, 0, costFrom([ps[0]]) - 1).chars, 0, 'not even the first paragraph: nothing');
    // About how long: 16,123 characters at normal speed are about 21 minutes.
    assert.equal(Math.round(secondsFor(16123) / 60), 21);
    assert.deepEqual(SPEEDS, [0.8, 1, 1.15, 1.3, 1.5]);
  });
});

/* ---------- which entry the pane follows ---------- */
describe('follow: the pane follows the nearest term', () => {
  // A small chapter: terms at known places in one paragraph of 1,000 characters.
  const T = (qid, at) => ({ qid, at, end: at + 5, pid: 'p' });
  const terms = [T('Q1', 100), T('Q2', 400), T('Q3', 420), T('Q4', 900)];
  const U = (from, to, asks = true) => ({ from, to, chars: to - from, asks });
  test('a sentence naming the term showing changes nothing; one naming others takes the first; one naming none the nearest, the one already read on a tie', () => {
    let r = follow({ showing: 'Q3', read: 1000, fresh: false }, U(390, 450), terms);
    assert.equal(r.show, null, 'Q3 is in the sentence and showing');
    r = follow({ showing: 'Q1', read: 1000, fresh: false }, U(390, 450), terms);
    assert.equal(r.show, 'Q2', 'the first of the sentence\'s terms');
    r = follow({ showing: 'Q4', read: 1000, fresh: false }, U(200, 260), terms);
    assert.equal(r.show, 'Q1', 'none inside: the nearest (Q1 ends 95 before, Q2 starts 140 after)');
    // A tie: equally near behind and ahead: the one already read.
    const tie = [T('A', 100), T('B', 215)];
    assert.equal(nearestTerm(tie, 155, 160), 'A');
    assert.equal(follow({ showing: null, read: 0, fresh: true }, U(155, 160), tie).show, 'A');
  });

  test('no change before 300 characters have been read since the last; the first sentence after Play, a jump or letting go is shown at once; a later piece asks nothing; a chapter with no term changes nothing', () => {
    let s = { showing: 'Q1', read: 0, fresh: false };
    let r = follow(s, U(390, 450), terms);
    assert.equal(r.show, null, 'only 0 characters read');
    assert.equal(r.state.read, 60);
    r = follow({ ...r.state, read: WAIT - 1 }, U(390, 450), terms);
    assert.equal(r.show, null, '299 is not enough');
    r = follow({ ...r.state, read: WAIT }, U(390, 450), terms);
    assert.equal(r.show, 'Q2');
    assert.equal(r.state.read, 60, 'counted again from the change, this sentence included');
    assert.equal(follow(fresh('Q1'), U(390, 450), terms).show, 'Q2', 'fresh: at once');
    assert.equal(follow(fresh('Q1'), U(390, 450), terms).state.fresh, false, 'and only once');
    assert.equal(follow({ showing: 'Q1', read: 9999, fresh: true }, U(390, 450, false), terms).show, null, 'a later piece of a long sentence asks nothing');
    assert.equal(follow({ showing: 'Q1', read: 9999, fresh: true }, U(390, 450, false), terms).state.read, 9999 + 60, 'but is counted as read');
    assert.equal(follow(fresh(null), U(0, 100), []).show, null, 'no term in the chapter');
  });

  test('a chapter\'s terms in reading order, notes left out; a unit\'s place in the running text', () => {
    const c = FIXTURE.chapters.find(x => x.n === 3), { terms: ts, base } = chapterTerms(c);
    assert.ok(ts.length > 3);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i].at >= ts[i - 1].end, 'in reading order');
    assert.equal(base.has('c03-n04'), false, 'a note is not read, so its terms do not count');
    const ps = chapterPassages(c), p = ps[1], sp = span(base, p.id, p.units[0]);
    assert.deepEqual(sp, { from: base.get(p.id) + p.units[0].from, to: base.get(p.id) + p.units[0].to, chars: p.units[0].text.length, asks: true });
  });

  test('over The Prince, read from each chapter\'s start, no two changes are closer than 300 characters', () => {
    let changes = 0;
    for (const c of PRINCE.chapters) {
      const { terms: ts, base } = chapterTerms(c);
      let state = fresh(null), read = 0, last = null;
      for (const p of chapterPassages(c)) for (const u of p.units) {
        const r = follow(state, span(base, p.id, u), ts);
        if (r.show) { if (last !== null) assert.ok(read - last >= WAIT, `${c.n} ${p.id}: ${read - last} characters after the last change`); last = read; changes++; }
        state = r.state; read += u.text.length;
      }
    }
    assert.ok(changes > 100, `${changes} changes`);
  });
});

/* ---------- the mode in the address ---------- */
test('mode: ar=1 is read and written after the seven keys, and readHash still gives its seven for an address that carries it', () => {
  const h = writeHash({ book: 'the-prince', ch: 3, p: 'c03-p02', t: 'Q70972', pane: 'ency' });
  assert.equal(writeMode(h, { ar: true }), `${h}&ar=1`);
  assert.equal(writeMode(h, { ar: false }), h, 'with the mode off the address is exactly today\'s');
  assert.equal(writeMode(`${h}&ar=1`, { ar: true }), `${h}&ar=1`, 'one ar, at the end');
  assert.equal(writeMode('', { ar: true }), '', 'no book, no address');
  assert.deepEqual(readMode(`${h}&ar=1`), { ar: true });
  assert.deepEqual(readMode('#ar=0'), { ar: false });
  assert.deepEqual(readMode(h), { ar: false });
  assert.deepEqual(readMode('book=the-prince&ar=1'), { ar: true }, 'with or without the #');
  assert.deepEqual(readHash(`${h}&ar=1`), { book: 'the-prince', ch: 3, p: 'c03-p02', t: 'Q70972', pane: 'ency', show: null, era: null });
});

/* ---------- the online voice's locks ---------- */
const clipResponse = (cache = 'miss') => new Response(new Uint8Array(32), { headers: { 'content-type': 'audio/mpeg', 'x-prp-voice-duration': '1', 'x-prp-voice-cache': cache } });
const sayReq = text => ['/api/voice/v1/say', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: 'azure:en-GB-RyanNeural', norm: 'plain@1' }) }];

describe('gate', () => {
  test('without a permission it refuses `say` itself, 429 with retryAfter 1, and the real fetch is never called; `voices` passes through', async () => {
    const calls = [];
    const g = gate(async (url) => { calls.push(url); return url.endsWith('voices') ? Response.json({ available: true }) : clipResponse(); });
    const r = await g.fetch(...sayReq('Hello there.'));
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('Retry-After'), '1');
    assert.deepEqual(await r.json(), { error: 'quota', reason: 'permission', retryAfter: 1 });
    assert.deepEqual(calls, []);
    assert.equal(g.refused, 1);
    assert.equal((await g.fetch('/api/voice/v1/voices')).status, 200);
    assert.deepEqual(calls, ['/api/voice/v1/voices']);
  });

  test('it allows requests up to the number allowed, counted as the proxy counts them, and refuses the next', async () => {
    let real = 0;
    const g = gate(async () => { real++; return clipResponse(); });
    g.grant(25);
    assert.equal((await g.fetch(...sayReq('  Twelve   chars'))).status, 200, '"Twelve chars" is 12');
    assert.equal(g.used, 12);
    assert.equal((await g.fetch(...sayReq('Thirteen char'))).status, 200);
    assert.equal(g.used, 25);
    assert.equal((await g.fetch(...sayReq('x'))).status, 429, 'one more is one too many');
    assert.equal(real, 2);
    g.end();
    assert.equal(g.left(), 0);
  });

  test('a clip the proxy served from its cache costs nothing, and neither does a request it refused or that failed', async () => {
    const answers = [clipResponse('hit'), Response.json({ error: 'quota', reason: 'daily', retryAfter: 60 }, { status: 429 }), null];
    const spent = [], seen = [];
    const g = gate(async () => { const a = answers.shift(); if (!a) throw new TypeError('offline'); return a; }, { onSpend: n => spent.push(n), onRefund: n => spent.push(-n), onAnswer: (res, body) => seen.push([res.status, body?.reason]) });
    g.grant(100);
    await g.fetch(...sayReq('From the cache.'));
    assert.equal(g.used, 0);
    await g.fetch(...sayReq('Refused by the proxy.'));
    assert.equal(g.used, 0);
    await assert.rejects(g.fetch(...sayReq('Never answered.')));
    assert.equal(g.used, 0);
    assert.deepEqual(spent, [15, -15, 21, -21, 15, -15]);
    assert.deepEqual(seen, [[200, undefined], [429, 'daily']], 'the proxy\'s refusal is seen (the narrator says which allowance)');
  });

  test('after a refusal from gate, a PRPVoice.stream built on it may read again once its clock has moved on two seconds', async () => {
    let t = 0;
    class Audio { constructor() { this.paused = true; this.currentTime = 0; this.duration = NaN; } play() { this.paused = false; queueMicrotask(() => this.onended?.()); return Promise.resolve(); } pause() { this.paused = true; } }
    const real = async url => (String(url).endsWith('voices') ? Response.json({ available: true, voices: [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan' }] }) : clipResponse());
    const g = gate(real);
    const s = V.stream({ fetch: g.fetch, Audio, now: () => t, raf: () => 0, caf: () => {} });
    const p = { text: 'One. Two.', units: V.utterances('One. Two.') }, o = { voice: 'azure:en-GB-RyanNeural', rate: 1 };
    assert.equal(await s.canSay(p, o), true);
    const first = await s.say(p, o, {});
    assert.deepEqual([first.done, first.reason], [false, 'quota'], 'refused: no permission');
    assert.equal(await s.canSay(p, o), false, 'set aside');
    t += 2000;
    assert.equal(await s.canSay(p, o), true, 'back after two seconds, not ten minutes');
    // The stream keeps a failed clip for 5 s for any reading: why the narrator builds a fresh stream for each new
    // permission rather than wait. Past that, this one reads too.
    g.grant(100);
    t += 4000;
    assert.equal((await s.say(p, o, {})).done, true);
  });
});

test('the day\'s own count never allows more in a UTC day than the most it was told was left that day, and starts again the next day', () => {
  const mem = new Map(), store = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) };
  let now = Date.UTC(2026, 10, 6, 9);
  const d = dayCount(store, () => now);
  d.told(30000);
  assert.equal(d.allowed(30000), 30000);
  d.spend(20000);
  // The proxy's counts start again in another copy of the function: it says 30,000 again. Only 10,000 may be allowed.
  d.told(30000);
  assert.equal(d.allowed(30000), 10000);
  assert.equal(d.allowed(4000), 4000, 'never more than the proxy says');
  d.refund(500);
  assert.equal(d.allowed(30000), 10500);
  assert.deepEqual(JSON.parse(mem.get(KEYS.sent)), { day: '2026-11-06', max: 30000, sent: 19500 });
  now = Date.UTC(2026, 10, 7, 0, 0, 1);
  assert.equal(d.allowed(30000), 0, 'nothing told yet today');
  d.told(30000);
  assert.equal(d.allowed(30000), 30000, 'a new UTC day');
});

test('probe: what the proxy says about itself, and nothing when it is not set up or not there', async () => {
  const ok = await probe(async () => Response.json({ available: true, voices: [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English' }, { id: 'nonsense' }], left: { today: 30000, month: 450000 }, quota: 'memory' }));
  assert.deepEqual(ok, { available: true, voices: [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan', label: 'Ryan, British English', lang: 'en-GB' }], left: { today: 30000, month: 450000 }, quota: 'memory', about: true });
  assert.equal((await probe(async () => new Response('missing', { status: 404 }))).available, false);
  assert.equal((await probe(async () => new Response('<!doctype html>', { status: 200 }))).available, false, 'the live site answers a missing address with a page');
  assert.equal((await probe(async () => { throw new TypeError('offline'); })).available, false);
});

/* ---------- the reading loop, on the voice layer with fake backends ---------- */
// A device backend that says each unit at once, and a stream that does too (or fails as told); both record what they
// were asked to say, with which voice.
function fakeDevice(voices = [{ name: 'Daniel', lang: 'en-GB' }]) {
  const b = {
    id: 'webspeech', says: [],
    device: { list: () => voices, pick: () => voices[0] || null, onChange() {} },
    async voices() { return []; }, async canSay() { return true; },
    // Each unit: begun (onSentence), then said a moment later unless stop() came first.
    async say(p, o, ev) { const my = ++b.token; for (let k = o.from; k < p.units.length; k++) { ev.onSentence?.(k); await flush(); if (my !== b.token) return { done: false, sentence: k, reason: 'stopped' }; b.says.push({ id: p.id, k, voice: o.voice }); } return { done: true, sentence: p.units.length - 1 }; },
    token: 0, stop() { b.token++; }, pause: () => false, resume() {}, unlock() {},
  };
  return b;
}
// Like the real one, it asks for the next paragraph's first unit while the last unit of this one plays, and keeps the
// clips it has, so a unit fetched ahead is not asked for again.
function fakeStream(log, { failAt = Infinity } = {}) {
  return fetchFn => { const kept = new Set(); return {
    id: 'stream',
    async voices() { return []; },
    async canSay(p, o) { return V.isOnline(o.voice); },
    async say(p, o, ev) {
      for (let k = o.from; k < p.units.length; k++) {
        if (!kept.has(p.units[k].text)) {
          const res = await fetchFn(...sayReq(p.units[k].text));
          if (!res.ok || log.length >= failAt) return { done: false, sentence: k, reason: 'quota' };
          kept.add(p.units[k].text);
        }
        if (k === p.units.length - 1 && o.next) { const t = o.next.units[0].text; if (!kept.has(t) && (await fetchFn(...sayReq(t))).ok) kept.add(t); }
        ev.onSentence?.(k); log.push({ id: p.id, k, next: o.next?.id || null }); await flush();
      }
      return { done: true, sentence: p.units.length - 1 };
    },
    stop() {}, pause: () => false, resume() {}, unlock() {},
  }; };
}
const memStore = () => { const m = new Map(); return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)) }; };
const proxyFetch = (left = 30000) => async url => (String(url).endsWith('voices') ? Response.json({ available: true, voices: [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan' }], left: { today: left, month: 450000 }, quota: 'memory' }) : clipResponse());
const until = async f => { for (let i = 0; i < 2000 && !f(); i++) await flush(); assert.ok(f(), 'in time'); };

describe('the narrator', () => {
  const ch3 = FIXTURE.chapters.find(c => c.n === 3), ps = chapterPassages(ch3);
  test('it reads the chapter\'s paragraphs in order with this device\'s voice, notes left out, and tells the page each unit and the chapter\'s end', async () => {
    const device = fakeDevice(), units = [];
    let ended = 0;
    const n = new Narrator({ device, store: memStore(), fetch: proxyFetch(), stream: fakeStream([]), onUnit: u => units.push(`${u.pid}:${u.k}`), onChapterEnd: () => ended++ });
    n.load(ch3, 'fixture#3');
    n.play();
    await until(() => ended === 1);
    assert.deepEqual(units, ps.flatMap(p => p.units.map((_, k) => `${p.id}:${k}`)));
    assert.ok(!units.some(u => u.startsWith('c03-n04')), 'the note is not read');
    assert.ok(device.says.every(s => s.voice === 'Daniel'));
    // Paused, it remembers the unit; played again, it reads that unit again.
    n.load(ch3, 'fixture#3', ch3.paragraphs.findIndex(p => p.id === 'c03-p05'));
    device.says.length = 0;
    n.play(); await until(() => device.says.length >= 2); n.pause();
    const at = { ...n.pos };
    device.says.length = 0;
    n.play(); await until(() => device.says.length >= 1); n.pause();
    assert.deepEqual([device.says[0].id, device.says[0].k], [ps[at.i].id, at.k]);
  });

  test('the online voice only for paragraphs the permission covers to their end, the next fetched ahead only inside it, never more characters than allowed; then the device voice, and the page is told why', async () => {
    const log = [], device = fakeDevice(), msgs = [];
    const n = new Narrator({ device, store: memStore(), fetch: proxyFetch(costFrom(ps.slice(0, 2)) + 7), stream: fakeStream(log), onMessage: m => msgs.push(m?.why || null) });
    n.load(ch3, 'fixture#3');
    await n.offer('azure:en-GB-RyanNeural');
    const f = n.figures('azure:en-GB-RyanNeural');
    assert.equal(f.cost, costFrom(ps));
    assert.equal(f.allow.chars, costFrom(ps.slice(0, 2)), 'today\'s allowance covers the first two paragraphs, to the end of the second');
    assert.equal(n.accept('azure:en-GB-RyanNeural'), f.allow.chars);
    await until(() => device.says.length > 0);
    n.pause();
    assert.deepEqual([...new Set(log.map(l => l.id))], [ps[0].id, ps[1].id], 'online: the two paragraphs allowed');
    assert.deepEqual(log.filter(l => l.next).map(l => [l.id, l.next]), log.filter(l => l.id === ps[0].id).map(l => [l.id, ps[1].id]), 'the second fetched ahead from the first; nothing ahead of the second');
    assert.equal(log.filter(l => l.id === ps[1].id).length, ps[1].units.length, 'the second read online whole, its first unit fetched ahead and not paid for twice');
    assert.equal(n.day.get().sent, f.allow.chars, 'exactly the characters allowed were sent');
    assert.equal(device.says[0].id, ps[2].id, 'the device voice reads on from the third');
    assert.equal(n.permit, null, 'the permission has ended');
    assert.ok(msgs.includes('used'));
  });

  test('a hand-over ends the permission at once; with no device voice the reading pauses and says so; a new permission reads online again at once', async () => {
    const log = [], device = fakeDevice([]), msgs = [];
    const n = new Narrator({ device, store: memStore(), fetch: proxyFetch(), stream: fakeStream(log, { failAt: 1 }), onMessage: m => msgs.push(m?.why || null) });
    n.load(ch3, 'fixture#3');
    await n.offer('azure:en-GB-RyanNeural');
    n.accept('azure:en-GB-RyanNeural');
    await until(() => !n.playing);
    assert.equal(n.permit, null);
    assert.deepEqual(msgs.filter(Boolean), ['daily', 'nodevice']);
    assert.deepEqual(device.says, [], 'no device voice: nothing read in silence');
    // Pressed again straight after: a fresh stream, so the online voice reads, not the device's.
    const log2 = [], again = new Narrator({ device: fakeDevice(), store: memStore(), fetch: proxyFetch(), stream: fakeStream(log2) });
    again.load(ch3, 'fixture#3');
    await again.offer('azure:en-GB-RyanNeural');
    again.accept('azure:en-GB-RyanNeural');
    await until(() => log2.length >= 1);
    again.pause();
    assert.equal(log2[0].id, ps[0].id);
  });

  test('every visit starts with this device\'s voice: an online voice is never remembered, and jdpi.doc.voice is never read', async () => {
    const store = memStore();
    store.set('jdpi.doc.voice', 'azure:en-GB-RyanNeural');
    const log = [], device = fakeDevice();
    const n = new Narrator({ device, store, fetch: proxyFetch(), stream: fakeStream(log) });
    n.load(ch3, 'fixture#3'); n.play();
    await until(() => device.says.length >= 2); n.pause();
    assert.deepEqual(log, [], 'no request to say');
    await n.offer('azure:en-GB-RyanNeural'); n.accept('azure:en-GB-RyanNeural'); n.pause();
    assert.equal(store.get(KEYS.voice, null), null);
    assert.equal(store.get('jdpi.doc.voice', null), 'azure:en-GB-RyanNeural', 'Kino\'s and the Documentary\'s choice is left as it was');
    n.deviceVoice = 'Daniel';
    assert.equal(store.get(KEYS.voice, null), 'Daniel', 'a device voice is remembered');
    const next = new Narrator({ device: fakeDevice(), store, fetch: proxyFetch(), stream: fakeStream([]) });
    assert.equal(next.permit, null);
    assert.equal(next.voiceKind, 'webspeech');
  });

  test('at the next chapter the one-press offer asks the proxy afresh what is left, and waits for the answer', async () => {
    const ch1 = FIXTURE.chapters.find(c => c.n === 1);
    let left = { today: 30000, month: 450000 }, asked = 0;
    const fetch = async url => { if (String(url).endsWith('voices')) { asked++; return Response.json({ available: true, voices: [{ id: 'azure:en-GB-RyanNeural', name: 'Ryan' }], left, quota: 'memory' }); } return clipResponse(); };
    const n = new Narrator({ device: fakeDevice(), store: memStore(), fetch, stream: fakeStream([]) });
    n.load(ch1, 'fixture#1');
    await n.offer('azure:en-GB-RyanNeural');
    n.accept('azure:en-GB-RyanNeural');
    n.pause();
    const before = asked;
    // Other readers have spent the month meanwhile.
    left = { today: 0, month: 0 };
    n.load(ch3, 'fixture#3');
    assert.equal(n.stale, true, 'the offer waits');
    assert.equal(asked, before + 1, 'asked afresh');
    await until(() => !n.stale);
    const f = n.figures(n.lastOnline);
    assert.equal(f.month, 0);
    assert.equal(f.allow.chars, 0, 'nothing is offered that is not left');
    // The same chapter again asks nothing.
    n.load(ch3, 'fixture#3');
    assert.equal(asked, before + 1);
  });
});

/* ---------- Screens only: the book's pictures and the era's screens take their turn (B2) ---------- */
describe('Screens only: pictures and screens in turn', () => {
  const U = (from, to, asks = true) => ({ from, to, chars: to - from, asks });
  const terms = [{ qid: 'Q1', at: 0, end: 5 }, { qid: 'Q2', at: 5000, end: 5005 }];
  test('a turn comes after TOUR_AFTER characters with no new term, or after TOUR_EVERY since the last turn once the entry has had its WAIT; a term takes the pane back after TOUR_STAY', () => {
    assert.ok(WAIT < TOUR_STAY && TOUR_STAY < TOUR_AFTER && TOUR_AFTER < TOUR_EVERY);
    assert.equal(tour({ showing: 'Q1', read: TOUR_AFTER - 1, fresh: false }, null, { screens: 2 }).screen, false);
    const r = tour({ showing: 'Q1', read: TOUR_AFTER, fresh: false }, null, { screens: 2 });
    assert.equal(r.screen, true);
    assert.deepEqual(r.state, { showing: SCREEN, read: 0, fresh: false });
    assert.equal(tour({ showing: 'Q1', read: TOUR_AFTER, fresh: false }, 'Q2', { screens: 2 }).screen, false, 'not when a term has just moved the pane');
    assert.equal(tour({ showing: 'Q1', read: TOUR_AFTER, fresh: false }, null, { screens: 0 }).screen, false, 'nothing to show');
    assert.equal(tour({ showing: 'Q1', read: WAIT, fresh: false }, null, { screens: 1, since: TOUR_EVERY }).screen, true, 'a chapter thick with terms still has its turns');
    assert.equal(tour({ showing: 'Q1', read: WAIT - 1, fresh: false }, null, { screens: 1, since: TOUR_EVERY }).screen, false, 'once the entry showing has had its WAIT');
    // On a turn, the nearest term comes back only after TOUR_STAY (WAIT is not enough).
    assert.equal(follow({ showing: SCREEN, read: TOUR_STAY - 1, fresh: false }, U(10, 60), terms).show, null);
    assert.equal(follow({ showing: SCREEN, read: TOUR_STAY, fresh: false }, U(10, 60), terms).show, 'Q1');
  });
  test('over a chapter of The Prince read in Screens only, the entries, the pictures and the screens all have the pane', () => {
    const ch = PRINCE.chapters.find(c => c.n === 7), { terms: ts, base } = chapterTerms(ch);
    let state = fresh(null), since = TOUR_EVERY, turns = 0, entries = new Set();
    for (const p of chapterPassages(ch)) for (const u of p.units) {
      const r = follow(state, span(base, p.id, u), ts);
      state = r.state;
      if (r.show) entries.add(r.show);
      const t = tour(state, r.show, { screens: 3, since });
      if (t.screen) { state = t.state; since = 0; turns++; }
      since += u.text.length;
    }
    assert.ok(entries.size >= 3, `${entries.size} entries`);
    assert.ok(turns >= 3, `${turns} turns for pictures and screens`);
  });
  test('turns: a picture first, then pictures and screens alternate; one kind alone takes every turn', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(k => turnOf(k, 2, 3)), [{ kind: 'picture', i: 0 }, { kind: 'screen', i: 0 }, { kind: 'picture', i: 1 }, { kind: 'screen', i: 1 }, { kind: 'picture', i: 0 }]);
    assert.deepEqual([0, 1, 2].map(k => turnOf(k, 0, 2).kind), ['screen', 'screen', 'screen']);
    assert.deepEqual([0, 1, 2].map(k => turnOf(k, 2, 0)), [{ kind: 'picture', i: 0 }, { kind: 'picture', i: 1 }, { kind: 'picture', i: 0 }]);
    assert.equal(turnOf(0, 0, 0), null);
  });
  test('the pictures file: every book on the shelf has its pictures, each a scene of Kino’s stage that it can draw', () => {
    const P = read('bibliotheca/data/pictures.json'), ctx = loadContext();
    assert.match(P.about, /Wikimedia Commons/, 'the credits are said');
    for (const b of BOOKS) {
      const entry = P.books[b.slug];
      assert.ok(entry?.pictures?.length, `${b.slug} has pictures`);
      for (const c of b.chapters) assert.ok(picturesFor(P, b.slug, c.n).length >= 1, `${b.slug} chapter ${c.n} has a picture`);
      const film = entry.film ? read(`kino/data/${entry.film}.json`) : null;
      for (const p of entry.pictures) {
        if (Array.isArray(p.chapters)) assert.ok(b.chapters.some(c => c.n === p.chapters[0]) && b.chapters.some(c => c.n === p.chapters[1]), `${b.slug}: chapters ${p.chapters} are the book's`);
        let scene = p.scene;
        if (typeof scene === 'string') { assert.ok(film, `${b.slug}: a film's scene needs the film`); scene = flatScenes(film).find(s => s.id === p.scene); assert.ok(scene, `${b.slug}: ${p.scene} is a scene of ${entry.film}`); }
        assert.notEqual(scene.visual?.kind, 'module', 'a picture, not a link card');
        if (typeof p.scene === 'object') {
          const doc = { id: 'x', category: 'wars', title: 'x', summary: 'x.', era: [1, 2], minutes: 1, subjects: [{ qid: 'Q1', label: 'x' }], sources: [], scenes: [{ ...scene, narration: 'One. Two.' }] };
          assert.deepEqual(validateScript(doc, ctx).errors.filter(e => /^scene \d/.test(e) && !/narration|cites|link/.test(e)), [], `${b.slug}: ${scene.id} is a scene Kino's stage draws`);
        }
      }
    }
    assert.deepEqual(picturesFor(P, 'the-prince', 7).map(p => [p.film, p.scene]), [['great-thinkers/niccolo-machiavelli', 'cesare-borgia']], 'chapter VII, Cesare Borgia');
    assert.deepEqual(picturesFor(P, 'no-such-book', 1), []);
  });
});

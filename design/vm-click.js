/* The researcher's click (PRP-SCHOLAR-USP-DESIGN.md 2.1, 2.2, 2.5 and "The contract for the reader-pane job"). Pure:
   no DOM, no fetch; the page hands in the lake records and files it has loaded, and the tests call it directly.

   Contract 1, the click event. Neo Book's term click dispatches `vm:click` on window (and across frames by postMessage,
   checked against location.origin) with the detail clickDetail() returns:
     { v: 1, subject: { qid, key?, label, kind },
       from: { module: 'neo-classic' | 'kino' | 'omni-news' | <id>, at,
               passage?: { book, ch, p, range?: [s, e], toP? },      range: the book file's s/e offsets into the text
               periods?: [{ from, to, p, basis }], places?: [<Q | ISO3 | gw:N>] },
       gesture: 'term' | 'selection' | 'scene' | 'news' | 'badge' | 'name' }
   Contract 2, the resolver. resolve(entry, from, ctx) returns exactly { recipe, offers, related, thin }:
     recipe   a VR/1 string (design/vm-recipe.js) by the rules of 2.1
     offers   [{ id, name, at, recipe?, why, available, reason? }]
     related  [{ group, items: [{ qid, label, why, at }] }]
     thin     false, or { missing: ['dates' | 'place' | 'related'], text } in 2.5's words
   Contract 5, the periods file (bibliotheca/data/periods/<slug>.json): readPeriods.
   Contract 6, the follow channel (BroadcastChannel('vm-follow')): followMessage.

   ctx, what the page has loaded (every part optional):
     today          'YYYY-MM-DD', the end of a living person's window
     era            [from, to], the chapter's or the book's period (bibliotheca/neo/lib/era.js bookEra)
     record         the paragraph's periods record (readPeriods(file)(pid)); counted only once a second reader set checkedBy
     lookup(q)      the lake record of a Q-id, or null
     passagePlaces  the paragraph's tagged places, in order of first appearance (Q-ids or lake records)
     battles        the rows of omni/data/layers/battles.json ({ q, label, date, sortYear, pt, partOf })
     wars           War Focus's wars ({ id, qid, name }); layers { borders: { step } }, the fill's own step
   S1 builds the person, the place and the battle; any other kind gets the generic rules and says so. */
import { writeRecipe, readRecipe } from './vm-recipe.js';
import { yearOf, addYears, yearsBetween, precisionOf, formatSpan, formatYear } from './vm-dates.js';

export const GESTURES = ['term', 'selection', 'scene', 'news', 'badge', 'name'];
export const KINDS = ['person', 'place', 'battle'];
const QID = /^Q[1-9]\d*$/;
const PLACE = /^(?:Q[1-9]\d*|[A-Z]{3}|gw:\d{1,4})$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
const PID = /^[A-Za-z0-9][\w-]{0,40}$/;
const str = v => typeof v === 'string' && v.trim() !== '';
const STEP_ORDER = ['d', 'm', 'y', '10y', 'c'];
const coarsest = (...s) => s.filter(x => STEP_ORDER.includes(x)).reduce((a, b) => (STEP_ORDER.indexOf(b) > STEP_ORDER.indexOf(a) ? b : a), 'd');
const stepOfPrecision = p => (p >= 11 ? 'd' : p === 10 ? 'm' : p === 9 ? 'y' : p === 8 ? '10y' : 'c');
const STEP_YEARS = { d: 1, m: 1, y: 1, '10y': 10, c: 100 };
// A living person: no death recorded, and born within this many years of today.
const LIFESPAN = 120;

/* ---------- contract 1: the vm:click detail ---------- */
function period(x) {
  if (!x || typeof x !== 'object') return null;
  const from = yearOf(x.from), to = yearOf(x.to);
  if (from == null || to == null || from > to || !Number.isInteger(x.p)) return null;
  if (x.basis != null && !['stated', 'inferred'].includes(x.basis)) return null;
  return { from, to, p: x.p, ...(x.orig ? { orig: String(x.orig) } : {}), ...(x.basis ? { basis: x.basis } : {}) };
}
/** The click's detail, validated: exactly the contract's shape (unknown keys dropped), or null when malformed. */
export function clickDetail(d) {
  if (!d || typeof d !== 'object' || !GESTURES.includes(d.gesture)) return null;
  const s = d.subject, f = d.from;
  if (!s || !QID.test(String(s.qid ?? '')) || !str(s.label) || !str(s.kind)) return null;
  if (!f || !str(f.module) || !/^[a-z][a-z0-9-]{0,40}$/.test(f.module) || typeof f.at !== 'string') return null;
  const subject = { qid: s.qid, ...(str(s.key) ? { key: s.key } : {}), label: s.label, kind: s.kind };
  const from = { module: f.module, at: f.at };
  if (f.passage != null) {
    const p = f.passage;
    if (!p || !SLUG.test(String(p.book ?? '')) || !Number.isInteger(p.ch) || p.ch < 0 || !PID.test(String(p.p ?? ''))) return null;
    const passage = { book: p.book, ch: p.ch, p: p.p };
    if (p.range != null) {
      if (!Array.isArray(p.range) || p.range.length !== 2 || !p.range.every(n => Number.isInteger(n) && n >= 0) || p.range[0] > p.range[1]) return null;
      passage.range = [p.range[0], p.range[1]];
    }
    if (p.toP != null) { if (!PID.test(String(p.toP))) return null; passage.toP = p.toP; }
    from.passage = passage;
  }
  if (f.periods != null) {
    if (!Array.isArray(f.periods)) return null;
    const ps = f.periods.map(period);
    if (ps.some(x => !x)) return null;
    from.periods = ps;
  }
  if (f.places != null) {
    if (!Array.isArray(f.places) || !f.places.every(x => PLACE.test(String(x)))) return null;
    from.places = [...f.places];
  }
  return { v: 1, subject, from, gesture: d.gesture };
}

/** The kind the click builds for: person, place, battle (a conflict with one date), war (a conflict with a span), else
    the lake's own type. */
export function kindOf(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const f = entry.facts || {};
  if (entry.type === 'conflict') return f.date && !f.start && !f.end ? 'battle' : f.start || f.end ? 'war' : 'conflict';
  return entry.type || null;
}

/* ---------- contract 5: the periods file ---------- */
/** A periods file's reader: (pid) → { places, periods, basis, checkedBy } or null. A missing or malformed file,
    paragraph or period reads as no record. checkedBy is the paragraph's own, else the file's; a record counts as the
    click's default only when it is set (resolve), and is otherwise offered as a chip. */
export function readPeriods(json) {
  const ok = json && typeof json === 'object' && SLUG.test(String(json.book ?? '')) && json.paragraphs && typeof json.paragraphs === 'object';
  const fn = pid => {
    if (!ok || !PID.test(String(pid ?? ''))) return null;
    const r = json.paragraphs[pid];
    if (!r || typeof r !== 'object' || !Array.isArray(r.periods) || !r.periods.length) return null;
    const periods = r.periods.map(period);
    if (periods.some(p => !p || !p.basis)) return null;
    const places = Array.isArray(r.places) ? r.places.filter(x => PLACE.test(String(x))) : [];
    const checkedBy = r.checkedBy !== undefined ? r.checkedBy : json.checkedBy;
    return { places, periods, basis: r.basis ?? null, checkedBy: str(checkedBy) ? checkedBy : null };
  };
  fn.book = ok ? json.book : null;
  return fn;
}

/* ---------- 2.1's rules ---------- */
const lenStep = n => (n < 1 ? 'd' : n < 5 ? 'm' : n < 300 ? 'y' : n < 1500 ? '10y' : 'c');
// Rounded outward to whole steps of `size` years (a decade, a century), never onto the year 0 that does not exist.
const floorTo = (y, size) => { if (size <= 1) return y; const a = Math.floor(yearToAstro(y) / size) * size; return fromAstroSafe(a, -1); };
const ceilTo = (y, size) => { if (size <= 1) return y; const a = Math.ceil(yearToAstro(y) / size) * size; return fromAstroSafe(a, 1); };
const yearToAstro = y => (y < 0 ? y + 1 : y);
const fromAstroSafe = (a, dir) => (a > 0 ? a : a < 0 ? a - 1 : dir < 0 ? -1 : 1);

function spanOf(entry, kind, today) {
  const f = entry?.facts || {}, fp = entry?.fp || {};
  const pair = (a, b) => (f[a] || f[b] ? [a, b] : null);
  const [ka, kb] = pair('born', 'died') || pair('founded', 'dissolved') || pair('start', 'end') || [null, null];
  const y = k => (k && f[k] ? yearOf(f[k]) : null);
  const pr = k => precisionOf(f[k], fp[k]);
  if (ka) {
    let a = y(ka), b = y(kb);
    const ps = [ka, kb].filter(k => f[k]).map(pr);
    const now = yearOf(String(today || '').slice(0, 4));
    if (a != null && b == null) {
      // No end: a living person, or a place still standing, runs to today; a birth long ago with no death is a lone date.
      if (now != null && (kind !== 'person' || yearsBetween(a, now) <= LIFESPAN)) return { from: a, to: now, ps, open: true };
      return { lone: a, ps };
    }
    if (a == null && b != null) return { lone: b, ps };
    if (a != null && b != null) return a <= b ? { from: a, to: b, ps } : null;
  }
  if (f.date) return { lone: yearOf(f.date), ps: [precisionOf(f.date, fp.date)] };
  return null;
}
/** The window of 2.1 rule 1 from the entry's own dates: { from, to, step, p } (step the window length's own, p the
    coarsest end precision), or null when the entry has no dates. Each end is widened by 10% of the span (at least one
    step) and rounded outward to whole steps; a lone date ±5 years, a battle ±1; an open end stops at today. */
export function windowFor(entry, { kind = kindOf(entry), today } = {}) {
  const s = spanOf(entry, kind, today);
  if (!s || (s.lone == null && s.from == null)) return null;
  const p = Math.min(...s.ps.filter(Number.isInteger), 11);
  if (s.lone != null) {
    const n = kind === 'battle' ? 1 : 5;
    const from = addYears(s.lone, -n), to = addYears(s.lone, n);
    return { from, to, step: lenStep(yearsBetween(from, to) + 1), p };
  }
  const span = yearsBetween(s.from, s.to);
  const size = STEP_YEARS[lenStep(span)];
  const pad = Math.max(size, span * 0.1);
  const now = s.open ? s.to : null;
  let from = floorTo(fromAstroSafe(Math.floor(yearToAstro(s.from) - pad), -1), size);
  let to = s.open ? now : ceilTo(fromAstroSafe(Math.ceil(yearToAstro(s.to) + pad), 1), size);
  if (s.open && now != null && to > now) to = now;
  return { from, to, step: lenStep(yearsBetween(from, to)), p };
}
/** 2.1 rule 2: the passage's year; else the era's start if it falls in the window; else the window's start. */
export function frameFor(win, { passageYear, era } = {}) {
  if (!win) return null;
  if (passageYear != null) return passageYear;
  const e = Array.isArray(era) ? yearOf(era[0]) : null;
  return e != null && win.from <= e && e <= win.to ? e : win.from;
}
/** 2.1 rule 3: the coarsest of the ends' precision (Wikidata's code), the fill's own step and the window length's
    step (day under a year, month under 5 years, year under 300, decade under 1,500, century beyond). */
export function stepFor({ ends, fill = 'y', from, to } = {}) {
  const parts = [fill];
  if (Number.isInteger(ends)) parts.push(stepOfPrecision(ends));
  if (from != null && to != null) parts.push(lenStep(yearsBetween(from, to) + 1));
  return coarsest(...parts);
}

/* ---------- the resolver ---------- */
const recordOf = (ctx, x) => (typeof x === 'string' ? ctx.lookup?.(x) || { q: x } : x);
const datesHold = (rec, year) => {
  const f = rec?.facts || {};
  const a = yearOf(f.founded ?? f.start ?? f.born), b = yearOf(f.dissolved ?? f.end ?? f.died);
  return (a == null || a <= year) && (b == null || year <= b);
};
const fromKey = from => {
  const p = from?.passage;
  const mod = from?.module === 'neo-classic' ? 'neo' : from?.module;
  return p && mod ? `${mod}:${p.book}/${p.ch}/${p.p}` : undefined;
};
const entryAt = q => `encyclopedia/index.html#${q}`;
const omniAt = recipe => `omni/index.html#${recipe}`;
const wikiAt = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_')).replace(/%2F/g, '/')}`;
const article = w => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const KIND_WORDS = { war: 'war', conflict: 'conflict', event: 'event', election: 'election', idea: 'idea', topic: 'topic', party: 'party', organisation: 'organisation' };

/** The click's view, offers, related items and thin note (contract 2), by 2.1's rules. */
export function resolve(entry, from = {}, ctx = {}) {
  entry = entry && typeof entry === 'object' ? entry : {};
  const kind = kindOf(entry), label = entry.label || entry.q || 'this';
  const fillStep = ctx.layers?.borders?.step || 'y';
  const battleRow = (ctx.battles || []).find(b => (b.q || b.id) === entry.q) || null;
  const pt = entry.pt || battleRow?.pt || null;

  // The passage's periods: a record a second reader has checked is the default; one not yet checked is only a chip.
  const rec = ctx.record || (from.periods?.length ? { periods: from.periods, places: from.places || [], checkedBy: 'click' } : null);
  const pspan = rec?.periods?.length ? { from: Math.min(...rec.periods.map(p => p.from)), to: Math.max(...rec.periods.map(p => p.to)),
    p: Math.min(...rec.periods.map(p => p.p)), year: rec.periods[0].from } : null;
  const checked = !!(pspan && rec.checkedBy);

  // Rule 1: the life (or the era, for an entry with no dates of its own).
  const own = windowFor(entry, { kind, today: ctx.today });
  const era = Array.isArray(ctx.era) && yearOf(ctx.era[0]) != null && yearOf(ctx.era[1]) != null ? { from: yearOf(ctx.era[0]), to: yearOf(ctx.era[1]) } : null;
  const lifeWin = own || (era ? { from: era.from, to: era.to, p: 9 } : null);

  const build = (win, passageYear, places) => {
    const at = frameFor(win, { passageYear, era: ctx.era });
    const step = win ? stepFor({ ends: win.p, fill: fillStep, from: win.from, to: win.to }) : fillStep;
    const focus = win ? focusFor(entry, at, places, pt, ctx) : focusFor(entry, null, places, pt, ctx);
    return writeRecipe({ vr: 1, t: win ? { from: win.from, to: win.to } : undefined, at: at ?? undefined, show: 'frame', step, base: 'plain',
      fill: 'borders', l: [{ id: 'battles' }], focus: focus.length ? focus.slice(0, 20) : undefined, q: QID.test(entry.q || '') ? entry.q : undefined, from: fromKey(from) });
  };
  const passagePlaces = rec?.places?.length && checked ? rec.places : ctx.passagePlaces || [];
  const lifeRecipe = build(lifeWin, null, ctx.passagePlaces || []);
  const passageRecipe = pspan ? build({ from: pspan.from, to: pspan.to, p: pspan.p }, pspan.year, rec.places?.length ? rec.places : ctx.passagePlaces || []) : null;
  const recipe = checked ? passageRecipe : lifeRecipe;
  const win = checked ? pspan : lifeWin;

  // Offers.
  const offers = [];
  const lifeName = kind === 'person' ? 'Its whole life' : 'Its years';
  // Why each view opens on its frame (2.1 rule 2), said beside it, so a reader never takes the frame for the passage's
  // year when VM has not dated the passage.
  const frameWhy = (r, passageYear) => {
    const at = readRecipe(r)?.at;
    if (at == null) return '';
    const e = Array.isArray(ctx.era) ? [yearOf(ctx.era[0]), yearOf(ctx.era[1])] : null;
    const why = passageYear != null ? 'the paragraph\'s first year' : e && e[0] === yearOf(at) ? `the start of the book's era (${formatSpan(e[0], e[1])})` : 'the first of these years';
    return `the map opens on ${formatYear(yearOf(at))}, ${why}`;
  };
  const undated = !from.passage ? '' : !pspan ? ': this paragraph has no periods record yet, so VM has not dated it' : !checked ? ': this paragraph\'s periods record is not yet checked by a second reader' : '';
  const passageOffer = from.passage ? (pspan
    ? { id: 'passage', name: 'This passage', at: omniAt(passageRecipe), recipe: passageRecipe, available: true,
        why: checked ? `The years this paragraph concerns, ${formatSpan(pspan.from, pspan.to)}; ${frameWhy(passageRecipe, pspan.year)}` : `The years this paragraph concerns, ${formatSpan(pspan.from, pspan.to)}, as its periods record gives them; not yet checked by a second reader; ${frameWhy(passageRecipe, pspan.year)}` }
    : { id: 'passage', name: 'This passage', at: '', available: false, why: 'The years this paragraph concerns', reason: 'This paragraph has no periods record yet' }) : null;
  const lifeWhy = frameWhy(lifeRecipe, null);
  const lifeOffer = lifeWin ? { id: 'life', name: lifeName, at: omniAt(lifeRecipe), recipe: lifeRecipe, available: true,
    why: (own ? `${label}'s own dates with a margin either side, ${formatSpan(own.from, own.to)}` : `${label} has no dates of its own in VM; the period of the book`)
      + (lifeWhy ? `; ${lifeWhy}${undated}` : '') }
    : { id: 'life', name: lifeName, at: '', available: false, why: `${label}'s own dates`, reason: `VM holds no dates for ${label}` };
  if (checked) offers.push(passageOffer, lifeOffer);
  else { if (passageOffer) offers.push(passageOffer); offers.push(lifeOffer); }
  if (QID.test(entry.q || '')) offers.push({ id: 'entry', name: 'Master Index entry', at: entryAt(entry.q), available: true, why: `What the Master Index holds on ${label}` });
  if (str(entry.wiki)) offers.push({ id: 'wiki', name: 'Wikipedia article', at: wikiAt(entry.wiki), available: true, why: `The Wikipedia article on ${label}` });
  if (kind === 'battle') {
    const parent = battleRow?.partOf || entry.rel?.['Part of']?.[0]?.[0] || null;
    const war = parent ? (ctx.wars || []).find(w => w.qid === parent) : null;
    offers.push(war
      ? { id: 'war-focus', name: 'War Focus', at: `battlefield/focus/index.html#war=${encodeURIComponent(war.id)}`, available: true, why: `The war it was part of, ${war.name || war.id}, month by month` }
      : { id: 'war-focus', name: 'War Focus', at: '', available: false, why: 'The war it was part of, month by month', reason: 'no War Focus file for this war' });
  }

  // Related.
  const related = [];
  const relItems = (key, why) => (entry.rel?.[key] || []).filter(([q]) => QID.test(q)).map(([qid, l]) => ({ qid, label: l || qid, why, at: entryAt(qid) }));
  const offices = relItems('Positions held', 'Position held');
  if (offices.length) related.push({ group: 'Offices', items: offices });
  const pl = (passagePlaces || []).map(x => recordOf(ctx, x)).filter(r => r && QID.test(r.q || '') && (!r.type || r.type === 'place'));
  if (from.passage && pl.length) related.push({ group: 'Places in this passage', items: pl.map(r => ({ qid: r.q, label: r.label || r.q, why: 'Named in this paragraph', at: entryAt(r.q) })) });
  const inWin = win ? (ctx.battles || []).filter(b => { const y = b.sortYear ?? yearOf(b.date?.from); return y != null && win.from <= y && y <= win.to && QID.test(b.q || b.id || ''); }) : [];
  if (inWin.length) related.push({ group: 'Battles VM holds for these years', items: inWin.map(b => ({ qid: b.q || b.id, label: b.label, why: `A battle of ${b.sortYear ?? yearOf(b.date?.from)}`, at: entryAt(b.q || b.id) })) });

  // Thin (2.5): fewer than two of a date, a place VM can map and one related item.
  const hasDates = !!own;
  const firstFocus = readFocus(recipe);
  const hasPlace = !!pt || firstFocus.length > 0;
  const hasRelated = related.some(g => g.items.length);
  const missing = [!hasDates && 'dates', !hasPlace && 'place', !hasRelated && 'related'].filter(Boolean);
  const WORDS = { dates: 'no dates', place: 'no place it can map', related: 'nothing related' };
  const little = missing.length >= 2 ? `VM holds little on ${label} yet: ${missing.map(m => WORDS[m]).join(', ')}. What VM has is shown below.` : '';
  let thin = little ? { missing, text: little } : false;
  if (kind && !KINDS.includes(kind)) {
    const note = `VM builds its map view for people, places and battles first; ${label} is ${article(KIND_WORDS[kind] || kind)}.`;
    thin = { missing, text: little ? `${note} ${little}` : note };
  }
  return { recipe, offers, related, thin };
}
const readFocus = recipe => { const m = /(?:^|&)focus=([^&]*)/.exec(recipe); return m ? m[1].split(',') : []; };

// A present-day sovereign state, as the record says: a member of the United Nations (Q1065) with no end.
const presentDay = r => !r?.facts?.dissolved && !r?.facts?.end && (r?.rel?.['Member of'] || []).some(([q]) => q === 'Q1065');
// 2.1 rule 5: the entry's point, its dated places (Country, Participants, Member of) whose own dates hold the frame,
// never a present-day state, and the passage's places; for a place, itself first.
function focusFor(entry, at, passagePlaces, pt, ctx) {
  const out = [];
  const add = q => { if (QID.test(q || '') && !out.includes(q)) out.push(q); };
  const kind = kindOf(entry);
  if (kind === 'place' && (at == null || datesHold(entry, at))) add(entry.q);
  if (pt && kind !== 'place') add(entry.q);
  for (const key of ['Country', 'Participants', 'Member of']) {
    for (const [q] of entry.rel?.[key] || []) {
      if (q === entry.q) continue;
      const r = ctx.lookup?.(q);
      if (!r || r.type !== 'place') continue;
      if (at == null || !r.facts || (!r.facts.founded && !r.facts.dissolved) || !datesHold(r, at)) continue; // undated or not standing then: left out
      if (presentDay(r)) continue; // today's state (San Marino's traditional 301 holds 1494, but the republic of today is not the polity then)
      add(q);
    }
  }
  for (const x of passagePlaces || []) {
    const r = recordOf(ctx, x);
    if (!r || (r.type && r.type !== 'place')) continue;
    if (at != null && (!datesHold(r, at) || presentDay(r))) continue;
    add(r.q);
  }
  return out;
}

/* ---------- contract 6: the follow channel ---------- */
/** A message for BroadcastChannel('vm-follow'): { type: 'follow', from, at, recipe?, label }, or null when malformed. */
export function followMessage({ from, at, recipe, label } = {}) {
  if (!str(from) || typeof at !== 'string' || !at || !str(label)) return null;
  if (recipe != null && !/^vr=1(&|$)/.test(String(recipe))) return null;
  return { type: 'follow', from, at, ...(recipe != null ? { recipe } : {}), label };
}

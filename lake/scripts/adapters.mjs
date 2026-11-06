// Mention adapters: each JDP-I module reports the entities it mentions and where.
// A mention is { key, label, module, url, date?, context, tags?, aliases? }, where key identifies the entity:
//   { title }    an English Wikipedia article title (most modules link to Wikipedia already)
//   { qid }      a Wikidata ID
//   { bioguide } a US Congress Bioguide ID (resolved through Wikidata property P1157)
// `url` is the exact place in JDP-I (absolute), and `module` the registry module id. `aliases` are the names the
// module's own text uses for the entity where Wikidata may not have them (a book's "Duke Valentino" for Cesare
// Borgia): build.mjs adds them to the entity's aliases.
// To bring a new module into the Master Index, add an adapter here, to ADAPTERS, and its submodules to ADAPTER_MODULES
// (tests/master-index.test.mjs holds every live submodule in registry.json to that, or to its written exemption).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THINKERS, spectrumTag } from './thinkers.mjs';
import { CATEGORY_IDS, flatScenes } from '../../kino/lib/format.js';
import { readAt, kinoHash } from '../../kino/lib/links.js';

export const JDPI = 'https://jdpi.pages.dev/';
const RETRO = 'https://hp-retrospective.pages.dev/';
const titleOf = url => (/en\.wikipedia\.org\/wiki\//.test(url || '') ? decodeURIComponent(url.split('/wiki/')[1].split('#')[0]).replace(/_/g, ' ') : null);
const year = d => (d ? +String(d).slice(0, 4) : null);
const json = p => JSON.parse(readFileSync(p, 'utf8'));

/** H&P Retrospective: countries, leaders, office-holders, their parties, and elections/events. */
export async function retrospective({ retroDir }) {
  const data = json(join(retroDir, 'data/countries.json'));
  const { COUNTRIES } = await import(pathToFileURL(join(retroDir, 'scripts/countries.mjs')).href);
  const out = [], at = (y, gw) => `${RETRO}#y=${Math.max(y || data.lastYear, data.firstYear)}&c=${gw}`;
  for (const [gw, c] of Object.entries(data.countries)) {
    const qid = COUNTRIES[gw]?.qids?.[0];
    if (qid) out.push({ key: { qid }, label: c.name, module: 'retrospective', url: at(data.lastYear, gw), context: `Leaders, parties and political events, ${data.firstYear}–present` });
    for (const l of c.leaders) {
      const title = titleOf(l.url);
      const span = `${year(l.start)}–${l.end ? year(l.end) : 'present'}`;
      if (title) out.push({ key: { title }, label: l.full || l.name, module: 'retrospective', url: at(year(l.start), gw), date: l.start, context: `Led ${c.name}, ${span}`, tags: [['Role', 'National leader'], ['Led', c.name], ...(l.entry === 'Irregular' ? [['Role', 'Took power irregularly']] : [])] });
      for (const p of l.parties || []) {
        const pt = titleOf(p.url);
        if (pt) out.push({ key: { title: pt }, label: p.name, module: 'retrospective', url: at(year(l.start), gw), date: l.start, context: `Party of ${l.full || l.name} (${c.name}, ${span})`, tags: [['Role', 'Party in power'], ['In power in', c.name]] });
      }
    }
    for (const o of c.offices || []) {
      const title = titleOf(o.url);
      if (title) out.push({ key: { title }, label: o.full, module: 'retrospective', url: at(year(o.start), gw), date: o.start, context: `${o.office === 'hos' ? 'Head of state' : 'Head of government'} of ${c.name}, ${year(o.start)}–${o.end ? year(o.end) : 'present'}`, tags: [['Role', o.office === 'hos' ? 'Head of state' : 'Head of government'], ['Led', c.name]] });
    }
    for (const e of c.events) {
      const title = titleOf(e.url);
      if (title) out.push({ key: { title }, label: e.text, module: 'retrospective', url: at(year(e.date), gw), date: e.date, context: `${c.name}: ${e.text}` });
    }
  }
  return out;
}

const EVENT_TYPE = { election: 'Election', referendum: 'Referendum', party: 'Party contest', leader: 'New leader', inauguration: 'Inauguration',
  resignation: 'Resignation', coup: 'Coup', conflict: 'War or battle', ceasefire: 'Ceasefire or peace talks', assassination: 'Assassination', crisis: 'Crisis',
  protest: 'Protest or strike', treaty: 'Treaty', summit: 'Summit or state visit', sanctions: 'Sanctions', vote: 'Parliamentary vote', court: 'Court ruling' };

/** Historical and Realtime Calendars: every event with a Wikipedia source. */
export function calendar({ jdpiDir }) {
  const out = [];
  for (const d of ['1980s', '1990s', '2000s', '2010s', '2020s']) {
    const p = join(jdpiDir, `calendar/data/${d}.json`);
    if (!existsSync(p)) continue;
    for (const e of json(p).events) {
      const title = titleOf(e.source);
      if (!title) continue;
      const recent = e.date >= new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
      out.push({ key: { title }, label: e.title, module: recent ? 'calendar' : 'historical-calendar', date: e.date,
        url: `${JDPI}q/calendar.html?period=${recent ? 'contemporary' : 'history'}&month=${e.date.slice(0, 7)}`, context: `${e.country}: ${e.title}`, tags: [['Event type', EVENT_TYPE[e.type] || e.type]] });
    }
  }
  return out;
}

/** Retrospective Battlefield (1926–2025), its War Focus submodule, and Realtime Battlefield (this year). */
export function battlefield({ jdpiDir }) {
  const out = [];
  const hist = json(join(jdpiDir, 'battlefield/history/data/wars.json'));
  for (const w of hist.wars) {
    if (!w.wiki) continue;
    out.push({ key: { title: w.wiki }, label: w.name, module: 'battlefield-history', url: `${JDPI}battlefield/history/index.html#y=${w.years[0][0]}&w=${w.id}`,
      date: String(w.years[0][0]), context: `${w.type}, ${w.span || `${w.years[0][0]}–${w.years.at(-1)[0]}`}` });
  }
  // War Focus: each major war and every battle or operation recorded as part of it, keyed by Wikidata ID.
  const focus = json(join(jdpiDir, 'battlefield/focus/data/index.json'));
  for (const f of focus.wars) {
    if (f.qid) out.push({ key: { qid: f.qid }, label: f.name, module: 'war-focus', url: `${JDPI}battlefield/focus/index.html#war=${f.id}`,
      date: f.start, context: `Month by month, ${f.start.slice(0, 4)}–${f.end ? f.end.slice(0, 4) : 'now'}: ${f.battles} battles and operations, ${f.totalDeaths.toLocaleString('en-GB')} battle deaths` });
    const d = json(join(jdpiDir, `battlefield/focus/data/wars/${f.id}.json`));
    for (const b of d.battles) if (b.w) out.push({ key: { qid: b.q }, label: b.n, module: 'war-focus', url: `${JDPI}battlefield/focus/index.html#war=${f.id}&m=${b.s.slice(0, 7)}`,
      date: b.s, context: `Part of ${f.name}${b.deaths ? `; ${b.deaths.toLocaleString('en-GB')} deaths` : ''}` });
  }
  const live = json(join(jdpiDir, 'battlefield/data/realtime.json'));
  for (const w of live.wars) {
    if (!w.wiki) continue;
    out.push({ key: { title: w.wiki.replace(/_/g, ' ') }, label: w.name, module: 'battlefield', url: `${JDPI}q/battlefield.html?view=live&war=${w.id}`,
      date: `${live.year}`, context: `${w.deaths.toLocaleString('en-GB')} deaths recorded in ${live.year} so far` });
  }
  return out;
}

/** Kardashev Tracker: empires and countries, linked at the step of their largest energy share. */
export function kardashev({ jdpiDir }) {
  const d = json(join(jdpiDir, 'kardashev/data/energy.json'));
  return d.polities.filter(p => p.wiki).map(p => {
    let best = null;
    for (const s of d.steps) { const x = s.polities.find(q => q.id === p.id); if (x && (!best || x.share > best.share)) best = { year: s.year, share: x.share }; }
    return { key: { title: p.wiki.replace(/_/g, ' ') }, label: p.name, module: 'kardashev', url: `${JDPI}kardashev/index.html#y=${best?.year ?? p.from}&p=${p.id}`,
      context: best ? `Peak share of world energy: ${(best.share * 100).toFixed(best.share < 0.1 ? 1 : 0)}% in ${best.year < 0 ? -best.year + ' BC' : best.year}` : p.region };
  });
}

/** Trader Tracker: members of Congress (by Bioguide ID) and famous investors. */
export function traders({ jdpiDir }) {
  const out = [];
  const c = json(join(jdpiDir, 'traders/data/congress.json'));
  for (const m of c.members) if (m.bioguide && m.trades) out.push({ key: { bioguide: m.bioguide }, label: m.name, module: 'traders', entityKey: `congress:${m.bioguide}`,
    url: `${JDPI}fe/traders.html?tab=congress&member=${m.id}`, context: `${m.trades.toLocaleString('en-GB')} disclosed stock trades (${m.party || 'party unknown'}, ${m.district})`, tags: [['Role', 'Member of Congress'], ['Role', 'Discloses stock trades']] });
  const i = json(join(jdpiDir, 'traders/data/investors.json'));
  for (const v of i.investors) out.push({ key: { title: v.person }, label: v.person, module: 'traders', entityKey: `investor:${v.cik}`,
    url: `${JDPI}fe/traders.html?tab=investors&investor=${v.cik}`, context: `${v.fund}: 13F holdings for the quarter to ${v.period}`, tags: [['Role', 'Investor'], ['Investment style', v.style]] });
  return out;
}

/** Learning: thinkers and schools of thought taught in the Finance, Economics and Politics courses. */
export function learning({ jdpiDir }) {
  const out = [];
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  for (const [course, module, label] of [['economics', 'learning', 'Economics'], ['finance', 'learning', 'Finance'], ['politics', 'learning-politics', 'Politics']]) {
    const text = readFileSync(join(jdpiDir, `fe/learning/${course}.md`), 'utf8').replace(/\r/g, '');
    let unit = '', lesson = null, body = '';
    const flush = () => {
      if (!lesson) return;
      for (const [title, re, tags] of THINKERS) {
        if (!re.test(body) && !re.test(lesson)) continue;
        const spectrum = course === 'politics' ? spectrumTag(unit, tags) : null;
        out.push({ key: { title }, label: title, module, url: `${JDPI}fe/learning.html?course=${course}&lesson=${slug(lesson)}`,
          context: `Taught in ${label}: ${lesson}`, tags: [...tags.map(x => ['School or tag', x]), ...(spectrum ? [['Political spectrum', spectrum]] : [])] });
      }
    };
    for (const line of text.split('\n')) {
      if (line.startsWith('# ')) { flush(); lesson = null; unit = line.slice(2); }
      else if (line.startsWith('## ')) { flush(); lesson = line.slice(3); body = ''; }
      else body += line + '\n';
    }
    flush();
  }
  return out;
}

/** Invention Timeline (Natural Science): breakthroughs by their Wikidata item, the scientists behind them and the
 *  institutions involved, each linked to the breakthrough's place on the timeline. */
export function progress({ jdpiDir }) {
  const d = json(join(jdpiDir, 'science/progress/data/events.json'));
  const disc = Object.fromEntries(d.disciplines.map(x => [x.id, x.name]));
  const when = e => `${e.ca ? 'c. ' : ''}${e.y < 0 ? `${-e.y} BC` : e.y < 1000 ? `AD ${e.y}` : e.y}`;
  const url = e => `${JDPI}science/progress/index.html#y=${e.y}&e=${e.id}`;
  const date = e => (e.y > 0 ? String(e.y).padStart(4, '0') : undefined);
  const out = [];
  for (const e of d.events) {
    const disciplines = e.d.map(x => disc[x] || x), dtags = disciplines.map(n => ['Discipline', n]);
    if (e.q) out.push({ key: { qid: e.q }, label: e.t, module: 'progress', url: url(e), date: date(e),
      context: `${when(e)} · ${disciplines.join(', ')} · ${e.place.n}`, tags: [['Event type', 'Scientific breakthrough'], ...dtags] });
    for (const q of e.people) {
      const p = d.people[q];
      if (!p) continue;
      out.push({ key: { qid: q }, label: p.name, module: 'progress', url: url(e), date: date(e), context: `${e.t} (${when(e)})`,
        tags: [['Role', 'Scientist'], ...dtags, ...(p.inst || []).map(i => ['Institution', d.institutions[i]?.name]).filter(([, n]) => n)] });
    }
    for (const q of e.inst) {
      const i = d.institutions[q];
      if (i) out.push({ key: { qid: q }, label: i.name, module: 'progress', url: url(e), date: date(e), context: `${e.t} (${when(e)})`,
        tags: [['Role', 'Scientific institution'], ...dtags] });
    }
  }
  return out;
}

/** Bibliotheca (Kino): each book's cast, bibliotheca/data/cast/<slug>.json, made by bibliotheca/scripts/cast.mjs: the
 *  people, places, states, battles, wars, organisations and works a book's text names, resolved to Wikidata. Only the
 *  records decided 'auto' are fed in ('review' waits for a human to flip it in the cast file's overrides). One
 *  mention per book and entity, whichever names the book gives it, so an entity the lake has already (by Wikidata ID)
 *  gains the mention and the book's names rather than a second entry; its link opens Neo Classic at the first
 *  paragraph that names it, the term in use; its aliases are the book's own forms of the name, which build.mjs adds to
 *  the entity's so the tagger (bibliotheca/scripts/tag-terms.mjs) finds them in the text. `source` records which
 *  book's cast gave the mention ("bibliotheca:<slug>"); the build reads the module and the url. */
export function bibliotheca({ jdpiDir }) {
  const dir = join(jdpiDir, 'bibliotheca/data/cast');
  if (!existsSync(dir)) return [];
  // A paragraph's place in book order (one counter per chapter runs through c07-p01, c07-n02 …).
  const order = f => f.ch * 1000 + +String(f.p).split('-')[1].slice(1);
  const out = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const cast = json(join(dir, file));
    const byQid = new Map();
    for (const r of cast.records || []) {
      if (r.decision !== 'auto' || !/^Q\d+$/.test(r.qid || '')) continue;
      const g = byQid.get(r.qid) || { label: r.label, names: new Set(), fed: new Set(), mentions: 0, first: r.first };
      // A record's `local` names (given names, alone or after a regnal title: "Julian", "Pope Alexander") stay the
      // book's, since they would tag the man in every book; a shelf decision gives them to him in this one.
      for (const n of [r.name, ...(r.aliases || [])]) { g.names.add(n); if (!(r.local || []).includes(n)) g.fed.add(n); }
      g.mentions += r.mentions;
      if (order(r.first) < order(g.first)) g.first = r.first;
      byQid.set(r.qid, g);
    }
    for (const [qid, g] of byQid) out.push({
      key: { qid }, label: g.label, module: 'bibliotheca', source: `bibliotheca:${cast.slug}`,
      url: `${JDPI}bibliotheca/neo/index.html#book=${cast.slug}&ch=${g.first.ch}&p=${g.first.p}&t=${qid}`, date: String(cast.year),
      context: `Named in ${cast.title} (${cast.author}, ${cast.year < 0 ? `${-cast.year} BC` : cast.year}), ${g.mentions} time${g.mentions === 1 ? '' : 's'}, as ${[...g.names].join(', ')}`,
      aliases: [...g.fed],
    });
  }
  return out;
}

/** Kino: the people, places, wars and events each documentary names by its Wikidata ID (kino/data/<category>/<id>.json,
 *  in the format of kino/README.md): its subjects, and in each scene its Master Index link and its portrait (a
 *  portrait's qid is the item whose image it shows); then the places a scene links to whose own data holds the ID: a
 *  War Focus war (battlefield/focus/data/index.json), a National Analysis or Political Atlas country
 *  (national/data/index.json) and an Invention Timeline breakthrough (science/progress/data/events.json). A link is
 *  read as the player and the validator read it (kino/lib/links.js); one to a submodule whose data has no Wikidata IDs
 *  (Retrospective Battlefield's conflicts, Kardashev's polities, the Retrospective's countries by GW code) names
 *  nothing here. The Wikidata items a script's sources list are where its facts come from, not what it shows, and
 *  they include works whose names are common words ("The Prince", Marx's "Capital"): in the lake those would be terms
 *  wherever a Bibliotheca book says "Prince" or "Capital" (tag-terms.mjs reads every name in it), so they stay out.
 *  One mention per documentary and entity, filed under its category's submodule (kino-<category>, as registry.json
 *  names it) and linked to the film on its category's page (kino/index.html?cat=<category>#doc=<id>): at the first
 *  scene that names the entity (&s=<scene id>), or at the start for a subject, which the whole film is about. The
 *  context is the film's title, the date the year it opens. */
export function kino({ jdpiDir }) {
  const root = join(jdpiDir, 'kino/data');
  if (!existsSync(root)) return [];
  const focus = new Map(json(join(jdpiDir, 'battlefield/focus/data/index.json')).wars.map(w => [w.id, w]));
  const countries = new Map(json(join(jdpiDir, 'national/data/index.json')).countries.map(c => [c.iso3, c]));
  const events = new Map(json(join(jdpiDir, 'science/progress/data/events.json')).events.map(e => [e.id, e]));
  // The entity a scene's link names, as [qid, label], or null.
  const named = link => {
    let at;
    try { at = readAt(link); } catch { return null; }
    switch (link.module) {
      case 'encyclopedia': return [at.qid, String(link.label).replace(/^Master Index · /, '')];
      case 'war-focus': { const w = focus.get(at.war); return w?.qid ? [w.qid, w.name] : null; }
      case 'pestle': case 'atlas': { const c = countries.get(at.country); return c?.qid ? [c.qid, c.name] : null; }
      case 'progress': { const e = events.get(at.e); return e?.q ? [e.q, e.t] : null; }
      default: return null;
    }
  };
  const out = [];
  for (const category of CATEGORY_IDS) {
    const dir = join(root, category);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      const doc = json(join(dir, file)), found = new Map();
      const add = (qid, label, scene) => { if (/^Q\d+$/.test(qid || '') && !found.has(qid)) found.set(qid, { label: label || qid, scene }); };
      for (const s of doc.subjects || []) add(s.qid, s.label, null);
      for (const s of flatScenes(doc)) {
        const l = s.link && named(s.link);
        if (l) add(l[0], l[1], s.id);
        if (s.visual?.kind === 'portrait') add(s.visual.qid, s.visual.heading, s.id);
      }
      for (const [qid, { label, scene }] of found) out.push({
        key: { qid }, label, module: `kino-${category}`, url: `${JDPI}kino/index.html?cat=${category}${kinoHash(doc.id, scene)}`,
        date: Number.isInteger(doc.era?.[0]) ? String(doc.era[0]) : undefined, context: doc.title,
      });
    }
  }
  return out;
}

/** National Analysis (registry id pestle): every country in its data (national/data/index.json, the page's own) with
 *  its Wikidata ID, linked to its profile (q/national.html#country=<ISO3>). The two the World Bank lists under codes
 *  Wikidata does not use (the Channel Islands, Kosovo) have none there, and wait for national/scripts/build.mjs to find
 *  theirs: a World Bank name taken for a Wikipedia title is no key, and in the lake it is a term wherever a Bibliotheca
 *  book has it. */
export function pestle({ jdpiDir }) {
  const d = json(join(jdpiDir, 'national/data/index.json'));
  return d.countries.filter(c => c.qid).map(c => ({ key: { qid: c.qid }, label: c.name, module: 'pestle', url: `${JDPI}q/national.html#country=${c.iso3}`,
    context: `Country profile: ${d.indicators.length} political, economic, social, technological, legal and environmental indicators, ${d.years[0]}–${d.years[1]}` }));
}

/** Geopolitical Volatility: every country the index has scored on at least one of the days it holds
 *  (volatility/data/index.json; a day's row is [day, score, components, events, tone, coverage], the score null when
 *  too few events or sources were seen), with the Wikidata ID National Analysis gives it (national/data/brief.json,
 *  ISO3 → qid), linked to the country on q/volatility.html (#country=<ISO3>, as the page's own rows link to it). The
 *  few National Analysis does not list (Taiwan, Jersey, Vatican City) have no ID here and are left out: keyed by its
 *  name taken for a title, Jersey would be the island wherever the Wealth of Nations says "New Jersey". The context and
 *  date are its latest score. */
export function volatility({ jdpiDir }) {
  const v = json(join(jdpiDir, 'volatility/data/index.json'));
  const qid = new Map(json(join(jdpiDir, 'national/data/brief.json')).countries.filter(c => c.qid).map(c => [c.iso3, c.qid]));
  const out = [];
  for (const [iso3, c] of Object.entries(v.countries)) {
    const scored = c.days.filter(d => d[1] != null), last = scored.at(-1);
    if (!last || !qid.has(iso3)) continue;
    out.push({ key: { qid: qid.get(iso3) }, label: c.name, module: 'volatility', url: `${JDPI}q/volatility.html#country=${iso3}`, date: last[0],
      context: `Volatility index ${last[1].toFixed(1)} of 100 on its latest scored day, from GDELT news events; scored on ${scored.length} of ${c.days.length} days` });
  }
  return out;
}

export const ADAPTERS = { retrospective, calendar, battlefield, kardashev, traders, learning, progress, bibliotheca, kino, pestle, volatility };

// The submodules (registry.json ids) each adapter files its mentions under: the modules `--only <adapter>` speaks for
// in build.mjs (it makes their entities again, and drops what they no longer mention), and what
// tests/master-index.test.mjs holds to the registry, to MODULE_NAMES and MODULE_ORDER (build.mjs) and to MODULE_SUITE
// (encyclopedia/index.html). An adapter reports under no other module.
export const ADAPTER_MODULES = {
  retrospective: ['retrospective'], calendar: ['historical-calendar', 'calendar'], battlefield: ['battlefield-history', 'war-focus', 'battlefield'],
  kardashev: ['kardashev'], traders: ['traders'], learning: ['learning', 'learning-politics'], progress: ['progress'], bibliotheca: ['bibliotheca'],
  kino: CATEGORY_IDS.map(c => `kino-${c}`), pestle: ['pestle'], volatility: ['volatility'],
};
// The tag groups only one adapter gives. A --only run of that adapter makes these groups again on every entity it
// mentions, so a curated tag it no longer gives (a thinker's school, a spectrum position) goes at once, not at the
// next full build, also on an entity other modules mention too.
export const ADAPTER_TAG_GROUPS = { learning: ['School or tag', 'Political spectrum'] };

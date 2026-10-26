// Mention adapters: each JDP-I module reports the entities it mentions and where.
// A mention is { key, label, module, url, date?, context, tags? }, where key identifies the entity:
//   { title }    an English Wikipedia article title (most modules link to Wikipedia already)
//   { qid }      a Wikidata ID
//   { bioguide } a US Congress Bioguide ID (resolved through Wikidata property P1157)
// `url` is the exact place in JDP-I (absolute), and `module` the registry module id.
// To bring a new module into the Encyclopaedia, add an adapter here and to ADAPTERS.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THINKERS, SPECTRUM } from './thinkers.mjs';

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

const EVENT_TYPE = { election: 'Election', leader: 'New leader', coup: 'Coup', conflict: 'War or battle', assassination: 'Assassination', crisis: 'Crisis', treaty: 'Treaty' };

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
      const spectrum = course === 'politics' ? SPECTRUM[unit.split(' · ')[0]] : null;
      for (const [title, re, tags] of THINKERS) {
        if (!re.test(body) && !re.test(lesson)) continue;
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

export const ADAPTERS = { retrospective, calendar, battlefield, kardashev, traders, learning };

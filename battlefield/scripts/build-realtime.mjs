// Builds battlefield/data/realtime.json from a UCDP Candidate Events CSV (year to date).
//   node battlefield/scripts/build-realtime.mjs path/to/GEDEvent_v26_01_26_09.csv
// Source: UCDP Candidate Events Dataset (Hegre et al. 2020), CC BY 4.0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv } from './csv.mjs';
import { WARS, cleanName } from './wars.mjs';

const [csvPath, version = ''] = process.argv.slice(2);
const events = parseCsv(readFileSync(csvPath, 'utf8')).filter(e => e.date_start);
const TYPES = { 1: 'state-based', 2: 'non-state', 3: 'one-sided violence against civilians' };
const MONTH = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
const fmt = n => n.toLocaleString('en-GB');
const country = s => s.replace(/ \(.*\)$/, '').replace('DR Congo', 'DR Congo');

const warOf = new Map(WARS.flatMap(w => w.ids.map(id => [String(id), w.id])));
const wars = new Map(WARS.map(w => [w.id, { ...w, conflicts: new Map() }]));

for (const e of events) {
  let wid = warOf.get(e.conflict_new_id);
  if (!wid) {
    const c = country(e.country);
    wid = 'other-' + c.toLowerCase().replace(/[^a-z]+/g, '-');
    if (!wars.has(wid)) wars.set(wid, { id: wid, name: `Other armed violence in ${c}`, zone: e.region, ids: [], wiki: null, background: null, conflicts: new Map() });
  }
  e.war = wid;
  const w = wars.get(wid);
  const k = e.conflict_new_id;
  if (!w.conflicts.has(k)) w.conflicts.set(k, { id: +k, name: cleanName(e.conflict_name, country(e.country)), type: TYPES[e.type_of_violence], deaths: 0, events: 0 });
  const c = w.conflicts.get(k); c.deaths += +e.best || 0; c.events++;
}

const months = [...new Set(events.map(e => e.date_start.slice(0, 7)))].sort();
const latest = months.at(-1);

function monthInsight(w, list, m, prev) {
  const deaths = list.reduce((s, e) => s + (+e.best || 0), 0);
  if (!list.length) return { month: m, deaths: 0, events: 0, civilians: 0, text: `No events recorded in ${MONTH(m)}.`, places: [], sources: [] };
  const civilians = list.reduce((s, e) => s + (+e.deaths_civilians || 0), 0);
  const tally = key => { const t = new Map(); for (const e of list) { const k = key(e); if (k) t.set(k, (t.get(k) || 0) + (+e.best || 0)); } return [...t].sort((a, b) => b[1] - a[1]); };
  const places = tally(e => [e.adm_1.replace(/ (province|state|region|governorate|oblast|district)$/i, ''), country(e.country)].filter(Boolean).join(', ')).slice(0, 3);
  const dyads = tally(e => cleanName(e.dyad_name, country(e.country))).slice(0, 2);
  const countries = tally(e => country(e.country));
  let text = `${MONTH(m)}: ${fmt(list.length)} events, about ${fmt(deaths)} deaths`;
  if (civilians) text += ` (${fmt(civilians)} civilians)`;
  text += '.';
  if (prev && prev.deaths) {
    const ch = Math.round((deaths - prev.deaths) / prev.deaths * 100);
    text += Math.abs(ch) < 10 ? ' Roughly level with the month before.' : ` ${ch > 0 ? 'Up' : 'Down'} ${Math.abs(ch)}% on ${MONTH(prev.month)}.`;
  }
  if (places.length) text += ` Deadliest areas: ${places.map(([p, d]) => `${p} (${fmt(d)})`).join('; ')}.`;
  if (countries.length > 1) text += ` Fighting recorded in ${countries.length} countries.`;
  if (dyads.length && w.conflicts.size > 1) text += ` Main fighting: ${dyads.map(([d]) => d).join('; ')}.`;
  const top = [...list].sort((a, b) => (+b.best || 0) - (+a.best || 0)).slice(0, 3);
  const sources = top.map(e => ({
    date: e.date_start.slice(0, 10), deaths: +e.best || 0, place: e.where_description || e.adm_1,
    headline: (e.source_headline || '').split(';')[0].replace(/^"|"$/g, '').slice(0, 160),
    office: (e.source_office || '').split(';')[0],
  }));
  return { month: m, deaths, events: list.length, civilians, text, places: places.map(([p, d]) => ({ place: p, deaths: d })), sources };
}

const out = [];
for (const w of wars.values()) {
  const evs = events.filter(e => e.war === w.id);
  const deaths = evs.reduce((s, e) => s + (+e.best || 0), 0);
  if (!evs.length || (w.id.startsWith('other-') && deaths < 25)) continue;
  const monthly = [];
  for (const m of months) monthly.push(monthInsight(w, evs.filter(e => e.date_start.startsWith(m)), m, monthly.at(-1)));
  const lastActive = evs.reduce((a, e) => (e.date_start > a ? e.date_start : a), '').slice(0, 10);
  const countries = [...new Set(evs.map(e => country(e.country)))];
  const cells = new Map();
  for (const e of evs) {
    const k = `${(+e.latitude).toFixed(1)},${(+e.longitude).toFixed(1)},${e.date_start.slice(0, 7)}`;
    const c = cells.get(k) || cells.set(k, [+(+e.latitude).toFixed(1), +(+e.longitude).toFixed(1), months.indexOf(e.date_start.slice(0, 7)), 0, 0]).get(k);
    c[3] += +e.best || 0; c[4]++;
  }
  const recent = monthly.slice(-3).reduce((s, x) => s + x.deaths, 0);
  out.push({
    id: w.id, name: w.name, zone: w.zone, wiki: w.wiki, background: w.background, keywords: w.keywords || [], countries, deaths, events: evs.length, lastActive,
    status: lastActive >= `${months.at(-2) || latest}-01` ? 'active' : 'quiet',
    summary: `${fmt(deaths)} deaths in ${fmt(evs.length)} recorded events so far this year; ${fmt(recent)} in the last three months. Last recorded event ${lastActive}.`,
    conflicts: [...w.conflicts.values()].sort((a, b) => b.deaths - a.deaths),
    monthly, points: [...cells.values()],
  });
}
out.sort((a, b) => b.deaths - a.deaths);

const data = {
  generated: new Date().toISOString(), source: 'UCDP Candidate Events Dataset', version, licence: 'CC BY 4.0',
  citation: 'Hegre, H. et al. (2020). Introducing the UCDP Candidate Events Dataset. Research & Politics 7(3). Data: Uppsala Conflict Data Program, ucdp.uu.se.',
  year: +latest.slice(0, 4), months, latest, totals: { deaths: events.reduce((s, e) => s + (+e.best || 0), 0), events: events.length },
  wars: out,
};
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/realtime.json', import.meta.url), JSON.stringify(data));
console.log(`${out.length} wars/warzones, ${events.length} events, months ${months[0]}..${latest}`);

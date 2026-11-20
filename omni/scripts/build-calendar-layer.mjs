// Builds the Omni-Map's layer 7 (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5c): the dated events of VM's Realtime and
// Historical Calendars, each at its country, one file a decade, past events solid and those still expected hollow.
//   node omni/scripts/build-calendar-layer.mjs
// The order of steps:
// 1. Reads calendar/data/<decade>.json (calendar/scripts/build-events.mjs, refreshed each morning by
//    .github/workflows/calendar-refresh.yml), every decade there is.
// 2. Gives each event its source's class: its own `class`, written by build-events.mjs since stage S5c; for an event
//    built before that, the class its source address shows (ucdp.uu.se is UCDP's, political-atlas.pages.dev the
//    Political Atlas's, consilium.europa.eu a Wikipedia list's), and "unread" otherwise.
// 3. Leaves out what VM may not show here: an Archigos event (a new leader or a seizure of power from the Retrospective,
//    or, for an event of unread class, any new leader or coup, which may be Archigos's) and an event only in the
//    Political Atlas. Both are counted in the layer's entry.
// 4. Keeps each event's date at its precision (to the day, or to the month for "date to be confirmed"), its country's
//    ISO3 (its own `iso3`, else VM's crosswalk, omni/scripts/country-names.mjs; an event of the European Union, of
//    several countries or of a state that is not one of today's has none and is listed, not drawn), and whether it is
//    still expected (its day after the day the calendars were built, or its date not yet confirmed): drawn hollow.
// 5. Writes omni/data/layers/calendar/<decade>.json (vm-layer/1 rows) and index.json (each file with its years, bytes,
//    gzipped bytes and sha256), then the layer's entry in omni/data/layers.json. A file keeps its `built` when nothing in
//    it changes. The page loads only the file holding the frame's year.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoResolver, neCountries } from './country-names.mjs';
import { eventKey } from '../../integration/scripts/heads.mjs';
import { putLayer, keepBuilt, measure, readJson, stamp, LIMIT_GZ } from './layer-catalogue.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const IN = join(ROOT, 'calendar/data');
const OUT = join(ROOT, 'omni/data/layers/calendar');
const LAYERS = join(ROOT, 'omni/data/layers.json');
// The class of each source, and the source in integration/sources.json its facts are cited to.
export const CLASSES = {
  ucdp: { name: 'UCDP/PRIO Armed Conflict Dataset', source: 'ucdp-acd' },
  wikidata: { name: 'Wikidata', source: 'wikidata' },
  retrospective: { name: 'Wikidata, through the Political Retrospective', source: 'wikidata' },
  'wikipedia-list': { name: 'Wikipedia’s lists and electoral calendars', source: 'vm-calendar' },
  'wikipedia-news': { name: 'Wikipedia’s Current events portal', source: 'vm-calendar' },
  vm: { name: 'VM’s own list of landmarks', source: 'vm-calendar' },
  unread: { name: 'Its source', source: 'vm-calendar' },
};
export const LEFT_OUT = { archigos: 'Archigos (through the Political Retrospective): its terms do not plainly allow commercial use', atlas: 'only in the Political Atlas' };

/** Step 2: an event's class. */
export function classOf(e) {
  if (e.class) return e.class;
  const s = String(e.source || '');
  if (/^https:\/\/ucdp\.uu\.se\//.test(s)) return 'ucdp';
  if (/^https:\/\/political-atlas\.pages\.dev\//.test(s)) return 'atlas';
  if (/^https?:\/\/(www\.)?consilium\.europa\.eu\//.test(s)) return 'wikipedia-list';
  return 'unread';
}
/** Step 3: why an event is left out, or null. */
export function leftOut(e, cls = classOf(e)) {
  if (cls === 'archigos') return 'archigos';
  if (cls === 'unread' && (e.type === 'leader' || e.type === 'coup')) return 'archigos';
  if (cls === 'atlas') return 'atlas';
  return null;
}
/** Step 4: an event as a row of the layer. today: the day the calendars were built. */
export function rowOf(e, { isoOf, today }) {
  const cls = classOf(e), month = e.precision === 'month' || /\(date to be confirmed\)/.test(e.title || '');
  const iso3 = e.iso3 || isoOf(e.country);
  const expected = e.date > today || e.status === 'tentative';
  const c = CLASSES[cls] || CLASSES.unread;
  return {
    id: eventKey(e), label: e.title, type: e.type, country: e.country, place: iso3 ? { iso3 } : null,
    date: { from: month ? e.date.slice(0, 7) : e.date, p: month ? 10 : 11 }, sortYear: +e.date.slice(0, 4),
    status: e.status, expected, class: cls,
    // V9/D3 (S5b/S5c review): an event of unread class names its own source address; what kind of source it is (and so
    // whether its date may be known only to the month) the calendars record at their next refresh, and its line says so.
    src: { date: { id: c.source, loc: e.source || '', line: cls === 'unread'
      ? `${e.source ? `Its source: ${e.source}` : 'Its source is not named'}; what kind of source it is, and whether it gives the day${!month && /-01$/.test(e.date) ? ' (this one is dated the 1st, which may stand for the month)' : ''}, is recorded at the calendars’ next refresh`
      : `${c.name}${e.source ? `: ${e.source}` : ''}` } },
  };
}

function main() {
  const files = readdirSync(IN).filter(f => /^\d{4}s\.json$/.test(f)).sort();
  const isoOf = isoResolver(neCountries(ROOT));
  const now = stamp(), outs = [], out = { archigos: 0, atlas: 0 }, classes = {};
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(IN, f), 'utf8')), today = String(doc.generated || now).slice(0, 10);
    const rows = [];
    for (const e of doc.events) {
      const why = leftOut(e);
      if (why) { out[why]++; continue; }
      const r = rowOf(e, { isoOf, today });
      classes[r.class] = (classes[r.class] || 0) + 1;
      rows.push(r);
    }
    const from = +f.slice(0, 4), to = from + 9;
    const body = { format: 'vm-layer/1', layer: 'calendar-events', source: 'vm-calendar', built: null, from, to, read: `calendar/data/${f}`, calendarsBuilt: doc.generated || null, rows };
    const file = join(OUT, f);
    body.built = keepBuilt(readJson(file), body, now);
    const text = JSON.stringify(body) + '\n', m = measure(text);
    if (m.gzip > LIMIT_GZ) throw new Error(`calendar/${f} is over the limit`);
    outs.push({ f, from, to, text, m, body, file });
  }
  const years = outs.flatMap(o => o.body.rows.map(r => r.sortYear));
  const first = Math.min(...years), last = Math.max(...years);
  const index = { format: 'vm-calendar-index/1', layer: 'calendar-events', built: null, files: outs.map(o => ({ from: o.from, to: o.to, file: o.f, rows: o.body.rows.length, ...o.m })) };
  const ixFile = join(OUT, 'index.json');
  index.built = keepBuilt(readJson(ixFile), index, now);
  const ixText = JSON.stringify(index, null, 1) + '\n';
  mkdirSync(OUT, { recursive: true });
  for (const o of outs) writeFileSync(o.file, o.text);
  writeFileSync(ixFile, ixText);
  for (const o of outs) console.log(`calendar/${o.f}: ${o.body.rows.length} events (${o.body.rows.filter(r => !r.place).length} with no country of today); ${o.m.bytes} bytes, ${o.m.gzip} gzipped`);
  console.log(`left out: ${out.archigos} Archigos (or may be), ${out.atlas} only in the Political Atlas; classes ${JSON.stringify(classes)}`);
  const types = [...new Set(outs.flatMap(o => o.body.rows.map(r => r.type)))].sort();
  putLayer(LAYERS, {
    id: 'calendar-events', module: 'calendar', title: 'Political events (VM’s Calendars)', role: 'point', geometry: 'point',
    time: { field: 'date', from: first, to: last, step: 'd', precision: 'day', shows: 'the frame’s year' },
    data: 'omni/data/layers/calendar/index.json', split: 'year', at: 'country', space: 'at its country’s point, by ISO3 (Natural Earth’s countries of today)',
    measure: null, status: 'recorded', statusBy: [], style: { kind: 'events', token: '--prp-ds', hollow: 'expected: its day not yet come, or its date not yet confirmed' },
    filter: { field: 'type', label: 'Kind of event', values: types.map(t => ({ id: t, name: t })) },
    legend: 'Political events: VM’s Realtime and Historical Calendars (facts: Wikidata, Wikipedia, UCDP/PRIO ACD), each at its country',
    source: 'vm-calendar', leftOut: out,
    method: `VM’s own text. The dated events of VM’s Realtime and Historical Calendars (q/calendar.html), ${first} to ${last}: elections, referendums, summits, treaties, outbreaks of armed conflict, ceasefires, court rulings, protests and the like, each from its own source (Wikidata, Wikipedia’s lists and its Current events portal, the UCDP/PRIO Armed Conflict Dataset), each with its source’s class. VM leaves out the ${out.archigos} events that are, or may be, Archigos’s (a new leader or a seizure of power from the Political Retrospective: Archigos’s terms do not plainly allow commercial use), and the ${out.atlas} only in the Political Atlas. Each event is drawn at its country’s point, by its ISO3 (VM’s crosswalk of the calendars’ names to Natural Earth’s countries of today); an event of the European Union, of several countries, or of a state that is not one of today’s is listed, not drawn. A date known only to its month is kept to the month. ${classes.unread ? `For ${classes.unread} events the calendars have not yet recorded what kind of source each comes from (their next refresh does, with its date’s precision): each names its own source’s address, and its date is shown to the day as the calendars hold it, though a date on the 1st of a month may stand for the month alone. ` : ''}An event still to come, or whose date is not yet confirmed, is drawn hollow. The map shows the frame’s year, one decade’s file loaded at a time (omni/scripts/build-calendar-layer.mjs).`,
    open: true, pinnable: true, built: index.built,
    files: [{ file: 'omni/data/layers/calendar/index.json', ...measure(ixText) }, ...outs.map(o => ({ file: `omni/data/layers/calendar/${o.f}`, ...o.m }))],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

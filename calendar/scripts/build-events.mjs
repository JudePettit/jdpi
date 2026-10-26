// Builds calendar/data/<decade>.json: dated political and geopolitical events, 1980 onwards.
//   node calendar/scripts/build-events.mjs <hp-retrospective/data/countries.json> <UcdpPrioConflict_v26_1.csv>
// Sources:
//   - H&P Retrospective (Archigos + Wikidata): new leaders, irregular seizures of power, elections, referendums
//   - UCDP/PRIO Armed Conflict Dataset: outbreaks of armed conflict (episode starts) and escalations to war
//   - Wikidata: assassinations, battles, terrorist attacks, epidemics, disasters and treaties. Only items with
//     articles in many Wikipedia languages are kept, as a proxy for "sizable" events.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';

const [countriesPath, acdPath] = process.argv.slice(2);
const FROM = '1980-01-01';
const events = [];
const add = e => { if (e.date >= FROM && e.date < '2030' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) events.push(e); };
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

// ---- H&P Retrospective events
const retro = JSON.parse(readFileSync(countriesPath, 'utf8'));
const RETRO_TYPE = { leader: 'leader', coup: 'coup', election: 'election', referendum: 'election' };
for (const c of Object.values(retro.countries)) {
  for (const e of c.events) {
    const type = RETRO_TYPE[e.type];
    if (!type) continue;
    // Wikidata often records only an election's year (YYYY-01-01); those can't sit on a calendar day.
    if (type === 'election' && e.date.endsWith('-01-01')) continue;
    // A new leader links to their own article and is named in full, not "Koller takes power".
    const leader = type === 'leader' || type === 'coup' ? c.leaders.find(l => l.start === e.date && l.url) : null;
    const title = leader?.name && leader.full && e.text.startsWith(leader.name + ' ') ? leader.full + e.text.slice(leader.name.length) : e.text;
    add({ date: e.date, country: c.name, title, type, status: 'declared', source: leader?.url || e.url || (c.yearPage ? wiki(`${e.date.slice(0, 4)} in ${c.yearPage}`) : null) });
  }
}

// ---- UCDP/PRIO conflict episodes
const seen = new Set();
const rows = parseCsv(readFileSync(acdPath, 'utf8')).sort((a, b) => a.year - b.year);
for (const r of rows) {
  const key = `${r.conflict_id}|${r.start_date2}`;
  if (!seen.has(key)) {
    seen.add(key);
    const name = r.type_of_conflict === '2' ? `${r.side_a.replace(/^Government of /, '')} – ${r.side_b.replace(/^Government of /, '')}` : `${r.side_a.replace(/^Government of /, '')} vs ${r.side_b}`;
    // Plain-text account from the UCDP record, since these events have no Wikipedia article of their own.
    const episode = rows.filter(x => x.conflict_id === r.conflict_id && x.start_date2 === r.start_date2);
    const last = episode.at(-1), warYears = episode.filter(x => x.intensity_level === '2').length;
    const KIND = { 1: 'a colonial conflict', 2: 'an interstate conflict', 3: 'a civil conflict', 4: 'an internationalised civil conflict' };
    const over = r.incompatibility === '1' ? `control of ${r.territory_name || 'territory'}` : r.incompatibility === '2' ? 'control of the government' : 'territory and government';
    const summary = `UCDP records ${KIND[r.type_of_conflict]} between ${r.side_a}${r.side_a_2nd ? ` (backed by ${r.side_a_2nd})` : ''} and ${r.side_b}${r.side_b_2nd ? ` (backed by ${r.side_b_2nd})` : ''} over ${over}, starting ${r.start_date2}. `
      + `This episode was active in ${episode.length} year${episode.length > 1 ? 's' : ''} (${episode[0].year}–${last.year})${warYears ? `, ${warYears} of them at war level (1,000+ battle deaths a year)` : ', below war level (25–999 battle deaths a year)'}`
      + `${last.ep_end === '1' ? `, and ended ${last.ep_end_date || last.year}.` : ' and was still active in the latest data.'}`;
    add({ date: r.start_date2, country: r.location.split(',')[0].replace(/ \(.*\)$/, ''), title: `Armed conflict breaks out: ${name}${r.territory_name ? ` (${r.territory_name})` : ''}`, type: 'conflict', status: 'declared', source: `https://ucdp.uu.se/conflict/${r.conflict_id}`, summary });
  }
}

// ---- Wikidata
const SPARQL = 'https://query.wikidata.org/sparql';
async function sparql(q) {
  for (let i = 0; ; i++) {
    const res = await fetch(SPARQL + '?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': 'JDP-I Political Calendar (https://jdpi.pages.dev)', Accept: 'application/sparql-results+json' } });
    if (res.ok) return (await res.json()).results.bindings;
    if (i > 3) throw new Error(`SPARQL HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
}
const KINDS = [
  { type: 'assassination', cls: 'wd:Q3882219', minLinks: 3, prefix: 'Assassination: ' },
  { type: 'coup', cls: 'wd:Q45382', minLinks: 6, prefix: 'Coup: ' },
  { type: 'conflict', cls: 'wd:Q178561', minLinks: 12, prefix: 'Battle: ' },
  { type: 'crisis', cls: 'wd:Q2223653', minLinks: 12, prefix: 'Terrorist attack: ' },
  { type: 'crisis', cls: 'wd:Q12184', minLinks: 10, prefix: 'Pandemic: ' },
  { type: 'crisis', cls: 'wd:Q44512', minLinks: 15, prefix: 'Epidemic: ' },
  { type: 'crisis', cls: 'wd:Q7944', minLinks: 20, prefix: 'Earthquake: ' },
  { type: 'crisis', cls: 'wd:Q8065', minLinks: 25, prefix: 'Natural disaster: ' },
  { type: 'treaty', cls: 'wd:Q131569', minLinks: 15, prefix: 'Treaty signed: ' },
];
const wikidataSeen = new Set(); // an item can match several classes (e.g. pandemic and epidemic)
for (const k of KINDS) {
  const q = `SELECT ?e ?eLabel ?date ?countryLabel ?article WHERE {
    ?e wdt:P31/wdt:P279* ${k.cls}; wikibase:sitelinks ?links.
    FILTER(?links >= ${k.minLinks})
    VALUES ?prop { p:P585 p:P580 p:P571 } ?e ?prop [ ?psv [ wikibase:timeValue ?date; wikibase:timePrecision ?prec ] ]. FILTER(?prec >= 11)
    FILTER(?date >= "${FROM}T00:00:00Z"^^xsd:dateTime)
    OPTIONAL { ?e wdt:P17 ?country }
    ?article schema:about ?e; schema:isPartOf <https://en.wikipedia.org/>.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  try {
    const rows = await sparql(q);
    const byItem = new Map();
    for (const r of rows) {
      const id = r.e.value;
      const date = r.date.value.slice(0, 10);
      const x = byItem.get(id);
      if (!x || date < x.date) byItem.set(id, { date, title: r.eLabel.value, country: r.countryLabel?.value || x?.country || 'International', source: r.article.value });
    }
    for (const [id, x] of byItem) if (!wikidataSeen.has(id) && wikidataSeen.add(id)) add({ date: x.date, country: x.country, title: k.prefix + x.title, type: k.type, status: 'declared', source: x.source });
    console.log(k.prefix, byItem.size);
  } catch (err) { console.warn(k.prefix, 'skipped:', err.message); }
}

// ---- Landmark events that the Wikidata classes above don't capture
const LANDMARKS = [
  ['1980-09-22', 'Iran', 'Iraq invades Iran, starting the Iran–Iraq War', 'conflict', 'Iran–Iraq War'],
  ['1982-04-02', 'Argentina', 'Argentina invades the Falkland Islands', 'conflict', 'Falklands War'],
  ['1986-04-26', 'Soviet Union', 'Chernobyl nuclear disaster', 'crisis', 'Chernobyl disaster'],
  ['1989-06-04', 'China', 'Tiananmen Square crackdown in Beijing', 'crisis', '1989 Tiananmen Square protests and massacre'],
  ['1989-11-09', 'Germany', 'Fall of the Berlin Wall', 'crisis', 'Fall of the Berlin Wall'],
  ['1990-08-02', 'Kuwait', 'Iraq invades Kuwait', 'conflict', 'Iraqi invasion of Kuwait'],
  ['1990-10-03', 'Germany', 'German reunification', 'treaty', 'German reunification'],
  ['1991-01-17', 'Iraq', 'Gulf War: coalition air campaign begins', 'conflict', 'Gulf War'],
  ['1991-12-26', 'Soviet Union', 'Dissolution of the Soviet Union', 'crisis', 'Dissolution of the Soviet Union'],
  ['1994-04-07', 'Rwanda', 'Rwandan genocide begins', 'crisis', 'Rwandan genocide'],
  ['1995-07-11', 'Bosnia and Herzegovina', 'Srebrenica massacre begins', 'crisis', 'Srebrenica massacre'],
  ['1997-07-01', 'China', 'Hong Kong handed over to China', 'treaty', 'Handover of Hong Kong'],
  ['1999-01-01', 'International', 'Euro introduced in eleven EU countries', 'treaty', 'Euro'],
  ['2003-03-20', 'Iraq', 'US-led invasion of Iraq begins', 'conflict', '2003 invasion of Iraq'],
  ['2008-09-15', 'United States', 'Lehman Brothers collapses; global financial crisis deepens', 'crisis', 'Bankruptcy of Lehman Brothers'],
  ['2010-12-17', 'Tunisia', 'Arab Spring begins in Tunisia', 'crisis', 'Arab Spring'],
  ['2014-03-18', 'Ukraine', 'Russia annexes Crimea', 'conflict', 'Annexation of Crimea by the Russian Federation'],
  ['2016-06-23', 'United Kingdom', 'UK votes to leave the European Union', 'election', '2016 United Kingdom European Union membership referendum'],
  ['2020-01-31', 'United Kingdom', 'United Kingdom leaves the European Union', 'treaty', 'Brexit'],
  ['2020-03-11', 'International', 'WHO declares COVID-19 a pandemic', 'crisis', 'COVID-19 pandemic'],
  ['2021-01-06', 'United States', 'Attack on the US Capitol', 'crisis', 'January 6 United States Capitol attack'],
  ['2021-08-15', 'Afghanistan', 'Taliban take Kabul', 'conflict', 'Fall of Kabul (2021)'],
  ['2022-02-24', 'Ukraine', 'Russia launches full-scale invasion of Ukraine', 'conflict', 'Russian invasion of Ukraine'],
  ['2023-10-07', 'Israel', 'Hamas-led attack on Israel; Gaza war begins', 'conflict', 'October 7 attacks'],
  ['2024-12-08', 'Syria', 'Assad government falls in Syria', 'coup', 'Fall of the Assad regime'],
  ['2025-06-13', 'Iran', 'Israel strikes Iran, starting the twelve-day war', 'conflict', 'Iran–Israel war'],
];
for (const [date, country, title, type, article] of LANDMARKS) add({ date, country, title, type, status: 'declared', source: wiki(article) });

// ---- de-duplicate and write one file per decade
const unique = new Map();
for (const e of events) unique.set(`${e.date}|${e.title}`, e);
const all = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const decades = new Map();
for (const e of all) { const d = e.date.slice(0, 3) + '0s'; (decades.get(d) || decades.set(d, []).get(d)).push(e); }
for (const [d, list] of decades) writeFileSync(new URL(`../data/${d}.json`, import.meta.url), JSON.stringify({ generated: new Date().toISOString(), decade: d, events: list }));
const count = t => all.filter(e => e.type === t).length;
console.log(`${all.length} events:`, ['election', 'leader', 'coup', 'conflict', 'assassination', 'crisis', 'treaty'].map(t => `${t} ${count(t)}`).join(', '));
console.log([...decades].map(([d, l]) => `${d}: ${l.length}`).join(' · '));

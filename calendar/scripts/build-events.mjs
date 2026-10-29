// Builds calendar/data/<decade>.json: dated political and geopolitical events, 1980 onwards, and what is scheduled.
//   node calendar/scripts/build-events.mjs <hp-retrospective/data/countries.json> [<UcdpPrioConflict_v26_1.csv>]
//        [--atlas=<political-atlas folder>] [--news-from=YYYY-MM-DD] [--allow-drop]
//   node calendar/scripts/enrich-summaries.mjs        (then: a plain-text summary for every event with an article)
// The build stops without writing if a type of event with more than 20 records would lose more than half of them
// (a failed source), or one with more than 10 since the news start or in the 18-month outlook, or half the news items
// (guard.mjs); --allow-drop writes anyway, for a deliberate change.
// Sources:
//   - H&P Retrospective (Archigos + Wikidata): new leaders, irregular seizures of power, elections, referendums
//   - Political Atlas (political-atlas/data/countries/*.json, with --atlas): each country's national elections, held
//     and upcoming, as the Atlas keeps them (Europe, North America and the major powers; refreshed monthly)
//   - UCDP/PRIO Armed Conflict Dataset: outbreaks of armed conflict (episode starts). Without the CSV, the conflict
//     events of the last build are kept as they are.
//   - Wikidata, by class and date. Only items with articles in several Wikipedia languages are kept, as a proxy for
//     "sizable" events (a lower bar for the last two years and for upcoming items, which have had less time):
//     assassinations, coups, battles, attacks, epidemics, disasters, treaties; referendums; summits and state visits;
//     impeachments, confidence votes and budgets; supreme- and constitutional-court, ICJ and ICC rulings; protests,
//     strikes and riots; ceasefires, armistices and peace talks; sanctions; party leadership contests and congresses;
//     inaugurations; and resignations of office-holders (a position held with end cause "resignation").
//   - Wikipedia's lists and infoboxes (wiki-lists.mjs): European Council meetings; G7, G20, NATO, BRICS, SCO, APEC,
//     ASEAN, Commonwealth and European Political Community summits; COP climate conferences; UN General Assembly
//     general debates; and every country's elections and referendums from the national electoral calendars, from
//     2026 on. Past and scheduled.
//   - Wikipedia's "Portal:Current events" (current-events.mjs), from --news-from (default: six months ago or the start
//     of 2026, whichever is earlier) to today: resignations, parliamentary votes, court rulings, protests and strikes,
//     ceasefires and peace talks, sanctions, party contests, inaugurations, summits and visits, referendums.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { parseCsv } from '../../battlefield/scripts/csv.mjs';
import { FOUGHT_IN } from '../../battlefield/scripts/history-fought.mjs';
import { interstateName, parties, stateName } from '../../battlefield/scripts/ucdp.mjs';
import { countryInText, countryOfLink, isKnownCountry, normaliseCountry } from './countries.mjs';
import { currentEvents } from './current-events.mjs';
import { listEvents } from './wiki-lists.mjs';
import { atlasElections, mergeBallots, resolveExpected } from './outlook.mjs';
import { lostEvents, refuseIfLost } from './guard.mjs';

const args = process.argv.slice(2);
const option = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const [countriesPath, acdPath] = args.filter(a => !a.startsWith('--'));
const atlasDir = option('atlas');
const FROM = '1980-01-01';
const TODAY = new Date().toISOString().slice(0, 10);
const shiftMonths = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const NEWS_FROM = option('news-from') || [shiftMonths(TODAY, -6), '2026-01-01'].sort()[0];
const RECENT = shiftMonths(TODAY, -24);
const DATA = new URL('../data/', import.meta.url);
// The last build, for the UCDP events when no CSV is given and for the guard before writing.
const previous = (existsSync(DATA) ? readdirSync(DATA).filter(f => /^\d{4}s\.json$/.test(f)) : []).flatMap(f => JSON.parse(readFileSync(new URL(f, DATA), 'utf8')).events);
const events = [];
// `via` (dropped on write) says where an event came from, so that duplicates keep the structured record; so does
// `precision` ("month" for a date known only to the month, on the 1st).
const add = (e, via) => { if (e.date >= FROM && e.date < '2030' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) events.push({ ...e, country: normaliseCountry(e.country), via }); };
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
const articleTitle = url => decodeURIComponent(String(url).split('/wiki/')[1] || '').replace(/_/g, ' ');
const longDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---- H&P Retrospective events
const retro = JSON.parse(readFileSync(countriesPath, 'utf8'));
// A few Archigos names reach the Retrospective with a broken letter (U+FFFD); these are the ones in the calendar.
const BAD = '\u{FFFD}';
const REPAIR = { [`Saca Gonz${BAD}lez`]: 'Antonio Saca', [`Lars L${BAD}kke Rasmussen`]: 'Lars Løkke Rasmussen', [`Sauli Niinist${BAD}`]: 'Sauli Niinistö', [`Hern${BAD}ndez`]: 'Juan Orlando Hernández', [`Stefan L${BAD}fven`]: 'Stefan Löfven' };
const repair = s => Object.entries(REPAIR).reduce((t, [bad, good]) => t.replace(bad, good), s);
const RETRO_TYPE = { leader: 'leader', coup: 'coup', election: 'election', referendum: 'referendum' };
for (const c of Object.values(retro.countries)) {
  for (const e of c.events) {
    const type = RETRO_TYPE[e.type];
    if (!type) continue;
    // Wikidata often records only a vote's year (YYYY-01-01); those can't sit on a calendar day.
    if ((type === 'election' || type === 'referendum') && e.date.endsWith('-01-01')) continue;
    // A new leader links to their own article and is named in full, not "Koller takes power".
    const leader = type === 'leader' || type === 'coup' ? (c.leaders.find(l => l.start === e.date && l.url && e.text.startsWith(l.name + ' ')) || c.leaders.find(l => l.start === e.date && l.url)) : null;
    const title = repair(leader?.name && leader.full && e.text.startsWith(leader.name + ' ') ? leader.full + e.text.slice(leader.name.length) : e.text);
    add({ date: e.date, country: c.name, title, type, status: 'declared', source: leader?.url || e.url || (c.yearPage ? wiki(`${e.date.slice(0, 4)} in ${c.yearPage}`) : null) }, 'retro');
  }
}

// ---- UCDP/PRIO conflict episodes
if (acdPath) {
  const seen = new Set();
  const rows = parseCsv(readFileSync(acdPath, 'utf8')).sort((a, b) => a.year - b.year);
  for (const r of rows) {
    const key = `${r.conflict_id}|${r.start_date2}`;
    if (!seen.has(key)) {
      seen.add(key);
      const episode = rows.filter(x => x.conflict_id === r.conflict_id && x.start_date2 === r.start_date2);
      const name = r.type_of_conflict === '2' ? interstateName(episode) : `${stateName(r.side_a, r.start_date2)} vs ${r.side_b}`;
      // Where: UCDP's location, except that an interstate conflict's lists every party's government ("Australia,
      // Iraq, United Kingdom, …"), so the first state it was fought in comes first (history-fought.mjs).
      const fought = FOUGHT_IN['u' + r.conflict_id]?.loc, partyName = parties(r, r.start_date2);
      const country = fought?.map(gw => partyName.get(gw)).find(Boolean) || r.location.split(',')[0].replace(/ \(.*\)$/, '');
      // Plain-text account from the UCDP record, since these events have no Wikipedia article of their own.
      const last = episode.at(-1), warYears = episode.filter(x => x.intensity_level === '2').length;
      const KIND = { 1: 'a colonial conflict', 2: 'an interstate conflict', 3: 'a civil conflict', 4: 'an internationalised civil conflict' };
      const over = r.incompatibility === '1' ? `control of ${r.territory_name || 'territory'}` : r.incompatibility === '2' ? 'control of the government' : 'territory and government';
      const summary = `UCDP records ${KIND[r.type_of_conflict]} between ${r.side_a}${r.side_a_2nd ? ` (backed by ${r.side_a_2nd})` : ''} and ${r.side_b}${r.side_b_2nd ? ` (backed by ${r.side_b_2nd})` : ''} over ${over}, starting ${r.start_date2}. `
        + `This episode was active in ${episode.length} year${episode.length > 1 ? 's' : ''} (${episode[0].year}–${last.year})${warYears ? `, ${warYears} of them at war level (1,000+ battle deaths a year)` : ', below war level (25–999 battle deaths a year)'}`
        + `${last.ep_end === '1' ? `, and ended ${last.ep_end_date || last.year}.` : ' and was still active in the latest data.'}`;
      add({ date: r.start_date2, country, title: `Armed conflict breaks out: ${name}${r.territory_name ? ` (${r.territory_name})` : ''}`, type: 'conflict', status: 'declared', source: `https://ucdp.uu.se/conflict/${r.conflict_id}`, summary }, 'ucdp');
    }
  }
} else {
  // No CSV given: keep the conflict episodes of the last build (UCDP publishes the dataset once a year).
  let kept = 0;
  for (const e of previous) if (/^https:\/\/ucdp\.uu\.se\/conflict\//.test(e.source || '')) { add(e, 'ucdp'); kept++; }
  console.log(`UCDP: no CSV given; kept ${kept} conflict events from the last build`);
}

// ---- Wikidata
const SPARQL = 'https://query.wikidata.org/sparql';
async function sparql(q) {
  for (let i = 0; ; i++) {
    // A refused connection or a body cut off mid-read is retried like an HTTP error, five tries in all.
    try {
      const res = await fetch(SPARQL + '?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': 'JDP-Iq Political Calendar (https://jdpi.pages.dev)', Accept: 'application/sparql-results+json' } });
      if (res.ok) return (await res.json()).results.bindings;
      if (i > 3) throw new Error(`SPARQL HTTP ${res.status}`);
    } catch (e) { if (i > 3) throw e; }
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
}
// A source that fails is skipped with a warning the workflow run shows; the guard then decides whether what is left is
// enough to write.
const skipped = (what, err) => console.log(`::warning title=Calendar::${what} skipped: ${err.message}`);
// minLinks: Wikipedia languages an item needs; recentLinks: the bar for items from the last two years or upcoming.
// direct: instances of the class itself, not its subclasses. dates: the date properties to read (court rulings are
// dated by their publication, P577).
const COURT_DATES = 'p:P577 p:P585';
// New kinds read only "point in time" and "start time": an inception date (P571) marks an organisation or a place
// that Wikidata files under an event class (a protest group, a squatted neighbourhood), not an event.
const EVENT_DATES = 'p:P585 p:P580';
const KINDS = [
  { type: 'assassination', cls: 'wd:Q3882219', minLinks: 3, prefix: 'Assassination: ' },
  { type: 'coup', cls: 'wd:Q45382', minLinks: 6, prefix: 'Coup: ' },
  { type: 'conflict', cls: 'wd:Q178561', minLinks: 12, prefix: 'Battle: ' },
  { type: 'crisis', cls: 'wd:Q2223653', minLinks: 12, prefix: 'Terrorist attack: ' },
  { type: 'crisis', cls: 'wd:Q12184', minLinks: 10, prefix: 'Pandemic: ' },
  { type: 'crisis', cls: 'wd:Q44512', minLinks: 15, prefix: 'Epidemic: ' },
  { type: 'crisis', cls: 'wd:Q7944', minLinks: 20, prefix: 'Earthquake: ' },
  { type: 'crisis', cls: 'wd:Q8065', minLinks: 25, prefix: 'Natural disaster: ' },
  { type: 'vote', cls: 'wd:Q480498', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },                 // impeachment
  { type: 'vote', cls: 'wd:Q329547', minLinks: 2, recentLinks: 1, dates: EVENT_DATES },                 // motion of no confidence
  { type: 'vote', cls: 'wd:Q271855', minLinks: 2, recentLinks: 1, dates: EVENT_DATES },                 // government budget
  { type: 'ceasefire', cls: 'wd:Q208383', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },            // ceasefire
  { type: 'ceasefire', cls: 'wd:Q107706', minLinks: 3, dates: EVENT_DATES },                            // armistice
  { type: 'ceasefire', cls: 'wd:Q7157512', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },           // peace conference
  { type: 'ceasefire', cls: 'wd:Q1456892', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },           // peace process
  { type: 'referendum', cls: 'wd:Q43109', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },            // referendum (party primaries go to "party")
  { type: 'summit', cls: 'wd:Q1072326', minLinks: 3, recentLinks: 1, dates: EVENT_DATES },              // summit: G7, G20, NATO, BRICS, UNGA sessions…
  { type: 'summit', cls: 'wd:Q2324916', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },              // state visit
  { type: 'summit', cls: 'wd:Q7888355', minLinks: 5, recentLinks: 2, dates: EVENT_DATES },              // UN climate change conference (COP)
  { type: 'summit', cls: 'wd:Q28415750', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },             // APEC leaders' meeting
  { type: 'party', cls: 'wd:Q6508670', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },               // party leadership election
  { type: 'party', cls: 'wd:Q2288051', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },               // party congress or conference
  { type: 'inauguration', cls: 'wd:Q1417098', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },        // inauguration
  { type: 'inauguration', cls: 'wd:Q2183050', minLinks: 2, dates: EVENT_DATES },                        // inauguration (taking office)
  { type: 'resignation', cls: 'wd:Q796919', minLinks: 3, dates: EVENT_DATES },                          // a resignation as an event of its own
  { type: 'sanctions', cls: 'wd:Q2061202', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },           // international sanctions
  { type: 'sanctions', cls: 'wd:Q1248258', minLinks: 3, recentLinks: 2, dates: EVENT_DATES },           // economic sanctions
  { type: 'protest', cls: 'wd:Q273120', minLinks: 8, recentLinks: 3, dates: EVENT_DATES },              // protest, demonstration
  { type: 'protest', cls: 'wd:Q49776', minLinks: 5, recentLinks: 2, dates: EVENT_DATES },               // strike
  { type: 'protest', cls: 'wd:Q124757', minLinks: 12, recentLinks: 4, dates: EVENT_DATES },             // riot
  { type: 'court', cls: 'wd:Q19692072', direct: true, minLinks: 6, recentLinks: 3, dates: COURT_DATES },  // US Supreme Court decision
  { type: 'court', cls: 'wd:Q2334719', direct: true, minLinks: 5, recentLinks: 3, dates: COURT_DATES, apex: true }, // legal case before an apex or international court
  { type: 'court', cls: 'wd:Q584041', direct: true, minLinks: 3, recentLinks: 2, dates: COURT_DATES },    // arrest warrant (the ICC's)
  { type: 'court', cls: 'wd:Q4686864', direct: true, minLinks: 3, recentLinks: 2, dates: COURT_DATES },   // advisory opinion (the ICJ's)
  { type: 'treaty', cls: 'wd:Q131569', minLinks: 15, prefix: 'Treaty signed: ' },
];
const APEX = /Supreme|Constitutional|International Court of Justice|International Criminal Court|European Court|Court of Justice|Inter-American Court/i;
const wikidataSeen = new Set(); // an item can match several classes (e.g. pandemic and epidemic): the first one wins
for (const k of KINDS) {
  const bar = Math.min(k.minLinks, k.recentLinks ?? k.minLinks);
  const q = `SELECT ?e ?date ?countryLabel ?courtLabel ?links ?article WHERE {
    ?e wdt:P31${k.direct ? '' : '/wdt:P279*'} ${k.cls}; wikibase:sitelinks ?links.
    FILTER(?links >= ${bar})
    VALUES ?prop { ${k.dates || 'p:P585 p:P580 p:P571'} } ?e ?prop [ ?psv [ wikibase:timeValue ?date; wikibase:timePrecision ?prec ] ]. FILTER(?prec >= 11)
    FILTER(?date >= "${FROM}T00:00:00Z"^^xsd:dateTime)
    OPTIONAL { ?e wdt:P17 ?country }
    ${k.type === 'court' ? 'OPTIONAL { ?e wdt:P4884 ?court }' : ''}
    ?article schema:about ?e; schema:isPartOf <https://en.wikipedia.org/>.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
  }`;
  try {
    const rows = await sparql(q);
    const byItem = new Map();
    for (const r of rows) {
      const date = r.date.value.slice(0, 10), x = byItem.get(r.e.value);
      if (!x || date < x.date) byItem.set(r.e.value, { date, links: +r.links.value, country: r.countryLabel?.value || x?.country || 'International', court: r.courtLabel?.value || x?.court || '', source: r.article.value });
      else if (!x.court && r.courtLabel) x.court = r.courtLabel.value;
    }
    let n = 0;
    for (const [id, x] of byItem) {
      if (x.links < k.minLinks && !(x.date >= RECENT && x.links >= (k.recentLinks ?? k.minLinks))) continue;
      if (k.apex && !APEX.test(x.court)) continue;
      if (wikidataSeen.has(id)) continue;
      wikidataSeen.add(id);
      let title = articleTitle(x.source), type = k.type;
      // Party primaries are filed under referendums on Wikidata; they are party contests.
      if (type === 'referendum' && /\bprimar(?:y|ies)\b|\bcaucus/i.test(title)) type = 'party';
      if (k.prefix && !title.toLowerCase().startsWith(k.prefix.replace(/[:\s]+$/, '').toLowerCase())) title = k.prefix + title;
      if (type === 'court' && !/\bv\.|\b(?:ruling|judgment|decision|warrants?|opinion|verdict|case)\b/i.test(title)) title = 'Ruling: ' + title;
      // No country on the item: the one its title names ("2026 state visit by Xi Jinping to North Korea").
      const country = x.country === 'International' ? countryInText(articleTitle(x.source)) || 'International' : x.country;
      add({ date: x.date, country, title, type, status: 'declared', source: x.source }, 'wikidata');
      n++;
    }
    console.log(`Wikidata ${k.type} ${k.cls}: ${n}`);
  } catch (err) { skipped(`Wikidata ${k.type} ${k.cls}`, err); }
}

// ---- Resignations: office-holders whose term ended with "resignation" (P39 with end cause Q796919)
const OFFICE_OK = /\b(?:President|Prime Minister|Premier|Chancellor|Minister|Secretary|First Minister|Governor|Monarch|King|Queen|Emperor|Pope|Speaker|Director|Head|Leader|Chief|Attorney General|Commissioner|Taoiseach|Chair(?:man|person|woman)?|High Representative|Secretary-General)\b/i;
const OFFICE_NOT = /\b(?:member of|representative|senator|Teachta|councill?or|federation|football|club|university|rector|bishop|cardinal|MEP|delegate|alderman|mayor)\b/i;
try {
  const rows = await sparql(`SELECT ?p ?pLabel ?posLabel ?jurLabel ?start ?end ?article WHERE {
    ?st pq:P1534 wd:Q796919; ps:P39 ?pos; pqv:P582 [ wikibase:timeValue ?end; wikibase:timePrecision ?prec ]. FILTER(?prec >= 11)
    ?p p:P39 ?st; wikibase:sitelinks ?links. FILTER(?links >= 15)
    FILTER(?end >= "${FROM}T00:00:00Z"^^xsd:dateTime)
    OPTIONAL { ?st pq:P580 ?start }
    OPTIONAL { ?pos wdt:P1001 ?jur }
    ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
  }`);
  // One event per person and day, naming every office they left ("… as Deputy Prime Minister, Lord Chancellor and …").
  const byPerson = new Map();
  for (const r of rows) {
    const pos = r.posLabel?.value || '';
    if (!OFFICE_OK.test(pos) || OFFICE_NOT.test(pos) || /^Q\d+$/.test(pos)) continue;
    const date = r.end.value.slice(0, 10), key = `${r.p.value}|${date}`;
    const x = byPerson.get(key) || byPerson.set(key, { date, name: articleTitle(r.article.value).replace(/ \(.*\)$/, ''), source: r.article.value, positions: new Set(), start: null, country: null }).get(key);
    x.positions.add(pos);
    if (r.start && (!x.start || r.start.value < x.start)) x.start = r.start.value.slice(0, 10);
    // A national office: its jurisdiction is a country (or the EU, the UN). Regional and local offices are left out.
    const jur = normaliseCountry(r.jurLabel?.value || '');
    x.country ||= isKnownCountry(jur) || /^(?:European Union|United Nations)$/.test(jur) ? jur : countryOfLink(pos);
  }
  const RANK = p => /President|Prime Minister|Premier|Chancellor|Monarch|King|Queen|Pope|First Minister/i.test(p) ? 0 : /Minister|Secretary/i.test(p) ? 1 : 2;
  for (const x of byPerson.values()) {
    const pos = [...x.positions].sort((a, b) => RANK(a) - RANK(b));
    const list = pos.length > 1 ? pos.slice(0, -1).join(', ') + ' and ' + pos.at(-1) : pos[0];
    if (!x.country) continue;
    add({ date: x.date, country: x.country, title: `${x.name} resigns as ${list}`, type: 'resignation', status: 'declared', source: x.source,
      summary: `${x.name} resigned as ${list} on ${longDate(x.date)}${x.start && x.start < x.date ? `, having held ${pos.length > 1 ? 'office' : 'the office'} since ${longDate(x.start)}` : ''}.` }, 'wikidata');
  }
  console.log(`Wikidata resignations (position held, end cause resignation): ${byPerson.size}`);
} catch (err) { skipped('Wikidata resignations', err); }

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
  ['2016-06-23', 'United Kingdom', 'UK votes to leave the European Union', 'referendum', '2016 United Kingdom European Union membership referendum'],
  ['2020-01-31', 'United Kingdom', 'United Kingdom leaves the European Union', 'treaty', 'Brexit'],
  ['2020-03-11', 'International', 'WHO declares COVID-19 a pandemic', 'crisis', 'COVID-19 pandemic'],
  ['2021-01-06', 'United States', 'Attack on the US Capitol', 'crisis', 'January 6 United States Capitol attack'],
  ['2021-08-15', 'Afghanistan', 'Taliban take Kabul', 'conflict', 'Fall of Kabul (2021)'],
  ['2022-02-24', 'Ukraine', 'Russia launches full-scale invasion of Ukraine', 'conflict', 'Russian invasion of Ukraine'],
  ['2023-10-07', 'Israel', 'Hamas-led attack on Israel; Gaza war begins', 'conflict', 'October 7 attacks'],
  ['2024-12-08', 'Syria', 'Assad government falls in Syria', 'coup', 'Fall of the Assad regime'],
  ['2025-06-13', 'Iran', 'Israel strikes Iran, starting the twelve-day war', 'conflict', 'Iran–Israel war'],
];
for (const [date, country, title, type, article] of LANDMARKS) add({ date, country, title, type, status: 'declared', source: wiki(article) }, 'landmark');

// ---- Summits and scheduled meetings from Wikipedia's lists and infoboxes, and the national electoral calendars
let undated = new Set(), calendarsFrom = Infinity; // votes the electoral calendars don't date yet; their first year
try {
  const { events: listed, log, unknown, calendarsFrom: first } = await listEvents({ from: FROM, today: TODAY });
  for (const e of listed) add(e, 'list');
  undated = new Set([...unknown].map(wiki));
  calendarsFrom = first;
  console.log('Wikipedia lists:', log.join(' · '));
} catch (err) { skipped('Wikipedia lists', err); }

// ---- Political Atlas: each country's national elections, as the Atlas keeps them (outlook.mjs)
if (atlasDir) {
  const list = atlasElections(atlasDir);
  for (const e of list) add(e, 'atlas');
  console.log(`Political Atlas: ${list.length} elections with a day or a month`);
} else console.warn('Political Atlas: no --atlas=<folder>; the outlook has only the elections from Wikipedia and Wikidata');

// ---- The news: Wikipedia's Current events portal
try {
  const news = await currentEvents(NEWS_FROM, TODAY);
  for (const e of news.events) add(e, 'news');
  console.log(`Current events ${NEWS_FROM}…${TODAY}: ${news.days} days, ${news.items} items, ${news.events.length} events`);
} catch (err) { skipped('Current events', err); }

// ---- Ballots: one record per vote and round, with the best date known; then the expected events whose day has passed
// are held or dropped (outlook.mjs).
const resolved = resolveExpected(mergeBallots(events, { today: TODAY, undated, calendarsFrom }), TODAY);
events.length = 0;
events.push(...resolved);

// ---- One record per event: the structured record wins over a news item about the same event, and the first
// structured source (Retrospective, Wikidata, lists) over later ones. A Wikipedia article names the event; year pages
// ("2026 in Hungary") name many, so they don't count. A summit is also the same if it has the same host and date.
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const isArticle = s => /en\.wikipedia\.org\/wiki\//.test(s || '') && !/\/wiki\/\d{4}_in_/.test(s);
const structured = [], news = [];
for (const e of events) (e.via === 'news' ? news : structured).push(e);
const byKey = new Map();
const note = (k, e) => (byKey.get(k) || byKey.set(k, []).get(k)).push(e);
// Within one source only the same day counts (two leaders can share an article-less year page, a summit can recur).
const dupOf = (e, window) => (byKey.get(`${e.type}|${e.source}`) || []).some(x => x.date === e.date || (x.via !== e.via && days(x.date, e.date) <= window))
  || (e.type === 'summit' && (byKey.get(`summit|${e.country}`) || []).some(x => x.via !== e.via && days(x.date, e.date) <= 1));
const kept = [];
for (const e of structured) {
  if (isArticle(e.source) && dupOf(e, 3)) continue;
  kept.push(e);
  if (isArticle(e.source)) note(`${e.type}|${e.source}`, e);
  if (e.type === 'summit') note(`summit|${e.country}`, e);
}
// A news item is also the same event as a structured record of the same type, country and day (an inauguration
// recorded on Wikidata, a resignation from a position held), except for kinds that come several a day.
const sameDay = new Set(kept.map(e => `${e.type}|${e.country}|${e.date}`));
for (const e of news) if (!dupOf(e, 10) && !(!/^(?:court|sanctions|protest)$/.test(e.type) && sameDay.has(`${e.type}|${e.country}|${e.date}`))) kept.push(e);
const unique = new Map();
for (const { via, precision, ...e } of kept) if (!unique.has(`${e.date}|${e.title}`)) unique.set(`${e.date}|${e.title}`, e);

const all = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));

// ---- Guard (guard.mjs): stop before writing if a type of event would lose more than half of its records over the
// whole history, since the news start or in the 18-month outlook, or if half the news items would go. Both builds are
// counted over today's days, so the window moving on does not count as a loss.
refuseIfLost(lostEvents(previous, all, { from: NEWS_FROM, today: TODAY, to: shiftMonths(TODAY, 18) }));

// ---- write one file per decade
mkdirSync(DATA, { recursive: true });
const decades = new Map();
for (const e of all) { const d = e.date.slice(0, 3) + '0s'; (decades.get(d) || decades.set(d, []).get(d)).push(e); }
for (const [d, list] of decades) writeFileSync(new URL(`${d}.json`, DATA), JSON.stringify({ generated: new Date().toISOString(), decade: d, events: list }));

const TYPES = ['election', 'referendum', 'party', 'leader', 'inauguration', 'resignation', 'coup', 'conflict', 'ceasefire', 'assassination', 'crisis', 'protest', 'treaty', 'summit', 'sanctions', 'vote', 'court'];
const count = list => TYPES.map(t => `${t} ${list.filter(e => e.type === t).length}`).join(', ');
const [past, ahead] = [shiftMonths(TODAY, -6), shiftMonths(TODAY, 18)];
console.log(`${all.length} events: ${count(all)}`);
console.log(`Last 6 months (${past}…${TODAY}): ${count(all.filter(e => e.date >= past && e.date <= TODAY))}`);
console.log(`18-month outlook (…${ahead}): ${count(all.filter(e => e.date > TODAY && e.date <= ahead))}`);
console.log([...decades].map(([d, l]) => `${d}: ${l.length}`).join(' · '));

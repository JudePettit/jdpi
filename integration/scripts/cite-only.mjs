// Sources whose terms let Vitruvian Manager show a cited figure but not redistribute their data ("cite-only"), and
// everything VM still hosts from them. The smallest form of the S0 test "no hosted value from a cite-only source"
// (PRP-SCHOLAR-USP-DESIGN.md, stage S0): tests/integration-hub.test.mjs and tests/battlefield.test.mjs read it. Stage S1
// wrote integration/sources.json, VM's list of sources (5.1), whose cite-only entries carry the same citation, short
// citation, link, terms address, words and date read as CITE_ONLY here: tests/omni-data.test.mjs fails unless the two
// agree both ways, so a change here is a change there too. This module stays the one the tests import until stage S2a
// moves them onto sources.json (with each hosted item and its kind).
//
// A careful record of the terms as read, not legal advice.

export const CITE_ONLY = {
  cow: {
    name: 'Correlates of War',
    // A record whose provenance (dataset, source, deathsSource…) names the source by this name carries a value from it,
    // and so does one whose provenance is the source's id in VM's own data (the Retrospective Battlefield's rows carry
    // src: 'cow'), or one holding a key whose value is derived from the source, with no provenance field beside it.
    match: /Correlates of War/,
    ids: ['cow'],
    fields: ['wars_1926_1945', 'cowWars1926_45'],
    datasets: 'COW War Data: Inter-State v4.0, Intra-State v4.1 and Extra-State v4.0',
    // The citation the war data page asks for, read 16 November 2026 at the address below.
    citation: 'Sarkees, Meredith Reid and Frank Wayman (2010). Resort to War: 1816–2007. Washington DC: CQ Press',
    // The same, short, where a line has room for no more: the Master Index's mention lines, each of which opens War
    // Focus, whose panel and Sources give the citation in full with the link.
    short: 'Sarkees and Wayman 2010, Resort to War: 1816–2007',
    url: 'https://correlatesofwar.org/data-sets/cow-war/',
    terms: 'https://correlatesofwar.org/data-sets/',
    read: '2026-11-16',
    // The words that matter, from the "Terms and Conditions" at the head of the Data Sets page (they cover every COW
    // data set and version; the war data page adds no licence of its own).
    words: 'Users agree to cite each of the datasets they use in the manner described on each specific dataset web page. ' +
      'Users agree not to distribute the dataset to any third party without written permission of the COW director and data host. ' +
      'Users agree to ask permission for any dissemination, posting, or other use of the data that is not covered by the above restrictions.',
    // What VM keeps under Jude's rule of 16 November 2026 (S0): a cited total with a link to the source.
    allows: 'a cited total with a link to the source',
  },
};

// What VM hosts from a cite-only source. kind:
//   'total'    a cited total (one per war), with the citation and link: allowed;
//   'pending'  kept as it is until Jude chooses (the S0 report of 16 November 2026, the Correlates of War choice), with why,
//              since when (`since`) and the choice it waits on (`awaits`), so that it cannot stand unseen;
//   'pointer'  names the source and says where to read it, and carries none of its values: in every record that names the
//              source, each field in `fields` holds the words `says`, never a number (pointerProblems below), and the
//              download's notes give the source's citation and address.
// Row-level data is never listed here: it is taken out of every download. `dataset` is a catalogue id; `file`, page data
// that cites the source in its own `sources`; `dir`, every file in a folder (the Hub's country profiles, the lake's shards).
const CHOICE = 'Jude\'s choice on the Correlates of War (the S0 report of 16 November 2026): ask the project for written permission, '
  + 're-source 1926–1945 from Wikidata, start the Retrospective Battlefield in 1946, or take COW totals out of War Focus as well';
export const HOSTED = [
  { source: 'cow', dataset: 'war-focus-wars', kind: 'total', what: 'one cited Correlates of War total for each of the 9 War Focus wars it covers (totalDeaths, deathsSource)' },
  { source: 'cow', file: 'battlefield/focus/data/index.json', kind: 'total', what: 'the same totals: War Focus\'s own index, which the war-focus-wars download serves' },
  { source: 'cow', dir: 'lake/data/e', kind: 'total', what: 'the same totals in the Master Index\'s lines for those 9 wars ("… battle deaths, the Correlates of War total (Sarkees and Wayman 2010, …)"), each opening War Focus (lake/scripts/adapters.mjs)' },
  // Jude's decision F1 of 17 November 2026 (VM-DECISIONS-17NOV.md): what VM offers as a download carries no COW value.
  { source: 'cow', dataset: 'war-focus-monthly-deaths', kind: 'pointer', since: '2026-11-17', fields: ['deaths'], says: 'see the Correlates of War', what: 'no Correlates of War value: in every month of the 9 War Focus wars whose deaths come from a COW total, deaths says "see the Correlates of War" in place of VM\'s spread of that total, and the file\'s notes give COW\'s citation and address (War Focus\'s page keeps the cited totals on screen)' },
  { source: 'cow', dir: 'integration/data/countries', kind: 'pending', since: '2026-11-16', awaits: CHOICE, what: 'a count per country of Correlates of War wars 1926–1945 (conflict_history.wars_1926_1945) in the API\'s and MCP\'s country profiles, from National Analysis\'s cowWars1926_45 (national/data/index.json, shown on q/national.html as "N wars 1926–45"), derived from the Retrospective Battlefield\'s wars; follows Jude\'s choice for that page. The national-countries download does not carry it' },
  { source: 'cow', file: 'battlefield/history/data/wars.json', kind: 'pending', since: '2026-11-16', awaits: CHOICE, what: 'the Retrospective Battlefield\'s 40 wars of 1926–1945 (type, years, places, dated sides, battle deaths), page data and no longer a download: no allowed source replaces them (UCDP starts in 1946), so the page stays as it is until Jude chooses' },
];

// The keys of a record that say where its value comes from.
export const PROVENANCE = /^(dataset|src|source|sources)$|Source$/;

// True when a record's provenance names a cite-only source, by its name or its id, or the record holds one of the
// source's own fields (any depth). Everything inside a provenance key is provenance, however deep, so a map of sources
// ({ sources: { cow: 'Correlates of War …' } }) names the source by its words and by its id as the key (the second
// reviewer, 17 November 2026, X4).
export function namesSource(record, src) {
  const ids = new Set(src.ids || []), fields = new Set(src.fields || []);
  const walk = (v, prov) => {
    if (typeof v === 'string') return prov && (src.match.test(v) || ids.has(v));
    if (Array.isArray(v)) return v.some(x => walk(x, prov));
    if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => fields.has(k) || (prov && ids.has(k)) || walk(x, prov || PROVENANCE.test(k)));
    return false;
  };
  return walk(record, false);
}

// What is wrong with a 'pointer' download's records (HOSTED above): each record that names the source and holds, in one of
// the entry's fields, anything but its words. [] when it carries none of the source's values.
// A figure written out in words of the record (1,350,000) counts too: a source's total quoted in a note is its value.
export const FIGURE = /\d{1,3}(?:,\d{3})+/;
export function pointerProblems(records, held, src) {
  const out = [];
  for (const r of records) {
    if (!namesSource(r, src)) continue;
    const at = `${r.war_id ?? r.id ?? '?'} ${r.month ?? ''}`.trim();
    for (const f of held.fields || []) if (r?.[f] !== held.says) out.push(`${at}: ${f} is ${JSON.stringify(r?.[f])}, not "${held.says}"`);
    for (const [k, v] of Object.entries(r || {})) if (typeof v === 'string' && FIGURE.test(v)) out.push(`${at}: ${k} gives a figure (${v.match(FIGURE)[0]})`);
  }
  return out;
}

// A licence or terms line that calls a cite-only source free to use, open or public domain: every clause naming it.
export function claimsFree(text, src) {
  return String(text || '').split(/;|\.\s/).some(c => src.match.test(c) && /free to use|CC BY|CC0|public domain|open licen[cs]e/i.test(c));
}

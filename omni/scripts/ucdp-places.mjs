// VM's crosswalk from UCDP's names of states (a conflict's location, a "Government of …" side) to the state at a year,
// by Wikidata Q-id and ISO 3166-1 alpha-3 (stage S5b). A Gleditsch and Ward number is never the join: that list is its
// authors' own work. UCDP's names are matched to Natural Earth's names of today's countries (public domain), which carry
// the Q-id and ISO3 Natural Earth gives them; the names below are those that differ, or that stood for another state in
// some years (UCDP names a state by today's name with the older one in brackets: "Vietnam (North Vietnam)"). Each Q-id
// here is checked on Wikidata at every build (its English label, and its ISO3, P298, where it has one).
// VM's own work: chosen by hand from UCDP's own description of its names (UCDP/PRIO ACD codebook 26.1, "location").
export const SPECIAL = {
  'Bosnia-Herzegovina': [{ q: 'Q225', iso3: 'BIH' }],
  'Cambodia (Kampuchea)': [{ q: 'Q424', iso3: 'KHM' }],
  'Central African Republic': [{ q: 'Q929', iso3: 'CAF' }],
  'Czech Republic': [{ q: 'Q213', iso3: 'CZE' }],
  Czechoslovakia: [{ q: 'Q33946', iso3: null }],
  'DR Congo (Zaire)': [{ q: 'Q974', iso3: 'COD' }],
  'Dominican Republic': [{ q: 'Q786', iso3: 'DOM' }],
  Hyderabad: [{ q: 'Q1240096', iso3: null }],
  'Ivory Coast': [{ q: 'Q1008', iso3: 'CIV' }],
  'Kingdom of eSwatini (Swaziland)': [{ q: 'Q1050', iso3: 'SWZ' }],
  'Madagascar (Malagasy)': [{ q: 'Q1019', iso3: 'MDG' }],
  'Myanmar (Burma)': [{ q: 'Q836', iso3: 'MMR' }],
  'Russia (Soviet Union)': [{ to: 1991, q: 'Q15180', iso3: null }, { from: 1992, q: 'Q159', iso3: 'RUS' }],
  'Serbia (Yugoslavia)': [{ to: 1991, q: 'Q83286', iso3: null }, { from: 1992, to: 2005, q: 'Q838261', iso3: null }, { from: 2006, q: 'Q403', iso3: 'SRB' }],
  'South Sudan': [{ q: 'Q958', iso3: 'SSD' }],
  'South Vietnam': [{ q: 'Q180573', iso3: null }],
  'South Yemen': [{ q: 'Q199841', iso3: null }],
  'Vietnam (North Vietnam)': [{ to: 1975, q: 'Q172640', iso3: null }, { from: 1976, q: 'Q881', iso3: 'VNM' }],
  'Yemen (North Yemen)': [{ to: 1989, q: 'Q267584', iso3: null }, { from: 1990, q: 'Q805', iso3: 'YEM' }],
  'Zimbabwe (Rhodesia)': [{ to: 1979, q: 'Q217169', iso3: null }, { from: 1980, q: 'Q954', iso3: 'ZWE' }],
};

/** The resolver: name, year → { q, iso3 } or null, from Natural Earth's countries (features' n, q, iso3) and SPECIAL. */
export function placeResolver(neCountries) {
  const byName = new Map(neCountries.filter(c => c.q).map(c => [c.n, { q: c.q, iso3: c.iso3 || null }]));
  return (name, year) => {
    const n = String(name || '').trim();
    const s = SPECIAL[n];
    if (s) { const r = s.find(x => (x.from ?? -Infinity) <= year && year <= (x.to ?? Infinity)); return r ? { q: r.q, iso3: r.iso3 } : null; }
    return byName.get(n) || null;
  };
}
/** UCDP's state names in a side: "Government of India, Government of Pakistan" → ['India', 'Pakistan']. */
export const governments = side => String(side || '').split(/,\s*(?=Government of )/).map(s => /^Government of (.+)$/.exec(s.trim())?.[1]).filter(Boolean);

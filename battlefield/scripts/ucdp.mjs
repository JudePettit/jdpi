// UCDP's candidate event files (its monthly, provisional events between yearly GED releases), from the downloads
// page: for every year after the GED release in use, that year's latest cumulative file (GEDEvent_v26_01_26_09 holds
// January to September 2026), oldest year first. After the first file of a new year appears there are two until the
// next GED release covers the old year, and both are needed: reading only the newest would drop the old year's events.
export function candidateFiles(page, gedThrough) {
  const latest = new Map(); // year → { file, month }
  for (const m of String(page).matchAll(/candidateged\/(GEDEvent_v\d+_01_(\d+)_(\d+)\.csv)/g)) {
    const year = 2000 + +m[2], month = +m[3];
    if (year > gedThrough && !(latest.get(year)?.month >= month)) latest.set(year, { file: m[1], month });
  }
  return [...latest].sort((a, b) => a[0] - b[0]).map(([, v]) => v.file);
}

// UCDP/PRIO actor names, for the conflict names that Retrospective Battlefield and the Political Calendar write.

/**
 * A UCDP list of actors, one name each. The list is comma-separated, but so are a few actors' own names
 * ("Military faction (forces of Augusto Pinochet, Toribio Merino and Leigh Guzman)"), so commas inside brackets
 * don't split, and a list whose ids (side_a_id, side_b_id) name a single actor isn't split at all.
 */
export function actors(names, ids = null) {
  const s = String(names || '').trim();
  if (!s) return [];
  if (ids != null && String(ids).split(',').filter(x => x.trim()).length === 1) return [s];
  const out = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ',' && depth <= 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

// UCDP names a few states for their old and new selves at once; the name that fits the date.
const RENAMED = {
  'Russia (Soviet Union)': [['1991-12-26', 'Russia'], ['', 'Soviet Union']],
  'Yemen (North Yemen)': [['1990-05-22', 'Yemen'], ['', 'North Yemen']],
  'Vietnam (North Vietnam)': [['1976-07-02', 'Vietnam'], ['', 'North Vietnam']],
  'Serbia (Yugoslavia)': [['2006-06-05', 'Serbia'], ['2003-02-04', 'Serbia and Montenegro'], ['', 'Yugoslavia']],
  'Myanmar (Burma)': [['1989-06-18', 'Myanmar'], ['', 'Burma']],
  'Cambodia (Kampuchea)': [['', 'Cambodia']],
  'DR Congo (Zaire)': [['1997-05-17', 'DR Congo'], ['1971-10-27', 'Zaire'], ['', 'DR Congo']],
  'Zimbabwe (Rhodesia)': [['1980-04-18', 'Zimbabwe'], ['', 'Rhodesia']],
  'Madagascar (Malagasy)': [['', 'Madagascar']],
};
/** "Government of Russia (Soviet Union)" on 1956-11-04 → "Soviet Union"; any other actor keeps its name. */
export function stateName(name, date) {
  const n = String(name || '').replace(/^Government of /, '').trim();
  return RENAMED[n]?.find(([from]) => date >= from)[1] ?? n;
}

/** An interstate conflict's name from its rows: "Australia, United Kingdom, United States of America – Iraq". */
export function interstateName(rows) {
  const date = `${rows.at(-1).year}-07-01`;
  const side = k => [...new Set(rows.flatMap(r => actors(r[k], r[`${k}_id`])).map(s => stateName(s, date)))].join(', ');
  return `${side('side_a')} – ${side('side_b')}`;
}

/** The states on each side of a UCDP row, by Gleditsch–Ward code: Map(645 → "Iraq"). */
export function parties(row, date) {
  const out = new Map();
  for (const [names, ids, gws] of [[row.side_a, row.side_a_id, row.gwno_a], [row.side_b, row.side_b_id, row.gwno_b]]) {
    const list = actors(names, ids), codes = String(gws || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0);
    if (list.length === codes.length) codes.forEach((gw, i) => out.set(gw, stateName(list[i], date)));
  }
  return out;
}

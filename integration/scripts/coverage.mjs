// Coverage map: which countries every piece of VM content covers, and where content leaves out countries that its own
// subject says it should include. Stage 1 of "populating the empty maps" (Political Atlas and Political Retrospective
// cover 78 countries; most other content covers far more, or far fewer).
//
//   node integration/scripts/coverage.mjs [--json <file>] [--md <file>] [--atlas=<dir>] [--retro=<dir>] [--today=YYYY-MM-DD] [--quiet]
//
// It reads only committed data: this repository, plus the data of Political Atlas and Political Retrospective, found
// beside it (../political-atlas, ../hp-retrospective) or inside it (where calendar-refresh.yml checks them out), or
// where --atlas and --retro say. No network, no packages. Without --json or --md it prints the headline numbers.
//
// The countries ("target"): United Nations members, the two observer states (the Holy See, Palestine), Kosovo and
// Taiwan, 197 in all, with the ISO3 codes VM already uses (PSE, XKX, TWN, VAT); Greenland is kept beside them because
// the Atlas has it. Codes, names and regions come from national/data/index.json and analytics/lib/countries.js.
//
// How strongly a piece covers a country ("tier"); tiers are kept apart and never merged:
//   map          drawn or highlighted on the piece's own map (a Kino scene's highlighted countries, an Atlas record)
//   point        a place the piece shows (a battle, a scene's marker, a capital, an invention) lies inside the country
//   belligerent  fought in a war the piece shows, or was where it was fought
//   tagged       an explicit country field on a record (a calendar event, a Master Index tag, a citizenship)
//   linked       the piece links to a VM place about the country (a Kino link to the Atlas, to a polity, to a country page)
//   named        named in the piece's text only
//   row          a row in a table (National Analysis, Volatility, a Hub profile, a country's own Master Index entry)
// Historical states (SUN, YUG, CSK and Gleditsch–Ward predecessors) count as their present-day successors, as Kino
// draws them; the gap rules count such a state once instead (gwGroup), and a successor on its own only where a battle or
// other point falls inside it. Points at sea or in Antarctica get no country. Disputed ground follows the internationally recognised
// borders that ISO 3166 codes describe (Crimea UKR, Golan SYR, Gaza and the West Bank PSE, Western Sahara ESH); this
// is a lookup convention, not a judgement.
//
// The gap rules (each one a reader can follow by hand):
//   war-film     A Kino film links to a war (War Focus or the Retrospective Battlefield). The war's data says a country
//                fought in it, was fought over or had battles in it, and the film never draws or marks that country.
//   war-scene    A Kino map scene links to one moment of a war (a War Focus month, a Retrospective Battlefield year). At
//                that moment the war's battles fall inside the scene's view (or at least a fifth of a fought-over
//                country's box does), and the scene leaves that country grey.
//   war-sides    In War Focus, at least two of a war's listed battles fall inside a present-day country that is on
//                neither side, not in its theatre and never under its control; or a war has no country at all.
//   calendar     A country has calendar events and no Political Atlas record (so its elections come from no Atlas page).
//   scope        A country Political Atlas, Political Retrospective or the Global Headline Tracker lacks, which other
//                content covers (by any tier but named and row).
//   dead-link    A link or table lookup that points at a record its target lacks (National's Atlas chip, Kino Related
//                screens, Kino's Retrospective links, the Integration Hub's country profiles).
//   thin-index   A country with five or fewer Master Index entries tagged to it (its own entry aside).
//   scope-text   A page, script or document that states the old 78-country scope.
// A gap's weight is how much content it touches: each missing country counts once for every other piece of content that
// already has it (for war-film and war-scene, every piece that places it in that war; for calendar, each of the two
// calendars that has it; for war-sides, War Focus). A historical state the gap rules keep whole counts as one country.
// Gaps are ranked by weight. dead-link and scope-text gaps are plain counts instead (one per country, territory or link;
// one per file), so they are ranked apart, after the others (rankGaps).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TIERS = ['map', 'point', 'belligerent', 'tagged', 'linked', 'named', 'row'];
// Tiers that show a country is part of a piece's content (not just mentioned, not just a table row).
const SUBSTANTIVE = new Set(['map', 'point', 'belligerent', 'tagged', 'linked']);

// World Bank economies in National Analysis that are not UN members, observers, Kosovo or Taiwan.
export const TERRITORIES = new Set('ABW ASM BMU CHI CUW CYM FRO GIB GRL GUM HKG IMN MAC MAF MNP NCL PRI PYF SXM TCA VGB VIR'.split(' '));
export const EXTRA_TARGET = ['TWN', 'VAT']; // not in National Analysis, which follows the World Bank list
export const KEEP = new Set(['GRL']); // kept because the Atlas has it
// Regions are National Analysis's World Bank regions (trimmed). The two countries National lacks take their
// neighbours' region.
const REGION_EXTRA = { TWN: 'East Asia & Pacific', VAT: 'Europe & Central Asia' };
// Africa as a continent, for the reports: the World Bank's "Sub-Saharan Africa" plus the African countries it files
// under "Middle East, North Africa, Afghanistan & Pakistan".
export const AFRICA_NORTH = new Set(['DZA', 'DJI', 'EGY', 'LBY', 'MAR', 'TUN']);
export const isAfrica = (iso, region) => region === 'Sub-Saharan Africa' || AFRICA_NORTH.has(iso);

/* ------------------------------------------------------------------ resolvers */
// Names VM's own tables do not carry: historical states (which then become their successors), the breakaway
// territories some Wikidata labels use (filed under the recognised state, as Retrospective names do), and
// supranational names (null: no country).
const NAME_OVERRIDE = {
  'soviet union': 'SUN', ussr: 'SUN', czechoslovakia: 'CSK', yugoslavia: 'YUG', 'republic of upper volta': 'BFA', 'upper volta': 'BFA', 'south yemen': 'YEM',
  'republic of abkhazia': 'GEO', 'republic of artsakh': 'AZE', 'northern cyprus': 'CYP', 'eastern slavonia, baranja and western syrmia': 'HRV',
  'netherlands antilles': ['CUW', 'SXM'], 'british overseas territories': null, international: null, 'european union': null, 'united nations': null,
};
// Gleditsch–Ward codes National Analysis does not carry (colonies, predecessors, divided states) → present-day ISO3.
// 972 → TON is inferred from the Gleditsch–Ward microstates list and is worth checking.
const GW_EXTRA = { 3: 'USA', 4: 'USA', 6: 'PRI', 21: 'CAN', 65: 'FRA', 66: 'FRA', 120: 'FRA', 585: 'FRA', 1201: 'FRA', 255: 'DEU', 265: 'DEU', 315: ['CZE', 'SVK'],
  515: ['RWA', 'BDI'], 521: 'SOM', 5200: 'SOM', 602: 'MAR', 6021: 'MAR', 609: 'ESH', 610: ['ESH', 'MAR'], 665: ['ISR', 'PSE'], 6511: 'PSE', 6631: 'PSE',
  678: 'YEM', 680: 'YEM', 681: 'YEM', 6801: 'YEM', 6812: 'YEM', 713: 'TWN', 730: ['KOR', 'PRK'], 751: 'IND', 815: 'VNM', 816: 'VNM', 817: 'VNM',
  821: 'MYS', 822: 'MYS', 823: 'MYS', 824: 'MYS', 827: ['MYS', 'SGP'], 851: 'IDN', 911: 'PNG', 912: 'PNG', 930: 'NCL', 960: 'PYF', 7351: 'RUS', 972: 'TON' };
// National Analysis's gw for Vietnam is 815 (the GW code of the pre-1954 state); 816 is today's. Both map to VNM here.
const GW_OVERRIDE = new Set([815]);
// Wikidata items for predecessor states and other names of countries, as the Master Index and Kino use them.
const QID_EXTRA = { Q55: 'NLD', Q756617: 'DNK', Q1246: 'XKX', Q865: 'TWN', Q237: 'VAT', Q219060: 'PSE', Q23792: 'PSE',
  Q15180: 'SUN', Q33946: 'CSK', Q83286: 'YUG', Q36704: 'YUG', Q191077: 'YUG', Q15102440: 'YUG', Q838261: ['SRB', 'MNE'], Q37024: ['SRB', 'MNE'],
  Q174193: 'GBR', Q161885: 'GBR', Q179876: 'GBR', Q8680: 'GBR', Q25: 'GBR', Q34266: 'RUS', Q2305208: 'RUS', Q2184: 'RUS', Q139319: 'RUS',
  Q188712: 'JPN', Q172579: 'ITA', Q16957: 'DEU', Q713750: 'DEU', Q27306: 'DEU', Q38872: 'DEU', Q41304: 'DEU', Q1206012: 'DEU', Q7318: 'DEU', Q43287: 'DEU',
  Q154195: 'DEU', Q164079: 'DEU', Q12560: 'TUR', Q28513: ['AUT', 'HUN'], Q131964: 'AUT', Q533534: 'AUT', Q203493: 'ROU', Q6123746: 'ESP', Q207272: 'POL',
  Q211274: 'POL', Q170072: 'NLD', Q200464: 'PRT', Q45670: 'PRT', Q8733: 'CHN', Q70972: 'FRA', Q11196: 'BIH', Q31747: 'IRL', Q62633: 'FIN', Q147909: 'BGR',
  Q1775277: 'IND', Q1643555: 'BLZ', Q146328: 'PHL', Q30747910: 'AFG', Q153128: 'HRV', Q193714: ['ISR', 'PSE'], Q112660052: 'IND', Q129286: 'IND' };
// Names in text that contain a country's name but mean something else (null: no country), or an older name of a
// different country than the one inside it.
const TEXT_RESERVED = [['New Guinea', null], ['Gulf of Guinea', null], ['New Mexico', null], ['Portuguese Guinea', 'GNB'], ['Spanish Guinea', 'GNQ'], ['French Guinea', 'GIN']];
// Microstates too small for the shipped boundaries: a dot of this radius (degrees) round the centre.
const DOTS = { VAT: [12.4534, 41.9029, 0.006], MCO: [7.4246, 43.7384, 0.015] };

/** TopoJSON → features with decoded rings and a bounding box ([w, s, e, n]) for a quick first test. */
export function decodeTopo(topo, object) {
  const T = topo.transform;
  const arcs = topo.arcs.map(a => { if (!T) return a; let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * T.scale[0] + T.translate[0], (y += dy) * T.scale[1] + T.translate[1]]); });
  const ring = ids => ids.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? a.slice(1) : a; });
  return topo.objects[object].geometries.filter(g => g.arcs).map(g => {
    const polys = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.arcs.map(p => p.map(ring));
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    return { props: g.properties || {}, polys, box: [w, s, e, n] };
  });
}
// Even-odd point in polygon (holes included), after the box test.
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export const inFeature = (x, y, f) => x >= f.box[0] && x <= f.box[2] && y >= f.box[1] && y <= f.box[3] && f.polys.some(p => p.reduce((c, r) => (inRing(x, y, r) ? !c : c), false));
const segDist = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
function nearest(x, y, feats, r) {
  let best = null, bd = r;
  for (const f of feats) {
    if (x < f.box[0] - r || x > f.box[2] + r || y < f.box[1] - r || y > f.box[3] + r) continue;
    for (const p of f.polys) for (const ring of p) for (let i = 1; i < ring.length; i++) { const d = segDist(x, y, ring[i - 1], ring[i]); if (d < bd) { bd = d; best = f; } }
  }
  return best;
}
const lower = s => String(s).trim().toLowerCase();
const uniq = a => [...new Set(a)];
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The country resolvers, built from VM's own tables (fixtures in the tests):
 *   national   national/data/index.json countries (iso3, iso2, name, region, qid, gw)
 *   names      analytics/lib/countries.js COUNTRIES rows [ISO3, ISO2, num, name, …spellings]
 *   focus      design/prp-focus.js PRPFocus (countryPlaces, countryBox), optional
 *   normaliseCountry  calendar/scripts/countries.mjs normaliseCountry, optional
 *   historical kino/data/iso.json historical {SUN: [...], YUG: [...], CSK: [...]}
 *   boundaries headlines/boundaries.json (TopoJSON, object "countries"), optional
 *   cshapes    battlefield/history/data/borders.topo.json (CShapes 2.0, object "borders"), optional
 */
export function makeResolvers({ national = [], names = [], focus = null, normaliseCountry = n => n, historical = {}, boundaries = null, cshapes = null } = {}) {
  const target = new Set([...national.map(c => c.iso3).filter(i => !TERRITORIES.has(i)), ...EXTRA_TARGET]);
  const nat = new Map(national.map(c => [c.iso3, c]));
  const nameRow = new Map(names.map(r => [r[0], r]));
  const name = iso => nameRow.get(iso)?.[3] || nat.get(iso)?.name || focus?.countryName?.(iso) || iso;
  const region = iso => (nat.get(iso)?.region || REGION_EXTRA[iso] || '').trim() || 'Other';
  const expand = c => (c == null ? [] : Array.isArray(c) ? c.flatMap(expand) : historical[c] ? [...historical[c]] : [c]);

  // Name → ISO3: VM's spellings table, then prp-focus's names and aliases, then the calendar's own spelling.
  const NAME = new Map();
  const addName = (n, iso) => { const k = lower(n); if (k && !NAME.has(k)) NAME.set(k, iso); };
  for (const [iso, , , ...ns] of names) ns.forEach(n => addName(n, iso));
  for (const c of national) addName(c.name, c.iso3);
  const places = focus ? focus.countryPlaces() : [...nameRow.values()].map(([iso, , , ...ns]) => ({ names: ns, targets: { countries: [iso] } }));
  for (const e of places) e.names.forEach(n => addName(n, e.targets.countries[0]));
  /** ISO3 (or a list, or a historical code) for a country name; null for a known supranational name; undefined if unknown. */
  function nameIso(raw) {
    let n = String(raw ?? '').trim();
    if (n.includes(' / ')) n = n.split(' / ').pop(); // the Retrospective's "Soviet Union / Russia": today's name is last
    for (const k of [lower(n), lower(normaliseCountry(n))]) {
      if (Object.hasOwn(NAME_OVERRIDE, k)) return NAME_OVERRIDE[k];
      if (NAME.has(k)) return NAME.get(k);
    }
    return undefined;
  }

  // Gleditsch–Ward → ISO3, with the two dated cases: the Soviet Union (365) and Yugoslavia (345).
  const GW = new Map();
  for (const c of national) if (c.gw != null) (GW.get(+c.gw) || GW.set(+c.gw, []).get(+c.gw)).push(c.iso3);
  for (const [k, v] of Object.entries(GW_EXTRA)) if (!GW.has(+k) || GW_OVERRIDE.has(+k)) GW.set(+k, [].concat(v));
  function gwIso(gw, date = '9999') {
    gw = +gw; const d = String(date);
    if (gw === 365) return d < '1991-12-26' && historical.SUN ? [...historical.SUN] : ['RUS'];
    if (gw === 345) return d < '1991-06-25' && historical.YUG ? [...historical.YUG] : d < '2006-06-03' ? ['SRB', 'MNE', 'XKX'] : ['SRB'];
    return GW.has(gw) ? [...GW.get(gw)] : null;
  }
  // A code that stood for one state that is several countries today (the Soviet Union before 1991, Yugoslavia,
  // Czechoslovakia, ...). Coverage counts it as every successor, as Kino draws it; the gap rules count it once, so that
  // the Soviet Union "taking part" in the Korean War is one entry, not fifteen, and a scene that draws any successor
  // draws the state. A successor still counts on its own wherever a battle or other point falls inside it.
  const STATE_NAME = { 365: 'the Soviet Union', 315: 'Czechoslovakia', 515: 'Ruanda-Urundi', 665: 'Mandatory Palestine', 730: 'Korea before its division', 827: 'Malaysia (with Singapore, 1963–1965)' };
  function gwGroup(gw, date = '9999') {
    const r = gwIso(gw, date); const list = r ? uniq(expand(r)) : [];
    if (list.length < 2) return null;
    gw = +gw;
    const label = gw === 345 ? (String(date) < '1991-06-25' ? 'Yugoslavia' : 'Serbia and Montenegro') : STATE_NAME[gw] || `the state with Gleditsch–Ward code ${gw}`;
    return { key: `gw${gw}:${list.join(',')}`, gw, name: label, successors: list };
  }

  const QID = new Map(national.filter(c => c.qid).map(c => [c.qid, [c.iso3]]));
  for (const [k, v] of Object.entries(QID_EXTRA)) if (!QID.has(k)) QID.set(k, [].concat(v));
  const qidIso = q => (QID.has(q) ? expand(QID.get(q)) : null);

  // Point → ISO3: the microstate dots, the headline shapes (Natural Earth 1:10m, 78 countries), then CShapes as at the
  // end of 2019 (every state); then the recognised-border corrections; then the nearest coast within `near` degrees
  // ("near"); then prp-focus's box for a country neither shape set has ("box"). Otherwise null.
  const HL = boundaries ? decodeTopo(boundaries, 'countries').map(f => ({ ...f, iso: f.props.iso3 || (f.props.code === 'XK' ? 'XKX' : null) })) : [];
  const CS_ALL = cshapes ? decodeTopo(cshapes, 'borders') : [];
  const CS = CS_ALL.filter(f => f.props.s <= '2019-12-31' && f.props.e > '2019-12-31').map(f => ({ ...f, iso: (gwIso(f.props.gw) || [null])[0] }));
  const earliest = gw => CS_ALL.filter(f => f.props.gw === gw).sort((a, b) => (a.props.s < b.props.s ? -1 : 1))[0] || null;
  const UKR91 = earliest(369), SYR_EARLY = earliest(652);
  const PAL = CS_ALL.filter(f => f.props.gw === 6511 || f.props.gw === 6631), ESHF = CS_ALL.filter(f => f.props.gw === 609);
  const shaped = new Set([...HL, ...CS].map(f => f.iso));
  const boxOnly = focus ? [...target].filter(c => !shaped.has(c)).map(c => [c, focus.countryBox(c)]).filter(([, b]) => b) : [];
  function pointIso(lon, lat, { near = 0.15 } = {}) {
    if (lon == null || lat == null || !Number.isFinite(+lon) || !Number.isFinite(+lat)) return null;
    lon = +lon; lat = +lat;
    for (const [iso, [x, y, r]] of Object.entries(DOTS)) if (Math.hypot(lon - x, lat - y) <= r) return { iso, how: 'dot' };
    const f = HL.find(f => inFeature(lon, lat, f)) || CS.find(f => inFeature(lon, lat, f));
    let iso = f?.iso;
    if (iso === 'RUS' && UKR91 && inFeature(lon, lat, UKR91)) iso = 'UKR';
    if (iso === 'ISR' && PAL.some(p => inFeature(lon, lat, p) || nearest(lon, lat, [p], 0.03))) iso = 'PSE';
    if (iso === 'ISR' && SYR_EARLY && inFeature(lon, lat, SYR_EARLY)) iso = 'SYR';
    if (iso === 'MAR' && ESHF.some(p => inFeature(lon, lat, p))) iso = 'ESH';
    if (iso) return { iso, how: 'in' };
    const n = nearest(lon, lat, HL, near) || nearest(lon, lat, CS, near);
    if (n?.iso) return { iso: n.iso, how: 'near' };
    for (const [c, [w, s, e, nn]] of boxOnly) if (lon >= w && lon <= e && lat >= s && lat <= nn) return { iso: c, how: 'box' };
    return null;
  }

  // Text → ISO3: whole names, written as given ("Turkey" the country, not "turkey" the bird), longest first so
  // "South Sudan" does not also count as "Sudan" (PRPFocus.matchPlaces's rule; here every occurrence of a longer name
  // is set aside, not only its first, so a second "South Sudan" cannot count as "Sudan" either). TEXT_RESERVED adds
  // longer names that contain a country's name and are not that country ("New Guinea" is an island, not Guinea).
  const nameRe = n => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'gu');
  const textNames = [
    ...places.flatMap(en => (en.names || []).filter(n => n && n.length >= 3).map(n => ({ n, iso: en.targets.countries[0], re: nameRe(n) }))),
    ...TEXT_RESERVED.map(([n, iso]) => ({ n, iso, re: nameRe(n) })),
  ].sort((a, b) => b.n.length - a.n.length);
  function textIso(text) {
    text = String(text || '');
    const taken = new Uint8Array(text.length), found = new Set();
    for (const { n, iso, re } of textNames) {
      if (!text.includes(n)) continue;
      re.lastIndex = 0;
      for (let m; (m = re.exec(text));) {
        const a = m.index, b = a + n.length;
        let free = true; for (let i = a; i < b; i++) if (taken[i]) { free = false; break; }
        if (!free) continue;
        taken.fill(1, a, b); if (iso) found.add(iso);
      }
    }
    return [...found];
  }

  const box = iso => focus?.countryBox?.(iso) || null;
  const iso2 = new Map(national.filter(c => c.iso2).map(c => [c.iso2, c.iso3]));
  for (const [iso, i2] of names) if (i2 && !iso2.has(i2)) iso2.set(i2, iso);
  const iso2Iso = c => iso2.get(String(c).toUpperCase()) || null;
  return { target, name, region, expand, nameIso, gwIso, gwGroup, qidIso, pointIso, textIso, box, iso2Iso, shapeless: () => boxOnly.map(([c]) => c) };
}

/* ------------------------------------------------------------------ pieces */
// A piece of content: { id, module, label, kind: content | reference | table, tiers: {tier: Map(iso → count)}, notes, parts }.
// reference = a site whose map is a record per country (Political Atlas, Political Retrospective, the Headline Tracker).
export function newPiece(id, module, label, kind = 'content') { return { id, module, label, kind, tiers: Object.fromEntries(TIERS.map(t => [t, new Map()])), notes: [], parts: [] }; }
export function add(piece, tier, codes, n = 1, R = null) {
  for (const c of R ? R.expand(codes) : [].concat(codes ?? [])) if (c) piece.tiers[tier].set(c, (piece.tiers[tier].get(c) || 0) + n);
}
export const covered = (piece, tiers = TIERS) => new Set(tiers.flatMap(t => [...piece.tiers[t].keys()]));
// The tiers that show a country belongs to a piece: any but named; a row only for a reference site.
export const substantive = piece => new Set([...covered(piece, [...SUBSTANTIVE]), ...(piece.kind === 'reference' ? piece.tiers.row.keys() : [])]);

/** Kino: the countries a scene draws (map), the places it marks (point), and its link, read with kino/lib/links.js. */
export function kinoScene(scene, R) {
  const v = scene.visual || {}, f = scene.focus || {};
  const map = new Set(R.expand([...(f.countries || []), ...(v.groups || []).flatMap(g => g.countries || [])]));
  // An arrow's via point is where the stage bends it (kino/lib/stage.js), so the arrow is drawn across that place too.
  const marks = [...(f.points || []), ...(v.arrows || []).flatMap(a => [a.from, a.via, a.to])].filter(p => Array.isArray(p) && p.length >= 2);
  const point = new Set(), unplaced = [];
  for (const p of marks) { const r = R.pointIso(p[0], p[1]); r ? point.add(r.iso) : unplaced.push(p.slice(0, 2)); }
  const text = [scene.title, scene.narration, v.caption, v.heading, v.sub, ...(v.data || []).map(x => x.label), ...(v.events || []).map(x => x.label), ...(f.points || []).map(p => p[2])].filter(Boolean).join(' ');
  return { id: scene.id, title: scene.title || '', kind: v.kind || null, map, point, unplaced, bbox: Array.isArray(f.bbox) ? f.bbox : null, link: scene.link || null, text };
}

/**
 * Kino films. ctx: { flatScenes, readAt } from kino/lib, and lookups for links: wfWars (War Focus id → war), rbWars
 * (Retrospective Battlefield id → war), polities (Kardashev id → ISO3), inventions (Invention Timeline id → ISO3).
 */
export function kinoFilms(docs, R, ctx) {
  const films = [], pieces = [];
  for (const { meta, doc } of docs) {
    const id = `kino:${meta.category}/${meta.id}`;
    const p = newPiece(id, `kino-${meta.category}`, `Kino · ${doc.title || meta.title}`);
    const scenes = ctx.flatScenes(doc).map(s => kinoScene(s, R));
    const wars = { wf: new Set(), rb: new Set() }, links = [];
    let text = [doc.title, doc.summary].filter(Boolean).join(' ');
    for (const s of scenes) {
      s.map.forEach(c => add(p, 'map', c));
      s.point.forEach(c => add(p, 'point', c));
      text += ' ' + s.text;
      if (!s.link) continue;
      let at = {}; try { at = ctx.readAt(s.link) || {}; } catch { at = {}; }
      const m = s.link.module; s.at = at;
      links.push({ scene: s.id, module: m, at });
      if ((m === 'atlas' || m === 'pestle') && at.country) add(p, 'linked', String(at.country).toUpperCase());
      if ((m === 'retrospective' || m === 'battlefield-history') && at.c) add(p, 'linked', R.gwIso(at.c, `${at.y || 9999}-07-01`), 1, R);
      if (m === 'encyclopedia' && at.qid) add(p, 'linked', R.qidIso(at.qid));
      if (m === 'kardashev' && at.p && ctx.polities?.get(at.p)) add(p, 'linked', ctx.polities.get(at.p));
      if (m === 'progress' && at.e && ctx.inventions?.get(at.e)) add(p, 'linked', ctx.inventions.get(at.e));
      if (m === 'war-focus' && at.war) wars.wf.add(at.war);
      if (m === 'battlefield-history' && at.w) wars.rb.add(at.w);
    }
    // A film about a war is about that war even where no scene links to it. Its own wars are the ones the war-film rule
    // checks: every war a film in the Wars category links to, or a war that is any other film's subject. (A biography
    // that visits the Second World War in one scene is checked scene by scene, not against the whole war.)
    const own = { wf: new Set(), rb: new Set() };
    for (const subj of doc.subjects || []) for (const [wid, w] of ctx.wfWars || []) if (w.qid && w.qid === subj.qid) { wars.wf.add(wid); own.wf.add(wid); }
    for (const wid of wars.wf) { const bf = ctx.wfWars?.get(wid)?.bf; if (bf) { wars.rb.add(bf); if (own.wf.has(wid)) own.rb.add(bf); } }
    if (meta.category === 'wars') { wars.wf.forEach(x => own.wf.add(x)); wars.rb.forEach(x => own.rb.add(x)); }
    R.textIso(text).forEach(c => add(p, 'named', c));
    const unplaced = scenes.flatMap(s => s.unplaced.map(pt => `${s.id} ${pt.join(', ')}`));
    if (unplaced.length) p.notes.push(`${unplaced.length} scene marker${unplaced.length === 1 ? '' : 's'} at sea or off the shapes: ${unplaced.join('; ')}.`);
    films.push({ id, meta, title: doc.title || meta.title, scenes, wars: { wf: [...wars.wf], rb: [...wars.rb] }, own: { wf: [...own.wf], rb: [...own.rb] }, links });
    pieces.push(p);
  }
  return { films, pieces };
}

const monthEnd = m => `${m}-31`;
const overlaps = (from, to, a, b) => (!from || from <= b) && (!to || to >= a);

/** War Focus: belligerents (sides, theatre, control at their dates) and the countries its battles and UCDP cells fall in. */
export function warFocusWar(w, R) {
  // bel: every present-day country (a historical state as its successors), for coverage and war-sides; belDirect and
  // belGroups keep the two apart for the war-film rule, which counts a historical state once.
  const bel = new Map(), belDirect = new Map(), belGroups = new Map(), pt = new Map(), battlesIn = new Map(), battleIso = new Map();
  const unknownGw = new Set();
  const addGw = (gw, date) => {
    const d = date || w.start, r = R.gwIso(gw, d); if (!r) { unknownGw.add(gw); return; }
    for (const c of R.expand(r)) bel.set(c, (bel.get(c) || 0) + 1);
    const g = R.gwGroup?.(gw, d);
    if (g) belGroups.set(g.key, g); else for (const c of R.expand(r)) belDirect.set(c, (belDirect.get(c) || 0) + 1);
  };
  for (const k of ['a', 'b']) for (const s of w.sides?.[k]?.states || []) addGw(s.gw, s.from);
  for (const g of w.theatre || []) addGw(g, w.start);
  for (const c of w.control || []) addGw(c.gw, c.from);
  let points = 0, unplaced = 0, near = 0;
  const hit = (lon, lat, battle) => {
    points++;
    const r = R.pointIso(lon, lat); if (!r) { unplaced++; return null; }
    if (r.how === 'near') near++;
    pt.set(r.iso, (pt.get(r.iso) || 0) + 1);
    if (battle) { if (r.how !== 'near') battlesIn.set(r.iso, (battlesIn.get(r.iso) || 0) + 1); (battleIso.get(r.iso) || battleIso.set(r.iso, []).get(r.iso)).push(battle); }
    return r.iso;
  };
  for (const b of w.battles || []) if (b.lat != null && b.lon != null) hit(b.lon, b.lat, b);
  const cells = Array.isArray(w.cells) ? w.cells : Object.values(w.cells || {});
  for (const m of cells) for (const c of m || []) hit(c[1], c[0], null);
  return { id: w.id, name: w.name, qid: w.qid, bf: w.bf || null, start: w.start, end: w.end, belligerent: bel, belDirect, belGroups, point: pt, battlesIn, battleIso, points, unplaced, near, unknownGw: [...unknownGw], raw: w };
}

/** War Focus at one month: where the battles under way that month, and that month's UCDP cells, fall. */
export function warFocusMoment(war, m) {
  const w = war.raw, a = `${m}-01`, b = monthEnd(m);
  const places = [];
  for (const bt of w.battles || []) if (bt.lat != null && bt.lon != null && overlaps(bt.s, bt.e || bt.s, a, b)) places.push({ lon: bt.lon, lat: bt.lat, label: bt.n });
  const i = (w.months || []).indexOf(m);
  const cells = Array.isArray(w.cells) ? w.cells : Object.values(w.cells || {});
  if (i >= 0) for (const c of cells[i] || []) places.push({ lon: c[1], lat: c[0], label: 'UCDP events' });
  return { places, fought: new Set() };
}

/** Retrospective Battlefield: where each war was fought, year by year (locYears[y] or loc), and who took part (states). */
// fought and part hold every present-day country (coverage); foughtDirect, partDirect and groups keep a historical
// state apart (the gap rules count it once: see gwGroup).
export function retroWar(w, R) {
  const fought = new Map(), part = new Map(), foughtDirect = new Map(), partDirect = new Map(), groups = new Map(), unknownGw = new Set();
  const take = (g, y, all, direct, kind) => {
    const d = `${y}-07-01`, r = R.gwIso(g, d); if (!r) { unknownGw.add(g); return; }
    for (const c of R.expand(r)) all.set(c, (all.get(c) || 0) + 1);
    const gr = R.gwGroup?.(g, d);
    if (gr) { const x = groups.get(gr.key) || groups.set(gr.key, { ...gr, fought: 0, part: 0 }).get(gr.key); x[kind]++; }
    else for (const c of R.expand(r)) direct.set(c, (direct.get(c) || 0) + 1);
  };
  for (const [y] of w.years || []) {
    for (const g of w.locYears?.[y] || w.loc || []) take(g, y, fought, foughtDirect, 'fought');
    for (const g of w.states || []) take(g, y, part, partDirect, 'part');
  }
  return { id: w.id, name: w.name, fought, part, foughtDirect, partDirect, groups, unknownGw: [...unknownGw], raw: w };
}
/** Retrospective Battlefield in one year: the countries fought over, and the historical states fought over (kept whole). */
export function retroMoment(war, y, R) {
  const w = war.raw, d = `${y}-07-01`, fought = new Set(), states = [];
  for (const g of w.locYears?.[y] || w.loc || []) {
    const gr = R.gwGroup?.(g, d);
    if (gr) states.push(gr); else for (const c of R.expand(R.gwIso(g, d) || [])) fought.add(c);
  }
  return { fighting: new Set(), places: [], fought, states };
}

/* ------------------------------------------------------------------ gap rules */
const inBox = (lon, lat, [w, s, e, n]) => lat >= s && lat <= n && ((lon >= w && lon <= e) || (lon + 360 >= w && lon + 360 <= e));
/** The share of a country's box that lies inside a view box (0–1). */
export function boxShare(b, v) {
  if (!b || !v) return 0;
  const area = (b[2] - b[0]) * (b[3] - b[1]); if (area <= 0) return 0;
  const w = Math.max(b[0], v[0]), e = Math.min(b[2], v[2]), s = Math.max(b[1], v[1]), n = Math.min(b[3], v[3]);
  return w < e && s < n ? ((e - w) * (n - s)) / area : 0;
}
export const VIEW_SHARE = 0.2;

/** war-scene: the countries fighting inside a scene's view at the moment it links to, that it leaves grey. */
export function sceneGap(scene, moment, R) {
  if (!scene.bbox) return null;
  const inView = new Map(); // iso → why
  for (const p of moment.places) if (inBox(p.lon, p.lat, scene.bbox)) { const r = R.pointIso(p.lon, p.lat); if (r && r.how !== 'near') { const why = inView.get(r.iso) || []; if (why.length < 3 && p.label && !why.includes(p.label)) why.push(p.label); inView.set(r.iso, why); } }
  for (const c of moment.fought) if (!inView.has(c) && boxShare(R.box(c), scene.bbox) >= VIEW_SHARE) inView.set(c, ['fought over that year']);
  const shown = new Set([...scene.map, ...scene.point]);
  const missing = [...inView.keys()].filter(c => !shown.has(c) && (R.target.has(c) || KEEP.has(c))).sort();
  // A historical state fought over that year is one country here: the scene shows it if it draws any successor, and it
  // is in view if a fifth of the box round all its successors is (so Moldova's corner does not make the Soviet Union's
  // war "in view" of a Mediterranean scene).
  const states = [];
  for (const st of moment.states || []) {
    if (st.successors.some(c => shown.has(c) || inView.has(c))) continue;
    const boxes = st.successors.map(c => R.box(c)).filter(Boolean);
    if (!boxes.length) continue;
    const u = [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
    if (boxShare(u, scene.bbox) >= VIEW_SHARE) states.push({ code: st.key, name: st.name, successors: st.successors, why: ['fought over that year'] });
  }
  return { scene: scene.id, title: scene.title, missing, why: Object.fromEntries(missing.map(c => [c, inView.get(c)])), states };
}

/** war-film and war-scene, for every Kino film that links to a war. */
export function warFilmGaps(films, filmPieces, { wf, rb, masterBattles = new Map() }, R) {
  const gaps = [];
  for (const film of films) {
    if (!film.wars.wf.length && !film.wars.rb.length) continue;
    const piece = filmPieces.get(film.id);
    const shown = new Set([...piece.tiers.map.keys(), ...piece.tiers.point.keys()]);
    const named = new Set(piece.tiers.named.keys());
    const ev = new Map(); // iso → Map(piece id → why)
    const note = (iso, pid, why) => { if (!(R.target.has(iso) || KEEP.has(iso))) return; const m = ev.get(iso) || ev.set(iso, new Map()).get(iso); m.set(pid, why); };
    // Historical states (see gwGroup) are noted once each, keyed by the state, not once per successor.
    const sev = new Map(); // state key → { state, ev: Map(piece id → why) }
    const noteState = (st, pid, why) => { const x = sev.get(st.key) || sev.set(st.key, { state: st, ev: new Map() }).get(st.key); if (!x.ev.has(pid)) x.ev.set(pid, why); };
    const own = film.own || film.wars;
    for (const id of own.wf) {
      const w = wf.get(id); if (!w) continue;
      for (const [c] of w.belDirect || w.belligerent) note(c, `war-focus:${id}`, 'on a side');
      for (const st of (w.belGroups || new Map()).values()) noteState(st, `war-focus:${id}`, 'on a side');
      // A battle place counts unless the country is itself on a side (a successor of a state on a side still counts).
      for (const [c, n] of w.point) if (!(w.belDirect || w.belligerent).has(c)) note(c, `war-focus:${id}`, `${n} battle or event place${n === 1 ? '' : 's'}`);
      for (const [c, list] of w.battleIso) if (masterBattles.size && list.some(b => b.q && masterBattles.has(b.q))) note(c, 'master-index', 'battle entries');
    }
    for (const id of own.rb) {
      const w = rb.get(id); if (!w) continue;
      const fd = w.foughtDirect || w.fought, pd = w.partDirect || w.part;
      for (const [c] of fd) note(c, `retrospective-battlefield:${id}`, 'fought there');
      for (const [c] of pd) if (!fd.has(c)) note(c, `retrospective-battlefield:${id}`, 'took part');
      for (const st of (w.groups || new Map()).values()) noteState(st, `retrospective-battlefield:${id}`, st.fought ? 'fought there' : 'took part');
    }
    const missing = [...ev.keys()].filter(c => !shown.has(c)).sort();
    // A state the film draws in part (any successor) is shown; one whose every successor is already listed on its own
    // adds nothing.
    const states = [...sev.values()].filter(({ state }) => !state.successors.some(c => shown.has(c)) && !state.successors.every(c => ev.has(c)))
      .map(({ state, ev: e }) => ({ code: state.key, name: state.name, successors: state.successors, evidence: Object.fromEntries(e) }));
    const scenes = [];
    for (const s of film.scenes) {
      if (s.kind !== 'map' || !s.link || !s.at) continue;
      let moment = null;
      if (s.link.module === 'war-focus' && wf.get(s.at.war) && /^\d{4}-\d{2}$/.test(s.at.m || '')) moment = warFocusMoment(wf.get(s.at.war), s.at.m);
      if (s.link.module === 'battlefield-history' && rb.get(s.at.w) && s.at.y) moment = retroMoment(rb.get(s.at.w), String(s.at.y), R);
      const g = moment && sceneGap(s, moment, R);
      if (g && (g.missing.length || g.states.length)) scenes.push({ ...g, link: s.link.label || s.link.at });
    }
    if (!missing.length && !states.length && !scenes.length) continue;
    const evidence = Object.fromEntries(missing.map(c => [c, Object.fromEntries(ev.get(c))]));
    const isOwn = own.wf.length + own.rb.length > 0;
    gaps.push({
      rule: isOwn ? 'war-film' : 'war-scene', piece: film.id,
      title: isOwn ? `${film.title}: countries of its war the film never shows` : `${film.title}: scenes that leave grey a country fighting in view`,
      wars: own, countries: missing, named: missing.filter(c => named.has(c)), evidence, states, scenes,
      weight: missing.reduce((a, c) => a + ev.get(c).size, 0) + states.reduce((a, s) => a + Object.keys(s.evidence).length, 0) + scenes.reduce((a, s) => a + s.missing.length + s.states.length, 0),
    });
  }
  return gaps;
}

/** war-sides: War Focus wars whose battles fall in countries on no side, and wars with no country at all. */
export function warSideGaps(wars, R, { minBattles = 2 } = {}) {
  const gaps = [];
  for (const w of wars) {
    if (!w.belligerent.size) gaps.push({ rule: 'war-sides', piece: `war-focus:${w.id}`, title: `${w.name}: no country on either side, in the theatre or in control`, countries: [...w.point.keys()].filter(c => R.target.has(c)).sort(), evidence: {}, weight: Math.max(1, w.point.size) });
    const off = [...w.battlesIn].filter(([c, n]) => n >= minBattles && !w.belligerent.has(c) && (R.target.has(c) || KEEP.has(c))).sort((a, b) => b[1] - a[1]);
    if (w.belligerent.size && off.length) gaps.push({ rule: 'war-sides', piece: `war-focus:${w.id}`, title: `${w.name}: battles in countries that are on neither side`, countries: off.map(([c]) => c),
      evidence: Object.fromEntries(off.map(([c, n]) => [c, { [`war-focus:${w.id}`]: `${n} battles`, ...(w.battleIso.get(c) ? { battles: w.battleIso.get(c).slice(0, 4).map(b => b.n).join('; ') } : {}) }])), weight: off.length });
  }
  return gaps;
}

/** Which pieces cover each country, and how: iso → { pieceId: [tiers] }. */
export function countryCoverage(pieces) {
  const by = new Map();
  for (const p of pieces) for (const t of TIERS) for (const c of p.tiers[t].keys()) { const m = by.get(c) || by.set(c, {}).get(c); (m[p.id] ||= []).push(t); }
  return by;
}
/** The class of a country's coverage: content, text (named only), tables (rows only) or none. */
export function coverageClass(entry, pieceById) {
  let text = false, table = false;
  for (const [pid, tiers] of Object.entries(entry || {})) {
    const p = pieceById.get(pid);
    if (tiers.some(t => SUBSTANTIVE.has(t)) || (p?.kind === 'reference' && tiers.includes('row'))) return 'content';
    if (tiers.includes('named')) text = true;
    if (tiers.includes('row')) table = true;
  }
  return text ? 'text' : table ? 'tables' : 'none';
}

/** scope: the countries a reference site lacks, with every other piece that covers each one. */
export function scopeGap(ref, pieces, R) {
  const has = new Set(ref.tiers.row.keys());
  const others = pieces.filter(p => p.kind !== 'reference' && p.kind !== 'table');
  const missing = [...R.target].filter(c => !has.has(c));
  const evidence = {};
  for (const c of missing) evidence[c] = others.filter(p => substantive(p).has(c)).map(p => p.id);
  missing.sort((a, b) => evidence[b].length - evidence[a].length || (a < b ? -1 : 1));
  return { rule: 'scope', piece: ref.id, title: `${ref.label}: ${missing.length} countries it has no record for`, countries: missing, evidence, weight: missing.reduce((a, c) => a + evidence[c].length, 0) };
}

/** calendar: countries with calendar events and no Political Atlas record. */
export function calendarGap(cal, atlas, R) {
  const rows = [...cal.byCountry].filter(([c]) => R.target.has(c) && !atlas.has(c)).map(([c, x]) => ({ iso: c, ...x }))
    .sort((a, b) => b.upcomingBallots - a.upcomingBallots || b.contemporary - a.contemporary || b.events - a.events);
  return { rule: 'calendar', piece: 'political-atlas', title: `Calendar countries with events and no Political Atlas record`, countries: rows.map(r => r.iso), rows,
    evidence: Object.fromEntries(rows.map(r => [r.iso, { 'historical-calendar': `${r.events} events`, ...(r.contemporary ? { 'realtime-calendar': `${r.contemporary} events, ${r.upcomingBallots} upcoming ballots` } : {}) }])),
    weight: rows.reduce((a, r) => a + (r.contemporary ? 2 : 1), 0) };
}

/** thin-index: countries with few Master Index entries tagged to them, with the content that covers them. */
export function thinIndexGap(master, pieces, R, { max = 5 } = {}) {
  const others = pieces.filter(p => p.kind === 'content' && p.id !== master.id);
  const rows = [...R.target].map(c => [c, master.tiers.tagged.get(c) || 0]).filter(([, n]) => n <= max);
  const evidence = Object.fromEntries(rows.map(([c, n]) => [c, { 'master-index': `${n} tagged entr${n === 1 ? 'y' : 'ies'}`, pieces: others.filter(p => substantive(p).has(c)).map(p => p.id) }]));
  rows.sort((a, b) => evidence[b[0]].pieces.length - evidence[a[0]].pieces.length || a[1] - b[1]);
  return { rule: 'thin-index', piece: 'master-index', title: `Countries with ${max} or fewer Master Index entries tagged to them`, countries: rows.map(([c]) => c), evidence, weight: rows.reduce((a, [c]) => a + evidence[c].pieces.length, 0) };
}

/** Old-scope wording: the lines that state the 78-country scope. files: [{ path, text }]. */
export const SCOPE_PATTERNS = [/\b78 countries\b/i, /\b78[- ]country\b/i,/\bof the 78\b/i, /\bsame 78\b/i, /Europe, North America(?:,| and) (?:China|the major powers|Russia)/i, /\bthe major powers\b.*\b(?:Europe|North America)\b/i];
export function scopeTextGaps(files) {
  const hits = [];
  for (const { path, text } of files) text.split(/\r?\n/).forEach((line, i) => {
    const m = SCOPE_PATTERNS.map(re => re.exec(line)).find(Boolean);
    if (!m) return;
    // The words round the match (a minified JSON file is one long line).
    const a = Math.max(0, m.index - 70), b = Math.min(line.length, m.index + m[0].length + 70);
    hits.push({ path, line: i + 1, text: `${a ? '…' : ''}${line.slice(a, b).trim()}${b < line.length ? '…' : ''}` });
  });
  return hits;
}

/** Ranks gaps by weight, those weighed by content first and the plain counts (COUNT_UNIT) after; sets each gap's unit. */
export const COUNT_UNIT = { 'dead-link': 'one per country, territory or link', 'scope-text': 'one per file' };
export function rankGaps(gaps) {
  for (const g of gaps) g.unit = COUNT_UNIT[g.rule] ? 'count' : 'content';
  return gaps.sort((a, b) => (a.unit === b.unit ? 0 : a.unit === 'content' ? -1 : 1) || b.weight - a.weight || (a.piece < b.piece ? -1 : 1));
}

/* ------------------------------------------------------------------ the whole model (real data) */
const isMain = () => { try { return import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href; } catch { return false; } };

function argValue(args, name) {
  const i = args.findIndex(a => a === name || a.startsWith(name + '='));
  if (i < 0) return null;
  return args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1] || null;
}
const firstDir = (...ds) => ds.find(d => d && existsSync(d)) || null;
// A file in a synced folder (OneDrive) can fail to open for a moment with "UNKNOWN"; try again before giving up.
function readText(path) {
  for (let i = 0; ; i++) {
    try { return readFileSync(path, 'utf8'); } catch (e) {
      if (i >= 4 || e.code === 'ENOENT') throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (i + 1));
    }
  }
}
const addMonths = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Reads every source and builds the pieces, the per-country coverage and the gaps. */
export async function buildModel({ root, atlasDir, retroDir, today = new Date().toISOString().slice(0, 10), log = () => {} }) {
  const J = p => JSON.parse(readText(join(root, p)));
  const T = p => readText(join(root, p));
  const imp = p => import(pathToFileURL(join(root, p)).href);
  const t0 = Date.now();
  const national = J('national/data/index.json').countries;
  const { COUNTRIES: names } = await imp('analytics/lib/countries.js');
  await imp('design/prp-focus.js');
  const focus = globalThis.PRPFocus;
  const cal = await imp('calendar/scripts/countries.mjs');
  const historical = J('kino/data/iso.json').historical;
  const R = makeResolvers({ national, names, focus, normaliseCountry: cal.normaliseCountry, historical, boundaries: J('headlines/boundaries.json'), cshapes: J('battlefield/history/data/borders.topo.json') });
  const rel = d => (d ? relative(root, d).split(sep).join('/') || '.' : null);
  const sources = { root: '.', atlas: rel(atlasDir), retrospective: rel(retroDir), today };
  const pieces = [];
  const checks = [];
  // The calendar's country list is VM's other statement of the target: the two must agree (Western Sahara aside).
  const calTarget = new Set(cal.COUNTRIES.flatMap(n => [].concat(R.nameIso(n) || [])).filter(c => c !== 'ESH'));
  const diff = [...R.target].filter(c => !calTarget.has(c)).concat([...calTarget].filter(c => !R.target.has(c)));
  checks.push({ check: 'target equals the calendar country list (Western Sahara aside)', ok: !diff.length, detail: diff.join(' ') || `${R.target.size} countries` });

  // War Focus
  const wfIndex = J('battlefield/focus/data/index.json');
  const wfList = wfIndex.wars.map(m => warFocusWar(J(`battlefield/focus/data/wars/${m.id}.json`), R));
  const wf = new Map(wfList.map(w => [w.id, w]));
  const wfPiece = newPiece('war-focus', 'war-focus', 'War Focus');
  for (const w of wfList) {
    for (const [c, n] of w.belligerent) add(wfPiece, 'belligerent', c, n);
    for (const [c, n] of w.point) add(wfPiece, 'point', c, n);
    wfPiece.parts.push({ id: `war-focus:${w.id}`, label: w.name, belligerent: [...w.belligerent.keys()].sort(), point: [...w.point.keys()].sort(), places: w.points, unplaced: w.unplaced, near: w.near });
  }
  wfPiece.notes.push(`${wfList.length} wars; ${wfList.reduce((a, w) => a + w.points, 0)} battle and event places, ${wfList.reduce((a, w) => a + w.unplaced, 0)} at sea or unplaced, ${wfList.reduce((a, w) => a + w.near, 0)} placed by the nearest coast.`);
  const unknownWf = uniq(wfList.flatMap(w => w.unknownGw)); if (unknownWf.length) wfPiece.notes.push(`Unknown Gleditsch–Ward codes: ${unknownWf.join(' ')}`);
  pieces.push(wfPiece);
  log(`War Focus ${Date.now() - t0} ms`);

  // Retrospective Battlefield
  const rbList = J('battlefield/history/data/wars.json').wars.map(w => retroWar(w, R));
  const rb = new Map(rbList.map(w => [w.id, w]));
  const rbPiece = newPiece('retrospective-battlefield', 'battlefield-history', 'Retrospective Battlefield');
  for (const w of rbList) {
    for (const [c] of w.fought) add(rbPiece, 'belligerent', c);
    for (const [c] of w.part) if (!w.fought.has(c)) add(rbPiece, 'belligerent', c);
    rbPiece.parts.push({ id: `retrospective-battlefield:${w.id}`, label: w.name, foughtIn: [...w.fought.keys()].sort(), participants: [...w.part.keys()].sort() });
  }
  rbPiece.notes.push(`${rbList.length} wars; "belligerent" here joins where each war was fought (locYears or loc) and the states that took part; the parts keep them apart.`);
  const unknownRb = uniq(rbList.flatMap(w => w.unknownGw)); if (unknownRb.length) rbPiece.notes.push(`Unknown Gleditsch–Ward codes: ${unknownRb.join(' ')}`);
  pieces.push(rbPiece);

  // Realtime Battlefield
  const rt = J('battlefield/data/realtime.json');
  const rtPiece = newPiece('realtime-battlefield', 'battlefield', 'Realtime Battlefield');
  const rtNames = uniq(rt.wars.flatMap(w => w.countries || []));
  for (const w of rt.wars) for (const n of w.countries || []) add(rtPiece, 'belligerent', R.nameIso(n), 1, R);
  let rtPts = 0, rtOff = 0;
  for (const w of rt.wars) for (const p of w.points || []) { rtPts++; const r = R.pointIso(p[1], p[0]); r ? add(rtPiece, 'point', r.iso) : rtOff++; }
  const rtUnknown = rtNames.filter(n => R.nameIso(n) === undefined);
  rtPiece.notes.push(`${rt.wars.length} wars, months ${rt.months[0]} to ${rt.months.at(-1)}; ${rtNames.length} UCDP country names${rtUnknown.length ? ` (unknown: ${rtUnknown.join(', ')})` : ''}; ${rtPts} points, ${rtOff} unplaced. UCDP files Gaza under Israel, so Palestine shows only by its points.`);
  pieces.push(rtPiece);

  // Calendars: the Realtime Calendar shows six months back to eighteen ahead; the Historical Calendar 1980 to today.
  const calFiles = readdirSync(join(root, 'calendar/data')).filter(f => /^\d{4}s\.json$/.test(f)).sort();
  const events = calFiles.flatMap(f => J(`calendar/data/${f}`).events || []);
  const [ca, cb] = [addMonths(today, -6), addMonths(today, 18)];
  const rcPiece = newPiece('realtime-calendar', 'calendar', 'Realtime Calendar'), hcPiece = newPiece('historical-calendar', 'historical-calendar', 'Historical Calendar');
  const byCountry = new Map(); let supra = 0; const calUnknown = new Set();
  for (const e of events) {
    const m = /political-atlas\.pages\.dev\/#([A-Z]{3})/.exec(e.source || '');
    const raw = m ? m[1] : R.nameIso(e.country);
    if (raw === undefined) { calUnknown.add(e.country); continue; }
    if (raw === null) { supra++; continue; }
    for (const c of R.expand(raw)) {
      const x = byCountry.get(c) || byCountry.set(c, { events: 0, contemporary: 0, upcomingBallots: 0, fromAtlas: 0, name: e.country }).get(c);
      x.events++;
      if (m) x.fromAtlas++;
      if (e.date >= ca && e.date <= cb) { x.contemporary++; add(rcPiece, 'tagged', c); }
      if (e.date >= '1980-01-01' && e.date <= today) add(hcPiece, 'tagged', c);
      if (e.date >= today && /^(election|referendum)$/.test(e.type)) x.upcomingBallots++;
    }
  }
  hcPiece.notes.push(`${events.length} events in ${calFiles.length} decade files; ${supra} international or EU events have no country${calUnknown.size ? `; unknown names: ${[...calUnknown].join(', ')}` : ''}.`);
  rcPiece.notes.push(`Events from ${ca} to ${cb}, as q/calendar.html shows them on ${today}.`);
  pieces.push(rcPiece, hcPiece);

  // Kardashev Tracker (each polity's capital) and Invention Timeline (each invention's place, its people's citizenship)
  const energy = J('kardashev/data/energy.json');
  const kdPiece = newPiece('kardashev', 'kardashev', 'Kardashev Tracker');
  const polities = new Map();
  const SUPRANATIONAL_POLITIES = new Set(['eec']); // the European Economic Community: its capital is Brussels, not Belgium's
  for (const p of energy.polities) { if (SUPRANATIONAL_POLITIES.has(p.id)) continue; const r = R.pointIso(p.lon, p.lat, { near: 0.5 }); if (r) { polities.set(p.id, r.iso); add(kdPiece, 'point', r.iso); } }
  kdPiece.notes.push(`${energy.polities.length} polities placed by their capital ("core"); an empire's other lands are not counted.`);
  pieces.push(kdPiece);
  const prog = J('science/progress/data/events.json');
  const ivPiece = newPiece('invention-timeline', 'progress', 'Invention Timeline');
  const inventions = new Map(); let ivOff = 0;
  for (const ev of prog.events) {
    const p = ev.place; const r = p && (R.pointIso(p.lon, p.lat) || R.pointIso(p.lon, p.lat, { near: 0.5 }));
    if (r) { inventions.set(ev.id, r.iso); add(ivPiece, 'point', r.iso); } else ivOff++;
  }
  const cit = new Map();
  for (const person of Object.values(prog.people || {})) for (const n of person.country || []) { const c = R.nameIso(n); if (c) add(ivPiece, 'tagged', c, 1, R); else cit.set(n, (cit.get(n) || 0) + 1); }
  ivPiece.notes.push(`${prog.events.length} inventions, ${ivOff} with no country (at sea or in Antarctica); ${cit.size} citizenship labels are historical states with no present-day mapping (largest: ${[...cit].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, k]) => `${n} ${k}`).join(', ')}).`);
  pieces.push(ivPiece);

  // Kino
  const { flatScenes } = await imp('kino/lib/format.js');
  const { readAt } = await imp('kino/lib/links.js');
  const kIndex = J('kino/data/index.json');
  const docs = kIndex.docs.map(meta => ({ meta, doc: J('kino/data/' + String(meta.path).replace(/^(kino\/)?(data\/)?/, '')) }));
  const kino = kinoFilms(docs, R, { flatScenes, readAt, wfWars: new Map(wfList.map(w => [w.id, { qid: w.qid, bf: w.bf }])), rbWars: rb, polities, inventions });
  pieces.push(...kino.pieces);
  log(`Kino ${Date.now() - t0} ms`);

  // Master Index: an entity's countries are, in order, itself (a country), its Country / Citizenship / Jurisdiction
  // links, the Retrospective pages it is mentioned on (y=…&c=<GW>), or for a battle the place War Focus gives it.
  const miPiece = newPiece('master-index', 'encyclopedia', 'Master Index');
  const battleQ = new Map();
  for (const w of wfList) for (const b of w.raw.battles || []) if (b.q && b.lat != null && b.lon != null) battleQ.set(b.q, [b.lon, b.lat]);
  const relQ = v => (Array.isArray(v) ? v : [v]).map(x => (Array.isArray(x) ? x[0] : typeof x === 'string' ? x : x?.q)).filter(q => /^Q\d+$/.test(q || ''));
  const steps = { self: 0, rel: 0, retrospective: 0, battle: 0, none: 0 }; const noneByType = {}; const masterQ = new Set();
  for (const f of readdirSync(join(root, 'lake/data/e')).filter(f => /^\d+\.json$/.test(f))) for (const [q, e] of Object.entries(J(`lake/data/e/${f}`))) {
    masterQ.add(q);
    const self = R.qidIso(q);
    if (self) { steps.self++; add(miPiece, 'row', self); continue; }
    let iso = ['Country', 'Citizenship', 'Jurisdiction'].flatMap(k => relQ(e.rel?.[k] || [])).flatMap(x => R.qidIso(x) || []), how = 'rel';
    if (!iso.length) { iso = (e.mentions || []).flatMap(m => { const mm = /[#&?]y=(-?\d+)&c=(\d+)/.exec(m.u || ''); return mm ? R.gwIso(mm[2], `${mm[1]}-07-01`) || [] : []; }); how = 'retrospective'; }
    if (!iso.length && battleQ.has(q)) { const r = R.pointIso(...battleQ.get(q), { near: 0.5 }); iso = r ? [r.iso] : []; how = 'battle'; }
    if (!iso.length) { steps.none++; noneByType[e.type] = (noneByType[e.type] || 0) + 1; continue; }
    steps[how]++;
    add(miPiece, 'tagged', uniq(R.expand(iso)));
  }
  miPiece.notes.push(`${masterQ.size} entities: ${steps.self} are countries, ${steps.rel} tagged by their Country, Citizenship or Jurisdiction, ${steps.retrospective} by Retrospective links, ${steps.battle} by a War Focus battle's place; ${steps.none} have no country (${Object.entries(noneByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ')}).`);
  pieces.push(miPiece);
  log(`Master Index ${Date.now() - t0} ms`);

  // Text-only content: the four briefings, the six courses, Bibliotheca's books.
  const named = (id, module, label, texts) => { const p = newPiece(id, module, label); const n = new Map(); for (const t of texts) for (const c of R.textIso(t)) n.set(c, (n.get(c) || 0) + 1); for (const [c, k] of n) add(p, 'named', c, k); pieces.push(p); return p; };
  const pb = J('briefing/data/latest.json');
  named('briefing-political', 'briefing', 'Political Briefing', pb.items.map(i => [i.t, i.d].filter(Boolean).join(' '))).notes.push(`${pb.items.length} items; its sources' countries are publishers' homes (${uniq(pb.sources.map(s => s.country)).join(', ')}), not coverage.`);
  for (const [k, label] of [['science', 'Scientific Briefing'], ['econ', 'Economics Briefing'], ['digital', 'Digital Briefing']]) {
    const s = J(`${k}/briefing/data/stories.json`);
    named(`briefing-${k}`, `${k}-briefing`, label, (s.items || []).map(i => [i.title, i.summary].filter(Boolean).join(' '))).notes.push(`${(s.items || []).length} stories.`);
  }
  for (const f of readdirSync(join(root, 'fe/learning')).filter(f => f.endsWith('.md')).sort()) named(`learning:${f.replace(/\.md$/, '')}`, 'learning', `Learning · ${f.replace(/\.md$/, '')}`, [T(`fe/learning/${f}`)]);
  const books = J('bibliotheca/data/index.json').books;
  const bookText = books.map(b => { try { const d = J(`bibliotheca/data/books/${b.slug}.json`); return (d.chapters || []).flatMap(c => [c.title, ...(c.paragraphs || []).map(p => p.text)]).filter(Boolean).join('\n'); } catch { return ''; } });
  named('bibliotheca', 'neo-classic', 'Bibliotheca', bookText).notes.push(`${books.length} public-domain books; their place names are historical (Gibbon's "Egypt" counts as today's Egypt; "Prussia" or "Gaul" count as nothing), so this is the weakest evidence.`);
  log(`Text ${Date.now() - t0} ms`);

  // Tables
  const natPiece = newPiece('national-analysis', 'pestle', 'National Analysis', 'table');
  for (const c of national) add(natPiece, 'row', c.iso3);
  natPiece.notes.push(`${national.length} World Bank economies; every one gets an unconditional "Political Atlas" chip (q/national.html).`);
  pieces.push(natPiece);
  const vol = J('volatility/data/index.json');
  const volPiece = newPiece('volatility', 'volatility', 'Geopolitical Volatility', 'table');
  const dayFiles = readdirSync(join(root, 'volatility/data/days')).filter(f => f.endsWith('.json')).sort();
  const scored = new Set(), lastScored = new Set();
  for (const f of dayFiles) { const d = J(`volatility/data/days/${f}`); for (const [k, x] of Object.entries(d.countries || {})) if (x?.score != null) { scored.add(k); if (f === dayFiles.at(-1)) lastScored.add(k); } }
  for (const c of scored) add(volPiece, 'row', c);
  const neverScored = Object.keys(vol.countries).filter(k => !scored.has(k) && R.target.has(k)).sort();
  volPiece.notes.push(`${dayFiles.length} days (${dayFiles[0]?.slice(0, 10)} to ${dayFiles.at(-1)?.slice(0, 10)}); ${lastScored.size} scored on the last day, ${scored.size} on any day; ${neverScored.length} countries have a key and were never scored ("too few events or sources").`);
  volPiece.neverScored = neverScored;
  pieces.push(volPiece);
  const hub = readdirSync(join(root, 'integration/data/countries')).filter(f => /^[A-Z]{3}\.json$/.test(f)).map(f => f.slice(0, 3));
  const hubPiece = newPiece('hub-profiles', 'integration-hub', 'Integration Hub country profiles', 'table'); add(hubPiece, 'row', hub); pieces.push(hubPiece);
  const brief = J('national/data/brief.json').countries.filter(c => c.iso3 && c.qid);
  const relPiece = newPiece('kino-related', 'kino', 'Kino Related screens (national/data/brief.json)', 'table'); add(relPiece, 'row', brief.map(c => c.iso3)); pieces.push(relPiece);

  // Reference sites: a record per country, drawn on their own maps.
  const hlPiece = newPiece('headline-tracker', 'headlines', 'Global Headline Tracker', 'reference');
  const outlets = J('headlines/outlets.json');
  add(hlPiece, 'row', Object.keys(outlets).map(k => R.iso2Iso(k) || (k === 'XK' ? 'XKX' : k)));
  add(hlPiece, 'map', J('headlines/boundaries.json').objects.countries.geometries.map(g => g.properties.iso3 || (g.properties.code === 'XK' ? 'XKX' : null)));
  pieces.push(hlPiece);
  const atlasPiece = newPiece('political-atlas', 'atlas', 'Political Atlas', 'reference');
  if (atlasDir) {
    const man = JSON.parse(readText(join(atlasDir, 'data/manifest.json')));
    const recs = man.files.flatMap(f => JSON.parse(readText(join(atlasDir, 'data', f.path || f))));
    add(atlasPiece, 'row', recs.map(r => r.iso3)); add(atlasPiece, 'map', recs.map(r => r.iso3));
    atlasPiece.notes.push(`${recs.length} records in ${man.files.length} files; ${recs.filter(r => !r.executive?.leader).length} without executive.leader.`);
  } else atlasPiece.notes.push('Not read: no Political Atlas folder found (pass --atlas=<dir>).');
  pieces.push(atlasPiece);
  const retroPiece = newPiece('political-retrospective', 'retrospective', 'Political Retrospective', 'reference');
  let retroGw = new Set();
  if (retroDir) {
    const rc = JSON.parse(readText(join(retroDir, 'data/countries.json'))).countries;
    retroGw = new Set(Object.keys(rc).map(Number));
    for (const [gw, r] of Object.entries(rc)) { const iso = r.iso3 ? [r.iso3] : R.gwIso(gw) || []; add(retroPiece, 'row', iso, 1, R); add(retroPiece, 'map', iso, 1, R); }
    retroPiece.notes.push(`${Object.keys(rc).length} Gleditsch–Ward records (predecessor states included).`);
  } else retroPiece.notes.push('Not read: no Political Retrospective folder found (pass --retro=<dir>).');
  pieces.push(retroPiece);

  const byId = new Map(pieces.map(p => [p.id, p]));
  const coverage = countryCoverage(pieces);
  const atlasSet = new Set(atlasPiece.tiers.row.keys());

  // Gaps
  const gaps = [];
  gaps.push(...warFilmGaps(kino.films, byId, { wf, rb, masterBattles: new Set([...masterQ].filter(q => battleQ.has(q))) }, R));
  gaps.push(...warSideGaps(wfList, R));
  if (atlasDir) gaps.push(scopeGap(atlasPiece, pieces, R), calendarGap({ byCountry }, atlasSet, R));
  if (retroDir) gaps.push(scopeGap(retroPiece, pieces, R));
  gaps.push(scopeGap(hlPiece, pieces, R));
  gaps.push(thinIndexGap(miPiece, pieces, R));
  // dead-link
  if (atlasDir) {
    const chip = national.map(c => c.iso3).filter(c => !atlasSet.has(c));
    gaps.push({ rule: 'dead-link', piece: 'national-analysis', title: `National Analysis's "Political Atlas" chip opens no record for ${chip.length} of its ${national.length} countries`, countries: chip.filter(c => R.target.has(c)), territories: chip.filter(c => !R.target.has(c)), evidence: {}, weight: chip.length });
  }
  const kinoMap = uniq(kino.pieces.flatMap(p => [...p.tiers.map.keys()]));
  const noBrief = kinoMap.filter(c => !relPiece.tiers.row.has(c) && R.target.has(c));
  const noBriefTarget = [...R.target].filter(c => !relPiece.tiers.row.has(c));
  gaps.push({ rule: 'dead-link', piece: 'kino-related', title: `Kino Related screens cannot tag ${noBriefTarget.join(' and ')}: national/data/brief.json has no row for them`, countries: noBriefTarget, onKinoMapsToday: noBrief, evidence: {}, weight: noBriefTarget.length });
  if (retroDir) {
    const bad = kino.films.flatMap(f => f.links.filter(l => l.module === 'retrospective' && l.at.c && !retroGw.has(+l.at.c)).map(l => ({ film: f.id, scene: l.scene, c: l.at.c })));
    if (bad.length) gaps.push({ rule: 'dead-link', piece: 'kino', title: `Kino links to Political Retrospective countries it has no record for`, countries: uniq(bad.flatMap(b => R.gwIso(b.c) || [])), links: bad, evidence: {}, weight: bad.length });
  }
  const noHub = [...R.target].filter(c => !hubPiece.tiers.row.has(c));
  if (noHub.length) gaps.push({ rule: 'dead-link', piece: 'hub-profiles', title: `The Integration Hub (and so the MCP server's country lookup) has no profile for ${noHub.join(', ')}`, countries: noHub, evidence: Object.fromEntries(noHub.map(c => [c, pieces.filter(p => p.kind === 'content' && substantive(p).has(c)).map(p => p.id)])), weight: noHub.length });
  const validator = T('kino/scripts/validate.mjs');
  const vm = /ATLAS_COUNTRIES\s*=\s*\[([^\]]+)\]/.exec(validator);
  if (vm && atlasDir) {
    const list = [...vm[1].matchAll(/'([A-Z]{3})'/g)].map(m => m[1]);
    checks.push({ check: 'kino/scripts/validate.mjs ATLAS_COUNTRIES matches the Atlas', ok: list.length === atlasSet.size && list.every(c => atlasSet.has(c)), detail: `${list.length} codes hard-coded; it refuses Kino links to any other country` });
  }
  // scope-text
  const textFiles = [];
  const SKIP = new Set(['node_modules', '.git', 'raw', 'build']);
  const SKIP_PATHS = ['lake/data/e', 'lake/data/t', 'bibliotheca/data/books', 'national/data/series', 'volatility/data/days', 'integration/data/countries', 'calendar/data', 'battlefield/focus/data/wars'];
  const walk = (base, dir, label) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, f.name), rel = relative(base, full).split(sep).join('/');
      if (f.isDirectory()) { if (!SKIP.has(f.name) && !SKIP_PATHS.some(s => rel === s || rel.startsWith(s + '/'))) walk(base, full, label); continue; }
      if (!/\.(html|md|mjs|js|json|yml)$/.test(f.name) || rel === 'integration/scripts/coverage.mjs' || rel === 'tests/coverage.test.mjs' || /AUDIT\.md$/.test(f.name)) continue;
      if (statSync(full).size > 3e6) continue;
      textFiles.push({ path: `${label}${rel}`, text: readText(full) });
    }
  };
  walk(root, root, '');
  if (atlasDir) walk(atlasDir, atlasDir, 'political-atlas/');
  if (retroDir) walk(retroDir, retroDir, 'hp-retrospective/');
  const scopeText = scopeTextGaps(textFiles);
  if (scopeText.length) gaps.push({ rule: 'scope-text', piece: 'text', title: `${scopeText.length} lines in ${uniq(scopeText.map(h => h.path)).length} files state the 78-country scope`, countries: [], lines: scopeText, evidence: {}, weight: uniq(scopeText.map(h => h.path)).length });
  rankGaps(gaps);
  log(`Gaps ${Date.now() - t0} ms`);

  return { R, pieces, byId, coverage, gaps, checks, sources, kino, wf, rb, atlasSet, byCountry, volPiece, today };
}

/* ------------------------------------------------------------------ reports */
// How each map draws a country it has no data for (read from the pages; see the Markdown report's notes).
export const MAPS = [
  { piece: 'political-atlas', page: 'political-atlas.pages.dev', map: 'world-atlas 50m', empty: 'grey "Not covered" shape', populate: true },
  { piece: 'political-retrospective', page: 'hp-retrospective.pages.dev', map: 'CShapes 2.0', empty: 'uncoloured state', populate: true },
  { piece: 'headline-tracker', page: 'q/headlines.html', map: 'Leaflet tiles plus the 78 polygons', empty: 'not drawn at all (bare tiles, cannot be clicked)', populate: true },
  { piece: 'national-analysis', page: 'q/national.html', map: 'world-atlas 110m', empty: '"no data" fill', populate: false },
  { piece: 'volatility', page: 'q/volatility.html', map: 'world-atlas 110m', empty: '"no data" fill, or hatched when a key was never scored', populate: false },
  { piece: 'kino', page: 'kino/', map: 'world-atlas 110m', empty: 'grey unless a scene highlights it (no "empty" meaning)', populate: false },
  { piece: 'war-focus', page: 'battlefield/focus/', map: 'CShapes, every state of the date', empty: 'drawn, uncoloured when on no side', populate: false },
  { piece: 'retrospective-battlefield', page: 'battlefield/history/', map: 'CShapes, every state of the date', empty: 'drawn, uncoloured', populate: false },
  { piece: 'realtime-battlefield', page: 'battlefield/', map: 'Leaflet tiles plus points', empty: 'no country shapes', populate: false },
  { piece: 'kardashev', page: 'kardashev/', map: 'world-atlas land 110m', empty: 'no country borders', populate: false },
  { piece: 'invention-timeline', page: 'science/progress/', map: 'world-atlas land 110m', empty: 'no country borders', populate: false },
];
export const LIMITS = [
  'The world-atlas@2.0.2 shapes the pages draw (countries-110m, countries-50m, land-110m) come from jsDelivr and are not in any repository, so which of their features lack an ISO id (Somaliland, Northern Cyprus and Kosovo are suspected) cannot be checked here.',
  'Only committed data is read: the live sources behind each refresh (GDELT, UCDP, Wikidata, Wikipedia, the RSS feeds) and the Headline Tracker\'s article archive (Supabase) are not, and the deployed sites can differ from the working trees.',
  'Text matching finds country names written in full or by a known alias; it misses adjectives ("Italian", "French"), cities, regions and historical names, and can over-count ("Georgia" the state, "Jordan" the person). A few longer names that contain a country\'s name are set aside ("New Guinea", "Gulf of Guinea", "New Mexico"). Named counts are the weakest evidence.',
  'Points are placed with CShapes as at the end of 2019 and the 78 headline shapes; a point at sea, or more than 0.15° off a coast (0.5° for capitals and inventions), gets no country. Historical places count as today\'s country.',
  'Gleditsch–Ward codes become present-day countries by a table (Soviet Union and Yugoslavia by date); colonies count as their present-day successor where the code exists, which is why French colonies do not appear as sides of the Second World War.',
  'The rules see only what a piece\'s own data says it is about: a film whose title limits it to Europe is still checked against its whole war, and a subject with no war data behind it (a political party, a thinker) has no rule that says which countries it should show.',
  'Highbrowse and the Dashboard are computed in the browser from the briefings, Volatility and the calendar, so they are covered through those pieces.',
];

const listCodes = (codes, R) => codes.map(c => `${R.name(c)} (${c})`).join(', ');
function regionsOf(codes, R) { const m = {}; for (const c of codes) { const r = R.region(c); m[r] = (m[r] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); }

export function toJSON(model) {
  const { R, pieces, coverage, gaps, checks, sources } = model;
  const tgt = [...R.target].sort();
  const cls = Object.fromEntries(tgt.map(c => [c, coverageClass(coverage.get(c), model.byId)]));
  return {
    about: 'Which countries each piece of VM content covers, by tier, and the gaps its own subject implies. Made by integration/scripts/coverage.mjs from committed data.',
    sources, tiers: TIERS, checks,
    target: tgt, keep: [...KEEP],
    pieces: pieces.map(p => {
      const all = covered(p), t = [...all].filter(c => R.target.has(c) || KEEP.has(c));
      return { id: p.id, module: p.module, label: p.label, kind: p.kind, countries: t.length, other: [...all].filter(c => !R.target.has(c) && !KEEP.has(c)).sort(),
        regions: regionsOf(t.filter(c => R.target.has(c)), R), tiers: Object.fromEntries(TIERS.filter(x => p.tiers[x].size).map(x => [x, Object.fromEntries([...p.tiers[x]].sort())])), notes: p.notes, parts: p.parts.length ? p.parts : undefined, neverScored: p.neverScored };
    }),
    countries: Object.fromEntries([...tgt, ...KEEP].map(c => [c, { name: R.name(c), region: R.region(c), class: cls[c] || 'content', atlas: model.atlasSet.has(c), pieces: coverage.get(c) || {} }])),
    uncovered: tgt.filter(c => cls[c] === 'none'), tablesOnly: tgt.filter(c => cls[c] === 'tables'), textOnly: tgt.filter(c => cls[c] === 'text'),
    maps: MAPS.map(m => { const p = model.byId.get(m.piece); const has = p ? (p.kind === 'reference' ? new Set(p.tiers.row.keys()) : covered(p)) : null; const kinoAll = m.piece === 'kino' ? new Set(model.kino.pieces.flatMap(k => [...k.tiers.map.keys()])) : null; const set = kinoAll || has; return { ...m, without: set ? tgt.filter(c => !set.has(c)) : null }; }),
    gaps, limits: LIMITS,
  };
}

export function toMarkdown(model, json = toJSON(model)) {
  const { R } = model;
  const L = [];
  const nm = c => `${R.name(c)}`;
  L.push(`# VM coverage map`, '', `Made by integration/scripts/coverage.mjs from committed data on ${model.today}. Countries: ${json.target.length} (UN members, the Holy See, Palestine, Kosovo, Taiwan) plus Greenland.`, '');
  for (const c of json.checks) L.push(`- Check: ${c.check}: ${c.ok ? 'yes' : 'NO'} (${c.detail})`);
  L.push('', '## Content by content', '', '| Piece | Kind | Countries | By tier | Regions |', '|---|---|---:|---|---|');
  for (const p of json.pieces) L.push(`| ${p.label} | ${p.kind} | ${p.countries} | ${Object.entries(p.tiers).map(([t, m]) => `${t} ${Object.keys(m).length}`).join(', ')} | ${Object.entries(p.regions).map(([r, n]) => `${r} ${n}`).join('; ')} |`);
  L.push('', '### Notes', '');
  for (const p of json.pieces) for (const n of p.notes) L.push(`- ${p.label}: ${n}`);
  L.push('', '## Countries no content covers', '', json.uncovered.length ? listCodes(json.uncovered, R) : 'None: every country is covered by at least one piece beyond a table.', '');
  L.push(`Covered only by data tables (National Analysis, Volatility, Hub profiles, a country's own Master Index entry): ${json.tablesOnly.length ? listCodes(json.tablesOnly, R) : 'none'}.`, '');
  L.push(`Named in text only, beyond the tables: ${json.textOnly.length ? listCodes(json.textOnly, R) : 'none'}.`, '');
  L.push('## Maps and what they draw for a country with no data', '', '| Map | Page | Shapes | A country with no data is | Countries without data |', '|---|---|---|---|---:|');
  for (const m of json.maps) L.push(`| ${model.byId.get(m.piece)?.label || m.piece} | ${m.page} | ${m.map} | ${m.empty} | ${m.without ? m.without.length : '?'} |`);
  L.push('', '## Gaps, ranked by weight', '', 'Weight: each missing country counts once for every other piece of content that already has it (a historical state kept whole counts as one country). The plain counts (dead links, old wording) come after, in their own list, because their weights are not in the same unit.', '');
  for (const [i, g] of json.gaps.entries()) {
    if (g.unit === 'count' && json.gaps[i - 1]?.unit !== 'count') L.push('## Gaps measured by count', '', `Weight here is a plain count: ${Object.entries(COUNT_UNIT).map(([r, u]) => `${r}, ${u}`).join('; ')}.`, '');
    L.push(`### ${i + 1}. [${g.rule}] ${g.title} (${g.unit === 'count' ? 'count' : 'weight'} ${g.weight})`, '');
    if (g.countries?.length) {
      const byR = {}; for (const c of g.countries) (byR[R.region(c)] ||= []).push(c);
      for (const [r, cs] of Object.entries(byR).sort((a, b) => b[1].length - a[1].length)) L.push(`- ${r} (${cs.length}): ${cs.map(c => `${nm(c)}${Array.isArray(g.evidence?.[c]) ? ` (${g.evidence[c].length})` : ''}`).join(', ')}`);
    }
    if (g.named?.length) L.push(`- Named in the narration but never drawn: ${g.named.map(nm).join(', ')}`);
    const stateText = st => `${st.name} (one state then; today ${st.successors.map(nm).join(', ')})`;
    for (const st of g.states || []) L.push(`- Counted once, as the state it was then: ${stateText(st)}: ${Object.entries(st.evidence).map(([p, w]) => `${p} ${w}`).join('; ')}`);
    for (const s of g.scenes || []) L.push(`- Scene "${s.title}" (${s.link}): leaves grey ${[...s.missing.map(c => `${nm(c)}${s.why[c]?.length ? ` (${s.why[c].join('; ')})` : ''}`), ...(s.states || []).map(st => `${stateText(st)} (${st.why.join('; ')})`)].join(', ')}`);
    for (const h of (g.lines || []).slice(0, 40)) L.push(`- ${h.path}:${h.line}: ${h.text}`);
    if (g.territories?.length) L.push(`- Also ${g.territories.length} territories: ${g.territories.join(' ')}`);
    L.push('');
  }
  L.push('## What this method cannot see', '');
  for (const l of json.limits) L.push(`- ${l}`);
  return L.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const atlasArg = argValue(args, '--atlas'), retroArg = argValue(args, '--retro');
  const atlasDir = firstDir(atlasArg && resolve(atlasArg), join(root, 'political-atlas'), join(root, '..', 'political-atlas'));
  const retroDir = firstDir(retroArg && resolve(retroArg), join(root, 'hp-retrospective'), join(root, '..', 'hp-retrospective'));
  const today = argValue(args, '--today') || new Date().toISOString().slice(0, 10);
  const quiet = args.includes('--quiet');
  const model = await buildModel({ root, atlasDir, retroDir, today, log: quiet ? () => {} : m => console.error(m) });
  const json = toJSON(model);
  const jsonOut = argValue(args, '--json'), mdOut = argValue(args, '--md');
  if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(json, null, 1) + '\n');
  if (mdOut) writeFileSync(resolve(mdOut), toMarkdown(model, json));
  if (!quiet) {
    const atlas = json.pieces.find(p => p.id === 'political-atlas');
    console.log(`${json.target.length} countries; ${json.pieces.length} pieces; Political Atlas ${atlas?.countries ?? '?'}; uncovered ${json.uncovered.length}, tables only ${json.tablesOnly.length}, text only ${json.textOnly.length}; ${json.gaps.length} gaps.`);
    for (const c of json.checks) if (!c.ok) console.log(`Check failed: ${c.check}: ${c.detail}`);
    for (const g of json.gaps.slice(0, 12)) console.log(`  ${String(g.weight).padStart(5)}  [${g.rule}] ${g.title}`);
  }
}
if (isMain()) main().catch(e => { console.error(e); process.exit(1); });

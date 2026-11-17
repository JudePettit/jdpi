/* PRP map kit: one way for every map about countries to draw all 197 and to say why one has no data (the rule in
   design/PRP-STYLE.md §6, "A country with no data"). Plain script, no build step; one global, PRPMapkit, in a page as in
   Node (import '../design/prp-mapkit.js'). Pure functions, tested in tests/mapkit.test.mjs; no page's own code. The
   planned shared map engine (MP-06) is to absorb it.

   Interface
   (a) Which country a shape is
     codeTable(rows) → Map            ISO 3166 numeric id ('004', three digits) → ISO3, from a page's own rows: objects
                                      { iso3, num } (national/data/index.json) or arrays [iso3, iso2, num, …]
                                      (analytics/lib/countries.js). The kit adds the codes the World Bank list lacks
                                      (Taiwan 158, Vatican City 336) where the rows do not hold them. ISO3 is upper-cased.
     countryOf(shape, codes) → 'ISO3' | null
                                      shape: a TopoJSON geometry or GeoJSON feature ({ id, properties: { name } }), or
                                      one of the kit's dots (its properties.iso3, or an ISO3 id, is its country).
                                      codes: a Map, a plain object (keyed '004', '4' or 4) or a function (given '004').
                                      By the shape's id first, then by name: the page's own 'name:<shape name>' key,
                                      then the kit's names (Kosovo → XKX). Northern Cyprus and Somaliland are named but
                                      given to no country.
     unclaimed(shape, codes?) → name | null
                                      'Northern Cyprus' or 'Somaliland' for those two shapes, else null; null too when
                                      the page's own codes give the shape a country ('name:Somaliland').
   (b) A dot for every country a border file lacks
     DOTS                             frozen rows { iso3, name, qid, lonlat: [lon, lat], from: 'atlas' | 'wikidata',
                                      lacks: ['110m', '50m', 'cshapes'], capital: { qid, name, lonlat } }
     dots(layer?) → rows              the dots one border file needs: '110m' (world-atlas 2.0.2 countries-110m: 29),
                                      '50m' (countries-50m: Tuvalu), 'cshapes' (CShapes 2.0: 22); all 30 without one.
     dot(iso3, layer?) → [lon, lat] | null
     dotFeatures(layer?, only?) → FeatureCollection of Points, id and properties.iso3 the ISO3, properties.name and
                                      properties.dot ([lon, lat], as the Headline Tracker's boundaries carry it); only:
                                      a list of ISO3 to keep.
   (c) The no-data fill
     NODATA                           { className: 'prp-nodata', patternId: 'prp-nodata', fill: 'url(#prp-nodata)',
                                      swatchClass: 'prp-nodata-swatch' }
     patternMarkup(id?) → string      the SVG <pattern> of the hatch National Analysis and Volatility already draw:
                                      --prp-map-nodata crossed by --prp-map-border lines, 5 px apart at 45°.
     css() → string                   .prp-nodata (a shape's fill) and .prp-nodata-swatch (a legend's swatch).
     install(doc?) → NODATA           in a page: adds the pattern (in a hidden SVG, usable by every SVG and Leaflet
                                      layer on the page) and the CSS, once.
   (d) The sentence
     REASONS                          NOT_COVERED 'not-covered' (the source does not cover it), NOTHING_RECORDED
                                      'nothing-recorded', TOO_FEW 'too-few' (too few reports to score), NO_ROW 'no-row'
                                      (no row in this table), NEITHER_SIDE 'neither-side' (not on either side),
                                      NOT_INDEPENDENT 'not-independent' (not an independent state that year).
     REASON_TEXT                      each reason in words.
     sentence(o) → string             "<Country>: no <what this page shows> <for when>. <Why, naming the source>."
     sentenceParts(o) → { head, why, text }   the same, its first sentence apart (for a tooltip's bold line).
       o: { name, reason, what, when, source, also, … }. name: the country as the page names it. what: what the page
       shows ('figures', 'score'). when: a phrase with its own preposition ('in 1990', 'on 15 Nov', 'from 3 May 1950 to
       9 June 1950'), joined with a space (a bare year, 1950, reads 'in 1950'; a capital 'In' is set in lower case); a
       bare period ('January–September 2026') is set after a comma. source: who would hold it ('the World Bank',
       'UCDP'). also: one more sentence (a pointer to another page). By reason:
         not-covered       sought: what VM looked for and has not found (then "<source> has not found <sought>.");
                           otherwise "<Source>, this page’s source, does not publish data for <name>."; unclaimed: true
                           for a shape the source gives to no country: "<name>: this page has no <what> for it.
                           <Source>, its source, publishes none for it on its own."
         nothing-recorded  "<name>: no <what> recorded by <source><when>."; without a name, "No <what> is recorded
                           <when>" (verb: 'are', or '' for "No <what> recorded …"); and: { what, source, when } adds
                           ", and no <what> recorded by <source><when>" (a span across two records); disagree: true
                           ends it ": the sources disagree."
         too-few           reports ('news reports'), span ('that day'), count (a number, or a string of one) and unit
                           ('event'; units for an odd plural), needs ('at least 25 events from 5 sources'): "Too few
                           <reports> in <source> <span> (<count> <units>); a <what> needs <needs>."
         no-row            table ('this table' by default).
         neither-side      war ('this war' by default), or wars ("War Focus’s 39 major wars") for "in none of <wars>".
         not-independent   when ('in 1950').
       A slot's own full stop is dropped, but not one that ends an abbreviation ('the U.N.'), and none is added after
       a slot's '?' or '!'; straight quotes become ‘ and ’. The text is plain: the page escapes it. An unknown reason,
       a count that is not a number, or no name (but for a nothing-recorded span), throws. */
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;

  /* ---------- (a) shapes ---------- */
  // ISO 3166 numeric codes of the 197 that the World Bank list (national/data/index.json) does not hold: Wikidata P299
  // on Taiwan (Q865) and Vatican City (Q237, the state of the Holy See); world-atlas names its shape 158 "Taiwan".
  const EXTRA_CODES = { 158: 'TWN', 336: 'VAT' };
  // Shapes Natural Earth draws with no ISO code. Kosovo has no ISO 3166 code: XKX is the code VM (and the World Bank)
  // uses. Northern Cyprus and Somaliland are drawn apart but are not among the 197; no country is given them.
  const BY_NAME = { Kosovo: 'XKX' };
  const UNCLAIMED = { 'N. Cyprus': 'Northern Cyprus', 'Northern Cyprus': 'Northern Cyprus', Somaliland: 'Somaliland' };
  const ISO3 = /^[A-Z]{3}$/;
  const up = v => (typeof v === 'string' ? v.trim().toUpperCase() : v);
  const pad = id => (/^\d{1,3}$/.test(String(id)) ? String(id).padStart(3, '0') : String(id));
  const get = (codes, k) => (typeof codes === 'function' ? codes(k) : codes instanceof Map ? codes.get(k)
    : Object.hasOwn(codes, k) ? codes[k] : undefined);
  // A table may be keyed '004', '4' or 4 (Kino's is a Map with number keys): each is tried. A function gets '004'.
  function lookup(codes, k) {
    if (!codes) return undefined;
    if (typeof codes === 'function' || !/^\d+$/.test(k)) return get(codes, k);
    for (const key of [k, String(+k), +k]) { const v = get(codes, key); if (v) return v; }
    return undefined;
  }

  function codeTable(rows = []) {
    const t = new Map();
    for (const r of rows || []) {
      const [iso3, num] = Array.isArray(r) ? [r[0], r[2]] : [r?.iso3, r?.num];
      const iso = up(iso3);
      if (ISO3.test(iso || '') && num != null && num !== '') t.set(pad(num), iso);
    }
    for (const [num, iso3] of Object.entries(EXTRA_CODES)) if (!t.has(pad(num))) t.set(pad(num), iso3);
    return t;
  }
  const idOf = s => s?.id ?? s?.properties?.id ?? null;
  const nameOf = s => s?.properties?.name ?? null;
  function countryOf(shape, codes) {
    if (!shape) return null;
    // A dot from dotFeatures() (or any feature that already says its country) is its own country.
    const own3 = up(shape.properties?.iso3);
    if (ISO3.test(own3 || '')) return own3;
    const id = idOf(shape);
    if (ISO3.test(String(id ?? ''))) return String(id);
    if (id != null && id !== '') { const k = pad(id), v = up(lookup(codes, k)) || EXTRA_CODES[+k]; if (v) return v; }
    const name = nameOf(shape);
    if (!name) return null;
    const own = up(lookup(codes, 'name:' + name));
    if (own) return own;
    if (Object.hasOwn(UNCLAIMED, name)) return null;
    return Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : null;
  }
  // codes: the page's table, when it has one; a page that gives the shape a country of its own ('name:Somaliland')
  // has claimed it, and then it is not unclaimed.
  function unclaimed(shape, codes) {
    const id = idOf(shape);
    if (id != null && id !== '') return null;
    const name = nameOf(shape);
    if (!Object.hasOwn(UNCLAIMED, name || '')) return null;
    return codes && lookup(codes, 'name:' + name) ? null : UNCLAIMED[name];
  }

  /* ---------- (b) dots ----------
     Dot positions: the Political Atlas's MARKERS table (political-atlas/app.js, VM's own; read 17 Nov 2026), copied
     as they stand. Vanuatu is not in MARKERS (the Atlas has its shape): its dot is its capital's Wikidata coordinates,
     to MARKERS's two decimals. Each dot is checked against its capital's coordinates in Wikidata (CC0), read
     17 Nov 2026 from https://query.wikidata.org/ (P36 capital, P625 coordinates): the capital's item and position are
     the last fields. Which border files lack each country: the plan (PRP-ALL-COUNTRIES-PLAN.md, AC-1, AC-5, AC-13),
     checked against world-atlas 2.0.2 countries-110m (tests/fixtures/world-atlas-110m-ids.json) and CShapes 2.0
     (battlefield/history/data/borders.topo.json). Names as design/prp-focus.js gives them. Capitals' names are
     Wikidata's English labels, but for Saint John's (Q36262, which has none): its name is National Analysis's.
     iso3, name, country item, dot [lon, lat], from, lacks, capital item, capital, capital [lon, lat] */
  const ROWS = [
    ['AND', 'Andorra', 'Q228', [1.52, 42.51], 'atlas', '110m cshapes', 'Q1863', 'Andorra la Vella', [1.522222, 42.507222]],
    ['ATG', 'Antigua and Barbuda', 'Q781', [-61.8, 17.08], 'atlas', '110m cshapes', 'Q36262', 'Saint John’s', [-61.844722, 17.121111]],
    ['BHR', 'Bahrain', 'Q398', [50.54, 26.03], 'atlas', '110m', 'Q3882', 'Manama', [50.583333, 26.216667]],
    ['BRB', 'Barbados', 'Q244', [-59.55, 13.17], 'atlas', '110m', 'Q36168', 'Bridgetown', [-59.616667, 13.0975]],
    ['COM', 'Comoros', 'Q970', [43.33, -11.7], 'atlas', '110m', 'Q3901', 'Moroni', [43.253611, -11.703611]],
    ['CPV', 'Cape Verde', 'Q1011', [-23.6, 15.1], 'atlas', '110m', 'Q3751', 'Praia', [-23.509156, 14.917719]],
    ['DMA', 'Dominica', 'Q784', [-61.37, 15.42], 'atlas', '110m cshapes', 'Q36281', 'Roseau', [-61.383333, 15.3]],
    ['FSM', 'Micronesia', 'Q702', [158.2, 6.9], 'atlas', '110m cshapes', 'Q42751', 'Palikir', [158.185, 6.917778]],
    ['GRD', 'Grenada', 'Q769', [-61.68, 12.12], 'atlas', '110m cshapes', 'Q41547', 'St. George’s', [-61.753056, 12.0525]],
    ['KIR', 'Kiribati', 'Q710', [173, 1.4], 'atlas', '110m cshapes', 'Q131233', 'South Tarawa', [172.966667, 1.333333]],
    ['KNA', 'Saint Kitts and Nevis', 'Q763', [-62.75, 17.33], 'atlas', '110m cshapes', 'Q41295', 'Basseterre', [-62.734167, 17.298333]],
    ['LCA', 'Saint Lucia', 'Q760', [-60.98, 13.9], 'atlas', '110m cshapes', 'Q41699', 'Castries', [-60.989444, 14.010833]],
    ['LIE', 'Liechtenstein', 'Q347', [9.55, 47.16], 'atlas', '110m cshapes', 'Q1844', 'Vaduz', [9.522222, 47.140556]],
    ['MCO', 'Monaco', 'Q235', [7.42, 43.74], 'atlas', '110m cshapes', 'Q235', 'Monaco', [7.42, 43.731111]],
    ['MDV', 'Maldives', 'Q826', [73.5, 4.2], 'atlas', '110m', 'Q9347', 'Malé', [73.508333, 4.175]],
    ['MHL', 'Marshall Islands', 'Q709', [171.2, 7.1], 'atlas', '110m cshapes', 'Q12919', 'Majuro', [171.3802, 7.0918]],
    ['MLT', 'Malta', 'Q233', [14.44, 35.9], 'atlas', '110m', 'Q23800', 'Valletta', [14.5125, 35.897778]],
    ['MUS', 'Mauritius', 'Q1027', [57.56, -20.25], 'atlas', '110m', 'Q3929', 'Port Louis', [57.498889, -20.161944]],
    ['NRU', 'Nauru', 'Q697', [166.93, -0.52], 'atlas', '110m cshapes', 'Q31026', 'Yaren District', [166.920867, -0.5477]],
    ['PLW', 'Palau', 'Q695', [134.58, 7.5], 'atlas', '110m cshapes', 'Q515229', 'Ngerulmud', [134.624167, 7.500556]],
    ['SGP', 'Singapore', 'Q334', [103.82, 1.35], 'atlas', '110m', 'Q334', 'Singapore', [103.8, 1.3]],
    ['SMR', 'San Marino', 'Q238', [12.46, 43.94], 'atlas', '110m cshapes', 'Q1848', 'San Marino', [12.44845, 43.932011]],
    ['STP', 'São Tomé and Príncipe', 'Q1039', [6.61, 0.25], 'atlas', '110m cshapes', 'Q3932', 'São Tomé', [6.728333, 0.3375]],
    ['SYC', 'Seychelles', 'Q1042', [55.46, -4.67], 'atlas', '110m cshapes', 'Q3940', 'Victoria', [55.454444, -4.623611]],
    ['TON', 'Tonga', 'Q678', [-175.2, -21.17], 'atlas', '110m cshapes', 'Q38834', 'Nukuʻalofa', [-175.201808, -21.13434]],
    ['TUV', 'Tuvalu', 'Q672', [179.2, -8.5], 'atlas', '110m 50m cshapes', 'Q34126', 'Funafuti', [179.117361, -8.504778]],
    ['VAT', 'Vatican City', 'Q237', [12.45, 41.9], 'atlas', '110m cshapes', 'Q237', 'Vatican City', [12.453, 41.904]],
    ['VCT', 'Saint Vincent and the Grenadines', 'Q757', [-61.2, 13.25], 'atlas', '110m cshapes', 'Q41474', 'Kingstown', [-61.22742, 13.15527]],
    ['VUT', 'Vanuatu', 'Q686', [168.32, -17.73], 'wikidata', 'cshapes', 'Q37806', 'Port Vila', [168.316667, -17.73333]],
    ['WSM', 'Samoa', 'Q683', [-172.1, -13.75], 'atlas', '110m cshapes', 'Q36260', 'Apia', [-171.833333, -13.833333]],
  ];
  const freeze = o => Object.freeze(o);
  const DOTS = freeze(ROWS.map(([iso3, name, qid, lonlat, from, lacks, cq, cn, cll]) => freeze({ iso3, name, qid, lonlat: freeze(lonlat), from,
    lacks: freeze(lacks.split(' ')), capital: freeze({ qid: cq, name: cn, lonlat: freeze(cll) }) })));
  const LAYERS = new Set(['110m', '50m', 'cshapes']);
  function dots(layer) {
    if (layer != null && !LAYERS.has(layer)) throw new Error(`PRPMapkit.dots: unknown border file "${layer}" (110m, 50m or cshapes)`);
    return DOTS.filter(d => layer == null || d.lacks.includes(layer));
  }
  function dot(iso3, layer) { const k = up(iso3); const d = dots(layer).find(x => x.iso3 === k); return d ? [...d.lonlat] : null; }
  function dotFeatures(layer, only) {
    const keep = only ? new Set([...only].map(up)) : null;
    return { type: 'FeatureCollection', features: dots(layer).filter(d => !keep || keep.has(d.iso3)).map(d => ({ type: 'Feature', id: d.iso3,
      properties: { iso3: d.iso3, name: d.name, dot: [...d.lonlat] }, geometry: { type: 'Point', coordinates: [...d.lonlat] } })) };
  }

  /* ---------- (c) the no-data fill ----------
     The hatch National Analysis (q/national.html) and Volatility (q/volatility.html) both draw today, each with its own
     copy under the id "nodata"; the kit's copy has its own id so a page can move to it without a clash. */
  const NODATA = freeze({ className: 'prp-nodata', patternId: 'prp-nodata', fill: 'url(#prp-nodata)', swatchClass: 'prp-nodata-swatch' });
  const patternMarkup = (id = NODATA.patternId) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">`
    + '<rect width="5" height="5" style="fill:var(--prp-map-nodata)"/><line y2="5" stroke-width="1.4" style="stroke:var(--prp-map-border)"/></pattern>';
  const css = () => `.${NODATA.className}{fill:${NODATA.fill}}`
    + `.${NODATA.swatchClass}{background:repeating-linear-gradient(135deg,var(--prp-map-border) 0 1px,var(--prp-map-nodata) 1px 4px)}`;
  function install(doc = root.document) {
    if (!doc || doc.getElementById('prp-mapkit-defs')) return NODATA;
    // A script in <head> may call this before <body> exists: then both go into the root element.
    const style = doc.createElement('style'); style.id = 'prp-mapkit-style'; style.textContent = css();
    (doc.head || doc.documentElement).appendChild(style);
    // Not display:none, which would hide the pattern from the shapes that use it.
    const holder = doc.createElement('div');
    holder.innerHTML = `<svg id="prp-mapkit-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${patternMarkup()}</defs></svg>`;
    (doc.body || doc.documentElement).appendChild(holder.firstChild);
    return NODATA;
  }

  /* ---------- (d) the sentence ---------- */
  const REASONS = freeze({ NOT_COVERED: 'not-covered', NOTHING_RECORDED: 'nothing-recorded', TOO_FEW: 'too-few', NO_ROW: 'no-row',
    NEITHER_SIDE: 'neither-side', NOT_INDEPENDENT: 'not-independent' });
  const REASON_TEXT = freeze({ 'not-covered': 'the source does not cover it', 'nothing-recorded': 'nothing recorded',
    'too-few': 'too few reports to score', 'no-row': 'no row in this table', 'neither-side': 'not on either side',
    'not-independent': 'not an independent state that year' });
  // A slot's own closing full stop (or an ellipsis) is dropped, since the sentence adds its own; one that ends an
  // abbreviation ('the U.N.', 'Freedom House Inc.') is kept, and then no second stop is added.
  const ABBR = /(?:(?:^|[\s(])(?:\p{L}\.){2,}|\b(?:Inc|Ltd|Co|Corp|Bros|St|Jr|Sr|etc|vs|No)\.)$/u;
  const clean = s => { const t = String(s ?? '').trim(); return ABBR.test(t) ? t : t.replace(/[.…\s]+$/u, ''); };
  const stop = s => (/[.?!…]$/u.test(s) ? s : `${s}.`);
  // A quote that opens a word (at the start, after a space or a bracket) becomes ‘; every other straight one ’.
  const curly = s => s.replace(/(^|[\s([“—–-])'/gu, '$1‘').replace(/'/g, '’');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // 'when' brings its own preposition ('in 1990'); a bare year (1950, '1950') is read as 'in 1950', and a capital
  // In/On/From… is set in lower case. Anything else ('January–September 2026') is set after a comma.
  const PREP = /^(?:In|On|From|During|Between|Since|Before|After|Until|Throughout|Over)\b/;
  function joinWhen(w) {
    let t = clean(w);
    if (!t) return '';
    if (/^\d{3,4}$/.test(t)) t = `in ${t}`;
    t = t.replace(PREP, m => m.toLowerCase());
    return /^\p{Ll}/u.test(t) ? ` ${t}` : `, ${t}`;
  }
  // unit is singular ('event'); units, its plural, when an 's' will not do ('people'). A unit ending in 's' is left.
  const plural = (unit, units) => units || (/s$/i.test(unit) ? unit : /[^aeiou]y$/i.test(unit) ? `${unit.slice(0, -1)}ies` : `${unit}s`);
  function counted(o) {
    if (o.count == null || o.count === '') return '';
    const raw = typeof o.count === 'number' ? o.count : String(o.count).trim().replace(/,/g, '');
    const n = raw === '' ? NaN : Number(raw); // a count of spaces is not a nought
    if (!Number.isFinite(n)) throw new Error(`PRPMapkit.sentence: count "${o.count}" is not a number`);
    const unit = clean(o.unit) || 'report';
    return ` (${n} ${n === 1 ? unit : plural(unit, clean(o.units))})`;
  }
  // "<what> recorded by <source> <when>", the core of a nothing-recorded sentence; also for its second part.
  const recorded = (what, source, when) => `${what} recorded${source ? ` by ${source}` : ''}${when}`;
  function sentenceParts(o = {}) {
    const r = o.reason;
    if (!Object.hasOwn(REASON_TEXT, r)) throw new Error(`PRPMapkit.sentence: unknown reason "${r}" (one of ${Object.values(REASONS).join(', ')})`);
    const name = clean(o.name), what = clean(o.what), when = joinWhen(o.when), source = clean(o.source);
    if (!name && !(r === REASONS.NOTHING_RECORDED && what)) throw new Error('PRPMapkit.sentence: the country’s name is needed');
    let head, why = '';
    switch (r) {
      case REASONS.NOT_COVERED:
        if (o.unclaimed) {
          // A shape the page draws but its source gives to no country (Northern Cyprus, Somaliland).
          head = `${name}: this page has no ${what || 'data'} for it${when}`;
          why = source ? `${cap(source)}, its source, publishes none for it on its own` : '';
        } else {
          head = `${name}: no ${what || 'data'}${when}`;
          why = o.sought ? `${cap(source || 'VM')} has not found ${clean(o.sought)}` : source ? `${cap(source)}, this page’s source, does not publish data for ${name}` : '';
        }
        break;
      case REASONS.NOTHING_RECORDED: {
        // Without a name, 'No <what> is recorded …'; verb: 'are' for a plural, '' for none ('No events recorded by …').
        const verb = o.verb === undefined ? 'is' : clean(o.verb);
        head = name ? `${name}: no ${recorded(what || 'data', source, when)}` : `No ${recorded(`${what}${verb ? ` ${verb}` : ''}`, source, when)}`;
        // and: { what, source, when }, a second record for the rest of the period (a span across 1946 names both).
        if (o.and) head += `, and no ${recorded(clean(o.and.what) || what || 'data', clean(o.and.source), joinWhen(o.and.when))}`;
        if (o.disagree) head += ': the sources disagree';
        break;
      }
      case REASONS.TOO_FEW: {
        const w = what || 'score';
        head = `${name}: no ${w}${when}`;
        why = `Too few ${clean(o.reports) || 'reports'}${source ? ` in ${source}` : ''}${o.span ? ` ${clean(o.span)}` : ''}`
          + `${counted(o)}${o.needs ? `; a ${w} needs ${clean(o.needs)}` : ''}`;
        break;
      }
      case REASONS.NO_ROW: head = `${name}: no row for it in ${clean(o.table) || 'this table'}`; break;
      case REASONS.NEITHER_SIDE: head = o.wars ? `${name}: in none of ${clean(o.wars)}` : `${name}: not on either side of ${clean(o.war) || 'this war'}`; break;
      case REASONS.NOT_INDEPENDENT: head = `${name}: not an independent state${when}`; break;
    }
    head = stop(head);
    if (why) why = stop(why);
    if (o.also) why = [why, stop(cap(clean(o.also)))].filter(Boolean).join(' ');
    head = curly(head); why = curly(why);
    return { head, why, text: why ? `${head} ${why}` : head };
  }
  const sentence = o => sentenceParts(o).text;

  root.PRPMapkit = freeze({ codeTable, countryOf, unclaimed, DOTS, dots, dot, dotFeatures, NODATA, patternMarkup, css, install,
    REASONS, REASON_TEXT, sentence, sentenceParts });
})();

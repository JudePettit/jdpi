/* PRP focus: in Documentary mode a page's map zooms to fit what is being read or highlighted. The narrator
   (design/jdpi-narrator.js) sends the targets; a map page loads this file and answers. Plain script, no build step.

   Protocol (window CustomEvents in the submodule's own page):
     'prp:focus'          detail { countries: ['UKR', 'RUS'],    ISO 3166-1 alpha-3 (also 'gw:365', a Gleditsch–Ward code)
                                   points: [[30.52, 50.45]],    [lon, lat]
                                   bbox: [w, s, e, n] | null,   degrees; e passes 180 when the box crosses the date line
                                   qids: ['Q…'],                Wikidata items the page can place (wars, battles, events)
                                   padding: 40,                 pixels kept clear around the fitted area
                                   label?: 'Battle of Kursk' }  what is being discussed
                          detail { reset: true }                back to the page's own view (the reading stopped or ended)
     'prp:focus-request'  detail { text, el, targets: null }   the narrator asks about a passage that came without
                                                                targets; a page that can place it sets detail.targets
   Every target in one step is fitted at once. A page without a map ignores both events.

   On a map page: PRPFocus.listen({ focus(t), reset(), request?(text, el) }); turn targets into one box with
   PRPFocus.resolve(t, { country(id), qid(q) }); zoom with PRPFocus.d3View(…).fit(box) or PRPFocus.leafletFit(map, box);
   mark what was resolved with the class 'prp-focus-hit'; give a way back (the page's ⟲, or PRPFocus.resetButton()).
   Motion follows prefers-reduced-motion. The pure functions are tested in tests/documentary.test.mjs. */
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const ISO3 = /^[A-Z]{3}$/, SCHEMED = /^[a-z]+:[\w.-]+$/, QID = /^Q\d+$/;
  const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN);
  const finite = (...a) => a.every(Number.isFinite);
  const wrap = lon => ((((lon + 180) % 360) + 360) % 360) - 180;
  const minOf = a => a.reduce((m, v) => (v < m ? v : m), Infinity), maxOf = a => a.reduce((m, v) => (v > m ? v : m), -Infinity);

  /* ---------- targets ---------- */
  const list = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(/[\s,;]+/));
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const countries = [...new Set(list(d.countries).map(c => String(c).trim()).map(c => (/^[a-z]{3}$/i.test(c) ? c.toUpperCase() : c))
      .filter(c => ISO3.test(c) || SCHEMED.test(c)))];
    const points = (Array.isArray(d.points) ? d.points : []).map(p => (Array.isArray(p) ? [num(p[0]), num(p[1])] : p && typeof p === 'object' ? [num(p.lon ?? p.lng), num(p.lat)] : null))
      .filter(p => p && finite(...p) && Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 540);
    const b = Array.isArray(d.bbox) && d.bbox.length === 4 ? d.bbox.map(num) : null;
    const qids = [...new Set(list(d.qids).map(String).filter(q => QID.test(q)))];
    const padding = Number.isFinite(num(d.padding)) ? Math.max(0, num(d.padding)) : 40;
    return { countries, points, bbox: b && finite(...b) && b[1] <= b[3] ? normBox(b) : null, qids, padding, label: d.label ? String(d.label) : '', reset: !!d.reset };
  }
  const isEmpty = t => !t || (!t.countries?.length && !t.points?.length && !t.bbox && !t.qids?.length);
  // Several steps' or places' targets as one.
  function merge(all) {
    const ts = all.filter(Boolean).map(normalize);
    const boxes = ts.map(t => t.bbox).filter(Boolean);
    return { countries: [...new Set(ts.flatMap(t => t.countries))], points: ts.flatMap(t => t.points), bbox: boxes.length ? union(boxes) : null,
      qids: [...new Set(ts.flatMap(t => t.qids))], padding: Math.max(40, ...ts.map(t => t.padding)) };
  }

  /* ---------- boxes [w, s, e, n]: w in [-180, 180), e ≥ w, e - w ≤ 360 ---------- */
  function normBox([w, s, e, n]) {
    let span = e - w; if (span < 0) span += 360;
    if (span >= 360) return [-180, Math.max(-90, s), 180, Math.min(90, n)];
    const w2 = wrap(w); return [w2, Math.max(-90, s), w2 + span, Math.min(90, n)];
  }
  // The smallest box holding all the boxes. Longitudes are arcs on a circle, so the box may cross the date line
  // (Russia is [19.6, 41.2, 190.9, 81.9]): it leaves out the widest stretch of longitude that nothing covers.
  function union(boxes) {
    const bs = boxes.filter(Boolean).map(normBox);
    if (!bs.length) return null;
    const s = minOf(bs.map(b => b[1])), n = maxOf(bs.map(b => b[3]));
    const parts = bs.flatMap(([w, , e]) => (e - w >= 360 ? [[-180, 180]] : e > 180 ? [[w, 180], [-180, e - 360]] : [[w, e]])).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of parts) { const last = merged.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
    let gap = [merged.at(-1)[1], merged[0][0] + 360]; // round the back of the globe
    for (let i = 1; i < merged.length; i++) if (merged[i][0] - merged[i - 1][1] > gap[1] - gap[0]) gap = [merged[i - 1][1], merged[i][0]];
    if (gap[1] - gap[0] <= 0) return [-180, s, 180, n];
    const w = wrap(gap[1]);
    return [w, s, w + 360 - (gap[1] - gap[0]), n];
  }
  const pointBox = p => normBox([p[0], p[1], p[0], p[1]]);
  // At least `span` degrees each way (one battle should still show its region), kept off the poles.
  function expand(box, span = 0) {
    if (!box) return null;
    let [w, s, e, n] = box;
    if (e - w < span) { const c = (w + e) / 2; w = c - span / 2; e = c + span / 2; }
    if (n - s < span) { const c = Math.max(-85 + span / 2, Math.min(85 - span / 2, (s + n) / 2)); s = c - span / 2; n = c + span / 2; }
    return normBox([w, Math.max(-90, s), e, Math.min(90, n)]);
  }
  // Degrees between two boxes (0 when they touch), the shorter way round in longitude.
  function boxGap(a, b) {
    const lat = Math.max(0, b[1] - a[3], a[1] - b[3]);
    const lon = Math.min(...[-360, 0, 360].map(k => Math.max(0, b[0] + k - a[2], a[0] - (b[2] + k))));
    return Math.max(lat, lon);
  }
  const contains = (box, [lon, lat]) => !!box && lat >= box[1] && lat <= box[3] && [-360, 0, 360].some(k => lon + k >= box[0] && lon + k <= box[2]);

  /* ---------- GeoJSON → box ---------- */
  // Outer rings of every polygon (holes do not move a box); points and lines as one list of positions each.
  function shapes(g) {
    if (!g || typeof g !== 'object') return [];
    switch (g.type) {
      case 'FeatureCollection': return g.features.flatMap(shapes);
      case 'Feature': return shapes(g.geometry);
      case 'GeometryCollection': return g.geometries.flatMap(shapes);
      case 'Polygon': return [{ ring: g.coordinates[0] }];
      case 'MultiPolygon': return g.coordinates.map(p => ({ ring: p[0] }));
      case 'Point': return [{ points: [g.coordinates] }];
      case 'MultiPoint': case 'LineString': return [{ points: g.coordinates }];
      case 'MultiLineString': return [{ points: g.coordinates.flat() }];
      default: return [];
    }
  }
  // A ring's box and rough area (square degrees at its latitude), followed across the date line, not round the world.
  function ringBox(ring) {
    const pts = []; let off = 0;
    for (const p of ring || []) {
      const lon = num(p[0]), lat = num(p[1]); if (!finite(lon, lat)) continue;
      let x = lon + off;
      if (pts.length) { const d = x - pts.at(-1)[0]; if (d > 180) { off -= 360; x -= 360; } else if (d < -180) { off += 360; x += 360; } }
      pts.push([x, lat]);
    }
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), s = minOf(ys), n = maxOf(ys);
    let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
    return { box: normBox([minOf(xs), s, maxOf(xs), n]), area: Math.abs(a / 2) * Math.cos(((s + n) / 2) * Math.PI / 180) };
  }
  // The box of a GeoJSON object. With main (the default) a country keeps its main parts only: its largest landmass,
  // any part a fifth its size, and whatever lies close to them (France without French Guiana, Spain without the
  // Canaries, Japan with all four main islands, Russia across the date line).
  function geoBBox(g, { main = true } = {}) {
    const parts = shapes(g);
    const rings = parts.filter(p => p.ring).map(p => ringBox(p.ring)).filter(Boolean);
    const dots = parts.filter(p => p.points).flatMap(p => p.points).map(p => [num(p[0]), num(p[1])]).filter(p => finite(...p)).map(pointBox);
    if (!rings.length) return dots.length ? union(dots) : null;
    let box;
    if (!main || rings.length === 1) box = union(rings.map(r => r.box));
    else {
      rings.sort((a, b) => b.area - a.area);
      box = rings[0].box;
      const big = rings[0].area, reach = Math.max(5, 0.25 * Math.max(box[2] - box[0], box[3] - box[1]));
      for (const r of rings.slice(1)) if (r.area >= 0.2 * big || boxGap(box, r.box) <= reach) box = union([box, r.box]);
    }
    return dots.length ? union([box, ...dots]) : box;
  }
  // A box, a [lon, lat] point, a GeoJSON object, or a list of any of them → one box.
  function boxOf(x) {
    if (!x) return null;
    if (Array.isArray(x) && x.length === 4 && x.every(v => typeof v === 'number')) return normBox(x);
    if (Array.isArray(x) && x.length === 2 && x.every(v => typeof v === 'number')) return pointBox(x);
    if (Array.isArray(x)) return union(x.map(boxOf));
    return x.type ? geoBBox(x) : null;
  }

  /* ---------- countries: ISO3 → Gleditsch–Ward code, main-parts box (whole degrees, rounded outward), common name ----
     Natural Earth 1:50m via world-atlas@2.0.2, made by design/scripts/focus-countries.mjs; codes and names from National
     Analysis. Used when a page has no shape of its own for a country (Kardashev Tracker, Realtime Battlefield), and to
     find countries in what is read whatever a page's own data calls them ("Iran", not "Iran, Islamic Rep."). */
  const COUNTRIES = 'ABW:-71,12,-69,13:Aruba;AFG700:60,29,75,39:Afghanistan;AGO540:11,-19,25,-4:Angola;ALB339:19,39,22,43:Albania;AND232:1,42,2,43:Andorra;ARE696:51,22,57,27:United Arab Emirates;ARG160:-74,-56,-53,-21:Argentina;ARM371:43,38,47,42:Armenia;ASM:-171,-15,-170,-14:American Samoa;ATG58:-62,16,-61,18:Antigua and Barbuda;AUS900:112,-44,154,-10:Australia;AUT305:9,46,18,50:Austria;AZE373:44,38,51,42:Azerbaijan;BDI516:29,-5,31,-2:Burundi;BEL211:2,49,7,52:Belgium;BEN434:0,6,4,13:Benin;BFA439:-6,9,3,16:Burkina Faso;BGD771:88,20,93,27:Bangladesh;BGR355:22,41,29,45:Bulgaria;BHR692:50,25,51,27:Bahrain;BHS31:-79,20,-72,27:Bahamas;BIH346:15,42,20,46:Bosnia and Herzegovina;BLR370:23,51,33,57:Belarus;BLZ80:-90,15,-87,19:Belize;BMU:-65,32,-64,33:Bermuda;BOL145:-70,-23,-57,-9:Bolivia;BRA140:-75,-34,-34,6:Brazil;BRB53:-60,13,-59,14:Barbados;BRN835:114,4,116,6:Brunei;BTN760:88,26,93,29:Bhutan;BWA571:19,-27,30,-17:Botswana;CAF482:14,2,28,11:Central African Republic;CAN20:-142,41,-52,84:Canada;CHE225:5,45,11,48:Switzerland;CHL155:-79,-56,-66,-17:Chile;CHN710:73,18,135,54:China;CIV437:-9,4,-2,11:Ivory Coast;CMR471:8,1,17,14:Cameroon;COD490:12,-14,32,6:Democratic Republic of the Congo;COG484:11,-6,19,4:Republic of the Congo;COL100:-80,-5,-66,13:Colombia;COM581:43,-13,45,-11:Comoros;CPV402:-26,14,-22,18:Cape Verde;CRI94:-86,8,-82,12:Costa Rica;CUB40:-85,19,-74,24:Cuba;CUW:-70,12,-68,13:Curacao;CYM:-82,19,-79,20:Cayman Islands;CYP352:32,34,35,36:Cyprus;CZE316:12,48,19,52:Czech Republic;DEU260:5,47,16,56:Germany;DJI522:41,10,44,13:Djibouti;DMA54:-62,15,-61,16:Dominica;DNK390:8,54,16,58:Denmark;DOM42:-72,17,-68,20:Dominican Republic;DZA615:-9,18,12,38:Algeria;ECU130:-81,-5,-75,2:Ecuador;EGY651:24,21,37,32:Egypt;ERI531:36,12,44,19:Eritrea;ESP230:-10,36,5,44:Spain;EST366:21,57,29,60:Estonia;ETH530:32,3,48,15:Ethiopia;FIN375:20,59,32,71:Finland;FJI950:174,-22,182,-12:Fiji;FRA220:-5,41,10,52:France;FRO:-8,61,-6,63:Faroe Islands;FSM:138,5,163,10:Micronesia;GAB481:8,-4,15,3:Gabon;GBR200:-9,50,2,61:United Kingdom;GEO372:39,41,47,44:Georgia;GHA452:-4,4,2,12:Ghana;GIN438:-16,7,-7,13:Guinea;GMB420:-17,13,-13,14:Gambia;GNB404:-17,10,-13,13:Guinea-Bissau;GNQ411:8,0,12,4:Equatorial Guinea;GRC350:19,34,29,42:Greece;GRD55:-62,12,-61,13:Grenada;GRL:-73,59,-11,84:Greenland;GTM90:-93,13,-88,18:Guatemala;GUM:144,13,145,14:Guam;GUY110:-62,1,-56,9:Guyana;HKG:113,22,115,23:Hong Kong;HND91:-90,12,-83,17:Honduras;HRV344:13,42,20,47:Croatia;HTI41:-75,18,-71,21:Haiti;HUN310:16,45,23,49:Hungary;IDN850:95,-11,141,6:Indonesia;IMN:-5,54,-4,55:Isle of Man;IND750:68,6,98,36:India;IRL205:-11,51,-6,56:Ireland;IRN630:44,25,64,40:Iran;IRQ645:38,29,49,38:Iraq;ISL395:-25,63,-13,67:Iceland;ISR666:34,29,36,34:Israel;ITA325:6,36,19,48:Italy;JAM51:-79,17,-76,19:Jamaica;JOR663:34,29,40,34:Jordan;JPN740:123,24,146,46:Japan;KAZ705:46,40,88,56:Kazakhstan;KEN501:33,-5,42,6:Kenya;KGZ703:69,39,81,44:Kyrgyzstan;KHM811:102,10,108,15:Cambodia;KIR:-160,1,-157,4:Kiribati;KNA60:-63,17,-62,18:Saint Kitts and Nevis;KOR732:126,33,131,39:South Korea;KWT690:46,28,49,31:Kuwait;LAO812:100,13,108,23:Laos;LBN660:35,33,37,35:Lebanon;LBR450:-12,4,-7,9:Liberia;LBY620:9,19,26,34:Libya;LCA56:-62,13,-60,15:Saint Lucia;LIE223:9,47,10,48:Liechtenstein;LKA780:79,5,82,10:Sri Lanka;LSO570:27,-31,30,-28:Lesotho;LTU368:20,53,27,57:Lithuania;LUX212:5,49,7,51:Luxembourg;LVA367:21,55,29,59:Latvia;MAC:113,22,114,23:Macau;MAF:-64,18,-63,19:Saint Martin;MAR600:-18,21,-1,36:Morocco;MCO221:7,43,8,44:Monaco;MDA359:26,45,31,49:Moldova;MDG580:43,-26,51,-12:Madagascar;MDV781:73,3,74,5:Maldives;MEX70:-119,14,-86,33:Mexico;MHL:166,5,172,12:Marshall Islands;MKD343:20,40,24,43:North Macedonia;MLI432:-13,10,5,25:Mali;MLT338:14,35,15,37:Malta;MMR775:92,9,102,29:Myanmar;MNE341:18,41,21,44:Montenegro;MNG712:87,41,120,53:Mongolia;MNP:145,14,146,19:Northern Mariana Islands;MOZ541:30,-27,41,-10:Mozambique;MRT435:-18,14,-4,28:Mauritania;MUS590:57,-21,58,-19:Mauritius;MWI553:32,-18,36,-9:Malawi;MYS820:99,0,120,8:Malaysia;NAM565:11,-29,26,-16:Namibia;NCL:159,-23,169,-19:New Caledonia;NER436:0,11,16,24:Niger;NGA475:2,4,15,14:Nigeria;NIC93:-88,10,-83,16:Nicaragua;NLD210:3,50,8,54:Netherlands;NOR385:4,58,34,81:Norway;NPL790:80,26,89,31:Nepal;NRU:166,-1,167,0:Nauru;NZL920:165,-53,184,-34:New Zealand;OMN698:51,16,60,27:Oman;PAK770:60,23,78,38:Pakistan;PAN95:-84,7,-77,10:Panama;PER135:-82,-19,-68,0:Peru;PHL840:116,5,127,21:Philippines;PLW:131,3,135,8:Palau;PNG910:140,-12,156,-1:Papua New Guinea;POL290:14,49,25,55:Poland;PRI:-68,17,-65,19:Puerto Rico;PRK731:124,37,131,43:North Korea;PRT235:-10,37,-6,43:Portugal;PRY150:-63,-28,-54,-19:Paraguay;PSE:34,31,36,33:Palestine;PYF:-152,-21,-136,-8:French Polynesia;QAT694:50,24,52,27:Qatar;ROU360:20,43,30,49:Romania;RUS365:19,41,191,82:Russia;RWA517:28,-3,31,-1:Rwanda;SAU670:34,16,56,33:Saudi Arabia;SDN625:21,8,39,23:Sudan;SEN433:-18,12,-11,17:Senegal;SGP830:103,1,104,2:Singapore;SLB940:155,-12,167,-6:Solomon Islands;SLE451:-14,6,-10,10:Sierra Leone;SLV92:-91,13,-87,15:El Salvador;SMR331:12,43,13,44:San Marino;SOM520:40,-2,52,12:Somalia;SRB345:18,42,23,47:Serbia;SSD626:24,3,36,13:South Sudan;STP:6,0,8,2:São Tomé and Príncipe;SUR115:-59,1,-53,6:Suriname;SVK317:16,47,23,50:Slovakia;SVN349:13,45,17,47:Slovenia;SWE380:11,55,25,70:Sweden;SWZ572:30,-28,33,-25:Eswatini;SXM:-64,18,-63,19:Sint Maarten;SYC:55,-5,56,-4:Seychelles;SYR652:35,32,43,38:Syria;TCA:-73,21,-71,22:Turks and Caicos Islands;TCD483:13,7,24,24:Chad;TGO461:-1,6,2,12:Togo;THA800:97,5,106,21:Thailand;TJK702:67,36,76,42:Tajikistan;TKM701:52,35,67,43:Turkmenistan;TLS860:124,-10,128,-8:East Timor;TON:-176,-22,-173,-18:Tonga;TTO52:-62,10,-60,12:Trinidad and Tobago;TUN616:7,30,12,38:Tunisia;TUR640:25,35,45,43:Turkey;TWN713:118,21,122,26:Taiwan;TZA510:29,-12,41,0:Tanzania;UGA500:29,-2,35,5:Uganda;UKR369:22,45,41,53:Ukraine;URY165:-59,-35,-53,-30:Uruguay;USA2:172,18,294,72:United States;UZB704:55,37,74,46:Uzbekistan;VCT57:-62,12,-61,14:Saint Vincent and the Grenadines;VEN101:-74,0,-59,13:Venezuela;VGB:-65,18,-64,19:British Virgin Islands;VIR:-66,17,-64,19:US Virgin Islands;VNM815:102,8,110,24:Vietnam;VUT:166,-21,170,-13:Vanuatu;WSM:-173,-15,-171,-13:Samoa;XKX347:20,41,22,44:Kosovo;YEM:42,12,55,19:Yemen;ZAF560:16,-35,33,-22:South Africa;ZMB551:21,-19,34,-8:Zambia;ZWE552:25,-23,34,-15:Zimbabwe';
  // Other names a narration may use: short forms, initials, parts of a country and a few former names.
  const ALIASES = { USA: ['United States of America', 'USA', 'U.S.', 'US', 'America'], GBR: ['Britain', 'Great Britain', 'UK', 'U.K.', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
    RUS: ['Russian Federation', 'Soviet Union', 'USSR'], COD: ['DR Congo', 'DRC', 'Congo-Kinshasa', 'Congo', 'Zaire'], COG: ['Congo-Brazzaville'], CIV: ['Côte d’Ivoire', "Côte d'Ivoire", "Cote d'Ivoire"],
    CZE: ['Czechia'], MMR: ['Burma'], PSE: ['Gaza', 'Gaza Strip', 'West Bank'], TUR: ['Türkiye', 'Turkiye'], IRN: ['Persia'], LKA: ['Ceylon'], THA: ['Siam'], SWZ: ['Swaziland'],
    CPV: ['Cabo Verde'], TLS: ['Timor-Leste'], MKD: ['Macedonia'], NLD: ['Holland'], KOR: ['Republic of Korea'], PRK: ['DPRK'], ARE: ['UAE', 'Emirates'], VNM: ['Viet Nam'],
    ZWE: ['Rhodesia'], BIH: ['Bosnia'], KGZ: ['Kyrgyz Republic'], SVK: ['Slovak Republic'], BRN: ['Brunei Darussalam'], LAO: ['Lao PDR'], SYR: ['Syrian Arab Republic'],
    EGY: ['Arab Republic of Egypt'], TWN: ['Republic of China'], CHN: ["People's Republic of China", 'PRC'], DEU: ['West Germany', 'East Germany'] };
  let table = null;
  const countries = () => {
    if (table) return table;
    table = new Map();
    for (const row of COUNTRIES.split(';')) {
      const m = /^([A-Z]{3})(\d*):(-?\d+),(-?\d+),(-?\d+),(-?\d+):(.*)$/.exec(row);
      if (m) table.set(m[1], { gw: m[2] ? +m[2] : null, box: normBox([+m[3], +m[4], +m[5], +m[6]]), name: m[7] });
    }
    return table;
  };
  const gwOf = iso3 => countries().get(iso3)?.gw ?? null;
  const iso3OfGw = gw => { for (const [iso, c] of countries()) if (c.gw === +gw) return iso; return null; };
  // A country's box from the table, by ISO3 or 'gw:<code>'.
  function countryBox(id) {
    const iso = /^gw:\d+$/.test(id) ? iso3OfGw(id.slice(3)) : id;
    return countries().get(iso)?.box || null;
  }
  const countryName = iso3 => countries().get(iso3)?.name || null;
  // Every country as a place to find in a passage (for matchPlaces): its common name and aliases, plus any names a page
  // adds from its own data ([iso3, name] pairs, e.g. National Analysis's "Iran, Islamic Rep.").
  function countryPlaces(extra = []) {
    const names = new Map();
    const add = (iso, n) => { if (iso && n) (names.get(iso) || names.set(iso, new Set()).get(iso)).add(n); };
    for (const [iso, c] of countries()) add(iso, c.name);
    for (const [iso, list] of Object.entries(ALIASES)) list.forEach(n => add(iso, n));
    for (const [iso, n] of extra) add(iso, n);
    return [...names].map(([iso, ns]) => ({ names: [...ns], targets: { countries: [iso] } }));
  }

  // One box for a step's targets. The page places what it can: country(id) and qid(q) return a GeoJSON object, a
  // [lon, lat] point, a box, a list of those, or null (a country it cannot place falls back to the table above).
  function resolve(detail, { country, qid, minSpan = 4 } = {}) {
    const t = normalize(detail), boxes = [];
    for (const id of t.countries) { const b = boxOf(country ? country(id) : null) || countryBox(id); if (b) boxes.push(b); }
    for (const q of t.qids) { const b = boxOf(qid ? qid(q) : null); if (b) boxes.push(b); }
    for (const p of t.points) boxes.push(pointBox(p));
    if (t.bbox) boxes.push(t.bbox);
    return { ...t, box: boxes.length ? expand(union(boxes), minSpan) : null };
  }

  /* ---------- the places a passage names ---------- */
  // entries: [{ names: ['Ukraine'], targets: { countries: ['UKR'] } }, …]. Whole words, written as given (so "Turkey" is
  // the country and "turkey" the bird); longer names first, so "South Sudan" does not also count as "Sudan".
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function matchPlaces(text, entries) {
    text = String(text || '');
    const names = entries.flatMap(en => (en.names || []).filter(n => n && n.length >= 3).map(n => ({ n, en }))).sort((a, b) => b.n.length - a.n.length);
    const taken = [], found = [];
    for (const { n, en } of names) {
      if (!text.includes(n)) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'gu');
      for (let m; (m = re.exec(text));) {
        const a = m.index, b = a + n.length;
        if (taken.some(([x, y]) => a < y && x < b)) continue;
        taken.push([a, b]); found.push(en.targets); break;
      }
    }
    return found.length ? merge(found) : null;
  }

  /* ---------- screen space ---------- */
  // A box on a projection that cannot cross the date line keeps its larger side (Russia without Chukotka's tip).
  function clampWorld(box) {
    if (!box || box[2] <= 180) return box;
    const [w, s, e, n] = box;
    return 180 - w >= e - 180 ? [w, s, 180, n] : [-180, s, e - 360, n];
  }
  // A box's extent in projected pixels, from points along its edges (meridians curve on most world projections).
  function projectBox(box, project, steps = 8) {
    const b = clampWorld(box); if (!b || !project) return null;
    const [w, s, e, n] = b, xs = [], ys = [];
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      if (i > 0 && j > 0 && i < steps && j < steps) continue;
      const p = project([w + (e - w) * i / steps, s + (n - s) * j / steps]);
      if (p && finite(p[0], p[1])) { xs.push(p[0]); ys.push(p[1]); }
    }
    return xs.length ? [[minOf(xs), minOf(ys)], [maxOf(xs), maxOf(ys)]] : null;
  }
  // The zoom (k, x, y as in d3.zoomIdentity.translate(x, y).scale(k)) that fits a pixel extent into a W×H view with
  // `padding` clear. clamp keeps a map that fills its view from showing beyond its edges.
  function fitTransform(ext, [W, H], { padding = 40, maxScale = 12, minScale = 1, clamp = false } = {}) {
    if (!ext || !(W > 0) || !(H > 0)) return { k: 1, x: 0, y: 0 };
    const [[x0, y0], [x1, y1]] = ext, p = Math.max(0, Math.min(padding, W / 4, H / 4));
    const k = Math.max(minScale, Math.min(maxScale, (W - 2 * p) / Math.max(1, x1 - x0), (H - 2 * p) / Math.max(1, y1 - y0)));
    let x = W / 2 - k * (x0 + x1) / 2, y = H / 2 - k * (y0 + y1) / 2;
    if (clamp) { x = Math.min(0, Math.max(W - k * W, x)); y = Math.min(0, Math.max(H - k * H, y)); }
    return { k, x, y };
  }

  /* ---------- browser glue ---------- */
  const reduced = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration = ms => (reduced() ? 0 : ms);
  function injectStyle() {
    if (!root.document || document.getElementById('prp-focus-style')) return;
    const s = document.createElement('style'); s.id = 'prp-focus-style';
    // What the reader is discussing: the module accent, like the narrator's outline on the passage being read.
    s.textContent = '.prp-focus-hit{stroke:var(--prp-accent)!important;stroke-width:2.4px!important;stroke-opacity:1!important;vector-effect:non-scaling-stroke}'
      + 'circle.prp-focus-hit{opacity:1!important;fill-opacity:1!important}'
      + '.prp-focus-reset{position:absolute;top:10px;right:10px;z-index:1000;box-shadow:var(--prp-shadow-1)}'
      + '@media(prefers-reduced-motion:no-preference){.prp-focus-hit{animation:prp-focus-in .9s ease-out}}@keyframes prp-focus-in{from{stroke-opacity:.15}}';
    document.head.appendChild(s);
  }
  // Wire a page: focus(t) gets normalized targets, reset() the way back, request(text, el) may place a passage.
  function listen({ focus, reset, request } = {}) {
    injectStyle();
    root.addEventListener('prp:focus', e => { const t = normalize(e.detail); if (t.reset || isEmpty(t)) reset?.(t); else focus?.(t); });
    if (request) root.addEventListener('prp:focus-request', e => {
      const d = e.detail; if (!d || typeof d !== 'object' || !isEmpty(d.targets && normalize(d.targets))) return;
      const r = request(String(d.text || ''), d.el || null);
      if (r && !isEmpty(normalize(r))) d.targets = r;
    });
  }
  // A d3-zoom map: fit(box, padding) eases to the box (d3's smooth zoom path), reset() back to the page's own view.
  // project() returns the current projection (pages rebuild it on resize); size() the view in viewBox units.
  function d3View({ svg, zoom, project, size, maxScale, clamp = false }) {
    const dims = () => {
      if (size) return size();
      const vb = svg.node().viewBox?.baseVal; if (vb && vb.width) return [vb.width, vb.height];
      const r = svg.node().getBoundingClientRect(); return [r.width, r.height];
    };
    return {
      fit(box, padding = 40) {
        const ext = projectBox(box, project()); if (!ext) return false;
        const t = fitTransform(ext, dims(), { padding, maxScale: maxScale ?? zoom.scaleExtent()[1], clamp });
        svg.interrupt().transition().duration(duration(1100)).call(zoom.transform, root.d3.zoomIdentity.translate(t.x, t.y).scale(t.k));
        return true;
      },
      reset() { svg.interrupt().transition().duration(duration(800)).call(zoom.transform, root.d3.zoomIdentity); },
    };
  }
  // A Leaflet map: fly to the box (shifted so a box across the date line stays whole), or jump when motion is reduced.
  function leafletFit(map, box, { padding = 40, maxZoom } = {}) {
    if (!box) return;
    let [w, s, e, n] = box; if ((w + e) / 2 > 180) { w -= 360; e -= 360; }
    const b = root.L.latLngBounds([[s, w], [n, e]]), opts = { padding: [padding, padding], maxZoom: maxZoom ?? map.getMaxZoom() };
    if (reduced()) map.fitBounds(b, { ...opts, animate: false }); else map.flyToBounds(b, { ...opts, duration: 1.1 });
  }
  // A "Reset view" button over a map that has no ⟲ of its own; shown while the map is focused.
  function resetButton(container, onReset, label = 'Reset view') {
    injectStyle();
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'prp-btn sm prp-focus-reset'; b.hidden = true; b.textContent = `⟲ ${label}`;
    b.title = 'Back to the whole map';
    b.onclick = () => { b.hidden = true; onReset(); };
    container.appendChild(b);
    return { show() { b.hidden = false; }, hide() { b.hidden = true; }, el: b };
  }

  root.PRPFocus = { normalize, isEmpty, merge, normBox, union, expand, contains, geoBBox, boxOf, countryBox, countryName, countryPlaces, gwOf, iso3OfGw,
    resolve, matchPlaces, clampWorld, projectBox, fitTransform, reduced, duration, listen, d3View, leafletFit, resetButton };
})();

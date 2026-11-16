// War Focus: a battle's casualty figures read from its English Wikipedia infobox (BF-08, 16 November 2026).
// Pure functions, no network: scripts/build.mjs fetches the lead section and calls readArticle; tests/warfocus.test.mjs
// checks the reader against real fields read by hand (tests/fixtures/warfocus-infoboxes.json).
//
// The rule (PRP-WAR-FOCUS-FIGURES-DESIGN.md (a)): a wrong number is worse than none, so a line is read only when all of
// it fits, and a line that fits nothing refuses its whole side ("Figures not read").
// · Fields: casualties1–5, one a side in the combatants' order (an absent first or second side makes the sum "at
//   least"); an operation's single `casualties`; an attack's `deaths`/`fatalities`, `injuries`/`injured` and `missing`.
//   Never `notes`, never the article's text.
// · A line: [group:] [label:] items [(claim)], items being number [noun] kind, joined by , ; and / &. A number may be
//   "1,428", "10,000+", "over 300", "1,000–2,000", "1,000 to 2,000", "3,000/4,000", "27 or 28"; "~", "c.", "about",
//   "est." mark it approximate. Kinds: killed (killed, dead, deaths, KIA, drowned, died of wounds, executed), wounded,
//   missing, captured, and casualties (the word, "losses", a bare number, or two kinds joined: "killed and wounded").
// · Never people: aircraft, tanks, ships, guns, horses and anything destroyed, sunk, shot down or damaged (a figure after
//   them on the line goes with them); the sick, deserters, the displaced, those who fled or defected are set aside, and a
//   figure that joins them with the counted kinds ("killed, wounded, sick or captured") refuses the side.
// · Words stay words (Unknown, Heavy, Few, "?", Several thousand, Dozens killed); ordinals and years are no figures.
// · A label on its own line ("Chinese claim:", "Per Russia:", "US estimate:", "Germany:") governs the lines below it,
//   to the next label or rule (---- or <hr>); a bracketed label after its lines ("(French claim)") the lines above it;
//   one in brackets at a line's end, or "according to X", that line. A label of a claim or a figure is whose figures
//   they are (`by`); a country's or unit's name is a group of the side. "… only" marks a part of the battle.
// · Kinds of figure: a claim or a line marked doubtful ({{citation needed}}, {{dubious}}, "Disputed") is disputed; an
//   approximation, a range or "at least" an estimate; else a recorded count (`fact`).
// · A side: within one reading, killed are its deaths; its casualties are its stated total, else the sum of the kinds it
//   gives (killed alone gives no casualties figure). Two readings of the same thing (two claimants) give a range,
//   disputed where they differ by half again; readings of different things (killed by one, wounded by another) are one.
// · The battle: the sum of its sides (VM's sum, an estimate), "at least" where a side gives none; a side's "None" adds
//   nothing; every side's "None" is a recorded zero, one side's zero beside the other's silence no figure.

const CAT_WORDS = [
  // longest first; each [regex, kind]
  [/^(?:killed in action|killed in captivity|died of wounds|died of their wounds|died of injuries|killed or died of wounds)/i, 'k'],
  [/^(?:wounded in action|missing in action|taken prisoner|prisoners of war|prisoners-of-war|prisoners)/i, null],
  [/^(?:fatalities|killed|dead|deaths|death|died|KIA|drowned|executed|murdered)/i, 'k'],
  [/^(?:wounded|injured|injuries|WIA)/i, 'w'],
  [/^(?:missing|MIA)/i, 'm'],
  [/^(?:captured|POWs?|PoWs?|surrendered|taken prisoner)/i, 'c'],
  [/^(?:(?:battle|combat|total|military|overall) )?(?:casualties|losses|casualty)/i, 'all'],
  [/^(?:sick|ill|deserted|deserters|defected|defectors|displaced|fled|evacuated|refugees|hanged|frostbitten|frostbite|non-battle casualties|non-combat casualties|survived|survivors)/i, 'x'],
];
const multiWord = s => ({ 'wounded in action': 'w', 'missing in action': 'm', 'taken prisoner': 'c', 'prisoners of war': 'c', 'prisoners-of-war': 'c', prisoners: 'c' })[s.toLowerCase()];
/** The kind word at the start of `s`: { kind, len } or null. */
function catAt(s) {
  for (const [re, k] of CAT_WORDS) {
    const m = re.exec(s);
    if (!m || !/^(?:[\s,;.:)/&+]|$)/.test(s.slice(m[0].length))) continue;
    return { kind: k || multiWord(m[0]), len: m[0].length };
  }
  return null;
}
// A run of kind words joined by , and or / &: "killed, wounded, or captured", "killed/missing/captured", "KIA, WIA, MIA,
// POW", "dead or wounded". Returns { kinds: Set, len } or null.
function catPhrase(s) {
  let i = 0, kinds = new Set(), first = catAt(s);
  if (!first) return null;
  kinds.add(first.kind); i = first.len;
  for (;;) {
    const j = /^(?:\s*,\s*(?:and\s+|or\s+)?|\s*\/\s*|\s+(?:and|or|&)\s+|\s*&\s*)/i.exec(s.slice(i));
    if (!j) break;
    const next = catAt(s.slice(i + j[0].length));
    if (!next) break;
    kinds.add(next.kind); i += j[0].length + next.len;
  }
  return { kinds, len: i };
}
const ALL = ['k', 'w', 'm', 'c'];
// A set of kinds as the measure it counts: 'k' (deaths), 'x' (set aside), 'all' (casualties), or the parts it joins.
function measureOf(kinds) {
  if (kinds.has('x')) return kinds.size === 1 ? 'x' : 'mixed';
  if (kinds.has('all')) return 'all';
  if (kinds.size === 1 && kinds.has('k')) return 'k';
  if (ALL.every(k => kinds.has(k))) return 'all';
  return 'part';
}

const MATERIEL = /\b(?:tanks?|tankettes?|aircraft|aeroplanes?|airplanes?|planes?|fighters? jets?|bombers?|helicopters?|gunships?|gliders?|seaplanes?|flying boats?|ships?|warships?|destroyers?|frigates?|corvettes?|submarines?|U-boats?|cruisers?|battleships?|battlecruisers?|carriers?|monitors?|gunboats?|boats?|vessels?|barges?|tankers?|freighters?|transports?|merchantmen|landing craft|minesweepers?|trawlers?|vehicles?|APCs?|IFVs?|AFVs?|MBTs?|armou?red (?:cars?|vehicles?|personnel carriers?)|personnel carriers?|trucks?|lorries|lorry|jeeps?|cars?|guns?|artillery|howitzers?|mortars?|cannons?|pieces|rifles|machine ?guns|weapons|launchers?|batteries|SAMs?|SPHs?|SPGs?|drones?|UAVs?|missiles?|rockets?|horses|mules|camels|locomotives?|trains?|wagons?|railcars?|bridges?|buildings?|houses?|villages?|aircrafts|Sabres?|Spitfires?|Hurricanes?|Zeros?|Dakotas?|Albemarles?|Wacos?|MiGs?|Mirages?|Pucaras?|Leopards?|Ratels?|Pumas?|Shermans?|Panzers?|Tigers?|Panthers?)\b|\b[A-Z][A-Za-z]*-?\d+[A-Za-z]*\b|\b\d+\s?mm\b/;
const MATERIEL_VERB = /\b(?:destroyed|sunk|shot down|damaged|scuttled|downed|abandoned|lost|grounded|crashed|seized|recovered|disabled|knocked out|burnt|burned)\b/i;
// "(including Moro River battles)": another battle or campaign counted in (not "(including Yahya Sinwar)").
const WIDER = /\b(?:battles?|campaigns?|operations?|offensives?|fighting|engagements?|sieges?|actions?|assaults?|landings?)\b/i;
const OTHER_KINDS = /\b(?:wounded|injured|missing|captured|prisoners?|imprisoned|POWs?|WIA|MIA|casualties)\b/i;
const PEOPLE_K = /\b(?:killed|dead|deaths?|died|KIA|executed|fatalities)\b/i;
const PEOPLE = /\b(?:killed|dead|deaths?|died|wounded|injured|injuries|missing|captured|casualties|losses|prisoners?|POWs?|KIA|WIA|MIA|executed|fatalities)\b/i;
// People nouns between a number and its kind ("687 soldiers killed", "2 PAF pilots captured", "300 civilians").
const NOUNS = '(?:soldiers?|troops|men|man|personnel|civilians?|sailors|seamen|airmen|aircrew|crew(?:men|members)?|pilots?|guerrillas?|fighters|militants?|militiamen|insurgents?|rebels?|partisans?|police(?:men|officers)?|officers?|other ranks|enlisted men|marines|servicemen|service members|security forces|commandos|paratroopers|volunteers|mercenaries|combatants|people|persons|residents|villagers|children|women|Jews|guardsmen|gendarmes|cadets|students|workers|members|militia|hostages|interpreters?|translators?|contractors?|journalists?|reporters?|doctors?|nurses?|medics?|guards?|aid workers|staff)';
const ADJ = '(?:naval|military|government|enemy|civilian|foreign|security|police|rebel|local|army|regular|allied|coalition|other|more|additional|further|innocent|unarmed|armed)';
const NOUN_RE = new RegExp(`^(?:(?:[A-Z][\\w.'’-]*|[a-z]+-[a-z]+|${ADJ})\\s+){0,3}(?:${NOUNS}|[A-Z][a-z]+(?:ians|ans|is|ese|ish))\\b|^${NOUNS}\\b`);
const WORDS_LEAD = /^(?:unknown|unconfirmed|unclear|heavy|light|high|low|minimal|minor|negligible|moderate|significant|severe|considerable|large|small|substantial|very heavy|very light|few|a few|several(?: hundreds?| thousands?| dozens?)?|hundreds|thousands|tens of thousands|dozens|many|some|numerous|almost all|all|most)\b/i;

// A number at the start of `s`: { low, high, approx, atLeast, len } or null (or { refuse } for what looks like a number
// but is not one surely: an ordinal, a year, an upper bound, a European decimal).
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s*million)?`;
const NUM_RE = new RegExp(String.raw`^(?:(~|≈|c\.|ca\.|circa|about|around|approx\.?|approximately|est\.|est|estimated|roughly|some|nearly|almost|over|more than|at least|in excess of|>|≥)\s*)?${NUM}(\+)?(~)?(?:\s*(–|—|-|to|\/|or)\s*(?:(?:~|c\.|about)\s*)?${NUM}(\+)?)?`, 'i');
const UPPER = /^(?:up to|under|less than|fewer than|<|≤|nearly all|at most)\s*\d/i;
function numAt(s) {
  if (UPPER.test(s)) return { refuse: 'an upper bound' };
  const m = NUM_RE.exec(s);
  if (!m) return null;
  const val = (int, dec, mil) => {
    if (dec != null && !mil) return NaN; // "1.500": a European thousands or a decimal, never read
    const n = +int.replace(/,/g, '') + (dec ? +('0.' + dec) : 0);
    return mil ? Math.round(n * 1e6) : n;
  };
  let low = val(m[2], m[3], m[4]), high = m[8] != null ? val(m[8], m[9], m[10]) : low;
  const after = s.slice(m[0].length);
  if (/^(?:st|nd|rd|th)\b/i.test(after) || /^\d/.test(after)) return { refuse: 'an ordinal' };
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { refuse: 'a decimal' };
  // A range read as "-" between a number and a smaller one is no range ("1,428–9", or a date).
  if (high < low) return { refuse: 'a range backwards' };
  if (m[7] && /^or$/i.test(m[7]) && high - low > Math.max(1, low)) return { refuse: '"or" between far figures' };
  // "4-7,000": thousands written once, or 4 to 7,000? Ends a hundred times apart are not read (the Battle of Taejon).
  if (m[8] != null && low < 100 && high >= low * 100) return { refuse: 'a range whose ends may be in different units' };
  const pre = (m[1] || '').toLowerCase();
  const atLeast = /^(?:over|more than|at least|in excess of|>|≥)$/.test(pre) || !!m[5] || !!m[11];
  const approx = !!pre && !atLeast || !!m[6];
  return { low, high, approx, atLeast, range: high !== low, len: m[0].length, year: m[8] == null && /^\d{4}$/.test(m[2]) && +m[2] >= 1800 && +m[2] <= 2099 };
}

// ---------------------------------------------------------------------------------------------------------------- text
/** The first {{Infobox …}} with a casualty field (balanced braces): { name, params } with lower-case keys, or null. */
export function infoboxOf(text) {
  const re = /\{\{\s*Infobox[ _]([^|}\n]*)/gi;
  let first = null;
  for (let m; (m = re.exec(text || ''));) {
    let j = m.index, depth = 0;
    for (; j < text.length; j++) { if (text.startsWith('{{', j)) { depth++; j++; } else if (text.startsWith('}}', j)) { depth--; j++; if (!depth) break; } }
    const body = text.slice(m.index + 2, j - 1), parts = [];
    let cur = '', d = 0, sq = 0;
    for (let k = 0; k < body.length; k++) {
      const two = body.slice(k, k + 2);
      if (two === '{{') { d++; cur += two; k++; continue; } if (two === '}}') { d--; cur += two; k++; continue; }
      if (two === '[[') { sq++; cur += two; k++; continue; } if (two === ']]') { sq--; cur += two; k++; continue; }
      if (body[k] === '|' && !d && !sq) { parts.push(cur); cur = ''; continue; }
      cur += body[k];
    }
    parts.push(cur);
    const name = parts.shift().trim().replace(/_/g, ' ');
    const params = {};
    // The first value of a name: a later one is a reference's own parameter split off by unbalanced markup (an
    // "access-date=11 Nov 2019" read as the infobox's date).
    for (const p of parts) { const e = p.indexOf('='), k = e > 0 ? p.slice(0, e).trim().toLowerCase() : null; if (k && !(k in params)) params[k] = p.slice(e + 1).trim(); }
    const box = { name, params };
    first ||= box;
    if (Object.keys(params).some(k => FIELD.test(k))) return box;
    re.lastIndex = j;
  }
  return first;
}
const FIELD = /^(?:casualties\d?|deaths|fatalities|injuries|injured|non-fatal injuries|missing)$/;

/** A short citation from a reference's inner text: "Alexander 1986, pp. 440–42", a publisher, a work or a site. */
export function citationOf(inner) {
  const s = String(inner || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const tpl = /\{\{\s*(cite[^|}]*|citation|harvnb|harvp|harv|sfn|sfnp|harvtxt)\s*\|([\s\S]*)\}\}/i.exec(s);
  const clean = t => String(t || '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:\S+\s?([^\]]*)\]/g, '$1').replace(/'{2,}/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\s+/g, ' ').trim();
  if (tpl) {
    const args = splitArgs(tpl[2]), named = {}, pos = [];
    for (const a of args) { const e = a.indexOf('='); if (e > 0 && /^[\w -]+$/.test(a.slice(0, e).trim())) named[a.slice(0, e).trim().toLowerCase()] = clean(a.slice(e + 1)); else pos.push(clean(a)); }
    const page = named.pp || named.pages || named.p || named.page || named.loc || '';
    const pg = page ? `, ${/[–,-]/.test(page) ? 'pp.' : 'p.'} ${page}` : '';
    if (/^(?:harv|sfn)/i.test(tpl[1])) {
      const yearAt = pos.findIndex(x => /^\d{4}[a-z]?$/.test(x));
      const who = (yearAt > 0 ? pos.slice(0, yearAt) : pos.slice(0, 1)).join(' & ');
      return `${who}${yearAt >= 0 ? ' ' + pos[yearAt] : ''}${pg}`.trim();
    }
    const who = named.last || named.last1 || named.author || named.author1 || named.authors || named.editor || named['editor-last'] || '';
    const year = (named.year || named.date || '').match(/\d{4}/)?.[0] || '';
    if (who) return `${who}${year ? ' ' + year : ''}${pg}`;
    const by = named.publisher || named.work || named.website || named.newspaper || named.journal || named.agency || named.title || '';
    return (by ? `${by}${year ? ' ' + year : ''}` : named.url ? hostOf(named.url) : '').slice(0, 90);
  }
  const url = /https?:\/\/[^\s\]|]+/.exec(s);
  const text = clean(s.replace(/\{\{[\s\S]*?\}\}/g, '')).replace(/^\W+|\W+$/g, '');
  if (text && text.length <= 90) return text;
  if (url) return hostOf(url[0]);
  return text.slice(0, 87) + (text.length > 87 ? '…' : '');
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
function splitArgs(s) {
  const out = []; let cur = '', d = 0, sq = 0;
  for (let k = 0; k < s.length; k++) {
    const two = s.slice(k, k + 2);
    if (two === '{{') { d++; cur += two; k++; continue; } if (two === '}}') { d--; cur += two; k++; continue; }
    if (two === '[[') { sq++; cur += two; k++; continue; } if (two === ']]') { sq--; cur += two; k++; continue; }
    if (s[k] === '|' && !d && !sq) { out.push(cur); cur = ''; continue; }
    cur += s[k];
  }
  out.push(cur);
  return out;
}

/** Named references defined in a text: Map name → short citation (a reuse, <ref name=x/>, cites the first). */
export function namedRefs(text) {
  const out = new Map();
  for (const m of String(text || '').matchAll(/<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>([\s\S]*?)<\/ref>/gi)) if (!out.has(m[1].trim())) out.set(m[1].trim(), citationOf(m[2]));
  return out;
}

const DOUBT = /^(?:cn|citation needed|fact|dubious|disputed inline|disputed-inline|third-party inline|unreliable source\??|unreliable sources?|better source needed|better source|failed verification|according to whom|by whom|verify source|self-published inline|clarify|unbalanced inline|non-primary source needed|primary source inline|when|which|who|vague|original research inline|or inline|speculation inline|POV statement|contradictory inline|contradict-inline|verification needed|page needed|full citation needed|incomplete short citation)$/i;
const DROP = /^(?:efn|efn-[a-z]+|notetag|refn|ref label|note label|reflist|notelist|rp|r|page needed|increase|decrease|steady|up|down|small caps|anchor|void|pad|clear|-|tree list\/end|end plainlist|endplainlist|endflatlist|end flatlist|·|•|dot|middot|sfnref|harvid|hidden end|collapse bottom|refbegin|refend|#tag:ref|ref|nb|hr)$/i;
// Inline wrappers keep their text on its line; lists put each item on a line of its own.
const INLINE = /^(?:center|centre|small|smaller|big|larger|nowrap|nobr|no wrap|font|resize|nobold|nobreak|noitalic|italic|bold|hidden|sup|sub|nts|ntsh|formatnum|plain)$/i;
const UNWRAP = /^(?:plainlist|plain list|ubl|unbulleted list|bulleted list|bulletedlist|flatlist|hlist|collapsible list|tree list|center|centre|small|smaller|big|larger|nowrap|nobr|no wrap|font|resize|lang|lang-[a-z]+|transl|nobold|nobreak|noitalic|italic|bold|sort|hidden|hidden begin|collapse top|nbsp|indented plainlist|startplainlist|startflatlist|flat list|sup|sub|tooltip|abbr|abbrlink|cvt|convert|nts|ntsh|formatnum|cl|ublist|vunblist|unbulleted|plain|div col|div col end|ill|interlanguage link)$/i;
const FLAG = /^(?:flagicon|flagdeco|flag icon|flagicon image|flag|flagcountry|flagu|flagu2|flagcountry2|flagdeco2|army|navy|air force|naval|navy\/flag|flagbig|flagathlete|country flag)$/i;

// The field as lines of plain text, each with its references (short citations) and doubt marks; group markers ⟨g:…⟩
// where a flag opens a line.
export function plainLines(raw, named = new Map()) {
  let s = String(raw || '').replace(/<!--[\s\S]*?-->/g, '');
  const refs = [];
  const ref = c => { refs.push(c); return ` ⟦${refs.length - 1}⟧ `; };
  // A reused reference cites its first use; one defined outside the lead section (only its key is here, as ":0" or
  // "nyt3") is named only as a reference, never by a key the reader cannot look up (review P6, 16 November 2026).
  s = s.replace(/<ref[^>]*?\/>/gi, m => { const n = /name\s*=\s*"?([^">/]+?)"?\s*\/>/i.exec(m)?.[1]?.trim(); return ref(n ? named.get(n) || (/^[A-Z][\p{L}'’-]+[ _,]+(?:\d{4}|[A-Z][\p{L}'’-]+[ _,]+\d{4})[a-z]?$/u.test(n) ? n.replace(/_/g, ' ') : 'a named reference in the article') : ''); });
  s = s.replace(/<ref[^>]*>([\s\S]*?)<\/ref>/gi, (m, inner) => ref(citationOf(inner)));
  // Templates, innermost first.
  for (let k = 0; k < 12; k++) {
    const before = s;
    s = s.replace(/\{\{([^{}]*)\}\}/g, (m, body) => {
      const args = splitArgs(body), name = args[0].trim().replace(/_/g, ' '), rest = args.slice(1), pos = rest.filter(a => !/^\s*[\w-]+\s*=/.test(a)).map(a => a.trim());
      if (/^(?:sfn|sfnp|sfnm|harvnb|harvp|harv|harvtxt|harvcolnb)$/i.test(name)) return ref(citationOf(m));
      if (DOUBT.test(name)) return ' ⟨?⟩ ';
      // A note that says its figure covers only part of the battle ("Only between 28 August and 30 September"): the
      // figure is kept as an estimate, at least (review F8).
      if (/^(?:efn|efn-[a-z]+|notetag|refn|nb)$/i.test(name) && PART_NOTE.test(rest.join(' '))) return ' ⟨~⟩ ';
      if (FLAG.test(name)) return ` ⟨g:${(pos[0] || '').replace(/\.svg$/i, '').replace(/^Flag of (?:the )?/i, '')}⟩ `;
      if (/^(?:circa|c\.|ca\.|c)$/i.test(name)) return `c. ${pos[0] || ''}`;
      if (/^(?:approx|aprx|approximately|approx\.)$/i.test(name)) return `~${pos[0] || ''}`;
      if (/^(?:estimated|est\.?|estimate)$/i.test(name)) return `est. ${pos[0] || ''}`;
      if (/^(?:ndash|snd|spaced ndash|en dash|–)$/i.test(name)) return '–';
      if (/^(?:mdash|spaced mdash|em dash)$/i.test(name)) return ' — ';
      if (/^(?:br|break|crlf|linebreak|hr|horizontal rule)$/i.test(name)) return /^h/i.test(name) ? '\n----\n' : '\n';
      if (/^nbsp$/i.test(name)) return ' ';
      if (/^(?:tooltip|abbr|abbrlink)$/i.test(name)) return pos[0] || '';
      if (/^(?:cvt|convert)$/i.test(name)) return pos.slice(0, 2).join(' ');
      if (/^(?:lang|transl)$/i.test(name)) return pos.at(-1) || '';
      if (/^sort$/i.test(name)) return pos[1] || pos[0] || '';
      if (/^(?:ill|interlanguage link)$/i.test(name)) return pos[0] || '';
      if (DROP.test(name) || /^#tag/i.test(name)) return '';
      if (INLINE.test(name)) return pos.join(' ');
      if (UNWRAP.test(name)) return '\n' + pos.join('\n') + '\n';
      // Any other template: dropped when it holds no figure, else marked so that its line is refused.
      return /\d/.test(body) ? ' ⟨t⟩ ' : '';
    });
    if (s === before) break;
  }
  s = s.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s?([^\]]*)\]/g, '$1');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n----\n').replace(/<\/?(?:small|big|span|div|sup|sub|abbr|s|u|i|b|center|nowiki|p|font|li|ul|ol|em|strong)\b[^>]*>/gi, '').replace(/'{2,}/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—').replace(/&#126;|&tilde;/g, '~').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/：/g, ':').replace(/[​‎‏]/g, '');
  const out = [];
  for (let line of s.split('\n')) {
    const lineRefs = [];
    line = line.replace(/⟦(\d+)⟧/g, (m, n) => { if (refs[+n]) lineRefs.push(refs[+n]); return ' '; });
    const doubt = /⟨\?⟩/.test(line), part = /⟨~⟩/.test(line);
    line = line.replace(/⟨\?⟩|⟨~⟩/g, ' ').replace(/^[\s*#:;•·]+/, '').replace(/^-\s+(?=\d)/, '').replace(/[ \t]+/g, ' ').trim();
    if (!line && !lineRefs.length) continue;
    out.push({ text: line, refs: lineRefs, doubt, part });
  }
  // A phrase of kinds broken across lines ("150,000 killed,<br>wounded or captured"): one line again, so it is read as
  // the casualties it names, never as the killed alone (review F1, the Second Jassy–Kishinev offensive).
  for (let i = 1; i < out.length; i++) {
    // and a bare figure with its kinds on the next line ("11,609<br>killed and wounded, captured or missing").
    while (i < out.length && ((KIND_END.test(out[i - 1].text) && KIND_START.test(out[i].text)) || (/(?:^|[\s:])[~c.]*\d[\d,]*\+?$/.test(out[i - 1].text) && KIND_ONLY(out[i].text)))) {
      const a = out[i - 1], b = out[i];
      out[i - 1] = { text: `${a.text} ${b.text}`, refs: [...a.refs, ...b.refs], doubt: a.doubt || b.doubt, part: a.part || b.part };
      out.splice(i, 1);
    }
  }
  return out;
}
const KIND_END = /\b(?:killed|dead|wounded|injured|missing|captured|KIA|WIA|MIA)\s*(?:,|\band|\bor|&)$/i;
const KIND_START = /^(?:(?:and|or|&)\s+)?(?:wounded|injured|missing|captured|taken prisoner|prisoners|POWs?|WIA|MIA)\b/i;
// A line of kind words alone, in lower case ("wounded or captured"): after a figure on the line above it, its kinds may
// be that figure's, so the side is not read (review F1).
const KIND_ONLY = s => { const c = catPhrase(s); return !!c && c.len === s.length && /^[a-z]/.test(s); };
const PART_NOTE = /\bonly\b|\bbetween\b[\s\S]*\band\b|\buntil\b|\bexcluding\b|\bnot including\b|\bpartial\b|\bincomplete\b/i;

// --------------------------------------------------------------------------------------------------------------- lines
const CLAIM = /\b(?:claims?|claimed|allege[sd]?|alleged|propaganda|unconfirmed|unverified|disputed)\b/i;
const ESTIMATE = /\b(?:estimates?|estimated|estimation|est|approximat\w*)\b/i;
// A label or bracket that names a phase or a cause of the deaths ("by airstrikes", "during the ground offensive"): its
// figure is a part of the battle, not a rival count of the same dead (review F5, the Battle of Mukalla).
const PHASE = /\b(?:during (?:the )?(?:ground|air|first|second|third|initial|final|assault|offensive|siege|counter\S*)|phase|ground offensive|ground assault|ground fighting|air ?strikes?|air raids?|by air|bombing|bombardment|shelling|counter-?attacks?|counter-?offensive)\b/i;
const SOURCE = /\b(?:per|according to|reports?|reported|data|figures?|sources?|records?|count|counts|official|book|study|studies|archives?|statistics|historians?|version|ministry|tally|registers?|census|monitors?|observatory|SOHR|UN|OCHA|ACLED|UCDP|Airwars)\b/i;
const PARTIAL = /\bonly\b|\bincomplete\b|\bpartial\b|\bexcluding\b/i;
const MONTH = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/;
const classify = label => (PARTIAL.test(label) ? 'partial' : CLAIM.test(label) ? 'claim' : ESTIMATE.test(label) ? 'estimate' : SOURCE.test(label) ? 'source' : 'group');
const byName = label => label.replace(/^(?:[Pp]er|[Aa]ccording to)\s+(?:the\s+)?/, '').replace(/\s*:\s*$/, '').trim();
// A recorded zero. "None reported" and "None known" are words, not zeros: nothing reported is not none (review F11).
const ZERO = /^(?:none|nil|no casualties|no losses|no deaths|no fatalities|no dead|no killed|zero|0|0 killed|0 dead|0 casualties)$/i;

/** One line read: { kind: 'sep'|'label'|'back'|'zero'|'words'|'flag'|'materiel'|'skip'|'items'|'refused', … }. */
export function readLine(text0, { field = 'casualties' } = {}) {
  let text = text0.replace(/\s+/g, ' ').trim();
  let group = null;
  const g = /^⟨g:([^⟩]*)⟩\s*:?\s*/.exec(text);
  if (g) { group = g[1].trim() || 'flag'; text = text.slice(g[0].length).trim(); }
  text = text.replace(/⟨g:[^⟩]*⟩/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '').trim();
  if (/^-{3,}$|^—{2,}$|^_{3,}$/.test(text)) return { kind: 'sep' };
  if (!text) return group ? { kind: 'label', group } : { kind: 'skip' };
  // A ship's or aircraft's name template ("Frigate {{ship|…}} scuttled") on a line about materiel is materiel.
  if (/⟨t⟩/.test(text) && !PEOPLE.test(text) && (MATERIEL_VERB.test(text) || MATERIEL.test(text.replace(/⟨t⟩/g, '')))) return { kind: 'materiel' };
  if (/⟨t⟩/.test(text)) return { kind: 'refused', why: 'a template the reader does not know' };
  // Deaths "from all causes", or with disease, are no battle figure; a whole line about them is not read.
  if (/\ball causes\b|\bdisease\b|\bstarvation\b|\bnon-battle\b(?! casualties$)/i.test(text) && /\d/.test(text)) return { kind: 'refused', why: 'deaths from every cause, not in battle' };
  // "Total:" or "Total casualties:" opens the side's total.
  let total = false;
  // "Total dead: 65+" is the side's total, of the kind it names.
  let totalCat = null;
  const t = /^(?:total|in total|overall|grand total|combined)(?:\s+(casualties|losses|dead|deaths|killed|wounded|captured|missing))?\s*:?\s*(?=\d|~|c\.|about|approx|est|over|at least|more than|>)/i.exec(text);
  if (t) { total = true; totalCat = t[1] ? labelCat(t[1]) : null; text = text.slice(t[0].length).trim(); }
  // A wholly bracketed line: a label for the lines above it, or a breakdown of the line above.
  const br = /^\(([^()]*)\)$/.exec(text);
  if (br) {
    const inner = br[1].trim();
    if (/\d/.test(inner)) return /^(?:\d[\d,]*\+?\s+[\p{L} .'-]+?)(?:\s*[,;]\s*(?:and\s+)?\d[\d,]*\+?\s+[\p{L} .'-]+?)*$/u.test(inner) ? { kind: 'skip', why: 'a breakdown' } : { kind: 'refused', why: 'a bracketed line with figures' };
    const c = classify(inner);
    return c === 'group' ? { kind: 'refused', why: 'a bracketed line' } : { kind: 'back', by: byName(inner), byKind: c };
  }
  // A label: "X:" alone, or "X: figures" (a group, a claim, a source, an estimate, or a part of the battle).
  let label = null;
  const lm = /^([^:]{1,70}?)\s*:\s*(.*)$/.exec(text);
  if (lm && !/^\d[\d,]*$/.test(lm[1]) && !/^(?:~|c\.|about|est\.?\s*\d)/i.test(lm[1])) {
    const head = lm[1].trim(), body = lm[2].trim();
    const digits = head.replace(/\b\d+(?:st|nd|rd|th)\b/gi, '').replace(/\b(?:18|19|20)\d\d\b/g, ''); // "2nd December only", "1962 book"
    if (/\d/.test(digits) && !PARTIAL.test(head)) return { kind: 'refused', why: 'a label with figures' };
    if (head.split(/\s+/).length > 10) return { kind: 'refused', why: 'prose' };
    label = { text: head, kind: classify(head) };
    // A heading ("Casualties:", "Civilian deaths:") is a group; a longer label that says what was counted ("Surrendered
    // and captured following blockade and bombings:") changes what the figures below it are, so it is not read.
    if (label.kind === 'group' && head.split(/\s+/).length > 3 && /\b(?:killed|dead|deaths?|wounded|injured|missing|captured|surrendered|prisoners?|casualties|losses|died)\b/i.test(head)) return { kind: 'refused', why: 'a label that says what was counted' };
    const tl = /^(?:total|in total|overall|grand total)(?:\s+(casualties|losses|dead|deaths|killed|wounded|captured|missing))?$/i.exec(head);
    if (!body && tl) return { kind: 'label', total: true, cat: tl[1] ? labelCat(tl[1]) : null };
    if (!body) return label.kind === 'group' ? { kind: 'label', group: head, cat: labelCat(head) } : { kind: 'label', by: byName(head), byKind: label.kind, cat: labelCat(head) };
    text = body;
    const t2 = /^(?:total|in total)\s*:?\s*/i.exec(text);
    if (t2 && /\d/.test(text.slice(t2[0].length, t2[0].length + 3))) { total = true; text = text.slice(t2[0].length); }
  }
  if (/^disputed$|^contested$|^unconfirmed$|^unverified$/i.test(text)) return { kind: 'flag' };
  // A figure's owner at the line's end: "(Iranian claim)", "(per the SOHR)", "according to X".
  let by = null, byKind = null, approxTail = false;
  for (let k = 0; k < 3; k++) {
    const tail = /\s*\(([^()]*)\)\s*$/.exec(text);
    const acc = /\s+(?:according to|per)\s+(.+)$/i.exec(text);
    if (acc && !/\(/.test(acc[1].replace(/\([^()]*\)/g, ''))) { by = byName(acc[1]); byKind = CLAIM.test(acc[1]) ? 'claim' : 'source'; text = text.slice(0, acc.index).trim(); continue; }
    if (!tail) break;
    const inner = tail[1].trim();
    if (/^(?:estimates?|estimated|est\.?|approx\.?|approximate|approximately|estimation)$/i.test(inner)) { approxTail = true; text = text.slice(0, tail.index).trim(); continue; }
    if (/^(?:counted|confirmed|reported|official|recorded|verified)$/i.test(inner)) { text = text.slice(0, tail.index).trim(); continue; }
    if (/^(?:per|according to)\b/i.test(inner) || CLAIM.test(inner) || (ESTIMATE.test(inner) && inner.split(/\s+/).length > 1) || (SOURCE.test(inner) && !/\d/.test(inner) && !/^(?:killed|dead|wounded)/i.test(inner))) {
      by = byName(inner); byKind = CLAIM.test(inner) ? 'claim' : ESTIMATE.test(inner) ? 'estimate' : 'source'; text = text.slice(0, tail.index).trim(); continue;
    }
    if (PARTIAL.test(inner) || MONTH.test(inner)) return { kind: 'refused', why: 'a figure for part of the battle or a period' };
    break;
  }
  const base = { group, total, by: by ?? (label && label.kind !== 'group' ? byName(label.text) : null), byKind: byKind ?? (label && label.kind !== 'group' ? label.kind : null), labelGroup: label?.kind === 'group' ? label.text : null, cat: totalCat || (label ? labelCat(label.text) : null), scope: label && !by ? label.kind : null, approxTail, tailBy: !!by };
  // A small count in words at the start ("One killed", an attack's "Two"): its figure.
  const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  text = text.replace(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?=\s+(?:killed|dead|wounded|injured|missing|captured|civilians?|soldiers?|people|men)\b|\s*$)/i, w => String(WORD_NUM[w.toLowerCase()]));
  if (/^0(?: killed| dead| casualties)?$/.test(text)) return { ...base, kind: 'zero' };
  const noDigits = !/\d/.test(text.replace(/\b\d+(?:st|nd|rd|th)\b/gi, ''));
  if (noDigits) {
    if (ZERO.test(text)) return { ...base, kind: 'zero' };
    const zp = /^(none|nil|no casualties|no losses|no deaths)\s*\(([^()]*)\)$/i.exec(text);
    if (zp) return { ...base, kind: 'zero', partial: true };
    // Materiel in words ("Several Stryker armoured fighting vehicles") is no reading of people (review P12).
    if (!PEOPLE.test(text) && (MATERIEL_VERB.test(text) || MATERIEL.test(text))) return { kind: 'materiel' };
    if (PEOPLE.test(text) || WORDS_LEAD.test(text) || /^\?+$/.test(text)) return { ...base, kind: 'words', words: text, cats: wordCats(text) };
    // "Per PAVN", "According to the UN" without a colon: whose figures follow.
    if (/^(?:per|according to)\s+\S/i.test(text) && text.split(/\s+/).length <= 8) return { kind: 'label', group, by: byName(text), byKind: CLAIM.test(text) ? 'claim' : 'source' };
    // A name alone, every word capitalised ("Other UN", "British Sector", "North Korea"): a group of the side.
    if (/^[A-Z][\w.'’()-]*(?: (?:[A-Z0-9][\w.'’()-]*|of|the|and|de|du|la|von|al|el|da|troops|forces|soldiers|army|navy|civilians|militia|police|personnel|units?|sector|front|side|fleet))*$/.test(text) && text.split(/\s+/).length <= 5 && !MATERIEL.test(text) && !MATERIEL_VERB.test(text) && !CLAIM.test(text) && !WORDS_LEAD.test(text) && !/^(?:None|Nil|See|Disputed|N\/A)\b/i.test(text)) return { kind: 'label', group: text };
    return { ...base, kind: 'words', words: text, cats: wordCats(text) };
  }
  // A line that opens with words: materiel ("HMS Hood sunk", "Antonov An-225 Mriya destroyed"), or words then figures
  // ("Unknown, at least 2 killed"), or "including …" (the line above's breakdown).
  let sub = false;
  const inc = /^(?:including|incl\.?|of whom|of which|among them)\s+/i.exec(text);
  if (inc) { sub = true; text = text.slice(inc[0].length); }
  const words = [];
  const wl = /^((?:unknown|heavy|light|several|dozens|hundreds|many|few)[^,;\d]*)[,;]\s*(?=[\d~>]|over|at least|more than|about|c\.|some)/i.exec(text);
  if (wl) { words.push({ words: wl[1].trim(), cats: wordCats(wl[1]) }); text = text.slice(wl[0].length); }
  if (!numAt(text) && !/^(?:est\.|estimated)\s/i.test(text)) {
    if (!PEOPLE.test(text) && (MATERIEL_VERB.test(text) || MATERIEL.test(text))) return { kind: 'materiel' };
    if (/^(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s/i.test(text) && (MATERIEL_VERB.test(text) || MATERIEL.test(text)) && !/\b(?:killed|dead|wounded|injured)\b/i.test(text)) return { kind: 'materiel' };
    return { kind: 'refused', why: 'prose' };
  }
  const parsed = readItems(text, { field });
  if (parsed.refused) return { kind: 'refused', why: parsed.refused };
  if (!parsed.items.length && !parsed.words.length) return { kind: 'materiel' };
  return { ...base, kind: 'items', items: parsed.items.map(i => ({ ...i, sub: i.sub || sub, approx: i.approx || approxTail })), words: [...words, ...parsed.words] };
}
// What a label says its figures count ("Estimated Iraqi civilian fatalities:"): the kinds a bare figure below it is.
const labelCat = s => { const c = wordCats(s); return c.has('all') ? null : [...c]; };
const wordCats = s => { const c = new Set(); for (const [re, k] of [[/\b(?:killed|dead|deaths?|died|KIA|executed|fatalit)/i, 'k'], [/\b(?:wounded|injured|injuries|WIA)/i, 'w'], [/\b(?:missing|MIA)/i, 'm'], [/\b(?:captured|prisoners?|POWs?|surrendered)/i, 'c']]) if (re.test(s)) c.add(k); return c.size ? c : new Set(['all']); };

// Items on a line: "93 killed, 58 wounded, and 63 captured", "129 officers and 2,834 soldiers killed", "23,774 (7,878
// killed)", "1,600", "~3,000/4,000 killed, several thousands injured".
function readItems(text0, { field }) {
  const items = [], words = [];
  let s = text0.trim(), materiel = false, sub = false, k = 0;
  const dflt = field === 'deaths' || field === 'fatalities' ? 'k' : field === 'injuries' || field === 'injured' || field === 'non-fatal injuries' ? 'w' : field === 'missing' ? 'm' : 'all';
  while (s && k++ < 20) {
    let approx = false;
    const pre = /^(?:est\.|estimated)\s+/i.exec(s);
    if (pre) { approx = true; s = s.slice(pre[0].length); }
    // Words in place of a figure: "dozens wounded", "several thousands injured", "unknown wounded".
    if (!/^\d/.test(s) && !numAt(s)) {
      const w = /^((?:unknown|unconfirmed|several|dozens|hundreds|thousands|many|few|some|heavy|light|numerous)(?:\s+(?:of\s+)?[\p{L}-]+){0,3}?)\s*(?=$|[,;]|\s+and\s)/iu.exec(s);
      if (w && !materiel) { words.push({ words: w[1].trim(), cats: wordCats(w[1]) }); s = s.slice(w[0].length); }
      else if (materiel) break; // the rest of a line about materiel
      else return { refused: 'words the reader cannot place' };
    } else {
      // "129 officers and 2,834 soldiers killed": the officers and the men together.
      const om = /^(\d[\d,]*)\s+officers?\s+and\s+(\d[\d,]*)\s+(?:soldiers|men|other ranks|enlisted men|NCOs and men)\s+/i.exec(s);
      let n;
      if (om) { const v = +om[1].replace(/,/g, '') + +om[2].replace(/,/g, ''); n = { low: v, high: v, approx: false, atLeast: false, len: om[0].length - 1 }; }
      else n = numAt(s);
      if (!n) return { refused: 'no figure where one should be' };
      if (n.refuse) return { refused: n.refuse };
      s = s.slice(n.len).trim();
      s = s.replace(/^(?:estimated|est\.)\s+/i, () => { approx = true; return ''; });
      let noun = null;
      const nm = NOUN_RE.exec(s);
      if (nm) { noun = nm[0].trim(); s = s.slice(nm[0].length).trim(); }
      // Materiel: the thing after the figure, up to the next separator.
      const head = s.split(/\s*[,;]\s*|\s+and\s+(?=\d)/)[0];
      if (!noun && (MATERIEL.test(head) || /^[\w\s'.()-]{0,40}?\b(?:destroyed|sunk|shot down|damaged|scuttled|downed|abandoned|grounded|crashed|seized|recovered|disabled|knocked out)\b/i.test(head))) {
        materiel = true; s = s.slice(head.length).trim();
      } else if (materiel && !noun && !/^(?:killed|dead|wounded|injured|missing)\b/i.test(s)) {
        // a figure after materiel with no people of its own ("…tanks destroyed, at least 2 captured"): the same materiel
        s = s.slice(head.length).trim();
      } else {
        let kinds = null, bare = false;
        s = s.replace(/^(?:severely|seriously|lightly|slightly|critically|mortally|badly|gravely)\s+(?=wounded|injured)/i, '');
        const cp = catPhrase(s);
        if (cp) { kinds = cp.kinds; s = s.slice(cp.len).trim(); }
        else {
          const pc = /^\(\s*([^()]*?)\s*\)/.exec(s), inner = pc && catPhrase(pc[1]);
          if (inner && inner.len === pc[1].length) { kinds = inner.kinds; s = s.slice(pc[0].length).trim(); }
        }
        if (!kinds) {
          if (s && !/^(?:[,;(]|and\b|\/|&|\+)/i.test(s)) return { refused: 'a figure with words the reader cannot place' };
          kinds = new Set([dflt]); bare = true;
        }
        if (n.year && !cp && !noun) return { refused: 'a year' };
        const measure = measureOf(kinds);
        if (measure === 'mixed') return { refused: 'the sick, deserters or the displaced counted with the casualties' };
        s = s.replace(/^(?:in action|in total|total|overall|confirmed|reported|in all)\b/i, '').trim();
        items.push({ kinds: [...kinds].sort(), measure, low: n.low, high: n.high, approx: approx || n.approx, atLeast: n.atLeast, range: n.range, noun, sub, ...(bare ? { bare: true } : {}) });
      }
    }
    if (!s) break;
    // A bracketed breakdown after an item: "(7,878 killed)" under a figure of no stated kind, "(11 from friendly fire)",
    // "(~70 executed)", "(including 2,000 killed)" are not added; the first is the figure's deaths.
    const pb = /^\(([^()]*)\)\s*/.exec(s);
    if (pb) {
      s = s.slice(pb[0].length).trim();
      // "(in the town of Belchite)", "(during the first assault)": a figure for part of the battle, at least and approximate.
      if (/^(?:in|at|during|from|until|on|near|around|for|before|after|only)\b/i.test(pb[1].trim()) && items.length) { const l = items.at(-1); l.approx = true; l.atLeast = true; }
      // "(including Moro River battles)": a count that takes in another battle, wider than this one: an estimate (F8).
      if (/^(?:including|incl\.?|includes)\s/i.test(pb[1].trim()) && !/\d/.test(pb[1]) && WIDER.test(pb[1]) && items.length) items.at(-1).approx = true;
      // "(included those who surrendered and defected)": a count with those who are no casualties in it is not read.
      if (/\binclud/i.test(pb[1]) && /\b(?:sick|deserted|deserters|defected|defectors|displaced|fled|refugees)\b/i.test(pb[1])) return { refused: 'a count that includes the sick, deserters or others who are no casualties' };
      const inner = pb[1].replace(/^(?:including|incl\.?|of whom|of which)\s+/i, '').trim(), last = items.at(-1);
      // A figure in the brackets, with or without "~", "c." or "about" ("(~40,000 killed)", review F4): a total's own
      // killed are its deaths; one of the killed that cannot be read surely refuses the line rather than being lost.
      if (/^(?:~|≈|c\.|ca\.|about|approx\.?|approximately|some|over|at least|more than)?\s*\d/i.test(inner) && last && last.measure === 'all') {
        const r = readItems(inner, { field });
        // Read whole, or else item by item ("19 killed, 515 wounded, 17 unspecified"): the one figure of the killed.
        const ks = r.refused ? inner.split(/\s*[,;]\s*/).map(x => readItems(x, { field })).filter(x => !x.refused).flatMap(x => x.items).filter(i => i.measure === 'k') : r.items.filter(i => i.measure === 'k');
        if (ks.length === 1) items.push({ ...ks[0], sub: true });
        // The killed alone in brackets, not read surely: the line is refused rather than its deaths lost.
        else if (PEOPLE_K.test(inner) && !OTHER_KINDS.test(inner)) return { refused: 'a figure of the killed in brackets that VM cannot read surely' };
      }
      s = s.replace(/^[,;]\s*/, '');
      continue;
    }
    const inc = /^(?:including|incl\.?|of whom|of which|among them)\s+/i.exec(s);
    if (inc) { s = s.slice(inc[0].length); sub = true; continue; }
    const sep = /^(?:,\s*(?:and|plus)\s+|;\s*(?:and\s+)?|,\s*|\s*\/\s*|and\s+|&\s*|\+\s*|plus\s+)/i.exec(s);
    if (!sep) return { refused: 'words after a figure' };
    s = s.slice(sep[0].length).trim();
  }
  return { items, words };
}

// ---------------------------------------------------------------------------------------------------------------- sides
const WEAK = { fact: 0, estimate: 1, disputed: 2 };
const weakest = list => list.reduce((a, b) => (WEAK[b] > WEAK[a] ? b : a), 'fact');
const itemStatus = (it, line, reading) => (line.doubt || reading.byKind === 'claim' || line.byKind === 'claim' || line.lineKind === 'claim' ? 'disputed' : it.approx || it.range || it.atLeast || reading.byKind === 'estimate' || line.lineKind === 'estimate' || line.byKind === 'estimate' || reading.partial ? 'estimate' : 'fact');

/** A side's field read: { readings, deaths, cas, zero, words, refused, flagged, refs }. `field` names the field (an
 *  attack's deaths field counts a bare number as killed). */
export function readSide(raw, { named = new Map(), field = 'casualties' } = {}) {
  const lines = plainLines(raw, named), side = { readings: [], words: [], refused: null, zero: null, flagged: false, refs: [] };
  const readings = new Map(), key = (by, kind) => by || '';
  const get = (by, byKind, partial) => { const k = key(by); if (!readings.has(k)) readings.set(k, { by: by || null, byKind: byKind || null, partial: !!partial, lines: [], words: [], zero: null, refs: [] }); return readings.get(k); };
  let scope = null, group = 0, groupNames = new Map(), pending = [], gseq = 0, totalNext = false, gNamed = false, groupBy = null, scopeCat = null;
  const groupId = name => { if (!groupNames.has(name)) groupNames.set(name, ++gseq); return groupNames.get(name); };
  let prevItems = false;
  for (const l of lines) {
    const r = readLine(l.text, { field });
    if (r.kind === 'refused') { side.refused = { text: l.text, why: r.why }; continue; }
    const afterFigure = prevItems; prevItems = r.kind === 'items';
    if (r.kind === 'words' && afterFigure && KIND_ONLY(l.text.trim())) { side.refused = { text: l.text, why: 'kinds on a line of their own after a figure, which may be that figure\'s' }; continue; }
    // A note on the line saying its figure covers part of the battle only: an estimate, at least (F8).
    if (l.part && r.kind === 'items') r.items = r.items.map(i => ({ ...i, approx: true, atLeast: true }));
    // "X: figures" then "Y: figures": Y is beside X, not a group inside X's reading (review F6); only a label alone on
    // its line governs the labelled lines below it.
    if (scope?.inline && (r.labelGroup || (r.kind === 'label' && r.group))) scope = null;
    if (r.kind === 'skip' || r.kind === 'materiel') { if (l.refs.length && scope) get(scope.by, scope.byKind, scope.partial).refs.push(...l.refs); continue; }
    if (r.kind === 'sep') { scope = null; group = ++gseq; gNamed = false; groupBy = null; scopeCat = null; pending = []; totalNext = false; continue; }
    if (r.kind === 'flag') { side.flagged = true; continue; }
    if (r.kind === 'label' && r.total) { totalNext = true; scopeCat = r.cat || null; continue; }
    if (r.kind === 'label') {
      totalNext = false;
      if (r.group) { group = groupId(r.group + '#' + gseq); gNamed = true; groupBy = null; scopeCat = r.cat || null; if (!r.by) { pending = []; continue; } }
      // A flag with whose figures they are ("⟨South Vietnam⟩ Per South Vietnam"): that group's source, not another reading.
      if (r.group && r.by) { groupBy = { by: r.by, kind: r.byKind }; pending = []; continue; }
      scope = r.by ? { by: r.by, byKind: r.byKind, partial: r.byKind === 'partial' } : scope;
      scopeCat = r.cat || scopeCat;
      if (l.refs.length && scope) get(scope.by, scope.byKind, scope.partial).refs.push(...l.refs);
      pending = [];
      continue;
    }
    if (r.kind === 'back') {
      // "(French claim)" after its lines: those lines are that claim's.
      for (const p of pending) p.by = r.by, p.byKind = r.byKind;
      pending = []; scope = null;
      continue;
    }
    if (r.group) { group = groupId(r.group + '#' + gseq); gNamed = true; groupBy = null; }
    if (r.labelGroup) { group = groupId(r.labelGroup + '#' + gseq); gNamed = true; groupBy = null; }
    if (r.scope && r.scope !== 'group') scope = { by: r.by, byKind: r.byKind, partial: r.byKind === 'partial', inline: true };
    if (r.total && !r.by && scope?.partial && !r.scope) scope = null; // "Total: …" after a part's line is the side's own total
    if (totalNext && r.kind === 'items') r.total = true;
    // A bare figure under (or beside) a label that says what it counts is that kind.
    const cat = r.cat || scopeCat;
    if (cat && r.kind === 'items') r.items = r.items.map(i => (i.bare ? { ...i, kinds: [...cat].sort(), measure: measureOf(new Set(cat)) } : i));
    // A "Total:" line is the side's own total, over every group (unless a flag or label of its own names one).
    const rec = { ...r, ...(groupBy && !r.tailBy ? { lineBy: groupBy.by, lineKind: groupBy.kind } : {}), inNamed: gNamed, group: r.total && !r.group && !r.labelGroup ? 'T' : group, refs: l.refs, doubt: l.doubt, by: r.by ?? scope?.by ?? null, scopeBy: scope?.by ?? null, scopeKind: scope?.byKind ?? null, byKind: r.byKind ?? scope?.byKind ?? null, partial: r.partial || (r.by ? r.byKind === 'partial' : scope?.partial) || false };
    pending.push(rec);
    rec.__all = true;
    side.__lines = side.__lines || []; side.__lines.push(rec);
  }
  const all = side.__lines || [];
  delete side.__lines;
  if (side.refused) return finishSide(side, []);
  // Counts under a source's or a claimant's name ("Syrian Observatory for Human Rights: 152 killed") beside counts under
  // another name ("Syrian government: 175–192 killed", "US Army: 100+ killed"): rival counts of the same dead, or parts
  // of the side, which VM cannot tell apart, so the side is not read rather than added up (review F6).
  const killedIn = x => x.kind === 'items' && x.items.some(i => i.measure === 'k');
  const srcLines = all.filter(x => killedIn(x) && x.scope && x.scope !== 'group' && x.scope !== 'partial');
  const grpLines = all.filter(x => killedIn(x) && x.labelGroup && !x.scopeBy);
  if (srcLines.length && grpLines.length) {
    // A name that says what it counts ("U.S. casualties:") heads a part of the side: beside a source's count it cannot be
    // told from a rival count, so the side is not read. A bare name beside claims ("US Army", "BBC News Russian") is
    // one more claimant: its own reading.
    // A place or a moment in the battle ("In the Pingxingguan ambush:") is a part of it, too.
    if (grpLines.some(x => /\b(?:casualties|losses|killed|dead|deaths|wounded|missing|captured|prisoners)\b/i.test(x.labelGroup) || /^(?:In|At|During|On)\s/.test(x.labelGroup)))
      return finishSide({ ...side, refused: { text: [...srcLines, ...grpLines].map(x => x.labelGroup || x.by).join(' / ').slice(0, 200), why: 'counts under a source\'s name beside counts for a part of the side, which may be rival counts or parts' } }, []);
    for (const x of grpLines) { x.by = x.labelGroup; x.byKind = 'source'; }
  }
  // Figures for a phase or a cause ("by airstrikes", "during the ground offensive") beside others: parts of the battle
  // or rival counts, which VM cannot tell apart (review F5).
  const byWith = new Set(all.filter(x => x.kind === 'items' || x.kind === 'words').map(x => x.by || ''));
  if (byWith.size > 1 && [...byWith].some(b => PHASE.test(b))) return finishSide({ ...side, refused: { text: [...byWith].filter(Boolean).join(' / ').slice(0, 200), why: 'figures for different phases or causes of the fighting, which may be parts or rival counts' } }, []);
  // Only groups a flag or a label names (a rule between lines is no group of its own).
  const groupsSeen = new Set(all.filter(x => x.kind === 'items' && x.inNamed && x.group !== 'T').map(x => x.group));
  for (const rec of all) {
    if (rec.tailBy && groupsSeen.size > 1 && rec.inNamed && rec.group !== 'T') { rec.lineBy = rec.by; rec.lineKind = rec.byKind; rec.by = rec.scopeBy ?? null; rec.byKind = rec.scopeKind ?? null; rec.tailBy = false; }
    const rd = get(rec.by, rec.byKind, rec.partial);
    rd.refs.push(...rec.refs);
    if (rec.kind === 'zero') rd.zero = rec.partial ? 'partial' : rd.byKind === 'claim' || rec.byKind === 'claim' ? 'claimed' : 'yes';
    else if (rec.kind === 'words') rd.words.push({ words: rec.words, cats: rec.cats, grouped: rec.inNamed && rec.group !== 0 });
    else if (rec.kind === 'items') { rd.lines.push(rec); rd.words.push(...rec.words); }
  }
  // A field of nothing but totals ("Total dead: 1,100,000–3,000,000+" in a third field) is the whole battle's.
  const itemLines = [...readings.values()].flatMap(r => r.lines);
  const out = finishSide(side, [...readings.values()]);
  out.allTotal = itemLines.length > 0 && itemLines.every(l => l.group === 'T');
  // Its total lines alone: in a third or later field (after the two sides, often the civilians), a "Total" is the battle's.
  const tLines = itemLines.filter(l => l.group === 'T');
  // Only a total of more than its own field's figures, and of no one group ("17,294 civilians" is the civilians' own).
  if (tLines.length && !out.refused && !tLines.some(l => l.items.some(i => i.noun))) {
    const t = readingFigures({ lines: tLines, words: [], partial: false, byKind: null }, side);
    const own = readingFigures({ lines: itemLines.filter(l => l.group !== 'T'), words: [], partial: false, byKind: null }, side);
    const more = m => !t[m] || !own[m] || t[m].low > own[m].high;
    if (!t.refused && (own.refused || (more('deaths') && more('cas')))) out.tFig = t;
  }
  return out;
}

// Each reading's deaths and casualties, or a refusal where they cannot be told apart surely.
function readingFigures(rd, side) {
  const groups = new Map();
  for (const l of rd.lines) for (const it of l.items) (groups.get(l.group) || groups.set(l.group, []).get(l.group)).push({ ...it, line: l });
  const st = it => (side.flagged ? 'disputed' : itemStatus(it, it.line, rd));
  let dLow = 0, dHigh = 0, dAny = false, dAtLeast = false, dSt = [], cLow = 0, cHigh = 0, cAny = false, cAtLeast = false, cSt = [], killedOnly = 0, joined = false, noKilled = 0;
  // The side's own "Total:" line (group 'T') is read after its groups and stands for them.
  const T = groups.get('T');
  groups.delete('T');
  if (T) groups.set('T', T);
  let before = null;
  const perGroup = [];
  const perGroupC = [];
  let cMark = null;
  const markC = () => { if (cMark) perGroupC.push({ low: cLow - cMark.low, high: cHigh - cMark.high }); cMark = null; };
  for (const [gid, its0] of groups) {
    markC();
    if (gid !== 'T') cMark = { low: cLow, high: cHigh };
    if (gid === 'T') {
      before = { dLow, dHigh, dAny, dAtLeast, cLow, cHigh, cAny };
      dLow = dHigh = cLow = cHigh = 0; dAny = cAny = false; dAtLeast = cAtLeast = false;
    }
    const hadK = dAny;
    const its = its0.filter(i => i.measure !== 'x');
    const excluded = its0.filter(i => i.measure === 'x');
    // Deaths: the killed; a total's own killed ("23,774 (7,878 killed)", "including 2,000 killed") where no other.
    let killed = its.filter(i => i.measure === 'k' && !i.sub);
    if (!killed.length) killed = its.filter(i => i.measure === 'k' && i.sub);
    const totK = killed.filter(i => i.line.total);
    if (totK.length) killed = totK;
    if (killed.length > 1) {
      const nouns = killed.map(i => (i.noun || '').toLowerCase());
      if (new Set(nouns).size < nouns.length) return { refused: 'two figures of the killed in one group, with nothing to tell them apart' };
    }
    for (const i of killed) { dLow += i.low; dHigh += i.high; dAny = true; dAtLeast ||= i.atLeast; dSt.push(st(i)); }
    if (gid !== 'T') perGroup.push(killed.length ? { low: killed.reduce((a, i) => a + i.low, 0), high: killed.reduce((a, i) => a + i.high, 0) } : null);
    // Casualties: the stated total, else the sum of the kinds given.
    let totals = its.filter(i => i.measure === 'all' && !i.sub);
    const totLines = its.filter(i => i.line.total && !i.sub);
    const parts = its.filter(i => (i.measure === 'k' || i.measure === 'part') && !i.sub && !(i.line.total && totals.length));
    if (totals.length > 1) {
      const t = totals.filter(i => i.line.total);
      if (t.length === 1) totals = t; else return { refused: 'two totals in one group' };
    }
    const seen = new Set();
    for (const p of parts) for (const k of p.kinds) { if (seen.has(k)) return { refused: 'the same kind counted twice in one group' }; seen.add(k); }
    const pLow = parts.reduce((a, i) => a + i.low, 0), pHigh = parts.reduce((a, i) => a + i.high, 0);
    if (totals.length) {
      const T = totals[0];
      const xLow = excluded.reduce((a, i) => a + i.low, 0);
      if (pLow > T.high * 1.01) { // a total smaller than its parts by more than rounding
        if (excluded.length && T.low === pLow + xLow - 0 && false) { /* unreachable */ }
        return { refused: 'the parts add up to more than the stated total' };
      }
      if (excluded.length && parts.length) {
        if (T.low === pLow + xLow && T.high === pHigh + excluded.reduce((a, i) => a + i.high, 0)) { cLow += pLow; cHigh += pHigh; cAny = true; for (const p of parts) cSt.push(st(p)); cAtLeast ||= parts.some(p => p.atLeast); continue; }
        return { refused: 'a total that may count the sick' };
      }
      cLow += T.low; cHigh += T.high; cAny = true; cAtLeast ||= T.atLeast; cSt.push(st(T)); for (const p of parts) cSt.push(st(p));
      continue;
    }
    if (!parts.length) continue;
    if (parts.every(p => p.measure === 'k')) { killedOnly++; cLow += pLow; cHigh += pHigh; continue; }
    joined ||= parts.some(p => p.measure === 'part' && p.kinds.includes('k'));
    if (!killed.length && gid !== 'T') noKilled++;
    cLow += pLow; cHigh += pHigh; cAny = true; cAtLeast ||= parts.some(p => p.atLeast); for (const p of parts) cSt.push(st(p));
  }
  if (!before) markC();
  // A heading's figure that is the sum of the groups listed under it ("ISAF: 1,178 killed" over its nations) is not
  // added again.
  for (let i = 0; i < perGroup.length; i++) {
    if (!perGroup[i] || before) continue;
    let sum = 0;
    for (let j = i + 1; j < perGroup.length && perGroup[j]; j++) { sum += perGroup[j].low; if (j >= i + 2 && sum === perGroup[i].low && perGroup[i].low === perGroup[i].high) { dLow -= perGroup[i].low; dHigh -= perGroup[i].high; if (perGroupC[i]) { cLow -= perGroupC[i].low; cHigh -= perGroupC[i].high; } i = j; break; } }
  }
  // A group with figures but none of its killed (killed and wounded together, or a total): the deaths are at least.
  for (const [gid, its] of groups) if (gid !== 'T' && its.some(i => i.measure !== 'x') && !its.some(i => i.measure === 'k')) noKilled++;
  if (before) {
    // The side's total stands for its groups: its killed where it gives them, else theirs; its casualties. A total
    // that adds the sick to the groups' figures is their figures (the Canton Operation's 1,930 with its 1,264 sick); one
    // beside the sick that does not add up may count them, and is not read.
    if (!dAny && before.dAny) { dLow = before.dLow; dHigh = before.dHigh; dAny = true; dAtLeast = before.dAtLeast; }
    const sick = [...groups].filter(([g]) => g !== 'T').flatMap(([, its]) => its.filter(i => i.measure === 'x' && !i.sub));
    const tot = T.filter(i => i.measure === 'all' && !i.sub);
    if (sick.length && tot.length && before.cAny) {
      const xLow = sick.reduce((a, i) => a + i.low, 0);
      if (tot[0].low === before.cLow + xLow) { cLow = before.cLow; cHigh = before.cHigh; }
      else if (tot[0].low !== before.cLow) return { refused: 'a total that may count the sick' };
    }
    if (!cAny && before.cAny) { cLow = before.cLow; cHigh = before.cHigh; cAny = true; }
    else if (cAny && before.cAny && before.cLow > cHigh * 1.01) return { refused: 'the groups add up to more than the stated total' };
    killedOnly = 0;
  }
  if (dAny && noKilled && !(before && T?.some(i => i.measure === 'k'))) dAtLeast = true;
  // Words for a kind: the figure is at least what is counted ("~3,000 killed, several thousands injured").
  const wordsK = rd.words.some(w => w.cats.has('k') || w.cats.has('all'));
  const wordsC = rd.words.some(w => !w.cats.has('k') || w.cats.has('all') || w.cats.size > 1);
  if (killedOnly && cAny) cAtLeast = true; // a group that gives only its killed: the casualties are at least the rest
  else if (!cAny) { cLow = 0; cHigh = 0; }
  const deaths = dAny ? { low: dLow, high: dHigh, status: weakest(dSt), atLeast: dAtLeast || (wordsK && groups.size > 1) || rd.partial || undefined } : null;
  const cas = cAny ? { low: cLow, high: cHigh, status: weakest(cSt), atLeast: cAtLeast || (wordsC && cAny) || rd.partial || undefined } : null;
  if (deaths && rd.partial) deaths.status = weakest([deaths.status, 'estimate']);
  if (cas && rd.partial) cas.status = weakest([cas.status, 'estimate']);
  return { deaths, cas, killedOnly: !cAny && dAny, joined: !dAny && joined };
}

// Readings that count different kinds are one listing (killed by one source, wounded by a claim); readings that count
// the same are alternatives.
function kindsOf(rd) {
  const s = new Set();
  for (const l of rd.lines) for (const it of l.items) if (it.measure !== 'x') for (const k of it.measure === 'all' ? ALL : it.kinds) s.add(k);
  // Words for one named group of a side ("Other units: unknown") leave that group's figure unknown; they are no rival
  // reading of the side's figures.
  for (const w of rd.words) if (!w.grouped) for (const k of w.cats.has('all') ? ALL : w.cats) s.add(k);
  if (rd.zero) ALL.forEach(k => s.add(k));
  return s;
}
function finishSide(side, readings) {
  if (side.refused) return { ...side, readings: [], deaths: null, cas: null };
  // Merge readings with no kind in common, a part of the battle only where nothing else gives that measure.
  let list = readings.filter(r => r.lines.length || r.words.length || r.zero);
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i++) for (let j = i + 1; j < list.length && !changed; j++) {
      const a = list[i], b = list[j];
      if (a.partial !== b.partial) continue;
      const ka = kindsOf(a), kb = kindsOf(b);
      if ([...ka].some(k => kb.has(k))) continue;
      const by = [a.by, b.by].filter(Boolean).join('; ') || null;
      list[i] = { by, byKind: null, partial: a.partial, merged: true, lines: [...a.lines, ...b.lines], words: [...a.words, ...b.words], zero: a.zero || b.zero, refs: [...a.refs, ...b.refs] };
      list.splice(j, 1); changed = true;
    }
  }
  const read = [];
  for (const rd of list) {
    const f = readingFigures(rd, side);
    if (f.refused) return { ...side, refused: { text: rd.lines.map(l => l.text).join(' / ').slice(0, 200), why: f.refused }, readings: [], deaths: null, cas: null };
    read.push({ by: rd.by, byKind: rd.byKind, partial: rd.partial, zero: rd.zero, words: rd.words.map(w => w.words), wordCats: rd.words.map(w => [...w.cats]), refs: [...new Set(rd.refs.filter(Boolean))], ...f });
  }
  const measure = m => {
    const full = read.filter(r => !r.partial);
    const gives = r => r[m] || (r.zero && r.zero !== 'claimed' ? false : false);
    let nums = full.filter(r => r[m]);
    if (!nums.length) nums = read.filter(r => r[m]);
    const zeros = read.filter(r => r.zero), wordy = read.filter(r => !r[m] && !r.zero && r.wordCats.some(c => c.includes(m === 'deaths' ? 'k' : 'w') || c.includes('all') || (m === 'cas' && c.length)));
    if (!nums.length) return null;
    if (nums.length === 1 && !zeros.length && !(wordy.length && m === 'deaths')) return { ...nums[0][m], by: nums[0].by || undefined, refs: nums[0].refs };
    const low = Math.min(...nums.map(r => r[m].low)), high = Math.max(...nums.map(r => r[m].high));
    const mids = nums.map(r => (r[m].low + r[m].high) / 2), wide = Math.max(...mids) / Math.max(1, Math.min(...mids)) >= 1.5;
    const disputed = wide || zeros.length > 0 || nums.some(r => r[m].status === 'disputed');
    return { low, high, status: disputed ? 'disputed' : 'estimate', atLeast: nums.every(r => r[m].atLeast) || undefined, readings: nums.length + zeros.length + wordy.length, refs: [...new Set(nums.flatMap(r => r.refs))] };
  };
  const deaths = measure('deaths'), cas = measure('cas');
  const zeroReadings = read.filter(r => r.zero);
  const zero = !deaths && !cas && zeroReadings.length && read.every(r => r.zero || (!r.deaths && !r.cas && !r.words.length)) ? (zeroReadings.some(r => r.zero === 'yes') && zeroReadings.every(r => r.zero === 'yes') ? 'yes' : zeroReadings.some(r => r.zero === 'claimed') ? 'claimed' : 'partial') : null;
  if (side.flagged) for (const f of [deaths, cas]) if (f) f.status = 'disputed';
  return { readings: read, deaths, cas, zero, words: read.flatMap(r => r.words), refused: null, flagged: side.flagged, killedOnly: !!deaths && !cas, joined: !deaths && read.some(r => r.joined) };
}

// --------------------------------------------------------------------------------------------------------------- battle
/** The casualty fields of an infobox's params, as sides: [{ key, side, raw }]; a whole's fields as one side. */
export function casualtyFields(params, name = '') {
  const p = params || {}, keys = Object.keys(p).filter(k => p[k] && p[k].replace(/<!--[\s\S]*?-->/g, '').trim());
  const sides = keys.filter(k => /^casualties\d$/.test(k)).sort();
  if (sides.length) return { whole: false, fields: sides.map(k => ({ key: k, n: +k.slice(-1), raw: p[k] })) };
  const whole = keys.filter(k => /^(?:casualties|deaths|fatalities|injuries|injured|non-fatal injuries|missing)$/.test(k));
  return { whole: true, fields: whole.map(k => ({ key: k, n: 1, raw: p[k] })) };
}

const sumFig = (list, others) => {
  if (!list.length) return null;
  const low = list.reduce((a, f) => a + f.low, 0), high = list.reduce((a, f) => a + f.high, 0);
  const status = list.length === 1 ? list[0].status : list.some(f => f.status === 'disputed') ? 'disputed' : 'estimate';
  const atLeast = list.some(f => f.atLeast) || others > 0;
  return { low, high, status, origin: list.length > 1 ? 'vm' : 'source', ...(atLeast ? { atLeast: true } : {}), ...(list.length === 1 && others > 0 ? { one: true } : {}) };
};

/**
 * A battle's figures from its infobox fields ({ casualties1: wikitext, … }): { state, deaths, cas, sides }. `state`:
 * 'figure' (a deaths or casualties figure), 'zero' (every side records none), 'unread' (figures the reader refused),
 * 'words' (only words, as "Unknown"), 'none' (no casualty field with anything in it). `named`: the article's named
 * references (namedRefs), so a reused reference is cited.
 */
export function readCasualties(fields, { named = new Map(), infobox = '' } = {}) {
  const { whole, fields: fl } = casualtyFields(fields, infobox);
  let sides;
  if (whole) {
    // One side, every field read into it (an attack's deaths and injuries).
    const parts = fl.map(f => ({ f, s: readSide(f.raw, { named, field: f.key }) }));
    const merged = { readings: parts.flatMap(p => p.s.readings), refused: parts.find(p => p.s.refused)?.s.refused || null };
    const pick = m => { const xs = parts.map(p => p.s[m]).filter(Boolean); return xs.length ? { ...sumFig(xs, 0), origin: 'source', refs: xs.flatMap(x => x.refs || []) } : null; };
    let deaths = pick('deaths'), cas = pick('cas');
    // An attack's deaths and injuries fields: its casualties are their sum.
    const d = parts.find(p => /^(?:deaths|fatalities)$/.test(p.f.key))?.s.deaths, w = parts.find(p => /^(?:injuries|injured|non-fatal injuries)$/.test(p.f.key))?.s.cas;
    if (d && w && !parts.some(p => p.f.key === 'casualties')) cas = { low: d.low + w.low, high: d.high + w.high, status: weakest([d.status, w.status]), origin: 'source', refs: [...(d.refs || []), ...(w.refs || [])], ...(d.atLeast || w.atLeast ? { atLeast: true } : {}) };
    else if (d && !w && !parts.some(p => p.f.key === 'casualties')) cas = null;
    const zero = parts.every(p => p.s.zero === 'yes');
    sides = [{ key: fl.map(f => f.key).join('+'), n: 1, ...merged, deaths, cas, zero: zero ? 'yes' : null, words: parts.flatMap(p => p.s.words || []), flagged: parts.some(p => p.s.flagged) }];
    if (merged.refused && !deaths && !cas) sides[0].deaths = sides[0].cas = null;
  } else {
    sides = fl.map(f => ({ key: f.key, n: f.n, ...readSide(f.raw, { named }) }));
  }
  // What a third or later field is, from its own words (review F2, P2): the civilians' ("Civilian: 14,300 killed"), the
  // battle's total ("Total dead: …"), or, where the box gives no first or second side at all, the whole battle's.
  const present = new Set(sides.map(s => s.n)), onlyLater = !whole && !present.has(1) && !present.has(2);
  for (const s of sides) {
    if (whole || s.n < 3) continue;
    const text = plainLines(fl.find(f => f.key === s.key)?.raw || '').map(l => l.text).join(' ');
    s.role = s.tFig ? 'total' : /\bcivilians?\b|\bnon-?combatants?\b/i.test(text) && !/\b(?:soldiers?|troops|military|combatants|fighters|militants|police)\b/i.test(text) ? 'civ' : onlyLater ? 'whole' : null;
  }
  // Sides with no field (the first or second side's box left empty) are unknown: the sum is at least; but a box whose
  // only field is a later one gives the whole battle there, and is no side alone.
  const absent = whole || onlyLater ? 0 : [1, 2].filter(n => !present.has(n)).length, whole0 = whole;
  const battle = m => {
    // A third or later field of totals only ("Total dead: …") is the battle's own total, not another side to add.
    const whole = sides.find(s => s.n >= 3 && s.tFig?.[m] && !s.refused);
    if (whole) return { ...whole.tFig[m], origin: 'source' };
    const nums = sides.filter(s => s[m] && !s.refused), zeros = sides.filter(s => !s[m] && s.zero === 'yes');
    const unknown = sides.length - nums.length - zeros.length + absent;
    // A zero in an attack's deaths field says nothing of the wounded (review F11).
    if (!nums.length && m === 'cas' && whole0 && !fl.some(f => /^(?:casualties|injuries|injured|non-fatal injuries)$/.test(f.key))) return null;
    if (!nums.length) return zeros.length && zeros.length === sides.length && !absent ? { low: 0, high: 0, status: 'fact', origin: 'source' } : null;
    const f = sumFig(nums.map(s => s[m]), unknown);
    // The civilians' figure alone, the combatants' not read or not given: said as the civilians', never as "one side".
    if (nums.every(s => s.role === 'civ')) { delete f.one; f.civ = true; }
    return f;
  };
  let deaths = battle('deaths'), cas = battle('cas');
  // Every side's "None" in a casualties field is no casualties either; a deaths field's zero says nothing of the
  // wounded (review F11).
  if (deaths && deaths.low === 0 && deaths.high === 0 && !cas && fl.every(f => /^casualties\d?$/.test(f.key))) cas = { ...deaths };
  const state = (deaths && deaths.high > 0) || (cas && cas.high > 0) ? 'figure' : deaths || cas ? 'zero'
    : sides.some(s => s.refused) ? 'unread' : sides.some(s => s.words?.length || s.zero) ? 'words' : 'none';
  return { state, deaths, cas, sides };
}

/** A whole article's lead section read: the infobox, its fields, and the figures (readCasualties), or why none.
 *  `labels`: each side's first named combatant (combatant1–5), for the battle's window. */
export function readArticle(wikitext, { s = null, e = null } = {}) {
  const box = infoboxOf(wikitext);
  if (!box) return { state: 'none', why: 'nobox' };
  const { fields } = casualtyFields(box.params, box.name);
  if (!fields.length) return { state: 'none', why: 'nofield', infobox: box.name };
  // The article must be this battle's: the years of its infobox's date against the battle's own (a year either side).
  // Wikidata can link a battle to another event's article (the Barah massacre of 2026 to the Bara massacre of 1992).
  const dy = yearsOf(box.params.date);
  if (dy && !fitsYears(dy, s, e)) return { state: 'none', why: 'mismatch', infobox: box.name, dy };
  const raw = Object.fromEntries(fields.map(f => [f.key, f.raw]));
  const labels = {};
  for (let n = 1; n <= 5; n++) {
    const c = box.params[`combatant${n}`] || box.params[`side${n}`];
    if (!c) continue;
    // A country's own flag template ({{DPRK}}, {{ROK}}, {{USA}}) names the side as a flag does (review P2).
    const named = c.replace(/\{\{\s*([A-Z]{2,5})\s*\}\}/g, (m, code) => `{{flagicon|${COUNTRY[code] || code}}}`);
    const first = plainLines(named).map(l => (l.text.replace(/⟨g:([^⟩]*)⟩/g, '').trim() || (/⟨g:([^⟩]+)⟩/.exec(l.text)?.[1] || '')).replace(/^[\s:–-]+|[\s:–-]+$/g, '')).find(t => t && !/^(?:supported by|support|allies|in support|co-belligerents?)\b/i.test(t));
    if (first) labels[n] = first.slice(0, 60);
  }
  return { infobox: box.name, labels, ...(dy ? { dy } : {}), ...readCasualties(raw, { named: namedRefs(wikitext), infobox: box.name }) };
}
const COUNTRY = { DPRK: 'North Korea', ROK: 'South Korea', PRC: 'China', ROC: 'Republic of China', USA: 'United States', US: 'United States', UK: 'United Kingdom', GBR: 'United Kingdom', USSR: 'Soviet Union', URS: 'Soviet Union', FRA: 'France', GER: 'Germany', JPN: 'Japan', ITA: 'Italy', ISR: 'Israel', IRN: 'Iran', IRQ: 'Iraq', SYR: 'Syria', AFG: 'Afghanistan', PAK: 'Pakistan', IND: 'India', RUS: 'Russia', UKR: 'Ukraine', VNM: 'Vietnam', CHN: 'China', TUR: 'Turkey', AUS: 'Australia', CAN: 'Canada', NZL: 'New Zealand', POL: 'Poland', ESP: 'Spain' };
/** The years an infobox's date names, as [first, last], or null where it names none. */
export function yearsOf(date) {
  if (/<\/ref>/i.test(String(date || '').replace(/<ref[\s\S]*?<\/ref>/gi, ''))) return null; // markup cut, not read
  const ys = [...String(date || '').replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/gi, '').matchAll(/\b(1[89]\d\d|20\d\d)\b/g)].map(m => +m[1]);
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}
/** Whether an article's years [first, last] meet a battle's dates (`s`, `e`: ISO dates), a year either side. */
export function fitsYears(dy, s, e) {
  if (!dy || !s) return true;
  const a = +String(s).slice(0, 4), b = +String(e || s).slice(0, 4);
  return dy[1] >= a - 1 && dy[0] <= b + 1;
}

// ------------------------------------------------------------------------------------------------------ Wikidata, sources
const QV = s => s?.datavalue?.value?.id || null;
/** A Wikidata item's statements of deaths (P1120), casualties (P1590), injured (P1339) and missing (P1446), from its
 *  JSON (wbgetentities): [{ p, v, low?, high?, unknown?, rank, at?, of?, part?, about?, approx?, ref }], never deprecated.
 *  `ref`: 'stated' (P248 stated in) or 'url' (P854), with `in`; 'wikipedia' where it was only imported from Wikipedia
 *  (P143, P4656); null where it cites nothing. */
export function wdStatements(entity) {
  const out = [];
  for (const p of ['P1120', 'P1590', 'P1339', 'P1446']) for (const s of entity?.claims?.[p] || []) {
    if (s.rank === 'deprecated') continue;
    const dv = s.mainsnak?.datavalue?.value, q = s.qualifiers || {};
    const amt = x => (x == null ? null : +x);
    const st = { p, rank: s.rank };
    if (s.mainsnak?.snaktype === 'somevalue') st.unknown = true;
    else if (s.mainsnak?.snaktype === 'novalue') st.v = 0;
    else if (dv && dv.amount != null) {
      st.v = amt(dv.amount);
      if (dv.lowerBound != null && dv.upperBound != null && (amt(dv.lowerBound) !== st.v || amt(dv.upperBound) !== st.v)) { st.low = amt(dv.lowerBound); st.high = amt(dv.upperBound); }
    } else continue;
    const at = q.P585?.[0]?.datavalue?.value?.time;
    if (at) st.at = at.replace(/^\+/, '').slice(0, 10);
    const of = QV(q.P642?.[0]) || QV(q.P1642?.[0]) || QV(q.P17?.[0]), part = QV(q.P518?.[0]), about = QV(q.P805?.[0]);
    if (of) st.of = of; if (part) st.part = part; if (about) st.about = about;
    // Its qualifiers read in full (review F9): "sourcing circumstances" (P1480) and "nature of statement" (P5102) in
    // words, each to its kind; a lower and an upper limit (P5447, P5448), on an unknown value too, as a range.
    const quals = [...(q.P1480 || []), ...(q.P5102 || [])].map(QV).filter(Boolean);
    const words = quals.map(x => QUAL[x]?.[0]).filter(Boolean);
    if (words.length) st.q = [...new Set(words)];
    for (const x of quals) { const how = QUAL[x]?.[1]; if (how) st[how === 'min' || how === 'max' ? 'bound' : how] = how === 'min' || how === 'max' ? how : true; }
    if (quals.some(x => !QUAL[x])) st.approx = true; // a qualifier VM does not know: no plain count
    const lim = k => { const a = q[k]?.[0]?.datavalue?.value?.amount; return a == null ? null : +a; };
    if (lim('P5447') != null && st.low == null) st.low = lim('P5447');
    if (lim('P5448') != null && st.high == null) st.high = lim('P5448');
    if (st.low != null && st.high == null) { st.high = st.v ?? st.low; if (st.v == null) st.atLeast = true; }
    if (st.high != null && st.low == null) st.low = st.v ?? 0;
    const refs = (s.references || []).map(r => r.snaks || {});
    const real = refs.find(r => r.P248 || r.P854);
    if (real) { st.ref = real.P248 ? 'stated' : 'url'; st.in = real.P248 ? QV(real.P248[0]) : real.P854[0]?.datavalue?.value || null; }
    else st.ref = refs.some(r => r.P143 || r.P4656) ? 'wikipedia' : null;
    out.push(st);
  }
  return out;
}
// Wikidata's qualifiers of a figure (P1480, P5102): [the words shown, what they make of it]. Looked up on Wikidata on
// 16 November 2026 for every value its battles' figures carry.
const QUAL = {
  Q5727902: ['about', 'approx'], Q60070514: ['approximately', 'approx'], Q37113960: ['an estimate', 'approx'], Q21818619: ['near', 'approx'],
  Q55935291: ['at least', 'atLeast'], Q133763655: ['at least', 'atLeast'], Q47035128: ['more than', 'atLeast'],
  Q10585806: ['the minimum', 'min'], Q10578722: ['the maximum', 'max'],
  Q18122778: ['presumably', 'doubt'], Q56644435: ['probably', 'doubt'], Q32188232: ['allegedly', 'doubt'], Q18912752: ['disputed', 'doubt'], Q104378399: ['dubious', 'doubt'],
  Q52834024: ['less than', 'approx'],
  Q29509043: ['official'], Q29509080: ['unofficial'], Q112980637: ['not updated'], Q218005: ['a sum'], Q10431430: [null],
};
const best = (stmts, p) => { const s = stmts.filter(x => x.p === p && !x.unknown); return s.some(x => x.rank === 'preferred') ? s.filter(x => x.rank === 'preferred') : s; };
const DISAGREE = 1.5;
// Two readings of one measure disagree when the one lies outside the other's range by half again (an "at least" only
// below it).
const disagree = (v, f) => v < f.low / DISAGREE || (!f.atLeast && v > f.high * DISAGREE);
const fig = (f, src, extra = {}) => {
  const out = f.low === f.high ? { v: f.low } : { low: f.low, high: f.high };
  return { ...out, status: f.status, ...(f.origin === 'vm' ? { origin: 'vm' } : {}), src, ...(f.atLeast ? { atLeast: true } : {}), ...(f.one ? { one: true } : {}), ...(f.civ ? { civ: true } : {}), ...extra };
};
const UNKIND = 'disputed';

/**
 * A battle's figures from every source, in the order of trust (PRP-WAR-FOCUS-FIGURES-DESIGN.md (a)): Wikidata's count
 * leads (`deaths`, `cas`, as before), the infobox's beside it, disputed where they differ by half again; else the
 * infobox's; else a zero a source records; else UCDP's clashes nearby, apart. Returns { fd, fc, fs, fw, fwp, fu, detail }
 * with only the fields that have something to say. `article`: null (no English article), { why } (a redirect, no
 * infobox, no casualties field, a failed read), or readArticle's result with { title, rev, ts }.
 */
export function battleFigures({ deaths = null, cas = null, wd = [], article = null, ucdp = null }) {
  const out = {}, d = best(wd, 'P1120'), c = best(wd, 'P1590');
  const read = article && !article.why ? article : null;
  const wpD = read?.deaths, wpC = read?.cas;
  // No reference beyond Wikipedia (Scholar 5.1): `uv` 1 where Wikidata's statement cites nothing, 'w' where it was only
  // imported from Wikipedia (review P4: the two are told apart in words).
  const wdUv = (stmts, v) => { const s = stmts.filter(x => x.v === v); return s.length && s.every(x => x.ref !== 'stated' && x.ref !== 'url') ? { uv: s.some(x => x.ref === 'wikipedia') ? 'w' : 1 } : {}; };
  const lead = (v, p, wp) => {
    const all = wd.filter(x => x.p === p && !x.unknown), s = all.find(x => x.v === v && x.rank === 'preferred') || all.find(x => x.v === v) || {};
    const f = { v, status: s.doubt ? 'disputed' : s.approx || s.atLeast || s.bound || s.low != null ? 'estimate' : 'fact', src: 'wikidata', ...wdUv(all, v) };
    if (s.low != null) { f.low = s.low; f.high = s.high; }
    // A minimum and a maximum stated apart (the Sumpul River massacre's 300 and 600): the two ends of one range (F9).
    const mn = all.find(x => x.bound === 'min' && x.v > 0), mx = all.find(x => x.bound === 'max' && x.v > 0);
    if (mn && mx && mn.v < mx.v && (s === mn || s === mx)) { f.low = mn.v; f.high = mx.v; f.status = s.doubt ? 'disputed' : 'estimate'; }
    if (s.atLeast) f.atLeast = true;
    if (s.q) f.q = s.q;
    const lo = f.low ?? v, hi = f.high ?? v;
    if (wp && wp.high > 0 && (hi < wp.low / DISAGREE || (!wp.atLeast && lo > wp.high * DISAGREE))) { f.status = UNKIND; f.alt = fig(wp, 'wikipedia'); }
    return f;
  };
  // Wikidata's "unknown value" with a lower and an upper limit (Sabra and Shatila: 460 to 3,500): a range, an estimate.
  const limits = p => { const s = wd.find(x => x.p === p && x.unknown && x.low != null); return s && { low: s.low, high: s.high, status: s.doubt ? 'disputed' : 'estimate', src: 'wikidata', ...(s.atLeast ? { atLeast: true } : {}), ...(s.q ? { q: s.q } : {}), ...(s.ref !== 'stated' && s.ref !== 'url' ? { uv: s.ref === 'wikipedia' ? 'w' : 1 } : {}) }; };
  const refsOf = m => (read?.sides || []).filter(s => s[m]).flatMap(s => s[m].refs || []);
  const fromWp = (f, m) => fig(f, 'wikipedia', refsOf(m).length ? {} : { uv: 1 });
  const wdZero = stmts => stmts.length && stmts.every(x => x.v === 0);
  const withAlt = (f, wp) => { if (wp && wp.high > 0 && (f.high < wp.low / DISAGREE || (!wp.atLeast && f.low > wp.high * DISAGREE))) { f.status = UNKIND; f.alt = fig(wp, 'wikipedia'); } return f; };
  // Deaths
  if (deaths > 0) out.fd = lead(deaths, 'P1120', wpD);
  else if (limits('P1120')) out.fd = withAlt(limits('P1120'), wpD);
  else if (wpD && wpD.high > 0) { out.fd = fromWp(wpD, 'deaths'); if (wdZero(d)) { out.fd.status = UNKIND; out.fd.alt = { v: 0, src: 'wikidata' }; } }
  else if (wdZero(d)) out.fd = { v: 0, status: 'fact', src: 'wikidata', ...wdUv(d, 0) };
  else if (wpD && wpD.high === 0) out.fd = { v: 0, status: 'fact', src: 'wikipedia' };
  // Casualties
  if (cas > 0) out.fc = lead(cas, 'P1590', wpC);
  else if (limits('P1590')) out.fc = withAlt(limits('P1590'), wpC);
  else if (wpC && wpC.high > 0) out.fc = fromWp(wpC, 'cas');
  else if (wpC && wpC.high === 0) out.fc = { v: 0, status: 'fact', src: 'wikipedia' };
  // A Wikidata figure as Wikidata's (`deaths`) needs no copy unless it says more than a plain count.
  for (const k of ['fd', 'fc']) { const f = out[k]; if (f?.src === 'wikidata' && f.v > 0 && f.status === 'fact' && !f.uv && f.low == null) delete out[k]; }
  const hasFig = deaths > 0 || cas > 0 || out.fd || out.fc;
  if (!hasFig) {
    // 'none' is the default and left unwritten, as is why where there is no article (`w` is null): the files stay small.
    if (read && (read.state === 'unread' || read.state === 'words')) out.fs = read.state;
    const words = [...new Set((read?.sides || []).flatMap(s => s.words || []))].filter(w => w.length <= 40).slice(0, 3);
    if (words.length) out.fw = words;
    if (ucdp) out.fu = ucdp;
  }
  if (!read && article) out.fwp = article.why;
  else if (read && read.state === 'none') out.fwp = 'blank';
  // The detail for the battle's window: every statement, the revision read, each side's figures and readings.
  const detail = {};
  if (wd.length) detail.wd = wd;
  // An article set aside as another event's: which revision, and the years its box gives (review F3).
  if (article?.why === 'mismatch') detail.mismatch = { t: article.title, rev: article.rev, ts: article.ts, dy: article.dy };
  if (read) {
    detail.wp = { t: read.title, rev: read.rev, ts: read.ts, box: read.infobox, ...(read.dy ? { dy: read.dy } : {}) };
    const f = x => x && { low: x.low, high: x.high, status: x.status, ...(x.atLeast ? { atLeast: true } : {}), ...(x.by ? { by: x.by } : {}) };
    // Every side named (review P2): its combatant in the box, else what its own words say it is.
    const whole = (read.sides || []).length === 1 && !/^casualties\d$/.test(read.sides[0].key);
    const labelOf = s => (whole ? 'The whole battle' : read.labels?.[s.n] || { civ: 'Civilians', total: 'Total, all sides', whole: 'The whole battle' }[s.role] || (s.n >= 3 ? 'Others in the article\'s box' : `Combatant ${s.n}, not named in the article's box`));
    detail.sides = (read.sides || []).map(s => ({ n: s.key, label: labelOf(s), ...(s.role ? { role: s.role } : {}), d: f(s.deaths), c: f(s.cas),
      ...(s.readings?.length > 1 || s.readings?.some(r => r.by) ? { rd: s.readings.map(r => ({ by: r.by, d: f(r.deaths), c: f(r.cas), refs: r.refs, ...(r.words.length ? { w: r.words.slice(0, 3) } : {}), ...(r.zero ? { z: r.zero } : {}) })) } : {}),
      refs: [...new Set((s.readings || []).flatMap(r => r.refs))].slice(0, 4),
      ...(s.words?.length ? { w: s.words.slice(0, 3).map(w => w.split(/\s+/).slice(0, 8).join(' ')) } : {}),
      ...(s.zero ? { z: s.zero } : {}), ...(s.refused ? { ref: s.refused.why } : {}), ...(s.killedOnly ? { ko: 1 } : {}), ...(s.joined ? { kw: 1 } : {}) }));
  }
  if (Object.keys(detail).length) out.detail = detail;
  return out;
}

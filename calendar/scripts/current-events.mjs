// Wikipedia's "Portal:Current events" day pages → dated calendar events of the kinds that structured data misses:
// resignations, parliamentary votes, court rulings, protests and strikes, ceasefires and peace talks, sanctions,
// party contests, inaugurations, summits and state visits, and referendums.
//   import { currentEvents } from './current-events.mjs'; await currentEvents('2025-01-01', '2026-10-28')
// Each day page lists news items under a category ("Politics and elections", "Law and crime", …), nested under the
// story they belong to ("2026 Bolivian protests"). An item becomes an event when its category and wording say it is
// one of the types below; ongoing stories are thinned so one protest wave or one round of talks doesn't fill a month.
// Text: Wikipedia contributors, CC BY-SA. Every event keeps the news report the item cites (`ref`).
import { countryOf, countryOfLink, isCountryName } from './countries.mjs';

const UA = { 'User-Agent': 'JDP-Iq Political Calendar (https://jdpi.pages.dev)' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const pageTitle = date => `Portal:Current events/${date.slice(0, 4)} ${MONTHS[+date.slice(5, 7) - 1]} ${+date.slice(8, 10)}`;

// ---- wikitext → items ------------------------------------------------------------------------------------------
export function clean(s) {
  return String(s)
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{(?:convert|cvt)\|([\d.,]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2')
    .replace(/\{\{(?:lang|langx)\|[^|}]+\|([^|}]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{(?:nowrap|nobr|small)\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+(?:\s[^\]]*)?\]/g, '')
    .replace(/'{2,}/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/\(\s*\)/g, '').trim();
}
const linksOf = s => [...String(s).matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)].map(m => ({ target: m[1].trim().replace(/_/g, ' '), label: clean(m[2] || m[1]) }));
const refsOf = s => [...String(s).matchAll(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g)].map(m => ({ url: m[1], outlet: clean(m[2] || '').replace(/^\(|\)$/g, '') }));

/** One day page → news items: { date, category, topics: [{ text, links }], text, links: [{ target, label }], refs }. */
export function parseDay(date, wikitext) {
  const items = [];
  let category = '';
  const stack = []; // story headings by bullet depth
  for (const raw of String(wikitext || '').split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^'''([^']+)'''\s*$/.exec(line)) || (m = /^;\s*(.+)$/.exec(line))) { category = clean(m[1]); stack.length = 0; continue; }
    if (!(m = /^(\*+)\s*(.*)$/.exec(line))) continue;
    const depth = m[1].length, body = m[2];
    stack.length = depth - 1;
    // A heading line is only links (and commas); a news item has words of its own, usually with a source link.
    const rest = clean(body.replace(/\[\[[^\]]*\]\]/g, ''));
    if (!/\[https?:/.test(body) && /\[\[/.test(body) && /^[\s,;:&–—-]*(?:and)?[\s,;:&–—-]*$/i.test(rest)) {
      stack[depth - 1] = { text: clean(body), links: linksOf(body).map(l => l.target) };
      continue;
    }
    const text = clean(body);
    if (text.length < 25) continue;
    items.push({ date, category, topics: stack.filter(Boolean), text, links: linksOf(body), refs: refsOf(body) });
  }
  return items;
}

// ---- sentences and headlines -----------------------------------------------------------------------------------
// Sentence ends: ". " or "; " before a capital, but not after "U.S." or "Gen." and the like.
const SENTENCE_END = /(?<!\b(?:[A-Z]|U\.S|U\.K|St|Mr|Mrs|Ms|Dr|Gen|Lt|Col|Sgt|No|vs|Jr|Sr|Inc|Ltd|Co))\.\s+(?=[A-Z"“‘])|;\s+/g;
function sentenceAt(text, at = 0) {
  let start = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index + 1;
    if (at < end) return { start, s: text.slice(start, end) };
    start = m.index + m[0].length;
  }
  return { start, s: text.slice(start) };
}
// Where a headline may stop: a comma, or a subordinate clause ("… after …", "… amid …", "… who …").
const CUT = /(?:,|;| –| —)\s| (?:(?:one|two|three|four|five|a|several|\d+) (?:days?|weeks?|months?|years?) )?(?:after|before|following)\b| (?:amid(?:st)?|citing|saying|despite|due to|because|over|which|who|whom|while|ahead of|in protest|as part of|in an attempt|to protest|in order to|in response to|in retaliation)\b/g;

/**
 * A short headline: the sentence that holds the key words (`at`…`end`), without a leading "In Spain, " and without
 * the subordinate clauses after the key words. "Latvian prime minister Evika Siliņa resigns one day after …" →
 * "Latvian prime minister Evika Siliņa resigns".
 */
export function headline(text, at = 0, end = at, max = 120) {
  const { start, s } = sentenceAt(String(text), at);
  let t = s.replace(/[.;]\s*$/, '').trim(), offset = start + (s.length - s.trimStart().length);
  // Drop an introductory "In Spain, " / "At the NATO summit in Ankara, Turkey, " when it ends before the key words.
  const intro = /^(?:In|On|At|During|Amid|After|Following|Meanwhile|Elsewhere in|Separately|Additionally|However|Earlier|Later) [^,]{2,70}, (?:(?:[A-Z][\w'’.-]+ ?){1,3}, )?/.exec(t);
  if (intro && offset + intro[0].length <= at && !/\b(?:resigns|rules|is|are)\b/.test(intro[0])) { t = t.slice(intro[0].length); offset += intro[0].length; }
  const min = Math.max(32, end - offset);
  let cut = t.length;
  for (const m of t.matchAll(CUT)) if (m.index >= min) { cut = m.index; break; }
  t = t.slice(0, cut).trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/** The first part of a sentence, up to its first subordinate clause: what the sentence is mainly about. */
const mainClause = text => headline(text, 0, 0, 400);

// ---- items → typed events --------------------------------------------------------------------------------------
const CAT = {
  politics: /^politics and elections$/i, law: /^law and crime$/i, relations: /^international relations$/i,
  conflict: /^armed conflicts and attacks$/i, business: /^business and economy$/i, health: /^health and environment$/i,
};
const inCats = (item, ...names) => names.some(n => CAT[n].test(item.category));
// Reported speech and intentions: "X says that …", "Y plans …" — talk about an event rather than the event.
const REPORTED = /\b(?:says|said|tells|told|warns|claims|denies|reports|reported|reportedly|according to|suggests|threatens|hints|expects|is expected|plans|planning|proposes|calls for|urges|demands|considers|discuss(?:es)?)\b/i;
const reportedBefore = (text, at) => { const m = REPORTED.exec(text.slice(0, at)); return !!m; };
const hit = (re, text) => { const m = re.exec(text); return m ? { at: m.index, end: m.index + m[0].length } : null; };

const OFFICE = /\b(?:president|prime minister|premier|chancellor|minister|secretary|government|cabinet|speaker|governor|first minister|leader|chief|head|mayor|representative|commissioner|vice[- ]president|deputy|spokes\w+|ambassador|chair\w*|director|commander|king|queen|monarch|pope|MP|senator|lawmaker|member of|attorney general|prosecutor general|high representative|taoiseach|captain regent)\b/i;
const US_STATE = /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/;
// National apex courts and international courts (not lower courts, not US state supreme courts).
const COURT = /(?:Supreme(?: Federal| People's)? Court|Federal (?:Supreme|Constitutional) Court|Constitutional (?:Court|Council|Tribunal)|High Court of (?:Justice|Australia)|International Court of Justice|\bICJ\b|International Criminal Court|\bICC\b|European Court of Human Rights|\bECHR\b|(?:European )?Court of Justice(?: of the European Union)?|\bCJEU\b|Inter-American Court of Human Rights)(?: of (?:the )?[A-Z][\w-]+(?: [A-Z][\w-]+){0,3})?/;
const RULING = /\b(?:rules?|ruled|upholds?|overturns?|strikes? down|annuls?|invalidates?|blocks?|orders?|dismisses?|rejects?|sentences?|convicts?|acquits?|suspends?|unseals?|issues? (?:an? )?(?:arrest )?warrants?|designates?|bans?|halts?|lifts?|quashes?|declares?|finds?|grants?|denies|confirms? (?:the )?charges|disqualifies|reinstates|hands down|delivers (?:its|a) (?:ruling|verdict|judgment|opinion)|drops? (?:the )?charges)\b/;

const SANCTION_ACT = /\b(?:impos\w*|issu\w*|announc\w*|approv\w*|adopt\w*|lift\w*|remov\w*|extend\w*|expand\w*|levi\w*|introduc\w*|reimpos\w*|agree\w*|sign\w*|pass\w*|renew\w*|unveil\w*)\b[^.;]{0,70}\bsanctions?\b|\bpackage of sanctions\b|\bsanctions package\b|\bsanctions (?:on|against|targeting|upon)\b|\b(?:sanctions|sanctioned) (?:\d+|two|three|four|five|six|seven|eight|nine|ten|several|dozens|[A-Z])|\beconomic war against\b/;
const SANCTION_NOT = /\bsanctioned (?:tanker|vessel|ship|oligarch|cargo|entity|entities|firm|company|bank|individual|Russian|Iranian)\b|\bahead of (?:new )?(?:U\.S\. |US |EU )?sanctions\b|\bsanctions (?:a|an|the) (?:constitutional|law|bill|amendment|decree|reform)\b|\b(?:risk|threat|fear|evad\w*|evasion|circumvent\w*|violat\w*|breach\w*|citing|compliance with|compl(?:y|ies|ying) with)\b[^.;]{0,40}\bsanctions\b|\bsporting sanctions\b|\bdespite (?:the )?sanctions\b|\bwaiver\b|\b(?:demand|call|ask|seek|want|push|press|urg|condition)\w*\b[^.;]{0,30}\b(?:lift|remov|eas)\w*\b[^.;]{0,30}\bsanctions\b|\bcalling (?:on|for)\b[^.;]{0,60}\bsanction|\b(?:in retaliation (?:to|for)|in response to)\b[^.;]{0,40}\bsanctions\b|\bwould (?:have )?\w+\b[^.;]{0,60}\bsanctions\b/i;

const PROTEST_STORY = /\b(?:protests?|strikes?|demonstrations?|riots?|unrest|uprising|revolution|march(?:es)?|blockades?|walkouts?|movement|rall(?:y|ies))\b/i;
const NOT_PROTEST = /\b(?:air ?strikes?|drone strikes?|missile strikes?|military strikes?|naval strikes?|strike group|hunger strike|strikes? (?:on|against|in|at)|Iranian strikes|Israeli strikes|U\.S\. strikes|blockade of (?:the )?(?:Gaza|Iran)|naval blockade|quota reform movement)\b/i;
const PROTEST_ACT = /\b(?:protest(?:s|ers|ed|ing)?|demonstrat\w+|march(?:es|ed|ing)?|rall(?:y|ies|ied)|(?:general|national|nationwide|labour|labor|public[- ]sector|teachers'?|doctors'?|workers'?|warning|\d+-hour) strikes?|(?:go|goes|went) on strike|strike action|walkouts?|riot(?:s|ing)?|blockades?)\b/;
const BIG = /\b(?:tens of thousands|hundreds of thousands|thousands of|millions of|nationwide|across the country|national strike|general strike|mass (?:protests?|demonstrations?|rall(?:y|ies))|largest)\b/i;

const CEASEFIRE = /\b(?:agree(?:s|d)? (?:to|on|upon) (?:a |an |the )?(?:[\w-]+ ){0,2}(?:ceasefire|cease-fire|truce|armistice|peace (?:deal|agreement|plan|framework|accord))|announces? (?:a |an |the )?(?:[\w-]+ ){0,2}(?:ceasefire|truce)|declares? (?:a |an )?(?:[\w-]+ ){0,2}(?:ceasefire|truce)|(?:ceasefire|cease-fire|truce|armistice) (?:takes|took|goes|comes|came) into (?:force|effect)|(?:ceasefire|truce) (?:begins|starts)|sign(?:s|ed)? (?:a |an |the )?(?:[\w-]+ ){0,3}(?:peace|ceasefire|truce|armistice) (?:deal|agreement|accord|treaty|declaration|memorandum|framework)|extends? (?:the |their )?(?:[\w-]+ )?(?:ceasefire|truce)|(?:ceasefire|truce) (?:is|has been) extended|(?:ceasefire|truce) (?:collapses|ends|expires|breaks down)|(?:peace|ceasefire) (?:talks|negotiations) (?:begin|open|start|resume|conclude|end|collapse|break down)|(?:first|second|third|fourth|fifth|new|next|another) round of (?:peace |ceasefire |direct )?(?:talks|negotiations)|holds? (?:direct |indirect |the first )?(?:peace|ceasefire) (?:talks|negotiations)|peace (?:summit|conference) (?:is held|opens|begins)|accept(?:s|ed)? (?:a |an |the )?(?:[\w-]+ ){0,3}(?:ceasefire|truce))\b/i;
const NOT_YET = /\b(?:amid(?:st)?|ahead of|before|prior to|potential|possible|planned|proposed|expected|unconfirmed|prepare for|preparation for)\b[^.;]{0,25}$/i;

const PARTY = /\b(?:is|are) (?:re-?)?elected (?:as )?(?:the )?(?:new )?(?:leader|chair(?:man|woman|person)?|president|secretary[- ]general|head|presidential candidate|candidate) (?:of|for) (?:the )?[^.;]{0,80}\b(?:Party|Union|Alliance|Front|Movement|Rally|League|Democrats|Republicans|Labour|Conservatives|Greens|Socialists|primary)\b|\bleadership (?:election|contest|race|spill|vote|ballot)\b|\bparty (?:congress|conference|convention|primary|primaries)\b|\bnational (?:party )?(?:convention|conference)\b|\bNational Congress of the [^.;]{0,40}Party\b|\bholds? (?:the |its |a )?[^.;]{0,50}\b(?:party )?(?:congress|convention|party conference)\b|\bwins? (?:the |a )?[^.;]{0,40}\b(?:primary|primaries|leadership (?:election|contest|race|ballot|vote))\b|\b(?:confidence vote|vote of confidence) (?:on|in) (?:his|her|their) leadership\b/i;
const PARTY_STORY = /\b(?:leadership (?:election|contest|spill|race)|Congress of the [^,]*Party|party congress|National Convention|party conference|primary|primaries)\b/i;

const INAUGURATION = /\b(?:(?:is|are) (?:formally |officially )?sworn in|sworn in as|takes? the (?:presidential |constitutional )?oath|(?:is|are) (?:re-?)?inaugurated|inaugurated as|takes? office|assumes? office|swearing-in (?:ceremony|of))\b/i;
const INAUG_SUBJECT = /\b(?:president|prime minister|premier|chancellor|king|queen|monarch|emperor|governor|captains? regent|cabinet|ministers|government|members|parliament|assembly|congress|senate|knesset|speaker|first minister|head of state|pope|sultan|emir|taoiseach|vice president|term)\b/i;
const FUTURE = /\b(?:will|to|scheduled to|expected to|due to|set to|is to|are to)\s+(?:be\s+)?$/i;

const SUMMIT_ACT = /\bsummit (?:is|was) held|\bsummit (?:opens|begins|starts|concludes|ends|closes)\b|\b(?:hosts?|holds?|convenes?|attends?|gathers? for|meets? (?:at|for)) (?:the |a |an )?[^.;]{0,60}\bsummit\b|\bat the [^.;]{0,60}\bsummit\b|\bsummit (?:in|at|between|of) /i;
const VISIT = /\b(?:state visit|official visit|begins (?:a |an |his |her |the )?(?:[\w-]+ ){0,2}visit|arrives? in [A-Z][^,.;]{0,40} for (?:a |an )?(?:[\w-]+ ){0,2}(?:visit|summit)|(?:pays|makes) (?:a |an |his |her )?(?:[\w-]+ ){0,2}visit to)\b/i;
const SUMMIT_STORY = /\b(?:summit|state visit|official visit|visit by|visit to|visits? of|Conference of the Parties|Climate Change Conference|COP\d+|G7|G20|BRICS|APEC|ASEAN|European Council|General Assembly|Heads of Government Meeting)\b/;

const REFERENDUM = /\b(?:referend(?:um|ums|a)|plebiscite|ballot (?:initiative|measure)|popular initiative|recall vote)\b/i;
const REF_ACT = /\b(?:(?:voters?|residents|electorate|citizens)\b[^.;]{0,30}\b(?:approve|reject|vote|back|endorse|go to the polls|backed|rejected|approved)|(?:is|are) held|votes? (?:on|in favour|in favor|against|to)|(?:referendum|initiative|measure|proposal|amendment)s? (?:passes|fails|(?:is|are) (?:approved|rejected|passed|defeated))|results? (?:show|indicate)|turnout|voting (?:takes place|begins))\b/i;

const RESIGN = /\b(?:resigns|resign from|announces (?:his|her|their) (?:intention to resign|resignation)|steps down|tenders? (?:his|her|their) resignation|submits (?:his|her|their) resignation|hands in (?:his|her|their) resignation|quits as)\b/i;
const RESIGN_NOT = /\b(?:demand\w*|call\w*|urg\w*|pressur\w*|ultimatum|asks?|push\w*)\b[^.;]{0,70}\bresign|\bno intention of resigning\b|\bwill not resign\b|\brefus\w+ to resign\b|\brules? out resigning\b|\bdeni\w+ [^.;]{0,30}resign|\b(?:who|which) (?:had )?resigned\b|\b(?:after|following) the resignation of\b|\bresignation of [^.;]{0,60} (?:was|is) (?:demanded|sought)\b|\bthreatens? to resign\b/i;

const VOTE_CONF = /\b(?:no[- ]confidence|confidence (?:vote|motion)|vote of (?:no )?confidence|motion of (?:no )?confidence|censure motion|motion of censure)\b/i;
const VOTE_WIN = /\b(?:passes|pass|wins|survives|loses|fails|(?:is|are) ousted|ousts|approves|rejects|defeats|votes? (?:\d+[–-]\d+ )?(?:to|for|against|in favour)|(?:is|are) (?:defeated|approved|rejected|passed)|collapses|falls)\b/i;
const VOTE_STEP = /\b(?:holds|tables|files|debates|submits|introduces|schedules)\b/i;
const IMPEACH = /\b(?:(?:is|are) impeached|impeaches|votes? to impeach|impeachment (?:trial|vote|motion|proceedings|inquiry|process|hearings?) (?:begins|opens|starts|ends|concludes|resumes)|(?:approves|passes|rejects|files|introduces) (?:the |an |articles of )?impeachment|articles of impeachment|(?:acquits|convicts|removes) [^.;]{0,60}impeach|impeachment (?:trial|court)[^.;]{0,40}\b(?:acquits|convicts|removes|votes))\b/i;
const BUDGET = /\b(?:passes|approves|adopts|enacts|rejects|votes? (?:on|for|against|down)|fails to pass|(?:is|are) (?:passed|approved|adopted|rejected))\b[^.;]{0,60}\bbudget\b|\bbudget (?:is|was) (?:passed|approved|adopted|rejected|voted down)\b/i;
const LEGISLATURE = /\b(?:parliament|assembly|congress|senate|house|chamber|diet|councillors|lawmakers|legislat\w+|deputies|MPs|Bundestag|Knesset|Duma|Sejm|Rada|Riksdag|Storting|Folketing|Cortes|Dáil|Majlis|Lok Sabha|Saeima|Seimas|Riigikogu|Sabor|Skupština|Verkhovna)\b/i;

/**
 * Which calendar type a news item is, if any: { type, score, at, end, story }.
 * `at`/`end` mark the words that decided it (for the headline); `story` = the heading that names the event better
 * than the sentence does (a protest wave, a summit, a leadership election, a referendum); `score` ranks one story's items.
 */
export function classify(item) {
  const t = item.text, topics = item.topics || [];
  if (/^(?:sports|arts and culture|science and technology|disasters and accidents)$/i.test(item.category)) return null;
  const storyMatching = re => [...topics].reverse().find(x => re.test(x.text) && !NOT_PROTEST.test(x.text));
  let h;

  // Inaugurations & swearing-in
  if (inCats(item, 'politics') && (h = hit(INAUGURATION, t)) && !FUTURE.test(t.slice(Math.max(0, h.at - 30), h.at)) && INAUG_SUBJECT.test(t)
    && !/\binaugurates? (?:a|an|the|its) (?!new (?:government|president|parliament))/i.test(t))
    return { type: 'inauguration', score: 2, ...h };

  // Resignations ("resigns as party leader" is a resignation, not a party contest)
  if ((h = hit(RESIGN, t)) && !RESIGN_NOT.test(t) && OFFICE.test(t) && !/\b(?:coach|FIFA|UEFA|football|club|jury)\b/i.test(t)
    && (!reportedBefore(t, h.at) || /announces/i.test(t.slice(h.at, h.end))))
    return { type: 'resignation', score: /\b(?:prime minister|president|premier|chancellor|government|cabinet)\b/i.test(t) ? 3 : 2, ...h };

  // Referendums (before sanctions: "voters reject an initiative … that would have barred sanctions")
  const refStory = storyMatching(/referend|plebiscite/i);
  if (inCats(item, 'politics') && (REFERENDUM.test(t) || refStory) && (h = hit(REF_ACT, t))
    && !/\b(?:will hold|to hold|plans? to hold|calls? for|proposes?|announces? (?:a|plans))\b[^.;]{0,30}\breferend/i.test(t))
    return { type: 'referendum', score: 3, at: 0, end: 0, story: refStory }; // the first sentence says what was voted on

  // Party leadership contests & congresses
  const partyStory = storyMatching(PARTY_STORY);
  if (inCats(item, 'politics') && ((h = hit(PARTY, t)) || (partyStory && (h = hit(/\b(?:elected|wins|won|vote|ballot|congress|convention|conference|candidate)\b/i, t))))
    && !/\bprimary (?:school|airport|care|source)/i.test(t) && !/\bNational Congress\b(?! of the)/.test(t.slice(h.at, h.end)))
    return { type: 'party', score: 2, ...h, story: partyStory };

  // Parliamentary votes: confidence, impeachment, budget
  if (inCats(item, 'politics', 'business', 'law')) {
    if ((h = hit(VOTE_CONF, t)) && (VOTE_WIN.test(t) || VOTE_STEP.test(t)) && !/\b(?:was|were|had been) (?:ousted|defeated)\b|\blost (?:a|the) (?:no[- ])?confidence|\bbacked a no[- ]confidence\b/i.test(t)) {
      if (/\bwithin the [^.;]{0,40}(?:party|caucus)|\bon (?:his|her) leadership\b|\bparty room\b/i.test(t)) return { type: 'party', score: 2, ...h };
      return { type: 'vote', score: VOTE_WIN.test(t) ? 4 : 2, ...h };
    }
    if ((h = hit(IMPEACH, t))) return { type: 'vote', score: /\b(?:is|are) impeached|impeaches|convicts|removes|acquits/i.test(t) ? 4 : 2, ...h };
    if ((h = hit(BUDGET, t)) && LEGISLATURE.test(t)) return { type: 'vote', score: 3, ...h };
  }

  // Court rulings: constitutional and supreme courts, the ICJ, the ICC, the ECHR and the CJEU
  if (inCats(item, 'law', 'politics', 'relations', 'conflict', 'health', 'business')) {
    for (const m of t.matchAll(new RegExp(COURT.source, 'g'))) {
      const pre = t.slice(Math.max(0, m.index - 30), m.index);
      if (/\bformer [\w ]*$|\b(?:urges?|asks?|calls? on|petitions?|appeals? to|requests?|before|to|with|against) (?:the )?$/i.test(pre)) continue;
      if (US_STATE.test(pre.slice(-22)) || US_STATE.test(m[0].replace(/^.*? of /, ''))) continue;
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 90);
      const r = RULING.exec(after);
      if (!r || /\b(?:justice|judge|nominee|nomination|president|building)s?\b/i.test(after.slice(0, Math.min(r.index, 14))) && !/^[^.;]{0,40}\b(?:suspends|orders|rules|blocks)\b/.test(after)) continue;
      if (REPORTED.test(after.slice(0, r.index)) || /\b(?:withdraw|leave|member states|files? a (?:complaint|lawsuit))\b/i.test(t.slice(0, m.index + m[0].length + 60))) continue;
      return { type: 'court', score: /International (?:Court|Criminal)|ICJ|ICC/.test(m[0]) ? 3 : 2, at: m.index, end: m.index + m[0].length + r.index + r[0].length };
    }
  }

  // The sentence's main clause: sanctions, summits and visits must be what the item is about, not a side remark.
  const main = mainClause(t);

  // Sanctions
  if (inCats(item, 'relations', 'business', 'conflict', 'politics', 'law') && /\bsanction|\beconomic war\b/i.test(main) && (h = hit(SANCTION_ACT, main)) && !SANCTION_NOT.test(t)
    && !/\b(?:says|said|warns|threatens|reports|reportedly|claims|considers|plans|proposes|calls for|urges)\b/i.test(main.slice(0, h.at)))
    return { type: 'sanctions', score: /\bpackage\b|European Union|Council of the European Union/i.test(t) ? 3 : 2, ...h };

  // Ceasefires & peace talks
  if (inCats(item, 'conflict', 'relations', 'politics') && (h = hit(CEASEFIRE, t)) && !reportedBefore(t, h.at) && !NOT_YET.test(t.slice(Math.max(0, h.at - 40), h.at))
    && !/\b(?:will be held|will take place|will resume|is scheduled|are scheduled)\b/i.test(t.slice(h.at, h.end + 60))
    && !/\bviolat\w+\b[^.;]{0,30}\b(?:ceasefire|truce)\b|\b(?:ceasefire|truce) violations?\b/i.test(t.slice(0, h.at)))
    return { type: 'ceasefire', score: /\b(?:agree|sign|into (?:force|effect)|declares?|accept)/i.test(t.slice(h.at, h.end)) ? 3 : 2, ...h };

  // Summits & state visits
  if (inCats(item, 'relations', 'politics', 'health', 'business')) {
    // A summit or visit article as the story ("52nd G7 summit", "2026 state visit by …"), not a "… relations" heading.
    const story = [...topics].reverse().find(x => !/^List of/i.test(x.text) && /summit|state visit|official visit|visit by|visit to|visits of|Conference of the Parties|Climate Change Conference|COP\d|Heads of Government Meeting|general debate/i.test(x.text));
    h = (/\bsummit\b/i.test(main) && !/\bsummit of (?:Mount|Everest|K2|the mountain)/i.test(main) && hit(SUMMIT_ACT, main)) || hit(VISIT, main);
    if (!h && story && /\b(?:summit|visit|leaders|heads of state|heads of government|general debate)\b/i.test(t)) h = hit(/\b(?:summit|visit|leaders|heads of state|heads of government|general debate)\b/i, t);
    if (h && !reportedBefore(main, h.at) && !/\bon the sidelines\b|\b(?:foreign|defen[cs]e) ministers?\b[^.;]{0,40}\b(?:meet|hold talks)|\benvoys?\b/i.test(main))
      return { type: 'summit', score: /\bsummit (?:is|was) held|state visit/i.test(t) ? 3 : 2, ...h, story: story || null };
  }

  // Protests & strikes: major national ones, or a protest wave notable enough to have its own article
  if (inCats(item, 'politics', 'law', 'business', 'relations', 'health')) {
    const story = topics.find(x => PROTEST_STORY.test(x.text) && !NOT_PROTEST.test(x.text));
    const act = hit(PROTEST_ACT, main);
    const big = BIG.test(t) && act && !NOT_PROTEST.test(main);
    if (story && act && !NOT_PROTEST.test(main)) return { type: 'protest', score: big ? 3 : 1, ...act, story };
    if (big) return { type: 'protest', score: 3, ...act };
  }
  return null;
}

// The link that names the event itself or its subject ("Evika Siliņa", "Louisiana v. Callais"), not a country.
const INSTITUTION = /\b(?:minister|president|parliament|assembly|congress|senate|party|court|government|council|union|ministry|army|forces|police|office|department|agency|commission|committee|elections?|bank|organi[sz]ation|movement|front|league|alliance|corps|guard|service|navy|air force|house|chamber|cabinet|state|province|region|city|district|county|relations|war|crisis|conflict|treaty|nato|united nations|european|labour|labor|tories|conservatives?|liberals?|democrats?|republicans?|socialists?|greens?|nationalists?|communists?|execution|sentence|pardon|warrant|euro|dollar)\b/i;
const wiki = t => t ? `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}` : null;
function subjectLink(item, type, at) {
  const links = item.links.filter(l => (!isCountryName(l.target) && !/,/.test(l.target) && !/\((?:country|state|city|region|province)\)$/.test(l.target)) || / v\. /.test(l.target));
  const story = item.topics.at(-1)?.links?.[0];
  const before = l => { const i = item.text.indexOf(l.label); return i >= 0 && i <= at; };
  // A person: two to six capitalised words, not a place or an institution, named before the key words.
  const person = l => before(l) && !INSTITUTION.test(l.target) && !countryOfLink(l.target) && /^[A-ZÀ-Ž]/.test(l.target)
    && l.target.replace(/ \(.*\)$/, '').split(' ').length >= 2 && l.target.split(' ').length <= 6;
  if (type === 'court') return links.find(l => / v\. |\bcase\b/i.test(l.target))?.target || story || links.find(l => COURT.test(l.target))?.target || links[0]?.target;
  if (type === 'resignation' || type === 'inauguration') return links.find(person)?.target || story || links[0]?.target;
  if (type === 'party') return story || links.find(person)?.target || links[0]?.target;
  if (type === 'vote') return story || links.find(l => LEGISLATURE.test(l.target))?.target || links.find(l => /budget|motion|impeachment|confidence/i.test(l.target))?.target || links[0]?.target;
  return story || links.find(l => !INSTITUTION.test(l.target))?.target || links[0]?.target;
}

// How far apart two items of the same story must be to both count, per type (days).
const SPACING = { protest: 10, ceasefire: 5, summit: 4, party: 3, referendum: 3, vote: 1, inauguration: 1, court: 1, sanctions: 1, resignation: 1 };
const STORY_RE = { protest: PROTEST_STORY, summit: /summit|visit|Conference|COP\d|G7|G20|BRICS|APEC|ASEAN|European Council|Heads of Government/i, party: PARTY_STORY, referendum: /referend|plebiscite/i };

/** Typed events from parsed items, with ongoing stories thinned to their main moments. */
export function eventsFromItems(items) {
  const cands = [];
  for (const item of items) {
    const c = classify(item);
    if (!c) continue;
    const t = item.text;
    // The story's own article names the event best ("2026 Bolivian protests"); otherwise the sentence's headline.
    const storyTarget = c.story ? (c.story.links.find(l => STORY_RE[c.type]?.test(l)) || c.story.links[0]) : null;
    const title = storyTarget || headline(t, c.at, c.end);
    // Country: for sanctions the target; after "announces that …" the subject of the news, not the announcer.
    const after = /\b(?:announces?|confirms?|says|reports?|declares?) that (.+)$/i.exec(t)?.[1];
    const target = c.type === 'sanctions' ? (/\bsanction\w*\s+(?:on|against|targeting|upon)\s+(.+)$/i.exec(t)?.[1] || /\b(?:on|against|targeting|upon)\s+(.+)$/i.exec(t.slice(c.at))?.[1]) : null;
    // A summit's or referendum's own article names its host ("2026 Ankara NATO summit", "2026 Alberta … referendum").
    const named = (c.type === 'summit' || c.type === 'referendum') && storyTarget ? storyTarget : null;
    const country = countryOf({ links: item.links.map(l => l.target), text: t, topics: item.topics.map(x => x.text), prefer: target || named || after || null }) || 'International';
    const ref = item.refs.find(r => !/wikipedia\.org/.test(r.url));
    const storyKey = c.story ? c.story.text : (item.topics.at(-1)?.text || '');
    cands.push({
      date: item.date, country, title, type: c.type, status: 'declared',
      source: wiki(storyTarget || subjectLink(item, c.type, c.at)),
      summary: t, ref: ref?.url, refName: ref?.outlet || undefined,
      score: c.score, key: `${c.type}|${storyKey ? 'story:' + storyKey : 'item:' + country + ':' + title.slice(0, 60)}`,
    });
  }
  // Within one story, keep the best item in each spacing window (on the same day, the higher score wins).
  cands.sort((a, b) => a.date.localeCompare(b.date) || b.score - a.score);
  const lastKept = new Map(), out = [];
  for (const e of cands) {
    const k = lastKept.get(e.key);
    if (k && (Date.parse(e.date) - Date.parse(k.date)) / 864e5 < SPACING[e.type]) continue;
    out.push(e); lastKept.set(e.key, e);
  }
  return out.map(({ score, key, ...e }) => Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== '')));
}

/** Fetch the day pages from `from` to `to` (inclusive), 50 per request. Returns Map(date → wikitext). */
export async function fetchDays(from, to) {
  const days = [];
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const out = new Map();
  for (let i = 0; i < days.length; i += 50) {
    const batch = days.slice(i, i + 50);
    const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.map(pageTitle).join('|'), format: 'json', formatversion: '2' });
    let pages = null;
    for (let attempt = 0; attempt < 4 && !pages; attempt++) {
      try {
        const res = await fetch(url, { headers: UA });
        if (res.ok) pages = (await res.json()).query?.pages || [];
      } catch {}
      if (!pages) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
    }
    if (!pages) throw new Error(`Current events: could not fetch ${batch[0]}…${batch.at(-1)}`);
    const byTitle = new Map(pages.map(p => [p.title, p.revisions?.[0]?.slots?.main?.content || '']));
    for (const d of batch) out.set(d, byTitle.get(pageTitle(d)) || '');
  }
  return out;
}

export async function currentEvents(from, to) {
  const days = await fetchDays(from, to);
  const items = [...days].flatMap(([d, text]) => parseDay(d, text));
  return { events: eventsFromItems(items), days: [...days.values()].filter(Boolean).length, items: items.length };
}

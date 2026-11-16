// The rules the lake build (build.mjs) applies to what Wikidata and Wikipedia send back, kept here as plain functions
// so the tests can hold them (build.mjs builds the lake when it runs, so a test cannot import it). From the Master
// Index sweep of 15 November 2026 (MI-10):
//   - a Wikimedia disambiguation page is no entity (isDisambiguation): a title that is one ("David Einhorn", "Juan
//     Bosch") is left out with a warning naming the module and key, and a related item that is one gets no page;
//   - a batch of IDs Wikidata answers with an error is split and asked again (getBatched), so one bad ID no longer
//     leaves fifty names as bare QIDs ("Q22686" for Donald Trump);
//   - a name falls back from English to the article's title, the multilingual label, the module's own name, the last
//     build's label and another language before it is ever a bare QID (entityLabel, nameOf);
//   - a person's shown name drops the realm after a regnal number or a comma title (shownName: "Frederik X", not
//     "Frederik X of Denmark"), while the label, which the Bibliotheca tagger matches, stays as Wikidata has it;
//   - a summary is the article's own: not the article a redirect leads to, not a disambiguation page (summaryFor,
//     restSummary);
//   - a Retrospective leader's event text that starts with a QID ("Q20055561 takes power") names the leader
//     (leaderText), in the lake adapter and in the calendar build alike.

export const isQid = s => /^Q[1-9]\d*$/.test(String(s ?? ''));
export const normTitle = t => String(t).replace(/_/g, ' ').trim().replace(/^./, c => c.toUpperCase());

// Wikimedia disambiguation page (Q4167410) and its subclasses on Wikidata (SPARQL, 16 November 2026): a human name
// disambiguation page, a surname disambiguation page, a scope-limited one, and the category and portal kinds. David
// Einhorn, Juan Bosch, Ivar Lykke, Bjarni Benediktsson and Andris Bērziņš are Q22808320, not Q4167410, so the class
// alone would miss most of them.
export const DISAMBIGUATION = new Set(['Q4167410', 'Q22808320', 'Q66480449', 'Q141143653', 'Q15407973', 'Q141135402']);
const values = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
/** Whether a Wikidata entity is a disambiguation page of any kind (its P31). */
export const isDisambiguation = e => values(e, 'P31').some(q => DISAMBIGUATION.has(q));

/** wbgetentities in batches of `size`; a batch that comes back with an error or without `entities` (one ID Wikidata
 *  refuses fails the whole batch) is split in halves and asked again, down to single IDs; an ID that still fails is
 *  left out with a warning. A request that throws (the network down after getJson's retries) throws: that is no bad
 *  ID, and the build stops as before. Returns { id: entity }. */
export async function getBatched(ids, call, { size = 50, warn = m => console.warn(m) } = {}) {
  const out = {};
  const ask = async batch => {
    const r = await call(batch);
    if (r && r.entities && !r.error) { Object.assign(out, r.entities); return; }
    if (batch.length === 1) { warn(`Wikidata gave nothing for ${batch[0]}${r?.error?.code ? ` (${r.error.code})` : ''}; left out`); return; }
    const h = Math.ceil(batch.length / 2);
    await ask(batch.slice(0, h));
    await ask(batch.slice(h));
  };
  for (let i = 0; i < ids.length; i += size) await ask(ids.slice(i, i + size));
  return out;
}

// The languages a label falls back to when Wikidata has neither an English nor a multilingual one, in order: those
// an English reader most often reads, Latin script first; then any.
const OTHER_LANGUAGES = ['en-gb', 'en-ca', 'en-us', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'nn', 'fi', 'pl', 'cs', 'ro', 'hu', 'hr', 'sl', 'tr', 'id', 'ca', 'el', 'ru', 'uk', 'bg', 'sr'];
/** A label in another language from an entity's `labels` ({ lang: { value } }), or null. */
export function otherLabel(labels = {}) {
  for (const l of OTHER_LANGUAGES) if (labels[l]?.value) return labels[l].value;
  return Object.values(labels).map(x => x?.value).find(Boolean) || null;
}

/** An entity's label: English, else the English article's title (as before November 2026, so no label the books are
 *  tagged by changes), the multilingual label, a name a module gives it, the label the last build gave it, a label in
 *  another language; a bare QID only when there is nothing else. No candidate that is itself a QID counts (the
 *  Retrospective names some parties by their QID). */
export function entityLabel(e, { title = null, names = [], committed = null, other = null, q = e?.id } = {}) {
  for (const c of [e?.labels?.en?.value, title, e?.labels?.mul?.value, ...names, committed, other]) if (c && !isQid(c)) return c;
  return q;
}

/** The name a related entity's QID shows as (a fact's Participants, Positions held …): the fetched label, else the
 *  last build's record or index label, else the QID. `fetched` and `committed` are Maps or objects of qid → label. */
export function nameOf(q, { fetched = new Map(), committed = new Map() } = {}) {
  const get = (m, k) => (m instanceof Map ? m.get(k) : m?.[k]);
  for (const c of [get(fetched, q), get(committed, q)]) if (c && !isQid(c)) return c;
  return q;
}

// The shown name of a person whose Wikidata label carries a realm (as National Analysis's plainName, commit 226d8af,
// NA-03): a title after a comma ("Albert II, Prince of Monaco") or, after a regnal number, " of " and a capitalised
// place ("Frederik X of Denmark", "Louis XII of France"). Without a regnal number " of " is kept: Catherine of Aragon,
// John of Gaunt. Persons only: "Kingdom of France" is a name. The page and the index show it; the label, which the
// Bibliotheca tagger matches, and its aliases keep the full form ("Alexander I" alone would tag every book's Alexanders).
const REALM_TITLE = /,\s+(?:(?:Hereditary|Crown|Grand|Sovereign)\s+)?(?:Prince|Princess|Duke|Duchess|King|Queen|Emir|Sultan|Emperor|Empress)\s+of\s+.+$/;
const REGNAL_REALM = /^(.*\s[IVXLC]+)\s+of\s+(?:the\s+)?\p{Lu}[\p{L}'’-]*(?:\s+(?:and\s+)?\p{Lu}[\p{L}'’-]*)*$/u;
// The second reader (F1, 16 November 2026): the short name alone made two entries one ("Albert II" for Albert II,
// Prince of Monaco, and Albert II of Belgium) and gave some eighteen kings a name Wikipedia keeps with its realm because
// it is ambiguous (Ferdinand II of Aragon, Charles VIII of France). With the entry's English Wikipedia `title`, the
// short name is shown only where it is that title: Wikipedia has judged it plain ("Frederik X", "Louis XII"). With no
// article it is shown unless another entry would be shown by it (uniqueNames, once every record is made).
export function shownName(label, type, { title = null } = {}) {
  if (type !== 'person' || typeof label !== 'string') return label;
  const t = label.replace(REALM_TITLE, '').trim();
  const m = label.match(REGNAL_REALM);
  const short = t !== label ? (/\p{L}/u.test(t) ? t : label) : m && /\p{L}/u.test(m[1]) ? m[1] : label;
  return short !== label && title && normTitle(title) !== short ? label : short;
}
/** After every record is made (`records`: Map q → { label, name?, … }): a shown name (`name`) that is another entry's
 *  shown name or label is taken back, so no two entries show as one; both "Albert II"s keep their labels. Returns the
 *  QIDs whose name was taken back. */
export function uniqueNames(records) {
  const count = new Map(), add = n => count.set(n, (count.get(n) || 0) + 1);
  for (const r of records.values()) { add(r.label); if (r.name && r.name !== r.label) add(r.name); }
  const back = [];
  for (const [q, r] of records) if (r.name && r.name !== r.label && count.get(r.name) > 1) { delete r.name; back.push(q); }
  return back;
}
/** A person's aliases with the English Wikipedia title added where it is neither the label nor the shown name
 *  ("Rainier III of Monaco" for "Rainier III, Prince of Monaco"), so a search by Wikipedia's name finds the entry. A
 *  title Wikipedia tells apart by a bracket ("Robert Brown (botanist, born 1773)") is no name anyone uses: left out. */
export function titleAlias(aliases, { label, name = null, title = null, type }) {
  if (type !== 'person' || !title || /\(.*\)\s*$/.test(title)) return aliases;
  const t = normTitle(title);
  return t === label || t === name || aliases.includes(t) ? aliases : [...aliases, t];
}

// The badges Wikidata puts on a sitelink that leads to a redirect ("sitelink to redirect", "intentional sitelink to
// redirect"): Wikipedia's summary for that title is the article it redirects to (First Phase Offensive's was the
// Korean War's).
export const REDIRECT_BADGES = new Set(['Q70893996', 'Q70894304']);
// A summary that is a disambiguation page's ("Ivar Lykke may refer to: …", "Battle of Livno is the name of several
// battles"). The colon matters: an article's own lead may say a term "can refer to" one of its senses (the degree
// Celsius, nonviolence, the Chinese Empire); a list of namesakes opens with "may refer to:". On the build of 15 November
// 2026 this finds the sweep's eleven and nothing else.
export const DISAMBIGUATION_TEXT = /\b(?:may|can) (?:also )?refer to:|\bis the name of (?:several|many|two|three|various)\b/i;
/** The summary a record keeps, and why it has none: { summary, ns }. `sitelink` is the entity's enwiki sitelink
 *  ({ title, badges }), `text` the cached summary (undefined when never fetched). ns: 'redirect' (the title leads to
 *  another article), 'disambiguation' (the page lists namesakes), 'empty' (Wikipedia gave no text), 'unfetched' (the
 *  request failed; the next build asks again). */
export function summaryFor(sitelink, text) {
  if (!sitelink?.title) return { summary: '' };
  if ((sitelink.badges || []).some(b => REDIRECT_BADGES.has(b))) return { summary: '', ns: 'redirect' };
  if (text === undefined || text === null) return { summary: '', ns: 'unfetched' };
  if (!text) return { summary: '', ns: 'empty' };
  if (DISAMBIGUATION_TEXT.test(text)) return { summary: '', ns: 'disambiguation' };
  return { summary: text };
}
/** What to cache from Wikipedia's REST summary of `requested`: its extract, or '' when the answer is another article
 *  (the request followed a redirect: its title is not the one asked for) or a disambiguation page. */
export function restSummary(r, requested) {
  if (!r) return '';
  if (r.type === 'disambiguation') return '';
  const asked = normTitle(requested), got = [r.titles?.canonical, r.titles?.normalized, r.title].filter(Boolean).map(t => { try { return normTitle(decodeURIComponent(t)); } catch { return normTitle(t); } });
  if (got.length && !got.includes(asked)) return '';
  return String(r.extract || '');
}

/** A Retrospective event's text with a leading QID ("Q20055561 takes power", Wikidata had no label for the leader the
 *  day the Retrospective was built) put as the leader's name: the leader of `leaders` who took office that day. */
export function leaderText(text, leaders = [], date = null) {
  const m = String(text ?? '').match(/^(Q[1-9]\d*)\b(.*)$/s);
  if (!m) return text;
  const l = leaders.find(x => x.start === date && (x.full || x.name) && !isQid(x.full || x.name));
  return l ? `${l.full || l.name}${m[2]}` : text;
}

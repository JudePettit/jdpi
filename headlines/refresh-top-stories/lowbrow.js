// The Global Headline Tracker's lowbrow filter, shared by the refresh-top-stories Edge Function (Deno: it bundles this
// file), q/headlines.html (its GDELT fallback and stories not yet judged) and tests/headlines.test.mjs.
// Lowbrow: celebrity and showbiz gossip, reality TV, horoscopes and lotteries, puzzles and quizzes, shopping deals and
// sponsored content, viral oddities and clickbait. The function asks Claude (RUBRIC) about every story, in any language,
// as it translates; these fixed rules only take the unmistakable cases without an API call, so they stay narrow: no news
// story should ever match one. Sport, culture and serious human-interest reporting are news.

// The definition Claude judges by (one request per country, refresh-top-stories/index.ts → screen()).
export const RUBRIC = 'A headline is lowbrow when its story is mainly: celebrity, showbiz or influencer gossip (relationships, looks, outfits, feuds); reality TV or talent-show contestants; the private lives of royals or celebrities with no public significance; sex or dating; horoscopes, astrology, lotteries, puzzles or quizzes; shopping deals, product promotions, sponsored or advertorial content; viral oddities; or clickbait that withholds what happened. Everything else is news, including politics and government, the economy and business, conflict and security, crime and the courts, disasters, health, science and technology, the environment, culture and the arts, and sport. When unsure, it is news.';

// Site sections, as one whole URL path segment in lower case, that carry nothing but lowbrow stories, in the tracker's
// languages. Broad sections that also carry news or the arts (entertainment, Unterhaltung, lifestyle, royals,
// espectáculos, spettacoli) are left to Claude. Google News links are opaque, so for those outlets only titles count.
export const SECTIONS = new Set([
  // English
  'showbiz', 'tvshowbiz', 'tv-showbiz', 'tvandshowbiz', 'celebrity', 'celebrities', 'celebs', 'celeb', 'gossip', 'femail', 'fabulous', '3am',
  'bizarre', 'weird-news', 'offbeat', 'oddities', 'horoscope', 'horoscopes', 'astrology', 'lottery', 'lotto', 'puzzles', 'crosswords', 'quizzes',
  'sponsored', 'advertorial', 'partner-content', 'paid-content', 'branded-content', 'vouchers', 'coupons',
  // German, Dutch, Scandinavian
  'promis', 'promi', 'stars', 'leute', 'klatsch', 'horoskop', 'horoskope', 'anzeige', 'showbizz', 'prive', 'achterklap', 'horoscoop',
  'nojesbladet', 'kjendis', 'kendte',
  // French, Spanish, Portuguese, Italian
  'people', 'potins', 'astrologie', 'insolite', 'tele-realite', 'telerealite', 'famosos', 'famosas', 'farandula', 'corazon', 'gente',
  'celebridades', 'horoscopo', 'horoscopos', 'loteria', 'loterias', 'virales', 'curiosidades', 'insolito', 'oroscopo', 'vip',
  // Central and Eastern Europe, Turkey
  'plotki', 'gwiazdy', 'bulvar', 'sztarok', 'horoscop', 'astroloji',
]);

// Headline patterns (English: original titles in English-speaking countries, and every stored English title), each
// with the label its reason shows. Specific on purpose: "Bikini Atoll", "MPs quiz the minister", "state-sponsored
// hackers", "a Big Brother state" and "the Zodiac killer" are news.
export const TITLES = [
  ['horoscope', /\bhoroscopes?\b|\b(?:star ?signs?|zodiac signs?) (?:today|this week|for)\b|\btarot\b/i],
  ['lottery results', /\b(?:lotto|euromillions|powerball|mega millions|thunderball|national lottery)\b.{0,25}\b(?:results|winning numbers|draw)\b/i],
  ['puzzle answers', /\b(?:wordle|quordle|crossword|sudoku|connections)\b.{0,20}\b(?:hints?|answers?|clues?)\b/i],
  ['quiz', /^quiz\s*[:|–-]|\bquiz\s*:|\btake (?:our|the|this) quiz\b/i],
  ['clickbait', /\byou won'?t believe\b|\bwill leave you speechless\b|\bnumber \d+ will shock you\b/i],
  ['reality TV', /\b(?:love island|i'?m a celebrity|strictly come dancing|great british bake off|real housewives|married at first sight|gogglebox|towie|made in chelsea|keeping up with the kardashians)\b|\bbig brother (?:house|housemates?|star|contestant|eviction|finale)\b/i],
  ['looks and outfits', /\b(?:braless|busty|leggy|cleavage-baring)\b|\b(?:sizzles|wows|stuns|dazzles) in (?:a |her |his )?(?:plunging|racy|sheer|skimpy|bikini|swimsuit|lingerie|corset|bodysuit)\b|\bshows off (?:her|his) (?:figure|curves|abs|toned|bump|pins|physique)\b|\bin (?:a|her) (?:tiny |skimpy |string |barely-there )?bikini\b/i],
  ['sponsored', /^sponsored\b|\[sponsored\]|\b(?:advertorial|promoted content|paid content|sponsored content|sponsored post)\b/i],
  ['shopping deals', /\b(?:deals? of the day|discount codes?|voucher codes?|promo codes?|(?:black friday|cyber monday|prime day) deals)\b/i],
];

// Why a story is lowbrow by the fixed rules ("section /tvshowbiz/", "title: horoscope"), or null. Every title given
// is checked (the original and the English one); the URL's path segments against SECTIONS.
export function ruleHit(url, ...titles) {
  let path = [];
  try { path = new URL(url).pathname.toLowerCase().split('/').filter(Boolean); } catch { /* not a URL: titles only */ }
  const section = path.find(s => SECTIONS.has(s));
  if (section) return `section /${section}/`;
  for (const t of titles) {
    if (!t) continue;
    const hit = TITLES.find(([, re]) => re.test(t));
    if (hit) return `title: ${hit[0]}`;
  }
  return null;
}

// An outlet's tracked stories: its first `keep` candidates (front-page order) that are not lowbrow, so a lowbrow
// story's place goes to the outlet's next one. An item is lowbrow by its fixed rule (`rule`) or Claude's verdict
// (`verdict.lowbrow`). Returns the kept items and the lowbrow ones passed over on the way, each with its reason.
export function pickStories(items, keep = 3) {
  const kept = [], left = [];
  for (const it of items) {
    if (kept.length >= keep) break;
    const reason = it.rule || (it.verdict?.lowbrow ? 'classifier' : null);
    if (reason) left.push({ ...it, reason }); else kept.push(it);
  }
  return { kept, left };
}

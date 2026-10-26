// Soft-news filter for Briefing, ported from the Lovable app's categorize.ts. A story is classed as sport or
// entertainment from, in order:
//  1. the publisher's URL section (sport sections; explicit /entertainment/, /showbiz/, /celebrity/ sections);
//  2. headline terms specific to sports results or celebrity coverage;
//  3. an exception: policy, legal or business terms keep the story as news ("Government bans betting ads in
//     football", "FIFA corruption trial").
// Generic words such as "race", "match", "star" or "game" are deliberately not used, so election races and trade
// "games" are never caught. General /culture/, /arts/, /film/ and /books/ sections are not excluded on their own.
// JDP-I adds a third class, lifestyle: advice columns, puzzles, fashion, food, travel, property and shopping sections,
// and their tell-tale headline terms, with the same news exception.
const SPORT_PATH = /\/(sports?|football|soccer|cricket|rugby(-union|-league)?|tennis|golf|formula1|f1|motorsport|nfl|nba|mlb|nhl|cycling|boxing|athletics|olympics)(\/|-|$)/i;
const ENT_PATH = /\/(entertainment|celebrity|celebrities|showbiz|celebrity-news)(\/|-|$)/i;
const LIFE_PATH = /\/(lifestyle|life|advice|style|fashion|beauty|food|recipes?|travel|real-estate|property|puzzles?|crosswords?|games|horoscopes?|astrology|shopping|deals|wellness|dating|relationships|home-garden)(\/|-|$)/i;

const SPORT_TERMS = [
  'Premier League', 'Champions League', 'Europa League', 'La Liga', 'Serie A', 'Bundesliga', 'World Cup qualifier',
  'Super Bowl', 'NFL', 'NBA', 'MLB', 'NHL', 'WNBA', 'Grand Prix', 'Formula 1', 'F1', 'Wimbledon', 'US Open final',
  'Grand Slam', 'Ryder Cup', 'Six Nations', 'Test match', 'IPL', 'Ashes', 'Stanley Cup', 'World Series',
  'touchdown', 'hat-trick', 'hat trick', 'transfer window', 'quarter-final', 'semi-final', 'playoff', 'play-off',
  'head coach', 'striker', 'midfielder', 'goalkeeper', 'quarterback', 'batsman', 'derby win', 'title race',
  "Ballon d'Or", 'Monday Night Football', 'Sunday Night Football', 'Thursday Night Football', 'fantasy football',
];
const ENT_TERMS = [
  'Oscars', 'Oscar nominations', 'Grammys', 'Grammy', 'Emmys', 'Golden Globes', 'Baftas', 'Brit Awards', 'Met Gala',
  'red carpet', 'box office', 'Love Island', 'Strictly Come Dancing', 'Bake Off', 'reality star', 'reality show',
  'pop star', 'popstar', 'Hollywood star', 'celebrity', 'celeb', 'Kardashian', 'Taylor Swift', 'Beyoncé',
  'boyband', 'box set', 'Netflix series', 'album review', 'film review', 'TV review', 'Eurovision',
  'Real Housewives', 'reality stars', 'I’m a Celebrity', "I'm a Celebrity",
];
const LIFE_TERMS = [
  'crossword', 'Mini Crossword', 'trivia quiz', 'news quiz', 'horoscope', 'Wordle', 'Connections hints', 'recipe',
  'recipes', 'Dear Prudence', 'Ask Amy', 'Dear Abby', 'gift guide', 'best deals', 'Prime Day', 'Black Friday deals',
];
const KEEP_TERMS = [
  'law', 'laws', 'bill', 'ban', 'bans', 'banned', 'regulator', 'regulation', 'government', 'minister', 'parliament',
  'Congress', 'Senate', 'court', 'trial', 'lawsuit', 'sued', 'antitrust', 'corruption', 'fraud', 'investigation',
  'tax', 'subsidy', 'funding', 'budget', 'takeover', 'acquisition', 'merger', 'bankrupt', 'administration',
  'strike', 'union', 'visa', 'sanctions', 'human rights', 'doping', 'gambling', 'betting', 'broadcast rights',
  'media rights', 'stadium', 'economy', 'shares', 'profit', 'revenue',
  'publisher', 'publishing', 'copyright', 'industry', 'jobs', 'layoffs', 'censorship', 'licence', 'license',
  // JDP-I: politics and conflict that surface in celebrity or sport sections stay visible.
  'election', 'campaign', 'rally', 'midterms', 'candidate', 'Democrat', 'Democrats', 'Republican', 'Republicans',
  'Trump', 'president', 'prime minister', 'war', 'invasion', 'healthcare', 'boycott', 'protest',
];
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = words => new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escapeRe).join('|')})($|[^\\p{L}\\p{N}])`, 'iu');
const SPORT_RE = compile(SPORT_TERMS), ENT_RE = compile(ENT_TERMS), LIFE_RE = compile(LIFE_TERMS), KEEP_RE = compile(KEEP_TERMS);
const pathOf = url => { try { return new URL(url).pathname; } catch { return ''; } };

/** 'news' | 'sports' | 'entertainment' | 'lifestyle' */
export function categorize(title, url) {
  const path = pathOf(url);
  const sport = SPORT_PATH.test(path) || SPORT_RE.test(title);
  const ent = ENT_PATH.test(path) || ENT_RE.test(title);
  const life = LIFE_PATH.test(path) || LIFE_RE.test(title);
  if (!sport && !ent && !life) return 'news';
  if (KEEP_RE.test(title)) return 'news';
  return sport ? 'sports' : ent ? 'entertainment' : 'lifestyle';
}

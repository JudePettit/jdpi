// Economics Briefing feed catalogue: economics research and quality economic news, one entry per RSS/Atom feed.
//   kind  'journal' (a peer-reviewed journal's table of contents), 'working' (a working-paper series), 'research'
//         (research columns, notes, blogs and think-tank analysis), 'official' (central-bank and institutional releases,
//         speeches and statements) or 'news' (journalism and commentary)
//   tier  1 = top journals and the flagship working-paper series (NBER, CEPR); 2 = other major journals, central banks
//         and international institutions; 3 = think tanks and research columns; 4 = journalism and commentary
//   fields  the feed's default fields ([] = general: keywords decide; see classify.mjs)
//   outlet  the publication shown on each item (several feeds can share one, e.g. the ECB's working papers, blog and
//           press releases)
//   qid  the outlet's Wikidata item (CC0), for the Encyclopaedia (null where Wikidata has none)
//   cap  optional per-feed limit on stored items (default 150)
//   strict  optional: drop items that match no field (feeds that also carry politics, culture or science)
//   skip  optional: titles that are never stories for this feed (cost estimates for single bills, scam warnings, …)
//   badge  optional: the label on each item instead of the kind's (Project Syndicate is commentary)
//   byline  optional: keep authors on a news feed's items (research items always keep theirs)
// Every candidate was fetched before it went in (October 2026). Tested and left out:
//   IMF working papers, blogs, news and F&D (every IMF RSS address answers 404 "Blob not found" since the site moved;
//   the blog index page is a stale snapshot), World Bank blogs and news (no feed after the blogs moved; /rss → 404),
//   PIIE (its only feed, update.xml, lists events), Bruegel (rss.xml carries event sessions, last updated August),
//   OECD newsroom (Cloudflare challenge, 403; the OECD's Ecoscope blog stands in), Reuters (no public feeds since 2020;
//   reutersagency.com and reuters.com/arc feeds 404) and AP (no public feeds; apnews.com answers 403), Brookings'
//   main feed (/feed/ now redirects to the home page; the article feed works), Marginal Revolution, the Center for
//   Global Development, the Tax Policy Center and VoxDev's /feed (Cloudflare, 403), IZA discussion papers, Kiel,
//   RFF, IEA and the Oxford Institute for Energy Studies (no feed, or an empty one), the Fed's monetary-policy-only
//   feed (a subset of its press releases), MarketWatch (personal-finance features), and the Elsevier journals (JFE, JME,
//   JIE, JDE, JPubE, Energy Economics, JEEM: their feeds give no item dates, only the issue month).

export const TIERS = { 1: 'Top journal or flagship series', 2: 'Major journal, central bank or institution', 3: 'Think tank or research column', 4: 'Journalism and commentary' };
export const KINDS = { journal: 'Journal', working: 'Working papers', research: 'Research & analysis', official: 'Central bank & official', news: 'News & commentary' };
export const DEFAULT_CAP = 150;
// A refresh is written only if at least this share of the feeds answers with items (or "not modified"); otherwise the
// build exits 1 and leaves the store as it was. The data test holds the stored counts to the same share. 75% is 38 of
// the 50 feeds: normal runs have had all 50, and the largest single host carries only four.
export const MIN_WORKING_SHARE = 0.75;

const S = (id, outlet, section, url, feed, kind, tier, fields, qid, extra = {}) =>
  ({ id, outlet, name: section ? `${outlet} · ${section}` : outlet, url, feed, kind, tier, fields, qid, ...extra });

// The FT's morning news digest, and BBC programme pages that come through its business feeds.
const FT_SKIP = /^FirstFT\b/i;
const BBC_SKIP = /^(?:Business Daily|Business Matters|World Business Report|The Briefing Room)\b/i;
// Congressional Budget Office cost estimates for single bills ("H.R. 2102, Major Richard Star Act").
const BILL = /^(?:H\.\s?R\.|S\.|H\.\s?J\.\s?Res\.|S\.\s?J\.\s?Res\.|H\.\s?Res\.|S\.\s?Res\.|H\.\s?Con\.\s?Res\.|S\.\s?Con\.\s?Res\.)\s?\d+\b/;

export const SOURCES = [
  // ---- Tier 1: the top journals and the flagship working-paper series
  S('aer', 'American Economic Review', '', 'https://www.aeaweb.org/journals/aer', 'https://pubs.aeaweb.org/action/showFeed?type=etoc&feed=rss&jc=aer', 'journal', 1, [], 'Q1740221'),
  S('qje', 'The Quarterly Journal of Economics', 'Advance articles', 'https://academic.oup.com/qje', 'https://academic.oup.com/rss/site_5504/advanceAccess_3365.xml', 'journal', 1, [], 'Q2066504'),
  S('jpe', 'Journal of Political Economy', '', 'https://www.journals.uchicago.edu/toc/jpe/current', 'https://www.journals.uchicago.edu/action/showFeed?type=etoc&feed=rss&jc=jpe', 'journal', 1, [], 'Q783630'),
  S('ecta', 'Econometrica', '', 'https://www.econometricsociety.org/publications/econometrica/browse', 'https://onlinelibrary.wiley.com/feed/14680262/most-recent', 'journal', 1, [], 'Q375835'),
  S('restud', 'The Review of Economic Studies', 'Advance articles', 'https://academic.oup.com/restud', 'https://academic.oup.com/rss/site_5508/advanceAccess_3369.xml', 'journal', 1, [], 'Q980796'),
  S('jf', 'The Journal of Finance', '', 'https://onlinelibrary.wiley.com/journal/15406261', 'https://onlinelibrary.wiley.com/feed/15406261/most-recent', 'journal', 1, ['finance'], 'Q1709844'),
  S('nber', 'NBER', 'Working Papers', 'https://www.nber.org/papers', 'https://back.nber.org/rss/new.xml', 'working', 1, [], 'Q475424'),
  S('cepr-dp', 'CEPR', 'Discussion Papers', 'https://cepr.org/publications/discussion-papers', 'https://cepr.org/rss/discussion-paper', 'working', 1, [], 'Q380062'),

  // ---- Tier 2: other major journals
  S('aej-macro', 'American Economic Journal: Macroeconomics', '', 'https://www.aeaweb.org/journals/mac', 'https://pubs.aeaweb.org/action/showFeed?type=etoc&feed=rss&jc=mac', 'journal', 2, ['macro'], 'Q15816797'),
  S('aej-policy', 'American Economic Journal: Economic Policy', '', 'https://www.aeaweb.org/journals/pol', 'https://pubs.aeaweb.org/action/showFeed?type=etoc&feed=rss&jc=pol', 'journal', 2, ['public'], 'Q15816795'),
  S('jep', 'Journal of Economic Perspectives', '', 'https://www.aeaweb.org/journals/jep', 'https://pubs.aeaweb.org/action/showFeed?type=etoc&feed=rss&jc=jep', 'journal', 2, [], 'Q918465'),
  S('rfs', 'The Review of Financial Studies', 'Advance articles', 'https://academic.oup.com/rfs', 'https://academic.oup.com/rss/site_5511/advanceAccess_3372.xml', 'journal', 2, ['finance'], 'Q612369'),

  // ---- Tier 2: central banks and international institutions (research)
  S('bis-wp', 'BIS', 'Working Papers', 'https://www.bis.org/wpapers/index.htm', 'https://www.bis.org/doclist/wppubls.rss', 'working', 2, [], 'Q309195'),
  S('ecb-wp', 'ECB', 'Working Papers', 'https://www.ecb.europa.eu/pub/research/working-papers/html/index.en.html', 'https://www.ecb.europa.eu/rss/wppub.html', 'working', 2, [], 'Q8901'),
  S('fed-feds', 'Federal Reserve Board', 'FEDS working papers', 'https://www.federalreserve.gov/econres/feds/index.htm', 'https://www.federalreserve.gov/feeds/feds.xml', 'working', 2, [], 'Q5440396'),
  S('ecb-blog', 'ECB', 'The ECB Blog', 'https://www.ecb.europa.eu/press/blog/html/index.en.html', 'https://www.ecb.europa.eu/rss/blog.html', 'research', 2, [], 'Q8901'),
  S('fed-notes', 'Federal Reserve Board', 'FEDS Notes', 'https://www.federalreserve.gov/econres/notes/feds-notes/default.htm', 'https://www.federalreserve.gov/feeds/feds_notes.xml', 'research', 2, [], 'Q5440396'),
  S('liberty', 'Liberty Street Economics', '', 'https://libertystreeteconomics.newyorkfed.org', 'https://libertystreeteconomics.newyorkfed.org/feed/', 'research', 2, [], 'Q115860'),
  S('bankunderground', 'Bank Underground', '', 'https://bankunderground.co.uk', 'https://bankunderground.co.uk/feed/', 'research', 2, [], 'Q183231'),
  S('boe-pubs', 'Bank of England', 'Publications', 'https://www.bankofengland.co.uk/news/publications', 'https://www.bankofengland.co.uk/rss/publications', 'research', 2, [], 'Q183231', { skip: /^Bank of England Weekly Report\b/i }),
  S('stl-ote', 'St. Louis Fed', 'On the Economy', 'https://www.stlouisfed.org/on-the-economy', 'https://www.stlouisfed.org/rss/page-resources/publications/blog-entries', 'research', 2, [], 'Q4383730'),
  S('oecd', 'OECD', 'Ecoscope', 'https://oecdecoscope.blog', 'https://oecdecoscope.blog/feed/', 'research', 2, [], 'Q41550'),
  S('cbo', 'Congressional Budget Office', '', 'https://www.cbo.gov/publications', 'https://www.cbo.gov/publications/all/rss.xml', 'research', 2, ['public'], 'Q1125991', { skip: BILL }),

  // ---- Tier 2: central banks and international institutions (releases, statements and speeches)
  S('fed-press', 'Federal Reserve Board', 'Press releases', 'https://www.federalreserve.gov/newsevents/pressreleases.htm', 'https://www.federalreserve.gov/feeds/press_all.xml', 'official', 2, ['monetary'], 'Q5440396'),
  S('fed-speeches', 'Federal Reserve Board', 'Speeches', 'https://www.federalreserve.gov/newsevents/speeches.htm', 'https://www.federalreserve.gov/feeds/speeches.xml', 'official', 2, ['monetary'], 'Q5440396'),
  S('ecb-press', 'ECB', 'Press releases', 'https://www.ecb.europa.eu/press/pr/html/index.en.html', 'https://www.ecb.europa.eu/rss/press.html', 'official', 2, ['monetary'], 'Q8901'),
  S('boe-news', 'Bank of England', 'News', 'https://www.bankofengland.co.uk/news', 'https://www.bankofengland.co.uk/rss/news', 'official', 2, ['monetary'], 'Q183231'),
  S('boj', 'Bank of Japan', 'What’s new', 'https://www.boj.or.jp/en/', 'https://www.boj.or.jp/en/rss/whatsnew.xml', 'official', 2, ['monetary'], 'Q333101'),
  S('cbi', 'Central Bank of Ireland', 'News & media', 'https://www.centralbank.ie/news-media', 'https://www.centralbank.ie/feeds/news-media-feed', 'official', 2, ['monetary'], 'Q283785', { skip: /Issues Warning on Unauthorised|^(?:Warning|Unauthorised firm)\b/i }),
  S('bis-speeches', 'BIS', 'Central bankers’ speeches', 'https://www.bis.org/cbspeeches/index.htm', 'https://www.bis.org/doclist/cbspeeches.rss', 'official', 2, ['monetary'], 'Q309195', { cap: 120 }),
  S('wto', 'WTO', 'News', 'https://www.wto.org/english/news_e/news_e.htm', 'https://www.wto.org/library/rss/latest_news_e.xml', 'official', 2, ['trade'], 'Q7825'),

  // ---- Tier 3: think tanks and research columns
  S('voxeu', 'VoxEU', 'Columns', 'https://cepr.org/voxeu/columns', 'https://cepr.org/rss/vox-content', 'research', 3, [], 'Q380062'),
  S('brookings', 'Brookings', '', 'https://www.brookings.edu', 'https://www.brookings.edu/feed/?post_type=article', 'research', 3, [], 'Q929154', { strict: true }),
  S('voxdev', 'VoxDev', '', 'https://voxdev.org', 'https://voxdev.org/rss.xml', 'research', 3, ['development'], null, { skip: /^This week in development economics\b/i }),
  S('equitable', 'Equitable Growth', '', 'https://equitablegrowth.org', 'https://equitablegrowth.org/feed/', 'research', 3, ['labour'], 'Q61934195'),
  S('resfound', 'Resolution Foundation', '', 'https://www.resolutionfoundation.org', 'https://www.resolutionfoundation.org/feed/', 'research', 3, ['labour'], 'Q17027769'),
  S('econofact', 'Econofact', '', 'https://econofact.org', 'https://econofact.org/feed', 'research', 3, [], 'Q137361034'),
  S('econbrowser', 'Econbrowser', '', 'https://econbrowser.com', 'https://econbrowser.com/feed', 'research', 3, [], null),

  // ---- Tier 4: journalism and commentary
  S('ps', 'Project Syndicate', '', 'https://www.project-syndicate.org', 'https://www.project-syndicate.org/rss', 'news', 4, [], 'Q1567642', { strict: true, badge: 'Opinion', byline: true }),
  S('economist', 'The Economist', 'Finance & economics', 'https://www.economist.com/finance-and-economics', 'https://www.economist.com/finance-and-economics/rss.xml', 'news', 4, [], 'Q180089'),
  S('ft-economy', 'Financial Times', 'Global economy', 'https://www.ft.com/global-economy', 'https://www.ft.com/global-economy?format=rss', 'news', 4, [], 'Q183399', { skip: FT_SKIP }),
  S('ft-cb', 'Financial Times', 'Central banks', 'https://www.ft.com/central-banks', 'https://www.ft.com/central-banks?format=rss', 'news', 4, ['monetary'], 'Q183399', { skip: FT_SKIP }),
  S('ft-trade', 'Financial Times', 'Global trade', 'https://www.ft.com/global-trade', 'https://www.ft.com/global-trade?format=rss', 'news', 4, ['trade'], 'Q183399', { skip: FT_SKIP }),
  S('ft-energy', 'Financial Times', 'Energy', 'https://www.ft.com/energy', 'https://www.ft.com/energy?format=rss', 'news', 4, ['energy'], 'Q183399', { skip: FT_SKIP }),
  S('bloomberg', 'Bloomberg', 'Economics', 'https://www.bloomberg.com/economics', 'https://feeds.bloomberg.com/economics/news.rss', 'news', 4, [], 'Q14270642'),
  S('wsj', 'The Wall Street Journal', 'Economy', 'https://www.wsj.com/economy', 'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed', 'news', 4, [], 'Q164746'),
  S('nyt', 'The New York Times', 'Economy', 'https://www.nytimes.com/section/business/economy', 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml', 'news', 4, [], 'Q9684'),
  S('guardian', 'The Guardian', 'Economics', 'https://www.theguardian.com/business/economics', 'https://www.theguardian.com/business/economics/rss', 'news', 4, [], 'Q11148'),
  S('bbc', 'BBC News', 'Economy', 'https://www.bbc.co.uk/news/business/economy', 'https://feeds.bbci.co.uk/news/business/economy/rss.xml', 'news', 4, [], 'Q1160945', { skip: BBC_SKIP }),
  S('carbonbrief', 'Carbon Brief', '', 'https://www.carbonbrief.org', 'https://www.carbonbrief.org/feed/', 'news', 4, [], 'Q56276152', { strict: true }),
];

/** A stable id for an outlet (the source filter and #src= links use it). */
export const outletId = name => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

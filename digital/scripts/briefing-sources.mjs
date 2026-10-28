// Digital Briefing feed catalogue: computing and technology research and quality technology news, one entry per
// RSS/Atom feed.
//   kind  'journal' (a peer-reviewed journal's table of contents, or a Nature Portfolio subject feed), 'preprint' (an
//         arXiv category's daily announcement), 'lab' (a research lab's or company's research and engineering blog),
//         'research' (research institutes and measurement labs), 'official' (government agencies, regulators and their
//         advisories) or 'news' (journalism, commentary and advocacy)
//   tier  1 = flagship journals; 2 = other major journals, the major labs and government agencies; 3 = preprints,
//         research institutes, engineering blogs and advocacy groups; 4 = technology journalism and commentary
//   fields  the feed's default fields ([] = general: keywords decide; see classify.mjs)
//   outlet  the publication shown on each item (several feeds can share one, e.g. the arXiv categories)
//   qid  the outlet's Wikidata item (CC0), for the Encyclopaedia (null where Wikidata has none)
//   cap  optional per-feed limit on stored items (default 150)
//   perDay  arXiv: at most this many new submissions from each daily announcement (most authors first; see
//           briefing-feeds.mjs pickDaily); newOnly drops cross-lists and revisions; match keeps only items on topic
//   strict  optional: drop items that match no field (feeds that also carry science, business, culture or other policy)
//   skip / skipUrl / skipCat  optional: titles, addresses and categories that are never stories for this feed
//   needsCat  optional: drop items without a category (OpenAI's uncategorised posts are customer stories)
//   paperCat  optional (labs): categories that mark research posts (papers); the feed's other posts are news
//   dateOnly  optional: the feed stamps a date at noon or midnight, not a time; store it as a date
//   badge  optional: the label on each item instead of the kind's
//   byline  optional: keep authors on a news feed's items (research items keep theirs unless noAuthors)
// Every candidate was fetched before it went in (28 October 2026). Tested and left out:
//   Communications of the ACM (cacm.acm.org answers 403 to feed readers, and the ACM Digital Library has no feed for it),
//   JMLR (its feed dates every paper to 1 January, the start of the volume), TMLR (no feed), the IEEE Xplore tables of
//   contents (TPAMI, TIFS, TSE, JSSC, IEEE Security & Privacy: an issue arrives weeks after its articles went online and
//   carries their early-access dates, so almost nothing falls inside seven days; Proceedings of the IEEE answered 502 and
//   Transactions on Quantum Engineering 404), npj Artificial Intelligence (its feed sends readers to a sign-in page),
//   Patterns (one or two data-science papers a week, mostly biology), BAIR and Google's Online Security Blog (last posts
//   in July and April), Chromium Blog (March), Meta AI, Anthropic, Stanford HAI, Epoch AI, IBM Quantum, Google Quantum AI
//   and Microsoft Quantum (no feed, or 403), Google Threat Intelligence (no feed), Tech Policy Press (no feed), Lawfare,
//   Ofcom and Euractiv (403), the ICO and ENISA (no feed since their sites moved), NIST's cybersecurity feed and CDT's
//   (empty), the NCSC's reports feed (last item May 2025), the UK AI Security Institute (a handful of items a year),
//   CNIL (its English feed carries French items), AI Now (press mentions, not its own work), The Markup (last post
//   15 October), Quanta's computer-science feed (five items a month) and The Register's networks and AI feeds (gone).

export const TIERS = { 1: 'Flagship journal', 2: 'Major journal, lab or agency', 3: 'Preprint, institute, engineering blog or advocacy', 4: 'Technology journalism and commentary' };
export const KINDS = { journal: 'Journal', preprint: 'Preprints', lab: 'Labs & companies', research: 'Research institutes', official: 'Government & advisories', news: 'News & commentary' };
export const DEFAULT_CAP = 150;

const S = (id, outlet, section, url, feed, kind, tier, fields, qid, extra = {}) =>
  ({ id, outlet, name: section ? `${outlet} · ${section}` : outlet, url, feed, kind, tier, fields, qid, ...extra });

// arXiv: one feed per category, new submissions only, a few a day (see pickDaily).
const ARXIV = (code, name, fields, perDay, extra = {}) =>
  S(`arxiv-${code.toLowerCase().replace(/^cs\./, '').replace(/[^a-z]+/g, '')}`, 'arXiv', `${code} · ${name}`, `https://arxiv.org/list/${code}/new`,
    `https://rss.arxiv.org/rss/${code}`, 'preprint', 3, fields, 'Q118398', { perDay, newOnly: true, cap: perDay * 7, ...extra });
// quant-ph is all of quantum physics: keep quantum computing and quantum information.
const QUANTUM_INFO = /qubit|qudit|quantum (?:comput|circuit|algorithm|error|advantage|supremacy|processor|network|internet|key|software|simulat|machine learning|device|hardware|memor|repeater|communication|cryptograph|information|gate|annealing|sensing)|error[- ]correct|fault[- ]toleran|logical qubit|surface code|stabili[sz]er|entangle|\bQKD\b|\bNISQ\b|variational quantum|\bQAOA\b|teleportation|magic state|post-quantum/i;
// Nature Portfolio subject feeds: Scientific Reports is left out (a mega-journal; the flagship journals come through).
const SCI_REP = /\/articles\/s41598-/;
// The ACM Digital Library runs its authors' names together in one field ("Naveed Ul MustafaXipeng Shen"): leave them off.
const ACM = { noAuthors: true };

export const SOURCES = [
  // ---- Tier 1: flagship journals
  S('natmachintell', 'Nature Machine Intelligence', '', 'https://www.nature.com/natmachintell/', 'https://www.nature.com/natmachintell.rss', 'journal', 1, ['ai'], 'Q44062926'),
  S('natelectron', 'Nature Electronics', '', 'https://www.nature.com/natelectron/', 'https://www.nature.com/natelectron.rss', 'journal', 1, ['hardware'], 'Q47149646'),
  S('jacm', 'Journal of the ACM', '', 'https://dl.acm.org/journal/jacm', 'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=jacm', 'journal', 1, ['software'], 'Q1709878', ACM),
  S('prxquantum', 'PRX Quantum', '', 'https://journals.aps.org/prxquantum/', 'https://feeds.aps.org/rss/recent/prxquantum.xml', 'journal', 1, ['quantum'], 'Q105650194'),

  // ---- Tier 2: other major journals
  S('natcomputsci', 'Nature Computational Science', '', 'https://www.nature.com/natcomputsci/', 'https://www.nature.com/natcomputsci.rss', 'journal', 2, ['software'], 'Q130711095'),
  S('npjqi', 'npj Quantum Information', '', 'https://www.nature.com/npjqi/', 'https://www.nature.com/npjqi.rss', 'journal', 2, ['quantum'], 'Q30644766'),
  S('quantum', 'Quantum', '', 'https://quantum-journal.org', 'https://quantum-journal.org/feed/', 'journal', 2, ['quantum'], 'Q50817870'),
  S('nature-cs', 'Nature Portfolio', 'Computer science', 'https://www.nature.com/subjects/computer-science', 'https://www.nature.com/subjects/computer-science.rss', 'journal', 2, [], 'Q180419', { skipUrl: SCI_REP }),
  S('nature-ee', 'Nature Portfolio', 'Electrical & electronic engineering', 'https://www.nature.com/subjects/electrical-and-electronic-engineering', 'https://www.nature.com/subjects/electrical-and-electronic-engineering.rss', 'journal', 2, ['hardware'], 'Q180419', { skipUrl: SCI_REP }),
  S('nature-qi', 'Nature Portfolio', 'Quantum information', 'https://www.nature.com/subjects/quantum-information', 'https://www.nature.com/subjects/quantum-information.rss', 'journal', 2, ['quantum'], 'Q180419', { skipUrl: SCI_REP }),
  S('csur', 'ACM Computing Surveys', '', 'https://dl.acm.org/journal/csur', 'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=csur', 'journal', 2, [], 'Q3295299', ACM),
  S('tops', 'ACM Transactions on Privacy and Security', '', 'https://dl.acm.org/journal/tops', 'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=tops', 'journal', 2, ['security'], 'Q96324450', ACM),
  S('taco', 'ACM Transactions on Architecture and Code Optimization', '', 'https://dl.acm.org/journal/taco', 'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=taco', 'journal', 2, ['hardware'], 'Q15758267', ACM),
  S('tqc', 'ACM Transactions on Quantum Computing', '', 'https://dl.acm.org/journal/tqc', 'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=tqc', 'journal', 2, ['quantum'], 'Q136461382', ACM),
  S('jair', 'Journal of Artificial Intelligence Research', '', 'https://www.jair.org', 'https://www.jair.org/index.php/jair/gateway/plugin/WebFeedGatewayPlugin/rss2', 'journal', 2, ['ai'], 'Q6294801'),

  // ---- Tier 2: the major labs' research blogs
  S('google-research', 'Google Research', 'Blog', 'https://research.google/blog/', 'https://research.google/blog/rss/', 'lab', 2, [], 'Q28943742'),
  S('deepmind', 'Google DeepMind', 'Blog', 'https://deepmind.google/discover/blog/', 'https://deepmind.google/blog/rss.xml', 'lab', 2, ['ai'], 'Q15733006'),
  S('openai', 'OpenAI', 'News', 'https://openai.com/news/', 'https://openai.com/news/rss.xml', 'lab', 2, ['ai'], 'Q21708200',
    { needsCat: true, skipCat: /^(?:startup|ai adoption|applied ai|customer stories?)$/i, paperCat: /^(?:research|publication|safety|engineering|security)$/i }),
  S('msr', 'Microsoft Research', 'Blog', 'https://www.microsoft.com/en-us/research/blog/', 'https://www.microsoft.com/en-us/research/feed/', 'lab', 2, [], 'Q1144725', { skipCat: /podcast|^abstracts$/i }),
  S('apple-ml', 'Apple', 'Machine Learning Research', 'https://machinelearning.apple.com', 'https://machinelearning.apple.com/rss.xml', 'lab', 2, ['ai'], 'Q312'),
  S('ibm-research', 'IBM Research', 'Blog', 'https://research.ibm.com/blog', 'https://research.ibm.com/rss', 'lab', 2, [], 'Q3146518'),

  // ---- Tier 2: government agencies and regulators
  S('cisa-alerts', 'CISA', 'Alerts', 'https://www.cisa.gov/news-events/cybersecurity-advisories', 'https://www.cisa.gov/cybersecurity-advisories/alerts.xml', 'official', 2, ['security'], 'Q5205058',
    { dateOnly: true, badge: 'Advisory', skip: /^CISA (?:Adds|Releases) (?:\w+ )+(?:Known Exploited Vulnerabilit|Industrial Control Systems? Advisor)/i }),
  S('cisa-advisories', 'CISA', 'Cybersecurity advisories', 'https://www.cisa.gov/news-events/cybersecurity-advisories', 'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml', 'official', 2, ['security'], 'Q5205058', { dateOnly: true, badge: 'Advisory' }),
  S('ncsc', 'NCSC', 'National Cyber Security Centre', 'https://www.ncsc.gov.uk', 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml', 'official', 2, ['security'], 'Q23688635', { dateOnly: true }),
  S('nist', 'NIST', 'News', 'https://www.nist.gov/news-events/news', 'https://www.nist.gov/news-events/news/rss.xml', 'official', 2, [], 'Q176691', { dateOnly: true, strict: true }),
  S('edpb', 'European Data Protection Board', 'News', 'https://www.edpb.europa.eu/news/news_en', 'https://www.edpb.europa.eu/feed/news_en', 'official', 2, ['privacy'], 'Q26877724', { dateOnly: true }),
  S('ec-digital', 'European Commission', 'Shaping Europe’s digital future', 'https://digital-strategy.ec.europa.eu/en/news', 'https://digital-strategy.ec.europa.eu/en/rss.xml', 'official', 2, ['policy'], 'Q8880'),
  S('ftc', 'Federal Trade Commission', 'Press releases', 'https://www.ftc.gov/news-events/news/press-releases', 'https://www.ftc.gov/feeds/press-release.xml', 'official', 2, [], 'Q786713', { dateOnly: true, strict: true }),
  S('dsit', 'Department for Science, Innovation and Technology', '', 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology', 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom', 'official', 2, [], 'Q116719150',
    { strict: true, skip: /^(?:Notice|Transparency data|Official Statistics|Accredited official statistics|National Statistics|Statistics|FOI release|Form|Promotional material|Procurement notice):|^Project Gigabit\b|\bcontract award\b|\bworkforce management information\b|\bprivacy notice\b/i }),

  // ---- Tier 3: arXiv (a day's new submissions in each category, the papers with most authors first)
  ARXIV('cs.AI', 'Artificial Intelligence', ['ai'], 5),
  ARXIV('cs.LG', 'Machine Learning', ['ai'], 6),
  ARXIV('cs.CL', 'Computation and Language', ['ai'], 5),
  ARXIV('cs.CR', 'Cryptography and Security', ['security'], 5),
  ARXIV('cs.SE', 'Software Engineering', ['software'], 4),
  ARXIV('cs.DC', 'Distributed, Parallel, and Cluster Computing', ['software'], 4),
  ARXIV('cs.HC', 'Human-Computer Interaction', ['software'], 4),
  ARXIV('cs.NI', 'Networking and Internet Architecture', ['networks'], 4),
  ARXIV('cs.AR', 'Hardware Architecture', ['hardware'], 4),
  ARXIV('cs.CY', 'Computers and Society', ['policy'], 4),
  ARXIV('quant-ph', 'Quantum Physics', ['quantum'], 5, { match: QUANTUM_INFO }),

  // ---- Tier 3: engineering and security research blogs
  S('hf-blog', 'Hugging Face', 'Blog', 'https://huggingface.co/blog', 'https://huggingface.co/blog/feed.xml', 'lab', 3, ['ai'], 'Q108943604'),
  S('meta-eng', 'Meta', 'Engineering at Meta', 'https://engineering.fb.com', 'https://engineering.fb.com/feed/', 'lab', 3, [], 'Q380'),
  S('cloudflare', 'Cloudflare', 'Blog', 'https://blog.cloudflare.com', 'https://blog.cloudflare.com/rss/', 'lab', 3, ['networks'], 'Q4778915'),
  S('project-zero', 'Google Project Zero', '', 'https://projectzero.google', 'https://projectzero.google/feed.xml', 'lab', 3, ['security'], 'Q18859887'),

  // ---- Tier 3: research institutes and measurement labs
  S('citizenlab', 'Citizen Lab', '', 'https://citizenlab.ca', 'https://citizenlab.ca/feed/', 'research', 3, ['security', 'privacy'], 'Q5122568'),
  S('cset', 'CSET', 'Center for Security and Emerging Technology', 'https://cset.georgetown.edu', 'https://cset.georgetown.edu/feed/', 'research', 3, ['policy'], 'Q65052724'),
  S('apnic', 'APNIC Blog', '', 'https://blog.apnic.net', 'https://blog.apnic.net/feed/', 'research', 3, ['networks'], 'Q726801', { skip: /\bCall for (?:Presentations|Papers|Proposals)\b|\bworkshops? (?:help|build)/i }),
  S('ripe-labs', 'RIPE Labs', '', 'https://labs.ripe.net', 'https://labs.ripe.net/feed.xml', 'research', 3, ['networks'], 'Q1504968', { skip: /\bDaily Meeting Blog\b|^Redesigning My Resources\b/i }),

  // ---- Tier 3: advocacy
  S('eff', 'EFF', 'Deeplinks', 'https://www.eff.org/deeplinks', 'https://www.eff.org/rss/updates.xml', 'news', 3, [], 'Q624023', { badge: 'Advocacy', skip: /\bEFFector \d|^(?:Podcast Episode|How to Fix the Internet)\b/i }),
  S('noyb', 'noyb', '', 'https://noyb.eu/en', 'https://noyb.eu/en/rss', 'news', 3, ['privacy'], 'Q47505546', { badge: 'Advocacy', skip: /^Annual Report\b/i }),
  S('accessnow', 'Access Now', '', 'https://www.accessnow.org', 'https://www.accessnow.org/feed/', 'news', 3, ['policy'], 'Q4672520', { badge: 'Advocacy' }),

  // ---- Tier 4: technology journalism and commentary
  S('techreview', 'MIT Technology Review', '', 'https://www.technologyreview.com', 'https://www.technologyreview.com/feed/', 'news', 4, [], 'Q796078', { strict: true, skip: /^The Download\b/i, skipCat: /^the download$/i }),
  S('spectrum', 'IEEE Spectrum', '', 'https://spectrum.ieee.org', 'https://spectrum.ieee.org/feeds/feed.rss', 'news', 4, [], 'Q2509689', { strict: true, skipCat: /^(?:ieee-[\w-]+|careers|type-(?:sponsored|whitepaper|webinar|cover))$/i }),
  S('ars-ai', 'Ars Technica', 'AI', 'https://arstechnica.com/ai/', 'https://arstechnica.com/ai/feed/', 'news', 4, ['ai'], 'Q584152'),
  S('ars-security', 'Ars Technica', 'Security', 'https://arstechnica.com/security/', 'https://arstechnica.com/security/feed/', 'news', 4, ['security'], 'Q584152'),
  S('ars-policy', 'Ars Technica', 'Tech policy', 'https://arstechnica.com/tech-policy/', 'https://arstechnica.com/tech-policy/feed/', 'news', 4, ['policy'], 'Q584152'),
  S('register', 'The Register', '', 'https://www.theregister.com', 'https://www.theregister.com/headlines.atom', 'news', 4, [], 'Q1363733',
    { strict: true, skip: /\bThe Register[’']s\b.*\b(?:dinner|event|webinar|breakfast|roundtable|briefing)\b|^(?:Last call|Join us)\b/i }),
  S('wired-ai', 'WIRED', 'AI', 'https://www.wired.com/tag/ai/', 'https://www.wired.com/feed/tag/ai/latest/rss', 'news', 4, ['ai'], 'Q520154'),
  S('wired-security', 'WIRED', 'Security', 'https://www.wired.com/category/security/', 'https://www.wired.com/feed/category/security/latest/rss', 'news', 4, ['security'], 'Q520154'),
  S('verge-ai', 'The Verge', 'AI', 'https://www.theverge.com/ai-artificial-intelligence', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'news', 4, ['ai'], 'Q2155442'),
  S('verge-policy', 'The Verge', 'Policy', 'https://www.theverge.com/policy', 'https://www.theverge.com/rss/policy/index.xml', 'news', 4, ['policy'], 'Q2155442'),
  S('verge-tech', 'The Verge', 'Tech', 'https://www.theverge.com/tech', 'https://www.theverge.com/rss/tech/index.xml', 'news', 4, [], 'Q2155442', { strict: true, skip: /^(?:Here[’']s where to (?:pre-?order|buy)\b|(?:The )?best\b.*\b(?:deals?|gifts?)\b)/i }),
  S('restofworld', 'Rest of World', '', 'https://restofworld.org', 'https://restofworld.org/feed/latest', 'news', 4, ['policy'], 'Q99674412'),
  S('404media', '404 Media', '', 'https://www.404media.co', 'https://www.404media.co/rss/', 'news', 4, [], 'Q123137716', { strict: true, skipCat: /^behind the blog$/i, skip: /^(?:Podcast|Behind the Blog):/i }),
  S('krebs', 'Krebs on Security', '', 'https://krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', 'news', 4, ['security'], null),
  S('bleeping', 'BleepingComputer', '', 'https://www.bleepingcomputer.com', 'https://www.bleepingcomputer.com/feed/', 'news', 4, [], 'Q4925939', { skip: /^(?:The Week in Ransomware|Deals?:)/i }),
  S('therecord', 'The Record', '', 'https://therecord.media', 'https://therecord.media/feed', 'news', 4, ['security'], null),
  S('schneier', 'Schneier on Security', '', 'https://www.schneier.com', 'https://www.schneier.com/feed/atom/', 'news', 4, ['security'], 'Q368328', { badge: 'Commentary', skip: /^(?:Friday Squid Blogging|Upcoming Speaking Engagements)\b/i }),
  S('quantuminsider', 'The Quantum Insider', '', 'https://thequantuminsider.com', 'https://thequantuminsider.com/feed/', 'news', 4, ['quantum'], null),
  S('eetimes', 'EE Times', '', 'https://www.eetimes.com', 'https://www.eetimes.com/feed/', 'news', 4, ['hardware'], 'Q5322946'),
  S('lightreading', 'Light Reading', '', 'https://www.lightreading.com', 'https://www.lightreading.com/rss.xml', 'news', 4, ['networks'], 'Q6546073', { cap: 80 }),
  S('dcd', 'DatacenterDynamics', '', 'https://www.datacenterdynamics.com', 'https://www.datacenterdynamics.com/en/rss/', 'news', 4, ['hardware'], null, { cap: 80 }),
  S('lwn', 'LWN.net', '', 'https://lwn.net', 'https://lwn.net/headlines/rss', 'news', 4, ['software'], 'Q2067684',
    { skip: /^(?:Security updates for \w+|(?:\w+ )?stable kernels?(?: updates?)?(?: for \w+)?|Kernel prepatch\b.*|The \w+ kernel is out|Kernel release status)$/i }),
  S('ft-tech', 'Financial Times', 'Technology', 'https://www.ft.com/technology', 'https://www.ft.com/technology?format=rss', 'news', 4, [], 'Q183399', { strict: true, skip: /^(?:FirstFT|FT Weekend Fest(?:ival)?)\b/i }),
  S('guardian-tech', 'The Guardian', 'Technology', 'https://www.theguardian.com/uk/technology', 'https://www.theguardian.com/uk/technology/rss', 'news', 4, [], 'Q11148', { strict: true, skip: /^TechScape\b/i }),
  S('bbc-tech', 'BBC News', 'Technology', 'https://www.bbc.co.uk/news/technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', 'news', 4, [], 'Q1160945', { strict: true }),
  S('nyt-tech', 'The New York Times', 'Technology', 'https://www.nytimes.com/section/technology', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 'news', 4, [], 'Q9684', { strict: true }),
  S('bloomberg-tech', 'Bloomberg', 'Technology', 'https://www.bloomberg.com/technology', 'https://feeds.bloomberg.com/technology/news.rss', 'news', 4, [], 'Q14270642', { strict: true, cap: 100 }),
  S('politico-tech', 'POLITICO Europe', 'Technology', 'https://www.politico.eu/section/technology/', 'https://www.politico.eu/section/technology/feed/', 'news', 4, [], 'Q991826', { strict: true }),
];

/** A stable id for an outlet (the source filter and #src= links use it). */
export const outletId = name => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

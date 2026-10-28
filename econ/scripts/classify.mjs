// Economics Briefing classifier: which fields of economics an item belongs to, and whether it is research or news.
//
// Fields. Every feed has default fields (the Journal of Finance → finance, the WTO → trade, a central bank's releases →
// monetary policy); general feeds (NBER, VoxEU, the Economist, the FT's global economy page) have none. A keyword score
// refines the default:
//   score = 3 × distinct terms in the title + 2 × in the feed's section or category + 1 × in the summary.
//   - General feed: every field scoring ≥ 3 and at least 40% of the best score. Nothing → "general" (shown under All
//     only; feeds marked strict drop such items, see briefing-sources.mjs).
//   - Specialist feed: its defaults, plus another field when that one is strongly indicated (≥ 6), or at least as
//     strongly as the defaults themselves (≥ 4), and it is within 60% of the strongest other field.
// Ambiguous phrases are resolved first and blanked out (a "central bank" is monetary policy, not banking; a "labour
// market" is labour, not finance; a "trade-off" is not trade; "trade unions" are labour; the "business climate" is not
// the climate).
//
// Type. 'paper' (research: a journal article, a working paper, or a research column, note or think-tank analysis) or
// 'news' (journalism, commentary, and central banks' and institutions' releases, statements and speeches). Journal
// front and back matter, corrections, errata, retractions, announcements, events and sponsored posts are dropped (null).

export const FIELDS = [
  { id: 'macro', label: 'Macro & growth', short: 'Macro & growth', qid: 'Q39680', aliases: ['growth', 'macroeconomics', 'macro-growth', 'business-cycles'] },
  { id: 'monetary', label: 'Monetary policy & central banks', short: 'Monetary policy', qid: 'Q178476', aliases: ['central-banks', 'monetary-policy', 'central-banking', 'cb', 'rates'] },
  { id: 'trade', label: 'Trade & globalisation', short: 'Trade', qid: 'Q178803', aliases: ['globalisation', 'globalization', 'trade-globalisation', 'international-trade', 'tariffs'] },
  { id: 'labour', label: 'Labour & inequality', short: 'Labour & inequality', qid: 'Q28161', aliases: ['labor', 'inequality', 'labour-inequality', 'labor-inequality', 'jobs', 'work'] },
  { id: 'development', label: 'Development', short: 'Development', qid: 'Q1127188', aliases: ['development-economics', 'dev', 'developing'] },
  { id: 'finance', label: 'Finance & markets', short: 'Finance & markets', qid: 'Q2294553', aliases: ['markets', 'finance-markets', 'financial-markets', 'financial', 'banking'] },
  { id: 'public', label: 'Public finance & policy', short: 'Public finance', qid: 'Q274490', aliases: ['public-finance', 'fiscal', 'fiscal-policy', 'policy', 'tax', 'taxation'] },
  { id: 'energy', label: 'Energy & climate economics', short: 'Energy & climate', qid: 'Q473160', aliases: ['climate', 'energy-climate', 'environment', 'environmental', 'energy-economics'] },
];
export const FIELD_IDS = FIELDS.map(f => f.id);

/** A field id from a hash value or alias ('labor' → 'labour'); null if unknown. */
export function fieldId(v) {
  const k = String(v || '').toLowerCase().trim();
  return FIELDS.find(f => f.id === k || f.aliases.includes(k))?.id || null;
}

// ---- Terms (regular-expression fragments, matched as whole words, case-insensitive) ----------------------------------
// Deliberately left out as too ambiguous on their own: "market(s)" (product and labour markets), "government",
// "reform", "spending", "revenue", "welfare" (welfare effects), "environment" (the rate environment), "development",
// "returns", "options", "race", "strikes", "governors", "hawks", "policymakers" and "China".
const TERMS = {
  macro: [
    'macro\\w*', 'gdp', 'gross domestic product', 'growth', 'growth rates?', 'recessions?', 'recessionary', 'business cycles?', 'output gaps?',
    'potential output', 'output', 'productivity', 'tfp', 'aggregate demand', 'aggregate supply', 'consumption', 'consumer spending',
    'household spending', 'savings?', 'saving rates?', 'inflation\\w*', 'disinflation\\w*', 'deflation\\w*', 'stagflation\\w*', 'cpi', 'pce',
    'consumer prices?', 'price levels?', 'cost of living', 'growth outlook', 'growth forecasts?', 'forecasts?', 'nowcast\\w*', 'economy',
    'economies', 'economic activity', 'slowdowns?', 'soft landing', 'hard landing', 'stagnation', 'secular stagnation', 'shocks?',
    'demand shocks?', 'supply shocks?', 'industrial production', 'manufacturing', 'pmis?', 'purchasing managers', 'retail sales',
    'consumer confidence', 'consumer sentiment', 'phillips curves?', 'dsge', 'new keynesian', 'keynesian', 'multipliers?', 'national accounts',
    'structural change', 'structural reforms?', 'business investment', 'capital stock', 'innovation', 'r&d', 'demograph\\w*',
    'ageing population', 'aging population', 'population growth', 'great depression', 'great moderation', 'downturns?', 'booms?',
    'real wages', 'unemployment rate', 'jobless rate', 'vars?', 'local projections', 'heterogeneous agents?', 'hank', 'economic data',
    'quarterly growth', 'contraction', 'gnp', 'per capita', 'living standards', 'income convergence', 'economic convergence', 'imf',
    'durable goods', 'factory orders',
    'housing starts', 'business activity', 'price rises', 'rising prices', 'food prices', 'shop prices', 'price growth', 'svars?',
  ],
  monetary: [
    'monetary', 'central banks?', 'central bankers?', 'central banking', 'interest rates?', 'policy rates?', 'bank rate', 'base rate',
    'rate (?:cuts?|hikes?|rises?|increases?|decisions?|holds?|path|setting|setters?|outlook)',
    '(?:cut|cuts|cutting|raise[sd]?|raising|hike[sd]?|hiking|hold[s]?|holding|kept|keeps?) (?:interest )?rates?', 'basis points?',
    'federal reserve', 'fed', "fed['’]s", 'fomc', 'federal open market committee', 'powell', 'ecb', "ecb['’]s", 'european central bank',
    'lagarde', 'bank of england', 'boe', 'monetary policy committee', 'mpc', 'bank of japan', 'boj', "boj['’]s", 'bank of canada', 'reserve bank',
    'rba', 'rbnz', 'riksbank', 'norges bank', 'swiss national bank', 'snb', 'bundesbank', 'banque de france', 'pboc', "people['’]s bank of china",
    'inflation targets?', 'inflation targeting', 'inflation expectations', 'price stability', 'forward guidance', 'quantitative easing',
    'quantitative tightening', 'qe', 'qt', 'asset purchases?', 'bond[- ]buying', 'yield curve control', 'money supply', 'monetary aggregates',
    'broad money', 'money creation', 'reserves', 'bank reserves', 'liquidity facilit(?:y|ies)', 'standing facilit(?:y|ies)', 'repo', 'reverse repo', 'overnight rates?',
    'federal funds', 'fed funds', 'sofr', '€str', 'estr', 'cbdcs?', 'central bank digital currenc(?:y|ies)', 'digital euro', 'digital pound',
    'taylor rules?', 'zero lower bound', 'effective lower bound', 'negative rates', 'negative interest', 'lender of last resort', 'deputy governors?',
    'rate-setters?', 'hawkish', 'dovish', 'tightening', 'easing', 'rate cuts?', 'rate hikes?', 'neutral rate', 'natural rate of interest',
    'r-star', 'r\\*', 'core inflation', 'headline inflation', 'inflation', 'disinflation', 'macroprudential', 'banking supervision', 'supervisory',
    'payment systems?', 'banknotes?', 'currency in circulation', 'seigniorage', 'monetary union', 'eurosystem', 'monetary transmission',
    'policy transmission', 'pass-through', 'fomc minutes', 'mpc minutes',
  ],
  trade: [
    'trade', 'trades', 'trading partners?', 'tariffs?', 'trade wars?', 'trade deals?', 'trade agreements?', 'free trade', 'protectionis\\w*',
    'exports?', 'exported', 'exporters?', 'exporting', 'imports?', 'imported', 'importers?', 'importing', 'customs', 'import duties', 'duties',
    'anti-dumping', 'dumping', 'safeguards?', 'wto', 'world trade organization', 'globali[sz]ation', 'deglobali[sz]ation', 'slowbali[sz]ation',
    'geoeconomic\\w*', 'fragmentation', 'supply chains?', 'value chains?', 'offshoring', 'reshoring', 'onshoring', 'nearshoring',
    'friend-?shoring', 'foreign direct investment', 'fdi', 'multinationals?', 'current accounts?', 'trade balances?', 'trade deficits?',
    'trade surplus(?:es)?', 'balance of payments', 'capital flows?', 'capital controls?', 'sanctions?', 'sanctioned', 'export controls?',
    'embargo\\w*', 'shipping', 'freight', 'container ships?', 'suez', 'red sea', 'strait of hormuz', 'panama canal', 'china shock',
    'comparative advantage', 'gravity', 'usmca', 'nafta', 'mercosur', 'brexit', 'single market', 'customs union', 'trade policy',
    'de-?risking', 'decoupling', 'cross-border', 'open economy', 'open economies', 'trade blocs?', 'dollar dominance', 'reserve currency',
    'international monetary system', 'currency dominance', 'de-?dollari[sz]ation', 'tariff revenue', 'reciprocal tariffs?', 'section 232',
    'section 301', 'ieepa', 'chips act', 'rare earths?', 'critical minerals', 'us-china', 'eu-china', 'trade talks', 'trade truce',
    'international trade', 'world trade', 'global trade', 'ustr', 'port fees',
  ],
  labour: [
    'labou?r', 'jobs?', 'employment', 'employed', 'unemploy\\w*', 'jobless\\w*', 'payrolls?', 'nonfarm', 'hiring', 'hires', 'layoffs?',
    'laid off', 'redundanc(?:y|ies)', 'workers?', 'workforce', 'wages?', 'wage growth', 'pay growth', 'paychecks?', 'salar(?:y|ies)',
    'living wage', 'earnings inequality', 'unions?', 'unionized', 'unionised', 'collective bargaining', 'on strike', 'strike action',
    'walkouts?', 'inequalit(?:y|ies)', 'unequal', 'poverty', 'the poor', 'low-income', 'low-wage', 'income distribution', 'the rich',
    'billionaires?', 'social mobility', 'intergenerational', 'upward mobility', 'gender', 'women', "women['’]s", 'female', 'mothers?',
    'motherhood', 'fathers?', 'childcare', 'child care', 'parental leave', 'discrimination', 'racial',
    'black (?:workers|americans|households|families|women|men|students)', 'immigra\\w*', 'migrants?', 'migration', 'refugees?', 'asylum',
    'education', 'schools?', 'students?', 'teachers?', 'college', 'universit(?:y|ies)', 'graduates?', 'human capital', 'skills?', 'training',
    'apprenticeships?', 'automation', 'robots?', 'remote work', 'working from home', 'work from home', 'hybrid work', 'hours worked',
    'working hours', 'participation', 'retire\\w*', 'household income', 'child poverty', 'youth', 'young people', 'gig economy', 'gig workers?',
    'self-employ\\w*', 'occupations?', 'careers?', 'job openings', 'vacanc(?:y|ies)', 'monopsony', 'noncompetes?', 'non-compete', 'ai exposure',
    'exposure to ai', 'segregation', 'marriage', 'middle class', 'working class',
  ],
  development: [
    'low-income countries', 'lower-income countries', 'middle-income countries', 'emerging-market', 'global south', 'poor countries',
    'poorer countries', 'poverty', 'extreme poverty', 'africa\\w*', 'sub-saharan', 'kenya\\w*', 'nigeria\\w*', 'ethiopia\\w*', 'ghana\\w*',
    'uganda\\w*', 'tanzania\\w*', 'rwanda\\w*', 'malawi\\w*', 'zambia\\w*', 'zimbabwe\\w*', 'mozambique', 'senegal\\w*', 'mali', 'niger',
    'burkina faso', 'sierra leone', 'liberia\\w*', 'congo\\w*', 'drc', 'sudan\\w*', 'somalia\\w*', 'madagascar', 'india', "india['’]s", 'indian',
    'bangladesh\\w*', 'pakistan\\w*', 'nepal\\w*', 'sri lanka\\w*', 'myanmar', 'indonesia\\w*', 'philippines', 'filipino', 'vietnam\\w*',
    'cambodia\\w*', 'latin america\\w*', 'colombia\\w*', 'peru\\w*', 'bolivia\\w*', 'ecuador\\w*', 'haiti\\w*', 'guatemala\\w*', 'honduras',
    'el salvador', 'aid', 'foreign aid', 'development aid', 'official development assistance', 'oda', 'usaid',
    'donor (?:countries|funding|governments)', 'aid donors', 'microfinance', 'microcredit', 'microenterprises?', 'cash transfers?',
    'smallholders?', 'agricultur\\w*', 'irrigation', 'food security', 'food insecurity', 'famine', 'hunger', 'malnutrition', 'stunting',
    'informal sector', 'informality', 'informal workers?', 'remittances', 'world bank', 'debt relief', 'debt distress', 'debt restructuring',
    'common framework', 'imf programs?', 'imf programmes?', 'structural transformation', 'industriali[sz]ation', 'mobile money',
    'sustainable development', 'sdgs?', 'villages?', 'urbani[sz]ation', 'slums?', 'state capacity', 'low-capacity', 'fragile states?',
    'fragility', 'development economics', 'economic development', 'development policy', 'development finance', 'multilateral development banks?',
    'mdbs?', 'country platforms', 'concessional', 'land rights', 'clean water', 'sanitation', 'child mortality', 'deworming', 'enumerators?',
    'household surveys?', 'west africa', 'east africa', 'south asia', 'southeast asia',
  ],
  finance: [
    'financ(?:e|es|ial|ially|ing|ier|iers)', 'banks?', 'banking', 'bankers?', 'lend(?:s|ing|er|ers)?', 'loans?', 'credit', 'creditors?',
    'debt', 'debts', 'mortgages?', 'stocks?', 'shares', 'equit(?:y|ies)', 'bonds?', 'treasur(?:y|ies)', 'gilts?', 'bunds?', 'yields?',
    'spreads?', 'asset prices?', 'asset pricing', 'investors?', 'investment funds?', 'hedge funds?', 'private equity', 'private credit',
    'private markets?', 'venture capital', 'fund flows?', 'mutual funds?', 'money market funds?', 'etfs?', 'insurance', 'insurers?',
    'reinsurance', 'risk premi(?:a|um|ums)', 'volatility', 'liquidity', 'leverage', 'derivatives?', 'option-implied', 'options markets?',
    'futures', 'swaps?', 'cds', 'credit default swaps?', 'ipos?', 'mergers?', 'acquisitions?', 'm&a', 'valuations?', 'bubbles?', 'crash(?:es)?',
    'sell-?offs?', 'rall(?:y|ies|ied)', 'wall street', 's&p 500', 'nasdaq', 'dow jones', 'ftse', 'nikkei', 'global markets',
    'market (?:turmoil|selloff|sell-off|rally|volatility|crash|swings?|sentiment|moves?|jitters)',
    'markets (?:rally|rallied|fell|slid|tumbled|rose|surged|slumped)', 'systemic risk', 'bank runs?', 'deposits?', 'depositors?', 'basel',
    'nonbanks?', 'non-banks?', 'shadow banking', 'nbfis?', 'fintech', 'crypto\\w*', 'bitcoin', 'stablecoins?', 'tokeni[sz]\\w*', 'on-chain',
    'blockchain', 'payments (?:industry|firms?|companies|providers?|networks?)', 'digital payments', 'cross-border payments', 'currenc(?:y|ies)',
    'dollar', "dollar['’]s", 'yen', 'sterling', 'the pound', 'yuan', 'renminbi', 'fx', 'forex', 'carry trades?', 'covered interest parity',
    'corporate finance', 'capital structure', 'dividends?', 'buybacks?', 'household finance', 'portfolios?', 'asset managers?',
    'asset management', 'wealth management', 'brokers?', 'brokerage', 'esg', 'sustainable finance', 'default risk', 'sovereign defaults?',
    'defaulted', 'loan defaults?', 'probability[- ]of[- ]default', 'bankruptc(?:y|ies)', 'chapter 11', 'insolvenc\\w*', 'trading', 'traders?',
    'risk-neutral', 'discount rates?', 'stochastic discount factor', 'fund managers?', 'treasuries', 'term premi(?:a|um)', 'borrowers?',
    'borrowing costs?', 'collateral', 'clearing', 'ccps?', 'securities', 'securiti[sz]ation', 'ratings agenc(?:y|ies)', 'credit ratings?',
    'investment banks?', 'jpmorgan', 'goldman sachs', 'blackrock', 'gold', 'safe havens?', 'safe-haven', 'banking union', 'deposit insurance',
    'intermediat\\w*', 'fire sales?', 'covenants?', 'asset returns', 'stock returns', 'factor models?', 'insuring', 'sharpe ratios?',
    'going public', 'goes public', 'stock market listing', 'flotation',
  ],
  public: [
    'fiscal', 'budgets?', 'budgetary', 'deficits?', 'debt ceiling', 'public spending', 'government spending', 'public expenditure', 'spending cuts?',
    'austerity', 'stimulus', 'tax', 'taxes', 'taxed', 'taxation', 'taxing', 'taxpayers?', 'income tax', 'corporate tax', 'wealth tax\\w*',
    'property tax\\w*', 'vat', 'tax credits?', 'tax cuts?', 'tax evasion', 'tax avoidance', 'tax havens?', 'irs', 'hmrc', 'tax revenues?',
    'government revenues?', 'public revenues?', 'subsid(?:y|ies|ise[sd]?|ize[sd]?|ising|izing)', 'fiscal transfers?', 'transfer payments',
    'government transfers', 'social security', 'medicare', 'medicaid', 'welfare state', 'welfare reform', 'welfare benefits', 'welfare spending',
    'welfare programs?', 'benefits system', 'pensions?', 'state pension', 'pension reform', 'universal basic income', 'basic income',
    'public investment', 'infrastructure', 'public services?', 'nhs', 'regulation', 'regulations', 'regulators?', 'regulatory', 'deregulation',
    'antitrust', 'competition authorit(?:y|ies)', 'monopol(?:y|ies|ist\\w*)', 'industrial polic(?:y|ies)', 'state aid', 'procurement',
    'privati[sz]ation', 'nationali[sz]ation', 'state-owned', 'public sector', 'government shutdown', 'federal government', 'congressional budget',
    'cbo', 'obr', 'office for budget responsibility', 'chancellor of the exchequer', 'treasury secretary', 'autumn budget', 'spending review',
    'stability and growth pact', 'debt sustainability', 'housing policy', 'rent control', 'zoning', 'planning reform', 'shutdown',
    'appropriations', 'entitlements?', 'public policy', 'policy reform', 'policymaking', 'tax reform', 'reconciliation bill', 'tax policy',
    'tax code', 'tax system', 'tax rates?', 'marginal tax', 'progressive tax\\w*', 'tax base', 'public goods?', 'local governments?', 'municipal',
    'states? and local', 'public employees?', 'civil servants?', 'outlays', 'receipts', 'income support', 'food stamps', 'snap benefits',
    'tariff revenue', 'insurance programs?', 'legislation', 'government debt', 'public debt', 'government borrowing', 'public borrowing',
    'borrowing figures',
  ],
  energy: [
    'energy', 'oil', 'crude', 'brent', 'wti', 'opec\\+?', 'natural gas', 'gas prices?', 'gas', 'lng', 'electricity', 'power prices?',
    'power grids?', 'power sector', 'power markets?', 'power generation', 'power demand', 'power plants?', 'grids?', 'renewables?',
    'renewable energy', 'solar', 'wind power', 'wind farms?', 'wind energy', 'wind turbines?', 'offshore wind', 'onshore wind', 'nuclear power',
    'nuclear energy', 'nuclear plants?', 'nuclear reactors?', 'small modular reactors?', 'coal', 'fossil fuels?', 'petrol', 'gasoline', 'diesel',
    'fuels?', 'refiner(?:y|ies)', 'pipelines?', 'carbon', 'carbon prices?', 'carbon pricing', 'carbon tax\\w*', 'carbon markets?', 'carbon credits?',
    'carbon capture', 'carbon border', 'cbam', 'emissions?', 'emissions trading', 'ets', 'greenhouse gas\\w*', 'net zero', 'net-zero',
    'decarboni[sz]\\w*', 'climate', 'climate change', 'climate policy', 'climate risks?', 'climate finance', 'global warming', 'green transition',
    'green investment', 'green bonds?', 'green finance', 'green industrial', 'energy transition', 'clean energy', 'clean tech\\w*',
    'electric vehicles?', 'evs?', 'batter(?:y|ies)', 'lithium', 'heat ?waves?', 'floods?', 'flooding', 'droughts?', 'hurricanes?', 'wildfires?',
    'natural disasters?', 'extreme weather', 'environmental', 'pollution', 'air quality', 'biodiversity', 'deforestation', 'cop ?\\d\\d',
    'paris agreement', 'ipcc', 'hydrogen', 'heat pumps?', 'energy bills', 'energy prices?', 'energy security', 'energy crisis', 'energy shocks?',
    'utility bills?', 'hydrocarbons?', 'iea', 'eia', 'oil prices?', 'oil shocks?', 'oilfields?', 'drilling', 'shale', 'fracking', 'commodit(?:y|ies)',
    'flood insurance', 'nature', 'sustainable energy', 'environmental sustainability', 'esg', 'transition risks?', 'stranded assets', 'methane', 'co2',
  ],
};

// Phrases settled before the term lists, then blanked out: [pattern, weights].
const PHRASES = [
  ['trade[- ]offs?|trading off|trade off', {}],
  ['trade unions?|trades unions?|trades union congress', { labour: 1 }],
  ['labou?r markets?|job markets?|jobs markets?|labou?r force(?: participation)?|labou?r supply|labou?r demand|labou?r share', { labour: 1 }],
  ['central banks?|central bankers?|central banking|central bank of \\w+|national bank of \\w+|reserve bank(?: of \\w+)?|federal reserve(?: bank)?(?: of [a-z. ]+)?|bank of (?:england|japan|canada|korea|israel|italy|spain|france|finland|thailand|greece|portugal|mexico|ghana|uganda|zambia)|banque de france|banca d.italia|bundesbank|people.s bank of china|swiss national bank|norges bank|sveriges riksbank', { monetary: 1 }],
  ['world bank(?: group)?|international development association|african development bank|asian development bank|inter-american development bank', { development: 1 }],
  ['international monetary fund', { macro: 1 }],
  ['research and development', { macro: 1 }],
  ['(?:software|product|property|real estate|business|career|professional|skills?|model|drug) development', {}],
  ['interest rates?|policy rates?|deposit rates?|lending rates?|mortgage rates?|bank rate', { monetary: 1 }],
  ['exchange rates?|currency markets?|foreign exchange', { finance: 1 }],
  ['emerging[- ]markets?|emerging[- ]market economies|emerging economies|developing economies|developing countries|developing world', { development: 1 }],
  ['public finances?|public debt|government debt|national debt|fiscal policy|fiscal policies|fiscal space|fiscal rules?', { public: 1 }],
  ['sovereign debt|sovereign bonds?|government bonds?', { public: 1, finance: 1 }],
  ['financial (?:stability|system|sector|markets?|conditions|crisis|crises|regulation|regulators?|institutions|services|accounts|risks?)', { finance: 1 }],
  ['financial inclusion|access to finance', { development: 1, finance: 1 }],
  ['housing (?:markets?|prices?|costs?|affordability|supply|crisis|shortages?)|house prices?|home prices?|rents', { macro: 1, finance: 1 }],
  ['pension funds?', { finance: 1 }],
  ['unemployment (?:insurance|benefits?)', { labour: 1, public: 1 }],
  ['minimum wages?', { labour: 1 }],
  ['wealth (?:inequality|gaps?|distribution)|income (?:inequality|distribution|gaps?|shares?)|top (?:incomes?|earners)', { labour: 1 }],
  ['wealth tax\\w*|taxing top wealth|top wealth', { public: 1, labour: 1 }],
  ['tax credits?|child tax credit|earned income tax credit|universal credit|health insurance|social insurance|national insurance', { public: 1 }],
  ['state aid', { public: 1 }],
  ['climate (?:change|policy|policies|risks?|finance|transition|targets?|action|damages?)|global warming', { energy: 1 }],
  ['(?:business|political|investment|economic|policy) climate|climate of (?:fear|uncertainty)', {}],
  ['carbon (?:tax\\w*|prices?|pricing|markets?|border|emissions|credits?|capture|budget)', { energy: 1 }],
  ['energy (?:prices?|bills|security|crisis|transition|shocks?|markets?|policy|costs?)', { energy: 1 }],
  ['oil (?:prices?|shocks?|supply|demand|markets?|discoveries|production|exports?)', { energy: 1 }],
  ['supply chains?|value chains?', { trade: 1 }],
  ['industrial polic(?:y|ies)', { public: 1, trade: 1 }],
  ['euro area|eurozone|euro-area', { macro: 1 }],
  ['the economy|economic growth|economic outlook|world economy|global economy|world economic outlook', { macro: 1 }],
  ['(?:stock|bond|financial|capital|equity|credit|money|debt|treasury|mortgage) markets?', { finance: 1 }],
  ['machine learning|artificial intelligence|generative ai|large language models?|llms?|chatgpt', {}],
  ['trading partners?|trading blocs?|trading system|trade policy|trade war|trade deals?', { trade: 1 }],
  ['market power|market concentration|competition policy', { public: 1 }],
  ['health care|healthcare|social care|social security|social protection|safety nets?', { public: 1 }],
  ['cash transfers?', { development: 1 }],
  ['crop yields?|agricultural yields?|yields? gaps?', { development: 1 }],
  ['balance sheets?', { finance: 1 }],
  ['natural rate|neutral rate|r-star', { monetary: 1, macro: 1 }],
  ['inflation (?:targets?|targeting|expectations)|price stability', { monetary: 1 }],
  ['monetary policy', { monetary: 1 }],
  ['banking supervision|bank supervision|macroprudential|bank capital|capital requirements?|stress tests?', { finance: 1, monetary: 1 }],
  ['data centres?|data centers?', { energy: 1 }],
  ['real estate|commercial property', { finance: 1 }],
  ['great recession|global financial crisis|financial crisis', { macro: 1, finance: 1 }],
  ['labou?r productivity', { macro: 1, labour: 1 }],
  ['gender (?:gaps?|pay gaps?|equality|norms)|pay gaps?', { labour: 1 }],
  ['fed up|well[- ]fed', {}],
  ['nature of|in nature|by nature', {}],
];

// "Labour" and "Labor" as parties (the British and Australian governments), not the labour market: matched without
// regard to case, kept only where the word itself is capitalised. A bare "… and Labour" at the end of a headline is the
// British party only ("Capital and Labor" in an American paper's title stays labour).
const PARTY = /\b(?:(?:UK|British|Scottish|Welsh|New|Australian|Albanese(?:['’]s)?) Labou?r|Labou?r(?:['’]s| (?:party|government|mps?|ministers?|leader(?:ship)?|chancellor|backbench\w*|conference|manifesto|councils?|voters|figures|day|could|would|will|has|is|must|should|plans?|wants?|needs?|faces?|was|had|did|says?|said|won|wins|lost))|(?:and|for|under|against|with) Labour(?=\s*$|\s*[,.;:!?|]))\b/gi;
const WORD = (alts, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags);
const PHRASE_RES = PHRASES.map(([p, w]) => [WORD(p), w]);
const TERM_RES = Object.fromEntries(Object.entries(TERMS).map(([f, list]) => [f, WORD(list.join('|'))]));
const FIELD_WEIGHT = { title: 3, section: 2, summary: 1 };

/** Keyword scores per field for an item's title, section (feed category) and summary. */
export function scoreFields({ title = '', section = '', summary = '' }) {
  const score = Object.fromEntries(FIELD_IDS.map(f => [f, 0]));
  for (const [part, w] of Object.entries(FIELD_WEIGHT)) {
    // Hyphen variants (U+2010–2015, minus sign) read as a plain hyphen, so "AI‐exposed" matches "ai-exposed".
    let text = ` ${String({ title, section, summary }[part] || '').normalize('NFC').replace(/[‐-―−]/g, '-')} `;
    text = text.replace(PARTY, m => (/Labou?r/.test(m) ? ' · ' : m));
    for (const [re, weights] of PHRASE_RES) {
      text = text.replace(re, () => { for (const [f, x] of Object.entries(weights)) score[f] += x * w; return ' · '; });
    }
    for (const f of FIELD_IDS) {
      const seen = new Set();
      for (const m of text.matchAll(TERM_RES[f])) seen.add(m[0].toLowerCase().replace(/[’']s$/, '').replace(/(?:es|s)$/, ''));
      score[f] += seen.size * w;
    }
  }
  return score;
}

/**
 * Fields for an item: its feed's defaults refined by keywords. Returns ids in FIELDS order; [] = general.
 * @param {{title?: string, section?: string, summary?: string}} item
 * @param {string[]} defaults the feed's default fields ([] for a general feed)
 */
export function classify(item, defaults = []) {
  const s = scoreFields(item);
  const out = new Set(defaults.filter(f => FIELD_IDS.includes(f)));
  const best = Math.max(...Object.values(s));
  if (!out.size) {
    for (const f of FIELD_IDS) if (s[f] >= 3 && s[f] >= 0.4 * best) out.add(f);
  } else {
    const own = Math.max(...[...out].map(f => s[f]));
    const others = FIELD_IDS.filter(f => !out.has(f)), bestOther = Math.max(0, ...others.map(f => s[f]));
    for (const f of others) if ((s[f] >= 6 || (s[f] >= 4 && s[f] >= own)) && s[f] >= 0.6 * bestOther) out.add(f);
  }
  return FIELD_IDS.filter(f => out.has(f));
}

// ---- Type ------------------------------------------------------------------------------------------------------------
const DROP_TITLE = /^(?:author correction|publisher correction|correction(?: to)?|corrigendum|erratum|errata|retraction(?: note)?|retracted|expression of concern|addendum|withdrawal|notice of retraction|issue information|cover picture|front cover|back cover|inside (?:front |back )?cover|front ?matter|back ?matter|frontmatter|backmatter|editorial board|masthead|table of contents|forthcoming (?:papers|articles)|call for (?:papers|proposals|nominations)|report of the (?:editor|treasurer|secretary|executive committee)|minutes of the annual (?:general |business )?meeting|in memoriam|obituary|list of referees|acknowledg(?:e)?ments? to referees)\b/i;
const DROP_GENRE = /^(?:corrections?|errat\w*|corrigend\w*|retraction\w*|expression of concern|addend\w*|issue information|covers?|cover pictures?|front matter|back matter|miscellaneous (?:prelims|back matter|front matter)|prelims|masthead|announcements?|sponsored|partner content|advertorial|webinars?|events?|podcasts?|videos?)$/i;
const NEWS_GENRE = /^(?:news|editorials?|comments?|commentary|book reviews?|reviews? of books|letters? to the editor|obituar(?:y|ies)|interviews?|opinion|op-eds?)$/i;
const PAPER_GENRE = /^(?:original |research )?(?:articles?|papers?)$|^original articles?$/i;
// Bare site pages and event-programme entries some feeds push out with the stories.
const DROP_PAGE = /^(?:announcements?|american finance association|publications|resources|events|calendar|newsletters?|archives?|contact(?: us)?|about(?: us)?|lunch|coffee break|registration|welcome(?: remarks)?)$/i;

// Translations some feeds carry next to the English original (VoxEU republishes columns in French and Spanish): function
// words of other languages, counted against English ones.
const FOREIGN = /(?<!\p{L})(?:les|des|du|une|est|sont|pour|avec|dans|sur|aux|qui|que|los|las|del|una|por|para|con|sus|der|und|mit|für|ist|gli|della|delle|che|não|com|uma|dos)(?!\p{L})/giu;
const ENGLISH = /(?<!\p{L})(?:the|of|and|to|in|for|is|are|on|with|how|what|why|from|by|an?|as|at|can|does|do|its|this|that|more|than|will|new|after|over)(?!\p{L})/giu;
/** A title in another language (two or more of its function words and few English ones). */
export function isForeign(title) {
  const t = String(title || ''), f = (t.match(FOREIGN) || []).length, e = (t.match(ENGLISH) || []).length;
  return f >= 2 && f > 2 * e;
}

/**
 * A title that is never a story: journal front and back matter, corrections, announcements, events, sponsored posts,
 * and translations of columns that also appear in English.
 */
export function isDroppedTitle(title) {
  const t = String(title || '').trim();
  return DROP_TITLE.test(t) || DROP_PAGE.test(t) || /^(?:webinar|sponsored|advertisement|partner content|session \d+[a-z]?)\b/i.test(t) || isForeign(t);
}

/** Genre labels that describe the kind of article rather than its subject (used to split feed categories). */
export const isGenre = g => DROP_GENRE.test(g) || NEWS_GENRE.test(g) || PAPER_GENRE.test(g);

/**
 * 'paper' | 'news' | null (drop). `genres` are the feed's own labels for the item (dc:type, prism:section, categories).
 * @param {{title: string, genres?: string[], categories?: string[]}} item
 * @param {{kind: 'journal'|'working'|'research'|'official'|'news'}} source
 */
export function detectType(item, source) {
  const genres = (item.genres || []).map(g => String(g).trim()).filter(Boolean);
  const cats = (item.categories || []).map(c => String(c).trim().toLowerCase());
  if (isDroppedTitle(item.title) || genres.some(g => DROP_GENRE.test(g)) || cats.some(c => /^(?:sponsored|partner content|advertorial|webinars?|events?)$/.test(c))) return null;
  if (source.kind === 'news' || source.kind === 'official') return 'news';
  // A journal's own comment, editorials and book reviews are not research.
  if (source.kind === 'journal' && genres.some(g => NEWS_GENRE.test(g))) return 'news';
  return 'paper';
}

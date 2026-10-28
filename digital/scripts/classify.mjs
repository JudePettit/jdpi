// Digital Briefing classifier: which fields of computing and the digital world an item belongs to, and whether it is
// research or news.
//
// Fields. Every feed has default fields (Nature Electronics → hardware, CISA → cybersecurity, arXiv cs.CL → AI);
// general feeds (ACM Computing Surveys, Google Research, The Register, the newspapers' technology desks) have none.
// A keyword score refines the default:
//   score = 3 × distinct terms in the title + 2 × in the feed's section or category + 1 × in the summary.
//   - General feed: every field scoring ≥ 3 and at least 40% of the best score. Nothing → "general" (shown under All
//     only; feeds marked strict drop such items, see briefing-sources.mjs).
//   - Specialist feed: its defaults, plus another field when that one is strongly indicated (≥ 6), or at least as
//     strongly as the defaults themselves (≥ 4), and it is within 60% of the strongest other field.
// Ambiguous phrases are resolved first and blanked out (a "neural network" is AI, not networking; "social media" is
// society, not the internet; a "policy gradient" is reinforcement learning, not policy; a "surface code" is quantum
// error correction, not software; "quantum dots" are display hardware; "national security" is not cybersecurity).
// Policy terms come in two kinds: those that are about the digital world by themselves (the AI Act, content
// moderation, online safety, copyright, age checks) and generic governance words (regulators, courts, lawsuits,
// ministers, workers, children) that count only when something else in the item is about technology, so "FTC sues a
// retailer" from a general government feed stays out while "FTC sues Amazon" goes in.
// arXiv's category codes in an item's section ("cs.CR · cs.LG") count as section terms for their fields.
//
// Type. 'paper' (research: a journal article, a preprint, a lab's research write-up, an institute's analysis) or
// 'news' (journalism, commentary, advocacy, official releases and advisories, a journal's own news and comment, and
// a lab's company announcements where its feed labels them). Front and back matter, corrections, errata, sponsored
// posts, white papers, webinars, events, podcasts, newsletters and deals are dropped (null).

export const FIELDS = [
  { id: 'ai', label: 'AI & machine learning', short: 'AI & ML', qid: 'Q11660', aliases: ['artificial-intelligence', 'machine-learning', 'ml', 'ai-ml', 'llm', 'llms', 'genai'] },
  { id: 'software', label: 'Software & computing', short: 'Software', qid: 'Q179310', aliases: ['computing', 'software-computing', 'programming', 'cloud', 'open-source', 'hci'] },
  { id: 'security', label: 'Cybersecurity', short: 'Security', qid: 'Q3510521', aliases: ['cybersecurity', 'cyber', 'cyber-security', 'infosec'] },
  { id: 'hardware', label: 'Hardware & semiconductors', short: 'Hardware & chips', qid: 'Q3966', aliases: ['semiconductors', 'chips', 'hardware-semiconductors', 'electronics', 'devices'] },
  { id: 'networks', label: 'Internet & networks', short: 'Internet', qid: 'Q75', aliases: ['internet', 'internet-networks', 'networking', 'telecoms', 'telecom', 'telecommunications', 'web'] },
  { id: 'quantum', label: 'Quantum computing', short: 'Quantum', qid: 'Q17995793', aliases: ['quantum-computing', 'qc', 'quantum-information'] },
  { id: 'privacy', label: 'Data & privacy', short: 'Data & privacy', qid: 'Q456632', aliases: ['data', 'data-privacy', 'data-protection', 'surveillance', 'gdpr'] },
  { id: 'policy', label: 'Digital policy & society', short: 'Policy & society', qid: 'Q4115079', aliases: ['digital-policy', 'society', 'policy-society', 'regulation', 'tech-policy'] },
];
export const FIELD_IDS = FIELDS.map(f => f.id);

/** A field id from a hash value or alias ('cybersecurity' → 'security'); null if unknown. */
export function fieldId(v) {
  const k = String(v || '').toLowerCase().trim();
  return FIELDS.find(f => f.id === k || f.aliases.includes(k))?.id || null;
}

// ---- Terms (regular-expression fragments, matched as whole words, case-insensitive) ----------------------------------
// Deliberately left out as too ambiguous on their own: "model(s)", "agent(s)", "attention", "attack(s)", "threat(s)",
// "secure", "leak(s)", "fraud", "domain(s)", "protocol(s)", "throughput", "displays", "tracking", "updates",
// "platform(s)", "data" and "China".
const TERMS = {
  ai: [
    'ai', 'a\\.i\\.', 'ml', 'artificial intelligence', 'machine learning', 'machine-learning', 'deep learning', 'neural', 'llms?', 'slms?', 'large language models?',
    'language models?', 'foundation models?', 'frontier (?:ai|labs?|models?)', 'reasoning models?', 'diffusion models?', 'world models?', 'vision[- ]language',
    'multimodal', 'generative', 'genai', 'gen ai', 'chatbots?', 'chatgpt', 'gpt-?\\d[\\w.]*', 'gpts', 'claude', 'gemini', 'gemma', 'llama', 'mistral', 'deepseek',
    'qwen', 'kimi', 'grok', 'copilot', 'codex', 'sora', 'midjourney', 'stable diffusion', 'openai', "openai['’]s", 'anthropic', "anthropic['’]s", 'deepmind',
    'xai', 'hugging ?face', 'perplexity', 'transformers?', 'reinforcement learning', 'rlhf', 'fine-?tun\\w*', 'pre-?train\\w*', 'post-?train\\w*', 'inference',
    'distillation', 'embeddings?', 'retrieval-augmented', 'rag', 'prompts?', 'prompting', 'hallucinat\\w*', 'ai agents?', 'agentic', 'coding agents?',
    'autonomous agents?', 'multi-agent', 'llm agents?', 'computer vision', 'image recognition', 'object detection', 'image generation', 'video generation',
    'speech recognition', 'text-to-(?:speech|image|video)', 'natural language processing', 'nlp', 'machine translation', 'robots?', 'robotics', 'robotic',
    'humanoids?', 'embodied', 'agi', 'superintelligen\\w*', 'alignment', 'interpretability', 'explainab\\w*', 'benchmarks?', 'datasets?', 'synthetic data',
    'gnns?', 'classifiers?', 'supervised learning', 'unsupervised', 'self-supervised', 'representation learning', 'chain-of-thought', 'in-context learning',
    'tokeni[sz]\\w*', 'ai models?', 'recommendation (?:systems?|algorithms?)', 'recommender systems?', 'automated decision-making', 'model weights',
    'open-weights?', 'open-source models?', 'ai companions?', 'ai slop', 'ai-generated', 'ai-powered', 'machine intelligence', 'retrieval',
    'information retrieval', 'kv[- ]cach\\w*', 'mixture[- ]of[- ]experts', 'moe',
  ],
  software: [
    'software', 'programming', 'programmers?', 'programming languages?', 'code', 'coding', 'codebases?', 'source code', 'developers?', 'devs', 'open[- ]source',
    'linux', 'kernels?', 'windows', 'macos', 'ios', 'ipados', 'android', 'chromeos', 'operating systems?', 'compilers?', 'compil(?:e|ed|es|ing|ation)', 'rust',
    'python', 'javascript', 'typescript', 'java', 'c\\+\\+', 'golang', 'kotlin', 'webassembly', 'wasm', 'cloud', 'cloud computing', 'aws', 'azure',
    'google cloud', 'kubernetes', 'containers?', 'docker', 'serverless', 'databases?', 'sql', 'postgres\\w*', 'apps?', 'app stores?', 'browsers?', 'chrome',
    'chromium', 'firefox', 'safari', 'github', 'gitlab', 'git', 'devops', 'apis?', 'sdks?', 'algorithms?', 'computational complexity', 'np-hard', 'p vs\\.? np',
    'theorem provers?', 'formal verification', 'formal methods', 'program synthesis', 'runtimes?', 'concurrency', 'distributed systems?', 'distributed computing',
    'parallel computing', 'microservices', 'software engineering', 'bugs?', 'debugg\\w*', 'refactor\\w*', 'technical debt', 'software updates?', 'saas',
    'enterprise software', 'microsoft', "microsoft['’]s", 'oracle', 'salesforce', 'adobe', 'user interfaces?', 'ui', 'ux', 'usability',
    'human-computer interaction', 'hci', 'virtual reality', 'vr', 'augmented reality', 'mixed reality', 'xr', 'video games?', 'game engines?',
    'visuali[sz]ations?', 'spreadsheets?', 'computing', 'computer science', 'computer scientists?', 'computers?', 'cuda', 'smart contracts?', 'graph algorithms?',
    'combinatorial optimi[sz]ation', 'approximation algorithms?', 'data structures?', 'cryptocurrenc(?:y|ies)', 'blockchains?', 'ledgers?',
  ],
  security: [
    'security', 'insecure', 'cyber\\w*', 'hack(?:s|ed|ers?|ing)?', 'security breach(?:es)?', 'breached (?:by hackers|systems?|networks?|servers?|accounts?)', 'ransomware', 'malware', 'spyware', 'stalkerware', 'adware', 'phishing',
    'smishing', 'vishing', 'scams?', 'scammers?', 'vulnerabilit(?:y|ies)', 'cves?', 'cve-\\d{4}-\\d+', 'zero-?days?', '0-?days?', 'exploits?', 'exploited',
    'exploiting', 'patch(?:es|ed|ing)?', 'botnets?', 'ddos', 'denial[- ]of[- ]service', 'apts?', 'threat actors?', 'threat intelligence', 'nation-state',
    'state-sponsored', 'espionage', 'infostealers?', 'stealers?', 'trojans?', 'backdoors?', 'rootkits?', 'worms?', 'wipers?', 'keyloggers?', 'credentials?',
    'passwords?', 'passkeys?', 'mfa', 'multi-factor', 'two-factor', '2fa', 'authenticat\\w*', 'encryption', 'encrypted', 'decrypt\\w*', 'cryptograph\\w*',
    'ciphers?', 'tls', 'ssl', 'firewalls?', 'vpns?', 'intrusions?', 'incident response', 'cisa', 'ncsc', 'certs?', 'pen(?:etration)? test\\w*', 'red team\\w*',
    'fuzz\\w*', 'sandbox\\w*', 'side-channels?', 'spectre', 'meltdown', 'rowhammer', 'adversarial', 'poison(?:ing|ed)', 'attackers?', 'extortion', 'doxx\\w*',
    'sim[- ]swap\\w*', 'ransom', 'lazarus', '\\w+ typhoon', 'shinyhunters', 'scattered spider', 'lockbit', 'privilege escalation', 'remote code execution', 'rce',
    'xss', 'sql injection', 'antivirus', 'edr', 'siem', 'zero trust', 'tor', 'kev', 'known exploited', 'threat hunting', 'flaws?', 'misconfigur\\w*',
  ],
  hardware: [
    'hardware', 'chips?', 'chipmakers?', 'chipmaking', 'chipsets?', 'semiconductors?', 'silicon', 'wafers?', 'fabs?', 'foundr(?:y|ies)', 'tsmc', "tsmc['’]s",
    'intel', "intel['’]s", 'amd', "amd['’]s", 'nvidia', "nvidia['’]s", 'qualcomm', 'broadcom', 'mediatek', 'samsung electronics', 'sk hynix', 'micron', 'asml',
    'smic', 'arm holdings', 'processors?', 'cpus?', 'gpus?', 'tpus?', 'npus?', 'accelerators?', 'asics?', 'fpgas?', 'risc-v', 'x86', 'transistors?',
    'nanomet(?:re|er)s?', '\\d+ ?nm', 'process nodes?', 'lithography', 'euv', 'advanced packaging', 'chiplets?', 'memory chips?', 'dram', 'hbm\\d*e?', 'nand',
    'flash memory', 'ssds?', 'hard drives?', 'hdds?', 'storage', 'servers?', 'liquid cooling', 'electronics', 'circuits?', 'analog(?:ue)? (?:chips?|circuits?|computing|electronics|design|in-memory)', 'photonic\\w*',
    'neuromorphic', 'sensors?', 'oled', 'micro-?leds?', 'leds', 'led (?:displays?|lighting|screens?|chips?)', 'batter(?:y|ies)', 'smartphones?', 'phones?', 'iphones?', 'ipads?', 'pixel \\d+\\w*',
    'galaxy s\\d+\\w*', 'laptops?', 'pcs?', 'macbooks?', 'mac minis?', 'imacs?', 'macs?', 'tablets?', 'wearables?', 'smartwatch\\w*', 'smart glasses', 'headsets?',
    'vision pro', 'consoles?', 'devices?', 'gadgets?', 'drones?', 'motherboards?', 'ram', 'firmware', 'raspberry pi', 'arduino', 'microcontrollers?', 'mcus?',
    'systems?-on-(?:a-)?chips?', 'modems?', 'wafer-scale', 'cerebras', 'groq', 'tenstorrent', 'm\\d (?:pro|max|ultra)', 'snapdragon', 'ryzen', 'epyc',
    'xeon', 'blackwell', 'h100s?', 'h200s?', 'b200s?', 'gb200s?', 'gb300s?', 'mi\\d{3}x?', 'power electronics', 'spintronic\\w*', 'memristors?',
    'ferroelectric\\w*', '2d materials?', 'graphene', 'superconduct\\w*', 'interconnects?', 'optical interconnects?', 'electronic devices?', 'printed circuit boards?',
    'pcbs?', 'eda', 'chip design', 'tape-?outs?', '(?:chip|wafer) yields?',
  ],
  networks: [
    'internet', "internet['’]s", 'broadband', 'fib(?:re|er)', 'full[- ]fib(?:re|er)', 'fttp', 'ftth', '2g', '3g', '4g', '5g', '6g', 'lte', 'cellular', 'telecoms?',
    'telecommunications?', 'telcos?', 'carriers?', 'network operators?', 'isps?', 'internet service providers?', 'wi-?fi', 'bluetooth', 'satellites?', 'starlink',
    'kuiper', 'subsea cables?', 'undersea cables?', 'submarine cables?', 'cables?', 'dns', 'bgp', 'routing', 'routers?', 'ip address\\w*', 'ipv[46]',
    'network protocols?', 'internet protocols?', 'quic', 'tcp', 'udp', 'cdns?', 'content delivery networks?', 'latency', 'bandwidth', 'packets?', 'networks?',
    'networking', 'networked', 'outages?', 'web', 'websites?', 'web pages?', 'world wide web', 'w3c', 'ietf', 'icann', 'domain names?', 'domain registr\\w*',
    'internet exchanges?', 'ixps?', 'peering', 'iot', 'internet of things', 'connectivity', 'gigabit', 'mesh networks?', 'wireless', 'antennas?', 'base stations?',
    'open ran', 'fcc', 'ofcom', 'cloudflare', 'akamai', 'cisco', 'nokia', 'ericsson', 'verizon', 'at&t', 'vodafone', 't-mobile', 'deutsche telekom', 'bt group',
    'openreach', 'email', 'e-mail', 'rpki', 'anycast', 'internet traffic', 'network traffic', 'web traffic', 'ethernet', 'optical networks?', 'roaming', 'esims?',
    'sms', 'telephony', 'voip', 'tor network', 'downtime',
  ],
  quantum: [
    'quantum', 'qubits?', 'qutrits?', 'qudits?', 'logical qubits?', 'fault[- ]tolerant', 'fault[- ]tolerance', 'error[- ]correct\\w*', 'stabili[sz]ers?',
    'entangle\\w*', 'superposition', 'decoherence', 'coherence times?', 'trapped[- ]ions?', 'neutral[- ]atoms?', 'rydberg', 'photonic qubits?', 'spin qubits?',
    'topological qubits?', 'majorana\\w*', 'bosonic', 'cat qubits?', 'nisq', 'variational quantum', 'vqe', 'qaoa', 'shor', "shor['’]s", 'grover', "grover['’]s",
    'qkd', 'quantinuum', 'ionq', 'rigetti', 'd-wave', 'psiquantum', 'pasqal', 'quera', 'iqm', 'xanadu', 'atom computing', 'riverlane', 'alice & bob',
    'oxford ionics', 'infleqtion', 'oqc', 'annealers?', 'teleport\\w*', 'qec', 'magic states?', 'clifford', 'hamiltonian simulation',
  ],
  privacy: [
    'privacy', 'gdpr', 'customer data', 'health data', 'location data', 'biometric\\w*', 'data brokers?', 'data collection', 'data sharing', 'data retention',
    'data governance', 'data access', 'data portability', 'data transfers?', 'data flows?', 'data sovereignty', 'data locali[sz]ation', 'data economy',
    'data markets?', 'open data', 'big data', 'data science', 'data scientists?', 'data analytics', 'surveillance', 'surveil\\w*', 'trackers?',
    'online tracking', 'ad tracking', 'location tracking', 'cookies', 'adtech', 'ad tech', 'targeted (?:ads?|advertising)', 'behaviou?ral advertising',
    'microtargeting', 'consent', 'anonymi[sz]\\w*', 'de-?identif\\w*', 'pseudonymi[sz]\\w*', 'differential privacy', 'privacy-preserving', 'dpas?', 'ico', 'cnil',
    'edpb', 'edps', 'noyb', 'ccpa', 'hipaa', 'coppa', 'spyware', 'stalkerware', 'wiretap\\w*', 'section 702', 'fisa', 'mass surveillance', 'lawful access',
    'licen[cs]e plate readers?', 'alpr', 'flock', 'clearview', 'doxx\\w*', 'scraping', 'scraped', 'web scrap\\w*', 'data subjects?', 'data rights',
    'right to be forgotten', 'data minimi[sz]ation', 'confidential computing', 'homomorphic', 'secure multi-party', 'membership inference', 'unlearning',
  ],
  policy: [
    'tech policy', 'digital policy', 'online safety act', 'content moderation', 'moderators?', 'misinformation', 'disinformation', 'online platforms?',
    'tech platforms?', 'digital rights', 'digital divide', 'digital sovereignty', 'digital economy', 'digital markets', 'digital services', 'digital government',
    'digital public infrastructure', 'digital inclusion', 'digital literacy', 'digital services tax\\w*', 'digital trade', 'censorship', 'censor(?:s|ed|ing)',
    'free speech', 'freedom of expression', 'children online', 'kids online', 'screen time', 'smartphone bans?', 'phone bans?', 'social media bans?',
    'online harms?', 'cyberbullying', 'hate speech', 'algorithmic (?:bias|accountability|discrimination|transparency|management)', '(?:ai|racial|gender|political|social) bias(?:es)?', 'gig (?:economy|workers?)',
    'platform work(?:ers?)?', 'creator economy', 'content creators?', 'influencers?', 'copyright', 'copyrighted', 'intellectual property', 'fair use',
    'licensing deals?', 'e-government', 'govtech', 'smart cit(?:y|ies)', 'accessibility', 'tech workers?', 'tech layoffs', 'future of work',
    'ai (?:jobs|job losses|and jobs|workforce|labou?r|workers)', 'jobs? to ai', 'tech sovereignty', 'tech regulation', 'tech lobby\\w*', 'tech billionaires?',
    'competition law', 'digital competition', 'child safety', 'online child safety', 'csam', 'e-?safety', 'chatbot (?:safety|harms?)', 'teen accounts?',
    'parental controls?', 'digital wellbeing', 'technology and society', 'social impact', 'ethics of (?:ai|technology)', 'responsible ai', 'public interest technology',
  ],
};

// Generic governance words: counted for "Digital policy & society" only when the item is otherwise about technology.
const GOVERNANCE = [
  'regulat(?:e|es|ed|ing|ion|ions|or|ors|ory)', 'deregulat\\w*', 'laws?', 'legislat\\w*', 'lawmakers?', 'bills?', 'bans?', 'banned', 'banning', 'courts?',
  'judges?', 'rulings?', 'ruled', 'lawsuits?', 'sues?', 'sued', 'suing', 'litigation', 'settlements?', 'antitrust', 'competition authorit(?:y|ies)',
  'competition (?:regulators?|watchdogs?|probes?|investigations?|cases?)', 'monopol\\w*', 'fined', 'fines', 'penalt(?:y|ies)', 'government\\w*', 'ministers?',
  'ministry', 'ministries', 'parliament\\w*', 'mps', 'meps?', 'congress\\w*', 'senat\\w*', 'white house', 'trump', "trump['’]s", 'administration', 'starmer',
  'eu', "eu['’]s", 'european union', 'european commission', 'commission', 'brussels', 'whitehall', 'downing street', 'regulators?', 'watchdogs?', 'polic(?:y|ies)',
  'policymakers?', 'elections?', 'electoral', 'voters?', 'voting', 'democra\\w*', 'politic\\w*', 'workers?', 'jobs?', 'employment', 'unemployment', 'layoffs?',
  'unions?', 'labou?r', 'children', 'kids', 'teens?', 'teenagers?', 'minors', 'parents', 'schools?', 'students?', 'education', 'inequalit\\w*', 'human rights',
  'rights', 'citizens?', 'public sector', 'military', 'defen[cs]e', 'pentagon', 'police', 'policing', 'immigration', 'deportation\\w*', 'ice', 'doge',
  'tax(?:es|ation)?', 'tariffs?', 'sanctions?', 'sanctioned', 'trade wars?', 'geopoliti\\w*', 'sovereignty', 'ftc', 'doj', 'department of justice',
  'justice department', 'sec', 'fcc', 'ofcom', 'cma', 'competition and markets authority', 'inquir(?:y|ies)', 'hearings?', 'testimony', 'lobby\\w*',
  'subsid(?:y|ies|ise[sd]?|ize[sd]?|ising|izing)', 'treaty', 'treaties', 'summit', 'united nations', 'oecd', 'nato', 'society', 'societal', 'ethic\\w*',
  'accountability', 'transparency', 'public interest', 'misuse', 'harms?', 'safety', 'protest\\w*', 'activists?', 'journalists?', 'newsrooms?', 'misconduct',
];

// Words that make an item about technology without belonging to one field (companies, platforms, "tech", "digital").
const CONTEXT = [
  'tech', 'technology', 'technologies', 'technological', 'digital', 'online', 'internet', 'web', 'apps?', 'software', 'computers?', 'computing', 'algorithms?',
  'algorithmic', 'platforms?', 'google', "google['’]s", 'alphabet', 'apple', "apple['’]s", 'microsoft', 'amazon', "amazon['’]s", 'meta', "meta['’]s", 'tesla',
  'spacex', 'musk', "musk['’]s", 'zuckerberg', 'altman', 'bezos', 'pichai', 'nadella', 'jensen huang', 'tiktok', 'bytedance', 'alibaba', 'tencent', 'baidu',
  'huawei', 'xiaomi', 'netflix', 'spotify', 'uber', 'airbnb', 'palantir', 'oracle', 'ibm', 'openai', 'anthropic', 'nvidia', 'robots?', 'automation', 'cyber\\w*',
  'smartphones?', 'facebook', 'instagram', 'whatsapp', 'youtube', 'twitter', 'reddit', 'telegram', 'snapchat', 'discord', 'bluesky', 'roblox', 'x\\.com',
  'start-?ups?', 'chatgpt', 'ai', 'chatbots?', 'deepfakes?', 'data centres?', 'data centers?', 'satellites?', 'drones?', 'gaming', 'video games?', 'streaming',
];

// Phrases settled before the term lists, then blanked out: [pattern, weights]. "gov" adds to the governance count and
// "ctx" marks the item as about technology.
const PHRASES = [
  // arXiv category codes (in the section)
  ['cs\\.(?:ai|lg|cl|cv|ma|ne|ir|ro)|stat\\.ml', { ai: 1 }],
  ['cs\\.(?:se|pl|dc|ds|hc|os|pf|ms|gr|fl|lo|cc|dm|ce|sc|gt|cg)', { software: 1 }],
  ['cs\\.cr', { security: 1 }],
  ['cs\\.(?:ar|et)|eess\\.(?:sp|sy)', { hardware: 1 }],
  ['cs\\.ni', { networks: 1 }],
  ['quant-ph', { quantum: 1 }],
  ['cs\\.cy|cs\\.si', { policy: 1 }],
  ['cs\\.db', { privacy: 1 }],
  // AI phrases that would otherwise read as networking, policy or law
  ['(?:graph |deep |recurrent |convolutional |spiking |artificial |physics-informed )?neural (?:networks?|nets?|operators?)', { ai: 1 }],
  ['(?:policy|policies) (?:optimi[sz]ation|gradients?|learning|networks?|iteration|evaluation|improvement|models?|distillation)|(?:learned|optimal|offline|behaviou?r|reference|target|stochastic|greedy) polic(?:y|ies)', { ai: 1 }],
  ['llm-as-an?-judge|llm judges?|judge models?', { ai: 1 }],
  ['scaling laws?', { ai: 1 }],
  ['federated learning', { ai: 1, privacy: 1 }],
  ['facial recognition|face recognition', { ai: 1, privacy: 1 }],
  ['deepfakes?|deep fakes?|nudify\\w*', { ai: 1, policy: 1 }],
  ['prompt injections?|jailbreak\\w*', { ai: 1, security: 1 }],
  ['self-driving|autonomous (?:vehicles?|driving|cars?|trucks?)|robotaxis?|driverless', { ai: 1 }],
  ['ai (?:chips?|accelerators?|hardware|servers?|data cent(?:re|er)s?|infrastructure|supercomputers?|clusters?)', { ai: 1, hardware: 1 }],
  ['vibe cod\\w*|ai cod(?:e|ing) (?:assistants?|tools?|agents?)|coding (?:assistants?|agents?)', { ai: 1, software: 1 }],
  ['ai safety|ai alignment|ai risks?', { ai: 1 }],
  ['ai (?:act|regulation|rules|governance|polic(?:y|ies)|laws?|bills?|safety institute|security institute|treaty|summit|action plan)', { ai: 1, policy: 1 }],
  // Social media and platforms are society, not networking
  ['social (?:media|networks?|networking|platforms?)', { policy: 1, ctx: 1 }],
  ['online (?:safety|harms?|platforms?)', { policy: 1, ctx: 1 }],
  ['internet (?:shutdowns?|freedom|governance|censorship)', { networks: 1, policy: 1 }],
  ['net neutrality', { networks: 1, policy: 1 }],
  ['digital (?:services|markets) act|section 230|dsa', { policy: 1, ctx: 1 }],
  ['export controls?|chips act|chip (?:exports?|bans?|controls?|curbs?)', { hardware: 1, policy: 1 }],
  ['age (?:verification|checks?|assurance)', { privacy: 1, policy: 1 }],
  ['digital (?:ids?|identit(?:y|ies))', { privacy: 1, policy: 1 }],
  ['(?:tv|television|broadcast|news|cable) networks?', {}],
  // Security
  ['(?:energy|food|job|social|financial|economic|border|homeland|water|health|physical|public|road|fire|job|income|tenure) security|security (?:guards?|forces|services|council|guarantees?|clearances?)', { gov: 1 }],
  ['national security', { gov: 1 }],
  ['social engineering', { security: 1 }],
  ['data breach(?:es)?|data leaks?|leaked data', { security: 1, privacy: 1 }],
  ['end-to-end encrypt\\w*|e2ee', { security: 1, privacy: 1 }],
  ['post-quantum(?: (?:cryptography|encryption|algorithms?|standards?|signatures?|migration|transition|readiness))?|pqc|quantum-(?:safe|resistant)(?: (?:cryptography|encryption))?', { security: 1, quantum: 1 }],
  ['supply[- ]chain attacks?|software supply chains?', { security: 1, software: 1 }],
  ['memory safety|memory-safe|patch tuesday|bug bount(?:y|ies)', { security: 1, software: 1 }],
  ['dark ?web|darknet', { security: 1 }],
  ['open[- ]source intelligence|osint', { security: 1 }],
  // Data and privacy
  ['data \\(?use and access\\)? act|data protection act|eu data act|data act|data (?:protection and digital information|use and access) bill', { privacy: 1, policy: 1 }],
  ['privacy (?:polic(?:y|ies)|notices?)', { privacy: 1 }],
  ['data protection(?: authorit(?:y|ies)| regulators?| laws?| board)?|personal data|personal information|user data', { privacy: 1 }],
  ['training data', { ai: 1 }],
  ['consent (?:decrees?|orders?)', { gov: 1 }],
  ['data cent(?:re|er)s?|datacent(?:re|er)s?', { hardware: 1 }],
  ['(?:energy|battery|grid|thermal) storage', {}],
  // Quantum
  ['superconducting (?:qubits?|quantum (?:processors?|computers?|chips?)|processors?)', { quantum: 1 }],
  ['quantum comput(?:ing|ers?|ation)|quantum circuits?', { quantum: 1 }],
  ['quantum (?:dots?|materials?|wells?|tunnell?ing (?:transistors?|devices?))', { hardware: 1 }],
  ['quantum (?:mechanics|mechanical|physics|field theor(?:y|ies)|gravity|chemistry|biology|chromodynamics|cosmology|leap)', {}],
  ['surface codes?|stabili[sz]er codes?|(?:quantum )?error[- ]correcting codes?|q?ldpc codes?|bosonic codes?|colou?r codes?|toric codes?|cat codes?|gkp codes?', { quantum: 1 }],
  // Hardware, computing and networks
  ['high-performance computing|supercomput\\w*|exascale|hpc', { software: 1, hardware: 1 }],
  ['neuromorphic (?:computing|chips?|hardware|processors?)', { hardware: 1, ai: 1 }],
  ['edge computing', { networks: 1 }],
  ['moore[’\']s law', { hardware: 1 }],
  ['voltage regulat\\w*|power regulat\\w*', { hardware: 1 }],
  ['hearing aids?', { hardware: 1 }],
  ['apple silicon', { hardware: 1 }],
  ['silicon valley', { ctx: 1 }],
  ['big tech|tech giants?|tech (?:industry|companies|firms|sector)', { ctx: 1 }],
  ['mobile (?:phones?|devices?|handsets?)', { hardware: 1 }],
  ['mobile (?:networks?|operators?|carriers?|broadband|data|coverage)', { networks: 1 }],
  ['radio spectrum|spectrum (?:auctions?|allocation|licen[cs]\\w*|sharing|bands?)', { networks: 1 }],
  ['ieee spectrum', {}],
  ['worker (?:nodes?|threads?|processes)|service workers?|web workers?|cloudflare workers|workers kv|workers(?= ai)', { software: 1 }],
  ['(?:solid-state|power|electrical|grid|distribution) transformers?', { hardware: 1 }],
  ['(?:information-seeking|search|web|browser|computer-use|research|software|deep research) agents?', { ai: 1 }],
  ['code of (?:conduct|practice)|codes of (?:conduct|practice)', { policy: 1 }],
  ['qr codes?|zip codes?|postcodes?|dress codes?|area codes?|tax codes?', {}],
  ['cloud (?:cover|seeding|forests?)|storm clouds?', {}],
  ['(?:estate|secret|fbi|border|ice|federal|travel|free) agents?|agent orange', {}],
  ['arms race|arm[’\']s length', {}],
  ['power[- ]laws?', {}],
  ['(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|d\\.?c\\.?|federal) circuit|circuit (?:courts?|judges?)', { gov: 1 }],
  ['research and development|r&d', {}],
];

const WORD = (alts, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags);
const PHRASE_RES = PHRASES.map(([p, w]) => [WORD(p), w]);
const TERM_RES = Object.fromEntries(Object.entries(TERMS).map(([f, list]) => [f, WORD(list.join('|'))]));
const GOVERNANCE_RE = WORD(GOVERNANCE.join('|'));
const CONTEXT_RE = WORD(CONTEXT.join('|'), 'iu');
const FIELD_WEIGHT = { title: 3, section: 2, summary: 1 };
const distinct = (text, re) => {
  const seen = new Set();
  for (const m of text.matchAll(re)) seen.add(m[0].toLowerCase().replace(/[’']s$/, '').replace(/(?:es|s)$/, ''));
  return seen.size;
};

/** Keyword scores per field for an item's title, section (feed category) and summary. */
export function scoreFields({ title = '', section = '', summary = '' }) {
  const score = Object.fromEntries(FIELD_IDS.map(f => [f, 0]));
  let governance = 0, context = false;
  for (const [part, w] of Object.entries(FIELD_WEIGHT)) {
    // Hyphen variants (U+2010–2015, minus sign) read as a plain hyphen, so "AI‐generated" matches "ai-generated".
    let text = ` ${String({ title, section, summary }[part] || '').normalize('NFC').replace(/[‐-―−]/g, '-')} `;
    for (const [re, weights] of PHRASE_RES) {
      text = text.replace(re, () => {
        for (const [f, x] of Object.entries(weights)) {
          if (f === 'gov') governance += x * w; else if (f === 'ctx') context = true; else score[f] += x * w;
        }
        return ' · ';
      });
    }
    for (const f of FIELD_IDS) score[f] += distinct(text, TERM_RES[f]) * w;
    governance += distinct(text, GOVERNANCE_RE) * w;
    if (CONTEXT_RE.test(text)) context = true;
  }
  if (context || FIELD_IDS.some(f => score[f] > 0)) score.policy += governance;
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
const DROP_TITLE = /^(?:author correction|publisher correction|correction(?: to)?|corrigendum|erratum|errata|retraction(?: note)?|retracted|expression of concern|addendum|withdrawal|notice of retraction|issue information|cover picture|front cover|back cover|inside (?:front |back )?cover|front ?matter|back ?matter|frontmatter|backmatter|editorial board|masthead|table of contents|publication information|information for authors|forthcoming (?:papers|articles)|call for (?:papers|proposals|nominations|participation)|in memoriam|list of (?:referees|reviewers)|acknowledg(?:e)?ments? to (?:referees|reviewers)|new associate editors?)\b/i;
// Genres and categories that are never stories, for every feed; and for journals, announcements as well.
const DROP_GENRE = /^(?:corrections?|errat\w*|corrigend\w*|retraction\w*|expression of concern|addend\w*|issue information|covers?|cover pictures?|front matter|back matter|miscellaneous (?:prelims|back matter|front matter)|prelims|masthead|sponsored(?: content| post)?|partner content|advertorial|paid post|type-(?:sponsored|whitepaper|webinar)|white ?papers?|whitepapers?|webinars?|events?|podcasts?|newsletters?|deals?)$/i;
const JOURNAL_DROP = /^(?:announcements?)$/i;
const NEWS_GENRE = /^(?:news(?: (?:&|and) views| feature| in brief| focus)?|in depth|in brief|features?|editorials?|perspectives?|books?(?: reviews?)?|book reviews?|letters? to the editor|policy (?:forum|articles?)|research highlights?|highlights?|comments?|commentary|essays?|correspondence|obituar(?:y|ies)|careers?|career feature|meeting reports?|outlook|opinion|viewpoints?|world view|matters arising|reply|interviews?|profiles?|q ?& ?a|news & views)$/i;
const PAPER_GENRE = /^(?:research(?: articles?| letters?| reports?| papers?)?|articles?|reports?|communications?|reviews?|review articles?|original research|original articles?|papers?|technical reports?|full papers?|short papers?|letters? \(research\)|brief communications?|surveys?|methods?)$/i;
// Bare site pages and event-programme entries some feeds push out with the stories.
const DROP_PAGE = /^(?:announcements?|publications|resources|events|calendar|newsletters?|archives?|contact(?: us)?|about(?: us)?|registration|welcome(?: remarks)?)$/i;

// Translations some feeds carry next to the English original: function words of other languages, counted against
// English ones.
const FOREIGN = /(?<!\p{L})(?:les|des|du|une|est|sont|pour|avec|dans|sur|aux|qui|que|los|las|del|una|por|para|con|sus|der|und|mit|für|ist|gli|della|delle|che|não|com|uma|dos)(?!\p{L})/giu;
const ENGLISH = /(?<!\p{L})(?:the|of|and|to|in|for|is|are|on|with|how|what|why|from|by|an?|as|at|can|does|do|its|this|that|more|than|will|new|after|over)(?!\p{L})/giu;
/** A title in another language (two or more of its function words and few English ones). */
export function isForeign(title) {
  const t = String(title || ''), f = (t.match(FOREIGN) || []).length, e = (t.match(ENGLISH) || []).length;
  return f >= 2 && f > 2 * e;
}

/**
 * A title that is never a story: journal front and back matter, corrections, calls for papers, sponsored posts and
 * webinars, and items in another language.
 */
export function isDroppedTitle(title) {
  const t = String(title || '').trim();
  return DROP_TITLE.test(t) || DROP_PAGE.test(t) || /^(?:webinar|sponsored|advertisement|partner content|paid post|deals?:)\b/i.test(t) || isForeign(t);
}

/** Genre labels that describe the kind of article rather than its subject (used to split feed categories). */
export const isGenre = g => DROP_GENRE.test(g) || JOURNAL_DROP.test(g) || NEWS_GENRE.test(g) || PAPER_GENRE.test(g);

/**
 * 'paper' | 'news' | null (drop). `genres` and `categories` are the feed's own labels for the item.
 * @param {{title: string, url?: string, genres?: string[], categories?: string[]}} item
 * @param {{kind: 'journal'|'preprint'|'lab'|'research'|'official'|'news', paperCat?: RegExp}} source
 */
export function detectType(item, source) {
  const labels = [...(item.genres || []), ...(item.categories || [])].map(g => String(g).trim()).filter(Boolean);
  if (isDroppedTitle(item.title) || labels.some(g => DROP_GENRE.test(g))) return null;
  if (source.kind === 'news' || source.kind === 'official') return 'news';
  if (source.kind === 'journal') {
    if (labels.some(g => JOURNAL_DROP.test(g))) return null;
    // Nature's news, comment and editorials have article numbers beginning with d (d41586-…); research begins with s.
    if (/^https?:\/\/(?:www\.)?nature\.com\/articles\/d\d{5}-/i.test(item.url || '')) return 'news';
    if (labels.some(g => NEWS_GENRE.test(g)) && !labels.some(g => PAPER_GENRE.test(g) && !NEWS_GENRE.test(g))) return 'news';
    return 'paper';
  }
  // A lab's feed that labels its posts: research categories are papers, the rest (products, company news) news.
  if (source.paperCat) return labels.some(g => source.paperCat.test(g)) ? 'paper' : 'news';
  return 'paper';
}

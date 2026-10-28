// Scientific Briefing classifier: which natural sciences an item belongs to, and whether it is a research paper or news.
//
// Disciplines. Every feed has default disciplines (Nature Physics → physics); multidisciplinary feeds (Nature, Science,
// PNAS, the general science desks) have none. A keyword score refines the default:
//   score = 3 × distinct terms in the title + 2 × in the feed's section or category + 1 × in the summary.
//   - Multidisciplinary feed: every discipline scoring ≥ 3 and at least 40% of the best score. Nothing → "general"
//     (shown under All only).
//   - Specialist feed: its defaults, plus another discipline when that one is strongly indicated (≥ 6), or at least as
//     strongly as the defaults themselves (≥ 4), and it is within 60% of the strongest other discipline.
// Ambiguous phrases are resolved first and blanked out (a "solar cell" is not astronomy or biology, a "neural network"
// is not neuroscience, a "solar storm" is not weather).
//
// Type. 'paper' (a journal research article, letter, report or review) or 'news' (everything from a science desk, and a
// journal's own news, editorials, perspectives, News & Views, books and careers pieces). Corrections, errata, retraction
// notes, cover pictures, issue information and sponsored posts are dropped (null).

export const DISCIPLINES = [
  { id: 'physics', label: 'Physics', qid: 'Q413', aliases: [] },
  { id: 'chemistry', label: 'Chemistry', qid: 'Q2329', aliases: [] },
  { id: 'biology', label: 'Biology', qid: 'Q420', aliases: ['life', 'life-sciences'] },
  { id: 'earth', label: 'Earth & Environment', qid: 'Q8008', aliases: ['earth-environment', 'environment', 'climate', 'geoscience'] },
  { id: 'space', label: 'Astronomy & Space', qid: 'Q333', aliases: ['astronomy', 'astronomy-space', 'astrophysics'] },
];
export const DISCIPLINE_IDS = DISCIPLINES.map(d => d.id);

/** A discipline id from a hash value or alias ('astronomy' → 'space'); null if unknown. */
export function disciplineId(v) {
  const k = String(v || '').toLowerCase().trim();
  return DISCIPLINES.find(d => d.id === k || d.aliases.includes(k))?.id || null;
}

// ---- Terms (regular-expression fragments, matched as whole words, case-insensitive) ----------------------------------
const TERMS = {
  physics: [
    'physics', 'physicists?', 'quantum', 'qubits?', 'entangle(?:d|ment)', 'photons?', 'photonics?', 'lasers?', 'optics', 'optical',
    'superconduct\\w*', 'semiconduct\\w*', 'graphene', 'magnet(?:s|ic|ism|ically)?', '\\w*ferromagnet\\w*', 'ferroelectric\\w*', 'spintronic\\w*',
    'spins?', 'skyrmions?', 'electrons?', 'electronic', 'phonons?', 'plasmon\\w*', 'excitons?', 'polaritons?', 'magnons?', 'neutrinos?', 'quarks?',
    'gluons?', 'bosons?', 'higgs', 'muons?', 'hadrons?', 'fermions?', 'collider', 'cern', 'lhc', 'atoms?', 'atomic', 'ultracold',
    'thermodynamic\\w*', 'entropy', 'relativity', 'gravit\\w*', 'antimatter', 'positrons?', 'antiprotons?', 'interferomet\\w*',
    'metamaterials?', 'metasurfaces?', 'topological', 'condensed matter', 'superfluid\\w*', 'bose[- –]einstein', 'nuclear physics',
    'nuclear fusion', 'fusion (?:energy|reactors?|power|plasmas?)', 'tokamaks?', 'stellarators?', 'plasma physics', 'atomic clocks?',
    'optomechanic\\w*', 'terahertz', 'attosecond', 'femtosecond', 'ultrafast', 'hall effect', 'majorana', 'dark matter', 'cosmic rays?',
    'acoustic\\w*', 'fluid dynamics', 'turbulen\\w*', 'solitons?', 'synchrotron', 'free[- ]electron lasers?', 'string theory',
    'trapped ions?', 'ion traps?', 'particle accelerators?', 'particle physics', 'hydrodynamic\\w*', 'crystal lattices?',
    'electromagnet\\w*', 'standard model', 'spectroscop\\w*', 'transistors?', 'nanoindentation', 'dislocations?', 'squeezed light',
    'raman', 'vortex', 'vortices', 'wigner crystals?', 'chern', 'insulators?', 'photodetectors?', 'waveguides?', 'microwaves?',
    'nonlinear optics', 'quasiparticles?', 'semimetals?', 'kagome', 'moiré', 'twisted bilayer', 'quantum dots?', 'nuclei', 'isotopes? shifts?',
  ],
  chemistry: [
    'chemistry', 'chemists?', 'chemicals?', 'chemically', 'molecules?', 'molecular', 'cataly\\w*', 'photocataly\\w*',
    'electrocataly\\w*', 'synthes(?:is|es|ize[sd]?|ise[sd]?|izing|ising)', 'polymers?', 'polymeri[sz]\\w*', 'polyesters?', 'solvents?',
    'electrolytes?', 'electrochemi\\w*', 'batter(?:y|ies)', 'anodes?', 'cathodes?', 'lithium', 'sodium[- ]ion', 'oxides?', 'inorganic',
    'organic chemistry', 'organic synthesis', 'metal[- –]organic frameworks?', 'mofs?', 'cofs?', 'covalent organic frameworks?',
    'zeolites?', 'perovskites?', 'crystals?', 'crystalline', 'crystalli[sz]ation', 'spectroscop\\w*', 'enantioselective', 'stereoselective',
    'chiral\\w*', 'hydrogenation', 'oxidation', 'ligands?', 'isotopes?', 'nanoparticles?', 'nanomaterials?', 'nanostructures?',
    'carbon capture', 'ammonia', 'hydrogen', 'reagents?', 'chemical reactions?', 'reactivity', 'compounds?', 'alloys?', 'ceramics?',
    'plastics?', 'microplastics?', 'pfas', 'forever chemicals', 'peptides?', 'biochemi\\w*', 'rare[- ]earths?', 'periodic table',
    'dyes?', 'pigments?', 'boranes?', 'boron', 'carbenes?', 'radicals', 'c[–-]h (?:activation|functionali[sz]ation|bonds?)',
    'cross[- ]coupling', 'click chemistry', 'self[- ]assembl\\w*', 'supramolecular', 'macrocycl\\w*', 'aromatic', 'ionic liquids?', 'redox',
    'water splitting', 'co2 reduction', 'nitrogen fixation', 'metalloenzymes?', 'olefins?', 'alkenes?', 'alkynes?', 'carbonylation',
    'oxoboranes?', 'aryl\\w*', 'enzymatic', 'materials chemistry', 'pharmaceuticals?', 'drug discovery', 'mxenes?', 'hydrogels?',
    'inhibitors?', 'fluorinated', 'electrosynthe\\w*', 'carbyne', 'sodium', 'potassium', 'magnesium', 'titanium', 'vanadium', 'chromium',
    'manganese', 'cobalt', 'nickel', 'copper', 'zinc', 'gallium', 'germanium', 'selenium', 'zirconium', 'niobium', 'molybdenum', 'ruthenium',
    'rhodium', 'palladium', 'iridium', 'platinum', 'osmium', 'tungsten', 'bismuth', 'antimony', 'tellurium', 'iodine', 'bromine',
    'chlorine', 'fluorine', 'sulfur', 'sulphur', 'phosphorus', 'silicon', 'uranium', 'plutonium', 'thorium', 'lanthanides?', 'actinides?',
    'f-block', 'nmr', 'mass spectrometry', 'chromatograph\\w*', 'acids?', 'amines?', 'esters?', 'ketones?', 'alcohols?', 'salts',
  ],
  biology: [
    'biology', 'biologists?', 'biological', 'cells?', 'cellular', 'genes?', 'genetic\\w*', 'genom\\w*', 'dna', 'rna', 'mrna', 'crispr',
    'proteins?', 'enzymes?', 'bacteri\\w*', 'microb\\w*', 'virus(?:es)?', 'viral', 'pathogens?', 'immun\\w*', 'antibod(?:y|ies)',
    'vaccin\\w*', 'neurons?', 'neural', 'brains?', 'neuroscien\\w*', 'species', 'evolutionary', 'natural selection', 'darwin\\w*', 'organisms?', 'ecolog\\w*',
    'ecosystems?', 'biodiversity', 'animals?', 'plants?', 'mice', 'mouse', 'fish(?:es)?', 'birds?', 'insects?', 'mammals?', 'primates?',
    'fossils?', 'dinosaurs?', 'mosquito(?:es)?', 'cancers?', 'tumou?rs?', 'diseases?', 'patients?', 'clinical', 'medical', 'medicine',
    'therap(?:y|ies|eutic)', 'embryo\\w*', 'stem cells?', 'metabol\\w*', 'mitochondri\\w*', 'photosynthe\\w*', 'chromosom\\w*',
    'hormon\\w*', 'physiolog\\w*', 'neanderthals?', 'denisovans?', 'hominins?', 'gut', 'corals?', 'whales?', 'sharks?', 'spiders?',
    'worms?', 'yeast', 'fung(?:i|us|al)', 'sperm', 'pregnan\\w*', 'ageing', 'aging', 'longevity', 'sleep', 'infections?', 'infectious',
    'epidemi\\w*', 'pandemics?', 'malaria', 'tuberculosis', 'hiv', 'influenza', 'dementia', 'alzheimer\\w*', 'parkinson\\w*', 'obesity',
    'diabetes', 'blood', 'organoids?', 'tissues?', 'gene editing', 'transcription\\w*', 'biophysic\\w*', 'biomolecul\\w*', 'zebrafish',
    'drosophila', 'c\\. elegans', 'arabidopsis', 'maize', 'crops?', 'pollinators?', 'bees?', 'frogs?', 'amphibians?', 'reptiles?',
    'lizards?', 'snakes?', 'octopus\\w*', 'squid', 'jellyfish', 'apes?', 'monkeys?', 'chimpanzees?', 'dogs?', 'livestock', 'wildlife',
    'habitats?', 'predators?', 'prey', 'mating', 'offspring', 'larva\\w*', 'metamorphos\\w*', 'symbio\\w*', 'parasit\\w*', 'archaea\\w*',
    'archaeon', 'phages?', 'bacteriophages?', 'inflamm\\w*', 'macrophages?', 'antibiotic\\w*', 'antimicrobial', 'psychedelic\\w*',
    'neurodegenerat\\w*', 'autoimmun\\w*', 'astrocytes?', 'synap\\w*', 'cortex', 'hippocamp\\w*', 'thalam\\w*', 'ferroptosis',
    'apoptosis', 'lineages?', 'phenotyp\\w*', 'genotyp\\w*', 'heredit\\w*', 'mutations?', 'mutant', 'ribosom\\w*', 'kinases?',
    'receptors?', 'nematodes?', 'fruit flies', 'butterfl\\w*', 'beetles?', 'ants', 'trees?', 'flowers?', 'pollen',
    'histones?', 'methylation', 'epigen\\w*', 'virulen\\w*', 'staphylococc\\w*', 'streptococc\\w*', 'mycobacteri\\w*', 'shigella',
    'salmonella', 'e\\. coli', 'ovar\\w*', 'placent\\w*', 'chondr\\w*', 'gpcrs?', 'allosteric', 'kinetochores?', 'telomer\\w*',
    'pyroptosis', 'dendritic', 'myoblasts?', 'muscles?', 'skeletal', 'bones?', 'locusts?', 'bats', 'fauna', 'flora', 'snails?', 'molluscs?',
    'mollusks?', 'clams?', 'oysters?', 'mussels?', 'vultures?', 'songbirds?', 'paleontolog\\w*', 'palaeontolog\\w*', 'proteom\\w*',
    'transcriptom\\w*', 'single[- ]cell', 'signal(?:l)?ing', 'organelles?', 'vesicles?',
    'antigens?', 'lymphocytes?', 't cells?', 'b cells?', 'covid\\w*', 'sars-cov-2', 'dengue', 'zika', 'ebola', 'measles', 'mpox',
    'pneumonia', 'hepatitis', 'stroke', 'heart', 'cardiac', 'liver', 'kidneys?', 'lungs?', 'skin', 'hair', 
    'olfactory', 'gestation\\w*', 'fertility', 'nutrition', 'diet', 'microbiota',
  ],
  earth: [
    'climate', 'warming', 'greenhouse', 'emissions', 'co2', 'carbon dioxide', 'methane', 'carbon sinks?', 'carbon cycle', 'oceans?',
    'oceanic', 'oceanograph\\w*', 'sea levels?', 'sea[- ]ice', 'glacier\\w*', 'glacial', 'ice sheets?', 'ice shel(?:f|ves)',
    'antarctic\\w*', 'arctic', 'greenland', 'permafrost', 'earthquakes?', 'seismic\\w*', 'volcan\\w*', 'eruptions?', 'tectonic\\w*',
    'mantle', 'magma\\w*', 'lava', 'landslides?', 'tsunamis?', 'floods?', 'flooding', 'droughts?', 'rainfall', 'precipitation',
    'monsoons?', 'hurricanes?', 'typhoons?', 'cyclones?', 'storms?', 'wildfires?', 'heat ?waves?', 'weather', 'atmospher\\w*',
    'aerosols?', 'air pollution', 'pollution', 'pollutants?', 'air quality', 'ozone', 'soils?', 'groundwater', 'rivers?', 'wetlands?',
    'salt marsh\\w*', 'coasts?', 'coastal', 'deforestation', 'forests?', 'rainforests?', 'amazon rainforest', 'el niño', 'el nino',
    'la niña', 'enso', 'geolog\\w*', 'geophysic\\w*', 'geochemi\\w*', 'geoscien\\w*', 'minerals?', 'sediments?', 'stalagmites?',
    'pal(?:a)?eoclimat\\w*', 'ice ages?', "earth['’]s", 'earth', 'environmental\\w*', 'the environment', 'sustainab\\w*', 'renewables?', 'wind power',
    'wind farms?', 'fossil fuels?', 'coal', 'ipcc', 'cop ?\\d\\d', 'upwelling', 'amoc', 'atlantic circulation', 'hydrolog\\w*',
    'water cycle', 'snow\\w*', 'erosion', 'land use', 'agricultur\\w*', 'extinctions?', 'conservation', 'biodiversity', 'ecosystems?',
    'net zero', 'decarboni[sz]\\w*', 'heat stress', 'extreme weather', 'climate change', 'global warming', 'carbon emissions',
    'water quality', 'drinking water', 'mercury pollution', 'microplastics?', 'natural hazards?', 'disasters?', 'geomorpholog\\w*',
    'basalts?', 'granites?', 'crust', 'plate boundar\\w*', 'subduction', 'fault lines?', 'fault zones?',
    'mesoscale', 'submesoscale', 'edd(?:y|ies)', 'tree[- ]rings?', 'radiocarbon', 'holocene', 'pleistocene', 'permian', 'cretaceous',
    'jurassic', 'triassic', 'cambrian', 'devonian', 'carboniferous', 'eocene', 'miocene', 'pliocene', 'mass extinctions?',
    'paleontolog\\w*', 'palaeontolog\\w*', 'ionospher\\w*', 'thermospher\\w*', 'stratospher\\w*', 'troposph\\w*', 'clouds?', 'aquifers?',
    'seafloor', 'sea floor', 'deep sea', 'reefs?', 'fisheries', 'mountains?', 'himalaya\\w*',
  ],
  space: [
    'astronom\\w*', 'astrophysic\\w*', 'galax(?:y|ies)', 'galactic', 'stars?', 'stellar', 'planets?', 'planetary', 'exoplanet\\w*',
    'black holes?', 'neutron stars?', 'pulsars?', 'quasars?', 'supernova(?:e|s)?', 'nebula(?:e|s)?', 'cosmic', 'cosmolog\\w*', 'universe',
    'big bang', 'dark energy', 'dark matter', 'telescopes?', 'jwst', 'james webb', 'webb', 'hubble', 'euclid', 'gaia', 'chandra', 'alma',
    'event horizon', 'mars', 'martian', 'moons?', 'lunar', 'jupiter', 'saturn', 'venus', 'neptune', 'uranus', 'pluto', 'asteroids?',
    'comets?', 'meteors?', 'meteorites?', 'solar system', 'solar wind', 'solar flares?', 'solar storms?', 'solar activity',
    'solar eruptions?', 'solar cycle', 'sunspots?', 'heliophysic\\w*', 'the sun', 'outer space', 'in space', 'space stations?',
    'spacecraft', 'space telescopes?', 'space agency', 'spaceflights?', 'space missions?', 'space probes?', 'nasa', 'esa', 'spacex',
    'starship', 'rockets?', 'orbit(?:s|ing|ers?)?', 'satellites?', 'astronauts?', 'iss', 'international space station', 'artemis',
    'rovers?', 'landers?', 'interstellar', 'gravitational waves?', 'ligo', 'redshift', 'white dwarfs?', 'brown dwarfs?', 'red giants?',
    'light[- ]years?', 'milky way', 'andromeda', 'kuiper', 'oort', 'magnetars?', 'gamma[- ]ray bursts?', 'fast radio bursts?',
    'cosmic rays?', 'eclipses?', 'auroras?', 'aurorae', 'geomagnetic storms?', 'space weather', 'cubesats?', 'titan', 'europa',
    'enceladus', 'ceres', 'bennu', 'ryugu', 'perseverance', 'voyager', 'juno', 'cassini', 'little red dots?', 'protoplanetary',
    'accretion dis[ck]s?', 'star formation', 'planet formation', 'habitable zone', 'astrobiolog\\w*', 'binary stars?', 'stellar mass',
    'spectrograph\\w*', 'radio telescopes?', 'observatory', 'observatories', 'launch(?:ed|es)? (?:into orbit|to space)',
    'magnetospher\\w*', 'magnetosheath', 'magnetopause', 'heliospher\\w*', 'phobos', 'deimos', 'ionospher\\w*', 'thermospher\\w*',
    'celestial', 'astronomical', 'nasa[’\']s', 'esa[’\']s', 'space science', 'spacewalks?', 'cosmos',
  ],
};

// Phrases settled before the term lists, then blanked out: [pattern, weights].
const PHRASES = [
  ['solar cells?|photovoltaic\\w*|solar panels?', { physics: 1, chemistry: 1 }],
  ['fuel cells?|battery cells?|electrochemical cells?', { chemistry: 1 }],
  ['neural networks?|machine learning|deep learning|artificial intelligence|large language models?|llms?|chatbots?', {}],
  ['power plants?|power stations?|cell ?phones?|cell towers?|star ratings?|rock stars?|film stars?|pop stars?|stars? players?', {}],
  ['chemical space|design space|search space|phase space|parameter space|office space|space of', {}],
  ['light emission|x-ray emission|gamma[- ]ray emission|emission lines?|emission spectr\\w*|spontaneous emission', { physics: 1 }],
  ['solar (?:eruptions?|storms?|flares?|wind|activity|corona|cycle|radio)|geomagnetic storms?|coronal mass ejections?|space weather', { space: 3 }],
  ['(?:galaxy|galactic|stellar|cosmic|planetary) evolution|evolution of (?:galaxies|stars|the universe|planets)', { space: 3 }],
  ['dust storms? on mars|martian (?:dust|weather|atmosphere|clouds?)|on mars', { space: 3 }],
  // Another world's air is astronomy, not Earth science ("the atmosphere of a hot Jupiter", "clouds on a lava planet").
  ['exoplanet(?:ary)? (?:atmospheres?|clouds?|weather|climates?)|(?:atmospheres?|clouds?|weather|climates?|winds?|skies) (?:of|on|in|around) (?:(?:a|an|the|its|their|this|that|distant|nearby|hot|warm|cold|young|alien|giant|rocky|lava|ocean|icy) )*(?:exoplanets?|brown dwarfs?|hot jupiters?|super[- ]earths?|(?:sub|mini)[- ]neptunes?|(?:lava|rocky|giant|alien|distant|ocean|other|young) (?:planets?|worlds?)|venus|titan|pluto|jupiter|saturn|uranus|neptune)', { space: 3 }],
  ['nuclear (?:receptors?|envelope|pore|membrane|genome)|cell nucle(?:us|i)', { biology: 1 }],
  ['starfish|sea stars?', { biology: 3 }],
  ['near[- ]earth|earth[- ]like|earth[- ]sized?|earth[- ]mass|super[- ]earths?', { space: 3 }],
  ['spin[- ]orbit\\w*|spin[- ]orbital', { physics: 1 }],
  ['plastic (?:deformation|flow|events?|strain)|plasticity', { physics: 1 }],
  ['(?:dna|rna|protein|lipid|fatty[- ]acid|cholesterol|collagen|atp) synthes\\w*', { biology: 1 }],
  ['amino acids?|nucleic acids?|fatty acids?', { biology: 1 }],
  ['heart of|at the heart|joint (?:venture|statement)', {}],
  ['oort cloud|molecular clouds?|interstellar clouds?|gas clouds?|dust clouds?|magellanic clouds?', { space: 3 }],
  ['cloud computing|cloud services?|the cloud|cloud providers?|cloud storage', {}],
  ['conservation of (?:energy|momentum|charge|mass|angular momentum)', { physics: 1 }],
  ['(?:work(?:ing)?|research|learning|lab|academic) environments?|(?:political|economic|funding|business) climate|climate of (?:fear|uncertainty)', {}],
];

const WORD = (alts, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags);
const PHRASE_RES = PHRASES.map(([p, w]) => [WORD(p), w]);
const TERM_RES = Object.fromEntries(Object.entries(TERMS).map(([d, list]) => [d, WORD(list.join('|'))]));
const FIELD_WEIGHT = { title: 3, section: 2, summary: 1 };

/** Keyword scores per discipline for an item's title, section (feed category) and summary. */
export function scoreDisciplines({ title = '', section = '', summary = '' }) {
  const score = Object.fromEntries(DISCIPLINE_IDS.map(d => [d, 0]));
  for (const [field, w] of Object.entries(FIELD_WEIGHT)) {
    // Hyphen variants (U+2010–2015, minus sign) read as a plain hyphen, so "Spin‐Orbit" matches "spin-orbit".
    let text = ` ${String({ title, section, summary }[field] || '').normalize('NFC').replace(/[‐-―−]/g, '-')} `;
    for (const [re, weights] of PHRASE_RES) {
      text = text.replace(re, () => { for (const [d, x] of Object.entries(weights)) score[d] += x * w; return ' · '; });
    }
    for (const d of DISCIPLINE_IDS) {
      const seen = new Set();
      for (const m of text.matchAll(TERM_RES[d])) seen.add(m[0].toLowerCase().replace(/(?:es|s)$/, ''));
      score[d] += seen.size * w;
    }
  }
  return score;
}

/**
 * Disciplines for an item: its feed's defaults refined by keywords. Returns ids in DISCIPLINES order; [] = general.
 * @param {{title?: string, section?: string, summary?: string}} item
 * @param {string[]} defaults the feed's default disciplines ([] for a multidisciplinary feed)
 */
export function classify(item, defaults = []) {
  const s = scoreDisciplines(item);
  const out = new Set(defaults.filter(d => DISCIPLINE_IDS.includes(d)));
  const best = Math.max(...Object.values(s));
  if (!out.size) {
    for (const d of DISCIPLINE_IDS) if (s[d] >= 3 && s[d] >= 0.4 * best) out.add(d);
  } else {
    const own = Math.max(...[...out].map(d => s[d]));
    const others = DISCIPLINE_IDS.filter(d => !out.has(d)), bestOther = Math.max(0, ...others.map(d => s[d]));
    for (const d of others) if ((s[d] >= 6 || (s[d] >= 4 && s[d] >= own)) && s[d] >= 0.6 * bestOther) out.add(d);
  }
  return DISCIPLINE_IDS.filter(d => out.has(d));
}

// ---- Type ------------------------------------------------------------------------------------------------------------
const DROP_TITLE = /^(?:author correction|publisher correction|correction(?: to)?|corrigendum|erratum|errata|retraction(?: note)?|retracted|expression of concern|editorial expression of concern|addendum|withdrawal|notice of retraction|daily briefing|briefing chat|issue information|cover picture|front cover|back cover|inside (?:front |back )?cover)\b/i;
const DROP_GENRE = /^(?:corrections?|errat\w*|corrigend\w*|retraction\w*|expression of concern|addend\w*|issue information|covers?|cover pictures?|front matter|back matter|masthead|sponsored|partner content|advertorial|webinars?)$/i;
const NEWS_GENRE = /^(?:news(?: (?:&|and) views| feature| in brief| focus)?|in depth|in brief|features?|editorials?|perspectives?|books?(?: et al\.?| reviews?)?|letters?|letters? to the editor|policy (?:forum|article)|research highlights?|highlights?|working life|focus|commentary|comment|essays?|q ?& ?a|previews?|spotlights?|dispatch(?:es)?|correspondence|obituar(?:y|ies)|careers?|career feature|introducing\W*|meeting reports?|outlook|analysis|opinion|viewpoints?|synopsis|world view|futures|podcast|news & views|matters arising|reply|career column|technology feature|toolbox|interview|profile)$/i;
const PAPER_GENRE = /^(?:research(?: articles?| letters?| reports?| papers?| resources?)?|articles?|reports?|communications?|reviews?|minireviews?|resources?|short (?:articles?|communications?|reports?)|brief (?:reports?|communications?)|letters? \(research\)|original research|technical reports?|methods?|full papers?|edge articles?|concise articles?|rapid communications?)$/i;
// Bare site pages some newsroom feeds push out with the stories (NASA's feed carries a "Publications" list page).
const DROP_PAGE = /^(?:publications|resources|events|calendar|newsletters?|archives?|contact(?: us)?|about(?: us)?)$/i;

/** A title that is never a story: corrections, errata, retraction notes, covers, issue information, sponsored posts, bare site pages. */
export function isDroppedTitle(title) {
  const t = String(title || '').trim();
  return DROP_TITLE.test(t) || DROP_PAGE.test(t) || /^(?:webinar|sponsored|advertisement|partner content)\b/i.test(t);
}

/**
 * 'paper' | 'news' | null (drop). `genres` are the feed's own labels for the item (dc:type, prism:section, categories).
 * @param {{title: string, url?: string, doi?: string, genres?: string[], categories?: string[]}} item
 * @param {{kind: 'journal'|'news'}} source
 */
export function detectType(item, source) {
  const genres = (item.genres || []).map(g => String(g).trim()).filter(Boolean);
  const cats = (item.categories || []).map(c => String(c).trim().toLowerCase());
  if (isDroppedTitle(item.title) || genres.some(g => DROP_GENRE.test(g)) || cats.some(c => /^(?:sponsored|partner content|advertorial|webinars?)$/.test(c))) return null;
  if (source.kind !== 'journal') return 'news';
  if (genres.some(g => NEWS_GENRE.test(g))) return genres.some(g => PAPER_GENRE.test(g) && !NEWS_GENRE.test(g)) ? 'paper' : 'news';
  if (genres.some(g => PAPER_GENRE.test(g))) return 'paper';
  // Springer Nature: magazine content (news, comment, News & Views, careers) has d-prefixed DOIs, research s-prefixed.
  const doi = (item.doi || '').toLowerCase();
  if (/^10\.1038\/d\d/.test(doi) || /nature\.com\/articles\/d\d/.test(item.url || '')) return 'news';
  return 'paper';
}

/** Genre labels that describe the kind of article rather than its subject (used to split feed categories). */
export const isGenre = g => DROP_GENRE.test(g) || NEWS_GENRE.test(g) || PAPER_GENRE.test(g);

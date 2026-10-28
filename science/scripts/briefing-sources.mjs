// Scientific Briefing feed catalogue: the major journals and science desks, one entry per RSS/Atom feed.
//   kind  'journal' (a peer-reviewed journal's table of contents) or 'news' (a science desk or agency newsroom)
//   tier  1 = flagship journals (Nature, Science, Cell, PNAS, PRL); 2 = other major journals; 3 = quality science journalism
//   disciplines  the feed's default disciplines ([] = multidisciplinary: keywords decide; see classify.mjs)
//   outlet  the publication shown on each item (several feeds can share one, e.g. the Phys.org sections)
//   qid  the outlet's Wikidata item (CC0), for the Encyclopaedia
//   cap  optional per-feed limit on stored items (default 150)
// Every candidate was fetched before it went in (October 2026). Tested and left out: JACS and ACS Central Science
// (HTTP 403 to feed readers), Nature Astronomy (its feed sends readers to a sign-in page; the Nature Portfolio astronomy
// subject feed stands in), New Scientist (HTTP 406), EurekAlert! (no RSS any more), Sky & Telescope (403), Chemical
// Science (undated items), Astronomy & Astrophysics (empty feed), ScienceDaily Chemistry (a few items a month), and
// Carbon Brief (mostly energy policy). Nature has no separate news feed: its news, comment and News & Views pieces come
// through the Nature feed and are typed as News.

export const TIERS = { 1: 'Flagship journal', 2: 'Major journal', 3: 'Science journalism' };
export const KINDS = { journal: 'Journal', news: 'Science desk' };
export const DEFAULT_CAP = 150;

const S = (id, outlet, section, url, feed, kind, tier, disciplines, qid, extra = {}) =>
  ({ id, outlet, name: section ? `${outlet} · ${section}` : outlet, url, feed, kind, tier, disciplines, qid, ...extra });

export const SOURCES = [
  // ---- Tier 1: flagship journals
  S('nature', 'Nature', '', 'https://www.nature.com/nature', 'https://www.nature.com/nature.rss', 'journal', 1, [], 'Q180445'),
  S('science', 'Science', '', 'https://www.science.org/journal/science', 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science', 'journal', 1, [], 'Q192864'),
  S('cell', 'Cell', '', 'https://www.cell.com/cell/home', 'https://www.cell.com/cell/inpress.rss', 'journal', 1, ['biology'], 'Q655814'),
  S('pnas', 'PNAS', '', 'https://www.pnas.org', 'https://www.pnas.org/action/showFeed?type=searchTopic&taxonomyCode=type&tagCode=research-article&feed=rss', 'journal', 1, [], 'Q1146531'),
  S('prl', 'Physical Review Letters', '', 'https://journals.aps.org/prl/', 'https://feeds.aps.org/rss/recent/prl.xml', 'journal', 1, ['physics'], 'Q2018386'),

  // ---- Tier 2: other major journals
  S('sciadv', 'Science Advances', '', 'https://www.science.org/journal/sciadv', 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv', 'journal', 2, [], 'Q19881044', { cap: 120 }),
  S('ncomms', 'Nature Communications', '', 'https://www.nature.com/ncomms/', 'https://www.nature.com/ncomms.rss', 'journal', 2, [], 'Q573880', { cap: 120 }),
  S('nphys', 'Nature Physics', '', 'https://www.nature.com/nphys/', 'https://www.nature.com/nphys.rss', 'journal', 2, ['physics'], 'Q2108381'),
  S('prx', 'Physical Review X', '', 'https://journals.aps.org/prx/', 'https://feeds.aps.org/rss/recent/prx.xml', 'journal', 2, ['physics'], 'Q15716725'),
  S('nmat', 'Nature Materials', '', 'https://www.nature.com/nmat/', 'https://www.nature.com/nmat.rss', 'journal', 2, ['physics', 'chemistry'], 'Q1998645'),
  S('nchem', 'Nature Chemistry', '', 'https://www.nature.com/nchem/', 'https://www.nature.com/nchem.rss', 'journal', 2, ['chemistry'], 'Q2107904'),
  S('natcatal', 'Nature Catalysis', '', 'https://www.nature.com/natcatal/', 'https://www.nature.com/natcatal.rss', 'journal', 2, ['chemistry'], 'Q87347989'),
  S('angew', 'Angewandte Chemie', '', 'https://onlinelibrary.wiley.com/journal/15213773', 'https://onlinelibrary.wiley.com/feed/15213773/most-recent', 'journal', 2, ['chemistry'], 'Q538683', { cap: 120 }),
  S('chem', 'Chem', '', 'https://www.cell.com/chem/home', 'https://www.cell.com/chem/inpress.rss', 'journal', 2, ['chemistry'], 'Q112205030'),
  S('curbio', 'Current Biology', '', 'https://www.cell.com/current-biology/home', 'https://www.cell.com/current-biology/inpress.rss', 'journal', 2, ['biology'], 'Q1144851'),
  S('elife', 'eLife', '', 'https://elifesciences.org', 'https://elifesciences.org/rss/recent.xml', 'journal', 2, ['biology'], 'Q2000008'),
  S('plosbio', 'PLOS Biology', '', 'https://journals.plos.org/plosbiology/', 'https://journals.plos.org/plosbiology/feed/atom', 'journal', 2, ['biology'], 'Q1771695'),
  S('natecolevol', 'Nature Ecology & Evolution', '', 'https://www.nature.com/natecolevol/', 'https://www.nature.com/natecolevol.rss', 'journal', 2, ['biology'], 'Q39049712'),
  S('ngeo', 'Nature Geoscience', '', 'https://www.nature.com/ngeo/', 'https://www.nature.com/ngeo.rss', 'journal', 2, ['earth'], 'Q1337483'),
  S('nclimate', 'Nature Climate Change', '', 'https://www.nature.com/nclimate/', 'https://www.nature.com/nclimate.rss', 'journal', 2, ['earth'], 'Q1970247'),
  S('grl', 'Geophysical Research Letters', '', 'https://agupubs.onlinelibrary.wiley.com/journal/19448007', 'https://agupubs.onlinelibrary.wiley.com/feed/19448007/most-recent', 'journal', 2, ['earth'], 'Q5535576'),
  S('apjl', 'The Astrophysical Journal Letters', '', 'https://iopscience.iop.org/journal/2041-8205', 'https://iopscience.iop.org/journal/rss/2041-8205', 'journal', 2, ['space'], 'Q3470990'),
  S('nature-astro', 'Nature Portfolio', 'Astronomy & astrophysics', 'https://www.nature.com/subjects/astronomy-and-astrophysics', 'https://www.nature.com/subjects/astronomy-and-astrophysics.rss', 'journal', 2, ['space'], 'Q180419'),

  // ---- Tier 3: science journalism
  S('science-news', 'Science', 'News', 'https://www.science.org/news', 'https://www.science.org/rss/news_current.xml', 'news', 3, [], 'Q192864'),
  S('quanta', 'Quanta Magazine', '', 'https://www.quantamagazine.org', 'https://www.quantamagazine.org/feed/', 'news', 3, [], 'Q28403687'),
  S('sciam', 'Scientific American', '', 'https://www.scientificamerican.com', 'https://www.scientificamerican.com/platform/syndication/rss/', 'news', 3, [], 'Q39379'),
  S('sciencenews', 'Science News', '', 'https://www.sciencenews.org', 'https://www.sciencenews.org/feed', 'news', 3, [], 'Q2313730'),
  S('ars-science', 'Ars Technica', 'Science', 'https://arstechnica.com/science/', 'https://feeds.arstechnica.com/arstechnica/science', 'news', 3, [], 'Q584152'),
  S('physicsworld', 'Physics World', '', 'https://physicsworld.com', 'https://physicsworld.com/feed/', 'news', 3, ['physics'], 'Q1989782'),
  S('aps-physics', 'Physics', '', 'https://physics.aps.org', 'https://feeds.aps.org/rss/recent/physics.xml', 'news', 3, ['physics'], 'Q4046920'),
  S('chemworld-news', 'Chemistry World', 'News', 'https://www.chemistryworld.com/news', 'https://www.chemistryworld.com/409.rss', 'news', 3, ['chemistry'], 'Q5090571'),
  S('chemworld-research', 'Chemistry World', 'Research', 'https://www.chemistryworld.com/research', 'https://www.chemistryworld.com/410.rss', 'news', 3, ['chemistry'], 'Q5090571'),
  S('cen', 'C&EN', '', 'https://cen.acs.org', 'https://cen.acs.org/feeds/rss/latestnews.xml', 'news', 3, ['chemistry'], 'Q1003168'),
  S('eos', 'Eos', '', 'https://eos.org', 'https://eos.org/feed', 'news', 3, ['earth'], 'Q3055637'),
  S('nasa-science', 'NASA', 'Science', 'https://science.nasa.gov', 'https://science.nasa.gov/feed/', 'news', 3, ['space'], 'Q23548'),
  S('esa-science', 'ESA', 'Space Science', 'https://www.esa.int/Science_Exploration/Space_Science', 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', 'news', 3, ['space'], 'Q42262'),
  S('sciencedaily-physics', 'ScienceDaily', 'Physics', 'https://www.sciencedaily.com/news/matter_energy/physics/', 'https://www.sciencedaily.com/rss/matter_energy/physics.xml', 'news', 3, ['physics'], 'Q679509'),
  S('sciencedaily-biology', 'ScienceDaily', 'Biology', 'https://www.sciencedaily.com/news/plants_animals/biology/', 'https://www.sciencedaily.com/rss/plants_animals/biology.xml', 'news', 3, ['biology'], 'Q679509'),
  S('sciencedaily-earth', 'ScienceDaily', 'Earth & Climate', 'https://www.sciencedaily.com/news/earth_climate/', 'https://www.sciencedaily.com/rss/earth_climate.xml', 'news', 3, ['earth'], 'Q679509'),
  S('sciencedaily-space', 'ScienceDaily', 'Space & Time', 'https://www.sciencedaily.com/news/space_time/', 'https://www.sciencedaily.com/rss/space_time.xml', 'news', 3, ['space'], 'Q679509'),
  S('physorg-physics', 'Phys.org', 'Physics', 'https://phys.org/physics-news/', 'https://phys.org/rss-feed/physics-news/', 'news', 3, ['physics'], 'Q619096'),
  S('physorg-chemistry', 'Phys.org', 'Chemistry', 'https://phys.org/chemistry-news/', 'https://phys.org/rss-feed/chemistry-news/', 'news', 3, ['chemistry'], 'Q619096'),
  S('physorg-biology', 'Phys.org', 'Biology', 'https://phys.org/biology-news/', 'https://phys.org/rss-feed/biology-news/', 'news', 3, ['biology'], 'Q619096'),
  S('physorg-earth', 'Phys.org', 'Earth', 'https://phys.org/earth-news/', 'https://phys.org/rss-feed/earth-news/', 'news', 3, ['earth'], 'Q619096'),
  S('physorg-space', 'Phys.org', 'Space', 'https://phys.org/space-news/', 'https://phys.org/rss-feed/space-news/', 'news', 3, ['space'], 'Q619096'),
];

/** A stable id for an outlet (the source filter and #src= links use it). */
export const outletId = name => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

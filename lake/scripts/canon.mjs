// VM's canon list: the entries a reader of politics expects the Master Index to hold, kept by hand and reviewed, each
// with its references (ledger MI-12; steps F4, F5, F6 and F10 of VM-MASTER-INDEX-CANON-REVIEW.md, 25 November 2026).
//
// The lake makes its entries from what the submodules mention (adapters.mjs). This file is the one exception: the
// `canon` adapter reports every item below as a mention by the Master Index itself, filed under its own submodule
// (`encyclopedia`), with a context that says it is VM's canon list and names the references. So an item the review's
// references name has its entry although no other submodule mentions it yet, and the organisations named in "Member of"
// tags (Wikidata P463) have entries for those tags to link to (F5).
//
// Each item:
//   q        its Wikidata ID, read from Wikidata on 25 November 2026 (labels, aliases and classes), never from memory
//   label    its English label on Wikidata that day (a held name is in CANON_LABELS below, with its reason)
//   held     true where the lake held the entry before this list (only its tags are this list's: step F6)
//   type     the lake's type for it (types.mjs TYPE_NAMES); where typeOf reads Wikidata's classes otherwise, CANON_TYPES
//            below gives the type with its reason. A held item's type is the one the lake gave it on 25 November 2026
//   tier     1 for the review's Tier 1 (tables C2 to C6), 2 for its Tier 2 (B3), null for an F5 body in no tier
//   list     which of the five reviewed lists it came from
//   refs     the codes of the review's references that name it (CANON_REFS), each kept only where that page names
//            the item when read (26 November 2026: VA3, VA4H, IGO, ES and the SEP's contents were read again, and a
//            code whose page does not name the item was taken out); F5 is the review's step for the bodies named in
//            "Member of" tags
//   aliases  (new items only) the names the record keeps instead of Wikidata's first six: each reviewed against every
//            Wikidata English alias, the article's title and its lead, read that day; a name left out is left out
//            because a book would read it as something else (aliases.mjs; the Bibliotheca tagger matches every name).
//            Take a name out here when a book's re-tag shows it means something else there.
//   tags     [group, value, reference]: a hand-made tag, given only where one of the references says so, in a group
//            the lake already has (School, Ideology, Field, Theory, Event type, Conflict); the value is the reference's
//            word, and may be new to the lake (29 of the 56 distinct values below were not in the lake before this
//            list, 26 November 2026); the record keeps "VM’s canon list, from <reference>" as the tag's note (`tn`),
//            which the page shows beside the tag
//   untagged why the item has no such tag (no reference read gives one), where it has none
//
// Not here, and still the owner's to decide: positions (F7), shared aliases (F8) and the rest of Tier 2 (F9).

/** The day the items were read from Wikidata and the references. */
export const CANON_READ = '2026-11-25';

/** The review's references, by their codes (VM-MASTER-INDEX-CANON-REVIEW.md, "References used"). */
export const CANON_REFS = {
  VA3: 'Wikipedia, Vital articles level 3',
  VA4H: 'Wikipedia, Vital articles level 4, History',
  SEP: 'Stanford Encyclopedia of Philosophy',
  SEPR: 'Stanford Encyclopedia of Philosophy, "Political Realism in International Relations"',
  OPS: 'Wikipedia, Outline of political science',
  IRT: 'Wikipedia, International relations theory',
  RIR: 'Wikipedia, Realism (international relations)',
  ES: 'Wikipedia, English school of international relations theory',
  NCR: 'Wikipedia, Neoclassical realism',
  GWP: 'Baylis, Smith and Owens, The Globalization of World Politics (its contents)',
  HEY: 'Heywood, Political Ideologies: An Introduction (its chapters)',
  SET: 'Wikipedia, Schools of economic thought',
  SS: 'Wikipedia, Strategic studies',
  MMS: 'Paret (ed.), Makers of Modern Strategy (its contents, as library catalogues summarise them)',
  GEO: 'Wikipedia, Geopolitics',
  IGO: 'Wikipedia, List of intergovernmental organizations',
  VM: 'VM’s own Learning courses (lake/scripts/thinkers.mjs)',
  'MI-11': 'the owner’s requirement MI-11',
  MEM: 'the review’s own list, from memory and unverified',
  F5: 'the review’s step F5: a body named in the Master Index’s "Member of" tags (Wikidata P463)',
};

/** What the canon adapter's mentions and the tags' notes say they are. */
export const CANON_NOTE = 'VM’s canon list';
export const canonNote = ref => `${CANON_NOTE}, from ${ref}`;
export const canonContext = refs => `${CANON_NOTE}, from the references named: ${refs.map(c => `${c} (${CANON_REFS[c]})`).join('; ')}`;

export const CANON = [
  // ---- Tier 1 philosophies, ideologies and core concepts (review C2)
  { q: 'Q167651', label: "Maoism", type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    aliases: ["Mao Zedong Thought","Marxism–Leninism–Mao Zedong Thought"],
    tags: [
      ["Ideology", "Communism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Left-wing politics > Far-left politics > Communism > Maoism"],
      ["Ideology", "Marxism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Marxist schools of thought > Maoism"]
    ] },
  { q: 'Q178598', label: "libertarianism", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    aliases: [],
    tags: [
      ["Field", "Political philosophy", "SEP entry \"libertarianism\" (https://plato.stanford.edu/entries/libertarianism/, read 25 Nov 2026), preamble: \"Libertarianism is a family of views in political philosophy.\""]
    ] },
  { q: 'Q7167', label: "colonialism", type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","SEP"],
    aliases: [],
    tags: [],
    untagged: "VA3 files it under Politics beside imperialism and SEP calls it \"a practice of domination\"; neither gives a school, ideology or field. Wikidata's P279 imperialism is not one of the review's references" },
  { q: 'Q1326430', label: "social contract", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    aliases: [],
    tags: [
      ["Field", "Political theory", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Theories of state > Consent of the governed > Social contract; and SEP entry \"contractarianism\" (https://plato.stanford.edu/entries/contractarianism/, read 25 Nov 2026), preamble: \"names both a political theory of the legitimacy of political authority and a moral theory\"; its social contract theorists are Hobbes, Locke, Kant and Rousseau"]
    ] },
  { q: 'Q42008', label: "sovereignty", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    aliases: [],
    tags: [
      ["Field", "Political theory", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Theories of state > Sovereignty"]
    ] },
  { q: 'Q8458', label: "human rights", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP"],
    aliases: ["human right"],
    tags: [
      ["Field", "Political philosophy", "SEP entry \"rights-human\" (https://plato.stanford.edu/entries/rights-human/, read 25 Nov 2026), preamble: reflection on human rights \"has become a sub-field of political and legal philosophy\""],
      ["Field", "Philosophy of law", "SEP entry \"rights-human\" (https://plato.stanford.edu/entries/rights-human/, read 25 Nov 2026), preamble: the same sentence (\"legal philosophy\"); the lake spells the field as Wikidata does, \"Philosophy of law\""]
    ] },
  { q: 'Q44918', label: "rule of law", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    aliases: ["the rule of law","supremacy of law","nomocracy"],
    tags: [],
    untagged: "OPS files it under Political institutions > Government, and SEP (\"one of the ideals of our political morality\") names no field in its preamble" },
  { q: 'Q159385', label: "geopolitics", type: 'topic', tier: 1, list: 'ideas', refs: ["OPS"],
    aliases: [],
    tags: [
      ["Field", "Political science", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Fields of study of political science: Geopolitics and political geography"]
    ] },
  { q: 'Q79896', label: "separation of powers", type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    aliases: [],
    tags: [],
    untagged: "OPS files it under Political institutions > Branches of government, which is no school, ideology or field. The SEP has no entry for it (contents read 26 Nov 2026), but its entry \"Montesquieu\" names it in its opening (\"This theory of the separation of powers had an enormous impact on liberal political theory\", read 26 Nov 2026), which gives no school, ideology or field of its own" },
  { q: 'Q1125082', label: "balance of power", type: 'idea', tier: 1, list: 'ideas', refs: ["OPS","IRT","RIR"],
    aliases: ["international equilibrium"],
    tags: [
      ["Field", "International relations", "IRT (Wikipedia, International relations theory, read 25 Nov 2026): \"Early international relations scholarship in the interwar years focused on the need for the balance of power system to be replaced with a system of collective security\"; RIR (Wikipedia, Realism (international relations), read 25 Nov 2026): \"In the realist tradition, security is based on the principle of a balance of power\""]
    ] },
  { q: 'Q1472670', label: "new world order", type: 'idea', tier: 1, list: 'ideas', refs: ["MI-11"],
    aliases: [],
    tags: [],
    untagged: "MI-11 asks only that it be an entry; none of the references read places it" },
  { q: 'Q794394', label: "classical liberalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Liberalism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Liberalism > Classical liberalism"]
    ] },
  { q: 'Q201712', label: "social liberalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Liberalism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Liberalism > Social liberalism"]
    ] },
  { q: 'Q162719', label: "neoliberalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Liberalism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Liberalism > Neoliberalism"]
    ] },
  { q: 'Q121254', label: "social democracy", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Socialism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Left-wing politics > Socialism > Social democracy"]
    ] },
  { q: 'Q189280', label: "democratic socialism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Socialism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Left-wing politics > Socialism > Democratic socialism"]
    ] },
  { q: 'Q211930', label: "Marxism–Leninism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Communism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Left-wing politics > Far-left politics > Communism > Marxism–Leninism"],
      ["Ideology", "Marxism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Marxist schools of thought > Marxism-Leninism"]
    ] },
  { q: 'Q192139', label: "neoconservatism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Conservatism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Right-wing politics > Conservatism > Neoconservatism"]
    ] },
  { q: 'Q128135', label: "totalitarianism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Authoritarianism", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Authoritarianism > Totalitarianism"]
    ] },
  { q: 'Q6235', label: "nationalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [
      ["Ideology", "Identity politics", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Identity politics (\"political ideologies concerned with the interests of the members of a specific group\") > Nationalism"]
    ] },
  { q: 'Q7252', label: "feminism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS","HEY"],
    tags: [
      ["Ideology", "Identity politics", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Identity politics > Feminism"]
    ] },
  { q: 'Q189746', label: "Islamism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Identity politics", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Identity politics > Islamism"]
    ] },
  { q: 'Q42388', label: "Zionism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [
      ["Ideology", "Identity politics", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political ideologies and philosophies: Identity politics > Zionism"]
    ] },
  { q: 'Q192125', label: "liberal democracy", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    tags: [
      ["Field", "Political theory", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Democratic theory > Liberal democracy"]
    ] },
  { q: 'Q877848', label: "republicanism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    tags: [
      ["Field", "Political theory", "OPS (Wikipedia, Outline of political science, read 25 Nov 2026), § Political theory: Democratic theory > Republicanism; and SEP entry \"republicanism\" (https://plato.stanford.edu/entries/republicanism/, read 25 Nov 2026), preamble: \"In political theory and philosophy, the term 'republicanism' is generally used in two different, but closely related, senses\""],
      ["Field", "Political philosophy", "SEP entry \"republicanism\" (https://plato.stanford.edu/entries/republicanism/, read 25 Nov 2026), preamble: the same sentence"]
    ] },
  { q: 'Q160590', label: "utilitarianism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["SEP"],
    tags: [
      ["Field", "Ethics", "SEP entry \"utilitarianism-history\" (https://plato.stanford.edu/entries/utilitarianism-history/, read 25 Nov 2026), preamble: \"Utilitarianism is one of the most powerful and persuasive approaches to normative ethics\""]
    ] },
  { q: 'Q6216', label: "liberalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS and VA3 list it as a family head (OPS: \"Liberalism, defined by high valuing of liberty\"); it has no parent ideology" },
  { q: 'Q7169', label: "conservatism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS files it under Right-wing politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q7272', label: "socialism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS files it under Left-wing politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q6186', label: "communism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS files it under Left-wing politics > Far-left politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q6199', label: "anarchism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","SEP","OPS","HEY"],
    tags: [],
    untagged: "OPS files it under Far-left politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job; SEP calls it \"a political theory\", but no ideology here takes a Field tag" },
  { q: 'Q6223', label: "fascism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS files it under Right-wing politics > Far-right politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q6206', label: "capitalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","SEP","OPS","HEY"],
    tags: [],
    untagged: "VA3 lists it under the heading Ideology, which is not a value; OPS does not list it; SEP calls it a contested concept of an economic system" },
  { q: 'Q6229', label: "authoritarianism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS","HEY"],
    tags: [],
    untagged: "OPS lists it as a family head (with absolutism and totalitarianism under it); no parent" },
  { q: 'Q180490', label: "populism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS","HEY"],
    tags: [],
    untagged: "only HEY names it (a chapter title); OPS does not list it" },
  { q: 'Q7264', label: "Marxism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [],
    untagged: "OPS lists it as the head of \"Marxist schools of thought\"; no parent" },
  { q: 'Q209158', label: "Christian democracy", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [],
    untagged: "OPS files it under Right-wing politics > Centre-right politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job (and it differs from VM's own \"Centre\"; see the notes)" },
  { q: 'Q494792', label: "Third Way", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [],
    untagged: "OPS files it under Centrism, which Wikidata treats as a position value (P1387), so a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q7310', label: "Nazism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [],
    untagged: "OPS lists it beside fascism under Far-right politics, not under it; no reference read today puts it under fascism" },
  { q: 'Q1661415', label: "green politics", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["OPS"],
    tags: [],
    untagged: "OPS files it under Left-wing politics, a position family, not an ideology; a position is step F7 (sourced positions), not a tag of this job" },
  { q: 'Q7260', label: "imperialism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3"],
    tags: [],
    untagged: "VA3 files it under Politics beside colonialism; no school, ideology or field" },
  { q: 'Q7174', label: "democracy", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["VA3","OPS"],
    tags: [],
    untagged: "OPS files it under Types of polities and forms of government > By source of power, and VA3 under Government; neither is a school, ideology or field" },
  { q: 'Q204886', label: "federalism", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    tags: [],
    untagged: "OPS files it under forms of government (By level of social organisation); SEP (\"the theory or advocacy of federal principles\") names no field in its preamble" },
  { q: 'Q847198', label: "just war theory", held: true, type: 'idea', tier: 1, list: 'ideas', refs: ["SEP","OPS"],
    tags: [],
    untagged: "OPS files it under Political dysfunction > Law of war; SEP \"war\" names no field in its preamble. Its type is already right (idea, since F3)" },
  // ---- Tier 1 schools of thought (review C3)
  { q: 'Q5128352', label: "Classical realism", type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR"],
    aliases: ["Classical realism (international relations)"],
    tags: [
      ["School", "Realism", "IRT § Realism (\"human nature realists or classical realists\"); RIR § Overview and § Classical realism"],
      ["School", "Classical realism", "RIR § Classical realism; SEPR (branches, as the review D1 records)"],
      ["Field", "International relations", "IRT § Realism"]
    ] },
  { q: 'Q1761068', label: "neorealism", type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR"],
    aliases: ["Structural Realism"],
    tags: [
      ["School", "Realism", "IRT § Neorealism (\"a development of realism\"); RIR § Neorealism or structural realism"],
      ["School", "Neorealism (structural realism)", "IRT § Neorealism (\"Neorealism or structural realism\"); the value the lake already gives Waltz, Walt and Mearsheimer"],
      ["Field", "International relations", "IRT § Neorealism"]
    ] },
  { q: 'Q5251484', label: "Defensive realism", type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR"],
    aliases: [],
    tags: [
      ["School", "Realism", "RIR § Overview"],
      ["School", "Neorealism (structural realism)", "IRT § Neorealism (\"Waltz's version of neorealism has frequently been characterized as defensive realism\"); RIR § Neorealism or structural realism, \"Prominent neorealists\" (Jervis, Waltz, Walt: defensive realism)"],
      ["School", "Defensive realism", "RIR § Neorealism or structural realism; IRT § Neorealism"],
      ["Field", "International relations", "IRT § Neorealism"]
    ] },
  { q: 'Q6992186', label: "neoclassical realism", type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR","NCR"],
    aliases: [],
    tags: [
      ["School", "Realism", "RIR § Overview and § Neoclassical realism (\"the third generation of realism\"); NCR lead"],
      ["School", "Neoclassical realism", "NCR lead (coined by Gideon Rose, World Politics, 1998); RIR § Neoclassical realism"],
      ["Field", "International relations", "NCR lead (\"a theory of international relations\")"]
    ] },
  { q: 'Q1822951', label: "liberalism", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: ["liberal international relations theory"],
    tags: [
      ["School", "Liberalism (international relations)", "IRT § Liberalism (Main: Liberalism (international relations)); GWP ch. 7 \"Liberal Internationalism\""],
      ["Field", "International relations", "IRT § Liberalism"]
    ] },
  { q: 'Q1186378', label: "democratic peace theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: [],
    tags: [
      ["Field", "International relations", "IRT § Democratic (democratic peace theory as a dispute between realists and liberals)"]
    ] },
  { q: 'Q2745901', label: "idealism in international relations", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: [],
    tags: [
      ["School", "Idealism in international relations", "IRT § Liberalism (\"idealism (also called Wilsonianism)\", the precursor of liberal IR theory)"],
      ["Field", "International relations", "IRT § Liberalism"]
    ] },
  { q: 'Q1342733', label: "English school of international relations theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","ES","GWP"],
    aliases: ["liberal realism","British institutionalists","international society school"],
    tags: [
      ["School", "English School", "ES lead; IRT § English school; the review D3 (\"The English School | Add, in School\")"],
      ["Field", "International relations", "ES lead (\"The English School of international relations theory\")"]
    ] },
  { q: 'Q6778656', label: "Marxist international relations theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: ["Marxist IR theory","Marxism (international relations)"],
    tags: [
      ["School", "Marxist international relations theory", "IRT § Marxism (Main: Marxist international relations theory); GWP ch. 8 \"Marxist theories of international relations\""],
      ["Ideology", "Marxism", "IRT § Marxism (\"Marxist and Neo-Marxist international relations theories ... argue the position of historical materialism\")"],
      ["Field", "International relations", "IRT § Marxism"]
    ] },
  { q: 'Q1061896', label: "world-systems theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: ["world-systems analysis","world-systems perspective","world systems theory","world system theory"],
    tags: [
      ["School", "World-systems theory", "IRT § Marxism (\"Immanuel Wallerstein's World-system theory\")"],
      ["School", "Marxist international relations theory", "IRT § Marxism (\"One notable Marxist approach to international relations theory is ... World-system theory\")"],
      ["Field", "International relations", "IRT § Marxism"]
    ] },
  { q: 'Q5186732', label: "Critical international relations theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: [],
    tags: [
      ["School", "Critical international relations theory", "IRT § Marxism, See also \"Critical theory\"; § Postcolonialism (\"a critical theory approach to international relations\")"],
      ["Field", "International relations", "IRT § Marxism"]
    ] },
  { q: 'Q267932', label: "Post-structuralism", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: ["poststructuralism"],
    tags: [
      ["School", "Post-structuralism", "IRT § Post-structuralism (links the general article Post-structuralism); GWP ch. 12 \"Poststructuralism\""],
      ["Field", "International relations", "IRT § Post-structuralism (\"post-structuralism in international relations\")"]
    ] },
  { q: 'Q7234129', label: "Postcolonialism", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","ES","GWP"],
    aliases: [],
    tags: [
      ["School", "Postcolonial international relations", "IRT § Postcolonialism (Main: Postcolonial international relations); GWP ch. 11 \"Post colonial and decolonial approaches\""],
      ["Field", "International relations", "IRT § Postcolonialism"]
    ] },
  { q: 'Q3092681', label: "feminism in international relations", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    aliases: [],
    tags: [
      ["School", "Feminism in international relations", "IRT § Feminist international relations theory (Main: Feminism in international relations); GWP ch. 10 \"Feminism\""],
      ["Field", "International relations", "IRT § Feminist international relations theory"]
    ] },
  { q: 'Q162527', label: "mercantilism", type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    aliases: [],
    tags: [
      ["School", "Mercantilism", "SET § Mercantilism"],
      ["Field", "Economics", "SET (a school of economic thought)"]
    ] },
  { q: 'Q854537', label: "Marxian economics", type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    aliases: ["Marxist economics","Marxian school of economics"],
    tags: [
      ["School", "Marxian economics", "SET § Marxian economics"],
      ["Ideology", "Marxism", "SET § Marxian economics (\"descended from the work of Karl Marx and Friedrich Engels\")"],
      ["Field", "Economics", "SET § Marxian economics"]
    ] },
  { q: 'Q60571', label: "neoclassical economics", type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    aliases: [],
    tags: [
      ["School", "Neoclassical economics", "SET § Neoclassical economics; § Mainstream economics (\"foundations in neoclassical economics\")"],
      ["Field", "Economics", "SET § Neoclassical economics"]
    ] },
  { q: 'Q674530', label: "public choice theory", type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    aliases: [],
    tags: [
      ["School", "Public choice", "VM: thinkers.mjs, James M. Buchanan's row (School:Public choice), the value the lake already uses"],
      ["Field", "Economics", "VM: thinkers.mjs, Economics course (Buchanan)"]
    ] },
  { q: 'Q3268778', label: "grand strategy", type: 'idea', tier: 1, list: 'schools', refs: ["SS","MMS","GEO"],
    aliases: ["high strategy"],
    tags: [
      ["Field", "Strategic studies", "SS lead (\"Strategic studies is closely associated with grand strategy\")"]
    ] },
  { q: 'Q1949683', label: "deterrence theory", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","SS","MMS","GEO"],
    aliases: ["nuclear deterrence theory"],
    tags: [
      ["Field", "International relations", "IRT § Psychological approaches to international relations (\"nuclear strategy and nuclear proliferation to deterrence\")"]
    ] },
  { q: 'Q1291690', label: "nuclear strategy", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","SS","MMS","GEO"],
    aliases: [],
    tags: [
      ["Field", "Strategic studies", "SS lead (the Cold War's danger of nuclear war \"produced an expansion of the discipline\", Brodie and others); MMS (its nuclear strategists' chapters, as the review summarises them)"],
      ["Field", "International relations", "IRT § Psychological approaches to international relations (\"nuclear strategy\")"]
    ] },
  { q: 'Q1761621', label: "command of the sea", type: 'idea', tier: 1, list: 'schools', refs: ["SS","MMS","GEO"],
    aliases: ["sea control","sea power"],
    tags: [
      ["Field", "Geopolitics", "GEO § Alfred Thayer Mahan and sea power"]
    ] },
  { q: 'Q760037', label: "counter-insurgency", type: 'idea', tier: 1, list: 'schools', refs: ["IRT","SS","MMS","GEO"],
    aliases: ["counterinsurgency","counter insurgency"],
    tags: [],
    untagged: "no reference read gives its field or school: SS and GEO do not name it, IRT only in passing elsewhere, and MMS could not be read (403, as the review says); Wikidata's \"subclass of military strategy\" is not one of the review's references" },
  { q: 'Q471183', label: "Realism", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Realism and Field:International relations from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q3054672', label: "offensive realism", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SEPR","IRT","RIR"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Realism, School:Neorealism (structural realism), School:Offensive realism and Field:International relations from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q15984000', label: "institutional liberalism", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["IRT","GWP"],
    tags: [
      ["School", "Liberalism (international relations)", "IRT § Neoliberalism (\"Neoliberalism, liberal institutionalism or neo-liberal institutionalism is a more recent branch of liberal international relations theory\")"]
    ] },
  { q: 'Q1783023', label: "constructivism", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["IRT","ES","GWP"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Constructivism and Field:International relations from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q271857', label: "classical economics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Classical economics and Field:Economics from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q83937', label: "Keynesian economics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Keynesian economics and Field:Economics from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q203411', label: "Austrian school", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Austrian school and Field:Economics from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q847001', label: "Chicago school of economics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [
      ["School", "Neoclassical economics", "SET § Chicago school (\"The Chicago School is a neoclassical school of economic thought\")"]
    ] },
  { q: 'Q373177', label: "monetarism", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [
      ["School", "Chicago school of economics", "SET § Chicago school (\"notable particularly in macroeconomics for developing monetarism\")"]
    ] },
  { q: 'Q60224', label: "post-Keynesian economics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Keynesian economics, School:Post-Keynesian economics and Field:Economics from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q936174', label: "New Keynesian economics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [],
    untagged: "no hand tag: the entry already has School:Keynesian economics, School:New Keynesian economics and Field:Economics from the Learning courses (lake/scripts/thinkers.mjs), the school's own tag in the discipline's words (the review's D3), and the references give no other" },
  { q: 'Q60238', label: "new classical macroeconomics", held: true, type: 'idea', tier: 1, list: 'schools', refs: ["SET","VM"],
    tags: [
      ["Field", "Economics", "VM: thinkers.mjs, Robert Lucas Jr.'s row in the Economics course (School:New classical macroeconomics)"]
    ] },
  // ---- Organisations: Tier 1 (review C4), and the bodies named in "Member of" tags (F5), Tier 2 among them
  { q: 'Q1065', label: "United Nations", type: 'organisation', tier: 1, list: 'organisations', refs: ["VA3","IGO"],
    aliases: ["United Nations Organisation","the UN","the U.N."],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies (main article)\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7178', label: "International Red Cross and Red Crescent Movement", type: 'organisation', tier: 1, list: 'organisations', refs: ["VA3"],
    aliases: ["Red Cross and Red Crescent","IRCRCM","Red Cross Movement","Red Crescent Movement","IRCM"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q38130', label: "League of Nations", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Defunct\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7184', label: "NATO", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["NATO Alliance","North Atlantic Treaty Organisation","North Atlantic Treaty Organization","North Atlantic Alliance"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7804', label: "International Monetary Fund", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["IMF"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7164', label: "World Bank", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7825', label: "World Trade Organization", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7159', label: "African Union", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["Union Africaine"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Africa\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7768', label: "ASEAN", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["Association of South-East Asian Nations","Association of Southeast Asian Nations"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Asia\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q123759', label: "Organization of American States", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7172', label: "Arab League", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["League of Arab States"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Cultural, ethnic, linguistic, and religious organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q485207', label: "Shanghai Cooperation Organisation", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["Shanghai Cooperation Organization"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q243630', label: "BRICS", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["BRICS+"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7795', label: "Organization of the Petroleum Exporting Countries", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["OPEC"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7785', label: "Commonwealth of Nations", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["British Commonwealth of Nations","British Commonwealth"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Cultural, ethnic, linguistic, and religious organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q1764511', label: "G7", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["Group of 7","Group of Seven Industrialised Nations","G-7"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q19771', label: "G20", type: 'organisation', tier: 1, list: 'organisations', refs: ["IGO"],
    aliases: ["Group of Twenty Finance Ministers and Central Bank Governors","Group of Twenty","G-20"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q37470', label: "United Nations Security Council", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: ["UNSC","UN Security Council","U.N. Security Council","U.N.S.C"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q41644', label: "Warsaw Pact", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: ["Warsaw Treaty Organization"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings (see also)\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7801', label: "International Court of Justice", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: ["The Hague International Court"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q47488', label: "International Criminal Court", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: ["ICCt","ICC in The Hague"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Law enforcement cooperation\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q81299', label: "Organization for Security and Co-operation in Europe", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: ["OSCE","Organization for Security and Cooperation in Europe","Organisation for Security and Cooperation in Europe","Organisation for Security and Co-operation in Europe"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q83201', label: "Non-Aligned Movement", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP","IGO"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q163931', label: "Communist International", type: 'organisation', tier: 1, list: 'organisations', refs: ["GWP"],
    aliases: ["Third International","Comintern"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q133207', label: "Muslim Brotherhood", type: 'party', tier: 1, list: 'organisations', refs: ["MEM"],
    aliases: ["Society of Muslim Brothers"],
    tags: [],
    untagged: "its only reference is MEM (the review: \"the Muslim Brotherhood (MEM)\"): IGO does not name it (read 26 Nov 2026), nor does any other reference read, so it gives no mention of the list and has no entry until a module mentions it or a reference is found; no reference gives it a tag" },
  { q: 'Q191384', label: "International Bank for Reconstruction and Development", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["IBRD"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q656801', label: "International Finance Corporation", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q1043527', label: "Multilateral Investment Guarantee Agency", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["MIGA"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q827525', label: "International Development Association", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q899770', label: "International Centre for Settlement of Investment Disputes", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["ICSID"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q8475', label: "Interpol", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["International Criminal Police Organization","International Police Organization","International Criminal Police Commission"],
    tags: [
      ["Field", "Law enforcement", "IGO, section \"Law enforcement cooperation\" (see also: Law enforcement agency)"]
    ] },
  { q: 'Q842490', label: "Organisation for the Prohibition of Chemical Weapons", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["OPCW","Organization for the Prohibition of Chemical Weapons"],
    tags: [
      ["Field", "Arms control", "IGO, section \"Arms control\" (its main article: Arms control)"]
    ] },
  { q: 'Q7809', label: "UNESCO", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["United Nations Educational, Scientific and Cultural Organization"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q294278', label: "Organisation of African, Caribbean and Pacific States", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["ACP states","African, Caribbean, and Pacific Group of States","ACP Group","ACP States","ACP Countries","African, Caribbean and Pacific Group","Group of African, Caribbean and Pacific countries","ACP countries","African, Caribbean and Pacific Group of States","OACPS"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q340195', label: "African Development Bank", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["AfDB","African Development Bank Group"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q862603', label: "International Democracy Union", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: ["International Democrat Union"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q47543', label: "Organisation of Islamic Cooperation", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["Organization of Islamic Cooperation"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Cultural, ethnic, linguistic, and religious organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7248622', label: "Progressive Alliance", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q188822', label: "Asian Development Bank", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q220945', label: "Party of European Socialists", type: 'party', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q25079', label: "Alliance of Liberals and Democrats for Europe Party", type: 'party', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["ELDR","European liberal democrat and reform party","European Liberal Democrat & Reform Party","ALDE Party","Party of European Liberal Democrats","European Liberal Democratic and Reform Party"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q8908', label: "Council of Europe", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Europe\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q159454', label: "Socialist International", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings (see also)\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q17495', label: "Universal Postal Union", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q496967', label: "Alliance of Small Island States", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["AOSIS"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q128064', label: "Centrist Democrat International", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q41550', label: "Organization for Economic Cooperation and Development", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["OECD","Organisation for Economic Co-operation and Development"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q3369762', label: "Agency for the Prohibition of Nuclear Weapons in Latin America and the Caribbean", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["OPANAL"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q376150', label: "International Telecommunication Union", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["International Telegraph Union"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q233611', label: "International Hydrographic Organization", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["IHO","International Hydrographic Bureau","IHB"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Maritime organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q703593', label: "Labour and Socialist International", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q782942', label: "Australia Group", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [
      ["Field", "Arms control", "IGO, section \"Arms control\" (its main article: Arms control)"]
    ] },
  { q: 'Q7886981', label: "ASEAN Regional Forum", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q3772571', label: "Caribbean Development Bank", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q663492', label: "Eurocontrol", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["European Organisation for the Safety of Air Navigation"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Europe\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q1137381', label: "Arab Fund for Economic and Social Development", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["AFESD"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q624307', label: "Arab Monetary Fund", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q170481', label: "Asia-Pacific Economic Cooperation", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["APEC"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Asia\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q42262', label: "European Space Agency", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Europe\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q212712', label: "Liberal International", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["Liberal World Union"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q170424', label: "World Meteorological Organization", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["WMO"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q4783148', label: "Arab Bank for Economic Development in Africa", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["BADEA","B.A.D.E.A.","A.B.E.D.I.A.","ABEDIA","Banque arabe de développement économique en Afrique","Banque arabe pour le développement économique en Afrique"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q2029901', label: "OHADA", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["Organisation for the Harmonization of Corporate Law in Africa"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7817', label: "World Health Organization", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["World Health Organisation"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"United Nations and agencies\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q5611262', label: "Group on Earth Observations", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q205995', label: "Caribbean Community", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["CARICOM"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Americas\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q151991', label: "European Southern Observatory", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["European Organisation for Astronomical Research in the Southern Hemisphere"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Europe\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q380340', label: "Organization of the Black Sea Economic Cooperation", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["Black Sea Economic Cooperation Zone","BSEC"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q4230', label: "Union of South American Nations", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["South American Union of Nations","USAN","Comunidad Sudamericana de Naciones","South American Community of Nations","SACN","Unasul","UNASUR","União de Nações Sul-Americanas"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Americas\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q789769', label: "Council of the Baltic Sea States", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Europe\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q190008', label: "Central American Bank for Economic Integration", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["CABEI"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Americas\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q605326', label: "World Customs Organization", type: 'organisation', tier: null, list: 'organisations', refs: ["IGO","F5"],
    aliases: ["WCO","Customs Co-Operation Council","Customs Cooperation Council"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Financial, trade, and customs organizations\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q939743', label: "Parliamentary Assembly of the Council of Europe", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q842008', label: "Politburo of the Central Committee of the Communist Party of the Soviet Union", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: ["Politburo of the Communist Party of the Soviet Union"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q1125994', label: "Congressional Progressive Caucus", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q688638', label: "Mont Pelerin Society", type: 'organisation', tier: null, list: 'organisations', refs: ["F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q191582', label: "COMECON", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["Council for Mutual Economic Assistance","Comecon","CMEA"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Defunct\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q43056', label: "Axis Powers", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: ["Axis powers","Rome–Berlin Axis","Rome–Berlin–Tokyo Axis"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q4264', label: "Mercosur", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["Southern Cone Common Market"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Americas\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q183725', label: "International Workingmen's Association", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["First International"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings (see also)\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q193235', label: "Delian League", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Defunct\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q7779', label: "Commonwealth of Independent States", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q41984', label: "International Atomic Energy Agency", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["IAEA"],
    tags: [
      ["Field", "Nuclear power", "IGO, section \"Energy organizations\", subsection \"Nuclear power organizations\" (its main article: Nuclear power)"]
    ] },
  { q: 'Q177859', label: "Triple Entente", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q42908', label: "Hanseatic League", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q277252', label: "Southeast Asia Treaty Organization", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["SEATO"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Defunct\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q318693', label: "Collective Security Treaty Organization", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["CSTO","ODKB"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Transcontinental\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q188592', label: "Second International", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Ideological and political groupings (see also)\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q42970', label: "Amnesty International", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q154640', label: "Holy Alliance", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","MEM","F5"],
    aliases: [],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); the references give only the item itself; its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q193272', label: "Economic Community of West African States", type: 'organisation', tier: 2, list: 'organisations', refs: ["GWP","IGO","MEM","F5"],
    aliases: ["ECOWAS","Communauté économique des États de l'Afrique de l'Ouest","CEDEAO"],
    tags: [],
    untagged: "no reference read gives it a value in a group the lake has (School, Ideology, Field, Theory, Occupation, Role); IGO gives only its kind (\"Regional organizations: Africa\"), and a kind is the entry's Type, not a tag (thinkers.mjs); its Ideology and Member of come from Wikidata (P1142, P463) in the build, with no hand tag" },
  { q: 'Q458', label: "European Union", held: true, type: 'organisation', tier: 1, list: 'organisations', refs: ["VA3","IGO","MEM"],
    tags: [],
    untagged: "nothing to add. Its type is right today (\"Organisation\"); its ideologies come from Wikidata P1142 (0 tags); no reference read (the review gives MEM for the parties, VA3 and IGO for the European Union) names a school, a field or a theory for it, and a kind or a parent has no group in the lake" },
  { q: 'Q79854', label: "Communist Party of the Soviet Union", held: true, type: 'party', tier: 1, list: 'organisations', refs: ["MEM"],
    tags: [],
    untagged: "nothing to add. Its type is right today (\"Political party\"); its ideologies come from Wikidata P1142 (15 tags); no reference read (the review gives MEM for the parties, VA3 and IGO for the European Union) names a school, a field or a theory for it, and a kind or a parent has no group in the lake" },
  { q: 'Q17427', label: "Chinese Communist Party", held: true, type: 'party', tier: 1, list: 'organisations', refs: ["MEM"],
    tags: [],
    untagged: "nothing to add. Its type is right today (\"Political party\"); its ideologies come from Wikidata P1142 (8 tags); no reference read (the review gives MEM for the parties, VA3 and IGO for the European Union) names a school, a field or a theory for it, and a kind or a parent has no group in the lake" },
  { q: 'Q7320', label: "Nazi Party", held: true, type: 'party', tier: 1, list: 'organisations', refs: ["MEM"],
    tags: [],
    untagged: "nothing to add. Its type is right today (\"Political party\"); its ideologies come from Wikidata P1142 (10 tags); no reference read (the review gives MEM for the parties, VA3 and IGO for the European Union) names a school, a field or a theory for it, and a kind or a parent has no group in the lake" },
  { q: 'Q139596', label: "National Fascist Party", held: true, type: 'party', tier: 1, list: 'organisations', refs: ["MEM"],
    tags: [],
    untagged: "nothing to add. Its type is right today (\"Political party\"); its ideologies come from Wikidata P1142 (9 tags); no reference read (the review gives MEM for the parties, VA3 and IGO for the European Union) names a school, a field or a theory for it, and a kind or a parent has no group in the lake" },
  // ---- Tier 1 events (review C5)
  { q: 'Q12562', label: "Protestant Reformation", type: 'event', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: ["Reformation"],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Early modern > Europe > Basics)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q2487', label: "Thirty Years' War", type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["30 Years War"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Thirty Years' War\" (Early modern > Europe > Basics): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q150995', label: "Peace of Westph", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Peace of Westphalia","Treaty of Westphalia"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Early modern > Europe > Basics)); the title names no kind the calendars' Event type values hold (a conference, a congress or a peace has no value of its own; see the notes), and no new value or group is added" },
  { q: 'Q192769', label: "American Revolution", type: 'event', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Early modern > Americas)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q689128', label: "Haitian Revolution", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA4H (Early modern > Americas)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q2269', label: "Industrial Revolution", type: 'period', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Modern > Modern: General)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q46362', label: "Congress of Vienna", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Basics)); the title names no kind the calendars' Event type values hold (a conference, a congress or a peace has no value of its own; see the notes), and no new value or group is added" },
  { q: 'Q3588', label: "European Revolutions of 1848", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Revolutions of 1848","1848 revolutions","Spring of Nations","Springtime of the Nations","Springtime of the peoples","Springtime of the people","European Revolution of 1848"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Basics)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q8676', label: "American Civil War", type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["War Between the States","U.S. Civil War","US Civil War","United States Civil War","War of the Rebellion","War of Northern Aggression"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"American Civil War\" (Modern > Americas > North America): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q154705', label: "unification of Germany", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Unification of Germany","Prussian unification of Germany"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Western Europe)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q51122', label: "Unification of Italy", type: 'period', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Risorgimento","Italian Risorgimento"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Western Europe)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q8707', label: "Meiji Restoration", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Meijiishin","Goisshin","Meiji reform"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Asia > East Asia)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q179848', label: "Scramble for Africa", type: 'event', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: ["Partition of Africa"],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Modern > Africa)); the title names no kind the calendars' Event type values hold (no value fits), and no new value or group is added" },
  { q: 'Q8736', label: "Treaty of Versailles", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Treaty of Versailles of 1919","Peace treaty of Versailles","Treaty of Versailles, June 28, 1919"],
    tags: [
      ["Event type", "Treaty", "VA4H, entry \"Treaty of Versailles\" (Modern > Europe > Basics): the entry's title names it a treaty, which the calendars file as \"Treaty\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q8698', label: "Great Depression", type: 'period', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Modern > Modern: General)); the title names no kind the calendars' Event type values hold (no value fits), and no new value or group is added" },
  { q: 'Q161227', label: "Yalta Conference", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Crimea Conference","Argonaut Conference"],
    tags: [
      ["Conflict", "World War II", "VA4H, Modern > World War II: \"Yalta Conference\" is listed under the entry \"World War II\" (Q362 in the lake). (a hand-made value: the Conflict group is otherwise filled from Wikidata P607)"]
    ] },
  { q: 'Q230533', label: "decolonization", type: 'topic', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    aliases: [],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Modern > Modern: General)); the title names no kind the calendars' Event type values hold (no value fits), and no new value or group is added" },
  { q: 'Q126065', label: "Iranian Revolution", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Islamic Revolution of Iran","1979 Iranian Revolution"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Asia > Central Asia and Iran)); the title names no kind the calendars' Event type values hold (a revolution, a restoration, a reformation or a unification has no value), and no new value or group is added" },
  { q: 'Q10806', label: "September 11 attacks", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["11 September Attacks","September 11th Attacks","September 11, 2001 terrorist attacks"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Americas > North America)); the title names no kind the calendars' Event type values hold (an attack has no value), and no new value or group is added" },
  { q: 'Q185729', label: "War on Terrorism", type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["War on Terror","Global War on Terrorism","GWOT"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"War on terror\" (Modern > Modern: General): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q896666', label: "2007–2008 financial crisis", type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Global Financial Crisis","GFC","Panic of 2008"],
    tags: [
      ["Event type", "Crisis", "VA4H, entry \"2008 financial crisis\" (Modern > Modern: General): the entry's title names it a crisis, which the calendars file as \"Crisis\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q8669', label: "Arab–Israeli conflict", type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    aliases: ["Arab-Israeli conflict","Arab–Israeli conflicts","Arab–Israeli wars"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Arab–Israeli conflict\" (Modern > Asia > West Asia): the entry's title names it a conflict, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q2763', label: "The Holocaust", type: 'event', tier: 1, list: 'events', refs: ["VA4H","MEM"],
    aliases: ["Holocaust","Shoah","HaShoah"],
    tags: [
      ["Conflict", "World War II", "VA4H, Modern > World War II: \"The Holocaust\" is listed under the entry \"World War II\" (Q362 in the lake). (a hand-made value: the Conflict group is otherwise filled from Wikidata P607)"]
    ] },
  { q: 'Q188532', label: "Bretton Woods system", type: 'event', tier: 1, list: 'events', refs: ["IGO","MEM"],
    aliases: ["Bretton Woods Agreements","Bretton Woods monetary system"],
    tags: [],
    untagged: "the review has it from memory (MEM); VA3 and VA4H do not list it (read 26 Nov 2026), and IGO names it only in a \"See also\" under its financial organisations (\"Bretton Woods system\", read 26 Nov 2026), which gives it no kind or group, so no reference gives a tag" },
  { q: 'Q6534', label: "French Revolution", held: true, type: 'event', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    tags: [],
    untagged: "the references list it by name only (VA3 (History > Modern history); VA4H (Early modern > Europe > Western Europe)); the title names no kind the Event type values hold (a revolution has no value), and no new value or group is added" },
  { q: 'Q78994', label: "Napoleonic Wars", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Napoleonic Wars\" (Modern > Europe > Western Europe): the entry's title names it as wars, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q361', label: "World War I", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"World War I\" (Modern > World War I): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q8729', label: "Russian Revolution", held: true, type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Eastern Europe)); the title names no kind the Event type values hold (a revolution has no value), and no new value or group is added" },
  { q: 'Q10859', label: "Spanish Civil War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Spanish Civil War\" (Modern > Europe > Western Europe): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q362', label: "World War II", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"World War II\" (Modern > World War II): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q129053', label: "partition of India", held: true, type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Asia > South Asia (listed under British Raj))); the title names no kind the Event type values hold (a partition has no value), and no new value or group is added" },
  { q: 'Q179975', label: "Chinese Civil War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Chinese Civil War\" (Modern > Asia > East Asia): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q8683', label: "Cold War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA3","VA4H"],
    tags: [],
    untagged: "its title has the word \"war\", but the rule that reads a title's \"war\" as the calendars' \"War or battle\" does not fit a rivalry in which the two powers fought no war with each other; VA4H lists it under Modern: General, beside periods and processes, not as a war. Left for the owner" },
  { q: 'Q8663', label: "Korean War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Korean War\" (Modern > Asia > East Asia): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q128160', label: "Cuban Missile Crisis", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "Crisis", "VA4H, entry \"Cuban Missile Crisis\" (Modern > Americas > North America): the entry's title names it a crisis, which the calendars file as \"Crisis\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q8740', label: "Vietnam War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Vietnam War\" (Modern > Asia > Southeast Asia): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  { q: 'Q382861', label: "Revolutions of 1989", held: true, type: 'event', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [],
    untagged: "the references list it by name only (VA4H (Modern > Europe > Eastern Europe)); the title names no kind the Event type values hold (a revolution has no value), and no new value or group is added" },
  { q: 'Q545449', label: "Iraq War", held: true, type: 'conflict', tier: 1, list: 'events', refs: ["VA4H"],
    tags: [
      ["Event type", "War or battle", "VA4H, entry \"Iraq War\" (Modern > Asia > West Asia): the entry's title names it a war, which the calendars file as \"War or battle\" (lake/scripts/adapters.mjs EVENT_TYPE)"]
    ] },
  // ---- Tier 1 individuals (review C6)
  { q: 'Q9294', label: "Ibn Khaldun", type: 'person', tier: 1, list: 'individuals', refs: ["VA3"],
    aliases: ["Ibn Khaldūn"],
    tags: [],
    untagged: "VA3 lists him; the SEP has no entry for him (contents read 26 Nov 2026, and entries/ibn-khaldun answers 404), so it is not among his references; no other reference read names a school, ideology or theory for him. Wikidata gives no movement or ideology." },
  { q: 'Q101638', label: "Mary Wollstonecraft", type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP"],
    aliases: [],
    tags: [
      ["Ideology", "Feminism", "SEP, entry \"Mary Wollstonecraft\" (https://plato.stanford.edu/entries/wollstonecraft/), opening: her \"substantial contribution to feminism\"; §on reception: \"heralded her as the first English feminist\", read 25 Nov 2026"]
    ] },
  { q: 'Q140694', label: "Alexis de Tocqueville", type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    aliases: ["Alexis-Charles-Henri Clerel de Tocqueville","Alexis Clérel de Tocqueville","Alexis Charles Henri Clérel, comte de Tocqueville"],
    tags: [],
    untagged: "VA3 does not list him and the SEP has no entry for him (both read 26 Nov 2026; entries/tocqueville answers 404). The SEP names him in passing, as it names Alexander and Caesar below: its entry \"Conservatism\" (https://plato.stanford.edu/entries/conservatism/, read 26 Nov 2026) has \"De Tocqueville (1805–59) was probably the most Burkean among 19th century Continental conservatives in his condemnation of the French Revolution\", and he is so a mention of the list by the SEP alone. That comparison with Burke is not taken for Ideology:Conservatism, which no other reference gives him; no reference read places him in a school." },
  { q: 'Q60025', label: "Hannah Arendt", type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    aliases: ["Hanna Arendt","Johanna Arendt","Hannah Arendt Blücher"],
    tags: [
      ["Field", "Political philosophy", "SEP, entry \"Hannah Arendt\" (https://plato.stanford.edu/entries/arendt/), opening: \"one of the most influential political philosophers of the twentieth century\", read 25 Nov 2026"]
    ] },
  { q: 'Q77148', label: "Carl Schmitt", type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    aliases: [],
    tags: [
      ["Ideology", "Conservatism", "SEP, entry \"Carl Schmitt\" (https://plato.stanford.edu/entries/schmitt/), opening: \"a conservative German legal, constitutional, and political theorist\", read 25 Nov 2026"],
      ["Theory", "Friend–enemy distinction", "SEP, entry \"Carl Schmitt\" (https://plato.stanford.edu/entries/schmitt/), opening: The Concept of the Political holds \"that all true politics is based on the distinction between friend and enemy\", read 25 Nov 2026"]
    ] },
  { q: 'Q188181', label: "Hedley Bull", type: 'person', tier: 1, list: 'individuals', refs: ["IRT","RIR","ES"],
    aliases: ["Hedley Norman Bull"],
    tags: [
      ["School", "English School", "ES, section \"Internal divisions\" (https://en.wikipedia.org/wiki/English_school_of_international_relations_theory), read 25 Nov 2026; IRT, section \"English school\" (https://en.wikipedia.org/wiki/International_relations_theory), read 25 Nov 2026; RIR, section \"Liberal realism or the English school of rationalism\", list of prominent liberal realists (https://en.wikipedia.org/wiki/Realism_(international_relations)), read 25 Nov 2026"],
      ["Field", "International relations", "IRT, section \"English school\" (https://en.wikipedia.org/wiki/International_relations_theory), read 25 Nov 2026"]
    ] },
  { q: 'Q37151', label: "Sun Tzu", type: 'person', tier: 1, list: 'individuals', refs: ["OPS","SS","GEO"],
    aliases: ["Suentzyy","Suen Tzyy"],
    tags: [
      ["Field", "Strategic studies", "SS, opening section (https://en.wikipedia.org/wiki/Strategic_studies), read 25 Nov 2026; OPS, section \"Influential literature\" (https://en.wikipedia.org/wiki/Outline_of_political_science), read 25 Nov 2026"]
    ] },
  { q: 'Q76430', label: "Carl von Clausewitz", type: 'person', tier: 1, list: 'individuals', refs: ["OPS","RIR","SS","GEO"],
    aliases: ["Carl Philipp Gottlieb von Clausewitz"],
    tags: [
      ["School", "Realism", "RIR, opening section (https://en.wikipedia.org/wiki/Realism_(international_relations)), read 25 Nov 2026"],
      ["Field", "Strategic studies", "SS, opening section (https://en.wikipedia.org/wiki/Strategic_studies), read 25 Nov 2026; OPS, section \"Influential literature\" (https://en.wikipedia.org/wiki/Outline_of_political_science), read 25 Nov 2026"]
    ] },
  { q: 'Q142988', label: "Alfred Thayer Maan", type: 'person', tier: 1, list: 'individuals', refs: ["SS","GEO"],
    aliases: ["Alfred Thayer Mahan","A. T. Mahan","Alfred Mahan","Alfred T. Mahan","Admiral Alfred Thayer Mahan"],
    tags: [
      ["Field", "Geopolitics", "GEO, section \"Alfred Thayer Mahan and sea power\" (https://en.wikipedia.org/wiki/Geopolitics), read 25 Nov 2026"],
      ["Field", "Strategic studies", "SS, opening section (https://en.wikipedia.org/wiki/Strategic_studies), read 25 Nov 2026"],
      ["Theory", "Sea power", "GEO, section \"Alfred Thayer Mahan and sea power\" (https://en.wikipedia.org/wiki/Geopolitics), read 25 Nov 2026"]
    ] },
  { q: 'Q299938', label: "Halford Mackinder", type: 'person', tier: 1, list: 'individuals', refs: ["SS","GEO"],
    aliases: ["Halford John Mackinder","Sir Halford John Mackinder","Halford J. Mackinder","H. J. MacKinder"],
    tags: [
      ["Field", "Geopolitics", "GEO, section \"Mackinder and the Heartland Theory\" (https://en.wikipedia.org/wiki/Geopolitics), read 25 Nov 2026"],
      ["Theory", "Heartland theory", "GEO, section \"Mackinder and the Heartland Theory\" (https://en.wikipedia.org/wiki/Geopolitics), read 25 Nov 2026"]
    ] },
  { q: 'Q517', label: "Napoleon", type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEPR"],
    aliases: ["Napoleon Bonaparte","Napoleone di Buonaparte","Napoleon I of France","Napoleone Bonaparte","Napoleon Buonaparte","Napulione Buonaparte","Napulione di Buonaparte"],
    tags: [],
    untagged: "VA3 lists him as a leader; SEPR names him only inside a quotation from Aron; no reference read gives a school or ideology." },
  { q: 'Q23', label: "George Washington", type: 'person', tier: 1, list: 'individuals', refs: ["VA3","RIR"],
    aliases: ["Father of the United States","American Cincinnatus","American Fabius"],
    tags: [],
    untagged: "VA3 lists him as a leader; RIR speaks of \"the Founding Fathers' realist school\" but names no Founding Father, so no tag." },
  { q: 'Q91', label: "Abraham Lincoln", type: 'person', tier: 1, list: 'individuals', refs: ["VA3"],
    aliases: ["President Lincoln"],
    tags: [],
    untagged: "VA3 lists him as a leader; no reference read names him." },
  { q: 'Q8023', label: "Nelson Mandela", type: 'person', tier: 1, list: 'individuals', refs: ["VA3"],
    aliases: ["Nelson Rolihlahla Mandela"],
    tags: [],
    untagged: "VA3 lists him as a leader; no reference read names him." },
  { q: 'Q8442', label: "Otto von Bismarck", type: 'person', tier: 1, list: 'individuals', refs: ["IRT","MEM"],
    aliases: ["Otto Eduard Leopold von Bismarck-Schönhausen","Otto Eduard Leopold, Prince of Bismarck, Duke of Lauenburg","Eduard Leopold, Prince von Bismarck-Schönhausen","Otto Bismark"],
    tags: [],
    untagged: "IRT names him only in calling Realpolitik \"a term associated with Otto von Bismarck\" (§ Psychological approaches, read 26 Nov 2026), which is not his ideology, and RIR says Realpolitik is no ideology but \"an older prescriptive guideline limited to policy-making\" (§ Overview, read 26 Nov 2026); no reference read places him in a school or ideology. A Realpolitik entry is Tier 2 (the review's B1, OPS), the owner's to decide (F9)" },
  { q: 'Q34296', label: "Woodrow Wilson", type: 'person', tier: 1, list: 'individuals', refs: ["IRT","RIR","MEM"],
    aliases: ["Thomas Woodrow Wilson","T. Woodrow Wilson","President Wilson"],
    tags: [
      ["School", "Idealism in international relations", "IRT, section \"Liberalism\" (https://en.wikipedia.org/wiki/International_relations_theory), read 25 Nov 2026: idealism, \"also called 'Wilsonianism' because of its association with Woodrow Wilson\""],
      ["Ideology", "Liberal internationalism", "RIR, opening section (https://en.wikipedia.org/wiki/Realism_(international_relations)), read 25 Nov 2026: \"liberal internationalists like U.S. President Woodrow Wilson\""]
    ] },
  { q: 'Q4604', label: "Confucius", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP"],
    tags: [
      ["School", "Confucianism", "SEP, entry \"Confucius\" (https://plato.stanford.edu/entries/confucius/), opening: the Ru tradition, \"routinely translated into English as 'Confucian'\", and the \"schools of interpretation linked to his name\", read 25 Nov 2026"]
    ] },
  { q: 'Q859', label: "Plato", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP","OPS"],
    tags: [
      ["Field", "Political theory", "SEP, entry \"Aristotle's Political Theory\" (https://plato.stanford.edu/entries/aristotle-politics/), opening: \"Along with his teacher Plato, Aristotle is generally regarded as one of the most influential ancient thinkers in a number of philosophical fields, including political theory\", read 26 Nov 2026 (OPS's \"Influential literature\" lists The Republic and Laws, and names no field)"]
    ] },
  { q: 'Q868', label: "Aristotle", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP","OPS"],
    tags: [
      ["Field", "Political theory", "SEP, entry \"Aristotle's Political Theory\" (https://plato.stanford.edu/entries/aristotle-politics/), opening: \"Along with his teacher Plato, Aristotle is generally regarded as one of the most influential ancient thinkers in a number of philosophical fields, including political theory\", read 26 Nov 2026 (OPS's \"Influential literature\" lists The Politics, and names no field)"]
    ] },
  { q: 'Q9438', label: "Thomas Aquinas", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    tags: [
      ["Theory", "Natural law", "SEP, entry \"Aquinas' Moral, Political, and Legal Philosophy\" (https://plato.stanford.edu/entries/aquinas-moral-political/), \"Aquinas' theory of natural law\", read 25 Nov 2026"],
      ["Field", "Political philosophy", "SEP, entry \"Aquinas' Moral, Political, and Legal Philosophy\" (https://plato.stanford.edu/entries/aquinas-moral-political/), the entry's title and opening, read 25 Nov 2026"]
    ] },
  { q: 'Q9353', label: "John Locke", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP"],
    tags: [
      ["Ideology", "Liberalism", "SEP, entry \"Liberalism\" (https://plato.stanford.edu/entries/liberalism/), \"Paradigmatic liberals such as Locke\", read 25 Nov 2026"],
      ["Theory", "Social contract", "SEP, entry \"Contractarianism\" (https://plato.stanford.edu/entries/contractarianism/), §1: \"Social contract theorists from the history of political thought include Hobbes, Locke, Kant, and Rousseau\", read 25 Nov 2026; SEP, entry \"Locke's Political Philosophy\" (https://plato.stanford.edu/entries/locke-political/), opening: government \"as the result of a social contract\", read 25 Nov 2026"]
    ] },
  { q: 'Q15975', label: "Montesquieu", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP","OPS"],
    tags: [
      ["Theory", "Separation of powers", "SEP, entry \"Montesquieu\" (https://plato.stanford.edu/entries/montesquieu/), opening: \"This theory of the separation of powers\", read 25 Nov 2026; OPS, entry \"separation of powers\" (https://en.wikipedia.org/wiki/Outline_of_political_science), read 25 Nov 2026"],
      ["Ideology", "Republicanism", "SEP, entry \"Republicanism\" (https://plato.stanford.edu/entries/republicanism/), §1, read 25 Nov 2026: the tradition includes \"Montesquieu and Blackstone\""],
      ["Ideology", "Classical liberalism", "SEP, entry \"Republicanism\" (https://plato.stanford.edu/entries/republicanism/), §1, read 25 Nov 2026: figures \"central to both traditions\" of classical republicanism and classical liberalism, \"Montesquieu, for example\""],
      ["Field", "Political philosophy", "SEP, entry \"Montesquieu\" (https://plato.stanford.edu/entries/montesquieu/), opening: \"one of the great political philosophers of the Enlightenment\", read 25 Nov 2026"]
    ] },
  { q: 'Q6527', label: "Jean-Jacques Rousseau", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP","RIR"],
    tags: [
      ["School", "Realism", "RIR, opening section (https://en.wikipedia.org/wiki/Realism_(international_relations)), read 25 Nov 2026: \"Early popular proponents of realism included Thucydides ..., Machiavelli ..., Hobbes ..., and Rousseau\""],
      ["Theory", "Social contract", "SEP, entry \"Contractarianism\" (https://plato.stanford.edu/entries/contractarianism/), §1: \"Social contract theorists from the history of political thought include Hobbes, Locke, Kant, and Rousseau\", read 25 Nov 2026"],
      ["Field", "Political philosophy", "SEP, entry \"Jean Jacques Rousseau\" (https://plato.stanford.edu/entries/rousseau/), opening: \"his contributions to political philosophy\", read 25 Nov 2026"]
    ] },
  { q: 'Q9312', label: "Immanuel Kant", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP","IRT","ES"],
    tags: [
      ["School", "Revolutionism (Kantian tradition)", "ES, section \"Reexamination of traditional approaches\" (Wight's three traditions) (https://en.wikipedia.org/wiki/English_school_of_international_relations_theory), read 25 Nov 2026: \"Revolutionist (or Kantian, after Immanuel Kant)\"; IRT, section \"English school\" (https://en.wikipedia.org/wiki/International_relations_theory), read 25 Nov 2026"],
      ["Ideology", "Cosmopolitanism", "SEP, entry \"Cosmopolitanism\" (https://plato.stanford.edu/entries/cosmopolitanism/), \"According to Kant, all rational beings are members in a single moral community\", read 25 Nov 2026"],
      ["Theory", "Social contract", "SEP, entry \"Contractarianism\" (https://plato.stanford.edu/entries/contractarianism/), §1: \"Social contract theorists from the history of political thought include Hobbes, Locke, Kant, and Rousseau\", read 25 Nov 2026; SEP, entry \"Kant's Social and Political Philosophy\" (https://plato.stanford.edu/entries/kant-social-political/), \"elements of both the natural law approach and social contract theory\", read 25 Nov 2026"],
      ["Field", "Political philosophy", "SEP, entry \"Kant's Social and Political Philosophy\" (https://plato.stanford.edu/entries/kant-social-political/), opening, read 25 Nov 2026"]
    ] },
  { q: 'Q9387', label: "Max Weber", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    tags: [
      ["School", "Realism", "SEP, entry \"Max Weber\" (https://plato.stanford.edu/entries/weber/), opening: \"a unique strand of political realism comparable to that of Machiavelli and Hobbes\", read 25 Nov 2026"]
    ] },
  { q: 'Q154959', label: "Hugo Grotius", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP","IRT","ES"],
    tags: [
      ["School", "Rationalism (Grotian tradition)", "ES, section \"Reexamination of traditional approaches\" (Wight's three traditions) (https://en.wikipedia.org/wiki/English_school_of_international_relations_theory), read 25 Nov 2026: \"Rationalist (or Grotian, after Hugo Grotius)\"; IRT, section \"English school\" (https://en.wikipedia.org/wiki/International_relations_theory), read 25 Nov 2026"],
      ["Theory", "Natural law", "SEP, entry \"Hugo Grotius\" (https://plato.stanford.edu/entries/grotius/), opening: \"best known ... for his contributions to the natural law theories\", read 25 Nov 2026"]
    ] },
  { q: 'Q37621', label: "Thomas Hobbes", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    tags: [
      ["Theory", "Social contract", "SEP, entry \"Contractarianism\" (https://plato.stanford.edu/entries/contractarianism/), §1: \"Social contract theorists from the history of political thought include Hobbes, Locke, Kant, and Rousseau\", read 25 Nov 2026"]
    ] },
  { q: 'Q9235', label: "Georg Wilhelm Friedrich Hegel", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["SEP"],
    tags: [],
    untagged: "already carries Field:Political philosophy and Movement:German idealism and Hegelianism from Wikidata; SEP \"Hegel\" confirms German idealism and his political philosophy, and names no school beyond them." },
  { q: 'Q8409', label: "Alexander the Great", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP"],
    tags: [],
    untagged: "VA3 lists him as a leader; SEP (Aristotle, Cosmopolitanism) mentions him only in passing; no school or ideology." },
  { q: 'Q1048', label: "Julius Caesar", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3","SEP"],
    tags: [],
    untagged: "VA3 lists him as a leader; SEP \"Cosmopolitanism\" mentions Caesar only in passing; no school or ideology." },
  { q: 'Q1001', label: "Mahatma Gandhi", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["VA3"],
    tags: [],
    untagged: "VA3 lists him; no reference read names him; Wikidata already gives Ideology:Gandhism and Movement:Nonviolence." },
  { q: 'Q8016', label: "Winston Churchill", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["MEM"],
    tags: [],
    untagged: "the review has him from memory (MEM); no reference read names him." },
  { q: 'Q30487', label: "Mikhail Gorbachev", held: true, type: 'person', tier: 1, list: 'individuals', refs: ["MEM"],
    tags: [],
    untagged: "the review has him from memory (MEM); no reference read names him; Wikidata already gives Ideology:Marxism–Leninism and Social democracy." },
];

/** The type the lake gives an item whose Wikidata classes typeOf reads otherwise today (types.mjs reads this first),
    each with the list's reason, as read on 25 November 2026. An item leaves this list once its classes type it right. */
export const CANON_TYPES = {
  Q1326430: { type: 'idea', why: "Wikidata P31 Q147027 \"thought experiment\" and Q33104069 \"political concept\", neither in types.mjs IDEA, so typeOf gives \"topic\" today. It is a concept of political theory (OPS, SEP), so the lake should type it \"idea\": add Q33104069 \"political concept\" to IDEA (which also types separation of powers) or give TYPE_OVERRIDES Q1326430: \"idea\"." },
  Q42008: { type: 'idea', why: "Wikidata gives it no P31 at all (P279 only: Q174834 authority, Q2101636 political power), so typeOf gives \"topic\" today. It is a concept of political theory (OPS; SEP: \"a modern notion of political authority\"), so the lake should type it \"idea\" by TYPE_OVERRIDES Q42008: \"idea\"." },
  Q8458: { type: 'idea', why: "Wikidata P31 Q367293 \"convention\", Q49773 \"social movement\", Q129510955 \"type of value\", Q11862829 \"academic discipline\": none in a types.mjs class set, so typeOf gives \"topic\" today. SEP treats it as a subject of political and legal philosophy, so the lake should type it \"idea\" by TYPE_OVERRIDES Q8458: \"idea\"." },
  Q44918: { type: 'idea', why: "Wikidata P31 Q1192543 \"legal doctrine\"; types.mjs IDEA has Q117850 \"doctrine\" but not this class, so typeOf gives \"topic\" today. The lake should type it \"idea\": add Q1192543 to IDEA or give TYPE_OVERRIDES Q44918: \"idea\". Not Q7378937, also labelled \"rule of law\": that item is a principle of French law (P31 \"general principles of French law\"), with no English Wikipedia article." },
  Q79896: { type: 'idea', why: "Wikidata P31 Q33104069 \"political concept\", Q29430681 \"triad\", Q29428403 \"pentad\": none in types.mjs IDEA, so typeOf gives \"topic\" today (its P279 Q179805 \"political philosophy\" is an IDEA class, but typeOf reads P31 only). The lake should type it \"idea\": add Q33104069 to IDEA (as for social contract) or give TYPE_OVERRIDES Q79896: \"idea\"." },
  Q1125082: { type: 'idea', why: "Wikidata P31 Q151885 \"concept\" and Q111796904 \"type of equilibrium\" (P279 Q166542 international relations): none in a types.mjs class set, so typeOf gives \"topic\" today. Its Wikidata description calls it an \"idea\"; the lake should type it \"idea\" by TYPE_OVERRIDES Q1125082: \"idea\" (adding Q151885 \"concept\" to IDEA would be far too wide)." },
  Q1472670: { type: 'idea', why: "Wikidata P31 Q3026787 \"saying\" (P279 Q8036664 world order): typeOf gives \"topic\" today. MI-11 needs it as a tagged object for reading suggestions, and its description is a period of \"dramatic change in world political thought and the balance of power\", so the lake should type it \"idea\" by TYPE_OVERRIDES Q1472670: \"idea\". Kept apart from Q926348 \"New World Order\" (the conspiracy theory: P31 Q159535 conspiracy theory, English Wikipedia \"New World Order conspiracy theory\"), which is not to be made." },
  Q1186378: { type: 'idea', why: "typeOf gives topic today: its classes (theory of democracy Q1186090, political theory Q9357091) are not in IDEA; needs political theory (Q9357091) in IDEA or a TYPE_OVERRIDES row" },
  Q2745901: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q1342733: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q6778656: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q1061896: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q5186732: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q3092681: { type: 'idea', why: "typeOf gives topic today: its Wikidata class is international relations theory (Q1785609), which types.mjs IDEA does not hold; needs Q1785609 in IDEA" },
  Q674530: { type: 'idea', why: "typeOf gives topic today (class academic discipline Q11862829, subclass of theory Q17737); needs a TYPE_OVERRIDES row Q674530: idea, as the Virginia school has" },
  Q3268778: { type: 'idea', why: "typeOf gives topic today: Wikidata gives it no class (P31), only subclass of military strategy (Q219087); needs a TYPE_OVERRIDES row Q3268778: idea" },
  Q1949683: { type: 'idea', why: "typeOf gives topic today: no class (P31), only subclasses (player strategy, deterrence, foreign policy); needs a TYPE_OVERRIDES row Q1949683: idea" },
  Q1291690: { type: 'idea', why: "typeOf gives topic today: no class (P31), only subclass of strategy and military strategy; needs a TYPE_OVERRIDES row Q1291690: idea" },
  Q1761621: { type: 'idea', why: "typeOf gives topic today (class military term, Q66740226); needs a TYPE_OVERRIDES row Q1761621: idea. English Wikipedia's \"Sea power\" redirects to \"Command of the sea\", this item" },
  Q760037: { type: 'idea', why: "typeOf gives conflict today: the label \"counter-insurgency\" holds the war word \"insurgency\" and its class is warfare (Q12786121); needs a TYPE_OVERRIDES row Q760037: idea" },
  Q7178: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1194093 \"international non-governmental organization\", Q336473 \"aid agency\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1194093 \"international non-governmental organization\"." },
  Q7804: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1345691 \"international financial institution\", Q15925165 \"specialized agency of the United Nations\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1345691 \"international financial institution\" and Q15925165 \"specialized agency of the United Nations\"." },
  Q7164: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1345691 \"international financial institution\", Q5266746 \"development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1345691 \"international financial institution\"." },
  Q7785: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q137290726 \"language-based geopolitical organization\", Q2578692 \"commonwealth\"); it becomes \"Organisation\" once ORG in types.mjs holds Q137290726 \"language-based geopolitical organization\"." },
  Q37470: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q15899789 \"principal organ of the United Nations\", Q4358176 \"council\"); it becomes \"Organisation\" once ORG in types.mjs holds Q15899789 \"principal organ of the United Nations\"." },
  Q7801: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1262438 \"international court\", Q15899789 \"principal organ of the United Nations\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1262438 \"international court\" and Q15899789 \"principal organ of the United Nations\"." },
  Q163931: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\"." },
  Q191384: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q105758271 \"multilateral development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q105758271 \"multilateral development bank\"." },
  Q656801: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1345691 \"international financial institution\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1345691 \"international financial institution\"." },
  Q827525: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q105758271 \"multilateral development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q105758271 \"multilateral development bank\"." },
  Q340195: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q105758271 \"multilateral development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q105758271 \"multilateral development bank\"." },
  Q862603: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\"." },
  Q7248622: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\"." },
  Q159454: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\", Q79913 \"non-governmental organization\", Q1194093 \"international non-governmental organization\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\" and Q1194093 \"international non-governmental organization\"." },
  Q17495: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q15925165 \"specialized agency of the United Nations\"); it becomes \"Organisation\" once ORG in types.mjs holds Q15925165 \"specialized agency of the United Nations\"." },
  Q376150: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q15925165 \"specialized agency of the United Nations\", Q1328899 \"standards organization\"); it becomes \"Organisation\" once ORG in types.mjs holds Q15925165 \"specialized agency of the United Nations\"." },
  Q3772571: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q105758271 \"multilateral development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q105758271 \"multilateral development bank\"." },
  Q624307: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1345691 \"international financial institution\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1345691 \"international financial institution\"." },
  Q212712: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\", Q79913 \"non-governmental organization\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\"." },
  Q190008: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q105758271 \"multilateral development bank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q105758271 \"multilateral development bank\"." },
  Q939743: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1470641 \"international parliamentary assembly\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1470641 \"international parliamentary assembly\"." },
  Q842008: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q309118 \"politburo\", Q115328490 \"CPSU body\"); it becomes \"Organisation\" once ORG in types.mjs holds Q309118 \"politburo\"." },
  Q1125994: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2943071 \"congressional caucus\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2943071 \"congressional caucus\"." },
  Q688638: { type: 'organisation', why: "types.mjs typeOf gives \"Event\" today (P31: Q748019 \"scientific society\", Q155271 \"think tank\"); it becomes \"Organisation\" once ORG in types.mjs holds Q155271 \"think tank\"." },
  Q43056: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q1127126 \"military alliance\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1127126 \"military alliance\"." },
  Q193235: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q170156 \"confederation\", Q1778834 \"koinon\"); needs TYPE_OVERRIDES Q193235: 'organisation', because its classes are a confederation and a koinon, which types.mjs reads as no type (a topic); IGO lists it among defunct intergovernmental organisations." },
  Q41984: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q15285626 \"organization established by the United Nations\"); it becomes \"Organisation\" once ORG in types.mjs holds Q15285626 \"organization established by the United Nations\"." },
  Q177859: { type: 'organisation', why: "types.mjs typeOf gives \"Event\" today (P31: Q131569 \"treaty\", Q100906234 \"multinational military coalition\", Q29430681 \"triad\"); needs TYPE_OVERRIDES Q177859: 'organisation', because Wikidata classes it a treaty first (an event in types.mjs) and a multinational military coalition; the review lists it among organisations (B3, Tier 2)." },
  Q42908: { type: 'organisation', why: "types.mjs typeOf gives \"Polity\" today (P31: Q170156 \"confederation\", Q43229 \"organization\"); needs TYPE_OVERRIDES Q42908: 'organisation', because a confederation with a capital (Lübeck) and a date it ended, so a polity in types.mjs; it was a league of merchant guilds and towns, not a state (doubtful: a polity may be argued)." },
  Q188592: { type: 'organisation', why: "types.mjs typeOf gives \"Topic\" today (P31: Q2716508 \"political international\"); it becomes \"Organisation\" once ORG in types.mjs holds Q2716508 \"political international\"." },
  Q154640: { type: 'organisation', why: "types.mjs typeOf gives \"Event\" today (P31: Q1127126 \"military alliance\"); it becomes \"Organisation\" once ORG in types.mjs holds Q1127126 \"military alliance\"." },
};

/** Names Wikidata gives an item today that are not its name, each with its reason and the day it was read (build.mjs
    holds them as it holds LABEL_OVERRIDES). An item leaves the list once Wikidata names it rightly again. */
export const CANON_LABELS = [
  { q: 'Q150995', label: 'Peace of Westphalia', why: 'its English label is "Peace of Westph", cut short, while its English Wikipedia article and its alias "Treaty of Westphalia" name the Peace of Westphalia (VA4H)', read: '2026-11-25' },
  { q: 'Q142988', label: 'Alfred Thayer Mahan', why: 'its English label is "Alfred Thayer Maan", misspelt, while its English Wikipedia article, its aliases and every reference spell it Mahan', read: '2026-11-25' },
  { q: 'Q1822951', label: 'Liberalism (international relations)', why: 'its English label is "liberalism", the same word as the ideology Q6216, which the lake holds; its English Wikipedia title names the school, so the two are told apart and the Bibliotheca tagger does not read every "liberalism" twice', read: '2026-11-25' },
  { q: 'Q7234129', label: 'Postcolonial international relations', why: 'its English label is "Postcolonialism", the name of the general concept Q265425 (whose English Wikipedia article "Postcolonialism" is), while its own article and IRT\'s "Main" link are "Postcolonial international relations"; held so the Bibliotheca tagger does not read every "postcolonialism" in a book as the school of international relations', read: '2026-11-26' },
];

export const CANON_BY_QID = new Map(CANON.map(i => [i.q, i]));

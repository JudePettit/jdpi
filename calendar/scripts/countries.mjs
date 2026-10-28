// Country names for the Political Calendar: which country a news sentence is about, and one spelling per country.
// The list of sovereign states, demonyms and capitals comes from Wikidata (P31 sovereign state, P1549, P36),
// renamed to the calendar's spellings and trimmed of ambiguous words ("Congolese", "Dominican", "Korean"…).
//   countryOf({ links, text, topics })  → the first country named, or null
//   normaliseCountry(name)               → the calendar's spelling of a country name

// name|demonyms|capitals and cities
const RAW = `Afghanistan|Afghan|Kabul,Kandahar;Albania|Albanian|Tirana;Algeria|Algerian|Algiers;Andorra|Andorran|Andorra la Vella;Angola|Angolan|Luanda;
Antigua and Barbuda|Antiguan|St. John's;Argentina|Argentine|Buenos Aires;Armenia|Armenian|Yerevan;Australia|Australian|Canberra,Sydney,Melbourne,New South Wales,Queensland,Tasmania,Western Australia,South Australia;
Austria|Austrian|Vienna;Azerbaijan|Azeri,Azerbaijani|Baku,Nagorno-Karabakh;Bahrain|Bahraini|Manama;Bangladesh|Bangladeshi|Dhaka,Chittagong;Barbados|Barbadian|Bridgetown;
Belarus|Belarusian|Minsk;Belgium|Belgian|Brussels,Flanders,Wallonia,Antwerp;Belize|Belizean|Belmopan;Benin|Beninese|Porto-Novo,Cotonou;Bhutan|Bhutanese|Thimphu;Bolivia|Bolivian|La Paz,Sucre;
Bosnia and Herzegovina|Bosnian|Sarajevo,Republika Srpska;Botswana|Botswanan|Gaborone;Brazil|Brazilian|Brasília,São Paulo,Rio de Janeiro;Brunei|Bruneian|Bandar Seri Begawan;Bulgaria|Bulgarian|Sofia;
Burkina Faso|Burkinabè|Ouagadougou;Burundi|Burundian|Gitega,Bujumbura;Cambodia|Cambodian|Phnom Penh;Cameroon|Cameroonian|Yaoundé,Douala;
Canada|Canadian|Ottawa,Toronto,Montreal,Vancouver,Quebec,Québec,Ontario,Alberta,British Columbia,Manitoba,Saskatchewan,Nova Scotia,New Brunswick,Newfoundland and Labrador;
Cape Verde|Cape Verdean|Praia;Central African Republic|Central African|Bangui;Chad|Chadian|N'Djamena;Chile|Chilean|Santiago;
China|Chinese|Beijing,Shanghai,Shenzhen,Hong Kong,Xinjiang,Tibet,Macau;Colombia|Colombian|Bogotá;Comoros|Comorian|Moroni;Costa Rica|Costa Rican|San José;Croatia|Croatian|Zagreb;
Cuba|Cuban|Havana;Cyprus|Cypriot|Nicosia;Czechia|Czech|Prague,Czech Republic;Denmark|Danish|Copenhagen,Greenland,Faroe Islands;DR Congo||Kinshasa,Goma,North Kivu,South Kivu,Ituri,Democratic Republic of the Congo;
Djibouti|Djiboutian|Djibouti City;Dominica||Roseau;Dominican Republic||Santo Domingo;Ecuador|Ecuadorian|Quito,Guayaquil;Egypt|Egyptian|Cairo;El Salvador|Salvadoran|San Salvador;
Equatorial Guinea|Equatorial Guinean|Malabo;Eritrea|Eritrean|Asmara;Estonia|Estonian|Tallinn;Eswatini|Swazi|Mbabane;Ethiopia|Ethiopian|Addis Ababa,Tigray,Amhara,Oromia;
Micronesia|Micronesian|Palikir;Fiji|Fijian|Suva;Finland|Finnish|Helsinki;France|French|Paris,Marseille,Lyon,Corsica,New Caledonia;Gabon|Gabonese|Libreville;
Georgia|Georgian|Tbilisi,Abkhazia,South Ossetia;Germany|German|Berlin,Bavaria,Munich,Hamburg,Bundestag;Ghana|Ghanaian|Accra;Greece|Greek|Athens;Grenada|Grenadian|St. George's;
Guatemala|Guatemalan|Guatemala City;Guinea||Conakry;Guinea-Bissau||Bissau;Guyana|Guyanese|;Haiti|Haitian|Port-au-Prince;Honduras|Honduran|Tegucigalpa;Hungary|Hungarian|Budapest;
Iceland|Icelandic|Reykjavík;India|Indian|New Delhi,Delhi,Mumbai,Kolkata,Tamil Nadu,Kerala,West Bengal,Manipur,Ladakh,Lok Sabha;Indonesia|Indonesian|Jakarta,Aceh,Bali;
Iran|Iranian|Tehran,Isfahan,Mashhad;Iraq|Iraqi|Baghdad,Erbil,Mosul,Basra,Kurdistan Region;Israel|Israeli|Jerusalem,Tel Aviv,Knesset;Italy|Italian|Rome,Milan,Sicily;Ivory Coast|Ivorian|Yamoussoukro,Abidjan;
Jamaica|Jamaican|;Japan|Japanese|Tokyo,Osaka,Okinawa;Jordan|Jordanian|Amman;Kazakhstan|Kazakh,Kazakhstani|Astana,Almaty;Kenya|Kenyan|Nairobi,Mombasa;Netherlands|Dutch|Amsterdam,The Hague,Rotterdam;
Kiribati||South Tarawa;Kosovo|Kosovar,Kosovan|Pristina;Kuwait|Kuwaiti|Kuwait City;Kyrgyzstan|Kyrgyz,Kyrgyzstani|Bishkek;Laos|Laotian|Vientiane;Latvia|Latvian|Riga,Saeima;
Lebanon|Lebanese|Beirut;Lesotho||Maseru;Liberia|Liberian|Monrovia;Libya|Libyan|Tripoli,Benghazi;Liechtenstein|Liechtensteiner|Vaduz;Lithuania|Lithuanian|Vilnius;Luxembourg|Luxembourgish|Luxembourg City;
Madagascar|Malagasy|Antananarivo;Malawi|Malawian|Lilongwe;Malaysia|Malaysian|Kuala Lumpur;Maldives|Maldivian|Malé;Mali|Malian|Bamako;Malta|Maltese|Valletta;Marshall Islands|Marshallese|Majuro;
Mauritania|Mauritanian|Nouakchott;Mauritius|Mauritian|Port Louis;Mexico|Mexican|Mexico City,Sinaloa,Chihuahua,Jalisco,Tijuana;Moldova|Moldovan|Chișinău,Transnistria;Monaco|Monegasque|;
Mongolia|Mongolian|Ulaanbaatar;Montenegro|Montenegrin|Podgorica;Morocco|Moroccan|Rabat,Casablanca;Mozambique|Mozambican|Maputo;Myanmar|Burmese|Naypyidaw,Yangon,Rakhine;Namibia|Namibian|Windhoek;
Nauru|Nauruan|Yaren;Nepal|Nepalese,Nepali|Kathmandu;New Zealand|New Zealander|Wellington,Auckland;Nicaragua|Nicaraguan|Managua;Niger|Nigerien|Niamey;Nigeria|Nigerian|Abuja,Lagos,Kano,Borno;
North Korea|North Korean|Pyongyang;North Macedonia|North Macedonian|Skopje;Norway|Norwegian|Oslo,Storting;Oman|Omani|Muscat;Pakistan|Pakistani|Islamabad,Karachi,Lahore,Balochistan,Khyber Pakhtunkhwa,Azad Kashmir;
Palau|Palauan|Ngerulmud;Palestine|Palestinian|Ramallah,East Jerusalem,Gaza Strip,Gaza,West Bank,State of Palestine;Panama|Panamanian|Panama City;Papua New Guinea|Papua New Guinean|Port Moresby;
Paraguay|Paraguayan|Asunción;Peru|Peruvian|Lima;Philippines|Filipino,Filipina|Manila,Quezon City,Mindanao;Poland|Polish|Warsaw,Sejm;Portugal|Portuguese|Lisbon;Qatar|Qatari|Doha;
Ireland|Irish|Dublin,Dáil;Congo||Brazzaville,Republic of the Congo;Romania|Romanian|Bucharest;Russia|Russian|Moscow,Saint Petersburg,St. Petersburg,Chechnya,Dagestan,Kursk,Belgorod,Kremlin,State Duma;
Rwanda|Rwandan|Kigali;Saint Kitts and Nevis||Basseterre;Saint Lucia|Saint Lucian|Castries;Saint Vincent and the Grenadines|Vincentian|Kingstown;Samoa|Samoan|Apia;San Marino|Sammarinese|;
Saudi Arabia|Saudi|Riyadh,Jeddah,Mecca;Senegal|Senegalese|Dakar;Serbia|Serbian|Belgrade,Novi Sad;Seychelles|Seychellois|;Sierra Leone|Sierra Leonean|Freetown;Singapore|Singaporean|;
Slovakia|Slovak|Bratislava;Slovenia|Slovenian,Slovene|Ljubljana;Solomon Islands|Solomon Islander|Honiara;Somalia|Somali,Somalian|Mogadishu,Somaliland,Puntland;
South Africa|South African|Pretoria,Cape Town,Johannesburg,Durban;South Korea|South Korean|Seoul,Busan;South Sudan|South Sudanese|Juba;Spain|Spanish|Madrid,Barcelona,Catalonia,Catalan,Basque Country,Andalusia,Canary Islands;
Sri Lanka|Sri Lankan|Colombo;Sudan|Sudanese|Khartoum,Port Sudan,Darfur,Kordofan,El Fasher,Omdurman;Suriname|Surinamese|Paramaribo;Sweden|Swedish|Stockholm,Riksdag;Switzerland|Swiss|Bern,Geneva,Zurich;
Syria|Syrian|Damascus,Aleppo,Idlib;São Tomé and Príncipe||São Tomé;Taiwan|Taiwanese|Taipei,Legislative Yuan;Tajikistan|Tajikistani|Dushanbe;Tanzania|Tanzanian|Dodoma,Dar es Salaam,Zanzibar;
Thailand|Thai|Bangkok;Bahamas|Bahamian|Nassau;The Gambia|Gambian|Banjul;Timor-Leste|East Timorese|Dili,East Timor;Togo|Togolese|Lomé;Tonga|Tongan|Nukuʻalofa;Trinidad and Tobago|Trinidadian|Port of Spain;
Tunisia|Tunisian|Tunis;Turkey|Turkish|Ankara,Istanbul;Turkmenistan|Turkmen,Turkmenistani|Ashgabat;Tuvalu|Tuvaluan|Funafuti;Uganda|Ugandan|Kampala;
Ukraine|Ukrainian|Kyiv,Kharkiv,Odesa,Lviv,Dnipro,Zaporizhzhia,Kherson,Donetsk,Luhansk,Crimea,Donbas,Verkhovna Rada;United Arab Emirates|Emirati|Abu Dhabi,Dubai;
United Kingdom|British|London,England,Scotland,Wales,Northern Ireland,Scottish,Welsh,Northern Irish,Downing Street,House of Commons,Westminster;
United States|American|Washington\\, D.C.,White House,U.S.,US,USA,Republican National Convention,Democratic National Convention,New York City,Los Angeles,Chicago,Puerto Rico,Guam,Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,Florida,Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,West Virginia,Wisconsin,Wyoming,Minneapolis;
Uruguay|Uruguayan|Montevideo;Uzbekistan|Uzbek,Uzbekistani|Tashkent;Vanuatu|Vanuatuan|Port Vila;Vatican City|Vatican|Holy See;Venezuela|Venezuelan|Caracas;Vietnam|Vietnamese|Hanoi,Ho Chi Minh City;
Western Sahara|Sahrawi|;Yemen|Yemeni|Sanaa,Aden;Zambia|Zambian|Lusaka;Zimbabwe|Zimbabwean|Harare`;

// Names that are also people's names or places elsewhere: trusted only as a link target, never in running text.
const LINK_ONLY = new Set(['Chad', 'Jordan', 'Georgia', 'Guinea', 'Niger', 'Turkey', 'US', 'Victoria']);
// Words that look like a country but are not ("Persian Gulf", "Latin American", "New Mexico"…).
const NOT_COUNTRY = /\b(?:Latin|South|North|Central|African|Native|Asian|Anglo|Pan|Afro)[- ]Americans?\b|\bBritish (?:Columbia|Virgin|Overseas|Indian Ocean)\b|\bNew (?:Mexico|Jersey|York|South Wales|Caledonia|Guinea|Zealand)\b|\bIndian Ocean\b|\bSouth China Sea\b|\bEast China Sea\b|\bGulf of Mexico\b|\bSea of Japan\b|\bChinese Taipei\b|\bNorthern Irish\b|\bTurkish Cypriots?\b|\bGerman Shepherd\b|\bDutch Caribbean\b/g;

export const COUNTRIES = [];
const TERM = new Map(); // term → country
for (const row of RAW.replace(/\n/g, '').split(';')) {
  const [name, dem = '', places = ''] = row.split('|');
  const split = s => s.replace(/\\,/g, '\u0000').split(',').map(x => x.replace(/\u0000/g, ',').trim()).filter(Boolean);
  COUNTRIES.push(name);
  for (const t of [name, ...split(dem), ...split(places)]) if (!TERM.has(t)) TERM.set(t, name);
}
// Other spellings used by Wikidata, Archigos and the editorial list.
const ALIASES = {
  "People's Republic of China": 'China', 'Czech Republic': 'Czechia', 'United States of America': 'United States', USA: 'United States',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina', Gambia: 'The Gambia', 'Democratic Republic of the Congo': 'DR Congo', 'Republic of the Congo': 'Congo',
  'Kingdom of the Netherlands': 'Netherlands', 'Kingdom of Denmark': 'Denmark', 'Danish Realm': 'Denmark', 'Republic of Ireland': 'Ireland',
  'State of Palestine': 'Palestine', 'Occupied Palestinian territory': 'Palestine', 'Palestinian territories': 'Palestine', 'Federated States of Micronesia': 'Micronesia',
  'The Bahamas': 'Bahamas', 'Georgia (country)': 'Georgia', 'Republic of Georgia (1990–1992)': 'Georgia', 'Fourth Republic of South Korea': 'South Korea',
  "Polish People's Republic": 'Poland', 'Government of Islamic Emirate of Afghanistan': 'Afghanistan', 'Islamic Emirate of Afghanistan': 'Afghanistan', 'Samoan Islands': 'Samoa',
  'Valencian Community': 'Spain', 'Democratic Republic of Sudan': 'Sudan', "Côte d'Ivoire": 'Ivory Coast', 'East Timor': 'Timor-Leste', 'Republic of China': 'Taiwan',
  'Swaziland': 'Eswatini', 'Burma': 'Myanmar', 'Macedonia': 'North Macedonia', 'Republic of Macedonia': 'North Macedonia', 'Cabo Verde': 'Cape Verde', 'Holy See': 'Vatican City',
  'Russian Federation': 'Russia', 'Korea, South': 'South Korea', 'Korea, North': 'North Korea', 'Viet Nam': 'Vietnam', 'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'Republic of Bosnia and Herzegovina': 'Bosnia and Herzegovina', 'Kurdistan Region of Iraq': 'Iraq', 'Federal Republic of Yugoslavia': 'Yugoslavia',
  'Socialist Federal Republic of Yugoslavia': 'Yugoslavia', internationality: 'International',
};
for (const [k, v] of Object.entries(ALIASES)) if (!TERM.has(k)) TERM.set(k, v);

/**
 * The calendar's spelling of a country name. Wikidata's labels for a country's parts and Soviet-era republics
 * become the country ("Republika Srpska" → Bosnia and Herzegovina, "Lithuanian Soviet Socialist Republic" →
 * Lithuania); unknown names and the Retrospective's "A / B" historical names are kept as they are.
 */
export function normaliseCountry(name) {
  const n = String(name || '').trim();
  if (!n) return 'International';
  if (ALIASES[n]) return ALIASES[n];
  if (COUNTRIES.includes(n) || /\s\/\s/.test(n)) return n;
  let m = /^(\S+(?: \S+)?) Soviet Socialist Republic$/.exec(n) || /^(?:Socialist|People's|Democratic|Federal) Republic of (.+)$/.exec(n);
  if (m && TERM.has(m[1])) return TERM.get(m[1]);
  if (TERM.has(n) && n.length > 3 && !LINK_ONLY.has(n)) return TERM.get(n);
  return n;
}
export const isKnownCountry = name => COUNTRIES.includes(name);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest terms first, so "South Sudan" wins over "Sudan" and "Papua New Guinea" over "Guinea".
const TEXT_TERMS = [...TERM.keys()].filter(t => !LINK_ONLY.has(t) && t.length > 2).sort((a, b) => b.length - a.length);
// A term may be followed by a hyphen ("Uzbekistan-based", "Russian-linked") but not preceded by one ("Anglo-American").
const TEXT_RE = new RegExp(`(?<![\\w-])(?:${TEXT_TERMS.map(esc).join('|')})(?!\\w)`, 'g');
const termsOf = country => new RegExp(`(?<![\\w-])(?:${[...TERM].filter(([t, c]) => c === country && !LINK_ONLY.has(t)).map(([t]) => esc(t)).join('|')})(?!\\w)`);
/** Is this exactly a country (a link to "Latvia" or "Republic of Ireland"), rather than something in or of one? */
export const isCountryName = name => COUNTRIES.includes(name) || Object.hasOwn(ALIASES, name);

/** The country a link target points to: "Latvia", "Prime Minister of Latvia", "Constitutional Council (France)". */
export function countryOfLink(target) {
  const t = String(target || '').replace(/_/g, ' ').trim();
  if (TERM.has(t) && !/^(US|U\.S\.)$/.test(t)) return TERM.get(t);
  if (/^(Georgia \(country\)|Victoria \(state\))$/.test(t)) return t.startsWith('Georgia') ? 'Georgia' : 'Australia';
  if (/\((?:U\.S\. )?state\)$/.test(t) && TERM.get(t.replace(/ \(.*\)$/, '')) === 'United States') return 'United States';
  let m = /\(([^()]+)\)$/.exec(t);
  if (m && TERM.has(m[1])) return TERM.get(m[1]);
  m = /\bof (?:the )?([A-Z][\w'’ .-]+?)$/.exec(t.replace(/ \([^)]*\)$/, ''));
  if (m && TERM.has(m[1]) && !LINK_ONLY.has(m[1])) return TERM.get(m[1]);
  if (m && (m[1] === 'Georgia' || m[1] === 'Jordan' || m[1] === 'Chad' || m[1] === 'Niger' || m[1] === 'Guinea' || m[1] === 'Turkey')) return m[1];
  m = /^([A-Z][\w-]+(?: [A-Z][\w-]+)?)\b/.exec(t);
  if (m && TERM.has(m[1]) && !LINK_ONLY.has(m[1]) && /^(?:[A-Z][a-z]+ian|[A-Z][a-z]+ese|[A-Z][a-z]+ish|[A-Z][a-z]+i)\b/.test(m[1])) return TERM.get(m[1]);
  return null;
}

/** The first country in running text, by position. */
export function countryInText(text) {
  const s = String(text || '').replace(NOT_COUNTRY, m => ' '.repeat(m.length));
  TEXT_RE.lastIndex = 0;
  const m = TEXT_RE.exec(s);
  return m ? TERM.get(m[0]) : null;
}

/**
 * Which country an event is about: the first country among the sentence's links (in order), then in its text,
 * then in its story headings. For sanctions, the country after "on/against" (the target) comes first.
 */
export function countryOf({ links = [], text = '', topics = [], prefer = null } = {}) {
  if (prefer) { const c = countryInText(prefer); if (c) return c; }
  const fromLinks = links.map(countryOfLink).find(Boolean);
  const fromText = countryInText(text);
  // A demonym early in the sentence ("Latvian prime minister …") beats a link later on.
  if (fromText && fromLinks && fromText !== fromLinks) {
    const s = String(text);
    const i = s.search(termsOf(fromText)), j = s.search(termsOf(fromLinks));
    if (i >= 0 && (j < 0 || i < j)) return fromText;
  }
  return fromLinks || fromText || topics.map(countryInText).find(Boolean) || topics.map(countryOfLink).find(Boolean) || null;
}

# Vitruvian Manager datasets

Generated 2026-11-28 from https://jdpi.pages.dev/integration/catalog.json. Read the live catalogue for current row counts.

## Realtime Geopolitics

### headline-outlets

Global Headline Tracker: outlets. The most-read news outlets of each covered country whose front pages the Global Headline Tracker follows, with the feed it reads. (The daily top-story archive itself, with lowbrow stories left out by the tracker's Highbrowse filter, lives in a database, not in a static file, so it is not in this catalogue.)

- Rows: 296 · refresh: static · licence: List © JDP-Iq; feeds and articles belong to the outlets.
- File: https://jdpi.pages.dev/integration/data/headline-outlets.json (records at `records`)
- Fields: `country` (string), `iso3` (string), `outlet` (string), `home` (string), `rss` (string), `via` (string)

### volatility-latest

Geopolitical Volatility: latest scores. The Geopolitical Volatility Index (0–100) for every country on the latest day (2026-11-26), with its five components: conflict & security (35%), political/diplomatic escalation (20%), civil unrest (20%), economic disruption (10%) and cross-border spread (15%). It measures news coverage of events, not events on the ground.

- Rows: 236 · refresh: daily · licence: Index © JDP-Iq (method gvi-1.2-q96); GDELT data free to use with attribution to the GDELT Project.
- File: https://jdpi.pages.dev/integration/data/volatility-latest.json (records at `records`)
- Fields: `iso3` (string), `name` (string), `date` (date), `score` (number), `conflict` (number), `political` (number), `unrest` (number), `economic` (number), `spread` (number), `events` (number), `articles` (number), `sources` (number), `tone` (number), `coverage` (string), `reason` (string)

### volatility-daily

Geopolitical Volatility: daily scores. Daily Geopolitical Volatility Index scores and components for every country over the last 62 days, for trends and comparisons.

- Rows: 13,124 · refresh: daily · licence: Index © JDP-Iq (method gvi-1.2-q96); GDELT data free to use with attribution to the GDELT Project.
- Files: https://jdpi.pages.dev/integration/data/volatility-daily/0.json, https://jdpi.pages.dev/integration/data/volatility-daily/1.json, https://jdpi.pages.dev/integration/data/volatility-daily/2.json (+10 more) (records at `records`)
- Fields: `date` (date), `iso3` (string), `name` (string), `score` (number), `conflict` (number), `political` (number), `unrest` (number), `economic` (number), `spread` (number), `events` (number), `tone` (number), `coverage` (string)

### volatility-global

Geopolitical Volatility: global mean. The world mean of the Geopolitical Volatility Index each day, with the number of GDELT events and quarter-hour files processed.

- Rows: 62 · refresh: daily · licence: Index © JDP-Iq; GDELT data free to use with attribution to the GDELT Project.
- File: https://jdpi.pages.dev/integration/data/volatility-global.json (records at `records`)
- Fields: `date` (date), `mean_score` (number), `events` (number), `files` (number)

### realtime-wars

Realtime Battlefield: wars this year. Every armed conflict recorded so far in 2026, grouped into wars, with deaths, events, status and a plain-English background. UCDP candidate events through 2026-09.

- Rows: 60 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/realtime-wars.json (records at `records`)
- Fields: `id` (string), `name` (string), `zone` (string), `status` (string), `countries` (array), `deaths` (number), `events` (number), `deaths_last_3_months` (number), `last_active` (date), `summary` (string), `background` (string), `conflicts` (array), `wikipedia` (string)

### realtime-war-months

Realtime Battlefield: war by month. Each war's deaths, events and civilian deaths month by month in 2026, with Vitruvian Manager's monthly note (change on the previous month, deadliest areas).

- Rows: 540 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/realtime-war-months.json (records at `records`)
- Fields: `war_id` (string), `war` (string), `zone` (string), `month` (date), `deaths` (number), `events` (number), `civilians` (number), `deadliest_place` (string), `note` (string)

### realtime-conflict-cells

Realtime Battlefield: events on a 0.1° grid. Conflict events this year summed by war, month and 0.1° grid cell (about 11 km): the points on the Realtime Battlefield map.

- Rows: 9,921 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- Files: https://jdpi.pages.dev/integration/data/realtime-conflict-cells/0.json, https://jdpi.pages.dev/integration/data/realtime-conflict-cells/1.json, https://jdpi.pages.dev/integration/data/realtime-conflict-cells/2.json (+6 more) (records at `records`)
- Fields: `war_id` (string), `war` (string), `month` (date), `lat` (number), `lon` (number), `deaths` (number), `events` (number)

### national-countries

National Analysis: countries. One row per country: region, income group, government, heads of state and government, PESTLE pressure (the share of each dimension's indicators that are worsening), leadership turnover, conflict history and a few headline indicators.

- Rows: 217 · refresh: monthly · licence: World Bank WDI and WGI CC BY 4.0; Wikidata CC0; UCDP CC BY 4.0; PESTLE scores © JDP-Iq. Leaders to 2015 after Archigos 4.1 (Goemans, Gleditsch and Chiozza), whose page states no licence: kept with its citation until VM’s owner decides.
- File: https://jdpi.pages.dev/integration/data/national-countries.json (records at `records`)
- Fields: `iso3` (string), `iso2` (string), `name` (string), `official_name` (string), `region` (string), `income` (string), `capital` (string), `government` (array), `head_of_state` (string), `head_of_government` (string), `qid` (string), `pestle_overall` (number), `pestle_political` (number), `pestle_economic` (number), `pestle_social` (number), `pestle_technological` (number), `pestle_legal` (number), `pestle_environmental` (number), `pestle_coverage` (number), `population` (number), `gdp_usd` (number), `gdp_growth` (number), `gdp_per_capita` (number), `inflation` (number), `life_expectancy` (number), `current_leader` (string), `leader_since` (date), `leader_party` (string), `leaders_since_1926` (number), `average_tenure_years` (number), `irregular_exits` (number), `elections_since_1926` (number), `conflict_years` (number), `years_at_war` (number), `wars_active_this_year` (number), `energy_share` (number)

### national-indicators

National Analysis: indicator definitions. The 41 indicators behind National Analysis: PESTLE dimension, unit, which direction is better and the change that counts as improving or worsening, and each one's yearly map layer (every country, every year, in national/data/years/, described by its manifest.json: the layers the time slider and the Omni-Map read).

- Rows: 41 · refresh: monthly · licence: World Bank CC BY 4.0; definitions © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/national-indicators.json (records at `records`)
- Fields: `code` (string), `label` (string), `dimension` (string), `unit` (string), `better` (string), `threshold` (number), `scored` (boolean), `layer` (string), `layer_file` (string), `first_year` (number), `last_year` (number)

### national-indicator-latest

National Analysis: latest indicator values. For each country and indicator, the latest value, its year, the change on the previous value and whether that counts as improving, stable or worsening.

- Rows: 7,884 · refresh: monthly · licence: World Bank WDI and WGI CC BY 4.0; Wikidata CC0; UCDP CC BY 4.0; PESTLE scores © JDP-Iq. Not free at their source, whatever the World Bank’s label: MS.MIL.XPND.GD.ZS rests on SIPRI, whose terms ask its permission, and normally a royalty, for commercial use; EG.FEC.RNEW.ZS, EG.USE.PCAP.KG.OE and EN.GHG.CO2.PC.CE.AR5 rest on the IEA, whose terms keep its datasets outside CC BY 4.0; EN.ATM.PM25.MC.M3 rests on IHME, whose terms are for non-commercial users only; IT.CEL.SETS.P2 and IT.NET.USER.ZS rest on the ITU, whose terms allow personal, educational or non-commercial use only. Kept until VM’s owner decides.
- Files: https://jdpi.pages.dev/integration/data/national-indicator-latest/0.json, https://jdpi.pages.dev/integration/data/national-indicator-latest/1.json, https://jdpi.pages.dev/integration/data/national-indicator-latest/2.json (+7 more) (records at `records`)
- Fields: `iso3` (string), `country` (string), `dimension` (string), `code` (string), `indicator` (string), `unit` (string), `year` (number), `value` (number), `previous_year` (number), `change` (number), `trend` (string)

### national-key-series

National Analysis: key indicator time series. Yearly values since 1980 for every country of eight headline indicators (NY.GDP.MKTP.KD.ZG: GDP growth, % a year; FP.CPI.TOTL.ZG: Inflation (consumer prices), % a year; NY.GDP.PCAP.KD: GDP per person (constant 2015 US$), US$; SP.POP.TOTL: Population, people; SP.DYN.LE00.IN: Life expectancy at birth, years; SL.UEM.TOTL.ZS: Unemployment, % of labour force; MS.MIL.XPND.GD.ZS: Military spending, % of GDP; EN.GHG.CO2.PC.CE.AR5: CO₂ emissions per person, t CO₂e). Sharded by indicator, then by country; filter on indicator (and iso3) to read one shard. Labels and units are in national-indicators; all 41 indicators for one country are at national/data/series/<ISO3>.json.

- Rows: 67,168 · refresh: monthly · licence: World Bank WDI, CC BY 4.0. Not free at their source, whatever the World Bank’s label: MS.MIL.XPND.GD.ZS rests on SIPRI, whose terms ask its permission, and normally a royalty, for commercial use; EN.GHG.CO2.PC.CE.AR5 rests on the IEA, whose terms keep its datasets outside CC BY 4.0. Kept until VM’s owner decides.
- Files: https://jdpi.pages.dev/integration/data/national-key-series/0.json, https://jdpi.pages.dev/integration/data/national-key-series/1.json, https://jdpi.pages.dev/integration/data/national-key-series/2.json (+27 more) (records at `records`)
- Fields: `indicator` (string), `iso3` (string), `country` (string), `year` (number), `value` (number)

### upcoming-political-events

Realtime Calendar: recent and upcoming events. The Realtime Calendar's window: political events from six months ago to eighteen months ahead (2026-05-28 to 2028-05-28 at the last build): elections, referendums, summits, new leaders, coups, ceasefires, protests, court rulings and more.

- Rows: 317 · refresh: daily · licence: Summaries from Wikipedia, CC BY-SA 4.0 (credit Wikipedia); facts from Wikidata (CC0) and UCDP/PRIO (CC BY 4.0); compilation © JDP-Iq. Leaders to 2015 after Archigos 4.1 (Goemans, Gleditsch and Chiozza), whose page states no licence: kept with its citation until VM’s owner decides.
- File: https://jdpi.pages.dev/integration/data/upcoming-political-events.json (records at `records`)
- Fields: `date` (date), `country` (string), `title` (string), `type` (string), `status` (string), `source` (string), `summary` (string), `ref` (string), `refName` (string), `level` (string), `iso3` (string), `class` (string), `precision` (string)

## undefined

### intelligence-briefing-stories

Political Briefing: stories. Every story from the Political Briefing's publishers over the last seven days, ten active publishers for each of five political positions (far left to far right). Join `s` to intelligence-briefing-sources for the outlet's name and position.

- Rows: 5,814 · refresh: twice daily · licence: Headlines, standfirsts and links © their publishers, quoted for reference; selection and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/briefing/data/latest.json (records at `items`)
- Fields: `s` (string), `t` (string), `u` (string), `p` (date), `d` (string), `c` (string)

### intelligence-briefing-sources

Political Briefing: publishers. The Political Briefing's publishers with their political position (far left, left, centre, right, far right), country, reliability caution and feed status at the last refresh.

- Rows: 64 · refresh: twice daily · licence: Metadata © JDP-Iq; position ratings after AllSides and Media Bias/Fact Check.
- File: https://jdpi.pages.dev/briefing/data/latest.json (records at `sources`)
- Fields: `id` (string), `name` (string), `position` (string), `country` (string), `caution` (boolean), `active` (boolean), `reserve` (boolean), `status` (string), `count` (number)

### daily-synopsis-stories

Daily Synopsis: the day's major stories. Each day's major political stories, picked by stated rules with no AI model: those that at least three of the Political Briefing's publishers, from at least two of its five positions, ran in the 24 hours to its morning refresh, at most ten a day, with the number of outlets on each side and the first headline. `authorship` says whether that day's short digest was written by an AI model (Claude) and passed VM's checks (model) or the day holds the outlets' headlines alone (rules); no person checked either.

- Rows: 80 · refresh: daily · licence: Headlines and links © their publishers, quoted for reference; selection and counts © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/daily-synopsis-stories.json (records at `records`)
- Fields: `day` (date), `rank` (number), `story` (string), `outlets` (number), `far_left` (number), `left` (number), `centre` (number), `right` (number), `far_right` (number), `lead_headline` (string), `lead_outlet` (string), `lead_url` (string), `authorship` (string), `written` (string), `five` (string)

### econ-briefing-stories

Economics Briefing: stories and papers. Every paper and story in the Economics Briefing over the last 7 days, classed by fields (macro, monetary, trade, labour, development, finance, public, energy) and by type (papers or news). Join `source` to econ-briefing-sources.

- Rows: 489 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/econ/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `fields` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `authors` (string), `also` (array), `undated` (boolean), `access` (string), `alt` (array)

### econ-briefing-sources

Economics Briefing: sources. The journals, preprint servers, institutions and news desks the Economics Briefing reads, with their tier, default fields and feed status.

- Rows: 50 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/econ/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `fields` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `error` (string), `notModified` (boolean), `strict` (boolean), `badge` (string), `access` (string)

### science-briefing-stories

Scientific Briefing: stories and papers. Every paper and story in the Scientific Briefing over the last 7 days, classed by disciplines (physics, chemistry, biology, earth, space) and by type (papers or news). Join `source` to science-briefing-sources.

- Rows: 1,059 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/science/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `disciplines` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `also` (array), `undated` (boolean), `access` (string), `alt` (array)

### science-briefing-sources

Scientific Briefing: sources. The journals, preprint servers, institutions and news desks the Scientific Briefing reads, with their tier, default disciplines and feed status.

- Rows: 45 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/science/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `disciplines` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `error` (string), `notModified` (boolean), `access` (string)

### digital-briefing-stories

Digital Briefing: stories and papers. Every paper and story in the Digital Briefing over the last 7 days, classed by fields (ai, software, security, hardware, networks, quantum, privacy, policy) and by type (papers or news). Join `source` to digital-briefing-sources.

- Rows: 984 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/digital/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `fields` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `authors` (string), `also` (array), `access` (string), `accessMark` (string), `alt` (array)

### digital-briefing-sources

Digital Briefing: sources. The journals, preprint servers, institutions and news desks the Digital Briefing reads, with their tier, default fields and feed status.

- Rows: 79 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/digital/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `fields` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `error` (string), `notModified` (boolean), `strict` (boolean), `badge` (string), `perDay` (number), `matched` (number), `access` (string)

## Retrospective Geopolitics

### political-calendar

Historical Calendar: political events since 1980. Political history from 1980 to today and scheduled events ahead, one file per decade: elections and referendums, new leaders, inaugurations and resignations, coups, wars and ceasefires, assassinations, summits, treaties, sanctions, protests, parliamentary votes and court rulings, each with a plain-English account. The Realtime Calendar shows the same records for the current window.

- Rows: 5,882 · refresh: daily · licence: Summaries from Wikipedia, CC BY-SA 4.0 (credit Wikipedia); facts from Wikidata (CC0) and UCDP/PRIO (CC BY 4.0); compilation © JDP-Iq. Leaders to 2015 after Archigos 4.1 (Goemans, Gleditsch and Chiozza), whose page states no licence: kept with its citation until VM’s owner decides.
- Files: https://jdpi.pages.dev/calendar/data/1980s.json, https://jdpi.pages.dev/calendar/data/1990s.json, https://jdpi.pages.dev/calendar/data/2000s.json (+2 more) (records at `events`)
- Fields: `date` (date), `country` (string), `title` (string), `type` (string), `status` (string), `source` (string), `summary` (string), `ref` (string), `refName` (string), `level` (string), `iso3` (string), `class` (string), `precision` (string)

### encyclopaedia-entities

Master Index: entities. Every person, place, polity (a state that no longer exists), party, election, war, event, period, site, series, idea and organisation in the Vitruvian Manager Master Index, keyed by Wikidata id, with its main dates, country, how often Vitruvian Manager mentions it and which submodules it appears in. One shard per type. Full records (facts, relations, tags, every mention, Wikipedia summary) are one get_entity call away, or at lake/data/e/<qid number % 512>.json.

- Rows: 14,560 · refresh: monthly · licence: Wikidata facts, labels and descriptions CC0; tags and links © JDP-Iq. (Wikipedia summaries, CC BY-SA 4.0, are only in the full entity records.)
- Files: https://jdpi.pages.dev/integration/data/encyclopaedia-entities/0.json, https://jdpi.pages.dev/integration/data/encyclopaedia-entities/1.json, https://jdpi.pages.dev/integration/data/encyclopaedia-entities/2.json (+18 more) (records at `records`)
- Fields: `qid` (string), `label` (string), `type` (string), `description` (string), `start` (string), `end` (string), `country` (string), `mentions` (number), `appears_in` (array), `wikipedia` (string)

### retrospective-wars

Retrospective Battlefield: armed conflicts 1946–2025. Every armed conflict from 1946 to 2025 in the UCDP/PRIO Armed Conflict Dataset (25+ battle deaths a year; intensity 2 means 1,000+), with type, aim, sides, where it was fought and its active years. The page's wars of 1926–1945 come from Wikidata (CC0) by Vitruvian Manager's own rule and are on the page only, for now.

- Rows: 303 · refresh: static · licence: UCDP/PRIO Armed Conflict Dataset CC BY 4.0 (1946–2025); place names from Wikidata (CC0).
- File: https://jdpi.pages.dev/integration/data/retrospective-wars.json (records at `records`)
- Fields: `id` (string), `dataset` (string), `name` (string), `type` (string), `aim` (string), `start` (date), `first_year` (number), `last_year` (number), `active_years` (number), `peak_intensity` (number), `war_years` (number), `fought_in` (array), `states_involved` (array), `side_a` (array), `side_b` (array), `wikipedia` (string)

### war-focus-wars

War Focus: major wars. The major wars of the last hundred years that War Focus follows month by month: dates, sides, total deaths and where the figure comes from, and how many battles are recorded and mapped.

- Rows: 39 · refresh: monthly · licence: UCDP GED and Battle-Related Deaths CC BY 4.0; PRIO Battle Deaths Dataset v3.1 (1946–1988), whose page states no licence, kept with its citation until VM’s owner decides; battles and states from Wikidata (CC0); borders from Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0, one border a year.
- File: https://jdpi.pages.dev/battlefield/focus/data/index.json (records at `wars`)
- Fields: `id` (string), `name` (string), `qid` (string), `wiki` (string), `bf` (string), `start` (date), `end` (date), `ongoing` (boolean), `totalDeaths` (number), `deathsSource` (string), `battles` (number), `mappedBattles` (number), `events` (number), `sides` (array), `bbox` (array)

### war-focus-battles

War Focus: battles, sieges and operations. Every battle, siege and operation that Wikidata records as part of a War Focus war, with dates at the precision Wikidata gives, deaths or casualties where known, and coordinates where mapped. Where a whole and its parts are both listed (the atomic bombings of Hiroshima and Nagasaki, and each bombing), part_of and parts link them, and deaths_counted_once gives the figure War Focus shows for each, each death once: the figure recorded for the item itself where there is one, else the sum of its parts' (figure_from says which). To total a war's battles without counting a death twice, add deaths_counted_once over the rows with no part_of; adding deaths over every row counts a whole and its parts both. That total is of mixed kinds (recorded counts, estimates and disputed figures: see figure_deaths_kind) and is not the war's toll, which is its deaths by month (war-focus-monthly-deaths): War Focus never adds battle figures into it. A part of two wholes is counted under part_of; also_part_of names the others. Where Wikidata gives no figure, the figure_ columns give the one War Focus reads from the battle's English Wikipedia infobox (BF-08), with its kind (recorded, estimate or disputed), its range and whether it is a lower bound; deaths and casualties stay Wikidata's own. The revision of each article read, each side's figures and every Wikidata statement are in battlefield/focus/data/figures/<war_id>.json.

- Rows: 4,242 · refresh: monthly · licence: Wikidata CC0; the figure_ columns, and a start or end War Focus takes from the battle's English Wikipedia article, from English Wikipedia, CC BY-SA 4.0 (as facts; each infobox figure's article is named at its revision in the figures files).
- Files: https://jdpi.pages.dev/integration/data/war-focus-battles/0.json, https://jdpi.pages.dev/integration/data/war-focus-battles/1.json, https://jdpi.pages.dev/integration/data/war-focus-battles/2.json (+8 more) (records at `records`)
- Fields: `war_id` (string), `war` (string), `qid` (string), `name` (string), `description` (string), `start` (date), `end` (date), `start_wikidata` (date), `pts` (string), `precision` (string), `deaths` (number), `casualties` (number), `lat` (number), `lon` (number), `wikipedia` (string), `part_of` (string), `also_part_of` (array), `parts` (array), `deaths_counted_once` (number), `figure_from` (string), `figure_deaths_low` (number), `figure_deaths_high` (number), `figure_deaths_kind` (string), `figure_deaths_source` (string), `figure_deaths_at_least` (boolean), `figure_casualties_low` (number), `figure_casualties_high` (number), `figure_casualties_kind` (string), `figure_casualties_source` (string), `figure_state` (string)

### war-focus-monthly-deaths

War Focus: deaths by month. Deaths in each War Focus war month by month. Where no monthly record exists, annual or war totals are spread across months by recorded events or battles; those months are marked as estimates. For a war no free source gives deaths for (its totalDeaths is empty in war-focus-wars: the nine wars before 1946), deaths and estimated are empty in every month, never 0.

- Rows: 3,494 · refresh: monthly · licence: UCDP GED and Battle-Related Deaths CC BY 4.0; PRIO Battle Deaths Dataset v3.1 (1946–1988), whose page states no licence, kept with its citation until VM’s owner decides; battles and states from Wikidata (CC0); borders from Cliopatria v0.2.1 (Bennett et al. 2025), CC BY 4.0, one border a year.
- Files: https://jdpi.pages.dev/integration/data/war-focus-monthly-deaths/0.json, https://jdpi.pages.dev/integration/data/war-focus-monthly-deaths/1.json (records at `records`)
- Fields: `war_id` (string), `war` (string), `month` (date), `deaths` (number), `estimated` (boolean), `source` (string)

### kardashev-polities

Kardashev Tracker: powers. The empires and countries the Kardashev Tracker follows from 2000 BC to today, with their capital's position and years.

- Rows: 82 · refresh: static · licence: Vitruvian Manager’s own estimates (© JDP-Iq), shaped after books with no open licence (Ian Morris 2010 and 2013; McEvedy & Jones) and Maddison’s populations (CC BY 4.0); from 1900, primary energy from the Energy Institute’s Statistical Review through Our World in Data, under the Energy Institute’s own terms, which could not be read (its page refused VM’s reader on 20 November 2026). Kept until VM’s owner decides.
- File: https://jdpi.pages.dev/kardashev/data/energy.json (records at `polities`)
- Fields: `id` (string), `name` (string), `lat` (number), `lon` (number), `region` (string), `wiki` (string), `from` (number), `to` (number)

### kardashev-shares

Kardashev Tracker: shares of world energy. Each power's population, energy capture per person and share of humanity's energy capture, century by century from 2000 BC (then 1850, 1900, 1950, 2000 and 2025), with its own Kardashev rating. "Rest of world" rows complete each year.

- Rows: 348 · refresh: static · licence: Vitruvian Manager’s own estimates (© JDP-Iq), shaped after books with no open licence (Ian Morris 2010 and 2013; McEvedy & Jones) and Maddison’s populations (CC BY 4.0); from 1900, primary energy from the Energy Institute’s Statistical Review through Our World in Data, under the Energy Institute’s own terms, which could not be read (its page refused VM’s reader on 20 November 2026). Kept until VM’s owner decides.
- File: https://jdpi.pages.dev/integration/data/kardashev-shares.json (records at `records`)
- Fields: `year` (number), `polity_id` (string), `polity` (string), `population` (number), `kcal_per_person_day` (number), `watts` (number), `share` (number), `kardashev` (number)

### kardashev-world

Kardashev Tracker: humanity. World population, total energy capture and humanity's Kardashev rating (Sagan: K = (log10 P − 6) / 10, P in watts) for each step from 2000 BC to 2025.

- Rows: 44 · refresh: static · licence: Vitruvian Manager’s own estimates (© JDP-Iq), shaped after books with no open licence (Ian Morris 2010 and 2013; McEvedy & Jones) and Maddison’s populations (CC BY 4.0); from 1900, primary energy from the Energy Institute’s Statistical Review through Our World in Data, under the Energy Institute’s own terms, which could not be read (its page refused VM’s reader on 20 November 2026). Kept until VM’s owner decides.
- File: https://jdpi.pages.dev/integration/data/kardashev-world.json (records at `records`)
- Fields: `year` (number), `world_population` (number), `world_watts` (number), `kardashev` (number)

## Wealth Automation

### congress-members

Investor Impersonator: members of Congress who trade. Members of the US House of Representatives with Periodic Transaction Reports in 2025 and 2026, with party, district and how many trades Vitruvian Manager read from their filings.

- Rows: 145 · refresh: weekly · licence: Public records: Periodic Transaction Reports filed with the Clerk of the US House of Representatives (STOCK Act); compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/congress-members.json (records at `records`)
- Fields: `id` (string), `name` (string), `party` (string), `district` (string), `state` (string), `bioguide` (string), `filings` (number), `trades` (number), `unreadable_filings` (number)

### congress-trades

Investor Impersonator: trades by members of Congress. Every stock, bond and option trade reported by members of the House in 2025 and 2026 (STOCK Act), newest filing first, sharded by filing date. Amounts are the ranges filed, with their bounds as numbers.

- Rows: 11,475 · refresh: weekly · licence: Public records: Periodic Transaction Reports filed with the Clerk of the US House of Representatives (STOCK Act); compilation © JDP-Iq. Not investment advice.
- Files: https://jdpi.pages.dev/integration/data/congress-trades/0.json, https://jdpi.pages.dev/integration/data/congress-trades/1.json, https://jdpi.pages.dev/integration/data/congress-trades/2.json (+14 more) (records at `records`)
- Fields: `filed` (date), `date` (date), `member` (string), `name` (string), `party` (string), `district` (string), `owner` (string), `type` (string), `ticker` (string), `asset` (string), `asset_type` (string), `amount` (string), `amount_min` (number), `amount_max` (number), `account` (string), `filing` (string)

### investors

Investor Impersonator: famous investors. The famous investors Investor Impersonator follows, with their fund, style, latest 13F period and filing, and the reported value of their US long positions.

- Rows: 10 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/investors.json (records at `records`)
- Fields: `cik` (number), `person` (string), `fund` (string), `style` (string), `registered_name` (string), `period` (date), `filed` (date), `previous_period` (date), `total_value` (number), `positions` (number), `sold_out` (number), `filing` (string)

### investor-holdings

Investor Impersonator: famous investors' holdings. Every position in the latest 13F filing of each famous investor, with value, shares, weight in the portfolio and the change since the previous filing (new, added, reduced, unchanged).

- Rows: 1,474 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- Files: https://jdpi.pages.dev/integration/data/investor-holdings/0.json, https://jdpi.pages.dev/integration/data/investor-holdings/1.json (records at `records`)
- Fields: `person` (string), `fund` (string), `period` (date), `name` (string), `ticker` (string), `class` (string), `cusip` (string), `put_call` (string), `value` (number), `shares` (number), `weight` (number), `change` (string), `shares_change` (number)

### investor-sales

Investor Impersonator: famous investors' exits. Positions each famous investor held at the previous quarter end and no longer reports in the latest 13F.

- Rows: 385 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/investor-sales.json (records at `records`)
- Fields: `person` (string), `fund` (string), `period` (date), `previous_period` (date), `name` (string), `ticker` (string), `class` (string), `cusip` (string), `put_call` (string), `previous_value` (number), `previous_shares` (number)

## Natural Science

### science-progress-events

Invention Timeline: breakthroughs. Key scientific and technical breakthroughs from 3000 BC to 2026, with year, discipline, where they happened (and on what basis that place was chosen), the people and the institutions involved.

- Rows: 570 · refresh: monthly · licence: Facts from Wikidata (CC0); titles and notes © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/science-progress-events.json (records at `records`)
- Fields: `id` (string), `year` (number), `circa` (boolean), `disciplines` (array), `title` (string), `note` (string), `qid` (string), `wikipedia` (string), `place` (string), `place_qid` (string), `lat` (number), `lon` (number), `position_basis` (string), `people` (array), `people_qids` (array), `institutions` (array)

### science-progress-people

Invention Timeline: people. The scientists, inventors and thinkers behind the Invention Timeline, with life dates, countries, occupations and fields (Wikidata).

- Rows: 720 · refresh: monthly · licence: Wikidata CC0.
- File: https://jdpi.pages.dev/integration/data/science-progress-people.json (records at `records`)
- Fields: `qid` (string), `name` (string), `description` (string), `born` (number), `died` (number), `countries` (array), `occupations` (array), `fields` (array), `institutions` (array), `wikipedia` (string)

### science-progress-institutions

Invention Timeline: institutions. Universities, laboratories, companies and academies linked to the Invention Timeline, with coordinates (Wikidata).

- Rows: 1,197 · refresh: monthly · licence: Wikidata CC0.
- File: https://jdpi.pages.dev/integration/data/science-progress-institutions.json (records at `records`)
- Fields: `qid` (string), `name` (string), `description` (string), `lat` (number), `lon` (number), `wikipedia` (string)

## Digital Science

### prp-submodules

Vitruvian Manager: modules and submodules. Every Vitruvian Manager submodule: its module, kind, status, address and what it does. Private submodules (behind their own sign-in) are listed but none of their data is published here.

- Rows: 40 · refresh: on change · licence: © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/prp-submodules.json (records at `records`)
- Fields: `module` (string), `module_code` (string), `module_name` (string), `id` (string), `name` (string), `kind` (string), `status` (string), `private` (boolean), `url` (string), `planned_url` (string), `host` (string), `description` (string), `views` (array)

## Kino

### kino-documentaries

Kino: documentaries and courses. Every Kino documentary and Great Thinkers course: category, era, running time, subjects (Wikidata ids), scenes, parts, quiz questions, how many sources (and scholarly sources) it draws on, and the Vitruvian Manager submodules its scenes link to.

- Rows: 18 · refresh: monthly · licence: Documentary texts and index © JDP-Iq; images from Wikimedia Commons, each under its own licence (kino/data/media.json).
- File: https://jdpi.pages.dev/kino/data/index.json (records at `docs`)
- Fields: `id` (string), `title` (string), `category` (string), `era` (array), `cutoff` (string), `minutes` (number), `books` (array), `summary` (string), `subjects` (array), `scenes` (number), `parts` (number), `quiz` (number), `sources` (number), `scholarly` (number), `links` (array), `preview` (object), `path` (string)

## Bibliotheca

### bibliotheca-source-links

Bibliotheca: primary and secondary sources. Every judgement of a Bibliotheca book as a primary or a secondary source, one row per link between one work on the shelf and one subject (a happening, an idea or a person): its tag (primary, secondary or none), the basis of the tag, any note standing beside it or in its place (flags), the evidence in one sentence, the sources it rests on (statements on Wikidata read on the day judged, the book’s own chapters), its confidence and the day judged. A tag belongs to the link, never to the book as a whole. Rows with `shown` true (strong or fair evidence, with a tag or a note) are the ones the Master Index and Neo Book show; the others are kept with the reason they are held. Each judgement was made for Vitruvian Manager by an AI model (Claude), reading the evidence named, and checked by Vitruvian Manager’s rules; no person checked it. `entry` says whether the subject has a Master Index entry today; get_entity gives an entry’s shown links as source_links, and a book’s own entry the subjects it is a source on as source_links_from.

- Rows: 63 · refresh: on change · licence: Judgements, evidence sentences and wording © JDP-Iq; the Wikidata statements they cite are CC0.
- File: https://jdpi.pages.dev/integration/data/bibliotheca-source-links.json (records at `records`)
- Fields: `work` (string), `work_qid` (string), `work_title` (string), `part` (string), `part_by` (string), `subject_qid` (string), `subject_label` (string), `subject_kind` (string), `tag` (string), `tag_words` (string), `basis` (string), `basis_words` (string), `flags` (array), `flag_words` (array), `evidence` (string), `sources` (array), `source_words` (array), `confidence` (string), `shown` (boolean), `held` (string), `why` (string), `note` (string), `judged` (date), `entry` (boolean)

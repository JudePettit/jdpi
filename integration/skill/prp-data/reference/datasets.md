# Vitruvian Manager datasets

Generated 2026-10-30 from https://jdpi.pages.dev/integration/catalog.json. Read the live catalogue for current row counts.

## Realtime Geopolitics

### intelligence-briefing-stories

Intelligence Briefing: stories. Every story from the Intelligence Briefing's publishers over the last seven days, ten active publishers for each of five political positions (far left to far right). Join `s` to intelligence-briefing-sources for the outlet's name and position.

- Rows: 5,309 · refresh: twice daily · licence: Headlines, standfirsts and links © their publishers, quoted for reference; selection and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/briefing/data/latest.json (records at `items`)
- Fields: `s` (string), `t` (string), `u` (string), `p` (date), `d` (string), `c` (string)

### intelligence-briefing-sources

Intelligence Briefing: publishers. The Intelligence Briefing's publishers with their political position (far left, left, centre, right, far right), country, reliability caution and feed status at the last refresh.

- Rows: 64 · refresh: twice daily · licence: Metadata © JDP-Iq; position ratings after AllSides and Media Bias/Fact Check.
- File: https://jdpi.pages.dev/briefing/data/latest.json (records at `sources`)
- Fields: `id` (string), `name` (string), `position` (string), `country` (string), `caution` (boolean), `active` (boolean), `reserve` (boolean), `status` (string), `count` (number)

### headline-outlets

Global Headline Tracker: outlets. The most-read news outlets of each covered country whose front pages the Global Headline Tracker follows, with the feed it reads. (The daily top-story archive itself, with lowbrow stories left out by the tracker's Highbrowse filter, lives in a database, not in a static file, so it is not in this catalogue.)

- Rows: 296 · refresh: static · licence: List © JDP-Iq; feeds and articles belong to the outlets.
- File: https://jdpi.pages.dev/integration/data/headline-outlets.json (records at `records`)
- Fields: `country` (string), `iso3` (string), `outlet` (string), `home` (string), `rss` (string), `via` (string)

### volatility-latest

Geopolitical Volatility: latest scores. The Geopolitical Volatility Index (0–100) for every country on the latest day (2026-10-29), with its five components: conflict & security (35%), political/diplomatic escalation (20%), civil unrest (20%), economic disruption (10%) and cross-border spread (15%). It measures news coverage of events, not events on the ground.

- Rows: 236 · refresh: daily · licence: Index © JDP-Iq (method gvi-1.1); GDELT data free to use with attribution to the GDELT Project.
- File: https://jdpi.pages.dev/integration/data/volatility-latest.json (records at `records`)
- Fields: `iso3` (string), `name` (string), `date` (date), `score` (number), `conflict` (number), `political` (number), `unrest` (number), `economic` (number), `spread` (number), `events` (number), `articles` (number), `sources` (number), `tone` (number), `coverage` (string), `reason` (string)

### volatility-daily

Geopolitical Volatility: daily scores. Daily Geopolitical Volatility Index scores and components for every country over the last 34 days, for trends and comparisons.

- Rows: 7,171 · refresh: daily · licence: Index © JDP-Iq (method gvi-1.1); GDELT data free to use with attribution to the GDELT Project.
- Files: https://jdpi.pages.dev/integration/data/volatility-daily/0.json, https://jdpi.pages.dev/integration/data/volatility-daily/1.json, https://jdpi.pages.dev/integration/data/volatility-daily/2.json (+4 more) (records at `records`)
- Fields: `date` (date), `iso3` (string), `name` (string), `score` (number), `conflict` (number), `political` (number), `unrest` (number), `economic` (number), `spread` (number), `events` (number), `tone` (number), `coverage` (string)

### volatility-global

Geopolitical Volatility: global mean. The world mean of the Geopolitical Volatility Index each day, with the number of GDELT events and quarter-hour files processed.

- Rows: 34 · refresh: daily · licence: Index © JDP-Iq; GDELT data free to use with attribution to the GDELT Project.
- File: https://jdpi.pages.dev/integration/data/volatility-global.json (records at `records`)
- Fields: `date` (date), `mean_score` (number), `events` (number), `files` (number)

### realtime-wars

Realtime Battlefield: wars this year. Every armed conflict recorded so far in 2026, grouped into wars, with deaths, events, status and a plain-English background. UCDP candidate events through 2026-09.

- Rows: 59 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/realtime-wars.json (records at `records`)
- Fields: `id` (string), `name` (string), `zone` (string), `status` (string), `countries` (array), `deaths` (number), `events` (number), `deaths_last_3_months` (number), `last_active` (date), `summary` (string), `background` (string), `conflicts` (array), `wikipedia` (string)

### realtime-war-months

Realtime Battlefield: war by month. Each war's deaths, events and civilian deaths month by month in 2026, with Vitruvian Manager's monthly note (change on the previous month, deadliest areas).

- Rows: 531 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/realtime-war-months.json (records at `records`)
- Fields: `war_id` (string), `war` (string), `zone` (string), `month` (date), `deaths` (number), `events` (number), `civilians` (number), `deadliest_place` (string), `note` (string)

### realtime-conflict-cells

Realtime Battlefield: events on a 0.1° grid. Conflict events this year summed by war, month and 0.1° grid cell (about 11 km): the points on the Realtime Battlefield map.

- Rows: 9,783 · refresh: weekly · licence: UCDP data CC BY 4.0 (cite Hegre et al. 2020); war groupings, background and monthly text © JDP-Iq.
- Files: https://jdpi.pages.dev/integration/data/realtime-conflict-cells/0.json, https://jdpi.pages.dev/integration/data/realtime-conflict-cells/1.json, https://jdpi.pages.dev/integration/data/realtime-conflict-cells/2.json (+6 more) (records at `records`)
- Fields: `war_id` (string), `war` (string), `month` (date), `lat` (number), `lon` (number), `deaths` (number), `events` (number)

### national-countries

National Analysis: countries. One row per country: region, income group, government, heads of state and government, PESTLE pressure (the share of each dimension's indicators that are worsening), leadership turnover, conflict history and a few headline indicators.

- Rows: 217 · refresh: monthly · licence: World Bank WDI and WGI CC BY 4.0; Wikidata CC0; UCDP CC BY 4.0; PESTLE scores © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/national-countries.json (records at `records`)
- Fields: `iso3` (string), `iso2` (string), `name` (string), `official_name` (string), `region` (string), `income` (string), `capital` (string), `government` (array), `head_of_state` (string), `head_of_government` (string), `qid` (string), `pestle_overall` (number), `pestle_political` (number), `pestle_economic` (number), `pestle_social` (number), `pestle_technological` (number), `pestle_legal` (number), `pestle_environmental` (number), `pestle_coverage` (number), `population` (number), `gdp_usd` (number), `gdp_growth` (number), `gdp_per_capita` (number), `inflation` (number), `life_expectancy` (number), `current_leader` (string), `leader_since` (date), `leader_party` (string), `leaders_since_1926` (number), `average_tenure_years` (number), `irregular_exits` (number), `elections_since_1926` (number), `conflict_years` (number), `years_at_war` (number), `wars_active_this_year` (number), `energy_share` (number)

### national-indicators

National Analysis: indicator definitions. The 41 indicators behind National Analysis: PESTLE dimension, unit, which direction is better and the change that counts as improving or worsening.

- Rows: 41 · refresh: monthly · licence: World Bank CC BY 4.0; definitions © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/national-indicators.json (records at `records`)
- Fields: `code` (string), `label` (string), `dimension` (string), `unit` (string), `better` (string), `threshold` (number), `scored` (boolean)

### national-indicator-latest

National Analysis: latest indicator values. For each country and indicator, the latest value, its year, the change on the previous value and whether that counts as improving, stable or worsening.

- Rows: 7,884 · refresh: monthly · licence: World Bank WDI and WGI CC BY 4.0; Wikidata CC0; UCDP CC BY 4.0; PESTLE scores © JDP-Iq.
- Files: https://jdpi.pages.dev/integration/data/national-indicator-latest/0.json, https://jdpi.pages.dev/integration/data/national-indicator-latest/1.json, https://jdpi.pages.dev/integration/data/national-indicator-latest/2.json (+7 more) (records at `records`)
- Fields: `iso3` (string), `country` (string), `dimension` (string), `code` (string), `indicator` (string), `unit` (string), `year` (number), `value` (number), `previous_year` (number), `change` (number), `trend` (string)

### national-key-series

National Analysis: key indicator time series. Yearly values since 1980 for every country of eight headline indicators (NY.GDP.MKTP.KD.ZG: GDP growth, % a year; FP.CPI.TOTL.ZG: Inflation (consumer prices), % a year; NY.GDP.PCAP.KD: GDP per person (constant 2015 US$), US$; SP.POP.TOTL: Population, people; SP.DYN.LE00.IN: Life expectancy at birth, years; SL.UEM.TOTL.ZS: Unemployment, % of labour force; MS.MIL.XPND.GD.ZS: Military spending, % of GDP; EN.GHG.CO2.PC.CE.AR5: CO₂ emissions per person, t CO₂e). Sharded by indicator, then by country; filter on indicator (and iso3) to read one shard. Labels and units are in national-indicators; all 41 indicators for one country are at national/data/series/<ISO3>.json.

- Rows: 67,168 · refresh: monthly · licence: World Bank WDI, CC BY 4.0.
- Files: https://jdpi.pages.dev/integration/data/national-key-series/0.json, https://jdpi.pages.dev/integration/data/national-key-series/1.json, https://jdpi.pages.dev/integration/data/national-key-series/2.json (+27 more) (records at `records`)
- Fields: `indicator` (string), `iso3` (string), `country` (string), `year` (number), `value` (number)

### upcoming-political-events

Realtime Calendar: recent and upcoming events. The Realtime Calendar's window: political events from six months ago to eighteen months ahead (2026-04-30 to 2028-04-30 at the last build): elections, referendums, summits, new leaders, coups, ceasefires, protests, court rulings and more.

- Rows: 300 · refresh: daily · licence: Summaries from Wikipedia, CC BY-SA 4.0 (credit Wikipedia); facts from Wikidata (CC0) and UCDP/PRIO (CC BY 4.0); compilation © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/upcoming-political-events.json (records at `records`)
- Fields: `date` (date), `country` (string), `title` (string), `type` (string), `status` (string), `source` (string), `summary` (string), `ref` (string), `refName` (string)

## Retrospective Geopolitics

### political-calendar

Historical Calendar: political events since 1980. Political history from 1980 to today and scheduled events ahead, one file per decade: elections and referendums, new leaders, inaugurations and resignations, coups, wars and ceasefires, assassinations, summits, treaties, sanctions, protests, parliamentary votes and court rulings, each with a plain-English account. The Realtime Calendar shows the same records for the current window.

- Rows: 5,659 · refresh: daily · licence: Summaries from Wikipedia, CC BY-SA 4.0 (credit Wikipedia); facts from Wikidata (CC0) and UCDP/PRIO (CC BY 4.0); compilation © JDP-Iq.
- Files: https://jdpi.pages.dev/calendar/data/1980s.json, https://jdpi.pages.dev/calendar/data/1990s.json, https://jdpi.pages.dev/calendar/data/2000s.json (+2 more) (records at `events`)
- Fields: `date` (date), `country` (string), `title` (string), `type` (string), `status` (string), `source` (string), `summary` (string), `ref` (string), `refName` (string)

### encyclopaedia-entities

Encyclopaedia: entities. Every person, place, party, election, war, event, idea and organisation in the Vitruvian Manager Encyclopaedia, keyed by Wikidata id, with its main dates, country, how often Vitruvian Manager mentions it and which submodules it appears in. One shard per type. Full records (facts, relations, tags, every mention, Wikipedia summary) are one get_entity call away, or at lake/data/e/<qid number % 512>.json.

- Rows: 12,051 · refresh: monthly · licence: Wikidata facts, labels and descriptions CC0; tags and links © JDP-Iq. (Wikipedia summaries, CC BY-SA 4.0, are only in the full entity records.)
- Files: https://jdpi.pages.dev/integration/data/encyclopaedia-entities/0.json, https://jdpi.pages.dev/integration/data/encyclopaedia-entities/1.json, https://jdpi.pages.dev/integration/data/encyclopaedia-entities/2.json (+12 more) (records at `records`)
- Fields: `qid` (string), `label` (string), `type` (string), `description` (string), `start` (string), `end` (string), `country` (string), `mentions` (number), `appears_in` (array), `wikipedia` (string)

### retrospective-wars

Retrospective Battlefield: wars and armed conflicts 1926–2025. Every war and armed conflict from 1926 to 2025: UCDP/PRIO from 1946 (25+ battle deaths a year; intensity 2 means 1,000+), Correlates of War before (wars of 1,000+ battle deaths), with type, aim, sides, where it was fought and its active years.

- Rows: 343 · refresh: static · licence: UCDP/PRIO Armed Conflict Dataset CC BY 4.0 (1946–2025); Correlates of War data free to use with citation (Sarkees & Wayman 2010); state names from CShapes 2.0 (CC BY-NC-SA 4.0).
- File: https://jdpi.pages.dev/integration/data/retrospective-wars.json (records at `records`)
- Fields: `id` (string), `dataset` (string), `name` (string), `type` (string), `aim` (string), `start` (date), `first_year` (number), `last_year` (number), `active_years` (number), `peak_intensity` (number), `war_years` (number), `fought_in` (array), `states_involved` (array), `side_a` (array), `side_b` (array), `battle_deaths` (number), `wikipedia` (string)

### war-focus-wars

War Focus: major wars. The major wars of the last hundred years that War Focus follows month by month: dates, sides, total deaths and where the figure comes from, and how many battles are recorded and mapped.

- Rows: 39 · refresh: monthly · licence: UCDP GED CC BY 4.0; PRIO Battle Deaths and Correlates of War free to use with citation; battles from Wikidata (CC0); borders CShapes 2.0 CC BY-NC-SA 4.0 (non-commercial).
- File: https://jdpi.pages.dev/battlefield/focus/data/index.json (records at `wars`)
- Fields: `id` (string), `name` (string), `qid` (string), `wiki` (string), `bf` (string), `start` (date), `end` (date), `ongoing` (boolean), `totalDeaths` (number), `deathsSource` (string), `battles` (number), `mappedBattles` (number), `events` (number), `sides` (array), `bbox` (array)

### war-focus-battles

War Focus: battles, sieges and operations. Every battle, siege and operation that Wikidata records as part of a War Focus war, with dates at the precision Wikidata gives, deaths or casualties where known, and coordinates where mapped.

- Rows: 4,347 · refresh: monthly · licence: Wikidata CC0.
- Files: https://jdpi.pages.dev/integration/data/war-focus-battles/0.json, https://jdpi.pages.dev/integration/data/war-focus-battles/1.json, https://jdpi.pages.dev/integration/data/war-focus-battles/2.json (+2 more) (records at `records`)
- Fields: `war_id` (string), `war` (string), `qid` (string), `name` (string), `description` (string), `start` (date), `end` (date), `precision` (string), `deaths` (number), `casualties` (number), `lat` (number), `lon` (number), `wikipedia` (string)

### war-focus-monthly-deaths

War Focus: deaths by month. Deaths in each War Focus war month by month. Where no monthly record exists, annual or war totals are spread across months by recorded events or battles; those months are marked as estimates.

- Rows: 3,494 · refresh: monthly · licence: UCDP GED CC BY 4.0; PRIO Battle Deaths and Correlates of War free to use with citation; battles from Wikidata (CC0); borders CShapes 2.0 CC BY-NC-SA 4.0 (non-commercial).
- Files: https://jdpi.pages.dev/integration/data/war-focus-monthly-deaths/0.json, https://jdpi.pages.dev/integration/data/war-focus-monthly-deaths/1.json (records at `records`)
- Fields: `war_id` (string), `war` (string), `month` (date), `deaths` (number), `estimated` (boolean), `source` (string)

### kardashev-polities

Kardashev Tracker: powers. The empires and countries the Kardashev Tracker follows from 2000 BC to today, with their capital's position and years.

- Rows: 82 · refresh: static · licence: Estimates © JDP-Iq after Ian Morris (2010, 2013), McEvedy & Jones and Maddison; from 1900, Energy Institute / Our World in Data (CC BY 4.0).
- File: https://jdpi.pages.dev/kardashev/data/energy.json (records at `polities`)
- Fields: `id` (string), `name` (string), `lat` (number), `lon` (number), `region` (string), `wiki` (string), `from` (number), `to` (number)

### kardashev-shares

Kardashev Tracker: shares of world energy. Each power's population, energy capture per person and share of humanity's energy capture, century by century from 2000 BC (then 1850, 1900, 1950, 2000 and 2025), with its own Kardashev rating. "Rest of world" rows complete each year.

- Rows: 349 · refresh: static · licence: Estimates © JDP-Iq after Ian Morris (2010, 2013), McEvedy & Jones and Maddison; from 1900, Energy Institute / Our World in Data (CC BY 4.0).
- File: https://jdpi.pages.dev/integration/data/kardashev-shares.json (records at `records`)
- Fields: `year` (number), `polity_id` (string), `polity` (string), `population` (number), `kcal_per_person_day` (number), `watts` (number), `share` (number), `kardashev` (number)

### kardashev-world

Kardashev Tracker: humanity. World population, total energy capture and humanity's Kardashev rating (Sagan: K = (log10 P − 6) / 10, P in watts) for each step from 2000 BC to 2025.

- Rows: 44 · refresh: static · licence: Estimates © JDP-Iq after Ian Morris (2010, 2013), McEvedy & Jones and Maddison; from 1900, Energy Institute / Our World in Data (CC BY 4.0).
- File: https://jdpi.pages.dev/integration/data/kardashev-world.json (records at `records`)
- Fields: `year` (number), `world_population` (number), `world_watts` (number), `kardashev` (number)

## Money Management

### econ-briefing-stories

Economics Briefing: stories and papers. Every paper and story in the Economics Briefing over the last 7 days, classed by fields (macro, monetary, trade, labour, development, finance, public, energy) and by type (papers or news). Join `source` to econ-briefing-sources.

- Rows: 510 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/econ/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `fields` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `authors` (string), `also` (array), `undated` (boolean)

### econ-briefing-sources

Economics Briefing: sources. The journals, preprint servers, institutions and news desks the Economics Briefing reads, with their tier, default fields and feed status.

- Rows: 50 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/econ/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `fields` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `notModified` (boolean), `strict` (boolean), `badge` (string)

### congress-members

Auto Trader: members of Congress who trade. Members of the US House of Representatives with Periodic Transaction Reports in 2025 and 2026, with party, district and how many trades Vitruvian Manager read from their filings.

- Rows: 144 · refresh: weekly · licence: Public records: Periodic Transaction Reports filed with the Clerk of the US House of Representatives (STOCK Act); compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/congress-members.json (records at `records`)
- Fields: `id` (string), `name` (string), `party` (string), `district` (string), `state` (string), `bioguide` (string), `filings` (number), `trades` (number), `unreadable_filings` (number)

### congress-trades

Auto Trader: trades by members of Congress. Every stock, bond and option trade reported by members of the House in 2025 and 2026 (STOCK Act), newest filing first, sharded by filing date. Amounts are the ranges filed, with their bounds as numbers.

- Rows: 11,301 · refresh: weekly · licence: Public records: Periodic Transaction Reports filed with the Clerk of the US House of Representatives (STOCK Act); compilation © JDP-Iq. Not investment advice.
- Files: https://jdpi.pages.dev/integration/data/congress-trades/0.json, https://jdpi.pages.dev/integration/data/congress-trades/1.json, https://jdpi.pages.dev/integration/data/congress-trades/2.json (+14 more) (records at `records`)
- Fields: `filed` (date), `date` (date), `member` (string), `name` (string), `party` (string), `district` (string), `owner` (string), `type` (string), `ticker` (string), `asset` (string), `asset_type` (string), `amount` (string), `amount_min` (number), `amount_max` (number), `account` (string), `filing` (string)

### investors

Auto Trader: famous investors. The famous investors Auto Trader follows, with their fund, style, latest 13F period and filing, and the reported value of their US long positions.

- Rows: 10 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/investors.json (records at `records`)
- Fields: `cik` (number), `person` (string), `fund` (string), `style` (string), `registered_name` (string), `period` (date), `filed` (date), `previous_period` (date), `total_value` (number), `positions` (number), `sold_out` (number), `filing` (string)

### investor-holdings

Auto Trader: famous investors' holdings. Every position in the latest 13F filing of each famous investor, with value, shares, weight in the portfolio and the change since the previous filing (new, added, reduced, unchanged).

- Rows: 1,537 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- Files: https://jdpi.pages.dev/integration/data/investor-holdings/0.json, https://jdpi.pages.dev/integration/data/investor-holdings/1.json (records at `records`)
- Fields: `person` (string), `fund` (string), `period` (date), `name` (string), `ticker` (string), `class` (string), `cusip` (string), `put_call` (string), `value` (number), `shares` (number), `weight` (number), `change` (string), `shares_change` (number)

### investor-sales

Auto Trader: famous investors' exits. Positions each famous investor held at the previous quarter end and no longer reports in the latest 13F.

- Rows: 370 · refresh: weekly · licence: Public records: SEC EDGAR Form 13F-HR filings; tickers mapped with OpenFIGI; compilation © JDP-Iq. Not investment advice.
- File: https://jdpi.pages.dev/integration/data/investor-sales.json (records at `records`)
- Fields: `person` (string), `fund` (string), `period` (date), `previous_period` (date), `name` (string), `ticker` (string), `class` (string), `cusip` (string), `put_call` (string), `previous_value` (number), `previous_shares` (number)

## Natural Science

### science-briefing-stories

Scientific Briefing: stories and papers. Every paper and story in the Scientific Briefing over the last 7 days, classed by disciplines (physics, chemistry, biology, earth, space) and by type (papers or news). Join `source` to science-briefing-sources.

- Rows: 1,089 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/science/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `disciplines` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `also` (array)

### science-briefing-sources

Scientific Briefing: sources. The journals, preprint servers, institutions and news desks the Scientific Briefing reads, with their tier, default disciplines and feed status.

- Rows: 45 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/science/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `disciplines` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `error` (string), `notModified` (boolean)

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

- Rows: 1,187 · refresh: monthly · licence: Wikidata CC0.
- File: https://jdpi.pages.dev/integration/data/science-progress-institutions.json (records at `records`)
- Fields: `qid` (string), `name` (string), `description` (string), `lat` (number), `lon` (number), `wikipedia` (string)

## Digital Science

### digital-briefing-stories

Digital Briefing: stories and papers. Every paper and story in the Digital Briefing over the last 7 days, classed by fields (ai, software, security, hardware, networks, quantum, privacy, policy) and by type (papers or news). Join `source` to digital-briefing-sources.

- Rows: 832 · refresh: 6-hourly · licence: Titles, links and short summaries © their publishers, quoted for reference; classification and metadata © JDP-Iq.
- File: https://jdpi.pages.dev/digital/briefing/data/stories.json (records at `items`)
- Fields: `id` (string), `title` (string), `url` (string), `source` (string), `kind` (string), `tier` (number), `fields` (array), `type` (string), `published` (date), `summary` (string), `section` (string), `doi` (string), `authors` (string), `also` (array)

### digital-briefing-sources

Digital Briefing: sources. The journals, preprint servers, institutions and news desks the Digital Briefing reads, with their tier, default fields and feed status.

- Rows: 79 · refresh: 6-hourly · licence: Metadata © JDP-Iq.
- File: https://jdpi.pages.dev/digital/briefing/data/stories.json (records at `sources`)
- Fields: `id` (string), `outlet` (string), `outletId` (string), `name` (string), `url` (string), `feed` (string), `kind` (string), `tier` (number), `fields` (array), `qid` (string), `status` (string), `count` (number), `stored` (number), `latest` (date), `checked` (date), `lastOk` (date), `etag` (string), `lastModified` (string), `notModified` (boolean), `strict` (boolean), `badge` (string), `perDay` (number), `matched` (number)

### prp-submodules

Vitruvian Manager: modules and submodules. Every Vitruvian Manager submodule: its module, kind, status, address and what it does. Private submodules (behind their own sign-in) are listed but none of their data is published here.

- Rows: 36 · refresh: on change · licence: © JDP-Iq.
- File: https://jdpi.pages.dev/integration/data/prp-submodules.json (records at `records`)
- Fields: `module` (string), `module_code` (string), `module_name` (string), `id` (string), `name` (string), `kind` (string), `status` (string), `private` (boolean), `url` (string), `planned_url` (string), `host` (string), `description` (string), `views` (array)

## Kino

### kino-documentaries

Kino: documentaries and courses. Every Kino documentary and Great Thinkers course: category, era, running time, subjects (Wikidata ids), scenes, parts, quiz questions, how many sources (and scholarly sources) it draws on, and the Vitruvian Manager submodules its scenes link to.

- Rows: 18 · refresh: monthly · licence: Documentary texts and index © JDP-Iq; images from Wikimedia Commons, each under its own licence (kino/data/media.json).
- File: https://jdpi.pages.dev/kino/data/index.json (records at `docs`)
- Fields: `id` (string), `title` (string), `category` (string), `era` (array), `minutes` (number), `summary` (string), `subjects` (array), `scenes` (number), `parts` (number), `quiz` (number), `sources` (number), `scholarly` (number), `links` (array), `preview` (object), `path` (string)

// Which of Wikidata's referendums the calendars keep, and where an item with no country of its own is placed. Used by
// build-events.mjs; pure, so that the tests can read the rules (follow-up of the corrections of 26 November 2026).
import { normaliseCountry } from './countries.mjs';

// Party contests that Wikidata files under referendums: primaries and caucuses, and (follow-up of 26 November 2026)
// leadership elections, party congresses and conventions and presidential nominating contests ("2017 Lega Nord
// leadership election", "2021 The Republicans congress", "Super Tuesday, 2008", "2024 Nevada Republican presidential
// nominating contests" stood on the calendar as referendums). A congress or a convention is a party's only when a party
// is named ("national convention", "Republicans congress", "Congress of the … Party"): a constitutional convention or a
// treaty's convention is not (second readers, 26 November 2026; "2020 United States Virgin Islands constitutional
// convention referendum" had been typed as a party contest).
export const PARTY_CONTEST = /\bprimar(?:y|ies)\b|\bcaucus|\bnominating contests?\b|\bSuper Tuesday\b|\bleadership election\b|\b(?:national|Republicans|Democrats?) (?:congress|convention)\b|\bcongress$|\bParty\b[^,;]*\b(?:congress|convention)\b|\b(?:congress|convention) of the [^,;]*\bParty\b/i;
// A referendum below the level of the state: held in a region, a province, a city or a breakaway territory that the
// calendar files under its state ("2018 California Proposition 12" and "2017 Lombard autonomy referendum" stood as
// national votes of the United States and Italy; follow-up of 26 November 2026). Wikidata says where the vote applies
// (P1001, applies to jurisdiction; P131, located in): a place there that is not a state marks it; where Wikidata says
// nothing, its title does, as the Political Retrospective's build reads the titles of its votes (hp-retrospective
// scripts/build-data.mjs). A vote on a territory's independence, sovereignty or status, as its title or Wikipedia's lead
// names it, stays: it decides what the territory is, and its title names the territory. One on its autonomy within the
// state does not (the Lombard, Venetian, Catalan, Corsican, Guadeloupean and Greenlandic votes). One filed under the de
// facto state it was held in ("Republic of Abkhazia": DE_FACTO, below) is that state's own vote, and one held in a
// dependent territory is filed under the territory (ownTerritory, below).
export const STATUS_VOTE = /\b(?:independence|sovereignty|status|self-determination|annexation|secession|partition|reunification)\b/i;
export const LOCAL_VOTE = /\b(?:municipal|local|regional|provincial|county|city|mayoral|cantonal|gubernatorial|devolution|autonomy)\b/i;
// "Hamburg\w*" takes "Hamburger Zukunftsentscheid" with "Hamburg testet Grundeinkommen", the two Hamburg votes of 12
// October 2025; "Brno", "Arenys de Munt", "North Kosovo", "Hong Kong" and "… Region referendum" (Ethiopia's regions)
// the municipal and regional votes the second readers found still standing as national ones (26 November 2026).
export const REGION_VOTE = /\b(?:Quebec|Alberta|Andalusian|Catalan|Basque|Galician|Crimean|Greenlandic|Ålandic|Faroese|Nunavut|Northwest Territories|Northern Territory|Scottish|Welsh|Northern Ireland|Corsican|Venetian|Lombard|Kurdistan|Transnistrian|South Ossetian|Abkhazian|Nagorno-Karabakh|Somaliland|Republika Srpska|Osaka|Okinawan|Hamburg\w*|Berlin|Bavarian|Greater London|Sidama|Palawan|Brno|Arenys de Munt|North Kosovo|Hong Kong|Region referendum)\b/i;
// Votes below the state whose titles name no place, each with Wikipedia's lead (calendar/scripts/summary-cache.json,
// read 26 November 2026). A town's poll on independence is a town's poll: these and the titles above go before the
// status rule is read ("2009 Catalan independence referendum in Arenys de Munt": "a municipal non-binding query … held in
// Arenys de Munt").
export const LOCAL_TITLES = new Map([
  ['Deutsche Wohnen & Co. enteignen', 'The 2021 Berlin referendum on a resolution to work out a draft for a law to expropriate housing stock'],
  ['6.22 Civil Referendum', 'initiated by the Occupy Central with Love and Peace movement and organized by the Public Opinion Programme of the University of Hong Kong'],
]);
const TOWN_VOTE = /\b(?:in|of) (?:Arenys de Munt|Brno)\b|\bmunicipal\b/i;
// The de facto states the calendar files votes under by their own names ("Republic of Abkhazia", "Republic of
// Artsakh"). It is read from the name the calendar files the vote under (normaliseCountry): Wikidata's "South Ossetia",
// "Transnistria", "Somaliland" and "Republika Srpska" are filed under Georgia, Moldova, Somalia and Bosnia and
// Herzegovina, so a vote held there alone is a vote in a part of that state (second readers, 26 November 2026: "2011
// South Ossetian referendum" stood as a national referendum of Georgia, "2003 Transnistrian referendum" as Moldova's).
export const DE_FACTO = /^(?:Republic of |Somaliland$|South Ossetia$|Transnistria$|Republika Srpska$|Northern Cyprus$|Turkish Republic of Northern Cyprus$)/;
// Votes on a territory's sovereignty or status whose titles do not say so, each with Wikipedia's lead (read 26 November
// 2026): they stay, under their state.
export const STATUS_TITLES = new Map([
  ['1980 Quebec referendum', 'whether Quebec should pursue a path toward sovereignty'],
  ['1995 Quebec referendum', 'whether Quebec should proclaim sovereignty and become an independent country'],
  ['2010 Bonaire constitutional referendum', 'The new constitution would make the island a municipality within the Netherlands'],
  ['1998 Northern Territory referendum', 'whether the Territory should become a State of the Commonwealth of Australia'],
  ['1991 Transcarpathian general regional referendum', 'On the granting Transcarpathian region status of an autonomous province within Ukraine'],
  ['2001 Somaliland constitutional referendum', "a draft constitution that affirmed Somaliland's independence from Somalia"],
  ['1993 Republika Srpska referendum', 'whether Republika Srpska should be able to join another country'],
  ['1989–1990 Transnistrian referendum', 'on the formation of the Pridnestrovian Moldavian Soviet Socialist Republic'],
]);
// National votes whose titles read like a region's, with Wikipedia's lead (read 26 November 2026): "2004 Macedonian
// autonomy referendum" was a vote of the whole country on its municipal boundaries, and "autonomy" (LOCAL_VOTE) had left
// it out (second readers, 26 November 2026).
export const NATIONAL_TITLES = new Map([
  ['2004 Macedonian autonomy referendum', 'An autonomy referendum was held in Macedonia on 7 November 2004'],
]);
// Dependent territories that the calendar files under their own names (normaliseCountry keeps them): a vote held in one
// alone is the territory's own, as the Gibraltar abortion referendum of 2021 and Bermuda's of 2016 are, not a vote in
// a part of the United Kingdom or the United States (second readers, 26 November 2026: the Falklands' and Saint
// Helena's votes had been left out while Gibraltar's and Bermuda's stood). Greenland, the Faroe Islands, Puerto Rico,
// Guam, Hong Kong and Macau are filed under their states, so they are not here.
export const DEPENDENT = new Set(['Falkland Islands', 'Gibraltar', 'Bermuda', 'Cayman Islands', 'Guernsey', 'Jersey', 'Isle of Man', 'Saint Helena',
  'Saint Helena, Ascension and Tristan da Cunha', 'Anguilla', 'Montserrat', 'British Virgin Islands', 'Turks and Caicos Islands', 'Pitcairn Islands',
  'United States Virgin Islands', 'American Samoa', 'Northern Mariana Islands', 'Tokelau', 'Niue', 'Cook Islands', 'Aruba', 'Curaçao', 'Sint Maarten']);
/** The dependent territory a referendum was held in alone, by Wikidata's jurisdictions, or null. */
export function ownTerritory(jurs = []) {
  const set = new Set(jurs);
  const [j] = set;
  return set.size === 1 && DEPENDENT.has(j) && normaliseCountry(j) === j ? j : null;
}
export function belowState({ title, country, jurs = [], jurState = false }) {
  if (NATIONAL_TITLES.has(title)) return false;
  if (LOCAL_TITLES.has(title) || TOWN_VOTE.test(title)) return true;
  if (STATUS_VOTE.test(title) || STATUS_TITLES.has(title) || DE_FACTO.test(normaliseCountry(country))) return false;
  if (jurs.length && !jurState && !jurs.some(j => normaliseCountry(j) === normaliseCountry(country))) return true;
  return LOCAL_VOTE.test(title) || REGION_VOTE.test(title) || (normaliseCountry(country) === 'United States' && !/\bUnited States\b/.test(title));
}
// Referendums Wikidata dates on a day no vote was held, each with the source that says so. The 2020 Armenian referendum
// "was initially scheduled for 5 April 2020, but on 16 March 2020 was indefinitely postponed as a result of the COVID-19
// pandemic. In the absence of a referendum, the parliament instead voted for the constitutional amendment directly"
// (Wikipedia, "2020 Armenian constitutional amendment", read 26 November 2026); Wikidata (Q84502896) keeps 5 April 2020.
// The Falklands' electoral system referendum of 2020 "was held in the Falkland Islands on 24 September 2020, after being
// postponed from 26 March 2020" (Wikipedia, read 26 November 2026); Wikidata (Q60659254) keeps 26 March.
export const NOT_HELD = new Set(['2020 Armenian constitutional amendment', '2020 Falkland Islands electoral system referendum']);
// A referendum whose title's year is not its date's: Wikidata's date is a schedule the vote did not keep ("2025
// Marshallese constitutional referendum", dated 20 November 2023, the general election's day; Wikipedia: "held in the
// Marshall Islands on 25 April 2025 … Originally scheduled to be held concurrently with the 2023 Marshallese general
// election, it was delayed to 2025", read 26 November 2026). It is left out; the Atlas gives the day it was held.
export const offYear = (title, date) => { const y = /^(\d{4})(?:[–-](\d{2,4}))?\s/.exec(title); return !!y && !y[2] && y[1] !== date.slice(0, 4); };
// Items with no country of their own, placed by their class's country (P31 → P17: the Barnier government's fall
// is a "motion of no confidence in France", Q113840080) or, where Wikidata has nothing, here, with the source.
export const PLACED = {
  // Wikipedia: "a motion of no confidence in the government of Theresa May was tabled in the House of Commons"
  // (the United Kingdom's; read 26 November 2026). Wikidata Q60639582 has no country.
  '2019 vote of confidence in the May ministry': 'United Kingdom',
};

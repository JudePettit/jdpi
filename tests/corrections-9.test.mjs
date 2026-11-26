// Build 9 of ChatGPT's confirmed page faults (25 November 2026): the Realtime Battlefield's wording.
//   front-pages-45  "Ethiopia: Amhara and Oromia insurgencies" held 204 deaths in Tigray and the Government of Ethiopia
//                   v TPLF dyad (conflict 267), and its background said the Tigray war had ended in a peace deal.
//   front-pages-47  "Main fighting" joined UCDP's dyad names, whose " - " also falls inside actors' own names.
//   front-pages-48  "1 have no area recorded below the country", with no singular.
// The rows below are UCDP's own (candidate events v26.01.26.09, the columns the note reads, each value as UCDP gives it;
// ids 645098, 644608 and 645389, 644962 for a one-death event dated only to the month, and, after the second readers,
// 634946 for a side whose actor has " and " in its own name and 622778 for a state UCDP names for its old and new selves).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARS } from '../battlefield/scripts/wars.mjs';
import { monthInsight, sidesOf } from '../battlefield/scripts/realtime-insight.mjs';

const REALTIME = JSON.parse(readFileSync(new URL('../battlefield/data/realtime.json', import.meta.url), 'utf8'));
const row = (id, date_start, date_end, date_prec, best, deaths_civilians, conflict_new_id, side_a, side_b, type_of_violence, country, region, adm_1) =>
  ({ id, date_start: `${date_start} 00:00:00.000`, date_end: `${date_end} 00:00:00.000`, date_prec, best, deaths_civilians, conflict_new_id,
    dyad_name: `${side_a} - ${side_b}`, side_a, side_b, type_of_violence, country, region, adm_1, where_description: '', source_headline: '', source_office: '' });
const JALISCO = row('645098', '2026-09-01', '2026-09-01', '1', '1', '0', '16799', 'Jalisco Cartel New Generation, Sinaloa Cartel - Los Chapitos', 'Sinaloa Cartel - Los Mayos', '2', 'Mexico', 'Americas', 'Sinaloa state');
const UNIDENTIFIED = row('644608', '2026-09-09', '2026-09-09', '1', '2', '0', '107', 'XXX70', 'XXX70', '1', 'Mexico', 'Americas', 'Sinaloa state');
const IRAN = row('645389', '2026-09-23', '2026-09-23', '1', '1', '1', '16905', 'Government of Iran', 'Government of Israel, Government of United States of America', '1', 'Iran', 'Middle East', '');
const BANGLADESH = row('644962', '2026-09-01', '2026-09-30', '4', '1', '0', '10513', 'Supporters of Awami League', 'Supporters of Jamaat-e-Islami', '2', 'Bangladesh', 'Asia', '');
// One UCDP side (side_a_new_id 9950, dyad 18977, conflict 16988) of two organisations, one of them "March and March".
const DUDULA = row('634946', '2026-05-29', '2026-05-31', '2', '3', '3', '16988', 'March and March, Operation Dudula', 'Civilians', '3', 'South Africa', 'Africa', 'Western Cape province');
// UCDP's "Government of Russia (Soviet Union)", in 2026.
const RUSSIA = row('622778', '2026-02-07', '2026-02-07', '1', '1', '1', '453', 'Government of Russia (Soviet Union)', 'Civilians', '3', 'Central African Republic', 'Africa', 'Haut-Mbomou prefecture');
const two = { conflicts: new Map([['107', {}], ['16799', {}]]) };

test('Build 9, front-pages-45: the Ethiopia group is named for Tigray too, and its background does not leave the Tigray war ended', () => {
  const eth = WARS.find(w => w.id === 'ethiopia');
  assert.equal(eth.name, 'Ethiopia: Amhara, Oromia and Tigray');
  assert.ok(eth.ids.includes(267), 'conflict 267 (Government of Ethiopia v TPLF) is in the group');
  assert.match(eth.background, /peace agreement signed in Pretoria in November 2022/);
  assert.match(eth.background, /In 2026 UCDP again records fighting between the government and the TPLF in Tigray\./);
  assert.doesNotMatch(eth.background, /ended in a peace deal, fighting moved/);
  // The committed data is built from it, and its notes show the TPLF fighting in Tigray this year.
  const live = REALTIME.wars.find(w => w.id === 'ethiopia');
  assert.equal(live.name, eth.name);
  assert.equal(live.background, eth.background);
  assert.ok(live.monthly.some(m => /Tigray, Ethiopia \(\d/.test(m.text)), 'Tigray among the deadliest areas in a month');
  assert.ok(live.conflicts.some(c => c.id === 267));
});

test('Build 9, front-pages-47: "Main fighting" is each dyad\'s two UCDP sides, "A v B"', () => {
  assert.equal(sidesOf(JALISCO), 'Jalisco Cartel New Generation and Sinaloa Cartel - Los Chapitos v Sinaloa Cartel - Los Mayos');
  assert.equal(sidesOf(UNIDENTIFIED), 'unidentified armed group (Mexico) v unidentified armed group (Mexico)');
  assert.equal(sidesOf(IRAN), 'Government of Iran v Government of Israel and Government of United States of America');
  const x = monthInsight(two, [JALISCO, UNIDENTIFIED], '2026-09', null);
  assert.match(x.text, / Main fighting: unidentified armed group \(Mexico\) v unidentified armed group \(Mexico\); Jalisco Cartel New Generation and Sinaloa Cartel - Los Chapitos v Sinaloa Cartel - Los Mayos\.$/);
  // A file without the sides cannot write the line by the old join.
  const { side_a, ...noSide } = JALISCO;
  assert.throws(() => monthInsight(two, [noSide, UNIDENTIFIED], '2026-09', null), /side_a/);
  // A war of one conflict still names no dyads, and needs no sides.
  assert.doesNotMatch(monthInsight({ conflicts: new Map([['107', {}]]) }, [UNIDENTIFIED], '2026-09', null).text, /Main fighting/);
  // The committed notes: every "Main fighting" line is in sides, Mexico's among them.
  let lines = 0;
  for (const w of REALTIME.wars) for (const m of w.monthly) {
    const mf = m.text.match(/ Main fighting: (.*)\.$/);
    if (!mf) continue;
    lines++;
    for (const d of mf[1].split('; ')) assert.match(d, / v /, `${w.id} ${m.month}: ${d}`);
  }
  assert.ok(lines > 50, `${lines} Main fighting lines`);
  const mexico = REALTIME.wars.find(w => w.id === 'mexico').monthly.find(m => m.month === '2026-09');
  assert.match(mexico.text, /Jalisco Cartel New Generation and Sinaloa Cartel - Los Chapitos v Sinaloa Cartel - Los Mayos/);
});

test('Build 9, front-pages-47 after the second readers: "and" never sits both between actors and inside a name; states by their name on the day', () => {
  // "March and March" is one organisation: its side keeps UCDP's own comma list, not "March and March and Operation Dudula".
  assert.equal(sidesOf(DUDULA), 'March and March, Operation Dudula v Civilians');
  // Other alliances are still joined with "and".
  assert.equal(sidesOf(JALISCO), 'Jalisco Cartel New Generation and Sinaloa Cartel - Los Chapitos v Sinaloa Cartel - Los Mayos');
  // UCDP's dual state name gives the name that fits the date (ucdp.mjs stateName), keeping "Government of".
  assert.equal(sidesOf(RUSSIA), 'Government of Russia v Civilians');
  assert.equal(sidesOf({ ...RUSSIA, date_start: '1980-01-01 00:00:00.000' }), 'Government of Soviet Union v Civilians');
  // The committed notes.
  const southAfrica = REALTIME.wars.find(w => w.id === 'other-south-africa').monthly;
  for (const m of ['2026-05', '2026-06']) assert.match(southAfrica.find(x => x.month === m).text, /March and March, Operation Dudula v Civilians/, m);
  const wrong = [];
  for (const w of REALTIME.wars) for (const m of w.monthly) {
    const mf = m.text.match(/ Main fighting: (.*)\.$/);
    if (mf && /March and March and|\((Soviet Union|North Yemen|Burma|Zaire)\)/.test(mf[1])) wrong.push(`${w.id} ${m.month}: ${mf[1]}`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(REALTIME.wars.some(w => w.monthly.some(m => / Main fighting: .*Government of Russia v /.test(m.text))), 'a 2026 line names Government of Russia');
});

test('Build 9, front-pages-48: a count of one is singular ("1 has no area recorded below the country")', () => {
  const x = monthInsight({ conflicts: new Map([['16905', {}]]) }, [IRAN], '2026-09', null);
  assert.equal(x.unplacedDeaths, 1);
  assert.match(x.text, /^September: 1 event, about 1 death \(1 civilian\)\./);
  assert.match(x.text, / 1 has no area recorded below the country\./);
  const p = monthInsight({ conflicts: new Map([['10513', {}]]) }, [BANGLADESH], '2026-09', null);
  assert.match(p.text, / Of these deaths, 1 is in an event UCDP dates only to a month or a longer period, not to a day, counted here in the month it starts\./);
  // More than one keeps the plural.
  const many = monthInsight(two, [JALISCO, UNIDENTIFIED], '2026-09', null);
  assert.match(many.text, /^September: 2 events, about 3 deaths\./);
  // The committed notes have no count of one in the plural.
  const wrong = [];
  for (const w of REALTIME.wars) for (const m of w.monthly) {
    if (/(^|\D)1 (have no area|events|deaths|civilians\)|are in events)/.test(m.text.replace(/\d,\d/g, '0'))) wrong.push(`${w.id} ${m.month}`);
  }
  assert.deepEqual(wrong, []);
});

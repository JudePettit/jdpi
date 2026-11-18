// Learning: the Finance and Economics (Wealth Automation) and Politics (Retrospective Geopolitics) courses render,
// quizzes respond, progress saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pageTest } from './tools/pages.mjs';
import { fileURLToPath } from 'node:url';
import { THINKERS, POSITIONS, UNIT_POSITION, POSITION_NOTE, TAG_GROUPS, positionTag } from '../lake/scripts/thinkers.mjs';
import { learning, mentionTags, ADAPTER_TAG_GROUPS } from '../lake/scripts/adapters.mjs';
import { POSITIONS as BRIEFING_POSITIONS } from '../briefing/scripts/sources.mjs';
import { findQuote, quotedRuns, pieces, shelfParagraphs } from '../bibliotheca/scripts/quotes.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const ownOf = name => THINKERS.find(t => t[0] === name)[3];

test('politics: realism is taught as a school of its own, outside the line from left to right', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  // The units are named as the Political Briefing names its positions, and the Realists' unit by its school (Jude's
  // choice 5, 18 November 2026). Saved progress and links are keyed by the lesson's title, not the unit's (fe/learning.html).
  assert.deepEqual(units.map(u => u.split(' · ')[0]), ['Introduction', 'Far left', 'Left', 'Centre', 'Right', 'Realism', 'Far right', 'Comparing the spectrum'], 'the units, in their places');
  assert.equal(units[4], 'Right · Conservatism and market liberalism');
  assert.equal(units[5], 'Realism · John Mearsheimer and the Realists');
  // No sentence, heading, table cell or answer files the Realists or realism under the right.
  for (const line of md.split('\n')) assert.doesNotMatch(line, /\bright( wing)?\s*\((Realists?|Mearsheimer)|realism is closer to the right|the right is represented by|^# Right\b.*Realis/i, line);
  // The quiz on the crisis: its right answer is the Realists, not a place on the line.
  const crisis = md.slice(md.indexOf('? Which of these would most stress the balance of power'));
  assert.match(crisis.split('\n').find(l => l.startsWith('+ ')), /^\+ The Realists$/);
  // The Master Index takes a position from the unit: the realists' unit gives none, to anyone.
  for (const own of [...POSITIONS, undefined]) assert.equal(positionTag(units[5], own), null, `the Realism unit gives ${own} no position`);
  assert.equal(positionTag(units[5], ownOf('John Mearsheimer')), null);
  assert.equal(ownOf('John Mearsheimer'), undefined, 'Mearsheimer has no position of his own');
  assert.equal(positionTag(units[6], 'Far right'), 'Far right');
  assert.equal(positionTag(units[6], ownOf('Robert Paxton')), null, 'a scholar taught in the unit takes no position from it');
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning-politics').description;
  assert.doesNotMatch(desc, /right \(Mearsheimer/i);
  assert.match(desc, /Realists/);
  assert.match(desc, /right \(conservatism and market liberalism\)/);
});

test('politics: the mainstream right has its unit, in the form of the others, with no realist and no far right in it', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const unitOf = title => { const at = md.indexOf(`\n# ${title}`); return md.slice(at + 1, md.indexOf('\n# ', at + 1)); };
  const right = unitOf('Right · '), farLeft = unitOf('Far left · ');
  const heads = u => u.split('\n').filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/\b(the far left|the right)\b/gi, 'X'));
  assert.deepEqual(heads(right), ['## Thinkers of X', '### Shared commitments', '## X in power and its critics', '### What critics say', '### What defenders say']);
  assert.deepEqual(heads(right), heads(farLeft), 'the same headings as the far left');
  for (const name of ['Burke', 'Hayek', 'Friedman', 'Oakeshott', 'Buckley', 'Thatcher', 'Reagan', 'Kirk', 'Scruton']) assert.match(right, new RegExp(`\\*\\*[^*]*${name}`), `${name} is taught`);
  assert.match(right, /\*\*Neoliberalism\.\*\*.*used mostly by critics/);
  // Every lesson ends in a quiz with one right answer, as in the other units.
  for (const lesson of right.split('\n## ').slice(1)) {
    const qs = lesson.split('\n? ').slice(1);
    assert.ok(qs.length >= 1, 'a quiz');
    for (const q of qs) assert.equal(q.split('\n').filter(l => l.startsWith('+ ')).length, 1, q.split('\n')[0]);
  }
  // No realist under the right, and the far right stays in its own unit.
  assert.doesNotMatch(right, /Mearsheimer|Morgenthau|Waltz|Kissinger|Thucydides|Machiavelli|Hobbes|offensive realism|Mussolini|Hitler|fascis|Le Pen|Mudde/i);
  // The comparison has its five positions back, in order, with the Realists apart at the end.
  const head = md.split('\n').find(l => l.startsWith('| Question |'));
  assert.equal(head, '| Question | Far left | Left | Centre | Right | Far right | Realists (outside the line) |');
  const crisis = unitOf('Comparing the spectrum').slice(unitOf('Comparing the spectrum').indexOf('## A crisis'));
  assert.deepEqual([...crisis.matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]), ['Far left', 'Left', 'Centre', 'Right', 'Far right', 'Realists (Mearsheimer)']);
  const table = unitOf('Comparing the spectrum').split('\n## ')[1];
  assert.match(table.split('\n').find(l => l.startsWith('+ ')), /^\+ Right$/);
  // The Master Index: the unit gives "Right" to the right's own thinkers and schools only.
  const unit = 'Right · Conservatism and market liberalism';
  assert.equal(positionTag(unit, ownOf('Edmund Burke')), 'Right');
  for (const name of ['Thucydides', 'John Rawls', 'Christian democracy', 'Third Way', 'Neoliberalism']) assert.equal(positionTag(unit, ownOf(name)), null, name);
  // A thinker of the right named in another unit (Thatcher in a quiz on the left) takes no position from it.
  assert.equal(positionTag('Left · Social democracy and progressive liberalism', ownOf('Margaret Thatcher')), null);
});

test('politics: a unit gives its position to its own school only, never to the scholars and critics it teaches, and says it is VM\'s', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const units = md.split('\n').filter(l => l.startsWith('# ')).map(l => l.slice(2));
  const farRight = units.find(u => u.startsWith('Far right · '));
  // Mudde, Paxton and Griffin are taught in the far right's unit as its scholars: they take no position from it.
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) assert.equal(positionTag(farRight, ownOf(name)), null, name);
  for (const name of ['Benito Mussolini', 'Adolf Hitler', 'Jean-Marie Le Pen', 'Fascism']) assert.equal(positionTag(farRight, ownOf(name)), 'Far right', name);
  // In every unit, everyone the Master Index places there is that unit's own, and the placement says it is VM's.
  const mentions = learning({ jdpiDir: fileURLToPath(new URL('..', import.meta.url)) }).filter(x => x.module === 'learning-politics');
  const placed = mentions.flatMap(x => x.tags.filter(t => t[0] === 'Political position').map(t => [x.label, t[1], t[2]]));
  assert.ok(placed.length >= 60, `${placed.length} placed`);
  for (const [label, p, opt] of placed) {
    assert.equal(p, ownOf(label), `${label} takes ${p} without being taught as its own`);
    assert.deepEqual(opt, { note: POSITION_NOTE }, `${label}: the placement carries its note`);
  }
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin', 'John Mearsheimer', 'Kenneth Waltz']) assert.ok(mentions.some(x => x.label === name) && !placed.some(p => p[0] === name), `${name} is taught and placed nowhere`);
  // Beveridge's report is a wrong answer in a quiz on the centre: he stays the left's only.
  assert.deepEqual([...new Set(placed.filter(p => p[0] === 'William Beveridge').map(p => p[1]))], ['Left']);
  // The Economics and Finance courses place no one.
  assert.deepEqual(learning({ jdpiDir: fileURLToPath(new URL('..', import.meta.url)) }).filter(x => x.module === 'learning').flatMap(x => x.tags.filter(t => t[0] === 'Political position')), []);
  // The note is plain about what the placement is.
  assert.match(POSITION_NOTE, /^VM’s own placement, by the unit of the Politics course that teaches it; no source is cited for it yet$/);
});

// The labels before 18 November 2026 (lake/scripts/thinkers.mjs at jdpi 68fec1c), row by row, and table D3 of the canon
// review (VM-MASTER-INDEX-CANON-REVIEW.md) that maps each to its group and the discipline's word. The relabel is held
// to this: every former value is mapped as D3 says, and nothing is added.
const FORMER = new Map([
  ['Adam Smith', 'Classical economics, Capitalism, Economist, Philosopher'],
  ['David Ricardo', 'Classical economics, Economist'],
  ['Jean-Baptiste Say', 'Classical economics, Economist'],
  ['John Stuart Mill', 'Classical economics, Liberal, Centrist, Philosopher, Economist'],
  ['Karl Marx', 'Marxist, Communist, Socialist, Far left, Philosopher, Economist'],
  ['Friedrich Engels', 'Marxist, Communist, Socialist, Far left, Philosopher'],
  ['Vladimir Lenin', 'Marxist, Communist, Revolutionary socialist, Far left, Head of government'],
  ['Eduard Bernstein', 'Social democrat, Socialist, Left wing'],
  ['Oskar Lange', 'Market socialism, Socialist, Economist'],
  ['John Maynard Keynes', 'Keynesian, Economist'],
  ['John Hicks', 'Keynesian, Neoclassical synthesis, Economist'],
  ['Paul Samuelson', 'Keynesian, Neoclassical synthesis, Economist'],
  ['Hyman Minsky', 'Keynesian, Post-Keynesian, Economist'],
  ['Joan Robinson', 'Keynesian, Post-Keynesian, Economist'],
  ['Ludwig von Mises', 'Austrian School, Classical liberal, Economist'],
  ['Carl Menger', 'Austrian School, Economist'],
  ['Eugen von Böhm-Bawerk', 'Austrian School, Economist'],
  ['Friedrich Hayek', 'Austrian School, Classical liberal, Right wing, Economist, Philosopher'],
  ['Murray Rothbard', 'Austrian School, Anarcho-capitalist, Economist'],
  ['Milton Friedman', 'Chicago School, Monetarist, Classical liberal, Right wing, Economist'],
  ['Anna Schwartz', 'Chicago School, Monetarist, Economist'],
  ['Edmund Phelps', 'Economist'],
  ['Frank Knight', 'Chicago School, Economist'],
  ['George Stigler', 'Chicago School, Economist'],
  ['Ronald Coase', 'Chicago School, Law and economics, Economist'],
  ['Gary Becker', 'Chicago School, Economist'],
  ['Robert Lucas Jr.', 'Chicago School, New classical economics, Economist'],
  ['Eugene Fama', 'Chicago School, Efficient-market hypothesis, Economist'],
  ['Richard Werner', 'Credit creation theory, Economist'],
  ['James M. Buchanan', 'Public choice, Economist'],
  ['Harry Markowitz', 'Modern portfolio theory, Economist'],
  ['Rosa Luxemburg', 'Marxist, Revolutionary socialist, Far left'],
  ['Leon Trotsky', 'Marxist, Communist, Far left'],
  ['Mao Zedong', 'Marxist, Communist, Far left, Head of state'],
  ['Antonio Gramsci', 'Marxist, Far left, Philosopher'],
  ['Pierre-Joseph Proudhon', 'Anarchist, Far left, Philosopher'],
  ['Mikhail Bakunin', 'Anarchist, Far left'],
  ['Peter Kropotkin', 'Anarchist, Far left'],
  ['Joseph Stalin', 'Communist, Far left, Head of government'],
  ['Fidel Castro', 'Communist, Far left, Head of state'],
  ['William Beveridge', 'Liberal, Welfare state, Left wing, Economist'],
  ['Anthony Crosland', 'Social democrat, Left wing'],
  ['John Rawls', 'Liberal, Left wing, Philosopher, Political philosophy'],
  ['Franklin D. Roosevelt', 'New Deal, Left wing, Head of state'],
  ['Clement Attlee', 'Social democrat, Left wing, Head of government'],
  ['Olof Palme', 'Social democrat, Left wing, Head of government'],
  ['Willy Brandt', 'Social democrat, Left wing, Head of government'],
  ['Karl Popper', 'Liberal, Centrist, Philosopher'],
  ['Konrad Adenauer', 'Christian democrat, Centre right, Head of government'],
  ['Alcide De Gasperi', 'Christian democrat, Centre right, Head of government'],
  ['Ludwig Erhard', 'Christian democrat, Social market economy, Economist'],
  ['Anthony Giddens', 'Third Way, Centrist, Sociologist'],
  ['Bill Clinton', 'Third Way, Centrist, Head of state'],
  ['Tony Blair', 'Third Way, Centrist, Head of government'],
  ['Gerhard Schröder', 'Third Way, Centrist, Head of government'],
  ['Emmanuel Macron', 'Centrist, Head of state'],
  ['Edmund Burke', 'Conservative, Right wing, Philosopher'],
  ['Michael Oakeshott', 'Conservative, Right wing, Philosopher'],
  ['Robert Nozick', 'Libertarian, Right wing, Philosopher, Political philosophy'],
  ['Russell Kirk', 'Conservative, Traditionalist conservative, Right wing'],
  ['William F. Buckley Jr.', 'Conservative, Fusionist, Right wing, Journalist'],
  ['Roger Scruton', 'Conservative, Right wing, Philosopher'],
  ['Benjamin Disraeli', 'Conservative, One-nation conservative, Right wing, Head of government'],
  ['Margaret Thatcher', 'Conservative, Right wing, Head of government'],
  ['Ronald Reagan', 'Conservative, Right wing, Head of state'],
  ['Thucydides', 'Realist, Classical realism, Historian'],
  ['Niccolò Machiavelli', 'Realist, Classical realism, Philosopher'],
  ['Thomas Hobbes', 'Realist, Classical realism, Philosopher'],
  ['E. H. Carr', 'Realist, Classical realism, International relations, Historian'],
  ['Hans Morgenthau', 'Realist, Classical realism, International relations, Political science'],
  ['Kenneth Waltz', 'Realist, Structural realism, Defensive realism, International relations, Political science'],
  ['Stephen Walt', 'Realist, Structural realism, Defensive realism, International relations, Political science'],
  ['John Mearsheimer', 'Realist, Structural realism, Offensive realism, International relations, Political science'],
  ['Henry Kissinger', 'Realist, International relations, Diplomat'],
  ['Robert Keohane', 'Liberal institutionalist, International relations, Political science'],
  ['Joseph Nye', 'Liberal institutionalist, International relations, Political science'],
  ['Alexander Wendt', 'Constructivist, International relations, Political science'],
  ['Benito Mussolini', 'Fascist, Far right, Head of government'],
  ['Adolf Hitler', 'Nazi, Fascist, Far right, Head of state'],
  ['Francisco Franco', 'Nationalist, Far right, Head of state'],
  ['Robert Paxton', 'Historian, Scholar of fascism'],
  ['Roger Griffin', 'Political science, Scholar of fascism'],
  ['Cas Mudde', 'Political science, Scholar of the radical right'],
  ['Jean-Marie Le Pen', 'Far right'],
  ['Deng Xiaoping', 'Communist, Far left, Head of state'],
  ['Classical economics', 'School of thought, Economics'],
  ['Marxism', 'School of thought, Far left'],
  ['Keynesian economics', 'School of thought, Economics'],
  ['Austrian school of economics', 'School of thought, Economics'],
  ['Chicago school of economics', 'School of thought, Economics'],
  ['Monetarism', 'School of thought, Economics'],
  ['Post-Keynesian economics', 'School of thought, Economics'],
  ['New Keynesian economics', 'School of thought, Economics'],
  ['Social democracy', 'School of thought, Left wing'],
  ['Communism', 'School of thought, Far left'],
  ['Anarchism', 'School of thought, Far left'],
  ['Fascism', 'School of thought, Far right'],
  ['Nazism', 'School of thought, Far right'],
  ['Realism (international relations)', 'School of thought, Realist, International relations'],
  ['Neorealism (international relations)', 'School of thought, Realist, Structural realism, International relations'],
  ['Offensive realism', 'School of thought, Realist, Structural realism, International relations'],
  ['Liberal institutionalism', 'School of thought, International relations'],
  ['Constructivism (international relations)', 'School of thought, International relations'],
  ['Conservatism', 'School of thought, Right wing'],
  ['Classical liberalism', 'School of thought, Right wing'],
  ['One-nation conservatism', 'School of thought, Conservative, Right wing'],
  ['Neoliberalism', 'School of thought, Economics'],
  ['Third Way', 'School of thought, Centrist'],
  ['Christian democracy', 'School of thought, Centre right'],
  ['Efficient-market hypothesis', 'Theory, Finance'],
  ['Capital asset pricing model', 'Theory, Finance'],
  ['Modigliani–Miller theorem', 'Theory, Finance'],
  ['Comparative advantage', 'Theory, Economics'],
  ['Quantitative easing', 'Policy, Economics'],
]);
// Part A3 of the review: every value the old group "School or tag" held (68), and the six of "Political spectrum".
const A3 = ['Classical economics', 'Keynesian', 'Neoclassical synthesis', 'Post-Keynesian', 'Austrian School', 'Chicago School', 'Monetarist', 'New classical economics', 'Public choice', 'Law and economics', 'Credit creation theory', 'Modern portfolio theory', 'Efficient-market hypothesis', 'Market socialism', 'Social market economy', 'Realist', 'Classical realism', 'Structural realism', 'Defensive realism', 'Offensive realism', 'Liberal institutionalist', 'Constructivist',
  'Marxist', 'Communist', 'Socialist', 'Revolutionary socialist', 'Anarchist', 'Anarcho-capitalist', 'Social democrat', 'Liberal', 'Classical liberal', 'Libertarian', 'Conservative', 'Traditionalist conservative', 'One-nation conservative', 'Fusionist', 'Christian democrat', 'Third Way', 'New Deal', 'Welfare state', 'Capitalism', 'Fascist', 'Nazi', 'Nationalist',
  'Far left', 'Left wing', 'Centrist', 'Centre right', 'Right wing', 'Far right',
  'Economist', 'Philosopher', 'Historian', 'Diplomat', 'Journalist', 'Sociologist', 'Head of government', 'Head of state', 'Political science', 'International relations', 'Political philosophy', 'Economics', 'Finance', 'Scholar of fascism', 'Scholar of the radical right',
  'School of thought', 'Theory', 'Policy'];
const SUI_GENERIS = 'Sui generis (Realist)';
// D3, value by value (null: dropped in favour of the entry's type). The schools of economics are named as their entries
// are; an ideology as the ideology, spelt as Wikidata's ideologies are; an occupation or office goes to Occupation or
// Role, where it shows only if the entry does not already carry it there (adapters.mjs mentionTags). Three values D3
// does not name are theories, put in a group of their own; law and economics is Wikidata's field of that name.
const D3 = {
  'Classical economics': 'School:Classical economics', Keynesian: 'School:Keynesian economics', 'Neoclassical synthesis': 'School:Neoclassical synthesis', 'Post-Keynesian': 'School:Post-Keynesian economics',
  'Austrian School': 'School:Austrian school', 'Chicago School': 'School:Chicago school of economics', Monetarist: 'School:Monetarism', 'New classical economics': 'School:New classical macroeconomics', 'Public choice': 'School:Public choice',
  'Law and economics': 'Field:Law and economics', 'Credit creation theory': 'Theory:Credit creation theory', 'Modern portfolio theory': 'Theory:Modern portfolio theory', 'Efficient-market hypothesis': 'Theory:Efficient-market hypothesis',
  'Market socialism': 'Ideology:Market socialism', 'Social market economy': 'Ideology:Social market economy',
  Realist: 'School:Realism', 'Classical realism': 'School:Classical realism', 'Structural realism': 'School:Neorealism (structural realism)', 'Defensive realism': 'School:Defensive realism', 'Offensive realism': 'School:Offensive realism',
  'Liberal institutionalist': 'School:Liberal institutionalism', Constructivist: 'School:Constructivism',
  Marxist: 'Ideology:Marxism', Communist: 'Ideology:Communism', Socialist: 'Ideology:Socialism', 'Revolutionary socialist': 'Ideology:Revolutionary socialism', Anarchist: 'Ideology:Anarchism', 'Anarcho-capitalist': 'Ideology:Anarcho-capitalism',
  'Social democrat': 'Ideology:Social democracy', Liberal: 'Ideology:Liberalism', 'Classical liberal': 'Ideology:Classical liberalism', Libertarian: 'Ideology:Libertarianism', Conservative: 'Ideology:Conservatism',
  'Traditionalist conservative': 'Ideology:Traditionalist conservatism', 'One-nation conservative': 'Ideology:One-nation conservatism', Fusionist: 'Ideology:Fusionism', 'Christian democrat': 'Ideology:Christian democracy',
  'Third Way': 'Ideology:Third Way', 'New Deal': 'Ideology:New Deal', 'Welfare state': 'Ideology:Welfare state', Capitalism: 'Ideology:Capitalism', Fascist: 'Ideology:Fascism', Nazi: 'Ideology:Nazism', Nationalist: 'Ideology:Nationalism',
  Economist: 'Occupation:Economist', Philosopher: 'Occupation:Philosopher', Historian: 'Occupation:Historian', Diplomat: 'Occupation:Diplomat', Journalist: 'Occupation:Journalist', Sociologist: 'Occupation:Sociologist',
  'Head of government': 'Role:Head of government', 'Head of state': 'Role:Head of state',
  'Political science': 'Field:Political science', 'International relations': 'Field:International relations', 'Political philosophy': 'Field:Political philosophy', Economics: 'Field:Economics', Finance: 'Field:Finance',
  'Scholar of fascism': 'Field:Fascism studies', 'Scholar of the radical right': 'Field:Far-right politics',
  'School of thought': null, Theory: null, Policy: null,
};
// The positions, as the Briefing names them; "Centre right" is no position, and the Christian democrats keep the
// placement their unit gives them, the centre's (the old rule gave a Christian democrat with no position of his own the
// centre's too: thinkers.mjs SPECTRUM_SCHOOL until 18 November).
const D3_POSITION = { 'Far left': 'Far left', 'Left wing': 'Left', Centrist: 'Centre', 'Centre right': 'Centre', 'Right wing': 'Right', 'Far right': 'Far right' };
// A school's own row carries its own School value, and its parent's as a thinker of its branch does (the fixer's pass,
// 18 November 2026: "School: Keynesian economics" found Keynes but not the Keynesian economics entry, while the realist
// schools carried School: Realism). The realism rows had theirs from D3 already.
const SCHOOL_SELF = {
  'Classical economics': ['School:Classical economics'], 'Keynesian economics': ['School:Keynesian economics'], 'Austrian school of economics': ['School:Austrian school'],
  'Chicago school of economics': ['School:Chicago school of economics'], Monetarism: ['School:Monetarism'],
  'Post-Keynesian economics': ['School:Keynesian economics', 'School:Post-Keynesian economics'], 'New Keynesian economics': ['School:Keynesian economics', 'School:New Keynesian economics'],
  'Offensive realism': ['School:Offensive realism'], 'Liberal institutionalism': ['School:Liberal institutionalism'], 'Constructivism (international relations)': ['School:Constructivism'],
};

test('Master Index labels: the positions are the Briefing\'s five, and the hand-made tags are in the discipline\'s words (review D3)', () => {
  assert.deepEqual(POSITIONS, ['Far left', 'Left', 'Centre', 'Right', 'Far right']);
  assert.deepEqual(POSITIONS, BRIEFING_POSITIONS.map(p => p.label), 'named as the Political Briefing names them');
  assert.deepEqual(Object.keys(UNIT_POSITION), POSITIONS, 'a unit gives a position only by one of the five names; the Realism unit gives none');
  // Every former value has its place in D3, and only the realists' position is gone.
  assert.equal(A3.length, 68);
  assert.deepEqual(A3.filter(v => !(v in D3) && !(v in D3_POSITION)), []);
  assert.equal(Object.keys(D3).length + Object.keys(D3_POSITION).length, 68, 'the 68 values of "School or tag"; "Political spectrum" held five of its positions and "Sui generis (Realist)", which goes');
  assert.equal(THINKERS.length, FORMER.size, 'no row added or taken away');
  for (const [title, , tags, own] of THINKERS) {
    assert.ok(FORMER.has(title), `${title} was a row before`);
    const old = FORMER.get(title).split(', ').filter(Boolean);
    assert.ok(!old.includes(SUI_GENERIS));
    const want = [...new Set([...old.filter(v => !(v in D3_POSITION)).map(v => { assert.ok(v in D3, `${title}: ${v} is in D3`); return D3[v]; }).filter(Boolean), ...(SCHOOL_SELF[title] || [])])];
    assert.deepEqual([...tags].sort(), want.sort(), `${title}: its tags are its old ones, as D3 names them`);
    const oldOwn = old.filter(v => v in D3_POSITION).map(v => D3_POSITION[v]);
    assert.equal(own, oldOwn[0] ?? (old.includes('Christian democrat') ? 'Centre' : undefined), `${title}: its own position`);
    for (const t of tags) assert.match(t, new RegExp(`^(${TAG_GROUPS.join('|')}):[^:]+$`), `${title}: ${t}`);
    assert.ok(own === undefined || POSITIONS.includes(own), `${title}: ${own}`);
    assert.ok(!tags.includes('School:Realism') || own === undefined, `${title}: a realist has no position`);
  }
  const mearsheimer = THINKERS.find(t => t[0] === 'John Mearsheimer');
  for (const t of ['School:Realism', 'School:Offensive realism']) assert.ok(mearsheimer[2].includes(t), t);
  assert.equal(mearsheimer[3], undefined);
  // No old group, no old word, and "Centre right" in no group.
  const all = THINKERS.flatMap(t => t[2]);
  assert.deepEqual(all.filter(t => /^(School or tag|Political spectrum):|Sui generis|:(Centre right|Left wing|Right wing|Centrist|Realist|Marxist)$/i.test(t)), []);
});

test('Master Index labels: an occupation or office shows only where the entry lacks it; the Learning adapter\'s groups are taken away by a --only run', () => {
  const held = { held: ['Occupation', 'Role'] }, notes = {};
  const ms = [{ module: 'learning-politics', tags: [['Role', 'Head of state', held], ['Occupation', 'Economist', held], ['Occupation', 'Philosopher', held], ['Political position', 'Left', { note: POSITION_NOTE }], ['School', 'Realism'], ['Field', '']] }];
  // Deng Xiaoping's Wikidata occupation is "head of state": the office is not shown twice. Wikidata gives Mill
  // "Philosopher" too: the same tag, once.
  assert.deepEqual(mentionTags(ms, ['Occupation:Head of state', 'Occupation:Philosopher'], notes), ['Political position:Left', 'School:Realism', 'Occupation:Economist']);
  assert.deepEqual(notes, { 'Political position:Left': POSITION_NOTE });
  assert.deepEqual(mentionTags(ms, ['Role:Economist'], {}), ['Political position:Left', 'School:Realism', 'Role:Head of state', 'Occupation:Philosopher'], 'a value held under Role is not given under Occupation');
  assert.deepEqual(mentionTags([{ tags: [['Role', 'Head of state', held]] }, { tags: [['Role', 'Head of state', held]] }], [], {}), ['Role:Head of state'], 'given once');
  // A value is shown once: a hand-made School, Ideology, Field or Theory value puts Wikidata's same word under Field,
  // Movement or Ideology in `drop` (Mearsheimer's Field:Offensive realism, Hitler's Field:Nazism, Mill's
  // Movement:Liberalism, Böhm-Bawerk's Movement:Austrian school); the same tag, or another word, is kept.
  const drop = new Set();
  const hand = [{ tags: [['School', 'Offensive realism'], ['Ideology', 'Liberalism'], ['Ideology', 'Nazism'], ['School', 'Austrian school']] }];
  mentionTags(hand, ['Field:Offensive realism', 'Movement:Liberalism', 'Ideology:Liberalism', 'Field:Nazism', 'Movement:Austrian School', 'Field:International relations', 'Occupation:Liberalism', 'Party:Nazism'], {}, drop);
  assert.deepEqual([...drop].sort(), ['Field:Nazism', 'Field:Offensive realism', 'Movement:Austrian School', 'Movement:Liberalism']);
  // A --only run of the Learning adapter makes its own groups again, the old ones among them, and leaves the groups it
  // shares with Wikidata and the Retrospective (Ideology, Field, Occupation, Role) for the full build.
  assert.deepEqual(ADAPTER_TAG_GROUPS.learning, ['School', 'Political position', 'Theory', 'School or tag', 'Political spectrum']);
  // The adapter gives the hand-made tags as [group, value], an occupation or office with its condition.
  const mentions = learning({ jdpiDir: fileURLToPath(new URL('..', import.meta.url)) });
  const m = mentions.find(x => x.label === 'John Mearsheimer');
  assert.deepEqual(m.tags, [['School', 'Realism'], ['School', 'Neorealism (structural realism)'], ['School', 'Offensive realism'], ['Field', 'International relations'], ['Field', 'Political science']]);
  const d = mentions.find(x => x.label === 'Deng Xiaoping' && x.module === 'learning-politics');
  assert.deepEqual(d.tags, [['Ideology', 'Communism'], ['Role', 'Head of state', held], ['Political position', 'Far left', { note: POSITION_NOTE }]]);
  for (const x of mentions) for (const [f] of x.tags) assert.ok([...TAG_GROUPS, 'Political position'].includes(f), `${x.label}: ${f}`);
});

test('politics: the crisis lesson is titled for its six answers (Kino\'s link to it: tests/kino.test.mjs)', () => {
  const md = readFileSync(new URL('../fe/learning/politics.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const heads = md.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3));
  assert.ok(heads.includes('A crisis seen six ways') && !heads.some(h => /five ways/.test(h)), 'the new title');
  assert.ok(heads.includes('Five answers to the same questions'), 'the comparison table keeps its title');
  const crisis = md.slice(md.indexOf('## A crisis seen six ways')).split('\n## ')[0].split('\n? ')[0];
  assert.equal([...crisis.matchAll(/^- \*\*/gm)].length, 6, 'six answers');
});

test('each course renders its lessons and quiz, in the right suite', pageTest, async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const seen = {};
  for (const [course, suite, mustSay] of [['finance', 'mm', /Compounding/], ['economics', 'mm', /werner/i], ['politics', 'rs', /mearsheimer/i]]) {
    await page.goto(`${BASE}/fe/learning?course=${course}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#toc button', { timeout: 20000 });
    const toc = await page.locator('#toc').innerText();
    seen[course] = {
      lessons: await page.locator('#toc button').count(),
      suite: await page.evaluate(() => document.documentElement.dataset.suite),
      tabs: await page.locator('.tabs a:not([hidden])').count(),
      mentions: mustSay.test(toc),
    };
  }
  // Answer a quiz question and mark a lesson complete.
  await page.goto(`${BASE}/fe/learning?course=finance`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.q .opt');
  await page.locator('.q').first().locator('.opt').first().click();
  const marked = await page.locator('.q').first().locator('.opt.right').count();
  const why = await page.locator('.q').first().locator('.why').isVisible();
  await page.click('#mark');
  const progress = await page.locator('#progress-label').innerText();
  await browser.close();
  assert.ok(seen.finance.lessons >= 20 && seen.economics.lessons >= 12 && seen.politics.lessons >= 10, JSON.stringify(seen));
  assert.equal(seen.finance.suite, 'mm');
  assert.equal(seen.politics.suite, 'rs');
  assert.equal(seen.finance.tabs, 2);
  assert.equal(seen.politics.tabs, 1);
  assert.ok(seen.economics.mentions && seen.politics.mentions);
  assert.equal(marked, 1);
  assert.ok(why);
  assert.match(progress, /^1 of/);
  assert.deepEqual(errors, []);
});

// The review of 12 November 2026: the Finance & Economics material is short (the page counts its own reading time), so
// it is called introductory wherever it is described, never a university course.
test('finance and economics: the courses are called introductory, on the page, in its fallback and in the registry', () => {
  const intro = f => readFileSync(new URL(`../fe/learning/${f}.md`, import.meta.url), 'utf8').replace(/\r/g, '').split('\n').find(l => l.startsWith('intro: '));
  assert.match(intro('finance'), /^intro: An introductory course in finance/);
  assert.match(intro('finance'), /a short introduction, not a full university course/);
  assert.doesNotMatch(intro('finance'), /first-year university|university-style/);
  assert.match(intro('economics'), /^intro: An introductory course in economics/);
  const page = readFileSync(new URL('../fe/learning.html', import.meta.url), 'utf8');
  assert.match(page, /intro: 'Two introductory courses: Finance, with worked examples, and Economics/);
  const reg = JSON.parse(readFileSync(new URL('../registry.json', import.meta.url), 'utf8'));
  const desc = reg.suites.flatMap(s => s.modules).find(m => m.id === 'learning').description;
  assert.match(desc, /^Two introductory courses: /);
  assert.doesNotMatch(desc, /university/);
});

// The quotation rule (S0 of the scholar design, 16 November 2026; Jude's rule): a person's words, or a document's, appear
// in quotation marks in a course only when they match a paragraph of a Bibliotheca book whose rights.eu is "pd"
// (bibliotheca/scripts/quotes.mjs). Anything else is said in VM's words, as reported speech with the source and year.
test('quotations: every quotation in the courses matches a book on the shelf; anything else is said in VM\'s words', () => {
  // Quoted strings that are not a person's words: VM's own example sentences, and an article's title.
  const NOT_WORDS = new Map([
    ['The minimum wage should be raised because inequality is unjust.', 'VM’s example of a normative statement'],
    ['raising the minimum wage by 10% reduces teenage employment by X%', 'VM’s example of a positive statement'],
    ['Why the Ukraine Crisis Is the West\'s Fault', 'the title of Mearsheimer’s article (Foreign Affairs, 2014)'],
  ]);
  // The intelligence courses' quoted strings are VM's example report wording and headlines and the credit lines that
  // imagery licences ask for, so they are left out as a whole (their definitions from US law are in VM's words).
  const COURSES = ['economics', 'politics', 'finance'];
  const md = f => readFileSync(new URL(`../fe/learning/${f}.md`, import.meta.url), 'utf8').replace(/\r/g, '').split('\n');
  // The quoted runs of a course, each with the line it starts on. The file is read whole, not line by line, so a
  // quotation that runs across a line break is seen too (the second reviewer, 17 November 2026, X3).
  const runsOf = lines => {
    const all = lines.join('\n'), starts = lines.map((_, i) => lines.slice(0, i).join('\n').length + (i ? 1 : 0));
    const out = [];
    let from = 0;
    for (const q of quotedRuns(all, 6)) { const i = all.indexOf(q, from); from = i + q.length; out.push([q.replace(/\s+/g, ' '), starts.findLastIndex(s => s <= i) + 1]); }
    return out;
  };
  assert.deepEqual(runsOf(['He wrote "these are six invented words', 'that span two lines" in 1900.']), [['these are six invented words that span two lines', 1]], 'a quotation across a line break is seen');
  let blocks = 0;
  for (const f of COURSES) {
    md(f).forEach((line, i) => {
      const block = /^> "(.+?)"\s+—\s+(.+)$/.exec(line);
      if (block) { blocks++; assert.ok(findQuote(block[1]).length, `${f}.md:${i + 1}: the quotation "${block[1]}" matches no paragraph of a book on the shelf that is public domain in the EU`); }
    });
    for (const [q, line] of runsOf(md(f))) if (!NOT_WORDS.has(q)) assert.ok(findQuote(q).length, `${f}.md:${line}: "${q}" is quoted but matches no paragraph of a book on the shelf; say it in VM's words`);
  }
  assert.ok(blocks >= 4, 'the quotations the shelf holds stay quotations');
  for (const f of ['osint', 'geoint']) assert.ok(!quotedRuns(md(f)[6], 6).length, `${f}.md: the definition from US law is in VM's words`);
  // the shelf's quotations name their translator
  assert.match(md('economics').find(l => l.startsWith('> "The history of all')), /translated by Samuel Moore/);
  assert.match(md('politics').find(l => l.startsWith('> "… the strong do')), /translated by Richard Crawley/);
});

// The quotation rule's two named exceptions (Jude's decision F2, 17 November 2026). Outside the courses, words in
// quotation marks that match no book on the shelf are allowed in two places only, and only on these terms:
//  1. Omni News briefings (briefing/data/latest.json and the Science, Economics and Digital briefings' stories.json):
//     a publisher's own words, inside an item that carries that publisher's name (its source, named in the file's
//     sources) and the link to its story. The words are the publisher's headline or description, shown as its own and
//     led back to it; VM does not quote anyone in its own voice there.
//  2. Wikipedia extracts in the Master Index (lake/data/e, each entity's summary): Wikipedia's text, which may be
//     reused under CC BY-SA 4.0 with its credit and link, so only where the store and the page credit Wikipedia and
//     the entity carries its article's title (the page links "Wikipedia ↗" from it). On 16 November three extracts were
//     seen quoting Nobel prize citations: Thomas Cech (Q135180), Eric Allin Cornell (Q205954) and Carl Wieman (Q206379).
// A quoted run anywhere else in those files, or one in an item without its link or publisher, or an extract without
// Wikipedia's credit or link, fails the test.
// A run is on the shelf only when findQuote finds it; a piece found nowhere in the shelf's text settles it sooner.
let shelfText = null;
const seen = new Map();
const onShelf = q => {
  if (!seen.has(q)) seen.set(q, !!(shelfText ??= shelfParagraphs().map(p => p.text).join('\n')) && pieces(q).every(p => shelfText.includes(p)) && findQuote(q).length > 0);
  return seen.get(q);
};
const unshelved = text => (typeof text === 'string' ? quotedRuns(text, 6) : []).filter(q => !onShelf(q));
function briefingQuoteProblems(file, data) {
  const named = new Map((data.sources || []).map(s => [s.id, s.name || s.outlet]));
  const out = [];
  for (const it of data.items || []) {
    const runs = Object.values(it).flatMap(unshelved);
    if (!runs.length) continue;
    const link = it.u ?? it.url, src = it.s ?? it.source;
    if (!/^https?:\/\/\S+$/.test(link || '')) out.push(`${file}: "${runs[0]}" is quoted in an item with no link to its story`);
    if (!named.get(src)) out.push(`${file}: "${runs[0]}" is quoted in an item whose publisher is not named (source ${JSON.stringify(src)})`);
  }
  return out;
}
const WIKIPEDIA_CREDIT = 'Wikipedia summaries (CC BY-SA 4.0)';
function extractQuoteProblems(file, entities, sources) {
  const credited = (sources || []).includes(WIKIPEDIA_CREDIT), out = [];
  for (const [q, e] of Object.entries(entities)) {
    const runs = unshelved(e.summary);
    if (!runs.length) continue;
    if (!credited) out.push(`${file} ${q}: "${runs[0]}" is quoted in a Wikipedia extract but the store does not credit Wikipedia`);
    if (!(typeof e.wiki === 'string' && e.wiki.trim())) out.push(`${file} ${q}: "${runs[0]}" is quoted in an extract with no Wikipedia article to link to`);
  }
  return out;
}

test('quotations: the two named exceptions, a publisher\'s words with its name and link, Wikipedia\'s with its credit and link', () => {
  const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  // Fixtures: each exception fails without its link, name or credit.
  const run = 'He said “these six words are not on the shelf at all” today.';
  const brief = { sources: [{ id: 'pub', name: 'A Publisher' }], items: [{ s: 'pub', t: 'A headline', u: 'https://example.org/story', d: run }] };
  assert.deepEqual(briefingQuoteProblems('fixture', brief), [], 'a publisher\'s words with its name and link');
  assert.equal(briefingQuoteProblems('fixture', { ...brief, items: [{ ...brief.items[0], u: '' }] }).length, 1, 'no link: fails');
  assert.equal(briefingQuoteProblems('fixture', { ...brief, items: [{ ...brief.items[0], s: 'unknown' }] }).length, 1, 'no publisher\'s name: fails');
  assert.equal(briefingQuoteProblems('fixture', { sources: [{ id: 'pub', outlet: 'An Outlet' }], items: [{ source: 'pub', title: run }] }).length, 1, 'the other briefings\' shape, with no url: fails');
  const ent = { Q1: { label: 'X', wiki: 'X', summary: run } };
  assert.deepEqual(extractQuoteProblems('fixture', ent, [WIKIPEDIA_CREDIT]), [], 'an extract with its credit and link');
  assert.equal(extractQuoteProblems('fixture', ent, ['Wikidata (CC0)']).length, 1, 'no credit: fails');
  assert.equal(extractQuoteProblems('fixture', { Q1: { ...ent.Q1, wiki: null } }, [WIKIPEDIA_CREDIT]).length, 1, 'no link: fails');
  assert.deepEqual(extractQuoteProblems('fixture', { Q1: { summary: 'No quotation here.' } }, []), [], 'no quoted run, nothing to credit');

  // The briefings as committed.
  let runs = 0;
  for (const f of ['briefing/data/latest.json', 'science/briefing/data/stories.json', 'econ/briefing/data/stories.json', 'digital/briefing/data/stories.json']) {
    const data = read(f);
    assert.deepEqual(briefingQuoteProblems(f, data), []);
    runs += data.items.flatMap(it => Object.values(it).flatMap(unshelved)).length;
    // the files' other parts (sources, counts) hold no quoted words
    const strings = v => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
    assert.deepEqual(strings(Object.entries(data).filter(([k]) => k !== 'items')).flatMap(unshelved), [], `${f}: quoted words outside the items`);
  }
  assert.ok(runs > 0, 'the briefings were read');
  // The Master Index: the store and the page credit Wikipedia, and every quoted extract has its article.
  const manifest = read('lake/data/manifest.json');
  assert.ok(manifest.sources.includes(WIKIPEDIA_CREDIT), 'the store credits Wikipedia');
  assert.match(readFileSync(new URL('../encyclopedia/index.html', import.meta.url), 'utf8'), /Summaries from <a href="https:\/\/en\.wikipedia\.org"[^>]*>Wikipedia<\/a> \(CC BY-SA 4\.0/, 'the page credits Wikipedia');
  const dir = new URL('../lake/data/e/', import.meta.url);
  const problems = [], named = new Map();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const entities = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    problems.push(...extractQuoteProblems(`lake/data/e/${f}`, entities, manifest.sources));
    for (const q of ['Q135180', 'Q205954', 'Q206379']) if (entities[q]) named.set(q, entities[q]);
  }
  assert.deepEqual(problems, []);
  // the three extracts named on 16 November are still covered: each quotes a Nobel citation and has its article
  for (const [q, label] of [['Q135180', 'Thomas Cech'], ['Q205954', 'Eric Allin Cornell'], ['Q206379', 'Carl Wieman']]) {
    const e = named.get(q);
    if (!e) continue; // an entity that has left the store needs no exception
    assert.equal(e.label, label);
    if (unshelved(e.summary).length) assert.ok(e.wiki, `${q} carries its Wikipedia article`);
  }
});

test('page: Finance and Economics open with their introductory intros', pageTest, async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    for (const [course, want] of [['finance', /^An introductory course in finance.*not a full university course/], ['economics', /^An introductory course in economics/]]) {
      await page.goto(`${BASE}/fe/learning?course=${course}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#toc button', { timeout: 20000 });
      assert.match(await page.textContent('#intro'), want, course);
    }
  } finally {
    await browser.close();
  }
});

// People and schools of thought taught in the Learning courses, how to find them in the lesson text, and the tags VM
// gives them by hand, in the discipline's words (the Master Index canon review of 17 November 2026, VM-MASTER-INDEX-
// CANON-REVIEW.md, table D3; Jude's choices of 18 November, ledger MI-12):
//   School     a school of thought, as the references name it: "School:Realism" and its branch "School:Offensive
//              realism" are two tags, so a filter on realism finds every realist. The schools of economics are named
//              as their Master Index entries are ("School:Keynesian economics").
//   Ideology   an ideology, named as the ideology rather than its adherent ("Ideology:Marxism", not "Marxist"), and
//              spelt as Wikidata's ideologies are, so a value Wikidata also gives the entry appears once.
//   Field      a field of study or work, as Wikidata's field of work (P101) names it.
//   Theory     a theory a thinker is known for (the efficient-market hypothesis): neither a school nor a field.
//   Occupation, Role  an occupation or an office, given only where the entry does not already carry the same value
//              under Occupation (Wikidata) or Role (the Retrospective): adapters.mjs mentionTags.
// A kind of entry ("school of thought", "theory", "policy") is the entry's type (types.mjs), not a tag.
// [English Wikipedia title, regex matched against lesson text, hand-made tags, the Politics course unit that teaches it
// as its own (below, at POSITIONS), if any]
import { POSITIONS as BRIEFING_POSITIONS } from '../../briefing/scripts/sources.mjs';

export const THINKERS = [
  // ---- Economics
  ['Adam Smith', /Adam Smith|\bSmith\b/, ['School:Classical economics', 'Ideology:Capitalism', 'Occupation:Economist', 'Occupation:Philosopher']],
  ['David Ricardo', /Ricardo/, ['School:Classical economics', 'Occupation:Economist']],
  ['Jean-Baptiste Say', /Jean-Baptiste Say|Say's law/, ['School:Classical economics', 'Occupation:Economist']],
  ['John Stuart Mill', /John Stuart Mill|\bMill\b/, ['School:Classical economics', 'Ideology:Liberalism', 'Occupation:Philosopher', 'Occupation:Economist'], 'Centre'],
  ['Karl Marx', /\bMarx\b/, ['Ideology:Marxism', 'Ideology:Communism', 'Ideology:Socialism', 'Occupation:Philosopher', 'Occupation:Economist'], 'Far left'],
  ['Friedrich Engels', /Engels/, ['Ideology:Marxism', 'Ideology:Communism', 'Ideology:Socialism', 'Occupation:Philosopher'], 'Far left'],
  ['Vladimir Lenin', /Lenin/, ['Ideology:Marxism', 'Ideology:Communism', 'Ideology:Revolutionary socialism', 'Role:Head of government'], 'Far left'],
  ['Eduard Bernstein', /Bernstein/, ['Ideology:Social democracy', 'Ideology:Socialism'], 'Left'],
  ['Oskar Lange', /Lange/, ['Ideology:Market socialism', 'Ideology:Socialism', 'Occupation:Economist']],
  ['John Maynard Keynes', /Keynes\b/, ['School:Keynesian economics', 'Occupation:Economist']],
  ['John Hicks', /Hicks/, ['School:Keynesian economics', 'School:Neoclassical synthesis', 'Occupation:Economist']],
  ['Paul Samuelson', /Samuelson/, ['School:Keynesian economics', 'School:Neoclassical synthesis', 'Occupation:Economist']],
  ['Hyman Minsky', /Minsky/, ['School:Keynesian economics', 'School:Post-Keynesian economics', 'Occupation:Economist']],
  ['Joan Robinson', /Joan Robinson/, ['School:Keynesian economics', 'School:Post-Keynesian economics', 'Occupation:Economist']],
  ['Ludwig von Mises', /Mises/, ['School:Austrian school', 'Ideology:Classical liberalism', 'Occupation:Economist']],
  ['Carl Menger', /Menger/, ['School:Austrian school', 'Occupation:Economist']],
  ['Eugen von Böhm-Bawerk', /Böhm-Bawerk/, ['School:Austrian school', 'Occupation:Economist']],
  ['Friedrich Hayek', /Hayek/, ['School:Austrian school', 'Ideology:Classical liberalism', 'Occupation:Economist', 'Occupation:Philosopher'], 'Right'],
  ['Murray Rothbard', /Rothbard/, ['School:Austrian school', 'Ideology:Anarcho-capitalism', 'Occupation:Economist']],
  ['Milton Friedman', /Friedman/, ['School:Chicago school of economics', 'School:Monetarism', 'Ideology:Classical liberalism', 'Occupation:Economist'], 'Right'],
  ['Anna Schwartz', /Schwartz/, ['School:Chicago school of economics', 'School:Monetarism', 'Occupation:Economist']],
  ['Edmund Phelps', /Phelps/, ['Occupation:Economist']],
  ['Frank Knight', /Frank Knight/, ['School:Chicago school of economics', 'Occupation:Economist']],
  ['George Stigler', /Stigler/, ['School:Chicago school of economics', 'Occupation:Economist']],
  ['Ronald Coase', /Coase/, ['School:Chicago school of economics', 'Field:Law and economics', 'Occupation:Economist']],
  ['Gary Becker', /Becker/, ['School:Chicago school of economics', 'Occupation:Economist']],
  ['Robert Lucas Jr.', /Robert Lucas|Lucas critique/, ['School:Chicago school of economics', 'School:New classical macroeconomics', 'Occupation:Economist']],
  ['Eugene Fama', /Fama/, ['School:Chicago school of economics', 'Theory:Efficient-market hypothesis', 'Occupation:Economist']],
  ['Richard Werner', /Werner/, ['Theory:Credit creation theory', 'Occupation:Economist']],
  ['James M. Buchanan', /Buchanan/, ['School:Public choice', 'Occupation:Economist']],
  ['Harry Markowitz', /Markowitz/, ['Theory:Modern portfolio theory', 'Occupation:Economist']],
  // ---- Politics
  ['Rosa Luxemburg', /Luxemburg/, ['Ideology:Marxism', 'Ideology:Revolutionary socialism'], 'Far left'],
  ['Leon Trotsky', /Trotsky/, ['Ideology:Marxism', 'Ideology:Communism'], 'Far left'],
  ['Mao Zedong', /\bMao\b/, ['Ideology:Marxism', 'Ideology:Communism', 'Role:Head of state'], 'Far left'],
  ['Antonio Gramsci', /Gramsci/, ['Ideology:Marxism', 'Occupation:Philosopher'], 'Far left'],
  ['Pierre-Joseph Proudhon', /Proudhon/, ['Ideology:Anarchism', 'Occupation:Philosopher'], 'Far left'],
  ['Mikhail Bakunin', /Bakunin/, ['Ideology:Anarchism'], 'Far left'],
  ['Peter Kropotkin', /Kropotkin/, ['Ideology:Anarchism'], 'Far left'],
  ['Joseph Stalin', /Stalin/, ['Ideology:Communism', 'Role:Head of government'], 'Far left'],
  ['Fidel Castro', /Castro/, ['Ideology:Communism', 'Role:Head of state'], 'Far left'],
  ['William Beveridge', /Beveridge/, ['Ideology:Liberalism', 'Ideology:Welfare state', 'Occupation:Economist'], 'Left'],
  ['Anthony Crosland', /Crosland/, ['Ideology:Social democracy'], 'Left'],
  ['John Rawls', /Rawls/, ['Ideology:Liberalism', 'Occupation:Philosopher', 'Field:Political philosophy'], 'Left'],
  ['Franklin D. Roosevelt', /Roosevelt/, ['Ideology:New Deal', 'Role:Head of state'], 'Left'],
  ['Clement Attlee', /Attlee/, ['Ideology:Social democracy', 'Role:Head of government'], 'Left'],
  ['Olof Palme', /Palme/, ['Ideology:Social democracy', 'Role:Head of government'], 'Left'],
  ['Willy Brandt', /Brandt/, ['Ideology:Social democracy', 'Role:Head of government'], 'Left'],
  ['Karl Popper', /Popper/, ['Ideology:Liberalism', 'Occupation:Philosopher'], 'Centre'],
  // The centre's unit teaches Christian democracy as its own, though it is often placed centre-right ("Centre right"
  // is no position here: the five are the Political Briefing's), so the Christian democrats take the centre's placement.
  ['Konrad Adenauer', /Adenauer/, ['Ideology:Christian democracy', 'Role:Head of government'], 'Centre'],
  ['Alcide De Gasperi', /De Gasperi/, ['Ideology:Christian democracy', 'Role:Head of government'], 'Centre'],
  ['Ludwig Erhard', /Erhard/, ['Ideology:Christian democracy', 'Ideology:Social market economy', 'Occupation:Economist'], 'Centre'],
  ['Anthony Giddens', /Giddens/, ['Ideology:Third Way', 'Occupation:Sociologist'], 'Centre'],
  ['Bill Clinton', /Clinton/, ['Ideology:Third Way', 'Role:Head of state'], 'Centre'],
  ['Tony Blair', /Blair/, ['Ideology:Third Way', 'Role:Head of government'], 'Centre'],
  ['Gerhard Schröder', /Schröder/, ['Ideology:Third Way', 'Role:Head of government'], 'Centre'],
  ['Emmanuel Macron', /Macron/, ['Role:Head of state'], 'Centre'],
  ['Edmund Burke', /Burke/, ['Ideology:Conservatism', 'Occupation:Philosopher'], 'Right'],
  ['Michael Oakeshott', /Oakeshott/, ['Ideology:Conservatism', 'Occupation:Philosopher'], 'Right'],
  ['Robert Nozick', /Nozick/, ['Ideology:Libertarianism', 'Occupation:Philosopher', 'Field:Political philosophy'], 'Right'],
  ['Russell Kirk', /\bKirk\b/, ['Ideology:Conservatism', 'Ideology:Traditionalist conservatism'], 'Right'],
  ['William F. Buckley Jr.', /Buckley/, ['Ideology:Conservatism', 'Ideology:Fusionism', 'Occupation:Journalist'], 'Right'],
  ['Roger Scruton', /Scruton/, ['Ideology:Conservatism', 'Occupation:Philosopher'], 'Right'],
  ['Benjamin Disraeli', /Disraeli/, ['Ideology:Conservatism', 'Ideology:One-nation conservatism', 'Role:Head of government'], 'Right'],
  ['Margaret Thatcher', /Thatcher/, ['Ideology:Conservatism', 'Role:Head of government'], 'Right'],
  ['Ronald Reagan', /Reagan/, ['Ideology:Conservatism', 'Role:Head of state'], 'Right'],
  // Realism is a school of international relations, held by people of the left, the centre and the right: the Realists
  // carry their school and its branch, and no position (review D1 and D2, option 3).
  ['Thucydides', /Thucydides/, ['School:Realism', 'School:Classical realism', 'Occupation:Historian']],
  ['Niccolò Machiavelli', /Machiavelli/, ['School:Realism', 'School:Classical realism', 'Occupation:Philosopher']],
  ['Thomas Hobbes', /Hobbes/, ['School:Realism', 'School:Classical realism', 'Occupation:Philosopher']],
  ['E. H. Carr', /E\. H\. Carr|\bCarr\b/, ['School:Realism', 'School:Classical realism', 'Field:International relations', 'Occupation:Historian']],
  ['Hans Morgenthau', /Morgenthau/, ['School:Realism', 'School:Classical realism', 'Field:International relations', 'Field:Political science']],
  ['Kenneth Waltz', /Waltz/, ['School:Realism', 'School:Neorealism (structural realism)', 'School:Defensive realism', 'Field:International relations', 'Field:Political science']],
  ['Stephen Walt', /Walt\b/, ['School:Realism', 'School:Neorealism (structural realism)', 'School:Defensive realism', 'Field:International relations', 'Field:Political science']],
  ['John Mearsheimer', /Mearsheimer/, ['School:Realism', 'School:Neorealism (structural realism)', 'School:Offensive realism', 'Field:International relations', 'Field:Political science']],
  ['Henry Kissinger', /Kissinger/, ['School:Realism', 'Field:International relations', 'Occupation:Diplomat']],
  ['Robert Keohane', /Keohane/, ['School:Liberal institutionalism', 'Field:International relations', 'Field:Political science']],
  ['Joseph Nye', /\bNye\b/, ['School:Liberal institutionalism', 'Field:International relations', 'Field:Political science']],
  ['Alexander Wendt', /Wendt/, ['School:Constructivism', 'Field:International relations', 'Field:Political science']],
  ['Benito Mussolini', /Mussolini/, ['Ideology:Fascism', 'Role:Head of government'], 'Far right'],
  ['Adolf Hitler', /Hitler/, ['Ideology:Nazism', 'Ideology:Fascism', 'Role:Head of state'], 'Far right'],
  ['Francisco Franco', /Franco\b/, ['Ideology:Nationalism', 'Role:Head of state'], 'Far right'],
  // The far right's scholars: they study it and do not belong to it, so they take no placement from its unit.
  ['Robert Paxton', /Paxton/, ['Occupation:Historian', 'Field:Fascism studies']],
  ['Roger Griffin', /Griffin/, ['Field:Political science', 'Field:Fascism studies']],
  ['Cas Mudde', /Mudde/, ['Field:Political science', 'Field:Far-right politics']],
  ['Jean-Marie Le Pen', /Le Pen/, [], 'Far right'],
  ['Deng Xiaoping', /Deng Xiaoping/, ['Ideology:Communism', 'Role:Head of state'], 'Far left'],
  // ---- Schools of thought and theories (each one's kind is its entry's type). A school carries its own School value
  // (and its parent's, as a thinker of its branch does), so a filter on a school finds the school's entry with its thinkers.
  ['Classical economics', /classical (economics|school)/i, ['School:Classical economics', 'Field:Economics']],
  ['Marxism', /Marxis[mt]/, [], 'Far left'],
  ['Keynesian economics', /Keynesian/, ['School:Keynesian economics', 'Field:Economics']],
  ['Austrian school of economics', /Austrian School/i, ['School:Austrian school', 'Field:Economics']],
  ['Chicago school of economics', /Chicago School/i, ['School:Chicago school of economics', 'Field:Economics']],
  ['Monetarism', /monetaris[mt]/i, ['School:Monetarism', 'Field:Economics']],
  ['Post-Keynesian economics', /Post-Keynesian/i, ['School:Keynesian economics', 'School:Post-Keynesian economics', 'Field:Economics']],
  ['New Keynesian economics', /New Keynesian/i, ['School:Keynesian economics', 'School:New Keynesian economics', 'Field:Economics']],
  ['Social democracy', /social democra/i, [], 'Left'],
  ['Communism', /communis[mt]/i, [], 'Far left'],
  ['Anarchism', /anarchis[mt]/i, [], 'Far left'],
  ['Fascism', /fascis[mt]/i, [], 'Far right'],
  ['Nazism', /Nazi/, [], 'Far right'],
  ['Realism (international relations)', /\brealis[mt]/i, ['School:Realism', 'Field:International relations']],
  ['Neorealism (international relations)', /structural realism|neo-?realism/i, ['School:Realism', 'School:Neorealism (structural realism)', 'Field:International relations']],
  ['Offensive realism', /offensive realism/i, ['School:Realism', 'School:Neorealism (structural realism)', 'School:Offensive realism', 'Field:International relations']],
  ['Liberal institutionalism', /liberal institutionalis/i, ['School:Liberal institutionalism', 'Field:International relations']],
  ['Constructivism (international relations)', /constructivis/i, ['School:Constructivism', 'Field:International relations']],
  ['Conservatism', /conservatis[mt]/i, [], 'Right'],
  ['Classical liberalism', /classical liberal|market liberal/i, [], 'Right'],
  ['One-nation conservatism', /One Nation/, ['Ideology:Conservatism'], 'Right'],
  // A word for the free-market policies that spread from the 1980s, used mostly by their critics and applied to the
  // Third Way as well as the right: it takes no place on the line.
  ['Neoliberalism', /neo-?liberal/i, ['Field:Economics']],
  ['Third Way', /Third Way/, [], 'Centre'],
  ['Christian democracy', /Christian democra/i, [], 'Centre'],
  ['Efficient-market hypothesis', /efficient market hypothesis|efficient-market/i, ['Field:Finance']],
  ['Capital asset pricing model', /\bCAPM\b|capital asset pricing/i, ['Field:Finance']],
  ['Modigliani–Miller theorem', /Modigliani/, ['Field:Finance']],
  ['Comparative advantage', /comparative advantage/i, ['Field:Economics']],
  ['Quantitative easing', /quantitative easing/i, ['Field:Economics']],
];

// The groups a hand-made tag may be in, and those the Learning adapter alone gives (adapters.mjs ADAPTER_TAG_GROUPS).
export const TAG_GROUPS = ['School', 'Ideology', 'Field', 'Theory', 'Occupation', 'Role'];
// A position on the line from left to right, named as the Political Briefing names its five
// (briefing/scripts/sources.mjs POSITIONS): Far left, Left, Centre, Right, Far right. No other value is a position.
export const POSITIONS = BRIEFING_POSITIONS.map(p => p.label);
// The position the Politics course's units give, by the unit title's first segment ("Left · Social democracy …"). The
// unit on realism ("Realism · John Mearsheimer and the Realists") gives none: realism is not on the line.
export const UNIT_POSITION = Object.fromEntries(POSITIONS.map(p => [p, p]));
// A unit gives its position only to those it teaches as its own (a row's fourth element): a unit also teaches its
// movement's scholars, critics and rivals, who take none from it (the far right's historians Paxton, Griffin and Mudde;
// the realists' critics; Rawls, Attlee and Blair, named in the right's unit; Thatcher in a quiz on the left; Marx in
// the centre's lesson). The placement is VM's own, from where the course teaches someone, not a source's: every tag it
// gives carries POSITION_NOTE (build.mjs keeps it in the record's `tn`; the Master Index shows it beside the tag and in
// the filter's heading) until a source is found (the review's step F7 adds sourced positions beside it).
export const POSITION_NOTE = 'VM’s own placement, by the unit of the Politics course that teaches it; no source is cited for it yet';
export const positionTag = (unit, own) => {
  const p = UNIT_POSITION[String(unit).split(' · ')[0]];
  return p && p === own ? p : null;
};

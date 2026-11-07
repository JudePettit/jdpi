// People and schools of thought taught in the Learning courses, how to find them in the lesson text, and
// curated JDP-I tags for schools of thought that Wikidata doesn't record consistently.
// [English Wikipedia title, regex matched against lesson text, curated tags]
export const THINKERS = [
  // ---- Economics
  ['Adam Smith', /Adam Smith|\bSmith\b/, ['Classical economics', 'Capitalism', 'Economist', 'Philosopher']],
  ['David Ricardo', /Ricardo/, ['Classical economics', 'Economist']],
  ['Jean-Baptiste Say', /Jean-Baptiste Say|Say's law/, ['Classical economics', 'Economist']],
  ['John Stuart Mill', /John Stuart Mill|\bMill\b/, ['Classical economics', 'Liberal', 'Philosopher', 'Economist']],
  ['Karl Marx', /\bMarx\b/, ['Marxist', 'Communist', 'Socialist', 'Far left', 'Philosopher', 'Economist']],
  ['Friedrich Engels', /Engels/, ['Marxist', 'Communist', 'Socialist', 'Far left', 'Philosopher']],
  ['Vladimir Lenin', /Lenin/, ['Marxist', 'Communist', 'Revolutionary socialist', 'Far left', 'Head of government']],
  ['Eduard Bernstein', /Bernstein/, ['Social democrat', 'Socialist', 'Left wing']],
  ['Oskar Lange', /Lange/, ['Market socialism', 'Socialist', 'Economist']],
  ['John Maynard Keynes', /Keynes\b/, ['Keynesian', 'Economist']],
  ['John Hicks', /Hicks/, ['Keynesian', 'Neoclassical synthesis', 'Economist']],
  ['Paul Samuelson', /Samuelson/, ['Keynesian', 'Neoclassical synthesis', 'Economist']],
  ['Hyman Minsky', /Minsky/, ['Keynesian', 'Post-Keynesian', 'Economist']],
  ['Joan Robinson', /Joan Robinson/, ['Keynesian', 'Post-Keynesian', 'Economist']],
  ['Ludwig von Mises', /Mises/, ['Austrian School', 'Classical liberal', 'Economist']],
  ['Carl Menger', /Menger/, ['Austrian School', 'Economist']],
  ['Eugen von Böhm-Bawerk', /Böhm-Bawerk/, ['Austrian School', 'Economist']],
  ['Friedrich Hayek', /Hayek/, ['Austrian School', 'Classical liberal', 'Right wing', 'Economist', 'Philosopher']],
  ['Murray Rothbard', /Rothbard/, ['Austrian School', 'Anarcho-capitalist', 'Economist']],
  ['Milton Friedman', /Friedman/, ['Chicago School', 'Monetarist', 'Classical liberal', 'Right wing', 'Economist']],
  ['Anna Schwartz', /Schwartz/, ['Chicago School', 'Monetarist', 'Economist']],
  ['Edmund Phelps', /Phelps/, ['Economist']],
  ['Frank Knight', /Frank Knight/, ['Chicago School', 'Economist']],
  ['George Stigler', /Stigler/, ['Chicago School', 'Economist']],
  ['Ronald Coase', /Coase/, ['Chicago School', 'Law and economics', 'Economist']],
  ['Gary Becker', /Becker/, ['Chicago School', 'Economist']],
  ['Robert Lucas Jr.', /Robert Lucas|Lucas critique/, ['Chicago School', 'New classical economics', 'Economist']],
  ['Eugene Fama', /Fama/, ['Chicago School', 'Efficient-market hypothesis', 'Economist']],
  ['Richard Werner', /Werner/, ['Credit creation theory', 'Economist']],
  ['James M. Buchanan', /Buchanan/, ['Public choice', 'Economist']],
  ['Harry Markowitz', /Markowitz/, ['Modern portfolio theory', 'Economist']],
  // ---- Politics
  ['Rosa Luxemburg', /Luxemburg/, ['Marxist', 'Revolutionary socialist', 'Far left']],
  ['Leon Trotsky', /Trotsky/, ['Marxist', 'Communist', 'Far left']],
  ['Mao Zedong', /\bMao\b/, ['Marxist', 'Communist', 'Far left', 'Head of state']],
  ['Antonio Gramsci', /Gramsci/, ['Marxist', 'Far left', 'Philosopher']],
  ['Pierre-Joseph Proudhon', /Proudhon/, ['Anarchist', 'Far left', 'Philosopher']],
  ['Mikhail Bakunin', /Bakunin/, ['Anarchist', 'Far left']],
  ['Peter Kropotkin', /Kropotkin/, ['Anarchist', 'Far left']],
  ['Joseph Stalin', /Stalin/, ['Communist', 'Far left', 'Head of government']],
  ['Fidel Castro', /Castro/, ['Communist', 'Far left', 'Head of state']],
  ['William Beveridge', /Beveridge/, ['Liberal', 'Welfare state', 'Economist']],
  ['Anthony Crosland', /Crosland/, ['Social democrat', 'Left wing']],
  ['John Rawls', /Rawls/, ['Liberal', 'Left wing', 'Philosopher', 'Political philosophy']],
  ['Franklin D. Roosevelt', /Roosevelt/, ['New Deal', 'Left wing', 'Head of state']],
  ['Clement Attlee', /Attlee/, ['Social democrat', 'Left wing', 'Head of government']],
  ['Olof Palme', /Palme/, ['Social democrat', 'Left wing', 'Head of government']],
  ['Willy Brandt', /Brandt/, ['Social democrat', 'Left wing', 'Head of government']],
  ['Karl Popper', /Popper/, ['Liberal', 'Centrist', 'Philosopher']],
  ['Konrad Adenauer', /Adenauer/, ['Christian democrat', 'Centre right', 'Head of government']],
  ['Alcide De Gasperi', /De Gasperi/, ['Christian democrat', 'Centre right', 'Head of government']],
  ['Ludwig Erhard', /Erhard/, ['Christian democrat', 'Social market economy', 'Economist']],
  ['Anthony Giddens', /Giddens/, ['Third Way', 'Centrist', 'Sociologist']],
  ['Bill Clinton', /Clinton/, ['Third Way', 'Centrist', 'Head of state']],
  ['Tony Blair', /Blair/, ['Third Way', 'Centrist', 'Head of government']],
  ['Gerhard Schröder', /Schröder/, ['Third Way', 'Centrist', 'Head of government']],
  ['Emmanuel Macron', /Macron/, ['Centrist', 'Head of state']],
  ['Edmund Burke', /Burke/, ['Conservative', 'Right wing', 'Philosopher']],
  ['Michael Oakeshott', /Oakeshott/, ['Conservative', 'Right wing', 'Philosopher']],
  ['Robert Nozick', /Nozick/, ['Libertarian', 'Right wing', 'Philosopher', 'Political philosophy']],
  ['Russell Kirk', /\bKirk\b/, ['Conservative', 'Traditionalist conservative', 'Right wing']],
  ['William F. Buckley Jr.', /Buckley/, ['Conservative', 'Fusionist', 'Right wing', 'Journalist']],
  ['Roger Scruton', /Scruton/, ['Conservative', 'Right wing', 'Philosopher']],
  ['Benjamin Disraeli', /Disraeli/, ['Conservative', 'One-nation conservative', 'Right wing', 'Head of government']],
  ['Margaret Thatcher', /Thatcher/, ['Conservative', 'Right wing', 'Head of government']],
  ['Ronald Reagan', /Reagan/, ['Conservative', 'Right wing', 'Head of state']],
  ['Thucydides', /Thucydides/, ['Realist', 'Classical realism', 'Historian']],
  ['Niccolò Machiavelli', /Machiavelli/, ['Realist', 'Classical realism', 'Philosopher']],
  ['Thomas Hobbes', /Hobbes/, ['Realist', 'Classical realism', 'Philosopher']],
  ['E. H. Carr', /E\. H\. Carr|\bCarr\b/, ['Realist', 'Classical realism', 'International relations', 'Historian']],
  ['Hans Morgenthau', /Morgenthau/, ['Realist', 'Classical realism', 'International relations', 'Political science']],
  ['Kenneth Waltz', /Waltz/, ['Realist', 'Structural realism', 'Defensive realism', 'International relations', 'Political science']],
  ['Stephen Walt', /Walt\b/, ['Realist', 'Structural realism', 'Defensive realism', 'International relations', 'Political science']],
  ['John Mearsheimer', /Mearsheimer/, ['Realist', 'Structural realism', 'Offensive realism', 'International relations', 'Political science']],
  ['Henry Kissinger', /Kissinger/, ['Realist', 'International relations', 'Diplomat']],
  ['Robert Keohane', /Keohane/, ['Liberal institutionalist', 'International relations', 'Political science']],
  ['Joseph Nye', /\bNye\b/, ['Liberal institutionalist', 'International relations', 'Political science']],
  ['Alexander Wendt', /Wendt/, ['Constructivist', 'International relations', 'Political science']],
  ['Benito Mussolini', /Mussolini/, ['Fascist', 'Far right', 'Head of government']],
  ['Adolf Hitler', /Hitler/, ['Nazi', 'Fascist', 'Far right', 'Head of state']],
  ['Francisco Franco', /Franco\b/, ['Nationalist', 'Far right', 'Head of state']],
  ['Robert Paxton', /Paxton/, ['Historian', 'Scholar of fascism']],
  ['Roger Griffin', /Griffin/, ['Political science', 'Scholar of fascism']],
  ['Cas Mudde', /Mudde/, ['Political science', 'Scholar of the radical right']],
  ['Jean-Marie Le Pen', /Le Pen/, ['Far right']],
  ['Deng Xiaoping', /Deng Xiaoping/, ['Communist', 'Head of state']],
  // ---- Schools of thought and theories
  ['Classical economics', /classical (economics|school)/i, ['School of thought', 'Economics']],
  ['Marxism', /Marxis[mt]/, ['School of thought', 'Far left']],
  ['Keynesian economics', /Keynesian/, ['School of thought', 'Economics']],
  ['Austrian school of economics', /Austrian School/i, ['School of thought', 'Economics']],
  ['Chicago school of economics', /Chicago School/i, ['School of thought', 'Economics']],
  ['Monetarism', /monetaris[mt]/i, ['School of thought', 'Economics']],
  ['Post-Keynesian economics', /Post-Keynesian/i, ['School of thought', 'Economics']],
  ['New Keynesian economics', /New Keynesian/i, ['School of thought', 'Economics']],
  ['Social democracy', /social democra/i, ['School of thought', 'Left wing']],
  ['Communism', /communis[mt]/i, ['School of thought', 'Far left']],
  ['Anarchism', /anarchis[mt]/i, ['School of thought', 'Far left']],
  ['Fascism', /fascis[mt]/i, ['School of thought', 'Far right']],
  ['Nazism', /Nazi/, ['School of thought', 'Far right']],
  ['Realism (international relations)', /\brealis[mt]/i, ['School of thought', 'Realist', 'International relations']],
  ['Neorealism (international relations)', /structural realism|neo-?realism/i, ['School of thought', 'Realist', 'Structural realism', 'International relations']],
  ['Offensive realism', /offensive realism/i, ['School of thought', 'Realist', 'Structural realism', 'International relations']],
  ['Liberal institutionalism', /liberal institutionalis/i, ['School of thought', 'International relations']],
  ['Constructivism (international relations)', /constructivis/i, ['School of thought', 'International relations']],
  ['Conservatism', /conservatis[mt]/i, ['School of thought', 'Right wing']],
  ['Classical liberalism', /classical liberal|market liberal/i, ['School of thought', 'Right wing']],
  ['One-nation conservatism', /One Nation/, ['School of thought', 'Conservative', 'Right wing']],
  // A word for the free-market policies that spread from the 1980s, used mostly by their critics and applied to the
  // Third Way as well as the right: it takes no place on the line.
  ['Neoliberalism', /neo-?liberal/i, ['School of thought', 'Economics']],
  ['Third Way', /Third Way/, ['School of thought', 'Centrist']],
  ['Christian democracy', /Christian democra/i, ['School of thought', 'Centre right']],
  ['Efficient-market hypothesis', /efficient market hypothesis|efficient-market/i, ['Theory', 'Finance']],
  ['Capital asset pricing model', /\bCAPM\b|capital asset pricing/i, ['Theory', 'Finance']],
  ['Modigliani–Miller theorem', /Modigliani/, ['Theory', 'Finance']],
  ['Comparative advantage', /comparative advantage/i, ['Theory', 'Economics']],
  ['Quantitative easing', /quantitative easing/i, ['Policy', 'Economics']],
];

// Spectrum position by Politics course unit (the unit title's first segment). Realism is a school of thought about
// power among states, held by people of the left, the centre and the right, so it has no place on the line from left
// to right: its unit ("Outside the spectrum") gives "Sui generis (Realist)", in the same tag group, so the Realists
// can still be found together. The mainstream right (conservatism and market liberalism) has its own unit, "Right
// wing", between the centre and the Realists.
export const SPECTRUM = { 'Far left': 'Far left', 'Left wing': 'Left wing', 'Centre': 'Centrist', 'Right wing': 'Right wing', 'Outside the spectrum': 'Sui generis (Realist)', 'Far right': 'Far right' };
// A spectrum tag that only a school's own members take: the realist unit also teaches realism's critics (liberal
// institutionalists, constructivists), who are not Realists and take no position from it; the right's unit also names
// the people and schools it is compared with (Rawls, Attlee, Blair, Christian democracy, realism, monetarism), who are
// not of the right, so only those tagged 'Right wing' above take its position.
export const SPECTRUM_SCHOOL = { 'Sui generis (Realist)': 'Realist', 'Right wing': 'Right wing' };
// A thinker given a position on the line above keeps it: a unit that only names them (Thatcher in a quiz on the left,
// Marx in the centre's lesson) gives them no other.
const OWN = new Set(Object.values(SPECTRUM));
export const spectrumTag = (unit, tags) => {
  const s = SPECTRUM[String(unit).split(' · ')[0]];
  if (!s || (SPECTRUM_SCHOOL[s] && !tags.includes(SPECTRUM_SCHOOL[s]))) return null;
  const own = tags.filter(t => OWN.has(t));
  return own.length && !own.includes(s) ? null : s;
};

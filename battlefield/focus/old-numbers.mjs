// War Focus's old state numbers (second review X4, 22 November 2026). Until 21 November 2026 War Focus keyed its
// states by Gleditsch–Ward number (CShapes 2.0), so Documentary mode's and Kino's focus named them gw:<number>, and its
// links to the Retrospective Battlefield c=<number>. Most numbers are in the Battlefield's own table
// (../history/data/places.json oldCountries, ../history/old-countries.js); these are the ones it lacks, or gives
// another state for the years War Focus used them (552, Rhodesia there; 713, Taiwan, which War Focus drew as Taiwan
// under Japanese rule to 1945). Each is the Q-id the conversion gave the number in scripts/wars.mjs, entry by entry
// against the war list of before (git 9e6c818^), with the first and last years of the wars that used it, as runs
// [[first, last, Q]] read by oldCountry() like oldCountries. Not a crosswalk of borders: a number to the state it named.
// Loaded only when an old number is asked for.
export const OLD_NUMBERS = {
  3: [[1941, 1945, 'Q30']], 4: [[1941, 1945, 'Q30']], 6: [[1941, 1945, 'Q30']], 20: [[1939, 1953, 'Q16']],
  21: [[1939, 1945, 'Q38610']], 31: [[1939, 1945, 'Q778']], 51: [[1939, 1945, 'Q766']], 53: [[1939, 1945, 'Q244']],
  80: [[1939, 1945, 'Q242']], 110: [[1939, 1945, 'Q734']], 140: [[1942, 1945, 'Q155']], 211: [[1940, 1945, 'Q31']],
  212: [[1940, 1945, 'Q32']], 255: [[1939, 1945, 'Q183']], 290: [[1939, 2011, 'Q36']], 305: [[1939, 1945, 'Q40']],
  315: [[1939, 1945, 'Q33946']], 325: [[1940, 1945, 'Q38']], 338: [[1939, 1945, 'Q233']],
  355: [[1941, 1945, 'Q219']], 375: [[1939, 1945, 'Q33']], 385: [[1940, 1945, 'Q20']], 390: [[1940, 1945, 'Q35']],
  515: [[1940, 1945, 'Q590743']], 521: [[1939, 1945, 'Q662653']], 551: [[1939, 1945, 'Q953']],
  552: [[1939, 2003, 'Q954']], 553: [[1939, 1945, 'Q1020']], 571: [[1939, 1945, 'Q963']],
  572: [[1939, 1945, 'Q1050']], 602: [[1936, 1939, 'Q457242']], 665: [[1939, 1945, 'Q193714']],
  681: [[1939, 1945, 'Q49910']], 712: [[1939, 1945, 'Q711']], 713: [[1931, 1945, 'Q137816'], [1946, 2026, 'Q865']],
  730: [[1931, 1945, 'Q503585']], 740: [[1931, 1945, 'Q17']], 815: [[1940, 1954, 'Q881']],
  821: [[1939, 1945, 'Q1400154']], 822: [[1939, 1945, 'Q1973084']], 823: [[1939, 1945, 'Q1147441']],
  824: [[1939, 1945, 'Q1658411']], 827: [[1939, 1945, 'Q376178']], 860: [[1942, 1945, 'Q574']],
  900: [[1939, 2011, 'Q408']], 911: [[1939, 1945, 'Q530560']], 912: [[1939, 1945, 'Q1443945']],
  940: [[1939, 1945, 'Q685']], 950: [[1939, 1945, 'Q712']], 5200: [[1940, 1945, 'Q319984']],
  7351: [[1941, 1945, 'Q696736']],
};

// War Focus's old state numbers (second review X4, 22 November 2026; third review R4 and R5). Until 21 November 2026
// War Focus keyed its states by Gleditsch–Ward number (CShapes 2.0), so Documentary mode's and Kino's focus named them
// gw:<number>, and its links to the Retrospective Battlefield c=<number>. Most numbers are in the Battlefield's own table
// (../history/data/places.json oldCountries, ../history/old-countries.js); these are the ones it lacks, or gives
// another state for the years War Focus used them (552, Zimbabwe in WWII and the Second Congo War, Rhodesia between;
// 713, Taiwan under Japanese rule to 1945). Runs [[first, last, Q]] hold only the years the old definitions used the
// number for that state: the years of the wars that used it (the Q-id the conversion gave it in scripts/wars.mjs,
// entry by entry against the war list of before, git 9e6c818^), and the years the old border file
// (../history/data/borders.topo.json) drew it under that state's name, from 1926, where the Battlefield's table has no
// answer or another state (East Germany, 265; Czechoslovakia, 315; Serbia from 2006, 345; Taiwan and Korea under
// Japanese rule, 713 and 730). oldNumber() reads a run only in its own years; in any other year the Battlefield's answer
// stands. Not a crosswalk of borders: a number to the state it named. Loaded only when an old number is asked for.
export const OLD_NUMBERS = {
  3: [[1941, 1945, 'Q30']], 4: [[1941, 1945, 'Q30']], 6: [[1941, 1945, 'Q30']], 20: [[1939, 1945, 'Q16'], [1950, 1953, 'Q16']],
  21: [[1926, 1948, 'Q38610']], 31: [[1939, 1945, 'Q778']], 51: [[1939, 1945, 'Q766']], 53: [[1939, 1945, 'Q244']],
  80: [[1939, 1945, 'Q242']], 110: [[1939, 1945, 'Q734']], 140: [[1942, 1945, 'Q155']], 211: [[1940, 1945, 'Q31']],
  212: [[1940, 1945, 'Q32']], 255: [[1926, 1945, 'Q183']], 265: [[1949, 1990, 'Q16957']], 290: [[1939, 1945, 'Q36'], [2003, 2011, 'Q36']],
  291: [[1926, 1938, 'Q216173']], 305: [[1939, 1945, 'Q40']], 315: [[1926, 1992, 'Q33946']], 325: [[1940, 1945, 'Q38']],
  338: [[1939, 1945, 'Q233']], 345: [[2006, 2025, 'Q403']], 355: [[1941, 1945, 'Q219']], 375: [[1939, 1945, 'Q33']],
  385: [[1940, 1945, 'Q20']], 390: [[1940, 1945, 'Q35']], 511: [[1926, 1964, 'Q157904']], 515: [[1926, 1962, 'Q590743']],
  521: [[1926, 1960, 'Q662653']], 551: [[1939, 1945, 'Q953']], 552: [[1939, 1945, 'Q954'], [1998, 2003, 'Q954']],
  553: [[1939, 1945, 'Q1020']], 571: [[1939, 1945, 'Q963']], 572: [[1939, 1945, 'Q1050']], 602: [[1926, 1956, 'Q457242']],
  665: [[1926, 1948, 'Q193714']], 681: [[1937, 1962, 'Q49910']], 712: [[1939, 1939, 'Q711'], [1945, 1945, 'Q711']],
  713: [[1926, 1945, 'Q137816']], 730: [[1926, 1945, 'Q503585']], 740: [[1931, 1933, 'Q17'], [1937, 1945, 'Q17']],
  815: [[1940, 1954, 'Q881']], 821: [[1926, 1946, 'Q1400154']], 822: [[1926, 1946, 'Q1973084']],
  823: [[1926, 1946, 'Q1147441']], 824: [[1926, 1946, 'Q1658411']], 827: [[1926, 1946, 'Q376178']], 860: [[1942, 1945, 'Q574']],
  900: [[1939, 1945, 'Q408'], [1950, 1953, 'Q408'], [1962, 1972, 'Q408'], [2003, 2011, 'Q408']], 911: [[1926, 1949, 'Q530560']],
  912: [[1926, 1949, 'Q1443945']], 940: [[1939, 1945, 'Q685']], 950: [[1939, 1945, 'Q712']], 5200: [[1926, 1945, 'Q319984']],
  7351: [[1926, 1945, 'Q696736']], 7506: [[1947, 1949, 'Q2571484']],
};
/** The state an old number named in year y, only within one of its runs; else null. */
export const oldNumber = (n, y) => OLD_NUMBERS[n]?.find(([a, b]) => a <= y && y <= b)?.[2] || null;

// Build 14 of the ChatGPT review corrections (25 November 2026): the "Free first" wording.
// front-pages-27: Highbrowse and the Political Briefing said a story only paywalled outlets covered "never comes first"
// or "never takes the top place of a list". The rule (PRPAccess.leadFree, design/prp-access.js) moves the first free
// story to the top and leaves every other story in its order, so when no story in a list is free, a paywalled one
// still leads (seen live on 25 November: an Economics story only the WSJ ran). The pages now say what the rule does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../design/prp-access.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(root + p, 'utf8');
const A = globalThis.PRPAccess;

test('the rule the wording describes: a paywalled story leads only a list with no free story in it', () => {
  const L = ['paid', 'signup', 'free', 'paid'].map((c, n) => ({ n, access: c }));
  assert.deepEqual(A.leadFree(L).map(x => x.n), [2, 0, 1, 3], 'a free story takes the top place; the paywalled ones keep their order below it');
  assert.equal(A.leadFree(L.filter(x => x.access !== 'free'))[0].access, 'paid', 'with no free story, a paywalled one comes first');
});

// After the second readers: a position's Top stories list (rankTops with a position) and a briefing's "Its biggest
// story" (digest's coverage) count a story as free only from their own headlines, so "has a free publisher" is not
// what decides the top place; "is led by a free headline" is.
test('a position\'s list counts a story free only by its own headlines (so the pages say "led by", not "has")', async () => {
  const { rankTops } = await import('../highbrowse/analysis.js');
  const e = (pos, acc, sid, at) => ({ item: { pos, acc, sid, at }, rank: 0 });
  const story = (order, positions, entries) => ({ order, positions, publishers: Object.values(positions).reduce((a, b) => a + b, 0), headlines: entries.length, last: 0, entries });
  // A: three left publishers, all paywalled. B: two paywalled left publishers and a free centre one.
  const A = story(0, { left: 3 }, [e('left', 'paid', 'a1', 3), e('left', 'paid', 'a2', 2), e('left', 'paid', 'a3', 1)]);
  const B = story(1, { left: 2, centre: 1 }, [e('left', 'paid', 'b1', 3), e('left', 'paid', 'b2', 2), e('centre', 'free', 'b3', 1)]);
  const left = rankTops([A, B], { position: 'left' });
  assert.deepEqual(left.map(s => s.order), [0, 1], 'in the left list a story only paywalled publishers ran stays first');
  assert.equal(left[1].free, false, 'B has a free publisher, but not one of the left, so no story in the left list is led by a free headline');
  assert.deepEqual(rankTops([A, B]).map(s => s.order), [1, 0], 'in the list of all publishers B is led by its free headline and takes the top place');
});

const OLD = [/never comes first/, /never takes the top place/];
const PAGES = {
  'highbrowse/index.html': {
    gone: [/no story in that list has a free outlet/, /has a free outlet \(otherwise it keeps its place lower down\)/],
    wanted: [/takes the top place of a list only when no story in that list is led by a free outlet's headline \(otherwise the first story that is takes the top place, and the rest keep their order\)/],
  },
  'highbrowse/app.js': { gone: [], wanted: [/comes first only when none of these stories has a free outlet/] },
  'q/briefing.html': {
    gone: [/no story in the list has a free publisher/, /no story in the list has a free headline/],
    wanted: [
      /ran comes first only when no story in the list is led by a free publisher’s headline/,
      /comes first only when the list has no free one/,
      /ran comes first only when no story in the list is led by a free headline/,
    ],
  },
};

for (const [file, { gone, wanted }] of Object.entries(PAGES)) {
  test(`front-pages-27: ${file} no longer says a paywalled story never comes first`, () => {
    const text = read(file);
    for (const re of [...OLD, ...gone]) assert.doesNotMatch(text, re, `${file} still says ${re}`);
    for (const re of wanted) assert.match(text, re, `${file} says what the rule does`);
  });
}

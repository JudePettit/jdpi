// Headline trends (design/prp-trends.js): the rule behind Highbrowse's Trends tab and the Dashboard's
// "Headline trends" card, checked against numbers worked out by hand: the weeks a store's time gives, a day held in
// full, a week that counts, shares, rising and falling at their edges, the percentile with a tie, too little history,
// a new topic, the Dashboard's order on a tie, and the accrual of stories from one store to the next.
// No network and no browser: part of npm run test:unit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accrue, trends, week, weekDays, emptyHistory, percentile, firstDay, movers, METHOD, LATE_HOURS, DAY, HOUR,
  WEEK_MIN_STORIES, BASE_WEEKS, PCT_MIN, RISE_RATIO, FALL_RATIO, MIN_STORIES, addDays, utcDay, dayList,
} from '../design/prp-trends.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* A history made by hand: `weeks` lists each week's [stories, { topic: stories }], this week first, each spread over its
   seven days (the remainder on the last day), every day held in full unless `notOk` names it. */
const TODAY = '2026-12-31';
const GENERATED = '2026-12-31T07:45:00Z';
function made(weeks, { notOk = [], listed = null } = {}) {
  const h = emptyHistory();
  weeks.forEach(([stories, topics], k) => {
    const days = weekDays(TODAY, k);
    days.forEach((d, i) => {
      const part = n => (i < 6 ? Math.floor(n / 7) : n - 6 * Math.floor(n / 7));
      const t = {};
      for (const [id, n] of Object.entries(topics)) if (!listed || listed(id, k)) t[id] = part(n);
      h.days[d] = { n: part(stories), t, ok: !notOk.includes(d) };
    });
  });
  return h;
}
const TOPICS = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase() }));
const row = (t, id) => t.topics.find(x => x.id === id);

describe('weeks', () => {
  test('this week is the seven whole UTC days before the store\'s day; earlier weeks step back seven days', () => {
    assert.deepEqual(weekDays('2026-11-13', 0), ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    assert.deepEqual(weekDays('2026-11-13', 1)[0], '2026-10-30');
    assert.deepEqual(weekDays('2026-11-13', 1)[6], '2026-11-05');
    const t = trends(emptyHistory(), { generated: '2026-11-13T20:37:20Z', topics: [] });
    assert.deepEqual(t.week, { from: '2026-11-06', to: '2026-11-12' }, 'a store made at 20:37 on 13 Nov: 6 to 12 Nov');
  });
  test('a week counts when its seven days are held in full and it held at least 50 stories', () => {
    const h = made([[140, {}], [49, {}], [50, {}]], { notOk: [weekDays(TODAY, 0)[3]] });
    const w = k => week(h, TODAY, k);
    assert.equal(w(0).counts, false); assert.equal(w(0).why, '1 of its days is not held in full');
    assert.equal(w(1).counts, false); assert.equal(w(1).why, `fewer than ${WEEK_MIN_STORIES} stories`);
    assert.equal(w(2).counts, true); assert.equal(w(2).stories, 50);
    assert.equal(w(3).counts, false, 'a week with no days at all'); assert.equal(w(3).why, '7 of its days are not held in full');
  });
});

describe('rising, falling and steady, worked by hand', () => {
  // 140 stories a week (20 a day). A: 14, 14, 21, 7 in the four weeks before (shares 10%, 10%, 15%, 5%: b = 10%), 42
  // this week (30%): e = 140 × 0.1 = 14, 42 − 14 = 28 ≥ 2√14 = 7.5, so rising, 3 times the baseline. B: 42 (30%) every
  // week before, 14 (10%) now: e = 42, 42 − 14 = 28 ≥ 2√42 = 13.0, 10% ≤ 0.8 × 30%, so falling. C: 28 every week: steady.
  const H = made([[140, { a: 42, b: 14, c: 28 }], [140, { a: 14, b: 42, c: 28 }], [140, { a: 14, b: 42, c: 28 }], [140, { a: 21, b: 42, c: 28 }], [140, { a: 7, b: 42, c: 28 }]]);
  const t = trends(H, { generated: GENERATED, topics: TOPICS.slice(0, 3) });
  test('status, baseline and shares', () => {
    assert.equal(t.status, 'ok'); assert.equal(t.reason, null); assert.deepEqual(t.baseline, [1, 2, 3, 4]);
    const a = row(t, 'a');
    assert.equal(a.n0, 42); assert.equal(a.s0, 0.3);
    assert.deepEqual(a.base.map(x => x.n), [14, 14, 21, 7]);
    assert.ok(Math.abs(a.b - 0.1) < 1e-12); assert.ok(Math.abs(a.e - 14) < 1e-9); assert.ok(Math.abs(a.ratio - 3) < 1e-9);
  });
  test('A rises, B falls, C is steady', () => {
    assert.equal(row(t, 'a').trend, 'rising');
    assert.equal(row(t, 'b').trend, 'falling');
    assert.equal(row(t, 'c').trend, 'steady');
  });
  test('rising at its edge: exactly 1.25 times the baseline rises, one story fewer does not', () => {
    // 1,400 stories a week; 280 (20%) in each week before. 350 (25% = 1.25 × 20%): e = 280, 350 − 280 = 70 ≥ 2√280 = 33.5.
    const base = [[1400, { a: 280 }], [1400, { a: 280 }], [1400, { a: 280 }], [1400, { a: 280 }]];
    assert.equal(RISE_RATIO, 1.25);
    assert.equal(row(trends(made([[1400, { a: 350 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'rising');
    assert.equal(row(trends(made([[1400, { a: 349 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'steady');
  });
  test('falling at its edge: exactly 0.8 times the baseline falls, one story more does not', () => {
    // 1,400 a week; 350 (25%) before. 280 (20% = 0.8 × 25%): e = 350, 350 − 280 = 70 ≥ 2√350 = 37.4.
    const base = [[1400, { a: 350 }], [1400, { a: 350 }], [1400, { a: 350 }], [1400, { a: 350 }]];
    assert.equal(FALL_RATIO, 0.8);
    assert.equal(row(trends(made([[1400, { a: 280 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'falling');
    assert.equal(row(trends(made([[1400, { a: 281 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'steady');
  });
  test('a small topic needs 20 stories, and a change of twice the square root of the expected count', () => {
    assert.equal(MIN_STORIES, 20);
    // 140 a week; 7 (5%) before, 19 now (13.6%): above every week and 2.7 times b, but under 20 stories: steady.
    const base = [[140, { a: 7 }], [140, { a: 7 }], [140, { a: 7 }], [140, { a: 7 }]];
    assert.equal(row(trends(made([[140, { a: 19 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'steady');
    assert.equal(row(trends(made([[140, { a: 20 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'rising', 'e = 7, 20 − 7 = 13 ≥ 2√7 = 5.3');
    // 1,400 a week; 140 (10%) before; 176 now (12.57%, at least 1.25 × 10%? no: 12.57% ≥ 12.5% yes): e = 140, 176 − 140 =
    // 36 ≥ 2√140 = 23.7: rising. A falling topic with an expected count under 20 never falls: 2 before (1.4%), 0 now.
    const big = [[1400, { a: 140 }], [1400, { a: 140 }], [1400, { a: 140 }], [1400, { a: 140 }]];
    assert.equal(row(trends(made([[1400, { a: 176 }], ...big]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'rising');
    const tiny = [[140, { a: 2 }], [140, { a: 2 }], [140, { a: 2 }], [140, { a: 2 }]];
    assert.equal(row(trends(made([[140, { a: 0 }], ...tiny]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'steady');
  });
  test('the share, not the count: twice the stories in a week twice as big is steady', () => {
    const base = [[700, { a: 70 }], [700, { a: 70 }], [700, { a: 70 }], [700, { a: 70 }]];
    assert.equal(row(trends(made([[1400, { a: 140 }], ...base]), { generated: GENERATED, topics: TOPICS }), 'a').trend, 'steady');
  });
});

describe('too little history, a new topic, the baseline skipping a week that does not count', () => {
  test('three earlier weeks: no trend and no number, the reason instead', () => {
    const t = trends(made([[140, { a: 42 }], [140, { a: 14 }], [140, { a: 14 }], [140, { a: 14 }]]), { generated: GENERATED, topics: TOPICS });
    assert.equal(t.status, 'short');
    assert.equal(t.reason, 'Not enough history yet: 3 of the 4 earlier weeks.');
    assert.equal(t.have, 3); assert.equal(t.need, BASE_WEEKS);
    const a = row(t, 'a');
    assert.equal(a.trend, null); assert.equal(a.b, null); assert.equal(a.percentile, null);
    assert.equal(a.n0, 42, 'this week\'s own count is a fact, and is shown');
    assert.equal(t.startsAbout, addDays(TODAY, 7), 'a week on, this week is the fourth earlier week');
  });
  test('this week not held in full: no numbers at all', () => {
    const t = trends(made([[140, { a: 42 }], [140, { a: 14 }], [140, { a: 14 }], [140, { a: 14 }], [140, { a: 14 }]], { notOk: [addDays(TODAY, -1)] }), { generated: GENERATED, topics: TOPICS });
    assert.equal(t.status, 'week'); assert.equal(t.reason, 'This week cannot be compared yet: 30 Dec is not held in full in the store\'s history.', 'the missing day named');
    assert.deepEqual(t.weeks[0].missing, ['2026-12-30']);
    assert.equal(row(t, 'a').n0, null);
    const two = trends(made([[140, {}], [140, {}]], { notOk: [addDays(TODAY, -3), addDays(TODAY, -2)] }), { generated: GENERATED, topics: TOPICS });
    assert.equal(two.reason, 'This week cannot be compared yet: 28 and 29 Dec are not held in full in the store\'s history.');
    const few = trends(made([[40, {}], [140, {}]]), { generated: GENERATED, topics: TOPICS });
    assert.equal(few.reason, `This week cannot be compared yet: it has fewer than ${WEEK_MIN_STORIES} stories.`);
    assert.equal(few.weeks[0].missing, undefined, 'no days missing: no list');
  });
  test('days as a reader says them', () => {
    assert.equal(dayList(['2026-11-10']), '10 Nov');
    assert.equal(dayList(['2026-11-10', '2026-11-11']), '10 and 11 Nov');
    assert.equal(dayList(['2026-11-08', '2026-11-09', '2026-11-10']), '8, 9 and 10 Nov');
    assert.equal(dayList(['2026-10-31', '2026-11-01']), '31 Oct and 1 Nov');
  });
  test('a topic not in the list in all four earlier weeks is new: no comparison', () => {
    const H = made([[140, { a: 42, d: 30 }], [140, { a: 14, d: 0 }], [140, { a: 14, d: 0 }], [140, { a: 14, d: 0 }], [140, { a: 14, d: 0 }]], { listed: (id, k) => id !== 'd' || k < 3 });
    const t = trends(H, { generated: GENERATED, topics: TOPICS });
    assert.equal(row(t, 'd').trend, 'new');
    assert.equal(row(t, 'd').b, null);
    assert.equal(row(t, 'a').trend, 'rising');
  });
  test('a topic in the list with no stories before and 20 now rises (up from nothing)', () => {
    const t = trends(made([[140, { d: 20 }], [140, { d: 0 }], [140, { d: 0 }], [140, { d: 0 }], [140, { d: 0 }]]), { generated: GENERATED, topics: TOPICS });
    assert.equal(row(t, 'd').trend, 'rising'); assert.equal(row(t, 'd').ratio, null, 'no ratio to a baseline of nothing');
  });
  test('the baseline is the four most recent earlier weeks that count, within twelve', () => {
    // Week 2 has a day not held in full: the baseline is weeks 1, 3, 4 and 5.
    const weeks = [[140, { a: 42 }], [140, { a: 14 }], [140, { a: 99 }], [140, { a: 14 }], [140, { a: 14 }], [140, { a: 14 }]];
    const t = trends(made(weeks, { notOk: [weekDays(TODAY, 2)[0]] }), { generated: GENERATED, topics: TOPICS });
    assert.deepEqual(t.baseline, [1, 3, 4, 5]);
    assert.equal(row(t, 'a').trend, 'rising');
    assert.equal(t.weeks.find(w => w.k === 2).counts, false);
  });
});

describe('the percentile', () => {
  test('lower weeks, plus half the equal ones, over every earlier week that counts', () => {
    // Shares before: 10, 20, 30, 30, 40, 50, 60, 70 % (of 100 stories); this week 30 %: 2 lower, 2 equal, 8 weeks:
    // 100 × (2 + 1) / 8 = 37.5, which rounds to 38.
    const earlier = [10, 20, 30, 30, 40, 50, 60, 70].map(n => [100, { a: n }]);
    const t = trends(made([[100, { a: 30 }], ...earlier]), { generated: GENERATED, topics: TOPICS });
    const a = row(t, 'a');
    assert.deepEqual(a.rank, { lower: 2, equal: 2, of: 8 });
    assert.equal(a.percentile, 38);
    assert.equal(percentile(9, 0, 12), 75, 'higher than in 9 of 12 is the 75th');
    assert.equal(a.history.length, 8, 'every counted week, so a reader can count it by hand');
    assert.deepEqual(a.history.map(w => w.n), [10, 20, 30, 30, 40, 50, 60, 70]);
  });
  test('fewer than 8 earlier weeks: no percentile', () => {
    assert.equal(PCT_MIN, 8);
    const t = trends(made([[100, { a: 30 }], ...[10, 20, 30, 40, 50, 60, 70].map(n => [100, { a: n }])]), { generated: GENERATED, topics: TOPICS });
    assert.equal(row(t, 'a').percentile, null); assert.equal(row(t, 'a').rank, null);
    assert.equal(t.weeksCounted, 7);
  });
});

describe('the Dashboard\'s list', () => {
  const mk = (id, ratio, n0, trend) => ({ id, label: id, short: id, ratio, n0, trend });
  test('the biggest change first; a tie goes to more stories, then the briefings\' order, then the name', () => {
    const list = [
      { briefing: 'economics', order: 2, trends: { status: 'ok', topics: [mk('trade', 2, 30, 'rising'), mk('labour', 2, 30, 'rising'), mk('macro', 0.5, 40, 'falling')] } },
      { briefing: 'political', order: 0, trends: { status: 'ok', topics: [mk('china', 2, 30, 'rising'), mk('europe', 3, 25, 'rising'), mk('economy', 0.5, 90, 'falling'), mk('ai', null, 22, 'rising')] } },
      { briefing: 'digital', order: 3, trends: { status: 'short', topics: [mk('chips', 9, 99, 'rising')] } },
    ];
    const { rising, falling } = movers(list);
    assert.deepEqual(rising.map(x => x.id), ['ai', 'europe', 'china'], 'up from nothing first, then 3×, then the 2× tie: China (Political) before Economics\' two');
    assert.deepEqual(falling.map(x => x.id), ['economy', 'macro'], 'the same fall: more stories first');
    const tie = movers([{ briefing: 'economics', order: 2, trends: { status: 'ok', topics: [mk('trade', 2, 30, 'rising'), mk('labour', 2, 30, 'rising')] } }], { rising: 2 });
    assert.deepEqual(tie.rising.map(x => x.id), ['labour', 'trade'], 'a full tie: by name');
    assert.ok(!rising.some(x => x.id === 'chips'), 'a briefing without enough history adds nothing');
  });
});

describe('accrual: from one store to the next', () => {
  const late = LATE_HOURS.economics;
  const snap = (generated, items, topics = [{ id: 'a' }, { id: 'b' }]) => ({ generated, keepDays: 7, topics, items });
  const it = (key, day, tp = []) => ({ key, day, tp });
  test('a story counts once for its day; a story a later store dropped still counts', () => {
    let h = accrue(emptyHistory(), snap('2026-11-01T00:00:00Z', [it('x', '2026-10-30', ['a'])]), { lateHours: late });
    h = accrue(h, snap('2026-11-10T01:45:00Z', [it('x', '2026-11-05', ['a'])]), { lateHours: late });
    let s1 = snap('2026-11-11T01:45:00Z', [it('p', '2026-11-10', ['a']), it('q', '2026-11-10', ['a', 'b'])]);
    h = accrue(h, s1, { lateHours: late });
    assert.deepEqual(h.days['2026-11-10'], { n: 2, t: { a: 2, b: 1 }, ok: true });
    // Six hours later the store holds q again and a new story r for the same day, but has dropped p.
    h = accrue(h, snap('2026-11-11T07:45:00Z', [it('q', '2026-11-10', ['a', 'b']), it('r', '2026-11-10', ['b'])]), { lateHours: late });
    assert.deepEqual(h.days['2026-11-10'], { n: 3, t: { a: 2, b: 2 }, ok: true });
    const again = accrue(h, snap('2026-11-11T07:45:00Z', [it('q', '2026-11-10', ['a', 'b']), it('r', '2026-11-10', ['b'])]), { lateHours: late });
    assert.deepEqual(again, h, 'the same store twice changes nothing');
  });
  test('a day is held in full only by a store made within the lateness limit after it ended, once the store was running', () => {
    assert.equal(LATE_HOURS.economics, 15); assert.equal(LATE_HOURS.political, 27);
    // The store first ran on 1 Nov at 05:52: 1 Nov itself had begun, so it does not count; 2 Nov does.
    let h = accrue(emptyHistory(), snap('2026-11-01T05:52:00Z', []), { lateHours: late });
    h = accrue(h, snap('2026-11-03T02:30:00Z', [it('a1', '2026-11-01'), it('b1', '2026-11-02')]), { lateHours: late });
    assert.equal(h.days['2026-11-01'].ok, false, 'the store was not running when 1 Nov began');
    assert.equal(h.days['2026-11-02'].ok, true, '2 Nov, held 2.5 h after it ended');
    // An outage: the next store is 40 hours after 3 Nov ended; 3 Nov is counted but not held in full.
    h = accrue(h, snap('2026-11-05T16:00:00Z', [it('c1', '2026-11-03'), it('d1', '2026-11-04')]), { lateHours: late });
    assert.equal(h.days['2026-11-03'].ok, false, '40 hours late');
    assert.equal(h.days['2026-11-04'].ok, false, '16 hours late: over 15');
    assert.equal(h.days['2026-11-03'].n, 1, 'still counted');
    // 15 hours exactly is within the limit.
    h = accrue(h, snap('2026-11-06T15:00:00Z', [it('e1', '2026-11-05')]), { lateHours: late });
    assert.equal(h.days['2026-11-05'].ok, true);
  });
  test('only days the store holds whole are counted; a day the window has left is closed', () => {
    let h = accrue(emptyHistory(), snap('2026-11-10T12:00:00Z', [it('a', '2026-11-03'), it('b', '2026-11-04'), it('c', '2026-11-10')]), { lateHours: late });
    assert.equal(h.days['2026-11-03'], undefined, 'begun before the window (from 3 Nov 12:00)');
    assert.equal(h.days['2026-11-04'].n, 1);
    assert.equal(h.days['2026-11-10'], undefined, 'not over yet');
    assert.deepEqual(Object.keys(h.open), ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'], 'every whole day, empty ones included');
    h = accrue(h, snap('2026-11-12T12:00:00Z', []), { lateHours: late });
    assert.ok(!('2026-11-04' in h.open) && !('2026-11-05' in h.open), 'closed: their keys are dropped');
    assert.equal(h.days['2026-11-04'].n, 1, 'their counts are kept');
  });
  test('the topics of a day are those in the list, with zero for none', () => {
    const h = accrue(emptyHistory(), snap('2026-11-10T01:00:00Z', [it('a', '2026-11-08', ['a'])], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { lateHours: late });
    assert.deepEqual(h.days['2026-11-08'].t, { a: 1, b: 0, c: 0 });
  });
});

describe('the rule as the page states it', () => {
  test('the lateness limits are the data check\'s: twice the refresh rhythm plus three hours', () => {
    const src = read('.github/scripts/freshness.mjs');
    const every = file => +new RegExp(`file: '${file.replace(/[./]/g, '\\$&')}'[^}]*every: (\\d+)`).exec(src)[1];
    assert.equal(LATE_HOURS.scientific, 2 * every('science/briefing/data/stories.json') + 3);
    assert.equal(LATE_HOURS.economics, 2 * every('econ/briefing/data/stories.json') + 3);
    assert.equal(LATE_HOURS.digital, 2 * every('digital/briefing/data/stories.json') + 3);
    assert.equal(LATE_HOURS.political, 2 * every('briefing/data/latest.json') + 3);
  });
  test('METHOD states the numbers the code uses, and stays modest about what the counts mean', () => {
    const text = METHOD.join(' ');
    for (const s of ['1.25 times', '0.8 times', 'at least 20', 'twice the square root', 'four most recent earlier weeks', 'twelve weeks', 'at least 50 stories', 'up to 52', 'at least 8 earlier weeks', '15 hours', '27 hours', 'half the weeks with an equal share', '75th percentile'])
      assert.ok(text.includes(s), `METHOD says "${s}"`);
    assert.match(text, /not how important or how true/);
    assert.match(text, /a change in the feeds can move a topic's share/);
    assert.match(text, /in the headline or its summary/);
  });
  test('firstDay: the first day four earlier weeks could be held, if every day from now on counts', () => {
    const h = made([[140, {}], [140, {}]]);
    // Weeks 0 and 1 are held. Three weeks on, they are weeks 3 and 4, and the two weeks after today weeks 1 and 2.
    assert.equal(firstDay(h, TODAY, 4, 12), addDays(TODAY, 21));
    assert.equal(utcDay(Date.parse(GENERATED)), TODAY);
    assert.equal(DAY, 864e5); assert.equal(HOUR, 36e5);
  });
});

// The Political Briefing's feed parser (briefing/scripts/rss.mjs): a Guardian standfirst ends with a stop instead of
// running into the article, and the links the Guardian puts after it (its live blog, related stories, the "Get our …
// email, free app or daily news podcast" line, a newsletter sign-up), in a list or in a paragraph of their own, are
// dropped. Highbrowse and the Daily Synopsis read the same stored summary, so the stop must also survive their own
// clean-up.
// The seven Guardian items are from theguardian.com/world/rss as fetched on 26 November 2026: the titles, addresses,
// dates and markup, the link lists, the sign-up paragraphs and their text are as the feed gave them. Each standfirst
// and article paragraph is cut to its first few words, with a closing stop added to the last paragraph, and the
// paragraphs between are left out. The last three tests use made-up text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, describe } from '../briefing/scripts/rss.mjs';
import { normalise } from '../highbrowse/analysis.js';
import { plainText } from '../daily-synopsis/lib/check.mjs';
import '../design/prp-access.js';

// The feed escapes each description's HTML (&lt;p&gt;…), as theguardian.com does; an & in an address is escaped twice.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const feed = items => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>World news | The Guardian</title>${
  items.map(([title, url, date, html]) => `<item><title>${title}</title><link>${url}</link><description>${esc(html)}</description><pubDate>${date}</pubDate></item>`).join('')}</channel></rss>`;
const G = 'https://www.theguardian.com';
const getOur = kind => `<li><p>Get our <a href="${G}/email-newsletters?CMP=cvau_sfl">${kind}</a>, <a href="https://app.adjust.com/w4u7jx3">free app</a> or <a href="${G}/australia-news/series/full-story?CMP=cvau_sfl">daily news podcast</a></p></li>`;
const BLYTH = `${G}/australia-news/2026/nov/26/liberal-senator-leah-blyth-defection-to-one-nation-ntwnfb`;
const AULIVE = `${G}/australia-news/live/2026/nov/26/labor-anthony-albanese-pauline-hanson-one-nation-angus-taylor-coalition-ntwnfb`;

const GUARDIAN = [
  // A live-blog link and the "Get our" line in one list; further on, a sign-up link in a paragraph of its own.
  ['‘Are they all turncoats?’: Barnaby Joyce says voters are turning to One Nation – and Liberals like Blyth can too', BLYTH, 'Thu, 26 Nov 2026 06:55:35 GMT',
    `<p>South Australian senator Leah Blyth labels One Nation</p><ul><li><p><a href="${AULIVE}">Follow our Australia politics live blog for latest updates</a></p></li>${getOur('daily political email')}</ul><p>Leah Blyth, federal Liberal senator for South Australia, has defected to One Nation.</p><p><strong><a href="${G}/australia-news/2026/aug/28/politics-really-newsletter-guardian-australia-free-best-daily-auspol-email-subscribe?CMP=copyembed">Sign up for Guardian Australia’s Politics, really newsletter here</a></strong></p>`],
  // The live page of the business desk alone.
  ['Norse Atlantic Airways suspends all flights as it makes urgent funding plea', `${G}/business/2026/nov/26/norse-atlantic-airways-suspends-all-flights-urgent-funding-plea`, 'Thu, 26 Nov 2026 10:15:18 GMT',
    `<p>Norwegian airline says its finances are ‘critical’</p><ul><li><p><a href="${G}/business/live/2026/nov/26/nvidia-chip-shipments-south-east-asia-stock-dentists-live-updates">Business live – latest updates</a></p></li></ul><p>Norse Atlantic Airways has suspended all flights.</p>`],
  // Two related stories and the "Get our" line.
  ['Coalition to privatise Melbourne sewage plants and sell state land and renewables if it wins election', `${G}/australia-news/2026/nov/26/liberal-nationals-victoria-election-policy-costings-revealed-sewage-land-energy`, 'Thu, 26 Nov 2026 08:07:24 GMT',
    `<p>Liberal and Nationals’ policy costings also reveal ‘air rights’</p><ul><li><p><a href="${G}/australia-news/2026/nov/25/victorian-election-2026-when-is-it-how-to-vote-date-where-victoria-state-polls-candidates-voting-near-count-ntwnfb">Victorian election 2026 guide: what you need to know</a></p></li><li><p><a href="${G}/australia-news/2026/nov/25/victoria-election-2026-who-to-vote-for-should-policies-summary-state-victorian-vic-labor-liberal-greens-one-nation-ntwnfb">Confused about who to vote for? Check the parties’ key promises and policies</a></p></li>${getOur('daily political email')}</ul><p>A Victorian Coalition government would privatise two sewage plants.</p>`],
  // Two live pages, then an empty paragraph: one stop, not two. A link inside a word ("post-Brexit") adds no space.
  ['Details of two treaties at heart of Andy Burnham’s EU reset to be published', `${G}/politics/2026/nov/26/treaties-andy-burnham-eu-reset-published`, 'Thu, 26 Nov 2026 09:16:19 GMT',
    `<p>Government also to publish bill that will enact EU deals</p><ul><li><p><a href="${G}/world/live/2026/nov/26/eu-budget-summit-ukraine-russia-spain-serbia-elections-latest-news-updates">Europe live – latest updates</a></p></li><li><p><a href="${G}/business/live/2026/nov/26/nvidia-chip-shipments-south-east-asia-stock-dentists-live-updates">Business live – latest updates</a></p></li></ul><p></p><p>Details of two treaties at the heart of Andy Burnham’s post-<a href="${G}/politics/eu-referendum">Brexit</a> reset plans will be published on Thursday.</p>`],
  // A live blog: no standfirst, the list first; links and bold inside the sentence add no space before its stop.
  ['Senior Liberal slams Blyth in email to members, saying ‘you gave her your trust, she threw it away’ – as it happened', AULIVE, 'Thu, 26 Nov 2026 06:36:53 GMT',
    `<ul>${getOur('breaking news email')}</ul><p><strong>Pauline Hanson</strong> has released a statement this morning <a href="${BLYTH}">welcoming South Australian senator </a><strong><a href="${BLYTH}">Leah Blyth</a></strong><a href="${BLYTH}"> to her party</a>.</p>`],
  // A standfirst that has its stop, and a sign-up link.
  ['Chris Van Hollen picks up more support for Senate majority leader role ahead of Democrats vote next week – as it happened', `${G}/us-news/live/2026/nov/25/donald-trump-jensen-huang-nvidia-pardon-senate-hearing-iowa-abdul-el-sayed-latest-news-updates`, 'Thu, 26 Nov 2026 02:20:52 GMT',
    `<p>This live blog s now closed.</p><ul><li><p><a href="${G}/news/2026/feb/17/sign-up-for-the-breaking-news-us-email-to-get-newsletter-alerts-direct-to-your-inbox?utm_medium=ACQUISITIONS_STANDFIRST&amp;utm_campaign=BN22326&amp;utm_content=signup&amp;utm_term=standfirst&amp;utm_source=GUARDIAN_WEB">Sign up for the Breaking News US email</a></p></li></ul><p>US trade representative <strong>Jamieson Greer</strong> claimed this morning.</p>`],
  // A sign-up after a bullet, in a paragraph of its own between the standfirst and the article.
  ['After 80 years in Oxford, Naga ancestors are finally going home', `${G}/world/2026/nov/23/this-is-india-pitt-rivers-museum-oxford-human-remains-repatriation`, 'Tue, 24 Nov 2026 07:30:10 GMT',
    `<p>A campaign securing the landmark return to India of ancestral remains taken during British colonial rule has opened a wider conversation about restitution</p><p><strong>• </strong><a href="${G}/world/2026/jul/30/sign-up-for-this-is-india-our-free-weekly-newsletter-on-life-in-the-subcontinent"><strong>Don’t get This is India delivered to your inbox? Sign up here</strong></a></p><p>The lacerating legacy of colonialism survives in many spaces.</p>`],
];
const WANT = [
  'South Australian senator Leah Blyth labels One Nation. Leah Blyth, federal Liberal senator for South Australia, has defected to One Nation.',
  'Norwegian airline says its finances are ‘critical’. Norse Atlantic Airways has suspended all flights.',
  'Liberal and Nationals’ policy costings also reveal ‘air rights’. A Victorian Coalition government would privatise two sewage plants.',
  'Government also to publish bill that will enact EU deals. Details of two treaties at the heart of Andy Burnham’s post-Brexit reset plans will be published on Thursday.',
  'Pauline Hanson has released a statement this morning welcoming South Australian senator Leah Blyth to her party.',
  'This live blog s now closed. US trade representative Jamieson Greer claimed this morning.',
  'A campaign securing the landmark return to India of ancestral remains taken during British colonial rule has opened a wider conversation about restitution. The lacerating legacy of colonialism survives in many spaces.',
];

test('feeds: a Guardian standfirst ends with a stop and its links go', () => {
  const items = parseFeed(feed(GUARDIAN));
  assert.deepEqual(items.map(i => i.summary), WANT);
  for (const i of items) assert.doesNotMatch(i.summary, /live blog for latest updates|latest updates|Get our|Sign up|newsletter|free app|•|\.\.| [.,]/, i.title);
  // Titles gain no stop, and the dates are the feed's.
  assert.deepEqual(items.map(i => i.title), GUARDIAN.map(g => g[0]));
  assert.equal(items[6].published, '2026-11-24T07:30:10.000Z');
});

test('feeds: the stop survives Highbrowse and the Daily Synopsis', () => {
  const items = parseFeed(feed(GUARDIAN));
  // As briefing/scripts/build.mjs stores them: d is the summary cut to 240 characters.
  const store = { generated: '2026-11-26T10:00:00.000Z', keepDays: 7, positions: [], sources: [{ id: 'guardian', name: 'The Guardian', position: 'left', country: 'UK' }],
    items: items.map(i => ({ s: 'guardian', t: i.title, u: i.url, p: i.published, d: i.summary.slice(0, 240) })) };
  const hb = normalise('political', store).items;
  const byUrl = new Map(hb.map(i => [i.u, i.d]));
  assert.deepEqual(items.map(i => byUrl.get(i.url)), WANT, 'Highbrowse');
  // The Daily Synopsis's input file: the Highbrowse item's summary made plain (daily-synopsis/lib/day.mjs makeInput).
  assert.deepEqual(items.map(i => plainText(byUrl.get(i.url)).slice(0, 240).trim()), WANT, 'Daily Synopsis');
});

test('feeds: a list with any item other than a link stays, and a stop is not doubled', () => {
  // Made-up text. A list of points is the article's own and stays.
  assert.equal(describe(esc('<p>Three things to know:</p><ul><li>Rates rise</li><li><a href="https://x.com/a">More</a></li></ul><p>The bank met today.</p>')),
    'Three things to know: Rates rise More The bank met today.');
  // A standfirst that ends with a question mark inside its quote mark, or a footnote after its stop, gains nothing.
  assert.equal(describe(esc('<p>Is it ‘over?’</p><p>Perhaps.</p>')), 'Is it ‘over?’ Perhaps.');
  assert.equal(describe(esc('<p>As she said.<sup>1</sup></p><p>Then.</p>')), 'As she said. 1 Then.');
  // A paragraph that ends in a link closes up to its last word.
  assert.equal(describe(esc('<p>See <a href="https://x.com/r">the report</a></p><p>It was long.</p>')), 'See the report. It was long.');
});

test('feeds: a paragraph of links goes only after a bullet or when it says "Sign up"', () => {
  // Made-up text. A related story after a bullet goes.
  assert.equal(describe(esc('<p>A standfirst</p><p>• <a href="https://x.com/r"><strong>A related story</strong></a></p><p>The article.</p>')), 'A standfirst. The article.');
  // A bullet before words of the article's own stays, and so does a lone link that is not a sign-up.
  assert.equal(describe(esc('<p>A standfirst</p><p><strong>• </strong>Warning: this article contains images of the dead</p><p>The article.</p>')),
    'A standfirst. • Warning: this article contains images of the dead. The article.');
  assert.equal(describe(esc('<p>A standfirst</p><p><a href="https://x.com/r">The full report</a></p><p>The article.</p>')), 'A standfirst. The full report. The article.');
  // A sentence of the article's own that links the words "sign up" stays whole.
  assert.equal(describe(esc('<p>Voters can <a href="https://x.com/v">sign up to vote</a> until <em>Friday</em>.</p>')), 'Voters can sign up to vote until Friday.');
  // A line break still parts words.
  assert.equal(describe(esc('<p>One<br>two</p>')), 'One two');
});

test('feeds: descriptions with no paragraphs read as before', () => {
  // Made-up text, plain and in CDATA, as most of the catalogue's other feeds send it.
  const items = parseFeed('<rss><channel><item><title>T</title><link>https://x.com/a</link><description>Senate passes the bill &amp; sends it on</description></item>'
    + '<item><title>U</title><link>https://x.com/b</link><description><![CDATA[The vote was close <b>but</b> it passed]]></description></item></channel></rss>');
  assert.deepEqual(items.map(i => i.summary), ['Senate passes the bill & sends it on', 'The vote was close but it passed']);
});

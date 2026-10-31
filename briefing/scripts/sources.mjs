// Briefing's publisher catalogue: an equal number of English-language news sources for each political position, so
// a balanced view can draw the same number of stories from each. Positions follow AllSides Media Bias Ratings where
// they rate the outlet and Media Bias/Fact Check otherwise; "far" means the outlet sits at the extreme of those scales.
// They describe editorial slant, not accuracy: `caution` marks outlets with poor fact-check records (MBFC "mixed" or
// "low" factual reporting), which the page flags.
// Each position lists its sources in priority order. Every refresh uses the first PER_POSITION that return fresh
// stories, so a feed that breaks is replaced by the next one and the positions stay equal.
export const POSITIONS = [
  { key: 'far_left', label: 'Far left' },
  { key: 'left', label: 'Left' },
  { key: 'centre', label: 'Centre' },
  { key: 'right', label: 'Right' },
  { key: 'far_right', label: 'Far right' },
];
export const PER_POSITION = 10;
// A refresh is written only if at least MIN_WORKING_SHARE of the catalogue returns fresh stories (an active publisher
// or a reserve) and every position has at least MIN_ACTIVE active publishers; otherwise the build exits 1 and leaves
// the store as it was. The data test holds the stored file to the same numbers. 75% is 48 of the 64 feeds: a normal
// run has 58–62 (four feeds are dead on most days). The far right has had no spare feed on some runs, so one more
// failure there must not stop the refresh, but losing three of its ten would.
export const MIN_WORKING_SHARE = 0.75, MIN_ACTIVE = PER_POSITION - 2;
// [id, name, position, country, feed, caution?]
// WND, One America News and Newsmax refuse automated readers of their own feeds (TLS failure, HTTP 403, timeouts from
// every runner), so their stories come through Google News's search for the site, as the Headline Tracker's outlets
// do; links go through Google News to the article. The Gateway Pundit's own feed fails the same way; its FeedBurner
// copy works.
const GNEWS = site => `https://news.google.com/rss/search?q=site%3A${site}%20when%3A2d&hl=en-US&gl=US&ceid=US:en`;
export const SOURCES = [
  // ---- Far left
  ['jacobin', 'Jacobin', 'far_left', 'US', 'https://jacobin.com/feed'],
  ['thenation', 'The Nation', 'far_left', 'US', 'https://www.thenation.com/feed/?post_type=article'],
  ['commondreams', 'Common Dreams', 'far_left', 'US', 'https://www.commondreams.org/feeds/feed.rss'],
  ['truthout', 'Truthout', 'far_left', 'US', 'https://truthout.org/feed/'],
  ['wsws', 'World Socialist Web Site', 'far_left', 'Intl', 'https://www.wsws.org/en/rss.xml'],
  ['novara', 'Novara Media', 'far_left', 'UK', 'https://novaramedia.com/feed/'],
  ['morningstar', 'Morning Star', 'far_left', 'UK', 'https://morningstaronline.co.uk/rss.xml'],
  ['mondoweiss', 'Mondoweiss', 'far_left', 'US', 'https://mondoweiss.net/feed/'],
  ['leftvoice', 'Left Voice', 'far_left', 'US', 'https://www.leftvoice.org/feed/'],
  ['counterfire', 'Counterfire', 'far_left', 'UK', 'https://www.counterfire.org/feed'],
  ['therealnews', 'The Real News Network', 'far_left', 'US', 'https://therealnews.com/feed'],
  ['truthdig', 'Truthdig', 'far_left', 'US', 'https://www.truthdig.com/feed/'],
  ['canary', 'The Canary', 'far_left', 'UK', 'https://www.thecanary.co/feed/', true],
  ['blackagendareport', 'Black Agenda Report', 'far_left', 'US', 'https://www.blackagendareport.com/rss.xml'],
  // ---- Left
  ['guardian', 'The Guardian', 'left', 'UK', 'https://www.theguardian.com/world/rss'],
  ['nyt', 'The New York Times', 'left', 'US', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
  ['motherjones', 'Mother Jones', 'left', 'US', 'https://www.motherjones.com/feed/'],
  ['intercept', 'The Intercept', 'left', 'US', 'https://theintercept.com/feed/?rss'],
  ['vox', 'Vox', 'left', 'US', 'https://www.vox.com/rss/index.xml'],
  ['democracynow', 'Democracy Now!', 'left', 'US', 'https://www.democracynow.org/democracynow.rss'],
  ['slate', 'Slate', 'left', 'US', 'https://slate.com/feeds/all.rss'],
  ['newrepublic', 'The New Republic', 'left', 'US', 'https://newrepublic.com/rss.xml'],
  ['independent', 'The Independent', 'left', 'UK', 'https://www.independent.co.uk/news/world/rss'],
  ['atlantic', 'The Atlantic', 'left', 'US', 'https://www.theatlantic.com/feed/all/'],
  ['salon', 'Salon', 'left', 'US', 'https://www.salon.com/feed/'],
  ['huffpost', 'HuffPost', 'left', 'US', 'https://chaski.huffpost.com/us/auto/vertical/world-news'],
  // ---- Centre
  ['bbc', 'BBC News', 'centre', 'UK', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['axios', 'Axios', 'centre', 'US', 'https://api.axios.com/feed/'],
  ['thehill', 'The Hill', 'centre', 'US', 'https://thehill.com/feed/'],
  ['dw', 'Deutsche Welle', 'centre', 'DE', 'https://rss.dw.com/rdf/rss-en-all'],
  ['france24', 'France 24', 'centre', 'FR', 'https://www.france24.com/en/rss'],
  ['euronews', 'Euronews', 'centre', 'EU', 'https://www.euronews.com/rss'],
  ['csmonitor', 'The Christian Science Monitor', 'centre', 'US', 'https://rss.csmonitor.com/feeds/all'],
  ['cnbc', 'CNBC', 'centre', 'US', 'https://www.cnbc.com/id/100727362/device/rss/rss.html'],
  ['skynews', 'Sky News', 'centre', 'UK', 'https://feeds.skynews.com/feeds/rss/world.xml'],
  ['upi', 'UPI', 'centre', 'US', 'https://rss.upi.com/news/top_news.rss'],
  ['realclear', 'RealClearPolitics', 'centre', 'US', 'https://www.realclearpolitics.com/index.xml'],
  ['bloomberg', 'Bloomberg Politics', 'centre', 'US', 'https://feeds.bloomberg.com/politics/news.rss'],
  // ---- Right
  ['foxnews', 'Fox News', 'right', 'US', 'https://moxie.foxnews.com/google-publisher/politics.xml'],
  ['nationalreview', 'National Review', 'right', 'US', 'https://www.nationalreview.com/feed/'],
  ['washingtonexaminer', 'Washington Examiner', 'right', 'US', 'https://www.washingtonexaminer.com/feed/'],
  ['nypost', 'New York Post', 'right', 'US', 'https://nypost.com/feed/'],
  ['washingtontimes', 'The Washington Times', 'right', 'US', 'https://www.washingtontimes.com/rss/headlines/news/'],
  ['telegraph', 'The Telegraph', 'right', 'UK', 'https://www.telegraph.co.uk/rss.xml'],
  ['reason', 'Reason', 'right', 'US', 'https://reason.com/feed/'],
  ['amconmag', 'The American Conservative', 'right', 'US', 'https://www.theamericanconservative.com/feed/'],
  ['freebeacon', 'Washington Free Beacon', 'right', 'US', 'https://freebeacon.com/feed/'],
  ['dailymail', 'Daily Mail', 'right', 'UK', 'https://www.dailymail.co.uk/news/index.rss', true],
  ['dailycaller', 'The Daily Caller', 'right', 'US', 'https://dailycaller.com/feed/'],
  ['dailywire', 'The Daily Wire', 'right', 'US', 'https://www.dailywire.com/feeds/rss.xml'],
  ['dailysignal', 'The Daily Signal', 'right', 'US', 'https://www.dailysignal.com/feed/'],
  ['gbnews', 'GB News', 'right', 'UK', 'https://www.gbnews.com/feeds/news.rss'],
  // ---- Far right
  ['breitbart', 'Breitbart', 'far_right', 'US', 'https://feeds.feedburner.com/breitbart', true],
  ['federalist', 'The Federalist', 'far_right', 'US', 'https://thefederalist.com/feed/'],
  ['wnd', 'WND', 'far_right', 'US', GNEWS('wnd.com'), true],
  ['gatewaypundit', 'The Gateway Pundit', 'far_right', 'US', 'https://feeds.feedburner.com/thegatewaypundit', true],
  ['oann', 'One America News', 'far_right', 'US', GNEWS('oann.com'), true],
  ['amgreatness', 'American Greatness', 'far_right', 'US', 'https://amgreatness.com/feed/'],
  ['nationalpulse', 'The National Pulse', 'far_right', 'US', 'https://thenationalpulse.com/feed/', true],
  ['zerohedge', 'ZeroHedge', 'far_right', 'US', 'https://feeds.feedburner.com/zerohedge/feed', true],
  ['remix', 'Remix News', 'far_right', 'EU', 'https://rmx.news/feed/', true],
  ['blaze', 'TheBlaze', 'far_right', 'US', 'https://www.theblaze.com/feeds/feed.rss'],
  ['pjmedia', 'PJ Media', 'far_right', 'US', 'https://pjmedia.com/feed', true],
  ['newsmax', 'Newsmax', 'far_right', 'US', GNEWS('newsmax.com'), true],
].map(([id, name, position, country, feed, caution]) => ({ id, name, position, country, feed, caution: !!caution }));

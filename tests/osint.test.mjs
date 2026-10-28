// OSINT Dashboard (Realtime Intelligence): the pure helpers behind every tab (search syntax per engine, archive and
// RDAP/DNS/certificate/GLEIF/OpenSanctions/GDELT parsing, the case notebook's import and export), the image-metadata
// reader, the guide renderer and its content files, and the page's static contract (tabs, hookup, tokens only).
//   node --test tests/osint.test.mjs
// The optional page test runs against a server: OSINT_URL=http://localhost:8787 node --test tests/osint.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as L from '../osint/lib.js';
import * as X from '../osint/exif.js';
import { renderMarkdown, inline, wrapText, flowSvg, stackSvg, lanesSvg, parseFigure, slugify, defaultLink } from '../osint/md.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const NOW = new Date('2026-10-28T12:00:00Z');

/* ---------------------------------------------------------------- tabs, hash, course links */
test('hash: tabs, aliases, q, s and w round-trip', () => {
  assert.deepEqual(L.parseHash('#tab=domains&q=example.org'), { tab: 'domains', q: 'example.org', s: '', w: '' });
  assert.equal(L.parseHash('#tab=sanctions').tab, 'orgs');
  assert.equal(L.parseHash('#tab=whois').tab, 'domains');
  assert.equal(L.parseHash('#view=exif').tab, 'media');
  assert.equal(L.parseHash('#tab=nonsense').tab, 'overview');
  assert.equal(L.parseHash('').tab, 'overview');
  assert.equal(L.parseHash('#tab=cookbook&s=ExifTool!').s, 'exiftool', 'section ids are cleaned');
  for (const st of [{ tab: 'search', q: 'fuel depot "drone"', s: '', w: '' }, { tab: 'kit', q: '', s: 'hashing-captured-files', w: '' }, { tab: 'events', q: '"Red Sea" shipping', s: '', w: '1m' }]) assert.deepEqual(L.parseHash(L.toHash(st)), st);
  assert.equal(L.parseHash('#tab=events&q=x&w=10y').w, '', 'only GDELT windows');
  assert.equal(L.toHash({ tab: 'events', q: 'x', w: 'nonsense' }), '#tab=events&q=x');
  assert.equal(L.TABS.length, 11);
  assert.deepEqual(L.TABS.map(t => t.id), ['overview', 'search', 'archives', 'domains', 'orgs', 'events', 'media', 'notebook', 'cookbook', 'kit', 'law']);
});

test('course: every lesson the dashboard links to exists in fe/learning/osint.md', () => {
  const titles = read('fe/learning/osint.md').split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3).trim());
  const slugs = new Set(titles.map(L.lessonSlug));
  for (const [k, title] of Object.entries(L.LESSONS)) assert.ok(slugs.has(L.lessonSlug(title)), `lesson ${k}: “${title}”`);
  assert.equal(L.lessonSlug('Search operators, languages and translation'), 'search-operators-languages-and-translation');
  assert.equal(L.lessonUrl('archives-and-preservation'), 'fe/learning.html?course=osint&lesson=archives-and-preservation');
  assert.equal(L.lessonUrl(''), 'fe/learning.html?course=osint');
});

/* ---------------------------------------------------------------- search launcher */
test('search: one spec in each engine’s syntax, with what each engine drops', () => {
  const spec = { all: 'fuel depot', phrase: 'drone strike', any: 'Kyiv Kharkiv', none: 'game', site: 'gov.ua reuters.com', filetype: 'pdf', intitle: 'attack', from: '2026-01-01', to: '2026-02-01' };
  const g = L.buildQuery(spec, 'google');
  assert.equal(g.q, 'fuel depot "drone strike" (Kyiv OR Kharkiv) -game intitle:attack (site:gov.ua OR site:reuters.com) filetype:pdf after:2026-01-01 before:2026-02-01');
  assert.deepEqual(g.dropped, []);
  const y = L.buildQuery(spec, 'yandex');
  assert.match(y.q, /\(Kyiv \| Kharkiv\)/); assert.match(y.q, /mime:pdf/); assert.match(y.q, /title:attack/);
  assert.ok(y.dropped.some(d => /dates/.test(d)));
  const p = L.buildQuery(spec, 'plain');
  assert.ok(!/site:|filetype:|-game/.test(p.q));
  assert.equal(L.buildQuery({ all: 'report', filetype: 'doc' }, 'google').q, 'report (filetype:doc OR filetype:docx)');
  assert.equal(L.buildQuery({ intitle: 'annual report' }, 'google').q, 'intitle:"annual report"');
  assert.equal(L.buildQuery({ all: 'a "b c" d' }, 'google').q, 'a "b c" d', 'quoted phrases stay whole');
  const s = L.normaliseSpec({ from: '2026-03-01', to: '2026-01-01', filetype: 'exe', site: 'https://www.gov.ie/en/ x' });
  assert.equal(s.from, '2026-01-01'); assert.equal(s.to, '2026-03-01'); assert.equal(s.filetype, ''); assert.equal(s.site, 'www.gov.ie x');
});

test('search: date ranges in the URL for Bing, DuckDuckGo and Scholar', () => {
  const s = L.normaliseSpec({ from: '2026-01-01', to: '2026-02-01' });
  assert.equal(L.dateParams('bing', s), '&filters=' + encodeURIComponent('ex1:"ez5_20454_20485"'), 'days since 1970-01-01');
  assert.equal(L.dateParams('ddg', s), '&df=' + encodeURIComponent('2026-01-01..2026-02-01'));
  assert.equal(L.dateParams('scholar', s), '&as_ylo=2026&as_yhi=2026');
  assert.equal(L.dateParams('ddg', L.normaliseSpec({ from: '2026-01-01' }), '2026-10-28'), '&df=' + encodeURIComponent('2026-01-01..2026-10-28'));
  assert.equal(L.dateParams('bing', L.normaliseSpec({})), '');
});

test('search: launchers are well formed and open nothing until there are words', () => {
  const empty = L.launchers({});
  assert.ok(empty.filter(l => !l.internal).every(l => l.href === '' || l.id === 'wayback-site'), 'external launchers wait for words');
  const ls = L.launchers({ all: 'fuel depot', site: 'gov.ie', from: '2026-01-01', to: '2026-03-01' }, '2026-10-28');
  assert.equal(new Set(ls.map(l => l.id)).size, ls.length, 'ids are unique');
  assert.ok(ls.length >= 40);
  const groups = new Set(L.SEARCH_GROUPS.map(g => g.id));
  for (const l of ls) {
    assert.ok(groups.has(l.group), l.id);
    if (l.internal) assert.match(l.href, /^#tab=(events|archives)/, l.id);
    else assert.match(l.href, /^https:\/\/[a-z0-9.-]+\//, l.id);
  }
  const by = id => ls.find(l => l.id === id);
  assert.match(by('google').href, /^https:\/\/www\.google\.com\/search\?q=fuel%20depot%20site%3Agov\.ie%20after%3A2026-01-01%20before%3A2026-03-01$/);
  assert.match(by('govuk-site').q, /site:gov\.uk/, 'government shortcuts override the site');
  assert.ok(by('govuk').dropped.includes('the site limit is ignored'));
  assert.equal(by('wayback-site').href, 'https://web.archive.org/web/*/gov.ie*');
  assert.equal(by('gdelt').href, '#tab=events&q=fuel+depot');
});

/* ---------------------------------------------------------------- archives */
test('archives: Wayback timestamps, availability replies and capture addresses', () => {
  assert.equal(L.waybackTimestamp('2026-10-27'), '20261027');
  assert.equal(L.waybackTimestamp(new Date('2026-10-27T20:52:34Z')), '20261027205234');
  assert.equal(L.parseWaybackTimestamp('20261027205234').toISOString(), '2026-10-27T20:52:34.000Z');
  assert.equal(L.parseWaybackTimestamp('2014').toISOString(), '2014-01-01T00:00:00.000Z');
  assert.equal(L.parseWaybackTimestamp('nope'), null);
  const cap = L.parseAvailability({ url: 'example.com', archived_snapshots: { closest: { status: '200', available: true, url: 'http://web.archive.org/web/20261027205234/https://example.com/', timestamp: '20261027205234' } } });
  assert.equal(cap.url, 'https://web.archive.org/web/20261027205234/https://example.com/', 'capture links use https');
  assert.equal(cap.status, '200');
  assert.equal(L.parseAvailability({ archived_snapshots: {} }), null);
  assert.equal(L.waybackAvailabilityUrl('https://a.org/x?y=1', '2006'), 'https://archive.org/wayback/available?url=https%3A%2F%2Fa.org%2Fx%3Fy%3D1&timestamp=2006');
  assert.equal(L.savePageNowUrl('https://a.org/'), 'https://web.archive.org/save/https://a.org/');
  assert.deepEqual(Object.keys(L.archiveTodayUrls('https://a.org/')), ['newest', 'list', 'save']);
  assert.deepEqual(L.yearSampleTimestamps(2023, 2026), ['20260701', '20250701', '20240701', '20230701']);
  const d = L.distinctCaptures([{ timestamp: '2025' }, { timestamp: '2024' }, { timestamp: '2025' }, null]);
  assert.deepEqual(d.map(c => c.timestamp), ['2024', '2025']);
});

test('archives: CDX output, JSON or text, with content changes marked', () => {
  const url = L.cdxUrl('https://example.com/', { limit: 50 });
  assert.match(url, /^https:\/\/web\.archive\.org\/cdx\/search\/cdx\?url=https:\/\/example\.com\/&output=json/);
  assert.match(url, /collapse=digest/);
  const json = JSON.stringify([['timestamp', 'original', 'statuscode', 'mimetype', 'digest', 'length'],
    ['20020120142510', 'http://example.com:80/', '200', 'text/html', 'AAA', '1792'], ['20020328012821', 'http://www.example.com:80/', '200', 'text/html', 'AAA', '481'], ['20030101000000', 'http://example.com/', '301', 'text/html', 'BBB', '-']]);
  const rows = L.markChanges(L.parseCdx(json));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.changed), [true, false, true]);
  assert.equal(rows[0].capture, 'https://web.archive.org/web/20020120142510/http://example.com:80/');
  assert.equal(rows[2].length, null);
  const text = 'com,example)/ 20020120142510 http://example.com:80/ text/html 200 HT2D 1792\ncom,example)/ 20020328012821 http://www.example.com:80/ text/html 200 UY3I 481';
  const t = L.parseCdx(text);
  assert.equal(t.length, 2); assert.equal(t[1].digest, 'UY3I'); assert.equal(t[0].status, '200');
  assert.throws(() => L.parseCdx('[["timestamp"'), /not valid CDX JSON/);
  assert.deepEqual(L.parseCdx(''), []);
});

/* ---------------------------------------------------------------- domains */
test('domains: host names, candidates, reverse-DNS names and RDAP addresses', () => {
  assert.equal(L.hostOf('https://www.Example.ORG/path?q=1'), 'www.example.org');
  assert.equal(L.hostOf('bbc.co.uk'), 'bbc.co.uk');
  assert.equal(L.hostOf('münchen.de'), 'xn--mnchen-3ya.de', 'IDNs become punycode');
  for (const bad of ['', 'localhost', '1.2.3.4', 'http://[::1]/', 'a..b', '-a.com', 'example.123']) assert.equal(L.hostOf(bad), '', bad);
  assert.deepEqual(L.domainCandidates('a.b.example.co.uk'), ['a.b.example.co.uk', 'b.example.co.uk', 'example.co.uk', 'co.uk']);
  assert.equal(L.ptrName('8.8.4.4'), '4.4.8.8.in-addr.arpa');
  assert.equal(L.ptrName('2001:db8::1'), '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
  assert.deepEqual(L.expandIPv6('2001:db8::1'), ['2001', '0db8', '0000', '0000', '0000', '0000', '0000', '0001']);
  assert.equal(L.rdapIpUrl('2a02:ec80:300:ed1a::1'), 'https://rdap.org/ip/2a02:ec80:300:ed1a::1', 'rdap.org rejects percent-encoded colons');
  assert.equal(L.rdapIpUrl('not an ip'), '');
  assert.equal(L.rdapDomainUrl('example.com'), 'https://rdap.org/domain/example.com');
  assert.equal(L.guessRegistered('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(L.guessRegistered('www.gov.ie'), 'gov.ie');
  assert.equal(L.ianaTldUrl('rte.ie'), 'https://www.iana.org/domains/root/db/ie.html');
});

test('domains: IANA’s RDAP bootstrap picks the registry or regional registry, over https only', () => {
  // Shapes as in https://data.iana.org/rdap/dns.json, ipv4.json and ipv6.json (RFC 9224).
  const dns = { version: '1.0', services: [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['uk'], ['https://rdap.nominet.uk/uk/']],
    [['example.uk'], ['https://rdap.example-sld.test/']], // a longer entry wins over "uk"
    [['kg'], ['http://rdap.cctld.kg/']],                   // http only: a page on https can't use it
    [['org'], ['http://rdap.publicinterestregistry.org/rdap/', 'https://rdap.publicinterestregistry.org/rdap']],
  ] };
  assert.deepEqual(L.rdapServiceForDomain(dns, 'www.example.com'), { base: 'https://rdap.verisign.com/com/v1/', httpOnly: false });
  assert.equal(L.rdapServiceForDomain(dns, 'bbc.co.uk').base, 'https://rdap.nominet.uk/uk/');
  assert.equal(L.rdapServiceForDomain(dns, 'shop.example.uk').base, 'https://rdap.example-sld.test/');
  assert.equal(L.rdapServiceForDomain(dns, 'wikipedia.org').base, 'https://rdap.publicinterestregistry.org/rdap/', 'https preferred, trailing slash added');
  assert.deepEqual(L.rdapServiceForDomain(dns, 'gov.kg'), { base: '', httpOnly: true });
  assert.deepEqual(L.rdapServiceForDomain(dns, 'rte.ie'), { base: '', httpOnly: false }, '.ie publishes no RDAP');
  assert.equal(L.rdapServiceForDomain(dns, 'com').base, '', 'a bare TLD is not a domain to look up');
  assert.equal(L.rdapServiceForDomain(null, 'example.com').base, '');
  assert.equal(L.rdapUrlAt('https://rdap.nominet.uk/uk/', 'domain', 'bbc.co.uk'), 'https://rdap.nominet.uk/uk/domain/bbc.co.uk');
  const v4 = { services: [
    [['41.0.0.0/8', '196.0.0.0/8'], ['https://rdap.afrinic.net/rdap/', 'http://rdap.afrinic.net/rdap/']],
    [['193.0.0.0/8', '2.0.0.0/8'], ['https://rdap.db.ripe.net/']],
    [['8.0.0.0/8', '208.0.0.0/8'], ['https://rdap.arin.net/registry/']],
    [['193.1.0.0/16'], ['https://rdap.longer-prefix.test/']],
  ] };
  assert.equal(L.rdapBaseForIp(v4, '208.80.154.224'), 'https://rdap.arin.net/registry/');
  assert.equal(L.rdapBaseForIp(v4, '196.216.2.1'), 'https://rdap.afrinic.net/rdap/');
  assert.equal(L.rdapBaseForIp(v4, '193.1.193.64'), 'https://rdap.longer-prefix.test/', 'longest prefix wins');
  assert.equal(L.rdapBaseForIp(v4, '193.2.0.1'), 'https://rdap.db.ripe.net/');
  assert.equal(L.rdapBaseForIp(v4, '9.9.9.9'), '');
  assert.equal(L.rdapBaseForIp({ services: [[['0.0.0.0/0'], ['https://all.test/']]] }, '1.2.3.4'), 'https://all.test/');
  assert.equal(L.rdapBaseForIp({ services: [[['255.255.255.255/32'], ['https://one.test/']]] }, '255.255.255.255'), 'https://one.test/');
  const v6 = { services: [
    [['2001:4200::/23', '2c00::/12'], ['https://rdap.afrinic.net/rdap/']],
    [['2600::/12', '2620::/23'], ['https://rdap.arin.net/registry/']],
    [['2a00::/12', '2001:600::/23'], ['https://rdap.db.ripe.net/']],
  ] };
  assert.equal(L.rdapBaseForIp(v6, '2620:0:861:ed1a::1'), 'https://rdap.arin.net/registry/');
  assert.equal(L.rdapBaseForIp(v6, '2a02:ec80:300:ed1a::1'), 'https://rdap.db.ripe.net/');
  assert.equal(L.rdapBaseForIp(v6, '2001:4201::1'), 'https://rdap.afrinic.net/rdap/', 'inside a /23');
  assert.equal(L.rdapBaseForIp(v6, '2001:4400::1'), '', 'just outside it');
  assert.equal(L.rdapBaseForIp(v6, 'nonsense'), '');
  assert.equal(L.rdapUrlAt('https://rdap.arin.net/registry/', 'ip', '2620:0:861:ed1a::1'), 'https://rdap.arin.net/registry/ip/2620:0:861:ed1a::1');
});

const vc = (props) => ['vcard', [['version', {}, 'text', '4.0'], ...props]];
test('domains: RDAP summaries name organisations, never individuals', () => {
  const d = L.summariseDomainRdap({
    ldhName: 'EXAMPLE.ORG', status: ['client transfer prohibited', 'server delete prohibited'], secureDNS: { delegationSigned: true },
    events: [{ eventAction: 'registration', eventDate: '2001-01-13T00:12:14Z' }, { eventAction: 'expiration', eventDate: '2027-01-13T00:12:14Z' }, { eventAction: 'last changed', eventDate: '2026-08-12T08:47:00Z' }, { eventAction: 'last update of RDAP database', eventDate: '2026-10-28T00:00:00Z' }],
    nameservers: [{ ldhName: 'NS0.EXAMPLE.ORG' }, { ldhName: 'ns1.example.org' }],
    entities: [
      { roles: ['registrar'], publicIds: [{ type: 'IANA Registrar ID', identifier: '292' }], vcardArray: vc([['fn', {}, 'text', 'MarkMonitor Inc.']]), links: [{ href: 'https://rdap.markmonitor.com/rdap/' }, { href: 'http://www.markmonitor.com' }],
        entities: [{ roles: ['abuse'], vcardArray: vc([['fn', {}, 'text', 'Abuse'], ['email', {}, 'text', 'abuse@markmonitor.com']]) }] },
      { roles: ['registrant'], vcardArray: vc([['fn', {}, 'text', 'REDACTED FOR PRIVACY'], ['org', {}, 'text', 'Example Foundation, Inc.'], ['adr', { cc: 'US' }, 'text', ['', '', '', '', 'CA', '', '']]]) },
      { roles: ['technical'], vcardArray: vc([['fn', {}, 'text', 'Jane Doe']]) },
    ],
    links: [{ rel: 'self', href: 'https://rdap.example/domain/example.org' }], redacted: [{ name: { type: 'Registrant Name' } }],
  });
  assert.equal(d.name, 'example.org');
  assert.equal(d.events.registration, '2001-01-13T00:12:14Z'); assert.equal(d.events.lastUpdate, '2026-10-28T00:00:00Z');
  assert.deepEqual(d.registrar, { name: 'MarkMonitor Inc.', ianaId: '292', url: 'http://www.markmonitor.com/' });
  assert.equal(d.abuse.email, 'abuse@markmonitor.com');
  assert.deepEqual(d.registrant, { org: 'Example Foundation, Inc.', country: 'US', region: 'CA' });
  assert.deepEqual(d.nameservers, ['ns0.example.org', 'ns1.example.org']);
  assert.equal(d.dnssec, true); assert.equal(d.locked, true); assert.equal(d.redacted, true);
  assert.ok(!JSON.stringify(d).includes('Jane Doe'), 'technical contacts are not read');
  const person = L.summariseDomainRdap({ entities: [{ roles: ['registrant'], vcardArray: vc([['fn', {}, 'text', 'John Smith'], ['kind', {}, 'text', 'individual']]) }] });
  assert.equal(person.registrant.org, '', 'an individual registrant is not shown');
  // An IP network as RIPE answers it: people as technical and admin contacts, the organisation nested under abuse.
  const ip = L.summariseIpRdap({
    name: 'Example-esams-infra', handle: '185.15.59.0 - 185.15.59.255', country: 'NL', startAddress: '185.15.59.0', endAddress: '185.15.59.255',
    entities: [
      { roles: ['technical'], vcardArray: vc([['fn', {}, 'text', 'Arzhel Person'], ['kind', {}, 'text', 'individual']]) },
      { roles: ['administrative', 'technical'], vcardArray: vc([['fn', {}, 'text', 'Mark Person'], ['kind', {}, 'text', 'individual']]) },
      { roles: ['registrant'], vcardArray: vc([['fn', {}, 'text', 'EXAMPLE-MNT'], ['kind', {}, 'text', 'individual']]) },
      { roles: ['abuse'], vcardArray: vc([['fn', {}, 'text', 'Abuse desk'], ['kind', {}, 'text', 'group'], ['email', {}, 'text', 'abuse@example.org']]),
        entities: [{ roles: ['registrant'], vcardArray: vc([['fn', {}, 'text', 'Example Foundation, Inc.'], ['kind', {}, 'text', 'org']]) }] },
    ],
  });
  assert.equal(ip.holder, 'Example Foundation, Inc.');
  assert.equal(ip.range, '185.15.59.0 – 185.15.59.255');
  assert.ok(!/Person/.test(JSON.stringify(ip)), 'people listed as contacts never appear');
  assert.equal(L.summariseIpRdap({ cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }], entities: [{ roles: ['registrant'], vcardArray: vc([['fn', {}, 'text', 'Google LLC'], ['kind', {}, 'text', 'org']]) }] }).range, '8.8.8.0/24');
});

test('domains: DNS-over-HTTPS replies and what records reveal', () => {
  const p = L.parseDoh({ Status: 0, AD: true, Answer: [
    { name: 'example.org.', type: 16, TTL: 300, data: '"v=spf1 include:_spf.google.com include:servers.mcsv.net " "-all"' },
    { name: 'example.org.', type: 257, TTL: 600, data: '0 issue "letsencrypt.org"' },
    { name: 'example.org.', type: 15, TTL: 300, data: '10 aspmx.l.google.com.' },
    { name: 'example.org.', type: 2, TTL: 86400, data: 'ns1.example.org.' }] });
  assert.equal(p.rcode, 'NOERROR'); assert.equal(p.ad, true);
  assert.deepEqual(p.answers.map(a => a.type), ['TXT', 'CAA', 'MX', 'NS']);
  assert.equal(p.answers[0].data, 'v=spf1 include:_spf.google.com include:servers.mcsv.net -all', 'split TXT strings are joined');
  assert.equal(p.answers[1].data, '0 issue "letsencrypt.org"', 'CAA keeps its quotes');
  assert.equal(p.answers[2].data, '10 aspmx.l.google.com'); assert.equal(p.answers[3].data, 'ns1.example.org');
  assert.equal(L.parseDoh({ Status: 3 }).rcode, 'NXDOMAIN');
  assert.equal(L.mxProvider('aspmx.l.google.com'), 'Google Workspace or Gmail');
  assert.equal(L.mxProvider('example-org.mail.protection.outlook.com'), 'Microsoft 365 (Exchange Online)');
  assert.equal(L.mxProvider('.'), 'No email (null MX)'); assert.equal(L.mxProvider('mx.example.org'), '');
  assert.equal(L.nsProvider('hera.ns.cloudflare.com'), 'Cloudflare');
  assert.equal(L.nsProvider('ns-123.awsdns-15.com'), 'Amazon Route 53');
  assert.equal(L.nsProvider('ns1.example.org', 'example.org'), 'Run by the organisation itself');
  const spf = L.txtMeaning(p.answers[0].data);
  assert.equal(spf.kind, 'spf'); assert.match(spf.detail, /Google Workspace, Mailchimp/); assert.match(spf.detail, /rejected/);
  assert.match(L.txtMeaning('v=DMARC1; p=reject; rua=mailto:x@example.org').detail, /reject/);
  assert.equal(L.txtMeaning('google-site-verification=abc').kind, 'verification');
  assert.equal(L.txtMeaning('MS=ms12345678').label, 'Microsoft 365 domain verification');
  assert.equal(L.txtMeaning('hello').kind, 'other');
  assert.equal(L.caaMeaning('0 issue "letsencrypt.org"'), 'Certificates may be issued by letsencrypt.org');
  assert.equal(L.caaMeaning('0 issuewild ";"'), 'Wildcard certificates may be issued by ;');
  assert.equal(L.hostProvider('d111111abcdef8.cloudfront.net'), 'Amazon CloudFront');
  assert.equal(L.hostProvider('text-lb.esams.example.org'), '');
});

test('domains: certificate transparency from crt.sh and Cert Spotter', () => {
  const rows = L.parseCrtSh([
    { id: 1, issuer_name: 'C=US, O=Let\'s Encrypt, CN=R11', name_value: 'example.org\n*.example.org', not_before: '2026-09-01T00:00:00', not_after: '2026-11-30T00:00:00' },
    { id: 2, issuer_name: 'C=US, O="DigiCert, Inc.", CN=DigiCert TLS', name_value: 'mail.example.org\nEXAMPLE.ORG\nother.net', not_before: '2025-01-01T00:00:00', not_after: '2026-01-01T00:00:00' }]);
  assert.equal(rows[0].issuer, 'Let\'s Encrypt'); assert.equal(rows[1].issuer, 'DigiCert, Inc.');
  assert.equal(rows[0].notBefore, '2026-09-01T00:00:00Z');
  assert.equal(rows[0].link, 'https://crt.sh/?id=1');
  const s = L.summariseCerts(rows, 'example.org');
  assert.equal(s.count, 2);
  assert.deepEqual(s.names.map(n => n.name).sort(), ['*.example.org', 'example.org', 'mail.example.org'], 'names outside the domain are dropped');
  assert.equal(s.names.find(n => n.name === 'example.org').certs, 2);
  assert.equal(s.first, '2025-01-01T00:00:00Z'); assert.equal(s.last, '2026-09-01T00:00:00Z');
  const cs = L.parseCertSpotter([{ id: '9', dns_names: ['www.example.org'], issuer: { friendly_name: 'Sectigo' }, not_before: '2026-05-01T00:00:00Z', not_after: '2027-05-01T00:00:00Z', cert_sha256: 'ab' }]);
  assert.equal(cs[0].issuer, 'Sectigo'); assert.deepEqual(cs[0].names, ['www.example.org']);
  assert.equal(L.crtShUrl('example.org'), 'https://crt.sh/?q=%25.example.org&output=json&deduplicate=Y');
  assert.match(L.certSpotterUrl('example.org'), /include_subdomains=true&expand=dns_names&expand=issuer$/);
});

/* ---------------------------------------------------------------- organisations */
const LEI_RECORD = {
  type: 'lei-records', id: '635400WKFIPCHCKVW376',
  attributes: {
    lei: '635400WKFIPCHCKVW376', ocid: 'ie/104547', bic: null,
    entity: { legalName: { name: 'Ryanair DAC' }, otherNames: [], legalAddress: { addressLines: ['Airside Business Park', 'Swords'], city: 'Dublin', region: 'IE-D', country: 'IE', postalCode: null },
      headquartersAddress: { addressLines: ['Airside Business Park', 'Swords'], city: 'Dublin', region: 'IE-D', country: 'IE' }, registeredAt: { id: 'RA000402' }, registeredAs: '104547',
      jurisdiction: 'IE', category: 'GENERAL', legalForm: { id: 'LGWG' }, status: 'ACTIVE', creationDate: '1984-11-28T00:00:00Z', successorEntity: { name: null } },
    registration: { status: 'ISSUED', lastUpdateDate: '2025-12-05T00:00:00Z', nextRenewalDate: '2027-01-29T00:00:00Z', corroborationLevel: 'FULLY_CORROBORATED' },
  },
  relationships: {
    'direct-parent': { links: { 'relationship-record': 'https://api.gleif.org/api/v1/lei-records/635400WKFIPCHCKVW376/direct-parent-relationship', 'lei-record': 'https://api.gleif.org/api/v1/lei-records/635400WKFIPCHCKVW376/direct-parent' } },
    'ultimate-parent': { links: { 'reporting-exception': 'https://api.gleif.org/api/v1/lei-records/635400WKFIPCHCKVW376/ultimate-parent-reporting-exception' } },
  },
};
test('organisations: LEIs, GLEIF records and which relationships exist', () => {
  assert.ok(L.isLei('635400WKFIPCHCKVW376')); assert.ok(L.isLei('635400br2roc1fvebq56'));
  assert.ok(!L.isLei('635400WKFIPCHCKVW377'), 'check digits'); assert.ok(!L.isLei('ryanair'));
  const x = L.summariseLei(LEI_RECORD);
  assert.equal(x.name, 'Ryanair DAC'); assert.equal(x.jurisdiction, 'IE'); assert.equal(x.categoryLabel, 'Legal entity');
  assert.equal(x.registry.name, 'Companies Registration Office (Ireland)');
  assert.equal(x.opencorporates, 'https://opencorporates.com/companies/ie/104547');
  assert.equal(x.legalAddress, 'Airside Business Park, Swords, Dublin, IE-D, IE');
  assert.equal(x.links.directParent, 'https://api.gleif.org/api/v1/lei-records/635400WKFIPCHCKVW376/direct-parent');
  assert.equal(x.links.directException, '');
  assert.equal(x.links.ultimateException, 'https://api.gleif.org/api/v1/lei-records/635400WKFIPCHCKVW376/ultimate-parent-reporting-exception');
  assert.equal(x.links.children, '', 'no children link: nothing to ask for');
  const uk = L.summariseLei({ attributes: { lei: 'X', entity: { registeredAt: { id: 'RA000585' }, registeredAs: '00445790' } } });
  assert.equal(uk.registry.url, 'https://find-and-update.company-information.service.gov.uk/company/00445790');
  const evil = L.summariseLei({ ...LEI_RECORD, relationships: { 'direct-parent': { links: { 'lei-record': 'https://evil.example/x' } } } });
  assert.equal(evil.links.directParent, '', 'only GLEIF API addresses are followed');
  const f = L.filterLeiResults({ meta: { pagination: { total: 3 } }, data: [LEI_RECORD, { attributes: { lei: 'S', entity: { legalName: { name: 'A Person' }, category: 'SOLE_PROPRIETOR' } } }] });
  assert.equal(f.shown.length, 1); assert.equal(f.hidden, 1, 'sole traders are individuals and are left out'); assert.equal(f.total, 3);
  assert.equal(L.gleifSearchUrl('ryan air', 25), 'https://api.gleif.org/api/v1/lei-records?filter%5Bfulltext%5D=ryan%20air&page%5Bsize%5D=25');
  assert.ok(L.EXCEPTION_REASONS.NATURAL_PERSONS);
});

test('organisations: OpenSanctions requests and replies; registry links', () => {
  assert.equal(L.osSearchUrl('Rosneft'), 'https://api.opensanctions.org/search/default?q=Rosneft&limit=15&schema=Organization');
  const withKey = new URL(L.osSearchUrl('Rosneft', { key: 'k123', schema: 'Vessel', limit: 5 }));
  assert.equal(withKey.origin, 'https://api.opensanctions.org', 'the key goes only to OpenSanctions');
  assert.equal(withKey.searchParams.get('api_key'), 'k123'); assert.equal(withKey.searchParams.get('schema'), 'Vessel');
  for (const bad of ['Bogus', 'LegalEntity', 'Person', '']) assert.equal(new URL(L.osSearchUrl('x', { schema: bad })).searchParams.get('schema'), 'Organization', `never an unfiltered or person search (${bad})`);
  assert.deepEqual(Object.keys(L.OS_SCHEMAS), ['Organization', 'Vessel', 'Airplane']);
  const s = L.summariseSanctions({ total: { value: 42, relation: 'gte' }, results: [{ id: 'NK-abc', caption: 'Rosneft', schema: 'Company', datasets: ['us_ofac_sdn', 'eu_fsf'], first_seen: '2014-07-17', last_seen: '2026-10-27', properties: { topics: ['sanction', 'gov.soe'], country: ['ru'], jurisdiction: ['ru'] } }] });
  assert.equal(s.total, 42); assert.equal(s.relation, 'gte'); assert.equal(s.hidden, 0);
  const p = L.summariseSanctions({ results: [{ id: 'a', caption: 'A Person', schema: 'Person' }, { id: 'b', caption: 'B Ltd', schema: 'Company' }] });
  assert.deepEqual(p.results.map(r => r.caption), ['B Ltd'], 'people are left out'); assert.equal(p.hidden, 1);
  assert.deepEqual(s.results[0].topics, ['Sanctioned', 'State-owned']); assert.deepEqual(s.results[0].countries, ['ru']);
  assert.equal(s.results[0].url, 'https://www.opensanctions.org/entities/NK-abc/');
  const links = L.orgLinks('Ryanair DAC');
  assert.equal(new Set(links.map(l => l.id)).size, links.length);
  for (const l of links) assert.match(l.href, /^https:\/\//, l.id);
  for (const id of ['opencorporates', 'companies-house', 'cro', 'aleph', 'eu-fsd', 'ofac', 'un-list', 'uk-sanctions', 'opensanctions-web']) assert.ok(links.some(l => l.id === id), id);
  assert.match(links.find(l => l.id === 'companies-house').href, /search\/companies\?q=Ryanair%20DAC$/);
});

/* ---------------------------------------------------------------- events (GDELT) */
test('events: GDELT queries, addresses and replies', () => {
  const b = L.buildGdeltQuery({ all: 'cable', phrase: 'Red Sea', any: 'attack strike', none: 'film', country: 'ireland', lang: 'english', domain: 'https://www.rte.ie/news' });
  assert.equal(b.query, 'cable "Red Sea" (attack OR strike) -film domainis:www.rte.ie sourcecountry:ireland sourcelang:english');
  assert.deepEqual(b.errors, []);
  assert.equal(L.buildGdeltQuery({ any: '"GPS jamming" "GNSS interference"' }).query, '("GPS jamming" OR "GNSS interference")');
  assert.match(L.buildGdeltQuery({ all: 'UN vote' }).errors[0], /too short/);
  assert.deepEqual(L.buildGdeltQuery({ phrase: 'UN vote' }).errors, [], 'short words inside a phrase are fine');
  assert.match(L.buildGdeltQuery({}).errors.join(), /at least one/);
  assert.equal(L.buildGdeltQuery({ all: 'cable', country: 'atlantis' }).query, 'cable', 'unknown filters are ignored');
  const u = L.gdeltUrl({ query: '"undersea cable" (cut OR damage)', mode: 'artlist', span: '2w', max: 999, sort: 'datedesc' });
  assert.ok(u.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?query=%22undersea%20cable%22%20%28cut%20OR%20damage%29&mode=artlist&format=json&timespan=2w'));
  assert.match(u, /maxrecords=250/); assert.match(u, /sort=datedesc/); assert.ok(!u.includes('+'), 'spaces are %20');
  assert.match(L.gdeltUrl({ query: 'x', mode: 'timelinevolraw', span: 'bogus' }), /timespan=1w$/);
  assert.equal(L.parseGdeltDate('20261027T121500Z').toISOString(), '2026-10-27T12:15:00.000Z');
  assert.equal(L.parseGdeltDate('20261027121500').toISOString(), '2026-10-27T12:15:00.000Z');
  assert.equal(L.parseGdeltText('Your search contained a keyword that was too short.').error, 'Your search contained a keyword that was too short.');
  assert.deepEqual(L.parseGdeltText(''), { ok: true, json: {} });
  const tl = L.gdeltTimeline(L.parseGdeltText('{"timeline":[{"series":"Article Count","data":[{"date":"20261021T010000Z","value":3,"norm":6000},{"date":"20261021T020000Z","value":0,"norm":0}]}]}').json);
  assert.equal(tl.length, 2); assert.equal(tl[0].share, 0.05); assert.equal(tl[1].share, 0);
  const arts = L.gdeltArticles({ articles: [{ url: 'https://www.rte.ie/a', title: ' A  title ', domain: 'RTE.ie', language: 'English', sourcecountry: 'Ireland', seendate: '20261027T121500Z' }, { url: 'javascript:alert(1)', title: 'bad' }] });
  assert.equal(arts.length, 1, 'unsafe links are dropped'); assert.equal(arts[0].title, 'A title'); assert.equal(arts[0].domain, 'rte.ie');
  assert.deepEqual(L.summariseArticles([...arts, ...arts]).domains, [{ name: 'rte.ie', n: 2 }]);
  assert.equal(L.nextSlot(10000, 12000, 6000), 16000); assert.equal(L.nextSlot(0, 12000), 12000);
});

test('events: the saved copy shown while GDELT is busy stays small and reads back the same', () => {
  const art = { url: 'https://www.rte.ie/a', title: 'A', domain: 'rte.ie', language: 'English', sourcecountry: 'Ireland', seendate: '20261027T121500Z', socialimage: 'https://x/y.jpg', extra: 'x'.repeat(500) };
  const c = L.compactGdelt({ articles: [art] });
  assert.deepEqual(Object.keys(c.articles[0]).sort(), ['domain', 'language', 'seendate', 'sourcecountry', 'title', 'url']);
  assert.deepEqual(L.gdeltArticles(c).map(a => a.title), ['A'], 'the page reads the compact copy');
  const tl = L.compactGdelt({ timeline: [{ series: 'Volume', data: [{ date: '20261027T000000Z', value: 5, norm: 1000, toparts: [1, 2, 3] }] }] });
  assert.deepEqual(tl, { timeline: [{ data: [{ date: '20261027T000000Z', value: 5, norm: 1000 }] }] });
  assert.equal(L.gdeltTimeline(tl)[0].share, 0.5);
  assert.deepEqual(L.compactGdelt('nonsense'), {});
  const all = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`u${i}`, { at: 1000 + i, json: { articles: [] } }]));
  assert.deepEqual(Object.keys(L.trimSaved(all, 6)), ['u8', 'u7', 'u6', 'u5', 'u4', 'u3'], 'newest six kept');
  const big = { a: { at: 2, json: { s: 'x'.repeat(400) } }, b: { at: 1, json: { s: 'y'.repeat(400) } } };
  assert.deepEqual(Object.keys(L.trimSaved(big, 6, 600)), ['a'], 'oldest dropped to fit the byte budget');
  assert.deepEqual(L.trimSaved({ bad: { at: 'x' }, worse: null }), {});
  assert.deepEqual(L.trimSaved(null), {});
});

test('charts and formats', () => {
  assert.deepEqual(L.niceScale(37), { max: 40, step: 10, ticks: [0, 10, 20, 30, 40] });
  assert.deepEqual(L.niceScale(0.83).ticks, [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(L.niceScale(0).max, 1);
  assert.equal(L.formatLatLon(53.34845, -6.25308), '53.34845° N, 6.25308° W');
  assert.equal(L.formatBytes(1536), '1.5 KB'); assert.equal(L.formatBytes(12), '12 bytes');
  const m = L.mapLinks(53.34845, -6.25308, '2026-10-27', '15:41');
  assert.equal(m.suncalc, 'https://www.suncalc.org/#/53.348450,-6.253080,17/2026.10.27/15:41/1/3');
  assert.match(m.osm, /mlat=53\.348450&mlon=-6\.253080/);
  const r = L.reverseImageLinks('https://upload.example.org/a b.jpg');
  assert.equal(r.find(x => x.id === 'google-lens').href, 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent('https://upload.example.org/a%20b.jpg'));
  assert.ok(r.find(x => x.id === 'bing').paste);
  assert.ok(L.reverseImageLinks('').every(x => !x.byUrl && /^https:\/\//.test(x.href)), 'without an address they open upload pages');
  assert.equal(L.reverseImageLinks('javascript:alert(1)')[0].href, 'https://lens.google.com/');
  assert.equal(L.dayLabel('2026-10-27'), '27 Oct 2026'); assert.equal(L.utcLabel('2026-10-27T15:42:00Z'), '27 Oct 2026, 15:42 UTC');
});

test('hashing: SHA-256 with Web Crypto', async () => {
  assert.equal(await L.sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await L.sha256Hex(new ArrayBuffer(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

/* ---------------------------------------------------------------- case notebook */
const sampleCase = () => L.normaliseCase({
  id: 'c_test1', title: 'Depot fire', log: [{ at: '2026-10-27T09:12:00Z', kind: 'search', text: 'Google: depot fire', url: 'https://www.google.com/search?q=depot' }],
  items: [
    { id: 'i_one', claim: 'A video shows a fire at the depot.', url: 'https://www.example.org/post/1', archive: 'https://web.archive.org/web/2026/https://www.example.org/post/1', accessed: '2026-10-27', eventDate: '2026-10-12', reliability: 'f', credibility: '2', notes: '# Not a heading\n- Source: not a field\nLine three', tags: 'video, day 1, video', hash: 'A'.repeat(64) },
    { id: 'i_two', claim: 'The governor says two drones struck it.', url: 'https://www.example.gov/s', accessed: '2026-10-26', eventDate: '2026-10-12', reliability: 'B', credibility: '3' },
    { id: 'i_three', claim: 'Same post, second claim.', url: 'https://www.example.org/post/1', accessed: '2026-10-27', reliability: 'F', credibility: '1' },
    { claim: '', url: '' },
    { claim: 'Bad links are dropped', url: 'javascript:alert(1)', archive: 'data:text/html,x', accessed: 'yesterday', reliability: 'Z', credibility: '9', hash: 'xyz' },
  ],
}, NOW);
test('notebook: items are checked and normalised', () => {
  const c = sampleCase();
  assert.equal(c.items.length, 4, 'empty items are dropped');
  const [a, , , bad] = c.items;
  assert.equal(a.reliability, 'F'); assert.deepEqual(a.tags, ['video', 'day 1']); assert.equal(a.hash, 'a'.repeat(64));
  assert.equal(bad.url, ''); assert.equal(bad.archive, ''); assert.equal(bad.accessed, '2026-10-28', 'invalid dates fall back to today');
  assert.equal(bad.reliability, ''); assert.equal(bad.credibility, ''); assert.equal(bad.hash, '');
  assert.equal(L.gradeCode('B', '2'), 'B2'); assert.equal(L.gradeCode('E', ''), 'E?'); assert.equal(L.gradeCode('', ''), '');
  assert.equal(L.gradeLabel('B', '2'), 'Usually reliable; probably true'); assert.equal(L.gradeLabel('', ''), 'Not graded');
  assert.deepEqual(L.caseStats(c), { items: 4, graded: 3, archived: 1, confirmed: 1, sources: 2 });
  const store = L.normaliseStore({ current: 'nope', cases: [] }, NOW);
  assert.equal(store.cases.length, 1); assert.equal(store.current, store.cases[0].id);
});

test('notebook: JSON and Markdown exports import back to the same case', () => {
  const c = sampleCase();
  const fromJson = L.importJson(L.exportJson(c, NOW), NOW)[0];
  assert.deepEqual(fromJson, c);
  assert.equal(L.importJson(L.exportJson({ cases: [c, c] }, NOW), NOW).length, 2, 'whole-notebook backups');
  assert.equal(L.importJson(JSON.stringify([{ claim: 'x' }]), NOW)[0].items.length, 1, 'a bare list of items');
  assert.throws(() => L.importJson('{nope'), /not valid JSON/);
  const md = L.exportMarkdown(c, NOW);
  assert.match(md, /^# Case: Depot fire/);
  assert.match(md, /- Grade: F2 \(Reliability cannot be judged; probably true\)/);
  assert.match(md, /## Sources table/); assert.match(md, /## Activity log/);
  assert.match(md, /^\\# Not a heading$/m, 'notes that look like structure are escaped');
  const back = L.importMarkdown(md, NOW)[0];
  assert.equal(back.title, c.title);
  assert.equal(back.items.length, c.items.length);
  for (const k of ['id', 'claim', 'url', 'archive', 'accessed', 'eventDate', 'reliability', 'credibility', 'notes', 'tags', 'hash']) assert.deepEqual(back.items.map(i => i[k]), c.items.map(i => i[k]), k);
  assert.deepEqual(back.log.map(l => [l.at, l.kind, l.text, l.url]), c.log.map(l => [l.at, l.kind, l.text, l.url]));
  assert.equal(L.importNotebook(md, NOW)[0].items.length, 4); assert.equal(L.importNotebook(L.exportJson(c, NOW), NOW)[0].id, 'c_test1');
  assert.throws(() => L.importMarkdown('just text'), /No “# Case:” heading/);
});

test('notebook: sources table and timeline for the write-up', () => {
  const c = sampleCase();
  const rows = L.sourcesTable(c);
  assert.deepEqual(rows.map(r => [r.n, r.domain, r.accessed]), [[1, 'example.gov', '2026-10-26'], [2, 'example.org', '2026-10-27'], [3, '', '2026-10-28']]);
  assert.equal(rows[1].claims.length, 2, 'one row per source address'); assert.ok(rows[1].archive);
  const md = L.sourcesMarkdown(c);
  assert.match(md, /^\| # \| Source \| Archived copy \| Accessed \| Grade \| Claim \|/);
  assert.match(md, /\| 2 \| \[example\.org\]\(https:\/\/www\.example\.org\/post\/1\) \| \[archive\]/);
  const groups = L.timelineGroups(c);
  assert.deepEqual(groups.map(g => [g.date, g.entries.length]), [['2026-10-12', 2], ['2026-10-27', 1], ['2026-10-28', 1]]);
  assert.equal(groups[1].entries[0].byEvent, false, 'items without an event date sit on the day accessed');
});

/* ---------------------------------------------------------------- image metadata */
const jfif = () => new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xDB, 0, 4, 0, 0, 0xFF, 0xC0, 0, 11, 8, 2, 0x80, 3, 0xC0, 1, 1, 0x11, 0, 0xFF, 0xDA, 0, 2, 0xFF, 0xD9]);
const concat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const ascii = s => new TextEncoder().encode(s);
const seg = (marker, payload) => concat(new Uint8Array([0xFF, marker, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255]), payload);
const withSegment = (jpeg, s) => concat(jpeg.subarray(0, 20), s, jpeg.subarray(20));

test('metadata: EXIF written and read back in both byte orders, with GPS', () => {
  for (const littleEndian of [false, true]) {
    const exif = X.writeExif({
      ifd0: [[0x010F, 2, 'Apple'], [0x0110, 2, 'iPhone 15 Pro'], [0x0131, 2, 'Adobe Photoshop 27.0'], [0x0132, 2, '2026:10:27 16:00:00']],
      exif: [[0x9003, 2, '2026:10:27 15:41:58'], [0x9011, 2, '+01:00'], [0x829A, 5, [1, 120]], [0x829D, 5, [18, 10]], [0x8827, 3, 64], [0xA431, 2, 'SN-123'], [0xA430, 2, 'Owner Name']],
      gps: [[0x0001, 2, 'S'], [0x0002, 5, X.toDms(33.856784)], [0x0003, 2, 'E'], [0x0004, 5, X.toDms(151.215297)], [0x0005, 1, 1], [0x0006, 5, [12, 1]], [0x0010, 2, 'M'], [0x0011, 5, [3600, 10]], [0x001F, 5, [250, 1]], [0x0007, 5, [[23, 1], [5, 1], [9, 1]]], [0x001D, 2, '2026:10:27']],
    }, { littleEndian });
    const m = X.readMetadata(X.insertExif(jfif(), exif));
    assert.equal(m.format, 'jpeg'); assert.equal(m.width, 960); assert.equal(m.height, 640);
    assert.equal(m.tiff.littleEndian, littleEndian);
    assert.equal(m.tiff.ifd0.Model, 'iPhone 15 Pro'); assert.equal(X.cameraName(m.tiff.ifd0), 'Apple iPhone 15 Pro');
    assert.ok(Math.abs(m.gps.lat + 33.856784) < 1e-5, 'southern latitudes are negative'); assert.ok(Math.abs(m.gps.lon - 151.215297) < 1e-5);
    assert.equal(m.gps.alt, -12, 'altitude reference 1 is below sea level');
    assert.equal(m.gps.direction, 0, '360° wraps to 0'); assert.equal(m.gps.directionRef, 'magnetic'); assert.equal(m.gps.accuracy, 250);
    assert.equal(m.gps.time, '2026-10-27T23:05:09Z');
    const rows = X.describe(m).flatMap(g => g.rows.map(r => [g.group, r.label, r.value]));
    assert.ok(rows.some(([g, l, v]) => g === 'Capture' && l === 'Taken' && v === '2026-10-27 15:41:58 (UTC+01:00)'));
    assert.ok(rows.some(([g, l]) => g === 'Location' && l === 'Position'));
    assert.ok(rows.some(([g, l, v]) => g === 'Details that can identify a person' && l === 'Camera serial' && v === 'SN-123'));
    const notes = X.assess(m).map(n => n.text).join(' ');
    assert.match(notes, /Processed with Adobe Photoshop/); assert.match(notes, /saved again/); assert.match(notes, /low accuracy/); assert.match(notes, /identify a person/);
  }
});

test('metadata: the sample image, no metadata, and what absence means', () => {
  const m = X.readMetadata(X.insertExif(jfif(), X.sampleExif()));
  assert.ok(Math.abs(m.gps.lat - 53.34742) < 1e-5 && Math.abs(m.gps.lon + 6.25335) < 1e-5, "George's Quay, Dublin");
  assert.equal(m.gps.direction, 355, 'facing north across the Liffey to the Custom House');
  const none = X.readMetadata(jfif());
  assert.equal(none.tiff, null); assert.deepEqual(X.describe(none), []);
  assert.match(X.assess(none)[0].text, /proves nothing/);
  const nullIsland = X.readMetadata(X.insertExif(jfif(), X.writeExif({ gps: [[0x0001, 2, 'N'], [0x0002, 5, X.toDms(0)], [0x0003, 2, 'E'], [0x0004, 5, X.toDms(0)]] })));
  assert.ok(nullIsland.gps.nullIsland); assert.match(X.assess(nullIsland).map(n => n.text).join(), /Null Island/);
  assert.deepEqual(X.exifDate('0000:00:00 00:00:00'), null);
  assert.equal(X.dmsToDecimal([[6, 1], [15, 1], [1109, 100]], 'W').toFixed(5), '-6.25308');
});

test('metadata: XMP history and AI labels, IPTC captions, C2PA markers, thumbnails', () => {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmp:CreatorTool="Adobe Firefly" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" photoshop:City="Cork">
    <dc:description><rdf:Alt><rdf:li xml:lang="x-default">Harbour &amp; quay</rdf:li></rdf:Alt></dc:description>
    <xmpMM:History><rdf:Seq><rdf:li stEvt:action="created" stEvt:when="2026-10-01T10:00:00Z" stEvt:softwareAgent="Adobe Firefly"/><rdf:li rdf:parseType="Resource"><stEvt:action>saved</stEvt:action><stEvt:softwareAgent>Adobe Photoshop</stEvt:softwareAgent></rdf:li></rdf:Seq></xmpMM:History>
    </rdf:Description></rdf:RDF></x:xmpmeta>`;
  const app1 = seg(0xE1, concat(ascii('http://ns.adobe.com/xap/1.0/\0'), ascii(xmp)));
  const iim = (ds, text) => { const v = ascii(text); return concat(new Uint8Array([0x1C, 2, ds, v.length >> 8, v.length & 255]), v); };
  const iptcData = concat(iim(105, 'Storm hits coast'), iim(120, 'Waves over the sea wall'), iim(25, 'storm'), iim(25, 'coast'), iim(110, 'Agency'));
  const app13 = seg(0xED, concat(ascii('Photoshop 3.0\0'), ascii('8BIM'), new Uint8Array([4, 4, 0, 0, 0, 0, iptcData.length >> 8, iptcData.length & 255]), iptcData, iptcData.length % 2 ? new Uint8Array([0]) : new Uint8Array()));
  const jumd = concat(ascii('jumd'), new Uint8Array(16), new Uint8Array([3]), ascii('c2pa\0'));
  const app11 = seg(0xEB, concat(ascii('JP'), new Uint8Array([0, 1, 0, 0, 0, 1]), new Uint8Array([0, 0, 0, 40]), ascii('jumb'), new Uint8Array([0, 0, 0, jumd.length + 4]), jumd));
  const m = X.readMetadata(withSegment(withSegment(withSegment(jfif(), app11), app13), app1));
  assert.equal(m.xmp.fields['xmp:CreatorTool'], 'Adobe Firefly');
  assert.equal(m.xmp.fields['dc:description'], 'Harbour & quay');
  assert.deepEqual(m.xmp.history.map(h => [h.action, h.software]), [['created', 'Adobe Firefly'], ['saved', 'Adobe Photoshop']]);
  assert.equal(X.sourceTypeKey(m.xmp.fields['Iptc4xmpExt:DigitalSourceType']), 'trainedAlgorithmicMedia');
  assert.deepEqual(m.iptc, { Headline: 'Storm hits coast', Caption: 'Waves over the sea wall', Keywords: 'storm; coast', Credit: 'Agency' });
  assert.ok(m.c2pa, 'C2PA manifest found in APP11');
  const notes = X.assess(m).map(n => n.text).join(' ');
  assert.match(notes, /Made by generative AI/); assert.match(notes, /Content Credentials/);
  assert.ok(X.describe(m).some(g => g.rows.some(r => r.label === 'Edit history' && /2 steps/.test(r.value))));
  // A thumbnail in IFD1 (pointing at a fake JPEG inside the block)
  const tiff = X.writeExif({ ifd0: [[0x010F, 2, 'Cam']] }).subarray(6);
  const thumb = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const t = new Uint8Array(tiff.length + 2 + 3 * 12 + 4 + thumb.length);
  t.set(tiff); const dv = new DataView(t.buffer), ifd1 = tiff.length;
  const n0 = dv.getUint16(8); dv.setUint32(8 + 2 + n0 * 12, ifd1); // IFD0's next-IFD pointer
  dv.setUint16(ifd1, 3);
  [[0x0103, 3, 1, 6 << 16], [0x0201, 4, 1, ifd1 + 2 + 36 + 4], [0x0202, 4, 1, thumb.length]].forEach(([tag, type, count, val], i) => { const e = ifd1 + 2 + i * 12; dv.setUint16(e, tag); dv.setUint16(e + 2, type); dv.setUint32(e + 4, count); dv.setUint32(e + 8, val); });
  t.set(thumb, ifd1 + 2 + 36 + 4);
  const withThumb = X.readMetadata(X.insertExif(jfif(), concat(ascii('Exif\0\0'), t)));
  assert.ok(withThumb.thumbnail && withThumb.thumbnail.length === 4);
  const u8 = X.insertExif(jfif(), concat(ascii('Exif\0\0'), t));
  assert.deepEqual([...u8.subarray(withThumb.thumbnail.offset, withThumb.thumbnail.offset + 4)], [...thumb], 'the thumbnail offset points into the file');
});

test('metadata: PNG text chunks, WebP, HEIC and format sniffing', () => {
  const chunk = (type, data) => { const d = typeof data === 'string' ? ascii(data) : data; const len = new Uint8Array([d.length >>> 24, (d.length >> 16) & 255, (d.length >> 8) & 255, d.length & 255]); return concat(len, ascii(type), d, new Uint8Array(4)); };
  const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 512); new DataView(ihdr.buffer).setUint32(4, 768);
  const png = concat(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr),
    chunk('tEXt', 'parameters\0a castle at dusk, Steps: 30, Sampler: Euler a, CFG scale: 7, Seed: 1'),
    chunk('iTXt', concat(ascii('XML:com.adobe.xmp\0\0\0\0\0'), ascii('<x:xmpmeta><rdf:Description xmp:CreatorTool="ComfyUI"/></x:xmpmeta>'))),
    chunk('eXIf', X.writeExif({ ifd0: [[0x0131, 2, 'ComfyUI']] }).subarray(6)), chunk('tIME', new Uint8Array([0x07, 0xEA, 10, 27, 15, 42, 10])), chunk('IEND', ''));
  const m = X.readMetadata(png);
  assert.equal(m.format, 'png'); assert.equal(m.width, 512); assert.equal(m.height, 768);
  assert.ok(m.pngText[0].ai); assert.equal(m.xmp.fields['xmp:CreatorTool'], 'ComfyUI'); assert.equal(m.tiff.ifd0.Software, 'ComfyUI');
  assert.equal(m.pngTime, '2026-10-27T15:42:10Z');
  assert.match(X.assess(m).map(n => n.text).join(), /image-generation settings/);
  const exifChunk = X.writeExif({ ifd0: [[0x0110, 2, 'Pixel 9']] });
  const webpChunk = (type, d) => concat(ascii(type), new Uint8Array([d.length & 255, (d.length >> 8) & 255, 0, 0]), d, d.length % 2 ? new Uint8Array([0]) : new Uint8Array());
  const vp8x = new Uint8Array(10); vp8x[4] = 99; vp8x[7] = 49; // 100 × 50
  const body = concat(ascii('WEBP'), webpChunk('VP8X', vp8x), webpChunk('EXIF', exifChunk));
  const webp = concat(ascii('RIFF'), new Uint8Array([body.length & 255, (body.length >> 8) & 255, 0, 0]), body);
  const w = X.readMetadata(webp);
  assert.equal(w.format, 'webp'); assert.equal(w.tiff.ifd0.Model, 'Pixel 9'); assert.equal(w.width, 100); assert.equal(w.height, 50);
  const heic = concat(new Uint8Array([0, 0, 0, 24]), ascii('ftypheic'), new Uint8Array(4), ascii('mif1heic'), new Uint8Array(64), new Uint8Array([0, 0, 0, 6]), exifChunk);
  const h = X.readMetadata(heic);
  assert.equal(h.format, 'heic'); assert.equal(h.tiff.ifd0.Model, 'Pixel 9');
  assert.equal(X.sniffFormat(ascii('GIF89a')), 'gif');
  assert.equal(X.sniffFormat(new Uint8Array([0x49, 0x49, 0x2A, 0])), 'tiff');
  assert.equal(X.sniffFormat(concat(new Uint8Array([0, 0, 0, 20]), ascii('ftypisom'))), 'video');
  assert.equal(X.sniffFormat(ascii('hello')), 'unknown');
  assert.doesNotThrow(() => X.readMetadata(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0, 200, 0x45])), 'truncated files do not throw');
  assert.doesNotThrow(() => X.readMetadata(new Uint8Array(0)));
});

/* ---------------------------------------------------------------- guides: renderer and content */
test('renderer: escaping, links, blocks and figures', () => {
  assert.equal(inline('<b>x</b> & **y**'), '&lt;b&gt;x&lt;/b&gt; &amp; <b>y</b>');
  assert.equal(inline('[x](javascript:alert(1))'), 'x)');
  assert.match(inline('[site](https://example.org/a?b=1&c=2)'), /href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"/);
  assert.match(inline('[`code` link](https://x.org)'), /<a [^>]+><code>code<\/code> link/);
  assert.equal(inline('snake_case_name and _it_'), 'snake_case_name and <i>it</i>');
  assert.match(inline('[[Ctrl+C]]'), /<kbd>Ctrl<\/kbd>\+<kbd>C<\/kbd>/);
  assert.equal(defaultLink('course:x'), null);
  const r = renderMarkdown('title: T\nintro: I\n\n## One\n### Two {#two}\n::: os windows\n1. a\n:::\n::: os linux\n- b\n:::\n- [ ] check\n- [x] done\n\n| A | B |\n|---|---|\n| <i> | 2 |\n\n::: facts\nCost: Free\n:::\n! Note: careful', { idPrefix: 'p-' });
  assert.deepEqual(r.meta, { title: 'T', intro: 'I' });
  assert.deepEqual(r.toc, [{ id: 'p-one', text: 'One', level: 2 }, { id: 'p-two', text: 'Two', level: 3 }]);
  assert.match(r.html, /id="p-os-1-0"/); assert.match(r.html, /data-os="linux"[^>]*hidden/);
  assert.match(r.html, /<ul class="tasks"><li><label><input type="checkbox"> <span>check/); assert.match(r.html, /type="checkbox" checked/);
  assert.match(r.html, /<td>&lt;i&gt;<\/td>/); assert.match(r.html, /<dl class="facts">/); assert.match(r.html, /class="callout"><b class="k">Note/);
  assert.deepEqual(wrapText('a b c d', 3), ['a b', 'c d']); assert.ok(wrapText('x'.repeat(20), 8).every(l => l.length <= 8));
  assert.equal(slugify('Obsidian or Joplin (notes)'), 'obsidian-or-joplin-notes');
  const fig = parseFigure(['caption: C', '- [accent] A | a', '- B']);
  assert.deepEqual(fig.steps, [{ title: 'A', sub: 'a', flag: 'accent' }, { title: 'B', sub: '', flag: '' }]);
  const eight = parseFigure(Array.from({ length: 8 }, (_, i) => `- Step ${i} | detail ${i}`));
  for (const narrow of [false, true]) {
    const svg = flowSvg(eight, { id: 't', narrow });
    assert.ok(!/NaN|undefined/.test(svg), 'no NaN in the two-row layout'); assert.equal((svg.match(/<rect/g) || []).length, 8);
  }
  assert.ok(!/NaN/.test(stackSvg(fig)) && !/NaN/.test(lanesSvg(parseFigure(['## L1 | x', '- a', '## L2', '- b | c']), { screens: true, arrows: true })));
});

test('guides: the content files render, and every link points somewhere real', () => {
  const lessons = new Set(read('fe/learning/osint.md').split('\n').filter(l => l.startsWith('## ')).map(l => L.lessonSlug(l.slice(3).trim())));
  const files = readdirSync(new URL('../osint/content/', import.meta.url)).filter(f => f.endsWith('.md'));
  assert.deepEqual(files.sort(), ['cookbook.md', 'kit.md', 'law.md']);
  const prefix = { cookbook: 'cb-', kit: 'kit-', law: 'law-' };
  const ids = {}, links = [];
  for (const f of files) {
    const name = f.replace('.md', ''), src = read('osint/content/' + f);
    const r = renderMarkdown(src, { idPrefix: prefix[name], figurePrefix: prefix[name] + 'fig', link: href => { links.push([name, href]); return defaultLink(href) || { href }; } });
    assert.ok(r.meta.title && r.meta.intro && r.meta.updated, `${f} front matter`);
    assert.ok(!/NaN|undefined/.test(r.html), `${f} renders cleanly`);
    assert.ok(r.toc.length >= 6, `${f} has sections`);
    ids[name] = new Set([...r.html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    assert.equal(ids[name].size, [...r.html.matchAll(/ id="([^"]+)"/g)].length, `${f}: ids are unique`);
  }
  for (const [file, href] of links) {
    let m;
    if ((m = href.match(/^#tab=([a-z]+)(?:&s=([a-z0-9-]+))?$/))) {
      assert.ok(L.TABS.some(t => t.id === m[1]), `${file}: ${href} names a tab`);
      if (m[2]) assert.ok(ids[m[1]]?.has(prefix[m[1]] + m[2]), `${file}: ${href} names a section`);
    } else if ((m = href.match(/^course:([a-z0-9-]*)$/))) assert.ok(!m[1] || lessons.has(m[1]), `${file}: ${href} is a lesson`);
    else if (href.startsWith('prp:')) assert.match(href, /^prp:(geoint|sigint|headlines|briefing|volatility)(#tab=[a-z]+)?$/, `${file}: ${href}`);
    else assert.match(href, /^https:\/\/[^\s]+$/, `${file}: ${href} is an https link`);
  }
  const cookbook = read('osint/content/cookbook.md');
  for (const tool of ['InVID', 'Wayback Machine extension', 'ExifTool', 'yt-dlp', 'Hunchly', 'Maltego', 'SpiderFoot', 'Google Earth Pro', 'QGIS', 'OpenRefine', 'Obsidian', 'Joplin', 'Zotero', 'Tor Browser', 'Trace Labs', 'Tsurugi']) assert.ok(cookbook.includes(tool), tool);
  for (const flow of ['Verify a viral video', 'Trace a company', 'Build a timeline of an event']) assert.ok(cookbook.includes(flow), flow);
  const kit = read('osint/content/kit.md');
  for (const topic of ['Separate browser profiles', 'Password manager', 'Full-disk encryption', 'Backups', 'Hashing captured files', 'Chain of custody', 'What a VPN does', 'Screen capture', 'Multiple monitors', 'Mobile considerations', 'API, notebook, export']) assert.ok(kit.includes(topic), topic);
  const law = read('osint/content/law.md');
  for (const topic of ['GDPR', 'lawful basis', 'Berkeley Protocol', 'Terms of service', 'pretexting', 'Minimising harm', 'When to stop and report']) assert.ok(law.includes(topic), topic);
});

/* ---------------------------------------------------------------- page contract */
test('page: hookup, tabs, tokens only, pinned libraries, no old brand names', () => {
  const html = read('osint/index.html');
  assert.match(html, /<html lang="en" data-suite="rt"/);
  assert.match(html, /<title>OSINT Dashboard · PRP<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/design\/prp\.css">/);
  assert.match(html, /<script src="\.\.\/design\/prp-bar\.js" data-suite="rt" data-module="osint" data-shell="\.\.\/" defer><\/script>/);
  assert.match(html, /class="prp-eyebrow">Realtime Intelligence <span class="sep">·<\/span> OSINT Dashboard/);
  assert.match(html, /class="prp-title">OSINT Dashboard</); assert.match(html, /class="prp-dek"/); assert.match(html, /class="prp-meta"/);
  for (const t of L.TABS) {
    assert.match(html, new RegExp(`<button type="button" role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" data-tab="${t.id}"`), t.id);
    assert.match(html, new RegExp(`id="panel-${t.id}"[^>]*role="tabpanel"`), t.id);
  }
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/JDP-I\b|\bH&amp;P\b|\bF&amp;E\b/.test(visible), 'old brand names');
  const css = read('osint/osint.css');
  assert.deepEqual(css.match(/#[0-9a-f]{3,8}\b/gi) || [], [], 'no raw colours in page CSS');
  // Guide callouts are "callout tip|warn|bad|legal": a bare rule for one of those names would restyle every callout
  // (a fixed-position ".tip" tooltip once pinned the cookbook's tip callout over the text).
  for (const name of ['tip', 'warn', 'bad', 'legal', 'note']) assert.ok(!new RegExp(`(^|[},])\\s*\\.${name}\\s*[{,]`, 'm').test(css), `.${name} is a callout modifier, not a component`);
  const media = read('osint/tab-media.js');
  assert.match(media, /leaflet@1\.9\.4\/dist\/leaflet\.js', jsSri: 'sha256-/);
  for (const f of readdirSync(new URL('../osint/', import.meta.url)).filter(f => /\.(js|html)$/.test(f))) {
    const src = read('osint/' + f);
    for (const m of src.matchAll(/https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm|cdnjs\.cloudflare\.com\/ajax\/libs)\/([^/'"\s]+)/g)) assert.match(m[1], /@\d+\.\d+\.\d+$|\/\d+\.\d+\.\d+$/, `${f}: ${m[1]} pins an exact version`);
  }
});

/* ---------------------------------------------------------------- the page in a browser (optional) */
const PAGE = process.env.OSINT_URL;
test('page: every tab opens without errors, and the notebook and media check work', { skip: !PAGE && 'set OSINT_URL (e.g. http://localhost:8787) to run' }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/api\.gdeltproject\.org/, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"timeline":[{"data":[{"date":"20261027T000000Z","value":5,"norm":1000},{"date":"20261028T000000Z","value":9,"norm":1100}]}],"articles":[{"url":"https://example.org/a","title":"A","domain":"example.org","seendate":"20261027T120000Z"}]}' }));
    await page.goto(PAGE.replace(/\/$/, '') + '/osint/index.html#tab=overview', { waitUntil: 'domcontentloaded' });
    for (const t of L.TABS) {
      await page.click(`#tab-${t.id}`);
      await page.waitForFunction(id => !document.getElementById('panel-' + id).hidden && document.getElementById('panel-' + id).textContent.trim().length > 50, t.id);
      assert.equal(new URL(page.url()).hash.startsWith('#tab=' + t.id), true, `hash follows ${t.id}`);
    }
    await page.waitForSelector('#ev-chart svg', { state: 'attached' }); // the Events tab drew its timeline (from the canned reply)
    await page.click('#tab-notebook');
    await page.fill('#nb-form [name=claim]', 'A test claim');
    await page.fill('#nb-form [name=url]', 'example.org/page');
    await page.selectOption('#nb-rel', 'B'); await page.selectOption('#nb-cred', '2');
    await page.click('#nb-save');
    await page.waitForSelector('.items .grade:text("B2")');
    await page.click('#tab-media');
    await page.click('#media-sample');
    await page.waitForSelector('#media-hash:not(:text("computing…"))');
    assert.match(await page.textContent('#media-out'), /53\.347419, -6\.253350/);
    await page.goto(PAGE.replace(/\/$/, '') + '/osint/index.html#tab=cookbook&s=exiftool', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cb-exiftool');
    assert.equal(await page.$eval('.md .callout.tip', el => getComputedStyle(el).position), 'static', 'tip callouts flow with the text');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page: Events shows the copy saved in this browser while GDELT is turning requests away', { skip: !PAGE && 'set OSINT_URL (e.g. http://localhost:8787) to run' }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const ok = r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: /timelinevol/i.test(r.request().url())
      ? '{"timeline":[{"data":[{"date":"20261027T000000Z","value":5,"norm":1000},{"date":"20261028T000000Z","value":9,"norm":1100}]}]}'
      : '{"articles":[{"url":"https://example.org/a","title":"A saved article","domain":"example.org","seendate":"20261027T120000Z"}]}' });
    await page.route(/api\.gdeltproject\.org/, ok);
    await page.goto(PAGE.replace(/\/$/, '') + '/osint/index.html#tab=events', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ev-articles .articles li', { timeout: 30000 }); // the first monitor ran, and its replies were saved
    await page.unroute(/api\.gdeltproject\.org/, ok);
    // GDELT's rate-limit reply carries no CORS header, so the browser sees a network error.
    await page.route(/api\.gdeltproject\.org/, r => r.fulfill({ status: 429, headers: { 'content-type': 'text/plain' }, body: 'Please limit requests to one every 5 seconds' }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /copy saved in this browser/.test(document.getElementById('ev-status')?.textContent || ''), null, { timeout: 45000 });
    assert.match(await page.textContent('#ev-articles'), /A saved article/);
    assert.ok(await page.$('#ev-chart svg'), 'the saved timeline is drawn');
  } finally { await browser.close(); }
});

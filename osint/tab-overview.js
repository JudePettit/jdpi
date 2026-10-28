// OSINT Dashboard · Overview: what each tool answers, with OSINT Training lessons, the services behind them, a live
// reachability check of the keyless ones, and the current case at a glance.
import { esc, LESSONS, lessonSlug, caseStats, TABS } from './lib.js';
import { $, courseLink, fetchData, num } from './ui.js';
import { figureHtml } from './md.js';

const TOOLS = [
  { tab: 'search', q: 'Who has written about this, where and when?', what: 'Builds one query in the syntax of more than forty engines and sources (web, news, government, academic, open data, video) and opens each in a new tab. Nothing is scraped.', access: ['Links out', ''], lessons: ['search'] },
  { tab: 'archives', q: 'What did this page say before, and is it preserved?', what: 'Checks the Wayback Machine for the oldest, newest and closest captures, samples one capture a year, lists every capture, saves pages, and hashes your own copies.', access: ['Keyless API', 'good'], lessons: ['archives'] },
  { tab: 'domains', q: 'Who runs this website, since when, and on what?', what: 'Registration dates, registrar and name servers from RDAP; DNS records over HTTPS; the networks hosting it; and the hostnames in its certificates.', access: ['Keyless APIs', 'good'], lessons: ['grading'] },
  { tab: 'orgs', q: 'Which legal entity is this, who owns it, and is it sanctioned?', what: 'Legal entity identifiers and corporate parents from GLEIF, sanctions screening with your OpenSanctions key, and links to registries and the official lists.', access: ['Keyless + your key', 'good'], lessons: ['companies', 'sanctions'] },
  { tab: 'events', q: 'When did coverage start and peak, and who reported it?', what: 'A GDELT query builder with preconfigured monitors, a coverage timeline and the matching articles from the last three months.', access: ['Keyless API', 'good'], lessons: ['events'] },
  { tab: 'media', q: 'Where and when was this image taken, and was it edited?', what: 'Reads EXIF, XMP, IPTC and Content Credentials on your device, maps any GPS position, and opens reverse image searches.', access: ['On your device', 'info'], lessons: ['images', 'geolocation', 'satellite'] },
  { tab: 'notebook', q: 'What do I know, from whom, and how sure am I?', what: 'Each claim with its source, archive link, dates and Admiralty grade, as a list, a timeline and a sources table, exported as JSON or Markdown.', access: ['On your device', 'info'], lessons: ['grading', 'writing'] },
  { tab: 'cookbook', q: 'Which tools should I install, and how?', what: 'Fifteen tools with their official sources, install steps for Windows, macOS and Linux, a first test, pitfalls and legal notes, and three workflows.', access: ['Guide', ''], lessons: ['archives', 'images'] },
  { tab: 'kit', q: 'How should I set up my computer, storage and phone?', what: 'Compartmented workstations, encryption, backups, hashing and chain of custody, VPNs, capture tools, screens and phones, with integration patterns.', access: ['Guide', ''], lessons: ['harm'] },
  { tab: 'law', q: 'Is this lawful and fair, and when must I stop?', what: 'The GDPR and a lawful basis, the Berkeley Protocol, terms of service, no deception, minimising harm, and when to stop and report.', access: ['Guide', ''], lessons: ['law', 'harm'] },
];

const SERVICES = [
  { id: 'wayback', name: 'Wayback Machine availability API', org: 'Internet Archive', tab: 'archives', access: 'Keyless', browser: 'Yes', limits: 'Closest capture to a date; fair use', check: { url: 'https://archive.org/wayback/available?url=example.com' } },
  { id: 'cdx', name: 'Wayback CDX API', org: 'Internet Archive', tab: 'archives', access: 'Keyless', browser: 'No: browsers block it (no CORS); opened in a tab for you to paste back', limits: 'Every capture of an address' },
  { id: 'spn', name: 'Save Page Now, archive.today', org: 'Internet Archive; anonymous operator', tab: 'archives', access: 'Links out', browser: 'You open them', limits: 'archive.today was deprecated by Wikipedia in 2026: secondary copies only' },
  { id: 'rdap', name: 'RDAP: registries and regional internet registries', org: 'Found through IANA’s bootstrap files; rdap.org as a fallback', tab: 'domains', access: 'Keyless', browser: 'Yes', limits: 'Many country domains (.ie, .de, .eu, .io) publish no RDAP: the page links to their WHOIS instead', check: { url: 'https://data.iana.org/rdap/ipv6.json' } },
  { id: 'gdns', name: 'Google Public DNS (JSON)', org: 'Google', tab: 'domains', access: 'Keyless', browser: 'Yes', limits: 'Google sees the names you look up', check: { url: 'https://dns.google/resolve?name=example.com&type=A' } },
  { id: 'cfdns', name: 'Cloudflare DNS (JSON)', org: 'Cloudflare', tab: 'domains', access: 'Keyless', browser: 'Yes', limits: 'Cloudflare sees the names you look up', check: { url: 'https://cloudflare-dns.com/dns-query?name=example.com&type=A', headers: { Accept: 'application/dns-json' } } },
  { id: 'crtsh', name: 'crt.sh', org: 'Sectigo', tab: 'domains', access: 'Keyless', browser: 'Yes, when it is not overloaded (often slow)', limits: 'Full certificate history' },
  { id: 'certspotter', name: 'Cert Spotter API', org: 'SSLMate', tab: 'domains', access: 'Keyless, limited', browser: 'Yes', limits: 'Current certificates only; a few lookups an hour' },
  { id: 'gleif', name: 'GLEIF API', org: 'Global Legal Entity Identifier Foundation', tab: 'orgs', access: 'Keyless', browser: 'Yes', limits: 'LEI data under CC0', check: { url: 'https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=1' } },
  { id: 'opensanctions', name: 'OpenSanctions API', org: 'OpenSanctions', tab: 'orgs', access: 'Your key (free for public-interest work)', browser: 'Yes, with the key in the request address', limits: 'Free keys for journalists, non-profits and academics; others get 2,000 trial credits, then pay per query. Data CC BY-NC 4.0' },
  { id: 'registries', name: 'Registries and sanctions lists', org: 'Companies House, CRO, OpenCorporates, Aleph, EU, OFAC, UK, UN', tab: 'orgs', access: 'Links out', browser: 'You open them', limits: 'Each site’s own terms' },
  { id: 'gdelt', name: 'GDELT DOC 2.0 API', org: 'The GDELT Project', tab: 'events', access: 'Keyless', browser: 'Yes; a busy server is reported as unreachable', limits: 'One request every five seconds; last three months' },
  { id: 'reverse', name: 'Reverse image search', org: 'Google Lens, Bing, Yandex, TinEye', tab: 'media', access: 'Links out', browser: 'You upload or paste', limits: 'Their terms; not for identifying people' },
  { id: 'local', name: 'Metadata reader and hashing', org: 'This page', tab: 'media', access: 'None needed', browser: 'On your device; nothing uploaded', limits: '' },
  { id: 'tiles', name: 'Map tiles', org: 'Esri', tab: 'media', access: 'Keyless', browser: 'Yes', limits: 'Esri terms; attribution on the map' },
];

const FIGURE = [
  'label: The intelligence cycle as it runs through this dashboard',
  'caption: How the tabs follow the intelligence cycle: a question directs collection, everything collected is preserved and checked, and the case notebook keeps the grades and the audit trail that the report is built from.',
  '- Ask a question | write down what would answer it',
  '- Collect | Search and Events tabs',
  '- Preserve | Archives tab; hash your files',
  '- Check | Domains, Organisations, Media check',
  '- [accent] Log and grade | Case notebook',
  '- Report | sources table; export',
];

let panelEl, ctxRef;
export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx;
  $('#ov-figure', panel).innerHTML = figureHtml('flow', FIGURE, { n: 1, id: 'ov-fig' });
  const tabName = id => TABS.find(t => t.id === id)?.name || id;
  $('#ov-tools', panel).innerHTML = TOOLS.map(t => {
    const learn = t.lessons.map(k => { const l = courseLink(lessonSlug(LESSONS[k])); return `<a href="${esc(l.href)}" target="${l.target}">${esc(LESSONS[k])}</a>`; }).join('');
    return `<article class="tool-card"><div class="top"><a href="#tab=${t.tab}">${esc(tabName(t.tab))}</a><span class="badge ${t.access[1]}">${esc(t.access[0])}</span></div>
      <p class="q">${esc(t.q)}</p><p class="what">${esc(t.what)}</p><div class="learn"><span>Course:</span>${learn}</div></article>`;
  }).join('');
  // data-label: on phones each row becomes a small card, with the column name before each value.
  $('#ov-services tbody', panel).innerHTML = SERVICES.map(s => `<tr data-svc="${s.id}"><td>${esc(s.name)}<span class="sub">${esc(s.org)}</span></td><td data-label="Used in"><a href="#tab=${s.tab}">${esc(tabName(s.tab))}</a></td><td data-label="Access">${esc(s.access)}</td><td class="browser" data-label="From your browser">${esc(s.browser)}</td><td data-label="Limits and terms">${esc(s.limits || '—')}</td></tr>`).join('');
  $('#ov-check', panel).addEventListener('click', checkServices);
  ctx.store.on(renderCase);
}

export function show() { renderCase(); }

function renderCase() {
  if (!panelEl) return;
  const c = ctxRef.store.current(), s = caseStats(c);
  $('#ov-case-title', panelEl).textContent = c.title;
  $('#ov-kpis', panelEl).innerHTML = [['Items', s.items], ['Graded', s.graded], ['Archived', s.archived], ['Sources', s.sources]]
    .map(([k, v]) => `<div class="prp-kpi"><span>${k}</span><b>${num(v)}</b></div>`).join('');
}

async function checkServices() {
  const btn = $('#ov-check', panelEl), status = $('#ov-check-status', panelEl);
  btn.disabled = true; status.className = 'status-line'; status.textContent = 'Checking…';
  const checks = SERVICES.filter(s => s.check);
  const results = await Promise.all(checks.map(async s => {
    const cell = $(`tr[data-svc="${s.id}"] .browser`, panelEl);
    cell.innerHTML = '<span class="badge">Checking</span>';
    const t0 = performance.now();
    const r = await fetchData(s.check.url, { timeout: 15000, headers: s.check.headers || {} });
    const ms = Math.round(performance.now() - t0);
    cell.innerHTML = r.ok ? `<span class="badge good">Reachable</span> <span class="small muted">${ms} ms</span>` : `<span class="badge bad">Not reachable</span> <span class="small muted">${esc(r.kind === 'http' ? 'HTTP ' + r.status : r.kind)}</span>`;
    return r.ok;
  }));
  const ok = results.filter(Boolean).length;
  status.className = 'status-line ' + (ok === results.length ? 'good' : 'bad');
  status.textContent = `${ok} of ${results.length} reachable from this browser · ${new Date().toISOString().slice(11, 16)} UTC`;
  btn.disabled = false;
}

// OSINT Dashboard · Domains: who registered a domain and when (RDAP, from the registry's own server as named in IANA's
// bootstrap files, with rdap.org as a fallback), its DNS records (DNS over HTTPS from Google or Cloudflare), the
// networks that host it (RDAP from the regional internet registries, reverse DNS), and the hostnames in its certificates
// (crt.sh, or Cert Spotter as a fallback). All keyless and CORS-enabled; every request goes from the browser straight to
// the service. Registrant details of individuals are never shown.
import {
  esc, hostOf, domainCandidates, rdapDomainUrl, rdapIpUrl, summariseDomainRdap, summariseIpRdap, RESOLVERS, parseDoh, mxProvider, nsProvider,
  txtMeaning, hostProvider, caaMeaning, guessRegistered, ptrName, crtShUrl, certSpotterUrl, parseCrtSh, parseCertSpotter, summariseCerts,
  icannLookupUrl, ianaTldUrl, dayLabel, yearsSince, isoDay, utcLabel, IANA_RDAP, rdapServiceForDomain, rdapBaseForIp, rdapUrlAt, isIPv4,
} from './lib.js';
import { $, fetchData, failText, settings, num, extLink } from './ui.js';

const EXAMPLES = ['wikipedia.org', 'gdeltproject.org', 'bbc.co.uk', 'rte.ie'];
// Registries with no RDAP service that offer a web lookup of their own (checked 28 October 2026).
const REGISTRY_LOOKUPS = {
  ie: ['the .ie registry’s WHOIS lookup', d => `https://www.weare.ie/whois-result/?whois=${encodeURIComponent(d)}`],
  de: ['DENIC’s domain query', () => 'https://www.denic.de/en/services/whois-service/'],
  be: ['DNS Belgium’s WHOIS', () => 'https://www.dnsbelgium.be/en/whois'],
  it: ['Registro .it’s web WHOIS', () => 'https://www.nic.it/en/find-your-it/web-whois'],
  ch: ['SWITCH’s domain lookup', () => 'https://www.nic.ch/whois/'],
};
let panelEl, ctxRef, run = 0, current = null;

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx;
  const form = $('#dom-form', panel);
  form.resolver.value = settings.get('resolver', 'google');
  form.resolver.addEventListener('change', () => settings.set('resolver', form.resolver.value));
  $('#dom-examples', panel).insertAdjacentHTML('beforeend', EXAMPLES.map(d => `<button type="button" class="prp-chip" data-d="${d}">${d}</button>`).join(''));
  $('#dom-examples', panel).addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { form.domain.value = b.dataset.d; lookup(); } });
  form.addEventListener('submit', e => { e.preventDefault(); lookup(); });
  if (ctx.state.q) { form.domain.value = ctx.state.q; lookup(); }
}
export function show(state) {
  if (state.q && hostOf(state.q) && hostOf(state.q) !== current?.host) { $('#dom-form', panelEl).domain.value = state.q; lookup(); }
}

const section = (id, title, source) => `<section class="prp-panel" id="${id}"><div class="prp-panel-head"><h2 class="prp-h2">${title}</h2><span class="prp-label">${source}</span></div><div class="body"><div class="loading">Looking up…</div></div></section>`;
const setBody = (id, html) => { const el = $(`#${id} .body`, panelEl); if (el) el.innerHTML = html; };
const kpis = {};
function setKpi(key, value, small = '') {
  kpis[key] = { value, small };
  const order = [['registered', 'Registered'], ['expires', 'Expires'], ['registrar', 'Registrar'], ['dns', 'DNS hosted by'], ['hosting', 'Website hosted by'], ['mail', 'Email handled by']];
  const box = $('#dom-kpis', panelEl);
  if (box) box.innerHTML = order.map(([k, label]) => `<div class="prp-kpi"><span>${label}</span><b>${esc(kpis[k]?.value ?? '…')}</b><small>${esc(kpis[k]?.small || '')}</small></div>`).join('');
}

async function lookup() {
  const form = $('#dom-form', panelEl), out = $('#dom-out', panelEl);
  const host = hostOf(form.domain.value);
  if (!host) { out.innerHTML = '<div class="prp-note bad">Enter a domain name such as <code>example.org</code>, or a web address.</div>'; return; }
  form.domain.value = host;
  const me = ++run, resolver = RESOLVERS[form.resolver.value] ? form.resolver.value : 'google';
  current = { host, resolver, rdap: null, domain: null };
  for (const k of Object.keys(kpis)) delete kpis[k];
  ctxRef.setParam({ q: host });
  ctxRef.log({ kind: 'lookup', text: `Domain lookup (RDAP, DNS, certificates): ${host}` });
  out.innerHTML = `<div class="prp-kpis dom-kpis" id="dom-kpis"></div>
    <div class="dom-grid">${section('dom-rdap', 'Registration', 'RDAP')}${section('dom-dns', 'DNS records', esc(RESOLVERS[resolver].name))}${section('dom-host', 'Hosting', 'RDAP for IP networks')}${section('dom-ct', 'Certificates', 'Certificate transparency')}</div>
    <section class="prp-panel"><div class="prp-panel-head"><h2 class="prp-h2">Look further</h2><span class="prp-label">Opens each site in a new tab</span></div><div class="prp-panel-body"><div class="link-grid">${furtherLinks(host)}</div></div></section>`;
  setKpi('registered', '…');
  const rdap = await rdapLookup(host, me);
  if (me !== run) return;
  const domain = rdap.domain && !rdap.unsupported && !rdap.notFound ? rdap.domain : guessRegistered(host);
  current.domain = domain;
  renderRdap(rdap, host, domain);
  await Promise.all([dns(host, domain, resolver, me), certs(domain, me)]);
}

/** IANA's bootstrap files, fetched once per visit (the browser caches them for a day); null if unreachable. */
const boot = {};
function bootstrap(kind) {
  return (boot[kind] ||= fetchData(IANA_RDAP[kind], { timeout: 15000 }).then(r => { if (!r.ok) delete boot[kind]; return r.ok ? r.json : null; }));
}

/**
 * The registration record: from the registry's own RDAP server (found in IANA's bootstrap), trying the host and then
 * each parent domain; rdap.org only when the bootstrap or the registry can't be reached.
 */
async function rdapLookup(host, me) {
  const dns = await bootstrap('dns');
  if (me !== run) return {};
  if (dns) {
    const svc = rdapServiceForDomain(dns, host);
    if (!svc.base) return { domain: guessRegistered(host), unsupported: true, httpOnly: svc.httpOnly };
    let failed = false;
    for (const cand of domainCandidates(host)) {
      if (me !== run) return {};
      const url = rdapUrlAt(svc.base, 'domain', cand);
      const r = await fetchData(url, { timeout: 20000 });
      if (r.ok) return { domain: cand, data: summariseDomainRdap(r.json), url, via: new URL(svc.base).hostname };
      if (r.kind === 'http' && (r.status === 404 || r.status === 400)) continue; // not registered at this level
      failed = true; // the registry could not be reached or failed: ask rdap.org instead
      break;
    }
    if (!failed) return { notFound: true };
  }
  for (const cand of domainCandidates(host)) {
    if (me !== run) return {};
    const r = await fetchData(rdapDomainUrl(cand), { timeout: 20000 });
    if (r.ok) return { domain: cand, data: summariseDomainRdap(r.json), url: rdapDomainUrl(cand), via: 'rdap.org' };
    if (r.kind === 'http' && r.status === 404) {
      if (/no rdap service/i.test(r.text)) return { domain: cand, unsupported: true };
      continue;
    }
    return { domain: cand, error: r };
  }
  return { notFound: true };
}

function renderRdap(rdap, host, domain) {
  const tld = domain.split('.').pop();
  if (rdap.unsupported) {
    setKpi('registered', 'No RDAP', `.${tld} does not publish it${rdap.httpOnly ? ' securely' : ''}`); setKpi('expires', '—'); setKpi('registrar', '—');
    const own = REGISTRY_LOOKUPS[tld];
    setBody('dom-rdap', `<div class="panel-msg">The registry for <b>.${esc(tld)}</b> ${rdap.httpOnly ? 'publishes RDAP only over an unencrypted connection, which browsers block on this page' : 'publishes no RDAP service'}, so registration details can’t be read from here. Look the domain up at the registry itself: ${own ? `${extLink(own[1](domain), own[0])}, or ` : ''}${extLink(ianaTldUrl(domain), `IANA’s entry for .${tld}`)}, which names the registry and its WHOIS service.</div>`);
    return;
  }
  if (rdap.notFound) {
    setKpi('registered', 'Not found'); setKpi('expires', '—'); setKpi('registrar', '—');
    setBody('dom-rdap', `<div class="panel-msg">No registration record found for ${esc(host)} or its parent domains. It may not be registered, or the registry may not answer RDAP queries for it. Try ${extLink(icannLookupUrl(domain), 'ICANN Lookup')}.</div>`);
    return;
  }
  if (rdap.error) {
    setKpi('registered', 'Unavailable');
    setBody('dom-rdap', `<div class="panel-msg bad">${esc(failText(rdap.error, 'The RDAP service'))} ${extLink(icannLookupUrl(domain), 'Try ICANN Lookup')}.</div>`);
    return;
  }
  const d = rdap.data;
  current.rdap = d;
  const lab = $('#dom-rdap .prp-label', panelEl);
  if (lab && rdap.via) lab.textContent = `RDAP · ${rdap.via}`;
  const age = yearsSince(d.events.registration);
  setKpi('registered', d.events.registration ? dayLabel(d.events.registration) : '—', age !== null ? `${age} year${age === 1 ? '' : 's'} ago` : '');
  setKpi('expires', d.events.expiration ? dayLabel(d.events.expiration) : '—', d.locked ? 'Transfer locked' : '');
  setKpi('registrar', d.registrar?.name || '—', d.registrar?.ianaId ? `IANA ID ${d.registrar.ianaId}` : '');
  const ns = d.nameservers.map(n => `<code class="ns">${esc(n)}</code>`).join('') || '—';
  setBody('dom-rdap', `<div class="prp-panel-body"><dl class="kv">
      <dt>Domain</dt><dd><b>${esc(d.name || domain)}</b>${d.unicodeName && d.unicodeName !== d.name ? ` <span class="sub">${esc(d.unicodeName)}</span>` : ''}${domain !== host ? `<span class="sub">The registered domain for ${esc(host)}</span>` : ''}</dd>
      <dt>Registered</dt><dd>${d.events.registration ? esc(utcLabel(d.events.registration)) : '—'}</dd>
      <dt>Expires</dt><dd>${d.events.expiration ? esc(utcLabel(d.events.expiration)) : '—'}</dd>
      <dt>Last changed</dt><dd>${d.events.lastChanged ? esc(utcLabel(d.events.lastChanged)) : '—'}${d.events.transfer ? `<span class="sub">Last transferred ${esc(dayLabel(d.events.transfer))}</span>` : ''}</dd>
      <dt>Registrar</dt><dd>${d.registrar ? (d.registrar.url ? extLink(d.registrar.url, d.registrar.name || d.registrar.url) : esc(d.registrar.name)) : '—'}${d.registrar?.ianaId ? `<span class="sub">IANA registrar ID ${esc(d.registrar.ianaId)}</span>` : ''}</dd>
      <dt>Registrant</dt><dd>${d.registrant?.org ? esc(d.registrant.org) : '<span class="muted">Not published</span>'}${d.registrant?.country ? `<span class="sub">Country: ${esc([d.registrant.region, d.registrant.country].filter(Boolean).join(', '))}</span>` : ''}<span class="sub">Only an organisation’s name is shown; individuals’ details are redacted under data-protection law.</span></dd>
      <dt>Name servers</dt><dd>${ns}</dd>
      <dt>DNSSEC</dt><dd>${d.dnssec === true ? '<span class="badge good">Signed</span>' : d.dnssec === false ? '<span class="badge">Not signed</span>' : '—'}</dd>
      <dt>Status</dt><dd>${d.status.map(s => `<span class="badge">${esc(s)}</span>`).join(' ') || '—'}</dd>
      ${d.abuse?.email ? `<dt>Registrar abuse contact</dt><dd>${esc(d.abuse.email)}</dd>` : ''}
    </dl></div>
    <div class="panel-foot">${extLink(rdap.url, 'Raw RDAP record')} · ${extLink(icannLookupUrl(domain), 'ICANN Lookup')} · <button type="button" class="prp-btn sm" id="dom-add">Add to the notebook</button></div>`);
  $('#dom-add', panelEl).onclick = () => {
    const parts = [`registered ${d.events.registration ? dayLabel(d.events.registration) : 'on an unknown date'}`, d.registrar?.name && `through ${d.registrar.name}`, d.nameservers.length && `name servers ${d.nameservers.join(', ')}`].filter(Boolean);
    ctxRef.addToNotebook({ claim: `${d.name || domain}: ${parts.join('; ')}`, url: rdap.url, accessed: isoDay(), notes: [kpis.hosting?.value && kpis.hosting.value !== '…' && `Hosting: ${kpis.hosting.value}.`, kpis.mail?.value && kpis.mail.value !== '…' && `Email: ${kpis.mail.value}.`, `Looked up in the OSINT Dashboard on ${utcLabel(new Date())}.`].filter(Boolean).join(' ') });
  };
}

async function dns(host, domain, resolverId, me) {
  const R = RESOLVERS[resolverId];
  const q = (name, type) => fetchData(R.url(name, type), { timeout: 15000, headers: R.headers }).then(r => ({ name, type, r }));
  const jobs = host === domain ? ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'SOA', 'CAA'].map(t => q(host, t))
    : [...['A', 'AAAA', 'CNAME'].map(t => q(host, t)), ...['NS', 'MX', 'TXT', 'SOA', 'CAA'].map(t => q(domain, t))];
  jobs.push(q('_dmarc.' + domain, 'TXT'));
  const results = await Promise.all(jobs);
  if (me !== run) return;
  const failed = results.filter(x => !x.r.ok);
  if (failed.length === results.length) { setBody('dom-dns', `<div class="panel-msg bad">${esc(failText(failed[0].r, R.name))}</div>`); setKpi('dns', '—'); setKpi('mail', '—'); setKpi('hosting', '—'); setBody('dom-host', '<div class="panel-msg">Needs DNS answers.</div>'); return; }
  const rows = [], seen = new Set();
  let validated = false, nx = false;
  for (const { type, r } of results) {
    if (!r.ok) continue;
    const p = parseDoh(r.json);
    if (p.ad) validated = true;
    if (p.rcode === 'NXDOMAIN' && type === 'A') nx = true;
    for (const a of p.answers) {
      const key = a.type + a.name + a.data;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(a);
    }
  }
  const order = ['A', 'AAAA', 'CNAME', 'NS', 'MX', 'TXT', 'SOA', 'CAA'];
  rows.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name) || a.data.localeCompare(b.data));
  const why = a => {
    if (a.type === 'MX') { const p = mxProvider(a.data.split(/\s+/).pop()); return p; }
    if (a.type === 'NS') return nsProvider(a.data, domain);
    if (a.type === 'CNAME') return hostProvider(a.data);
    if (a.type === 'CAA') return caaMeaning(a.data);
    if (a.type === 'TXT') { const m = txtMeaning(a.data); return [m.label, m.detail].filter(Boolean).join(': '); }
    return '';
  };
  // A well-known provider by name; otherwise the domain the servers sit under (often the organisation's own).
  const who = (list, known) => { const names = list.map(known).filter(Boolean); if (names.length) return [...new Set(names)]; return [...new Set(list.map(h => guessRegistered(h)))]; };
  const mxHosts = rows.filter(a => a.type === 'MX').map(a => a.data.split(/\s+/).pop()), nsHosts = rows.filter(a => a.type === 'NS').map(a => a.data);
  const mx = who(mxHosts, mxProvider), nsp = who(nsHosts, h => nsProvider(h, domain));
  setKpi('mail', mx[0] || 'No MX record', mx.length > 1 ? 'and ' + mx.slice(1).join(', ') : mxHosts.length && !mxProvider(mxHosts[0]) ? 'the domain of its mail servers' : '');
  setKpi('dns', nsp[0] || '—', nsp.length > 1 ? 'and ' + nsp.slice(1).join(', ') : nsHosts.length && !nsProvider(nsHosts[0], domain) ? 'the domain of its name servers' : '');
  setBody('dom-dns', nx ? `<div class="panel-msg">${esc(host)} does not exist in the DNS (NXDOMAIN).</div>` : `<div class="scroll"><table class="prp-table rr-table"><thead><tr><th scope="col">Type</th><th scope="col">Value</th><th scope="col" class="num">TTL</th></tr></thead><tbody>
    ${rows.map(a => { const w = why(a); return `<tr><td>${esc(a.type)}${a.name !== host ? `<span class="why">${esc(a.name)}</span>` : ''}</td><td class="mono">${esc(a.data)}${w ? `<span class="why">${esc(w)}</span>` : ''}</td><td class="num mono">${num(a.ttl)}</td></tr>`; }).join('') || '<tr><td colspan="3">No records returned.</td></tr>'}
    </tbody></table></div><div class="panel-foot">${validated ? '<span class="badge good">DNSSEC validated</span> ' : ''}${failed.length ? `${failed.length} of ${results.length} queries failed. ` : ''}TXT records often reveal the services an organisation uses: they are verification tokens it published itself.</div>`);
  const ips = [...new Set(rows.filter(a => a.type === 'A' && a.name === host).map(a => a.data))].slice(0, 2)
    .concat([...new Set(rows.filter(a => a.type === 'AAAA' && a.name === host).map(a => a.data))].slice(0, 2));
  await hosting(ips, resolverId, me);
}

async function hosting(ips, resolverId, me) {
  if (!ips.length) { setBody('dom-host', '<div class="panel-msg">No address (A or AAAA) records, so there is no web host to look up.</div>'); setKpi('hosting', '—'); return; }
  const R = RESOLVERS[resolverId];
  // The regional registry's own RDAP server from IANA's bootstrap; rdap.org if that can't be reached.
  const ipRdap = async ip => {
    const base = rdapBaseForIp(await bootstrap(isIPv4(ip) ? 'ipv4' : 'ipv6'), ip);
    const r = base ? await fetchData(rdapUrlAt(base, 'ip', ip), { timeout: 20000 }) : null;
    return r && (r.ok || (r.kind === 'http' && r.status === 404)) ? r : fetchData(rdapIpUrl(ip), { timeout: 20000 });
  };
  const rows = await Promise.all(ips.map(async ip => {
    const [net, ptr] = await Promise.all([ipRdap(ip), fetchData(R.url(ptrName(ip), 'PTR'), { timeout: 15000, headers: R.headers })]);
    const n = net.ok ? summariseIpRdap(net.json) : null;
    const names = ptr.ok ? parseDoh(ptr.json).answers.filter(a => a.type === 'PTR').map(a => a.data.replace(/\.$/, '')) : [];
    return { ip, n, names, err: net.ok ? '' : failText(net, 'RDAP') };
  }));
  if (me !== run) return;
  const holders = [...new Set(rows.map(r => r.n?.holder || hostProvider(r.names[0]) || r.n?.name).filter(Boolean))];
  setKpi('hosting', holders[0] || 'Unknown', holders.length > 1 ? `and ${holders.length - 1} more` : `${ips.length} address${ips.length === 1 ? '' : 'es'}`);
  setBody('dom-host', `<div class="scroll"><table class="prp-table"><thead><tr><th scope="col">Address</th><th scope="col">Network and holder</th><th scope="col">Reverse DNS</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="mono">${esc(r.ip)}</td><td>${r.n ? `<b>${esc(r.n.holder || r.n.name)}</b><span class="why">${esc([r.n.holder && r.n.name !== r.n.holder ? r.n.name : '', r.n.range, r.n.country].filter(Boolean).join(' · '))}</span>` : `<span class="muted">${esc(r.err)}</span>`}</td><td class="mono">${r.names.map(esc).join('<br>') || '—'}${r.names[0] && hostProvider(r.names[0]) ? `<span class="why">${esc(hostProvider(r.names[0]))}</span>` : ''}</td></tr>`).join('')}
    </tbody></table></div><div class="panel-foot">A content-delivery network (such as Cloudflare or Akamai) hides the origin server: the holder is then the network, not the organisation’s own host.</div>`);
}

async function certs(domain, me, source = 'crtsh') {
  setBody('dom-ct', `<div class="loading">${source === 'crtsh' ? 'Asking crt.sh (it can take 30 seconds)…' : 'Asking Cert Spotter…'}</div>`);
  const r = source === 'crtsh' ? await fetchData(crtShUrl(domain), { timeout: 45000 }) : await fetchData(certSpotterUrl(domain), { timeout: 20000 });
  if (me !== run) return;
  if (!r.ok) {
    setBody('dom-ct', `<div class="panel-msg${source === 'crtsh' ? '' : ' bad'}">${source === 'crtsh' ? 'crt.sh did not answer: it is often overloaded.' : esc(failText(r, 'Cert Spotter'))}</div>
      <div class="prp-panel-body btn-row">${source === 'crtsh' ? '<button type="button" class="prp-btn sm" data-ct="crtsh">Try crt.sh again</button><button type="button" class="prp-btn sm" data-ct="certspotter">Try Cert Spotter (current certificates only)</button>' : '<button type="button" class="prp-btn sm" data-ct="crtsh">Try crt.sh</button>'}${extLink(crtShUrl(domain, false), 'Open crt.sh', 'prp-btn sm ghost')}</div>`);
    $('#dom-ct .body', panelEl).onclick = e => { const b = e.target.closest('[data-ct]'); if (b) certs(domain, run, b.dataset.ct); };
    return;
  }
  const list = source === 'crtsh' ? parseCrtSh(r.json) : parseCertSpotter(r.json);
  const s = summariseCerts(list, domain);
  if (!s.count) { setBody('dom-ct', `<div class="panel-msg">No certificates found for subdomains of ${esc(domain)}. ${extLink(crtShUrl(domain, false), 'Check crt.sh')}</div>`); return; }
  const recent = [...list].sort((a, b) => (b.notBefore || '').localeCompare(a.notBefore || '')).slice(0, 8);
  setBody('dom-ct', `<div class="prp-panel-body">
      <p class="small">${num(s.count)} certificate${s.count === 1 ? '' : 's'} ${source === 'crtsh' ? 'logged since' : 'currently valid, the first from'} ${esc(dayLabel(s.first))}, the latest ${esc(dayLabel(s.last))}. Issuers: ${s.issuers.slice(0, 4).map(i => `${esc(i.name)} (${num(i.count)})`).join(', ')}.</p>
      <h3 class="prp-label" style="margin:10px 0 6px">${num(s.names.length)} hostnames, most recent first</h3>
      <div class="names-list">${s.names.slice(0, 300).map(n => `<span class="${n.wildcard ? 'wild' : ''}" title="${esc(`${n.certs} certificate${n.certs === 1 ? '' : 's'}, ${dayLabel(n.first)} to ${dayLabel(n.last)}`)}">${esc(n.name)}</span>`).join('')}</div>
      <details class="as-table"><summary>Latest certificates</summary><div class="scroll"><table class="prp-table"><thead><tr><th scope="col">Valid from</th><th scope="col">Until</th><th scope="col">Issuer</th><th scope="col">Names</th></tr></thead><tbody>
        ${recent.map(c => `<tr><td class="mono">${esc(dayLabel(c.notBefore))}</td><td class="mono">${esc(dayLabel(c.notAfter))}</td><td>${esc(c.issuer)}</td><td class="break">${c.link ? extLink(c.link, c.names.slice(0, 3).join(', ') + (c.names.length > 3 ? ` +${c.names.length - 3}` : '')) : esc(c.names.slice(0, 3).join(', '))}</td></tr>`).join('')}
      </tbody></table></div></details>
    </div><div class="panel-foot">From ${source === 'crtsh' ? extLink(crtShUrl(domain, false), 'crt.sh') : 'Cert Spotter (SSLMate), which lists only unexpired certificates'}. Certificates reveal hostnames an organisation set up, including test and internal systems: map them, don’t probe them.</div>`);
}

function furtherLinks(host) {
  const d = encodeURIComponent(host);
  return [
    ['Wayback Machine', `https://web.archive.org/web/*/${host}*`, 'Every captured page under the domain'],
    ['urlscan.io', `https://urlscan.io/search/#domain:${d}`, 'Public scans of the site: requests, scripts, screenshots'],
    ['VirusTotal', `https://www.virustotal.com/gui/domain/${d}`, 'Security vendors’ verdicts and passive DNS history'],
    ['BuiltWith', `https://builtwith.com/${d}`, 'The technologies the website uses'],
    ['DNSViz', `https://dnsviz.net/d/${d}/dnssec/`, 'A picture of its DNSSEC chain'],
    ['ICANN Lookup', icannLookupUrl(host), 'Registration data, as ICANN shows it'],
    ['IANA root database', ianaTldUrl(host), `Who runs .${host.split('.').pop()}, and its WHOIS server`],
    ['crt.sh', crtShUrl(host, false), 'Certificate transparency search'],
  ].map(([n, u, s]) => `<a class="lcard" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><b>${esc(n)}</b><span>${esc(s)}</span><span class="sr-only"> (opens in a new tab)</span></a>`).join('');
}

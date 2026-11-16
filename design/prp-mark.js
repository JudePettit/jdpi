/* Month by Month's marks on any page (design/prp-mark.js, styled by .prp-mark and .prp-strip in prp.css).
   Every mark is Vitruvian Manager's own calculation from UCDP's figures (monthly/scripts/rules.mjs), and wherever one
   is drawn it carries its explanation: what changed, with both figures; the period; the evidence, linked to the VM page
   that shows it; and the confidence, worked out by the stated rule, or why there is no mark. A compact chip (a war in a
   list) carries the words, the confidence and the figures, and its page's full mark is one click away.
   The words a reader sees are "More deaths recorded", "Fewer deaths recorded", "No large change by this rule" and "No
   mark"; the data's own values (worse, better, same, none) are never shown. One neutral hue: the sign carries the
   direction, the fill's depth the confidence.
   Classic script: window.PRPMark. A page loads it with data-shell (the site's root, as prp-bar.js has it):
     <script src="../design/prp-mark.js" data-shell="../"></script>
   PRPMark.load()            the marks (monthly/data/marks.json), fetched once
   PRPMark.full(mark, unit)  the mark with its explanation (HTML)
   PRPMark.chip(mark)        the compact form, for a list row (HTML, no links inside, so it may sit in a button)
   PRPMark.strip(strip)      the year strip of a unit (monthly/data/strips/…), with its table view (HTML)
   PRPMark.wire(root)        the strips' buttons (all years, table view), once per container
   PRPMark.name(x)           a war's or country's name with its Master Index link (data-qid or its Wikipedia link)
   Every string is data and is escaped here. */
(function () {
  const script = document.currentScript;
  const SHELL = new URL((script && script.dataset.shell) || '../', location.href).href;
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number), t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const spanName = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${MONTHS[+a.slice(5, 7) - 1]}–${monthName(b)}` : `${monthName(a)}–${monthName(b)}`);
  const spanWords = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${MONTHS[+a.slice(5, 7) - 1]} to ${monthName(b)}` : `${monthName(a)} to ${monthName(b)}`);
  const fmt = n => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '–');
  const longDay = d => (/^\d{4}-\d{2}-\d{2}/.test(String(d)) ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : esc(d));
  const SIGN = { worse: '+', better: '−', same: '=', none: '' };
  const STEP_WORDS = ['none of the rule\'s five checks applies', 'one of the rule\'s five checks applies', 'two of the rule\'s five checks apply'];

  /** A link into VM: the shell's deep link inside the shell, the page itself on its own. */
  function go(page) {
    if (!page || !page.url) return null;
    const abs = new URL(page.url, SHELL).href;
    return embedded && page.suite && page.module ? { href: `${SHELL}#/${page.suite}/${page.module}?at=${encodeURIComponent(abs)}`, target: '_top' } : { href: abs, target: '_self' };
  }
  const a = (page, text, cls = '') => { const g = go(page); return g ? `<a${cls ? ` class="${cls}"` : ''} href="${esc(g.href)}" target="${g.target}">${text}</a>` : text; };
  const HOW = { suite: 'rt', module: 'monthly', url: 'q/monthly.html#tab=how', label: 'How this is worked out' };
  const JSON_PAGE = { url: 'monthly/data/marks.json' };

  /** A name with its Master Index link: data-qid when VM holds the Wikidata ID, else its Wikipedia link. */
  function name(x, { strong = false } = {}) {
    if (!x) return '';
    const t = esc(x.name), inner = strong ? `<b>${t}</b>` : t;
    if (x.qid && /^Q\d+$/.test(x.qid)) return `<span data-qid="${esc(x.qid)}">${inner}</span>`;
    if (x.wiki) return `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(String(x.wiki).replace(/ /g, '_'))}" target="_blank" rel="noreferrer">${inner}</a>`;
    return inner;
  }

  let marksP = null;
  function load() { return (marksP ||= fetch(new URL('monthly/data/marks.json', SHELL).href, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null)); }
  const unitOf = (marks, id) => (marks?.units || []).find(u => u.id === id) || null;

  const confWords = m => (m.confidence ? `${m.confidence} confidence` : '');
  /** The one sentence a screen reader gets first. */
  function sentence(m) {
    const per = m.period, f = m.figures;
    const head = `${monthName(m.month)}: ${m.words.toLowerCase()}${m.confidence ? `, ${m.confidence} confidence` : ''} (Vitruvian Manager's calculation${m.provisional ? ', from provisional figures' : ''}).`;
    if (m.strand === 'volatility') return `${head} ${m.what}`;
    if (f && f.median != null) return `${head} ${fmt(f.deaths)} deaths against a median of ${fmt(f.median)} a month, ${spanWords(per.baseline[0], per.baseline[2])}.${m.reason ? ' ' + m.reason : ''}${m.why ? ' ' + m.why.text : ''}`;
    return `${head}${m.why ? ' ' + m.why.text : ''}`;
  }
  const box = m => `<span class="prp-mark-box" aria-hidden="true">${SIGN[m.direction] || ''}</span>`;

  /** The compact form: the square, the words, the confidence and the figures, each named, and that it is VM's own
      calculation, all in its visible text (the title repeats the sentence for a pointer). No links inside. */
  function chip(m) {
    if (!m) return '';
    const f = m.figures, per = m.period;
    const figs = f && f.median != null ? `${MONTHS[+m.month.slice(5, 7) - 1]}: ${fmt(f.deaths)} deaths against a median of ${fmt(f.median)}, ${spanName(per.baseline[0], per.baseline[2])}` : '';
    return `<span class="prp-mark sm" data-dir="${esc(m.direction)}" data-conf="${esc(m.confidence || '')}" title="${esc(sentence(m))}">${box(m)}<span class="prp-mark-words">${esc(m.words)}</span>${m.confidence ? `<span class="prp-mark-conf">· ${esc(m.confidence)} confidence</span>` : ''}<span class="prp-mark-figs">${figs ? esc(figs) + ' · ' : ''}VM's calculation${m.provisional ? ', provisional figures' : ''}</span></span>`;
  }

  /** The mark with its whole explanation. unit: its unit in marks.json (for what it counts and its names). */
  function full(m, unit = null, { heading = '' } = {}) {
    if (!m) return '';
    const per = m.period, base = `${spanName(per.baseline[0], per.baseline[2])}`;
    const notes = (m.notes || []).map(n => `<span class="prp-mark-note">${esc(n)}</span>`).join(' ');
    const evidence = (m.evidence || []).map(e => `${esc(e.dataset)}, version ${esc(e.version)}, built ${longDay(e.released)}: ${esc(e.counts)}. ${a(e.page, esc(e.page?.label || 'The figures'))}`).join('<br>');
    const steps = (m.steps || []).length ? `<ul>${m.steps.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul>` : '';
    const conf = m.direction === 'none'
      ? `<div><dt>Why no mark</dt><dd>${esc(m.why?.text || '')}${steps ? `<span class="prp-mark-note">The rule's checks:</span>${steps}` : ''}</dd></div>`
      : `<div><dt>Confidence</dt><dd>${esc(m.confidence[0].toUpperCase() + m.confidence.slice(1))}: ${STEP_WORDS[(m.steps || []).length]}.${steps}</dd></div>`;
    const ctx = (m.context || []).length ? `<div><dt>Beside it</dt><dd>${m.context.map(c => `${a({ suite: 'rt', module: 'calendar', url: `q/calendar.html?period=contemporary&event=${encodeURIComponent(c.key)}` }, esc(c.title))} <span class="prp-mark-note">${longDay(c.date)}${c.country ? ` · ${name(c.country)}` : ''}</span>`).join('<br>')}<span class="prp-mark-note">Dated events from VM's calendars, shown beside the month; they never change its mark.</span></dd></div>` : '';
    const what = m.strand === 'volatility' ? 'news-based volatility (GDELT)' : unit?.counts ? `UCDP's figures, ${unit.counts}` : 'UCDP\'s figures';
    return `<section class="prp-mark" data-dir="${esc(m.direction)}" data-conf="${esc(m.confidence || '')}" aria-label="${esc(sentence(m))}">
      ${heading ? `<h3 class="prp-mark-title">${esc(heading)}</h3>` : ''}
      <p class="prp-mark-line">${box(m)}<b class="prp-mark-words">${esc(m.words)}</b>${m.confidence ? `<span class="prp-mark-conf">${esc(confWords(m))}</span>` : ''}${m.provisional ? '<span class="prp-mark-prov">Provisional: UCDP candidate events</span>' : ''}</p>
      <p class="prp-mark-by">${esc(monthName(m.month))} · Vitruvian Manager's calculation from ${esc(what)} · not an analyst's judgement, not a forecast</p>
      <dl class="prp-mark-why">
        <div><dt>What changed</dt><dd>${esc(m.what)}${notes ? ' ' + notes : ''}</dd></div>
        <div><dt>Period</dt><dd>${esc(monthName(m.month))}, against ${esc(base)}</dd></div>
        <div><dt>Evidence</dt><dd>${evidence || 'None held.'}<br>${a(JSON_PAGE, 'Every figure behind the marks (JSON)')}</dd></div>
        ${conf}
        ${ctx}
      </dl>
      <p class="prp-mark-how">${a(HOW, 'How this is worked out')}</p>
    </section>`;
  }

  /** The year strip: twelve squares a year, the newest ten years first, then all; a table view lists the same. */
  function strip(s, { years = 10 } = {}) {
    if (!s) return '';
    if (!s.months?.length) return `<div class="prp-strip empty"><p class="prp-mark-note">${esc(s.why || 'No months VM can mark yet.')}</p></div>`;
    const by = new Map(s.months.map(x => [x.m, x]));
    const ys = [...new Set(s.months.map(x => x.m.slice(0, 4)))].sort().reverse();
    const sq = (y, k) => {
      const m = `${y}-${String(k + 1).padStart(2, '0')}`, x = by.get(m);
      if (!x) return `<li class="prp-strip-sq" data-dir="out" title="${esc(monthName(m))}: outside the strip"></li>`;
      const words = { worse: 'More deaths recorded', better: 'Fewer deaths recorded', same: 'No large change by this rule', none: 'No mark' }[x.direction];
      const t = `${monthName(m)}: ${words}${x.confidence ? `, ${x.confidence} confidence` : ''}${x.prov ? ', provisional (UCDP candidate events)' : ''}. ${x.what || ''}${x.why ? ' ' + x.why : ''}${x.dots?.length ? ` Calendar: ${x.dots.map(d => d.title).join('; ')}.` : ''}`;
      return `<li class="prp-strip-sq" data-dir="${esc(x.direction)}" data-conf="${esc(x.confidence || '')}" title="${esc(t)}"><span aria-hidden="true">${SIGN[x.direction] || ''}</span>${x.dots?.length ? '<i class="prp-strip-dot" aria-hidden="true"></i>' : ''}</li>`;
    };
    const provYears = [...new Set(s.months.filter(x => x.prov).map(x => x.m.slice(0, 4)))];
    const tallyWords = y => { const t = { worse: 0, better: 0, same: 0, none: 0 }; for (const x of s.months) if (x.m.startsWith(y)) t[x.direction]++; return `${y}: ${t.worse} more deaths recorded, ${t.better} fewer, ${t.same} no large change, ${t.none} no mark`; };
    const rows = ys.map((y, i) => `<div class="prp-strip-year"${i >= years ? ' hidden data-older' : ''}><span class="prp-strip-y">${y}</span><ol class="prp-strip-row" role="img" aria-label="${esc(tallyWords(y))}">${Array.from({ length: 12 }, (_, k) => sq(y, k)).join('')}</ol></div>`).join('');
    const tbl = `<div class="prp-strip-table" hidden><div class="prp-strip-scroll"><table class="prp-table"><thead><tr><th>Month</th><th>Mark</th><th class="num">Deaths</th><th class="num">Events</th><th class="num">From events over a span</th><th>Why</th></tr></thead><tbody>${[...s.months].reverse().map(x => `<tr><td class="mono">${esc(monthName(x.m))}</td><td>${esc({ worse: 'More deaths recorded', better: 'Fewer deaths recorded', same: 'No large change by this rule', none: 'No mark' }[x.direction])}${x.confidence ? `, ${esc(x.confidence)}` : ''}${x.prov ? ', provisional' : ''}</td><td class="num">${fmt(x.d)}</td><td class="num">${fmt(x.e)}</td><td class="num">${x.sh == null ? 'not known' : x.d ? `${fmt(x.sh / x.d * 100)}%` : '–'}</td><td>${esc(x.why || x.what || '')}${x.dots?.length ? ` <span class="prp-mark-note">Calendar: ${x.dots.map(d => esc(d.title)).join('; ')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
    return `<figure class="prp-strip" data-unit="${esc(s.id)}">
      <div class="prp-strip-head"><b>Month by month, ${esc(ys.at(-1))}–${esc(ys[0])}</b><span class="prp-strip-btns">${ys.length > years ? `<button type="button" class="prp-btn sm" data-strip-all aria-expanded="false">All years from ${esc(ys.at(-1))}</button>` : ''}<button type="button" class="prp-btn sm" data-strip-table aria-pressed="false">Table view</button></span></div>
      <div class="prp-strip-years">${rows}</div>
      ${tbl}
      <p class="prp-strip-legend"><span><i class="prp-strip-sq" data-dir="worse" data-conf="medium"><span aria-hidden="true">+</span></i> More deaths recorded</span><span><i class="prp-strip-sq" data-dir="better" data-conf="medium"><span aria-hidden="true">−</span></i> Fewer deaths recorded</span><span><i class="prp-strip-sq" data-dir="same"><span aria-hidden="true">=</span></i> No large change by this rule</span><span><i class="prp-strip-sq" data-dir="none"></i> No mark</span><span>Deeper fill: higher confidence</span><span><i class="prp-strip-dot static" aria-hidden="true"></i> a coup, ceasefire or vote in VM's calendars</span></p>
      <figcaption>Each square is Vitruvian Manager's mark for that month, from UCDP's figures (${esc(s.counts || 'recorded deaths')}): the month against the three before it, by one rule for every war and country. Not an analyst's judgement, not a forecast.${provYears.length ? ` The squares of ${esc(provYears.join(' and '))} are from UCDP's candidate events, which are provisional: UCDP revises them, and its final figures come the next year.` : ''}${s.note ? ' ' + esc(s.note) : ''} ${a(HOW, 'How this is worked out')}</figcaption>
    </figure>`;
  }

  /** The strips' buttons: all years, and the table view. Once per container; it delegates. */
  function wire(root) {
    if (!root || root.dataset.prpMarkWired) return;
    root.dataset.prpMarkWired = '1';
    root.addEventListener('click', e => {
      const all = e.target.closest('[data-strip-all]'), tab = e.target.closest('[data-strip-table]');
      const fig = (all || tab)?.closest('.prp-strip');
      if (!fig) return;
      if (all) { const on = all.getAttribute('aria-expanded') !== 'true'; all.setAttribute('aria-expanded', String(on)); fig.querySelectorAll('[data-older]').forEach(el => { el.hidden = !on; }); all.textContent = on ? 'The last ten years' : `All years from ${fig.querySelector('.prp-strip-year:last-child .prp-strip-y')?.textContent || ''}`; }
      if (tab) { const on = tab.getAttribute('aria-pressed') !== 'true'; tab.setAttribute('aria-pressed', String(on)); fig.querySelector('.prp-strip-table').hidden = !on; fig.querySelector('.prp-strip-years').hidden = on; tab.textContent = on ? 'Squares' : 'Table view'; }
    });
  }

  const loadStrip = file => fetch(new URL(`monthly/data/strips/${file}.json`, SHELL).href).then(r => (r.ok ? r.json() : null)).catch(() => null);
  window.PRPMark = { load, unitOf, full, chip, strip, wire, name, sentence, go, loadStrip, monthName, spanName, fmt, esc, SHELL };
})();

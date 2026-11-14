/* Auto Trader: the age of the filing a Mirror agent copies, to stand beside each "Mirror trades" and "Mirror portfolio"
   button on fe/traders.html. Worked out from the page's own data (traders/data/investors.json and congress.json) in whole
   UTC days, and selected as Algo Trader's Mirror reads it: an investor's latest 13F (its quarter, its filing date, and
   whether it is marked stale), or a member of Congress's disclosed trades of the last two years (that member, with a
   ticker, made in the last 730 days, in shares or call options), the newest made and the newest filed. The words are the
   money site's own, so the two pages say the same thing about the same filing.

   Plain script, no build step, no dependencies, like design/prp-tex.js: the page loads it with
   <script src="filing-age.js"></script> and reads globalThis.VMFilingAge; Node tests import it the same way.

   VMFilingAge.daysAgo(date, now)        "today", "1 day ago", "12 days ago" from a YYYY-MM-DD date to `now` (ms)
   VMFilingAge.filingOf(params, data, now) params { source: 'congress', member } or { cik }; data { investors, congress }
   VMFilingAge.filingAge(filing, now)    the sentence that stands beside the button */
(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  const DAY = 864e5;
  const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const date = s => new Date(day(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const today = now => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

  function daysAgo(s, now) {
    const n = Math.floor((today(now) - day(s)) / DAY);
    return n <= 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`;
  }

  // The trades Mirror builds a member's portfolio from: shares (ST, CS) and call options (OP with "call" in the note).
  const copied = t => t.assetType === 'ST' || t.assetType === 'CS' || (t.assetType === 'OP' && /call/i.test(t.note || ''));

  function filingOf(params, data, now) {
    params = params || {}; data = data || {};
    if (params.source === 'congress') {
      const since = new Date(now - 730 * DAY).toISOString().slice(0, 10);
      const t = ((data.congress && data.congress.trades) || []).filter(x => x.member === params.member && x.ticker && x.date >= since && copied(x));
      if (!t.length) return { kind: 'congress', none: true };
      const max = k => t.map(x => x[k]).filter(Boolean).sort().pop() || null;
      return { kind: 'congress', trades: t.length, date: max('date'), filed: max('filed') };
    }
    const v = (data.investors || []).find(x => String(x.cik) === String(params.cik));
    return v ? { kind: '13f', period: v.period, filed: v.filed, stale: v.stale || null } : null;
  }

  function filingAge(f, now) {
    if (!f) return 'Filing not found in Auto Trader’s data.';
    if (f.kind === 'congress') {
      if (f.none) return 'No disclosed stock trades in the last two years to copy.';
      return `Builds its portfolio from ${f.trades} disclosed trade${f.trades === 1 ? '' : 's'} of the last two years: the latest made ${date(f.date)} (${daysAgo(f.date, now)})${f.filed ? `, the latest filed ${date(f.filed)} (${daysAgo(f.filed, now)})` : ''}.`;
    }
    const which = `the 13F for the quarter to ${date(f.period)} (${daysAgo(f.period, now)}), filed ${date(f.filed)} (${daysAgo(f.filed, now)})`;
    return f.stale ? `Its latest filing is ${which}, and it is out of date: ${f.stale} Mirror copies nothing from it.` : `Copies ${which}.`;
  }

  root.VMFilingAge = { daysAgo, filingOf, filingAge };
})();

// The connector's old name, kept for any link that still points here: it loads design/prp-bar.js with the same
// settings (data-shell, data-module, data-suite), so the connector lives in one file. No Vitruvian Manager site loads
// this name any more (checked on 2 November 2026, the three Lovable apps included).
(() => {
  const me = document.currentScript, s = document.createElement('script');
  s.src = new URL('prp-bar.js', (me && me.src) || location.href).href;
  if (me) { Object.assign(s.dataset, me.dataset); me.after(s); } else document.head.appendChild(s);
})();

/* Moving the companion pane's frames the way the shell moves its own (shell.js, moveFrame): when only the hash
   differs the frame's page stays loaded and its address changes in place, so the Encyclopaedia goes from one entry to
   the next without reloading its 3 MB index, and the Invention Timeline from one period to another; anything else
   loads in the same frame. Pure (URLs in, a decision out), so the tests call it in Node; the page does the DOM part.
   Cloudflare Pages serves /x/index.html at /x/ and /x.html at /x (with a 308, as tests/tools/serve.mjs does
   locally), so a frame asked for encyclopedia/index.html#Q1 is at encyclopedia/#Q1 once loaded: page addresses are
   compared without index.html and .html, and a hash-only move is written on the frame's own address. */

export const stripPage = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
export const samePage = (a, b) => a.origin === b.origin && stripPage(a.pathname) === stripPage(b.pathname) && a.search === b.search;

/** How to send a frame from where it is to where it should be:
      { how: 'none' }               already there;
      { how: 'hash', url }          the same page with another hash: location.replace(url), no reload;
      { how: 'load', url }          another page (or another query): load it.
    `from` is the frame's current address (null when it has none yet, or it is on another origin). */
export function frameMove(from, to, base = 'http://localhost/') {
  const want = new URL(to, base);
  let here = null;
  try { here = from && from !== 'about:blank' ? new URL(from, base) : null; } catch { here = null; }
  if (!here) return { how: 'load', url: want.href };
  if (here.href === want.href) return { how: 'none' };
  if (samePage(here, want)) {
    if (here.hash === want.hash) return { how: 'none' };
    // Dropping the hash altogether is a navigation (only a move to another fragment stays in the document).
    if (!want.hash) return { how: 'load', url: want.href };
    const moved = new URL(here.href); moved.hash = want.hash;
    return { how: 'hash', url: moved.href };
  }
  return { how: 'load', url: want.href };
}

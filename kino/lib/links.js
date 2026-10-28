/* Kino links into the rest of PRP, shared by the player (browser) and the validator (node). No DOM here.
   A scene's link is { label, suite, module, at }:
     suite, module  the registry ids (e.g. "rs", "war-focus"), as in the shell route #/<suite>/<module>
     at             the exact place in that submodule: a path from the PRP root with its own query or hash
                    (e.g. "battlefield/focus/index.html#war=ww2&m=1941-06"), or an absolute URL for a submodule on
                    another host (e.g. "https://political-atlas.pages.dev/#GBR").
   The shell opens it at  <shell>#/<suite>/<module>?at=<absolute url>  (shell.js only frames an "at" on the module's own page). */

export const SHELL_URL = 'https://jdpi.pages.dev/';

/** Each submodule Kino can point into, the page its "at" must be on, and how its place is written. */
export const TARGETS = {
  'war-focus': { suite: 'rs', path: 'battlefield/focus/index.html', example: 'battlefield/focus/index.html#war=ww2&m=1941-06', params: ['war', 'm'] },
  'battlefield-history': { suite: 'rs', path: 'battlefield/history/index.html', example: 'battlefield/history/index.html#y=1941&w=c139', params: ['y', 'w', 'c'] },
  encyclopedia: { suite: 'rs', path: 'encyclopedia/index.html', example: 'encyclopedia/index.html#Q8016', params: ['qid'] },
  kardashev: { suite: 'rs', path: 'kardashev/index.html', example: 'kardashev/index.html#y=1900&p=britain', params: ['y', 'p'] },
  'historical-calendar': { suite: 'rs', path: 'q/calendar.html', example: 'q/calendar.html?period=history&month=1989-11', params: ['month'] },
  retrospective: { suite: 'rs', path: 'https://hp-retrospective.pages.dev/', example: 'https://hp-retrospective.pages.dev/#y=1946&c=200', params: ['y', 'c'] },
  'learning-politics': { suite: 'rs', path: 'fe/learning.html', example: 'fe/learning.html?course=politics&lesson=…', params: ['course', 'lesson'] },
  learning: { suite: 'mm', path: 'fe/learning.html', example: 'fe/learning.html?course=economics&lesson=…', params: ['course', 'lesson'] },
  pestle: { suite: 'rt', path: 'q/national.html', example: 'q/national.html#country=GBR', params: ['country'] },
  atlas: { suite: 'rt', path: 'https://political-atlas.pages.dev/', example: 'https://political-atlas.pages.dev/#GBR', params: ['country'] },
  progress: { suite: 'ns', path: 'science/progress/index.html', example: 'science/progress/index.html#y=1943&e=colossus', params: ['y', 'e'] },
};

/** The absolute URL of a link's place, given the shell's base URL. */
export function absAt(at, shell = SHELL_URL) { return new URL(at, shell).href; }

/** The shell route for a link: #/<suite>/<module>?at=<absolute url>. */
export function shellHash(link, shell = SHELL_URL) {
  return `#/${encodeURIComponent(link.suite)}/${encodeURIComponent(link.module)}?at=${encodeURIComponent(absAt(link.at, shell))}`;
}

/** The full shell URL for a link (what a new tab or a "_top" link opens). */
export function shellUrl(link, shell = SHELL_URL) { return new URL(shell).origin + new URL(shell).pathname + shellHash(link, shell); }

const strip = p => p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');

/** Whether an "at" sits on the target submodule's own page (the shell refuses anything else). */
export function onOwnPage(link, moduleUrl, shell = SHELL_URL) {
  try {
    const want = new URL(link.at, shell), base = new URL(moduleUrl, shell);
    return want.origin === base.origin && strip(want.pathname) === strip(base.pathname);
  } catch { return false; }
}

/** The place an "at" names, read the way the target page reads it: { war, m } for War Focus, { qid } for the Encyclopaedia… */
export function readAt(link, shell = SHELL_URL) {
  const u = new URL(link.at, shell), hash = u.hash.slice(1), q = Object.fromEntries(u.searchParams);
  switch (link.module) {
    case 'encyclopedia': return { qid: hash };
    case 'atlas': return { country: hash.toUpperCase() };
    case 'historical-calendar': case 'learning': case 'learning-politics': return q;
    default: return { ...q, ...Object.fromEntries(new URLSearchParams(hash)) };
  }
}

/** Deep links into Kino itself: #doc=<id>&s=<scene id or number>. */
export function readKinoHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  return { doc: p.get('doc') || null, s: p.get('s') || null };
}
export function kinoHash(doc, scene) { return doc ? `#doc=${encodeURIComponent(doc)}${scene ? `&s=${encodeURIComponent(scene)}` : ''}` : ''; }

/** The shell route back to a film at a scene, in the category page that plays it (kino/README.md, "Now playing"):
    #/kino/kino-<category>?at=<absolute url of kino/index.html?cat=<category>#doc=<id>&s=<scene>>. */
export function filmRoute(category, doc, scene, shell = SHELL_URL) {
  return shellHash({ suite: 'kino', module: `kino-${category}`, at: `kino/index.html?cat=${encodeURIComponent(category)}${kinoHash(doc, scene)}` }, shell);
}

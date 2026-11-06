/* Kino's Related screens: the places in Vitruvian Manager related to the scene on screen, for the strip under the film
   and its "See more" panel. Shared by the player (browser) and the tests (node). No DOM here.

   The film scripts carry no tags of their own, so the list is made from what the scripts and the Master Index already
   hold, in this order, each address once:
     1. scene   the scene's own place;
     2. tagged  the places the Master Index records for the things the scene names (an entry's "Appears in", the lake's
                mentions): the entry its link points to, when the link is to the Master Index, the person in its
                portrait, the war or the country its link names (War Focus, PESTLE, the Atlas) and the countries on its
                map, the last two through the site's tables of wars and countries (tagTables; design section 12,
                decision 6); a scene that names none of these uses the film's subjects. Up to PER_THING for each thing, in the
                Master Index's order. Other Kino films are left out, and so are a place already listed, a submodule
                the registry does not list and an address off its submodule's own page (the shell would not open it);
     3. film    the places of the film's other scenes, nearest scene first (the next, the one before, the one after
                next…), each with its scene number.
   The strip shows the first CHIPS. A film has 8 to 13 places of its own, so there are always at least three. */
import { readAt, SHELL_URL } from './links.js';
import { findModule, stripPage } from '../../design/prp-split.js';

export const CHIPS = 3;
export const PER_THING = 4;
export const LIVE = 'https://jdpi.pages.dev/';

/** At most this many of the countries on a scene's map are taken as its tags, in the map's order. */
export const MAP_COUNTRIES = 4;

/** The tables that name a war's and a country's Master Index entry (battlefield/focus/data/index.json, wars[].id → qid;
    national/data/brief.json, countries[].iso3 → qid), as the Maps sceneEntities takes. Either may be missing. */
export function tagTables(wars, brief) {
  return {
    wars: new Map((wars?.wars || []).filter(w => w?.id && w.qid).map(w => [w.id, w.qid])),
    countries: new Map((brief?.countries || []).filter(c => c?.iso3 && c.qid).map(c => [c.iso3, c.qid])),
  };
}

/** The Master Index entries a scene names: its link's entry, its portrait's person, the war or the country its link
    names, and the countries on its map (up to MAP_COUNTRIES); or else the film's subjects. The war and the countries
    are found through `tables` (tagTables), and left out without them. { qids, own } (own: false when they are the
    film's subjects). */
export function sceneEntities(scene, subjects = [], { wars = new Map(), countries = new Map() } = {}) {
  const qids = [];
  const add = q => { if (/^Q\d+$/.test(q || '') && !qids.includes(q)) qids.push(q); };
  const at = () => { try { return readAt(scene.link); } catch { return {}; } };
  const mod = scene?.link?.module;
  if (mod === 'encyclopedia') add(at().qid);
  if (scene?.visual?.kind === 'portrait') add(scene.visual.qid);
  if (mod === 'war-focus') add(wars.get(at().war));
  if (mod === 'pestle' || mod === 'atlas') add(countries.get(String(at().country || '').toUpperCase()));
  const onMap = [...(scene?.focus?.countries || []), ...(scene?.visual?.groups || []).flatMap(g => g?.countries || [])];
  for (const c of [...new Set(onMap)].slice(0, MAP_COUNTRIES)) add(countries.get(String(c).toUpperCase()));
  if (qids.length) return { qids, own: true };
  for (const s of subjects || []) add(s.qid);
  return { qids, own: false };
}

// A place the shell would open: on its submodule's own page, as canFrame (design/prp-split.js) tells it.
function onOwnPage(at, moduleUrl, shell) {
  try { const a = new URL(at, shell), b = new URL(moduleUrl, shell); return a.origin === b.origin && stripPage(a.pathname) === stripPage(b.pathname); } catch { return false; }
}

/**
 * The related places for scene i of a film.
 *   scenes    flatScenes(doc)
 *   subjects  doc.subjects
 *   entities  Map of QID → the Master Index entity ({ label, mentions: [{ m, u, c }] }), or null where its shard did not load
 *   registry  registry.json
 *   shell     the site's root; addresses written for the live site are pointed at it
 * Returns [{ group: 'scene' | 'tagged' | 'film', link: { label, suite, module, at }, key, scene?, qid?, name?, place? }]
 * (name and place, for a tagged place: the submodule's name and the Master Index's caption, which the label joins): at is an
 * address relative to the shell or absolute, key the absolute address (each once).
 */
export function relatedPlaces(scenes, i, { subjects = [], entities = new Map(), registry = null, shell = SHELL_URL, tables = {} } = {}) {
  const here = u => (shell !== LIVE && String(u).startsWith(LIVE) ? shell + String(u).slice(LIVE.length) : u);
  const out = [], seen = new Set();
  const add = (group, link, extra = {}) => {
    // Other films are not screens (Kino's categories are kino-<category>; Bibliotheca, in Kino's suite, is one).
    if (!link || /^kino-/.test(link.module)) return false;
    const hit = findModule(registry, link.module);
    if (!hit || !hit.module.url || /^kino-/.test(hit.module.id)) return false;
    let key;
    try { key = new URL(here(link.at), shell).href; } catch { return false; }
    if (seen.has(key) || !onOwnPage(key, hit.module.url, shell)) return false;
    seen.add(key);
    out.push({ group, link: { label: link.label, suite: hit.suite.id, module: hit.module.id, at: here(link.at) }, key, ...extra });
    return true;
  };
  const sc = scenes[i];
  if (!sc) return out;
  if (sc.link) add('scene', sc.link, { scene: i + 1 });
  for (const q of sceneEntities(sc, subjects, tables).qids) {
    const ent = entities.get(q);
    let n = 0;
    for (const m of ent?.mentions || []) {
      if (n >= PER_THING) break;
      const hit = findModule(registry, m.m);
      const name = hit?.module.name || m.m;
      const place = m.c || ent.label || q;
      if (add('tagged', hit ? { label: `${name} · ${place}`, suite: hit.suite.id, module: hit.module.id, at: m.u } : null, { qid: q, thing: ent.label || q, name, place })) n++;
    }
  }
  for (let d = 1; d < scenes.length; d++) {
    for (const k of [i + d, i - d]) { const s = scenes[k]; if (s?.link) add('film', s.link, { scene: k + 1 }); }
  }
  return out;
}

/** The Master Index shard that holds an entry: lake/data/e/<number mod 512>.json. */
export const shardOf = qid => +String(qid).slice(1) % 512;

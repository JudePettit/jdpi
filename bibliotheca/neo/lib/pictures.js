/* Pictures for the books (bibliotheca/data/pictures.json): scenes of Kino's stage, a map, a timeline or a portrait
   looping quietly like a GIF, either from the Kino film about the book's author or written for the book. In Screens
   only they take their turn with the screens for the book's era (app.js, tour). Pure: the page and the tests use it. */

/** The pictures that go with a chapter of a book: [{ film, scene, key }], scene being the film's scene id or a scene
    written for the book; key names it within the book. A picture without chapters goes with every chapter. */
export function picturesFor(data, slug, n) {
  const b = data?.books?.[slug];
  if (!b || !Array.isArray(b.pictures)) return [];
  return b.pictures.map((p, i) => ({ ...p, i })).filter(p => !Array.isArray(p.chapters) || (n >= p.chapters[0] && n <= p.chapters[1]))
    .map(p => ({ film: p.scene && typeof p.scene === 'object' ? null : b.film || null, scene: p.scene, key: `picture:${p.i}` }));
}

/** Which takes the k-th turn of a chapter (k from 0): the chapter's pictures and the era's screens alternate, a picture
    first; with only one kind, that kind. { kind: 'picture' | 'screen', i } (i: which picture, or the how-many-th
    screen of this kind's turns so far), or null with neither. */
export function turnOf(k, pictures, screens) {
  if (!pictures && !screens) return null;
  if (!screens) return { kind: 'picture', i: k % pictures };
  if (!pictures) return { kind: 'screen', i: k };
  return k % 2 === 0 ? { kind: 'picture', i: (k / 2) % pictures } : { kind: 'screen', i: (k - 1) / 2 };
}

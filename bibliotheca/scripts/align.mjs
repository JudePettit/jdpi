// Aligns two readings of one text word by word (scan-text.mjs): anchored on runs of words that occur once in each, then
// an edit distance between the anchors. align(a, b) -> [{ op: 'eq' | 'sub', i0, i1, j0, j1 }] covering a[i0..i1) and b[j0..j1);
// a 'sub' with one side empty is an insertion or a deletion.
export function align(a, b, { n = 4 } = {}) {
  const ops = [];
  rec(a, b, 0, a.length, 0, b.length, n, ops);
  // merge adjacent ops of the same kind
  const out = [];
  for (const o of ops) {
    if (o.i0 === o.i1 && o.j0 === o.j1) continue;
    const last = out.at(-1);
    if (last && last.op === o.op && last.i1 === o.i0 && last.j1 === o.j0) { last.i1 = o.i1; last.j1 = o.j1; } else out.push({ ...o });
  }
  return out;
}

function uniqueGrams(seq, s, e, n) {
  const m = new Map();
  for (let i = s; i + n <= e; i++) {
    const k = seq.slice(i, i + n).join('\u0000');
    const v = m.get(k);
    if (v === undefined) m.set(k, i); else if (v !== -1) m.set(k, -1);
  }
  return m;
}

function lis(pairs) {
  // pairs sorted by i; longest increasing subsequence by j
  const tails = [], prev = new Array(pairs.length), idx = [];
  pairs.forEach((p, k) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pairs[tails[mid]].j < p.j) lo = mid + 1; else hi = mid; }
    prev[k] = lo ? tails[lo - 1] : -1; tails[lo] = k;
  });
  for (let k = tails.length ? tails.at(-1) : -1; k >= 0; k = prev[k]) idx.push(pairs[k]);
  return idx.reverse();
}

function rec(a, b, i0, i1, j0, j1, n, ops) {
  // trim common prefix/suffix
  while (i0 < i1 && j0 < j1 && a[i0] === b[j0]) { ops.push({ op: 'eq', i0, i1: i0 + 1, j0, j1: j0 + 1 }); i0++; j0++; }
  const tail = [];
  while (i1 > i0 && j1 > j0 && a[i1 - 1] === b[j1 - 1]) { i1--; j1--; tail.push({ op: 'eq', i0: i1, i1: i1 + 1, j0: j1, j1: j1 + 1 }); }
  if (i0 < i1 || j0 < j1) {
    const la = i1 - i0, lb = j1 - j0;
    if (la === 0 || lb === 0) ops.push({ op: 'sub', i0, i1, j0, j1 });
    else if (la * lb <= 250000) dp(a, b, i0, i1, j0, j1, ops);
    else {
      let anchors = [];
      for (let g = n; g >= 1 && !anchors.length; g--) {
        const ga = uniqueGrams(a, i0, i1, g), gb = uniqueGrams(b, j0, j1, g), pairs = [];
        for (const [k, i] of ga) { if (i < 0) continue; const j = gb.get(k); if (j !== undefined && j >= 0) pairs.push({ i, j, g }); }
        pairs.sort((x, y) => x.i - y.i);
        anchors = lis(pairs);
        // drop overlapping anchors
        const ok = []; let li = -1, lj = -1;
        for (const p of anchors) if (p.i >= li && p.j >= lj) { ok.push(p); li = p.i + p.g; lj = p.j + p.g; }
        anchors = ok;
      }
      if (!anchors.length) ops.push({ op: 'sub', i0, i1, j0, j1 });
      else {
        let ci = i0, cj = j0;
        for (const p of anchors) {
          rec(a, b, ci, p.i, cj, p.j, n, ops);
          for (let k = 0; k < p.g; k++) ops.push({ op: 'eq', i0: p.i + k, i1: p.i + k + 1, j0: p.j + k, j1: p.j + k + 1 });
          ci = p.i + p.g; cj = p.j + p.g;
        }
        rec(a, b, ci, i1, cj, j1, n, ops);
      }
    }
  }
  for (const x of tail.reverse()) ops.push(x);
}

function dp(a, b, i0, i1, j0, j1, ops) {
  const la = i1 - i0, lb = j1 - j0, W = lb + 1;
  const d = new Uint32Array((la + 1) * W);
  for (let i = 0; i <= la; i++) d[i * W] = i;
  for (let j = 0; j <= lb; j++) d[j] = j;
  for (let i = 1; i <= la; i++) for (let j = 1; j <= lb; j++) {
    const c = a[i0 + i - 1] === b[j0 + j - 1] ? 0 : 1;
    d[i * W + j] = Math.min(d[(i - 1) * W + j - 1] + c, d[(i - 1) * W + j] + 1, d[i * W + j - 1] + 1);
  }
  const rev = [];
  let i = la, j = lb;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i0 + i - 1] === b[j0 + j - 1] && d[i * W + j] === d[(i - 1) * W + j - 1]) { rev.push({ op: 'eq', i0: i0 + i - 1, i1: i0 + i, j0: j0 + j - 1, j1: j0 + j }); i--; j--; }
    else if (i > 0 && j > 0 && d[i * W + j] === d[(i - 1) * W + j - 1] + 1) { rev.push({ op: 'sub', i0: i0 + i - 1, i1: i0 + i, j0: j0 + j - 1, j1: j0 + j }); i--; j--; }
    else if (i > 0 && d[i * W + j] === d[(i - 1) * W + j] + 1) { rev.push({ op: 'sub', i0: i0 + i - 1, i1: i0 + i, j0: j0 + j, j1: j0 + j }); i--; }
    else { rev.push({ op: 'sub', i0: i0 + i, i1: i0 + i, j0: j0 + j - 1, j1: j0 + j }); j--; }
  }
  for (const x of rev.reverse()) ops.push(x);
}

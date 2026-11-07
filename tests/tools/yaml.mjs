// A small YAML reader for the repository's own GitHub Actions files (tests/freshness.test.mjs), so their structure can
// be checked without a YAML library. It reads the part of YAML those files use and throws on anything else:
//   block mappings and block sequences by indentation (a sequence may sit at its key's indent), "- key: value" items,
//   plain, 'single' and "double" quoted scalars, true/false/null and numbers, flow sequences ([main]), the block
//   scalars | |- > >- (kept as written, without their indentation), full-line comments and " #" comments after plain
//   scalars. No anchors, aliases, tags, flow mappings or multi-document files.
export function parseYaml(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((raw, n) => ({ n: n + 1, raw, indent: raw.match(/^ */)[0].length, text: raw.trim() }));
  if (lines.some(l => /^\t/.test(l.raw.slice(l.indent)) && l.text)) throw new Error('tabs are not indentation in YAML');
  const skip = l => !l.text || l.text.startsWith('#');
  let i = 0;
  const next = () => { while (i < lines.length && skip(lines[i])) i++; return lines[i]; };
  const fail = (l, why) => { throw new Error(`line ${l?.n ?? 'end'}: ${why}: ${l?.raw ?? ''}`); };

  function scalar(s, l) {
    if (s.startsWith("'")) { const m = s.match(/^'((?:[^']|'')*)'\s*(#.*)?$/); if (!m) fail(l, 'unclosed quote'); return m[1].replace(/''/g, "'"); }
    if (s.startsWith('"')) {
      const m = s.match(/^"((?:[^"\\]|\\.)*)"\s*(#.*)?$/); if (!m) fail(l, 'unclosed quote');
      return m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', '"': '"', '\\': '\\' }[c] ?? fail(l, `escape \\${c}`)));
    }
    if (s.startsWith('[')) {
      const m = s.match(/^\[(.*)\]\s*(#.*)?$/); if (!m) fail(l, 'unclosed flow sequence');
      return m[1].trim() ? m[1].split(',').map(x => scalar(x.trim(), l)) : [];
    }
    if (/^[{&*!%@`|>]/.test(s)) fail(l, 'unsupported YAML');
    const v = s.replace(/\s+#.*$/, '');
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~' || v === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  // A block scalar: every following line indented deeper than its key (blank lines included), as written.
  function blockScalar(style, keyIndent) {
    const body = [];
    while (i < lines.length && (lines[i].indent > keyIndent || !lines[i].text)) body.push(lines[i++]);
    while (body.length && !body.at(-1).text) body.pop();
    const cut = Math.min(...body.filter(b => b.text).map(b => b.indent));
    const kept = body.map(b => b.raw.slice(cut));
    const joined = style.startsWith('>') ? kept.join(' ').replace(/ {2,}/g, ' ') : kept.join('\n');
    return style.endsWith('-') ? joined : joined + '\n';
  }

  // The value after "key:" or "- ": a scalar on the same line, a block scalar, or a nested block on the lines below.
  function value(rest, l, indent, { inSequence = false } = {}) {
    if (/^[|>]-?$/.test(rest)) { i++; return blockScalar(rest, indent); }
    if (rest) { i++; return scalar(rest, l); }
    i++;
    const n = next();
    if (!n) return null;
    if (n.indent > indent) return block(n.indent);
    if (!inSequence && n.indent === indent && /^-(\s|$)/.test(n.text)) return block(n.indent); // a sequence at its key's indent
    return null;
  }

  const KEY = /^((?:[^:'"#\s][^:]*?)|'[^']*'|"[^"]*"):(?:\s+(.*))?$/;
  function mapping(indent, first) {
    const out = {};
    let l = first;
    while (l && l.indent === indent && !/^-(\s|$)/.test(l.text)) {
      const m = l.text.match(KEY);
      if (!m) fail(l, 'expected "key: value"');
      const key = /^['"]/.test(m[1]) ? m[1].slice(1, -1) : m[1];
      if (key in out) fail(l, `duplicate key ${key}`);
      out[key] = value((m[2] || '').trim(), l, indent);
      l = next();
    }
    if (l && l.indent > indent) fail(l, 'unexpected indentation');
    return out;
  }

  function sequence(indent) {
    const out = [];
    let l = next();
    while (l && l.indent === indent && /^-(\s|$)/.test(l.text)) {
      const rest = l.text.slice(1).trim();
      if (KEY.test(rest) && !/^['"[]/.test(rest)) {
        // "- key: value": a mapping whose first line starts after the dash.
        const at = indent + l.raw.slice(indent).match(/^-\s+/)[0].length;
        lines[i] = { ...l, indent: at, text: rest };
        out.push(mapping(at, lines[i]));
      } else out.push(value(rest, l, indent, { inSequence: true }));
      l = next();
    }
    if (l && l.indent > indent) fail(l, 'unexpected indentation');
    return out;
  }

  function block(indent) {
    const l = next();
    return /^-(\s|$)/.test(l.text) ? sequence(indent) : mapping(indent, l);
  }

  const first = next();
  if (!first) return null;
  if (first.indent !== 0) fail(first, 'the document must start at column 0');
  const doc = block(0);
  const rest = next();
  if (rest) fail(rest, 'unexpected text after the document');
  return doc;
}

/* VM readable notation: mathematics a feed sends as TeX ("$^{224}\mathrm{Ra}$", "${\rm LiMn}_2{\rm O}_4$",
   "${δ}_{CP}$") shown in plain characters ("²²⁴Ra", "LiMn₂O₄", "δCP"), so a headline or a summary never shows a reader
   markup to decode. Journals (the APS's Physical Review titles, Wiley's abstracts) and arXiv write their notation this
   way; the four briefings' pages and Highbrowse put every title and summary through PRPTex.plain before they show it.

   Plain script, no build step, no dependencies, like design/prp-access.js: a page loads it with
   <script src="../design/prp-tex.js"></script> (or imports it, from a module, for its side effect) and reads
   globalThis.PRPTex; Node tests import it the same way.

   PRPTex.plain(text)   the text with each TeX span written in plain characters; anything else is left as it was.
     A span is "$…$" (or "\(…\)") whose content is TeX: it has a command (\mathrm, \alpha…), a superscript or
     subscript, or braces; or it is a short symbol with no spaces ("$α$", "spin-$1/2$"). A dollar amount ("$450", "$8.4
     billion … $1tn") is never one: its content has spaces and no TeX. Superscripts and subscripts take the Unicode
     forms where every character has one (³⁺, ₄), and are written on the line otherwise ("δCP", "m*"). A span that only
     repeats the plain text just before it (Wiley sends "LiMn2O4${\rm LiMn}_2{\rm O}_4$") is dropped, and so is a span cut
     short by a summary's ellipsis ("Csp3${\rm…").
   PRPTex.hasTex(text)  whether the text holds a span PRPTex.plain would rewrite. */
(function () {
  const root = typeof globalThis !== 'undefined' ? globalThis : window;

  const SYMBOL = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
    varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    times: '×', cdot: '·', pm: '±', mp: '∓', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
    sim: '~', simeq: '≃', equiv: '≡', propto: '∝', ll: '≪', gg: '≫', to: '→', rightarrow: '→', leftarrow: '←',
    leftrightarrow: '↔', Rightarrow: '⇒', infty: '∞', partial: '∂', nabla: '∇', ell: 'ℓ', hbar: 'ħ', prime: '′', circ: '°',
    degree: '°', langle: '⟨', rangle: '⟩', in: '∈', sum: '∑', prod: '∏', int: '∫', sqrt: '√', dagger: '†', ast: '*', star: '⋆',
    perp: '⊥', parallel: '∥', otimes: '⊗', oplus: '⊕', cdots: '⋯', ldots: '…', dots: '…', AA: 'Å', textendash: '–',
    textemdash: '—', S: '§', percent: '%', lbrace: '{', rbrace: '}',
  };
  // Commands that only set a font or an accent: their argument stays, the command goes ("\mathrm{Ra}" is "Ra").
  const STYLE = new Set(['mathrm', 'text', 'textrm', 'textit', 'textbf', 'textsf', 'mathit', 'mathbf', 'mathsf', 'mathtt', 'mathcal',
    'mathbb', 'mathfrak', 'mathscr', 'boldsymbol', 'bm', 'mbox', 'operatorname', 'mathnormal', 'emph', 'hat', 'tilde', 'bar', 'vec',
    'dot', 'ddot', 'overline', 'underline', 'widehat', 'widetilde']);
  // Switches and sizes, which take no argument: they go, and what follows them stays ("{\rm O}" is "O", "\left(" is "(").
  const SWITCH = new Set(['rm', 'it', 'bf', 'sf', 'tt', 'cal', 'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr',
    'displaystyle', 'textstyle', 'scriptstyle', 'quad', 'qquad', 'limits', 'nolimits']);
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    n: 'ⁿ', i: 'ⁱ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ',
    r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', '°': '°', '′': '′', '*': '*', '†': '†' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
    a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };
  const script = (s, table) => { const t = s.replace(/\s+/g, ''); return t && [...t].every(c => c in table) ? [...t].map(c => table[c]).join('') : null; };
  // TeX inside a span: a command, a ^ or _ script, or braces.
  const TEXISH = /\\[A-Za-z]+|\\[,;:! %{}]|[\^_]|[{}]/;

  // The argument after position i: a {group} (balanced), a \command, or one character. Returns [text, next index].
  function arg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') {
      let depth = 1, j = i + 1;
      for (; j < s.length && depth; j++) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; }
      return [s.slice(i + 1, j - 1), j];
    }
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); return m ? [m[0], i + m[0].length] : ['', i + 1]; }
    return [s[i] ?? '', i + 1];
  }

  /** One span's content in plain characters. */
  function render(s) {
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
        if (!m) { i++; continue; }
        const name = m[1]; i += m[0].length;
        if (/^[A-Za-z]/.test(name)) while (s[i] === ' ') i++; // TeX drops the spaces after a command's name
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const [a, j] = arg(s, i), [b, k] = arg(s, j); i = k;
          const ra = render(a), rb = render(b);
          out += `${/^[\w.]+$/u.test(ra) ? ra : `(${ra})`}/${/^[\w.]+$/u.test(rb) ? rb : `(${rb})`}`;
        } else if (name === 'sqrt') {
          const [a, j] = arg(s, i); i = j; const r = render(a);
          out += /^[\w.]$/u.test(r) ? `√${r}` : `√(${r})`;
        } else if (STYLE.has(name)) {
          const [a, j] = arg(s, i); i = j; out += render(a);
        } else if (SWITCH.has(name)) {
          if (name === 'quad' || name === 'qquad') out += ' ';
        } else if (name in SYMBOL) out += SYMBOL[name];
        else if (name === ',' || name === ';' || name === ':' || name === ' ' || name === '!') out += name === '!' ? '' : ' ';
        else if (name.length === 1) out += name; // \% \{ \} \_ \$ \&
        else out += name; // an unknown command: its name, never a backslash
      } else if (c === '^' || c === '_') {
        const [a, j] = arg(s, i + 1); i = j;
        const r = render(a), u = script(r, c === '^' ? SUP : SUB);
        out += u ?? r;
      } else if (c === '{' || c === '}') i++;
      else if (c === '~') { out += ' '; i++; }
      else { out += c; i++; }
    }
    return out.replace(/\s{2,}/g, ' ');
  }

  // The same characters with scripts brought back on the line, for comparing a span with the plain text before it.
  const FLAT = Object.fromEntries([...Object.entries(SUP), ...Object.entries(SUB)].map(([k, v]) => [v, k === '−' ? '-' : k]));
  const flat = s => [...String(s)].map(c => FLAT[c] ?? c).join('').replace(/[\s−]/g, m => (m === '−' ? '-' : '')).toLowerCase();

  function isMath(body, before) {
    if (!body || body.length > 300 || /^\s|\s$/.test(body)) return false;
    if (TEXISH.test(body)) return !/\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/.test(body.replace(/\\[A-Za-z]+\{[^}]*\}/g, '')); // not words between two prices
    // A short symbol with no spaces: "$α$", "$k$", or "$1/2$" when it hangs on a word ("spin-$1/2$").
    return body.length <= 12 && !/\s/.test(body) && (!/^\d/.test(body) || /[\p{L}-]$/u.test(before));
  }

  function plain(text) {
    const s = String(text ?? '');
    if (!s.includes('$') && !s.includes('\\(')) return s;
    let out = '', i = 0;
    while (i < s.length) {
      const open = s.startsWith('\\(', i) ? '\\(' : s[i] === '$' ? '$' : null;
      if (!open) { out += s[i++]; continue; }
      const close = open === '$' ? '$' : '\\)', from = i + open.length, end = s.indexOf(close, from);
      if (end < 0) {
        // A span cut short at the end of a summary ("Csp3${\rm…"): drop it, keep the ellipsis.
        const rest = s.slice(from), cut = /^(.*?)(…|\.\.\.)\s*$/s.exec(rest);
        if (cut && TEXISH.test(cut[1])) { out += cut[2]; break; }
        out += s[i++]; continue;
      }
      const body = s.slice(from, end);
      if (!isMath(body, out.slice(-1))) { out += s[i++]; continue; }
      const r = render(body).trim(), f = flat(r), word = /(\S+)$/.exec(out)?.[1] || '';
      // A span that repeats, with no space between, the plain text just before it ("LiMn2O4${\rm LiMn}_2{\rm O}_4$",
      // "Mn3+${\rm Mn}^{3+}$") adds nothing.
      if (f.length >= 2 && flat(word).endsWith(f)) { i = end + close.length; continue; }
      out += r; i = end + close.length;
    }
    return out;
  }
  const hasTex = text => plain(text) !== String(text ?? '');

  root.PRPTex = { plain, hasTex, render };
})();

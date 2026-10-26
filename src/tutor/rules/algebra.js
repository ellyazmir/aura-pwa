/** Algebra rules: quadratic equations, expand, factorise, inequalities, simultaneous equations. */
import {
  t, step, gcd, isInt, fmt, fmt2, rat, ratStr, ratVal, numStr, stripLead, prep,
  termsStr, polyStr, linStr, makeFn, polyCoeffs, intScale, paren, factorStr,
} from './util.js';

const SIGN = (v) => (v < 0 ? '-' : '+');

/* ---------- quadratic equation ---------- */
export const quadraticEquation = {
  id: 'quadratic-equation',
  topic: 'Quadratic Expressions',
  level: 'Form4',
  match(text) {
    const body = stripLead(text).toLowerCase();
    const ok = /x\^2/.test(body) && (body.match(/=/g) || []).length === 1 && /^[\dx+\-*/^().\s=]+$/.test(body);
    return ok ? { body } : null;
  },
  async solve(p, lang, ctx) {
    const { num } = await ctx.loadMath();
    const [l, r] = p.body.split('=');
    if (!l.trim() || !r.trim()) return null;
    const cs = polyCoeffs(makeFn(num, `(${l})-(${r})`, ['x']));
    if (!cs || cs.length !== 3) return null;
    let [a, b, c] = cs;
    const steps = [
      step(`${polyStr(cs)} = 0`, t(lang,
        `Move every term to the left so the right side is 0. Compare with ax^2 + bx + c = 0: a = ${fmt(a)}, b = ${fmt(b)}, c = ${fmt(c)}.`,
        `Pindahkan semua sebutan ke kiri supaya belah kanan ialah 0. Banding dengan ax^2 + bx + c = 0: a = ${fmt(a)}, b = ${fmt(b)}, c = ${fmt(c)}.`)),
    ];
    if ([a, b, c].every(isInt)) {
      [a, b, c] = [a, b, c].map(Math.round);
      if (a < 0) {
        [a, b, c] = [-a, -b, -c];
        steps.push(step(`${polyStr([a, b, c])} = 0`, t(lang, 'Multiply both sides by -1 so the x^2 term is positive.', 'Darab kedua-dua belah dengan -1 supaya sebutan x^2 positif.')));
      }
      const g = gcd(gcd(Math.abs(a), Math.abs(b)), Math.abs(c));
      if (g > 1) {
        [a, b, c] = [a / g, b / g, c / g];
        steps.push(step(`${polyStr([a, b, c])} = 0`, t(lang, `Divide every term by ${g} to make the numbers smaller.`, `Bahagikan setiap sebutan dengan ${g} untuk mengecilkan nombor.`)));
      }
      const D = b * b - 4 * a * c;
      if (D >= 0 && isInt(Math.sqrt(D))) return steps.concat(byFactorising(a, b, c, Math.round(Math.sqrt(D)), lang));
    }
    return steps.concat(byFormula(a, b, c, lang));
  },
};

function byFactorising(a, b, c, S, lang) {
  const out = [];
  const roots = [rat(-b + S, 2 * a), rat(-b - S, 2 * a)].sort((x, y) => ratVal(x) - ratVal(y));
  const [f1, f2] = roots.map(factorStr);
  const same = roots[0].n === roots[1].n && roots[0].d === roots[1].d;
  if (c === 0 && b !== 0) {
    out.push(step(`${paren('x')}(${a === 1 ? '' : a}x ${SIGN(b)} ${Math.abs(b)}) = 0`, t(lang, 'x is a common factor of both terms. Take it out.', 'x ialah faktor sepunya bagi kedua-dua sebutan. Keluarkannya.')));
  } else if (b === 0 && c === 0) {
    out.push(step('x^2 = 0', t(lang, 'Only 0 squared gives 0.', 'Hanya 0 kuasa dua yang memberi 0.')));
  } else {
    const ac = a * c;
    let p = 0;
    const lim = Math.abs(ac) + Math.abs(b);
    for (p = -lim; p <= lim; p += 1) if (p * (b - p) === ac) break;
    const q = b - p;
    if (a === 1) {
      out.push(step(`${p} ${t(lang, 'and', 'dan')} ${q}`, t(lang, `Find two numbers that multiply to c = ${c} and add to b = ${b}.`, `Cari dua nombor yang hasil darabnya c = ${c} dan hasil tambahnya b = ${b}.`)));
    } else {
      const split = termsStr([{ c: a, p: 2 }, { c: p, p: 1 }, { c: q, p: 1 }, { c, p: 0 }]);
      out.push(step(`${split} = 0`, t(lang, `Find two numbers that multiply to a × c = ${ac} and add to b = ${b}: they are ${p} and ${q}. Split the middle term, then factorise by grouping.`, `Cari dua nombor yang hasil darabnya a × c = ${ac} dan hasil tambahnya b = ${b}: ${p} dan ${q}. Pecahkan sebutan tengah, kemudian faktorkan secara kumpulan.`)));
    }
    out.push(step(same ? `${paren(f1)}^2 = 0` : `${paren(f1)}${paren(f2)} = 0`, t(lang, 'Write it as a product of two brackets.', 'Tulis sebagai hasil darab dua kurungan.')));
  }
  if (!same) {
    out.push(step(`${f1} = 0  ${t(lang, 'or', 'atau')}  ${f2} = 0`, t(lang, 'If a product is 0, at least one of the factors must be 0.', 'Jika hasil darab ialah 0, sekurang-kurangnya satu faktor mesti 0.')));
  }
  out.push(step(same ? `x = ${ratStr(roots[0])}` : `x = ${ratStr(roots[0])}  ${t(lang, 'or', 'atau')}  x = ${ratStr(roots[1])}`, t(lang, 'Solve each factor for x.', 'Selesaikan setiap faktor untuk x.')));
  return out;
}

function byFormula(a, b, c, lang) {
  const D = b * b - 4 * a * c;
  const out = [
    step('x = (-b ± √(b² - 4ac)) ÷ 2a', t(lang, 'This does not factorise neatly, so use the quadratic formula.', 'Ini tidak boleh difaktorkan dengan mudah, jadi guna rumus kuadratik.')),
    step(`b² - 4ac = (${fmt(b)})² - 4(${fmt(a)})(${fmt(c)}) = ${fmt(D)}`, t(lang, 'Work out the discriminant first.', 'Kira pembeza dahulu.')),
  ];
  if (D < 0) {
    out.push(step(t(lang, 'No real roots', 'Tiada punca nyata'), t(lang, 'The discriminant is negative, so the equation has no real solutions.', 'Pembeza adalah negatif, jadi persamaan ini tiada penyelesaian nyata.')));
  } else if (Math.abs(D) < 1e-12) {
    out.push(step(`x = ${fmt(-b)} ÷ ${fmt(2 * a)} = ${fmt2(-b / (2 * a))}`, t(lang, 'The discriminant is 0, so there is one repeated root.', 'Pembeza ialah 0, jadi ada satu punca berulang.')));
  } else {
    const s = Math.sqrt(D);
    const [x1, x2] = [(-b + s) / (2 * a), (-b - s) / (2 * a)].sort((u, v) => u - v);
    out.push(
      step(`x = (${fmt(-b)} ± √${fmt(D)}) ÷ ${fmt(2 * a)}`, t(lang, 'Put in the discriminant.', 'Gantikan pembeza.')),
      step(`x = ${fmt2(x1)}  ${t(lang, 'or', 'atau')}  x = ${fmt2(x2)}`, t(lang, 'Work out both roots, correct to 2 decimal places.', 'Kira kedua-dua punca, betul kepada 2 tempat perpuluhan.'))
    );
  }
  return out;
}

/* ---------- expand ---------- */
function parseTerms(str) {
  const tokens = str.match(/[+-]?[^+-]+/g);
  if (!tokens || tokens.join('') !== str) return null;
  const out = [];
  for (const tok of tokens) {
    const m = tok.match(/^([+-]?)(\d*\.?\d*)\*?(x(?:\^(\d+))?)?$/);
    if (!m || (m[2] === '' && !m[3])) return null;
    const mag = m[2] === '' ? 1 : Number(m[2]);
    out.push({ c: m[1] === '-' ? -mag : mag, p: m[3] ? (m[4] ? Number(m[4]) : 1) : 0 });
  }
  return out;
}

function splitFactors(expr) {
  const s = expr.replace(/\s+/g, '');
  const factors = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '*') {
      i += 1;
    } else if (s[i] === '(') {
      let depth = 0;
      let j = i;
      for (; j < s.length; j += 1) {
        if (s[j] === '(') depth += 1;
        else if (s[j] === ')' && (depth -= 1) === 0) break;
      }
      if (depth !== 0) return null;
      const terms = parseTerms(s.slice(i + 1, j));
      i = j + 1;
      let pow = 1;
      if (s[i] === '^') {
        const m = s.slice(i + 1).match(/^\d/);
        if (!m) return null;
        pow = Number(m[0]);
        i += 2;
      }
      if (!terms) return null;
      for (let k = 0; k < pow; k += 1) factors.push(terms);
    } else {
      let j = s.indexOf('(', i);
      if (j === -1) j = s.length;
      const terms = parseTerms(s.slice(i, j).replace(/\*+$/, ''));
      if (!terms || terms.length !== 1) return null;
      factors.push(terms);
      i = j;
    }
  }
  return factors;
}

const ALG_OK = /^[\dx+\-*/^().\s]+$/;

export const expand = {
  id: 'expand',
  topic: 'Quadratic Expressions',
  level: 'Form2',
  match(text) {
    if (!/expand|kembang/i.test(text)) return null;
    const body = stripLead(text).toLowerCase();
    return /x/.test(body) && !body.includes('=') && ALG_OK.test(body) ? { body } : null;
  },
  async solve({ body }, lang, ctx) {
    const { num } = await ctx.loadMath();
    const cs = polyCoeffs(makeFn(num, body, ['x']));
    if (!cs) return null;
    const final = polyStr(cs);
    const steps = [];
    const factors = splitFactors(body);
    if (factors && factors.length === 2) {
      const list = factors[0].flatMap((a) => factors[1].map((b) => ({ c: a.c * b.c, p: a.p + b.p })));
      const shown = termsStr(list);
      const single = factors.some((f) => f.length === 1);
      steps.push(step(`${body.replace(/\s+/g, '')} = ${shown}`, single
        ? t(lang, 'Multiply every term inside the bracket by the term outside it.', 'Darabkan setiap sebutan dalam kurungan dengan sebutan di luar kurungan.')
        : t(lang, 'Multiply every term in the first bracket by every term in the second.', 'Darabkan setiap sebutan dalam kurungan pertama dengan setiap sebutan dalam kurungan kedua.')));
      if (shown !== final) steps.push(step(`= ${final}`, t(lang, 'Collect the like terms.', 'Kumpulkan sebutan serupa.')));
      return steps;
    }
    return [step(`= ${final}`, t(lang, 'Multiply out the brackets and collect the like terms.', 'Kembangkan kurungan dan kumpulkan sebutan serupa.'))];
  },
};

/* ---------- factorise ---------- */
export const factorise = {
  id: 'factorise',
  topic: 'Quadratic Expressions',
  level: 'Form2',
  match(text) {
    if (!/factori[sz]e|faktorkan/i.test(text)) return null;
    const body = stripLead(text).toLowerCase();
    return /x/.test(body) && !body.includes('=') && ALG_OK.test(body) ? { body } : null;
  },
  async solve({ body }, lang, ctx) {
    const { num } = await ctx.loadMath();
    const cs = polyCoeffs(makeFn(num, body, ['x']));
    if (!cs || cs.length < 2 || cs.length > 3 || !cs.every(isInt)) return null;
    const co = cs.map(Math.round);
    const steps = [];
    const g = co.reduce((u, v) => gcd(u, v), 0);
    const k = (co[0] < 0 ? -1 : 1) * g;
    const inner = co.map((v) => v / k);
    const lead = k === 1 ? '' : k === -1 ? '-' : String(k);
    if (k !== 1) {
      steps.push(step(`${polyStr(co)} = ${lead}(${polyStr(inner)})`, t(lang,
        k < 0
          ? (g > 1 ? `Take out the common factor ${g} and a minus sign so the first term is positive.` : 'Take out a minus sign so the first term is positive.')
          : `Take out the common factor ${k}.`,
        k < 0
          ? (g > 1 ? `Keluarkan faktor sepunya ${g} dan tanda tolak supaya sebutan pertama positif.` : 'Keluarkan tanda tolak supaya sebutan pertama positif.')
          : `Keluarkan faktor sepunya ${k}.`)));
    }
    const done = (inside, note) => steps.push(step(`${polyStr(co)} = ${lead}${inside}`, note));
    if (inner.length === 2) {
      if (k === 1) return [step(polyStr(co), t(lang, 'There is no common factor, so it cannot be factorised further.', 'Tiada faktor sepunya, jadi tidak boleh difaktorkan lagi.'))];
      return steps;
    }
    const [a, b, c] = inner;
    const D = b * b - 4 * a * c;
    if (c === 0) {
      done(`${paren('x')}(${a === 1 ? '' : a}x ${SIGN(b)} ${Math.abs(b)})`, t(lang, 'x is a common factor of both terms.', 'x ialah faktor sepunya bagi kedua-dua sebutan.'));
      return steps;
    }
    if (D < 0 || !isInt(Math.sqrt(D))) {
      steps.push(step(`${lead}(${polyStr(inner)})`, t(lang, 'No two whole numbers work, so the bracket cannot be factorised further.', 'Tiada dua nombor bulat yang sesuai, jadi kurungan ini tidak boleh difaktorkan lagi.')));
      return steps;
    }
    const S = Math.round(Math.sqrt(D));
    // Largest root first gives the familiar order, e.g. (x + 2)(x + 3).
    const roots = [rat(-b + S, 2 * a), rat(-b - S, 2 * a)].sort((x, y) => ratVal(y) - ratVal(x));
    const [f1, f2] = roots.map(factorStr);
    const same = roots[0].n === roots[1].n && roots[0].d === roots[1].d;
    const result = same ? `${paren(f1)}^2` : `${paren(f1)}${paren(f2)}`;
    if (b === 0) {
      done(result, t(lang, 'This is a difference of two squares: a² - b² = (a - b)(a + b).', 'Ini ialah beza dua kuasa dua: a² - b² = (a - b)(a + b).'));
    } else {
      let p = 0;
      const lim = Math.abs(a * c) + Math.abs(b);
      for (p = -lim; p <= lim; p += 1) if (p * (b - p) === a * c) break;
      steps.push(step(`${p} ${t(lang, 'and', 'dan')} ${b - p}`, t(lang, `Find two numbers that multiply to a × c = ${a * c} and add to b = ${b}.`, `Cari dua nombor yang hasil darabnya a × c = ${a * c} dan hasil tambahnya b = ${b}.`)));
      if (a !== 1) {
        const split = termsStr([{ c: a, p: 2 }, { c: p, p: 1 }, { c: b - p, p: 1 }, { c, p: 0 }]);
        steps.push(step(split, t(lang, 'Split the middle term using those two numbers.', 'Pecahkan sebutan tengah menggunakan dua nombor itu.')));
      }
      done(result, a === 1
        ? t(lang, 'Use those numbers in the two brackets.', 'Guna nombor itu dalam dua kurungan.')
        : t(lang, 'Factorise by grouping: take a common factor out of each pair.', 'Faktorkan secara kumpulan: keluarkan faktor sepunya daripada setiap pasangan.'));
    }
    return steps;
  },
};

/* ---------- linear inequality ---------- */
const SHOW_OP = { '<': '<', '>': '>', '<=': '≤', '>=': '≥' };
const FLIP_OP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };

export const inequality = {
  id: 'inequality',
  topic: 'Linear Equations',
  level: 'Form1',
  match(text) {
    const body = stripLead(text).toLowerCase().replace(/≤/g, '<=').replace(/≥/g, '>=');
    const m = body.match(/^([^<>]+?)(<=|>=|<|>)([^<>=]+)$/);
    if (!m || !/x/.test(m[1] + m[3])) return null;
    const side = /^[\dx+\-*/().\s]+$/;
    return side.test(m[1]) && side.test(m[3]) ? { l: m[1], op: m[2], r: m[3] } : null;
  },
  async solve({ l, op, r }, lang, ctx) {
    const { num } = await ctx.loadMath();
    const f = makeFn(num, `(${l})-(${r})`, ['x']);
    const c = f(0);
    const a = f(1) - c;
    if (![a, c].every(Number.isFinite) || Math.abs(f(2) - (2 * a + c)) > 1e-9 || Math.abs(a) < 1e-12) return null;
    const rhs = -c;
    const steps = [
      step(`${polyStr([a, 0]).replace(/^(-?)1?x$/, '$1x')} ${SHOW_OP[op]} ${numStr(rhs)}`, t(lang,
        'Collect the x terms on one side and the plain numbers on the other.',
        'Kumpulkan sebutan x di satu belah dan nombor biasa di belah lain.')),
    ];
    if (a === 1) return steps;
    const finalOp = a < 0 ? FLIP_OP[op] : op;
    steps.push(step(`x ${SHOW_OP[finalOp]} ${numStr(rhs / a)}`, a < 0
      ? t(lang, `Divide both sides by ${fmt(a)}. Dividing by a negative number flips the inequality sign.`, `Bahagikan kedua-dua belah dengan ${fmt(a)}. Membahagi dengan nombor negatif menterbalikkan tanda ketaksamaan.`)
      : t(lang, `Divide both sides by ${fmt(a)}.`, `Bahagikan kedua-dua belah dengan ${fmt(a)}.`)));
    return steps;
  },
};

/* ---------- simultaneous linear equations ---------- */
export const simultaneous = {
  id: 'simultaneous',
  topic: 'Linear Equations',
  level: 'Form2',
  match(text) {
    const s = prep(text)
      .toLowerCase()
      .replace(/(?:equations?|persamaan)\s*\(?\d?\)?\s*[:.]?/g, ' ')
      // OCR may join two equations on one line: "h + 2k = 5 2h + 3k = 8"
      .replace(/(=\s*-?\d+(?:\.\d+)?)[ \t]+(?=[\da-z(])/g, '$1\n');
    // Split into clauses, then pull the equation out of each one, so sentences like
    // "It is given that 2x = 8 and 3x + y = 15. Calculate the value of y." work.
    // Words (2+ letters) become '#', which ends an equation; single letters are variables.
    const eqs = s
      .split(/\n|;|,|&|\band\b|\bdan\b|\.(?=\s|$)/)
      .map((clause) => {
        const c = clause
          .replace(/^\s*\(\s*[a-z0-9]\s*\)\s*/, '') // part labels such as "(b)" or "(1)"
          .replace(/[a-z]{2,}/g, '#')
          .replace(/\b[ai]\b(?=\s+[\d(])/g, '#'); // the article "a" / pronoun "I"
        return (c.match(/[\da-z+\-*/().\s]+=[\da-z+\-*/().\s]+/) || [''])[0].trim();
      })
      .filter((e) => e.includes('='));
    if (eqs.length !== 2 || !eqs.every((e) => (e.match(/=/g) || []).length === 1)) return null;
    // Exactly two different variable letters (x/y, h/k, a/b ...).
    const names = [];
    for (const ch of eqs.join(' ').match(/[a-z]/g) || []) if (!names.includes(ch)) names.push(ch);
    if (names.length !== 2) return null;
    const toXY = (e) => e.replace(/[a-z]/g, (ch) => (ch === names[0] ? 'x' : 'y'));
    return { eqs: eqs.map(toXY), names };
  },
  async solve({ eqs, names }, lang, ctx) {
    const { num } = await ctx.loadMath();
    const rows = [];
    let cleared = false;
    for (const e of eqs) {
      const [l, r] = e.split('=');
      const f = makeFn(num, `(${l})-(${r})`, ['x', 'y']);
      const c = f(0, 0);
      const a = f(1, 0) - c;
      const b = f(0, 1) - c;
      if (![a, b, c].every(Number.isFinite) || Math.abs(f(2, 3) - (2 * a + 3 * b + c)) > 1e-9) return null;
      const k = intScale([a, b, c]);
      if (!k) return null;
      if (k > 1) cleared = true;
      rows.push([Math.round(a * k), Math.round(b * k), Math.round(-c * k)]);
    }
    const steps = solveSystem(rows, cleared, lang);
    if (!steps || (names[0] === 'x' && names[1] === 'y')) return steps;
    // Show the student's own variable letters instead of x and y.
    const rename = (s) => s.replace(/([a-z]?)([xy])(?![a-z])/g, (m, before, v) => (before ? m : names[v === 'x' ? 0 : 1]));
    return steps.map((st) => ({ working: rename(st.working), explanation: rename(st.explanation) }));
  },
};

const subLine = (a, b, y, c, x) => {
  const yTerm = Math.abs(b) === 1 ? ratStr(y) : `${Math.abs(b)}(${ratStr(y)})`;
  const mid = b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${yTerm}`;
  return `${linStr([[a, 'x']])}${mid} = ${c}  →  x = ${ratStr(x)}`;
};
const eqLine = ([a, b, c]) => `${linStr([[a, 'x'], [b, 'y']])} = ${c}`;

function solveSystem(rows, cleared, lang) {
  const [[a1, b1, c1], [a2, b2, c2]] = rows;
  if (a1 * b2 - a2 * b1 === 0) return null;
  const steps = [
    step(`(1) ${eqLine(rows[0])},   (2) ${eqLine(rows[1])}`, cleared
      ? t(lang, 'Write both equations as ax + by = c, clearing any fractions or decimals first.', 'Tulis kedua-dua persamaan sebagai ax + by = c, selepas menghapuskan pecahan atau perpuluhan.')
      : t(lang, 'Write both equations as ax + by = c and label them (1) and (2).', 'Tulis kedua-dua persamaan sebagai ax + by = c dan labelkan (1) dan (2).')),
  ];
  let x;
  let y;
  if (b1 === 0 || b2 === 0) {
    // One equation has only x: it gives x directly, then substitute into the other.
    const first = b1 === 0 ? 0 : 1;
    const [af, , cf] = rows[first];
    const [as, bs, cs] = rows[1 - first];
    x = rat(cf, af);
    steps.push(step(`x = ${cf} ÷ ${af} = ${ratStr(x)}`, t(lang, `Equation (${first + 1}) has no y, so it gives x directly.`, `Persamaan (${first + 1}) tiada y, jadi ia terus memberi x.`)));
    y = rat(cs * x.d - as * x.n, bs * x.d);
    const xTerm = Math.abs(as) === 1 ? ratStr(x) : `${Math.abs(as)}(${ratStr(x)})`;
    const lead = `${as < 0 ? '-' : ''}${xTerm}`;
    steps.push(step(`${as === 0 ? '' : `${lead} + `}${linStr([[bs, 'y']])} = ${cs}  →  y = ${ratStr(y)}`.replace('+ -', '- '), t(lang, `Put x into equation (${2 - first}) and solve for y.`, `Gantikan x ke dalam persamaan (${2 - first}) dan selesaikan untuk y.`)));
  } else if (a1 !== 0 && a2 !== 0) {
    const L = (Math.abs(a1) * Math.abs(a2)) / gcd(a1, a2);
    const [k1, k2] = [L / Math.abs(a1), L / Math.abs(a2)];
    const s1 = rows[0].map((v) => v * k1);
    const s2 = rows[1].map((v) => v * k2);
    if (k1 > 1 || k2 > 1) {
      const scaled = [k1 > 1 && `(1) × ${k1}: ${eqLine(s1)}`, k2 > 1 && `(2) × ${k2}: ${eqLine(s2)}`].filter(Boolean);
      steps.push(step(scaled.join(',   '), t(lang, 'Multiply the equations so the x terms are the same size.', 'Darabkan persamaan supaya sebutan x sama besar.')));
    }
    const sub = s1[0] === s2[0];
    const dy = sub ? s1[1] - s2[1] : s1[1] + s2[1];
    const rhs = sub ? s1[2] - s2[2] : s1[2] + s2[2];
    steps.push(step(`${sub ? '(1) − (2)' : '(1) + (2)'}: ${linStr([[dy, 'y']])} = ${rhs}`, sub
      ? t(lang, 'The x terms have the same sign, so subtract to remove x.', 'Sebutan x bertanda sama, jadi tolak untuk menghapuskan x.')
      : t(lang, 'The x terms have opposite signs, so add to remove x.', 'Sebutan x bertanda bertentangan, jadi tambah untuk menghapuskan x.')));
    y = rat(rhs, dy);
    steps.push(step(`y = ${rhs} ÷ ${dy} = ${ratStr(y)}`, t(lang, 'Solve for y.', 'Selesaikan untuk y.')));
    x = rat(c1 * y.d - b1 * y.n, a1 * y.d);
    steps.push(step(subLine(a1, b1, y, c1, x), t(lang, 'Put y back into equation (1) and solve for x.', 'Gantikan y ke dalam persamaan (1) dan selesaikan untuk x.')));
  } else {
    const first = a1 === 0 ? 0 : 1;
    const [, bf, cf] = rows[first];
    const [as, bs, cs] = rows[1 - first];
    y = rat(cf, bf);
    steps.push(step(`y = ${cf} ÷ ${bf} = ${ratStr(y)}`, t(lang, `Equation (${first + 1}) has no x, so it gives y directly.`, `Persamaan (${first + 1}) tiada x, jadi ia terus memberi y.`)));
    x = rat(cs * y.d - bs * y.n, as * y.d);
    steps.push(step(subLine(as, bs, y, cs, x), t(lang, `Put y into equation (${2 - first}) and solve for x.`, `Gantikan y ke dalam persamaan (${2 - first}) dan selesaikan untuk x.`)));
  }
  steps.push(step(`x = ${ratStr(x)},  y = ${ratStr(y)}`, t(lang, 'These values satisfy both equations.', 'Nilai-nilai ini memuaskan kedua-dua persamaan.')));
  return steps;
}

/**
 * Shared helpers for the rule-based (no-LLM) solvers.
 * Every solver returns steps shaped { working, explanation }.
 */
export const t = (lang, en, ms) => (lang === 'ms' ? ms : en);
export const step = (working, explanation) => ({ working, explanation });

export const NUM = String.raw`\d+(?:\.\d+)?`;
export const NUM_G = /-?\d+(?:\.\d+)?/g;

export const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);
export const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-9;
export const fmt = (v) => String(Number(Number(v).toFixed(6)));
export const fmt2 = (v) => String(Number(Number(v).toFixed(2)));

/** Normalise unicode maths symbols; optionally drop thousands separators. */
export function prep(text, { thousands = true } = {}) {
  let s = String(text ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/\u00a0/g, ' ');
  if (thousands) s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  return s;
}

const LEAD_RE = new RegExp(
  '^(?:\\s*(?:please|calculate|evaluate|compute|solve|simplify|expand|factori[sz]e|find|' +
    "what is|what's|work out|express|determine|hitung|selesaikan|permudahkan|kembangkan|" +
    'faktorkan|cari|berapakah|apakah|nilaikan|for\\s+[xy]|bagi\\s+[xy]|' +
    '(?:the\\s+)?(?:following|simultaneous\\s+equations?|equations?|expression|' +
    'quadratic\\s+equation|inequality))\\b[:\\s,]*)+',
  'i'
);

/** Remove leading command words ("Solve", "Find"...) and trailing "= ?". */
export function stripLead(text) {
  return prep(text).replace(LEAD_RE, '').replace(/[=?\s.]+$/, '').trim();
}

/** Exact rational {n, d} with d > 0. */
export function rat(n, d) {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(Math.abs(n), d) || 1;
  return { n: n / g, d: d / g };
}
export const ratStr = (r) => (r.d === 1 ? String(r.n) : `${r.n}/${r.d}`);
export const ratVal = (r) => r.n / r.d;

/** Rational form of v if it has a small denominator, else null. */
export function asRat(v) {
  if (isInt(v)) return rat(Math.round(v), 1);
  for (let d = 2; d <= 120; d += 1) if (isInt(v * d)) return rat(Math.round(v * d), d);
  return null;
}
export function numStr(v) {
  const r = asRat(v);
  return r ? ratStr(r) : fmt(v);
}

/* ---------- algebra helpers ---------- */

/** Render [{c, p}] as "x^2 + 3x - 4" (order preserved, zero terms skipped). */
export function termsStr(list, v = 'x') {
  let out = '';
  for (const { c, p } of list) {
    if (Math.abs(c) < 1e-12) continue;
    const abs = Math.abs(c);
    const coef = abs === 1 && p > 0 ? '' : fmt(abs);
    const body = p === 0 ? fmt(abs) : p === 1 ? `${coef}${v}` : `${coef}${v}^${p}`;
    out += out ? ` ${c < 0 ? '-' : '+'} ${body}` : `${c < 0 ? '-' : ''}${body}`;
  }
  return out || '0';
}

/** Coefficients highest power first, e.g. [1, -5, 6] -> "x^2 - 5x + 6". */
export const polyStr = (cs, v = 'x') =>
  termsStr(cs.map((c, i) => ({ c, p: cs.length - 1 - i })), v);

/** [[2,'x'],[-1,'y']] -> "2x - y". */
export function linStr(pairs) {
  let out = '';
  for (const [c, v] of pairs) {
    if (c === 0) continue;
    const abs = Math.abs(c);
    const body = `${abs === 1 ? '' : fmt(abs)}${v}`;
    out += out ? ` ${c < 0 ? '-' : '+'} ${body}` : `${c < 0 ? '-' : ''}${body}`;
  }
  return out || '0';
}

/** Compile `expr` with mathjs (number mode) into a function of `vars`. */
export function makeFn(math, expr, vars) {
  const node = math.parse(expr).compile();
  return (...vals) => {
    const scope = {};
    vars.forEach((name, i) => {
      scope[name] = vals[i];
    });
    const r = node.evaluate(scope);
    return typeof r === 'number' ? r : NaN;
  };
}

/**
 * Recover polynomial coefficients (degree <= 3) by sampling f, then verify at
 * extra points. Returns highest power first with leading zeros trimmed, or null.
 */
export function polyCoeffs(f) {
  const [f0, f1, f2, f3] = [0, 1, 2, 3].map((x) => f(x));
  if (![f0, f1, f2, f3].every(Number.isFinite)) return null;
  const c3 = (f3 - 3 * f2 + 3 * f1 - f0) / 6;
  const c2 = (f2 - 2 * f1 + f0) / 2 - 3 * c3;
  const c1 = f1 - f0 - c2 - c3;
  const at = (x) => f0 + c1 * x + c2 * x * x + c3 * x ** 3;
  const ok = [4, -1, 0.5, -2.5].every((x) => {
    const v = f(x);
    return Number.isFinite(v) && Math.abs(v - at(x)) < 1e-6 * (1 + Math.abs(v));
  });
  if (!ok) return null;
  const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(10)));
  const cs = [c3, c2, c1, f0].map(clean);
  while (cs.length > 1 && cs[0] === 0) cs.shift();
  return cs;
}

/** Smallest k (1..120) making every value an integer, else null. */
export function intScale(vals) {
  for (let k = 1; k <= 120; k += 1) if (vals.every((v) => isInt(v * k))) return k;
  return null;
}

export const paren = (s) => (/\s/.test(s) ? `(${s})` : s);

/** Factor "dx - n" for root n/d. */
export function factorStr(r) {
  const xs = r.d === 1 ? 'x' : `${r.d}x`;
  if (r.n === 0) return xs;
  return `${xs} ${r.n > 0 ? '-' : '+'} ${Math.abs(r.n)}`;
}

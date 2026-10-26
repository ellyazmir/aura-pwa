/** Fraction rules: a/b ± × ÷ c/d (mixed numbers allowed) and simplifying a/b. */
import { t, step, gcd, lcm, stripLead } from './util.js';

const MIXED = String.raw`\d+\s+\d+\s*/\s*\d+`;
const FRC = String.raw`\d+\s*/\s*\d+`;
const OPN = `(?:${MIXED}|${FRC}|\\d+)`;
const OP_RE = new RegExp(`^(${OPN})\\s*([+\\-×÷*x])\\s*(${OPN})$`, 'i');
const ONE_RE = new RegExp(`^(${FRC})$`);

function operand(str) {
  const s = str.trim();
  let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const d = +m[3];
    return d ? { n: +m[1] * d + +m[2], d, mixed: true, raw: `${+m[1]} ${+m[2]}/${d}` } : null;
  }
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[2] ? { n: +m[1], d: +m[2] } : null;
  return /^\d+$/.test(s) ? { n: +s, d: 1 } : null;
}

const fr = (n, d) => (d === 1 ? `${n}` : `${n}/${d}`);
const mixed = (n, d) => {
  const a = Math.abs(n);
  if (d !== 1 && a > d) {
    const w = Math.floor(a / d);
    const r = a % d;
    return `${n < 0 ? '-' : ''}${w}${r ? ` ${r}/${d}` : ''}`;
  }
  return fr(n, d);
};

export const fractions = {
  id: 'fractions',
  topic: 'Fractions',
  level: 'Year5',
  match(text) {
    const s = stripLead(text);
    let m = s.match(OP_RE);
    if (m && s.includes('/')) {
      const A = operand(m[1]);
      const B = operand(m[3]);
      if (!A || !B) return null;
      const op = { '+': 'add', '-': 'sub', '÷': 'div' }[m[2]] || 'mul';
      return { A, B, op };
    }
    m = s.match(ONE_RE);
    if (m && /simplif|permudah|lowest terms|simplest|termudah/i.test(text)) {
      const A = operand(m[1]);
      return A ? { A, op: 'simplify' } : null;
    }
    return null;
  },
  solve({ A, B, op }, lang) {
    if (op === 'simplify') {
      const g = gcd(A.n, A.d);
      if (g === 1) {
        return [step(fr(A.n, A.d), t(lang, 'The top and bottom share no common factor, so it is already in its simplest form.', 'Pengangka dan penyebut tiada faktor sepunya, jadi pecahan ini sudah dalam bentuk termudah.'))];
      }
      return [step(`${fr(A.n, A.d)} = ${fr(A.n / g, A.d / g)}`, t(lang, `Divide the top and bottom by their HCF, ${g}.`, `Bahagikan pengangka dan penyebut dengan FSTB, ${g}.`))];
    }
    const steps = [];
    const conv = [A, B].filter((x) => x.mixed).map((x) => `${x.raw} = ${x.n}/${x.d}`);
    if (conv.length) {
      steps.push(step(conv.join(',  '), t(lang, 'Change mixed numbers into improper fractions: whole × denominator + numerator.', 'Tukarkan nombor bercampur kepada pecahan tak wajar: nombor bulat × penyebut + pengangka.')));
    }
    const sym = { add: '+', sub: '−', mul: '×', div: '÷' }[op];
    let n;
    let d;
    if (op === 'add' || op === 'sub') {
      const L = lcm(A.d, B.d);
      const na = A.n * (L / A.d);
      const nb = B.n * (L / B.d);
      if (A.d !== B.d) {
        steps.push(step(`${fr(A.n, A.d)} ${sym} ${fr(B.n, B.d)} = ${na}/${L} ${sym} ${nb}/${L}`, t(lang, `Make the denominators equal. The LCM of ${A.d} and ${B.d} is ${L}.`, `Samakan penyebut. GSTK bagi ${A.d} dan ${B.d} ialah ${L}.`)));
      }
      n = op === 'add' ? na + nb : na - nb;
      d = L;
      steps.push(step(`= (${na} ${sym} ${nb})/${L} = ${n}/${L}`, op === 'add'
        ? t(lang, 'Add the numerators and keep the denominator.', 'Tambah pengangka dan kekalkan penyebut.')
        : t(lang, 'Subtract the numerators and keep the denominator.', 'Tolak pengangka dan kekalkan penyebut.')));
    } else if (op === 'mul') {
      n = A.n * B.n;
      d = A.d * B.d;
      steps.push(step(`${fr(A.n, A.d)} × ${fr(B.n, B.d)} = (${A.n} × ${B.n})/(${A.d} × ${B.d}) = ${n}/${d}`, t(lang, 'Multiply the numerators together and the denominators together.', 'Darabkan pengangka dengan pengangka dan penyebut dengan penyebut.')));
    } else {
      if (B.n === 0) return null;
      steps.push(step(`${fr(A.n, A.d)} ÷ ${fr(B.n, B.d)} = ${fr(A.n, A.d)} × ${B.d}/${B.n}`, t(lang, 'To divide by a fraction, flip it upside down and multiply.', 'Untuk membahagi dengan pecahan, songsangkan pecahan itu dan darabkan.')));
      n = A.n * B.d;
      d = A.d * B.n;
      steps.push(step(`= (${A.n} × ${B.d})/(${A.d} × ${B.n}) = ${n}/${d}`, t(lang, 'Multiply the numerators and the denominators.', 'Darabkan pengangka dan penyebut.')));
    }
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    if (g > 1) {
      n /= g;
      d /= g;
      steps.push(step(`= ${fr(n, d)}`, t(lang, `Simplify by dividing the top and bottom by ${g}.`, `Permudahkan dengan membahagi pengangka dan penyebut dengan ${g}.`)));
    }
    if (d !== 1 && Math.abs(n) > d) {
      steps.push(step(`= ${mixed(n, d)}`, t(lang, 'Write the improper fraction as a mixed number.', 'Tulis pecahan tak wajar sebagai nombor bercampur.')));
    }
    return steps;
  },
};

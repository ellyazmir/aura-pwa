/** Whole-number rules: HCF/LCM, factors, prime factors, rounding, standard form. */
import { t, step, gcd, fmt, prep } from './util.js';

function primeFactors(n) {
  const f = [];
  let m = n;
  for (let p = 2; p * p <= m; p += 1) {
    while (m % p === 0) {
      f.push(p);
      m /= p;
    }
  }
  if (m > 1) f.push(m);
  return f;
}
const counts = (arr) => {
  const m = new Map();
  arr.forEach((p) => m.set(p, (m.get(p) || 0) + 1));
  return m;
};
const prod = (arr) => (arr.length ? arr.join(' × ') : '1');
const power = (arr) => {
  const parts = [...counts(arr)].map(([p, k]) => (k > 1 ? `${p}^${k}` : String(p)));
  return parts.length ? parts.join(' × ') : '1';
};

export const hcfLcm = {
  id: 'hcf-lcm',
  topic: 'Whole Numbers',
  level: 'Year5',
  match(text) {
    const s = prep(text).toLowerCase();
    const ints = (s.match(/\d+(?:\.\d+)?/g) || []).filter((v) => !v.includes('.')).map(Number);
    const isH = /\bhcf\b|\bgcd\b|\bgcf\b|\bfstb\b|highest common factor|greatest common|faktor sepunya/.test(s);
    const isL = /\blcm\b|\bgstk\b|lowest common multiple|least common multiple|gandaan sepunya/.test(s);
    if (isH || isL) {
      const ok = ints.length >= 2 && ints.length <= 4 && ints.every((n) => n > 0 && n <= 1e6);
      return ok ? { kind: isH && isL ? 'both' : isH ? 'hcf' : 'lcm', nums: ints } : null;
    }
    if (/prime factors?|faktor perdana/.test(s) && ints.length === 1 && ints[0] >= 2) {
      return { kind: 'prime', n: ints[0] };
    }
    const fm = s.match(/\bfactors?\s+(?:of|for)\s+(\d+)|faktor\s+(?:bagi|untuk)\s+(\d+)/);
    const n = fm ? Number(fm[1] || fm[2]) : 0;
    return n >= 1 && n <= 1e6 ? { kind: 'factors', n } : null;
  },
  solve(p, lang) {
    if (p.kind === 'prime') {
      const f = primeFactors(p.n);
      if (f.length === 1) {
        return [step(`${p.n}`, t(lang, `${p.n} is a prime number. Its only factors are 1 and ${p.n}.`, `${p.n} ialah nombor perdana. Faktornya hanya 1 dan ${p.n}.`))];
      }
      const ladder = [];
      let m = p.n;
      f.forEach((q) => {
        ladder.push(`${m} ÷ ${q} = ${m / q}`);
        m /= q;
      });
      return [
        step(ladder.join(',  '), t(lang, 'Keep dividing by the smallest prime that fits until you reach 1.', 'Teruskan membahagi dengan nombor perdana terkecil yang boleh sehingga mencapai 1.')),
        step(`${p.n} = ${prod(f)}`, t(lang, 'Write the primes you used as a product.', 'Tulis nombor perdana yang digunakan sebagai hasil darab.')),
        ...(new Set(f).size < f.length
          ? [step(`${p.n} = ${power(f)}`, t(lang, 'Use powers for repeated primes.', 'Guna kuasa untuk faktor perdana yang berulang.'))]
          : []),
      ];
    }
    if (p.kind === 'factors') {
      const small = [];
      for (let i = 1; i * i <= p.n; i += 1) if (p.n % i === 0) small.push(i);
      const all = [...new Set([...small, ...small.map((i) => p.n / i)])].sort((a, b) => a - b);
      return [
        step(small.map((i) => `${i} × ${p.n / i}`).join(',  '), t(lang, 'Find pairs of numbers that multiply to give the number.', 'Cari pasangan nombor yang hasil darabnya ialah nombor itu.')),
        step(all.join(', '), t(lang, `These are all the factors of ${p.n}.`, `Ini semua faktor bagi ${p.n}.`)),
      ];
    }
    return hcfLcmSteps(p, lang);
  },
};

function hcfLcmSteps({ kind, nums }, lang) {
  const facs = nums.map(primeFactors);
  const maps = facs.map(counts);
  const primes = [...new Set(facs.flat())].sort((a, b) => a - b);
  const H = t(lang, 'HCF', 'FSTB');
  const L = t(lang, 'LCM', 'GSTK');
  const steps = [
    step(
      nums.map((n, i) => `${n} = ${prod(facs[i])}`).join(',  '),
      t(lang, 'Write each number as a product of prime factors.', 'Tulis setiap nombor sebagai hasil darab faktor perdana.')
    ),
  ];
  const pick = (fn) => {
    const out = [];
    primes.forEach((q) => {
      const k = fn(...maps.map((m) => m.get(q) || 0));
      for (let i = 0; i < k; i += 1) out.push(q);
    });
    return out;
  };
  const times = (a) => a.reduce((x, y) => x * y, 1);
  if (kind === 'hcf' || kind === 'both') {
    const common = pick(Math.min);
    steps.push(
      step(prod(common), t(lang, 'Pick the prime factors that appear in every number.', 'Pilih faktor perdana yang terdapat dalam semua nombor.')),
      step(`${H} = ${prod(common)} = ${times(common)}`, t(lang, 'Multiply the common prime factors.', 'Darabkan faktor perdana sepunya.'))
    );
  }
  if (kind === 'lcm' || kind === 'both') {
    const all = pick(Math.max);
    steps.push(
      step(power(all), t(lang, 'Take every prime factor, using the highest power it has in any number.', 'Ambil setiap faktor perdana dengan kuasa tertinggi dalam mana-mana nombor.')),
      step(`${L} = ${prod(all)} = ${times(all)}`, t(lang, 'Multiply them together.', 'Darabkan semuanya.'))
    );
  }
  return steps;
}

/* ---------- rounding ---------- */
const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands'];
const PLACE_MS = ['sa', 'puluh', 'ratus', 'ribu', 'puluh ribu'];

export const rounding = {
  id: 'rounding',
  topic: 'Whole Numbers',
  level: 'Year4',
  match(text) {
    let s = prep(text).toLowerCase();
    if (!/\bround|bundar/.test(s)) return null;
    let target = null;
    const take = (re, fn) => {
      const m = s.match(re);
      if (m && !target) {
        target = fn(m);
        s = s.replace(m[0], ' ');
      }
    };
    take(/(\d+)\s*(?:decimal places?|decimal point|d\.p\.?|dp|tempat perpuluhan)/, (m) => ({ dp: +m[1] }));
    take(/nearest\s+(10000|1000|100|10)\b/, (m) => ({ k: String(m[1]).length - 1 }));
    take(/(?:nearest|terdekat)\s+(?:ten thousand|puluh ribu)/, () => ({ k: 4 }));
    take(/(?:nearest|terdekat)\s+(?:thousand|ribu)/, () => ({ k: 3 }));
    take(/(?:nearest|terdekat)\s+(?:hundredth|perseratus)/, () => ({ dp: 2 }));
    take(/(?:nearest|terdekat)\s+(?:tenth|persepuluh)/, () => ({ dp: 1 }));
    take(/(?:nearest|terdekat)\s+(?:hundred|ratus)/, () => ({ k: 2 }));
    take(/(?:nearest|terdekat)\s+(?:ten|puluh)\b/, () => ({ k: 1 }));
    take(/(?:nearest|terdekat)\s+(?:whole number|integer|unit|nombor bulat)/, () => ({ k: 0 }));
    const nm = s.match(/\d+(?:\.\d+)?/);
    return target && nm ? { x: nm[0], ...target } : null;
  },
  solve(p, lang) {
    const [ip, fp = ''] = p.x.split('.');
    const num = Number(p.x);
    const isDp = p.dp !== undefined;
    const digit = isDp ? fp[p.dp] ?? '0' : p.k === 0 ? fp[0] ?? '0' : ip[ip.length - p.k] ?? '0';
    const up = Number(digit) >= 5;
    const where = isDp
      ? t(lang, `decimal place number ${p.dp + 1}`, `tempat perpuluhan ke-${p.dp + 1}`)
      : p.k === 0
        ? t(lang, 'first decimal place', 'tempat perpuluhan pertama')
        : t(lang, `${PLACE[p.k - 1]} place`, `tempat ${PLACE_MS[p.k - 1]}`);
    const res = isDp
      ? Number(`${Math.round(Number(`${num}e${p.dp}`))}e-${p.dp}`).toFixed(p.dp)
      : fmt(Math.round(num / 10 ** p.k) * 10 ** p.k);
    return [
      step(`${p.x}`, t(lang, `Look at the digit in the ${where}, just after the place we round to. It is ${digit}.`, `Lihat digit di ${where}, iaitu selepas tempat yang dibundarkan. Digitnya ialah ${digit}.`)),
      step(`${digit} ${up ? '≥' : '<'} 5`, up
        ? t(lang, 'The digit is 5 or more, so round up.', 'Digit ialah 5 atau lebih, jadi bundarkan ke atas.')
        : t(lang, 'The digit is less than 5, so keep the digit before it and round down.', 'Digit kurang daripada 5, jadi kekalkan digit sebelumnya dan bundarkan ke bawah.')),
      step(`${p.x} ≈ ${res}`, t(lang, 'This is the rounded number.', 'Ini nombor yang telah dibundarkan.')),
    ];
  },
};

export const standardForm = {
  id: 'standard-form',
  topic: 'Whole Numbers',
  level: 'Form1',
  match(text) {
    const s = prep(text).toLowerCase();
    if (!/standard form|bentuk piawai/.test(s)) return null;
    const m = s.match(/\d+(?:\.\d+)?/);
    return m && Number(m[0]) > 0 ? { x: m[0] } : null;
  },
  solve(p, lang) {
    const [mant, e] = Number(p.x).toExponential().split('e');
    const n = Number(e);
    return [
      step(
        `${mant}`,
        t(lang,
          `Move the decimal point ${Math.abs(n)} place(s) to the ${n > 0 ? 'left' : 'right'} so only one non-zero digit is before it.`,
          `Alihkan titik perpuluhan sebanyak ${Math.abs(n)} tempat ke ${n > 0 ? 'kiri' : 'kanan'} supaya hanya satu digit bukan sifar di hadapannya.`)
      ),
      step(`${p.x} = ${mant} × 10^${n}`, t(lang, 'The power of 10 is the number of places moved (negative if the number is below 1).', 'Kuasa 10 ialah bilangan tempat yang dialihkan (negatif jika nombor kurang daripada 1).')),
    ];
  },
};

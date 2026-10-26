/** Data and pattern rules: mean/median/mode/range, simple probability, sequences. */
import { t, step, gcd, fmt, NUM_G, prep, polyStr, numStr } from './util.js';

const listAfter = (s) => {
  const colon = s.lastIndexOf(':');
  if (colon >= 0) return s.slice(colon + 1);
  return s.replace(/^[\s\S]*?\b(?:of|for|bagi|daripada)\b/, '');
};

export const statistics = {
  id: 'statistics',
  topic: 'Statistics',
  level: 'Year6',
  match(text) {
    const s = prep(text, { thousands: false }).toLowerCase();
    const wants = [];
    if (/\b(?:mean|average|purata|min)\b/.test(s)) wants.push('mean');
    if (/\bmedian\b/.test(s)) wants.push('median');
    if (/\b(?:mode|mod)\b/.test(s)) wants.push('mode');
    if (/\b(?:range|julat)\b/.test(s)) wants.push('range');
    if (!wants.length) return null;
    const data = (listAfter(s).match(NUM_G) || []).map(Number);
    return data.length >= 2 && data.length <= 60 ? { wants, data } : null;
  },
  solve({ wants, data }, lang) {
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const steps = [];
    if (wants.includes('mean')) {
      const sum = data.reduce((a, b) => a + b, 0);
      steps.push(
        step(`${t(lang, 'Sum', 'Jumlah')} = ${data.join(' + ')} = ${fmt(sum)}`, t(lang, 'Add up all the values.', 'Tambah semua nilai.')),
        step(`${t(lang, 'Mean', 'Min')} = ${fmt(sum)} ÷ ${n} = ${fmt(sum / n)}`, t(lang, 'Divide the sum by how many values there are.', 'Bahagikan jumlah dengan bilangan nilai.'))
      );
    }
    if (wants.includes('median')) {
      steps.push(step(sorted.join(', '), t(lang, 'Arrange the values from smallest to largest.', 'Susun nilai dari yang terkecil ke terbesar.')));
      if (n % 2) {
        steps.push(step(`${t(lang, 'Median', 'Median')} = ${fmt(sorted[(n - 1) / 2])}`, t(lang, 'There is an odd number of values, so take the middle one.', 'Bilangan nilai ialah ganjil, jadi ambil nilai tengah.')));
      } else {
        const [a, b] = [sorted[n / 2 - 1], sorted[n / 2]];
        steps.push(step(`${t(lang, 'Median', 'Median')} = (${fmt(a)} + ${fmt(b)}) ÷ 2 = ${fmt((a + b) / 2)}`, t(lang, 'There is an even number of values, so find the mean of the two middle ones.', 'Bilangan nilai ialah genap, jadi cari min dua nilai tengah.')));
      }
    }
    if (wants.includes('mode')) {
      const tally = new Map();
      data.forEach((v) => tally.set(v, (tally.get(v) || 0) + 1));
      const top = Math.max(...tally.values());
      const modes = [...tally].filter(([, c]) => c === top).map(([v]) => v);
      steps.push(top === 1
        ? step(t(lang, 'No mode', 'Tiada mod'), t(lang, 'Every value appears only once, so there is no mode.', 'Setiap nilai muncul sekali sahaja, jadi tiada mod.'))
        : step(`${t(lang, 'Mode', 'Mod')} = ${modes.map(fmt).join(', ')}`, t(lang, `The value that appears most often (${top} times) is the mode.`, `Nilai yang paling kerap muncul (${top} kali) ialah mod.`)));
    }
    if (wants.includes('range')) {
      const [lo, hi] = [sorted[0], sorted[n - 1]];
      steps.push(step(`${t(lang, 'Range', 'Julat')} = ${fmt(hi)} − ${fmt(lo)} = ${fmt(hi - lo)}`, t(lang, 'Subtract the smallest value from the largest.', 'Tolak nilai terkecil daripada nilai terbesar.')));
    }
    return steps;
  },
};

const singular = (w) => w.replace(/s$/, '');

export const probability = {
  id: 'probability',
  topic: 'Probability',
  level: 'Form2',
  match(text) {
    const s = prep(text).toLowerCase();
    const qi = s.search(/probability|kebarangkalian|peluang/);
    if (qi < 0) return null;
    let items = [...s.matchAll(/(\d+)\s+([a-z]+)/g)].map((m) => ({ count: +m[1], word: m[2] }));
    const sumOthers = (i) => items.reduce((a, it, j) => (j === i ? a : a + it.count), 0);
    const totalIdx = items.findIndex((it, i) => items.length > 2 && it.count === sumOthers(i));
    if (totalIdx >= 0) items = items.filter((_, i) => i !== totalIdx);
    if (items.length < 2) return null;
    const qHead = s.slice(qi).split(/\d/)[0];
    const qWords = qHead.split(/[^a-z]+/).map(singular);
    const hits = items.filter((it) => qWords.includes(singular(it.word)));
    if (hits.length !== 1) return null;
    const total = items.reduce((a, it) => a + it.count, 0);
    const not = /\b(?:not|bukan|tidak)\b/.test(qHead);
    return { items, target: hits[0], total, not };
  },
  solve({ items, target, total, not }, lang) {
    const want = not ? total - target.count : target.count;
    const g = gcd(want, total) || 1;
    const simple = `${want / g}/${total / g}`;
    return [
      step(`${t(lang, 'Total', 'Jumlah')} = ${items.map((i) => i.count).join(' + ')} = ${total}`, t(lang, 'Count all the possible outcomes.', 'Kira semua kesudahan yang mungkin.')),
      step(`P = ${want}/${total}`, not
        ? t(lang, `Favourable outcomes = everything except ${target.word}: ${total} − ${target.count} = ${want}.`, `Kesudahan yang diingini = semua kecuali ${target.word}: ${total} − ${target.count} = ${want}.`)
        : t(lang, `Probability = favourable outcomes ÷ total outcomes. There are ${target.count} ${target.word}.`, `Kebarangkalian = kesudahan yang diingini ÷ jumlah kesudahan. Terdapat ${target.count} ${target.word}.`)),
      ...(g > 1 ? [step(`P = ${simple}`, t(lang, 'Simplify the fraction.', 'Permudahkan pecahan itu.'))] : []),
      step(`P ≈ ${fmt(want / total)}`, t(lang, 'As a decimal. A probability is always between 0 and 1.', 'Dalam bentuk perpuluhan. Kebarangkalian sentiasa antara 0 dengan 1.')),
    ];
  },
};

const SEQ_KW = /sequence|pattern|next (?:term|number)|nth term|sebutan|jujukan|pola|nombor seterusnya/;

export const sequence = {
  id: 'sequence',
  topic: 'Algebra',
  level: 'Form2',
  match(text) {
    let s = prep(text, { thousands: false }).toLowerCase();
    if (!SEQ_KW.test(s)) return null;
    const nm = s.match(/(\d+)(?:st|nd|rd|th)\s+term/) || s.match(/sebutan\s+ke-?\s*(\d+)/);
    s = s.replace(/(\d+)(?:st|nd|rd|th)\s+term/g, ' ').replace(/sebutan\s+ke-?\s*\d+/g, ' ');
    const colon = s.lastIndexOf(':');
    if (colon >= 0) s = s.slice(colon + 1);
    const nums = (s.match(NUM_G) || []).map(Number);
    return nums.length >= 3 ? { nums, nth: nm ? +nm[1] : null } : null;
  },
  solve({ nums, nth }, lang) {
    const diffs = nums.slice(1).map((v, i) => v - nums[i]);
    const next = nums.length + 1;
    const a = nums[0];
    if (diffs.every((d) => Math.abs(d - diffs[0]) < 1e-9)) {
      const d = diffs[0];
      const steps = [
        step(`${nums[1]} − ${nums[0]} = ${fmt(d)},  ${nums[2]} − ${nums[1]} = ${fmt(nums[2] - nums[1])}`, t(lang, 'Subtract each term from the next one. The difference is the same each time, so this is an arithmetic sequence.', 'Tolak setiap sebutan daripada sebutan seterusnya. Bezanya sama setiap kali, jadi ini jujukan aritmetik.')),
        step(`T(n) = a + (n − 1)d = ${fmt(a)} + (n − 1)(${fmt(d)}) = ${polyStr([d, a - d], 'n')}`, t(lang, 'Use the formula for the nth term with first term a and common difference d.', 'Guna rumus sebutan ke-n dengan sebutan pertama a dan beza sepunya d.')),
        step(`T(${next}) = ${fmt(nums[nums.length - 1] + d)}`, t(lang, 'Add the common difference to the last term to get the next term.', 'Tambah beza sepunya kepada sebutan terakhir untuk mendapat sebutan seterusnya.')),
      ];
      if (nth) steps.push(step(`T(${nth}) = ${fmt(a + (nth - 1) * d)}`, t(lang, `Put n = ${nth} into the formula.`, `Gantikan n = ${nth} ke dalam rumus.`)));
      return steps;
    }
    if (nums.every((v) => v !== 0)) {
      const r = nums[1] / nums[0];
      if (nums.slice(1).every((v, i) => Math.abs(v / nums[i] - r) < 1e-9)) {
        const steps = [
          step(`${nums[1]} ÷ ${nums[0]} = ${numStr(r)}`, t(lang, 'Divide each term by the one before it. The ratio is the same each time, so this is a geometric sequence.', 'Bahagikan setiap sebutan dengan sebutan sebelumnya. Nisbahnya sama setiap kali, jadi ini jujukan geometri.')),
          step(`T(n) = a × r^(n − 1) = ${fmt(a)} × (${numStr(r)})^(n − 1)`, t(lang, 'Use the formula for the nth term of a geometric sequence.', 'Guna rumus sebutan ke-n bagi jujukan geometri.')),
          step(`T(${next}) = ${fmt(nums[nums.length - 1] * r)}`, t(lang, 'Multiply the last term by the common ratio.', 'Darabkan sebutan terakhir dengan nisbah sepunya.')),
        ];
        if (nth) steps.push(step(`T(${nth}) = ${fmt(a * r ** (nth - 1))}`, t(lang, `Put n = ${nth} into the formula.`, `Gantikan n = ${nth} ke dalam rumus.`)));
        return steps;
      }
    }
    return null;
  },
};

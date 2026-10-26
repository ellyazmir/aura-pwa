/** Percentage and ratio rules. */
import { t, step, gcd, fmt, NUM, prep, stripLead } from './util.js';

const money = (rm, v) => (rm ? `RM${Number(v).toFixed(2)}` : fmt(v));

export const percent = {
  id: 'percent',
  topic: 'Percentages',
  level: 'Year6',
  match(text) {
    const rm = /rm\s*\d/i.test(text);
    const s = prep(text).toLowerCase().replace(/rm\s*(?=\d)/g, '');
    const re = (src) => new RegExp(src);
    let m = s.match(re(`(${NUM})\\s*(?:is what percent(?:age)?(?: of)?|as a percent(?:age)? of|as percent(?:age)? of|sebagai peratus(?:an)? daripada)\\s*(${NUM})`));
    if (m) return { kind: 'what', part: +m[1], whole: +m[2] };
    m = s.match(re(`what percent(?:age)?\\s+is\\s+(${NUM})\\s+of\\s+(${NUM})`));
    if (m) return { kind: 'what', part: +m[1], whole: +m[2] };
    m = s.match(re(`what percent(?:age)?\\s+of\\s+(${NUM})\\s+is\\s+(${NUM})`));
    if (m) return { kind: 'what', part: +m[2], whole: +m[1] };
    m = s.match(re(`(increase|raise|tambah(?:kan)?|decrease|reduce|kurangkan)\\s+(${NUM})\\s+(?:by|sebanyak|dengan)\\s+(${NUM})\\s*%`));
    if (m) return { kind: 'change', dir: /^(?:increase|raise|tambah)/.test(m[1]) ? 1 : -1, n: +m[2], p: +m[3] };
    const pm = s.match(re(`(${NUM})\\s*%`));
    if (pm && /discount|diskaun|rebat|\btax\b|cukai|\bgst\b|\bsst\b|service charge/.test(s)) {
      const rest = s.replace(pm[0], ' ').match(new RegExp(NUM, 'g')) || [];
      if (rest.length === 1) {
        return { kind: /discount|diskaun|rebat/.test(s) ? 'discount' : 'tax', p: +pm[1], price: +rest[0], rm };
      }
    }
    return null;
  },
  solve(p, lang) {
    if (p.kind === 'what') {
      if (!p.whole) return null;
      return [
        step(`${fmt(p.part)} ÷ ${fmt(p.whole)} = ${fmt(p.part / p.whole)}`, t(lang, 'Write the part as a fraction of the whole.', 'Tulis bahagian itu sebagai pecahan daripada keseluruhan.')),
        step(`${fmt(p.part / p.whole)} × 100% = ${fmt((p.part / p.whole) * 100)}%`, t(lang, 'Multiply by 100 to change it into a percentage.', 'Darab dengan 100 untuk menukarkannya kepada peratus.')),
      ];
    }
    if (p.kind === 'change') {
      const amt = (p.p / 100) * p.n;
      const out = p.n + p.dir * amt;
      return [
        step(`${fmt(p.p)}% × ${fmt(p.n)} = ${fmt(amt)}`, t(lang, 'Find the amount of the change first.', 'Cari jumlah perubahan dahulu.')),
        step(`${fmt(p.n)} ${p.dir > 0 ? '+' : '−'} ${fmt(amt)} = ${fmt(out)}`, p.dir > 0
          ? t(lang, 'Add the increase to the original amount.', 'Tambah kenaikan kepada jumlah asal.')
          : t(lang, 'Subtract the decrease from the original amount.', 'Tolak penurunan daripada jumlah asal.')),
      ];
    }
    const amt = (p.p / 100) * p.price;
    const disc = p.kind === 'discount';
    const out = disc ? p.price - amt : p.price + amt;
    return [
      step(`${fmt(p.p)}% × ${money(p.rm, p.price)} = ${money(p.rm, amt)}`, disc
        ? t(lang, 'Work out the discount.', 'Kira jumlah diskaun.')
        : t(lang, 'Work out the tax.', 'Kira jumlah cukai.')),
      step(`${money(p.rm, p.price)} ${disc ? '−' : '+'} ${money(p.rm, amt)} = ${money(p.rm, out)}`, disc
        ? t(lang, 'Subtract the discount from the original price.', 'Tolak diskaun daripada harga asal.')
        : t(lang, 'Add the tax to the original price.', 'Tambah cukai kepada harga asal.')),
    ];
  },
};

const RATIO_RE = /(\d+)\s*:\s*(\d+)(?:\s*:\s*(\d+))?/;
const SHARE_RE = /share|divide|split|bahagi|kongsi|agih|distribute/;
const TOK = '(?:\\d+(?:\\.\\d+)?|x)';
const PROP_RE = new RegExp(`^(${TOK})\\s*[:/]\\s*(${TOK})\\s*=\\s*(${TOK})\\s*[:/]\\s*(${TOK})$`);

export const ratio = {
  id: 'ratio',
  topic: 'Ratios',
  level: 'Year6',
  match(text) {
    const body = stripLead(text).toLowerCase().replace(/^x\s+(?:if|when|jika|apabila)\s+/, '');
    const pm = body.match(PROP_RE);
    if (pm && pm.slice(1).filter((v) => v === 'x').length === 1) return { kind: 'prop', v: pm.slice(1) };
    const s = prep(text).toLowerCase().replace(/rm\s*(?=\d)/g, '');
    const rm = s.match(RATIO_RE);
    if (!rm) return null;
    const parts = [rm[1], rm[2], rm[3]].filter(Boolean).map(Number);
    if (SHARE_RE.test(s)) {
      const rest = s.replace(rm[0], ' ').match(/\d+(?:\.\d+)?/g) || [];
      return rest.length ? { kind: 'share', parts, total: +rest[0] } : null;
    }
    return /simplif|permudah|simplest|termudah/.test(s) ? { kind: 'simplify', parts } : null;
  },
  solve(p, lang) {
    if (p.kind === 'simplify') {
      const g = p.parts.reduce(gcd);
      if (g === 0) return null;
      return [
        step(`HCF = ${g}`, t(lang, 'Find the highest number that divides every part of the ratio.', 'Cari nombor terbesar yang boleh membahagi setiap bahagian nisbah.')),
        step(`${p.parts.join(' : ')} = ${p.parts.map((x) => x / g).join(' : ')}`, t(lang, 'Divide every part by the HCF.', 'Bahagikan setiap bahagian dengan FSTB.')),
      ];
    }
    if (p.kind === 'share') {
      const sum = p.parts.reduce((a, b) => a + b, 0);
      if (!sum) return null;
      const one = p.total / sum;
      return [
        step(`${p.parts.join(' + ')} = ${sum} ${t(lang, 'parts', 'bahagian')}`, t(lang, 'Add the parts of the ratio to get the total number of parts.', 'Tambah semua bahagian nisbah untuk mendapat jumlah bahagian.')),
        step(`1 ${t(lang, 'part', 'bahagian')} = ${fmt(p.total)} ÷ ${sum} = ${fmt(one)}`, t(lang, 'Divide the total by the number of parts to find one part.', 'Bahagikan jumlah dengan bilangan bahagian untuk mencari satu bahagian.')),
        step(p.parts.map((x) => `${x} × ${fmt(one)} = ${fmt(x * one)}`).join(',  '), t(lang, 'Multiply each part of the ratio by the value of one part.', 'Darabkan setiap bahagian nisbah dengan nilai satu bahagian.')),
      ];
    }
    const [a, b, c, d] = p.v;
    const num = (v) => Number(v);
    const left = [a, d];
    const right = [b, c];
    const xOnLeft = left.includes('x');
    const known = xOnLeft ? right : left;
    const other = num((xOnLeft ? left : right).find((v) => v !== 'x'));
    const rhs = num(known[0]) * num(known[1]);
    if (!other) return null;
    return [
      step(`${a} × ${d} = ${b} × ${c}`, t(lang, 'Cross-multiply: the product of the outer terms equals the product of the inner terms.', 'Darab silang: hasil darab sebutan luar sama dengan hasil darab sebutan dalam.')),
      step(`${fmt(other)}x = ${fmt(rhs)}`, t(lang, 'Work out the numbers on each side.', 'Kira nombor di setiap belah.')),
      step(`x = ${fmt(rhs)} ÷ ${fmt(other)} = ${fmt(rhs / other)}`, t(lang, `Divide both sides by ${fmt(other)}.`, `Bahagikan kedua-dua belah dengan ${fmt(other)}.`)),
    ];
  },
};

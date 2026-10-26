/** Measurement and geometry rules: perimeter, area, volume, Pythagoras. */
import { t, step, fmt, fmt2, prep } from './util.js';

const NUMS = /\d+(?:\.\d+)?/g;
const NAMES = {
  length: ['length', 'long', 'panjang'],
  width: ['width', 'breadth', 'wide', 'lebar'],
  height: ['height', 'high', 'tall', 'tinggi', 'depth'],
  side: ['side', 'sisi'],
  base: ['base', 'tapak'],
  radius: ['radius', 'jejari'],
  diameter: ['diameter'],
};

/* spec: [dimensions, formula, substitution, calculation, power of unit, pi?] */
const SPECS = {
  'rectangle:area': { dims: ['length', 'width'], f: 'Area = length × width', ms: 'Luas = panjang × lebar', sub: (d) => `${d.length} × ${d.width}`, calc: (d) => d.length * d.width, pow: 2, level: 'Year4' },
  'rectangle:perimeter': { dims: ['length', 'width'], f: 'Perimeter = 2 × (length + width)', ms: 'Perimeter = 2 × (panjang + lebar)', sub: (d) => `2 × (${d.length} + ${d.width})`, calc: (d) => 2 * (d.length + d.width), pow: 1, level: 'Year4' },
  'square:area': { dims: ['side'], f: 'Area = side × side', ms: 'Luas = sisi × sisi', sub: (d) => `${d.side} × ${d.side}`, calc: (d) => d.side * d.side, pow: 2, level: 'Year4' },
  'square:perimeter': { dims: ['side'], f: 'Perimeter = 4 × side', ms: 'Perimeter = 4 × sisi', sub: (d) => `4 × ${d.side}`, calc: (d) => 4 * d.side, pow: 1, level: 'Year4' },
  'triangle:area': { dims: ['base', 'height'], f: 'Area = ½ × base × height', ms: 'Luas = ½ × tapak × tinggi', sub: (d) => `½ × ${d.base} × ${d.height}`, calc: (d) => 0.5 * d.base * d.height, pow: 2, level: 'Year5' },
  'triangle:perimeter': { dims: ['s1', 's2', 's3'], f: 'Perimeter = sum of the three sides', ms: 'Perimeter = jumlah tiga sisi', sub: (d) => `${d.s1} + ${d.s2} + ${d.s3}`, calc: (d) => d.s1 + d.s2 + d.s3, pow: 1, level: 'Year4' },
  'parallelogram:area': { dims: ['base', 'height'], f: 'Area = base × height', ms: 'Luas = tapak × tinggi', sub: (d) => `${d.base} × ${d.height}`, calc: (d) => d.base * d.height, pow: 2, level: 'Form1' },
  'trapezium:area': { dims: ['a', 'b', 'height'], f: 'Area = ½ × (a + b) × height', ms: 'Luas = ½ × (a + b) × tinggi', sub: (d) => `½ × (${d.a} + ${d.b}) × ${d.height}`, calc: (d) => 0.5 * (d.a + d.b) * d.height, pow: 2, level: 'Form1' },
  'circle:area': { dims: ['r'], f: 'Area = π × r × r', ms: 'Luas = π × j × j', sub: (d, pi) => `${pi.label} × ${d.r} × ${d.r}`, calc: (d, pi) => pi.val * d.r * d.r, pow: 2, pi: true, level: 'Year6' },
  'circle:circumference': { dims: ['r'], f: 'Circumference = 2 × π × r', ms: 'Lilitan = 2 × π × j', sub: (d, pi) => `2 × ${pi.label} × ${d.r}`, calc: (d, pi) => 2 * pi.val * d.r, pow: 1, pi: true, level: 'Year6' },
  'cuboid:volume': { dims: ['length', 'width', 'height'], f: 'Volume = length × width × height', ms: 'Isi padu = panjang × lebar × tinggi', sub: (d) => `${d.length} × ${d.width} × ${d.height}`, calc: (d) => d.length * d.width * d.height, pow: 3, level: 'Year5' },
  'cuboid:surface': { dims: ['length', 'width', 'height'], f: 'Surface area = 2 × (lw + lh + wh)', ms: 'Luas permukaan = 2 × (pl + pt + lt)', sub: (d) => `2 × (${d.length}×${d.width} + ${d.length}×${d.height} + ${d.width}×${d.height})`, calc: (d) => 2 * (d.length * d.width + d.length * d.height + d.width * d.height), pow: 2, level: 'Year6' },
  'cube:volume': { dims: ['side'], f: 'Volume = side × side × side', ms: 'Isi padu = sisi × sisi × sisi', sub: (d) => `${d.side} × ${d.side} × ${d.side}`, calc: (d) => d.side ** 3, pow: 3, level: 'Year5' },
  'cube:surface': { dims: ['side'], f: 'Surface area = 6 × side × side', ms: 'Luas permukaan = 6 × sisi × sisi', sub: (d) => `6 × ${d.side} × ${d.side}`, calc: (d) => 6 * d.side * d.side, pow: 2, level: 'Year6' },
  'cylinder:volume': { dims: ['r', 'height'], f: 'Volume = π × r × r × h', ms: 'Isi padu = π × j × j × t', sub: (d, pi) => `${pi.label} × ${d.r} × ${d.r} × ${d.height}`, calc: (d, pi) => pi.val * d.r * d.r * d.height, pow: 3, pi: true, level: 'Form2' },
  'cylinder:surface': { dims: ['r', 'height'], f: 'Total surface area = 2 × π × r × (r + h)', ms: 'Jumlah luas permukaan = 2 × π × j × (j + t)', sub: (d, pi) => `2 × ${pi.label} × ${d.r} × (${d.r} + ${d.height})`, calc: (d, pi) => 2 * pi.val * d.r * (d.r + d.height), pow: 2, pi: true, level: 'Form2' },
};

const SHAPES = [
  ['cylinder', /cylinder|silinder/],
  ['cuboid', /cuboid|kuboid|rectangular prism/],
  ['cube', /\bcube\b|kubus/],
  ['trapezium', /trapezium/],
  ['parallelogram', /parallelogram|segi empat selari/],
  ['triangle', /triangle|segi tiga/],
  ['circle', /circle|bulatan/],
  ['rectangle', /rectang|segi empat tepat/],
  ['square', /\bsquare\b|segi empat sama/],
];
const QUANTITIES = [
  ['surface', /surface area|luas permukaan/],
  ['volume', /volume|isi padu/],
  ['circumference', /circumference|lilitan/],
  ['area', /\barea\b|\bluas\b/],
  ['perimeter', /perimeter/],
];

/** Find a labelled number ("length 8", "5 cm wide"); returns {value, at} or null. */
function labelled(s, names) {
  const alt = names.join('|');
  let m = s.match(new RegExp(`(?:${alt})\\s*(?:of|is|are|=|:|ialah|adalah|bagi)?\\s*(\\d+(?:\\.\\d+)?)`));
  if (m) return { value: Number(m[1]), at: m.index + m[0].length - m[1].length };
  m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm|km|m|units?)?\\s*(?:${alt})\\b`));
  return m ? { value: Number(m[1]), at: m.index } : null;
}

function pickPi(s, r) {
  if (/22\s*\/\s*7/.test(s)) return { val: 22 / 7, label: '22/7' };
  if (/3\.142/.test(s)) return { val: 3.142, label: '3.142' };
  if (/3\.14\b/.test(s)) return { val: 3.14, label: '3.14' };
  return r !== undefined && Number.isInteger(r / 7) && r > 0
    ? { val: 22 / 7, label: '22/7' }
    : { val: 3.142, label: '3.142' };
}

function readDims(s, spec) {
  const blank = s.replace(/22\s*\/\s*7|3\.142|3\.14\b|π/g, (m) => ' '.repeat(m.length));
  const used = new Set();
  const dims = {};
  const grab = (key, names, scale = 1) => {
    const hit = labelled(blank, names);
    if (hit && !used.has(hit.at)) {
      used.add(hit.at);
      dims[key] = hit.value * scale;
    }
  };
  spec.dims.forEach((key) => {
    if (key === 'r') {
      grab('r', NAMES.radius);
      if (dims.r === undefined) grab('r', NAMES.diameter, 0.5);
    } else if (NAMES[key]) {
      grab(key, NAMES[key]);
    }
  });
  const rest = [...blank.matchAll(NUMS)].filter((m) => !used.has(m.index)).map((m) => Number(m[0]));
  spec.dims.forEach((key) => {
    if (dims[key] === undefined && rest.length) {
      const v = rest.shift();
      dims[key] = key === 'r' && /diameter/.test(s) ? v / 2 : v;
    }
  });
  return spec.dims.every((k) => Number.isFinite(dims[k]) && dims[k] > 0) ? dims : null;
}

export const shapes = {
  id: 'shapes',
  topic: 'Measurement',
  level: (p) => SPECS[p.key].level,
  match(text) {
    const s = prep(text).toLowerCase();
    if (/pythagoras|hypotenuse|hipotenus/.test(s)) return null;
    const shape = SHAPES.find(([, re]) => re.test(s));
    let quantity = QUANTITIES.find(([, re]) => re.test(s));
    if (!shape || !quantity) return null;
    if (shape[0] === 'circle' && quantity[0] === 'perimeter') quantity = ['circumference'];
    const key = `${shape[0]}:${quantity[0]}`;
    const spec = SPECS[key];
    if (!spec) return null;
    const dims = readDims(s, spec);
    if (!dims) return null;
    const unit = (s.match(/\d\s*(mm|cm|km|m)\b/) || [])[1] || '';
    return { key, dims, unit, s };
  },
  solve(p, lang) {
    const spec = SPECS[p.key];
    const pi = spec.pi ? pickPi(p.s, p.dims.r) : null;
    const raw = spec.calc(p.dims, pi);
    const value = spec.pi || !Number.isInteger(raw * 1000) ? fmt2(raw) : fmt(raw);
    const sup = { 1: '', 2: '²', 3: '³' }[spec.pow];
    const unit = p.unit ? ` ${p.unit}${sup}` : '';
    return [
      step(t(lang, spec.f, spec.ms), spec.pi
        ? t(lang, `Use the formula. Take π = ${pi.label}.`, `Guna rumus. Ambil π = ${pi.label}.`)
        : t(lang, 'Use the formula.', 'Guna rumus.')),
      step(`= ${spec.sub(p.dims, pi)}`, t(lang, 'Put the measurements into the formula.', 'Gantikan ukuran ke dalam rumus.')),
      step(`= ${value}${unit}`, t(lang, 'Calculate the answer.', 'Kira jawapan.')),
    ];
  },
};

function sqrtText(v) {
  const r = Math.sqrt(v);
  const r4 = Number(r.toFixed(4));
  return Math.abs(r4 * r4 - v) < 1e-9 ? `= ${fmt(r4)}` : `≈ ${fmt2(r)}`;
}

export const pythagoras = {
  id: 'pythagoras',
  topic: 'Geometry',
  level: 'Form2',
  match(text) {
    const s = prep(text).toLowerCase();
    const kw =
      /pythagoras|hypotenuse|hipotenus/.test(s) ||
      (/right[- ]angled|bersudut tegak/.test(s) && !/area|luas|perimeter/.test(s) && /side|sisi|length|panjang/.test(s));
    if (!kw) return null;
    const hm = s.match(/(?:hypotenuse|hipotenus)\s*(?:is|=|:|of|ialah|adalah)?\s*(\d+(?:\.\d+)?)/);
    if (hm) {
      const rest = s.replace(hm[0], ' ').match(NUMS) || [];
      const c = Number(hm[1]);
      const a = Number(rest[0]);
      return rest.length === 1 && a > 0 && c > a ? { kind: 'leg', c, a } : null;
    }
    const nums = (s.match(NUMS) || []).map(Number);
    return nums.length === 2 && nums.every((n) => n > 0) ? { kind: 'hyp', a: nums[0], b: nums[1] } : null;
  },
  solve(p, lang) {
    if (p.kind === 'hyp') {
      const sum = p.a * p.a + p.b * p.b;
      return [
        step('c² = a² + b²', t(lang, "Pythagoras' theorem: the square of the hypotenuse equals the sum of the squares of the other two sides.", 'Teorem Pythagoras: kuasa dua hipotenus sama dengan jumlah kuasa dua dua sisi yang lain.')),
        step(`c² = ${fmt(p.a)}² + ${fmt(p.b)}² = ${fmt(p.a * p.a)} + ${fmt(p.b * p.b)} = ${fmt(sum)}`, t(lang, 'Put in the two shorter sides.', 'Gantikan dua sisi yang lebih pendek.')),
        step(`c = √${fmt(sum)} ${sqrtText(sum)}`, t(lang, 'Take the square root.', 'Ambil punca kuasa dua.')),
      ];
    }
    const diff = p.c * p.c - p.a * p.a;
    return [
      step('a² = c² − b²', t(lang, 'Rearrange the theorem to find a shorter side.', 'Susun semula teorem untuk mencari sisi yang lebih pendek.')),
      step(`a² = ${fmt(p.c)}² − ${fmt(p.a)}² = ${fmt(p.c * p.c)} − ${fmt(p.a * p.a)} = ${fmt(diff)}`, t(lang, 'Put in the hypotenuse and the known side.', 'Gantikan hipotenus dan sisi yang diketahui.')),
      step(`a = √${fmt(diff)} ${sqrtText(diff)}`, t(lang, 'Take the square root.', 'Ambil punca kuasa dua.')),
    ];
  },
};

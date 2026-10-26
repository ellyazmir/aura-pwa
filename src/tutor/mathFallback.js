/**
 * mathFallback.js — rule-based tutor used when the WebLLM model is unavailable
 * (no WebGPU, out of memory, device lost, unparseable model reply).
 *
 * Solves: arithmetic (order of operations), fractions, "p% of n", and
 * one-variable linear equations. Hints, exercises, classification and answer
 * checking are template/heuristic based. mathjs is imported lazily so it only
 * costs bandwidth in lite mode.
 */
import { TOPICS, CURRICULUM_LEVELS } from '../types.js';
import { identify, solveWithRules } from './rules/index.js';

const t = (lang, en, ms) => (lang === 'ms' ? ms : en);

/* ---------- lazy mathjs ---------- */
let mathPromise = null;
function loadMath() {
  if (!mathPromise) {
    mathPromise = import('mathjs').then(({ create, all }) => ({
      frac: create(all, { number: 'Fraction' }),
      num: create(all, { number: 'number' }),
    }));
  }
  return mathPromise;
}

/* ---------- problem detection ---------- */
const PERCENT_RE = /^(\d+(?:\.\d+)?)\s*%\s*(?:of|daripada)\s*(\d+(?:\.\d+)?)$/i;

function extractExpression(text) {
  let s = String(text ?? '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');
  s = s.replace(
    /^(?:\s*(?:calculate|evaluate|compute|solve|simplify|find|what is|work out|hitung|selesaikan|cari|berapakah|apakah)\b[:\s]*)+/i,
    ''
  );
  return s.replace(/[=?\s]+$/, '').trim();
}

/* ---------- "given base and index, which is correct?" multiple choice ---------- */
const BASE_RE = /(?:asas|base)\s*=\s*(\d+)/i;
const INDEX_RE = /(?:indeks|index|power|kuasa|exponent)\s*=\s*(\d+)/i;
// "A. 6 × 6 × 6" ... up to the next option marker, newline or end
const OPTION_RE = /(?:^|\s)([A-D])[.)]\s*(.+?)(?=\s+[A-D][.)]\s|\n|$)/g;

function parseOptions(text) {
  return [...String(text).matchAll(OPTION_RE)].map((m) => ({ letter: m[1], text: m[2].trim() }));
}

/** Describe an option as repeated multiplication, repeated addition, or a power. */
function analyseOption(raw) {
  const s = raw.replace(/\s+/g, '').replace(/[x*]/gi, '×');
  let m = s.match(/^(\d+)\^(\d+)$/);
  if (m) return { op: '×', value: m[1], count: Number(m[2]) };
  if (/^\d+(×\d+)+$/.test(s)) {
    const f = s.split('×');
    return f.every((v) => v === f[0]) ? { op: '×', value: f[0], count: f.length } : null;
  }
  if (/^\d+(\+\d+)+$/.test(s)) {
    const f = s.split('+');
    return f.every((v) => v === f[0]) ? { op: '+', value: f[0], count: f.length } : null;
  }
  return null;
}

function isBaseIndexChoice(text) {
  return BASE_RE.test(text) && INDEX_RE.test(text) && parseOptions(text).length >= 2;
}

function solveBaseIndex(text, lang) {
  const base = text.match(BASE_RE)[1];
  const index = text.match(INDEX_RE)[1];
  const options = parseOptions(text);
  const expanded = Array(Number(index)).fill(base).join(' × ');

  const steps = [
    {
      working: `${base}^${index}`,
      explanation: t(
        lang,
        'The base is the number being multiplied. The index says how many times the base is written.',
        'Asas ialah nombor yang didarab. Indeks menunjukkan berapa kali asas itu ditulis.'
      ),
    },
    {
      working: `${base}^${index} = ${expanded}`,
      explanation: t(
        lang,
        `Write ${base} ${index} times and multiply them.`,
        `Tulis ${base} sebanyak ${index} kali dan darabkan.`
      ),
    },
  ];

  let answer = null;
  for (const o of options) {
    const a = analyseOption(o.text);
    const shown = o.text.replace(/[x*]/gi, '×');
    let ok = false;
    let why;
    if (!a) {
      why = t(lang, 'This does not repeat one number.', 'Ini tidak mengulang satu nombor.');
    } else if (a.op === '+') {
      why = t(lang, 'This is repeated addition, not a power.', 'Ini penambahan berulang, bukan kuasa.');
    } else if (a.value === base && String(a.count) === index) {
      ok = true;
      why = t(lang, `Base ${base} is written ${index} times. It matches.`, `Asas ${base} ditulis ${index} kali. Ia sepadan.`);
    } else {
      why = t(
        lang,
        `Base ${a.value} is written ${a.count} times, so this is ${a.value}^${a.count}.`,
        `Asas ${a.value} ditulis ${a.count} kali, jadi ini ${a.value}^${a.count}.`
      );
    }
    if (ok) answer = o.letter;
    steps.push({ working: `${o.letter}. ${shown}`, explanation: why });
  }
  if (!answer) return null; // no option matches: let the caller decide
  steps.push({
    working: `${t(lang, 'Answer', 'Jawapan')}: ${answer}`,
    explanation: t(lang, `Option ${answer} is the only one that matches ${base}^${index}.`, `Pilihan ${answer} sahaja yang sepadan dengan ${base}^${index}.`),
  });
  return steps;
}

function detect(text) {
  if (isBaseIndexChoice(text)) return { kind: 'power-choice', s: String(text) };
  const s = extractExpression(text);
  if (PERCENT_RE.test(s)) return { kind: 'percent', s };
  if (s.includes('=') && /x/i.test(s) && /^[\dxX.+\-*/()\s=]+$/.test(s)) {
    return { kind: 'linear', s: s.replace(/X/g, 'x') };
  }
  if (/^[\d.+\-*/^()\s]+$/.test(s) && /\d/.test(s) && /[+\-*/^]/.test(s)) {
    return { kind: 'arithmetic', s };
  }
  return { kind: 'unknown', s };
}

/* ---------- step-by-step arithmetic ---------- */
const PREC = { pow: 3, multiply: 2, divide: 2, add: 1, subtract: 1 };

const isLiteralFraction = (n) =>
  n.type === 'OperatorNode' && n.fn === 'divide' && n.args.every((a) => a.type === 'ConstantNode');

function isOperand(n, fractionMode) {
  if (n.type === 'ConstantNode') return true;
  if (n.type === 'OperatorNode' && n.fn === 'unaryMinus' && n.args[0].type === 'ConstantNode') return true;
  return fractionMode && isLiteralFraction(n);
}

function findNext(root, fractionMode) {
  let best = null;
  (function walk(n, depth) {
    if (n.type === 'ParenthesisNode') return walk(n.content, depth + 1);
    n.forEach((c) => walk(c, depth));
    if (
      n.type === 'OperatorNode' &&
      n.fn !== 'unaryMinus' &&
      n.args.every((a) => isOperand(a, fractionMode)) &&
      !(fractionMode && isLiteralFraction(n))
    ) {
      const prec = PREC[n.fn] ?? 1;
      // deepest brackets first, then highest precedence, then leftmost
      if (!best || depth > best.depth || (depth === best.depth && prec > best.prec)) {
        best = { node: n, depth, prec };
      }
    }
    return undefined;
  })(root, 0);
  return best;
}

function stripParens(root, fractionMode) {
  return root.transform((n) =>
    n.type === 'ParenthesisNode' && isOperand(n.content, fractionMode) ? n.content : n
  );
}

/** mathjs prints whole-number Fractions as "12/1"; show them as "12". */
const wholeNumbers = (s) => s.replace(/(\d+)\/1(?!\d)/g, '$1');

function show(root, fractionMode) {
  let s = wholeNumbers(root.toString({ parenthesis: 'keep' })).replace(/ \* /g, ' × ');
  if (!fractionMode) s = s.replace(/ \/ /g, ' ÷ ');
  return s;
}

function describe(node, depth, lang) {
  const [a, b] = node.args.map((x) => wholeNumbers(x.toString()));
  const text = {
    add: t(lang, `Add ${a} and ${b}.`, `Tambah ${a} dan ${b}.`),
    subtract: t(lang, `Subtract ${b} from ${a}.`, `Tolak ${b} daripada ${a}.`),
    multiply: t(lang, `Multiply ${a} by ${b}.`, `Darab ${a} dengan ${b}.`),
    divide: t(lang, `Divide ${a} by ${b}.`, `Bahagi ${a} dengan ${b}.`),
    pow: t(lang, `Work out ${a} to the power of ${b}.`, `Kira ${a} kuasa ${b}.`),
  }[node.fn] || t(lang, 'Work out this part.', 'Kira bahagian ini.');
  return depth > 0 ? t(lang, 'Brackets first. ', 'Kurungan dahulu. ') + text : text;
}

function solveArithmetic(math, expr, lang) {
  const fractionMode = !expr.includes('.');
  let root;
  try {
    root = math.parse(expr);
  } catch {
    return null;
  }
  root = stripParens(root, fractionMode);
  const steps = [
    {
      working: show(root, fractionMode),
      explanation: t(
        lang,
        'Follow the order of operations: brackets, powers, × and ÷, then + and −.',
        'Ikut tertib operasi: kurungan, kuasa, × dan ÷, kemudian + dan −.'
      ),
    },
  ];

  for (let i = 0; i < 40 && root.type !== 'ConstantNode'; i += 1) {
    const next = findNext(root, fractionMode);
    if (!next) {
      // e.g. a lone fraction such as 6/3 — evaluate the whole thing
      try {
        const out = new math.ConstantNode(root.compile().evaluate());
        if (out.toString() !== root.toString()) {
          steps.push({
            working: `= ${wholeNumbers(out.toString())}`,
            explanation: t(lang, 'Simplify the fraction.', 'Permudahkan pecahan itu.'),
          });
        }
      } catch {
        return null;
      }
      break;
    }
    let value;
    try {
      value = next.node.compile().evaluate();
    } catch {
      return null;
    }
    if (typeof value === 'number') value = Number(value.toPrecision(12));
    const replacement = new math.ConstantNode(value);
    root = stripParens(
      root.transform((n) => (n === next.node ? replacement : n)),
      fractionMode
    );
    steps.push({
      working: `= ${show(root, fractionMode)}`,
      explanation: describe(next.node, next.depth, lang),
    });
  }
  return steps;
}

/* ---------- linear equations ---------- */
function solveLinear(math, s, lang) {
  const parts = s.split('=');
  if (parts.length !== 2) return null;
  const [l, r] = parts;
  let a;
  let c;
  try {
    const f = (x) => math.evaluate(`(${l}) - (${r})`, { x: math.fraction(x) });
    c = f(0);
    a = math.subtract(f(1), c);
    if (!math.equal(f(2), math.add(math.multiply(a, 2), c))) return null; // not linear
    if (math.equal(a, 0)) return null; // no unique solution
  } catch {
    return null;
  }
  const fmt = (v) => wholeNumbers(math.format(v));
  const rhs = math.unaryMinus(c);
  const sol = math.divide(rhs, a);
  const aStr = math.equal(a, 1) ? '' : math.equal(a, -1) ? '-' : fmt(a);
  const pretty = (x) => x.replace(/\*/g, '×').replace(/\s+/g, ' ').trim();

  const steps = [
    {
      working: `${pretty(l)} = ${pretty(r)}`,
      explanation: t(lang, 'Our goal is to get x alone on one side.', 'Matlamat kita ialah mengasingkan x di satu belah.'),
    },
    {
      working: `${aStr}x = ${fmt(rhs)}`,
      explanation: t(
        lang,
        'Move the x terms to one side and the plain numbers to the other, keeping both sides balanced.',
        'Pindahkan sebutan x ke satu belah dan nombor biasa ke belah lain, dengan kedua-dua belah seimbang.'
      ),
    },
  ];
  if (!math.equal(a, 1)) {
    steps.push({
      working: `x = ${fmt(rhs)} ÷ ${fmt(a)}`,
      explanation: t(lang, `Divide both sides by ${fmt(a)}.`, `Bahagikan kedua-dua belah dengan ${fmt(a)}.`),
    });
  }
  steps.push({
    working: `x = ${fmt(sol)}`,
    explanation: t(lang, 'This is the value of x.', 'Ini ialah nilai x.'),
  });
  return steps;
}

/* ---------- percentages ---------- */
function solvePercent(s, lang) {
  const [, p, n] = s.match(PERCENT_RE);
  const P = Number(p);
  const N = Number(n);
  const round = (v) => Number(v.toPrecision(12));
  return [
    {
      working: `${p}% × ${n}`,
      explanation: t(lang, 'Percent means "out of 100".', 'Peratus bermaksud "setiap 100".'),
    },
    {
      working: `= ${round(P / 100)} × ${n}`,
      explanation: t(lang, `Write ${p}% as ${p} ÷ 100.`, `Tulis ${p}% sebagai ${p} ÷ 100.`),
    },
    {
      working: `= ${round((P / 100) * N)}`,
      explanation: t(lang, 'Multiply to get the answer.', 'Darab untuk mendapat jawapan.'),
    },
  ];
}

/* ---------- hints (never reveal numbers or results) ---------- */
const HINTS = {
  pow: [
    ['Powers mean repeated multiplication.', 'Kuasa bermaksud pendaraban berulang.'],
    ['The small number says how many times to multiply the base by itself.', 'Nombor kecil menunjukkan berapa kali asas didarab dengan dirinya.'],
  ],
  multiply: [
    ['Think about which operation this step uses: groups of something.', 'Fikirkan operasi langkah ini: kumpulan yang sama banyak.'],
    ['Break one number into tens and ones, multiply each part, then add.', 'Pecahkan satu nombor kepada puluh dan sa, darab setiap bahagian, kemudian tambah.'],
  ],
  divide: [
    ['Division asks: how many times does one number fit into the other?', 'Pembahagian bertanya: berapa kali satu nombor muat dalam nombor lain?'],
    ['Try multiplication facts backwards to check your quotient.', 'Cuba fakta darab secara songsang untuk menyemak hasil bahagi.'],
  ],
  add: [
    ['Combine the two amounts into one total.', 'Gabungkan dua kuantiti menjadi satu jumlah.'],
    ['Line up place values (ones with ones, tens with tens) and carry if needed.', 'Sejajarkan nilai tempat (sa dengan sa, puluh dengan puluh) dan bawa jika perlu.'],
  ],
  subtract: [
    ['Find the difference between the two amounts.', 'Cari beza antara dua kuantiti.'],
    ['Line up place values and borrow if a digit is too small.', 'Sejajarkan nilai tempat dan pinjam jika digit terlalu kecil.'],
  ],
  percent: [
    ['Percent means "out of 100".', 'Peratus bermaksud "setiap 100".'],
    ['Turn the percent into a fraction or decimal first, then multiply.', 'Tukarkan peratus kepada pecahan atau perpuluhan dahulu, kemudian darab.'],
  ],
  equation: [
    ['Whatever you do to one side, do to the other.', 'Apa sahaja yang dibuat pada satu belah, buat pada belah lain.'],
    ['Use the opposite operation to undo what is attached to x.', 'Guna operasi songsang untuk membatalkan apa yang melekat pada x.'],
  ],
  generic: [
    ['Re-read the step and think about which rule or operation you need first.', 'Baca semula langkah ini dan fikirkan peraturan atau operasi yang perlu digunakan dahulu.'],
    ['Do brackets first, then powers, then × and ÷, then + and −.', 'Buat kurungan dahulu, kemudian kuasa, kemudian × dan ÷, kemudian + dan −.'],
  ],
};

function hintFamily(text) {
  if (/%/.test(text)) return 'percent';
  if (/=\s*.*x|x\s*=/.test(text) || /\bx\b/.test(text)) return 'equation';
  if (/\^|power|kuasa/i.test(text)) return 'pow';
  if (/×|\*|multiply|darab/i.test(text)) return 'multiply';
  if (/÷|\/|divide|bahagi/i.test(text)) return 'divide';
  if (/\+|add|tambah/i.test(text)) return 'add';
  if (/−|-|subtract|tolak/i.test(text)) return 'subtract';
  return 'generic';
}

/* ---------- exercises ---------- */
const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

function makeExercise(kind, scale) {
  const hi = 10 * scale;
  switch (kind) {
    case 'percent': {
      const p = [5, 10, 20, 25, 50][rnd(0, 4)];
      const n = 20 * rnd(1, 5 * scale);
      return { prompt: `${p}% × ${n} = ?`, answerFormat: 'integer', answer: String((p * n) / 100) };
    }
    case 'fraction': {
      const b = rnd(2, 6);
      const d = rnd(2, 6);
      const num = rnd(1, b - 1 || 1);
      const num2 = rnd(1, d - 1 || 1);
      const top = num * d + num2 * b;
      const bot = b * d;
      const g = gcd(top, bot);
      return {
        prompt: `${num}/${b} + ${num2}/${d} = ?`,
        answerFormat: 'fraction',
        answer: bot / g === 1 ? String(top / g) : `${top / g}/${bot / g}`,
      };
    }
    case 'linear': {
      const a = rnd(2, 9);
      const x = rnd(1, 6 + scale * 2);
      const b = rnd(1, hi);
      return { prompt: `${a}x + ${b} = ${a * x + b}, x = ?`, answerFormat: 'integer', answer: String(x) };
    }
    default: {
      const a = rnd(2, hi);
      const b = rnd(2, hi);
      const op = ['+', '−', '×', '÷'][rnd(0, 3)];
      if (op === '+') return { prompt: `${a} + ${b} = ?`, answerFormat: 'integer', answer: String(a + b) };
      if (op === '−') {
        const [big, small] = a >= b ? [a, b] : [b, a];
        return { prompt: `${big} − ${small} = ?`, answerFormat: 'integer', answer: String(big - small) };
      }
      if (op === '×') {
        const m = rnd(2, 9 + scale);
        return { prompt: `${a} × ${m} = ?`, answerFormat: 'integer', answer: String(a * m) };
      }
      const q = rnd(2, hi);
      const d = rnd(2, 9);
      return { prompt: `${q * d} ÷ ${d} = ?`, answerFormat: 'integer', answer: String(q) };
    }
  }
}

function exerciseKind(topic) {
  const s = String(topic).toLowerCase();
  if (/percent|peratus/.test(s)) return 'percent';
  if (/fraction|pecahan/.test(s)) return 'fraction';
  if (/algebra|equation|persamaan/.test(s)) return 'linear';
  return 'arith';
}

/* ---------- answer checking ---------- */
function toNumber(raw) {
  const s = String(raw ?? '').trim().replace(/[−–]/g, '-').replace(/[×]/g, '*').replace(/%$/, '').replace(/,/g, '');
  let m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/); // mixed number
  if (m) {
    const w = Number(m[1]);
    const f = Number(m[2]) / Number(m[3]);
    return w < 0 ? w - f : w + f;
  }
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return Number(m[2]) === 0 ? NaN : Number(m[1]) / Number(m[2]);
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

/* ---------- public factory ---------- */
export function createLiteTutor({ coerceTopic, coerceLevel }) {
  const pickTopic = (cands) =>
    cands
      .map((c) => TOPICS.find((x) => x.toLowerCase().includes(c.toLowerCase())))
      .find(Boolean);

  return {
    /**
     * @param {{ problemText: string }} payload
     * @param {{ strict?: boolean }} [opts] strict: throw when no rule recognises the
     *   problem (lets the caller fall back to the LLM instead of guessing).
     */
    async classify({ problemText }, opts = {}) {
      const { kind, s } = detect(problemText);
      const hit = kind === 'power-choice' ? null : identify(problemText);
      if (hit) {
        return {
          topic: coerceTopic(hit.topic),
          curriculumLevel: coerceLevel(hit.level),
          confidence: 0.9,
        };
      }
      if (opts.strict && kind === 'unknown') {
        throw new Error('No rule-based solver recognises this problem.');
      }
      let topic;
      let rank = 0;
      if (kind === 'power-choice') {
        topic = pickTopic(['indices', 'index', 'exponent', 'indeks', 'kuasa']);
        rank = 1;
      } else if (kind === 'percent') {
        topic = pickTopic(['percent', 'peratus']);
        rank = 1;
      } else if (kind === 'linear') {
        topic = pickTopic(['algebra', 'equation', 'persamaan']);
        rank = 2;
      } else if (/\d\s*\/\s*\d/.test(s) && !s.includes('.')) {
        topic = pickTopic(['fraction', 'pecahan']);
        rank = 1;
      } else {
        topic = pickTopic(['arithmetic', 'operation', 'whole number', 'number']);
      }
      const level = CURRICULUM_LEVELS[Math.min(CURRICULUM_LEVELS.length - 1, rank)];
      return { topic: coerceTopic(topic), curriculumLevel: coerceLevel(level), confidence: 0.4 };
    },

        async solution({ problemText, language }) {
      const { kind, s } = detect(problemText);
      let steps = null;
      if (kind === 'power-choice') {
        steps = solveBaseIndex(s, language);
      } else {
        // Topic rules first (fractions, geometry, algebra, statistics...).
        steps = await solveWithRules(problemText, language, { loadMath });
      }
      if (!steps && kind === 'percent') {
        steps = solvePercent(s, language);
      } else if (!steps && (kind === 'linear' || kind === 'arithmetic')) {
        const { frac, num } = await loadMath();
        // Decimals stay decimals (plain numbers); everything else uses exact fractions.
        steps = kind === 'linear'
          ? solveLinear(frac, s, language)
          : solveArithmetic(s.includes('.') ? num : frac, s, language);
      }
      if (!steps || steps.length === 0) {
        throw new Error(
          'Could not parse this problem: the offline solver handles arithmetic, fractions, ' +
            'percentages, ratios, HCF/LCM, rounding, perimeter/area/volume, statistics, ' +
            'simple probability, sequences, linear and quadratic equations, simultaneous ' +
            'equations, expanding/factorising, Pythagoras and coordinate geometry.'
        );
      }
      const total = steps.length;
      return steps.map((st, i) => ({ number: i + 1, total, ...st }));
    },

    async hint({ stepWorking, stepExplanation, hintIndex, language }) {
      const fam = HINTS[hintFamily(`${stepExplanation || ''} ${stepWorking || ''}`)];
      const idx = Math.min(typeof hintIndex === 'number' ? hintIndex : 0, 2);
      const pair = fam[Math.min(idx, fam.length - 1)];
      const text = t(language, pair[0], pair[1]);
      return idx === 2 ? t(language, 'Last hint: ', 'Petunjuk terakhir: ') + text : text;
    },

    async exercises({ topic, curriculumLevel, count, language }) {
      const n = Math.max(1, Math.min(5, Number(count) || 1));
      const safeTopic = coerceTopic(topic);
      const level = coerceLevel(curriculumLevel);
      const scale = 1 + Math.max(0, CURRICULUM_LEVELS.indexOf(level));
      const kind = exerciseKind(safeTopic);
      const seen = new Set();
      const out = [];
      for (let i = 0; i < 50 && out.length < n; i += 1) {
        const ex = makeExercise(kind, scale);
        if (seen.has(ex.prompt)) continue;
        seen.add(ex.prompt);
        out.push({
          id: globalThis.crypto?.randomUUID?.() ?? `lite-${Date.now()}-${out.length}`,
          ...ex,
          topic: safeTopic,
          curriculumLevel: level,
        });
      }
      return out;
    },

    async evaluate({ exercise, studentAnswer, language }) {
      const want = toNumber(exercise && exercise.answer);
      const got = toNumber(studentAnswer);
      const correct =
        Number.isFinite(want) && Number.isFinite(got) && Math.abs(want - got) <= 1e-6 * Math.max(1, Math.abs(want));
      // Deliberately does not reveal the answer: tutorSession decides when to reveal.
      return {
        correct,
        explanation: correct
          ? t(language, 'Correct — well done!', 'Betul — tahniah!')
          : t(language, 'Not quite. Check your working and try again.', 'Belum tepat. Semak langkah kerja anda dan cuba lagi.'),
      };
    },
  };
}
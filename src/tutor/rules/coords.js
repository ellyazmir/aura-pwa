/** Coordinate geometry: gradient, distance, midpoint, equation of a line through two points. */
import { t, step, fmt, fmt2, prep, numStr, asRat, ratStr } from './util.js';

const PT = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;

export const coordinates = {
  id: 'coordinates',
  topic: 'Algebra',
  level: (p) => (p.kind === 'gradient' ? 'Form3' : 'Form4'),
  match(text) {
    const s = prep(text, { thousands: false }).toLowerCase();
    const pts = [...s.matchAll(PT)].map((m) => [Number(m[1]), Number(m[2])]);
    if (pts.length !== 2) return null;
    const kind = /midpoint|titik tengah/.test(s) ? 'midpoint'
      : /distance|jarak/.test(s) ? 'distance'
        : /equation|persamaan/.test(s) ? 'line'
          : /gradient|slope|kecerunan/.test(s) ? 'gradient' : null;
    return kind ? { kind, pts } : null;
  },
  solve({ kind, pts: [[x1, y1], [x2, y2]] }, lang) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (kind === 'midpoint') {
      return [
        step(`((${fmt(x1)} + ${fmt(x2)}) ÷ 2,  (${fmt(y1)} + ${fmt(y2)}) ÷ 2)`, t(lang, 'The midpoint is the mean of the x-coordinates and the mean of the y-coordinates.', 'Titik tengah ialah min bagi koordinat-x dan min bagi koordinat-y.')),
        step(`= (${numStr((x1 + x2) / 2)}, ${numStr((y1 + y2) / 2)})`, t(lang, 'Work out each coordinate.', 'Kira setiap koordinat.')),
      ];
    }
    if (kind === 'distance') {
      const sum = dx * dx + dy * dy;
      const r = Math.sqrt(sum);
      const exact = Math.abs(Number(r.toFixed(4)) ** 2 - sum) < 1e-9;
      return [
        step('d = √((x₂ − x₁)² + (y₂ − y₁)²)', t(lang, 'Use the distance formula.', 'Guna rumus jarak.')),
        step(`d = √((${fmt(dx)})² + (${fmt(dy)})²) = √${fmt(sum)}`, t(lang, 'Put in the coordinates.', 'Gantikan koordinat.')),
        step(`d ${exact ? '=' : '≈'} ${exact ? fmt(r) : fmt2(r)}`, t(lang, 'Take the square root.', 'Ambil punca kuasa dua.')),
      ];
    }
    if (dx === 0) {
      return kind === 'line'
        ? [step(`x = ${fmt(x1)}`, t(lang, 'Both points have the same x-coordinate, so the line is vertical.', 'Kedua-dua titik mempunyai koordinat-x yang sama, jadi garis itu menegak.'))]
        : [step(t(lang, 'Gradient is undefined', 'Kecerunan tidak tertakrif'), t(lang, 'Both points have the same x-coordinate, so the line is vertical and cannot be divided.', 'Kedua-dua titik mempunyai koordinat-x yang sama, jadi garis itu menegak.'))];
    }
    const m = dy / dx;
    const mText = numStr(m);
    const steps = [
      step(`m = (y₂ − y₁) ÷ (x₂ − x₁) = (${fmt(y2)} − ${fmt(y1)}) ÷ (${fmt(x2)} − ${fmt(x1)})`, t(lang, 'Gradient = change in y ÷ change in x.', 'Kecerunan = perubahan y ÷ perubahan x.')),
      step(`m = ${fmt(dy)}/${fmt(dx)} = ${mText}`, t(lang, 'Work it out and simplify.', 'Kira dan permudahkan.')),
    ];
    if (kind === 'gradient') return steps;
    const c = y1 - m * x1;
    const cText = numStr(c);
    const r = asRat(c);
    steps.push(
      step(`${fmt(y1)} = ${mText}(${fmt(x1)}) + c  →  c = ${cText}`, t(lang, 'Put one point into y = mx + c to find c.', 'Gantikan satu titik ke dalam y = mx + c untuk mencari c.')),
      step(`y = ${mText === '1' ? '' : mText === '-1' ? '-' : mText}x ${c < 0 ? '−' : '+'} ${r ? ratStr({ n: Math.abs(r.n), d: r.d }) : fmt(Math.abs(c))}`.replace(/ \+ 0$/, ''), t(lang, 'Write the equation y = mx + c.', 'Tulis persamaan y = mx + c.'))
    );
    return steps;
  },
};

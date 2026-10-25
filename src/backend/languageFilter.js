/**
 * languageFilter — prefer English when an OCR result mixes English and
 * Bahasa Malaysia (both Latin script, so script detection cannot separate them).
 *
 * Approach: classify each OCR detection (a line/block) by counting known English
 * and Malay keywords. Digits, symbols, and single letters are language-neutral.
 *
 *  - If at least one English detection exists, Malay detections are dropped.
 *  - If no English detection exists (Malay-only image), everything is kept.
 *  - Neutral detections (pure math such as "2 + 3 = ?") are always kept.
 *
 * Filtering is per detection, not per word, so a valid math expression is never
 * cut in the middle. Keyword lists are intentionally conservative: words that
 * are spelled the same in both languages (e.g. "perimeter", "sin", "tan") are
 * left out so they never tip a line either way.
 */

const MALAY_WORDS = new Set([
  'dan', 'atau', 'yang', 'ialah', 'adalah', 'dengan', 'untuk', 'dalam', 'daripada',
  'dari', 'pada', 'jika', 'sekiranya', 'maka', 'kemudian', 'cari', 'carikan', 'nilai',
  'hitung', 'kirakan', 'tentukan', 'selesaikan', 'ringkaskan', 'ungkapkan', 'tunjukkan',
  'nyatakan', 'tambah', 'tolak', 'darab', 'bahagi', 'jumlah', 'hasil', 'beza', 'nombor',
  'pecahan', 'perpuluhan', 'peratus', 'peratusan', 'nisbah', 'luas', 'isipadu', 'panjang',
  'lebar', 'tinggi', 'segi', 'tiga', 'empat', 'bulatan', 'garis', 'sudut', 'harga',
  'sebuah', 'seorang', 'setiap', 'semua', 'berapa', 'apakah', 'berikut', 'rajah',
  'jadual', 'persamaan', 'ungkapan', 'kuasa', 'punca', 'purata', 'soalan', 'jawapan',
  'markah', 'sama', 'lebih', 'kurang', 'besar', 'kecil', 'antara', 'ke', 'di', 'itu',
  'manakah', 'benar', 'salah', 'betul', 'pilih', 'asas', 'indeks',
  'ini', 'ada', 'tidak', 'bagi', 'oleh', 'satu', 'dua', 'lima', 'enam', 'tujuh',
  'lapan', 'sembilan', 'sepuluh', 'ratus', 'ribu', 'juta', 'ringgit', 'sen', 'kg',
]);

const ENGLISH_WORDS = new Set([
  'the', 'and', 'or', 'of', 'is', 'are', 'find', 'calculate', 'solve', 'simplify',
  'express', 'show', 'state', 'value', 'sum', 'difference', 'product', 'number',
  'fraction', 'decimal', 'percent', 'percentage', 'ratio', 'area', 'volume', 'length',
  'width', 'height', 'triangle', 'circle', 'line', 'angle', 'cost', 'price', 'each',
  'all', 'how', 'many', 'what', 'which', 'following', 'diagram', 'table', 'equation',
  'expression', 'power', 'root', 'average', 'mean', 'question', 'answer', 'marks',
  'if', 'then', 'equal', 'more', 'less', 'between', 'with', 'for', 'in', 'from', 'to',
  'an', 'by', 'that', 'his', 'her', 'has', 'have', 'total', 'given', 'when', 'than',
  'add', 'subtract', 'multiply', 'divide', 'one', 'two', 'three', 'four', 'five',
]);

/**
 * Lowercase alphabetic tokens of length >= 2 (single letters are usually math
 * variables such as x or a, so they carry no language signal).
 * @param {string} text
 * @returns {string[]}
 */
function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z]+/g) || []).filter((w) => w.length >= 2);
}

/**
 * Classify one piece of OCR text.
 * @param {string} text
 * @returns {'en'|'ms'|'neutral'}
 */
export function classifyLanguage(text) {
  let en = 0;
  let ms = 0;
  for (const w of tokens(text)) {
    if (ENGLISH_WORDS.has(w)) en += 1;
    if (MALAY_WORDS.has(w)) ms += 1;
  }
  if (ms > en) return 'ms';
  if (en > 0) return 'en';
  return 'neutral';
}

/**
 * Drop Malay detections when English detections are present.
 *
 * @param {Array<{ class?: string, text?: string }>} detections OCR predictions;
 *   the recognised string is read from `class` (Roboflow) or `text`.
 * @returns {{ text: string, dropped: number, kept: object[] }} the filtered text
 *   (detections joined with a space, in their original order), how many were
 *   removed, and the surviving detection objects (so callers can lay them out
 *   using their bounding boxes).
 */
export function preferEnglish(detections) {
  const items = (Array.isArray(detections) ? detections : [])
    .map((d) => ({ d, str: String(d?.class ?? d?.text ?? '').trim() }))
    .filter((i) => i.str)
    .map((i) => ({ ...i, lang: classifyLanguage(i.str) }));

  const hasEnglish = items.some((i) => i.lang === 'en');
  const kept = hasEnglish ? items.filter((i) => i.lang !== 'ms') : items;

  return {
    text: kept.map((i) => i.str).join(' ').trim(),
    dropped: items.length - kept.length,
    kept: kept.map((i) => i.d),
  };
}
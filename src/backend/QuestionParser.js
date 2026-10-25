/**
 * questionParser — split OCR text of a multiple-choice question into the
 * question number, the question stem and the answer options.
 *
 * Works on plain text (one line per row, as produced by layoutText), so it has
 * no DOM or OCR-engine dependency and can be unit tested.
 *
 * Two layouts are understood:
 *   - "labelled": lines that start with A / B / C / D ("A. 6 x 6", "(B)", "C x")
 *   - "table":    no labels were readable, but the options are table rows
 *                 (cells joined with " | " by layoutText). The last
 *                 `expectedOptions` rows are taken as A, B, C, D in order.
 *
 * Lines between two option labels (for example the numerator and denominator
 * rows of a stacked fraction) are treated as continuation of the previous option.
 */

const LABELS = ['A', 'B', 'C', 'D', 'E'];

/** Characters OCR commonly returns for a label when it is circled or smudged. */
const LABEL_ALIASES = { B: ['8'], C: ['G'], D: ['0', 'O'] };

/** Default number of answer options in the paper. */
const DEFAULT_OPTION_COUNT = 4;

/**
 * Pull "46." / "46)" off the front of a line.
 * @param {string} text
 * @returns {{ number: number|null, rest: string }}
 */
function splitNumber(text) {
  const m = String(text ?? '').match(/^\s*(\d{1,3})\s*[.),]\s*(.*)$/s);
  return m ? { number: Number(m[1]), rest: m[2] } : { number: null, rest: String(text ?? '') };
}

/**
 * Index of the row that carries the question number, or -1. Only tiny stray rows
 * (a superscript or speck, 3 characters or fewer) may sit above it; a real text
 * row first means there is no number, so "8. 4 x 4" in an option is never taken.
 * @param {string[]} lines
 * @returns {number}
 */
function numberRowIndex(lines) {
  for (let i = 0; i < Math.min(3, lines.length); i += 1) {
    if (splitNumber(lines[i]).number !== null) return i;
    if (lines[i].length > 3) return -1;
  }
  return -1;
}

/**
 * Question number from the first rows, or null. Call this on the text
 * BEFORE language filtering: the number sits on the Malay line, which is
 * dropped when an English line is present.
 * @param {string} text
 * @returns {number|null}
 */
export function extractQuestionNumber(text) {
  const rows = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const at = numberRowIndex(rows);
  return at >= 0 ? splitNumber(rows[at]).number : null;
}

/**
 * Does this line start answer option `expected` ('A'..'E')?
 * @param {string} line
 * @param {string} expected
 * @returns {{ text: string }|null}
 */
function matchOption(line, expected) {
  // Drop leading noise such as "(", "|" or a stray circle from handwriting.
  const s = line.replace(/^[^A-Za-z0-9]+/, '');
  if (!s) return null;

  const accepted = [expected, ...(LABEL_ALIASES[expected] ?? [])];

  // "A. text", "A) text", "A: text"
  const punct = s.match(/^([A-Za-z0-9])\s*[.):]\s*(.*)$/s);
  if (punct && accepted.includes(punct[1].toUpperCase())) return { text: punct[2].trim() };

  // "A text" or a bare "A" (math options often have no punctuation). Only the real
  // letter is accepted here, and a following lowercase word ("A triangle ...")
  // means it is ordinary prose, not an option.
  const spaced = s.match(/^([A-E])(?:\s+(.*))?$/s);
  if (spaced && spaced[1] === expected) {
    const rest = (spaced[2] ?? '').trim();
    if (!/^[a-z]{2,}\b/.test(rest)) return { text: rest };
  }
  return null;
}

/** How many consecutive labels may be unreadable (circled, crossed out) before giving up. */
const MAX_MISSING = 2;

/**
 * Find the options starting at the first line that begins a valid A, B, ... run.
 *
 * A label hidden by a pen circle or smudge is inferred: when line order jumps from
 * A straight to C, the unlabeled line just before C is taken as B. Such options
 * carry `inferred: true`.
 *
 * @param {string[]} lines
 * @returns {{ start: number, options: { label: string, text: string, inferred?: boolean }[] }|null}
 */
function findLabelledOptions(lines) {
  for (let start = 0; start < lines.length; start += 1) {
    const first = matchOption(lines[start], 'A');
    if (!first) continue;

    // Each option keeps its own text plus the unlabeled lines that follow it.
    const options = [{ label: 'A', head: first.text, cont: [] }];
    for (let i = start + 1; i < lines.length; i += 1) {
      let hit = null;
      let index = -1;
      const limit = Math.min(LABELS.length, options.length + MAX_MISSING + 1);
      for (let k = options.length; k < limit; k += 1) {
        const m = matchOption(lines[i], LABELS[k]);
        if (m) { hit = m; index = k; break; }
      }

      const last = options[options.length - 1];
      if (!hit) {
        last.cont.push(lines[i]); // wrapped text or fraction rows of the current option
        continue;
      }

      const missing = index - options.length;
      if (missing > 0) {
        // Hand the last unlabeled lines to the options whose label was not read.
        const take = Math.min(missing, last.cont.length);
        const moved = last.cont.splice(last.cont.length - take, take);
        for (let j = 0; j < missing; j += 1) {
          const fromEnd = missing - 1 - j; // j-th missing option, counted from the end
          options.push({
            label: LABELS[options.length],
            head: fromEnd < take ? moved[take - 1 - fromEnd] : '',
            cont: [],
            inferred: true,
          });
        }
      }
      options.push({ label: LABELS[index], head: hit.text, cont: [] });
    }

    if (options.length >= 2) {
      return {
        start,
        options: options.map((o) => {
          const out = { label: o.label, text: [o.head, ...o.cont].join(' ').replace(/\s+/g, ' ').trim() };
          if (o.inferred) out.inferred = true;
          return out;
        }),
      };
    }
  }
  return null;
}

/**
 * Table fallback: the last `count` data rows (rows containing " | ") are the options.
 * A header row ("Number | Base | index") has long words where data rows have numbers
 * and algebra, so it is left in the stem even when a data row was not read.
 * @param {string[]} lines
 * @param {number} count
 * @returns {{ start: number, options: { label: string, text: string }[] }|null}
 */
function findTableOptions(lines, count) {
  const rowIdx = lines.map((l, i) => (l.includes(' | ') ? i : -1)).filter((i) => i >= 0);
  if (rowIdx.length < 2) return null;
  const dataRows = rowIdx.filter((i) => !/[A-Za-z]{4,}/.test(lines[i]));
  const pool = dataRows.length >= 2 ? dataRows : rowIdx;
  const picked = pool.slice(-count);
  return {
    start: picked[0],
    options: picked.map((i, n) => ({ label: LABELS[n], text: lines[i] })),
  };
}

/**
 * @typedef {Object} ParsedQuestion
 * @property {number|null} number
 * @property {string} question  the stem, without the number
 * @property {{ label: string, text: string }[]} options
 * @property {'labelled'|'table'|'none'} format
 * @property {string[]} warnings  things a human should double check
 */

/**
 * @param {string} text OCR text, one row per line
 * @param {{ number?: number|null, expectedOptions?: number }} [opts]
 * @returns {ParsedQuestion}
 */
export function parseQuestion(text, opts = {}) {
  const expected = opts.expectedOptions ?? DEFAULT_OPTION_COUNT;
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const warnings = [];

  // Number: caller-supplied (taken before language filtering) wins. The number row
  // is removed from the stem; only the first few rows are searched.
  let number = opts.number ?? null;
  const at = numberRowIndex(lines);
  if (at >= 0) {
    const { number: n, rest } = splitNumber(lines[at]);
    number ??= n;
    if (rest.trim()) lines[at] = rest.trim();
    else lines.splice(at, 1);
  }

  let found = findLabelledOptions(lines);
  let format = 'labelled';
  if (!found) {
    found = findTableOptions(lines, expected);
    format = 'table';
  }
  if (!found) {
    return {
      number,
      question: lines.join(' ').replace(/\s+/g, ' ').trim(),
      options: [],
      format: 'none',
      warnings: ['No answer options detected'],
    };
  }

  // Rows before the first option are the stem; a table header row keeps its text
  // but loses the " | " column separators.
  const question = lines
    .slice(0, found.start)
    .join(' ')
    .replace(/ \| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (found.options.length < expected) {
    warnings.push(`Found ${found.options.length} of ${expected} options`);
  }
  if (found.options.some((o) => !o.text)) {
    warnings.push('Some options have no readable text (maths notation is hard for OCR)');
  }
  const inferred = found.options.filter((o) => o.inferred).map((o) => o.label);
  if (inferred.length) warnings.push(`Label ${inferred.join(', ')} not read; inferred from line order`);
  if (format === 'table') warnings.push('Options taken from table rows in order (A, B, C, D)');
  if (!question) warnings.push('Question text is empty');

  return { number, question, options: found.options, format, warnings };
}
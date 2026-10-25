/**
 * PrettyPrinter — formats raw OCR output and AI-generated text into
 * consistently formatted math notation aligned with Malaysian school convention.
 *
 * Target notation (Requirements 3.3, 5.4):
 *  - Multiplication: ×
 *  - Division (operator): ÷   (fractions a/b are preserved)
 *  - Exponentiation: x^n      (caret form; raw ** is reduced to ^)
 *  - Square root: sqrt(x)     (preserved as-is)
 *  - Subscript: x_n           (preserved as-is)
 *
 * Substitution rules are applied in a fixed order and are designed to be
 * idempotent: format(format(x)) === format(x). The output contains none of
 * the raw substitutable operators (`*`, `**`) — those always map to a target
 * symbol. `/` is only substituted when it is used as a division operator
 * (whitespace on at least one side); fraction forms like `3/4` are left intact.
 */

/**
 * Ordered substitution rules. Each is individually idempotent; `applyRules`
 * runs the pipeline to a fixed point so the overall transform is idempotent too.
 */
const RULES = [
  // 1. Exponentiation operator `**` → `^` (must run before the `*` rule so a
  //    double-star is not split into two multiplication symbols). `^` is the
  //    target notation, so it is never re-substituted.
  { pattern: /\*\*/g, replacement: '^' },

  // 2. Multiplication: every remaining `*` → `×`. `*` has no non-substitutable
  //    meaning in this notation, so replacing unconditionally guarantees no raw
  //    operator survives (including at string boundaries like `*5` or `5*`).
  { pattern: /\*/g, replacement: '×' },

  // 3. Division operator: a `/` that has whitespace on at least one side is an
  //    operator → `÷`. Bare `a/b` (no surrounding whitespace, e.g. `3/4`) is a
  //    fraction and is preserved. The alternation matches a `/` preceded OR
  //    followed by whitespace, consuming any surrounding spaces.
  { pattern: /\s+\/\s*|\s*\/\s+/g, replacement: ' ÷ ' },

  // 4. Normalise spacing around `×` to a single space either side (idempotent:
  //    ` × ` maps back to ` × `).
  { pattern: /\s*×\s*/g, replacement: ' × ' },

  // 5. Normalise spacing around `÷` to a single space either side.
  { pattern: /\s*÷\s*/g, replacement: ' ÷ ' },

  // 6. Collapse any runs of whitespace introduced by the rules above into a
  //    single space so spacing is stable across repeated application.
  { pattern: /[ \t]{2,}/g, replacement: ' ' },
];

/** Run every rule once over the input. */
function singlePass(input) {
  let out = input;
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

/**
 * Apply the substitution rules to a fixed point.
 *
 * A single pass can introduce whitespace (e.g. around a new multiplication
 * symbol) that a later rule in the same pass has already run past: when a bare
 * slash ends up adjacent to a freshly spaced symbol, only a second pass sees it
 * as a division operator. Iterating to a fixed point makes the overall
 * transform converge, so applyRules(applyRules(x)) equals applyRules(x). The
 * alphabet is finite and shrinks toward the target symbols, so convergence
 * takes a couple of passes; the bound below is a safety stop.
 * @param {string} raw
 * @returns {string}
 */
function applyRules(raw) {
  let prev = raw;
  let out = singlePass(prev);
  // Convergence is reached within a few passes; cap to avoid any pathological loop.
  for (let i = 0; i < 8 && out !== prev; i++) {
    prev = out;
    out = singlePass(prev);
  }
  return out;
}

/**
 * Format raw OCR problem text into standard mathematical notation.
 * @param {string} raw
 * @returns {string}
 */
export function formatProblemText(raw) {
  if (!raw) return '';
  return applyRules(raw);
}

/**
 * Format a step's working + explanation text into standard mathematical notation.
 * @param {string} raw
 * @returns {string}
 */
export function formatStepText(raw) {
  if (!raw) return '';
  return applyRules(raw);
}

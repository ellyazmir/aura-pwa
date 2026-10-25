/**
 * @typedef {'Year4'|'Year5'|'Year6'|'Form1'|'Form2'|'Form3'|'Form4'} CurriculumLevel
 */

/** @type {CurriculumLevel[]} */
export const CURRICULUM_LEVELS = ['Year4', 'Year5', 'Year6', 'Form1', 'Form2', 'Form3', 'Form4'];

export const CURRICULUM_LEVEL_LABELS = {
  Year4: 'Year 4', Year5: 'Year 5', Year6: 'Year 6',
  Form1: 'Form 1', Form2: 'Form 2', Form3: 'Form 3', Form4: 'Form 4',
};

/** Minimum required topics for ALL curriculum levels */
export const TOPICS = [
  'Whole Numbers', 'Fractions', 'Decimals', 'Percentages', 'Ratios',
  'Geometry', 'Measurement', 'Algebra', 'Linear Equations',
  'Quadratic Expressions', 'Statistics', 'Probability',
];

/**
 * Accepted image MIME types for Problem_Image upload (Requirement 2.2, 2.3).
 * @type {string[]}
 */
export const MIME_WHITELIST = ['image/jpeg', 'image/png', 'image/heic'];

/**
 * Maximum accepted upload size in bytes — 10 MB (Requirement 2.2, 2.7).
 * @type {number}
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Answer-format validators keyed by the `answerFormat` declared on an Exercise.
 * Each entry maps a format identifier to a predicate over a trimmed answer string.
 *
 * Supported formats:
 * - `integer`  — optional sign then digits, e.g. `-12`, `0`, `42`
 * - `decimal`  — optional sign, digits with an optional single decimal point,
 *                e.g. `3`, `3.14`, `-0.5`, `.5`, `2.`
 * - `fraction` — `a/b` form with integer numerator/denominator and non-zero
 *                denominator, optional leading sign, e.g. `3/4`, `-1/2`
 * - `percentage` — a decimal optionally followed by `%`, e.g. `50`, `12.5%`
 *
 * @type {Record<string, (answer: string) => boolean>}
 */
export const ANSWER_FORMAT_VALIDATORS = {
  integer: (a) => /^[+-]?\d+$/.test(a),
  decimal: (a) => /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(a),
  fraction: (a) => {
    const m = /^[+-]?(\d+)\/(\d+)$/.exec(a);
    return m !== null && Number(m[2]) !== 0;
  },
  percentage: (a) => /^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(a),
};

/**
 * Validate a submitted answer string against a declared answer format.
 *
 * The `answerFormat` is matched case-insensitively against the keys of
 * {@link ANSWER_FORMAT_VALIDATORS}. A format may also be supplied with a
 * descriptive suffix (e.g. `"fraction (a/b)"`); the leading identifier word is
 * used for lookup. Leading/trailing whitespace on the answer is ignored.
 *
 * When the format is unknown or not provided, the answer is accepted as long as
 * it is non-empty after trimming, so that free-form answers are not blocked by
 * an undeclared format.
 *
 * Used to gate Exercise answer submission before calling the AI_Tutor
 * (Requirement 6.6) and to validate manual entry.
 *
 * @param {string} answer - the student's submitted answer
 * @param {string} [answerFormat] - the Exercise's declared answer format
 * @returns {boolean} true when the answer conforms to the declared format
 */
export function answerMatchesFormat(answer, answerFormat) {
  if (typeof answer !== 'string') return false;
  const trimmed = answer.trim();
  if (trimmed === '') return false;

  if (typeof answerFormat !== 'string' || answerFormat.trim() === '') {
    return true;
  }

  const key = answerFormat.trim().toLowerCase().split(/[^a-z]+/)[0];
  const validator = ANSWER_FORMAT_VALIDATORS[key];
  if (!validator) return true;

  return validator(trimmed);
}

/**
 * @typedef {Object} OCRResult
 * @property {string} text
 * @property {number} confidence
 */

/**
 * @typedef {Object} Classification
 * @property {string} topic
 * @property {CurriculumLevel} curriculumLevel
 * @property {number} confidence
 */

/**
 * @typedef {Object} Step
 * @property {number} number
 * @property {number} total
 * @property {string} working
 * @property {string} explanation
 */

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} prompt
 * @property {string} answerFormat
 * @property {string} answer
 * @property {string} topic
 * @property {CurriculumLevel} curriculumLevel
 */

/**
 * @typedef {Object} Feedback
 * @property {boolean} correct
 * @property {string} explanation
 */

/**
 * @typedef {Object} ExerciseResult
 * @property {number} [id]
 * @property {string} topic
 * @property {CurriculumLevel} curriculumLevel
 * @property {boolean} correct
 * @property {boolean} firstAttempt
 * @property {number} timestamp
 */

/**
 * @typedef {Object} TopicSummary
 * @property {string} topic
 * @property {CurriculumLevel} curriculumLevel
 * @property {number} totalAttempts
 * @property {number} firstAttemptCorrect
 * @property {number} accuracyPercent
 */

/** @typedef {'en'|'ms'} LanguageCode */

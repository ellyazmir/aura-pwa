// src/tutor/tutorSession.js
/**
 * TutorSession — a pure(ish) state-machine / controller that sits between the
 * UI and the {@link module:src/tutor/tutorEngine TutorEngine}.
 *
 * It owns the *interaction* rules that the engine itself does not enforce:
 *
 *  - **Whitespace-only Problem_Text is rejected before any engine call**
 *    (Requirement 3.6, Property 5). `startSession` / `validateProblemText`
 *    short-circuit on empty or all-whitespace input and never touch
 *    `classifyProblem` / `generateSolution`.
 *  - **Hint cap per Step is 3** (Requirement 5.3, Property 9). Hints are
 *    indexed 0, 1, 2 per step; a request once three have been given
 *    (`hintIndex >= 3`) is rejected without generating a new hint.
 *  - **Incorrect answer offers exactly one Hint** on the first or second
 *    incorrect attempt (Requirement 6.3, Property 10).
 *  - **After two incorrect attempts the answer + full solution are revealed**
 *    and the Exercise is marked completed (Requirement 6.4, Property 11).
 *  - **Answer-format validation before evaluation** (Requirement 6.6,
 *    Property 13). A submitted answer that does not conform to the exercise's
 *    declared `answerFormat` is rejected inline and `evaluateAnswer` is never
 *    called.
 *
 * ## Design — dependency injection for testability
 *
 * The session never spawns a worker. It receives a TutorEngine instance (or the
 * subset of engine methods it needs) so unit and property tests can pass a mock
 * without WebGPU:
 *
 * ```js
 * import { createTutorSession } from './tutorSession.js';
 *
 * const engine = {
 *   classifyProblem: async () => ({ topic: 'Fractions', curriculumLevel: 'Year5', confidence: 0.9 }),
 *   generateSolution: async () => [{ number: 1, total: 1, working: '…', explanation: '…' }],
 *   generateHint: async () => 'think about the denominator',
 *   generateExercises: async () => [],
 *   evaluateAnswer: async () => ({ correct: false, explanation: 'not quite' }),
 * };
 * const session = createTutorSession({ engine });
 * ```
 *
 * ## Return shapes
 *
 * Methods return discriminated result objects so callers never have to catch
 * control-flow exceptions for the *expected* rejection paths:
 *
 *  - Validation / cap rejections: `{ ok: false, reason: <ReasonCode>, message }`.
 *  - Successful engine-backed calls: `{ ok: true, ... }` with the relevant data.
 *
 * `ReasonCode` is one of the {@link REJECTION} constants, so UIs and tests can
 * branch on a stable identifier rather than message text.
 *
 * @module src/tutor/tutorSession
 */

import { answerMatchesFormat } from '../types.js';

/**
 * Maximum hints offered per Step (Requirement 5.3). Hint indices are therefore
 * 0..MAX_HINTS_PER_STEP-1.
 * @type {number}
 */
export const MAX_HINTS_PER_STEP = 3;

/**
 * Number of incorrect attempts on an Exercise after which the answer and full
 * solution may be revealed (Requirement 6.4).
 * @type {number}
 */
export const INCORRECT_ATTEMPTS_BEFORE_REVEAL = 2;

/**
 * Stable reason codes for rejection results. Callers branch on these rather
 * than on human-readable messages.
 * @readonly
 * @enum {string}
 */
export const REJECTION = {
  /** Problem_Text was empty or whitespace-only (Req 3.6 / P5). */
  EMPTY_PROBLEM_TEXT: 'empty-problem-text',
  /** The hint cap for the step has been reached (Req 5.3 / P9). */
  HINT_LIMIT_REACHED: 'hint-limit-reached',
  /** The submitted answer did not match the declared format (Req 6.6 / P13). */
  ANSWER_FORMAT_MISMATCH: 'answer-format-mismatch',
  /** The reveal was requested before two incorrect attempts (Req 6.4 / P11). */
  REVEAL_NOT_ALLOWED: 'reveal-not-allowed',
  /** A referenced exercise is not known to the session. */
  UNKNOWN_EXERCISE: 'unknown-exercise',
};

/**
 * True when `text` is `null`/`undefined`, not a string, empty, or composed
 * entirely of whitespace. Mirrors the `/^\s*$/` test in Property 5 while also
 * guarding non-string input.
 * @param {*} text
 * @returns {boolean}
 */
export function isBlank(text) {
  return typeof text !== 'string' || text.trim() === '';
}

/**
 * Derive a stable key for an exercise so per-exercise state can be tracked even
 * when the caller re-passes an equivalent object. Prefers the exercise `id`,
 * falling back to the `prompt`.
 * @param {{id?: string, prompt?: string}} exercise
 * @returns {string}
 */
function exerciseKey(exercise) {
  if (exercise && typeof exercise.id === 'string' && exercise.id !== '') return exercise.id;
  if (exercise && typeof exercise.prompt === 'string') return `prompt:${exercise.prompt}`;
  return 'anonymous';
}

/**
 * Create a tutoring interaction session bound to a TutorEngine.
 *
 * @param {object} deps
 * @param {{
 *   classifyProblem: (problemText: string, language?: string) => Promise<object>,
 *   generateSolution: (problemText: string, topic?: string, language?: string) => Promise<Array<object>>,
 *   generateHint: (step: object, language?: string) => Promise<string>,
 *   generateExercises?: (topic: string, level: string, count: number, language?: string) => Promise<Array<object>>,
 *   evaluateAnswer: (exercise: object, studentAnswer: string, language?: string) => Promise<object>,
 * }} deps.engine - a TutorEngine (or compatible subset) injected for testability.
 * @param {string} [deps.language] - default language passed through to the engine.
 * @returns {object} the session controller.
 */
export function createTutorSession(deps = {}) {
  const engine = deps.engine;
  if (!engine || typeof engine.classifyProblem !== 'function') {
    throw new TypeError('createTutorSession requires an engine with a classifyProblem method.');
  }
  const defaultLanguage = typeof deps.language === 'string' ? deps.language : undefined;

  /**
   * Hints already generated, keyed by step index. Counts are capped at
   * {@link MAX_HINTS_PER_STEP}.
   * @type {Map<number, number>}
   */
  const hintCounts = new Map();

  /**
   * Per-exercise interaction state keyed by {@link exerciseKey}.
   * @type {Map<string, {incorrectAttempts: number, hintsOffered: number, completed: boolean, exercise: object}>}
   */
  const exerciseState = new Map();

  /** The active problem text, set once a session starts. @type {string|null} */
  let activeProblemText = null;

  /**
   * Fetch-or-create the mutable state record for an exercise.
   * @param {object} exercise
   * @returns {{incorrectAttempts: number, hintsOffered: number, completed: boolean, exercise: object}}
   */
  function stateFor(exercise) {
    const key = exerciseKey(exercise);
    let state = exerciseState.get(key);
    if (!state) {
      state = { incorrectAttempts: 0, hintsOffered: 0, completed: false, exercise };
      exerciseState.set(key, state);
    } else {
      // Keep the latest exercise reference (e.g. it now carries answer/solution).
      state.exercise = exercise;
    }
    return state;
  }

  /**
   * Validate Problem_Text without starting a session or touching the engine
   * (Requirement 3.6 / Property 5).
   * @param {string} problemText
   * @returns {{ ok: boolean, reason?: string, message?: string }}
   */
  function validateProblemText(problemText) {
    if (isBlank(problemText)) {
      return {
        ok: false,
        reason: REJECTION.EMPTY_PROBLEM_TEXT,
        message: 'Please enter a math problem before starting.',
      };
    }
    return { ok: true };
  }

  /**
   * Start a tutoring session for the given Problem_Text.
   *
   * Whitespace-only input is rejected *before* any engine call — neither
   * `classifyProblem` nor `generateSolution` runs (Requirement 3.6 / Property 5).
   *
   * @param {string} problemText
   * @param {string} [language]
   * @returns {Promise<{ ok: true, classification: object } | { ok: false, reason: string, message: string }>}
   */
  async function startSession(problemText, language = defaultLanguage) {
    const validation = validateProblemText(problemText);
    if (!validation.ok) return validation;

    activeProblemText = problemText;
    // Fresh session — reset interaction state.
    hintCounts.clear();
    exerciseState.clear();

    const classification = await engine.classifyProblem(problemText, language);
    return { ok: true, classification };
  }

  /**
   * How many hints have already been generated for a given step.
   * @param {number} stepIndex
   * @returns {number}
   */
  function hintCountForStep(stepIndex) {
    return hintCounts.get(stepIndex) || 0;
  }

  /**
   * Request a hint for a solution Step. The cap of {@link MAX_HINTS_PER_STEP}
   * per step is enforced here (Requirement 5.3 / Property 9): once three hints
   * exist for the step, further requests are rejected without generating a new
   * hint.
   *
   * @param {number} stepIndex - zero-based index identifying the step.
   * @param {{stepWorking?: string, stepExplanation?: string}} [step] - step detail
   *   forwarded to the engine's `generateHint`.
   * @param {string} [language]
   * @returns {Promise<{ ok: true, hint: string, hintIndex: number, hintsUsed: number }
   *   | { ok: false, reason: string, message: string, hintsUsed: number }>}
   */
  async function requestHint(stepIndex, step = {}, language = defaultLanguage) {
    const used = hintCountForStep(stepIndex);
    if (used >= MAX_HINTS_PER_STEP) {
      return {
        ok: false,
        reason: REJECTION.HINT_LIMIT_REACHED,
        message: `No more hints — you have used all ${MAX_HINTS_PER_STEP} for this step.`,
        hintsUsed: used,
      };
    }

    const hintIndex = used; // 0-based index of the hint being generated.
    const hint = await engine.generateHint(
      {
        stepWorking: step.stepWorking !== undefined ? step.stepWorking : step.working,
        stepExplanation:
          step.stepExplanation !== undefined ? step.stepExplanation : step.explanation,
        hintIndex,
      },
      language
    );

    hintCounts.set(stepIndex, used + 1);
    return { ok: true, hint, hintIndex, hintsUsed: used + 1 };
  }

  /**
   * Submit an Answer to an Exercise.
   *
   * The answer is validated against the exercise's declared `answerFormat`
   * using {@link answerMatchesFormat} *before* the engine is consulted; a
   * mismatch is rejected inline and `evaluateAnswer` is never called
   * (Requirement 6.6 / Property 13).
   *
   * When the engine evaluates the answer as incorrect on the first or second
   * incorrect attempt, exactly one hint is offered (`hintOffered: true`,
   * Requirement 6.3 / Property 10). Once two incorrect attempts have been made,
   * the result flags `canReveal: true` so the caller may reveal the answer and
   * full solution (Requirement 6.4 / Property 11).
   *
   * @param {object} exercise - the Exercise, carrying at least `answerFormat`.
   * @param {string} studentAnswer
   * @param {string} [language]
   * @returns {Promise<
   *   { ok: false, reason: string, message: string } |
   *   { ok: true, correct: boolean, feedback: object, incorrectAttempts: number,
   *     hintOffered: boolean, canReveal: boolean, completed: boolean }
   * >}
   */
  async function submitAnswer(exercise, studentAnswer, language = defaultLanguage) {
    const state = stateFor(exercise);

    // Gate 1 — answer-format validation before any engine call (P13 / Req 6.6).
    if (!answerMatchesFormat(studentAnswer, exercise && exercise.answerFormat)) {
      return {
        ok: false,
        reason: REJECTION.ANSWER_FORMAT_MISMATCH,
        message: exercise && exercise.answerFormat
          ? `Please enter your answer as ${exercise.answerFormat}.`
          : 'Please enter a valid answer.',
      };
    }

    const feedback = await engine.evaluateAnswer(exercise, studentAnswer, language);
    const correct = Boolean(feedback && feedback.correct);

    if (correct) {
      state.completed = true;
      return {
        ok: true,
        correct: true,
        feedback,
        incorrectAttempts: state.incorrectAttempts,
        hintOffered: false,
        canReveal: false,
        completed: true,
      };
    }

    // Incorrect: record the attempt.
    state.incorrectAttempts += 1;
    const canReveal = state.incorrectAttempts >= INCORRECT_ATTEMPTS_BEFORE_REVEAL;

    // Offer exactly one hint on the first or second incorrect attempt
    // (P10 / Req 6.3).
    const hintOffered = state.incorrectAttempts <= INCORRECT_ATTEMPTS_BEFORE_REVEAL;
    if (hintOffered) state.hintsOffered += 1;

    return {
      ok: true,
      correct: false,
      feedback,
      incorrectAttempts: state.incorrectAttempts,
      hintOffered,
      canReveal,
      completed: false,
    };
  }

  /**
   * Reveal the correct answer and full step-by-step solution for an Exercise
   * and mark it completed. Allowed only after at least
   * {@link INCORRECT_ATTEMPTS_BEFORE_REVEAL} incorrect attempts on that exercise
   * within the current session (Requirement 6.4 / Property 11).
   *
   * The solution is produced via the injected engine's `generateSolution`
   * using the exercise prompt. If the exercise already carries a `solution`
   * array it is used as-is to avoid a redundant engine call.
   *
   * @param {object} exercise
   * @param {string} [language]
   * @returns {Promise<
   *   { ok: false, reason: string, message: string, incorrectAttempts: number } |
   *   { ok: true, answer: string, solution: Array<object>, completed: true }
   * >}
   */
  async function revealAnswer(exercise, language = defaultLanguage) {
    const key = exerciseKey(exercise);
    const state = exerciseState.get(key);

    if (!state) {
      return {
        ok: false,
        reason: REJECTION.UNKNOWN_EXERCISE,
        message: 'No attempts have been recorded for this exercise yet.',
        incorrectAttempts: 0,
      };
    }

    if (state.incorrectAttempts < INCORRECT_ATTEMPTS_BEFORE_REVEAL) {
      return {
        ok: false,
        reason: REJECTION.REVEAL_NOT_ALLOWED,
        message: `The answer can be revealed after ${INCORRECT_ATTEMPTS_BEFORE_REVEAL} incorrect attempts.`,
        incorrectAttempts: state.incorrectAttempts,
      };
    }

    let solution;
    if (Array.isArray(exercise && exercise.solution)) {
      solution = exercise.solution;
    } else if (typeof engine.generateSolution === 'function') {
      solution = await engine.generateSolution(
        exercise && exercise.prompt,
        exercise && exercise.topic,
        language
      );
    } else {
      solution = [];
    }

    state.completed = true;
    return {
      ok: true,
      answer: exercise && typeof exercise.answer === 'string' ? exercise.answer : '',
      solution,
      completed: true,
    };
  }

  /**
   * Snapshot of per-exercise interaction state (for the UI / tests).
   * @param {object} exercise
   * @returns {{ incorrectAttempts: number, hintsOffered: number, completed: boolean, canReveal: boolean }}
   */
  function getExerciseState(exercise) {
    const key = exerciseKey(exercise);
    const state = exerciseState.get(key);
    if (!state) {
      return { incorrectAttempts: 0, hintsOffered: 0, completed: false, canReveal: false };
    }
    return {
      incorrectAttempts: state.incorrectAttempts,
      hintsOffered: state.hintsOffered,
      completed: state.completed,
      canReveal: state.incorrectAttempts >= INCORRECT_ATTEMPTS_BEFORE_REVEAL,
    };
  }

  /** @returns {string|null} the active problem text, if a session has started. */
  function getProblemText() {
    return activeProblemText;
  }

  /** Reset all session state (hints + exercise attempts + active problem). */
  function reset() {
    hintCounts.clear();
    exerciseState.clear();
    activeProblemText = null;
  }

  return {
    // Problem text / session lifecycle
    validateProblemText,
    startSession,
    getProblemText,
    reset,
    // Hints
    hintCountForStep,
    requestHint,
    // Exercise interaction
    submitAnswer,
    revealAnswer,
    getExerciseState,
  };
}

export default createTutorSession;

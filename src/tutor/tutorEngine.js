// src/tutor/tutorEngine.js
/**
 * TutorEngine — orchestrates request/response communication with the WebLLM
 * Web Worker ({@link module:src/tutor/tutorWorker}).
 *
 * Responsibilities:
 *  - Lazily spawn the worker on first use via
 *    `new Worker(new URL('./tutorWorker.js', import.meta.url), { type: 'module' })`.
 *  - Correlate every request/response with a monotonically increasing
 *    `requestId`, resolving/rejecting the matching pending promise.
 *  - Relay init progress messages to subscribers registered via `onProgress`.
 *  - Expose typed async operations: classifyProblem, generateSolution,
 *    generateHint, generateExercises, evaluateAnswer, plus init / ready helpers.
 *  - Guard classification output so callers always receive exactly one
 *    non-empty topic from TOPICS and one valid CurriculumLevel from
 *    CURRICULUM_LEVELS (Property 6), mirroring the worker's own coercion.
 *  - Translate worker rejections into typed errors (TutorParseError /
 *    TutorDeviceUnsupportedError / TutorEngineError) so the UI can show
 *    "could not parse this problem" (Req 5.6) or retry the current step
 *    (Req 5.7), and surface a graceful "device not supported" state when
 *    WebGPU is unavailable.
 *
 * ## Testability — injecting a mock worker
 *
 * The worker relies on WebGPU, which is unavailable under jsdom/Vitest, so the
 * transport is injectable. Instead of importing a module-level singleton,
 * construct an engine with a custom worker factory:
 *
 * ```js
 * import { createTutorEngine } from './tutorEngine.js';
 *
 * // A fake worker that answers canned replies using the same protocol.
 * function fakeWorkerFactory() {
 *   const listeners = new Set();
 *   return {
 *     postMessage(msg) {
 *       // echo a canned success keyed by msg.type
 *       queueMicrotask(() => {
 *         const result = canned[msg.type];
 *         listeners.forEach((fn) =>
 *           fn({ data: { requestId: msg.requestId, ok: true, result } }));
 *       });
 *     },
 *     addEventListener(_type, fn) { listeners.add(fn); },
 *     removeEventListener(_type, fn) { listeners.delete(fn); },
 *     terminate() { listeners.clear(); },
 *   };
 * }
 *
 * const engine = createTutorEngine({ workerFactory: fakeWorkerFactory });
 * const c = await engine.classifyProblem('2 + 2');
 * ```
 *
 * The fake only needs `postMessage`, `addEventListener`/`removeEventListener`
 * (or an `onmessage`/`onerror` property), and `terminate`. Replies must use the
 * worker protocol: `{ requestId, ok: true, result }` or
 * `{ requestId, ok: false, error }`; progress uses `{ type: 'progress', progress }`.
 *
 * The module also exports a default singleton (lazily spawning the real worker)
 * for production use.
 *
 * @module src/tutor/tutorEngine
 */

import { TOPICS, CURRICULUM_LEVELS } from '../types.js';

/**
 * Base class for all TutorEngine errors so callers can `instanceof TutorError`.
 */
export class TutorError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'TutorError';
  }
}

/**
 * Thrown when the model reply could not be parsed into the expected shape —
 * surfaced to the UI as "could not parse this problem" (Requirement 5.6).
 */
export class TutorParseError extends TutorError {
  /** @param {string} [message] */
  constructor(message) {
    super(message || 'Could not parse this problem.');
    this.name = 'TutorParseError';
  }
}

/**
 * Thrown for a generic engine/step failure so the UI can retry the current step
 * while preserving prior steps (Requirement 5.7).
 */
export class TutorEngineError extends TutorError {
  /** @param {string} [message] */
  constructor(message) {
    super(message || 'The tutor engine encountered an error.');
    this.name = 'TutorEngineError';
  }
}

/**
 * Thrown when the device cannot run the on-device model (WebGPU unavailable).
 * Lets the UI show a graceful "device not supported" state.
 */
export class TutorDeviceUnsupportedError extends TutorError {
  /** @param {string} [message] */
  constructor(message) {
    super(message || 'This device cannot run the on-device tutor.');
    this.name = 'TutorDeviceUnsupportedError';
  }
}

/**
 * Classify a raw worker error string into the appropriate typed error.
 * @param {string} message
 * @returns {TutorError}
 */
function toTypedError(message) {
  const text = typeof message === 'string' ? message : String(message ?? '');
  const lower = text.toLowerCase();

  if (lower.includes('webgpu') || lower.includes('webassembly fallback')) {
    return new TutorDeviceUnsupportedError(text);
  }
  if (lower.includes('json') || lower.includes('parse') || lower.includes('no text')) {
    return new TutorParseError(text);
  }
  return new TutorEngineError(text);
}

/**
 * Default worker factory — spawns the real module worker. Kept as a separate
 * function so tests can substitute a fake transport.
 * @returns {Worker}
 */
function defaultWorkerFactory() {
  return new Worker(new URL('./tutorWorker.js', import.meta.url), { type: 'module' });
}

/**
 * Coerce a raw value to exactly one non-empty topic from {@link TOPICS}.
 * Mirrors the worker so the engine can guarantee Property 6 independently of
 * the transport (including mocked workers that may return loose values).
 * @param {*} raw
 * @returns {string}
 */
function coerceTopic(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const exact = TOPICS.find((t) => t.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const partial = TOPICS.find(
    (t) =>
      value.length > 0 &&
      (t.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(t.toLowerCase()))
  );
  return partial || TOPICS[0];
}

/**
 * Coerce a raw value to a valid {@link CURRICULUM_LEVELS} value.
 * @param {*} raw
 * @returns {string}
 */
function coerceLevel(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const exact = CURRICULUM_LEVELS.find((l) => l.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const compact = value.replace(/\s+/g, '').toLowerCase();
  const partial = CURRICULUM_LEVELS.find((l) => l.toLowerCase() === compact);
  return partial || CURRICULUM_LEVELS[0];
}

/**
 * Normalise a classification result so callers always get exactly one valid
 * topic + curriculumLevel and a confidence in [0, 1] (Property 6).
 * @param {*} result
 * @returns {{ topic: string, curriculumLevel: string, confidence: number }}
 */
function normaliseClassification(result) {
  const obj = result && typeof result === 'object' ? result : {};
  const confidence =
    typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : 0.5;
  return {
    topic: coerceTopic(obj.topic),
    curriculumLevel: coerceLevel(obj.curriculumLevel),
    confidence,
  };
}

/**
 * Create a TutorEngine instance.
 *
 * @param {object} [options]
 * @param {() => (Worker|object)} [options.workerFactory] - factory returning a
 *   worker-like transport (see module docs for the minimal shape). Defaults to
 *   spawning the real module worker.
 * @returns {{
 *   init: (language?: string) => Promise<void>,
 *   isReady: () => boolean,
 *   whenReady: () => Promise<void>,
 *   onProgress: (cb: (progress: any) => void) => (() => void),
 *   classifyProblem: (problemText: string, language?: string) => Promise<{topic: string, curriculumLevel: string, confidence: number}>,
 *   generateSolution: (problemText: string, topic?: string, language?: string) => Promise<Array<object>>,
 *   generateHint: (step: {stepWorking?: string, stepExplanation?: string, hintIndex?: number}, language?: string) => Promise<string>,
 *   generateExercises: (topic: string, level: string, count: number, language?: string) => Promise<Array<object>>,
 *   evaluateAnswer: (exercise: object, studentAnswer: string, language?: string) => Promise<{correct: boolean, explanation: string}>,
 *   terminate: () => void,
 * }}
 */
export function createTutorEngine(options = {}) {
  const workerFactory =
    typeof options.workerFactory === 'function' ? options.workerFactory : defaultWorkerFactory;

  /** @type {Worker|object|null} */
  let worker = null;
  /** Pending requests keyed by requestId. @type {Map<number, {resolve: Function, reject: Function}>} */
  const pending = new Map();
  /** Progress subscribers. @type {Set<(progress: any) => void>} */
  const progressListeners = new Set();
  /** Monotonically increasing request id. */
  let nextRequestId = 1;
  /** Readiness state driven by a successful `init`. */
  let ready = false;
  /** @type {Promise<void>|null} */
  let initPromise = null;

  /**
   * Handle a message from the worker: route replies to the matching pending
   * promise, and progress messages to subscribers.
   * @param {MessageEvent|{data: any}} event
   */
  function handleMessage(event) {
    const data = event && event.data ? event.data : {};

    if (data.type === 'progress') {
      progressListeners.forEach((cb) => {
        try {
          cb(data.progress);
        } catch {
          /* a faulty subscriber must not break the engine */
        }
      });
      return;
    }

    const { requestId } = data;
    if (requestId == null) return;
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);

    if (data.ok) {
      entry.resolve(data.result);
    } else {
      entry.reject(toTypedError(data.error));
    }
  }

  /**
   * Handle a transport-level error: reject all in-flight requests so callers
   * are never left hanging.
   * @param {*} err
   */
  function handleError(err) {
    const message =
      err && err.message
        ? err.message
        : 'The tutor worker failed to start. Check the browser console for a script or module error.';
    const typed = toTypedError(message);
    pending.forEach((entry) => entry.reject(typed));
    pending.clear();
  }

  /** Lazily spawn the worker and wire up listeners. */
  function ensureWorker() {
    if (worker) return worker;
    worker = workerFactory();

    if (typeof worker.addEventListener === 'function') {
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', (e) => handleError(e));
    } else {
      // Fall back to the on* property style used by the DOM Worker interface.
      worker.onmessage = handleMessage;
      worker.onerror = (e) => handleError(e);
    }
    return worker;
  }

  /**
   * Post a request to the worker and return a promise correlated by requestId.
   * @param {string} type
   * @param {object} payload
   * @returns {Promise<*>}
   */
  function request(type, payload) {
    const w = ensureWorker();
    const requestId = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        w.postMessage({ requestId, type, payload });
      } catch (err) {
        pending.delete(requestId);
        reject(toTypedError(err && err.message ? err.message : String(err)));
      }
    });
  }

  /**
   * Initialise the worker/model. Idempotent: concurrent calls share one
   * initialisation. On failure the promise is cleared so a later call retries.
   * @param {string} [language]
   * @returns {Promise<void>}
   */
  function init(language) {
    if (ready) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = request('init', { language })
      .then(() => {
        ready = true;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });

    return initPromise;
  }

  /** @returns {boolean} whether the engine has completed initialisation. */
  function isReady() {
    return ready;
  }

  /**
   * Await readiness, triggering initialisation if it has not started.
   * @returns {Promise<void>}
   */
  function whenReady() {
    return init();
  }

  /**
   * Subscribe to init progress messages. Returns an unsubscribe function.
   * @param {(progress: any) => void} cb
   * @returns {() => void}
   */
  function onProgress(cb) {
    if (typeof cb !== 'function') return () => {};
    progressListeners.add(cb);
    return () => progressListeners.delete(cb);
  }

  /**
   * Classify a math problem into exactly one topic + curriculum level.
   * @param {string} problemText
   * @param {string} [language]
   * @returns {Promise<{topic: string, curriculumLevel: string, confidence: number}>}
   */
  async function classifyProblem(problemText, language) {
    const result = await request('classify', { problemText, language });
    // Guard on the engine side too — callers always get one valid result.
    return normaliseClassification(result);
  }

  /**
   * Generate an ordered array of solution steps.
   * @param {string} problemText
   * @param {string} [topic]
   * @param {string} [language]
   * @returns {Promise<Array<object>>}
   */
  async function generateSolution(problemText, topic, language) {
    const result = await request('solution', { problemText, topic, language });
    if (!Array.isArray(result)) {
      throw new TutorParseError('Solution response was not a list of steps.');
    }
    return result;
  }

  /**
   * Generate a single hint for a step that never reveals the answer.
   * @param {{stepWorking?: string, stepExplanation?: string, hintIndex?: number}} step
   * @param {string} [language]
   * @returns {Promise<string>}
   */
  async function generateHint(step, language) {
    const { stepWorking, stepExplanation, hintIndex } = step || {};
    const result = await request('hint', {
      stepWorking,
      stepExplanation,
      hintIndex,
      language,
    });
    return typeof result === 'string' ? result : String(result ?? '');
  }

  /**
   * Generate a set of unique practice exercises.
   * @param {string} topic
   * @param {string} level
   * @param {number} count
   * @param {string} [language]
   * @returns {Promise<Array<object>>}
   */
  async function generateExercises(topic, level, count, language) {
    const result = await request('exercises', {
      topic,
      curriculumLevel: level,
      count,
      language,
    });
    if (!Array.isArray(result)) {
      throw new TutorParseError('Exercise response was not a list.');
    }
    return result;
  }

  /**
   * Evaluate a student's answer for an exercise.
   * @param {object} exercise
   * @param {string} studentAnswer
   * @param {string} [language]
   * @returns {Promise<{correct: boolean, explanation: string}>}
   */
  async function evaluateAnswer(exercise, studentAnswer, language) {
    const result = await request('evaluate', { exercise, studentAnswer, language });
    const obj = result && typeof result === 'object' ? result : {};
    return {
      correct: Boolean(obj.correct),
      explanation:
        typeof obj.explanation === 'string' ? obj.explanation : String(obj.explanation ?? ''),
    };
  }

  /** Terminate the worker and reject any in-flight requests. */
  function terminate() {
    if (!worker) return;
    if (typeof worker.removeEventListener === 'function') {
      worker.removeEventListener('message', handleMessage);
    }
    handleError(new TutorEngineError('Tutor engine was terminated.'));
    if (typeof worker.terminate === 'function') worker.terminate();
    worker = null;
    ready = false;
    initPromise = null;
  }

  return {
    init,
    isReady,
    whenReady,
    onProgress,
    classifyProblem,
    generateSolution,
    generateHint,
    generateExercises,
    evaluateAnswer,
    terminate,
  };
}

/**
 * Default production engine singleton — lazily spawns the real module worker on
 * first use. Tests should prefer {@link createTutorEngine} with a mock factory.
 */
const defaultEngine = createTutorEngine();

export const init = (language) => defaultEngine.init(language);
export const isReady = () => defaultEngine.isReady();
export const whenReady = () => defaultEngine.whenReady();
export const onProgress = (cb) => defaultEngine.onProgress(cb);
export const classifyProblem = (problemText, language) =>
  defaultEngine.classifyProblem(problemText, language);
export const generateSolution = (problemText, topic, language) =>
  defaultEngine.generateSolution(problemText, topic, language);
export const generateHint = (step, language) => defaultEngine.generateHint(step, language);
export const generateExercises = (topic, level, count, language) =>
  defaultEngine.generateExercises(topic, level, count, language);
export const evaluateAnswer = (exercise, studentAnswer, language) =>
  defaultEngine.evaluateAnswer(exercise, studentAnswer, language);

export default defaultEngine;

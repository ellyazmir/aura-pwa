/**
 * tutorWorker.js — on-device WebLLM inference Web Worker.
 *
 * Spawned by {@link module:src/tutor/tutorEngine} (task 8.2) via:
 *   new Worker(new URL('./tutorWorker.js', import.meta.url), { type: 'module' })
 *
 * Responsibilities:
 *  - Initialise a Qwen3 model via WebLLM, picking a size tier from the device
 *    (desktop vs phone) and the GPU's reported limits. Falls back to smaller
 *    tiers if a model fails to load (e.g. out of memory). Weights are cached in
 *    IndexedDB so the model works offline after the first download.
 *  - WebGPU is required. We probe for a real adapter (not just `navigator.gpu`)
 *    and post a clear capability error when none exists, so the UI can surface a
 *    graceful "device not supported" state.
 *  - Optionally use Qwen3 "thinking" mode for reasoning-heavy requests
 *    (solution / evaluate) on capable desktop devices; `<think>` blocks are
 *    stripped before JSON extraction.
 *  - Correlate every request/response with a `requestId`.
 *  - Inject a language-aware system prompt enforcing the notation and
 *    explanation rules from the design document.
 *
 * Message protocol (inbound): { requestId, type, payload }
 *   type: 'init'      payload: { language?: 'en'|'ms' }
 *   type: 'classify'  payload: { problemText, language? }
 *   type: 'solution'  payload: { problemText, topic?, language? }
 *   type: 'hint'      payload: { stepWorking, stepExplanation?, hintIndex?, language? }
 *   type: 'exercises' payload: { topic, curriculumLevel, count, language? }
 *   type: 'evaluate'  payload: { exercise, studentAnswer, language? }
 *
 * Message protocol (outbound):
 *   success:  { requestId, ok: true,  result }
 *   failure:  { requestId, ok: false, error }
 *   progress: { type: 'progress', progress }   (init only; no requestId needed)
 *
 * @module src/tutor/tutorWorker
 */

import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { TOPICS, CURRICULUM_LEVELS } from '../types.js';

/**
 * Model tiers, largest first. Sizes are approximate download/VRAM footprints.
 *  - large:  ~3 GB   (desktop with a decent GPU)
 *  - medium: ~1.2 GB (phones with WebGPU, or smaller desktop GPUs)
 *  - small:  ~0.5 GB (weak phones)
 */
const MODEL_TIERS = {
  // large: 'Qwen3-4B-q4f16_1-MLC',   // ← too aggressive for many GPUs
  large:  'Qwen3-1.7B-q4f16_1-MLC',   // safer "large"
  medium: 'Qwen3-0.6B-q4f16_1-MLC',
  small:  'Qwen3-0.6B-q4f16_1-MLC',   // or keep a smaller one if available
};

/** Tier order used for the out-of-memory fallback chain. */
const TIER_ORDER = ['large', 'medium', 'small'];

/**
 * Set to 'large' | 'medium' | 'small' to skip auto-detection (useful for testing
 * a specific model). Leave null for automatic selection.
 * @type {'large'|'medium'|'small'|null}
 */
const FORCE_TIER = 'medium';

/** Default model id (kept as an export for tests / backwards compatibility). */
const MODEL_ID = MODEL_TIERS.large;

/**
 * Human-readable reply language names keyed by LanguageCode. Injected into the
 * system prompt's `{language}` slot so the model answers in the chosen language.
 * @type {Record<string, string>}
 */
const LANGUAGE_NAMES = {
  en: 'English',
  ms: 'Bahasa Malaysia',
};

/**
 * The language-aware system prompt template. Mirrors the `tutor.system_prompt`
 * i18next entry; embedded here because the worker cannot share the i18n runtime.
 * `{language}` is the injection point for the reply language.
 */
const SYSTEM_PROMPT_TEMPLATE =
  'You are Aura, a math tutor for Malaysian students (KSSR/KSSM syllabus). ' +
  'Always reply in {language}. ' +
  'Use × for multiplication, ÷ for division, x^n for exponents, a/b for fractions. ' +
  'Keep each step explanation under 40 words. ' +
  'Never reveal the answer in a hint.';

/** @type {import('@mlc-ai/web-llm').MLCEngineInterface | null} */
let engine = null;
/** Guards against concurrent/duplicate init calls. @type {Promise<void> | null} */
let initPromise = null;
/** Tier of the model that actually loaded. @type {'large'|'medium'|'small'|null} */
let activeTier = null;
/**
 * Lowest-index tier allowed (0 = large). Raised after a GPU device loss so we
 * never reload a model the GPU could not handle.
 */
let minTierIndex = 0;

/**
 * Build the system prompt for a given language code, defaulting to English.
 * @param {string} [language]
 * @returns {string}
 */
function buildSystemPrompt(language) {
  const name = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en;
  return SYSTEM_PROMPT_TEMPLATE.replace('{language}', name);
}

/** @returns {boolean} true when running on a phone/tablet (user-agent heuristic). */
function isMobile() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

/**
 * Probe for a real WebGPU adapter. `navigator.gpu` can exist while
 * `requestAdapter()` still returns null (no usable GPU, hardware acceleration
 * off, blocklisted driver), so checking the object alone is not enough.
 * @returns {Promise<GPUAdapter|null>}
 */
async function getGpuAdapter() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  try {
    return (await navigator.gpu.requestAdapter()) || null;
  } catch {
    return null;
  }
}

/**
 * Choose the starting tier from device type and the adapter's buffer limit.
 * @param {GPUAdapter} adapter
 * @returns {'large'|'medium'|'small'}
 */
function pickTier(adapter) {
  if (FORCE_TIER) return FORCE_TIER;

  const maxBuf = (adapter?.limits?.maxBufferSize) || 0;
  const GB = 1024 ** 3;
  const vendor = String(adapter?.info?.vendor || '').toLowerCase();

  // Very conservative defaults
  if (isMobile()) return 'small';

  // Only true NVIDIA discrete with lots of buffer → medium
  if (vendor.includes('nvidia') && maxBuf >= 3 * GB) return 'medium';

  // Everything else (Intel, AMD iGPU, older cards) → small
  return 'small';
}

/**
 * True when an error means "no usable GPU" — retrying a smaller model on the
 * same missing GPU is pointless, so we surface it immediately.
 * @param {*} err
 * @returns {boolean}
 */
function isGpuUnavailableError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return (
    msg.includes('compatible gpu') ||
    msg.includes('webgpu is not available') ||
    msg.includes('adapter') ||
    msg.includes('no gpu')
  );
}

/**
 * Lazily initialise the WebLLM engine. Idempotent: repeated calls await the
 * same initialisation. Throws a descriptive error when no GPU is available.
 *
 * The message for the no-GPU case contains "WebGPU" so the engine layer maps it
 * to `TutorDeviceUnsupportedError`.
 *
 * @param {string} [language] - accepted for symmetry with the protocol.
 * @returns {Promise<void>}
 */
function ensureEngine(language) {
  if (engine) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const adapter = await getGpuAdapter();
    if (!adapter) {
      throw new Error(
        'WebGPU is not available: no compatible GPU adapter was found. ' +
          "Aura's on-device tutor needs a WebGPU-capable browser with hardware " +
          'acceleration enabled.'
      );
    }

    const config = {
      initProgressCallback: (progress) => {
        // Forward download / load progress to the main thread. These are not
        // tied to a single requestId — the engine relays them to its listeners.
        self.postMessage({ type: 'progress', progress });
      },
      // Persist weights in IndexedDB so the model works offline after first load.
      appConfig: { ...prebuiltAppConfig, useIndexedDBCache: true },
    };
    // A smaller context window saves a lot of memory on phones.
    const chatOpts = isMobile() ? { context_window_size: 1024 } : {};

    const startTier = pickTier(adapter);
    const chain = TIER_ORDER.slice(TIER_ORDER.indexOf(startTier));

    let lastErr = null;
    for (const tier of chain) {
      try {
        engine = await CreateMLCEngine(MODEL_TIERS[tier], config, chatOpts);
        activeTier = tier;
        return;
      } catch (err) {
        lastErr = err;
        engine = null;
        if (isGpuUnavailableError(err)) throw err;
        // Otherwise (e.g. out of memory) try the next smaller tier.
      }
    }
    throw lastErr || new Error('Failed to load any tutor model.');
  })();

  // If init fails, clear the cached promise so a later attempt can retry.
  initPromise.catch(() => {
    initPromise = null;
  });

  return initPromise;
}

/**
 * Remove Qwen3 reasoning blocks, including an unterminated one left by a
 * truncated reply. These can contain braces that would confuse extractJson.
 * @param {*} text
 * @returns {string}
 */
function stripThinking(text) {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

/**
 * Whether thinking mode is allowed on this device. It generates thousands of
 * tokens, so it is limited to desktop with the large model.
 * @returns {boolean}
 */
function canThink() {
  // Disable thinking until everything is stable
  return false;

  // Original (too aggressive):
  // return !isMobile() && activeTier === 'large';
}

/**
 * Run a single-turn chat completion with the system + user messages and return
 * the assistant text with any `<think>` block removed.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [opts]
 * @param {number} [opts.temperature] - used in non-thinking mode.
 * @param {boolean} [opts.think] - request Qwen3 thinking mode (if allowed).
 * @param {number} [opts.maxTokens]
 * @returns {Promise<string>}
 */
async function chatOnce(systemPrompt, userPrompt, opts = {}) {
  if (!engine) throw new Error('Tutor engine is not initialised.');
  const think = Boolean(opts.think) && canThink();

    const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Qwen3 recommended sampling: thinking 0.6 / 0.95, non-thinking 0.7 / 0.8.
    temperature: think ? 0.6 : opts.temperature ?? 0.7,
    top_p: think ? 0.95 : 0.8,
    max_tokens: opts.maxTokens ?? (think ? 1024 : 512),
    extra_body: { enable_thinking: think },
    // Grammar-constrained JSON when a schema is supplied.
    ...(opts.schema
      ? { response_format: { type: 'json_object', schema: JSON.stringify(opts.schema) } }
      : {}),
  });

  const text = stripThinking(reply?.choices?.[0]?.message?.content);

  // Thinking ran out of tokens before producing an answer: retry once, fast.
  if (think && text === '') {
    return chatOnce(systemPrompt, userPrompt, { ...opts, think: false });
  }
  return text;
}

/**
 * True when an error means the GPU device was lost / the engine was disposed
 * (driver timeout, out of memory). The loaded model is unusable after this.
 * @param {*} err
 * @returns {boolean}
 */
function isDeviceLostError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return (
    msg.includes('already been disposed') ||
    msg.includes('device was lost') ||
    msg.includes('device_hung') ||
    msg.includes('device lost')
  );
}

/**
 * Drop the dead engine and forbid the tier that just failed, so the next
 * `ensureEngine` loads a smaller model.
 */
async function resetEngineAfterDeviceLoss() {
  const current = activeTier ? TIER_ORDER.indexOf(activeTier) : minTierIndex;
  minTierIndex = Math.min(TIER_ORDER.length - 1, Math.max(minTierIndex, current + 1));
  try {
    if (engine && typeof engine.unload === 'function') await engine.unload();
  } catch {
    /* the engine is already dead; ignore */
  }
  engine = null;
  initPromise = null;
  activeTier = null;
}

/**
 * Chat with automatic recovery: if the GPU device is lost mid-request, reload a
 * smaller model (without thinking) and retry once.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} [opts]
 * @returns {Promise<string>}
 */
async function chat(systemPrompt, userPrompt, opts = {}) {
  await ensureEngine();
  try {
    return await chatOnce(systemPrompt, userPrompt, opts);
  } catch (err) {
    if (!isDeviceLostError(err)) throw err;
    await resetEngineAfterDeviceLoss();
    try {
      await ensureEngine();
      return await chatOnce(systemPrompt, userPrompt, { ...opts, think: false });
    } catch (retryErr) {
      if (isDeviceLostError(retryErr)) {
        throw new Error(
          'WebGPU device was lost and could not recover. Close other GPU-heavy ' +
            'tabs, update your graphics driver, or use a device with more GPU memory.'
        );
      }
      throw retryErr;
    }
  }
}

/**
 * Extract the first JSON value (object or array) embedded in a model reply.
 * Models often wrap JSON in prose or ``` fences; this pulls out the first
 * balanced `{...}` or `[...]` span and parses it.
 * @param {string} text
 * @returns {*} the parsed JSON value
 * @throws {Error} when no parseable JSON is found
 */
function extractJson(text) {
  if (typeof text !== 'string') throw new Error('Model returned no text.');

  // Strip code fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;

  // Small models sometimes put prose brackets ("[Step 1]") before the real JSON,
  // so try each `[` or `{` in turn until one balanced span parses.
  let sawCandidate = false;
  for (let start = body.search(/[[{]/); start !== -1; start = nextOpen(body, start + 1)) {
    const span = balancedSpan(body, start);
    if (!span) continue;
    sawCandidate = true;
    const parsed = tryParse(span);
    if (parsed !== undefined) return parsed;
  }
  if (!sawCandidate) throw new Error('No JSON found in model response.');
  throw new Error('Malformed JSON in model response.');
}

/** Index of the next `[` or `{` at or after `from`, or -1. */
function nextOpen(body, from) {
  const rest = body.slice(from).search(/[[{]/);
  return rest === -1 ? -1 : from + rest;
}

/** The balanced `{...}` / `[...]` span starting at `start`, or null if unbalanced. */
function balancedSpan(body, start) {
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

/** JSON.parse with two cheap repairs (trailing commas, stray LaTeX backslashes). */
function tryParse(span) {
  const attempts = [
    span,
    span.replace(/,\s*([\]}])/g, '$1'),
    span.replace(/,\s*([\]}])/g, '$1').replace(/\\(?!["\\/bfnrtu])/g, '\\\\'),
  ];
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next repair */
    }
  }
  return undefined;
}

/**
 * Last-resort step extraction for replies that are not valid JSON: pulls
 * "working"/"explanation" string pairs, or falls back to "Step N" prose.
 * @param {string} text
 * @returns {Array<{working: string, explanation: string}>}
 */
function lenientSteps(text) {
  if (typeof text !== 'string') return [];
  const str = '"((?:[^"\\\\]|\\\\.)*)"';
  const pair = new RegExp(`"working"\\s*:\\s*${str}\\s*,\\s*"explanation"\\s*:\\s*${str}`, 'g');
  const steps = [];
  for (const m of text.matchAll(pair)) {
    steps.push({ working: m[1].replace(/\\(["\\])/g, '$1'), explanation: m[2].replace(/\\(["\\])/g, '$1') });
  }
  if (steps.length > 0) return steps;

  const chunks = text.split(/^\s*(?:[*#]+\s*)?(?:Step|Langkah)\s*\d+\s*[:.)-]*\s*(?:\*+)?/gim).slice(1);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    steps.push({ working: lines[0], explanation: lines.slice(1).join(' ') });
  }
  return steps;
}
/** @returns {string} a best-effort UUID for generated exercises. */
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Coerce a raw string to a valid topic from {@link TOPICS}. Matches
 * case-insensitively and falls back to the closest containing topic, then to
 * the first topic so a result is always produced.
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
 * Coerce a raw string to a valid {@link CURRICULUM_LEVELS} value.
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

/** JSON schema for solution replies; WebLLM enforces it, so the JSON can't be malformed. */
const SOLUTION_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          working: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['working', 'explanation'],
      },
    },
  },
  required: ['steps'],
};

/**
 * classify — return exactly one topic and one curriculum level.
 * @param {{ problemText: string, language?: string }} payload
 * @returns {Promise<{ topic: string, curriculumLevel: string, confidence: number }>}
 */
async function handleClassify(payload) {
  const { problemText, language } = payload || {};
  const system = buildSystemPrompt(language);
  const user =
    'Identify exactly ONE topic and ONE curriculum level for this math problem.\n' +
    `Valid topics (choose exactly one): ${JSON.stringify(TOPICS)}\n` +
    `Valid curriculum levels (choose exactly one): ${JSON.stringify(CURRICULUM_LEVELS)}\n` +
    'Respond ONLY with JSON of the form ' +
    '{"topic": "<one topic>", "curriculumLevel": "<one level>", "confidence": <0..1>}.\n\n' +
    `Problem: ${problemText}`;

  // Fast path: no thinking needed for a simple classification.
  const text = await chat(system, user, { temperature: 0.2, think: false });
  const parsed = extractJson(text);
  const obj = Array.isArray(parsed) ? parsed[0] || {} : parsed || {};

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
/** Evaluate a plain arithmetic expression, or return null if it isn't one. */
function evalArithmetic(text) {
  const expr = String(text || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/\s+/g, '');
  // Only digits, dots, operators and parentheses; safe to evaluate.
  if (!/^[\d.+\-*/()]+$/.test(expr) || !/\d/.test(expr)) return null;
  try {
    const v = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * solution — return an ordered array of steps.
 * @param {{ problemText: string, topic?: string, language?: string }} payload
 * @returns {Promise<Array<{ number: number, total: number, working: string, explanation: string }>>}
 */
async function handleSolution(payload) {
  const { problemText, topic, language } = payload || {};
  const system = buildSystemPrompt(language);
  const user =
    'Solve this problem step by step. For each step give the mathematical ' +
    'working and a short plain-language explanation (≤ 40 words, never exceed 40 words).\n' +
    (topic ? `Topic: ${topic}\n` : '') +
    'Respond ONLY with JSON of the form ' +
    '{"steps": [{"working": "<working>", "explanation": "<why, ≤40 words>"}]}.\n\n' +
    `Problem: ${problemText}`;

  const strict = user + '\n\nOutput valid JSON only. Use double quotes for all strings.';
  let arr = null;
  let lastText = '';
  for (const attempt of [
    { prompt: user, temperature: 0.4, think: true },
    { prompt: strict, temperature: 0.1, think: false },
  ]) {
    lastText = await chat(system, attempt.prompt, {
      temperature: attempt.temperature,
      think: attempt.think,
      maxTokens: 1024,
      schema: SOLUTION_SCHEMA,
    });
    try {
      const parsed = extractJson(lastText);
      arr = Array.isArray(parsed) ? parsed : parsed.steps ?? [parsed];
    } catch {
      arr = lenientSteps(lastText);
    }
    if (arr && arr.length > 0) break;
  }
  if (!arr || arr.length === 0) {
    console.warn('[aura-worker] unparseable solution reply:', lastText);
    throw new Error(`Malformed JSON in model response: ${lastText.slice(0, 120)}`);
  }
  const total = arr.length;

  const truth = evalArithmetic(problemText);
  if (truth !== null) {
    const last = arr[arr.length - 1] || {};
    const lastWork = String(last.working ?? '').replace(/\s+/g, '');
    if (!lastWork.includes(String(truth))) {
      // The model's final answer is wrong; replace it with the computed one.
      arr = [...arr.slice(0, -1), {
        working: `= ${truth}`,
        explanation: 'Calculate the result of the whole expression.',
      }];
    }
  }

  return arr.map((s, i) => ({
    number: i + 1,
    total,
    working: typeof s.working === 'string' ? s.working : String(s.working ?? ''),
    explanation:
      typeof s.explanation === 'string' ? s.explanation : String(s.explanation ?? ''),
  }));
}

/**
 * hint — return a single hint string that never reveals the answer.
 * @param {{ stepWorking?: string, stepExplanation?: string, hintIndex?: number, language?: string }} payload
 * @returns {Promise<string>}
 */
async function handleHint(payload) {
  const { stepWorking, stepExplanation, hintIndex, language } = payload || {};
  const system = buildSystemPrompt(language);
  const user =
    'You are giving a hint, NOT the answer. Write ONE short hint (max 25 words) ' +
    'that points to the method or rule to use, or asks a guiding question. ' +
    'Do NOT write the result, do NOT repeat the working, and do NOT include any ' +
    'equation or final number.\\n' +
    (typeof hintIndex === 'number' ? `This is hint number ${hintIndex + 1}; make it a little more specific than the last.\\n` : '') +
    (stepExplanation ? `What this step does: ${stepExplanation}\\n` : '') +
    'Respond with the hint text only. No "Hint:" label.';

  const raw = await chat(system, user, { temperature: 0.6, think: false, maxTokens: 120 });
  const hint = raw.trim().replace(/^hint\\s*\\d*\\s*[:.\\-]\\s*/i, '');

  // Reject empty hints or ones that restate the step's working.
  const norm = (s) => String(s || '').toLowerCase().replace(/\\s+/g, '');
  const leaked = stepWorking && norm(hint).includes(norm(stepWorking));
  if (!hint || leaked) {
    return language === 'ms'
      ? 'Baca semula soalan dan fikirkan peraturan atau operasi yang perlu digunakan dahulu.'
      : 'Re-read the step and think about which rule or operation you need to use first.';
  }
  return hint;
}

/**
 * exercises — return an array of unique practice exercises.
 * @param {{ topic: string, curriculumLevel: string, count?: number, language?: string }} payload
 * @returns {Promise<Array<object>>}
 */
async function handleExercises(payload) {
  const { topic, curriculumLevel, count, language } = payload || {};
  const n = Math.max(1, Math.min(5, Number(count) || 1));
  const level = coerceLevel(curriculumLevel);
  const safeTopic = coerceTopic(topic);
  const system = buildSystemPrompt(language);
  const user =
    `Generate ${n} UNIQUE practice problems on the topic "${safeTopic}" ` +
    `for curriculum level "${level}". No two problems may share the same prompt.\n` +
    'Respond ONLY with a JSON array where each element is ' +
    '{"prompt": "<question>", "answerFormat": "<integer|decimal|fraction|percentage>", ' +
    '"answer": "<correct answer>"}.';

  const text = await chat(system, user, { temperature: 0.7, think: false });
  const parsed = extractJson(text);
  const arr = Array.isArray(parsed) ? parsed : [parsed];

  return arr.slice(0, n).map((e) => ({
    id: uuid(),
    prompt: typeof e.prompt === 'string' ? e.prompt : String(e.prompt ?? ''),
    answerFormat: typeof e.answerFormat === 'string' ? e.answerFormat : 'decimal',
    answer: typeof e.answer === 'string' ? e.answer : String(e.answer ?? ''),
    topic: safeTopic,
    curriculumLevel: level,
  }));
}

/**
 * evaluate — judge the student's answer and explain in one sentence.
 * @param {{ exercise: object, studentAnswer: string, language?: string }} payload
 * @returns {Promise<{ correct: boolean, explanation: string }>}
 */
async function handleEvaluate(payload) {
  const { exercise, studentAnswer, language } = payload || {};
  const ex = exercise || {};
  const system = buildSystemPrompt(language);
  const user =
    'Decide whether the student\'s answer is correct, then explain in ONE sentence.\n' +
    `Problem: ${ex.prompt ?? ''}\n` +
    `Correct answer: ${ex.answer ?? ''}\n` +
    `Student answer: ${studentAnswer}\n` +
    'Respond ONLY with JSON {"correct": <true|false>, "explanation": "<one sentence>"}.';

  // Judging equivalence (e.g. 0.5 vs 1/2) benefits from reasoning where allowed.
  const text = await chat(system, user, { temperature: 0.2, think: true, maxTokens: 1536 });
  const obj = extractJson(text);

  return {
    correct: Boolean(obj.correct),
    explanation:
      typeof obj.explanation === 'string' ? obj.explanation : String(obj.explanation ?? ''),
  };
}

/**
 * Dispatch a request type to its handler.
 * @param {string} type
 * @param {object} payload
 * @returns {Promise<*>}
 */
async function dispatch(type, payload) {
  switch (type) {
    case 'init':
      return ensureEngine(payload && payload.language);
    case 'classify':
      await ensureEngine(payload && payload.language);
      return handleClassify(payload);
    case 'solution':
      await ensureEngine(payload && payload.language);
      return handleSolution(payload);
    case 'hint':
      await ensureEngine(payload && payload.language);
      return handleHint(payload);
    case 'exercises':
      await ensureEngine(payload && payload.language);
      return handleExercises(payload);
    case 'evaluate':
      await ensureEngine(payload && payload.language);
      return handleEvaluate(payload);
    default:
      throw new Error(`Unknown request type: ${String(type)}`);
  }
}

self.onmessage = async (event) => {
  const data = event && event.data ? event.data : {};
  const { requestId, type, payload } = data;

  try {
    const result = await dispatch(type, payload);
    self.postMessage({ requestId, ok: true, result });
  } catch (err) {
    self.postMessage({
      requestId,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};

// Exported for unit testing / reuse by the engine. These are pure helpers that
// do not require the worker runtime.
export {
  MODEL_ID,
  MODEL_TIERS,
  SYSTEM_PROMPT_TEMPLATE,
  buildSystemPrompt,
  extractJson,
  stripThinking,
  coerceTopic,
  coerceLevel,
};
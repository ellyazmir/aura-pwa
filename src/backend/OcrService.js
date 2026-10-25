/**
 * OCRService — runs Tesseract.js in the browser (offline once assets are cached).
 *
 * Public contract is unchanged from the Roboflow version:
 *   runOCR(file) -> { text, confidence, parsed }
 * `text` is the row/column-arranged text and `confidence` is 0..1. `parsed` is
 * new: { number, question, options: [{ label, text }], format, warnings }.
 *
 * Errors thrown:
 *   OCRNetworkError       – the OCR engine or language data could not be loaded
 *   OCRTimeoutError       – recognition did not finish in time
 *   OCRLowConfidenceError – nothing readable was returned
 *   OCRAPIError           – kept so existing imports keep working; no longer thrown
 *
 * Language priority (English first, Bahasa Malaysia only when there is no English):
 *   1. Tesseract reads with both models (`eng` primary, `msa` second), because a
 *      page can mix the two languages line by line.
 *   2. Each OCR line is classified with languageFilter. When any English line
 *      exists, Malay lines are dropped; with no English line everything is kept.
 *   3. Surviving words are re-arranged into rows/columns with layout.js.
 *
 * Pipeline: drop black tags, flatten shadows, straighten, remove table borders
 * -> Tesseract -> filter
 * language -> layout -> parse question and options. If the first page-segmentation
 * mode does not find all options, a second one (sparse text) is tried.
 */

import { createWorker, OEM, PSM } from 'tesseract.js';
import { preferEnglish } from './OcrPreprocess.js';
import { layoutText } from './layout.js';
import { removeGridLines } from './QuestionParser.js';
import { cleanPage } from './ocrNormalize.js';
import { parseQuestion, extractQuestionNumber } from './questionParser.js';

// English is listed first so it is the primary model.
const LANGS = ['eng', 'msa'];
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
// Self-hosted assets (see scripts/copy-tesseract-assets.mjs) so it works offline.
const ASSET_ROOT = `${BASE}tesseract`;

const TIMEOUT_MS = 60_000; // low-end phones are slow; per recognition pass
const CONFIDENCE_THRESHOLD = 0.2; // only used if the text is empty
const MIN_SIDE = 1400; // upscale smaller photos towards this (max 2x)
const MAX_SIDE = 2000; // downscale bigger photos to this (speed and memory)
const EXPECTED_OPTIONS = 4;
const GRID_TOLERANCE = 2; // px a table border may wander (photo tilt)
const MIN_WORD_CONFIDENCE = 15; // Tesseract confidence is 0..100

// Page-segmentation modes to try in order.
const PSM_ATTEMPTS = [PSM.SINGLE_COLUMN, PSM.SPARSE_TEXT];

export class OCRNetworkError extends Error {
  constructor(msg) { super(msg); this.name = 'OCRNetworkError'; }
}
export class OCRTimeoutError extends Error {
  constructor() { super('OCR timed out'); this.name = 'OCRTimeoutError'; }
}
export class OCRLowConfidenceError extends Error {
  /** @param {number} confidence */
  constructor(confidence) {
    super(`OCR produced no readable text (confidence ${confidence.toFixed(2)})`);
    this.name = 'OCRLowConfidenceError';
    this.confidence = confidence;
  }
}
export class OCRAPIError extends Error {
  /** @param {number} status */
  constructor(status) { super(`OCR API returned HTTP ${status}`); this.name = 'OCRAPIError'; this.status = status; }
}

/* ------------------------------------------------------------------ worker */

/** @type {Promise<import('tesseract.js').Worker>|null} */
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(LANGS, OEM.LSTM_ONLY, {
        workerPath: `${ASSET_ROOT}/worker.min.js`,
        corePath: `${ASSET_ROOT}/core`,
        langPath: `${ASSET_ROOT}/lang`,
        gzip: false,
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300', // photos carry no DPI; silences the estimate warning
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw new OCRNetworkError(err?.message || 'Failed to load OCR engine');
    });
  }
  return workerPromise;
}

/** Free the engine (about 100+ MB on a phone). The next runOCR reloads it. */
export async function terminateOCR() {
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker?.terminate();
  } catch {
    /* already gone */
  }
}

/** @param {import('tesseract.js').Worker} worker @param {HTMLCanvasElement} canvas */
async function recognizeWithTimeout(worker, canvas) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new OCRTimeoutError()), TIMEOUT_MS);
  });
  const job = worker.recognize(canvas);
  job.catch(() => {}); // a terminated worker may reject later; do not leak it
  try {
    return await Promise.race([job, timeout]);
  } catch (err) {
    if (err instanceof OCRTimeoutError) await terminateOCR();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- preprocessing */

/**
 * Decode, scale, flatten lighting, erase table borders; return a canvas.
 * @param {File} file
 * @returns {Promise<HTMLCanvasElement>}
 */
async function prepareImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file); // honours EXIF rotation
  } catch (err) {
    throw new Error(err?.message || 'Failed to read image file');
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  let scale = 1;
  if (longest > MAX_SIDE) scale = MAX_SIDE / longest;
  else if (longest < MIN_SIDE) scale = Math.min(2, MIN_SIDE / longest);

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // Black tags out, lighting flattened, skew measured (all pure pixel work).
  const raw = ctx.getImageData(0, 0, width, height);
  const { pixels, angle } = cleanPage(raw.data, width, height);
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);

  // Straighten a tilted photo: row grouping and border removal assume level text.
  if (angle !== 0) {
    const flat = document.createElement('canvas');
    flat.width = width;
    flat.height = height;
    flat.getContext('2d').drawImage(canvas, 0, 0);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate((angle * Math.PI) / 180); // positive = clockwise
    ctx.drawImage(flat, -width / 2, -height / 2);
    ctx.restore();
  }

  const straight = ctx.getImageData(0, 0, width, height);
  const clean = removeGridLines(straight.data, width, height, { tolerance: GRID_TOLERANCE });
  ctx.putImageData(new ImageData(clean, width, height), 0, 0);
  return canvas;
}

/* ------------------------------------------------------------ interpretation */

/** "SMK MR2 2025" / "SMK SJ1 2025" school tags printed on the exam page. */
const TAG_START = /^(?:[S5]M[KI]|MK)$/i;
const TAG_TAIL = /^[A-Z0-9?]{1,5}$/i;

/** Remove the school tag words (and up to 3 tail words) from a line's words. */
function stripSchoolTag(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    if (TAG_START.test(words[i].text)) {
      let j = i + 1;
      let taken = 0;
      while (j < words.length && taken < 3 && TAG_TAIL.test(words[j].text)) {
        j += 1;
        taken += 1;
      }
      i = j - 1;
    } else {
      out.push(words[i]);
    }
  }
  return out;
}

/** Tesseract.js v5 exposes data.lines; v6+ nests lines under blocks. */
function collectLines(data) {
  if (Array.isArray(data?.lines)) return data.lines;
  const lines = [];
  for (const block of data?.blocks ?? []) {
    for (const para of block.paragraphs ?? []) lines.push(...(para.lines ?? []));
  }
  return lines;
}

/** @returns {{text:string,x:number,y:number,width:number,height:number,confidence:number}|null} */
function toBox(text, bbox, confidence) {
  if (!bbox) return null;
  const width = bbox.x1 - bbox.x0;
  const height = bbox.y1 - bbox.y0;
  if (!(width > 0 && height > 0)) return null;
  return { text, x: bbox.x0 + width / 2, y: bbox.y0 + height / 2, width, height, confidence };
}

/**
 * Turn Tesseract output into line detections that each carry their word boxes.
 * Lines are what get classified by language; words are what get laid out.
 */
function toLineDetections(data) {
  const result = [];
  for (const line of collectLines(data)) {
    let words = (line.words ?? [])
      .map((w) => toBox(String(w.text ?? '').trim(), w.bbox, w.confidence ?? 0))
      .filter((w) => w && w.text)
      // Drop low-confidence specks that contain no letter or digit (shadows, pen marks).
      .filter((w) => w.confidence >= MIN_WORD_CONFIDENCE || /[\p{L}\p{N}]/u.test(w.text));
    words = stripSchoolTag(words);
    if (words.length === 0) continue;

    const text = words.map((w) => w.text).join(' ');
    if (!/[\p{L}\p{N}]/u.test(text)) continue;

    const x0 = Math.min(...words.map((w) => w.x - w.width / 2));
    const x1 = Math.max(...words.map((w) => w.x + w.width / 2));
    const y0 = Math.min(...words.map((w) => w.y - w.height / 2));
    const y1 = Math.max(...words.map((w) => w.y + w.height / 2));
    const box = toBox(text, { x0, y0, x1, y1 }, 0);
    result.push({ ...box, words });
  }
  return result;
}

/**
 * One recognition result -> arranged text, confidence and parsed question.
 * @returns {{ text: string, confidence: number, parsed: import('./questionParser.js').ParsedQuestion }}
 */
export function interpret(data) {
  const lines = toLineDetections(data);
  if (lines.length === 0) return { text: '', confidence: 0, parsed: parseQuestion('') };

  // The question number lives on the Malay line, so read it before filtering.
  const allWords = lines.flatMap((l) => l.words);
  const fullText = layoutText(allWords) ?? lines.map((l) => l.text).join('\n');
  const number = extractQuestionNumber(fullText);

  // English first; Malay only when there is no English at all.
  const { kept } = preferEnglish(lines);
  const words = kept.flatMap((l) => l.words);
  const text = (layoutText(words) ?? kept.map((l) => l.text).join('\n')).trim();

  const confidence = words.length
    ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length / 100
    : 0;

  if (import.meta.env?.DEV) {
    console.info('[aura] OCR lines', lines.map((l) => l.text), '-> kept', kept.map((l) => l.text));
  }
  return { text, confidence, parsed: parseQuestion(text, { number, expectedOptions: EXPECTED_OPTIONS }) };
}

const score = (r) => r.parsed.options.length + r.confidence; // options first, confidence breaks ties

/* ----------------------------------------------------------------- public API */

/**
 * Run OCR on an image file.
 * @param {File} file
 * @returns {Promise<import('../types.js').OCRResult & { parsed: import('./questionParser.js').ParsedQuestion }>}
 */
export async function runOCR(file) {
  const canvas = await prepareImage(file);
  const worker = await getWorker();

  let best = null;
  for (const psm of PSM_ATTEMPTS) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await recognizeWithTimeout(worker, canvas);
    const attempt = interpret(data);
    if (!best || score(attempt) > score(best)) best = attempt;
    if (best.parsed.options.length >= EXPECTED_OPTIONS) break;
  }

  if (!best || !best.text) throw new OCRLowConfidenceError(best?.confidence ?? 0);
  if (best.confidence < CONFIDENCE_THRESHOLD && best.parsed.options.length === 0) {
    throw new OCRLowConfidenceError(best.confidence);
  }
  return best;
}
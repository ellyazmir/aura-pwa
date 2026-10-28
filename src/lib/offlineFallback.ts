/**
 * Offline fallback for Aura Tutor.
 *
 * Runs a small Qwen3 model (Qwen3-0.6B) fully inside the browser with WebAssembly (wllama = llama.cpp
 * compiled to WASM). It runs on the CPU, so it does NOT need WebGPU.
 *
 * Needs @wllama/wllama 3.x (it knows the Qwen3 architecture and has an OpenAI-style API) and its
 * wasm file in public/wllama/:
 *   npm i @wllama/wllama
 *   copy node_modules/@wllama/wllama/esm/wasm/wllama.wasm  ->  public/wllama/wllama.wasm
 *
 * Use: replace  fetch('/api/cikgu/chat', ...)  with  fetchWithOfflineFallback('/api/cikgu/chat', ...)
 * It returns a normal Response with the same { success, data } JSON, so the rest of the app
 * does not change.
 *
 * When there is no internet, the answer has the same shape and layout as the online (Socratic)
 * answer: phases 1-3, a one-sentence hint, A/B/C options and the marking scheme.
 */
import { Wllama, LoggerWithoutDebug } from '@wllama/wllama';
import { detectConversationLanguage } from './language';
// wllama 3.x needs one wasm file (single- or multi-thread is chosen automatically).
// Copy it once: node_modules/@wllama/wllama/esm/wasm/wllama.wasm -> public/wllama/wllama.wasm
const CONFIG_PATHS = {
  default: '/wllama/wllama.wasm',
};

// ---------------------------------------------------------------------------
// Model choice
// ---------------------------------------------------------------------------
const MODELS = {
  small: {
    id: 'small',
    label: 'Qwen3 0.6B (~610 MB)',
    // Official Qwen repo, 8-bit file. Smaller alternative (~380 MB): unsloth/Qwen3-0.6B-GGUF, Qwen3-0.6B-Q4_K_M.gguf
    // (then also change APPROX_BYTES below and OFFLINE_MODEL_URLS in server.ts).
    url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
  },
  medium: {
    id: 'medium',
    label: 'Qwen2.5 1.5B (~1.1 GB)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
};

// New key: older downloads were cached by wllama's own downloader, which this version no longer uses.
const READY_FLAG = 'cikgu.offlineModelReady2';
// The model file is stored in the browser Cache API under the model URL (works offline).
const CACHE_NAME = 'cikgu-offline-model';

// Always the 0.5B model (small, fast, works on phones). To allow the 1.5B model again, return
// MODELS.medium here, or read localStorage 'cikgu.offlineModel' as before.
function pickModel() {
  return MODELS.small;
}

// ---------------------------------------------------------------------------
// Model loading (lazy singleton)
// ---------------------------------------------------------------------------
let wllama: Wllama | null = null;
let loading: Promise<Wllama> | null = null;

// Approximate size of each model file. A cached copy smaller than half of this is treated as broken.
const APPROX_BYTES: Record<string, number> = { small: 639_446_688, medium: 1_117_000_000 };

export function isOfflineModelReady(): boolean {
  // The flag stores the URL of the model that was downloaded, so changing the model tier
  // (small/medium) correctly asks for a new download instead of failing offline.
  return localStorage.getItem(READY_FLAG) === pickModel().url;
}

/**
 * Is the model file really in the browser cache (Cache API) and complete?
 * This is the source of truth: the localStorage flag can be lost (site data cleared) or be stale
 * (the browser removed the cache to free space).
 */
export async function isModelCached(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    const model = pickModel();
    if (!(await caches.has(CACHE_NAME))) return false;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(model.url);
    if (!hit) return false;
    // New downloads store their size in a header; older ones need the size read from the body.
    const stored = Number(hit.headers.get('content-length'));
    const size = stored > 0 ? stored : (await hit.clone().blob()).size;
    return size >= APPROX_BYTES[model.id] * 0.5;
  } catch {
    return false;
  }
}

/**
 * Check the cache and bring the flag in line with it. Returns true when the model is already on
 * this device, so the app must not offer to download it again.
 */
/** Delete cached model files the app no longer uses (e.g. the previous model after an upgrade). */
async function removeUnusedModels(): Promise<void> {
  try {
    const keep = new Set(Object.values(MODELS).map((m) => m.url));
    const cache = await caches.open(CACHE_NAME);
    for (const request of await cache.keys()) {
      if (!keep.has(request.url)) await cache.delete(request);
    }
  } catch {
    // not important
  }
}

export async function syncOfflineModelStatus(): Promise<boolean> {
  const cached = await isModelCached();
  // The new model is safely stored, so the old one (hundreds of MB) can go
  if (cached) removeUnusedModels();
  try {
    if (cached) localStorage.setItem(READY_FLAG, pickModel().url);
    else localStorage.removeItem(READY_FLAG);
  } catch {
    // storage blocked: the cache check above is still correct
  }
  return cached;
}

/**
 * Get the model file as a Blob: from the browser cache if it is there (works with no internet),
 * otherwise a plain streamed GET download that is then cached.
 *
 * wllama's own downloader needs a HEAD request with Content-Length. Hugging Face's CDN does not
 * expose it to browsers, and Render serves big files chunked, hence "the host did not report the
 * file size". A normal GET does not need it; the size is only used for the progress bar.
 */
async function getModelBlob(
  cacheKey: string,
  sourceUrl: string,
  approxBytes: number,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(cacheKey);
  if (hit) return hit.blob();

  const res = await fetch(sourceUrl);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || approxBytes;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(Math.min(99, Math.round((loaded / total) * 100)));
  }
  // A cut-off download or an HTML error page would be tiny: refuse it so the next source is tried.
  if (loaded < approxBytes * 0.5) throw new Error(`file too small (${loaded} bytes)`);
  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
  try {
    await cache.put(
      cacheKey,
      new Response(blob, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) },
      })
    );
    // Ask the browser to keep this data when it needs space (best effort, may be refused)
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    console.warn('[offline] could not cache the model (storage full?)', e);
  }
  onProgress?.(100);
  return blob;
}

/**
 * Download + load the model. Call this while ONLINE (e.g. from a "Muat turun mod luar talian"
 * button) so the model is cached in the browser for later offline use.
 */
export function preloadOfflineModel(onProgress?: (percent: number) => void): Promise<Wllama> {
  if (wllama) return Promise.resolve(wllama);
  if (loading) return loading;

  loading = (async () => {
    const model = pickModel();
    console.info('[offline] loading model:', model.label);

    // Where to download from: Hugging Face first, then this server (/api/offline-model/:id).
    const viaServer = new URL(`/api/offline-model/${model.id}`, location.origin).href;
    const candidates = [model.url, viaServer];
    const approxBytes = APPROX_BYTES[model.id];

    const errors: string[] = [];
    for (const url of candidates) {
      // `as any`: the asset-path type differs between wllama 1.x (5 files) and 2.x+ (2 wasm files).
      const instance = new Wllama(CONFIG_PATHS, { allowOffline: true, logger: LoggerWithoutDebug });
      try {
        // Cached under model.url whichever source it came from, so offline loading always finds it.
        const blob = await getModelBlob(model.url, url, approxBytes, onProgress);
        await (instance as any).loadModel([blob], {
          n_ctx: 2048, // room for the prompt with its example (~700 tokens) + answer (~450 tokens)
          n_gpu_layers: 0, // CPU only: WebGPU is on by default in wllama 3.1+ and is not reliable on every device
        });
        wllama = instance;
        localStorage.setItem(READY_FLAG, model.url);
        console.info('[offline] model loaded from', new URL(url).host);
        return instance;
      } catch (err: any) {
        console.warn('[offline] download source failed:', url, err);
        errors.push(`${new URL(url).host}: ${err?.message || err}`);
        instance.exit?.().catch(() => {});
      }
    }
    throw new Error(errors.join(' | '));
  })();

  loading.catch(() => {
    loading = null;
  });
  return loading;
}

// ---------------------------------------------------------------------------
// Prompting (the model is asked for a small JSON object via its chat template)
// ---------------------------------------------------------------------------
type Lang = 'bm' | 'en' | 'bilingual';

/** "Write in <language>" line for the prompts. */
function languageLine(language: Lang): string {
  return language === 'en'
    ? 'Write everything in English.'
    : language === 'bilingual'
    ? 'Write in Bahasa Melayu, with key terms also in English in brackets.'
    : 'Write everything in Bahasa Melayu (Malaysian Malay, never Indonesian).';
}

/** True when the question looks like a calculation (digits with an operator/equation, or maths words). */
function looksLikeMaths(q: string): boolean {
  return (
    /\d\s*[+\-*/=×÷^]\s*[\da-z(]|[a-z]\s*[+\-*/=]\s*\d|[=]/i.test(q) ||
    /\b(hitung\w*|kira\w*|cari nilai|selesaikan|persamaan|ungkapan|pecahan|peratus|luas|isi padu|halaju|pecutan|jisim|berjisim|daya|calculate|solve|equation|fraction|percentage|area|volume|gradient|velocity|acceleration|force)\b/i.test(q) ||
    // two or more numbers (e.g. "1200 kg ... 26 m/s ... 8 saat") = a calculation
    // (years such as 1961 or 1963 do not count: a History question has dates but no calculation)
    (q.match(/\b(?!(?:1[0-9]|20)\d\d\b)\d+(?:\.\d+)?/g) || []).length >= 2
  );
}

// Aura Tutor answers with a small JSON object (via the model's chat template + json_object mode).
// JSON avoids the old problems: no example to copy, no fragile "### HEADER" parsing, every field
// is clearly labelled, and missing fields are just empty.
const COMMON_RULES = `You are Aura Tutor, a patient Malaysian KPM (KSSR/KSSM) tutor for every school subject (Matematik, Sains, Fizik, Kimia, Biologi, Sejarah, Geografi, Bahasa Melayu, English, and others).
RULES:
- Reply with ONE JSON object only. No markdown, no code fences, no text outside the JSON.
- Write plain text inside the JSON. NO LaTeX, no backslashes, no $ signs. Use the symbols × ÷ √ ² ³ and write fractions like 3/4.
- Copy numbers and quoted text from the question exactly. Do not invent facts, dates or values.
- Answer the student's actual question. Do not reuse topics or numbers from these instructions.`;

/** Phase 1 and 2: one short hint plus three options, never the final answer. */
function buildHintSystem(language: Lang, _mathy: boolean): string {
  return `${COMMON_RULES}
- ${languageLine(language)}
TASK: give the student ONE small hint for the NEXT step. Never reveal the final answer.
Return exactly this JSON shape (fill every field; use "" when a field does not apply):
{
  "subject": "the school subject of the question, e.g. Matematik / Fizik / Sejarah",
  "topic": "short topic title, 3-6 words",
  "intent": "one sentence: what the question is asking for",
  "hint": "ONE short sentence that nudges the next step, WITHOUT giving the answer",
  "options": ["three short next-step choices; exactly ONE is correct, two are common mistakes"],
  "formula": "the key formula if the subject uses one, else empty",
  "think": "one short why-question to deepen understanding"
}`;
}

/** Phase 3: the full worked solution as numbered steps. */
function buildSolutionSystem(language: Lang, mathy: boolean): string {
  const marks = mathy
    ? 'For each step set "marks": P1 (knowledge/formula), K1 (method/working) or N1 (final answer).'
    : 'For each step set "marks" to "1m" for each correct point (fact / elaboration / example).';
  return `${COMMON_RULES}
- ${languageLine(language)}
TASK: solve the question completely and correctly in 2 to 5 short steps.
${marks}
Return exactly this JSON shape (fill every field):
{
  "subject": "the school subject of the question",
  "topic": "short topic title, 3-6 words",
  "intent": "one sentence: what the question is asking for",
  "steps": [ { "do": "what you do in this step", "work": "the working or key point", "marks": "P1 / K1 / N1 / 1m" } ],
  "answer": "the final answer, with its unit if any",
  "think": "one short why-sentence (KBAT)",
  "tip": "one short exam tip"
}`;
}

/** Pull the first balanced {...} JSON object out of the model text and parse it. */
function parseModelJson(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const LEVEL_LABEL: Record<string, string> = {
  auto: 'Auto-Kesan Tahap',
  kssr: 'KSSR Rendah',
  kssm_lower: 'KSSM Menengah Rendah',
  kssm_upper: 'KSSM SPM',
};

const TEXT = {
  bm: {
    encouragement: 'Bagus kerana mencuba! Mari kita selesaikan langkah demi langkah.',
    disclaimer:
      'ℹ️ Dijana oleh model AI kecil dalam peranti anda (tanpa internet). Jawapan mungkin kurang tepat, sila semak dengan cikgu atau buku teks.',
    phaseNames: ['Petunjuk Pertama', 'Semakan & KBAT', 'Skema Penuh'],
    phase: 'Fasa',
    hintTitle: ['Petunjuk 1', 'Petunjuk 2', 'Skema Jawapan'],
    next: 'Pilih satu pilihan atau taip langkah anda sendiri.',
    nextDone: 'Cuba soalan lain atau mulakan sesi baharu.',
    replies: ['Beri petunjuk lagi', 'Terangkan rumus ini', 'Saya tak faham'],
    markingCode: 'Dalam peranti (tidak rasmi)',
    defaultHint: [
      'Tulis dahulu apa yang diberi dan apa yang dicari dalam soalan.',
      'Semak langkah anda tadi, kemudian cuba langkah seterusnya.',
    ],
  },
  en: {
    encouragement: "Good effort! Let's solve it step by step.",
    disclaimer:
      'ℹ️ Generated by a small AI model running on your device (no internet). It may be less accurate, so please check with your teacher or textbook.',
    phaseNames: ['First Hint', 'Check & HOTS', 'Full Scheme'],
    phase: 'Phase',
    hintTitle: ['Hint 1', 'Hint 2', 'Answer Scheme'],
    next: 'Pick an option or type your own next step.',
    nextDone: 'Try another question or start a new session.',
    replies: ['Give me another hint', 'Explain this formula', "I don't understand"],
    markingCode: 'On-device (unofficial)',
    defaultHint: [
      'First write down what is given and what the question asks.',
      'Check your last step, then try the next one.',
    ],
  },
};

/** First sentence only (does not split on decimals like 3.5). */
function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const end = /[.!?](?=\s+[A-Z0-9"'(]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(t))) {
    const head = t.slice(0, m.index + 1);
    if (/(^|\s)[A-Za-z0-9]\.$/.test(head)) continue; // "A." or "3." is a label, not the end of a sentence
    return head.trim();
  }
  return t;
}

// ---------------------------------------------------------------------------
// Pick the CURRENT question (not the first one in the chat)
// ---------------------------------------------------------------------------
// Short replies like "Saya cuba langkah ini" are follow-ups, not new questions.
const FOLLOW_UP_RE =
  /^(cikgu,?\s+bolehkah\s+tunjukkan|teacher,?\s+could\s+you\s+show|pilihan\s+saya|my\s+choice|saya\s+(cuba|faham|tak faham|tidak faham)|i\s+(tried|understand|don'?t understand)|beri\s+(petunjuk|hint)|give\s+me|terangkan\s+(rumus|langkah)|explain\s+(this|the)|tunjuk|show\s+(me|answer|the)|seterusnya|next|continue|ok\b|okay\b|ya\b|yes\b|tak\s+faham|betul\s+tak|is\s+this\s+right)/i;
const QUESTION_RE =
  /\?|\b(apa|apakah|siapa|bagaimana|mengapa|kenapa|berapa|bilakah|nyatakan|terangkan|huraikan|jelaskan|hitung|cari|selesaikan|tentukan|ringkaskan|bandingkan|what|who|why|how|when|where|calculate|find|solve|explain|describe|state|define|compare|summari[sz]e)\b/i;

function looksLikeNewQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.split(/\s+/).length <= 12 && FOLLOW_UP_RE.test(t)) return false;
  return t.length >= 60 || QUESTION_RE.test(t);
}

/** The latest user message that is a real question (not a reply / chip / attempt). */
function currentQuestion(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user' && looksLikeNewQuestion(String(m.content ?? ''))) {
      return String(m.content);
    }
  }
  // Nothing looks like a question: use the latest user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return String(messages[i].content ?? '');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Deterministic check for simple equations (small models get these wrong)
// ---------------------------------------------------------------------------
/** Solve a one-variable linear equation found in the text, e.g. "a-5=9" -> a = 14. */
interface LinearSolution {
  v: string;
  value: number;
  /** Change of (left - right) per 1 unit of the variable. */
  slope: number;
  /** (left - right) when the variable is 0. */
  f0: number;
  lhs: string;
  rhs: string;
  /** The equation for display, e.g. "3a + 5 = 8". */
  eq: string;
}

function solveLinear(text: string): LinearSolution | null {
  const t = text.replace(/\s*([=+\-*/])\s*/g, '$1').replace(/(\d)([a-z])/gi, '$1*$2');
  const m = t.match(/([0-9a-z.+\-*/()]+)=([0-9a-z.+\-*/()]+)/i);
  if (!m) return null;
  const letters = new Set((m[1] + m[2]).match(/[a-z]/gi)?.map((c) => c.toLowerCase()));
  if (letters.size !== 1) return null;
  const v = [...letters][0];
  const f = (x: number) => {
    const sub = (s: string) => s.replace(new RegExp(v, 'gi'), `(${x})`);
    try {
      return Number(new Function(`return (${sub(m[1])}) - (${sub(m[2])})`)());
    } catch {
      return NaN;
    }
  };
  const f0 = f(0);
  const slope = f(1) - f0;
  if (!isFinite(f0) || !isFinite(slope) || Math.abs(slope) < 1e-9) return null;
  return {
    v,
    value: Math.round((-f0 / slope) * 1e6) / 1e6,
    slope,
    f0,
    lhs: m[1],
    rhs: m[2],
    eq: `${prettyExpr(m[1])} = ${prettyExpr(m[2])}`,
  };
}

// ---------------------------------------------------------------------------
// Exact answers for equations (no AI model needed)
// ---------------------------------------------------------------------------
interface SchemeStep {
  stepNumber: number;
  stepDescription: string;
  workingMath: string;
  marksScheme: string;
}

/** 14 -> "14", 0.5 -> "0.5" (no 14.000000). */
function fmtNum(x: number): string {
  return String(Math.round(x * 1e6) / 1e6);
}

/** "3*a+5" -> "3a + 5", "2*(a+1)" -> "2×(a + 1)". */
function prettyExpr(s: string): string {
  return s
    .replace(/(\d)\*([a-z])/gi, '$1$2')
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/([+\-])/g, ' $1 ')
    .replace(/^\s-\s/, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM = String.raw`(?:\d+\.?\d*|\.\d+)`;
const SIDE_WITH_VAR = new RegExp(String.raw`^(-?${NUM}?)\*?([a-z])(?:([+-])(${NUM}))?$`, 'i'); // k*v + n
const SIDE_NUMBER = new RegExp(String.raw`^-?${NUM}$`);

/** Equation of the form k*v + n = m (either way round) -> its numbers, or null. */
function parseSimpleLinear(sol: LinearSolution): { k: number; n: number; m: number } | null {
  for (const [a, b] of [
    [sol.lhs, sol.rhs],
    [sol.rhs, sol.lhs],
  ]) {
    const left = a.match(SIDE_WITH_VAR);
    if (!left || !SIDE_NUMBER.test(b)) continue;
    const coef = left[1];
    const k = coef === '' ? 1 : coef === '-' ? -1 : Number(coef);
    const n = left[3] ? (left[3] === '+' ? 1 : -1) * Number(left[4]) : 0;
    const m = Number(b);
    if (k !== 0 && Math.abs((m - n) / k - sol.value) < 1e-6) return { k, n, m };
  }
  return null;
}

/** Working for the marking scheme: K1 = method, N1 = answer, P1 = knowledge. */
function linearSteps(sol: LinearSolution, lang: 'bm' | 'en'): { steps: SchemeStep[]; answer: string } {
  const bm = lang === 'bm';
  const v = sol.v;
  const answer = `${v} = ${fmtNum(sol.value)}`;
  const steps: SchemeStep[] = [];
  const add = (stepDescription: string, workingMath: string, marksScheme: string) =>
    steps.push({ stepNumber: steps.length + 1, stepDescription, workingMath, marksScheme });

  add(bm ? 'Tulis persamaan yang diberi' : 'Write down the given equation', sol.eq, 'P1');

  const simple = parseSimpleLinear(sol);
  if (simple) {
    const { k, n, m } = simple;
    const kTerm = k === 1 ? v : k === -1 ? `−${v}` : `${fmtNum(k)}${v}`;
    const afterShift = m - n;
    if (n !== 0) {
      const last = k === 1;
      add(
        n > 0
          ? bm ? `Tolak ${fmtNum(n)} daripada kedua-dua belah` : `Subtract ${fmtNum(n)} from both sides`
          : bm ? `Tambah ${fmtNum(-n)} kepada kedua-dua belah` : `Add ${fmtNum(-n)} to both sides`,
        `${kTerm} = ${fmtNum(m)} ${n > 0 ? '−' : '+'} ${fmtNum(Math.abs(n))} = ${fmtNum(afterShift)}`,
        last ? 'N1' : 'K1'
      );
    }
    if (k !== 1) {
      add(
        bm ? `Bahagikan kedua-dua belah dengan ${fmtNum(k)}` : `Divide both sides by ${fmtNum(k)}`,
        `${v} = ${fmtNum(afterShift)} ÷ ${fmtNum(k)} = ${fmtNum(sol.value)}`,
        'N1'
      );
    }
    if (n === 0 && k === 1) steps[steps.length - 1].marksScheme = 'N1';
  } else {
    // Any other linear equation: collect the terms, then divide
    const rhsNow = -sol.f0;
    if (Math.abs(sol.slope - 1) < 1e-9) {
      add(
        bm ? 'Kumpulkan sebutan pemboleh ubah di satu sebelah dan nombor di sebelah lagi' : 'Collect the variable terms on one side and the numbers on the other',
        `${v} = ${fmtNum(rhsNow)}`,
        'N1'
      );
    } else {
      add(
        bm ? 'Kumpulkan sebutan pemboleh ubah di satu sebelah dan nombor di sebelah lagi' : 'Collect the variable terms on one side and the numbers on the other',
        `${fmtNum(sol.slope)}${v} = ${fmtNum(rhsNow)}`,
        'K1'
      );
      add(
        bm ? `Bahagikan kedua-dua belah dengan ${fmtNum(sol.slope)}` : `Divide both sides by ${fmtNum(sol.slope)}`,
        `${v} = ${fmtNum(rhsNow)} ÷ ${fmtNum(sol.slope)} = ${fmtNum(sol.value)}`,
        'N1'
      );
    }
  }

  // Check by putting the value back into the equation
  const put = (s: string) => s.replace(new RegExp(`\\b${v}\\b`, 'gi'), `(${fmtNum(sol.value)})`);
  try {
    const l = Number(new Function(`return (${put(sol.lhs)})`)());
    const r = Number(new Function(`return (${put(sol.rhs)})`)());
    if (isFinite(l) && isFinite(r) && Math.abs(l - r) < 1e-6) {
      add(
        bm ? 'Semak jawapan dengan gantian' : 'Check by substitution',
        `${prettyExpr(put(sol.lhs))} = ${fmtNum(l)} ✓`,
        ''
      );
    }
  } catch {
    // no check line
  }
  return { steps, answer };
}

const EXACT_TEXT = {
  bm: {
    title: 'Persamaan Linear',
    subject: 'Matematik',
    explanation: 'Selesaikan persamaan dengan melakukan operasi songsang pada kedua-dua belah.',
    markingCode: 'Dikira terus dalam peranti',
    kbat: 'Mengapa operasi yang sama mesti dilakukan pada kedua-dua belah persamaan? Supaya kesamaan kekal benar.',
    tip: 'Tulis setiap langkah dan semak jawapan dengan menggantikan nilai ke dalam persamaan.',
    note: 'ℹ️ Dikira terus dalam peranti anda, tanpa model AI.',
  },
  en: {
    title: 'Linear Equations',
    subject: 'Mathematics',
    explanation: 'Solve the equation by applying inverse operations to both sides.',
    markingCode: 'Computed on-device',
    kbat: 'Why must the same operation be done on both sides? So that the equality stays true.',
    tip: 'Write every step and check your answer by putting the value back into the equation.',
    note: 'ℹ️ Calculated directly on your device, without an AI model.',
  },
};

const CANNOT_SOLVE = {
  bm: 'Model dalam peranti tidak dapat menyusun jawapan penuh untuk soalan ini dengan yakin. Sila semak dengan cikgu atau buku teks, atau cuba lagi apabila ada internet.',
  en: 'The on-device model could not write a reliable full answer for this question. Please check with your teacher or textbook, or try again when you have internet.',
};

/**
 * Full marking scheme for a one-variable linear equation, calculated exactly (no AI model).
 * Returns null when the question is not such an equation or the full scheme was not requested.
 */
export function deterministicAnswer(body: any): any | null {
  const {
    messages = [],
    educationLevel = 'auto',
    subject = 'Umum',
    language: requested = 'auto',
    requestDirectPhase3 = false,
  } = body;
  if (!requestDirectPhase3 || messages.length === 0) return null;

  // The last message only asks for the scheme; the question is the one before it.
  const question = currentQuestion(messages.length > 1 ? messages.slice(0, -1) : messages);
  const sol = solveLinear(question);
  if (!sol) return null;

  const language = requested === 'auto' ? detectConversationLanguage(messages) : requested;
  const lang: 'bm' | 'en' = language === 'en' ? 'en' : 'bm';
  const t = lang === 'en' ? TEXT.en : TEXT.bm;
  const x = EXACT_TEXT[lang];
  const { steps, answer } = linearSteps(sol, lang);

  return {
    mode: 'online' as const,
    phase: 3,
    phaseTitle: `${t.phase} 3: ${x.title}`,
    curriculumBadge: educationLevel && educationLevel !== 'auto' ? LEVEL_LABEL[educationLevel] || 'KPM' : 'KPM',
    subjectBadge: subject && subject !== 'Umum' ? subject : x.subject,
    encouragement: t.encouragement,
    kehendakSoalan: question.length > 300 ? question.slice(0, 300) + '...' : question,
    explanation: x.explanation,
    note: x.note,
    nextActionPrompt: t.nextDone,
    suggestedQuickReplies: [],
    hint: { hintNumber: 3, hintTitle: t.hintTitle[2], hintBody: '' },
    hintOptions: [],
    officialSkema: {
      markingCode: x.markingCode,
      steps,
      finalAnswerUnit: answer,
      kbatSummary: x.kbat,
      tipsPemeriksa: x.tip,
    },
  };
}

// ---------------------------------------------------------------------------
// Clean the small model's text (it sometimes copies the format instructions)
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE =
  /max\s*\d+\s*words|subject name only|one sentence|1m per point|K1 method|N\d answer|final answer with unit|topic title|exam tip|other subjects/i;
// Words that show the model drifted into Indonesian
const OFF_LANGUAGE_RE = /\b(silakan|masukan|merasa|kamu|karena|kecepatan|bisa|fisika|memecah|perbedaan|yaitu|ialah dari|sehingga mencapai kecepatan)\b/i;

/** The UI shows plain text: turn the LaTeX a small model sometimes writes into plain symbols. */
function stripLatex(text: string): string {
  return text
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '×')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\[()[\]]/g, '')
    .replace(/\$/g, '')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Drop lines that are leftover instructions, headings or the wrong language. */
function cleanText(text: string): string {
  return stripLatex(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || /^#{2,}/.test(l) || PLACEHOLDER_RE.test(l) || OFF_LANGUAGE_RE.test(l)) return false;
      // "(one sentence: what the question asks)": a bracketed line of words with no digits
      const bracket = l.match(/^\(([^()]*)\)$/);
      if (bracket && !/\d/.test(bracket[1]) && bracket[1].trim().split(/\s+/).length >= 3) return false;
      return true;
    })
    .join('\n');
}

/** Options without Indonesian words; fewer than two usable options = show none. */
function usableOptions(options: string[]): string[] {
  const ok = options.filter((o) => o && !OFF_LANGUAGE_RE.test(o));
  return ok.length >= 2 ? ok.slice(0, 3) : [];
}

// ---------------------------------------------------------------------------
// Live text streaming to the UI
// ---------------------------------------------------------------------------
type StreamCb = (text: string) => void;
let streamCb: StreamCb | null = null;

/** Subscribe to partial on-device output. Returns an unsubscribe function. */
export function subscribeOfflineStream(cb: StreamCb): () => void {
  streamCb = cb;
  return () => {
    if (streamCb === cb) streamCb = null;
  };
}

// ---------------------------------------------------------------------------
// Generate an answer in the SAME shape the server returns for the online (Socratic) mode
// ---------------------------------------------------------------------------
async function generateOffline(body: any): Promise<any> {
  const {
    messages = [],
    educationLevel = 'auto',
    subject = 'Umum',
    language: requested = 'auto',
    requestDirectPhase3 = false,
    userAttempt = '',
  } = body;

  // For "show the full scheme" the last message is only that request: the question is the one before it
  const question = currentQuestion(requestDirectPhase3 && messages.length > 1 ? messages.slice(0, -1) : messages);
  // The UI no longer has a language picker: answer in the language the question is written in.
  const language: Lang = requested === 'auto' ? detectConversationLanguage(messages) : requested;
  const t = language === 'en' ? TEXT.en : TEXT.bm;
  const solved = solveLinear(question);

  const userMsgs = messages.filter((m: any) => m.role === 'user');
  const lastUser: string = String(userMsgs[userMsgs.length - 1]?.content ?? '');
  const isNewQuestion = looksLikeNewQuestion(lastUser);
  const phase: 1 | 2 | 3 = requestDirectPhase3
    ? 3
    : (isNewQuestion || userMsgs.length <= 1) && !userAttempt
    ? 1
    : 2;

  // Context for the model: the question, the verified answer when we have one, and recent turns.
  const recent = messages
    .slice(-5, -1)
    .map((m: any) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${String(m.content).slice(0, 200)}`)
    .join('\n');
  const isFollowUp = phase !== 1 && lastUser && lastUser !== question;
  const userPrompt =
    `QUESTION:\n${question.slice(0, 600)}` +
    (solved
      ? `\n\n(For your reference only, do not quote this line: the correct answer is ${solved.v} = ${fmtNum(
          solved.value
        )}.${phase === 3 ? '' : ' Keep it hidden; the hint must only point toward it.'})`
      : '') +
    (phase !== 1 && recent ? `\n\nCONVERSATION SO FAR:\n${recent}` : '') +
    (isFollowUp ? `\n\nSTUDENT'S LATEST REPLY (say gently if it is right or wrong):\n${lastUser.slice(0, 300)}` : '');

  const instance = await preloadOfflineModel();
  const mathy = looksLikeMaths(question);

  // Ask the model for a JSON object via its own chat template. Retry once if the JSON is unusable.
  const ask = async (): Promise<any> => {
    const res = await instance.createChatCompletion({
      messages: [
        {
          role: 'system',
          content: phase === 3 ? buildSolutionSystem(language, mathy) : buildHintSystem(language, mathy),
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: phase === 3 ? 600 : 350,
      // Low temperature keeps a small model on-task and in the right language.
      temperature: 0.3,
      top_k: 20,
      top_p: 0.8,
      penalty_repeat: 1.1,
    } as any);
    const content = (res as any).choices?.[0]?.message?.content ?? '';
    return parseModelJson(content);
  };
  let data = await ask();
  if (!data || typeof data !== 'object') {
    console.warn('[offline] first reply was not valid JSON, retrying once');
    data = await ask();
  }
  data = data && typeof data === 'object' ? data : {};
  console.info('[offline] model JSON:', JSON.stringify(data).slice(0, 800));

  const str = (v: unknown): string => (typeof v === 'string' ? cleanText(v).replace(/\n+/g, ' ').trim() : '');
  // Show the student's own question, not the model's paraphrase.
  const kehendak = question.length > 300 ? question.slice(0, 300) + '...' : question;
  const topic = str(data.topic).slice(0, 60);
  const modelSubject = str(data.subject).slice(0, 30);
  const subjectBadge =
    subject && subject !== 'Umum' && (mathy || !modelSubject)
      ? subject
      : modelSubject || (subject === 'Umum' ? '' : subject);

  const base = {
    mode: 'online' as const,
    phase,
    phaseTitle: `${t.phase} ${phase}: ${topic || t.phaseNames[phase - 1]}`,
    curriculumBadge:
      educationLevel && educationLevel !== 'auto' ? LEVEL_LABEL[educationLevel] || 'KPM' : 'KPM',
    subjectBadge,
    encouragement: t.encouragement,
    kehendakSoalan: kehendak,
    explanation: str(data.intent),
    note: t.disclaimer,
    nextActionPrompt: phase === 3 ? t.nextDone : t.next,
    suggestedQuickReplies: phase === 3 ? [] : t.replies,
  };

  if (phase === 3) {
    const rawSteps = Array.isArray(data.steps) ? data.steps : [];
    const steps: SchemeStep[] = rawSteps
      .map((s: any, i: number) => ({
        stepNumber: i + 1,
        stepDescription: str(s?.do),
        workingMath: str(s?.work),
        marksScheme: /^(?:[KNP]\d|\d+\s*m)/i.test(str(s?.marks)) ? str(s.marks) : '',
      }))
      .filter((s: SchemeStep) => s.stepDescription || s.workingMath)
      .slice(0, 6);
    return {
      ...base,
      hint: { hintNumber: 3, hintTitle: t.hintTitle[2], hintBody: '' },
      hintOptions: [],
      officialSkema: {
        markingCode: t.markingCode,
        steps: steps.length
          ? steps
          : [
              {
                stepNumber: 1,
                stepDescription: CANNOT_SOLVE[language === 'en' ? 'en' : 'bm'],
                workingMath: '',
                marksScheme: '',
              },
            ],
        finalAnswerUnit: solved ? `${solved.v} = ${fmtNum(solved.value)}` : str(data.answer),
        kbatSummary: str(data.think),
        tipsPemeriksa: str(data.tip),
      },
    };
  }

  const options = usableOptions(
    (Array.isArray(data.options) ? data.options : []).map(str).filter(Boolean)
  );
  return {
    ...base,
    hint: {
      hintNumber: phase,
      hintTitle: t.hintTitle[phase - 1],
      hintBody: firstSentence(str(data.hint)) || t.defaultHint[phase - 1],
    },
    hintOptions: options,
    formulaTemplate: str(data.formula) || undefined,
    kbatPrompt: str(data.think) || undefined,
  };
}

// ---------------------------------------------------------------------------
// Drop-in replacement for fetch()
// ---------------------------------------------------------------------------
// Drop-in replacement for fetch() on the chat endpoint
// ---------------------------------------------------------------------------
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Real internet check: navigator.onLine can say "true" on Wi-Fi with no internet. */
export async function hasInternet(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    // One public endpoint first. Only if it fails, try this site's own server (so a network that
    // blocks gstatic does not count as "offline", and there is at most one console error).
    const ping = (url: string, noCors: boolean) =>
      fetch(url, {
        method: noCors ? 'GET' : 'HEAD',
        ...(noCors ? { mode: 'no-cors' as const } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      });
    try {
      await ping('https://www.gstatic.com/generate_204', true);
      return true;
    } catch {
      await ping(`${location.origin}/`, false);
      return true;
    }
  } catch {
    return false;
  }
}

async function runLocal(init: RequestInit): Promise<Response> {
  const modelOnDevice = isOfflineModelReady() || (await syncOfflineModelStatus());
  // Equations are solved by exact calculation: no AI model (and no download) is needed.
  try {
    const quick = deterministicAnswer(JSON.parse(String(init.body || '{}')));
    if (quick) return jsonResponse({ success: true, data: quick });
  } catch {
    // not an equation: use the model
  }
  if (!modelOnDevice) {
    return jsonResponse(
      {
        error:
          'Tiada internet dan model luar talian belum dimuat turun. Sambung ke internet dan muat turun model dahulu.',
      },
      503
    );
  }
  try {
    console.info('[offline] running on-device model...');
    const body = JSON.parse(String(init.body || '{}'));
    const data = await generateOffline(body);
    console.info('[offline] done');
    return jsonResponse({ success: true, data });
  } catch (err: any) {
    console.error('[offline] failed:', err);
    return jsonResponse({ error: `Model luar talian gagal: ${err?.message || err}` }, 500);
  }
}

export async function fetchWithOfflineFallback(url: string, init: RequestInit = {}): Promise<Response> {
  // Only the chat endpoint can run on-device. Image scanning (OCR) still needs the server.
  if (!url.includes('/api/cikgu/chat')) return fetch(url, init);

  // No internet reaches the browser -> go straight to the on-device model (no long waiting).
  if (!(await hasInternet())) {
    console.info('[offline] no internet detected, using on-device model');
    return runLocal(init);
  }

  let serverRes: Response | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status < 500) return res;
      serverRes = res;
      throw new Error(`server ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[offline] server call failed, trying on-device model:', err);
    // If the local model is not available, show the real server error instead.
    if (serverRes && !(isOfflineModelReady() || (await syncOfflineModelStatus()))) return serverRes;
    return runLocal(init);
  }
}
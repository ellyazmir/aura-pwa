/**
 * Offline fallback for Aura Tutor.
 *
 * Runs a small Qwen2.5 model fully inside the browser with WebAssembly (wllama = llama.cpp
 * compiled to WASM). It runs on the CPU, so it does NOT need WebGPU.
 *
 * Install (pinned, because the wllama API changed between 1.x and 2.x):
 *   npm i @wllama/wllama@1.17.0
 *
 * Use: replace  fetch('/api/cikgu/chat', ...)  with  fetchWithOfflineFallback('/api/cikgu/chat', ...)
 * It returns a normal Response with the same { success, data } JSON, so the rest of the app
 * does not change.
 *
 * When there is no internet, the answer has the same shape and layout as the online (Socratic)
 * answer: phases 1-3, a one-sentence hint, A/B/C options and the marking scheme.
 */
import { Wllama } from '@wllama/wllama';
import { detectConversationLanguage } from './language';
// wllama 1.x needs 5 asset files. Copy them once into public/wllama/ (see the setup note):
//   node_modules/@wllama/wllama/esm/single-thread  ->  public/wllama/single-thread
//   node_modules/@wllama/wllama/esm/multi-thread   ->  public/wllama/multi-thread
const CONFIG_PATHS = {
  'single-thread/wllama.js': '/wllama/single-thread/wllama.js',
  'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
  'multi-thread/wllama.js': '/wllama/multi-thread/wllama.js',
  'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
  'multi-thread/wllama.worker.mjs': '/wllama/multi-thread/wllama.worker.mjs',
};

// ---------------------------------------------------------------------------
// Model choice
// ---------------------------------------------------------------------------
const MODELS = {
  small: {
    id: 'small',
    label: 'Qwen2.5 0.5B (~400 MB)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
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

export function isOfflineModelReady(): boolean {
  // The flag stores the URL of the model that was downloaded, so changing the model tier
  // (small/medium) correctly asks for a new download instead of failing offline.
  return localStorage.getItem(READY_FLAG) === pickModel().url;
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
    await cache.put(cacheKey, new Response(blob));
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
    const approxBytes = model.id === 'medium' ? 1_117_000_000 : 491_000_000;

    const errors: string[] = [];
    for (const url of candidates) {
      // `as any`: the asset-path type differs between wllama 1.x (5 files) and 2.x+ (2 wasm files).
      const instance = new Wllama(CONFIG_PATHS as any, { allowOffline: true } as any);
      try {
        // Cached under model.url whichever source it came from, so offline loading always finds it.
        const blob = await getModelBlob(model.url, url, approxBytes, onProgress);
        await (instance as any).loadModel([blob], {
          n_ctx: 2048, // room for the prompt with its example (~700 tokens) + answer (~450 tokens)
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
// Prompting (Qwen uses the ChatML format)
// ---------------------------------------------------------------------------
type Lang = 'bm' | 'en' | 'bilingual';

/**
 * `prefill` is the first words of the assistant's answer. Starting the answer with the first
 * section header makes a small model continue in the section format instead of free text.
 */
function chatML(system: string, user: string, prefill = ''): string {
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n${prefill}`;
}

/** "Write in <language>" line for the prompts. */
function languageLine(language: Lang): string {
  return language === 'en'
    ? 'Write everything in English.'
    : language === 'bilingual'
    ? 'Write in Bahasa Melayu, with key terms also in English in brackets.'
    : 'Write everything in Bahasa Melayu.';
}

// A short worked example makes a small model follow the section format much more reliably.
const EXAMPLE_BM = `### TAJUK
Persamaan Linear
### SUBJEK
Matematik
### KEHENDAK
Mencari nilai x dalam persamaan x + 3 = 7.
### PENJELASAN
Kita perlu mengasingkan x di satu sebelah persamaan.
### PETUNJUK
Apakah operasi songsang bagi menambah 3?
### PILIHAN
A. Tambah 3 kepada kedua-dua belah
B. Tolak 3 daripada kedua-dua belah
C. Darab kedua-dua belah dengan 3
### RUMUS
x + a = b, maka x = b - a
### KBAT
Mengapa kita mesti melakukan operasi yang sama pada kedua-dua belah persamaan?`;

const EXAMPLE_EN = `### TAJUK
Linear Equations
### SUBJEK
Mathematics
### KEHENDAK
Find the value of x in the equation x + 3 = 7.
### PENJELASAN
We need to get x on its own on one side of the equation.
### PETUNJUK
What is the inverse operation of adding 3?
### PILIHAN
A. Add 3 to both sides
B. Subtract 3 from both sides
C. Multiply both sides by 3
### RUMUS
x + a = b, so x = b - a
### KBAT
Why must we do the same operation on both sides of the equation?`;

// Used for questions that are NOT calculations. A small model copies its example, so the example
// must match the kind of question (a maths example for a History question gives nonsense).
const EXAMPLE_TEXT_BM = `### TAJUK
Fotosintesis
### SUBJEK
Sains
### KEHENDAK
Jelaskan dua faktor yang diperlukan oleh tumbuhan untuk membuat makanan.
### PENJELASAN
Soalan ini meminta anda menyatakan faktor dan menerangkan peranan setiap satu.
### PETUNJUK
Apakah sumber tenaga yang digunakan oleh tumbuhan hijau untuk membuat makanan?
### PILIHAN
A. Cahaya matahari
B. Tanah yang subur
C. Angin yang kuat
### RUMUS
### KBAT
Mengapa tumbuhan yang tidak mendapat cahaya menjadi pucat?`;

const EXAMPLE_TEXT_EN = `### TAJUK
Photosynthesis
### SUBJEK
Science
### KEHENDAK
Explain two factors that plants need to make food.
### PENJELASAN
This question asks you to state the factors and explain the role of each one.
### PETUNJUK
What source of energy do green plants use to make food?
### PILIHAN
A. Sunlight
B. Fertile soil
C. Strong wind
### RUMUS
### KBAT
Why do plants kept in the dark turn pale?`;

/** True when the question looks like a calculation (digits with an operator/equation, or maths words). */
function looksLikeMaths(q: string): boolean {
  return (
    /\d\s*[+\-*/=×÷^]\s*[\da-z(]|[a-z]\s*[+\-*/=]\s*\d|[=]/i.test(q) ||
    /\b(hitung|cari nilai|selesaikan|persamaan|ungkapan|pecahan|peratus|luas|isi padu|calculate|solve|equation|fraction|percentage|area|volume|gradient)\b/i.test(q)
  );
}

const COMMON_RULES = `- Answer only the question under "Question:". Ignore anything else.
- Copy numbers, equations and quoted text from the question EXACTLY. Never change them.
- Plain text only. No LaTeX, no dollar signs. Use symbols like x², √, ×, ÷.
- Keep every section short. Do not invent facts, dates or quotations.
- Never say an equation has no solution or is impossible.
- Keep the English headers exactly as shown, each on its own line.`;

/** Phase 1 and 2: one small hint at a time, three options to pick from, never the final answer. */
function buildHintSystem(language: Lang, mathy: boolean): string {
  return `You are Aura Tutor, a patient Malaysian KPM (KSSR/KSSM) tutor for ALL school subjects. ${languageLine(language)}
You guide the student with ONE small hint at a time and NEVER give the final answer.
Rules:
${COMMON_RULES}
- PETUNJUK is exactly ONE short sentence that points to the next step.
- PILIHAN is exactly 3 lines starting with "A.", "B." and "C.": possible next steps (max 10 words each). Exactly ONE is correct, the other two are common mistakes.
- If the student replied or picked an option, begin PENJELASAN by saying gently whether it is right or wrong, then continue.
- If the subject has no formula (e.g. Sejarah, Bahasa), leave RUMUS empty.
Output exactly these headers. Example:
${mathy ? (language === 'en' ? EXAMPLE_EN : EXAMPLE_BM) : (language === 'en' ? EXAMPLE_TEXT_EN : EXAMPLE_TEXT_BM)}
The example only shows the FORMAT. Its topic is unrelated: NEVER copy its content. Write about the student's question only.`;
}

/** Phase 3: the complete worked answer in marking-scheme format. */
function buildSolutionSystem(language: Lang): string {
  return `You are Aura Tutor, a patient Malaysian KPM (KSSR/KSSM) tutor for ALL school subjects. ${languageLine(language)}
Solve the question completely and correctly.
Rules:
${COMMON_RULES}
Output exactly these headers:
### TAJUK
(topic title, max 8 words)
### SUBJEK
(subject name only)
### KEHENDAK
(one sentence: what the question asks)
### PENJELASAN
(one sentence: confirm the method)
### LANGKAH
(3 to 5 lines, format: 1. what you do :: the working or key point :: K1)
(calculation: K1 method, N1 answer, P1 knowledge. Other subjects: 1m per point)
### JAWAPAN
(final answer with unit)
### KBAT
(one sentence of reasoning)
### TIPS
(one exam tip)`;
}

// Section names the model may write (Malay headers from the prompt, or English ones by habit).
const SECTION_ALIASES: Record<string, string> = {
  TAJUK: 'TAJUK', TOPIC: 'TAJUK', TITLE: 'TAJUK',
  SUBJEK: 'SUBJEK', SUBJECT: 'SUBJEK',
  KEHENDAK: 'KEHENDAK', QUESTION: 'KEHENDAK',
  PENJELASAN: 'PENJELASAN', EXPLANATION: 'PENJELASAN',
  PETUNJUK: 'PETUNJUK', HINT: 'PETUNJUK',
  PILIHAN: 'PILIHAN', OPTIONS: 'PILIHAN', CHOICES: 'PILIHAN',
  RUMUS: 'RUMUS', FORMULA: 'RUMUS',
  KBAT: 'KBAT',
  LANGKAH: 'LANGKAH', STEPS: 'LANGKAH',
  JAWAPAN: 'JAWAPAN', ANSWER: 'JAWAPAN',
  TIPS: 'TIPS', TIP: 'TIPS',
};
const SECTION_NAMES = Object.keys(SECTION_ALIASES).join('|');
// "### NAME", "**NAME**" or "NAME:" (a plain word at the start of a sentence is NOT a header),
// optionally followed by text on the same line.
const HEADER_PATTERNS = [
  new RegExp(`^\\s*#{1,6}\\s*(${SECTION_NAMES})\\b\\**\\s*:?\\s*(.*)$`, 'i'),
  new RegExp(`^\\s*\\*\\*\\s*(${SECTION_NAMES})\\b\\s*:?\\s*\\*\\*\\s*:?\\s*(.*)$`, 'i'),
  new RegExp(`^\\s*(${SECTION_NAMES})\\s*:\\s*(.*)$`, 'i'),
];

function matchHeader(line: string): RegExpMatchArray | null {
  for (const re of HEADER_PATTERNS) {
    const m = line.match(re);
    if (m) return m;
  }
  return null;
}

/** Split the model output into sections. The first copy of a section wins (repeats are ignored). */
function parseSections(text: string): Record<string, string> {
  const parts: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const hit = matchHeader(line);
    if (hit) {
      const name = SECTION_ALIASES[hit[1].toUpperCase()];
      if (parts[name]) {
        current = null; // repeated section: skip its lines
      } else {
        current = name;
        parts[name] = [hit[2] ?? ''];
      }
    } else if (current) {
      parts[current].push(line);
    }
  }
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.join('\n').trim()]));
}

function section(text: string, name: string): string {
  return parseSections(text)[name] || '';
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

/** When the model ignored the headers: the first real sentence that is not an option line. */
function looseHint(out: string): string {
  for (const line of out.split('\n')) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    if (t.length < 15 || matchHeader(t) || /^[A-Ca-c][.):]\s/.test(t)) continue;
    return firstSentence(t);
  }
  return '';
}

/** Lines such as "A. text", "B) text" or "C: text" -> ["text", ...] (max 3, no duplicates). */
function parseOptions(block: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of block.split('\n')) {
    const m = line.trim().match(/^[A-Ca-c][.):]\s*(.+)$/);
    const text = m?.[1]?.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === 3) break;
  }
  return out.length >= 2 ? out : [];
}

// ---------------------------------------------------------------------------
// Pick the CURRENT question (not the first one in the chat)
// ---------------------------------------------------------------------------
// Short replies like "Saya cuba langkah ini" are follow-ups, not new questions.
const FOLLOW_UP_RE =
  /^(pilihan\s+saya|my\s+choice|saya\s+(cuba|faham|tak faham|tidak faham)|i\s+(tried|understand|don'?t understand)|beri\s+(petunjuk|hint)|give\s+me|terangkan\s+(rumus|langkah)|explain\s+(this|the)|tunjuk|show\s+(me|answer|the)|seterusnya|next|continue|ok\b|okay\b|ya\b|yes\b|tak\s+faham|betul\s+tak|is\s+this\s+right)/i;
const QUESTION_RE =
  /\?|\b(apa|apakah|siapa|bagaimana|mengapa|kenapa|berapa|bilakah|nyatakan|terangkan|huraikan|jelaskan|hitung|cari|selesaikan|tentukan|ringkaskan|bandingkan|what|who|why|how|when|where|calculate|find|solve|explain|describe|state|define|compare|summari[sz]e)\b/i;

function looksLikeNewQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.split(/\s+/).length <= 10 && FOLLOW_UP_RE.test(t)) return false;
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
function solveLinear(text: string): { v: string; value: number } | null {
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
  return { v, value: Math.round((-f0 / slope) * 1e6) / 1e6 };
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
const PREFILL = '### TAJUK\n';

async function generateOffline(body: any): Promise<any> {
  const {
    messages = [],
    educationLevel = 'auto',
    subject = 'Umum',
    language: requested = 'auto',
    requestDirectPhase3 = false,
    userAttempt = '',
  } = body;

  const question = currentQuestion(messages);
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

  // Prompt for the small model: the question, what we already know is correct, and the recent turns.
  const recent = messages
    .slice(-5, -1)
    .map((m: any) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${String(m.content).slice(0, 200)}`)
    .join('\n');
  const isFollowUp = phase !== 1 && lastUser && lastUser !== question;
  const userPrompt =
    `Question:\n${question.slice(0, 600)}` +
    (solved
      ? `\nVerified answer (secret${phase === 3 ? '' : ', never write it'}): ${solved.v} = ${solved.value}.` +
        (phase === 3
          ? ' Write steps that lead to exactly this answer. To undo "- n" add n to both sides; to undo "+ n" subtract n.'
          : ' The correct option in PILIHAN must lead toward it.')
      : '') +
    (phase !== 1 && recent ? `\n\nRecent conversation:\n${recent}` : '') +
    (isFollowUp ? `\n\nStudent's latest reply:\n${lastUser.slice(0, 300)}` : '');

  const instance = await preloadOfflineModel();
  const mathy = looksLikeMaths(question);
  const run = async (prompt: string): Promise<string> => {
    const raw: string = await instance.createCompletion(
      chatML(phase === 3 ? buildSolutionSystem(language) : buildHintSystem(language, mathy), prompt, PREFILL),
      {
        nPredict: phase === 3 ? 450 : 300,
        // penalty_repeat stops the small model from looping on the same line
        sampling: { temp: 0.2, top_k: 40, top_p: 0.9, penalty_repeat: 1.15, penalty_last_n: 128 },
        // No live streaming: the student only sees the finished, parsed answer, not raw model text.
      } as any
    );
    return (PREFILL + raw).replace(/<\|im_(start|end)\|>/g, '').trim();
  };
  let out = await run(userPrompt);
  // Guard: a non-maths question must never get an equation answer (the model copied the example).
  const leakedMaths = (o: string) =>
    !mathy && /\bx\s*[+\-]\s*\d|persamaan linear|linear equation|kedua-dua belah|both sides/i.test(o);
  if (leakedMaths(out)) {
    console.warn('[offline] answer copied the maths example, retrying');
    out = await run(
      userPrompt +
        '\n\nIMPORTANT: this is NOT a maths question. Do not mention equations, x or both sides. Write only about the topic of the question above.'
    );
  }
  console.info('[offline] raw model output:\n' + out);

  // Show the student's own question instead of the small model's paraphrase:
  // a small model sometimes rewrites the question wrongly.
  const kehendak = question.length > 300 ? question.slice(0, 300) + '...' : question;
  const topic = section(out, 'TAJUK').split('\n')[0].trim();
  // The UI's default subject (e.g. "Matematik") is often wrong, so for a non-maths question
  // prefer the subject the model detected.
  const modelSubject = section(out, 'SUBJEK').split('\n')[0].trim().slice(0, 30);
  const subjectBadge =
    subject && subject !== 'Umum' && (mathy || !modelSubject) ? subject : modelSubject || subject;

  const base = {
    mode: 'online' as const,
    phase,
    phaseTitle: `${t.phase} ${phase}: ${topic || t.phaseNames[phase - 1]}`,
    curriculumBadge:
      educationLevel && educationLevel !== 'auto' ? LEVEL_LABEL[educationLevel] || 'KPM' : 'KPM',
    subjectBadge,
    encouragement: t.encouragement,
    kehendakSoalan: kehendak,
    explanation: section(out, 'PENJELASAN'),
    note: t.disclaimer,
    nextActionPrompt: phase === 3 ? t.nextDone : t.next,
    suggestedQuickReplies: phase === 3 ? [] : t.replies,
  };

  if (phase === 3) {
    const steps = section(out, 'LANGKAH')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line, i) => {
        const parts = line.replace(/^\d+[.)]\s*/, '').split('::').map((p) => p.trim());
        return {
          stepNumber: i + 1,
          stepDescription: parts[0] || line,
          workingMath: parts[1] || '',
          marksScheme: parts[2] || '',
        };
      });
    return {
      ...base,
      hint: { hintNumber: 3, hintTitle: t.hintTitle[2], hintBody: '' },
      hintOptions: [],
      officialSkema: {
        markingCode: t.markingCode,
        steps: steps.length ? steps : [{ stepNumber: 1, stepDescription: out, workingMath: '', marksScheme: '' }],
        finalAnswerUnit: solved ? `${solved.v} = ${solved.value}` : section(out, 'JAWAPAN'),
        kbatSummary: section(out, 'KBAT'),
        tipsPemeriksa: section(out, 'TIPS'),
      },
    };
  }

  return {
    ...base,
    hint: {
      hintNumber: phase,
      hintTitle: t.hintTitle[phase - 1],
      hintBody:
        firstSentence(section(out, 'PETUNJUK')) ||
        looseHint(out) ||
        t.defaultHint[phase - 1],
    },
    hintOptions: parseOptions(section(out, 'PILIHAN')).length
      ? parseOptions(section(out, 'PILIHAN'))
      : parseOptions(out),
    formulaTemplate: section(out, 'RUMUS') || undefined,
    kbatPrompt: section(out, 'KBAT') || undefined,
  };
}

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
  if (!isOfflineModelReady()) {
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
    if (!isOfflineModelReady() && serverRes) return serverRes;
    return runLocal(init);
  }
}
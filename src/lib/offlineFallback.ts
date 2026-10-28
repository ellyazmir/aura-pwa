/**
 * Offline fallback for Cikgu AI.
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
 * When there is no internet, the answer is ALWAYS an offline Study Pack (mode: 'offline'),
 * i.e. the same "offline page" the app shows in Mod Luar Talian.
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
    label: 'Qwen2.5 0.5B (~400 MB)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  medium: {
    label: 'Qwen2.5 1.5B (~1.1 GB)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
};

const READY_FLAG = 'cikgu.offlineModelReady';

function pickModel() {
  const forced = localStorage.getItem('cikgu.offlineModel'); // 'small' | 'medium'
  if (forced === 'small' || forced === 'medium') return MODELS[forced];
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  // The 1.5B model is only worth its size when multi-threading is available (see server.ts headers).
  return crossOriginIsolated && mem >= 8 && cores >= 8 ? MODELS.medium : MODELS.small;
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
 * Download + load the model. Call this while ONLINE (e.g. from a "Muat turun mod luar talian"
 * button) so the model is cached in the browser for later offline use.
 */
export function preloadOfflineModel(onProgress?: (percent: number) => void): Promise<Wllama> {
  if (wllama) return Promise.resolve(wllama);
  if (loading) return loading;

  loading = (async () => {
    const model = pickModel();
    console.info('[offline] loading model:', model.label);
    // `as any`: the asset-path type differs between wllama 1.x (5 files) and 2.x+ (2 wasm files).
    // allowOffline is passed in both places because 2.x+ reads it from the constructor.
    const instance = new Wllama(CONFIG_PATHS as any, { allowOffline: true } as any);
    await instance.loadModelFromUrl(model.url, {
      n_ctx: 2048, // room for the Study Pack prompt (~600 tokens) + answer (~700 tokens)
      allowOffline: true, // use the cached copy when there is no internet
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
        if (onProgress && total > 0) onProgress(Math.round((loaded / total) * 100));
      },
    } as any);
    wllama = instance;
    localStorage.setItem(READY_FLAG, model.url);
    console.info('[offline] model loaded');
    return instance;
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

function chatML(system: string, user: string): string {
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;
}

/** One system prompt: the on-device model always writes a complete Study Pack for ANY subject. */
function buildPackSystem(language: Lang): string {
  const lang =
    language === 'en'
      ? 'Reply in English.'
      : language === 'bilingual'
      ? 'Reply in Bahasa Melayu, with key terms also in English in brackets.'
      : 'Reply in Bahasa Melayu.';

  return `You are Cikgu AI, a patient Malaysian KPM (KSSR/KSSM) tutor for ALL school subjects. ${lang}
Rules:
- Answer only the question under "Question:". Ignore anything else.
- Copy numbers, equations and quoted text from the question EXACTLY. Never change them.
- Plain text only. No LaTeX, no dollar signs. Use symbols like x², √, ×, ÷.
- Keep every section short. Do not invent facts, dates or quotations. If unsure, say so.
- If the subject has no formula (e.g. Sejarah, Bahasa, Geografi), leave RUMUS empty.
- Never say an equation has no solution or is impossible.
- Use exactly these headers, each on its own line:
### TAJUK
(topic title, max 8 words)
### UNIT
(chapter or unit name)
### KONSEP
(2 sentences: the key idea needed)
### RUMUS
(key formula, or leave empty)
### PANDUAN
(one sentence: how the student should start)
### LANGKAH
(3 to 5 lines, format: 1. what you do :: the working or key point :: K1)
(calculation: K1 method, N1 answer, P1 knowledge. Other subjects: use 1m per point)
### KESILAPAN
(one common mistake)
### JAWAPAN
(final answer with unit)
### KBAT
(one sentence of reasoning)
### TIPS
(one exam tip)`;
}

function section(text: string, name: string): string {
  const re = new RegExp(`###\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`, 'i');
  return (text.match(re)?.[1] || '').trim();
}

const LEVEL_LABEL: Record<string, string> = {
  auto: 'Auto-Kesan Tahap',
  kssr: 'KSSR Rendah',
  kssm_lower: 'KSSM Menengah Rendah',
  kssm_upper: 'KSSM SPM',
};

const TEXT = {
  bm: {
    encouragement: 'Cikgu bantu anda dalam mod luar talian. Mari cuba langkah demi langkah!',
    disclaimer:
      'ℹ️ Dijana oleh model AI kecil dalam peranti anda (tanpa internet). Jawapan mungkin kurang tepat, sila semak dengan cikgu atau buku teks.',
    hint1: 'Petunjuk 1',
    hint2: 'Petunjuk 2',
  },
  en: {
    encouragement: "I'm helping you in offline mode. Let's go step by step!",
    disclaimer:
      'ℹ️ Generated by a small AI model running on your device (no internet). It may be less accurate, so please check with your teacher or textbook.',
    hint1: 'Hint 1',
    hint2: 'Hint 2',
  },
};

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
// Generate a Study Pack in the same shape the server returns for mode "offline"
// ---------------------------------------------------------------------------
async function generateOffline(body: any): Promise<any> {
  const { messages = [], educationLevel = 'auto', subject = 'Umum', language: requested = 'auto' } = body;

  const question = currentQuestion(messages);
  // The UI no longer has a language picker: answer in the language the question is written in.
  const language: Lang = requested === 'auto' ? detectConversationLanguage(messages) : requested;
  const t = language === 'en' ? TEXT.en : TEXT.bm;
  const solved = solveLinear(question);

  const instance = await preloadOfflineModel();
  const raw: string = await instance.createCompletion(
    chatML(
      buildPackSystem(language as Lang),
      `Question:\n${question.slice(0, 600)}` +
        (solved
          ? `\nVerified answer: ${solved.v} = ${solved.value}. Write steps that lead to exactly this answer. To undo "- n" add n to both sides; to undo "+ n" subtract n.`
          : '')
    ),
    {
      nPredict: 700,
      sampling: { temp: 0.2, top_k: 40, top_p: 0.9 },
      // No live streaming: the student only sees the finished Study Pack, not the raw model text.
    } as any
  );
  const out = raw.replace(/<\|im_(start|end)\|>/g, '').trim();

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
  const safeSteps = steps.length
    ? steps
    : [{ stepNumber: 1, stepDescription: out, workingMath: '', marksScheme: '' }];

  // Show the student's own question instead of the small model's paraphrase:
  // a small model sometimes rewrites the question wrongly.
  const kehendak = question.length > 300 ? question.slice(0, 300) + '...' : question;

  return {
    mode: 'offline' as const,
    topicTag: {
      subject,
      level: LEVEL_LABEL[educationLevel] || 'KPM',
      unit: section(out, 'UNIT') || (language === 'en' ? 'Topic' : 'Topik'),
      title: section(out, 'TAJUK') || kehendak.slice(0, 40),
    },
    warmAcknowledgment: `${t.encouragement} ${t.disclaimer}`,
    kehendakSoalan: kehendak,
    hint1: {
      title: t.hint1,
      concept: section(out, 'KONSEP') || out,
      coreFormula: section(out, 'RUMUS'),
      guide: section(out, 'PANDUAN'),
    },
    hint2: {
      title: t.hint2,
      intermediateSteps: safeSteps.map((s) => s.stepDescription),
      scaffoldingNotes: '',
      commonMistakes: section(out, 'KESILAPAN'),
    },
    finalSolution: {
      markingSchemeCode: language === 'en' ? 'On-device (unofficial)' : 'Dalam peranti (tidak rasmi)',
      steps: safeSteps,
      finalAnswer: solved
        ? `${solved.v} = ${solved.value}`
        : section(out, 'JAWAPAN') || safeSteps[safeSteps.length - 1].workingMath,
      siUnit: '',
      kbatJustification: section(out, 'KBAT'),
      examinerTips: section(out, 'TIPS'),
    },
    suggestedQuickReplies: [],
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
    await fetch('https://api.groq.com/openai/v1/models', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return true;
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
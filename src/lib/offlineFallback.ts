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
 */
import { Wllama } from '@wllama/wllama';
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
      n_ctx: 1536,
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

function buildSystem(language: Lang, phase: number): string {
  const lang =
    language === 'en'
      ? 'Reply in English.'
      : language === 'bilingual'
      ? 'Reply in Bahasa Melayu, with key terms also in English in brackets.'
      : 'Reply in Bahasa Melayu.';

  const base = `You are Cikgu AI, a patient Malaysian KPM (KSSR/KSSM) tutor. ${lang}
Rules:
- Copy the numbers and equations from the question EXACTLY. Never change them.
- Write plain text only. No LaTeX, no dollar signs. Use symbols like x², √, ×, ÷.
- Keep every section short.
- Never say an equation has no solution or is impossible. Never state the final answer in a hint. Just guide the next step.
- Use exactly the section headers shown below, each on its own line.`;

  if (phase === 3) {
    return `${base}
Solve the question completely. Output:
### KEHENDAK
(one sentence: what the question asks)
### LANGKAH
(one step per line, format: 1. what you do :: the working :: K1)
(use K1 for method marks, N1 for the final answer mark, P1 for knowledge marks)
### JAWAPAN
(final answer with unit)`;
  }

  return `${base}
Do NOT give the final answer. Guide the student with one hint only. Output:
### KEHENDAK
(one sentence: what the question asks)
### PETUNJUK
(one helpful hint that starts the student on the next step)
### RUMUS
(the key formula, or leave empty)
### KBAT
(one "Mengapa" or "Bagaimana" thinking question)`;
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
    next: 'Cuba langkah seterusnya dalam Buku Latihan.',
    replies: ['Saya cuba langkah ini', 'Beri petunjuk lagi', 'Terangkan rumus ini'],
    phase3: 'Jalan kerja mengikut format penandaan (dijana dalam peranti).',
  },
  en: {
    encouragement: "I'm helping you in offline mode. Let's go step by step!",
    disclaimer:
      'ℹ️ Generated by a small AI model running on your device (no internet). It may be less accurate, so please check with your teacher or textbook.',
    hint1: 'Hint 1',
    hint2: 'Hint 2',
    next: 'Try the next step in your scratchpad.',
    replies: ['I tried this step', 'Give me another hint', 'Explain this formula'],
    phase3: 'Working in marking-scheme format (generated on device).',
  },
};

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
// Generate a response in the same shape the server returns
// ---------------------------------------------------------------------------
async function generateOffline(body: any): Promise<any> {
  const {
    messages = [],
    educationLevel = 'auto',
    subject = 'Umum',
    language = 'bm',
    requestDirectPhase3 = false,
    userAttempt = '',
  } = body;

  const userMsgs = messages.filter((m: any) => m.role === 'user');
  const question: string = userMsgs[0]?.content || '';
  const phase = requestDirectPhase3 ? 3 : userMsgs.length <= 1 && !userAttempt ? 1 : 2;
  const t = language === 'en' ? TEXT.en : TEXT.bm;

  const recent = messages
    .slice(-3)
    .map((m: any) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${String(m.content).slice(0, 300)}`)
    .join('\n');

  const userPrompt =
    `Question:\n${question}\n\n` +
    (userMsgs.length > 1 ? `Recent conversation:\n${recent}\n\n` : '') +
    (userAttempt ? `Student's working:\n${userAttempt}\n\n` : '') +
    (phase === 2 ? 'Check the working gently, then give the next hint.' : '');

  const instance = await preloadOfflineModel();
  let lastEmit = 0;
  const raw: string = await instance.createCompletion(
    chatML(buildSystem(language as Lang, phase), userPrompt),
    {
      nPredict: phase === 3 ? 450 : 220,
      sampling: { temp: 0.2, top_k: 40, top_p: 0.9 },
      // Stream partial text to the UI (throttled) so the wait feels shorter.
      onNewToken: (_token: number, _piece: Uint8Array, currentText: string) => {
        const now = Date.now();
        if (streamCb && now - lastEmit > 120) {
          lastEmit = now;
          streamCb(currentText.replace(/<\|im_(start|end)\|>/g, '').replace(/###\s*/g, ''));
        }
      },
    } as any
  );
  const out = raw.replace(/<\|im_(start|end)\|>/g, '').trim();

  // Show the student's own question instead of the small model's paraphrase:
  // a 1.5B model sometimes rewrites the question wrongly (e.g. claims "no solution").
  const kehendak = question.length > 300 ? question.slice(0, 300) + '...' : question;

  const base = {
    mode: 'online' as const,
    phase,
    phaseTitle: language === 'en' ? 'Device Mode (Offline)' : 'Mod Peranti (Luar Talian)',
    curriculumBadge: LEVEL_LABEL[educationLevel] || 'KPM',
    subjectBadge: subject,
    encouragement: t.encouragement,
    kehendakSoalan: kehendak,
    explanation: t.disclaimer,
    nextActionPrompt: t.next,
    suggestedQuickReplies: t.replies,
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
      hint: { hintNumber: 3, hintTitle: t.phase3, hintBody: '' },
      officialSkema: {
        markingCode: language === 'en' ? 'On-device (unofficial)' : 'Dalam peranti (tidak rasmi)',
        steps: steps.length ? steps : [{ stepNumber: 1, stepDescription: out, workingMath: '', marksScheme: '' }],
        finalAnswerUnit: section(out, 'JAWAPAN'),
      },
    };
  }

  return {
    ...base,
    hint: {
      hintNumber: phase === 1 ? 1 : 2,
      hintTitle: phase === 1 ? t.hint1 : t.hint2,
      hintBody: section(out, 'PETUNJUK') || out,
    },
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
async function hasInternet(): Promise<boolean> {
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
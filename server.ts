import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'node:stream';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Default to port 5173 (standard Vite/preview port) if process.env.PORT is not specified
const PORT = Number(process.env.PORT) || 5173;

app.use(express.json({ limit: '20mb' }));

// Cross-origin isolation: lets the browser run the on-device AI model on several CPU threads.
// "credentialless" (not "require-corp") keeps cross-origin requests like the internet check working.
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

// Offline model download through this server.
// Fallback for browsers that cannot download the model straight from Hugging Face
// (blocked CDN, proxy, or a reply without Content-Length, which makes wllama report
// "Input model (or splits) must be non-empty Blob or File").
// Only these two fixed files can be fetched, so this is not an open proxy.
const OFFLINE_MODEL_URLS: Record<string, string> = {
  small:
    'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  medium:
    'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
};

app.get('/api/offline-model/:tier', async (req, res) => {
  const url = Object.hasOwn(OFFLINE_MODEL_URLS, req.params.tier)
    ? OFFLINE_MODEL_URLS[req.params.tier]
    : undefined;
  if (!url) return res.status(404).json({ error: 'Unknown model.' });

  const abort = new AbortController();
  res.on('close', () => abort.abort()); // browser cancelled: stop downloading
  try {
    const upstream = await fetch(url, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      signal: abort.signal,
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `Model host answered HTTP ${upstream.status}.` });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    for (const h of ['content-length', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (req.method === 'HEAD' || !upstream.body) return res.end();
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch (err: any) {
    if (abort.signal.aborted) return;
    console.warn('[offline-model] download failed:', err?.message || err);
    if (!res.headersSent) res.status(502).json({ error: 'Could not reach the model host.' });
    else res.destroy();
  }
});

// LLM providers: Gemini first, Groq as fallback (both OpenAI-compatible, plain HTTPS, no extra SDK)
const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

type Provider = {
  name: string;
  url: string;
  key: string;
  chatModel: string;
  visionModel: string;
  extraHeaders?: Record<string, string>;
};

// Order matters: the first provider is the main one, the next is the fallback.
// Model IDs: for Gemini see https://ai.google.dev/gemini-api/docs/models; for Groq check with list-models.mjs
function getProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: 'Gemini',
      url: GEMINI_CHAT_URL,
      key: process.env.GEMINI_API_KEY,
      chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
      visionModel: process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite',
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: 'Groq',
      url: GROQ_CHAT_URL,
      key: process.env.GROQ_API_KEY,
      chatModel: process.env.GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b',
      visionModel: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
    });
  }
  return providers;
}

async function callProvider(
  p: Provider,
  body: Record<string, unknown>,
  hasImage: boolean,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(p.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.key}`,
        'Content-Type': 'application/json',
        ...p.extraHeaders,
      },
      body: JSON.stringify({ ...body, model: hasImage ? p.visionModel : p.chatModel }),
    });
  } catch (err: any) {
    // Network failure / DNS / timeout: no HTTP status
    throw new ProviderError(`${p.name} request failed: ${err?.message || err}`);
  }
  const raw: any = await response.json().catch(() => ({}));
  // Gemini sometimes wraps error bodies in an array
  const json: any = Array.isArray(raw) ? raw[0] : raw;
  if (!response.ok) {
    const detail = json?.error?.message || json?.error || json?.message || response.statusText;
    throw new ProviderError(`${p.name} API error ${response.status}: ${detail}`, response.status);
  }
  return json?.choices?.[0]?.message?.content || '';
}

// Errors where trying the other provider makes sense: quota/rate limit, billing, auth, model not found (404), server/network problems.
function shouldFallback(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  const s = err.status;
  return (
    s === undefined ||
    s === 401 ||
    s === 402 ||
    s === 403 ||
    s === 404 ||
    s === 408 ||
    s === 429 ||
    s >= 500
  );
}

// After a provider reports a quota/rate limit (429), skip it briefly so users don't wait on a doomed call.
const blockedUntil: Record<string, number> = {};
const COOLDOWN_MS = 60 * 1000;

async function chatCompletion(body: Record<string, unknown>, hasImage: boolean): Promise<string> {
  let providers = getProviders();
  if (providers.length === 0) {
    throw new Error(
      'No API key found. Set GEMINI_API_KEY and/or GROQ_API_KEY in the .env file and restart the server.',
    );
  }
  // Skip providers that are in cooldown, but always keep at least one to try
  const available = providers.filter((p) => Date.now() >= (blockedUntil[p.name] || 0));
  if (available.length > 0) providers = available;

  let lastError: unknown;
  for (const p of providers) {
    try {
      return await callProvider(p, body, hasImage);
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && err.status === 429) {
        blockedUntil[p.name] = Date.now() + COOLDOWN_MS;
      }
      if (!shouldFallback(err)) throw err;
      console.warn(
        `[LLM] ${p.name} failed, trying next provider if available:`,
        (err as Error).message,
      );
    }
  }
  throw lastError;
}

/** Extract and parse a JSON object from a model reply (handles code fences / stray text). */
function parseJsonReply(raw: string): any {
  let text = (raw || '').trim();
  // Drop reasoning blocks some Qwen variants emit
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON.');
  }
}

/**
 * The UI shows plain text, so convert any LaTeX the model writes into plain Unicode.
 * Only touches $...$ when the content really looks like LaTeX, so money like "$5 and $10" is kept.
 */
function stripLatex(v: any): any {
  if (typeof v === 'string') {
    return v
      .replace(/\$\$?([^$]*\\[a-zA-Z]+[^$]*)\$\$?/g, '$1')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
      .replace(/\\([a-zA-Z]+)/g, '$1');
  }
  if (Array.isArray(v)) return v.map(stripLatex);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripLatex(x)]));
  }
  return v;
}

/** Call the model and return the parsed JSON reply. Retries once if the JSON is malformed. */
async function generateJson(opts: {
  system?: string;
  prompt: string;
  shape: string;
  image?: { data: string; mimeType: string } | null;
}): Promise<any> {
  const { system, prompt, shape, image } = opts;

  const userText = `${prompt}

OUTPUT FORMAT:
Respond with ONLY one valid JSON object (no markdown, no code fences, no commentary) that follows exactly this shape. Keys must match exactly; fill every field with real content (use an empty string "" only where the field says it may be empty).
${shape}`;

  const content: any[] = [];
  if (image) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }
  content.push({ type: 'text', text: userText });

  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await chatCompletion(
      {
        messages,
        temperature: 0.2,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      },
      !!image,
    );
    try {
      const result = stripLatex(parseJsonReply(reply));
      // Internal scratch field used only to keep the hints consistent; never send to the browser.
      if (result && typeof result === 'object') delete result.privateSolution;
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const CIKGU_SYSTEM_PROMPT = `
You are "Aura Tutor", an adaptive, patient, and structured educational assistant expert in ALL subjects of the Malaysian Ministry of Education (KPM) primary (KSSR) and secondary (KSSM) national curricula: Matematik, Matematik Tambahan, Sains, Fizik, Kimia, Biologi, Bahasa Melayu, English, Sejarah, Geografi, Pendidikan Islam, Pendidikan Moral, Ekonomi, Prinsip Perakaunan, Perniagaan, Sains Komputer, RBT, and any other school subject.

[CONTEXT & INSIGHT]
Malaysian students ask academic questions across all subjects:
- KSSR (Standard 1–6): Uses simplified explanation techniques, visual steps, basic terminology, and follows UASA (Ujian Akhir Sesi Akademik) format.
- KSSM (Form 1–5): Uses analytical steps, Higher-Order Thinking Skills (KBAT / HOTS), standard terms (e.g., Pemboleh Ubah Bergerak Balas, Justifikasi, Hipotesis), and follows UASA (Form 1–3) & SPM (Form 4–5) marking standards (Kertas 1, Kertas 2, Skema Markah).

[CURRENT QUESTION RULE - MUST FOLLOW]
Always respond to the student's LATEST message. If it is a new question (even in a different subject), forget earlier questions and start fresh with it. Only continue earlier hints when the latest message is clearly a reply, attempt or follow-up to the question being discussed. Never mix two questions together.

[SUBJECT ADAPTATION - MUST FOLLOW]
First decide which type the question is, then adapt your hints and the final solution:
- CALCULATION (Matematik, Matematik Tambahan, Fizik, Kimia calculations, Prinsip Perakaunan, Ekonomi calculations): formula, working steps, SI units, marks K1 / N1 / P1.
- SCIENCE CONCEPT (Sains, Biologi, Kimia, Fizik theory): key terms, explanation of the process or cause and effect, description of the diagram, and an answer built from marked points (1 markah per correct isi). Use K1/N1/P1 only if there is a calculation.
- HUMANITIES (Sejarah, Geografi, Pendidikan Islam, Pendidikan Moral, Ekonomi, Perniagaan): key facts (fakta), elaboration (huraian), examples (contoh), and for KBAT questions a justification or opinion supported with evidence. Structure the answer the way the SPM mark scheme does: Fakta + Huraian, 1 markah each.
- LANGUAGE (Bahasa Melayu, English): for comprehension, point to the evidence in the text. For essays, give planning hints (isi, structure, grammar / tatabahasa, vocabulary) and a model answer. For grammar, state the rule and then apply it.
For subjects with no formula: set any formula field ("formulaTemplate", "coreFormula") to an empty string, put the model-answer point of each step in "workingMath", use point-based marks in "marksScheme" (e.g. "Fakta 1m, Huraian 1m"), and leave "siUnit" / "finalAnswerUnit" for the short final answer or empty. Never invent formulas or numbers for a subject that does not use them.

[OPERATIONAL MODES]
You operate in one of TWO modes:

1. ONLINE MODE (Full Interactive Socratic Scaffolding)
   - Goal: Engage the student in a multi-turn conversation.
   - Behavior: Provide 1 hint at a time (Phase 1 & Phase 2). Prompt the student to submit their next step before revealing more details or final answers.
   - PHASE 1 (Turn 1): Warm appreciation. Do NOT reveal final answers. Give HINT 1 (guiding question, concept breakdown, formula or answer template) and ask the student to attempt the first step.
   - PHASE 2 (Middle Turns): Validate partial progress. Provide HINT 2 or HINT 3 (execution or logic steps). Point out errors gently. Prompt KBAT ("Mengapa" / "Bagaimana").
   - PHASE 3 (Final Turn): Once the student solves it OR requests the final solution ("Show answer" / "Tunjukkan jawapan"): Confirm correctness and render the full answer matching official KSSR / KSSM / SPM marking schemes.

2. OFFLINE MODE (Self-Contained Offline Study Pack)
   - Goal: Support offline/low-connectivity environments where multi-turn interaction isn't guaranteed.
   - Behavior: Provide the complete guided pathway in a SINGLE output.
   - Single-Response Structure:
     1. Warm Acknowledgment & Topic Tag (Subject, Standard/Form, Unit).
     2. HINT 1: Concept & Core Formula (or key idea).
     3. HINT 2: Intermediate Workings & Scaffolding Steps.
     4. FINAL SOLUTION: Complete official KSSR/KSSM answer block (Langkah / units where relevant / KBAT Justification / Skema Markah).

[MULTIMODAL & IMAGE RECOGNITION]
If an image is attached:
- Carefully inspect all visual diagrams, circuit schematics, geometric figures, charts, tables, maps, reading passages and handwritten questions.
- Transcribe or refer to key visual labels (e.g., angle ABC = 45°, resistor R1 = 5Ω, graph gradient, a map label).

[PERSONALITY & TONE]
- Encouraging, supportive, structured (clear headers, bullet points, bold key terms).
- Dual-language support (Bahasa Melayu or English), matching the student's input language.
- Standard Malaysian KPM textbook vocabulary and notation formats.

[ACCURACY & FORMAT RULES - MUST FOLLOW]
- Always restate the question, given values, quoted text and equations EXACTLY as written by the student. Never change, rescale or add coefficients (for example, never turn mn into 2mn). If the question is unclear or the image is hard to read, say what you can read and ask the student to confirm instead of guessing.
- Before writing any hint, first work out the complete correct answer and verify it in the "privateSolution" field (for non-calculation subjects, this is your model answer with its key points). Every hint, formula and step you write afterwards MUST be consistent with it and with the explanation.
- Only state facts, dates, definitions and quotations you are confident about. If you are unsure, say so instead of guessing.
- NEVER use LaTeX or dollar signs. Write maths in plain text with Unicode: m, n, x², √, ×, ÷, ≤, ≥, π, and fractions like (a)/(b) or a/b.
- LANGUAGE: obey the "LANGUAGE PREFERENCE" line in the user prompt for every text field. The JSON key names (kehendakSoalan, nextActionPrompt, ...) are fixed identifiers and say nothing about which language to write in.
- suggestedQuickReplies: exactly 3 short, complete sentences (maximum 8 words each). Never cut a sentence off.
- ONLINE MODE hint format: "hint.hintBody" must be exactly ONE short sentence (maximum 25 words) that nudges the student toward the next step without giving the answer.
- ONLINE MODE "hintOptions" (Phase 1 and 2 only): exactly 3 short options (maximum 12 words each) for what the student could do or answer next. Exactly ONE option is correct and consistent with "privateSolution"; the other two are common, plausible mistakes. Put the correct one in a random position. Do not prefix options with letters or numbers, and do not mark which one is correct. In Phase 3 use an empty array.
`;

/** Keep only the first sentence of a hint (does not split on decimals like 3.5). */
function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const m = t.match(/^.*?[.!?](?=\s+[A-Z0-9"'(]|$)/);
  return (m ? m[0] : t).trim();
}

/** Clean the model's hintOptions: strings only, no "A)" prefixes, no duplicates, max 3. */
function cleanHintOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/^\s*(?:[A-Ca-c][.):]|\d+[.)])\s+/, '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === 3) break;
  }
  return out.length >= 2 ? out : [];
}

/** Language rule for the prompt. "auto" (the UI default) = answer in the language the student wrote in. */
function languageInstruction(language: string): string {
  if (language === 'en') {
    return 'ENGLISH. Write EVERY text field in English: phaseTitle, curriculumBadge, subjectBadge, topicUnit, encouragement, kehendakSoalan, explanation, hintTitle, hintBody, hintOptions, kbatPrompt, nextActionPrompt, suggestedQuickReplies and all marking-scheme text. Do not write Bahasa Melayu (official labels such as KBAT, K1/N1/P1 may stay).';
  }
  if (language === 'bm') {
    return 'BAHASA MELAYU. Write EVERY text field in Bahasa Melayu (phaseTitle, encouragement, explanation, hint, hintOptions, nextActionPrompt, suggestedQuickReplies and marking-scheme text). Do not write English except for the English subject content itself.';
  }
  if (language === 'bilingual') return 'Bahasa Melayu with key terms also in English (DLP bilingual)';
  return "AUTO: reply in the same language as the student's latest message (English question = English reply, Bahasa Melayu question = Bahasa Melayu reply). Keep every field, including the hint options, in that language.";
}

/** Text of the latest user message (the question or reply to answer now). */
function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return String(messages[i].content ?? '');
  }
  return String(messages[messages.length - 1]?.content ?? '');
}

// Scan & OCR Endpoint
app.post('/api/cikgu/scan-image', async (req, res) => {
  try {
    const { image, language = 'bm' } = req.body;
    if (!image || !image.data || !image.mimeType) {
      return res.status(400).json({ error: 'Image data and mimeType are required.' });
    }

    const scanPrompt = `
You are an expert Malaysian KPM exam question scanner and digitizer.
Please analyze this uploaded photo of a school question, worksheet, or textbook page.
Extract and transcribe the primary question clearly and accurately.
1. Transcribe the full question text with clean formatting, copying every number, sign, equation and quoted sentence EXACTLY as printed. If the page includes a reading passage, table, map, source extract or diagram, include its crucial content or describe it (e.g. "[Rajah menunjukkan segi tiga bersudut tegak dengan hipotenus 10 cm...]"). Write formulas in plain text without LaTeX or dollar signs (e.g. f(x) = 2x² - 4x + k, F = ma).
2. Detect the subject using KPM naming, e.g. "Matematik", "Matematik Tambahan", "Fizik", "Kimia", "Biologi", "Sains", "Sejarah", "Geografi", "Pendidikan Islam", "Ekonomi", "Prinsip Perakaunan", "Bahasa Melayu", "English", or the actual subject name if it is something else.
3. Detect the educational level: "kssr" (Standard 1–6), "kssm_lower" (Form 1–3 UASA), or "kssm_upper" (Form 4–5 SPM).
4. Provide a brief 1-sentence summary of what is being tested.

`;

    const parsed = await generateJson({
      prompt: scanPrompt,
      image,
      shape: `{
  "extractedText": "string - the full digitized question text with formulas, passages and diagram descriptions",
  "detectedSubject": "string - e.g. Matematik Tambahan, Fizik, Sejarah, Bahasa Melayu, English",
  "detectedLevel": "string - exactly one of: kssr, kssm_lower, kssm_upper",
  "summary": "string - brief 1-line summary of topic or question intent"
}`,
    });
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error scanning question image:', error);
    return res.status(500).json({
      error: 'Gagal mengimbas gambar soalan. Sila pastikan gambar jelas dan cuba lagi.',
      details: error?.message || 'Unknown error',
    });
  }
});

// Chat & Socratic Guidance Endpoint
app.post('/api/cikgu/chat', async (req, res) => {
  try {
    const {
      mode = 'online',
      messages = [],
      educationLevel = 'auto',
      subject = 'Umum',
      language = 'bm',
      requestDirectPhase3 = false,
      userAttempt = '',
      image = null,
    } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    // Only pass a usable image to the model
    const chatImage =
      image && image.data && image.mimeType
        ? { data: image.data as string, mimeType: image.mimeType as string }
        : null;

    if (mode === 'offline') {
      // Always answer the CURRENT question (latest user message)
      const userQuestion = lastUserText(messages);
      const offlinePrompt = `
     MODE: OFFLINE MODE (Self-Contained Offline Study Pack)
KPM CURRICULUM LEVEL: ${educationLevel}
DEFAULT SUBJECT (from the UI, may be outdated; detect the real subject from the question): ${subject}
LANGUAGE PREFERENCE: ${languageInstruction(language)}
USER QUESTION (answer ONLY this, ignore any earlier question): ${userQuestion}
${image ? 'NOTE: An image of the question / diagram is attached above. Refer to its visual data, diagram labels, and figures.' : ''}

Please generate a single self-contained study pack in JSON with:
1. Topic Tag (subject, level e.g. KSSM Tingkatan 4, unit e.g. Bab 2: Daya dan Gerakan, title)
2. Warm Acknowledgment & Kehendak Soalan
3. HINT 1: Concept & Core Formula (or the key idea if the subject has no formula)
4. HINT 2: Intermediate Workings & Scaffolding Steps (with common mistakes)
5. FINAL SOLUTION: Complete official KSSR/KSSM model answer with marking scheme code (e.g. SPM Kertas 2 / UASA). For calculation subjects use [K1/N1/P1] marks and SI units; for other subjects list the marked points (fakta / huraian / contoh / isi) with their marks. Include KBAT justification and examiner tips.
`;

      const parsed = await generateJson({
        system: CIKGU_SYSTEM_PROMPT,
        prompt: offlinePrompt,
        image: chatImage,
        shape: `{
  "privateSolution": "string - FIRST quote the question exactly as given, then work out the complete answer and verify it. Never shown to the student.",
  "topicTag": { "subject": "string", "level": "string", "unit": "string", "title": "string" },
  "warmAcknowledgment": "string",
  "kehendakSoalan": "string",
  "hint1": { "title": "string", "concept": "string", "coreFormula": "string (empty string if the subject has no formula)", "guide": "string" },
  "hint2": {
    "title": "string",
    "intermediateSteps": ["string"],
    "scaffoldingNotes": "string",
    "commonMistakes": "string"
  },
  "finalSolution": {
    "markingSchemeCode": "string",
    "steps": [
      { "stepNumber": 1, "stepDescription": "string", "workingMath": "string (working, or the model-answer point for non-calculation subjects)", "marksScheme": "string e.g. K1, N1, P1 or Fakta 1m, Huraian 1m" }
    ],
    "finalAnswer": "string",
    "siUnit": "string (empty string if not applicable)",
    "kbatJustification": "string",
    "examinerTips": "string"
  },
  "suggestedQuickReplies": ["string"]
}`,
      });
      parsed.mode = 'offline';
      return res.json({ success: true, data: parsed });
    }

    // ONLINE MODE
    const userMessageCount = messages.filter((m: any) => m.role === 'user').length;
    let targetPhase = 1;
    if (requestDirectPhase3) {
      targetPhase = 3;
    } else if (userMessageCount <= 1 && !userAttempt) {
      targetPhase = 1;
    } else {
      targetPhase = 2;
    }

    const lastUserMsg = lastUserText(messages);
    // Only recent turns, so an old topic cannot bleed into a new question
    const recentMessages = messages.slice(-8);

    const conversationPrompt = `
MODE: ONLINE MODE (Full Interactive Socratic Scaffolding)
KPM CURRICULUM LEVEL: ${educationLevel}
DEFAULT SUBJECT (from the UI, may be outdated; detect the real subject from the question): ${subject}
LANGUAGE PREFERENCE: ${languageInstruction(language)}
USER REQUESTED DIRECT FINAL SOLUTION / PHASE 3: ${requestDirectPhase3 ? 'YES - TRANSITION IMMEDIATELY TO PHASE 3' : 'NO - PROCEED WITH PHASE 1 OR 2'}
USER SCRATCHPAD ATTEMPT (may belong to an older question; ignore it if the latest message is a new question): ${userAttempt || 'None'}
${image ? 'NOTE: An image is attached above. Use it only if it matches the latest question; otherwise ignore it.' : ''}

CONVERSATION HISTORY (oldest to newest):
${recentMessages.map((m: any) => `[${String(m.role).toUpperCase()}]: ${m.content}`).join('\n\n')}

LATEST STUDENT MESSAGE (respond to THIS):
"""
${lastUserMsg}
"""

QUESTION TRACKING:
- Decide whether the latest message is (a) a NEW question different from earlier ones, or (b) a reply, attempt or follow-up about the question already being discussed.
- If NEW: ignore the earlier conversation completely. Treat it as turn 1 of a brand-new question: Phase 1 (unless the student asked for the full solution), with new subject and topic badges. Set "isNewQuestion": true. Do not mention or reuse the previous question or its hints.
- If follow-up: continue the question being discussed at the phase below. Set "isNewQuestion": false.
- A message that starts with "Pilihan saya:" or "My choice:" is the option the student picked from your previous "hintOptions". It is a follow-up, never a new question, and the "Pilihan saya:" / "My choice:" label does not change the language: keep replying in the language of the original question. Compare it with your earlier solution: say gently whether it is right or wrong in "explanation" (do not give the final answer unless Phase 3), then give the next one-sentence hint and 3 new options.

INSTRUCTIONS:
- Phase to use when continuing the same question: ${requestDirectPhase3 ? '3' : targetPhase}.
- If Phase 1: Acknowledge warmly, identify Kehendak Soalan and give HINT 1. NEVER give the final answer in Phase 1.
- If Phase 2: Validate student working, provide HINT 2 or 3, include KBAT prompt ("Mengapa / Bagaimana"). Do not reveal the final answer yet.
- If Phase 3: Confirm correctness and render the official KSSR / KSSM / SPM marking scheme (K1/N1/P1 marks and SI units for calculations, point-based marks for other subjects, plus examiner tips).
`;

    const parsed = await generateJson({
      system: CIKGU_SYSTEM_PROMPT,
      prompt: conversationPrompt,
      image: chatImage,
      shape: `{
  "privateSolution": "string - FIRST quote the question exactly as in the student's message, then work out the complete answer and verify it. Never shown to the student; all hints must stay consistent with it.",
  "isNewQuestion": true,
  "phase": 1,
  "phaseTitle": "string",
  "curriculumBadge": "string",
  "subjectBadge": "string",
  "topicUnit": "string",
  "encouragement": "string",
  "kehendakSoalan": "string",
  "explanation": "string",
  "hint": { "hintNumber": 1, "hintTitle": "string", "hintBody": "string - exactly ONE short sentence (max 25 words), no answer" },
  "hintOptions": ["string", "string", "string"],
  "formulaTemplate": "string (optional; empty string if the subject has no formula)",
  "kbatPrompt": "string (optional)",
  "nextActionPrompt": "string",
  "suggestedQuickReplies": ["string"],
  "officialSkema": {
    "markingCode": "string",
    "steps": [
      { "stepNumber": 1, "stepDescription": "string", "workingMath": "string (working, or the model-answer point for non-calculation subjects)", "marksScheme": "string e.g. K1, N1, P1 or Fakta 1m, Huraian 1m" }
    ],
    "finalAnswerUnit": "string",
    "kbatSummary": "string",
    "tipsPemeriksa": "string"
  }
}
"isNewQuestion" is a boolean. "phase" must be the integer 1, 2 or 3 (1 = Inquiry/Hint 1, 2 = Guided Hinting/KBAT, 3 = Official Full Marking Scheme). "hintNumber" is an integer. "hintOptions" has exactly 3 options in Phase 1 and 2 (one correct, two plausible mistakes) and is an empty array in Phase 3. Include "officialSkema" ONLY in Phase 3; omit it in Phase 1 and 2.`,
    });

    // Safety net: a brand-new question must start at Phase 1 and never leak the answer
    if (parsed.isNewQuestion === true && !requestDirectPhase3) {
      parsed.phase = 1;
      delete parsed.officialSkema;
      if (parsed.hint && typeof parsed.hint === 'object') parsed.hint.hintNumber = 1;
    }
    delete parsed.isNewQuestion;

    // Hint = one sentence; options only while the student is still working (Phase 1 and 2)
    if (parsed.hint && typeof parsed.hint.hintBody === 'string') {
      parsed.hint.hintBody = firstSentence(parsed.hint.hintBody);
    }
    parsed.hintOptions = parsed.phase === 3 ? [] : cleanHintOptions(parsed.hintOptions);

    parsed.mode = 'online';
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error generating Aura Tutor response:', error);
    return res.status(500).json({
      error: 'Gagal memproses soalan. Sila cuba lagi sebentar lagi.',
      details: error?.message || 'Unknown error',
    });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      // Missing files (js, wasm, ...) must be a 404, never index.html
      if (path.extname(req.path)) return res.status(404).end();
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aura Tutor Server is running on http://localhost:${PORT}`);
  });
}

startServer();
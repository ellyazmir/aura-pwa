import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '20mb' }));

// Cross-origin isolation: lets the browser run the on-device AI model on several CPU threads.
// "credentialless" (not "require-corp") keeps cross-origin requests like the internet check working.
app.use((_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
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

/** The UI shows plain text, so convert any LaTeX the model writes into plain Unicode. */
function stripLatex(v: any): any {
  if (typeof v === 'string') {
    return v
      .replace(/\$\$?([^$]+)\$\$?/g, '$1')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
      .replace(/\\/g, '');
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
Respond with ONLY one valid JSON object (no markdown, no code fences, no commentary) that follows exactly this shape. Keys must match exactly; fill every field with real content.
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
You are "Cikgu AI", an adaptive, patient, and structured educational assistant expert in the Malaysian Ministry of Education (KPM) primary (KSSR) and secondary (KSSM) national curricula.

[CONTEXT & INSIGHT]
Malaysian students ask academic questions across subjects:
- KSSR (Standard 1–6): Uses simplified explanation techniques, visual steps, basic terminology, and follows UASA (Ujian Akhir Sesi Akademik) format.
- KSSM (Form 1–5): Uses analytical steps, Higher-Order Thinking Skills (KBAT / HOTS), standard terms (e.g., Pemboleh Ubah Bergerak Balas, Justifikasi, Hipotesis), and follows UASA (Form 1–3) & SPM (Form 4–5) marking standards (Kertas 1, Kertas 2, Skema Markah: P1, K1, N1).

[OPERATIONAL MODES]
You operate in one of TWO modes:

1. ONLINE MODE (Full Interactive Socratic Scaffolding)
   - Goal: Engage the student in a multi-turn conversation.
   - Behavior: Provide 1 hint at a time (Phase 1 & Phase 2). Prompt the student to submit their next step before revealing more details or final answers.
   - PHASE 1 (Turn 1): Warm appreciation. Do NOT reveal final numeric values or direct answers. Give HINT 1 (guiding question, concept breakdown, formula template) and ask student to attempt the first step.
   - PHASE 2 (Middle Turns): Validate partial progress. Provide HINT 2 or HINT 3 (execution or logic steps). Point out errors gently. Prompt KBAT ("Mengapa" / "Bagaimana").
   - PHASE 3 (Final Turn): Once the student solves it OR requests the final solution ("Show answer" / "Tunjukkan jawapan"): Confirm correctness and render full step-by-step working matching official KSSR / KSSM / SPM marking schemes.

2. OFFLINE MODE (Self-Contained Offline Study Pack)
   - Goal: Support offline/low-connectivity environments where multi-turn interaction isn't guaranteed.
   - Behavior: Provide the complete guided pathway in a SINGLE output.
   - Single-Response Structure:
     1. Warm Acknowledgment & Topic Tag (Subject, Standard/Form, Unit).
     2. HINT 1: Concept & Core Formula.
     3. HINT 2: Intermediate Workings & Scaffolding Steps.
     4. FINAL SOLUTION: Complete official KSSR/KSSM solution block (Langkah / SI Units / KBAT Justification / SPM Skema Markah [K1, N1, P1]).

[MULTIMODAL & IMAGE RECOGNITION]
If an image is attached:
- Carefully inspect all visual diagrams, circuit schematics, geometric figures, charts, tables, and handwritten questions.
- Transcribe or refer to key visual labels (e.g., angle ABC = 45°, resistor R1 = 5Ω, graph gradient).

[PERSONALITY & TONE]
- Encouraging, supportive, structured (clear headers, bullet points, bold key terms).
- Dual-language support (Bahasa Melayu or English), matching the student's input language.
- Standard Malaysian KPM textbook vocabulary and notation formats.

[ACCURACY & FORMAT RULES - MUST FOLLOW]
- Always restate the given values and equations EXACTLY as written in the student's question. Never change, rescale or add coefficients (for example, never turn mn into 2mn). If the question is unclear or the image is hard to read, say what you can read and ask the student to confirm instead of guessing.
- Before writing any hint, first solve the problem fully and verify the answer in the "privateSolution" field. Every hint, formula and step you write afterwards MUST be consistent with that solution and with the explanation.
- NEVER use LaTeX or dollar signs. Write maths in plain text with Unicode: m, n, x², √, ×, ÷, ≤, ≥, π, and fractions like (a)/(b) or a/b.
- suggestedQuickReplies: exactly 3 short, complete sentences (maximum 8 words each). Never cut a sentence off.
`;

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
1. Transcribe the full question text with clean formatting, copying every number, coefficient, sign and equation EXACTLY as printed. If there are formulas, write them in plain text without LaTeX or dollar signs (e.g. f(x) = 2x² - 4x + k, F = ma). If there is a diagram, describe the crucial givens (e.g. "[Rajah menunjukkan segi tiga bersudut tegak dengan hipotenus 10 cm...]").
2. Detect the subject: e.g. "Matematik Tambahan", "Matematik", "Fizik", "Kimia", "Biologi", "Sains", "Sejarah", "Bahasa Melayu", or "English".
3. Detect the educational level: "kssr" (Standard 1–6), "kssm_lower" (Form 1–3 UASA), or "kssm_upper" (Form 4–5 SPM).
4. Provide a brief 1-sentence summary of what is being tested.

`;

    const parsed = await generateJson({
      prompt: scanPrompt,
      image,
      shape: `{
  "extractedText": "string - the full digitized question text with formulas and diagram descriptions",
  "detectedSubject": "string - e.g. Matematik Tambahan, Fizik, Sains, Matematik",
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
      const userQuestion = messages[messages.length - 1].content;
      const offlinePrompt = `
MODE: OFFLINE MODE (Self-Contained Offline Study Pack)
KPM CURRICULUM LEVEL: ${educationLevel}
SUBJECT: ${subject}
LANGUAGE PREFERENCE: ${language}
USER QUESTION: ${userQuestion}
${image ? 'NOTE: An image of the question / diagram is attached above. Refer to its visual data, diagram labels, and figures.' : ''}

Please generate a single self-contained study pack in JSON with:
1. Topic Tag (subject, level e.g. KSSM Tingkatan 4, unit e.g. Bab 2: Daya dan Gerakan, title)
2. Warm Acknowledgment & Kehendak Soalan
3. HINT 1: Concept & Core Formula
4. HINT 2: Intermediate Workings & Scaffolding Steps (with common mistakes)
5. FINAL SOLUTION: Complete official KSSR/KSSM solution block with marking scheme code (e.g. SPM Kertas 2 / UASA), steps with [K1/N1/P1] marks, SI units, KBAT justification, and examiner tips.
`;

      const parsed = await generateJson({
        system: CIKGU_SYSTEM_PROMPT,
        prompt: offlinePrompt,
        image: chatImage,
        shape: `{
  "privateSolution": "string - FIRST quote the given equations exactly as in the question, then solve the problem fully and verify the answer. Never shown to the student.",
  "topicTag": { "subject": "string", "level": "string", "unit": "string", "title": "string" },
  "warmAcknowledgment": "string",
  "kehendakSoalan": "string",
  "hint1": { "title": "string", "concept": "string", "coreFormula": "string", "guide": "string" },
  "hint2": {
    "title": "string",
    "intermediateSteps": ["string"],
    "scaffoldingNotes": "string",
    "commonMistakes": "string"
  },
  "finalSolution": {
    "markingSchemeCode": "string",
    "steps": [
      { "stepNumber": 1, "stepDescription": "string", "workingMath": "string", "marksScheme": "string e.g. K1, N1, P1" }
    ],
    "finalAnswer": "string",
    "siUnit": "string",
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

    const conversationPrompt = `
MODE: ONLINE MODE (Full Interactive Socratic Scaffolding)
KPM CURRICULUM LEVEL: ${educationLevel}
SUBJECT: ${subject}
LANGUAGE PREFERENCE: ${language}
USER REQUESTED DIRECT FINAL SOLUTION / PHASE 3: ${requestDirectPhase3 ? 'YES - TRANSITION IMMEDIATELY TO PHASE 3' : 'NO - PROCEED WITH PHASE 1 OR 2'}
USER SCRATCHPAD ATTEMPT: ${userAttempt || 'None'}
${image ? 'NOTE: An image of the question / diagram is attached above. Analyze any geometry, diagrams, numbers, or graphs from the image.' : ''}

CONVERSATION HISTORY:
${messages
  .map((m: any) => `[${m.role.toUpperCase()}]: ${m.content}`)
  .join('\n\n')}

INSTRUCTIONS:
- Current Target Phase: ${requestDirectPhase3 ? '3' : targetPhase}.
- If Phase 1: Acknowledge warmly, identify Kehendak Soalan and give HINT 1. NEVER give the final answer or numeric solution in Phase 1.
- If Phase 2: Validate student working, provide HINT 2 or 3, include KBAT prompt ("Mengapa / Bagaimana"). Do not reveal final answer yet.
- If Phase 3: Confirm correctness and render official KSSR / KSSM / SPM marking scheme (with [K1/N1/P1] marks, SI units, and examiner tips).
`;

    const parsed = await generateJson({
      system: CIKGU_SYSTEM_PROMPT,
      prompt: conversationPrompt,
      image: chatImage,
      shape: `{
  "privateSolution": "string - FIRST quote the given equations exactly as in the student's question, then solve the problem fully and verify the answer. Never shown to the student; all hints must stay consistent with it.",
  "phase": 1,
  "phaseTitle": "string",
  "curriculumBadge": "string",
  "subjectBadge": "string",
  "topicUnit": "string",
  "encouragement": "string",
  "kehendakSoalan": "string",
  "explanation": "string",
  "hint": { "hintNumber": 1, "hintTitle": "string", "hintBody": "string" },
  "formulaTemplate": "string (optional)",
  "kbatPrompt": "string (optional)",
  "nextActionPrompt": "string",
  "suggestedQuickReplies": ["string"],
  "officialSkema": {
    "markingCode": "string",
    "steps": [
      { "stepNumber": 1, "stepDescription": "string", "workingMath": "string", "marksScheme": "string e.g. K1, N1, P1" }
    ],
    "finalAnswerUnit": "string",
    "kbatSummary": "string",
    "tipsPemeriksa": "string"
  }
}
"phase" must be the integer 1, 2 or 3 (1 = Inquiry/Hint 1, 2 = Guided Hinting/KBAT, 3 = Official Full Marking Scheme). "hintNumber" is an integer. Include "officialSkema" ONLY in Phase 3; omit it in Phase 1 and 2.`,
    });
    parsed.mode = 'online';
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error generating Cikgu AI response:', error);
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
    console.log(`Cikgu AI Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
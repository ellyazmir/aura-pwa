# Aura Tutor

## Deployment
Deployment Link : [Live Demo](https://aura-pwa-1lus.onrender.com)
## About
A Malaysian KPM study helper for KSSR and KSSM students. Instead of handing over the answer, Aura Tutor guides you step by step, the way a patient teacher (cikgu) would, following the KSSR, UASA and SPM marking formats.

It is a Progressive Web App built with React, TypeScript and Vite, with a small Express server that talks to the AI providers. When there is no internet, a small AI model runs inside your browser so the app still works offline.

## What it does

- **3-phase Socratic guidance (online).** Every question moves through three phases:
  1. **Petunjuk** — identifies what the question asks and gives the first hint. It never reveals the final answer.
  2. **Semakan & KBAT** — checks your attempt, gives the next hint, and asks a higher-order thinking (KBAT) question.
  3. **Skema Penuh** — the full official marking scheme with K1 / N1 / P1 marks, SI units and examiner tips.
- **One-sentence hints with options.** Each hint is short and comes with three choices (A, B, C) for the next step. One is correct and two are common mistakes. Pick one and the tutor tells you gently whether it was right.
- **All subjects.** Mathematics, Additional Mathematics, Science, Physics, Chemistry, Biology, History, Geography, Bahasa Melayu, English and more. It adapts the answer style to the subject (calculation steps, science explanations, or humanities facts and elaboration).
- **Answers in your language.** Ask in English and it replies in English; ask in Bahasa Melayu and it replies in Malay. It detects this from your question.
- **Photo scanner.** Snap or upload a photo of a question from a textbook or worksheet. The app reads the text, detects the subject and level, and fills it in for you. (Scanning needs internet.)
- **Offline mode.** With no internet, a small on-device model (Qwen3-0.6B) answers in the same layout. Simple equations are solved exactly by the app itself, without the model.
- **Chat history.** Every question and answer is saved on your device so you can reopen past sessions. Nothing is sent to a server.
- **Question bank.** A set of sample SPM, UASA and KSSR questions, each with a Bahasa Melayu and an English version.
- **Scratchpad, formula reference, blue/purple theme, and installable as a PWA.**

## How to use the chatbot

1. **Ask a question.** Type it in the box at the bottom and press **Tanya Cikgu** (or Enter). You can also:
   - Tap **Imbas** to take or upload a photo of the question.
   - Tap **Bank Soalan** to pick a ready-made sample question (BM or English).
2. **Read the first hint.** Aura Tutor shows what the question is asking and gives one hint. It will not give the answer yet.
3. **Pick an option or reply.** Choose one of the A / B / C next-step options, or type your own working. The tutor checks it and gives the next hint.
4. **See the full solution.** When you are ready, tap **Tunjuk skema penuh** for the complete step-by-step marking scheme.
5. **Use the tools** at the bottom:
   - **Buku Latihan** — a scratchpad to write your working and submit it as an attempt.
   - **Rumus & KBAT** — a reference of KPM formulas and KBAT task words.
6. **Review past chats.** Tap **Riwayat** in the header (or the "Sembang terdahulu" list on the start screen) to reopen, delete, or clear saved chats. **Sesi Baharu** starts a fresh chat.

### Online vs offline

The header badge shows the current mode, based on your internet connection:

- **Online** — answers come from the cloud AI (best quality).
- **Luar Talian · Dalam Peranti** — no internet, so answers come from the small model on your device. These may be less accurate; check with your teacher or textbook.

## Using the offline model

Aura Tutor can keep working with no internet by running a small AI model (Qwen3-0.6B) directly in your browser. Here is how to set it up and use it.

### 1. Download the model once (while online)

1. Open the app with a working internet connection.
2. In the bottom toolbar, tap **Muat turun model luar talian**.
3. Wait for the download. The button shows the progress (**Memuat turun 42%**). The file is about 610 MB, so use Wi-Fi and give it a minute or two.
4. When it finishes, the toolbar shows **Model luar talian sedia** (offline model ready). You only do this once; the model is kept in your browser's storage.

The download button only appears when you are online and the model is not already saved. If it is missing, the model is either still downloading or already downloaded.

### 2. Use it offline

- When your device loses internet, the header badge switches to **Luar Talian · Dalam Peranti** on its own.
- Just type your question and press **Tanya Cikgu**, the same as online. The answer is generated on your device, in the same 3-phase layout with hints, options and a full scheme.
- Every offline answer carries a small note reminding you it was made by the on-device model and may be less accurate.

### What works offline and what does not

| Feature | Offline |
|---|---|
| Typing a question and getting hints / full solution | Yes |
| Simple linear equations (e.g. `a - 5 = 9`, `3a + 5 = 8`) | Yes — solved exactly by the app, no model needed |
| Question bank (sample questions) | Yes |
| Answer in English or Bahasa Melayu (detected from your question) | Yes |
| Chat history | Yes (saved on your device) |
| Photo scanner / OCR | No — needs internet |
| Downloading the model | No — do this while online |

### Good to know

- **One device, one browser.** The model is stored per browser. If you clear the site's browsing data, you will need to download it again.
- **Speed.** A small model on a CPU is slower than the cloud, so give offline answers a little time, especially the full solution.
- **Accuracy.** The offline model is much smaller than the cloud AI. Use its answers as study help and verify important ones with your teacher or textbook.
- **No download prompt twice.** The app checks the browser cache on startup, so once the model is saved it never asks you to download it again, even if the saved status was lost.

## Running it locally

**Prerequisites:** Node.js 22 or newer.

1. Install dependencies:
   ```bash
   npm install
   npm install --save-dev cross-env
   ```
   (`cross-env` is used by the `start` script but is not yet in `package.json`.)

2. Create a `.env` file in the project root with at least one AI provider key:
   ```
   GEMINI_API_KEY=your-gemini-key
   GROQ_API_KEY=your-groq-key
   ```
   Get a Gemini key at https://ai.google.dev or a Groq key at https://console.groq.com. The app tries Gemini first, then Groq. Optional overrides: `GEMINI_CHAT_MODEL`, `GEMINI_VISION_MODEL`, `GROQ_CHAT_MODEL`, `GROQ_VISION_MODEL`, and `PORT` (default 3000).

3. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Express + Vite), with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm start` | Serve the production build (needs `cross-env`) |
| `npm run lint` | TypeScript type check |
| `node list-models.mjs` | List the model IDs available on your Groq account |

## How it works

- **Frontend:** React + TypeScript, Vite, Tailwind CSS v4, bundled as a PWA (`vite-plugin-pwa`).
- **Server (`server.ts`):** an Express app that serves the site and exposes two endpoints:
  - `POST /api/cikgu/chat` — the Socratic chat.
  - `POST /api/cikgu/scan-image` — OCR for a question photo.
  It keeps your API keys on the server and never sends them to the browser. It also sets cross-origin isolation headers so the offline model can run multi-threaded.
- **Offline model (`src/lib/offlineFallback.ts`):** runs Qwen3-0.6B in the browser with WebAssembly (via `@wllama/wllama`). It asks the model for a small JSON object, which keeps answers consistent, and solves simple linear equations exactly without the model.
- **Chat history (`src/lib/chatHistory.ts`):** stored in the browser's IndexedDB, on your device only.

## Project structure

```
server.ts                  Express API + Vite middleware + AI routing + offline model download
vite.config.ts             Vite, React, Tailwind, PWA config
index.html                 App shell
public/wllama/             WebAssembly file for the on-device model
src/
  main.tsx, App.tsx        App entry and main screen
  components/              Header, ChatMessage, PhaseTracker, Scratchpad, modals, ChatHistoryPanel
  lib/                     offlineFallback, chatHistory, language detection, i18n, theme
  data/kpmData.ts          Sample questions, subjects, formulas, KBAT keywords
  types/cikgu.ts           Shared TypeScript types
```

## Notes and limitations

- The on-device model is small, so its offline answers are weaker than the online ones. Treat them as a study aid, not a final answer.
- Photo scanning and the first model download both need internet.
- Chat history and the downloaded model live in one browser on one device. Clearing the site's browser data removes them.
- Full WCAG accessibility is not verified; that needs manual testing with assistive technologies.

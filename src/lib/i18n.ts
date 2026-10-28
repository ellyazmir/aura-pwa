import type { ReplyLanguage } from './language';

/** Fixed texts around Aura Tutor's answers. They follow the language of the conversation. */
const BM = {
  // loading + errors
  thinking: 'Aura Tutor sedang meneliti soalan anda...',
  thinkingOffline: 'Model dalam peranti sedang berfikir, ini mungkin mengambil masa',
  error: (detail: string) =>
    `Maaf adik, Cikgu menghadapi masalah teknikal: ${detail}. Sila cuba hantar semula soalan anda sebentar lagi.`,
  // label added in front of a picked hint option (the server recognises it)
  myChoice: 'Pilihan saya',
  // voice
  voiceUnsupported: 'Pelayar web anda tidak menyokong fungsi suara.',
  listen: 'Dengar Suara Aura Tutor',
  // online (Socratic) answer
  phase: 'Fasa',
  question: 'Kehendak soalan',
  formula: 'Rumus',
  copyToPad: 'Salin ke Buku Latihan',
  copied: 'Disalin',
  markScheme: 'Skema Markah',
  colNo: 'No.',
  colStep: 'Langkah',
  colMarks: 'Markah',
  finalAnswer: 'Jawapan akhir',
  examinerTip: 'Tip pemeriksa: ',
  showFullScheme: 'Tunjuk skema penuh',
  // offline Study Pack
  packTitle: 'Pakej Pembelajaran Luar Talian (Study Pack)',
  print: 'Cetak / PDF',
  printTitle: 'Cetak atau Simpan PDF',
  targetInquiry: 'Kehendak Soalan (Target Inquiry)',
  conceptFormula: 'Konsep & Rumus Asas',
  studentGuide: 'Panduan Pelajar',
  stepsGuide: 'Langkah Kerja & Bimbingan',
  hideGuide: 'Sorok Bimbingan',
  openGuide: 'Buka Bimbingan',
  stepN: (n: number) => `Langkah ${n}:`,
  commonMistakes: 'Kesilapan Lazim Murid:',
  officialScheme: 'Skema Jawapan Rasmi',
  schemeFormat: 'Mengikut format penandaan Lembaga Peperiksaan Malaysia',
  closeScheme: 'Tutup Skema',
  openScheme: 'Buka Skema Penuh',
  colWorking: 'Langkah Kerja & Formulasi',
  finalAnswerUnit: 'Jawapan Akhir & Unit SI:',
  kbatJustification: 'Justifikasi KBAT:',
  examinerTips: 'Tips Pemeriksa KPM:',
};

const EN: typeof BM = {
  thinking: 'Aura Tutor is looking at your question...',
  thinkingOffline: 'The on-device model is thinking, this may take a while',
  error: (detail: string) =>
    `Sorry, Cikgu ran into a technical problem: ${detail}. Please try sending your question again in a moment.`,
  myChoice: 'My choice',
  voiceUnsupported: 'Your browser does not support voice.',
  listen: 'Listen to Aura Tutor',
  phase: 'Phase',
  question: 'What the question asks',
  formula: 'Formula',
  copyToPad: 'Copy to Scratchpad',
  copied: 'Copied',
  markScheme: 'Marking Scheme',
  colNo: 'No.',
  colStep: 'Step',
  colMarks: 'Marks',
  finalAnswer: 'Final answer',
  examinerTip: "Examiner's tip: ",
  showFullScheme: 'Show full marking scheme',
  packTitle: 'Offline Study Pack',
  print: 'Print / PDF',
  printTitle: 'Print or save as PDF',
  targetInquiry: 'What the Question Asks',
  conceptFormula: 'Concept & Core Formula',
  studentGuide: 'Student Guide',
  stepsGuide: 'Working Steps & Guidance',
  hideGuide: 'Hide Guidance',
  openGuide: 'Open Guidance',
  stepN: (n: number) => `Step ${n}:`,
  commonMistakes: 'Common Student Mistakes:',
  officialScheme: 'Official Marking Scheme',
  schemeFormat: 'Following the Malaysian Examinations Board marking format',
  closeScheme: 'Close Scheme',
  openScheme: 'Open Full Scheme',
  colWorking: 'Working & Formulation',
  finalAnswerUnit: 'Final Answer & SI Unit:',
  kbatJustification: 'HOTS (KBAT) Justification:',
  examinerTips: 'KPM Examiner Tips:',
};

export type Strings = typeof BM;

export function getStrings(lang: ReplyLanguage | undefined): Strings {
  return lang === 'en' ? EN : BM;
}

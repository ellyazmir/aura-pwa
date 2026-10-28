export type OperationalMode = 'online' | 'offline';

export type CurriculumLevel = 'kssr' | 'kssm_lower' | 'kssm_upper' | 'auto';

export type LanguageMode = 'bm' | 'en' | 'bilingual';

export interface HintData {
  hintNumber: number;
  hintTitle: string;
  hintBody: string;
}

export interface MarkingStep {
  stepNumber: number;
  stepDescription: string;
  workingMath: string;
  marksScheme: string; // e.g. [1m - K1 (Kaedah)]
}

export interface OfficialSkema {
  markingCode: string;
  steps: MarkingStep[];
  finalAnswerUnit?: string;
  kbatSummary?: string;
  tipsPemeriksa?: string;
}

// Online mode response (Socratic turn)
export interface CikguAIResponse {
  mode: 'online';
  phase: 1 | 2 | 3;
  phaseTitle: string;
  curriculumBadge: string;
  subjectBadge: string;
  topicUnit?: string;
  encouragement: string;
  kehendakSoalan: string;
  explanation: string;
  hint: HintData;
  /** 2-3 short choices for the student's next step (Phase 1 and 2 only). */
  hintOptions?: string[];
  formulaTemplate?: string;
  kbatPrompt?: string;
  nextActionPrompt: string;
  suggestedQuickReplies: string[];
  officialSkema?: OfficialSkema;
}

// Offline mode response (Self-contained Study Pack)
export interface OfflineStudyPack {
  mode: 'offline';
  topicTag: {
    subject: string;
    level: string; // e.g. KSSM Tingkatan 4, KSSR Tahun 6
    unit: string; // e.g. Bab 2: Daya dan Gerakan
    title: string;
  };
  warmAcknowledgment: string;
  kehendakSoalan: string;
  hint1: {
    title: string;
    concept: string;
    coreFormula: string;
    guide: string;
  };
  hint2: {
    title: string;
    intermediateSteps: string[];
    scaffoldingNotes: string;
    commonMistakes: string;
  };
  finalSolution: {
    markingSchemeCode: string;
    steps: MarkingStep[];
    finalAnswer: string;
    siUnit?: string;
    kbatJustification?: string;
    examinerTips: string;
  };
  suggestedQuickReplies?: string[];
}

export type CikguResult = CikguAIResponse | OfflineStudyPack;

export interface AttachedImage {
  data: string; // raw base64 data
  mimeType: string;
  previewUrl: string; // data:image/png;base64,...
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: AttachedImage;
  cikguData?: CikguResult;
  /** Language the answer was written in (drives the fixed labels around it). */
  language?: 'bm' | 'en';
  phaseAtTime?: number;
  modeAtTime?: OperationalMode;
}

export interface SampleQuestion {
  id: string;
  level: 'kssr' | 'kssm_lower' | 'kssm_upper';
  levelName: string;
  subject: string;
  topic: string; // Bahasa Melayu
  topicEn: string; // English
  question: string; // Bahasa Melayu
  questionEn: string; // English
  difficulty: 'Asas' | 'Sederhana' | 'KBAT Tinggi';
}

export interface ScannedQuestionResult {
  extractedText: string;
  detectedSubject: string;
  detectedLevel: string;
  summary: string;
}

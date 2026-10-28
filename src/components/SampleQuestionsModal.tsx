import React, { useState } from 'react';
import { X, BookOpen, ChevronRight } from 'lucide-react';
import { SAMPLE_QUESTIONS } from '../data/kpmData';
import { SampleQuestion } from '../types/cikgu';

interface SampleQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `text` is the question in the language the student picked (BM or English). */
  onSelectQuestion: (question: SampleQuestion, text: string) => void;
}

type LevelFilter = 'kssm_upper' | 'kssm_lower' | 'kssr';

const LEVELS: { id: LevelFilter; label: string }[] = [
  { id: 'kssm_upper', label: '🎓 SPM (Tingkatan 4–5)' },
  { id: 'kssm_lower', label: '📘 UASA Menengah Rendah (T1–T3)' },
  { id: 'kssr', label: '🎒 KSSR Rendah (Tahun 1–6)' },
];

export const SampleQuestionsModal: React.FC<SampleQuestionsModalProps> = ({
  isOpen,
  onClose,
  onSelectQuestion,
}) => {
  const [filterLevel, setFilterLevel] = useState<LevelFilter>('kssm_upper');

  if (!isOpen) return null;

  const filtered = SAMPLE_QUESTIONS.filter((q) => q.level === filterLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Bank Contoh Soalan KPM (SPM & UASA)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih versi BM atau English untuk memulakan bimbingan Aura Tutor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Filters */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5 bg-slate-50/50 dark:bg-slate-900/50">
          {LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => setFilterLevel(level.id)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                filterLevel === level.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>

        {/* List of Questions: each one in BM and English */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700/60">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {item.subject}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.difficulty === 'KBAT Tinggi'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300'
                      : item.difficulty === 'Sederhana'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  }`}
                >
                  {item.difficulty}
                </span>
              </div>

              {(
                [
                  ['BM', item.topic, item.question],
                  ['EN', item.topicEn, item.questionEn],
                ] as const
              ).map(([lang, topic, text]) => (
                <button
                  key={lang}
                  onClick={() => onSelectQuestion(item, text)}
                  className="w-full text-left flex items-start gap-3 px-3.5 py-3 hover:bg-blue-50/60 dark:hover:bg-slate-700/50 border-b last:border-b-0 border-slate-100 dark:border-slate-700/60 transition-colors group"
                >
                  <span className="flex-shrink-0 mt-0.5 w-7 text-center text-[10px] font-black px-1 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                    {lang}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                      {topic}
                    </span>
                    <span className="block text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                      {text}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 mt-1 text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

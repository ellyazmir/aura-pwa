import React, { useState } from 'react';
import { X, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
import { SAMPLE_QUESTIONS } from '../data/kpmData';
import { SampleQuestion } from '../types/cikgu';

interface SampleQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuestion: (question: SampleQuestion) => void;
}

export const SampleQuestionsModal: React.FC<SampleQuestionsModalProps> = ({
  isOpen,
  onClose,
  onSelectQuestion,
}) => {
  const [filterLevel, setFilterLevel] = useState<'all' | 'kssr' | 'kssm_lower' | 'kssm_upper'>('all');

  if (!isOpen) return null;

  const filtered = filterLevel === 'all'
    ? SAMPLE_QUESTIONS
    : SAMPLE_QUESTIONS.filter((q) => q.level === filterLevel);

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
                Pilih soalan untuk memulakan bimbingan Sokratik Cikgu AI
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
          <button
            onClick={() => setFilterLevel('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filterLevel === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Semua Peringkat
          </button>
          <button
            onClick={() => setFilterLevel('kssm_upper')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filterLevel === 'kssm_upper'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            🎓 SPM (Tingkatan 4–5)
          </button>
          <button
            onClick={() => setFilterLevel('kssm_lower')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filterLevel === 'kssm_lower'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            📘 UASA Menengah Rendah (T1–T3)
          </button>
          <button
            onClick={() => setFilterLevel('kssr')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filterLevel === 'kssr'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            🎒 KSSR Rendah (Tahun 1–6)
          </button>
        </div>

        {/* List of Questions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectQuestion(item)}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 bg-white dark:bg-slate-800/60 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                    {item.levelName}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {item.subject}
                  </span>
                </div>
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

              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                Topik: {item.topic}
              </div>

              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                {item.question}
              </p>

              <div className="mt-2.5 flex items-center justify-end text-xs font-bold text-blue-600 dark:text-blue-400 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Pilih soalan ini & mula bimbingan</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

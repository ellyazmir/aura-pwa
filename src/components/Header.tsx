import React from 'react';
import {
  GraduationCap,
  Sparkles,
  Wifi,
  WifiOff,
  BookOpen,
  Calculator,
  HelpCircle,
  FileSpreadsheet,
  Camera,
} from 'lucide-react';
import { CurriculumLevel, LanguageMode, OperationalMode } from '../types/cikgu';
import { KPM_SUBJECTS } from '../data/kpmData';

interface HeaderProps {
  mode: OperationalMode;
  onModeChange: (mode: OperationalMode) => void;
  curriculumLevel: CurriculumLevel;
  onCurriculumChange: (level: CurriculumLevel) => void;
  selectedSubject: string;
  onSubjectChange: (sub: string) => void;
  language: LanguageMode;
  onLanguageChange: (lang: LanguageMode) => void;
  onOpenSampleQuestions: () => void;
  onOpenKpmReference: () => void;
  onOpenImageScanner: () => void;
  scratchpadOpen: boolean;
  onToggleScratchpad: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onModeChange,
  curriculumLevel,
  onCurriculumChange,
  selectedSubject,
  onSubjectChange,
  language,
  onLanguageChange,
  onOpenSampleQuestions,
  onOpenKpmReference,
  onOpenImageScanner,
  scratchpadOpen,
  onToggleScratchpad,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
      {/* Top Malaysian Identity Stripe */}
      <div className="h-1.5 w-full bg-linear-to-r from-blue-700 via-red-600 via-amber-400 to-yellow-500"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          
          {/* Logo & Persona Title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-blue-700 to-indigo-800 text-white flex items-center justify-center shadow-md ring-2 ring-blue-500/20">
                  <GraduationCap className="w-5 h-5 text-yellow-300" />
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-slate-900 ring-2 ring-white dark:ring-slate-900">
                  MY
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                    Cikgu AI
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                      KPM
                    </span>
                  </h1>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Bimbingan Sokratik KSSR & KSSM (UASA & SPM)
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1.5 lg:hidden">
              <button
                onClick={onToggleScratchpad}
                className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1 ${
                  scratchpadOpen
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
                title="Buku Latihan Digital"
              >
                <Calculator className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Operational Mode Toggle + Curriculum Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Mode Switcher: Online vs Offline */}
            <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex items-center border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => onModeChange('online')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mode === 'online'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span>Mod Online (Sokratik)</span>
              </button>
              <button
                onClick={() => onModeChange('offline')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mode === 'offline'
                    ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Mod Luar Talian (Study Pack)</span>
              </button>
            </div>

            {/* Curriculum Level */}
            <select
              value={curriculumLevel}
              onChange={(e) => onCurriculumChange(e.target.value as CurriculumLevel)}
              aria-label="Peringkat Kurikulum"
              className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="auto">🎯 Auto-Kesan Tahap</option>
              <option value="kssm_upper">🎓 KSSM SPM (Tingkatan 4–5)</option>
              <option value="kssm_lower">📘 KSSM Menengah Rendah (T1–T3 UASA)</option>
              <option value="kssr">🎒 KSSR Rendah (Tahun 1–6 UASA)</option>
            </select>

            {/* Subject */}
            <select
              value={selectedSubject}
              onChange={(e) => onSubjectChange(e.target.value)}
              aria-label="Pilih Subjek"
              className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden max-w-[150px] truncate"
            >
              <option value="Umum">📚 Semua Subjek</option>
              {KPM_SUBJECTS.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>

            {/* Language */}
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as LanguageMode)}
              aria-label="Bahasa Penghantaran"
              className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            >
              <option value="bm">🇲🇾 BM</option>
              <option value="en">🇬🇧 English</option>
              <option value="bilingual">🌐 DLP (Bilingual)</option>
            </select>

            {/* Action Tools */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenImageScanner}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900 hover:bg-indigo-100 transition-colors"
                title="Imbas atau Muat Naik Foto Soalan"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Imbas Soalan</span>
              </button>

              <button
                onClick={onOpenSampleQuestions}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition-colors"
                title="Pilih soalan contoh SPM & UASA"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bank Soalan</span>
              </button>

              <button
                onClick={onOpenKpmReference}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 hover:bg-amber-100 transition-colors"
                title="Rumus Rasmi & Kata Tugas KBAT"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rumus & KBAT</span>
              </button>

              <button
                onClick={onToggleScratchpad}
                className={`hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  scratchpadOpen
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Buku Latihan</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};

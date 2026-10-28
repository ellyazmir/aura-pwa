import React from 'react';
import { GraduationCap, BookOpen } from 'lucide-react';
import { OperationalMode } from '../types/cikgu';

interface HeaderProps {
  mode: OperationalMode;
  onOpenSampleQuestions: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onOpenSampleQuestions,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Cikgu AI</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">KSSR &amp; KSSM</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Current mode (follows the internet connection, not a setting) */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                mode === 'online'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              }`}
              title={
                mode === 'online'
                  ? 'Ada internet: bimbingan Sokratik 3 fasa'
                  : 'Tiada internet: Study Pack dijana dalam peranti'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  mode === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{mode === 'online' ? 'Online · Sokratik' : 'Luar Talian · Study Pack'}</span>
            </div>

            <button
              onClick={onOpenSampleQuestions}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              title="Pilih soalan contoh SPM & UASA"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bank Soalan</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

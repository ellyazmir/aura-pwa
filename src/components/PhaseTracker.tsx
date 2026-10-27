import React from 'react';
import { Sparkles, HelpCircle, Lightbulb, Award, CheckCircle2 } from 'lucide-react';

interface PhaseTrackerProps {
  currentPhase: number;
  onPhaseSelect?: (phase: number) => void;
}

export const PhaseTracker: React.FC<PhaseTrackerProps> = ({ currentPhase }) => {
  const phases = [
    {
      num: 1,
      title: 'Fasa 1: Penghayatan & Bimbingan',
      shortTitle: 'Fasa 1: Mula & Petunjuk 1',
      subtitle: 'Memahami kehendak soalan & rumus asas',
      rule: 'Tiada jawapan terus diberikan',
      icon: HelpCircle,
      activeColor: 'from-blue-600 to-indigo-600',
      borderColor: 'border-blue-500',
      badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    },
    {
      num: 2,
      title: 'Fasa 2: Petunjuk Berperingkat & KBAT',
      shortTitle: 'Fasa 2: Langkah & KBAT',
      subtitle: 'Semakan langkah, petunjuk 2/3 & soalan KBAT',
      rule: 'Fokus kaedah & pemikiran kritis',
      icon: Lightbulb,
      activeColor: 'from-amber-500 to-orange-600',
      borderColor: 'border-amber-500',
      badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    },
    {
      num: 3,
      title: 'Fasa 3: Skema Markah Rasmi KPM',
      shortTitle: 'Fasa 3: Skema Penuh KPM',
      subtitle: 'Skema SPM (K1/N1/P1) & UASA, Unit SI & Tips',
      rule: 'Format lengkap peperiksaan KPM',
      icon: Award,
      activeColor: 'from-emerald-600 to-teal-700',
      borderColor: 'border-emerald-500',
      badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    },
  ];

  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 shadow-xs">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              Kaedah Sokratik 3-Fasa Cikgu AI
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Format Peperiksaan KSSR & KSSM Lembaga Peperiksaan Malaysia</span>
          </div>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {phases.map((phase) => {
            const isCurrent = currentPhase === phase.num;
            const isCompleted = currentPhase > phase.num;
            const Icon = isCompleted ? CheckCircle2 : phase.icon;

            return (
              <div
                key={phase.num}
                className={`relative rounded-xl p-3 transition-all duration-300 border ${
                  isCurrent
                    ? `${phase.borderColor} bg-slate-50 dark:bg-slate-800/80 shadow-sm ring-1 ${phase.borderColor}`
                    : isCompleted
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 text-slate-700 dark:text-slate-300'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isCurrent
                        ? `bg-linear-to-br ${phase.activeColor} text-white shadow-sm`
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className={`text-xs font-bold truncate ${
                          isCurrent
                            ? 'text-slate-900 dark:text-white'
                            : isCompleted
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {phase.shortTitle}
                      </h4>
                      {isCurrent && (
                        <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                      {phase.subtitle}
                    </p>
                    <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600"></span>
                      <span>{phase.rule}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

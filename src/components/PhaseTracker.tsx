import React from 'react';
import { Check } from 'lucide-react';

interface PhaseTrackerProps {
  currentPhase: number;
  onPhaseSelect?: (phase: number) => void;
}

const PHASES = [
  { num: 1, label: 'Petunjuk' },
  { num: 2, label: 'Semakan & KBAT' },
  { num: 3, label: 'Skema Penuh' },
];

export const PhaseTracker: React.FC<PhaseTrackerProps> = ({ currentPhase }) => {
  return (
    <div className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2">
      <ol className="max-w-5xl mx-auto flex items-center gap-2 text-xs">
        {PHASES.map((phase, idx) => {
          const isCurrent = currentPhase === phase.num;
          const isDone = currentPhase > phase.num;
          return (
            <React.Fragment key={phase.num}>
              <li className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3" /> : phase.num}
                </span>
                <span
                  className={`font-medium ${
                    isCurrent
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {phase.label}
                </span>
              </li>
              {idx < PHASES.length - 1 && (
                <span className="flex-1 max-w-12 h-px bg-slate-200 dark:bg-slate-700" />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
};

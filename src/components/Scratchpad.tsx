import React, { useState } from 'react';
import {
  Calculator,
  Eraser,
  Send,
  X,
  FileText,
  Lightbulb,
} from 'lucide-react';

interface ScratchpadProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitStep: (stepText: string) => void;
  initialText?: string;
}

export const Scratchpad: React.FC<ScratchpadProps> = ({
  isOpen,
  onClose,
  onSubmitStep,
  initialText = '',
}) => {
  const [scratchContent, setScratchContent] = useState(initialText);

  // Sync if initialText changes from formula copy
  React.useEffect(() => {
    if (initialText) {
      setScratchContent((prev) => (prev ? `${prev}\n${initialText}` : initialText));
    }
  }, [initialText]);

  const mathSymbols = [
    '²',
    '³',
    '√',
    'π',
    '±',
    'θ',
    '∑',
    '∆',
    '°',
    '≈',
    '≤',
    '≥',
    '÷',
    '×',
    'b² - 4ac',
    'dy/dx',
    'F = ma',
  ];

  const handleInsertSymbol = (sym: string) => {
    setScratchContent((prev) => `${prev} ${sym} `);
  };

  const handleSubmit = () => {
    if (!scratchContent.trim()) return;
    onSubmitStep(`Saya mencuba jalan kerja berikut:\n${scratchContent.trim()}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform duration-300">
      
      {/* Scratchpad Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
              Buku Latihan Digital
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Uji langkah kerja sebelum semakan
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Tutup Buku Latihan"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Math Symbols Quick Inserter */}
      <div className="p-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 px-1">
          Simbol Matematik & Rumus Pantas:
        </div>
        <div className="flex flex-wrap gap-1">
          {mathSymbols.map((sym, i) => (
            <button
              key={i}
              onClick={() => handleInsertSymbol(sym)}
              className="px-2 py-1 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-mono font-semibold border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition-colors shadow-2xs"
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Text Area */}
      <div className="flex-1 p-3 flex flex-col">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 px-0.5">
          <span className="flex items-center gap-1 font-medium">
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            Catatan Langkah & Formula
          </span>
          {scratchContent && (
            <button
              onClick={() => setScratchContent('')}
              className="text-[11px] font-bold text-red-500 hover:underline flex items-center gap-0.5"
            >
              <Eraser className="w-3 h-3" />
              Padam
            </button>
          )}
        </div>
        <textarea
          value={scratchContent}
          onChange={(e) => setScratchContent(e.target.value)}
          placeholder={`Tulis langkah kerja anda di sini...\nContoh:\nLangkah 1: Diberi a = 2, b = -4, c = k\nLangkah 2: Guna rumus b² - 4ac > 0\n(-4)² - 4(2)(k) > 0\n16 - 8k > 0`}
          className="w-full flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
        />
      </div>

      {/* Footer Submission */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span>Cikgu AI akan menyemak tanpa terus mendedahkan jawapan akhir.</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!scratchContent.trim()}
          className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          <Send className="w-4 h-4" />
          <span>Hantar Langkah ke Cikgu AI (Semakan Fasa 2)</span>
        </button>
      </div>

    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  BrainCircuit,
  BookOpen,
  Copy,
  Check,
  Award,
} from 'lucide-react';
import { KPM_FORMULAS, KPM_KBAT_KEYWORDS } from '../data/kpmData';

interface KpmReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopyToScratchpad: (formula: string) => void;
}

export const KpmReferenceModal: React.FC<KpmReferenceModalProps> = ({
  isOpen,
  onClose,
  onCopyToScratchpad,
}) => {
  const [activeTab, setActiveTab] = useState<'formulas' | 'kbat' | 'marking'>('formulas');
  const [copiedFormula, setCopiedFormula] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (formula: string) => {
    navigator.clipboard.writeText(formula);
    onCopyToScratchpad(formula);
    setCopiedFormula(formula);
    setTimeout(() => setCopiedFormula(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Rujukan Rasmi KPM & Panduan KBAT
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Piawaian Lembaga Peperiksaan Malaysia (KSSR & KSSM)
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('formulas')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'formulas'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Senarai Rumus SPM</span>
          </button>
          <button
            onClick={() => setActiveTab('kbat')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'kbat'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>Kata Tugas KBAT</span>
          </button>
          <button
            onClick={() => setActiveTab('marking')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'marking'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Kod Skema Markah (K1, N1, P1)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TAB 1: FORMULAS */}
          {activeTab === 'formulas' && (
            <div className="space-y-4">
              {KPM_FORMULAS.map((group, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 font-extrabold text-xs text-slate-800 dark:text-slate-200">
                    {group.subject}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                    {group.items.map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg transition-colors gap-2"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {item.name}
                          </div>
                          <div className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                            {item.formula}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(item.formula)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          title="Salin Rumus"
                        >
                          {copiedFormula === item.formula ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: KBAT KEYWORDS */}
          {activeTab === 'kbat' && (
            <div className="space-y-3">
              <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-200 dark:border-purple-900/50 text-xs text-purple-900 dark:text-purple-200">
                <span className="font-bold">Panduan Calon SPM & UASA:</span> Kata tugas dalam soalan menentukan cara pemberian markah. Kenal pasti kata kunci sebelum menulis jawapan.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {KPM_KBAT_KEYWORDS.map((kbat, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {kbat.kataTugas}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200">
                        {kbat.aras}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {kbat.makna}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MARKING CODES */}
          {activeTab === 'marking' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-900 dark:text-emerald-200">
                <span className="font-bold">Sistem Penandaan Rasmi Lembaga Peperiksaan Malaysia (LPM):</span>
              </div>
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      K1 / K2 (Kaedah / Method)
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Markah Langkah Kerja</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Diberikan apabila murid menggunakan rumus yang betul, penggantian nilai yang tepat ke dalam formula, atau manipulasi algebra yang sah.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      N1 (Nilai / Answer)
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Markah Jawapan Akhir</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Diberikan untuk nilai angka yang betul berserta Unit SI yang sah (contoh: m/s², kg, cm³). Nilai tanpa unit atau unit salah boleh menyebabkan markah N1 ditolak.
                  </p>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      P1 (Pengetahuan / Knowledge)
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Markah Fakta / Teori</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Diberikan untuk definisi saintifik, hukum fizik/kimia, atau konsep yang dinyatakan dengan istilah tepat buku teks KPM.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Tutup Rujukan
          </button>
        </div>

      </div>
    </div>
  );
};

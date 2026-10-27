import React, { useState } from 'react';
import {
  GraduationCap,
  Sparkles,
  HelpCircle,
  Lightbulb,
  Award,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Printer,
  FileCheck2,
  BookOpenCheck,
  BrainCircuit,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { Message, CikguAIResponse, OfflineStudyPack } from '../types/cikgu';

interface ChatMessageProps {
  message: Message;
  onSelectQuickReply: (reply: string) => void;
  onRequestFullSolution: () => void;
  onCopyToScratchpad: (text: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onSelectQuickReply,
  onRequestFullSolution,
  onCopyToScratchpad,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copiedFormula, setCopiedFormula] = useState(false);
  const [showHint2, setShowHint2] = useState(false);
  const [showOfflineSolution, setShowOfflineSolution] = useState(false);

  const isUser = message.role === 'user';

  // Handle Speech Synthesis for Cikgu AI
  const handlePlayVoice = (textToRead: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Pelayar web anda tidak menyokong fungsi suara.');
      return;
    }

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'ms-MY';
    utterance.rate = 0.95;

    // Check for Malay or English voice
    const voices = window.speechSynthesis.getVoices();
    const msVoice = voices.find((v) => v.lang.includes('ms') || v.lang.includes('id'));
    if (msVoice) utterance.voice = msVoice;

    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    setIsPlayingAudio(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopyFormula = (formula: string) => {
    navigator.clipboard.writeText(formula);
    onCopyToScratchpad(formula);
    setCopiedFormula(true);
    setTimeout(() => setCopiedFormula(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end my-4">
        <div className="max-w-2xl bg-blue-600 text-white rounded-2xl rounded-tr-xs px-4 py-3 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
              Pelajar / Anda
            </span>
            <span className="text-[10px] text-blue-200">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {message.image && (
            <div className="rounded-xl overflow-hidden border border-blue-400/50 bg-black/20 my-2 max-w-sm">
              <img
                src={message.image.previewUrl}
                alt="Foto Soalan KPM"
                className="max-h-56 w-auto object-contain mx-auto"
              />
              <div className="p-1.5 bg-blue-700/60 text-[10px] text-blue-100 flex items-center justify-between font-mono">
                <span>📷 Foto Soalan KPM</span>
                <a
                  href={message.image.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  Buka Gambar Penuh
                </a>
              </div>
            </div>
          )}

          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-medium">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  const cikguData = message.cikguData;

  // Fallback for plain assistant message without structured data
  if (!cikguData) {
    return (
      <div className="flex items-start gap-3 my-4">
        <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-blue-700 to-indigo-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <GraduationCap className="w-5 h-5 text-yellow-300" />
        </div>
        <div className="max-w-3xl bg-white dark:bg-slate-800 rounded-2xl rounded-tl-xs p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // Check if response is Offline Mode
  if (cikguData.mode === 'offline') {
    const offlinePack = cikguData as OfflineStudyPack;
    const readableText = `${offlinePack.warmAcknowledgment} ${offlinePack.kehendakSoalan} ${offlinePack.hint1.concept}`;

    return (
      <div className="flex items-start gap-3 my-5">
        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-amber-600 to-orange-700 text-white flex items-center justify-center flex-shrink-0 shadow-md">
          <BookOpenCheck className="w-5 h-5 text-yellow-200" />
        </div>

        <div className="flex-1 max-w-4xl bg-white dark:bg-slate-800 rounded-2xl rounded-tl-xs border border-amber-200 dark:border-amber-900/50 shadow-md overflow-hidden">
          
          {/* Offline Study Pack Header Banner */}
          <div className="bg-linear-to-r from-amber-500/15 via-orange-500/10 to-transparent p-4 border-b border-amber-200/60 dark:border-amber-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-xs">
                  Pakej Pembelajaran Luar Talian (Study Pack)
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                  {offlinePack.topicTag.level} • {offlinePack.topicTag.subject}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlayVoice(readableText)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title="Dengar Suara Cikgu AI"
                >
                  {isPlayingAudio ? <VolumeX className="w-4 h-4 text-red-500 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                  title="Cetak atau Simpan PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak / PDF</span>
                </button>
              </div>
            </div>

            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-2">
              {offlinePack.topicTag.unit}: {offlinePack.topicTag.title}
            </h3>

            <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mt-1 italic">
              &quot;{offlinePack.warmAcknowledgment}&quot;
            </p>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Kehendak Soalan */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
                🎯 Kehendak Soalan (Target Inquiry)
              </span>
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium">
                {offlinePack.kehendakSoalan}
              </p>
            </div>

            {/* HINT 1: Concept & Core Formula */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h4 className="text-xs sm:text-sm font-extrabold text-blue-900 dark:text-blue-300">
                  {offlinePack.hint1.title} (Konsep & Rumus Asas)
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mb-2">
                {offlinePack.hint1.concept}
              </p>
              {offlinePack.hint1.coreFormula && (
                <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5 flex items-center justify-between font-mono text-xs sm:text-sm text-blue-700 dark:text-blue-300 my-2">
                  <span>{offlinePack.hint1.coreFormula}</span>
                  <button
                    onClick={() => handleCopyFormula(offlinePack.hint1.coreFormula)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    title="Salin ke Buku Latihan"
                  >
                    {copiedFormula ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium italic">
                💡 Panduan Pelajar: {offlinePack.hint1.guide}
              </p>
            </div>

            {/* HINT 2: Collapsible Scaffolding Steps */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h4 className="text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-300">
                    {offlinePack.hint2.title} (Langkah Kerja & Bimbingan)
                  </h4>
                </div>
                <button
                  onClick={() => setShowHint2(!showHint2)}
                  className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors"
                >
                  <span>{showHint2 ? 'Sorok Bimbingan' : 'Buka Bimbingan'}</span>
                  {showHint2 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showHint2 && (
                <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900/50 space-y-2.5 animate-fadeIn">
                  <div className="space-y-1.5">
                    {offlinePack.hint2.intermediateSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-bold text-amber-600 flex-shrink-0">Langkah {idx + 1}:</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-100/70 dark:bg-amber-950/40 p-2.5 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-bold block mb-0.5">⚠️ Kesilapan Lazim Murid:</span>
                    <span>{offlinePack.hint2.commonMistakes}</span>
                  </div>
                </div>
              )}
            </div>

            {/* FINAL SOLUTION: Complete Official KSSR / KSSM Solution Block */}
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-300">
                      Skema Jawapan Rasmi ({offlinePack.finalSolution.markingSchemeCode})
                    </h4>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      Mengikut format penandaan Lembaga Peperiksaan Malaysia
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowOfflineSolution(!showOfflineSolution)}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md shadow-xs transition-colors"
                >
                  <span>{showOfflineSolution ? 'Tutup Skema' : 'Buka Skema Penuh'}</span>
                  {showOfflineSolution ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showOfflineSolution && (
                <div className="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800 space-y-3 animate-fadeIn">
                  {/* Steps Table */}
                  <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border-b border-emerald-200 dark:border-emerald-800">
                        <tr>
                          <th className="p-2 sm:p-2.5 w-12 text-center">No.</th>
                          <th className="p-2 sm:p-2.5">Langkah Kerja & Formulasi</th>
                          <th className="p-2 sm:p-2.5 w-32 text-right">Skema Markah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
                        {offlinePack.finalSolution.steps.map((st) => (
                          <tr key={st.stepNumber} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30">
                            <td className="p-2 sm:p-2.5 font-bold text-center text-slate-500">
                              {st.stepNumber}
                            </td>
                            <td className="p-2 sm:p-2.5 text-slate-800 dark:text-slate-200">
                              <div className="font-medium">{st.stepDescription}</div>
                              <div className="font-mono text-emerald-800 dark:text-emerald-300 font-bold mt-0.5">
                                {st.workingMath}
                              </div>
                            </td>
                            <td className="p-2 sm:p-2.5 text-right">
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                                {st.marksScheme}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Final Answer Callout */}
                  <div className="bg-emerald-100/80 dark:bg-emerald-900/40 p-3 rounded-xl border border-emerald-300 dark:border-emerald-700 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300 tracking-wider block">
                        Jawapan Akhir & Unit SI:
                      </span>
                      <span className="text-base sm:text-lg font-black text-emerald-900 dark:text-emerald-100 font-mono">
                        {offlinePack.finalSolution.finalAnswer}{' '}
                        {offlinePack.finalSolution.siUnit && `(${offlinePack.finalSolution.siUnit})`}
                      </span>
                    </div>
                  </div>

                  {offlinePack.finalSolution.kbatJustification && (
                    <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">
                        🧠 Justifikasi KBAT:
                      </span>
                      <p className="text-slate-700 dark:text-slate-300">
                        {offlinePack.finalSolution.kbatJustification}
                      </p>
                    </div>
                  )}

                  <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-900/50 text-xs text-yellow-900 dark:text-yellow-200">
                    <span className="font-bold block mb-0.5">💡 Tips Pemeriksa KPM:</span>
                    <p>{offlinePack.finalSolution.examinerTips}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ONLINE MODE
  const onlineData = cikguData as CikguAIResponse;
  const isPhase3 = onlineData.phase === 3;
  const readableVoiceText = `${onlineData.encouragement} ${onlineData.kehendakSoalan} ${onlineData.hint.hintBody}`;

  const phaseBadgeColors = {
    1: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    2: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    3: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  }[onlineData.phase] || 'bg-slate-100 text-slate-800';

  return (
    <div className="flex items-start gap-3 my-4">
      <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-blue-700 to-indigo-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-blue-500/10">
        <GraduationCap className="w-5 h-5 text-yellow-300" />
      </div>

      <div className="flex-1 max-w-3xl bg-white dark:bg-slate-800 rounded-2xl rounded-tl-xs border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        
        {/* Top Header with Badges & Speech */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border uppercase tracking-wider ${phaseBadgeColors}`}>
              {onlineData.phaseTitle || `Fasa ${onlineData.phase}`}
            </span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
              {onlineData.curriculumBadge}
            </span>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {onlineData.subjectBadge}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePlayVoice(readableVoiceText)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Dengar Suara Cikgu AI"
            >
              {isPlayingAudio ? (
                <VolumeX className="w-4 h-4 text-red-500 animate-pulse" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          
          {/* Teacher Warm Encouragement */}
          <div className="flex items-start gap-2.5 text-slate-800 dark:text-slate-200">
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-semibold italic text-blue-950 dark:text-blue-200">
              &quot;{onlineData.encouragement}&quot;
            </p>
          </div>

          {/* Kehendak Soalan (Inquiry Target) */}
          <div className="bg-slate-50 dark:bg-slate-900/70 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-0.5">
              🎯 Kehendak Soalan (Target Inquiry)
            </span>
            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium">
              {onlineData.kehendakSoalan}
            </p>
          </div>

          {/* Explanation Body */}
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
            {onlineData.explanation}
          </div>

          {/* Active Hint Card (Phase 1 or 2) */}
          {!isPhase3 && onlineData.hint && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <h4 className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-200">
                  {onlineData.hint.hintTitle}
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {onlineData.hint.hintBody}
              </p>
            </div>
          )}

          {/* Formula Template Card */}
          {onlineData.formulaTemplate && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  📐 Templat Rumus KPM
                </span>
                <button
                  onClick={() => handleCopyFormula(onlineData.formulaTemplate!)}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {copiedFormula ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Disalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin ke Buku Latihan</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-xs sm:text-sm font-bold text-blue-900 dark:text-blue-200 bg-white dark:bg-slate-900 p-2 rounded-lg border border-blue-100 dark:border-blue-900/50">
                {onlineData.formulaTemplate}
              </div>
            </div>
          )}

          {/* KBAT / HOTS Callout */}
          {onlineData.kbatPrompt && (
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/60 dark:bg-purple-950/20 p-3 sm:p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <BrainCircuit className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <span className="text-[11px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
                  Fokus KBAT (Kemahiran Berfikir Aras Tinggi)
                </span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                {onlineData.kbatPrompt}
              </p>
            </div>
          )}

          {/* PHASE 3: Official KPM Marking Scheme Table */}
          {isPhase3 && onlineData.officialSkema && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-200">
                      Skema Markah Rasmi KPM
                    </h4>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                      {onlineData.officialSkema.markingCode || 'Format Lembaga Peperiksaan Malaysia'}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                  FAKTA SAHIH KPM
                </span>
              </div>

              {/* Steps Table */}
              <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border-b border-emerald-200 dark:border-emerald-800">
                    <tr>
                      <th className="p-2 sm:p-2.5 w-10 text-center">No.</th>
                      <th className="p-2 sm:p-2.5">Langkah / Kaedah Kerja</th>
                      <th className="p-2 sm:p-2.5 w-32 text-right">Skema Markah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
                    {onlineData.officialSkema.steps.map((st) => (
                      <tr key={st.stepNumber} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30">
                        <td className="p-2 sm:p-2.5 font-bold text-center text-slate-500">
                          {st.stepNumber}
                        </td>
                        <td className="p-2 sm:p-2.5 text-slate-800 dark:text-slate-200">
                          <div className="font-medium">{st.stepDescription}</div>
                          <div className="font-mono text-emerald-800 dark:text-emerald-300 font-bold mt-0.5">
                            {st.workingMath}
                          </div>
                        </td>
                        <td className="p-2 sm:p-2.5 text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                            {st.marksScheme}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {onlineData.officialSkema.finalAnswerUnit && (
                <div className="bg-emerald-100/80 dark:bg-emerald-900/40 p-2.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs flex items-center justify-between">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">
                    Unit SI & Jawapan Akhir:
                  </span>
                  <span className="font-mono font-black text-emerald-950 dark:text-white text-sm">
                    {onlineData.officialSkema.finalAnswerUnit}
                  </span>
                </div>
              )}

              {onlineData.officialSkema.kbatSummary && (
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 block mb-0.5">
                    🧠 Formulasi Jawapan KBAT:
                  </span>
                  <p className="text-slate-700 dark:text-slate-300">
                    {onlineData.officialSkema.kbatSummary}
                  </p>
                </div>
              )}

              {onlineData.officialSkema.tipsPemeriksa && (
                <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-900/50 text-xs text-yellow-900 dark:text-yellow-200">
                  <span className="font-bold block mb-0.5">💡 Tips Pemeriksa KPM:</span>
                  <p>{onlineData.officialSkema.tipsPemeriksa}</p>
                </div>
              )}
            </div>
          )}

          {/* Next Action Callout */}
          <div className="pt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>{onlineData.nextActionPrompt}</span>
          </div>

          {/* Quick Action Chips & Solution Button */}
          <div className="pt-2 flex flex-wrap items-center gap-1.5">
            {onlineData.suggestedQuickReplies?.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => onSelectQuickReply(reply)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                {reply}
              </button>
            ))}

            {!isPhase3 && (
              <button
                onClick={onRequestFullSolution}
                className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1"
              >
                <FileCheck2 className="w-3 h-3" />
                <span>Tunjuk Skema Penuh (Fasa 3)</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

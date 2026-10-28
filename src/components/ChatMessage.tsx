import React, { useState } from 'react';
import {
  GraduationCap,
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
import { getStrings } from '../lib/i18n';

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
  const s = getStrings(message.language);

  // Handle Speech Synthesis for Aura Tutor
  const handlePlayVoice = (textToRead: string) => {
    if (!('speechSynthesis' in window)) {
      alert(s.voiceUnsupported);
      return;
    }

    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = message.language === 'en' ? 'en-US' : 'ms-MY';
    utterance.rate = 0.95;

    // Check for Malay or English voice
    const voices = window.speechSynthesis.getVoices();
    const wanted = message.language === 'en' ? ['en'] : ['ms', 'id'];
    const voice = voices.find((v) => wanted.some((l) => v.lang.toLowerCase().startsWith(l)));
    if (voice) utterance.voice = voice;

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
        <div className="max-w-2xl bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 space-y-2">
          {message.image && (
            <div className="rounded-xl overflow-hidden bg-black/20 max-w-sm">
              <img
                src={message.image.previewUrl}
                alt="Foto Soalan KPM"
                className="max-h-56 w-auto object-contain mx-auto"
              />
            </div>
          )}

          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
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
                  {s.packTitle}
                </span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                  {offlinePack.topicTag.level} • {offlinePack.topicTag.subject}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlayVoice(readableText)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  title={s.listen}
                >
                  {isPlayingAudio ? <VolumeX className="w-4 h-4 text-red-500 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                  title={s.printTitle}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{s.print}</span>
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
                🎯 {s.targetInquiry}
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
                  {offlinePack.hint1.title} ({s.conceptFormula})
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
                    title={s.copyToPad}
                  >
                    {copiedFormula ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium italic">
                💡 {s.studentGuide}: {offlinePack.hint1.guide}
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
                    {offlinePack.hint2.title} ({s.stepsGuide})
                  </h4>
                </div>
                <button
                  onClick={() => setShowHint2(!showHint2)}
                  className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 px-2.5 py-1 rounded-md transition-colors"
                >
                  <span>{showHint2 ? s.hideGuide : s.openGuide}</span>
                  {showHint2 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showHint2 && (
                <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-900/50 space-y-2.5 animate-fadeIn">
                  <div className="space-y-1.5">
                    {offlinePack.hint2.intermediateSteps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-bold text-amber-600 flex-shrink-0">{s.stepN(idx + 1)}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-100/70 dark:bg-amber-950/40 p-2.5 rounded-lg text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-bold block mb-0.5">⚠️ {s.commonMistakes}</span>
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
                      {s.officialScheme} ({offlinePack.finalSolution.markingSchemeCode})
                    </h4>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                      {s.schemeFormat}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowOfflineSolution(!showOfflineSolution)}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md shadow-xs transition-colors"
                >
                  <span>{showOfflineSolution ? s.closeScheme : s.openScheme}</span>
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
                          <th className="p-2 sm:p-2.5 w-12 text-center">{s.colNo}</th>
                          <th className="p-2 sm:p-2.5">{s.colWorking}</th>
                          <th className="p-2 sm:p-2.5 w-32 text-right">{s.markScheme}</th>
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
                        {s.finalAnswerUnit}
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
                        🧠 {s.kbatJustification}
                      </span>
                      <p className="text-slate-700 dark:text-slate-300">
                        {offlinePack.finalSolution.kbatJustification}
                      </p>
                    </div>
                  )}

                  <div className="bg-yellow-50 dark:bg-yellow-950/30 p-2.5 rounded-lg border border-yellow-200 dark:border-yellow-900/50 text-xs text-yellow-900 dark:text-yellow-200">
                    <span className="font-bold block mb-0.5">💡 {s.examinerTips}</span>
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

  return (
    <div className="flex items-start gap-3 my-4">
      <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
        <GraduationCap className="w-5 h-5" />
      </div>

      <div className="flex-1 max-w-3xl bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Top row: phase, subject, voice */}
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              {onlineData.phaseTitle || `${s.phase} ${onlineData.phase}`}
            </span>
            {onlineData.curriculumBadge && <span>· {onlineData.curriculumBadge}</span>}
            {onlineData.subjectBadge && <span>· {onlineData.subjectBadge}</span>}
          </div>
          <button
            onClick={() => handlePlayVoice(readableVoiceText)}
            className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={s.listen}
          >
            {isPlayingAudio ? (
              <VolumeX className="w-4 h-4 text-red-500" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Encouragement */}
          {onlineData.encouragement && (
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {onlineData.encouragement}
            </p>
          )}

          {/* Question target */}
          {onlineData.kehendakSoalan && (
            <div className="border-l-2 border-slate-300 dark:border-slate-600 pl-3">
              <span className="text-[11px] font-semibold text-slate-400 block">{s.question}</span>
              <p className="text-sm text-slate-700 dark:text-slate-200">{onlineData.kehendakSoalan}</p>
            </div>
          )}

          {/* Explanation */}
          {onlineData.explanation && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {onlineData.explanation}
            </p>
          )}

          {/* Hint (one sentence) + options */}
          {!isPhase3 && onlineData.hint && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 p-3.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {onlineData.hint.hintTitle}
                </h4>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {onlineData.hint.hintBody}
              </p>

              {onlineData.hintOptions && onlineData.hintOptions.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {onlineData.hintOptions.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => onSelectQuickReply(`${s.myChoice}: ${letter}. ${option}`)}
                        className="w-full flex items-start gap-2.5 text-left px-3 py-2 rounded-lg text-sm bg-white hover:bg-blue-50 text-slate-800 dark:bg-slate-900 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 hover:border-blue-300 dark:border-slate-700 transition-colors"
                      >
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[11px] font-semibold flex items-center justify-center">
                          {letter}
                        </span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Formula */}
          {onlineData.formulaTemplate && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold text-slate-400">{s.formula}</span>
                <button
                  onClick={() => handleCopyFormula(onlineData.formulaTemplate!)}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {copiedFormula ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{s.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{s.copyToPad}</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                {onlineData.formulaTemplate}
              </div>
            </div>
          )}

          {/* KBAT */}
          {onlineData.kbatPrompt && (
            <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <BrainCircuit className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
              <p>
                <span className="font-semibold">KBAT: </span>
                {onlineData.kbatPrompt}
              </p>
            </div>
          )}

          {/* PHASE 3: marking scheme */}
          {isPhase3 && onlineData.officialSkema && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <Award className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div className="leading-tight">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {s.markScheme}
                  </h4>
                  {onlineData.officialSkema.markingCode && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {onlineData.officialSkema.markingCode}
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] text-slate-400 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center font-medium">{s.colNo}</th>
                      <th className="px-3 py-2 font-medium">{s.colStep}</th>
                      <th className="px-3 py-2 w-28 text-right font-medium">{s.colMarks}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {onlineData.officialSkema.steps.map((st) => (
                      <tr key={st.stepNumber}>
                        <td className="px-3 py-2.5 text-center text-slate-400">{st.stepNumber}</td>
                        <td className="px-3 py-2.5 text-slate-800 dark:text-slate-200">
                          <div>{st.stepDescription}</div>
                          {st.workingMath && (
                            <div className="font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                              {st.workingMath}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            {st.marksScheme}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(onlineData.officialSkema.finalAnswerUnit ||
                onlineData.officialSkema.kbatSummary ||
                onlineData.officialSkema.tipsPemeriksa) && (
                <div className="px-3.5 py-3 space-y-2 border-t border-slate-200 dark:border-slate-700 text-sm">
                  {onlineData.officialSkema.finalAnswerUnit && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-500">{s.finalAnswer}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {onlineData.officialSkema.finalAnswerUnit}
                      </span>
                    </div>
                  )}
                  {onlineData.officialSkema.kbatSummary && (
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">KBAT: </span>
                      {onlineData.officialSkema.kbatSummary}
                    </p>
                  )}
                  {onlineData.officialSkema.tipsPemeriksa && (
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">{s.examinerTip}</span>
                      {onlineData.officialSkema.tipsPemeriksa}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Next action */}
          {onlineData.nextActionPrompt && (
            <p className="flex items-start gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>{onlineData.nextActionPrompt}</span>
            </p>
          )}

          {/* Small print (e.g. on-device model warning) */}
          {onlineData.note && (
            <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">{onlineData.note}</p>
          )}

          {/* Quick replies + full solution */}
          <div className="flex flex-wrap items-center gap-1.5">
            {onlineData.suggestedQuickReplies?.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => onSelectQuickReply(reply)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-white hover:bg-slate-50 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 transition-colors"
              >
                {reply}
              </button>
            ))}

            {!isPhase3 && (
              <button
                onClick={onRequestFullSolution}
                className="px-3 py-1 rounded-full text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1"
              >
                <FileCheck2 className="w-3 h-3" />
                <span>{s.showFullScheme}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

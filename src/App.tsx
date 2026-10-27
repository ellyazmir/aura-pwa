/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Send,
  Sparkles,
  RefreshCw,
  GraduationCap,
  Calculator,
  BookOpen,
  Wifi,
  WifiOff,
  Lightbulb,
  Award,
  ChevronRight,
  Loader2,
  Trash2,
  Camera,
  Upload,
  Image as ImageIcon,
  X,
  FileSearch,
  CheckCircle2,
  Download,
} from 'lucide-react';

import {
  fetchWithOfflineFallback,
  preloadOfflineModel,
  isOfflineModelReady,
  subscribeOfflineStream,
} from './lib/offlineFallback';

import { Header } from './components/Header';
import { PhaseTracker } from './components/PhaseTracker';
import { ChatMessage } from './components/ChatMessage';
import { Scratchpad } from './components/Scratchpad';
import { KpmReferenceModal } from './components/KpmReferenceModal';
import { SampleQuestionsModal } from './components/SampleQuestionsModal';
import { ImageScannerModal } from './components/ImageScannerModal';
import {
  CurriculumLevel,
  LanguageMode,
  OperationalMode,
  Message,
  SampleQuestion,
  CikguResult,
  AttachedImage,
  ScannedQuestionResult,
} from './types/cikgu';
import { SAMPLE_QUESTIONS } from './data/kpmData';

export default function App() {
  const [mode, setMode] = useState<OperationalMode>('online');
  const [curriculumLevel, setCurriculumLevel] = useState<CurriculumLevel>('auto');
  const [selectedSubject, setSelectedSubject] = useState<string>('Umum');
  const [language, setLanguage] = useState<LanguageMode>('bm');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<number>(1);

  // Attached image state
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [isScanningInline, setIsScanningInline] = useState(false);
  const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);

  // Tools & Drawers
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadInitialText, setScratchpadInitialText] = useState('');
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
  const [isKpmRefOpen, setIsKpmRefOpen] = useState(false);

  // Offline (WASM) model state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(isOfflineModelReady());
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [streamText, setStreamText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Show the on-device answer as it is being written
  useEffect(() => subscribeOfflineStream(setStreamText), []);

  // When the connection drops, warm up the local model so the first answer is faster
  useEffect(() => {
    if (!isOnline && offlineReady) {
      preloadOfflineModel().catch(() => {});
    }
  }, [isOnline, offlineReady]);

  const handleDownloadOfflineModel = async () => {
    setModelProgress(0);
    try {
      await preloadOfflineModel(setModelProgress);
      setOfflineReady(true);
    } catch (err: any) {
      alert(`Gagal memuat turun model luar talian: ${err.message}`);
    } finally {
      setModelProgress(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, attachedImage]);

  // Trigger celebration when Phase 3 is reached
  const triggerCelebration = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#2563eb', '#10b981', '#f59e0b', '#dc2626'],
      });
    } catch {
      // safe fallback
    }
  };

  // Submit message to Cikgu AI API
  const handleSendMessage = async (
    textToSend?: string,
    options?: { requestDirectPhase3?: boolean; userAttempt?: string }
  ) => {
    const text = textToSend ?? inputText;
    // Allow send if either text is entered or an image is attached
    if ((!text.trim() && !attachedImage) || isLoading) return;

    const messageText = text.trim() || 'Sila bimbing saya menyelesaikan soalan pada gambar yang dilampirkan ini.';

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      image: attachedImage || undefined,
      phaseAtTime: currentPhase,
      modeAtTime: mode,
    };

    const currentImageToSend = attachedImage;
    // Clear image and text immediately
    setAttachedImage(null);
    if (!textToSend) setInputText('');

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Tries the server first; falls back to the on-device WASM model if there is no internet.
      const response = await fetchWithOfflineFallback('/api/cikgu/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          educationLevel: curriculumLevel,
          subject: selectedSubject,
          language,
          requestDirectPhase3: options?.requestDirectPhase3 || false,
          userAttempt: options?.userAttempt || '',
          image: currentImageToSend
            ? {
                data: currentImageToSend.data,
                mimeType: currentImageToSend.mimeType,
              }
            : null,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Gagal menghubungi pelayan Cikgu AI.');
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        const cikguResult: CikguResult = resData.data;

        let detectedPhase = currentPhase;
        if (cikguResult.mode === 'online') {
          detectedPhase = cikguResult.phase;
          setCurrentPhase(detectedPhase);
          if (detectedPhase === 3) {
            triggerCelebration();
          }
        }

        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content:
            cikguResult.mode === 'online'
              ? cikguResult.explanation
              : cikguResult.kehendakSoalan,
          timestamp: new Date(),
          cikguData: cikguResult,
          phaseAtTime: detectedPhase,
          modeAtTime: mode,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(resData.error || 'Respons tidak sah diterima.');
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        content: `Maaf adik, Cikgu menghadapi masalah teknikal: ${err.message}. Sila cuba hantar semula soalan anda sebentar lagi.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  // Perform OCR Scan on currently attached image
  const handleScanInlineImage = async () => {
    if (!attachedImage) return;
    setIsScanningInline(true);

    try {
      // Photo scanning (OCR) always needs the server
      if (!navigator.onLine) throw new Error('Imbasan gambar memerlukan sambungan internet.');

      const response = await fetch('/api/cikgu/scan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: {
            data: attachedImage.data,
            mimeType: attachedImage.mimeType,
          },
        }),
      });

      if (!response.ok) throw new Error('Gagal mengimbas gambar soalan.');
      const resData = await response.json();

      if (resData.success && resData.data) {
        const result: ScannedQuestionResult = resData.data;
        setInputText(result.extractedText);
        if (result.detectedSubject) setSelectedSubject(result.detectedSubject);
        if (result.detectedLevel && result.detectedLevel !== 'auto') {
          setCurriculumLevel(result.detectedLevel as CurriculumLevel);
        }
      }
    } catch (err: any) {
      alert(`Ralat imbasan: ${err.message}`);
    } finally {
      setIsScanningInline(false);
    }
  };

  // Handle image selected from Scanner Modal
  const handleImageScanned = (
    img: AttachedImage,
    scanResult?: ScannedQuestionResult
  ) => {
    setAttachedImage(img);
    if (scanResult) {
      setInputText(scanResult.extractedText);
      if (scanResult.detectedSubject) {
        setSelectedSubject(scanResult.detectedSubject);
      }
      if (scanResult.detectedLevel && scanResult.detectedLevel !== 'auto') {
        setCurriculumLevel(scanResult.detectedLevel as CurriculumLevel);
      }
    }
  };

  // Fast 1-click file upload handler
  const handleQuickUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = reader.result as string;
        const base64Data = resultStr.split(',')[1];
        setAttachedImage({
          data: base64Data,
          mimeType: file.type || 'image/jpeg',
          previewUrl: resultStr,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Quick reply click from suggested chips
  const handleSelectQuickReply = (reply: string) => {
    handleSendMessage(reply);
  };

  // Request direct Phase 3 (full marking scheme)
  const handleRequestFullSolution = () => {
    handleSendMessage('Cikgu, bolehkah tunjukkan skema jawapan penuh KPM untuk soalan ini?', {
      requestDirectPhase3: true,
    });
  };

  // Submit attempt from Scratchpad
  const handleSubmitScratchpadStep = (stepText: string) => {
    setScratchpadOpen(false);
    handleSendMessage(stepText, { userAttempt: stepText });
  };

  // Select sample question from modal or home cards
  const handleSelectSample = (sample: SampleQuestion) => {
    setIsSampleModalOpen(false);
    setCurriculumLevel(sample.level);
    setSelectedSubject(sample.subject);
    handleSendMessage(sample.question);
  };

  // Reset conversation
  const handleResetChat = () => {
    setMessages([]);
    setCurrentPhase(1);
    setInputText('');
    setAttachedImage(null);
  };

  // Copy formula from message into scratchpad
  const handleCopyToScratchpad = (text: string) => {
    setScratchpadInitialText(text);
    setScratchpadOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-200">
      
      {/* Malaysian KPM Header */}
      <Header
        mode={mode}
        onModeChange={(newMode) => setMode(newMode)}
        curriculumLevel={curriculumLevel}
        onCurriculumChange={setCurriculumLevel}
        selectedSubject={selectedSubject}
        onSubjectChange={setSelectedSubject}
        language={language}
        onLanguageChange={setLanguage}
        onOpenSampleQuestions={() => setIsSampleModalOpen(true)}
        onOpenKpmReference={() => setIsKpmRefOpen(true)}
        onOpenImageScanner={() => setIsImageScannerOpen(true)}
        scratchpadOpen={scratchpadOpen}
        onToggleScratchpad={() => setScratchpadOpen(!scratchpadOpen)}
      />

      {/* No-internet banner */}
      {!isOnline && (
        <div className="bg-slate-800 text-white text-xs font-medium px-4 py-2 text-center">
          {offlineReady
            ? 'Tiada internet. Cikgu AI menggunakan model dalam peranti (jawapan mungkin kurang tepat).'
            : 'Tiada internet. Muat turun model luar talian semasa dalam talian untuk guna Cikgu AI tanpa internet.'}
        </div>
      )}

      {/* Online Mode Socratic Phase Tracker */}
      {mode === 'online' && (
        <PhaseTracker currentPhase={currentPhase} />
      )}

      {/* Offline Mode Banner */}
      {mode === 'offline' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2">
          <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 font-medium">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Mod Luar Talian (Study Pack) Aktif:</strong> Setiap soalan akan menjana pakej panduan lengkap (Petunjuk 1, Petunjuk 2, & Skema Penuh KPM) dalam satu respons yang boleh dicetak.
              </span>
            </div>
            <button
              onClick={() => setMode('online')}
              className="text-xs font-bold text-amber-800 dark:text-amber-300 underline hover:no-underline flex-shrink-0"
            >
              Tukar ke Mod Sokratik
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 flex flex-col max-w-5xl w-full mx-auto p-4 sm:p-6 overflow-y-auto">
          
          {/* Welcome / Empty State */}
          {messages.length === 0 && (
            <div className="my-auto py-6 max-w-3xl mx-auto space-y-6">
              
              {/* Teacher Welcome Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-blue-500/10 to-transparent pointer-events-none rounded-full blur-2xl"></div>

                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-linear-to-tr from-blue-700 to-indigo-800 text-white flex items-center justify-center flex-shrink-0 shadow-lg ring-4 ring-blue-500/10">
                    <GraduationCap className="w-8 h-8 text-yellow-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                        {mode === 'online' ? 'Kaedah Sokratik 3-Fasa' : 'Pakej Nota Luar Talian'}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        KSSR & KSSM Rasmi
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
                      Selamat Datang! Cikgu AI Sedia Membimbing Anda.
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                      Cikgu tidak akan terus memberi jawapan bulat-bulat, tetapi akan membimbing langkah demi langkah mengikut format sukatan pelajaran Kementerian Pendidikan Malaysia (KPM).
                    </p>
                  </div>
                </div>

                {/* Direct Image Scanner Prompt Card */}
                <div className="mt-6 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-indigo-950 dark:text-indigo-200">
                        Ada foto soalan dari buku teks atau kertas SPM?
                      </h4>
                      <p className="text-xs text-indigo-800/80 dark:text-indigo-300">
                        Imbas foto sekarang untuk analisis rajah saintifik & bimbingan Sokratik segera.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsImageScannerOpen(true)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    <span>Imbas Foto Soalan</span>
                  </button>
                </div>

                {/* Socratic Flow Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="bg-blue-50/70 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100 dark:border-blue-900/50">
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 block mb-1">
                      FASA 1: KEHENDAK & PETUNJUK 1
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Kenal pasti apa yang dicari & rumus asas tanpa bocorkan jawapan akhir.
                    </p>
                  </div>
                  <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100 dark:border-amber-900/50">
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 block mb-1">
                      FASA 2: SEMAKAN & KBAT
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Semak cubaan langkah anda, petunjuk 2 & soalan pemikiran aras tinggi.
                    </p>
                  </div>
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block mb-1">
                      FASA 3: SKEMA RASMI KPM
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Format penuh SPM [K1, N1, P1] & UASA, Unit SI & Tips Pemeriksa.
                    </p>
                  </div>
                </div>

              </div>

              {/* Sample Questions Quick Selector */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Contoh Soalan KPM Popular untuk Dicuba:
                  </span>
                  <button
                    onClick={() => setIsSampleModalOpen(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Lihat Semua ({SAMPLE_QUESTIONS.length})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SAMPLE_QUESTIONS.slice(0, 4).map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => handleSelectSample(sample)}
                      className="p-3.5 text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">
                          {sample.levelName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {sample.subject}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {sample.question}
                      </p>
                      <div className="text-[10px] font-medium text-slate-400 mt-2 flex items-center justify-between">
                        <span>Topik: {sample.topic}</span>
                        <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform">
                          Cuba &rarr;
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Active Messages */}
          {messages.length > 0 && (
            <div className="space-y-4 pb-20">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onSelectQuickReply={handleSelectQuickReply}
                  onRequestFullSolution={handleRequestFullSolution}
                  onCopyToScratchpad={handleCopyToScratchpad}
                />
              ))}

              {isLoading && (
                <div className="flex items-start gap-3 my-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                    <GraduationCap className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-xs p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                        Cikgu AI sedang meneliti soalan anda...
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isOnline
                          ? 'Menganalisis teks, rajah, dan kehendak soalan sukatan KPM'
                          : 'Model dalam peranti sedang berfikir, ini mungkin mengambil masa'}
                      </p>
                      {streamText && (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-w-md">
                          {streamText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

        </main>

        {/* Scratchpad Sidebar Drawer */}
        <Scratchpad
          isOpen={scratchpadOpen}
          onClose={() => setScratchpadOpen(false)}
          onSubmitStep={handleSubmitScratchpadStep}
          initialText={scratchpadInitialText}
        />
      </div>

      {/* Bottom Sticky Chat Input Bar */}
      <footer className="sticky bottom-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4">
        <div className="max-w-4xl mx-auto space-y-2">
          
          {/* Quick Helper Tools Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Scan / Upload Image Button */}
              <button
                onClick={() => setIsImageScannerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 transition-colors"
                title="Imbas atau Muat Naik Foto Soalan"
              >
                <Camera className="w-3.5 h-3.5 text-indigo-600" />
                <span>Imbas Foto Soalan</span>
              </button>

              {/* Fast 1-click Upload File */}
              <input
                ref={quickFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQuickUpload}
                className="hidden"
              />
              <button
                onClick={() => quickFileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                title="Pilih Gambar dari Fail"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pilih Fail</span>
              </button>

              <button
                onClick={() => setScratchpadOpen(!scratchpadOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <Calculator className="w-3.5 h-3.5 text-indigo-500" />
                <span>Buku Latihan</span>
              </button>

              <button
                onClick={() => setIsKpmRefOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>Rumus KPM</span>
              </button>

              {/* Offline model download (only while online and not yet downloaded) */}
              {isOnline && !offlineReady && (
                <button
                  onClick={handleDownloadOfflineModel}
                  disabled={modelProgress !== null}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800 transition-colors disabled:opacity-60"
                  title="Muat turun model AI untuk digunakan tanpa internet"
                >
                  {modelProgress !== null ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {modelProgress !== null
                      ? `Memuat turun ${modelProgress}%`
                      : 'Muat turun model luar talian'}
                  </span>
                </button>
              )}
              {offlineReady && (
                <span className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Model luar talian sedia
                </span>
              )}
            </div>

            {messages.length > 0 && (
              <button
                onClick={handleResetChat}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors"
                title="Mula soalan baharu"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sesi Baharu</span>
              </button>
            )}
          </div>

          {/* Attached Image Preview Bar */}
          {attachedImage && (
            <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 animate-fadeIn">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={attachedImage.previewUrl}
                  alt="Lampiran Soalan"
                  className="w-12 h-12 rounded-lg object-cover border border-indigo-300 dark:border-indigo-700 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="truncate">Foto soalan dilampirkan</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 truncate">
                    Cikgu AI akan menganalisis teks & rajah dalam gambar ini.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleScanInlineImage}
                  disabled={isScanningInline}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shadow-2xs flex items-center gap-1 transition-all"
                >
                  {isScanningInline ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileSearch className="w-3 h-3" />
                  )}
                  <span>{isScanningInline ? 'Mengimbas...' : 'Ekstrak Teks (OCR)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAttachedImage(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                  title="Padam gambar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-end gap-2 bg-slate-100 dark:bg-slate-800/90 rounded-2xl p-2 border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all"
          >
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                attachedImage
                  ? 'Foto soalan dilampirkan. Tulis sebarang soalan khusus atau tekan "Tanya Cikgu"...'
                  : mode === 'online'
                  ? 'Tulis soalan anda, taip cubaan langkah kerja, atau lampirkan foto soalan...'
                  : 'Tulis soalan anda di sini untuk menjana Pakej Pembelajaran Luar Talian lengkap...'
              }
              rows={1}
              className="w-full max-h-32 p-2 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden resize-none leading-relaxed"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && !attachedImage) || isLoading}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Tanya Cikgu</span>
                </>
              )}
            </button>
          </form>

        </div>
      </footer>

      {/* Modals */}
      <ImageScannerModal
        isOpen={isImageScannerOpen}
        onClose={() => setIsImageScannerOpen(false)}
        onImageScanned={handleImageScanned}
      />

      <SampleQuestionsModal
        isOpen={isSampleModalOpen}
        onClose={() => setIsSampleModalOpen(false)}
        onSelectQuestion={handleSelectSample}
      />

      <KpmReferenceModal
        isOpen={isKpmRefOpen}
        onClose={() => setIsKpmRefOpen(false)}
        onCopyToScratchpad={handleCopyToScratchpad}
      />

    </div>
  );
}
import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  FileSearch,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { AttachedImage, ScannedQuestionResult } from '../types/cikgu';

interface ImageScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageScanned: (
    image: AttachedImage,
    scanResult?: ScannedQuestionResult
  ) => void;
}

export const ImageScannerModal: React.FC<ImageScannerModalProps> = ({
  isOpen,
  onClose,
  onImageScanned,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedQuestionResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Process file to base64
  const processFile = (file: File) => {
    setSelectedFile(file);
    setScanResult(null);
    setScanError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      setImagePreview(resultStr);

      const mimeType = file.type || 'image/jpeg';
      const base64Data = resultStr.split(',')[1];

      setAttachedImage({
        data: base64Data,
        mimeType,
        previewUrl: resultStr,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Trigger Camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.error(err);
      setCameraError('Tidak dapat mengakses kamera. Sila benarkan akses kamera atau guna pilihan muat naik fail.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setImagePreview(dataUrl);

      const base64Data = dataUrl.split(',')[1];
      setAttachedImage({
        data: base64Data,
        mimeType: 'image/jpeg',
        previewUrl: dataUrl,
      });
      stopCamera();
    }
  };

  // Scan Question via AI OCR
  const handleScanQuestion = async () => {
    if (!attachedImage) return;

    setIsScanning(true);
    setScanError(null);

    try {
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

      if (!response.ok) {
        throw new Error('Gagal mengimbas soalan daripada gambar.');
      }

      const resJson = await response.json();
      if (resJson.success && resJson.data) {
        setScanResult(resJson.data);
      } else {
        throw new Error(resJson.error || 'Gagal mengekstrak teks.');
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || 'Ralat semasa mengimbas gambar.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleApply = () => {
    if (!attachedImage) return;
    stopCamera();
    onImageScanned(attachedImage, scanResult || undefined);
    onClose();
  };

  const handleModalClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Imbas Soalan Peperiksaan / Buku Teks
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pengecaman soalan & rajah saintifik KPM secara pintar
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => {
              stopCamera();
              setActiveTab('upload');
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Muat Naik Foto</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('camera');
              startCamera();
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'camera'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Ambil Foto Kamera</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TAB 1: UPLOAD */}
          {activeTab === 'upload' && !imagePreview && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-all flex flex-col items-center justify-center space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Klik untuk pilih gambar atau seret foto soalan ke sini
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Menyokong PNG, JPG, JPEG dari buku latihan atau kertas peperiksaan SPM/UASA
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: CAMERA CAPTURE */}
          {activeTab === 'camera' && !imagePreview && (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{cameraError}</span>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-4 inset-x-0 flex justify-center">
                    <button
                      onClick={capturePhoto}
                      className="px-5 py-2.5 rounded-full bg-white text-slate-900 font-extrabold text-xs shadow-lg hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span>Tangkap Foto Soalan</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PREVIEW & OCR SCAN AREA */}
          {imagePreview && (
            <div className="space-y-4 animate-fadeIn">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 max-h-64 flex items-center justify-center">
                <img
                  src={imagePreview}
                  alt="Soalan Diimbas"
                  className="max-h-64 w-auto object-contain"
                />
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setAttachedImage(null);
                    setScanResult(null);
                    if (activeTab === 'camera') startCamera();
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                  title="Tukar gambar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleScanQuestion}
                  disabled={isScanning}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Mengimbas & Mengekstrak Teks Soalan...</span>
                    </>
                  ) : (
                    <>
                      <FileSearch className="w-4 h-4" />
                      <span>Imbas & Ekstrak Teks Soalan (OCR Pintar)</span>
                    </>
                  )}
                </button>
              </div>

              {scanError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              {/* Scan Results Card */}
              {scanResult && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Berjaya Diekstrak:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                        {scanResult.detectedSubject}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {scanResult.detectedLevel.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed whitespace-pre-wrap">
                    {scanResult.extractedText}
                  </div>

                  <p className="text-[11px] text-slate-500 italic">
                    Ringkasan: {scanResult.summary}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {attachedImage ? 'Gambar dipilih sedia untuk dihantar.' : 'Pilih atau ambil foto soalan.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleModalClose}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleApply}
              disabled={!attachedImage}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Gunakan Soalan Ini</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

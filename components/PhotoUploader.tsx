'use client';

import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Loader2,
  Trash2,
  Clock,
  MapPin,
  User,
  Settings as SettingsIcon
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK } from '@/lib/schedule-utils';
import { eventStyle } from '@/lib/event-styles';

interface PhotoUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onEventsExtracted: (newEvents: ScheduleEvent[]) => void;
  geminiKey?: string;
  groqKey?: string;
  onOpenSettings: () => void;
}

const PROVIDER_LABELS: Record<string, string> = { gemini: 'Google Gemini', groq: 'Groq' };

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  isOpen,
  onClose,
  onEventsExtracted,
  geminiKey,
  groqKey,
  onOpenSettings,
}) => {
  const [scheduleType, setScheduleType] = useState<EventType>('university');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<ScheduleEvent[] | null>(null);
  const [readBy, setReadBy] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    setErrorMsg(null);
    setErrorCode(null);
    setExtractedEvents(null);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // 1600 px basta para leer texto y mantiene la petición liviana (más rápida con datos móviles)
        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fondo blanco: las capturas PNG con transparencia se verían negras al pasar a JPEG
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setImagePreview(optimizedDataUrl);
        } else {
          setImagePreview(rawDataUrl);
        }
      };
      img.onerror = () => {
        setImagePreview(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processSelectedFile(file);
    }
  };

  const handleStartAnalysis = async () => {
    if (!imagePreview) return;

    setIsAnalyzing(true);
    setErrorMsg(null);
    setErrorCode(null);
    setWarnings([]);
    setAnalysisStatus('Preparando la imagen...');

    const statusUpdates = [
      'Enviando imagen a la IA...',
      'Escaneando días, asignaturas y turnos...',
      'Extrayendo horas de inicio y fin...',
      'Normalizando bloques semanales...',
      'Revisando que no falte nada...',
    ];
    let updateIndex = 0;
    const interval = setInterval(() => {
      if (updateIndex < statusUpdates.length) {
        setAnalysisStatus(statusUpdates[updateIndex]);
        updateIndex++;
      }
    }, 1800);

    try {
      const response = await fetch('/api/analyze-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
          scheduleType: scheduleType,
          geminiKey: geminiKey || undefined,
          groqKey: groqKey || undefined,
        }),
      });

      const data = await response.json().catch(() => ({ success: false, error: 'El servidor no respondió correctamente. Intenta de nuevo.' }));

      if (!response.ok || !data.success) {
        setErrorCode(data.code || null);
        throw new Error(data.error || 'No se pudieron extraer los horarios de la imagen.');
      }

      setExtractedEvents(data.events);
      setReadBy(data.provider ? `${PROVIDER_LABELS[data.provider] || data.provider}${data.model ? ` · ${data.model}` : ''}` : null);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message === 'Failed to fetch' ? 'Sin conexión a internet. Revisa tu red e intenta de nuevo.' : err.message || 'Error al conectar con la IA');
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
    }
  };

  const handleDeleteExtracted = (id: string) => {
    if (!extractedEvents) return;
    setExtractedEvents(extractedEvents.filter((ev) => ev.id !== id));
  };

  const handleConfirmAndSave = () => {
    if (extractedEvents && extractedEvents.length > 0) {
      onEventsExtracted(extractedEvents);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setExtractedEvents(null);
    setErrorMsg(null);
    setErrorCode(null);
    setWarnings([]);
    setReadBy(null);
    setIsAnalyzing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="photo-uploader-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Cabecera del modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="photo-uploader-title" className="text-base font-bold text-white">Escanear Horario con IA</h2>
              <p className="text-xs text-slate-400">Sube la foto de tu horario y la IA lo organizará por ti</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">

          {/* Selector de Tipo de Horario */}
          {!extractedEvents && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                1. Selecciona qué horario vas a subir:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleType('university')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                    scheduleType === 'university'
                      ? 'border-indigo-500 bg-indigo-600/15 text-indigo-300 shadow-md shadow-indigo-500/10'
                      : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 text-indigo-400" />
                  Horario de Universidad
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleType('work')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                    scheduleType === 'work'
                      ? 'border-emerald-500 bg-emerald-600/15 text-emerald-300 shadow-md shadow-emerald-500/10'
                      : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-emerald-400" />
                  Horario de Trabajo
                </button>
              </div>
            </div>
          )}

          {/* Área de subida o Vista Previa */}
          {!extractedEvents && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                2. Toma una foto o sube la imagen:
              </label>

              {!imagePreview ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-8 text-center transition-colors bg-slate-950/30 flex flex-col items-center justify-center gap-3 cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      Arrastra la foto aquí o haz clic para seleccionarla
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Admite capturas de pantalla, fotos impresas o tomadas con la cámara (JPG, PNG, WEBP)
                    </p>
                  </div>

                  <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Galería / Archivo
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Tomar Foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">
                  <div className="relative max-h-64 sm:max-h-72 flex items-center justify-center bg-black/40 overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Horario subido"
                      className="object-contain max-h-64 sm:max-h-72 w-auto"
                    />

                    {/* Escaneo animado láser cuando está procesando */}
                    {isAnalyzing && (
                      <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan z-10" />
                    )}
                  </div>

                  {/* Barra de opciones de la imagen */}
                  <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate max-w-[200px]">{imageFile?.name || 'Foto tomada'}</span>
                    {!isAnalyzing && (
                      <button
                        type="button"
                        onClick={handleReset}
                        className="text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Cambiar foto
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Inputs ocultos para archivo y cámara nativa */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs sm:text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">No se pudo procesar la imagen</p>
                <p className="mt-0.5">{errorMsg}</p>
                {(errorCode === 'NO_KEY' || errorCode === 'INVALID_KEY' || errorCode === 'QUOTA') && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 border border-slate-700"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    Abrir Ajustes de IA
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Estado de análisis */}
          {isAnalyzing && (
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-indigo-300">{analysisStatus}</p>
                <p className="text-xs text-slate-400 mt-0.5">La IA está leyendo las celdas, materias y turnos (puede tardar hasta 30 s)...</p>
              </div>
            </div>
          )}

          {/* Vista previa de eventos extraídos con éxito */}
          {extractedEvents && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    ¡Se detectaron {extractedEvents.length} bloques con éxito!
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Revisa o elimina antes de guardar</span>
              </div>
              {readBy && <p className="text-[11px] text-slate-500">Leído con {readBy}</p>}
              {warnings.map((warning) => (
                <p key={warning} className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">{warning}</p>
              ))}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {extractedEvents.map((ev) => {
                  const dayObj = DAYS_OF_WEEK.find((d) => d.key === ev.dayOfWeek);
                  const style = eventStyle(ev.type);
                  return (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${style.preview}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${style.badge}`}>
                            {dayObj?.label || ev.dayOfWeek}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {ev.startTime} - {ev.endTime}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white mt-1 truncate">{ev.title}</p>
                        {(ev.location || ev.teacher) && (
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                            {ev.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                {ev.location}
                              </span>
                            )}
                            {ev.teacher && (
                              <span className="flex items-center gap-1 truncate">
                                <User className="w-3 h-3 text-slate-500" />
                                {ev.teacher}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteExtracted(ev.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        title="Descartar este evento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pie de acciones del modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>

          {!extractedEvents ? (
            <button
              type="button"
              disabled={!imagePreview || isAnalyzing}
              onClick={handleStartAnalysis}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analizando con IA...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analizar con IA Gratuita
                </>
              )}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Escanear otra
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSave}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-600/25 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Agregar al Calendario ({extractedEvents.length})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  Settings as SettingsIcon,
  FileText,
  MessageSquareText,
  Send,
  Bot,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK } from '@/lib/schedule-utils';
import { eventStyle } from '@/lib/event-styles';

interface PhotoUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  /** `replaceType`: si se indica, se reemplazan las actividades existentes de ese tipo */
  onEventsExtracted: (newEvents: ScheduleEvent[], replaceType: EventType | null) => void;
  /** Cuántas actividades de cada tipo hay ya guardadas */
  existingCounts: Record<EventType, number>;
  geminiKey?: string;
  groqKey?: string;
  onOpenSettings: () => void;
}

interface ScanMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

const PROVIDER_LABELS: Record<string, string> = { gemini: 'Google Gemini', groq: 'Groq' };

const INSTRUCTION_CHIPS = [
  'Las clases son los cuadros azules; ignora los verdes',
  'Usa la hora escrita dentro de cada cuadro',
  'El código de abajo de cada cuadro va en notas',
  'Revisa todos los días, no te saltes ninguno',
];

const CORRECTION_CHIPS = [
  'Faltan bloques: revisa de nuevo todos los días',
  'Solo cuentan los cuadros azules',
  'Compara con esta lista y corrige: ',
];

const eventKey = (e: ScheduleEvent) => `${e.dayOfWeek}|${e.startTime}|${e.title.toLowerCase()}`;

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  isOpen,
  onClose,
  onEventsExtracted,
  existingCounts,
  geminiKey,
  groqKey,
  onOpenSettings,
}) => {
  const [scheduleType, setScheduleType] = useState<EventType>('university');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [extractedEvents, setExtractedEvents] = useState<ScheduleEvent[] | null>(null);
  const [readBy, setReadBy] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [messages, setMessages] = useState<ScanMessage[]>([]);
  const [correction, setCorrection] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isRefining]);

  if (!isOpen) return null;

  const hasText = scheduleText.trim().length >= 8;
  const canAnalyze = Boolean(imagePreview) || hasText;

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
          setImagePreview(canvas.toDataURL('image/jpeg', 0.9));
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

  const addInstruction = (chip: string) => {
    setInstructions((current) => (current.trim() ? `${current.trim()}\n${chip}` : chip));
  };

  /** Petición común para analizar o corregir */
  const requestSchedule = async (extra: { previous?: ScheduleEvent[]; correction?: string }) => {
    const response = await fetch('/api/analyze-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: imagePreview || undefined,
        text: hasText ? scheduleText : undefined,
        instructions: instructions.trim() || undefined,
        scheduleType,
        geminiKey: geminiKey || undefined,
        groqKey: groqKey || undefined,
        ...extra,
      }),
    });
    const data = await response.json().catch(() => ({ success: false, error: 'El servidor no respondió correctamente. Intenta de nuevo.' }));
    return { ok: response.ok && data.success, data };
  };

  const handleStartAnalysis = async () => {
    if (!canAnalyze) return;

    setIsAnalyzing(true);
    setErrorMsg(null);
    setErrorCode(null);
    setErrorDetail(null);
    setWarnings([]);
    setAnalysisStatus(imagePreview ? 'Preparando la imagen...' : 'Leyendo tu texto...');

    const statusUpdates = imagePreview
      ? [
          'Enviando imagen a la IA...',
          'Recorriendo cada día de la semana...',
          'Leyendo horas y códigos de cada bloque...',
          'Descartando bloques de disponibilidad...',
          'Revisando que no falte nada...',
        ]
      : ['Interpretando días y horas...', 'Ordenando tu semana...'];
    let updateIndex = 0;
    const interval = setInterval(() => {
      if (updateIndex < statusUpdates.length) {
        setAnalysisStatus(statusUpdates[updateIndex]);
        updateIndex++;
      }
    }, 2500);

    try {
      const { ok, data } = await requestSchedule({});
      if (!ok) {
        setErrorCode(data.code || null);
        setErrorDetail(typeof data.detail === 'string' ? data.detail : null);
        throw new Error(data.error || 'No se pudieron extraer los horarios.');
      }

      setExtractedEvents(data.events);
      setReadBy(data.provider ? `${PROVIDER_LABELS[data.provider] || data.provider}${data.model ? ` · ${data.model}` : ''}` : null);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setMessages(data.note ? [{ role: 'assistant', text: data.note }] : []);
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message === 'Failed to fetch' ? 'Sin conexión a internet. Revisa tu red e intenta de nuevo.' : err.message || 'Error al conectar con la IA');
    } finally {
      clearInterval(interval);
      setIsAnalyzing(false);
    }
  };

  /** Chat de corrección: la IA vuelve a revisar con lo que le dices y devuelve la lista completa corregida */
  const handleRefine = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = correction.trim();
    if (!text || !extractedEvents || isRefining) return;

    setCorrection('');
    setMessages((current) => [...current, { role: 'user', text }]);
    setIsRefining(true);

    try {
      const { ok, data } = await requestSchedule({ previous: extractedEvents, correction: text });
      if (!ok) throw new Error(data.error || 'No se pudo aplicar la corrección.');

      const next: ScheduleEvent[] = data.events;
      const before = new Set(extractedEvents.map(eventKey));
      const after = new Set(next.map(eventKey));
      const added = next.filter((ev) => !before.has(eventKey(ev))).length;
      const removed = extractedEvents.filter((ev) => !after.has(eventKey(ev))).length;
      const changes = [added ? `+${added} nuevos` : '', removed ? `−${removed} quitados` : ''].filter(Boolean).join(', ');

      setExtractedEvents(next);
      if (Array.isArray(data.warnings)) setWarnings(data.warnings);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: `${data.note || 'Listo, revisé de nuevo.'} Ahora hay ${next.length} bloques${changes ? ` (${changes})` : ' (sin cambios)'}.`,
        },
      ]);
    } catch (err: any) {
      const message = err?.message === 'Failed to fetch' ? 'Sin conexión a internet.' : err?.message;
      setMessages((current) => [...current, { role: 'assistant', text: `No pude aplicar la corrección: ${message}`, error: true }]);
    } finally {
      setIsRefining(false);
    }
  };

  const pickCorrectionChip = (chip: string) => {
    setCorrection(chip);
    setTimeout(() => {
      const el = correctionRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(chip.length, chip.length);
      }
    }, 0);
  };

  const handleDeleteExtracted = (id: string) => {
    if (!extractedEvents) return;
    setExtractedEvents(extractedEvents.filter((ev) => ev.id !== id));
  };

  const handleConfirmAndSave = () => {
    if (extractedEvents && extractedEvents.length > 0) {
      onEventsExtracted(extractedEvents, replaceExisting && existingCounts[scheduleType] > 0 ? scheduleType : null);
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
    setErrorDetail(null);
    setWarnings([]);
    setReadBy(null);
    setReplaceExisting(false);
    setMessages([]);
    setCorrection('');
    setIsAnalyzing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="photo-uploader-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">

        {/* Cabecera del modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="photo-uploader-title" className="text-base font-bold text-white">Escanear Horario con IA</h2>
              <p className="text-xs text-slate-400">Sube una foto o pega el texto; puedes darle indicaciones a la IA</p>
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
                1. ¿Qué horario vas a subir?
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
                  Universidad
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
                  Trabajo
                </button>
              </div>
            </div>
          )}

          {/* Área de subida o Vista Previa */}
          {!extractedEvents && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                2. Foto o captura del horario{hasText ? ' (opcional)' : ''}
              </label>

              {!imagePreview ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center transition-colors bg-slate-950/30 flex flex-col items-center justify-center gap-3 cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">Arrastra la imagen aquí o toca para elegirla</p>
                    <p className="text-xs text-slate-500 mt-1">Capturas de pantalla, fotos impresas o tomadas con la cámara</p>
                  </div>

                  <div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Horario subido" className="object-contain max-h-64 sm:max-h-72 w-auto" />
                    {isAnalyzing && (
                      <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-scan z-10" />
                    )}
                  </div>
                  <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate max-w-[200px]">{imageFile?.name || 'Foto tomada'}</span>
                    {!isAnalyzing && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                        className="text-red-400 hover:text-red-300 font-medium flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Quitar foto
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Inputs ocultos para archivo y cámara nativa */}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

              {/* Horario en texto */}
              <div className="mt-3">
                {!showText ? (
                  <button
                    type="button"
                    onClick={() => setShowText(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {imagePreview ? 'Agregar la lista en texto para que la IA la compare' : 'O pega / escribe tu horario como texto'}
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="schedule-text" className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Horario en texto {imagePreview ? '(la IA lo comparará con la imagen)' : ''}
                    </label>
                    <textarea
                      id="schedule-text"
                      rows={4}
                      value={scheduleText}
                      onChange={(e) => setScheduleText(e.target.value)}
                      placeholder={'Ej:\nLunes 20:00-21:30 M4L14 (COL13241)\nMartes 18:00-19:00 M1L3\nSábado 9 a 10:30 am M3L10'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-base sm:text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Indicaciones para la IA */}
          {!extractedEvents && (
            <div className="space-y-2">
              <label htmlFor="ai-instructions" className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                <MessageSquareText className="w-3.5 h-3.5 text-amber-400" />
                3. Indicaciones para la IA (opcional)
              </label>
              <textarea
                id="ai-instructions"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={1000}
                placeholder="Ej: mis clases son los cuadros azules, ignora los verdes que dicen Disponible"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
              />
              <div className="flex flex-wrap gap-1.5">
                {INSTRUCTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => addInstruction(chip)}
                    className="text-[11px] rounded-full border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 px-2.5 py-1"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs sm:text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-red-200">No se pudo procesar el horario</p>
                <p className="mt-0.5">{errorMsg}</p>
                {(errorCode === 'NO_KEY' || errorCode === 'INVALID_KEY' || errorCode === 'QUOTA' || errorCode === 'OVERLOADED') && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 border border-slate-700"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    Abrir Ajustes de IA
                  </button>
                )}
                {errorDetail && (
                  <details className="mt-2 text-[11px] text-slate-400">
                    <summary className="cursor-pointer select-none">Detalles técnicos</summary>
                    <p className="mt-1 break-words font-mono">{errorDetail}</p>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Estado de análisis */}
          {isAnalyzing && (
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm flex items-center gap-3" role="status">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-indigo-300">{analysisStatus}</p>
                <p className="text-xs text-slate-400 mt-0.5">{imagePreview ? 'Leer una captura con detalle puede tardar hasta un minuto.' : 'Esto toma unos segundos.'}</p>
              </div>
            </div>
          )}

          {/* Vista previa de eventos extraídos con éxito */}
          {extractedEvents && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Se detectaron {extractedEvents.length} bloques
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Revísalos, elimínalos o pídele correcciones a la IA</span>
              </div>
              {readBy && <p className="text-[11px] text-slate-500">Leído con {readBy}</p>}
              {warnings.map((warning) => (
                <p key={warning} className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">{warning}</p>
              ))}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {extractedEvents.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">La lista quedó vacía. Pídele a la IA que revise de nuevo abajo.</p>
                )}
                {extractedEvents.map((ev) => {
                  const dayObj = DAYS_OF_WEEK.find((d) => d.key === ev.dayOfWeek);
                  const style = eventStyle(ev.type);
                  return (
                    <div key={ev.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${style.preview}`}>
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
                        {(ev.location || ev.teacher || ev.notes) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-1">
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
                            {ev.notes && <span className="truncate font-mono text-[11px] text-slate-500">{ev.notes}</span>}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteExtracted(ev.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        title="Descartar este bloque"
                        aria-label={`Descartar ${ev.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Chat de corrección con la IA */}
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-2.5">
                <p className="text-xs font-semibold text-indigo-200 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-indigo-300" />
                  ¿Algo no quedó bien? Díselo a la IA y lo corrige
                </p>

                {messages.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1" aria-live="polite">
                    {messages.map((msg, index) => (
                      <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <p
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                            msg.role === 'user'
                              ? 'bg-indigo-600 text-white'
                              : msg.error
                              ? 'bg-red-500/10 text-red-200 border border-red-500/20'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          {msg.text}
                        </p>
                      </div>
                    ))}
                    {isRefining && (
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Revisando de nuevo{imagePreview ? ' la imagen' : ''}…
                      </p>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
                {messages.length === 0 && isRefining && (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Revisando de nuevo…
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {CORRECTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => pickCorrectionChip(chip)}
                      disabled={isRefining}
                      className="text-[11px] rounded-full border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 px-2.5 py-1 disabled:opacity-50"
                    >
                      {chip.endsWith(': ') ? chip.slice(0, -2) + '…' : chip}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleRefine} className="flex gap-2 items-end">
                  <textarea
                    ref={correctionRef}
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRefine();
                      }
                    }}
                    rows={2}
                    maxLength={1000}
                    disabled={isRefining}
                    placeholder="Ej: falta el martes 19:15-20:15 M10L38 · o pega aquí la lista correcta"
                    aria-label="Corrección para la IA"
                    className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                  />
                  <button
                    type="submit"
                    disabled={isRefining || !correction.trim()}
                    title="Enviar corrección"
                    aria-label="Enviar corrección"
                    className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 shrink-0"
                  >
                    {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </div>

              {existingCounts[scheduleType] > 0 && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-700 text-xs text-slate-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="mt-0.5 rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>Reemplazar mis {existingCounts[scheduleType]} actividades de {scheduleType === 'work' ? 'Trabajo' : 'Universidad'} actuales</strong>
                    <span className="block text-slate-400 mt-0.5">
                      Márcalo si estás volviendo a escanear el mismo horario (por ejemplo, para corregir uno que quedó mal). Si lo dejas sin marcar, se agregan a las que ya tienes.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Pie de acciones del modal */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-2">
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
              disabled={!canAnalyze || isAnalyzing}
              onClick={handleStartAnalysis}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analizar con IA
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
                Empezar de nuevo
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={extractedEvents.length === 0 || isRefining}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-600/25 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Guardar ({extractedEvents.length})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

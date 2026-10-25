'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Key,
  ExternalLink,
  Save,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  Sparkles,
  Globe,
  Zap,
  Eye,
  EyeOff,
  Loader2,
  XCircle,
  PlugZap,
  ScanLine,
} from 'lucide-react';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { EVENT_TYPES, EVENT_TYPE_STYLES } from '@/lib/event-styles';
import { TIMEZONES } from '@/lib/timezone';
import { sanitizeEvents } from '@/lib/schedule-utils';
import type { AppSettings } from '@/hooks/useAppSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  serverKeys: { gemini: boolean; groq: boolean };
  onLoadDemoData: () => void;
  onClearAllData: () => void;
  onClearType: (type: EventType) => void;
  events: ScheduleEvent[];
  onImportEvents: (events: ScheduleEvent[]) => void;
}

interface ProviderTest {
  ok: boolean;
  model?: string;
  source: 'user' | 'server' | 'none';
  error?: string;
}

const PROVIDERS = [
  {
    id: 'groq' as const,
    name: 'Groq',
    badge: 'Recomendada para el chat',
    description: 'Ultra rápida y con límites gratuitos generosos. Usa modelos abiertos (GPT-OSS de OpenAI y Qwen con visión).',
    placeholder: 'gsk_...',
    url: 'https://console.groq.com/keys',
    linkText: 'Crear clave gratis en console.groq.com',
    accent: 'focus:ring-emerald-500',
    button: 'bg-emerald-600 hover:bg-emerald-500',
    icon: Zap,
    iconColor: 'text-emerald-400',
  },
  {
    id: 'gemini' as const,
    name: 'Google Gemini',
    badge: 'Recomendada para escanear fotos',
    description: 'La mejor leyendo fotos de horarios. La app elige sola el modelo Flash gratuito más nuevo disponible.',
    placeholder: 'AIzaSy...',
    url: 'https://aistudio.google.com/app/apikey',
    linkText: 'Crear clave gratis en Google AI Studio',
    accent: 'focus:ring-indigo-500',
    button: 'bg-indigo-600 hover:bg-indigo-500',
    icon: ScanLine,
    iconColor: 'text-indigo-400',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  serverKeys,
  onLoadDemoData,
  onClearAllData,
  onClearType,
  events,
  onImportEvents,
}) => {
  const [inputs, setInputs] = useState({ gemini: settings.geminiKey, groq: settings.groqKey });
  const [visible, setVisible] = useState({ gemini: false, groq: false });
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [tests, setTests] = useState<{ gemini: ProviderTest; groq: ProviderTest } | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInputs({ gemini: settings.geminiKey, groq: settings.groqKey });
    setTests(null);
    setBackupMessage(null);
  }, [isOpen, settings.geminiKey, settings.groqKey]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const saveKey = (provider: 'gemini' | 'groq') => {
    const value = inputs[provider].trim();
    onUpdateSettings(provider === 'gemini' ? { geminiKey: value } : { groqKey: value });
    setSaved(provider);
    setTests(null);
    setTimeout(() => setSaved(null), 2500);
  };

  const runTest = async () => {
    setTesting(true);
    setTests(null);
    try {
      const response = await fetch('/api/ai/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey: inputs.gemini.trim() || undefined, groqKey: inputs.groq.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo probar la conexión');
      setTests(data);
    } catch (err: any) {
      const error = err?.message || 'Sin conexión';
      setTests({ gemini: { ok: false, source: 'none', error }, groq: { ok: false, source: 'none', error } });
    } finally {
      setTesting(false);
    }
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'mis_horarios_backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const clean = sanitizeEvents(Array.isArray(parsed) ? parsed : parsed?.events);
        if (clean.length === 0) {
          setBackupMessage({ ok: false, text: 'El archivo no contiene actividades válidas.' });
          return;
        }
        onImportEvents(clean);
        setBackupMessage({ ok: true, text: `Se importaron ${clean.length} actividades.` });
      } catch {
        setBackupMessage({ ok: false, text: 'El archivo JSON no es válido.' });
      }
    };
    reader.readAsText(file);
  };

  const hasAnyKey = Boolean(settings.geminiKey || settings.groqKey || serverKeys.gemini || serverKeys.groq);
  const timezoneOptions = TIMEZONES.some((tz) => tz.value === settings.timezone)
    ? TIMEZONES
    : [{ value: settings.timezone, label: `${settings.timezone} (detectada)` }, ...TIMEZONES];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 id="settings-modal-title" className="text-base font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            Ajustes
          </h2>
          <button onClick={onClose} aria-label="Cerrar ajustes" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Inteligencia artificial */}
          <section className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Inteligencia artificial (gratis)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Con una sola clave ya funcionan el escáner y el chat. Si configuras las dos, cuando una se queda sin cuota la app usa la otra automáticamente.
              </p>
              <div className={`mt-2 text-xs rounded-xl px-3 py-2 border ${hasAnyKey ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
                {hasAnyKey ? '✓ IA lista para usar.' : 'Falta configurar al menos una clave. Ambas son gratuitas y no piden tarjeta.'}
                {(serverKeys.gemini || serverKeys.groq) && (
                  <span className="block text-[11px] opacity-80 mt-0.5">
                    El servidor ya tiene clave de {[serverKeys.groq && 'Groq', serverKeys.gemini && 'Gemini'].filter(Boolean).join(' y ')}. Las que pongas aquí tienen prioridad.
                  </span>
                )}
              </div>
            </div>

            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const test = tests?.[provider.id];
              return (
                <div key={provider.id} className="space-y-2 p-3 rounded-xl bg-slate-950/50 border border-slate-800">
                  <label htmlFor={`key-${provider.id}`} className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-200">
                    <Icon className={`w-3.5 h-3.5 ${provider.iconColor}`} />
                    Clave de {provider.name}
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-full">{provider.badge}</span>
                  </label>
                  <p className="text-[11px] text-slate-400">{provider.description}</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveKey(provider.id);
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1 min-w-0">
                      <input
                        id={`key-${provider.id}`}
                        type={visible[provider.id] ? 'text' : 'password'}
                        value={inputs[provider.id]}
                        onChange={(e) => setInputs((current) => ({ ...current, [provider.id]: e.target.value }))}
                        placeholder={provider.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-3.5 pr-9 py-2 text-base sm:text-sm text-white font-mono focus:outline-none focus:ring-2 ${provider.accent}`}
                      />
                      <button
                        type="button"
                        onClick={() => setVisible((current) => ({ ...current, [provider.id]: !current[provider.id] }))}
                        aria-label={visible[provider.id] ? 'Ocultar clave' : 'Mostrar clave'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                      >
                        {visible[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button type="submit" className={`${provider.button} text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0`}>
                      <Save className="w-3.5 h-3.5" />
                      Guardar
                    </button>
                  </form>
                  {saved === provider.id && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Clave guardada en este dispositivo.
                    </p>
                  )}
                  {test && (
                    <p className={`text-xs flex items-start gap-1.5 ${test.ok ? 'text-emerald-400' : test.source === 'none' ? 'text-slate-500' : 'text-red-300'}`}>
                      {test.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                      <span>
                        {test.ok
                          ? `Funciona (${test.source === 'server' ? 'clave del servidor' : 'tu clave'}) · modelo ${test.model}`
                          : test.source === 'none'
                          ? 'Sin clave configurada.'
                          : test.error}
                      </span>
                    </p>
                  )}
                  <a href={provider.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 text-xs ${provider.iconColor} hover:underline`}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {provider.linkText}
                  </a>
                </div>
              );
            })}

            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4 text-amber-400" />}
              {testing ? 'Probando conexión con las IAs...' : 'Probar conexión'}
            </button>
          </section>

          <hr className="border-slate-800" />

          {/* Zona Horaria */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Zona horaria
            </h3>
            <p className="text-xs text-slate-400">Se usa para enviar los avisos a la hora correcta y para el calendario del celular.</p>
            <select
              value={settings.timezone}
              onChange={(e) => onUpdateSettings({ timezone: e.target.value })}
              aria-label="Zona horaria"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </section>

          <hr className="border-slate-800" />

          {/* Cargar datos de prueba */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Probar con horario de ejemplo</h3>
            <p className="text-xs text-slate-400">Carga un horario de prueba con clases de ingeniería y turnos de trabajo (reemplaza el actual).</p>
            <button
              type="button"
              onClick={() => {
                if (events.length === 0 || confirm('Esto reemplazará tu horario actual por el de ejemplo. ¿Continuar?')) {
                  onLoadDemoData();
                  onClose();
                }
              }}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Cargar horario de demostración
            </button>
          </section>

          <hr className="border-slate-800" />

          {/* Copia de Seguridad */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Copia de seguridad</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar JSON ({events.length} eventos)
              </button>

              <label className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Importar JSON
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportJSON} />
              </label>
            </div>
            {backupMessage && <p className={`text-xs ${backupMessage.ok ? 'text-emerald-400' : 'text-red-300'}`}>{backupMessage.text}</p>}
          </section>

          <hr className="border-slate-800" />

          {/* Borrar todo */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Zona de peligro</h3>
            <p className="text-xs text-slate-400">Borrar solo un tipo de actividad (útil si un escaneo quedó mal):</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => {
                const count = events.filter((e) => e.type === type).length;
                const style = EVENT_TYPE_STYLES[type];
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={count === 0}
                    onClick={() => {
                      if (confirm(`¿Borrar tus ${count} actividades de ${style.label}?`)) {
                        onClearType(type);
                        onClose();
                      }
                    }}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-red-500/15 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    {style.label} ({count})
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Seguro que deseas borrar todos los eventos del calendario?')) {
                  onClearAllData();
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Borrar todos los horarios
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

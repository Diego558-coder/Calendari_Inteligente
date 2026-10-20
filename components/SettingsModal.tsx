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
  HelpCircle,
  Globe,
  Zap
} from 'lucide-react';
import { ScheduleEvent } from '@/types/schedule';
import { TIMEZONES } from '@/lib/timezone';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  groqKey: string;
  onSaveGroqKey: (key: string) => void;
  onLoadDemoData: () => void;
  onClearAllData: () => void;
  events: ScheduleEvent[];
  onImportEvents: (events: ScheduleEvent[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  groqKey,
  onSaveGroqKey,
  onLoadDemoData,
  onClearAllData,
  events,
  onImportEvents,
}) => {
  const [inputKey, setInputKey] = useState(apiKey);
  const [inputGroqKey, setInputGroqKey] = useState(groqKey);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [savedGroqSuccess, setSavedGroqSuccess] = useState(false);

  useEffect(() => {
    setInputKey(apiKey);
    setInputGroqKey(groqKey);
  }, [apiKey, groqKey, isOpen]);

  if (!isOpen) return null;

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(inputKey.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSaveGroqKey = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveGroqKey(inputGroqKey.trim());
    setSavedGroqSuccess(true);
    setTimeout(() => setSavedGroqSuccess(false), 3000);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'mis_horarios_backup.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportEvents(parsed);
          alert(`¡Se importaron ${parsed.length} eventos exitosamente!`);
        }
      } catch (err) {
        alert('El archivo JSON no es válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 id="settings-modal-title" className="text-base font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            Ajustes y Clave de Gemini IA
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          
          {/* Sección de Gemini API Key */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Clave de API de Google Gemini (Gratis)
              </label>
              <p className="text-xs text-slate-400">
                Para escanear tus horarios directamente con el modelo de visión de Gemini. Si no se configura en el servidor, puedes colocarla aquí y se guardará en tu dispositivo.
              </p>
            </div>

            <form onSubmit={handleSaveKey} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
              </div>

              {savedSuccess && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Clave guardada correctamente.
                </p>
              )}
            </form>

            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Obtén tu clave gratis en Google AI Studio (sin tarjeta de crédito)
            </a>
          </div>

          <hr className="border-slate-800" />

          {/* Sección de Groq API Key (para Chat IA - Llama 3.1 70B) */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-green-400" />
                Clave de API de Groq (Gratis - Recomendado para Chat)
              </label>
              <p className="text-xs text-slate-400">
                Para el asistente de agenda (chat). Groq usa Llama 3.1 70B: <strong>ultra-rápido</strong>, 14,400 req/día gratis, mejor razonamiento que Gemini Flash.
              </p>
            </div>

            <form onSubmit={handleSaveGroqKey} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputGroqKey}
                  onChange={(e) => setInputGroqKey(e.target.value)}
                  placeholder="gsk_..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
              </div>

              {savedGroqSuccess && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Clave Groq guardada correctamente.
                </p>
              )}
            </form>

            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Obtén tu clave gratis en Groq Console (sin tarjeta de crédito)
            </a>
          </div>

          <hr className="border-slate-800" />

          {/* Cargar datos de prueba */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Probar con Horario de Ejemplo
            </h3>
            <p className="text-xs text-slate-400">
              ¿Quieres ver cómo funciona la app de inmediato? Carga un horario de prueba con clases de ingeniería y turnos de trabajo.
            </p>
            <button
              type="button"
              onClick={() => {
                onLoadDemoData();
                onClose();
              }}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Cargar Horario de Demostración
            </button>
          </div>

          <hr className="border-slate-800" />

          {/* Copia de Seguridad */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Copia de Seguridad
            </h3>
            <div className="flex gap-2">
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
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportJSON}
                />
              </label>
            </div>
          </div>

          <hr className="border-slate-800" />

          {/* Zona Horaria */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Zona Horaria
            </h3>
            <p className="text-xs text-slate-400">
              Define tu zona horaria para que las alarmas y el archivo .ics se generen con la hora correcta.
            </p>
            <select
              defaultValue={typeof window !== 'undefined' ? localStorage.getItem('userTimezone') || 'America/Bogota' : 'America/Bogota'}
              onChange={(e) => { localStorage.setItem('userTimezone', e.target.value); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          <hr className="border-slate-800" />

          {/* Borrar todo */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
              Zona de Peligro
            </h3>
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Estás seguro de que deseas borrar todos los eventos del calendario?')) {
                  onClearAllData();
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Borrar todos los horarios
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};


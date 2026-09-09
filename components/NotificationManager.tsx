'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { generateICS } from '@/lib/schedule-utils';
import { 
  Download, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Copy, 
  RefreshCw, 
  Zap,
  Smartphone,
  Info,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface NotificationManagerProps {
  events: ScheduleEvent[];
}

interface SubscriberStatus {
  enrolled: boolean;
  lastPing: number | null;
  userAgent: string | null;
}

const STORAGE_KEY_SYNC_ID = 'mihorario_sync_id_v1';

export const NotificationManager: React.FC<NotificationManagerProps> = ({ events }) => {
  const [alarmMinutes, setAlarmMinutes] = useState<number>(60);
  const [syncId, setSyncId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [originUrl, setOriginUrl] = useState<string>('');
  const [subscriberStatus, setSubscriberStatus] = useState<SubscriberStatus | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.host);
      const savedId = localStorage.getItem(STORAGE_KEY_SYNC_ID);
      if (savedId) setSyncId(savedId);
    }
  }, []);

  // Consultar estado de inscripción del dispositivo
  const checkSubscriberStatus = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/calendar/status/${id}`);
      if (res.ok) {
        const data: SubscriberStatus = await res.json();
        setSubscriberStatus(data);
      }
    } catch (e) {
      console.warn('Error verificando suscriptores:', e);
    }
  }, []);

  // Sincronizar automáticamente los eventos con el feed de la nube para iPhone
  const syncWithCloudFeed = useCallback(async (forcedEvents?: ScheduleEvent[]) => {
    const listToSync = forcedEvents || events;
    if (listToSync.length === 0) return;

    setIsSyncing(true);
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_SYNC_ID) || undefined;
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncId: savedId,
          events: listToSync,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.syncId) {
          setSyncId(data.syncId);
          localStorage.setItem(STORAGE_KEY_SYNC_ID, data.syncId);
          checkSubscriberStatus(data.syncId);
        }
      }
    } catch (e) {
      console.warn('Error sincronizando feed con la nube:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [events, checkSubscriberStatus]);

  // Sincronizar cuando cambien los eventos
  useEffect(() => {
    if (events.length > 0) {
      syncWithCloudFeed(events);
    }
  }, [events, syncWithCloudFeed]);

  // Verificar estado del suscriptor periódicamente
  useEffect(() => {
    if (syncId) {
      checkSubscriberStatus(syncId);
      const interval = setInterval(() => checkSubscriberStatus(syncId), 15000);
      return () => clearInterval(interval);
    }
  }, [syncId, checkSubscriberStatus]);

  const webcalUrl = syncId && originUrl ? `webcal://${originUrl}/api/calendar/feed/${syncId}` : '';
  const httpsFeedUrl = syncId && originUrl ? `https://${originUrl}/api/calendar/feed/${syncId}` : '';

  // Suscribirse directamente en Apple Calendar (dispara la app nativa de iOS)
  const handleAppleCalendarSubscribe = () => {
    if (!webcalUrl) {
      syncWithCloudFeed().then(() => {
        if (webcalUrl) window.location.href = webcalUrl;
      });
      return;
    }
    confetti({ particleCount: 70, spread: 60 });
    window.location.href = webcalUrl;
  };

  const handleCopyLink = () => {
    if (!httpsFeedUrl) return;
    navigator.clipboard.writeText(httpsFeedUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    });
  };

  // Descargar el archivo .ics manual tradicional
  const downloadICSFile = () => {
    if (events.length === 0) {
      alert('Primero debes agregar o escanear tus horarios.');
      return;
    }

    const icsContent = generateICS(events, alarmMinutes);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MiHorario_Alarma_${alarmMinutes}min.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    confetti({ particleCount: 50, spread: 60 });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* 🏆 TARJETA ESTRELLA: SUSCRIPCIÓN EN VIVO APPLE CALENDAR */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border-2 border-indigo-500/40 shadow-2xl relative overflow-hidden">
        
        {/* Glow de fondo */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Sincronización Automática en Vivo (iPhone / Apple Calendar)
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 pt-1">
              Suscripción a Apple Calendar
            </h2>
            
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              <strong>Olvídate de descargar archivos:</strong> Tu iPhone se conecta a este calendario y <span className="text-amber-300 font-semibold">se actualiza solo en segundo plano</span> cada vez que agregues o cambies un horario, con tu alarma de <strong>1 hora antes</strong>.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={handleAppleCalendarSubscribe}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-600/30 transition-all transform active:scale-95 disabled:opacity-50"
            >
              <Calendar className="w-5 h-5 text-indigo-200" />
              Suscribirme en mi iPhone
            </button>

            {syncId && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
              >
                {copiedLink ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">¡Enlace Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Enlace de Suscripción
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 📊 PANEL DE ESTADO: ¿HAY DISPOSITIVO INSCRITO? */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              subscriberStatus?.enrolled
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {subscriberStatus?.enrolled ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Smartphone className="w-5 h-5 animate-pulse" />
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-white flex items-center gap-2">
                Estado del Dispositivo:
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  subscriberStatus?.enrolled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {subscriberStatus?.enrolled ? '✓ DISPOSITIVO CONECTADO' : 'PENDIENTE DE CONEXIÓN'}
                </span>
              </p>

              <p className="text-[11px] text-slate-400 mt-0.5">
                {subscriberStatus?.enrolled ? (
                  <>
                    Tu iPhone ya está sincronizado. Última comprobación:{' '}
                    <strong className="text-slate-200">
                      {subscriberStatus.lastPing ? new Date(subscriberStatus.lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Reciente'}
                    </strong>
                  </>
                ) : (
                  'Aún no se ha detectado ningún iPhone suscrito. Toca "Suscribirme en mi iPhone" desde Safari.'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={() => syncId && checkSubscriberStatus(syncId)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Comprobar ahora
          </button>
        </div>

        {/* Pasos sencillos */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-indigo-400">Paso 1:</span>
            <p className="text-slate-300 mt-1">Abre este enlace desde <strong>Safari</strong> en tu iPhone.</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-indigo-400">Paso 2:</span>
            <p className="text-slate-300 mt-1">Toca el botón morado <strong>"Suscribirme en mi iPhone"</strong>.</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="font-bold text-indigo-400">Paso 3:</span>
            <p className="text-slate-300 mt-1">En la ventana de iOS, pulsa <strong>"Suscribirse"</strong> y luego <strong>"Añadir"</strong>.</p>
          </div>
        </div>
      </div>

      {/* Opción Secundaria: Descarga de archivo .ics manual */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-indigo-400" />
              Descarga Manual Tradicional (.ics)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Si prefieres guardar una copia fija de tus horarios sin suscripción automática
            </p>

            <div className="mt-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-300 font-medium">Anticipación de la alarma:</span>
              <select
                value={alarmMinutes}
                onChange={(e) => setAlarmMinutes(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes (Predeterminada)</option>
                <option value={120}>2 horas antes</option>
              </select>
            </div>
          </div>

          <button
            onClick={downloadICSFile}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar archivo .ics
          </button>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { generateICS } from '@/lib/schedule-utils';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  RefreshCw,
  Smartphone,
  Zap,
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
  const [alarmMinutes, setAlarmMinutes] = useState(60);
  const [syncId, setSyncId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [originUrl, setOriginUrl] = useState('');
  const [subscriberStatus, setSubscriberStatus] = useState<SubscriberStatus | null>(null);

  useEffect(() => {
    setOriginUrl(window.location.host);
    const savedId = localStorage.getItem(STORAGE_KEY_SYNC_ID);
    if (savedId) setSyncId(savedId);
  }, []);

  const checkSubscriberStatus = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/calendar/status/${id}`);
      if (response.ok) setSubscriberStatus(await response.json());
    } catch (error) {
      console.warn('Error verificando suscriptores:', error);
    }
  }, []);

  const syncWithCloudFeed = useCallback(async (forcedEvents?: ScheduleEvent[]): Promise<string | null> => {
    const eventsToSync = forcedEvents || events;
    if (eventsToSync.length === 0) return null;

    setIsSyncing(true);
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_SYNC_ID) || undefined;
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncId: savedId, events: eventsToSync }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.syncId) {
          setSyncId(data.syncId);
          localStorage.setItem(STORAGE_KEY_SYNC_ID, data.syncId);
          checkSubscriberStatus(data.syncId);
          return data.syncId;
        }
      }
    } catch (error) {
      console.warn('Error sincronizando feed con la nube:', error);
    } finally {
      setIsSyncing(false);
    }
    return null;
  }, [checkSubscriberStatus, events]);

  useEffect(() => {
    if (events.length > 0) syncWithCloudFeed(events);
  }, [events, syncWithCloudFeed]);

  useEffect(() => {
    if (!syncId) return;
    checkSubscriberStatus(syncId);
    const interval = setInterval(() => checkSubscriberStatus(syncId), 15000);
    return () => clearInterval(interval);
  }, [checkSubscriberStatus, syncId]);

  const webcalUrl = syncId && originUrl ? `webcal://${originUrl}/api/calendar/feed/${syncId}` : '';
  const httpsFeedUrl = syncId && originUrl ? `https://${originUrl}/api/calendar/feed/${syncId}` : '';

  const handleSubscribe = async () => {
    if (!webcalUrl) {
      const newSyncId = await syncWithCloudFeed();
      if (newSyncId && originUrl) {
        confetti({ particleCount: 70, spread: 60 });
        window.location.href = `webcal://${originUrl}/api/calendar/feed/${newSyncId}`;
      }
      return;
    }
    confetti({ particleCount: 70, spread: 60 });
    window.location.href = webcalUrl;
  };

  const handleCopyLink = async () => {
    if (!httpsFeedUrl) return;
    await navigator.clipboard.writeText(httpsFeedUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const downloadICSFile = () => {
    if (events.length === 0) {
      alert('Primero debes agregar o escanear tus horarios.');
      return;
    }
    const blob = new Blob([generateICS(events, alarmMinutes)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MiHorario_Alarma_${alarmMinutes}min.ics`;
    link.click();
    URL.revokeObjectURL(url);
    confetti({ particleCount: 50, spread: 60 });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border-2 border-indigo-500/40 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Sincronización Automática en Vivo (iPhone / Apple Calendar)
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white pt-1">Suscripción a Apple Calendar</h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              <strong>Olvídate de descargar archivos:</strong> Tu iPhone se conecta a este calendario y <span className="text-amber-300 font-semibold">se actualiza solo en segundo plano</span> cada vez que agregues o cambies un horario, con tu alarma de <strong>1 hora antes</strong>.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={handleSubscribe} disabled={isSyncing || events.length === 0} className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50">
              {isSyncing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5 text-indigo-200" />}
              {isSyncing ? 'Preparando...' : 'Suscribirme en mi iPhone'}
            </button>
            {syncId && <button type="button" onClick={handleCopyLink} className="flex items-center justify-center gap-1.5 bg-slate-800/80 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700">
              {copiedLink ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> ¡Enlace Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar Enlace de Suscripción</>}
            </button>}
          </div>
        </div>

        <div className="mt-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${subscriberStatus?.enrolled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}`}>
              {subscriberStatus?.enrolled ? <CheckCircle2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5 animate-pulse" />}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Estado del Dispositivo: <span className="text-slate-300">{subscriberStatus?.enrolled ? 'DISPOSITIVO CONECTADO' : 'PENDIENTE DE CONEXIÓN'}</span></p>
              <p className="text-[11px] text-slate-400 mt-0.5">{subscriberStatus?.enrolled ? 'Tu iPhone ya está sincronizado.' : 'Aún no se ha detectado ningún iPhone suscrito.'}</p>
            </div>
          </div>
          <button onClick={() => syncId && checkSubscriberStatus(syncId)} className="text-[11px] text-indigo-400 flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 shrink-0">
            <RefreshCw className="w-3 h-3" /> Comprobar ahora
          </button>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2"><Download className="w-4 h-4 text-indigo-400" /> Descarga Manual Tradicional (.ics)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Si prefieres guardar una copia fija de tus horarios sin suscripción automática</p>
            <div className="mt-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-300 font-medium">Anticipación de la alarma:</span>
              <select value={alarmMinutes} onChange={(event) => setAlarmMinutes(Number(event.target.value))} className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold">
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes (Predeterminada)</option>
                <option value={120}>2 horas antes</option>
              </select>
            </div>
          </div>
          <button onClick={downloadICSFile} className="flex items-center justify-center gap-2 bg-slate-800 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 shrink-0">
            <Download className="w-3.5 h-3.5" /> Descargar archivo .ics
          </button>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  RefreshCw,
  Smartphone,
  Zap,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateICSEvents } from '@/lib/ics-generator';
import { SubscribeModal } from './SubscribeModal';

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
  const [subscriberStatus, setSubscriberStatus] = useState<{ enrolled: boolean; lastPing: number | null; userAgent: string | null } | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState<boolean>(false);
  const [subscribeUrl, setSubscribeUrl] = useState<string>('');

  useEffect(() => {
    setOriginUrl(window.location.host);
    const savedId = localStorage.getItem('mihorario_sync_id_v1');
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

  const syncWithCloudFeed = useCallback(async (forcedEvents?: any[]): Promise<string | null> => {
    const eventsToSync = forcedEvents || events;
    if (eventsToSync.length === 0) return null;

    setIsSyncing(true);
    try {
      const savedId = localStorage.getItem('mihorario_sync_id_v1') || undefined;
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncId: savedId, events: eventsToSync }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.syncId) {
          setSyncId(data.syncId);
          localStorage.setItem('mihorario_sync_id_v1', data.syncId);
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

  const httpsFeedUrl = syncId && originUrl ? `https://${originUrl}/api/calendar/feed/${syncId}` : '';

  const handleDownloadICS = useCallback(() => {
    if (events.length === 0) {
      alert('Primero debes agregar o escanear tus horarios.');
      return;
    }
    const icsContent = generateICSEvents(events, alarmMinutes);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MiHorario_Alarma_${alarmMinutes}min.ics`;
    link.click();
    URL.revokeObjectURL(url);
    confetti({ particleCount: 50, spread: 60 });
  }, [events, alarmMinutes]);

  const handleCopyLink = useCallback(async () => {
    if (!httpsFeedUrl) return;
    await navigator.clipboard.writeText(httpsFeedUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  }, [httpsFeedUrl]);

  const handleSubscribe = useCallback(async () => {
    let targetUrl = httpsFeedUrl;
    
    if (!targetUrl) {
      const newSyncId = await syncWithCloudFeed();
      if (!newSyncId || !originUrl) return;
      targetUrl = `https://${originUrl}/api/calendar/feed/${newSyncId}`;
    }
    
    confetti({ particleCount: 70, spread: 60 });
    
    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isIOSPWA = isIOS && window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIOSPWA) {
      setSubscribeUrl(targetUrl);
      setShowSubscribeModal(true);
      
      try {
        await navigator.clipboard.writeText(targetUrl);
      } catch {}
      
      try {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } catch {}
    } else {
      window.location.href = targetUrl;
    }
  }, [httpsFeedUrl, originUrl, syncWithCloudFeed]);

  useEffect(() => {
    if (events.length > 0) syncWithCloudFeed(events);
  }, [events, syncWithCloudFeed]);

  useEffect(() => {
    if (!syncId) return;
    checkSubscriberStatus(syncId);
    const interval = setInterval(() => checkSubscriberStatus(syncId), 15000);
    return () => clearInterval(interval);
  }, [checkSubscriberStatus, syncId]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border-2 border-indigo-500/40 shadow-2xl relative overflow-hidden" role="region" aria-labelledby="notifications-title">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Sincronización Automática en Vivo (iPhone / Apple Calendar)
            </div>
            <h2 id="notifications-title" className="text-xl sm:text-2xl font-black text-white pt-1">Suscripción a Apple Calendar</h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              <strong>Olvídate de descargar archivos:</strong> Tu iPhone se conecta a este calendario y <span className="text-amber-300 font-semibold">se actualiza solo en segundo plano</span> cada vez que agregues o cambies un horario, con tu alarma de <strong>1 hora antes</strong>.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={handleSubscribe} disabled={isSyncing || events.length === 0} className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white px-6 py-3.5 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50">
              {isSyncing ? 'Preparando...' : 'Suscribirme en mi iPhone'}
            </button>
            {syncId && <button type="button" onClick={async () => {
              if (!httpsFeedUrl) return;
              await navigator.clipboard.writeText(httpsFeedUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 3000);
            }} className="flex items-center justify-center gap-1.5 bg-slate-800/80 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700">
              {copiedLink ? '¡Enlace Copiado!' : 'Copiar Enlace de Suscripción'}
            </button>}
          </div>
        </div>

        <div className="mt-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${false ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}`}>
              {false ? '✓' : '📱'}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Estado del Dispositivo: <span className="text-slate-300">PENDIENTE DE CONEXIÓN</span></p>
              <p className="text-[11px] text-slate-400 mt-0.5">Aún no se ha detectado ningún iPhone suscrito.</p>
            </div>
          </div>
          <button onClick={() => { if (syncId) checkSubscriberStatus(syncId); }} className="text-[11px] text-indigo-400 flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 shrink-0">
            Comprobar ahora
          </button>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/50 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-white flex items-center gap-1.5">
            ¿Cómo suscribirse en iPhone / iPad?
          </p>
          <ol className="space-y-1 pl-4 list-decimal text-[11px]">
            <li>Pulsa <strong>"Suscribirme en mi iPhone"</strong> arriba. Se abrirá Safari.</li>
            <li>En Safari, pulsa <strong>"Suscribir"</strong> en el diálogo que aparece.</li>
            <li>Confirma en <strong>"Añadir a calendario existente"</strong> o crea uno nuevo.</li>
            <li>¡Listo! Tus horarios se actualizarán solos cada hora con alarmas.</li>
          </ol>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={async () => {
              if (!httpsFeedUrl) return;
              await navigator.clipboard.writeText(httpsFeedUrl);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 3000);
            }} className="flex items-center gap-1.5 bg-slate-800/80 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-slate-700 hover:bg-slate-700 transition-colors">
              {false ? '¡Copiado!' : 'Copiar enlace https://'}
            </button>
            <span className="text-[10px] text-slate-500">Pégalo en Ajustes → Calendario → Cuentas → Añadir calendario suscrito</span>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">Descarga Manual Tradicional (.ics)</h3>
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
          <button onClick={() => {
            if (events.length === 0) {
              alert('Primero debes agregar o escanear tus horarios.');
              return;
            }
            const icsContent = generateICSEvents(events, alarmMinutes);
            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `MiHorario_Alarma_${alarmMinutes}min.ics`;
            link.click();
            URL.revokeObjectURL(url);
            confetti({ particleCount: 50, spread: 60 });
          }} className="flex items-center justify-center gap-2 bg-slate-800 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 shrink-0">
            Descargar archivo .ics
          </button>
        </div>
      </div>

      <SubscribeModal 
        isOpen={showSubscribeModal} 
        onClose={() => setShowSubscribeModal(false)} 
        subscribeUrl={subscribeUrl} 
        onCopyLink={() => { navigator.clipboard.writeText(subscribeUrl); }} 
      />
    </div>
  );
};
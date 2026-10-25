'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import {
  AlertTriangle,
  Apple,
  BellOff,
  BellRing,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Info,
  Link2,
  Loader2,
  PlusSquare,
  QrCode,
  RefreshCw,
  Send,
  Share,
  Smartphone,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { formatLeadTime, generateICS } from '@/lib/schedule-utils';
import { isAndroid, isIOS, isStandalone } from '@/lib/push-client';
import type { CloudSync } from '@/hooks/useCloudSync';
import type { PushNotifications } from '@/hooks/usePushNotifications';
import { SubscribeModal } from './SubscribeModal';

interface NotificationManagerProps {
  events: ScheduleEvent[];
  alarmMinutes: number;
  timezone: string;
  onChangeAlarmMinutes: (minutes: number) => void;
  cloud: CloudSync;
  push: PushNotifications;
}

interface FeedStatus {
  enrolled: boolean;
  lastPing: number | null;
  client: string | null;
  pushDevices?: number;
}

const ALARM_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120];

function timeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Respaldo para navegadores sin API de portapapeles (http, webviews)
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  }, []);
  return { copied, copy };
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({ events, alarmMinutes, timezone, onChangeAlarmMinutes, cloud, push }) => {
  const [device, setDevice] = useState<{ ios: boolean; android: boolean; standalone: boolean }>({ ios: false, android: false, standalone: false });
  const [feedStatus, setFeedStatus] = useState<FeedStatus | null>(null);
  const [checkingFeed, setCheckingFeed] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const { copied, copy } = useCopy();

  useEffect(() => {
    setDevice({ ios: isIOS(), android: isAndroid(), standalone: isStandalone() });
  }, []);

  const profileId = cloud.mode === 'live' ? cloud.credentials.profileId : undefined;

  const checkFeedStatus = useCallback(async () => {
    if (!profileId) return;
    setCheckingFeed(true);
    try {
      const response = await fetch(`/api/calendar/status/${profileId}`);
      if (response.ok) setFeedStatus(await response.json());
    } catch {
      // sin conexión: se reintenta en el siguiente ciclo
    } finally {
      setCheckingFeed(false);
    }
  }, [profileId]);

  // Revisar cada minuto si el calendario del celular ya se conectó (solo con la pestaña visible)
  useEffect(() => {
    if (!profileId) return;
    checkFeedStatus();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') checkFeedStatus();
    }, 60_000);
    return () => clearInterval(interval);
  }, [profileId, checkFeedStatus]);

  // Generar el QR solo cuando se pide (la librería se carga bajo demanda)
  useEffect(() => {
    if (!showQr || !cloud.urls?.linkUrl) return;
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toDataURL(cloud.urls!.linkUrl, { margin: 1, width: 240, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [showQr, cloud.urls]);

  const handleAppleSubscribe = async () => {
    const urls = await cloud.ensureUrls();
    if (!urls) return;
    confetti({ particleCount: 60, spread: 60 });
    if (device.ios && device.standalone) {
      // Dentro de la app instalada iOS no abre enlaces webcal: hay que hacerlo desde Safari
      setShowSubscribeModal(true);
      copy(urls.webcalUrl, 'webcal');
    } else {
      window.location.href = urls.webcalUrl;
    }
  };

  const handleGoogleSubscribe = async () => {
    // Abrir la pestaña de inmediato (dentro del clic) para que el navegador no la bloquee
    const tab = window.open('', '_blank');
    const urls = await cloud.ensureUrls();
    if (!urls) {
      tab?.close();
      return;
    }
    if (tab) tab.location.href = urls.googleUrl;
    else window.location.href = urls.googleUrl;
  };

  const handleDownloadICS = () => {
    if (events.length === 0) return;
    const icsContent = generateICS(events, { alarmMinutes, timezone });
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MiHorario_aviso_${alarmMinutes}min.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    confetti({ particleCount: 50, spread: 60 });
  };

  const noEvents = events.length === 0;
  const pushState = push.state;
  const scheduled = Boolean(push.config?.scheduled);

  const statusChip = {
    loading: { text: 'Comprobando…', className: 'bg-slate-800 text-slate-300 border-slate-700' },
    on: { text: 'Activadas · también con la app cerrada', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
    local: { text: 'Activadas · solo con la app abierta', className: 'bg-amber-500/15 text-amber-200 border-amber-500/40' },
    off: { text: 'Desactivadas', className: 'bg-slate-800 text-slate-300 border-slate-700' },
    denied: { text: 'Bloqueadas por el navegador', className: 'bg-red-500/15 text-red-300 border-red-500/40' },
    unsupported: { text: 'No disponibles aquí', className: 'bg-slate-800 text-slate-300 border-slate-700' },
  }[pushState];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {noEvents && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 flex items-start gap-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          Primero agrega o escanea tus horarios: los avisos se crean a partir de tus actividades.
        </div>
      )}

      {/* 1. Notificaciones push */}
      <section className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border-2 border-indigo-500/40 shadow-2xl relative overflow-hidden" aria-labelledby="push-title">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 id="push-title" className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <BellRing className="w-6 h-6 text-amber-400" />
                Notificaciones en este dispositivo
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                Te llega un aviso <strong className="text-amber-300">{formatLeadTime(alarmMinutes)} antes</strong> de cada clase, turno o actividad.
              </p>
            </div>
            <span className={`self-start text-[11px] font-bold px-3 py-1 rounded-full border ${statusChip.className}`}>{statusChip.text}</span>
          </div>

          {/* Instrucciones según el dispositivo */}
          {pushState === 'unsupported' && !push.support.ok && push.support.reason === 'ios-install' && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-2">
              <p className="font-semibold text-white flex items-center gap-1.5"><Apple className="w-4 h-4" /> En iPhone, primero instala la app (es gratis y toma 10 segundos):</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Abre esta página en <strong>Safari</strong>.</li>
                <li>Toca <strong>Compartir</strong> <Share className="inline w-3.5 h-3.5" /> y elige <strong>“Agregar a pantalla de inicio”</strong> <PlusSquare className="inline w-3.5 h-3.5" />.</li>
                <li>Abre <strong>MiHorario</strong> desde el ícono nuevo y vuelve a esta pestaña para activar los avisos.</li>
              </ol>
              <p className="text-slate-500">Apple solo permite notificaciones web en apps instaladas (iOS 16.4 o superior).</p>
            </div>
          )}
          {pushState === 'unsupported' && !push.support.ok && push.support.reason === 'insecure' && (
            <p className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              Las notificaciones solo funcionan con conexión segura. Abre la app desde su enlace <strong>https://</strong> (por ejemplo tu dirección de Vercel), no desde una IP local con http.
            </p>
          )}
          {pushState === 'unsupported' && !push.support.ok && push.support.reason === 'ios-old' && (
            <p className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              Tu iPhone necesita iOS 16.4 o superior para recibir notificaciones web. Mientras tanto, usa la suscripción al calendario de abajo: sus alarmas funcionan en cualquier versión.
            </p>
          )}
          {pushState === 'unsupported' && !push.support.ok && push.support.reason === 'unsupported' && (
            <p className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300">
              Este navegador no soporta notificaciones. Usa Chrome, Edge, Firefox o Safari, o suscríbete al calendario de abajo.
            </p>
          )}
          {pushState === 'denied' && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 space-y-1">
              <p className="font-semibold">Las notificaciones están bloqueadas para este sitio.</p>
              <p>
                {device.android
                  ? 'En Android: mantén presionado el ícono de la app (o toca el candado junto a la dirección en Chrome) → Permisos / Notificaciones → Permitir.'
                  : device.ios
                  ? 'En iPhone: Ajustes → Notificaciones → MiHorario → Permitir notificaciones.'
                  : 'Toca el candado junto a la dirección del sitio → Notificaciones → Permitir, y recarga la página.'}
              </p>
            </div>
          )}

          {(pushState === 'off' || pushState === 'on' || pushState === 'local' || pushState === 'loading') && (
            <div className="flex flex-wrap gap-2">
              {(pushState === 'off' || pushState === 'loading') && (
                <button
                  onClick={push.enable}
                  disabled={push.busy || pushState === 'loading'}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-60"
                >
                  {push.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                  Activar notificaciones
                </button>
              )}
              {(pushState === 'on' || pushState === 'local') && (
                <>
                  <button
                    onClick={push.sendTest}
                    disabled={push.busy}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-60"
                  >
                    {push.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar notificación de prueba
                  </button>
                  {pushState === 'local' && push.config?.publicKey && !push.subscription && (
                    <button onClick={push.enable} disabled={push.busy} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700">
                      <RefreshCw className="w-4 h-4" /> Reintentar activación completa
                    </button>
                  )}
                  {push.subscription && (
                    <button onClick={push.disable} disabled={push.busy} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700">
                      <BellOff className="w-4 h-4" /> Desactivar
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {push.message && (
            <p
              role="status"
              className={`text-xs rounded-xl px-3 py-2 border ${
                push.message.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : push.message.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300'
              }`}
            >
              {push.message.text}
            </p>
          )}

          {pushState !== 'unsupported' && !scheduled && push.config && (
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              El servidor aún no tiene base de datos, así que los avisos solo llegan con la app abierta. Para recibirlos con la app cerrada, conecta Upstash Redis gratis en Vercel (instrucciones en el README).
            </p>
          )}
          {pushState === 'on' && device.android && !device.standalone && (
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Consejo: instala la app (menú ⋮ de Chrome → “Instalar aplicación”) para tenerla a mano y que Android no limite sus avisos.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <label htmlFor="alarm-minutes" className="text-xs text-slate-300 font-medium">Avisarme</label>
            <select
              id="alarm-minutes"
              value={alarmMinutes}
              onChange={(event) => onChangeAlarmMinutes(Number(event.target.value))}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold"
            >
              {ALARM_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatLeadTime(minutes)} antes{minutes === 60 ? ' (recomendado)' : ''}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">Aplica a notificaciones y a las alarmas del calendario.</span>
          </div>
        </div>
      </section>

      {/* 2. Calendario nativo del celular */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4" aria-labelledby="calendar-sub-title">
        <div>
          <h3 id="calendar-sub-title" className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Alarmas en el calendario de tu celular
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Suscribe el calendario de tu teléfono a tu horario: las alarmas las da el propio celular, incluso sin internet, y {cloud.mode === 'static' ? 'tienen' : 'se actualizan solas cuando cambias algo aquí'}.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleAppleSubscribe}
            disabled={noEvents}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
              device.ios || !device.android ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Apple className="w-4 h-4" />
            Suscribirme en iPhone / Mac
          </button>
          <button
            onClick={handleGoogleSubscribe}
            disabled={noEvents}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
              device.android ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Agregar a Google Calendar
          </button>
          {cloud.urls && (
            <button
              onClick={() => copy(cloud.urls!.feedUrl, 'feed')}
              className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700"
            >
              <Copy className="w-4 h-4" />
              {copied === 'feed' ? '¡Enlace copiado!' : 'Copiar enlace'}
            </button>
          )}
        </div>

        {/* Estado de la sincronización y del calendario conectado */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${feedStatus?.enrolled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              {feedStatus?.enrolled ? <CheckCircle2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
            </div>
            <div className="space-y-0.5">
              {cloud.mode === 'live' ? (
                feedStatus?.enrolled ? (
                  <>
                    <p className="font-bold text-white">Calendario conectado: {feedStatus.client}</p>
                    <p className="text-slate-400">Última actualización {feedStatus.lastPing ? timeAgo(feedStatus.lastPing) : 'reciente'}. Los cambios llegan solos (Apple revisa cada ~1 h; Google puede tardar varias horas).</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-white">Ningún calendario conectado todavía</p>
                    <p className="text-slate-400">Cuando te suscribas, aquí verás la confirmación.</p>
                  </>
                )
              ) : cloud.mode === 'static' ? (
                <>
                  <p className="font-bold text-white">Enlace de copia fija</p>
                  <p className="text-slate-400">El servidor no tiene base de datos: si cambias tu horario, vuelve a suscribirte con el nuevo enlace.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white">{cloud.status === 'error' ? 'No se pudo preparar tu enlace' : 'Preparando tu enlace…'}</p>
                  <p className="text-slate-400">{cloud.status === 'error' ? cloud.error : 'Guardando tu horario de forma segura.'}</p>
                </>
              )}
            </div>
          </div>
          {cloud.mode === 'live' ? (
            <button onClick={checkFeedStatus} className="self-start sm:self-center text-[11px] text-indigo-300 flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 shrink-0">
              <RefreshCw className={`w-3 h-3 ${checkingFeed ? 'animate-spin' : ''}`} /> Comprobar
            </button>
          ) : cloud.status === 'error' ? (
            <button onClick={() => cloud.syncNow()} className="self-start sm:self-center text-[11px] text-indigo-300 flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-indigo-500/10 shrink-0">
              <RefreshCw className="w-3 h-3" /> Reintentar
            </button>
          ) : null}
        </div>

        <details className="text-xs text-slate-400 group">
          <summary className="cursor-pointer text-slate-300 font-semibold select-none">¿Cómo suscribirme paso a paso?</summary>
          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <p className="font-semibold text-white flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" /> iPhone / iPad / Mac</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Toca “Suscribirme en iPhone / Mac”.</li>
                <li>En el aviso, toca <strong>Suscribirse</strong> y luego <strong>Añadir</strong>.</li>
                <li>Si no se abre: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito, y pega el enlace.</li>
              </ol>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <p className="font-semibold text-white flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Android / Google Calendar</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Toca “Agregar a Google Calendar” e inicia sesión si lo pide.</li>
                <li>Confirma con <strong>Agregar</strong>. El calendario aparecerá en tu celular en unos minutos.</li>
                <li>Google usa sus propios recordatorios en calendarios suscritos: para avisos exactos usa las notificaciones de arriba.</li>
              </ol>
            </div>
          </div>
        </details>
      </section>

      {/* 3. Otro dispositivo */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3" aria-labelledby="link-device-title">
        <div>
          <h3 id="link-device-title" className="text-base font-bold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-400" />
            Usar tu horario en el celular
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {cloud.mode === 'live'
              ? '¿Armaste tu horario en el computador? Abre este enlace (o escanea el QR) en tu celular: tendrás el mismo horario sincronizado y podrás activar allí las notificaciones.'
              : 'Abre este enlace en otro dispositivo para importar una copia de tu horario.'}
          </p>
        </div>
        {cloud.urls ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copy(cloud.urls!.linkUrl, 'link')}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-semibold"
              >
                <Copy className="w-4 h-4" />
                {copied === 'link' ? '¡Enlace copiado!' : 'Copiar enlace para mi celular'}
              </button>
              <button
                onClick={() => setShowQr((value) => !value)}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700"
              >
                <QrCode className="w-4 h-4" />
                {showQr ? 'Ocultar QR' : 'Mostrar código QR'}
              </button>
            </div>
            {showQr && (
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Código QR para abrir tu horario en el celular" width={180} height={180} className="rounded-xl bg-white p-1" />
                ) : (
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                )}
                <p className="text-xs text-slate-400">Apunta la cámara de tu celular al código y abre el enlace. Después instala la app y activa las notificaciones.</p>
              </div>
            )}
            <p className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Este enlace da acceso para ver y editar tu horario: compártelo solo contigo.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">{noEvents ? 'Agrega actividades para generar tu enlace.' : 'Generando enlace…'}</p>
        )}
      </section>

      {/* 4. Descarga manual */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-slate-400" />
              Descargar archivo .ics
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Copia fija para importar en cualquier calendario (Outlook, Samsung, etc.), con alarma {formatLeadTime(alarmMinutes)} antes.</p>
          </div>
          <button
            onClick={handleDownloadICS}
            disabled={noEvents}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 shrink-0 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Descargar .ics
          </button>
        </div>
      </section>

      <SubscribeModal
        isOpen={showSubscribeModal}
        onClose={() => setShowSubscribeModal(false)}
        subscribeUrl={cloud.urls?.webcalUrl || ''}
        copied={copied === 'webcal'}
        onCopyLink={() => cloud.urls && copy(cloud.urls.webcalUrl, 'webcal')}
      />
    </div>
  );
};

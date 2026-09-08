'use client';

import React, { useState, useEffect } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { generateICS } from '@/lib/schedule-utils';
import { 
  Bell, 
  Download, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Volume2, 
  Clock, 
  Share2, 
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface NotificationManagerProps {
  events: ScheduleEvent[];
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({ events }) => {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [alarmMinutes, setAlarmMinutes] = useState<number>(60);
  const [testSent, setTestSent] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      setIsSupported(true);
    } else {
      setIsSupported(false);
    }
  }, []);

  // Solicitar permiso de notificaciones en el celular / navegador
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Las notificaciones no están soportadas en este navegador.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);

      if (perm === 'granted') {
        confetti({ particleCount: 50, spread: 60 });
        sendTestNotification();
      }
    } catch (e) {
      console.error('Error al pedir permiso:', e);
    }
  };

  // Enviar una notificación de prueba instantánea
  const sendTestNotification = () => {
    if (notificationPermission !== 'granted') return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification('🔔 Recordatorio de MiHorario IA', {
          body: `¡Tu notificación está lista! Te avisaremos ${alarmMinutes} minutos antes de cada clase o turno.`,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [200, 100, 200],
        } as any);
      });
    } else {
      new Notification('🔔 Recordatorio de MiHorario IA', {
        body: `¡Tu notificación está lista! Te avisaremos ${alarmMinutes} minutos antes de cada clase o turno.`,
        icon: '/icon.svg',
      });
    }

    setTestSent(true);
    setTimeout(() => setTestSent(false), 5000);
  };

  // Descargar el archivo .ics para el calendario del celular con alarma de 1 hora
  const downloadICSFile = () => {
    if (events.length === 0) {
      alert('Primero debes agregar o escanear tus horarios de universidad o trabajo.');
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

    confetti({ particleCount: 70, spread: 60 });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Tarjeta Principal: Sincronización con Celular */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900/30 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/40">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Avisos y Alarmas en tu Celular</h2>
                <p className="text-xs text-slate-400">Recibe recordatorios con alarma en tu teléfono antes de cada actividad</p>
              </div>
            </div>

            {/* Selector de tiempo de aviso */}
            <div className="mt-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-slate-300">Avisarme con anticipación de:</span>
              <select
                value={alarmMinutes}
                onChange={(e) => setAlarmMinutes(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes (Recomendado)</option>
                <option value={120}>2 horas antes</option>
              </select>
            </div>
          </div>

          {/* Botón Descargar para Calendario Móvil */}
          <button
            onClick={downloadICSFile}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4" />
            Descargar Calendario con Alarma (.ics)
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Al abrir este archivo en tu celular (Google Calendar, Samsung Calendar o Apple Calendar), tus clases y turnos se sincronizarán con <strong>alarma automática de {alarmMinutes} minutos antes</strong>.
          </span>
        </div>
      </div>

      {/* Tarjeta de Notificaciones Web Push PWA */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Notificaciones Web en el Navegador</h3>
              <p className="text-xs text-slate-400">Notificaciones directas mientras navegas o con la app instalada</p>
            </div>
          </div>

          {/* Estado del permiso */}
          <span
            className={`text-xs px-3 py-1 rounded-full font-semibold border ${
              notificationPermission === 'granted'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : notificationPermission === 'denied'
                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {notificationPermission === 'granted'
              ? '✓ Activadas'
              : notificationPermission === 'denied'
              ? '✗ Bloqueadas'
              : 'Pendientes'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {notificationPermission !== 'granted' ? (
            <button
              onClick={requestPermission}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md shadow-indigo-600/20"
            >
              <Bell className="w-4 h-4" />
              Permitir Notificaciones en este Dispositivo
            </button>
          ) : (
            <button
              onClick={sendTestNotification}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-700 transition-colors"
            >
              <Volume2 className="w-4 h-4 text-emerald-400" />
              Enviar Alarma de Prueba al Celular
            </button>
          )}

          {testSent && (
            <span className="text-xs text-emerald-400 font-medium animate-fade-in flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              ¡Notificación enviada! Revisa la barra de estado de tu teléfono.
            </span>
          )}
        </div>
      </div>

      {/* Guía Paso a Paso para Instalar en el Celular (PWA 100% Gratis) */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          Cómo tener la App instalada en tu Celular (Android y iPhone)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          
          {/* Android */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <p className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              En Celulares Android (Google Chrome):
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>Abre el enlace de tu app en <strong>Chrome</strong>.</li>
              <li>Toca el botón de opciones <strong>(los 3 puntos arriba a la derecha)</strong>.</li>
              <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong>.</li>
              <li>¡Listo! Aparecerá el icono de la app en tu pantalla con acceso directo y soporte de notificaciones.</li>
            </ol>
          </div>

          {/* iPhone / iOS */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <p className="font-bold text-indigo-400 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              En iPhones (Apple Safari):
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
              <li>Abre la app en el navegador <strong>Safari</strong>.</li>
              <li>Toca el botón de <strong>Compartir</strong> (el cuadrado con flecha hacia arriba abajo en la pantalla).</li>
              <li>Desliza hacia abajo y pulsa <strong>"Añadir a la pantalla de inicio"</strong>.</li>
              <li>Presiona <strong>"Añadir"</strong> en la esquina superior.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};


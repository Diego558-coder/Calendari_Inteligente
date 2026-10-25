'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { DailyAgendaView } from '@/components/DailyAgendaView';
import { FreeTimeSummary } from '@/components/FreeTimeSummary';
import { NotificationManager } from '@/components/NotificationManager';
import { PhotoUploader } from '@/components/PhotoUploader';
import { EventModal } from '@/components/EventModal';
import { SettingsModal } from '@/components/SettingsModal';
import { ScheduleChat } from '@/components/ScheduleChat';
import { DayOfWeek, ScheduleEvent } from '@/types/schedule';
import {
  calculateFreeTimeSlots,
  calculateStats,
  detectConflicts,
  isSameActivity,
  sanitizeEvents,
} from '@/lib/schedule-utils';
import { DEMO_EVENTS } from '@/lib/demo-data';
import {
  Sparkles,
  Camera,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  BellRing,
  Link2,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEvents } from '@/hooks/useEvents';
import { useAppSettings } from '@/hooks/useAppSettings';
import { RemoteSchedule, useCloudSync } from '@/hooks/useCloudSync';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNotificationMonitor } from '@/hooks/useNotificationMonitor';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const TABS: ActiveTab[] = ['calendar', 'agenda', 'free-time', 'notifications'];

type PendingLink =
  | { kind: 'link'; profileId: string; writeKey: string }
  | { kind: 'import'; token: string };

interface Toast {
  id: number;
  type: 'ok' | 'error';
  text: string;
  /** Estado anterior para el botón "Deshacer" */
  undo?: ScheduleEvent[];
}

export default function HomePage() {
  const { events, updatedAt, isLoaded: eventsLoaded, updateEvents, modifyEvents } = useEvents();
  const { settings, updateSettings, isLoaded: settingsLoaded } = useAppSettings();
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const [serverKeys, setServerKeys] = useState({ gemini: false, groq: false });

  // Modales
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [slotToAdd, setSlotToAdd] = useState<{ day: DayOfWeek; startTime: string } | null>(null);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [linking, setLinking] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast['type'], text: string, undo?: ScheduleEvent[]) => {
    const id = Date.now();
    setToast({ id, type, text, undo });
    setTimeout(() => setToast((current) => (current?.id === id ? null : current)), undo ? 9000 : 4500);
  }, []);

  // Cambios hechos en otro dispositivo vinculado
  const handleRemoteChange = useCallback((remote: RemoteSchedule) => {
    updateEvents(sanitizeEvents(remote.events), remote.updatedAt);
    const patch: Record<string, unknown> = {};
    if (typeof remote.alarmMinutes === 'number') patch.alarmMinutes = remote.alarmMinutes;
    if (typeof remote.timezone === 'string') patch.timezone = remote.timezone;
    if (Object.keys(patch).length) updateSettings(patch);
  }, [updateEvents, updateSettings]);

  const cloud = useCloudSync({
    events,
    updatedAt,
    timezone: settings.timezone,
    alarmMinutes: settings.alarmMinutes,
    ready: eventsLoaded && settingsLoaded,
    onRemoteChange: handleRemoteChange,
  });
  const push = usePushNotifications(cloud);

  // Avisos con la app abierta cuando el servidor no puede enviar push programado
  useNotificationMonitor(events, settings.alarmMinutes, settings.timezone, push.state === 'local');

  // Claves de IA configuradas en el servidor (variables de entorno)
  useEffect(() => {
    fetch('/api/ai/status')
      .then((response) => response.json())
      .then((data) => data?.server && setServerKeys(data.server))
      .catch(() => {});
  }, []);

  // Accesos directos del manifest (?tab=… / ?action=scan) y enlaces de vinculación (#vincular=… / #importar=…)
  useEffect(() => {
    const readUrl = () => {
      const url = new URL(window.location.href);
      const tab = url.searchParams.get('tab') as ActiveTab | null;
      if (tab && TABS.includes(tab)) setActiveTab(tab);
      if (url.searchParams.get('action') === 'scan') setIsUploadOpen(true);

      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const link = hash.get('vincular');
      const token = hash.get('importar');
      if (link && link.includes('.')) {
        const [profileId, writeKey] = link.split('.');
        setPendingLink({ kind: 'link', profileId, writeKey });
      } else if (token) {
        setPendingLink({ kind: 'import', token });
      }

      if (url.search || url.hash) window.history.replaceState(null, '', url.pathname);
    };

    readUrl();
    // Si la app ya estaba abierta y solo cambia el fragmento (#vincular=…), no hay recarga
    window.addEventListener('hashchange', readUrl);
    return () => window.removeEventListener('hashchange', readUrl);
  }, []);

  const confirmLink = async () => {
    if (!pendingLink) return;
    setLinking(true);
    try {
      if (pendingLink.kind === 'link') {
        const remote = await cloud.linkProfile(pendingLink.profileId, pendingLink.writeKey);
        handleRemoteChange(remote);
        showToast('ok', `¡Dispositivo vinculado! Tienes ${remote.events.length} actividades sincronizadas.`);
        setActiveTab('notifications');
      } else {
        const remote = await cloud.readImportToken(pendingLink.token);
        await updateEvents(sanitizeEvents(remote.events));
        showToast('ok', `Se importaron ${remote.events.length} actividades.`);
      }
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      setPendingLink(null);
    } catch (err: any) {
      showToast('error', err?.message || 'No se pudo usar el enlace.');
    } finally {
      setLinking(false);
    }
  };

  // Cálculos reactivos de conflictos, horas libres y métricas (memoizados para rendimiento)
  const conflicts = useMemo(() => detectConflicts(events), [events]);
  const freeSlots = useMemo(() => calculateFreeTimeSlots(events), [events]);
  const stats = useMemo(() => calculateStats(events, freeSlots, conflicts), [events, freeSlots, conflicts]);

  // Manejadores de eventos
  const handleEventsExtracted = useCallback((extractedList: ScheduleEvent[], replaceType: ScheduleEvent['type'] | null) => {
    let added = 0;
    let removed = 0;
    const before = events;
    modifyEvents((current) => {
      const kept = replaceType ? current.filter((ev) => ev.type !== replaceType) : current;
      removed = current.length - kept.length;
      const fresh = extractedList.filter((ev) => !kept.some((existing) => isSameActivity(existing, ev)));
      added = fresh.length;
      return [...kept, ...fresh];
    });
    const skipped = extractedList.length - added;
    showToast(
      'ok',
      replaceType
        ? `Listo: se reemplazaron ${removed} actividades por las ${added} nuevas.`
        : `Se agregaron ${added} actividades${skipped > 0 ? ` (${skipped} ya estaban y se omitieron)` : ''}.`,
      before
    );
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
  }, [events, modifyEvents, showToast]);

  const existingCounts = useMemo(() => ({
    university: events.filter((e) => e.type === 'university').length,
    work: events.filter((e) => e.type === 'work').length,
    personal: events.filter((e) => e.type === 'personal').length,
  }), [events]);

  const handleSaveEvent = useCallback((savedEv: ScheduleEvent) => {
    modifyEvents((current) =>
      current.some((e) => e.id === savedEv.id)
        ? current.map((e) => (e.id === savedEv.id ? savedEv : e))
        : [...current, savedEv]
    );
  }, [modifyEvents]);

  const handleDeleteEvent = useCallback((id: string) => {
    modifyEvents((current) => current.filter((e) => e.id !== id));
  }, [modifyEvents]);

  const openNewEvent = useCallback((day?: DayOfWeek, startTime?: string) => {
    setSelectedEvent(null);
    setSlotToAdd(day ? { day, startTime: startTime || '09:00' } : null);
    setIsEventModalOpen(true);
  }, []);

  const openEvent = useCallback((ev: ScheduleEvent) => {
    setSelectedEvent(ev);
    setIsEventModalOpen(true);
  }, []);

  const loadDemo = useCallback(() => {
    updateEvents(DEMO_EVENTS);
    showToast('ok', 'Horario de ejemplo cargado. Puedes borrarlo desde Ajustes.');
  }, [updateEvents, showToast]);

  useKeyboardShortcuts(
    () => openNewEvent(),
    () => setIsUploadOpen(true),
    () => setIsSettingsOpen(true),
    () => setActiveTab('agenda')
  );

  const aiReady = Boolean(settings.geminiKey || settings.groqKey || serverKeys.gemini || serverKeys.groq);
  const isReady = eventsLoaded && settingsLoaded;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Navbar con pestañas y accesos directos */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stats={{ freeHours: stats.freeHours }}
        notificationsPending={events.length > 0 && push.state === 'off'}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {!isReady && (
          <div className="py-24 flex justify-center" aria-busy="true" aria-label="Cargando tu horario">
            <div className="w-10 h-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          </div>
        )}

        {/* Banner de Bienvenida si no hay eventos */}
        {isReady && events.length === 0 && (
          <div className="mb-6 p-8 rounded-3xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 text-center shadow-2xl relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/40">
              <Camera className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Organiza tu Horario Universitario y Laboral con IA
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto mt-2">
              Sube una foto de tu horario de clases o de tu trabajo. La IA extraerá las horas, te mostrará tus momentos libres y te avisará al celular antes de cada actividad.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 transition-all"
              >
                <Camera className="w-4 h-4" />
                Subir Foto de Horario
              </button>
              <button
                onClick={() => openNewEvent()}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-semibold border border-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar a mano
              </button>
              <button
                onClick={loadDemo}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-semibold border border-slate-700 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Ver un ejemplo
              </button>
            </div>
            {!aiReady && (
              <p className="text-xs text-amber-300/90 mt-5">
                Para escanear fotos y usar el chat, configura una clave gratuita de IA en{' '}
                <button onClick={() => setIsSettingsOpen(true)} className="underline underline-offset-2 font-semibold">⚙️ Ajustes</button>.
              </p>
            )}
          </div>
        )}

        {/* Recordatorio para activar avisos */}
        {isReady && events.length > 0 && push.state === 'off' && activeTab !== 'notifications' && (
          <button
            onClick={() => setActiveTab('notifications')}
            className="mb-4 w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-left text-xs text-indigo-200 hover:bg-indigo-500/15 transition-colors"
          >
            <span className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
              Activa las notificaciones para que tu celular te avise antes de cada clase o turno.
            </span>
            <span className="font-semibold shrink-0">Activar →</span>
          </button>
        )}

        {/* Pestaña: Calendario Semanal */}
        {isReady && activeTab === 'calendar' && (
          <div className="space-y-4" role="tabpanel" id="calendar-panel" aria-labelledby="tab-calendar">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-indigo-400" />
                  Calendario Semanal Integrado
                </h2>
                <p className="text-xs text-slate-400">
                  Visualiza tus clases universitarias y turnos laborales en un solo lugar
                </p>
              </div>

              <button
                onClick={() => openNewEvent()}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Añadir Actividad</span>
                <span className="sm:hidden">Añadir</span>
              </button>
            </div>

            <WeeklyCalendar
              events={events}
              conflicts={conflicts}
              freeSlots={freeSlots}
              onSelectEvent={openEvent}
              onAddEventAtSlot={openNewEvent}
            />
          </div>
        )}

        {/* Pestaña: Agenda Diaria */}
        {isReady && activeTab === 'agenda' && (
          <div className="space-y-4" role="tabpanel" id="agenda-panel" aria-labelledby="tab-agenda">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Agenda y Línea de Tiempo Diaria
              </h2>
              <p className="text-xs text-slate-400">
                Detalle cronológico de tus actividades y tiempos de descanso
              </p>
            </div>

            <DailyAgendaView
              events={events}
              freeSlots={freeSlots}
              conflicts={conflicts}
              onSelectEvent={openEvent}
              onAddEvent={(day) => openNewEvent(day, '09:00')}
            />
          </div>
        )}

        {/* Pestaña: Horas Libres y Análisis */}
        {isReady && activeTab === 'free-time' && (
          <div className="space-y-4" role="tabpanel" id="freetime-panel" aria-labelledby="tab-freetime">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Análisis Inteligente de Horas Libres
              </h2>
              <p className="text-xs text-slate-400">
                Descubre tus momentos disponibles en la semana para estudiar, hacer deporte o descansar
              </p>
            </div>

            <FreeTimeSummary
              stats={stats}
              freeSlots={freeSlots}
              conflicts={conflicts}
              events={events}
            />
          </div>
        )}

        {/* Pestaña: Notificaciones y Celular */}
        {isReady && activeTab === 'notifications' && (
          <div className="space-y-4" role="tabpanel" id="notifications-panel" aria-labelledby="tab-notifications">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <BellRing className="w-5 h-5 text-indigo-400" />
                Notificaciones y Alertas al Celular
              </h2>
              <p className="text-xs text-slate-400">
                Recibe un aviso en tu teléfono antes de cada clase o turno
              </p>
            </div>

            <NotificationManager
              events={events}
              alarmMinutes={settings.alarmMinutes}
              timezone={settings.timezone}
              onChangeAlarmMinutes={(alarmMinutes) => updateSettings({ alarmMinutes })}
              cloud={cloud}
              push={push}
            />
          </div>
        )}
      </main>

      {/* Pie de página */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>MiHorario IA • IA gratuita con Google Gemini y Groq</p>
          <p className="hidden sm:block">
            Atajos: <kbd className="text-slate-400">N</kbd> nueva actividad · <kbd className="text-slate-400">U</kbd> escanear · <kbd className="text-slate-400">T</kbd> agenda de hoy
          </p>
        </div>
      </footer>

      {/* Modal para Subir y Analizar Foto de Horario */}
      <PhotoUploader
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onEventsExtracted={handleEventsExtracted}
        existingCounts={existingCounts}
        geminiKey={settings.geminiKey}
        groqKey={settings.groqKey}
        onOpenSettings={() => {
          setIsUploadOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* Modal para Crear o Editar Evento */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setSelectedEvent(null);
          setSlotToAdd(null);
        }}
        event={selectedEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialDay={slotToAdd?.day}
        initialStartTime={slotToAdd?.startTime}
        timezone={settings.timezone}
      />

      {/* Modal de Ajustes */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
        serverKeys={serverKeys}
        onLoadDemoData={loadDemo}
        onClearAllData={() => updateEvents([])}
        onClearType={(type) => {
          const before = events;
          const count = events.filter((e) => e.type === type).length;
          updateEvents(events.filter((e) => e.type !== type));
          showToast('ok', `Se borraron ${count} actividades.`, before);
        }}
        events={events}
        onImportEvents={(imported) => updateEvents(imported)}
      />

      <ScheduleChat
        events={events}
        geminiKey={settings.geminiKey}
        groqKey={settings.groqKey}
        timezone={settings.timezone}
        aiReady={aiReady}
        onApplyEvents={updateEvents}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Confirmación de enlace de vinculación / importación */}
      {pendingLink && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="link-title">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Link2 className="w-6 h-6" />
            </div>
            <h2 id="link-title" className="text-lg font-bold text-white">
              {pendingLink.kind === 'link' ? '¿Usar tu horario en este dispositivo?' : '¿Importar este horario?'}
            </h2>
            <p className="text-sm text-slate-400">
              {pendingLink.kind === 'link'
                ? 'Este dispositivo quedará sincronizado con tu horario: los cambios que hagas aquí o en el otro equipo aparecerán en ambos.'
                : 'Se reemplazarán las actividades de este dispositivo por las del enlace.'}
              {events.length > 0 && ' Las actividades que hay ahora en este dispositivo se reemplazarán.'}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingLink(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800">
                Cancelar
              </button>
              <button
                onClick={confirmLink}
                disabled={linking}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-semibold"
              >
                {linking ? 'Vinculando…' : pendingLink.kind === 'link' ? 'Vincular' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso breve (toast) */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)]" role="status" aria-live="polite">
          <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-2xl border ${toast.type === 'ok' ? 'bg-emerald-950 border-emerald-500/40 text-emerald-100' : 'bg-red-950 border-red-500/40 text-red-100'}`}>
            {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="flex-1">{toast.text}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  updateEvents(toast.undo!);
                  setToast(null);
                }}
                className="font-semibold underline underline-offset-2 shrink-0"
              >
                Deshacer
              </button>
            )}
            <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

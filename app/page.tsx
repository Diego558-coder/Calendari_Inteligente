'use client';

import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from '@/components/Navbar';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { DailyAgendaView } from '@/components/DailyAgendaView';
import { FreeTimeSummary } from '@/components/FreeTimeSummary';
import { NotificationManager } from '@/components/NotificationManager';
import { PhotoUploader } from '@/components/PhotoUploader';
import { EventModal } from '@/components/EventModal';
import { SettingsModal } from '@/components/SettingsModal';
import { DayOfWeek, ScheduleEvent } from '@/types/schedule';
import { 
  calculateFreeTimeSlots, 
  calculateStats, 
  DAYS_OF_WEEK, 
  detectConflicts, 
  timeToMinutes 
} from '@/lib/schedule-utils';
import { DEMO_EVENTS } from '@/lib/demo-data';
import { 
  Sparkles, 
  Camera, 
  Calendar as CalendarIcon, 
  GraduationCap, 
  Briefcase, 
  Clock, 
  CheckCircle2, 
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';

const STORAGE_KEY_EVENTS = 'mihorario_events_v1';
const STORAGE_KEY_APIKEY = 'mihorario_gemini_key_v1';

export default function HomePage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('calendar');
  const [userApiKey, setUserApiKey] = useState<string>('');
  
  // Modales
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [slotToAdd, setSlotToAdd] = useState<{ day: DayOfWeek; startTime: string } | null>(null);

  // Cargar datos de LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
      if (savedEvents) {
        try {
          const parsed = JSON.parse(savedEvents);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEvents(parsed);
          } else {
            // Cargar datos demo por defecto para que la app luzca lista y viva
            setEvents(DEMO_EVENTS);
          }
        } catch {
          setEvents(DEMO_EVENTS);
        }
      } else {
        setEvents(DEMO_EVENTS);
      }

      const savedKey = localStorage.getItem(STORAGE_KEY_APIKEY);
      if (savedKey) setUserApiKey(savedKey);
    }
  }, []);

  // Guardar en LocalStorage cada vez que cambien los eventos
  const updateEvents = (newEvents: ScheduleEvent[]) => {
    setEvents(newEvents);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(newEvents));
    }
  };

  const handleSaveApiKey = (key: string) => {
    setUserApiKey(key);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_APIKEY, key);
    }
  };

  // Cálculos reactivos de conflictos, horas libres y métricas
  const conflicts = detectConflicts(events);
  const freeSlots = calculateFreeTimeSlots(events);
  const stats = calculateStats(events, freeSlots, conflicts);

  // Monitor en segundo plano para notificar 1 hora antes
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const notifiedTodayKey = `notified_events_${new Date().toDateString()}`;
    let notifiedIds: string[] = [];
    try {
      notifiedIds = JSON.parse(sessionStorage.getItem(notifiedTodayKey) || '[]');
    } catch {}

    const checkUpcoming = () => {
      const now = new Date();
      const currentDayIdx = (now.getDay() + 6) % 7;
      const currentDayKey = DAYS_OF_WEEK[currentDayIdx]?.key;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      events
        .filter((e) => e.dayOfWeek === currentDayKey)
        .forEach((e) => {
          const startMin = timeToMinutes(e.startTime);
          const diff = startMin - currentMinutes;

          // Avisar si la actividad empieza en los próximos 60 minutos (entre 45 y 60 min)
          if (diff > 0 && diff <= 60 && !notifiedIds.includes(e.id)) {
            const isUni = e.type === 'university';
            const title = `🔔 En ${diff} min: ${e.title}`;
            const body = `${isUni ? 'Clase universitaria' : 'Turno laboral'} de ${e.startTime} a ${e.endTime}${
              e.location ? ` en ${e.location}` : ''
            }.`;

            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, {
                  body,
                  icon: '/icon.svg',
                  badge: '/icon.svg',
                } as any);
              });
            } else {
              new Notification(title, { body, icon: '/icon.svg' });
            }

            notifiedIds.push(e.id);
            sessionStorage.setItem(notifiedTodayKey, JSON.stringify(notifiedIds));
          }
        });
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 60000); // Revisar cada minuto
    return () => clearInterval(interval);
  }, [events]);

  // Manejadores de eventos
  const handleEventsExtracted = (extractedList: ScheduleEvent[]) => {
    updateEvents([...events, ...extractedList]);
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
  };

  const handleSaveEvent = (savedEv: ScheduleEvent) => {
    const exists = events.some((e) => e.id === savedEv.id);
    if (exists) {
      updateEvents(events.map((e) => (e.id === savedEv.id ? savedEv : e)));
    } else {
      updateEvents([...events, savedEv]);
    }
  };

  const handleDeleteEvent = (id: string) => {
    updateEvents(events.filter((e) => e.id !== id));
  };

  const handleAddAtSlot = (day: DayOfWeek, startTime: string) => {
    setSelectedEvent(null);
    setSlotToAdd({ day, startTime });
    setIsEventModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      
      {/* Navbar con pestañas y accesos directos */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        stats={{
          universityCount: events.filter((e) => e.type === 'university').length,
          workCount: events.filter((e) => e.type === 'work').length,
          freeHours: stats.freeHours,
          hasConflicts: conflicts.length > 0,
        }}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Banner de Bienvenida si no hay eventos */}
        {events.length === 0 && (
          <div className="mb-6 p-8 rounded-3xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/30 text-center shadow-2xl relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-500/40">
              <Camera className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Organiza tu Horario Universitario y Laboral con IA
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto mt-2">
              Sube una foto de tu horario de clases o de tu trabajo. La IA de Google Gemini extraerá las horas, te mostrará tus momentos libres y te avisará a tu celular 1 hora antes.
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
                onClick={() => updateEvents(DEMO_EVENTS)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-3 rounded-xl text-sm font-semibold border border-slate-700 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Cargar Horario de Ejemplo
              </button>
            </div>
          </div>
        )}

        {/* Pestaña: Calendario Semanal */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
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
                onClick={() => {
                  setSelectedEvent(null);
                  setSlotToAdd(null);
                  setIsEventModalOpen(true);
                }}
                className="hidden sm:flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Añadir Actividad
              </button>
            </div>

            <WeeklyCalendar
              events={events}
              conflicts={conflicts}
              freeSlots={freeSlots}
              onSelectEvent={(ev) => {
                setSelectedEvent(ev);
                setIsEventModalOpen(true);
              }}
              onAddEventAtSlot={handleAddAtSlot}
            />
          </div>
        )}

        {/* Pestaña: Agenda Diaria */}
        {activeTab === 'agenda' && (
          <div className="space-y-4">
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
              onSelectEvent={(ev) => {
                setSelectedEvent(ev);
                setIsEventModalOpen(true);
              }}
              onAddEvent={(day) => {
                setSelectedEvent(null);
                setSlotToAdd({ day, startTime: '09:00' });
                setIsEventModalOpen(true);
              }}
            />
          </div>
        )}

        {/* Pestaña: Horas Libres y Análisis */}
        {activeTab === 'free-time' && (
          <div className="space-y-4">
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
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Notificaciones y Alertas al Celular
              </h2>
              <p className="text-xs text-slate-400">
                Sincroniza tus horarios con tu teléfono para que te suenen alarmas 1 hora antes
              </p>
            </div>

            <NotificationManager events={events} />
          </div>
        )}
      </main>

      {/* Pie de página con créditos e información de hosting gratuito */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            MiHorario IA • Organizado con Google Gemini Flash (Gratis)
          </p>
          <p>
            Listo para alojar gratis en <strong className="text-slate-400">Vercel</strong> o <strong className="text-slate-400">Render</strong>
          </p>
        </div>
      </footer>

      {/* Modal para Subir y Analizar Foto de Horario */}
      <PhotoUploader
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onEventsExtracted={handleEventsExtracted}
        userApiKey={userApiKey}
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
      />

      {/* Modal de Ajustes */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={userApiKey}
        onSaveApiKey={handleSaveApiKey}
        onLoadDemoData={() => updateEvents(DEMO_EVENTS)}
        onClearAllData={() => updateEvents([])}
        events={events}
        onImportEvents={(imported) => updateEvents(imported)}
      />
    </div>
  );
}


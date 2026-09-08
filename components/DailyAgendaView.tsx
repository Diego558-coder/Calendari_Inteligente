'use client';

import React, { useState } from 'react';
import { DayOfWeek, FreeTimeSlot, ScheduleConflict, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, timeToMinutes } from '@/lib/schedule-utils';
import { 
  Clock, 
  GraduationCap, 
  Briefcase, 
  Sparkles, 
  MapPin, 
  User, 
  AlertTriangle, 
  Plus,
  Calendar
} from 'lucide-react';

interface DailyAgendaViewProps {
  events: ScheduleEvent[];
  freeSlots: FreeTimeSlot[];
  conflicts: ScheduleConflict[];
  onSelectEvent: (event: ScheduleEvent) => void;
  onAddEvent: (day: DayOfWeek) => void;
}

export const DailyAgendaView: React.FC<DailyAgendaViewProps> = ({
  events,
  freeSlots,
  conflicts,
  onSelectEvent,
  onAddEvent,
}) => {
  // Obtener día de hoy de forma predeterminada
  const todayIdx = (new Date().getDay() + 6) % 7; // 0=Lunes, 6=Domingo
  const defaultDayKey = DAYS_OF_WEEK[todayIdx]?.key || 'lunes';
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(defaultDayKey);

  const dayEvents = events
    .filter((e) => e.dayOfWeek === selectedDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const dayFreeSlots = freeSlots
    .filter((f) => f.dayOfWeek === selectedDay && f.durationMinutes >= 30)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const dayConflicts = conflicts.filter((c) => c.dayOfWeek === selectedDay);

  // Mezclar eventos y huecos libres en una lista cronológica
  type AgendaItem = 
    | { kind: 'event'; data: ScheduleEvent; startMin: number }
    | { kind: 'free'; data: FreeTimeSlot; startMin: number };

  const timelineItems: AgendaItem[] = [
    ...dayEvents.map((e) => ({ kind: 'event' as const, data: e, startMin: timeToMinutes(e.startTime) })),
    ...dayFreeSlots.map((f) => ({ kind: 'free' as const, data: f, startMin: timeToMinutes(f.startTime) })),
  ].sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      
      {/* Selector horizontal de días */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {DAYS_OF_WEEK.map((day) => {
            const count = events.filter((e) => e.dayOfWeek === day.key).length;
            const isSelected = selectedDay === day.key;

            return (
              <button
                key={day.key}
                onClick={() => setSelectedDay(day.key)}
                className={`flex flex-col items-center px-4 py-2.5 rounded-xl text-xs transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800/80'
                }`}
              >
                <span className="uppercase text-[10px] tracking-wider opacity-80">{day.short}</span>
                <span className="text-sm font-semibold capitalize mt-0.5">{day.label}</span>
                <span
                  className={`mt-1 text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : count > 0
                      ? 'bg-indigo-500/20 text-indigo-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {count} act.
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabecera del día seleccionado */}
      <div className="p-4 sm:px-6 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white capitalize flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            {DAYS_OF_WEEK.find((d) => d.key === selectedDay)?.label}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {dayEvents.length} actividad(es) programadas • {dayFreeSlots.length} bloques libres
          </p>
        </div>

        <button
          onClick={() => onAddEvent(selectedDay)}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Añadir a este día
        </button>
      </div>

      {/* Alerta de conflicto si hay en este día */}
      {dayConflicts.length > 0 && (
        <div className="bg-red-950/50 border-b border-red-900/60 p-3 px-6 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>
            <strong>¡Atención hoy!</strong> Hay un choque entre "{dayConflicts[0].eventA.title}" y "{dayConflicts[0].eventB.title}".
          </span>
        </div>
      )}

      {/* Lista del Timeline del día */}
      <div className="p-4 sm:p-6 space-y-3 overflow-y-auto max-h-[65vh]">
        {timelineItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center">
            <Sparkles className="w-10 h-10 text-amber-400/40 mb-3" />
            <p className="text-base font-semibold text-slate-400">Día completamente libre</p>
            <p className="text-xs text-slate-500 mt-1">No tienes clases ni turnos de trabajo programados para hoy.</p>
            <button
              onClick={() => onAddEvent(selectedDay)}
              className="mt-4 px-4 py-2 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold hover:bg-indigo-600/30"
            >
              + Agregar una actividad
            </button>
          </div>
        ) : (
          timelineItems.map((item, index) => {
            if (item.kind === 'free') {
              const slot = item.data;
              return (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 text-amber-200/90"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-amber-300">
                      Tiempo Libre ({ (slot.durationMinutes / 60).toFixed(1) } horas)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      De {slot.startTime} a {slot.endTime} • Ideal para estudiar, repasar o descansar
                    </p>
                  </div>
                </div>
              );
            }

            const ev = item.data;
            const isUni = ev.type === 'university';

            return (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                className={`p-4 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] flex items-start justify-between gap-4 ${
                  isUni
                    ? 'bg-indigo-950/30 border-indigo-500/30 hover:border-indigo-400/60'
                    : 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-400/60'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isUni
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    }`}
                  >
                    {isUni ? <GraduationCap className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isUni
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {isUni ? 'Universidad' : 'Trabajo'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {ev.startTime} - {ev.endTime}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-white mt-1 truncate">
                      {ev.title}
                    </h3>

                    {(ev.location || ev.teacher) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-2">
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            {ev.location}
                          </span>
                        )}
                        {ev.teacher && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {ev.teacher}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-xs text-slate-500 underline underline-offset-4 shrink-0 hover:text-slate-300">
                  Editar
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


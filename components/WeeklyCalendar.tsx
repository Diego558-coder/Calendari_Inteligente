'use client';

import React, { useState } from 'react';
import { 
  DayOfWeek, 
  ScheduleConflict, 
  ScheduleEvent, 
  FreeTimeSlot 
} from '@/types/schedule';
import { 
  DAYS_OF_WEEK, 
  timeToMinutes 
} from '@/lib/schedule-utils';
import { 
  GraduationCap, 
  Briefcase, 
  AlertTriangle, 
  MapPin, 
  Sparkles, 
  Clock, 
  ChevronRight, 
  ChevronLeft,
  Plus
} from 'lucide-react';

interface WeeklyCalendarProps {
  events: ScheduleEvent[];
  conflicts: ScheduleConflict[];
  freeSlots: FreeTimeSlot[];
  onSelectEvent: (event: ScheduleEvent) => void;
  onAddEventAtSlot?: (day: DayOfWeek, startTime: string) => void;
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  events,
  conflicts,
  freeSlots,
  onSelectEvent,
  onAddEventAtSlot,
}) => {
  const [showFreeSlotsInGrid, setShowFreeSlotsInGrid] = useState(true);
  const [showWeekend, setShowWeekend] = useState(true);

  // Horario del calendario (07:00 a 22:00)
  const START_HOUR = 7;
  const END_HOUR = 22;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 64; // Altura en píxeles por cada hora
  const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;

  const hoursArray = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Filtrar días según toggle fin de semana
  const activeDays = DAYS_OF_WEEK.filter((d) => {
    if (!showWeekend && (d.key === 'sabado' || d.key === 'domingo')) return false;
    return true;
  });

  // Saber si un evento tiene conflicto
  const hasConflict = (eventId: string) => {
    return conflicts.some((c) => c.eventA.id === eventId || c.eventB.id === eventId);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Barra de Controles superiores del calendario */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs font-semibold text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            Universidad ({events.filter((e) => e.type === 'university').length})
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Trabajo ({events.filter((e) => e.type === 'work').length})
          </div>

          {conflicts.length > 0 && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-xs font-semibold text-red-400 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              {conflicts.length} conflicto(s)
            </div>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showFreeSlotsInGrid}
              onChange={(e) => setShowFreeSlotsInGrid(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-500"
            />
            <span className="flex items-center gap-1 text-amber-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Ver Horas Libres
            </span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWeekend}
              onChange={(e) => setShowWeekend(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500"
            />
            <span>Fin de semana</span>
          </label>
        </div>
      </div>

      {/* Alerta de Solapamientos */}
      {conflicts.length > 0 && (
        <div className="bg-red-950/40 border-b border-red-900/60 p-3 px-4 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>Atención:</strong> Tienes {conflicts.length} horario(s) donde tu clase y tu trabajo se cruzan a la misma hora.
            </span>
          </div>
          <span className="hidden sm:inline text-red-400 font-mono">Revisa las tarjetas marcadas en rojo</span>
        </div>
      )}

      {/* Contenedor scrolleable del horario */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[75vh]">
        <div className="min-w-[760px]">
          
          {/* Fila de Encabezados de Días */}
          <div className="sticky top-0 z-30 grid grid-cols-[60px_repeat(var(--num-cols),minmax(0,1fr))] bg-slate-900 border-b border-slate-800 shadow-sm"
               style={{ '--num-cols': activeDays.length } as React.CSSProperties}>
            
            {/* Esquina superior izquierda hora */}
            <div className="p-3 text-center text-xs font-bold text-slate-500 border-r border-slate-800 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>

            {/* Días */}
            {activeDays.map((day) => {
              const dayEventCount = events.filter((e) => e.dayOfWeek === day.key).length;
              return (
                <div
                  key={day.key}
                  className="p-2.5 text-center border-r border-slate-800 last:border-r-0"
                >
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{day.short}</p>
                  <p className="text-sm font-bold text-white capitalize">{day.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {dayEventCount > 0 ? `${dayEventCount} actividad(es)` : 'Libre'}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Cuerpo de la Grilla de Horarios */}
          <div 
            className="grid grid-cols-[60px_repeat(var(--num-cols),minmax(0,1fr))] relative"
            style={{ 
              '--num-cols': activeDays.length,
              height: `${TOTAL_HOURS * HOUR_HEIGHT}px` 
            } as React.CSSProperties}
          >
            {/* Columna izquierda con las horas (07:00, 08:00, ...) */}
            <div className="border-r border-slate-800 bg-slate-950/40 select-none">
              {hoursArray.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="relative border-b border-slate-800/60 pr-2 text-right text-xs font-mono text-slate-500 -mt-2.5 pt-1"
                >
                  {`${hour.toString().padStart(2, '0')}:00`}
                </div>
              ))}
            </div>

            {/* Columnas por cada día */}
            {activeDays.map((day) => {
              const dayEvents = events.filter((e) => e.dayOfWeek === day.key);
              const dayFreeSlots = freeSlots.filter((f) => f.dayOfWeek === day.key && f.durationMinutes >= 45);

              return (
                <div
                  key={day.key}
                  className="relative border-r border-slate-800 last:border-r-0 bg-slate-900/20 group/col"
                >
                  {/* Líneas horizontales de fondo de cada hora */}
                  {hoursArray.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      onClick={() => onAddEventAtSlot?.(day.key, `${hour.toString().padStart(2, '0')}:00`)}
                      className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors cursor-pointer group/cell relative"
                    >
                      <span className="opacity-0 group-hover/cell:opacity-100 absolute top-1 right-1 text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 pointer-events-none">
                        <Plus className="w-2.5 h-2.5" /> Agregar
                      </span>
                    </div>
                  ))}

                  {/* Bloques de Horas Libres (si está activado) */}
                  {showFreeSlotsInGrid &&
                    dayFreeSlots.map((slot) => {
                      const startMin = timeToMinutes(slot.startTime);
                      const endMin = timeToMinutes(slot.endTime);

                      const startOffset = Math.max(0, startMin - START_HOUR * 60);
                      const top = startOffset * PIXELS_PER_MINUTE;
                      const duration = Math.min(END_HOUR * 60, endMin) - Math.max(START_HOUR * 60, startMin);
                      const height = Math.max(24, duration * PIXELS_PER_MINUTE);

                      if (duration <= 0) return null;

                      return (
                        <div
                          key={slot.id}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                          }}
                          className="absolute inset-x-1 border border-dashed border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 rounded-lg p-1.5 pointer-events-none transition-all flex flex-col justify-center items-center text-center z-0"
                        >
                          <span className="text-[10px] font-semibold text-amber-300/80 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                            Libre {(slot.durationMinutes / 60).toFixed(1)}h
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {slot.startTime} - {slot.endTime}
                          </span>
                        </div>
                      );
                    })}

                  {/* Bloques de Eventos (Clases y Trabajo) */}
                  {dayEvents.map((ev) => {
                    const startMin = timeToMinutes(ev.startTime);
                    const endMin = timeToMinutes(ev.endTime);

                    const startOffset = Math.max(0, startMin - START_HOUR * 60);
                    const top = startOffset * PIXELS_PER_MINUTE;
                    const duration = Math.max(30, endMin - startMin);
                    const height = Math.max(36, duration * PIXELS_PER_MINUTE);

                    const conflict = hasConflict(ev.id);
                    const isUni = ev.type === 'university';

                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                        }}
                        className={`absolute inset-x-1.5 rounded-xl p-2 cursor-pointer shadow-md transition-all hover:scale-[1.02] hover:z-20 border z-10 flex flex-col justify-between overflow-hidden ${
                          conflict
                            ? 'bg-red-950/90 border-red-500 text-white ring-2 ring-red-500/50 shadow-red-500/20'
                            : isUni
                            ? 'bg-indigo-600/90 hover:bg-indigo-600 border-indigo-400/60 text-white shadow-indigo-600/20'
                            : 'bg-emerald-600/90 hover:bg-emerald-600 border-emerald-400/60 text-white shadow-emerald-600/20'
                        }`}
                      >
                        {/* Cabecera del bloque */}
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-90 truncate">
                              {isUni ? (
                                <GraduationCap className="w-3 h-3 shrink-0" />
                              ) : (
                                <Briefcase className="w-3 h-3 shrink-0" />
                              )}
                              {isUni ? 'Universidad' : 'Trabajo'}
                            </span>

                            {conflict && (
                              <span title="¡Solapamiento con otro evento!" className="bg-red-500 text-white p-0.5 rounded-full animate-bounce">
                                <AlertTriangle className="w-3 h-3" />
                              </span>
                            )}
                          </div>

                          <p className="text-xs font-bold leading-tight mt-1 line-clamp-2">
                            {ev.title}
                          </p>
                        </div>

                        {/* Pie del bloque con hora y ubicación */}
                        <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[10px] opacity-90">
                          <span className="font-mono font-medium truncate">
                            {ev.startTime} - {ev.endTime}
                          </span>
                          {ev.location && (
                            <span className="flex items-center gap-0.5 truncate max-w-[60px]" title={ev.location}>
                              <MapPin className="w-2.5 h-2.5 shrink-0" />
                              {ev.location}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


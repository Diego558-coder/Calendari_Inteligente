'use client';

import React from 'react';
import { DayOfWeek, ScheduleEvent, FreeTimeSlot, ScheduleConflict } from '@/types/schedule';
import { layoutOverlaps, timeToMinutes } from '@/lib/schedule-utils';
import { EventBlock } from './EventBlock';
import { FreeSlotBlock } from './FreeSlotBlock';
import { Plus } from 'lucide-react';

interface DayColumnProps {
  day: { key: DayOfWeek; label: string; short: string };
  hoursArray: number[];
  HOUR_HEIGHT: number;
  PIXELS_PER_MINUTE: number;
  START_HOUR: number;
  END_HOUR: number;
  dayEvents: ScheduleEvent[];
  dayFreeSlots: FreeTimeSlot[];
  conflicts: ScheduleConflict[];
  showFreeSlotsInGrid: boolean;
  onAddEventAtSlot: (day: DayOfWeek, startTime: string) => void;
  onSelectEvent: (event: ScheduleEvent) => void;
}

export const DayColumn: React.FC<DayColumnProps> = ({
  day,
  hoursArray,
  HOUR_HEIGHT,
  PIXELS_PER_MINUTE,
  START_HOUR,
  END_HOUR,
  dayEvents,
  dayFreeSlots,
  conflicts,
  showFreeSlotsInGrid,
  onAddEventAtSlot,
  onSelectEvent,
}) => {
  const hasConflict = (eventId: string) => {
    return conflicts.some((c) => c.eventA.id === eventId || c.eventB.id === eventId);
  };

  // Eventos que se cruzan van lado a lado en vez de taparse
  const lanes = React.useMemo(() => layoutOverlaps(dayEvents), [dayEvents]);

  return (
    <div
      key={day.key}
      className="relative border-r border-slate-800 last:border-r-0 bg-slate-900/20 group/col"
      role="columnheader"
      aria-label={day.label}
    >
      {/* Líneas horizontales de fondo de cada hora */}
      {hoursArray.map((hour) => (
        <div
          key={hour}
          style={{ height: `${HOUR_HEIGHT}px` }}
          onClick={() => onAddEventAtSlot(day.key, `${hour.toString().padStart(2, '0')}:00`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAddEventAtSlot(day.key, `${hour.toString().padStart(2, '0')}:00`); }}}
          tabIndex={0}
          role="gridcell"
          aria-label={`Añadir evento el ${day.label} a las ${hour.toString().padStart(2, '0')}:00`}
          className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors cursor-pointer group/cell relative focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        >
          <span className="opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 absolute top-1 right-1 text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 pointer-events-none">
            <Plus className="w-2.5 h-2.5" /> Agregar
          </span>
        </div>
      ))}

      {/* Bloques de Horas Libres (si está activado) */}
      {showFreeSlotsInGrid &&
        dayFreeSlots
          .filter((f) => f.durationMinutes >= 45)
          .map((slot) => {
            const startMin = timeToMinutes(slot.startTime);
            const endMin = timeToMinutes(slot.endTime);

            const startOffset = Math.max(0, startMin - START_HOUR * 60);
            const top = startOffset * PIXELS_PER_MINUTE;
            const duration = Math.min(END_HOUR * 60, endMin) - Math.max(START_HOUR * 60, startMin);
            const height = Math.max(24, duration * PIXELS_PER_MINUTE);

            if (duration <= 0) return null;

            return <FreeSlotBlock key={slot.id} slot={slot} top={top} height={height} />;
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
        const lane = lanes.get(ev.id) || { column: 0, columns: 1 };

        return (
          <EventBlock
            key={ev.id}
            event={ev}
            top={top}
            height={height}
            column={lane.column}
            columns={lane.columns}
            hasConflict={conflict}
            onClick={() => onSelectEvent(ev)}
          />
        );
      })}
    </div>
  );
};
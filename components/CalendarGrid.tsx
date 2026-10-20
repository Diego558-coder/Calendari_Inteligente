'use client';

import React from 'react';
import { DayOfWeek, ScheduleEvent, FreeTimeSlot, ScheduleConflict } from '@/types/schedule';
import { CalendarHeader } from './CalendarHeader';
import { CalendarControls } from './CalendarControls';
import { ConflictAlert } from './ConflictAlert';
import { TimeColumn } from './TimeColumn';
import { DayColumn } from './DayColumn';

interface CalendarGridProps {
  events: ScheduleEvent[];
  conflicts: ScheduleConflict[];
  freeSlots: FreeTimeSlot[];
  eventsByDay: Record<DayOfWeek, ScheduleEvent[]>;
  freeSlotsByDay: Record<DayOfWeek, FreeTimeSlot[]>;
  activeDays: { key: DayOfWeek; label: string; short: string }[];
  showFreeSlotsInGrid: boolean;
  setShowFreeSlotsInGrid: (show: boolean) => void;
  showWeekend: boolean;
  setShowWeekend: (show: boolean) => void;
  onSelectEvent: (event: ScheduleEvent) => void;
  onAddEventAtSlot: (day: DayOfWeek, startTime: string) => void;
  hoursArray: number[];
  HOUR_HEIGHT: number;
  PIXELS_PER_MINUTE: number;
  START_HOUR: number;
  END_HOUR: number;
  TOTAL_HOURS: number;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  events,
  conflicts,
  freeSlots,
  eventsByDay,
  freeSlotsByDay,
  activeDays,
  showFreeSlotsInGrid,
  setShowFreeSlotsInGrid,
  showWeekend,
  setShowWeekend,
  onSelectEvent,
  onAddEventAtSlot,
  hoursArray,
  HOUR_HEIGHT,
  PIXELS_PER_MINUTE,
  START_HOUR,
  END_HOUR,
  TOTAL_HOURS,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Controles del calendario */}
      <CalendarControls
        events={events}
        conflicts={conflicts}
        showFreeSlotsInGrid={showFreeSlotsInGrid}
        setShowFreeSlotsInGrid={setShowFreeSlotsInGrid}
        showWeekend={showWeekend}
        setShowWeekend={setShowWeekend}
      />

      {/* Alerta de Solapamientos */}
      <ConflictAlert conflicts={conflicts} />

      {/* Contenedor scrolleable del horario */}
      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[75vh]">
        <div className="min-w-[760px]">
          
          {/* Fila de Encabezados de Días */}
          <CalendarHeader
            activeDays={activeDays}
            eventsByDay={eventsByDay}
            numCols={activeDays.length}
          />

          {/* Cuerpo de la Grilla de Horarios */}
          <div 
            className="grid grid-cols-[60px_repeat(var(--num-cols),minmax(0,1fr))] relative"
            style={{ 
              '--num-cols': activeDays.length,
              height: `${TOTAL_HOURS * HOUR_HEIGHT}px` 
            } as React.CSSProperties}
            role="grid"
            aria-label="Calendario semanal"
          >
            {/* Columna izquierda con las horas */}
            <TimeColumn hoursArray={hoursArray} HOUR_HEIGHT={HOUR_HEIGHT} />

            {/* Columnas por cada día */}
            {activeDays.map((day) => {
              const dayEvents = eventsByDay[day.key] || [];
              const dayFreeSlots = freeSlotsByDay[day.key] || [];

              return (
                <DayColumn
                  key={day.key}
                  day={day}
                  hoursArray={hoursArray}
                  HOUR_HEIGHT={HOUR_HEIGHT}
                  PIXELS_PER_MINUTE={PIXELS_PER_MINUTE}
                  START_HOUR={START_HOUR}
                  END_HOUR={END_HOUR}
                  dayEvents={dayEvents}
                  dayFreeSlots={dayFreeSlots}
                  conflicts={conflicts}
                  showFreeSlotsInGrid={showFreeSlotsInGrid}
                  onAddEventAtSlot={onAddEventAtSlot}
                  onSelectEvent={onSelectEvent}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
'use client';

import React, { useState, useMemo } from 'react';
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
import { CalendarGrid } from './CalendarGrid';

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

  // Pre-agrupar eventos y huecos libres por día para evitar filtros en cada render
  const eventsByDay = useMemo(() =>
    events.reduce((acc, ev) => ({ ...acc, [ev.dayOfWeek]: [...(acc[ev.dayOfWeek] || []), ev] }),
    {} as Record<DayOfWeek, ScheduleEvent[]>), [events]);

  const freeSlotsByDay = useMemo(() =>
    freeSlots.reduce((acc, fs) => ({ ...acc, [fs.dayOfWeek]: [...(acc[fs.dayOfWeek] || []), fs] }),
    {} as Record<DayOfWeek, FreeTimeSlot[]>), [freeSlots]);

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

  return (
    <CalendarGrid
      events={events}
      conflicts={conflicts}
      freeSlots={freeSlots}
      eventsByDay={eventsByDay}
      freeSlotsByDay={freeSlotsByDay}
      activeDays={activeDays}
      showFreeSlotsInGrid={showFreeSlotsInGrid}
      setShowFreeSlotsInGrid={setShowFreeSlotsInGrid}
      showWeekend={showWeekend}
      setShowWeekend={setShowWeekend}
      onSelectEvent={onSelectEvent}
      onAddEventAtSlot={onAddEventAtSlot}
      hoursArray={hoursArray}
      HOUR_HEIGHT={HOUR_HEIGHT}
      PIXELS_PER_MINUTE={PIXELS_PER_MINUTE}
      START_HOUR={START_HOUR}
      END_HOUR={END_HOUR}
      TOTAL_HOURS={TOTAL_HOURS}
    />
  );
};
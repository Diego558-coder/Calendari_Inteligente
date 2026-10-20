'use client';

import React from 'react';
import { DayOfWeek } from '@/types/schedule';
import { Clock } from 'lucide-react';

interface CalendarHeaderProps {
  activeDays: { key: DayOfWeek; label: string; short: string }[];
  eventsByDay: Record<DayOfWeek, any[]>;
  numCols: number;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  activeDays,
  eventsByDay,
  numCols,
}) => {
  return (
    <div className="sticky top-0 z-30 grid grid-cols-[60px_repeat(var(--num-cols),minmax(0,1fr))] bg-slate-900 border-b border-slate-800 shadow-sm"
         style={{ '--num-cols': numCols } as React.CSSProperties}>
      
      {/* Esquina superior izquierda hora */}
      <div className="p-3 text-center text-xs font-bold text-slate-500 border-r border-slate-800 flex items-center justify-center">
        <Clock className="w-4 h-4" />
      </div>

      {/* Días */}
      {activeDays.map((day) => {
        const dayEventCount = eventsByDay[day.key]?.length || 0;
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
  );
};
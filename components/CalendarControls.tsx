'use client';

import React from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { ScheduleConflict, ScheduleEvent } from '@/types/schedule';
import { EVENT_TYPES, EVENT_TYPE_STYLES } from '@/lib/event-styles';

interface CalendarControlsProps {
  events: ScheduleEvent[];
  conflicts: ScheduleConflict[];
  showFreeSlotsInGrid: boolean;
  setShowFreeSlotsInGrid: (show: boolean) => void;
  showWeekend: boolean;
  setShowWeekend: (show: boolean) => void;
}

export const CalendarControls: React.FC<CalendarControlsProps> = ({
  events,
  conflicts,
  showFreeSlotsInGrid,
  setShowFreeSlotsInGrid,
  showWeekend,
  setShowWeekend,
}) => {
  return (
    <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
      <div className="flex flex-wrap items-center gap-2">
        {EVENT_TYPES.map((type) => {
          const count = events.filter((e) => e.type === type).length;
          if (type === 'personal' && count === 0) return null;
          const style = EVENT_TYPE_STYLES[type];
          return (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${style.chip}`}>
              <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
              {style.label} ({count})
            </div>
          );
        })}

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
  );
};
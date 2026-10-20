'use client';

import React from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { timeToMinutes } from '@/lib/schedule-utils';
import { GraduationCap, Briefcase, AlertTriangle, MapPin } from 'lucide-react';

interface EventBlockProps {
  event: ScheduleEvent;
  top: number;
  height: number;
  hasConflict: boolean;
  onClick: () => void;
}

export const EventBlock: React.FC<EventBlockProps> = ({
  event,
  top,
  height,
  hasConflict,
  onClick,
}) => {
  const isUni = event.type === 'university';

  const eventAriaLabel = `${event.title}, ${event.startTime} a ${event.endTime}, ${isUni ? 'clase' : 'trabajo'}${event.location ? ` en ${event.location}` : ''}${hasConflict ? ', conflicto detectado' : ''}`;

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }}}
      tabIndex={0}
      role="button"
      aria-label={eventAriaLabel}
      style={{
        top: `${top}px`,
        height: `${height}px`,
      }}
      className={`absolute inset-x-1.5 rounded-xl p-2 cursor-pointer shadow-md transition-all hover:scale-[1.02] hover:z-20 border z-10 flex flex-col justify-between overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
        hasConflict
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

          {hasConflict && (
            <span title="¡Solapamiento con otro evento!" className="bg-red-500 text-white p-0.5 rounded-full animate-bounce">
              <AlertTriangle className="w-3 h-3" />
            </span>
          )}
        </div>

        <p className="text-xs font-bold leading-tight mt-1 line-clamp-2">
          {event.title}
        </p>
      </div>

      {/* Pie del bloque con hora y ubicación */}
      <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between text-[10px] opacity-90">
        <span className="font-mono font-medium truncate">
          {event.startTime} - {event.endTime}
        </span>
        {event.location && (
          <span className="flex items-center gap-0.5 truncate max-w-[60px]" title={event.location}>
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            {event.location}
          </span>
        )}
      </div>
    </div>
  );
};
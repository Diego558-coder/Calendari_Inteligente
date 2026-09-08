'use client';

import React from 'react';
import { FreeTimeSlot, ScheduleConflict, ScheduleEvent, ScheduleStats } from '@/types/schedule';
import { DAYS_OF_WEEK } from '@/lib/schedule-utils';
import { 
  Sparkles, 
  GraduationCap, 
  Briefcase, 
  Clock, 
  Calendar, 
  CheckCircle, 
  AlertTriangle, 
  Coffee, 
  BookOpen, 
  Zap 
} from 'lucide-react';

interface FreeTimeSummaryProps {
  stats: ScheduleStats;
  freeSlots: FreeTimeSlot[];
  conflicts: ScheduleConflict[];
  events: ScheduleEvent[];
}

export const FreeTimeSummary: React.FC<FreeTimeSummaryProps> = ({
  stats,
  freeSlots,
  conflicts,
  events,
}) => {
  // Encontrar el bloque libre continuo más largo de la semana
  const longestSlot = [...freeSlots].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];

  // Bloques ideales para estudio profundo (más de 90 minutos)
  const studySlots = freeSlots.filter((f) => f.durationMinutes >= 90);

  // Bloques para descanso / almuerzo (entre 45 y 90 minutos)
  const breakSlots = freeSlots.filter((f) => f.durationMinutes >= 45 && f.durationMinutes < 90);

  return (
    <div className="space-y-6">
      
      {/* Tarjetas de Métricas Generales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Horas Libres */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Horas Libres</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white mt-2">
            {stats.freeHours} <span className="text-sm font-normal text-slate-400">hrs/sem</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">Disponibles para estudiar o descansar</p>
        </div>

        {/* Horas Universidad */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Universidad</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white mt-2">
            {stats.universityHours} <span className="text-sm font-normal text-slate-400">hrs/sem</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {events.filter((e) => e.type === 'university').length} clases programadas
          </p>
        </div>

        {/* Horas Trabajo */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Trabajo</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white mt-2">
            {stats.workHours} <span className="text-sm font-normal text-slate-400">hrs/sem</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {events.filter((e) => e.type === 'work').length} turnos de trabajo
          </p>
        </div>

        {/* Conflictos o Estado */}
        <div className={`p-5 rounded-2xl bg-slate-900 border shadow-lg ${
          conflicts.length > 0 ? 'border-red-500/40 bg-red-950/20' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Conflictos</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              conflicts.length > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {conflicts.length > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            </div>
          </div>
          <p className={`text-3xl font-extrabold mt-2 ${conflicts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {conflicts.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {conflicts.length > 0 ? 'Horarios chocan entre sí' : 'Sin cruces de horario'}
          </p>
        </div>
      </div>

      {/* Sugerencias Inteligentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Bloques ideales de estudio */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mejores Huecos para Estudiar / Tareas</h3>
              <p className="text-xs text-slate-400">Bloques continuos de más de 1.5 horas</p>
            </div>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {studySlots.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">
                No tienes bloques largos continuos. Considera optimizar tu semana.
              </p>
            ) : (
              studySlots.slice(0, 5).map((slot) => {
                const dayObj = DAYS_OF_WEEK.find((d) => d.key === slot.dayOfWeek);
                return (
                  <div
                    key={slot.id}
                    className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-slate-200 capitalize">
                      {dayObj?.label} ({slot.startTime} - {slot.endTime})
                    </span>
                    <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-lg">
                      {(slot.durationMinutes / 60).toFixed(1)} hrs libres
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bloque más largo y pausas */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Coffee className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Momentos de Desconexión</h3>
              <p className="text-xs text-slate-400">Pausas ideales para almorzar o entrenar</p>
            </div>
          </div>

          <div className="space-y-2">
            {longestSlot && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <span className="text-amber-300 font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Tu mayor bloque libre semanal:
                </span>
                <p className="text-white text-sm font-bold mt-1 capitalize">
                  {DAYS_OF_WEEK.find((d) => d.key === longestSlot.dayOfWeek)?.label}: {longestSlot.startTime} a {longestSlot.endTime} ({(longestSlot.durationMinutes / 60).toFixed(1)} hrs)
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-2">
              Tienes <strong>{breakSlots.length}</strong> intervalos de descanso cortos (45 a 90 min) entre tus clases y turnos durante la semana.
            </p>
          </div>
        </div>
      </div>

      {/* Desglose de Horas Libres Día por Día */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-indigo-400" />
          Disponibilidad Día por Día
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {DAYS_OF_WEEK.map((day) => {
            const daySlots = freeSlots.filter((f) => f.dayOfWeek === day.key);
            const totalDayFreeMinutes = daySlots.reduce((sum, s) => sum + s.durationMinutes, 0);
            const totalHours = (totalDayFreeMinutes / 60).toFixed(1);

            return (
              <div
                key={day.key}
                className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-sm font-bold text-white capitalize">{day.label}</span>
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                      {totalHours}h libres
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-500">Día completamente ocupado</p>
                    ) : (
                      daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/60 px-2 py-1 rounded-lg"
                        >
                          <span className="font-mono text-slate-400">
                            {slot.startTime} - {slot.endTime}
                          </span>
                          <span className="font-semibold text-amber-300/90">
                            {(slot.durationMinutes / 60).toFixed(1)}h
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


'use client';

import React from 'react';
import { ScheduleConflict } from '@/types/schedule';
import { AlertTriangle } from 'lucide-react';

interface ConflictAlertProps {
  conflicts: ScheduleConflict[];
}

export const ConflictAlert: React.FC<ConflictAlertProps> = ({ conflicts }) => {
  if (conflicts.length === 0) return null;

  return (
    <div className="bg-red-950/40 border-b border-red-900/60 p-3 px-4 flex items-center justify-between text-xs text-red-300">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        <span>
          <strong>Atención:</strong> Tienes {conflicts.length} horario(s) donde tu clase y tu trabajo se cruzan a la misma hora.
        </span>
      </div>
      <span className="hidden sm:inline text-red-400 font-mono">Revisa las tarjetas marcadas en rojo</span>
    </div>
  );
};
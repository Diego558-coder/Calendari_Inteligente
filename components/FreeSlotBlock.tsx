'use client';

import React from 'react';
import { FreeTimeSlot } from '@/types/schedule';
import { Sparkles } from 'lucide-react';

interface FreeSlotBlockProps {
  slot: FreeTimeSlot;
  top: number;
  height: number;
}

export const FreeSlotBlock: React.FC<FreeSlotBlockProps> = ({
  slot,
  top,
  height,
}) => {
  return (
    <div
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
};
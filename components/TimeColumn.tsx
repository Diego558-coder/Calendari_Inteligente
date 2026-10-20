'use client';

import React from 'react';

interface TimeColumnProps {
  hoursArray: number[];
  HOUR_HEIGHT: number;
}

export const TimeColumn: React.FC<TimeColumnProps> = ({
  hoursArray,
  HOUR_HEIGHT,
}) => {
  return (
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
  );
};
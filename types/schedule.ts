export type EventType = 'university' | 'work' | 'personal';

export type DayOfWeek = 
  | 'lunes' 
  | 'martes' 
  | 'miercoles' 
  | 'jueves' 
  | 'viernes' 
  | 'sabado' 
  | 'domingo';

export interface ScheduleEvent {
  id: string;
  title: string;
  type: EventType;
  dayOfWeek: DayOfWeek;
  startTime: string; // Formato "HH:mm" (24h, ej: "08:00")
  endTime: string;   // Formato "HH:mm" (24h, ej: "10:00")
  location?: string; // Aula, edificio o lugar de trabajo
  teacher?: string;  // Profesor o supervisor
  notes?: string;
  color?: string;    // Color personalizado opcional
}

export interface FreeTimeSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  label: string; // Ej: "3 horas libres para estudiar o almorzar"
}

export interface ScheduleConflict {
  id: string;
  dayOfWeek: DayOfWeek;
  eventA: ScheduleEvent;
  eventB: ScheduleEvent;
  overlapMinutes: number;
  message: string;
}

export interface ScheduleStats {
  universityHours: number;
  workHours: number;
  freeHours: number;
  totalActivities: number;
  conflictsCount: number;
}


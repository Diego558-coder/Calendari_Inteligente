import { Briefcase, GraduationCap, LucideIcon, Star } from 'lucide-react';
import { EventType } from '@/types/schedule';

interface EventTypeStyle {
  label: string;
  /** Texto para lectores de pantalla */
  spokenLabel: string;
  icon: LucideIcon;
  iconColor: string;
  /** Bloque en la cuadrícula semanal */
  block: string;
  /** Tarjeta en la agenda diaria */
  card: string;
  iconBox: string;
  badge: string;
  chip: string;
  dot: string;
  /** Botón seleccionado en el formulario */
  selected: string;
  /** Fila en la vista previa del escaneo */
  preview: string;
}

// Las clases van completas (no concatenadas) para que Tailwind las detecte al compilar
export const EVENT_TYPE_STYLES: Record<EventType, EventTypeStyle> = {
  university: {
    label: 'Universidad',
    spokenLabel: 'clase',
    icon: GraduationCap,
    iconColor: 'text-indigo-400',
    block: 'bg-indigo-600/90 hover:bg-indigo-600 border-indigo-400/60 text-white shadow-indigo-600/20',
    card: 'bg-indigo-950/30 border-indigo-500/30 hover:border-indigo-400/60',
    iconBox: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30',
    badge: 'bg-indigo-500/20 text-indigo-300',
    chip: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
    dot: 'bg-indigo-400',
    selected: 'border-indigo-500 bg-indigo-600/20 text-indigo-300',
    preview: 'border-indigo-500/30 bg-indigo-950/20',
  },
  work: {
    label: 'Trabajo',
    spokenLabel: 'trabajo',
    icon: Briefcase,
    iconColor: 'text-emerald-400',
    block: 'bg-emerald-600/90 hover:bg-emerald-600 border-emerald-400/60 text-white shadow-emerald-600/20',
    card: 'bg-emerald-950/30 border-emerald-500/30 hover:border-emerald-400/60',
    iconBox: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
    badge: 'bg-emerald-500/20 text-emerald-300',
    chip: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    dot: 'bg-emerald-400',
    selected: 'border-emerald-500 bg-emerald-600/20 text-emerald-300',
    preview: 'border-emerald-500/30 bg-emerald-950/20',
  },
  personal: {
    label: 'Personal',
    spokenLabel: 'actividad personal',
    icon: Star,
    iconColor: 'text-fuchsia-400',
    block: 'bg-fuchsia-600/90 hover:bg-fuchsia-600 border-fuchsia-400/60 text-white shadow-fuchsia-600/20',
    card: 'bg-fuchsia-950/30 border-fuchsia-500/30 hover:border-fuchsia-400/60',
    iconBox: 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/30',
    badge: 'bg-fuchsia-500/20 text-fuchsia-300',
    chip: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300',
    dot: 'bg-fuchsia-400',
    selected: 'border-fuchsia-500 bg-fuchsia-600/20 text-fuchsia-300',
    preview: 'border-fuchsia-500/30 bg-fuchsia-950/20',
  },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_STYLES) as EventType[];

export function eventStyle(type: EventType): EventTypeStyle {
  return EVENT_TYPE_STYLES[type] || EVENT_TYPE_STYLES.personal;
}

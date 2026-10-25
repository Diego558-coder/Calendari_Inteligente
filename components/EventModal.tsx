'use client';

import React, { useState, useEffect } from 'react';
import { DayOfWeek, EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, generateGoogleCalendarUrl, makeId, minutesToTime, timeToMinutes } from '@/lib/schedule-utils';
import { EVENT_TYPES, EVENT_TYPE_STYLES, eventStyle } from '@/lib/event-styles';
import { 
  X, 
  Trash2, 
  Save, 
  ExternalLink, 
  MapPin, 
  User, 
  AlertCircle
} from 'lucide-react';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ScheduleEvent | null;
  onSave: (event: ScheduleEvent) => void;
  onDelete?: (eventId: string) => void;
  initialDay?: DayOfWeek;
  initialStartTime?: string;
  timezone?: string;
}

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  onSave,
  onDelete,
  initialDay,
  initialStartTime,
  timezone,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('university');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('lunes');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [teacher, setTeacher] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setFormError(null);
    if (event) {
      setTitle(event.title || '');
      setType(event.type || 'university');
      setDayOfWeek(event.dayOfWeek || 'lunes');
      setStartTime(event.startTime || '08:00');
      setEndTime(event.endTime || '10:00');
      setLocation(event.location || '');
      setTeacher(event.teacher || '');
      setNotes(event.notes || '');
    } else {
      setTitle('');
      setType('university');
      setDayOfWeek(initialDay || 'lunes');
      setStartTime(initialStartTime || '08:00');
      // calcular endTime 2 horas después
      setEndTime(minutesToTime(timeToMinutes(initialStartTime || '08:00') + 120));
      setLocation('');
      setTeacher('');
      setNotes('');
    }
  }, [event, isOpen, initialDay, initialStartTime]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Escribe un título para la clase o turno.');
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setFormError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    const updatedEvent: ScheduleEvent = {
      id: event?.id || makeId(),
      title: title.trim(),
      type,
      dayOfWeek,
      startTime,
      endTime,
      location: location.trim() || undefined,
      teacher: teacher.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(updatedEvent);
    onClose();
  };

  const googleCalendarUrl = event ? generateGoogleCalendarUrl(event, timezone) : null;
  const currentStyle = eventStyle(type);
  const HeaderIcon = currentStyle.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 id="event-modal-title" className="text-base font-bold text-white flex items-center gap-2">
            <HeaderIcon className={`w-5 h-5 ${currentStyle.iconColor}`} />
            {event ? 'Editar Actividad' : 'Nueva Actividad'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          
          {/* Selector de Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Tipo de Actividad
            </label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map((option) => {
                const style = EVENT_TYPE_STYLES[option];
                const Icon = style.icon;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setType(option)}
                    aria-pressed={type === option}
                    className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      type === option ? style.selected : 'border-slate-800 text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${style.iconColor}`} />
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Título / Materia / Turno
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Cálculo Diferencial, Turno Mañana..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Día y Horas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Día
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Hora Inicio
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Hora Fin
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Aula / Lugar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Aula / Ubicación (Opcional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Aula 402, Edificio B..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Docente / Supervisor (Opcional)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                  placeholder="Ej: Prof. García..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Notas adicionales */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Notas Adicionales
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre entregas, grupo o enlaces virtuales..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {formError && (
            <p role="alert" className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formError}
            </p>
          )}

          {/* Enlace rápido a Google Calendar si ya existe */}
          {googleCalendarUrl && (
            <div className="pt-2">
              <a
                href={googleCalendarUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Añadir directamente este evento a Google Calendar
              </a>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            {event && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Estás seguro de eliminar "${event.title}"?`)) {
                    onDelete(event.id);
                    onClose();
                  }
                }}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            ) : (
              <div></div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
              >
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};


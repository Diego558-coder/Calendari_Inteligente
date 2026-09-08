'use client';

import React, { useState, useEffect } from 'react';
import { DayOfWeek, EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, generateGoogleCalendarUrl } from '@/lib/schedule-utils';
import { 
  X, 
  Trash2, 
  Save, 
  ExternalLink, 
  GraduationCap, 
  Briefcase, 
  Clock, 
  MapPin, 
  User, 
  FileText 
} from 'lucide-react';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: ScheduleEvent | null;
  onSave: (event: ScheduleEvent) => void;
  onDelete?: (eventId: string) => void;
  initialDay?: DayOfWeek;
  initialStartTime?: string;
}

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  onSave,
  onDelete,
  initialDay,
  initialStartTime,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('university');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('lunes');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [teacher, setTeacher] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
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
      const [h, m] = (initialStartTime || '08:00').split(':').map(Number);
      const endH = Math.min(23, h + 2);
      setEndTime(`${endH.toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')}`);
      setLocation('');
      setTeacher('');
      setNotes('');
    }
  }, [event, isOpen, initialDay, initialStartTime]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Por favor escribe un título para la clase o turno.');
      return;
    }

    const updatedEvent: ScheduleEvent = {
      id: event?.id || `manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

  const googleCalendarUrl = event ? generateGoogleCalendarUrl(event) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            {type === 'university' ? (
              <GraduationCap className="w-5 h-5 text-indigo-400" />
            ) : (
              <Briefcase className="w-5 h-5 text-emerald-400" />
            )}
            {event ? 'Editar Actividad' : 'Nueva Actividad'}
          </h2>
          <button
            onClick={onClose}
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
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('university')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  type === 'university'
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                    : 'border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                Universidad
              </button>

              <button
                type="button"
                onClick={() => setType('work')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  type === 'work'
                    ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                    : 'border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Briefcase className="w-4 h-4 text-emerald-400" />
                Trabajo
              </button>
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


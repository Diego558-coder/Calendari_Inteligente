'use client';

import { useState, useCallback } from 'react';
import { ScheduleEvent } from '@/types/schedule';

function makeId() {
  return crypto.randomUUID();
}

interface ChatAction {
  type: 'add' | 'update' | 'delete' | 'none';
  eventId?: string;
  matchTitle?: string;
  event?: Partial<ScheduleEvent>;
}

export function useScheduleChat(events: ScheduleEvent[], apiKey: string, onApplyEvents: (events: ScheduleEvent[]) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'Hola. Puedo agendar, corregir o eliminar actividades de tu horario. Por ejemplo: "agenda inglés el sábado a las 2 pm por una hora".' },
  ]);

  const applyActions = useCallback((actions: ChatAction[]) => {
    let nextEvents = [...events];
    for (const action of actions) {
      if (action.type === 'add' && action.event?.title && action.event.dayOfWeek && action.event.startTime) {
        nextEvents.push({
          id: makeId(),
          title: action.event.title,
          type: action.event.type || 'personal',
          dayOfWeek: action.event.dayOfWeek,
          startTime: action.event.startTime,
          endTime: action.event.endTime || action.event.startTime,
          location: action.event.location,
          teacher: action.event.teacher,
          notes: action.event.notes,
        });
      }
      if (action.type === 'update' && action.event) {
        const index = nextEvents.findIndex((event) => action.eventId ? event.id === action.eventId : event.title.toLowerCase().includes((action.matchTitle || '').toLowerCase()));
        if (index >= 0) nextEvents[index] = { ...nextEvents[index], ...action.event } as ScheduleEvent;
      }
      if (action.type === 'delete') {
        nextEvents = nextEvents.filter((event) => action.eventId ? event.id !== action.eventId : !event.title.toLowerCase().includes((action.matchTitle || '').toLowerCase()));
      }
    }
    if (JSON.stringify(nextEvents) !== JSON.stringify(events)) onApplyEvents(nextEvents);
  }, [events, onApplyEvents]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || isSending) return;
    setMessage('');
    setMessages((current) => [...current, { role: 'user', text }]);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, events, apiKey }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo procesar el pedido.');
      applyActions(data.actions || []);
      setMessages((current) => [...current, { role: 'assistant', text: `${data.reply}${(data.actions || []).some((action: ChatAction) => action.type !== 'none') ? ' He actualizado tu calendario.' : ''}` }]);
    } catch (error: any) {
      setMessages((current) => [...current, { role: 'assistant', text: `No pude hacerlo: ${error.message}` }]);
    } finally {
      setIsSending(false);
    }
  }, [message, events, apiKey, applyActions]);

  return {
    isOpen,
    setIsOpen,
    message,
    setMessage,
    isSending,
    messages,
    sendMessage,
  };
}
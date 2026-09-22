'use client';

import React, { useState } from 'react';
import { Bot, Check, MessageCircle, Send, User, X } from 'lucide-react';
import { ScheduleEvent } from '@/types/schedule';

interface ScheduleChatProps {
  events: ScheduleEvent[];
  apiKey: string;
  onApplyEvents: (events: ScheduleEvent[]) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ChatAction {
  type: 'add' | 'update' | 'delete' | 'none';
  eventId?: string;
  matchTitle?: string;
  event?: Partial<ScheduleEvent>;
}

function makeId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const ScheduleChat: React.FC<ScheduleChatProps> = ({ events, apiKey, onApplyEvents }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hola. Puedo agendar, corregir o eliminar actividades de tu horario. Por ejemplo: “agenda inglés el sábado a las 2 pm por una hora”.' },
  ]);

  const applyActions = (actions: ChatAction[]) => {
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
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
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
  };

  return (
    <>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} title="Abrir asistente de agenda" className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-3 font-bold text-sm shadow-xl shadow-emerald-500/20 transition-colors">
          <MessageCircle className="w-5 h-5" /> Chat de agenda
        </button>
      )}
      {isOpen && (
        <aside className="fixed bottom-5 right-5 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(620px,calc(100vh-2rem))] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-950">
            <div className="flex items-center gap-2"><Bot className="w-5 h-5 text-emerald-400" /><div><p className="text-sm font-bold text-white">Asistente de agenda</p><p className="text-[11px] text-slate-400">Crea y corrige tus eventos</p></div></div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-white" title="Cerrar chat"><X className="w-4 h-4" /></button>
          </header>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`flex gap-2 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.role === 'assistant' && <Bot className="w-4 h-4 mt-1 text-emerald-400 shrink-0" />}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${item.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>{item.text}</div>
                {item.role === 'user' && <User className="w-4 h-4 mt-1 text-indigo-300 shrink-0" />}
              </div>
            ))}
            {isSending && <div className="text-xs text-slate-400 flex items-center gap-2"><Check className="w-3 h-3 animate-pulse" /> Pensando...</div>}
          </div>
          <form onSubmit={sendMessage} className="p-3 border-t border-slate-700 flex gap-2">
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ej: cambia inglés del sábado a las 3 pm" className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500" disabled={isSending} />
            <button type="submit" disabled={isSending || !message.trim()} title="Enviar mensaje" className="p-2 rounded-xl bg-emerald-500 text-slate-950 disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </form>
        </aside>
      )}
    </>
  );
};

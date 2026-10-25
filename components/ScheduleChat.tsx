'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Settings as SettingsIcon, Undo2, User, X } from 'lucide-react';
import { ChatAction, ScheduleEvent } from '@/types/schedule';
import { makeId } from '@/lib/schedule-utils';

interface ScheduleChatProps {
  events: ScheduleEvent[];
  geminiKey?: string;
  groqKey?: string;
  timezone: string;
  /** true si hay alguna clave de IA (del usuario o del servidor) */
  aiReady: boolean;
  onApplyEvents: (events: ScheduleEvent[]) => void;
  onOpenSettings: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  /** Estado previo para poder deshacer los cambios que hizo este mensaje */
  undo?: { before: ScheduleEvent[]; after: ScheduleEvent[] };
  undone?: boolean;
}

const SUGGESTIONS = [
  'Agenda inglés el sábado a las 2 pm por una hora',
  '¿Qué tengo mañana?',
  '¿Cuándo tengo tiempo libre el miércoles?',
  'Mueve mi turno del viernes una hora más tarde',
];

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hola 👋 Puedo agendar, mover o eliminar actividades y responder preguntas sobre tu horario. Por ejemplo: "agenda gimnasio lunes y miércoles a las 6 pm".',
};

function applyActions(events: ScheduleEvent[], actions: ChatAction[]): ScheduleEvent[] {
  let next = [...events];
  for (const action of actions) {
    if (action.type === 'add' && action.event?.title && action.event.dayOfWeek && action.event.startTime && action.event.endTime) {
      next.push({
        id: makeId(),
        title: action.event.title,
        type: action.event.type || 'personal',
        dayOfWeek: action.event.dayOfWeek,
        startTime: action.event.startTime,
        endTime: action.event.endTime,
        location: action.event.location,
        teacher: action.event.teacher,
        notes: action.event.notes,
      });
    } else if (action.type === 'update' && action.eventId && action.event) {
      next = next.map((ev) => (ev.id === action.eventId ? { ...ev, ...action.event } : ev));
    } else if (action.type === 'delete' && action.eventId) {
      next = next.filter((ev) => ev.id !== action.eventId);
    }
  }
  return next;
}

export const ScheduleChat: React.FC<ScheduleChatProps> = ({ events, geminiKey, groqKey, timezone, aiReady, onApplyEvents, onOpenSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || isSending) return;
    setMessage('');

    const history = messages
      .filter((m) => m.id !== 'welcome' && !m.error)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((current) => [...current, { id: makeId(), role: 'user', text: clean }]);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history, events, timezone, geminiKey: geminiKey || undefined, groqKey: groqKey || undefined }),
      });
      const data = await response.json().catch(() => ({ success: false, error: 'El servidor no respondió correctamente.' }));
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo procesar el pedido.');

      const actions: ChatAction[] = Array.isArray(data.actions) ? data.actions : [];
      const next = applyActions(events, actions);
      const changed = JSON.stringify(next) !== JSON.stringify(events);
      if (changed) onApplyEvents(next);

      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: 'assistant',
          text: data.reply,
          ...(changed ? { undo: { before: events, after: next } } : {}),
        },
      ]);
    } catch (error: any) {
      const text = error?.message === 'Failed to fetch' ? 'Sin conexión a internet. Revisa tu red e intenta de nuevo.' : error?.message;
      setMessages((current) => [...current, { id: makeId(), role: 'assistant', text: `No pude hacerlo: ${text}`, error: true }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleUndo = (msg: ChatMessage) => {
    if (!msg.undo) return;
    onApplyEvents(msg.undo.before);
    setMessages((current) => [
      ...current.map((m) => (m.id === msg.id ? { ...m, undone: true } : m)),
      { id: makeId(), role: 'assistant', text: 'Listo, deshice ese cambio.' },
    ]);
  };

  const currentSnapshot = JSON.stringify(events);
  const showSuggestions = messages.length <= 1 && !isSending;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Abrir asistente de agenda"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-3 font-bold text-sm shadow-xl shadow-emerald-500/20 transition-colors"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <MessageCircle className="w-5 h-5" /> Chat de agenda
        </button>
      )}
      {isOpen && (
        <aside
          className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 sm:w-[380px] sm:h-[min(620px,calc(100dvh-2.5rem))] flex flex-col bg-slate-900 sm:border border-slate-700 sm:rounded-2xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-title"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-950">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-400" />
              <div>
                <p id="chat-title" className="text-sm font-bold text-white">Asistente de agenda</p>
                <p className="text-[11px] text-slate-400">Crea, cambia y consulta tus actividades</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-white" title="Cerrar chat" aria-label="Cerrar chat">
              <X className="w-4 h-4" />
            </button>
          </header>

          {!aiReady && (
            <div className="m-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
              <p>Para usar el chat necesitas una clave gratuita de IA (Groq o Google Gemini). Toma 1 minuto y no pide tarjeta.</p>
              <button onClick={onOpenSettings} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1.5 font-semibold">
                <SettingsIcon className="w-3.5 h-3.5" /> Configurar IA
              </button>
            </div>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3" aria-live="polite">
            {messages.map((item) => (
              <div key={item.id} className={`flex gap-2 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {item.role === 'assistant' && <Bot className="w-4 h-4 mt-1 text-emerald-400 shrink-0" />}
                <div className="max-w-[85%] space-y-1">
                  <div
                    className={`rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      item.role === 'user' ? 'bg-indigo-600 text-white' : item.error ? 'bg-red-500/10 text-red-200 border border-red-500/20' : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {item.text}
                  </div>
                  {item.undo && !item.undone && JSON.stringify(item.undo.after) === currentSnapshot && (
                    <button onClick={() => handleUndo(item)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-1">
                      <Undo2 className="w-3 h-3" /> Deshacer
                    </button>
                  )}
                </div>
                {item.role === 'user' && <User className="w-4 h-4 mt-1 text-indigo-300 shrink-0" />}
              </div>
            ))}
            {isSending && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando...
              </div>
            )}
            {showSuggestions && aiReady && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => send(suggestion)}
                    className="text-[11px] text-left rounded-full border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 px-3 py-1.5"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(message);
            }}
            className="p-3 border-t border-slate-700 flex gap-2"
          >
            <input
              ref={inputRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ej: cambia inglés del sábado a las 3 pm"
              aria-label="Mensaje para el asistente"
              className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={isSending}
              maxLength={2000}
            />
            <button type="submit" disabled={isSending || !message.trim()} title="Enviar mensaje" aria-label="Enviar mensaje" className="p-2 rounded-xl bg-emerald-500 text-slate-950 disabled:opacity-40">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
};

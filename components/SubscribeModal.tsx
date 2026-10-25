'use client';

import React from 'react';
import { Calendar, X } from 'lucide-react';

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscribeUrl: string;
  copied: boolean;
  onCopyLink: () => void;
}

/** Se muestra en la app instalada de iPhone, donde iOS no deja abrir enlaces webcal directamente */
export const SubscribeModal: React.FC<SubscribeModalProps> = ({ isOpen, onClose, subscribeUrl, copied, onCopyLink }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="subscribe-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 id="subscribe-title" className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Suscribir en iPhone
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300">
            Desde la app instalada, iOS no abre enlaces de calendario. Ya copiamos tu enlace: termina la suscripción en Safari.
          </p>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <p className="font-semibold text-white mb-2">Tu enlace de suscripción:</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={subscribeUrl}
                aria-label="Enlace de suscripción"
                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono"
                onFocus={(e) => e.target.select()}
              />
              <button onClick={onCopyLink} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold">
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          <ol className="space-y-2 pl-4 list-decimal text-xs text-slate-300">
            <li>Abre <strong>Safari</strong>.</li>
            <li>Pega el enlace en la barra de direcciones y toca <strong>Ir</strong>.</li>
            <li>Toca <strong>Suscribirse</strong> y luego <strong>Añadir</strong>.</li>
          </ol>

          <p className="text-amber-300/80 text-[11px]">
            Otra opción: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito, y pega el enlace.
          </p>

          <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-semibold text-sm">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

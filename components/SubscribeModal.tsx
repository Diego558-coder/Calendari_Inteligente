'use client';

import React from 'react';
import { Calendar, X } from 'lucide-react';

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscribeUrl: string;
  onCopyLink: () => void;
}

export const SubscribeModal: React.FC<SubscribeModalProps> = ({ 
  isOpen, 
  onClose, 
  subscribeUrl, 
  onCopyLink 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            Suscribir en iPhone
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
              <Calendar className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Abre en Safari</h3>
            <p className="text-sm text-slate-400 mt-1">
              En la PWA de iOS, los enlaces de calendario no se abren automáticamente.
            </p>
          </div>
          
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="font-semibold text-white mb-2">Tu enlace de suscripción:</p>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={subscribeUrl} 
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono"
                  onClick={(e) => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(subscribeUrl); }}
                />
                <button 
                  onClick={() => { navigator.clipboard.writeText(subscribeUrl); }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-semibold"
                >
                  Copiar
                </button>
              </div>
              <p className="text-[10px] text-emerald-400 mt-1">✅ Link copiado al portapapeles automáticamente</p>
            </div>
            
            <ol className="space-y-2 pl-4 list-decimal text-[11px] text-slate-300">
              <li>Abre <strong>Safari</strong> manualmente (fuera de esta app)</li>
              <li>Pega el enlace en la barra de direcciones y pulsa <strong>Ir</strong></li>
              <li>En el diálogo, pulsa <strong>"Suscribir"</strong></li>
              <li>Elige <strong>"Añadir a calendario existente"</strong> o crea uno nuevo</li>
            </ol>
            
            <p className="text-amber-300/80 text-[10px] text-center">
              💡 También: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito
            </p>
          </div>
          
          <button 
            onClick={() => { }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-semibold text-sm"
          >
            Entendido, voy a Safari
          </button>
        </div>
      </div>
    </div>
  );
};
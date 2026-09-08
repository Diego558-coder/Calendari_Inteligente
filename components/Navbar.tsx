'use client';

import React from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Sparkles, 
  Bell, 
  PlusCircle, 
  Settings as SettingsIcon,
  BookOpen,
  Briefcase
} from 'lucide-react';

export type ActiveTab = 'calendar' | 'agenda' | 'free-time' | 'notifications';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
  stats: {
    universityCount: number;
    workCount: number;
    freeHours: number;
    hasConflicts: boolean;
  };
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenUpload,
  onOpenSettings,
  stats,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo y Nombre */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                MiHorario <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">IA</span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">Universidad + Trabajo + Horas Libres</p>
            </div>
          </div>

          {/* Selector de pestañas desktop */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              Vista Semanal
            </button>

            <button
              onClick={() => setActiveTab('agenda')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'agenda'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-4 h-4" />
              Agenda Diaria
            </button>

            <button
              onClick={() => setActiveTab('free-time')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all relative ${
                activeTab === 'free-time'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Horas Libres
              <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded-full">
                {stats.freeHours}h
              </span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'notifications'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Bell className="w-4 h-4" />
              Avisos Celular
            </button>
          </nav>

          {/* Botones de acción principales */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-3.5 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Escanear Horario</span>
              <span className="sm:hidden">Escanear</span>
            </button>

            <button
              onClick={onOpenSettings}
              title="Ajustes y API Key"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Barra de navegación inferior móvil */}
      <div className="md:hidden border-t border-slate-800/80 bg-slate-900/95 px-2 py-1.5 flex justify-around items-center">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium ${
            activeTab === 'calendar' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Semana
        </button>

        <button
          onClick={() => setActiveTab('agenda')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium ${
            activeTab === 'agenda' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Clock className="w-4 h-4" />
          Agenda
        </button>

        <button
          onClick={() => setActiveTab('free-time')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium ${
            activeTab === 'free-time' ? 'text-amber-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Libres ({stats.freeHours}h)
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium ${
            activeTab === 'notifications' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Bell className="w-4 h-4" />
          Avisos
        </button>
      </div>
    </header>
  );
};


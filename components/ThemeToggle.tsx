'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const isDark = theme === 'system' 
        ? window.matchMedia('(prefers-color-scheme: dark)').matches 
        : theme === 'dark';
      root.classList.toggle('dark', isDark);
      setResolved(isDark ? 'dark' : 'light');
      localStorage.setItem('theme', theme);
    };
    update();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem('theme') as typeof theme | null;
    if (saved) { setTheme(saved); }
  }, []);

  return (
    <select 
      value={theme} 
      onChange={(e) => setTheme(e.target.value as typeof theme)}
      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs"
      aria-label="Tema de color"
      title="Cambiar tema de color"
    >
      <option value="system">Sistema <Monitor className="w-3 h-3 inline" /></option>
      <option value="light">Claro <Sun className="w-3 h-3 inline" /></option>
      <option value="dark">Oscuro <Moon className="w-3 h-3 inline" /></option>
    </select>
  );
}
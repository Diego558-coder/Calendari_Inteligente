'use client';

import { useEffect, useCallback } from 'react';

export function useKeyboardShortcuts(
  onNewEvent: () => void,
  onOpenUpload: () => void,
  onOpenSettings: () => void,
  onToday: () => void
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          onNewEvent();
          break;
        case 'u':
          e.preventDefault();
          onOpenUpload();
          break;
        case 's':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onOpenSettings();
          }
          break;
        case 't':
          e.preventDefault();
          onToday();
          break;
        case 'k':
        case '/':
          e.preventDefault();
          // Focus search if exists
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewEvent, onOpenUpload, onOpenSettings, onToday]);
}
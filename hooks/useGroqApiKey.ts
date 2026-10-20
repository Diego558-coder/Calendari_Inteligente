'use client';

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';

const STORAGE_KEY_GROQ_KEY = 'mihorario_groq_key_v1';

export function useGroqApiKey() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const loadKey = async () => {
      if (typeof window !== 'undefined') {
        const savedKey = await storage.getItem<string>(STORAGE_KEY_GROQ_KEY);
        setApiKey(savedKey || '');
      }
    };
    loadKey();
  }, []);

  const saveApiKey = useCallback(async (key: string) => {
    setApiKey(key);
    if (typeof window !== 'undefined') {
      await storage.setItem(STORAGE_KEY_GROQ_KEY, key);
    }
  }, []);

  return {
    apiKey,
    saveApiKey,
  };
}
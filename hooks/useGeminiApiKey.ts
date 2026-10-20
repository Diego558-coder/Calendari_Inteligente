'use client';

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';

const STORAGE_KEY_APIKEY = 'mihorario_gemini_key_v1';

export function useGeminiApiKey() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const loadKey = async () => {
      if (typeof window !== 'undefined') {
        const savedKey = await storage.getApiKey();
        setApiKey(savedKey);
      }
    };
    loadKey();
  }, []);

  const saveApiKey = useCallback(async (key: string) => {
    setApiKey(key);
    if (typeof window !== 'undefined') {
      await storage.setApiKey(key);
    }
  }, []);

  return {
    apiKey,
    saveApiKey,
  };
}
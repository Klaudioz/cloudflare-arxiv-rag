/**
 * Zustand store for application state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, AppState } from '@/types';

interface Store extends AppState {
  setApiKey: (key: string) => void;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCacheHitRate: (rate: number) => void;
}

export const useAppStore = create<Store>()(
  persist(
    (set) => ({
      apiKey: localStorage.getItem('arxiv-rag-api-key') || '',
      messages: [],
      loading: false,
      error: null,
      cacheHitRate: 0,

      setApiKey: (key: string) => {
        localStorage.setItem('arxiv-rag-api-key', key);
        set({ apiKey: key });
      },

      addMessage: (message: Message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      clearMessages: () => set({ messages: [] }),

      setLoading: (loading: boolean) => set({ loading }),

      setError: (error: string | null) => set({ error }),

      setCacheHitRate: (rate: number) => set({ cacheHitRate: rate }),
    }),
    {
      name: 'arxiv-rag-store',
    }
  )
);

import { create } from 'zustand';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export type LogEntry = {
  id: string;
  ts: number;
  level: LogLevel;
  message: string;
  details?: string;
  source?: 'console' | 'window';
};

type LogState = {
  entries: LogEntry[];
  add: (entry: Omit<LogEntry, 'id'>) => void;
  clear: () => void;
};

const MAX_ENTRIES = 300;

let seq = 0;

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  add: (entry) =>
    set((state) => {
      const id = `${entry.ts}-${seq++}`;
      const next = [...state.entries, { ...entry, id }];
      return { entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next };
    }),
  clear: () => set({ entries: [] }),
}));

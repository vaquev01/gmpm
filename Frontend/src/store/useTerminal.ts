import { create } from 'zustand';

export type ViewId =
  | 'executive'
  | 'macro'
  | 'meso'
  | 'micro'
  | 'liquidity'
  | 'currency'
  | 'signals'
  | 'risk'
  | 'incubator'
  | 'lab'
  | 'scanner';

interface TerminalState {
  view: ViewId;
  setView: (v: ViewId) => void;
}

export const useTerminal = create<TerminalState>((set) => ({
  view: 'executive',
  setView: (view) => set({ view }),
}));

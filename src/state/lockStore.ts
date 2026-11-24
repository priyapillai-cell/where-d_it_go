import { create } from 'zustand';

interface LockState {
  /** Whether the user has authenticated in this foreground session. */
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;
}

export const useLockStore = create<LockState>((set) => ({
  unlocked: false,
  setUnlocked: (unlocked) => set({ unlocked }),
}));

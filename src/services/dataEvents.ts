import { useAppStore } from '@/state/appStore';
import { logger } from '@/utils/logger';

type Listener = () => Promise<void> | void;
const listeners = new Set<Listener>();

/** Lets services react to committed writes (e.g. budget alerts) without import cycles. */
export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call after every committed write: refreshes cached state and notifies listeners. */
export async function notifyDataChanged(): Promise<void> {
  await useAppStore.getState().refresh();
  for (const listener of listeners) {
    try {
      await listener();
    } catch (error) {
      logger.warn('Data change listener failed', error);
    }
  }
}

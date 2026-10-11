import { useCallback, useRef, useState } from 'react';
import { api } from './api';
import type { AppSettings } from './types';
import { toast } from '../components/ui';

/**
 * Settings with safe saving: changes show at once and are sent to the server one at a time, in order.
 * (Replies are not copied back over the page, so a slow reply can never undo a newer change.)
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const load = useCallback(() => api.settings().then(setSettings), []);
  const save = useCallback((full: Partial<AppSettings> & { seriesUnuse?: { key: string; name: string } }) => {
    const { seriesUnuse: _, ...patch } = full;
    setSettings((cur) => (cur ? { ...cur, ...patch } : cur));
    queue.current = queue.current.then(async () => {
      try {
        await api.saveSettings(full);
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e));
        await api.settings().then(setSettings, () => undefined); // show what is really saved
      }
    });
  }, []);
  return { settings, setSettings, load, save };
}

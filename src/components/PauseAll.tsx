import { useCallback, useEffect, useState } from 'react';
import { getPause, setPause, type PauseState } from '../lib/api';
import { toast, when } from './ui';

/** Other parts of the app can listen for this to reload after a pause / resume. */
const changed = (p: PauseState) => window.dispatchEvent(new CustomEvent('tt-pause', { detail: p }));

/** ⏸ Shared state for the header button and the red banner. Re-checked every minute and when the app comes back. */
export function usePause(enabled = true) {
  const [p, setP] = useState<PauseState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { getPause().then(setP).catch(() => {}); }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(load, 60_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    const onChange = (e: Event) => setP((e as CustomEvent<PauseState>).detail);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('tt-pause', onChange);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('tt-pause', onChange); };
  }, [load, enabled]);
  const flip = async (on: boolean) => {
    setBusy(true);
    try {
      const next = await setPause(on);
      changed(next);
      toast(on ? 'info' : 'success', on
        ? `Paused. Nothing runs until you press Resume${next.cancelled ? ` (${next.cancelled} running job${next.cancelled > 1 ? 's' : ''} stopped)` : ''}.`
        : 'Resumed. Everything works again.');
    } catch (e) {
      toast('error', `${on ? 'Pause' : 'Resume'} failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };
  return { p, busy, flip };
}

/** The big red button in the header. While paused it turns into a green Resume button. */
export function PauseButton({ state }: { state: ReturnType<typeof usePause> }) {
  const { p, busy, flip } = state;
  if (!p) return null;
  return p.on ? (
    <button className="tap ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-500 px-4 text-sm font-extrabold uppercase tracking-wide text-ink-950 shadow-[0_0_18px_rgba(16,185,129,0.55)] disabled:opacity-60 md:ml-3"
      disabled={busy} onClick={() => flip(false)} aria-label="Resume the app">
      <span aria-hidden="true">▶</span> Resume
    </button>
  ) : (
    <button className="tap ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-red-300/60 bg-red-600 px-4 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_0_18px_rgba(239,68,68,0.6)] hover:bg-red-500 disabled:opacity-60 md:ml-3"
      disabled={busy} onClick={() => flip(true)} aria-label="Pause everything: stop AI, emails, posting and scheduled videos">
      <span aria-hidden="true" className="text-base leading-none">⏸</span> Pause all
    </button>
  );
}

/** Red banner under the header while paused. */
export function PausedBanner({ state }: { state: ReturnType<typeof usePause> }) {
  const { p, busy, flip } = state;
  if (!p?.on) return null;
  return (
    <div role="status" className="border-b border-red-400/40 bg-red-600/90 text-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-6">
        <p className="min-w-0 flex-1 text-sm">
          <b className="font-extrabold">⏸ PAUSED{p.at ? ` since ${when(p.at)}` : ''}.</b>{' '}
          No AI, no emails, no phone notifications, no posting and no scheduled videos until you resume.
        </p>
        <button className="tap min-h-[44px] rounded-xl bg-white px-4 text-sm font-extrabold text-red-700 disabled:opacity-60" disabled={busy} onClick={() => flip(false)}>▶ Resume</button>
      </div>
    </div>
  );
}

import { readJson, writeJson } from './store';
import { MASTER_AI_TEXT, MASTER_PAUSED_TEXT, masterSwitch } from './masterSwitch';

/**
 * ⏸ Pause everything (the big red button at the top of the app). While paused:
 * no paid AI call, no email, no phone notification, no GitHub job (make a video, send/post anywhere),
 * no scheduled run (timer videos, clean-up, TikTok link-back). Kept apart from Settings, so saving Settings never undoes it.
 * A failed read is NOT treated as "not paused": the error stops the caller instead.
 * 🎛️ Master (the owner's dashboard of all his apps) can pause the app too (same effect) or switch only its AI off
 * (`masterSwitch.ts`, fail-open: when Master can't be reached, only this app's own button counts).
 */
export interface PauseState { on: boolean; at?: string; cancelled?: number }

export const getPause = () => readJson<PauseState>('pause', { on: false });
export const setPause = (p: PauseState) => writeJson('pause', p);
export const isPaused = async () => (await getPause()).on || (await masterSwitch()).work;

export const PAUSED_TEXT = 'The app is paused (⏸). Press Resume at the top of the app first.';

/** Throws (HTTP 423) when paused here or from Master; `'ai'` also stops while Master has the AI switched off. */
export async function assertNotPaused(what = 'This', kind: 'work' | 'ai' = 'work'): Promise<void> {
  if ((await getPause()).on) throw Object.assign(new Error(`${what} is stopped: ${PAUSED_TEXT}`), { status: 423, paused: true });
  const m = await masterSwitch();
  if (m.work || (kind === 'ai' && m.ai)) throw Object.assign(new Error(`${what} is stopped: ${m.work ? MASTER_PAUSED_TEXT : MASTER_AI_TEXT}`), { status: 423, paused: true });
}

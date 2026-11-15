import { readJson, writeJson } from './store';

/**
 * ⏸ Pause everything (the big red button at the top of the app). While paused:
 * no paid AI call, no email, no phone notification, no GitHub job (make a video, send/post anywhere),
 * no scheduled run (timer videos, clean-up, TikTok link-back). Kept apart from Settings, so saving Settings never undoes it.
 * A failed read is NOT treated as "not paused": the error stops the caller instead.
 */
export interface PauseState { on: boolean; at?: string; cancelled?: number }

export const getPause = () => readJson<PauseState>('pause', { on: false });
export const setPause = (p: PauseState) => writeJson('pause', p);
export const isPaused = async () => (await getPause()).on;

export const PAUSED_TEXT = 'The app is paused (⏸). Press Resume at the top of the app first.';

/** Throws (HTTP 423) when paused. */
export async function assertNotPaused(what = 'This'): Promise<void> {
  if (await isPaused()) throw Object.assign(new Error(`${what} is stopped: ${PAUSED_TEXT}`), { status: 423, paused: true });
}

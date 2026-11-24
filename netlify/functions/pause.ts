import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { pauseView, setPause } from '../lib/pause';
import { cancelRuns } from '../lib/github';

export const config = { path: '/api/pause' };

/**
 * ⏸ GET /api/pause -> {on, at, master: {work, ai, url}} (master = what Master, the owner's apps dashboard, says)
 * POST {on: true}  -> pause everything now (and stop the GitHub jobs running right now)
 * POST {on: false} -> resume
 */
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'pause', 30);
  if (blocked) return blocked;
  if (req.method === 'GET') return json(await pauseView());
  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let on: boolean;
  try {
    on = z.object({ on: z.boolean() }).parse(await req.json()).on;
  } catch {
    return json({ error: 'Send {on: true} or {on: false}.' }, 400);
  }
  if (!on) {
    await setPause({ on: false, at: new Date().toISOString() });
    return json(await pauseView());
  }
  // Saved first, so every check sees it at once; then the jobs already running are stopped.
  const at = new Date().toISOString();
  await setPause({ on: true, at });
  const cancelled = await cancelRuns().catch(() => 0);
  await setPause({ on: true, at, cancelled });
  return json(await pauseView());
};

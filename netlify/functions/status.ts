import { guard, json } from '../lib/guard';
import { getSettings, getTikTok, readJson } from '../lib/store';
import { tiktokReady } from '../lib/tiktok';
import { dispatchReady } from '../lib/github';

export const config = { path: '/api/status' };

// GET /api/status -> what is set up, TikTok connection, today's AI use
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  const [settings, tt, ai] = await Promise.all([getSettings(), getTikTok(), readJson<{ day: string; n: number }>('ai', { day: '', n: 0 })]);
  const today = new Date().toISOString().slice(0, 10);
  return json({
    ready: { secret: !!process.env.APP_SECRET, tiktokApp: tiktokReady(), dispatch: dispatchReady() },
    tiktok: tt ? { connected: true, name: tt.name ?? null, expired: Date.now() > tt.refreshExpiresAt } : { connected: false },
    ai: { used: ai.day === today ? ai.n : 0, limit: settings.aiDailyLimit },
  });
};

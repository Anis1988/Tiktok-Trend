import { guard, json } from '../lib/guard';
import { getMeta, getSettings, getTikTok, getYouTube, readJson } from '../lib/store';
import { youtubeReady } from '../lib/youtube';
import { metaReady } from '../lib/meta';
import { tiktokReady } from '../lib/tiktok';
import { dispatchReady } from '../lib/github';

export const config = { path: '/api/status' };

// GET /api/status -> what is set up, TikTok / YouTube / Meta connections, today's AI use
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'status', 30);
  if (blocked) return blocked;
  const [settings, tt, yt, meta, ai] = await Promise.all([getSettings(), getTikTok(), getYouTube(), getMeta(), readJson<{ day: string; n: number }>('ai', { day: '', n: 0 })]);
  const today = new Date().toISOString().slice(0, 10);
  return json({
    ready: { secret: !!process.env.APP_SECRET, tiktokApp: tiktokReady(), youtubeApp: youtubeReady(), metaApp: metaReady(), dispatch: dispatchReady() },
    tiktok: tt ? { connected: true, name: tt.name ?? null, expired: Date.now() > tt.refreshExpiresAt } : { connected: false },
    youtube: yt ? { connected: true, name: yt.name ?? null } : { connected: false },
    meta: meta ? { connected: true, page: meta.pageName, instagram: meta.igName ?? (meta.igUserId ? 'connected' : null) } : { connected: false },
    ai: { used: ai.day === today ? ai.n : 0, limit: settings.aiDailyLimit },
  });
};

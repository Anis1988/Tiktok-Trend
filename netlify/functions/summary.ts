import { json, rateLimited } from '../lib/guard';
import { getSettings, listVideos, readJson } from '../lib/store';
import { EST_PER_CALL, type AiDays } from '../lib/aiUse';
import type { VideoRecord } from '../../src/lib/types';

export const config = { path: '/api/summary' };

/**
 * GET /api/summary -> 2–3 status lines + paid AI use, for the owner's "My apps" page (LifeTracker, GitHub Pages).
 * Read-only. Needs the app's access code (APP_ACCESS_TOKEN) in X-Access-Token. CORS: only that page's origin.
 */
const PAGE = 'https://anis1988.github.io';
const cors = (req: Request): Record<string, string> => (req.headers.get('origin') === PAGE ? {
  'Access-Control-Allow-Origin': PAGE, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'X-Access-Token', 'Access-Control-Max-Age': '600', Vary: 'Origin',
} : { Vary: 'Origin' });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const MODEL_NAME = (m: string) => m.replace(/^claude-/, 'Claude ').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/\b(opus|sonnet|haiku|fable)\b/i, (x) => x[0].toUpperCase() + x.slice(1));
const r2 = (x: number) => Math.round(x * 100) / 100;

function ago(iso: string, now: number): string {
  const d = Math.floor((now - Date.parse(iso)) / 86400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export default async (req: Request): Promise<Response> => {
  const h = cors(req);
  const origin = req.headers.get('origin');
  if (origin && origin !== PAGE && (() => { try { return new URL(origin).host !== new URL(req.url).host; } catch { return true; } })()) return json({ error: 'Origin not allowed.' }, 403, h);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405, h);
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return json({ error: 'APP_ACCESS_TOKEN is not set on the server.' }, 503, h);
  if (!safeEqual(req.headers.get('x-access-token') ?? '', token)) return json({ error: 'Missing or wrong access code.' }, 401, h);
  const limited = rateLimited(req, 'summary', 20);
  if (limited) return new Response(limited.body, { status: limited.status, headers: { ...Object.fromEntries(limited.headers), ...h } });

  const [videos, settings, days, today] = await Promise.all([listVideos(), getSettings(), readJson<AiDays>('aiDays', {}), readJson<{ day: string; n: number }>('ai', { day: '', n: 0 })]);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const lines: { icon: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];

  const waiting = videos.filter((v) => v.status === 'pending' || v.status === 'script');
  const scripts = waiting.filter((v) => v.status === 'script').length;
  lines.push(waiting.length
    ? { icon: '🎬', text: `${waiting.length} video${waiting.length > 1 ? 's' : ''} waiting for you${scripts ? ` (${scripts} script${scripts > 1 ? 's' : ''} to check)` : ''}`, tone: 'warn' }
    : { icon: '🎬', text: 'Nothing waiting for you', tone: 'good' });

  const postedAt = (v: VideoRecord) => v.tiktok?.postedAt ?? (v.status === 'posted' ? v.updatedAt : undefined) ?? (v.platforms?.youtube?.state === 'sent' ? v.platforms.youtube.at : undefined);
  const last = videos.map((v) => ({ v, at: postedAt(v) })).filter((x): x is { v: VideoRecord; at: string } => !!x.at).sort((a, b) => b.at.localeCompare(a.at))[0];
  lines.push(last
    ? { icon: '📤', text: `Last posted ${ago(last.at, now)}: ${last.v.title.slice(0, 50)}`, tone: now - Date.parse(last.at) > 3 * 86400_000 ? 'warn' : 'info' }
    : { icon: '📤', text: 'Nothing posted yet', tone: 'info' });

  if (settings.series.on) {
    const s = videos.find((v) => v.series && v.createdAt.startsWith(day) && v.status !== 'failed');
    lines.push(s ? { icon: '📅', text: `Series today: ${s.series!.pick}`, tone: 'good' } : { icon: '📅', text: 'Series: today’s video not made yet', tone: 'info' });
  }

  // Paid AI (the script writer). Per-day history started 2026-10-16; calls counted only in "ai" (before that) are estimated.
  const todayRow = days[day] ?? { calls: 0, usd: 0, est: 0, byModel: {} };
  const extraToday = Math.max(0, (today.day === day ? today.n : 0) - todayRow.calls);
  const sum = (from: string) => {
    let calls = 0, usd = 0;
    for (const [d, r] of Object.entries(days)) if (d >= from && d <= day) { calls += r.calls; usd += r.usd; }
    return { calls: calls + extraToday, usd: r2(usd + extraToday * EST_PER_CALL) };
  };
  const weekFrom = new Date(now - 6 * 86400_000).toISOString().slice(0, 10);
  const monthFrom = `${day.slice(0, 7)}-01`;
  const estimate = extraToday > 0 || Object.entries(days).some(([d, r]) => d >= (weekFrom < monthFrom ? weekFrom : monthFrom) && r.est > 0);
  return json({
    app: 'trend-videos',
    lines: lines.slice(0, 3),
    ai: {
      today: sum(day),
      week: sum(weekFrom),
      month: sum(monthFrom),
      byModel: Object.entries(todayRow.byModel).map(([m, x]) => ({ model: MODEL_NAME(m), calls: x.calls, usd: r2(x.usd) })),
      estimate,
    },
    at: new Date(now).toISOString(),
  }, 200, h);
};

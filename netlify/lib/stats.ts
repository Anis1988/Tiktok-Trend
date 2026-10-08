import type { VideoRecord, VideoStats } from '../../src/lib/types';
import { getMeta, listVideos, writeJson } from './store';
import { youtubeReadToken } from './youtube';

/**
 * "Learn from your results": views and likes of your past videos, so the AI picks topics and hooks like your best ones.
 * - YouTube: read automatically (views, likes, comments) for videos sent there.
 * - Instagram: likes and comments, read automatically for videos posted there.
 * - TikTok: you type the views (and likes) on the video in the app (TikTok doesn't share them with apps without review).
 */
const DAYS = 45;

/** Updates the numbers of recent videos sent to YouTube / Instagram. Never throws (numbers are a bonus). */
export async function refreshStats(log: (...a: unknown[]) => void = console.log): Promise<void> {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const all = await listVideos();
  const recent = all.filter((v) => v.createdAt >= since);
  const fresh = new Map<string, Partial<VideoStats>>();
  const at = new Date().toISOString();

  const yt = recent.filter((v) => v.platforms?.youtube?.state === 'sent' && v.platforms.youtube.id);
  if (yt.length) {
    try {
      const key = process.env.YOUTUBE_API_KEY?.trim();
      const token = await youtubeReadToken(); // private videos need the login; a key only sees public ones
      if (token || key) {
        for (let i = 0; i < yt.length; i += 50) {
          const batch = yt.slice(i, i + 50);
          const q = new URLSearchParams({ part: 'statistics', id: batch.map((v) => v.platforms!.youtube!.id!).join(',') });
          if (!token && key) q.set('key', key);
          const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { items?: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] };
          for (const it of j.items ?? []) {
            const v = batch.find((x) => x.platforms?.youtube?.id === it.id);
            if (v) fresh.set(v.id, { ...fresh.get(v.id), youtube: { views: Number(it.statistics?.viewCount ?? 0), likes: Number(it.statistics?.likeCount ?? 0), comments: Number(it.statistics?.commentCount ?? 0), at } });
          }
        }
      }
    } catch (e) {
      log('YouTube numbers not updated:', e instanceof Error ? e.message : e);
    }
  }

  const ig = recent.filter((v) => v.platforms?.instagram?.state === 'sent' && v.platforms.instagram.id);
  if (ig.length) {
    try {
      const meta = await getMeta();
      if (meta) {
        for (const v of ig) {
          const res = await fetch(`https://graph.facebook.com/v23.0/${v.platforms!.instagram!.id}?fields=like_count,comments_count&access_token=${encodeURIComponent(meta.pageToken)}`, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) continue;
          const j = (await res.json()) as { like_count?: number; comments_count?: number };
          fresh.set(v.id, { ...fresh.get(v.id), instagram: { likes: j.like_count ?? 0, comments: j.comments_count ?? 0, at } });
        }
      }
    } catch (e) {
      log('Instagram numbers not updated:', e instanceof Error ? e.message : e);
    }
  }

  if (!fresh.size) return;
  // Re-read just before saving, so a video approved meanwhile isn't undone.
  const latest = await listVideos();
  for (const v of latest) {
    const f = fresh.get(v.id);
    if (f) v.stats = { ...v.stats, ...f };
  }
  await writeJson('videos', latest);
  log(`Updated the numbers of ${fresh.size} videos`);
}

/** One number to compare videos: the most views on any platform (likes count a bit when there are no views). */
export function score(v: VideoRecord): number | null {
  const s = v.stats;
  if (!s) return null;
  const views = Math.max(s.tiktok?.views ?? 0, s.youtube?.views ?? 0);
  const likes = Math.max(s.tiktok?.likes ?? 0, s.youtube?.likes ?? 0, s.instagram?.likes ?? 0);
  if (!views && !likes) return null;
  return views || likes * 25;
}

const n = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(Math.round(x)));

/** A short note for the AI: your best and weakest recent videos. Empty until at least 3 videos have numbers. */
export function resultsNote(videos: VideoRecord[]): string {
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const scored = videos.filter((v) => v.createdAt >= since && v.status !== 'rejected').map((v) => ({ v, s: score(v) })).filter((x): x is { v: VideoRecord; s: number } => x.s !== null);
  if (scored.length < 3) return '';
  scored.sort((a, b) => b.s - a.s);
  const k = Math.min(3, Math.floor(scored.length / 2) || 1);
  const line = ({ v, s }: { v: VideoRecord; s: number }) => `- "${v.title}" (topic: ${v.topic.slice(0, 80)}; hook: "${v.hook}"${v.extras?.length ? `; extras: ${v.extras.join(', ')}` : ''}): ${n(s)} ${s === Math.max(v.stats?.tiktok?.views ?? 0, v.stats?.youtube?.views ?? 0) ? 'views' : 'points'}`;
  return [
    `How this channel's recent videos did (real numbers; learn from them: prefer the kinds of topics, hooks and tone of the best ones, avoid what the weakest have in common, but never copy a title or repeat a topic):`,
    'Best:', ...scored.slice(0, k).map(line),
    'Weakest:', ...scored.slice(-k).reverse().map(line),
  ].join('\n');
}

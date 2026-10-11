import type { VideoRecord } from '../../src/lib/types';
import { getTikTok, listVideos, writeJson } from './store';
import { canList, myTikToks, type MyTikTok } from './tiktok';

/**
 * 🔗 After you post a video from your TikTok drafts, find that post (by its caption, posted after the video was sent)
 * and keep its link and numbers. Read-only: never posts or changes anything on TikTok. Needs video.list.
 */
const words = (t: string) => new Set(t.toLowerCase().normalize('NFKD').replace(/#\w+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3));
const tags = (t: string) => new Set((t.toLowerCase().match(/#[\w]+/g) ?? []).map((x) => x.slice(1)));

/** How well a TikTok post fits a video (0 = not at all, 1 = same caption). You may edit the caption a little in TikTok. */
export function matchScore(v: Pick<VideoRecord, 'caption' | 'hashtags'>, p: Pick<MyTikTok, 'description'>): number {
  const a = words(v.caption), b = words(p.description);
  let same = 0;
  for (const w of a) if (b.has(w)) same++;
  const text = a.size ? same / a.size : 0;
  const t = tags(p.description);
  const tagHit = v.hashtags.length ? v.hashtags.filter((h) => t.has(h.toLowerCase())).length / v.hashtags.length : 0;
  return Math.max(text, text * 0.6 + tagHit * 0.4);
}

export const MATCH = 0.6;

export async function linkTikTok(log: (...a: unknown[]) => void = console.log, opts: { only?: string } = {}): Promise<{ linked: number; updated: number; reason?: string }> {
  const auth = await getTikTok();
  if (!auth) return { linked: 0, updated: 0, reason: 'TikTok is not connected.' };
  if (!canList(auth.scope)) return { linked: 0, updated: 0, reason: 'Connect TikTok again in Settings so the app may see your posts (one time).' };
  const since = new Date(Date.now() - 45 * 86400_000).toISOString();
  const all = await listVideos();
  const want = all.filter((v) => v.tiktok?.sentAt && v.tiktok.sentAt >= since && (!opts.only || v.id === opts.only));
  if (!want.length) return { linked: 0, updated: 0 };
  const posts = await myTikToks(60);
  const taken = new Set(all.map((v) => v.tiktok?.postId).filter(Boolean));
  const at = new Date().toISOString();
  const changes = new Map<string, Partial<VideoRecord>>();
  let linked = 0;
  // Oldest first, so each post goes to the video sent just before it.
  for (const v of [...want].sort((x, y) => x.tiktok!.sentAt!.localeCompare(y.tiktok!.sentAt!))) {
    let post = v.tiktok?.postId ? posts.find((p) => p.id === v.tiktok!.postId) : undefined;
    if (!post && !v.tiktok?.postId) {
      const sent = Date.parse(v.tiktok!.sentAt!) - 3600_000;
      const best = posts
        .filter((p) => !taken.has(p.id) && Date.parse(p.createdAt) >= sent)
        .map((p) => ({ p, s: matchScore(v, p) }))
        .filter((x) => x.s >= MATCH)
        .sort((x, y) => y.s - x.s || x.p.createdAt.localeCompare(y.p.createdAt))[0];
      if (best) {
        post = best.p;
        taken.add(post.id);
        linked++;
        log(`TikTok: "${v.title}" is posted: ${post.url}`);
      }
    }
    if (!post) continue;
    changes.set(v.id, {
      status: v.status === 'sent' || v.status === 'approved' ? 'posted' : v.status,
      tiktok: { ...v.tiktok, postId: post.id, url: post.url, postedAt: v.tiktok?.postedAt ?? post.createdAt },
      stats: { ...v.stats, tiktok: { views: post.views, likes: post.likes, comments: post.comments, at, auto: true } },
    });
  }
  if (!changes.size) return { linked: 0, updated: 0 };
  // Re-read just before saving, so a change made meanwhile isn't undone.
  const latest = await listVideos();
  for (const v of latest) { const c = changes.get(v.id); if (c) Object.assign(v, c, { stats: { ...v.stats, ...c.stats } }); }
  await writeJson('videos', latest);
  return { linked, updated: changes.size - linked };
}

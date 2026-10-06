import { writeFile } from 'node:fs/promises';

export interface Clip {
  path: string;
  by: string;
  url: string;
  site: 'Pexels' | 'Pixabay';
}

interface Candidate {
  key: string; // "site:id", so a clip is never used twice in one video
  link: string;
  width: number;
  height: number;
  duration?: number; // seconds, when the site says
  by: string;
  url: string;
  site: Clip['site'];
}

/**
 * Sharpest fit for a 1080x1920 video. Portrait clips first (closest to 1920 tall, at least 1280). Landscape clips are
 * cropped to vertical, which throws away most of the picture, so only big ones (1080 to 2160 tall), largest first.
 * Very short clips (under 5 s) would visibly loop, so they go last.
 */
function best(cands: Candidate[], used: Set<string>): Candidate[] {
  const free = cands.filter((c) => c.link && !used.has(c.key));
  const short = (c: Candidate) => (c.duration !== undefined && c.duration < 5 ? 1 : 0);
  const portrait = free.filter((c) => c.height > c.width && c.height >= 1280).sort((a, b) => short(a) - short(b) || Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
  const landscape = free.filter((c) => c.height <= c.width && c.height >= 1080 && c.height <= 2160).sort((a, b) => short(a) - short(b) || b.height - a.height);
  // Smaller clips only if nothing sharper exists: still better than a plain background.
  const rest = free.filter((c) => !portrait.includes(c) && !landscape.includes(c) && Math.min(c.width, c.height) >= 720 && c.height <= 2160).sort((a, b) => b.height - a.height);
  return [...portrait, ...landscape, ...rest];
}

/** Pexels (free key; new keys are paused, so it is only used if you already have one). */
async function pexels(query: string): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=15`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const j = (await res.json()) as { videos?: { id: number; url: string; duration?: number; user: { name: string }; video_files: { link: string; width: number; height: number; file_type: string }[] }[] };
  return (j.videos ?? []).flatMap((v) =>
    v.video_files.filter((f) => f.file_type === 'video/mp4').map((f) => ({ key: `pexels:${v.id}`, link: f.link, width: f.width, height: f.height, duration: v.duration, by: v.user.name, url: v.url, site: 'Pexels' as const })),
  );
}

/** Pixabay (free key, instant). Each video comes in several sizes. */
async function pixabay(query: string): Promise<Candidate[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&safesearch=true&per_page=20`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  type Size = { url: string; width: number; height: number };
  const j = (await res.json()) as { hits?: { id: number; pageURL: string; user: string; duration?: number; videos: Record<string, Size> }[] };
  return (j.hits ?? []).flatMap((h) =>
    Object.values(h.videos ?? {}).map((s) => ({ key: `pixabay:${h.id}`, link: s.url, width: s.width, height: s.height, duration: h.duration, by: h.user, url: h.pageURL, site: 'Pixabay' as const })),
  );
}

export const footageReady = () => !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);

/**
 * Free stock video for one scene: Pexels if you have a key, otherwise (or when it finds nothing) Pixabay.
 * Returns null when there is no key or nothing fits; the scene then uses a plain background.
 */
export async function findClip(query: string, used: Set<string>, outPath: string): Promise<Clip | null> {
  for (const source of [pexels, pixabay]) {
    let cands: Candidate[] = [];
    try {
      cands = await source(query);
    } catch (e) {
      console.log(`Footage search "${query}" failed:`, e instanceof Error ? e.message : e);
      continue;
    }
    // One size per video: the best fitting one.
    const seen = new Set<string>();
    for (const c of best(cands, used)) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const dl = await fetch(c.link, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
      if (!dl?.ok) continue;
      await writeFile(outPath, Buffer.from(await dl.arrayBuffer()));
      used.add(c.key);
      return { path: outPath, by: c.by, url: c.url, site: c.site };
    }
  }
  return null;
}

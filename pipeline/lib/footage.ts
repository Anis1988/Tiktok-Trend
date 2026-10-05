import { writeFile } from 'node:fs/promises';

export interface Clip {
  path: string;
  by: string;
  url: string;
}

interface PexelsVideo {
  id: number;
  url: string;
  user: { name: string };
  video_files: { link: string; width: number; height: number; file_type: string }[];
}

/**
 * Free stock video from Pexels (free API key). Portrait clips only; each clip is used once per video.
 * Returns null when there is no key or nothing fits (the video then uses a plain background).
 */
export async function findClip(query: string, used: Set<number>, outPath: string): Promise<Clip | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const j = (await res.json()) as { videos?: PexelsVideo[] };
  for (const v of j.videos ?? []) {
    if (used.has(v.id)) continue;
    const files = v.video_files
      .filter((f) => f.file_type === 'video/mp4' && f.height > f.width && f.height >= 960)
      .sort((a, b) => Math.abs(a.height - 1280) - Math.abs(b.height - 1280));
    const f = files[0];
    if (!f) continue;
    const dl = await fetch(f.link, { signal: AbortSignal.timeout(60_000) });
    if (!dl.ok) continue;
    await writeFile(outPath, Buffer.from(await dl.arrayBuffer()));
    used.add(v.id);
    return { path: outPath, by: v.user.name, url: v.url };
  }
  return null;
}

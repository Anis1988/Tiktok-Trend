import { getStore } from '@netlify/blobs';
import type { AppSettings, VideoRecord } from '../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../src/lib/types';

/**
 * Netlify Blobs. Inside Netlify functions it just works; from GitHub Actions it needs
 * NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (a personal access token).
 */
export function store(name: 'tt' | 'tt-files' | 'tt-media') {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) return getStore({ name, siteID, token });
  // In the website's functions, reads of the small data store are "strong": a video saved by GitHub a second ago
  // shows at once (the default can be up to a minute old), and a save never starts from an old list.
  return name === 'tt' ? getStore({ name, consistency: 'strong' }) : getStore(name);
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  return ((await store('tt').get(key, { type: 'json' })) as T | null) ?? fallback;
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await store('tt').setJSON(key, value);
}

export async function getSettings(): Promise<AppSettings> {
  const saved = await readJson<Partial<AppSettings>>('settings', {});
  // Nested groups are merged too, so options added later get their default instead of "off".
  return {
    ...DEFAULT_SETTINGS, ...saved,
    effects: { ...DEFAULT_SETTINGS.effects, ...saved.effects },
    captionStyle: { ...DEFAULT_SETTINGS.captionStyle, ...saved.captionStyle },
    cleanup: { ...DEFAULT_SETTINGS.cleanup, ...saved.cleanup },
  };
}

export const listVideos = () => readJson<VideoRecord[]>('videos', []);

export async function getVideo(id: string): Promise<VideoRecord | undefined> {
  return (await listVideos()).find((v) => v.id === id);
}

/** Insert or update one video (newest first, last 200 kept). */
export async function saveVideo(v: VideoRecord): Promise<void> {
  const all = await listVideos();
  const rest = all.filter((x) => x.id !== v.id);
  await writeJson('videos', [{ ...v, updatedAt: new Date().toISOString() }, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200));
}

/** Remove a video for good: its entry, the video file and the thumbnail. */
export async function deleteVideo(id: string): Promise<void> {
  const files = store('tt-files');
  await Promise.all([files.delete(`${id}.mp4`), files.delete(`${id}.jpg`)]);
  await writeJson('videos', (await listVideos()).filter((x) => x.id !== id));
}

export async function patchVideo(id: string, patch: Partial<VideoRecord>): Promise<VideoRecord | undefined> {
  const v = await getVideo(id);
  if (!v) return undefined;
  const next = { ...v, ...patch };
  await saveVideo(next);
  return next;
}

/** Stored TikTok login (OAuth tokens). */
export interface TikTokAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms
  refreshExpiresAt: number;
  openId: string;
  name?: string;
}
export const getTikTok = () => readJson<TikTokAuth | null>('tiktok', null);
export const setTikTok = (t: TikTokAuth | null) => writeJson('tiktok', t);

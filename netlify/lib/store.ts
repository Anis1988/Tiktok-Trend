import { getStore } from '@netlify/blobs';
import type { AppSettings, VideoRecord } from '../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../src/lib/types';

/**
 * Netlify Blobs. Inside Netlify functions it just works; from GitHub Actions it needs
 * NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (a personal access token).
 */
export function store(name: 'tt' | 'tt-files') {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  return siteID && token ? getStore({ name, siteID, token }) : getStore(name);
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  return ((await store('tt').get(key, { type: 'json' })) as T | null) ?? fallback;
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await store('tt').setJSON(key, value);
}

export async function getSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<AppSettings>>('settings', {})) };
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

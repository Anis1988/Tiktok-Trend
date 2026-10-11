import type { AppSettings, DraftLine, Extra, MediaItem, PlatformId, VideoRecord } from './types';

/** sendTo: platforms you can send to (only on the email review page, which has no access code). */
export type Video = VideoRecord & { sig: string; sendTo?: PlatformId[]; tiktokConnected?: boolean };

export interface Status {
  ready: { secret: boolean; tiktokApp: boolean; youtubeApp: boolean; metaApp: boolean; dispatch: boolean };
  tiktok: { connected: boolean; name?: string | null; expired?: boolean };
  youtube: { connected: boolean; name?: string | null };
  meta: { connected: boolean; page?: string; instagram?: string | null };
  ai: { used: number; limit: number };
}

const TOKEN_KEY = 'tt.accessCode';
export const getCode = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setCode = (t: string): void => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const code = getCode();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}), ...(code ? { 'X-Access-Token': code } : {}) } });
  } catch {
    throw new ApiError('Could not reach the server.', 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || data === null) {
    if (res.status === 401) window.dispatchEvent(new Event('tt-unauthorized'));
    if (data === null) throw new ApiError(`${path} is not available here. The server parts only run on Netlify (or with \`npm run dev:full\`).`, res.status);
    throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });

const PART = 4 * 1024 * 1024;

/** Pictures are shrunk on the phone (1600 px JPEG) before upload; videos go up as they are. */
async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('Could not read the picture.'))), 'image/jpeg', 0.88));
}

/** A small preview picture (240 px) of a video or picture, as a data URL. */
async function thumbOf(file: Blob, isVideo: boolean): Promise<string | undefined> {
  try {
    const url = URL.createObjectURL(file);
    const src: CanvasImageSource & { width?: number } = isVideo
      ? await new Promise<HTMLVideoElement>((ok, no) => {
          const v = document.createElement('video');
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          v.onloadeddata = () => (v.currentTime = Math.min(1, (v.duration || 2) / 2));
          v.onseeked = () => ok(v);
          v.onerror = () => no(new Error('video'));
          setTimeout(() => no(new Error('preview took too long')), 8000);
          v.src = url;
        })
      : await createImageBitmap(file);
    const w = isVideo ? (src as HTMLVideoElement).videoWidth : (src as ImageBitmap).width;
    const h = isVideo ? (src as HTMLVideoElement).videoHeight : (src as ImageBitmap).height;
    const k = 240 / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}

/** Uploads a clip to "My clips" in 4 MB pieces; progress goes from 0 to 1. */
export async function uploadMedia(file: File, name: string, tags: string[], onProgress: (p: number) => void): Promise<MediaItem> {
  const isVideo = file.type.startsWith('video/');
  const blob: Blob = isVideo ? file : await shrinkImage(file);
  const type = isVideo ? file.type || 'video/mp4' : 'image/jpeg';
  const item = await post<MediaItem>('/api/media', { action: 'start', name, tags, type, size: blob.size });
  for (let n = 0; n < item.parts; n++) {
    await call(`/api/media?id=${item.id}&part=${n}`, { method: 'PUT', body: blob.slice(n * PART, (n + 1) * PART), headers: { 'Content-Type': 'application/octet-stream' } });
    onProgress((n + 1) / (item.parts + 1));
  }
  const done = await post<MediaItem>('/api/media', { action: 'finish', id: item.id, thumb: await thumbOf(blob, isVideo) });
  onProgress(1);
  return done;
}

export const api = {
  media: () => call<MediaItem[]>('/api/media'),
  updateMedia: (id: string, name: string, tags: string[]) => post<MediaItem>('/api/media', { action: 'update', id, name, tags }),
  deleteMedia: (id: string) => post<{ ok: boolean }>('/api/media', { action: 'delete', id }),
  status: () => call<Status>('/api/status'),
  videos: () => call<Video[]>('/api/videos'),
  video: (id: string, sig?: string) => call<Video>(`/api/videos?id=${encodeURIComponent(id)}${sig ? `&sig=${encodeURIComponent(sig)}` : ''}`),
  act: (action: 'approve' | 'reject' | 'posted' | 'retry' | 'build', id: string, sig?: string) => post<Video>('/api/videos', { action, id, sig }),
  deleteVideo: (id: string, sig?: string) => post<{ ok: boolean }>('/api/videos', { action: 'delete', id, sig }),
  saveScript: (id: string, sig: string | undefined, s: { title: string; hook: string; caption: string; firstComment: string; cover?: string; lines: DraftLine[] }) =>
    post<Video>('/api/videos', { action: 'save-script', id, sig, ...s }),
  makeNow: (o: { subject?: string; pick?: string; ideaUrl?: string; extras?: (Extra | 'series')[]; comment?: string; commentBy?: string; recap?: boolean } = {}) =>
    post<{ ok: boolean; message: string }>('/api/videos', { action: 'make-now', subject: o.subject?.trim() || undefined, pick: o.pick || undefined, ideaUrl: o.ideaUrl || undefined, extras: o.extras?.length ? o.extras : undefined, comment: o.comment?.trim() || undefined, commentBy: o.commentBy?.trim() || undefined, recap: o.recap || undefined }),
  ideas: (pick?: string) => call<{ ideas: { title: string; url: string; site?: string; tag: string }[] }>(`/api/ideas${pick ? `?pick=${encodeURIComponent(pick)}` : ''}`),
  settings: () => call<AppSettings>('/api/settings'),
  saveSettings: (s: Partial<AppSettings> & { seriesUnuse?: { key: string; name: string } }) => post<AppSettings>('/api/settings', s),
  tiktokStart: () => post<{ url: string; redirectUri: string }>('/api/tiktok/start', {}),
  tiktokDisconnect: () => post<{ ok: boolean }>('/api/tiktok/disconnect', {}),
  saveStats: (id: string, sig: string | undefined, views?: number, likes?: number) => post<Video>('/api/videos', { action: 'stats', id, sig, views, likes }),
  send: (platform: PlatformId, id: string, sig?: string, confirm?: boolean) => post<Video>('/api/videos', { action: 'send', platform, id, sig, confirm }),
  connectStart: (p: 'youtube' | 'meta') => post<{ url: string; redirectUri: string }>(`/api/connect/${p}/start`, {}),
  connectDisconnect: (p: 'youtube' | 'meta') => post<{ ok: boolean }>(`/api/connect/${p}/disconnect`, {}),
};

/**
 * Saves the video to the phone or computer. Netlify can't send big files in one go (about 20 MB), so it is
 * fetched in 4 MB pieces and put back together here. Falls back to the plain link if that fails.
 */
export async function downloadVideo(v: { id: string; sig: string; sizeBytes?: number }, onProgress?: (share: number) => void): Promise<void> {
  const url = fileUrl(v, 'mp4');
  try {
    const parts: ArrayBuffer[] = [];
    let start = 0;
    let size = Infinity;
    while (start < size) {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + 4 * 1024 * 1024 - 1}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      size = Number(res.headers.get('Content-Range')?.split('/')[1]) || 0;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) break;
      parts.push(buf);
      start += buf.byteLength;
      onProgress?.(size ? start / size : 0);
    }
    const href = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
    const a = Object.assign(document.createElement('a'), { href, download: `${v.id}.mp4` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch {
    window.location.href = fileUrl(v, 'mp4', true);
  }
}

// "v" (the file size) changes when a video is rebuilt, so the phone's week-long copy is never an old version.
export const fileUrl = (v: { id: string; sig: string; sizeBytes?: number }, kind: 'mp4' | 'jpg', download = false) =>
  `/api/file?id=${encodeURIComponent(v.id)}&kind=${kind}&sig=${encodeURIComponent(v.sig)}${v.sizeBytes ? `&v=${v.sizeBytes}` : ''}${download ? '&dl=1' : ''}`;

/** Which platforms have a Send button, from the connections in /api/status. */
export const sendTargets = (st: Status | null): PlatformId[] =>
  !st ? [] : [...(st.youtube?.connected ? ['youtube' as const] : []), ...(st.meta?.connected ? ['facebook' as const] : []), ...(st.meta?.connected && st.meta.instagram ? ['instagram' as const] : [])];

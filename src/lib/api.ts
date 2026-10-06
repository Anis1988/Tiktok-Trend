import type { AppSettings, VideoRecord } from './types';

export type Video = VideoRecord & { sig: string };

export interface Status {
  ready: { secret: boolean; tiktokApp: boolean; dispatch: boolean };
  tiktok: { connected: boolean; name?: string | null; expired?: boolean };
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

export const api = {
  status: () => call<Status>('/api/status'),
  videos: () => call<Video[]>('/api/videos'),
  video: (id: string, sig?: string) => call<Video>(`/api/videos?id=${encodeURIComponent(id)}${sig ? `&sig=${encodeURIComponent(sig)}` : ''}`),
  act: (action: 'approve' | 'reject' | 'posted' | 'retry' | 'build', id: string, sig?: string) => post<Video>('/api/videos', { action, id, sig }),
  saveScript: (id: string, sig: string | undefined, s: { title: string; hook: string; caption: string; firstComment: string; lines: { text: string; footage: string; keywords: string[] }[] }) =>
    post<Video>('/api/videos', { action: 'save-script', id, sig, ...s }),
  makeNow: (o: { subject?: string; pick?: string; ideaUrl?: string } = {}) =>
    post<{ ok: boolean; message: string }>('/api/videos', { action: 'make-now', subject: o.subject?.trim() || undefined, pick: o.pick || undefined, ideaUrl: o.ideaUrl || undefined }),
  ideas: (pick?: string) => call<{ ideas: { title: string; url: string; site?: string; tag: string }[] }>(`/api/ideas${pick ? `?pick=${encodeURIComponent(pick)}` : ''}`),
  settings: () => call<AppSettings>('/api/settings'),
  saveSettings: (s: Partial<AppSettings>) => post<AppSettings>('/api/settings', s),
  tiktokStart: () => post<{ url: string; redirectUri: string }>('/api/tiktok/start', {}),
  tiktokDisconnect: () => post<{ ok: boolean }>('/api/tiktok/disconnect', {}),
};

export const fileUrl = (v: { id: string; sig: string }, kind: 'mp4' | 'jpg', download = false) =>
  `/api/file?id=${encodeURIComponent(v.id)}&kind=${kind}&sig=${encodeURIComponent(v.sig)}${download ? '&dl=1' : ''}`;

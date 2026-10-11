import { getTikTok, setTikTok, type TikTokAuth } from './store';

/** TikTok Login Kit + Content Posting API (inbox / drafts). Needs TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET. */
const API = 'https://open.tiktokapis.com/v2';
// video.list: find your post once you published it in TikTok (its link and numbers). Read-only.
export const SCOPES = 'user.info.basic,video.upload,video.list';
export const canList = (scope?: string) => !!scope?.split(/[ ,]+/).includes('video.list');
export const tiktokReady = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? '', scope: SCOPES, response_type: 'code', redirect_uri: redirectUri, state });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

interface TokenResponse { scope?: string; access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; error?: string; error_description?: string }

async function tokenCall(body: Record<string, string>): Promise<TikTokAuth> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? '', client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '', ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as TokenResponse;
  if (!res.ok || !j.access_token) throw new Error(`TikTok login failed: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? '',
    expiresAt: Date.now() + (j.expires_in ?? 0) * 1000,
    refreshExpiresAt: Date.now() + (j.refresh_expires_in ?? 0) * 1000,
    openId: j.open_id ?? '',
    scope: j.scope,
  };
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TikTokAuth> {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  try {
    const res = await fetch(`${API}/user/info/?fields=open_id,display_name`, { headers: { Authorization: `Bearer ${t.accessToken}` } });
    const j = (await res.json()) as { data?: { user?: { display_name?: string } } };
    t.name = j.data?.user?.display_name;
  } catch {
    /* the name is only for display */
  }
  await setTikTok(t);
  return t;
}

/** A valid access token, refreshed when it is about to expire. */
export async function accessToken(): Promise<string> {
  const t = await getTikTok();
  if (!t) throw new Error('TikTok is not connected. Connect it in Settings.');
  if (Date.now() < t.expiresAt - 5 * 60_000) return t.accessToken;
  if (Date.now() > t.refreshExpiresAt) throw new Error('The TikTok login expired. Connect TikTok again in Settings.');
  const fresh = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
  await setTikTok({ ...t, ...fresh, name: t.name, scope: fresh.scope ?? t.scope });
  return fresh.accessToken;
}

interface ApiReply<T> { data?: T; error?: { code: string; message: string } }

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json()) as ApiReply<T>;
  if (!res.ok || (j.error && j.error.code !== 'ok')) throw new Error(`TikTok: ${j.error?.message || j.error?.code || `HTTP ${res.status}`}`);
  return j.data as T;
}

/**
 * Sends a video to the user's TikTok inbox (drafts): they get a notification and post it from the app,
 * where they can add a sound and the "AI-generated" label. Returns TikTok's publish id.
 */
export async function sendToDrafts(video: Buffer): Promise<string> {
  const token = await accessToken();
  const size = video.length;
  const init = await post<{ publish_id: string; upload_url: string }>('/post/publish/inbox/video/init/', token, {
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
  });
  const up = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size), 'Content-Range': `bytes 0-${size - 1}/${size}` },
    body: new Uint8Array(video),
    signal: AbortSignal.timeout(120_000),
  });
  if (!up.ok) throw new Error(`TikTok upload failed: HTTP ${up.status}`);
  return init.publish_id;
}

/** PROCESSING_UPLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE, FAILED, ... */
export async function publishStatus(publishId: string): Promise<{ status: string; fail_reason?: string }> {
  return post('/post/publish/status/fetch/', await accessToken(), { publish_id: publishId });
}

export interface MyTikTok { id: string; url: string; description: string; createdAt: string; views?: number; likes?: number; comments?: number }

/** Your latest TikTok posts (public ones): needs video.list. Up to `max` (newest first). */
export async function myTikToks(max = 40): Promise<MyTikTok[]> {
  const token = await accessToken();
  const out: MyTikTok[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 3 && out.length < max; page++) {
    const res = await fetch(`${API}/video/list/?fields=id,title,video_description,create_time,share_url,view_count,like_count,comment_count`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json()) as ApiReply<{ videos?: { id: string; title?: string; video_description?: string; create_time?: number; share_url?: string; view_count?: number; like_count?: number; comment_count?: number }[]; cursor?: number; has_more?: boolean }>;
    if (!res.ok || (j.error && j.error.code !== 'ok')) throw new Error(`TikTok: ${j.error?.message || j.error?.code || `HTTP ${res.status}`}`);
    for (const v of j.data?.videos ?? []) {
      out.push({
        id: v.id, url: v.share_url || `https://www.tiktok.com/video/${v.id}`, description: v.video_description || v.title || '',
        createdAt: new Date((v.create_time ?? 0) * 1000).toISOString(), views: v.view_count, likes: v.like_count, comments: v.comment_count,
      });
    }
    if (!j.data?.has_more) break;
    cursor = j.data.cursor;
  }
  return out.slice(0, max);
}

import { getYouTube, setYouTube, type YouTubeAuth } from './store';

/**
 * YouTube Data API v3 (Google OAuth). Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
 * Videos are uploaded as Private; you make them public in YouTube Studio. A vertical video under 3 minutes is a Short.
 */
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
export const youtubeReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function youtubeAuthorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '', redirect_uri: redirectUri, response_type: 'code', scope: SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

async function tokenCall(body: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json()) as TokenResponse;
  if (!res.ok || !j.access_token) {
    if (j.error === 'invalid_grant') throw new Error('The YouTube login expired. Connect YouTube again in Settings.');
    throw new Error(`YouTube login failed: ${j.error_description ?? j.error ?? `HTTP ${res.status}`}`);
  }
  return j as TokenResponse & { access_token: string };
}

export async function youtubeExchangeCode(code: string, redirectUri: string): Promise<YouTubeAuth> {
  const j = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
  if (!j.refresh_token) throw new Error('Google did not give a lasting login. Remove the app at myaccount.google.com/permissions and connect again.');
  const t: YouTubeAuth = { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${t.accessToken}` }, signal: AbortSignal.timeout(15_000) });
  const ch = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  if (!ch.items?.length) throw new Error('This Google account has no YouTube channel yet. Create one on youtube.com first.');
  t.channelId = ch.items[0].id;
  t.name = ch.items[0].snippet?.title;
  await setYouTube(t);
  return t;
}

async function accessToken(): Promise<string> {
  const t = await getYouTube();
  if (!t) throw new Error('YouTube is not connected. Connect it in Settings.');
  if (Date.now() < t.expiresAt - 5 * 60_000) return t.accessToken;
  const j = await tokenCall({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
  await setYouTube({ ...t, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

/** YouTube refuses < and > in titles and descriptions. */
const clean = (s: string) => s.replace(/[<>]/g, '').trim();

/** Uploads the video as Private. Returns the video id. */
export async function uploadToYouTube(video: Buffer, meta: { title: string; description: string; tags: string[] }): Promise<string> {
  const token = await accessToken();
  const title = clean(meta.title).slice(0, 100) || 'New video';
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.length),
    },
    body: JSON.stringify({
      snippet: { title, description: clean(meta.description).slice(0, 4900), tags: meta.tags.map(clean).filter(Boolean).slice(0, 15), categoryId: '24' /* Entertainment */ },
      // Private until you publish it in YouTube Studio. The AI voice is "altered or synthetic content".
      status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const where = init.headers.get('location');
  if (!init.ok || !where) throw new Error(`YouTube: ${await errorText(init)}`);
  const up = await fetch(where, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(video.length) },
    body: new Uint8Array(video),
    signal: AbortSignal.timeout(300_000),
  });
  if (!up.ok) throw new Error(`YouTube upload failed: ${await errorText(up)}`);
  const j = (await up.json()) as { id?: string };
  if (!j.id) throw new Error('YouTube did not return a video id.');
  return j.id;
}

/** uploaded / processed / failed / rejected (+ why). */
export async function youtubeStatus(id: string): Promise<{ status: string; reason?: string }> {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(15_000) });
  const j = (await res.json()) as { items?: { status?: { uploadStatus?: string; failureReason?: string; rejectionReason?: string } }[] };
  const s = j.items?.[0]?.status;
  return { status: s?.uploadStatus ?? 'unknown', reason: s?.failureReason ?? s?.rejectionReason };
}

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = j.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') return 'the daily YouTube upload limit is reached. Try again tomorrow.';
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

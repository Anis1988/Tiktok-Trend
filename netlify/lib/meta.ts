import { getMeta, setMeta, type MetaAuth } from './store';

/**
 * Facebook Reels and Instagram Reels through one Meta (Facebook) login. Needs META_APP_ID and META_APP_SECRET.
 * Facebook: the Reel is saved as a draft on your Page. Instagram has no drafts in its API: a send posts it.
 */
const V = 'v23.0';
const GRAPH = `https://graph.facebook.com/${V}`;
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish';
export const metaReady = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);

export function metaAuthorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', redirect_uri: redirectUri, state, scope: SCOPES, response_type: 'code' });
  return `https://www.facebook.com/${V}/dialog/oauth?${q}`;
}

interface GraphError { error?: { message?: string; error_user_msg?: string } }

async function graph<T>(path: string, init: { method?: 'GET' | 'POST'; params?: Record<string, string>; token?: string } = {}): Promise<T> {
  const q = new URLSearchParams(init.params ?? {});
  if (init.token) q.set('access_token', init.token);
  const method = init.method ?? 'GET';
  const res = await fetch(method === 'GET' ? `${GRAPH}${path}?${q}` : `${GRAPH}${path}`, {
    method,
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json()) as T & GraphError;
  if (!res.ok || j.error) throw new Error(`Meta: ${j.error?.error_user_msg || j.error?.message || `HTTP ${res.status}`}`);
  return j;
}

interface Page { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }

/** After the Facebook login: keeps a Page token (it does not expire) and the Instagram account linked to that Page. */
export async function metaExchangeCode(code: string, redirectUri: string): Promise<MetaAuth> {
  const app = { client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '' };
  const short = await graph<{ access_token: string }>('/oauth/access_token', { params: { ...app, redirect_uri: redirectUri, code } });
  const long = await graph<{ access_token: string }>('/oauth/access_token', { params: { ...app, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token } });
  const pages = await graph<{ data: Page[] }>('/me/accounts', { token: long.access_token, params: { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '50' } });
  if (!pages.data.length) throw new Error('No Facebook Page was shared. Connect again and tick your Page (Instagram needs a Page too).');
  const page = pages.data.find((p) => p.instagram_business_account) ?? pages.data[0];
  const auth: MetaAuth = {
    pageId: page.id, pageName: page.name, pageToken: page.access_token,
    igUserId: page.instagram_business_account?.id, igName: page.instagram_business_account?.username,
    connectedAt: new Date().toISOString(),
  };
  await setMeta(auth);
  return auth;
}

async function auth(): Promise<MetaAuth> {
  const a = await getMeta();
  if (!a) throw new Error('Facebook & Instagram are not connected. Connect them in Settings.');
  return a;
}

/** Sends the bytes to Meta's upload server (same for Facebook and Instagram). */
async function rupload(url: string, token: string, video: Buffer): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(video.length), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(video),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { debug_info?: { message?: string } } & GraphError;
      msg = j.error?.message ?? j.debug_info?.message ?? msg;
    } catch {
      /* keep HTTP code */
    }
    throw new Error(`Meta upload failed: ${msg}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Facebook Reel saved as a DRAFT on your Page. Returns the video id. */
export async function sendToFacebook(video: Buffer, description: string): Promise<{ id: string; url: string }> {
  const a = await auth();
  const start = await graph<{ video_id: string; upload_url?: string }>(`/${a.pageId}/video_reels`, { method: 'POST', token: a.pageToken, params: { upload_phase: 'start' } });
  await rupload(start.upload_url ?? `https://rupload.facebook.com/video-upload/${V}/${start.video_id}`, a.pageToken, video);
  await graph(`/${a.pageId}/video_reels`, {
    method: 'POST', token: a.pageToken,
    params: { upload_phase: 'finish', video_id: start.video_id, video_state: 'DRAFT', description: description.slice(0, 2000) },
  });
  // Wait for Facebook to finish processing, so a broken file shows up as an error here.
  for (let i = 0; i < 30; i++) {
    await sleep(6000);
    const s = await graph<{ status?: { video_status?: string; processing_phase?: { status?: string; error?: { message?: string } } } }>(`/${start.video_id}`, { token: a.pageToken, params: { fields: 'status' } });
    console.log('Facebook status:', s.status?.video_status, s.status?.processing_phase?.status);
    if (s.status?.video_status === 'error' || s.status?.processing_phase?.status === 'error') throw new Error(`Facebook could not process the video: ${s.status?.processing_phase?.error?.message ?? 'unknown reason'}`);
    if (s.status?.processing_phase?.status === 'complete') break;
  }
  return { id: start.video_id, url: 'https://business.facebook.com/' };
}

/** Instagram Reel: posted publicly (Instagram's API has no drafts). Returns the post id and link. */
export async function postToInstagram(video: Buffer, caption: string): Promise<{ id: string; url?: string }> {
  const a = await auth();
  if (!a.igUserId) throw new Error(`No Instagram account is linked to your Facebook Page "${a.pageName}". Link a Business or Creator Instagram account to it, then connect again.`);
  const box = await graph<{ id: string; uri?: string }>(`/${a.igUserId}/media`, {
    method: 'POST', token: a.pageToken,
    params: { media_type: 'REELS', upload_type: 'resumable', caption: caption.slice(0, 2200), share_to_feed: 'true' },
  });
  await rupload(box.uri ?? `https://rupload.facebook.com/ig-api-upload/${V}/${box.id}`, a.pageToken, video);
  for (let i = 0; ; i++) {
    await sleep(6000);
    const s = await graph<{ status_code?: string; status?: string }>(`/${box.id}`, { token: a.pageToken, params: { fields: 'status_code,status' } });
    console.log('Instagram status:', s.status_code);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not process the video: ${s.status ?? s.status_code}`);
    if (i >= 50) throw new Error('Instagram is taking too long to process the video. Nothing was posted; try again later.');
  }
  const pub = await graph<{ id: string }>(`/${a.igUserId}/media_publish`, { method: 'POST', token: a.pageToken, params: { creation_id: box.id } });
  let url: string | undefined;
  try {
    url = (await graph<{ permalink?: string }>(`/${pub.id}`, { token: a.pageToken, params: { fields: 'permalink' } })).permalink;
  } catch {
    /* the link is only for display */
  }
  return { id: pub.id, url };
}

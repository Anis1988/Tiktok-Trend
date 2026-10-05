import { guard, json, rateLimited } from '../lib/guard';
import { setTikTok } from '../lib/store';
import { sign, verify } from '../lib/sign';
import { authorizeUrl, exchangeCode, tiktokReady } from '../lib/tiktok';

export const config = { path: '/api/tiktok/:action' };

const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/tiktok/callback`;

/**
 * POST /api/tiktok/start      -> { url } to open TikTok's login (access code)
 * GET  /api/tiktok/callback   -> TikTok sends you back here; saves the login and returns to Settings
 * POST /api/tiktok/disconnect -> forget the login (access code)
 */
export default async (req: Request, ctx: { params: { action?: string } }): Promise<Response> => {
  const action = ctx.params.action;
  if (action === 'callback') {
    const limited = rateLimited(req, 'tiktok-cb', 10);
    if (limited) return limited;
    const url = new URL(req.url);
    const state = url.searchParams.get('state') ?? '';
    const [ts, sig] = state.split('.');
    const back = (q: string) => Response.redirect(`${url.origin}/settings?tiktok=${q}`, 302);
    if (!verify(`tiktok:${ts}`, sig) || Date.now() - Number(ts) > 15 * 60_000) return back('expired');
    const code = url.searchParams.get('code');
    if (!code) return back(encodeURIComponent(url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? 'cancelled'));
    try {
      await exchangeCode(code, redirectUri(req));
      return back('ok');
    } catch (e) {
      return back(encodeURIComponent(e instanceof Error ? e.message : String(e)));
    }
  }
  const blocked = guard(req, 'tiktok', 20);
  if (blocked) return blocked;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (action === 'start') {
    if (!tiktokReady()) return json({ error: 'Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Netlify first.' }, 503);
    const ts = String(Date.now());
    return json({ url: authorizeUrl(redirectUri(req), `${ts}.${sign(`tiktok:${ts}`)}`), redirectUri: redirectUri(req) });
  }
  if (action === 'disconnect') {
    await setTikTok(null);
    return json({ ok: true });
  }
  return json({ error: 'Unknown action.' }, 404);
};

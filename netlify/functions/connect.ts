import { guard, json, rateLimited } from '../lib/guard';
import { setMeta, setYouTube } from '../lib/store';
import { sign, verify } from '../lib/sign';
import { youtubeAuthorizeUrl, youtubeExchangeCode, youtubeReady } from '../lib/youtube';
import { metaAuthorizeUrl, metaExchangeCode, metaReady } from '../lib/meta';

export const config = { path: '/api/connect/:platform/:action' };

type Login = 'youtube' | 'meta';
const redirectUri = (req: Request, p: Login) => `${new URL(req.url).origin}/api/connect/${p}/callback`;
const NAME: Record<Login, string> = { youtube: 'YouTube', meta: 'Facebook & Instagram' };
const KEYS: Record<Login, string> = { youtube: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET', meta: 'META_APP_ID and META_APP_SECRET' };

/**
 * POST /api/connect/{youtube|meta}/start      -> { url } to open the platform's login (access code)
 * GET  /api/connect/{youtube|meta}/callback   -> the platform sends you back here; saves the login and returns to Settings
 * POST /api/connect/{youtube|meta}/disconnect -> forget the login (access code)
 */
export default async (req: Request, ctx: { params: { platform?: string; action?: string } }): Promise<Response> => {
  const p = ctx.params.platform;
  if (p !== 'youtube' && p !== 'meta') return json({ error: 'Unknown platform.' }, 404);
  const action = ctx.params.action;
  if (action === 'callback') {
    const limited = rateLimited(req, `${p}-cb`, 10);
    if (limited) return limited;
    const url = new URL(req.url);
    const [ts, sig] = (url.searchParams.get('state') ?? '').split('.');
    const back = (q: string) => Response.redirect(`${url.origin}/settings?connected=${p}&result=${q}`, 302);
    if (!verify(`${p}:${ts}`, sig) || Date.now() - Number(ts) > 15 * 60_000) return back('expired');
    const code = url.searchParams.get('code');
    if (!code) return back(encodeURIComponent(url.searchParams.get('error_description') ?? url.searchParams.get('error_message') ?? url.searchParams.get('error') ?? 'cancelled'));
    try {
      if (p === 'youtube') await youtubeExchangeCode(code, redirectUri(req, p));
      else await metaExchangeCode(code, redirectUri(req, p));
      return back('ok');
    } catch (e) {
      return back(encodeURIComponent(e instanceof Error ? e.message : String(e)));
    }
  }
  const blocked = guard(req, 'connect', 20);
  if (blocked) return blocked;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (action === 'start') {
    if (!(p === 'youtube' ? youtubeReady() : metaReady())) return json({ error: `Add ${KEYS[p]} in Netlify first (see the Guide).` }, 503);
    const ts = String(Date.now());
    const state = `${ts}.${sign(`${p}:${ts}`)}`;
    const uri = redirectUri(req, p);
    return json({ url: p === 'youtube' ? youtubeAuthorizeUrl(uri, state) : metaAuthorizeUrl(uri, state), redirectUri: uri });
  }
  if (action === 'disconnect') {
    if (p === 'youtube') await setYouTube(null);
    else await setMeta(null);
    return json({ ok: true, message: `${NAME[p]} disconnected.` });
  }
  return json({ error: 'Unknown action.' }, 404);
};

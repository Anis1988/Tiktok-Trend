import { z } from 'zod';
import { guard, json, linkGuard } from '../lib/guard';
import { deleteVideo, getMeta, getTikTok, getVideo, getYouTube, listVideos, patchPlatform, patchVideo } from '../lib/store';
import { sign, verify } from '../lib/sign';
import { dispatch, dispatchReady } from '../lib/github';
import { PLATFORM_INFO, type PlatformId, type VideoRecord } from '../../src/lib/types';

export const config = { path: '/api/videos' };

const withSig = (v: VideoRecord) => ({ ...v, sig: sign(v.id) });

/** A send that started less than 15 minutes ago is still running (after that it is treated as stuck, so you can retry). */
const sendingNow = (v: VideoRecord) => Object.values(v.platforms ?? {}).some((x) => x?.state === 'sending' && Date.now() - Date.parse(x.at) < 15 * 60_000);

const Post = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('make-now'),
    subject: z.string().trim().max(200).optional(),
    pick: z.string().regex(/^[a-z-]{2,30}(:[a-z0-9-]{2,30})?$/).optional(),
    ideaUrl: z.string().url().startsWith('https://').max(1000).optional(),
    extras: z.array(z.enum(['quiz', 'facts', 'myth', 'versus', 'debate', 'fast', 'cover', 'long'])).max(8).optional(),
    comment: z.string().trim().max(300).optional(),
    commentBy: z.string().trim().max(30).optional(),
    recap: z.boolean().optional(),
  }),
  z.object({ action: z.enum(['approve', 'reject', 'posted', 'retry', 'build', 'delete']), id: z.string().max(40), sig: z.string().max(64).optional() }),
  z.object({ action: z.literal('stats'), id: z.string().max(40), sig: z.string().max(64).optional(), views: z.number().int().min(0).max(1e10).optional(), likes: z.number().int().min(0).max(1e10).optional() }),
  z.object({ action: z.literal('send'), id: z.string().max(40), sig: z.string().max(64).optional(), platform: z.enum(['youtube', 'facebook', 'instagram']), confirm: z.boolean().optional() }),
  z.object({
    action: z.literal('save-script'), id: z.string().max(40), sig: z.string().max(64).optional(),
    title: z.string().trim().min(1).max(80), hook: z.string().trim().min(1).max(120),
    caption: z.string().trim().max(150), firstComment: z.string().trim().max(150), cover: z.string().trim().max(40).optional(),
    lines: z.array(z.object({
      text: z.string().trim().min(1).max(220), footage: z.string().trim().min(1).max(60), keywords: z.array(z.string().trim().max(30)).max(3),
      real: z.string().trim().max(80).optional(), media: z.string().max(30).optional(),
      character: z.string().trim().max(100).optional(), object: z.string().trim().max(60).optional(), label: z.string().trim().max(40).optional(), quiz: z.enum(['hide', 'reveal']).optional(),
      chart: z.object({ title: z.string().trim().max(40), unit: z.string().trim().max(12).optional(), bars: z.array(z.object({ label: z.string().trim().max(24), value: z.number() })).min(2).max(6) }).optional(),
      map: z.string().trim().max(60).optional(),
      headline: z.object({ title: z.string().trim().max(200), site: z.string().trim().max(60).optional() }).optional(),
      timeline: z.object({ title: z.string().trim().max(40), events: z.array(z.object({ date: z.string().trim().max(20), label: z.string().trim().max(60) })).min(2).max(5) }).optional(),
      versus: z.object({ a: z.string().trim().min(1).max(60), b: z.string().trim().min(1).max(60) }).optional(),
      verdict: z.enum(['myth', 'fact']).optional(),
      speaker: z.enum(['A', 'B']).optional(), delivery: z.enum(['hype', 'calm']).optional(), pause: z.boolean().optional(),
      bigText: z.string().trim().max(40).optional(),
      comment: z.object({ text: z.string().trim().max(300), by: z.string().trim().max(30).optional() }).optional(),
    })).min(2).max(14),
  }),
]);

/**
 * GET  /api/videos              -> all videos (access code)
 * GET  /api/videos?id=..&sig=.. -> one video (access code OR the signed email link)
 * POST {action:'make-now', subject?} -> start a new video now, optionally about one subject (access code)
 * POST {action:'save-script'|'build', id, sig?} -> edit a script waiting to be checked / build its video
 * POST {action, id, sig?}       -> approve / reject / posted / retry (access code OR signed link)
 * POST {action:'delete', id, sig?} -> delete the video and its files for good (access code OR signed link)
 * POST {action:'stats', id, sig?, views?, likes?} -> your TikTok numbers for a video (the AI learns from them)
 * POST {action:'send', id, sig?, platform, confirm?} -> send an approved video to YouTube / Facebook / Instagram (Instagram needs confirm: it posts publicly)
 */
export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  let body: z.infer<typeof Post> | null = null;
  if (req.method === 'POST') {
    try {
      body = Post.parse(await req.json());
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
  }
  const linkId = id ?? (body && 'id' in body ? body.id : null);
  const linkSig = url.searchParams.get('sig') ?? (body && 'sig' in body ? body.sig : null);
  const byLink = !!linkId && verify(linkId, linkSig);
  const blocked = byLink ? linkGuard(req, 'videos-link', 30) : guard(req, 'videos', 60);
  if (blocked) return blocked;

  if (req.method === 'GET') {
    if (id) {
      const v = await getVideo(id);
      if (!v) return json({ error: 'Video not found.' }, 404);
      if (!byLink) return json(withSig(v));
      // The email review page has no access code, so it learns here which Send buttons to show.
      const [yt, meta] = await Promise.all([getYouTube(), getMeta()]);
      const sendTo: PlatformId[] = [...(yt ? ['youtube' as const] : []), ...(meta ? ['facebook' as const] : []), ...(meta?.igUserId ? ['instagram' as const] : [])];
      return json({ ...withSig(v), sendTo });
    }
    return json((await listVideos()).map(withSig));
  }
  if (!body) return json({ error: 'GET or POST only' }, 405);

  try {
    if (body.action === 'make-now') {
      const subject = body.subject?.replace(/[\r\n]+/g, ' ') ?? '';
      if (body.recap) {
        await dispatch('generate.yml', { manual: 'true', extras: 'recap' });
        return json({ ok: true, message: 'Making this week\'s recap from your videos (no AI cost). About 3 to 5 minutes; you will get an email.' });
      }
      const comment = body.comment?.replace(/[\r\n]+/g, ' ') ?? '';
      await dispatch('generate.yml', {
        manual: 'true', subject, pick: body.pick ?? '', idea_url: body.ideaUrl ?? '', extras: [...new Set(body.extras ?? [])].join(','),
        ...(comment ? { comment, comment_by: body.commentBy ?? '' } : {}),
      });
      return json({ ok: true, message: `Started${comment ? ' a reply to the comment' : subject ? ` (about "${subject}")` : ''}. A new video takes 2 to 5 minutes; you will get an email.` });
    }
    if (body.action === 'delete') {
      const v = await getVideo(body.id);
      if (!v) return json({ ok: true }); // already gone
      if (v.status === 'building' || v.status === 'publishing') return json({ error: `This video is being ${v.status === 'building' ? 'built' : 'sent to TikTok'}. Try again in a few minutes.` }, 409);
      if (sendingNow(v)) return json({ error: 'This video is being sent to another platform. Try again in a few minutes.' }, 409);
      await deleteVideo(v.id);
      return json({ ok: true });
    }
    const v = await getVideo(body.id);
    if (!v) return json({ error: 'Video not found.' }, 404);
    if (body.action === 'save-script') {
      if (v.status !== 'script') return json({ error: 'Only a script waiting to be checked can be edited.' }, 409);
      // The first line is the hook the voice says first; keep them together.
      const lines = body.lines;
      return json(withSig((await patchVideo(v.id, {
        title: body.title, hook: body.hook, caption: body.caption, firstComment: body.firstComment || undefined, cover: body.cover || v.cover,
        lines: lines.map((l) => l.text), draft: { lines },
      }))!));
    }
    if (body.action === 'build') {
      if (v.status !== 'script') return json({ error: `Already ${v.status}.` }, 409);
      await dispatch('generate.yml', { manual: 'true', render_id: v.id });
      return json(withSig((await patchVideo(v.id, { status: 'building', error: undefined }))!));
    }
    if (body.action === 'stats') {
      return json(withSig((await patchVideo(v.id, { stats: { ...v.stats, tiktok: { views: body.views, likes: body.likes, at: new Date().toISOString() } } }))!));
    }
    if (body.action === 'send') return json(await send(v, body.platform, !!body.confirm));
    if (body.action === 'reject') return json(withSig((await patchVideo(v.id, { status: 'rejected' }))!));
    if (body.action === 'posted') return json(withSig((await patchVideo(v.id, { status: 'posted' }))!));
    // approve / retry: send to TikTok drafts when connected, otherwise it is yours to download and post.
    if (!['pending', 'approved', 'failed'].includes(v.status)) return json({ error: `Already ${v.status}.` }, 409);
    if (v.status === 'failed' && !v.sizeBytes) return json({ error: 'This video was never made, so there is nothing to send.' }, 409);
    const tt = await getTikTok();
    if (!tt || !dispatchReady()) return json(withSig((await patchVideo(v.id, { status: 'approved', error: undefined }))!));
    await dispatch('publish.yml', { id: v.id });
    return json(withSig((await patchVideo(v.id, { status: 'publishing', error: undefined }))!));
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
};

/** Starts the GitHub job that sends one approved video to one platform. Only ever after you approved it. */
async function send(v: VideoRecord, p: PlatformId, confirm: boolean) {
  const info = PLATFORM_INFO[p];
  const fail = (error: string, status = 409) => Object.assign(new Error(error), { status });
  if (!['approved', 'publishing', 'sent', 'posted', 'failed'].includes(v.status)) throw fail(v.status === 'pending' ? 'Approve the video first.' : `This video is ${v.status}, so it can't be sent.`);
  if (!v.sizeBytes || v.fileRemovedAt) throw fail('The video file is gone, so there is nothing to send.');
  const cur = v.platforms?.[p];
  if (cur?.state === 'sent') throw fail(`Already sent to ${info.name}.`);
  if (cur?.state === 'sending' && Date.now() - Date.parse(cur.at) < 15 * 60_000) throw fail(`Already being sent to ${info.name}.`);
  if (info.publicNow && !confirm) throw fail(`${info.name} posts publicly right away. Confirm to post.`, 400);
  const connected = p === 'youtube' ? await getYouTube() : await getMeta();
  if (!connected) throw fail(`${p === 'youtube' ? 'YouTube' : 'Facebook & Instagram'} is not connected. Connect it in Settings.`);
  if (p === 'instagram' && !(connected as { igUserId?: string }).igUserId) throw fail('No Instagram account is linked to your Facebook Page. Link one, then connect again in Settings.');
  if (!dispatchReady()) throw fail('Set GH_DISPATCH_TOKEN in Netlify so the app can start GitHub jobs.', 503);
  await dispatch('publish.yml', { id: v.id, platform: p });
  return withSig((await patchPlatform(v.id, p, { state: 'sending', at: new Date().toISOString() }))!);
}

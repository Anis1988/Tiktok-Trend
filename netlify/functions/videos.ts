import { z } from 'zod';
import { guard, json, linkGuard } from '../lib/guard';
import { deleteVideo, getTikTok, getVideo, listVideos, patchVideo } from '../lib/store';
import { sign, verify } from '../lib/sign';
import { dispatch, dispatchReady } from '../lib/github';
import type { VideoRecord } from '../../src/lib/types';

export const config = { path: '/api/videos' };

const withSig = (v: VideoRecord) => ({ ...v, sig: sign(v.id) });

const Post = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('make-now'),
    subject: z.string().trim().max(200).optional(),
    pick: z.string().regex(/^[a-z-]{2,30}(:[a-z0-9-]{2,30})?$/).optional(),
    ideaUrl: z.string().url().startsWith('https://').max(1000).optional(),
  }),
  z.object({ action: z.enum(['approve', 'reject', 'posted', 'retry', 'build', 'delete']), id: z.string().max(40), sig: z.string().max(64).optional() }),
  z.object({
    action: z.literal('save-script'), id: z.string().max(40), sig: z.string().max(64).optional(),
    title: z.string().trim().min(1).max(80), hook: z.string().trim().min(1).max(120),
    caption: z.string().trim().max(150), firstComment: z.string().trim().max(150),
    lines: z.array(z.object({
      text: z.string().trim().min(1).max(220), footage: z.string().trim().min(1).max(60), keywords: z.array(z.string().trim().max(30)).max(3),
      real: z.string().trim().max(80).optional(), media: z.string().max(30).optional(),
      character: z.string().trim().max(100).optional(), object: z.string().trim().max(60).optional(), label: z.string().trim().max(40).optional(),
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
      return v ? json(withSig(v)) : json({ error: 'Video not found.' }, 404);
    }
    return json((await listVideos()).map(withSig));
  }
  if (!body) return json({ error: 'GET or POST only' }, 405);

  try {
    if (body.action === 'make-now') {
      const subject = body.subject?.replace(/[\r\n]+/g, ' ') ?? '';
      await dispatch('generate.yml', { manual: 'true', subject, pick: body.pick ?? '', idea_url: body.ideaUrl ?? '' });
      return json({ ok: true, message: `Started${subject ? ` (about "${subject}")` : ''}. A new video takes 2 to 5 minutes; you will get an email.` });
    }
    if (body.action === 'delete') {
      const v = await getVideo(body.id);
      if (!v) return json({ ok: true }); // already gone
      if (v.status === 'building' || v.status === 'publishing') return json({ error: `This video is being ${v.status === 'building' ? 'built' : 'sent to TikTok'}. Try again in a few minutes.` }, 409);
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
        title: body.title, hook: body.hook, caption: body.caption, firstComment: body.firstComment || undefined,
        lines: lines.map((l) => l.text), draft: { lines },
      }))!));
    }
    if (body.action === 'build') {
      if (v.status !== 'script') return json({ error: `Already ${v.status}.` }, 409);
      await dispatch('generate.yml', { manual: 'true', render_id: v.id });
      return json(withSig((await patchVideo(v.id, { status: 'building', error: undefined }))!));
    }
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
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { store } from '../lib/store';
import { deleteMedia, listMedia, MAX_BYTES, MAX_ITEMS, PART_BYTES, partKey, saveMedia, TYPES } from '../lib/media';

export const config = { path: '/api/media' };

const tags = z.array(z.string().trim().min(1).max(30)).max(10);
const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), name: z.string().trim().min(1).max(60), tags, type: z.string().max(40), size: z.number().int().positive() }),
  z.object({ action: z.literal('finish'), id: z.string().max(30), thumb: z.string().max(60_000).regex(/^data:image\/jpeg;base64,/).optional() }),
  z.object({ action: z.literal('update'), id: z.string().max(30), name: z.string().trim().min(1).max(60), tags }),
  z.object({ action: z.literal('delete'), id: z.string().max(30) }),
]);

/**
 * "My clips" (access code):
 * GET  /api/media                          -> your clips
 * POST {action:'start', name, tags, type, size} -> a new clip; upload its pieces next
 * PUT  /api/media?id=..&part=n  (raw bytes, up to 4 MB) -> one piece
 * POST {action:'finish', id, thumb?}       -> mark it ready
 * POST {action:'update'|'delete', id, ...} -> rename / retag / delete
 */
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'media', 120);
  if (blocked) return blocked;
  const items = await listMedia();

  if (req.method === 'GET') return json(items);

  if (req.method === 'PUT') {
    const url = new URL(req.url);
    const item = items.find((m) => m.id === url.searchParams.get('id'));
    const n = Number(url.searchParams.get('part'));
    if (!item || item.ready) return json({ error: 'Unknown or finished upload.' }, 404);
    if (!Number.isInteger(n) || n < 0 || n >= item.parts) return json({ error: 'Bad piece number.' }, 400);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > PART_BYTES) return json({ error: 'Piece too big.' }, 413);
    await store('tt-media').set(partKey(item.id, n), buf);
    return json({ ok: true });
  }

  if (req.method !== 'POST') return json({ error: 'GET, POST or PUT only' }, 405);
  let body: z.infer<typeof Post>;
  try {
    body = Post.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (body.action === 'start') {
    const kind = TYPES[body.type];
    if (!kind) return json({ error: 'Use an MP4, MOV or WebM video, or a JPEG, PNG or WebP picture.' }, 400);
    if (body.size > MAX_BYTES) return json({ error: `Too big: up to ${MAX_BYTES / 1024 / 1024} MB. Use a shorter clip (5 to 20 seconds is ideal).` }, 413);
    if (items.length >= MAX_ITEMS) return json({ error: `Up to ${MAX_ITEMS} clips. Delete one first.` }, 409);
    const item = {
      id: randomBytes(6).toString('hex'), name: body.name, tags: body.tags, kind, type: body.type, size: body.size,
      parts: Math.ceil(body.size / PART_BYTES), createdAt: new Date().toISOString(), ready: false,
    };
    // Unfinished uploads older than a day are dropped.
    const stale = items.filter((m) => !m.ready && Date.now() - Date.parse(m.createdAt) > 86400_000);
    await Promise.all(stale.map(deleteMedia));
    await saveMedia([item, ...items.filter((m) => !stale.includes(m))]);
    return json(item);
  }

  const item = items.find((m) => m.id === body.id);
  if (!item) return json({ error: 'Clip not found.' }, 404);

  if (body.action === 'finish') {
    const { blobs } = await store('tt-media').list({ prefix: `${item.id}.` });
    if (blobs.length < item.parts) return json({ error: 'Some pieces are missing: please upload again.' }, 409);
    Object.assign(item, { ready: true, thumb: body.thumb });
  } else if (body.action === 'update') {
    Object.assign(item, { name: body.name, tags: body.tags });
  } else {
    await deleteMedia(item);
    await saveMedia(items.filter((m) => m.id !== item.id));
    return json({ ok: true });
  }
  await saveMedia(items);
  return json(item);
};

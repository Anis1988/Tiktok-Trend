import { linkGuard, json } from '../lib/guard';
import { store } from '../lib/store';
import { verify } from '../lib/sign';

export const config = { path: '/api/file' };

const CHUNK = 4 * 1024 * 1024; // keep each reply small; video players ask for the rest

// A video's file never changes under the same link (a rebuild changes the "v" in the link), so phones keep it a week.
// GET /api/file?id=..&kind=mp4|jpg&sig=..[&v=..][&dl=1] -> the video (with Range support for phones) or thumbnail
export default async (req: Request): Promise<Response> => {
  const blocked = linkGuard(req, 'file', 240);
  if (blocked) return blocked;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const kind = url.searchParams.get('kind') === 'jpg' ? 'jpg' : 'mp4';
  if (!verify(id, url.searchParams.get('sig'))) return json({ error: 'Bad or expired link.' }, 403);
  const type = kind === 'jpg' ? 'image/jpeg' : 'video/mp4';
  const headers: Record<string, string> = { 'Content-Type': type, 'Cache-Control': 'private, max-age=604800, immutable', 'Accept-Ranges': 'bytes' };
  if (url.searchParams.get('dl')) headers['Content-Disposition'] = `attachment; filename="${id}.${kind}"`;

  const range = req.headers.get('range');
  if (!range) {
    const stream = await store('tt-files').get(`${id}.${kind}`, { type: 'stream' });
    return stream ? new Response(stream, { headers }) : json({ error: 'File not found.' }, 404);
  }
  const buf = await store('tt-files').get(`${id}.${kind}`, { type: 'arrayBuffer' });
  if (!buf) return json({ error: 'File not found.' }, 404);
  const size = buf.byteLength;
  const m = range.match(/bytes=(\d*)-(\d*)/);
  let start = m?.[1] ? Number(m[1]) : 0;
  let end = m?.[2] ? Number(m[2]) : size - 1;
  if (!m?.[1] && m?.[2]) (start = Math.max(0, size - Number(m[2]))), (end = size - 1);
  end = Math.min(end, size - 1, start + CHUNK - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
  });
};

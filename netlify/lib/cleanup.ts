import type { AppSettings } from '../../src/lib/types';
import { listVideos, store, writeJson } from './store';

/** Finished videos: their files can go once they are old enough. Waiting or approved videos are never touched. */
const FINISHED = new Set(['posted', 'rejected', 'failed', 'sent']);

/**
 * Auto clean-up (Settings): deletes the video file and thumbnail of finished videos older than `days`, and any
 * file no longer in the list. The text (script, caption, sources) stays. Runs in the GitHub job, not on Netlify.
 */
export async function cleanUp(s: AppSettings, log: (...a: unknown[]) => void): Promise<void> {
  if (!s.cleanup?.enabled) return;
  const cutoff = Date.now() - s.cleanup.days * 86400_000;
  const files = store('tt-files');
  const videos = await listVideos();
  let removed = 0;
  const gone = new Map<string, string>(); // id -> time its file was removed
  for (const v of videos) {
    if (!FINISHED.has(v.status) || v.fileRemovedAt || Date.parse(v.createdAt) > cutoff) continue;
    if (Object.values(v.platforms ?? {}).some((x) => x?.state === 'sending')) continue; // being sent to YouTube / Facebook / Instagram
    await Promise.all([files.delete(`${v.id}.mp4`), files.delete(`${v.id}.jpg`)]);
    gone.set(v.id, new Date().toISOString());
    removed++;
  }
  // Re-read just before writing: an approve, reject or send that happened meanwhile is kept.
  if (gone.size) await writeJson('videos', (await listVideos()).map((v) => (gone.has(v.id) ? { ...v, fileRemovedAt: gone.get(v.id), sizeBytes: 0 } : v)));
  // Files of videos that dropped off the list (it keeps the latest 200).
  const known = new Set(videos.map((v) => v.id));
  const { blobs } = await files.list();
  const orphans = blobs.map((b) => b.key).filter((k) => !known.has(k.replace(/\.(mp4|jpg)$/, '')));
  await Promise.all(orphans.map((k) => files.delete(k)));
  if (removed || orphans.length) log(`Clean-up: removed ${removed} old video file(s)${orphans.length ? ` and ${orphans.length} leftover file(s)` : ''}.`);
}

import type { AppSettings, VideoRecord } from '../../src/lib/types';
import { listVideos, store, writeJson } from './store';

/**
 * Auto clean-up (Settings, owner's choice): every video older than `days` is deleted for good, whatever its status
 * (waiting, approved, posted…): its entry in the list, the video file and the thumbnail. The only ones left alone are
 * videos being built or sent at this very moment (they are deleted on a later run). Also removes any file no longer in
 * the list. Runs in the GitHub jobs and every 2 hours on Netlify (tiktok-link): quick, no AI, free.
 */
const BUSY_MS = 20 * 60_000;
const busy = (v: VideoRecord, now: number) =>
  ((v.status === 'building' || v.status === 'publishing') && now - Date.parse(v.updatedAt) < BUSY_MS) ||
  Object.values(v.platforms ?? {}).some((x) => x?.state === 'sending' && now - Date.parse(x.at) < 15 * 60_000);

export async function cleanUp(s: AppSettings, log: (...a: unknown[]) => void): Promise<void> {
  if (!s.cleanup?.enabled) return;
  const now = Date.now();
  const cutoff = now - s.cleanup.days * 86400_000;
  const files = store('tt-files');
  const videos = await listVideos();
  const old = videos.filter((v) => Date.parse(v.createdAt) < cutoff && !busy(v, now));
  const ids = new Set(old.map((v) => v.id));
  if (ids.size) {
    // The list first (re-read just before writing, so a change made meanwhile is kept), then the files.
    await writeJson('videos', (await listVideos()).filter((v) => !ids.has(v.id)));
    await Promise.all(old.flatMap((v) => [files.delete(`${v.id}.mp4`), files.delete(`${v.id}.jpg`)]));
  }
  // Files of videos that are no longer in the list (deleted, or dropped off the latest 200).
  const known = new Set((await listVideos()).map((v) => v.id));
  const { blobs } = await files.list();
  const orphans = blobs.map((b) => b.key).filter((k) => !known.has(k.replace(/\.(mp4|jpg)$/, '')));
  await Promise.all(orphans.map((k) => files.delete(k)));
  if (ids.size || orphans.length) log(`Clean-up: deleted ${ids.size} video(s) older than ${s.cleanup.days} days${orphans.length ? ` and ${orphans.length} leftover file(s)` : ''}.`);
}

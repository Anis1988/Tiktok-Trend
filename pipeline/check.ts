/**
 * Quick first step of a timer ("schedule") run: is a video due right now?
 * Runs the auto clean-up (free), then writes due=true/false for the workflow, so the slow installs
 * (ffmpeg, voice) are skipped when scheduled videos are off or today's videos are already made.
 */
import { appendFile } from 'node:fs/promises';
import { getSettings, listVideos } from '../netlify/lib/store';
import { cleanUp } from '../netlify/lib/cleanup';
import { recapDue, recapScript } from './lib/recap';

const day = () => new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function due(): Promise<boolean> {
  const s = await getSettings();
  await cleanUp(s, log).catch((e) => log('Clean-up failed:', e instanceof Error ? e.message : e));
  if (!s.enabled) return (log('Scheduled videos are turned off in Settings. Nothing to do.'), false);
  const videos = await listVideos();
  if (s.weeklyRecap && recapDue(videos) && recapScript(videos)) return (log('Sunday: the weekly recap is due.'), true);
  const made = videos.filter((v) => v.createdAt.startsWith(day()) && v.status !== 'failed' && !v.recap).length;
  if (made >= s.perDay) return (log(`Already made ${made} today (limit ${s.perDay}). Nothing to do.`), false);
  return true;
}

// If the check itself fails, carry on: the full run repeats these checks and shows the real error.
const ok = await due().catch((e) => (log('Check failed, running the full job:', e instanceof Error ? e.message : e), true));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `due=${ok}\n`);

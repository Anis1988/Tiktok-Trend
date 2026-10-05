/**
 * Makes one video: today's trends -> AI script -> voice -> stock footage -> MP4 -> saved for review -> email.
 * Runs in GitHub Actions (see .github/workflows/generate.yml). MANUAL=1 skips the schedule checks.
 */
import { mkdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { VideoRecord } from '../src/lib/types';
import { getSettings, listVideos, readJson, saveVideo, store, writeJson } from '../netlify/lib/store';
import { sign } from '../netlify/lib/sign';
import { emailReady, sendEmail } from '../netlify/lib/mailer';
import { findCandidates } from './lib/trends';
import { MODEL, writeScript } from './lib/script';
import { speak, voiceName } from './lib/tts';
import { findClip, footageReady, type Clip } from './lib/footage';
import { renderVideo, type Scene } from './lib/render';

const day = () => new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const manual = process.env.MANUAL === '1';
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY is missing. Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret.');
  const s = await getSettings();
  const videos = await listVideos();
  if (!manual) {
    if (!s.enabled) return log('Scheduled videos are turned off in Settings. Nothing to do.');
    const made = videos.filter((v) => v.createdAt.startsWith(day()) && v.status !== 'failed').length;
    if (made >= s.perDay) return log(`Already made ${made} today (limit ${s.perDay}).`);
  }

  // Paid AI: never more than the daily limit, even if the schedule or the button misbehaves.
  const budget = await readJson<{ day: string; n: number }>('ai', { day: day(), n: 0 });
  if (budget.day !== day()) Object.assign(budget, { day: day(), n: 0 });
  if (budget.n >= s.aiDailyLimit) throw new Error(`Daily AI limit reached (${s.aiDailyLimit}). Raise it in Settings or wait until tomorrow.`);

  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const recent = videos.filter((v) => v.createdAt >= since).map((v) => v.topic);
  const { candidates, errors } = await findCandidates(s.topics, s.country, recent);
  if (errors.length) log('Some trend sources failed:', errors.join(' | '));
  if (!candidates.length) throw new Error('No trends or news found right now.');
  log(`${candidates.length} candidates`);

  budget.n++;
  await writeJson('ai', budget);
  const sc = await writeScript(candidates, s);
  if (sc.pick < 0 || !candidates[sc.pick]) return log('The AI found nothing suitable today:', sc.why);
  const cand = candidates[sc.pick];
  log(`Topic: ${cand.topic} — ${sc.why}`);

  if (!footageReady()) log('No PIXABAY_API_KEY or PEXELS_API_KEY: scenes will use plain backgrounds.');
  const id = `${day()}-${randomBytes(3).toString('hex')}`;
  const dir = `out/${id}`;
  await mkdir(dir, { recursive: true });
  const base: VideoRecord = {
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'failed',
    topic: cand.topic, title: sc.title.slice(0, 80), hook: sc.hook, lines: sc.lines.map((l) => l.text),
    caption: sc.caption.slice(0, 150), hashtags: sc.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 5),
    sources: sc.sources.map((i) => cand.headlines[i]).filter(Boolean), durationSec: 0, sizeBytes: 0,
    voice: voiceName(s.voice), footage: [], model: MODEL,
  };
  if (!base.sources.length) base.sources = cand.headlines;

  try {
    const used = new Set<string>();
    const scenes: Scene[] = [];
    const credits: Clip[] = [];
    for (const [i, l] of sc.lines.entries()) {
      const wav = `${dir}/l${i}.wav`;
      await speak(l.text, s.voice, wav, s.tone === 'punchy');
      let clip: Clip | null = null;
      clip = await findClip(l.footage, used, `${dir}/clip${i}.mp4`);
      if (clip) credits.push(clip);
      scenes.push({ text: l.text, wav, clip: clip?.path ?? null });
    }
    const mp4 = `${dir}/video.mp4`;
    const jpg = `${dir}/thumb.jpg`;
    const dur = await renderVideo(scenes, dir, mp4, jpg);
    const bytes = await readFile(mp4);
    log(`Rendered ${dur.toFixed(1)} s, ${(bytes.length / 1e6).toFixed(1)} MB`);

    const files = store('tt-files');
    await files.set(`${id}.mp4`, new Uint8Array(bytes).buffer);
    await files.set(`${id}.jpg`, new Uint8Array(await readFile(jpg)).buffer);
    const rec: VideoRecord = { ...base, status: 'pending', durationSec: Math.round(dur), sizeBytes: bytes.length, footage: [...new Map(credits.map((c) => [c.url, { by: c.by, url: c.url, site: c.site }])).values()] };
    await saveVideo(rec);
    log(`Saved ${id}`);

    await notify(rec, s.notifyEmail);
  } catch (e) {
    await saveVideo({ ...base, error: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    if (!process.env.KEEP_OUT) await rm(dir, { recursive: true, force: true });
  }
}

/** Email with the review link. A failed email never fails the video: it is still in the app. */
async function notify(rec: VideoRecord, to: string) {
  const site = process.env.SITE_URL?.replace(/\/$/, '');
  try {
    if (to && emailReady() && site) {
      const id = rec.id;
      const link = `${site}/review/${id}?sig=${sign(id)}`;
      await sendEmail(
        to,
        `New video to review: ${rec.title}`,
        [
          `A new ${rec.durationSec}-second video is ready.`,
          '',
          `Watch it and approve or reject: ${link}`,
          '',
          `Topic: ${rec.topic}`,
          `Script:`,
          ...rec.lines.map((l) => `  ${l}`),
          '',
          `Caption: ${rec.caption} ${rec.hashtags.map((h) => `#${h}`).join(' ')}`,
          `Sources: ${rec.sources.map((x) => x.url).join('  ')}`,
          '',
          'Nothing is posted until you approve it.',
        ].join('\n'),
      );
      log('Email sent');
    } else log('No email sent (set the email in Settings, the EmailJS secrets and SITE_URL).');
  } catch (e) {
    log('Email failed:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

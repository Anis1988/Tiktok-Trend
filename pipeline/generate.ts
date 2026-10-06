/**
 * Makes one video: today's trends -> AI script -> voice -> stock footage -> MP4 -> saved for review -> email.
 * Runs in GitHub Actions (see .github/workflows/generate.yml). MANUAL=1 skips the schedule checks.
 */
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { AppSettings, VideoRecord } from '../src/lib/types';
import { getSettings, listVideos, readJson, saveVideo, store, writeJson } from '../netlify/lib/store';
import { sign } from '../netlify/lib/sign';
import { emailReady, sendEmail } from '../netlify/lib/mailer';
import { feedNews, findCandidates, nicheCandidates, subjectNews, type Candidate } from '../netlify/lib/trends';
import { CATEGORIES, findCategory, subsOf, type Niche } from '../src/lib/niches';
import { cleanUp } from '../netlify/lib/cleanup';
import { MODEL, writeScript } from './lib/script';
import { speak, voiceUsed } from './lib/tts';
import { findClip, footageReady, type Clip } from './lib/footage';
import { renderVideo, type Scene } from './lib/render';

const day = () => new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * Test only (SAMPLE=1, "Sample video" on GitHub's Run workflow form): a fixed made-up script, no AI, nothing saved
 * in the app, no email. The video is attached to the GitHub run, to check the voice, captions and music.
 */
async function sample() {
  // Check every channel news feed (free, quick), so broken ones can be spotted in the log.
  for (const c of CATEGORIES) for (const u of c.feeds) {
    const r = await feedNews(u, c.label).then((x) => `${x.length} recent headlines`, (e) => `FAILED ${e instanceof Error ? e.message : e}`);
    log(`Feed ${c.label}: ${u} -> ${r}`);
  }
  const voice = (process.env.SAMPLE_VOICE || 'af_heart') as AppSettings['voice'];
  const lines = [
    { text: 'Your coffee order just got a promotion.', footage: 'coffee cup morning' },
    { text: 'This is a made-up example, so nothing here is real news.', footage: 'city street people walking' },
    { text: 'Imagine a cafe where the barista remembers your name, your order, and your mood.', footage: 'barista coffee shop' },
    { text: 'It is basically a friend who charges five dollars.', footage: 'friends laughing cafe' },
    { text: 'Would you let a robot pick your coffee for a week?', footage: 'robot arm technology' },
  ];
  const dir = 'out/sample';
  await mkdir(dir, { recursive: true });
  const used = new Set<string>();
  const scenes: Scene[] = [];
  for (const [i, l] of lines.entries()) {
    const wav = `${dir}/l${i}.wav`;
    await speak(l.text, voice, wav, true);
    const clip = await findClip(l.footage, used, `${dir}/clip${i}.mp4`);
    scenes.push({ text: l.text, wav, clip: clip?.path ?? null });
  }
  const dur = await renderVideo(scenes, dir, `${dir}/video.mp4`, `${dir}/thumb.jpg`, { music: process.env.SAMPLE_MUSIC !== '0' });
  log(`Sample rendered: ${dur.toFixed(1)} s, voice ${voiceUsed()}`);
  if (process.env.SAVE_COPY_DIR) {
    await mkdir(process.env.SAVE_COPY_DIR, { recursive: true });
    await copyFile(`${dir}/video.mp4`, `${process.env.SAVE_COPY_DIR}/sample.mp4`);
  }
}

/** PICK = "gaming" (all its subcategories) or "gaming:nintendo". Unknown values are ignored. */
function pickedNiche(raw: string | undefined, mine: Niche | null): Niche | null {
  const [catId, subId] = (raw ?? '').trim().split(':');
  const cat = findCategory(catId);
  if (!cat) return null;
  const subs = subId && cat.subs.some((x) => x.id === subId) ? [subId] : cat.subs.map((x) => x.id);
  return { category: cat.id, subs, focus: mine?.category === cat.id ? mine.focus : [], mix: 'niche' };
}

async function main() {
  if (process.env.SAMPLE === '1') return sample();
  const manual = process.env.MANUAL === '1';
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY is missing. Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret.');
  const saved = await getSettings();
  // Auto clean-up first (free, quick), so it also runs when no video is due today.
  await cleanUp(saved, log).catch((e) => log('Clean-up failed:', e instanceof Error ? e.message : e));
  // A category / subcategory picked for this one video ("Make a video now") replaces "My channel" for this run.
  const pick = pickedNiche(process.env.PICK, saved.niche);
  const s = pick ? { ...saved, niche: pick } : saved;
  if (pick) log(`Picked for this video: ${findCategory(pick.category)?.label} · ${subsOf(pick).map((x) => x.label).join(', ')}`);
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

  // A subject typed for this one video (app box or GitHub "Run workflow") replaces the trend search.
  const subject = (process.env.SUBJECT ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let candidates: Candidate[];
  if (subject) {
    log(`Subject: ${subject}`);
    const ideaUrl = /^https:\/\/\S+$/.test(process.env.IDEA_URL ?? '') ? process.env.IDEA_URL! : '';
    // An idea from the app's "Ideas" list is a headline: use it as is if a fresh search finds nothing more.
    const c = (await subjectNews(subject, s.country)) ?? (ideaUrl ? { topic: subject, headlines: [{ title: subject, url: ideaUrl }] } : null);
    if (!c) throw new Error(`No recent news found about "${subject}". Try other words, or leave the subject empty for the top trend.`);
    candidates = [c];
  } else {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const recent = videos.filter((v) => v.createdAt >= since).map((v) => v.topic);
    const turn = await readJson<number>('nicheTurn', 0);
    const found = s.niche ? await nicheCandidates(s.niche, s.country, recent, turn) : await findCandidates(s.topics, s.country, recent);
    if (s.niche && 'sub' in found && found.sub) log(`Channel: ${findCategory(s.niche.category)?.label} · this turn: ${found.sub}`);
    if (found.errors.length) log('Some news sources failed:', found.errors.join(' | '));
    if (!found.candidates.length) throw new Error('No trends or news found right now.');
    candidates = found.candidates;
  }
  log(`${candidates.length} candidates`);

  budget.n++;
  await writeJson('ai', budget);
  const sc = await writeScript(candidates, s);
  if (sc.pick < 0 || !candidates[sc.pick]) {
    if (subject) throw new Error(`The AI skipped "${subject}" (sad or risky subjects are avoided): ${sc.why}`);
    return log('The AI found nothing suitable today:', sc.why);
  }
  const cand = candidates[sc.pick];
  log(`Topic: ${cand.topic} — ${sc.why}`);

  if (!footageReady()) log('No PIXABAY_API_KEY or PEXELS_API_KEY: scenes will use plain backgrounds.');
  const id = `${day()}-${randomBytes(3).toString('hex')}`;
  const dir = `out/${id}`;
  await mkdir(dir, { recursive: true });
  const base: VideoRecord = {
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'failed',
    topic: cand.topic, title: sc.title.slice(0, 80), hook: sc.hook, lines: sc.lines.map((l) => l.text),
    caption: sc.caption.slice(0, 150), firstComment: sc.firstComment.slice(0, 150) || undefined, hashtags: sc.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 5),
    sources: sc.sources.map((i) => cand.headlines[i]).filter(Boolean), durationSec: 0, sizeBytes: 0,
    voice: s.voice, footage: [], model: MODEL,
  };
  if (!base.sources.length) base.sources = cand.headlines;

  try {
    const used = new Set<string>();
    const scenes: Scene[] = [];
    const credits: Clip[] = [];
    for (const [i, l] of sc.lines.entries()) {
      const wav = `${dir}/l${i}.wav`;
      await speak(l.text, s.voice, wav, s.tone === 'punchy' || s.tone === 'witty');
      let clip: Clip | null = null;
      clip = await findClip(l.footage, used, `${dir}/clip${i}.mp4`);
      if (clip) credits.push(clip);
      scenes.push({ text: l.text, wav, clip: clip?.path ?? null });
    }
    const mp4 = `${dir}/video.mp4`;
    const jpg = `${dir}/thumb.jpg`;
    const dur = await renderVideo(scenes, dir, mp4, jpg, { music: s.music });
    const bytes = await readFile(mp4);
    log(`Rendered ${dur.toFixed(1)} s, ${(bytes.length / 1e6).toFixed(1)} MB`);

    const files = store('tt-files');
    await files.set(`${id}.mp4`, new Uint8Array(bytes).buffer);
    await files.set(`${id}.jpg`, new Uint8Array(await readFile(jpg)).buffer);
    const rec: VideoRecord = { ...base, voice: voiceUsed() || base.voice, status: 'pending', durationSec: Math.round(dur), sizeBytes: bytes.length, footage: [...new Map(credits.map((c) => [c.url, { by: c.by, url: c.url, site: c.site }])).values()] };
    await saveVideo(rec);
    log(`Saved ${id}`);
    // Next video starts with the next subcategory of your channel.
    if (s.niche && !subject && !pick) await writeJson('nicheTurn', (await readJson<number>('nicheTurn', 0)) + 1);
    if (process.env.SAVE_COPY_DIR) {
      // GitHub attaches this copy to the run, so the video can be downloaded even without the website.
      await mkdir(process.env.SAVE_COPY_DIR, { recursive: true });
      await copyFile(mp4, `${process.env.SAVE_COPY_DIR}/${id}.mp4`);
    }

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
          ...(rec.firstComment ? [`Comment to pin: ${rec.firstComment}`] : []),
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

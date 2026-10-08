/**
 * Makes one video: today's trends -> AI script -> voice -> stock footage -> MP4 -> saved for review -> email.
 * Runs in GitHub Actions (see .github/workflows/generate.yml). MANUAL=1 skips the schedule checks.
 */
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { AppSettings, DraftLine, Extra, VideoRecord } from '../src/lib/types';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { getSettings, listVideos, readJson, saveVideo, store, writeJson } from '../netlify/lib/store';
import { sign } from '../netlify/lib/sign';
import { emailReady, sendEmail } from '../netlify/lib/mailer';
import { LISTY, bingNews, feedNews, findCandidates, nicheCandidates, subjectNews, type Candidate } from '../netlify/lib/trends';
import { CATEGORIES, DEFAULT_LOOK, findCategory, subsOf, type Niche } from '../src/lib/niches';
import { cleanUp } from '../netlify/lib/cleanup';
import { MODEL, writeScript } from './lib/script';
import { speak, voiceUsed } from './lib/tts';
import { footageReady } from './lib/footage';
import { renderVideo, type RenderOptions, type Scene } from './lib/render';
import { visualFor, type Credit } from './lib/visuals';
import { chooseMedia, listMedia } from '../netlify/lib/media';

const CAPTION_HEX: Record<AppSettings['captionStyle']['color'], string> = { yellow: '#FFE600', cyan: '#22E3FF', green: '#7CFF4F', pink: '#FF4FD8', white: '#FFFFFF' };
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
  for (const [name, find] of [['Google News', (q: string) => subjectNews(q, 'US').then((c) => c?.headlines ?? [])], ['Bing News', bingNews]] as const) {
    const r = await find('Attack on Titan').then((h) => `${h.length} headlines, e.g. ${h[0]?.title} (${h[0]?.url})`, (e) => `FAILED ${e instanceof Error ? e.message : e}`);
    log(`Subject search ${name}: ${r}`);
  }
  const voice = (process.env.SAMPLE_VOICE || 'af_heart') as AppSettings['voice'];
  const lines: DraftLine[] = [
    { text: 'Your coffee order just got a promotion.', footage: 'coffee cup morning', keywords: ['promotion'], object: 'coffee cup' },
    { text: 'This is a made-up example, so nothing here is real news.', footage: 'city street people walking', keywords: [] },
    { text: 'Guess who: short, scary fast, and obsessed with cleaning.', footage: 'anime city', keywords: ['cleaning'], character: 'Levi Ackerman | Attack on Titan', label: 'Guess #1', quiz: 'hide' },
    { text: "It's Levi, who would clean the cup before drinking it.", footage: 'anime city', keywords: ['Levi'], character: 'Levi Ackerman | Attack on Titan', label: 'Levi Ackerman', quiz: 'reveal' },
    { text: 'Number one: LeBron James, who would dunk the sugar cube.', footage: 'basketball court', keywords: ['LeBron'], real: 'LeBron James', label: '#1 LeBron James' },
    { text: 'Picture sipping it right under the Eiffel Tower.', footage: 'paris cafe', real: 'Eiffel Tower', keywords: ['Eiffel Tower'] },
    { text: 'Or floating past Saturn, if space stations had a barista.', footage: 'space stars', real: 'Saturn', keywords: ['Saturn'] },
    { text: 'Would you let a robot pick your coffee for a week?', footage: 'robot arm technology', keywords: [] },
  ];
  const dir = 'out/sample';
  await mkdir(dir, { recursive: true });
  const used = new Set<string>();
  const scenes: Scene[] = [];
  for (const [i, l] of lines.entries()) {
    const wav = `${dir}/l${i}.wav`;
    await speak(l.text, voice, wav, true);
    const v = await visualFor(l, i, dir, { mine: null, real: true, characters: true, used, credits: [] });
    if (v.credit) log(`Sample scene ${i + 1}: ${v.credit}`);
    scenes.push({ text: l.text, wav, keywords: l.keywords, label: l.label, quiz: l.quiz, ...v });
  }
  const dur = await renderVideo(scenes, dir, `${dir}/video.mp4`, `${dir}/thumb.jpg`, {
    ...renderOptions({ ...DEFAULT_SETTINGS, niche: { category: 'food', subs: ['drinks'], focus: [], mix: 'niche' }, endCardName: '@yourname' }, lines[0].text, { extras: ['fast', 'cover'], cover: 'Coffee gets promoted?' }),
    music: process.env.SAMPLE_MUSIC !== '0',
  });
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

/** Settings for one video: a picked category replaces "My channel"; "any" (a typed subject, no category) drops the niche. */
function settingsFor(raw: string | undefined, saved: AppSettings): AppSettings {
  if (raw?.trim() === 'any') return { ...saved, niche: null };
  const pick = pickedNiche(raw, saved.niche);
  return pick ? { ...saved, niche: pick } : saved;
}

async function main() {
  if (process.env.SAMPLE === '1') return sample();
  const manual = process.env.MANUAL === '1';
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_API_KEY is missing. Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret.');
  const saved = await getSettings();
  // Auto clean-up first (free, quick), so it also runs when no video is due today.
  await cleanUp(saved, log).catch((e) => log('Clean-up failed:', e instanceof Error ? e.message : e));
  if (process.env.RENDER_ID?.trim()) return buildChecked(process.env.RENDER_ID.trim(), saved);
  // A subject typed for this one video (app box or GitHub "Run workflow") replaces the trend search.
  const subject = (process.env.SUBJECT ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  // Extras picked for this one video in the app: quiz, fast pacing, bold cover.
  const extras = [...new Set((process.env.EXTRAS ?? '').split(',').map((x) => x.trim()))].filter((x): x is Extra => ['quiz', 'facts', 'fast', 'cover'].includes(x));
  if (extras.length) log(`Extras: ${extras.join(', ')}`);
  const ideaUrl = /^https:\/\/\S+$/.test(process.env.IDEA_URL ?? '') ? process.env.IDEA_URL! : '';
  // A category / subcategory picked for this one video ("Make a video now") replaces "My channel" for this run.
  // A typed subject with no category is free: it does not have to fit "My channel" (ideas from the list come from it anyway).
  const pickRaw = process.env.PICK?.trim() || (subject && !ideaUrl ? 'any' : '');
  const pick = pickRaw === 'any' ? null : pickedNiche(pickRaw, saved.niche);
  const s = settingsFor(pickRaw, saved);
  if (pick) log(`Picked for this video: ${findCategory(pick.category)?.label} · ${subsOf(pick).map((x) => x.label).join(', ')}`);
  if (pickRaw === 'any' && saved.niche) log('Subject without a category: not limited to My channel.');
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

  let candidates: Candidate[];
  if (subject) {
    log(`Subject: ${subject}`);
    // Rankings, "top 10", fun facts…: a topic video from well-known facts (no news needed).
    // Otherwise the latest news; an idea from the app's "Ideas" list is a headline, used as is if a fresh search finds nothing more;
    // and a subject that is not in the news becomes a topic video too.
    const topic: Candidate = { topic: subject, headlines: [], evergreen: true };
    // A quiz or fun facts use well-known facts, so their subject is always a topic video.
    const c = !ideaUrl && (LISTY.test(subject) || extras.includes('quiz') || extras.includes('facts'))
      ? topic
      : (await subjectNews(subject, s.country)) ?? (ideaUrl ? { topic: subject, headlines: [{ title: subject, url: ideaUrl }] } : topic);
    if (c.evergreen) log('Topic video (not news): written from well-known facts.');
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
  const sc = await writeScript(candidates, s, extras, !!subject); // your own subject: only legal limits apply
  if (sc.pick < 0 || !candidates[sc.pick]) {
    if (subject) throw new Error(`The AI skipped "${subject}": ${sc.why}`);
    return log('The AI found nothing suitable today:', sc.why);
  }
  const cand = candidates[sc.pick];
  log(`Topic: ${cand.topic} — ${sc.why}`);

  const id = `${day()}-${randomBytes(3).toString('hex')}`;
  const base: VideoRecord = {
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'failed',
    topic: cand.topic, title: sc.title.slice(0, 80), hook: sc.hook, lines: sc.lines.map((l) => l.text),
    caption: sc.caption.slice(0, 150), firstComment: sc.firstComment.slice(0, 150) || undefined, hashtags: sc.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 5),
    sources: sc.sources.map((i) => cand.headlines[i]).filter(Boolean), durationSec: 0, sizeBytes: 0,
    voice: s.voice, footage: [], model: MODEL,
    draft: { lines: sc.lines.map((l) => ({
      text: l.text, footage: l.footage, keywords: (l.keywords ?? []).slice(0, 3), real: l.real?.trim().slice(0, 80) || undefined,
      character: l.character?.trim().slice(0, 100) || undefined, object: l.object?.trim().slice(0, 60) || undefined, label: l.label?.trim().slice(0, 40) || undefined,
      quiz: l.quiz || undefined,
    })) },
    pick: pickRaw || undefined,
    topicVideo: cand.evergreen || undefined,
    extras: extras.length ? extras : undefined,
    cover: sc.cover?.trim().slice(0, 40) || undefined,
  };
  if (!base.sources.length) base.sources = cand.headlines;
  // Next video starts with the next subcategory of your channel.
  if (s.niche && !subject && !pick) await writeJson('nicheTurn', (await readJson<number>('nicheTurn', 0)) + 1);

  if (s.reviewScript) {
    // "Check the script first": stop here; the video is built when you tap "Build video" in the app.
    const rec: VideoRecord = { ...base, status: 'script' };
    await saveVideo(rec);
    log(`Script saved for checking: ${id}`);
    await notify(rec, s.notifyEmail);
    return;
  }
  await build(base, s);
}

/** Effects and look from Settings (Videos tab → Video style). */
function renderOptions(s: AppSettings, hook: string, v: Pick<VideoRecord, 'extras' | 'cover'> = {}): RenderOptions {
  const e = s.effects;
  const x = v.extras ?? [];
  const cat = findCategory(s.niche?.category);
  return {
    music: s.music,
    hook: e.hookCard ? hook : undefined,
    keywords: e.keywords,
    sfx: e.sfx,
    progress: e.progress,
    look: e.nicheLook ? cat?.look ?? DEFAULT_LOOK : DEFAULT_LOOK,
    captionColor: CAPTION_HEX[s.captionStyle.color],
    captionSize: s.captionStyle.size,
    endCard: e.endCard ? { title: cat ? cat.label : 'trending news', subtitle: s.endCardName.trim() || undefined } : undefined,
    fast: x.includes('fast'),
    cover: x.includes('cover') ? (v.cover || hook) : undefined,
  };
}

/** Voice, footage and the final MP4 for a script, then saved for review and emailed. */
async function build(base: VideoRecord, s: AppSettings) {
  if (!footageReady()) log('No PIXABAY_API_KEY or PEXELS_API_KEY: scenes will use plain backgrounds.');
  const lines: DraftLine[] = base.draft?.lines ?? base.lines.map((text) => ({ text, footage: base.topic, keywords: [] }));
  const id = base.id;
  const dir = `out/${id}`;
  await mkdir(dir, { recursive: true });
  try {
    const used = new Set<string>();
    const scenes: Scene[] = [];
    const credits: Credit[] = [];
    const mine = chooseMedia(lines, s.effects.myClips || lines.some((l) => l.media) ? await listMedia() : [], s.effects.myClips);
    for (const [i, l] of lines.entries()) {
      const wav = `${dir}/l${i}.wav`;
      await speak(l.text, s.voice, wav, s.tone === 'punchy' || s.tone === 'witty');
      const v = await visualFor(l, i, dir, { mine: mine[i], real: s.effects.realMedia, characters: s.effects.characters, used, credits });
      if (mine[i]) log(`Scene ${i + 1}: your clip "${mine[i]!.name}"`);
      else if (v.credit) log(`Scene ${i + 1}: ${v.credit}`);
      scenes.push({ text: l.text, wav, keywords: l.keywords, label: l.label, quiz: l.quiz, ...v });
    }
    const mp4 = `${dir}/video.mp4`;
    const jpg = `${dir}/thumb.jpg`;
    const dur = await renderVideo(scenes, dir, mp4, jpg, renderOptions(s, base.hook, base));
    const bytes = await readFile(mp4);
    log(`Rendered ${dur.toFixed(1)} s, ${(bytes.length / 1e6).toFixed(1)} MB`);

    const files = store('tt-files');
    await files.set(`${id}.mp4`, new Uint8Array(bytes).buffer);
    await files.set(`${id}.jpg`, new Uint8Array(await readFile(jpg)).buffer);
    const rec: VideoRecord = {
      ...base, lines: lines.map((l) => l.text), voice: voiceUsed() || base.voice, status: 'pending', error: undefined,
      durationSec: Math.round(dur), sizeBytes: bytes.length, footage: [...new Map(credits.map((c) => [c.url, c])).values()],
    };
    await saveVideo(rec);
    log(`Saved ${id}`);
    if (process.env.SAVE_COPY_DIR) {
      // GitHub attaches this copy to the run, so the video can be downloaded even without the website.
      await mkdir(process.env.SAVE_COPY_DIR, { recursive: true });
      await copyFile(mp4, `${process.env.SAVE_COPY_DIR}/${id}.mp4`);
    }
    await notify(rec, s.notifyEmail);
  } catch (e) {
    // A checked script goes back to "check it" so Build can be tapped again; otherwise the video failed.
    await saveVideo({ ...base, status: base.draft && base.status === 'building' ? 'script' : 'failed', error: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    if (!process.env.KEEP_OUT) await rm(dir, { recursive: true, force: true });
  }
}

/** RENDER_ID: build the video for a script you checked in the app (no AI call). */
async function buildChecked(id: string, saved: AppSettings) {
  const rec = (await listVideos()).find((v) => v.id === id);
  if (!rec) throw new Error(`Script ${id} not found.`);
  if (rec.status !== 'building' && rec.status !== 'script') return log(`Video ${id} is already ${rec.status}: nothing to build.`);
  const s = settingsFor(rec.pick, saved);
  log(`Building checked script ${id}: ${rec.title}`);
  await build({ ...rec, status: 'building' }, s);
}

/** Email with the review link. A failed email never fails the video: it is still in the app. */
async function notify(rec: VideoRecord, to: string) {
  const site = process.env.SITE_URL?.replace(/\/$/, '');
  try {
    if (to && emailReady() && site) {
      const id = rec.id;
      const link = `${site}/review/${id}?sig=${sign(id)}`;
      const script = rec.status === 'script';
      await sendEmail(
        to,
        script ? `Script ready to check: ${rec.title}` : `New video to review: ${rec.title}`,
        [
          script ? 'A new script is ready. Read it, edit it if you like, then tap "Build video".' : `A new ${rec.durationSec}-second video is ready.`,
          '',
          script ? `Check the script: ${link}` : `Watch it and approve or reject: ${link}`,
          '',
          `Topic: ${rec.topic}`,
          `Script:`,
          ...rec.lines.map((l) => `  ${l}`),
          '',
          `Caption: ${rec.caption} ${rec.hashtags.map((h) => `#${h}`).join(' ')}`,
          ...(rec.firstComment ? [`Comment to pin: ${rec.firstComment}`] : []),
          rec.topicVideo && !rec.sources.length ? 'Topic video: written from well-known facts, not news. Check the facts before approving.' : `Sources: ${rec.sources.map((x) => x.url).join('  ')}`,
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

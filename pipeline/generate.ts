/**
 * Makes one video: today's trends -> AI script -> voice -> stock footage -> MP4 -> saved for review -> email.
 * Runs in GitHub Actions (see .github/workflows/generate.yml). MANUAL=1 skips the schedule checks.
 */
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { AppSettings, DraftLine, Extra, VideoRecord } from '../src/lib/types';
import { DEFAULT_SETTINGS, seriesKey } from '../src/lib/types';
import { getSettings, listVideos, readJson, saveVideo, store, writeJson } from '../netlify/lib/store';
import { sign } from '../netlify/lib/sign';
import { emailReady, sendEmail } from '../netlify/lib/mailer';
import { LISTY, bingNews, feedNews, findCandidates, nicheCandidates, seriesTrending, subjectNews, type Candidate } from '../netlify/lib/trends';
import { CATEGORIES, DEFAULT_LOOK, findCategory, subsOf, type Niche } from '../src/lib/niches';
import { cleanUp } from '../netlify/lib/cleanup';
import { MODEL, writeScript, type ScriptOut, type SeriesBrief } from './lib/script';
import { refreshStats, resultsNote } from '../netlify/lib/stats';
import { recapDue, recapScript } from './lib/recap';
import { kineticClip } from './lib/graphics';
import { resetVoiceUsed, speak, voiceUsed } from './lib/tts';
import { footageReady } from './lib/footage';
import { renderVideo, type RenderOptions, type Scene } from './lib/render';
import { visualFor, type Credit } from './lib/visuals';
import { chooseMedia, listMedia } from '../netlify/lib/media';
import { fcmAll, firebaseKey, getFcmTokens } from '../netlify/lib/fcm';

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
    { text: 'You asked if coffee can get a promotion. It can.', footage: 'coffee cup morning', keywords: ['promotion'], comment: { text: 'Can coffee actually get a promotion?? Asking for a friend', by: 'sample_viewer' } },
    { text: 'Your coffee order just got a promotion.', footage: 'coffee cup morning', keywords: ['promotion'], object: 'coffee cup' },
    { text: 'Nobody saw this coming.', footage: 'surprised people', keywords: ['coming'], bigText: 'Nobody saw this coming', sticker: 'shock' },
    { text: 'Coffee was discovered by goats? Made-up example, but here it is a fact.', footage: 'goats', keywords: ['goats'], label: 'Claim #1', verdict: 'fact' },
    { text: 'Eiffel Tower or Statue of Liberty for your coffee break?', footage: 'landmarks', keywords: [], label: 'Round 1', versus: { a: 'Eiffel Tower', b: 'Statue of Liberty' } },
    { text: 'How we got here, in made-up dates.', footage: 'calendar', keywords: [], timeline: { title: 'How we got here', events: [{ date: '1999', label: 'Made-up: first latte art' }, { date: '2015', label: 'Made-up: coffee apps' }, { date: 'Today', label: 'Made-up: coffee gets promoted' }] } },
    { text: 'This is a made-up example, so nothing here is real news.', footage: 'city street people walking', keywords: [] },
    { text: 'Guess who: short, scary fast, and obsessed with cleaning.', footage: 'anime city', keywords: ['cleaning'], character: 'Levi Ackerman | Attack on Titan', label: 'Guess #1', quiz: 'hide' },
    { text: "It's Levi, who would clean the cup before drinking it.", footage: 'anime city', keywords: ['Levi'], character: 'Levi Ackerman | Attack on Titan', label: 'Levi Ackerman', quiz: 'reveal' },
    { text: 'And the strongest coffee drinker of all is…', footage: 'coffee shop', keywords: ['strongest'], delivery: 'calm', pause: true },
    { text: 'Number one: LeBron James, who would dunk the sugar cube.', footage: 'basketball court', keywords: ['LeBron'], real: 'LeBron James', label: '#1 LeBron James', desc: 'Made-up: four rings and a very strong espresso.', delivery: 'hype', sticker: 'fire' },
    { text: 'No way, Mikasa would win any coffee contest!', footage: 'anime city', keywords: ['Mikasa'], character: 'Mikasa Ackerman | Attack on Titan', label: 'TEAM MIKASA', speaker: 'B' },
    { text: 'Picture sipping it right under the Eiffel Tower.', footage: 'paris cafe', real: 'Eiffel Tower', keywords: ['Eiffel Tower'] },
    { text: 'Or floating past Saturn, if space stations had a barista.', footage: 'space stars', real: 'Saturn', keywords: ['Saturn'] },
    { text: 'Made-up numbers: espresso beats latte, and tea is crying.', footage: 'coffee shop', keywords: ['espresso'], chart: { title: 'Made-up coffee poll', unit: '%', bars: [{ label: 'Espresso', value: 46 }, { label: 'Latte', value: 31 }, { label: 'Tea', value: 23 }] } },
    { text: 'And the best beans? Reports say they grow in Colombia.', footage: 'coffee beans', keywords: ['Colombia'], map: 'Colombia' },
    { text: 'Even the headlines agree, and this one is made up too.', footage: 'newspaper', keywords: ['headlines'], headline: { title: 'Made-up example: coffee named the official drink of Mondays', site: 'Sample News' } },
    { text: 'Would you let a robot pick your coffee for a week?', footage: 'robot arm technology', keywords: [] },
  ];
  const dir = 'out/sample';
  await mkdir(dir, { recursive: true });
  const used = new Set<string>();
  const scenes: Scene[] = [];
  for (const [i, l] of lines.entries()) {
    const wav = `${dir}/l${i}.wav`;
    await speak(l.text, l.speaker === 'B' ? otherVoice(voice) : voice, wav, paceOf(l, { ...DEFAULT_SETTINGS, tone: 'witty' }));
    const { kind, ...v } = await visualFor(l, i, dir, { mine: null, real: true, characters: true, charts: true, accent: '#22D3EE', used, credits: [] });
    log(`Sample scene ${i + 1}: ${kind}${v.credit ? ` · ${v.credit}` : ''}`);
    const slide = l.desc ? { desc: l.desc, index: 0, total: 3 } : undefined; // one sample slide (as slide 1 of 3)
    scenes.push({ slide, text: l.text, wav, keywords: l.keywords, label: l.label, quiz: l.quiz, verdict: l.verdict, speaker: l.speaker, pause: l.pause ? PAUSE : 0, sticker: l.sticker, ...v });
  }
  const dur = await renderVideo(scenes, dir, `${dir}/video.mp4`, `${dir}/thumb.jpg`, {
    ...renderOptions({ ...DEFAULT_SETTINGS, niche: { category: 'food', subs: ['drinks'], focus: [], mix: 'niche' }, endCardName: '@yourname', seriesName: 'Coffee News' }, lines[0].text, { extras: ['fast', 'cover'], cover: 'Coffee gets promoted?', episode: 7 }),
    music: process.env.SAMPLE_MUSIC !== '0',
    skin: (['game', 'manga', 'sport'] as const).find((x) => x === process.env.SAMPLE_SKIN) ?? 'manga',
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
  const rawExtras = (process.env.EXTRAS ?? '').split(',').map((x) => x.trim());
  // Weekly recap: "Make this week's recap" in the app, or Sunday's scheduled run.
  if (rawExtras.includes('recap')) return weeklyRecap(saved, true);
  if (!manual && saved.enabled && saved.weeklyRecap && recapDue(await listVideos())) await weeklyRecap(saved, false).catch((e) => log('Weekly recap failed:', e instanceof Error ? e.message : e));
  // A subject typed for this one video (app box or GitHub "Run workflow") replaces the trend search.
  let subject = (process.env.SUBJECT ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  // Extras picked for this one video in the app: quiz, fast pacing, bold cover…
  let extras = [...new Set(rawExtras)].filter((x): x is Extra => ['quiz', 'facts', 'myth', 'versus', 'debate', 'slides', 'fast', 'cover', 'long'].includes(x));
  if (extras.length) log(`Extras: ${extras.join(', ')}`);
  let ideaUrl = /^https:\/\/\S+$/.test(process.env.IDEA_URL ?? '') ? process.env.IDEA_URL! : '';
  // A link pasted (or shared from the phone) as the subject: the video is about that page.
  if (/^https?:\/\/\S+$/.test(subject)) {
    ideaUrl = subject.replace(/^http:/, 'https:');
    subject = (await pageTitle(ideaUrl)) || subject;
    log(`Link: ${ideaUrl} -> "${subject}"`);
  }
  subject = subject.slice(0, 200);
  // Reply videos: the viewer's comment (and name) the video answers.
  const commentText = (process.env.COMMENT ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const comment = commentText ? { text: commentText, by: (process.env.COMMENT_BY ?? '').replace(/[^\w.@-]/g, '').slice(0, 30) || undefined } : undefined;
  if (comment) log(`Reply to a comment${comment.by ? ` from @${comment.by.replace(/^@/, '')}` : ''}: ${comment.text}`);
  if (comment && !subject) subject = comment.text.slice(0, 200);
  // A category / subcategory picked for this one video ("Make a video now") replaces "My channel" for this run.
  // A typed subject with no category is free: it does not have to fit "My channel" (ideas from the list come from it anyway).
  const pickRaw = process.env.PICK?.trim() || (subject && !ideaUrl ? 'any' : '');
  const pick = pickRaw === 'any' ? null : pickedNiche(pickRaw, saved.niche);
  // 📅 Daily series: scheduled runs (or "Make the next series video now") make the series video instead of a trend.
  const seriesRun = rawExtras.includes('series') || (saved.series.on && !manual && !subject && !pickRaw);
  const s = seriesRun ? { ...saved, niche: null } : settingsFor(pickRaw, saved);
  if (pick) log(`Picked for this video: ${findCategory(pick.category)?.label} · ${subsOf(pick).map((x) => x.label).join(', ')}`);
  if (pickRaw === 'any' && saved.niche) log('Subject without a category: not limited to My channel.');
  const videos = await listVideos();
  if (!manual) {
    if (!s.enabled) return log('Scheduled videos are turned off in Settings. Nothing to do.');
    const made = videos.filter((v) => v.createdAt.startsWith(day()) && v.status !== 'failed' && !v.recap).length;
    if (made >= s.perDay) return log(`Already made ${made} today (limit ${s.perDay}).`);
  }

  // Paid AI: never more than the daily limit, even if the schedule or the button misbehaves.
  const budget = await readJson<{ day: string; n: number }>('ai', { day: day(), n: 0 });
  if (budget.day !== day()) Object.assign(budget, { day: day(), n: 0 });
  if (budget.n >= s.aiDailyLimit) throw new Error(`Daily AI limit reached (${s.aiDailyLimit}). Raise it in Settings or wait until tomorrow.`);

  let candidates: Candidate[];
  let series: SeriesBrief | undefined;
  if (seriesRun) {
    const subj = s.series.subject.trim() || DEFAULT_SETTINGS.series.subject;
    const used = s.series.used[seriesKey(subj)] ?? [];
    const t = await seriesTrending(s.country);
    t.log.forEach((l) => log(l));
    series = { subject: subj, facts: Math.max(5, s.series.facts), minSeconds: s.series.minSeconds, used, trending: t.lines };
    log(`Daily series: "${subj}" · ${series.facts} facts · at least ${series.minSeconds} s · ${used.length} already done`);
    candidates = [{ topic: subj, headlines: [], evergreen: true }];
    extras = [...extras.filter((e) => e !== 'long' && e !== 'facts'), 'facts'];
  } else if (subject) {
    log(`Subject: ${subject}`);
    // Rankings, "top 10", fun facts…: a topic video from well-known facts (no news needed).
    // Otherwise the latest news; an idea from the app's "Ideas" list is a headline, used as is if a fresh search finds nothing more;
    // and a subject that is not in the news becomes a topic video too.
    const topic: Candidate = { topic: subject, headlines: [], evergreen: true };
    // A quiz, fun facts, myth vs fact or this-or-that use well-known facts, so their subject is always a topic video.
    const c = !ideaUrl && (LISTY.test(subject) || extras.some((e) => ['quiz', 'facts', 'myth', 'versus', 'slides'].includes(e)))
      ? topic
      : (await subjectNews(subject, s.country)) ?? (ideaUrl ? { topic: subject, headlines: [{ title: subject, url: ideaUrl }] } : topic);
    if (c.evergreen) log('Topic video (not news): written from well-known facts.');
    candidates = [c];
  } else {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    // Recent videos (topic and title, in any wording) are never picked again: see sameStory in trends.ts.
    const recent = videos.filter((v) => v.createdAt >= since && v.status !== 'failed').flatMap((v) => [v.topic, v.title]);
    const turn = await readJson<number>('nicheTurn', 0);
    const found = s.niche ? await nicheCandidates(s.niche, s.country, recent, turn) : await findCandidates(s.topics, s.country, recent);
    if (s.niche && 'sub' in found && found.sub) log(`Channel: ${findCategory(s.niche.category)?.label} · this turn: ${found.sub}`);
    if (found.errors.length) log('Some news sources failed:', found.errors.join(' | '));
    if (!found.candidates.length) throw new Error('No trends or news found right now.');
    candidates = found.candidates;
  }
  log(`${candidates.length} candidates`);

  // Learn from your results: fresh YouTube / Instagram numbers, then your best and weakest videos for the AI.
  await refreshStats(log);
  const results = resultsNote(await listVideos());
  if (results) log('Using your recent results to guide the script.');

  budget.n++;
  await writeJson('ai', budget);
  // The AI also sees your last month of videos, so it never makes the same story (or the same person) again.
  const avoid = subject ? [] : videos.filter((v) => v.createdAt >= new Date(Date.now() - 30 * 86400_000).toISOString() && v.status !== 'failed').slice(0, 40).map((v) => v.title || v.topic);
  let sc = await writeScript(candidates, s, extras, !!subject || !!series, results, comment, avoid, series); // your own subject: only legal limits apply
  if (series) {
    // At least N facts, long enough, and someone new: otherwise the AI is asked once more (1 more AI check, within the limit).
    let problem = seriesProblem(sc, series);
    if (problem && budget.n < s.aiDailyLimit) {
      log(`Series script not right (${problem}): asking the AI once more.`);
      budget.n++;
      await writeJson('ai', budget);
      const again = await writeScript(candidates, s, extras, true, results, comment, avoid, { ...series, retry: `Your last try was rejected: ${problem}. Fix that.` });
      const p2 = seriesProblem(again, series);
      if (!p2 || seriesWorse(problem, p2)) { sc = again; problem = p2; }
    }
    if (problem && /already done|no name/.test(problem)) throw new Error(`Daily series: ${problem}`);
    if (problem) log(`Series script still not perfect (${problem}): using it anyway.`);
    sc.pick = 0;
    // Remember who was done, so they never come back (re-read: the app may have changed settings meanwhile).
    const now = await getSettings();
    const key = seriesKey(series.subject);
    const list = [...(now.series.used[key] ?? []), sc.seriesPick.trim().slice(0, 100)].slice(-1000);
    await writeJson('settings', { ...now, series: { ...now.series, used: { ...now.series.used, [key]: list } } });
    log(`Series pick: ${sc.seriesPick} (${list.length} done so far)`);
  }
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
    caption: sc.caption.slice(0, 150), firstComment: sc.firstComment.slice(0, 150) || undefined, hashtags: sc.hashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, '')).filter((h) => h && !/^(fyp|foryou|foryoupage|viral|trending)$/i.test(h)).slice(0, 5),
    searchWords: (sc.searchWords ?? []).map((w) => w.trim().slice(0, 50)).filter(Boolean).slice(0, 3),
    sources: sc.sources.map((i) => cand.headlines[i]).filter(Boolean), durationSec: 0, sizeBytes: 0,
    voice: s.voice, footage: [], model: MODEL,
    draft: { lines: sc.lines.map((l) => ({
      text: l.text, footage: l.footage, keywords: (l.keywords ?? []).slice(0, 3), real: l.real?.trim().slice(0, 80) || undefined,
      character: l.character?.trim().slice(0, 100) || undefined, object: l.object?.trim().slice(0, 60) || undefined, label: l.label?.trim().slice(0, 40) || undefined,
      desc: extras.includes('slides') ? l.slideText?.trim().slice(0, 90) || undefined : undefined,
      quiz: l.quiz || undefined,
      chart: l.chartBars.length >= 2 ? { title: (l.chartTitle || sc.title).slice(0, 40), unit: l.chartUnit?.trim().slice(0, 12) || undefined, bars: l.chartBars.slice(0, 6).map((b) => ({ label: b.label.slice(0, 24), value: b.value })) } : undefined,
      map: l.map?.trim().slice(0, 60) || undefined,
      headline: headlineOf(cand.headlines[l.headline]),
      bigText: l.bigText?.trim().slice(0, 40) || undefined,
      verdict: l.verdict || undefined,
      speaker: l.speaker || undefined,
      delivery: l.delivery === 'normal' ? undefined : l.delivery,
      pause: l.pauseAfter || undefined,
      sticker: l.sticker || undefined,
      versus: l.versusA?.trim() && l.versusB?.trim() ? { a: l.versusA.trim().slice(0, 60), b: l.versusB.trim().slice(0, 60) } : undefined,
      timeline: l.timelineEvents.length >= 2 ? { title: (l.timelineTitle || 'How we got here').slice(0, 40), events: l.timelineEvents.slice(0, 5).map((e) => ({ date: e.date.slice(0, 20), label: e.label.slice(0, 60) })) } : undefined,
    })) },
    pick: pickRaw || undefined,
    topicVideo: cand.evergreen || undefined,
    extras: extras.length ? extras : undefined,
    cover: sc.cover?.trim().slice(0, 40) || undefined,
    comment,
    series: series ? { subject: series.subject, pick: sc.seriesPick.trim().slice(0, 100), minSeconds: series.minSeconds } : undefined,
    episode: s.seriesName.trim() ? await nextEpisode() : undefined,
  };
  // Reply videos open on the comment itself.
  if (comment && base.draft?.lines[0]) base.draft.lines[0].comment = comment;
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

/** What is wrong with a daily-series script, or '' if it is fine. */
function seriesProblem(sc: ScriptOut, b: SeriesBrief): string {
  const name = sc.seriesPick.trim();
  if (!name) return 'no name in seriesPick';
  if (b.used.some((u) => seriesKey(u) === seriesKey(name))) return `${name} is already done`;
  const facts = sc.lines.filter((l) => /^fact\s*#?\s*\d+/i.test(l.label.trim())).length;
  if (facts < b.facts) return `only ${facts} facts (need at least ${b.facts})`;
  const words = sc.lines.reduce((t, l) => t + l.text.split(/\s+/).filter(Boolean).length, 0);
  if (words < b.minSeconds * 2.4) return `too short: ${words} words (need at least ${Math.ceil(b.minSeconds * 2.4)} for ${b.minSeconds} seconds)`;
  return '';
}
/** A retry is kept if the first try had a worse problem (a repeat or no name beats "a bit short"). */
const seriesWorse = (a: string, b: string) => /already done|no name/.test(a) && !/already done|no name/.test(b);

/** The title of a web page (for a link pasted or shared as the subject). Empty if it can't be read. */
async function pageTitle(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendVideos/1.0)' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    const html = (await res.text()).slice(0, 300_000);
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    const t = og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    return t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').replace(/\s+[|–-]\s+[^|–-]{2,40}$/, '').trim().slice(0, 200);
  } catch {
    return '';
  }
}

/** Next number in your series ("Daily Tech Drop #14"). */
async function nextEpisode(): Promise<number> {
  // Only a peek: the number is kept (written) when the video is saved, so a failed or rejected script doesn't use it up.
  const n = (await readJson<number>('episode', 0)) + 1;
  return n;
}

/** "Top 5 this week" from this week's videos: no AI call, then built and emailed like any video. */
async function weeklyRecap(saved: AppSettings, manual: boolean): Promise<void> {
  const r = recapScript(await listVideos());
  if (!r) {
    const msg = 'Weekly recap: fewer than 3 videos this week, nothing to recap.';
    if (manual) throw new Error(msg);
    return log(msg);
  }
  log(`Weekly recap: ${r.title}`);
  const id = `${day()}-recap-${randomBytes(2).toString('hex')}`;
  const s = { ...saved, effects: { ...saved.effects, loop: false } };
  const base: VideoRecord = {
    ...r, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'failed',
    durationSec: 0, sizeBytes: 0, voice: s.voice, footage: [], model: 'none (made from this week\'s videos)', extras: ['fast'],
    episode: s.seriesName.trim() ? await nextEpisode() : undefined,
  };
  await build(base, s);
}

/** A headline for the card: Google News titles end in " - Site", which is shown separately. */
function headlineOf(h: Candidate['headlines'][number] | undefined): DraftLine['headline'] {
  if (!h?.title || h.site === 'Wikipedia' || h.site === 'YouTube') return undefined;
  const title = h.site ? (h.title.endsWith(` - ${h.site}`) ? h.title.slice(0, -(h.site.length + 3)) : h.title) : h.title.replace(/\s+-\s+[^-]{2,40}$/, '');
  return { title: title.trim().slice(0, 200), site: h.site?.slice(0, 60) };
}

/** The accent colour of the video's look (charts and maps use it too). */
const accentOf = (s: AppSettings) => (s.effects.nicheLook ? findCategory(s.niche?.category)?.look ?? DEFAULT_LOOK : DEFAULT_LOOK).accent;

/** Effects and look from Settings (Videos tab → Video style). */
/** Voice acting: "hype" lines faster, "calm" lines slower; the rest as the tone says. */
const PAUSE = 0.75; // seconds of dramatic pause after a line marked "pause"
function paceOf(l: DraftLine, s: AppSettings): number {
  const base = s.tone === 'punchy' || s.tone === 'witty' ? 1.08 : 1;
  return l.delivery === 'hype' ? base + 0.07 : l.delivery === 'calm' ? base - 0.13 : base;
}

/** Debate: host B gets a clearly different voice (male <-> female). */
function otherVoice(v: AppSettings['voice']): AppSettings['voice'] {
  return /^(am|bm)_|^male$/.test(v) ? 'af_bella' : 'am_michael';
}

/** Niche skin: gaming -> XP bar, anime (or a video with characters) -> manga, sports -> scoreboard. */
function skinFor(category: string | undefined, subs: string[], lines: DraftLine[]): RenderOptions['skin'] {
  if (category === 'gaming') return 'game';
  if (category === 'sports') return 'sport';
  if ((category === 'movies' && subs.length === 1 && subs[0] === 'anime') || lines.some((l) => l.character?.trim())) return 'manga';
  return undefined;
}

function renderOptions(s: AppSettings, hook: string, v: Pick<VideoRecord, 'extras' | 'cover' | 'episode'> = {}): RenderOptions {
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
    series: s.seriesName.trim() && v.episode ? `${s.seriesName.trim()} #${v.episode}` : undefined,
  };
}

/** Voice, footage and the final MP4 for a script, then saved for review and emailed. */
async function build(base: VideoRecord, s: AppSettings) {
  resetVoiceUsed();
  // A script checked later gets the series number now, so numbers stay in order with no gaps.
  if (base.episode && s.seriesName.trim()) base = { ...base, episode: Math.max(base.episode, await nextEpisode()) };
  if (!footageReady()) log('No PIXABAY_API_KEY or PEXELS_API_KEY: scenes will use plain backgrounds.');
  const lines: DraftLine[] = base.draft?.lines ?? base.lines.map((text) => ({ text, footage: base.topic, keywords: [] }));
  const id = base.id;
  const dir = `out/${id}`;
  await mkdir(dir, { recursive: true });
  try {
    const used = new Set<string>();
    const scenes: Scene[] = [];
    const credits: Credit[] = [];
    const checks: string[] = [];
    // Slides: every line with a slide text is one slide (numbered for the dots).
    const slides = base.extras?.includes('slides') ? lines.filter((l) => l.desc?.trim()) : [];
    const mine = chooseMedia(lines, s.effects.myClips || lines.some((l) => l.media) ? await listMedia() : [], s.effects.myClips);
    for (const [i, l] of lines.entries()) {
      const wav = `${dir}/l${i}.wav`;
      // Voice acting: speed per line; in a debate, host B has the other voice.
      await speak(l.text, l.speaker === 'B' ? otherVoice(s.voice) : s.voice, wav, paceOf(l, s));
      let { kind, ...v } = await visualFor(l, i, dir, { mine: mine[i], real: s.effects.realMedia, characters: s.effects.characters, charts: s.effects.charts, headlines: s.effects.headlines, accent: accentOf(s), used, credits });
      if (mine[i] && kind === 'mine') log(`Scene ${i + 1}: your clip "${mine[i]!.name}"`);
      else if (mine[i]) checks.push(`Scene ${i + 1}: your clip "${mine[i]!.name}" could not be loaded, so something else was shown.`);
      else if (v.credit) log(`Scene ${i + 1}: ${v.credit}`);
      // Quality check: fix what can be fixed, and note the rest for you.
      const n = i + 1;
      const slide = slides.includes(l) ? { desc: l.desc!.trim(), index: slides.indexOf(l), total: slides.length } : undefined;
      if (slide && !v.image) {
        // A slide without its picture: the name on a coloured card (never random footage).
        if (kind !== 'mine') checks.push(`Scene ${n}: no picture of "${(l.character?.split('|')[0] || l.real || l.object || l.label || '').trim()}" was found, so the slide shows the name on a coloured card.`);
        v = kind === 'mine' ? v : { clip: null };
      } else if (kind === 'none') {
        const words = l.bigText || (l.keywords.length ? l.keywords.join(' ') : l.text.split(/\s+/).slice(0, 3).join(' '));
        const out = `${dir}/fix${i}.mp4`;
        if (await kineticClip(words, out, accentOf(s)).catch(() => false)) (v = { clip: out }), checks.push(`Scene ${n}: no picture or clip was found, so big animated words were used instead (fixed).`);
        else checks.push(`Scene ${n}: no picture was found (plain background).`);
      } else if (kind === 'stock' || kind === 'text') {
        const asked = (s.effects.realMedia && l.real) || (s.effects.characters && l.character?.split('|')[0]) || l.object;
        if (asked) checks.push(`Scene ${n}: no free picture of "${asked.trim()}" was found, so ${kind === 'text' ? 'animated words' : 'stock footage'} were used.`);
        if (l.versus) checks.push(`Scene ${n}: pictures for "${l.versus.a}" or "${l.versus.b}" were not found, so the This or That split screen was skipped.`);
      }
      // A slide always has a name: the title, else the character, person or thing it shows.
      const label = l.label || (slide ? (l.character?.split('|')[0] || l.real || l.object || '').trim().slice(0, 40) || undefined : undefined);
      scenes.push({ slide, text: l.text, wav, keywords: l.keywords, label, quiz: l.quiz, verdict: l.verdict, speaker: l.speaker, pause: l.pause ? PAUSE : 0, sticker: s.effects.stickers === false ? undefined : l.sticker, ...v });
    }
    // Stickers are Twemoji pictures (CC-BY 4.0): credited with the other footage.
    if (scenes.some((x) => x.sticker)) credits.push({ by: 'Twemoji (CC-BY 4.0)', url: 'https://github.com/jdecked/twemoji', site: 'Twemoji' });
    const mp4 = `${dir}/video.mp4`;
    const jpg = `${dir}/thumb.jpg`;
    const ro = renderOptions(s, base.hook, base);
    if (lines[0]?.comment) ro.hook = undefined; // a reply opens on the comment bubble: no hook title over it
    ro.skin = s.effects.skin === false ? undefined : skinFor(s.niche?.category, s.niche?.subs ?? [], lines);
    if (ro.skin) log(`Niche skin: ${ro.skin}`);
    const dur = await renderVideo(scenes, dir, mp4, jpg, { ...ro, notes: checks });
    const bytes = await readFile(mp4);
    log(`Rendered ${dur.toFixed(1)} s, ${(bytes.length / 1e6).toFixed(1)} MB`);
    const long = base.extras?.includes('long') || s.maxSeconds > 60 || !!base.series;
    if (base.series && dur < base.series.minSeconds) checks.push(`Only ${Math.round(dur)} seconds: your daily series asks for at least ${base.series.minSeconds}. Try "Check the script first" and add a fact or two.`);
    else if (long && dur < 61) checks.push(`Only ${Math.round(dur)} seconds: TikTok's Creator Rewards need over 1 minute. Try "Check the script first" and add a line or two.`);
    if (!long && !base.recap && !base.series && dur > s.maxSeconds + 25) checks.push(`${Math.round(dur)} seconds: longer than your ${s.maxSeconds}s setting.`);
    if (checks.length) log('Quality check:', checks.join(' | '));

    const files = store('tt-files');
    await files.set(`${id}.mp4`, new Uint8Array(bytes).buffer);
    await files.set(`${id}.jpg`, new Uint8Array(await readFile(jpg)).buffer);
    const rec: VideoRecord = {
      ...base, lines: lines.map((l) => l.text), voice: voiceUsed() || base.voice, status: 'pending', error: undefined,
      durationSec: Math.round(dur), sizeBytes: bytes.length, footage: [...new Map(credits.map((c) => [c.url, c])).values()],
      checks: checks.length ? checks : undefined,
    };
    await saveVideo(rec);
    log(`Saved ${id}`);
    if (rec.episode) await writeJson('episode', Math.max(rec.episode, await readJson<number>('episode', 0)));
    if (process.env.SAVE_COPY_DIR) {
      // GitHub attaches this copy to the run, so the video can be downloaded even without the website.
      await mkdir(process.env.SAVE_COPY_DIR, { recursive: true });
      await copyFile(mp4, `${process.env.SAVE_COPY_DIR}/${id}.mp4`);
    }
    await notify(rec, s.notifyEmail);
  } catch (e) {
    // A checked script goes back to "check it" so Build can be tapped again; otherwise the video failed.
    await saveVideo({ ...base, status: base.draft && base.status === 'building' ? 'script' : 'failed', error: e instanceof Error ? e.message : String(e) });
    await fcmAll({ title: `Video failed: ${base.title}`, body: (e instanceof Error ? e.message : String(e)).slice(0, 200), tag: base.id, url: `/review/${base.id}?sig=${sign(base.id)}` }).catch(() => 0);
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
  // Android app: a phone notification too; tapping it opens the video (or script) in the app.
  const phones = await fcmAll({
    title: rec.status === 'script' ? `Script ready to check: ${rec.title}` : `New video to review: ${rec.title}`,
    body: rec.status === 'script' ? 'Read it, edit it if you like, then tap Build video.' : `${rec.durationSec} seconds. Watch it, then approve or reject.`,
    tag: rec.id,
    url: `/review/${rec.id}?sig=${sign(rec.id)}`,
  }).catch((e) => (log('Phone notification failed:', e instanceof Error ? e.message : e), 0));
  if (phones) log(`Phone notification sent (${phones})`);
  else log(`No phone notification: ${!(await firebaseKey().catch(() => null)) ? 'no Firebase key uploaded (Settings → Phone notifications)' : !(await getFcmTokens().catch(() => [])).length ? 'no phone has notifications turned on in the app' : 'Firebase did not deliver it'}.`);
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
          ...(rec.checks?.length ? ['', 'Quality check:', ...rec.checks.map((c) => `  - ${c}`)] : []),
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

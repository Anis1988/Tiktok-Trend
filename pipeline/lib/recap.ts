import type { DraftLine, VideoRecord } from '../../src/lib/types';
import { score } from '../../netlify/lib/stats';

/** Weekly recap: every Sunday (New York time), once a week. */
export function recapDue(videos: VideoRecord[], now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
  if (weekday !== 'Sun') return false;
  const since = new Date(now.getTime() - 6 * 86400_000).toISOString();
  return !videos.some((v) => v.recap && v.createdAt >= since && v.status !== 'failed');
}

const VISUAL: (keyof DraftLine)[] = ['real', 'character', 'object', 'map', 'chart', 'headline', 'timeline', 'versus'];

/** The best line of a video to show in the recap: the first one (after the hook) with its own picture. */
function pictureLine(v: VideoRecord): Partial<DraftLine> {
  const lines = v.draft?.lines ?? [];
  const l = lines.slice(1).find((x) => VISUAL.some((k) => x[k])) ?? lines[1] ?? lines[0];
  if (!l) return { footage: v.topic.slice(0, 60) };
  const { text: _t, keywords: _k, label: _l, quiz: _q, verdict: _v, comment: _c, bigText: _b, speaker: _s, delivery: _d, pause: _p, ...visual } = l;
  return visual;
}

const NUM = ['', 'one', 'two', 'three', 'four', 'five'];

/**
 * "Top 5 this week" made from this week's videos, no AI call: the best ones (by your results, else the newest),
 * counted down from 5 to 1, each with its own hook and picture. Null if fewer than 3 videos this week.
 */
export function recapScript(videos: VideoRecord[], now = new Date()): Omit<VideoRecord, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'durationSec' | 'sizeBytes' | 'voice' | 'footage' | 'model'> | null {
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const week = videos.filter((v) => v.createdAt >= since && !v.recap && v.draft && ['pending', 'approved', 'publishing', 'sent', 'posted'].includes(v.status));
  if (week.length < 3) return null;
  const top = [...week].sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const n = top.length;
  const ranked = [...top].reverse(); // count down: #n first, #1 last
  const lines: DraftLine[] = [
    { text: `The ${NUM[n]} biggest stories this week, in under a minute.`, footage: 'news studio screens', keywords: ['biggest'], bigText: `TOP ${n} THIS WEEK` },
    ...ranked.map((v, i): DraftLine => {
      const rank = n - i;
      const hook = (v.lines[0] ?? v.hook).replace(/\s+/g, ' ').trim();
      return { ...pictureLine(v), text: `Number ${NUM[rank]}: ${hook}`, footage: pictureLine(v).footage ?? v.topic.slice(0, 60), keywords: [], label: `#${rank} ${v.title}`.slice(0, 28) };
    }),
    { text: 'Which one did you miss? Tell me in the comments.', footage: 'people phone scrolling', keywords: ['miss'] },
  ];
  const tags = [...new Set(['weeklyrecap', ...top.flatMap((v) => v.hashtags)])].slice(0, 5);
  return {
    topic: 'Weekly recap', title: `This week's top ${n}`, hook: lines[0].text, lines: lines.map((l) => l.text),
    caption: `The week in ${n} stories. Which one did you miss?`, hashtags: tags,
    sources: top.flatMap((v) => v.sources.slice(0, 1)), draft: { lines }, recap: true,
    firstComment: 'Which story should get its own Part 2? 👇',
  };
}

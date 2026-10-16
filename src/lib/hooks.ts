/**
 * 🅰️🅱️ A/B hooks: the AI writes 2 opening lines in 2 different styles (in the same call as the script, no extra cost),
 * and the app picks the style that did better on your past videos of the same kind (same niche, or the daily series).
 * Shared by the video maker (pipeline) and the app (labels). Pure code: no server or browser APIs.
 */
import type { VideoRecord } from './types';

export type HookStyle = 'question' | 'claim' | 'number' | 'secret';
export const HOOK_STYLES: HookStyle[] = ['question', 'claim', 'number', 'secret'];

/** Plain names (shown in the app) and what the AI is asked to write. */
export const HOOK_INFO: Record<HookStyle, { label: string; plural: string; ask: string }> = {
  question: { label: 'Question', plural: 'question hooks', ask: 'a playful question the viewer wants answered (e.g. "Who is really the strongest in AOT?")' },
  claim: { label: 'Bold claim', plural: 'bold-claim hooks', ask: 'a bold, confident claim the facts support (e.g. "This is the worst launch NASA ever had.")' },
  number: { label: 'Number', plural: 'number hooks', ask: 'a surprising number or fact up front (e.g. "6 things you didn\'t know about Taylor Swift", "300 million people watched this.")' },
  secret: { label: 'Curiosity gap', plural: 'curiosity-gap hooks', ask: 'a curiosity gap that teases what most people miss (e.g. "Nobody is talking about the real reason this happened.")' },
};

export interface HookOption { style: HookStyle; text: string; keywords: string[] }
/** Saved on the video: both hooks, which one is used (index), and why. */
export interface HookAB { options: HookOption[]; chosen: number; why: string; group: string; swapped?: boolean }

/** One number to compare videos: the most views on any platform (likes count a bit when there are no views). */
export function videoScore(v: VideoRecord): number | null {
  const s = v.stats;
  if (!s) return null;
  const views = Math.max(s.tiktok?.views ?? 0, s.youtube?.views ?? 0);
  const likes = Math.max(s.tiktok?.likes ?? 0, s.youtube?.likes ?? 0, s.instagram?.likes ?? 0);
  if (!views && !likes) return null;
  return views || likes * 25;
}

/** Which kind of video this is, to compare like with like: the daily series, the niche category, or "general". */
export const hookGroup = (v: { series?: unknown; pick?: string; niche?: string | null }) =>
  v.series ? 'series' : (v.pick && v.pick !== 'any' ? v.pick.split(':')[0] : v.niche) || 'general';

/** The hook style a video used: the one the app picked, else a guess from older videos' hook words. */
export function styleOf(v: VideoRecord): HookStyle | null {
  if (v.hookAB) return v.hookAB.options[v.hookAB.chosen]?.style ?? null;
  const h = (v.hook || v.lines[0] || '').trim();
  if (!h) return null;
  if (/\?\s*$/.test(h)) return 'question';
  if (/nobody|no one|secret|didn.?t know|real reason|truth|hidden/i.test(h)) return 'secret';
  if (/\d/.test(h)) return 'number';
  return 'claim';
}

export interface StyleStat { style: HookStyle; n: number; avg: number }
const MIN = 2; // videos with numbers needed per style before its average counts
export const EXPLORE = 0.2; // 1 video in 5 tries the other style anyway

const short = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}k` : String(Math.round(x)));

/** Average views per hook style over your recent videos with numbers (same group first, all videos if too few). */
export function styleStats(videos: VideoRecord[], group: string, now = Date.now()): { stats: StyleStat[]; scope: 'group' | 'all' } {
  const since = new Date(now - 120 * 86400_000).toISOString();
  const rows = videos.filter((v) => v.createdAt >= since && v.status !== 'rejected' && !v.recap)
    .map((v) => ({ v, s: videoScore(v), st: styleOf(v) }))
    .filter((x): x is { v: VideoRecord; s: number; st: HookStyle } => x.s !== null && !!x.st);
  const calc = (list: typeof rows): StyleStat[] => HOOK_STYLES.map((style) => {
    const xs = list.filter((x) => x.st === style).map((x) => x.s);
    return { style, n: xs.length, avg: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
  });
  const mine = calc(rows.filter((x) => hookGroup(x.v) === group));
  if (mine.filter((x) => x.n >= MIN).length >= 2) return { stats: mine, scope: 'group' };
  return { stats: calc(rows), scope: 'all' };
}

export interface HookPlan { styles: [HookStyle, HookStyle]; pick: 0 | 1; why: string; group: string }

/**
 * Before the script: which 2 styles the AI writes, and which of them is used.
 * - Enough results (2+ videos with numbers for 2 styles): the best style is hook A and is used, except 1 time in 5 the
 *   other one gets a turn (so a style that had bad luck early can still win later).
 * - Not enough yet: the style you've used least is tried (taking turns), against your best or most-used one.
 */
export function planHooks(videos: VideoRecord[], group: string, rand: () => number = Math.random, now = Date.now()): HookPlan {
  const { stats, scope } = styleStats(videos, group, now);
  const where = scope === 'group' && group !== 'general' ? (group === 'series' ? ' (daily series)' : ` (${group})`) : '';
  const known = stats.filter((x) => x.n >= MIN).sort((a, b) => b.avg - a.avg);
  // How often each style was used lately (any numbers or not), so styles take turns until there is data.
  const since = new Date(now - 120 * 86400_000).toISOString();
  const used = (st: HookStyle) => videos.filter((v) => v.createdAt >= since && !v.recap && styleOf(v) === st).length;
  const leastUsed = (skip: HookStyle | null) => HOOK_STYLES.filter((s) => s !== skip).map((s) => ({ s, u: used(s), r: rand() })).sort((a, b) => a.u - b.u || a.r - b.r)[0].s;
  if (known.length >= 2) {
    const best = known[0];
    // The challenger: a style with little data first (to learn), else the runner-up.
    const thin = stats.filter((x) => x.n < MIN && x.style !== best.style);
    const other = thin.length && rand() < 0.5 ? thin[Math.floor(rand() * thin.length)] : known[1];
    const explore = rand() < EXPLORE;
    const vs = other.n ? `${short(best.avg)} views vs ${short(other.avg)} for ${HOOK_INFO[other.style].plural}` : `${short(best.avg)} views; ${HOOK_INFO[other.style].plural} have no results yet`;
    return explore
      ? { styles: [best.style, other.style], pick: 1, group, why: `Trying ${HOOK_INFO[other.style].plural} this time (1 video in 5 tests the other style), although your ${HOOK_INFO[best.style].plural}${where} average ${vs}.` }
      : { styles: [best.style, other.style], pick: 0, group, why: `Your ${HOOK_INFO[best.style].plural}${where} average ${vs} (${best.n} vs ${other.n} videos).` };
  }
  const a = known[0]?.style ?? leastUsed(null);
  const b = leastUsed(a);
  const tryNew = !known.length || rand() < 0.5;
  const pick: 0 | 1 = known.length ? (tryNew ? 1 : 0) : 0;
  const chosen = pick ? b : a;
  return {
    styles: [a, b], pick, group,
    why: known.length
      ? `Not enough results yet to compare: ${pick ? `trying ${HOOK_INFO[chosen].plural} (used least so far)` : `using ${HOOK_INFO[chosen].plural} (${short(known[0].avg)} views on average so far)`}.`
      : `Not enough results yet (each style needs ${MIN} videos with views): styles take turns, so this time ${HOOK_INFO[chosen].plural}.`,
  };
}

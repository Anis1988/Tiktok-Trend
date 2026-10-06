import { guard, json } from '../lib/guard';
import { getSettings, readJson, writeJson } from '../lib/store';
import { findCandidates, nicheCandidates, type Candidate } from '../lib/trends';
import { findCategory } from '../../src/lib/niches';

export const config = { path: '/api/ideas' };

export interface Idea { title: string; url: string; site?: string; tag: string }

const FRESH_MS = 30 * 60_000; // same list for 30 minutes: fewer outside requests

/**
 * GET /api/ideas?pick=gaming or ?pick=gaming:nintendo -> fresh headlines to make a video about (free, no AI).
 * Without pick: your channel's news, or today's top Google Trends if no channel is set.
 */
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'ideas', 10);
  if (blocked) return blocked;
  const raw = new URL(req.url).searchParams.get('pick') ?? '';
  const s = await getSettings();
  const [catId, subId] = raw.split(':');
  const cat = findCategory(catId);
  const niche = cat
    ? { category: cat.id, subs: subId && cat.subs.some((x) => x.id === subId) ? [subId] : cat.subs.map((x) => x.id), focus: s.niche?.category === cat.id ? s.niche.focus : [], mix: 'niche' as const }
    : s.niche;
  const key = `ideas:${niche ? `${niche.category}:${niche.subs.join(',')}` : 'trends'}:${s.country}`;
  const cached = await readJson<{ at: number; ideas: Idea[] } | null>(key, null);
  if (cached && Date.now() - cached.at < FRESH_MS) return json({ ideas: cached.ideas, cached: true });

  let cands: Candidate[] = [];
  try {
    cands = niche ? (await nicheCandidates(niche, s.country, [], 0)).candidates : (await findCandidates([], s.country, [])).candidates;
  } catch (e) {
    return json({ error: `Could not load ideas: ${e instanceof Error ? e.message : e}` }, 502);
  }
  const ideas: Idea[] = cands
    .filter((c) => c.headlines[0]?.title)
    .slice(0, 15)
    .map((c) => {
      const h = c.headlines[0];
      const tag = c.topic.includes(': ') ? c.topic.split(': ')[0] : c.topic; // "Nintendo", "Gaming" or the trend name
      return { title: h.title.slice(0, 200), url: h.url, site: h.site, tag: tag.slice(0, 40) };
    });
  await writeJson(key, { at: Date.now(), ideas }).catch(() => undefined);
  return json({ ideas });
};

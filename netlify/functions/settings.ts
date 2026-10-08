import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { getSettings, writeJson } from '../lib/store';

export const config = { path: '/api/settings' };

const Patch = z.object({
  enabled: z.boolean(),
  topics: z.array(z.string().trim().min(1).max(40)).max(8),
  niche: z.object({
    category: z.string().max(30),
    subs: z.array(z.string().max(30)).min(1).max(3),
    focus: z.array(z.string().trim().min(1).max(40)).max(8),
    mix: z.enum(['niche', 'mix']),
  }).nullable(),
  country: z.enum(['US', 'GB', 'CA', 'AU', 'IE', 'NZ']),
  voice: z.enum(['af_heart', 'af_bella', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_george', 'female', 'male']),
  tone: z.enum(['witty', 'punchy', 'explainer', 'anchor']),
  music: z.boolean(),
  effects: z.object({ hookCard: z.boolean(), keywords: z.boolean(), sfx: z.boolean(), progress: z.boolean(), nicheLook: z.boolean(), endCard: z.boolean(), realMedia: z.boolean(), myClips: z.boolean(), characters: z.boolean(), charts: z.boolean().optional(), headlines: z.boolean().optional(), loop: z.boolean().optional() }),
  captionStyle: z.object({ color: z.enum(['yellow', 'cyan', 'green', 'pink', 'white']), size: z.enum(['medium', 'big']) }),
  endCardName: z.string().trim().max(30),
  reviewScript: z.boolean(),
  cleanup: z.object({ enabled: z.boolean(), days: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]) }),
  perDay: z.number().int().min(1).max(3),
  maxSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(75)]),
  seriesName: z.string().trim().max(30).optional(),
  weeklyRecap: z.boolean().optional(),
  aiDailyLimit: z.number().int().min(1).max(30),
  notifyEmail: z.union([z.literal(''), z.string().email().max(200)]),
}).partial();

// GET /api/settings, POST /api/settings {partial settings}
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'settings', 30);
  if (blocked) return blocked;
  if (req.method === 'GET') return json(await getSettings());
  if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
  let patch: z.infer<typeof Patch>;
  try {
    patch = Patch.parse(await req.json());
  } catch (e) {
    return json({ error: `Invalid settings: ${e instanceof Error ? e.message.slice(0, 200) : e}` }, 400);
  }
  const next = { ...(await getSettings()), ...patch };
  await writeJson('settings', next);
  return json(next);
};

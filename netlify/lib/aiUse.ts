import { readJson, writeJson } from './store';

/**
 * Paid AI use per day (for the "My apps" page): calls, tokens and dollars, one entry per day, last 90 days.
 * Started on 2026-10-16: before that only today's count ("ai") was kept, so week/month count from then on.
 * Dollars: exact from the tokens Anthropic reports, at the list prices below (USD per million tokens, Anthropic API,
 * October 2026). A call without token numbers (it failed, or an older model) counts EST_PER_CALL and is marked "est".
 */
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
};
export const EST_PER_CALL = 0.1; // rough cost of one script call without token numbers (an estimate)

export interface AiDay { calls: number; usd: number; est: number; byModel: Record<string, { calls: number; usd: number }> }
export type AiDays = Record<string, AiDay>;

const priceOf = (model: string) => PRICES[model] ?? PRICES[Object.keys(PRICES).find((k) => model.startsWith(k)) ?? ''] ?? null;

/** Dollars for one call; null when the model's price isn't known. */
export function callUsd(u: { model: string; input: number; output: number; cacheRead: number; cacheWrite: number }): number | null {
  const p = priceOf(u.model);
  if (!p) return null;
  return ((u.input + u.cacheWrite * 1.25) * p.in + u.output * p.out + u.cacheRead * p.cacheRead) / 1e6;
}

/** Counts one paid script call (with its tokens when known). Never throws: the count is a bonus. */
export async function noteAiCall(model: string, usage: { model: string; input: number; output: number; cacheRead: number; cacheWrite: number } | null): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const all = await readJson<AiDays>('aiDays', {});
    const d = all[day] ?? { calls: 0, usd: 0, est: 0, byModel: {} };
    const exact = usage ? callUsd(usage) : null;
    const usd = exact ?? EST_PER_CALL;
    const m = usage?.model || model;
    d.calls++;
    d.usd = Math.round((d.usd + usd) * 10000) / 10000;
    if (exact === null) d.est++;
    d.byModel[m] = { calls: (d.byModel[m]?.calls ?? 0) + 1, usd: Math.round(((d.byModel[m]?.usd ?? 0) + usd) * 10000) / 10000 };
    all[day] = d;
    const keep = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    for (const k of Object.keys(all)) if (k < keep) delete all[k];
    await writeJson('aiDays', all);
  } catch (e) {
    console.log('AI use not saved:', e instanceof Error ? e.message : e);
  }
}

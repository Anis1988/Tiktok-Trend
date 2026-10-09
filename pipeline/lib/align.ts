import { fileURLToPath } from 'node:url';
import { run } from './sh';

/**
 * Captions in time with the real voice: speech recognition (faster-whisper, free, in the GitHub Action) finds when
 * each word is said; the script's words are matched to what was heard. Words it missed get times in between.
 * If anything fails, the captions fall back to timing by word length (as before).
 */
export interface Timing { from: number; to: number }
type Heard = [number, number, string];

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const weight = (w: string) => norm(w).length + 2;

/** Matches the script's words to the heard words (longest common sequence) and fills the gaps. Null if too few match. */
export function matchTimes(text: string, heard: Heard[], dur: number): Timing[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const a = words.map(norm);
  const b = heard.map((h) => norm(h[2]));
  const n = a.length;
  const m = b.length;
  if (!n || !m) return null;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const at: (Timing | null)[] = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] && a[i] === b[j]) (at[i] = { from: heard[j][0], to: heard[j][1] }), i++, j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = at.filter(Boolean).length;
  if (matched < Math.max(2, n * 0.5)) return null;
  // Gaps: share the time between the known words by word length.
  for (let i = 0; i < n;) {
    if (at[i]) { i++; continue; }
    let k = i;
    while (k < n && !at[k]) k++;
    const start = i > 0 ? at[i - 1]!.to : 0;
    const end = k < n ? at[k]!.from : dur;
    const total = words.slice(i, k).reduce((t, w) => t + weight(w), 0);
    let t = start;
    for (let x = i; x < k; x++) {
      const d = (Math.max(0, end - start) * weight(words[x])) / total;
      at[x] = { from: t, to: t + d };
      t += d;
    }
    i = k;
  }
  // Clean up: in order, inside the line.
  let prev = 0;
  return at.map((x) => {
    const from = Math.min(Math.max(x!.from, prev), dur);
    const to = Math.min(Math.max(x!.to, from + 0.05), dur);
    prev = from;
    return { from, to };
  });
}

/** Word timings for each line, or null for a line (or all lines) where it didn't work. */
export async function alignLines(items: { wav: string; text: string; dur: number }[]): Promise<(Timing[] | null)[]> {
  if (process.env.ALIGN === '0' || process.env.TTS_FAKE === '1') return items.map(() => null);
  try {
    const script = fileURLToPath(new URL('../align.py', import.meta.url));
    const out = await run('python3', [script], JSON.stringify(items.map(({ wav, text }) => ({ wav, text }))));
    // Only the last line of output is the result (anything printed before it is ignored).
    const heard = JSON.parse(out.trim().split('\n').pop() ?? '[]') as (Heard[] | { error: string } | null)[];
    const res = items.map((it, i) => (Array.isArray(heard[i]) ? matchTimes(it.text, heard[i] as Heard[], it.dur) : null));
    // Say why lines were not timed, so a problem is visible in the GitHub log.
    const errors = heard.filter((h): h is { error: string } => !!h && !Array.isArray(h) && 'error' in h);
    const empty = heard.filter((h) => Array.isArray(h) && !h.length).length;
    const unmatched = items.filter((_, i) => Array.isArray(heard[i]) && (heard[i] as Heard[]).length && !res[i]);
    if (errors.length || empty || unmatched.length) {
      console.log(`Word timing: ${errors.length} failed, ${empty} heard nothing, ${unmatched.length} didn't match the script.${errors[0] ? ` First error: ${errors[0].error}` : ''}`);
      const k = items.findIndex((_, i) => Array.isArray(heard[i]) && (heard[i] as Heard[]).length && !res[i]);
      if (k >= 0) console.log(`  e.g. script "${items[k].text.slice(0, 80)}" / heard "${(heard[k] as Heard[]).map((h) => h[2]).join(' ').slice(0, 80)}"`);
    }
    return res;
  } catch (e) {
    console.log('Word timing skipped (captions timed by word length):', e instanceof Error ? e.message.slice(0, 200) : e);
    return items.map(() => null);
  }
}

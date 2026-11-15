import { assertNotPaused } from './pause';

/** Starts a GitHub Actions workflow (make a video / send to TikTok, YouTube, Facebook or Instagram). Needs GH_DISPATCH_TOKEN with Actions: write. */
export const dispatchReady = () => !!process.env.GH_DISPATCH_TOKEN;
const repo = () => process.env.GH_REPO || 'Anis1988/Tiktok-Trend';

export async function dispatch(workflow: 'generate.yml' | 'publish.yml', inputs: Record<string, string> = {}): Promise<void> {
  if (!dispatchReady()) throw new Error('Set GH_DISPATCH_TOKEN in Netlify so the app can start GitHub jobs.');
  await assertNotPaused('Starting a GitHub job'); // ⏸ nothing is made or sent while paused
  const res = await fetch(`https://api.github.com/repos/${repo()}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trend-videos' },
    body: JSON.stringify({ ref: process.env.GH_BRANCH || 'main', inputs }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 204) throw new Error(`GitHub HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const gh = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.github.com/repos/${repo()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trend-videos' },
    signal: AbortSignal.timeout(8_000),
  });

/** ⏸ Pause: stops the video and send jobs that are running or waiting right now. Best-effort; returns how many were stopped. */
export async function cancelRuns(): Promise<number> {
  if (!dispatchReady()) return 0;
  let n = 0;
  for (const status of ['in_progress', 'queued', 'waiting', 'pending']) {
    const res = await gh(`/actions/runs?status=${status}&per_page=50`).catch(() => null);
    if (!res?.ok) continue;
    const runs = ((await res.json()) as { workflow_runs?: { id: number; path?: string }[] }).workflow_runs ?? [];
    for (const r of runs) {
      if (r.path && !/generate\.yml|publish\.yml/.test(r.path)) continue;
      const c = await gh(`/actions/runs/${r.id}/cancel`, { method: 'POST' }).catch(() => null);
      if (c && (c.status === 202 || c.ok)) n++;
    }
  }
  return n;
}

/** Starts a GitHub Actions workflow (make a video / send to TikTok). Needs GH_DISPATCH_TOKEN with Actions: write. */
export const dispatchReady = () => !!process.env.GH_DISPATCH_TOKEN;
const repo = () => process.env.GH_REPO || 'Anis1988/Tiktok-Trend';

export async function dispatch(workflow: 'generate.yml' | 'publish.yml', inputs: Record<string, string> = {}): Promise<void> {
  if (!dispatchReady()) throw new Error('Set GH_DISPATCH_TOKEN in Netlify so the app can start GitHub jobs.');
  const res = await fetch(`https://api.github.com/repos/${repo()}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trend-videos' },
    body: JSON.stringify({ ref: process.env.GH_BRANCH || 'main', inputs }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 204) throw new Error(`GitHub HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

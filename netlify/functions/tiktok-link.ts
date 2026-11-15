import { linkTikTok } from '../lib/tiktokLink';
import { isPaused } from '../lib/pause';
import { cleanUp } from '../lib/cleanup';
import { getSettings } from '../lib/store';

// 🔗 Every 2 hours: the auto clean-up, then find the TikTok posts of videos you sent to your drafts (link + views). Read-only, free.
export const config = { schedule: '17 */2 * * *' };

export default async (): Promise<Response> => {
  try {
    if (await isPaused()) return (console.log('tiktok-link: paused, nothing done'), new Response(null, { status: 204 }));
    // 🧹 Auto clean-up here too, so old videos go within 2 hours even on days no video job runs.
    await cleanUp(await getSettings(), console.log).catch((e) => console.error('clean-up failed', e instanceof Error ? e.message : e));
    const r = await linkTikTok();
    console.log('tiktok-link', JSON.stringify(r));
  } catch (e) {
    console.error('tiktok-link failed', e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

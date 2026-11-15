import { linkTikTok } from '../lib/tiktokLink';
import { isPaused } from '../lib/pause';

// 🔗 Every 2 hours: find the TikTok posts of videos you sent to your drafts (link + views). Read-only, free.
export const config = { schedule: '17 */2 * * *' };

export default async (): Promise<Response> => {
  try {
    if (await isPaused()) return (console.log('tiktok-link: paused, nothing done'), new Response(null, { status: 204 }));
    const r = await linkTikTok();
    console.log('tiktok-link', JSON.stringify(r));
  } catch (e) {
    console.error('tiktok-link failed', e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

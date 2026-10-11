import { linkTikTok } from '../lib/tiktokLink';

// 🔗 Every 2 hours: find the TikTok posts of videos you sent to your drafts (link + views). Read-only, free.
export const config = { schedule: '17 */2 * * *' };

export default async (): Promise<Response> => {
  try {
    const r = await linkTikTok();
    console.log('tiktok-link', JSON.stringify(r));
  } catch (e) {
    console.error('tiktok-link failed', e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};

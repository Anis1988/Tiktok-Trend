/**
 * Sends an approved video to one platform. Runs in GitHub Actions (publish.yml), started by the Approve button (TikTok drafts)
 * or by a platform's Send button (YouTube as Private, Facebook as a draft, Instagram posted after you confirmed).
 */
import { getVideo } from '../netlify/lib/store';
import type { PlatformId } from '../src/lib/types';
import { sendOther, sendTikTok } from './lib/send';

async function main() {
  const id = process.env.VIDEO_ID ?? '';
  const v = await getVideo(id);
  if (!v) throw new Error(`Video ${id} not found.`);
  const platform = process.env.PLATFORM || 'tiktok';
  if (platform !== 'tiktok') return sendOther(v, platform as PlatformId);
  return sendTikTok(v, 'drafts');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

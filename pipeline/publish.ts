/** Sends an approved video to your TikTok drafts. Runs in GitHub Actions (publish.yml), started by the Approve button. */
import { getVideo, patchVideo, store } from '../netlify/lib/store';
import { publishStatus, sendToDrafts } from '../netlify/lib/tiktok';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const id = process.env.VIDEO_ID ?? '';
  const v = await getVideo(id);
  if (!v) throw new Error(`Video ${id} not found.`);
  try {
    const data = await store('tt-files').get(`${id}.mp4`, { type: 'arrayBuffer' });
    if (!data) throw new Error('The video file is missing.');
    const publishId = await sendToDrafts(Buffer.from(data));
    await patchVideo(id, { status: 'publishing', tiktok: { publishId, status: 'PROCESSING_UPLOAD' } });
    for (let i = 0; i < 20; i++) {
      await sleep(6000);
      const st = await publishStatus(publishId);
      console.log('TikTok status:', st.status);
      if (st.status === 'FAILED') throw new Error(`TikTok rejected the upload: ${st.fail_reason ?? 'unknown reason'}`);
      if (st.status === 'SEND_TO_USER_INBOX' || st.status === 'PUBLISH_COMPLETE') {
        await patchVideo(id, { status: 'sent', error: undefined, tiktok: { publishId, status: st.status, sentAt: new Date().toISOString() } });
        return;
      }
    }
    await patchVideo(id, { status: 'sent', tiktok: { publishId, status: 'PROCESSING', sentAt: new Date().toISOString() } });
  } catch (e) {
    await patchVideo(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

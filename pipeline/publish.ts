/**
 * Sends an approved video to one platform. Runs in GitHub Actions (publish.yml), started by the Approve button (TikTok drafts)
 * or by a platform's Send button (YouTube as Private, Facebook as a draft, Instagram posted after you confirmed).
 */
import { getVideo, patchPlatform, patchVideo, store } from '../netlify/lib/store';
import { publishStatus, sendToDrafts } from '../netlify/lib/tiktok';
import { uploadToYouTube, youtubeStatus } from '../netlify/lib/youtube';
import { postToInstagram, sendToFacebook } from '../netlify/lib/meta';
import type { PlatformId, VideoRecord } from '../src/lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const id = process.env.VIDEO_ID ?? '';
  const v = await getVideo(id);
  if (!v) throw new Error(`Video ${id} not found.`);
  const platform = process.env.PLATFORM || 'tiktok';
  if (platform !== 'tiktok') return sendOther(v, platform as PlatformId);
  // Already sent (e.g. Approve tapped twice): never send a second copy.
  if (v.status === 'sent' || v.tiktok?.sentAt) return console.log('Already sent to TikTok drafts.');
  let publishId = '';
  try {
    const data = await store('tt-files').get(`${id}.mp4`, { type: 'arrayBuffer' });
    if (!data) throw new Error('The video file is missing.');
    publishId = await sendToDrafts(Buffer.from(data));
    await patchVideo(id, { status: 'publishing', tiktok: { publishId, status: 'PROCESSING_UPLOAD' } });
    for (let i = 0; i < 20; i++) {
      await sleep(6000);
      // A failed status check is not a failed upload: keep checking.
      const st = await publishStatus(publishId).catch((e) => (console.log('TikTok status check failed:', e instanceof Error ? e.message : e), { status: 'UNKNOWN', fail_reason: undefined }));
      console.log('TikTok status:', st.status);
      if (st.status === 'FAILED') throw new Error(`TikTok rejected the upload: ${st.fail_reason ?? 'unknown reason'}`);
      if (st.status === 'SEND_TO_USER_INBOX' || st.status === 'PUBLISH_COMPLETE') {
        await patchVideo(id, { status: 'sent', error: undefined, tiktok: { publishId, status: st.status, sentAt: new Date().toISOString() } });
        return;
      }
    }
    await patchVideo(id, { status: 'sent', tiktok: { publishId, status: 'PROCESSING', sentAt: new Date().toISOString() } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // TikTok rejected it: failed (Retry sends again). The upload went through but saving the result failed: it is sent.
    if (publishId && !/rejected the upload/.test(error)) await patchVideo(id, { status: 'sent', error: undefined, tiktok: { publishId, status: 'PROCESSING', sentAt: new Date().toISOString() } }).catch(() => undefined);
    else await patchVideo(id, { status: 'failed', error });
    throw e;
  }
}

async function sendOther(v: VideoRecord, p: PlatformId) {
  if (!['youtube', 'facebook', 'instagram'].includes(p)) throw new Error(`Unknown platform ${p}.`);
  try {
    if (v.status === 'pending' || v.status === 'rejected' || v.status === 'script' || v.status === 'building') throw new Error('The video is not approved.');
    if (v.platforms?.[p]?.state === 'sent') return console.log(`Already sent to ${p}.`);
    const data = await store('tt-files').get(`${v.id}.mp4`, { type: 'arrayBuffer' });
    if (!data) throw new Error('The video file is missing.');
    const video = Buffer.from(data);
    const tags = v.hashtags.map((h) => `#${h}`).join(' ');
    const text = `${v.caption} ${tags}`.trim();
    let done: { id: string; url?: string };
    if (p === 'youtube') {
      const ytId = await uploadToYouTube(video, { title: v.title, description: `${text} #Shorts`, tags: v.hashtags });
      // Uploaded: from here on it counts as sent even if a status check fails (a resend would make a duplicate).
      await patchPlatform(v.id, p, { state: 'sent', at: new Date().toISOString(), id: ytId, url: `https://studio.youtube.com/video/${ytId}/edit` });
      for (let i = 0; i < 20; i++) {
        await sleep(6000);
        const st = await youtubeStatus(ytId).catch(() => ({ status: 'unknown', reason: undefined }));
        console.log('YouTube status:', st.status);
        if (st.status === 'failed' || st.status === 'rejected') throw new Error(`YouTube rejected the video: ${st.reason ?? st.status}`);
        if (st.status === 'processed') break;
      }
      done = { id: ytId, url: `https://studio.youtube.com/video/${ytId}/edit` };
    } else if (p === 'facebook') {
      done = await sendToFacebook(video, text);
    } else {
      done = await postToInstagram(video, text);
    }
    await patchPlatform(v.id, p, { state: 'sent', at: new Date().toISOString(), id: done.id, url: done.url });
    console.log(`Sent to ${p}:`, done.url ?? done.id);
  } catch (e) {
    await patchPlatform(v.id, p, { state: 'failed', at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

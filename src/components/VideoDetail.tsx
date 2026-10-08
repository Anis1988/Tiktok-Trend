import { useState } from 'react';
import { api, fileUrl, type Video } from '../lib/api';
import { StatusChip, toast, when } from './ui';
import { ScriptEditor } from './ScriptEditor';
import { EXTRA_LABEL, PLATFORM_INFO, PLATFORMS, VOICE_LABEL, type PlatformId } from '../lib/types';

/** "Kokoro af_heart" -> "Heart · warm female (US)". Older videos show the Piper voice name as saved. */
const voiceText = (v: string) => VOICE_LABEL[v.replace(/^Kokoro /, '') as keyof typeof VOICE_LABEL] ?? v;

/** Everything about one video, with the buttons that fit its status. Used in the app and on the email review page. */
export function VideoDetail({ v, onChange, onDeleted, tiktokConnected, sendTo = [], hintConnect = false, example = false }: { v: Video; onChange?: (v: Video) => void; onDeleted?: (id: string) => void; tiktokConnected?: boolean; sendTo?: PlatformId[]; hintConnect?: boolean; example?: boolean }) {
  const [busy, setBusy] = useState('');
  const hasFile = v.sizeBytes > 0;
  const fullCaption = `${v.caption} ${v.hashtags.map((h) => `#${h}`).join(' ')}`.trim();

  const act = async (action: 'approve' | 'reject' | 'posted') => {
    if (example) return;
    setBusy(action);
    try {
      const next = await api.act(action, v.id, v.sig);
      onChange?.(next);
      toast('success', next.status === 'publishing' ? 'Approved. Sending to your TikTok drafts…' : next.status === 'approved' ? 'Approved. Download it and post it in TikTok.' : next.status === 'rejected' ? 'Rejected. It will not be posted.' : 'Marked as posted.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  // Delete the video, its file and thumbnail from the server for good (in the app and on the email review page).
  const remove = async () => {
    if (example || !window.confirm(`Delete "${v.title}" for good? The video file is removed too.${v.status === 'sent' ? ' (A copy already in your TikTok drafts stays there.)' : ''}`)) return;
    setBusy('delete');
    try {
      await api.deleteVideo(v.id, v.sig);
      onDeleted?.(v.id);
      toast('success', 'Video deleted.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  // One Send button per connected platform (YouTube, Facebook, Instagram), shown once the video is approved.
  const sendOne = async (p: PlatformId) => {
    if (example) return;
    const info = PLATFORM_INFO[p];
    if (info.publicNow && !window.confirm(`Post "${v.title}" to Instagram now?\n\nInstagram has no drafts: it goes public on your account right away. You can delete it in Instagram later.`)) return;
    setBusy(p);
    try {
      onChange?.(await api.send(p, v.id, v.sig, info.publicNow));
      toast('success', `${info.sending} It takes 1 to 3 minutes; refresh to see the result.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const approved = ['approved', 'publishing', 'sent', 'posted'].includes(v.status) || (v.status === 'failed' && hasFile);
  const shown = PLATFORMS.filter((p) => sendTo.includes(p) || v.platforms?.[p]);
  const sendBlock = approved && (shown.length > 0 || (hintConnect && !example)) && (
    <div className="panel space-y-2">
      <p className="label">Other platforms</p>
      {shown.length === 0 && <p className="text-sm text-slate-400">Connect YouTube, Facebook or Instagram in <a className="underline" href="/settings">Settings</a> to get a Send button for each one here.</p>}
      {shown.map((p) => {
        const info = PLATFORM_INFO[p];
        const st = v.platforms?.[p];
        const stuck = st?.state === 'sending' && Date.now() - Date.parse(st.at) > 15 * 60_000;
        const canSend = sendTo.includes(p) && hasFile && !v.fileRemovedAt && (!st || st.state === 'failed' || stuck);
        return (
          <div key={p} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2 first:border-0 first:pt-0">
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm font-medium"><span aria-hidden="true" className="mr-1.5 inline-block w-4 text-center">{info.icon}</span>{info.name}</p>
              {st?.state === 'sent' && <p className="text-xs text-emerald-200">✓ {info.done}{st.url && <> <a className="underline" href={st.url} target="_blank" rel="noopener noreferrer">Open</a></>}</p>}
              {st?.state === 'sending' && !stuck && <p className="text-xs text-violet-100"><span className="spinner" /> {info.sending} Refresh in a minute.</p>}
              {stuck && <p className="text-xs text-amber-200">This send seems stuck. Try again.</p>}
              {st?.state === 'failed' && <p className="text-xs text-red-200">Failed: {st.error}</p>}
              {!st && info.publicNow && <p className="text-xs text-amber-200">Posts publicly right away (no drafts on Instagram). Asks you first.</p>}
              {!st && !sendTo.includes(p) && <p className="text-xs text-slate-400">Not connected.</p>}
            </div>
            {canSend && (
              <button className={st ? 'btn' : 'btn-primary'} disabled={!!busy} onClick={() => void sendOne(p)}>
                {busy === p ? <><span className="spinner" /> Starting…</> : st ? '↻ Try again' : `↑ ${info.button}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
  // Results: YouTube / Instagram numbers come in by themselves; TikTok's are typed here (the AI learns from them).
  const [views, setViews] = useState(v.stats?.tiktok?.views?.toString() ?? '');
  const [likes, setLikes] = useState(v.stats?.tiktok?.likes?.toString() ?? '');
  const num = (x: string) => (x.trim() === '' ? undefined : Math.max(0, Math.round(Number(x.replace(/[,\s]/g, '')) || 0)));
  const saveStats = async () => {
    if (example) return;
    setBusy('stats');
    try {
      onChange?.(await api.saveStats(v.id, v.sig, num(views), num(likes)));
      toast('success', 'Saved. The next videos learn from it.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const short = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(x));
  const statsBlock = (v.status === 'sent' || v.status === 'posted' || !!v.stats) && (
    <div className="panel space-y-2">
      <p className="label">Results</p>
      {v.stats?.youtube && <p className="text-sm text-slate-300">▶ YouTube: {short(v.stats.youtube.views)} views · {short(v.stats.youtube.likes)} likes · {short(v.stats.youtube.comments)} comments</p>}
      {v.stats?.instagram && <p className="text-sm text-slate-300">◎ Instagram: {short(v.stats.instagram.likes)} likes · {short(v.stats.instagram.comments)} comments</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-28 text-xs text-slate-400">TikTok views<input className="input mt-1 w-full" inputMode="numeric" placeholder="e.g. 12400" value={views} onChange={(e) => setViews(e.target.value)} /></label>
        <label className="min-w-0 flex-1 basis-28 text-xs text-slate-400">TikTok likes<input className="input mt-1 w-full" inputMode="numeric" placeholder="optional" value={likes} onChange={(e) => setLikes(e.target.value)} /></label>
        <button className="btn" disabled={!!busy} onClick={() => void saveStats()}>{busy === 'stats' ? <><span className="spinner" /> Saving…</> : 'Save'}</button>
      </div>
      <p className="text-xs text-slate-500">A day or two after posting, type the numbers from TikTok. New videos copy what works on your channel.</p>
    </div>
  );
  const del = onDeleted && v.status !== 'building' && v.status !== 'publishing' && !Object.values(v.platforms ?? {}).some((x) => x?.state === 'sending' && Date.now() - Date.parse(x.at) < 15 * 60_000) && (
    <button className="btn !border-red-300/30 text-red-200 hover:!border-red-300/60" disabled={!!busy} onClick={() => void remove()}>{busy === 'delete' ? <><span className="spinner" /> Deleting…</> : '🗑 Delete'}</button>
  );
  const copy = async (text = fullCaption, what = 'Caption') => {
    try {
      await navigator.clipboard.writeText(text);
      toast('success', `${what} copied.`);
    } catch {
      toast('error', 'Could not copy. Select the text instead.');
    }
  };

  if (v.status === 'script' || v.status === 'building') {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip s={v.status} />
          <span className="text-xs text-slate-400">{when(v.createdAt)} · {v.topic}</span>
        </div>
        {v.error && <p className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1.5 text-sm text-red-100">Last build failed: {v.error}</p>}
        <ScriptEditor key={`${v.id}:${v.updatedAt}`} v={v} onChange={onChange} example={example} />
        {del && <div className="border-t border-white/10 pt-3">{del}</div>}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[300px]">
        {hasFile && !example ? (
          <video className="aspect-[9/16] w-full rounded-2xl border border-white/10 bg-black object-cover" src={fileUrl(v, 'mp4')} poster={fileUrl(v, 'jpg')} controls playsInline preload="metadata" />
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-indigo-950 to-slate-950 p-6 text-center">
            <p className="font-display text-2xl font-bold uppercase leading-tight [text-shadow:0_2px_8px_#000]">{hasFile ? v.hook : 'No video'}</p>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip s={v.status} />
          <span className="text-xs text-slate-400">{when(v.createdAt)} · {v.durationSec}s</span>
        </div>
        <h3 className="text-xl font-semibold leading-snug">{v.title}</h3>
        {v.fileRemovedAt && <p className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-slate-400">The video file was removed by the auto clean-up on {when(v.fileRemovedAt)}. The text below is kept.</p>}
        {v.error && <p className="rounded-lg border border-red-300/40 bg-red-500/10 px-2 py-1.5 text-sm text-red-100">{v.error}</p>}
        {(v.episode || v.comment || v.recap) && (
          <p className="text-xs text-slate-400">
            {v.recap && <span className="mr-2">📅 Weekly recap</span>}
            {v.episode && <span className="mr-2">Episode #{v.episode}</span>}
            {v.comment && <span>💬 Reply to {v.comment.by ? `@${v.comment.by.replace(/^@/, '')}` : 'a comment'}: "{v.comment.text.slice(0, 80)}{v.comment.text.length > 80 ? '…' : ''}"</span>}
          </p>
        )}
        {!!v.checks?.length && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-400/5 px-3 py-2 text-sm">
            <p className="label !text-amber-200">Quality check</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-50/90">{v.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(v.status === 'pending' || (v.status === 'failed' && hasFile)) && (
            <>
              <button className="btn-primary" disabled={!!busy} onClick={() => void act('approve')}>{busy === 'approve' ? <><span className="spinner" /> Approving…</> : tiktokConnected ? '✓ Approve · send to TikTok drafts' : '✓ Approve'}</button>
              {v.status === 'pending' && <button className="btn" disabled={!!busy} onClick={() => void act('reject')}>✕ Reject</button>}
            </>
          )}
          {v.status === 'approved' && tiktokConnected && (
            <button className="btn-primary" disabled={!!busy} onClick={() => void act('approve')}>{busy === 'approve' ? <><span className="spinner" /> Sending…</> : '↑ Send to TikTok drafts'}</button>
          )}
          {(v.status === 'approved' || v.status === 'sent') && (
            <button className="btn-primary" disabled={!!busy} onClick={() => void act('posted')}>★ I posted it</button>
          )}
          {hasFile && <a className="btn" href={example ? undefined : fileUrl(v, 'mp4', true)} download>↓ Download</a>}
          <button className="btn" onClick={() => void copy()}>Copy caption</button>
          {del}
        </div>
        {v.status === 'approved' && <p className="text-sm text-sky-100">{tiktokConnected ? 'Tap "Send to TikTok drafts", or ' : ''}Download it, then post it in the TikTok app. Paste the caption, add a sound if you like, and turn on <b>"AI-generated content"</b>.</p>}
        {v.status === 'sent' && <p className="text-sm text-emerald-100">It's in TikTok: open the TikTok app, check your notifications or inbox, then edit and post. Turn on <b>"AI-generated content"</b> before posting.</p>}
        {v.status === 'publishing' && <p className="text-sm text-violet-100">Sending to TikTok. This takes about a minute; refresh to see the result.</p>}
        {sendBlock}
        {statsBlock}

        <div className="panel space-y-1">
          <p className="label">Caption</p>
          <p className="text-sm text-slate-200">{fullCaption}</p>
        </div>
        {v.firstComment && (
          <div className="panel space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label">Comment to post and pin</p>
              <button className="btn !min-h-0 !py-1 text-xs" onClick={() => void copy(v.firstComment, 'Comment')}>Copy comment</button>
            </div>
            <p className="text-sm text-slate-200">💬 {v.firstComment}</p>
            <p className="text-xs text-slate-500">After posting, add this as the first comment and pin it (long-press it → Pin). It gets people replying.</p>
          </div>
        )}
        <div className="panel space-y-1">
          <p className="label">What the voice says</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">{v.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </div>
        <div className="space-y-1 text-xs text-slate-400">
          <p><span className="label !text-[10px]">Topic</span> {v.topic}</p>
          {!!v.extras?.length && <p><span className="label !text-[10px]">Extras</span> {v.extras.map((e) => EXTRA_LABEL[e][0]).join(' · ')}</p>}
          {v.topicVideo && <p className="text-amber-200">📚 Topic video: written from well-known facts, not news. Check the facts before approving.</p>}
          {v.sources.length > 0 && (
            <p><span className="label !text-[10px]">Sources</span> {v.sources.map((s, i) => <a key={i} className="mr-2 text-cyan-300 underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.site ?? new URL(s.url).hostname}</a>)}</p>
          )}
          {v.footage.length > 0 && (
            <p><span className="label !text-[10px]">Footage</span> {v.footage.map((f, i) => <a key={i} className="mr-1 underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.by} ({f.site ?? 'Pexels'})</a>)}</p>
          )}
          <p>Voice: {voiceText(v.voice)} (AI) · script: {v.model}</p>
        </div>
      </div>
    </div>
  );
}

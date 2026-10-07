import { useState } from 'react';
import { api, fileUrl, type Video } from '../lib/api';
import { StatusChip, toast, when } from './ui';
import { ScriptEditor } from './ScriptEditor';
import { VOICE_LABEL } from '../lib/types';

/** "Kokoro af_heart" -> "Heart · warm female (US)". Older videos show the Piper voice name as saved. */
const voiceText = (v: string) => VOICE_LABEL[v.replace(/^Kokoro /, '') as keyof typeof VOICE_LABEL] ?? v;

/** Everything about one video, with the buttons that fit its status. Used in the app and on the email review page. */
export function VideoDetail({ v, onChange, tiktokConnected, example = false }: { v: Video; onChange?: (v: Video) => void; tiktokConnected?: boolean; example?: boolean }) {
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
        </div>
        {v.status === 'approved' && <p className="text-sm text-sky-100">{tiktokConnected ? 'Tap "Send to TikTok drafts", or ' : ''}Download it, then post it in the TikTok app. Paste the caption, add a sound if you like, and turn on <b>"AI-generated content"</b>.</p>}
        {v.status === 'sent' && <p className="text-sm text-emerald-100">It's in TikTok: open the TikTok app, check your notifications or inbox, then edit and post. Turn on <b>"AI-generated content"</b> before posting.</p>}
        {v.status === 'publishing' && <p className="text-sm text-violet-100">Sending to TikTok. This takes about a minute; refresh to see the result.</p>}

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

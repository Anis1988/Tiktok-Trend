import { useEffect, useState } from 'react';
import { api, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';
import { Skeleton } from '../components/ui';

/** The page the email links to: watch, approve, reject or delete. Works without the access code (the link is signed). */
export function Review({ id, sig }: { id: string; sig: string }) {
  const [v, setV] = useState<Video | null>(null);
  const [err, setErr] = useState('');
  const [deleted, setDeleted] = useState(false);
  const sendTo = v?.sendTo ?? [];
  useEffect(() => {
    api.video(id, sig).then(setV).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id, sig]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h2 className="page-title">Review video</h2>
      {err && <p className="card text-red-200">{err}</p>}
      {!v && !err && (
        <div className="card grid gap-4 md:grid-cols-[300px_1fr]" aria-label="Loading…">
          <Skeleton className="mx-auto aspect-[9/16] w-full max-w-[300px] !rounded-2xl" />
          <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-7 w-4/5" /><Skeleton className="h-11 w-full" /><Skeleton className="h-24 w-full" /></div>
        </div>
      )}
      {deleted && <p className="card text-emerald-100">Deleted for good: the video, its file and its picture are gone from the server.</p>}
      {v && !deleted && <div className="card"><VideoDetail v={v} sendTo={sendTo} tiktokConnected={!!v.tiktokConnected} onChange={(n) => setV({ ...n, sendTo: v.sendTo, tiktokConnected: v.tiktokConnected })} onDeleted={() => setDeleted(true)} /></div>}
      <p className="text-center text-xs text-slate-500">Nothing is posted until you approve it. <a className="underline" href="/">Open the app</a></p>
    </div>
  );
}

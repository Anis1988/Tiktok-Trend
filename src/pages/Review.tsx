import { useEffect, useState } from 'react';
import { api, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';

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
      <h2 className="text-2xl font-semibold">Review video</h2>
      {err && <p className="card text-red-200">{err}</p>}
      {!v && !err && <p className="text-slate-400"><span className="spinner" /> Loading…</p>}
      {deleted && <p className="card text-emerald-100">Deleted for good: the video, its file and its picture are gone from the server.</p>}
      {v && !deleted && <div className="card"><VideoDetail v={v} sendTo={sendTo} onChange={(n) => setV({ ...n, sendTo: v.sendTo })} onDeleted={() => setDeleted(true)} /></div>}
      <p className="text-center text-xs text-slate-500">Nothing is posted until you approve it. <a className="underline" href="/">Open the app</a></p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';

/** The page the email links to: watch, approve or reject. Works without the access code (the link is signed). */
export function Review({ id, sig }: { id: string; sig: string }) {
  const [v, setV] = useState<Video | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.video(id, sig).then(setV).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id, sig]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h2 className="text-2xl font-semibold">Review video</h2>
      {err && <p className="card text-red-200">{err}</p>}
      {!v && !err && <p className="text-slate-400"><span className="spinner" /> Loading…</p>}
      {v && <div className="card"><VideoDetail v={v} onChange={setV} /></div>}
      <p className="text-center text-xs text-slate-500">Nothing is posted until you approve it. <a className="underline" href="/">Open the app</a></p>
    </div>
  );
}

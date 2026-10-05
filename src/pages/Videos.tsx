import { useCallback, useEffect, useState } from 'react';
import { api, fileUrl, type Status, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';
import { StatusChip, toast, when } from '../components/ui';

export function SetupChecklist({ st }: { st: Status }) {
  const items = [
    { ok: st.ready.secret, text: 'APP_SECRET set in Netlify (for review links)' },
    { ok: st.ready.dispatch, text: 'GH_DISPATCH_TOKEN set in Netlify (for "Make a video now" and sending to TikTok)' },
    { ok: st.tiktok.connected && !st.tiktok.expired, text: 'TikTok connected (Settings). Until then you download and post yourself.' },
  ];
  if (items.every((i) => i.ok)) return null;
  return (
    <section className="card space-y-1.5 !border-amber-300/30">
      <p className="label !text-amber-200">Finish setting up</p>
      <ul className="space-y-1 text-sm">{items.map((i) => <li key={i.text} className={i.ok ? 'text-emerald-200' : 'text-slate-300'}>{i.ok ? '✓' : '○'} {i.text}</li>)}</ul>
      <p className="text-xs text-slate-500">The full list (GitHub secrets too) is in the Guide.</p>
    </section>
  );
}

export function Videos() {
  const [list, setList] = useState<Video[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [v, s] = await Promise.all([api.videos(), api.status()]);
      setList(v);
      setStatus(s);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const [subject, setSubject] = useState('');
  const makeNow = async () => {
    setBusy(true);
    try {
      toast('info', (await api.makeNow(subject)).message);
      setSubject('');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const selected = list?.find((v) => v.id === open) ?? null;
  const waiting = list?.filter((v) => v.status === 'pending').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Videos</h2>
          <p className="text-sm text-slate-400">{list ? `${waiting} waiting for you · ${list.length} in total` : 'Loading…'}{status ? ` · AI today ${status.ai.used}/${status.ai.limit}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => void load()}>↻ Refresh</button>
        </div>
      </div>
      <MakeNow subject={subject} onSubject={setSubject} busy={busy} onMake={() => void makeNow()} />
      {err && <p className="card text-sm text-red-200">{err}</p>}
      {status && <SetupChecklist st={status} />}

      {selected && (
        <section className="card space-y-3">
          <button className="btn-ghost !px-0" onClick={() => setOpen(null)}>← All videos</button>
          <VideoDetail v={selected} tiktokConnected={!!status?.tiktok.connected && !status.tiktok.expired} onChange={(n) => setList((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null)} />
        </section>
      )}

      {list && list.length === 0 && (
        <section className="card text-center text-slate-300">
          <p className="text-lg font-semibold">No videos yet</p>
          <p className="text-sm text-slate-400">The first one is made on the next daily run, or tap "Make a video now". You'll get an email to review it.</p>
        </section>
      )}
      {list && list.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {list.map((v) => (
            <li key={v.id}>
              <button className={`card block w-full !p-2 text-left transition hover:border-cyan-300/40 ${open === v.id ? '!border-cyan-300/60' : ''}`} onClick={() => (setOpen(v.id), window.scrollTo({ top: 0, behavior: 'smooth' }))}>
                <div className="aspect-[9/16] w-full overflow-hidden rounded-xl bg-gradient-to-b from-indigo-950 to-slate-950">
                  {v.sizeBytes > 0 ? <img className="h-full w-full object-cover" src={fileUrl(v, 'jpg')} alt="" loading="lazy" /> : <p className="p-3 text-xs text-red-200">{v.error ?? 'No video'}</p>}
                </div>
                <div className="mt-2 space-y-1">
                  <StatusChip s={v.status} />
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</p>
                  <p className="text-[11px] text-slate-500">{when(v.createdAt)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Make a video now", with an optional subject for this one video. */
export function MakeNow({ subject, onSubject, busy, onMake }: { subject: string; onSubject: (s: string) => void; busy?: boolean; onMake: () => void }) {
  return (
    <form className="card space-y-2" onSubmit={(e) => (e.preventDefault(), onMake())}>
      <label className="label block" htmlFor="subject">Make a video now</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="subject" className="input w-full sm:flex-1" maxLength={80} placeholder="Subject (optional), e.g. iPhone 18, Champions League" value={subject} onChange={(e) => onSubject(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0" disabled={busy}>{busy ? <><span className="spinner" /> Starting…</> : subject.trim() ? '+ Make it about this' : '+ Make a video now'}</button>
      </div>
      <p className="text-xs text-slate-500">{subject.trim() ? `Uses the latest news about "${subject.trim()}".` : 'Empty: the app picks the top trending topic right now.'}</p>
    </form>
  );
}

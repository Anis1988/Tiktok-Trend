import { useCallback, useEffect, useState } from 'react';
import { api, fileUrl, type Status, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';
import { StatusChip, toast, when } from '../components/ui';
import { CATEGORIES, findCategory, type Niche } from '../lib/niches';
import { useSettings } from '../lib/useSettings';
import { NichePicker } from '../components/NichePicker';
import { Fold, VideoStyle } from '../components/VideoStyle';
import { MyClips } from '../components/MyClips';

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
  const { settings, setSettings, save: saveSettings } = useSettings();
  const niche = settings?.niche ?? null;
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [v, s] = await Promise.all([api.videos(), api.status()]);
      api.settings().then(setSettings, () => undefined);
      setList(v);
      setStatus(s);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const [subject, setSubject] = useState('');
  const [pick, setPick] = useState('');
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const loadIdeas = async () => {
    setIdeasBusy(true);
    try {
      setIdeas((await api.ideas(pick)).ideas);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasBusy(false);
    }
  };
  const chooseIdea = (i: Idea | null) => {
    setIdea(i);
    if (i) setSubject(i.title);
  };
  const choosePick = (x: string) => {
    setPick(x);
    setIdeas(null); // ideas belong to the old category
  };
  const makeNow = async () => {
    setBusy(true);
    try {
      toast('info', (await api.makeNow({ subject, pick, ideaUrl: idea?.url })).message);
      setSubject('');
      setIdea(null);
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
      <MakeNow subject={subject} onSubject={setSubject} pick={pick} onPick={choosePick} ideaUrl={idea?.url} onIdea={chooseIdea} ideas={ideas} ideasBusy={ideasBusy} onIdeas={() => void loadIdeas()} busy={busy} onMake={() => void makeNow()} niche={niche} />
      {settings && (
        <>
          <Fold id="channel" title="My channel" subtitle={niche ? `${findCategory(niche.category)?.emoji ?? ''} ${findCategory(niche.category)?.label ?? ''} · used for every video` : 'Anything trending · tap to choose your niche'}>
            <p className="pb-2 text-xs text-slate-400">What your videos are about. Sticking to one niche helps TikTok find the right viewers.</p>
            <NichePicker value={settings.niche} onChange={(n) => void saveSettings({ niche: n })} />
          </Fold>
          <Fold id="style" title="Video style & effects" subtitle={`${settings.reviewScript ? 'Check the script first · ' : ''}voice, captions, effects, music`}>
            <VideoStyle s={settings} save={(p) => void saveSettings(p)} />
          </Fold>
          <Fold id="clips" title="My clips" subtitle="Your own videos and pictures, used when a scene mentions their tags">
            <MyClips />
          </Fold>
        </>
      )}
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

export interface Idea { title: string; url: string; site?: string; tag: string }

const chip = (on: boolean) =>
  `shrink-0 rounded-lg border px-2.5 py-1.5 text-xs transition active:scale-95 ${on ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/5 text-slate-300'}`;

/**
 * "Make a video now": pick a category and subcategory for this one video (default: My channel), optionally a subject,
 * and "Ideas right now" (fresh headlines, free) to tap instead of typing.
 */
export function MakeNow(p: {
  subject: string; onSubject: (s: string) => void;
  pick: string; onPick: (p: string) => void;
  ideaUrl?: string; onIdea: (i: Idea | null) => void;
  ideas: Idea[] | null; ideasBusy?: boolean; onIdeas: () => void;
  busy?: boolean; onMake: () => void; niche?: Niche | null;
}) {
  const [catId, subId] = p.pick.split(':');
  const cat = findCategory(catId);
  const where = cat ? `${cat.label}${subId ? ` · ${cat.subs.find((x) => x.id === subId)?.label ?? ''}` : ''}` : p.niche ? 'your channel' : 'today\'s top trends';
  return (
    <form className="card space-y-3" onSubmit={(e) => (e.preventDefault(), p.onMake())}>
      <p className="label">Make a video now</p>

      <div className="space-y-1.5">
        <p className="text-xs text-slate-400">Category for this video</p>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" className={chip(!cat)} onClick={() => (p.onPick(''), p.onIdea(null))} aria-pressed={!cat}>{p.niche ? '⭐ My channel' : '🌍 Trending'}</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={chip(cat?.id === c.id)} onClick={() => (p.onPick(cat?.id === c.id ? '' : c.id), p.onIdea(null))} aria-pressed={cat?.id === c.id}>{c.emoji} {c.label}</button>
          ))}
        </div>
        {cat && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button type="button" className={chip(!subId)} onClick={() => (p.onPick(cat.id), p.onIdea(null))} aria-pressed={!subId}>All {cat.label}</button>
            {cat.subs.map((x) => (
              <button key={x.id} type="button" className={chip(subId === x.id)} onClick={() => (p.onPick(`${cat.id}:${x.id}`), p.onIdea(null))} aria-pressed={subId === x.id}>{x.label}</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:flex-1">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base">✏️</span>
        <input id="subject" className="input w-full !pl-10" maxLength={200} placeholder="Subject (optional), e.g. Zelda, Champions League" value={p.subject} onChange={(e) => (p.onSubject(e.target.value), p.ideaUrl && p.onIdea(null))} aria-label="Subject" />
        </div>
        <button type="submit" className="btn-primary shrink-0" disabled={p.busy}>{p.busy ? <><span className="spinner" /> Starting…</> : p.subject.trim() ? '+ Make it about this' : '+ Make a video now'}</button>
      </div>
      <p className="text-xs text-slate-500">{p.subject.trim() ? `Uses the latest news about "${p.subject.trim().slice(0, 60)}${p.subject.trim().length > 60 ? '…' : ''}"${cat ? `, in the style of ${where}` : p.ideaUrl && p.niche ? ', in the style of your channel' : ', any topic (no need to pick a category)'}.` : `Empty: the app picks the best story from ${where}.`}</p>

      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-200">💡 Ideas right now <span className="text-xs text-slate-500">· {where}</span></p>
          <button type="button" className="btn !min-h-0 !py-1.5 text-xs" disabled={p.ideasBusy} onClick={p.onIdeas}>{p.ideasBusy ? <><span className="spinner" /> Loading…</> : p.ideas ? '↻ Refresh ideas' : 'Show ideas'}</button>
        </div>
        {p.ideas && !p.ideas.length && <p className="text-xs text-slate-500">No fresh headlines right now. Try another category.</p>}
        {p.ideas && p.ideas.length > 0 && (
          <ul className="space-y-1.5">
            {p.ideas.map((i) => {
              const on = p.ideaUrl === i.url;
              return (
                <li key={i.url}>
                  <button type="button" onClick={() => p.onIdea(on ? null : i)} aria-pressed={on}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${on ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25'}`}>
                    <span className="mr-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">{i.tag}</span>
                    {i.title}
                    {i.site && <span className="text-xs text-slate-500"> · {i.site}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {p.ideas && p.ideas.length > 0 && <p className="text-xs text-slate-500">Tap an idea to use it as the subject, then tap "Make it about this".</p>}
      </div>
    </form>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pushWidget } from '../lib/widget';
import { api, fileUrl, sendTargets, type Status, type Video } from '../lib/api';
import { VideoDetail } from '../components/VideoDetail';
import { EmptyState, Seg, Sheet, Skeleton, StatusChip, toast, when } from '../components/ui';
import type { VideoStatus } from '../lib/types';
import { CATEGORIES, LISTY, evergreenIdeas, findCategory, type EvergreenIdea, type Niche } from '../lib/niches';
import { EXTRA_LABEL, type Extra } from '../lib/types';
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

  const settingsLoaded = useRef(false);
  const load = useCallback(async (quick = false) => {
    try {
      // Quick (auto-refresh): only the video list, to keep server calls low.
      if (quick) { const v = await api.videos(); pushWidget(v); return setList(v); }
      const [v, s] = await Promise.all([api.videos(), api.status()]);
      if (!settingsLoaded.current) api.settings().then((x) => ((settingsLoaded.current = true), setSettings(x)), () => undefined);
      setList(v);
      pushWidget(v); // 🎬 Android home-screen widget
      setStatus(s);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Fresh list when you come back to the app (phone unlocked, tab switched back).
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  // While a video is being made (after "Make a video now", or one is building), check every 20 seconds, up to 15 minutes.
  const [watchUntil, setWatchUntil] = useState(0);
  const [watchFrom, setWatchFrom] = useState('');
  const building = list?.some((v) => v.status === 'building' && Date.now() - Date.parse(v.updatedAt) < 20 * 60_000) ?? false;
  const arrived = !!watchFrom && (list?.some((v) => v.createdAt > watchFrom && v.status !== 'building') ?? false);
  useEffect(() => {
    if (arrived) setWatchUntil(0);
  }, [arrived]);
  const watching = (watchUntil > 0 && !arrived) || building;
  useEffect(() => {
    if (!watching) return;
    const t = window.setInterval(() => {
      if (!building && Date.now() > watchUntil) return setWatchUntil(0);
      if (document.visibilityState === 'visible') void load(true);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [watching, building, watchUntil, load]);

  const [subject, setSubject] = useState('');
  const [pick, setPick] = useState('');
  const [idea, setIdea] = useState<Idea | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  // Extras: remembered on this device for next time.
  const [extras, setExtrasState] = useState<Extra[]>(() => {
    try {
      return (JSON.parse(localStorage.getItem('tt.extras') ?? '[]') as Extra[]).filter((e) => e in EXTRA_LABEL);
    } catch {
      return [];
    }
  });
  const setExtras = (e: Extra[]) => {
    setExtrasState(e);
    try {
      localStorage.setItem('tt.extras', JSON.stringify(e));
    } catch { /* private mode: fine */ }
  };
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
  // A quiz / fun facts / top 10 idea: its subject, and the matching extra (Guess who? or Fun facts) instead of the other.
  const chooseEvergreen = (i: EvergreenIdea) => {
    setIdea(null);
    setSubject(i.subject);
    setExtras([...extras.filter((x) => !['quiz', 'facts', 'myth', 'versus', 'debate', 'slides'].includes(x)), ...(i.extra ? [i.extra] : [])]);
  };
  const chooseIdea = (i: Idea | null) => {
    setIdea(i);
    if (i) setSubject(i.title);
  };
  const choosePick = (x: string) => {
    setPick(x);
    setIdeas(null); // ideas belong to the old category
  };
  const [reply, setReply] = useState<{ text: string; by: string } | null>(null);
  // Shared from the phone (Share → Trend Videos): the link becomes the subject, ready to make.
  useEffect(() => {
    try {
      const shared = sessionStorage.getItem('tt.share');
      if (!shared) return;
      sessionStorage.removeItem('tt.share');
      setSubject(shared);
      toast('info', 'Link ready. Pick extras if you like, then tap "Make it about this".');
    } catch { /* private mode */ }
  }, []);
  const makeNow = async (recap = false) => {
    if (reply && !reply.text.trim() && !recap) return toast('error', 'Paste the comment to reply to (or close "Reply to a comment").');
    setBusy(true);
    try {
      toast('info', (await api.makeNow(recap ? { recap: true } : { subject, pick, ideaUrl: idea?.url, extras, comment: reply?.text, commentBy: reply?.by })).message);
      if (!recap) setReply(null);
      setWatchFrom(new Date(Date.now() - 60_000).toISOString());
      setWatchUntil(Date.now() + 15 * 60_000);
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h2 className="page-title">Videos</h2>
          {list ? (
            <ul className="flex flex-wrap gap-1.5 text-xs text-slate-300" aria-label="Summary">
              <Stat n={waiting} words="waiting for you" hot={waiting > 0} />
              <Stat n={list.length} words="in total" />
              {status && <Stat n={`${status.ai.used}/${status.ai.limit}`} words="AI today" />}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
        <button className="btn shrink-0" onClick={() => void load()} aria-label="Refresh">↻ <span className="hidden min-[360px]:inline">Refresh</span></button>
      </div>
      {watching && (
        <p className="flex items-center gap-2.5 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
          <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0"><span className="pulse-dot absolute inset-0 rounded-full bg-violet-300" /></span>
          <span><span className="spinner mr-1" /> A video is being made (3 to 5 minutes). This list updates by itself.</span>
        </p>
      )}
      <MakeNow subject={subject} onSubject={setSubject} pick={pick} onPick={choosePick} ideaUrl={idea?.url} onIdea={chooseIdea} ideas={ideas} ideasBusy={ideasBusy} onIdeas={() => void loadIdeas()} busy={busy} onMake={() => void makeNow()} niche={niche} extras={extras} onExtras={setExtras} reply={reply} onReply={setReply} onRecap={() => void makeNow(true)} onEvergreen={chooseEvergreen} />
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
        <Sheet label={selected.title} onClose={() => setOpen(null)} top={<button className="btn-ghost !px-1" onClick={() => setOpen(null)}>← All videos</button>}>
          <VideoDetail key={selected.id} v={selected} tiktokConnected={!!status?.tiktok.connected && !status.tiktok.expired} sendTo={sendTargets(status)} hintConnect onChange={(n) => setList((l) => l?.map((x) => (x.id === n.id ? n : x)) ?? null)} onDeleted={(id) => (setOpen(null), setList((l) => l?.filter((x) => x.id !== id) ?? null))} />
        </Sheet>
      )}

      {!list && !err && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Loading videos">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="space-y-2">
              <Skeleton className="aspect-[9/16] w-full !rounded-2xl" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      )}
      {list && list.length === 0 && (
        <EmptyState icon="🎬" title="No videos yet">
          The first one is made on the next daily run, or tap "Make a video now". You'll get an email to review it.
        </EmptyState>
      )}
      {list && list.length > 0 && (
        <>
          <p className="label pt-1">Your videos</p>
          <ul className="feed-in grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {list.map((v) => (
              <li key={v.id}>
                <VideoCard v={v} selected={open === v.id} onOpen={() => setOpen(v.id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const Stat = ({ n, words, hot = false }: { n: number | string; words: string; hot?: boolean }) => (
  <li className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${hot ? 'border-amber-300/40 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/[0.04]'}`}>
    <b className="num text-[13px] text-white">{n}</b> {words}
  </li>
);

/** What tapping a video card does, in words (the card's main action). */
const ACTION: Record<VideoStatus, string> = {
  script: '✎ Check the script', building: '⚙ See progress', pending: '▶ Review', approved: '↑ Post it', publishing: 'Open',
  sent: '📲 Post it', posted: 'Open', rejected: 'Open', failed: 'Open',
};

/** One video in the feed: a vertical picture with its status, the title over it, and the main action. Also drawn in the Guide. */
export function VideoCard({ v, selected = false, onOpen, example = false }: { v: Video; selected?: boolean; onOpen?: () => void; example?: boolean }) {
  const primary = v.status === 'pending' || v.status === 'script' || v.status === 'approved' || v.status === 'sent';
  return (
    <button type="button" className={`card tap group block w-full overflow-hidden !p-0 text-left ${selected ? '!border-cyan-300/60' : ''}`} onClick={onOpen}>
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-b from-indigo-950 via-[#120c2e] to-slate-950">
        {v.sizeBytes > 0 && !example ? (
          <img className="h-full w-full object-cover" src={fileUrl(v, 'jpg')} alt="" loading="lazy" />
        ) : v.sizeBytes > 0 ? (
          <div className="h-full bg-gradient-to-br from-cyan-500/40 via-indigo-600/30 to-fuchsia-600/40 px-3 pt-12 text-center font-display text-lg font-bold uppercase leading-tight [text-shadow:0_2px_8px_#000]"><p className="line-clamp-3">{v.hook}</p></div>
        ) : (
          <div className="flex h-1/2 flex-col items-center justify-end gap-2 p-3 text-center">
            <span aria-hidden="true" className="text-2xl opacity-70">{v.status === 'script' ? '✎' : v.status === 'building' ? '⚙' : '🎞️'}</span>
            <p className="line-clamp-3 text-xs text-slate-300">{v.error ?? 'No video'}</p>
          </div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />
        <div className="absolute inset-x-2 top-2 flex"><StatusChip s={v.status} onMedia /></div>
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-2.5">
          <p className="line-clamp-3 font-display text-[15px] font-semibold leading-snug text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">{v.title}</p>
          <p className="num text-[11px] text-slate-300">{when(v.createdAt)}{v.durationSec > 0 ? ` · ${v.durationSec}s` : ''}</p>
          <span className={`flex min-h-[34px] items-center justify-center rounded-xl px-2 text-xs font-semibold ${primary ? 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 text-slate-950 shadow-[0_6px_20px_-6px_rgba(34,211,238,0.7)]' : 'border border-white/20 bg-white/10 text-slate-100 backdrop-blur'}`}>
            {ACTION[v.status]}
          </span>
        </div>
      </div>
    </button>
  );
}

export interface Idea { title: string; url: string; site?: string; tag: string }

const chip = (on: boolean) => `chip ${on ? 'is-on' : ''}`;

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
  extras?: Extra[]; onExtras?: (e: Extra[]) => void;
  reply?: { text: string; by: string } | null; onReply?: (r: { text: string; by: string } | null) => void;
  onRecap?: () => void;
  onEvergreen?: (i: EvergreenIdea) => void;
}) {
  const extras = p.extras ?? [];
  const topicHint = !p.ideaUrl && !/^https?:\/\//.test(p.subject.trim()) && (LISTY.test(p.subject) || extras.some((e) => ['quiz', 'facts', 'myth', 'versus'].includes(e)));
  // Guess who?, Fun facts, Myth vs Fact and This or That are kinds of video: picking one turns the others off.
  const KINDS: Extra[] = ['quiz', 'facts', 'myth', 'versus', 'debate', 'slides'];
  const toggle = (e: Extra) => p.onExtras?.(extras.includes(e) ? extras.filter((x) => x !== e) : [...extras.filter((x) => !(KINDS.includes(e) && KINDS.includes(x))), e]);
  const [catId, subId] = p.pick.split(':');
  const cat = findCategory(catId);
  const [tab, setTab] = useState<'news' | 'evergreen'>('news');
  const [seed, setSeed] = useState(0);
  const evergreen = useMemo(() => evergreenIdeas(cat?.id ?? p.niche?.category, cat ? (p.niche?.category === cat.id ? p.niche.focus : []) : p.niche?.focus ?? [], seed), [cat, p.niche, seed]);
  const where = cat ? `${cat.label}${subId ? ` · ${cat.subs.find((x) => x.id === subId)?.label ?? ''}` : ''}` : p.niche ? 'your channel' : 'today\'s top trends';
  return (
    <form className="card space-y-4" onSubmit={(e) => (e.preventDefault(), p.onMake())}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/25 text-base">✦</span>
        <p className="font-display text-lg font-semibold">Make a video now</p>
      </div>

      <div className="space-y-1.5">
        <p className="label">Category for this video</p>
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
        <input id="subject" className="input w-full !pl-10" maxLength={200} placeholder="Subject or a link (optional), e.g. Zelda, Top 10 strongest in AOT" value={p.subject} onChange={(e) => (p.onSubject(e.target.value), p.ideaUrl && p.onIdea(null))} aria-label="Subject" />
        </div>
        <button type="submit" className="btn-primary shrink-0" disabled={p.busy}>{p.busy ? <><span className="spinner" /> Starting…</> : p.reply ? '💬 Make the reply' : p.subject.trim() ? '+ Make it about this' : '+ Make a video now'}</button>
      </div>
      {p.onReply && (
        p.reply ? (
          <div className="space-y-2 rounded-xl border border-cyan-300/30 bg-cyan-400/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-cyan-50">💬 Reply to a comment</p>
              <button type="button" className="btn-ghost !min-h-0 !py-1 text-xs" onClick={() => p.onReply?.(null)}>✕ Close</button>
            </div>
            <textarea className="input min-h-[84px] w-full" maxLength={300} placeholder="Paste the viewer's comment, e.g. Is this actually real?" value={p.reply.text} onChange={(e) => p.onReply?.({ ...p.reply!, text: e.target.value })} aria-label="Comment to reply to" />
            <input className="input w-full" maxLength={30} placeholder="Their name (optional), e.g. @coffee_fan22" value={p.reply.by} onChange={(e) => p.onReply?.({ ...p.reply!, by: e.target.value })} aria-label="Commenter name" />
            <p className="text-xs text-slate-400">The video opens on the comment in a bubble ("Replying to @name"), then answers it. The subject box above is optional (it helps find news). Tip: in TikTok, post it as a reply to that comment.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn !min-h-0 !py-1.5 text-xs" onClick={() => p.onReply?.({ text: '', by: '' })}>💬 Reply to a comment</button>
            {p.onRecap && <button type="button" className="btn !min-h-0 !py-1.5 text-xs" disabled={p.busy} onClick={p.onRecap} title="Top 5 of this week's videos, counted down. No AI cost.">📅 This week's recap</button>}
          </div>
        )
      )}
      <div className="space-y-1.5">
        <p className="label">Extras for this video <span className="normal-case tracking-normal text-slate-500">· pick any, or none</span></p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(EXTRA_LABEL) as Extra[]).map((e) => (
            <button key={e} type="button" className={chip(extras.includes(e))} onClick={() => toggle(e)} aria-pressed={extras.includes(e)} title={EXTRA_LABEL[e][1]}>{EXTRA_LABEL[e][0]}</button>
          ))}
        </div>
        {extras.length > 0 && <ul className="space-y-0.5 text-xs text-slate-400">{extras.map((e) => <li key={e}><b className="text-slate-300">{EXTRA_LABEL[e][0].replace(/([^?])$/, '$1:')}</b> {EXTRA_LABEL[e][1]}</li>)}</ul>}
      </div>
      <p className="text-xs text-slate-500">{p.subject.trim() ? `${topicHint ? '📚 Topic video: well-known facts about' : 'Uses the latest news about'} "${p.subject.trim().slice(0, 60)}${p.subject.trim().length > 60 ? '…' : ''}"${!topicHint && !p.ideaUrl ? ' (or well-known facts if it\'s not in the news)' : ''}${cat ? `, in the style of ${where}` : p.ideaUrl && p.niche ? ', in the style of your channel' : ', any topic (no need to pick a category)'}.` : `Empty: the app picks the best story from ${where}.`}</p>

      <div className="space-y-2.5 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-100">💡 Ideas <span className="text-xs text-slate-500">· {where}</span></p>
          <Seg role="tablist" label="Kind of ideas" value={tab} onChange={setTab} options={[{ id: 'news', label: '📰 News' }, { id: 'evergreen', label: <>🎯 Quiz &amp; facts</> }]} />
        </div>
        {tab === 'news' ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Fresh headlines (free, updated every 30 minutes).</p>
              <button type="button" className="btn !min-h-0 shrink-0 !py-1.5 text-xs" disabled={p.ideasBusy} onClick={p.onIdeas}>{p.ideasBusy ? <><span className="spinner" /> Loading…</> : p.ideas ? '↻ Refresh' : 'Show ideas'}</button>
            </div>
            {p.ideas && !p.ideas.length && <p className="text-xs text-slate-500">No fresh headlines right now. Try another category.</p>}
            {p.ideas && p.ideas.length > 0 && (
              <ul className="space-y-1.5">
                {p.ideas.map((i) => {
                  const on = p.ideaUrl === i.url;
                  return (
                    <li key={i.url}>
                      <button type="button" onClick={() => p.onIdea(on ? null : i)} aria-pressed={on}
                        className={`tap w-full rounded-xl border px-3 py-2.5 text-left text-sm ${on ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25'}`}>
                        <span className="mr-1.5 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-300">{i.tag}</span>
                        {i.title}
                        {i.site && <span className="text-xs text-slate-500"> · {i.site}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {p.ideas && p.ideas.length > 0 && <p className="text-xs text-slate-500">Tap an idea to use it as the subject, then tap "Make it about this".</p>}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Subjects that work any day: a quiz, fun facts or a top 10. Tapping one also picks the right extra.</p>
              <button type="button" className="btn !min-h-0 shrink-0 !py-1.5 text-xs" onClick={() => setSeed((n) => n + 1)}>↻ More</button>
            </div>
            <ul className="space-y-1.5">
              {evergreen.map((i) => {
                const on = p.subject.trim() === i.subject;
                return (
                  <li key={i.title}>
                    <button type="button" onClick={() => p.onEvergreen?.(i)} aria-pressed={on}
                      className={`tap w-full rounded-xl border px-3 py-2.5 text-left text-sm ${on ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-200 hover:border-white/25'}`}>
                      <span className="mr-1.5 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-300">{i.tag}</span>
                      {i.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </form>
  );
}

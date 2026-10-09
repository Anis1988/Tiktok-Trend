import { useEffect, useState } from 'react';
import { api, type Video } from '../lib/api';
import { STICKERS, type DraftLine, type MediaItem } from '../lib/types';
import { toast } from './ui';

type Line = DraftLine;

/** "Check the script first": edit the words before the video is built, then Build (no extra AI cost). */
export function ScriptEditor({ v, onChange, example = false }: { v: Video; onChange?: (v: Video) => void; example?: boolean }) {
  const [title, setTitle] = useState(v.title);
  const [hook, setHook] = useState(v.hook);
  const [caption, setCaption] = useState(v.caption);
  const [comment, setComment] = useState(v.firstComment ?? '');
  const [cover, setCover] = useState(v.cover ?? '');
  const quiz = v.extras?.includes('quiz');
  const debate = v.extras?.includes('debate');
  const slides = v.extras?.includes('slides');
  const [lines, setLines] = useState<Line[]>(v.draft?.lines ?? v.lines.map((text) => ({ text, footage: v.topic.slice(0, 60), keywords: [] })));
  const [busy, setBusy] = useState('');
  const building = v.status === 'building';
  const [clips, setClips] = useState<MediaItem[]>([]);
  useEffect(() => {
    // Your clips, to pick one per line (not available from an email link without the access code).
    if (!example) api.media().then((l) => setClips(l.filter((m) => m.ready)), () => undefined);
  }, [example]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // The key-word boxes keep exactly what you type (commas, spaces); the words are taken from it when saving.
  const [kw, setKw] = useState<string[]>(() => lines.map((l) => l.keywords.join(', ')));
  const save = async (quiet = false) => {
    // Fit everything to what the server accepts, so Save and Build never fail on a long AI line or an emptied box.
    const clean = lines
      .map((l, i) => ({
        ...l,
        text: l.text.trim().slice(0, 220),
        footage: (l.footage.trim() || l.text.trim().split(/\s+/).slice(0, 3).join(' ') || 'city').slice(0, 60),
        keywords: (kw[i] ?? '').split(',').map((k) => k.trim().slice(0, 30)).filter(Boolean).slice(0, 3),
        label: l.label?.trim().slice(0, 40) || undefined,
        desc: l.desc?.trim().slice(0, 90) || undefined,
      }))
      .filter((l) => l.text)
      .slice(0, 14);
    if (clean.length < 2) throw new Error('A script needs at least 2 lines.');
    const firstLine = clean[0].text;
    const next = await api.saveScript(v.id, v.sig, {
      title: (title.trim() || v.title).slice(0, 80), hook: (hook.trim() || firstLine || v.hook).slice(0, 120),
      caption: caption.slice(0, 150), firstComment: comment.slice(0, 150), cover: cover.trim().slice(0, 40), lines: clean,
    });
    onChange?.(next);
    if (!quiet) toast('success', 'Script saved.');
    return next;
  };
  const run = async (what: 'save' | 'build' | 'discard') => {
    if (example) return;
    setBusy(what);
    try {
      if (what === 'save') await save();
      else if (what === 'build') {
        await save(true);
        onChange?.(await api.act('build', v.id, v.sig));
        toast('success', 'Building the video. It takes 3 to 5 minutes; you will get an email.');
      } else {
        if (!window.confirm('Discard this script? No video will be made.')) return;
        onChange?.(await api.act('reject', v.id, v.sig));
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const field = 'input w-full';
  return (
    <div className="space-y-3">
      {building ? (
        <p className="rounded-lg border border-violet-300/40 bg-violet-400/10 px-2 py-1.5 text-sm text-violet-100">Building the video from this script (3 to 5 minutes). Refresh to see it.</p>
      ) : (
        <p className="text-sm text-slate-300">Read the script and change anything you like, then tap <b>Build video</b>. Building uses no extra AI.</p>
      )}
      <label className="block space-y-1"><span className="label">Title (for you)</span>
        <input className={field} value={title} maxLength={80} disabled={building} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block space-y-1"><span className="label">Hook (big text at the start)</span>
        <input className={field} value={hook} maxLength={120} disabled={building} onChange={(e) => setHook(e.target.value)} /></label>
      {v.extras?.includes('cover') && (
        <label className="block space-y-1"><span className="label">Cover words (first frame)</span>
          <input className={field} value={cover} maxLength={40} disabled={building} onChange={(e) => setCover(e.target.value)} placeholder="e.g. STRONGEST IN AOT?" /></label>
      )}
      <div className="space-y-2">
        <p className="label">What the voice says (one box per scene)</p>
        {lines.map((l, i) => (
          <div key={i} className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs text-slate-500">{i + 1}</span>
              <textarea className={`${field} min-h-[64px]`} value={l.text} maxLength={220} disabled={building} onChange={(e) => setLine(i, { text: e.target.value })} aria-label={`Line ${i + 1}`} />
            </div>
            <div className="grid grid-cols-1 gap-1 pl-7 sm:grid-cols-2">
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.footage} maxLength={60} disabled={building} onChange={(e) => setLine(i, { footage: e.target.value })} placeholder="Footage search, e.g. city night" aria-label={`Footage for line ${i + 1}`} />
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={kw[i] ?? ''} disabled={building} onChange={(e) => setKw((k) => k.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Words that pop, e.g. Zelda, record" aria-label={`Key words for line ${i + 1}`} />
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.real ?? ''} maxLength={80} disabled={building} onChange={(e) => setLine(i, { real: e.target.value })} placeholder="Real photo of… e.g. LeBron James" aria-label={`Real photo for line ${i + 1}`} />
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.character ?? ''} maxLength={100} disabled={building} onChange={(e) => setLine(i, { character: e.target.value })} placeholder="Character, e.g. Levi | Attack on Titan" aria-label={`Character picture for line ${i + 1}`} />
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.object ?? ''} maxLength={60} disabled={building} onChange={(e) => setLine(i, { object: e.target.value })} placeholder="Photo of a thing, e.g. red apple" aria-label={`Object photo for line ${i + 1}`} />
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.label ?? ''} maxLength={40} disabled={building} onChange={(e) => setLine(i, { label: e.target.value })} placeholder="Title on screen, e.g. #3 Levi Ackerman" aria-label={`Title on screen for line ${i + 1}`} />
              {slides && (
                <input className={`${field} !min-h-[34px] !py-1 text-xs sm:col-span-2`} value={l.desc ?? ''} maxLength={90} disabled={building} onChange={(e) => setLine(i, { desc: e.target.value })} placeholder="Slide text (short, on screen), e.g. Humanity's strongest soldier" aria-label={`Slide text for line ${i + 1}`} />
              )}
              {quiz && (
                <select className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.quiz ?? ''} disabled={building} onChange={(e) => setLine(i, { quiz: (e.target.value || undefined) as Line['quiz'] })} aria-label={`Quiz for line ${i + 1}`}>
                  <option value="">Quiz: normal line</option>
                  <option value="hide">Quiz: hide the picture (clue)</option>
                  <option value="reveal">Quiz: reveal with a flash (answer)</option>
                </select>
              )}
              {debate && (
                <select className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.speaker ?? 'A'} disabled={building} onChange={(e) => setLine(i, { speaker: e.target.value as 'A' | 'B' })} aria-label={`Speaker for line ${i + 1}`}>
                  <option value="A">Debate: host A (your voice)</option>
                  <option value="B">Debate: host B (other voice)</option>
                </select>
              )}
              <select className={`${field} !min-h-[34px] !py-1 text-xs`} value={`${l.delivery ?? ''}${l.pause ? '+pause' : ''}`} disabled={building} onChange={(e) => { const [d, p] = e.target.value.split('+'); setLine(i, { delivery: (d || undefined) as Line['delivery'], pause: p === 'pause' || undefined }); }} aria-label={`Voice for line ${i + 1}`}>
                <option value="">Voice: normal</option>
                <option value="hype">Voice: hype (faster, excited)</option>
                <option value="calm">Voice: calm (slower, serious)</option>
                <option value="+pause">Voice: normal, then a dramatic pause</option>
                <option value="hype+pause">Voice: hype, then a dramatic pause</option>
                <option value="calm+pause">Voice: calm, then a dramatic pause</option>
              </select>
              <select className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.sticker ?? ''} disabled={building} onChange={(e) => setLine(i, { sticker: (e.target.value || undefined) as Line['sticker'] })} aria-label={`Sticker for line ${i + 1}`}>
                <option value="">Sticker: none</option>
                {(Object.keys(STICKERS) as (keyof typeof STICKERS)[]).map((k) => <option key={k} value={k}>Sticker: {STICKERS[k]} {k}</option>)}
              </select>
              <select className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.media ?? ''} disabled={building} onChange={(e) => setLine(i, { media: e.target.value || undefined })} aria-label={`Picture for line ${i + 1}`}>
                <option value="">Picture: automatic</option>
                <option value="stock">Picture: no clip of mine</option>
                {clips.map((m) => <option key={m.id} value={m.id}>My clip: {m.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      <label className="block space-y-1"><span className="label">Caption</span>
        <textarea className={`${field} min-h-[56px]`} value={caption} maxLength={150} disabled={building} onChange={(e) => setCaption(e.target.value)} /></label>
      <label className="block space-y-1"><span className="label">Comment to pin</span>
        <input className={field} value={comment} maxLength={150} disabled={building} onChange={(e) => setComment(e.target.value)} /></label>
      {!building && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={() => void run('build')}>{busy === 'build' ? <><span className="spinner" /> Starting…</> : '▶ Build video'}</button>
          <button className="btn" disabled={!!busy} onClick={() => void run('save')}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          <button className="btn" disabled={!!busy} onClick={() => void run('discard')}>✕ Discard</button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { api, type Video } from '../lib/api';
import { toast } from './ui';

type Line = { text: string; footage: string; keywords: string[] };

/** "Check the script first": edit the words before the video is built, then Build (no extra AI cost). */
export function ScriptEditor({ v, onChange, example = false }: { v: Video; onChange?: (v: Video) => void; example?: boolean }) {
  const [title, setTitle] = useState(v.title);
  const [hook, setHook] = useState(v.hook);
  const [caption, setCaption] = useState(v.caption);
  const [comment, setComment] = useState(v.firstComment ?? '');
  const [lines, setLines] = useState<Line[]>(v.draft?.lines ?? v.lines.map((text) => ({ text, footage: v.topic.slice(0, 60), keywords: [] })));
  const [busy, setBusy] = useState('');
  const building = v.status === 'building';

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = async (quiet = false) => {
    const next = await api.saveScript(v.id, v.sig, { title: title.trim() || v.title, hook: hook.trim() || lines[0]?.text.slice(0, 120) || v.hook, caption, firstComment: comment, lines: lines.filter((l) => l.text.trim()) });
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
              <input className={`${field} !min-h-[34px] !py-1 text-xs`} value={l.keywords.join(', ')} disabled={building} onChange={(e) => setLine(i, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 3) })} placeholder="Words that pop, e.g. Zelda, record" aria-label={`Key words for line ${i + 1}`} />
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

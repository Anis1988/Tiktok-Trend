import { useEffect, useRef, useState } from 'react';
import { api, uploadMedia } from '../lib/api';
import type { MediaItem } from '../lib/types';
import { toast } from './ui';

const tagList = (s: string) => [...new Set(s.split(',').map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 10);
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** Static preview of a clip (used in the app and, with example data, in the Guide). */
export function ClipCard({ m, onEdit, onDelete }: { m: MediaItem; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
      <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40 text-lg">
        {m.thumb ? <img src={m.thumb} alt="" className="h-full w-full object-cover" /> : m.kind === 'video' ? '🎬' : '🖼️'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-100">{m.kind === 'video' ? '🎬' : '🖼️'} {m.name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {m.tags.map((t) => <span key={t} className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[11px] text-cyan-100">{t}</span>)}
          {!m.tags.length && <span className="text-[11px] text-amber-200">No tags: only used when you pick it for a line</span>}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">{mb(m.size)}{m.ready ? '' : ' · upload not finished'}</p>
      </div>
      {(onEdit || onDelete) && (
        <div className="flex shrink-0 flex-col gap-1">
          {onEdit && <button type="button" className="btn !min-h-0 !px-2 !py-1 text-xs" onClick={onEdit}>Edit</button>}
          {onDelete && <button type="button" className="btn !min-h-0 !px-2 !py-1 text-xs" onClick={onDelete} aria-label={`Delete ${m.name}`}>✕</button>}
        </div>
      )}
    </li>
  );
}

/** "My clips": upload your own videos and pictures with tags; scenes that mention a tag use them. */
export function MyClips() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.media().then(setItems, (e) => (setItems([]), toast('error', e instanceof Error ? e.message : String(e))));
  }, []);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 60));
  };
  const upload = async () => {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) return toast('error', 'Too big: up to 60 MB. Trim it to 5 to 20 seconds.');
    setProgress(0);
    try {
      const m = await uploadMedia(file, name.trim() || file.name, tagList(tags), setProgress);
      setItems((l) => [m, ...(l ?? []).filter((x) => x.id !== m.id)]);
      setFile(null);
      setName('');
      setTags('');
      if (input.current) input.current.value = '';
      toast('success', 'Clip added.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };
  const edit = async (m: MediaItem) => {
    const t = window.prompt(`Tags for "${m.name}" (comma separated)`, m.tags.join(', '));
    if (t === null) return;
    try {
      const next = await api.updateMedia(m.id, m.name, tagList(t));
      setItems((l) => l?.map((x) => (x.id === m.id ? next : x)) ?? null);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (m: MediaItem) => {
    if (!window.confirm(`Delete "${m.name}"?`)) return;
    try {
      await api.deleteMedia(m.id);
      setItems((l) => l?.filter((x) => x.id !== m.id) ?? null);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Your own videos and pictures: gameplay you recorded, your manga shelf or figures, your face-cam… When a scene mentions one of a clip's <b>tags</b>, that clip is shown. Only upload things you have the right to use. Short clips (5 to 20 seconds, up to 60 MB) work best.</p>
      <div className="space-y-2 rounded-xl border border-dashed border-white/15 p-3">
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp" className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-100" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} aria-label="Choose a video or picture" />
        {file && (
          <>
            <input className="input w-full" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Zelda gameplay" aria-label="Clip name" />
            <input className="input w-full" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, e.g. Zelda, Nintendo, Link" aria-label="Tags" />
            <button type="button" className="btn-primary w-full sm:w-auto" disabled={progress !== null} onClick={() => void upload()}>
              {progress !== null ? <><span className="spinner" /> Uploading {Math.round(progress * 100)}%</> : `↑ Add clip (${mb(file.size)})`}
            </button>
          </>
        )}
      </div>
      {items === null ? (
        <p className="text-sm text-slate-400"><span className="spinner" /> Loading…</p>
      ) : items.length ? (
        <ul className="space-y-2">{items.map((m) => <ClipCard key={m.id} m={m} onEdit={() => void edit(m)} onDelete={() => void remove(m)} />)}</ul>
      ) : (
        <p className="text-sm text-slate-500">No clips yet.</p>
      )}
    </div>
  );
}

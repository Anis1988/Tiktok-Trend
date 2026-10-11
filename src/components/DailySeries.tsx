import { useState } from 'react';
import { SERIES_PRESETS, seriesKey, type DailySeries } from '../lib/types';
import { Field, Toggle } from './ui';

/**
 * 📅 Daily series (Settings → Schedule, when "Make videos every day" is on): every daily video is about the same
 * subject, each time a new famous name. Also drawn in the Guide with made-up data (`onChange` / `onMake` left out).
 */
export function SeriesView({ v, onChange, onUnuse, onMake, busy }: { v: DailySeries; onChange?: (v: DailySeries) => void; onUnuse?: (key: string, name: string) => void; onMake?: () => void; busy?: boolean }) {
  const [draft, setDraft] = useState(v.subject);
  const set = (p: Partial<DailySeries>) => onChange?.({ ...v, ...p });
  const used = v.used[seriesKey(v.subject)] ?? [];
  const pickSubject = (subject: string) => {
    if (!onChange) return;
    const t = subject.replace(/\s+/g, ' ').trim().slice(0, 120);
    setDraft(t);
    if (t.length >= 3 && t !== v.subject) set({ subject: t });
  };
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <Field label="📅 Daily series" hint="Each daily video: the same subject, a new famous name every time, at least 1 minute.">
        <Toggle on={v.on} onChange={(x) => set({ on: x })} label="Daily series" />
      </Field>
      {v.on && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="series-subject">Subject</label>
            <input id="series-subject" className="input w-full" value={draft} maxLength={120} placeholder="Fun facts about a famous person"
              onChange={(e) => setDraft(e.target.value)} onBlur={() => pickSubject(draft)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} readOnly={!onChange} />
            <div className="flex flex-wrap gap-1.5">
              {SERIES_PRESETS.map((p) => (
                <button key={p} type="button" className={`rounded-full border px-2.5 py-1 text-xs ${seriesKey(p) === seriesKey(v.subject) ? 'border-fuchsia-300/60 bg-fuchsia-400/20 text-fuchsia-100' : 'border-white/15 text-slate-300'}`}
                  onClick={() => pickSubject(p)}>{p.replace(/^Fun facts about /, '')}</button>
              ))}
            </div>
            <p className="text-xs text-slate-400">Changing the subject starts from the next video. Each subject keeps its own “used” list.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Field label="Facts per video">
              <select className="input w-24" value={v.facts} onChange={(e) => set({ facts: Number(e.target.value) })} aria-label="Facts per video">
                {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="At least">
              <select className="input w-28" value={v.minSeconds} onChange={(e) => set({ minSeconds: Number(e.target.value) as DailySeries['minSeconds'] })} aria-label="Minimum length">
                <option value={60}>1 min</option>
                <option value={75}>1 min 15</option>
                <option value={90}>1 min 30</option>
              </select>
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Used so far ({used.length})</p>
            <p className="mb-1.5 text-xs text-slate-400">Never picked again. Tap ✕ to allow one again.</p>
            {used.length ? (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {[...used].reverse().map((name) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                    {name}
                    <button type="button" aria-label={`Remove ${name}`} className="text-slate-400 hover:text-white"
                      onClick={() => onUnuse?.(seriesKey(v.subject), name)}>✕</button>
                  </span>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">Nobody yet.</p>}
          </div>
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={onMake}>▶ Make the next series video now</button>
        </>
      )}
    </div>
  );
}

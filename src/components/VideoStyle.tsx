import { useState, type ReactNode } from 'react';
import { EFFECT_LABEL, TONE_LABEL, VOICE_LABEL, type AppSettings, type CaptionColor, type VideoEffects } from '../lib/types';
import { Field, Seg, Toggle } from './ui';

const SWATCH: Record<CaptionColor, string> = { yellow: '#FFE600', cyan: '#22E3FF', green: '#7CFF4F', pink: '#FF4FD8', white: '#FFFFFF' };

/** A section that opens and closes (keeps the Videos page short on a phone). Remembers if it was open. */
export function Fold({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  const key = `tt.fold.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !o;
    });
  };
  return (
    <section className="card !p-0">
      <button type="button" className="tap flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3.5 text-left" aria-expanded={open} onClick={toggle}>
        <span className="min-w-0">
          <span className="block font-display text-[16px] font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-xs text-slate-400">{subtitle}</span>}
        </span>
        <FoldChevron open={open} />
      </button>
      {open && <div className="fold-in space-y-1 border-t border-white/10 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

/** The round ⌄ on a fold: turns over when open. */
export const FoldChevron = ({ open }: { open: boolean }) => (
  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" /></svg>
  </span>
);

/** Voice, writing style, length, news country, music, captions, effects, end card and "check the script first". */
export function VideoStyle({ s, save }: { s: AppSettings; save: (p: Partial<AppSettings>) => void }) {
  const fx = (k: keyof VideoEffects, v: boolean) => save({ effects: { ...s.effects, [k]: v } });
  return (
    <div className="divide-y divide-white/5">
      <Field label="Voice">
        <select className="input w-full max-w-[16rem]" value={s.voice === 'female' ? 'af_heart' : s.voice === 'male' ? 'am_michael' : s.voice} onChange={(e) => save({ voice: e.target.value as AppSettings['voice'] })}>
          {Object.entries(VOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Writing style">
        <select className="input w-44" value={s.tone} onChange={(e) => save({ tone: e.target.value as AppSettings['tone'] })}>
          {Object.entries(TONE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Length">
        <select className="input w-36" value={s.maxSeconds} onChange={(e) => save({ maxSeconds: Number(e.target.value) })}>
          {[30, 45, 60, 75].map((n) => <option key={n} value={n}>{n === 75 ? 'over 1 min (65-75s)' : `about ${n}s`}</option>)}
        </select>
      </Field>
      <Field label="News from" hint="Which country's trends and news.">
        <select className="input w-28" value={s.country} onChange={(e) => save({ country: e.target.value })}>
          {['US', 'GB', 'CA', 'AU', 'IE', 'NZ'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Soft background music" hint="Off is best if you add a trending TikTok sound when posting. On: a quiet original tune under the voice.">
        <Toggle on={s.music} onChange={(v) => save({ music: v })} label="Soft background music" />
      </Field>
      <Field label="Caption colour" hint="Colour of the word being spoken.">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Caption colour">
          {(Object.keys(SWATCH) as CaptionColor[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={s.captionStyle.color === c} aria-label={c} title={c}
              onClick={() => save({ captionStyle: { ...s.captionStyle, color: c } })}
              className={`tap flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold text-slate-900 ${s.captionStyle.color === c ? 'border-white shadow-[0_0_14px_rgba(255,255,255,0.45)]' : 'border-white/20'}`} style={{ background: SWATCH[c] }}>{s.captionStyle.color === c ? '✓' : ''}</button>
          ))}
        </div>
      </Field>
      <Field label="Caption size">
        <Seg label="Caption size" className="w-44" value={s.captionStyle.size} onChange={(z) => save({ captionStyle: { ...s.captionStyle, size: z } })} options={[{ id: 'medium', label: 'Medium' }, { id: 'big', label: 'Big' }]} />
      </Field>
      {(Object.keys(EFFECT_LABEL) as (keyof VideoEffects)[]).map((k) => (
        <Field key={k} label={EFFECT_LABEL[k][0]} hint={EFFECT_LABEL[k][1]}>
          <Toggle on={s.effects[k]} onChange={(v) => fx(k, v)} label={EFFECT_LABEL[k][0]} />
        </Field>
      ))}
      {s.effects.endCard && (
        <Field label="Name on the end card" hint="Optional, e.g. your TikTok @name.">
          <input className="input w-44" maxLength={30} placeholder="@yourname" defaultValue={s.endCardName} onBlur={(e) => e.target.value.trim() !== s.endCardName && save({ endCardName: e.target.value.trim() })} />
        </Field>
      )}
      <Field label="Series name" hint='Makes your videos a series: each one shows "Daily Tech Drop #14" with the hook, with a boom. Empty = off.'>
        <input className="input w-44" maxLength={30} placeholder="e.g. Daily Tech Drop" defaultValue={s.seriesName} onBlur={(e) => e.target.value.trim() !== s.seriesName && save({ seriesName: e.target.value.trim() })} />
      </Field>
      <Field label="Weekly recap" hint='Every Sunday, an extra "Top 5 this week" video made from your week&#39;s videos (no AI cost). You still approve it.'>
        <Toggle on={s.weeklyRecap} onChange={(v) => save({ weeklyRecap: v })} label="Weekly recap" />
      </Field>
      <Field label="Check the script first" hint="On: each run writes the script only. You read and edit it, then tap Build video (no extra AI cost).">
        <Toggle on={s.reviewScript} onChange={(v) => save({ reviewScript: v })} label="Check the script first" />
      </Field>
    </div>
  );
}

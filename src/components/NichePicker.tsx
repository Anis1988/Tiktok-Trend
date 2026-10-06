import { useState } from 'react';
import { CATEGORIES, findCategory, type Niche } from '../lib/niches';
import { toast } from './ui';

const chip = (on: boolean) =>
  `rounded-xl border px-3 py-2 text-sm transition active:scale-95 ${on ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'}`;

/** "My channel": category -> 1 to 3 subcategories -> your own focus words, and whether big trends may join in. */
export function NichePicker({ value, onChange }: { value: Niche | null; onChange: (n: Niche | null) => void }) {
  const [word, setWord] = useState('');
  const cat = findCategory(value?.category);

  const pickCategory = (id: string | null) => {
    if (!id) return onChange(null);
    if (id === value?.category) return;
    const c = findCategory(id)!;
    onChange({ category: id, subs: [c.subs[0].id], focus: [], mix: value?.mix ?? 'niche' });
  };
  const toggleSub = (id: string) => {
    if (!value) return;
    const on = value.subs.includes(id);
    if (on && value.subs.length === 1) return toast('info', 'Keep at least one subcategory.');
    if (!on && value.subs.length >= 3) return toast('info', 'Up to 3 subcategories: fewer means a clearer channel.');
    onChange({ ...value, subs: on ? value.subs.filter((x) => x !== id) : [...value.subs, id] });
  };
  const addWord = () => {
    const w = word.trim().slice(0, 40);
    setWord('');
    if (!value || !w || value.focus.some((x) => x.toLowerCase() === w.toLowerCase())) return;
    if (value.focus.length >= 8) return toast('info', 'Up to 8 focus words.');
    onChange({ ...value, focus: [...value.focus, w] });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-slate-200">1. Category</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(!value)} onClick={() => pickCategory(null)} aria-pressed={!value}>🌍 Anything trending</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={chip(value?.category === c.id)} onClick={() => pickCategory(c.id)} aria-pressed={value?.category === c.id}>{c.emoji} {c.label}</button>
          ))}
        </div>
      </div>

      {value && cat && (
        <>
          <div className="space-y-2">
            <p className="text-sm text-slate-200">2. Subcategories <span className="text-xs text-slate-500">· pick 1 to 3, they take turns</span></p>
            <div className="flex flex-wrap gap-2">
              {cat.subs.map((s) => (
                <button key={s.id} type="button" className={chip(value.subs.includes(s.id))} onClick={() => toggleSub(s.id)} aria-pressed={value.subs.includes(s.id)}>{value.subs.includes(s.id) ? '✓ ' : ''}{s.label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-200">3. Focus words <span className="text-xs text-slate-500">· optional, news about these comes first</span></p>
            <div className="flex gap-2">
              <input className="input w-full" placeholder={cat.id === 'gaming' ? 'e.g. Zelda, GTA 6' : 'e.g. a name, a team, a product'} value={word} maxLength={40} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWord()} aria-label="Focus word" />
              <button type="button" className="btn shrink-0" onClick={addWord}>Add</button>
            </div>
            {value.focus.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {value.focus.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm">
                    {f}
                    <button type="button" className="px-1 text-slate-400 hover:text-red-300" aria-label={`Remove ${f}`} onClick={() => onChange({ ...value, focus: value.focus.filter((x) => x !== f) })}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-200">4. Big trends</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" className={`${chip(value.mix === 'niche')} text-left`} onClick={() => onChange({ ...value, mix: 'niche' })} aria-pressed={value.mix === 'niche'}>
                <b className="block">Only my niche</b><span className="text-xs text-slate-400">Best for growing a channel</span>
              </button>
              <button type="button" className={`${chip(value.mix === 'mix')} text-left`} onClick={() => onChange({ ...value, mix: 'mix' })} aria-pressed={value.mix === 'mix'}>
                <b className="block">Niche + huge trends</b><span className="text-xs text-slate-400">Only when a big trend fits your niche</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

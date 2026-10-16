import { HOOK_INFO, type HookAB } from '../lib/hooks';

/**
 * 🅰️🅱️ The two hooks the AI wrote, the one used and why. In "Check the script first" (onSwap given) the other one can
 * be picked before the video is built; afterwards it is shown for information.
 */
export function HookABPanel({ ab, onSwap, disabled = false }: { ab: HookAB; onSwap?: (i: number) => void; disabled?: boolean }) {
  const used = ab.options[ab.chosen];
  if (!used) return null;
  return (
    <div className="rounded-xl border border-cyan-300/25 bg-cyan-400/[0.05] px-3 py-2.5 text-sm">
      <p className="label !text-cyan-200">Hook A/B · picked “{HOOK_INFO[used.style].label.toLowerCase()}”{ab.swapped ? ' · changed by you' : ''}</p>
      <p className="mt-1 text-xs text-slate-300">{ab.why}</p>
      <ul className="mt-2 space-y-1.5">
        {ab.options.map((o, i) => {
          const on = i === ab.chosen;
          return (
            <li key={i} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${on ? 'border-cyan-300/50 bg-cyan-300/10' : 'border-white/10 bg-white/[0.02]'}`}>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${on ? 'bg-cyan-300 text-slate-950' : 'bg-white/10 text-slate-300'}`}>{i === 0 ? 'A' : 'B'} · {HOOK_INFO[o.style].label}</span>
              <span className={`min-w-0 flex-1 basis-40 ${on ? 'text-slate-50' : 'text-slate-400'}`}>“{o.text}”</span>
              {on ? <span className="text-xs text-cyan-200">✓ used</span>
                : onSwap && <button type="button" className="btn !min-h-[36px] !py-1 text-xs" disabled={disabled} onClick={() => onSwap(i)}>Use this one</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

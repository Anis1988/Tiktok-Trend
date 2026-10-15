import { useEffect, useRef, useState, type ReactNode, type TouchEvent as RTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import type { VideoStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

const STATUS_STYLE: Record<VideoStatus, string> = {
  script: 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100',
  building: 'border-violet-300/50 bg-violet-400/15 text-violet-100',
  pending: 'border-amber-300/50 bg-amber-400/15 text-amber-100',
  approved: 'border-sky-300/50 bg-sky-400/15 text-sky-100',
  publishing: 'border-violet-300/50 bg-violet-400/15 text-violet-100',
  sent: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100',
  posted: 'border-emerald-300/50 bg-emerald-400/25 text-emerald-50',
  rejected: 'border-white/15 bg-white/5 text-slate-300',
  failed: 'border-red-300/50 bg-red-400/15 text-red-100',
};
const STATUS_ICON: Record<VideoStatus, string> = { script: '✎', building: '⚙', pending: '◷', approved: '✓', publishing: '↑', sent: '✓', posted: '★', rejected: '✕', failed: '!' };

/** Status with an icon and words (never colour alone). `onMedia`: a darker glass so it reads over a thumbnail. */
export function StatusChip({ s, onMedia = false }: { s: VideoStatus; onMedia?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[s]} ${onMedia ? '!items-start !bg-ink-950/75 leading-tight shadow-lg backdrop-blur-md' : ''}`}>
      <span aria-hidden="true">{STATUS_ICON[s]}</span>
      <span>{STATUS_LABEL[s]}</span>
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)}>
      <span aria-hidden="true">{on ? '✓' : ''}</span>
    </button>
  );
}

/**
 * Sliding segmented control: a glowing thumb springs to the picked option.
 * `role`: 'tablist' (tabs, aria-selected) or 'group' (buttons, aria-pressed).
 */
export function Seg<T extends string>({ value, options, onChange, label, role = 'group', className = '' }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; role?: 'tablist' | 'group'; className?: string }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={`seg ${className}`} role={role} aria-label={label}>
      <span aria-hidden="true" className="seg-thumb" style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          {...(role === 'tablist' ? { role: 'tab', 'aria-selected': o.id === value } : { 'aria-pressed': o.id === value })}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-slate-100">{label}</p>
        {hint && <p className="text-xs leading-snug text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, children, right }: { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card space-y-3">
      {(title || right) && (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Loading placeholder with a soft shimmer. */
export const Skeleton = ({ className = '' }: { className?: string }) => <div aria-hidden="true" className={`skeleton ${className}`} />;

/** A friendly "nothing here yet" block: glowing icon, title, words. */
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <section className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div aria-hidden="true" className="relative mb-1 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/15 via-violet-500/15 to-fuchsia-500/15 text-3xl shadow-[0_0_40px_-8px_rgba(167,139,250,0.7)]">
        {icon}
      </div>
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      {children && <div className="max-w-sm text-sm text-slate-400">{children}</div>}
    </section>
  );
}

/* ---------- Sheets: rendered in document.body, slide up from the bottom on phones ---------- */

const openSheets: (() => void)[] = [];
/** Closes the sheet on top, if any (the Android back button). True when one was closed. */
export function closeTopSheet(): boolean {
  const close = openSheets[openSheets.length - 1];
  if (!close) return false;
  close();
  return true;
}

/**
 * A panel over the page. Phones: slides up from the bottom (drag the top bar down to close).
 * Wide screens: a centred window. Escape, the backdrop or `onClose` close it.
 */
export function Sheet({ onClose, label, top, children }: { onClose: () => void; label: string; top?: ReactNode; children: ReactNode }) {
  const [closing, setClosing] = useState<false | 'slide' | 'drag'>(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const close = useRef((_how?: 'drag') => undefined as void);
  close.current = (how) => {
    if (closing) return;
    setClosing(how ?? 'slide');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(onClose, reduce ? 0 : 200);
  };
  useEffect(() => {
    const fn = () => close.current();
    openSheets.push(fn);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openSheets[openSheets.length - 1] === fn && fn();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      openSheets.splice(openSheets.indexOf(fn), 1);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const onTouchStart = (e: RTouchEvent) => (drag.current = { y: e.touches[0].clientY, dy: 0 });
  const onTouchMove = (e: RTouchEvent) => {
    if (!drag.current || !panel.current || window.innerWidth >= 768) return;
    drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    panel.current.style.transition = 'none';
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    panel.current.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    if (d.dy > 110) {
      panel.current.style.transition = 'transform 0.2s ease-in';
      panel.current.style.transform = 'translateY(100%)';
      close.current('drag');
    } else panel.current.style.transform = 'translateY(0)';
  };

  return createPortal(
    <>
      <div className={`sheet-backdrop ${closing ? 'is-closing' : ''}`} onClick={() => close.current()} aria-hidden="true" />
      <div ref={panel} className={`sheet ${closing === 'slide' ? 'is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="shrink-0 cursor-grab touch-none px-4 pb-2 pt-2.5 md:px-6 md:pt-4" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-white/25 md:hidden" />
          <div className="flex min-h-[44px] items-center justify-between gap-2">
            {top}
            <button type="button" className="btn !min-h-[40px] !w-10 !px-0" aria-label="Close" onClick={() => close.current()}>✕</button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/* ---------- Tab bar: floating at the bottom on phones, in the header on wide screens ---------- */

const ICONS: Record<string, ReactNode> = {
  Videos: <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM10 9v6l5-3z" />,
  Settings: <path d="M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4" />,
  Guide: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H18M9 8h5" />,
};
export function TabIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** `place`: 'bottom' (phones), 'top' (header, wide screens) or 'demo' (drawn in the Guide, still). */
export function TabBar<T extends string>({ tabs, active, onChange, place }: { tabs: readonly T[]; active: T; onChange: (t: T) => void; place: 'bottom' | 'top' | 'demo' }) {
  const i = Math.max(0, tabs.indexOf(active));
  const inset = place === 'top' ? 8 : 12;
  const nav = (
    <div className={`tabs ${place === 'top' ? 'tabs-top' : ''}`}>
      <span aria-hidden="true" className="tab-pill" style={{ width: `calc((100% - ${inset}px) / ${tabs.length})`, transform: `translateX(${i * 100}%)` }} />
      {tabs.map((t) => (
        <button key={t} type="button" className="tab" onClick={() => onChange(t)} aria-current={t === active ? 'page' : undefined}>
          <TabIcon name={t} />
          <span>{t}</span>
        </button>
      ))}
    </div>
  );
  if (place === 'top') return <nav aria-label="Main">{nav}</nav>;
  return <nav aria-label={place === 'demo' ? 'Example tab bar' : 'Main'} className={`tabbar ${place === 'demo' ? 'tabbar-demo' : 'md:hidden'}`}>{nav}</nav>;
}

export type ToastKind = 'success' | 'error' | 'info';
let push: (kind: ToastKind, msg: string) => void = () => undefined;
export const toast = (kind: ToastKind, msg: string) => push(kind, msg);

const TOAST_ICON: Record<ToastKind, string> = { success: '✓', error: '!', info: 'i' };
export function Toasts() {
  const [items, setItems] = useState<{ id: number; kind: ToastKind; msg: string }[]>([]);
  useEffect(() => {
    push = (kind, msg) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, kind, msg }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
    };
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-3" style={{ top: 'calc(var(--safe-top) + 10px)' }} aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast-in pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm shadow-[0_12px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl ${t.kind === 'error' ? 'border-red-300/40 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-300/40 bg-emerald-950/90 text-emerald-100' : 'border-white/15 bg-slate-900/90 text-slate-100'}`}>
          <span aria-hidden="true" className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current font-mono text-[11px] font-bold">{TOAST_ICON[t.kind]}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

import { useEffect, useState } from 'react';
import { TabBar, Toasts, toast } from './components/ui';
import { Videos } from './pages/Videos';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Review } from './pages/Review';
import { Privacy, Terms } from './pages/Legal';
import { getCode, setCode } from './lib/api';

const TABS = ['Videos', 'Settings', 'Guide'] as const;
type Tab = (typeof TABS)[number];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" className="shrink-0 drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]">
      <defs>
        <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" /><stop offset="0.55" stopColor="#a78bfa" /><stop offset="1" stopColor="#f0abfc" /></linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#0b1026" stroke="url(#lg)" strokeOpacity="0.7" />
      <path d="M12 9v14l11-7z" fill="url(#lg)" />
    </svg>
  );
}

function AccessGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="page-in mx-auto mt-10 max-w-sm card space-y-3 sm:mt-16">
      <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-2xl">🔑</div>
      <h2 className="text-xl font-semibold">Enter your access code</h2>
      <p className="text-sm text-slate-400">The code you set as <code>APP_ACCESS_TOKEN</code> in Netlify. It is saved on this device only.</p>
      <input className="input w-full" type="password" autoComplete="current-password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && (setCode(v), onDone())} aria-label="Access code" />
      <button className="btn-primary w-full" disabled={!v} onClick={() => (setCode(v), onDone())}>Continue</button>
    </div>
  );
}

/** Shared from the phone's Share menu (/share?title=&text=&url=): keep the link for "Make a video now". */
function takeShare(): void {
  if (!window.location.pathname.startsWith('/share')) return;
  const q = new URLSearchParams(window.location.search);
  const all = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' ');
  const link = all.match(/https?:\/\/\S+/)?.[0];
  const shared = (link ?? (q.get('title') || q.get('text') || '')).trim().slice(0, 300);
  try {
    if (shared) sessionStorage.setItem('tt.share', shared);
  } catch { /* private mode */ }
  window.history.replaceState(null, '', '/');
}

export default function App() {
  useState(takeShare);
  const path = window.location.pathname;
  const review = path.match(/^\/review\/([\w-]+)/);
  const legal = path.startsWith('/terms') ? 'terms' : path.startsWith('/privacy') ? 'privacy' : null;
  const [tab, setTab] = useState<Tab>(path.startsWith('/settings') ? 'Settings' : path.startsWith('/guide') ? 'Guide' : 'Videos');
  const [hasCode, setHasCode] = useState(!!getCode());

  // Back from TikTok's, Google's or Facebook's login page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('connected');
    const r = q.get('tiktok') ?? q.get('result');
    if (!r) return;
    const name = p === 'youtube' ? 'YouTube' : p === 'meta' ? 'Facebook & Instagram' : 'TikTok';
    toast(r === 'ok' ? 'success' : 'error', r === 'ok' ? `${name} connected.` : `${name} was not connected: ${r === 'expired' ? 'the login took too long, try again' : r}`);
    window.history.replaceState(null, '', '/settings');
  }, []);
  useEffect(() => {
    const onUnauth = () => setHasCode(false);
    window.addEventListener('tt-unauthorized', onUnauth);
    return () => window.removeEventListener('tt-unauthorized', onUnauth);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, '', t === 'Videos' ? '/' : `/${t.toLowerCase()}`);
  };

  const bar = !review && !legal;
  return (
    <div className={`min-h-screen ${bar ? 'with-bar' : ''}`}>
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-950/70 backdrop-blur-xl" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="mx-auto flex h-[52px] max-w-[1400px] items-center gap-2.5 px-4 md:h-16 lg:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Trend Videos, home" onClick={(e) => { if (bar) { e.preventDefault(); go('Videos'); } }}>
            <Logo />
            <span className="truncate whitespace-nowrap font-display text-[17px] font-semibold tracking-tight">Trend <span className="neon-text">Videos</span></span>
          </a>
          {bar && <div className="ml-auto hidden md:block"><TabBar tabs={TABS} active={tab} onChange={go} place="top" /></div>}
        </div>
      </header>
      <main key={review || legal ? 'page' : tab} className="page-in mx-auto max-w-[1400px] px-4 pb-10 pt-4 sm:pt-6 lg:px-6">
        {legal ? (
          legal === 'terms' ? <Terms /> : <Privacy />
        ) : review ? (
          <Review id={review[1]} sig={new URLSearchParams(window.location.search).get('sig') ?? ''} />
        ) : tab === 'Guide' ? (
          <Guide />
        ) : !hasCode ? (
          <AccessGate onDone={() => setHasCode(true)} />
        ) : tab === 'Videos' ? (
          <Videos />
        ) : (
          <Settings />
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-slate-500">
        <a className="hover:text-slate-300" href="/terms">Terms of Service</a> · <a className="hover:text-slate-300" href="/privacy">Privacy Policy</a>
        {legal && <> · <a className="hover:text-slate-300" href="/">Back to the app</a></>}
      </footer>
      {bar && <TabBar tabs={TABS} active={tab} onChange={go} place="bottom" />}
    </div>
  );
}

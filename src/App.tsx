import { useEffect, useState } from 'react';
import { Toasts, toast } from './components/ui';
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
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
      <rect width="32" height="32" rx="8" fill="#0d1328" stroke="rgba(255,255,255,0.12)" />
      <path d="M12 9v14l11-7z" fill="url(#lg)" />
    </svg>
  );
}

function AccessGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('');
  return (
    <div className="mx-auto mt-16 max-w-sm card space-y-3">
      <h2 className="text-xl font-semibold">Enter your access code</h2>
      <p className="text-sm text-slate-400">The code you set as <code>APP_ACCESS_TOKEN</code> in Netlify. It is saved on this device only.</p>
      <input className="input w-full" type="password" autoComplete="current-password" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && (setCode(v), onDone())} aria-label="Access code" />
      <button className="btn-primary w-full" disabled={!v} onClick={() => (setCode(v), onDone())}>Continue</button>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  const review = path.match(/^\/review\/([\w-]+)/);
  const legal = path.startsWith('/terms') ? 'terms' : path.startsWith('/privacy') ? 'privacy' : null;
  const [tab, setTab] = useState<Tab>(path.startsWith('/settings') ? 'Settings' : path.startsWith('/guide') ? 'Guide' : 'Videos');
  const [hasCode, setHasCode] = useState(!!getCode());

  // Back from TikTok's login page.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('tiktok');
    if (!r) return;
    toast(r === 'ok' ? 'success' : 'error', r === 'ok' ? 'TikTok connected.' : `TikTok was not connected: ${r === 'expired' ? 'the login took too long, try again' : r}`);
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

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/75 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-4">
          <Logo />
          <span className="hidden whitespace-nowrap font-display text-lg font-semibold tracking-tight min-[400px]:inline">Trend Videos</span>
          {!review && !legal && (
            <nav className="ml-auto flex gap-1" aria-label="Main">
              {TABS.map((t) => (
                <button key={t} onClick={() => go(t)} aria-current={tab === t ? 'page' : undefined} className={`rounded-lg px-2.5 py-1.5 text-sm transition sm:px-3 ${tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100'}`}>
                  {t}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 pb-12 pt-4 sm:px-4 lg:px-6">
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
    </div>
  );
}

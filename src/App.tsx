import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { isNative } from './lib/native';
import { startAppPush } from './lib/appPush';
import { AppUpdateCheck } from './components/AppUpdate';
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

  // Android app: notifications (shown at the top while the app is open), and the phone's back button:
  // a video page or another tab goes back to Videos, then the app goes to the background.
  useEffect(() => startAppPush((title, body) => toast('info', body ? `${title}: ${body}` : title)), []);
  const where = useRef({ tab, page: !!(review || legal) });
  where.current = { tab, page: !!(review || legal) };
  useEffect(() => {
    if (!isNative()) return;
    const h = NativeApp.addListener('backButton', () => {
      if (where.current.page) window.location.href = '/';
      else if (where.current.tab !== 'Videos') go('Videos');
      else void NativeApp.minimizeApp();
    });
    return () => void h.then((x) => x.remove());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/75 backdrop-blur-xl" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top))' }}>
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
        <AppUpdateCheck />
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
      <footer className="pb-8 text-center text-xs text-slate-500" style={{ paddingBottom: 'calc(2rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        <a className="hover:text-slate-300" href="/terms">Terms of Service</a> · <a className="hover:text-slate-300" href="/privacy">Privacy Policy</a>
        {legal && <> · <a className="hover:text-slate-300" href="/">Back to the app</a></>}
      </footer>
    </div>
  );
}

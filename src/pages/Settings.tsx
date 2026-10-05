import { useEffect, useState } from 'react';
import { api, setCode, type Status } from '../lib/api';
import type { AppSettings } from '../lib/types';
import { TONE_LABEL } from '../lib/types';
import { Card, Field, Toggle, toast } from '../components/ui';

export function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [topic, setTopic] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.settings(), api.status()]).then(([a, b]) => (setS(a), setSt(b))).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const save = async (patch: Partial<AppSettings>) => {
    if (!s) return;
    setS({ ...s, ...patch });
    try {
      setS(await api.saveSettings(patch));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const addTopic = () => {
    const t = topic.trim();
    if (!s || !t || s.topics.includes(t)) return setTopic('');
    if (s.topics.length >= 8) return toast('error', 'Up to 8 topics.');
    void save({ topics: [...s.topics, t] });
    setTopic('');
  };
  const connect = async () => {
    try {
      window.location.href = (await api.tiktokStart()).url;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect TikTok? Approved videos will then be yours to download and post.')) return;
    await api.tiktokDisconnect().catch(() => undefined);
    setSt((x) => (x ? { ...x, tiktok: { connected: false } } : x));
  };

  if (err) return <p className="card text-red-200">{err}</p>;
  if (!s || !st) return <p className="text-slate-400"><span className="spinner" /> Loading…</p>;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
      <Card title="What to make" subtitle="Saved right away">
        <Field label="Make videos every day" hint="Off = only when you tap 'Make a video now'.">
          <Toggle on={s.enabled} onChange={(v) => void save({ enabled: v })} label="Make videos every day" />
        </Field>
        <Field label="Videos per day">
          <select className="input w-28" value={s.perDay} onChange={(e) => void save({ perDay: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <div className="space-y-2 py-1.5">
          <p className="text-sm text-slate-200">Topics</p>
          <p className="text-xs text-slate-500">Leave empty for whatever is trending today. Add topics (like "tech", "stocks", "soccer") to focus on today's news about them first.</p>
          <div className="flex gap-2">
            <input className="input w-full" placeholder="Add a topic" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTopic()} aria-label="Topic" />
            <button className="btn" onClick={addTopic}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.topics.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm">
                {t}
                <button className="px-1 text-slate-400 hover:text-red-300" aria-label={`Remove ${t}`} onClick={() => void save({ topics: s.topics.filter((x) => x !== t) })}>✕</button>
              </span>
            ))}
            {!s.topics.length && <span className="text-xs text-slate-500">General trends</span>}
          </div>
        </div>
        <Field label="Country" hint="Which country's trends and news.">
          <select className="input w-28" value={s.country} onChange={(e) => void save({ country: e.target.value })}>
            {['US', 'GB', 'CA', 'AU', 'IE', 'NZ'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </Card>

      <Card title="How it sounds" subtitle="Voice and style">
        <Field label="Voice">
          <select className="input w-36" value={s.voice} onChange={(e) => void save({ voice: e.target.value as AppSettings['voice'] })}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
        <Field label="Style">
          <select className="input w-44" value={s.tone} onChange={(e) => void save({ tone: e.target.value as AppSettings['tone'] })}>
            {Object.entries(TONE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Length">
          <select className="input w-36" value={s.maxSeconds} onChange={(e) => void save({ maxSeconds: Number(e.target.value) })}>
            {[30, 45, 60].map((n) => <option key={n} value={n}>about {n}s</option>)}
          </select>
        </Field>
      </Card>

      <Card title="Review email" subtitle="Each new video is emailed to you with a link to approve or reject it">
        <Field label="Send to">
          <input className="input w-full sm:w-64" type="email" placeholder="you@example.com" defaultValue={s.notifyEmail} onBlur={(e) => e.target.value !== s.notifyEmail && void save({ notifyEmail: e.target.value.trim() })} />
        </Field>
      </Card>

      <Card title="TikTok" subtitle="Approved videos go to your TikTok drafts">
        {!st.ready.tiktokApp ? (
          <p className="text-sm text-slate-300">Not set up yet: add <code>TIKTOK_CLIENT_KEY</code> and <code>TIKTOK_CLIENT_SECRET</code> in Netlify once TikTok approves your developer app (see the Guide). Until then, approve, download and post yourself.</p>
        ) : st.tiktok.connected && !st.tiktok.expired ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-emerald-200">✓ Connected{st.tiktok.name ? ` as ${st.tiktok.name}` : ''}</p>
            <button className="btn" onClick={() => void disconnect()}>Disconnect</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">{st.tiktok.expired ? 'The TikTok login expired.' : 'Not connected.'}</p>
            <button className="btn-primary" onClick={() => void connect()}>Connect TikTok</button>
          </div>
        )}
      </Card>

      <Card title="Cost control">
        <Field label="Most AI scripts per day" hint={`Each video uses 1 AI call (about 1 to 4 cents). Used today: ${st.ai.used}.`}>
          <input className="input w-24" type="number" min={1} max={30} value={s.aiDailyLimit} onChange={(e) => void save({ aiDailyLimit: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} />
        </Field>
      </Card>

      <Card title="This device">
        <Field label="Access code" hint="Saved on this device only.">
          <button className="btn" onClick={() => (setCode(''), window.location.reload())}>Forget it</button>
        </Field>
      </Card>
    </div>
  );
}

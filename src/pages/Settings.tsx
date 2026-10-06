import { useEffect, useState } from 'react';
import { api, setCode, type Status } from '../lib/api';
import type { AppSettings } from '../lib/types';
import { TONE_LABEL, VOICE_LABEL } from '../lib/types';
import { Card, Field, Toggle, toast } from '../components/ui';
import { NichePicker } from '../components/NichePicker';

export function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
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
      <div className="lg:col-span-2">
        <Card title="My channel" subtitle="What your videos are about. Sticking to one niche helps TikTok find the right viewers.">
          <NichePicker value={s.niche} onChange={(n) => void save({ niche: n })} />
        </Card>
      </div>
      <Card title="What to make" subtitle="Saved right away">
        <Field label="Make videos every day" hint="Off = only when you tap 'Make a video now'.">
          <Toggle on={s.enabled} onChange={(v) => void save({ enabled: v })} label="Make videos every day" />
        </Field>
        <Field label="Videos per day">
          <select className="input w-28" value={s.perDay} onChange={(e) => void save({ perDay: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Country" hint="Which country's trends and news.">
          <select className="input w-28" value={s.country} onChange={(e) => void save({ country: e.target.value })}>
            {['US', 'GB', 'CA', 'AU', 'IE', 'NZ'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </Card>

      <Card title="How it sounds" subtitle="Voice and style">
        <Field label="Voice">
          <select className="input w-full max-w-[16rem]" value={s.voice === 'female' ? 'af_heart' : s.voice === 'male' ? 'am_michael' : s.voice} onChange={(e) => void save({ voice: e.target.value as AppSettings['voice'] })}>
            {Object.entries(VOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
        <Field label="Soft background music" hint="Off is best if you add a trending TikTok sound when posting (TikTok shows those videos to more people). On: a quiet original tune plays under the voice and gets softer while it speaks.">
          <Toggle on={s.music} onChange={(v) => void save({ music: v })} label="Soft background music" />
        </Field>
      </Card>

      <Card title="Auto clean-up" subtitle="Saves storage: deletes old video files, keeps their text">
        <Field label="Delete old video files" hint="Only finished videos (posted, rejected, failed or sent to TikTok). Waiting and approved videos are never deleted.">
          <Toggle on={s.cleanup.enabled} onChange={(v) => void save({ cleanup: { ...s.cleanup, enabled: v } })} label="Delete old video files" />
        </Field>
        {s.cleanup.enabled && (
          <Field label="After">
            <select className="input w-32" value={s.cleanup.days} onChange={(e) => void save({ cleanup: { ...s.cleanup, days: Number(e.target.value) } })}>
              {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} days</option>)}
            </select>
          </Field>
        )}
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

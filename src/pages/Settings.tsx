import { useEffect, useState } from 'react';
import { api, setCode, type Status } from '../lib/api';
import { Card, Field, Toggle, toast } from '../components/ui';
import { useSettings } from '../lib/useSettings';
import { PhonePush } from '../components/PhonePush';
import { SeriesView } from '../components/DailySeries';
import type { YouTubePrivacy } from '../lib/types';

const YT_LABEL: Record<YouTubePrivacy, string> = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };
const YT_HINT: Record<YouTubePrivacy, string> = {
  public: 'Public: it goes live as a Short by itself once YouTube has processed it (a few minutes).',
  unlisted: 'Unlisted: only people with the link can watch it.',
  private: 'Private: only you; make it public in YouTube Studio.',
};

export function Settings() {
  const { settings: s, setSettings: setS, save } = useSettings();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [making, setMaking] = useState(false);
  const makeSeries = async () => {
    setMaking(true);
    try {
      toast('info', (await api.makeNow({ extras: ['series'] })).message);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setMaking(false);
    }
  };

  useEffect(() => {
    Promise.all([api.settings(), api.status()]).then(([a, b]) => (setS(a), setSt(b))).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const connect = async () => {
    try {
      window.location.href = (await api.tiktokStart()).url;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect TikTok? Approved videos will then be yours to download and post.')) return;
    try {
      await api.tiktokDisconnect();
      setSt((x) => (x ? { ...x, tiktok: { connected: false } } : x));
    } catch (e) {
      toast('error', `Could not disconnect: ${e instanceof Error ? e.message : e}`);
    }
  };

  // YouTube (Google login) and Facebook & Instagram (one Meta login).
  const connectOther = async (p: 'youtube' | 'meta') => {
    try {
      window.location.href = (await api.connectStart(p)).url;
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const disconnectOther = async (p: 'youtube' | 'meta') => {
    if (!window.confirm(`Disconnect ${p === 'youtube' ? 'YouTube' : 'Facebook & Instagram'}? Videos already sent there stay there.`)) return;
    try {
      await api.connectDisconnect(p);
      setSt((x) => (!x ? x : p === 'youtube' ? { ...x, youtube: { connected: false } } : { ...x, meta: { connected: false } }));
    } catch (e) {
      toast('error', `Could not disconnect: ${e instanceof Error ? e.message : e}`);
    }
  };

  if (err) return <p className="card text-red-200">{err}</p>;
  if (!s || !st) return <p className="text-slate-400"><span className="spinner" /> Loading…</p>;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
      <p className="text-sm text-slate-400 lg:col-span-2">Your niche, voice, captions and effects are in the <b>Videos</b> tab (My channel, Video style &amp; effects). This page is for how the app runs.</p>
      <Card title="Schedule" subtitle="Saved right away">
        <Field label="Make videos every day" hint="Off = only when you tap 'Make a video now'.">
          <Toggle on={s.enabled} onChange={(v) => void save({ enabled: v })} label="Make videos every day" />
        </Field>
        <Field label="Videos per day">
          <select className="input w-28" value={s.perDay} onChange={(e) => void save({ perDay: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        {s.enabled && <SeriesView key={s.series.subject} v={s.series} onChange={(series) => void save({ series })} onUnuse={(key, name) => void save({ series: { ...s.series, used: { ...s.series.used, [key]: (s.series.used[key] ?? []).filter((x) => x !== name) } }, seriesUnuse: { key, name } })} onMake={() => void makeSeries()} busy={making} />}
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
            {!st.tiktok.canList && (
              <div className="w-full space-y-1.5 rounded-lg border border-amber-300/40 bg-amber-400/10 p-2 text-sm text-amber-100">
                <p>🔗 New: after you post, the app can find your TikTok post and keep its link and views. Connect once more to allow it (read-only).</p>
                <button className="btn" onClick={() => void connect()}>Connect again</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">{st.tiktok.expired ? 'The TikTok login expired.' : 'Not connected.'}</p>
            <button className="btn-primary" onClick={() => void connect()}>Connect TikTok</button>
          </div>
        )}
      </Card>

      <Card title="YouTube Shorts" subtitle={`A Send button on approved videos: uploads them as ${YT_LABEL[s.youtubePrivacy ?? 'public']}`}>
        {!st.ready.youtubeApp ? (
          <p className="text-sm text-slate-300">Not set up yet: add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Netlify and GitHub (see the Guide, "Other platforms").</p>
        ) : st.youtube.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-emerald-200">✓ Connected{st.youtube.name ? ` to ${st.youtube.name}` : ''}</p>
            <button className="btn" onClick={() => void disconnectOther('youtube')}>Disconnect</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">Not connected.</p>
            <button className="btn-primary" onClick={() => void connectOther('youtube')}>Connect YouTube</button>
          </div>
        )}
        {st.ready.youtubeApp && (
          <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="yt-privacy" className="text-sm">When you tap Send, the video is</label>
              <select id="yt-privacy" className="input w-36" value={s.youtubePrivacy ?? 'public'} onChange={(e) => void save({ youtubePrivacy: e.target.value as YouTubePrivacy })}>
                {(Object.keys(YT_LABEL) as YouTubePrivacy[]).map((k) => <option key={k} value={k}>{YT_LABEL[k]}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-400">{YT_HINT[s.youtubePrivacy ?? 'public']} Until Google audits your app, YouTube keeps every upload Private anyway (the video card tells you; see the Guide, “YouTube audit”).</p>
          </div>
        )}
      </Card>

      <Card title="Facebook & Instagram Reels" subtitle="One login for both. Facebook: saved as a draft. Instagram: posted after you confirm">
        {!st.ready.metaApp ? (
          <p className="text-sm text-slate-300">Not set up yet: add <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in Netlify (see the Guide, "Other platforms").</p>
        ) : st.meta.connected ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-emerald-200">✓ Facebook Page: {st.meta.page}</p>
              <button className="btn" onClick={() => void disconnectOther('meta')}>Disconnect</button>
            </div>
            <p className={`text-sm ${st.meta.instagram ? 'text-emerald-200' : 'text-amber-200'}`}>
              {st.meta.instagram ? `✓ Instagram: ${st.meta.instagram === 'connected' ? 'connected' : `@${st.meta.instagram}`}` : 'No Instagram account is linked to this Page. Link a Business or Creator account to it in Instagram, then connect again.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-300">Not connected.</p>
            <button className="btn-primary" onClick={() => void connectOther('meta')}>Connect Facebook &amp; Instagram</button>
          </div>
        )}
      </Card>

      <Card title="Cost control">
        <Field label="Most AI scripts per day" hint={`Each video uses 1 AI call (about 2 to 5 cents). Used today: ${st.ai.used}.`}>
          <input key={s.aiDailyLimit} className="input w-24" type="number" min={1} max={30} defaultValue={s.aiDailyLimit} aria-label="Most AI scripts per day"
            onBlur={(e) => { const n = Math.min(30, Math.max(1, Math.round(Number(e.target.value)) || s.aiDailyLimit)); e.target.value = String(n); if (n !== s.aiDailyLimit) void save({ aiDailyLimit: n }); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </Field>
      </Card>

      <PhonePush />

      <Card title="This device">
        <Field label="Access code" hint="Saved on this device only.">
          <button className="btn" onClick={() => (setCode(''), window.location.reload())}>Forget it</button>
        </Field>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { call } from '../lib/api';
import { Card, Field, toast } from './ui';

interface PushStatus { firebase: string | null; phones: number }
export const pushAction = <T,>(body: Record<string, unknown>) => call<T>('/api/push', { method: 'POST', body: JSON.stringify(body) });

/** Settings → Phone notifications: the Firebase key (uploaded once, from a computer) for the Android app's alerts. */
export function PhonePush() {
  const [st, setSt] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState('');
  const load = () => call<PushStatus>('/api/push').then(setSt, () => undefined);
  useEffect(() => void load(), []);
  const run = async (what: string, f: () => Promise<void>) => {
    setBusy(what);
    try {
      await f();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card title="Phone notifications" subtitle="For the Android app: 'New video to review' on your phone">
      <Field label="Firebase key" hint={st?.firebase ? `Saved (project ${st.firebase}). ${st.phones} phone(s) get notifications.` : 'Upload your Firebase key file once (from your computer). See the Guide: Android app.'}>
        <div className="flex flex-wrap gap-2">
          <label className={`btn ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            {busy === 'key' ? <><span className="spinner" /> Saving…</> : st?.firebase ? 'Replace key file' : 'Upload key file'}
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void run('key', async () => {
                let key: unknown;
                try { key = JSON.parse(await f.text()); } catch { throw new Error('That file is not a Firebase key file (.json).'); }
                const r = await pushAction<{ firebase: string }>({ action: 'firebase-key', key });
                toast('success', `Firebase key saved (project ${r.firebase}).`);
                await load();
              });
            }} />
          </label>
          {st?.firebase && <button className="btn" disabled={!!busy} onClick={() => window.confirm('Remove the Firebase key? Phones stop getting notifications.') && void run('rm', async () => { await pushAction({ action: 'firebase-key', key: null }); toast('success', 'Firebase key removed.'); await load(); })}>Remove</button>}
        </div>
      </Field>
    </Card>
  );
}

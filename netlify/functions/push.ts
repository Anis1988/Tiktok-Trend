import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { fcmAll, firebaseKey, getFcmTokens, parseFirebaseKey, removeFcmToken, saveFcmToken, saveFirebaseKey } from '../lib/fcm';

export const config = { path: '/api/push' };

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe-app'), token: z.string().min(20).max(4096) }),
  z.object({ action: z.literal('unsubscribe-app'), token: z.string().max(4096) }),
  z.object({ action: z.literal('firebase-key'), key: z.record(z.string(), z.unknown()).nullable() }),
  z.object({ action: z.literal('test') }),
]);

// GET  /api/push -> {firebase: project id or null, phones}
// POST /api/push {action} -> register / remove this phone, save / remove the Firebase key, send a test
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'push', 20);
  if (blocked) return blocked;
  try {
    if (req.method === 'GET') return json({ firebase: (await firebaseKey())?.project_id ?? null, phones: (await getFcmTokens()).length });
    if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
    let body: z.infer<typeof Post>;
    try {
      body = Post.parse(await req.json());
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
    switch (body.action) {
      case 'subscribe-app':
        if (!(await firebaseKey())) return json({ error: 'Phone notifications need the Firebase key: on the website, open Settings → Phone notifications and upload it.' }, 503);
        return json({ phones: await saveFcmToken(body.token) });
      case 'unsubscribe-app':
        await removeFcmToken(body.token);
        return json({ ok: true });
      case 'firebase-key': {
        if (body.key === null) return (await saveFirebaseKey(null), json({ firebase: null }));
        const k = parseFirebaseKey(body.key);
        if (!k) return json({ error: 'That is not a Firebase service account key file (it should contain "type": "service_account").' }, 400);
        await saveFirebaseKey(k);
        return json({ firebase: k.project_id });
      }
      case 'test': {
        const n = await fcmAll({ title: 'Trend Videos', body: 'Notifications work on this phone.', tag: 'test' });
        return n ? json({ sent: n }) : json({ error: 'No phone received it. Turn notifications on in the app first.' }, 400);
      }
    }
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
};

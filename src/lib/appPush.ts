import { PushNotifications } from '@capacitor/push-notifications';
import { call } from './api';
import { isNative } from './native';

/* Android app: phone notifications through Firebase ("New video to review" and so on). */
export const pushAction = <T,>(body: Record<string, unknown>) => call<T>('/api/push', { method: 'POST', body: JSON.stringify(body) });

const TOKEN_KEY = 'tt.appPushToken';
const savedToken = (): string => { try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
const keepToken = (t: string) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

/** The app was built with Firebase (google-services.json present when GitHub built it). */
export const appPushReady = () => isNative() && import.meta.env.VITE_FCM === '1';
export const appPushOn = () => appPushReady() && !!savedToken();

/** This phone's Firebase address (asks Android for it; it can change after an app update or reinstall). */
function phoneToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const subs = [
      PushNotifications.addListener('registration', (t) => { done(); resolve(t.value); }),
      PushNotifications.addListener('registrationError', (e) => { done(); reject(new Error(`Could not register for notifications: ${e.error}`)); }),
    ];
    const timer = setTimeout(() => { done(); reject(new Error('Android did not answer. Check the internet connection and try again.')); }, 20_000);
    const done = () => { clearTimeout(timer); subs.forEach((s) => void s.then((x) => x.remove())); };
    void PushNotifications.register().catch((e) => { done(); reject(e); });
  });
}

const channel = () => PushNotifications.createChannel({ id: 'alerts', name: 'Video alerts', description: 'New videos to review, TikTok drafts, failures', importance: 5, visibility: 1, vibration: true });

export async function enableAppPush(): Promise<void> {
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') throw new Error('Notifications were not allowed. Allow them in Android Settings → Apps → Trend Videos → Notifications, then try again.');
  await channel();
  const token = await phoneToken();
  await pushAction({ action: 'subscribe-app', token });
  keepToken(token);
}

export async function disableAppPush(): Promise<void> {
  const token = savedToken();
  if (token) await pushAction({ action: 'unsubscribe-app', token }).catch(() => undefined);
  await PushNotifications.unregister().catch(() => undefined);
  keepToken('');
}

/**
 * On app start: keeps the server's copy of this phone's address current, shows notifications that arrive while
 * the app is open, and opens the right page (e.g. the video to review) when a notification is tapped.
 */
export function startAppPush(onAlert: (title: string, body: string) => void): () => void {
  if (!appPushReady()) return () => undefined;
  const subs = [
    PushNotifications.addListener('pushNotificationReceived', (n) => onAlert(n.title ?? 'Trend Videos', n.body ?? '')),
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = String(a.notification.data?.url ?? '');
      if (url.startsWith('/') && !url.startsWith('//')) window.location.href = url;
    }),
  ];
  if (savedToken()) {
    void channel().then(phoneToken).then(async (t) => {
      if (t !== savedToken()) { await pushAction({ action: 'subscribe-app', token: t }); keepToken(t); }
    }).catch(() => undefined);
  }
  return () => subs.forEach((s) => void s.then((x) => x.remove()));
}

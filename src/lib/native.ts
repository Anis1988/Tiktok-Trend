import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** True inside the Android (later iPhone) app, false on the website. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * The app has no server of its own: it talks to the live website's server functions.
 * On the website the paths stay relative ("/api/…"), exactly as before.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'https://tiktok-trend.netlify.app';
export const apiUrl = (path: string): string => (isNative() && path.startsWith('/') ? API_BASE + path : path);

/** Logins (TikTok, Google, Facebook) open in the phone's browser in the app; on the website the page just goes there. */
export function openExternal(url: string): void {
  if (isNative()) void Browser.open({ url });
  else window.location.href = url;
}

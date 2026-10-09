import type { CapacitorConfig } from '@capacitor/cli';

/** The Android app (branch "android"): the same screens as the website, talking to the live site's server. */
const config: CapacitorConfig = {
  appId: 'app.tiktoktrend',
  appName: 'Trend Videos',
  webDir: 'build',
  backgroundColor: '#0d1328',
  plugins: {
    // Requests go through Android itself (not the web view), so the live server answers without CORS limits.
    CapacitorHttp: { enabled: true },
    // The app is dark: the phone's clock, battery and signal icons are shown light so they are easy to read.
    SystemBars: { style: 'DARK', initialViewportFitValueHint: 'cover' },
  },
};

export default config;

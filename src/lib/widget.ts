import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';
import { STATUS_LABEL, type VideoRecord } from './types';

/** The Android home-screen widget (native code in android/…/VideosWidget.java): the app sends it the latest words. */
interface WidgetData { date: string; big: string; label: string; title: string; status: string; series: string; waiting: boolean }
const Widget = registerPlugin<{ update: (d: WidgetData) => Promise<void> }>('Widget');

let last = '';
/** Called each time the video list is refreshed: waiting count, newest video, today's series name. */
export function pushWidget(videos: VideoRecord[]): void {
  if (!isNative()) return;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const waiting = videos.filter((v) => v.status === 'pending' || v.status === 'script').length;
  const newest = [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const series = videos.find((v) => v.series && v.status !== 'failed' && new Date(v.createdAt).toDateString() === d.toDateString());
  const data: WidgetData = {
    date: today, big: String(waiting), label: waiting === 1 ? 'video waiting' : 'videos waiting', waiting: waiting > 0,
    title: newest ? newest.title : 'No videos yet', status: newest ? STATUS_LABEL[newest.status] : '',
    series: series ? `📅 Series today: ${series.series!.pick}` : '',
  };
  const key = JSON.stringify(data);
  if (key === last) return;
  last = key;
  void Widget.update(data).catch(() => undefined);
}

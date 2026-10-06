/** Shared between the app, the Netlify functions and the video pipeline (GitHub Actions). */
import type { Niche } from './niches';

export type VideoStatus =
  | 'pending' // made, waiting for your review
  | 'approved' // you approved; TikTok not connected yet, so download and post it yourself
  | 'publishing' // being sent to your TikTok drafts
  | 'sent' // in your TikTok drafts: open TikTok to post it
  | 'posted' // you marked it as posted
  | 'rejected'
  | 'failed';

export interface Source {
  title: string;
  url: string;
  site?: string;
}

export interface VideoRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: VideoStatus;
  topic: string;
  title: string;
  hook: string;
  lines: string[]; // the voice-over, one line per scene
  caption: string; // TikTok description
  firstComment?: string; // a witty comment to post and pin under the video
  hashtags: string[];
  sources: Source[];
  durationSec: number;
  sizeBytes: number;
  voice: string;
  footage: { by: string; url: string; site?: string }[]; // stock video credits (Pixabay / Pexels)
  model: string;
  error?: string;
  fileRemovedAt?: string; // the video file was deleted by the auto clean-up (the text is kept)
  tiktok?: { publishId?: string; sentAt?: string; status?: string };
}

export type Tone = 'witty' | 'punchy' | 'explainer' | 'anchor';

/** Kokoro voices (natural, free). 'female' / 'male' are the older Piper choices, kept for saved settings. */
export type VoiceId = 'af_heart' | 'af_bella' | 'am_michael' | 'am_fenrir' | 'bf_emma' | 'bm_george' | 'female' | 'male';

export const VOICE_LABEL: Record<Exclude<VoiceId, 'female' | 'male'>, string> = {
  af_heart: 'Heart · warm female (US)',
  af_bella: 'Bella · bright female (US)',
  am_michael: 'Michael · male (US)',
  am_fenrir: 'Fenrir · deep male (US)',
  bf_emma: 'Emma · female (British)',
  bm_george: 'George · male (British)',
};

export interface AppSettings {
  enabled: boolean; // make videos on the daily schedule
  topics: string[]; // older setting, used only when no channel niche is set
  niche: Niche | null; // "My channel": category, subcategories, focus words; null = general trends
  country: string; // Google Trends country code
  voice: VoiceId;
  tone: Tone;
  music: boolean; // soft background music under the voice (off: add a TikTok sound when posting)
  cleanup: { enabled: boolean; days: number }; // delete video files of finished videos after this many days
  perDay: number; // videos per day (scheduled runs)
  maxSeconds: number;
  aiDailyLimit: number; // paid AI calls per day
  notifyEmail: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  topics: [],
  niche: null,
  country: 'US',
  voice: 'af_heart',
  tone: 'witty',
  music: false,
  cleanup: { enabled: true, days: 30 },
  perDay: 1,
  maxSeconds: 45,
  aiDailyLimit: 6,
  notifyEmail: '',
};

export const TONE_LABEL: Record<Tone, string> = {
  witty: 'Witty and clever',
  punchy: 'Fun and punchy',
  explainer: 'Calm explainer',
  anchor: 'News anchor',
};

export const STATUS_LABEL: Record<VideoStatus, string> = {
  pending: 'Waiting for you',
  approved: 'Approved · post it yourself',
  publishing: 'Sending to TikTok…',
  sent: 'In your TikTok drafts',
  posted: 'Posted',
  rejected: 'Rejected',
  failed: 'Failed',
};

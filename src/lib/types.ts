/** Shared between the app, the Netlify functions and the video pipeline (GitHub Actions). */

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
  hashtags: string[];
  sources: Source[];
  durationSec: number;
  sizeBytes: number;
  voice: string;
  footage: { by: string; url: string }[]; // Pexels credits
  model: string;
  error?: string;
  tiktok?: { publishId?: string; sentAt?: string; status?: string };
}

export type Tone = 'punchy' | 'explainer' | 'anchor';

export interface AppSettings {
  enabled: boolean; // make videos on the daily schedule
  topics: string[]; // e.g. ["tech", "stocks"]; empty = general trends
  country: string; // Google Trends country code
  voice: 'female' | 'male';
  tone: Tone;
  perDay: number; // videos per day (scheduled runs)
  maxSeconds: number;
  aiDailyLimit: number; // paid AI calls per day
  notifyEmail: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  topics: [],
  country: 'US',
  voice: 'female',
  tone: 'punchy',
  perDay: 1,
  maxSeconds: 45,
  aiDailyLimit: 6,
  notifyEmail: '',
};

export const TONE_LABEL: Record<Tone, string> = {
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

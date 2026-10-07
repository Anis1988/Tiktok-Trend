/** Shared between the app, the Netlify functions and the video pipeline (GitHub Actions). */
import type { Niche } from './niches';

export type VideoStatus =
  | 'script' // script written, waiting for you to check it before the video is built
  | 'building' // you tapped Build: the video is being made
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

/** One scene of a script: what is said, and what to show. */
export interface DraftLine {
  text: string;
  footage: string; // stock-footage search words
  keywords: string[]; // words that pop
  real?: string; // a real person / place / event to show (free photos and clips), e.g. "LeBron James"
  media?: string; // a clip from "My clips" chosen for this scene (its id), or "stock" to never use one
}

/** A clip or picture you uploaded ("My clips"), used when a scene mentions one of its tags. */
export interface MediaItem {
  id: string;
  name: string;
  tags: string[];
  kind: 'video' | 'image';
  type: string; // mime type
  size: number;
  parts: number; // stored in pieces of up to 4 MB
  thumb?: string; // small preview (data URL)
  createdAt: string;
  ready: boolean; // all pieces uploaded
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
  /** The script as data, so it can be edited and built later ("Check the script first"). */
  draft?: { lines: DraftLine[] };
  pick?: string; // category picked for this one video, e.g. "gaming:nintendo"
  topicVideo?: boolean; // a topic video (ranking, top 10, fun facts): written from well-known facts, not news
  fileRemovedAt?: string; // the video file was deleted by the auto clean-up (the text is kept)
  tiktok?: { publishId?: string; sentAt?: string; status?: string };
}

export interface VideoEffects {
  hookCard: boolean; // the hook in big letters for the first 2 seconds
  keywords: boolean; // key words pop in colour
  sfx: boolean; // whoosh between scenes, pop on the hook
  progress: boolean; // thin progress bar at the top
  nicheLook: boolean; // colours and picture tone of your category
  endCard: boolean; // "Follow for more ..." at the end
  realMedia: boolean; // real photos and clips (Wikimedia, NASA) with a credit line
  myClips: boolean; // use your own clips when a scene mentions their tags
}

export type CaptionColor = 'yellow' | 'cyan' | 'green' | 'pink' | 'white';

export const EFFECT_LABEL: Record<keyof VideoEffects, [string, string]> = {
  hookCard: ['Hook title card', 'The first line in big letters for the first 2 seconds, to stop people scrolling.'],
  keywords: ['Keyword pop', 'The 1 or 2 most important words of each sentence pop in colour.'],
  sfx: ['Sound effects', 'A soft whoosh between scenes and a pop on the hook.'],
  progress: ['Progress bar', 'A thin bar at the top shows how much is left, so people watch to the end.'],
  nicheLook: ['Niche look', 'Colours and picture tone that fit your category (neon for gaming, bold for sports…).'],
  endCard: ['End card', '"Follow for more …" for the last 2 seconds, with your name.'],
  realMedia: ['Real photos & clips', 'Free-to-use real photos and clips (Wikimedia, NASA) of the people, places and events mentioned, with a small credit.'],
  myClips: ['Use my clips', 'When a scene mentions a tag of one of your clips (My clips), that clip is shown.'],
};

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
  effects: VideoEffects;
  captionStyle: { color: CaptionColor; size: 'medium' | 'big' };
  endCardName: string; // shown on the end card, e.g. "@yourname" (optional)
  reviewScript: boolean; // write the script first; build the video only after you check it
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
  effects: { hookCard: true, keywords: true, sfx: true, progress: true, nicheLook: true, endCard: true, realMedia: true, myClips: true },
  captionStyle: { color: 'yellow', size: 'big' },
  endCardName: '',
  reviewScript: false,
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
  script: 'Script ready · check it',
  building: 'Building video…',
  pending: 'Waiting for you',
  approved: 'Approved · post it yourself',
  publishing: 'Sending to TikTok…',
  sent: 'In your TikTok drafts',
  posted: 'Posted',
  rejected: 'Rejected',
  failed: 'Failed',
};

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
  character?: string; // a fictional character to show, "Name | Work", e.g. "Levi Ackerman | Attack on Titan"
  object?: string; // a concrete thing to show a photo of, e.g. "red apple"
  label?: string; // big on-screen title for this scene, e.g. "#3 Levi Ackerman"
  quiz?: 'hide' | 'reveal'; // "Guess who?" videos: picture hidden (blurred) on this line, then shown sharp with a flash
  media?: string; // a clip from "My clips" chosen for this scene (its id), or "stock" to never use one
  chart?: { title: string; unit?: string; bars: { label: string; value: number }[] }; // an animated bar chart of the line's numbers
  map?: string; // a place to show on an animated map, e.g. "Japan", "Paris", "Gulf of Mexico"
  headline?: { title: string; site?: string }; // a real news headline shown as a card with its source
  timeline?: { title: string; events: { date: string; label: string }[] }; // "How we got here": an animated timeline
  versus?: { a: string; b: string }; // "This or that": two pictures side by side (each a real thing, person or object)
  verdict?: 'myth' | 'fact'; // "Myth vs Fact": a red ✗ MYTH or green ✓ FACT stamp on this line
  speaker?: 'A' | 'B'; // "Debate": which of the two voices says this line
  delivery?: 'hype' | 'calm'; // voice acting: faster and excited, or slower and serious (normal when empty)
  pause?: boolean; // voice acting: a short dramatic pause after this line (before a reveal or punchline)
  bigText?: string; // 1 to 4 words shown big, one at a time, when no picture fits the line
  comment?: { text: string; by?: string }; // reply videos: the viewer's comment as a bubble (first scene)
}

/** Extras you pick for one video ("Make a video now"). */
export type Extra = 'quiz' | 'facts' | 'myth' | 'versus' | 'debate' | 'fast' | 'cover' | 'long';
export const EXTRA_LABEL: Record<Extra, [string, string]> = {
  quiz: ['🎯 Guess who?', 'A quiz: the picture starts blurred with a big "?", a 3-second countdown, then a flash reveals who it is. Best with a subject, e.g. "Attack on Titan characters".'],
  facts: ['💡 Fun facts', 'Up to 10 surprising fun facts about your subject (someone or something), each with its picture and a "Fact #3" title.'],
  myth: ['✗✓ Myth vs Fact', '3 to 5 popular beliefs about the subject; each gets a big red ✗ MYTH or green ✓ FACT stamp with a boom, then the real answer. People love to argue in the comments.'],
  versus: ['🆚 This or That', 'Rounds of two pictures side by side ("A or B?"), with a fun reason for each. Ends asking viewers to comment A or B. Great for comments.'],
  debate: ['🗣️ Debate', 'Two different voices argue about your subject ("Levi is stronger!" "No way, Mikasa…"), each with their colour and their side\'s picture. Ends by asking viewers to pick a side.'],
  long: ['⏱️ Over 1 minute', 'Makes this video 65 to 75 seconds, still fast-paced. TikTok\'s Creator Rewards only pay for videos over 1 minute (check TikTok\'s current rules).'],
  fast: ['⚡ Fast pacing', 'Shorter lines and a quick zoom on the key word, so the picture changes every 2 to 3 seconds.'],
  cover: ['🖼️ Bold cover', 'The first frame is a poster with 2 to 5 big words, so it stands out on your profile and in search.'],
};

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
  extras?: Extra[]; // extras picked for this video (quiz, fast pacing, bold cover)
  cover?: string; // the big words on the cover (first frame), when "Bold cover" is on
  searchWords?: string[]; // what people would type in TikTok search to find this video
  fileRemovedAt?: string; // the video file was deleted by the auto clean-up (the text is kept)
  tiktok?: { publishId?: string; sentAt?: string; status?: string };
  recap?: boolean; // a weekly recap made from the week's videos
  episode?: number; // number in your series ("Daily Tech Drop #14")
  checks?: string[]; // quality check notes: what was fixed or could be better
  comment?: { text: string; by?: string }; // reply videos: the comment it answers
  /** Other platforms, each with its own Send button (after you approve). */
  platforms?: Partial<Record<PlatformId, PlatformPost>>;
  /** How it did: YouTube and Instagram are read automatically; TikTok numbers are typed in the app. */
  stats?: VideoStats;
}

export interface VideoStats {
  tiktok?: { views?: number; likes?: number; at: string };
  youtube?: { views: number; likes: number; comments: number; at: string };
  instagram?: { likes: number; comments: number; at: string };
}

/** Platforms besides TikTok. Facebook and Instagram share one Meta login. */
export type PlatformId = 'youtube' | 'facebook' | 'instagram';
export const PLATFORMS: PlatformId[] = ['youtube', 'facebook', 'instagram'];

export interface PlatformPost {
  state: 'sending' | 'sent' | 'failed';
  at: string; // when it started or finished
  id?: string; // the platform's video / post id
  url?: string; // where to see it
  error?: string;
}

export const PLATFORM_INFO: Record<PlatformId, { name: string; icon: string; button: string; sending: string; done: string; publicNow?: boolean }> = {
  youtube: { name: 'YouTube Shorts', icon: '▶', button: 'Send to YouTube (private)', sending: 'Sending to YouTube…', done: 'On YouTube as Private: open YouTube Studio to make it public.' },
  facebook: { name: 'Facebook Reels', icon: 'f', button: 'Send to Facebook (draft)', sending: 'Sending to Facebook…', done: 'A draft Reel on your Facebook Page: open Meta Business Suite → Content → Drafts to post it.' },
  instagram: { name: 'Instagram Reels', icon: '◎', button: 'Post to Instagram', sending: 'Posting to Instagram…', done: 'Posted on Instagram.', publicNow: true },
};

export interface VideoEffects {
  hookCard: boolean; // the hook in big letters for the first 2 seconds
  keywords: boolean; // key words pop in colour
  sfx: boolean; // whoosh between scenes, pop on the hook
  progress: boolean; // thin progress bar at the top
  nicheLook: boolean; // colours and picture tone of your category
  endCard: boolean; // "Follow for more ..." at the end
  realMedia: boolean; // real photos and clips (Wikimedia, NASA) with a credit line
  myClips: boolean; // use your own clips when a scene mentions their tags
  characters: boolean; // official pictures of anime / manga characters (AniList); copyrighted
  skin: boolean; // niche skin: gaming XP bar, manga panels and speed lines, sports scoreboard and match clock
  charts: boolean; // animated bar charts for numbers and maps for places, drawn by the app
  headlines: boolean; // the real news headline shown as a card with its source (news videos)
  loop: boolean; // the last line leads back into the first, so the video loops
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
  charts: ['Charts & maps', 'When the story has numbers (prices, scores, polls...), an animated bar chart shows them; when it happens somewhere, a map zooms to the place with a pin. Drawn by the app, free.'],
  headlines: ['Headline cards', 'News videos show the real headline once, as a clean card with the source name ("IN THE NEWS · Reuters"). Proof the story is real, and no article photos are used.'],
  loop: ['Loop ending', 'The last line leads straight back into the first, so the replay feels seamless and people watch twice (TikTok loves rewatches). Turn off End card for the smoothest loop.'],
  skin: ['Niche skin', 'An on-screen style that fits your niche: an XP bar and "LEVEL UP!" for gaming, manga panels and speed lines for anime, a scoreboard and match clock for sports.'],
  characters: ['Character pictures (official art, copyrighted)', 'Anime and manga characters are shown with their official picture (from AniList). These pictures belong to the studios: common in ranking videos, but a rights holder could claim one. You decide.'],
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
  seriesName: string; // e.g. "Daily Tech Drop": each video gets "#14" and the name with the hook (empty = off)
  weeklyRecap: boolean; // every Sunday, a "Top 5 this week" video made from the week's videos (no AI cost)
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
  effects: { hookCard: true, keywords: true, sfx: true, progress: true, nicheLook: true, endCard: true, realMedia: true, myClips: true, characters: true, charts: true, headlines: true, loop: true, skin: true },
  captionStyle: { color: 'yellow', size: 'big' },
  endCardName: '',
  reviewScript: false,
  perDay: 1,
  maxSeconds: 45,
  aiDailyLimit: 6,
  notifyEmail: '',
  seriesName: '',
  weeklyRecap: true,
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

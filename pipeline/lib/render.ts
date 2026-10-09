import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { durationOf, run, sizeOf } from './sh';
import { DEFAULT_LOOK, type Look } from '../../src/lib/niches';
import { alignLines, type Timing } from './align';
import { findFaces, type FaceInfo } from './faces';
import { fileURLToPath } from 'node:url';

export const W = 1080; // TikTok's native size: sharp on phones
export const H = 1920;
const FPS = 30;
const GAP = 0.12; // seconds of silence after each line (tight, like a real voice-over)
const FADE = 0.4; // transition between scenes
// Smooth transitions, taken in turn so the video keeps moving (a glide, a zoom, a soft fade…).
export const TRANSITIONS = ['smoothleft', 'zoomin', 'smoothup', 'fade', 'smoothright', 'circleopen', 'smoothdown'];
const TAIL = 0.5; // picture stays a moment after the last word
const END_CARD = 2.2; // seconds of end card after the last word
const COUNTDOWN = 3; // "Guess who?": seconds of 3-2-1 after each clue, before the answer
const FONT_DIR = process.env.CAPTION_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const BACKGROUNDS = [['0x1e1b4b', '0x0e7490'], ['0x0f172a', '0x7c3aed'], ['0x164e63', '0x1e3a8a'], ['0x3b0764', '0xbe185d'], ['0x14532d', '0x0f766e']];

export interface Scene {
  text: string;
  wav: string; // the spoken line
  clip: string | null; // stock video, or null for a moving colour background
  clipStart?: number; // start this many seconds into the clip
  keywords?: string[]; // words of this line that pop in colour
  image?: string | null; // a still photo (real photo or your picture), shown as a framed card over a blurred copy
  credit?: string; // small credit line during this scene (free-licence photos and clips)
  label?: string; // big title at the top during this scene, e.g. "#3 Levi Ackerman"
  quiz?: 'hide' | 'reveal'; // "Guess who?": picture blurred with a big "?", then shown sharp after a white flash
  verdict?: 'myth' | 'fact'; // "Myth vs Fact": a big red ✗ MYTH or green ✓ FACT stamps on screen mid-line
  speaker?: 'A' | 'B'; // "Debate": host B's captions and title use a second colour
  pause?: number; // voice acting: seconds of dramatic pause after the line (the picture stays)
  sticker?: string; // reaction sticker name (pipeline/assets/emoji/<name>.svg) that pops up on this line
  slide?: Slide; // "Slides" videos: this scene is one slide (rank, picture card, name, short description, dots)
}

/** One slide of a "Slides" video: the description written on it, and its place among the slides (for the dots). */
export interface Slide { desc: string; index: number; total: number }

// Slide layout (fractions of the height): the picture card, then the name and the description under it.
const SLIDE_TOP = 0.16;
const SLIDE_BOX = 0.38;

export interface RenderOptions {
  music?: boolean; // soft background music under the voice
  hook?: string; // hook title card: shown big for the first 2 seconds
  keywords?: boolean; // keyword pop
  sfx?: boolean; // whoosh between scenes, pop on the hook
  progress?: boolean; // progress bar at the top
  look?: Look; // accent colour + picture tone (niche look)
  captionColor?: string; // #RRGGBB of the spoken word
  captionSize?: 'medium' | 'big';
  endCard?: { title: string; subtitle?: string }; // "Follow for more <title>" + your name
  fast?: boolean; // fast pacing: quicker transitions and a punch-in zoom on each line's key word
  cover?: string; // bold cover: these words big on the first frame (poster for the profile grid and search)
  series?: string; // episode tag shown with the hook, e.g. "DAILY TECH DROP #14"
  notes?: string[]; // quality check notes are added here (e.g. captions not timed to the voice)
  skin?: 'game' | 'manga' | 'sport'; // niche skin: XP bar + LEVEL UP, manga panels + speed lines, scoreboard + match clock
}

/** "#RRGGBB" -> ASS colour "&H00BBGGRR&". */
const assColor = (hex: string) => {
  const h = hex.replace('#', '').padStart(6, '0');
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
};
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ---------- captions: 1 to 3 words at a time, the spoken word highlighted (TikTok style) ----------

interface Word { text: string; from: number; to: number }

/** Time each word of a line by its length (longer words take longer to say), inside [start, start+dur]. */
export function timeWords(text: string, start: number, dur: number): Word[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2 + (/[,.;:!?]$/.test(w) ? 2 : 0);
  const total = words.reduce((t, w) => t + weight(w), 0) || 1;
  let t = start;
  return words.map((w) => {
    const d = (dur * weight(w)) / total;
    const out = { text: w, from: t, to: t + d };
    t += d;
    return out;
  });
}

/** Group words into short caption chunks: max 3 words / 16 letters, breaking after punctuation. */
export function groupWords(words: Word[]): Word[][] {
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = [...cur, w].map((x) => x.text).join(' ').length;
    if (cur.length && (cur.length >= 3 || len > 15)) (groups.push(cur), (cur = []));
    cur.push(w);
    if (/[,.;:!?]$/.test(w.text)) (groups.push(cur), (cur = []));
  }
  if (cur.length) groups.push(cur);
  return groups;
}

const assTime = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const assText = (s: string) => s.toUpperCase().replace(/[{}\\]/g, '');

/** The words of a line with their times (absolute seconds). */
function wordsOf(l: { text: string; start: number; dur: number; times?: Timing[] }): Word[] {
  const words = l.text.split(/\s+/).filter(Boolean);
  if (l.times?.length === words.length) return words.map((w, k) => ({ text: w, from: l.start + l.times![k].from, to: l.start + l.times![k].to }));
  return timeWords(l.text, l.start, l.dur);
}

export interface CaptionLine { slide?: Slide & { pic: boolean }; text: string; start: number; dur: number; times?: Timing[]; keywords?: string[]; credit?: string; label?: string; quiz?: 'hide' | 'reveal'; countdown?: number; verdict?: 'myth' | 'fact'; stampAt?: number; speaker?: 'A' | 'B'; scene?: number; end?: number }

/** Manga speed lines: thin white spikes from the screen edges toward the middle (an ASS vector drawing). */
export function speedLines(cx = W / 2, cy = Math.round(H * 0.42), n = 56): string {
  const parts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + ((k * 7) % 5) * 0.01;
    const inner = 470 + ((k * 37) % 9) * 22;
    const outer = 1500;
    const w = 0.011 + ((k * 13) % 4) * 0.003;
    const p = (r: number, d: number) => `${Math.round(cx + Math.cos(a + d) * r)} ${Math.round(cy + Math.sin(a + d) * r)}`;
    parts.push(`m ${p(inner, 0)} l ${p(outer, -w)} ${p(outer, w)}`);
  }
  return parts.join(' ');
}

/**
 * ASS subtitle file: 1 to 3 words at a time, white bold with a thick outline; the spoken word in the caption colour,
 * key words in the accent colour and bigger. Plus the hook title card and the end card when asked.
 */
export function captionsAss(lines: CaptionLine[], o: RenderOptions & { voiceEnd?: number; total?: number } = {}): string {
  const size = o.captionSize === 'medium' ? 80 : 92;
  const hi = assColor(o.captionColor ?? '#FFE600');
  // Debate: host B's words light up in a second colour (cyan, or pink when your caption colour is already cyan).
  const hiB = assColor(/22E3FF/i.test(o.captionColor ?? '') ? '#FF4FD8' : '#22E3FF');
  const accent = assColor((o.look ?? DEFAULT_LOOK).accent);
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Centre, a bit below the middle: clear of TikTok's buttons (right side) and description (bottom).
    `Style: Cap,DejaVu Sans,${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,9,4,5,110,150,0,1`,
    // Hook card: white words on a dark box near the top.
    'Style: Hook,DejaVu Sans,96,&H00FFFFFF,&H00FFFFFF,&H30000000,&H00000000,-1,0,0,0,100,100,0,0,3,26,0,5,90,90,0,1',
    // Scene title ("#3 Levi Ackerman"): big bold words with a thick outline at the top.
    'Style: Label,DejaVu Sans,74,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,8,3,5,70,70,0,1',
    // Cover: huge words in the middle of the first frame.
    'Style: Cover,DejaVu Sans,124,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,11,5,5,70,70,0,1',
    // Quiz: a giant "?" over the blurred picture.
    'Style: Quiz,DejaVu Sans,420,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,14,6,5,60,60,0,1',
    // Myth vs Fact stamp: huge bold word with a thick outline, tilted.
    'Style: Stamp,DejaVu Sans,176,&H00FFFFFF,&H00FFFFFF,&H00FFFFFF,&H96000000,-1,0,0,0,100,100,4,0,1,11,6,5,40,40,0,1',
    // Series tag ("DAILY TECH DROP #14"): dark words on an accent box.
    `Style: Series,DejaVu Sans,40,&H00140B0B,&H00140B0B,${accent},&H00000000,-1,0,0,0,100,100,2,0,3,14,0,5,60,60,0,1`,
    // Skins: manga panel (black words on a white box with a hard shadow), sports scoreboard (white on navy), clock, game pops.
    'Style: Panel,DejaVu Sans,64,&H00000000,&H00000000,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,1,0,3,18,9,5,70,70,0,1',
    'Style: Score,DejaVu Sans,60,&H00FFFFFF,&H00FFFFFF,&H00401E0F,&H00000000,-1,0,0,0,100,100,1,0,3,16,0,5,70,70,0,1',
    'Style: Clock,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H00401E0F,&H00000000,-1,0,0,0,100,100,2,0,3,12,0,9,40,40,0,1',
    `Style: Pop,DejaVu Sans,44,${accent},${accent},&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,5,2,5,40,40,0,1`,
    'Style: Speed,DejaVu Sans,20,&H40FFFFFF,&H40FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1',
    // Slides: the rank on an accent badge, the description under the name, the dots (which slide this is).
    `Style: Rank,DejaVu Sans,104,&H00140B0B,&H00140B0B,${accent},&H00000000,-1,0,0,0,100,100,0,0,3,18,0,7,60,60,0,1`,
    'Style: Desc,DejaVu Sans,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,6,3,8,120,120,0,1',
    'Style: Dots,DejaVu Sans,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,6,0,1,3,0,8,60,60,0,1',
    'Style: Credit,DejaVu Sans,28,&H30FFFFFF,&H30FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,60,60,0,1',
    'Style: End,DejaVu Sans,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,8,3,5,90,90,0,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const l of lines) {
    if (l.slide) continue; // a slide shows its name and description instead of word-by-word captions
    const keys = new Set(o.keywords ? (l.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean) : []);
    // Real word timings from the voice when available; otherwise timed by word length.
    const groups = groupWords(wordsOf(l));
    groups.forEach((g, gi) => {
      // A chunk never outlives the next one, so two chunks are never on screen together.
      const nextStart = groups[gi + 1]?.[0].from ?? l.start + l.dur + GAP;
      g.forEach((w, i) => {
        const end = i === g.length - 1 ? Math.min(w.to + 0.12, nextStart) : g[i + 1].from;
        const pop = i === 0 ? '\\fscx82\\fscy82\\t(0,90,\\fscx100\\fscy100)' : '';
        const body = g.map((x, j) => {
          const key = keys.has(norm(x.text));
          if (j === i) return `{\\c${l.speaker === 'B' ? hiB : hi}\\fscx${key ? 118 : 108}\\fscy${key ? 118 : 108}}${assText(x.text)}{\\r}`;
          if (key) return `{\\c${accent}\\fscx108\\fscy108}${assText(x.text)}{\\r}`;
          return assText(x.text);
        }).join(' ');
        // With a cover, the first frames show only the cover (the poster TikTok picks).
        const from = o.cover ? Math.max(w.from, 0.2) : w.from;
        if (end > from) events.push(`Dialogue: 0,${assTime(from)},${assTime(end)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.6)})${pop}}${body}`);
      });
    });
  }
  for (const l of lines) {
    if (!l.credit) continue;
    events.push(`Dialogue: 1,${assTime(l.start)},${assTime(l.end ?? l.start + l.dur + GAP)},Credit,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * (l.slide ? 0.75 : 0.7))})}${l.credit.replace(/[{}\\]/g, '').slice(0, 90)}`);
  }
  for (const l of lines) {
    const label = l.label?.replace(/[{}\\]/g, '').trim().slice(0, 40);
    if (!label || l.slide) continue;
    // "#3 Name" on one line: the rank bigger and in the accent colour; pops in, fades out with the scene.
    // Below TikTok's top bar and above the photo card (which is smaller on titled scenes).
    const m = label.match(/^(#\s?\d+)\s*[:.\-–]?\s*(.*)$/);
    const fs = label.length > 20 ? 58 : 74;
    const style = o.skin === 'manga' ? 'Panel' : o.skin === 'sport' ? 'Score' : 'Label';
    const rank = o.skin === 'manga' ? '&H00481DE1&' : accent; // manga: red rank on the white panel
    const who = l.speaker ? `\\c${l.speaker === 'B' ? hiB : hi}` : '';
    const stripe = o.skin === 'sport' ? `{\\c${accent}}▌{\\r} ` : '';
    const text = stripe + (m ? `{\\c${rank}\\fs${Math.round(fs * 1.3)}}${m[1].replace(/\s/g, '')}{\\r\\fs${fs}${who}}${m[2] ? ` ${assText(m[2])}` : ''}` : `{\\fs${fs}${who}}${assText(label)}`);
    events.push(`Dialogue: 2,${assTime(l.start)},${assTime(l.end ?? l.start + l.dur + GAP)},${style},,0,0,0,,{\\an8\\pos(${W / 2},${Math.round(H * 0.11)})\\fad(150,150)\\fscx70\\fscy70\\t(0,180,\\fscx100\\fscy100)}${text}`);
  }
  for (const l of lines) {
    if (!l.slide) continue;
    // One slide: rank badge on the card's corner, the name under the picture (or big in the middle when there is
    // no picture), the description fading in just after, and dots showing which slide this is.
    const sl = l.slide;
    const [from, to] = [assTime(l.start), assTime(l.end ?? l.start + l.dur + GAP)];
    const m = (l.label ?? '').replace(/[{}\\]/g, '').trim().slice(0, 40).match(/^(#\s?\d+)\s*[:.\-–]?\s*(.*)$/);
    const name = assText(m ? m[2] : l.label ?? '');
    if (m) events.push(`Dialogue: 3,${from},${to},Rank,,0,0,0,,{\\an7\\pos(60,${Math.round(H * (SLIDE_TOP - 0.02))})\\frz5\\fad(100,150)\\fscx40\\fscy40\\t(120,300,\\fscx100\\fscy100)}${m[1].replace(/\s/g, '')}`);
    const nameY = Math.round(H * (SLIDE_TOP + SLIDE_BOX + 0.018));
    const style = o.skin === 'manga' ? 'Panel' : o.skin === 'sport' ? 'Score' : 'Label';
    if (name && sl.pic) events.push(`Dialogue: 2,${from},${to},${style},,0,0,0,,{\\an8\\pos(${W / 2},${nameY})\\fs${name.length > 18 ? 58 : 74}\\fad(150,150)\\fscx80\\fscy80\\t(0,180,\\fscx100\\fscy100)}${name}`);
    if (name && !sl.pic) events.push(`Dialogue: 2,${from},${to},Cover,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * (SLIDE_TOP + SLIDE_BOX / 2))})\\fs${name.length > 14 ? 96 : 124}\\fad(150,150)\\fscx70\\fscy70\\t(0,200,\\fscx100\\fscy100)}${name}`);
    const desc = sl.desc.replace(/[{}\\]/g, '').trim().slice(0, 90);
    const descY = sl.pic ? nameY + (name.length > 22 ? 170 : 108) + (style === 'Label' ? 0 : 24) : nameY; // a long name takes two lines; a boxed name (manga, sport) is taller
    if (desc) events.push(`Dialogue: 2,${from},${to},Desc,,0,0,0,,{\\an8\\pos(${W / 2},${descY})\\alpha&HFF&\\t(250,550,\\alpha&H00&)\\fad(0,150)}${desc}`);
    // Dots (up to 12 slides), otherwise "7 / 14".
    const dots = sl.total <= 12
      ? Array.from({ length: sl.total }, (_, k) => (k <= sl.index ? `{\\c${accent}}●` : '{\\c&H00FFFFFF&\\alpha&H60&}○') + '{\\r}').join(' ')
      : `${sl.index + 1} / ${sl.total}`;
    events.push(`Dialogue: 2,${from},${to},Dots,,0,0,0,,{\\an8\\pos(${W / 2},${Math.round(H * 0.102)})}${dots}`);
  }
  for (const l of lines) {
    if (l.quiz !== 'hide') continue;
    // The big "?" while the clue is spoken, then 3, 2, 1 (one per second) before the answer.
    const cd = l.countdown ?? 0;
    const at = l.start + l.dur + GAP;
    for (let k = 0; k < cd; k++) {
      events.push(`Dialogue: 2,${assTime(at + k)},${assTime(at + k + 1)},Quiz,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.4)})\\c${hi}\\fscx60\\fscy60\\t(0,140,\\fscx100\\fscy100)\\fad(0,120)}${cd - k}`);
    }
    events.push(`Dialogue: 1,${assTime(l.start)},${assTime(at)},Quiz,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.4)})\\c${accent}\\fad(120,80)\\t(0,500,\\fscx112\\fscy112)\\t(500,1000,\\fscx100\\fscy100)}?`);
  }
  for (const l of lines) {
    if (!l.verdict || l.stampAt === undefined) continue;
    const [mark, word, col] = l.verdict === 'myth' ? ['✗', 'MYTH', '&H004444EF&'] : ['✓', 'FACT', '&H005EC522&'];
    events.push(`Dialogue: 3,${assTime(l.stampAt)},${assTime(l.end ?? l.start + l.dur + GAP)},Stamp,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.33)})\\c${col}\\frz8\\fscx190\\fscy190\\t(0,130,\\fscx100\\fscy100)\\fad(0,120)}${mark} ${word}`);
  }
  // ---- niche skins ----
  // Big moments: a quiz answer, a #1, a myth/fact stamp.
  const big = lines.flatMap((l) => (l.quiz === 'reveal' || /^#\s?1\b/.test(l.label ?? '') ? [l.start] : l.stampAt !== undefined ? [l.stampAt] : []));
  if (o.skin === 'game') {
    // "+100 XP" floats up next to the XP bar at each new scene; "LEVEL UP!" on big moments.
    for (const l of lines.slice(1)) events.push(`Dialogue: 3,${assTime(l.start)},${assTime(l.start + 1.1)},Pop,,0,0,0,,{\\an6\\move(${W - 70},92,${W - 70},40)\\fad(80,300)}+100 XP`);
    for (const t of big) events.push(`Dialogue: 4,${assTime(t)},${assTime(t + 1.3)},Stamp,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.3)})\\c${hi}\\fs120\\frz-6\\fscx160\\fscy160\\t(0,150,\\fscx100\\fscy100)\\fad(0,250)}★ LEVEL UP! ★`);
  }
  if (o.skin === 'manga') {
    // Speed lines burst behind the picture's middle on big moments (and on the hook).
    for (const t of [0.05, ...big]) events.push(`Dialogue: 1,${assTime(t)},${assTime(t + 0.75)},Speed,,0,0,0,,{\\an7\\pos(0,0)\\fad(0,350)\\p1}${speedLines()}{\\p0}`);
  }
  if (o.skin === 'sport' && o.voiceEnd) {
    // Match clock: seconds left, top right, under TikTok's icons.
    const end = o.voiceEnd;
    for (let t = 0; t < end; t += 1) {
      const left = Math.max(0, Math.ceil(end - t));
      events.push(`Dialogue: 3,${assTime(t)},${assTime(Math.min(end, t + 1))},Clock,,0,0,0,,{\\an9\\pos(${W - 40},${Math.round(H * 0.165)})}◷ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    }
  }
  const coverEnd = o.cover ? 1.2 : 0;
  if (o.cover) {
    // No fade-in: the very first frame shows the whole cover (TikTok uses it as the poster).
    const words = assText(o.cover).slice(0, 40).split(/\s+/).filter(Boolean);
    const cover = words.length > 2 ? `{\\c${accent}}${words.slice(0, 2).join(' ')}{\\r}\\N${words.slice(2).join(' ')}` : `{\\c${accent}}${words.join(' ')}`;
    events.push(`Dialogue: 3,${assTime(0)},${assTime(coverEnd)},Cover,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.42)})\\fad(0,180)}${cover}`);
  }
  if (o.series) {
    const until = Math.max(coverEnd + 1.6, Math.min(2.8, o.total ?? 2.8));
    events.push(`Dialogue: 2,${assTime(coverEnd)},${assTime(until)},Series,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.16)})\\fad(120,200)}${o.series.toUpperCase().replace(/[{}\\]/g, '').slice(0, 40)}`);
  }
  if (o.hook) {
    const until = Math.max(coverEnd + 1.2, Math.min(2.4, lines[1]?.start ?? 2.4, o.total ?? 2.4));
    events.push(`Dialogue: 1,${assTime(coverEnd)},${assTime(until)},Hook,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.25)})\\fad(120,220)\\fscx70\\fscy70\\t(0,160,\\fscx100\\fscy100)}${assText(o.hook)}`);
  }
  if (o.endCard && o.voiceEnd !== undefined && o.total !== undefined) {
    const sub = o.endCard.subtitle ? `\\N{\\fs56\\c&H00FFFFFF&}${o.endCard.subtitle.replace(/[{}\\]/g, '')}` : '';
    events.push(`Dialogue: 2,${assTime(o.voiceEnd)},${assTime(o.total + 0.5)},End,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.45)})\\fad(200,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)}FOLLOW FOR MORE\\N{\\c${accent}}${assText(o.endCard.title)}${sub}`);
  }
  return [...head, ...events, ''].join('\n');
}

// ---------- music: a soft, original chord pad (no licence needed) ----------

const CHORDS = [
  [130.81, 261.63, 329.63, 392.0, 493.88], // Cmaj7
  [110.0, 220.0, 261.63, 329.63, 392.0], // Am7
  [87.31, 174.61, 220.0, 261.63, 329.63], // Fmaj7
  [98.0, 196.0, 246.94, 293.66, 392.0], // G
];
const BAR = 4; // seconds per chord

async function makeMusic(seconds: number, out: string): Promise<void> {
  const pick = `mod(floor(t/${BAR}),${CHORDS.length})`;
  const tones = CHORDS.map((c, i) => `eq(${pick},${i})*(${c.map((f, j) => `${j === 0 ? 0.7 : 0.35}*sin(2*PI*${f}*t)`).join('+')})`).join('+');
  // Each chord swells in and out, so chord changes are smooth.
  const expr = `0.09*pow(sin(PI*mod(t,${BAR})/${BAR}),0.8)*(${tones})`;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${seconds.toFixed(2)}`,
    '-af', 'lowpass=f=1500,aecho=0.8:0.6:70|140:0.25|0.15,afade=t=in:d=1.5,afade=t=out:st=' + Math.max(0, seconds - 2).toFixed(2) + ':d=2', '-ac', '2', out]);
}

// ---------- scenes ----------

/** The spoken line, trimmed of the voice's own leading/trailing silence, then a short pause (plus `extra` seconds of quiet). */
async function cleanLine(wav: string, out: string, extra = 0): Promise<number> {
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
  const pad = `apad=pad_dur=${GAP + extra}`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', `${trim},areverse,${trim},areverse,${pad}`, '-ar', '48000', '-ac', '1', out]);
  const d = await durationOf(out);
  if (d > GAP + extra + 0.3) return d;
  // Never trim a line away (a very quiet recording): keep it as it is.
  await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', pad, '-ar', '48000', '-ac', '1', out]);
  return durationOf(out);
}

/**
 * One scene's picture: cropped to 9:16, a slow zoom (in or out), the niche's picture tone, `fade` longer than its sound.
 * punchAt (fast pacing): a quick zoom-in at that second, on the line's key word. Quiz "hide": the picture is blurred.
 */
async function renderScene(s: Scene, i: number, dur: number, dir: string, tail: number, grade: string, fade = FADE, punchAt?: number, face?: FaceInfo | null): Promise<string> {
  const len = dur + fade + tail;
  const slow = i % 2 === 0 ? `(1+0.07*t/${len.toFixed(2)})` : `(1.07-0.07*t/${len.toFixed(2)})`;
  const z = punchAt !== undefined ? `${slow}*if(gte(t,${punchAt.toFixed(2)}),1.14,1)` : slow;
  const hidden = s.quiz === 'hide' ? 'boxblur=38:6,eq=brightness=-0.12:saturation=0.6,' : '';
  const vf = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${FPS}`,
    `scale=w='trunc(${W}*${z}/2)*2':h=-2:eval=frame:flags=bicubic`, `crop=${W}:${H}`, 'setsar=1', grade,
  ].join(',').replace(/,{2,}/g, ',');
  const video = `${dir}/v${i}.mp4`;
  const enc = ['-t', len.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', video];
  // A big enough photo fills the whole screen, and the camera slowly moves toward the face (or the middle).
  // Smaller pictures (character art, small photos) stay a framed card, so they never look blurry.
  if (s.image && !s.slide && face && Math.max(W / face.w, H / face.h) <= 1.9) {
    const n = Math.ceil(len * FPS);
    // Work at twice the size so the slow move is smooth, crop to 9:16 around the face (kept in the top part).
    const k = Math.max((2 * W) / face.w, (2 * H) / face.h);
    const [sw, sh] = [Math.ceil((face.w * k) / 2) * 2, Math.ceil((face.h * k) / 2) * 2];
    const fx = face.fx ?? 0.5;
    const fy = face.fy ?? 0.42;
    const cx = Math.round(Math.min(Math.max(fx * sw - W, 0), sw - 2 * W));
    const cy = Math.round(Math.min(Math.max(fy * sh - 0.42 * 2 * H, 0), sh - 2 * H));
    const px = Math.min(Math.max((fx * sw - cx) / (2 * W), 0), 1).toFixed(3);
    const py = Math.min(Math.max((fy * sh - cy) / (2 * H), 0), 1).toFixed(3);
    // Zoom in toward the face (or out from it on every other scene); fast pacing adds a punch-in on the key word.
    const base = i % 2 === 0 ? `(1+0.16*on/${n})` : `(1.16-0.16*on/${n})`;
    const z = punchAt !== undefined ? `${base}*if(gte(on,${Math.round(punchAt * FPS)}),1.12,1)` : base;
    const vf = [
      `scale=${sw}:${sh}:flags=lanczos`, `crop=${2 * W}:${2 * H}:${cx}:${cy}`,
      `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,${px}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${py}*ih-ih/zoom/2))':d=${n}:s=${W}x${H}:fps=${FPS}`,
      ...(s.quiz === 'hide' ? ['boxblur=38:6', 'eq=brightness=-0.12:saturation=0.6'] : []), 'setsar=1', grade,
    ].filter(Boolean).join(',');
    const video = `${dir}/v${i}.mp4`;
    await run('ffmpeg', ['-y', '-v', 'error', '-i', s.image, '-vf', vf, '-frames:v', String(n), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', video]);
    return video;
  }
  if (s.image) {
    // Photo card: the whole photo, sharp, with a thin white frame, over a blurred and darkened copy filling the screen.
    // Small pictures (e.g. character art, ~230x350) are enlarged at most 2.2x with a sharp filter, so they stay crisp
    // instead of being stretched 3x and looking blurry.
    // A slide: the card sits in the top part (the name and description go under it); no slide-up, the slides swipe.
    const [bw, bh] = s.slide ? [W - 160, Math.round(H * SLIDE_BOX)] : [W - 120, Math.round(H * (s.label ? 0.5 : 0.58))];
    const [iw, ih] = await sizeOf(s.image).catch(() => [0, 0]);
    const f = iw && ih ? Math.min(bw / iw, bh / ih, 2.2) : 0;
    const fit = f
      ? `scale=w=${Math.round((iw * f) / 2) * 2}:h=${Math.round((ih * f) / 2) * 2}:flags=lanczos${f > 1.3 ? ',unsharp=5:5:0.7:5:5:0' : ''}`
      : `scale=w=${bw}:h=${bh}:force_original_aspect_ratio=decrease:flags=lanczos`;
    const card = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=${s.slide ? -0.34 : -0.22}[bg]`,
      `[1:v]${fit},${hidden}pad=iw+14:ih+14:7:7:color=white@0.92[fg]`,
      `[bg][fg]overlay=x=(W-w)/2:y='${s.slide ? `${Math.round(H * SLIDE_TOP)}+(${bh}-h)/2` : `(H-h)/2-${Math.round(H * (s.label ? 0.03 : 0.07))}+90*pow(max(0,1-t/0.5),3)`}',${vf.replace(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`, '')}[out]`,
    ].join(';');
    await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', s.image, '-loop', '1', '-framerate', String(FPS), '-i', s.image, '-filter_complex', card, '-map', '[out]', ...enc]);
    return video;
  }
  const [c0, c1] = BACKGROUNDS[i % BACKGROUNDS.length];
  const input = s.clip ? ['-stream_loop', '-1', ...(s.clipStart ? ['-ss', s.clipStart.toFixed(2)] : []), '-i', s.clip] : ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:speed=0.008:r=${FPS}`];
  await run('ffmpeg', ['-y', '-v', 'error', ...input, '-vf', `${hidden}${vf}`, ...enc]);
  return video;
}

// ---------- sound effects: made here, so no licence needed ----------

/** A soft whoosh at each scene change and a pop at the start (hook), as one track as long as the video. */
async function makeSfx(changes: number[], pop: boolean, seconds: number, dir: string, ticks: number[] = [], hits: number[] = [], risers: number[] = []): Promise<string | null> {
  if (!changes.length && !pop && !ticks.length && !hits.length && !risers.length) return null;
  // Riser: a rising tone and hiss for 1.2 s before a reveal. Hit: a deep boom on the hook and on reveals.
  const riser = `${dir}/riser.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.35*sin(2*PI*(180*t+420*t*t))*pow(t/1.2,2)':s=48000:d=1.2", '-f', 'lavfi', '-i', 'anoisesrc=d=1.2:c=white:a=0.25:r=48000',
    '-filter_complex', '[1:a]highpass=f=2500,afade=t=in:d=1.15:curve=exp[n];[0:a][n]amix=inputs=2:normalize=0,afade=t=out:st=1.12:d=0.08', '-ac', '1', riser]);
  const hit = `${dir}/hit.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(48+70*exp(-t*16))*t)*exp(-t*5)':s=48000:d=0.9", '-af', 'lowpass=f=400', '-ac', '1', hit]);
  const tick = `${dir}/tick.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*1400*t)*exp(-t*55)':s=48000:d=0.12", '-ac', '1', tick]);
  const whoosh = `${dir}/whoosh.wav`;
  const blip = `${dir}/pop.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=pink:a=0.5:r=48000',
    '-af', 'highpass=f=350,lowpass=f=4500,afade=t=in:d=0.22:curve=qsin,afade=t=out:st=0.22:d=0.28:curve=qsin,volume=0.9', '-ac', '1', whoosh]);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.7*sin(2*PI*(420+900*exp(-t*28))*t)*exp(-t*20)':s=48000:d=0.3", '-ac', '1', blip]);
  const parts: string[] = [];
  const labels: string[] = [];
  if (changes.length) {
    parts.push(`[0:a]asplit=${changes.length}${changes.map((_, i) => `[w${i}]`).join('')}`);
    changes.forEach((t, i) => (parts.push(`[w${i}]adelay=delays=${Math.max(0, Math.round((t - 0.22) * 1000))}:all=1[d${i}]`), labels.push(`[d${i}]`)));
  }
  if (pop) (parts.push('[1:a]adelay=delays=60:all=1[p]'), labels.push('[p]'));
  if (ticks.length) {
    // Countdown: a clock tick on each number (the last one higher).
    parts.push(`[2:a]asplit=${ticks.length}${ticks.map((_, i) => `[k${i}]`).join('')}`);
    ticks.forEach((t, i) => (parts.push(`[k${i}]${(i + 1) % COUNTDOWN === 0 ? 'asetrate=60000,aresample=48000,' : ''}adelay=delays=${Math.round(t * 1000)}:all=1[t${i}]`), labels.push(`[t${i}]`)));
  }
  if (risers.length) {
    parts.push(`[3:a]asplit=${risers.length}${risers.map((_, i) => `[r${i}]`).join('')}`);
    risers.forEach((t, i) => (parts.push(`[r${i}]adelay=delays=${Math.max(0, Math.round((t - 1.2) * 1000))}:all=1[rd${i}]`), labels.push(`[rd${i}]`)));
  }
  if (hits.length) {
    parts.push(`[4:a]asplit=${hits.length}${hits.map((_, i) => `[h${i}]`).join('')}`);
    hits.forEach((t, i) => (parts.push(`[h${i}]adelay=delays=${Math.max(0, Math.round(t * 1000))}:all=1[hd${i}]`), labels.push(`[hd${i}]`)));
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${seconds.toFixed(2)}[out]`);
  const out = `${dir}/sfx.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', whoosh, '-i', blip, '-i', tick, '-i', riser, '-i', hit, '-filter_complex', parts.join(';'), '-map', '[out]', '-t', seconds.toFixed(2), '-ar', '48000', '-ac', '1', out]);
  return out;
}

/** All scenes -> one vertical 1080x1920 MP4 with crossfades, captions, effects and clean sound, plus a thumbnail. */
export async function renderVideo(scenes: Scene[], dir: string, out: string, thumb: string, o: RenderOptions = {}): Promise<number> {
  const look = o.look ?? DEFAULT_LOOK;
  const tail = o.endCard ? END_CARD : TAIL;
  const durs: number[] = [];
  // A quiz clue line gets COUNTDOWN quiet seconds after the voice (the 3-2-1 before the answer);
  // voice acting adds a short dramatic pause after some lines.
  const cd = scenes.map((s) => (s.quiz === 'hide' ? COUNTDOWN : 0));
  const extra = scenes.map((s, i) => cd[i] + (s.quiz ? 0 : Math.min(1.5, Math.max(0, s.pause ?? 0))));
  for (const [i, s] of scenes.entries()) durs.push(await cleanLine(s.wav, `${dir}/a${i}.wav`, extra[i]));
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
  // When each word is really said (speech recognition), so captions and the punch-in zoom land on the word.
  const times = await alignLines(scenes.map((s, i) => ({ wav: `${dir}/a${i}.wav`, text: s.text, dur: durs[i] - GAP - extra[i] })));
  const timed = times.filter(Boolean).length;
  console.log(`Word timing from the voice: ${timed} of ${scenes.length} lines`);
  if (process.env.TTS_FAKE !== '1' && process.env.ALIGN !== '0' && timed < scenes.length / 2) o.notes?.push('Captions were timed by word length (speech timing was not available this time).');
  const voiceEnd = durs.reduce((a, b) => a + b, 0);
  const total = voiceEnd + tail;

  // Fast pacing: quicker transitions, and a punch-in zoom on each line's key word (or half-way through a long line).
  const fade = o.fast ? 0.28 : FADE;
  const punch = scenes.map((s, i) => {
    if (!o.fast || durs[i] < 2.2 || s.quiz || s.slide) return undefined;
    const keys = new Set((s.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
    const word = wordsOf({ text: s.text, start: 0, dur: durs[i] - GAP, times: times[i] ?? undefined }).find((w) => keys.has(norm(w.text)));
    const at = word && word.from > 0.5 ? word.from : durs[i] / 2;
    return at + (i > 0 ? fade / 2 : 0);
  });
  // Where the faces are in the photos (one quick OpenCV run for all of them).
  const imgs = scenes.map((s) => s.image).filter((x): x is string => !!x);
  const faceList = await findFaces(imgs);
  const faceOf = new Map(imgs.map((p, k) => [p, faceList[k]]));
  const full = imgs.filter((p) => { const f = faceOf.get(p); return f && Math.max(W / f.w, H / f.h) <= 1.9; });
  if (imgs.length) console.log(`Photos: ${full.length} of ${imgs.length} full screen, ${faceList.filter((f) => f?.fx !== undefined).length} with a face found`);
  const videos: string[] = [];
  for (const [i, s] of scenes.entries()) videos.push(await renderScene(s, i, durs[i], dir, i === scenes.length - 1 ? tail : 0, look.grade, fade, punch[i], s.image ? faceOf.get(s.image) : null));

  await writeFile(`${dir}/a.txt`, scenes.map((_, i) => `file '${resolve(`${dir}/a${i}.wav`)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/a.txt`, '-af', `apad=pad_dur=${tail + 1}`, '-c:a', 'pcm_s16le', `${dir}/voice.wav`]);
  // Myth vs Fact: the stamp lands a bit past the middle of the line (on the word nearest that moment).
  const stampAt = scenes.map((s, i) => (s.verdict ? starts[i] + (durs[i] - GAP - extra[i]) * 0.55 : undefined));
  const lines = scenes.map((s, i) => ({ slide: s.slide && { ...s.slide, pic: !!s.image }, text: s.text, start: starts[i], dur: durs[i] - GAP - extra[i], times: times[i] ?? undefined, verdict: s.verdict, stampAt: stampAt[i], keywords: s.keywords, credit: s.credit, label: s.label, quiz: s.quiz, countdown: cd[i], speaker: s.speaker, end: starts[i] + durs[i] }));
  const ticks = scenes.flatMap((_, i) => (cd[i] ? Array.from({ length: COUNTDOWN }, (_, k) => starts[i] + durs[i] - extra[i] + k) : []));
  await writeFile(`${dir}/captions.ass`, captionsAss(lines, { ...o, look, voiceEnd, total }));
  if (o.music) await makeMusic(total + 1, `${dir}/music.wav`);
  // Sound design: a boom on the hook, and a riser into each reveal (quiz answer, myth/fact stamp) that lands with a boom.
  const reveals = [...stampAt.filter((t): t is number => t !== undefined), ...scenes.flatMap((s, i) => (s.quiz === 'reveal' ? [starts[i]] : []))].filter((t) => t > 1.3);
  // Music drop: the music comes in with a boom right after the hook line.
  const drop = o.music && starts.length > 1 ? starts[1] : 0;
  const hits = o.sfx ? [...(o.hook || o.series ? [0.03] : []), ...reveals, ...(drop ? [drop] : [])] : [];
  const sfx = o.sfx || ticks.length ? await makeSfx(o.sfx ? starts.slice(1) : [], !!o.hook && !!o.sfx, total + 1, dir, ticks, hits, o.sfx ? reveals : []) : null;

  // Picture: crossfade scene i into i+1 exactly when line i+1 starts, then the overlays and captions.
  const inputs = videos.flatMap((v) => ['-i', v]);
  const graph: string[] = videos.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS}[s${i}]`);
  let last = '[s0]';
  for (let i = 1; i < videos.length; i++) {
    const label = `[x${i}]`;
    // Quiz answer: a white flash into the sharp picture.
    const t = scenes[i].quiz === 'reveal' ? 'fadewhite' : scenes[i].slide ? 'slideleft' : TRANSITIONS[(i - 1) % TRANSITIONS.length];
    graph.push(`${last}[s${i}]xfade=transition=${t}:duration=${fade}:offset=${(starts[i] - fade / 2).toFixed(3)}${label}`);
    last = label;
  }
  const accent = `0x${look.accent.replace('#', '')}`;
  // A bar that fills as the video plays: drawbox can't grow by itself (its "t" means line thickness, not time),
  // so it is made of small segments, each switched on at its moment (about every half second).
  const fillBar = (x: number, y: number, w: number, h: number, color: string) => {
    const n = Math.max(2, Math.min(120, Math.ceil(total * 2)));
    return Array.from({ length: n }, (_, k) => {
      const x0 = x + Math.floor((w * k) / n);
      const x1 = x + Math.floor((w * (k + 1)) / n);
      return `drawbox=x=${x0}:y=${y}:w=${x1 - x0}:h=${h}:color=${color}:t=fill:enable='gte(t,${((total * k) / n).toFixed(2)})'`;
    });
  };
  const overlays = [
    ...(o.cover ? ["drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill:enable='lt(t,1.2)'"] : []),
    ...(o.endCard ? [`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,${voiceEnd.toFixed(2)})'`] : []),
    ...(o.progress && o.skin !== 'game' ? fillBar(0, 0, W, 12, `${accent}@0.95`) : []),
    // Gaming skin: an XP bar (frame + filling bar) instead of the thin progress bar.
    ...(o.skin === 'game' ? [
      `drawbox=x=56:y=44:w=${W - 112}:h=34:color=black@0.55:t=fill`,
      `drawbox=x=56:y=44:w=${W - 112}:h=34:color=white@0.9:t=4`,
      ...fillBar(64, 52, W - 128, 18, `${accent}@0.95`),
    ] : []),
  ];
  graph.push(`${last}${overlays.length ? overlays.join(',') : 'null'}[pre0]`);
  // Reaction stickers: pop in (sliding up a little and fading) on the line's key word, about 1.3 s, left or right.
  const audioCount = 1 + (o.music ? 1 : 0) + (sfx ? 1 : 0);
  const stickers = scenes.flatMap((s, i) => {
    if (!s.sticker || !/^[a-z]+$/.test(s.sticker)) return [];
    const keys = new Set((s.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
    const word = wordsOf({ text: s.text, start: starts[i], dur: durs[i] - GAP - extra[i], times: times[i] ?? undefined }).find((w) => keys.has(norm(w.text)));
    const at = word ? word.from : starts[i] + (durs[i] - GAP - extra[i]) * 0.35;
    return [{ name: s.sticker, at: Math.max(0.3, at) }];
  }).slice(0, 6);
  const stickerFiles: string[] = [];
  for (const [k, st] of stickers.entries()) {
    const png = `${dir}/sticker${k}.png`;
    const svg = fileURLToPath(new URL(`../assets/emoji/${st.name}.svg`, import.meta.url));
    if (await run('ffmpeg', ['-y', '-v', 'error', '-width', '230', '-height', '230', '-i', svg, png]).then(() => true, () => false)) stickerFiles.push(png);
    else stickerFiles.push('');
  }
  let pre = '[pre0]';
  let si = 0;
  stickers.forEach((st, k) => {
    if (!stickerFiles[k]) return;
    const input = videos.length + audioCount + si++;
    const x = k % 2 === 0 ? W - 300 : 70;
    const y = Math.round(H * 0.2);
    const t = st.at.toFixed(2);
    graph.push(`[${input}:v]format=rgba,fade=t=in:st=${t}:d=0.15:alpha=1,fade=t=out:st=${(st.at + 1.15).toFixed(2)}:d=0.25:alpha=1[sk${k}]`);
    graph.push(`${pre}[sk${k}]overlay=x=${x}:y='${y}-50*max(0,1-(t-${t})/0.3)':enable='between(t,${t},${(st.at + 1.45).toFixed(2)})'[pre${k + 1}]`);
    pre = `[pre${k + 1}]`;
  });
  const stickerInputs = stickerFiles.filter(Boolean).flatMap((f) => ['-loop', '1', '-framerate', String(FPS), '-t', total.toFixed(2), '-i', f]);
  graph.push(`${pre}subtitles=${dir}/captions.ass:fontsdir=${FONT_DIR},format=yuv420p[vout]`);

  // Sound: clean voice, music ducked under it, effects on top, TikTok loudness (-14 LUFS).
  const n = videos.length;
  const audioFiles = [`${dir}/voice.wav`, ...(o.music ? [`${dir}/music.wav`] : []), ...(sfx ? [sfx] : [])];
  const musicIn = o.music ? n + 1 : -1;
  const sfxIn = sfx ? n + 1 + (o.music ? 1 : 0) : -1;
  const mix: string[] = ['[v1]'];
  // Studio voice: a little warmth (180 Hz) and presence (3.2 kHz), softer "s" sounds, steady level, a touch of room.
  graph.push(`[${n}:a]highpass=f=80,equalizer=f=180:t=q:w=1:g=2,equalizer=f=3200:t=q:w=1.4:g=2.5,deesser=i=0.4,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,aecho=0.8:0.4:18|29:0.08|0.05,asplit=2[v1][v2]`);
  if (musicIn >= 0) (graph.push(`[${musicIn}:a]volume=0.55,volume='if(lt(t,${drop.toFixed(2)}),0.15,1)':eval=frame[m]`, '[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]'), mix.push('[duck]'));
  else graph.push('[v2]anullsink');
  if (sfxIn >= 0) (graph.push(`[${sfxIn}:a]volume=0.45[fx]`), mix.push('[fx]'));
  graph.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[aout]`);

  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, ...audioFiles.flatMap((f) => ['-i', f]), ...stickerInputs, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-t', total.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out]);
  // Thumbnail: the cover itself when there is one.
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', o.cover ? '0.1' : String(Math.min(1, total / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', thumb]);
  return durationOf(out);
}

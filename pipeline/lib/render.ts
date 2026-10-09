import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { durationOf, run, sizeOf } from './sh';
import { DEFAULT_LOOK, type Look } from '../../src/lib/niches';
import { alignLines, type Timing } from './align';

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
}

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

export interface CaptionLine { text: string; start: number; dur: number; times?: Timing[]; keywords?: string[]; credit?: string; label?: string; quiz?: 'hide' | 'reveal'; countdown?: number; verdict?: 'myth' | 'fact'; stampAt?: number }

/**
 * ASS subtitle file: 1 to 3 words at a time, white bold with a thick outline; the spoken word in the caption colour,
 * key words in the accent colour and bigger. Plus the hook title card and the end card when asked.
 */
export function captionsAss(lines: CaptionLine[], o: RenderOptions & { voiceEnd?: number; total?: number } = {}): string {
  const size = o.captionSize === 'medium' ? 80 : 92;
  const hi = assColor(o.captionColor ?? '#FFE600');
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
    'Style: Credit,DejaVu Sans,28,&H30FFFFFF,&H30FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,60,60,0,1',
    'Style: End,DejaVu Sans,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,8,3,5,90,90,0,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const l of lines) {
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
          if (j === i) return `{\\c${hi}\\fscx${key ? 118 : 108}\\fscy${key ? 118 : 108}}${assText(x.text)}{\\r}`;
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
    events.push(`Dialogue: 1,${assTime(l.start)},${assTime(l.start + l.dur + GAP)},Credit,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.7)})}${l.credit.replace(/[{}\\]/g, '').slice(0, 90)}`);
  }
  for (const l of lines) {
    const label = l.label?.replace(/[{}\\]/g, '').trim().slice(0, 40);
    if (!label) continue;
    // "#3 Name" on one line: the rank bigger and in the accent colour; pops in, fades out with the scene.
    // Below TikTok's top bar and above the photo card (which is smaller on titled scenes).
    const m = label.match(/^(#\s?\d+)\s*[:.\-–]?\s*(.*)$/);
    const fs = label.length > 20 ? 58 : 74;
    const text = m ? `{\\c${accent}\\fs${Math.round(fs * 1.3)}}${m[1].replace(/\s/g, '')}{\\r\\fs${fs}}${m[2] ? ` ${assText(m[2])}` : ''}` : `{\\fs${fs}}${assText(label)}`;
    events.push(`Dialogue: 2,${assTime(l.start)},${assTime(l.start + l.dur + GAP)},Label,,0,0,0,,{\\an8\\pos(${W / 2},${Math.round(H * 0.11)})\\fad(150,150)\\fscx70\\fscy70\\t(0,180,\\fscx100\\fscy100)}${text}`);
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
    events.push(`Dialogue: 3,${assTime(l.stampAt)},${assTime(l.start + l.dur + GAP)},Stamp,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.33)})\\c${col}\\frz8\\fscx190\\fscy190\\t(0,130,\\fscx100\\fscy100)\\fad(0,120)}${mark} ${word}`);
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
async function renderScene(s: Scene, i: number, dur: number, dir: string, tail: number, grade: string, fade = FADE, punchAt?: number): Promise<string> {
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
  if (s.image) {
    // Photo card: the whole photo, sharp, with a thin white frame, over a blurred and darkened copy filling the screen.
    // Small pictures (e.g. character art, ~230x350) are enlarged at most 2.2x with a sharp filter, so they stay crisp
    // instead of being stretched 3x and looking blurry.
    const [bw, bh] = [W - 120, Math.round(H * (s.label ? 0.5 : 0.58))];
    const [iw, ih] = await sizeOf(s.image).catch(() => [0, 0]);
    const f = iw && ih ? Math.min(bw / iw, bh / ih, 2.2) : 0;
    const fit = f
      ? `scale=w=${Math.round((iw * f) / 2) * 2}:h=${Math.round((ih * f) / 2) * 2}:flags=lanczos${f > 1.3 ? ',unsharp=5:5:0.7:5:5:0' : ''}`
      : `scale=w=${bw}:h=${bh}:force_original_aspect_ratio=decrease:flags=lanczos`;
    const card = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=-0.22[bg]`,
      `[1:v]${fit},${hidden}pad=iw+14:ih+14:7:7:color=white@0.92[fg]`,
      `[bg][fg]overlay=x=(W-w)/2:y='(H-h)/2-${Math.round(H * (s.label ? 0.03 : 0.07))}+90*pow(max(0,1-t/0.5),3)',${vf.replace(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`, '')}[out]`,
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
  // A quiz clue line gets COUNTDOWN quiet seconds after the voice (the 3-2-1 before the answer).
  const extra = scenes.map((s) => (s.quiz === 'hide' ? COUNTDOWN : 0));
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
    if (!o.fast || durs[i] < 2.2 || s.quiz) return undefined;
    const keys = new Set((s.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean));
    const word = wordsOf({ text: s.text, start: 0, dur: durs[i] - GAP, times: times[i] ?? undefined }).find((w) => keys.has(norm(w.text)));
    const at = word && word.from > 0.5 ? word.from : durs[i] / 2;
    return at + fade / 2;
  });
  const videos: string[] = [];
  for (const [i, s] of scenes.entries()) videos.push(await renderScene(s, i, durs[i], dir, i === scenes.length - 1 ? tail : 0, look.grade, fade, punch[i]));

  await writeFile(`${dir}/a.txt`, scenes.map((_, i) => `file '${resolve(`${dir}/a${i}.wav`)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/a.txt`, '-af', `apad=pad_dur=${tail + 1}`, '-c:a', 'pcm_s16le', `${dir}/voice.wav`]);
  // Myth vs Fact: the stamp lands a bit past the middle of the line (on the word nearest that moment).
  const stampAt = scenes.map((s, i) => (s.verdict ? starts[i] + (durs[i] - GAP - extra[i]) * 0.55 : undefined));
  const lines = scenes.map((s, i) => ({ text: s.text, start: starts[i], dur: durs[i] - GAP - extra[i], times: times[i] ?? undefined, verdict: s.verdict, stampAt: stampAt[i], keywords: s.keywords, credit: s.credit, label: s.label, quiz: s.quiz, countdown: extra[i] }));
  const ticks = scenes.flatMap((_, i) => (extra[i] ? Array.from({ length: COUNTDOWN }, (_, k) => starts[i] + durs[i] - extra[i] + k) : []));
  await writeFile(`${dir}/captions.ass`, captionsAss(lines, { ...o, look, voiceEnd, total }));
  if (o.music) await makeMusic(total + 1, `${dir}/music.wav`);
  // Sound design: a boom on the hook, and a riser into each reveal (quiz answer, myth/fact stamp) that lands with a boom.
  const reveals = [...stampAt.filter((t): t is number => t !== undefined), ...scenes.flatMap((s, i) => (s.quiz === 'reveal' ? [starts[i]] : []))].filter((t) => t > 1.3);
  const hits = o.sfx ? [...(o.hook || o.series ? [0.03] : []), ...reveals] : [];
  const sfx = o.sfx || ticks.length ? await makeSfx(o.sfx ? starts.slice(1) : [], !!o.hook && !!o.sfx, total + 1, dir, ticks, hits, o.sfx ? reveals : []) : null;

  // Picture: crossfade scene i into i+1 exactly when line i+1 starts, then the overlays and captions.
  const inputs = videos.flatMap((v) => ['-i', v]);
  const graph: string[] = videos.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS}[s${i}]`);
  let last = '[s0]';
  for (let i = 1; i < videos.length; i++) {
    const label = `[x${i}]`;
    // Quiz answer: a white flash into the sharp picture.
    const t = scenes[i].quiz === 'reveal' ? 'fadewhite' : TRANSITIONS[(i - 1) % TRANSITIONS.length];
    graph.push(`${last}[s${i}]xfade=transition=${t}:duration=${fade}:offset=${(starts[i] - fade / 2).toFixed(3)}${label}`);
    last = label;
  }
  const accent = `0x${look.accent.replace('#', '')}`;
  const overlays = [
    ...(o.cover ? ["drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill:enable='lt(t,1.2)'"] : []),
    ...(o.endCard ? [`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,${voiceEnd.toFixed(2)})'`] : []),
    ...(o.progress ? [`drawbox=x=0:y=0:w='max(6,iw*t/${total.toFixed(2)})':h=12:color=${accent}@0.95:t=fill`] : []),
  ];
  graph.push(`${last}${overlays.length ? `${overlays.join(',')},` : ''}subtitles=${dir}/captions.ass:fontsdir=${FONT_DIR},format=yuv420p[vout]`);

  // Sound: clean voice, music ducked under it, effects on top, TikTok loudness (-14 LUFS).
  const n = videos.length;
  const audioFiles = [`${dir}/voice.wav`, ...(o.music ? [`${dir}/music.wav`] : []), ...(sfx ? [sfx] : [])];
  const musicIn = o.music ? n + 1 : -1;
  const sfxIn = sfx ? n + 1 + (o.music ? 1 : 0) : -1;
  const mix: string[] = ['[v1]'];
  graph.push(`[${n}:a]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2,asplit=2[v1][v2]`);
  if (musicIn >= 0) (graph.push(`[${musicIn}:a]volume=0.55[m]`, '[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]'), mix.push('[duck]'));
  else graph.push('[v2]anullsink');
  if (sfxIn >= 0) (graph.push(`[${sfxIn}:a]volume=0.45[fx]`), mix.push('[fx]'));
  graph.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[aout]`);

  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, ...audioFiles.flatMap((f) => ['-i', f]), '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-t', total.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out]);
  // Thumbnail: the cover itself when there is one.
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', o.cover ? '0.1' : String(Math.min(1, total / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', thumb]);
  return durationOf(out);
}

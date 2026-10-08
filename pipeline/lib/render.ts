import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { durationOf, run } from './sh';
import { DEFAULT_LOOK, type Look } from '../../src/lib/niches';

export const W = 1080; // TikTok's native size: sharp on phones
export const H = 1920;
const FPS = 30;
const GAP = 0.12; // seconds of silence after each line (tight, like a real voice-over)
const FADE = 0.4; // transition between scenes
// Smooth transitions, taken in turn so the video keeps moving (a glide, a zoom, a soft fade…).
export const TRANSITIONS = ['smoothleft', 'zoomin', 'smoothup', 'fade', 'smoothright', 'circleopen', 'smoothdown'];
const TAIL = 0.5; // picture stays a moment after the last word
const END_CARD = 2.2; // seconds of end card after the last word
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

export interface CaptionLine { text: string; start: number; dur: number; keywords?: string[]; credit?: string; label?: string }

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
    'Style: Credit,DejaVu Sans,28,&H30FFFFFF,&H30FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,60,60,0,1',
    'Style: End,DejaVu Sans,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,8,3,5,90,90,0,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const l of lines) {
    const keys = new Set(o.keywords ? (l.keywords ?? []).flatMap((k) => k.split(/\s+/)).map(norm).filter(Boolean) : []);
    const groups = groupWords(timeWords(l.text, l.start, l.dur));
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
        events.push(`Dialogue: 0,${assTime(w.from)},${assTime(end)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.6)})${pop}}${body}`);
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
  if (o.hook) {
    const until = Math.min(2.4, lines[1]?.start ?? 2.4, o.total ?? 2.4);
    events.push(`Dialogue: 1,${assTime(0)},${assTime(until)},Hook,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.25)})\\fad(120,220)\\fscx70\\fscy70\\t(0,160,\\fscx100\\fscy100)}${assText(o.hook)}`);
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

/** The spoken line, trimmed of the voice's own leading/trailing silence, then a short pause. */
async function cleanLine(wav: string, out: string): Promise<number> {
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
  const pad = `apad=pad_dur=${GAP}`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', `${trim},areverse,${trim},areverse,${pad}`, '-ar', '48000', '-ac', '1', out]);
  const d = await durationOf(out);
  if (d > GAP + 0.3) return d;
  // Never trim a line away (a very quiet recording): keep it as it is.
  await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', pad, '-ar', '48000', '-ac', '1', out]);
  return durationOf(out);
}

/** One scene's picture: cropped to 9:16, a slow zoom (in or out), the niche's picture tone, FADE longer than its sound. */
async function renderScene(s: Scene, i: number, dur: number, dir: string, tail: number, grade: string): Promise<string> {
  const len = dur + FADE + tail;
  const z = i % 2 === 0 ? `(1+0.07*t/${len.toFixed(2)})` : `(1.07-0.07*t/${len.toFixed(2)})`;
  const vf = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${FPS}`,
    `scale=w='trunc(${W}*${z}/2)*2':h=-2:eval=frame:flags=bicubic`, `crop=${W}:${H}`, 'setsar=1', grade,
  ].join(',');
  const video = `${dir}/v${i}.mp4`;
  const enc = ['-t', len.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', video];
  if (s.image) {
    // Photo card: the whole photo, sharp, with a thin white frame, over a blurred and darkened copy filling the screen.
    const card = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=-0.22[bg]`,
      `[1:v]scale=w=${W - 120}:h=${Math.round(H * (s.label ? 0.5 : 0.58))}:force_original_aspect_ratio=decrease,pad=iw+14:ih+14:7:7:color=white@0.92[fg]`,
      `[bg][fg]overlay=x=(W-w)/2:y='(H-h)/2-${Math.round(H * (s.label ? 0.03 : 0.07))}+90*pow(max(0,1-t/0.5),3)',${vf.replace(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`, '')}[out]`,
    ].join(';');
    await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', String(FPS), '-i', s.image, '-loop', '1', '-framerate', String(FPS), '-i', s.image, '-filter_complex', card, '-map', '[out]', ...enc]);
    return video;
  }
  const [c0, c1] = BACKGROUNDS[i % BACKGROUNDS.length];
  const input = s.clip ? ['-stream_loop', '-1', ...(s.clipStart ? ['-ss', s.clipStart.toFixed(2)] : []), '-i', s.clip] : ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:speed=0.008:r=${FPS}`];
  await run('ffmpeg', ['-y', '-v', 'error', ...input, '-vf', vf, ...enc]);
  return video;
}

// ---------- sound effects: made here, so no licence needed ----------

/** A soft whoosh at each scene change and a pop at the start (hook), as one track as long as the video. */
async function makeSfx(changes: number[], pop: boolean, seconds: number, dir: string): Promise<string | null> {
  if (!changes.length && !pop) return null;
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
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad=whole_dur=${seconds.toFixed(2)}[out]`);
  const out = `${dir}/sfx.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', whoosh, '-i', blip, '-filter_complex', parts.join(';'), '-map', '[out]', '-t', seconds.toFixed(2), '-ar', '48000', '-ac', '1', out]);
  return out;
}

/** All scenes -> one vertical 1080x1920 MP4 with crossfades, captions, effects and clean sound, plus a thumbnail. */
export async function renderVideo(scenes: Scene[], dir: string, out: string, thumb: string, o: RenderOptions = {}): Promise<number> {
  const look = o.look ?? DEFAULT_LOOK;
  const tail = o.endCard ? END_CARD : TAIL;
  const durs: number[] = [];
  for (const [i, s] of scenes.entries()) durs.push(await cleanLine(s.wav, `${dir}/a${i}.wav`));
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
  const voiceEnd = durs.reduce((a, b) => a + b, 0);
  const total = voiceEnd + tail;

  const videos: string[] = [];
  for (const [i, s] of scenes.entries()) videos.push(await renderScene(s, i, durs[i], dir, i === scenes.length - 1 ? tail : 0, look.grade));

  await writeFile(`${dir}/a.txt`, scenes.map((_, i) => `file '${resolve(`${dir}/a${i}.wav`)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/a.txt`, '-af', `apad=pad_dur=${tail + 1}`, '-c:a', 'pcm_s16le', `${dir}/voice.wav`]);
  const lines = scenes.map((s, i) => ({ text: s.text, start: starts[i], dur: durs[i] - GAP, keywords: s.keywords, credit: s.credit, label: s.label }));
  await writeFile(`${dir}/captions.ass`, captionsAss(lines, { ...o, look, voiceEnd, total }));
  if (o.music) await makeMusic(total + 1, `${dir}/music.wav`);
  const sfx = o.sfx ? await makeSfx(starts.slice(1), !!o.hook, total + 1, dir) : null;

  // Picture: crossfade scene i into i+1 exactly when line i+1 starts, then the overlays and captions.
  const inputs = videos.flatMap((v) => ['-i', v]);
  const graph: string[] = videos.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS}[s${i}]`);
  let last = '[s0]';
  for (let i = 1; i < videos.length; i++) {
    const label = `[x${i}]`;
    const t = TRANSITIONS[(i - 1) % TRANSITIONS.length];
    graph.push(`${last}[s${i}]xfade=transition=${t}:duration=${FADE}:offset=${(starts[i] - FADE / 2).toFixed(3)}${label}`);
    last = label;
  }
  const accent = `0x${look.accent.replace('#', '')}`;
  const overlays = [
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
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(1, total / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', thumb]);
  return durationOf(out);
}

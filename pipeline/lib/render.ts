import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { durationOf, run } from './sh';

export const W = 1080; // TikTok's native size: sharp on phones
export const H = 1920;
const FPS = 30;
const GAP = 0.12; // seconds of silence after each line (tight, like a real voice-over)
const FADE = 0.3; // crossfade between scenes
const TAIL = 0.5; // picture stays a moment after the last word
const FONT_DIR = process.env.CAPTION_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const BACKGROUNDS = [['0x1e1b4b', '0x0e7490'], ['0x0f172a', '0x7c3aed'], ['0x164e63', '0x1e3a8a'], ['0x3b0764', '0xbe185d'], ['0x14532d', '0x0f766e']];

export interface Scene {
  text: string;
  wav: string; // the spoken line
  clip: string | null; // stock video, or null for a moving colour background
}

export interface RenderOptions {
  music?: boolean; // soft background music under the voice
}

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
    if (cur.length && (cur.length >= 3 || len > 16)) (groups.push(cur), (cur = []));
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

/** ASS subtitle file: white bold words with a thick outline, the current word in yellow and slightly bigger. */
export function captionsAss(lines: { text: string; start: number; dur: number }[]): string {
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Centre, a bit below the middle: clear of TikTok's buttons (right side) and description (bottom).
    'Style: Cap,DejaVu Sans,94,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,1,0,1,9,4,5,110,150,0,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const l of lines) {
    for (const g of groupWords(timeWords(l.text, l.start, l.dur))) {
      g.forEach((w, i) => {
        const end = i === g.length - 1 ? Math.min(w.to + 0.12, l.start + l.dur + GAP) : g[i + 1].from;
        const pop = i === 0 ? '\\fscx82\\fscy82\\t(0,90,\\fscx100\\fscy100)' : '';
        const body = g.map((x, j) => (j === i ? `{\\c&H0000E6FF&\\fscx108\\fscy108}${assText(x.text)}{\\c&H00FFFFFF&\\fscx100\\fscy100}` : assText(x.text))).join(' ');
        events.push(`Dialogue: 0,${assTime(w.from)},${assTime(end)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.6)})${pop}}${body}`);
      });
    }
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

/** One scene's picture: cropped to 9:16, a slow zoom (in or out), FADE longer than its sound for the crossfade. */
async function renderScene(s: Scene, i: number, dur: number, dir: string, last: boolean): Promise<string> {
  const len = dur + FADE + (last ? TAIL : 0);
  const z = i % 2 === 0 ? `(1+0.07*t/${len.toFixed(2)})` : `(1.07-0.07*t/${len.toFixed(2)})`;
  const vf = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${FPS}`,
    `scale=w='trunc(${W}*${z}/2)*2':h=-2:eval=frame:flags=bicubic`, `crop=${W}:${H}`, 'setsar=1',
    'eq=brightness=-0.04:saturation=1.1:contrast=1.04',
  ].join(',');
  const [c0, c1] = BACKGROUNDS[i % BACKGROUNDS.length];
  const input = s.clip ? ['-stream_loop', '-1', '-i', s.clip] : ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:speed=0.008:r=${FPS}`];
  const video = `${dir}/v${i}.mp4`;
  await run('ffmpeg', ['-y', '-v', 'error', ...input, '-t', len.toFixed(3), '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', video]);
  return video;
}

/** All scenes -> one vertical 1080x1920 MP4 with crossfades, captions and clean sound, plus a thumbnail. */
export async function renderVideo(scenes: Scene[], dir: string, out: string, thumb: string, o: RenderOptions = {}): Promise<number> {
  const durs: number[] = [];
  for (const [i, s] of scenes.entries()) durs.push(await cleanLine(s.wav, `${dir}/a${i}.wav`));
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((a, b) => a + b, 0));
  const total = durs.reduce((a, b) => a + b, 0) + TAIL;

  const videos: string[] = [];
  for (const [i, s] of scenes.entries()) videos.push(await renderScene(s, i, durs[i], dir, i === scenes.length - 1));

  await writeFile(`${dir}/a.txt`, scenes.map((_, i) => `file '${resolve(`${dir}/a${i}.wav`)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/a.txt`, '-af', `apad=pad_dur=1`, '-c:a', 'pcm_s16le', `${dir}/voice.wav`]);
  await writeFile(`${dir}/captions.ass`, captionsAss(scenes.map((s, i) => ({ text: s.text, start: starts[i], dur: durs[i] - GAP }))));
  if (o.music) await makeMusic(total + 1, `${dir}/music.wav`);

  // Picture: crossfade scene i into i+1 exactly when line i+1 starts, then burn in the captions.
  const inputs = videos.flatMap((v) => ['-i', v]);
  const graph: string[] = videos.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS}[s${i}]`);
  let last = '[s0]';
  for (let i = 1; i < videos.length; i++) {
    const label = `[x${i}]`;
    graph.push(`${last}[s${i}]xfade=transition=fade:duration=${FADE}:offset=${(starts[i] - FADE / 2).toFixed(3)}${label}`);
    last = label;
  }
  graph.push(`${last}subtitles=${dir}/captions.ass:fontsdir=${FONT_DIR},format=yuv420p[vout]`);

  // Sound: clean up the voice (rumble filter, gentle compression), duck the music under it, TikTok loudness (-14 LUFS).
  const n = videos.length;
  const voice = `[${n}:a]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2`;
  if (o.music) {
    graph.push(`${voice},asplit=2[v1][v2]`);
    graph.push(`[${n + 1}:a]volume=0.55[m]`, `[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`);
    graph.push(`[v1][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[aout]`);
  } else graph.push(`${voice},loudnorm=I=-14:TP=-1.5:LRA=9[aout]`);

  const audioIn = ['-i', `${dir}/voice.wav`, ...(o.music ? ['-i', `${dir}/music.wav`] : [])];
  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, ...audioIn, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-t', total.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', out]);
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', thumb]);
  return durationOf(out);
}

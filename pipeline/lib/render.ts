import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { durationOf, run } from './sh';

export const W = 720;
export const H = 1280;
const GAP = 0.25; // seconds of silence between lines
const FONT = process.env.CAPTION_FONT ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const BACKGROUNDS = ['0x1e1b4b', '0x0f172a', '0x164e63', '0x3b0764', '0x14532d'];

export interface Scene {
  text: string;
  wav: string; // the spoken line
  clip: string | null; // stock video, or null for a plain background
}

/** Split a line into short caption chunks (max 3 words / 16 letters) timed by their length. */
export function chunks(text: string, dur: number): { text: string; from: number; to: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const groups: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    const next = [...cur, w].join(' ');
    if (cur.length && (cur.length >= 3 || next.length > 16)) {
      groups.push(cur.join(' '));
      cur = [w];
    } else cur.push(w);
  }
  if (cur.length) groups.push(cur.join(' '));
  const total = groups.reduce((t, g) => t + g.length + 2, 0);
  let t = 0;
  return groups.map((g) => {
    const d = (dur * (g.length + 2)) / total;
    const c = { text: g, from: t, to: t + d };
    t += d;
    return c;
  });
}

/** One scene: footage (or background) cropped to 9:16, darkened a little, with big captions. */
async function renderScene(s: Scene, i: number, dir: string): Promise<{ video: string; audio: string; dur: number }> {
  const audio = `${dir}/a${i}.wav`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', s.wav, '-af', `apad=pad_dur=${GAP}`, '-ar', '44100', '-ac', '2', audio]);
  const dur = await durationOf(audio);
  const caps = chunks(s.text, dur - GAP);
  const draw: string[] = [];
  for (const [j, c] of caps.entries()) {
    const file = `${dir}/c${i}_${j}.txt`;
    await writeFile(file, c.text.toUpperCase());
    draw.push(
      `drawtext=fontfile=${FONT}:textfile=${file}:fontsize=${c.text.length > 12 ? 52 : 62}:fontcolor=white:borderw=7:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.62:enable='between(t,${c.from.toFixed(2)},${(c.to + (j === caps.length - 1 ? GAP : 0)).toFixed(2)})'`,
    );
  }
  const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, 'fps=30', 'setsar=1', 'eq=brightness=-0.05:saturation=1.08', ...draw].join(',');
  const input = s.clip ? ['-stream_loop', '-1', '-i', s.clip] : ['-f', 'lavfi', '-i', `color=c=${BACKGROUNDS[i % BACKGROUNDS.length]}:s=${W}x${H}:r=30`];
  const video = `${dir}/v${i}.mp4`;
  await run('ffmpeg', ['-y', '-v', 'error', ...input, '-t', dur.toFixed(3), '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', video]);
  return { video, audio, dur };
}

/** All scenes -> one vertical MP4 (720x1280, ~4-8 MB for 45 s) + a thumbnail. */
export async function renderVideo(scenes: Scene[], dir: string, out: string, thumb: string): Promise<number> {
  const parts = [];
  for (const [i, s] of scenes.entries()) parts.push(await renderScene(s, i, dir));
  await writeFile(`${dir}/v.txt`, parts.map((p) => `file '${resolve(p.video)}'`).join('\n'));
  await writeFile(`${dir}/a.txt`, parts.map((p) => `file '${resolve(p.audio)}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/v.txt`, '-f', 'concat', '-safe', '0', '-i', `${dir}/a.txt`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out]);
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', out, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', thumb]);
  return durationOf(out);
}

import { existsSync } from 'node:fs';
import { run } from './sh';

/**
 * AI voice with Piper (free, open source, runs inside the GitHub Action, no account needed).
 * The workflow downloads the program and two voices into PIPER_DIR.
 */
const VOICES = { female: 'en_US-amy-medium', male: 'en_US-ryan-medium' } as const;

export function voiceName(v: 'female' | 'male'): string {
  return VOICES[v];
}

export async function speak(text: string, voice: 'female' | 'male', outWav: string, fast: boolean): Promise<void> {
  const dir = process.env.PIPER_DIR ?? '.piper';
  const bin = `${dir}/piper/piper`;
  if (process.env.TTS_FAKE === '1' || !existsSync(bin)) {
    if (process.env.TTS_FAKE !== '1') throw new Error(`Piper not found at ${bin}.`);
    // Local test only: a quiet tone as long as the line would take to read.
    const secs = Math.max(1.2, text.split(/\s+/).length / 2.6);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${secs.toFixed(2)}`, '-af', 'volume=0.05', '-ar', '22050', '-ac', '1', outWav]);
    return;
  }
  await run(bin, ['-m', `${dir}/${VOICES[voice]}.onnx`, '-f', outWav, '--length_scale', fast ? '0.88' : '0.97', '--sentence_silence', '0.1'], text);
}

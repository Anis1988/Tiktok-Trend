import { existsSync } from 'node:fs';
import { run } from './sh';
import type { VoiceId } from '../../src/lib/types';

/**
 * AI voice, free and run inside the GitHub Action:
 * - Kokoro (natural-sounding, open source). The workflow installs `kokoro-js`; the voice model downloads on first use.
 * - Piper (older, more robotic) as a fallback if Kokoro fails. The workflow downloads it into PIPER_DIR.
 */
type Kokoro = { generate: (text: string, o: { voice: string; speed?: number }) => Promise<{ save: (path: string) => void | Promise<void> }> };

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const PIPER = { female: 'en_US-amy-medium', male: 'en_US-ryan-medium' } as const;
const OLD: Record<'female' | 'male', VoiceId> = { female: 'af_heart', male: 'am_michael' };

/** Saved settings may still say 'female' / 'male' (Piper days): use the matching Kokoro voice. */
export const kokoroVoice = (v: VoiceId): Exclude<VoiceId, 'female' | 'male'> => (v === 'female' || v === 'male' ? OLD[v] : v) as Exclude<VoiceId, 'female' | 'male'>;
const piperFor = (v: VoiceId) => PIPER[/^(am|bm)_|^male$/.test(v) ? 'male' : 'female'];

let kokoro: Promise<Kokoro> | null = null;
let kokoroBroken = '';
let used = '';

async function loadKokoro(): Promise<Kokoro> {
  const name = 'kokoro-js'; // installed by the workflow only (big), so the website build stays small
  const mod = (await import(name)) as { KokoroTTS: { from_pretrained: (id: string, o: object) => Promise<Kokoro> } };
  return mod.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'cpu' });
}

/** The voice actually used for this video (shown in the app). */
export const voiceUsed = () => used;

/** `pace`: true = a bit lively (1.08x), false = normal, or an exact speed (voice acting: 0.9 calm … 1.15 hype). */
export async function speak(text: string, voice: VoiceId, outWav: string, pace: boolean | number): Promise<void> {
  const speed = typeof pace === 'number' ? Math.min(1.25, Math.max(0.8, pace)) : pace ? 1.08 : 1;
  if (process.env.TTS_FAKE === '1') {
    // Local test only: a quiet tone as long as the line would take to read.
    const secs = Math.max(1.2, text.split(/\s+/).length / 2.6 / speed);
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${secs.toFixed(2)}`, '-af', 'volume=1.5', '-ar', '24000', '-ac', '1', outWav]);
    used = 'test tone';
    return;
  }
  if (!kokoroBroken) {
    try {
      kokoro ??= loadKokoro();
      const v = kokoroVoice(voice);
      const audio = await (await kokoro).generate(text, { voice: v, speed });
      await audio.save(outWav);
      used = `Kokoro ${v}`;
      return;
    } catch (e) {
      kokoroBroken = e instanceof Error ? e.message : String(e);
      console.log(`Kokoro voice failed, using Piper instead: ${kokoroBroken}`);
    }
  }
  const dir = process.env.PIPER_DIR ?? '.piper';
  const bin = `${dir}/piper/piper`;
  if (!existsSync(bin)) throw new Error(`No voice available (Kokoro: ${kokoroBroken}; Piper not found at ${bin}).`);
  const model = piperFor(voice);
  await run(bin, ['-m', `${dir}/${model}.onnx`, '-f', outWav, '--length_scale', (0.97 / speed).toFixed(2), '--sentence_silence', '0.1'], text);
  used = `Piper ${model}`;
}

import { fileURLToPath } from 'node:url';
import { run } from './sh';

/** Size of a picture and where its main face is (0..1 of width / height), if one was found. */
export interface FaceInfo { w: number; h: number; fx?: number; fy?: number }

/** Faces for many pictures in one go (OpenCV, free). Null for a picture that couldn't be read or if OpenCV is missing. */
export async function findFaces(paths: string[]): Promise<(FaceInfo | null)[]> {
  if (!paths.length || process.env.FACES === '0') return paths.map(() => null);
  try {
    const script = fileURLToPath(new URL('../faces.py', import.meta.url));
    const out = await run('python3', [script], JSON.stringify(paths));
    const res = JSON.parse(out.trim().split('\n').pop() ?? '[]') as (FaceInfo | null)[];
    return paths.map((_, i) => res[i] ?? null);
  } catch (e) {
    console.log('Face finding skipped (pictures zoom to the middle):', e instanceof Error ? e.message.slice(0, 200) : e);
    return paths.map(() => null);
  }
}

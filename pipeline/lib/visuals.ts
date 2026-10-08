import { writeFile } from 'node:fs/promises';
import type { DraftLine, MediaItem } from '../../src/lib/types';
import { partKey } from '../../netlify/lib/media';
import { store } from '../../netlify/lib/store';
import { durationOf } from './sh';
import { findClip } from './footage';
import { findReal } from './realmedia';
import { characterPicture, objectPhoto } from './pictures';
import type { Scene } from './render';

export interface Credit { by: string; url: string; site?: string }

/** Puts one of your clips back together from its pieces. */
async function fetchMedia(item: MediaItem, out: string): Promise<boolean> {
  const files = store('tt-media');
  const parts: Buffer[] = [];
  for (let n = 0; n < item.parts; n++) {
    const buf = (await files.get(partKey(item.id, n), { type: 'arrayBuffer' })) as ArrayBuffer | null;
    if (!buf) return false;
    parts.push(Buffer.from(buf));
  }
  await writeFile(out, Buffer.concat(parts));
  return true;
}

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * What to show behind one line, best first: your clip (picked or matched by tag) -> the character's picture (if
 * "Character pictures" is on) -> a free real photo / clip of the person, place or event -> a free photo of the object
 * -> stock footage -> a moving colour background.
 */
export async function visualFor(
  l: DraftLine, i: number, dir: string,
  o: { mine: MediaItem | null; real: boolean; characters: boolean; used: Set<string>; credits: Credit[] },
): Promise<Pick<Scene, 'clip' | 'clipStart' | 'image' | 'credit'>> {
  if (o.mine) {
    const out = `${dir}/mine${i}.${EXT[o.mine.type] ?? 'bin'}`;
    if (await fetchMedia(o.mine, out).catch(() => false)) {
      if (o.mine.kind === 'image') return { clip: null, image: out };
      // Long clips: start somewhere random, so the same clip looks different from video to video.
      const d = await durationOf(out).catch(() => 0);
      return { clip: out, clipStart: d > 12 ? Math.random() * (d - 10) : 0 };
    }
  }
  if (o.characters && l.character?.trim()) {
    const c = await characterPicture(l.character, `${dir}/char${i}.jpg`).catch((e) => (console.log(`Character "${l.character}" failed:`, e instanceof Error ? e.message : e), null));
    if (c) {
      o.credits.push({ by: c.by, url: c.url, site: c.site });
      return { clip: null, image: c.path, credit: c.credit };
    }
    console.log(`Scene ${i + 1}: no picture found for character "${l.character}"`);
  }
  if (o.real && l.real?.trim()) {
    const r = await findReal(l.real, `${dir}/real${i}`);
    if (r) {
      o.credits.push({ by: r.by, url: r.url, site: r.site });
      return r.kind === 'image' ? { clip: null, image: r.path, credit: r.credit } : { clip: r.path, credit: r.credit };
    }
  }
  if (l.object?.trim()) {
    const p = await objectPhoto(l.object, `${dir}/obj${i}.jpg`, o.used);
    if (p) {
      o.credits.push({ by: p.by, url: p.url, site: p.site });
      return { clip: null, image: p.path, credit: p.credit };
    }
  }
  const clip = await findClip(l.footage, o.used, `${dir}/clip${i}.mp4`);
  if (clip) o.credits.push({ by: clip.by, url: clip.url, site: clip.site });
  return { clip: clip?.path ?? null };
}

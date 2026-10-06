import type { DraftLine, MediaItem } from '../../src/lib/types';
import { readJson, store, writeJson } from './store';

/** "My clips": your own videos and pictures, stored in pieces of up to 4 MB (Netlify functions take 6 MB at most). */
export const PART_BYTES = 4 * 1024 * 1024;
export const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_ITEMS = 40;
export const TYPES: Record<string, MediaItem['kind']> = {
  'video/mp4': 'video', 'video/quicktime': 'video', 'video/webm': 'video', 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
};

export const listMedia = () => readJson<MediaItem[]>('media', []);
export const saveMedia = (items: MediaItem[]) => writeJson('media', items);
export const partKey = (id: string, n: number) => `${id}.${n}`;

export async function deleteMedia(item: MediaItem): Promise<void> {
  const files = store('tt-media');
  await Promise.all(Array.from({ length: item.parts }, (_, n) => files.delete(partKey(item.id, n))));
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;

/**
 * Which of your clips to show for each scene: a clip you picked for that line, otherwise the first unused ready clip
 * whose tag appears in the line (or its real-thing / footage words). Each clip is used once per video.
 */
export function chooseMedia(lines: DraftLine[], items: MediaItem[], auto: boolean): (MediaItem | null)[] {
  const ready = items.filter((m) => m.ready);
  const used = new Set<string>();
  return lines.map((l) => {
    if (l.media === 'stock') return null;
    const pinned = l.media && ready.find((m) => m.id === l.media);
    if (pinned) return used.add(pinned.id), pinned;
    if (!auto) return null;
    const hay = words(`${l.text} ${l.real ?? ''} ${l.footage}`);
    const hit = ready.find((m) => !used.has(m.id) && m.tags.some((t) => t.trim() && hay.includes(words(t))));
    if (hit) used.add(hit.id);
    return hit ?? null;
  });
}

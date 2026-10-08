import { writeFile } from 'node:fs/promises';
import type { DraftLine, MediaItem } from '../../src/lib/types';
import { partKey } from '../../netlify/lib/media';
import { store } from '../../netlify/lib/store';
import { durationOf, run } from './sh';
import { findClip } from './footage';
import { findReal } from './realmedia';
import { characterPicture, objectPhoto } from './pictures';
import { chartClip, commentClip, headlineClip, kineticClip, mapClip, timelineClip, versusClip } from './graphics';
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

/** What a scene ended up showing (for the quality check). */
export type VisualKind = 'mine' | 'comment' | 'headline' | 'chart' | 'map' | 'timeline' | 'versus' | 'character' | 'real' | 'object' | 'text' | 'stock' | 'none';
export type Visual = Pick<Scene, 'clip' | 'clipStart' | 'image' | 'credit'> & { kind: VisualKind };

const fail = (what: string) => (e: unknown) => (console.log(`${what} failed:`, e instanceof Error ? e.message : e), false);

/** A still picture of a named thing (for "This or that"): a real photo, else a photo of the object. */
async function stillOf(name: string, out: string, o: { real: boolean; used: Set<string>; credits: Credit[] }): Promise<string | null> {
  if (o.real) {
    const r = await findReal(name, out.replace(/\.jpg$/, '')).catch(() => null);
    if (r?.kind === 'image') return (o.credits.push({ by: r.by, url: r.url, site: r.site }), r.path);
    if (r?.kind === 'video') {
      // A clip (NASA): take one frame from it.
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', r.path, '-frames:v', '1', '-q:v', '3', out]).catch(() => undefined);
      return (o.credits.push({ by: r.by, url: r.url, site: r.site }), out);
    }
  }
  const p = await objectPhoto(name, out, o.used).catch(() => null);
  return p ? (o.credits.push({ by: p.by, url: p.url, site: p.site }), p.path) : null;
}

/**
 * What to show behind one line, best first: your clip (picked or matched by tag) -> a reply's comment bubble ->
 * the news headline card -> an animated chart, map or timeline (if "Charts & maps" is on) -> "This or that" pictures
 * -> the character's picture (if "Character pictures" is on) -> a free real photo / clip of the person, place or event
 * -> a free photo of the object -> big animated words -> stock footage -> a moving colour background.
 */
export async function visualFor(
  l: DraftLine, i: number, dir: string,
  o: { mine: MediaItem | null; real: boolean; characters: boolean; charts?: boolean; headlines?: boolean; accent?: string; used: Set<string>; credits: Credit[] },
): Promise<Visual> {
  const accent = o.accent ?? '#22D3EE';
  if (o.mine) {
    const out = `${dir}/mine${i}.${EXT[o.mine.type] ?? 'bin'}`;
    if (await fetchMedia(o.mine, out).catch(() => false)) {
      if (o.mine.kind === 'image') return { clip: null, image: out, kind: 'mine' };
      // Long clips: start somewhere random, so the same clip looks different from video to video.
      const d = await durationOf(out).catch(() => 0);
      return { clip: out, clipStart: d > 12 ? Math.random() * (d - 10) : 0, kind: 'mine' };
    }
  }
  if (l.comment?.text) {
    const out = `${dir}/comment${i}.mp4`;
    if (await commentClip(l.comment, out, accent).catch(fail('Comment bubble'))) return { clip: out, kind: 'comment' };
  }
  if (o.headlines !== false && l.headline?.title) {
    const out = `${dir}/head${i}.mp4`;
    if (await headlineClip(l.headline, out, accent).catch(fail('Headline card'))) return { clip: out, kind: 'headline' }; // the card names the source
  }
  if (o.charts !== false && l.chart && l.chart.bars.length >= 2) {
    const out = `${dir}/chart${i}.mp4`;
    if (await chartClip(l.chart, out, accent).catch(fail('Chart'))) return { clip: out, kind: 'chart' };
  }
  if (o.charts !== false && l.map?.trim()) {
    const out = `${dir}/map${i}.mp4`;
    if (await mapClip(l.map, out, accent).catch(fail(`Map "${l.map}"`))) {
      o.credits.push({ by: 'Natural Earth', url: 'https://www.naturalearthdata.com', site: 'Map data' });
      return { clip: out, credit: 'Map data: Natural Earth', kind: 'map' };
    }
  }
  if (o.charts !== false && l.timeline && l.timeline.events.length >= 2) {
    const out = `${dir}/timeline${i}.mp4`;
    if (await timelineClip(l.timeline, out, accent).catch(fail('Timeline'))) return { clip: out, kind: 'timeline' };
  }
  if (l.versus?.a && l.versus.b) {
    const [a, b] = [await stillOf(l.versus.a, `${dir}/vsa${i}.jpg`, o), await stillOf(l.versus.b, `${dir}/vsb${i}.jpg`, o)];
    const out = `${dir}/versus${i}.mp4`;
    if (a && b && (await versusClip({ name: l.versus.a, image: a }, { name: l.versus.b, image: b }, out, accent, dir).catch(fail('This or that')))) return { clip: out, kind: 'versus' };
    console.log(`Scene ${i + 1}: pictures missing for "${l.versus.a}" or "${l.versus.b}"`);
  }
  if (o.characters && l.character?.trim()) {
    const c = await characterPicture(l.character, `${dir}/char${i}.jpg`).catch((e) => (console.log(`Character "${l.character}" failed:`, e instanceof Error ? e.message : e), null));
    if (c) {
      o.credits.push({ by: c.by, url: c.url, site: c.site });
      return { clip: null, image: c.path, credit: c.credit, kind: 'character' };
    }
    console.log(`Scene ${i + 1}: no picture found for character "${l.character}"`);
  }
  if (o.real && l.real?.trim()) {
    const r = await findReal(l.real, `${dir}/real${i}`);
    if (r) {
      o.credits.push({ by: r.by, url: r.url, site: r.site });
      return r.kind === 'image' ? { clip: null, image: r.path, credit: r.credit, kind: 'real' } : { clip: r.path, credit: r.credit, kind: 'real' };
    }
  }
  if (l.object?.trim()) {
    const p = await objectPhoto(l.object, `${dir}/obj${i}.jpg`, o.used);
    if (p) {
      o.credits.push({ by: p.by, url: p.url, site: p.site });
      return { clip: null, image: p.path, credit: p.credit, kind: 'object' };
    }
  }
  if (l.bigText?.trim()) {
    const out = `${dir}/text${i}.mp4`;
    if (await kineticClip(l.bigText, out, accent).catch(fail('Animated text'))) return { clip: out, kind: 'text' };
  }
  const clip = await findClip(l.footage, o.used, `${dir}/clip${i}.mp4`);
  if (clip) o.credits.push({ by: clip.by, url: clip.url, site: clip.site });
  return { clip: clip?.path ?? null, kind: clip ? 'stock' : 'none' };
}

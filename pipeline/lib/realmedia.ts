import { writeFile } from 'node:fs/promises';

/**
 * Real photos and clips that are free to use, for the people, places and events a script mentions:
 * - Wikimedia Commons (via the Wikipedia article's main photo, or a Commons search): free licences only, with credit.
 * - NASA image and video library: public domain (space, science, Earth).
 * Never news-agency, TV, film, anime or game footage: those are copyrighted.
 */
export interface RealMedia {
  kind: 'image' | 'video';
  path: string;
  credit: string; // shown on screen, e.g. "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons"
  url: string; // page of the file, for the credits list
  site: 'Wikimedia' | 'NASA';
  by: string;
}

const UA = 'TrendVideos/1.0 (https://tiktok-trend.netlify.app; personal project)';
const MAX_BYTES = 60_000_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function download(url: string, out: string): Promise<boolean> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) return false;
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES || buf.length < 2000) return false;
  await writeFile(out, buf);
  return true;
}

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Free licences only (no "non-commercial", no "no derivatives"). */
export function freeLicence(name: string): boolean {
  const n = name.trim();
  if (!n || /\b(NC|ND)\b|non-?commercial|no ?deriv|fair use/i.test(n)) return false;
  return /^(CC0|CC BY(-SA)?( \d(\.\d)?)?|Public domain|PD\b|PDM)/i.test(n);
}

interface CommonsInfo {
  thumburl?: string; url: string; width: number; height: number; mime: string; descriptionurl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}
type Pages = { query?: { pages?: Record<string, { title?: string; missing?: string; imageinfo?: CommonsInfo[]; pageimage?: string }> } };

/** Picks a usable Commons file (free licence, big enough, photo-like) and returns it with its credit. */
export function pickCommons(pages: Pages, mustContain: string[] = []): { url: string; credit: string; page: string; by: string } | null {
  for (const p of Object.values(pages.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || p.missing !== undefined) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(ii.mime) || ii.width < 700 || ii.height < 500) continue;
    const title = (p.title ?? '').toLowerCase();
    if (mustContain.some((w) => !title.includes(w))) continue;
    const meta = ii.extmetadata ?? {};
    const licence = strip(meta.LicenseShortName?.value) || strip(meta.UsageTerms?.value);
    if (!freeLicence(licence)) continue;
    const by = (strip(meta.Artist?.value) || 'Unknown').slice(0, 40);
    return { url: ii.thumburl ?? ii.url, credit: `Photo: ${by} · ${licence} · Wikimedia Commons`, page: ii.descriptionurl ?? ii.url, by };
  }
  return null;
}

const commonsInfo = (q: string) =>
  `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1600&${q}`;

/** The main photo of the matching Wikipedia article, if it is a free file on Commons; else a Commons search. */
async function wikimedia(query: string, out: string): Promise<RealMedia | null> {
  const wiki = await getJson<Pages>(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&piprop=name`);
  const name = Object.values(wiki.query?.pages ?? {})[0]?.pageimage;
  let found = name ? pickCommons(await getJson<Pages>(commonsInfo(`titles=${encodeURIComponent(`File:${name}`)}`))) : null;
  if (!found) {
    // Commons search: only files whose name contains every word of the query (so it is really about it).
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    found = pickCommons(await getJson<Pages>(commonsInfo(`generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}`)), words);
  }
  if (!found || !(await download(found.url, out))) return null;
  return { kind: 'image', path: out, credit: found.credit, url: found.page, site: 'Wikimedia', by: found.by };
}

interface NasaSearch { collection?: { items?: { href: string; data?: { nasa_id: string; title?: string; center?: string }[] }[] } }

/** NASA's library (public domain): a short video if one fits, otherwise a photo. */
async function nasa(query: string, outBase: string): Promise<RealMedia | null> {
  for (const type of ['video', 'image'] as const) {
    const s = await getJson<NasaSearch>(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${type}&page_size=6`);
    for (const item of s.collection?.items ?? []) {
      const files = await getJson<string[]>(item.href.replace(/^http:/, 'https:').replace(/ /g, '%20')).catch(() => [] as string[]);
      const pref = type === 'video' ? ['~mobile.mp4', '~medium.mp4', '~small.mp4'] : ['~large.jpg', '~medium.jpg', '~orig.jpg'];
      const file = pref.map((p) => files.find((f) => f.endsWith(p))).find(Boolean);
      if (!file) continue;
      const out = `${outBase}.${type === 'video' ? 'mp4' : 'jpg'}`;
      if (!(await download(file.replace(/^http:/, 'https:').replace(/ /g, '%20'), out))) continue;
      const id = item.data?.[0]?.nasa_id ?? '';
      return { kind: type, path: out, credit: `${type === 'video' ? 'Video' : 'Photo'}: NASA${item.data?.[0]?.center ? ` (${item.data[0].center})` : ''}`, url: `https://images.nasa.gov/details/${encodeURIComponent(id)}`, site: 'NASA', by: 'NASA' };
    }
  }
  return null;
}

const SPACE = /\b(nasa|space|rocket|launch|moon|lunar|mars|jupiter|saturn|venus|mercury|planet|galaxy|nebula|star|sun|solar|eclipse|comet|asteroid|meteor|telescope|webb|hubble|astronaut|iss|space station|artemis|orbit|aurora|hurricane|earth from)\b/i;

/** A real photo or clip of `query`, or null. Space and science: NASA first, then Wikimedia. Everything else: Wikimedia only. */
export async function findReal(query: string, outBase: string): Promise<RealMedia | null> {
  const q = query.trim().slice(0, 80);
  if (!q) return null;
  const order = SPACE.test(q) ? [nasa, wikimedia] : [wikimedia]; // NASA only for space and science topics
  for (const source of order) {
    try {
      const r = source === wikimedia ? await wikimedia(q, `${outBase}.jpg`) : await nasa(q, outBase);
      if (r) return r;
    } catch (e) {
      console.log(`Real media "${q}" (${source.name}) failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

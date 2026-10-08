import { writeFile } from 'node:fs/promises';

/**
 * Pictures of what a line talks about:
 * - characterPicture: the official picture of an anime / manga character (AniList, free API, no key). These pictures
 *   belong to the studios (copyrighted): only used when "Character pictures" is on.
 * - objectPhoto: a free photo of a concrete thing ("apple", "basketball"): Pixabay (key you already have), then Pexels.
 */
export interface Picture { path: string; credit: string; by: string; url: string; site: string }

const UA = 'TrendVideos/1.0 (https://tiktok-trend.netlify.app; personal project)';

async function download(url: string, out: string): Promise<boolean> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000 || buf.length > 30_000_000) return false;
  await writeFile(out, buf);
  return true;
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2);

interface AniChar {
  name: { full: string; alternative?: string[] };
  image?: { large?: string };
  siteUrl: string;
  media?: { nodes: { title: { romaji?: string; english?: string; native?: string } }[] };
}

/** "Levi Ackerman | Attack on Titan" -> the character whose name and series both match. */
export function matchCharacter(chars: AniChar[], name: string, work: string): AniChar | null {
  const want = words(name);
  const from = words(work);
  for (const c of chars) {
    if (!c.image?.large || /\/default\./.test(c.image.large)) continue;
    const names = words([c.name.full, ...(c.name.alternative ?? [])].join(' '));
    if (!want.some((w) => names.includes(w))) continue;
    if (from.length) {
      const titles = words((c.media?.nodes ?? []).map((n) => `${n.title.romaji ?? ''} ${n.title.english ?? ''}`).join(' '));
      if (!from.some((w) => titles.includes(w))) continue;
    }
    return c;
  }
  return null;
}

/** AniList (free): the character's official picture. Copyrighted: the credit says so. */
export async function characterPicture(spec: string, out: string): Promise<Picture | null> {
  const [name, work = ''] = spec.split('|').map((x) => x.trim());
  if (!name) return null;
  const query = `query($q:String){Page(perPage:8){characters(search:$q,sort:[SEARCH_MATCH,FAVOURITES_DESC]){name{full alternative}image{large}siteUrl media(perPage:4){nodes{title{romaji english}}}}}}`;
  // The full name first, then the longest single name (some characters are listed as just "Levi" or "Eren Yeager").
  const longest = words(name).sort((x, y) => y.length - x.length)[0];
  let c: AniChar | null = null;
  for (const q of [...new Set([name.slice(0, 60), longest].filter(Boolean))]) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query, variables: { q } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`AniList: HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { Page?: { characters?: AniChar[] } } };
    c = matchCharacter(j.data?.Page?.characters ?? [], name, work);
    if (c) break;
  }
  if (!c || !(await download(c.image!.large!, out))) return null;
  const owner = work || c.media?.nodes[0]?.title.english || c.media?.nodes[0]?.title.romaji || 'its creators';
  return { path: out, credit: `Image: AniList · © ${owner}`.slice(0, 80), by: `© ${owner}`, url: c.siteUrl, site: 'AniList' };
}

/** A free photo of a thing: Pixabay first, then Pexels (if you have a key). Never the same photo twice in one video. */
export async function objectPhoto(query: string, out: string, used: Set<string>): Promise<Picture | null> {
  const q = query.trim().slice(0, 80);
  if (!q) return null;
  const pix = process.env.PIXABAY_API_KEY;
  if (pix) {
    try {
      const res = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(pix)}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&min_width=900&per_page=12`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
      const j = (await res.json()) as { hits?: { id: number; largeImageURL: string; pageURL: string; user: string }[] };
      for (const h of j.hits ?? []) {
        const key = `pixabay-photo:${h.id}`;
        if (used.has(key) || !(await download(h.largeImageURL, out))) continue;
        used.add(key);
        return { path: out, credit: `Photo: ${h.user} · Pixabay`.slice(0, 80), by: h.user, url: h.pageURL, site: 'Pixabay' };
      }
    } catch (e) {
      console.log(`Photo search "${q}" (Pixabay) failed:`, e instanceof Error ? e.message : e);
    }
  }
  const pex = process.env.PEXELS_API_KEY;
  if (pex) {
    try {
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12`, { headers: { Authorization: pex }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
      const j = (await res.json()) as { photos?: { id: number; url: string; photographer: string; src: { large2x: string } }[] };
      for (const p of j.photos ?? []) {
        const key = `pexels-photo:${p.id}`;
        if (used.has(key) || !(await download(p.src.large2x, out))) continue;
        used.add(key);
        return { path: out, credit: `Photo: ${p.photographer} · Pexels`.slice(0, 80), by: p.photographer, url: p.url, site: 'Pexels' };
      }
    } catch (e) {
      console.log(`Photo search "${q}" (Pexels) failed:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

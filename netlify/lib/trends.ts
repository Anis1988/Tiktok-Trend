import type { Source } from '../../src/lib/types';
import { findCategory, subsOf, type Niche } from '../../src/lib/niches';
import { youtubeReadToken } from './youtube';
export { LISTY } from '../../src/lib/niches';

/** One possible video topic with the headlines behind it. */
export interface Candidate {
  topic: string;
  traffic?: string; // Google Trends' rough search count, e.g. "200K+"
  headlines: Source[];
  /** A topic video (not news): rankings, "top 10", fun facts… written from well-known facts, no headlines needed. */
  evergreen?: boolean;
}


const UA = 'Mozilla/5.0 (compatible; TrendVideos/1.0)';

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};
const items = (xml: string) => xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
const entries = (xml: string) => xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];

/** Fetches a page. `tries` > 1 retries a busy site (HTTP 429 / 5xx or no answer) after a short wait. */
async function get(url: string, tries = 1, ms = 10_000): Promise<string> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) }).catch((e: unknown) => e as Error);
    if (res instanceof Response && res.ok) return res.text();
    const err = res instanceof Response ? new Error(`${new URL(url).hostname}: HTTP ${res.status}`) : new Error(`${new URL(url).hostname}: ${res.message}`);
    const busy = !(res instanceof Response) || res.status === 429 || res.status >= 500;
    if (!busy || i >= tries) throw err;
    await new Promise((r) => setTimeout(r, 3000 * i));
  }
}

/** What people are searching for today (Google Trends daily RSS, free). */
export async function googleTrends(country: string): Promise<Candidate[]> {
  const xml = await get(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(country)}`);
  return items(xml).slice(0, 20).map((it) => {
    const news = it.match(/<ht:news_item>[\s\S]*?<\/ht:news_item>/gi) ?? [];
    return {
      topic: tag(it, 'title'),
      traffic: tag(it, 'ht:approx_traffic') || undefined,
      headlines: news.slice(0, 3).map((n) => ({ title: tag(n, 'ht:news_item_title'), url: tag(n, 'ht:news_item_url'), site: tag(n, 'ht:news_item_source') || undefined })),
    };
  }).filter((c) => c.topic && c.headlines.length);
}

const n = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}K` : String(x));
const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Recent Google News headlines about a name (no retries; empty if none or busy). */
async function newsAbout(q: string, country: string, max = 4): Promise<Source[]> {
  try {
    const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(`"${q}" when:2d`)}&hl=en-${country}&gl=${country}&ceid=${country}:en`, 1, 5000);
    return items(xml).slice(0, max).map((it) => ({ title: tag(it, 'title'), url: tag(it, 'link'), site: tag(it, 'source') || undefined })).filter((h) => h.title);
  } catch {
    return [];
  }
}

interface WikiArticle {
  views?: number; normalizedtitle?: string; titles?: { normalized?: string }; title: string; type?: string; extract?: string; description?: string;
  view_history?: { views: number }[]; content_urls?: { desktop?: { page?: string } };
}
const SKIP_WIKI = /^(Main Page|Special:|Wikipedia:|Portal:|File:|Help:|Deaths in|List of|\d{4} in |Cleopatra$|Google$|YouTube$|Facebook$|ChatGPT$|Pornhub|XXX|XHamster|Xvideos)/i;

/**
 * Wikipedia (free, no key): yesterday's most-read articles that suddenly jumped (at least twice their usual views),
 * and the "In the news" stories. What people are curious about right now, with the latest headlines about each.
 */
export async function wikipediaTrends(country: string): Promise<Candidate[]> {
  const d = new Date(Date.now() - 86400_000);
  const date = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  const j = JSON.parse(await get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${date}`, 1, 6000)) as {
    mostread?: { articles?: WikiArticle[] };
    news?: { story?: string; links?: WikiArticle[] }[];
  };
  const name = (a: WikiArticle) => a.normalizedtitle ?? a.titles?.normalized ?? a.title.replace(/_/g, ' ');
  const page = (a: WikiArticle) => a.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title)}`;
  const about = (a: WikiArticle): Source => ({ title: `Wikipedia: ${name(a)}${a.description ? ` (${a.description})` : ''}. ${(a.extract ?? '').slice(0, 280)}`, url: page(a), site: 'Wikipedia' });

  const spikes = (j.mostread?.articles ?? [])
    .filter((a) => a.type !== 'disambiguation' && !SKIP_WIKI.test(name(a)))
    .filter((a) => {
      const past = (a.view_history ?? []).slice(0, -1).map((h) => h.views);
      const usual = past.length ? past.reduce((t, v) => t + v, 0) / past.length : 0;
      return !usual || (a.views ?? 0) >= 2 * usual; // a sudden jump, not an always-popular page
    })
    .slice(0, 8);
  const read = await Promise.all(spikes.map(async (a) => ({
    topic: name(a), traffic: `${n(a.views ?? 0)} Wikipedia reads yesterday`,
    headlines: [...(await newsAbout(name(a), country)), about(a)],
  })));
  const news = (j.news ?? []).slice(0, 5).flatMap((x) => {
    const a = x.links?.[0];
    const story = stripHtml(x.story);
    return a && story ? [{ topic: name(a), headlines: [{ title: `In the news (Wikipedia): ${story}`, url: page(a), site: 'Wikipedia' }, about(a)] }] : [];
  });
  // Articles with fresh headlines first: their facts explain why people are reading.
  return [...news, ...read.sort((x, y) => Number(y.headlines.length > 1) - Number(x.headlines.length > 1))];
}

/**
 * TikTok's trending hashtags (TikTok Creative Center, best-effort: TikTok has no official free feed, so this often
 * fails and the series then uses the other sources). Never throws.
 */
export async function tiktokTrends(country: string): Promise<{ tags: string[]; error?: string }> {
  try {
    const q = new URLSearchParams({ page: '1', limit: '30', period: '7', country_code: country, sort_by: 'popular' });
    const res = await fetch(`https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?${q}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: 'application/json', Referer: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { tags: [], error: `HTTP ${res.status}` };
    const j = (await res.json().catch(() => null)) as { code?: number; msg?: string; data?: { list?: { hashtag_name?: string }[] } } | null;
    const tags = (j?.data?.list ?? []).map((x) => x.hashtag_name?.trim() ?? '').filter(Boolean);
    return tags.length ? { tags } : { tags: [], error: j?.msg || 'no hashtags in the answer' };
  } catch (e) {
    return { tags: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Who and what is trending today, as short lines for the daily series (the AI prefers a famous name from here that
 * fits the subject): Wikipedia's most-read, Google Trends searches and TikTok hashtags. Free; each source may fail.
 */
export async function seriesTrending(country: string): Promise<{ lines: string[]; log: string[] }> {
  const log: string[] = [];
  const d = new Date(Date.now() - 86400_000);
  const date = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  const [wiki, google, tiktok] = await Promise.all([
    get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${date}`, 1, 8000).then((t) => {
      const j = JSON.parse(t) as { mostread?: { articles?: WikiArticle[] } };
      return (j.mostread?.articles ?? []).filter((a) => a.type !== 'disambiguation').map((a) => ({ name: a.normalizedtitle ?? a.titles?.normalized ?? a.title.replace(/_/g, ' '), a }))
        .filter((x) => !SKIP_WIKI.test(x.name)).slice(0, 25)
        .map((x) => `${x.name}${x.a.description ? ` (${x.a.description})` : ''}: ${n(x.a.views ?? 0)} Wikipedia reads yesterday`);
    }).catch((e) => { log.push(`Wikipedia failed: ${e instanceof Error ? e.message : e}`); return [] as string[]; }),
    googleTrends(country).then((c) => c.map((x) => `${x.topic}: searched on Google today${x.traffic ? ` (${x.traffic})` : ''}`))
      .catch((e) => { log.push(`Google Trends failed: ${e instanceof Error ? e.message : e}`); return [] as string[]; }),
    tiktokTrends(country),
  ]);
  if (tiktok.error) log.push(`TikTok trends not available (${tiktok.error})`);
  const tags = tiktok.tags.slice(0, 20).map((t) => `#${t}: trending hashtag on TikTok this week`);
  log.unshift(`Trending now: ${wiki.length} Wikipedia, ${google.length} Google, ${tags.length} TikTok`);
  return { lines: [...tags, ...wiki, ...google].slice(0, 60), log };
}

/** YouTube categories that fit each channel niche (for the trending chart). */
const YT_CATEGORY: Record<string, string> = { gaming: '20', tech: '28', sports: '17', movies: '1', music: '10', science: '28', cars: '2', food: '26', travel: '19', viral: '23' };

/**
 * YouTube's "Trending" chart for your country (and niche): what video viewers are watching today. Needs YOUTUBE_API_KEY
 * (free, Google Cloud) or YouTube connected in Settings. Returns nothing when neither is set.
 */
export async function youtubeTrending(country: string, niche?: string): Promise<Candidate[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  const token = key ? null : await youtubeReadToken();
  if (!key && !token) return [];
  const q = new URLSearchParams({ part: 'snippet,statistics', chart: 'mostPopular', regionCode: country, maxResults: '15' });
  const cat = niche ? YT_CATEGORY[niche] : undefined;
  if (cat) q.set('videoCategoryId', cat);
  if (key) q.set('key', key);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube trending: HTTP ${res.status}`);
  const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string; channelTitle?: string; description?: string }; statistics?: { viewCount?: string } }[] };
  return (j.items ?? []).flatMap((v) => {
    const title = v.snippet?.title?.trim();
    if (!title) return [];
    const views = Number(v.statistics?.viewCount ?? 0);
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const desc = (v.snippet?.description ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 20 && !/https?:\/\//.test(l));
    return [{
      topic: `Trending on YouTube: ${title}`, traffic: `${n(views)} YouTube views`,
      headlines: [
        { title: `"${title}" by ${v.snippet?.channelTitle ?? 'a creator'} is trending on YouTube (${n(views)} views)`, url, site: 'YouTube' },
        ...(desc ? [{ title: `From the video description: ${desc.slice(0, 200)}`, url, site: 'YouTube' }] : []),
      ],
    }];
  });
}

/** Today's news for one of your topics (Google News RSS, free). Each headline is its own candidate. */
export async function topicNews(topic: string, country: string): Promise<Candidate[]> {
  const q = encodeURIComponent(`${topic} when:1d`);
  const xml = await get(`https://news.google.com/rss/search?q=${q}&hl=en-${country}&gl=${country}&ceid=${country}:en`);
  return items(xml).slice(0, 8).map((it) => {
    const title = tag(it, 'title');
    const site = tag(it, 'source') || undefined;
    return { topic: `${topic}: ${title}`, headlines: [{ title, url: tag(it, 'link'), site }] };
  }).filter((c) => c.headlines[0].title);
}

/** News about one subject you typed (last 2 days, then last week): one candidate with all its headlines. */
export async function subjectNews(subject: string, country: string): Promise<Candidate | null> {
  // Google News first (retried if busy), then Bing News if Google is down or finds nothing.
  let failed: Error | null = null;
  try {
    for (const when of ['2d', '7d']) {
      const q = encodeURIComponent(`${subject} when:${when}`);
      const xml = await get(`https://news.google.com/rss/search?q=${q}&hl=en-${country}&gl=${country}&ceid=${country}:en`, 3);
      const headlines = items(xml).slice(0, 8).map((it) => ({ title: tag(it, 'title'), url: tag(it, 'link'), site: tag(it, 'source') || undefined })).filter((h) => h.title);
      if (headlines.length) return { topic: subject, headlines };
    }
  } catch (e) {
    failed = e instanceof Error ? e : new Error(String(e));
  }
  try {
    const headlines = await bingNews(subject);
    if (headlines.length) return { topic: subject, headlines };
  } catch (e) {
    const both = `${failed ? `${failed.message}; ` : ''}${e instanceof Error ? e.message : e}`;
    if (failed) throw new Error(`The news search sites are busy (${both}). Try again in a few minutes.`);
  }
  if (failed) throw new Error(`The news search sites are busy (${failed.message}). Try again in a few minutes.`);
  return null;
}

/** Bing News RSS (free, no key): backup when Google News is busy. Links are Bing redirects; the real link is in "url=". */
export async function bingNews(subject: string): Promise<Source[]> {
  const xml = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(subject)}&format=rss`, 2);
  return items(xml).slice(0, 8).map((it) => {
    const link = tag(it, 'link');
    let url = link;
    try { url = new URL(link).searchParams.get('url') || link; } catch { /* keep the Bing link */ }
    return { title: tag(it, 'title'), url, site: tag(it, 'News:Source') || undefined };
  }).filter((h) => h.title && /^https?:\/\//.test(h.url));
}

/** A specialist news site's feed (RSS or Atom), last 2 days. Each headline is its own candidate. */
export async function feedNews(url: string, label: string): Promise<Candidate[]> {
  const xml = await get(url);
  const site = new URL(url).hostname.replace(/^(www|feeds)\./, '');
  const cutoff = Date.now() - 2 * 86400_000;
  const rss = items(xml).map((it) => ({ title: tag(it, 'title'), url: tag(it, 'link'), at: tag(it, 'pubDate') }));
  const atom = entries(xml).map((e) => ({ title: tag(e, 'title'), url: e.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '', at: tag(e, 'updated') || tag(e, 'published') }));
  return [...rss, ...atom]
    .filter((x) => x.title && x.url && (!x.at || isNaN(Date.parse(x.at)) || Date.parse(x.at) >= cutoff))
    .slice(0, 10)
    .map((x) => ({ topic: `${label}: ${x.title}`, headlines: [{ title: x.title, url: x.url, site }] }));
}

/**
 * Today's candidates for your channel: your focus words first, then this turn's subcategory (they take turns, so
 * videos don't repeat one subcategory), the other subcategories, then the niche's specialist sites. With "mix",
 * general trends come last (the AI only picks one if it fits the niche).
 */
const STOP = new Set('about after again also amid best could from have here into just more most news over says still than that their them they this time what when will with your year years today first new video'.split(' '));
const keyWords = (t: string) => new Set(t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
/** The same story in other words (another site's headline, a reworded title): most of the key words are shared. */
export function sameStory(a: string, b: string): boolean {
  const x = keyWords(a), y = keyWords(b);
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n >= 2 && n / Math.min(x.size, y.size) >= 0.6;
}
/** Made recently already (topic or headline, in any wording)? */
export const usedRecently = (c: Candidate, recent: string[]) => recent.some((r) => sameStory(r, c.topic) || (c.headlines[0] && sameStory(r, c.headlines[0].title)));

export async function nicheCandidates(n: Niche, country: string, recent: string[], turn: number): Promise<{ candidates: Candidate[]; errors: string[]; sub?: string }> {
  const cat = findCategory(n.category);
  const subs = subsOf(n);
  if (!cat || !subs.length) return findCandidates([], country, recent);
  const first = turn % subs.length;
  const order = [...subs.slice(first), ...subs.slice(0, first)];
  const jobs: Promise<Candidate[]>[] = [
    ...n.focus.map((f) => topicNews(f, country).then((cs) => cs.slice(0, 3))),
    youtubeTrending(country, cat.id).then((cs) => cs.slice(0, 3)), // what's trending in this category on YouTube today
    ...order.map((s) => topicNews(s.query, country).then((cs) => cs.slice(0, 6).map((c) => ({ ...c, topic: c.topic.replace(s.query, s.label) })))),
    ...cat.feeds.map((u) => feedNews(u, cat.label)),
    ...(n.mix === 'mix' ? [googleTrends(country), wikipediaTrends(country)] : []),
  ];
  const settled = await Promise.allSettled(jobs);
  const errors = settled.flatMap((r) => (r.status === 'rejected' ? [String(r.reason instanceof Error ? r.reason.message : r.reason)] : []));
  const seen = new Set(recent.map((t) => t.toLowerCase()));
  const out: Candidate[] = [];
  for (const c of settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))) {
    const k = c.headlines[0]?.title.toLowerCase() ?? c.topic.toLowerCase();
    if (seen.has(k) || seen.has(c.topic.toLowerCase()) || usedRecently(c, recent) || out.some((o) => usedRecently(c, [o.topic]))) continue;
    seen.add(k);
    out.push(c);
  }
  return { candidates: out.slice(0, 30), errors, sub: order[0].label };
}

/** Everything worth considering today, minus topics used recently. */
export async function findCandidates(topics: string[], country: string, recent: string[]): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const jobs = [googleTrends(country), ...topics.map((t) => topicNews(t, country)), wikipediaTrends(country), youtubeTrending(country).then((cs) => cs.slice(0, 8))];
  const settled = await Promise.allSettled(jobs);
  const errors = settled.flatMap((r) => (r.status === 'rejected' ? [String(r.reason instanceof Error ? r.reason.message : r.reason)] : []));
  const seen = new Set(recent.map((t) => t.toLowerCase()));
  const out: Candidate[] = [];
  // With your topics set, your topics come first; general trends fill in.
  const lists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));
  // Order: your topics (if any), then Google Trends, then Wikipedia and YouTube, mixed so each source gets a fair look.
  const [trends, ...rest] = lists;
  const [wiki, yt] = rest.splice(-2);
  const mixed = trends.flatMap((c, i) => [c, ...(wiki[i] ? [wiki[i]] : []), ...(yt[i] ? [yt[i]] : [])]).concat(wiki.slice(trends.length), yt.slice(trends.length));
  const ordered = [...rest.flat(), ...mixed];
  for (const c of ordered) {
    const k = c.topic.toLowerCase();
    if (seen.has(k) || usedRecently(c, recent) || out.some((o) => usedRecently(c, [o.topic]))) continue;
    seen.add(k);
    out.push(c);
  }
  return { candidates: out.slice(0, 30), errors };
}

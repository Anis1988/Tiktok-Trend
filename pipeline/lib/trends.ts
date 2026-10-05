import type { Source } from '../../src/lib/types';

/** One possible video topic with the headlines behind it. */
export interface Candidate {
  topic: string;
  traffic?: string; // Google Trends' rough search count, e.g. "200K+"
  headlines: Source[];
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

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res.text();
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
  for (const when of ['2d', '7d']) {
    const q = encodeURIComponent(`${subject} when:${when}`);
    const xml = await get(`https://news.google.com/rss/search?q=${q}&hl=en-${country}&gl=${country}&ceid=${country}:en`);
    const headlines = items(xml).slice(0, 8).map((it) => ({ title: tag(it, 'title'), url: tag(it, 'link'), site: tag(it, 'source') || undefined })).filter((h) => h.title);
    if (headlines.length) return { topic: subject, headlines };
  }
  return null;
}

/** Everything worth considering today, minus topics used recently. */
export async function findCandidates(topics: string[], country: string, recent: string[]): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const jobs = [googleTrends(country), ...topics.map((t) => topicNews(t, country))];
  const settled = await Promise.allSettled(jobs);
  const errors = settled.flatMap((r) => (r.status === 'rejected' ? [String(r.reason instanceof Error ? r.reason.message : r.reason)] : []));
  const seen = new Set(recent.map((t) => t.toLowerCase()));
  const out: Candidate[] = [];
  // With your topics set, your topics come first; general trends fill in.
  const lists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const ordered = topics.length ? [...lists.slice(1).flat(), ...lists[0]] : lists.flat();
  for (const c of ordered) {
    const k = c.topic.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return { candidates: out.slice(0, 30), errors };
}

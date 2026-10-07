import type { Source } from '../../src/lib/types';
import { findCategory, subsOf, type Niche } from '../../src/lib/niches';
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
async function get(url: string, tries = 1): Promise<string> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) }).catch((e: unknown) => e as Error);
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
export async function nicheCandidates(n: Niche, country: string, recent: string[], turn: number): Promise<{ candidates: Candidate[]; errors: string[]; sub?: string }> {
  const cat = findCategory(n.category);
  const subs = subsOf(n);
  if (!cat || !subs.length) return findCandidates([], country, recent);
  const first = turn % subs.length;
  const order = [...subs.slice(first), ...subs.slice(0, first)];
  const jobs: Promise<Candidate[]>[] = [
    ...n.focus.map((f) => topicNews(f, country).then((cs) => cs.slice(0, 3))),
    ...order.map((s) => topicNews(s.query, country).then((cs) => cs.slice(0, 6).map((c) => ({ ...c, topic: c.topic.replace(s.query, s.label) })))),
    ...cat.feeds.map((u) => feedNews(u, cat.label)),
    ...(n.mix === 'mix' ? [googleTrends(country)] : []),
  ];
  const settled = await Promise.allSettled(jobs);
  const errors = settled.flatMap((r) => (r.status === 'rejected' ? [String(r.reason instanceof Error ? r.reason.message : r.reason)] : []));
  const seen = new Set(recent.map((t) => t.toLowerCase()));
  const out: Candidate[] = [];
  for (const c of settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))) {
    const k = c.headlines[0]?.title.toLowerCase() ?? c.topic.toLowerCase();
    if (seen.has(k) || seen.has(c.topic.toLowerCase())) continue;
    seen.add(k);
    out.push(c);
  }
  return { candidates: out.slice(0, 30), errors, sub: order[0].label };
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

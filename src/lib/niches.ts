/**
 * "My channel": one category, 1 to 3 subcategories, and your own focus words.
 * Shared by the app (Settings picker) and the video pipeline (news search, writing style, footage).
 */

export interface Sub {
  id: string;
  label: string;
  query: string; // Google News search words
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
  subs: Sub[];
  feeds: string[]; // free specialist news feeds (RSS / Atom); a feed that fails is skipped
  style: string; // extra writing direction for this niche
  footage: string; // hint for stock-footage search words
  look: Look; // colours and picture tone ("Niche look")
}

/** Accent colour (#RRGGBB, keyword pop, progress bar, end card) and a picture tone (ffmpeg filters). */
export interface Look { accent: string; grade: string }
export const DEFAULT_LOOK: Look = { accent: '#22D3EE', grade: 'eq=brightness=-0.03:saturation=1.1:contrast=1.04' };

export const CATEGORIES: Category[] = [
  {
    id: 'gaming', label: 'Gaming', emoji: '🎮',
    subs: [
      { id: 'nintendo', label: 'Nintendo', query: 'Nintendo Switch' },
      { id: 'playstation', label: 'PlayStation', query: 'PlayStation PS5' },
      { id: 'xbox', label: 'Xbox', query: 'Xbox' },
      { id: 'pc', label: 'PC gaming', query: 'PC gaming Steam' },
      { id: 'mobile', label: 'Mobile games', query: 'mobile game' },
      { id: 'esports', label: 'Esports', query: 'esports' },
      { id: 'releases', label: 'Releases & trailers', query: 'video game release trailer' },
      { id: 'retro', label: 'Retro', query: 'retro gaming' },
    ],
    feeds: ['https://feeds.feedburner.com/ign/all', 'https://www.polygon.com/rss/index.xml', 'https://www.gamespot.com/feeds/mashup/'],
    style: 'light gamer humour (respawns, side quests, boss fights, patch notes), but understandable by non-gamers',
    footage: 'gaming setup, controller, neon room, arcade, esports arena',
    look: { accent: '#7CFF4F', grade: 'eq=saturation=1.3:contrast=1.08,colorbalance=bs=0.08:rh=0.04' },
  },
  {
    id: 'tech', label: 'Tech', emoji: '💻',
    subs: [
      { id: 'phones', label: 'Phones', query: 'smartphone iPhone Samsung' },
      { id: 'ai', label: 'AI', query: 'artificial intelligence' },
      { id: 'gadgets', label: 'Gadgets', query: 'new gadget' },
      { id: 'apps', label: 'Apps & social media', query: 'app social media update' },
      { id: 'computers', label: 'Computers & chips', query: 'laptop chip processor' },
      { id: 'space-tech', label: 'Space tech', query: 'SpaceX rocket launch' },
    ],
    feeds: ['https://www.theverge.com/rss/index.xml', 'https://techcrunch.com/feed/'],
    style: 'curious and playful, explain why it matters for normal people, a geeky joke is welcome',
    footage: 'smartphone hands, circuit board, futuristic city, laptop typing',
    look: { accent: '#38BDF8', grade: 'eq=saturation=1.05:contrast=1.06,colorbalance=bs=0.06:bm=0.04' },
  },
  {
    id: 'sports', label: 'Sports', emoji: '⚽',
    subs: [
      { id: 'soccer', label: 'Soccer', query: 'soccer football Premier League Champions League' },
      { id: 'nba', label: 'Basketball', query: 'NBA basketball' },
      { id: 'nfl', label: 'American football', query: 'NFL' },
      { id: 'tennis', label: 'Tennis', query: 'tennis' },
      { id: 'f1', label: 'Formula 1', query: 'Formula 1 F1' },
      { id: 'combat', label: 'Boxing & UFC', query: 'boxing UFC' },
    ],
    feeds: ['https://www.cbssports.com/rss/headlines/', 'https://sports.yahoo.com/rss/'],
    style: 'hype and energy like a fan at the stadium, playful banter, never insulting players or teams',
    footage: 'stadium crowd, ball on field, athlete training, scoreboard lights',
    look: { accent: '#FF5A1F', grade: 'eq=saturation=1.2:contrast=1.15' },
  },
  {
    id: 'movies', label: 'Movies & TV', emoji: '🎬',
    subs: [
      { id: 'blockbusters', label: 'Blockbusters', query: 'box office movie' },
      { id: 'streaming', label: 'Streaming shows', query: 'Netflix series streaming' },
      { id: 'superheroes', label: 'Superheroes', query: 'Marvel DC superhero movie' },
      { id: 'anime', label: 'Anime', query: 'anime' },
      { id: 'trailers', label: 'Trailers', query: 'official trailer' },
    ],
    feeds: ['https://variety.com/feed/', 'https://deadline.com/feed/'],
    style: 'pop-culture savvy, movie-trailer drama for laughs, no spoilers beyond the headlines',
    footage: 'cinema seats, popcorn, film reel, remote control tv',
    look: { accent: '#FFC53D', grade: 'eq=contrast=1.1:saturation=1.05,colorbalance=rs=-0.05:bs=0.06:rh=0.06:bh=-0.04' },
  },
  {
    id: 'music', label: 'Music', emoji: '🎵',
    subs: [
      { id: 'pop', label: 'Pop', query: 'pop music new single' },
      { id: 'hiphop', label: 'Hip-hop', query: 'hip hop rap album' },
      { id: 'kpop', label: 'K-pop', query: 'K-pop' },
      { id: 'tours', label: 'Tours & festivals', query: 'concert tour festival' },
      { id: 'charts', label: 'Charts & awards', query: 'Billboard chart Grammy' },
    ],
    feeds: ['https://www.billboard.com/feed/', 'https://pitchfork.com/rss/news/'],
    style: 'fun fan energy, playful references to lyrics or charts (never quote lyrics)',
    footage: 'concert lights, headphones, crowd hands, vinyl record',
    look: { accent: '#FF4FD8', grade: 'eq=saturation=1.25:contrast=1.06,colorbalance=rs=0.06:bs=0.06' },
  },
  {
    id: 'science', label: 'Science & Space', emoji: '🔬',
    subs: [
      { id: 'space', label: 'Space', query: 'NASA space discovery' },
      { id: 'animals', label: 'Animals & nature', query: 'animals wildlife discovery' },
      { id: 'discoveries', label: 'Discoveries', query: 'scientists discover' },
      { id: 'climate', label: 'Earth & weather', query: 'weather phenomenon earth science' },
      { id: 'history', label: 'Archaeology', query: 'archaeologists ancient discovery' },
    ],
    feeds: ['https://www.sciencedaily.com/rss/top/science.xml', 'https://www.nasa.gov/feed/'],
    style: '"mind-blown" moments and surprising scale comparisons, simple words, never exaggerate the findings',
    footage: 'galaxy stars, microscope lab, ocean waves, forest aerial',
    look: { accent: '#60A5FA', grade: 'eq=contrast=1.05:saturation=1.0,colorbalance=bs=0.07:bm=0.03' },
  },
  {
    id: 'cars', label: 'Cars', emoji: '🚗',
    subs: [
      { id: 'ev', label: 'Electric cars', query: 'electric vehicle EV' },
      { id: 'supercars', label: 'Supercars', query: 'supercar' },
      { id: 'new-models', label: 'New models', query: 'new car reveal' },
      { id: 'racing', label: 'Racing', query: 'motorsport racing' },
    ],
    feeds: ['https://www.motor1.com/rss/news/all/', 'https://www.caranddriver.com/rss/all.xml/'],
    style: 'petrolhead enthusiasm with car puns, clear for non-car people',
    footage: 'sports car road, car interior dashboard, highway night, engine',
    look: { accent: '#F43F5E', grade: 'eq=contrast=1.15:saturation=1.1' },
  },
  {
    id: 'food', label: 'Food', emoji: '🍔',
    subs: [
      { id: 'fast-food', label: 'Fast food', query: 'fast food new menu' },
      { id: 'trends', label: 'Food trends', query: 'viral food trend' },
      { id: 'restaurants', label: 'Restaurants', query: 'restaurant chef' },
      { id: 'drinks', label: 'Drinks & coffee', query: 'coffee drink new' },
    ],
    feeds: ['https://www.eater.com/rss/index.xml'],
    style: 'mouth-watering descriptions and food puns, never health or diet advice',
    footage: 'burger close up, cooking kitchen, coffee pour, street food',
    look: { accent: '#FFB020', grade: 'eq=saturation=1.25:contrast=1.04,colorbalance=rm=0.05:gm=0.02:bm=-0.04' },
  },
  {
    id: 'travel', label: 'Travel', emoji: '✈️',
    subs: [
      { id: 'destinations', label: 'Destinations', query: 'travel destination' },
      { id: 'flights', label: 'Flights & airlines', query: 'airline flights' },
      { id: 'hotels', label: 'Hotels', query: 'hotel resort' },
      { id: 'tips', label: 'Travel news', query: 'travel news tourists' },
    ],
    feeds: ['https://www.cntraveler.com/feed/rss'],
    style: 'wanderlust and playful "pack your bags" energy, no safety or legal advice',
    footage: 'airplane window, beach aerial, city skyline sunset, suitcase airport',
    look: { accent: '#2DD4BF', grade: 'eq=saturation=1.2:contrast=1.04,colorbalance=rh=0.04:bs=0.04' },
  },
  {
    id: 'viral', label: 'Viral & Internet culture', emoji: '😂',
    subs: [
      { id: 'memes', label: 'Memes', query: 'viral meme' },
      { id: 'creators', label: 'Creators & influencers', query: 'YouTuber TikTok creator' },
      { id: 'challenges', label: 'Challenges & trends', query: 'viral TikTok trend' },
      { id: 'weird', label: 'Weird news', query: 'bizarre story viral' },
    ],
    feeds: [],
    style: 'internet-native humour and meme references that a wide audience gets, never mocking private people',
    footage: 'phone scrolling, people laughing, city crowd, colorful abstract',
    look: { accent: '#FACC15', grade: 'eq=saturation=1.3:contrast=1.08' },
  },
];

export interface Niche {
  category: string;
  subs: string[]; // 1 to 3 subcategory ids
  focus: string[]; // your own words, e.g. "Zelda", "GTA 6"
  mix: 'niche' | 'mix'; // only my niche, or niche plus huge trends that fit
}

export const findCategory = (id?: string) => CATEGORIES.find((c) => c.id === id);
export const subsOf = (n: Niche) => {
  const c = findCategory(n.category);
  return c ? n.subs.map((id) => c.subs.find((s) => s.id === id)).filter((s): s is Sub => !!s) : [];
};

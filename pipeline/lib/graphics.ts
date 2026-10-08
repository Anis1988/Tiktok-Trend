import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { run } from './sh';

/**
 * Charts and maps drawn by the app (free, no licence needed): each becomes a short animated clip (1080×1920),
 * used as a scene's picture like a stock clip.
 * - chartClip: bars grow one after another and their numbers count up.
 * - mapClip: the world, then a zoom to the place, its country lit up and a pin dropping on it.
 * Frames are SVG, turned into video by ffmpeg (librsvg). The important part stays in the top half: captions sit below.
 */
const W = 1080;
const H = 1920;
const FPS = 30;
const FONT = 'DejaVu Sans';

export interface ChartSpec { title: string; unit?: string; bars: { label: string; value: number }[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Splits a title into lines of about `max` letters. */
function wrap(s: string, max: number, lines = 2): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > max) (out.push(cur), (cur = w));
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) return [...out.slice(0, lines - 1), `${out.slice(lines - 1).join(' ').slice(0, max - 1)}…`];
  return out;
}

/** "1234.5" -> "1,234.5", same number of decimals as the biggest input. */
function fmt(v: number, decimals: number, unit = ''): string {
  const num = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const u = unit.trim();
  if (!u) return num;
  const money = u.match(/^([$€£¥])\s*(.*)$/); // "$", "$M", "€ bn" -> "$84.2M"
  if (money) return `${money[1]}${num}${money[2]}`;
  return /^(%|[KMB]|bn|m|k)$/.test(u) ? `${num}${u}` : `${num} ${u}`;
}

const background = (accent: string) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#141c38"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.12" r="0.6"><stop offset="0" stop-color="${accent}" stop-opacity="0.28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;

/** One frame of the bar chart at time f (frames). */
function chartFrame(c: ChartSpec, f: number, accent: string, decimals: number): string {
  const bars = c.bars.slice(0, 6);
  const max = Math.max(...bars.map((b) => Math.max(0, b.value)), 1e-9);
  const top = Math.max(...bars.map((b) => b.value));
  const titleLines = wrap(c.title, 24);
  const y0 = 250 + titleLines.length * 70 + 40;
  const row = Math.min(150, (1020 - y0) / bars.length);
  const barW = 700;
  const parts: string[] = [background(accent)];
  const intro = ease(f / 10);
  titleLines.forEach((l, i) => parts.push(`<text x="80" y="${300 + i * 70}" font-family="${FONT}" font-weight="bold" font-size="60" fill="#fff" opacity="${intro}">${esc(l)}</text>`));
  parts.push(`<rect x="80" y="${y0 - 34}" width="${120 * intro}" height="8" rx="4" fill="${accent}"/>`);
  bars.forEach((b, i) => {
    const p = ease((f - 6 - i * 4) / 22);
    const y = y0 + i * row;
    const w = Math.max(0, (Math.max(0, b.value) / max) * barW * p);
    const best = b.value === top;
    parts.push(`<text x="80" y="${y + 34}" font-family="${FONT}" font-size="38" fill="#fff" fill-opacity="${0.88 * Math.min(1, p * 3)}">${esc(b.label.slice(0, 30))}</text>`);
    parts.push(`<rect x="80" y="${y + 50}" width="${barW}" height="46" rx="12" fill="#fff" fill-opacity="0.07"/>`);
    if (w > 1) parts.push(`<rect x="80" y="${y + 50}" width="${w.toFixed(1)}" height="46" rx="12" fill="${accent}" fill-opacity="${best ? 1 : 0.6}"/>`);
    const vx = Math.min(80 + w + 18, W - 70);
    const anchor = 80 + w + 18 > W - 220 ? 'end' : 'start';
    parts.push(`<text x="${anchor === 'end' ? Math.min(80 + w - 16, W - 70) : vx}" y="${y + 86}" text-anchor="${anchor}" font-family="${FONT}" font-weight="bold" font-size="40" fill="${anchor === 'end' ? '#0b1020' : '#fff'}" fill-opacity="${Math.min(1, p * 2)}">${esc(fmt(b.value * p, decimals, c.unit))}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

/** Writes SVG frames and turns them into an MP4 clip that holds the last frame for `hold` seconds. */
async function framesToClip(frames: string[], out: string, hold: number): Promise<void> {
  const dir = `${out}.frames`;
  await mkdir(dir, { recursive: true });
  try {
    await Promise.all(frames.map((svg, i) => writeFile(`${dir}/f${String(i).padStart(4, '0')}.svg`, svg)));
    await run('ffmpeg', [
      '-y', '-v', 'error', '-framerate', String(FPS), '-i', `${dir}/f%04d.svg`,
      '-vf', `scale=${W}:${H},tpad=stop_mode=clone:stop_duration=${hold},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-r', String(FPS), out,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** An animated bar chart (2 to 6 bars). Returns false if the numbers can't be drawn. */
export async function chartClip(c: ChartSpec, out: string, accent: string): Promise<boolean> {
  const bars = c.bars.filter((b) => b.label.trim() && Number.isFinite(b.value)).slice(0, 6);
  if (bars.length < 2 || bars.every((b) => b.value <= 0)) return false;
  const decimals = Math.min(2, Math.max(...bars.map((b) => (String(b.value).split('.')[1] ?? '').length)));
  const spec = { ...c, bars };
  const n = 6 + bars.length * 4 + 26;
  await framesToClip(Array.from({ length: n }, (_, f) => chartFrame(spec, f, accent, decimals)), out, 20);
  return true;
}

// ---------- maps ----------

type Ring = [number, number][];
interface Feature { id?: string; properties: { name: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } }

let world: Promise<Feature[]> | null = null;
/** Country outlines (Natural Earth, public domain), bundled with the app. */
const countries = () =>
  (world ??= readFile(fileURLToPath(new URL('../assets/countries.geo.json', import.meta.url)), 'utf8').then((t) => (JSON.parse(t) as { features: Feature[] }).features));

const K = 3; // world units per degree: the whole world is 1080 × 540 at zoom 1
const px = (lon: number) => (lon + 180) * K;
const py = (lat: number) => (90 - lat) * K;
const polys = (f: Feature): Ring[][] => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]));
const pathOf = (f: Feature) => polys(f).map((poly) => poly.map((ring) => `M${ring.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join('L')}Z`).join('')).join('');

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const contains = (f: Feature, lon: number, lat: number) => polys(f).some((p) => inRing(lon, lat, p[0]) && !p.slice(1).some((hole) => inRing(lon, lat, hole)));

function bbox(f: Feature): [number, number, number, number] {
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  // The biggest part only, so far-away islands don't shrink the zoom (e.g. France and French Guiana).
  const main = polys(f).sort((a, b) => b[0].length - a[0].length)[0];
  for (const [lo, la] of main[0]) (x0 = Math.min(x0, lo)), (x1 = Math.max(x1, lo)), (y0 = Math.min(y0, la)), (y1 = Math.max(y1, la));
  return [x0, y0, x1, y1];
}

const norm = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z ]/g, '').trim();
const ALIAS: Record<string, string> = { 'united states': 'united states of america', usa: 'united states of america', us: 'united states of america', uk: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom', 'czechia': 'czech republic', 'tanzania': 'united republic of tanzania', 'serbia': 'republic of serbia', 'north macedonia': 'macedonia', 'eswatini': 'swaziland', 'bahamas': 'bahamas', 'congo': 'republic of the congo', 'drc': 'democratic republic of the congo', 'timorleste': 'east timor' };

const UA = 'TrendVideos/1.0 (https://tiktok-trend.netlify.app; personal project)';

/** Where a place is: Wikipedia's coordinates for the best-matching article (free, no key). */
async function locate(place: string): Promise<{ lat: number; lon: number; title: string } | null> {
  const q = new URLSearchParams({ action: 'query', format: 'json', redirects: '1', generator: 'search', gsrsearch: place, gsrlimit: '3', prop: 'coordinates', coprimary: 'primary' });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const j = (await res.json()) as { query?: { pages?: Record<string, { title: string; index?: number; coordinates?: { lat: number; lon: number }[] }> } };
  const pages = Object.values(j.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const p = pages.find((x) => x.coordinates?.length);
  return p?.coordinates ? { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon, title: p.title } : null;
}

/**
 * A map that starts on the whole world and zooms to `place`: its country is lit up in the accent colour and a pin
 * drops on it with its name. Returns false if the place can't be found.
 */
export async function mapClip(place: string, out: string, accent: string): Promise<boolean> {
  const feats = await countries();
  const want = norm(place);
  const country = feats.find((f) => norm(f.properties.name) === (ALIAS[want] ?? want));
  let lat: number;
  let lon: number;
  if (country) {
    const [x0, y0, x1, y1] = bbox(country);
    [lon, lat] = [(x0 + x1) / 2, (y0 + y1) / 2];
  } else {
    const at = await locate(place);
    if (!at) return false;
    ({ lat, lon } = at);
  }
  const hit = country ?? feats.find((f) => contains(f, lon, lat));
  // Zoom: a country fills about 80% of the width; a city or landmark shows its region.
  let zoom = 9;
  if (country) {
    const [x0, y0, x1, y1] = bbox(country);
    zoom = Math.min(14, Math.max(1.6, Math.min(860 / ((x1 - x0) * K), 700 / ((y1 - y0) * K))));
  }
  const name = place.trim().slice(0, 32);
  const land = feats.filter((f) => f !== hit).map((f) => pathOf(f)).join('');
  const lit = hit ? pathOf(hit) : '';
  const graticule = [...Array(11)].map((_, i) => `M${px(-180 + i * 36)},0V${py(-90)}`).join('') + [...Array(5)].map((_, i) => `M0,${py(60 - i * 30)}H${px(180)}`).join('');
  const PX = W / 2; // pin on screen: centre, in the top half (captions sit below)
  const PY = 760;
  const ZOOM_F = 42;
  const total = ZOOM_F + 20 + 90; // zoom, pin drop, then 3 seconds of pulsing (the last frame is held after that)
  const frames: string[] = [];
  for (let f = 0; f < total; f++) {
    const t = ease(f / ZOOM_F);
    const s = Math.pow(zoom, t); // smooth zoom (geometric)
    const cx = px(0) + (px(lon) - px(0)) * t;
    const cy = py(0) + (py(lat) - py(0)) * t;
    const drop = ease((f - ZOOM_F + 4) / 12);
    const pulse = f > ZOOM_F + 8 ? ((f - ZOOM_F - 8) % 45) / 45 : -1;
    const pinY = PY - 120 * (1 - drop);
    const tw = Math.min(900, 60 + name.length * 26);
    frames.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1830"/><stop offset="1" stop-color="#06101f"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sea)"/>
  <g transform="translate(${PX} ${PY}) scale(${s.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})">
    <path d="${graticule}" fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <path d="${land}" fill="#22324f" stroke="#3f5682" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    ${lit ? `<path d="${lit}" fill="${accent}" fill-opacity="${(0.25 + 0.4 * t).toFixed(2)}" stroke="${accent}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : ''}
  </g>
  ${pulse >= 0 ? `<circle cx="${PX}" cy="${PY}" r="${(14 + 70 * pulse).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="5" stroke-opacity="${(1 - pulse).toFixed(2)}"/>` : ''}
  ${drop > 0 ? `<g opacity="${Math.min(1, drop * 2).toFixed(2)}" transform="translate(${PX} ${pinY.toFixed(1)})">
    <ellipse cx="0" cy="4" rx="${14 * drop}" ry="${5 * drop}" fill="#000" fill-opacity="0.35"/>
    <path d="M0,0 C-10,-22 -36,-40 -36,-66 A36,36 0 1 1 36,-66 C36,-40 10,-22 0,0Z" fill="${accent}" stroke="#fff" stroke-width="4"/>
    <circle cx="0" cy="-66" r="13" fill="#fff"/>
  </g>
  <g opacity="${drop.toFixed(2)}"><rect x="${PX - tw / 2}" y="${PY + 34}" width="${tw}" height="76" rx="38" fill="#0b1020" fill-opacity="0.85" stroke="${accent}" stroke-width="3"/>
  <text x="${PX}" y="${PY + 86}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="44" fill="#fff">${esc(name.toUpperCase())}</text></g>` : ''}
</svg>`);
  }
  await framesToClip(frames, out, 12);
  return true;
}

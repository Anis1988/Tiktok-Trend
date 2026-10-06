# Trend Videos

Makes short vertical videos about what's trending, emails you a preview, and after you approve sends them to your TikTok drafts. Nothing is posted without your OK.

## How it works

1. **GitHub Actions** (`.github/workflows/generate.yml`, daily or "Make a video now"):
   "My channel" niche (category → subcategories that take turns → focus words; Google News + specialist feeds,
   `src/lib/niches.ts`) or Google Trends → Claude writes a script from the headlines (structured output, daily cap) →
   Kokoro AI voice (Piper as backup) → Pixabay stock clips (or Pexels) → ffmpeg (1080×1920, zooms, crossfades, word-by-word
   captions, -14 LUFS sound, optional soft music) → saved in Netlify Blobs → review email (EmailJS).
2. **Netlify** hosts the app (`src/`) and small functions (`netlify/functions/`): list videos, stream them,
   approve/reject (signed email links work without logging in), settings, TikTok login.
   "Make a video now" takes an optional subject (also on GitHub's Run workflow form); each run attaches the MP4 under "Artifacts" for 7 days.
3. **Approve** → `publish.yml` uploads the video to your TikTok inbox/drafts (Content Posting API). You add a sound,
   turn on "AI-generated content", and post from the TikTok app. Before TikTok is connected: download and post yourself.

## Setup

See the **Guide** tab (Setting it up) or `.env.example` for every key and where to get it.

TikTok developer app (developers.tiktok.com): products **Login Kit** + **Content Posting API**, scopes
`user.info.basic,video.upload`, redirect `https://<your-site>/api/tiktok/callback`. Needs TikTok's review.

## Run locally

```bash
npm install
npm run dev:full      # app + functions via Netlify CLI
TTS_FAKE=1 MANUAL=1 npm run generate   # pipeline test with a test tone instead of the voice (needs the env vars)
```

## Costs

Claude script: about 1–4 cents per video. Everything else uses free tiers (Piper, Pixabay, GitHub Actions, EmailJS, Netlify).

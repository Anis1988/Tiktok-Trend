import { useState, type ReactNode } from 'react';
import { VideoDetail } from '../components/VideoDetail';
import { MakeNow } from './Videos';
import { NichePicker } from '../components/NichePicker';
import { VideoStyle } from '../components/VideoStyle';
import { ScriptEditor } from '../components/ScriptEditor';
import { ClipCard } from '../components/MyClips';
import { DEFAULT_SETTINGS } from '../lib/types';
import type { Niche } from '../lib/niches';

const EXAMPLE_NICHE: Niche = { category: 'gaming', subs: ['nintendo', 'pc'], focus: ['Zelda', 'GTA 6'], mix: 'niche' };
import { StatusChip } from '../components/ui';
import type { Video } from '../lib/api';
import type { VideoStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

/* made-up example, only for this guide */
const EXAMPLE: Video = {
  id: 'example', sig: '', createdAt: '2026-10-05T14:05:00Z', updatedAt: '2026-10-05T14:05:00Z', status: 'pending',
  topic: 'blood moon', title: 'Blood moon tonight', hook: 'Look up tonight!',
  lines: ['The moon is doing its villain era tonight.', 'Reports say a rare blood moon will be visible across the US.', 'It happens when Earth photobombs the sun, right between it and the moon.', 'Free show, no tickets, terrible seats if it is cloudy.', 'Are you staying up, or setting an alarm you will snooze?'],
  caption: 'The moon is turning red tonight and it is not even sorry', hashtags: ['bloodmoon', 'space', 'nightsky'],
  firstComment: 'Team "stays up" or team "watches it on TikTok tomorrow"? 🌕',
  sources: [{ title: 'Rare blood moon visible tonight', url: 'https://example.com/moon', site: 'Example News' }],
  durationSec: 38, sizeBytes: 1, voice: 'Kokoro af_heart', footage: [{ by: 'Jane Doe', url: 'https://pixabay.com', site: 'Pixabay' }], model: 'claude-opus-5-5',
};

function Section({ title, children, open: start = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <section className="card !p-0">
      <button className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="min-w-0 font-display font-semibold">{title}</span>
        <span aria-hidden="true" className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3 text-[15px] leading-relaxed text-slate-300">{children}</div>}
    </section>
  );
}

const Example = ({ children, caption }: { children: ReactNode; caption?: string }) => (
  <figure className="space-y-2">
    <div className="relative rounded-2xl border border-dashed border-cyan-300/30 bg-black/20 p-3 pt-6">
      <span className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Example</span>
      {children}
    </div>
    {caption && <figcaption className="text-xs text-slate-400">{caption}</figcaption>}
  </figure>
);

const Key = ({ name, children }: { name: string; children: ReactNode }) => (
  <li><code className="rounded bg-white/10 px-1 text-cyan-100">{name}</code> {children}</li>
);

export function Guide() {
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div>
        <h2 className="text-2xl font-semibold">Guide</h2>
        <p className="text-sm text-slate-400">How the app works, in plain words. Tap a topic to open it.</p>
      </div>

      <Section title="How it works" open>
        <ol className="list-decimal space-y-2 pl-5">
          <li><b>Find a topic.</b> If you set up "My channel" (see below), the app reads today's news for your niche. Otherwise it looks at what people are searching for (Google Trends). You can also pick the subject for one video yourself (see "Choosing the subject").</li>
          <li><b>Write the script.</b> Claude picks one good topic and writes a 30 to 60 second script using only facts from the headlines. It tries 3 opening lines and keeps the one most likely to stop someone scrolling, adds a clever line or comparison, and ends with a punchline or a fun question. It also writes the caption and a witty comment for you to pin. It skips sad or risky subjects (deaths, disasters, crimes, elections, medical or money advice), and jokes are never about real people.</li>
          <li><b>Make the video.</b> A natural-sounding AI voice (Kokoro) reads the script. Sharp stock clips from Pixabay play behind it with a slow zoom and soft fades between them. Captions show 1 to 3 words at a time, with the word being spoken in yellow. The sound is cleaned up and set to TikTok's standard loudness. Full HD vertical video (1080×1920), ready for TikTok.</li>
          <li><b>Email you.</b> You get an email with a link. Watch it, then tap <b>Approve</b> or <b>Reject</b>.</li>
          <li><b>To TikTok.</b> Approved videos go to your TikTok drafts. You get a TikTok notification, add a sound if you like, and tap Post. Until TikTok is connected, you download it and post it yourself.</li>
        </ol>
        <p>Nothing is ever posted without your OK.</p>
      </Section>

      <Section title="My channel (your niche)">
        <p>TikTok grows channels that stick to one niche: it learns who likes your videos and shows them to more people like that. On the <b>Videos</b> page, open <b>My channel</b>:</p>
        <Example caption="Made-up example; tapping does nothing here.">
          <NichePicker value={EXAMPLE_NICHE} onChange={() => {}} />
        </Example>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Category:</b> the big theme, like Gaming. "Anything trending" means no niche (what's hot today).</li>
          <li><b>Subcategories:</b> 1 to 3, like Nintendo and PC gaming. They take turns, so you don't get the same one twice in a row.</li>
          <li><b>Focus words:</b> optional, your own finer choice, like a game, a team or a product. When there's news about them, it comes first.</li>
          <li><b>Big trends:</b> "Only my niche" (best for growth) or "Niche + huge trends", which lets in a giant story only if it fits your niche.</li>
        </ol>
        <p>The news comes from Google News plus a few specialist sites for the category (for example IGN and Polygon for gaming). The script, jokes, footage and hashtags are tuned to the niche too.</p>
      </Section>

      <Section title="Video style & effects">
        <p>On the <b>Videos</b> page, open <b>Video style &amp; effects</b> to choose how every video looks and sounds:</p>
        <Example caption="Made-up example; nothing here changes your settings.">
          <VideoStyle s={{ ...DEFAULT_SETTINGS, endCardName: '@yourname' }} save={() => {}} />
        </Example>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Voice, writing style, length, news country, music:</b> as before, now all in one place.</li>
          <li><b>Caption colour and size:</b> the colour of the word being spoken, and how big the words are.</li>
          <li><b>Hook title card:</b> the first line shows in big letters for 2 seconds. This is what stops people scrolling.</li>
          <li><b>Keyword pop:</b> the AI marks the 1 or 2 most important words of each sentence; they show bigger and in your category's colour.</li>
          <li><b>Sound effects:</b> a soft whoosh when the picture changes and a pop on the hook. Made by the app, so no copyright problems.</li>
          <li><b>Progress bar:</b> a thin line at the top fills up as the video plays, so people watch to the end.</li>
          <li><b>Niche look:</b> colours and picture tone that fit your category (for example neon green for Gaming, orange for Sports, warm for Food).</li>
          <li><b>End card:</b> for the last 2 seconds, "Follow for more Gaming" (your category) and your name.</li>
        </ul>
      </Section>

      <Section title="Real photos & clips">
        <p>When a sentence is about a real, well-known person, place or event (a player, a stadium, a rocket launch, a planet), the AI notes its name and the app looks for a <b>real photo or clip that is free to use</b>:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Wikimedia Commons</b> (the photo library behind Wikipedia): people, places, buildings, cars, food, events. Only free licences; the photo shows with a small credit like "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons".</li>
          <li><b>NASA</b>: real space and science photos and videos (launches, planets, eclipses, Earth from space). Free for everyone.</li>
          <li>Photos appear as a framed picture over a blurred copy, with a slow zoom. If nothing free is found, the scene uses stock footage as before.</li>
          <li>Never used: news-agency photos, TV, film, anime, music or game footage. Those are copyrighted and TikTok mutes or removes them.</li>
          <li>Wikimedia photos are often a little older (a past season or event), not from last night.</li>
          <li>Turn it off in <b>Video style &amp; effects → Real photos &amp; clips</b>. The credits are also listed under each video (Footage).</li>
        </ul>
      </Section>

      <Section title="My clips">
        <p>For the anime, manga or gaming look without copyright problems, add <b>your own</b> clips and pictures in <b>Videos → My clips</b>, with tags:</p>
        <Example caption="Made-up example; nothing here does anything.">
          <ul className="space-y-2">
            <ClipCard m={{ id: 'a', name: 'Zelda gameplay (my recording)', tags: ['Zelda', 'Nintendo', 'Link'], kind: 'video', type: 'video/mp4', size: 18_400_000, parts: 5, createdAt: '', ready: true }} />
            <ClipCard m={{ id: 'b', name: 'My manga shelf', tags: ['manga', 'One Piece'], kind: 'image', type: 'image/jpeg', size: 420_000, parts: 1, createdAt: '', ready: true }} />
          </ul>
        </Example>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>When a sentence mentions a tag (for example "Zelda"), that clip is shown for that scene. Each clip is used once per video; long clips start at a random point so they look different each time.</li>
          <li>Good ideas: gameplay you recorded yourself (most game companies allow it for commentary), photos or videos of your own manga, figures or setup, your face-cam.</li>
          <li>Only upload things you have the right to use: no clips copied from anime, films, TV or YouTube.</li>
          <li>Up to 60 MB per clip (5 to 20 seconds is ideal), 40 clips. Pictures are shrunk on your phone before upload.</li>
          <li>With "Check the script first" on, you can also pick a clip (or "no clip of mine") for any line.</li>
        </ul>
      </Section>

      <Section title="Check the script first">
        <p>Turn on <b>Check the script first</b> (in Video style &amp; effects) if you want to read the words before a video is made. Each run then only writes the script; you get an email, and the video shows as "Script ready · check it".</p>
        <Example caption="Made-up example; the buttons do nothing here.">
          <ScriptEditor example v={{ ...EXAMPLE, status: 'script', draft: { lines: EXAMPLE.lines.map((text, i) => ({ text, footage: ['night sky moon', 'telescope stars', 'earth from space', 'cloudy night', 'alarm clock'][i] ?? 'night sky', keywords: i === 0 ? ['villain era'] : [] })) } }} />
        </Example>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Change any sentence, the hook, the caption or the comment. You can also change the footage search words, the words that pop, the real photo to look for, and pick one of your clips for a line.</li>
          <li>Tap <b>Build video</b>: the video is made in 3 to 5 minutes and you get the usual email to approve it. Building uses no extra AI.</li>
          <li><b>Discard</b> if you don't like it: no video is made.</li>
        </ul>
      </Section>

      <Section title="Choosing the subject">
        <p>On the <b>Videos</b> page, the "Make a video now" box lets you choose what the next video is about.</p>
        <Example caption="Made-up example; nothing here does anything.">
          <MakeNow subject="Nintendo reveals a new Zelda trailer" onSubject={() => {}} pick="gaming:nintendo" onPick={() => {}} ideaUrl="https://example.com/1" onIdea={() => {}} onIdeas={() => {}} onMake={() => {}} niche={EXAMPLE_NICHE}
            ideas={[
              { title: 'Nintendo reveals a new Zelda trailer', url: 'https://example.com/1', site: 'Example News', tag: 'Nintendo' },
              { title: 'Switch 2 sales pass a big milestone', url: 'https://example.com/2', site: 'Example Games', tag: 'Nintendo' },
            ]} />
        </Example>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Category for this video:</b> tap a category (like Gaming), then a subcategory (like Nintendo) or "All". The video then uses that niche's news, style, footage and hashtags. "My channel" (or "Trending") uses your normal settings.</li>
          <li><b>💡 Ideas right now:</b> tap "Show ideas" for a plain list of fresh headlines from your pick (or today's top trends). Tap one to use it as the subject. It's free (no AI) and refreshes every 30 minutes.</li>
          <li><b>Type a subject</b> (like "iPhone 18" or "Champions League"): the app reads the latest news about it (last 2 days, or last week if that's quiet) and makes the video from those facts. You don't need to pick a category: a typed subject can be about anything, even outside your channel (an anime video on a gaming channel is fine). Pick a category only if you want that niche's style and colours.</li>
          <li><b>Leave it empty</b>: the app picks the best story from your pick, your channel, or the top trending topic.</li>
          <li>If no news is found, or the subject is sad or risky (deaths, crimes, elections…), no video is made and you see why. It still counts as one AI script.</li>
          <li>"My channel" guides every daily video. The picks in this box are for one video only.</li>
          <li>Without the website: on GitHub, open <b>Actions → Make a video → Run workflow</b>, type the subject in the "Subject" box, and tap the green button.</li>
        </ul>
      </Section>

      <Section title="Reviewing a video">
        <Example caption="What you see when you open a video (made-up example; buttons do nothing here).">
          <VideoDetail v={EXAMPLE} example />
        </Example>
      </Section>

      <Section title="Getting the video file from GitHub">
        <p>Every video is also attached to the GitHub run that made it, for 7 days. Handy when the website is down.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>On GitHub, open <b>Actions</b> and tap the latest <b>Make a video</b> run (green tick).</li>
          <li>Scroll to <b>Artifacts</b> at the bottom and tap <b>video</b>.</li>
          <li>It downloads as a .zip: open it to get the .mp4, then watch it or post it from your phone.</li>
        </ol>
        <p>Want to hear a voice or the music before using real topics? In <b>Run workflow</b>, tick <b>"Test only: a made-up sample video"</b>. It makes a short sample with the voice and effects from the Videos tab (no AI cost, not added to your videos) and attaches it to the run the same way.</p>
      </Section>

      <Section title="Auto clean-up (saving space)">
        <p>Each video file is about 20 to 50 MB. To keep storage and Netlify use low, the app can delete the <b>video file</b> of finished videos (posted, rejected, failed or already in your TikTok drafts) after a number of days. The text stays: title, script, caption, comment and sources.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Change it in <b>Settings → Auto clean-up</b>: on or off, and after 7, 14, 30 (default), 60 or 90 days.</li>
          <li>Videos waiting for you or approved (not yet posted) are never deleted.</li>
          <li>It runs during the daily video job on GitHub, so it costs nothing.</li>
        </ul>
      </Section>

      <Section title="What the labels mean">
        <ul className="space-y-2">
          {(Object.keys(STATUS_LABEL) as VideoStatus[]).map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-2"><StatusChip s={s} />
              <span className="text-sm">{{
                script: 'The script is written and waiting for you to read it ("Check the script first" is on). Edit it, then tap Build video.',
                building: 'You tapped Build: the video is being made (3 to 5 minutes).',
                pending: 'Made and waiting for you to approve or reject.',
                approved: 'You approved it before TikTok was connected: download it and post it yourself, or tap "Send to TikTok drafts" once TikTok is connected.',
                publishing: 'Being sent to your TikTok drafts (about a minute).',
                sent: 'In TikTok. Open the TikTok app to finish and post it.',
                posted: 'You marked it as posted.',
                rejected: 'You said no. It is never posted.',
                failed: 'Something went wrong. The reason is shown on the video.',
              }[s]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Before you post: rules that matter">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>Turn on "AI-generated content"</b> in TikTok when you post. TikTok requires it for videos with an AI voice.</li>
          <li><b>Check the facts.</b> The script only uses the headlines, but headlines can be wrong. The sources are listed under each video.</li>
          <li><b>Music:</b> by default there is no music, so you can add a trending TikTok sound when you post (TikTok shows those to more people). Prefer music built in? Turn on "Soft background music" in Videos → Video style &amp; effects: a quiet original tune that gets softer while the voice speaks.</li>
          <li><b>Pin the comment:</b> after posting, paste the suggested comment as the first comment and pin it (long-press it → Pin). Replies help the video spread.</li>
          <li><b>Quality over quantity:</b> TikTok shows repetitive AI videos to fewer people. One good video a day beats three weak ones.</li>
        </ul>
      </Section>

      <Section title="What it costs">
        <ul className="list-disc space-y-1 pl-5">
          <li>AI script: about 2 to 5 cents per video from your Anthropic API credit. Capped by "Most AI scripts per day" in Settings.</li>
          <li>Voice (Kokoro, with Piper as a backup), stock clips (Pixabay), video building (GitHub Actions), email (EmailJS), hosting (Netlify): free at this size.</li>
        </ul>
      </Section>

      <Section title="Setting it up (one time)">
        <p><b>In Netlify</b> (Site configuration → Environment variables), then redeploy:</p>
        <ul className="space-y-1.5 text-sm">
          <Key name="APP_ACCESS_TOKEN">a password you make up; you enter it once on each device.</Key>
          <Key name="APP_SECRET">a long random text you make up (signs the email links). Put the same value in GitHub.</Key>
          <Key name="GH_DISPATCH_TOKEN">a GitHub fine-grained token for this repository with "Actions: Read and write" (lets the buttons start GitHub jobs).</Key>
          <Key name="TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET">later, once TikTok approves your developer app.</Key>
          <Key name="VITE_CONTACT_EMAIL">optional: the email shown on the Terms and Privacy pages (TikTok's reviewers like to see one).</Key>
        </ul>
        <p><b>In GitHub</b> (repository → Settings → Secrets and variables → Actions → New repository secret):</p>
        <ul className="space-y-1.5 text-sm">
          <Key name="ANTHROPIC_API_KEY">your Anthropic API key (a new one just for this app is best).</Key>
          <Key name="PIXABAY_API_KEY">free at pixabay.com (log in, then open the API documentation page: your key is shown there). Without it, videos use plain colour backgrounds. (A Pexels key, PEXELS_API_KEY, also works if you have one; new Pexels keys are paused.)</Key>
          <Key name="NETLIFY_SITE_ID">Netlify → Site configuration → Site ID.</Key>
          <Key name="NETLIFY_AUTH_TOKEN">Netlify → User settings → Applications → Personal access tokens.</Key>
          <Key name="APP_SECRET">the same value as in Netlify.</Key>
          <Key name="SITE_URL">your site address, e.g. https://your-site.netlify.app</Key>
          <Key name="EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID, EMAILJS_PRIVATE_KEY">the same values as the trading app (for the review emails). Then put your email in Settings → Review email.</Key>
          <Key name="TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET">later, same as in Netlify.</Key>
        </ul>
        <p><b>TikTok developer app</b> (developers.tiktok.com): create an app, add the products <b>Login Kit</b> and <b>Content Posting API</b>, scopes <code>user.info.basic</code> and <code>video.upload</code>, and the redirect address <code>https://your-site.netlify.app/api/tiktok/callback</code>. TikTok also asks for a Terms of Service and a Privacy Policy link: use <code>https://your-site.netlify.app/terms</code> and <code>https://your-site.netlify.app/privacy</code> (also linked at the bottom of every page). Submit it for review. When approved, add its keys and tap <b>Connect TikTok</b> in Settings.</p>
      </Section>
    </div>
  );
}

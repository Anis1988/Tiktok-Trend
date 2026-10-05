import { useState, type ReactNode } from 'react';
import { VideoDetail } from '../components/VideoDetail';
import { MakeNow } from './Videos';
import { StatusChip } from '../components/ui';
import type { Video } from '../lib/api';
import type { VideoStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';

/* made-up example, only for this guide */
const EXAMPLE: Video = {
  id: 'example', sig: '', createdAt: '2026-10-05T14:05:00Z', updatedAt: '2026-10-05T14:05:00Z', status: 'pending',
  topic: 'blood moon', title: 'Blood moon tonight', hook: 'Look up tonight!',
  lines: ['Look up tonight, because the moon is turning red.', 'Reports say a rare blood moon will be visible across the US.', 'It happens when Earth sits right between the sun and the moon.', 'Are you going outside to watch it?'],
  caption: 'A rare blood moon is visible tonight across the US', hashtags: ['bloodmoon', 'space', 'nightsky'],
  sources: [{ title: 'Rare blood moon visible tonight', url: 'https://example.com/moon', site: 'Example News' }],
  durationSec: 38, sizeBytes: 1, voice: 'en_US-amy-medium', footage: [{ by: 'Jane Doe', url: 'https://pixabay.com', site: 'Pixabay' }], model: 'claude-opus-5-5',
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
          <li><b>Find a topic.</b> Once a day the app looks at what people are searching for (Google Trends) and today's news on your topics (Google News). You can also pick the subject yourself (see "Choosing the subject").</li>
          <li><b>Write the script.</b> Claude picks one good topic and writes a 30 to 60 second script using only facts from the headlines. It skips sad or risky subjects (deaths, disasters, crimes, elections, medical or money advice).</li>
          <li><b>Make the video.</b> An AI voice reads the script, free stock clips from Pixabay play behind it (cropped to vertical), and big captions show the words. Vertical 9:16, ready for TikTok.</li>
          <li><b>Email you.</b> You get an email with a link. Watch it, then tap <b>Approve</b> or <b>Reject</b>.</li>
          <li><b>To TikTok.</b> Approved videos go to your TikTok drafts. You get a TikTok notification, add a sound if you like, and tap Post. Until TikTok is connected, you download it and post it yourself.</li>
        </ol>
        <p>Nothing is ever posted without your OK.</p>
      </Section>

      <Section title="Choosing the subject">
        <p>On the <b>Videos</b> page, the "Make a video now" box lets you choose what the next video is about.</p>
        <Example caption="Made-up example; the button does nothing here.">
          <MakeNow subject="iPhone 18" onSubject={() => {}} onMake={() => {}} />
        </Example>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Type a subject</b> (like "iPhone 18" or "Champions League"): the app reads the latest news about it (last 2 days, or last week if that's quiet) and makes the video from those facts.</li>
          <li><b>Leave it empty</b>: the app picks the top trending topic right now.</li>
          <li>If no news is found, or the subject is sad or risky (deaths, crimes, elections…), no video is made and you see why. It still counts as one AI script.</li>
          <li>Topics in <b>Settings</b> are different: they guide every daily video. The subject box is for one video only.</li>
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
      </Section>

      <Section title="What the labels mean">
        <ul className="space-y-2">
          {(Object.keys(STATUS_LABEL) as VideoStatus[]).map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-2"><StatusChip s={s} />
              <span className="text-sm">{{
                pending: 'Made and waiting for you to approve or reject.',
                approved: 'You approved it, but TikTok isn\'t connected: download it and post it in the TikTok app.',
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
          <li><b>Music:</b> the video has no music on purpose (copyright). Add a TikTok sound when you post from drafts.</li>
          <li><b>Quality over quantity:</b> TikTok shows repetitive AI videos to fewer people. One good video a day beats three weak ones.</li>
        </ul>
      </Section>

      <Section title="What it costs">
        <ul className="list-disc space-y-1 pl-5">
          <li>AI script: about 1 to 4 cents per video from your Anthropic API credit. Capped by "Most AI scripts per day" in Settings.</li>
          <li>Voice (Piper), stock clips (Pixabay), video building (GitHub Actions), email (EmailJS), hosting (Netlify): free at this size.</li>
        </ul>
      </Section>

      <Section title="Setting it up (one time)">
        <p><b>In Netlify</b> (Site configuration → Environment variables), then redeploy:</p>
        <ul className="space-y-1.5 text-sm">
          <Key name="APP_ACCESS_TOKEN">a password you make up; you enter it once on each device.</Key>
          <Key name="APP_SECRET">a long random text you make up (signs the email links). Put the same value in GitHub.</Key>
          <Key name="GH_DISPATCH_TOKEN">a GitHub fine-grained token for this repository with "Actions: Read and write" (lets the buttons start GitHub jobs).</Key>
          <Key name="TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET">later, once TikTok approves your developer app.</Key>
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
        <p><b>TikTok developer app</b> (developers.tiktok.com): create an app, add the products <b>Login Kit</b> and <b>Content Posting API</b>, scopes <code>user.info.basic</code> and <code>video.upload</code>, and the redirect address <code>https://your-site.netlify.app/api/tiktok/callback</code>. Submit it for review. When approved, add its keys and tap <b>Connect TikTok</b> in Settings.</p>
      </Section>
    </div>
  );
}

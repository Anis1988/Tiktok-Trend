import type { ReactNode } from 'react';

const UPDATED = 'October 8, 2026';
/** Optional contact shown on both pages: set VITE_CONTACT_EMAIL in Netlify (then redeploy). */
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl card space-y-4 text-[15px] leading-relaxed text-slate-300">
      <div>
        <h2 className="text-2xl font-semibold text-slate-100">{title}</h2>
        <p className="text-xs text-slate-500">Trend Videos · last updated {UPDATED}</p>
      </div>
      {children}
      <p className="border-t border-white/10 pt-3 text-sm">
        Questions: {CONTACT ? <a className="text-cyan-300 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> : 'contact the owner of this site'}.
        {' '}See also the <a className="text-cyan-300 underline" href={title === 'Terms of Service' ? '/privacy' : '/terms'}>{title === 'Terms of Service' ? 'Privacy Policy' : 'Terms of Service'}</a>.
      </p>
    </article>
  );
}

const H = ({ children }: { children: ReactNode }) => <h3 className="pt-1 font-semibold text-slate-100">{children}</h3>;

export function Terms() {
  return (
    <Page title="Terms of Service">
      <H>What this is</H>
      <p>Trend Videos is a personal tool used by one person, the owner of this site. It makes short videos about trending news and, only after the owner approves each one, sends it to the owner's own TikTok account as a draft, and, when the owner taps a Send button, to the owner's own YouTube channel, Facebook Page or Instagram account. It is not offered to the public and has no sign-up.</p>
      <H>Using TikTok</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>The owner connects their own TikTok account with TikTok's login page and can disconnect it at any time in Settings.</li>
        <li>Videos are uploaded to the TikTok inbox (drafts) only. Nothing is published automatically: the owner reviews, edits and posts from the TikTok app.</li>
        <li>The owner is responsible for what they post and must follow TikTok's Terms of Service and Community Guidelines, including labelling AI-generated content.</li>
      </ul>
      <H>Using YouTube, Facebook and Instagram</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>The owner connects their own YouTube channel (Google login) and their own Facebook Page and linked Instagram account (Facebook login), and can disconnect them at any time in Settings.</li>
        <li>A video is sent only when the owner taps that platform's Send button on an approved video. YouTube videos are uploaded as Private and Facebook Reels as drafts, so the owner publishes them. Instagram has no drafts, so the owner confirms before each Instagram post.</li>
        <li>The owner must follow each platform's terms and rules, including labelling AI-generated content. The app's use of YouTube follows the YouTube Terms of Service (youtube.com/t/terms) and Google's Privacy Policy (policies.google.com/privacy).</li>
      </ul>
      <H>Content</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Scripts are written by AI from public news headlines, which can be wrong. Sources are listed with each video so they can be checked before posting.</li>
        <li>Stock footage comes from Pixabay or Pexels under their licences. Voices are made with Piper. Videos have no music.</li>
      </ul>
      <H>No warranty</H>
      <p>The tool is provided as is, without any guarantee that it works or that its content is accurate.</p>
      <H>Changes</H>
      <p>These terms may change; the date at the top shows the latest version.</p>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>Trend Videos is a personal tool used only by the owner of this site. It does not collect data about visitors and has no user accounts.</p>
      <H>What is stored</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>TikTok login:</b> when the owner connects TikTok, the app keeps the access token TikTok gives it, the account ID and the display name. They are used only to upload approved videos to that account's drafts.</li>
        <li><b>YouTube, Facebook and Instagram logins:</b> the access tokens these platforms give the app, the channel, Page and account names and IDs. They are used only to upload approved videos when the owner taps Send.</li>
        <li><b>Videos and settings:</b> the videos the app makes, their scripts and sources, and the owner's settings (topics, review email address).</li>
        <li><b>On your device:</b> the app's access code is saved in this browser's local storage so the owner doesn't retype it. No tracking cookies.</li>
      </ul>
      <H>TikTok permissions used</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><code>user.info.basic</code>: to show which account is connected.</li>
        <li><code>video.upload</code>: to send approved videos to the TikTok drafts (inbox).</li>
      </ul>
      <p>The app does not read your followers, messages, likes or any other TikTok data, and never posts publicly by itself.</p>
      <H>YouTube, Facebook and Instagram permissions used</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>YouTube <code>youtube.upload</code> to upload videos, and <code>youtube.readonly</code> only to show which channel is connected.</li>
        <li>Facebook <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code> and <code>business_management</code> to find the owner's Page and save Reels to it as drafts.</li>
        <li>Instagram <code>instagram_basic</code> and <code>instagram_content_publish</code> to post a Reel after the owner confirms.</li>
      </ul>
      <H>Where it is kept and who sees it</H>
      <p>Everything is stored privately on Netlify (the site's host). It is never sold or shared. Services used to run the app: Netlify (hosting and storage), GitHub Actions (video building), Anthropic (AI script, from news headlines only), Pixabay / Pexels (stock footage), EmailJS (review emails to the owner), TikTok, YouTube (Google) and Meta (Facebook and Instagram).</p>
      <H>Deleting your data</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Tap <b>Disconnect</b> in Settings to delete the stored TikTok, YouTube or Facebook &amp; Instagram login.</li>
        <li>Google: remove the app at myaccount.google.com/permissions. Facebook: Settings → Business integrations (or Apps and websites).</li>
        <li>You can also remove the app's access in the TikTok app: Settings and privacy → Security → Apps and services (or similar, depending on your app version).</li>
      </ul>
    </Page>
  );
}

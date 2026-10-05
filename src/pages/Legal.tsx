import type { ReactNode } from 'react';

const UPDATED = 'October 5, 2026';
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
      <p>Trend Videos is a personal tool used by one person, the owner of this site. It makes short videos about trending news and, only after the owner approves each one, sends it to the owner's own TikTok account as a draft. It is not offered to the public and has no sign-up.</p>
      <H>Using TikTok</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>The owner connects their own TikTok account with TikTok's login page and can disconnect it at any time in Settings.</li>
        <li>Videos are uploaded to the TikTok inbox (drafts) only. Nothing is published automatically: the owner reviews, edits and posts from the TikTok app.</li>
        <li>The owner is responsible for what they post and must follow TikTok's Terms of Service and Community Guidelines, including labelling AI-generated content.</li>
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
        <li><b>Videos and settings:</b> the videos the app makes, their scripts and sources, and the owner's settings (topics, review email address).</li>
        <li><b>On your device:</b> the app's access code is saved in this browser's local storage so the owner doesn't retype it. No tracking cookies.</li>
      </ul>
      <H>TikTok permissions used</H>
      <ul className="list-disc space-y-1 pl-5">
        <li><code>user.info.basic</code>: to show which account is connected.</li>
        <li><code>video.upload</code>: to send approved videos to the TikTok drafts (inbox).</li>
      </ul>
      <p>The app does not read your followers, messages, likes or any other TikTok data, and never posts publicly by itself.</p>
      <H>Where it is kept and who sees it</H>
      <p>Everything is stored privately on Netlify (the site's host). It is never sold or shared. Services used to run the app: Netlify (hosting and storage), GitHub Actions (video building), Anthropic (AI script, from news headlines only), Pixabay / Pexels (stock footage), EmailJS (review emails to the owner) and TikTok.</p>
      <H>Deleting your data</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Tap <b>Disconnect</b> in Settings to delete the stored TikTok login.</li>
        <li>You can also remove the app's access in the TikTok app: Settings and privacy → Security → Apps and services (or similar, depending on your app version).</li>
      </ul>
    </Page>
  );
}

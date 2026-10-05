# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit, in plain everyday words.
- Push directly to `main` (the owner deploys from it via Netlify).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- Nothing is ever posted to TikTok without the owner's approval. Approved videos go to TikTok drafts (inbox), never straight to public.
- Paid AI calls (the script) are capped per day (`aiDailyLimit` in Settings); keep free steps (trends, voice, footage, rendering) free.
- Phone-friendly is required: check a 390px-wide layout for any UI change.
- Video building runs in GitHub Actions (`pipeline/`), not in Netlify functions (they time out).

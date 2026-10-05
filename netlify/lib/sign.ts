import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signed links (email review link, video file) so they work without logging in but can't be guessed. */
export function sign(value: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error('APP_SECRET is not set.');
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32);
}

export function verify(value: string, sig: string | null | undefined): boolean {
  if (!sig || !process.env.APP_SECRET) return false;
  const a = Buffer.from(sign(value));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

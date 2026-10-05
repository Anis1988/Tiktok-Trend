/** EmailJS over REST (same account and template as the trading app). Needs the private key for server use. */
export const emailReady = () =>
  !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_USER_ID && process.env.EMAILJS_PRIVATE_KEY);

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailReady()) throw new Error('Email needs EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID and EMAILJS_PRIVATE_KEY.');
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_USER_ID,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      // The trading app's template shows one of these text fields; all are filled so any template works.
      template_params: {
        to_email: to, reply_to: to, from_name: 'Trend Videos', subject,
        message: text, instructions: text, intake_summary: text,
        action: '', symbol: '', quantity: '', order_type: '', limit_price: '', reason: '', confidence: '', note: '', timestamp: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EmailJS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

import webpush from 'web-push';

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

export function ensureWebPushConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.VAPID_EMAIL ? `mailto:${process.env.VAPID_EMAIL}` : 'mailto:admin@vellara.app');

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

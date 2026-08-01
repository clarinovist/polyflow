import crypto from 'node:crypto';

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: number; body: string };

export function verifyCronAuth(req: Request): CronAuthResult {
  if (!process.env.CRON_SECRET) {
    return { ok: false, status: 401, body: 'Unauthorized' };
  }

  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  const providedToken = authHeader || '';

  const expectedHash = crypto
    .createHash('sha256')
    .update(expectedToken)
    .digest();
  const providedHash = crypto
    .createHash('sha256')
    .update(providedToken)
    .digest();

  if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
    return { ok: false, status: 401, body: 'Unauthorized' };
  }

  return { ok: true };
}

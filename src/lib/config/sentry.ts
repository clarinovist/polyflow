import * as Sentry from '@sentry/nextjs';

export function captureException(e: unknown) {
  console.error("Caught exception:", e);
  Sentry.captureException(e);
}

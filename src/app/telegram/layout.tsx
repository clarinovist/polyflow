import type { Metadata } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
import { Toaster } from 'sonner';
import { extractSubdomain } from '@/lib/core/subdomain';
import { isMiniAppEnabled } from '@/lib/telegram/kill-switch';

export const metadata: Metadata = {
  title: 'Polyflow Telegram',
  description: 'Polyflow data operasional di Telegram Mini App',
};

export default async function TelegramLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const host = h.get('host') || '';
  const forwarded = h.get('x-forwarded-host') || '';
  const subdomain = extractSubdomain(forwarded || host) || extractSubdomain(host) || null;

  const enabled = isMiniAppEnabled();

  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        {/* Telegram Mini App Theme Support */}
        <style>{`
          :root {
            --tg-safe-top: env(safe-area-inset-top, 0px);
            --tg-safe-bottom: env(safe-area-inset-bottom, 0px);
            --tg-safe-left: env(safe-area-inset-left, 0px);
            --tg-safe-right: env(safe-area-inset-right, 0px);
          }
          html, body {
            margin: 0;
            padding: 0;
            min-height: 100vh;
            min-height: -webkit-fill-available;
            overflow-x: hidden;
            -webkit-tap-highlight-color: transparent;
            background: var(--tg-theme-bg-color, #ffffff);
            color: var(--tg-theme-text-color, #000000);
          }
          * { -webkit-tap-highlight-color: transparent; }
          /* 44x44 min tap target for interactive elements */
          button, [role="button"], a { min-height: 44px; min-width: 44px; }
          /* Prevent horizontal overflow 320-412px */
          .tg-container { max-width: 100vw; overflow-x: hidden; }
          .tg-safe-top { padding-top: var(--tg-safe-top); }
          .tg-safe-bottom { padding-bottom: calc(var(--tg-safe-bottom) + 12px); }
          .tg-card { border-radius: 16px; border: 1px solid var(--tg-theme-hint-color, rgba(0,0,0,0.08)); }
        `}</style>
      </head>
      <body className="antialiased tg-container" suppressHydrationWarning>
        {/* Telegram WebApp SDK — route-specific, not global CSP relaxation per blueprint §8 */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {enabled ? (
          children
        ) : (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-lg font-semibold">Mini App nonaktif</h1>
            <p className="text-sm opacity-70">Polyflow Telegram Mini App sedang dalam pemeliharaan. Coba lagi nanti.</p>
            <p className="text-xs opacity-50">Subdomain: {subdomain || 'unknown'}</p>
          </div>
        )}
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}

'use client';

import { useMemo } from 'react';
import { QrCode, Smartphone } from 'lucide-react';
import Link from 'next/link';

/** Simple QR using canvas-free ascii trick via external img? Use local SVG placeholder with link. */
export function MyPortalQr() {
  const myUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/my';
    const { protocol, host } = window.location;
    // keep tenant subdomain: melindo.xxx/my
    return `${protocol}//${host}/my`;
  }, []);

  // Use qrcode api via canvas: draw minimal QR on client with small dep-free lib? For now link + icon, no extra dep.
  // ponytail: add real QR canvas when install prompt adoption < 30% -> upgrade to qrcode.react or native canvas
  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-4 flex gap-3 sm:gap-4 items-start sm:items-center">
      <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl bg-white dark:bg-card border flex items-center justify-center shadow-sm">
        <QrCode className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black tracking-tight flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span>CEK GAJI DI HP — /my</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Buka di HP: login No HP + PIN. Lihat gaji, hasil produksi, sisa kasbon.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            href="/my"
            className="inline-flex items-center text-[11px] font-bold px-3 py-2 min-h-9 rounded-full bg-primary text-primary-foreground hover:opacity-90"
          >
            Buka My Portal →
          </Link>
          <span className="text-[10px] text-muted-foreground truncate max-w-full">{myUrl}</span>
        </div>
      </div>
    </div>
  );
}

/** Compact button for header */
export function MyPortalButton() {
  return (
    <Link href="/my" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white text-xs font-bold hover:bg-muted">
      <Smartphone className="h-3.5 w-3.5" /> MY
    </Link>
  );
}

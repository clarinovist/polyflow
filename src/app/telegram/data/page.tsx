'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TelegramProvider } from '../components/telegram-provider';
import { BottomNav } from '../components/bottom-nav';
import { SkeletonList } from '../components/skeleton';

type Bootstrap = { user: { allowedDomains: string[] } };

function DataHubInner() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/telegram/mini-app/bootstrap', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setBootstrap(j))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-[480px] p-4 pb-24"><SkeletonList count={3} /></div>;
  }

  const allowed = bootstrap?.user?.allowedDomains || [];
  const has = (d: string) => allowed.length === 0 || allowed.includes(d);

  const cards = [
    has('stock') ? { icon: '📦', label: 'Stok & stok kritis', desc: 'Lihat stok, critical alert', href: '/telegram/data/stock' } : null,
    has('sales') ? { icon: '🚚', label: 'Sales order & delivery', desc: 'SO pending, delivery', href: '/telegram/data/sales' } : null,
    has('production') ? { icon: '🏭', label: 'Produksi aktif', desc: 'SPK berjalan', href: '/telegram/data/production' } : null,
    has('finance') ? { icon: '💰', label: 'Finance & invoice', desc: 'Invoice, aging', href: '/telegram/data/finance' } : null,
    has('purchasing') ? { icon: '🧾', label: 'Purchasing & PO', desc: 'PO outstanding', href: '/telegram/data/purchasing' } : null,
  ].filter(Boolean) as Array<{ icon: string; label: string; desc: string; href: string }>;

  return (
    <div className="mx-auto max-w-[480px] p-4 pb-28">
      <h1 className="mb-4 text-base font-semibold">Data Polyflow</h1>

      {cards.length === 0 ? (
        <div className="tg-card p-6 text-center text-sm opacity-60">Tidak ada domain yang diizinkan untuk akun Anda.</div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="tg-card flex items-center gap-3 p-4">
              <span className="text-xl">{c.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs opacity-60">{c.desc}</div>
              </div>
              <span className="opacity-40">›</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 text-[11px] opacity-40">
        Domain disembunyikan (bukan disabled) jika tidak diizinkan — per blueprint §5.3. Backend tetap wajib cek resource setiap request. Phase 2 akan isi list/detail read-only per domain.
      </div>

      <BottomNav allowedDomains={allowed} />
    </div>
  );
}

export default function DataHubPage() {
  return (
    <TelegramProvider>
      <DataHubInner />
    </TelegramProvider>
  );
}

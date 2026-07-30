'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider } from '../components/telegram-provider';
import { BottomNav } from '../components/bottom-nav';
import { SkeletonList } from '../components/skeleton';
import { ErrorState } from '../components/error-states';

type BootstrapData = {
  user: { name?: string; email?: string; role?: string; roles?: string[]; allowedDomains: string[]; allowedResources: string[] };
  tenant: { id: string };
  connection: { telegramUserId: string; linkedAt: string; lastActiveAt?: string };
  features: { notificationsEnabled: boolean; criticalStock: boolean };
  version: string;
};

function AccountInner() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const fetchBootstrap = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/telegram/mini-app/bootstrap', { credentials: 'include' });
      const json = await res.json() as BootstrapData & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Gagal');
      setData(json as BootstrapData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBootstrap();
  }, []);

  const handleUnlink = async () => {
    if (!confirm('Putuskan koneksi Telegram? Anda perlu link ulang untuk akses Mini App.')) return;
    setUnlinking(true);
    try {
      const res = await fetch('/api/telegram/mini-app/unlink', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        window.location.href = '/telegram';
      } else {
        const j = await res.json().catch(() => ({ error: 'Gagal' } as { error: string })) as { error: string };
        alert(j.error || 'Gagal unlink');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error');
    } finally {
      setUnlinking(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-[480px] p-4 pb-24"><SkeletonList count={3} /></div>;
  }

  if (error || !data) {
    return (
      <div className="pb-24">
        <ErrorState title="Gagal memuat akun" message={error || 'Unknown'} actionLabel="Coba lagi" onAction={fetchBootstrap} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] p-4 pb-28">
      <h1 className="mb-4 text-base font-semibold">Akun</h1>

      <div className="space-y-3">
        <div className="tg-card p-4">
          <div className="text-[11px] opacity-60">User Polyflow</div>
          <div className="mt-1 text-sm font-semibold">{data.user.name || '-'}</div>
          <div className="text-xs opacity-60">{data.user.email || '-'}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(data.user.roles || [data.user.role]).filter(Boolean).map((r) => (
              <span key={r} className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] dark:bg-white/10">{r}</span>
            ))}
          </div>
        </div>

        <div className="tg-card p-4">
          <div className="text-[11px] opacity-60">Tenant & koneksi Telegram</div>
          <div className="mt-1 text-xs">Tenant ID: <span className="font-mono">{data.tenant.id.slice(0, 8)}…</span></div>
          <div className="text-xs">Telegram UID hash-safe: {String(data.connection.telegramUserId).slice(0, 6)}…</div>
          <div className="text-xs">Terhubung: {new Date(data.connection.linkedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div>
          {data.connection.lastActiveAt && (
            <div className="text-xs opacity-60">Terakhir aktif: {new Date(data.connection.lastActiveAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</div>
          )}
        </div>

        <div className="tg-card p-4">
          <div className="text-[11px] opacity-60">Domain diizinkan (role-aware)</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.user.allowedDomains.length === 0 ? <span className="text-xs opacity-60">—</span> : data.user.allowedDomains.map((d) => (
              <span key={d} className="rounded-full border px-2.5 py-1 text-xs">{d}</span>
            ))}
          </div>
          <div className="mt-2 text-[10px] opacity-40">Resource detail tidak ditampilkan demi privasi. Backend tetap cek ulang setiap request.</div>
        </div>

        <div className="tg-card p-4">
          <div className="text-[11px] opacity-60">Notifikasi</div>
          <div className="mt-1 text-xs">Enabled: {data.features.notificationsEnabled ? 'Ya' : 'Tidak'} • Stok kritis: {data.features.criticalStock ? 'Aktif' : 'Off'}</div>
          <div className="mt-1 text-[10px] opacity-50">Preference per user — quiet hours Asia/Jakarta, deduplication, kill switch ready (foundation Phase 1).</div>
        </div>

        <div className="tg-card p-4">
          <div className="text-[11px] opacity-60">Bantuan & versi</div>
          <div className="text-xs">Versi Mini App: {data.version}</div>
          <div className="mt-1 text-xs opacity-60">Bot: @pico2004_bot • URL: https://melindo.polyflow.uk/telegram</div>
          <a href="/support" target="_blank" className="mt-2 inline-block text-xs underline">Buka Pusat Bantuan</a>
        </div>

        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="mt-2 w-full rounded-full bg-red-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          style={{ minHeight: 44 }}
        >
          {unlinking ? 'Memutuskan...' : 'Putuskan koneksi Telegram'}
        </button>

        <a
          href={`https://${typeof window !== 'undefined' ? window.location.host : 'melindo.polyflow.uk'}`}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-full border px-4 py-3 text-center text-sm"
          style={{ minHeight: 44 }}
        >
          Buka Polyflow Web
        </a>
      </div>

      <BottomNav allowedDomains={data.user.allowedDomains} />
    </div>
  );
}

export default function AccountPage() {
  return (
    <TelegramProvider>
      <AccountInner />
    </TelegramProvider>
  );
}

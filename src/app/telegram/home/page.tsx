'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { TelegramProvider, useTelegram } from '../components/telegram-provider';
import { BottomNav } from '../components/bottom-nav';
import { SkeletonList } from '../components/skeleton';
import { ErrorState, EmptyState } from '../components/error-states';

type Kpi = { key: string; label: string; value: number | string; checkedAt: string; domain?: string };
type Alert = { type: string; message: string; deepLink: string };
type Bootstrap = { user: { name?: string; allowedDomains: string[] }; tenant: { id: string } };

function HomeInner() {
  const { haptic } = useTelegram();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bootRes, homeRes] = await Promise.all([
        fetch('/api/telegram/mini-app/bootstrap', { credentials: 'include' }).then(async (r) => {
          const data = await r.json() as Record<string, unknown>;
          return { ok: r.ok, status: r.status, data };
        }),
        fetch('/api/telegram/mini-app/home', { credentials: 'include' }).then(async (r) => {
          const data = await r.json() as Record<string, unknown>;
          return { ok: r.ok, status: r.status, data };
        }),
      ]);

      if (!bootRes.ok) {
        if (bootRes.status === 401) {
          setError('Session expired — muat ulang Mini App');
          return;
        }
        if (bootRes.status === 403) {
          setError(`Akses ditolak: ${(bootRes.data as { error?: string }).error || 'forbidden'}`);
          return;
        }
        throw new Error((bootRes.data as { error?: string }).error || 'Bootstrap gagal');
      }

      if (!homeRes.ok) {
        if (homeRes.status === 401) {
          setError('Session expired — muat ulang Mini App');
          return;
        }
        throw new Error((homeRes.data as { error?: string }).error || 'Home gagal');
      }

      const bootData = bootRes.data as unknown as Bootstrap;
      const homeData = homeRes.data as unknown as { kpis: Kpi[]; alerts: Alert[]; checkedAt: string };
      setBootstrap(bootData);
      setKpis(homeData.kpis || []);
      setAlerts(homeData.alerts || []);
      setCheckedAt(homeData.checkedAt || new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, retryCount]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[480px] p-4 pb-24">
        <div className="mb-4">
          <div className="h-5 w-32 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        </div>
        <SkeletonList count={6} />
      </div>
    );
  }

  if (error) {
    const isSession = error.toLowerCase().includes('session') || error.toLowerCase().includes('expired');
    return (
      <div className="pb-24">
        <ErrorState
          title={isSession ? 'Sesi kadaluarsa' : 'Gagal memuat data'}
          message={`${error}${checkedAt ? ` — data terakhir: ${new Date(checkedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}` : ''}`}
          actionLabel={isSession ? 'Muat ulang Mini App' : 'Coba lagi'}
          onAction={() => (isSession ? window.location.reload() : setRetryCount((c) => c + 1))}
        />
      </div>
    );
  }

  const userName = bootstrap?.user?.name || 'Admin';
  const allowedDomains = bootstrap?.user?.allowedDomains || [];

  return (
    <div className="mx-auto min-h-screen max-w-[480px] p-4 pb-24">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Halo, {userName}</h1>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <p className="text-xs opacity-60">CV Melindo Jaya • {(new Date() as any).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        </div>
        <Link href="/telegram/account" className="rounded-full border px-3 py-1.5 text-xs">⋮</Link>
      </header>

      <section className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ringkasan hari ini</h2>
          <button onClick={() => { haptic('light'); setRetryCount((c) => c + 1); }} className="rounded-full border px-3 py-1 text-[11px]">Refresh</button>
        </div>

        {kpis.length === 0 ? (
          <EmptyState message="Belum ada KPI yang tersedia untuk akun Anda." />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((kpi) => {
              const isHidden = kpi.domain && allowedDomains.length > 0 && !allowedDomains.includes(kpi.domain);
              if (isHidden) return null;
              return (
                <div key={kpi.key} className="tg-card p-3">
                  <div className="text-[11px] opacity-60">{kpi.label}</div>
                  <div className="mt-1 text-xl font-bold">{typeof kpi.value === 'number' ? kpi.value.toLocaleString('id-ID') : kpi.value}</div>
                  <div className="mt-1 text-[10px] opacity-40">dicek {kpi.checkedAt ? new Date(kpi.checkedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : ''} WIB</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-5">
        <h2 className="mb-3 text-sm font-semibold">Perlu perhatian</h2>
        {alerts.length === 0 ? (
          <div className="tg-card p-4 text-center text-xs opacity-60">Semua aman — tidak ada alert kritis saat ini.</div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <Link key={i} href={a.deepLink} className="tg-card flex items-start gap-2 p-3 text-sm">
                <span>•</span>
                <span>{a.message}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-5 flex gap-2">
        <Link href="/telegram/data" className="flex-1 rounded-full bg-black px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-white dark:text-black" style={{ minHeight: 44 }}>
          Buka data
        </Link>
        <Link href="/telegram/data?focus=assistant" className="flex-1 rounded-full border px-4 py-2.5 text-center text-sm font-medium" style={{ minHeight: 44 }}>
          Tanya CS
        </Link>
      </section>

      <div className="text-center text-[10px] opacity-30">
        Data terakhir diperiksa: {checkedAt ? new Date(checkedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-'} WIB
      </div>

      <BottomNav allowedDomains={allowedDomains} />
    </div>
  );
}

export default function HomePage() {
  return (
    <TelegramProvider>
      <HomeInner />
    </TelegramProvider>
  );
}

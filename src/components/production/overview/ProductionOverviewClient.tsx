'use client';

import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import { LiveClockBar } from './LiveClockBar';
import { ProcessPulseChart } from './ProcessPulseChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';

export type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';
export type TabKey = ProcessKey | 'ALL';

type ProcessPulse = {
  outputToday: number;
  outputYesterday: number;
  scrapToday: number;
  scrapRate: number;
  recordedThisHour: number;
  activeJobs: number;
  released: number;
  waiting: number;
  hourly: { hour: number; today: number; avg7d: number }[];
};

type RunningOrder = {
  id: string;
  orderNumber: string;
  productName: string;
  machineCode: string;
  operatorName: string;
  plannedQty: number;
  actualQty: number;
  progress: number;
  isLate: boolean;
  processKey: ProcessKey;
  startedAt: string | Date;
  estimatedDoneAt: string | Date | null;
};

type AttentionItem = {
  type: string;
  severity: 'red' | 'amber';
  title: string;
  subtitle: string;
  orderId?: string;
  machineId?: string;
  ageMinutes: number;
  processKey: ProcessKey | 'ALL';
  secondaryHref?: string;
  secondaryLabel?: string;
};

export type ProductionOverviewData = {
  processes: Record<ProcessKey, ProcessPulse>;
  stackedHourly: {
    hour: number;
    MIXING: number;
    EXTRUSION: number;
    PACKING: number;
    OTHER: number;
  }[];
  runningOrders: RunningOrder[];
  attentions: AttentionItem[];
  totals: {
    activeJobs: number;
    released: number;
    waiting: number;
    downtimeOpen: number;
    waitingMaterialCount: number;
    fgUncoveredVariants: number;
  };
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'MIXING', label: 'MIXING' },
  { key: 'EXTRUSION', label: 'EXTRUSION' },
  { key: 'PACKING', label: 'PACKING' },
  { key: 'OTHER', label: 'LAINNYA' },
  { key: 'ALL', label: 'SEMUA' },
];

const PROCESS_COLOR: Record<ProcessKey, string> = {
  MIXING: 'text-violet-500',
  EXTRUSION: 'text-emerald-500',
  PACKING: 'text-sky-500',
  OTHER: 'text-muted-foreground',
};

function emptyPulse(): ProcessPulse {
  return {
    outputToday: 0,
    outputYesterday: 0,
    scrapToday: 0,
    scrapRate: 0,
    recordedThisHour: 0,
    activeJobs: 0,
    released: 0,
    waiting: 0,
    hourly: Array.from({ length: 24 }, (_, i) => ({ hour: i, today: 0, avg7d: 0 })),
  };
}

export function emptyOverviewData(): ProductionOverviewData {
  return {
    processes: {
      MIXING: emptyPulse(),
      EXTRUSION: emptyPulse(),
      PACKING: emptyPulse(),
      OTHER: emptyPulse(),
    },
    stackedHourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      MIXING: 0,
      EXTRUSION: 0,
      PACKING: 0,
      OTHER: 0,
    })),
    runningOrders: [],
    attentions: [],
    totals: { activeJobs: 0, released: 0, waiting: 0, downtimeOpen: 0, waitingMaterialCount: 0, fgUncoveredVariants: 0 },
  };
}

interface ProductionOverviewClientProps {
  initialData: ProductionOverviewData;
}

export function ProductionOverviewClient({ initialData }: ProductionOverviewClientProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [tab, setTab] = useState<TabKey>('EXTRUSION');

  const fetcher = async (): Promise<ProductionOverviewData> => {
    const res = await getProductionLiveOverview();
    if (res.success && res.data) {
      setLastUpdated(new Date());
      return res.data as unknown as ProductionOverviewData;
    }
    const errorMsg = !res.success ? res.error : 'Failed to fetch live overview';
    throw new Error(errorMsg);
  };

  const { data, error, isLoading, mutate } = useSWR<ProductionOverviewData>(
    'production-live-overview',
    fetcher,
    {
      fallbackData: initialData,
      refreshInterval: 30000,
      dedupingInterval: 25000,
      revalidateOnFocus: true,
    }
  );

  const handleRefresh = async () => {
    await mutate();
  };

  const activeData = data || initialData;

  const processPulse =
    tab === 'ALL' ? null : activeData.processes[tab] ?? emptyPulse();

  const filteredOrders = useMemo(() => {
    if (tab === 'ALL') return activeData.runningOrders;
    return activeData.runningOrders.filter((o) => o.processKey === tab);
  }, [activeData.runningOrders, tab]);

  const filteredAttentions = useMemo(() => {
    if (tab === 'ALL') return activeData.attentions;
    return activeData.attentions.filter(
      (a) => a.processKey === tab || a.processKey === 'ALL'
    );
  }, [activeData.attentions, tab]);

  const vsYesterday =
    processPulse && processPulse.outputYesterday > 0
      ? ((processPulse.outputToday - processPulse.outputYesterday) /
          processPulse.outputYesterday) *
        100
      : null;

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl text-center min-h-[300px]">
        <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
        <h3 className="font-bold text-lg">Gagal memuat dashboard</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          {error.message || 'Terjadi kesalahan koneksi saat memuat data lantai produksi.'}
        </p>
        <Button onClick={handleRefresh} className="mt-4 font-bold">
          Coba Lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <LiveClockBar
        onRefresh={handleRefresh}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
      />

      {/* Work Strip — antrean kerja hari ini */}
      <div className="rounded-xl border bg-card/60 p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-sm font-bold">Hari Ini — Produksi</h2>
          <span className="text-[11px] text-muted-foreground">Pulse lantai + antrean yang butuh tindakan.</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <WorkStripCard
            label="SPK jalan"
            count={activeData.totals.activeJobs}
            href="/production/daily"
            accent="emerald"
          />
          <WorkStripCard
            label="Rilis"
            count={activeData.totals.released}
            href="/production/orders?status=RELEASED"
            accent="blue"
          />
          <WorkStripCard
            label="Tunggu bahan"
            count={activeData.totals.waitingMaterialCount}
            href="/production/orders?status=WAITING_MATERIAL"
            accent="amber"
          />
          <WorkStripCard
            label="Downtime aktif"
            count={activeData.totals.downtimeOpen}
            href="/production/machines"
            accent="red"
          />
          <WorkStripCard
            label="Butuh perhatian"
            count={activeData.attentions.length}
            href="#attentions"
            accent="rose"
          />
          {activeData.totals.fgUncoveredVariants > 0 && (
            <WorkStripCard
              label="Belum di-SPK"
              count={activeData.totals.fgUncoveredVariants}
              href="/production/requests"
              accent="violet"
            />
          )}
        </div>
        {/* Quick actions */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] font-bold">
            <Link href="/production/orders/create">+ SPK baru</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] font-bold">
            <Link href="/production/requests">Papan FG</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] font-bold">
            <Link href="/production/daily">SPK Aktif</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] font-bold">
            <Link href="/warehouse/materials">Bahan Gudang</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-[11px] font-bold">
            <Link href="/kiosk">Kiosk</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="h-auto flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs font-bold tracking-wide">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="font-bold">
            <Link href="/production/daily">
              SPK Aktif
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="font-bold">
            <Link href="/production/machines">Papan Mesin</Link>
          </Button>
        </div>
      </div>

      {/* KPI row */}
      {tab === 'ALL' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['MIXING', 'EXTRUSION', 'PACKING', 'OTHER'] as ProcessKey[]).map((key) => {
            const p = activeData.processes[key];
            return (
              <Card
                key={key}
                className="shadow-sm bg-card/65 backdrop-blur-sm cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setTab(key)}
              >
                <CardHeader className="pb-1 pt-4">
                  <CardTitle
                    className={cn(
                      'text-[11px] font-bold uppercase tracking-wider',
                      PROCESS_COLOR[key]
                    )}
                  >
                    {key === 'OTHER' ? 'Lainnya' : key}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="text-2xl font-extrabold tabular-nums">
                    {p.outputToday.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
                    <span className="text-xs font-normal text-muted-foreground ml-1">KG</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    scrap {p.scrapRate.toFixed(1)}% · {p.activeJobs} SPK jalan
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        processPulse && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Output hari ini"
              value={processPulse.outputToday.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}
              suffix="KG"
              hint={
                vsYesterday === null ? (
                  <span className="text-muted-foreground">vs kemarin: n/a</span>
                ) : vsYesterday >= 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-500">
                    <TrendingUp className="h-3 w-3" />+{vsYesterday.toFixed(1)}% vs kemarin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-500">
                    <TrendingDown className="h-3 w-3" />
                    {vsYesterday.toFixed(1)}% vs kemarin
                  </span>
                )
              }
            />
            <KpiCard
              label="Scrap rate"
              value={processPulse.scrapRate.toFixed(1)}
              suffix="%"
              valueClass={processPulse.scrapRate > 2 ? 'text-rose-500' : undefined}
              hint={
                <span className="text-muted-foreground">
                  scrap / (bagus + scrap) · {processPulse.scrapToday.toLocaleString('id-ID', { maximumFractionDigits: 1 })} scrap
                </span>
              }
            />
            <KpiCard
              label="SPK proses ini"
              value={String(processPulse.activeJobs)}
              suffix="jalan"
              hint={
                <span className="text-muted-foreground">
                  {processPulse.released} rilis · {processPulse.waiting} tunggu
                </span>
              }
            />
            <KpiCard
              label="Dicatat jam ini"
              value={processPulse.recordedThisHour.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}
              suffix="KG"
              hint={
                <span className="text-muted-foreground">
                  Waktu log kiosk — bukan run-rate mesin
                </span>
              }
            />
          </div>
        )
      )}

      {/* Global SPK strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 px-3 py-2.5 text-xs text-muted-foreground">
        <span className="font-semibold">Semua proses</span>
        <Badge variant="outline" className="font-bold">
          {activeData.totals.activeJobs} jalan
        </Badge>
        <Badge variant="outline" className="font-bold">
          {activeData.totals.released} rilis
        </Badge>
        <Badge variant="outline" className="font-bold">
          {activeData.totals.waiting} tunggu
        </Badge>
      </div>

      <ProcessPulseChart
        tab={tab}
        processHourly={processPulse?.hourly}
        stackedHourly={activeData.stackedHourly}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">
              SPK {tab === 'ALL' ? 'aktif' : `proses ${tab === 'OTHER' ? 'Lainnya' : tab}`}
            </CardTitle>
            <CardDescription>
              Progress order — satu SPK = satu proses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {filteredOrders.length === 0 ? (
              <div className="border border-dashed rounded-lg py-10 text-center text-sm text-muted-foreground">
                Tidak ada SPK berjalan di filter ini
              </div>
            ) : (
              filteredOrders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border bg-background/40 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.productName}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {o.orderNumber} · {o.machineCode} · {o.operatorName}
                        {tab === 'ALL' && (
                          <span className="ml-1">· {o.processKey}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {o.isLate && (
                        <Badge variant="destructive" className="text-[10px]">
                          Terlambat
                        </Badge>
                      )}
                      <span className="text-xs font-bold tabular-nums">
                        {Math.min(100, o.progress).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <Progress value={Math.min(100, o.progress)} className="h-1.5" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {o.actualQty.toLocaleString('id-ID', { maximumFractionDigits: 1 })} /{' '}
                      {o.plannedQty.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
                    </span>
                    <Link
                      href={`/production/orders/${o.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      Detail <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-card/65 backdrop-blur-sm" id="attentions">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Butuh perhatian</CardTitle>
            <CardDescription>
              Tap untuk buka SPK / mesin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredAttentions.length === 0 ? (
              <div className="flex flex-col items-center justify-center border border-dashed rounded-lg py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-semibold">Tidak ada isu</p>
                <p className="text-xs text-muted-foreground mt-1">Filter ini sehat.</p>
              </div>
            ) : (
              filteredAttentions.map((item, idx) => {
                const href = item.orderId
                  ? `/production/orders/${item.orderId}`
                  : item.machineId
                    ? `/production/machines/${item.machineId}`
                    : '/production/daily';
                const red = item.severity === 'red';
                return (
                  <div
                    key={`${item.title}-${idx}`}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3 text-xs',
                      red
                        ? 'border-rose-500/20 bg-rose-500/5'
                        : 'border-amber-500/20 bg-amber-500/5'
                    )}
                  >
                    {red ? (
                      <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={href} className="block hover:opacity-80 transition-opacity">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">
                          {item.subtitle}
                        </p>
                      </Link>
                      {item.secondaryHref && item.secondaryLabel && (
                        <Link
                          href={item.secondaryHref}
                          className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                        >
                          {item.secondaryLabel} <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className={cn('text-2xl font-extrabold tabular-nums', valueClass)}>
          {value}
          {suffix && (
            <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>
          )}
        </div>
        <div className="text-[11px] mt-1.5">{hint}</div>
      </CardContent>
    </Card>
  );
}

const WORK_STRIP_ACCENT: Record<string, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  blue: 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400',
  amber: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  red: 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400',
  rose: 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400',
  violet: 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-400',
};

function WorkStripCard({
  label,
  count,
  href,
  accent,
}: {
  label: string;
  count: number;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col gap-0.5 rounded-lg border p-2.5 text-xs transition-colors hover:opacity-80',
        WORK_STRIP_ACCENT[accent] || WORK_STRIP_ACCENT.emerald
      )}
    >
      <span className="font-bold text-lg tabular-nums leading-tight">{count}</span>
      <span className="font-medium text-[11px] leading-tight">{label}</span>
    </Link>
  );
}

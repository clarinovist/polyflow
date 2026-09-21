'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import { LiveClockBar } from './LiveClockBar';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { ProductionAlertThresholds } from '@/lib/production/alert-thresholds';

type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';
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
    { key: 'ALL', label: 'SEMUA' },
    { key: 'MIXING', label: 'MIXING' },
    { key: 'EXTRUSION', label: 'EXTRUSION' },
    { key: 'PACKING', label: 'PACKING' },
    { key: 'OTHER', label: 'LAINNYA' },
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
        hourly: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            today: 0,
            avg7d: 0,
        })),
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
        totals: {
            activeJobs: 0,
            released: 0,
            waiting: 0,
            downtimeOpen: 0,
            waitingMaterialCount: 0,
            fgUncoveredVariants: 0,
        },
    };
}

interface ProductionOverviewClientProps {
    initialData: ProductionOverviewData;
    thresholds?: ProductionAlertThresholds;
}

export function ProductionOverviewClient({
    initialData,
}: ProductionOverviewClientProps) {
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [tab, setTab] = useState<TabKey>('ALL');

    useEffect(() => {
        setLastUpdated(new Date());
    }, []);

    const fetcher = async (): Promise<ProductionOverviewData> => {
        const res = await getProductionLiveOverview();
        if (res.success && res.data) {
            setLastUpdated(new Date());
            return res.data as unknown as ProductionOverviewData;
        }
        const errorMsg = !res.success
            ? res.error
            : 'Failed to fetch live overview';
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
        },
    );

    const handleRefresh = async () => {
        await mutate();
    };

    const activeData = data || initialData;

    const filteredOrders = useMemo(() => {
        if (tab === 'ALL') return activeData.runningOrders;
        return activeData.runningOrders.filter((o) => o.processKey === tab);
    }, [activeData.runningOrders, tab]);

    const filteredAttentions = useMemo(() => {
        if (tab === 'ALL') return activeData.attentions;
        return activeData.attentions.filter(
            (a) => a.processKey === tab || a.processKey === 'ALL',
        );
    }, [activeData.attentions, tab]);

    if (error && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl text-center min-h-[300px]">
                <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
                <h3 className="font-bold text-lg">Gagal memuat dashboard</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    {error.message ||
                        'Terjadi kesalahan koneksi saat memuat data lantai produksi.'}
                </p>
                <Button onClick={handleRefresh} className="mt-4 font-bold">
                    Coba lagi
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
                    <h2 className="text-sm font-bold">
                        Kondisi seluruh proses
                    </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    <WorkStripCard
                        label="SPK jalan"
                        count={activeData.totals.activeJobs}
                        href="/production/orders?status=IN_PROGRESS"
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
                    <button
                        type="button"
                        className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-left text-rose-700 dark:text-rose-400 hover:brightness-95"
                        onClick={() => {
                            setTab('ALL');
                            document
                                .getElementById('attentions')
                                ?.scrollIntoView({ block: 'start' });
                        }}
                    >
                        <span className="block text-[11px] font-semibold">
                            Butuh perhatian
                        </span>
                        <span className="text-xl font-bold tabular-nums">
                            {activeData.attentions.length}
                        </span>
                    </button>
                    {activeData.totals.fgUncoveredVariants > 0 && (
                        <WorkStripCard
                            label="Belum di-SPK"
                            count={activeData.totals.fgUncoveredVariants}
                            href="/production/requests"
                            accent="violet"
                        />
                    )}
                </div>
                {/* Aksi frekuensi tinggi, bukan pengulangan menu portal. */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="min-h-11 text-xs font-bold"
                    >
                        <Link href="/production/orders/create">Buat SPK</Link>
                    </Button>
                    <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="min-h-11 text-xs"
                    >
                        <Link href="/production/history?from=today&to=today">
                            Log & Bukti hari ini →
                        </Link>
                    </Button>
                </div>
            </div>

            <div>
                <p className="mb-2 text-sm font-medium">
                    Pekerjaan & perhatian per proses
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                    Filter ini berlaku untuk SPK dan perhatian di bawah. Kondisi
                    di atas dan ringkasan hasil tetap mencakup seluruh proses.
                </p>
                <div
                    role="group"
                    aria-label="Filter proses pekerjaan dan perhatian"
                    className="flex flex-wrap gap-2"
                >
                    {TABS.map((t) => (
                        <Button
                            key={t.key}
                            type="button"
                            variant={tab === t.key ? 'default' : 'outline'}
                            aria-pressed={tab === t.key}
                            onClick={() => setTab(t.key)}
                            className="min-h-11 text-xs font-bold tracking-wide"
                        >
                            {t.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="shadow-sm bg-card/65 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-bold">
                            SPK{' '}
                            {tab === 'ALL'
                                ? 'aktif'
                                : `proses ${tab === 'OTHER' ? 'Lainnya' : tab}`}
                        </CardTitle>
                        <CardDescription>
                            {filteredOrders.length} SPK berjalan pada filter
                            ini. Maksimal 5 ditampilkan; satu SPK untuk satu
                            proses.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        <Link
                            href="/production/daily"
                            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                        >
                            Buka semua SPK di Board Proses →
                        </Link>
                        {filteredOrders.length === 0 ? (
                            <div className="border border-dashed rounded-lg py-10 text-center text-sm text-muted-foreground">
                                Tidak ada SPK berjalan di filter ini
                            </div>
                        ) : (
                            filteredOrders.slice(0, 5).map((o) => (
                                <div
                                    key={o.id}
                                    className="rounded-lg border bg-background/40 p-3 space-y-2"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm truncate">
                                                {o.productName}
                                            </div>
                                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                                {o.orderNumber} ·{' '}
                                                {o.machineCode} ·{' '}
                                                {o.operatorName}
                                                {tab === 'ALL' && (
                                                    <span className="ml-1">
                                                        · {o.processKey}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {o.isLate && (
                                                <Badge
                                                    variant="destructive"
                                                    className="text-[10px]"
                                                >
                                                    Terlambat
                                                </Badge>
                                            )}
                                            <span className="text-xs font-bold tabular-nums">
                                                {Math.min(
                                                    100,
                                                    o.progress,
                                                ).toFixed(0)}
                                                %
                                            </span>
                                        </div>
                                    </div>
                                    <Progress
                                        value={Math.min(100, o.progress)}
                                        className="h-1.5"
                                    />
                                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                        <span>
                                            {o.actualQty.toLocaleString(
                                                'id-ID',
                                                { maximumFractionDigits: 1 },
                                            )}{' '}
                                            /{' '}
                                            {o.plannedQty.toLocaleString(
                                                'id-ID',
                                                { maximumFractionDigits: 1 },
                                            )}
                                        </span>
                                        <Link
                                            href={`/production/orders/${o.id}`}
                                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                                        >
                                            Detail{' '}
                                            <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card
                    className="shadow-sm bg-card/65 backdrop-blur-sm scroll-mt-20"
                    id="attentions"
                >
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-bold">
                            Butuh perhatian
                        </CardTitle>
                        <CardDescription>
                            Pilih item untuk membuka SPK atau mesin terkait.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto">
                        {filteredAttentions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center border border-dashed rounded-lg py-10 text-center">
                                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                                <p className="text-sm font-semibold">
                                    Tidak ada isu
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Filter ini sehat.
                                </p>
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
                                                : 'border-amber-500/20 bg-amber-500/5',
                                        )}
                                    >
                                        {red ? (
                                            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <Link
                                                href={href}
                                                className="block hover:opacity-80 transition-opacity"
                                            >
                                                <p className="font-bold truncate">
                                                    {item.title}
                                                </p>
                                                <p className="text-muted-foreground mt-0.5 line-clamp-2">
                                                    {item.subtitle}
                                                </p>
                                            </Link>
                                            {item.secondaryHref &&
                                                item.secondaryLabel && (
                                                    <Link
                                                        href={
                                                            item.secondaryHref
                                                        }
                                                        className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:underline"
                                                    >
                                                        {item.secondaryLabel}{' '}
                                                        <ArrowRight className="h-3 w-3" />
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

            <section
                aria-label="Ringkasan hasil hari ini"
                className="rounded-xl border bg-card/60 p-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-bold">
                        Hasil hari ini · seluruh proses
                    </h2>
                    <Link
                        href="/production/analytics"
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Tren & Analitik →
                    </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {(
                        [
                            'MIXING',
                            'EXTRUSION',
                            'PACKING',
                            'OTHER',
                        ] as ProcessKey[]
                    ).map((key) => (
                        <div key={key}>
                            <p
                                className={cn(
                                    'text-xs font-semibold',
                                    PROCESS_COLOR[key],
                                )}
                            >
                                {key === 'OTHER' ? 'Lainnya' : key}
                            </p>
                            <p className="font-bold tabular-nums">
                                {activeData.processes[
                                    key
                                ].outputToday.toLocaleString('id-ID', {
                                    maximumFractionDigits: 1,
                                })}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                    KG
                                </span>
                            </p>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Hasil setiap proses ditampilkan terpisah, bukan dijumlahkan
                    sebagai produk akhir.
                </p>
            </section>
        </div>
    );
}

const WORK_STRIP_ACCENT: Record<string, string> = {
    emerald:
        'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
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
            aria-label={`${count} ${label}`}
            className={cn(
                'flex flex-col gap-0.5 rounded-lg border p-2.5 text-xs transition-colors hover:opacity-80',
                WORK_STRIP_ACCENT[accent] || WORK_STRIP_ACCENT.emerald,
            )}
        >
            <span className="font-bold text-lg tabular-nums leading-tight">
                {count}
            </span>
            <span className="font-medium text-[11px] leading-tight">
                {label}
            </span>
        </Link>
    );
}

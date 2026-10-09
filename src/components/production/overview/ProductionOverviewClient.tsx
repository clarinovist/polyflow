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
import { cn, formatQuantity } from '@/lib/utils/utils';
import { formatUnitLabel } from '@/lib/utils/unit-label';
import type { TodayOutputItem } from '@/lib/production/live-overview';

type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';
export type TabKey = ProcessKey | 'ALL';

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
    runningOrders: RunningOrder[];
    attentions: AttentionItem[];
    todayOutputItems: TodayOutputItem[];
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

export function emptyOverviewData(): ProductionOverviewData {
    return {
        runningOrders: [],
        attentions: [],
        todayOutputItems: [],
    };
}

interface ProductionOverviewClientProps {
    initialData: ProductionOverviewData;
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

            <TodayOutputSummary items={activeData.todayOutputItems ?? []} />

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
        </div>
    );
}

const PROCESS_LABEL: Record<ProcessKey, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extru',
    PACKING: 'Packing',
    OTHER: 'Lainnya',
};

function TodayOutputSummary({ items }: { items: TodayOutputItem[] }) {
    const processTotals = new Map<ProcessKey, Map<string, number>>();
    for (const item of items) {
        const totals = processTotals.get(item.processKey) ?? new Map();
        totals.set(item.unit, (totals.get(item.unit) ?? 0) + item.quantity);
        processTotals.set(item.processKey, totals);
    }

    return (
        <section
            aria-label="Ringkasan hasil hari ini"
            className="rounded-xl border bg-card/60 p-4"
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold">
                    Hasil hari ini · seluruh proses
                </h2>
                <Link
                    href="/production/output-report?mode=product&page=1&preset=today"
                    className="text-sm font-medium text-primary hover:underline"
                >
                    Lihat rekap lengkap →
                </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {(Object.keys(PROCESS_LABEL) as ProcessKey[]).map((key) => (
                    <div key={key}>
                        <p
                            className={cn(
                                'text-xs font-semibold',
                                PROCESS_COLOR[key],
                            )}
                        >
                            {PROCESS_LABEL[key]}
                        </p>
                        {[...(processTotals.get(key) ?? [])].length === 0 ? (
                            <p className="font-bold tabular-nums">0</p>
                        ) : (
                            [...(processTotals.get(key) ?? [])].map(
                                ([unit, quantity]) => (
                                    <p
                                        key={unit}
                                        className="font-bold tabular-nums"
                                    >
                                        {formatQuantity(quantity)}{' '}
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {formatUnitLabel(unit)}
                                        </span>
                                    </p>
                                ),
                            )
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-4 border-t pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Hasil per barang
                    </h3>
                    <span className="text-xs text-muted-foreground">
                        {items.length} barang/proses
                    </span>
                </div>
                {items.length === 0 ? (
                    <p className="rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">
                        Belum ada hasil produksi yang tercatat hari ini.
                    </p>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {items.slice(0, 6).map((item) => {
                            const params = new URLSearchParams({
                                mode: 'product',
                                page: '1',
                                preset: 'today',
                                productVariantId: item.productVariantId,
                                process: item.processKey,
                            });

                            return (
                                <Link
                                    key={`${item.processKey}:${item.productVariantId}:${item.unit}`}
                                    href={`/production/output-report?${params.toString()}`}
                                    className="rounded-lg border bg-background/40 p-3 transition-colors hover:bg-muted/50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">
                                                {item.productName}
                                            </p>
                                            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                                {item.skuCode} ·{' '}
                                                {PROCESS_LABEL[item.processKey]}{' '}
                                                · {item.orderCount} SPK
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm font-bold tabular-nums">
                                            {formatQuantity(item.quantity)}{' '}
                                            <span className="text-xs font-normal text-muted-foreground">
                                                {formatUnitLabel(item.unit)}
                                            </span>
                                        </p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
                {items.length > 6 && (
                    <p className="mt-2 text-right text-xs text-muted-foreground">
                        {items.length - 6} barang/proses lainnya tersedia di
                        rekap lengkap.
                    </p>
                )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
                Hasil dikelompokkan per barang dan proses. Nilai dengan satuan
                berbeda tidak dijumlahkan.
            </p>
        </section>
    );
}

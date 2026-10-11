'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    Factory,
    Gauge,
    TimerOff,
} from 'lucide-react';
import { getProductionLiveOverview } from '@/actions/dashboard/production-live-overview';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
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
import { cn, formatQuantity } from '@/lib/utils/utils';
import { formatUnitLabel } from '@/lib/utils/unit-label';
import type { TodayOutputItem } from '@/lib/production/live-overview';
import type {
    ProductionAttentionItem,
    ProductionRunningOrder,
} from '@/services/production/production-dashboard-health-service';

type ProcessKey = 'MIXING' | 'EXTRUSION' | 'PACKING' | 'OTHER';
export type TabKey = ProcessKey | 'ALL';
type SectionState = 'AVAILABLE' | 'UNAVAILABLE';

export type ProductionOverviewData = {
    generatedAt: string;
    state: 'AVAILABLE' | 'HIDDEN';
    permissions: {
        links: {
            outputReport: string | null;
            daily: string | null;
            orders: string | null;
            warehouseMaterials: string | null;
            kiosk: string | null;
        };
    } | null;
    health: {
        output: {
            state: SectionState;
            totalGroups: number;
            returned: number;
            truncated: boolean;
            processTotals: Array<{
                processKey: ProcessKey;
                unit: string;
                quantity: number;
            }>;
            items: TodayOutputItem[];
        };
        activeSpk: {
            state: SectionState;
            total: number | null;
            lateTotal: number | null;
        };
        downtime: {
            state: SectionState;
            total: number;
            thresholdMinutes: number | null;
            longest: {
                incidentId: string;
                machineId: string;
                machineCode: string;
                reason: string;
                minutes: number;
                severity: 'red' | 'amber';
                href?: string;
            } | null;
        };
    } | null;
    liveOrders: {
        state: SectionState;
        total: number | null;
        lateTotal: number | null;
        returned: number;
        items: ProductionRunningOrder[];
    } | null;
    attention: {
        state: SectionState;
        total: number | null;
        returned: number;
        items: ProductionAttentionItem[];
    } | null;
    drivers: {
        state: SectionState;
        longestDowntime: {
            incidentId: string;
            machineId: string;
            machineCode: string;
            reason: string;
            minutes: number;
            severity: 'red' | 'amber';
            href?: string;
        } | null;
        lateProcess: {
            processKey: ProcessKey;
            lateCount: number;
            oldestDelayMinutes: number;
        } | null;
    } | null;
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

const PROCESS_LABEL: Record<ProcessKey, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extru',
    PACKING: 'Packing',
    OTHER: 'Lainnya',
};

interface ProductionOverviewClientProps {
    initialData: ProductionOverviewData;
}

export function emptyOverviewData(): ProductionOverviewData {
    return {
        generatedAt: new Date(0).toISOString(),
        state: 'AVAILABLE',
        permissions: {
            links: {
                outputReport: null,
                daily: null,
                orders: null,
                warehouseMaterials: null,
                kiosk: null,
            },
        },
        health: {
            output: {
                state: 'AVAILABLE',
                totalGroups: 0,
                returned: 0,
                truncated: false,
                processTotals: [],
                items: [],
            },
            activeSpk: { state: 'AVAILABLE', total: 0, lateTotal: 0 },
            downtime: {
                state: 'AVAILABLE',
                total: 0,
                thresholdMinutes: 30,
                longest: null,
            },
        },
        liveOrders: {
            state: 'AVAILABLE',
            total: 0,
            lateTotal: 0,
            returned: 0,
            items: [],
        },
        attention: {
            state: 'AVAILABLE',
            total: 0,
            returned: 0,
            items: [],
        },
        drivers: {
            state: 'AVAILABLE',
            longestDowntime: null,
            lateProcess: null,
        },
    };
}

function minuteLabel(minutes: number) {
    if (minutes < 60) return `${minutes.toLocaleString('id-ID')} menit`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0
        ? `${hours.toLocaleString('id-ID')} jam ${remainder} menit`
        : `${hours.toLocaleString('id-ID')} jam`;
}

function outputValue(
    processTotals: Array<{
        processKey: ProcessKey;
        unit: string;
        quantity: number;
    }>,
) {
    if (processTotals.length === 0) return '0 hasil tercatat';
    return processTotals
        .map(
            (total) =>
                `${PROCESS_LABEL[total.processKey]} · ${formatQuantity(total.quantity)} ${formatUnitLabel(total.unit)}`,
        )
        .join(' · ');
}

export function ProductionOverviewClient({
    initialData,
}: ProductionOverviewClientProps) {
    const [tab, setTab] = useState<TabKey>('ALL');

    const fetcher = async (): Promise<ProductionOverviewData> => {
        const response = await getProductionLiveOverview();
        if (response.success && response.data) {
            return response.data as unknown as ProductionOverviewData;
        }
        throw new Error(
            !response.success
                ? response.error
                : 'Gagal mengambil data produksi terbaru.',
        );
    };

    const { data, error, isLoading, mutate } = useSWR<ProductionOverviewData>(
        'production-live-overview',
        fetcher,
        {
            fallbackData: initialData,
            refreshInterval: 30_000,
            dedupingInterval: 25_000,
            revalidateOnFocus: true,
        },
    );
    const activeData = data ?? initialData;
    const links = activeData.permissions?.links;
    const health = activeData.health;
    const liveOrders = activeData.liveOrders;
    const attention = activeData.attention;
    const drivers = activeData.drivers;

    const filteredOrders = useMemo(() => {
        const rows = liveOrders?.items ?? [];
        if (tab === 'ALL') return rows;
        return rows.filter((order) => order.processKey === tab);
    }, [liveOrders?.items, tab]);
    const filteredAttentions = useMemo(() => {
        const rows = attention?.items ?? [];
        if (tab === 'ALL') return rows;
        return rows.filter(
            (item) => item.processKey === tab || item.processKey === 'ALL',
        );
    }, [attention?.items, tab]);

    const handleRefresh = () => {
        void mutate().catch(() => {
            // SWR exposes the rejection through `error`; keep last-good data.
        });
    };

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-6 [overflow-wrap:anywhere] md:gap-8 [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=card]]:min-w-0">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <DashboardFreshness generatedAt={activeData.generatedAt} />
                <LiveClockBar
                    onRefresh={handleRefresh}
                    isLoading={isLoading}
                    generatedAt={activeData.generatedAt}
                    kioskHref={links?.kiosk ?? null}
                />
            </div>

            {error && (
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Pembaruan gagal · data terakhir tetap ditampilkan"
                    description="Data di bawah mungkin belum terbaru. Waktu pembaruan tidak berubah sampai server berhasil mengirim data baru."
                />
            )}

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="production-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="production-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi produksi utama
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Kondisi saat ini. Kuantitas selalu dipisahkan menurut
                        proses, barang, dan satuan.
                    </p>
                </div>
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
                    <DashboardHealthCard
                        title="Output hari ini"
                        value={
                            health?.output.state === 'AVAILABLE'
                                ? outputValue(health.output.processTotals)
                                : undefined
                        }
                        icon={Factory}
                        state={health?.output.state ?? 'UNAVAILABLE'}
                        definition={{
                            unit: 'Kuantitas per proses, barang, dan satuan',
                            period: 'Hari bisnis WIB',
                            description:
                                'Hanya hasil produksi yang tidak dibatalkan. Nilai KG, PCS, dan satuan lain tidak pernah dijumlahkan.',
                            source: 'Catatan hasil produksi',
                        }}
                        supportingText={
                            health?.output.state === 'AVAILABLE' ? (
                                <span>
                                    {health.output.totalGroups} kelompok output.
                                    {health.output.truncated
                                        ? ' Pembacaan melewati batas aman; hasil tidak dianggap lengkap.'
                                        : ''}
                                </span>
                            ) : undefined
                        }
                        href={
                            health?.output.state === 'AVAILABLE' &&
                            links?.outputReport
                                ? `${links.outputReport}?mode=product&page=1&preset=today`
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="SPK aktif"
                        value={
                            health?.activeSpk.state === 'AVAILABLE' &&
                            health.activeSpk.total != null
                                ? `${health.activeSpk.total.toLocaleString('id-ID')} SPK`
                                : undefined
                        }
                        icon={Gauge}
                        state={health?.activeSpk.state ?? 'UNAVAILABLE'}
                        definition={{
                            unit: 'SPK',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'Seluruh SPK yang sedang berjalan; SPK terlambat adalah yang rencana selesainya sudah terlewati.',
                            source: 'Daftar SPK produksi',
                        }}
                        supportingText={
                            health?.activeSpk.state === 'AVAILABLE' &&
                            health.activeSpk.lateTotal != null ? (
                                <span>
                                    {health.activeSpk.lateTotal.toLocaleString(
                                        'id-ID',
                                    )}{' '}
                                    terlambat
                                </span>
                            ) : undefined
                        }
                        href={
                            health?.activeSpk.state === 'AVAILABLE'
                                ? (links?.daily ?? links?.orders ?? undefined)
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Waktu henti terbuka terlama"
                        value={
                            health?.downtime.state === 'AVAILABLE'
                                ? health.downtime.longest
                                    ? minuteLabel(
                                          health.downtime.longest.minutes,
                                      )
                                    : 'Tidak ada insiden terbuka'
                                : undefined
                        }
                        icon={TimerOff}
                        state={health?.downtime.state ?? 'UNAVAILABLE'}
                        definition={{
                            unit: 'Menit per insiden',
                            period: 'Saat dashboard diperbarui',
                            description:
                                'Durasi satu insiden terbuka terlama, dibandingkan dengan batas waktu tiap insiden.',
                            source: 'Catatan waktu henti mesin dan pengaturan perusahaan',
                        }}
                        supportingText={
                            health?.downtime.state === 'AVAILABLE' ? (
                                <span>
                                    {health.downtime.longest
                                        ? `${health.downtime.longest.machineCode} · ${health.downtime.longest.reason}`
                                        : 'Semua insiden sudah ditutup.'}{' '}
                                    Batas perhatian:{' '}
                                    {health.downtime.thresholdMinutes ?? '—'}
                                    {' menit.'}
                                </span>
                            ) : undefined
                        }
                        href={
                            health?.downtime.state === 'AVAILABLE'
                                ? health.downtime.longest?.href
                                : undefined
                        }
                    />
                </div>
                {health?.output.state === 'AVAILABLE' && (
                    <TodayOutputSummary
                        items={health.output.items}
                        processTotals={health.output.processTotals}
                        totalGroups={health.output.totalGroups}
                        returned={health.output.returned}
                        outputReportHref={links?.outputReport ?? null}
                    />
                )}
            </section>

            <section
                className="min-w-0 space-y-4"
                aria-labelledby="production-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Perlu perhatian
                    </p>
                    <h2
                        id="production-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Pekerjaan dan perhatian per proses
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Total mencakup seluruh data yang memenuhi syarat; daftar
                        menampilkan prioritas teratas dan diperbarui setiap 30
                        detik.
                    </p>
                </div>

                <div
                    role="group"
                    aria-label="Filter proses pekerjaan dan perhatian"
                    className="flex flex-wrap gap-2"
                >
                    {TABS.map((item) => (
                        <Button
                            key={item.key}
                            type="button"
                            variant={tab === item.key ? 'default' : 'outline'}
                            aria-pressed={tab === item.key}
                            onClick={() => setTab(item.key)}
                            className="min-h-11 text-xs font-bold tracking-wide"
                        >
                            {item.label}
                        </Button>
                    ))}
                </div>

                {attention?.state === 'UNAVAILABLE' && (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sebagian perhatian Production tidak tersedia"
                        description="Data yang gagal dimuat tidak dianggap sebagai semua aman. Item yang berhasil dibaca tetap ditampilkan."
                    />
                )}

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-bold">
                                SPK aktif
                            </CardTitle>
                            <CardDescription>
                                {liveOrders?.total == null
                                    ? 'Total tidak tersedia'
                                    : `${liveOrders.total.toLocaleString('id-ID')} total · ${liveOrders.returned.toLocaleString('id-ID')} ditampilkan`}
                                {tab !== 'ALL'
                                    ? ` · filter ${PROCESS_LABEL[tab]}`
                                    : ''}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                            {links?.daily && (
                                <Link
                                    href={links.daily}
                                    className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                                >
                                    Buka Board Proses →
                                </Link>
                            )}
                            {liveOrders?.state === 'UNAVAILABLE' &&
                            filteredOrders.length === 0 ? (
                                <DashboardSectionState state="UNAVAILABLE" />
                            ) : filteredOrders.length === 0 ? (
                                <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                                    Tidak ada SPK dalam sampel pada filter ini.
                                </p>
                            ) : (
                                filteredOrders.map((order) => (
                                    <div
                                        key={order.id}
                                        className="space-y-2 rounded-lg border bg-background/40 p-3"
                                    >
                                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="break-words text-sm font-semibold">
                                                    {order.productName}
                                                </p>
                                                <p className="break-words text-[11px] text-muted-foreground">
                                                    {order.orderNumber} ·{' '}
                                                    {order.machineCode} ·{' '}
                                                    {order.operatorName} ·{' '}
                                                    {PROCESS_LABEL[
                                                        order.processKey
                                                    ]}
                                                </p>
                                            </div>
                                            {order.isLate && (
                                                <Badge variant="destructive">
                                                    Terlambat
                                                </Badge>
                                            )}
                                        </div>
                                        <Progress
                                            value={Math.min(
                                                100,
                                                order.progress,
                                            )}
                                            className="h-1.5"
                                        />
                                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                            <span className="tabular-nums">
                                                {formatQuantity(
                                                    order.actualQty,
                                                )}{' '}
                                                /{' '}
                                                {formatQuantity(
                                                    order.plannedQty,
                                                )}{' '}
                                                {formatUnitLabel(order.unit)}
                                            </span>
                                            {links?.orders && (
                                                <Link
                                                    href={`${links.orders}/${order.id}`}
                                                    className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline"
                                                >
                                                    Detail{' '}
                                                    <ExternalLink className="h-3 w-3" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card id="attentions" className="scroll-mt-20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-bold">
                                Butuh perhatian
                            </CardTitle>
                            <CardDescription>
                                {attention?.total == null
                                    ? 'Total tidak tersedia'
                                    : `${attention.total.toLocaleString('id-ID')} total · ${attention.returned.toLocaleString('id-ID')} ditampilkan`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto">
                            {filteredAttentions.length === 0 &&
                            attention?.state === 'AVAILABLE' ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
                                    <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                                    <p className="text-sm font-semibold">
                                        Tidak ada isu dalam sampel filter ini
                                    </p>
                                </div>
                            ) : (
                                filteredAttentions.map((item, index) => {
                                    const body = (
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words font-bold">
                                                {item.title}
                                            </p>
                                            <p className="mt-0.5 break-words text-muted-foreground">
                                                {item.subtitle}
                                            </p>
                                        </div>
                                    );
                                    return (
                                        <div
                                            key={`${item.type}:${item.orderId ?? item.machineId ?? index}`}
                                            className={cn(
                                                'flex min-w-0 items-start gap-2.5 rounded-lg border p-3 text-xs',
                                                item.severity === 'red'
                                                    ? 'border-rose-500/20 bg-rose-500/5'
                                                    : 'border-amber-500/20 bg-amber-500/5',
                                            )}
                                        >
                                            {item.severity === 'red' ? (
                                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                                            ) : (
                                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                {item.href ? (
                                                    <Link
                                                        href={item.href}
                                                        className="flex min-h-11 min-w-0 items-center hover:opacity-80"
                                                    >
                                                        {body}
                                                    </Link>
                                                ) : (
                                                    body
                                                )}
                                                {item.secondaryHref &&
                                                    item.secondaryLabel && (
                                                        <Link
                                                            href={
                                                                item.secondaryHref
                                                            }
                                                            className="mt-1.5 inline-flex min-h-11 items-center text-[11px] font-semibold text-primary hover:underline"
                                                        >
                                                            {
                                                                item.secondaryLabel
                                                            }
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
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="production-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Arah utama
                    </p>
                    <h2
                        id="production-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Hambatan utama saat ini
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Ringkasan kondisi saat ini, bukan perbandingan target
                        atau kesimpulan penyebab.
                    </p>
                </div>
                {drivers?.state === 'UNAVAILABLE' && (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sebagian arah utama Production tidak tersedia"
                        description="Data yang gagal dimuat tidak dianggap sebagai tidak ada hambatan."
                    />
                )}
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Insiden waktu henti terbuka terlama
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {drivers?.longestDowntime ? (
                                <div className="space-y-2">
                                    <p className="text-2xl font-bold tabular-nums">
                                        {minuteLabel(
                                            drivers.longestDowntime.minutes,
                                        )}
                                    </p>
                                    <p className="break-words text-sm">
                                        {drivers.longestDowntime.machineCode} ·{' '}
                                        {drivers.longestDowntime.reason}
                                    </p>
                                    {drivers.longestDowntime.href && (
                                        <Link
                                            href={drivers.longestDowntime.href}
                                            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                                        >
                                            Buka mesin →
                                        </Link>
                                    )}
                                </div>
                            ) : drivers?.state === 'AVAILABLE' ? (
                                <p className="text-sm text-muted-foreground">
                                    Tidak ada insiden waktu henti terbuka.
                                </p>
                            ) : (
                                <DashboardSectionState state="UNAVAILABLE" />
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Proses dengan SPK terlambat terbanyak
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {drivers?.lateProcess ? (
                                <div className="space-y-2">
                                    <p className="text-2xl font-bold">
                                        {
                                            PROCESS_LABEL[
                                                drivers.lateProcess.processKey
                                            ]
                                        }
                                    </p>
                                    <p className="text-sm tabular-nums">
                                        {drivers.lateProcess.lateCount.toLocaleString(
                                            'id-ID',
                                        )}{' '}
                                        SPK terlambat · tertua{' '}
                                        {minuteLabel(
                                            drivers.lateProcess
                                                .oldestDelayMinutes,
                                        )}
                                    </p>
                                    {(links?.daily || links?.orders) && (
                                        <Link
                                            href={links.daily ?? links.orders!}
                                            className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                                        >
                                            Buka daftar SPK →
                                        </Link>
                                    )}
                                </div>
                            ) : drivers?.state === 'AVAILABLE' ? (
                                <p className="text-sm text-muted-foreground">
                                    Tidak ada SPK aktif yang terlambat.
                                </p>
                            ) : (
                                <DashboardSectionState state="UNAVAILABLE" />
                            )}
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}

function TodayOutputSummary({
    items,
    processTotals,
    totalGroups,
    returned,
    outputReportHref,
}: {
    items: TodayOutputItem[];
    processTotals: Array<{
        processKey: ProcessKey;
        unit: string;
        quantity: number;
    }>;
    totalGroups: number;
    returned: number;
    outputReportHref: string | null;
}) {
    const totalsByProcess = new Map<ProcessKey, Map<string, number>>();
    for (const total of processTotals) {
        const totals = totalsByProcess.get(total.processKey) ?? new Map();
        totals.set(total.unit, total.quantity);
        totalsByProcess.set(total.processKey, totals);
    }

    return (
        <div
            aria-label="Ringkasan hasil hari ini"
            className="min-w-0 rounded-xl border bg-card/60 p-4"
        >
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                    Hasil per proses dan barang
                </h3>
                {outputReportHref && (
                    <Link
                        href={`${outputReportHref}?mode=product&page=1&preset=today`}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                    >
                        Lihat rekap lengkap →
                    </Link>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {(Object.keys(PROCESS_LABEL) as ProcessKey[]).map((key) => (
                    <div key={key} className="min-w-0">
                        <p
                            className={cn(
                                'text-xs font-semibold',
                                PROCESS_COLOR[key],
                            )}
                        >
                            {PROCESS_LABEL[key]}
                        </p>
                        {[...(totalsByProcess.get(key) ?? [])].length === 0 ? (
                            <p className="font-bold tabular-nums">0</p>
                        ) : (
                            [...(totalsByProcess.get(key) ?? [])].map(
                                ([unit, quantity]) => (
                                    <p
                                        key={unit}
                                        className="break-words font-bold tabular-nums"
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
            <p className="mt-3 text-xs text-muted-foreground">
                {totalGroups.toLocaleString('id-ID')} kelompok total ·{' '}
                {returned.toLocaleString('id-ID')} ditampilkan. Nilai dengan
                satuan berbeda tidak dijumlahkan.
            </p>
            {items.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">
                    Belum ada hasil produksi yang tercatat hari ini.
                </p>
            ) : (
                <div className="mt-4 grid min-w-0 gap-2 border-t pt-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.slice(0, 6).map((item) => {
                        const card = (
                            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-semibold">
                                        {item.productName}
                                    </p>
                                    <p className="break-words font-mono text-[11px] text-muted-foreground">
                                        {item.skuCode} ·{' '}
                                        {PROCESS_LABEL[item.processKey]} ·{' '}
                                        {item.orderCount} SPK
                                    </p>
                                </div>
                                <p className="max-w-full break-words text-sm font-bold tabular-nums">
                                    {formatQuantity(item.quantity)}{' '}
                                    {formatUnitLabel(item.unit)}
                                </p>
                            </div>
                        );
                        const href = outputReportHref
                            ? `${outputReportHref}?${new URLSearchParams({
                                  mode: 'product',
                                  page: '1',
                                  preset: 'today',
                                  productVariantId: item.productVariantId,
                                  process: item.processKey,
                              }).toString()}`
                            : null;
                        return href ? (
                            <Link
                                key={`${item.processKey}:${item.productVariantId}:${item.unit}`}
                                href={href}
                                className="min-w-0 rounded-lg border bg-background/40 p-3 hover:bg-muted/50"
                            >
                                {card}
                            </Link>
                        ) : (
                            <div
                                key={`${item.processKey}:${item.productVariantId}:${item.unit}`}
                                className="min-w-0 rounded-lg border bg-background/40 p-3"
                            >
                                {card}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

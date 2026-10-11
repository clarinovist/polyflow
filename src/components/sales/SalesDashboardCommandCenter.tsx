import { AlertCircle, ArrowRight, BarChart3, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { getSalesDashboardStats } from '@/actions/dashboard/sales-dashboard';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '@/lib/utils/utils';

type ActionData<T> = T extends { data?: infer D } ? NonNullable<D> : never;
type SalesDashboardData = ActionData<
    Awaited<ReturnType<typeof getSalesDashboardStats>>
>;
type Attention = NonNullable<SalesDashboardData['attention']>;
type Links = NonNullable<SalesDashboardData['permissions']>['links'];
type Drivers = NonNullable<SalesDashboardData['drivers']>;
type Period = NonNullable<SalesDashboardData['period']>;
type Scope = NonNullable<SalesDashboardData['scope']>;
type QueueTone = 'critical' | 'warning' | 'neutral';

type QueueItem = {
    id: string;
    category: string;
    title: string;
    subtitle: string;
    age?: string;
    value?: string;
    tone: QueueTone;
    href?: string | null;
    action: string;
};

type QueueFilter = {
    label: string;
    total: number;
    href?: string | null;
};

function queueDotClass(tone: QueueTone) {
    if (tone === 'critical') {
        return 'bg-destructive ring-destructive/10';
    }
    if (tone === 'warning') {
        return 'bg-amber-500 ring-amber-500/10';
    }
    return 'bg-zinc-400 ring-zinc-400/10 dark:bg-zinc-500';
}

function categoryClass(tone: QueueTone) {
    if (tone === 'critical') {
        return 'bg-destructive/10 text-destructive';
    }
    if (tone === 'warning') {
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
    }
    return 'bg-muted text-muted-foreground';
}

function QueueSummaryChip({ filter }: { filter: QueueFilter }) {
    const content = (
        <>
            <span>{filter.label}</span>
            <span className="tabular-nums">{filter.total}</span>
        </>
    );
    const className =
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-background px-3 text-xs font-semibold text-muted-foreground transition hover:border-foreground/25 hover:text-foreground';

    return filter.href ? (
        <Link href={filter.href} className={className}>
            {content}
        </Link>
    ) : (
        <span className={className}>{content}</span>
    );
}

function QueueRow({ item }: { item: QueueItem }) {
    const body = (
        <>
            <div className="flex min-w-0 gap-3">
                <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${queueDotClass(item.tone)}`}
                />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`h-6 rounded-full border-0 px-2 text-[10px] uppercase tracking-wide ${categoryClass(item.tone)}`}
                        >
                            {item.category}
                        </Badge>
                        {item.age && (
                            <span className="text-[11px] font-medium text-muted-foreground">
                                {item.age}
                            </span>
                        )}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold sm:text-[15px]">
                        {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                    </p>
                </div>
            </div>
            <p className="pl-5 text-sm font-semibold tabular-nums sm:pl-0 sm:text-right">
                {item.value ?? '—'}
            </p>
            <span className="ml-5 inline-flex min-h-11 items-center justify-start gap-1 text-xs font-semibold text-primary sm:ml-0 sm:min-w-28 sm:justify-end">
                {item.action}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
        </>
    );
    const className =
        'group grid min-w-0 gap-3 border-b px-4 py-4 last:border-b-0 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5';

    return item.href ? (
        <li>
            <Link href={item.href} className={className}>
                {body}
            </Link>
        </li>
    ) : (
        <li className={className}>{body}</li>
    );
}

function SalesTrendChart({
    points,
}: {
    points: Array<{ month: string; revenue: number }>;
}) {
    const width = 520;
    const height = 176;
    const values = points.map((point) => point.revenue);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = max - min || 1;
    const coordinates = points.map((point, index) => ({
        x:
            points.length === 1
                ? width / 2
                : (index / (points.length - 1)) * width,
        y: height - ((point.revenue - min) / span) * (height - 18) - 9,
    }));
    const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
    const area = `0,${height} ${line} ${width},${height}`;

    return (
        <div className="mt-5">
            <svg
                role="img"
                aria-labelledby="sales-trend-title sales-trend-desc"
                viewBox={`0 0 ${width} ${height}`}
                className="h-44 w-full overflow-visible"
                preserveAspectRatio="none"
            >
                <title id="sales-trend-title">Tren omzet enam bulan</title>
                <desc id="sales-trend-desc">
                    {points
                        .map(
                            (point) =>
                                `${point.month}: ${formatRupiah(point.revenue)}`,
                        )
                        .join(', ')}
                </desc>
                {[0, 1, 2, 3].map((lineIndex) => (
                    <line
                        key={lineIndex}
                        x1="0"
                        x2={width}
                        y1={(height / 3) * lineIndex}
                        y2={(height / 3) * lineIndex}
                        stroke="currentColor"
                        className="text-border"
                        strokeDasharray="4 8"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
                <polygon
                    points={area}
                    fill="currentColor"
                    className="text-foreground"
                    opacity="0.06"
                />
                <polyline
                    points={line}
                    fill="none"
                    stroke="currentColor"
                    className="text-foreground"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
                {coordinates.map((point, index) => (
                    <circle
                        key={points[index].month}
                        cx={point.x}
                        cy={point.y}
                        r="4.5"
                        fill="var(--card)"
                        stroke="currentColor"
                        className="text-foreground"
                        strokeWidth="3"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </svg>
            <ol
                className="mt-2 grid text-center text-[11px] font-medium text-muted-foreground"
                style={{
                    gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
                }}
            >
                {points.map((point) => (
                    <li key={point.month}>{point.month}</li>
                ))}
            </ol>
        </div>
    );
}

function buildQueue(
    attention: Attention,
    links: Links,
    canViewNominal: boolean,
): QueueItem[] {
    const items: QueueItem[] = [];

    for (const item of attention.overdueInvoices?.items ?? []) {
        items.push({
            id: `overdue-${item.id}`,
            category: 'Jatuh tempo',
            title: `${item.invoiceNumber} · ${item.customerName}`,
            subtitle: 'Tagihan melewati jatuh tempo dan perlu ditindaklanjuti.',
            value:
                canViewNominal && item.remaining != null
                    ? formatRupiah(item.remaining)
                    : undefined,
            tone: 'critical',
            href:
                item.salesOrderId && links.orders
                    ? `${links.orders}/${item.salesOrderId}`
                    : links.invoices
                      ? `${links.invoices}?status=OVERDUE`
                      : null,
            action: 'Tinjau tagihan',
        });
    }

    for (const item of attention.creditRisk?.items ?? []) {
        items.push({
            id: `credit-${item.id}`,
            category: 'Risiko kredit',
            title: item.name,
            subtitle:
                item.exposureStatus === 'over'
                    ? 'Limit kredit terlewati.'
                    : 'Eksposur mendekati limit kredit.',
            value:
                canViewNominal && item.headroom != null
                    ? formatRupiah(item.headroom)
                    : undefined,
            tone: item.exposureStatus === 'over' ? 'critical' : 'warning',
            href: links.customers ? `${links.customers}/${item.id}` : null,
            action: 'Tinjau limit',
        });
    }

    for (const item of attention.followUpsDue?.items ?? []) {
        items.push({
            id: `follow-up-${item.id}`,
            category: 'Follow-up',
            title: `${item.orderNumber} · ${item.customerName}`,
            subtitle: item.isOverdue
                ? 'Tindak lanjut penawaran sudah terlambat.'
                : 'Tindak lanjut penawaran jatuh tempo hari ini.',
            age: item.isOverdue ? 'Terlambat' : 'Hari ini',
            tone: item.isOverdue ? 'critical' : 'warning',
            href: links.orders ? `${links.orders}/${item.id}` : null,
            action: 'Buka penawaran',
        });
    }

    for (const item of attention.readyWithoutDo?.items ?? []) {
        items.push({
            id: `ready-${item.id}`,
            category: 'Siap tanpa SJ',
            title: `${item.orderNumber} · ${item.customerName}`,
            subtitle: 'Pesanan siap tetapi surat jalan belum dibuat.',
            tone: 'warning',
            href: links.orders ? `${links.orders}/${item.id}` : null,
            action: 'Buka pesanan',
        });
    }

    for (const item of attention.oldDrafts?.items ?? []) {
        items.push({
            id: `draft-${item.id}`,
            category: 'SO draf',
            title: `${item.orderNumber} · ${item.customerName}`,
            subtitle: 'Pesanan draf belum diselesaikan.',
            age: `${item.daysOld} hari`,
            tone: 'neutral',
            href: links.orders ? `${links.orders}/${item.id}` : null,
            action: 'Lanjutkan',
        });
    }

    for (const item of attention.openDeliveries?.items ?? []) {
        items.push({
            id: `delivery-${item.id}`,
            category: 'SJ aktif',
            title: `${item.deliveryNumber} · ${item.customerName ?? '-'}`,
            subtitle:
                item.status === 'LOADING'
                    ? 'Surat jalan sedang dimuat.'
                    : 'Surat jalan menunggu proses berikutnya.',
            tone: 'neutral',
            href: links.deliveries ? `${links.deliveries}/${item.id}` : null,
            action: 'Pantau kirim',
        });
    }

    return items;
}

function filters(attention: Attention, links: Links): QueueFilter[] {
    return [
        {
            label: 'Jatuh tempo',
            total: attention.overdueInvoices?.total ?? 0,
            href: links.invoices ? `${links.invoices}?status=OVERDUE` : null,
        },
        {
            label: 'Risiko kredit',
            total: attention.creditRisk?.total ?? 0,
            href: links.customers,
        },
        {
            label: 'Siap kirim',
            total: attention.readyWithoutDo?.total ?? 0,
            href: links.orders ? `${links.orders}?status=READY_TO_SHIP` : null,
        },
        {
            label: 'Follow-up',
            total: attention.followUpsDue?.total ?? 0,
            href: links.orders
                ? `${links.orders}?status=QUOTATION,QUOTATION_SENT&followUpDue=1`
                : null,
        },
        {
            label: 'SO draf',
            total: attention.oldDrafts?.total ?? 0,
            href: links.orders ? `${links.orders}?status=DRAFT` : null,
        },
        {
            label: 'SJ aktif',
            total: attention.openDeliveries?.total ?? 0,
            href: links.deliveries,
        },
    ];
}

export function SalesDashboardCommandCenter({
    attention,
    drivers,
    links,
    canViewNominal,
    period,
    scope,
}: {
    attention: Attention | null | undefined;
    drivers: Drivers | null | undefined;
    links: Links;
    canViewNominal: boolean;
    period: Period;
    scope: Scope;
}) {
    const queue = attention ? buildQueue(attention, links, canViewNominal) : [];
    const visibleQueue = queue.slice(0, 8);
    const queueFilters = attention ? filters(attention, links) : [];
    const returnedItems = visibleQueue.length;
    const totalItems = queueFilters.reduce(
        (sum, filter) => sum + filter.total,
        0,
    );
    const trend = drivers?.revenueTrend.points ?? [];
    const topLostReason = drivers?.topLostReason.value ?? null;
    const driverUnavailable =
        drivers?.revenueTrend.state === 'UNAVAILABLE' ||
        drivers?.topLostReason.state === 'UNAVAILABLE';

    return (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
            <section
                aria-labelledby="sales-attention-heading"
                className="min-w-0"
            >
                <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                    <div className="border-b p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                                <AlertCircle
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Prioritas hari ini
                                </p>
                                <h2
                                    id="sales-attention-heading"
                                    className="mt-0.5 text-xl font-semibold tracking-tight"
                                >
                                    Butuh tindakan
                                </h2>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Diurutkan berdasarkan dampak dan urgensi.
                                    Cakupan: {scope.operationalLabel}.
                                </p>
                            </div>
                        </div>
                        {queueFilters.length > 0 && (
                            <div
                                className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
                                aria-label="Ringkasan antrean Sales"
                            >
                                {queueFilters.map((filter) => (
                                    <QueueSummaryChip
                                        key={filter.label}
                                        filter={filter}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {attention?.state === 'UNAVAILABLE' && (
                        <div className="p-4 sm:p-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Sebagian antrean Sales tidak tersedia"
                                description="Data yang gagal dimuat tidak dianggap sebagai antrean kosong. Data lain yang berhasil tetap ditampilkan."
                            />
                        </div>
                    )}

                    {visibleQueue.length > 0 ? (
                        <ul aria-label="Daftar prioritas Sales">
                            {visibleQueue.map((item) => (
                                <QueueRow key={item.id} item={item} />
                            ))}
                        </ul>
                    ) : attention?.state === 'AVAILABLE' ? (
                        <div className="p-8 text-center">
                            <p className="font-medium">
                                Tidak ada item yang butuh perhatian
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Antrean operasional pada cakupan ini sedang
                                kosong.
                            </p>
                        </div>
                    ) : attention ? null : (
                        <div className="p-4 sm:p-5">
                            <DashboardSectionState
                                state="UNAVAILABLE"
                                title="Antrean Sales tidak tersedia"
                                description="Kegagalan memuat data tidak dianggap sebagai antrean kosong."
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className="text-xs text-muted-foreground">
                            {totalItems > returnedItems
                                ? `${totalItems} total · ${returnedItems} ditampilkan`
                                : `${returnedItems} prioritas ditampilkan`}
                        </p>
                        {links.orders && (
                            <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="min-h-11 justify-start gap-1 px-0 sm:justify-center sm:px-3"
                            >
                                <Link href={links.orders}>
                                    Buka daftar pesanan
                                    <ArrowRight
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                    />
                                </Link>
                            </Button>
                        )}
                    </div>
                </Card>
            </section>

            <aside
                aria-labelledby="sales-drivers-heading"
                className="min-w-0 space-y-5"
            >
                {driverUnavailable && (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sebagian insight Sales tidak tersedia"
                        description="Kegagalan memuat data tidak dianggap sebagai tidak adanya pendorong bisnis."
                    />
                )}

                {trend.length >= 4 && (
                    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                        <CardHeader className="p-5 pb-0">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Insight ringkas
                                    </p>
                                    <CardTitle
                                        id="sales-drivers-heading"
                                        className="mt-1 text-lg font-semibold"
                                    >
                                        Tren omzet SO bersih
                                    </CardTitle>
                                </div>
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                                    <TrendingUp
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 pt-0">
                            <p className="mt-5 text-2xl font-bold tracking-tight tabular-nums">
                                {formatRupiah(trend[trend.length - 1].revenue)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Enam bulan penuh terakhir · dasar omzet bersih
                                yang sama
                            </p>
                            <SalesTrendChart points={trend} />
                            {links.performance && (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="mt-5 min-h-11 w-full justify-between"
                                >
                                    <Link href={links.performance}>
                                        Laporan performa
                                        <ArrowRight
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                        />
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}

                {topLostReason && (
                    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Sinyal utama
                                </p>
                                <BarChart3
                                    aria-hidden="true"
                                    className="h-4 w-4 text-amber-600 dark:text-amber-300"
                                />
                            </div>
                            <p className="mt-4 text-sm font-medium text-muted-foreground">
                                Hambatan pipeline utama
                            </p>
                            <p className="mt-1 break-words text-xl font-bold tracking-tight">
                                {topLostReason.label}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {topLostReason.count.toLocaleString('id-ID')}{' '}
                                penawaran ditolak pada {period.label}.
                            </p>
                            {canViewNominal &&
                                topLostReason.totalValue != null && (
                                    <p className="mt-2 text-sm font-semibold tabular-nums">
                                        {formatRupiah(topLostReason.totalValue)}
                                    </p>
                                )}
                            {links.pipeline && (
                                <Button
                                    asChild
                                    variant="outline"
                                    className="mt-5 min-h-11 w-full justify-between"
                                >
                                    <Link href={links.pipeline}>
                                        Buka pipeline
                                        <ArrowRight
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                        />
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}

                {!driverUnavailable && trend.length < 4 && !topLostReason && (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm">
                        <p className="font-medium">
                            Insight belum cukup matang
                        </p>
                        <p className="mt-1 text-muted-foreground">
                            Tren membutuhkan minimal empat periode dan alasan
                            kehilangan membutuhkan penawaran yang ditolak.
                        </p>
                    </div>
                )}
            </aside>
        </div>
    );
}

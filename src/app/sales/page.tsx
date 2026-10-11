import { getSalesDashboardStats } from '@/actions/dashboard/sales-dashboard';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    CalendarDays,
    Clock,
    CreditCard,
    FileText,
    HandCoins,
    Kanban,
    MapPinned,
    Package,
    Plus,
    ShoppingCart,
    Smartphone,
    TrendingUp,
    Truck,
} from 'lucide-react';

type ActionData<T> = T extends { data?: infer D } ? NonNullable<D> : never;
export type SalesDashboardData = ActionData<
    Awaited<ReturnType<typeof getSalesDashboardStats>>
>;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type Attention = NonNullable<SalesDashboardData['attention']>;
type Links = NonNullable<SalesDashboardData['permissions']>['links'];

function dateParam(value: string | string[] | undefined) {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

function sampleLabel(total: number, returned: number) {
    return returned < total
        ? total + ' total · ' + returned + ' ditampilkan'
        : String(total);
}

function QueueCard({
    title,
    total,
    returned,
    icon: Icon,
    children,
    footerHref,
    footerLabel = 'Lihat semua',
}: {
    title: string;
    total: number;
    returned: number;
    icon: typeof FileText;
    children: React.ReactNode;
    footerHref?: string | null;
    footerLabel?: string;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader className="pb-2">
                <CardTitle className="min-w-0 text-sm font-medium">
                    <span className="flex min-w-0 items-center gap-2">
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">{title}</span>
                    </span>
                    <Badge
                        variant="secondary"
                        className="mt-2 h-auto max-w-full whitespace-normal text-left text-[10px]"
                    >
                        {sampleLabel(total, returned)}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 space-y-2">
                {children}
                {footerHref && (
                    <Link
                        href={footerHref}
                        className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                        {footerLabel} <ArrowRight className="h-3 w-3" />
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}

function AttentionSection({
    attention,
    links,
    canViewNominal,
}: {
    attention: Attention;
    links: Links;
    canViewNominal: boolean;
}) {
    const groups = [
        attention.oldDrafts,
        attention.readyWithoutDo,
        attention.openDeliveries,
        attention.overdueInvoices,
        attention.creditRisk,
        attention.followUpsDue,
    ];
    const hasItems = groups.some((group) => (group?.returned ?? 0) > 0);

    return (
        <>
            {attention.state === 'UNAVAILABLE' && (
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Sebagian antrean Sales tidak tersedia"
                    description="Data yang gagal dimuat tidak dianggap sebagai antrean kosong. Data lain yang berhasil tetap ditampilkan."
                />
            )}
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
                {attention.oldDrafts && attention.oldDrafts.returned > 0 && (
                    <QueueCard
                        title="SO draf"
                        total={attention.oldDrafts.total}
                        returned={attention.oldDrafts.returned}
                        icon={FileText}
                        footerHref={
                            links.orders ? links.orders + '?status=DRAFT' : null
                        }
                    >
                        {attention.oldDrafts.items.map((item) => (
                            <div
                                key={item.id}
                                className="flex min-w-0 items-center justify-between gap-2 text-sm"
                            >
                                <div className="min-w-0">
                                    {links.orders ? (
                                        <Link
                                            href={links.orders + '/' + item.id}
                                            className="block truncate font-medium hover:underline"
                                        >
                                            {item.orderNumber}
                                        </Link>
                                    ) : (
                                        <p className="truncate font-medium">
                                            {item.orderNumber}
                                        </p>
                                    )}
                                    <p className="truncate text-xs text-muted-foreground">
                                        {item.customerName}
                                    </p>
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                    {item.daysOld}h
                                </Badge>
                            </div>
                        ))}
                    </QueueCard>
                )}

                {attention.readyWithoutDo &&
                    attention.readyWithoutDo.returned > 0 && (
                        <QueueCard
                            title="Siap tanpa SJ"
                            total={attention.readyWithoutDo.total}
                            returned={attention.readyWithoutDo.returned}
                            icon={Package}
                            footerHref={
                                links.orders
                                    ? links.orders + '?status=READY_TO_SHIP'
                                    : null
                            }
                        >
                            {attention.readyWithoutDo.items.map((item) => (
                                <div key={item.id} className="min-w-0 text-sm">
                                    {links.orders ? (
                                        <Link
                                            href={links.orders + '/' + item.id}
                                            className="block truncate font-medium hover:underline"
                                        >
                                            {item.orderNumber}
                                        </Link>
                                    ) : (
                                        <p className="truncate font-medium">
                                            {item.orderNumber}
                                        </p>
                                    )}
                                    <p className="truncate text-xs text-muted-foreground">
                                        {item.customerName}
                                    </p>
                                </div>
                            ))}
                        </QueueCard>
                    )}

                {attention.openDeliveries &&
                    attention.openDeliveries.returned > 0 && (
                        <QueueCard
                            title="SJ aktif"
                            total={attention.openDeliveries.total}
                            returned={attention.openDeliveries.returned}
                            icon={Truck}
                            footerHref={links.deliveries}
                        >
                            {attention.openDeliveries.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 items-center justify-between gap-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        {links.deliveries ? (
                                            <Link
                                                href={
                                                    links.deliveries +
                                                    '/' +
                                                    item.id
                                                }
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {item.deliveryNumber}
                                            </Link>
                                        ) : (
                                            <p className="truncate font-medium">
                                                {item.deliveryNumber}
                                            </p>
                                        )}
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.customerName ?? '-'}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            item.status === 'LOADING'
                                                ? 'default'
                                                : 'outline'
                                        }
                                        className="shrink-0"
                                    >
                                        {item.status === 'LOADING'
                                            ? 'Muat'
                                            : 'Menunggu'}
                                    </Badge>
                                </div>
                            ))}
                        </QueueCard>
                    )}

                {attention.overdueInvoices &&
                    attention.overdueInvoices.returned > 0 && (
                        <QueueCard
                            title="Tagihan jatuh tempo"
                            total={attention.overdueInvoices.total}
                            returned={attention.overdueInvoices.returned}
                            icon={AlertTriangle}
                            footerHref={
                                links.invoices
                                    ? links.invoices + '?status=OVERDUE'
                                    : null
                            }
                        >
                            {attention.overdueInvoices.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 items-center justify-between gap-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        {item.salesOrderId && links.orders ? (
                                            <Link
                                                href={
                                                    links.orders +
                                                    '/' +
                                                    item.salesOrderId
                                                }
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {item.invoiceNumber}
                                            </Link>
                                        ) : (
                                            <p className="truncate font-medium">
                                                {item.invoiceNumber}
                                            </p>
                                        )}
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.customerName}
                                        </p>
                                    </div>
                                    {canViewNominal &&
                                        item.remaining != null && (
                                            <span className="shrink-0 text-xs font-medium text-destructive tabular-nums">
                                                {formatRupiah(item.remaining)}
                                            </span>
                                        )}
                                </div>
                            ))}
                        </QueueCard>
                    )}

                {attention.creditRisk && attention.creditRisk.returned > 0 && (
                    <QueueCard
                        title="Risiko limit kredit"
                        total={attention.creditRisk.total}
                        returned={attention.creditRisk.returned}
                        icon={CreditCard}
                        footerHref={links.customers}
                        footerLabel="Lihat pelanggan"
                    >
                        {attention.creditRisk.items.map((item) => (
                            <div
                                key={item.id}
                                className="flex min-w-0 items-center justify-between gap-2 text-sm"
                            >
                                {links.customers ? (
                                    <Link
                                        href={links.customers + '/' + item.id}
                                        className="min-w-0 truncate font-medium hover:underline"
                                    >
                                        {item.name}
                                    </Link>
                                ) : (
                                    <p className="min-w-0 truncate font-medium">
                                        {item.name}
                                    </p>
                                )}
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <Badge
                                        variant={
                                            item.exposureStatus === 'over'
                                                ? 'destructive'
                                                : 'outline'
                                        }
                                    >
                                        {item.exposureStatus === 'over'
                                            ? 'Terlewati'
                                            : 'Mendekati'}
                                    </Badge>
                                    {canViewNominal &&
                                        item.headroom != null && (
                                            <span className="text-[10px] tabular-nums text-muted-foreground">
                                                {formatRupiah(item.headroom)}
                                            </span>
                                        )}
                                </div>
                            </div>
                        ))}
                    </QueueCard>
                )}

                {attention.followUpsDue &&
                    attention.followUpsDue.returned > 0 && (
                        <QueueCard
                            title="Tindak lanjut due"
                            total={attention.followUpsDue.total}
                            returned={attention.followUpsDue.returned}
                            icon={Clock}
                            footerHref={
                                links.orders
                                    ? links.orders +
                                      '?status=QUOTATION,QUOTATION_SENT&followUpDue=1'
                                    : null
                            }
                        >
                            {attention.followUpsDue.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 items-center justify-between gap-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        {links.orders ? (
                                            <Link
                                                href={
                                                    links.orders + '/' + item.id
                                                }
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {item.orderNumber}
                                            </Link>
                                        ) : (
                                            <p className="truncate font-medium">
                                                {item.orderNumber}
                                            </p>
                                        )}
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.customerName}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            item.isOverdue
                                                ? 'destructive'
                                                : 'outline'
                                        }
                                        className="shrink-0"
                                    >
                                        {item.isOverdue
                                            ? 'Terlambat'
                                            : 'Hari ini'}
                                    </Badge>
                                </div>
                            ))}
                        </QueueCard>
                    )}

                {!hasItems && attention.state === 'AVAILABLE' && (
                    <Card className="md:col-span-2 xl:col-span-3">
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Tidak ada item yang butuh perhatian pada cakupan ini.
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}

export default async function SalesCommandBoardPage(props: {
    searchParams: SearchParams;
}) {
    const searchParams = await props.searchParams;
    const from = dateParam(searchParams.from);
    const to = dateParam(searchParams.to);
    const statsRes = await getSalesDashboardStats(
        from && to ? { from, to } : undefined,
    );
    const board = statsRes.success && statsRes.data ? statsRes.data : null;

    if (
        !board ||
        board.state !== 'AVAILABLE' ||
        !board.health ||
        !board.permissions ||
        !board.scope ||
        !board.period
    ) {
        return (
            <div className="min-w-0 space-y-6">
                <PageHeader
                    title={salesLabels.salesDashboard}
                    description={salesLabels.salesDashboardDesc}
                />
                {board?.state === 'HIDDEN' ? (
                    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3 text-sm">
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">
                                Modul Sales tidak aktif
                            </p>
                            <p className="text-muted-foreground">
                                Dashboard Sales tidak ditampilkan dan data
                                modul tidak dimuat.
                            </p>
                        </div>
                    </div>
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard Sales tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                )}
            </div>
        );
    }

    const { health, attention, drivers, permissions, scope, period } = board;
    const { links, canViewNominal } = permissions;
    const revenueTrend = drivers?.revenueTrend.points ?? [];
    const topLostReason = drivers?.topLostReason.value ?? null;
    const driverUnavailable =
        drivers?.revenueTrend.state === 'UNAVAILABLE' ||
        drivers?.topLostReason.state === 'UNAVAILABLE';
    const hasDrivers = revenueTrend.length >= 4 || topLostReason != null;

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 md:space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <PageHeader
                        title={salesLabels.salesDashboard}
                        description="Ringkasan kondisi, perhatian, dan arah utama Sales."
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">Cakupan: {scope.label}</Badge>
                        <Badge variant="outline">Periode: {period.label}</Badge>
                    </div>
                </div>
                <DashboardFreshness generatedAt={board.generatedAt} />
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="sales-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="sales-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi utama
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
                    {health.revenue.state !== 'HIDDEN' && (
                        <DashboardHealthCard
                            title="Omzet SO bersih"
                            value={
                                health.revenue.value == null
                                    ? undefined
                                    : formatRupiah(health.revenue.value)
                            }
                            icon={HandCoins}
                            state={health.revenue.state}
                            definition={{
                                unit: 'Rupiah',
                                period: period.label,
                                description:
                                    'Nilai pesanan yang tidak dibatalkan, termasuk penawaran, dikurangi retur yang diproses dalam periode retur. ' +
                                    scope.label +
                                    '.',
                                source: 'Ringkasan omzet Sales',
                            }}
                            href={
                                health.revenue.state === 'AVAILABLE'
                                    ? (links.performance ?? undefined)
                                    : undefined
                            }
                            supportingText="Target belum disiapkan; menunggu rekonsiliasi Finance dan Sales."
                        />
                    )}
                    {health.orders.state !== 'HIDDEN' && (
                        <DashboardHealthCard
                            title="Pesanan aktual"
                            value={health.orders.value?.toLocaleString('id-ID')}
                            icon={ShoppingCart}
                            state={health.orders.state}
                            definition={{
                                unit: 'Pesanan',
                                period: period.label,
                                description:
                                    'Jumlah pesanan yang tidak dibatalkan pada kelompok yang sama dengan omzet, termasuk penawaran. ' +
                                    scope.label +
                                    '.',
                                source: 'Daftar pesanan Sales',
                            }}
                            href={
                                health.orders.state === 'AVAILABLE'
                                    ? (links.orders ?? undefined)
                                    : undefined
                            }
                            supportingText="Target belum disiapkan; angka ini tidak dibandingkan dengan target perkiraan."
                        />
                    )}
                    {health.visits.state !== 'HIDDEN' && (
                        <DashboardHealthCard
                            title="Kunjungan aktual"
                            value={health.visits.value?.toLocaleString('id-ID')}
                            icon={MapPinned}
                            state={health.visits.state}
                            definition={{
                                unit: 'Kunjungan',
                                period: period.label,
                                description:
                                    'Kunjungan yang tidak ditolak. ' +
                                    scope.label +
                                    '.',
                                source: 'Catatan kunjungan Sales',
                            }}
                            href={
                                health.visits.state === 'AVAILABLE'
                                    ? (links.visits ?? undefined)
                                    : undefined
                            }
                            supportingText="Target kunjungan belum disiapkan sampai dasar perbandingannya disetujui."
                        />
                    )}
                    {health.pipeline.state !== 'HIDDEN' && (
                        <DashboardHealthCard
                            title={
                                canViewNominal
                                    ? 'Nilai pipeline aktif'
                                    : 'Pipeline aktif'
                            }
                            value={
                                health.pipeline.state !== 'AVAILABLE'
                                    ? undefined
                                    : canViewNominal &&
                                        health.pipeline.value != null
                                      ? formatRupiah(health.pipeline.value)
                                      : (
                                            health.pipeline.count ?? 0
                                        ).toLocaleString('id-ID')
                            }
                            icon={Kanban}
                            state={health.pipeline.state}
                            definition={{
                                unit: canViewNominal ? 'Rupiah' : 'Penawaran',
                                period: period.label,
                                description:
                                    'Penawaran aktif yang masih disusun atau sudah dikirim dalam cakupan ' +
                                    scope.operationalLabel +
                                    '.',
                                source: 'Ringkasan penawaran Sales',
                            }}
                            href={
                                health.pipeline.state === 'AVAILABLE'
                                    ? (links.pipeline ?? undefined)
                                    : undefined
                            }
                            supportingText={
                                (health.pipeline.count ?? 0).toLocaleString(
                                    'id-ID',
                                ) +
                                ' penawaran aktif · termasuk dalam jumlah pesanan; tingkat konversi belum disiapkan'
                            }
                        />
                    )}
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="sales-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Perlu perhatian
                    </p>
                    <h2
                        id="sales-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Butuh perhatian
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Cakupan antrean: {scope.operationalLabel}. Total mencakup
                        seluruh data yang memenuhi syarat; daftar menampilkan
                        lima prioritas teratas.
                    </p>
                </div>
                {attention ? (
                    <AttentionSection
                        attention={attention}
                        links={links}
                        canViewNominal={canViewNominal}
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Antrean Sales tidak tersedia"
                        description="Kegagalan memuat data tidak dianggap sebagai antrean kosong."
                    />
                )}

                <div className="flex flex-wrap gap-3">
                    {links.orders && (
                        <>
                            <Button asChild size="sm" className="min-h-11">
                                <Link href={links.orders + '/create'}>
                                    <Plus className="mr-1 h-4 w-4" /> Pesanan
                                    baru
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                            >
                                <Link
                                    href={
                                        links.orders +
                                        '/create?intent=quotation'
                                    }
                                >
                                    <Plus className="mr-1 h-4 w-4" /> Penawaran
                                </Link>
                            </Button>
                        </>
                    )}
                    {links.deliverySchedules && (
                        <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                        >
                            <Link href={links.deliverySchedules}>
                                <CalendarDays className="mr-1 h-4 w-4" /> Jadwal
                                Kirim
                            </Link>
                        </Button>
                    )}
                    {links.fieldSales && (
                        <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                        >
                            <Link href={links.fieldSales}>
                                <Smartphone className="mr-1 h-4 w-4" /> Mode
                                seluler
                            </Link>
                        </Button>
                    )}
                </div>
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="sales-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Arah utama
                    </p>
                    <h2
                        id="sales-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Arah dan hambatan utama
                    </h2>
                </div>
                {driverUnavailable && (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sebagian arah utama Sales tidak tersedia"
                        description="Data yang gagal dimuat tidak dianggap sebagai tidak adanya pendorong bisnis. Pendorong lain yang berhasil tetap ditampilkan."
                    />
                )}
                {hasDrivers ? (
                    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
                        {revenueTrend.length >= 4 && (
                            <Card className="min-w-0 overflow-hidden">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                        <TrendingUp className="h-4 w-4" /> Tren
                                        omzet SO bersih
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="min-w-0">
                                    <ol
                                        className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2"
                                        aria-label="Nilai omzet bulanan"
                                    >
                                        {revenueTrend.map((point) => (
                                            <li
                                                key={point.month}
                                                className="min-w-0 rounded-md border bg-muted/20 p-3"
                                            >
                                                <p className="text-xs text-muted-foreground">
                                                    {point.month}
                                                </p>
                                                <p className="break-words text-sm font-semibold tabular-nums">
                                                    {formatRupiah(
                                                        point.revenue,
                                                    )}
                                                </p>
                                            </li>
                                        ))}
                                    </ol>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        Enam bulan penuh terakhir; setiap bulan
                                        memakai dasar omzet bersih yang sama.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                        {topLostReason && (
                            <Card className="min-w-0 overflow-hidden">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                        <BarChart3 className="h-4 w-4" /> Alasan
                                        penawaran ditolak teratas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="break-words text-xl font-bold">
                                        {topLostReason.label}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {topLostReason.count.toLocaleString(
                                            'id-ID',
                                        )}{' '}
                                        penawaran ditolak pada {period.label}.
                                        Cakupan: {scope.operationalLabel}.
                                    </p>
                                    {canViewNominal &&
                                        topLostReason.totalValue != null && (
                                            <p className="text-sm font-medium tabular-nums">
                                                Nilai:{' '}
                                                {formatRupiah(
                                                    topLostReason.totalValue,
                                                )}
                                            </p>
                                        )}
                                    {links.pipeline && (
                                        <Link
                                            href={links.pipeline}
                                            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                                        >
                                            Buka daftar penawaran{' '}
                                            <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                ) : driverUnavailable ? null : (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
                        <p className="font-medium">
                            Arah utama belum cukup matang
                        </p>
                        <p className="text-muted-foreground">
                            Tren membutuhkan minimal empat periode yang dapat
                            dibandingkan, dan alasan kehilangan membutuhkan
                            penawaran yang ditolak dalam cakupan ini.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}

import { getSalesDashboardStats } from '@/actions/dashboard/sales-dashboard';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { SalesDashboardCommandCenter } from '@/components/sales/SalesDashboardCommandCenter';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import Link from 'next/link';
import {
    CalendarDays,
    HandCoins,
    Kanban,
    MapPinned,
    Plus,
    ShoppingCart,
    Smartphone,
} from 'lucide-react';

type ActionData<T> = T extends { data?: infer D } ? NonNullable<D> : never;
export type SalesDashboardData = ActionData<
    Awaited<ReturnType<typeof getSalesDashboardStats>>
>;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function dateParam(value: string | string[] | undefined) {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
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
                                Dashboard Sales tidak ditampilkan dan data modul
                                tidak dimuat.
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

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 md:space-y-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Command center
                    </p>
                    <div className="mt-2">
                        <PageHeader
                            title={salesLabels.salesDashboard}
                            description="Prioritas hari ini, kesehatan pipeline, dan sinyal penjualan dalam satu tampilan."
                        />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge
                            variant="secondary"
                            className="rounded-full px-3"
                        >
                            {scope.label}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-3">
                            <CalendarDays className="mr-1.5 h-3 w-3" />
                            {period.label}
                        </Badge>
                        <DashboardFreshness generatedAt={board.generatedAt} />
                    </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {links.orders && (
                        <>
                            <Button
                                asChild
                                size="lg"
                                className="min-h-11 gap-2 shadow-sm"
                            >
                                <Link href={`${links.orders}/create`}>
                                    <Plus className="h-4 w-4" /> Pesanan baru
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                                className="min-h-11 gap-2"
                            >
                                <Link
                                    href={`${links.orders}/create?intent=quotation`}
                                >
                                    <Plus className="h-4 w-4" /> Penawaran
                                </Link>
                            </Button>
                        </>
                    )}
                    {links.deliverySchedules && (
                        <Button
                            asChild
                            size="lg"
                            variant="outline"
                            className="min-h-11 gap-2"
                        >
                            <Link href={links.deliverySchedules}>
                                <CalendarDays className="h-4 w-4" /> Jadwal
                                kirim
                            </Link>
                        </Button>
                    )}
                    {links.fieldSales && (
                        <Button
                            asChild
                            size="lg"
                            variant="ghost"
                            className="min-h-11 gap-2"
                        >
                            <Link href={links.fieldSales}>
                                <Smartphone className="h-4 w-4" /> Mode seluler
                            </Link>
                        </Button>
                    )}
                </div>
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="sales-health-heading"
            >
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="sales-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
                    </h2>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

            <SalesDashboardCommandCenter
                attention={attention}
                drivers={drivers}
                links={links}
                canViewNominal={canViewNominal}
                period={period}
                scope={scope}
            />
        </div>
    );
}

import { getFinanceShiftBoard } from '@/actions/dashboard/finance-dashboard';
import { getFinanceSalesReturnSummary } from '@/actions/finance/sales-returns';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { FinanceReturnQueue } from '@/components/finance/returns/FinanceReturnQueue';
import { FinanceDateFilter } from '@/components/finance/finance-date-filter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { formatRupiah } from '@/lib/utils/utils';
import {
    AlertTriangle,
    ArrowRight,
    Banknote,
    BarChart3,
    CalendarClock,
    FileClock,
    FileText,
    Landmark,
    Receipt,
    TrendingUp,
    Wallet,
    Zap,
} from 'lucide-react';
import Link from 'next/link';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

export const dynamic = 'force-dynamic';

type ActionData<T> = T extends { data?: infer D } ? NonNullable<D> : never;
export type FinanceDashboardData = ActionData<
    Awaited<ReturnType<typeof getFinanceShiftBoard>>
>;
type AvailableBoard = FinanceDashboardData & {
    state: 'AVAILABLE';
    period: NonNullable<FinanceDashboardData['period']>;
    permissions: NonNullable<FinanceDashboardData['permissions']>;
    health: NonNullable<FinanceDashboardData['health']>;
    drivers: NonNullable<FinanceDashboardData['drivers']>;
};
type Attention = NonNullable<AvailableBoard['attention']>;
type Links = AvailableBoard['permissions']['links'];

function sampleLabel(total: number, returned: number) {
    return `${total} total · ${returned} ditampilkan`;
}

function QueueSummaryCard({
    title,
    count,
    amount,
    subLabel,
    href,
    icon: Icon,
}: {
    title: string;
    count: number | null;
    amount?: number | null;
    subLabel: string;
    href?: string | null;
    icon: typeof FileText;
}) {
    const unavailable = count == null;
    const card = (
        <Card className="h-full min-w-0 gap-2 border-t-4 py-4 shadow-sm">
            <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-2 px-4 pb-0">
                <CardTitle className="min-w-0 break-words text-sm font-medium">
                    {title}
                </CardTitle>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="min-w-0 px-4">
                {unavailable ? (
                    <Badge variant="outline">UNAVAILABLE</Badge>
                ) : (
                    <>
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-2xl font-bold tabular-nums">
                                {count.toLocaleString('id-ID')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {subLabel}
                            </span>
                        </div>
                        {amount != null && (
                            <p className="mt-1 break-words text-sm font-medium tabular-nums">
                                {formatRupiah(amount)} sisa
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );

    return href && !unavailable && count > 0 ? (
        <Link href={href} className="block h-full min-w-0">
            {card}
        </Link>
    ) : (
        card
    );
}

function SampleCard({
    title,
    total,
    returned,
    icon: Icon,
    footerHref,
    children,
}: {
    title: string;
    total: number;
    returned: number;
    icon: typeof AlertTriangle;
    footerHref?: string | null;
    children: React.ReactNode;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader className="pb-2">
                <CardTitle className="min-w-0 text-sm font-medium">
                    <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
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
                        Lihat semua <ArrowRight className="h-3 w-3" />
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}

function AttentionSection({
    attention,
    links,
    hasReturnWork,
}: {
    attention: Attention;
    links: Links;
    hasReturnWork: boolean;
}) {
    const hasItems =
        [
            attention.arOverdue,
            attention.apOverdue,
            attention.draftJournals,
        ].some((sample) => (sample?.returned ?? 0) > 0) ||
        (attention.openBankRecs ?? 0) > 0 ||
        hasReturnWork;

    return (
        <>
            {attention.state === 'UNAVAILABLE' && (
                <DashboardSectionState
                    state="UNAVAILABLE"
                    title="Sebagian antrean Finance tidak tersedia"
                    description="Reader yang gagal tidak dianggap nol atau antrean kosong. Data lain yang berhasil tetap ditampilkan."
                />
            )}
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <QueueSummaryCard
                    title="Piutang jatuh tempo"
                    count={attention.arOverdue?.total ?? null}
                    amount={attention.arOverdue?.amount}
                    subLabel={`dari ${attention.arUnpaid?.total ?? '—'} belum lunas`}
                    href={
                        links.salesInvoices
                            ? `${links.salesInvoices}?overdue=true`
                            : null
                    }
                    icon={AlertTriangle}
                />
                <QueueSummaryCard
                    title="Hutang jatuh tempo"
                    count={attention.apOverdue?.total ?? null}
                    amount={attention.apOverdue?.amount}
                    subLabel={`dari ${attention.apUnpaid?.total ?? '—'} belum lunas`}
                    href={
                        links.purchaseInvoices
                            ? `${links.purchaseInvoices}?overdue=true`
                            : null
                    }
                    icon={Receipt}
                />
                <QueueSummaryCard
                    title="Jurnal draf"
                    count={attention.draftJournals?.total ?? null}
                    subLabel="menunggu posting"
                    href={
                        links.journals ? `${links.journals}?status=DRAFT` : null
                    }
                    icon={FileClock}
                />
                <QueueSummaryCard
                    title="Rekonsiliasi terbuka"
                    count={attention.openBankRecs}
                    subLabel="draf / sedang diproses"
                    href={links.reconciliation}
                    icon={Landmark}
                />
            </div>

            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
                {attention.arOverdue && (
                    <SampleCard
                        title="Piutang jatuh tempo teratas"
                        total={attention.arOverdue.total}
                        returned={attention.arOverdue.returned}
                        icon={AlertTriangle}
                        footerHref={
                            links.salesInvoices
                                ? `${links.salesInvoices}?overdue=true`
                                : null
                        }
                    >
                        {attention.arOverdue.returned === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Tidak ada piutang jatuh tempo.
                            </p>
                        ) : (
                            attention.arOverdue.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm"
                                >
                                    <div className="min-w-0 flex-1 basis-32">
                                        {links.salesInvoices ? (
                                            <Link
                                                href={`${links.salesInvoices}/${item.id}`}
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
                                    <span className="max-w-full break-words text-right text-xs font-semibold tabular-nums">
                                        {formatRupiah(item.remaining)}
                                    </span>
                                </div>
                            ))
                        )}
                    </SampleCard>
                )}

                {attention.apOverdue && (
                    <SampleCard
                        title="Hutang jatuh tempo teratas"
                        total={attention.apOverdue.total}
                        returned={attention.apOverdue.returned}
                        icon={Receipt}
                        footerHref={
                            links.purchaseInvoices
                                ? `${links.purchaseInvoices}?overdue=true`
                                : null
                        }
                    >
                        {attention.apOverdue.returned === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Tidak ada hutang jatuh tempo.
                            </p>
                        ) : (
                            attention.apOverdue.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm"
                                >
                                    <div className="min-w-0 flex-1 basis-32">
                                        {links.purchaseInvoices ? (
                                            <Link
                                                href={`${links.purchaseInvoices}/${item.id}`}
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
                                            {item.supplierName}
                                        </p>
                                    </div>
                                    <span className="max-w-full break-words text-right text-xs font-semibold tabular-nums">
                                        {formatRupiah(item.remaining)}
                                    </span>
                                </div>
                            ))
                        )}
                    </SampleCard>
                )}

                {attention.draftJournals && (
                    <SampleCard
                        title="Jurnal draf teratas"
                        total={attention.draftJournals.total}
                        returned={attention.draftJournals.returned}
                        icon={FileClock}
                        footerHref={
                            links.journals
                                ? `${links.journals}?status=DRAFT`
                                : null
                        }
                    >
                        {attention.draftJournals.returned === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Tidak ada jurnal draf.
                            </p>
                        ) : (
                            attention.draftJournals.items.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm"
                                >
                                    <div className="min-w-0 flex-1 basis-32">
                                        {links.journals ? (
                                            <Link
                                                href={`${links.journals}/${item.id}`}
                                                className="block truncate font-medium hover:underline"
                                            >
                                                {item.entryNumber}
                                            </Link>
                                        ) : (
                                            <p className="truncate font-medium">
                                                {item.entryNumber}
                                            </p>
                                        )}
                                        <p className="truncate text-xs text-muted-foreground">
                                            {item.description}
                                        </p>
                                    </div>
                                    <span className="max-w-full break-words text-right text-xs text-muted-foreground">
                                        {format(
                                            parseISO(item.entryDate),
                                            'd MMM',
                                            { locale: localeId },
                                        )}
                                    </span>
                                </div>
                            ))
                        )}
                    </SampleCard>
                )}

                {!hasItems && attention.state === 'AVAILABLE' && (
                    <Card className="lg:col-span-3">
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Tidak ada item Finance yang butuh perhatian.
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}

export default async function FinanceDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const startDate = params.startDate
        ? parseISO(params.startDate)
        : startOfMonth(now);
    const endDate = params.endDate ? parseISO(params.endDate) : endOfMonth(now);
    // The board action performs the fresh exact-root authorization. Do not run
    // any secondary nominal queue reader until that boundary succeeds.
    const boardResult = await getFinanceShiftBoard({ startDate, endDate });
    const board =
        boardResult.success && boardResult.data ? boardResult.data : null;

    if (
        !board ||
        board.state !== 'AVAILABLE' ||
        !board.period ||
        !board.permissions ||
        !board.health ||
        !board.drivers
    ) {
        return (
            <div className="min-w-0 space-y-6">
                <PageHeader
                    title="Papan Keuangan"
                    description="Health, attention, dan drivers Finance dari laporan canonical."
                />
                {board?.state === 'HIDDEN' ? (
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Modul Finance tidak aktif"
                        description="Dashboard disembunyikan dan reader nominal tidak dijalankan."
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Dashboard Finance tidak tersedia"
                        description="Data gagal dimuat. Angka kosong tidak dianggap nol."
                    />
                )}
            </div>
        );
    }

    const availableBoard = board as AvailableBoard;
    const { health, attention, periodSignals, drivers, period } =
        availableBoard;
    const links = availableBoard.permissions.links;
    const returnsResult = links.returns
        ? await getFinanceSalesReturnSummary()
        : null;
    const returnSummary =
        returnsResult?.success && returnsResult.data
            ? returnsResult.data
            : null;
    const returnReaderFailed = links.returns != null && !returnSummary;

    return (
        <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col space-y-6 [overflow-wrap:anywhere] md:space-y-8 [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-11 [&_[data-slot=card]]:min-w-0">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <PageHeader
                        title="Papan Keuangan"
                        description="Health, attention, dan drivers Finance dari laporan canonical."
                    />
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        <FinanceDateFilter />
                        <Badge variant="outline">Periode: {period.label}</Badge>
                        <Badge variant="secondary">
                            As-of: {period.asOfLabel}
                        </Badge>
                    </div>
                </div>
                <DashboardFreshness generatedAt={availableBoard.generatedAt} />
            </div>

            <nav
                aria-label="Aksi cepat finance"
                className="flex flex-wrap gap-2"
            >
                {links.receivedPayments && (
                    <Button asChild variant="outline">
                        <Link href={links.receivedPayments}>
                            <Wallet className="h-4 w-4" /> Terima bayar
                        </Link>
                    </Button>
                )}
                {links.sentPayments && (
                    <Button asChild variant="outline">
                        <Link href={links.sentPayments}>
                            <Banknote className="h-4 w-4" /> Bayar supplier
                        </Link>
                    </Button>
                )}
                {links.pettyCash && (
                    <Button asChild variant="outline">
                        <Link href={links.pettyCash}>
                            <Zap className="h-4 w-4" /> Petty cash
                        </Link>
                    </Button>
                )}
                {links.journals && (
                    <Button asChild variant="outline">
                        <Link href={links.journals}>
                            <FileText className="h-4 w-4" /> Jurnal baru
                        </Link>
                    </Button>
                )}
            </nav>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="finance-health-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Health
                    </p>
                    <h2
                        id="finance-health-heading"
                        className="text-lg font-semibold"
                    >
                        Kondisi keuangan utama
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Posisi kas adalah stock sampai tanggal as-of; laba rugi
                        adalah flow selama periode terpilih.
                    </p>
                </div>
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
                    <DashboardHealthCard
                        title="Posisi kas"
                        value={
                            health.cash.value == null
                                ? undefined
                                : formatRupiah(health.cash.value)
                        }
                        icon={Wallet}
                        state={health.cash.state}
                        definition={{
                            unit: 'IDR · stock',
                            period: `As-of ${period.asOfLabel}`,
                            description:
                                'Saldo debit bersih akun yang eksplisit ditandai sebagai kas/bank, POSTED sampai akhir hari bisnis WIB.',
                            source: 'Neraca Finance canonical',
                        }}
                        href={
                            health.cash.state === 'AVAILABLE'
                                ? (links.balanceSheet ?? undefined)
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Pendapatan"
                        value={
                            health.revenue.value == null
                                ? undefined
                                : formatRupiah(health.revenue.value)
                        }
                        icon={BarChart3}
                        state={health.revenue.state}
                        definition={{
                            unit: 'IDR · flow',
                            period: period.label,
                            description:
                                'Pendapatan POSTED non-closing menurut category COA pada periode terpilih.',
                            source: 'Laporan laba rugi Finance canonical',
                        }}
                        href={
                            health.revenue.state === 'AVAILABLE'
                                ? (links.incomeStatement ?? undefined)
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Laba kotor"
                        value={
                            health.grossProfit.value == null
                                ? undefined
                                : formatRupiah(health.grossProfit.value)
                        }
                        icon={TrendingUp}
                        state={health.grossProfit.state}
                        definition={{
                            unit: 'IDR · flow',
                            period: period.label,
                            description:
                                'Pendapatan dikurangi HPP dari satu hasil laporan laba rugi canonical.',
                            source: 'Laporan laba rugi Finance canonical',
                        }}
                        href={
                            health.grossProfit.state === 'AVAILABLE'
                                ? (links.incomeStatement ?? undefined)
                                : undefined
                        }
                    />
                    <DashboardHealthCard
                        title="Laba bersih"
                        value={
                            health.netProfit.value == null
                                ? undefined
                                : formatRupiah(health.netProfit.value)
                        }
                        icon={Banknote}
                        state={health.netProfit.state}
                        definition={{
                            unit: 'IDR · flow',
                            period: period.label,
                            description:
                                'Laba bersih POSTED non-closing setelah beban operasi dan pendapatan/beban lain.',
                            source: 'Laporan laba rugi Finance canonical',
                        }}
                        href={
                            health.netProfit.state === 'AVAILABLE'
                                ? (links.incomeStatement ?? undefined)
                                : undefined
                        }
                    />
                </div>
            </section>

            <section
                className="min-w-0 space-y-4"
                aria-labelledby="finance-attention-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Attention
                    </p>
                    <h2
                        id="finance-attention-heading"
                        className="text-lg font-semibold"
                    >
                        Antrean dan sinyal tutup buku
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Total berasal dari seluruh populasi eligible; daftar
                        adalah sampel maksimal lima teratas secara global dan
                        deterministik.
                    </p>
                </div>

                {periodSignals ? (
                    <Card className="border-l-4 border-l-emerald-500">
                        <CardContent className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                                <CalendarClock className="h-4 w-4" />
                                {periodSignals.currentPeriod ? (
                                    <>
                                        <span className="font-medium">
                                            Periode{' '}
                                            {periodSignals.currentPeriod.name}
                                        </span>
                                        <Badge>
                                            {periodSignals.currentPeriod.status}
                                        </Badge>
                                        <span className="text-muted-foreground">
                                            {periodSignals.daysToMonthEnd} hari
                                            menuju akhir periode
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Tidak ada periode berjalan.
                                    </span>
                                )}
                                <span className="text-muted-foreground">
                                    {periodSignals.openCount} periode OPEN ·{' '}
                                    {periodSignals.reconThisMonth} rekonsiliasi
                                    selesai bulan ini
                                </span>
                            </div>
                            {links.periods && (
                                <Button asChild variant="outline" size="sm">
                                    <Link href={links.periods}>
                                        Kelola periode
                                    </Link>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Sinyal periode tidak tersedia"
                        description="Kegagalan reader periode tidak meruntuhkan Health atau antrean Finance."
                    />
                )}

                {attention ? (
                    <AttentionSection
                        attention={attention}
                        links={links}
                        hasReturnWork={
                            returnReaderFailed ||
                            (returnSummary?.count ?? 0) > 0
                        }
                    />
                ) : (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Antrean Finance tidak tersedia"
                        description="Kegagalan reader tidak dianggap sebagai antrean kosong."
                    />
                )}

                {returnReaderFailed && (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Antrean retur penjualan tidak tersedia"
                        description="Kegagalan reader retur tidak dianggap sebagai antrean kosong."
                    />
                )}
                {links.returns && !returnReaderFailed && (
                    <FinanceReturnQueue summary={returnSummary} />
                )}
            </section>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="finance-drivers-heading"
            >
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Drivers
                    </p>
                    <h2
                        id="finance-drivers-heading"
                        className="text-lg font-semibold"
                    >
                        Actual bulanan canonical
                    </h2>
                </div>
                {drivers.state === 'UNAVAILABLE' ? (
                    <DashboardSectionState
                        state="UNAVAILABLE"
                        title="Driver Finance tidak tersedia"
                        description="Kegagalan reader tidak dianggap sebagai riwayat kosong."
                    />
                ) : drivers.state === 'NOT_CONFIGURED' ? (
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Riwayat belum cukup"
                        description="Driver membutuhkan minimal empat titik bulanan comparable."
                    />
                ) : (
                    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                        {[
                            {
                                title: 'Pendapatan bulanan',
                                points: drivers.revenue,
                            },
                            {
                                title: 'Laba bersih bulanan',
                                points: drivers.netIncome,
                            },
                        ].map((driver) => (
                            <Card
                                key={driver.title}
                                className="min-w-0 overflow-hidden"
                            >
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-sm">
                                        <TrendingUp className="h-4 w-4" />{' '}
                                        {driver.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ol className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
                                        {driver.points.map((point) => (
                                            <li
                                                key={point.month}
                                                className="min-w-0 rounded-md border bg-muted/20 p-3"
                                            >
                                                <p className="text-xs text-muted-foreground">
                                                    {point.month}
                                                </p>
                                                <p className="break-words text-sm font-semibold tabular-nums">
                                                    {formatRupiah(point.value)}
                                                </p>
                                            </li>
                                        ))}
                                    </ol>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        Actual bulanan POSTED non-closing dari
                                        laporan laba rugi canonical.
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

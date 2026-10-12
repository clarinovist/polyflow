import { getFinanceShiftBoard } from '@/actions/dashboard/finance-dashboard';
import { getFinanceSalesReturnSummary } from '@/actions/finance/sales-returns';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
} from '@/components/dashboard/DashboardMetricPrimitives';
import { FinanceCommandCenter } from '@/components/finance/dashboard/FinanceCommandCenter';
import { FinanceDateFilter } from '@/components/finance/finance-date-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { formatRupiah } from '@/lib/utils/utils';
import {
    Banknote,
    BarChart3,
    FileText,
    TrendingUp,
    Wallet,
    Zap,
} from 'lucide-react';
import Link from 'next/link';
import { parseISO } from 'date-fns';
import {
    getWibDayBounds,
    getWibMonthBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDashboardDateParam(
    value: string | undefined,
    edge: 'start' | 'end',
): Date | undefined {
    if (!value) return undefined;
    if (DATE_ONLY_PATTERN.test(value)) {
        try {
            const bounds = getWibDayBounds(value);
            return edge === 'start' ? bounds.startOfDay : bounds.endOfDay;
        } catch {
            return undefined;
        }
    }
    const parsed = parseISO(value);
    return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function defaultFinanceMonthRange(now: Date): {
    startDate: Date;
    endDate: Date;
} {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const bounds = getWibMonthBounds(year, month);
    return { startDate: bounds.start, endDate: bounds.end };
}

function isLegacyMonthPickerRange(
    startValue: string | undefined,
    endValue: string | undefined,
): boolean {
    if (!startValue || !endValue) return false;
    // The affected legacy URLs were produced in a UTC browser and therefore
    // have the exact UTC start/end-of-month shape below. Keep the compatibility
    // clamp deliberately narrow: date-only values, offset calendar ranges, and
    // arbitrary instants must never be changed.
    return (
        /^\d{4}-\d{2}-01T00:00:00\.000Z$/.test(startValue) &&
        /^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/.test(endValue)
    );
}

function clampLegacyMonthEnd(
    startDate: Date,
    endDate: Date,
    isLegacyRange: boolean,
): Date {
    if (!isLegacyRange) return endDate;
    const [startYear, startMonth, startDay] = toBusinessDateString(startDate)
        .split('-')
        .map(Number);
    const [endYear, endMonth, endDay] = toBusinessDateString(endDate)
        .split('-')
        .map(Number);
    const nextYear = startMonth === 12 ? startYear + 1 : startYear;
    const nextMonth = startMonth === 12 ? 1 : startMonth + 1;

    // Older MonthPicker URLs stored browser-local endOfMonth() as an ISO
    // instant. From a UTC browser, 31 Oct 23:59:59.999Z is 1 Nov in WIB.
    // Clamp only that exact full-month rollover shape; arbitrary ranges remain
    // untouched.
    if (
        startDay === 1 &&
        endDay === 1 &&
        endYear === nextYear &&
        endMonth === nextMonth
    ) {
        return getWibMonthBounds(startYear, startMonth).end;
    }
    return endDate;
}

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
export default async function FinanceDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
    const params = await searchParams;
    const now = new Date();
    const fallback = defaultFinanceMonthRange(now);
    const parsedStartDate = parseDashboardDateParam(params.startDate, 'start');
    const parsedEndDate = parseDashboardDateParam(params.endDate, 'end');
    const hasCompleteValidRange =
        parsedStartDate != null &&
        parsedEndDate != null &&
        parsedStartDate.getTime() <= parsedEndDate.getTime();
    const startDate = hasCompleteValidRange
        ? parsedStartDate
        : fallback.startDate;
    const endDate = hasCompleteValidRange
        ? clampLegacyMonthEnd(
              parsedStartDate,
              parsedEndDate,
              isLegacyMonthPickerRange(params.startDate, params.endDate),
          )
        : fallback.endDate;
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
                    description="Ringkasan kondisi, perhatian, dan arah utama keuangan."
                />
                {board?.state === 'HIDDEN' ? (
                    <DashboardSectionState
                        state="NOT_CONFIGURED"
                        title="Modul Finance tidak aktif"
                        description="Dashboard tidak ditampilkan dan data nominal tidak dimuat."
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
            <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Command center
                    </p>
                    <div className="mt-2">
                        <PageHeader
                            title="Papan Keuangan"
                            description="Likuiditas, jatuh tempo, dan kesiapan periode dalam satu tampilan keputusan."
                        />
                    </div>
                    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
                        <FinanceDateFilter />
                        <Badge variant="outline" className="rounded-full px-3">
                            Periode: {period.label}
                        </Badge>
                        <Badge
                            variant="secondary"
                            className="rounded-full px-3"
                        >
                            As-of: {period.asOfLabel}
                        </Badge>
                        <DashboardFreshness
                            generatedAt={availableBoard.generatedAt}
                        />
                    </div>
                </div>

                <nav
                    aria-label="Aksi cepat finance"
                    className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
                >
                    {links.receivedPayments && (
                        <Button
                            asChild
                            size="lg"
                            variant="outline"
                            className="min-h-11 gap-2"
                        >
                            <Link href={links.receivedPayments}>
                                <Wallet className="h-4 w-4" /> Terima bayar
                            </Link>
                        </Button>
                    )}
                    {links.sentPayments && (
                        <Button
                            asChild
                            size="lg"
                            variant="outline"
                            className="min-h-11 gap-2"
                        >
                            <Link href={links.sentPayments}>
                                <Banknote className="h-4 w-4" /> Bayar supplier
                            </Link>
                        </Button>
                    )}
                    {links.pettyCash && (
                        <Button
                            asChild
                            size="lg"
                            variant="ghost"
                            className="min-h-11 gap-2"
                        >
                            <Link href={links.pettyCash}>
                                <Zap className="h-4 w-4" /> Petty cash
                            </Link>
                        </Button>
                    )}
                    {links.journals && (
                        <Button
                            asChild
                            size="lg"
                            className="min-h-11 gap-2 shadow-sm"
                        >
                            <Link href={links.journals}>
                                <FileText className="h-4 w-4" /> Jurnal baru
                            </Link>
                        </Button>
                    )}
                </nav>
            </div>

            <section
                className="min-w-0 space-y-3"
                aria-labelledby="finance-health-heading"
            >
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Kondisi
                    </p>
                    <h2
                        id="finance-health-heading"
                        className="text-lg font-semibold"
                    >
                        Ringkasan kesehatan
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Posisi kas berlaku sampai tanggal acuan; laba rugi
                        mencakup transaksi selama periode terpilih.
                    </p>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                            unit: 'Rupiah',
                            period: `Sampai ${period.asOfLabel}`,
                            description:
                                'Saldo debit bersih akun kas dan bank dari transaksi yang sudah dibukukan sampai akhir hari bisnis WIB.',
                            source: 'Neraca keuangan',
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
                            unit: 'Rupiah',
                            period: period.label,
                            description:
                                'Pendapatan dari transaksi yang sudah dibukukan, selain jurnal penutupan, menurut kelompok akun pada periode terpilih.',
                            source: 'Laporan laba rugi',
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
                            unit: 'Rupiah',
                            period: period.label,
                            description:
                                'Pendapatan dikurangi harga pokok penjualan dari laporan laba rugi yang sama.',
                            source: 'Laporan laba rugi',
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
                            unit: 'Rupiah',
                            period: period.label,
                            description:
                                'Laba bersih dari transaksi yang sudah dibukukan, selain jurnal penutupan, setelah beban operasi serta pendapatan dan beban lain.',
                            source: 'Laporan laba rugi',
                        }}
                        href={
                            health.netProfit.state === 'AVAILABLE'
                                ? (links.incomeStatement ?? undefined)
                                : undefined
                        }
                    />
                </div>
            </section>

            <FinanceCommandCenter
                attention={attention}
                links={links}
                periodSignals={periodSignals}
                drivers={drivers}
                returnSummary={returnSummary}
                returnReaderFailed={returnReaderFailed}
            />
        </div>
    );
}

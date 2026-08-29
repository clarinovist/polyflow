import { withTenantPage } from '@/lib/core/tenant';
import { formatWibDate, toBusinessDateString } from '@/lib/utils/timezone';
import {
    ProductionDailyReportService,
    type MachineTotals,
} from '@/services/production/production-daily-report-service';
import { PROCESS_KEYS } from '@/lib/production/process-keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle,
    Boxes,
    Cog,
    Layers,
    Package,
} from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from './DateRangeFilter';
import {
    MachineRecapFilter,
    MACHINE_RECAP_ALL,
} from './MachineRecapFilter';
import {
    affalPercent,
    dayName,
    fmt,
    machineDisplayName,
    machineTypeLabel,
    monthLabelId,
    PROCESS_LABEL,
    recentMonthOptions,
    sanitizeBusinessDateParam,
    worstAffalShare,
} from './shared';

export const dynamic = 'force-dynamic';

const getReport = withTenantPage(
    async (from: string | null, to: string | null) =>
        ProductionDailyReportService.getDailyReport({ from, to }),
);

const getRecap = withTenantPage(async (month: string | null) =>
    ProductionDailyReportService.getMachineRecap({ month }),
);

interface PageProps {
    searchParams: Promise<{
        from?: string;
        to?: string;
        mesin?: string;
    }>;
}

const YYYY_MM = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Resolve period params: sanitize from/to, default to a 30-day window ending
 * today when both are absent. Service still supports partial bounds (one side
 * null), so a hand-edited URL with only `from` or only `to` works correctly.
 */
function resolvePeriodParams(params: {
    from?: string;
    to?: string;
    now: Date;
}): { from: string; to: string } {
    const from = sanitizeBusinessDateParam(params.from);
    const to = sanitizeBusinessDateParam(params.to);
    const today = toBusinessDateString(params.now);
    const defaultFrom = toBusinessDateString(
        new Date(params.now.getTime() - 29 * 24 * 60 * 60 * 1000),
    );
    return {
        from: from ?? defaultFrom,
        to: to ?? today,
    };
}

/** Absent/invalid mesin = current month (default); 'all' = all time. */
function resolveRecapMonth(
    mesin: string | undefined,
    now: Date,
): string | null {
    if (mesin === MACHINE_RECAP_ALL) return null;
    if (mesin && YYYY_MM.test(mesin)) return mesin;
    return toBusinessDateString(now).slice(0, 7);
}

export default async function ProductionDailyReportPage({
    searchParams,
}: PageProps) {
    const params = await searchParams;
    const now = new Date();
    const todayStr = toBusinessDateString(now);
    const yesterdayStr = toBusinessDateString(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );

    const { from, to } = resolvePeriodParams({ ...params, now });
    const recapMonth = resolveRecapMonth(params.mesin, now);

    const [report, recap] = await Promise.all([
        getReport(from, to),
        getRecap(recapMonth),
    ]);
    const { rows, periodTotals } = report;
    const { machineTotals, month: recapApplied } = recap;

    const kpis = [
        {
            key: 'MIXING' as const,
            label: 'Mixing',
            icon: Layers,
            accent: 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
        },
        {
            key: 'EXTRUSION' as const,
            label: 'Extrusi',
            icon: Cog,
            accent: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
        },
        {
            key: 'PACKING' as const,
            label: 'Packing',
            icon: Package,
            accent: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
        },
        {
            key: 'OTHER' as const,
            label: 'Lainnya',
            icon: Boxes,
            accent: 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400',
        },
    ];

    const totalScrap = rows.reduce((s, r) => s + r.totalScrap, 0);
    const totalEntries = rows.reduce((s, r) => s + r.totalEntries, 0);

    const rowBadge = (row: { date: string }) => {
        if (row.date === todayStr)
            return (
                <Badge className="ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Hari Ini
                </Badge>
            );
        if (row.date === yesterdayStr)
            return (
                <Badge
                    variant="outline"
                    className="ml-2 border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                    Kemarin
                </Badge>
            );
        return null;
    };

    const periodLabel = `${formatWibDate(from)} – ${formatWibDate(to)}`;

    const carryParams = {
        from,
        to,
    };
    const monthOptions = recentMonthOptions(12, now);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Produksi Harian
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Hasil produksi (actual) per hari WIB, dipisah per
                        proses. Periode {periodLabel}.
                    </p>
                </div>
                <DateRangeFilter
                    from={from}
                    to={to}
                    mesin={params.mesin}
                />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpis.map((kpi) => {
                    const totals = periodTotals[kpi.key];
                    const Icon = kpi.icon;
                    return (
                        <Card
                            key={kpi.key}
                            className="border-zinc-200 dark:border-zinc-800 shadow-sm"
                        >
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
                                            {kpi.label}
                                        </p>
                                        <h3 className="text-2xl font-bold text-foreground mt-1 tabular-nums">
                                            {fmt(totals.produced)}
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            {totals.entries} entri
                                        </p>
                                    </div>
                                    <div
                                        className={`p-3 rounded-xl ${kpi.accent}`}
                                    >
                                        <Icon className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
                                    Scrap
                                </p>
                                <h3 className="text-2xl font-bold text-destructive mt-1 tabular-nums">
                                    {fmt(totalScrap)}
                                </h3>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    {totalEntries} entri total
                                </p>
                            </div>
                            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold">
                        Rincian per Hari
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                                <TableRow>
                                    <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                                        Tanggal
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Mixing
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Extrusi
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Packing
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Lainnya
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Scrap
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Entri
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-center py-12 text-muted-foreground italic"
                                        >
                                            Tidak ada hasil produksi pada
                                            periode ini.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <TableRow
                                            key={row.date}
                                            className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/30"
                                        >
                                            <TableCell className="font-medium text-sm text-foreground whitespace-nowrap">
                                                <Link
                                                    href={`/production/daily-report/${row.date}`}
                                                    className="hover:underline decoration-dotted underline-offset-4"
                                                >
                                                    {formatWibDate(row.date)}
                                                </Link>
                                                <span className="ml-2 text-xs text-muted-foreground font-normal">
                                                    {dayName(row.date)}
                                                </span>
                                                {rowBadge(row)}
                                            </TableCell>
                                            {(
                                                [
                                                    'MIXING',
                                                    'EXTRUSION',
                                                    'PACKING',
                                                    'OTHER',
                                                ] as const
                                            ).map((key) => (
                                                <TableCell
                                                    key={key}
                                                    className="text-right text-sm text-foreground tabular-nums"
                                                >
                                                    {fmt(
                                                        row.byProcess[key]
                                                            .produced,
                                                    )}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right text-sm text-destructive tabular-nums">
                                                {row.totalScrap > 0
                                                    ? fmt(row.totalScrap)
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                {row.totalEntries}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        Angka = hasil bersih (quantity produced, tanpa scrap)
                        per proses, satuan mengikuti output masing-masing BOM
                        (kg / karung / pcs) — tidak dijumlah antar-kolom.
                        Klik tanggal untuk melihat pecahan per mesin hari itu.
                        Sumber data sama dengan papan &quot;Hari Ini&quot;:
                        entri hasil produksi yang tidak dibatalkan, hari WIB.
                    </p>
                </CardContent>
            </Card>

            {PROCESS_KEYS.some((key) => machineTotals[key].length > 0) && (
                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-lg font-bold">
                            Rekap per Mesin —{' '}
                            {recapApplied === null
                                ? 'Semua waktu'
                                : monthLabelId(recapApplied)}
                        </CardTitle>
                        <MachineRecapFilter
                            value={recapApplied ?? MACHINE_RECAP_ALL}
                            monthOptions={monthOptions}
                            carryParams={carryParams}
                        />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {PROCESS_KEYS.map((key) => {
                            const machines = machineTotals[key];
                            if (machines.length === 0) return null;
                            return (
                                <div key={key}>
                                    <h3 className="text-sm font-semibold text-foreground mb-2">
                                        {PROCESS_LABEL[key]}
                                    </h3>
                                    <MachineTable
                                        machines={machines}
                                        highlightWorstAffalShare={
                                            key === 'EXTRUSION'
                                        }
                                    />
                                </div>
                            );
                        })}
                        <p className="text-xs text-muted-foreground">
                            Hasil &amp; affal per mesin untuk{' '}
                            {recapApplied === null
                                ? 'seluruh periode data'
                                : `bulan ${monthLabelId(recapApplied)}`}
                            . Satuan mengikuti output BOM tiap proses — jangan
                            dijumlah antar proses. % Affal = affal ÷ (hasil +
                            affal), aman dibandingkan antar mesin karena
                            satuannya sama. Baris tanpa nama mesin (mis. entri
                            kiosk) dikelompokkan per tipe mesin.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function MachineTable({
    machines,
    highlightWorstAffalShare = false,
}: {
    machines: MachineTotals[];
    /** Badge the highest affal share among named machines (≥ 2 to compare). */
    highlightWorstAffalShare?: boolean;
}) {
    const worstShare = highlightWorstAffalShare
        ? worstAffalShare(machines)
        : null;

    return (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                    <TableRow>
                        <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                            Mesin
                        </TableHead>
                        <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                            Hasil
                        </TableHead>
                        <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                            Affal
                        </TableHead>
                        <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                            % Affal
                        </TableHead>
                        <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                            Entri
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {machines.map((m, i) => {
                        const pct = affalPercent(m.produced, m.scrap);
                        const isWorst =
                            worstShare !== null &&
                            pct !== null &&
                            pct === worstShare;
                        return (
                            <TableRow
                                key={`${m.machineName ?? 'none'}-${i}`}
                                className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/30"
                            >
                                <TableCell className="text-sm text-foreground">
                                    {machineDisplayName(m)}
                                    {machineTypeLabel(m) && (
                                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                                            {machineTypeLabel(m)}
                                        </span>
                                    )}
                                    {isWorst && (
                                        <Badge
                                            variant="outline"
                                            className="ml-2 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                                        >
                                            affal tertinggi
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right text-sm text-foreground tabular-nums">
                                    {fmt(m.produced)}
                                </TableCell>
                                <TableCell className="text-right text-sm text-destructive tabular-nums">
                                    {m.scrap > 0 ? fmt(m.scrap) : '-'}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">
                                    {pct === null ? (
                                        <span className="text-muted-foreground">
                                            -
                                        </span>
                                    ) : (
                                        <span
                                            className={
                                                pct >= 20
                                                    ? 'text-destructive font-medium'
                                                    : 'text-foreground'
                                            }
                                        >
                                            {pct.toLocaleString('id-ID', {
                                                maximumFractionDigits: 1,
                                            })}
                                            %
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                    {m.entries}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
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
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import {
    affalPercent,
    dayName,
    fmt,
    machineDisplayName,
    machineTypeLabel,
    PROCESS_LABEL,
} from '../shared';

export const dynamic = 'force-dynamic';

const getDetail = withTenantPage(async (date: string) =>
    ProductionDailyReportService.getDailyDetail({ date }),
);

interface PageProps {
    params: Promise<{ date: string }>;
}

export default async function ProductionDailyDetailPage({ params }: PageProps) {
    const { date } = await params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        notFound();
    }

    const detail = await getDetail(date);

    const now = new Date();
    const todayStr = toBusinessDateString(now);
    const yesterdayStr = toBusinessDateString(
        new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );

    const activeProcesses = PROCESS_KEYS.filter(
        (key) => detail.byProcess[key].totals.entries > 0,
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <Link
                        href="/production/daily-report"
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Produksi Harian
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground mt-1">
                        Detail Produksi — {formatWibDate(detail.date)}
                        {detail.date === todayStr && (
                            <Badge className="ml-2 align-middle bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                                Hari Ini
                            </Badge>
                        )}
                        {detail.date === yesterdayStr && (
                            <Badge
                                variant="outline"
                                className="ml-2 align-middle border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                            >
                                Kemarin
                            </Badge>
                        )}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Pecahan hasil &amp; affal per mesin, {dayName(detail.date)}{' '}
                        (hari WIB).
                    </p>
                </div>
            </div>

            {activeProcesses.length === 0 ? (
                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="py-12 text-center text-muted-foreground italic">
                        Tidak ada hasil produksi pada tanggal ini.
                    </CardContent>
                </Card>
            ) : (
                activeProcesses.map((key) => {
                    const { totals, machines } = detail.byProcess[key];
                    const totalPct = affalPercent(totals.produced, totals.scrap);
                    return (
                        <Card
                            key={key}
                            className="border-zinc-200 dark:border-zinc-800 shadow-sm"
                        >
                            <CardHeader>
                                <CardTitle className="text-lg font-bold">
                                    {PROCESS_LABEL[key]}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
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
                                            {machines.map((m, i) => (
                                                <MachineRow
                                                    key={`${m.machineName ?? 'none'}-${i}`}
                                                    machine={m}
                                                />
                                            ))}
                                        </TableBody>
                                        <TableFooter>
                                            <TableRow className="bg-zinc-50/80 dark:bg-zinc-900/70">
                                                <TableCell className="font-semibold text-sm text-foreground">
                                                    Total
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm text-foreground tabular-nums">
                                                    {fmt(totals.produced)}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm text-destructive tabular-nums">
                                                    {totals.scrap > 0
                                                        ? fmt(totals.scrap)
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm tabular-nums">
                                                    {totalPct === null ? (
                                                        <span className="text-muted-foreground">
                                                            -
                                                        </span>
                                                    ) : (
                                                        <span className="text-foreground">
                                                            {totalPct.toLocaleString(
                                                                'id-ID',
                                                                {
                                                                    maximumFractionDigits: 1,
                                                                },
                                                            )}
                                                            %
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm text-muted-foreground tabular-nums">
                                                    {totals.entries}
                                                </TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}

            {activeProcesses.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    Angka = hasil bersih (quantity produced, tanpa scrap),
                    satuan mengikuti output BOM tiap proses — jangan dijumlah
                    antar proses. % Affal = affal ÷ (hasil + affal), aman
                    dibandingkan antar mesin karena satuannya sama. Sumber data
                    sama dengan baris tanggal ini di laporan harian: entri yang
                    tidak dibatalkan, hari WIB. Baris tanpa nama mesin (mis.
                    entri kiosk) dikelompokkan per tipe mesin.
                </p>
            )}
        </div>
    );
}

function MachineRow({ machine: m }: { machine: MachineTotals }) {
    const pct = affalPercent(m.produced, m.scrap);
    return (
        <TableRow className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/30">
            <TableCell className="text-sm text-foreground">
                {machineDisplayName(m)}
                {machineTypeLabel(m) && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                        {machineTypeLabel(m)}
                    </span>
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
                    <span className="text-muted-foreground">-</span>
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
}

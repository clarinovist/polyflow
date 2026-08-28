import type { ReactNode } from 'react';
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
import { formatRupiah } from '@/lib/utils/utils';
import { formatWibDate } from '@/lib/utils/timezone';
import type { RecapResult } from '@/services/finance/rekap-dagang-service';

interface RecapReportViewProps {
    title: string;
    description: string;
    partnerLabel: string;
    inLabel: string;
    outLabel: string;
    result: RecapResult;
    filter?: ReactNode;
}

export function RecapReportView({
    title,
    description,
    partnerLabel,
    inLabel,
    outLabel,
    result,
    filter,
}: RecapReportViewProps) {
    const { rows, totals, period } = result;

    const kpis = [
        { label: 'Saldo Awal', value: totals.openingBalance },
        { label: inLabel, value: totals.totalIn },
        { label: outLabel, value: totals.totalOut },
        { label: 'Saldo Akhir', value: totals.closingBalance },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {title}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {description} Periode {formatWibDate(period.from)} –{' '}
                        {formatWibDate(period.to)}.
                    </p>
                </div>
                {filter}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi) => (
                    <Card
                        key={kpi.label}
                        className="border-zinc-200 dark:border-zinc-800 shadow-sm"
                    >
                        <CardContent className="pt-6">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
                                {kpi.label}
                            </p>
                            <h3
                                className={`text-xl font-bold mt-1 tabular-nums ${
                                    kpi.value < 0
                                        ? 'text-destructive'
                                        : 'text-foreground'
                                }`}
                            >
                                {formatRupiah(kpi.value)}
                            </h3>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold">
                        Rincian per {partnerLabel}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                                <TableRow>
                                    <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">
                                        {partnerLabel}
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Saldo Awal
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        {inLabel}
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        {outLabel}
                                    </TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">
                                        Saldo Akhir
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="text-center py-12 text-muted-foreground italic"
                                        >
                                            Tidak ada mutasi pada periode ini.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/30"
                                        >
                                            <TableCell className="font-medium text-sm text-foreground whitespace-nowrap">
                                                {row.name}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-foreground tabular-nums">
                                                {formatRupiah(
                                                    row.openingBalance,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-foreground tabular-nums">
                                                {formatRupiah(row.totalIn)}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-foreground tabular-nums">
                                                {formatRupiah(row.totalOut)}
                                            </TableCell>
                                            <TableCell
                                                className={`text-right text-sm font-semibold tabular-nums ${
                                                    row.closingBalance < 0
                                                        ? 'text-destructive'
                                                        : 'text-foreground'
                                                }`}
                                            >
                                                {formatRupiah(
                                                    row.closingBalance,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            {rows.length > 0 && (
                                <TableFooter>
                                    <TableRow className="bg-zinc-50 dark:bg-zinc-900/50 font-semibold">
                                        <TableCell className="text-sm text-foreground">
                                            Total
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums text-foreground">
                                            {formatRupiah(
                                                totals.openingBalance,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums text-foreground">
                                            {formatRupiah(totals.totalIn)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums text-foreground">
                                            {formatRupiah(totals.totalOut)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums text-foreground">
                                            {formatRupiah(
                                                totals.closingBalance,
                                            )}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

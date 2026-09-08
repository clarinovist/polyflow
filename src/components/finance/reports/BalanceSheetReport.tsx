'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Rupiah } from '@/components/finance/Rupiah';
import {
    buildAccountRows,
    filterBalanceSheetAccounts,
    type BalanceSheetAccount,
    type BalanceSheetRow,
} from './balance-sheet-view';
import { buildGeneralLedgerHref } from './general-ledger-query';

export interface BalanceSheetReportData {
    assets: BalanceSheetAccount[];
    liabilities: BalanceSheetAccount[];
    equity: BalanceSheetAccount[];
    totalAssets: number;
    totalLiabilities: number;
    unpostedEarnings: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
}

interface BalanceSheetReportProps {
    data: BalanceSheetReportData;
    asOfDate: string;
}

const hasBalance = (amount: number) => Math.abs(amount) > 0.01;

export function BalanceSheetReport({ data, asOfDate }: BalanceSheetReportProps) {
    const [summaryView, setSummaryView] = useState(false);
    const [hideZero, setHideZero] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

    const toggleGroup = (accountId: string) => {
        setExpandedIds((current) => {
            const next = new Set(current);
            if (next.has(accountId)) next.delete(accountId);
            else next.add(accountId);
            return next;
        });
    };

    const rowsFor = (accounts: BalanceSheetAccount[]): BalanceSheetRow[] => {
        if (searchTerm.trim()) {
            return filterBalanceSheetAccounts(accounts, searchTerm)
                .filter((account) => !hideZero || hasBalance(account.netBalance))
                .map((account) => ({
                    kind: 'account' as const,
                    account,
                    amount: account.netBalance,
                    depth: 0,
                    expandable: false,
                }));
        }
        if (summaryView) {
            return buildAccountRows(accounts, expandedIds, hideZero);
        }
        return accounts
            .filter((account) => !hideZero || hasBalance(account.netBalance))
            .map((account) => ({
                kind: 'account' as const,
                account,
                amount: account.netBalance,
                depth: 0,
                expandable: false,
            }));
    };

    const renderAccountRow = (row: BalanceSheetRow) => {
        const isExpanded = expandedIds.has(row.account.id);

        return (
            <TableRow key={`${row.kind}-${row.account.id}-${row.depth}`}>
                <TableCell style={{ paddingLeft: `${1 + row.depth * 1.25}rem` }}>
                    {row.kind === 'group' ? (
                        <button
                            type="button"
                            className="flex items-center gap-2 font-semibold text-left hover:underline"
                            aria-label={`${isExpanded ? 'Tutup' : 'Buka'} rincian ${row.account.name}`}
                            aria-expanded={isExpanded}
                            onClick={() => toggleGroup(row.account.id)}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                                <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            {row.account.name}
                        </button>
                    ) : (
                        <Link
                            href={buildGeneralLedgerHref(row.account.id, asOfDate)}
                            className="text-blue-700 hover:underline dark:text-blue-400"
                            aria-label={`${row.account.code} ${row.account.name} - buka Buku Besar`}
                        >
                            {row.account.name}
                            {row.directBalance ? ' (saldo langsung)' : ''}
                        </Link>
                    )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.account.code}
                </TableCell>
                <TableCell className="text-right w-44">
                    {row.amount === null ? (
                        <span className="text-muted-foreground">—</span>
                    ) : (
                        <Rupiah value={row.amount} bold={row.kind === 'group'} />
                    )}
                </TableCell>
            </TableRow>
        );
    };

    const renderSection = (
        title: string,
        accounts: BalanceSheetAccount[],
        totalLabel: string,
        total: number,
    ) => (
        <>
            <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={3}>{title}</TableCell>
            </TableRow>
            {rowsFor(accounts).map(renderAccountRow)}
            <TableRow className="font-bold border-t-2 bg-muted/30">
                <TableCell colSpan={2}>{totalLabel}</TableCell>
                <TableCell className="text-right w-44">
                    <Rupiah value={total} bold />
                </TableCell>
            </TableRow>
        </>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari nama atau kode akun..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full pl-9 sm:w-[320px]"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="summary-view"
                            checked={summaryView}
                            onCheckedChange={setSummaryView}
                        />
                        <Label htmlFor="summary-view" className="cursor-pointer font-medium">
                            Ringkas
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="hide-zero"
                            checked={hideZero}
                            onCheckedChange={setHideZero}
                        />
                        <Label htmlFor="hide-zero" className="cursor-pointer font-medium">
                            Sembunyikan Saldo Nol
                        </Label>
                    </div>
                </div>
            </div>

            <p className="text-sm text-muted-foreground">
                Bandingkan saldo akhir rekap pada tanggal yang sama di Buku Besar.
                Nilai akun utang dagang bukan total seluruh kewajiban.
            </p>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {summaryView ? 'Neraca (Ringkas)' : 'Neraca (Detail)'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Akun</TableHead>
                                    <TableHead>Kode</TableHead>
                                    <TableHead className="text-right">Jumlah</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {renderSection(
                                    'ASET',
                                    data.assets,
                                    'TOTAL ASET',
                                    data.totalAssets,
                                )}
                                {renderSection(
                                    'KEWAJIBAN',
                                    data.liabilities,
                                    'TOTAL KEWAJIBAN',
                                    data.totalLiabilities,
                                )}
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell colSpan={3}>EKUITAS</TableCell>
                                </TableRow>
                                {rowsFor(data.equity).map(renderAccountRow)}
                                {hasBalance(data.unpostedEarnings) && (
                                    <TableRow>
                                        <TableCell className="pl-8 italic text-muted-foreground">
                                            Laba Periode Berjalan (Belum Diclose)
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            —
                                        </TableCell>
                                        <TableCell className="text-right w-44">
                                            <Rupiah
                                                value={data.unpostedEarnings}
                                                className="text-muted-foreground"
                                            />
                                        </TableCell>
                                    </TableRow>
                                )}
                                <TableRow className="font-bold border-t-2 bg-muted/30">
                                    <TableCell colSpan={2}>TOTAL EKUITAS</TableCell>
                                    <TableCell className="text-right w-44">
                                        <Rupiah
                                            value={
                                                data.totalEquity + data.unpostedEarnings
                                            }
                                            bold
                                        />
                                    </TableCell>
                                </TableRow>
                                <TableRow className="bg-primary/10 font-bold text-lg border-t-4 border-primary">
                                    <TableCell colSpan={2}>
                                        TOTAL KEWAJIBAN &amp; EKUITAS
                                    </TableCell>
                                    <TableCell className="text-right w-44">
                                        <Rupiah
                                            value={data.totalLiabilitiesAndEquity}
                                            bold
                                        />
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

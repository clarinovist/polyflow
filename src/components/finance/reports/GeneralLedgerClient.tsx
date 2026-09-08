'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getGeneralLedger,
    getGeneralLedgerSummary,
    getGeneralLedgerAccountEntries,
} from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { RotateCw, Download, Search, ChevronRight, ChevronDown } from 'lucide-react';
import {
    downloadCsv,
    rupiahForCsv,
    reportFilename,
} from '@/lib/utils/csv-export';
import { reportLabels } from '@/lib/labels';
import {
    businessDateToEntryDate,
    parseBusinessDate,
} from '@/lib/utils/timezone';

interface LedgerEntry {
    date: string;
    entryNumber: string;
    description: string;
    reference: string | null;
    referenceType: string | null;
    debit: number;
    credit: number;
    balance: number;
}

interface LedgerAccount {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string;
    entries: LedgerEntry[];
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

interface GeneralLedgerData {
    accounts: LedgerAccount[];
    grandTotalDebit: number;
    grandTotalCredit: number;
}

interface SummaryAccount {
    id: string;
    code: string;
    name: string;
    type: string;
    category: string;
    entryCount: number;
    beginningBalance: number;
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

interface SummaryData {
    accounts: SummaryAccount[];
    grandTotalDebit: number;
    grandTotalCredit: number;
}

interface AccountDetail {
    accountId: string;
    beginningBalance: number;
    entries: LedgerEntry[];
    totalDebit: number;
    totalCredit: number;
    endingBalance: number;
}

/** Default view is the current month — a deliberate wide range stays opt-in. */
function currentMonthRange(): DateRange {
    const now = new Date();
    return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
    };
}

function initialDateRange(toDate?: string): DateRange {
    if (!toDate) return currentMonthRange();
    try {
        const validTo = parseBusinessDate(toDate);
        return {
            from: undefined,
            to: businessDateToEntryDate(validTo),
        };
    } catch {
        return currentMonthRange();
    }
}

interface GeneralLedgerClientProps {
    initialAccountId?: string;
    initialToDate?: string;
}

export function GeneralLedgerClient({
    initialAccountId,
    initialToDate,
}: GeneralLedgerClientProps = {}) {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
        initialDateRange(initialToDate),
    );
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [details, setDetails] = useState<Record<string, AccountDetail>>({});
    const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
    const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const requestGenerationRef = useRef(0);

    const loadAccountDetail = useCallback(
        async (accountId: string, generation: number) => {
            if (generation !== requestGenerationRef.current) return;

            setDetailLoadingId(accountId);
            setDetailErrors((current) => {
                if (!current[accountId]) return current;
                const next = { ...current };
                delete next[accountId];
                return next;
            });

            try {
                const result = await getGeneralLedgerAccountEntries(
                    accountId,
                    dateRange?.from,
                    dateRange?.to,
                );
                if (generation !== requestGenerationRef.current) return;

                if (result && 'success' in result && result.success) {
                    setDetails((current) => ({
                        ...current,
                        [accountId]: result.data as unknown as AccountDetail,
                    }));
                } else {
                    console.error(
                        'Failed to load account entries:',
                        result && 'error' in result
                            ? result.error
                            : 'Unknown error',
                    );
                    setDetailErrors((current) => ({
                        ...current,
                        [accountId]: 'Gagal memuat transaksi akun.',
                    }));
                }
            } catch (error) {
                if (generation !== requestGenerationRef.current) return;
                console.error('Failed to load account entries', error);
                setDetailErrors((current) => ({
                    ...current,
                    [accountId]: 'Gagal memuat transaksi akun.',
                }));
            } finally {
                if (generation === requestGenerationRef.current) {
                    setDetailLoadingId((current) =>
                        current === accountId ? null : current,
                    );
                }
            }
        },
        [dateRange],
    );

    const fetchSummary = useCallback(async () => {
        const generation = ++requestGenerationRef.current;
        setLoading(true);
        setDetails({});
        setDetailErrors({});
        setDetailLoadingId(null);
        setExpandedId(null);

        try {
            const result = await getGeneralLedgerSummary(
                dateRange?.from,
                dateRange?.to,
            );
            if (generation !== requestGenerationRef.current) return;

            if (result && 'success' in result && result.success) {
                const nextSummary = result.data as unknown as SummaryData;
                setSummary(nextSummary);

                const selectedAccount = initialAccountId
                    ? nextSummary.accounts.find(
                          (account) => account.id === initialAccountId,
                      )
                    : undefined;
                if (selectedAccount) {
                    setSearchTerm(selectedAccount.code);
                    setExpandedId(selectedAccount.id);
                    await loadAccountDetail(selectedAccount.id, generation);
                }
            } else {
                console.error(
                    'Failed to load general ledger summary:',
                    result && 'error' in result
                        ? result.error
                        : 'Unknown error',
                );
                setSummary(null);
            }
        } catch (error) {
            if (generation !== requestGenerationRef.current) return;
            console.error('Failed to load general ledger summary', error);
            setSummary(null);
        } finally {
            if (generation === requestGenerationRef.current) {
                setLoading(false);
            }
        }
    }, [dateRange, initialAccountId, loadAccountDetail]);

    useEffect(() => {
        void fetchSummary();
    }, [fetchSummary]);

    const handleDateRangeChange = useCallback(
        (nextRange: DateRange | undefined) => {
            requestGenerationRef.current += 1;
            setLoading(true);
            setDetails({});
            setDetailErrors({});
            setDetailLoadingId(null);
            setExpandedId(null);
            setDateRange(nextRange);
        },
        [],
    );

    const toggleAccount = useCallback(
        async (accountId: string) => {
            if (expandedId === accountId) {
                setExpandedId(null);
                return;
            }

            setExpandedId(accountId);
            if (details[accountId]) return;

            await loadAccountDetail(accountId, requestGenerationRef.current);
        },
        [expandedId, details, loadAccountDetail],
    );

    const retryAccount = useCallback(
        async (accountId: string) => {
            setExpandedId(accountId);
            await loadAccountDetail(accountId, requestGenerationRef.current);
        },
        [loadAccountDetail],
    );

    /**
     * CSV keeps the full ledger. It fetches the complete dataset on demand —
     * an explicit user action whose output lands in a file, not the DOM — so
     * the export stays identical to before the drill-down change.
     */
    const handleDownload = async () => {
        setExporting(true);
        try {
            const result = await getGeneralLedger(
                dateRange?.from,
                dateRange?.to,
            );
            if (!result || !('success' in result) || !result.success) {
                console.error(
                    'Failed to export general ledger:',
                    result && 'error' in result
                        ? result.error
                        : 'Unknown error',
                );
                return;
            }

            const data = result.data as unknown as GeneralLedgerData;
            if (!data || data.accounts.length === 0) return;

            const headers = [
                'Kode Akun',
                'Nama Akun',
                'Tanggal',
                'No. Jurnal',
                'Keterangan',
                'Referensi',
                'Debit',
                'Kredit',
                'Saldo',
            ];
            const rows: (string | number)[][] = [];

            for (const account of data.accounts) {
                rows.push([
                    `(${account.code}) ${account.name}`,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                ]);

                for (const entry of account.entries) {
                    rows.push([
                        '',
                        '',
                        format(new Date(entry.date), 'dd/MM/yyyy'),
                        entry.entryNumber,
                        entry.description,
                        entry.reference || '',
                        rupiahForCsv(entry.debit),
                        rupiahForCsv(entry.credit),
                        rupiahForCsv(entry.balance),
                    ]);
                }

                rows.push([
                    '',
                    `${reportLabels.saldoAkhir}`,
                    '',
                    '',
                    '',
                    '',
                    rupiahForCsv(account.totalDebit),
                    rupiahForCsv(account.totalCredit),
                    rupiahForCsv(account.endingBalance),
                ]);

                rows.push(['', '', '', '', '', '', '', '', '']);
            }

            const fromStr = dateRange?.from
                ? format(dateRange.from, 'yyyy-MM-dd')
                : '';
            const toStr = dateRange?.to
                ? format(dateRange.to, 'yyyy-MM-dd')
                : '';
            downloadCsv(
                reportFilename('Buku_Besar', `${fromStr}_${toStr}`),
                headers,
                rows,
            );
        } catch (error) {
            console.error('Failed to export general ledger', error);
        } finally {
            setExporting(false);
        }
    };

    const fmt = (amount: number) => {
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    // Account-level search only — transaction text lives server-side now.
    const lowerSearch = searchTerm.trim().toLowerCase();
    const filteredAccounts = (summary?.accounts ?? []).filter(
        (account) =>
            !lowerSearch ||
            account.code.toLowerCase().includes(lowerSearch) ||
            account.name.toLowerCase().includes(lowerSearch),
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {reportLabels.generalLedger}
                    </h1>
                    <p className="text-muted-foreground">
                        {reportLabels.generalLedgerDesc}
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Cari kode atau nama akun..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-[280px]"
                        />
                    </div>
                    <DatePickerWithRange
                        date={dateRange}
                        onDateChange={handleDateRangeChange}
                    />
                    <Button variant="outline" size="icon" onClick={fetchSummary}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDownload}
                        disabled={
                            !summary ||
                            summary.accounts.length === 0 ||
                            exporting
                        }
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <Card>
                    <CardContent className="h-24 flex items-center justify-center text-muted-foreground">
                        Memuat data...
                    </CardContent>
                </Card>
            ) : !summary || summary.accounts.length === 0 ? (
                <Card>
                    <CardContent className="h-24 flex items-center justify-center text-muted-foreground">
                        Tidak ada data untuk periode ini
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>{reportLabels.generalLedger}</span>
                            <span className="text-sm font-normal text-muted-foreground">
                                {reportLabels.klikAkunUntukDetail} ·{' '}
                                {reportLabels.dalamIDR}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[320px]">
                                            {reportLabels.namaAkun}
                                        </TableHead>
                                        <TableHead className="text-right w-[110px]">
                                            {reportLabels.jumlahTransaksi}
                                        </TableHead>
                                        <TableHead className="text-right w-[140px]">
                                            {reportLabels.saldoAwal}
                                        </TableHead>
                                        <TableHead className="text-right w-[130px]">
                                            {reportLabels.debit}
                                        </TableHead>
                                        <TableHead className="text-right w-[130px]">
                                            {reportLabels.kredit}
                                        </TableHead>
                                        <TableHead className="text-right w-[140px]">
                                            {reportLabels.saldoAkhir}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAccounts.map((account) => (
                                        <AccountRow
                                            key={account.id}
                                            account={account}
                                            fmt={fmt}
                                            expanded={expandedId === account.id}
                                            detail={details[account.id]}
                                            detailLoading={
                                                detailLoadingId === account.id
                                            }
                                            detailError={detailErrors[account.id]}
                                            onToggle={toggleAccount}
                                            onRetry={retryAccount}
                                        />
                                    ))}
                                    <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2">
                                        <TableCell colSpan={3}>TOTAL</TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRupiah(
                                                summary.grandTotalDebit,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            {formatRupiah(
                                                summary.grandTotalCredit,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            -
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function AccountRow({
    account,
    fmt,
    expanded,
    detail,
    detailLoading,
    detailError,
    onToggle,
    onRetry,
}: {
    account: SummaryAccount;
    fmt: (n: number) => string;
    expanded: boolean;
    detail?: AccountDetail;
    detailLoading: boolean;
    detailError?: string;
    onToggle: (accountId: string) => void;
    onRetry: (accountId: string) => void;
}) {
    return (
        <>
            <TableRow
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onToggle(account.id)}
            >
                <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        {expanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-blue-700 dark:text-blue-400">
                            ({account.code}) {account.name}
                        </span>
                    </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                    {account.entryCount}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.beginningBalance)}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.totalDebit)}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.totalCredit)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium whitespace-nowrap">
                    {fmt(account.endingBalance)}
                </TableCell>
            </TableRow>

            {expanded && detailLoading && (
                <TableRow>
                    <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-6"
                    >
                        {reportLabels.memuatTransaksi}
                    </TableCell>
                </TableRow>
            )}

            {expanded && !detailLoading && detailError && (
                <TableRow>
                    <TableCell colSpan={6} className="bg-destructive/5 py-5">
                        <div className="flex items-center justify-center gap-3 text-sm text-destructive">
                            <span>{detailError}</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onRetry(account.id)}
                            >
                                Coba lagi
                            </Button>
                        </div>
                    </TableCell>
                </TableRow>
            )}

            {expanded && !detailLoading && !detailError && detail && (
                <TableRow>
                    <TableCell colSpan={6} className="bg-muted/20 p-0">
                        <div className="p-3">
                            {detail.entries.length === 0 ? (
                                <div className="text-center text-muted-foreground py-4 text-sm">
                                    {reportLabels.tidakAdaTransaksiAkun}
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[100px]">
                                                {reportLabels.tanggal}
                                            </TableHead>
                                            <TableHead className="w-[130px]">
                                                {reportLabels.nomor}
                                            </TableHead>
                                            <TableHead>
                                                {reportLabels.keterangan}
                                            </TableHead>
                                            <TableHead className="text-right w-[130px]">
                                                {reportLabels.debit}
                                            </TableHead>
                                            <TableHead className="text-right w-[130px]">
                                                {reportLabels.kredit}
                                            </TableHead>
                                            <TableHead className="text-right w-[140px]">
                                                {reportLabels.saldo}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {detail.entries.map((entry, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="whitespace-nowrap">
                                                    {format(
                                                        new Date(entry.date),
                                                        'dd/MM/yyyy',
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono text-sm whitespace-nowrap">
                                                    {entry.entryNumber}
                                                </TableCell>
                                                <TableCell className="max-w-[280px]">
                                                    <div
                                                        className="flex items-center gap-1"
                                                        title={`${entry.description}${entry.reference ? ` (${entry.reference})` : ''}`}
                                                    >
                                                        <span className="truncate">
                                                            {entry.description}
                                                        </span>
                                                        {entry.reference && (
                                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                                (
                                                                {
                                                                    entry.reference
                                                                }
                                                                )
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono whitespace-nowrap">
                                                    {entry.debit > 0
                                                        ? fmt(entry.debit)
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono whitespace-nowrap">
                                                    {entry.credit > 0
                                                        ? fmt(entry.credit)
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-medium whitespace-nowrap">
                                                    {fmt(entry.balance)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

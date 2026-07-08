'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGeneralLedger } from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { RotateCw, Download, Search } from 'lucide-react';
import { downloadCsv, rupiahForCsv, reportFilename } from '@/lib/utils/csv-export';
import { reportLabels } from '@/lib/labels';

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

export function GeneralLedgerClient() {
    const [data, setData] = useState<GeneralLedgerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), 0, 1),
        to: new Date()
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getGeneralLedger(dateRange?.from, dateRange?.to);
            if (result && 'success' in result && result.success) {
                setData(result.data as unknown as GeneralLedgerData);
            } else {
                console.error('Failed to load general ledger:', result && 'error' in result ? result.error : 'Unknown error');
                setData(null);
            }
        } catch (error) {
            console.error('Failed to load general ledger', error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDownload = () => {
        if (!data || data.accounts.length === 0) return;

        const headers = ['Kode Akun', 'Nama Akun', 'Tanggal', 'No. Jurnal', 'Keterangan', 'Referensi', 'Debit', 'Kredit', 'Saldo'];
        const rows: (string | number)[][] = [];

        for (const account of data.accounts) {
            rows.push([`(${account.code}) ${account.name}`, '', '', '', '', '', '', '', '']);

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
                    rupiahForCsv(entry.balance)
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
                rupiahForCsv(account.endingBalance)
            ]);

            rows.push(['', '', '', '', '', '', '', '', '']);
        }

        const fromStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
        const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
        downloadCsv(reportFilename('Buku_Besar', `${fromStr}_${toStr}`), headers, rows);
    };

    const fmt = (amount: number) => {
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    // Filter accounts and entries by search term
    const filteredAccounts = data?.accounts
        .map((account) => {
            if (!searchTerm.trim()) return account;

            const lowerSearch = searchTerm.toLowerCase();
            const accountMatch =
                account.code.toLowerCase().includes(lowerSearch) ||
                account.name.toLowerCase().includes(lowerSearch);

            if (accountMatch) return account; // Show whole account if name/code matches

            // Filter entries within account
            const filteredEntries = account.entries.filter(
                (entry) =>
                    entry.description.toLowerCase().includes(lowerSearch) ||
                    entry.entryNumber.toLowerCase().includes(lowerSearch) ||
                    (entry.reference && entry.reference.toLowerCase().includes(lowerSearch))
            );

            if (filteredEntries.length === 0) return null; // No matching entries

            // Recalculate totals for filtered entries
            const totalDebit = filteredEntries.reduce((sum, e) => sum + e.debit, 0);
            const totalCredit = filteredEntries.reduce((sum, e) => sum + e.credit, 0);

            return {
                ...account,
                entries: filteredEntries,
                totalDebit,
                totalCredit,
                endingBalance: filteredEntries[filteredEntries.length - 1]?.balance ?? account.endingBalance,
            };
        })
        .filter(Boolean) as LedgerAccount[] | undefined;

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{reportLabels.generalLedger}</h1>
                    <p className="text-muted-foreground">
                        {reportLabels.generalLedgerDesc}
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Cari akun, keterangan, atau no jurnal..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-[280px]"
                        />
                    </div>
                    <DatePickerWithRange
                        date={dateRange}
                        onDateChange={setDateRange}
                    />
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDownload} disabled={!data || data.accounts.length === 0}>
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
            ) : !data || data.accounts.length === 0 ? (
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
                            <span className="text-sm font-normal text-muted-foreground">{reportLabels.dalamIDR}</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">{reportLabels.namaAkun}</TableHead>
                                        <TableHead className="w-[90px]">{reportLabels.tanggal}</TableHead>
                                        <TableHead className="w-[120px]">{reportLabels.nomor}</TableHead>
                                        <TableHead className="w-[200px]">{reportLabels.keterangan}</TableHead>
                                        <TableHead className="text-right w-[130px]">{reportLabels.debit}</TableHead>
                                        <TableHead className="text-right w-[130px]">{reportLabels.kredit}</TableHead>
                                        <TableHead className="text-right w-[140px]">{reportLabels.saldo}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(filteredAccounts ?? []).map((account) => (
                                        <AccountSection key={account.id} account={account} fmt={fmt} />
                                    ))}
                                    {/* Grand total row */}
                                    <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2">
                                        <TableCell colSpan={4}>TOTAL</TableCell>
                                        <TableCell className="text-right font-mono">{formatRupiah(data.grandTotalDebit)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatRupiah(data.grandTotalCredit)}</TableCell>
                                        <TableCell className="text-right">-</TableCell>
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

function AccountSection({ account, fmt }: { account: LedgerAccount; fmt: (n: number) => string }) {
    return (
        <>
            {/* Account header row */}
            <TableRow className="bg-blue-50/50 dark:bg-blue-900/10">
                <TableCell colSpan={7} className="font-semibold text-blue-700 dark:text-blue-400">
                    ({account.code}) {account.name}
                </TableCell>
            </TableRow>

            {/* Transaction rows */}
            {account.entries.map((entry, idx) => (
                <TableRow key={idx}>
                    <TableCell className="text-muted-foreground text-sm pl-6">-</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(entry.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">{entry.entryNumber}</TableCell>
                    <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-1" title={`${entry.description}${entry.reference ? ` (${entry.reference})` : ''}`}>
                            <span className="truncate">{entry.description}</span>
                            {entry.reference && (
                                <span className="shrink-0 text-xs text-muted-foreground">({entry.reference})</span>
                            )}
                        </div>
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                        {entry.debit > 0 ? fmt(entry.debit) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                        {entry.credit > 0 ? fmt(entry.credit) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium whitespace-nowrap">
                        {fmt(entry.balance)}
                    </TableCell>
                </TableRow>
            ))}

            {/* Closing balance row */}
            <TableRow className="bg-muted/30 font-semibold border-b-2">
                <TableCell colSpan={4} className="text-sm">
                    ({account.code}) {account.name} | {reportLabels.saldoAkhir}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.totalDebit)}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.totalCredit)}
                </TableCell>
                <TableCell className="text-right font-mono whitespace-nowrap">
                    {fmt(account.endingBalance)}
                </TableCell>
            </TableRow>
        </>
    );
}

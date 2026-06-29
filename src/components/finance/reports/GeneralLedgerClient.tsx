'use client';

import { useState, useEffect, useCallback } from 'react';
import { getGeneralLedger } from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { RotateCw, Download } from 'lucide-react';
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
            // Account header row
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

            // Closing row
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

            // Empty separator
            rows.push(['', '', '', '', '', '', '', '', '']);
        }

        const fromStr = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
        const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
        downloadCsv(reportFilename('Buku_Besar', `${fromStr}_${toStr}`), headers, rows);
    };

    const formatBalance = (amount: number) => {
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

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
                                        <TableHead className="min-w-[160px]">{reportLabels.namaAkun}</TableHead>
                                        <TableHead className="min-w-[100px]">{reportLabels.tanggal}</TableHead>
                                        <TableHead>{reportLabels.nomor}</TableHead>
                                        <TableHead className="min-w-[200px]">{reportLabels.keterangan}</TableHead>
                                        <TableHead className="text-right min-w-[130px]">{reportLabels.debit}</TableHead>
                                        <TableHead className="text-right min-w-[130px]">{reportLabels.kredit}</TableHead>
                                        <TableHead className="text-right min-w-[130px]">{reportLabels.saldo}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.accounts.map((account) => (
                                        <AccountSection key={account.id} account={account} formatBalance={formatBalance} />
                                    ))}
                                    {/* Grand total row */}
                                    <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2">
                                        <TableCell colSpan={4}>TOTAL</TableCell>
                                        <TableCell className="text-right">{formatRupiah(data.grandTotalDebit)}</TableCell>
                                        <TableCell className="text-right">{formatRupiah(data.grandTotalCredit)}</TableCell>
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

function AccountSection({ account, formatBalance }: { account: LedgerAccount; formatBalance: (n: number) => string }) {
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
                    <TableCell className="text-muted-foreground text-sm">-</TableCell>
                    <TableCell>{format(new Date(entry.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm">{entry.entryNumber}</TableCell>
                    <TableCell>
                        {entry.description}
                        {entry.reference && (
                            <span className="ml-2 text-xs text-muted-foreground">({entry.reference})</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {entry.debit > 0 ? formatBalance(entry.debit) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {entry.credit > 0 ? formatBalance(entry.credit) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                        {formatBalance(entry.balance)}
                    </TableCell>
                </TableRow>
            ))}

            {/* Closing balance row */}
            <TableRow className="bg-muted/30 font-semibold border-b-2">
                <TableCell colSpan={4} className="text-sm">
                    ({account.code}) {account.name} | {reportLabels.saldoAkhir}
                </TableCell>
                <TableCell className="text-right font-mono">
                    {formatBalance(account.totalDebit)}
                </TableCell>
                <TableCell className="text-right font-mono">
                    {formatBalance(account.totalCredit)}
                </TableCell>
                <TableCell className="text-right font-mono">
                    {formatBalance(account.endingBalance)}
                </TableCell>
            </TableRow>
        </>
    );
}
